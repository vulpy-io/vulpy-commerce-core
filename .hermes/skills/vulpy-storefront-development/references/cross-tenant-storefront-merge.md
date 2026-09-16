# Cross-Tenant Storefront Merge / Upgrade Audit

Class of task: operator asks to port a tenant's storefront (or a demo repo) into `main`
("upgrade current storefront to the version HF has", "move padelbaza's fixes into the template").
The single most important move is to classify the divergence BEFORE writing anything — tenant forks
are rarely one-directional, and naively replacing `apps/storefront/` with the newer-looking tenant
regresses newer infra that only lives in `main`.

## Topology reality (verify each time)

- `main` (this workspace = `vulpy-io/vulpy-commerce-pro-private`) is the product source of truth and
  usually holds the **newest buying-path infra** (checkout state machine, `lib/stripe.ts` singleton,
  payment-return poller, saved-items rehydration, global/segment error boundaries, legacy-brand).
- **Demo tenants** (e.g. Hector Finch on the EU box, `shop-hectorfinch/vulpy-commerce`) are often a
  bootstrapped snapshot + a pile of **local commits never pushed anywhere** — the box's checkout may
  have **no git remotes** and zero shared history with `main`. So "port" is really a merge.
- Tenant boxes are separate: read their checkout via ssh (`sudo -iu <tenant> git ...` when git flags
  `/home/shop-<app>` as dubious ownership — the checkout is tenant-user-owned; `git` commands must run
  as that user, plain `/home/...` greps can run via sudo read-only).
- **padelbaza = `bsgdigital/padelbaza`** (private, operator-owned). `gh repo search padelbaza` / `gh repo
  list bsgdigital` resolves it. Clone with `git clone https://github.com/bsgdigital/padelbaza.git`.

## The core diagnosis: two-way divergence, not newer-wins

Pull both `apps/storefront/src` trees to local staging (tar via ssh for remote tenants, or git clone),
then hash-diff:

```python
def walk(root):
    out={}
    for base,_,files in os.walk(root):
        for f in files:
            if any(x in base for x in ["node_modules","/.next","/.turbo"]): continue
            fp=os.path.join(base,f); rel=os.path.relpath(fp,root)
            out[rel]=open(fp,'rb').read()
    return out
# sets: only_local, only_tenant, changed = common files where bytes differ
```

Classify each differing file into: **take-tenant** / **keep-main** / **merge-both**. The vital guard:
`only in main` often contains the payment/security/auth infra the tenant lacks — treat those as
**must-preserve**, and assume the "upgrade" is a two-way merge with `main` as the base. Number the
deltas this way so scope is honest (this session: main vs HF was 140 changed / 15 HF-only / 32
main-only; main vs padelbaza was 216 changed / 30 pb-only / 59 main-only).

## Scoping questions that prevent false work

1. **Is the thing the operator calls "the new behaviour" actually the tenant's code, or a label?**
   E.g. Hector Finch's quote persona: the *UX labels* ("Add to quotation", "Quotation" bag, "Submit
   quote request") existed, but `grep quotation|draft` on the HF backend returned **nothing** — the
   submit button ran the standard `placeOrderAction`. **UI-label re-label ≠ a real backend flow.**
   Check both sides before planning the "complete the feature" piece.
2. **Is it actually configurable anywhere, or hard-wired?** HF had no separate "quote mode" flag —
   the persona derived purely from `useCanSeePrices()` (= the existing single `REQUIRE_LOGIN_FOR_PRICES`
   gate). So "make both modes env-configurable" was net-new. Verify the actual config plumbing before
   writing env names into a plan.
3. **Does the "fix" the operator names actually exist in the reference repo?** padelbaza's named fixes
   (oos variant still clickable for images, top padding for header) were NOT both-real: the variant
   option buttons already `onClick` on `aria-disabled`, and `variantToDisplayProduct` already remaps
   the gallery to `variant.thumbnail`. The real gap was the main image not updating on an OOS/alt
   variant + default-variant selection. And the header "fix" was **not** solved there either — padelbaza
   still hand-places `pt-[62px]/72px/165px`. Don't promise a fix because a tenant's commit *claims* one;
   verify against code. This is also how you correctly spot **net-new** work (the navbar refactor to a
   height-adaptive header was genuinely new).

## Fixed-header gotcha (recurring across all forks)

The header is `fixed top-0`, so every page hand-places offsets to clear it (Hero `pt-[72px]/30/51.5`,
Breadcrumb `62/95/165`, PDP `pt-2.5/5/7.5`, Shop sidebar `top-[72px]`). This is the fragile
"navbar height change breaks the page" coupling the operator rightly hates. The durable fix to
propose: single `--header-height` CSS var driven by the header's own content (ResizeObserver), a
global page offset (`SiteLayout`/`main`) so no page needs its own padding, and `scroll-margin-top`
for anchors. Note this cleanly in scope — don't inherit the tenant's hardcoded `pt-[]`.

## PDP is ALREADY server-rendered (SEO question anchor)

When an operator asks "should we make the PDP server-rendered for SEO / do we need a
client-vs-SSR switch" — check the facts first (verified 2026-08-25):

- `app/(site)/(pages)/products/[handle]/page.tsx` is an **async server component**. It
  server-renders `generateMetadata` (title/desc/social/canonical), `buildProductJsonLd`
  (Product schema + AggregateOffer), breadcrumb JSON-LD, and the initial HTML.
- The `ProductDetails` client component only handles the **interactive** variant
  selection + gallery after hydration.
- A `?variant=` search param already preselects a variant (`initialVariantId`).

So the SEO question is NOT "client vs server" — it's **"do we want per-variant URLs, and
how deep?"** The recommended middle ground (option B): per-variant URLs
(`/products/[handle]/[variant]`) with variant-level metadata/JSON-LD rendered
server-side only, keeping the interactive shell client-side — indexable variants
without full-SSR cost on small servers. Full SSR per variant (option C) is the heavy
option to discourage unless a shop explicitly needs it. An `ENABLE_VARIANT_URLS` env
switch is optional surface, not required for B.

**Decision context (2026-08-25):** the operator wants rendering questions split from
variant-URL questions. The variant-URL feature becomes an `ENABLE_VARIANT_URLS` switch
(default **off**) — a candidate for the Pro/extension pack, small stores are fine
without it. Do not bundle it with PLP pagination.

## PLP/pagination SEO — the REAL client-render gap (verified 2026-08-25)

When an SEO agency complains "PLP and pagination are js-rendered on client", verify the
actual pagination model before promising a fix:

- `app/(site)/(pages)/shop/page.tsx` **IS** a server component and **page 1 IS
  server-rendered HTML** (products + facets + JSON-LD + `enforceCatalogPagination`
  canonical/redirect for `?page=1`).
- The gap is the **pagination model**: `ShopWithSidebar` uses
  `useShopCatalogInfiniteScroll` — `visibleProducts` lives in client state, page 2+ are
  fetched client-side via IntersectionObserver → `loadShopCatalogPageAction` server
  action. **Crawlers never see pages 2,3,…** — exactly the agency complaint.

Fix options, in order of preference:
- **A. Server-side pagination:** `?page=N` is a real server-rendered page (the
  machinery already exists: `getShopCatalogPage(params)` + `catalog-routing`); replace
  the infinite-scroll hook with numbered prev/next navigation. Every page has server
  HTML + canonical + CollectionPage JSON-LD. Same catalog fetch per page — does not
  kill small servers.
- **B. Hybrid (operator chose this 2026-08-25):** keep infinite-scroll UX for users,
  ALSO make `?page=N` a server-rendered route for crawlers/deep links.
- **C. Keep client infinite-scroll, improve meta/JSON-LD only** — does NOT fix the
  agency's core complaint (content still not in HTML).

### CatalogPagination sync defect (apply to padelbaza too)
`CatalogPagination.tsx` already renders numbered pages (1,2,3… + windowing +
`aria-current`), but it highlights/hyperlinks off `currentPage` (the URL `?page=`)
while the infinite-scroll hook keeps its own internal `loadedPage`. So a user who
scroll-loads to page 3 still sees "1" as active — the numbered bar lies about the
loaded state. Fix: when infinite-scroll appends a page, update the pagination bar's
active state to `loadedPage` + a "Loaded N of M" indicator; clicking a numbered page
still does a real navigation (server render + deep link). **The identical defect exists
in any tenant fork that shares this code (e.g. padelbaza) — fix both.**

## Skills-port assessment (tenant skill tree vs main) — method + reusable findings

When the operator asks "read the HF skills through the diff vs current and see what's
genuinely useful in template", do a byte-level + content diff of the tenant `.hermes/skills`
against main's, then classify port / keep-main / skip. Method:

1. Pull tenant skills (tar via ssh) and diff `SKILL.md` byte counts + unified diff per
   skill. **Size direction is a strong signal:** if main's skill is LARGER, main is
   usually ahead (e.g. `vulpy-impeccable-designer` main 26.6KB vs HF 22KB; `vulpy-commerce-operator`
   main 86.9KB vs HF 56.4KB → skip both). If HF is larger, diff to see what grew.
2. **HF-only skills are the port candidates** (e.g. `vulpy-design-mockups`, absent in
   main — HTML mockup authoring + headless verification workflow; generalize by
   stripping tenant-brand cheat sheets to "read store tokens").
3. **HF-only `references/` files** (18 in this session) split into three buckets:
   - **Reusable recipes** (port, generalize): `adding-a-cms-block.md`,
     `adding-a-cms-section.md`, `medusa-sdk-query-serialization.md` (the
     `qs.stringify({ skipNulls: true })` trap — null params silently dropped → duplicate
     category roots), `header-layout-pitfalls.md` (fixed-header height math — feeds the
     navbar refactor), `persona-gating-and-quote-flow.md` (feeds quote mode),
     `product-card-price-alignment.md`, `product-card-hover-crossfade.md`,
     `site-wide-radius-and-image-ratios.md`, `plp-standard-listing-polish.md`.
   - **Tenant-specific design work** (port the METHOD not the design):
     `homepage-redesign-components.md`, `pdp-mockup-alignment.md`,
     `category-card-editorial-design.md`, `plp-editorial-page-head.md`,
     `editorial-register-plp.md`, `header-nav-pagination-alignment.md`,
     `product-card-actions-and-pdp-polish.md`, `finish-swatches-option-metadata.md`
     (register page + finish swatches are Pro features — the data-surface knowledge ports).
   - **Already in main** (skip): design-system audit, payload-theme, phase1 tokens,
     store-designer, tailwind-v4, v0-audit.
4. Skill-body diffs where HF is ahead and generic (e.g. `vulpy-design-system-adoption`
   registry-guard scope clarification, rebrand doc-drift pitfall, curl+bracket query
   pitfall) — port the diff, not the whole file.

## Price-gate persona modes — the concrete env design (confirmed 2026-08-25)

`PRICE_GATE_MODE = off | login | quote` (default `off`). `login` = previous behaviour
(hide prices from guests, "Login to see price" link); `quote` = HF quotation persona
(Add to quotation / quotation bag / Request a Quote) and — net-new, HF never built it —
a `POST /store/quotation` server action creating a **draft order** tagged `quotation`,
consuming the cart, env-gated so it cannot fire in `login`/`off`. Backward compat: unset +
`REQUIRE_LOGIN_FOR_PRICES=true` → treat as `login`.

**Draft-order mechanism (verified on @medusajs 2.13, 2026-08-25):** there is NO
`createDraftOrdersWorkflow` export in `@medusajs/medusa`/`@medusajs/core-flows` dist —
grep for it returns nothing. The working path (implemented + unit-tested this session):
a custom workflow (`apps/medusa-backend/src/workflows/create-quotation-draft-order.ts`)
queries the cart, maps it to a `CreateOrderDTO` with `is_draft_order: true,
status: OrderStatus.DRAFT, metadata: { quotation: true, kind: "quote" }`, runs
`createOrderWorkflow` (which derives line-item prices from variants), then stamps
`cart.completed_at` to consume the bag. Exposed as a **store-scoped** route
`POST /store/quote/orders` (server-to-server from the storefront action, matching the
`medusa.client.fetch` pattern; draft orders are admin-scoped so the storefront cannot
call `/admin/draft-orders` directly), guarded to 404 unless `PRICE_GATE_MODE=quote`,
with `order.email` sourced from `cart.email` for the team to respond. Do NOT invent a
`createDraftOrdersWorkflow` name — verify against the installed dist and use
`createOrderWorkflow` with draft flags. Plumb end-to-end exactly like `REQUIRE_LOGIN_FOR_PRICES` (root
`.env`, `apps/storefront/.env`, `next.config` env, `turbo.json`, Dockerfile ARG,
`generate-deploy-env.sh`, `deploy/.env.prod.example`, backend `price-guard-config`
which gates both `login`+`quote`). Product-rebrand note: replaces "Medusa" with
"Vulpy Commerce" in the admin — `src/admin/i18n/index.ts` (default export i18n
resources per gotcha §10), widget copy, `src/admin/lib/labels/`, READMEs.

## Plan posture

- Do the merge in an **isolated worktree** off `origin/main`; leave the operator's dirty working tree
  alone. Keep a signed inventory (`/tmp/*_diff_meta.json`).
- Decisions to explicitly confirm: default price gate mode, env var name, which tenant features to
  exclude (e.g. padelbaza's Nova-Poshta / Ukrainian localization / sitemap-sharding are shop-specific
  infra, usually not product defaults), and whether to bring a tenant's brand tokens vs. keep the
  product's own typography/colours/logo ("HF look, but Vulpy brand" = port structure, not brand).
- No commit/push without explicit operator go (SOUL.md hard rule).
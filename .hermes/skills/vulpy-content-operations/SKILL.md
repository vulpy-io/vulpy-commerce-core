---
name: vulpy-content-operations
description: Use for homepage, landing page, navigation, footer, blog, SEO, product editorial content, category editorial content, and media changes in Vulpy Commerce.
---

# Vulpy Content Operations

Use Payload for editorial content and Medusa for commerce records.

## Payload-owned content

- Pages and block content.
- Homepage content.
- Navigation and footer.
- Posts.
- Site settings.
- Media.
- Product editorial extensions in `productContent`.
- Category and selection-page editorial extensions in `categoryContent`.

## Medusa-owned content

- Product and variant identity.
- Product title, handle, SKU, price, stock, options, and commerce categories.
- **Category image** — `metadata.image_url` on each Medusa category (see **Category images** below; NOT a Payload field).
- Customer, order, payment, fulfillment, and promotion data.

Do not overwrite Medusa-synchronised identity fields from Payload.

## Category images

Category thumbnails (homepage cards, subcategory thumbs on category pages) are **Medusa-owned**: each Medusa category's `metadata.image_url`, read by `mapStoreCategoryToDisplay` / `getCategoryImageUrl` in `apps/storefront/src/lib/medusa/category-display.ts` (`CATEGORY_IMAGE_METADATA_KEY = "image_url"`). The Payload `categoryContent` collection has **no** image field — do not look there for category visuals.

To set a category's image to its first product (latest listing order):
- Recipe + pitfalls: `references/category-images.md`
- Re-runnable script: `scripts/set-category-images-to-first-product.py`

## Media uploads to Payload from Fox

Upload media via the Payload REST API (no admin UI needed): log in at `/api/users/login` with the seed user from `apps/storefront/.env` (`PAYLOAD_SEED_EMAIL` / `PAYLOAD_SEED_PASSWORD` — read without echoing), then multipart `POST /api/media`. The Media collection accepts `image/*` (SVG included). Verify with GET on the returned `url` — note HEAD returns 404 on `/api/media/file/<name>` (Next.js file-route quirk); GET is ground truth. Full recipe + the grab-logo-from-a-marketing-site technique (inline SVG + CSS-var resolution): `references/payload-media-upload.md`.

**Site logos live in the `site-settings` global — TWO upload fields, both `relationTo: "media"`:** `logo` (header, footer, SEO/JSON-LD) and `checkoutLogo` (checkout header). `CheckoutLayout` resolves `checkoutLogoUrl || logoUrl || /images/logo/logo.svg` — to rebrand everywhere, update both: `POST /api/globals/site-settings` `{"logo": <mediaId>, "checkoutLogo": <mediaId>}` (global update merges; unspecified fields are kept). Verify by re-fetching the global (`logo.id` / `checkoutLogo.id`) and grepping rendered HTML for `/api/media/file/<name>`.

**Pitfall — client-gated chrome:** the site Footer renders inside `SiteLayoutClient` behind a PreLoader loading state, so initial HTML contains footer *data* (flight payload) but no `<footer>` DOM tag. When verifying a change that lives in such chrome (footer classes, client-rendered sections), check the served CSS chunk (`curl http://host.docker.internal:3000/_next/static/chunks/*.css` → grep the `.bg-<class>` utility and `--<var>: <value>` chain) instead of expecting the tag in server HTML.

**Verifying streamed Next.js pages with curl — an empty heading-grep does NOT mean "no SSR" (2026-08-26):** naive `<h1>`/tag-regex probes return almost nothing even for fully server-rendered pages, because content arrives as a streaming RSC flight payload (`self.__next_f.push` chunks) after a near-empty shell. Grep distinctive content MARKERS instead of tags:
```bash
H=$(curl -s --max-time 30 "<url>")
echo "$H" | grep -c "self.__next_f"          # >0 → streamed SSR payload present
echo "$H" | grep -c "ExpectedContentMarker"
```
Match markers case-sensitively exactly as rendered (`New Arrivals`, not `new arrivals`) — don't conclude a section is absent from a 0 count derived from the wrong case. First `browser_navigate` often returns `(empty page)`; re-run `browser_snapshot`, scroll, or prefer `browser_console` JS (`document.body.innerText`, link dump) — it reads the hydrated DOM directly and is the most reliable page reader.

## Direct Payload DB reads (SQL)

When the API is unreachable or you need bulk truth, read Payload data straight from Postgres:

- **Live docs live in the NON-versioned tables.** `pages_blocks_*`, `footer_columns`, `site_settings`, etc. hold the current doc. The `_pages_v_*` tables are VERSION history and can show STALE/stock content long after the live doc was customized (verified 2026-08-11: home page blocks looked stock in `_pages_v_blocks_*` while `pages_blocks_*` had the full redesign). Trust `pages_blocks_*`; use `_pages_v_*` only when auditing version history.
- **Block order:** block rows carry `_order` (and `_path`); the parent page's `content` JSONB column is often NULL (Payload keeps block payloads in the join tables). Order by `_order` with `_parent_id = (SELECT id FROM pages WHERE slug='home')`.
- **Reserved words:** quote `"limit"` in SELECTs — unquoted `limit` is a syntax error.
- **Enum columns** like `variant`, `theme`, `media_position` reject `COALESCE(x,'')` casts — use `x::text` or drop the COALESCE.
- **On tenant demo boxes:** psql is often absent for the tenant user and the tenant Postgres binds 127.0.0.1 (unreachable from the base Hermes container). Use `sudo docker exec -e PGPASSWORD=medusa <compose-project>-postgres-1 psql -U medusa -d payload` (container names reveal the compose project — see vulpy-environment-operations → tenant access).

## Payload REST write rules (worked example: hectorfinch homepage rebuild 2026-08-11)

- **Globals update via `POST /api/globals/<slug>`** (PATCH → 404); pages update via `PATCH /api/pages/<id>`.
- **PATCH the page with the FULL `blocks` array** — it replaces (stale blocks vanish in the same call). Include the existing block `id`s to update in place; numeric media ids for upload/relationship fields.
- **richText `content` must be Lexical `root` JSON.** Posting the legacy editor array `[{"type":"paragraph","children":[{"text":"…"}]}]` validates fine but renders ZERO output — the block title shows and the body is silently missing (the classic "copy missing" symptom). Use the `{"root":{"type":"root",…,"children":[{"type":"paragraph",…,"children":[{"type":"text",…,"text":"…"}]}]}}` shape.
- **Tenant login source:** use the TARGET box's own `apps/storefront/.env` `PAYLOAD_SEED_EMAIL`/`PAYLOAD_SEED_PASSWORD` (admin email is `admin@<tenant-domain>`); `/data/config/<tenant>.env` `VULPY_ADMIN_*` can 401 on Payload even when correct for the Medusa admin.
- Re-runnable recipe (login → media ids → PATCH page → POST globals → placeholder pages → verify): `references/payload-rest-homepage-rebuild.md`.

## Payload admin preview — iframe (livePreview) vs new-tab (preview)

Collections can configure BOTH `admin.preview` and `admin.livePreview` — they behave differently:

- `admin.preview` — header **Preview** button; opens the returned URL in a **new tab** (the "proper url" behavior).
- `admin.livePreview` — **Live Preview** split-pane; renders the returned URL inside an **iframe** in the edit view.

Pitfall (fixed 2026-08-12 on `pages`/`Content.ts`, `productContent`/`ProductContent.ts`, `categoryContent`/`CategoryContent.ts`): when an operator reports "preview tries to iframe instead of opening the proper url", the culprit is `admin.livePreview` — it embeds the `/api/preview?collection=…&slug=…&path=…&secret=…` draft-mode URL in a pane. Fix: delete the `livePreview` block from the collection config, keep `admin.preview`. The new-tab flow is: Preview → `/api/preview` → `draftMode().enable()` → redirect to the real path. Verify the route without a browser (expect 307 to the public path; read the secret from `apps/storefront/.env`, don't echo it):

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
  "http://host.docker.internal:3000/api/preview?collection=pages&slug=home&path=%2F&secret=<PREVIEW_SECRET>"
```

The storefront live-preview client machinery (`LivePreviewBlocksRenderer` via `useLivePreview`, `PreviewableBlocksRenderer`'s draft-mode branch, `RefreshRouteOnSave`, `livePreviewData` plumbing) is only meaningful with the admin iframe present. Without `admin.livePreview` it degrades to an inert pass-through (renders `initialData`), so removing the admin config is safe without touching those components — stripping them is optional cleanup, not part of the fix.

Payload admin re-reads collection config at server boot. From the Fox container you cannot restart the host dev server (agent-cmd server is host-only — see vulpy-environment-operations → `references/agent-cmd-server.md`); ask the operator for `pnpm vulpy dev restart`, then refresh `/admin`.
## Write-path rule (user-mandated)

**Never write to the PostgreSQL database directly for editorial content.** All content
changes (navigation, footer, site-settings, pages, media, globals) go through **Payload
only**: Payload REST API (login with `PAYLOAD_SEED_EMAIL` / `PAYLOAD_SEED_PASSWORD` from
`apps/storefront/.env`, then `POST /api/globals/<slug>` or `PATCH /api/pages/<id>`),
Payload MCP, or the admin UI. Direct SQL writes bypass Payload's access control,
`afterChange` revalidation hooks, and versioning. Read-only DB inspection is tolerated,
but prefer the public Payload API (`GET /api/globals/<slug>?depth=2`) — no auth needed,
returns the same shape, and doubles as the "before" snapshot for the update.

REST shape gotchas: globals update = **POST** (`PATCH /api/globals/<slug>` → 404); pages
update = **PATCH** with the FULL `blocks` array (replaces). Response shapes: collection
create/update returns `{"doc": {...}}`; global UPDATE returns `{"message", "result"}`
(parse `result`); global GET returns the doc top-level. Relation/upload ids in blocks
must be NUMBERS (string id → 400 `invalid relationships`). richText fields need Lexical
`root` JSON — the legacy `[{type:"paragraph",…}]` array validates fine but renders
NOTHING on the storefront (silent missing copy).

## Payload preview (admin Preview button + Live Preview iframe)

The Pages collection wires both `admin.preview` (new-tab button) and `livePreview`
(admin iframe panel) in `src/collections/Content.ts`. Both build their URL from
`NEXT_PUBLIC_SERVER_URL` (fallback `http://localhost:3000`) and `PREVIEW_SECRET`
(fallback empty) in **`apps/storefront/.env`** — a fresh install's admin shows a broken
localhost / `secret=change-me` URL and the live-preview iframe fails to load.

Fix recipe (worked 2026-08-12):

1. Set `NEXT_PUBLIC_SERVER_URL` to the public edge the admin is served from
   (`host.docker.internal` / localhost URLs only work from inside the host/container,
   not the operator's browser).
2. Rotate `PREVIEW_SECRET` to `openssl rand -hex 24`.
3. **Restart the dev stack** — NEXT_PUBLIC_* is inlined at server start and the
   `/api/preview` route reads PREVIEW_SECRET at boot.
4. Verify: `curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n'
   "<public-edge>/api/preview?collection=pages&slug=home&path=%2F&secret=<s>"`
   → `307 -> <public-edge>/`; wrong secret → `401`.

The route (`src/app/api/preview/route.ts`) redirects onto `NEXT_PUBLIC_SERVER_URL`, so
draft mode always lands on the canonical public origin. Don't remove `livePreview` to
"fix" the iframe — fix the env.

## Payload REST recipes (re-runnable)

- `references/payload-rest-homepage-rebuild.md` — full home-page rebuild via REST
  (hero slides incl. `eyebrow`, categoryGrid `categoryHandles`, Lexical
  `mediaWithText`, `cta` band, newsletter light variant, placeholder pages).
- `references/blog-posts-rest.md` — `posts` collection creates/updates/removals,
  drafts trap, Lexical articles, nav swap, escaped-quote verification.
- `references/payload-media-upload.md` — media uploads via `/api/media`, site-logo
  upload fields, servd CDN signed-URL extraction, replacing files on existing docs,
  client-gated chrome verification.
- `references/category-images.md` — Medusa-owned category thumbnails
  (`metadata.image_url`) + set-to-first-product recipe.

## Blog posts (`posts` collection) via Payload REST

Full re-runnable recipe (drafts `_status: published` trap, REST response shapes,
Lexical rich articles, placeholder removal, nav swap, escaped-quote verification,
external-brand image pulls): `references/blog-posts-rest.md`.

## Store rebrand (match an external brand)

Generic flow (works for any target brand; worked on a demo shop 2026-08-11):

1. **Extract the brand kit from the live site FIRST** (one parent-side research pass):
   pull its CSS and grep `font-family` stacks + top hex colors; extract the logo from an
   inline SVG `<symbol>` → standalone SVG; scrape category pages for real product names +
   image URLs (lazy-loaded `<img data-src=...>` + product-name tags).
2. **Design tokens are GENERATED from FOUR input files** — edit
   `apps/storefront/design/tokens/{reference,semantic,component}.tokens.json` +
   `design/themes/store.tokens.json` (DTCG `$type`/`$value`), NOT
   `.impeccable/design.json` (compiler OUTPUT — overwritten every run; read it to size
   changes only). Regenerate via `cd apps/storefront && node scripts/design/generate-design.mjs`
   (rewrites `tokens.generated.css`; `--check` verifies drift). The registry
   `design/editor.registry.mjs` validates ONLY `store.tokens.json` — unregistered
   semantic/component paths (content.primary, focus.ring, surface.muted/subtle,
   border.subtle, etc.) go in the base files directly. Fonts load via `next/font/google`
   in `src/app/(site)/layout.tsx` (CSS vars `--font-*`). Full token pipeline:
   `vulpy-design-system-adoption`.
3. **Brand-string sweep:** `siteName` in site-settings alone is NOT enough — page
   metadata titles are hardcoded (`title: "Checkout | Medusa Store"` in every
   `(pages)/*.tsx` + `blog/page.tsx` + `lib/cms/defaults.ts` + `fallback.ts` + the
   `siteName` schema `defaultValue` in `src/globals/index.ts`). Scripted str.replace
   across `src/`; symptom of a miss: `<title>Checkout | Medusa Store | <Brand></title>`.
4. **Logo/site name:** upload the SVG to Payload media (multipart `/api/media`), then
   PATCH `/api/globals/site-settings` with `logo`, `checkoutLogo`, `siteName` (merge
   semantics; the checkout header resolves `checkoutLogoUrl || logoUrl || fallback` —
   update BOTH). See `references/payload-media-upload.md`.
5. **Seed-block audit:** template seed blocks routinely survive rebrands (e.g. a
   `countdownPromo` advertising unrelated products, generic "User Feedbacks"
   testimonials). Before redesigning a homepage, inventory the full block stack and
   replace/drop off-brand seed blocks in the same change
   (`references/payload-rest-homepage-rebuild.md`).
6. **Verify** on the rendered HTML: brand strings absent, new tokens in the served CSS
   chunk, `--design-*` vars mapped, fonts via the next/font body class.

## Standard workflow

1. Target `dev` unless another environment was explicitly requested.
2. Inspect the current document/global through Payload MCP when available.
3. Reuse existing Payload blocks and fields before changing the schema.
4. Make the smallest content change.
5. Verify the public route in the target environment.
6. Report the route and Payload resource changed.

## Common project resources

- Page rendering: `apps/storefront/src/components/cms/BlocksRenderer.tsx`.
- Payload collections: `apps/storefront/src/collections/`.
- Payload globals: `apps/storefront/src/globals/`.
- Default content: `apps/storefront/src/lib/cms/defaults.ts`.
- Payload seeding: `pnpm --filter @apps/storefront seed`.

### Payload seed skip-guards — "seed complete" ≠ content seeded (2026-08-26)

The seed is guarded to be idempotent, which means it can silently do LESS than
expected:

- **Home blocks**: `skip home page blocks (already has content)` fires when the page has
  ANY block rows — including one orphaned/partial block from a crashed earlier run. The
  full default homepage (hero slides, category grid, product grids, testimonials, CTA)
  never gets written. Symptom after a "successful" seed: operator still sees the old
  homepage. Fix: clear ALL home block rows across every `pages_blocks_*` table for that
  page (`DELETE FROM <table> WHERE _parent_id IN (SELECT id FROM pages WHERE slug='home')`
  per table), then re-run the seed and confirm the log says
  `seed home page blocks (was empty)`.
- **Verify rendered output, not exit code**: grep the served HTML for new-content markers
  (block types in flight data, hero slide media names, editorial copy). The dev log line
  `[payload-seed] skip …` vs `seed …` is the ground truth of what actually happened.

Container-run specifics (URL traps, fetch-shim runner): vulpy-commerce-operator →
`references/cross-env-reads.md`.
- Medusa to Payload product sync: `pnpm --filter @apps/medusa-backend sync-products-to-payload`.
- Medusa to Payload category sync: `pnpm --filter @apps/medusa-backend sync-categories-to-payload`.

### Homepage & category/PDP block wire map (parity-audit shortcut)

Before proposing CODE changes for a "missing" storefront capability vs a reference
store, audit the schema/render paths first — most parity gaps are content-seed gaps.
The full field-level map (homepage composed from hero/categoryGrid/productGrid/
richText; categoryContent slots incl. `blocksBelowListing` rendering **page 1 only**
as the SEO-text slot; productContent PDP block set; full reseed pipeline order) is in
`references/block-composition-wire-map.md`. Corollary: an orphaned committed component
(e.g. SearchOverlay.tsx was) is NOT a working feature until wired into the header.

## Homepage/footer reference defaults (operator-mandated, 2026-08-29)

The canonical "top-notch" homepage shape mirrors the Hector Finch reference flow.
`defaultHomeBlocks` in `apps/storefront/src/lib/cms/defaults.ts` must register the
**7-block flow** (no bare `richText` on home — keep richText on other CMS pages):

1. `hero` (slides + promos + trust badges)
2. `categoryGrid` — "Shop by Category" / "THE COLLECTION"
3. `productGrid` — New Arrivals (`ctaUrl: "/shop?sort=latest"`)
4. `promoBanners` — levitation merchandising, never electronics seed copy
   (iPhone/treadmill/Apple Watch are the classic off-brand leftovers)
5. `productGrid` — Best Sellers (`ctaUrl: "/shop?sort=bestsellers"`)
6. `countdownPromo` — "Objects that refuse to sit down" style copy
7. `testimonials`

**Newsletter block must be reused sitewide** (every page, incl. footer): it lives in
`footer.preFooterBlocks` (default `defaultPreFooterBlocks`), rendered by
`SiteLayoutClient` via `BlocksRenderer context="footer-pre"`. The Payload seed
backfills `preFooterBlocks` when the footer global is configured but empty
(2026-08-29 commit). Copy: "Stay in the loop on new levitations" + gravity-joke line.

**Footer socials: TikTok + Pinterest, NO LinkedIn** (operator-mandated). The icon
registry is `apps/storefront/src/components/Common/SocialIcon.tsx` (`react-icons/fa6`:
`FaTiktok`, `FaPinterestP`; keep facebook/x/instagram). Social URLs come from
`defaultSocialLinks` in `lib/cms/defaults.ts` AND the Payload site-settings seed +
`globals/index.ts` placeholder ("facebook, twitter, instagram, tiktok, pinterest").
Always update BOTH code defaults and the seed, or a reseed reverts your change.

**Payment-method seed: NO PayPal.** `defaultPaymentMethods` keeps Visa/MC/Amex/
Discover only. The payment SVGs carry NO text — identify them by viewBox ratio:
`payment-01.svg` 66×22 = **PayPal** (remove), `payment-02.svg` 21×24 = Visa,
`payment-03.svg` 33×24 = Mastercard, `payment-04.svg` 53×22 = Amex,
`payment-05.svg` 57×22 = Discover (verified 2026-08-29).

**Tests for these defaults live in `apps/storefront/src/lib/cms/defaults.test.ts`**
(vitest): asserts the 7-block flow, no richText on home, tiktok/pinterest present,
linkedin/paypal absent.

## SEO work

- Keep the commerce handle and identity intact.
- Use Payload editorial fields for H1, SEO title, description, and content blocks.
- Verify canonical public paths and rendered metadata.
- Do not generate large volumes of repetitive copy without reviewing quality and duplication.

## Schema changes

A request to edit content does not normally require a Payload schema change. When a genuinely new content model or block is required:

1. switch to the storefront-development workflow;
2. update schema and types;
3. add the required production `.js` migration;
4. preserve existing documents;
5. verify the Payload admin and public rendering.

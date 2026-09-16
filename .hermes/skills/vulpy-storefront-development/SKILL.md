---
name: vulpy-storefront-development
description: Develop and verify Vulpy storefront code, CMS content, navigation, search, checkout, and product surfaces.
---

# Vulpy Storefront Development

Verify DOM/tests or served CSS, never SSR greps; see `references/rendered-ui-and-seed-verification.md`. Seeds require convergence + live Payload/Medusa checks. PDP: `references/pdp-wishlist-footer-patterns.md`; headings: `references/heading-hierarchy.md`.

**Direct fixes:** “no coder” means patch workspace directly; still run tests, typecheck, Biome, live rendered verification.

## Repository boundaries

- Storefront: `apps/storefront`; Medusa search: `apps/medusa-backend` (Orama).
- Helpers: `src/lib/data.ts`, `src/lib/medusa/`.
- Cart: `CartContext` + server actions; Redux only for wishlist/quick view.

## CSS / Tailwind v4

Read `references/tailwind-v4-apply-pitfalls.md` (@apply cross-layer failure, font utility silent-miss, inline expansion fix).

## Header / navbar standards (two-bar HF layout)

Read `references/header-nav-patterns.md` before touching Header components or writing a nav brief — icon family, active underline, typography, logo sizing, 3rd-level-nav verified gap.

## Adding or changing a CMS SiteSettings field

Full pattern: `references/cms-sitesettings-field-pattern.md` — the field flows through
FIVE files (types → globals → defaults → queries → fallback); miss one and it silently
drops. Seed defaults are also the CMS-failure fallback voice — for template work keep
copy in the levitating-objects register, never reference-site copy. Also covers
container-side dev verification (grep SSR output; `_next/webpack-hmr` console errors
are expected noise).

**Heading utilities exist** — added to `@layer utilities` in `style.css` (2026-09-03).
Use `@layer utilities` not `@layer components` — Tailwind v4 rejects cross-layer `@apply`.

Heading utilities now exist as `.h1`, `.h2`, `.h3`, `.h4`, `.eyebrow` — see
`references/tailwind-v4-apply-pitfalls.md` for the full table, expansion values, and usage scope.
`.h1` uses raw `font-family: var(--font-sora)` because `@apply font-heading` is a cross-layer
reference that Tailwind v4 rejects. Size: `clamp(26px,3vw,38px)` — applied to all interior page
h1s (Breadcrumb/CMS pages, PDP, PLP, checkout, error, not-found). CategoryRegister hero is the only
larger exception (`clamp(40px,5vw,64px)` — deliberate marketing display size).

Current utilities in `@layer utilities`:
```css
.h1 {
  font-family: var(--font-sora), Sora, ui-sans-serif, system-ui, sans-serif;
  @apply font-light text-[clamp(26px,3vw,38px)] text-content-primary leading-[1.15] tracking-[-0.015em];
}
.h2 { @apply font-normal text-3xl text-content-primary xl:text-heading-2; }
.h3 { @apply font-medium text-content-primary text-heading-3; }
.h4 { @apply font-semibold text-content-primary text-heading-4; }
.eyebrow { @apply font-bold uppercase text-content-secondary text-custom-xs tracking-[0.06em]; }
/* NOTE: use `uppercase` not `@apply text-caps` — text-caps is @layer components, cross-layer
   @apply in @layer utilities throws CssSyntaxError in Tailwind v4 */
```
When implementing these, replace the repetitions across all `components/Home/`,
`components/cms/BlocksRenderer.tsx`, `components/cms/MediaWithTextBlock.tsx`, and
`components/Common/Newsletter.tsx`.

**Tailwind v4 `@theme` wiring gap** — font-weight token utilities (`font-button`, `font-light`,
`font-regular`) must be declared in `@theme {}` in `style.css` to generate Tailwind utilities.
They are NOT auto-generated from `tokens.generated.css`. As of 2026-09-03 this is fixed
(all three are wired). If adding new font-weight tokens to `store.tokens.json`, always add
the corresponding `--font-weight-*` entry to `@theme` or the utility class silently no-ops.

## Required coding skills

Load the relevant curated coding skill before implementation:

- `building-storefronts` for storefront/API integration.
- `building-with-medusa` for Medusa modules, workflows, routes, models, and business logic.
- `building-admin-dashboard-customizations` for Medusa Admin widgets and custom pages.

These coding skills supplement this project-specific skill; they do not override Vulpy environment and ownership rules.

## Standard coding workflow

1. Read `.agent/generated-context.md`.
2. Work in `dev` by default.
3. Locate and reuse the current project pattern before creating a new abstraction.
4. Keep the change focused.
5. Run the narrowest relevant test or typecheck.
6. Run broader checks when practical:

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

7. Verify the affected route or API behavior.
8. List changed files and any migration or rebuild requirement.

### Production builds while dev is running

Never run `next build` in the same bind-mounted storefront checkout while the host dev server is serving from it: both own `.next`, and the build can invalidate the running dev server into route-wide HTTP 500s. Use an isolated worktree/copy for the production build, or deliberately stop dev first and restart it immediately afterward. From the Fox container, prefer isolation because host lifecycle commands may require the operator. A successful build is not runtime verification; probe the restarted dev routes separately.

### Execution posture after plan approval

When the operator says **“move with the plan,” “go,” or equivalent** after a plan exists, begin the next dependency-valid implementation slice immediately. Do not re-deliver the plan as though that were execution, and do not stop after scaffolding when the planned slice can be implemented and verified in the current session.

- Choose a real vertical slice with a working artifact and focused gates; avoid a broad half-migration.
- Continue through recoverable tooling friction using the safest reversible path, while following the blocker-ticket rule from `vulpy-commerce-operator`.
- Ask only when a tool safety gate requires explicit consent, required product input is unavailable, or the next action affects live, data, Git history, or another irreversible boundary.
- “Go” still never authorizes commit, push, PR, deployment, or live changes.

### Discuss the job BEFORE deep-diving (operator preference)

For a large storefront/design job, do NOT spend an hour silently reading repos, worktrees, and logs before talking to the operator — "c'mon, almost 1:20 hrs, we need to discuss" is a hard stop-and-talk signal, and it is a repeatable frustration. Open with a scoped plan conversation: what's already landed (check `git log` for prior HF-parity/seed-fix commits), what the actual gap is, and the 1-2 open decisions (design fidelity target, cleanup scope). State the evidence you have and the decisions you need, ASK, and only then investigate/build. This pairs with the "execution posture" rule: discuss-then-go, not investigate-forever.

## Commerce surfaces stay white + shadow (operator preference 2026-09-03)

Do NOT sweep commerce-core panels from `bg-white shadow-1` to cream tokens —
the operator explicitly reverted that on PLP + PDP. Keep `bg-white` + `shadow-1`
(and `gray-1`/`gray-2`/`gray-3` borders) on: PLP filter dropdowns (Size,
Category, Attribute, Price, Gender), PLP section/mobile sidebar/filter chips/
view toggles, PDP accordions, CategoryRegister header + zebra rows. Cream
tokens (`bg-surface`, `bg-surface-subtle`) belong on marketing surfaces:
homepage sections, newsletter, editorial/CMS blocks. When in doubt on a
commerce panel: white + directional shadow, not cream.

## Payload block removal wedges dev boot (2026-09-03)

Removing a block from a blocks field (e.g. `productPageBlocks`) leaves orphaned
DB tables (`<collection>_blocks_<slug>`, `_<collection>_v_blocks_<slug>`). Next
`dev up` → Payload dev-push sees "You're about to delete …" → prompts on
non-TTY stdin → `process.exit(0)` → "Wedged boot detected" retry loop. Fix:
drop the tables via
`docker exec vulpy-commerce-dev-postgres-1 psql -U medusa -d payload -c "DROP TABLE IF EXISTS ... CASCADE"`
then `dev up`, or reseed (nukes the DB — no orphans, no migration needed).
Note: `pnpm vulpy dev down` does NOT wipe the DB — it only stops servers.
Full recipe + rename pitfalls: `references/seed-option-rename-and-cms-block-removal.md`.

## Critical project rules

- Use Medusa JS SDK for Medusa API requests; do not replace it with unauthenticated raw fetch calls.
- Prices are major units in this project; never divide them by 100.
- Always pass `region_id` where Medusa pricing requires it.
- Cart line items use variant IDs.
- Keep server-only cookie and SDK work in server components, server actions, or server data helpers.
- Preserve serialisable client-component boundaries.
- Medusa mutations belong in workflows, not directly in API routes.
- Payload production schema changes require committed `.js` migrations.
- **`pnpm generate` requires the dev server running** (it POSTs to `/api/dev/generate`). In a container without the server up it exits with `fetch failed`. Workaround: manually stub the new global into `payload-types.ts` — add the interface, add the slug to the `globals` and `globalsSelect` maps. See `references/payload-store-theme-integration.md` § "payload-types.ts manual stub".
- Seed scripts must remain idempotent.
- Do not reintroduce mock product data.

## Product-name and app-icon rebrands

Treat storefront branding as a cross-layer migration: App Router icon routes and manifest, layout/utility fallback titles, Payload schema defaults, seed defaults, and legacy persisted defaults. Preserve unrelated CMS customization by applying an idempotent legacy-brand transform only to title-bearing global fields.

For persisted collection data, global migration is insufficient: query only candidate `pages` SEO records, select only SEO plus id, apply a pure `{ changed, seo }` transform, and update only changed documents with `{ seo }`. Exact known legacy/interim homepage seed titles may collapse to the exact product name; ordinary strings must replace only the legacy storefront name so custom prose and suffixes survive. Keep legacy/interim seed markers detectable, but never treat the exact legitimate product name as a marker.

Root metadata must read the CMS `siteName` and use the hardcoded product name only for an empty CMS value. Shared title formatters must regard `title === siteName` as already formatted to avoid `siteName | siteName` duplication.

Load `references/app-icons-and-seed-brand-migration.md` for the canonical icon set, Payload hotfix pattern, remaining-legacy-string classification, and verification gates.

## CMS fallback guard — demo seed markers in production

The CMS query layer has a guard function (`cmsDefaultsAllowed()` in `fallback.ts`) that blocks demo/seed content in production, but it must be explicitly wired into every fallback path. Per-field `|| defaultSiteSettings.xxx` in `mapSiteSettings`, unconditional `defaultPages[slug]` in `getPageBySlug`, and unconditional `defaultPaymentMethods` fallbacks all bypassed the guard in the past. See `references/cms-fallback-guard-pattern.md` for the full three-layer architecture, the two leak paths, and the audit checklist for new CMS query functions.

## Error boundaries and crash resilience

The storefront uses three layers of error boundaries following Next.js App Router conventions:

### 1. `global-error.tsx` (root — catches layout crashes)

**Location:** `src/app/global-error.tsx`

Catches errors thrown **in the root layout itself** (not just pages). When the root layout crashes, Next.js renders this instead. It must:

- Be `"use client"`
- Render its **own `<html>` and `<body>` tags** (the root layout is dead; there's no parent to provide them)
- Import `@/app/css/style.css` directly since no parent layout provides the CSS
- Keep branding minimal — logo + "Try again" button calling `reset()`
- Include a `NEXT_REDIRECT` digest guard (same pattern as segment error boundaries)

**When to add/update:** Every storefront project should have one. It prevents the "blank white page" when a CMS or Medusa fetch throws in the root layout.

### 2. Segment `error.tsx` (route group — catches page errors)

**Location:** `src/app/(site)/error.tsx`

Catches errors in any page within the `(site)` route group. It sits **inside** the layout, so it inherits `<html>`/`<body>` from the layout and the header/footer from `SiteLayoutClient`. Should provide:

- "Try again" button (`reset()` — retries rendering the page)
- "Back to home" link (escape hatch)
- `NEXT_REDIRECT` guard (silently skip navigation digests — same pattern as checkout)
- Error logging only in development (`process.env.NODE_ENV === "development"`)

**Pattern (consistent with existing `checkout/error.tsx`):**
```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";

type Props = { error: Error & { digest?: string }; reset: () => void };

export default function SegmentError({ error, reset }: Props) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[SegmentError]", error);
    }
  }, [error]);

  // Navigation events (NEXT_REDIRECT) are not errors — let Next.js redirect silently
  if (error.digest?.startsWith("NEXT_REDIRECT")) {
    return null;
  }

  return (
    <section className="...bg-surface-canvas...">
      <h1>Something went wrong</h1>
      <button onClick={reset}>Try again</button>
      <Link href="/">Back to home</Link>
    </section>
  );
}
```

### formatPrice / getCurrencySymbol — guard against empty currency code

When `getStoreRegion()` fails (Medusa unreachable, bad publishable key, 400 response), the layout graceful-degradation fallback returns `currencyCode: ""`. `Intl.NumberFormat` throws `RangeError: Invalid currency code :` when currency is empty. This crashes every component that renders a price, including `GatedAmount`.

**Fix (in `apps/storefront/src/lib/medusa/money.ts`):**

```ts
export function formatPrice(amount: number, currencyCode: string) {
  const code = currencyCode?.toUpperCase();
  if (!code) {
    // Medusa region fallback can produce an empty string; return empty rather than crashing
    return "";
  }
  const rounded = roundPriceAmount(amount, currencyCode);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
  }).format(rounded);
}

export function getCurrencySymbol(currencyCode: string) {
  const code = currencyCode?.toUpperCase();
  if (!code) return "$"; // safe default
  // ... rest of function
}
```

**Add a test:**
```ts
it("returns empty string for empty currency code", () => {
  expect(formatPrice(10, "")).toBe("");
});
```

**Why the blast radius is wide:** layout graceful degradation (#23) made CMS/Medusa failures non-crashing at the layout level, but propagated `""` as `currencyCode` to all child components. Any component that calls `formatPrice(amount, "")` then crashes. Guard at the source (`money.ts`), not at each call site.

### 3. Graceful degradation of layout data loaders

The `(site)/layout.tsx` is a **server component** that awaits CMS and Medusa data. A single throw in any fetcher kills the entire layout → blank page. Mitigation:

**Wrap `getStoreRegion()` independently** (others depend on `regionId`):
```tsx
let regionId = "";
let currencyCode = "";
try {
  const region = await getStoreRegion();
  regionId = region.regionId;
  currencyCode = region.currencyCode;
} catch {
  console.error("[SiteLayout] getStoreRegion failed — using empty fallback");
}
```

**Use `.catch()` on each `Promise.all` member** so one failure doesn't take down the whole batch:
```tsx
const [storeCart, customer, siteSettings, ...] = await Promise.all([
  getStoreCart().catch(() => ({ cart: null, issues: [], checkoutBlocked: false })),
  getStoreCustomer().catch(() => null),
  getSiteSettings().catch(() => emptySiteSettings),
  getNavigation().catch(() => emptyNavigation),
  getFooter().catch(() => emptyFooter),
  getCategoryNavigationItems(regionId).catch(() => []),
  getSearchCategories(regionId).catch(() => []),
]);
```

Import fallback values from `@/lib/cms/fallback`:
```tsx
import { emptyFooter, emptyNavigation, emptySiteSettings } from "@/lib/cms/fallback";
```

**Also wrap `generateMetadata()`** — it's an async function that runs in the layout scope and can crash before the component body:
```tsx
export async function generateMetadata(): Promise<Metadata> {
  try {
    const siteSettings = await getSiteSettings();
    return { ...rootSiteMetadata(), title: siteSettings.siteName.trim() || "Vulpy Commerce" };
  } catch {
    return { ...rootSiteMetadata(), title: "Vulpy Commerce" };
  }
}
```

The CMS query layer already has fallbacks (`emptySiteSettings`, `emptyNavigation`, `emptyFooter`, `cmsDefaultsAllowed()`) — wire them in the layout, don't write new fallbacks. A CMS/Medusa outage should produce an empty nav + default title, not a white page.

## Medusa API HTTP verb conventions — POST for updates

Medusa v2's store API uses **POST (not PATCH/PUT) for resource updates** on several endpoints — customer addresses (`/store/customers/me/addresses/:id`), cart (`/store/carts/:id`), customer profile (`/store/customers/me`), and likely others. This is a deliberate command-pattern design, not a REST-verb oversight.

### Where the verbs are defined

The Medusa backend route files export handlers by HTTP-method name. To check what verbs an endpoint accepts, inspect the route file in the installed package:

```bash
find /app/workspace/node_modules/.pnpm -path "*/@medusajs/medusa/dist/api/store/customers/me/addresses/[address_id]/route.js"
```

Each exported function (`GET`, `POST`, `DELETE`) registers as the Express handler for that verb. The framework's `HTTP_METHODS` list in `@medusajs/framework/dist/http/types.js` includes `PATCH`, but the route file must actually **export** a `PATCH` handler for it to work.

### The JS SDK mirrors the backend — check both

The JS SDK's `updateAddress` method (in `@medusajs/js-sdk/dist/esm/store/index.js`) also uses `method: "POST"` to match the backend. Before changing a verb in a storefront action:

1. **Check the backend route file** — does it export the verb you want to use?
2. **Check the JS SDK source** — does the SDK use a different verb already?

If the backend only exports `POST` and `GET`, sending `PATCH` will 404 — the handler doesn't exist.

### Common storefront integration footgun

Storefront actions often call `medusa.client.fetch(url, { method, body })` directly instead of using the typed SDK method. This bypasses any SDK-level conventions and makes the verb visible. When adding a new action:

- **Create endpoint** (e.g. `/store/customers/me/addresses`): `POST`
- **Update endpoint** (e.g. `/store/customers/me/addresses/:id`): **`POST`** despite being an update — check the route file
- **Delete endpoint** (e.g. `/store/customers/me/addresses/:id`): `DELETE`
- **Get/list endpoints**: `GET`

**Verification pattern:** after writing any action that uses `client.fetch()`, grep the backend's route file for the matched URL pattern to confirm the method is supported:

```bash
VERB="POST"  # the method you're about to use
ROUTE_FILE=$(find /app/workspace/node_modules/.pnpm -path "*/@medusajs/medusa/dist/api/store/customers/me/addresses/[address_id]/route.js" | head -1)
grep "exports\.$VERB" "$ROUTE_FILE"
```

If the grep returns nothing, the verb isn't registered — the route file needs updating in the backend package OR you should use the verb that IS exported (likely POST).

### Pitfall: the OpenAPI spec labels "Update Address Post"

The Medusa v2 Store API OpenAPI reference lists the address update as an operation named `PostCustomersMeAddressesAddress_id` — the "Post" prefix is the verb used. When researching Medusa's API, the sidebar showing "Update Address Post" is not a mistake or a documentation gap; it's the actual endpoint convention.

## Known wiring pitfalls

### Payload schema data-loss prompt wedges dev.up (2026-09-03)

When a Payload block type is removed from a collection schema, Drizzle dev-push sees orphaned
tables and prompts interactively. This wedges `dev.up` — the bridge has no TTY to respond
(`process.exit(0)` on non-TTY).

**Fix — write a migration:**
```js
// apps/storefront/src/migrations/YYYYMMDD_drop_<block>_tables.js
export async function up({ db }) {
  await db.execute(`DROP TABLE IF EXISTS "<collection>_blocks_<slug>" CASCADE`);
  await db.execute(`DROP TABLE IF EXISTS "_<collection>_v_blocks_<slug>" CASCADE`);
}
export async function down() { /* intentional no-op */ }
```
Payload runs migrations before the next dev-push, so Drizzle sees no diff and never prompts.
Table names: `<collection>_blocks_<blockSlug>` and `_<collection>_v_blocks_<blockSlug>`.

If already wedged: `python3 scripts/vulpy-agent-cmd.py store.reseed` (wipe + reseed),
or operator runs `pnpm vulpy dev up` on host and types `y`.

### Turbopack production build: `"use server"` module must export ONLY async functions (2026-08-25, fixed on main 2026-08-26)

Symptom: `next build` fails with a module-resolution error for a server action —
e.g. `Export pollPaymentReturnServerAction doesn't exist… module has no exports at
all` — traced via `PaymentReturnPoller.tsx → app/actions/poll-payment-return.ts`.
Root cause: the file is `"use server"` but exports a **non-async** function
(`export function foo(): Promise<T> { ... }`). webpack tolerated the non-async
form; **Turbopack drops the export entirely** (server actions must be `async`).
Fix: make it `export async function` (the body can still return the promise /
`return await`). After fixing one instance, class-check: grep every `"use server"`
module for non-async exports — there was exactly one repo-wide. This failure mode
blocked PRODUCTION builds on main itself; treat as a release blocker when found.

Prove it reproduces on base before fixing: the failure is pre-existing on main if
the import chain is unchanged since an ancestor commit — check with
`git log -S "pollPaymentReturnServerAction" --oneline -- <file>` and
`git show <base>:<file>` presence. Then prove the fix: `next build` exits 0
(`Compiled successfully`, N/N pages). This failure mode blocks PRODUCTION builds
on main too, not just the branch — treat it as a release blocker when found.

### Next.js sitemap route conflict — orphan `app/sitemap.ts` stub vs `sitemap.xml/route.ts` (verified 2026-08-27 on padelbaza)

Symptom: `next build` fails with:
- `Conflicting route and metadata at /sitemap.xml: route at /sitemap.xml/route and metadata at /sitemap.xml/route`
- `./apps/storefront/src/app/sitemap--route-entry.js: Export default doesn't exist in target module` — `Did you mean to import generateSitemaps?`

Root cause: the repo has BOTH `app/sitemap.xml/route.ts` (a manual route handler serving the sitemap INDEX via `buildSitemapIndexXml`) AND `app/sitemap.ts` (a metadata-route stub exporting only `generateSitemaps`, no default export). Next resolves both to `/sitemap.xml`; the generated route entry expects a default export from `sitemap.ts` that doesn't exist, so EVERY `next build` fails. This is easy to leave behind after a shard refactor: shards moved to `app/sitemap/[id]/sitemap.ts`, the index moved to `route.ts`, and the old stub was never deleted. Check CI: if recent runs on the default branch were already failing, the break is pre-existing, not yours.

Fix: delete the orphan `app/sitemap.ts` when a manual `sitemap.xml/route.ts` index exists. `generateSitemaps` is only needed for the metadata-route variant (a single self-contained `app/sitemap.ts` that default-exports the entry list). Detection: `find apps/storefront/src/app -maxdepth 2 -name "sitemap*"` — seeing both `sitemap.ts` AND `sitemap.xml/route.ts` IS the conflict.

Related lint trap: a shard dispatch (`export default async function sitemap()`) that `return buildX()`s its async builders trips biome `lint/suspicious/useAwait` ("async function lacks await"), and the lint-staged pre-commit hook blocks commits on it. Fix behavior-preserving: `return await buildPagesSitemap(siteUrl)` etc. Do NOT let biome `--unsafe` "fix" it by stripping `async` — that breaks the route signature.

### Paginated sitemap URLs for SSR-paginated listings

When category/shop listings are server-rendered per `?page=N` (server catalog fetch + `enforceCatalogPagination` + per-page canonical), the sitemap must list the paginated URLs or crawlers can never discover pages 2+ (page 1 is the only entry). Keep page 1 clean (no `?page=1`) to match the canonical; emit `?page=2..N`. Derive `totalPages` from region-aware Medusa product counts ÷ `SHOP_PAGE_SIZE`, and cap the depth (e.g. 50 pages) so huge catalogs stay bounded. Graceful fallback: if Medusa or the region is unavailable, emit only the clean URL. Helpers `paginatedListingUrls(cleanUrl, totalPages)` / `totalListingPages(count, pageSize)` and the full shard wiring: `references/nextjs-sitemap-pagination.md`.

Also note: a `noindex` site with `SITE_NOINDEX=1` serves an EMPTY shard 0 and robots `Disallow: /` — live sitemap endpoints 404/minify by design. Paginated sitemap work only pays off once indexing is enabled; verify against an indexable environment.

### Next.js 16 cache API signatures — `revalidateTag`/`revalidatePath` need explicit args

Next 16 (this repo pins `next@16.2.9` / `16.2.6`) changed the cache helper
signatures. **`revalidateTag` requires a second `profile` argument and
`revalidatePath` requires an explicit second `type`**:

```ts
import { revalidateTag, revalidatePath } from "next/cache";

revalidateTag("shop-catalog", "default");                    // ✅ two args
revalidatePath("/", "layout");                               // ✅ two args
revalidateTag("shop-catalog");                               // ❌ TS2554 Expected 2 arguments
revalidatePath("/");                                         // ❌ TS2554 Expected 2 arguments
```

A one-arg call fails the storefront typecheck (`tsc --noEmit`) even though the
dev server runs — check `next/cache.d.ts` / `revalidate.d.ts` in the installed
package before assuming the API is one-arg. Also note `updateTag(tag)` is
one-arg (read-your-own-writes server actions only) and `refresh()` takes none,
so the "right" signature depends on which helper you use. This tripped the
dev-only `/api/dev/cache-clear` route (2026-08-29); the same guard applies to
any new route/action calling these.

### SSR facet verification — grep the flight payload, not the bare synonyms

To prove the PLP sidebar carries Finish/Color/Material server-side without a
browser: fetch the page with `curl` and (1) search the rendered HTML for the
exact label markers `>Finish<`, `>Color<`, `>Material<`, plus `checkbox` and
`aria-label="<FinishName>"` swatch spans; (2) find the `catalogPath` JSON
segment of the RSC flight payload and confirm `facets.finishes` /
`facets.attributes.material` are populated. A count of plain `Material`/
`Finish` words is misleading — those substrings appear in product metadata
outside the sidebar. If facets respond to the backend but the page shows only
some groups, the difference is between what the backend index emitted
(attributes vs finishes) and the cold-cache race (see
`references/demo-seed-facets-cache-verification.md`).

### Demo-seed facet cache invalidation — option-only upserts don't clear the scope cache (2026-08-29)

Symptom: after adding **Finish/Color** option values to the demo seed and
re-running `store.reseed`, `/store/shop/facets` returns `finishes: [...]` but
`colors: []` (the sidebar shows Finish but no Color), even though the seed
register clearly defines both options.

Root cause: the shop-catalog **scope cache** (`buildShopScopeCacheKey` /
`getOrCreateScopeBuild` in `shop-catalog-cache.ts`) is invalidated only by the
`product.created/updated/deleted` subscriber events. When a rerun of
`seed-demo-catalog` updates EXISTING products' options/variants via
`updateProducts(..., { applyOptionsAndVariants: true })`, the option-value
change may not emit a `product.updated` that reaches the catalog cache
generation bump — so the old index entry (which read `entry.colors` as empty
because the pre-option variants had none) stays cached. `resetShopCatalogCache`
bumps a generation but the running Medusa process still serves the stale
in-memory scope build until restart.

Fix/verification pattern:
1. **Always verify the seed actually ran** — reseed output can exit 0 while the
   data layer is unchanged (`seed-demo-catalog` skips existing products unless
   `applyOptionsAndVariants` is explicitly true; a metadata-only rerun is a
   no-op). Confirm the option rows exist with a direct probe:
   `GET /store/products?fields=options.*,variants.options.*` returns non-empty
   `options` for a product that should have them.
2. **Force a clean index rebuild after any option/seed change**: `dev.restart`
   (clears the in-process scope cache) THEN `/api/dev/cache-clear` (revalidates
   `shop-catalog`/`shop-facets`), then re-probe `/store/shop/facets`.
3. If colors still come back empty after restart, the running process is
   holding an even older tree — check `.tmp/dev/dev.log` for a Turbopack
   permission wedge (`Permission denied … reading file …` is the tell; the
   `transformAlgorithm`/undici 5.20.0 errors are a separate dev-runtime
   mismatch, not the facet bug).
4. The storefront's own `mergePageAttributeFacets` (in `shop-filters.ts`,
   called from `loadCatalogPage`) can paper over a stale backend by merging
   `product.filterableAttributes` — that fixes ATTRIBUTES (Material) but NOT
   `finishes`/`colors`, which the page does not merge; those come only from the
   backend facets payload.

## HF homepage reference flow — block order, newsletter-everywhere, socials/payments

### Extension-induced hydration mismatch — read the error diff before blaming the build

A "Hydration failed because the server rendered HTML didn't match the client" error
whose diff shows injected attributes (`data-sharkid="__0"`,
`data-sharklabel="email"`, or a `<shark-icon-container>` element) is caused by a
browser extension (e.g. Sharkid auto-fill/label) mutating the DOM between server
render and client hydration — NOT a storefront code defect. React then regenerates
the tree client-side, which can leave the page half-hydrated (dead controls, jank)
and read as "the site looks like shit." Before blaming the build, read the hydration
diff for extension-injected nodes. The robustness takeaway is real but the trigger is
the extension, not main's code.

"Make the homepage like the Hector Finch (HF) reference" is a recurring operator
ask. **HF's template is NOT the generic 7-block electronics-template flow** — it is
a lean, editorial homepage. Verified against the live HF storefront (2026-08-29),
HF renders exactly these blocks:

```
hero → categoryGrid → productGrid(new-arrivals) → richText(story: "Built by hand…")
→ mediaWithText(care guide: "Low maintenance…" + "Read the care guide") → newsletter
```

HF ships **NO** bare promoBanners, countdownPromo, testimonials, or
best-sellers productGrid on the homepage. The generic template blocks
(promo/countdown/lorem-testimonials/best-sellers) are what make the homepage look
like "a bunch of shit" — the correct clone is to DROP them, not to re-skin them.
The rendered HF copy is editorial (build-story + care-guide CTA), in the store's
own voice. When the operator says "clone HF's homepage", diff the LIVE reference
page (block structure via SSR heading/link extraction, `curl` + regex) BEFORE
assumeitting which template blocks to keep — don't cargo-cult the template's
block set.

Ensure the new-arrivals grid CTA points at `/shop?sort=latest`. When replacing
template promo/countdown copy (iPhone/treadmill/Apple Watch), write Vulpy-voice
merchandising and keep imageUrls pointing at existing assets (verify the asset
exists before referencing).

### Legacy NextCommerce scaffolding hides in the header/footer defaults (audited 2026-08-30)

HF-parity homepage flow can be fully landed while the header + footer STILL render
legacy NextCommerce template content — the operator will report "there are many
sections from old nextmerce, header and footer included" even with a clean homepage.
The legacy lives in the CMS defaults source of truth
`apps/storefront/src/lib/cms/defaults.ts` (duplicated in `fallback.ts`), rendered
verbatim by `components/Footer/index.tsx`:

- **Fake contact info:** address `685 Market Street, Las Vegas, LA 95820, United
  States.` (~L79), phone `(+099) 532-786-9843` (~L80), email
  `support@example.com` (~L81) — pulled from `siteSettings.contactInfo` directly.
- **Template link columns:** "Account" (My account / Sign in / Cart / Wishlist /
  Recently viewed / Shop) ~L139-149; "Quick Link" (Privacy / Cookie / Refund /
  Terms / FAQ / Contact) ~L151-161.
- **Dormant scaffolding that can silently re-appear via any seed path:**
  `bestSellers`, `testimonials`, `countdownPromo` (~L181-198), "1 & 1 Returns" /
  "24/7 Dedicated Support" (~L305/317). "Not currently rendered" ≠ "gone" — grep
  defaults.ts for these markers before declaring them dead.

Verify by browsing `http://host.docker.internal:3000` (NOT `localhost:3000` — inside
the Fox container localhost is the container itself and refuses the connection), dump
the DOM via browser_console to enumerate rendered sections, and grep source for
marker strings (`1 & 1 Returns`, `24/7`, `Quick Link`, `Help & Support`,
`support@example.com`, `532-786-9843`). Full recipe:
`vulpy-commerce-operator/references/storefront-cms-defaults-legacy.md`.

**Newsletter everywhere:** `defaultFooter.preFooterBlocks` ships the newsletter
block and the footer renders on every page via `SiteLayoutClient` — but the
Payload `footer` global seed may have been configured WITHOUT preFooterBlocks.
The seed must **backfill `preFooterBlocks` when the footer global is empty**
(`seed-payload-core.ts` pattern: read the footer global, if `preFooterBlocks`
length 0 → `mapBlocksForSeed(defaultPreFooterBlocks)` → `updateGlobal`). Without
the backfill, existing dev DBs keep no newsletter even though defaults changed.

**Footer socials + payments are code AND seed:** footer renders
`siteSettings.socialLinks` (loop) + `siteSettings.paymentMethods` through
`FooterCopyright`. Changing them requires updating BOTH `SocialIcon.tsx`/
`defaults.ts` AND the Payload site-settings seed, or old icons persist on a
live DB. Payment brand SVGs are identifiable by viewBox (payment-01 = PayPal
66×22, 02 = Visa, 03 = Mastercard, 04 = Amex, 05 = Discover) — payment-01 is
the PayPal mark, so removing PayPal = drop `payment-01.svg` from
`defaultPaymentMethods`. react-icons `fa6` ships `FaTiktok`, `FaPinterestP`,
`FaLinkedin`. Full file map + swap recipe:
`references/footer-payment-social-icons.md`.

Test this class cheaply: `defaults.test.ts` (or the existing storefront vitest)
asserting the 6-block HF-parity order (hero, categoryGrid, productGrid,
richText, mediaWithText, newsletter), no template blocks on home, CTA sort
params, and social/payment lists — green without any dev server.

Reseed the Payload globals after these default-only changes — defaults don't
retroactively fill an already-configured footer global.

### The editorial-seed clobber — the real "why is this so hard" homepage bug (2026-08-29)

`apps/storefront/src/scripts/seed-editorial.ts` `seedHome()` used to OVERWRITE the
CMS home page blocks with a hardcoded legacy 4-block array
(hero/categoryGrid/productGrid/richText) whenever its "ready" check (hero slide
title `The art of leaving room`) didn't match — which was always. So every seed
first applied `defaultHomeBlocks`, then the editorial seed wiped it back to the
stock 4-block shape with lorem testimonials. This is why the homepage kept
snapping back to template garbage no matter what `defaultHomeBlocks` said.

Fix (committed): seedHome no longer writes home blocks at all; `defaultHomeBlocks`
is the single source of truth. **When the homepage 'snaps back' after reseeding,
ALWAYS check for a second writer of home blocks before touching defaults again.**
The chain is `ensureHomeBlocks` (seed-payload-core) → `seedHome` (seed-editorial)
— either one writing home blocks is a clobber risk.

Related Payload mapping rule: `mapBlocksForSeed` must map `mediaWithText`'s
string `imageUrl` → Payload `image` media relation (`mediaType: "image"`) and
`newsletter`'s `bgImageUrl` → `bgImage`. Payload DROPS blocks that don't match
its schema — a block silently missing from the DB after seed is a mapping bug.
Verify block persistence with SQL: count `pages_blocks_<type>` rows per
`_parent_id` (the home page id) — only block types with ≥1 row actually landed.

Operator workflow (2026-08-29): "I need one line installer with seed, not trying
million things." When the user says **nuke and restart / show freshly seeded
store**: STOP incremental patching, wipe the DB the apps actually use (see
`vulpy-dev-seed-from-container` for the correct psql drop + per-step seed),
reseed from current defaults, and VERIFY the rendered SSR headings + zero lorem
BEFORE reporting. Batching half-fixes and reporting progress each time reads as
flailing. Note the dev-api-client base-URL gotcha: in-container seeds must point
at `host.docker.internal`, not `127.0.0.1`/`localhost` — the
`HERMES_CONTAINER_HOST_GATEWAY` env knob makes `resolveBaseUrl()` host-reachable
(patched 2026-08-29).

### Footer payment icons, social icons, and the "make it look good" operator preference

Footer/icon swap requests ("remove PayPal logo", "drop LinkedIn, add TikTok +
Pinterest", "top-notch homepage") are **code + seed** changes, not rendering
tricks: the footer already renders `paymentMethods` and `socialLinks` from CMS
site-settings. Identify the payment brand SVGs by viewBox (payment-01 = PayPal
66×22, 02 = Visa, 03 = Mastercard, 04 = Amex, 05 = Discover), update BOTH
`SocialIcon.tsx`/`defaults.ts` AND the Payload site-settings seed or the old
icons persist on a live DB. Full file map + swap recipe:
`references/footer-payment-social-icons.md`.

Operator mode (2026-08-29, "have no idea — I just need good looking and well
polished storefront"): when the dev stack is wedged on infra noise
(Turbopack/undici/`transformAlgorithm`), STOP rabbit-holing the boot issue —
the operator judges the result visually, not the infra. Keep shipping the
code-change slices (block content, footer icons, seed fixes) which don't need
the dev server, get them committed, and hand over one URL for the visual
pass. Report the infra wedge as a known status, don't make it the deliverable.

Symptom: storefront renders fine but console shows `client:802 WebSocket
connection to 'wss://<host>:3000/_next/webpack-hmr' failed` / `[vite] failed to
connect to websocket`-style noise (actually Next/Turbopack HMR client) — in a
NORMAL browser tab, not just the WebUI iframe.

Verified behavior:
- Direct Next HMR (`ws://host.docker.internal:3000/_next/webpack-hmr`): **opens**
- Direct with Tailscale origin header: **opens**
- Public edge Caddy `https://commerce-private.dev.vulpy.io/_next/webpack-hmr`:
  **101 Switching Protocols** (use `curl --http1.1` — HTTP/2 turns an Upgrade
  request into a plain GET and returns 404, a false negative)
- Failing path observed: Tailscale high-port preview (`https://<magicdns>:3000`)

The app still works because HMR failure is non-fatal (page loads, hot reload
just doesn't). Recommendation: use the public edge URL for live dev/HMR; treat
Tailscale high-port URLs as "app preview only, HMR may be noisy". This is NOT an
`allowedDevOrigins` problem (those are already configured) and NOT a Caddy
header fix — it's the tunnel path not carrying the websocket upgrade.

### Playwright e2e against the turbo-dev stack (from Fox container)

The repo e2e harness needs its own Docker stack (no docker socket in the Fox
container). To run the fixtures against the live dev stack: local Host+Origin
rewrite proxy (Turbopack rejects foreign HMR origins), writable
`PLAYWRIGHT_BROWSERS_PATH`, strict-locator hardening for the full dev catalog,
Next 16 not-found-boundary false alarms. Full recipe:
`references/playwright-dev-stack-e2e.md`.

Before ANY payment/coupon e2e run, do the stack inventory first (validate the
real Stripe key from the env file, fixture product in dev DB, disposable
promotion lifecycle, HMR proxy alive) — the operator expects gap analysis
BEFORE harness work, not after wasted turns. Never add e2e coupon codes to the
normal seed: create them at test time and delete them in teardown. Checklist +
the call-sequence/error-shape diagnostics:
`references/checkout-payment-e2e-gap-checklist.md`.

### Worktree env files are gitignored — copy, don't assume

Worktrees of this repo have NO `.env` files (gitignored, never in git). Before
running anything env-dependent in a worktree (typecheck with Stripe keys, dev
probes, e2e fixtures): copy from the shared checkout +
`apps/medusa-backend/.env.template`. When writing long secrets with `patch`,
verify the full value landed (the patch tool once duplicated/truncated a
`pk_test_` key — grep the full key after writing, don't trust diff output).

### File deletion and generated-artifact cleanup

Use the currently available, approval-aware file-management path for deletions. Never bypass a command approval guard through a nested subprocess or alternate execution tool. Limit cleanup to artifacts created by the current task (for example `__pycache__/`) and preserve unrelated dirty or untracked files. If deletion is blocked, report the exact artifact rather than disguising it as source or leaving an unexplained tombstone module.

### Patch tool creates duplicate JSX `className` props — always run biome after

When the `patch` tool replaces a JSX attribute, it sometimes inserts the replacement value **without removing the original line**, leaving two `className="..."` props on the same element. Biome reports this as `lint/suspicious/noDuplicateJsxProps` (exit 0 but "errors emitted"). The generated code is broken — React uses the last one only.

**After any agent session that patches TSX files, run:**
```bash
npx biome check --write apps/storefront/src
```

**If errors remain after `--write` (biome can't auto-fix duplicate props), find and fix manually:**
```bash
npx biome check apps/storefront/src 2>&1 | grep 'noDuplicateJsxProps'
```
Then open each reported file and delete the duplicate prop line (the second occurrence is always the unwanted one — it's the original that wasn't removed).

**Python bulk-fix pattern** (when multiple files affected):
```python
import re

for path in affected_files:
    src = open(path).read()
    fixed = re.sub(
        r'(className="[^"]*")\s*\n(\s*)className="[^"]*"',
        lambda m: m.group(1),
        src
    )
    if fixed != src:
        open(path, "w").write(fixed)
```

### `CART_FIELDS` must be a single shared constant
`apps/storefront/src/app/actions/cart.ts` and `apps/storefront/src/lib/medusa/cart.ts` each define their own `CART_FIELDS` string. They have drifted: `actions/cart.ts` includes `+items.variant.inventory_quantity` and `+items.variant.manage_inventory`; `lib/medusa/cart.ts` does not. Cart creation enriches with inventory data, but subsequent `getEnrichedCart` calls (used after every mutation) lose those fields — silent wrong-state display for stock gating.

**Rule:** export `CART_FIELDS` from `lib/medusa/cart.ts` only, import it in `actions/cart.ts`. Any time you add a field, change it in one place.

### `payment-return` page — polling, NEXT_REDIRECT re-throw, dedup analytics

See `references/checkout-payment-return-handler.md` for the full pattern. Key rules:
- Cart ID from cookie (`getCartId()`), never URL params
- **NEXT_REDIRECT errors must be re-thrown** in every try/catch that wraps a server action calling `redirect()`. Swallowing them silently sends the user to the wrong page (fallback route) instead of the intended redirect destination. Guard every catch block:
  ```ts
  const digest = (error as { digest?: string })?.digest ?? ""
  if (digest.startsWith("NEXT_REDIRECT")) throw error
  ```
- Timeout copy must never claim payment failed when status is unknown ("Do not pay again — your payment may already be complete")
- Use `submitPaymentSuccessOnce()` (dedup guard) in `lib/analytics/checkout-analytics.ts` on success, not bare `trackCustomEvent` — both the inline Stripe path and the payment-return poller can fire `payment_success`; dedup prevents double-counting in Matomo

Required fix:
1. Action: add `{ state: "completed", orderId: string }` — query order by cart ID to detect completion.
2. Client: poll every ~2 s up to ~30 s; on `"completed"` redirect to `/order/confirmed/[id]`.

### Promotion/coupon server actions — `applyCartResult` is client-only

`applyCartResult` is a CartContext function — it is **client-side only** and cannot be called from a `"use server"` action. The correct pattern:

1. **Server action** (`cart.ts`): calls `sdk.store.cart.update({ promo_codes: [...] })`, returns `{ cart: enrichedCart }` or `{ error: string }`.
2. **Client component** (`Coupon.tsx`): calls the action, then calls `applyCartResult(result.cart, { mutation: 'add', source: 'promo' })` on success.

Never call `applyCartResult` inside a server action — it silently fails (the function doesn't exist in a server context).

`removePromotionAction` clears all promo codes via `promo_codes: []` — Medusa v2 has no per-code removal. Document this with an underscore-prefixed `_code` parameter for API symmetry. If future Medusa supports per-code removal, filter the current cart's promo list before sending.

### `clearCartAction` deletes items serially — use `Promise.all`
```ts
// ❌ N sequential round trips
for (const item of cart.items) {
  await medusa.store.cart.deleteLineItem(cartId, item.id);
}
// ✅ parallel
await Promise.all(
  cart.items.map(item => medusa.store.cart.deleteLineItem(cartId, item.id))
);
```

See `references/v0-stability-audit.md` for the full pre-v0 audit findings.

### Payload admin Preview iframes instead of opening the URL

Symptom: clicking Preview in the Payload admin renders the preview URL inside an
embedded iframe split-pane instead of opening the real page in a new tab.

Cause: the collection config sets BOTH `admin.preview` (new-tab button) and
`admin.livePreview` (iframe pane). The iframe comes from `livePreview` — `pages`,
`productContent`, and `categoryContent` all had both blocks.

Fix: remove the `admin.livePreview` block, keep `admin.preview`. The Preview
button then opens `/api/preview?collection=…&slug=…&path=…&secret=…` in a new
tab → draft mode enables → redirect to the real path (route:
`src/app/api/preview/route.ts`).

Notes:
- The storefront live-preview machinery (`LivePreviewBlocksRenderer`,
  `PreviewableBlocksRenderer`, `RefreshRouteOnSave`, `livePreviewData` plumbing in
  `lib/cms/queries.ts` + page props) becomes inert once `livePreview` is removed —
  it renders `initialData` via `useLivePreview` and no-ops without the admin iframe
  parent. Harmless; stripping is optional cleanup.
- Payload admin reads collection config at server boot — the change only shows in
  the admin UI after a dev server restart. Fox cannot run `pnpm vulpy dev restart`
  directly (uid-999 guard) — restart through the host agent-cmd bridge:
  `corepack pnpm vulpy agent cmd dev.restart` (background + notify). See
  vulpy-environment-operations → `references/agent-cmd-server.md`.

## Saved products (wishlist / recently viewed) — id-only storage + rehydrate

Since 2026-08-12 (commit `53e8c88`) these two features persist ONLY product
handles to localStorage (`nextmerce-wishlist`, `nextmerce-recently-viewed` =
`string[]` of handles). No names, images, or prices are ever stored. On every page
load the hydrators (`WishlistHydrator.tsx`, `RecentlyViewedHydrator.tsx` — both
mounted globally in `SiteLayoutClient`) call `rehydrateSavedItemsAction(handles)`
(`src/app/actions/saved-items.ts`), which rebuilds full items (title, images,
price, stock) fresh from Medusa by handle and dispatches `hydrateWishlist` /
`hydrateRecentlyViewed`. This is a hard design rule — display data must NEVER come
from client storage; the user explicitly asked for id-only persistence
("no images, names or prices — let's just have ids").

Key facts:
- `Product.id` / `Product.variantId` = **variant id** (`variant.id`); `productId` =
  product id (AGENTS.md gotcha §5). Wishlist items are card-level — one entry per
  product (cheapest/first variant).
- **The Medusa 2.13 store SDK has NO `store.variant` resource**, and
  `store.product.list`'s `id:` filter expects product ids — a raw variant id
  cannot be resolved back to a product via the store API. Saved-item rehydration
  must key on handle (or product id), never variant id (verified against
  @medusajs/js-sdk 2.13.0, 2026-08-12).
- `store.region.list({ country_code })` → 400 `Unrecognized fields`; find the
  region client-side via `countries[].iso_2`.
- The action returns items in input-handle order and drops handles that no longer
  resolve — deleted products silently disappear from saved lists.
- Rehydrate failure → the list stays empty (nothing displayable without storage);
  saved pages pop in async instead of rendering from a snapshot. Do NOT
  reintroduce snapshots to "fix" the flash.
- The earlier granular refresh path (`refreshWishlistPricesAction` /
  `refreshRecentlyViewedPricesAction` + `refresh*Prices` reducers) was REMOVED as
  obsolete — do not resurrect it.

Full architecture, SDK constraints, and verification recipes (tsx live data-path
probe, dirty-tree stash-baseline typecheck): `references/saved-items-rehydration.md`.

## Logo sizing (header / footer / checkout)

Operators ask to resize the brand logo ("make it smaller/bigger by N%") as a recurring visual tweak. The logo **display size is code-side** — Payload `site-settings.logoUrl` only chooses the image; the rendered size is Tailwind classes + next/image intrinsic props. Sizes were shrunk 25% on 2026-08-08 (chat task, working tree).

| Location | File | Size classes (current) |
|---|---|---|
| Header | `src/components/Header/TopBar.tsx` (~line 73) | `h-auto w-[98px] lg:w-[150px]` (mobile/desktop) |
| Footer | `src/components/Footer/index.tsx` (~line 93) | `h-auto w-[150px]` |
| Checkout | `src/components/Checkout/CheckoutLayout.tsx` (~line 30) | `h-[30px] w-auto sm:h-9` (height-based, 30/36px) |

Constants: `src/lib/site-logo.ts` — `HEADER_LOGO_WIDTH` (150), derived `HEADER_LOGO_HEIGHT = Math.round(W × 69/294)` (native aspect 294×69). `headerLogoUrl()` swaps the default SVG for a light variant on the dark header bar (sizing unaffected); `isSvgLogo()` drives `unoptimized`. CheckoutLayout prefers a Payload `checkoutLogoUrl` override but the same size classes apply.

**Scaling technique (verified 2026-08-08, 25% shrink):** next/image `width`/`height` props are aspect-ratio hints; the Tailwind class controls rendered size. When scaling, change BOTH in sync so the intrinsic ratio stays honest. The 25% math: 200→150 (derived height 47→35), 130→98, checkout `h-10 sm:h-12` (40/48px) → `h-[30px] sm:h-9` (30/36px), checkout intrinsic 160×48 → 120×36 (keeps 10:3). Then verify: `corepack pnpm --filter @apps/storefront typecheck` + scoped biome on the touched files. No unit tests exist for these components; a class-assertion test for a CSS-size change is brittle churn — do not add.

## Medusa product query field discipline

Product list queries balloon badly when they include full image galleries or heavy metadata blobs (`*images`, `*metadata`). On a 2 vCPU host, a `limit=200` call with these fields has caused ~2–3 MB responses and Medusa + Postgres saturation.

**Three field sets — use the right one:**

| Constant | Includes | Use for |
|---|---|---|
| `PRODUCT_LIST_FIELDS` | variants, options, categories, tags, collection, `+variants.thumbnail`, inventory, dates | Catalog cards, shop grid, `listProducts`, `getProductsByIds`, `listProductsByCategoryIds` |
| `PRODUCT_DETAIL_FIELDS` | `PRODUCT_LIST_FIELDS` + `*images` + `*metadata` | PDP only (`getProductByHandle`) |
| `PRODUCT_CATEGORY_ID_FIELDS` | `id,*categories` | Nav category filtering (`listProductCategoryMembership`) |

**Rules:**
- Never put `*images` or `*metadata` in `PRODUCT_LIST_FIELDS` — they belong on PDP only.
- `getProductCategoryIds` fetches up to 200 products to build the nav set; it must use `listProductCategoryMembership` (minimal fields), not `listProducts` (full fields).
- Same discipline applies to the backend `shopCatalog` module: `PRODUCT_FIELDS` in `shop-catalog-service.ts` must not include `images.*`. Catalog cache only needs `thumbnail` and `variants.thumbnail`.
- When adding a field to `PRODUCT_LIST_FIELDS`, ask: *does a catalog card actually render this?* If not, it belongs only in `PRODUCT_DETAIL_FIELDS`.
- `*metadata` is acceptable in `PRODUCT_LIST_FIELDS` only if the metadata key used for list sorting/display (e.g. `sales_count`) cannot be isolated with a `+metadata.sales_count` selector. Otherwise, scope it to `PRODUCT_DETAIL_FIELDS`.

See `references/medusa-product-field-discipline.md` for the concrete implementation.

## Vitest coverage configuration (storefront)

Coverage thresholds live in `apps/storefront/vitest.config.ts`. Current floors — **never lower these**:

| Metric | Floor |
|---|---|
| Lines | 70% |
| Branches | 53% |
| Functions | 68% |
| Statements | 70% |

### Why branches floor is lower

Branch coverage is hard to exhaust in mapper/type-guard code (`mapMedusaProductToProduct`, `shop-filters.ts`, etc.). The other three metrics hold at 70%+ because the tested layer is primarily pure logic. Raise the branch floor as dedicated branch tests land.

### Calibrating `exclude` patterns

The storefront has a **mixed runtime** — pure-logic modules (analytics sanitizers, mappers, money, seo helpers) are unit-testable; everything else depends on Next.js server runtime, browser `window`, Payload CMS, or real HTTP. Wrong exclusions inflate or deflate the aggregate.

**Two-pass approach when coverage drifts or new files appear:**

1. Run `pnpm --filter @apps/storefront test:coverage` and collect the zero-coverage rows from the table output.
2. Classify each zero-coverage file by *why* it can't be tested:
   - **Next.js server runtime** (`'use server'`, `cookies()`, `headers()`) → exclude
   - **Browser/DOM** (React hooks, context, Redux slices, client components) → exclude
   - **Framework entrypoints** (`middleware.ts`, `instrumentation.ts`, `config.ts`, index re-exports) → exclude
   - **CMS/HTTP-bound** (Payload fetchers, Medusa SDK wrappers, cart server actions) → exclude
   - **Pure logic with no test** → write the test, do NOT exclude
3. Add targeted exclusions to `vitest.config.ts` `coverage.exclude[]`.
4. Re-run and confirm thresholds pass.

**Pitfall:** `include: ["src/**/*.ts", "src/**/*.tsx"]` is relative to the package root. Exclude patterns must match that same root — `"src/lib/data.ts"`, not `"apps/storefront/src/lib/data.ts"`.

**Pitfall:** The coverage table truncates long file names (e.g. `...og-routing.ts`). Always resolve the actual path before writing the exclusion: `find apps/storefront/src -name "*og-routing*"`.

**Pitfall:** The storefront Vitest config currently selects `*.test.ts` but not `*.spec.ts`. A passing `pnpm test` does not prove a newly added `*.spec.ts` ran. Either name new unit tests `*.test.ts` or deliberately broaden `include` and verify the test appears in runner output. Do not leave silently excluded tests such as `*.unit.spec.ts`.

**Categories always excluded in this project (no unit tests possible):**

```
# Server-only / Next.js runtime
src/lib/data.ts, src/lib/medusa/cart.ts, src/lib/medusa/client.ts,
src/lib/medusa/customer.ts, src/lib/medusa/order.ts, src/lib/medusa/fulfillment.ts,
src/app/**/*.ts, src/app/**/*.tsx, src/middleware.ts

# Browser/DOM
src/redux/**, src/context/**, src/components/**, src/hooks/**

# Analytics adapters (browser window / GTM / Matomo globals)
src/lib/analytics/matomo.ts, src/lib/analytics/gtm-adapter.ts,
src/lib/analytics/providers/**

# CMS/config
src/lib/cms/payload-client.ts, src/config.ts, src/**/*.server.ts

# SEO (Next.js metadata runtime)
src/lib/seo/metadata.ts, src/lib/seo/catalog-routing.ts, src/lib/seo/blog-routing.ts

# Framework entrypoints
src/**/index.ts, src/instrumentation.ts
```

Run `pnpm --filter @apps/storefront test:coverage` — if thresholds pass clean, the exclusion list is calibrated.

## Store theming / design customization epic

When converting an approved HTML concept into the real storefront, read `references/html-design-to-storefront.md` first. Treat HTML as a design reference, not executable Payload content: inventory sections/tokens/data/interactions, map each section to an exact component or explicit unsupported item, apply approved tokens, compose the full typed block order, then verify the rendered desktop and mobile routes. Do not mix concept inspection, ad-hoc CSS edits, CMS writes, and visual verification in one unbounded turn.

When working on theming, design tokens, Tailwind migration, or the "user designs their store" feature:

1. Load `references/store-designer-epic.md` for product intent and target capabilities.
2. Load `references/design-system-store-designer-migration-audit.md` for the verified storefront inventory, canonical ownership model, token taxonomy, preview workflow, file map, risks, and phased migration method.

**Canonical ownership rules:**

- Keep universal token values in partitioned, app-owned DTCG 2025.10 files in Git; generated CSS, Tailwind aliases, `DESIGN.md`, and Impeccable projections are not independent authorities.
- Payload Store Designer state is draft/proposal state only. The production storefront must continue to read committed source-generated CSS, not a Payload theme global.
- Impeccable is a design-quality/live-feedback aid, not the canonical token source.
- Fox applies operator-approved proposals as path-allowlisted, base-hash-guarded diffs in an isolated worktree. Draft save and Impeccable Accept must never imply commit, push, PR, or deployment.
- The existing `vulpy-agent-cmd-server.py` is dev-lifecycle-only and is not Payload-to-Fox design task ingress; use a separate typed request/outbox boundary.
- For read-only audits, retry broad/truncated searches with narrow literals or a read-only file walker before claiming styles or preview features are absent.

**Design token single source of truth — non-negotiable:**

Design token values must live exclusively in `store.tokens.json` → `generate-design.mjs` → `tokens.generated.css` → git. **Do not route token edits through Payload CMS.** A Payload global creates split state between the DB and the token pipeline — neither is authoritative, changes aren't trackable in git, and the agent can't apply them as a single diff. When an operator wants to change their brand colour, Fox edits `store.tokens.json`, runs the compiler, and commits. See `references/payload-store-theme-integration.md` for the full architectural decision and what was reverted.

**Token-edit mechanics (verified 2026-08-08):**

- `store.tokens.json` (per-store override layer) is **registry-gated**: only paths registered in `design/editor.registry.mjs` / `editor.registry.ts` may appear (brand scale, highlight, `neutral.50`/`neutral.800`, status, fonts, radii). Any other path makes the compiler throw `store.tokens.json registry validation failed`, and the `design:test` suite's "store.tokens.json paths are all registered" test catches it.
- To add a **component-level** token (e.g. `footer.background` for a brand footer surface), edit `design/tokens/component.tokens.json` — universal, git-committed, NOT registry-gated. The compiler emits `--<kebab-path>` plus a `--color-<…>` Tailwind theme alias, so `bg-footer-background` works after regeneration. Do not try to add component paths to `store.tokens.json`.
- Regenerate + validate: `node scripts/design/generate-design.mjs` (writes `src/app/css/tokens.generated.css`, `DESIGN.md`, `.impeccable/design.json`), then `node scripts/design/generate-design.mjs --check`, then `node --test scripts/design/*.test.mjs`. Design tests use **inline documents** (no snapshots of the real token files) — adding tokens won't break them.
- **Brand/surface recipe:** surfaces flow through `reference.color.neutral.50` (muted surfaces — NOT the canvas, which is `neutral.0`) and `reference.color.neutral.800` (body text + inverse surfaces). Keep the page canvas and header white by leaving `neutral.0` alone and only overriding 50/800. CTA banner themes are already token-based: `blue → bg-action-primary-background`, `teal → bg-surface-muted`, `dark → bg-surface-inverse`. Legacy `bg-body` (`#4f4f4f`) still exists in `components/Footer/index.tsx` and `components/Home/Hero/index.tsx` — migrate to semantic tokens when touching those.
- **Verify client-gated components via CSS, not DOM:** the Footer renders inside `SiteLayoutClient` behind a PreLoader loading state, so `curl` of a page shows footer *data* in the flight payload but no `<footer>` tag. To confirm a class change actually compiled, fetch the route's served CSS chunk (`curl http://host.docker.internal:3000/_next/static/chunks/*.css`) and grep for the `.bg-<class>` utility plus the `--<var>: <value>` chain. Dev-served chunks are unminified and rules wrap across lines — grep the token (`.bg-<class>`, `cursor: pointer`) rather than a full-rule regex; see "Tailwind v4 post-migration gotchas" for the exact pitfall.

**Critical dependency order — do not skip this:**

```
Track A: Make it look like a product (MUST ship first)
  A1 → Design direction decision (color system, typography, brand)
  A2 → Tailwind v4 + canonical DTCG 2025.10 tokens + generated CSS/`DESIGN.md` (Epic #48)
  A3 → Component polish (header, cards, PDP, SVG fills)
  A4 → Impeccable CI gate (only useful after tokens are clean)

Track B: Store Design Studio (only after Track A)
  B1 → Deterministic Payload Design Studio + signed CSS-variable draft preview
  B2 → Isolated session worktree/preview lifecycle through narrow `pnpm vulpy designer` commands
  B3 → Remote Impeccable bridge inside the preview iframe
  B4 → Fox classifier + persisted Hermes session/progress
  B5 → Explicit diff approval → commit → optional PR → normal deployment
```

Track B is useless until Track A is done. Giving operators a theme picker on a generic-template storefront doesn't produce a commercial-looking store — it just lets them pick which bad version they want.

**Design debt status (all complete as of 2026-08-08):** Legacy color → semantic tokens (635 replacements), SVG hex fills migrated, `rounded-control/panel/badge` + `z-9999/99999` tokens, Fox in the Box brand applied to `store.tokens.json`, Payload StoreTheme global deliberately reverted (token pipeline is canonical), Header monolith split, Impeccable submodule + CI gate, Tailwind v4 CSS-first migration. Full history in references.

**Impeccable's actual role (source-verified at 3.5.0):**
- It has a real injected browser UI: picker, annotations, generate/steer, variants, coarse parameters, manual edits, accept/discard, durable journal, resume, and cleanup.
- It is plain-DOM/Shadow-DOM browser chrome, **not** a registered web component or standalone store editor.
- Its helper binds loopback and current browser URLs assume `localhost`; remote Vulpy/Fox use requires a signed same-origin relay or an upstream configurable browser base/transport. Never expose the helper port publicly.
- Upstream has no Hermes provider. Install the pinned universal `agents` provider bundle, then use a checked-in Vulpy Hermes adapter skill for instance, tenant, ownership, validation, and no-auto-commit policy.
- Use Impeccable for local component feedback/variants and deterministic anti-pattern detection. Payload owns the Design Studio/session controls; Fox owns feedback classification and source edits; DTCG files own accepted tokens.
- Impeccable **Accept** chooses a session variant only. Commit, PR, and deployment are separate explicit operator actions.

See `references/store-designer-epic.md` for exact installation/protocol boundaries and `references/design-system-store-designer-migration-audit.md` for the storefront inventory and migration map.

**PDP/CMS block token standards** (audited 2026-09-03): `references/pdp-cms-block-token-map.md` — correct token classes for every PDP surface (radii, colors, buttons), FAQ `<details>` accordion pattern, and the removal of the duplicate CMS `productGrid related` block.

**Semantic heading utilities full table:** `references/semantic-heading-utilities.md` — `.h1`/`.h2`/`.h3`/`.h4`/`.eyebrow` values, scope rules, sweep coverage, and brand inverse-weight hierarchy reference.

For the Payload `StoreTheme` global schema, query function, inline `<style>` injection pattern, CSS cascade chain, and neutral nextmerce-clone defaults, load `references/payload-store-theme-integration.md`.

### SVG `fill="currentColor"` migration technique

**Strategy:** monochrome icon → `fill="currentColor"` + `className="fill-current text-<token>"` on `<svg>`; multi-color decorative → `fill="var(--design-color-*)"` on individual paths; `fill="white"` inside coloured shapes → leave as-is. Full playbook: `references/phase1-token-migration-playbook.md`.

**Pitfalls:**
- Multiple SVGs with identical structures will cause `patch` uniqueness failures — include surrounding context to disambiguate
- `replace_all=true` is safe for single-file hex-fill sweeps
- Run `npx biome check --write [file]` after delegation agents land to fix `useSortedClasses` — this fires consistently after Tailwind class batch-patches
- **NEVER `write_file` large components (>200 lines).** `read_file` paginates and `execute_code` stdout caps at 50KB — a partial read + `write_file` silently truncates everything past the cut. Use `patch` for all targeted edits on large files. Truncation symptom: `Expected '</', got '<eof>'` at the last visible line.
- **Verify custom text-size utilities actually exist in `@theme`.** `text-md` was never defined, so card prices rendered at inherited size (the "name/price not balanced" complaint). Use a defined size or an arbitrary `text-[15px]`.
- **"Revert X to the old version" → find the introducing commit first:** `git log -S 'string' -- path` locates it, then restore that markup via `git show <commit>~1:path` (e.g. PLP sort bar reverted from "handcrafted in Britain" to "Showing X of Y products").

### Tailwind v4 migration (completed 2026-08-04)

Full CSS-first migration detail — `@theme` vs `@theme inline`, breaking-change checklist, audit commands, scrollbar plugin replacement, and lockfile approach — is in `references/tailwind-v4-migration.md`.

### Tailwind v4 post-migration gotchas (verified 2026-08-08)

- **TW4 preflight dropped `button { cursor: pointer }`** (v3 had it) — buttons render the default arrow cursor until restored. Global element defaults belong in the existing `@layer base` block in `apps/storefront/src/app/css/style.css` (~line 332, alongside `html`/`body`). `@apply` resolves there because that file imports tailwindcss directly. Proven pattern for "pointer on all buttons":

  ```css
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    @apply cursor-pointer;
  }
  ```

  Keep the `:not(:disabled)` guard so disabled controls keep the default cursor.
- **Dev-served CSS chunks are unminified and multiline — verify with a token grep, not a full-rule regex.** A single-line match for a whole rule (e.g. `button:not(:disabled), [role="button"]:not(:disabled) { ... }`) fails even when the rule compiled: the served CSS keeps spaces (`cursor: pointer;`, NOT `cursor:pointer`) and selector lists/declarations wrap across lines. Grep for the distinctive token or dump context by byte offset:
  - `grep -oE 'cursor: ?pointer' chunk.css`
  - `grep -bo 'cursor' chunk.css` → `dd if=chunk.css bs=1 skip=<off> count=90` to read the surrounding rule
  - `@layer base` custom rules are emitted unconditionally (never tree-shaken), so their absence from a chunk is a real signal; their presence with wrapped selectors is normal.

## pnpm workspace wiring for in-repo tools

When an in-repo package (e.g. a local CLI tool like Impeccable) needs to be a `workspace:*` dep rather than an npm download:

### Steps
1. Add the package directory to `pnpm-workspace.yaml` packages list.
2. Change the dep specifier in all relevant `package.json` files from `"3.5.0"` → `"workspace:*"`.
3. If the package has its own `.git` (a checked-out repo), register it as a **git submodule** (`git submodule add --force <url> <path>`) instead of staging it as a plain directory — otherwise the entire tree gets staged as 7000+ files.
4. Add `submodules: recursive` to any CI `actions/checkout@v4` step that needs the submodule content.
5. Point scripts at the local binary with an explicit `node <path>/cli/bin/cli.js` — don't rely on the `.bin` symlink being writable in the container (host-owned `.bin` dirs block `pnpm install --frozen-lockfile` from recreating them).

### Lockfile surgery when switching npm → workspace:*
When you can't do a clean `pnpm install` (bind-mount `.bin` ownership blocks it), patch the lockfile manually:

```yaml
# importers section — root or per-app
impeccable:
  specifier: workspace:*
  version: link:impeccable          # relative path from workspace root

# Remove the npm resolution block (packages section)
# Remove the npm snapshot block (snapshots section)
```
Find both blocks with `grep -n 'impeccable@' pnpm-lock.yaml` and delete them. Validate with `python3 -c "import yaml; yaml.safe_load(open('pnpm-lock.yaml'))"`.

### Lockfile surgery when upgrading npm dependencies (version bump)
When `package.json` specifiers change (e.g. TW3 → TW4) and `pnpm install` is blocked by bind-mount ownership:

1. **Resolve the real version** in a writable temp directory:
```bash
mkdir /tmp/dep-probe && cat > /tmp/dep-probe/package.json << 'EOF'
{ "name": "probe", "version": "0.0.1", "private": true,
  "dependencies": { "tailwindcss": "^4.1.18", "@tailwindcss/postcss": "^4.1.18" } }
EOF
export COREPACK_ENABLE_STRICT=0
cd /tmp/dep-probe && /usr/lib/node_modules/corepack/shims/pnpm install --ignore-scripts
cat /tmp/dep-probe/pnpm-lock.yaml
```

2. **Extract and insert** new `packages:` and `snapshots:` blocks from the probe lockfile into the main one. **Do the entire operation in a single `execute_code` call** — variables do not survive between sandbox invocations (`NameError` on second call if you split).

```python
import re

probe_lock = open("/tmp/dep-probe/pnpm-lock.yaml").read()
main_lock  = open("/app/workspace/pnpm-lock.yaml").read()

def extract_top_level_blocks(text, section_name):
    start = text.find(f"\n{section_name}:\n")
    if start == -1: return {}
    rest = text[start + len(f"\n{section_name}:\n"):]
    end_match = re.search(r'\n^[a-zA-Z]', rest, re.MULTILINE)
    section_body = rest[:end_match.start()] if end_match else rest
    blocks = {}
    entry_re = re.compile(r"^  (?:'([^']+)'|(\S[^:]*)):\n((?:    [^\n]*\n)*)", re.MULTILINE)
    for m in entry_re.finditer(section_body):
        key = m.group(1) or m.group(2)
        blocks[key] = m.group(0)
    return blocks

probe_pkgs  = extract_top_level_blocks(probe_lock, "packages")
probe_snaps = extract_top_level_blocks(probe_lock, "snapshots")

def in_main(key):
    return f"'{key}':" in main_lock or f"  {key}:" in main_lock

new_pkgs  = {k: v for k, v in probe_pkgs.items()  if not in_main(k)}
new_snaps = {k: v for k, v in probe_snaps.items() if not in_main(k)}

snap_pos = main_lock.find("\nsnapshots:\n")
if new_pkgs:
    main_lock = main_lock[:snap_pos] + "\n" + "".join(sorted(new_pkgs.values())) + main_lock[snap_pos:]
if new_snaps:
    main_lock = main_lock.rstrip("\n") + "\n\n" + "".join(sorted(new_snaps.values()))

with open("/app/workspace/pnpm-lock.yaml", "w") as f:
    f.write(main_lock)
```

3. **Update the importer block** in the same call — replace old specifier+version, remove dropped deps (e.g. `autoprefixer`, `tailwind-scrollbar`). Leave orphaned `packages:`/`snapshots:` entries alone — other workspace packages may reference them.

4. **Verify** the importer with:
```bash
awk '/^  apps\/storefront:/{f=1} f && /^  [a-zA-Z@]/ && !/^  apps\/storefront:/{exit} f{print}' pnpm-lock.yaml | head -60
```

### .pnpm-store staging trap
If `store-dir` is not set in `.npmrc`, pnpm places its content-addressable store inside the workspace root at `.pnpm-store/`. On a `git add -A` this stages thousands of blob files. Fixes:
1. Add `.pnpm-store/` to `.gitignore` immediately.
2. Add `store-dir=~/.pnpm-store` to `.npmrc` so future installs go outside the workspace.
3. Use `git reset HEAD -- .pnpm-store/` to unstage any already-staged blobs.
4. Always use targeted `git add -- <file1> <file2> ...` (not `git add -A`) for agent commits to avoid this trap.

## `next/font/google` pitfalls

### `axes` parameter breaks variable fonts that are variable by default

Sora, Manrope, Inter, and most Google variable fonts already expose the `wght` axis without needing `axes: ["wght"]`. Passing `axes` to a font that doesn't declare optional axes in its metadata causes a TypeScript error and crashes the dev server:

```ts
// ❌ Breaks — Sora/Manrope have no optional axes
const sora = Sora({ subsets: ["latin"], axes: ["wght"] });

// ✅ Works — variable weight works by default
const sora = Sora({ subsets: ["latin"], display: "swap", variable: "--font-sora" });
```

**When to use `axes`:** Only for fonts that have optional *non-weight* axes (e.g. `Inter` has `opsz` as optional; `Recursive` has `slnt`, `CASL`, `CRSV`, `MONO`). Check the font's page on fonts.google.com — if it only shows a weight slider, `axes` is unnecessary and harmful.

**After any font swap in `layout.tsx`:** immediately run `pnpm typecheck` — font config errors crash the entire app (every route).

## Cross-tenant storefront merge / upgrade audits

When the operator asks to port a tenant's storefront or a demo repo into `main` ("upgrade the
storefront to the version HF has", "move padelbaza's fixes into the template"): treat it as a
**two-way merge with `main` as base**, not a wholesale replace — tenant forks often have zero remotes
and *lack* main's newer checkout/Stripe/security infra while being ahead on design. Classify the
divergence by hashing both `apps/storefront/src` trees, verify that a claimed tenant "fix"/behaviour
actually exists in code (a re-labelled button is not a real backend flow), seek configurable vs
hard-wired before writing env names, and run the merge in an isolated worktree. Full methodology, the
fixed-header gotcha, and scoping questions: `references/cross-tenant-storefront-merge.md`.

### Working directly in a customer repo (not the Vulpy template)

When the operator asks for changes to a live customer store's OWN repo (e.g. `bsgdigital/padelbaza`,
a separate private repo with its own deploy pipeline — NOT the Vulpy checkout), the operating model
differs from the worktree factory:

- **Repo model:** own default branch (`padelbaza`), own CI (`deploy-demo.yml` → build medusa +
  storefront images → push to GHCR → scp to VPS → `git reset --hard origin/padelbaza` in
  `/opt/padelbaza` → compose up → migrate → smoke). Pushing to the default branch IS the deploy.
- **No agent SSH:** the VPS ssh key lives as a GitHub Actions secret (`DEMO_SSH_KEY`), not in the
  Hermes container. Verify with an SSH probe before claiming you can fix the box; if everything is
  rejected, the remote is out of your hands — report what the action logs show and what the operator
  must run.
- **Working copy:** `/tmp/<repo>` clone + a git worktree is the right pattern (fresh `node_modules`
  needed; `pnpm install` may need `--ignore-scripts` after a prepare-script EACCES).
- **Shallow-clone history trap (verified 2026-08-27, padelbaza):** a default `git clone` (depth 1)
  makes `git log -- <path>` return a single commit even when the file has deep history — you cannot
  answer "was this already done in this repo?" from a shallow clone. Before trusting path history,
  run `git fetch --unshallow origin` (or check `git rev-parse --is-shallow-repository` first).
  Otherwise you'll mis-attribute the work or "rediscover" an already-shipped feature.
- **Key-rejected ≠ locked out — offer the public key (verified 2026-08-27):** when the `remote` tool
  fails with "All SSH keys rejected", the box may simply not carry the demo key yet. Give the operator
  the exact one-liner with the container's public key (`cat ~/.ssh/id_ed25519_demo.pub`) instead of
  declaring the box out of reach. The operator may add it mid-task, after which the same
  `return ~/.ssh/id_ed25519_demo` (or the gateway key) works. This is the difference between waiting
  on a human and finishing a deploy.
- **Commit identity:** the repo may have no local git identity; match the repo's historical
  `git config user.name/user.email` (e.g. `bsgdigital` / the noreply email) rather than inventing one.

### Deploy observation workflow (push = deploy)

1. Push the branch to the repo's default branch.
2. `gh run list --repo <owner>/<repo> --limit 3` to get the run id for your SHA.
3. `gh run watch <id> --repo <owner>/<repo> --interval 20` — expect it to outlive the terminal
   timeout; poll `gh run view <id> --json status,conclusion,jobs` instead.
4. Separate the layers when a job fails: `gh run view <id> --log-failed` and grep for the REAL error
   (build failures surface as `Turbopack build failed with N errors`; deploy failures surface further
   down in the `Deploy on VPS` step — grep past install noise like `postinstall`/`debconf`).
5. Classify honestly: is it code (build error), transport (image copy), or infra (VPS disk full —
   `no space left on device` during `docker load` extraction)? The old container usually stays
   serving while the new one fails to start; verify with a `curl` of the live site and say the site
   is unaffected.
6. For infra blockers: if the operator adds your SSH key, fix the box yourself (see below), else hand
   the operator the exact commands and offer to re-watch the rerun.

### VPS disk-full deploy recovery — surgical, keep live + new images (verified 2026-08-27, padelbaza)

Symptom: the GitHub deploy fails at the `Deploy on VPS` step with
`apply layer error …: no space left on device` DURING `docker load` extraction — the images copied
fine, the box just can't extract them. The live site keeps serving from the OLD container.

**Do NOT run `docker system prune -af` first.** That wipes ALL unused images INCLUDING the
just-loaded `:newsha` images the deploy needs to start. Recover surgically:

1. **Inventory:** `docker ps` (running containers), `docker images` filtered to the app, `docker
   system df`. A long-running demo box accumulates a tagged image pair (~5GB medusa + ~5GB
   storefront) PER DEPLOY — dozens of old tags are the 100+GB hog.
2. **Keep exactly two tags:** the currently-running image SHA and the new `:newsha` the failed deploy
   loaded. Remove every other app tag:
   ```bash
   KEEP="<currsha> <newsha>"
   for tag in $(sudo docker images --format '{{.Repository}}:{{.Tag}}' | grep '^ghcr.io/<owner>/<repo>-.*:' | sed 's/.*://'); do
     echo "$KEEP" | grep -q "$tag" || sudo docker rmi "ghcr.io/<owner>/<repo>-medusa:$tag" "ghcr.io/<owner>/<repo>-storefront:$tag"
   done
   ```
   `docker rmi` on 12+ large images can outlive the SSH tool cap — the process KEEPS RUNNING; probe
   with a fresh command (`ps aux | grep -c '[d]ocker rmi'`, `df -h /`) and poll until it drains.
   This took a 99%-full (2.6G free) box to 49% (79G free) without touching anything live.
3. **Prune build cache** (`sudo docker builder prune -f`, ~12GB) to get to ~40%.
4. **Re-run the workflow** (`gh run rerun <id>` or push a no-op) and watch it through the `Deploy on
   VPS` step. Verify the new SHA is actually running:
   `sudo docker ps --format '{{.Names}} {{.Image}}'` and the smoke/`curl` of the live site.
5. Optional later: spare older tags whose image IDs are unique can be removed with plain
   `docker rmi <id>` — prefer keeping the known-good live tag over chasing the last 35GB.

### Delivery phase — merging into a moved-and-dirty primary (verified 2026-08-26)

Execution ran as factory task-series briefs in `/data/state/worktrees/wt-<name>`, one vertical slice per brief (each carries: worktree path, preceding commit SHAs, anti-goals "do NOT regress X", gates, and "commit locally authorized, never push"). The endgame merge hit three real walls:

1. **Main moved since branch base AND carries live agent-curator skill edits.** Overlap check FIRST: `git diff --name-only <base>..main -- apps/` vs the branch's app files → zero overlap = safe. Then merge `origin/main` INTO the branch worktree first (clean tree there) so drift resolves where you have full context; the primary stays untouched until the end.
2. **Stat-dirty skill file blocks the primary merge.** A file with worktree ≠ index (curator wrote to disk without staging) shows NOTHING in `git status`, and `git stash` says "No local changes" — but `git merge` refuses with "local changes would be overwritten". Prove it: `diff <(git cat-file -p :<path>) <path>`. Fix: `mv <path> /tmp/`, merge cleanly, then 3-way resolve. Note `git restore --source=:0` / `git checkout HEAD -- <path>` can fail with bogus "did not match any file(s)" on these skill paths; `mv` + re-add works.
3. **3-way resolve conflicted docs keeping BOTH sides when complementary:** `git cat-file -p <base>:<path>` > base; merged-branch version > branch; primary copy > primary; `git merge-file -p primary base branch`; when the two sides are different sections of the same doc (curator docs vs branch docs rarely overlap semantically), concatenate both sides in the conflict block. Verify every expected section marker is PRESENT before committing.

Also shipped this delivery:

- **Merge landed ≠ results visible: run the seeds, then re-probe data state.** After delivering a branch that adds seed scripts/CMS content, the shop still shows the OLD catalog/homepage until Payload seed + demo-catalog seed run. From inside Fox these hit three loopback traps (seed polls `localhost`, `resolveBaseUrl()` prefers `.tmp/dev/status.json`'s `127.0.0.1:<port>`, Medusa `DATABASE_URL=localhost`) — fixes + fetch-shim runner in vulpy-commerce-operator → `references/cross-env-reads.md`. Verify with Store API handle query + homepage marker grep before reporting done. Late-generated assets must be copied into the PRIMARY checkout's `public/` (worktree copies are not served).
- **Turbopack rule:** `"use server"` modules must export ONLY async functions (see Known wiring pitfalls above). Production build as a release gate is what caught it.
- **Demo catalog seeding pattern:** pure data module (`demo-catalog.ts`) separate from runner script; every product stamped `metadata.demo_catalog = true`; npm scripts `seed:demo` / `strip:demo`; lookup-before-create everywhere; variant images as stable public paths with graceful placeholder fallback so seeding never fails on missing assets. TDD the wiring (test asserts each variant has an imageFile → red → wire → green). Imagery generated via the Vulpy gateway's `vulpy-image` alias — see vulpy-commerce-operator → `references/vulpy-image-generation.md`.
- **Env switches shipped:** `PRICE_GATE_MODE=off|login|quote` (default off; backward-compat: unset + `REQUIRE_LOGIN_FOR_PRICES=true` ⇒ login); `ENABLE_VARIANT_URLS` planned default-off for per-variant URLs (Pro candidate). Live envs carrying an old `SITE_NAME` must be updated before rollout or the homepage smoke gate fails.
- **corepack pnpm shim corruption:** `/app/.cache/node/corepack/v1/pnpm/<ver>/bin/pnpm.cjs` can become a shell shim (`#!/bin/sh exec node …dist/pnpm.cjs`) that Node then tries to execute as JS → `SyntaxError: Unexpected identifier 'node'` from husky/lint-staged and every pnpm invocation. Fix: replace bin/pnpm.cjs with a copy of `dist/pnpm.cjs` (the real JS bundle) + chmod +x, or invoke `node …/dist/pnpm.cjs` directly.

## Git commit discipline — never `git add -A` on large working trees

### The 718-file junk drawer lesson

`git add -A` on a repo with accumulated untracked files (agent scaffolds, embedded repos, caches, scratch research) produces an unreviewable mega-commit that needs to be reverted and split.

**Rules:**
1. **Always categorize before staging.** Run `git status --short | wc -l` first. If >20 files, categorize into logical groups before any `git add`.
2. **Stage by path, not blanket.** `git add apps/storefront/design/ .hermes/plans/` — never `git add -A` or `git add .` in this repo.
3. **One concern per commit.** Design tokens, skills, component fixes, infra changes = separate commits.
4. **Check for embedded repos.** `git status` warns about them — never stage directories with their own `.git`.
5. **Skip junk.** `.curator_backups/`, `__pycache__/`, scratch research, third-party clones — leave untracked or `.gitignore` them.

**Recovery when you've already committed a junk drawer:**
```bash
git reset --soft HEAD~1   # undo commit, keep changes staged
git reset HEAD .          # unstage everything
# Now selectively stage and commit in logical groups
```

**Recovery when revert-and-split is needed (commit already pushed/shared):**
```bash
git revert --no-commit HEAD   # apply inverse
git reset HEAD .              # unstage the revert
# Selectively re-add what belongs, commit in groups
# The reverted files are deleted on disk — copy back from live store if needed
```

## Payment provider architecture

For the full pattern covering Stripe integration, Hyperswitch migration plan, NEXT_REDIRECT re-throw rule, state machine, analytics dedup, and environment variables, see `references/payment-provider-architecture.md`.

### Checkout form UX contracts (layout, required fields, US state dropdown, error surfacing, auto-init, order-display sync)

Operator requirements locked in 2026-08-19: email is always required; State
renders as a 50-state+DC dropdown when country is US (shipping + billing);
coupon/delivery/payment stack under the order totals in the right column on
desktop; failed payment-session init must toast + dispatch CONFIRM_ERROR, never
silently return; PaymentElement loads BEFORE Pay click and renders inside the
selected Stripe provider card. When adding a new form field, check
`references/checkout-to-order-sync.md` for the display components that must be
updated in the same PR. See `references/checkout-form-ux-patterns.md` for the
exact components, classes, and the silent-failure bug history.

### Current: Stripe direct integration

Task 4–7 of the checkout epic implement Stripe as the sole payment provider. Key design rules:

- **`lib/stripe.ts` singleton** — `stripePromise` from `apps/storefront/src/lib/stripe.ts`. All components import from there. No inline `loadStripe()` in components.
- **`PaymentElement` not `CardElement`** — use `<PaymentElement />` (from `@stripe/react-stripe-js`). It auto-renders card, wallet, etc. from the client secret. `CardElement` is legacy.
- **`confirmPayment` not `confirmCardPayment`** — use `stripe.confirmPayment({ elements, confirmParams: { return_url: ... }, redirect: 'if_required' })`. `redirect: 'if_required'` keeps synchronous card flows in-page; only 3DS/wallets redirect.
- **`return_url` MUST point to `/order/payment-return`**, NOT `/order/confirmed`. The `payment-return` route handles post-redirect polling for 3DS and APM flows. `/order/confirmed` is not a redirect handler — any redirect-based payment method (3DS, PayPal, etc.) will 404 if `return_url` points there. Critical: this is dormant for standard synchronous cards but breaks silently the moment 3DS or any redirect APM is enabled. (Verified by code-reviewer, Aug 2026, checkout epic Task 7.)
- **Initialize payment session only after prerequisites settle** — don't call `initiatePaymentSessionAction` on mount. Wait until shipping address + shipping method + non-zero cart total are all set. Track `paymentSessionReady` state and render `<Elements>` only when `clientSecret` is set. Use primitive prerequisite dependencies, a short debounce (for example ~300 ms), and a ref containing the current initialization key/in-flight promise. The guard must cover rerenders and React Strict Mode, and the key should include cart id, selected provider, shipping method, total, and required address fields so typing does not create duplicate sessions.
- **Stripe panel placement and Pay-button lifecycle** — render `<PaymentElement>` inside the selected Stripe provider card's existing visual panel, alongside its provider icons; never append a standalone payment block below all providers. Gate `<Elements>` and the nested `<PaymentElement>` on the same `paymentSessionReady && clientSecret` condition. Once the session is ready, the Pay control should remain a `type="button"` path so native form validation does not scroll the user away from the visible payment form; keep all required attributes and preserve the save-details-before-confirm flow. Do not gate the ready Pay button on an unrelated initial state-machine step that is only reached by the old click-to-initialize path.
- **Stale session on cart mutations** — any cart total change (add/remove item, apply/remove promo) must set a `paymentSessionStale` flag, disable the Pay button, and trigger re-initialization. A stale session with the wrong amount is a payment correctness bug.
- **Gate `<Elements>` and `<PaymentElement>` on the same flag** — `<Elements>` and its child `<PaymentElement>` must both use the same `paymentSessionReady && clientSecret` condition. If `<PaymentElement>` gates on a different condition (e.g. `paymentSession` from an older cart field), it can mount outside the `<Elements>` context and throw a Stripe SDK error on first load.
- **`placeOrderAction` must return `{error}` not throw** — wrap `sdk.store.cart.complete` in try/catch. Re-throw Next.js redirect errors (`digest.startsWith("NEXT_REDIRECT")`). Return `{ error: string }` for all other failures. Never throw to the client — the pay button should toast the error, not crash.
- **`payment_success` analytics must fire AFTER order confirmation** — emit `trackCustomEvent("Checkout", "payment_success")` only after `placeOrderAction` returns without `{ error }`. Firing before the error check means failed payments are counted as successes in Matomo. Pattern:
  ```ts
  const result = await placeOrderAction(...)
  if (result && 'error' in result) { toast.error(result.error); return }
  if (hasAnalytics) trackCustomEvent("Checkout", "payment_success", "stripe")
  ```
- **`placeOrderAction` non-order result** — if `cartRes.type !== 'order'` after `cart.complete`, return a user-facing error (`"Order could not be completed. Please try again."`). After narrowing past `type === 'order'`, the ternary `cartRes.type === 'cart' ? ... : ...` becomes dead code and causes a TS narrowing error. Replace with a single constant error string.

### Future: self-hosted Hyperswitch (issue #140, blocked by #3 + #139)

Once the Stripe epic ships, the plan is to replace Stripe-direct with self-hosted **Juspay Hyperswitch** for multi-provider support (PayPal, Klarna, etc.). This is a **deliberate architectural evolution**, not a parallel path:

- Backend: `@juspay-tech/medusa-custom-payments` replaces `medusa-stripe` as the Medusa payment provider. Single plugin, 100+ processors via Hyperswitch connectors.
- Storefront: `@juspay-tech/medusa-custom-payments-react` replaces `<PaymentElement>` with `<HyperswitchPayment>` — unified React component that renders provider-specific UI internally.
- Self-hosted only (no Hyperswitch Cloud) — processor keys managed via Infisical (#139).
- Migration: Stripe becomes a Hyperswitch connector; no parallel code paths needed.

**Don't add per-provider storefront components** (separate PayPal SDK, separate Klarna.js, etc.) — that's the wrong architecture. Wait for Hyperswitch instead.

## Stripe key architecture (two keys, two purposes, one source of truth)

Stripe integration requires two **separate** keys that must never be confused or swapped:

| Key | Value prefix | Who uses it | Source |
|---|---|---|---|
| `STRIPE_API_KEY` | `sk_test_…` / `sk_live_…` | **Medusa backend only** — server-side, creates payment intents | `apps/medusa-backend/.env` (dev), `deploy/.env` (prod) |
| `NEXT_PUBLIC_STRIPE_KEY` | `pk_test_…` / `pk_live_…` | **Storefront only** — client-side, loads Stripe.js | `apps/storefront/.env` (dev), `deploy/.env` (prod) |

**Source of truth for prod: `deploy/.env`** — `generate-deploy-env.sh` reads `STRIPE_API_KEY` and injects it into the Medusa container; `NEXT_PUBLIC_STRIPE_KEY` is baked into the storefront image at build time.

**They are not "synced" — they are a matched pair.** Both must come from the same Stripe account **and** the same mode (test vs live). Mixing modes (e.g. `sk_live_…` + `pk_test_…`) causes auth failures at payment confirmation.

**No file editing needed by the operator:** Fox can set both keys on request — operator provides the key values in chat, Fox writes them to the correct env files and triggers a storefront rebuild. For new installs, add `--stripe-secret-key` / `--stripe-publishable-key` flags to the bootstrap wizard so both are collected together and can never be set from mismatched modes.

**Future: self-hosted Infisical (issue #139)** — the long-term plan replaces manual env file editing with a self-hosted Infisical vault. Secrets (Stripe keys, etc.) will be stored in Infisical and injected at process start via `infisical run -- pnpm dev`. Fox gets a machine identity token so it can set secrets autonomously. Don't build admin UI for managing Stripe keys — secrets management belongs in a vault, not a database. Stripe's own dashboard handles key rotation.

**`lib/stripe.ts` singleton:** the storefront exports a `stripePromise` singleton from `apps/storefront/src/lib/stripe.ts`. All components must import from there — no inline `loadStripe()` calls in components. The singleton returns `null` when `NEXT_PUBLIC_STRIPE_KEY` is empty (local dev without Stripe configured).

### Validating Stripe keys before e2e (2026-08-19)

Before any Stripe e2e or payment-session work, validate the ACTUAL keys from the
env files — never reconstruct them from session history/transcripts (keys are
redacted in env dumps and chat, and a key rebuilt from memory can silently be
the wrong key — e.g. the publishable key copied into the secret slot, which
Stripe rejects with `Invalid API Key provided`). Read the live value and probe:

```bash
# secret key (server-side): /v1/balance requires the SECRET key
curl -s -m 10 https://api.stripe.com/v1/balance -u "$(grep '^STRIPE_API_KEY=' apps/medusa-backend/.env | cut -d= -f2-):" | head -c 120
# → {"object":"balance","available":[...]} = valid; {"error":{"message":"Invalid API Key..."}} = wrong key
```

Note: the dev backend runs from `/app/workspace` (bind mount), NOT from
worktrees — validate and patch the shared checkout's env files. Worktree env
files are gitignored copies (see "Worktree env files" pitfall above).

### Medusa Stripe authorizes without webhookSecret (verified 2026-08-19)

`@medusajs/medusa/payment-stripe` (v2.13): `authorizePayment` → `getPaymentStatus`
→ `stripe.paymentIntents.retrieve(id)` reads the PaymentIntent LIVE from Stripe.
A client-confirmed PI (`confirmPayment` with `redirect: 'if_required'`) already
has status `succeeded`, so `cart.complete()` authorizes WITHOUT a configured
`webhookSecret` in `medusa-config.ts`. The webhook is only needed for async
capture/refund reconciliation, not for the success-path e2e. `webhookSecret` is
currently NOT set in `medusa-config.ts` (only `apiKey` is passed) — fine for
dev/e2e, required for capture events in production.

### Checkout e2e execution discipline — disposable promotions and honest gates

For payment/coupon e2e, inventory the stack and capabilities before writing or firing tests: validate the actual Stripe secret from the env file against `/v1/balance`, verify the publishable key and fixture product, inspect the existing specs' assertions, and confirm the dev-stack browser/proxy path. Do not reconstruct secrets from chat history or claim an e2e flow passed from unit/typecheck evidence.

Never put test coupon codes in the normal product seed. Real operators forget to remove fixtures, and a seeded discount can silently alter manual checkout results. Keep the fixture product seed product-only; create a uniquely named promotion in a disposable test helper before the coupon suite and delete it in `afterAll`/finally. Verify both lifecycle operations independently. A test helper must parse its explicit mode robustly when invoked through `medusa exec` (CLI arguments may be prefixed), and cleanup must run even when an assertion fails.

Separate test classes clearly:
- **Browser/manual card flow:** the operator enters Stripe test cards in the hosted PaymentElement/iframe; use this for final visual/payment confirmation.
- **Server-side emulation:** use Stripe test-mode PaymentIntent helpers/API to produce success and decline states, then exercise Medusa's live `authorizePayment`/cart-complete path. This validates backend outcome handling without pretending it validates the browser card iframe.
- **Coupon flow:** assert valid code → applied code + discount total; invalid code → inline error + no discount. Remove the temporary promotion after the run.

Existing structural tests are not payment tests. A Stripe iframe-visible assertion proves only session initialization. Before calling checkout e2e complete, require separate evidence for success, declined payment, valid coupon, invalid coupon, and cleanup. If a test fails, classify it first as app behavior, stale locator/accessibility contract, browser hydration/proxy transport, or fixture/data setup; fix the correct layer rather than masking it with broad waits or claiming infrastructure is the product bug.

The reusable investigation and disposable-promotion recipe is in `references/checkout-payment-e2e-gap-checklist.md`; the live dev proxy recipe is in `references/playwright-dev-stack-e2e.md`.

### Checkout Stripe UX: initialize before submit, compose the payment panel

When an operator reports that clicking Pay scrolls to the first required field and only then inserts Stripe UI, treat it as two separate defects: payment-session initialization is submit-gated, and `PaymentElement` is mounted outside the selected provider card. Fix both at the component boundary:

1. Initialize the session after valid address + shipping + non-zero total prerequisites settle, using a short debounce keyed by cart/provider/shipping/required address values plus an in-flight ref. Do not fire on every keystroke or duplicate under Strict Mode.
2. Render `PaymentElement` inside the selected Stripe provider's existing visual card, below its label/icons; remove the standalone sibling block. Keep `<Elements>` as the ancestor and keep COD unchanged.
3. Preserve native required-field validation and the save-details-before-confirm flow. The user should see the card UI before pressing Pay; Pay should confirm, not reveal the form.
4. Verify the actual served page visually before broad tests. Run focused component tests, scoped Biome, storefront typecheck, then the checkout e2e suite. Report exact pass counts; never claim visual/payment completion from unit tests alone.

This was learned from a checkout run where tests were fired before the live fix was verified and the operator saw the old layout. The user's preferred workflow is fix root cause on dev first, then test; disposable coupon fixtures must never enter normal seed data.

## Live changes

Do not edit live runtime files as the primary development workflow. Implement and verify in source/dev, then use the approved deployment process. Never deploy to live without explicit approval.

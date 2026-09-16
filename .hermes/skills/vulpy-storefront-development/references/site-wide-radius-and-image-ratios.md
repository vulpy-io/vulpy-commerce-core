# Site-wide radius zeroing + unified image ratios (verified 2026-08-11, Hector Finch demo)

## Site-wide 0 border radius — three-layer recipe

A "0 border radius site-wide" request must NOT be done by editing every component.
~289 `rounded-*` usages collapse into three layers:

1. **Token layer** — semantic classes `rounded-control/panel/badge/product-card` (~56 usages):
   - Zero the radii in `design/themes/store.tokens.json` → `reference.radius.{control,panel,badge,md,lg}` = `{value: 0, unit: "px"}`.
   - `store.tokens.json` is registry-gated: only `reference.radius.control/panel/badge` are
     pre-registered in `design/editor.registry.mjs` AND `design/editor.registry.ts`
     (keep both in sync — the design:test suite asserts registry parity).
     **Register `reference.radius.md` (product cards/media frames) and `reference.radius.lg`
     (overlays) before overriding them** — copy the existing entry shape
     (`type: "dimension"`, `scope: "brand"`, `operatorVisible`).
   - Regenerate: `node apps/storefront/scripts/design/generate-design.mjs`, then
       `--check`, then `node --test apps/storefront/scripts/design/*.test.mjs` (10 tests,
       fast). Generated CSS must show
     `--design-radius-*: 0px` and `--product-card-radius: 0px`.
2. **Tailwind scale layer** — literal `rounded-sm/md/lg/xl/2xl/3xl/4xl` (~230 usages,
   ZERO class edits needed):
   - In `src/app/css/style.css` `@theme`, add `--radius-xs: 0px; --radius-sm: 0px;
     --radius-md: 0px; --radius-lg: 0px; --radius-xl: 0px; --radius-2xl: 0px;
     --radius-3xl: 0px; --radius-4xl: 0px;`. Every literal utility compiles to
     `border-radius: var(--radius-md)` etc., so zeroing the vars squares the whole site.
   - **`rounded-full` stays circular automatically**: TW4 inlines the value — served CSS
     shows `.rounded-full { border-radius: 3.40282e38px; }` (no `--radius-full` var is
     emitted, so overriding it in @theme is NOT what keeps circles — it's inlined).
     Keep circles for functional elements (radio indicators, preloader spinner, nav
     indicator dot, cart-count badge, range-slider thumbs, avatars, close buttons).
     If the user wants those square too, add `--radius-full: 0px` + avatar sweep.
3. **Literal sweep** — arbitrary values bypass the vars; replace with `rounded-none`:
   `rounded-r-[5px]`, `rounded-l-[5px]`, `rounded-[11px]`, `rounded-r-md`.
   2026-08-11 hits: `ShopWithSidebar` mobile filter tab (`rounded-r-md`),
   `Header/ProductSearchTypeahead` ×2 (`rounded-r-[5px]`), `.select-selected` +
   `.custom-select-dark .select-selected` in `style.css` (`rounded-l-[5px]`), hero +
   product carousel pagination bullets (`rounded-[11px]`), `async-gallery.css` dots
   (`border-radius: 50%` → 0).

**Verify via served CSS chunk** (dev): curl the page, grep the `/_next/static/chunks/*.css`
for `--radius-md: 0px`, `--design-radius-control: 0px`, `--product-card-radius: 0px`,
and `.rounded-md { border-radius: var(--radius-md) }`. The root CSS chunk name is
stable in dev (`%5Broot-of-the-server%5D__<hash>._.css`).

## Image ratios in this catalog

- Product variant images (`variant.metadata.image_url`): **square 1400×1400**.
- Category collection images (`metadata.image_url`): **1400×1636 (6:7)**.
- Unified editorial ratio = `aspect-[6/7]` (exact for 1400×1636; square sources crop
  or letterbox inside it). Applied to: product cards (`Common/ProductItem.tsx`),
  PDP gallery main + thumbs (`ShopDetails/ProductDetails.tsx`), category cards
  (`Home/Categories/SingleItem.tsx`).
- `object-cover` for full-bleed (square sources lose ~7% each side); `object-contain`
  letterboxes against the media background. User chose cover (2026-08-11).
- Keep `next/image` intrinsic props honest: 400×467 for cards/main (6:7), 60×70 thumbs.

## Probes that make this quick

- **JPEG dimensions from signed CDN URLs** (servd `optimise2.assets-servd.host`): read
  ~8KB, scan for SOF markers (0xFFC0–0xFFCF), unpack `>HH` at offset +5. Do NOT rewrite
  the signed `s=`/`dm=` query params (401).
- **Client-rendered components don't appear in server HTML**: the shop grid, PDP
  gallery, and home product carousels are client components — their className strings
  live in the JS bundles, not the HTML. To verify a class change there: fetch the route
  HTML, collect `/_next/static/chunks/*.js`, grep the chunks for the literal class
  string; count occurrences across chunks (shared components chunk + per-route chunk)
  and reconcile against the expected number of source spots. Dev chunk content updates
  in place (stable name), so re-fetch after the compile.

## Scope discipline (user-corrected 2026-08-11)

"Let's do the same on <page>" means: the SHARED component should render the same design
wherever it appears — NOT "add a new section to that page". Adding a whole
"Browse by Category" grid to category pages got reverted immediately ("revert category
page changes, just the single item should change"). When in doubt, change the shared
card/component only and confirm before adding page-level sections.

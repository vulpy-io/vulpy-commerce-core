# Editorial Register PLP — top-level category landing ("The Register", WS1)

Implemented 2026-08-11 per `.hermes/plans/2026-08-11_231333-editorial-plp-pdp-register.md` +
`.design-specs/plp-editorial-b.html`. Replaces the standard `ShopWithSidebar` listing on clean
parent-category URLs (page 1, no query params, no CMS blocks) when the category has >= 2
product-bearing children. Leaf categories keep `ShopWithSidebar`.

## Files

- `src/lib/medusa/register-model.ts` — pure, unit-tested: `RegisterChild {handle,title,count}` +
  `buildRegisterChildren(category, productCategoryIds)`. Tree order (NOT alphabetical), filtered by
  `categoryHasProducts`, `count` = `collectCategoryDescendantIds(child) ∩ productCategoryIds`.
- `src/lib/medusa/register-model.test.ts` — 7 tests (ordering, filtering, nested counts, passthrough, empties).
- `src/lib/medusa/category-register.server.ts` — `getCategoryRegisterPage(handle)` (React `cache()`).
  Returns `null` (→ caller falls back to ShopWithSidebar) when: category missing, no region, or
  <2 product-bearing children.
- `src/components/CategoryRegister/index.tsx` — client component (sticky rail + crossfade plate + plates).
- `src/app/(site)/(pages)/categories/[handle]/page.tsx` — branch.

## Data recipe (reuses existing loaders — no new fetch layers)

1. `getCategoryByHandle(handle)` — `category_children` populated via `include_descendants_tree`.
2. `getProductCategoryIds(regionId)` — global cached loader (`listProductCategoryMembership`, minimal fields).
3. `collectCategoryDescendantIds` + `categoryHasProducts` from `lib/medusa/categories.ts`.
4. Per child: `listProductsByCategoryIds(regionId, descendantIds, SAMPLE_PRODUCTS_PER_COLLECTION)` →
   `mapMedusaProductToProduct(p, undefined, currencyCode)`. Never `*images`/`*metadata`
   (PRODUCT_LIST_FIELDS discipline). **`SAMPLE_PRODUCTS_PER_COLLECTION = 2` (user-mandated
   2026-08-12)** — a plate is EXACTLY 2 product cards + 1 view-all tile; it was 3 in code
   (`category-register.server.ts`) and the user rejected it ("must be 2 products + card").
5. Thumbnails: `getCategoryImageUrl(child)` (metadata `image_url`); copy: `child.description`.
6. Region: `getRegion(config.defaultCountryCode)` — gives `id` + `currency_code`.
7. **Free product counts**: `listProductsByCategoryIds` returns `{ products, count }` — `count` is the
   TOTAL product count at zero extra cost. Use it for rail counts, "View all N", and the header
   "M Designs" chip; fall back to `RegisterChild.count` (category-scope count) when 0.

## Page branch condition

```
isFirstPage && !hasQueryParams && register !== null
  && !categoryContent?.blocksAboveSubcategories?.length
  && !categoryContent?.blocksBelowListing?.length
```
`getCategoryRegisterPage` is only invoked when `isFirstPage && !hasQueryParams`. Keep
`generateMetadata`, breadcrumbs, and JSON-LD untouched.

## Client component anatomy (mirrors plp-editorial-b.html)

- Wrapped in `PageLayout` with `includeBreadcrumbJsonLd={false}` (page renders BreadcrumbJsonLd
  itself). NO manual pt — the breadcrumb handles fixed-header clearance.
- Header: eyebrow `text-caps text-[11px] font-bold text-content-secondary`; h1
  `font-light text-[clamp(40px,5vw,64px)] leading-[1.08] tracking-[-0.015em]`; meta chips
  (`border border-border-subtle px-3 py-[7px]`); deck from `categoryContent?.seo.description` →
  `metadata.seo_description` → `category.description` → fallback copy.
- Register grid: `grid-cols-1 lg:grid-cols-[340px_1fr]`; rail `lg:sticky lg:top-[150px]
  border-t-2 border-action-primary-background`; rows are `<button>`s: num
  `text-[13px] font-bold tracking-[0.16em]`, name `text-[17px]`, count `text-caps text-[11px]`,
  arrow `→`; active row `bg-action-primary-background` + white text. Hover = preview only
  (`onMouseEnter` → setActiveIndex); click = set active + analytics + smooth scroll to section.
  **Row padding is `px-4` (user fix 2026-08-12): `px-1` made the inverted (active) row's text
  almost touch the left/right border.**
- Feature plate: `relative aspect-[6/7] overflow-hidden bg-surface-muted`; stacked
  `<Image fill>` crossfading `opacity-0/100 transition-opacity duration-300`; gradient
  `bg-gradient-to-t from-black/50`; caption block + big index numeral `text-[60px] font-light`.
  When the active child has NO image, switch caption tones to ink-on-surface (white text on
  #fafafa is unreadable) and drop the gradient.
- Plates: `scroll-mt-[130px]` (the mockup's 120px tucks under the fixed header — breadcrumb
  clearance is 124px); alternate `bg-white`/`bg-surface-muted`; outlined numeral via
  `text-transparent [-webkit-text-stroke:1px_var(--color-content-muted)]`, active inversion
  `[-webkit-text-stroke-color:var(--color-content-primary)]`; h2 `text-[32px] font-light`;
  2× `ProductItem` (item, regionId, listId=`register_<handle>`, listName, position,
  `transparentBackground` — see below) + a "+ View all" CTA tile
  (`aspect-[6/7] border border-border-subtle`)
  when `samples < displayCount`. **Plate grid must put all 3 in ONE row (user-corrected
  2026-08-12):** cards grid is `grid grid-cols-2 gap-5 lg:grid-cols-3`; the tile gets
  `col-span-2 lg:col-span-1` (mobile: full-width tile under the 2 cards; desktop: third
  column, same row). The original `grid-cols-2` made the tile wrap to its own row — verify
  live that the tile's `getBoundingClientRect().top` equals the cards' tops.
- Scrollspy: IntersectionObserver over `[data-register-section]` elements with
  `rootMargin: "-25% 0px -60% 0px"` → `setActiveIndex(index)`.
- Analytics: `trackCustomEvent("Catalog", "register_select", handle)` gated by
  `useHasAnalyticsConsent()`.
- Responsive: 1 column < lg (1024px), rail static (`lg:` prefix only).

## Token mapping (mockup var → real utility)

| Mockup | Real class |
|---|---|
| `--ink` / `--text` (#1c1c1c) | `bg-action-primary-background` / `text-content-primary` — NO `ink` utility exists |
| `--text-2` (#575757) | `text-content-secondary` |
| `--text-3` (#838383) | `text-content-muted` — also the stroke color for outlined numerals; NOT `--color-border-strong` (#d9d7d2, hairline gray, nearly invisible) |
| `--border` (#e5e5e5) / `--hairline` (#ececec) | `border-border-subtle` |
| `--muted` (#fafafa) / `--subtle` (#f7f7f7) | `bg-surface-muted` / `bg-surface-subtle` |
| `.eyebrow` | `text-caps text-[11px] font-bold` (`text-caps` = `uppercase tracking-[0.14em]` component utility) |

## Pitfalls hit

- **Product cards on plates must be transparent** (user fix 2026-08-12): plates alternate
  `bg-white`/`bg-surface-muted` (#fafafa) and `ProductItem`'s article defaults to
  `bg-product-card-background` (white) — cards rendered as white boxes on gray plates.
  `ProductItem` gained an optional `transparentBackground` prop (default `false`, other
  usages unchanged); the register passes it. Card media area keeps
  `bg-product-card-media-background` (also #fafafa — matches gray plates; on white plates
  it is the intended image backdrop).
- **"View all" tile is hidden on mobile** (user fix 2026-08-12): `hidden lg:flex` —
  mobile shows exactly the 2 product cards; the tile only renders at lg+.
- **Fixed header slides with the Android URL bar on this page** (user fix 2026-08-12):
  the register is the only page with tap-to-smooth-scroll (`scrollIntoView` on rail rows),
  so the URL-bar collapse is visible there. `(site)/layout.tsx` viewport export now sets
  `interactiveWidget: "resizes-content"` so fixed elements stay anchored when the bar
  collapses (Android Chrome; iOS already anchored to the visual viewport).
- Unused prop (`categoryHandle`) declared in the client props type → typecheck error. The client
  derives child links from `child.handle`; drop unused props before typecheck.
- Client component defines its OWN serializable prop types (plain objects) instead of importing
  the loader's types from `category-register.server.ts` — keeps the server/client boundary clean
  (a type-only import would also be erased at build, but the local type avoids any boundary lint).
- `write_file` lint noise: TS2307 `@/` alias errors are the standalone checker lacking tsconfig
  context — the real gate is `corepack pnpm --filter @apps/storefront typecheck`.

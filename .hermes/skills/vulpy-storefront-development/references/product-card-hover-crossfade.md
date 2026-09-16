# Product card hover cross-fade — second image + finish variant image (verified 2026-08-12)

Feature: PLP/grid cards cross-fade the main image → second product image on hover;
finish swatch hover → that finish's variant image; swatch click → PDP with the
variant preselected. Implemented once in `components/Common/ProductItem.tsx` (the
single shared card) — covers shop grid/list, category pages, related-products +
homepage carousels, search results automatically.

## Data path dependency (read first — cards only render what the loader returns)

- The PLP (`/shop`) fetches via `listShopProductsSorted` → backend
  `GET /store/shop/products` → shopCatalog module `PRODUCT_FIELDS`
  (`apps/medusa-backend/src/modules/shopCatalog/shop-catalog-service.ts`).
- That field list shipped **thumbnail only — no `images`** → `imgs.previews` had
  exactly one entry, so a card could never cross-fade to a second image. Fix:
  add `"images.url"` to `PRODUCT_FIELDS` **and** bump `CACHE_SHAPE_VERSION`
  (`shop-catalog-cache.ts`) — products are part of the cached response contract.
- The storefront fallback path `PRODUCT_LIST_FIELDS` (`lib/medusa/products.ts`)
  empirically returns `images` + `variants.metadata` (verified via curl) — no
  change needed there. Only the backend shop route was starved.
- Variant images on cards come from `variant.thumbnail ?? variant.metadata.image_url`
  (the per-variant LARGE images, not small swatch thumbs). A product with ONE
  image legitimately renders no hover layer — check the data before debugging.

## Data model: `finishVariants`

`types/product.ts` gains `ProductFinishVariant { name, variantId, image? }` and
`Product.finishVariants`. Built in `mapMedusaProductToProduct` (mappers.ts):
first variant per unique Finish option value — match `collectFinishValues`
semantics (option title **includes** "finish", NOT exact `=== "Finish"`), image
via `resolveMedusaAssetUrl(variant.thumbnail ?? variant.metadata?.image_url)`.
`ShopProduct` inherits it via spread. The mapper test lives in
`mappers.finish-variants.test.ts`.

## Cross-fade implementation (the pattern)

- Stack ALL hover layers **pre-mounted** inside the image Link: main
  (`previews[0]`), second (`previews[1]`), plus one layer per finish that HAS a
  variant image. Toggle opacity via React state — never mount-on-hover, or the
  fade becomes a load pop-in instead of a cross-fade.
- State: `isImageHovered` (mouseenter/leave on the relative image wrapper div) +
  `hoveredFinish` (on each swatch button).
- `activeHoverImage = hoveredFinishVariant?.image ?? previews[1]`;
  `showHoverImage = activeHoverImage !== null && (isImageHovered || hoveredFinish)`;
  each layer gets `opacity-100` only when `activeHoverImage === layer.src`
  (`isActiveHoverLayer(src)`), others `opacity-0`; `transition-opacity
  duration-300 ease-out`.
- A finish with no variant image falls back to the second product image layer
  (already mounted — seamless).
- Hover layers are `aria-hidden` + `alt=""` (decorative); the main image keeps
  the product title alt.

## Swatch → PDP deep link

- The PDP already reads `?variant=<id>` (`app/(site)/(pages)/products/[handle]/page.tsx`
  → `initialVariantId` → `VariantOptions` preselect, gallery shows the variant
  image). Swatch click: `router.push(`/products/${handle}?variant=${variantId}`)`
  from `next/navigation`, `cursor-pointer` + `aria-label="View <title> in <finish>"`
  + focus-visible ring; fire `trackSelectItem` with the finish's variant id.
- `FinishSwatch` component itself is unchanged — wrap it in a `<button type="button">`.

## Swatch fly-across: delayed revert (no flash to main between swatches)

Leaving a swatch must NOT clear `hoveredFinish` synchronously — the cursor passes
through the 6px gap between swatches, and an immediate clear flashes the main image
mid-flight. Pattern:

- `onMouseEnter(swatch)` → `handleFinishHover(finish)`: cancel any pending timer,
  set `hoveredFinish` immediately.
- `onMouseLeave(swatch)` → `handleFinishLeave()`: start a ~150ms
  `SWATCH_REVERT_DELAY_MS` timer (`useRef<ReturnType<typeof setTimeout>>`); when it
  fires, clear `hoveredFinish`. Entering another swatch cancels the timer, so the
  cross-fade goes variant A → variant B directly (both layers are pre-mounted).
- Image-area `onMouseEnter` cancels the pending timer and clears `hoveredFinish`
  immediately — moving up onto the image takes over (second product image) without
  the finish image lingering.
- Clean up the timer in a `useEffect` unmount return.

## QA: verifying hover behavior headlessly (browser console)

- React's `onMouseEnter`/`onMouseLeave` are delegated — dispatch a BUBBLING
  `mouseover`/`mouseout` MouseEvent, NOT `mouseenter` (native mouseenter doesn't
  bubble and React won't see it).
- Confirm the cross-fade by reading `getComputedStyle(img).opacity` after
  ~400ms (longer than the 300ms transition); assert per-layer srcs (variant
  images are distinct per-finish URLs).
- Swatch click: `el.click()` then assert `location.pathname + location.search`
  contains `?variant=<id>`; on the PDP, the gallery main image should be the
  variant image and the finish button the pressed/selected one.
- Mid-transition reads: at ~60ms into a 300ms cross-fade NO layer has computed
  opacity exactly `1` (A is fading out while B fades in) — that's the fade, not a
  bug. The real assertions for the fly-across: main (`layers[0]`) stays `0`
  throughout the A→B flight, the active layer lands on B after ~400ms, and for the
  delayed revert: sample ~80ms after leaving the row (variant B still active) then
  again after the delay (main back). Map swatch → active layer index first
  (`findIndex(opacity === '1')`) — finishes without a variant image legitimately
  fall back to the second product image layer, so pick two swatches with distinct
  variant-image layers for a meaningful A→B test.
- Data probe: `curl /store/shop/products?region_id=<real-region>&...` with the
  publishable key — confirm `images` and `variants.metadata.image_url` are
  present. Fetch a real region id from `/store/regions` first.

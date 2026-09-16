# PDP / Wishlist / Footer UI patterns (Vulpy storefront)

Verified 2026-09. All paths under `apps/storefront/src`.

## PDP detail sections: tabs, not accordion

- `ProductDetailsAccordion` was REPLACED by `ProductDetailsTabs` (compact pill tab bar:
  Description / Specifications / Contains / Delivery & returns). Do NOT reintroduce the
  accordion for the PDP embedded sections.
- `components/Product/ProductDetailsTabs.tsx` — `role="tablist"`, pill bar `bg-gray-2 p-1`,
  active tab `bg-white shadow-1`, 12px uppercase bold labels, 14px icons, content in a
  bordered white panel (`rounded-panel border border-gray-3 bg-white`). One panel at a time;
  first item defaults open.
- The old accordion file was deleted after verifying zero remaining references
  (`search_files ProductDetailsAccordion` → only the file itself).

## Payment method logos on PDP

- `PaymentMethodIcons` (CMS-driven via `siteSettings.paymentMethods`) renders directly under
  the Add to Cart / wishlist row, in a `border-t` separated block (`mt-5 border-border-subtle border-t pt-4`).
- Thread `paymentMethods` as a prop from the PDP route (`getSiteSettings()` →
  `<ProductDetails paymentMethods={siteSettings.paymentMethods}>`). Do not read the CMS
  global inside the client component.

## Wishlist copy + behavior

- Store copy is "wishlist" — never "favourites". Toast strings, button labels, aria-labels
  all say "Added to wishlist" / "Remove from wishlist".
- Wishlist page: the layout h2 ("Your wishlist") is redundant — page relies on the
  breadcrumb/page title "Wishlist".
- `SavedProductsLayout` now accepts optional `title` and hides the whole header row
  (title + "Clear list") when there are no items. "Clear list" must only render when items
  exist — it used to render disabled in the empty state.
- Wishlist and RecentlyViewed share `SavedProductsLayout`: wishlist passes no `title`,
  recently-viewed passes "Recently viewed". Layout changes apply to both pages.

## Finish option contract + card swatch row (verified 2026-09-11)

- `collectFinishValues` (`lib/medusa/finish-swatches.ts`) and `mappers.ts` match variant option titles **containing "color"** — the demo option is titled "Color" (Finish→Color rename 2026-09-03). Test fixtures MUST use `option: { title: "Color" }`; a fixture using "Finish" returns `[]` (stale-assertion trap, fixed 2026-09-11 in `finish-swatches.test.ts` + `mappers.finish-variants.test.ts`).
- `ProductItem` (the single shared product card: PLP, carousels, cross-sell, wishlist rows, recently-viewed) renders the finish-swatch row ONLY when `item.finishes.length > 1` — a single distinct color is the product's own color, not a choice, and must NOT show a swatch row.

## Saved-item price rendering: no "From" for pinned variants

- Bug (2026-09): wishlist/recently-viewed rows and the summary showed "From $X" for items
  saved from the PDP because `minPrice`/`maxPrice` catalog bounds were passed into
  `ProductPrice`, and `resolveProductPriceDisplay` (lib/medusa/money.ts) emits
  `kind: "from"` whenever min < max.
- Every saved item is pinned to a concrete variant — all producers (PDP `useWishlistToggle`,
  QuickViewModal, listing cards, `useTrackRecentlyViewed`) always save a variant id + exact
  price. So saved-item surfaces must NOT pass `minPrice`/`maxPrice` to `ProductPrice`;
  pass only `price`/`discountedPrice`.
- Fix removed bounds from `SavedProductRow` (table + card variants) and
  `SavedProductsSummary`. Note `mapMedusaProductToProduct` always sets `variantId` +
  `variantLabel` (default/cheapest variant), so you cannot distinguish "pinned variant"
  from "listing" by those fields — the rule is surface-based, not field-based.

## Heading hierarchy + h1/h2 scale (verified 2026-09-11)

- `.h1` = `font-light text-[clamp(32px,3vw,40px)]` — MUST stay ≥ `.h2` at every breakpoint (`.h2` = `text-3xl` 30px, `xl:text-heading-2` 32px). Prior value `clamp(26px,3vw,38px)` made H1 smaller than H2 on mobile — corrected to 32px min.
- Page/section headings → `.h2`; step/sub-headings under a page h1 → `h3 h3`; widget/sidebar/drawer mini-headings keep their scale. FAQ block title in `BlocksRenderer` is `h2` (was `h4`).
- PDP product-content blocks (`BlocksRenderer` in `ProductDetails` children) render each block with its OWN `.container` — the wrapper div must be `w-full`, NOT `container` (was container-in-container).

## Burger mobile menu row contract (verified 2026-09-11 via component render)

Every top-level row uses the SAME base: `flex min-h-11 items-center font-semibold text-caps text-custom-xs text-content-primary relative pl-4.5`. Dropdown triggers add `w-full text-left` (button) + `gap-1.5` (chevron) only. Submenu rows are uniform: `group/sub relative flex items-center py-[7px] pr-8 pl-4.5 text-custom-sm text-content-primary hover:bg-gray-1`. No duplicate `hover:bg-gray-1`, no `text-content-brand` on Sale. Verification must render the component (`renderToStaticMarkup` with `navigationOpen=true`) — the burger is client-side only and NOT in SSR HTML (grep on the page dump proves nothing).

## PLP sort select caret (verified 2026-09-11)

`.custom-select-2 .select-selected:after` needs `top: 50%` + `-translate-y-1/2` (Tailwind compiles to `top: 50%` + `--tw-translate-y`). It previously had only `right-3.5` → caret floated at the top (corrupted). Base `.select-selected:after` already centers; `custom-select-2`/`custom-select-common` did not.

## Footer tablet layout (verified 2026-09-11)

- Footer column "Visit" (`footer.helpTitle`) renders contact info from
  `siteSettings.contactInfo`. Fresh DBs get it from `defaultSiteSettings.contactInfo`;
  existing DBs converge via `backfillSiteSettingsContactInfo()` in
  `scripts/seed-payload-core.ts`.
- IMPORTANT backfill pattern: `ensureGlobal` skips already-configured globals (siteName
  guard), so changing `defaultSiteSettings.contactInfo` alone does NOT reach existing DBs.
  Any new site-settings default needs its own backfill migration that runs AFTER
  `ensureGlobal` and only writes when the target fields are empty.
- Real identity (from `.hermes/fox-landing` + legal reference): address
  "8 The Green, Ste D, Dover, DE 19901, United States", email hello@foxinthebox.io,
  contactName "Vulpy, Inc.". Test `src/lib/cms/defaults.test.ts` asserts these.
- Social links: icons only (no platform text), `size-[19px]` (~15% smaller than the 22px
  default), under a "Follow Us" h3 matching column-heading style
  (`font-bold text-[11px] text-caps text-content-primary tracking-[0.18em]`).
  `SocialIcon` normalizes platform names ("x" → twitter).

## Editing notes / pitfalls

- After multi-part `patch` calls on the same file, LSP diagnostics can reference
  identifiers from an intermediate broken state (e.g. "Cannot find name 'X'" for a
  component already replaced by a later patch). Verify with `search_files` before chasing
  phantom errors — `pnpm typecheck` is the source of truth.
- Be careful patching around `emptyState` props in Wishlist/RecentlyViewed: a partial
  old_string match can truncate the prop and leave the file broken. Use `write_file` to
  rewrite the whole file when the edit is structural.

# Finish swatches — option-value metadata surface + architecture (IMPLEMENTED 2026-08-12)

Operator direction (Hector Finch): finishes must show a COLOR SWATCH (like the
`.design-specs` mockups); images per finish may come later. This file records the
verified data surface and the implementation so the next session can extend it
without re-probing. **Status: the swatch registry, card hover row + tooltip,
PDP/QuickView option swatches, and the PLP Finish facet (with swatches) are all
LIVE and verified.**

## Verified Store API surface (live probe, 2026-08-12)

- `fields=*options` returns option objects (id, title, metadata, …) but **NOT
  `values`** — `values` is a relation and must be expanded explicitly.
- `fields=*options,*options.values` returns `values` where each value has keys:
  `id, value, metadata, option_id, created_at, updated_at, deleted_at`.
- `metadata` on an option value is currently `null` for all HF finishes — the
  field EXISTS and round-trips through the Store API; it's just unpopulated.
- Probe (Playwright page fetch from the storefront origin to avoid CORS):
  `<storefront-api>/store/products?limit=2&fields=handle,*options,*options.values`
  with header `x-publishable-api-key: <key from apps/storefront/.env>`.
- Example values: `Antique Brass`, `Brass Polished Lacquered`, `Brass Polished
  Unlacquered`, `Bronze`, `Chrome`, `Nickel Matte`, `Nickel Polished` (7 finishes,
  one `Finish` option).

## Mockup swatch spec (from `.design-specs`)

- PDP option buttons + PLP filter facets: small SQUARE swatch, 13–14px,
  `border: 1px solid rgba(0,0,0,0.14)` (hairline), inline hex background
  (`pdp-mockup.html:137/376`, `plp-mockup.html:126/378`).
- Design hexes used in the mockups: Antique brass `#8a6f4d`, Polished brass
  `#c9a94e`, Bronze `#5d4632`, Nickel `#9aa0a6`, Black `#262626` (+ Chrome /
  Nickel Matte need approximations, e.g. `#d6dbe0` / `#b7bcc1`).
- Cards: mockup showed a finish TEXT line under the title
  (`plp-mockup.html:174`, `.card .finish` 12px muted) — **OPERATOR OVERRIDE
  2026-08-12: cards show a miniature swatch ROW instead of the name, revealed
  on card hover; hovering a swatch shows the finish name (tooltip).** The text
  line is not built; the hover swatch row is the spec. Render the row with an
  opacity transition (0 → 1 on `group-hover`) so there is no layout reflow.

## Recommended architecture (decision, 2026-08-12)

**Option-value metadata is the single source of truth; a storefront fallback
palette bridges the gap until data exists.**

1. **Data (Medusa option value `metadata`):**
   - now: `swatch_color: "#8a6f4d"` (hex)
   - later: `swatch_image: <CDN url>` — same UI slot renders the image
   - settable via Medusa admin/API or a seed script; no schema change needed.
2. **Storefront plumbing:**
   - `products.ts`: add `,*options.values` to `PRODUCT_LIST_FIELDS` (and it flows
     into `PRODUCT_DETAIL_FIELDS` by concatenation). Keep the field-discipline
     rule: option values are small, unlike `*images`/`*metadata`.
   - New `lib/medusa/finish-swatches.ts`:
     `resolveSwatch(optionValue) → {type:"color", value:"#…"} | {type:"image", url} | null`
     — metadata wins; fallback palette keyed by NORMALIZED finish name
     (`value.toLowerCase()`); null → render label-only.
   - Types + mappers: option values currently flatten to plain `string[]` —
     carry the resolved `swatch` through `ProductDetail` and the PLP facet data.
3. **UI:**
   - `VariantOptions` (shared by PDP + QuickView): finish option buttons render
     the 14px square swatch before the label; selected = ink border ring.
   - PLP finish facets (`shop-filters.ts` + the AttributeFilterDropdown):
     swatch + label + count via the same helper.
   - Card (`Common/ProductItem.tsx`): hover-reveal swatch row (miniature
     swatches, ~14px) where the finish text line would sit; each swatch shows
     the finish name on hover (title/tooltip). One registry lookup per finish
     NAME — the card renders the finish names from the product's option values,
     so it never needs per-product color data.

**Why not a static map only:** works today but breaks on new finishes and can't
do images. **Why not metadata-only:** dead until data exists. The discriminated
`{type:"color"|"image"}` shape makes the images upgrade data-only — stamp
`swatch_image` on option values, zero component rework.

## Implemented wiring (2026-08-12) — facet values are NAMES, colors resolve via the registry

- **Card swatch row** (`Common/ProductItem.tsx`): hover-revealed row of
  miniature swatches (opacity 0 → 1 transition, no reflow) in the finish-text
  slot; each swatch shows the finish name on hover (tooltip).
- **PDP + QuickView** (`ShopDetails/VariantOptions.tsx`): finish buttons render
  the 14px square swatch before the label; selected = ink border ring, weight
  stays 400 (operator: no font-weight change on selection — the border is the
  indicator).
- **PLP Finish facet** (`ShopWithSidebar` + `AttributeFilterDropdown`): the
  dropdown values are finish NAMES from the facets; each row renders
  `<FinishSwatch name={value} size={13} withTooltip={false} />` — one registry
  lookup per name, no per-product color data anywhere.
- **Registry** (`lib/medusa/finish-swatches.ts`): name → hex fallback palette
  (design hexes + Chrome/Nickel approximations); metadata `swatch_color` /
  `swatch_image` wins when populated. Material-word fallback rule: normalize by
  LAST word too (`"Brushed Nickel"` → `nickel`) — finish names lead with the
  material qualifier; keep bare `brass`/`nickel` keys for two-word finishes.
  **2026-08-29 change:** bare swatch adjectives were added to the demo seed's
  Finish option values (Matte/Polished/Burnished/Etched), so the word fallback
  tries the LAST word FIRST to keep `"Brushed Nickel"` resolving to nickel
  instead of the new standalone `"Brushed"` palette. When adding bare-adjective
  finishes, audit the two-word material finishes for fallback collisions.
- **Facet pipeline end-to-end** (backend `shopCatalog` index → facets → filter +
  storefront URL serialization + the tiered-cache `CACHE_SHAPE_VERSION` trap):
  see `vulpy-medusa-development` → `references/payment-architecture.md` and the
  `shopCatalog` module in `apps/medusa-backend/src/modules/shopCatalog/`
  (`shop-catalog-service.ts` `PRODUCT_FIELDS` + `shop-catalog-cache.ts`
  `CACHE_SHAPE_VERSION`).

## Pitfalls

- `*options` alone silently omits `values` — the mapper gets `values: undefined`
  and any `.values.map` throws at runtime. Always request `*options.values`.
- Mappers (`mappers.ts`) build `ProductOptionValue` as plain strings today —
  metadata is DROPPED at the mapping boundary; the swatch must be resolved in
  the mapper (or a parallel helper consuming raw SDK values), not at render.
- Same caution as all mockup-derived styles: verify the swatch classes compile
  (see SKILL.md "Token class names must exist in tokens.generated.css").

## Palette completeness audit (operator feedback 2026-08-12)

After the registry shipped, the operator flagged finishes rendering BLANK:
"some are missing colors i.e. Bianco, Grey, Arancio". Root cause: the registry
covered only the 7 standard HF finishes, while the REGION-WIDE facet list has
26 values (Murano glass range + neutrals) — everything else fell through to the
empty fallback swatch.

**Rule: after building or editing a swatch registry, audit it against the LIVE
facet list.** Fetch `/store/shop/facets` (REAL region id from `/store/regions`,
`cache: 'no-store'` — see `shop-catalog-cache-and-facets.md` for the probe) and
diff the returned value set against the registry keys. A registry that covers
only the well-known finishes will silently miss catalog extensions.

Full registered palette (26 finishes, all live-verified 2026-08-12):

| Group | Finishes (hex) |
|---|---|
| Standard 7 | Antique Brass `#8a6f4d`, Brass Polished Lacquered `#c9a94e`, Brass Polished Unlacquered `#b08d3e`, Bronze `#5d4632`, Chrome `#cfd6dc`, Nickel Matte `#9aa0a6`, Nickel Polished `#b9bec4` |
| Murano glass | Arancio `#d96c2f`, Bianco `#f2efe9`, Blu Avio `#52607a`, Foglio D'Oro `#d4af37`, Giallo `#e3b341`, Grigio `#9aa0a6`, Marrone `#6f5340`, Naturale `#d9c9a3`, Rosso `#b23a2e`, Turchese `#3fa9a0`, Verde `#5c7a5a`, Verde Smeraldo `#1f5c4f`, Verdigris `#5b7f79`, Viola `#6a4a6b` |
| Neutrals / other | Black `#262626`, Copper `#b87333`, Grey `#a8adb4`, Zinc `#a3aab1`, Iron `#3d3d3d`, Steel `#8b939b`, Clear `#e8e6e0`, Custom Colour `#d9d4cc` |

Plus bare material keys (`brass`, `bronze`, `nickel`, `copper`, …) for the
word-fallback (`"Satin Brass"` → last-word `brass`). Unit tests: 7 swatch tests
in `finish-swatches.test.ts` incl. a Murano-range case — extend it when adding
finishes.

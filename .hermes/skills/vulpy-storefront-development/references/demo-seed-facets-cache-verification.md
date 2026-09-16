# Demo-catalog seed parity + storefront facet/cache verification (2026-08-29)

## Idempotency trap — seed must UPSERT, not skip

`seed-demo-catalog.ts` used a `continue` on existing products, so new `metadata.filterable` stamps never reached already-seeded rows. When expanding demo catalogs, make the seed **upsert** (update metadata on existing handles) instead of skip-only.

Facets flow: backend `shopCatalog` module → `fetchIndexEntriesLightweight` → `toShopCatalogIndexEntry` reads ONLY `metadata.filterable` (not `metadata.attributes`) into `filterableAttributes`. Keep `metadata.filterable` in sync with the seed, and rebuild the scope cache after reseed.

## Finish/Color options — 2026-08-29 (Task 18)

The demo catalog now stamps **variant options** (not just product metadata): most
products get a `Finish` option (swatch-friendly bare adjectives like
Matte/Polished/Burnished/Etched) and a `Color` option (River Grey/Oxide/Verde/
Ochre); 3 intentional single-variant products stay bare (`Default`/`One Size` —
NOT "no options", the existing test convention), and `checkout-e2e-product`
stays untouched. The Finish/Color values flow through:

- backend `shop-index.ts` `collectVariantIndexFields` reads option title
  containing "Finish" (like Size/Color) into a `finishes` set on the index entry
- backend `shop-facets.ts` builds/returns `finishes` (mirror colors) so SSR
  facets carry it; `shop-query.ts` parses `finishes` filter param and defaults
- storefront `ShopWithSidebar` renders the `facets.finishes` group when
  nonzero, and `normalizeShopFilterFacets` passes `finishes` through unchanged
- `finish-swatches.ts` gains the new bare-adjective palette entries, and the
  **material-word fallback order flipped**: try the LAST word FIRST (so
  "Brushed Nickel" resolves to nickel, not a bare "Brushed" palette)

**Verify Finish/Color server-side by grepping the SSR flight payload for
`"finishes":[...]` / `"colors":[...]`** — if the backend facets respond with
values but the page still shows only Material, the scope cache/index wasn't
rebuilt (invalidate, reseed, restart) or the running backend `shop-facets.ts`
is older than the code.

## Stale-facet race — merge guard added 2026-08-29

`loadCatalogPage` now calls `mergePageAttributeFacets(resolvedFacets,
pageProducts)` after resolving facets: when the backend facet response is empty
on a cold cache/reseed, the storefront rebuilds missing attribute groups from
the current page's products (`filterableAttributes`) and merges them. Also
shorten `shop-facets` revalidate from 1800 to 300s (guest cache is not
sensitive) and keep the dev `/api/dev/cache-clear` route. If a facet group
still hides after the merge, debug the cache/sidebar path, not the merge.

## Storefront delivery pitfalls

- **Dev server reading files from the host checkout has uid-999 permissions issues** for agent-created files. Fix: `sudo chown <hostUser>:<hostUser>` before the dev server can read them.
- **`unstable_cache` in storefront (`shop-catalog` 60–300s, `shop-facets` 1800s) caches EMPTY facets if the backend is down at first SSR after restart** — the sidebar shows no filters for up to 30 min. Hit dev `cache-clear` (or restart with backend healthy) before verifying facets.
- **Headless browser from Fox container cannot reach `host.docker.internal:3000`** — curl + SSR JSON (search `facets` in HTML) is the reliable check; the PreLoader spinner may not clear in headless anyway.
- **`mapMedusaProductToShopProduct` merges `metadata.filterable` over descriptive `metadata.attributes`** via `mergeFilterableAttributes`. If products only carry `attributes` (no `filterable`), Material facets still synthesize for known keys.
- PreLoader (`SiteLayoutClient`) shows a spinner until a 200ms `setTimeout`; if that doesn't clear, `#__next` never becomes root — check `bodyChildren`/spinner before debugging filters.
# Saved items (wishlist / recently viewed) — id-only storage + rehydrate

How this codebase keeps wishlist / recently-viewed display data honest: client
storage holds only product handles; everything else is rebuilt fresh from Medusa
on every page load. Built 2026-08-12 (commit `53e8c88`), replacing the earlier
snapshot + granular-refresh pattern.

## Architecture

- Storage keys: `nextmerce-wishlist`, `nextmerce-recently-viewed` — JSON
  `string[]` of product handles. Nothing else is persisted: no titles, images,
  prices, status.
- `useWishlistToggle` / `useTrackRecentlyViewed` still dispatch full items into
  Redux (in-memory, for immediate render), but the hydrators' persist effect
  writes `items.map(i => i.handle)`.
- On page load each hydrator reads the handle array, calls
  `rehydrateSavedItemsAction(handles)` (`src/app/actions/saved-items.ts`), and
  dispatches `hydrateWishlist` / `hydrateRecentlyViewed` with the rebuilt items.
- The action: `getProductsByHandles` → `mapMedusaProducts` → build per-handle
  items → return in INPUT order, dropping handles that no longer resolve.
  `status` derived from `inStock` (`out_of_stock` / `available`); `quantity: 1`.
- Removed as obsolete: `refreshWishlistPricesAction`,
  `refreshRecentlyViewedPricesAction`, `refreshWishlistPrices` /
  `refreshRecentlyViewedPrices` reducers, and the strip/normalize storage helper.

## SDK constraints (verified against @medusajs/js-sdk 2.13.0, 2026-08-12)

- **No `store.variant` resource** in the store SDK — `sdk.store.variant` does not
  exist. You cannot fetch a variant by id from the store API.
- `store.product.list` filters: `id` = product id (`prod_...`) only; `handle`
  works. Variant ids (`variant_...`) silently return nothing.
- `store.region.list` rejects a `country_code` filter (400 `Unrecognized
  fields`) — list all regions and match `countries[].iso_2 === "us"` client-side.
- `mapMedusaProductToProduct(product, variantId, currencyCode)` picks that exact
  variant's calculated price; without the variantId arg it prices the cheapest
  variant (fine for card-level saved items, which are cheapest/first variant).

## Design rule (user preference)

The operator explicitly asked for id-only persistence ("no images, names or
prices — let's just have ids"). Display data must never be trusted from client
storage. Consequences to accept, NOT "fix":
- saved pages pop in async — empty for a split second until the rehydrate fetch
  lands (rendering from a stored snapshot would violate the rule);
- rehydrate failure leaves the list empty (nothing displayable without storage);
- deleted/unpublished products silently drop out of saved lists.

## Verification

### Live data-path probe with tsx (from the Fox container)

Exercises the exact action logic without a browser. `getMedusaClient()` calls
Next `cookies()` and throws outside a request scope — use
`getPublicMedusaClient()` (`@/lib/medusa/client`), which never reads cookies.

```bash
cd /app/workspace/apps/storefront
set -a && . ./.env && set +a
export MEDUSA_BACKEND_URL="http://host.docker.internal:9000"   # .env has localhost:9000 — unreachable in-container
node_modules/.bin/tsx --tsconfig tsconfig.json /tmp/verify.ts  # script imports @/lib/medusa/* via tsconfig paths
```

Script essentials:
- Product list fields must include `*variants.calculated_price` +
  `+variants.inventory_quantity,+variants.manage_inventory` + `region_id`, else
  prices/stock are absent.
- Include a dead handle in the input to assert order-preservation + drop
  behavior; include a sale product (seeded Shorts: price 10 / discountedPrice 7)
  to exercise the discounted branch.
- Ignore the write_file linter flood: it runs root `tsc --noEmit` and drowns in
  @types/react / @types/node noise. tsx executes regardless.

### Dirty-tree typecheck baseline (stash-compare)

This working tree carries ~136 pre-existing TS errors (React 18/19 `@types`
hoisting: `components/cms/*`, `Wishlist/index.tsx` `Link`/`Image` JSX type
mismatches). To prove a change adds zero new errors:

```bash
git stash push -m tmp -u -- <my files>          # -u includes brand-new untracked files
pnpm --filter @apps/storefront typecheck 2>&1 | grep -c "error TS"   # baseline
git stash pop
pnpm --filter @apps/storefront typecheck 2>&1 | grep -c "error TS"   # with change
# equal counts + no new paths in the error list ⇒ clean
```

## Files (current architecture)

- `apps/storefront/src/app/actions/saved-items.ts` — `rehydrateSavedItemsAction`
  + `RehydratedSavedItem` type
- `apps/storefront/src/components/Wishlist/WishlistHydrator.tsx`
- `apps/storefront/src/components/RecentlyViewed/RecentlyViewedHydrator.tsx`
- slices: `redux/features/wishlist-slice.ts`,
  `redux/features/recently-viewed-slice.ts` (hydrate reducers only; the
  `refresh*Prices` reducers were removed)

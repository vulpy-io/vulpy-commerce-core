# Medusa product query field discipline

## Problem

Medusa Store API `product.list` fetches whatever fields you request. Requesting `*images` or `*metadata` on a list call with `limit=200` pulls:

- Full gallery arrays (all uploaded product images)
- All metadata keys — including per-color image-URL maps that can be several KB per product

On a 2 vCPU host this has caused multi-second list queries and Postgres saturation. The fix is a strict three-tier field constant structure.

## Concrete implementation (`apps/storefront/src/lib/medusa/products.ts`)

```ts
// Listings: lean. No *images, no *metadata.
const PRODUCT_LIST_FIELDS =
  "*variants.calculated_price,*variants.options,*options,*categories,*tags,*collection" +
  ",+variants.inventory_quantity,+variants.manage_inventory,+variants.thumbnail" +
  ",+created_at,+updated_at";

// PDP: galleries + metadata (color maps, etc.) + everything above.
const PRODUCT_DETAIL_FIELDS = `${PRODUCT_LIST_FIELDS},*images,*metadata`;

// Nav filtering: only need to know which categories have products.
const PRODUCT_CATEGORY_ID_FIELDS = "id,*categories";
```

## Corresponding export

```ts
/** Category membership only — used by nav to filter empty categories. */
export const listProductCategoryMembership = cache(
  async (regionId: string, limit = 200) => {
    if (!regionId) return { products: [] as HttpTypes.StoreProduct[] };
    const medusa = await getMedusaClient();
    return medusa.store.product.list({
      fields: PRODUCT_CATEGORY_ID_FIELDS,
      region_id: regionId,
      limit,
    });
  }
);
```

## Usage matrix

| Function | Fields constant | Notes |
|---|---|---|
| `listProducts` | `PRODUCT_LIST_FIELDS` | General catalog, home, search results |
| `listProductsViaStoreApi` | `PRODUCT_LIST_FIELDS` | Fallback shop path |
| `listShopProductsSorted` | via `/store/shop/products` | shopCatalog service controls fields |
| `listProductsByCategoryIds` | `PRODUCT_LIST_FIELDS` | Category page grid |
| `getProductsByIds` | `PRODUCT_LIST_FIELDS` | Related/upsell cards |
| `getProductsByHandles` | delegates to `getProductByHandle` | — |
| `getProductByHandle` | **`PRODUCT_DETAIL_FIELDS`** | PDP — only place with images + metadata |
| `listProductCategoryMembership` | `PRODUCT_CATEGORY_ID_FIELDS` | Nav filter — called with limit=200 |

## Backend: shopCatalog module (`apps/medusa-backend/src/modules/shopCatalog/shop-catalog-service.ts`)

Same principle — `PRODUCT_FIELDS` used in the 15-min cache rebuild must not include `images.*`:

```ts
const PRODUCT_FIELDS = [
  "id", "title", "handle", "subtitle", "description",
  "thumbnail",
  "created_at",
  "metadata",
  // No "images.*" — full galleries belong on PDP, not the catalog cache.
  "options.*", "options.values.*",
  "tags.*", "categories.*",
  "variants.*", "variants.options.*", "variants.options.option.*",
  "variants.calculated_price.*",
  "variants.thumbnail",   // ← add this so per-variant swatches work
];
```

## Origin

Pattern first seen in `bsgdigital/padelbaza@cfe7b1b` (2026-07-29). Ported to this repo in `7e0ff37`.

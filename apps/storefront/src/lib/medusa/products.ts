import type { HttpTypes } from "@medusajs/types";
import { cache } from "react";
import {
  type ShopSortValue,
  sortShopProducts,
  toMedusaProductOrder,
} from "@/lib/medusa/shop-display";
import { getMedusaClient } from "./client";

const PRODUCT_LIST_FIELDS =
  // Listings: keep lean. Do not request *images or torgsoft/heavy *metadata here.
  "*variants.calculated_price,*variants.options,*options,*categories,*tags,*collection,+variants.inventory_quantity,+variants.manage_inventory,+variants.thumbnail,+created_at,+updated_at";

// PDP: galleries + metadata (torgsoft color maps etc.) + variant thumbnails.
const PRODUCT_DETAIL_FIELDS = `${PRODUCT_LIST_FIELDS},*images,*metadata`;

/** Minimal fields to discover which categories have products (nav filtering). */
const PRODUCT_CATEGORY_ID_FIELDS = "id,*categories";

function parseSalesCount(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.sales_count;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

async function listProductsViaStoreApi(
  regionId: string,
  sort: ShopSortValue,
  categoryIds?: string[]
) {
  const medusa = await getMedusaClient();
  const medusaOrder = toMedusaProductOrder(sort);
  const products: HttpTypes.StoreProduct[] = [];
  let offset = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (offset < totalCount) {
    const batch = await medusa.store.product.list({
      fields: PRODUCT_LIST_FIELDS,
      region_id: regionId,
      limit: 100,
      offset,
      ...(medusaOrder ? { order: medusaOrder } : {}),
      ...(categoryIds?.length ? { category_id: categoryIds } : {}),
    });

    totalCount = batch.count ?? batch.products.length;
    products.push(...batch.products);

    if (!batch.products.length) {
      break;
    }

    offset += batch.products.length;
  }

  if (medusaOrder) {
    return products;
  }

  const sorted = sortShopProducts(
    products.map((product) => ({
      id: product.id ?? "",
      productId: product.id,
      title: product.title ?? "",
      price: 0,
      discountedPrice: 0,
      reviews: 0,
      createdAt: product.created_at,
      salesCount: parseSalesCount(product.metadata as Record<string, unknown>),
    })),
    sort
  );

  const byId = new Map(products.map((product) => [product.id, product]));
  return sorted
    .map((product) => byId.get(product.productId ?? product.id))
    .filter((product): product is HttpTypes.StoreProduct => Boolean(product));
}

export const listShopProductsSorted = cache(
  async (
    regionId: string,
    sort: ShopSortValue,
    categoryIds?: string[]
  ) => {
    if (!regionId) {
      return { products: [], count: 0 };
    }

    const medusa = await getMedusaClient();

    try {
      const response = await medusa.client.fetch<{
        products: HttpTypes.StoreProduct[];
        count: number;
      }>("/store/shop/products", {
        method: "GET",
        query: {
          region_id: regionId,
          sort,
          ...(categoryIds?.length ? { category_id: categoryIds } : {}),
        },
      });

      return {
        products: response.products ?? [],
        count: response.count ?? response.products?.length ?? 0,
      };
    } catch {
      const products = await listProductsViaStoreApi(regionId, sort, categoryIds);
      return {
        products,
        count: products.length,
      };
    }
  }
);

export const listProducts = cache(
  async (regionId: string, limit = 12, offset = 0) => {
    const medusa = await getMedusaClient();
    const { products, count } = await medusa.store.product.list({
      fields: PRODUCT_LIST_FIELDS,
      region_id: regionId,
      limit,
      offset,
    });
    return { products, count };
  }
);

/** Category membership only — used by nav to filter empty categories.
 *  Fetches id + categories only; avoids pulling variant/price/image payloads
 *  for up to limit=200 products on every nav render. */
export const listProductCategoryMembership = cache(
  async (regionId: string, limit = 200) => {
    if (!regionId) {
      return { products: [] as HttpTypes.StoreProduct[] };
    }
    const medusa = await getMedusaClient();
    return medusa.store.product.list({
      fields: PRODUCT_CATEGORY_ID_FIELDS,
      region_id: regionId,
      limit,
    });
  }
);

export const getProductByHandle = cache(
  async (handle: string, regionId: string) => {
    const medusa = await getMedusaClient();
    const { products } = await medusa.store.product.list({
      fields: PRODUCT_DETAIL_FIELDS,
      handle,
      region_id: regionId,
    });
    return products[0] ?? null;
  }
);

export const getProductsByHandles = cache(
  async (handles: string[], regionId: string) => {
    if (!handles.length) {
      return [];
    }

    const results = await Promise.all(
      handles.map((handle) => getProductByHandle(handle, regionId))
    );

    return results.filter((product): product is HttpTypes.StoreProduct =>
      Boolean(product)
    );
  }
);

export const getProductsByIds = cache(
  async (ids: string[], regionId: string) => {
    const medusa = await getMedusaClient();
    return medusa.store.product.list({
      id: ids,
      fields: PRODUCT_LIST_FIELDS,
      region_id: regionId,
    });
  }
);

export const listProductsByCategoryIds = cache(
  async (
    regionId: string,
    categoryIds: string[],
    limit = 100,
    offset = 0
  ) => {
    if (!regionId || categoryIds.length === 0) {
      return { products: [], count: 0 };
    }

    const medusa = await getMedusaClient();
    const { products, count } = await medusa.store.product.list({
      fields: PRODUCT_LIST_FIELDS,
      region_id: regionId,
      category_id: categoryIds,
      limit,
      offset,
    });

    return { products, count };
  }
);

export const listCategories = cache(async () => {
  const medusa = await getMedusaClient();
  const { product_categories } = await medusa.store.category.list({
    limit: 100,
    fields: "+metadata,+updated_at",
  });
  return product_categories;
});

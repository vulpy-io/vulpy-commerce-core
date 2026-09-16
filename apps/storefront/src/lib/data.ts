import { getEnrichedCart } from "@/lib/medusa/cart";
import {
  buildChildCategoryDisplay,
  buildChildCategoryFacets,
  categoryHasProducts,
  collectCategoryDescendantIds,
  getCategoryByHandle,
} from "@/lib/medusa/categories";
import { getCustomer } from "@/lib/medusa/customer";
import {
  mapMedusaProducts,
  mapMedusaProductsForShop,
} from "@/lib/medusa/mappers";
import { getProductsByHandles, listProducts, listProductsByCategoryIds } from "@/lib/medusa/products";
import {
  getCurrencyCode,
  getRegionId,
  getStoreRegion,
} from "@/lib/medusa/regions";
import { buildFilterFacets } from "@/lib/medusa/shop-filters";

export { getCurrencyCode, getRegionId, getStoreRegion };

export async function getStoreProducts(limit = 12) {
  const [regionId, currencyCode] = await Promise.all([
    getRegionId(),
    getCurrencyCode(),
  ]);
  if (!regionId) {
    return [];
  }
  const { products } = await listProducts(regionId, limit);
  return mapMedusaProducts(products, currencyCode);
}

export async function getRelatedProducts({
  sourceMetadata,
  categoryId,
  excludeHandle,
  regionId,
  limit = 8,
}: {
  sourceMetadata?: Record<string, unknown> | null;
  categoryId?: string | null;
  excludeHandle: string;
  regionId: string;
  limit?: number;
}) {
  const currencyCode = await getCurrencyCode();
  const relatedHandles = sourceMetadata?.related_product_handles;

  if (Array.isArray(relatedHandles) && relatedHandles.length > 0) {
    const handles = relatedHandles.filter(
      (handle): handle is string => typeof handle === "string" && handle.length > 0
    );
    const products = await getProductsByHandles(handles, regionId);
    const mapped = mapMedusaProducts(products, currencyCode);
    const byHandle = new Map(mapped.map((product) => [product.handle, product]));

    return handles
      .map((handle) => byHandle.get(handle))
      .filter(
        (product): product is NonNullable<typeof product> =>
          Boolean(product) &&
          product.handle !== excludeHandle &&
          product.inStock !== false
      )
      .slice(0, limit);
  }

  return getRelatedProductsInCategory({
    categoryId,
    excludeHandle,
    regionId,
    limit,
  });
}

export async function getRelatedProductsInCategory({
  categoryId,
  excludeHandle,
  regionId,
  limit = 4,
}: {
  categoryId?: string | null;
  excludeHandle: string;
  regionId: string;
  limit?: number;
}) {
  const currencyCode = await getCurrencyCode();

  if (!categoryId) {
    const { products } = await listProducts(regionId, limit + 4);
    return mapMedusaProducts(products, currencyCode)
      .filter((p) => p.handle !== excludeHandle && p.inStock !== false)
      .slice(0, limit);
  }

  const { products } = await listProductsByCategoryIds(
    regionId,
    [categoryId],
    limit + 4
  );

  return mapMedusaProducts(products, currencyCode)
    .filter((p) => p.handle !== excludeHandle && p.inStock !== false)
    .slice(0, limit);
}

export async function getShopCatalog(limit = 50) {
  const [regionId, currencyCode] = await Promise.all([
    getRegionId(),
    getCurrencyCode(),
  ]);
  if (!regionId) {
    return { products: [], facets: buildFilterFacets([]), regionId: "" };
  }

  const { products } = await listProducts(regionId, limit);
  const shopProducts = mapMedusaProductsForShop(products, currencyCode);

  return {
    products: shopProducts,
    facets: buildFilterFacets(shopProducts),
    regionId,
  };
}

export async function getCategoryCatalog(handle: string, limit = 200) {
  const [regionId, currencyCode] = await Promise.all([
    getRegionId(),
    getCurrencyCode(),
  ]);
  if (!regionId) {
    return null;
  }

  const category = await getCategoryByHandle(handle);
  if (!category) {
    return null;
  }

  const categoryIds = collectCategoryDescendantIds(category);
  const { products } = await listProductsByCategoryIds(regionId, categoryIds, limit);
  const shopProducts = mapMedusaProductsForShop(products, currencyCode);
  const productCategoryIds = new Set<string>();

  for (const product of shopProducts) {
    for (const categoryId of product.categoryIds) {
      productCategoryIds.add(categoryId);
    }
  }

  if (!categoryHasProducts(category, productCategoryIds)) {
    return null;
  }

  const facets = buildFilterFacets(shopProducts);
  facets.categories = buildChildCategoryFacets(
    category,
    shopProducts,
    productCategoryIds
  );
  const childCategories = buildChildCategoryDisplay(category, productCategoryIds);

  return {
    category,
    products: shopProducts,
    facets,
    childCategories,
    regionId,
  };
}

export async function getStoreCart() {
  return await getEnrichedCart();
}

export async function getStoreCustomer() {
  return await getCustomer();
}

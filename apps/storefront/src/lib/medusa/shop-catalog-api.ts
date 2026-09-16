import type Medusa from "@medusajs/js-sdk";
import type { HttpTypes } from "@medusajs/types";
import { unstable_cache } from "next/cache";
import { getShopPageSize } from "@/lib/medusa/shop-config";
import type { ShopSortValue } from "@/lib/medusa/shop-display";
import type { ShopFilterFacets, ShopFilters } from "@/types/shop";
import { getMedusaClient, getPublicMedusaClient } from "./client";
import { getAuthToken } from "./cookies";

export type ShopCatalogApiResponse = {
  products: HttpTypes.StoreProduct[];
  count: number;
  offset: number;
  limit: number;
  sort: ShopSortValue;
  facets?: ShopFilterFacets;
  product_category_ids?: string[];
  products_index?: Array<{ categoryIds: string[] }>;
};

export type ShopFacetsApiResponse = {
  facets: ShopFilterFacets;
  product_category_ids?: string[];
  products_index?: Array<{ categoryIds: string[] }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function buildCatalogQuery(input: {
  regionId: string;
  sort: ShopSortValue;
  page: number;
  pageSize: number;
  filters: ShopFilters;
  categoryIds?: string[];
  saleOnly?: boolean;
  includeFacets?: boolean;
  explicitPriceMin?: boolean;
  explicitPriceMax?: boolean;
}) {
  const query: Record<string, string | number> = {
    region_id: input.regionId,
    sort: input.sort,
    limit: input.pageSize,
    offset: Math.max(0, (input.page - 1) * input.pageSize),
    include_facets: input.includeFacets === false ? "0" : "1",
  };

  if (input.categoryIds?.length) {
    query.category_id = input.categoryIds.join(",");
  }

  if (input.saleOnly || input.filters.saleOnly) {
    query.sale_only = "true";
  }

  if (input.filters.categoryIds.length) {
    query.categories = input.filters.categoryIds.join(",");
  }

  if (input.filters.sizes.length) {
    query.sizes = input.filters.sizes.join(",");
  }

  if (input.filters.colors.length) {
    query.colors = input.filters.colors.join(",");
  }

  if (input.explicitPriceMin) {
    query.priceMin = String(input.filters.priceMin);
  }

  if (input.explicitPriceMax) {
    query.priceMax = String(input.filters.priceMax);
  }

  for (const [key, values] of Object.entries(input.filters.attributes ?? {})) {
    if (values.length) {
      query[`attr_${key}`] = values.join(",");
    }
  }

  return query;
}

function buildCatalogCacheKey(input: {
  regionId: string;
  sort: ShopSortValue;
  page: number;
  pageSize: number;
  filters: ShopFilters;
  categoryIds?: string[];
  saleOnly?: boolean;
  includeFacets?: boolean;
  explicitPriceMin?: boolean;
  explicitPriceMax?: boolean;
}) {
  return [
    input.regionId,
    input.sort,
    String(input.page),
    String(input.pageSize),
    input.saleOnly || input.filters.saleOnly ? "sale" : "all",
    input.categoryIds?.slice().sort().join(",") ?? "",
    input.includeFacets === false ? "0" : "1",
    input.filters.categoryIds.slice().sort().join(","),
    input.filters.sizes.slice().sort().join(","),
    input.filters.colors.slice().sort().join(","),
    input.explicitPriceMin ? String(input.filters.priceMin) : "",
    input.explicitPriceMax ? String(input.filters.priceMax) : "",
    Object.entries(input.filters.attributes ?? {})
      .map(([key, values]) => `${key}=${values.slice().sort().join(",")}`)
      .sort()
      .join("|"),
  ].join("::");
}

function buildFacetsCacheKey(input: {
  regionId: string;
  categoryIds?: string[];
  saleOnly?: boolean;
}) {
  return [
    input.regionId,
    input.categoryIds?.slice().sort().join(",") ?? "",
    input.saleOnly ? "sale" : "all",
  ].join("::");
}

function fetchShopCatalogPageInternal(
  medusa: Medusa,
  input: {
    regionId: string;
    sort: ShopSortValue;
    page: number;
    filters: ShopFilters;
    categoryIds?: string[];
    saleOnly?: boolean;
    includeFacets?: boolean;
    pageSize?: number;
    searchParams?: Record<string, string | string[] | undefined>;
  }
): Promise<ShopCatalogApiResponse | null> {
  const pageSize = input.pageSize ?? getShopPageSize();
  const explicitPriceMin = firstParam(input.searchParams?.priceMin) !== undefined;
  const explicitPriceMax = firstParam(input.searchParams?.priceMax) !== undefined;

  return medusa.client.fetch<ShopCatalogApiResponse>("/store/shop/catalog", {
    method: "GET",
    query: buildCatalogQuery({
      regionId: input.regionId,
      sort: input.sort,
      page: input.page,
      pageSize,
      filters: input.filters,
      categoryIds: input.categoryIds,
      saleOnly: input.saleOnly,
      includeFacets: input.includeFacets,
      explicitPriceMin,
      explicitPriceMax,
    }),
  });
}

function fetchShopFacetsInternal(
  medusa: Medusa,
  input: {
    regionId: string;
    categoryIds?: string[];
    saleOnly?: boolean;
  }
): Promise<ShopFacetsApiResponse | null> {
  const query: Record<string, string> = {
    region_id: input.regionId,
  };

  if (input.categoryIds?.length) {
    query.category_id = input.categoryIds.join(",");
  }

  if (input.saleOnly) {
    query.sale_only = "true";
  }

  return medusa.client.fetch<ShopFacetsApiResponse>("/store/shop/facets", {
    method: "GET",
    query,
  });
}

export async function fetchShopCatalogPage(input: {
  regionId: string;
  sort: ShopSortValue;
  page: number;
  filters: ShopFilters;
  categoryIds?: string[];
  saleOnly?: boolean;
  includeFacets?: boolean;
  pageSize?: number;
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<ShopCatalogApiResponse | null> {
  if (!input.regionId) {
    return null;
  }

  const pageSize = input.pageSize ?? getShopPageSize();
  const explicitPriceMin = firstParam(input.searchParams?.priceMin) !== undefined;
  const explicitPriceMax = firstParam(input.searchParams?.priceMax) !== undefined;
  const cacheInput = {
    regionId: input.regionId,
    sort: input.sort,
    page: input.page,
    pageSize,
    filters: input.filters,
    categoryIds: input.categoryIds,
    saleOnly: input.saleOnly,
    includeFacets: input.includeFacets,
    explicitPriceMin,
    explicitPriceMax,
  };
  const cacheKey = buildCatalogCacheKey(cacheInput);
  const revalidate = input.includeFacets === false ? 60 : 300;

  // Logged-in customers must get real prices. The backend strips prices for
  // guests, so the shared unstable_cache holds guest (price 0) responses. Bypass
  // the cache and forward the JWT for authenticated requests.
  if (await getAuthToken()) {
    try {
      const medusa = await getMedusaClient();
      return await fetchShopCatalogPageInternal(medusa, input);
    } catch (error) {
      console.warn(
        `[shop-catalog] authenticated /store/shop/catalog fetch failed, degrading to fallback (key=${cacheKey}):`,
        error
      );
      return null;
    }
  }

  const medusa = getPublicMedusaClient();

  try {
    return await unstable_cache(
      async () => fetchShopCatalogPageInternal(medusa, input),
      ["shop-catalog-page", cacheKey],
      { revalidate, tags: ["shop-catalog"] }
    )();
  } catch (error) {
    console.warn(
      `[shop-catalog] /store/shop/catalog fetch failed, degrading to fallback (key=${cacheKey}):`,
      error
    );
    return null;
  }
}

export async function fetchShopFacets(input: {
  regionId: string;
  categoryIds?: string[];
  saleOnly?: boolean;
}): Promise<ShopFacetsApiResponse | null> {
  if (!input.regionId) {
    return null;
  }

  const cacheKey = buildFacetsCacheKey(input);

  // Facets include price ranges, which are zeroed for guests. Forward the JWT
  // and bypass the shared cache for authenticated requests.
  if (await getAuthToken()) {
    try {
      const medusa = await getMedusaClient();
      return await fetchShopFacetsInternal(medusa, input);
    } catch (error) {
      console.warn(
        `[shop-catalog] authenticated /store/shop/facets fetch failed, degrading to fallback (key=${cacheKey}):`,
        error
      );
      return null;
    }
  }

  const medusa = getPublicMedusaClient();

  try {
    return await unstable_cache(
      async () => fetchShopFacetsInternal(medusa, input),
      ["shop-facets", cacheKey],
      { revalidate: 300, tags: ["shop-facets"] }
    )();
  } catch (error) {
    console.warn(
      `[shop-catalog] /store/shop/facets fetch failed, degrading to fallback (key=${cacheKey}):`,
      error
    );
    return null;
  }
}

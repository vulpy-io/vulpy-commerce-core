import { getCategoryContentByHandle } from "@/lib/cms/queries";
import {
  buildChildCategoryDisplay,
  buildChildCategoryFacets,
  collectCategoryDescendantIds,
  getCategoryByHandle,
} from "@/lib/medusa/categories";
import { mapMedusaProductsForShop } from "@/lib/medusa/mappers";
import { listProducts, listProductsByCategoryIds } from "@/lib/medusa/products";
import {
  fetchShopCatalogPage,
  fetchShopFacets,
} from "@/lib/medusa/shop-catalog-api";
import { getShopPageSize } from "@/lib/medusa/shop-config";
import type { ShopSortValue } from "@/lib/medusa/shop-display";
import {
  buildFilterFacets,
  mergePageAttributeFacets,
  normalizeShopFilterFacets,
} from "@/lib/medusa/shop-filters";
import { parseShopSearchParams } from "@/lib/medusa/shop-query";
import type { ShopFilterFacets, ShopFilters, ShopProduct } from "@/types/shop";
import { getCurrencyCode, getRegionId } from "./regions";

type SearchParams = Record<string, string | string[] | undefined>;

function mergeSearchParams(
  presetQuery: string | undefined,
  searchParams?: SearchParams
): SearchParams {
  const preset = Object.fromEntries(
    new URLSearchParams(presetQuery?.trim() || "")
  ) as SearchParams;

  return {
    ...preset,
    ...(searchParams ?? {}),
  };
}

function readSaleOnly(searchParams?: SearchParams) {
  const value = searchParams?.sale_only;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1" || raw === "true";
}

export type ShopCatalogPageResult = {
  products: ShopProduct[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  sort: ShopSortValue;
  filters: ShopFilters;
  facets: ShopFilterFacets;
  regionId: string;
  /** True when requested page is beyond the last page (callers should notFound). */
  outOfRange?: boolean;
};

function emptyFacets(): ShopFilterFacets {
  return buildFilterFacets([]);
}

function resolvePagination(count: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const requested = Math.max(1, page);
  const outOfRange = requested > totalPages;

  return {
    totalCount: count,
    currentPage: outOfRange ? requested : Math.min(requested, totalPages),
    totalPages,
    pageSize,
    outOfRange,
  };
}

async function loadCatalogPageFallback(input: {
  regionId: string;
  currencyCode: string;
  page: number;
  pageSize: number;
  sort: ShopSortValue;
  filters: ShopFilters;
  categoryIds?: string[];
}) {
  const offset = Math.max(0, (input.page - 1) * input.pageSize);
  const listing = input.categoryIds?.length
    ? await listProductsByCategoryIds(
        input.regionId,
        input.categoryIds,
        input.pageSize,
        offset
      )
    : await listProducts(input.regionId, input.pageSize, offset);

  const products = mapMedusaProductsForShop(listing.products, input.currencyCode);
  const facets = normalizeShopFilterFacets(buildFilterFacets(products));
  const filters = parseShopSearchParams({}, facets).filters;
  const pagination = resolvePagination(listing.count, input.page, input.pageSize);
  const productCategoryIds = new Set<string>();

  for (const product of products) {
    for (const categoryId of product.categoryIds) {
      productCategoryIds.add(categoryId);
    }
  }

  return {
    regionId: input.regionId,
    products,
    sort: input.sort,
    filters: input.filters.categoryIds.length ? input.filters : filters,
    facets,
    productCategoryIds,
    productsIndex: products.map((product) => ({
      categoryIds: product.categoryIds,
    })),
    ...pagination,
  };
}

async function loadCatalogPage(input: {
  searchParams?: SearchParams;
  categoryIds?: string[];
  saleOnly?: boolean;
}) {
  const mergedSearchParams = input.searchParams ?? {};
  const saleOnly = input.saleOnly ?? readSaleOnly(mergedSearchParams);

  const [regionId, currencyCode] = await Promise.all([
    getRegionId(),
    getCurrencyCode(),
  ]);

  if (!regionId) {
    return null;
  }

  const pageSize = getShopPageSize();
  const searchParams = mergedSearchParams;
  const bootstrapFacets = emptyFacets();
  const { page, sort } = parseShopSearchParams(searchParams, bootstrapFacets);
  const provisionalFilters = parseShopSearchParams(
    searchParams,
    bootstrapFacets
  ).filters;
  const needsFacets = page <= 1;

  const catalogPromise = fetchShopCatalogPage({
    regionId,
    sort,
    page,
    filters: provisionalFilters,
    categoryIds: input.categoryIds,
    saleOnly,
    includeFacets: false,
    pageSize,
    searchParams,
  });

  const facetsPromise = needsFacets
    ? fetchShopFacets({
        regionId,
        categoryIds: input.categoryIds,
        saleOnly,
      })
    : Promise.resolve(null);

  const [response, facetsResponse] = await Promise.all([
    catalogPromise,
    facetsPromise,
  ]);

  if (!response) {
    console.warn(
      `[shop-catalog] degraded fallback (missing catalog response): categoryIds=${input.categoryIds?.join(",") ?? "-"} sort=${sort} page=${page}. OOS ordering, sorting and filters are NOT applied on this path.`
    );
    return loadCatalogPageFallback({
      regionId,
      currencyCode,
      page,
      pageSize,
      sort,
      filters: provisionalFilters,
      categoryIds: input.categoryIds,
    });
  }

  const facets = facetsResponse?.facets;
  if (needsFacets && !facets) {
    console.warn(
      `[shop-catalog] degraded fallback (missing facets): categoryIds=${input.categoryIds?.join(",") ?? "-"} sort=${sort} page=${page}. OOS ordering, sorting and filters are NOT applied on this path.`
    );
    return loadCatalogPageFallback({
      regionId,
      currencyCode,
      page,
      pageSize,
      sort,
      filters: provisionalFilters,
      categoryIds: input.categoryIds,
    });
  }

  let resolvedFacets = facets ? normalizeShopFilterFacets(facets) : undefined;
  if (!resolvedFacets) {
    const facetsFallback = await fetchShopFacets({
      regionId,
      categoryIds: input.categoryIds,
      saleOnly,
    });
    resolvedFacets = normalizeShopFilterFacets(
      facetsFallback?.facets ?? bootstrapFacets
    );
  }

  const pageProducts = mapMedusaProductsForShop(
    response.products,
    currencyCode
  );

  // Belt & braces: the page's own products can fill attribute facets the
  // backend cache missed (cold/empty facets race after reseed/restart).
  resolvedFacets = mergePageAttributeFacets(resolvedFacets, pageProducts);

  const filters = parseShopSearchParams(searchParams, resolvedFacets).filters;
  const pagination = resolvePagination(response.count, page, pageSize);

  return {
    regionId,
    products: pageProducts,
    sort,
    filters,
    facets: resolvedFacets,
    productCategoryIds: new Set<string>(facetsResponse?.product_category_ids ?? []),
    productsIndex: facetsResponse?.products_index ?? [],
    ...pagination,
  };
}

export async function getShopCatalogPage(
  searchParams?: SearchParams
): Promise<ShopCatalogPageResult | null> {
  const catalog = await loadCatalogPage({ searchParams });
  if (!catalog) {
    return null;
  }

  return {
    products: catalog.products,
    totalCount: catalog.totalCount,
    currentPage: catalog.currentPage,
    totalPages: catalog.totalPages,
    pageSize: catalog.pageSize,
    sort: catalog.sort,
    filters: catalog.filters,
    facets: catalog.facets,
    regionId: catalog.regionId,
    outOfRange: catalog.outOfRange,
  };
}

export async function getSaleCatalogPage(
  searchParams?: SearchParams
): Promise<ShopCatalogPageResult | null> {
  const catalog = await loadCatalogPage({
    searchParams,
    saleOnly: true,
  });

  if (!catalog) {
    return null;
  }

  return {
    products: catalog.products,
    totalCount: catalog.totalCount,
    currentPage: catalog.currentPage,
    totalPages: catalog.totalPages,
    pageSize: catalog.pageSize,
    sort: catalog.sort,
    filters: catalog.filters,
    facets: catalog.facets,
    regionId: catalog.regionId,
    outOfRange: catalog.outOfRange,
  };
}

export async function getCategoryCatalogPage(
  handle: string,
  searchParams?: SearchParams
) {
  const category = await getCategoryByHandle(handle);
  if (!category) {
    return null;
  }

  const categoryIds = collectCategoryDescendantIds(category);
  const catalog = await loadCatalogPage({
    searchParams,
    categoryIds,
  });

  if (!catalog) {
    return null;
  }

  const indexProducts = catalog.productsIndex;

  const childCategoryFacets = buildChildCategoryFacets(
    category,
    indexProducts,
    catalog.productCategoryIds
  );

  return {
    category,
    childCategories: buildChildCategoryDisplay(
      category,
      catalog.productCategoryIds
    ),
    regionId: catalog.regionId,
    productCategoryIds: catalog.productCategoryIds,
    products: catalog.products,
    sort: catalog.sort,
    filters: catalog.filters,
    facets: {
      ...catalog.facets,
      categories: childCategoryFacets.length
        ? childCategoryFacets
        : catalog.facets.categories,
    },
    totalCount: catalog.totalCount,
    currentPage: catalog.currentPage,
    totalPages: catalog.totalPages,
    pageSize: catalog.pageSize,
    outOfRange: catalog.outOfRange,
  };
}

export async function getSelectionCatalogPage(
  handle: string,
  searchParams?: SearchParams
): Promise<ShopCatalogPageResult | null> {
  const categoryContent = await getCategoryContentByHandle(handle);
  if (categoryContent?.kind !== "selection") {
    return null;
  }

  const mergedSearchParams = mergeSearchParams(
    categoryContent.filterQuery,
    searchParams
  );

  const catalog = await loadCatalogPage({
    searchParams: mergedSearchParams,
    saleOnly: readSaleOnly(mergedSearchParams),
  });

  if (!catalog) {
    return null;
  }

  return {
    products: catalog.products,
    totalCount: catalog.totalCount,
    currentPage: catalog.currentPage,
    totalPages: catalog.totalPages,
    pageSize: catalog.pageSize,
    sort: catalog.sort,
    filters: catalog.filters,
    facets: catalog.facets,
    regionId: catalog.regionId,
  };
}

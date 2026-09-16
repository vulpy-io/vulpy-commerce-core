import type { MedusaRequest } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  ProductStatus,
  QueryContext,
} from "@medusajs/framework/utils";
import {
  wrapProductsWithTaxPrices,
  wrapVariantsWithInventoryQuantityForSalesChannel,
  wrapVariantsWithTotalInventoryQuantity,
} from "../../lib/medusa-product-api-internals";
import { tieredCacheGet, tieredCacheSet } from "../../lib/tiered-cache";
import {
  canUseCachedSortedListing,
  canUseDatabaseListing,
} from "./listing-strategy";
import {
  BESTSELLER_SORT_CACHE_TTL_MS,
  buildBestsellerIdsCacheKey,
  buildResponseCacheKey,
  buildShopScopeCacheKey,
  buildSortedIdsCacheKey,
  getCachedBestsellerProductIds,
  getCachedSortedProductIds,
  getOrCreateScopeBuild,
  PRICE_SORT_CACHE_TTL_MS,
  RESPONSE_CACHE_TTL_MS,
  RESPONSE_CACHE_TTL_WITH_FACETS_MS,
  setCachedSortedProductIds,
} from "./shop-catalog-cache";
import {
  buildShopCatalogFacets,
  collectProductCategoryIds,
  createDefaultFilters,
  filterShopCatalogEntries,
  type ShopCatalogFacets,
} from "./shop-facets";
import { type ShopCatalogIndexEntry, toShopCatalogIndexEntry } from "./shop-index";
import {
  buildFiltersFromQuery,
  parseShopCatalogQuery,
} from "./shop-query";
import {
  finalizeStoreProductOrder,
  type ShopSortValue,
  type SortableStoreProduct,
  toMedusaProductOrder,
} from "./sort-products";

type ShopCatalogRequest = MedusaRequest & {
  publishable_key_context?: {
    sales_channel_ids?: string[];
  };
};

interface PricingContext extends Record<string, unknown> {
  region_id: string;
  currency_code: string;
}

const INDEX_FIELDS = [
  "id",
  "title",
  "created_at",
  "metadata",
  "categories.id",
  "categories.name",
  "variants.id",
  "variants.options.*",
  "variants.options.option.*",
  "variants.calculated_price.*",
  "variants.manage_inventory",
  "variants.inventory_quantity",
];

const PRODUCT_FIELDS = [
  "id",
  "title",
  "handle",
  "subtitle",
  "description",
  "thumbnail",
  "created_at",
  "metadata",
  // Catalog cards use thumbnail only — full galleries belong on PDP, not the cache.
  "options.*",
  "options.values.*",
  "tags.*",
  "categories.*",
  "variants.*",
  "variants.options.*",
  "variants.options.option.*",
  "variants.calculated_price.*",
  "variants.thumbnail",
];

const BATCH_SIZE = 100;

function applyDemoSalePrice(product: Record<string, unknown>) {
  const metadata = product.metadata;
  const salePrice = metadata && typeof metadata === "object" && typeof (metadata as Record<string, unknown>).demo_sale_price === "number"
    ? (metadata as Record<string, number>).demo_sale_price
    : null;
  if (salePrice === null || !Array.isArray(product.variants)) {
    return;
  }
  for (const variant of product.variants as Record<string, unknown>[]) {
    const calculated = variant.calculated_price;
    if (!calculated || typeof calculated !== "object") {
      continue;
    }
    const price = calculated as Record<string, unknown>;
    const original = typeof price.original_amount === "number" ? price.original_amount : price.calculated_amount;
    if (typeof original === "number" && salePrice < original) {
      price.original_amount = original;
      price.calculated_amount = salePrice;
    }
  }
}

const PRICING_CONTEXT_TTL_MS = 60 * 60 * 1000;

const pricingContextCache = new Map<
  string,
  { expiresAt: number; value: PricingContext }
>();

function buildPublishedProductFilters(categoryIds?: string[]) {
  const filters: Record<string, unknown> = {
    status: ProductStatus.PUBLISHED,
  };

  if (categoryIds?.length) {
    filters.categories = {
      id: categoryIds,
      is_internal: false,
      is_active: true,
    };
  }

  return filters;
}

function toGraphOrder(sort: ShopSortValue) {
  const order = toMedusaProductOrder(sort);
  if (!order) {
    return undefined;
  }

  if (order.startsWith("-")) {
    return { [order.slice(1)]: "DESC" as const };
  }

  return { [order]: "ASC" as const };
}

function buildResponseCacheQueryKey(rawQuery: Record<string, unknown>) {
  const entries = Object.entries(rawQuery)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`);

  return entries.join("&");
}

async function resolvePricingContext(req: MedusaRequest, regionId: string) {
  const cached = pricingContextCache.get(regionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
    filters: { id: regionId },
  });

  const region = regions?.[0] as { id: string; currency_code: string } | undefined;
  if (!(region?.id && region.currency_code)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Region with id ${regionId} was not found`
    );
  }

  const value = {
    region_id: region.id,
    currency_code: region.currency_code,
  };

  pricingContextCache.set(regionId, {
    value,
    expiresAt: Date.now() + PRICING_CONTEXT_TTL_MS,
  });

  return value;
}

async function wrapVariantInventory(
  req: ShopCatalogRequest,
  variants: Record<string, unknown>[]
) {
  if (!variants.length) {
    return;
  }

  req.validatedQuery ??= {};

  if (req.publishable_key_context?.sales_channel_ids?.length) {
    await wrapVariantsWithInventoryQuantityForSalesChannel(req, variants);
    return;
  }

  await wrapVariantsWithTotalInventoryQuantity(req, variants);
}

async function enrichProducts(
  req: ShopCatalogRequest,
  products: SortableStoreProduct[]
) {
  const variants = products.flatMap((product) => {
    const productVariants = product.variants;
    return Array.isArray(productVariants) ? productVariants : [];
  });

  await wrapVariantInventory(req, variants as Record<string, unknown>[]);
  await wrapProductsWithTaxPrices(req, products);
}

async function fetchIndexEntriesLightweight(
  req: ShopCatalogRequest,
  regionId: string,
  categoryIds?: string[]
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const pricingContext = await resolvePricingContext(req, regionId);

  req.pricingContext = pricingContext;

  const context: Record<string, unknown> = {
    variants: {
      calculated_price: QueryContext(pricingContext),
    },
  };

  const filters = buildPublishedProductFilters(categoryIds);
  const entries: ShopCatalogIndexEntry[] = [];
  let skip = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (skip < totalCount) {
    const { data = [], metadata } = await query.graph(
      {
        entity: "product",
        fields: INDEX_FIELDS,
        filters,
        pagination: {
          skip,
          take: BATCH_SIZE,
        },
        context,
      },
      {
        cache: {
          enable: true,
        },
        locale: req.locale,
      }
    );

    if (!data.length) {
      break;
    }

    // Keep stock-based sorting consistent with response payloads by applying the
    // same inventory enrichment used for fetched product pages.
    const rawProducts = data as Record<string, unknown>[];
    const variants = rawProducts.flatMap((product) => {
      const productVariants = product.variants;
      return Array.isArray(productVariants) ? productVariants : [];
    });
    await wrapVariantInventory(req, variants as Record<string, unknown>[]);

    for (const product of rawProducts) {
      const entry = toShopCatalogIndexEntry(product);
      if (entry) {
        entries.push(entry);
      }
    }

    totalCount = metadata?.count ?? entries.length;
    skip += data.length;

    if (data.length < BATCH_SIZE) {
      break;
    }
  }

  return entries;
}

function getScopeData(
  req: ShopCatalogRequest,
  regionId: string,
  categoryIds: string[] | undefined,
  saleOnly: boolean
) {
  const cacheKey = buildShopScopeCacheKey({ regionId, categoryIds, saleOnly });

  return getOrCreateScopeBuild(cacheKey, async () => {
    const scopeEntries = await fetchIndexEntriesLightweight(req, regionId, categoryIds);
    const entries = saleOnly
      ? scopeEntries.filter((entry) => entry.onSale)
      : scopeEntries;
    const facets = buildShopCatalogFacets(entries);

    return {
      entries,
      facets,
      productCategoryIds: Array.from(collectProductCategoryIds(entries)),
      productsIndex: entries.map((entry) => ({
        categoryIds: entry.categoryIds,
      })),
    };
  });
}

async function getOrBuildSortedProductIds(
  req: ShopCatalogRequest,
  scopeKey: string,
  sort: ShopSortValue,
  regionId: string,
  entries: ShopCatalogIndexEntry[]
) {
  const cacheKey = buildSortedIdsCacheKey(scopeKey, sort);
  const cached = await getCachedSortedProductIds(cacheKey);
  if (cached?.length) {
    return cached;
  }

  const products = await fetchProductsByIds(
    req,
    regionId,
    entries.map((entry) => entry.id)
  );
  const ids = finalizeStoreProductOrder(products, sort)
    .map((product) => product.id)
    .filter((id): id is string => typeof id === "string");
  const ttlMs =
    sort === "bestsellers" ? BESTSELLER_SORT_CACHE_TTL_MS : PRICE_SORT_CACHE_TTL_MS;

  await setCachedSortedProductIds(cacheKey, ids, ttlMs);
  return ids;
}

async function fetchProductsPageFromDatabase(
  req: ShopCatalogRequest,
  sort: ShopSortValue,
  regionId: string,
  categoryIds: string[] | undefined,
  offset: number,
  limit: number
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const pricingContext = await resolvePricingContext(req, regionId);

  req.pricingContext = pricingContext;

  const context: Record<string, unknown> = {
    variants: {
      calculated_price: QueryContext(pricingContext),
    },
  };

  const filters = buildPublishedProductFilters(categoryIds);
  const order = toGraphOrder(sort);

  const { data = [], metadata } = await query.graph(
    {
      entity: "product",
      fields: PRODUCT_FIELDS,
      filters,
      ...(order ? { order } : {}),
      pagination: {
        skip: offset,
        take: limit,
      },
      context,
    },
    {
      cache: {
        enable: true,
      },
      locale: req.locale,
    }
  );

  const products = data as SortableStoreProduct[];
  for (const product of products) {
    applyDemoSalePrice(product as unknown as Record<string, unknown>);
  }
  await enrichProducts(req, products);

  return {
    products: finalizeStoreProductOrder(products, sort),
    count: metadata?.count ?? products.length,
  };
}

async function fetchProductsByIds(
  req: ShopCatalogRequest,
  regionId: string,
  ids: string[]
) {
  if (!ids.length) {
    return [];
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const pricingContext = await resolvePricingContext(req, regionId);

  req.pricingContext = pricingContext;

  const context: Record<string, unknown> = {
    variants: {
      calculated_price: QueryContext(pricingContext),
    },
  };

  const products: SortableStoreProduct[] = [];

  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const chunk = ids.slice(index, index + BATCH_SIZE);
    const { data = [] } = await query.graph(
      {
        entity: "product",
        fields: PRODUCT_FIELDS,
        filters: {
          id: chunk,
          status: ProductStatus.PUBLISHED,
        },
        pagination: {
          take: chunk.length,
        },
        context,
      },
      {
        cache: {
          enable: true,
        },
        locale: req.locale,
      }
    );

    const batch = data as SortableStoreProduct[];
    for (const product of batch) {
      applyDemoSalePrice(product as unknown as Record<string, unknown>);
    }
    products.push(...batch);
  }

  await enrichProducts(req, products);

  const byId = new Map(
    products
      .filter((product) => typeof product.id === "string")
      .map((product) => [product.id as string, product])
  );

  return ids
    .map((id) => byId.get(id))
    .filter((product): product is SortableStoreProduct => Boolean(product));
}

function buildFacetPayload(scopeData: {
  facets: ShopCatalogFacets;
  productCategoryIds: string[];
  productsIndex: Array<{ categoryIds: string[] }>;
}) {
  return {
    facets: scopeData.facets,
    productCategoryIds: scopeData.productCategoryIds,
    productsIndex: scopeData.productsIndex,
  };
}

async function resolveShopCatalogViaDatabase(
  req: ShopCatalogRequest,
  parsed: ReturnType<typeof parseShopCatalogQuery>
) {
  const page = await fetchProductsPageFromDatabase(
    req,
    parsed.sort,
    parsed.regionId,
    parsed.categoryIds,
    parsed.offset,
    parsed.limit
  );

  const facetPayload = parsed.includeFacets
    ? buildFacetPayload(
        await getScopeData(req, parsed.regionId, parsed.categoryIds, parsed.saleOnly)
      )
    : undefined;

  return {
    products: page.products,
    count: page.count,
    offset: parsed.offset,
    limit: parsed.limit,
    sort: parsed.sort,
    ...facetPayload,
  };
}

async function resolveShopCatalogViaSortedIds(
  req: ShopCatalogRequest,
  parsed: ReturnType<typeof parseShopCatalogQuery>
) {
  let sortedIds: string[] | null = null;

  if (parsed.sort === "bestsellers" && !parsed.categoryIds?.length) {
    sortedIds = await getCachedBestsellerProductIds();
  }

  const scopeKey = buildShopScopeCacheKey({
    regionId: parsed.regionId,
    categoryIds: parsed.categoryIds,
    saleOnly: parsed.saleOnly,
  });

  if (!sortedIds?.length) {
    const scopeData = await getScopeData(
      req,
      parsed.regionId,
      parsed.categoryIds,
      parsed.saleOnly
    );
    sortedIds = await getOrBuildSortedProductIds(
      req,
      scopeKey,
      parsed.sort,
      parsed.regionId,
      scopeData.entries
    );
  }

  const pageIds = sortedIds.slice(parsed.offset, parsed.offset + parsed.limit);
  const products = await fetchProductsByIds(req, parsed.regionId, pageIds);
  const facetPayload = parsed.includeFacets
    ? buildFacetPayload(
        await getScopeData(req, parsed.regionId, parsed.categoryIds, parsed.saleOnly)
      )
    : undefined;

  return {
    products,
    count: sortedIds.length,
    offset: parsed.offset,
    limit: parsed.limit,
    sort: parsed.sort,
    ...facetPayload,
  };
}

async function resolveShopCatalogViaIndex(
  req: ShopCatalogRequest,
  parsed: ReturnType<typeof parseShopCatalogQuery>
) {
  const scopeData = await getScopeData(
    req,
    parsed.regionId,
    parsed.categoryIds,
    parsed.saleOnly
  );
  const defaultFilters = createDefaultFilters(scopeData.facets);
  const filters = buildFiltersFromQuery(parsed, defaultFilters);
  const filteredEntries = filterShopCatalogEntries(scopeData.entries, filters);
  const sortedEntries = finalizeStoreProductOrder(filteredEntries, parsed.sort);
  const pageIds = sortedEntries
    .slice(parsed.offset, parsed.offset + parsed.limit)
    .map((entry) => entry.id);
  const products = await fetchProductsByIds(req, parsed.regionId, pageIds);

  return {
    products,
    count: sortedEntries.length,
    offset: parsed.offset,
    limit: parsed.limit,
    sort: parsed.sort,
    ...(parsed.includeFacets ? buildFacetPayload(scopeData) : {}),
  };
}

export interface ShopCatalogResult {
  products: SortableStoreProduct[];
  count: number;
  offset: number;
  limit: number;
  sort: ShopSortValue;
  facets?: ShopCatalogFacets;
  productCategoryIds?: string[];
  productsIndex?: Array<{ categoryIds: string[] }>;
}

export interface ShopFacetsResult {
  facets: ShopCatalogFacets;
  productCategoryIds: string[];
  productsIndex: Array<{ categoryIds: string[] }>;
}

export async function resolveShopFacets(
  req: ShopCatalogRequest,
  rawQuery: Record<string, unknown>
): Promise<ShopFacetsResult> {
  const parsed = parseShopCatalogQuery(rawQuery);

  if (!parsed.regionId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "region_id query parameter is required"
    );
  }

  const cacheKey = buildResponseCacheKey(
    `facets:${buildResponseCacheQueryKey(rawQuery)}`
  );
  const cached = await tieredCacheGet<ShopFacetsResult>(cacheKey);
  if (cached) {
    return cached;
  }

  const scopeData = await getScopeData(
    req,
    parsed.regionId,
    parsed.categoryIds,
    parsed.saleOnly
  );
  const result = buildFacetPayload(scopeData);

  await tieredCacheSet(cacheKey, result, RESPONSE_CACHE_TTL_WITH_FACETS_MS);
  return result;
}

export async function resolveShopCatalog(
  req: ShopCatalogRequest,
  rawQuery: Record<string, unknown>
): Promise<ShopCatalogResult> {
  const parsed = parseShopCatalogQuery(rawQuery);

  if (!parsed.regionId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "region_id query parameter is required"
    );
  }

  const responseCacheKey = buildResponseCacheKey(
    buildResponseCacheQueryKey(rawQuery)
  );
  const cachedResponse = await tieredCacheGet<ShopCatalogResult>(responseCacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  let result: ShopCatalogResult;

  if (canUseDatabaseListing(parsed)) {
    result = await resolveShopCatalogViaDatabase(req, parsed);
  } else if (canUseCachedSortedListing(parsed)) {
    result = await resolveShopCatalogViaSortedIds(req, parsed);
  } else {
    result = await resolveShopCatalogViaIndex(req, parsed);
  }

  await tieredCacheSet(
    responseCacheKey,
    result,
    parsed.includeFacets
      ? RESPONSE_CACHE_TTL_WITH_FACETS_MS
      : RESPONSE_CACHE_TTL_MS
  );

  return result;
}

export async function warmShopCatalogCache(
  container: MedusaContainer,
  regionId: string
) {
  const req = { scope: container } as ShopCatalogRequest;

  await resolveShopCatalog(req, {
    region_id: regionId,
    sort: "latest",
    limit: "12",
    offset: "0",
    include_facets: "0",
  });

  await resolveShopCatalog(req, {
    region_id: regionId,
    sort: "bestsellers",
    limit: "12",
    offset: "0",
    include_facets: "0",
  });

  await resolveShopFacets(req, {
    region_id: regionId,
  });

  return {
    regionId,
    bestsellerIdsKey: buildBestsellerIdsCacheKey(),
  };
}

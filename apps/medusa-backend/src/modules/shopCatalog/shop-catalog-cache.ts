import {
  shopCacheKey,
  tieredCacheDeleteByPrefix,
  tieredCacheGet,
  tieredCacheSet,
} from "../../lib/tiered-cache";
import type { ShopCatalogFacets } from "./shop-facets";
import type { ShopCatalogIndexEntry } from "./shop-index";
import type { ShopSortValue } from "./sort-products";

export const FACET_CACHE_TTL_MS = 30 * 60 * 1000;
export const PRICE_SORT_CACHE_TTL_MS = 15 * 60 * 1000;
export const BESTSELLER_SORT_CACHE_TTL_MS = 25 * 60 * 60 * 1000;
export const RESPONSE_CACHE_TTL_MS = 60 * 1000;
export const RESPONSE_CACHE_TTL_WITH_FACETS_MS = 5 * 60 * 1000;

export interface CachedShopScopeData {
  expiresAt: number;
  entries: ShopCatalogIndexEntry[];
  facets: ShopCatalogFacets;
  productCategoryIds: string[];
  productsIndex: Array<{ categoryIds: string[] }>;
}

let cacheGeneration = 1;
const scopeBuilds = new Map<string, Promise<CachedShopScopeData>>();

export function buildShopScopeCacheKey(input: {
  regionId: string;
  categoryIds?: string[];
  saleOnly: boolean;
}) {
  const categories = input.categoryIds?.slice().sort().join(",") ?? "";
  return shopCacheKey(
    `g${cacheGeneration}`,
    "scope",
    input.regionId,
    categories || "all",
    input.saleOnly ? "sale" : "all"
  );
}

export function buildSortedIdsCacheKey(
  scopeKey: string,
  sort: ShopSortValue
) {
  return shopCacheKey(`g${cacheGeneration}`, "sorted", scopeKey, sort);
}

export function buildResponseCacheKey(queryKey: string) {
  return shopCacheKey(`g${cacheGeneration}`, "response", queryKey);
}

export function buildBestsellerIdsCacheKey() {
  return "catalog:bestseller-ids:global";
}

export function getCachedShopScopeData(key: string): Promise<CachedShopScopeData | null> {
  return tieredCacheGet<CachedShopScopeData>(key);
}

export async function setCachedShopScopeData(
  key: string,
  data: Omit<CachedShopScopeData, "expiresAt">
): Promise<void> {
  await tieredCacheSet(
    key,
    {
      ...data,
      expiresAt: Date.now() + FACET_CACHE_TTL_MS,
    },
    FACET_CACHE_TTL_MS
  );
}

export function getCachedSortedProductIds(key: string): Promise<string[] | null> {
  return tieredCacheGet<string[]>(key);
}

export async function setCachedSortedProductIds(
  key: string,
  ids: string[],
  ttlMs: number
): Promise<void> {
  await tieredCacheSet(key, ids, ttlMs);
}

export function getCachedBestsellerProductIds(): Promise<string[] | null> {
  return tieredCacheGet<string[]>(buildBestsellerIdsCacheKey());
}

export async function setCachedBestsellerProductIds(
  ids: string[]
): Promise<void> {
  await tieredCacheSet(
    buildBestsellerIdsCacheKey(),
    ids,
    BESTSELLER_SORT_CACHE_TTL_MS
  );
}

export function getOrCreateScopeBuild(
  key: string,
  build: () => Promise<Omit<CachedShopScopeData, "expiresAt">>
) {
  const inFlight = scopeBuilds.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    const cached = await getCachedShopScopeData(key);
    if (cached) {
      return cached;
    }

    const data = await build();
    await setCachedShopScopeData(key, data);
    const stored = await getCachedShopScopeData(key);
    return stored ?? { ...data, expiresAt: Date.now() + FACET_CACHE_TTL_MS };
  })().finally(() => {
    scopeBuilds.delete(key);
  });

  scopeBuilds.set(key, promise);
  return promise;
}

export async function invalidateShopCatalogCache(): Promise<void> {
  cacheGeneration += 1;
  scopeBuilds.clear();
  await tieredCacheDeleteByPrefix(shopCacheKey(""));
}

import { hasActiveFilterParams, type parseShopCatalogQuery } from "./shop-query";

export type ParsedShopCatalogQuery = ReturnType<typeof parseShopCatalogQuery>;

export function canUseDatabaseListing(_parsed: ParsedShopCatalogQuery) {
  // Disabled intentionally: DB pagination happens before stock demotion, which can
  // reintroduce in-stock products after out-of-stock ones when pages are combined.
  return false;
}

export function canUseCachedSortedListing(parsed: ParsedShopCatalogQuery) {
  if (parsed.saleOnly || hasActiveFilterParams(parsed)) {
    return false;
  }

  return true;
}

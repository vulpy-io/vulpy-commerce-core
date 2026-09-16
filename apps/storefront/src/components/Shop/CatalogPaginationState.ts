import type { ShopSortValue } from "@/lib/medusa/shop-display";
import { buildShopCatalogHref } from "@/lib/medusa/shop-query";
import type { ShopFilters } from "@/types/shop";

/**
 * Build the pagination bar's next-page deep link from the page the user is
 * actually viewing (the loaded page under infinite scroll), not the URL
 * param. When the user landed on ?page=3 and scrolled to page 4, the URL still
 * says 3 — the bar must link to 4, then onward via server pages.
 */
export function getLoadedPageHref(
  catalogPath: string,
  input: {
    loadedPage: number;
    totalPages: number;
    sort: ShopSortValue;
    filters: ShopFilters;
    priceDefaults?: { priceMin: number; priceMax: number };
  }
): string | null {
  if (input.loadedPage >= input.totalPages) {
    return null;
  }
  return buildShopCatalogHref(catalogPath, {
    page: input.loadedPage + 1,
    sort: input.sort,
    filters: input.filters,
    priceDefaults: input.priceDefaults,
  });
}
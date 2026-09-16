import { notFound, redirect } from "next/navigation";
import type { ShopCatalogPageResult } from "@/lib/medusa/shop-catalog.server";
import { buildShopCatalogHref } from "@/lib/medusa/shop-query";

type SearchParams = Record<string, string | string[] | undefined>;

function readRawPage(searchParams?: SearchParams): string | undefined {
  const value = searchParams?.page;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Redirect ?page=1 → clean URL; 404 when page is beyond the last page.
 */
export function enforceCatalogPagination(
  catalog: ShopCatalogPageResult,
  catalogPath: string,
  searchParams?: SearchParams
): void {
  const rawPage = readRawPage(searchParams);
  if (rawPage === "1") {
    redirect(
      buildShopCatalogHref(catalogPath, {
        page: 1,
        sort: catalog.sort,
        filters: catalog.filters,
        priceDefaults: {
          priceMin: catalog.facets.priceMin,
          priceMax: catalog.facets.priceMax,
        },
      })
    );
  }
  if (catalog.outOfRange) {
    notFound();
  }
}

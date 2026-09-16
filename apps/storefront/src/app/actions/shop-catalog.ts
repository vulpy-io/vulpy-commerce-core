"use server";

import {
  getCategoryCatalogPage,
  getSaleCatalogPage,
  getSelectionCatalogPage,
  getShopCatalogPage,
} from "@/lib/medusa/shop-catalog.server";
import type { ShopSortValue } from "@/lib/medusa/shop-display";
import { buildShopQueryString } from "@/lib/medusa/shop-query";
import type { ShopFilters, ShopProduct } from "@/types/shop";

export type ShopCatalogPageActionResult = {
  products: ShopProduct[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
};

function toSearchParams(input: {
  page: number;
  sort: ShopSortValue;
  filters: ShopFilters;
}) {
  const query = buildShopQueryString(input);
  return Object.fromEntries(new URLSearchParams(query)) as Record<
    string,
    string | string[] | undefined
  >;
}

export type ShopCatalogScope = "shop" | "sale" | "selection";

export async function loadShopCatalogPageAction(input: {
  categoryHandle?: string;
  catalogScope?: ShopCatalogScope;
  selectionHandle?: string;
  page: number;
  sort: ShopSortValue;
  filters: ShopFilters;
}): Promise<ShopCatalogPageActionResult | null> {
  const searchParams = toSearchParams({
    page: input.page,
    sort: input.sort,
    filters: input.filters,
  });

  const catalog = input.selectionHandle
    ? await getSelectionCatalogPage(input.selectionHandle, searchParams)
    : input.categoryHandle
      ? await getCategoryCatalogPage(input.categoryHandle, searchParams)
      : input.catalogScope === "sale"
        ? await getSaleCatalogPage(searchParams)
        : await getShopCatalogPage(searchParams);

  if (!catalog) {
    return null;
  }

  return {
    products: catalog.products,
    currentPage: catalog.currentPage,
    totalPages: catalog.totalPages,
    totalCount: catalog.totalCount,
    pageSize: catalog.pageSize,
  };
}

import type { CmsBlock } from "@/lib/cms/types";
import { mapMedusaProducts } from "@/lib/medusa/mappers";
import { listProducts } from "@/lib/medusa/products";
import { fetchShopCatalogPage } from "@/lib/medusa/shop-catalog-api";
import type { ShopSortValue } from "@/lib/medusa/shop-display";
import { buildFilterFacets, createDefaultFilters } from "@/lib/medusa/shop-filters";
import type { Product } from "@/types/product";
import { getCurrencyCode, getRegionId } from "./regions";

const DEFAULT_HOME_GRID_LIMIT = 12;

function getProductGridLimit(
  blocks: CmsBlock[],
  variant: "new-arrivals" | "best-sellers"
) {
  const limits = blocks
    .filter(
      (block): block is Extract<CmsBlock, { blockType: "productGrid" }> =>
        block.blockType === "productGrid" && block.variant === variant
    )
    .map((block) => block.limit ?? DEFAULT_HOME_GRID_LIMIT);

  if (!limits.length) {
    return DEFAULT_HOME_GRID_LIMIT;
  }

  return Math.max(...limits);
}

async function fetchSortedHomeProducts(
  regionId: string,
  currencyCode: string,
  sort: ShopSortValue,
  limit: number
) {
  const response = await fetchShopCatalogPage({
    regionId,
    sort,
    page: 1,
    filters: createDefaultFilters(buildFilterFacets([])),
    includeFacets: false,
    pageSize: limit,
  });

  if (!response) {
    const { products } = await listProducts(regionId, limit);
    return mapMedusaProducts(products, currencyCode);
  }

  return mapMedusaProducts(response.products, currencyCode);
}

export async function getHomeProductGrids(blocks: CmsBlock[]) {
  const [regionId, currencyCode] = await Promise.all([
    getRegionId(),
    getCurrencyCode(),
  ]);

  if (!regionId) {
    return {
      newArrivalProducts: [] as Product[],
      bestsellerProducts: [] as Product[],
    };
  }

  const newLimit = getProductGridLimit(blocks, "new-arrivals");
  const bestsellerLimit = getProductGridLimit(blocks, "best-sellers");

  const [newArrivalProducts, bestsellerProducts] = await Promise.all([
    fetchSortedHomeProducts(regionId, currencyCode, "latest", newLimit),
    fetchSortedHomeProducts(regionId, currencyCode, "bestsellers", bestsellerLimit),
  ]);

  return {
    newArrivalProducts,
    bestsellerProducts,
  };
}

"use server";

import { getRegionId } from "@/lib/medusa/regions";
import {
  mapSearchHitToProduct,
  mapSearchHitToSuggestion,
  type ProductSearchSuggestion,
  searchProducts,
} from "@/lib/medusa/search";
import { deprioritizeOutOfStockProducts } from "@/lib/medusa/shop-display";

export async function searchProductsAction(
  query: string,
  categoryId?: string,
  limit = 8,
  regionIdOverride?: string
): Promise<ProductSearchSuggestion[]> {
  const term = query.trim();
  if (term.length < 2) {
    return [];
  }

  const regionId = regionIdOverride || (await getRegionId());
  if (!regionId) {
    return [];
  }

  const result = await searchProducts({
    query: term,
    regionId,
    categoryId,
    limit,
    offset: 0,
  });

  const orderedHits = deprioritizeOutOfStockProducts(
    result.hits.map((hit) => mapSearchHitToProduct(hit))
  );

  const hitById = new Map(result.hits.map((hit) => [hit.id, hit]));

  return orderedHits
    .map((product) => {
      const hit = hitById.get(product.productId ?? product.id);
      return hit ? mapSearchHitToSuggestion(hit) : null;
    })
    .filter((entry): entry is ProductSearchSuggestion => Boolean(entry))
    .slice(0, limit);
}

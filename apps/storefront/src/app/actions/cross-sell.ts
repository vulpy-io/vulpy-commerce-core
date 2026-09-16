"use server";

import { mapMedusaProductToProduct } from "@/lib/medusa/mappers";
import { listProducts } from "@/lib/medusa/products";
import { getRegionId } from "@/lib/medusa/regions";
import type { Product } from "@/types/product";

export async function getCrossSellProductsAction(
  excludeVariantIds: string[] = [],
  limit = 12
): Promise<Product[]> {
  const regionId = await getRegionId();
  if (!regionId) {
    return [];
  }

  const exclude = new Set(excludeVariantIds.filter(Boolean));
  const { products } = await listProducts(regionId, 120, 0);

  const eligible = products
    .map((entry) => mapMedusaProductToProduct(entry))
    .filter(
      (product) =>
        product.variantId &&
        !exclude.has(product.variantId) &&
        product.inStock !== false
    );

  for (let index = eligible.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = eligible[index];
    const swap = eligible[swapIndex];
    if (current && swap) {
      eligible[index] = swap;
      eligible[swapIndex] = current;
    }
  }

  return eligible.slice(0, limit);
}

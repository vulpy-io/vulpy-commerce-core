import type { HttpTypes } from "@medusajs/types";
import type { CartInspection } from "./cart-issues";
import { inspectCartLineItemsWithCatalog } from "./cart-issues";
import { getProductsByIds } from "./products";

export async function inspectCartLineItems(
  items: HttpTypes.StoreCartLineItem[],
  regionId: string
): Promise<CartInspection> {
  if (!items.length) {
    return { unavailableLineItemIds: [], removedTitles: [], outOfStockIssues: [] };
  }

  const productIds = Array.from(
    new Set(items.map((item) => item.product_id).filter(Boolean) as string[])
  );

  const { products } = await getProductsByIds(productIds, regionId);

  const variantMap = new Map(
    products.flatMap(
      (product) =>
        product.variants?.map((variant) => [variant.id, variant]) ?? []
    )
  );

  return inspectCartLineItemsWithCatalog(items, variantMap);
}

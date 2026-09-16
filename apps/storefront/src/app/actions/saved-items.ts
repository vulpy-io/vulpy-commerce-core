"use server";

import { mapMedusaProducts } from "@/lib/medusa/mappers";
import { getProductsByHandles } from "@/lib/medusa/products";
import { getCurrencyCode, getRegionId } from "@/lib/medusa/regions";

/** Fully-rebuilt saved item, identical in shape to the wishlist /
 *  recently-viewed slice items so the hydrate reducers accept it directly. */
export type RehydratedSavedItem = {
  id: string;
  title: string;
  price: number;
  discountedPrice: number;
  minPrice?: number;
  maxPrice?: number;
  quantity: number;
  status?: string;
  handle: string;
  variantId?: string;
  variantLabel?: string;
  imgs?: {
    thumbnails: string[];
    previews: string[];
  };
};

// Wishlist and recently-viewed persist ONLY product handles to localStorage —
// no names, images, or prices. Everything displayable is rebuilt fresh from
// Medusa on every page load, so prices/stock/titles/images never go stale and
// no product data is trusted from client storage.
export async function rehydrateSavedItemsAction(
  handles: string[]
): Promise<RehydratedSavedItem[]> {
  const uniqueHandles = Array.from(
    new Set(handles.filter((handle) => typeof handle === "string" && handle))
  );
  if (uniqueHandles.length === 0) {
    return [];
  }

  const [regionId, currencyCode] = await Promise.all([
    getRegionId(),
    getCurrencyCode(),
  ]);
  if (!regionId) {
    return [];
  }

  const products = await getProductsByHandles(uniqueHandles, regionId);
  const byHandle = new Map<string, RehydratedSavedItem>();

  for (const product of mapMedusaProducts(products, currencyCode)) {
    if (!product.handle) {
      continue;
    }
    byHandle.set(product.handle, {
      id: product.id,
      title: product.title,
      price: product.price,
      discountedPrice: product.discountedPrice,
      minPrice: product.minPrice,
      maxPrice: product.maxPrice,
      quantity: 1,
      status: product.inStock === false ? "out_of_stock" : "available",
      handle: product.handle,
      variantId: product.variantId,
      variantLabel: product.variantLabel,
      imgs: product.imgs,
    });
  }

  // Preserve the persisted order (most-recent-first); drop handles that no
  // longer resolve to a live product.
  const items: RehydratedSavedItem[] = [];
  for (const handle of uniqueHandles) {
    const item = byHandle.get(handle);
    if (item) {
      items.push(item);
    }
  }
  return items;
}

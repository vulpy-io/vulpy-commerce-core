"use server";

import config from "@/config";
import { mapMedusaProductToDetail } from "@/lib/medusa/mappers";
import { getProductByHandle } from "@/lib/medusa/products";
import type { ProductDetail } from "@/types/product-detail";

export async function getProductDetailForQuickView(
  handle: string,
  regionId: string,
  currencyCode?: string
): Promise<ProductDetail | null> {
  const medusaProduct = await getProductByHandle(handle, regionId);
  if (!medusaProduct) {
    return null;
  }
  return mapMedusaProductToDetail(medusaProduct, currencyCode);
}

export async function getProductDetailForQuickViewByCountry(
  handle: string
): Promise<ProductDetail | null> {
  const { getRegion } = await import("@/lib/medusa/regions");
  const region = await getRegion(config.defaultCountryCode);
  if (!region) {
    return null;
  }
  return getProductDetailForQuickView(handle, region.id, region.currency_code);
}

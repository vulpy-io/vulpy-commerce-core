import type { ProductDetail, ProductVariantDetail } from "@/types/product-detail";

export type StockFields = {
  manageInventory?: boolean;
  inventoryQuantity?: number | null;
};

export function isVariantInStock(variant: StockFields): boolean {
  const manageInventory = variant.manageInventory ?? false;
  if (manageInventory === false) {
    return true;
  }
  return (variant.inventoryQuantity ?? 0) > 0;
}

export function isProductInStock(
  variants: Pick<ProductVariantDetail, "manageInventory" | "inventoryQuantity">[]
): boolean {
  return variants.some((variant) => isVariantInStock(variant));
}

export function isProductDetailInStock(product: ProductDetail): boolean {
  return isProductInStock(product.variants);
}

export function getDiscountPercent(
  price: number,
  discountedPrice: number
): number | null {
  if (price <= 0 || discountedPrice >= price) {
    return null;
  }
  return Math.round(((price - discountedPrice) / price) * 100);
}

export function getMaxPurchasableQuantity(
  variant: StockFields,
  fallback = 99
): number {
  if (variant.manageInventory === false) {
    return fallback;
  }
  return Math.max(0, variant.inventoryQuantity ?? 0);
}

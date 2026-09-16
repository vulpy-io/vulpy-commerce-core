import type { ProductStoreTag } from "@/lib/medusa/product-tags";

export type ProductAttribute = {
  label: string;
  value: string;
};

export type ProductOption = {
  id: string;
  title: string;
  values: string[];
};

export type ProductVariantDetail = {
  id: string;
  title: string;
  sku?: string | null;
  ean?: string | null;
  optionValues: Record<string, string>;
  price: number;
  discountedPrice: number;
  thumbnail?: string | null;
  manageInventory?: boolean;
  inventoryQuantity?: number | null;
  inStock?: boolean;
};

export type ProductDetail = {
  productId: string;
  handle: string;
  title: string;
  description?: string | null;
  fullDescription?: string | null;
  attributes?: ProductAttribute[];
  images: string[];
  options: ProductOption[];
  variants: ProductVariantDetail[];
  inStock?: boolean;
  storeTags?: ProductStoreTag[];
};

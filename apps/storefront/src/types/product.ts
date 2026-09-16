import type { ProductStoreTag } from "@/lib/medusa/product-tags";

export type ProductFinishVariant = {
  /** Finish option value (matches `finishes` entry). */
  name: string;
  /** Variant id carrying this finish — used for PDP `?variant=` deep links. */
  variantId: string;
  /** Variant image (metadata.image_url / thumbnail), if any. */
  image?: string;
};

export type Product = {
  title: string;
  reviews: number;
  price: number;
  discountedPrice: number;
  minPrice?: number;
  maxPrice?: number;
  id: string;
  handle?: string;
  variantId?: string;
  productId?: string;
  variantCount?: number;
  inStock?: boolean;
  variantLabel?: string;
  /** Unique Finish option values across variants, in catalog order. */
  finishes?: string[];
  /** Per-finish variant lookup: variant id (PDP deep link) + variant image. */
  finishVariants?: ProductFinishVariant[];
  storeTags?: ProductStoreTag[];
  brand?: string;
  createdAt?: string;
  updatedAt?: string;
  salesCount?: number;
  imgs?: {
    thumbnails: string[];
    previews: string[];
  };
};

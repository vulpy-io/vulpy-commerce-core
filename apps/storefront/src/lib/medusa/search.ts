import type { HttpTypes } from "@medusajs/types";
import { PRODUCT_PLACEHOLDER_IMAGE, resolveMedusaAssetUrlOrFallback } from "@/lib/medusa/asset-url";
import {
  collectCategoryDescendantIds,
  listCategoryTree,
} from "@/lib/medusa/categories";
import type { Product } from "@/types/product";
import type { ShopProduct } from "@/types/shop";
import { getMedusaClient } from "./client";
import { firstFiniteAmount, fromMedusaAmount, getPriceBounds } from "./money";
import { isProductInStock } from "./stock";

type SearchVariantPrice = {
  calculated_amount: number;
  original_amount: number;
  currency_code: string;
};

type SearchVariant = {
  id: string;
  title: string;
  sku: string | null;
  manage_inventory?: boolean;
  inventory_quantity?: number | null;
  options: Array<{ option_title: string; value: string }>;
  calculated_price: SearchVariantPrice | null;
};

export type ProductSearchHit = {
  id: string;
  title: string;
  handle: string;
  description: string;
  thumbnail: string;
  model: string;
  category_ids: string[];
  categories: string[];
  filterable_attributes: Record<string, string>;
  variants: SearchVariant[];
};

export type ProductSearchSuggestion = {
  id: string;
  handle: string;
  title: string;
  model: string;
  description: string;
  thumbnail: string;
  price: number;
  discountedPrice: number;
  minPrice: number;
  maxPrice: number;
};

type ProductSearchResponse = {
  count: number;
  limit: number;
  offset: number;
  hits: ProductSearchHit[];
};

function findCategoryById(
  categories: Array<{
    id?: string | null;
    category_children?: unknown[];
  }>,
  targetId: string
): { id: string; category_children?: unknown[] } | null {
  for (const category of categories) {
    if (category.id === targetId) {
      return category as { id: string; category_children?: unknown[] };
    }

    if (Array.isArray(category.category_children)) {
      const nested = findCategoryById(
        category.category_children as Array<{
          id?: string | null;
          category_children?: unknown[];
        }>,
        targetId
      );
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

async function resolveCategoryScopeIds(categoryId?: string) {
  if (!categoryId) {
    return undefined;
  }

  const categories = await listCategoryTree();
  const selected = findCategoryById(
    categories as Array<{ id?: string | null; category_children?: unknown[] }>,
    categoryId
  );

  if (!selected) {
    return [categoryId];
  }

  return collectCategoryDescendantIds(selected as HttpTypes.StoreProductCategory);
}

function resolveSearchVariantDisplayPrices(
  variant: SearchVariant,
  currencyCode?: string
) {
  const calculated = variant.calculated_price;
  const hasCalculated = calculated?.calculated_amount != null;
  const calculatedPrice = fromMedusaAmount(
    calculated?.calculated_amount,
    currencyCode
  );
  const hasOriginal = calculated?.original_amount != null;
  const original = fromMedusaAmount(calculated?.original_amount, currencyCode);
  const discountedPrice = hasCalculated ? calculatedPrice : original;
  const price = hasOriginal ? original : discountedPrice;

  return {
    price: firstFiniteAmount(price, discountedPrice),
    discountedPrice: firstFiniteAmount(discountedPrice, price),
  };
}

function resolveSearchHitPriceBounds(hit: ProductSearchHit) {
  let cheapest: {
    variant: SearchVariant;
    price: number;
    discountedPrice: number;
  } | null = null;
  let onSale = false;
  const effectiveAmounts: number[] = [];

  for (const variant of hit.variants) {
    if (!variant.calculated_price) {
      continue;
    }

    const currencyCode = variant.calculated_price.currency_code;
    const display = resolveSearchVariantDisplayPrices(variant, currencyCode);
    if (display.price > display.discountedPrice) {
      onSale = true;
    }

    const effective = display.discountedPrice;
    if (!Number.isFinite(effective)) {
      continue;
    }

    effectiveAmounts.push(effective);
    if (
      !cheapest ||
      effective < cheapest.discountedPrice ||
      (effective === cheapest.discountedPrice && display.price < cheapest.price)
    ) {
      cheapest = { variant, ...display };
    }
  }

  const bounds = getPriceBounds(effectiveAmounts);

  if (!cheapest) {
    return {
      minPrice: 0,
      maxPrice: 0,
      price: 0,
      discountedPrice: 0,
      cheapestVariant: null as SearchVariant | null,
      onSale: false,
    };
  }

  return {
    minPrice: bounds.minPrice,
    maxPrice: bounds.maxPrice,
    price: cheapest.price,
    discountedPrice: cheapest.discountedPrice,
    cheapestVariant: cheapest.variant,
    onSale,
  };
}

export async function searchProducts({
  query,
  regionId,
  limit = 20,
  offset = 0,
  categoryId,
}: {
  query: string;
  regionId: string;
  limit?: number;
  offset?: number;
  categoryId?: string;
}): Promise<ProductSearchResponse> {
  const medusa = await getMedusaClient();
  const categoryScopeIds = await resolveCategoryScopeIds(categoryId);

  return await medusa.client.fetch<ProductSearchResponse>("/store/search", {
    method: "GET",
    query: {
      q: query,
      region_id: regionId,
      limit,
      offset,
      ...(categoryScopeIds?.length
        ? { category_id: categoryScopeIds.join(",") }
        : {}),
    },
  });
}

export function mapSearchHitToSuggestion(
  hit: ProductSearchHit
): ProductSearchSuggestion {
  const bounds = resolveSearchHitPriceBounds(hit);

  return {
    id: hit.id,
    handle: hit.handle,
    title: hit.title,
    model: hit.model,
    description: hit.description,
    thumbnail: resolveMedusaAssetUrlOrFallback(hit.thumbnail, PRODUCT_PLACEHOLDER_IMAGE),
    price: bounds.price,
    discountedPrice: bounds.discountedPrice,
    minPrice: bounds.minPrice,
    maxPrice: bounds.maxPrice,
  };
}

export function mapSearchHitToProduct(hit: ProductSearchHit): Product {
  const bounds = resolveSearchHitPriceBounds(hit);
  const firstVariant = hit.variants[0];
  const displayVariant = bounds.cheapestVariant ?? firstVariant;
  const stockVariants = hit.variants.map((variant) => ({
    manageInventory: variant.manage_inventory,
    inventoryQuantity: variant.inventory_quantity ?? null,
  }));

  return {
    id: displayVariant?.id || hit.id,
    productId: hit.id,
    variantId: displayVariant?.id,
    title: hit.title,
    handle: hit.handle,
    reviews: 0,
    price: bounds.price,
    discountedPrice: bounds.discountedPrice,
    minPrice: bounds.minPrice,
    maxPrice: bounds.maxPrice,
    variantCount: hit.variants.length || 1,
    variantLabel: displayVariant?.title,
    inStock: isProductInStock(stockVariants),
    imgs: {
      thumbnails: [resolveMedusaAssetUrlOrFallback(hit.thumbnail, PRODUCT_PLACEHOLDER_IMAGE)],
      previews: [resolveMedusaAssetUrlOrFallback(hit.thumbnail, PRODUCT_PLACEHOLDER_IMAGE)],
    },
  };
}

export function mapSearchHitToShopProduct(hit: ProductSearchHit): ShopProduct {
  const base = mapSearchHitToProduct(hit);
  const bounds = resolveSearchHitPriceBounds(hit);
  const sizes = new Set<string>();
  const colors = new Set<string>();

  for (const variant of hit.variants) {
    for (const option of variant.options ?? []) {
      const normalized = option.option_title.toLowerCase();
      if (normalized === "size") {
        sizes.add(option.value);
      }
      if (normalized === "color") {
        colors.add(option.value);
      }
    }
  }

  return {
    ...base,
    categoryIds: hit.category_ids,
    categoryNames: hit.categories,
    sizes: Array.from(sizes),
    colors: Array.from(colors),
    filterableAttributes: hit.filterable_attributes ?? {},
    minPrice: bounds.minPrice,
    maxPrice: bounds.maxPrice,
    onSale: bounds.onSale,
  };
}

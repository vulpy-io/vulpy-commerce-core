import { expandSizesForFilter } from "./size-sort";
import type { SortableStoreProduct } from "./sort-products";

export type ShopCatalogIndexEntry = SortableStoreProduct & {
  id: string;
  categoryIds: string[];
  categoryNames: string[];
  /** Raw Medusa Size option values (display). */
  sizes: string[];
  /** Expanded filter tokens — document contract `filter_sizes` for any search engine. */
  filterSizes: string[];
  colors: string[];
  /** Raw Medusa Finish option values (display/swatch facets). */
  finishes: string[];
  filterableAttributes: Record<string, string>;
  minPrice: number;
  maxPrice: number;
  onSale: boolean;
  price: number;
  discountedPrice: number;
};

function getVariantOptionValue(
  variant: Record<string, unknown>,
  optionTitle: string
) {
  const options = variant.options;
  if (!Array.isArray(options)) {
    return undefined;
  }

  for (const option of options) {
    if (!option || typeof option !== "object") {
      continue;
    }

    const record = option as Record<string, unknown>;
    const optionMeta = record.option as Record<string, unknown> | undefined;
    const title = optionMeta?.title;
    if (
      typeof title === "string" &&
      title.toLowerCase() === optionTitle.toLowerCase() &&
      typeof record.value === "string"
    ) {
      return record.value;
    }
  }

  return undefined;
}

function parseFilterableAttributes(
  metadata: Record<string, unknown> | null | undefined
) {
  const raw = metadata?.filterable;
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) {
      result[key] = value.trim();
    }
  }

  return result;
}

function variantPricing(variant: Record<string, unknown>) {
  const calculated = variant.calculated_price as
    | {
        calculated_amount?: number | null;
        original_amount?: number | null;
      }
    | undefined;
  const calculatedAmount = calculated?.calculated_amount;
  const originalAmount = calculated?.original_amount;
  const amount =
    typeof calculatedAmount === "number" && Number.isFinite(calculatedAmount)
      ? calculatedAmount
      : 0;
  const original =
    typeof originalAmount === "number" && Number.isFinite(originalAmount)
      ? originalAmount
      : 0;

  return {
    amount,
    original: original || amount,
    onSale: original > amount && amount > 0,
  };
}

function parseCategoryFields(product: Record<string, unknown>) {
  const categories = Array.isArray(product.categories) ? product.categories : [];
  const categoryIds: string[] = [];
  const categoryNames: string[] = [];

  for (const category of categories) {
    if (!category || typeof category !== "object") {
      continue;
    }

    const record = category as Record<string, unknown>;
    if (typeof record.id === "string") {
      categoryIds.push(record.id);
      categoryNames.push(typeof record.name === "string" ? record.name : "");
    }
  }

  return { categoryIds, categoryNames };
}

function collectVariantIndexFields(variants: unknown[]) {
  const sizes = new Set<string>();
  const colors = new Set<string>();
  const finishes = new Set<string>();
  const variantPrices: number[] = [];
  let onSale = false;
  let price = 0;
  let discountedPrice = 0;

  for (const variant of variants) {
    if (!variant || typeof variant !== "object") {
      continue;
    }

    const record = variant as Record<string, unknown>;
    const size = getVariantOptionValue(record, "Size");
    // The demo catalog option is titled "Color" (Finish renamed 2026-09-03).
    const color = getVariantOptionValue(record, "Color");
    const finish = color;

    if (size) {
      sizes.add(size);
    }
    if (color) {
      colors.add(color);
    }
    if (finish) {
      finishes.add(finish);
    }

    const pricing = variantPricing(record);
    if (pricing.onSale) {
      onSale = true;
    }

    if (pricing.amount > 0) {
      variantPrices.push(pricing.amount);
      if (!discountedPrice) {
        discountedPrice = pricing.amount;
        price = pricing.original;
      }
    }
  }

  if (variantPrices.length > 1) {
    discountedPrice = Math.min(...variantPrices);
    price = Math.max(...variantPrices);
  }

  const minPrice = variantPrices.length
    ? Math.min(...variantPrices)
    : discountedPrice;
  const maxPrice = variantPrices.length
    ? Math.max(...variantPrices)
    : discountedPrice;

  return {
    sizes: Array.from(sizes),
    // Document contract: filter_sizes for any search engine (Orama/Meili/ES)
    filterSizes: expandSizesForFilter(Array.from(sizes)),
    colors: Array.from(colors),
    finishes: Array.from(finishes),
    variantPrices,
    onSale,
    price,
    discountedPrice,
    minPrice,
    maxPrice,
  };
}

export function toShopCatalogIndexEntry(
  product: Record<string, unknown>
): ShopCatalogIndexEntry | null {
  const id = product.id;
  const title = product.title;
  if (typeof id !== "string" || typeof title !== "string") {
    return null;
  }

  const { categoryIds, categoryNames } = parseCategoryFields(product);
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variantFields = collectVariantIndexFields(variants);
  const metadata =
    product.metadata && typeof product.metadata === "object"
      ? (product.metadata as Record<string, unknown>)
      : {};
  const demoSalePrice =
    typeof metadata.demo_sale_price === "number" && Number.isFinite(metadata.demo_sale_price)
      ? metadata.demo_sale_price
      : null;
  if (demoSalePrice !== null && demoSalePrice < variantFields.price) {
    variantFields.onSale = true;
    variantFields.discountedPrice = demoSalePrice;
    variantFields.minPrice = Math.min(variantFields.minPrice, demoSalePrice);
    variantFields.maxPrice = Math.max(variantFields.maxPrice, variantFields.price);
  }

  return {
    id,
    title,
    created_at: product.created_at as string | Date | null | undefined,
    metadata,
    variants: variants as ShopCatalogIndexEntry["variants"],
    categoryIds,
    categoryNames,
    sizes: variantFields.sizes,
    filterSizes: variantFields.filterSizes,
    colors: variantFields.colors,
    finishes: variantFields.finishes,
    filterableAttributes: parseFilterableAttributes(metadata),
    minPrice: variantFields.minPrice,
    maxPrice: variantFields.maxPrice,
    onSale: variantFields.onSale,
    price: variantFields.price,
    discountedPrice: variantFields.discountedPrice,
  };
}

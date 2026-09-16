import type {
  ProductDetail,
  ProductOption,
  ProductVariantDetail,
} from "@/types/product-detail";
import { isSizeOptionTitle, sortSizeValues } from "./size-sort";
import { isVariantInStock } from "./stock";

function sortOptionValues(title: string, values: string[]) {
  if (isSizeOptionTitle(title)) {
    return sortSizeValues(values);
  }

  return [...values].sort((a, b) => a.localeCompare(b));
}

export function getInitialSelectedOptions(
  product: ProductDetail,
  preferredVariantId?: string | null
): Record<string, string> {
  if (preferredVariantId) {
    const preferredVariant = product.variants.find(
      (variant) => variant.id === preferredVariantId
    );
    if (preferredVariant) {
      return { ...preferredVariant.optionValues };
    }
  }

  const inStockVariant =
    product.variants.find((variant) => variant.inStock !== false) ??
    product.variants[0];

  if (!inStockVariant) {
    return {};
  }

  return { ...inStockVariant.optionValues };
}

function variantMatchesOptions(
  variant: ProductVariantDetail,
  selected: Record<string, string>
) {
  return Object.entries(selected).every(
    ([title, value]) => variant.optionValues[title] === value
  );
}

export function findVariantByOptions(
  variants: ProductVariantDetail[],
  selected: Record<string, string>
) {
  return variants.find((variant) => variantMatchesOptions(variant, selected)) ?? null;
}

/**
 * Exact match when possible; otherwise the variant that shares the most selected
 * options (preferring `preferredOptionTitle` matches) for image/price preview.
 * Never enables ATC by itself — callers still require `findVariantByOptions`.
 */
export function findPreviewVariant(
  variants: ProductVariantDetail[],
  selected: Record<string, string>,
  preferredOptionTitle?: string
): ProductVariantDetail | null {
  const exact = findVariantByOptions(variants, selected);
  if (exact) {
    return exact;
  }

  let best: ProductVariantDetail | null = null;
  let bestScore = -1;

  for (const variant of variants) {
    let score = 0;
    for (const [title, value] of Object.entries(selected)) {
      if (variant.optionValues[title] !== value) {
        continue;
      }
      score += title === preferredOptionTitle ? 10 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = variant;
    }
  }

  if (bestScore > 0) {
    return best;
  }

  return variants[0] ?? null;
}

export function selectOptionValue(
  variants: ProductVariantDetail[],
  selected: Record<string, string>,
  optionTitle: string,
  value: string
) {
  const next = { ...selected, [optionTitle]: value };
  const exactMatch = findVariantByOptions(variants, next);
  if (exactMatch) {
    return { ...exactMatch.optionValues };
  }

  // Keep partial selection so shoppers can preview unavailable combos
  // (e.g. White when Size M has no White) without remapping other options.
  return next;
}

export function getAvailableOptionValues(
  variants: ProductVariantDetail[],
  selected: Record<string, string>,
  optionTitle: string
) {
  const available = new Set<string>();

  for (const variant of variants) {
    if (!isVariantInStock(variant)) {
      continue;
    }

    const matchesOtherOptions = Object.entries(selected)
      .filter(([title]) => title !== optionTitle)
      .every(([title, value]) => variant.optionValues[title] === value);

    if (!matchesOtherOptions) {
      continue;
    }

    const value = variant.optionValues[optionTitle];
    if (value) {
      available.add(value);
    }
  }

  return available;
}

export function sortProductOptions(options: ProductOption[]) {
  return options.map((option) => ({
    ...option,
    values: sortOptionValues(option.title, option.values),
  }));
}

export function variantToDisplayProduct(
  product: ProductDetail,
  variant: ProductVariantDetail
) {
  const images = variant.thumbnail
    ? [variant.thumbnail, ...product.images.filter((img) => img !== variant.thumbnail)]
    : product.images;

  return {
    id: variant.id,
    variantId: variant.id,
    productId: product.productId,
    handle: product.handle,
    title: product.title,
    price: variant.price,
    discountedPrice: variant.discountedPrice,
    reviews: 0,
    imgs: {
      thumbnails: images,
      previews: images,
    },
  };
}

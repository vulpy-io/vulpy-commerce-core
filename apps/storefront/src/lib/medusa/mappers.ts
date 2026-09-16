import type { HttpTypes } from "@medusajs/types";
import type { Product, ProductFinishVariant } from "@/types/product";
import type {
  ProductAttribute,
  ProductDetail,
  ProductVariantDetail,
} from "@/types/product-detail";
import type { ShopProduct } from "@/types/shop";
import { PRODUCT_PLACEHOLDER_IMAGE, resolveMedusaAssetUrl, resolveMedusaAssetUrlOrFallback } from "./asset-url";
import { collectFinishValues } from "./finish-swatches";
import { firstFiniteAmount, fromMedusaAmount, getPriceBounds } from "./money";
import {
  buildProductOptionsFromStoreProduct,
  formatVariantOptionLabel,
} from "./product-options";
import { mapVisibleStoreTags } from "./product-tags";
import { isProductInStock, isVariantInStock } from "./stock";
import { sortProductOptions } from "./variant-options";

function getVariantOptionValue(
  variant: HttpTypes.StoreProductVariant,
  optionTitle: string
) {
  return variant.options?.find(
    (option) => option.option?.title?.toLowerCase() === optionTitle.toLowerCase()
  )?.value;
}

/** Finish option value, matching `collectFinishValues` (title contains "color"). */
function getFinishOptionValue(
  variant: HttpTypes.StoreProductVariant
): string | undefined {
  const value = variant.options?.find((option) =>
    option.option?.title?.toLowerCase().includes("color")
  )?.value?.trim();
  return value || undefined;
}

/**
 * Attribute labels that are safe to synthesize into shop filter facets from
 * descriptive `metadata.attributes`, even when a product does not ship an
 * explicit `metadata.filterable` map. The demo catalog (and real stores that
 * only fill descriptive attributes) therefore gains Material / Color / Brand /
 * Season / Gender facets without duplicate data.
 *
 * Explicit `metadata.filterable` always wins for the same label.
 */
export const SYNTHESIZABLE_ATTRIBUTE_KEYS = new Set([
  "material",
  "color",
  "brand",
  "season",
  "gender",
  "finish",
]);

/** Attribute keys that are never surfaced as PLP filter facets. */
export const EXCLUDED_PLP_ATTRIBUTE_KEYS = new Set(["volume"]);

function parseFilterableAttributes(
  metadata: Record<string, unknown>
): Record<string, string> {
  const raw = metadata.filterable;
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

function parseDescriptiveFilterableAttributes(
  metadata: Record<string, unknown>
): Record<string, string> {
  const raw = metadata.attributes;
  if (!Array.isArray(raw)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const { label, value } = item as { label?: unknown; value?: unknown };
    if (typeof label !== "string" || typeof value !== "string") {
      continue;
    }

    const key = label.trim().toLowerCase().replace(/\s+/g, "_");
    if (
      !SYNTHESIZABLE_ATTRIBUTE_KEYS.has(key) ||
      EXCLUDED_PLP_ATTRIBUTE_KEYS.has(key) ||
      !value.trim()
    ) {
      continue;
    }

    result[key] = value.trim();
  }

  return result;
}

/**
 * Merge explicit `metadata.filterable` with descriptive `metadata.attributes`
 * so shop facets light up even when a store only fills descriptive attributes.
 * Explicit filterable values win for the same key.
 */
function mergeFilterableAttributes(
  metadata: Record<string, unknown>
): Record<string, string> {
  return {
    ...parseDescriptiveFilterableAttributes(metadata),
    ...parseFilterableAttributes(metadata),
  };
}

function parseProductAttributes(metadata: Record<string, unknown>): ProductAttribute[] {
  const raw = metadata.attributes;
  if (!Array.isArray(raw)) {
    return [];
  }

  const dedupeMergedValue = (value: string): string => {
    const marker = '","';
    const idx = value.indexOf(marker);
    if (idx === -1) {
      return value;
    }

    return value.slice(0, idx).replace(/^"|"$/g, "").trim();
  };

  return raw
    .filter(
      (item): item is { label: string; value: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { label?: unknown }).label === "string" &&
        typeof (item as { value?: unknown }).value === "string"
    )
    .map((item) => ({ label: item.label, value: item.value }));
}

function parseSalesCount(metadata: Record<string, unknown>) {
  const raw = metadata.sales_count;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function resolveProductBrand(
  product: HttpTypes.StoreProduct,
  attributes: ProductAttribute[]
): string | undefined {
  const fromAttr = attributes.find(
    (attr) => attr.label.toLowerCase() === "brand"
  )?.value;
  if (fromAttr?.trim()) {
    return fromAttr.trim();
  }

  const metadata = (product.metadata ?? {}) as Record<string, unknown>;
  const metaBrand = metadata.brand;
  if (typeof metaBrand === "string" && metaBrand.trim()) {
    return metaBrand.trim();
  }

  const collectionTitle = (
    product as { collection?: { title?: string | null } | null }
  ).collection?.title;
  if (collectionTitle?.trim()) {
    return collectionTitle.trim();
  }

  return undefined;
}

function parseProductMetadata(product: HttpTypes.StoreProduct) {
  const metadata = (product.metadata ?? {}) as Record<string, unknown>;
  const fullDescription =
    typeof metadata.full_description === "string"
      ? metadata.full_description
      : null;
  const attributes = parseProductAttributes(metadata);

  return {
    attributes,
    fullDescription,
    salesCount: parseSalesCount(metadata),
    brand: resolveProductBrand(product, attributes),
  };
}

function resolveVariantDisplayPrices(
  variant: HttpTypes.StoreProductVariant,
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

function resolveProductPriceBounds(
  variants: HttpTypes.StoreProductVariant[],
  currencyCode?: string
) {
  let cheapest: {
    variant: HttpTypes.StoreProductVariant;
    price: number;
    discountedPrice: number;
  } | null = null;
  let onSale = false;
  const effectiveAmounts: number[] = [];

  for (const variant of variants) {
    const display = resolveVariantDisplayPrices(variant, currencyCode);
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
      cheapestVariant: null as HttpTypes.StoreProductVariant | null,
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

function mapVariantStockFields(variant: HttpTypes.StoreProductVariant) {
  const manageInventory = variant.manage_inventory ?? false;
  const inventoryQuantity = variant.inventory_quantity ?? null;

  return {
    manageInventory,
    inventoryQuantity,
    inStock: isVariantInStock({ manageInventory, inventoryQuantity }),
  };
}

export function mapMedusaProductToProduct(
  product: HttpTypes.StoreProduct,
  variantId?: string,
  currencyCode?: string
): Product | null {
  const variants = product.variants ?? [];
  if (variants.length === 0) {
    return null;
  }

  const bounds = resolveProductPriceBounds(variants, currencyCode);
  const variant =
    (variantId
      ? variants.find((v) => v.id === variantId)
      : null) ??
    bounds.cheapestVariant ??
    variants[0];

  if (!variant) {
    return null;
  }

  const displayPrices = variantId
    ? resolveVariantDisplayPrices(variant, currencyCode)
    : {
        price: bounds.price,
        discountedPrice: bounds.discountedPrice,
      };

  const rawImages =
    product.images?.map((img) => img.url).filter(Boolean) ??
    (product.thumbnail ? [product.thumbnail] : [PRODUCT_PLACEHOLDER_IMAGE]);
  const images = rawImages.map((url) =>
    resolveMedusaAssetUrlOrFallback(url, PRODUCT_PLACEHOLDER_IMAGE)
  );

  const optionValues = getVariantOptionValues(variant);
  const productOptions = buildProductOptionsFromStoreProduct(product);
  const variantLabel = formatVariantOptionLabel(optionValues, productOptions);
  const { salesCount, brand } = parseProductMetadata(product);

  const finishVariants: ProductFinishVariant[] = [];
  {
    const seenFinishes = new Set<string>();
    for (const variant of variants) {
      const finish = getFinishOptionValue(variant);
      if (!finish || seenFinishes.has(finish)) {
        continue;
      }
      seenFinishes.add(finish);
      const variantImage =
        variant.thumbnail ??
        (typeof variant.metadata?.image_url === "string"
          ? variant.metadata.image_url
          : undefined);
      finishVariants.push({
        name: finish,
        variantId: variant.id,
        image: resolveMedusaAssetUrl(variantImage) ?? undefined,
      });
    }
  }

  return {
    id: variant.id,
    variantId: variant.id,
    productId: product.id,
    handle: product.handle,
    title: product.title,
    price: displayPrices.price,
    discountedPrice: displayPrices.discountedPrice,
    minPrice: bounds.minPrice,
    maxPrice: bounds.maxPrice,
    reviews: 0,
    brand,
    createdAt: product.created_at ?? undefined,
    updatedAt: product.updated_at ?? undefined,
    salesCount,
    variantCount: variants.length,
    variantLabel,
    finishes: collectFinishValues(variants),
    finishVariants,
    inStock: isProductInStock(
      variants.map((v) => mapVariantStockFields(v))
    ),
    storeTags: mapVisibleStoreTags(product.tags),
    imgs: {
      thumbnails: images,
      previews: images,
    },
  };
}

export function mapMedusaProducts(
  products: HttpTypes.StoreProduct[],
  currencyCode?: string
): Product[] {
  return products
    .map((product) => mapMedusaProductToProduct(product, undefined, currencyCode))
    .filter((p): p is Product => p !== null);
}

export function mapMedusaProductToShopProduct(
  product: HttpTypes.StoreProduct,
  currencyCode?: string
): ShopProduct | null {
  const base = mapMedusaProductToProduct(product, undefined, currencyCode);
  if (!base) {
    return null;
  }

  const sizes = new Set<string>();
  const colors = new Set<string>();
  const bounds = resolveProductPriceBounds(
    product.variants ?? [],
    currencyCode
  );

  for (const variant of product.variants ?? []) {
    const size = getVariantOptionValue(variant, "Size");
    const color = getVariantOptionValue(variant, "Color");
    if (size) {
      sizes.add(size);
    }
    if (color) {
      colors.add(color);
    }
  }

  const categories = product.categories ?? [];
  const metadata = (product.metadata ?? {}) as Record<string, unknown>;

  return {
    ...base,
    categoryIds: categories.map((category) => category.id),
    categoryNames: categories.map((category) => category.name ?? ""),
    sizes: Array.from(sizes),
    colors: Array.from(colors),
    filterableAttributes: mergeFilterableAttributes(metadata),
    minPrice: firstFiniteAmount(
      bounds.minPrice,
      base.minPrice,
      base.discountedPrice,
      base.price
    ),
    maxPrice: firstFiniteAmount(
      bounds.maxPrice,
      base.maxPrice,
      base.discountedPrice,
      base.price
    ),
    onSale: bounds.onSale,
  };
}

export function mapMedusaProductsForShop(
  products: HttpTypes.StoreProduct[],
  currencyCode?: string
): ShopProduct[] {
  return products
    .map((product) => mapMedusaProductToShopProduct(product, currencyCode))
    .filter((p): p is ShopProduct => p !== null);
}

function getVariantOptionValues(variant: HttpTypes.StoreProductVariant) {
  const optionValues: Record<string, string> = {};

  for (const option of variant.options ?? []) {
    const title = option.option?.title;
    const value = option.value;
    if (title && value) {
      optionValues[title] = value;
    }
  }

  return optionValues;
}

function mapVariantDetail(
  variant: HttpTypes.StoreProductVariant,
  currencyCode?: string
): ProductVariantDetail {
  const optionValues = getVariantOptionValues(variant);
  const stockFields = mapVariantStockFields(variant);

  const { price, discountedPrice } = resolveVariantDisplayPrices(
    variant,
    currencyCode
  );

  const variantImage =
    variant.thumbnail ??
    (typeof variant.metadata?.image_url === "string"
      ? variant.metadata.image_url
      : undefined);

  return {
    id: variant.id,
    title: variant.title ?? "",
    sku: variant.sku,
    ean: variant.ean,
    optionValues,
    price,
    discountedPrice,
    thumbnail: resolveMedusaAssetUrl(variantImage) ?? undefined,
    ...stockFields,
  };
}

function buildProductOptions(
  product: HttpTypes.StoreProduct,
  variants: ProductVariantDetail[]
) {
  const valuesByTitle = new Map<string, Set<string>>();

  for (const option of product.options ?? []) {
    if (!option.title) {
      continue;
    }
    valuesByTitle.set(option.title, new Set());
  }

  for (const variant of variants) {
    for (const [title, value] of Object.entries(variant.optionValues)) {
      if (!valuesByTitle.has(title)) {
        valuesByTitle.set(title, new Set());
      }
      valuesByTitle.get(title)?.add(value);
    }
  }

  const options = Array.from(valuesByTitle.entries()).map(([title, values]) => ({
    id:
      product.options?.find((option) => option.title === title)?.id ?? title,
    title,
    values: Array.from(values),
  }));

  return sortProductOptions(options);
}

export function mapMedusaProductToDetail(
  product: HttpTypes.StoreProduct,
  currencyCode?: string
): ProductDetail | null {
  const variants = (product.variants ?? []).map((variant) =>
    mapVariantDetail(variant, currencyCode)
  );

  if (variants.length === 0) {
    return null;
  }

  const rawImages =
    product.images?.map((img) => img.url).filter(Boolean) ??
    (product.thumbnail ? [product.thumbnail] : [PRODUCT_PLACEHOLDER_IMAGE]);
  const images = rawImages.map((url) =>
    resolveMedusaAssetUrlOrFallback(url, PRODUCT_PLACEHOLDER_IMAGE)
  );

  const { attributes, fullDescription } = parseProductMetadata(product);

  return {
    productId: product.id,
    handle: product.handle ?? "",
    title: product.title ?? "",
    description: product.description,
    fullDescription,
    attributes,
    images,
    options: buildProductOptions(product, variants),
    variants,
    inStock: isProductInStock(variants),
    storeTags: mapVisibleStoreTags(product.tags),
  };
}

export { formatPrice } from "./money";

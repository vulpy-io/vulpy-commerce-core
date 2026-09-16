import type {
  CategoryFilterOption,
  ShopFilterFacets,
  ShopFilters,
  ShopProduct,
} from "@/types/shop";
import { EXCLUDED_PLP_ATTRIBUTE_KEYS } from "./mappers";
import { firstFiniteAmount } from "./money";
import { expandSizesForFilter, sortSizeValues } from "./size-sort";

export const ATTRIBUTE_FILTER_LABELS: Record<string, string> = {
  season: "Season",
  gender: "Gender",
  material: "Material",
  brand: "Brand",
  color: "Color",
  finish: "Finish",
};

export function getAttributeFilterLabel(key: string): string {
  const known = ATTRIBUTE_FILTER_LABELS[key];
  if (known) {
    return known;
  }

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function filterPlpAttributeFacets(
  attributes: Record<string, string[]>
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(attributes).filter(
      ([key]) => !EXCLUDED_PLP_ATTRIBUTE_KEYS.has(key)
    )
  );
}

export function buildFilterFacets(products: ShopProduct[]): ShopFilterFacets {
  const categoryCounts = new Map<string, CategoryFilterOption>();
  const sizes = new Set<string>();
  const colors = new Set<string>();
  const attributeValues = new Map<string, Set<string>>();
  const finishes = new Set<string>();
  let priceMin = Number.POSITIVE_INFINITY;
  let priceMax = 0;

  for (const product of products) {
    for (const categoryId of product.categoryIds) {
      const name =
        product.categoryNames[product.categoryIds.indexOf(categoryId)] ?? "";
      const existing = categoryCounts.get(categoryId);
      if (existing) {
        existing.products += 1;
      } else {
        categoryCounts.set(categoryId, {
          id: categoryId,
          name,
          products: 1,
        });
      }
    }

    for (const size of expandSizesForFilter(product.sizes)) {
      sizes.add(size);
    }
    for (const color of product.colors) {
      colors.add(color);
    }
    for (const finish of product.finishes ?? []) {
      finishes.add(finish);
    }

    for (const [key, value] of Object.entries(product.filterableAttributes)) {
      if (!value || EXCLUDED_PLP_ATTRIBUTE_KEYS.has(key)) {
        continue;
      }

      const values = attributeValues.get(key) ?? new Set<string>();
      values.add(value);
      attributeValues.set(key, values);
    }

    priceMin = Math.min(priceMin, product.minPrice);
    priceMax = Math.max(priceMax, product.maxPrice);
  }

  if (!Number.isFinite(priceMin)) {
    priceMin = 0;
  }
  if (priceMax < priceMin) {
    priceMax = priceMin;
  }

  const attributes: Record<string, string[]> = {};
  for (const [key, values] of Array.from(attributeValues.entries())) {
    if (values.size > 0) {
      attributes[key] = Array.from(values).sort((a, b) => a.localeCompare(b));
    }
  }

  return {
    categories: Array.from(categoryCounts.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    sizes: sortSizeValues(Array.from(sizes)),
    colors: Array.from(colors).sort((a, b) => a.localeCompare(b)),
    finishes: Array.from(finishes).sort((a, b) => a.localeCompare(b)),
    attributes,
    priceMin,
    priceMax,
  };
}

/**
 * Merge missing attribute facet values from a page's own products into the
 * backend facets. Guards against a cold/empty facets cache: after a reseed or
 * backend restart the first SSR can cache an EMPTY facets response (backend
 * still warming), pinning no Material/Finish/Color for the cache lifetime.
 *
 * Backend values win when present; missing keys are filled from the products
 * actually rendered on this page, so the sidebar can never show a permanently
 * empty attribute facet for attributes the page demonstrably has.
 */
export function mergePageAttributeFacets(
  facets: ShopFilterFacets,
  products: ShopProduct[]
): ShopFilterFacets {
  const mergedAttributes: Record<string, string[]> = {
    ...(facets.attributes ?? {}),
  };
  let dirty = false;

  for (const product of products) {
    for (const [key, value] of Object.entries(
      product.filterableAttributes ?? {}
    )) {
      if (!value) {
        continue;
      }
      const current = mergedAttributes[key] ?? [];
      if (current.includes(value)) {
        continue;
      }
      mergedAttributes[key] = [...current, value];
      dirty = true;
    }
  }

  if (!dirty) {
    return facets;
  }

  return {
    ...facets,
    attributes: Object.fromEntries(
      Object.entries(mergedAttributes).map(([key, values]) => [
        key,
        Array.from(new Set(values)).sort((a, b) => a.localeCompare(b)),
      ])
    ),
  };
}

/** Ensures facet lists from the shop catalog API use the same size ordering as PDP. */
export function normalizeShopFilterFacets(
  facets: ShopFilterFacets
): ShopFilterFacets {
  return {
    ...facets,
    sizes: sortSizeValues(facets.sizes),
    attributes: filterPlpAttributeFacets(facets.attributes),
  };
}

export function createDefaultFilters(facets: ShopFilterFacets): ShopFilters {
  return {
    categoryIds: [],
    sizes: [],
    colors: [],
    finishes: [],
    attributes: Object.fromEntries(
      Object.keys(facets.attributes).map((key) => [key, []])
    ),
    priceMin: facets.priceMin,
    priceMax: facets.priceMax,
    saleOnly: false,
  };
}

export function filterShopProducts(
  products: ShopProduct[],
  filters: ShopFilters
): ShopProduct[] {
  return products.filter((product) => {
    if (
      filters.categoryIds.length > 0 &&
      !filters.categoryIds.some((id) => product.categoryIds.includes(id))
    ) {
      return false;
    }

    if (
      filters.sizes.length > 0 &&
      !filters.sizes.some((size) =>
        expandSizesForFilter(product.sizes).includes(size)
      )
    ) {
      return false;
    }

    if (
      filters.colors.length > 0 &&
      !filters.colors.some((color) => product.colors.includes(color))
    ) {
      return false;
    }

    if (
      filters.finishes.length > 0 &&
      !filters.finishes.some((finish) =>
        (product.finishes ?? []).includes(finish)
      )
    ) {
      return false;
    }

    for (const [key, selectedValues] of Object.entries(filters.attributes)) {
      if (!selectedValues.length) {
        continue;
      }

      const productValue = product.filterableAttributes[key];
      if (!(productValue && selectedValues.includes(productValue))) {
        return false;
      }
    }

    if (filters.saleOnly && !product.onSale) {
      return false;
    }

    const min = firstFiniteAmount(
      product.minPrice,
      product.discountedPrice,
      product.price
    );
    const max = firstFiniteAmount(
      product.maxPrice,
      product.discountedPrice,
      product.price
    );
    if (max < filters.priceMin || min > filters.priceMax) {
      return false;
    }

    return true;
  });
}

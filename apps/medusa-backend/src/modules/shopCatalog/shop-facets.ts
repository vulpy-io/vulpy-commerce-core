import type { ShopCatalogIndexEntry } from "./shop-index";
import type { ShopCatalogFilters } from "./shop-query";
import { expandSizesForFilter, sortSizeValues } from "./size-sort";

export interface CategoryFacetOption {
  id: string;
  name: string;
  products: number;
}

export interface ShopCatalogFacets {
  categories: CategoryFacetOption[];
  sizes: string[];
  colors: string[];
  finishes: string[];
  attributes: Record<string, string[]>;
  priceMin: number;
  priceMax: number;
}

function entryFilterSizeTokens(entry: ShopCatalogIndexEntry): string[] {
  if (entry.filterSizes?.length) {
    return entry.filterSizes;
  }
  return expandSizesForFilter(entry.sizes);
}

function countCategory(
  categoryCounts: Map<string, CategoryFacetOption>,
  categoryId: string | undefined,
  name: string
) {
  if (!categoryId) {
    return;
  }
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

interface FacetAccumulator {
  categoryCounts: Map<string, CategoryFacetOption>;
  sizes: Set<string>;
  colors: Set<string>;
  finishes: Set<string>;
  attributeValues: Map<string, Set<string>>;
  priceMin: number;
  priceMax: number;
}

function accumulateEntry(
  accumulator: FacetAccumulator,
  entry: ShopCatalogIndexEntry
): FacetAccumulator {
  for (let index = 0; index < entry.categoryIds.length; index += 1) {
    countCategory(
      accumulator.categoryCounts,
      entry.categoryIds[index],
      entry.categoryNames[index] ?? ""
    );
  }

  for (const size of entryFilterSizeTokens(entry)) {
    accumulator.sizes.add(size);
  }
  for (const color of entry.colors) {
    accumulator.colors.add(color);
  }
  for (const finish of entry.finishes ?? []) {
    accumulator.finishes.add(finish);
  }

  for (const [key, value] of Object.entries(entry.filterableAttributes)) {
    if (!value) {
      continue;
    }

    const values = accumulator.attributeValues.get(key) ?? new Set<string>();
    values.add(value);
    accumulator.attributeValues.set(key, values);
  }

  accumulator.priceMin = Math.min(accumulator.priceMin, entry.minPrice);
  accumulator.priceMax = Math.max(accumulator.priceMax, entry.maxPrice);
  return accumulator;
}

export function buildShopCatalogFacets(
  entries: ShopCatalogIndexEntry[]
): ShopCatalogFacets {
  const accumulator: FacetAccumulator = {
    categoryCounts: new Map<string, CategoryFacetOption>(),
    sizes: new Set<string>(),
    colors: new Set<string>(),
    finishes: new Set<string>(),
    attributeValues: new Map<string, Set<string>>(),
    priceMin: Number.POSITIVE_INFINITY,
    priceMax: 0,
  };

  for (const entry of entries) {
    accumulateEntry(accumulator, entry);
  }

  let { priceMin, priceMax } = accumulator;
  if (!Number.isFinite(priceMin)) {
    priceMin = 0;
  }
  if (priceMax < priceMin) {
    priceMax = priceMin;
  }

  const attributes: Record<string, string[]> = {};
  for (const [key, values] of Array.from(accumulator.attributeValues.entries())) {
    if (values.size > 0) {
      attributes[key] = Array.from(values).sort((a, b) => a.localeCompare(b));
    }
  }

  return {
    categories: Array.from(accumulator.categoryCounts.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    sizes: sortSizeValues(Array.from(accumulator.sizes)),
    colors: Array.from(accumulator.colors).sort((a, b) =>
      a.localeCompare(b)
    ),
    finishes: Array.from(accumulator.finishes).sort((a, b) =>
      a.localeCompare(b)
    ),
    attributes,
    priceMin,
    priceMax,
  };
}

export function createDefaultFilters(
  facets: ShopCatalogFacets
): ShopCatalogFilters {
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
  };
}

export function filterShopCatalogEntries(
  entries: ShopCatalogIndexEntry[],
  filters: ShopCatalogFilters
) {
  return entries.filter((entry) => matchesShopCatalogEntry(entry, filters));
}

function matchesShopCatalogEntry(
  entry: ShopCatalogIndexEntry,
  filters: ShopCatalogFilters
) {
  return (
    matchesCategoryFilter(entry, filters) &&
    matchesSizeFilter(entry, filters) &&
    matchesColorFilter(entry, filters) &&
    matchesFinishFilter(entry, filters) &&
    matchesAttributeFilters(entry, filters) &&
    matchesPriceFilter(entry, filters)
  );
}

function matchesCategoryFilter(
  entry: ShopCatalogIndexEntry,
  filters: ShopCatalogFilters
) {
  return (
    filters.categoryIds.length === 0 ||
    filters.categoryIds.some((id) => entry.categoryIds.includes(id))
  );
}

function matchesSizeFilter(
  entry: ShopCatalogIndexEntry,
  filters: ShopCatalogFilters
) {
  if (filters.sizes.length === 0) {
    return true;
  }
  const filterSizes = entryFilterSizeTokens(entry);
  return filters.sizes.some((size) => filterSizes.includes(size));
}

function matchesColorFilter(
  entry: ShopCatalogIndexEntry,
  filters: ShopCatalogFilters
) {
  return (
    filters.colors.length === 0 ||
    filters.colors.some((color) => entry.colors.includes(color))
  );
}

function matchesFinishFilter(
  entry: ShopCatalogIndexEntry,
  filters: ShopCatalogFilters
) {
  return (
    filters.finishes.length === 0 ||
    filters.finishes.some((finish) => (entry.finishes ?? []).includes(finish))
  );
}

function matchesAttributeFilters(
  entry: ShopCatalogIndexEntry,
  filters: ShopCatalogFilters
) {
  for (const [key, selectedValues] of Object.entries(filters.attributes)) {
    if (!selectedValues.length) {
      continue;
    }

    const productValue = entry.filterableAttributes[key];
    if (!(productValue && selectedValues.includes(productValue))) {
      return false;
    }
  }

  return true;
}

function matchesPriceFilter(
  entry: ShopCatalogIndexEntry,
  filters: ShopCatalogFilters
) {
  const effectivePrice = entry.discountedPrice || entry.price;
  return (
    effectivePrice >= filters.priceMin && effectivePrice <= filters.priceMax
  );
}

export function collectProductCategoryIds(entries: ShopCatalogIndexEntry[]) {
  const ids = new Set<string>();
  for (const entry of entries) {
    for (const categoryId of entry.categoryIds) {
      ids.add(categoryId);
    }
  }
  return ids;
}

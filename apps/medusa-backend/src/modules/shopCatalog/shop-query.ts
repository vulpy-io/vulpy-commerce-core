import type { ShopSortValue } from "./sort-products";

export interface ShopCatalogFilters {
  categoryIds: string[];
  sizes: string[];
  colors: string[];
  finishes: string[];
  attributes: Record<string, string[]>;
  priceMin: number;
  priceMax: number;
}

function splitList(value: unknown) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry).split(","))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function parseNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function normalizeSort(value: unknown): ShopSortValue {
  if (
    value === "latest" ||
    value === "oldest" ||
    value === "bestsellers" ||
    value === "price-asc" ||
    value === "price-desc" ||
    value === "name-asc" ||
    value === "name-desc"
  ) {
    return value;
  }

  return "latest";
}

export function normalizeCategoryIds(value: unknown) {
  const ids = splitList(value);
  return ids.length ? ids : undefined;
}

export function parseShopCatalogQuery(query: Record<string, unknown>) {
  const regionId = String(query.region_id ?? "").trim();
  const sort = normalizeSort(query.sort);
  const categoryIds = normalizeCategoryIds(query.category_id);
  const saleOnly = query.sale_only === "1" || query.sale_only === "true";
  const limit = Math.min(
    Math.max(parseNumber(query.limit, 20), 1),
    100
  );
  const offset = Math.max(parseNumber(query.offset, 0), 0);
  const includeFacets =
    query.include_facets !== "0" && query.include_facets !== "false";

  const filterCategoryIds = splitList(query.categories ?? query.category);
  const sizes = splitList(query.sizes);
  const colors = splitList(query.colors);
  const finishes = splitList(query.finishes);
  const hasPriceMin = query.priceMin !== undefined && query.priceMin !== "";
  const hasPriceMax = query.priceMax !== undefined && query.priceMax !== "";

  return {
    regionId,
    sort,
    categoryIds,
    saleOnly,
    limit,
    offset,
    includeFacets,
    filterCategoryIds,
    sizes,
    colors,
    finishes,
    hasPriceMin,
    hasPriceMax,
    priceMin: hasPriceMin ? parseNumber(query.priceMin, Number.NaN) : Number.NaN,
    priceMax: hasPriceMax ? parseNumber(query.priceMax, Number.NaN) : Number.NaN,
    attributeQuery: query,
  };
}

export function buildFiltersFromQuery(
  parsed: ReturnType<typeof parseShopCatalogQuery>,
  facetDefaults: ShopCatalogFilters
): ShopCatalogFilters {
  const attributes = { ...facetDefaults.attributes };

  for (const key of Object.keys(facetDefaults.attributes)) {
    const selected = splitList(parsed.attributeQuery[`attr_${key}`]);
    if (selected.length) {
      attributes[key] = selected;
    }
  }

  return {
    categoryIds: parsed.filterCategoryIds.length
      ? parsed.filterCategoryIds
      : facetDefaults.categoryIds,
    sizes: parsed.sizes,
    colors: parsed.colors,
    finishes: parsed.finishes,
    attributes,
    priceMin: parsed.hasPriceMin && Number.isFinite(parsed.priceMin)
      ? parsed.priceMin
      : facetDefaults.priceMin,
    priceMax: parsed.hasPriceMax && Number.isFinite(parsed.priceMax)
      ? parsed.priceMax
      : facetDefaults.priceMax,
  };
}

export function filtersAreDefault(
  filters: ShopCatalogFilters,
  defaults: ShopCatalogFilters
) {
  if (
    filters.categoryIds.length !== defaults.categoryIds.length ||
    filters.sizes.length !== defaults.sizes.length ||
    filters.colors.length !== defaults.colors.length ||
    filters.finishes.length !== defaults.finishes.length
  ) {
    return false;
  }

  if (filters.sizes.length || filters.colors.length || filters.finishes.length) {
    return false;
  }

  for (const values of Object.values(filters.attributes)) {
    if (values.length > 0) {
      return false;
    }
  }

  return (
    filters.priceMin === defaults.priceMin &&
    filters.priceMax === defaults.priceMax
  );
}

export function hasActiveFilterParams(
  parsed: ReturnType<typeof parseShopCatalogQuery>
) {
  if (
    parsed.filterCategoryIds.length > 0 ||
    parsed.sizes.length > 0 ||
    parsed.colors.length > 0 ||
    parsed.finishes.length > 0
  ) {
    return true;
  }

  if (parsed.hasPriceMin || parsed.hasPriceMax) {
    return true;
  }

  for (const [key, value] of Object.entries(parsed.attributeQuery)) {
    if (!key.startsWith("attr_")) {
      continue;
    }

    if (splitList(value).length > 0) {
      return true;
    }
  }

  return false;
}

import type { ShopFilterFacets, ShopFilters } from "@/types/shop";
import { normalizeShopSort, type ShopSortValue } from "./shop-display";
import { createDefaultFilters } from "./shop-filters";

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;

function firstParam(value?: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function splitList(value?: SearchParamValue) {
  const raw = firstParam(value);
  if (!raw) {
    return [];
  }

  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseShopSearchParams(
  searchParams: SearchParams,
  facets: ShopFilterFacets
): { page: number; sort: ShopSortValue; filters: ShopFilters } {
  const defaults = createDefaultFilters(facets);
  const page = Math.max(1, Number.parseInt(firstParam(searchParams.page) ?? "1", 10) || 1);
  const sort = normalizeShopSort(firstParam(searchParams.sort));

  const categoryIds = splitList(searchParams.categories ?? searchParams.category);
  const sizes = splitList(searchParams.sizes);
  const colors = splitList(searchParams.colors);
  const finishes = splitList(searchParams.finishes);
  const priceMin = parseNumber(firstParam(searchParams.priceMin), defaults.priceMin);
  const priceMax = parseNumber(firstParam(searchParams.priceMax), defaults.priceMax);

  // Collect attribute filters from both known facet keys and any `attr_*` search
  // params. Facets may not be resolved yet at parse time (e.g. the provisional
  // parse before facets load, or infinite-scroll pages that skip facets), so
  // relying only on facet keys silently drops attribute filters. The backend still
  // validates these against its own computed facets before applying them.
  const attributes = { ...defaults.attributes };
  const attributeKeys = new Set<string>(Object.keys(facets.attributes ?? {}));
  for (const key of Object.keys(searchParams)) {
    if (key.startsWith("attr_")) {
      attributeKeys.add(key.slice("attr_".length));
    }
  }
  for (const key of Array.from(attributeKeys)) {
    const selected = splitList(searchParams[`attr_${key}`]);
    if (selected.length) {
      attributes[key] = selected;
    }
  }

  const saleOnly = (() => {
    const raw = firstParam(searchParams.sale_only);
    return raw === "1" || raw === "true";
  })();

  return {
    page,
    sort,
    filters: {
      categoryIds: categoryIds.length ? categoryIds : defaults.categoryIds,
      sizes,
      colors,
      finishes,
      attributes,
      priceMin,
      priceMax,
      saleOnly,
    },
  };
}

export function buildShopQueryString(input: {
  page?: number;
  sort?: ShopSortValue;
  filters: ShopFilters;
  /** When set, price params are omitted unless the user changed them from these defaults. */
  priceDefaults?: { priceMin: number; priceMax: number };
}) {
  const params = new URLSearchParams();

  if (input.page && input.page > 1) {
    params.set("page", String(input.page));
  }

  if (input.sort && input.sort !== "latest") {
    params.set("sort", input.sort);
  }

  if (input.filters.categoryIds.length) {
    params.set("categories", input.filters.categoryIds.join(","));
  }

  if (input.filters.sizes.length) {
    params.set("sizes", input.filters.sizes.join(","));
  }

  if (input.filters.colors.length) {
    params.set("colors", input.filters.colors.join(","));
  }

  if ((input.filters.finishes ?? []).length) {
    params.set("finishes", (input.filters.finishes ?? []).join(","));
  }

  const defaults = input.priceDefaults;
  const priceMinChanged = defaults
    ? input.filters.priceMin !== defaults.priceMin
    : input.filters.priceMin > 0;
  const priceMaxChanged = defaults
    ? input.filters.priceMax !== defaults.priceMax
    : false;

  if (priceMinChanged && input.filters.priceMin > 0) {
    params.set("priceMin", String(input.filters.priceMin));
  }

  if (priceMaxChanged && input.filters.priceMax > 0) {
    params.set("priceMax", String(input.filters.priceMax));
  }

  if (input.filters.saleOnly) {
    params.set("sale_only", "true");
  }

  for (const [key, values] of Object.entries(input.filters.attributes ?? {})) {
    if (values.length) {
      params.set(`attr_${key}`, values.join(","));
    }
  }

  return params.toString();
}

export function buildShopCatalogHref(
  catalogPath: string,
  input: {
    page?: number;
    sort?: ShopSortValue;
    filters: ShopFilters;
    priceDefaults?: { priceMin: number; priceMax: number };
  }
) {
  const query = buildShopQueryString(input);
  const [basePath, existingQuery = ""] = catalogPath.split("?");
  const params = new URLSearchParams(existingQuery);
  const next = new URLSearchParams(query);

  for (const key of Array.from(next.keys())) {
    params.delete(key);
  }
  // Drop stale price params when the next query omits them (defaults restored).
  if (!next.has("priceMin")) {
    params.delete("priceMin");
  }
  if (!next.has("priceMax")) {
    params.delete("priceMax");
  }
  for (const [key, value] of Array.from(next.entries())) {
    params.set(key, value);
  }

  const merged = params.toString();
  return merged ? `${basePath}?${merged}` : basePath;
}

export function getNextShopCatalogHref(
  catalogPath: string,
  input: {
    currentPage: number;
    totalPages: number;
    sort: ShopSortValue;
    filters: ShopFilters;
    priceDefaults?: { priceMin: number; priceMax: number };
  }
) {
  if (input.currentPage >= input.totalPages) {
    return null;
  }

  return buildShopCatalogHref(catalogPath, {
    page: input.currentPage + 1,
    sort: input.sort,
    filters: input.filters,
    priceDefaults: input.priceDefaults,
  });
}

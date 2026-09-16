export type SearchParams = Record<string, string | string[] | undefined>;

export function readRawPage(searchParams?: SearchParams): string | undefined {
  const value = searchParams?.page;
  return Array.isArray(value) ? value[0] : value;
}

/** "1" or undefined (absent). Anything else (0, "2", "abc") is a real deep link. */
export function isFirstPageParam(searchParams?: SearchParams): boolean {
  const rawPage = readRawPage(searchParams);
  return rawPage === undefined || rawPage === "1";
}

/** True when a non-first ?page= param is present (0, "2", "abc", …). */
export function isPaginatedRequest(searchParams?: SearchParams): boolean {
  return !isFirstPageParam(searchParams);
}

/**
 * True when the URL carries any explicit catalog query (filters, sort, deep
 * page, …). A bare `?page=1` counts as absent — it's the canonical form of
 * the first page, not a filtered view. Used to keep editorial listings
 * (e.g. the category register) on clean URLs only.
 */
export function hasCatalogQueryParams(searchParams?: SearchParams): boolean {
  if (!searchParams) {
    return false;
  }
  const keys = Object.keys(searchParams);
  if (keys.length === 0) {
    return false;
  }
  if (keys.length === 1 && keys[0] === "page" && isFirstPageParam(searchParams)) {
    return false;
  }
  return true;
}

/** Core fallback for the Starter search overlay URL helper. */
export function buildSearchUrl({ query, categoryId }: { query: string; categoryId?: string }): string {
  const params = new URLSearchParams();
  if (query.trim()) { params.set("q", query.trim()); }
  if (categoryId && categoryId !== "0") { params.set("category", categoryId); }
  return `/search${params.toString() ? `?${params.toString()}` : ""}`;
}

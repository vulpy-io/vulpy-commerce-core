/**
 * Pure helpers for sharding the storefront XML sitemap.
 *
 * Next.js has a 50k-URL cap per sitemap file and emits an index at
 * `/sitemap.xml` that lists every shard. This module centralises how many
 * shards a crawlable site exports and how the index XML is shaped so the
 * `app/sitemap.ts` route stays a thin Next.sitemap() wrapper and the shard
 * locators stay deterministic and testable.
 */

/** Number of shards a fully-indexable store serves (`/sitemap/{0..3}.xml`). */
export const SITEMAP_SHARD_COUNT = 4;

const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";

/**
 * Which shard ids to generate. A crawl-locked (noindex) site serves a single
 * empty shard; an indexable site serves all SITEMAP_SHARD_COUNT shards.
 */
export function getSitemapShardIds(noindex: boolean): number[] {
  if (noindex) {
    return [0];
  }
  return Array.from({ length: SITEMAP_SHARD_COUNT }, (_, index) => index);
}

/**
 * Build the `<sitemapindex>` XML pointing at each shard. Used as the pure
 * reference for the route index; Next serves the real `/sitemap.xml` index
 * automatically when `app/sitemap.ts` exports `generateSitemaps`.
 */
export function buildSitemapIndexXml(
  siteUrl: string,
  shardIds: number[]
): string {
  const locs = shardIds
    .map(
      (id) =>
        `  <sitemap>\n    <loc>${siteUrl}/sitemap/${id}.xml</loc>\n  </sitemap>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${SITEMAP_NS}">\n${locs}\n</sitemapindex>`;
}

/**
 * Expand a listing's sitemap URL into paginated URLs (`?page=2..N`). Page 1
 * stays clean (no query) — matches the canonical emitted by the listing pages.
 * When `totalPages` is 1 or less, returns just the clean URL.
 */
export function paginatedListingUrls(
  cleanUrl: string,
  totalPages: number
): string[] {
  const urls = [cleanUrl];
  for (let page = 2; page <= totalPages; page += 1) {
    urls.push(`${cleanUrl}?page=${page}`);
  }
  return urls;
}
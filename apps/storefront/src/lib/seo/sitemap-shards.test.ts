import { describe, expect, it } from "vitest";
import {
  buildSitemapIndexXml,
  getSitemapShardIds,
  paginatedListingUrls,
} from "./sitemap-shards";

describe("getSitemapShardIds", () => {
  it("returns only shard 0 when noindex", () => {
    expect(getSitemapShardIds(true)).toEqual([0]);
  });

  it("returns all shards when indexable", () => {
    expect(getSitemapShardIds(false)).toEqual([0, 1, 2, 3]);
  });
});

describe("buildSitemapIndexXml", () => {
  it("lists shard locs under the site root", () => {
    const xml = buildSitemapIndexXml("https://example.com", [0, 1]);

    expect(xml).toContain("<loc>https://example.com/sitemap/0.xml</loc>");
    expect(xml).toContain("<loc>https://example.com/sitemap/1.xml</loc>");
    expect(xml).toContain("<sitemapindex");
  });
});

describe("paginatedListingUrls", () => {
  it("returns just the clean URL for a single page", () => {
    expect(paginatedListingUrls("https://example.com/shop", 1)).toEqual([
      "https://example.com/shop",
    ]);
  });

  it("keeps page 1 clean and adds ?page=N for pages 2+", () => {
    expect(
      paginatedListingUrls("https://example.com/sale", 3)
    ).toEqual([
      "https://example.com/sale",
      "https://example.com/sale?page=2",
      "https://example.com/sale?page=3",
    ]);
  });

  it("returns only the clean URL when totalPages is 0", () => {
    expect(paginatedListingUrls("https://example.com/shop", 0)).toEqual([
      "https://example.com/shop",
    ]);
  });
});

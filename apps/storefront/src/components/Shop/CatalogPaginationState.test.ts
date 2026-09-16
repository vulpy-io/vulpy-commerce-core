import { describe, expect, it } from "vitest";
import type { ShopFilters } from "@/types/shop";
import { getLoadedPageHref } from "./CatalogPaginationState";

function fullFilters(overrides: Partial<ShopFilters> = {}): ShopFilters {
  return {
    categoryIds: [],
    sizes: [],
    colors: [],
    finishes: [],
    attributes: {},
    priceMin: 0,
    priceMax: 100,
    saleOnly: false,
    ...overrides,
  };
}

describe("getLoadedPageHref", () => {
  it("returns null on the last page", () => {
    expect(
      getLoadedPageHref("/shop", {
        loadedPage: 5,
        totalPages: 5,
        sort: "latest",
        filters: fullFilters(),
      })
    ).toBeNull();
  });

  it("links to loadedPage + 1 with page params", () => {
    const href = getLoadedPageHref("/shop", {
      loadedPage: 3,
      totalPages: 5,
      sort: "latest",
      filters: fullFilters(),
    });
    expect(href).toContain("page=4");
  });

  it("keeps sort and filter params in the next link", () => {
    const href = getLoadedPageHref("/shop", {
      loadedPage: 2,
      totalPages: 5,
      sort: "price-asc",
      filters: fullFilters({ sizes: ["M"] }),
    });
    expect(href).toContain("page=3");
    expect(href).toContain("sort=price-asc");
    expect(href).toContain("sizes=M");
  });
});
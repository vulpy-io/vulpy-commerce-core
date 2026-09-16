import { canUseDatabaseListing } from "../listing-strategy";
import { parseShopCatalogQuery } from "../shop-query";

describe("listing strategy", () => {
  it("does not use database listing for category-scoped catalog requests", () => {
    const parsed = parseShopCatalogQuery({
      region_id: "reg_123",
      sort: "latest",
      category_id: "pcat_123",
      include_facets: "0",
      limit: "12",
      offset: "0",
    });

    expect(canUseDatabaseListing(parsed)).toBe(false);
  });

  it("does not use database listing for unfiltered latest queries", () => {
    const parsed = parseShopCatalogQuery({
      region_id: "reg_123",
      sort: "latest",
      include_facets: "0",
      limit: "12",
      offset: "0",
    });

    expect(canUseDatabaseListing(parsed)).toBe(false);
  });
});

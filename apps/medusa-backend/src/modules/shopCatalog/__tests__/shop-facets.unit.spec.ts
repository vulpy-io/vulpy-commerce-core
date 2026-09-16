import { buildShopCatalogFacets } from "../shop-facets";
import type { ShopCatalogIndexEntry } from "../shop-index";

describe("buildShopCatalogFacets", () => {
  it("sorts size facets using PDP size ordering", () => {
    const entries: ShopCatalogIndexEntry[] = [
      {
        id: "prod_1",
        title: "A",
        categoryIds: [],
        categoryNames: [],
        sizes: ["XL", "XS"],
        filterSizes: ["XL", "XS"],
        colors: [],
        finishes: [],
        filterableAttributes: {},
        price: 10,
        discountedPrice: 0,
        minPrice: 10,
        maxPrice: 10,
        onSale: false,
      },
      {
        id: "prod_2",
        title: "B",
        categoryIds: [],
        categoryNames: [],
        sizes: ["M", "S", "L"],
        filterSizes: ["M", "S", "L"],
        colors: [],
        finishes: [],
        filterableAttributes: {},
        price: 10,
        discountedPrice: 0,
        minPrice: 10,
        maxPrice: 10,
        onSale: false,
      },
    ];

    expect(buildShopCatalogFacets(entries).sizes).toEqual([
      "XS",
      "S",
      "M",
      "L",
      "XL",
    ]);
  });

  it("expands range sizes into discrete facet values", () => {
    const entries: ShopCatalogIndexEntry[] = [
      {
        id: "prod_socks",
        title: "Socks",
        categoryIds: [],
        categoryNames: [],
        sizes: ["39-43"],
        filterSizes: ["39", "40", "41", "42", "43"],
        colors: [],
        finishes: [],
        filterableAttributes: {},
        price: 10,
        discountedPrice: 0,
        minPrice: 10,
        maxPrice: 10,
        onSale: false,
      },
    ];

    expect(buildShopCatalogFacets(entries).sizes).toEqual([
      "39",
      "40",
      "41",
      "42",
      "43",
    ]);
  });

  it("accumulates and sorts finish facets from entries", () => {
    const entries: ShopCatalogIndexEntry[] = [
      {
        id: "prod_a",
        title: "A",
        categoryIds: [],
        categoryNames: [],
        sizes: [],
        filterSizes: [],
        colors: [],
        finishes: ["Polished", "Matte"],
        filterableAttributes: {},
        price: 10,
        discountedPrice: 0,
        minPrice: 10,
        maxPrice: 10,
        onSale: false,
      },
      {
        id: "prod_b",
        title: "B",
        categoryIds: [],
        categoryNames: [],
        sizes: [],
        filterSizes: [],
        colors: [],
        finishes: ["Brushed", "Matte"],
        filterableAttributes: {},
        price: 20,
        discountedPrice: 0,
        minPrice: 20,
        maxPrice: 20,
        onSale: false,
      },
    ];

    expect(buildShopCatalogFacets(entries).finishes).toEqual([
      "Brushed",
      "Matte",
      "Polished",
    ]);
  });
});

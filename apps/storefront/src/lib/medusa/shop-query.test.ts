import { describe, expect, it } from "vitest";
import { buildShopCatalogHref, getNextShopCatalogHref, parseShopSearchParams } from "./shop-query";

describe("shop query helpers", () => {
  const facets = {
    categories: [],
    sizes: ["S", "M"],
    colors: ["Black"],
    attributes: { brand: ["Acme"] },
    priceMin: 10,
    priceMax: 100,
  };

  const priceDefaults = { priceMin: 10, priceMax: 100 };

  it("parses page, sort, and filter params from the URL", () => {
    const parsed = parseShopSearchParams(
      {
        page: "2",
        sort: "price-asc",
        categories: "cat_shirts",
        sizes: "S,M",
        colors: "Black",
        priceMin: "15",
        priceMax: "90",
        attr_brand: "Acme",
      },
      facets
    );

    expect(parsed.page).toBe(2);
    expect(parsed.sort).toBe("price-asc");
    expect(parsed.filters.categoryIds).toEqual(["cat_shirts"]);
    expect(parsed.filters.sizes).toEqual(["S", "M"]);
    expect(parsed.filters.colors).toEqual(["Black"]);
    expect(parsed.filters.attributes.brand).toEqual(["Acme"]);
    expect(parsed.filters.priceMin).toBe(15);
    expect(parsed.filters.priceMax).toBe(90);
  });

  it("omits default price bounds from catalog links", () => {
    expect(
      buildShopCatalogHref("/shop", {
        page: 3,
        sort: "price-desc",
        priceDefaults,
        filters: {
          categoryIds: ["cat_shirts"],
          sizes: ["M"],
          colors: [],
          attributes: { brand: ["Acme"] },
          priceMin: 10,
          priceMax: 100,
        },
      })
    ).toBe(
      "/shop?page=3&sort=price-desc&categories=cat_shirts&sizes=M&attr_brand=Acme"
    );
  });

  it("includes price params only when the user changed the slider", () => {
    expect(
      buildShopCatalogHref("/shop", {
        page: 1,
        sort: "latest",
        priceDefaults,
        filters: {
          categoryIds: [],
          sizes: [],
          colors: [],
          attributes: {},
          priceMin: 20,
          priceMax: 80,
        },
      })
    ).toBe("/shop?priceMin=20&priceMax=80");
  });

  it("returns the next page href when another page exists", () => {
    expect(
      getNextShopCatalogHref("/shop", {
        currentPage: 2,
        totalPages: 5,
        sort: "latest",
        priceDefaults,
        filters: {
          categoryIds: [],
          sizes: [],
          colors: [],
          attributes: {},
          priceMin: 10,
          priceMax: 100,
        },
      })
    ).toBe("/shop?page=3");
    expect(
      getNextShopCatalogHref("/shop", {
        currentPage: 5,
        totalPages: 5,
        sort: "latest",
        priceDefaults,
        filters: {
          categoryIds: [],
          sizes: [],
          colors: [],
          attributes: {},
          priceMin: 10,
          priceMax: 100,
        },
      })
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { Product } from "@/types/product";
import {
  deprioritizeOutOfStockProducts,
  getShopSortLabel,
  sortShopProducts,
} from "./shop-display";

const products: Product[] = [
  {
    id: "1",
    title: "Bravo",
    price: 20,
    discountedPrice: 20,
    reviews: 0,
    createdAt: "2024-01-03T00:00:00.000Z",
    salesCount: 2,
    inStock: true,
  },
  {
    id: "2",
    title: "Alpha",
    price: 10,
    discountedPrice: 10,
    reviews: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    salesCount: 5,
    inStock: false,
  },
  {
    id: "3",
    title: "Charlie",
    price: 30,
    discountedPrice: 30,
    reviews: 0,
    createdAt: "2024-01-02T00:00:00.000Z",
    salesCount: 5,
    inStock: true,
  },
];

describe("sortShopProducts", () => {
  it("sorts latest by newest createdAt first, with out-of-stock last", () => {
    const sorted = sortShopProducts(products, "latest");
    expect(sorted.map((product) => product.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts oldest by oldest createdAt first, with out-of-stock last", () => {
    const sorted = sortShopProducts(products, "oldest");
    expect(sorted.map((product) => product.id)).toEqual(["3", "1", "2"]);
  });

  it("sorts bestsellers by sales count, then recency, with out-of-stock last", () => {
    const sorted = sortShopProducts(products, "bestsellers");
    expect(sorted.map((product) => product.id)).toEqual(["3", "1", "2"]);
  });

  it("sorts names ascending and descending, with out-of-stock last", () => {
    expect(sortShopProducts(products, "name-asc").map((product) => product.title)).toEqual([
      "Bravo",
      "Charlie",
      "Alpha",
    ]);
    expect(sortShopProducts(products, "name-desc").map((product) => product.title)).toEqual([
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
  });

  it("sorts price ascending by minPrice and descending by maxPrice", () => {
    const catalog: Product[] = [
      {
        id: "range",
        title: "Range",
        price: 12,
        discountedPrice: 12,
        minPrice: 12,
        maxPrice: 100,
        reviews: 0,
        inStock: true,
      },
      {
        id: "flat",
        title: "Flat",
        price: 50,
        discountedPrice: 50,
        minPrice: 50,
        maxPrice: 50,
        reviews: 0,
        inStock: true,
      },
    ];

    expect(sortShopProducts(catalog, "price-asc").map((p) => p.id)).toEqual([
      "range",
      "flat",
    ]);
    expect(sortShopProducts(catalog, "price-desc").map((p) => p.id)).toEqual([
      "range",
      "flat",
    ]);
  });
});

describe("deprioritizeOutOfStockProducts", () => {
  it("keeps in-stock products ahead of out-of-stock products", () => {
    expect(deprioritizeOutOfStockProducts(products).map((product) => product.id)).toEqual([
      "1",
      "3",
      "2",
    ]);
  });
});

describe("getShopSortLabel", () => {
  it("uses default labels when CMS overrides are absent", () => {
    expect(getShopSortLabel("name-asc", {})).toBe("Name: A–Z");
    expect(getShopSortLabel("name-desc", {})).toBe("Name: Z–A");
  });

  it("uses CMS labels keyed by sort value", () => {
    expect(
      getShopSortLabel("name-desc", {
        "name-desc": "Custom Z-A",
      })
    ).toBe("Custom Z-A");
  });
});

import { describe, expect, it } from "vitest";
import type { ShopProduct } from "@/types/shop";
import {
  buildFilterFacets,
  createDefaultFilters,
  filterShopProducts,
  getAttributeFilterLabel,
  normalizeShopFilterFacets,
} from "./shop-filters";

const products: ShopProduct[] = [
  {
    id: "variant_1",
    productId: "prod_1",
    variantId: "variant_1",
    title: "Black Tee",
    reviews: 0,
    price: 10,
    discountedPrice: 8,
    categoryIds: ["cat_shirts"],
    categoryNames: ["Shirts"],
    sizes: ["S", "M"],
    colors: ["Black"],
    filterableAttributes: { material: "Cotton" },
    minPrice: 8,
    maxPrice: 10,
    onSale: true,
  },
  {
    id: "variant_2",
    productId: "prod_2",
    variantId: "variant_2",
    title: "Blue Hoodie",
    reviews: 0,
    price: 20,
    discountedPrice: 0,
    categoryIds: ["cat_hoodies"],
    categoryNames: ["Hoodies"],
    sizes: ["L"],
    colors: ["Blue"],
    filterableAttributes: { brand: "Acme" },
    minPrice: 20,
    maxPrice: 20,
    onSale: false,
  },
];

describe("getAttributeFilterLabel", () => {
  it("uses known labels and title-cases unknown keys", () => {
    expect(getAttributeFilterLabel("brand")).toBe("Brand");
    expect(getAttributeFilterLabel("material")).toBe("Material");
    expect(getAttributeFilterLabel("finish")).toBe("Finish");
    expect(getAttributeFilterLabel("custom_field")).toBe("Custom Field");
  });
});

describe("buildFilterFacets", () => {
  it("aggregates categories, sizes, colors and price bounds", () => {
    const facets = buildFilterFacets(products);

    expect(facets.categories).toEqual([
      { id: "cat_hoodies", name: "Hoodies", products: 1 },
      { id: "cat_shirts", name: "Shirts", products: 1 },
    ]);
    expect(facets.sizes).toEqual(["S", "M", "L"]);
    expect(facets.colors).toEqual(["Black", "Blue"]);
    expect(facets.attributes).toEqual({
      brand: ["Acme"],
      material: ["Cotton"],
    });
    expect(facets.priceMin).toBe(8);
    expect(facets.priceMax).toBe(20);
  });

  it("surfaces finishes and synthesized filterable attributes as facets", () => {
    const withFinishes: ShopProduct[] = [
      {
        ...products[0],
        finishes: ["Antique Brass", "Chrome"],
        filterableAttributes: {
          material: "Cotton",
          finish: "Antique Brass",
        },
      },
    ];

    const facets = buildFilterFacets(withFinishes);
    expect(facets.finishes).toEqual(["Antique Brass", "Chrome"]);
    expect(facets.attributes.material).toEqual(["Cotton"]);
    expect(facets.attributes.finish).toEqual(["Antique Brass"]);

    const filters = {
      ...createDefaultFilters(facets),
      attributes: { material: ["Cotton"], finish: [] },
    };
    expect(filterShopProducts(withFinishes, filters).map((p) => p.id)).toEqual([
      "variant_1",
    ]);
  });
});

describe("normalizeShopFilterFacets", () => {
  it("sorts sizes using PDP size ordering", () => {
    const facets = normalizeShopFilterFacets({
      categories: [],
      sizes: ["XL", "XS", "M", "S", "L"],
      colors: [],
      attributes: {},
      priceMin: 0,
      priceMax: 100,
    });

    expect(facets.sizes).toEqual(["XS", "S", "M", "L", "XL"]);
  });

  it("passes finishes, colors and attributes through untouched", () => {
    const facets = normalizeShopFilterFacets({
      categories: [],
      sizes: [],
      colors: ["Oxide", "Verde"],
      finishes: ["Brushed", "Matte"],
      attributes: { material: ["Brass", "Stone"] },
      priceMin: 0,
      priceMax: 100,
    });

    // Part 4 contract: the backend already normalizes these, so the
    // storefront mapper must NOT re-order or drop them.
    expect(facets.finishes).toEqual(["Brushed", "Matte"]);
    expect(facets.colors).toEqual(["Oxide", "Verde"]);
    expect(facets.attributes).toEqual({
      material: ["Brass", "Stone"],
    });
  });
});

describe("filterShopProducts", () => {
  it("filters by selected category ids", () => {
    const filters = {
      ...createDefaultFilters(buildFilterFacets(products)),
      categoryIds: ["cat_shirts"],
    };

    expect(filterShopProducts(products, filters).map((p) => p.id)).toEqual([
      "variant_1",
    ]);
  });

  it("uses product price range overlap for price filtering", () => {
    const filters = {
      ...createDefaultFilters(buildFilterFacets(products)),
      priceMin: 7,
      priceMax: 9,
    };

    expect(filterShopProducts(products, filters).map((p) => p.id)).toEqual([
      "variant_1",
    ]);
  });

  it("includes products whose range intersects the filter band", () => {
    const filters = {
      ...createDefaultFilters(buildFilterFacets(products)),
      priceMin: 9,
      priceMax: 9,
    };

    expect(filterShopProducts(products, filters).map((p) => p.id)).toEqual([
      "variant_1",
    ]);
  });

  it("filters saleOnly ranged products that are on sale", () => {
    const filters = {
      ...createDefaultFilters(buildFilterFacets(products)),
      saleOnly: true,
    };

    expect(filterShopProducts(products, filters).map((p) => p.id)).toEqual([
      "variant_1",
    ]);
  });
});

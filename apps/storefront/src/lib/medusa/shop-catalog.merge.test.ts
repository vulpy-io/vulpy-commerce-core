/**
 * Unit tests for the Part 2 facets merge guard.
 *
 * The merge closes the cold/empty facets race: after a reseed or backend
 * restart the FIRST SSR can cache an EMPTY facets response (backend still
 * warming). `mergePageAttributeFacets` fills missing attribute keys from the
 * page's own products so the sidebar never pins an empty Material/Finish/Color
 * facet for the cache lifetime.
 */
import { describe, expect, it } from "vitest";
import type { ShopFilterFacets, ShopProduct } from "@/types/shop";
import { mergePageAttributeFacets } from "./shop-filters";

const productCache: Record<string, ShopProduct> = {};
function product(filterableAttributes: Record<string, string>): ShopProduct {
  const key = JSON.stringify(filterableAttributes);
  if (productCache[key]) {
    return productCache[key];
  }
  const p: ShopProduct = {
    id: "variant_1",
    variantId: "variant_1",
    productId: "prod_1",
    handle: "demo",
    title: "Demo",
    price: 10,
    discountedPrice: null,
    minPrice: 10,
    maxPrice: 10,
    reviews: 0,
    brand: null,
    createdAt: undefined,
    updatedAt: undefined,
    salesCount: 0,
    variantCount: 1,
    variantLabel: "One Size",
    finishes: [],
    finishVariants: [],
    inStock: true,
    storeTags: [],
    imgs: { thumbnails: [], previews: [] },
    categoryIds: [],
    categoryNames: [],
    sizes: [],
    colors: [],
    filterableAttributes,
    onSale: false,
  };
  productCache[key] = p;
  return p;
}

function facets(attributes: Record<string, string[]>): ShopFilterFacets {
  return {
    categories: [],
    sizes: [],
    colors: [],
    finishes: [],
    attributes,
    priceMin: 0,
    priceMax: 100,
  };
}

describe("mergePageAttributeFacets", () => {
  it("fills a missing attribute key from the page's own products", () => {
    const result = mergePageAttributeFacets(
      facets({}),
      [product({ material: "Brass" }), product({ material: "Glass" })]
    );

    expect(result.attributes.material).toEqual(["Brass", "Glass"]);
  });

  it("keeps backend values when present and only adds missing ones", () => {
    const result = mergePageAttributeFacets(
      facets({ material: ["Brass"] }),
      [product({ material: "Brass" }), product({ material: "Glass" })]
    );

    // Backend value wins; the missing Glass value is appended.
    expect(result.attributes.material).toEqual(["Brass", "Glass"]);
  });

  it("merges multiple missing attribute keys", () => {
    const result = mergePageAttributeFacets(
      facets({}),
      [
        product({ material: "Brass", finish: "Polished" }),
        product({ material: "Glass", finish: "Matte" }),
      ]
    );

    expect(result.attributes.material).toEqual(["Brass", "Glass"]);
    expect(result.attributes.finish).toEqual(["Matte", "Polished"]);
  });

  it("returns the same facets object when nothing is missing", () => {
    const input = facets({ material: ["Brass", "Glass"] });
    const result = mergePageAttributeFacets(input, [
      product({ material: "Brass" }),
      product({ material: "Glass" }),
    ]);

    expect(result).toBe(input);
  });

  it("leaves non-attribute facets untouched", () => {
    const input = facets({ material: ["Brass"] });
    const result = mergePageAttributeFacets(input, [
      product({ material: "Brass", finish: "Polished" }),
    ]);

    expect(result.categories).toEqual([]);
    expect(result.sizes).toEqual([]);
    expect(result.colors).toEqual([]);
    expect(result.finishes).toEqual([]);
    expect(result.priceMin).toBe(0);
    expect(result.priceMax).toBe(100);
  });
});
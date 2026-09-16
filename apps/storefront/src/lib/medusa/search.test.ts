import { describe, expect, it } from "vitest";
import {
  mapSearchHitToProduct,
  mapSearchHitToShopProduct,
  mapSearchHitToSuggestion,
} from "./search";

const rangeHit = {
  id: "prod_range",
  title: "Priced Tee Range",
  handle: "priced-tee-range",
  description: "Range demo",
  thumbnail: "/static/tee.png",
  model: "",
  category_ids: ["cat_tees"],
  categories: ["Tees"],
  filterable_attributes: {},
  variants: [
    {
      id: "var_s",
      title: "S",
      sku: "S",
      options: [{ option_title: "Size", value: "S" }],
      calculated_price: {
        calculated_amount: 12,
        original_amount: 12,
        currency_code: "usd",
      },
    },
    {
      id: "var_l",
      title: "L",
      sku: "L",
      options: [{ option_title: "Size", value: "L" }],
      calculated_price: {
        calculated_amount: 16,
        original_amount: 16,
        currency_code: "usd",
      },
    },
  ],
};

describe("mapSearchHitToSuggestion", () => {
  it("maps thumbnail, model, and price bounds for typeahead rows", () => {
    const suggestion = mapSearchHitToSuggestion({
      id: "prod_123",
      title: "Racket Pro",
      handle: "racket-pro",
      description: "Desc",
      thumbnail: "/static/racket.png",
      model: "RP-2026",
      category_ids: ["cat_1"],
      categories: ["Rackets"],
      filterable_attributes: {},
      variants: [
        {
          id: "v1",
          title: "Default",
          sku: null,
          options: [],
          calculated_price: {
            calculated_amount: 49,
            original_amount: 59,
            currency_code: "usd",
          },
        },
      ],
    });

    expect(suggestion).toEqual({
      id: "prod_123",
      handle: "racket-pro",
      title: "Racket Pro",
      model: "RP-2026",
      description: "Desc",
      thumbnail: "/static/racket.png",
      price: 59,
      discountedPrice: 49,
      minPrice: 49,
      maxPrice: 49,
    });
  });
});

describe("mapSearchHitToProduct", () => {
  it("uses cheapest variant bounds for From pricing", () => {
    const product = mapSearchHitToProduct(rangeHit);

    expect(product.minPrice).toBe(12);
    expect(product.maxPrice).toBe(16);
    expect(product.discountedPrice).toBe(12);
    expect(product.variantId).toBe("var_s");
  });
});

describe("mapSearchHitToShopProduct", () => {
  it("exposes real min/max across variants", () => {
    const shop = mapSearchHitToShopProduct(rangeHit);

    expect(shop.minPrice).toBe(12);
    expect(shop.maxPrice).toBe(16);
    expect(shop.sizes).toEqual(["S", "L"]);
  });

  it("maps sale compare-at fields for suggestions and products", () => {
    const saleHit = {
      ...rangeHit,
      id: "prod_sale",
      handle: "priced-tee-sale",
      title: "Priced Tee Sale",
      variants: [
        {
          id: "sale_s",
          title: "S",
          sku: "S",
          options: [{ option_title: "Size", value: "S" }],
          calculated_price: {
            calculated_amount: 12,
            original_amount: 18,
            currency_code: "usd",
          },
        },
        {
          id: "sale_m",
          title: "M",
          sku: "M",
          options: [{ option_title: "Size", value: "M" }],
          calculated_price: {
            calculated_amount: 12,
            original_amount: 18,
            currency_code: "usd",
          },
        },
      ],
    };

    const suggestion = mapSearchHitToSuggestion(saleHit);
    expect(suggestion.discountedPrice).toBe(12);
    expect(suggestion.price).toBe(18);
    expect(suggestion.minPrice).toBe(12);
    expect(suggestion.maxPrice).toBe(12);

    const shop = mapSearchHitToShopProduct(saleHit);
    expect(shop.onSale).toBe(true);
  });
});

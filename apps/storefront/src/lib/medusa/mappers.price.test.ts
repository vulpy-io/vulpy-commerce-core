import type { HttpTypes } from "@medusajs/types";
import { describe, expect, it } from "vitest";
import {
  mapMedusaProductToProduct,
  mapMedusaProductToShopProduct,
} from "./mappers";

function variant(input: {
  id: string;
  calculated: number;
  original?: number;
}): HttpTypes.StoreProductVariant {
  return {
    id: input.id,
    title: input.id,
    options: [],
    calculated_price: {
      calculated_amount: input.calculated,
      original_amount: input.original ?? input.calculated,
      currency_code: "usd",
    },
  } as HttpTypes.StoreProductVariant;
}

function product(
  variants: HttpTypes.StoreProductVariant[]
): HttpTypes.StoreProduct {
  return {
    id: "prod_1",
    title: "Demo",
    handle: "demo",
    variants,
    images: [],
  } as HttpTypes.StoreProduct;
}

describe("mapMedusaProductToProduct", () => {
  it("uses the cheapest variant for listing price and exposes bounds", () => {
    const mapped = mapMedusaProductToProduct(
      product([
        variant({ id: "v_l", calculated: 16 }),
        variant({ id: "v_s", calculated: 12 }),
        variant({ id: "v_m", calculated: 14 }),
      ]),
      undefined,
      "usd"
    );

    expect(mapped?.variantId).toBe("v_s");
    expect(mapped?.discountedPrice).toBe(12);
    expect(mapped?.minPrice).toBe(12);
    expect(mapped?.maxPrice).toBe(16);
  });

  it("keeps equal variant prices without a range", () => {
    const mapped = mapMedusaProductToProduct(
      product([
        variant({ id: "v1", calculated: 10 }),
        variant({ id: "v2", calculated: 10 }),
      ]),
      undefined,
      "usd"
    );

    expect(mapped?.minPrice).toBe(10);
    expect(mapped?.maxPrice).toBe(10);
  });

  it("maps sale compare-at on the cheapest variant", () => {
    const mapped = mapMedusaProductToProduct(
      product([
        variant({ id: "v1", calculated: 12, original: 18 }),
        variant({ id: "v2", calculated: 14, original: 18 }),
      ]),
      undefined,
      "usd"
    );

    expect(mapped?.discountedPrice).toBe(12);
    expect(mapped?.price).toBe(18);
  });

  it("keeps a free variant amount of zero", () => {
    const mapped = mapMedusaProductToProduct(
      product([
        variant({ id: "free", calculated: 0, original: 10 }),
        variant({ id: "paid", calculated: 20 }),
      ]),
      undefined,
      "usd"
    );

    expect(mapped?.discountedPrice).toBe(0);
    expect(mapped?.minPrice).toBe(0);
    expect(mapped?.maxPrice).toBe(20);
  });

  it("uses an explicit variantId without changing product bounds", () => {
    const mapped = mapMedusaProductToProduct(
      product([
        variant({ id: "v_s", calculated: 12 }),
        variant({ id: "v_l", calculated: 16 }),
      ]),
      "v_l",
      "usd"
    );

    expect(mapped?.variantId).toBe("v_l");
    expect(mapped?.discountedPrice).toBe(16);
    expect(mapped?.minPrice).toBe(12);
    expect(mapped?.maxPrice).toBe(16);
  });
});

describe("mapMedusaProductToShopProduct", () => {
  it("marks onSale when any variant is discounted", () => {
    const mapped = mapMedusaProductToShopProduct(
      product([
        variant({ id: "v1", calculated: 10 }),
        variant({ id: "v2", calculated: 8, original: 12 }),
      ]),
      "usd"
    );

    expect(mapped?.onSale).toBe(true);
    expect(mapped?.minPrice).toBe(8);
    expect(mapped?.maxPrice).toBe(10);
  });
});

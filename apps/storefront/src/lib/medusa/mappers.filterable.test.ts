import type { HttpTypes } from "@medusajs/types";
import { describe, expect, it } from "vitest";
import { mapMedusaProductToShopProduct } from "./mappers";

function makeVariant(id: string): HttpTypes.StoreProductVariant {
  return {
    id,
    title: id,
    options: [],
    calculated_price: {
      calculated_amount: 10,
      original_amount: 10,
      currency_code: "usd",
    },
  } as HttpTypes.StoreProductVariant;
}

function makeProduct(
  overrides: Partial<HttpTypes.StoreProduct> = {}
): HttpTypes.StoreProduct {
  return {
    id: "prod_1",
    title: "Demo",
    handle: "demo",
    variants: [makeVariant("variant_1")],
    images: [],
    ...overrides,
  } as HttpTypes.StoreProduct;
}

describe("mapMedusaProductToShopProduct filterable attributes", () => {
  it("synthesizes material from descriptive metadata.attributes", () => {
    const mapped = mapMedusaProductToShopProduct(
      makeProduct({
        metadata: {
          attributes: [{ label: "Material", value: "Glass" }],
        },
      }),
      "usd"
    );

    expect(mapped?.filterableAttributes).toEqual({ material: "Glass" });
  });

  it("prefers explicit metadata.filterable over descriptive attributes", () => {
    const mapped = mapMedusaProductToShopProduct(
      makeProduct({
        metadata: {
          filterable: { material: "Steel" },
          attributes: [{ label: "Material", value: "Glass" }],
        },
      }),
      "usd"
    );

    expect(mapped?.filterableAttributes).toEqual({ material: "Steel" });
  });

  it("merges explicit filterable plus other descriptive attributes", () => {
    const mapped = mapMedusaProductToShopProduct(
      makeProduct({
        metadata: {
          filterable: { brand: "Hector Finch" },
          attributes: [
            { label: "Material", value: "Brass" },
            { label: "Edition", value: "Open edition" },
          ],
        },
      }),
      "usd"
    );

    expect(mapped?.filterableAttributes).toEqual({
      brand: "Hector Finch",
      material: "Brass",
    });
  });

  it("does not synthesize excluded or non-material attribute keys", () => {
    const mapped = mapMedusaProductToShopProduct(
      makeProduct({
        metadata: {
          attributes: [
            { label: "Volume", value: "1L" },
            { label: "Custom", value: "x" },
          ],
        },
      }),
      "usd"
    );

    expect(mapped?.filterableAttributes).toEqual({});
  });
});
import type { HttpTypes } from "@medusajs/types";
import { describe, expect, it } from "vitest";
import { mapMedusaProductToProduct } from "./mappers";

function variant(input: {
  id: string;
  finish?: string;
  imageUrl?: string;
  thumbnail?: string;
  calculated?: number;
}): HttpTypes.StoreProductVariant {
  return {
    id: input.id,
    title: input.id,
    options: input.finish
      ? [
          {
            option: { title: "Color" },
            value: input.finish,
          },
        ]
      : [],
    metadata:
      input.imageUrl === undefined ? undefined : { image_url: input.imageUrl },
    thumbnail: input.thumbnail,
    calculated_price: {
      calculated_amount: input.calculated ?? 10,
      original_amount: input.calculated ?? 10,
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

describe("mapMedusaProductToProduct finishVariants", () => {
  it("maps each unique finish to its variant id and metadata image", () => {
    const mapped = mapMedusaProductToProduct(
      product([
        variant({
          id: "v_brass",
          finish: "Brass",
          imageUrl: "https://cdn.example.com/brass-large.jpg",
        }),
        variant({
          id: "v_nickel",
          finish: "Nickel",
          imageUrl: "https://cdn.example.com/nickel-large.jpg",
        }),
      ]),
      undefined,
      "usd"
    );

    expect(mapped?.finishVariants).toEqual([
      {
        name: "Brass",
        variantId: "v_brass",
        image: "https://cdn.example.com/brass-large.jpg",
      },
      {
        name: "Nickel",
        variantId: "v_nickel",
        image: "https://cdn.example.com/nickel-large.jpg",
      },
    ]);
  });

  it("keeps the first variant per finish and resolves relative image urls", () => {
    const mapped = mapMedusaProductToProduct(
      product([
        variant({ id: "v_a", finish: "Brass", imageUrl: "/static/brass.jpg" }),
        variant({ id: "v_b", finish: "Brass", imageUrl: "/static/brass-2.jpg" }),
      ]),
      undefined,
      "usd"
    );

    expect(mapped?.finishVariants).toEqual([
      { name: "Brass", variantId: "v_a", image: "/static/brass.jpg" },
    ]);
  });

  it("prefers the variant thumbnail over metadata.image_url", () => {
    const mapped = mapMedusaProductToProduct(
      product([
        variant({
          id: "v_1",
          finish: "Black",
          thumbnail: "https://cdn.example.com/thumb.jpg",
          imageUrl: "https://cdn.example.com/large.jpg",
        }),
      ]),
      undefined,
      "usd"
    );

    expect(mapped?.finishVariants?.[0]?.image).toBe(
      "https://cdn.example.com/thumb.jpg"
    );
  });

  it("leaves image undefined when the finish variant has no image", () => {
    const mapped = mapMedusaProductToProduct(
      product([variant({ id: "v_1", finish: "Zinc" })]),
      undefined,
      "usd"
    );

    expect(mapped?.finishVariants).toEqual([
      { name: "Zinc", variantId: "v_1", image: undefined },
    ]);
  });

  it("returns an empty list when no variant has a finish option", () => {
    const mapped = mapMedusaProductToProduct(
      product([variant({ id: "v_1" })]),
      undefined,
      "usd"
    );

    expect(mapped?.finishVariants).toEqual([]);
    expect(mapped?.finishes).toEqual([]);
  });
});
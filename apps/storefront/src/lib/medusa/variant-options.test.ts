import { describe, expect, it } from "vitest";
import type { ProductDetail } from "@/types/product-detail";
import {
  findPreviewVariant,
  findVariantByOptions,
  getAvailableOptionValues,
  getInitialSelectedOptions,
  selectOptionValue,
  sortProductOptions,
} from "./variant-options";

const product: ProductDetail = {
  productId: "prod_1",
  handle: "test-product",
  title: "Test Product",
  description: "",
  images: [],
  options: [
    { id: "opt_size", title: "Size", values: ["S", "M"] },
    { id: "opt_color", title: "Color", values: ["Black", "White"] },
  ],
  variants: [
    {
      id: "var_s_black",
      title: "S / Black",
      optionValues: { Size: "S", Color: "Black" },
      price: 10,
      discountedPrice: 0,
      inStock: true,
    },
    {
      id: "var_s_white",
      title: "S / White",
      optionValues: { Size: "S", Color: "White" },
      price: 10,
      discountedPrice: 0,
      inStock: true,
    },
    {
      id: "var_m_black",
      title: "M / Black",
      optionValues: { Size: "M", Color: "Black" },
      price: 12,
      discountedPrice: 0,
      inStock: true,
    },
  ],
};

describe("variant options helpers", () => {
  it("initializes selected options from first variant", () => {
    expect(getInitialSelectedOptions(product)).toEqual({
      Size: "S",
      Color: "Black",
    });
  });

  it("finds exact variant by option set", () => {
    const match = findVariantByOptions(product.variants, {
      Size: "M",
      Color: "Black",
    });

    expect(match?.id).toBe("var_m_black");
  });

  it("switches to an existing variant when selecting a value", () => {
    const selected = selectOptionValue(
      product.variants,
      { Size: "S", Color: "Black" },
      "Color",
      "White"
    );

    expect(selected).toEqual({ Size: "S", Color: "White" });
  });

  it("returns available values for an option based on other selections", () => {
    const availableColors = Array.from(
      getAvailableOptionValues(product.variants, { Size: "M", Color: "Black" }, "Color")
    );

    expect(availableColors).toEqual(["Black"]);
  });

  it("sorts size options including compound values", () => {
    const sorted = sortProductOptions([
      {
        id: "opt_size",
        title: "Size",
        values: ["XL", "S/M", "S", "L/XL", "M", "L"],
      },
    ]);

    expect(sorted[0]?.values).toEqual(["S", "S/M", "M", "L", "L/XL", "XL"]);
  });

  it("keeps other options when selecting an unavailable combination", () => {
    const selected = selectOptionValue(
      product.variants,
      { Size: "M", Color: "Black" },
      "Color",
      "White"
    );

    expect(selected).toEqual({ Size: "M", Color: "White" });
    expect(findVariantByOptions(product.variants, selected)).toBeNull();
  });

  it("previews the closest matching variant for unavailable combos", () => {
    const preview = findPreviewVariant(
      product.variants,
      { Size: "M", Color: "White" },
      "Color"
    );
    expect(preview?.optionValues.Color).toBe("White");
    expect(preview?.id).toBe("var_s_white");
  });
});

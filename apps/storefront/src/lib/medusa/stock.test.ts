import { describe, expect, it } from "vitest";
import {
  formatCartLineItemOptions,
  formatLineItemOptions,
  formatVariantOptionLabel,
  getCustomerFacingOptions,
} from "./product-options";
import {
  getDiscountPercent,
  getMaxPurchasableQuantity,
  isProductInStock,
  isVariantInStock,
} from "./stock";

describe("stock helpers", () => {
  it("treats unmanaged inventory as in stock", () => {
    expect(isVariantInStock({ manageInventory: false, inventoryQuantity: 0 })).toBe(
      true
    );
  });

  it("treats zero managed inventory as out of stock", () => {
    expect(isVariantInStock({ manageInventory: true, inventoryQuantity: 0 })).toBe(
      false
    );
  });

  it("returns discount percent when price is reduced", () => {
    expect(getDiscountPercent(100, 70)).toBe(30);
    expect(getDiscountPercent(10, 10)).toBeNull();
  });

  it("checks product stock from any variant", () => {
    expect(
      isProductInStock([
        { manageInventory: true, inventoryQuantity: 0 },
        { manageInventory: false },
      ])
    ).toBe(true);
  });

  it("caps purchasable quantity by inventory", () => {
    expect(getMaxPurchasableQuantity({ manageInventory: true, inventoryQuantity: 3 })).toBe(
      3
    );
    expect(getMaxPurchasableQuantity({ manageInventory: false })).toBe(99);
  });
});

describe("product option helpers", () => {
  const options = [
    { id: "size", title: "Size", values: ["S", "M", "L"] },
    { id: "color", title: "Color", values: ["Black"] },
  ];

  it("filters single-value options from customer-facing list", () => {
    expect(getCustomerFacingOptions(options)).toEqual([
      { id: "size", title: "Size", values: ["S", "M", "L"] },
    ]);
  });

  it("formats only customer-facing line item options", () => {
    const label = formatLineItemOptions(
      [
        { option: { title: "Size" }, value: "M" },
        { option: { title: "Color" }, value: "Black" },
      ],
      options
    );

    expect(label).toBe("M");
  });

  it("hides single option dimension when product options are unavailable", () => {
    const label = formatLineItemOptions([
      { option: { title: "Size" }, value: "M" },
    ]);

    expect(label).toBe("");
  });

  it("formats variant option values like cart line items", () => {
    const label = formatVariantOptionLabel(
      { Size: "M", Color: "Black" },
      [
        { id: "size", title: "Size", values: ["S", "M", "L"] },
        { id: "color", title: "Color", values: ["Black"] },
      ]
    );

    expect(label).toBe("M");
  });

  it("formats cart line item options from store product metadata", () => {
    const label = formatCartLineItemOptions({
      id: "item_1",
      product: {
        id: "prod_1",
        options: [
          {
            id: "opt_size",
            title: "Size",
            values: [
              { id: "v1", value: "S" },
              { id: "v2", value: "M" },
            ],
          },
          {
            id: "opt_color",
            title: "Color",
            values: [{ id: "v3", value: "Black" }],
          },
        ],
      },
      variant: {
        id: "var_1",
        options: [
          { option: { title: "Size" }, value: "M" },
          { option: { title: "Color" }, value: "Black" },
        ],
      },
    } as never);

    expect(label).toBe("M");
  });
});

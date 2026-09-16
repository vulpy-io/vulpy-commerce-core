import { describe, expect, it } from "vitest";
import {
  buildCartIssues,
  formatCartIssueMessages,
  inspectCartLineItemsWithCatalog,
  isCheckoutBlocked,
} from "./cart-issues";

describe("cart validation", () => {
  it("flags line items whose variants are no longer in catalog", () => {
    const inspection = inspectCartLineItemsWithCatalog(
      [
        {
          id: "item_1",
          product_id: "prod_missing",
          variant_id: "var_missing",
          title: "Old Shirt",
        },
      ] as never,
      new Map()
    );

    expect(inspection.unavailableLineItemIds).toEqual(["item_1"]);
    expect(inspection.removedTitles).toEqual(["Old Shirt"]);
    expect(inspection.outOfStockIssues).toEqual([]);
  });

  it("flags out-of-stock and over-quantity line items", () => {
    const inspection = inspectCartLineItemsWithCatalog(
      [
        {
          id: "item_1",
          variant_id: "var_1",
          title: "Sold Out Tee",
          quantity: 2,
        },
      ] as never,
      new Map([
        [
          "var_1",
          {
            manage_inventory: true,
            inventory_quantity: 1,
          },
        ],
      ])
    );

    expect(inspection.outOfStockIssues).toEqual([
      {
        kind: "out_of_stock",
        title: "Sold Out Tee",
        lineItemId: "item_1",
        maxQuantity: 1,
      },
    ]);
  });

  it("builds checkout blockers and user-facing messages", () => {
    const issues = buildCartIssues({
      unavailableLineItemIds: ["item_1"],
      removedTitles: ["Old Shirt"],
      outOfStockIssues: [
        {
          kind: "out_of_stock",
          title: "Sold Out Tee",
          lineItemId: "item_2",
          maxQuantity: 0,
        },
      ],
    });

    expect(isCheckoutBlocked(issues)).toBe(true);
    expect(formatCartIssueMessages(issues)).toEqual([
      "Unavailable items were removed from your cart: Old Shirt.",
      "Some items are out of stock: Sold Out Tee. Please update your cart before checkout.",
    ]);
  });
});

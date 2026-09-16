import type { HttpTypes } from "@medusajs/types";
import { getMaxPurchasableQuantity, isVariantInStock } from "./stock";

export type CartIssue =
  | { kind: "removed_unavailable"; title: string }
  | { kind: "out_of_stock"; title: string; lineItemId: string; maxQuantity: number };

export type CartInspection = {
  unavailableLineItemIds: string[];
  removedTitles: string[];
  outOfStockIssues: Extract<CartIssue, { kind: "out_of_stock" }>[];
};

export type StoreCartResult = {
  cart: HttpTypes.StoreCart | null;
  issues: CartIssue[];
  checkoutBlocked: boolean;
};

function getVariantStockFields(variant: {
  manage_inventory?: boolean;
  inventory_quantity?: number | null;
}) {
  return {
    manageInventory: variant.manage_inventory ?? false,
    inventoryQuantity: variant.inventory_quantity ?? null,
  };
}

export function inspectCartLineItemsWithCatalog(
  items: HttpTypes.StoreCartLineItem[],
  variantMap: Map<
    string,
    { manage_inventory?: boolean; inventory_quantity?: number | null }
  >
): CartInspection {
  const unavailableLineItemIds: string[] = [];
  const removedTitles: string[] = [];
  const outOfStockIssues: CartInspection["outOfStockIssues"] = [];

  for (const item of items) {
    if (!item.id) {
      continue;
    }

    const variant = variantMap.get(item.variant_id ?? "");
    const title = item.title ?? item.product?.title ?? "Product";

    if (!variant) {
      unavailableLineItemIds.push(item.id);
      removedTitles.push(title);
      continue;
    }

    const stock = getVariantStockFields(variant);
    const maxQuantity = getMaxPurchasableQuantity(stock);
    const quantity = item.quantity ?? 1;

    if (!isVariantInStock(stock) || quantity > maxQuantity) {
      outOfStockIssues.push({
        kind: "out_of_stock",
        title,
        lineItemId: item.id,
        maxQuantity,
      });
    }
  }

  return { unavailableLineItemIds, removedTitles, outOfStockIssues };
}

export function buildCartIssues(inspection: CartInspection): CartIssue[] {
  const issues: CartIssue[] = inspection.removedTitles.map((title) => ({
    kind: "removed_unavailable",
    title,
  }));
  issues.push(...inspection.outOfStockIssues);
  return issues;
}

export function isCheckoutBlocked(issues: CartIssue[]): boolean {
  return issues.some((issue) => issue.kind === "out_of_stock");
}

export function formatCartIssueMessages(issues: CartIssue[]): string[] {
  const messages: string[] = [];

  const removed = issues.filter((issue) => issue.kind === "removed_unavailable");
  if (removed.length) {
    messages.push(
      `Unavailable items were removed from your cart: ${removed.map((issue) => issue.title).join(", ")}.`
    );
  }

  const outOfStock = issues.filter((issue) => issue.kind === "out_of_stock");
  if (outOfStock.length) {
    messages.push(
      `Some items are out of stock: ${outOfStock.map((issue) => issue.title).join(", ")}. Please update your cart before checkout.`
    );
  }

  return messages;
}

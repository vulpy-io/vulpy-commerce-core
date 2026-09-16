"use client";

import type { HttpTypes } from "@medusajs/types";
import { getMaxPurchasableQuantity } from "@/lib/medusa/stock";

type LineItemVariant = {
  manage_inventory?: boolean;
  inventory_quantity?: number | null;
};

export function getLineItemStockLeft(
  item: HttpTypes.StoreCartLineItem
): number | null {
  const variant = item.variant as LineItemVariant | undefined;
  if (!variant || variant.manage_inventory === false) {
    return null;
  }

  const quantity = variant.inventory_quantity ?? 0;
  if (quantity <= 0 || quantity >= 3) {
    return null;
  }

  return quantity;
}

export function formatStockLeftMessage(left: number) {
  return `Only ${left} left`;
}

export function canIncreaseLineItemQuantity(
  item: HttpTypes.StoreCartLineItem,
  nextQuantity: number
) {
  const variant = item.variant as LineItemVariant | undefined;
  if (!variant) {
    return true;
  }

  const max = getMaxPurchasableQuantity({
    manageInventory: variant.manage_inventory,
    inventoryQuantity: variant.inventory_quantity ?? null,
  });

  return nextQuantity <= max;
}

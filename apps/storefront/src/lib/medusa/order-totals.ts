import type { HttpTypes } from "@medusajs/types";
import { fromMedusaAmount } from "./money";

type OrderWithItemSubtotal = HttpTypes.StoreOrder & {
  item_subtotal?: number | null;
};

export function getOrderItemsSubtotal(
  order: HttpTypes.StoreOrder,
  currency: string
) {
  const itemSubtotal = (order as OrderWithItemSubtotal).item_subtotal;
  if (itemSubtotal != null) {
    return fromMedusaAmount(itemSubtotal, currency);
  }

  return (order.items ?? []).reduce((sum, item) => {
    const lineTotal =
      item.subtotal == null
        ? fromMedusaAmount(item.unit_price, currency) * (item.quantity ?? 1)
        : fromMedusaAmount(item.subtotal, currency);
    return sum + lineTotal;
  }, 0);
}

export function getOrderShippingTotal(
  order: HttpTypes.StoreOrder,
  currency: string
) {
  return fromMedusaAmount(order.shipping_total, currency);
}

export function getOrderGrandTotal(
  order: HttpTypes.StoreOrder,
  currency: string
) {
  return fromMedusaAmount(order.total, currency);
}

import type { HttpTypes } from "@medusajs/types";
import { fromMedusaAmount } from "./money";

type CartWithItemSubtotal = HttpTypes.StoreCart & {
  item_subtotal?: number | null;
};

export function getCartItemsSubtotal(
  cart: HttpTypes.StoreCart,
  currency: string
) {
  const itemSubtotal = (cart as CartWithItemSubtotal).item_subtotal;
  if (itemSubtotal != null) {
    return fromMedusaAmount(itemSubtotal, currency);
  }

  return (cart.items ?? []).reduce((sum, item) => {
    const lineTotal =
      item.subtotal == null
        ? fromMedusaAmount(item.unit_price, currency) * (item.quantity ?? 1)
        : fromMedusaAmount(item.subtotal, currency);
    return sum + lineTotal;
  }, 0);
}

export function getCartShippingTotal(
  cart: HttpTypes.StoreCart,
  currency: string,
  selectedShippingOption?: HttpTypes.StoreCartShippingOption | null
) {
  const shippingFromCart = fromMedusaAmount(cart.shipping_total, currency);
  if (shippingFromCart > 0 || !selectedShippingOption) {
    return shippingFromCart;
  }

  return fromMedusaAmount(selectedShippingOption.amount, currency);
}

export function getCartGrandTotal(
  cart: HttpTypes.StoreCart,
  currency: string,
  itemsSubtotal: number,
  shippingTotal: number
) {
  const cartShipping = fromMedusaAmount(cart.shipping_total, currency);
  if (cartShipping > 0) {
    return fromMedusaAmount(cart.total, currency);
  }

  const tax = fromMedusaAmount(cart.tax_total, currency);
  const discount = fromMedusaAmount(cart.discount_total, currency);

  return itemsSubtotal + shippingTotal + tax - discount;
}

import type { HttpTypes } from "@medusajs/types";
import { fromMedusaAmount } from "@/lib/medusa/money";
import {
  getOrderGrandTotal,
  getOrderItemsSubtotal,
  getOrderShippingTotal,
} from "@/lib/medusa/order-totals";
import { emit } from "./bus";
import { ecommerceItemToAnalyticsItem } from "./catalog";
import { oncePerKey } from "./dedupe";
import { isGtmConfigured } from "./gtm";
import { isMatomoConfigured } from "./matomo";
import { pseudonymizeOrderId, stripPiiFromString } from "./sanitize";
import type { CartMutationKind, EcommerceItem, EcommerceOrder } from "./types";

function lineItemSku(item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem): string {
  return item.variant_id || item.id || "unknown";
}

function lineItemName(item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem): string {
  return stripPiiFromString(item.title || item.product_title || "Item");
}

function lineItemCategory(
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
): string | undefined {
  const product = item.product as { categories?: Array<{ name?: string }> } | undefined;
  const name = product?.categories?.[0]?.name;
  return name ? stripPiiFromString(name) : undefined;
}

function lineItemBrand(
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
): string | undefined {
  const product = item.product as
    | {
        collection?: { title?: string } | null;
        metadata?: Record<string, unknown> | null;
      }
    | undefined;
  const collectionTitle = product?.collection?.title;
  if (collectionTitle) {
    return stripPiiFromString(collectionTitle);
  }
  const metaBrand = product?.metadata?.brand;
  if (typeof metaBrand === "string" && metaBrand.trim()) {
    return stripPiiFromString(metaBrand);
  }
  return undefined;
}

export function mapCartToEcommerceItems(
  cart: HttpTypes.StoreCart | null | undefined
): EcommerceItem[] {
  if (!cart?.items?.length) {
    return [];
  }

  const currency = cart.currency_code ?? "usd";
  return cart.items.map((item) => ({
    sku: lineItemSku(item),
    name: lineItemName(item),
    category: lineItemCategory(item),
    brand: lineItemBrand(item),
    price: fromMedusaAmount(item.unit_price, currency),
    quantity: item.quantity ?? 1,
  }));
}

function quantityBySku(items: EcommerceItem[]): Map<string, EcommerceItem> {
  const map = new Map<string, EcommerceItem>();
  for (const item of items) {
    const existing = map.get(item.sku);
    if (existing) {
      map.set(item.sku, {
        ...existing,
        quantity: existing.quantity + item.quantity,
      });
    } else {
      map.set(item.sku, { ...item });
    }
  }
  return map;
}

/** Line-level deltas for add/update/remove (GA4 expects changed items, not full cart). */
export function diffCartEcommerceItems(
  previous: HttpTypes.StoreCart | null | undefined,
  next: HttpTypes.StoreCart | null | undefined,
  mutation: CartMutationKind
): EcommerceItem[] {
  const prev = quantityBySku(mapCartToEcommerceItems(previous));
  const curr = quantityBySku(mapCartToEcommerceItems(next));

  if (mutation === "clear") {
    return Array.from(prev.values());
  }

  const deltas: EcommerceItem[] = [];

  if (mutation === "add") {
    for (const [sku, item] of Array.from(curr.entries())) {
      const before = prev.get(sku)?.quantity ?? 0;
      const deltaQty = item.quantity - before;
      if (deltaQty > 0) {
        deltas.push({ ...item, quantity: deltaQty });
      }
    }
    return deltas;
  }

  if (mutation === "update") {
    for (const [sku, item] of Array.from(curr.entries())) {
      const before = prev.get(sku)?.quantity ?? 0;
      const deltaQty = item.quantity - before;
      if (deltaQty > 0) {
        deltas.push({ ...item, quantity: deltaQty });
      }
    }
    if (deltas.length) {
      return deltas;
    }
    for (const [sku, item] of Array.from(prev.entries())) {
      const after = curr.get(sku)?.quantity ?? 0;
      const deltaQty = item.quantity - after;
      if (deltaQty > 0) {
        deltas.push({ ...item, quantity: deltaQty });
      }
    }
    return deltas;
  }

  if (mutation === "remove") {
    for (const [sku, item] of Array.from(prev.entries())) {
      const after = curr.get(sku)?.quantity ?? 0;
      const deltaQty = item.quantity - after;
      if (deltaQty > 0) {
        deltas.push({ ...item, quantity: deltaQty });
      }
    }
    return deltas;
  }

  return mapCartToEcommerceItems(next);
}

function itemsValue(items: EcommerceItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/** First promotion code on cart/order when present (allowlisted string only). */
export function cartCouponCode(
  cart: HttpTypes.StoreCart | null | undefined
): string | undefined {
  const promotions = (
    cart as { promotions?: Array<{ code?: string | null }> } | null | undefined
  )?.promotions;
  const code = promotions?.find((promo) => promo.code)?.code;
  return code ? stripPiiFromString(code) : undefined;
}

function cartValueAndCurrency(cart: HttpTypes.StoreCart | null | undefined) {
  const currency = cart?.currency_code ?? "usd";
  return {
    currency,
    value: fromMedusaAmount(cart?.total, currency),
    items: mapCartToEcommerceItems(cart).map(ecommerceItemToAnalyticsItem),
    coupon: cartCouponCode(cart),
  };
}

export function mapOrderToEcommerceOrder(order: HttpTypes.StoreOrder): EcommerceOrder {
  const currency = order.currency_code ?? "usd";
  const discount = Math.abs(fromMedusaAmount(order.discount_total, currency));
  const tax = fromMedusaAmount(order.tax_total, currency);

  return {
    orderId: pseudonymizeOrderId(order.id),
    revenue: getOrderGrandTotal(order, currency),
    subtotal: getOrderItemsSubtotal(order, currency),
    tax,
    shipping: getOrderShippingTotal(order, currency),
    discount,
    currency,
    items: (order.items ?? []).map((item) => ({
      sku: lineItemSku(item),
      name: lineItemName(item),
      category: lineItemCategory(item),
      brand: lineItemBrand(item),
      price: fromMedusaAmount(item.unit_price, currency),
      quantity: item.quantity ?? 1,
    })),
  };
}

function merchantTransactionId(order: HttpTypes.StoreOrder): string {
  if (order.display_id != null) {
    return String(order.display_id);
  }
  return order.id;
}

function orderCoupon(order: HttpTypes.StoreOrder): string | undefined {
  const promotions = (
    order as { promotions?: Array<{ code?: string | null }> }
  ).promotions;
  const code = promotions?.find((promo) => promo.code)?.code;
  return code ? stripPiiFromString(code) : undefined;
}

const TRACKABLE_MUTATIONS = new Set<CartMutationKind>([
  "add",
  "update",
  "remove",
  "clear",
]);

export function shouldTrackCartMutation(kind: CartMutationKind | undefined): boolean {
  return Boolean(kind && TRACKABLE_MUTATIONS.has(kind));
}

function anyProviderConfigured(): boolean {
  return isMatomoConfigured() || isGtmConfigured();
}

export function submitCartSnapshot(
  cart: HttpTypes.StoreCart | null | undefined,
  mutation: CartMutationKind,
  source?: string,
  previousCart?: HttpTypes.StoreCart | null
): void {
  if (!(shouldTrackCartMutation(mutation) && anyProviderConfigured())) {
    return;
  }

  const currency = cart?.currency_code ?? previousCart?.currency_code ?? "usd";
  const safeSource = source ? stripPiiFromString(source) : undefined;
  const deltaEcommerceItems = diffCartEcommerceItems(
    previousCart,
    cart,
    mutation
  );
  const deltaItems = deltaEcommerceItems.map(ecommerceItemToAnalyticsItem);
  const value = itemsValue(deltaEcommerceItems);

  if (mutation === "add") {
    if (!deltaItems.length) {
      return;
    }
    emit({
      name: "add_to_cart",
      items: deltaItems,
      value,
      currency,
      source: safeSource,
    });
    return;
  }
  if (mutation === "remove") {
    if (!deltaItems.length) {
      return;
    }
    emit({
      name: "remove_from_cart",
      items: deltaItems,
      value,
      currency,
      source: safeSource,
    });
    return;
  }
  if (mutation === "clear") {
    emit({
      name: "clear_cart",
      items: deltaItems,
      value,
      currency,
      source: safeSource,
    });
    return;
  }

  if (!deltaItems.length) {
    return;
  }

  const previousQty = quantityBySku(mapCartToEcommerceItems(previousCart));
  const nextQty = quantityBySku(mapCartToEcommerceItems(cart));
  const isDecrease = Array.from(deltaEcommerceItems).every((item) => {
    const before = previousQty.get(item.sku)?.quantity ?? 0;
    const after = nextQty.get(item.sku)?.quantity ?? 0;
    return after < before;
  });

  emit({
    name: isDecrease ? "remove_from_cart" : "update_cart_quantity",
    items: deltaItems,
    value,
    currency,
    source: safeSource,
  });
}

export function submitViewCart(cart: HttpTypes.StoreCart | null | undefined): void {
  if (!anyProviderConfigured()) {
    return;
  }
  const { items, value, currency } = cartValueAndCurrency(cart);
  if (!items.length) {
    return;
  }
  emit({ name: "view_cart", items, value, currency });
}

export function submitBeginCheckout(cart: HttpTypes.StoreCart | null | undefined): void {
  if (!anyProviderConfigured()) {
    return;
  }
  const { items, value, currency, coupon } = cartValueAndCurrency(cart);
  if (!items.length) {
    return;
  }
  emit({ name: "begin_checkout", items, value, currency, coupon });
}

export function submitAddShippingInfo(
  cart: HttpTypes.StoreCart | null | undefined,
  shippingTier?: string
): void {
  if (!anyProviderConfigured()) {
    return;
  }
  const { items, value, currency, coupon } = cartValueAndCurrency(cart);
  if (!items.length) {
    return;
  }
  emit({
    name: "add_shipping_info",
    items,
    value,
    currency,
    coupon,
    shipping_tier: shippingTier ? stripPiiFromString(shippingTier) : undefined,
  });
}

export function submitAddPaymentInfo(
  cart: HttpTypes.StoreCart | null | undefined,
  paymentType?: string
): void {
  if (!anyProviderConfigured()) {
    return;
  }
  const { items, value, currency, coupon } = cartValueAndCurrency(cart);
  if (!items.length) {
    return;
  }
  emit({
    name: "add_payment_info",
    items,
    value,
    currency,
    coupon,
    payment_type: paymentType ? stripPiiFromString(paymentType) : undefined,
  });
}

export function submitPurchaseOnce(order: HttpTypes.StoreOrder): boolean {
  if (!anyProviderConfigured()) {
    return false;
  }
  const key = `purchase:${order.id}`;
  if (!oncePerKey(key)) {
    return false;
  }
  emit({
    name: "purchase",
    order: mapOrderToEcommerceOrder(order),
    transactionId: merchantTransactionId(order),
    coupon: orderCoupon(order),
  });
  return true;
}

export function paymentProviderCategory(providerId: string | null | undefined): string {
  const id = (providerId ?? "").toLowerCase();
  if (id.includes("stripe")) {
    return "card";
  }
  if (id.includes("system") || id.includes("manual")) {
    return "cod";
  }
  if (!id) {
    return "unknown";
  }
  return "other";
}

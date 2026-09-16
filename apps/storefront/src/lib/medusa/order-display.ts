import type { HttpTypes } from "@medusajs/types";
import { getPaymentProviderLabel } from "./payment-providers";

type OrderWithPayments = HttpTypes.StoreOrder & {
  payment_collections?: Array<{
    payments?: Array<{ provider_id?: string | null }> | null;
  }> | null;
};

export function getOrderShippingMethodName(order: HttpTypes.StoreOrder) {
  return order.shipping_methods?.[0]?.name ?? "—";
}

export function getOrderPaymentProviderId(order: HttpTypes.StoreOrder) {
  for (const collection of (order as OrderWithPayments).payment_collections ??
    []) {
    const payment = collection.payments?.[0];
    if (payment?.provider_id) {
      return payment.provider_id;
    }
  }

  return null;
}

export function getOrderPaymentMethodLabel(order: HttpTypes.StoreOrder) {
  const providerId = getOrderPaymentProviderId(order);
  return providerId ? getPaymentProviderLabel(providerId) : "—";
}

export function isStorePickupOrder(order: HttpTypes.StoreOrder) {
  return order.shipping_address?.address_1 === "Store pickup";
}

export function getOrderContactName(order: HttpTypes.StoreOrder) {
  const address = order.shipping_address ?? order.billing_address;
  const name = [address?.first_name, address?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return name || "—";
}

export function getOrderContactPhone(order: HttpTypes.StoreOrder) {
  return (
    order.shipping_address?.phone ??
    order.billing_address?.phone ??
    "—"
  );
}

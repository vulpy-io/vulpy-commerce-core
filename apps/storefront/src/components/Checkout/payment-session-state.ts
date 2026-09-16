/**
 * Pure state helpers for Stripe PaymentElement session lifecycle.
 *
 * Extracted so they can be unit-tested without React / Stripe SDK.
 */

type ShippingAddress = {
  first_name?: string | null;
  last_name?: string | null;
  address_1?: string | null;
  city?: string | null;
  country_code?: string | null;
  postal_code?: string | null;
};

type PaymentPrerequisitesInput = {
  shippingAddress: ShippingAddress | null | undefined;
  shippingMethodId: string;
  cartTotal: number;
};

/**
 * Returns true only when all prerequisites for initialising a Stripe
 * payment session have been satisfied:
 *   - shipping address has all required fields
 *   - a shipping method is selected
 *   - cart total is non-zero
 */
export function isPaymentPrerequisitesMet({
  shippingAddress,
  shippingMethodId,
  cartTotal,
}: PaymentPrerequisitesInput): boolean {
  if (!shippingAddress) { return false; }
  if (!shippingMethodId) { return false; }
  if (!cartTotal || cartTotal <= 0) { return false; }

  const required: Array<keyof ShippingAddress> = [
    "first_name",
    "last_name",
    "address_1",
    "city",
    "country_code",
    "postal_code",
  ];

  for (const field of required) {
    const value = shippingAddress[field];
    if (!value || (typeof value === "string" && value.trim() === "")) {
      return false;
    }
  }

  return true;
}

/**
 * Returns true when `placeOrderAction` completed without an error payload.
 * Analytics (payment_success) must only fire when this returns true.
 */
export function isPlaceOrderSuccess(
  result: { error?: string } | null | undefined
): boolean {
  if (result == null) { return true; }
  return !("error" in result);
}

type ShouldRefreshInput = {
  isStale: boolean;
  paymentSessionReady: boolean;
  hasClientSecret: boolean;
};

/**
 * Returns true when a stale payment session should trigger a refresh.
 * Only refreshes when the session was previously initialised (has a client
 * secret) — not on the initial load path.
 */
export function shouldRefreshPaymentSession({
  isStale,
  paymentSessionReady,
  hasClientSecret,
}: ShouldRefreshInput): boolean {
  return isStale && paymentSessionReady && hasClientSecret;
}

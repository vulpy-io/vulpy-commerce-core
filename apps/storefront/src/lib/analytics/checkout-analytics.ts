/**
 * Checkout-specific analytics helpers.
 *
 * Kept separate from ecommerce.ts to avoid circular imports and to
 * isolate the dedup state that lives for the duration of a page session.
 */

import { trackCustomEvent } from "./events";

// Session-scoped dedup guard — prevents payment_success firing more than
// once per orderId (e.g. both CheckoutForm and PaymentReturnPoller complete).
const firedOrders = new Set<string>();

/**
 * Fire a payment_success custom event exactly once per orderId per session.
 *
 * @param orderId     - The order identifier used as the dedup key. Pass an
 *                      empty string when the id is not yet known — events
 *                      keyed on "" are still deduplicated.
 * @param hasAnalytics - Whether the user has granted analytics consent.
 * @param trackFn     - Injectable trackCustomEvent (defaults to the real one).
 *                      Only override in tests.
 * @param label       - Analytics label (default: "stripe"). Use "stripe_return"
 *                      for the 3DS redirect / poller path.
 */
export function submitPaymentSuccessOnce(
  orderId: string,
  hasAnalytics: boolean,
  trackFn: (category: string, action: string, label: string) => void = trackCustomEvent,
  label = "stripe"
): void {
  if (!hasAnalytics || firedOrders.has(orderId)) {
    return;
  }
  firedOrders.add(orderId);
  trackFn("Checkout", "payment_success", label);
}

/** Reset dedup state — for use in tests only. */
export function resetCheckoutAnalyticsForTests(): void {
  firedOrders.clear();
}

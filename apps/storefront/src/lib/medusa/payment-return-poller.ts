/**
 * Pure payment-return polling logic.
 *
 * Dependency-injected so it can be unit-tested without network or Next.js.
 * The React hook/component wires in real implementations; tests inject mocks.
 */

export const MAX_ATTEMPTS = 6;
// Fibonacci-ish delays: ~32 seconds total
export const DELAYS = [1000, 2000, 3000, 5000, 8000, 13_000] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PollResult =
  | { outcome: "success"; orderId: string }
  | { outcome: "timeout" };

export type RedirectStatus = "poll" | "failed";

export interface PollDeps {
  /** Returns the cart ID from the httpOnly cookie — never from URL params */
  getCartId: () => Promise<string | null | undefined>;
  /** Calls sdk.store.cart.retrieve(cartId) */
  retrieveCart: (cartId: string) => Promise<{ cart: { id: string; completed_at?: string | Date | null | undefined } }>;
  /** Calls placeOrderAction — may redirect internally on success */
  placeOrder: () => Promise<
    | { status: "success"; orderId: string }
    | { status: "already_completed" }
    | { error: string; recoverable: boolean }
  >;
  /** Async sleep — injected so tests can skip real waiting */
  delay: (ms: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// parseRedirectStatus
// ---------------------------------------------------------------------------

/**
 * Maps Stripe redirect_status param to our internal signal.
 * `failed` and `canceled` → show failure UI immediately.
 * Everything else (including missing) → proceed to poll.
 */
export function parseRedirectStatus(
  status: string | null | undefined
): RedirectStatus {
  if (status === "failed" || status === "canceled") {
    return "failed";
  }
  return "poll";
}

// ---------------------------------------------------------------------------
// pollPaymentReturn
// ---------------------------------------------------------------------------

/**
 * Polls Medusa for order completion after a Stripe 3DS/APM redirect.
 *
 * Algorithm:
 *   1. Read cartId from cookie (never from URL).
 *   2. Up to MAX_ATTEMPTS times:
 *      a. Retrieve cart — if completed_at set, call placeOrder to get orderId.
 *      b. Call placeOrder directly if cart not yet completed.
 *      c. On success/already_completed → return success.
 *      d. On error → wait delay[attempt] and retry.
 *   3. After MAX_ATTEMPTS → return timeout. Never return "failed" on timeout.
 */
export async function pollPaymentReturn(deps: PollDeps): Promise<PollResult> {
  const cartId = await deps.getCartId();

  if (!cartId) {
    return { outcome: "timeout" };
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // Check if cart already completed
      const cartRes = await deps.retrieveCart(cartId);
      const cart = cartRes.cart;

      if (cart.completed_at) {
        // Cart is done — call placeOrder to get the orderId (idempotent)
        const orderResult = await deps.placeOrder();
        if ("status" in orderResult) {
          if (orderResult.status === "success") {
            return { outcome: "success", orderId: orderResult.orderId };
          }
          if (orderResult.status === "already_completed") {
            // Order already placed — return success with empty id (caller must
            // resolve the actual order id via the confirmation page redirect)
            return { outcome: "success", orderId: "" };
          }
        }
        // placeOrder errored even though cart is complete — still retry
      } else {
        // Cart not yet complete — attempt to complete it
        const orderResult = await deps.placeOrder();
        if ("status" in orderResult) {
          if (orderResult.status === "success") {
            return { outcome: "success", orderId: orderResult.orderId };
          }
          if (orderResult.status === "already_completed") {
            return { outcome: "success", orderId: "" };
          }
        }
        // Error — fall through to delay + retry
      }
    } catch (error) {
      // Re-throw Next.js redirect errors — they must propagate
      const digest = (error as { digest?: string })?.digest ?? "";
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        throw error;
      }
      // Network / retrieval error — fall through to delay + retry
    }

    // Delay before next attempt (skip delay after last attempt)
    if (attempt < MAX_ATTEMPTS - 1) {
      await deps.delay(DELAYS[attempt] ?? DELAYS.at(-1));
    }
  }

  return { outcome: "timeout" };
}

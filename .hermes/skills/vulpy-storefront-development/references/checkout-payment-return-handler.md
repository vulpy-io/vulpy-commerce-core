# Payment Return Handler — Patterns & Pitfalls

From checkout epic Task 9 (Aug 2026). Covers the `/order/payment-return` route
that handles post-3DS/APM redirects from Stripe.

## Architecture

**Server/client split:**
- `page.tsx` — Server Component, reads `redirect_status` from searchParams via `parseRedirectStatus()`
- `PaymentReturnPoller.tsx` — Client Component (`"use client"`), runs polling loop

**Pure polling logic:**
- `lib/medusa/payment-return-poller.ts` — dependency-injected, no React, fully unit-testable
- `MAX_ATTEMPTS = 6`, `DELAYS = [1000, 2000, 3000, 5000, 8000, 13_000]` (~32s total)

## Critical: NEXT_REDIRECT must NOT be swallowed

When `placeOrderAction` is called inside a try/catch polling loop, Next.js `redirect()` throws an error with `digest.startsWith("NEXT_REDIRECT")`. If this is caught and suppressed, the happy path silently falls through to the `/my-account` fallback instead of confirming the order.

**Always re-throw:**
```ts
} catch (error) {
  const digest = (error as { digest?: string })?.digest ?? ""
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
    throw error  // must propagate — this IS the redirect
  }
  // ... normal retry logic
}
```

This same pattern applies everywhere `placeOrderAction` or any Next.js server action that uses `redirect()` is called inside try/catch.

## Cart ID: cookie only, never URL

The cart ID must come from `getCartId()` (httpOnly cookie), **never** from URL params. Stripe does not send the cart ID in the return URL — it sends `payment_intent`, `payment_intent_client_secret`, and `redirect_status` only.

## Three UI states

| `redirect_status` | UI |
|---|---|
| `"failed"` or `"canceled"` | Immediate failure: "Your payment was not completed. No charge was made." + Return to checkout |
| `"succeeded"` or missing | Polling spinner: "Confirming your order..." → redirect on success |
| Timeout after MAX_ATTEMPTS | Ambiguous: "Your payment is being processed. Do not pay again." + Check email / Contact support |

**Never say "payment failed" when status is unknown.** The timeout copy must be explicitly non-committal on payment outcome.

## Success redirect

`placeOrderAction` returning `{ status: 'success', orderId }` → redirect to `/order/confirmed/${orderId}`.

`{ status: 'already_completed' }` with no orderId → fall back to `/my-account` (order will be in list). This is a documented degraded path, not a bug.

## Analytics on return path

After confirming success (before `router.push`), fire:
```ts
submitPaymentSuccessOnce(orderId, hasAnalytics)
// NOT trackCustomEvent directly — dedup guard prevents double-fire
// if CheckoutForm already fired for the non-redirect path
```

For `redirect_status === "failed"`:
```ts
// In PaymentFailureTracker (client component, useRef StrictMode guard)
trackCustomEvent("Checkout", "payment_failure", "stripe_3ds")
```

## Dedup guard for payment_success

`submitPaymentSuccessOnce` in `lib/analytics/checkout-analytics.ts` uses a module-scoped `Set<string>` to prevent firing twice (once in `CheckoutForm` for synchronous cards, once in `PaymentReturnPoller` for redirect flows):

```ts
const firedOrders = new Set<string>()
export function submitPaymentSuccessOnce(orderId: string, hasAnalytics: boolean, label = "stripe") {
  if (!hasAnalytics || firedOrders.has(orderId)) return
  firedOrders.add(orderId)
  trackCustomEvent("Checkout", "payment_success", label)
}
```

Use `"stripe_return"` as the label in the poller to distinguish return-path fires in analytics.

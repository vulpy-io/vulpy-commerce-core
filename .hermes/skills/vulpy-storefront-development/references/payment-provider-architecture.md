# Payment Provider Architecture — Vulpy Commerce

## Current state (2026-08-14)

Stripe-only integration via Medusa v2 JS SDK:
- `lib/stripe.ts` — `stripePromise` singleton (`loadStripe` called once)
- `initiatePaymentSessionAction` — creates Medusa payment session before mounting PaymentElement
- `placeOrderAction` — calls `sdk.store.cart.complete` after Stripe `confirmPayment`
- `return_url` → `/order/payment-return` (NOT `/order/confirmed`) for 3DS/APM redirects

## Planned: Hyperswitch for multi-provider (issue #140)

When PayPal, Klarna, or other providers are needed, the plan is **self-hosted Hyperswitch** (not Hyperswitch Cloud — operator preference is no-cloud).

Stack:
- `medusa-custom-payments` (npm) — Medusa backend plugin, one plugin for all providers
- `medusa-custom-payments-react` (npm: `@juspay-tech/medusa-custom-payments-react`) — unified `<HyperswitchPayment>` storefront component
- Self-hosted Hyperswitch instance (Rust service) — routes to Stripe, PayPal, Klarna etc.

Benefits over per-provider plugins:
- Single `<HyperswitchPayment>` replaces per-provider React components (no `@paypal/react-paypal-js`, no Klarna.js)
- No per-provider `confirmCardPayment` / `confirmPayment` logic variants
- 100+ processors behind one API

## Key implementation rules (Stripe path)

### Emulating Stripe outcomes via API (server-side e2e)
To test success/decline without driving the hosted card iframe (operator does the
manual card check), confirm the PaymentIntent via the Stripe API then exercise
Medusa's live `authorizePayment`/`cart.complete` path:

- Success: `POST /v1/payment_intents/{pi}/confirm` with `payment_method=pm_card_visa`
- Decline: same with `pm_card_chargeDeclined` → confirm returns 4xx, PI stays `requires_payment_method`
- Then `POST /store/carts/{cart}/complete` (publishable key header) → success returns `{type:"order", order:{id:"order_…"}}`; decline returns a cart with no order.

**`return_url` is REQUIRED on confirm when automatic payment methods are enabled.**
Medusa creates the PI with `automatic_payment_methods[enabled]=true` +
`allow_redirects=always`, so Stripe rejects confirm without a `return_url`:
`"you must provide a return_url. If you don't want to accept redirect-based
payment methods, set automatic_payment_methods[enabled] to true and
automatic_payment_methods[allow_redirects] to never"`. Always pass
`return_url` (e.g. `http://127.0.0.1:3300/order/payment-return`) in the confirm
form body. Verified 2026-08-19.

### NEXT_REDIRECT must be re-thrown
Any try/catch wrapping `placeOrderAction` or other server actions that call `redirect()` must re-throw Next.js redirect errors:

```ts
} catch (error) {
  const digest = (error as { digest?: string })?.digest ?? ""
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
    throw error  // must propagate — not an error
  }
  // handle real errors here
}
```

Failure to re-throw causes `redirect()` calls to silently fail (user sent to fallback route instead of confirmation page). This was a Task 9 blocker on the checkout epic.

### Payment return handler (`/order/payment-return`)
Stripe appends `?payment_intent=...&redirect_status=succeeded|failed|canceled` after 3DS/APM redirect. Handler pattern:
- `page.tsx` — Server Component, reads `redirect_status`; failed → immediate failure UI, no polling
- `PaymentReturnPoller.tsx` — Client Component; polls Medusa for order status with bounded backoff
- Cart ID from `getCartId()` cookie only — never from URL params
- Polling: MAX_ATTEMPTS=6, delays [1s, 2s, 3s, 5s, 8s, 13s] (~32s total)
- Timeout copy: "Your payment is being processed. Do not pay again." — never claim failure when unknown

### Analytics dedup
`payment_success` can fire from two paths (inline Stripe flow + payment-return poller). Use module-scoped Set:

```ts
// lib/analytics/checkout-analytics.ts
const firedOrders = new Set<string>()
export function submitPaymentSuccessOnce(orderId: string, hasAnalytics: boolean, label = "stripe") {
  if (!hasAnalytics || firedOrders.has(orderId)) return
  firedOrders.add(orderId)
  trackCustomEvent("Checkout", "payment_success", label)
}
```

Both `CheckoutForm.tsx` and `PaymentReturnPoller.tsx` must use this function.
`PaymentFailureTracker` (client component with `useRef` StrictMode guard) handles 3DS `redirect_status=failed`.

### State machine pattern
Replace ad-hoc `isProcessing`/`isSaving` booleans with `useReducer`:

```ts
type CheckoutState =
  | { step: 'editing' }
  | { step: 'saving_cart' }
  | { step: 'payment_ready' }
  | { step: 'confirming' }
  | { step: 'completing_order' }
  | { step: 'confirmed'; orderId: string }
  | { step: 'error'; message: string; recoverable: boolean }
```

Rules: duplicate CONFIRM/PLACE_ORDER in-flight = no-op; `recoverable: true` + RETRY → `payment_ready`; `recoverable: false` + RETRY → `editing`.

### `placeOrderAction` idempotency
Before calling `cart.complete`, check `completed_at`:
```ts
const cartCheck = await medusa.store.cart.retrieve(cartId)
if (cartCheck.cart.completed_at) {
  return { status: 'already_completed' }
}
```
Prevents double-charge on retry.

### Environment variables
| Var | Where | Notes |
|-----|-------|-------|
| `NEXT_PUBLIC_STRIPE_KEY` | `apps/storefront/.env` | Publishable key, `pk_test_` or `pk_live_` |
| `STRIPE_API_KEY` | `apps/medusa-backend/.env` | Secret key, never in storefront |
| `STRIPE_WEBHOOK_SECRET` | `deploy/.env` | Required for webhook signature verification |
| `NEXT_PUBLIC_ENABLE_PROMOTION_CODES` | `apps/storefront/.env` | Set to `false` to hide; default is enabled |

Preflight: `lib/stripe.ts` warns in dev if key doesn't start with `pk_test_` or `pk_live_`.

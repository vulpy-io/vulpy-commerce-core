# Checkout State Machine Pattern

Used in `feat/3-checkout-stripe-e2e` to replace ad-hoc `isProcessing`/`isSaving` booleans with an explicit typed state machine.

## State union type

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

## Key design rules

- `transition(state, action)` is a **pure function** — no React, no side effects, directly usable with `useReducer`
- Duplicate in-flight events are **no-ops** (idempotency): `CONFIRM` while `confirming` → no change; `PLACE_ORDER` while `completing_order` → no change
- `recoverable: true` error + `RETRY` → `payment_ready`; `recoverable: false` + `RETRY` → `editing`
- Pay button only enabled when `step === 'payment_ready'`

## File location

`apps/storefront/src/components/Checkout/checkout-state-machine.ts`
`apps/storefront/src/components/Checkout/checkout-state-machine.test.ts` (19 tests)

## `placeOrderAction` idempotency guard

Before calling `cart.complete`, check `completed_at`:
```ts
const cartCheck = await medusa.store.cart.retrieve(cartId)
if (cartCheck.cart.completed_at) {
  return { status: 'already_completed' }
}
```
Prevents double-charges on duplicate submissions.

## `PlaceOrderResult` discriminated union

```ts
type PlaceOrderResult =
  | { status: 'success'; orderId: string }
  | { status: 'already_completed' }
  | { error: string; recoverable: boolean }
```

## Payment return poller (3DS/APM flows)

Pure dependency-injected polling logic in `lib/medusa/payment-return-poller.ts`:
- MAX_ATTEMPTS=6, DELAYS=[1000,2000,3000,5000,8000,13000] (~32s total)
- Cart ID from cookie only (`getCartId()`) — never from URL params
- `NEXT_REDIRECT` errors must be re-thrown in catch blocks (don't swallow)
- Timeout copy must never claim "payment failed" when status is unknown
- `payment_success` analytics: deduplicated via `submitPaymentSuccessOnce(orderId)` — fires in either `CheckoutForm` (sync card) or `PaymentReturnPoller` (3DS redirect), not both

## `return_url` for `confirmPayment`

Point to `/order/payment-return`, NOT `/order/confirmed`:
```ts
return_url: `${window.location.origin}/order/payment-return`
```
`/order/confirmed` is a display page, not a redirect handler. 3DS/APM flows that redirect would land on a 404.

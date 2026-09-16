# Checkout Form UX Patterns (Vulpy storefront)

Verified 2026-08-19 on `apps/storefront/src/components/Checkout/` while fixing
operator feedback for the checkout epic. These are the current contracts — check
the code before changing any of them.

## Desktop column layout (operator requirement)

Two-column layout in `CheckoutForm.tsx` (`checkoutContent`):

- **Left column** (`w-full lg:max-w-[670px]`): sign-in panel (when enabled),
  `ShippingInformationStep` (contact + shipping address), `Billing`.
- **Right column** (`w-full max-w-[455px]`): `CheckoutOrderSummary` (totals) →
  `Coupon` → `DeliveryMethodStep` → `PaymentInformationStep` → pay button.

Operator requirement verbatim: "coupon, delivery and payment method should be in
right column under totals on desktop." On mobile the two columns collapse via
`flex-col` so order is: shipping, billing, totals, coupon, delivery, payment,
button — acceptable.

All three moved components (`Coupon`, `DeliveryMethodStep`,
`PaymentInformationStep`) carry `mt-7.5` root classes, so they stack cleanly in
the right column without extra spacing wrappers.

## Email is REQUIRED

`ShippingInformationStep` email field is always required:

```tsx
<label htmlFor="email">Email <span className="text-status-danger">*</span></label>
<input id="email" required type="email" ... />
```

Previously it was conditional (`required` only when creating an account) and
showed "(optional)" otherwise — operator rejected that. Do not reintroduce
optional email. The server action already handles email correctly:
`setCheckoutAddressesAction` falls back to the logged-in customer's email when
the form email is blank.

## US state dropdown (50 states + DC)

New module `apps/storefront/src/components/Checkout/us-states.ts` exports
`isUsCountry(countryCode)` and `US_STATES` (array of `{ value, label }`, 50
states + District of Columbia).

Behavior in BOTH `ShippingInformationStep` and `Billing.tsx`:
- When `isUsCountry(form.country_code)` → `<select id="province" required>` with
  a placeholder `"Select a state"` option + `US_STATES` options. The select uses
  the country-select styling (`appearance-none rounded-md ... pr-9 pl-5`) but
  NOTE: it has no chevron span — matches the operator's accepted state.
- Otherwise → free-text `<input>` with placeholder "State / Province".
- Label switches: US → "State" (+ asterisk), non-US → "State / Province".

Values are state **labels** (e.g. "Delaware"), which is what the operator's test
data used. Keep label-as-value unless Medusa validation changes.

## Auto-init Stripe session + inline PaymentElement (2026-08-19)

Operator feedback: clicking Pay scrolled to the first name field and then
inserted the Stripe methods block — it should load initially and live inside the
card payment box. Two changes:

**Auto-init in `CheckoutForm.tsx`:** a `useEffect` calls `initiateStripeSession`
once prerequisites are met (Stripe selected, cart id, shipping method, non-zero
total, required address fields), instead of waiting for the Pay click. Guard
against duplicate/in-flight calls and per-keystroke spam with:
- a debounce (`window.setTimeout(..., 300)`, cleared on cleanup),
- a key/in-flight ref (`paymentSessionInitRef` holding `{ key, promise }` where
  `key` joins cart id + payment + shipping + total + address primitives),
- skip when `paymentSessionReady` or `paymentSessionStale`.
The Pay button enables once the session is ready, so no native form-validation
scroll-to-first-name on submit.

**Inline `PaymentElement` in `CheckoutSteps.tsx`:** render `<PaymentElement />`
inside the selected Stripe provider's card box (`isSelected && provider.id.includes("stripe") && paymentSessionReady`),
as a nested `mt-4 rounded-md border border-gray-3 bg-white p-4` panel, keeping
the provider icons. The standalone `{isStripe && paymentSessionReady}` block
below all providers was removed. COD unaffected. `PaymentElement` must stay
under the `<Elements>` context (both gated on `paymentSessionReady && clientSecret`).

## New checkout form fields must surface on EVERY order-display surface

When a field is added to the checkout form (e.g. `company`), it is saved to the
Medusa order address automatically (`buildContactShippingAddress` maps it), but
it is NOT automatically shown anywhere. Check and add it to every place an order
address renders:

- `apps/storefront/src/components/Orders/OrderConfirmedView.tsx` — `OrderShippingAddress`
- `apps/storefront/src/components/Orders/OrderDetails.tsx` (My Account order details)
- `packages/medusa-plugin-email/src/modules/email/emails/components/customer-information.tsx` — `formatAddress` already includes `address.company`

Pattern: render `{shippingAddress.company ? <p className="text-content-muted">{shippingAddress.company}</p> : null}`
right after the contact name, only when present. The email template already
handles company (it was the storefront display that lagged).

## Silent payment-session failure — must surface errors

Original bug (HAR evidence): clicking Pay fired 3 server actions —
`setCheckoutAddressesAction` (200), `setShippingMethodAction` (200),
`initiatePaymentSessionAction` (200 with a ~169-byte error payload vs ~8KB
success) — and the UI did NOTHING. Root cause: `initiateStripeSession` in
`CheckoutForm.tsx` swallowed error results (`status: "error"`) and
`handleProcessCheckout` had a bare `return` after the session-init call.

Fixed contract:
- `initiateStripeSession` returns `Promise<boolean>` — `true` on success
  (client secret set), `false` on failure.
- `handleProcessCheckout`:
  ```ts
  if (!paymentSessionReady) {
    const sessionReady = await initiateStripeSession();
    if (!sessionReady) {
      dispatchCheckout("CONFIRM_ERROR", {
        message: "Payment session could not be initiated. Please try again.",
        recoverable: true,
      });
      return;
    }
  }
  ```
- The `initiatePaymentSessionAction` server action already returns
  `{ status: "error", error: string }` with a real message (Stripe-not-enabled
  detection included) — the client must read and toast it, not ignore it.
- `StripePayButton.onRefresh` prop is `() => Promise<unknown>` so it accepts
  the boolean-returning `initiateStripeSession`.

Rule: ANY checkout mutation action that can fail must either toast the error or
dispatch a state-machine error event (or both). A bare `return` after a failed
server action is a bug — the operator tests payment failure paths deliberately
("test the payments — both successful and failed, discount codes etc").

## State machine

`checkout-state-machine.ts` (pure reducer, unit-tested) drives steps
editing → saving_cart → confirming → payment_ready → completing_order with
error events (`CONFIRM_ERROR`, `ORDER_ERROR`) that keep the form retryable.
Load `references/checkout-state-machine.md` for the full transition table.

## Tests

`CheckoutSteps.test.tsx`, `Billing.test.tsx`, `checkout-form-data.test.ts`,
`checkout-state-machine.test.ts`, `payment-session-state.test.ts` cover these
patterns. When changing form behavior, extend those — they run without React
DOM/Stripe (pure functions + light component tests).

## Dev-verification gotchas for checkout work

- `host.docker.internal:3000` serves from `/app/workspace` (bind mount) — the
  dev server compiles from the shared checkout, NOT from worktrees.
- To confirm a checkout fix is actually SERVED after HMR: fetch the route HTML,
  find the `apps_storefront_src_*` chunk, grep it for a distinctive new string
  (e.g. `US_STATES`, "District of Columbia").
- The full Playwright e2e harness needs its own Docker stack — it cannot run
  from the Fox container (no docker socket). Manual structural probes + unit
  tests are the container-viable verification; see
  verification-before-completion for the served-chunk technique.

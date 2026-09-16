# Critical Checkout Delivery: Real-Stack E2E First

Use this reference for material checkout, payment, promotion, shipping, address, or order-completion work. Checkout is a money-moving system, not merely a form-design task.

## Required sequence

1. Start the actual storefront, commerce backend, database, and payment provider in test mode.
2. Seed deterministic, idempotent fixtures: an in-stock product, shipping options, and an eligible promotion.
3. Write the failing Playwright acceptance path before production code.
4. Confirm it fails on missing behavior rather than broken setup.
5. Add focused unit/action tests for state transitions and backend error mapping.
6. Implement the smallest behavior that turns the browser test green.
7. Gate protected branches/deployments on the real provider test. Mock-only checkout E2E is insufficient.

Use a disposable test database or isolated Compose project; never wipe normal development data. Capture sanitized traces on failure. Never put keys, client secrets, cookies, addresses, email, phone, or card data into logs or artifacts.

## Minimum automated matrix

- Required shipping address and validation.
- Billing equals shipping by default; independent billing fields when requested.
- Valid promotion apply/remove, invalid-code recovery, and authoritative totals.
- Successful card payment creates exactly one order.
- Decline then retry preserves form state.
- 3DS/SCA or provider redirect completes correctly.
- Refresh/re-entry during payment return converges safely.
- Double-submit protection and idempotent completion.
- Out-of-stock change before payment blocks checkout.
- Desktop/mobile semantic, visual, and keyboard order.
- Analytics consent/no-consent, with no PII.

For responsive assertions, verify DOM/focus order and bounding boxes at breakpoints. Screenshots alone are not assertions.

## Payment-session and total integrity

The commerce backend is authoritative for promotions, discounts, shipping, tax, and totals. Prefer this order:

1. Validate and save addresses.
2. Select/apply shipping.
3. Apply/remove promotions and receive the refreshed cart.
4. Initialize or refresh the payment session.
5. Render provider UI from that session.
6. Confirm payment.
7. Idempotently complete the cart/order.

Any total-changing mutation after session initialization can stale the provider amount. Mark the session stale and refresh it before enabling the final pay action. E2E must assert displayed total, backend order total, and provider intent amount agree. Never calculate discounts client-side.

## Stripe and redirect providers

- The browser receives only the publishable key and payment-session client secret. Secret and webhook keys remain backend-only.
- Add a secret-safe preflight that checks configuration and matching `test`/`live` modes without printing values.
- Prefer the unified Payment Element backed by the backend-created session. Do not create a second independent PaymentIntent in the storefront.
- Use explicit states such as `editing → saving_cart → payment_ready → confirming → action_required/redirecting → completing_order → confirmed`, with recoverable and blocked branches.
- The payment-return route must not trust an arbitrary cart ID. Use a same-site cart cookie or signed, short-lived return token.
- Return handling needs bounded polling/retry, refresh safety, and idempotent completion. Do not encourage another payment while status is unknown.
- Clear the cart identifier only after order creation is proven.

## Address and responsive layout rules

- Collect shipping first. Default billing to shipping; reveal an independent billing form only when requested.
- Stripe billing details must come from the selected billing address, not blindly from shipping.
- Countries must come from the active commerce region.
- When mobile and desktop need different visual order, keep one set of controls. Use mobile reading/focus order in the DOM and desktop grid placement for visual reordering.
- Ensure the final pay button is the final checkout control in every layout.

## Epic planning and ticket triage

Before expanding an existing checkout epic:

1. Read the epic and every linked defect.
2. Reconcile acceptance criteria with the actual code and current provider documentation.
3. Separate release-critical correctness (payment, address, totals, return, inventory, tests) from adjacent performance or account-management work.
4. Consolidate duplicate defects and name one canonical ticket.
5. Define executable E2E exit criteria before slicing implementation tickets.
6. Do not mutate tickets until the operator approves the rewrite.

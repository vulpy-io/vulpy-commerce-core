# Checkout payment/coupon e2e — gap checklist before running

Verified 2026-08-19 during the checkout epic. Operator asked for full e2e
(payment success + declined, coupon success + declined) and the lesson was:
**inventory the stack BEFORE running the harness** — the user explicitly said
"let's first investigate what's missing from your stack, knowledge or anything
else" after several wasted turns of harness fiddling.

## Pre-flight inventory (do all of these first)

1. **Validate the Stripe secret key from the REAL env file** — not from
   session history (keys are redacted everywhere in transcripts and env dumps).
   `curl https://api.stripe.com/v1/balance -u "$(grep '^STRIPE_API_KEY=' apps/medusa-backend/.env | cut -d= -f2-):"`
   — a valid key returns `{"object":"balance",...}`; an invalid key returns
   `Invalid API Key provided`. A key rebuilt from memory can be the WRONG key
   (this session: the publishable key had been copied into the secret slot —
   `pk_test_...` where `sk_test_...` belongs — and Stripe rejected it).
2. **The publishable key** `pk_test_...` goes in `apps/storefront/.env`
   (`NEXT_PUBLIC_STRIPE_KEY`). Both must be a matched pair from the same
   Stripe account and the same mode (test vs live).
3. **Fixture product exists in the dev DB** — probe the store API:
   `curl "http://host.docker.internal:9000/store/products?handle=checkout-e2e-product" -H "x-publishable-api-key: $KEY"`
   (the `checkout-e2e-product` fixture is created by
   `apps/medusa-backend/src/scripts/seed-checkout-e2e.ts`).
4. **Use a disposable promotion lifecycle for coupon tests** — the stock seed
   creates NO promotions and must stay that way. Create a uniquely named code
   (e.g. `E2E10`) with a test-only `medusa exec` helper before the suite and
   delete it in `afterAll`/`finally`; verify deletion independently. Do not
   depend on admin credentials or add the code to `seed-checkout-e2e.ts` —
   operators forget to remove seeded coupons and manual checkout totals become
   misleading. The helper must detect its explicit `create`/`delete` mode even
   when `medusa exec` prefixes CLI arguments.
5. **HMR proxy alive** — Playwright targets `http://127.0.0.1:3300`; the
   Host+Origin rewrite proxy (see `playwright-dev-stack-e2e.md`) must be
   running. `curl -s -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:3300/health`
   — `000` means the proxy died.
6. **Coupon feature flag** — `NEXT_PUBLIC_ENABLE_PROMOTION_CODES` unset means
   coupons are ENABLED (the gate is `!== "false"`); `Coupon.tsx` renders when
   unset. Do not assume a missing flag hides the coupon UI.

## What the existing e2e specs cover vs. what must be added

Existing `e2e/checkout/` specs (worktree root, NOT under apps/storefront):

| Spec | Covers |
|---|---|
| `structural.spec.ts` | DOM contracts, desktop left-of-right layout, mobile no-overflow, keyboard |
| `smoke.spec.ts` | seeded cart reaches checkout |
| `keyboard.spec.ts` | keyboard activation of shipping/payment/submit |
| `stripe.spec.ts` | ONLY checks the Stripe hosted iframe appears — it does NOT fill a card or assert success/declined |

To test actual payments you must EXTEND `stripe.spec.ts` (or add specs) to:
- fill the Stripe iframe (`iframe[name^="__privateStripeFrame"]`) with test cards:
  success `4242 4242 4242 4242` (any future expiry, any CVC), declined
  `4000 0000 0000 0002`
- assert the success path reaches the order-confirmed route / order state
- assert the declined path shows an error toast / CONFIRM_ERROR and stays retryable
- add `coupon.spec.ts` for valid-code success (discount appears in totals) and
  bogus-code failure (inline error)

## Checkout flow call sequence (from HAR, 2026-08-19)

On "Pay now", the storefront fires three server actions in sequence:

1. `setCheckoutAddressesAction` (saves email + shipping/billing) → 200
2. `setShippingMethodAction` → 200
3. `initiatePaymentSessionAction` → 200 but error-shaped if prerequisites fail


## Emulated outcome coverage (without pretending to test the iframe)

The operator may perform the final card entry manually, while automation still
verifies backend outcomes efficiently:

- Let the UI create the real Medusa Stripe PaymentIntent and expose its client
  secret.
- Confirm that PaymentIntent through Stripe test mode with a `return_url` (the
  API rejects confirmation without one when redirect-capable methods are
  enabled).
- For success, call the real Medusa cart-complete path and assert an `order`.
- For decline, use Stripe's declining test payment method, assert confirmation
  fails, complete the cart, and assert no order is returned.
- PaymentElement can render multiple `__privateStripeFrame` iframes. Assert
  the first hosted frame is visible; do not require an exact iframe count.
- Required checkout controls are native browser validation gates. When a new
  field becomes required (notably the US state select), update every e2e
  fixture to fill/select it or the browser will stop the form before any
  server action, falsely suggesting payment initialization is broken.

## Strict-mode locator collisions in the new checkout (2026-08-19)

After the layout/UX changes, several `getByRole`/`getByLabel` locators resolve
to multiple elements in the full dev catalog. Hardened fixtures use:

- **Stripe payment radio** — the provider radio's accessible name is
  `"Card payment"` (plus the 5 `Payment method` icon alts), NOT `"stripe"`.
  Use `/card payment|stripe|credit card/i` for `STRIPE` / `STRIPE_PAYMENT_RADIO`
  in `structural.spec.ts`, `keyboard.spec.ts`, and `stripe.spec.ts`.
- **Email** — the checkout login panel field is also labeled "Email" (after the
  "Username or email" → "Email" rename), so a bare `/^email/i` matches two
  fields. Scope by id: `const EMAIL = "#email"` and `page.locator(EMAIL).fill(...)`
  (the login panel field is `id="checkout-email"`).
- **State** — the US state is now a `<select id="province">`; select it with
  `page.locator("#province").selectOption({ label: "California" })` in
  `fillRequiredCheckoutDetails`, or the browser blocks submit.
- **Cart badge** — hoist the `/^1\s*Cart/i` regex to a top-level constant
  (Biome `useTopLevelRegex` fires otherwise).

Biome also flags one-line `if (!x) throw` as `useBlockStatements` and
`async function` returning a promise directly as `useAwait` — write helpers
with block bodies and non-async returns to keep the e2e files lint-clean.


# Payment Provider Architecture for Medusa Storefronts

## The multi-provider problem

Each payment provider requires a completely different storefront SDK:
- Stripe → `<CardElement>` / `<PaymentElement>` inside `<Elements>` provider
- PayPal → `<PayPalButtons>` from `@paypal/react-paypal-js`
- Klarna → Klarna.js widget loaded via `<script>` tag

Without a unified approach, adding PayPal + Klarna means maintaining 3 separate
checkout UI branches, each with its own SDK lifecycle, error handling, and test coverage.

## The unified approach: Juspay Hyperswitch

**npm packages:**
- `@juspay-tech/medusa-custom-payments` — Medusa v2 backend payment provider
- `@juspay-tech/medusa-custom-payments-react` — Storefront React components

**How it works:**
- Backend plugin registers as a single Medusa payment provider covering all configured processors
- React package provides a unified `<HyperswitchPayment>` component that renders the correct
  UI for whichever provider the user selects (Stripe, PayPal, Klarna, etc.)
- Operators configure which processors to enable; storefront code is unchanged when adding new ones

**References:**
- Medusa integrations page: https://medusajs.com/integrations/@juspay-techmedusa-custom-payments
- Hyperswitch blog post: https://hyperswitch.io/blog/add-multiple-payment-providers-to-medusa-v2-with-medusa-custom-payments-plugin
- GitHub (prism/unified): https://github.com/juspay/hyperswitch-prism
- Medusa discussion: https://github.com/medusajs/medusa/discussions/15785
- npm storefront package: https://www.npmjs.com/package/@juspay-tech/medusa-custom-payments-react

## Decision guide

| Scenario | Approach |
|---|---|
| Stripe only, no expansion plans | Direct Stripe plugin (simpler, no extra service) |
| Stripe + 1-2 more, self-contained | Own plugins per provider + per-provider storefront components (manageable) |
| 3+ providers or "probably more" | Hyperswitch — unified SDK worth the extra service |

## Self-hosted vs cloud

Hyperswitch can be self-hosted (Rust service) or used via Hyperswitch Cloud.
For a single-tenant Vulpy install: Hyperswitch Cloud is simpler (no extra container).
For multi-tenant or data-sovereignty requirements: self-host alongside the shop stack.

## Stripe keys source of truth (Vulpy Commerce)

Two separate keys — different purposes:

| Key | Who uses it | Where set (dev) | Where set (prod) |
|---|---|---|---|
| `STRIPE_API_KEY` | Medusa backend (server-side, creates payment intents) | `apps/medusa-backend/.env` | `deploy/.env` |
| `NEXT_PUBLIC_STRIPE_KEY` | Storefront (client-side, loads Stripe.js) | `apps/storefront/.env` | `deploy/.env` |

`STRIPE_API_KEY` = secret key (`sk_test_…`/`sk_live_…`). Never to browser.  
`NEXT_PUBLIC_STRIPE_KEY` = publishable key (`pk_test_…`/`pk_live_…`). Safe public.

They are a matched pair from the same Stripe account/mode. Mismatched modes
(e.g. `sk_live_…` + `pk_test_…`) cause auth failures at payment confirmation time.

**Prod source of truth:** `deploy/.env` — `generate-deploy-env.sh` reads `STRIPE_API_KEY`
from there and injects into the Medusa container. `NEXT_PUBLIC_STRIPE_KEY` is in
`deploy/.env` and baked into storefront image at build time.

## Planned improvement: Infisical secrets management

Issue #139 tracks self-hosted Infisical as the secrets backend to eliminate manual
.env file editing. When implemented: bootstrap wizard collects keys → writes to Infisical,
app processes start with `infisical run --` prefix, Fox gets a machine identity token
for autonomous key management.

# Vulpy Payment Architecture Decisions

## Current state (as of 2026-08-14)

Stripe-only, direct integration via `@stripe/stripe-js` + Medusa payment provider.

## Filed issues

- **#139** — self-hosted Infisical for secrets management (no file editing for operators)
- **#140** — self-hosted Hyperswitch for multi-provider payments (PayPal, Klarna, etc.)

## Hyperswitch (Issue #140)

**What it is:** Open-source payments orchestration (Rust, self-hosted). Two packages:
- `@juspay-tech/medusa-custom-payments` — Medusa v2 backend, one plugin for all processors
- `@juspay-tech/medusa-custom-payments-react` — unified React checkout component (handles Stripe/PayPal/Klarna/Google Pay UI internally)

**Why it matters for Vulpy:**
- Eliminates per-provider storefront components (`<CardElement>`, `@paypal/react-paypal-js`, Klarna.js)
- One `<HyperswitchPayment>` component replaces all provider-specific confirm logic
- Self-hosted only — no Hyperswitch Cloud (user requirement: no cloud)
- 100+ processors via single Medusa plugin

**Migration path:** current Stripe integration → Hyperswitch Stripe connector (no parallel path). Depends on #139 (Infisical) for key management.

## Infisical (Issue #139)

**What it is:** Open-source secrets vault (self-hosted). Eliminates operator file editing.

**Integration pattern:**
- New Docker Compose profile `--profile infisical`
- Bootstrap wizard writes keys to Infisical, not `.env` files
- Apps start via `infisical run --` prefix
- Fox gets machine identity token for autonomous key management
- Migration path: import existing `.env` values on first run

## Stripe key model (current)

| Key | Holder | File |
|---|---|---|
| `STRIPE_API_KEY` (secret `sk_…`) | Medusa backend only | `apps/medusa-backend/.env` / `deploy/.env` |
| `NEXT_PUBLIC_STRIPE_KEY` (publishable `pk_…`) | Storefront (build-time) | `apps/storefront/.env` / `deploy/.env` |
| `STRIPE_WEBHOOK_SECRET` | Medusa backend only | same as above |

**Both keys come from the same Stripe account/mode** — mismatching test/live causes auth failures at `confirmPayment`.

**Source of truth in prod:** `deploy/.env` — injected into Medusa container; publishable key baked into storefront at build time.

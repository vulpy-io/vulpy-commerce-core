---
version: 1
slug: "route-products"
primary_target: "route:/products/*"
related_targets: ["route:/checkout*","route:/cart*","route:/shop*","route:/my-account*","route:/orders*","route:/signin*","route:/signup*"]
---

# Commerce-core surface brief

## Scope
`/products/*` (primary), plus related: `/checkout*`, `/cart*`, `/shop*`,
`/my-account*`, `/orders*`, `/signin*`, `/signup*`.

## Visitor mode
Operate — a shopper is completing a task (buy, manage cart, sign in,
track order). Speed, clarity and trust beat decoration.

## Audience / job / action
Shopper mid-funnel or managing their account; store operator managing the
shop. Job: complete the purchase or find order state. Action: add to cart,
check out, sign in.

## Proof / content
Product truth, real availability, prices in major units (never divide by
100), trust signals, order status, error states. Structure is
conversion-tested: funnel order, trust signals, thumb-friendly touch
targets — do not reorder or restructure casually.

## Constraints
- **Token-only by default**: color, radius, font changes via the registry
  (`store.tokens.json` + `generate-design.mjs`). No structural/layout
  changes without explicit operator override + documented risk (surface
  guard: `surface-contracts.mjs`).
- B2B price gating when `REQUIRE_LOGIN_FOR_PRICES` is enabled.
- Analytics: funnel events consent-gated; no PII.
- Structural changes, when explicitly approved, still preserve product
  truth, content, function, and constraints.

## Chosen direction
Brand default: Fox warm tokens (cream canvas, charcoal text, Fox orange
CTA, 5px controls / 10px panels).

## Unresolved decisions
- None open. Override requests get the warn-once + documented-risk path.

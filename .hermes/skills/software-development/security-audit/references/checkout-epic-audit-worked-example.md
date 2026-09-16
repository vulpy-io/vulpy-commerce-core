# Worked example: Checkout epic audit (Medusa/Next.js/Stripe ecommerce)

## Branch
`feat/3-checkout-stripe-e2e` — 83 files, +6330/−396, 12 commits.
Worktree: `/data/state/worktrees/vulpy-checkout-3`

## Key differences from the billing-bridge audit pattern
- **Medusa backend + Next.js storefront** (not a standalone Fastify service)
- **Stripe webhook is opaque** — handled by Medusa's `@medusajs/medusa/payment-stripe` plugin (not in the diff). Flag as medium: "verify STRIPE_WEBHOOK_SECRET at deploy time"
- **Framework CSRF** — Next.js Server Actions have built-in protection. No custom CSRF tokens needed.
- **Payment redirect/polling** — client-side poller with hard upper bound, cookie-based cart ID, never claims "failed" on timeout
- **E2E test infra** — Playwright config must disable trace/screenshot/video to avoid leaking checkout secrets

## Signals found in this audit
1. **Critical direct dep**: `swiper` (prototype pollution) — reachable in checkout path, must be upgraded
2. **Deep transitive criticals**: `fast-xml-parser`, `@mikro-orm/core`, `protobufjs` — through Medusa/AWS SDK, not directly reachable
3. **82 high transitive advisories** — mostly Payload CMS tree, not reachable from checkout
4. **Analytics PII sanitization**: `stripPiiFromString`, `pseudonymizeOrderId`, `hashAnalyticsUserId`, `sanitizeSearchParams` — all present
5. **Consent gating**: `analytics: false` by default, GPC override, `useRef` guards against double-fire
6. **Cookie security**: all cart/auth cookies set with `httpOnly: true`, `sameSite: "lax"`, `secure: true` (production)
7. **Preflight contract**: refuses live keys, redacts credentials from logs, tests key mode matching

## Report format used
```
## Verdict: PASS-WITH-FIXES
### Critical / High / Medium / Low
- file:line — issue — suggested fix
### Non-issues checked
- (what you checked and found safe, so operator sees coverage)
```
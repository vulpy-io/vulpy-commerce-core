## What does this PR do?

<!-- One sentence. Link the issue: Closes #NNN -->

## Checklist

### Code quality
- [ ] `pnpm check` passes (Biome/Ultracite lint)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes — no skipped tests without a comment
- [ ] No hardcoded strings that belong in config/env (`MEDUSA_PUBLISHABLE_KEY`, `DATABASE_URL`, secrets, ports, URLs)
- [ ] No `console.log` / debug residue left in production paths
- [ ] No `TODO`/`FIXME` added without a linked issue

### Data & commerce rules
- [ ] Prices are in **major units** — no division by 100 (use `fromMedusaAmount()`)
- [ ] Cart mutations use `applyCartResult(..., { mutation, source })` — not direct state writes
- [ ] New products/cart/checkout flows pass `region_id` to Medusa product list calls
- [ ] Line items use **variant** IDs (`variant_…`), not product IDs (`prod_…`)

### Analytics (if storefront UX changed)
- [ ] New funnel/engagement UX is instrumented with Matomo (`trackCustomEvent` / cart helpers)
- [ ] Analytics calls are gated by `useHasAnalyticsConsent()` (or use `pushMatomoCommand` which no-ops without consent)
- [ ] No PII in analytics payloads — no email, name, address, raw order/customer ID, JWT
- [ ] Purchases fire only from `PurchaseTracker` + `submitPurchaseOnce` on order-confirmation (not payment-return polling)

### Security
- [ ] No new `fetch()` / HTTP calls without host validation (SSRF risk — validate destination before calling)
- [ ] No new env vars committed into `.env` files (use `.env.template` / `.env.example`)
- [ ] Auth-gated routes remain gated — no accidental public exposure

### New Medusa modules / backend changes
- [ ] Migration generated and reviewed (`pnpm db:generate <name>`)
- [ ] Seed script is idempotent — second run logs skips and exits 0
- [ ] Workflows used for mutations, not raw route handlers

### New Payload CMS fields / collections
- [ ] Migration written as `.js` (not `.ts`) for production compatibility
- [ ] `payload-types.ts` regenerated (`pnpm --filter @apps/storefront generate`)
- [ ] `src/admin/i18n/index.ts` has a `default export` if touched (gotcha §10)

### Tests
- [ ] New logic has unit tests (especially: money math, mappers, analytics sanitizers, shop filters)
- [ ] `pnpm --filter @apps/storefront test:coverage` passes without lowering thresholds
- [ ] Seed scripts tested with a second run

### Docs
- [ ] `AGENTS.md` updated if architecture, a new module, or a new gotcha was introduced
- [ ] PR description is enough context for a reviewer who wasn't in the thread

---

## How to test

<!-- Exact commands or scenario steps for the reviewer. -->

## Screenshots / recordings (UI changes)

<!-- Attach before/after screenshots or a short screen recording. -->

# Billing-bridge security review — fix batch playbook (2026-08-17)

How a 22-finding review batch (5 High / 6 Medium / 11 Low) on the billing
bridge (`cloud/llm-gateway/services/billing-bridge`, branch
`feat/billing-bridge`) was implemented, commit by commit. Reuse the shape
when handed a fix-batch brief for a webhook/billing service.

## Workflow that worked

1. Read the fix brief FIRST (`.hermes/tasks/fix-*.md`) — it names files,
   lines, and the preferred fix per finding. Follow it exactly; when a
   brief's "prefer" option conflicts with an existing test's assertion, the
   brief wins and the test is updated to the new contract (and the change
   documented in the commit + report).
2. Baseline: `npm run check` (50 tests) + `npm audit` (2 high) before any
   edit — proves the starting state.
3. One commit per logical fix (14 commits), each green (`npm run check`)
   and each with NEW tests for the fix. Order: deps first (audit gate),
   then Highs, then Mediums, then Lows batched sensibly.
4. Full verification at the end: `npm run check` (83 tests, 9 files),
   `npm audit` (0 vulnerabilities), commit SHA list, files-changed list,
   notes on findings you disagreed with or where the SDK didn't match the
   brief's assumption.

## The findings and their fixes (condensed)

| # | Finding | Fix |
|---|---|---|
| H1 | Key budget frozen at first purchase (key created with `max_budget`, never updated; only team budget refreshed) | `key_id` column on customers; `updateKeyBudget` (PATCH /key/update, `key_id` or plaintext `key` for legacy rows); called wherever `updateTeamBudget` is called (webhook top-up + metering sync) |
| H2 | Crash window: Stripe session created before topups INSERT → paid but never credited | Insert topup row (status pending, `pending-<uuid>` placeholder id) BEFORE `checkout.sessions.create`; update real id after; mark `failed` on creation error. Unknown completed session → throw (500) so Stripe retries |
| H3 | Reveal-once wipes key_value → webhook mints a SECOND key on next top-up | `key_provisioned` column (backfilled `=1 WHERE key_value IS NOT NULL`); `/key/generate` only when `key_provisioned = 0`; key created once, wiped on reveal, never recreated |
| H4 | Stored XSS in portal usage table (`r.model` into innerHTML) | Build rows with `createElement`/`textContent` only; CSP meta (`default-src 'self'; script-src 'unsafe-inline'` — nonces impractical with inline scripts) + `referrer no-referrer` meta on all pages |
| H5 | Vulnerable deps (nodemailer 8.0.11 GHSA-p6gq-j5cr-w38f; postmark transport unused) | nodemailer ^9.0.5; delete nodemailer-postmark-transport; audit → 0 |
| M6 | Credits granted without verifying payment | Gate on `payment_status === "paid"` (log-and-skip 200 otherwise); `async_payment_succeeded` credits, `async_payment_failed` reverses once (status-guarded) |
| M7 | Magic-link tokens in pino request logs | Custom `serializers.req` stripping `token=` + sensitive params; `Referrer-Policy: no-referrer` header on all responses; test captures pino via injected stream |
| M8 | Unauthenticated, unrate-limited /api/checkout | Second `RateLimiter` keyed on `req.ip` (10/hr) on checkout + auth/request; `TRUST_PROXY` env gates Fastify `trustProxy`; compose passthrough |
| M9 | Timing-unsafe admin bearer compare | `verifyAdminBearer`: sha256 both sides + `timingSafeEqual` |
| M10 | Reveal-once endpoint racy | Read + guarded `UPDATE ... WHERE key_value IS NOT NULL` in one sync transaction (SQLite RETURNING returns POST-update values — unusable here) |
| L11 | Logout didn't delete session row | `DELETE FROM sessions WHERE token_hash = ?` before clearing cookie |
| L12 | SQLite file perms | `chmodSync(path, 0o600)` after open (non-`:memory:`) |
| L13 | Stripe API version not pinned | `new Stripe(key, { apiVersion: Stripe.API_VERSION })` (`LATEST_API_VERSION` doesn't exist in stripe@22) |
| L14 | No LiteLLM HTTP timeout | `AbortSignal.timeout(10_000)` on fetches (injectable `timeoutMs` for tests) |
| L15 | Metering unbounded scan | Cap window at `now - 7d` + keyset pagination `LIMIT 5000` cursor loop (pageSize injectable) |
| L16 | Constant-time compare on webhook? | No change — Stripe SDK already verifies signatures |
| L17 | Dockerfile HEALTHCHECK | Mirror compose healthcheck (`node -e fetch /healthz` — no curl in node:alpine) |
| L18 | No .dockerignore | node_modules/, dist/, coverage/, *.log, .env, .git |
| L19 | creditsForSpend overflow → Infinity | Clamp non-finite results to 0 |
| L20 | Welcome email at-least-once gap | Set `welcome_sent = 1` BEFORE send; failed send → log, portal reveal covers |
| L21 | Provisioning race on concurrent deliveries | Per-customer `Map<number, Promise>` mutex (`prev.then(fn, fn)`) around credit+provision |

## Tests whose assertions changed (brief wins over old contract)

- `POST /api/checkout` Stripe-down test: was "stores nothing" (topups count
  0) → now asserts one row with status `failed` + `pending-` placeholder id.
- Unknown completed session webhook test: was 200 + no credit → now 500
  (money anomaly must retry).
- `checkoutCompletedPayload` fixture gained `payment_status: "paid"` default
  (so existing tests still credit under the new gate).

## SDK/library facts learned (verified against installed versions)

- stripe@22: no `Stripe.LATEST_API_VERSION`; use `Stripe.API_VERSION`
  (`"2026-07-29.dahlia"`-style); `client.getApiField("version")` returns the
  effective pin. Webhook fixture `api_version` string is not validated by
  `generateTestHeaderString`.
- Fastify v5 default req serializer shape is
  `{method, url, host, remoteAddress, remotePort}` from the FastifyRequest —
  override `serializers.req` with the same shape.
- better-sqlite3 `UPDATE ... RETURNING` → post-update row (old value lost).
- LiteLLM admin API: `/key/generate` returns `{key, key_id}`;
  `/key/update` accepts `key_id` (stable) or `key` (plaintext alias, works
  for legacy rows); key budgets are enforced IN ADDITION to team budgets;
  `budget_duration: "1mo"` required at creation.

## Post-review fix batch: multi-card / webhook replay tombstoning, portal UX, migration safety (2026-08-18)

Multi-card feature review (adversarial-code-review profile) found 4 MEDIUM +
4 LOW issues. All fixed in commit `a665e1a`, currency fix in `c0389d4`,
deployed to `billing.eu.ecom.demojar.com`.

### Findings and fixes

| Finding | Fix | Severity |
|---|---|---|
| Webhook replay resurrects removed card | Soft-delete (`is_removed=1` tombstone). Insert skips tombstoned pm_ids. All list/ownership/count queries filter `is_removed=0`. Remove = UPDATE SET is_removed=1, is_default=0 (not DELETE). Promotion subquery adds AND is_removed=0 | MEDIUM |
| Migration crash window — DDL+backfill are separate statements | Wrap DDL+backfill in `db.transaction()` | MEDIUM |
| "Card saved." banner is async — user lands before webhook | Softened to "Card added — processing... (it may take a moment to appear)" | MEDIUM |
| Webhook silently swallows no-pm | Throw Error so Stripe retries + operator sees it | MEDIUM |
| Remove/set-default check-then-act outside transaction | Removed card count moved inside transaction | LOW |
| No cancelled feedback — `?card=cancelled` showed nothing | Added "Card setup cancelled." banner | LOW |
| No Stripe security assurance text | Added "Your full card number is never stored by us; Stripe handles all payment data securely" | LOW |
| No-default metering silence | Left as-is (logging would bloat; operator can detect via `/api/portal/me`) | LOW |

### Tests that changed

Test queries on `payment_methods` needed `AND is_removed = 0` to match the
new soft-delete contract:
- `prevents removing the last card` — count query
- `removes a non-default card and keeps the default` — list query
- `removing the default card promotes the remaining card to default` — list query

### Stripe currency fix

Stripe v22 requires `currency: "usd"` on setup-mode Checkout sessions
(`mode: "setup"`). Both `createSetupSession` (signup) and
`createCardSetupSession` (add-card) need it. Without it Stripe returns
`Missing required param: currency.` (502 error). Fixed in `c0389d4`.
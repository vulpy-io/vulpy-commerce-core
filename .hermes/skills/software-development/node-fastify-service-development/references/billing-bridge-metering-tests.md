# Billing-bridge metering-sync unit tests (`runMeteringSync` direct calls)

Unit/integration tests for the metering pipeline call `runMeteringSync` DIRECTLY
with `openDb(":memory:")` + an injected fake pg `query` — no HTTP, no webhook
injection, no Stripe network. Canonical pattern: `test/metering.test.ts`.
Working examples: `test/exhausted-account.test.ts` (4 tests) and
`test/billing-pipeline.test.ts` (5 tests), added 2026-08-18.

## The four reusable pieces (copy from metering.test.ts)

```ts
import { openDb } from "../src/db.js";
import { runMeteringSync, type SpendRow } from "../src/metering.js";
import { makeLitellmStub, makeStripeStub } from "./helpers.js";

/** Fixed clock so the 7-day scan cap and the 15-min recharge cooldown are deterministic. */
const FIXED_NOW = new Date("2026-08-17T12:00:00.000Z");

/** Fake pg query: serves queued responses in order (last one repeats), records calls. */
function fakeQuery(...responses: { rows: SpendRow[] }[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  let i = 0;
  const query = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    const response = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return response ?? { rows: [] };
  };
  return { query, calls };
}

function seedCustomerWithTeam(db: ReturnType<typeof openDb>, email: string, teamId: string, balanceUsd: number): number {
  return Number(
    db.prepare("INSERT INTO customers (email, team_id, balance_usd) VALUES (?, ?, ?)")
      .run(email, teamId, balanceUsd).lastInsertRowid,
  );
}
```

`runMeteringSync` deps: `{ db, query, litellm, markup, creditUsd }` required;
`stripe` optional (auto-recharge skipped when absent — unit tests without a
Stripe stub still work); `now`, `overlapMs`, `pageSize`, `log` optional.
`markup=2`, `creditUsd=0.01` are the test constants. `makeLitellmStub()` and
`makeStripeStub()` come from `./helpers.js` (stub client records calls into
`litellm.calls.budgets` / `.keyBudgets` / `.teams` / `.keys`; stripe stub's
`paymentIntentCreate` is a `vi.fn`).

## Money math facts the tests assert against

- Charge per row = `spend × markup`, `Math.ceil` at 2 decimals ($0.01 granularity);
  cache-hit rows (true/1/"1"/"True"/"true") charge **$0** but are still inserted.
- `customers.balance_usd` is deducted unconditionally — it can go NEGATIVE
  (accounting keeps running; enforcement is the budget mirror).
- The `credits` column is also decremented. `seedCustomerWithTeam` leaves
  `credits = 0`, so a charge makes it negative — assert `balance_usd`, never
  `credits`, unless you seeded both.
- Budget mirror (team AND key): `maxBudgetForCredits(balance/creditUsd, creditUsd, markup)`
  = remaining `balance_usd` rounded to 4dp, **clamped to 0 when balance ≤ 0**.
  Exhausted accounts get `maxBudget: 0` → LiteLLM hard-blocks further spend.
- Stats shape: `{ scanned, inserted, skippedDuplicate, skippedUnknownTeam,
  chargedUsd, teamsUpdated, keysUpdated, autoRecharges, checkpoint }`.
- Dedupe = `INSERT OR IGNORE` on UNIQUE `request_id`; checkpoint =
  `MAX(usage_events.start_time)`; next run scans checkpoint − overlap (default 2h)
  with a 7-day cap and keyset pagination (`pageSize`, cursor on
  `(start_time, request_id)`).
- Budget-call order = insertion order of the `affected` Map (row order), so a
  multi-customer batch asserts budgets in row order.

## Auto-recharge rules (asserted in exhausted-account tests)

Fires when ALL hold: `deps.stripe` present, a default card exists
(`payment_methods.is_default = 1 AND is_removed = 0`), `auto_recharge_threshold`
and `auto_recharge_amount` set (amount > 0), and `balance_usd < threshold` AFTER
the batch deduction. Then:

1. `auto_recharge_pending_since = now.toISOString()` written BEFORE the Stripe
   call (crash between charge and settlement must not double-charge).
2. `createPaymentIntent` → `paymentIntents.create({ amount: amountUsd*100,
   currency: "usd", payment_method: <default pm_id>, off_session: true,
   confirm: true, metadata: { customer_id, purpose: "auto_recharge" } })`.
3. Cooldown: pending_since ≥ now − 15 min → skip (no second PI).
4. Charge failure → pending marker cleared to NULL (next sync retries), sync
   continues, budgets still mirrored.

## Full-lifecycle test: simulate the webhook boundary WITHOUT HTTP

To test recharge → credit → next-sync-spends-restored-balance in one unit test,
replicate the exact DB writes `handlePaymentIntentSucceededLocked` makes (see
src/webhook.ts) after the sync fires the PI:

```ts
db.prepare(
  "INSERT INTO topups (customer_id, stripe_session_id, credits, amount_cents, amount_usd, source, status) VALUES (?, 'pi_test_100', 100, 10000, 1.0, 'auto_recharge', 'completed')",
).run(customerId);
db.prepare(
  "UPDATE customers SET balance_usd = balance_usd + 1.0, credits = credits + 100, auto_recharge_pending_since = NULL WHERE id = ?",
).run(customerId);
```

Use the stub's PI id (`pi_test_${amount}`) as the topup's unique
`stripe_session_id` for realism. A second sync then asserts: no second PI call,
balance above threshold, budget mirror = restored balance.

## Scenario catalog (all verified passing)

Exhausted accounts (`test/exhausted-account.test.ts`):
1. Zero-balance account: row still inserted + charged, balance goes negative,
   team AND key budgets mirrored to 0.
2. Balance consumed to the cent ($0.02 − $0.02): budget exactly 0.
3. Exhausted + default card + threshold → auto-recharge $1.00 fires, pending
   marker = FIXED_NOW, budget still 0.
4. Cooldown: pre-seed `auto_recharge_pending_since = FIXED_NOW` → no second PI,
   marker unchanged.

Billing pipeline (`test/billing-pipeline.test.ts`):
1. Happy path: 3 rows (2 charged, 1 cache hit) → balances, team+key budgets,
   checkpoint advance, stored usage rows (charged_usd/cache_hit).
2. Multi-customer batch: two teams charged + mirrored independently, budgets in
   row order.
3. Mixed batch: duplicate deduped, unknown team skipped, cache hit $0.
4. Full lifecycle: recharge fires → webhook credit simulated → next sync spends
   restored balance, no double charge (PI called exactly once total).
5. Resilience: override `litellm.client.updateTeamBudget` to throw once for one
   team — sync continues, other team's budget updated, both KEY budgets still
   mirrored, both balances still deducted.

## Pitfalls

- `write_file`'s auto-linter reports the project-wide TS noise (esModuleInterop,
  moduleResolution, etc.) — ignore; ground truth is `npm run typecheck`
  (`tsc --noEmit -p tsconfig.json`) and `npx vitest run test/<file>.test.ts`.
- To make a stub fail selectively, wrap the stub method:
  `const original = litellm.client.updateTeamBudget; litellm.client.updateTeamBudget = async (input) => {...}`.
- `toBeCloseTo(x, 5)` for all money asserts (float noise); `toEqual` for exact
  ints, strings, and budget objects.

# Billing-bridge HTTP balance-sync tests (test/balance-sync.test.ts)

Session: 2026-08-18. Canonical example of testing the money flow through
`app.inject()` with the REAL `runMeteringSync` wired as the app's `runSync`.

## What the 4 tests verify

1. **Sync → portal budget match**: admin-triggered metering sync deducts
   $0.03 from a $10 deposit; `/api/portal/me` returns `balanceUsd: 9.97`,
   identical to the mirrored team + key budgets
   (`litellm.calls.budgets`/`keyBudgets`). Asserts the core invariant
   `balanceUsd === budget`.
2. **Admin sync stats**: exact per-row stats over HTTP (scanned 4 / inserted 2
   / skippedDuplicate 1 / skippedUnknownTeam 1 / chargedUsd 0.03 /
   teamsUpdated 1 / keysUpdated 0 / autoRecharges 0) + checkpoint advances to
   the newest CONSUMED row (unknown-team row is NOT inserted, so it does not
   move the checkpoint) + the charged rows surface on `/api/portal/usage`
   (note: ordered `start_time DESC`).
3. **Auto-recharge webhook → immediate portal update**: `payment_intent.succeeded`
   credits $10; `/api/portal/me` jumps $3 → $13 with NO sync wait; budget
   refreshed in the same request; topup row `source='auto_recharge'`.
4. **Checkout webhook → immediate portal update**: `checkout.session.completed`
   credits $10, provisions team+key on first purchase, welcome email once,
   `keyMasked` shown, budget == portal balance.

## Reusable pieces

- `fakeQuery(...responses)` — same as the metering unit tests: serves queued
  `{ rows: SpendRow[] }` pages, repeats last response, records calls.
- `makeSyncApp(spendPages)` — accepts a single page object OR an array
  (`{ rows } | { rows }[]`). The array-only signature is a real TS2353 trap.
- `signIn(ctx, email)` — magic-link auth against an EXISTING ctx (unlike
  e2e's `authedApp` which builds its own app):
  ```ts
  async function signIn(ctx: Ctx, email: string): Promise<string> {
    await ctx.app.inject({ method: "POST", url: "/api/auth/request", payload: { email } });
    const token = new URL(ctx.mailer.sendMagicLink.mock.calls[0]?.[1] as string).searchParams.get("token");
    const verify = await ctx.app.inject({ method: "GET", url: `/api/auth/verify?token=${token}` });
    return cookieValueFrom(verify);
  }
  ```
- `postWebhook` — needs `content-type: application/json` + signed
  `stripe-signature` header (see SKILL.md webhook gotchas).
- Admin bearer header: `Bearer ${cfg.litellmMasterKey}` from the returned ctx
  (never hardcode).

## Money math used in fixtures

- `chargeForSpend`: spend × markup (2), ceil to $0.01 → 0.01→$0.02,
  0.00123→$0.01. Cache hits $0.
- `maxBudgetForCredits(balance/creditUsd, creditUsd, markup)` = remaining
  balance in USD, rounded to 4dp — equals `roundUsd(balance)` (2dp), so
  `me.balanceUsd === budget` holds with exact `toBe` despite float noise in
  the raw SQLite REAL (use `toBeCloseTo(x, 5)` for raw DB reads).
- Fixtures need `team_id`/`key_id`/`key_value` set on the customer for the
  budget mirror to fire (`UPDATE customers SET team_id=..., key_id=...,
  key_value=...`).
- `FIXED_NOW = 2026-08-17T12:00:00.000Z`; spend rows must be within the
  7-day scan window (use `2026-08-17T10:00:0X.000Z`).

## Validation

```bash
cd cloud/llm-gateway/services/billing-bridge
npm run typecheck          # project tsconfig EXCLUDES test/ — src only
npx vitest run test/balance-sync.test.ts   # 4 passed, ~200ms
npx vitest run             # full suite 13 files / 124 tests
```

## Full test file

```ts
/**
 * Balance-sync tests: the bridge's core invariant is that what the portal
 * shows (/api/portal/me balanceUsd) always equals the LiteLLM budget that
 * enforces spend — through every money-moving path:
 *
 *  1. metering sync deducts spend and mirrors the remaining deposit into
 *     the team + key budgets (test 1),
 *  2. the admin sync endpoint reports exact per-row stats (test 2),
 *  3. webhook credits (auto-recharge payment and checkout top-up) land in
 *     the portal immediately, with the budget refreshed in the same
 *     request — no need to wait for the next sync (tests 3 + 4).
 *
 * All requests go through app.inject() against the in-memory bridge app
 * (stubbed Stripe / LiteLLM / mailer). The metering sync's Postgres query
 * is a fake serving canned LiteLLM spend rows, wired in as the app's
 * runSync so POST /api/admin/sync executes the real runMeteringSync.
 */
import { afterEach, describe, expect, it } from "vitest";
import { runMeteringSync, type SpendRow } from "../src/metering.js";
import {
  checkoutCompletedPayload,
  cookieValueFrom,
  makeApp,
  paymentIntentSucceededPayload,
  realStripe,
  seedCustomer,
  seedTopup,
  signWebhookPayload,
  TEST_WEBHOOK_SECRET,
} from "./helpers.js";

/** Fixed clock so the metering scan window (7-day cap) is deterministic. */
const FIXED_NOW = new Date("2026-08-17T12:00:00.000Z");

/** Fake pg query: serves queued spend pages, records calls. */
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

type Ctx = Awaited<ReturnType<typeof makeApp>>;

let apps: Ctx[] = [];
afterEach(async () => {
  await Promise.all(apps.map((a) => a.app.close()));
  apps = [];
});

/**
 * App whose POST /api/admin/sync runs the REAL runMeteringSync against the
 * app's own in-memory DB, reading spend rows from the fake pg query. The
 * runSync closure resolves ctx lazily (it only ever runs during a request,
 * long after makeApp has returned).
 */
async function makeSyncApp(
  spendPages: { rows: SpendRow[] } | { rows: SpendRow[] }[] = { rows: [] },
): Promise<Ctx> {
  const pages = Array.isArray(spendPages) ? spendPages : [spendPages];
  const { query } = fakeQuery(...pages);
  let ctx: Ctx | null = null;
  ctx = await makeApp({
    runSync: () =>
      runMeteringSync({
        db: ctx!.db,
        query,
        litellm: ctx!.litellm.client,
        stripe: ctx!.stripeStub.stripe,
        markup: ctx!.cfg.markupMultiplier,
        creditUsd: ctx!.cfg.creditUsd,
        now: FIXED_NOW,
      }),
  });
  apps.push(ctx);
  return ctx;
}

/** Magic-link sign-in for an existing customer; returns the session cookie. */
async function signIn(ctx: Ctx, email: string): Promise<string> {
  await ctx.app.inject({ method: "POST", url: "/api/auth/request", payload: { email } });
  const token = new URL(ctx.mailer.sendMagicLink.mock.calls[0]?.[1] as string).searchParams.get("token");
  const verify = await ctx.app.inject({ method: "GET", url: `/api/auth/verify?token=${token}` });
  return cookieValueFrom(verify);
}

function postWebhook(app: Ctx["app"], payload: string) {
  return app.inject({
    method: "POST",
    url: "/api/stripe/webhook",
    payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signWebhookPayload(realStripe, payload, TEST_WEBHOOK_SECRET),
    },
  });
}

function adminSync(app: Ctx["app"], cfg: Ctx["cfg"]) {
  return app.inject({
    method: "POST",
    url: "/api/admin/sync",
    headers: { authorization: `Bearer ${cfg.litellmMasterKey}` },
  });
}

function portalMe(app: Ctx["app"], cookie: string) {
  return app.inject({ method: "GET", url: "/api/portal/me", headers: { cookie: `bb_session=${cookie}` } });
}

describe("balance ↔ LiteLLM budget after metering sync", () => {
  it("deducts spend via the admin-triggered sync and /api/portal/me matches the mirrored team+key budget", async () => {
    const ctx = await makeSyncApp({
      rows: [
        { request_id: "r1", team_id: "team_1", model: "vulpy-default", spend: 0.01, cache_hit: false, start_time: "2026-08-17T10:00:00.000Z" },
        { request_id: "r2", team_id: "team_1", model: "vulpy-coder", spend: 0.00123, cache_hit: false, start_time: "2026-08-17T10:00:01.000Z" },
      ],
    });
    const { app, db, litellm, cfg } = ctx;
    const customerId = seedCustomer(db, "sync@test.com", 10); // $10.00 deposit
    db.prepare("UPDATE customers SET team_id = 'team_1', key_id = 'key_1', key_value = 'sk-live-1' WHERE id = ?").run(customerId);
    const cookie = await signIn(ctx, "sync@test.com");

    const sync = await adminSync(app, cfg);
    expect(sync.statusCode).toBe(200);
    expect(sync.json().ok).toBe(true);
    expect(sync.json().stats).toMatchObject({
      scanned: 2,
      inserted: 2,
      skippedDuplicate: 0,
      skippedUnknownTeam: 0,
      teamsUpdated: 1,
      keysUpdated: 1,
      autoRecharges: 0,
    });
    expect(sync.json().stats.chargedUsd).toBeCloseTo(0.03, 5); // 0.02 + 0.01 (ceil to $0.01)

    // Portal shows the post-sync balance immediately.
    const me = await portalMe(app, cookie);
    expect(me.statusCode).toBe(200);
    expect(me.json().balanceUsd).toBe(9.97); // $10.00 − $0.03

    // The budget mirrored to LiteLLM is exactly the remaining deposit —
    // and it is exactly what the portal reports.
    expect(litellm.calls.budgets.at(-1)).toEqual({ teamId: "team_1", maxBudget: 9.97 });
    expect(litellm.calls.keyBudgets.at(-1)).toEqual({ keyId: "key_1", maxBudget: 9.97 });
    expect(me.json().balanceUsd).toBe(litellm.calls.budgets.at(-1)!.maxBudget);
  });

  it("reports per-row stats (duplicates, unknown teams, checkpoint) and exposes the charged usage in the portal", async () => {
    const ctx = await makeSyncApp({
      rows: [
        { request_id: "r1", team_id: "team_1", model: "vulpy-default", spend: 0.01, cache_hit: false, start_time: "2026-08-17T10:00:00.000Z" },
        { request_id: "r1", team_id: "team_1", model: "vulpy-default", spend: 0.01, cache_hit: false, start_time: "2026-08-17T10:00:00.000Z" }, // replay → duplicate
        { request_id: "r2", team_id: "team_1", model: "vulpy-coder", spend: 0.00123, cache_hit: false, start_time: "2026-08-17T10:00:01.000Z" },
        { request_id: "u1", team_id: "team_ghost", model: "vulpy-default", spend: 0.01, cache_hit: false, start_time: "2026-08-17T10:00:02.000Z" }, // no customer
      ],
    });
    const { app, db, cfg } = ctx;
    const customerId = seedCustomer(db, "stats@test.com", 1); // $1.00
    db.prepare("UPDATE customers SET team_id = 'team_1' WHERE id = ?").run(customerId);
    const cookie = await signIn(ctx, "stats@test.com");

    const sync = await adminSync(app, cfg);
    expect(sync.statusCode).toBe(200);
    const stats = sync.json().stats;
    expect(stats.scanned).toBe(4);
    expect(stats.inserted).toBe(2);
    expect(stats.skippedDuplicate).toBe(1);
    expect(stats.skippedUnknownTeam).toBe(1);
    expect(stats.chargedUsd).toBeCloseTo(0.03, 5);
    expect(stats.teamsUpdated).toBe(1);
    expect(stats.keysUpdated).toBe(0); // no key on this customer
    expect(stats.autoRecharges).toBe(0);
    // Checkpoint advances to the newest CONSUMED row (the unknown-team row is not inserted).
    expect(stats.checkpoint).toBe("2026-08-17T10:00:01.000Z");

    const row = db.prepare("SELECT balance_usd FROM customers WHERE id = ?").get(customerId) as { balance_usd: number };
    expect(row.balance_usd).toBeCloseTo(0.97, 5); // $1.00 − $0.03

    // The same charged rows surface on the portal usage endpoint.
    const usage = await app.inject({
      method: "GET",
      url: "/api/portal/usage",
      headers: { cookie: `bb_session=${cookie}` },
    });
    expect(usage.statusCode).toBe(200);
    expect(usage.json().usage).toEqual([
      { model: "vulpy-coder", spendUsd: 0.00123, chargedUsd: 0.01, cacheHit: false, at: "2026-08-17T10:00:01.000Z" },
      { model: "vulpy-default", spendUsd: 0.01, chargedUsd: 0.02, cacheHit: false, at: "2026-08-17T10:00:00.000Z" },
    ]);
  });
});

describe("immediate balance updates after webhook credits", () => {
  it("auto-recharge payment: /api/portal/me shows the new balance and the budget is refreshed in the same request", async () => {
    const ctx = await makeApp();
    apps.push(ctx);
    const { app, db, litellm } = ctx;
    const customerId = seedCustomer(db, "auto@test.com", 3); // $3.00
    db.prepare("UPDATE customers SET team_id = 'team_1', key_id = 'key_1', key_value = 'sk-live-1' WHERE id = ?").run(customerId);
    const cookie = await signIn(ctx, "auto@test.com");

    const before = await portalMe(app, cookie);
    expect(before.json().balanceUsd).toBe(3);

    const res = await postWebhook(app, paymentIntentSucceededPayload("pi_auto_1", String(customerId), 1000)); // $10
    expect(res.statusCode).toBe(200);

    // No sync needed — the credit is immediately visible on the portal…
    const after = await portalMe(app, cookie);
    expect(after.json().balanceUsd).toBe(13);

    // …and the enforcement budget was pushed to LiteLLM in the same request.
    expect(litellm.calls.budgets.at(-1)).toEqual({ teamId: "team_1", maxBudget: 13 });
    expect(litellm.calls.keyBudgets.at(-1)).toEqual({ keyId: "key_1", maxBudget: 13 });
    expect(after.json().balanceUsd).toBe(litellm.calls.budgets.at(-1)!.maxBudget);

    const topup = db.prepare("SELECT source, amount_usd, status FROM topups WHERE stripe_session_id = 'pi_auto_1'").get();
    expect(topup).toEqual({ source: "auto_recharge", amount_usd: 10, status: "completed" });
  });

  it("checkout top-up: credits + provisioning are immediately reflected in /api/portal/me and the budget", async () => {
    const ctx = await makeApp();
    apps.push(ctx);
    const { app, db, litellm, mailer } = ctx;
    const customerId = seedCustomer(db, "buyer@test.com"); // $0.00
    seedTopup(db, customerId, "cs_test_1", 10); // pending $10 purchase
    const cookie = await signIn(ctx, "buyer@test.com");

    const res = await postWebhook(app, checkoutCompletedPayload("cs_test_1", String(customerId), String(customerId)));
    expect(res.statusCode).toBe(200);

    const me = await portalMe(app, cookie);
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      email: "buyer@test.com",
      balanceUsd: 10,
      hasKey: true,
      keyMasked: "sk-live-…wxyz",
    });

    // First purchase provisions team + key and mirrors the budget to the new balance.
    expect(litellm.calls.teams).toEqual([
      { name: "buyer@test.com", metadata: { billing_customer_id: String(customerId), billing_provider: "stripe" } },
    ]);
    expect(litellm.calls.keys).toEqual([{ teamId: "team_1", maxBudget: 10 }]);
    expect(litellm.calls.budgets.at(-1)).toEqual({ teamId: "team_1", maxBudget: 10 });
    expect(litellm.calls.keyBudgets.at(-1)).toEqual({ keyId: "key_1", maxBudget: 10 });
    expect(me.json().balanceUsd).toBe(litellm.calls.budgets.at(-1)!.maxBudget);
    expect(mailer.sendWelcome).toHaveBeenCalledTimes(1);

    const topup = db.prepare("SELECT source, amount_usd, status FROM topups WHERE stripe_session_id = 'cs_test_1'").get();
    expect(topup).toEqual({ source: "checkout", amount_usd: 10, status: "completed" });
  });
});
```

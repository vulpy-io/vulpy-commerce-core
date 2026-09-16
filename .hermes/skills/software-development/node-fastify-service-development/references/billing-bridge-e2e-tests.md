# E2E Test Patterns — Billing Bridge

Full end-to-end test covering the complete purchase flow: checkout → signed
webhook → credits → LiteLLM provisioning → magic-link auth → portal.

## Pattern: `makeFreshApp` + per-test teardown

```typescript
let apps: Awaited<ReturnType<typeof makeApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.map((a) => a.app.close()));
  apps = [];
});

async function makeFreshApp(overrides: Parameters<typeof makeApp>[0] = {}) {
  const ctx = await makeApp(overrides);
  apps.push(ctx);
  return ctx;
}
```

## Test 1: Full purchase flow

```typescript
it("completes a purchase end-to-end", async () => {
  const { app, db, litellm, mailer } = await makeFreshApp();

  // Step 1: Checkout
  const checkout = await app.inject({
    method: "POST",
    url: "/api/checkout",
    payload: { email: "e2e@test.io", credits: 1000 },
  });
  expect(checkout.statusCode).toBe(200);
  const url = checkout.json().url;
  expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_\d+/);
  const sessionId = url.match(/cs_test_\d+/)[0];

  // Pending topup row exists
  const topup = db.prepare("SELECT * FROM topups").get();
  expect(topup).toMatchObject({ stripe_session_id: sessionId, credits: 1000, status: "pending" });

  // Customer created, no key/team yet
  const customerBefore = db.prepare("SELECT id, email, credits, key_value, team_id FROM customers").get();
  expect(customerBefore.email).toBe("e2e@test.io");
  expect(customerBefore.credits).toBe(0);
  expect(customerBefore.key_value).toBeNull();
  expect(customerBefore.team_id).toBeNull();

  // Step 2: Signed webhook — CRITICAL: sign once, send the same variable
  const payload = checkoutCompletedPayload(sessionId, String(customerBefore.id), `cus_${customerBefore.id}`, "paid");
  const sig = signWebhookPayload(realStripe, payload, TEST_WEBHOOK_SECRET);
  const webhook = await app.inject({
    method: "POST",
    url: "/api/stripe/webhook",
    headers: { "content-type": "application/json", "stripe-signature": sig },
    payload,
  });
  expect(webhook.statusCode).toBe(200);
  expect(webhook.json()).toEqual({ received: true });

  // Step 3: Verify side effects
  const customerAfter = db.prepare("SELECT id, email, credits, key_value, team_id FROM customers").get();
  expect(customerAfter.credits).toBe(1000);
  expect(customerAfter.key_value).toMatch(/^sk-live-/);
  expect(customerAfter.team_id).toMatch(/^team_/);

  const topupAfter = db.prepare("SELECT status FROM topups").get();
  expect(topupAfter.status).toBe("completed");

  expect(litellm.calls.teams).toHaveLength(1);
  expect(litellm.calls.teams[0].name).toBe("e2e@test.io");
  expect(litellm.calls.keys).toHaveLength(1);
  expect(litellm.calls.keys[0].maxBudget).toBeCloseTo(5.0, 1); // 1000 × 0.01 / 2

  expect(mailer.sendWelcome).toHaveBeenCalledTimes(1);
  expect(mailer.sendWelcome.mock.calls[0][0]).toBe("e2e@test.io");

  // Step 4: Auth + portal
  await app.inject({ method: "POST", url: "/api/auth/request", payload: { email: "e2e@test.io" } });
  const linkUrl = mailer.sendMagicLink.mock.calls[0][1];
  const token = new URL(linkUrl).searchParams.get("token");
  const verify = await app.inject({ method: "GET", url: `/api/auth/verify?token=${token}` });
  expect(verify.statusCode).toBe(302);
  const cookie = cookieValueFrom(verify);

  const me = await app.inject({ method: "GET", url: "/api/portal/me", headers: { cookie: `bb_session=${cookie}` } });
  expect(me.statusCode).toBe(200);
  expect(me.json()).toMatchObject({ email: "e2e@test.io", credits: 1000, balanceUsd: 10.0 });

  // Key reveal (once)
  const keyRes = await app.inject({ method: "GET", url: "/api/portal/key", headers: { cookie: `bb_session=${cookie}` } });
  expect(keyRes.statusCode).toBe(200);
  expect(keyRes.json().key).toMatch(/^sk-live-/);

  const keyAgain = await app.inject({ method: "GET", url: "/api/portal/key", headers: { cookie: `bb_session=${cookie}` } });
  expect(keyAgain.statusCode).toBe(404);

  // Portal topup
  const topup2 = await app.inject({ method: "POST", url: "/api/portal/topup", payload: { credits: 2500 }, headers: { cookie: `bb_session=${cookie}` } });
  expect(topup2.statusCode).toBe(200);
  expect(topup2.json().url).toMatch(/stripe\.com/);

  const customers = db.prepare("SELECT COUNT(*) AS n FROM customers").get();
  expect(customers.n).toBe(1);
});
```

## Test 2: Repeat purchase (no duplicate provisioning)

```typescript
it("tops up an existing customer without re-creating the LiteLLM team", async () => {
  const { app, db, litellm, mailer } = await makeFreshApp();

  // First purchase
  const first = await app.inject({ method: "POST", url: "/api/checkout", payload: { email: "repeat@test.io", credits: 1000 } });
  const sessionId1 = first.json().url.match(/cs_test_\d+/)[0];
  const customerId1 = db.prepare("SELECT id FROM customers").get().id;

  const payload1 = checkoutCompletedPayload(sessionId1, String(customerId1), "cus_1", "paid");
  const sig1 = signWebhookPayload(realStripe, payload1, TEST_WEBHOOK_SECRET);
  await app.inject({ method: "POST", url: "/api/stripe/webhook", headers: { "content-type": "application/json", "stripe-signature": sig1 }, payload: payload1 });

  // Second purchase
  const second = await app.inject({ method: "POST", url: "/api/checkout", payload: { email: "repeat@test.io", credits: 2500 } });
  const sessionId2 = second.json().url.match(/cs_test_\d+/)[0];
  const customerId2 = db.prepare("SELECT id FROM customers").get().id;
  expect(customerId2).toBe(customerId1);

  const payload2 = checkoutCompletedPayload(sessionId2, String(customerId2), "cus_2", "paid");
  const sig2 = signWebhookPayload(realStripe, payload2, TEST_WEBHOOK_SECRET);
  await app.inject({ method: "POST", url: "/api/stripe/webhook", headers: { "content-type": "application/json", "stripe-signature": sig2 }, payload: payload2 });

  // Assertions
  expect(litellm.calls.teams).toHaveLength(1);
  expect(litellm.calls.keys).toHaveLength(1);
  expect(litellm.calls.budgets).toHaveLength(2);  // budget mirror fires each time
  expect(litellm.calls.keyBudgets).toHaveLength(2);
  expect(mailer.sendWelcome).toHaveBeenCalledTimes(1);

  const customer = db.prepare("SELECT credits FROM customers WHERE email = 'repeat@test.io'").get();
  expect(customer.credits).toBe(3500);
});
```

## Test 3: Async payment (deferred settlement)

```typescript
it("handles async payment completion (e.g. bank transfer, Klarna)", async () => {
  const { app, db } = await makeFreshApp();

  const checkout = await app.inject({ method: "POST", url: "/api/checkout", payload: { email: "deferred@test.io", credits: 1000 } });
  const sessionId = checkout.json().url.match(/cs_test_\d+/)[0];
  const customerId = db.prepare("SELECT id FROM customers").get().id;

  // Async payment succeeds
  const asyncPayload = asyncPaymentSucceededPayload(sessionId, String(customerId), "cus_df");
  const sig = signWebhookPayload(realStripe, asyncPayload, TEST_WEBHOOK_SECRET);
  const webhook = await app.inject({ method: "POST", url: "/api/stripe/webhook", headers: { "content-type": "application/json", "stripe-signature": sig }, payload: asyncPayload });
  expect(webhook.statusCode).toBe(200);

  const customer = db.prepare("SELECT credits FROM customers WHERE email = 'deferred@test.io'").get();
  expect(customer.credits).toBe(1000);
});
```

## Common pitfalls

- **Missing `content-type: application/json` on webhook inject.** The
  `fastify-raw-body` middleware rejects requests without it (415). Always
  include it — even though the body is JSON and the default parser would
  handle it, the raw-body path explicitly requires the header.
- **Signing one payload, sending another.** `signWebhookPayload` encodes
  the current timestamp in the signature. If you call
  `checkoutCompletedPayload()` twice (once for signing, once for inject),
  the second call produces a different `created` timestamp → signature
  mismatch → 401. Always capture the payload in a variable and reuse it.
- **Budget formula**: `budget = (credits × creditUsd) / markupMultiplier`,
  not `credits × creditUsd`. With `markupMultiplier=2`, 1000 credits ×
  $0.01 = $5.00 budget, not $10.00.
- **Unused `stripeStub`**: destructure only what you assert on. The stub
  is implicitly wired by `makeApp()`.
- **`balanceUsd`**: `credits × creditUsd`, NOT affected by markup.
  `maxBudgetForCredits` divides by markup (provider-cost terms), but
  `balanceUsd` is the customer-facing value.
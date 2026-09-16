# Stripe integration patterns: SetupIntent, free credits, auto-recharge

From the 2026-08-18 billing bridge USD refactor session.

## Free $2 credit on signup (card verification, no charge)

### Stripe: Setup mode checkout session (with expanded payment method)

```typescript
export async function createSetupSession(
  stripe: Stripe,
  cfg: Config,
  input: { customerId: number; email: string },
): Promise<SetupSessionResult> {
  const session = await stripe.checkout.sessions.create({
    mode: "setup",                         // ← NOT "payment"
    client_reference_id: String(input.customerId),
    customer_email: input.email,
    metadata: { customer_id: String(input.customerId) },
    expand: ["setup_intent.payment_method"],  // ← payment method in webhook payload
    success_url: `${cfg.portalBaseUrl}/portal?signup=success`,
    cancel_url: `${cfg.portalBaseUrl}/?signup=cancelled`,
  });
  return { id: session.id, url: session.url };
}
```

**Key: `expand: ["setup_intent.payment_method"]`** — Stripe includes request-time
expansions in webhook payloads, so the `payment_method` object is available directly
from `session.setup_intent.payment_method` without a separate
`stripe.setupIntents.retrieve()` call. This avoids an extra network round-trip
and the risk of the setup intent expiring before the webhook is processed.

### Webhook: detect setup mode by session.mode

In `handleStripeEvent`, route on `session.mode === "setup"` — NOT on a metadata
flag. This is more reliable because `mode` is a top-level Stripe property that
is always present:

```typescript
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode === "setup") {
    await handleSetupCompleted(ctx, session);
  } else {
    await handleCheckoutCompleted(ctx, session);
  }
  break;
}
```

### Webhook: grant free credits, store payment method (idempotent)

The payment method is extracted from the expanded payload via a helper. The
topup uses `INSERT OR IGNORE` (UNIQUE `stripe_session_id`) for idempotency,
and `free_credits_granted` is the flag the `/api/signup` route checks:

```typescript
function paymentMethodIdFromSession(session: Stripe.Checkout.Session): string | null {
  const setupIntent = session.setup_intent;
  if (!setupIntent || typeof setupIntent === "string") return null;
  const pm = setupIntent.payment_method;
  if (!pm) return null;
  return typeof pm === "string" ? pm : pm.id;
}

async function handleSetupCompleted(ctx: WebhookContext, session: Stripe.Checkout.Session): Promise<void> {
  const customerId = Number(session.client_reference_id);
  // Guard: customer exists
  // ... (uses withCustomerLock for serialization)

  if (customer.free_credits_granted) return;  // 200, idempotent

  const amountUsd = ctx.cfg.freeCreditAmountUsd;
  const credits = amountUsd / ctx.cfg.creditUsd;
  const paymentMethodId = paymentMethodIdFromSession(session);

  // Transaction: INSERT OR IGNORE for idempotency
  const granted = ctx.db.transaction((): boolean => {
    const res = ctx.db
      .prepare(
        `INSERT OR IGNORE INTO topups
           (customer_id, stripe_session_id, credits, amount_cents, amount_usd, source, status)
         VALUES (?, ?, ?, ?, ?, 'signup_bonus', 'completed')`,
      )
      .run(customer.id, session.id, credits, Math.round(amountUsd * 100), amountUsd);
    if (res.changes === 0) return false;  // already processed
    ctx.db
      .prepare(
        `UPDATE customers
         SET balance_usd = balance_usd + ?,
             credits = credits + ?,
             stripe_payment_method_id = COALESCE(stripe_payment_method_id, ?),
             free_credits_granted = 1,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(amountUsd, credits, paymentMethodId, customer.id);
    return true;
  })();
}
```

Key points:
- **Expand pattern**: `expand: ["setup_intent.payment_method"]` avoids a separate
  API call — the payment method object arrives in the webhook payload
- **`INSERT OR IGNORE`** on `topups` with UNIQUE `stripe_session_id` is the
  idempotency key — replays silently do nothing
- **Do NOT provision LiteLLM team+key** on signup — that happens on first paid purchase
- The `free_credits_granted` flag prevents double-granting (checked by `/api/signup`)
- `stripe_payment_method_id` is stored for future auto-recharge via `COALESCE(?, stripe_payment_method_id)`
- `source: 'signup_bonus'` distinguishes from paid topups

## Auto-recharge

### Schema: customer flags

```sql
auto_recharge_threshold REAL  -- e.g. 5.0 (trigger when balance drops below $5)
auto_recharge_amount REAL      -- e.g. 10.0 (charge $10)
```

### Stripe: off-session PaymentIntent

```typescript
export async function createPaymentIntent(
  stripe: Stripe,
  cfg: Config,
  input: { customerId: number; amountUsd: number; paymentMethodId: string },
): Promise<{ id: string }> {
  const pi = await stripe.paymentIntents.create({
    amount: Math.round(input.amountUsd * 100),
    currency: "usd",
    payment_method: input.paymentMethodId,
    off_session: true,
    confirm: true,  // auto-confirm since we have the stored method
    metadata: { customer_id: String(input.customerId), purpose: "auto_recharge" },
  });
  return { id: pi.id };
}
```

### Webhook: payment_intent.succeeded

```typescript
case "payment_intent.succeeded":
  await handlePaymentIntentSucceeded(ctx, event.data.object as Stripe.PaymentIntent);
  break;

async function handlePaymentIntentSucceeded(ctx: WebhookContext, pi: Stripe.PaymentIntent): Promise<void> {
  if (pi.metadata?.purpose !== "auto_recharge") return;  // ignore non-auto-recharge PIs

  const customerId = Number(pi.metadata?.customer_id);
  const amountUsd = (pi.amount_received ?? pi.amount) / 100;

  ctx.db.transaction(() => {
    ctx.db.prepare("UPDATE customers SET balance_usd = balance_usd + ?, updated_at = datetime('now') WHERE id = ?")
      .run(amountUsd, customerId);
    ctx.db.prepare("INSERT INTO topups (customer_id, stripe_session_id, amount_usd, amount_cents, status, source) VALUES (?, ?, ?, ?, 'completed', 'auto_recharge')")
      .run(customerId, `pi_${pi.id}`, amountUsd, pi.amount_received ?? pi.amount);
  })();

  // Refresh LiteLLM budget
  await refreshBudget(ctx, customerId);
}
```

### Metering: auto-recharge trigger

Called from the metering sync after a batch of deductions — if the customer's balance drops below `auto_recharge_threshold` and they have a stored payment method, fire a `createPaymentIntent`:

```typescript
if (customer.auto_recharge_threshold !== null
    && customer.auto_recharge_amount !== null
    && customer.balance_usd < customer.auto_recharge_threshold
    && customer.stripe_payment_method_id
    && !alreadyRefilling) {
  await createPaymentIntent(stripe, cfg, {
    customerId: customer.id,
    amountUsd: customer.auto_recharge_amount,
    paymentMethodId: customer.stripe_payment_method_id,
  });
}
```

## Schema migration pattern (additive)

When adding columns to a live SQLite database:

```typescript
function ensureColumn(db: Database.Database, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((col) => col.name === column)) {
    db.exec(ddl);
  }
}

// Migration for USD columns
ensureColumn(db, "customers", "balance_usd", "ALTER TABLE customers ADD COLUMN balance_usd REAL NOT NULL DEFAULT 0");
ensureColumn(db, "customers", "free_credits_granted", "ALTER TABLE customers ADD COLUMN free_credits_granted INTEGER NOT NULL DEFAULT 0");
ensureColumn(db, "customers", "stripe_payment_method_id", "ALTER TABLE customers ADD COLUMN stripe_payment_method_id TEXT");
ensureColumn(db, "customers", "auto_recharge_threshold", "ALTER TABLE customers ADD COLUMN auto_recharge_threshold REAL");
ensureColumn(db, "customers", "auto_recharge_amount", "ALTER TABLE customers ADD COLUMN auto_recharge_amount REAL");

// Backfill legacy data
db.prepare("UPDATE customers SET balance_usd = credits * 0.01 WHERE credits > 0 AND balance_usd = 0").run();
db.prepare("UPDATE topups SET amount_usd = credits * 0.01 WHERE credits > 0 AND amount_usd = 0").run();
```

## Route: auto-recharge config

```typescript
app.post("/api/portal/auto-recharge", async (req, reply) => {
  const customer = requireCustomer(req, reply);
  if (!customer) return;
  const body = (req.body ?? {}) as { threshold?: unknown; amount?: unknown };
  const threshold = typeof body.threshold === "number" ? body.threshold : Number(body.threshold);
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  if (!Number.isFinite(threshold) || threshold < 0) return reply.code(400).send({ error: "invalid_threshold" });
  if (!Number.isFinite(amount) || amount <= 0) return reply.code(400).send({ error: "invalid_amount" });
  db.prepare("UPDATE customers SET auto_recharge_threshold = ?, auto_recharge_amount = ? WHERE id = ?")
    .run(threshold, amount, customer.id);
  return { ok: true, threshold, amount };
});

app.post("/api/portal/auto-recharge/disable", async (req, reply) => {
  const customer = requireCustomer(req, reply);
  if (!customer) return;
  db.prepare("UPDATE customers SET auto_recharge_threshold = NULL, auto_recharge_amount = NULL WHERE id = ?")
    .run(customer.id);
  return { ok: true };
});
```

## Portal: me endpoint includes auto-recharge status

```typescript
app.get("/api/portal/me", async (req, reply) => {
  return {
    balanceUsd: roundUsd(customer.balance_usd),
    hasPaymentMethod: customer.stripe_payment_method_id !== null,
    autoRecharge: customer.auto_recharge_threshold
      ? { threshold: customer.auto_recharge_threshold, amount: customer.auto_recharge_amount }
      : null,
    // ...
  };
});
```
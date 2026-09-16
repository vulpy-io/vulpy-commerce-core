# Money / billing systems — reusable bug-pattern checklist

Distilled from adversarial reviews of prepaid-credit billing bridges
(Stripe Checkout + LiteLLM-style enforcement mirrors). Each pattern below has
bitten a real review; check for it explicitly in any code that moves money or
credits.

## 1. Crash window between external call and DB write (silent money loss)

Ordering matters: if the flow is `create external session → INSERT local row`,
a crash between the two leaves a live external session with no local record.
When the completion webhook arrives it finds no row → if it returns success
(200) instead of failing, the payment is **permanently uncredited with no
retry and no alert**. Check: (a) insert the local pending row BEFORE the
external call (mark failed on call error), or reconcile by the external
`client_reference_id`; (b) unknown-session webhook events should NOT return
200 silently — 500 or alert so Stripe keeps retrying.

## 2. Stale enforcement mirror, retried only on new activity

When usage is deducted locally and mirrored to an enforcement system
(budget/meter) AFTER the batch, a failed mirror write is often just logged.
If retry only happens when the entity reappears in a later batch's
`affected` set, an idle entity carries a stale (too-high) enforcement budget
**indefinitely** → overspend beyond the local balance. Fix: persist a
`budget_dirty` flag and retry on every sync until success.

## 3. Key-level budget vs team-level budget (two enforcement layers)

Enforcement systems with both key and team budgets enforce BOTH (the
binding constraint is the minimum). Classic bug: the key is created with
`max_budget` + `budget_duration` at first-purchase value, and top-ups /
metering only update the TEAM budget. The key budget then caps the customer
at their first purchase size (with monthly reset) — top-ups appear to work
but unlock nothing. Check every layer that has a budget, not just the one
the spec mentions ("the sync keeps it fresh" must actually refresh the layer
it refers to).

## 4. Reveal-once / one-time-show interacting with provisioning flags

A "reveal-once" feature that wipes the stored secret (key) collides with
provisioning logic that checks `secret IS NULL` to decide "never
provisioned". Wipe → next event re-provisions a NEW secret that is never
delivered, while the old one stays valid. Fix: separate the provisioning
flag from the stored plaintext (`key_provisioned` column, not `key_value IS
NULL`).

## 5. At-least-once gaps on one-time side effects

Emails/flags written AFTER the side effect: crash between `send()` success
and `flag = 1` → duplicate delivery on retry. Acceptable for idempotent
side effects, a bug for "email the key once" — either write the flag first
(accept at-least-once) or use an outbox.

## 6. Unbounded sync queries + overlap re-scan

Checkpoint-based syncs with a fixed overlap window re-fetch the whole
window every cycle; with no LIMIT the first run from epoch can pull the
entire historical table, and busy systems re-scan the overlap 8× per
window. Add LIMIT + cursor pagination; cap the scan window. Also: rows for
unknown/unmapped entities never advance the checkpoint → re-scanned from
epoch forever in the worst case.

## 7. Tokens leaked by framework default request logging

A magic-link token in a query string (`?token=...`) is logged in plaintext
by Fastify/pino's default `req.url` serializer on every request — violating
"never log tokens" even though app code never logs it. Check framework
default loggers for query strings; redact via logger serializers or move the
token to a POST body.

## 8. Guarded DB write but unguarded upstream call

`UPDATE ... WHERE flag IS NULL` prevents duplicate DB writes but not
duplicate upstream calls (two concurrent webhook deliveries both call
`/team/new` before either DB write lands) → orphaned upstream resources.
Needs a per-entity mutex around the external call, or external idempotency
keys.

## 9. Money math round-trip consistency

- Purchase: `unit_amount_cents == credits × credit_usd` (validate at
  startup).
- Usage: `credits = ceil(spend × markup / credit_usd × 100) / 100` —
  round UP at 2 decimals; cache-hit rows → 0 regardless of reported spend.
- Enforcement mirror: verify the markup is applied EXACTLY ONCE. Two valid
  specs exist: (a) budget = full deposit (`credits × credit_usd`) with the
  markup applied to model pricing only, or (b) provider-cost terms
  (`credits × credit_usd / markup`). The bug is DOUBLE application — the
  package price already carries the markup AND the budget is divided again
  — which silently halves what customers get per dollar (or the reverse:
  dropping the division on a pricing model that expects it over-credits).
  Rounding the mirror UP (to kill float noise) lets tiny balances overspend
  by the rounding delta (trivial, but note it).
- Store money as integers (cents / hundredths of a credit) when possible;
  REAL columns accumulate float drift — display rounding masks it, budget
  mirrors amplify it.

## 10. Verifying without docker/network

Reviews are read-only: run `npm run typecheck` + `npm test`, probe DB
semantics with a throwaway node script (better-sqlite3 in `:memory:` is
perfect for upsert/rowid/transaction questions), and hash-verify file
content when tool output looks redacted (see SKILL.md pitfall).

## 11. Charge-side vs credit-side idempotency (periodic trigger loops)

A webhook that credits on `payment_intent.succeeded` with a UNIQUE
`topup.stripe_session_id` is replay-safe — but that only protects the
CREDIT side. If the CHARGE is created by a periodic loop (metering sync /
cron) that re-fires whenever `balance < threshold` with a saved card, the
charge side has no dedupe at all: webhook delay > sync interval (outages,
deploys — exactly the fragile windows) → the loop fires again on the still-
low balance → customer charged twice; the UNIQUE guard dedupes the credit
but never the money taken. Related: declined / 3DS-required off-session
charges retry every cycle forever, each retry a new hard authorization,
with no backoff, cap, or customer notification. Check for: an in-flight
marker (pending topup row / `pending_since` column) or a Stripe idempotency
key on charge creation; attempt caps + failure surfacing; and upper bounds
on customer-configurable amounts (a $1M threshold+amount = a $1M charge
attempt on next usage). Tests usually cover one sync firing once — look for
a missing test for consecutive syncs with an unsettled payment, then report
it as the gap.

## 12. Schema-migration backfills are irreversible — verify once-semantics + conversion factor

Adding money columns to a live DB via `ensureColumn`-style helpers: the
backfill must run ONLY when the column is first added (re-open idempotent),
and must be tested against a simulated legacy DB (seed old-schema rows →
open → assert converted values → close → re-open → assert unchanged; also
assert the file-permission hardening, e.g. 0600). Watch for HARDCODED
conversion factors (`credits * 0.01`) that silently disagree with
configured units (creditUsd): fine at defaults, wrong forever after a
config change, and unrecoverable once applied — flag the hardcode and the
missing positivity validation on the new money env vars (a negative
`FREE_CREDIT_AMOUNT_USD` silently deducts balance on grant). Also check the
`balance_usd / creditUsd` → credits → `× creditUsd` round-trip used to feed
legacy signatures: harmless when the mirror rounds to 4 decimals, a drift
source without.

## 13. INSERT OR IGNORE is not a tombstone — delete-then-replay resurrection

UNIQUE-key + INSERT OR IGNORE makes webhook replays idempotent ONLY while the
row still exists. If the entity can be deleted by user action (portal "remove
card"), a delayed retry of the original webhook (Stripe retries failed
deliveries for days) re-inserts the row from scratch — and "first record
becomes default" logic (`COUNT(*) == 0 → is_default = 1`) can re-promote a
removed card to the money-charging role, charging a card the user explicitly
removed. Fix: tombstone removals (`is_removed` / `removed_at` column, keep the
row) and make the insert path skip tombstoned keys. Test: remove the entity,
then replay the webhook payload — assert it is NOT resurrected.

## 14. UI success banners must not be decoupled from async webhook truth

Success messaging keyed off a redirect query param (`?card=added`) lies when
the actual state change happens in an asynchronously-delivered webhook: the
user can land on the page before the webhook lands, and the banner shows
"Saved." regardless of whether the handler succeeded. Two-part fix: (a) the
webhook handler for a KNOWN session with missing payload data (e.g. no payment
method on a setup session) must fail loudly (throw → 5xx → Stripe retries +
alert) like its sibling paths do for unknown sessions — log-and-200 silently
drops the user's action; (b) the success page should poll the read API or
soften the copy while the write is unconfirmed.

## 15. Migration backfill gated on table existence — crash window skips it forever

`CREATE TABLE` + backfill as two separate execs with a "does the table exist?"
gate: a crash between them leaves the table present, so every future open
skips the backfill permanently — legacy data silently never migrates, and the
feature that depends on it (auto-recharge default card) silently stops
working. Fix: wrap DDL + backfill in one transaction, or gate on an explicit
version marker (`PRAGMA user_version` / schema_migrations table) instead of
object existence. Test: simulate the window (create table, skip backfill,
re-open) and assert migration still runs.

## 16. Check-then-act "safe today" claims are only as strong as the execution model

Ownership SELECT + COUNT guard outside a transaction is atomic in practice
when the DB driver is synchronous and the service is single-process (no await
between check and write → no interleaving). Report it LOW with that caveat
explicit, not HIGH — but note in the report that the invariant breaks if the
DB is ever shared by multiple processes.

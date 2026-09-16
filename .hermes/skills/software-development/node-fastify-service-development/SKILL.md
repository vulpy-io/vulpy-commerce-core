---
name: node-fastify-service-development
description: Build a new Node.js 22+ / TypeScript / Fastify service in this repo's environment — better-sqlite3 (WAL) data layer, external HTTP/API integrations (Stripe SDK, admin APIs), SMTP email, portal pages, and vitest unit tests. Use when implementing a new service package (e.g. under cloud/llm-gateway/services/), adding Fastify routes, writing signature-verified webhooks, or wiring dependency-injected apps for testability. Covers the 2026 registry reality (package names/versions), TypeScript 7 toolchain quirks, and idempotent webhook patterns.
---

# Node + Fastify Service Development

Trigger: implementing a new Node/TypeScript/Fastify service package (SQLite +
external API integrations + email + tests), adding webhook handlers, or
bringing a service into docker-compose. Verified while building the
`billing-bridge` service (2026-08-17) and while executing its security
review fix-batch (5 High + 6 Medium + 11 Low; see
`references/billing-bridge-review-fixes.md` for the full finding→fix
playbook, SDK facts, and test-contract changes).

See `references/billing-portal-ux-preview-key-management.md` for the operator-approved
portal patterns: TESTING_ENV demo-customer preview mode, why arbitrary Tailwind classes
don't render (inline style), elevated cards, popup-only API key UX (no reveal/copy in
card, reissue confirm popup), USD-only 0.00X usage columns, header exit icon, and the exact
`@fastify/cookie` HMAC signing scheme.

## Environment reality (2026 — check before pinning versions)

- **`npm view <pkg> version` before writing version ranges.** Registry majors
  here: fastify 5.12, stripe 22, nodemailer 8/9, pg 8.23, typescript 7, vitest 4.
- **`@fastify/raw-body` DOES NOT EXIST** — the real package is
  `fastify-raw-body` (unscoped, v6 for Fastify 5). Same API:
  `register(rawBody, { field: "rawBody", global: false })` + route
  `{ config: { rawBody: true } }` → `req.rawBody` (may be undefined — guard).
  With `global: false` only routes opting in capture the raw body; the default
  JSON parser keeps working everywhere else.
- **nodemailer: use ^9, never ^8.** nodemailer ≤9.0.0 has
  GHSA-p6gq-j5cr-w38f (message-level `raw` option → arbitrary file read /
  full-response SSRF); fixed in 9.0.5. `nodemailer-postmark-transport` was
  removed entirely — imported nowhere and it dragged in vulnerable
  nodemailer 8. SMTP API is identical between 8 and 9 (`npm audit` must
  show 0 high after any dep change).
- No pnpm workspace in this repo — the package's own `npm run test` /
  `npm run check` scripts are the gate (specs usually say "or the package's
  test script").
- better-sqlite3: `import Database from "better-sqlite3"` needs
  `esModuleInterop` (fine once the real tsconfig applies).

## TypeScript 7 (tsgo) — per-file checker noise vs ground truth

- The write_file syntax checker runs tsc **per-file WITHOUT tsconfig** and
  reports fake errors: TS5112 (config ignored), TS1259/TS1192 (esModuleInterop
  / default-import), TS2802 (Map iteration), TS2550 (`replaceAll` needs
  lib es2021). **Ignore this noise.**
- Ground truth is `npx tsc --noEmit -p tsconfig.json` — that's the gate.
- BUT the per-file checker still catches REAL mistakes — e.g.
  `import type Stripe from "stripe"` used as a value (`new Stripe(...)`).
  Fix those when they appear.
- vitest 4: `poolOptions` was REMOVED — use top-level
  `pool: "forks"` + `fileParallelism: false` (single forked process).

## E2E test patterns (checkout → webhook → portal)

Full E2E tests for billing / payment services validate the complete
purchase flow through all layers:

```
checkout → webhook → credits → LiteLLM provisioning → auth → portal
```

### Key gotchas for webhook injection

- **`app.inject` to a `raw-body` route needs `content-type: application/json`**
  in the headers dict. Without it, the `fastify-raw-body` pre-parser refuses
  the request (415 Unsupported Media Type). This is NOT the same as the
  default JSON auto-parser — the raw-body route explicitly requires the
  content-type header even when the body is JSON.
- **Sign the payload once, send the same variable.** The `signWebhookPayload`
  function encodes the current timestamp in the Stripe signature. If you
  call `checkoutCompletedPayload(...)` to generate the payload string, then
  call `signWebhookPayload()` with that string, then call
  `checkoutCompletedPayload(...)` AGAIN to pass as the `payload` argument,
  the second call produces a different timestamp — the signature won't
  match. Always:
  ```
  const payload = checkoutCompletedPayload(sessionId, ref, customerId);
  const sig = signWebhookPayload(realStripe, payload, TEST_WEBHOOK_SECRET);
  await app.inject({
    method: "POST",
    url: "/api/stripe/webhook",
    headers: { "content-type": "application/json", "stripe-signature": sig },
    payload,  // <-- same variable, not a new call
  });
  ```
- **Unused `stripeStub` in E2E tests.** The full E2E tests use the real
  Stripe SDK for webhook signature math but rely on the stub for session
  creation. The stub is implicitly wired by `makeApp()` — no need to
  destructure it if you're not asserting on it. Destructure only what you
  assert on (`db`, `litellm`, `mailer`).

### Budget formula

**Budget = credits × creditUsd (full dollar value).** The markup multiplier
applies to model pricing in LiteLLM, not the budget. The budget is the
customer's deposit — what they paid, not what it costs the provider. With
`markupMultiplier=2` and `creditUsd=0.01`: 1000 credits → $10.00 budget.

The ×2 markup is configured as model-level pricing in LiteLLM (e.g.
`model_cost_map` or `model_group` multipliers), not the budget cap. The
budget function signature keeps the unused `_markupMultiplier` parameter for
call-site compatibility but deliberately ignores it.

### What full E2E tests should cover

1. **Checkout → webhook → credits → provisioning → portal**. Single test
   that calls `POST /api/checkout`, fires a signed webhook for the returned
   session, verifies credits/team/key in DB, then authenticates via magic
   link and asserts portal data (balance, key reveal-once, portal topup).
2. **Repeat purchase** — existing customer buys more credits: same team/key
   reused, budget mirror fires on each purchase, welcome email sent once.
   Assert against `litellm.calls.teams.length === 1` and
   `litellm.calls.keys.length === 1`.
3. **Async payment** — deferred settlement via
   `checkout.session.async_payment_succeeded`: credits applied on the
   deferred event, not on the initial `checkout.session.completed` with
   `payment_status: "unpaid"`.
4. **Expired session** — `checkout.session.expired` marks the pending topup
   as `failed` without crediting.
5. **Replay** — same webhook event delivered 3× results in the same state
   (credits, teams, keys, emails all exactly once).
6. **Concurrent delivery** — two in-flight webhooks for the same customer
   (gated stub) serialize to one provisioning.
7. **Unknown session** — `checkout.session.completed` with no matching topup
   returns 500 (money-relevant anomaly).

See `references/billing-bridge-e2e-tests.md` for the full test source.
See `references/billing-bridge-stripe-integration.md` for SetupIntent/free-credit/auto-recharge patterns including:
- Setup-mode checkout sessions with `expand: ["setup_intent.payment_method"]` (no extra API call)
- `INSERT OR IGNORE` topup idempotency for free credits
- Off-session `payment_intent` with `confirm: true` for auto-recharge
- `session.mode === "setup"` routing in the webhook dispatcher
- Metering-triggered auto-recharge when balance drops below threshold

## Metering-sync unit tests (runMeteringSync direct calls, no HTTP)

Unit/integration tests for the metering pipeline call `runMeteringSync` directly
with `openDb(":memory:")` + an injected fake pg `query` — no HTTP, no webhook
injection. Canonical pattern: `test/metering.test.ts`; working examples:
`test/exhausted-account.test.ts` (4 tests) + `test/billing-pipeline.test.ts`
(5 tests). See `references/billing-bridge-metering-tests.md` for the reusable
helpers (`fakeQuery`, `seedCustomerWithTeam`, `FIXED_NOW`), money math, and the
scenario catalog.

- Charge per row = `spend × markup`, ceiled to $0.01; cache hits $0. Budget
  mirror = remaining `balance_usd`, clamped to 0 → exhausted accounts get a
  hard-block `maxBudget: 0` in LiteLLM.
- Auto-recharge: fires when balance < threshold AND a default card exists
  (`payment_methods.is_default = 1 AND is_removed = 0`); pending marker written
  BEFORE the Stripe call; 15-min cooldown skips while pending; the
  `payment_intent.succeeded` webhook clears it.
- Full recharge lifecycle without HTTP: replicate the webhook's DB writes
  (topup `INSERT OR IGNORE` + `balance_usd`/`credits` bump +
  `auto_recharge_pending_since = NULL`), then run a second sync.

### Metering sync via HTTP injection (admin endpoint runs the REAL sync)

To test the money flow end-to-end over `app.inject()` — `POST /api/admin/sync`
executing the real `runMeteringSync`, then the portal reflecting the result —
wire the sync into `makeApp` with a **lazily-resolved closure** (the app's
`runSync` only ever runs during a request, long after `makeApp` resolved):

```ts
type Ctx = Awaited<ReturnType<typeof makeApp>>;
async function makeSyncApp(spendPages: { rows: SpendRow[] } | { rows: SpendRow[] }[] = { rows: [] }) {
  const pages = Array.isArray(spendPages) ? spendPages : [spendPages];
  const { query } = fakeQuery(...pages); // fake pg query from the metering tests
  let ctx: Ctx | null = null;
  ctx = await makeApp({
    runSync: () =>
      runMeteringSync({
        db: ctx!.db, query,
        litellm: ctx!.litellm.client, stripe: ctx!.stripeStub.stripe,
        markup: ctx!.cfg.markupMultiplier, creditUsd: ctx!.cfg.creditUsd,
        now: FIXED_NOW, // fixed clock keeps the 7-day scan cap deterministic
      }),
  });
  return ctx;
}
```

- **Signature pitfall**: accept `{ rows } | { rows }[]` (single page OR array).
  Declaring only the array form makes the natural call `makeSyncApp({ rows })`
  a TS2353 error — the per-file checker catches THIS one for real (unlike the
  tsconfig noise above).
- **Portal auth on a custom-configured app**: e2e's `authedApp` builds its own
  app; for apps built with extra deps (like `runSync`), seed the customer and
  run the magic-link dance against the SAME ctx — a `signIn(ctx, email)`
  helper: `POST /api/auth/request` → token from
  `mailer.sendMagicLink.mock.calls[0][1]` → `GET /api/auth/verify` → cookie.
- **The balance↔budget invariant assertion**: after ANY money path (sync
  deduct, webhook credit), assert `me.balanceUsd ===
  litellm.calls.budgets.at(-1)!.maxBudget` with exact `toBe` — both values
  round through `roundUsd`/`maxBudgetForCredits` so the doubles are identical
  even when the raw DB balance has float noise (`toBeCloseTo` for raw DB
  reads, exact `toBe` for the rounded portal/budget pair).
- **Admin bearer**: `headers: { authorization: \`Bearer ${cfg.litellmMasterKey}\` }`
  — reference the config value, never a hardcoded literal.
- Validate with the package's own toolchain: `npm run typecheck` (project
  tsconfig — note it EXCLUDES `test/`, so tests are only validated by running
  vitest) then `npx vitest run`.

See `references/billing-bridge-http-sync-tests.md` for the full
`test/balance-sync.test.ts` source (4 tests: sync→portal budget match, admin
stats incl. duplicates/unknown teams/checkpoint, auto-recharge webhook
immediate credit, checkout webhook immediate credit + provisioning).

## Testable service shape (works every time)

- `buildApp(deps)` factory: inject db, stripe, http clients, mailer, rate
  limiter, sync runner. Routes close over deps; tests pass stubs, prod passes
  real objects. This is what makes the whole service unit-testable.
- SDK *pure* functions are usable in tests with zero network:
  `new Stripe("sk_test_dummy")` is safe — `stripe.webhooks.constructEvent` +
  `generateTestHeaderString({payload, secret})` are local signature math.
  Compose a stub Stripe whose `webhooks.constructEvent` delegates to the real
  instance and whose `checkout.sessions.create` is a `vi.fn`.
- **Stub `checkout.sessions.create` must return UNIQUE session ids** — a local
  UNIQUE constraint on the session id 500s on the second call otherwise
  (const cost a test round-trip).
- **Test fixtures must satisfy your own validators.** A 400 `invalid_email`
  was caused by fixtures like `buyer@test` failing a TLD-dot regex — the body
  parsed fine. Check the fixture against the validator before suspecting the
  parse path (this one cost a full bisection of body-parsing that was never
  broken).

## Stripe setup-mode Checkout: `currency` is required (Stripe v22)

Stripe v22 requires `currency: "usd"` on **setup-mode** Checkout sessions
(`mode: "setup"`), even though setup sessions never charge a card. Without it
Stripe returns `Missing required param: currency.` (error 400, logged as
`stripe_setup_error`). This applies to both `createSetupSession` (signup) and
`createCardSetupSession` (add-card) — both need `currency: "usd"` in the
`stripe.checkout.sessions.create()` call.

## Authenticated portal testing via session cookie injection

When testing portal pages that render differently for authenticated users
(e.g. saved cards section, auto-recharge UI, security-assurance text), you
can bypass the Stripe Checkout redirect by injecting a session cookie directly
into the database:

1. **Create a session row** in the `sessions` table (token_hash, customer_id,
   expires_at at least 30d out).
2. **Sign the cookie** with `@fastify/cookie`'s HMAC-SHA256 format:
   `s:<raw_token>.<base64url_hmac(secret, raw_token)>`.
3. **Set the cookie** `bb_session=<signed_value>` on the client request.

The quickest way to run this from the server is `docker exec` into the
running container and run a Node script that uses the service's own
`better-sqlite3` and `crypto` modules (available at `/app/node_modules/`):

```javascript
const Database = require("/app/node_modules/better-sqlite3");
const crypto = require("crypto");
const db = new Database("/data/billing.db");
const token = crypto.randomBytes(32).toString("base64url");
const hash = crypto.createHash("sha256").update(token).digest("hex");
db.prepare("INSERT INTO sessions (customer_id, token_hash, expires_at) VALUES (?, ?, ?)").run(
  customerId, hash, "2026-09-18T00:00:00.000Z"
);
const h = crypto.createHmac("sha256", secret).update(token).digest();
const sig = h.toString("base64url").replace(/=+$/, "");
console.log(`bb_session=s:${token}.${sig}`);
```

Then verify the authenticated portal HTML with curl:
```bash
curl -s -b "bb_session=<signed>" https://.../portal | grep "expected text"
```

## Idempotent webhook pattern (payment / retried HTTP callbacks)

- **Apply exactly once**: the status flip (pending→completed) goes INSIDE the
  same DB transaction as the balance/effect bump; replays see `completed` and
  skip. Never credit outside the transaction.
- **Stepwise provisioning, each step guarded by its own column**
  (e.g. `team_id IS NULL → create; key_value IS NULL → createKey;
  emailed_flag = 0 → sendMail`). Each step commits independently, so retries
  converge without duplicate teams/keys/emails. Return 5xx until fully
  converged so the sender (Stripe) keeps retrying.
- Unknown ids: log + skip — never apply blind — EXCEPT money-relevant ones.
  An unknown `checkout.session.completed` means "paid but never credited":
  throw → 500 so Stripe retries and an operator investigates. Benign
  unknowns (expired sessions, unknown request ids) stay log+skip.
- **Crash window: write the pending row BEFORE the external call.** Insert
  the topup/order row (status pending, local placeholder id) before creating
  the Stripe session; update the real id after; mark `failed` if creation
  throws. A crash between session creation and the insert would otherwise
  produce a paid-but-never-credited customer with no row to reconcile.
- **Gate crediting on verified payment** (`session.payment_status === "paid"`),
  log-and-skip (200) otherwise so the sender doesn't retry forever. Handle
  async payment methods explicitly: `async_payment_succeeded` credits,
  `async_payment_failed` reverses (status-guarded, idempotent).
- Verify signature on the verbatim raw body and fail closed (401, nothing
  processed) on any verification error.

## SQLite (better-sqlite3) patterns

- On open: `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`;
  run `PRAGMA table_info`-based additive migrations for pre-existing DBs.
- Store comparable timestamps as ISO-8601 UTC strings — lexicographic order
  == chronological order (this powers checkpoint = `MAX(start_time)` with an
  overlap window for late rows + `INSERT OR IGNORE` dedupe by business key).
- **JOIN select pitfall**: `SELECT c.* FROM sessions s JOIN customers c ...`
  then checking `row.expires_at` returns `undefined` (c.* lacks the joined
  table's columns). Select explicitly: `SELECT c.*, s.expires_at`.
- **`UPDATE ... RETURNING` returns POST-update values** (SQLite behaves like
  Postgres here) — wiping a secret then `RETURNING key_value` yields NULL,
  not the pre-wipe value. For an atomic claim-and-read (reveal-once key
  endpoint), do read + guarded `UPDATE ... WHERE col IS NOT NULL` inside ONE
  synchronous better-sqlite3 transaction: sync statements can't interleave
  in-process, and the guard means a concurrent claim (even cross-process)
  sees changes = 0 → 404.
- **`patch` tool corrupts identifiers in small edits** — repeated patching of
  a TypeScript file in the same session causes the tool to progressively corrupt
  identifiers (e.g. `key_id` → `key_idid` → `keyey_id`, `stringified` →
  `stringringified`, `dict` → `dicts a dict`). After 3+ patches to the same
  file in the same session, use `write_file` with the complete file content
  instead. Always verify the written file with `grep -n '<identifier>' <file>`
  before committing. The TypeScript compiler will catch it, but only at build
  time — don't assume the file is correct based on the patch tool's diff output.
- **Chmod the DB file 0600 after open** (it may hold plaintext API keys):
  `chmodSync(path, 0o600)` when `path !== ':memory:'`.
- **`lastInsertRowid` returns 0 for upserts that match existing rows.** In
  better-sqlite3, `INSERT ... ON CONFLICT DO UPDATE` (or `INSERT OR REPLACE`)
  returns `lastInsertRowid = 0` when the row already existed and was updated
  rather than inserted. Using this as a FK reference in a subsequent insert
  (e.g. `topups.customer_id` referencing `customers.id`) produces a FK-violation
  500. Fix: after the upsert, SELECT the rowid with the real key (email, handle,
  etc.) in the same transaction. Never trust `lastInsertRowid` after an upsert.
- Additive migrations: `ensureColumn(db, table, col, ddl)` helper that
  re-reads `PRAGMA table_info` per column; backfill existing rows after
  adding a flag column (e.g. `key_provisioned = 1 WHERE key_value IS NOT NULL`)
  so legacy rows don't get re-provisioned.
- **`ensureColumnWithBackfill` variant**: when migrating to a new column that
  needs data backfilled from legacy columns, use a helper that runs the data
  backfill only when the column is first added (never on subsequent opens):
  ```typescript
  function ensureColumnWithBackfill(
    db: Database.Database, table: string, column: string,
    ddl: string, backfill: string | null,
  ): void {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((col) => col.name === column)) {
      db.exec(ddl);
      if (backfill) db.exec(backfill);
    }
  }
  // Example: backfill balance_usd from legacy credits column
  ensureColumnWithBackfill(db, "customers", "balance_usd",
    "ALTER TABLE customers ADD COLUMN balance_usd REAL NOT NULL DEFAULT 0",
    "UPDATE customers SET balance_usd = credits * 0.01");
  ```

## Money math

- Derive amounts from ONE source (the price/package table) and validate the
  invariant at startup (e.g. `credits × creditUsd == priceUsd`) — spec prose
  can contradict the price table ("unit_amount 100 × credits" vs $10 for 1000
  credits); the invariant catches drift instead of shipping a wrong charge.
- Overflow-guard money math: if the intermediate product can exceed the
  double range, `Math.ceil(raw*100)/100` yields Infinity → clamp to 0
  (garbage row, never charge Infinity). Guard `!Number.isFinite(rounded)`.

## Security hardening patterns (from the billing-bridge review pass)

- **Request-log redaction**: pino logs `req.url` verbatim, so magic-link
  tokens in query strings land in Fastify logs. Override
  `logger.serializers.req` — Fastify v5 passes the FastifyRequest
  (`.url/.method/.host/.ip/.socket`). Strip sensitive params with a per-name
  regex `(^|&)name=[^&]*` → `name=[redacted]` — do NOT round-trip through
  `URLSearchParams`, it percent-encodes the marker (`[redacted]` →
  `%5Bredacted%5D`) and reorders params. Type note:
  `FastifyLoggerOptions & PinoLoggerOptions` narrows to `never` on property
  access — declare a structural `LoggerOverride` type on AppDeps and cast the
  logger object to `Parameters<typeof Fastify>[0]["logger"]`.
  Test: inject `logger: { level, stream: { write: line => lines.push(line) } }`
  into `buildApp`, hit `?token=SECRET`, assert the captured lines lack it.
- **Per-IP rate limiting needs `trustProxy`**: `req.ip` behind a proxy is
  the proxy address unless `trustProxy: true`; gate it on an env
  (`TRUST_PROXY === "true"`) and wire it through compose. A second
  `RateLimiter` instance keyed on `req.ip` (10/hr) covers unauthenticated
  endpoints; keep the email-keyed one for magic links.
- **Timing-safe bearer compare**: hash BOTH sides with sha256 then
  `timingSafeEqual` (constant-length buffers, no length leak, no early
  exit). Plain `!==` on a bearer secret leaks timing.
- **Per-customer promise-lock mutex** (webhooks): `Map<number, Promise>`;
  chain `prev.then(fn, fn)` so the next delivery runs after the previous
  settles (success OR failure), store a settled copy in the map, delete it
  in a `.then` when it's still the current entry. Serializes in-flight
  Stripe retries so two deliveries can't both see unset columns and
  double-provision. Test with a gated stub (`await gate` inside
  `createTeam`) + two concurrent injects.
- **At-least-once side-effect flag**: set the sent/emailed flag BEFORE the
  side effect when a duplicate side effect is worse than a lost one (welcome
  email → key). A crash between send and flag would double-email; a failed
  send is logged and an alternative path (portal reveal) covers the customer.
- **Stripe SDK pin**: `Stripe.LATEST_API_VERSION` does NOT exist in
  stripe@22 — the constant is `Stripe.API_VERSION` (typed
  `typeof ApiVersion`). Verify the effective version in a test via
  `(client as any).getApiField("version")`.
- **Metering/sync scans**: never one unbounded query — cap the from-window
  (`MAX(fromIso, now - 7d)`) and keyset-paginate
  `WHERE startTime >= $1 AND (startTime > $1 OR request_id > $2)
  ORDER BY startTime, request_id LIMIT $3` with a cursor loop ending on a
  short page. Keep the checkpoint = `MAX(start_time)` logic intact.
- **Tool-output redaction vs on-disk truth**: this environment's tool output
  redacts secret-like strings and can mangle plain code in display
  (`afterKey.key_value` shown as `afterK...lue`, `string;` as `***`). Before
  "fixing" a file that looks corrupted, verify actual bytes — base64-encode
  the line (`python3 -c` + `base64.b64encode`) or `git show HEAD:path` —
  the working tree is almost always fine. A false "repo is corrupted"
  diagnosis wastes the whole session.

## Verification checklist

- `npm run check` (typecheck + tests), `npm run build` (prod tsc), then a boot
  smoke: `node dist/index.js` with dummy env (required secrets fail fast:
  STRIPE_*, SESSION_SECRET, SMTP_PASS, DATABASE_URL, PORTAL_BASE_URL), curl
  `/healthz`, exercise one happy + one fail-closed path, kill cleanly
  (SIGTERM handler: close app, db, pool).
- `npm audit` must show 0 vulnerabilities whenever deps change (review gates
  require it; `audit fix --force` is the upgrade path for breaking dep
  majors like nodemailer 8→9).
- Compose service: healthcheck via `node -e "fetch('http://localhost:PORT/healthz')..."`
  (node:alpine has no curl/wget), tailnet-only host port
  (`127.0.0.1:<host>:<port>`) unless the service is customer-facing, named
  volume for the SQLite DB, `depends_on` healthy conditions.
- Secrets: env NAMES only in code/compose; never log keys, tokens, secrets, or
  request bodies — structured logs with outcome codes only.
- When a spec/brief conflict appears, the SPEC document wins; accept both env
  spellings as fallbacks (`pick(env, ["SMTP_HOST", "BILLING_SMTP_HOST"])`)
  so briefs and specs both work.

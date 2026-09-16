# Worked example — billing-bridge audit (feat/billing-bridge, Aug 2026)

Full finding list from an adversarial audit of a prepaid-credits LLM-gateway billing
service (Node 22 + Fastify 5 + better-sqlite3 + stripe + nodemailer + pg). Verdict:
**PASS-WITH-FIXES** (no Critical). Use as a pattern for severity calls, verification
techniques, and report shape.

## Stack audited
Stripe Checkout → webhook → LiteLLM team + virtual key provisioning; magic-link auth →
30-day HMAC session cookie; metering sync reads LiteLLM_SpendLogs from shared Postgres
(credits = ceil(spend×200), cache hits free); SQLite (WAL) bridge DB; portal with
balance/usage/masked-key.

## Findings (as reported)
- **High — stored XSS sink** `src/portal.ts:214-216`: usage table built via
  `innerHTML` with `r.model` unescaped; model names originate from LiteLLM spend logs
  (influenceable via crafted `model` in a proxy request; failed-request rows are
  inserted with spend=0). Server-side rendering was fully escaped — the sink was
  client-side only. Caveat stated: end-to-end reachability depends on LiteLLM logging
  failed-request models; fix regardless. Escaping `<>&` is text-context-safe.
- **High — dependency** `package.json`: `npm audit` → 2 high, nodemailer@8.0.11
  (GHSA-p6gq-j5cr-w38f, fixed 9.0.5) + unused `nodemailer-postmark-transport` dragging
  it in. Noted as not exploitable via this code path (no `raw`/attachments passed).
- **Medium — webhook credits without `payment_status === 'paid'` check**
  `src/webhook.ts:45-83` (async payment methods fire `completed` pre-settlement).
- **Medium — magic-link token in application logs**: Fastify default req serializer
  logs `url: req.url` incl. query string (verified in
  `node_modules/fastify/lib/logger-pino.js`) → `GET /api/auth/verify?token=…` logged
  verbatim at INFO.
- **Medium — unauthenticated, unrate-limited `/api/checkout`** `src/routes.ts:139-145`:
  unbounded customer-row creation + Stripe session spam + magic-link spam primitive.
- **Medium — timing-unsafe admin bearer compare** (`!==` on master key) `routes.ts:290`.
- **Medium — reveal-once key endpoint race** `routes.ts:272-284`: concurrent GETs both
  return plaintext key (loser's `changes===0` unchecked).
- **Lows**: orphan LiteLLM team/key on concurrent webhook deliveries (provisioning
  outside the credit transaction); SQLite file perms not chmod 600 (DB holds plaintext
  keys — spec-mandated plaintext-at-rest noted as accepted risk); logout doesn't revoke
  server-side session row; no CSP/Referrer-Policy/X-Content-Type-Options headers;
  response-timing account enumeration on magic-link request (SMTP send awaited for
  existing customers); Stripe apiVersion not pinned; metering MAX(start_time) checkpoint
  + 2h overlap can permanently skip late/future-dated rows (revenue-loss edge);
  creditsForSpend overflow to Infinity for near-MAX_VALUE spend.

## What was verified clean (non-issues)
- Webhook: fail-closed 401 tested (missing + bad sig), raw body verbatim, SDK
  timestamp tolerance blocks replay, idempotent credit in SQLite transaction + UNIQUE
  stripe_session_id (3 replays → 1 credit, tested), unknown sessions never credit.
- Auth: 32-byte base64url tokens, SHA-256-only storage, 15-min TTL, one-time via
  guarded UPDATE (TOCTOU-safe), generic enumeration response, 5/hr/email limiter.
- Sessions: HMAC-signed HttpOnly+Secure+SameSite=Lax, server-side hashed rows +
  per-request expiry, fresh token per login.
- Metering: parameterized pg ($1), INSERT OR IGNORE + deduct-only-on-insert,
  cache-hit=0 incl. nonzero spend, negative/non-finite spend → 0, unknown team skipped.
- SQLite: WAL + foreign_keys ON; zero string-interpolated SQL in src (grep).
- Secrets: grep clean; compose `${ENV}` interpolation only (raw-byte verified — the
  `***` in displayed `DATABASE_URL` was `${POSTGRES_PASSWORD}`, not a literal);
  .env.example placeholders only.
- SSRF: no user-controlled URLs anywhere.
- Ops: Dockerfile multi-stage + non-root USER node; dist/ gitignored; 50/50 tests pass.

## Verification techniques that worked
- `od -c <file>` (xxd absent) to resolve redaction-artifact scares — grep/read_file
  output redacts secret-like identifiers (`key_value` → `...`, `${POSTGRES_PASSWORD}`
  → `***`). The file was fine; the display was not.
- `npm audit` (full + `--omit=dev`) for dependency risk; grep imports to prove an
  audit-flagged dep is unused.
- Grep for SQL interpolation (`prepare(\`|query(\`|exec(\``) to prove parameterization.
- Read `node_modules/<pkg>/lib/*.js` to verify framework defaults (log serializers)
  instead of assuming.
- `npm run check` (typecheck + vitest) run inside the worktree — green suite is
  evidence; also confirms suspicious-looking source actually compiles.

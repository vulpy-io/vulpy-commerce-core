# Worked example: gateway/billing CTO review pack (2026-09-11)

A concrete instantiation of the method — the Vulpy LLM gateway + billing bridge reviewed for the
CTO (integrity/security/reliability).

## The doc skeleton used

`.work/cto-review-pack/`:
`00-README.md` → `01-overview.md` → `02-security.md` → `03-integrity.md` → `04-reliability.md`
→ `05-testing.md` → `06-open-risks.md` → `07-verification.md` → `08-walkthrough-notes.md`.

README carried: the stamp legend, an evidence snapshot table (endpoint → status, container
health, DB aggregates, git state, watchers, all stamped ✅ live), and a one-paragraph verdict.

## Evidence gathering (all read-only)

Public surface (no auth): `curl -sI https://gateway.vulpy.io/health` → 401; `billing.vulpy.io`
+ `/healthz` → 200; `gateway.vulpy.io/ui` → 404.

Live box (via tailnet): 15 containers healthy incl. `litellm-blue`/`-green`, billing-bridge,
Langfuse (+ClickHouse), Metabase, Prometheus, Grafana; git clean on `main`; Caddy routes
`gateway.vulpy.io → 127.0.0.1:14001` (green active).

Money truth files: `/app/sell_rates.json` + `/app/buy_rates.json` inside the bridge container;
`buy_rates.json` head shows per-alias `input_per_million` etc. Alias chain in
`gateway/config/litellm-config.yaml`: `vulpy-default → vulpy-default-or → vulpy-default-entrim`
(Nous → OpenRouter → Entrim), `allowed_fails: 3`, `cooldown_time: 30`.

Billing DB aggregates (no PII, dated snapshot):
```sql
SELECT (SELECT count(*) FROM customers),(SELECT count(*) FROM topups),(SELECT count(*) FROM usage_events);
-- 6 | 14 | 7239
SELECT round(COALESCE(sum(amount_usd),0)::numeric,2),
  (SELECT count(*) FROM topups WHERE status='completed'),
  (SELECT count(*) FROM topups WHERE status <> 'completed') FROM topups;
-- 370.00 | 11 | 3
SELECT round(COALESCE(sum(charged_usd),0)::numeric,2), count(*),
       round(COALESCE(sum(spend_usd),0)::numeric,3) FROM usage_events;
-- 267.58 | 7239 | 204.358   → blend margin ≈ +31%
```
SpendLogs span: `SELECT min("startTime"), max("startTime"), count(*) FROM "LiteLLM_SpendLogs";`
→ 2026-08-21 .. now, 53,159 rows. Git secrets: `gh secret list` → DEPLOY_SSH_* present,
**STAGING_SSH_HOST absent** (real finding: automated staging→live CI blocked).

## Real findings surfaced (the trust-earners)

- 🔴 `STAGING_SSH_HOST` missing from GH secrets → staging→live CI path cannot run. Verified
  via `gh secret list`; workflow references `secrets.DEPLOY_SSH_HOST` only.
- 🟡 No DR/restore drill for billing-postgres (backups exist; no evidence of a tested restore).
- 🟡 Balance integrity app-enforced, not DB-enforced: no `CHECK (balance_usd >= 0)`, no audit
  table (confirmed absent from migrations).
- 🟡 No WAF/rate-limit at the edge (Cloudflare DNS-only; NLB → Caddy path-gated).
- 🟢 Stale doc-vs-code: `docs/billing-bridge-spec.md` describes the superseded v1 credits model;
  live is Design B — verified from running source.

## Probe gotchas encountered

- `docker exec -T` not available → use `docker exec -i <ctr> psql -U <user> -d <db> -c '...'`.
- Postgres REAL has no 2-arg `round()` → cast: `round(COALESCE(sum(x),0)::numeric,2)`.
- First deny-of-column (`balance_usd does not exist` on `usage_events`) was CORRECT — balance
  lives on `customers`; introspect with `\d <table>` before querying.
- Resolve tailnet name from the container via dnspython against `100.100.100.100`
  (`gateway-live.tail873f17.ts.net` → `100.67.193.116`), then `ssh -i /app/.ssh/id_ed25519_gateway
  ubuntu@<tailnet-ip>`. Public SSH is closed; NLB IP port 22 times out — that is expected, not
  "host down".
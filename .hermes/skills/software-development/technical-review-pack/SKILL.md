---
name: technical-review-pack
description: "Prepare evidence-stamped review materials (integrity, security, reliability) for a technical reviewer or leadership — usually a CTO/architect reviewing a live platform. Marks every claim with a verification tier, separates honest gaps from verified strengths, and ships a reviewer runbook."
---

# Technical Review Pack

Use when the operator asks to prepare materials explaining a platform/component to a technical reviewer (CTO, architect) so they can review **integrity, security, reliability** — and when any leadership-facing soundness brief must survive independent probing.

## Core method

1. **Ground truth first.** Find the actual checkout/repo, live endpoints, and governing skills BEFORE writing. Never build the pack from memory or docs alone — the reviewer will probe.
2. **Stamp every factual claim with an evidence tier:**
   - `✅ verified-live` — ran it against the prod box/DB/API this session
   - `📦 verified-repo` — confirmed in checked-out source
   - `📄 skills/incident` — from skill/incident history
   - `⚠️ unverified` — could not confirm; never assume true
   Unstamped claims are inferences from stamped ones — say so.
3. **Structure — one doc per concern axis + index + runbook + talking track:**
   ```
   00-README.md         index, stamp legend, evidence snapshot, one-paragraph verdict
   01-overview.md       topology, money/request path, component map
   02-security.md       public surface, TLS, keys/secrets, admin access, threat model
   03-integrity.md      the money/ledger model, invariants, tamper analysis
   04-reliability.md    availability design, deploys, fallbacks, monitoring, incident history
   05-testing.md        what tests actually prove — and what they don't
   06-open-risks.md     honest gap list, rank-ordered, verified vs unverified
   07-verification.md   reviewer runbook: exact read-only commands + expected outputs
   08-walkthrough.md    talking track + likely Q&A for the review meeting
   ```
4. **Lead with honesty.** The open-risks doc is the trust-earner. Put real gaps front and center — the reviewer will find them anyway, and finding them first makes the pack credible.
5. **Reviewer runbook discipline:** every probe read-only; expected output from the evidence snapshot; redaction rules (names/paths/existence only, never key values or PII); number consistency between prose and raw SQL.
6. **Fix the source of truth, not just the pack.** Doc-vs-code drift you discover is a finding IN the pack and a correction to the skill/memory that carries the wrong model.

## Precision bar (operator's explicit demands)

- **"Be very precise and accurate."** Verify money/model claims against RUNNING source (`src/metering.ts`, live config, live DB), never from docs/briefs — a stale spec will be quoted back at you (earned 2026-09-11: quoted the v1 "credits" spec as live; live is Design B, sell_rates/charged_usd).
- **Before asserting something is missing** (secret, key, column, host reachability), verify via the authoritative interface: `gh secret list`, `\d <table>`, resolve the tailnet name. A guessed claim that turns out wrong erodes the whole pack.
- **A probe against a public IP timing out is NOT evidence the host is unreachable** when admin access is tailnet-only. Check the governing skill's connection section for the tailnet name + key name first (earned 2026-09-11: "SSH is there and live is there, so check again").
- **No secrets, no PII.** Aggregates only. Key names yes, values never.
- **Deliverable format — "zip" means a real .zip.** When the operator asks to zip the pack, produce a `*.zip` (Python `zipfile`, or `zip` if present), not `tar.gz` — the operator corrected tar.gz → zip on 2026-09-11. If `zip` is missing, use `python3 -m zipfile`-style `zipfile` writing; verify the archive contents after creating it.

## Pitfalls (earned)

- **Stale doc as live model:** check the RUNNING artifact (baked config, shipped columns, live SQL) before quoting any documented model. `docs/billing-bridge-spec.md` describes a v1 credits model that is NOT what runs.
- **Unknown column → introspect first:** `\d <table>` or `information_schema` before querying. Postgres REAL columns have no 2-arg `round()` — cast: `round(COALESCE(sum(x),0)::numeric, 2)`.
- **Non-TTY psql via docker:** `docker exec -i <ctr> psql -U <user> -d <db> -c '...'` (stdin form) is portable; the `-T` flag is not available on every CLI version.
- **Live systems shift between queries:** snapshot all aggregates in one window and date-stamp them; anchor comparisons at a checkpoint (e.g. metering `MAX(start_time)`).
- **"Could not resolve repo" ≠ repo missing:** check `.tmp/` worktree clones and the skills' stated clone paths (e.g. `.tmp/platform-superprivate`).

## Money-margin verification hierarchy (earned 2026-09-11 — three wrong margins in one session)

When the pack must state a **margin / markup / buy-vs-sell** figure — the single most
scrutinized number a CTO reviews — follow this trust ladder, highest first:

1. **The operator's / provider's stated bill** — highest. When your computed number
   contradicts it, re-check your rate files; never defend your number.
2. **Provider-reported cost** (e.g. `usage.cost_details.upstream_inference_cost`, or a
   telemetry `provider_cost_source="provider_reported"` field).
3. **Calculated from a rates file** (e.g. tokens × `buy_rates.json`, telemetry
   `provider_cost_source="calculated"`) — **suspect until the rates file is verified**.
   Rates files are corruptible (earned: a runtime `buy_rates.json` with HALF rates for
   `-or` aliases made "calculated" cost understate reality ~2.6x, yielding a false 6.59x
   margin; the operator's real provider bill was $16.46 → true margin 2.54x).
4. **Never:** LiteLLM `SpendLogs.spend` — it floors custom models at $0.00005 and misprices
   cache; agreement with reality is coincidence.

Rule: **always check the provenance tag on a cost figure before quoting it as money, and
state the provenance in the pack.** A "calculated" buy with a broken rates file is worse
than no number — it's a confident wrong number that erodes the whole pack when caught.

## Corrections reset trust — re-verify to the END of the session

A number the operator "settles" can be un-settled minutes later by a better source
(earned 2026-09-11: 2.54x from SpendLogs → 3.28x from stale rates → 6.59x from the
"calculated" field → **2.54x final** once the operator stated the real OpenRouter bill).
Every time you report a figure that later changes, **fix every artifact that carries it in
the same turn** — pack prose, tables, runbook expected-outputs, memory, and the skill —
so the next session starts from the final truth, not the first confident guess. When the
operator corrects you, say plainly what was wrong and what the corrected number is; never
paper over the intermediate steps.

## Temporary security-state changes belong IN the pack as a must-revoke risk

When the operator asks for a temporary relaxation (e.g. "open port 22") to let the reviewer
in, capture it as a first-class risk with: the exact artifact that must be reverted
(security-group rule + revoke command), the "why it was opened" context, and a visible
⚠️ banner in the README evidence snapshot + security doc. The pack must make it impossible
to miss that a deliberate hardening is suspended. (Earned 2026-09-11: public TCP/22 opened
from 0.0.0.0/0 on the live gateway SG; logged as Risk 20 with the exact revoke CLI.)

## Sell-side billing verification (independent of any spend column)

To prove the billing ARITHMETIC is correct without trusting any cost/spend column:
reconstruct the sell per row from raw token counts × the sell-rate formula
(`sell = (prompt − cached)·input + cached·cache + completion·output`, cache tokens from the
provider usage metadata), compare to the ledger `charged_usd`; ratio 1.0000 to 4dp = correct.
This is the check that settles "did the engine charge the right amount" — separate from
"is the price right", which is the margin hierarchy above.

## Reference

`references/cto-gateway-review-example.md` — worked example: the gateway/billing CTO pack (doc skeleton, read-only probe list with expected outputs, the real findings surfaced).

`references/buy-cost-drop-investigation.md` — why telemetry "calculated" buy cost fires even when the provider HAD cost data (LiteLLM drops `cost_details` for some OpenRouter routes; only ~400/57k rows ever `provider_reported`), the request_id-binding + metadata-check + JSONL source-audit forensics, and the two-part fix (buy_rates CI guard + preserve cost through the callback chain).
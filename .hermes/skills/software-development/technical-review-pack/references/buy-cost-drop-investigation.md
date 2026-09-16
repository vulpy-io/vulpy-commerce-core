# Buy-cost drop: why "calculated" fired when the provider HAD cost data

Root cause from the 2026-09-11 GLM-5.2 writer-session investigation, what to check,
and the fix. Distilled so a future money-discrepancy hunt starts from the mechanism,
not from recomputing margins from scratch.

## Symptom

Operator's real provider bill: $16.46 (OpenRouter, GLM-5.2, 60 calls).
Telemetry reported `provider_cost_buy_usd` = $6.34 with `provider_cost_source`
= "calculated" — a ~2.6x understatement that produced a false "6.59x margin" (true 2.54x).
LiteLLM itself "was calculating correctly" (its SpendLogs.spend matched the bill).

## Mechanism (verified)

The normalizer's `buy_cost_from_usage()` (telemetry/vulpy_buy_cost.py) priority is:
1. `usage.cost_details.upstream_inference_cost` (provider-reported) → elsewhere
2. `_hidden_params` provider cost
3. tokens × `buy_rates.json` → **"calculated"**

For the GLM-5.2 calls, step 1 found NOTHING:
- Persisted SpendLogs `metadata` for those rows had **no `cost_details` block at all** —
  only `usage_object.cost` (SELL-side, $0.54) and `cost_breakdown` = all $0.00 (LiteLLM had
  no cost map for `openai/z-ai/glm-5.2`).
- So the fallback was the ONLY option the normalizer had — and the fallback was double-broken:
  (a) the runtime `buy_rates.json` had **half** the real rates for `-or` aliases
      (writer-or $0.4875/$1.56 vs ~$0.975/$3.12), understating cost ~2x;
  (b) persisted `usage_object.prompt_tokens_details.cached_tokens` was **0** even for the
      cache-heavy calls, so the cache discount was lost too — understating further.
  Net: $16.46 → $6.34.

Across all 57k+ telemetry rows, only ~400 ever carry `provider_reported`. So the "drop" is
the NORM for some OpenRouter model routes — LiteLLM is not reliably forwarding
`usage.cost_details` through the callback chain.

## What to check first (instead of recomputing margins)

For the window in question:

1. Match SpendLogs rows by `request_id` (SpendLogs.model = upstream deployment, e.g.
   `openai/z-ai/glm-5.2`; the alias lives in `model_group` — `WHERE model='vulpy-writer-or'`
   finds 0 rows and sends you down a rabbit hole).
2. Dump one row's full `metadata` — look for a `cost_details` / `usage.cost_details`
   block, and whether `cost_breakdown` is zeroed.
3. Global source audit in the JSONL:
   `python3 - <<'PY'` … count `provider_cost_source` values + whether
   `provider_reported` EVER appears for the alias in question (writer-or: 0; default-or: 100).
   That pins the drop to a route.
4. Only then check rates/cache: runtime `/data/vulpy-telemetry/buy_rates.json` values for
   the alias (NOT your memory of them — the hourly refresh rewrites in place), and the
   `cached_tokens` numbers the normalizer saw.

## Fix (both, not one)

1. **Repair `buy_rates.json`** (the `-or` aliases were half of correct) AND add a CI guard:
   for every alias, `sell_rate/buy_rate` must land in a sane band (e.g. [1.1x, 10x]) —
   a halving breaks the band loudly instead of silently corrupting margins.
2. **Make the normalizer see the provider cost**: preserve `usage.cost_details` through
   LiteLLM's callback chain (or also consult `_hidden_params` provider cost), and guard the
   `cached_tokens` extraction shape so cache discounts don't silently vanish. Until then,
   treat any "calculated" buy as a red flag, not an answer.
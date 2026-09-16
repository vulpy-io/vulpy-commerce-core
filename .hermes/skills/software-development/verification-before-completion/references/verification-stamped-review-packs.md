# Verification-stamped exec review packs (live-platform integrity review)

Pattern: building decision materials for a reviewer (CTO, security, board) to assess a
LIVE platform — integrity, security, reliability, money flow. The pack earns trust by
stamping every claim with how it was verified, and by leading with the honest gaps.

## Evidence model — the three stamps

| Stamp | Meaning | Example |
|---|---|---|
| ✅ repo/code-verified | Read the actual source (not docs) | `src/metering.ts` charges `sellPrice()` not `SpendLogs.spend` |
| 🟡 skill/incident-history | Known from past incidents, not re-proven this session | cumulative-budget false-429 behavior |
| 🔴 needs-live-confirmation | Can't reach the box / not yet probed | current DB row counts |

The stamps are the integrity story. A review pack with all ✅ and no 🔴 is either a
trivial system or a pack that overstates itself — reviewers know this.

## "The box is unreachable" is a CLAIM — verify it

Failure mode (2026-09-11): I asserted the live US gateway was unreachable "as
expected" because public SSH on the NLB IP timed out. It was NOT unreachable — the
correct path is over the Tailnet (resolve `gateway-live.tail873f17.ts.net` via
dnspython against `100.100.100.100`, user `ubuntu`, key `id_ed25519_gateway`), and
public-IP failure is BY DESIGN (SSH hardened to tailnet-only 2026-09-03). The
operator: "Ssh is there and live is there, so check again. If your skill is missing
it, add the key name that you use."

Rules:
- A single failed path is not proof of unreachability — enumerate the access surface
  (public IP, tailnet name, key set in `/app/.ssh/`, host aliases in `~/.ssh/config`)
  before declaring a box down.
- Reachability errors are claims → apply the Gate Function. The authoritative source
  for "how do I reach this box" is the skill (`fox-remote-ssh-paramiko` +
  `llm-gateway-operations`), and it should name the exact key file.
- A wrong probe (public NLB IP instead of tailnet) is a false negative — say what you
  actually probed, not just "unreachable".

## Money-model claims: code + running box are ground truth, docs are NOT

Failure mode (2026-09-11): I presented `spend×200→credits` as the live money model,
quoting a stale v1 task spec. The operator: *"where the fuck does this come from? We
don't have any fucking credits"*. The live model (Design B) is a USD balance charged
at our `sell_rates.json` sell price, buy side from `buy_rates.json` — no credits
product at all. See `billing-bridge-development` →
`references/design-b-money-model-and-stale-spec-trap.md` for the verified snapshot.

Rules:
- For money/integrity claims, read the RUNNING code (`src/metering.ts`,
  `src/sell-rates.ts`, `src/credits.ts`) and the box artifacts, not design briefs.
- Stale docs are a FINDING, not a source. Doc-vs-code drift is itself a
  first-class integrity item a reviewer wants surfaced.
- When in doubt, name your evidence source per claim ("from repo X at commit Y") so
  a wrong claim is traceable and correctable.

## Research before design (this session's failure to do so)

I started to present a review-pack design after shallow research — the operator
corrected me twice: re-check the box AND the money model. Both corrections exposed
that I had built a mental model on stale assumptions (unreachable box; credits
spec) instead of probing the source. Sequence that avoids this:
1. Locate the ground-truth checkout(s) and reachable boxes FIRST.
2. Verify the headline claims (money model, topology, budget semantics) from the
   box/repo before proposing any design.
3. Only then present structure + open questions.

## Pack structure that worked for this class

```
00-README.md            map: what each doc covers + how to read/verify
01-overview.md          topology + money flow at 30k-ft
02-security.md          threat model + actual posture (keys, edge, admin, secrets)
03-integrity.md         money/ledger invariants, idempotency, reconciliation
04-reliability.md       availability story: fallback chains, deploys, incidents
05-testing.md           what's proven: suites, RED tests, gaps
06-open-risks.md        HONEST gap list — the doc that earns trust
07-verification.md      live probe runbook (exact commands, no secrets)
08-walkthrough-notes.md talking track for the review meeting
```

- Lead with (or prominently include) the honest-gaps doc — it is what makes the
  rest credible.
- One doc per concern axis so the reviewer can jump straight to their question.
- Ask the reviewer's PRIMARY GOAL up front (sign-off / handover / hard audit /
  cost review) when possible; when unknown, build the all-goals pack with the
  hard-audit lean — trust packs read skeptically.
- Live probes: read-only, no secrets, exact commands + expected outputs; if a box
  can't be reached, the runbook still documents the intended command so the
  review can run it from their own seat.
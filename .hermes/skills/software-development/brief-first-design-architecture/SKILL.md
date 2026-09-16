---
name: brief-first-design-architecture
description: "Use when handing a product/portal UX request to designer or architect. Freeze discovery once, cap research, and pass a compact evidence packet so expensive roles create or validate instead of re-reading the codebase."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [design, architecture, delegation, cost-control, briefs]
    related_skills: [factory-ops, vulpy-impeccable-designer, plan]
---

# Brief-First Designer and Architect Workflow

## Rule

**Fox discovers; designer creates; architect validates; coder implements.**
Never ask an expensive specialist to rediscover facts Fox can package once.

## Phase 0 — Fox evidence packet

Before delegation, create one compact packet (max 600 words / 12 bullets):

- objective and success condition;
- target surface and non-goals;
- relevant file paths and exact existing behavior;
- reusable assets / design tokens / API constraints;
- known decisions and open decisions;
- one screenshot or direct visual reference when available;
- output contract and file destination.

Use direct reads/searches only. Do not paste whole files. A packet is complete when a specialist could work without exploratory repo searches.

## Phase 1 — Designer (creative only)

Give the designer the packet plus only the assets explicitly named in it.

**Default tool budget:**
- 0 repository searches;
- 0 web searches;
- at most 2 reads (only named files);
- at most 1 visual/browser check;
- 1 concept per turn unless the operator asks for variants.

Output is a **standalone static concept** on disk, never production code:
`/tmp/designs/<feature>/<concept>.html` with inline CSS/JS and local asset paths.
Use `render_preview` to preview the saved path. Do not inspect implementation source, run builds, or modify product files.

If required input is missing, return one concise `DESIGN INPUT NEEDED:` item. Do not research around it.

## Dispatch discipline

Designer and architect runs **always** go through their named profile wrappers
(`hermes-designer` → `-p designer`, `hermes-architect` → `-p architect`), which
select the configured premium model (`vulpy-cutting-edge` / Kimi K3 for
designer; the explicitly configured architect model for architect) routed
through provider `vulpy` (the US Vulpy gateway), and pre-load the role's
skills. Invoke the wrapper with its prompt argument; if it is not on `PATH`,
use its provisioned location (for this product, `/app/.local/bin/hermes-designer
"<prompt>"`). For a direct CLI fallback, preserve Hermes' command shape:
`hermes -p designer chat -s <skills> -q "<prompt>"` — passing the prompt straight
to `hermes -p designer` is not a valid invocation. **They are never invoked via `delegate_task`.** `delegate_task` is
**scout-only** — those children run the cheap `vulpy-default` model and
inherit whatever profile the caller runs under; using them for
designer/architect work silently downgrades a premium-specialist session to
`vulpy-default` and loses the role's profile, model, and skill pre-load. If a
premium specialist must run, dispatch through the wrapper / profile process,
not a scout.

**Profile routing pitfalls (verified 2026-08-22):**
- Designer/architect profiles must have `provider: vulpy` in their `config.yaml` `model:` block. Without it they silently inherit the caller's provider, which may be Codex or a stale EU gateway key rather than the US Vulpy gateway.
- `delegation.base_url` in the root Hermes config directs the scout delegation provider, NOT the named profiles. Do not set `delegation.base_url`; let it resolve from the provider plugin. Setting it breaks scout credentials (they pick up a custom-provider path with no matching key).
- Verify profile routing actually used the US gateway by checking `LiteLLM_SpendLogs` for a real spend row on the US box. A wrapper responding correctly is not sufficient evidence — it might have used a fallback/EU path.
- `delegate_task` children confirm `SCOUT_OK` via text; the **real** test for K3 use is a SpendLog row with `model LIKE '%kimi%'` on `gateway.vulpy.io`.

Premium model use is proven **only** by the named profile's config carrying
`provider: vulpy` (plus its role model) AND a corresponding US-gateway
telemetry row resolved to that upstream model. A wrapper existing, a profile
model name, or a successful direct alias smoke is **not** proof the specialist
ran on the premium model. `delegate_task` children are never premium-model
evidence.

When Fox says a scout, designer revision, or architect pass is being sent, invoke that delegation in the same turn. Do not narrate a handoff and wait for the operator to ask whether it is in flight. **"I'm sending it back to the designer" is not enough — the tool call must be in the same response.** The same rule applies to QA verification: when a design or code artifact passes visual inspection, launch the next step without asking. Proactive dispatch is the contract.

## Phase 2 — Operator decision

The operator reviews a preview and approves one concept or requests a specific change. No architect or coder starts before a concept is selected, unless the user explicitly skips design.

## Phase 3 — Architect (implementation delta only)

Give architect:
- the same evidence packet;
- the approved concept path;
- the current production files affected;
- explicit policy/security constraints.

**Default tool budget:**
- no web research;
- no broad repo search;
- max 3 named file reads;
- no code writes.

Output: an implementation delta only — data/API changes, file list, risks, tests, migration/rollback. It must not restate visual choices or re-plan product strategy.

If discovery is genuinely required, architect returns a bounded request: exact question + exact path/source needed. Fox performs it and sends an addendum.

## Phase 4 — Coder

Coder receives the approved concept plus architect delta. Coder owns adapting the concept to production surfaces and tests. Designer never writes production code.

## Cost controls

- Use the premium design/architecture model only for creation or validation, not reconnaissance.
- Treat the packet as a tool budget, not a suggestion: specialist calls outside it need a Fox-supplied addendum with the exact missing source.
- For previews, the designer writes the concept to disk and calls the path-based `render_preview` frontend tool; never paste a full HTML document into tool arguments or rely on streamed `MEDIA:` placeholders.
- One specialist turn per artifact; follow-ups contain only a diff/change request.
- A failed tool or missing asset does not justify open-ended exploration.
- If a specialist exceeds its budget, stop and return the required missing input.

## Billing portal design constraints (standing policy)

- **Cache-hit requests are paid usage** — never present them as free or zero-charge in any concept, portal copy, or evidence packet.
- Public model names in portal are product aliases only (`Vulpy Default`, `Vulpy Cutting Edge`, etc.); never expose upstream provider identifiers (`DeepSeek`, `Kimi K3`, `Claude`).
- Balance is pure USD; no credits abstraction in customer-facing copy.

## Completion checklist

- [ ] Packet exists before specialist dispatch.
- [ ] Designer output is a disk-backed static concept, not production code.
- [ ] Operator selected a concept before architecture/coding.
- [ ] Architect plan is a delta, not another discovery memo.
- [ ] Coder receives assets + approved concept + plan in one handoff.

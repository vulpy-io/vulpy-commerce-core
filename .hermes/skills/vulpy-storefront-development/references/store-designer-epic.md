# Store Design Studio — Architecture and Impeccable Integration Reference

Researched 2026-08-01 against Vulpy Commerce, Impeccable 3.5.0, and the current Hermes Sessions/Runs API. Re-verify upstream protocol/version details before upgrading the pinned dependency.

## Product decision

Do not build a generic drag-and-drop page builder and do not treat Impeccable as one. The product loop is:

```text
commercial storefront baseline
  → universal DTCG tokens
  → deterministic Payload theme controls
  → signed storefront preview
  → Impeccable local visual feedback/variants
  → Fox minimal source edit + validation
  → explicit diff approval
  → explicit commit / optional PR / normal deployment
```

Track A (baseline and tokenization) must land before Track B (operator customization). A theme picker on an unpolished template only multiplies bad variants.

## Ownership boundaries

| Concern | Owner |
|---|---|
| Products, prices, inventory, cart, checkout | Medusa |
| Copy, media, block order, merchandising | Payload |
| Accepted theme contract and values | Git-tracked DTCG files |
| Theme drafts, sessions, approvals, audit | Payload |
| Picker, annotations, local variants, accept/discard UI | Impeccable browser layer |
| Feedback classification, code/token/content edits, checks | Fox/Hermes |
| Preview process/worktree lifecycle | Narrow host `pnpm vulpy designer` commands |
| Commit, PR, deployment | Separate explicit operator actions |

Payload is the draft/control plane, not the sole accepted-theme authority. Generated CSS, Tailwind aliases, `DESIGN.md`, and `.impeccable/design.json` are projections and must fail CI on drift.

## Canonical token system

Use DTCG Format Module 2025.10 shapes and aliases. Prefer partitioned canonical files:

```text
apps/storefront/design/
  tokens/reference.tokens.json
  tokens/semantic.tokens.json
  tokens/component.tokens.json
  themes/store.tokens.json
  editor.registry.ts
  identity.md
```

Layers:

1. **Reference/primitives:** brand/neutral/status ramps, font families and metrics, spacing, radii, shadows, motion, containers.
2. **Semantic/system:** surfaces, content, borders, focus, actions, statuses, commerce price/stock, typography roles, layout rhythm.
3. **Component aliases:** header, buttons, fields, hero, product card/media/price, badges, filters, drawers, cart/checkout summary, footer.
4. **Content/composition:** remains Payload data; it is not a token layer.

Operator-safe controls should be curated: brand/accent seed, canvas tone, approved self-hosted font pairing, radius profile, density, content width, section rhythm, product-card/button treatment, media ratio, and motion level. Keep raw CSS, arbitrary URLs, z-index, breakpoints, focus removal, pointer-target size, and critical error semantics locked.

## Current Impeccable integration baseline

Source-verified at `pbakaus/impeccable@c5e1ddd` / npm 3.5.0:

- Apache-2.0; Node `>=22.12.0`.
- npm tarball contains the CLI/detector; `skills install` downloads provider bundles.
- 59 deterministic detector rules with JSON output.
- Live mode supports selection, annotations, insert/replace, generate/steer, variants, coarse parameters, manual-edit batches, accept/discard, durable journal, resume, and cleanup.
- Browser chrome is injected plain DOM with Shadow DOM. It is not a registered custom element.
- `window.__IMPECCABLE_LIVE_UI_ROOT__` selects its mount root.
- Events include `generate`, `steer`, `accept`, `discard`, `prefetch`, `manual_edit_apply`, `variant_mount_failed`, and `exit`.
- The helper currently binds loopback and assumes `http://localhost:<port>` in browser/CSP flow. Remote Vulpy use requires a same-origin relay or upstream configurable browser base/transport.
- Upstream has no Hermes provider at this baseline.

### Installation

Evaluation:

```bash
npx -y impeccable@3.5.0 detect apps/storefront --json
npx -y impeccable@3.5.0 skills install --providers=agents --scope=project
```

Permanent project setup:

```bash
corepack pnpm add -Dw impeccable@3.5.0
corepack pnpm exec impeccable skills install --providers=agents --scope=project
corepack pnpm exec impeccable detect apps/storefront --json
```

**CLI safety note (verified with 3.5.0):** `impeccable install --help` is not a read-only help probe. It enters the installer and can install into every detected harness (`.claude`, `.cursor`, `.agents`, `.github`) using prompt defaults. Use top-level `impeccable --help` for command discovery, inspect the pinned package/source for installer flags, or probe installation in a disposable directory. In automation, pass the explicit provider/scope command above and verify the resulting paths rather than relying on detected-harness defaults.

The universal provider bundle lands under `.agents/skills/impeccable`. Add a checked-in `.hermes/skills/vulpy-impeccable-designer` adapter that references/synchronizes that bundle and adds Vulpy policy: explicit instance, tenant/worktree derivation, ownership classifier, safe routes, generated-file rules, validation, and no auto-commit.

For a disposable local Next App Router spike from `apps/storefront`, configure `.impeccable/live/config.json` with `src/app/(site)/layout.tsx`, then use the installed provider scripts:

```bash
node ../../.agents/skills/impeccable/scripts/live.mjs --target .
node ../../.agents/skills/impeccable/scripts/live-poll.mjs
node ../../.agents/skills/impeccable/scripts/live-status.mjs
```

Always follow the helper's returned `_instructions` for the active session.

### Product bridge

Do not repeatedly inject production layout source. Add a stable `DesignSessionBridge` rendered only after server-side signed-session validation. It loads Impeccable chrome through a same-origin, path-allowlisted relay that maps the public design session to the internal helper.

Never expose the helper port, Hermes key, Git credentials, or internal helper token to the browser. Prefer an upstream contribution for configurable browser base/transport; if a temporary dependency patch is unavoidable, pin it, checksum it, contract-test it, and remove it once upstream ships support.

## Payload Design Studio

Extend the existing Payload live-preview/draft-mode path. Recommended admin surface:

- page/route selector and device presets
- deterministic theme controls and instant iframe updates
- selected-element feedback and annotations
- Fox progress/checks
- variant comparison
- diff grouped by token/content/source/generated files
- explicit accept, approve, commit, PR, and deployment states

Recommended internal records:

- `design-sessions`: server-derived shop/instance, route, base commit/theme revision, worktree handle, Hermes/Impeccable ids, expiry/status
- `design-drafts`: validated token overrides/component presets with versions
- `design-events`: append-only, idempotent, sanitized events
- `design-publications`: approval, diff digest, checks, commit/PR/deployment/rollback references

Deterministic controls never call Fox. Invoke Fox only for natural-language intent, annotations, component variants, structural changes, or ownership ambiguity.

Preview rules:

- signed short-lived session; tenant and instance are server-derived
- public anonymous routes only; block account/orders/checkout/payment/admin
- exact-origin `postMessage` with schema validation
- CSP `frame-ancestors`, `script-src`, and `connect-src` scoped to the preview/relay
- `no-store` and `noindex`
- no Matomo/GTM in previews
- validated token allowlist only; no arbitrary CSS/selectors/URLs

## Hermes/Fox transport

Use the authenticated Sessions API for persisted design conversations:

- `POST /api/sessions`
- `POST /api/sessions/{id}/chat/stream`
- `GET /api/sessions/{id}/messages` for canonical settlement

Hermes session streaming emits `assistant.delta`, `tool.started`, `tool.completed`, and `run.completed`. The detachable `/v1/runs` surface is useful only after a contract test proves the required session persistence/recovery semantics.

If using a multiplexed `store-designer` profile, call `/p/store-designer/...` with that profile's own API key. The browser must never call Hermes directly. A restricted `designer_status` tool forwards sanitized progress to Payload while the full final turn remains in Hermes session history.

## Fox classifier and minimal-edit policy

Add stable public metadata (`data-vulpy-component`, content source id, design scope) but map it to actual source paths server-side.

Route requests in this order:

1. Copy/media/block/merchandising → Payload draft.
2. Global visual intent → semantic token draft.
3. Local visual style → existing component preset/token.
4. Local composition/structure → isolated Impeccable/source variant.
5. Cart/checkout/auth/payment/tax/inventory behavior → exit designer; normal feature/security workflow.
6. Live/unsafe/ambiguous → refuse with the safe path.

Prefer token over component CSS, component token over arbitrary local style, Payload over hardcoded content, existing variant over new structure, and one component over shared primitive changes.

Impeccable **Accept** means “keep this session variant.” It does not authorize a commit, push, PR, or deployment.

## Isolation and lifecycle

Each source-editing session gets a host-managed worktree/process keyed by `(shopId, instance, designSessionId)`. Browser input cannot choose paths, ports, tenant, or instance. One writer per session and one publication lock per repo.

Expose only narrow, idempotent lifecycle commands such as:

```text
pnpm vulpy designer session-start
pnpm vulpy designer session-status
pnpm vulpy designer session-stop
pnpm vulpy designer session-clean
pnpm vulpy designer preview-restart
```

The host command server validates ids and enforces `dev`. Fox never designs against or deploys `live`.

## Required gates

Token draft:

- DTCG schema/type validation
- alias cycle detection
- editor allowlist/range validation
- contrast, font, and CSS-serialization checks

Fox edit:

- generation/drift check
- pinned Impeccable detector
- focused format/lint/type/tests
- Playwright route/device smoke
- accessibility and selected/adjacent screenshot comparison

Publication:

- root checks/tests/build for affected scope
- commerce smoke for price/cart paths
- consent/analytics checks for changed interactions
- no Impeccable markers, journals, preview bridge, or session credentials in production output

## Dependency order

```text
P0 protocol/relay/Hermes spike
  → P1 DTCG contract and generator
  → P2 Tailwind v4 migration
  → P3 commercial baseline redesign
  → P4 deterministic Payload Design Studio
  → P5 isolated session worktrees/preview lifecycle
  → P6 remote Impeccable bridge
  → P7 Fox classifier + Hermes progress
  → P8 explicit Git/PR/rollback workflow
  → P9 security, accessibility, performance, and dogfood hardening
```

First vertical slice: one tokenized product card, one Payload theme draft, one remote Impeccable selection/three-variant cycle, one persisted Hermes/Fox run, focused checks, diff, and accept/discard—no commit. Do not scale until browser/helper/Hermes restarts recover and discard leaves the source clean.

## Pitfalls

- Broad/truncated searches can create false absence claims. Retry with narrow literals or a read-only file walker.
- Do not make generated `DESIGN.md` or generated CSS independently editable.
- Do not copy the current live-preview empty-array fallback into theme previews; deleting all blocks can otherwise show stale saved content.
- Do not broaden the existing dev lifecycle command server into arbitrary shell/task ingress.
- Do not run previews against personal checkout/account data.
- Do not treat Impeccable detector success as accessibility, visual, commerce, or build verification.

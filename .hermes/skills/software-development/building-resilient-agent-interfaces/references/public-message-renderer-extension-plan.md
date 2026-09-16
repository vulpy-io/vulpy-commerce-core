# Public Message-Renderer Extension Plan Reference

Use this reference when planning a public replacement for the standalone Hermes WebUI message surface. Re-audit moving upstream heads before implementation; revisions below are point-in-time evidence, not permanent compatibility guarantees.

## Authoritative sources audited on 2026-08-01

- Standalone WebUI: `nesquena/hermes-webui@320789ae596a3963d726d90f6c7f3bc86f7f2d6d`
- Curated extension gallery: `hermes-webui/hermes-webui-extensions@5486244286a09958b601e5357b70ba7381621a9c`
- Primary contracts: WebUI `docs/EXTENSIONS.md`, `static/boot.js`, `static/messages.js`, session-SSE RFC; gallery `docs/extension-entry.md` and validator scripts.

## Current API facts to preserve

- Extensions are trusted same-origin JS/CSS with authenticated-session authority; they are not sandboxed.
- Gallery entries use `extensions/<id>/README.md`, `extension.json`, `manifest.json`, and `assets/`.
- `extension.json` describes gallery metadata, trust, capabilities, lifecycle, and permissions. Runtime `manifest.json` contains an `extensions` array with local scripts/stylesheets.
- Gallery validation uses `validate-extensions.mjs`, `scan-extension-safety.mjs`, `test-extension-validator.mjs`, and `generate-registry.mjs`. Registry generation produces deterministic ZIP metadata including artifact SHA-256 and per-file hashes.
- WebUI supports install/uninstall, `/api/extensions/status`, `/api/extensions/toggle`, and extension-owned settings/storage.
- `window.renderTranscript(...)` renders supplied history into a caller-owned container; it is not renderer registration.
- `window.registerHermesSessionOpenHandler(...)` is not a projection subscription.
- Current extension guidance favors additive, reversible UI and warns against replacing broad containers.
- The session-SSE RFC is still labeled Proposed even though related server source exists; current native client behavior has not fully converged. Do not call it a frozen third-party API without a new audit and executable contract.
- Current live wire names include `token`, `reasoning`, `tool`, `tool_complete`, `interim_assistant`, `approval`, `clarify`, `compressing`, `compressed`, `title`, `title_status`, `warning`, `apperror`, `cancel`, `done`, `stream_end`, `metering`, `context_status`, `goal`, `goal_continue`, `pending_steer_leftover`, `state_saved`, and `todo_state`.
- `done` is finalization/settlement input, not necessarily the relay-close fence; `stream_end`, cancellation, and terminal errors close relay handling according to the audited contract.

## Required host seam checklist

Mark these as upstream prerequisites unless current docs/source prove them:

- Capability discovery and projection schema negotiation.
- Renderer registration with mount/update/unmount.
- Host-owned message root with extension-scoped DOM/CSS.
- Immutable, generation/revision-scoped message projection.
- Core-owned presentation-intent callback for state-changing actions.
- Atomic native-versus-extension owner selection.
- Throw/unsupported-version fallback to native without transport restart.
- Deterministic test adapter and lifecycle disposal.

Never let the extension open run transport, persist a second transcript, reconstruct canonical history from deltas, or own send/cancel/approval/clarification.

## Issue-role template

- Contract issue: current API audit, fixtures, settlement/cursor semantics, projection schema, host-seam specification.
- Core-client issue: one observer, replay/reconcile, projection reducer, generation-safe lifecycle.
- Browser-gate issue: deterministic disconnect/reload/background/session-switch/replay-expiry recovery.
- Library spike: measured go/no-go against hardest fixtures, CSP, bundle, accessibility, disposal, and no second owner.
- Delivery issue: public renderer, upstream seam integration, gallery artifact, immutable deployment packaging, default enablement, disable, rollback.
- Parent epic: sequencing and independent gates only; it does not absorb implementation.

## Scope hygiene

Place one explicit correction note near the top naming excluded domains, then ensure those terms appear nowhere else. Scan both obvious labels and variants. Do not let exclusions leak back through proposed children, architecture diagrams, test fixtures, screenshots, or release copy.

## Verification recipe

1. Assert all requested sections are present and Markdown fences are balanced.
2. Scan excluded vocabulary and allow hits only on the scope-correction line.
3. Run `git diff --check`.
4. If the plan is untracked, also run `git diff --no-index --check /dev/null <plan>`; exit 1 is the normal difference status, while diagnostic output or exit greater than 1 indicates a problem.
5. Re-read the beginning, issue graph, packaging/rollback, test matrix, and exit criteria.
6. Final response: changed path, checks passed, and direct prerequisite/centrality verdict.

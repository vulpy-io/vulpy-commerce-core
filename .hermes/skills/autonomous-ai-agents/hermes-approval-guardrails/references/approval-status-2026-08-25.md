# Approval status — verified 2026-08-25 (current baseline)

Supplements the SKILL.md body. Verified against the live tree
(`/app/workspace/extensions/hermes-webui/`, host `static/messages.js` /
`sessions.js`, agent `tools/approval.py`). Anything dated earlier (2026-08-12
"respond 400", 2026-08-15) may predate these.

## Gateway-native approval read + respond are LIVE — the old 400 gap is CLOSED

Earlier notes (2026-08-12) said gateway-mode `POST /api/approval/respond`
returns 400 and the working path is legacy mode. That is STALE:

- **Read:** `_handle_approval_pending` (api/routes.py) resolves the session's
  active run (`_STREAM_RUN_IDS` or `HttpRunnerClient.get_active_run(sid)`) and
  polls the gateway's native `GET /v1/runs/{run_id}/approval` (stamped
  `approval_id`); cross-run `GET /v1/approvals/pending` feeds the global banner.
- **Respond:** `_handle_approval_respond` resolves a run_id in order —
  `_STREAM_RUN_IDS[session.active_stream_id]` →
  `_gateway_mirrored_pending_run_id(sid, approval_id)` →
  `_gateway_pending_run_id_by_stamp(approval_id)` (for delegated children never
  streamed by the WebUI) — then relays
  `HttpRunnerClient.respond_approval(run_id, approval_id, choice)` to the
  gateway's `POST /v1/runs/{run_id}/approval`. A 409
  `{code:"gateway_run_unavailable"}` fires only for a mirrored gateway approval
  with no recoverable run_id; stale clicks fall through to local resolution.
- Patcher: `extensions/hermes-webui/scripts/patch-approval-gateway-read.py`
  (read side); the respond relay lives in the WebUI itself (routes.py +
  `patch-webui-gateway-legacy-surfaces.py`). All patch files confirmed applied
  live; 13/13 approval vitest tests green.
- **Do NOT re-litigate the 400 gap** — re-verify the live relay instead.

## Outstanding approval gaps (operator-reported 2026-08-25, still open)

1. **Always-visible compact indicator** — approvals are focus/visibility-gated:
   invisible in PWA/backgrounded tab until refresh or composer focus. Requirement
   from the operator: a COMPACT indicator always visible if ANY approval exists.
   The merged 1.5s poll + rAF card render only re-renders while focused.
2. **Yolo persistence** — `_session_yolo`, `_session_approved`,
   `_permanent_approved` in `tools/approval.py` are IN-MEMORY only. They do not
   survive a WebUI/PWA reload (and not a gateway restart either). After a reload
   the next dangerous command pops an unseen approval. Fix options: a durable
   per-session yolo endpoint re-applied on mount, or gateway-side persistence —
   pick one that survives BOTH WebUI reload AND agent restart.
3. **Deny-reason input** — server supports `reason` on deny (relayed to the
   agent as "BLOCKED: …"), but the approval card/banner has no reason input.
4. **Origin context** — the cross-session banner says "other session", not WHICH
   session/run; matters for coder-subagent vs background dispatch (factory).

## Renderer bug root-causes (the four reported, for future fixes)

- **Streaming-switch freeze (our renderer only):** live-turn path re-renders
  whole `LiveTurnView` per token; `LiveMarkdown` re-runs ReactMarkdown +
  rehype-highlight on every token of a growing `currentText`; settled poll does
  `JSON.stringify(m.content)` per message per tick (~line 4148 of
  src/message-renderer-island.tsx); cache-miss switch blocks on a tail fetch.
- **Input/session sync (refresh spawns a new session):** composer `send()` uses
  `S.session.session_id`; the island reads/writes localStorage
  `hermes-webui-session`. Boot-order race: island may mount before the host's
  `loadSession` restores the session → composer binds to null/stale → first send
  calls `newSession()`. `_handleActiveSessionStorageEvent` deliberately does NOT
  navigate on the storage key (each tab owns its URL `/session/<id>`), so a fix
  cannot rely on the storage-event path.
- **Reasoning grouping:** `LiveTurnView` minted a separate `<ReasoningCard>`
  (collapsed `<details>`) per reasoning segment; native folds into one stream.
  Landed fix (reviewer-APPROVED): accumulate ALL of a turn's reasoning under ONE
  grouped "Thinking" control at the stream top, concise snippet (label +
  ellipsized one-liner + word count) when collapsed; the browser owns the `open`
  attribute so a user-expanded card survives re-renders.
- **Approval reliability** = the approval UX gaps above.

## Build/deploy facts (renderer)

- `src/message-renderer-island.tsx` → `message-renderer.js` via
  `scripts/build.mjs` (esbuild IIFE `globalName: HermesMessageRenderer`).
  The WebUI serves via the fox_overlay sync (`/app/fox-overlay/webui_static/`);
  `scripts/webui-extension-watch.sh` copies repo → overlay on change, so
  renderer-only changes go live WITHOUT a WebUI restart (browser refresh
  suffices). `hermes-aui-native` localStorage flag switches to native rendering.
- The bundled `message-renderer.js` is a REBUILD of uncommitted `src/` — a
  worktree at HEAD therefore LACKS the live code. `cp` the changed src + bundle
  into each factory worktree before dispatching (factory-ops →
  references/hermes-cli-worktree-dispatch.md).
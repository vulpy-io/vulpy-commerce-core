# Durable YOLO architecture (gateway mode) — shipped 2026-08-25/26

Deep-dive of the yolo persistence design that closed security findings HIGH-1/2/3.
Complements the SKILL.md approval-surfaces section; read before touching
`extensions/hermes-webui/scripts/patch-approval-yolo-durable.py`.

## The enforcement-key trap (bit 3 separate rounds)
Gateway enforces yolo via `tools.approval` sets keyed by the APPROVAL SESSION KEY,
which in gateway mode equals the RUN_ID (`approval_session_key = run_id`,
`_run_approval_sessions[run_id] = ...`). A fresh run_id is minted PER MESSAGE. Three
consecutive implementations got this wrong:
1. Keyed by WebUI sid → never reached enforcement (no-op).
2. Keyed by current run_id only → worked for one message, died on the next.
3. Correct: gateway keeps `_session_yolo_override[sid]` AND seeds every NEW run at
   the run-start binding site (`enable_session_yolo(run_id)` when the override map has
   the run's session). Cross-message persistence requires the RUN-START SEED — there is
   no other carrier.
Rule: whenever persisting per-session agent state whose enforcement key is per-run,
the persistence must be re-applied AT RUN CREATION, not at toggle/boot time alone.

## Security semantics (security-gate approved)
- **Restart re-confirm**: after restart, persisted yolo is marked `pending_confirm:
  true` and NOT re-armed. First dangerous command prompts normally. The user's next
  toggle IS the confirmation (POST enable clears pending). Store schema v2
  `{version:2, sessions:{sid:{enabled,pending_confirm}}}` with v1 normalization.
- **Deny reason**: capped at 500 chars + control-char stripped at ALL THREE relay layers
  (gateway `_handle_run_approval`, routes respond relay, runner_client).
- **Child exclusion**: delegated subagent sids rejected (`_is_subagent_child_session_id`)
  on POST + skipped in reapply; gateway fan-out exact-matches session_id.
- **Store safety**: `approval_mode.json` written via mkstemp(dir=same-dir) → chmod 0600 →
  fsync → os.replace; symlink at target removed pre-write (os.replace never follows a
  destination symlink). IDs validated by strict `[A-Za-z0-9][A-Za-z0-9_-]{0,127}`.
- Security verdict: SAFE; follow-ups logged — surface pending_confirm in the pill UI
  (SHIPPED as fix/webui-yolo-pill-confirm after its own reviewer round), prefer explicit
  default-off for `/v1/yolo enabled`, dir fsync nit.

## Pill confirm UX (fix/webui-yolo-pill-confirm, merged 5954032b)
Pill reads `pending_confirm` from GET /api/session/yolo; amber `yolo-pending` state +
distinct title; click while pending RE-ARMS (POST `enabled: true` CONSTANT — see pitfall)
and clears pending. Reviewer caught two bugs worth remembering for ANY wrapper patcher:
1. **Reassignment recursion**: wrapping `cmdYolo` with a function that calls `cmdYolo()`
   recurses infinitely — capture the ORIGINAL (`const _origCmdYolo = cmdYolo`) BEFORE
   reassigning and delegate to the capture.
2. **Read-then-toggle wrongness**: posting the CURRENT flag value in a "confirm" path
   does the opposite of intent when the value is false. Confirm paths must post explicit
   constants, not mirror state.
Also: wrap `window.cmdYolo` so slash-command/palette callers that captured fn references
at load share the wrapper.

## Reviewer-gate meta-lessons (this branch took 2 coder fix-rounds + 1 security round)
- Iteration-capped reviews produce NO verdict but still surface real findings in their
  transcripts — grep the truncated log for BLOCKING/concern lines before deciding whether
  to re-dispatch.
- Verify reviewer claims independently before acting: one reviewer asserted `_api_error`
  "doesn't exist anywhere" — half-right (no `def`, but 25 call sites); the correct fix was
  still switching to the real `_openai_error` helper. Check the actual definition, not
  just usage counts.
- False alarms happen: a "file NOT modified" verifier warning fired on an untracked file
  because git diff doesn't show untracked paths. Confirm with direct greps/tests before
  treating a completion report as failed.
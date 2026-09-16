# Diagnosis — Native stream-finalize wipe (S1) + S2 investigation

Task: `.hermes/tasks/webui-stream-finalize-integrity.md` · Worktree: `/data/state/worktrees/wt-stream-finalize/`
Date: 2026-08-26 · All line refs below are from the CURRENTLY SERVED bundles
(`/app/hermes-webui/static/{messages.js,ui.js}`, `/app/hermes-webui/api/*.py`,
`/app/hermes-agent/**`) on this box, located fresh (2026-08-26).

## Environment facts (verified)

- Chat backend selection: `HERMES_WEBUI_CHAT_BACKEND` is NOT set in the WebUI
  process environment → browser chat uses the LEGACY in-process runtime
  (`api/streaming.py` + agent), NOT the gateway runs bridge. Gateway-side files
  (`api_server.py`, `gateway_chat.py`) are therefore NOT in the hot path for
  either symptom on this box (they matter for the assistant-ui pane only).
- Transport cannot drop events: `StreamChannel.put_nowait` fans out to all
  subscribers into unbounded `queue.Queue`s (`api/config.py:7876–7937`); `put()`
  journals + enqueues every event (`api/streaming.py:6742–6769`). No coalescing,
  no maxsize anywhere in the legacy path.
- Paint-first IS applied in the served bundle: marker comment
  “Paint-first settle” at `messages.js:5596`; the replaced settle block matches
  `scripts/patch-hermes-webui-paint-first.py::NEW_SETTLE` exactly.
  Entry point applies it at boot (`scripts/hermes-fox-entrypoint.sh:926`),
  item order after Dockerfile webui patchers.
- Message-renderer extension stays OFF (native transcript owner) per task brief.

## S1 — Finalize wipe (entire finished answer disappears)

### Mechanism (root cause)

At `done`, paint-first replaced the canonical settle rebuild with a skip
(`messages.js:5596–5608`):

```js
// Paint-first settle: the live DOM is already correct from the stream.
// Skip the full renderMessages() - ...
syncTopbar();clearLiveToolCards();
```

That is correct **only while the live DOM really is the settled transcript**.
Three finalize behaviors break that assumption and wipe/can-hide the finished
answer without anything re-rendering it from `S.messages` afterward:

1. **Anchor-prose teardown without re-render.** `_finishDone` calls
   `_clearAnchorProseIncrementalNode()` (`messages.js:5406`) and
   `clearLiveToolCards()` twice (`5563`, `5599`). The anchor registry owns the
   live prose/worklog scene rows (“anchor scene owns live”,
   `messages.js:5059–5060`; incremental nodes cached in `_anchorProseSmdCache`,
   `messages.js:3725+`). Clearing discards the DOM the stream painted. Under
   stock upstream flow the follow-up `renderMessages({preserveScroll:true})`
   rebuilt everything from the authoritative `S.messages`; under paint-first
   **nothing rebuilds** unless `d.session.messages` were merged cleanly (see 2).
2. **Session-merge failure modes leave stale/partial state displayed.** The done
   handler replaces `S.session=d.session;
   S.messages=_carryForwardEphemeralTurnFields(S.messages, d.session.messages)`
   (`messages.js:5450`). If `d.session.messages` is absent/stale-server-side
   (e.g. persist raced the SSE emit), the merged array can lack the just-finished
   assistant message; combined with (1) the visible live row was the only copy —
   clearing it leaves an empty/older transcript with no rebuild. Historical
   behavior note at `messages.js:5725` (“rebuilds from the still-empty persisted…”)
   documents this exact class of hazard for stream_end recovery.
3. **Cross-pane live-turn restore resurrects a PRE-completion snapshot.**
   `INFLIGHT[sid].liveTurnHtml` snapshot restore path
   (`ui.js:8862–8908`, capture at `8866`): switching panes away/back mid-turn
   remounts the captured live-turn HTML. If the capture predates completion
   (snapshot taken while streaming), the pane shows the truncated/older turn even
   though finalize completed; final state never re-renders because paint-first
   skipped the settle rebuild for that session’s done.

### Why it looked intermittent

- Requires pane/anchor ownership paths that actually exercised the cleared
  scene (multi-pane use, approval cards, worklog open) — single clean tab often
  converged via unrelated renders (`preserveScroll` renders fired by session list
  updates, notifications, etc.), masking the bug.
- Fade path defers `_finishDone` (see S2 constants) widening windows where a
  user action (pane switch) captures/restores stale snapshots.

### Correct fix shape (D2)

Two-phase settle inside a new fail-loud patcher
(`extensions/hermes-webui/scripts/patch-webui-stream-finalize-settle.py`):
at `done` finalize, do NOT tear down the live scene until the canonical settled
row is verifiably present in DOM — i.e. replace the unconditional
“skip the rebuild” with: merge → verify the settled assistant message exists in
`S.messages` AND the corresponding settled DOM is mounted (or mount it via a
minimal targeted render) → THEN perform the atomic clear of live anchors/tool
cards. Never unmount-before-mounted. Idempotency mark, count==1 anchors,
subprocess-tested fixtures per house pattern. Exact anchor set chosen against
served bundle lines above (OLD_SETTLE block now equals paint-first’s NEW_SETTLE,
so the new patcher composes by replacing THAT block).

## S2 — Reported tail cut at text→tool-call boundary (not root-caused)

This worktree does **not** establish that S2 is caused by a particular layer,
and does not ship an S2 fix. The observations below are ranked hypotheses from
the served bundle, not a confirmed mechanism. The reported symptom remains an
open investigation; claiming that a patcher or transport path truncates the
answer would overstate the evidence.

### Transport ruled out

Every server-side delta survives transport: `on_token` re-emits verbatim
(`api/streaming.py:7206–7223`); suppressed-content forwarding after the first
tool_call delta goes out raw via `stream_delta_callback`
(`/app/hermes-agent/agent/chat_completion_helpers.py:2233–2254`); Anthropic path
only gates *new* text after `content_block_start(tool_use)` (`2537–2546`).
Gateway patchers named in the brief audited NEGATIVE:
`patch-api-server-runs-fanout.py` (queue fan-out mechanics only),
`patch-stream-tool-args.py` (payload reshape only — never touches text deltas),
`patch-agent-length-continuation-boost.py` / `patch-agent-strip-continuation-scaffolding.py`
(truncation-recovery bookkeeping; operate only on `finish_reason==length`
paths, transcript structure, not live deltas).

### Remaining suspect layers (frontend, ranked; unconfirmed)

All boundaries funnel the pre-tool prose through these calls at
`messages.js:5117–5120` (tool start):

```js
const pendingDisplayTextBeforeTool = segmentStart===0
  ? (_parseStreamState().displayText||'')
  : _stripXmlToolCalls(assistantText.slice(segmentStart));
if(String(pendingDisplayTextBeforeTool||'').trim()) _upsertAnchorProcessProse(pendingDisplayTextBeforeTool,{sealed:true});
```

- **H2 — partial-opener suppression at seal.**
  `_parseStreamState()` → `_extractInlineThinkingFromContent(..., {streaming:true})`
  (`messages.js:250–330`) deliberately SUPPRESSES a tail that is a prefix of a
  think-opener (streaming gate, `messages.js:307–319`, `_textTailIsPartialOpener`).
  If the final chars of the segment happen to form a `<`-prefix (models writing
  tags/examples), they’re hidden at seal; unlike `done` there is NO later
  reveal for that segment — the boundary moved on (`_resetAssistantSegment()`,
  `messages.js:5141/4562–4569`). Matches “final character(s) dropped exactly at
  the transition”. Also compounds with `_stripXmlToolCalls` aggressive variants
  (`messages.js:4000–4018`): a bare `function_calls` mention anywhere switches
  on DSML/XML stripping that erases `<function_calls…$` TO END OF STRING —
  inside code fences too.
- **H4 — anchor-scene fade freeze at seal.** With live prose fade ON
  (`window._fadeTextEffect`, `messages.js:4197–4199`), anchor-scene prose
  reveals words on a cadence (`_streamFadeNextText`, `messages.js:4365–4454`;
  cached per-segment parsers, `3725+`). At tool-start the MAIN body is force-
  flushed without fade (`_flushPendingSegmentRender({force:true})`,
  `5136 → 4532–4561`) and the scene event is marked `status:'completed'`
  (`3707–3714`), but the scene’s own staggered reveal ticks are not drained
  first (unlike `_drainStreamFadeBeforeDone`, `4499–4531`, which ONLY guards
  `done`). A mid-stagger scene freezes short of the sealed tail → visually the
  last word(s) of the pre-tool paragraph vanish.
- If either layer is responsible, both sit behind paint-first: historically the settle
  `renderMessages()` rebuilt final canonical text over any such glitch, hiding
  it; since paint-first removed that rebuild (S1) the glitch becomes permanent
  in the transcript view.

### D3 plan (TDD; not completed here)

To root-cause S2, byte-extract the three boundary functions from the SERVED `messages.js`
(`_stripXmlToolCalls`, `_extractInlineThinkingFromContent` dependency-safe with
stubbed `_thinkPairs`/helpers, and the tool-start seal expression) into a vitest
harness (`extensions/hermes-webui/tests/stream-boundary-integrity.test.ts`).
Feed the synthetic sequence `token("…done.")` ×N → `tool.started`; assert the
sealed prose retains the full tail for: plain text, whitespace-ended text,
`<thi`-style prefix tails, `function_calls`-mention text, code-fence XML
examples. Whatever assertion fails identifies the responsible layer (H2 vs
XML-strip vs none) BEFORE any fix; fix only the proven layer; H4 gets a
DOM-level assertion via the same harness using the extracted fade tick +
seal functions with fake timers.

## Boot-order notes (D2 wiring)

Current relevant entrypoint order (`scripts/hermes-fox-entrypoint.sh`): the
image-baked WebUI patchers run first, then boot-time item 8c applies
`patch-hermes-webui-paint-first.py`, immediately followed by
`patch-webui-stream-finalize-settle.py` against the already-painted
`/app/hermes-webui/static/messages.js`. The finalize patcher is COPY’d into the
image as a tool only; it is deliberately not RUN against the pristine
Dockerfile bundle. `patch-webui-send-wait-session.py` remains the last
build-time `messages.js` patcher.

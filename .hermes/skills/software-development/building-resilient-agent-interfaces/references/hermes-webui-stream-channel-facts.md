# Hermes WebUI streaming channels — which one actually works (verified 2026-08-15)

Goal: when a Hermes WebUI extension/pane needs live streaming, pick the channel that
actually delivers in the installed mode — not the channel that looks most "native".

## The two channels

| Channel | Path | Format | Works when |
|---|---|---|---|
| OpenAI-format runs-events | agent sidecar `GET /v1/runs/{runId}/events` | OpenAI-style `data: {...}` with `event` field in JSON | **gateway-mode installs only** |
| WebUI-native stream bus | `GET /api/chat/stream?stream_id=<hex>` | named SSE events `event: token\ndata: {...}` | all modes (the host's own UI uses it) |

## How to determine the mode (do this BEFORE writing subscription code)

1. Host adapter mode env: `HERMES_WEBUI_RUNTIME_ADAPTER`. Unset / `legacy-direct` =
   no gateway API involvement. `legacy-journal` / `runner-local` = adapter-enabled.
   See `api/runtime_adapter.py` (`_RUNTIME_ADAPTER_ENV`, `runtime_adapter_mode()`).
2. Host UI's own subscription is ground truth: `grep "chat/stream" static/messages.js`
   → `new EventSource(new URL("api/chat/stream?stream_id=" + streamId, document.baseURI).href, {withCredentials:true})`.
   If the first-party UI wires chat/stream, the pane should too.
3. Probe both endpoints (they 401 without auth — that's fine, existence + auth-gate
   is the signal).

## legacy-direct mode reality (this install)

- There is **no native run id**. The chat never touches the agent gateway API, so
  "discover the run id via active-run then subscribe to /v1/runs/{id}/events" can
  never work — that's the "no subscription and wrong id" failure mode.
- The correct id is already on the bus: `hermes:run-started` emits
  `{ sessionId, runId: streamId, streamId: streamId }` (messages.js:1801).
  Use `streamId` for `/api/chat/stream?stream_id=<hex>`.
- No watchdog/active-run polling needed for the live path. Keep polling only for
  settled history reconciliation.

## Wire format (verified in host source)

`api/streaming.py` `_sse()`: `event: {event}\ndata: {json}\n\n`. Named events, so use
`EventSource.addEventListener("token", ...)` not the generic `message` listener.

Event inventory emitted by the WebUI stream (`api/gateway_chat.py` /
`api/streaming.py` tool_progress path):

- `token` — `{text}` delta; append to currentText.
- `reasoning` — `{text}` delta; append (the legacy pane wrongly treated it as a
  snapshot; the bus path is delta).
- `tool` — `{name, args, tid?}` (translated from `tool.started`); seal currentText,
  push a tool segment.
- `tool_complete` — `{name, args, is_error, tid?}`; NO `result` field (settled poll
  supplies output later); mark segment done.
- `done` — terminal success. `stream_end` follows immediately; both are terminal —
  guard with a `closed` flag so the second one is a no-op.
- `cancel`, `apperror` (terminal; apperror carries `error`/`message`).
- Transport `error` fires on both failure and normal server close — the `closed`
  guard makes it safe as a catch-all fallback to poll reconciliation.

The `_gateway_tool_progress_event()` translation in `gateway_chat.py` maps
`tool.started` / `tool.completed` / `reasoning.available` → `tool` / `tool_complete`
/ `reasoning`, so the stream bus is OpenAI-*ish* in spirit but WebUI-native in
schema. Do not conflate it with the actual OpenAI `/v1/runs` channel.

## Subscription effect shape (proven)

```tsx
const [webUiStreamId, setWebUiStreamId] = useState<string | null>(null);
// bus handler:
//   const streamId = d.streamId ? String(d.streamId) : "";
//   if (streamId) setWebUiStreamId((prev) => prev === streamId ? prev : streamId);
useEffect(() => {
  if (!webUiStreamId) return;
  let es: EventSource | null = null;
  let closed = false;
  try {
    es = new EventSource(`/api/chat/stream?stream_id=${encodeURIComponent(webUiStreamId)}`,
      { withCredentials: true });
  } catch { return; }
  // token / reasoning / tool / tool_complete listeners mutate liveTurn state
  // terminal events call finish(error?):
  //   closed=true; es.close(); setRunActive(false); setWebUiStreamId(null);
  //   pendingClearLiveTurnRef.current = true; setRefreshKey(k => k+1);
  // (liveTurn stays visible until the settled poll confirms the final row —
  //  that's the no-blank-flash teardown; see SKILL.md teardown pitfall)
  return () => { closed = true; try { es?.close(); } catch {} };
}, [webUiStreamId]);
```

## Optimistic bubble placement (transcript tail rules)

- User sends (kind "message") append at the settled tail, before the live turn view.
- Steer bubbles (kind "steer") render AFTER the live turn as plain rows.
- Reconcile on **text match alone** — the old `|rawTs - o.ts| < 3` window caused
  duplicates whenever server and client clocks disagreed. Optimistic entries are
  session-scoped and short-lived, so text-only match is safe.
- The old "insert after last user row" logic puts a new send mid-chat above prior
  assistant replies — append at the tail instead.

## File-only sends — duplicate-bubble root cause and fix (verified 2026-08-15)

Symptom: "after attaching a file I see 2 distinct messages instead of one."

Root cause: the bus `hermes:message-sent` payload carries only the host's display
text (`displayText = text || \`Uploaded: ${names}\``, messages.js:1602), but the
settled user row stores the **raw typed text** (often `""` for file-only sends)
plus a separate `attachments` array (`_checkpoint_user_message_for_eager_session_save`
in routes.py writes `content: msg` + `attachments`). Text-match reconciliation can
never match → the optimistic bubble persists next to the settled row.

Fix (all three parts):

1. **Capture attachment names at bus time** — the bus payload has none, but the
   host object does:
   ```ts
   const pending = window.S?.session?.pending_attachments; // [{name,path,mime,size}]
   const attachNames = attachmentNames(pending);
   // attachmentNames normalizes string | {name|filename|path} → string[]
   ```
   Store on the optimistic entry (`attachments?: string[]`).
2. **Render native-style chips** in both the optimistic bubble and the settled
   `UserMessageView`: `.msg-files` / `.msg-file-badge` (paperclip icon + basename,
   `api/file/raw?session_id=…&path=<basename>` link); image extensions render as
   `.msg-media-img` thumbnails. Native reference: `_renderAttachmentHtml` +
   `.msg-file-badge` CSS in `static/ui.js` / `style.css`. The pane's chips use
   `hermes-msg-files` / `hermes-msg-file-badge` class names (matching `.msg-files`
   layout) and `var(--accent-bg)` / `var(--accent-bg-strong)` / `var(--accent-text)`
   tokens so they match the host's own badges.
3. **Reconcile by text OR attachment name**:
   ```ts
   return !settledUsers.some((m) => {
     const t = userMessageText(m);
     if (t !== null && t === o.text) return true;
     const oAtt = o.attachments ?? [];
     const mAtt = (m as ThreadMessageLike & { attachments?: string[] }).attachments ?? [];
     return oAtt.length > 0 && oAtt.some((a) => mAtt.includes(a));
   });
   ```
   `mapApiMessages` must carry `attachments: attachmentNames(raw.attachments)` on
   user rows so the settled side has names to compare.

## Pending-clear flag — consume BEFORE the same-content early return (2026-08-15)

The teardown ref flag (`pendingClearLiveTurnRef`) is set by terminal events and
consumed inside the poll's `setMessages` updater. First version placed consumption
AFTER `if (same) return prev;` — for fast runs where the last poll already fetched
the final rows, the post-`done` poll returned identical content, hit the early
return, and never consumed the flag → `liveTurn` never cleared → the LIVE
(args-only) tool card stayed forever, and the operator reported "card shows only
the call args" (it was a stuck live card, not a missing result).

Correct shape: compute `same`, consume the flag **regardless** of merge result,
gated on the final row being visible in this poll's list:

```ts
let finalRowVisible = false;
for (let i = freshMapped.length - 1; i >= 0; i--) {
  if (freshMapped[i].role === "assistant") { finalRowVisible = true; break; }
  if (freshMapped[i].role === "user") { break; }
}
// inside setMessages updater:
if (pendingClearLiveTurnRef.current && finalRowVisible) {
  pendingClearLiveTurnRef.current = false;
  setLiveTurn(null);
}
if (same) { return prev; }
return merged;
```

`finalRowVisible` (an assistant row after the last user row) prevents premature
clear → no blank-flash when the final row hasn't landed yet. Regression test:
stream tool + `tool_complete` + `done` while the settled store already contains
the final rows → assert `[data-live-turn]` is gone and the settled `.hermes-tool-card`
contains the folded result text.

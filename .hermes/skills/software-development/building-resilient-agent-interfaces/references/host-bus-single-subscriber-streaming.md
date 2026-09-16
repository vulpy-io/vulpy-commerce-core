# Host-bus single-subscriber streaming (avoid duplicate EventSource saturation)

2026-08-17 architectural decision (verified in the Vulpy renderer). When a custom
message renderer lives INSIDE the host WebUI (island/pane), do NOT open a second
`/api/chat/stream` EventSource for the same stream_id. The host already owns one;
a duplicate + the persistent per-session SSEs saturate Chrome's ~6-connection
HTTP/1.1 origin pool, stalling session-switch fetches and hanging the whole UI.

## Pattern

1. The HOST owns the single `/api/chat/stream?stream_id=<hex>` EventSource and
   forwards each raw SSE event onto `window.HermesBus` as
   `hermes:stream-event` with `{ sessionId, streamId, eventType, data }`.
2. The island subscribes to the bus (in-process handlers + `CustomEvent`
   fallback) and consumes only events for the CURRENT session
   (`String(d.sessionId) !== sessionIdFromHost()` → return) and the ARMED
   stream id (`webUiStreamIdRef`).
3. The stream id is learned from `hermes:run-started` (`d.streamId`) and from
   `hostActiveStreamSnapshot(sid)` on session switch — a coordination value,
   not a second transport.
4. Reconciliation still happens via the settled 2s poll (safety net for missed
   events / other tabs); a `_refreshKey` bump forces an immediate refetch on
   `message-sent` / `run-completed` / `session-changed`.

## Why it fixes session-switch stalls

Before: the pane opened its own EventSource per run + the host's persistent
session SSEs → 6-connection pool exhausted → a switch's tail fetch queued
behind open sockets → "UI unresponsive until the stream updates". After: one
socket during runs, so switches fetch immediately.

## Keys to get right

- **Session-scoped guard on every event handler** — a delayed completion/Stop
  from a DIFFERENT thread (`sessionId` mismatch) must not flip this pane's run
  state (cross-thread interruption leak).
- **Mid-flight switch adoption:** on `session-changed`, re-arm
  `webUiStreamIdRef` synchronously from `hostActiveStreamSnapshot(sid)` BEFORE
  the poll re-arms — otherwise the pane sits unarmed and drops stream events
  until the next 2s tick (appears frozen). Also adopt the stream id from the
  FIRST `hermes:stream-event` if the snapshot misses (host may emit before it
  finishes re-attaching `S.busy` / `active_stream_id`).
- **`webUiStreamIdRef` is a ref, not just state** — the event guard checks it
  synchronously per event; state lags a render.
- **Use refs + state mirrors** for `runActive` / `webUiStreamId` so the poll
  effect (deps `[_refreshKey]`) reads the LATEST values without stale closures.

## Related

- `building-resilient-agent-interfaces` body: the standalone-LiveTurnView +
  segment-part-cache pattern (the render-cost half of the same freeze).
- `vulpy-webui-extension-development` → `references/streaming-live-turn-attachments-runend.md`
  and `references/host-stream-lifecycle-session-switch.md` for the full
  host-stream lifecycle and the session-switch leak class.
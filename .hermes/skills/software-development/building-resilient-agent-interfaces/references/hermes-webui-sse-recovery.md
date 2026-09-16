# Hermes WebUI: SSE recovery investigation map

Use this as a concrete reference when modifying Hermes WebUI’s streamed chat surface.

## Verified lifecycle

- `api/streaming.py::_run_agent_streaming()` starts a background worker keyed by `stream_id` and registers an active run. The agent is independent of the browser connection.
- `static/messages.js::attachLiveStream()` opens `EventSource('api/chat/stream?stream_id=…')`.
- On failure it queries `/api/chat/stream/status?stream_id=…`, reconnects or asks for run-journal replay, then falls back to `GET /api/session?session_id=…`.
- The legacy message renderer entangles transport recovery, markdown parsing, reasoning/tool cards, scroll anchoring, live DOM snapshots, and session switching. Do not port that coupling into a new surface.

## Existing event vocabulary to normalize

`token`, `interim_assistant`, `reasoning`, `tool`, `tool_complete`, `todo_state`, `approval`, `clarify`, `state_saved`, `title`, `title_status`, `context_status`, `goal`, `goal_continue`, `done`, `stream_end`, `pending_steer_leftover`, `compressing`, `compressed`, `metering`, `apperror`, `warning`, `error`, `cancel`.

Treat this list as a starting point; assert it against current source before changing the protocol.

## Reproduction recipe

1. Start a chat turn whose worker emits initial progress and then remains quiet while a long-running tool/process runs.
2. Capture the server-issued `session_id`, `stream_id`, and last run-journal cursor.
3. Terminate the EventSource/browser client without calling the cancel endpoint.
4. Allow the worker to finish and persist its assistant result.
5. Create a new client (or reload) for that session.
6. The client must detect the active/finished run, replay from cursor when available, fetch canonical session state after terminal status, and render one final assistant answer.

## Deterministic browser harness pattern

Use a gated fake Gateway rather than timing a real model:

1. Emit initial reasoning/tool events and a partial assistant prefix.
2. Block the fake worker on a threading/event latch before terminal frames.
3. In the browser, capture `session_id`, authoritative `active_stream_id`, and the core stream object.
4. Close only the core stream and assert the Gateway has not emitted `run.completed`/`done` yet.
5. Release the terminal latch while detached; wait from the test process—not the browser—until the Gateway emitted terminal and `GET /api/session?session_id=…&messages=1` shows one exact assistant result with no active stream.
6. Trigger the intended recovery path:
   - hard reload for canonical hydration;
   - core reattach for replay behavior;
   - `pageshow`/focus/visibility for suspension recovery;
   - network emulation for `onerror` and backoff.
7. Count exact assistant matches in both canonical client state and rendered DOM. Also assert tool/reasoning rows separately when fidelity is in scope.

A healthy control run through the same fake Gateway must pass. This separates browser/server setup failures from the recovery RED.

Important interpretation: final prose may recover exactly once while browser-derived reasoning/tool activity disappears because no connected client persisted the activity scene at terminal settlement. That is a valid adjacent fidelity failure, but it is **not** evidence that the exact-once final-prose criterion failed. Report the two assertions independently.

## Regression assertions

- Worker remains active after the client disconnect.
- No duplicate rows after replay.
- No "connection interrupted" terminal UI when canonical session already contains a completed answer.
- `active_stream_id` clears only after the session has the durable final state.
- A session switch or reload does not create a second stream owner for the same stream.
- Resume/reload restores one canonical final response in both state and DOM.
- When required by the transport contract, reasoning/tool activity survives detached completion exactly once rather than being silently dropped.

## Design note

A component library (assistant-ui, Nuxt UI, or otherwise) is a renderer and interaction framework. It should consume normalized events from a dedicated RunClient. It is not a substitute for durable delivery/replay semantics.

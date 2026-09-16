# Deterministic Replay-Overlap Browser Gates

Use this note when a browser lifecycle test disconnects an SSE transport, rewinds an opaque cursor, and reconnects while the worker remains active.

## Barrier sequence

1. Wait for durable journal rows representing the exact initial prose, reasoning, tool-start, and tool-complete events.
2. Select rows by `event` plus unique payload text; do not treat every journal row as part of the scenario.
3. Snapshot the lifecycle owner: accepted event IDs, cursor, ownership, generation, and native source state.
4. Rewind the cursor to a deliberately earlier accepted event ID, then close only the transport. Assert `readyState === CLOSED` while ownership remains active.
5. Release the server-side gap barrier and wait until the exact gap prose/reasoning rows are durable.
6. Dispatch the browser lifecycle resume signal and capture the resulting stream request. Parse its query and assert the exact opaque `after_event_id`; do not infer this from browser state alone.
7. Wait until the owner's accepted-ID set contains every selected gap ID. This is the protocol acceptance barrier.
8. Separately assert semantic rendering: overlap text/reasoning once, gap text/reasoning once, and one rendered tool card even if source projection contains tool-start and tool-complete rows.
9. Release terminal emission; assert the canonical final once in state and once in DOM.
10. Wait for `snapshot().owned === false && snapshot().status === "idle"` before inspecting final ownership.
11. Hard reload and compare semantic activity, normalizing renderer row-boundary changes (for example, two live reasoning rows becoming one settled reasoning row).

## Streaming Markdown punctuation pitfall

Do not use the complete `innerText` of the newest streamed token—including its final punctuation—as the protocol barrier. A streaming Markdown renderer may retain the last punctuation character until a later token or finalization pass. This can produce a timeout even though:

- the durable journal contains the event;
- the lifecycle owner accepted its event ID;
- the raw Anchor/activity projection contains the complete payload.

Use accepted event-ID membership as the protocol barrier. For the live DOM, count a stable sentence body or normalized semantic text; retain full-content coverage in the raw projection and canonical-final assertions.

## Evidence artifact

Persist one JSON artifact containing:

- named state snapshots at initial acceptance, disconnected/rewound, durable gap, replay accepted, and canonical settlement;
- selected initial and gap event IDs;
- captured reconnect URLs and parsed opaque cursors;
- exact-once state/DOM final counts;
- hard-reload semantic activity.

This makes timing failures diagnosable without relying only on screenshots or server timestamps.

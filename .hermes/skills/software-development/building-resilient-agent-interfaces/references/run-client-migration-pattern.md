# RunClient migration pattern for mature streaming renderers

Use this when moving transport/control ownership out of a large existing chat renderer without replacing its proven projection logic.

## Strangler shape

Keep the existing renderer as the sole projection/store consumer, but replace its native transport with a facade created by a framework-neutral RunClient:

```text
native EventSource (private to RunClient)
  -> parse / validate / dedupe / generation guard
  -> EventSource-like facade (`addEventListener`, `readyState`, `close`)
  -> existing renderer handlers
```

The facade lets a mature renderer retain tool/reasoning/final-message reconciliation while preventing it from constructing transport. RunClient must create the native source, own its generation, and suppress callbacks after replacement/disposal.

## Migration sequence

1. Pin the exact source revision and copy accepted contract/browser fixtures byte-for-byte.
2. Before production edits, write a tracked TDD ledger containing each slice's command and intended semantic failure.
3. Establish two baselines separately:
   - fixture/schema acceptance (which may already be green because it only pins decisions);
   - behavioral disconnect/recovery (the useful RED).
4. Build the core against injected `EventSource`, `fetch`, timers, and base URL so deterministic Node tests need no browser.
5. Move chat source construction behind `RunClient.openTransport`; register renderer listeners on the facade.
6. Move send/cancel/approval/clarification requests behind RunClient methods. Promise-cache control keys to suppress duplicate clicks/callbacks.
7. For send, avoid opening transport twice: either let `send()` start and open atomically, or explicitly request deferred transport and have exactly one later `openTransport()` after renderer context is ready.
8. Run focused behavior tests, legacy renderer/control neighbors, then real browser normal and disconnect scenarios.

## Acceptance chokepoint

For every named event registered through the facade:

1. reject stale generations;
2. parse JSON;
3. validate known payloads;
4. suppress an already accepted event ID;
5. only then record the opaque cursor;
6. dispatch known events once;
7. count-and-ignore structurally valid unknown events.

Acceptance/dedupe must run **once per native event**, not once per registered callback. EventTarget fan-out is a separate step: after one event is accepted, every listener registered for that event type must receive it exactly once. If each listener wrapper independently calls the deduper, the first business handler consumes the ID and later cursor-persistence, telemetry, or settlement listeners are silently skipped. Add a deterministic test with two listeners plus one duplicate native event: both listeners should receive the first event once, neither should receive the duplicate, and the cursor should advance once.

Do not parse event IDs or infer ordering from their spelling. Preserve the exact cursor and pass it as an exclusive replay boundary. If production supplies an explicit stream URL, recovery must rebuild or augment that URL with the latest cursor; an `options.url` fast path that returns the original URL unchanged can make unit recovery tests pass while production resumes from a stale boundary.

Unknown custom SSE event names cannot be observed through a wildcard listener because EventSource has no wildcard custom-event API. A count-and-ignore future-event contract therefore needs a generic envelope/default `message` event, a server-advertised event taxonomy, or another explicit registration mechanism. Do not claim arbitrary future-event compatibility from a test that pre-registers the supposedly unknown event name.

## Lifecycle trap: `EventSource.close()`

Calling `close()` is deterministic transport detachment and does **not** fire `onerror`. Therefore error-only recovery cannot satisfy browser detach/reattach tests. Keep run ownership after a transport-only close and bind `pageshow`/`online` (or the host's equivalent lifecycle seam) to status/replay/canonical reconciliation. Explicit `dispose()` is the separate operation that clears ownership.

Reconnect must preserve the facade identity and its listener registry while replacing only the private native source and generation. A renderer holding the original facade will otherwise remain wired to a dead generation. Register lifecycle listeners once per owned run, remove them on final disposal, and test repeated ephemeral runs for listener leaks and later resume traffic.

## Terminal fan-out and settlement ordering

A compatibility facade introduces a subtle terminal race: the existing renderer's `stream_end`, cancel, or error callback may call `close()`/`dispose()` synchronously while RunClient is still fanning out the accepted terminal event. If that destroys ownership, the client's subsequent canonical fetch/retry is silently abandoned.

Use this ordering and contract:

1. Accept and dedupe the native terminal event once.
2. Mark the owner `settling` before renderer fan-out.
3. Close the private native transport idempotently.
4. Dispatch the accepted event to renderer listeners for immediate UI cleanup.
5. Fetch or validate canonical state; if the projection still reports an active stream or pending user message, retry rather than settling an active snapshot.
6. Replace projection exactly once through a single `onCanonical` handoff.
7. Only then remove lifecycle listeners and release ownership.

During `settling`, a legacy callback's facade `close()` or `dispose()` must be harmless and must not clear the owner. Outside settlement, `close()` remains transport-only and `dispose()` performs intentional teardown. Audit every renderer helper that indirectly closes streams—session-switch helpers and `done` callbacks are common hidden disposal sites.

Keep finalized content (`done`) provisional when metadata or `stream_end` can follow. The renderer may project its embedded final payload immediately, but it must not destroy the RunClient owner. Also ensure an existing “already finalized” renderer guard does not cause the later `onCanonical` handoff to skip a needed replacement; either prove the embedded payload is canonical or make the handoff idempotently compare/apply it.

When an existing renderer already has a canonical settlement routine that preserves reasoning/tool activity, RunClient's canonical handoff can invoke that routine rather than creating a second projection/store. This is especially useful when final prose is persisted canonically but live activity requires the renderer's existing anchor registry to settle correctly.

## Compatibility harnesses

Large repositories may have tests that extract one renderer function and execute it without the normal page bootstrap. Prefer injecting a RunClient stub into those harnesses. If changing accepted neighboring tests is out of scope, a compatibility branch may call the legacy helper only when RunClient is genuinely absent; the shipped page must load RunClient first and always take the core path. Document and test that ordering so the fallback cannot become the production path accidentally.

## Verification matrix

- Core behavior: owner/generation/disposal; cursor/dedupe/malformed/unknown; status retry/reconnect; settlement order/retry; control dedupe.
- Static wiring: RunClient loads before renderer; no renderer-created chat EventSource; production controls invoke RunClient.
- Neighbors: existing stream, cancel, approval, clarification, and session-switch tests.
- Browser normal: live activity, final prose, settled parity, hard reload.
- Browser detached completion: close browser chat source while worker remains active; finish without browser SSE; lifecycle resume; assert final prose once plus reasoning/tool activity; hard reload parity.
- Hygiene: syntax checks, focused lint, `git diff --check`, byte-identity of accepted copied artifacts.

If a repository-wide suite times out or has unrelated pre-existing lint failures, do not claim full green. Preserve the focused green, report the broad run's exact incomplete status separately, and avoid changing unrelated files merely to make the report cleaner.

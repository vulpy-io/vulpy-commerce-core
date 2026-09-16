# Stream Ownership Refactor: Regression-Test Recipe

Use this reference when a renderer previously created `EventSource` directly and now receives a transport facade from a lifecycle/run client.

## Harness migration

A stale harness often looks like this:

```js
global.EventSource = FakeEventSource;
eval(extractAttachFunction(messagesSource));
attachLiveStream('session', 'stream');
const source = FakeEventSource.instances[0];
```

After ownership moves, this can produce no source because the harness omitted the real client. Migrate it conceptually to:

```js
window.EventSource = global.EventSource = FakeEventSource;
window.addEventListener = () => {};
window.removeEventListener = () => {};
// Evaluate the real client module so window.HermesRunClient is instantiated.
// Then evaluate the renderer attachment code and drive events through the
// facade/native source created by the real owner.
```

Also provide the client's actual dependencies, such as `fetch`, timers, `document.baseURI`, and lifecycle listener methods. Avoid reimplementing its dedupe or generation logic in the test.

## Deterministic replay-overlap sequence

Use named synchronization events rather than elapsed sleeps:

- `activity_ready`: server emitted accepted prose, reasoning, tool-start, and tool-complete.
- Browser waits until those exact semantics are projected and obtains their durable journal IDs.
- Browser rewinds owner cursor to a known earlier event and closes only the transport.
- `release_gap`: lets the still-active server worker emit unique gap prose/reasoning events.
- `gap_ready`: server confirms emission.
- Test waits until the durable journal contains every unique gap payload.
- Dispatch a real lifecycle resume signal (`pageshow`/`online`) to the production client.
- Assert accepted payloads still occur once and every gap payload occurs once.
- `release_settle`: permits canonical terminal emission.
- Assert one canonical assistant final in state and DOM, then client snapshot `{owned:false,status:'idle'}`.

## Selecting evidence correctly

Journal rows may include concurrent title, status, metering, or synthetic events. Build expected gap IDs by selecting rows containing the scenario's unique payloads, not by treating every row appended after a prior snapshot as a gap event.

Likewise, do not require the current cursor to equal the final selected gap ID; later legitimate events may advance it. Prove the replay cursor from the reconnect request and prove gap delivery through event membership and semantic projection.

Tool-start and tool-complete are two source events but commonly project to one semantic tool card. Assert both source events were durably accepted and one completed semantic tool card remains.

## Failure interpretation

- No direct fake source after refactor: usually harness drift until the real owner is loaded.
- Reconnect URL lacks the rewound cursor: ownership/reconnect defect or incorrect test mutation.
- URL has rewound cursor, journal has gap rows, but UI duplicates accepted prose: dedupe defect.
- Gap rows exist but unique gap semantics are missing: replay-loss defect.
- Final is canonical but owner remains active: terminal disposal defect.
- Browser never sends the initial request: precondition/startup failure; classify separately rather than retrying until hidden.

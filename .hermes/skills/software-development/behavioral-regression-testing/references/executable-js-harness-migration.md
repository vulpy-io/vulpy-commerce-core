# Executable JavaScript Harness Migration After Ownership Refactors

Use this recipe when browser production code still contains a large renderer function, but transport construction moved behind an owner such as `RunClient` and old tests searched source text or instantiated `EventSource` directly.

## Two complementary harnesses

### 1. Focused renderer-function harness

For request payload, optimistic-state, and ordering contracts:

1. Extract the complete production function using a stable declaration-to-next-top-level-declaration boundary. Do not hand-copy its logic.
2. Evaluate it with Node `vm` in a browser-like context.
3. Stub only external UI/platform dependencies; retain real mutations to the production state objects.
4. Expose the new owner at the actual production seam, such as `window.HermesRunClient.send`.
5. Record an observable event ledger at boundaries (`render`, owner `send`, button update, transport attach).
6. Parameterize controlled scenarios rather than duplicating harnesses:
   - successful start;
   - state pruned while the start promise is pending;
   - optional post-start callback throws;
   - API rejection carrying an HTTP status such as 404.
7. Assert payload values, state, and event order—not helper names or source indices.

A stable test helper should invoke one committed Node harness and decode JSON output. This keeps several Python regression tests on the same executable browser model.

## 2. Transport-owner harness

For stream events, reconnect, settlement, and disposal:

1. Prefer instantiating the real owner class with fake `EventSource`, `fetch`, lifecycle target, and deterministic timers.
2. If evaluating a very large renderer closure, provide an owner-compatible facade at the production seam and retain a fake native wire underneath it.
3. Emit events on the native wire; renderer listeners must receive them through the facade.
4. Expose `close` and `dispose` separately when production distinguishes transport suspension from ownership release.
5. Verify both visible/store outcomes and final owner state.

## Facade fanout pitfall

Do not register one native forwarding callback per facade listener if each callback iterates every facade listener. That multiplies delivery (`N` native callbacks × `N` facade listeners). Register exactly one native forwarding callback per event type, then fan out once to the facade listener list.

```js
addEventListener(type, callback) {
  const first = !listeners[type];
  (listeners[type] ||= []).push(callback);
  if (first) wire.addEventListener(type, event => {
    for (const listener of listeners[type] || []) listener(event);
  });
}
```

## Ordering assertions

An event ledger turns source-order checks into behavior checks:

```text
render optimistic turn
→ establish live shell
→ owner sends start payload
→ stream id becomes visible to controls
→ attach owned transport
```

Inject failures at the awaited boundary or optional callback and assert the required later events still occur.

## Terminal callback and disposal probes

A useful behavioral replacement for `flag appears before close/dispose` source checks is to make the fake facade's first `dispose()` synchronously invoke its error callback. Then assert the terminal handler's observable result (for example, a completed row remains while an application-error row is removed only by the application-error handler).

The fake must reproduce real facade idempotence or the probe creates an artificial recursion:

```js
dispose() {
  if (this.disposed) return false;
  this.disposed = true;       // set before any callback
  if (this.onerror) this.onerror({});
  return true;
}
```

This proves defensive flag-before-dispose behavior by execution without preserving an obsolete `src.close()` spelling.

## Function extraction and static seam checks

Use brace-depth extraction for complete top-level functions; fixed character windows truncate easily as comments and logging grow. For the few ordering/ownership structures too expensive to execute (for example, a call inside a renderer closure requiring the entire DOM), pair a narrowly bounded source-order assertion with an executable test of the called helper and owner facade. Search within the relevant function and after a known phase marker—an unbounded search can accidentally match the helper's declaration rather than its invocation.

## RED/GREEN discipline for harness migration

Keep separate evidence for:

- the original stale test failure;
- harness-construction errors (missing dependency, invalid extraction, unsupported scenario);
- the first meaningful behavioral RED;
- focused GREEN after the test/harness change.

Harness-construction errors are not evidence of a production defect. If the executable harness is GREEN without a production edit, classify the old failure as source-shape brittleness or harness drift.

## Python-wrapping pitfall: f-string brace escaping in JS preambles

When embedding a JS harness template inside a Python function using a raw string or triple-quoted f-string, every `{` and `}` in the JS must be doubled (`{{`, `}}`) to escape them from Python's f-string interpolation. This is easy to miss at scale and produces a confusing Node.js syntax error rather than a Python one:

```
SyntaxError: Unexpected token '{'
    at makeContextifyScript (node:internal/vm:194:14)
```

**Fix:** build the preamble with a plain string-concatenation helper function — no f-string at the outer scope, so JS braces never need escaping. Only interpolate the specific values that change (e.g. `module_path`) using a targeted inner f-string segment:

```python
def _make_preamble(module_path) -> str:
    mod_json = json.dumps(str(module_path))
    return (
        "const assert = require('node:assert/strict');\n"
        f"const {{ RunClient }} = require({mod_json});\n"  # only this line needs {{ }}
        "class FakeSource {\n"
        "  static CONNECTING=0; static OPEN=1; static CLOSED=2;\n"
        # ... all JS braces written literally, no doubling needed
    )
```

This pattern: one small f-string segment for the interpolated value, plain concatenation for all static JS. Zero syntax surprises.

## Hardcoded `MODULE` path breaks stub RED verification

A common harness design hardcodes the production module as a module-level constant:

```python
ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "static" / "run_client.js"   # always production

def _run(body: str) -> dict:
    preamble = _make_preamble(MODULE)         # never reads an env var
    ...
```

If `_run()` only ever receives `MODULE`, there is no way to run the test suite against a different module without editing the file. A subagent can claim "ran RED against the stub" by passing `RUN_CLIENT_PATH=static/run_client_stub.js` as an env var — but if the test file never reads that var, the claim is false and every "stub run" silently used production.

**Controller check before accepting RED evidence:**

```bash
# Does anything in the harness read an env var to select the module?
grep -n 'RUN_CLIENT_PATH\|os\.environ\|getenv\|MODULE\s*=' \
  tests/conftest.py tests/test_*.py scripts/test.sh | head -20
```

If `MODULE = ROOT / "static" / "run_client.js"` appears with no conditional, the harness cannot produce a stub RED. The "RED logs" are invalid for those scenarios.

**Fix when adding stub-switchable RED support:**

```python
import os

ROOT = Path(__file__).resolve().parents[1]
_override = os.environ.get("RUN_CLIENT_PATH")
MODULE = (ROOT / _override) if _override else (ROOT / "static" / "run_client.js")
```

Or use the standalone `gen_red_logs.py` pattern below, which explicitly selects the stub rather than relying on the test module to be switched.

## Generating stub RED logs programmatically

When a test suite uses a shared preamble factory and a stub module to prove TDD RED state, produce the RED evidence by writing a standalone Python script — not by temporarily patching `MODULE` or re-running the full pytest suite against the stub (which changes all test outcomes at once and produces noisy output).

**Pattern:**

1. Copy the `_make_preamble(module_path)` helper from the test module (or import it if the layout allows).
2. Write a script (`scripts/gen_red_logs.py` or `scripts/gen_red_X.py`) that accepts the stub path as the module and runs each scenario body as a `subprocess.run(['node', '-e', script])`.
3. Capture `stdout`, `stderr`, and `returncode`; write to `.artifacts/red-<scenario-name>.log`.
4. Assert `returncode != 0` for each scenario to confirm it is genuinely failing against the stub.

```python
def _run_against_stub(body: str) -> subprocess.CompletedProcess:
    preamble = _make_preamble(STUB)   # STUB = ROOT / "static" / "run_client_stub.js"
    script = (
        preamble
        + "(async()=>{\n"
        + body
        + "\nconsole.log(JSON.stringify({ok:true}));\n"
        + "})().catch(e=>{console.error(e.stack||e);process.exit(1);});\n"
    )
    return subprocess.run(["node", "-e", script], cwd=ROOT, text=True, capture_output=True)

result = _run_against_stub(SCENARIO_BODY)
log = f"=== RED: {name} (stub) ===\nstdout: {result.stdout}\nstderr: {result.stderr}\nreturncode: {result.returncode}\n"
(ARTIFACTS / f"red-{name}.log").write_text(log)
assert result.returncode != 0, "Expected RED — stub should not implement this behavior"
```

**Stub failure modes to expect:**
- `stub.open()` returns `{source: null}` → the first `FakeSource.all[0].emit(...)` raises `TypeError: Cannot read properties of undefined (reading 'emit')` — confirms the stub doesn't create a real transport.
- `stub.recover()` is a no-op → `canonical` stays `null` after `await client.recover()` → assertion fails with the real error message, not a TypeError.
- `stub.cancel()` always rejects → caught by the catch block and printed with `process.exit(1)`.

The log content (especially the specific `TypeError` or assertion message) is the evidence that the test is testing what it claims to test. Keep these logs as committed artifacts.

## `void`-wrapped lifecycle handlers are not awaitable

When production wires a lifecycle event like `pageshow` or `online` using `void this.handleLifecycleResume()`, calling `lifecycleTarget.emit('pageshow')` from a test is fire-and-forget — the async handler runs on the microtask queue, and any number of `await Promise.resolve()` drains may not suffice if the handler makes an async request (e.g. a status fetch before reconnecting).

**Fix:** call `client.handleLifecycleResume()` directly in the test, which is awaitable:

```js
// WRONG — fires but you can't await it; the FakeSource.all.length check
// below may run before the reconnect has actually happened
lifecycleTarget.emit('pageshow');
await Promise.resolve(); await Promise.resolve(); // not a real barrier

// RIGHT — direct call is awaitable, no timers or arbitrary drain loops needed
await client.handleLifecycleResume();
assert.equal(FakeSource.all.length, 2, 'resume must open a new EventSource');
```

Still validate that the listener is registered (proves `_bindLifecycle` ran) before switching to the direct call as the synchronisation barrier. The test covers both the wiring and the behavior this way.

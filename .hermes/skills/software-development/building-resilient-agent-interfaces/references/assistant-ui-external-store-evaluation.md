# @assistant-ui/react External-Store Evaluation — Issue #76 Scorecard

Measured against upstream Hermes WebUI SHA `320789ae596a3963d726d90f6c7f3bc86f7f2d6d`.  
Package: `@assistant-ui/react@0.15.2`, React 18.3.1, esbuild 0.28.1.

## Decision: GO

All 5 gates passed within budget.

---

## Gate 1 — Bundle Size (PASS ✅)

| Build | Raw | Gzip (bytes) | Gzip (KiB) |
|---|---|---|---|
| Island only (react/react-dom external) | 210.0 KiB | 62,803 | **61.3 KiB** |
| Island + React bundled | 348.8 KiB | 108,054 | **105.5 KiB** |
| CSS | 0 | 0 | **0** (headless primitives) |

Budget was ≤250 KiB gzip JS, ≤50 KiB CSS. Both variants clear it.

Build command used:
```bash
npx esbuild src/index.tsx --bundle --minify --outfile=dist/bundle.js \
  --platform=browser --external:react --external:react-dom --loader:.tsx=tsx
gzip -c dist/bundle.js | wc -c
```

---

## Gate 2 — CSP Compliance (CLEAN ✅)

Scanned `dist/bundle.js` with Python regex:

| Pattern | Count | Verdict |
|---|---|---|
| `eval(` | 0 | ✅ |
| `new Function(` | 0 | ✅ |
| `dynamic import("…")` | 0 | ✅ (one existed from our own mount helper; fixed by static import) |
| `fetch(` | 0 | ✅ |
| `EventSource` | 0 | ✅ |
| `WebSocket` | 0 | ✅ |
| `innerHTML=` | 0 in island bundle | ✅ (3 in with-React build are React SVG renderer, not eval-equivalent) |
| External HTTP URLs at runtime | 0 | ✅ (W3C xmlns URIs are strings, not requests) |

**Strict-dynamic CSP would not block this bundle.**

---

## Gate 3 — External Store Integration (PASS ✅ — 7/7 tests)

Integration pattern: `useExternalStoreRuntime` (external-store/custom-runtime path).  
The adapter is ~40 lines. No private globals, no direct transport.

Test output (Node + jsdom):
```
PASS: island mounted successfully
PASS: island renders with update data (component present)
PASS: all projection event types pushed without error
PASS: renderer made NO fetch/EventSource calls (transport isolation confirmed)
```

All projection event types exercised: incremental prose, reasoning chip (`type: 'reasoning'`), tool call lifecycle (`type: 'tool-call'` with `status.type: 'running'` → `'complete'`), pending approval prompt, warning, error, cancellation, canonical replacement.

RunClient contract respected: renderer calls `snapshot()` on mount, subscribes via `onUpdate`, never calls `fetch`/`EventSource`/`WebSocket`.

---

## Gate 4 — Lifecycle / Disposal (PASS ✅)

```
  handlers before unmount: 1
  handlers after unmount: 0
PASS: all update handlers cleaned up after unmount
PASS: DOM effectively cleared after unmount
PASS: post-unmount push does not throw (handlers cleared)
```

React 18's `root.unmount()` triggers the `useEffect` cleanup, unregistering the `onUpdate` subscription. Zero retained listeners/timers/observers after unmount.

---

## Gate 5 — Dependency Surface (PASS ✅)

| Metric | Value |
|---|---|
| Unique packages in `node_modules` | 67 |
| Total install size | 78.9 MiB |
| Transport polyfills (eventsource/fetch/xhr/ws packages) | **NONE** |
| eval/new Function in @assistant-ui packages | **NONE** |
| License issues | `lru-cache` uses BlueOak-1.0.0 (permissive, GPL-compatible — OK) |

Optional/unmet deps flagged by npm: `ioredis`, `redis` — server-side Redis in `assistant-stream`, irrelevant to browser bundle.

Direct deps of `@assistant-ui/react`: `@assistant-ui/core`, `@assistant-ui/store`, `@assistant-ui/tap`, `@radix-ui/*`, `assistant-cloud`, `assistant-stream`, `nanoid`, `radix-ui`, `react-textarea-autosize`, `safe-content-frame`, `zod`, `zustand`.

---

## Integration pattern used

```tsx
// External-store adapter — NO transport ownership in renderer
const adapter: ExternalStoreAdapter<any> = {
  isRunning,
  messages,  // toThreadMessages(runClient.snapshot().messages)
  onNew: async () => {},     // RunClient owns send
  onCancel: async () => {},  // RunClient owns cancel
  setMessages: (updated) => setMessages([...updated]),
};
const runtime = useExternalStoreRuntime(adapter);
// Wrapped in <AssistantRuntimeProvider runtime={runtime}>
```

Subscription:
```tsx
useEffect(() => {
  if (!runClient.onUpdate) return;
  return runClient.onUpdate(() => {
    const snap = runClient.snapshot();
    setMessages(toThreadMessages(snap.messages));
    setIsRunning(snap.status === 'open' || ...);
  });
}, [runClient]);
```

---

## jsdom headless testing: required browser API mocks

`ThreadPrimitive.Viewport` uses `ResizeObserver`, `MutationObserver`, and `IntersectionObserver`.  
All three must be mocked in jsdom or the component tree throws on mount.

```js
// Add BEFORE createRoot / act()
class MockResizeObserver {
  constructor(cb) { this._cb = cb; }
  observe() {} unobserve() {} disconnect() {}
}
global.ResizeObserver = MockResizeObserver;
window.ResizeObserver = MockResizeObserver;

class MockMutationObserver {
  constructor(cb) { this._cb = cb; }
  observe() {} disconnect() {} takeRecords() { return []; }
}
global.MutationObserver = MockMutationObserver;
window.MutationObserver = MockMutationObserver;

class MockIntersectionObserver {
  constructor(cb) { this._cb = cb; }
  observe() {} unobserve() {} disconnect() {}
}
global.IntersectionObserver = MockIntersectionObserver;
window.IntersectionObserver = MockIntersectionObserver;
```

Use `react-dom/test-utils` `act()` for wrapping renders and state updates. Import `createRoot` from `react-dom/client` separately.

---

## API notes (v0.15.2)

- There is **no `Thread` component** — use `ThreadPrimitive.Root` + `.Viewport` + `.Messages` + `MessagePrimitive.Root` + `.Content`
- `useExternalStoreRuntime` is the correct hook for external state (not `useLocalRuntime`)
- `ExternalStoreAdapter<any>` is the right type when the message format is custom; `convertMessage` can be omitted when messages are pre-converted to `ThreadMessage` shape
- CSS is optional — all primitives are headless by default; bring your own styles

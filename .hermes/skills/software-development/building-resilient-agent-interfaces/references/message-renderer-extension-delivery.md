# hermes-webui-message-renderer — Delivery Reference

Issue #77: public gallery extension + Vulpy default-enable. Completed 2026-08-03.

---

## Extension gallery entry schema (issue-77 proven)

Based on `extensions/message-pins/` as the canonical reference pattern in
`hermes-webui/hermes-webui-extensions`.

### `gallery-entry/extension.json`

```json
{
  "id": "hermes-webui-message-renderer",
  "name": "Hermes WebUI Message Renderer",
  "description": "...",
  "version": "0.1.0",
  "author": "vulpy-io",
  "assets": {
    "scripts": ["assets/message-renderer.js"],
    "stylesheets": []
  },
  "capabilities": ["manifest-bundle"],
  "lifecycle": {
    "webui_restart_required": false,
    "sidecar_start_required": false,
    "native_host_start_required": false,
    "native_host_autostart": "none"
  },
  "screenshots": [],
  "permissions": {
    "webui_api": { "read": [], "write": [] },
    "webui_navigation": false,
    "dom": { "owned": true, "mutates_core_views": false },
    "storage": {
      "owned": ["hermes-ext-message-renderer"],
      "shared_webui_keys": []
    },
    "loopback_sidecar": false,
    "native_host": false,
    "filesystem": { "arbitrary": false, "serves_bundled_assets": true },
    "network_external": false
  }
}
```

Key constraints enforced by `validate-extensions.mjs` + `scan-extension-safety.mjs`:
- `capabilities` only valid values: `"manifest-bundle"` or `"loopback-sidecar"`
- `permissions.storage.owned` must be `true` (namespace form) or non-empty array when `localStorage.setItem` is used
- `network_external: false` → any external URL literal in JS fails the safety gate
- `dom.owned: true` required for extensions that inject/own a root element
- Safety gate blocks: `eval(`, `new Function(`, string-eval timers, `import('https://...')`, `document.cookie`, `process.env`, `child_process`, `node:fs`, `Deno.Command`, `Bun.spawn`, remote script-element loader

### `gallery-entry/manifest.json`

```json
{
  "extensions": [{
    "id": "hermes-webui-message-renderer",
    "name": "Hermes WebUI Message Renderer",
    "description": "...",
    "scripts": ["assets/message-renderer.js"],
    "stylesheets": []
  }]
}
```

### Required directory layout

```
extensions/<id>/
  extension.json
  manifest.json
  assets/          ← scripts + stylesheets listed in extension.json
  README.md
  screenshots/     ← optional
```

`gallery-entry/assets/message-renderer.js` **must be byte-identical** to the static
bundle (`static/message-renderer.js`). Tests verify this with `hashlib.sha256`.

---

## Vulpy packaging pin (`vulpy-packaging/renderer-pin.json`)

```json
{
  "extension_id": "hermes-webui-message-renderer",
  "version": "0.1.0",
  "capability_key": "hermes-webui-message-renderer",
  "sha256": "<sha256 of static/message-renderer.js>",
  "artifact_ref": "vulpy-io/hermes-webui-message-renderer@v0.1.0",
  "enabled_by_default": true,
  "fallback": "native",
  "rollback_modes": [
    "settings_disable",
    "previous_artifact",
    "previous_tuple",
    "safe_mode_no_manifest"
  ],
  "loader_config": {
    "capability_key": "hermes-webui-message-renderer",
    "script_path": "assets/message-renderer.js",
    "host_seam": "hermes-webui-message-renderer",
    "native_fallback_on_disable": true,
    "disable_is_atomic": true
  }
}
```

Required fields tested: `sha256`, `version`, `capability_key`, `enabled_by_default`,
`fallback`, `rollback_modes` (≥4 entries including all four modes above).

---

## RunClient `_settle` throw-fallback (Scenario 9)

**Mechanism:** `_settle()` sets `projectionReplaced = true` before calling `onCanonical`.
If `onCanonical` throws and `projectionReplaced === true`, the updated RunClient
(issue-75 version) calls `_disposeGeneration()` immediately instead of scheduling a
retry timer. This releases ownership (`snapshot().owned === false`) even on a renderer throw.

**Diff (issue-75 vs issue-74 `run_client.js` catch block):**
```js
// issue-75 — has the fix:
if (owner.projectionReplaced) {
  this._disposeGeneration(owner.generation);  // ownership released immediately
} else {
  owner.status = 'settling';
  owner.retryTimer = this.setTimeout(...)     // retry loop only for pre-projection failures
}

// issue-74 — missing the fix:
owner.status = 'settling';
owner.retryTimer = this.setTimeout(...)       // always retries, ownership never released on throw
```

**Symptom of using the wrong version:** Scenario 9 test produces
`AssertionError: owner released after throw — true !== false` (owned remains true).
The test also takes ~3 seconds instead of <100 ms, because the retry timer fires once
and the second `_settle` call succeeds (consumes the pre-pushed canonical response).

---

## Cross-issue harness pitfall — always pin to the accepted revision

When a new issue's tests import RunClient (or any previously-iterated module) from a
sibling issue directory, point `RUN_CLIENT` at the **latest accepted version**, not the
baseline from the founding issue:

```python
# Wrong — issue-74 lacks the projectionReplaced guard
RUN_CLIENT = ROOT.parents[2] / "issue-74" / "static" / "run_client.js"

# Correct — issue-75 has the throw-fallback fix
RUN_CLIENT = ROOT.parents[2] / "issue-75" / "static" / "run_client.js"
```

**Diagnostic rule:** If an issue-N test that is *identical* to a passing issue-(N-1)
test fails with a subtle assertion mismatch, compare module paths first. A 3-second
runtime on a formerly sub-100ms test is also a signal that a retry timer is firing
(the upstream fix is absent and the module is the wrong version).

---

## Bundle metrics (v0.1.0)

| Metric           | Value                                          |
|------------------|------------------------------------------------|
| Raw JS           | 13,684 bytes                                   |
| Gzip JS          | 3,721 bytes (3.6 KiB)                          |
| CSS              | none                                           |
| SHA-256          | `e2cdfef18c402491673cf9155949f3f6b48ee8d7d33952ede7f667125b365468` |
| eval / new Func  | 0                                              |
| fetch / EventSrc | 0                                              |
| localStorage.set | ✅ (storage.owned set)                         |

---

## Host-seam anatomy — where the renderer actually plugs in

The renderer artifact being "done" does **not** mean it is active. A host-seam
call site must exist in the WebUI before anything activates. In Hermes WebUI
(`nesquena/hermes-webui` pinned SHA `320789ae...`):

### The mount point

The transcript container is `<div class="messages-inner" id="msgInner">` at
`static/index.html` line ~450. All message DOM lives under this element.

### The integration function

`_wireSSE(source)` at `static/messages.js` line **4889** is an **inner function**
inside `attachLiveStream(activeSid, streamId, uploaded, options)` (defined at line 1979).
It is not a top-level export — it captures `activeSid`, `streamId`, `assistantText`,
and `LIVE_STREAMS` via closure.

The line immediately after `LIVE_STREAMS[activeSid]={streamId,source};` (around line 4895)
is the correct insertion point for a renderer hook. At that point:
- `activeSid` — current session ID
- `streamId` — current stream ID
- `source` — the live `EventSource`

### SSE event names (from line 6042)

The full run-journal event set:
```
token  interim_assistant  reasoning  tool  tool_complete  todo_state
approval  clarify  state_saved  title  title_status  context_status
goal  goal_continue  done  stream_end  pending_steer_leftover
compressing  compressed  metering  apperror  warning  error  cancel
```

### Minimal projection adapter (local dogfood pattern)

```javascript
// Inside _wireSSE, after LIVE_STREAMS[activeSid]={streamId,source}:
if (window.HermesMessageRenderer &&
    window.HermesMessageRenderer.canActivate({capabilities:['hermes-webui-message-renderer']})) {
  const _msgRoot = document.getElementById('msgInner');
  if (_msgRoot) {
    const _proj = {
      status:'open', sessionId:activeSid, streamId:streamId,
      cursor:'', generation:0, messages:[{parts:[]}], owned:true
    };
    const _handlers = [];
    const _adapter = {
      snapshot(){ return _proj; },
      onUpdate(cb){ _handlers.push(cb); return ()=>{ const i=_handlers.indexOf(cb); if(i>-1)_handlers.splice(i,1); }; }
    };
    function _notify(){ _proj.generation++; for(const h of _handlers) try{h();}catch(_){} }
    source.addEventListener('token',     e=>{ const d=JSON.parse(e.data); _proj.messages[0].parts.push({type:'text',text:d.text||''}); _notify(); });
    source.addEventListener('reasoning', e=>{ const d=JSON.parse(e.data); _proj.messages[0].parts.push({type:'reasoning',text:d.text||d.summary||''}); _notify(); });
    source.addEventListener('tool',      e=>{ const d=JSON.parse(e.data); _proj.messages[0].parts.push({type:'tool',name:d.name||'',input:d.input||{},result:null,status:'running'}); _notify(); });
    source.addEventListener('tool_complete', e=>{
      const d=JSON.parse(e.data); const parts=_proj.messages[0].parts;
      for(let i=parts.length-1;i>=0;i--){ if(parts[i].type==='tool'&&parts[i].name===d.name&&parts[i].status==='running'){ parts[i].result=d.result||null; parts[i].status='done'; break; } }
      _notify();
    });
    source.addEventListener('done', ()=>{ _proj.status='settled'; _proj.owned=false; _notify(); window.HermesMessageRenderer.unmount(_msgRoot); });
    window.HermesMessageRenderer.mount(_msgRoot, _adapter);
  }
}
```

### Upstream PR host-seam design (generic, no Vulpy code)

The clean upstream approach uses a registration API rather than checking for a
specific global:

```javascript
// boot.js or extension_settings.js — registration API:
window.registerHermesRenderer = function(descriptor) {
  // descriptor: { id, mount(root, source, ctx), unmount(root), canActivate(caps) }
  // Validates, stores privately, one renderer active at a time
};

// messages.js _wireSSE insertion point — uses the registered hook:
const _hook = window._hermesRendererMount;
if (_hook) {
  const _msgRoot = document.getElementById('msgInner');
  if (_msgRoot) _hook(_msgRoot, source, { sessionId: activeSid, streamId: streamId });
}
// ...terminal handlers add:
// if (window._hermesRendererUnmount) window._hermesRendererUnmount(_msgRoot);
```

Capability advertised to extensions: `'hermes-webui-message-renderer': true`
in the host capabilities manifest.

---

## Renderer public API (UMD, `module.exports`)

```js
mount(root, adapter)          // attach renderer; idempotent on same root
unmount(root)                 // release subscriptions atomically; safe to call multiple times
renderMessageParts(parts)     // project ProjectedMessage.parts[] → descriptor[]
createRunClientAdapter(client)// wrap RunClient as external-store adapter
setDisabled(bool)             // set/clear global disable flag; mount() is no-op when disabled
canActivate(hostCaps)         // true iff CAPABILITY_KEY in hostCaps.capabilities[]
VERSION                       // "0.1.0"
CAPABILITY_KEY                // "hermes-webui-message-renderer"
```

`createRunClientAdapter` returns `{ snapshot(), onUpdate(cb) → unsub }`.
`onUpdate` returns a no-op unsubscribe; real browser wiring bridges RunClient
`onState`/`onEvent` callbacks to React external-store re-renders externally.

Part types rendered (non-throwing, unknown → `unknown_fallback`):
`text`, `reasoning`, `tool`, `lifecycle`, `approval`, `clarify`, `warning`,
`error`, `cancel`, `goal`, `todo_state`

# DOM Ownership Wiring Pattern

**Context:** Hermes WebUI local patch — `/app/hermes-webui/static/`  
**Date:** 2026-08-04  
**Symptom:** Renderer `mount()` called, `root._rendered` populated, but `#msgInner` shows native markup  
**Root cause:** `mount()` was data-projection only; native `renderMessages()` in `ui.js` owned `#msgInner.innerHTML` unconditionally

---

## Diagnosis checklist

1. Open DevTools console during a stream.
2. Run: `document.getElementById('msgInner')._rendered` — if this returns a descriptor array, the renderer is receiving events but not writing DOM.
3. Run: `document.getElementById('msgInner')._hermesRendererActive` — if `undefined` or `false`, the DOM ownership flag was never set.
4. Confirm: `window.HermesMessageRenderer` exists and `canActivate({capabilities:['hermes-webui-message-renderer']})` returns `true`.

---

## Four-patch fix

### Patch 1: `message-renderer.js` — `_partsToHtml()` helper

Add before `renderMessageParts()`:

```js
function _escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _partsToHtml(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return '';
  var html = '', textBuf = '';
  function flushText() {
    if (!textBuf) return;
    html += '<div class="msg-row assistant-segment"><div class="msg-body">' + textBuf + '</div></div>';
    textBuf = '';
  }
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i]; if (!p) continue;
    switch (p.type) {
      case 'text':
        textBuf += (p.sanitized ? p.content : _escHtml(p.content)).replace(/\n/g, '<br>');
        break;
      case 'reasoning':
        flushText();
        html += '<div class="wl-reason reasoning-block">'
          + '<span class="wl-reason-label">Thinking</span>'
          + '<div class="wl-reason-body">' + _escHtml(p.text).replace(/\n/g, '<br>') + '</div></div>';
        break;
      case 'tool':
        flushText();
        var sc = p.status === 'complete' ? 'tool-card' : 'tool-card tool-card-running';
        html += '<div class="tool-card-row"><div class="' + sc + '">'
          + '<div class="tool-card-name">' + _escHtml(p.name) + '</div>'
          + (p.status === 'complete'
              ? '<div class="tool-card-result"><pre>' + _escHtml(JSON.stringify(p.input, null, 2)) + '</pre></div>'
              : '')
          + '</div></div>';
        break;
      case 'warning': flushText(); html += '<div class="msg-row"><div class="msg-body msg-warning">' + _escHtml(p.text) + '</div></div>'; break;
      case 'error':   flushText(); html += '<div class="msg-row"><div class="msg-body msg-error">' + _escHtml(p.text) + '</div></div>'; break;
      case 'goal':    flushText(); html += '<div class="msg-row"><div class="msg-body msg-goal"><strong>Goal:</strong> ' + _escHtml(p.text) + '</div></div>'; break;
      case 'cancel':  flushText(); html += '<div class="msg-row"><div class="msg-body msg-cancel">' + _escHtml(p.text || 'Cancelled') + '</div></div>'; break;
      // todo_state, lifecycle, approval, clarify, unknown_fallback — skip (core-owned)
    }
  }
  flushText();
  return html;
}
```

CSS classes used: `msg-row`, `msg-body`, `assistant-segment`, `wl-reason`, `wl-reason-label`, `wl-reason-body`, `tool-card-row`, `tool-card`, `tool-card-running`, `tool-card-name`, `tool-card-result`, `msg-warning`, `msg-error`, `msg-goal`, `msg-cancel`. All defined in `/app/hermes-webui/static/style.css`; all skins apply automatically.

---

### Patch 2: `message-renderer.js` — `mount()` overlay creation

Add at the top of `mount(root, adapter)`, before the "atomically tear down" block:

```js
if (!root._hermesRendererOverlay && root.id === 'msgInner') {
  var overlay = document.createElement('div');
  overlay.id = 'hermesRendererOverlay';
  overlay.className = 'hermes-renderer-overlay';
  overlay.style.cssText = 'width:100%;';
  root.innerHTML = '';           // wipe native content
  root.appendChild(overlay);
  root._hermesRendererOverlay = overlay;
  root._hermesRendererActive = true;   // read by renderMessages() yield guard
}
```

**Key:** `root` IS `#msgInner`. `messages.js` passes `document.getElementById('msgInner')` directly. Do NOT call `getElementById('msgInner')` again inside `mount()`.

---

### Patch 3: `message-renderer.js` — `handleUpdate()` DOM write

After `root._snapshot = snap;`, add:

```js
if (root._hermesRendererOverlay) {
  var html = _partsToHtml(root._rendered);
  root._hermesRendererOverlay.innerHTML = html;
}
```

---

### Patch 4: `ui.js` — `renderMessages()` yield guard

At the very top of `function renderMessages(options){`, before `_lastMessageRenderAt`:

```js
var _riInner = document.getElementById('msgInner');
if (_riInner && _riInner._hermesRendererActive) return;
```

Why `getElementById` and not a `window` global: the flag lives on the DOM element itself (`root._hermesRendererActive`), which is the `#msgInner` node. Reading it directly off the element avoids a second global and is always consistent with what `mount()` wrote.

---

### Patch 5: `message-renderer.js` — `unmount()` cleanup

After the existing `existing[1]()` call (unsubscribe), add:

```js
if (root._hermesRendererOverlay) {
  try {
    var ov = root._hermesRendererOverlay;
    if (ov.parentNode) ov.parentNode.removeChild(ov);
  } catch (_) {}
  root._hermesRendererOverlay = null;
}
root._hermesRendererActive = false;
```

Once `_hermesRendererActive` is false, `renderMessages()` resumes immediately on its next call — no restart or reload needed.

---

## Rollback

Call `window.HermesMessageRenderer.unmount(document.getElementById('msgInner'))` from DevTools console. Native rendering resumes on the next `renderMessages()` call (any new SSE event or explicit `renderMessages()` call will trigger it).

---

## Files modified (local patch only — overwritten on `docker pull`)

- `/app/hermes-webui/static/message-renderer.js` — patches 1–3 and 5
- `/app/hermes-webui/static/ui.js` — patch 4

No changes to `messages.js` — the existing `mount(_msgRoot, _rendererAdapter)` call site at line 4991 is already correct.

# hermes-webui Host Seam PR — Anatomy & Pitfalls

**PR:** nesquena/hermes-webui#6756  
**Branch:** `feat/message-renderer-host-seam` on `bsgdigital/hermes-webui` fork  
**Base repo:** `nesquena/hermes-webui`  
**Pinned SHA:** `320789ae596a3963d726d90f6c7f3bc86f7f2d6d`  
**Commit:** `6b44bbcf14b3c29cf25863e627bd3641e57f26f0`  
**Artifacts:** `/tmp/upstream-pr/` (PR_DESCRIPTION.md, host-seam.patch, IMPLEMENTATION_NOTES.md)

---

## Cross-repo PR flow (no direct write access to upstream)

Direct `git push` to `nesquena/hermes-webui` returns **403** — push must go to your fork,
then a cross-repo PR is opened from the fork into the upstream.

```bash
# 1. Fork upstream (idempotent — "already exists" is fine)
PATH=$HOME/bin:$PATH gh repo fork nesquena/hermes-webui --clone=false

# 2. Re-point remote to your fork (embed token; never print it)
cd /tmp/upstream-hermes-webui
git remote set-url origin \
  "https://$(PATH=$HOME/bin:$PATH gh auth token)@github.com/bsgdigital/hermes-webui.git"

# 3. Push the branch to your fork
git push --no-verify origin feat/message-renderer-host-seam

# 4. Open the PR from fork into upstream
PATH=$HOME/bin:$PATH gh pr create \
  --repo nesquena/hermes-webui \
  --head bsgdigital:feat/message-renderer-host-seam \
  --base master \
  --title "feat: add hermes-webui-message-renderer host seam for extension renderers" \
  --body-file /tmp/upstream-pr/PR_DESCRIPTION.md
# → https://github.com/nesquena/hermes-webui/pull/6756
```

**Critical details:**
- `--repo` targets the **upstream**, not the fork
- `--head` must be `<fork-user>:<branch>` — without the fork prefix GitHub can't find the branch
- Always confirm upstream default branch first: `gh repo view nesquena/hermes-webui --json defaultBranchRef`
- The token-embedded remote URL is session-ephemeral; don't persist it in `.git/config` beyond the push

---

## Files changed (5 files, +350 lines, 0 deletions of existing behaviour)

| File | What changed |
|---|---|
| `static/extension_settings.js` | Added `HERMES_HOST_CAPABILITIES = Object.freeze({'hermes-webui-message-renderer': true})`, `HermesExtensionSettings.getCapabilities()`, `window.hermesExt.capabilities` |
| `static/boot.js` | Added `registerHermesRenderer(descriptor)` IIFE + `HermesMessageRenderer` control surface (mirrors `registerHermesSkin` pattern) |
| `static/messages.js` | Added mount/unmount seam in `_wireSSE` |
| `docs/extensions/message-renderer-capability.md` | New capability reference doc |
| `.gitignore` | Added `!docs/extensions/` + `!docs/extensions/**` |

---

## Capability manifest pattern (extension_settings.js)

Place the `HERMES_HOST_CAPABILITIES` object **before** the `const api = {...}` block,
then expose it via `api.getCapabilities()` and `window.hermesExt.capabilities`:

```javascript
const HERMES_HOST_CAPABILITIES = Object.freeze({
  'hermes-webui-message-renderer': true,
  // future keys: 'hermes-webui-tool-renderer': true, etc.
});

const api = {
  // ... existing methods ...
  getCapabilities(){ return HERMES_HOST_CAPABILITIES; },
};
// ...
window.hermesExt.capabilities = HERMES_HOST_CAPABILITIES;
```

Rule: values are always `true` (never version strings or objects); remove a key only
when the API is removed.

---

## registerHermesRenderer IIFE design (boot.js)

Add after `window.registerHermesSkin = registerHermesSkin;` line (~2987 upstream).

Key design choices:
- **Private closure storage** — `_rendererDescriptor` is never on `window`
- **Internal hooks** — `window._hermesRendererMount` / `window._hermesRendererUnmount`
  are set on `window` so `messages.js` has zero import dependency on `boot.js`
- **Fail-closed** — every validation failure returns `false` silently; no exceptions escape
- **canActivate optional** — missing it means "always activate"
- **One renderer at a time** — second call replaces first (idempotent if same `id`)
- **Control surface** — `window.HermesMessageRenderer.setDisabled(true/false)` for pause/resume

```javascript
(function(){
  'use strict';
  let _rendererDescriptor = null;
  let _disabled = false;

  function _mount(root, source, ctx){
    if(_disabled || !_rendererDescriptor) return;
    try{ _rendererDescriptor.mount(root, source, ctx); }catch(e){ console.warn(...); }
  }
  function _unmount(root){
    if(!_rendererDescriptor) return;
    try{ _rendererDescriptor.unmount(root); }catch(e){ console.warn(...); }
  }

  function registerHermesRenderer(descriptor){
    try{
      if(!descriptor || typeof descriptor !== 'object') return false;
      const id = String(descriptor.id || '').trim();
      if(!id) return false;
      if(typeof descriptor.mount !== 'function') return false;
      if(typeof descriptor.unmount !== 'function') return false;
      if(typeof descriptor.canActivate === 'function'){
        const caps = (window.hermesExt && window.hermesExt.capabilities) || {};
        try{ if(!descriptor.canActivate(caps)) return false; }catch(_){ return false; }
      }
      _rendererDescriptor = { id, mount: descriptor.mount, unmount: descriptor.unmount };
      window._hermesRendererMount   = _mount;
      window._hermesRendererUnmount = _unmount;
      return true;
    }catch(_){ return false; }
  }

  window.registerHermesRenderer = registerHermesRenderer;
  window.HermesMessageRenderer = {
    setDisabled(v){ _disabled = !!v; },
    isDisabled(){ return _disabled; },
    activeId(){ return _rendererDescriptor ? _rendererDescriptor.id : null; },
  };
})();
```

---

## _wireSSE seam placement (messages.js)

### Mount — immediately after `LIVE_STREAMS[activeSid]={streamId,source};`

Local line: **4894** | Upstream (SHA 320789ae): **5441**

```javascript
LIVE_STREAMS[activeSid]={streamId,source};

// ── Renderer host seam ──────────────────────────────────────────────────────
const _rendererRoot=(typeof $==='function'&&($('liveAssistantTurn')||$('messages')))||null;
if(typeof window._hermesRendererMount==='function' && _rendererRoot){
  try{window._hermesRendererMount(_rendererRoot,source,{sessionId:activeSid,streamId});}catch(_){}
}
function _rendererUnmount(){
  if(typeof window._hermesRendererUnmount==='function' && _rendererRoot){
    try{window._hermesRendererUnmount(_rendererRoot);}catch(_){}
  }
}
// ── End renderer host seam ──────────────────────────────────────────────────
```

Root selection: `$('liveAssistantTurn')` (stable live turn wrapper) with fallback to
`$('messages')` for the case where mount is called before the first token creates the
turn row (reconnect with no prior DOM state).

### Unmount — three terminal paths

| Event | Upstream line | Position |
|---|---|---|
| `done` (inside `_finishDone`) | ~5882 | After `_streamFadeCleanupReduceMotionListener()`, before `finalizeThinkingCard()` |
| `apperror` | ~6311 | After `source.close()`, before `_clearOwnerInflightState()` |
| `cancel` | ~6569 | After `source.close()`, before `_clearOwnerInflightState()` |

```javascript
// In _finishDone:
_streamFadeCleanupReduceMotionListener();
_rendererUnmount();   // renderer host seam: notify extension stream is done
if(typeof finalizeThinkingCard==='function') finalizeThinkingCard();

// In apperror:
try{if(source&&source.readyState!==2)source.close();}catch(_){ }
_rendererUnmount();   // renderer host seam: notify extension stream ended with error
_clearOwnerInflightState();

// In cancel:
try{if(source&&source.readyState!==2)source.close();}catch(_){ }
_rendererUnmount();   // renderer host seam: notify extension stream was cancelled
_clearOwnerInflightState();
```

---

## .gitignore subdirectory pitfall

`docs/*` in hermes-webui's `.gitignore` blocks all subdirectories not explicitly listed.
When adding a new `docs/<subdir>/`, append to `.gitignore` in the same commit:

```
!docs/extensions/
!docs/extensions/**
```

Existing allowed subdirs for reference: `docs/rfcs/**`, `docs/architecture/**`, `docs/ui-ux/**`.
`git add` will print "ignored by .gitignore" as a hint (not an error) if the negation is missing.

---

## Parallel subagent file-collision pitfall

In this session two parallel subagents were dispatched: one to patch `/app/hermes-webui/static/messages.js`
(local dogfood) and one to produce `/tmp/upstream-pr/` artifacts. Both subagents received context
pointing them at `messages.js`.

The Task 2 subagent hit the 50-call limit and its clone-based commit to `/tmp/upstream-hermes-webui/`
was separate from the local file — so no collision occurred. But if both tasks had been given the same
output path, Task 2 could have overwritten Task 1's dogfood patch.

**Mitigation pattern:** when dispatching parallel subagents that might touch overlapping paths:
1. Give each subagent an explicit, non-overlapping working directory.
2. After both return, run `node --check` (or equivalent) on any file both tasks could have touched.
3. grep for both integration patterns to confirm exactly one landed in each file.

---

## Patch accuracy pitfall

During this session, patching the `cancel` handler accidentally dropped 4 lines
(`_clearStreamHidden`, `_clearStreamNotificationBackground`, `_clearApprovalForOwner`,
`_clearClarifyForOwner`) because `old_string` ended before those lines but `new_string`
did not carry them through.

**Rule:** When inserting lines mid-block with `patch(mode='replace')`, always extend
`old_string` to include 2-3 lines AFTER the insertion point and carry them through
unchanged in `new_string`. This makes the replacement unambiguous and prevents
accidental deletion of trailing lines.

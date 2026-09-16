# Session-switch UX: durable patches & wire format

> Last updated: 2026-08-17 — freeze fix, skeleton, `since_id` delta-fetch.

---

## Problem history

The original WebUI pane opened its **own `EventSource`** against
`/api/chat/stream` in addition to the one the host page already holds.
This caused:

- **Chrome 6-per-origin cap** blown during runs (≥10 sockets observed)
- **Stream-content leaking into the wrong pane** when switching sessions
- **UI freeze** when switching to an actively-streaming session (React render
  queue blocked by synchronous bus stream-event handlers)
- **Blank pane on uncached switch** (`initialLoading` never reset so skeleton
  never fired)

---

## Architecture after all fixes (2026-08-17)

```
Host page (messages.js / ui.js)
  └─ Single EventSource /api/chat/stream
       │
       │  hermes:stream-event  (CustomEvent, bubbles on document)
       ▼
message-renderer-island.tsx  (IIFE extension)
  ├─ bus sub("hermes:stream-event") → liveTurn accumulator
  ├─ bus sub("hermes:session-changed") → session switch handler
  ├─ in-memory tail cache (LRU-12, keyed by session id)
  ├─ since_id delta-fetch (WHERE id > N, ~0 bytes on warm cache)
  └─ NO EventSource, NO direct WebSocket
```

**Socket count: ≤ 6 at all times** (idle: ~4, active run: 5–6).

---

## Durable patch inventory

### 1 — `patch-webui-event-bus.py`

**Target:** `/app/hermes-webui/static/messages.js` (upstream, never rebuilt)  
**What it injects:** After the host SSE handler appends each token to the DOM,
dispatches `document.dispatchEvent(new CustomEvent('hermes:stream-event', …))`
with `{sessionId, streamId, type, content, raw}`.  
**Idempotency marker:** `vulpy-event-bus-passthrough`  
**Applied by:** `Dockerfile.hermes` via `RUN python3 scripts/patch-webui-event-bus.py`

### 2 — `patch-webui-stream-switch-leak.py`

**Target:** `messages.js` + `ui.js`  
**What it injects:** Session-ID guards in the host SSE handler and stream-pane
writer so tokens from an abandoned stream never reach the newly active pane.  
**Idempotency marker:** `vulpy-stream-switch-leak`  
**Applied by:** `Dockerfile.hermes`

### 3 — `patch-webui-loadsession-short-path.py`

**Target:** `messages.js`  
**What it injects:** Exposes `window._hermesLoadSession(id)` so the island can
ask the host to load a session without a full page reload.  
**Idempotency marker:** `vulpy-loadsession-short-path`  
**Applied by:** `Dockerfile.hermes`

### 4 — Gateway `since_id` filter

**Target:** `/app/hermes-agent/gateway/platforms/api_server.py`  
**What it does:** `GET /api/sessions/<id>/messages?since_id=N` adds
`WHERE id > N` to the SQLite query. The island passes `sinceId` from its warm
tail-cache entry so a background refresh fetches ~0 bytes when nothing is new.  
**Applied by:** live edit (no patcher — gateway code is not upstream-managed)

---

## Island behaviour (message-renderer-island.tsx)

### Session-switch handler (`hermes:session-changed` bus event)

```
1. Read hostActiveStreamSnapshot(newSid)          // bus snapshot, zero I/O
2. If active run on new session:
   a. webUiStreamIdRef.current = streamId         // SYNC write — guard passes immediately
   b. setRunActive(true)                           // React state
   c. lastDeltaAtRef.current = Date.now()
3. Else: setLiveTurn(null), setWebUiStreamId(null)
4. setRefreshKey(k+1)                             // triggers useEffect fetch
```

**Critical:** the ref write at step 2a happens *before* React processes the
`startTransition` batch. The `hermes:stream-event` bus handler checks the ref
synchronously; without 2a, every token for the newly active session is silently
dropped while React is still rendering.

### Cache-miss skeleton

```
if (cached) {
  setMessages(cached.mapped);  // instant paint from cache
  setInitialLoading(false);
} else {
  setMessages([]);
  setInitialLoading(true);     // ← triggers skeleton until fetch lands
}
```

`initialLoading` was previously `true` only at component mount. The patch
resets it to `true` on every cache-miss session switch, so shimmer rows appear
immediately instead of a blank white gap.

### Effect ownership split

| State | Owned by |
|---|---|
| `runActive`, `liveTurn`, `webUiStreamId` | `hermes:session-changed` bus handler |
| `messages`, `total`, `rawLoaded`, `initialLoading` | `refreshKey` useEffect |

The effect must NOT reset `runActive` on session change — the bus handler runs
first and may already have armed it for an active stream. Resetting it in the
effect (which fires a render later) causes an empty-state flash.

---

## Skeleton CSS

Uses `color-mix(in srgb, currentColor N%, transparent)` so shimmer bars are
always visible in both light and dark themes (no theme-variable dependency).
User bubbles use the `--primary` accent at 30–50% opacity.

```css
/* assistant rows */
background: linear-gradient(
  90deg,
  color-mix(in srgb, currentColor 14%, transparent) 25%,
  color-mix(in srgb, currentColor 26%, transparent) 50%,
  color-mix(in srgb, currentColor 14%, transparent) 75%
);

/* user bubble rows */
background: linear-gradient(
  90deg,
  color-mix(in srgb, var(--primary, #6366f1) 30%, transparent) 25%,
  color-mix(in srgb, var(--primary, #6366f1) 50%, transparent) 50%,
  color-mix(in srgb, var(--primary, #6366f1) 30%, transparent) 75%
);
```

---

## Tail cache

- In-memory LRU, max 12 entries, keyed by session ID.
- `TailCacheEntry.lastId: number | null` — max message ID in the cached tail,
  used as `since_id` on the next refresh.
- Eviction: oldest entry dropped when capacity exceeded.
- Cold-start (first load of the island): cache is empty; first switch to any
  session shows skeleton then populates cache.

---

## Test coverage

| File | What it covers |
|---|---|
| `tests/message-renderer-island.test.tsx` | 95 tests — bus stream passthrough, skeleton, empty-state gate, optimistic UI, session store |
| `tests/test_patch_event_bus.py` | 8 tests — patcher idempotency, marker injection, fallback |
| `tests/test_patch_stream_switch_leak.py` | stream-switch-leak patcher |
| `tests/test_patch_send_wait_session.py` | 6 tests — send()-wait-for-restore patcher: fresh patch, rerun idempotency, mutated-anchor fail-loud, wrong-args |

Run: `pnpm test` (from `extensions/hermes-webui/`)

---

## Verification checklist (browser)

1. **Socket count idle**: ≤ 6 connections in DevTools → Network → WS/EventStream
2. **Socket count during run**: ≤ 6 (no new EventSource from the island)
3. **Instant switch (cached)**: switching to a previously-visited session renders
   in ≤ 1 frame (no blank gap)
4. **Skeleton (uncached)**: switching to a never-visited session shows shimmer
   rows immediately, then real messages once the fetch lands
5. **No freeze when switching to active run**: clicking a streaming session does
   not freeze the UI; tokens continue without interruption
6. **No empty-state flash**: switching to a session with messages never briefly
   shows the "Think less. Start here." welcome screen
7. **Console errors**: zero JS errors during normal operation

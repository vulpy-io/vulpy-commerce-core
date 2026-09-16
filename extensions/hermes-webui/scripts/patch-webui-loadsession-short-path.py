#!/usr/bin/env python3
"""Patch WebUI static/sessions.js: pane-aware short path in loadSession().

When the assistant-ui pane (message-renderer extension) owns the transcript,
the host DOM rebuild is already skipped by renderMessages()'s
_hermesRendererActive early-return.  However, the full loadSession() still ran
the expensive tail: awaited composer-draft save, INFLIGHT snapshot,
scroll-reset, _ensureMessagesLoaded render-window expansion — visible as
"browser laggy" and "chat switching takes quite some time" on 1000+ message
threads (operator-reported 2026-08-14).

Fix: when msgInner._hermesRendererActive is set the host transcript is NOT
the source of truth — the pane owns it.  Dispatch to a lean helper that:
  1. Resolves lineage + sets _loadingSessionId (for supersede semantics).
  2. Fetches ONLY metadata (/api/session?...&messages=0&resolve_model=0)
     and assigns S.session from it — the pane polls its own bounded tail.
  3. Skips: _saveComposerDraftNow (fire-and-forget, non-blocking),
     INFLIGHT snapshot, scroll-reset/unpin flags, _ensureMessagesLoaded,
     stopApprovalPolling/hideApprovalCard DOM updates (pane-only mode has
     no approval card), renderMessages.
  4. Keeps: stream teardown/rearm so previous-session SSE doesn't leak;
     stale-load guards after every await.

Full path is untouched — it remains for split mode, pane disabled, and tests.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once
    (upgrade drift → caught at build time, never silently skipped).
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH hermes-webui files (same shape as the live ones used as
    reference on 2026-08-14).

Usage: python3 patch-webui-loadsession-short-path.py /path/to/sessions.js
"""

import sys

IDEMPOTENCY_MARK = "vulpy-loadsession-pane-short-path"


def _count(haystack: str, needle: str) -> int:
    return haystack.count(needle)


# ---------------------------------------------------------------------------
# Anchor: the first lines of loadSession() body that are stable and unique.
# We insert the short-path dispatch AFTER the lineage-resolve block (which
# may rewrite `sid`) but BEFORE _rearmActiveSessionStream() so the no-op
# guard and stream teardown are skipped in pane mode.
# ---------------------------------------------------------------------------
ANCHOR = (
    "  if(!opts.skipLineageResolve && typeof _resolveSessionIdFromSidebarLineage==='function'){\n"
    "    const resolvedSid=_resolveSessionIdFromSidebarLineage(sid);\n"
    "    if(resolvedSid&&resolvedSid!==sid) sid=resolvedSid;\n"
    "  }\n"
    "  const forceReload = !!opts.force;\n"
    "  const currentSid = S.session ? S.session.session_id : null;\n"
    "  const sameSessionForceReload = forceReload && currentSid===sid;\n"
)

# The text we replace ANCHOR with (same text + new short-path block).
ANCHOR_WITH_SHORT_PATH = (
    "  if(!opts.skipLineageResolve && typeof _resolveSessionIdFromSidebarLineage==='function'){\n"
    "    const resolvedSid=_resolveSessionIdFromSidebarLineage(sid);\n"
    "    if(resolvedSid&&resolvedSid!==sid) sid=resolvedSid;\n"
    "  }\n"
    "  // vulpy-loadsession-pane-short-path: when the assistant-ui pane owns the\n"
    "  // transcript, skip the expensive host-transcript work (draft save, INFLIGHT\n"
    "  // snapshot, scroll reset, render-window expansion). The pane reads the\n"
    "  // session store itself; the host only needs metadata + stream teardown/rearm.\n"
    "  // The pane sets window.__hermesAuiPaneOnly at mount (island); the old\n"
    "  // msgInner._hermesRendererActive flag was live-applied, never durable —\n"
    "  // rebuilds wiped it, so the short-path silently never fired (slow switching).\n"
    "  const _shortPathMsgInner = typeof $ === 'function' ? $('msgInner') : null;\n"
    "  if ((typeof window !== 'undefined' && window.__hermesAuiPaneOnly === true) ||\n"
    "      (_shortPathMsgInner && _shortPathMsgInner._hermesRendererActive)) {\n"
    "    return loadSessionPaneShortPath(sid, arguments[1] || {});\n"
    "  }\n"
    "  const forceReload = !!opts.force;\n"
    "  const currentSid = S.session ? S.session.session_id : null;\n"
    "  const sameSessionForceReload = forceReload && currentSid===sid;\n"
)

# ---------------------------------------------------------------------------
# The loadSessionPaneShortPath function is inserted immediately BEFORE the
# loadSession function declaration.  Anchor on the function declaration line.
# ---------------------------------------------------------------------------
FUNC_ANCHOR = "async function loadSession(sid){\n"

HELPER_FUNCTION = """\
// vulpy-loadsession-pane-short-path: lean session switch for pane-owned transcripts.
// The assistant-ui message-renderer pane polls its own bounded tail; the host
// only needs session metadata (title/settings/active_stream_id) + stream
// teardown so a previous session's SSE doesn't leak into the new one.
async function loadSessionPaneShortPath(sid, opts) {
  opts = opts || {};
  // 1. Lineage resolve: honour the same skip flag as the full path.
  if (!opts.skipLineageResolve && typeof _resolveSessionIdFromSidebarLineage === 'function') {
    const resolvedSid = _resolveSessionIdFromSidebarLineage(sid);
    if (resolvedSid && resolvedSid !== sid) sid = resolvedSid;
  }
  // 2. Mark as in-flight so concurrent calls supersede correctly.
  _loadingSessionId = sid;
  // 3. Teardown: close the previous session's per-turn chat stream AND the
  //    persistent session-scoped SSE so neither leaks into the new pane.
  //    The full loadSession() path closes other chat streams via
  //    closeOtherLiveStreams(); the short path only stopped the persistent
  //    channel, leaving the live /api/chat/stream EventSource OPEN — its
  //    tokens then kept rendering into the newly selected session's
  //    transcript (stream leak, reproduced 2026-08-16 on pane installs).
  const _prevSid = S.session ? S.session.session_id : null;
  if (typeof stopSessionStream === 'function') stopSessionStream();
  if (_prevSid && _prevSid !== sid && typeof closeOtherLiveStreams === 'function') {
    closeOtherLiveStreams(sid);
  }
  // A stale global S.activeStreamId for the session we are leaving keeps the
  // old stream's render paths alive (appendThinking/_doRender key on
  // S.activeStreamId, not on the session). Clear it + busy when the new pane
  // has no live stream of its own; the reattach path (INFLIGHT +
  // /api/chat/stream/status) restores them if the user returns mid-turn.
  if (_prevSid && _prevSid !== sid) {
    const _newPaneHasLiveStream = !!(typeof LIVE_STREAMS !== 'undefined' && LIVE_STREAMS[sid]);
    if (!_newPaneHasLiveStream) {
      if (S.activeStreamId) S.activeStreamId = null;
      if (S.busy) S.busy = false;
      if (typeof updateSendBtn === 'function') updateSendBtn();
    }
  }
  // 4. Metadata fetch — same endpoint as the full path; messages=0 keeps it tiny.
  let data;
  try {
    data = await api(`/api/session?session_id=${encodeURIComponent(sid)}&messages=0&resolve_model=0`);
  } catch (e) {
    if (_loadingSessionId === sid) _loadingSessionId = null;
    _rearmActiveSessionStream();
    return;
  }
  // 5. Stale-load guard: a newer switch may have started while we awaited.
  if (_loadingSessionId !== sid) {
    _rearmActiveSessionStream();
    return;
  }
  if (!data) {
    if (_loadingSessionId === sid) _loadingSessionId = null;
    _rearmActiveSessionStream();
    return;
  }
  // 6. Assign session metadata — the pane watches localStorage for the id.
  S.session = data.session;
  try { localStorage.setItem('hermes-webui-session', S.session.session_id); } catch (_) {}
  if (typeof _setActiveSessionUrl === 'function') _setActiveSessionUrl(S.session.session_id);
  if (_loadingSessionId === sid) _loadingSessionId = null;
  // 7. Re-arm the new session's stream.
  _rearmActiveSessionStream();
}

"""

FUNC_ANCHOR_WITH_HELPER = HELPER_FUNCTION + FUNC_ANCHOR


def apply(path: str) -> None:
    with open(path) as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print("already patched — loadSession pane short-path present")
        return

    # --- Patch A: insert short-path dispatch inside loadSession() ---
    n_anchor = _count(src, ANCHOR)
    if n_anchor != 1:
        print(
            f"ERROR: anchor for 'short-path dispatch' appears {n_anchor} times (expected 1):\n"
            f"  anchor not found or duplicated in {path}\n"
            f"  hermes-webui sessions.js changed shape — update "
            f"extensions/hermes-webui/scripts/patch-webui-loadsession-short-path.py",
            file=sys.stderr,
        )
        sys.exit(1)

    src = src.replace(ANCHOR, ANCHOR_WITH_SHORT_PATH, 1)
    print("  applied: short-path dispatch block inside loadSession()")

    # --- Patch B: prepend loadSessionPaneShortPath before loadSession ---
    n_func = _count(src, FUNC_ANCHOR)
    if n_func != 1:
        print(
            f"ERROR: anchor for 'loadSession function declaration' appears {n_func} times (expected 1):\n"
            f"  anchor not found or duplicated in {path}\n"
            f"  hermes-webui sessions.js changed shape — update "
            f"extensions/hermes-webui/scripts/patch-webui-loadsession-short-path.py",
            file=sys.stderr,
        )
        sys.exit(1)

    src = src.replace(FUNC_ANCHOR, FUNC_ANCHOR_WITH_HELPER, 1)
    print("  applied: loadSessionPaneShortPath helper function")

    with open(path, "w") as f:
        f.write(src)
    print(f"patched: sessions.js -> {path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(
            f"Usage: python3 {sys.argv[0]} /path/to/sessions.js",
            file=sys.stderr,
        )
        sys.exit(1)
    apply(sys.argv[1])

#!/usr/bin/env python3
"""Patch WebUI static scripts: cross-session stream-leak guards.

2026-08-16 reproduction (pane install, window.__hermesAuiPaneOnly=true):

1. Session A streams a turn (/api/chat/stream EventSource registered in
   LIVE_STREAMS[A], S.activeStreamId = A's stream id).
2. User switches to inactive session B. The Vulpy pane short path
   (patch-webui-loadsession-short-path.py) only stopped the persistent
   /api/session/stream channel; the per-turn chat EventSource stayed OPEN.
3. A's tokens kept arriving. The host render paths key on the GLOBAL
   S.activeStreamId (still A's stream id) and write into the CURRENT pane's
   DOM (#liveAssistantTurn / #thinkingRow inside msgInner), so A's answer
   kept appending into B's transcript ("old session messages begin appending
   to the current ones").

This patcher adds defense in depth on the host render/teardown paths so an
abandoned stream can never render into a different session's pane:

  messages.js:
    A. closeLiveStream() — when tearing down a NON-current session's stream,
       clear the stale global S.activeStreamId (and busy when no live stream
       remains for the current pane). Reattach restores it on switch-back.
    B. _doRender() — bail when the stream's session is no longer the current
       pane (a scheduled rAF can outlive a session switch).
    C. _restoreSettledSession() — bail before fetching/replacing global state
       when the stream's session is no longer the current pane.
  ui.js:
    D. appendThinking() — only render thinking for a stream OWNED by the
       currently viewed session (LIVE_STREAMS[sid].streamId ===
       S.activeStreamId); a stale stream's reasoning events must not pollute
       the new conversation.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once
    (upgrade drift → caught at build time, never silently skipped).
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH hermes-webui files.

Usage: python3 patch-webui-stream-switch-leak.py /path/to/messages.js /path/to/ui.js
"""

import sys

IDEMPOTENCY_MARK = "vulpy-stream-switch-leak"


def _count(haystack: str, needle: str) -> int:
    return haystack.count(needle)


def _replace_once(src: str, anchor: str, replacement: str, label: str, path: str) -> str:
    n = _count(src, anchor)
    if n != 1:
        print(
            f"ERROR: anchor for '{label}' appears {n} times (expected 1):\n"
            f"  anchor not found or duplicated in {path}\n"
            f"  hermes-webui static source changed shape — update "
            f"extensions/hermes-webui/scripts/patch-webui-stream-switch-leak.py",
            file=sys.stderr,
        )
        sys.exit(1)
    return src.replace(anchor, replacement, 1)


# ---------------------------------------------------------------------------
# messages.js — Patch A: closeLiveStream() clears stale global stream state
# ---------------------------------------------------------------------------
ANCHOR_A = (
    "  try{if(live.source&&live.source.readyState!==2)live.source.close();}catch(_){ }\n"
    "  delete LIVE_STREAMS[sessionId];\n"
)

ANCHOR_A_WITH_GUARD = (
    "  try{if(live.source&&live.source.readyState!==2)live.source.close();}catch(_){ }\n"
    "  delete LIVE_STREAMS[sessionId];\n"
    "  // The stream being torn down may belong to a session the user is no longer\n"
    "  // viewing (session-switch teardown). S.activeStreamId is a global: if it\n"
    "  // still points at this closed stream, clear it so the abandoned closure's\n"
    "  // render paths (which key on S.activeStreamId) become no-ops instead of\n"
    "  // writing into the NEW session's DOM (stream-leak fix, 2026-08-16) [vulpy-stream-switch-leak].\n"
    "  // Reattach (INFLIGHT + /api/chat/stream/status) restores it on switch-back.\n"
    "  if(!_isSessionCurrentPane(sessionId)){\n"
    "    if(S.activeStreamId&&S.activeStreamId===(live.streamId||streamId||null)) S.activeStreamId=null;\n"
    "    if(!_chatStreamActiveForSession(S.session&&S.session.session_id)&&S.busy){\n"
    "      S.busy=false;\n"
    "      if(typeof updateSendBtn==='function') updateSendBtn();\n"
    "    }\n"
    "  }\n"
)

# ---------------------------------------------------------------------------
# messages.js — Patch B: _doRender() pane guard
# ---------------------------------------------------------------------------
ANCHOR_B = (
    "      // Guard: a pending setTimeout+rAF can outlive stream finalization.\n"
    "      if(_streamFinalized) return;\n"
)

ANCHOR_B_WITH_GUARD = (
    "      // Guard: a pending setTimeout+rAF can outlive stream finalization.\n"
    "      if(_streamFinalized) return;\n"
    "      // Cross-session guard: this rAF can outlive a session switch (scheduled\n"
    "      // before the user navigated away). The closure's assistantBody/liveTurn\n"
    "      // elements belong to whatever session is CURRENT now — never write an\n"
    "      // abandoned stream into the new pane (stream-leak fix, 2026-08-16) [vulpy-stream-switch-leak].\n"
    "      if(!_isSessionCurrentPane(activeSid)) return;\n"
)

# ---------------------------------------------------------------------------
# messages.js — Patch C: _restoreSettledSession() pane guard. Anchor includes
# the following `try{ const data=await api(` line so it cannot collide with
# the similar early-return in _handleStreamError() (which returns bare `return;`).
# ---------------------------------------------------------------------------
ANCHOR_C = (
    "    if(_isActiveSession() && S.activeStreamId!==streamId){\n"
    "      _closeSource(source);\n"
    "      return returnStatus?'stale':false;\n"
    "    }\n"
    "    try{\n"
    "      const data=await api(`/api/session?session_id=${encodeURIComponent(activeSid)}`);\n"
)

ANCHOR_C_WITH_GUARD = (
    "    if(_isActiveSession() && S.activeStreamId!==streamId){\n"
    "      _closeSource(source);\n"
    "      return returnStatus?'stale':false;\n"
    "    }\n"
    "    // Cross-session guard: the user may have switched panes while this settle\n"
    "    // was pending. Fetching/replacing global state for a backgrounded session\n"
    "    // would stamp its transcript into the current view (stream-leak fix,\n"
    "    // 2026-08-16) [vulpy-stream-switch-leak]. The error path already checks\n"
    "    // _isSessionCurrentPane before invoking us; this covers stream_end and\n"
    "    // deferred-restore callers.\n"
    "    if(!_isSessionCurrentPane(activeSid)){\n"
    "      _closeSource(source);\n"
    "      return returnStatus?'stale':false;\n"
    "    }\n"
    "    try{\n"
    "      const data=await api(`/api/session?session_id=${encodeURIComponent(activeSid)}`);\n"
)

# ---------------------------------------------------------------------------
# ui.js — Patch D: appendThinking() owner guard
# ---------------------------------------------------------------------------
ANCHOR_D = (
    "  options=options||{};\n"
    "  const allowPendingPlaceholder=!!(options&&options.pending===true);\n"
    "  if(!S.session||(!S.activeStreamId&&!allowPendingPlaceholder)) return;\n"
)

ANCHOR_D_WITH_GUARD = (
    "  options=options||{};\n"
    "  const allowPendingPlaceholder=!!(options&&options.pending===true);\n"
    "  if(!S.session||(!S.activeStreamId&&!allowPendingPlaceholder)) return;\n"
    "  // Cross-session stream guard: appendThinking writes into the CURRENT pane's\n"
    "  // DOM, but S.activeStreamId is a global that can outlive the session it\n"
    "  // belongs to (pane-mode session switch leaves it pointing at the abandoned\n"
    "  // stream). Only render thinking for a stream owned by the viewed session;\n"
    "  // a stale stream's reasoning must not keep polluting the new conversation\n"
    "  // (stream-leak fix, 2026-08-16) [vulpy-stream-switch-leak].\n"
    "  if(S.activeStreamId&&!allowPendingPlaceholder){\n"
    "    if(typeof _isSessionCurrentPane==='function'&&!_isSessionCurrentPane(S.session.session_id)) return;\n"
    "    if(typeof LIVE_STREAMS!=='undefined'){\n"
    "      let _streamOwnsCurrentPane=false;\n"
    "      for(const _sid of Object.keys(LIVE_STREAMS)){\n"
    "        const _e=LIVE_STREAMS[_sid];\n"
    "        if(_e&&_e.streamId===S.activeStreamId){_streamOwnsCurrentPane=(_sid===S.session.session_id);break;}\n"
    "      }\n"
    "      if(!_streamOwnsCurrentPane) return;\n"
    "    }\n"
    "  }\n"
)


def apply(messages_js: str, ui_js: str) -> None:
    with open(messages_js) as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print("already patched — messages.js stream-switch-leak guards present")
    else:
        src = _replace_once(src, ANCHOR_A, ANCHOR_A_WITH_GUARD, "closeLiveStream teardown", messages_js)
        print("  applied: closeLiveStream stale-global cleanup (messages.js)")
        src = _replace_once(src, ANCHOR_B, ANCHOR_B_WITH_GUARD, "_doRender pane guard", messages_js)
        print("  applied: _doRender pane guard (messages.js)")
        src = _replace_once(src, ANCHOR_C, ANCHOR_C_WITH_GUARD, "_restoreSettledSession pane guard", messages_js)
        print("  applied: _restoreSettledSession pane guard (messages.js)")
        with open(messages_js, "w") as f:
            f.write(src)
        print(f"patched: messages.js -> {messages_js}")

    with open(ui_js) as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print("already patched — ui.js stream-switch-leak guards present")
    else:
        src = _replace_once(src, ANCHOR_D, ANCHOR_D_WITH_GUARD, "appendThinking owner guard", ui_js)
        with open(ui_js, "w") as f:
            f.write(src)
        print(f"patched: ui.js -> {ui_js}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(
            f"Usage: python3 {sys.argv[0]} /path/to/messages.js /path/to/ui.js",
            file=sys.stderr,
        )
        sys.exit(1)
    apply(sys.argv[1], sys.argv[2])

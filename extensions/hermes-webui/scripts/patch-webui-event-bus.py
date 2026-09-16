#!/usr/bin/env python3
"""Patch WebUI host to emit Hermes Event Bus lifecycle events (issue #142).

Round-1 of #142 implemented the assistant-ui pane side: the island subscribes
to window.HermesBus events (hermes:message-sent, hermes:run-started,
hermes:run-completed, hermes:session-changed, hermes:steer-sent) and renders
optimistic bubbles / typing / error cards instantly instead of waiting for
the 2s settled poll.  THIS patcher is the durable host side: it injects the
bus singleton and the emit calls at verified host anchors so a rebuilt image
keeps emitting — a live edit would silently vanish on the next rebuild.

Files patched (all verified against the pristine base on 2026-08-14):

  1. static/ui.js        — the HermesBus singleton + a global _hermesBusEmit()
                           helper, injected right after the top-level
                           `const S={session:null ...};` line.  ui.js loads
                           FIRST (index.html order), so the bus exists before
                           any emit site runs.
  2. static/sessions.js  — hermes:session-changed emitted inside
                           _setActiveSessionUrl() (the single function all
                           session-change paths funnel through: new-chat,
                           loadSession full path, and the pane short-path
                           helper).  Detail: {sessionId, ts}.
  3. static/commands.js  — hermes:steer-sent emitted after the accepted
                           /api/chat/steer result.  Detail:
                           {sessionId, runId, text, ts} — text is the accepted
                           steer payload (steerText).
  4. static/messages.js  — five emit sites:
                             * hermes:message-sent after the host's optimistic
                               user-row push (S.messages.push(userMsg)).
                               Detail: {sessionId, text, ts} (the host has no
                               per-row id — the pane dedupes by text+ts).
                             * hermes:run-started once /api/chat/start
                               resolved (stream_id known).
                             * hermes:run-completed on the terminal paths:
                               done (ok:true), cancel (ok:false), and
                               _handleStreamError (ok:false, error:
                               'stream_error') — the actual terminal error
                               point, NOT the raw EventSource error listener
                               (which reconnects and is not terminal).
                             * hermes:stream-event (2026-08-17): raw
                               /api/chat/stream events (token, reasoning,
                               tool, tool_complete, done, stream_end, cancel,
                               apperror) forwarded from _wireSSE so the pane
                               renders live turns without a duplicate
                               EventSource (connection-pool fix). Applied
                               independently of the five emits above — an
                               already-patched file gains it on re-run.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH hermes-webui files (same shape as the pristine base).

Usage:
  python3 patch-webui-event-bus.py /app/hermes-webui/static/ui.js \
      /app/hermes-webui/static/sessions.js \
      /app/hermes-webui/static/commands.js \
      /app/hermes-webui/static/messages.js
"""

import sys

# ---------------------------------------------------------------------------
# Per-file idempotency marks (each appears inside that file's injected text).
# ---------------------------------------------------------------------------
MARK_UI = "vulpy-hermes-event-bus"
MARK_SESSIONS = "vulpy-hermes-session-changed"
MARK_COMMANDS = "vulpy-hermes-steer-sent"
MARK_MESSAGES = "vulpy-hermes-message-sent"
MARK_STREAM = "vulpy-hermes-stream-event"

# ---------------------------------------------------------------------------
# ui.js — bus singleton + host emit helper after the top-level S declaration.
# ---------------------------------------------------------------------------
UI_ANCHOR = "const S={session:null"
UI_OLD = (
    "const S={session:null,messages:[],entries:[],busy:false,pendingFiles:[],"
    "toolCalls:[],activeStreamId:null,currentDir:'.',activeProfile:'default',"
    "activeProfileIsDefault:true,showHiddenWorkspaceFiles:false,todos:[],"
    "todoStateMeta:null,_pendingSessionToolsets:null};"
)
UI_NEW = UI_OLD + """
// ── Hermes Event Bus (issue #142, optimistic UI) ──────────────────────────
// Typed, namespaced custom event bus on window.HermesBus. The HOST emits
// lifecycle events (hermes:message-sent / hermes:run-started /
// hermes:run-completed / hermes:session-changed / hermes:steer-sent); the
// assistant-ui pane and future panels subscribe. Live-only, no replay —
// subscribers reconcile via their own polls. Singleton: if the pane's
// fallback already created it (tests / split mode), reuse it.
// vulpy-hermes-event-bus
if(!window.HermesBus){
  const _hermesBusHandlers=new Map();
  window.HermesBus={
    emit(type,detail){
      const set=_hermesBusHandlers.get(type);
      if(set){set.forEach(function(h){try{h(detail||{});}catch(_){}});}
      try{window.dispatchEvent(new CustomEvent(type,{detail:detail||{}}));}catch(_){}
    },
    subscribe(type,handler){
      let set=_hermesBusHandlers.get(type);
      if(!set){set=new Set();_hermesBusHandlers.set(type,set);}
      set.add(handler);
      return function(){set.delete(handler);};
    },
    _handlers:_hermesBusHandlers,
  };
}
// Host emit helper — safe no-op when the bus is absent (stray/unpatched
// context). Used by the patched emit sites in sessions.js, commands.js and
// messages.js. Top-level function declaration in a classic script, so it is
// reachable as a window global from every later script.
function _hermesBusEmit(type,detail){try{if(window.HermesBus){window.HermesBus.emit(type,detail||{});}}catch(_){}}
"""

# ---------------------------------------------------------------------------
# sessions.js — hermes:session-changed inside _setActiveSessionUrl().
# Every session-change path calls this function: new-chat creation, the full
# loadSession path, AND the pane short-path helper (which also calls it) —
# one injection point covers all of them.
# ---------------------------------------------------------------------------
SESSIONS_ANCHOR = "function _setActiveSessionUrl(sid){"
SESSIONS_OLD = (
    "function _setActiveSessionUrl(sid){\n"
    "  if(typeof window==='undefined'||!window.history||!sid) return;"
)
SESSIONS_NEW = SESSIONS_OLD + """
  // Hermes event bus: active session changed (issue #142). Fires on every
  // session-change path (new chat, loadSession full path, pane short path).
  // vulpy-hermes-session-changed
  try{_hermesBusEmit('hermes:session-changed',{sessionId:sid,ts:Date.now()/1000});}catch(_){}
"""

# ---------------------------------------------------------------------------
# commands.js — hermes:steer-sent after the accepted steer result.
# ---------------------------------------------------------------------------
COMMANDS_ANCHOR = "if(result&&result.accepted){"
COMMANDS_OLD = "  if(result&&result.accepted){"
COMMANDS_NEW = COMMANDS_OLD + """
    // Hermes event bus: steer delivered (issue #142) — transient indicator.
    // vulpy-hermes-steer-sent
    try{_hermesBusEmit('hermes:steer-sent',{sessionId:ownerSid,runId:ownerStreamId,text:steerText,ts:Date.now()/1000});}catch(_){}
"""

# ---------------------------------------------------------------------------
# messages.js — five emit sites.
# ---------------------------------------------------------------------------
MSGS_ANCHOR_SENT = "S.messages.push(userMsg);renderMessages();setBusy(true);"
MSGS_OLD_SENT = "    S.messages.push(userMsg);renderMessages();setBusy(true);"
MSGS_NEW_SENT = MSGS_OLD_SENT + """
    // Hermes event bus: user message sent (issue #142) — instant pane bubble.
    // vulpy-hermes-message-sent
    try{_hermesBusEmit('hermes:message-sent',{sessionId:activeSid,text:displayText,ts:userMsg._ts||Date.now()/1000});}catch(_){}
"""

MSGS_ANCHOR_START = "const startData = postStartData || {};"
MSGS_OLD_START = (
    "  const startData = postStartData || {};\n"
    "  streamId = postStartData ? postStartData.stream_id : null;\n"
    "  S.activeStreamId = streamId;"
)
MSGS_NEW_START = MSGS_OLD_START + """
  // Hermes event bus: run started (issue #142) — pane flips optimistic rows
  // to sent, shows the typing indicator, and streams via /v1/runs/{id}/events.
  try{_hermesBusEmit('hermes:run-started',{sessionId:activeSid,runId:streamId||undefined,streamId:streamId||undefined,ts:Date.now()/1000});}catch(_){}
"""

MSGS_ANCHOR_DONE = "source.addEventListener('done',e=>{"
MSGS_OLD_DONE = (
    "    source.addEventListener('done',e=>{\n"
    "      if(_streamFinalized) return;\n"
    "      _clearStreamEndRecovery();\n"
    "      if(_bailOutOfTerminalEventsFromStaleStream(source)) return;"
)
MSGS_NEW_DONE = MSGS_OLD_DONE + """
      // Hermes event bus: run completed OK (issue #142).
      try{_hermesBusEmit('hermes:run-completed',{sessionId:activeSid,runId:streamId,ok:true,ts:Date.now()/1000});}catch(_){}
"""

MSGS_ANCHOR_CANCEL = "source.addEventListener('cancel',e=>{"
MSGS_OLD_CANCEL = (
    "    source.addEventListener('cancel',e=>{\n"
    "      if(_bailOutOfTerminalEventsFromStaleStream(source)) return;\n"
    "      _clearStreamEndRecovery();"
)
MSGS_NEW_CANCEL = MSGS_OLD_CANCEL + """
      // Hermes event bus: run cancelled (issue #142).
      try{_hermesBusEmit('hermes:run-completed',{sessionId:activeSid,runId:streamId,ok:false,ts:Date.now()/1000});}catch(_){}
"""

MSGS_ANCHOR_ERROR = "function _handleStreamError(source){"
MSGS_OLD_ERROR = (
    "  function _handleStreamError(source){\n"
    "    if(_isActiveSession() && S.activeStreamId!==streamId){\n"
    "      _closeSource(source);\n"
    "      return;\n"
    "    }\n"
    "    _clearStreamEndRecovery();"
)
MSGS_NEW_ERROR = MSGS_OLD_ERROR + """
    // Hermes event bus: run failed (issue #142). _handleStreamError is the
    // terminal error point — the raw EventSource error listener reconnects.
    try{_hermesBusEmit('hermes:run-completed',{sessionId:activeSid,runId:streamId,ok:false,error:'stream_error',ts:Date.now()/1000});}catch(_){}
"""

# ---------------------------------------------------------------------------
# messages.js — hermes:stream-event passthrough inside _wireSSE (2026-08-17).
# The assistant-ui pane used to open a SECOND /api/chat/stream EventSource to
# render live turns. With the host owning the only stream socket, raw events
# are forwarded over the bus and the pane renders from them — one same-origin
# connection during runs instead of two (Chrome's 6-connection HTTP/1.1 pool
# was saturated by the duplicate subscriber + persistent SSEs, which stalled
# session-switch fetches and hung the whole UI). Applied INDEPENDENTLY of the
# five lifecycle emits above so already-patched files gain this block on
# re-run (the old whole-file MARK_MESSAGES gate would skip it otherwise).
# ---------------------------------------------------------------------------
MSGS_ANCHOR_WIRE = "LIVE_STREAMS[activeSid]={streamId,source};"
MSGS_OLD_WIRE = "    LIVE_STREAMS[activeSid]={streamId,source};"
MSGS_NEW_WIRE = MSGS_OLD_WIRE + """
    // Vulpy: forward raw /api/chat/stream events to the Hermes Bus so the
    // assistant-ui pane renders live turns WITHOUT a duplicate EventSource
    // (connection-pool fix, 2026-08-17).
    // vulpy-hermes-stream-event
    try{
      const _vulpyStreamTypes=['token','reasoning','tool','tool_complete','done','stream_end','cancel','apperror'];
      for(let _i=0;_i<_vulpyStreamTypes.length;_i++){
        const _t=_vulpyStreamTypes[_i];
        source.addEventListener(_t,function(e){
          try{_hermesBusEmit('hermes:stream-event',{sessionId:activeSid,streamId:streamId||null,eventType:_t,data:String((e&&e.data)||'')});}catch(_){}
        });
      }
    }catch(_){}
"""


def _count(haystack: str, needle: str) -> int:
    return haystack.count(needle)


def _fail(label: str, anchor: str, count: int, path: str) -> None:
    print(
        f"ERROR: anchor for {label} appears {count} times (expected 1):\n"
        f"  anchor: {anchor[:120]!r}\n"
        f"  File: {path}\n"
        f"  Hermes changed shape — update "
        f"extensions/hermes-webui/scripts/patch-webui-event-bus.py",
        file=sys.stderr,
    )
    sys.exit(1)


def _apply_ui(path: str) -> None:
    with open(path) as f:
        src = f.read()
    if MARK_UI in src:
        print(f"already patched — event bus present ({path})")
        return
    n = _count(src, UI_ANCHOR)
    if n != 1:
        _fail("ui.js bus singleton", UI_ANCHOR, n, path)
    if UI_OLD not in src:
        print(
            f"ERROR: old text for 'ui.js bus singleton' not found in {path}\n"
            f"  old starts with: {UI_OLD[:80]!r}",
            file=sys.stderr,
        )
        sys.exit(1)
    src = src.replace(UI_OLD, UI_NEW, 1)
    with open(path, "w") as f:
        f.write(src)
    print(f"  applied: HermesBus singleton + _hermesBusEmit helper ({path})")


def _apply_sessions(path: str) -> None:
    with open(path) as f:
        src = f.read()
    if MARK_SESSIONS in src:
        print(f"already patched — session-changed emit present ({path})")
        return
    n = _count(src, SESSIONS_ANCHOR)
    if n != 1:
        _fail("sessions.js session-changed", SESSIONS_ANCHOR, n, path)
    if SESSIONS_OLD not in src:
        print(
            f"ERROR: old text for 'sessions.js session-changed' not found in {path}\n"
            f"  old starts with: {SESSIONS_OLD[:80]!r}",
            file=sys.stderr,
        )
        sys.exit(1)
    src = src.replace(SESSIONS_OLD, SESSIONS_NEW, 1)
    with open(path, "w") as f:
        f.write(src)
    print(f"  applied: hermes:session-changed emit ({path})")


def _apply_commands(path: str) -> None:
    with open(path) as f:
        src = f.read()
    if MARK_COMMANDS in src:
        print(f"already patched — steer-sent emit present ({path})")
        return
    n = _count(src, COMMANDS_ANCHOR)
    if n != 1:
        _fail("commands.js steer-sent", COMMANDS_ANCHOR, n, path)
    if COMMANDS_OLD not in src:
        print(
            f"ERROR: old text for 'commands.js steer-sent' not found in {path}\n"
            f"  old starts with: {COMMANDS_OLD[:80]!r}",
            file=sys.stderr,
        )
        sys.exit(1)
    src = src.replace(COMMANDS_OLD, COMMANDS_NEW, 1)
    with open(path, "w") as f:
        f.write(src)
    print(f"  applied: hermes:steer-sent emit ({path})")


def _apply_messages(path: str) -> None:
    with open(path) as f:
        src = f.read()
    if MARK_MESSAGES not in src:
        for label, anchor, old, new in (
            ("messages.js message-sent", MSGS_ANCHOR_SENT, MSGS_OLD_SENT, MSGS_NEW_SENT),
            ("messages.js run-started", MSGS_ANCHOR_START, MSGS_OLD_START, MSGS_NEW_START),
            ("messages.js run-completed done", MSGS_ANCHOR_DONE, MSGS_OLD_DONE, MSGS_NEW_DONE),
            ("messages.js run-completed cancel", MSGS_ANCHOR_CANCEL, MSGS_OLD_CANCEL, MSGS_NEW_CANCEL),
            ("messages.js run-completed error", MSGS_ANCHOR_ERROR, MSGS_OLD_ERROR, MSGS_NEW_ERROR),
        ):
            n = _count(src, anchor)
            if n != 1:
                _fail(label, anchor, n, path)
            if old not in src:
                print(
                    f"ERROR: old text for {label} not found in {path}\n"
                    f"  old starts with: {old[:80]!r}",
                    file=sys.stderr,
                )
                sys.exit(1)
            src = src.replace(old, new, 1)
            print(f"  applied: {label}")
    else:
        print("already patched — message-sent/run emits present")
    # Stream-event passthrough (2026-08-17): applied independently of the
    # five lifecycle emits so an already-patched messages.js gains the block
    # on re-run (the whole-file MARK_MESSAGES gate above would skip it).
    if MARK_STREAM in src:
        print("already patched — hermes:stream-event passthrough present")
    else:
        n = _count(src, MSGS_ANCHOR_WIRE)
        if n != 1:
            _fail("messages.js stream-event passthrough", MSGS_ANCHOR_WIRE, n, path)
        if MSGS_OLD_WIRE not in src:
            print(
                f"ERROR: old text for 'messages.js stream-event passthrough' not found in {path}\n"
                f"  old starts with: {MSGS_OLD_WIRE[:80]!r}",
                file=sys.stderr,
            )
            sys.exit(1)
        src = src.replace(MSGS_OLD_WIRE, MSGS_NEW_WIRE, 1)
        print("  applied: hermes:stream-event passthrough (messages.js)")
    with open(path, "w") as f:
        f.write(src)
    print(f"patched: messages.js -> {path}")


def main() -> None:
    if len(sys.argv) != 5:
        print(
            f"Usage: python3 {sys.argv[0]} /path/to/ui.js /path/to/sessions.js "
            f"/path/to/commands.js /path/to/messages.js",
            file=sys.stderr,
        )
        sys.exit(1)
    _apply_ui(sys.argv[1])
    _apply_sessions(sys.argv[2])
    _apply_commands(sys.argv[3])
    _apply_messages(sys.argv[4])


if __name__ == "__main__":
    main()

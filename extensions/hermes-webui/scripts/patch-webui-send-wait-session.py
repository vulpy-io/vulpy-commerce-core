#!/usr/bin/env python3
"""patch-webui-send-wait-session.py

Host-side guard for the WebUI input/session-sync bug: after a page/PWA
refresh, typing in the composer during the boot window used to spawn a NEW
session instead of continuing the selected chat.

Root cause (established by prior coder):
  - On refresh the host restores the selected session via loadSession()
    (async). While that is in flight, S.session is null.
  - The island transcript resolves the session from
    localStorage["hermes-webui-session"] instantly, so it SHOWS chat X.
  - If the user types + sends before loadSession() resolves, host send()
    hits `if(!S.session){await newSession()}` (messages.js) and creates a
    FRESH session. The message lands in a new chat while the transcript
    showed X. Native WebUI doesn't have this because S.session is shared
    between render and send; the island split them.

Fix (this patch):
  In send(), when S.session is null but a saved session exists (boot/restore
  in-flight), WAIT for the restore instead of calling newSession(). Only if
  no saved session exists (genuine new chat) fall through to newSession().

  Injection targets (upstream messages.js, never rebuilt):
    Anchor A: `async function send(){`              (function declaration)
    Anchor B: `if(!S.session){await newSession();await renderSessionList();}`
                                                    (the newSession fallback)

  Applied by: Dockerfile.hermes (build-time, fails loudly on anchor drift).

  Idempotent: re-run prints "already patched" and exits 0 without changes.
"""

import sys
from pathlib import Path

IDEMPOTENCY_MARK = "vulpy-send-wait-session"

HELPER = r"""
// vulpy-send-wait-session: wait for the boot-time session restore instead of
// creating a fresh session. Returns the restored session id, or null when no
// saved session exists (genuine new chat) or the restore did not resolve.
async function _hermesWaitForRestoredSession(){
  try{
    if(!(typeof S!=='undefined'&&S)) return null;
    if(S.session&&S.session.session_id) return S.session.session_id;
    const _saved=(typeof _sessionIdFromLocation==='function')?_sessionIdFromLocation():null;
    const _fromLocal=(typeof localStorage!=='undefined')?(localStorage.getItem('hermes-webui-session')||null):null;
    const _target=_saved||_fromLocal||null;
    if(!_target){
      // Nothing to restore — allow newSession() to run (fresh chat).
      return null;
    }
    const _start=Date.now();
    const _budgetMs=4000;
    while(Date.now()-_start<_budgetMs){
      if(S.session&&S.session.session_id){
        if(S.session.session_id===_target) return S.session.session_id;
        // A DIFFERENT session became active (user switched). Honor it — never
        // force the send into the stale saved id.
        return S.session.session_id;
      }
      await new Promise(r=>setTimeout(r,80));
    }
    // Restore did not resolve in time — bail to the caller's fallback.
    return null;
  }catch(_e){
    return null;
  }
}

"""


def patch_messages(src: str) -> str:
    """Insert the helper before send() and replace the newSession fallback."""
    # Anchor A: the send() declaration (used for both the helper insertion
    # point and as a fail-loud drift check).
    send_anchor = "async function send(){"
    if IDEMPOTENCY_MARK in src:
        print("already patched — messages.js send-wait-session guard present")
        return src
    if src.count(send_anchor) != 1:
        sys.exit(f"[vulpy-send-wait-session] ERROR: anchor {send_anchor!r} not found exactly once in messages.js — upstream drift?")
    if "await newSession();await renderSessionList();" not in src:
        sys.exit("[vulpy-send-wait-session] ERROR: newSession fallback anchor not found in messages.js — upstream drift?")

    # 1. Insert the helper immediately before the send() declaration.
    helper = HELPER.lstrip("\n")
    src = src.replace(send_anchor, helper + send_anchor, 1)

    # 2. Replace the bare newSession fallback in the MAIN send() path only.
    #    The same fallback string appears (deeper-indented) in slash-command
    #    handlers and the busy branch, which are NOT the prime composer path
    #    and must keep their behavior — so anchor on the exact 2-space parent
    #    line that precedes `const activeSid=S.session.session_id;` (the
    #    normal send continuation). This avoids replacing a matching
    #    substring inside a deeper-indented fallback.
    # The main send() fallback line sits at 2-space indent and is followed
    # directly by `const activeSid=...`. Anchor on that pairing.
    main_anchor = (
        "  if(!S.session){await newSession();await renderSessionList();}\n"
        "\n"
        "  const activeSid=S.session.session_id;"
    )
    if main_anchor not in src:
        sys.exit(
            "[vulpy-send-wait-session] ERROR: main send() newSession fallback "
            "anchor (2-space line before `const activeSid=`) not found — "
            "upstream drift?"
        )
    old_fallback = (
        "  if(!S.session){await newSession();await renderSessionList();}\n"
        "\n"
        "  const activeSid=S.session.session_id;"
    )
    new_fallback = (
        "  if(!S.session){\n"
        "    const _restoredSid=await _hermesWaitForRestoredSession();\n"
        "    if(!_restoredSid){await newSession();await renderSessionList();}\n"
        "  }\n"
        "\n"
        "  const activeSid=S.session.session_id;"
    )
    src = src.replace(old_fallback, new_fallback, 1)
    return src


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: patch-webui-send-wait-session.py <path/to/messages.js>", file=sys.stderr)
        return 1
    path = Path(sys.argv[1])
    if not path.exists():
        print(f"[vulpy-send-wait-session] ERROR: {path} does not exist", file=sys.stderr)
        return 1
    src = path.read_text(encoding="utf-8")
    patched = patch_messages(src)
    if patched is not src:
        path.write_text(patched, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
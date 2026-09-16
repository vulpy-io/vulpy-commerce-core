#!/usr/bin/env python3
"""Apply the persistent paint-first WebUI stream-settle patch.

The target messages.js is baked into the Hermes image. This patcher runs from the
bind-mounted checkout at container startup so the change survives image rebuilds.
It is intentionally exact: upstream changes leave the file untouched and return
non-zero rather than applying a fuzzy, potentially unsafe transformation.
"""

from __future__ import annotations

import sys
from pathlib import Path

TARGET = Path(sys.argv[1]) if len(sys.argv) == 2 else Path("/app/hermes-webui/static/messages.js")

OLD_SETTLE = """          syncTopbar();renderMessages({preserveScroll:true});
          if(typeof _disarmKeepSettledWorklogOpen==='function') _disarmKeepSettledWorklogOpen();
          if(typeof _renderMessagesWithScrollSnapshot==='function') _renderMessagesWithScrollSnapshot();
          else renderMessages({preserveScroll:true});
          if(shouldFollowOnDone&&typeof scrollToBottom==='function') scrollToBottom();
          if(typeof noteWorkspaceMutationsFromToolCalls==='function') noteWorkspaceMutationsFromToolCalls(S.toolCalls);
          loadDir('.', { preservePreview: true });
          // TTS auto-read: speak the last assistant response if enabled (#499)
          if(typeof autoReadLastAssistant==='function') setTimeout(()=>autoReadLastAssistant(), 300);"""

NEW_SETTLE = """          // Paint-first settle: the live DOM is already correct from the stream.
          // Skip the full renderMessages() - it wipes innerHTML, scans all messages,
          // snapshots/restores scroll position, and blocks the paint.
          syncTopbar();clearLiveToolCards();
          if(typeof finalizeThinkingCard==='function') finalizeThinkingCard();
          if(typeof _disarmKeepSettledWorklogOpen==='function') _disarmKeepSettledWorklogOpen();
          if(shouldFollowOnDone&&typeof scrollToBottom==='function') scrollToBottom();
          // Defer non-essential side effects to the next frame.
          setTimeout(function(){
            if(typeof noteWorkspaceMutationsFromToolCalls==='function') noteWorkspaceMutationsFromToolCalls(S.toolCalls);
            loadDir('.', { preservePreview: true });
            if(typeof autoReadLastAssistant==='function') autoReadLastAssistant();
          }, 0);"""

OLD_SIDEBAR = """        renderSessionList();
        _setActivePaneIdleIfOwner();
        playNotificationSound();"""

NEW_SIDEBAR = """        // Defer non-essential UI to the next frame.
        setTimeout(function(){
          renderSessionList();
          _setActivePaneIdleIfOwner();
          playNotificationSound();
        }, 0);"""


def replace_once_or_already(text: str, old: str, new: str, label: str) -> tuple[str, bool]:
    if new in text:
        return text, False
    if text.count(old) != 1:
        raise RuntimeError(f"upstream {label} block was not found exactly once")
    return text.replace(old, new, 1), True


def main() -> int:
    if not TARGET.is_file():
        print(f"[vulpy] WARN: WebUI target missing: {TARGET}", file=sys.stderr)
        return 1

    original = TARGET.read_text()
    try:
        patched, changed_settle = replace_once_or_already(original, OLD_SETTLE, NEW_SETTLE, "settle")
        patched, changed_sidebar = replace_once_or_already(patched, OLD_SIDEBAR, NEW_SIDEBAR, "sidebar")
    except RuntimeError as exc:
        print(f"[vulpy] WARN: paint-first patch not applied: {exc}", file=sys.stderr)
        return 2

    if patched != original:
        TARGET.write_text(patched)
        print("[vulpy] Paint-first done handler: applied to messages.js")
    else:
        print("[vulpy] Paint-first done handler: already applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

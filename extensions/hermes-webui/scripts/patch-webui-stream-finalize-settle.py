#!/usr/bin/env python3
"""Patch static/messages.js: two-phase stream finalize settle (S1 fix).

Problem (task webui-stream-finalize-integrity, S1 — "finalize wipe"):
scripts/patch-hermes-webui-paint-first.py replaced the canonical post-`done`
settle (`renderMessages({preserveScroll:true})` rebuild) with an unconditional
skip. That is only correct while the live DOM really IS the settled transcript.
Three finalize behaviors violate that assumption:

  1. `_clearAnchorProseIncrementalNode()` + `clearLiveToolCards()` at done
     discard the live scene rows the stream painted; historically the skipped
     renderMessages() was the step that rebuilt everything from the merged
     `S.messages`. With the skip, nothing re-renders when a later step clobbers
     state → finished answer disappears ("absent until page reload").
  2. The session merge in the done handler can leave a stale/partial transcript
     (server persist raced the SSE emit); without the canonical rebuild that
     stale view becomes permanent.
  3. Cross-pane `INFLIGHT[sid].liveTurnHtml` restore can remount a
     PRE-completion live snapshot; without a canonical rebuild the stale view
     sticks.

Fix — TWO-PHASE SETTLE (never unmount-before-mounted):

  PHASE 1 (verify): after merging `d.session` into S.messages, verify the
  canonical settled assistant content is actually present and mounted:
    - data check: the settled last-assistant message exists in S.messages with
      non-empty visible text (markers-only/whitespace tolerated upstream);
    - DOM check: a settled assistant row/segment carrying that text is present
      (raw-text match on `.msg-row[data-role="assistant"]` /
      `.assistant-segment[data-raw-text]`, content-text match as fallback).
  PHASE 2 (atomic swap): ONLY on verification success run the cheap paint-first
  path (no rebuild). On ANY verification failure fall back to the canonical
  `renderMessages({preserveScroll:true})` rebuild from authoritative state
  BEFORE clearing live tool cards / anchor prose nodes.

The helper is injected next to `_restoreSettledSession` so it shares the same
scope (S, and the completed entry's object identity), and is exposed on window
for tests.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once;
    upstream shape changes must break the build/boot visibly, never silently.
  - Idempotent: re-run prints "already patched" and exits 0.
  - Composes AFTER paint-first: its anchor is exactly the block paint-first
    installs; it must not be applied to un-paint-first bundles.

Usage: python3 patch-webui-stream-finalize-settle.py /path/to/messages.js
"""

import re
import sys

IDEMPOTENCY_MARK = "[vulpy-stream-finalize-settle-v2]"
PREVIOUS_IDEMPOTENCY_MARK = "[vulpy-stream-finalize-settle]"
OLD_DOM_SELECTOR = '.msg-row[data-role="assistant"], .assistant-segment[data-raw-text]'
NEW_DOM_SELECTOR = '.msg-row[data-role="assistant"], .assistant-segment[data-raw-text], [data-live-assistant="1"]'

# ---------------------------------------------------------------------------
# Anchor 0 — the earlier live-scene teardown in the done handler. It is
# deferred so the verified settle branch owns teardown ordering.
# ---------------------------------------------------------------------------
ANCHOR_EARLY_TEARDOWN = "_clearAnchorProseIncrementalNode();"
ANCHOR_LIVE_CARD_TEARDOWN = "clearLiveToolCards();"
REPLACEMENT_EARLY_TEARDOWN = "/* [vulpy-stream-finalize-settle-v2] done teardown deferred to verified settle */"
REPLACEMENT_LIVE_CARD_TEARDOWN = "/* [vulpy-stream-finalize-settle-v2] live cards deferred to verified settle */"


def _matching_brace(src: str, opening: int) -> int:
    """Find a JS brace pair after masking literals and comments."""
    suffix = src[opening:]
    masked = re.sub(
        r"//[^\n]*|/\*[\s\S]*?\*/|'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`",
        lambda match: " " * len(match.group(0)),
        suffix,
    )
    depth = 0
    for offset, char in enumerate(masked):
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return opening + offset
    return -1


def _find_finalize_handler_ranges(src: str) -> list[tuple[int, int]]:
    """Return the structurally delimited done-listener scope only."""
    ranges = []
    needle = "source.addEventListener('done',e=>{"
    start = 0
    while True:
        listener = src.find(needle, start)
        if listener < 0:
            return ranges
        settle = src.find(ANCHOR_SETTLE, listener + len(needle))
        if settle < 0:
            return ranges
        closing_match = re.search(r"\n[ \t]*\}\);", src[settle + len(ANCHOR_SETTLE) :])
        if closing_match is None:
            return ranges
        closing = settle + len(ANCHOR_SETTLE) + closing_match.start()
        handler_end = closing + len(closing_match.group(0))
        body = src[listener:handler_end]
        if "_applyToAnchor('done'," in body and ANCHOR_SETTLE in body:
            ranges.append((listener, handler_end))
        start = handler_end


def _find_done_teardown_offsets(src: str) -> list[int]:
    """Return all destructive teardown calls before settle in the target scope."""
    handlers = _find_finalize_handler_ranges(src)
    if len(handlers) != 1:
        return []
    handler_start, handler_end = handlers[0]
    settle_pos = src.find(ANCHOR_SETTLE, handler_start, handler_end)
    if settle_pos < 0:
        return []
    offsets = []
    for anchor in (ANCHOR_EARLY_TEARDOWN, ANCHOR_LIVE_CARD_TEARDOWN):
        pos = handler_start
        while True:
            pos = src.find(anchor, pos, settle_pos)
            if pos < 0:
                break
            offsets.append(pos)
            pos += len(anchor)
    return sorted(offsets)

# ---------------------------------------------------------------------------
# Anchor 1 — the settle block EXACTLY as installed by
# scripts/patch-hermes-webui-paint-first.py (NEW_SETTLE). Present once per
# painted-first messages.js, inside the done handler's isActiveSession branch.
# ---------------------------------------------------------------------------
ANCHOR_SETTLE = """          // Paint-first settle: the live DOM is already correct from the stream.
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

REPLACEMENT_SETTLE = """          // [vulpy-stream-finalize-settle-v2] TWO-PHASE settle replacing the
          // unconditional paint-first skip. Paint-first is kept when it is
          // safe, but no longer trusted blindly: a full renderMessages()
          // rebuild here wipes innerHTML mid-paint and caused jank (#3877),
          // while skipping it entirely let finalize teardowns/cross-pane
          // restores drop the finished answer (finalize-wipe S1).
          syncTopbar();
          const _fzs=typeof _settleVerifyFinalizeDom==='function'
            ? _settleVerifyFinalizeDom({
                expectedText:assistantText,
                expectedPosition:typeof _settleExpectedAssistantPosition==='function'
                  ? _settleExpectedAssistantPosition(lastAsst) : -1,
                expectedMessageId:lastAsst&&(lastAsst.id||lastAsst.message_id||null),
                expectedElement:assistantRow
              })
            : {ok:false};
          if(_fzs.ok){
            // PHASE 2a — verified swap: canonical content already mounted;
            // keep paint-first (cheap, no wipe/rescan).
            clearLiveToolCards();
            if(typeof finalizeThinkingCard==='function') finalizeThinkingCard();
            if(typeof _disarmKeepSettledWorklogOpen==='function') _disarmKeepSettledWorklogOpen();
            if(shouldFollowOnDone&&typeof scrollToBottom==='function') scrollToBottom();
          }else{
            // PHASE 2b — verification failed: rebuild canonically FIRST (the
            // rebuild both remounts settled content and removes live ghosts),
            // then finish teardown. Never unmount-before-mounted.
            renderMessages({preserveScroll:true});
            if(typeof finalizeThinkingCard==='function') finalizeThinkingCard();
            if(typeof _disarmKeepSettledWorklogOpen==='function') _disarmKeepSettledWorklogOpen();
            if(typeof clearLiveToolCards==='function') clearLiveToolCards();
            if(shouldFollowOnDone&&typeof scrollToBottom==='function') scrollToBottom();
          }
          // Defer non-essential side effects to the next frame.
          setTimeout(function(){
            if(typeof noteWorkspaceMutationsFromToolCalls==='function') noteWorkspaceMutationsFromToolCalls(S.toolCalls);
            loadDir('.', { preservePreview: true });
            if(typeof autoReadLastAssistant==='function') autoReadLastAssistant();
          }, 0);"""

# ---------------------------------------------------------------------------
# Anchor 2 — injection site for the verifier helpers: immediately before
# `_restoreSettledSession` (same IIFE scope: sees S, document, etc.).
# ---------------------------------------------------------------------------
ANCHOR_HELPER = "  async function _restoreSettledSession(source, options=null){"

REPLACEMENT_HELPER = """  // [vulpy-stream-finalize-settle-v2] Two-phase settle verifier. Returns
  // {ok:true} only when BOTH hold:
  //   (1) the settled transcript contains a non-empty visible assistant
  //       message whose text matches the live final answer (when provided);
  //   (2) the DOM actually shows a settled assistant row/segment carrying
  //       that text (data-raw-text preferred, rendered text fallback).
  function _settleVisibleAssistantMessages(){
    return (Array.isArray(S&&S.messages)?S.messages:[])
      .filter(m=>m&&m.role==='assistant');
  }
  function _settleMessageBody(m){
    if(!m) return '';
    if(typeof m.content==='string') return m.content;
    if(Array.isArray(m.content)){
      try{ return m.content.map(p=>(p&&typeof p==='object')?(p.text||p.input_text||''):String(p||'')).join(''); }
      catch(_){ return ''; }
    }
    return '';
  }
  function _settleNorm(s){ return String(s==null?'':s).replace(/\\s+/g,' ').trim(); }
  function _settledExpectedText(){
    const msgs=_settleVisibleAssistantMessages();
    if(!msgs.length) return '';
    return _settleNorm(_settleMessageBody(msgs[msgs.length-1]));
  }
  function _settleAssistantDomCandidates(){
    if(typeof document==='undefined'||!document.querySelectorAll) return [];
    return Array.from(document.querySelectorAll('.msg-row[data-role="assistant"], .assistant-segment[data-raw-text], [data-live-assistant="1"]'));
  }
  function _settleExpectedAssistantPosition(completedEntry){
    const messages=_settleVisibleAssistantMessages();
    return completedEntry ? messages.indexOf(completedEntry) : -1;
  }
  function _settleGuardBeforeTeardown(expectedText, expectedPosition, expectedMessageId, expectedElement){
    const result=_settleVerifyFinalizeDom({expectedText:expectedText,expectedPosition:expectedPosition,expectedMessageId:expectedMessageId,expectedElement:expectedElement});
    if(!result.ok && typeof renderMessages==='function') renderMessages({preserveScroll:true});
  }
  function _settleDomIdentityMatches(el, opts, expectedPosition){
    if(opts&&opts.expectedElement) return el===opts.expectedElement;
    const expectedId=opts&&opts.expectedMessageId;
    if(expectedId!=null){
      const domId=el&&el.getAttribute&&(
        el.getAttribute('data-message-id')||el.getAttribute('data-msg-id')||'');
      return domId===String(expectedId);
    }
    const domIndex=el&&el.getAttribute&&el.getAttribute('data-message-index');
    return domIndex!==null&&domIndex!==''&&Number(domIndex)===expectedPosition;
  }
  function _settleVerifyFinalizeDom(opts){
    try{
      const expectedRaw=_settleNorm(opts&&opts.expectedText!==undefined
        ? opts.expectedText : _settledExpectedText());
      // (1) Data check: the settled merge must contain the exact completed
      // answer accumulated by the live stream. Never let a stale merge define
      // what "complete" means.
      if(!expectedRaw){
        return {ok:false,reason:'empty-settled-answer'};
      }
      if(!S.session) return {ok:false,reason:'no-session'};
      const expectedPosition=Number.isInteger(opts&&opts.expectedPosition)
        ? opts.expectedPosition : -1;
      const dataMessages=_settleVisibleAssistantMessages();
      if(expectedPosition<0||expectedPosition>=dataMessages.length){
        return {ok:false,reason:'settled-answer-not-in-merge'};
      }
      if(_settleNorm(_settleMessageBody(dataMessages[expectedPosition]))!==expectedRaw){
        return {ok:false,reason:'settled-answer-not-in-merge'};
      }
      // (2) DOM check: settled assistant row carrying that text must be mounted.
      const candidates=_settleAssistantDomCandidates();
      const el=candidates[expectedPosition];
      if(el){
        const raw=el.getAttribute&&(el.getAttribute('data-raw-text')||'');
        const body=el.querySelector?el.querySelector('.msg-body'):null;
        const text=_settleNorm(raw||((body&&body.textContent)||el.textContent||''));
        if(text===expectedRaw&&_settleDomIdentityMatches(el,opts,expectedPosition)) return {ok:true};
      }
      return {ok:false,reason:'settled-row-not-mounted'};
    }catch(_e){
      return {ok:false,reason:'verifier-error'};
    }
  }
  if(typeof window!=='undefined'){
    window._settleVerifyFinalizeDom=_settleVerifyFinalizeDom;
    window._settledExpectedText=_settledExpectedText;
    window._settleExpectedAssistantPosition=_settleExpectedAssistantPosition;
    window._settleGuardBeforeTeardown=_settleGuardBeforeTeardown;
  }

  async function _restoreSettledSession(source, options=null){"""


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} /path/to/messages.js", file=sys.stderr)
        return 1

    target = sys.argv[1]
    try:
        with open(target) as f:
            src = f.read()
    except OSError as exc:
        print(f"[vulpy] ERROR: cannot read {target}: {exc}", file=sys.stderr)
        return 1

    if IDEMPOTENCY_MARK in src:
        print(f"Already patched ({IDEMPOTENCY_MARK} found in {target})")
        return 0

    if PREVIOUS_IDEMPOTENCY_MARK in src:
        # Upgrade path (v1 -> v2): the previous patch must be the EXACT v1
        # two-phase-settle shape before we bless it as v2 — otherwise a
        # drifted v1 bundle (upstream reworked the settle/helper after v1
        # shipped) would be silently renamed to v2 and treated as verified.
        v1_settle = REPLACEMENT_SETTLE.replace(IDEMPOTENCY_MARK, PREVIOUS_IDEMPOTENCY_MARK)
        v1_helper = (
            REPLACEMENT_HELPER.replace(IDEMPOTENCY_MARK, PREVIOUS_IDEMPOTENCY_MARK)
            .replace(NEW_DOM_SELECTOR, OLD_DOM_SELECTOR)
        )
        n_old_selector = src.count(OLD_DOM_SELECTOR)
        n_v1_settle = src.count(v1_settle)
        n_v1_helper = src.count(v1_helper)
        if n_old_selector != 1 or n_v1_settle != 1 or n_v1_helper != 1:
            print(
                f"ERROR: previous finalize patch shape drifted in {target} "
                f"(selector x{n_old_selector}, settle x{n_v1_settle}, helper x{n_v1_helper}; "
                "expected 1 of each). Refusing to rename a drifted v1 patch to v2 — "
                "update extensions/hermes-webui/scripts/patch-webui-stream-finalize-settle.py",
                file=sys.stderr,
            )
            return 1
        src = src.replace(OLD_DOM_SELECTOR, NEW_DOM_SELECTOR, 1)
        src = src.replace(PREVIOUS_IDEMPOTENCY_MARK, IDEMPOTENCY_MARK)
        with open(target, "w") as f:
            f.write(src)
        print(f"Migrated previous patch in {target} ({IDEMPOTENCY_MARK})")
        return 0

    done_teardowns = _find_done_teardown_offsets(src)
    n_settle = src.count(ANCHOR_SETTLE)
    n_helper = src.count(ANCHOR_HELPER)
    if len(done_teardowns) != 2:
        print(
            f"ERROR: done-handler teardown anchors appear {len(done_teardowns)} times (expected 2) in {target}\n"
            "  Expected exactly one anchor teardown and one live-card teardown in the done-handler scope.\n"
            "  hermes-webui source changed shape -- update\n"
            "  extensions/hermes-webui/scripts/patch-webui-stream-finalize-settle.py",
            file=sys.stderr,
        )
        return 1
    if n_settle != 1:
        print(
            f"ERROR: settle anchor appears {n_settle} times (expected 1) in {target}\n"
            "  Expected the exact paint-first NEW_SETTLE block.\n"
            "  hermes-webui source changed shape -- update\n"
            "  extensions/hermes-webui/scripts/patch-webui-stream-finalize-settle.py",
            file=sys.stderr,
        )
        return 1
    if n_helper != 1:
        print(
            f"ERROR: helper anchor appears {n_helper} times (expected 1) in {target}\n"
            "  Expected 'async function _restoreSettledSession(source, options=null){{'.\n"
            "  hermes-webui source changed shape -- update\n"
            "  extensions/hermes-webui/scripts/patch-webui-stream-finalize-settle.py",
            file=sys.stderr,
        )
        return 1

    for teardown_pos in reversed(done_teardowns):
        anchor = ANCHOR_EARLY_TEARDOWN if src.startswith(ANCHOR_EARLY_TEARDOWN, teardown_pos) else ANCHOR_LIVE_CARD_TEARDOWN
        replacement = REPLACEMENT_EARLY_TEARDOWN if anchor == ANCHOR_EARLY_TEARDOWN else REPLACEMENT_LIVE_CARD_TEARDOWN
        src = src[:teardown_pos] + replacement + src[teardown_pos + len(anchor) :]
    src = src.replace(ANCHOR_SETTLE, REPLACEMENT_SETTLE, 1)
    src = src.replace(ANCHOR_HELPER, REPLACEMENT_HELPER, 1)

    with open(target, "w") as f:
        f.write(src)

    print(f"Patched {target} ({IDEMPOTENCY_MARK})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

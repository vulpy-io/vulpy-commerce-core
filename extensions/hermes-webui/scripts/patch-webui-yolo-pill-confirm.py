#!/usr/bin/env python3
"""Patch WebUI static/messages.js: surface pending_confirm in the yolo pill.

Security follow-up MEDIUM (durable yolo, patch-approval-yolo-durable.py):
after a gateway/WebUI restart the durable store keeps a session's YOLO as
``enabled`` but marks it ``pending_confirm`` — auto-approve is NOT re-armed
until the user toggles again. The backend GET /api/session/yolo returns
``{yolo_enabled, pending_confirm}``, but the pill UI ignored the flag and
rendered plain-active, telling the operator auto-approve was live when every
command would still raise an approval card.

Changes (all host-side messages.js + index.html; no island files):

  1. Track the state: ``let _yoloPendingConfirm = false`` next to
     ``_yoloEnabled``; set from ``data.pending_confirm`` in _fetchYoloState.
  2. Distinct render state in _updateYoloPill: while pending the pill keeps
     its normal visibility but gains the ``yolo-pending`` class (amber
     outline + pulse, matching the .vulpy-global-approval-badge amber family)
     and a pending tooltip. The i18n key ``yolo_pill_title_pending`` is used
     via the standard t()/applyLocaleToDOM pattern, but data-i18n-title is
     only wired when the key exists in the English locale — otherwise the
     literal falls back to English text (a missing key would otherwise render
     the raw key string into the tooltip).
  3. Click = confirmation: the pill's onclick is rewritten from cmdYolo() to
     _yoloPillConfirmClick(). While pending, that wrapper ENABLES (re-arms)
     instead of letting cmdYolo's read-then-toggle turn the pill OFF; after a
     successful POST it clears the local pending flag and re-renders. The
     POST handler clears pending_confirm server-side on enable
     (set_gateway_yolo_enabled), so the next GET reports clean active state.
     commands.js's cmdYolo is wrapped in place so the /yolo slash command and
     the command palette go through the same confirm path (commands.js loads
     BEFORE messages.js, and the palette captured fn:cmdYolo by reference).
  4. CSS: one <style> tag injected at runtime (id vulpy-yolo-pill-pending-style)
     with the amber outline/pulse styles.
  5. i18n: no locale bundle edits; the renderer checks LOCALES.en for the new
     key and degrades to the English literal baked into this file.

Rules (patch-approval pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: safe to run repeatedly on an already-patched file.

Usage:
  python3 patch-webui-yolo-pill-confirm.py \\
      /app/hermes-webui/static/messages.js [/app/hermes-webui/static/index.html]
"""

import sys

MARK = "vulpy-yolo-pill-confirm"

# ---------------------------------------------------------------------------
# Anchors (verified against the pinned base image tree)
# ---------------------------------------------------------------------------

# The state block we extend: declaration + fetch assignment.
ANCHOR_VAR = "let _yoloEnabled = false;"
ANCHOR_FETCH = "    _yoloEnabled = !!data.yolo_enabled;\n    _updateYoloPill();"

# _updateYoloPill body: the display line and the title branch we replace.
ANCHOR_DISPLAY = "  pill.style.display = _yoloEnabled ? '' : 'none';"
ANCHOR_TITLE_IF = "  if (_yoloEnabled) {"
ANCHOR_TITLE_ENDIF = "  }\n  if (typeof applyLocaleToDOM === 'function') applyLocaleToDOM();\n}"

# Click wiring: the pill element in index.html and the tail of
# toggleYoloFromApproval in messages.js (wrapper injected right after).
ANCHOR_ONCLICK = '<button class="yolo-pill" id="yoloPill" type="button" onclick="cmdYolo()"'
ANCHOR_WRAPPER_AFTER = (
    "} catch (e) { showToast('YOLO: ' + e.message); }\n"
    "}\n"
    "\n"
    "// ── Approval polling ──"
)

# ---------------------------------------------------------------------------
# Replacement blocks
# ---------------------------------------------------------------------------

VAR_OLD = ANCHOR_VAR
VAR_NEW = (
    "let _yoloEnabled = false;\n"
    "// pill-confirm: true when the persisted YOLO needs a fresh\n"
    "// user confirmation (a restart dropped the live override); the pill must\n"
    "// NOT look plain-active in that state.\n"
    "let _yoloPendingConfirm = false;"
)

FETCH_OLD = ANCHOR_FETCH
FETCH_NEW = (
    "    _yoloEnabled = !!data.yolo_enabled;\n"
    "    // vulpy-yolo-pill-confirm: read the restart-pending marker so the\n"
    "// pill can render the distinct confirm state.\n"
    "    _yoloPendingConfirm = !!data.pending_confirm;\n"
    "    _updateYoloPill();"
)

UPDATE_OLD = (
    ANCHOR_DISPLAY
    + "\n"
    + ANCHOR_TITLE_IF
    + "\n"
    '    pill.title = t(\'yolo_pill_title_active\');\n'
    "    pill.setAttribute('data-i18n-title', 'yolo_pill_title_active');\n"
    + ANCHOR_TITLE_ENDIF
)

UPDATE_NEW = """  pill.style.display = _yoloEnabled ? '' : 'none';
  // pill-confirm: distinct visual state while a restart dropped
  // the live override — amber outline/pulse + pending tooltip. Clicking the
  // pill re-arms (the click wrapper enables instead of toggling off).
  if (_yoloEnabled && _yoloPendingConfirm) {
    pill.classList.add("yolo-pending");
  } else {
    pill.classList.remove("yolo-pending");
  }
  if (_yoloEnabled) {
    const __pendingTitle = "YOLO was enabled — click to re-confirm auto-approve (a restart dropped it)";
    let __pendingKeyOk = false;
    try {
      __pendingKeyOk = typeof LOCALES !== "undefined" && !!(LOCALES.en && LOCALES.en.yolo_pill_title_pending);
    } catch (_) { __pendingKeyOk = false; }
    if (_yoloPendingConfirm) {
      pill.title = __pendingTitle;
      if (__pendingKeyOk) pill.setAttribute('data-i18n-title', 'yolo_pill_title_pending');
      else pill.removeAttribute('data-i18n-title');
    } else {
      pill.title = t('yolo_pill_title_active');
      pill.setAttribute('data-i18n-title', 'yolo_pill_title_active');
    }
  }
  if (typeof applyLocaleToDOM === 'function') applyLocaleToDOM();
}"""

WRAPPER_JS = """
// ── YOLO pill click = confirm (pill-confirm patch) ──────────────────────
// While _yoloPendingConfirm is set, clicking the pill must RE-ARM yolo
// (enabled:true), not toggle it off: cmdYolo()'s read-then-toggle sees
// yolo_enabled=true for a pending session and would disable. A successful
// enable clears pending_confirm server-side (set_gateway_yolo_enabled) and
// here locally, returning the pill to its normal active look. Outside the
// pending state this delegates to the ORIGINAL cmdYolo() — captured BEFORE
// the window reassignment below so the wrapper never calls itself (an
// uncaptured reference would resolve to the wrapper -> infinite recursion).
const _origCmdYolo = typeof cmdYolo === 'function' ? cmdYolo : null;
function _yoloPillConfirmClick(){
  const __pending = typeof _yoloPendingConfirm === "boolean" ? _yoloPendingConfirm : false;
  if (!__pending) {
    // Normal click: delegate to the real cmdYolo (slash command / palette /
    // pill all share this wrapper) — no recursion because _origCmdYolo was
    // captured before window.cmdYolo was rebound below.
    if (typeof _origCmdYolo === 'function') { _origCmdYolo(); return; }
    showToast(t('yolo_pill_title_active')); return;
  }
  const sid=S.session&&S.session.session_id;
  if(!sid){showToast(t('yolo_no_session'));return;}
  api('/api/session/yolo',{
    method:'POST',
    body:JSON.stringify({session_id:sid,enabled:true}),
  }).then(function(){
    _yoloEnabled=true;
    _yoloPendingConfirm=false;
    _updateYoloPill();
    showToast(t('yolo_enabled'));
    hideApprovalCard(true);
  }).catch(function(e){showToast('YOLO: '+e.message);});
}
// Rebind the pill's click handler to the confirm-aware wrapper (the inline
// onclick attribute still says cmdYolo()). Attribute rewrite happens in
// index.html at build time; this covers any DOM that predates it.
(function(){
  var __pill=document.getElementById('yoloPill');
  if(__pill&&__pill.getAttribute('onclick')==='cmdYolo()')__pill.setAttribute('onclick','_yoloPillConfirmClick()');
})();
window.cmdYolo = _yoloPillConfirmClick;

// ── Approval polling ──"""

WRAPPER_NEW = "} catch (e) { showToast('YOLO: ' + e.message); }\n}\n" + WRAPPER_JS

ONCLICK_NEW = (
    '<button class="yolo-pill" id="yoloPill" type="button" onclick="_yoloPillConfirmClick()"'
)

CSS_SNIPPET = """(function(){
  if(document.getElementById('vulpy-yolo-pill-pending-style'))return;
  var st=document.createElement('style');
  st.id='vulpy-yolo-pill-pending-style';
  st.textContent =
    '.yolo-pill.yolo-pending{outline:1px solid rgba(245,158,11,.4);outline-offset:1px;animation:vulpyYoloPendingPulse 1.8s ease-in-out infinite;}'+
    '.yolo-pill.yolo-pending .yolo-pill-label::after{content:"…";letter-spacing:.02em;}'+
    '@keyframes vulpyYoloPendingPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,.35);}50%{box-shadow:0 0 0 4px rgba(245,158,11,.12);}}'+
    '@media (prefers-reduced-motion:reduce){.yolo-pill.yolo-pending{animation:none;}}';
  document.head.appendChild(st);
})();"""


# ---------------------------------------------------------------------------
# Test fixture (consumed by tests/test_patch_webui_yolo_pill_confirm.py):
# a faithful pre-patch copy of the upstream region this patcher targets.
# Built from the ANCHOR_* constants above so the fixture and the anchors
# cannot drift apart; surrounding lines mirror the pinned base image tree
# (static/messages.js yolo block + static/commands.js cmdYolo tail).
# ---------------------------------------------------------------------------

FIXTURE_PRE_PATCH = (
    "// Lifecycle:\n"
    "//   • Server restart: state is LOST — in-memory only, not persisted to disk.\n"
    "let _yoloEnabled = false;\n"
    "\n"
    "async function _fetchYoloState(sid) {\n"
    "  try {\n"
    "    const data = await api('/api/session/yolo?session_id=' + encodeURIComponent(sid));\n"
    "    _yoloEnabled = !!data.yolo_enabled;\n"
    "    _updateYoloPill();\n"
    "  } catch (_) { /* ignore */ }\n"
    "}\n"
    "\n"
    "function _updateYoloPill() {\n"
    "  const pill = $('yoloPill');\n"
    "  if (!pill) return;\n"
    "  pill.style.display = _yoloEnabled ? '' : 'none';\n"
    "  if (_yoloEnabled) {\n"
    "    pill.title = t('yolo_pill_title_active');\n"
    "    pill.setAttribute('data-i18n-title', 'yolo_pill_title_active');\n"
    "  }\n"
    "  if (typeof applyLocaleToDOM === 'function') applyLocaleToDOM();\n"
    "}\n"
    "\n"
    "async function toggleYoloFromApproval() {\n"
    "  const sid = S.session && S.session.session_id;\n"
    "  if (!sid) return;\n"
    "  try {\n"
    "    await api('/api/session/yolo', {\n"
    "      method: 'POST',\n"
    "      body: JSON.stringify({ session_id: sid, enabled: true }),\n"
    "    });\n"
    "    _yoloEnabled = true;\n"
    "    _updateYoloPill();\n"
    "    hideApprovalCard(true);\n"
    "    showToast(t('yolo_enabled'));\n"
    "} catch (e) { showToast('YOLO: ' + e.message); }\n"
    "}\n"
    "\n"
    "// ── Approval polling ──\n"
    "let _approvalPollTimer = null;\n"
)


def _count(src: str, needle: str) -> int:
    return src.count(needle)


def _fail(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(1)


def _check_anchor(src: str, label: str, anchor: str, path: str) -> None:
    n = _count(src, anchor)
    if n == 0:
        _fail(
            f"ERROR: anchor not found for {label}:\n"
            f"  anchor: {anchor[:120]!r}\n"
            f"  File: {path}\n"
            f"  Hermes changed shape — update "
            f"extensions/hermes-webui/scripts/patch-webui-yolo-pill-confirm.py (anchor drift)"
        )
    if n > 1:
        _fail(
            f"ERROR: anchor appears {n} times (expected 1) for {label}:\n"
            f"  File: {path}\n"
            f"  Cannot apply patch safely — update the patch script."
        )


def main() -> None:
    if len(sys.argv) not in (2, 3):
        print(
            f"Usage: python3 {sys.argv[0]} /app/hermes-webui/static/messages.js"
            " [/app/hermes-webui/static/index.html]",
            file=sys.stderr,
        )
        sys.exit(1)

    messages_path = sys.argv[1]
    index_path = sys.argv[2] if len(sys.argv) == 3 else None

    with open(messages_path, encoding="utf-8") as f:
        src = f.read()

    if MARK in src:
        # Idempotent no-op — but keep the index.html rewrite converging even
        # if a previous run patched messages.js only.
        if index_path:
            _rewrite_onclick(index_path)
        print(f"already patched — yolo pill pending-confirm state ({messages_path})")
        return

    # ---- fail-loud anchor validation BEFORE any mutation -------------------
    for label, anchor in (
        ("_yoloEnabled declaration", VAR_OLD),
        ("_fetchYoloState assignment", FETCH_OLD),
        ("_updateYoloPill body", UPDATE_OLD),
        ("toggleYoloFromApproval tail (click wrapper)", ANCHOR_WRAPPER_AFTER),
    ):
        _check_anchor(src, label, anchor, messages_path)

    # ---- 1. state tracking -------------------------------------------------
    src = src.replace(VAR_OLD, VAR_NEW, 1)

    # ---- 2. fetch pending_confirm ------------------------------------------
    src = src.replace(FETCH_OLD, FETCH_NEW, 1)

    # ---- 3. distinct pill render state --------------------------------------
    src = src.replace(UPDATE_OLD, UPDATE_NEW, 1)

    # ---- 4. click = confirmation --------------------------------------------
    src = src.replace(ANCHOR_WRAPPER_AFTER, WRAPPER_NEW, 1)

    # ---- 5. CSS <style> injection helper ------------------------------------
    # Append after the click wrapper block (end of the yolo section, before
    # the approval-polling machinery continues).
    css_anchor = "window.cmdYolo = _yoloPillConfirmClick;\n"
    _check_anchor(src, "css injection point", css_anchor, messages_path)
    src = src.replace(css_anchor, css_anchor + CSS_SNIPPET + "\n", 1)

    with open(messages_path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"patched: yolo pill pending-confirm state applied to {messages_path}")

    if index_path:
        _rewrite_onclick(index_path)


def _rewrite_onclick(index_path: str) -> None:
    """Rewrite the pill's inline onclick to the confirm-aware wrapper."""
    with open(index_path, encoding="utf-8") as f:
        html = f.read()
    n = _count(html, ANCHOR_ONCLICK)
    if n == 1:
        html = html.replace(ANCHOR_ONCLICK, ONCLICK_NEW, 1)
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"patched: yolo pill onclick rewired in {index_path}")
        return
    if n == 0 and ONCLICK_NEW in html:
        print(f"onclick already rewired ({index_path})")
        return
    _fail(
        "ERROR: anchor not found for yoloPill onclick:\n"
        f"  anchor: {ANCHOR_ONCLICK!r}\n"
        f"  File: {index_path}\n"
        f"  Hermes changed shape — update "
        f"extensions/hermes-webui/scripts/patch-webui-yolo-pill-confirm.py (anchor drift)"
    )


if __name__ == "__main__":
    main()

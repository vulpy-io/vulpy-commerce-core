#!/usr/bin/env python3
"""Patch WebUI static/messages.js: merged approval poll + cross-session banner.

Issue #136 (v2, 2026-08-15): the v1 global banner was appended to
document.body while inheriting .approval-card's absolute positioning
(bottom:-24px, designed for the .composer-flyout) — the card rendered
below/behind the composer, its buttons covered by the message box. v2:

  - The banner element is created INSIDE `#composerWrap .composer-flyout`
    (sibling of the per-session #approvalCard), inheriting the working
    slide-up positioning. Dedicated styles (badge pill, amber outline, and
    stacking above the per-session card) are injected as one <style> tag.
  - ONE merged poll (/api/approval/pending WITHOUT session_id, 1500ms)
    feeds BOTH the viewed-session card and the cross-session banner,
    replacing the upstream per-session 1.5s fallback poll + the old 3s
    banner poll (connection-pool pressure reduction).
  - Respond hardening: in-flight guard (buttons disabled, duplicate clicks
    dropped), 8s timeout with retries:0 (a queued/hung request unblocks
    fast instead of ~90s), stale-guard (only clear/hide if the banner still
    shows the approval that was answered), and a 10s unstick watchdog.

Upgrade path: files patched by the v1 patcher (marker present, merged
marker absent) are detected and the old machinery is stripped before the
new block is applied. Pristine upstream files apply directly.

Rules (patch-approval pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: safe to run repeatedly on an already-patched file.

Usage:
  python3 patch-webui-global-approval-banner.py /app/hermes-webui/static/messages.js
"""

import sys

MARK = "vulpy-global-approval-banner"
NEW_MARK = "vulpy-merged-approval-poll"

# Anchor: the per-session card helper we insert the banner machinery after.
# The upstream (and the real v1 patcher) name it WITHOUT a leading underscore.
ANCHOR = (
    "function showApprovalForSession(sid, pending, pendingCount) {\n"
    "  if (!pending) return;\n"
    "  pending._session_id = sid;\n"
    "  showApprovalCard(pending, pendingCount);\n"
    "}"
)

# Defensive: some released v1 installs may carry the underscored form
# (`function _showApprovalForSession(...)`) if a build used that name. The
# upgrade path must apply to a dir that has EITHER form, so we normalize the
# underscore form back to the canonical `showApprovalForSession` when the v2
# machinery (which calls `showApprovalForSession`) is injected.
ANCHOR_UNDERSCORE = (
    "function _showApprovalForSession(sid, pending, pendingCount) {\n"
    "  if (!pending) return;\n"
    "  pending._session_id = sid;\n"
    "  showApprovalCard(pending, pendingCount);\n"
    "}"
)

OLD = ANCHOR

# ── v1 removal anchors (self-upgrade path) ────────────────────────────────
OLD_BLOCK_START = "\n// ── Global approval banner (#136)"
OLD_BLOCK_END = "_globalApprovalPollTick();\n}"
OLD_HOOK = "_startGlobalApprovalPoll();  // (#136) cross-session approval banner poll"

# ── startApprovalPolling hook ─────────────────────────────────────────────
HOOK_OLD = "  _startApprovalFallbackPoll(sid);"
HOOK_NEW = (
    "  _startMergedApprovalPoll(sid);  // (#136 v2) merged approval poll "
    "(replaces per-session fallback + banner poll)"
)

BANNER_JS = """
// ── Merged approval poll + cross-session banner (#136 v2) ────────────────
// showApprovalCard() early-returns for approvals that belong to a session
// OTHER than the viewed one, so in gateway mode (the agent runs in the
// gateway process) a delegated child's approval would park invisibly until
// the full approval timeout blocks the command.
//
// v2 (2026-08-15):
//   • ONE poll (/api/approval/pending WITHOUT session_id, 1500ms) feeds
//     BOTH the viewed-session card and this cross-session banner. It
//     replaces the upstream per-session fallback poll (its function stays
//     defined but is no longer started) and the old 3s banner poll.
//   • The banner lives INSIDE #composerWrap .composer-flyout (sibling of
//     the per-session #approvalCard) so it inherits the working slide-up
//     positioning. (v1 appended it to document.body; .approval-card's
//     bottom:-24px then placed it below/behind the composer.)
//   • Respond hardening: in-flight guard, 8s timeout (retries: 0),
//     stale-guard, and a 10s unstick watchdog.
// vulpy-merged-approval-poll
let _globalApprovalEntry = null;   // {session_id, approval_id, description, command, pattern_keys}
let _globalApprovalEl = null;
let _mergedApprovalPollTimer = null;
let _globalApprovalResponding = null;  // {session_id, approval_id, choice, at}
let _globalApprovalWatchdogTimer = null;
let _approvalIndicatorEl = null;
let _approvalIndicatorCount = 0;
let _approvalDenyReasonValue = '';
// Deny-reason hardening (#136 security): the reason is relayed into the
// agent's context (as quoted data) and can carry command text the operator
// pasted. Cap it at 500 chars and strip control chars/newlines so it stays a
// single bounded quoted line — no unbounded text, no prompt-injection via
// embedded newline-injected instructions.
const _APPROVAL_DENY_REASON_MAX = 500;
function _sanitizeDenyReason(raw) {
  const s = String(raw == null ? '' : raw);
  // eslint-disable-next-line no-control-regex
  const stripped = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.slice(0, _APPROVAL_DENY_REASON_MAX);
}

// ── Always-visible compact approval indicator (#136 v3) ─────────────────
// The merged poll runs on setInterval (focus-independent). The indicator is
// a body-level fixed pill that renders whenever ANY approval is pending —
// regardless of tab focus / document visibility / PWA backgrounding — so the
// operator never misses an invisible approval. It is updated directly from
// the poll tick (no rAF, no visibility gate).
function _vulpyApprovalIndicatorEl() {
  if (_approvalIndicatorEl && _approvalIndicatorEl.isConnected) return _approvalIndicatorEl;
  const el = document.createElement('div');
  el.id = 'vulpyApprovalIndicator';
  el.className = 'vulpy-approval-indicator';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.tabIndex = 0;
  el.title = 'Pending approvals';
  el.innerHTML =
    '<span class="vulpy-approval-indicator-dot" aria-hidden="true"></span>' +
    '<span class="vulpy-approval-indicator-count">0</span>' +
    '<span class="vulpy-approval-indicator-label">approval(s)</span>';
  el.addEventListener('click', () => {
    // Bring the user to the composer's card/banner: focus the composer, and
    // if the banner is visible, focus its first action button.
    if (typeof focusComposer === 'function') {
      try { focusComposer(); } catch (_) { /* noop */ }
    }
    if (_globalApprovalEl && _globalApprovalEl.isConnected && !_globalApprovalEl.hidden) {
      const firstBtn = _globalApprovalEl.querySelector('.approval-btns button');
      if (firstBtn) firstBtn.focus();
    }
  });
  if (!document.getElementById('vulpyApprovalIndicatorStyles')) {
    const st = document.createElement('style');
    st.id = 'vulpyApprovalIndicatorStyles';
    st.textContent =
      '#vulpyApprovalIndicator{position:fixed;right:16px;bottom:16px;z-index:99999;' +
      'display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;' +
      'background:rgba(180,83,9,.92);color:#fff;font:600 13px/1 var(--font-ui,system-ui,sans-serif);' +
      'box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer;user-select:none;}' +
      '#vulpyApprovalIndicator[hidden]{display:none;}' +
      '#vulpyApprovalIndicator .vulpy-approval-indicator-dot{width:8px;height:8px;border-radius:50%;' +
      'background:#fde68a;box-shadow:0 0 0 2px rgba(253,230,138,.5);}' +
      '#vulpyApprovalIndicator .vulpy-approval-indicator-count{font-weight:800;}' +
      '#vulpyApprovalIndicator .vulpy-approval-indicator-label{opacity:.95;}';
    document.head.appendChild(st);
  }
  document.body.appendChild(el);
  _approvalIndicatorEl = el;
  return el;
}

function _updateApprovalIndicator(count) {
  const total = Math.max(0, parseInt(count, 10) || 0);
  _approvalIndicatorCount = total;
  const el = _vulpyApprovalIndicatorEl();
  const label = el.querySelector('.vulpy-approval-indicator-label');
  const countEl = el.querySelector('.vulpy-approval-indicator-count');
  if (label) label.textContent = total === 1 ? 'approval' : 'approvals';
  if (countEl) countEl.textContent = String(total);
  el.hidden = total === 0;
  el.classList.toggle('visible', total > 0);
}

function _globalApprovalViewedSid() {
  return (typeof S !== 'undefined' && S.session && S.session.session_id) || _promptActiveSessionId() || null;
}

function _globalApprovalBannerEl() {
  if (_globalApprovalEl && _globalApprovalEl.isConnected) return _globalApprovalEl;
  const el = document.createElement('div');
  el.id = 'globalApprovalBanner';
  el.className = 'approval-card vulpy-global-approval-banner';
  el.setAttribute('role', 'alertdialog');
  el.hidden = true;
  el.innerHTML =
    '<div class="approval-inner">' +
      '<div class="approval-header">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
        '<span data-i18n="approval_heading">Approval required</span>' +
        '<span class="vulpy-global-approval-badge other">other session</span>' +
        '<span class="vulpy-global-approval-origin"></span>' +
        '<button type="button" class="approval-dismiss" aria-label="Dismiss approval" title="Dismiss approval"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '</div>' +
      '<div class="approval-desc"></div>' +
      '<div class="approval-cmd"></div>' +
      '<div class="approval-btns">' +
        '<button type="button" class="approval-btn once" data-choice="once"><span class="approval-btn-label">Allow once</span></button>' +
        '<button type="button" class="approval-btn session" data-choice="session"><span class="approval-btn-label">Allow session</span></button>' +
        '<button type="button" class="approval-btn always" data-choice="always"><span class="approval-btn-label">Always allow</span></button>' +
        '<button type="button" class="approval-btn deny" data-choice="deny"><span class="approval-btn-label">Deny</span></button>' +
      '</div>' +
      '<div class="approval-reason-row" hidden>' +
        '<input type="text" class="approval-reason-input" placeholder="Reason for denial (optional)" autocomplete="off" aria-label="Reason for denial" />' +
      '</div>' +
    '</div>';
  const host = document.querySelector('#composerWrap .composer-flyout') || document.body || document.documentElement;
  host.appendChild(el);
  for (const b of el.querySelectorAll('.approval-btns button')) {
    b.addEventListener('click', () => {
      if (b.dataset.choice === 'deny') {
        const row = el.querySelector('.approval-reason-row');
        const input = el.querySelector('.approval-reason-input');
        if (row && row.hidden) {
          row.hidden = false;
          if (input) input.focus();
          return;  // first click reveals the input; the user then clicks Deny again
        }
      }
      respondGlobalApproval(b.dataset.choice);
    });
  }
  const dismissBtn = el.querySelector('.approval-dismiss');
  if (dismissBtn) dismissBtn.addEventListener('click', dismissGlobalApprovalBanner);
  if (!document.getElementById('vulpyGlobalApprovalStyles')) {
    const st = document.createElement('style');
    st.id = 'vulpyGlobalApprovalStyles';
    st.textContent =
      '.vulpy-global-approval-badge{font-size:.72em;line-height:1;padding:3px 8px;border-radius:999px;background:rgba(127,127,127,.18);color:inherit;margin-left:auto;white-space:nowrap;}' +
      '.vulpy-global-approval-origin{font-size:.72em;line-height:1;padding:3px 8px;border-radius:999px;background:rgba(59,130,246,.16);color:inherit;margin-left:6px;white-space:nowrap;font-family:var(--font-mono,ui-monospace,monospace);}' +
      '.vulpy-global-approval-banner .approval-inner{outline:1px solid rgba(245,158,11,.4);outline-offset:-1px;}' +
      '.vulpy-global-approval-banner .approval-reason-row{padding:8px 14px 4px;}' +
      '.vulpy-global-approval-banner .approval-reason-input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border,#e0dacb);border-radius:8px;background:var(--surface,#f5f1e8);color:inherit;font:13px/1.4 var(--font-ui,system-ui,sans-serif);}' +
      '#approvalCard.visible ~ .vulpy-global-approval-banner{bottom:272px;}';
    document.head.appendChild(st);
  }
  _globalApprovalEl = el;
  return el;
}

// Reserve transcript space for the banner (and the per-session card when
// both are visible) so the last message is never hidden behind the cards.
function _globalApprovalSyncTranscriptSpace(visible) {
  if (typeof _syncApprovalTranscriptSpace !== 'function') return;
  const messages = document.getElementById('messages');
  if (!messages) return;
  const card = document.getElementById('approvalCard');
  const cardVisible = !!(card && card.classList.contains('visible'));
  if (!visible) {
    // Restore the per-session card's own reservation if it is still showing.
    _syncApprovalTranscriptSpace(cardVisible ? card : null, {immediate: true});
    return;
  }
  const banner = _globalApprovalBannerEl();
  const inner = banner.querySelector('.approval-inner');
  const h = (cardVisible && card ? card.getBoundingClientRect().height : 0) +
            (inner ? inner.getBoundingClientRect().height : 0);
  if (!(h > 0)) {
    // Pre-layout measurement — let the upstream helper re-measure on rAF/420ms.
    _syncApprovalTranscriptSpace(banner, {immediate: true});
    return;
  }
  messages.classList.add('approval-open');
  messages.style.setProperty('--approval-card-height', Math.ceil(h + 24) + 'px');
  if (typeof _approvalMessagesNearBottom === 'function' && _approvalMessagesNearBottom(messages) && typeof scrollToBottom === 'function') {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scrollToBottom);
    else scrollToBottom();
  }
}

function _showGlobalApprovalBanner(entry) {
  if (!entry) return;
  const sid = entry._session_id || entry.session_id;
  if (!sid) return;
  if (_approvalPromptBelongsToActiveSession(sid)) return;  // per-session card owns it
  if (entry.approval_id && _isApprovalDismissed(sid, entry.approval_id)) return;
  _globalApprovalEntry = {
    session_id: sid,
    approval_id: entry.approval_id || null,
    description: entry.description || '',
    command: entry.command || '',
    pattern_keys: entry.pattern_keys || (entry.pattern_key ? [entry.pattern_key] : []),
    run_id: entry.run_id || null,
    session_title: entry.session_title || null
  };
  const el = _globalApprovalBannerEl();
  const keys = _globalApprovalEntry.pattern_keys;
  const desc = (_globalApprovalEntry.description || '') + (keys.length ? ' [' + keys.join(', ') + ']' : '');
  el.querySelector('.approval-desc').textContent = desc;
  el.querySelector('.approval-cmd').textContent = _globalApprovalEntry.command || '';
  const origin = el.querySelector('.vulpy-global-approval-origin');
  const badge = el.querySelector('.vulpy-global-approval-badge');
  const title = _globalApprovalEntry.session_title || '';
  const runId = _globalApprovalEntry.run_id || '';
  const shortSid = String(sid).length > 16 ? String(sid).slice(0, 16) + '…' : String(sid);
  const parts = [];
  if (title) parts.push(title);
  else if (sid) parts.push(shortSid);
  if (runId) parts.push('run ' + runId);
  if (origin) {
    origin.textContent = parts.length ? 'from ' + parts.join(' · ') : '';
    origin.hidden = !origin.textContent;
  }
  if (badge && (title || runId)) {
    // The cross-session banner must identify the origin (factory workflow:
    // coder subagent vs background run). Replace the generic copy with the
    // session/run identity.
    badge.textContent = (title || shortSid) + (runId ? ' · run ' + runId : '');
    badge.classList.add('with-origin');
  }
  const reasonRow = el.querySelector('.approval-reason-row');
  if (reasonRow) reasonRow.hidden = true;
  const reasonInput = el.querySelector('.approval-reason-input');
  if (reasonInput) reasonInput.value = '';
  _approvalDenyReasonValue = '';
  el.hidden = false;
  el.classList.add('visible');
  _globalApprovalSyncTranscriptSpace(true);
  // No focus stealing — the operator may be mid-typing in the viewed session.
}

function _hideGlobalApprovalBanner() {
  if (_globalApprovalEl && _globalApprovalEl.isConnected) {
    _globalApprovalEl.classList.remove('visible');
    _globalApprovalEl.hidden = true;
  }
  _globalApprovalEntry = null;
  _globalApprovalSyncTranscriptSpace(false);
}

function dismissGlobalApprovalBanner() {
  const entry = _globalApprovalEntry;
  if (entry) {
    if (entry.approval_id) _markApprovalDismissed(entry.session_id, entry.approval_id);
    if (entry.session_id) _clearApprovalPendingForSession(entry.session_id);
  }
  _hideGlobalApprovalBanner();
}

function _globalApprovalSetBusy(busy) {
  const el = _globalApprovalEl;
  if (el && el.isConnected) {
    for (const b of el.querySelectorAll('.approval-btns button')) b.disabled = !!busy;
  }
  if (_globalApprovalWatchdogTimer) {
    clearTimeout(_globalApprovalWatchdogTimer);
    _globalApprovalWatchdogTimer = null;
  }
  if (busy) {
    _globalApprovalWatchdogTimer = setTimeout(() => {
      _globalApprovalWatchdogTimer = null;
      if (!_globalApprovalResponding) return;
      _globalApprovalResponding = null;
      _globalApprovalSetBusy(false);
      if (typeof showToast === 'function') showToast('Approval response timed out — please retry.', 5000);
    }, 10000);
  }
}

async function respondGlobalApproval(choice) {
  const entry = _globalApprovalEntry;
  if (!entry) return;
  if (_globalApprovalResponding) return;  // in-flight guard — drop duplicate clicks
  _globalApprovalResponding = {session_id: entry.session_id, approval_id: entry.approval_id, choice, at: Date.now()};
  _globalApprovalSetBusy(true);
  try {
    const body = { session_id: entry.session_id, choice, approval_id: entry.approval_id };
    if (choice === 'deny') {
      const input = _globalApprovalEl && _globalApprovalEl.isConnected ?
        _globalApprovalEl.querySelector('.approval-reason-input') : null;
      // Deny-reason hardening: cap at 500 chars + strip control chars/newlines
      // so the relayed reason is a single bounded quoted line (never unbounded
      // text / prompt-injectable whitespace into the agent context).
      const reason = _sanitizeDenyReason(
        input ? input.value : (_approvalDenyReasonValue || '')
      );
      if (reason) body.reason = reason;
    }
    const result = await api('/api/approval/respond', {
      method: 'POST',
      timeoutMs: 8000,
      retries: 0,
      timeoutToast: false,
      body: JSON.stringify(body)
    });
    if (result && result.ok) {
      // Stale-guard: only clear/hide if the banner STILL shows the approval
      // that was answered. If the poll already swapped in a newer approval,
      // leave it untouched.
      const stillCurrent = _globalApprovalEntry &&
        _globalApprovalEntry.session_id === entry.session_id &&
        (_globalApprovalEntry.approval_id || null) === (entry.approval_id || null);
      if (stillCurrent || result.stale_cleared) {
        if (entry.session_id) _clearApprovalPendingForSession(entry.session_id);
        _hideGlobalApprovalBanner();
      }
      return;
    }
    const errMsg = (result && result.error) || 'Approval response not accepted.';
    if (typeof showToast === 'function') showToast(errMsg, 5000);
  } catch(e) {
    const errMsg = (e && e.message) || 'Approval response failed';
    if (typeof showToast === 'function') showToast(errMsg, 5000);
  } finally {
    _globalApprovalResponding = null;
    _globalApprovalSetBusy(false);
  }
}

// ONE poll for both surfaces. The server returns {approvals: [...]} where
// each entry carries session_id + approval_id + run_id.
function _mergedApprovalPollTick() {
  const sid = _approvalPollingSessionId;
  if (_approvalPollingSessionMissingOrMismatched(sid)) {
    if (_mergedApprovalPollTimer) {
      clearInterval(_mergedApprovalPollTimer);
      _mergedApprovalPollTimer = null;
    }
    _hideApprovalCardIfOwner(sid, true);
    _hideGlobalApprovalBanner();
    _updateApprovalIndicator(0);
    return;
  }
  if (_approvalFallbackPollInFlight) return;
  _approvalFallbackPollInFlight = true;
  api('/api/approval/pending', {timeoutToast: false})
    .then(data => {
      let approvals = (data && Array.isArray(data.approvals)) ? data.approvals : [];
      if (!approvals.length && data && data.pending) approvals = [data.pending];
      const viewed = approvals.filter(a => (a._session_id || a.session_id) === sid);
      const others = approvals.filter(a => (a._session_id || a.session_id) !== sid);
      const totalPending = (data && typeof data.pending_count === 'number')
        ? data.pending_count
        : approvals.length;
      _updateApprovalIndicator(totalPending);
      if (viewed.length) {
        showApprovalForSession(sid, viewed[0], (data && data.pending_count) || viewed.length);
      } else {
        const resolvedEntry = _approvalPendingBySession.get(sid);
        _clearApprovalPendingForSession(sid);
        const resolvedId = resolvedEntry && resolvedEntry.pending && resolvedEntry.pending.approval_id;
        if (resolvedId) _unmarkApprovalDismissed(sid, resolvedId);
        _hideApprovalCardIfOwner(sid);
      }
      if (others.length) {
        const candidate = others[0];
        // The banner already shows THIS approval — don't re-render on the tick.
        if (!(_globalApprovalEntry && candidate.approval_id && _globalApprovalEntry.approval_id === candidate.approval_id)) {
          _showGlobalApprovalBanner(candidate);
        }
        _globalApprovalSyncTranscriptSpace(true);
      } else {
        _hideGlobalApprovalBanner();
      }
    })
    .catch(() => { /* ignore poll errors */ })
    .finally(() => { _approvalFallbackPollInFlight = false; });
}

function _startMergedApprovalPoll(sid) {
  if (_mergedApprovalPollTimer) {
    clearInterval(_mergedApprovalPollTimer);
    _mergedApprovalPollTimer = null;
  }
  _approvalPollingSessionId = sid || null;
  _mergedApprovalPollTimer = setInterval(_mergedApprovalPollTick, 1500);
  _mergedApprovalPollTick();
  // Re-render immediately when the tab returns to the foreground, so an
  // approval that arrived while hidden is surfaced the moment the user is
  // looking again — no waiting for the next 1.5s tick. Install once (guard
  // flag mirrors ensureSessionEventsSSE's `document._hermesSessionStreamVisibilityHook`).
  // The handler only re-ticks; it never starts/stops the timer, so the poll's
  // own visibility semantics are unchanged.
  if (typeof document !== 'undefined' && !document._hermesApprovalVisibilityHook) {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && _mergedApprovalPollTimer) {
        _mergedApprovalPollTick();
      }
    });
    document._hermesApprovalVisibilityHook = true;
  }
}
"""

NEW = OLD + BANNER_JS


def _count(src: str, needle: str) -> int:
    return src.count(needle)


def _fail(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(1)


def _upgrade_from_v1(src: str) -> str:
    """Strip the v1 banner machinery + v1 startApprovalPolling hook."""
    if _count(src, OLD_BLOCK_START) != 1:
        _fail(
            "ERROR: v1 banner block start anchor not found (expected exactly 1):\n"
            f"  anchor: {OLD_BLOCK_START!r}\n"
            "  File is marked as v1-patched but the machinery region is missing — "
            "update extensions/hermes-webui/scripts/patch-webui-global-approval-banner.py"
        )
    if _count(src, OLD_BLOCK_END) == 0:
        _fail(
            "ERROR: v1 banner block end anchor not found:\n"
            f"  anchor: {OLD_BLOCK_END!r}\n"
            "  Update extensions/hermes-webui/scripts/patch-webui-global-approval-banner.py"
        )
    start = src.find(OLD_BLOCK_START)
    end = src.rfind(OLD_BLOCK_END) + len(OLD_BLOCK_END)
    if end <= start:
        _fail("ERROR: v1 banner block anchors out of order — cannot upgrade safely.")
    src = src[:start] + src[end:]
    if _count(src, OLD_HOOK) != 1:
        _fail(
            "ERROR: v1 startApprovalPolling hook not found (expected exactly 1):\n"
            f"  hook: {OLD_HOOK!r}\n"
            "  Update extensions/hermes-webui/scripts/patch-webui-global-approval-banner.py"
        )
    src = src.replace(OLD_HOOK, "", 1)
    print("  upgraded: removed v1 global approval banner machinery")
    return src


def main() -> None:
    if len(sys.argv) != 2:
        print(
            f"Usage: python3 {sys.argv[0]} /app/hermes-webui/static/messages.js",
            file=sys.stderr,
        )
        sys.exit(1)

    path = sys.argv[1]
    with open(path) as f:
        src = f.read()

    if NEW_MARK in src:
        print(f"already patched — merged approval poll ({path})")
        return

    if MARK in src:
        src = _upgrade_from_v1(src)

    # Upgrade/tolerance: accept BOTH the canonical `showApprovalForSession`
    # and a defensively-possible `_showApprovalForSession` v1 form. The v2
    # machinery always calls the canonical name, so when the underscore form
    # is present we normalize it (rename only) BEFORE the machinery is
    # injected. After normalization the anchor check below is unambiguous.
    if ANCHOR_UNDERSCORE in src:
        if ANCHOR in src:
            _fail(
                f"ERROR: both showApprovalForSession and _showApprovalForSession "
                f"present in {path} — cannot disambiguate safely."
            )
        src = src.replace(ANCHOR_UNDERSCORE, ANCHOR, 1)

    for label, anchor in (("banner anchor", ANCHOR), ("startApprovalPolling hook", HOOK_OLD)):
        n = _count(src, anchor)
        if n == 0:
            _fail(
                f"ERROR: anchor not found for {label}:\n"
                f"  anchor: {anchor[:120]!r}\n"
                f"  File: {path}\n"
                f"  Hermes changed shape — update "
                f"extensions/hermes-webui/scripts/patch-webui-global-approval-banner.py"
            )
        if n > 1:
            _fail(
                f"ERROR: anchor appears {n} times (expected 1) for {label}:\n"
                f"  File: {path}\n"
                f"  Cannot apply patch safely — update the patch script."
            )

    if OLD not in src:
        _fail(f"ERROR: banner old text not found.\n  File: {path}")
    src = src.replace(OLD, NEW, 1)
    print("  applied: merged approval poll + cross-session banner machinery")

    if HOOK_OLD not in src:
        _fail(f"ERROR: startApprovalPolling hook text not found.\n  File: {path}")
    src = src.replace(HOOK_OLD, HOOK_NEW, 1)
    print("  applied: startApprovalPolling merged poll hook")

    with open(path, "w") as f:
        f.write(src)
    print(f"patched: merged approval poll applied to {path}")


if __name__ == "__main__":
    main()

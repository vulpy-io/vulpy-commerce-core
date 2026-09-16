function _showApprovalForSession(sid, pending, pendingCount) {
  if (!pending) { return; }
  pending._session_id = sid;
  showApprovalCard(pending, pendingCount);
}

// ── Global approval banner (#136) ────────────────────────────────────────
// showApprovalCard() early-returns for approvals that belong to a session
// OTHER than the viewed one, so in gateway mode (the agent runs in the gateway
// process) a delegated child's approval would park invisibly until the full
// approval timeout blocks the command.  A cross-session poll calls
// /api/approval/pending WITHOUT session_id and renders ONE dismissible global
// banner for the first non-viewed-session approval.  Buttons reuse the same
// respond body {session_id, choice, approval_id} the per-session card uses.
// vulpy-global-approval-banner
let _globalApprovalEntry = null;   // {session_id, approval_id, description, command, pattern_keys}
let _globalApprovalEl = null;
let _globalApprovalPollTimer = null;

function _globalApprovalViewedSid() {
  return (typeof S !== 'undefined' && S.session && S.session.session_id) || _promptActiveSessionId() || null;
}

function _globalApprovalBannerEl() {
  if (_globalApprovalEl?.isConnected) { return _globalApprovalEl; }
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
        '<span class="vulpy-global-approval-badge">other session</span>' +
        '<button type="button" class="approval-dismiss" onclick="dismissGlobalApprovalBanner()" aria-label="Dismiss approval" title="Dismiss approval"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '</div>' +
      '<div class="approval-desc"></div>' +
      '<div class="approval-cmd"></div>' +
      '<div class="approval-btns">' +
        '<button class="approval-btn once" onclick="respondGlobalApproval(\'once\')"><span class="approval-btn-label">Allow once</span></button>' +
        '<button class="approval-btn session" onclick="respondGlobalApproval(\'session\')"><span class="approval-btn-label">Allow session</span></button>' +
        '<button class="approval-btn always" onclick="respondGlobalApproval(\'always\')"><span class="approval-btn-label">Always allow</span></button>' +
        '<button class="approval-btn deny" onclick="respondGlobalApproval(\'deny\')"><span class="approval-btn-label">Deny</span></button>' +
      '</div>' +
    '</div>';
  (document.body || document.documentElement).appendChild(el);
  _globalApprovalEl = el;
  return el;
}

function _showGlobalApprovalBanner(entry) {
  if (!entry) { return; }
  const sid = entry._session_id || entry.session_id;
  if (!sid) { return; }
  if (_approvalPromptBelongsToActiveSession(sid)) { return;  // per-session card owns it
}
  if (entry.approval_id && _isApprovalDismissed(sid, entry.approval_id)) { return; }
  _globalApprovalEntry = {
    session_id: sid,
    approval_id: entry.approval_id || null,
    description: entry.description || '',
    command: entry.command || '',
    pattern_keys: entry.pattern_keys || (entry.pattern_key ? [entry.pattern_key] : [])
  };
  const el = _globalApprovalBannerEl();
  const keys = _globalApprovalEntry.pattern_keys;
  const desc = (_globalApprovalEntry.description || '') + (keys.length ? ` [${keys.join(', ')}]` : '');
  el.querySelector('.approval-desc').textContent = desc;
  el.querySelector('.approval-cmd').textContent = _globalApprovalEntry.command || '';
  el.hidden = false;
  el.classList.add('visible');
  // No focus stealing — the operator may be mid-typing in the viewed session.
}

function _hideGlobalApprovalBanner() {
  if (_globalApprovalEl?.isConnected) {
    _globalApprovalEl.classList.remove('visible');
    _globalApprovalEl.hidden = true;
  }
  _globalApprovalEntry = null;
}

function _dismissGlobalApprovalBanner() {
  const entry = _globalApprovalEntry;
  if (entry) {
    if (entry.approval_id) { _markApprovalDismissed(entry.session_id, entry.approval_id); }
    if (entry.session_id) { _clearApprovalPendingForSession(entry.session_id); }
  }
  _hideGlobalApprovalBanner();
}

async function _respondGlobalApproval(choice) {
  const entry = _globalApprovalEntry;
  if (!entry) { return; }
  try {
    const result = await api('/api/approval/respond', {
      method: 'POST',
      body: JSON.stringify({ session_id: entry.session_id, choice, approval_id: entry.approval_id })
    });
    if (result?.ok) {
      if (entry.session_id) { _clearApprovalPendingForSession(entry.session_id); }
      _hideGlobalApprovalBanner();
      return;
    }
    const errMsg = (result?.error) || 'Approval response not accepted.';
    if (typeof showToast === 'function') { showToast(errMsg, 5000); }
  } catch(e) {
    const errMsg = (e?.message) || 'Approval response failed';
    if (typeof showToast === 'function') { showToast(errMsg, 5000); }
  }
}

function _globalApprovalPollTick() {
  const viewedSid = _globalApprovalViewedSid();
  api('/api/approval/pending', {timeoutToast: false})
    .then(data => {
      if (!((data && Array.isArray(data.approvals) ) && data.approvals.length)) {
        _hideGlobalApprovalBanner();
        return;
      }
      // Prefer an entry that is NOT the viewed session's; the per-session card
      // owns viewed-session approvals.
      let candidate = null;
      for (const a of data.approvals) {
        const aSid = a._session_id || a.session_id;
        if (aSid && aSid !== viewedSid) { candidate = a; break; }
      }
      if (!candidate) { _hideGlobalApprovalBanner(); return; }
      // The banner already shows THIS approval — don't re-render on the tick.
      if (_globalApprovalEntry && candidate.approval_id && _globalApprovalEntry.approval_id === candidate.approval_id) { return; }
      _showGlobalApprovalBanner(candidate);
    })
    .catch(() => {});
}

function _startGlobalApprovalPoll() {
  if (_globalApprovalPollTimer) { return; }
  _globalApprovalPollTimer = setInterval(_globalApprovalPollTick, 3000);
  _globalApprovalPollTick();
}


function _startApprovalPolling(sid) {
  stopApprovalPolling();
  _approvalPollingSessionId = sid || null;
  _startGlobalApprovalPoll();  // (#136) cross-session approval banner poll

  // Use HTTP polling instead of SSE to avoid browser connection pool exhaustion.
  _startApprovalFallbackPoll(sid);
}

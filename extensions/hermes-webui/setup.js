/* Fox in the Box -- Onboarding setup wizard */

const STEPS = ['Welcome', 'API Key', 'Done'];

const state = {
  currentStep: 1,
  totalSteps: STEPS.length,
  apiKey: '',
  welcomeText: null,        // populated on boot from /api/setup/welcome
  ollama: null,             // {running, host, version, models[]} populated on Welcome
  localFallback: null,      // {ui_state, model_installed, model_size_bytes, ...} from /api/local-fallback/status
  localModel: null,         // {provider: 'ollama'|'llama-cpp', name} once user picks a local path
};

// ── API helpers ──────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, data: await res.json() };
}

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
  return res.json();
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function updateProgress(step) {
  const bar = document.getElementById('progress-bar');
  let html = '';
  for (let i = 1; i <= state.totalSteps; i++) {
    const cls = i < step ? 'done' : i === step ? 'active' : '';
    html += `<div class="step-dot ${cls}"></div>`;
    if (i < state.totalSteps) {
      html += `<div class="step-line ${i < step ? 'done' : ''}"></div>`;
    }
  }
  html += `<div class="progress-label">${step} / ${state.totalSteps} &mdash; ${STEPS[step - 1]}</div>`;
  bar.innerHTML = html;
}

// ── Render helpers ───────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Render plain-text welcome content (paragraph-split). Keeps the wizard
// dependency-free — no markdown library — while still letting users edit
// onboarding.md to customize the message. Issue #11.
function renderWelcomeBody(text) {
  if (!text) { return ''; }
  const paragraphs = String(text).trim().split(/\n\s*\n/);
  return paragraphs.map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}

// Skip CTA inserted on every step. Bypasses API-key collection and marks
// onboarding complete; user can configure providers later via Settings.
function skipFooter() {
  return `
    <div class="skip-row">
      <button class="btn-link" type="button" onclick="skipOnboarding()">Skip for now — I'll configure later</button>
    </div>
  `;
}

// ── Step renderers ───────────────────────────────────────────────────────────

function renderStep1() {
  const body = renderWelcomeBody(state.welcomeText)
    || '<p>Let&apos;s get you set up. This will only take a minute.</p>';

  // Local-model branch priority (issue #69):
  //   1. Ollama detected with a model installed → use it (fastest, user already
  //      configured something locally)
  //   2. Bundled llama.cpp model already on disk → use it (instant, no download)
  //   3. Bundled llama.cpp installable (in-container, supervisord present) →
  //      offer download CTA (~2.5 GB)
  //   4. None → only the OpenRouter path (Next button) and skip footer.
  let localBlock = '';
  if (state.ollama?.running && Array.isArray(state.ollama.models) && state.ollama.models.length > 0) {
    const first = state.ollama.models[0];
    const modelName = escapeHtml(first.name || '');
    // SECURITY (#XSS-1): never interpolate model names into a JS string
    // context inside an `onclick` attribute. escapeHtml() is HTML-attribute-
    // safe but does not safely escape JS string literals (a model name with
    // backslash + apostrophe could break out). Use a data attribute and a
    // delegated click handler — a tampered Ollama daemon could otherwise
    // trigger code injection in the wizard.
    localBlock = `
      <div class="ollama-detected">
        <div class="ollama-detected-title">Local model detected</div>
        <p>You have <code>${modelName}</code> running on your computer via Ollama. Skip the API key step and chat with it locally — your data never leaves your machine.</p>
        <button class="btn btn-secondary" data-action="use-ollama" data-model="${modelName}">Use ${modelName}</button>
      </div>
    `;
  } else if (state.localFallback
             && state.localFallback.ui_state !== 'no-supervisor'
             && state.localFallback.ui_state !== 'missing-model-registry') {
    if (state.localFallback.model_installed) {
      localBlock = `
        <div class="ollama-detected">
          <div class="ollama-detected-title">Bundled local model ready</div>
          <p>Phi-4-mini is already on disk. Skip the API key step and chat with it locally — your data never leaves your machine.</p>
          <button class="btn btn-secondary" onclick="useLlamaCppFallback()">Use bundled local model</button>
        </div>
      `;
    } else {
      const bytes = state.localFallback.model_size_bytes || 0;
      const sizeText = bytes > 0 ? ` (~${(bytes / 1_073_741_824).toFixed(1)} GB)` : '';
      localBlock = `
        <div class="ollama-detected">
          <div class="ollama-detected-title">Run a local model — no API key needed</div>
          <p>Download Phi-4-mini${sizeText} and chat without an internet connection. Your data never leaves your machine.</p>
          <button class="btn btn-secondary" onclick="useLlamaCppFallback()">Download &amp; use local model</button>
        </div>
      `;
    }
  }

  // QA fix: disable Next while probes are in flight (state.ollama and
  // state.localFallback are still null). Otherwise a fast user can skip
  // past Step 1 before the local-model fast-paths render, missing them
  // entirely. Once any probe resolves we re-render with the button enabled.
  const probesPending = state.ollama === null && state.localFallback === null;
  const nextBtn = probesPending
    ? `<button class="btn btn-primary" disabled><span class="spinner"></span> Detecting local options…</button>`
    : `<button class="btn btn-primary" onclick="advance(2)">Next</button>`;

  return `
    <div class="step">
      <h1>Fox in the Box</h1>
      ${body}
      ${localBlock}
      <div class="btn-actions">
        ${nextBtn}
      </div>
      ${skipFooter()}
    </div>
  `;
}

function renderStep2() {
  // When the user picked a local model on Step 1, OpenRouter becomes
  // optional — they already have a working model. Show a clear "continue
  // local-only" path so they don't have to dig through the wizard skip
  // footer (which carries an "are you sure?" confirm aimed at users who
  // haven't configured anything). Onboarding still completes at Step 3.
  if (state.localModel) {
    const localLabel = state.localModel.provider === 'ollama'
      ? `${escapeHtml(state.localModel.name)} via Ollama`
      : `${escapeHtml(state.localModel.name)} (bundled local model)`;
    return `
      <div class="step">
        <h1>Add OpenRouter (optional)</h1>
        <p>You're set up with <strong>${localLabel}</strong>. Add an OpenRouter API key for cloud models too, or continue with local-only.</p>
        <label for="api-key">OpenRouter API Key</label>
        <div class="input-wrapper">
          <input id="api-key" type="password" placeholder="sk-or-..." autocomplete="off" spellcheck="false">
          <button class="toggle-vis" type="button" onclick="toggleKeyVisibility()" aria-label="Toggle key visibility">show</button>
        </div>
        <div class="hint">
          Get a free key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai</a>
        </div>
        <div id="key-error" class="error-msg"></div>
        <div class="btn-actions">
          <button id="submit-key" class="btn btn-primary" onclick="submitApiKey()">Add &amp; continue</button>
          <button class="btn btn-secondary" type="button" onclick="advance(3)">Continue with local only</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="step">
      <h1>OpenRouter API Key</h1>
      <p>Fox uses OpenRouter to access AI models. You'll need an API key to continue.</p>
      <label for="api-key">API Key</label>
      <div class="input-wrapper">
        <input id="api-key" type="password" placeholder="sk-or-..." autocomplete="off" spellcheck="false">
        <button class="toggle-vis" type="button" onclick="toggleKeyVisibility()" aria-label="Toggle key visibility">show</button>
      </div>
      <div class="hint">
        Get your free key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai</a>
      </div>
      <div id="key-error" class="error-msg"></div>
      <div class="btn-actions">
        <button id="submit-key" class="btn btn-primary" onclick="submitApiKey()">Next</button>
      </div>
      ${skipFooter()}
    </div>
  `;
}

function renderStep3() {
  // Echo back what's configured so the user knows what they're committing
  // to before clicking Open Fox. Either or both can be set; one of them is
  // guaranteed by the time we reach Step 3 (Step 2 either submits an
  // OpenRouter key or routes "Continue with local only" past it).
  let summary = '';
  if (state.localModel) {
    const localLabel = state.localModel.provider === 'ollama'
      ? `${escapeHtml(state.localModel.name)} (Ollama, local)`
      : `${escapeHtml(state.localModel.name)} (bundled local model)`;
    summary += `<li>Local model: <code>${localLabel}</code></li>`;
  }
  if (state.apiKey) {
    summary += "<li>OpenRouter: configured (cloud models available)</li>";
  }
  return `
    <div class="step">
      <h1>Fox is ready!</h1>
      <p>Your assistant is configured and ready to go.</p>
      ${summary ? `<ul class="url-list">${summary}</ul>` : ''}
      <ul class="url-list">
        <li>Local: <code>http://localhost:8787</code></li>
      </ul>
      <div class="btn-actions">
        <button id="open-fox" class="btn btn-primary" onclick="completeSetup()">Open Fox</button>
      </div>
    </div>
  `;
}

// ── Navigation ───────────────────────────────────────────────────────────────

function advance(n) {
  state.currentStep = n;
  renderStep(n);
  updateProgress(n);
}

function renderStep(n) {
  const container = document.getElementById('step-container');
  switch (n) {
    case 1: container.innerHTML = renderStep1(); break;
    case 2: container.innerHTML = renderStep2(); break;
    case 3: container.innerHTML = renderStep3(); break;
  }
}

// ── Key input helpers ────────────────────────────────────────────────────────

function _toggleKeyVisibility() {
  const input = document.getElementById('api-key');
  const btn = input.parentElement.querySelector('.toggle-vis');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'hide';
  } else {
    input.type = 'password';
    btn.textContent = 'show';
  }
}

function setKeyError(msg) {
  const el = document.getElementById('key-error');
  if (el) { el.textContent = msg; }
  const input = document.getElementById('api-key');
  if (input) {
    if (msg) { input.classList.add('has-error'); }
    else { input.classList.remove('has-error'); }
  }
}

function setSubmitting(busy) {
  const btn = document.getElementById('submit-key');
  if (!btn) { return; }
  btn.disabled = busy;
  btn.innerHTML = busy ? '<span class="spinner"></span> Saving...' : 'Next';
}

// ── Submit API key ───────────────────────────────────────────────────────────

async function _submitApiKey() {
  const input = document.getElementById('api-key');
  const key = (input ? input.value : '').trim();

  setKeyError('');

  if (!key) {
    setKeyError('API key is required.');
    return;
  }
  if (!key.startsWith('sk-')) {
    setKeyError('Key must start with sk-.');
    return;
  }

  setSubmitting(true);
  try {
    const { data } = await post('/api/setup/openrouter', { key });
    if (data.ok) {
      state.apiKey = key;
      advance(3);
    } else {
      setKeyError(data.error || 'Failed to save key.');
    }
  } catch (_e) {
    setKeyError('Network error. Please try again.');
  } finally {
    setSubmitting(false);
  }
}

// ── Skip and local-Ollama paths (issue #11) ─────────────────────────────────

async function _skipOnboarding() {
  if (!confirm("Skip the wizard? You can configure providers any time from Settings.")) { return; }
  try {
    await post('/api/onboarding/complete', {});
  } catch (_e) {
    // Non-fatal — backend may have already marked complete.
  }
  // No supervisord restart needed — no env was written. Redirect immediately.
  window.location.href = '/';
}
// The Skip button's inline onclick="skipOnboarding()" resolves a global; keep
// the public name in sync with the implementation.
window.skipOnboarding = _skipOnboarding;

async function useLocalOllama(modelName) {
  if (!modelName) { return; }

  // Replace wizard contents synchronously so the user can't click Next /
  // Skip during the use-model API call. Without this, advance(2) could be
  // triggered mid-async, leaving the user on a stale step (FITB#122 race).
  const container = document.getElementById('step-container');
  if (container) {
    container.innerHTML = `
      <div class="step">
        <h1>Setting up ${escapeHtml(modelName)}</h1>
        <p>Switching to your local model. This will only take a moment.</p>
        <div class="btn-actions">
          <button class="btn btn-primary" disabled><span class="spinner"></span> Setting up…</button>
        </div>
      </div>
    `;
  }

  try {
    const r = await post('/api/ollama/use-model', { model: modelName });
    if (!r.data.ok) {
      alert(`Could not switch to local model: ${r.data.error || 'unknown error'}`);
      renderStep(1);
      return;
    }
  } catch (_e) {
    alert('Network error while switching to local model.');
    renderStep(1);
    return;
  }

  // Local model is now active on the gateway. Continue through Step 2
  // (OpenRouter, optional) so the user explicitly completes the wizard at
  // Step 3. Onboarding is NOT marked complete here — that happens in
  // completeSetup() when the user clicks Open Fox on Step 3.
  state.localModel = { provider: 'ollama', name: modelName };
  advance(2);
}

// Issue #69: bundled llama.cpp fast-path. Toggles on local fallback (kicks
// download via #10's manager if needed), polls status, shows progress in
// place of the welcome step, and finishes onboarding when llama-server is
// ready.
function _renderLocalFallbackProgress(snapshot) {
  const container = document.getElementById('step-container');
  if (!container) { return; }

  const ui = (snapshot?.ui_state) || 'starting';
  const ms = snapshot?.model_state;
  const downloaded = ms && typeof ms.bytes_downloaded === 'number' ? ms.bytes_downloaded : 0;
  const total = ms && typeof ms.bytes_total === 'number' && ms.bytes_total > 0
    ? ms.bytes_total
    : (snapshot?.model_size_bytes) || 0;
  const pct = total > 0 ? Math.min(100, Math.floor((downloaded / total) * 100)) : 0;
  const mb = (n) => (n / 1_048_576).toFixed(0);

  let title, detail, showBar;
  switch (ui) {
    case 'needs-download':
      title = 'Preparing download…';
      detail = 'Queueing the model download.';
      showBar = false;
      break;
    case 'downloading':
      title = 'Downloading local model';
      detail = total > 0
        ? `${mb(downloaded)} / ${mb(total)} MB (${pct}%)`
        : `${mb(downloaded)} MB downloaded`;
      showBar = true;
      break;
    case 'starting':
      title = 'Starting local model server…';
      detail = 'Almost there.';
      showBar = false;
      break;
    case 'warming':
      title = 'Warming up the model…';
      detail = 'Loading weights into memory.';
      showBar = false;
      break;
    case 'ready':
      title = 'Local model is ready';
      detail = 'Opening Fox…';
      showBar = false;
      break;
    default:
      title = 'Setting up local model…';
      detail = '';
      showBar = false;
  }

  // QA fix: when bytes_total is unknown, the bar previously rendered
  // as a 0%-fill and looked frozen. Use an indeterminate animated
  // stripe instead so the user knows progress is happening.
  let bar = '';
  if (showBar) {
    if (total > 0) {
      bar = `<div class="dl-bar"><div class="dl-bar-fill" style="width:${pct}%"></div></div>`;
    } else {
      bar = `<div class="dl-bar dl-bar-indeterminate"><div class="dl-bar-fill"></div></div>`;
    }
  }

  container.innerHTML = `
    <div class="step">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(detail)}</p>
      ${bar}
      <div class="hint">You can close this window — the download keeps going in the background.</div>
    </div>
  `;
}

async function _useLlamaCppFallback() {
  // Kick the toggle. enable() returns immediately with the current snapshot;
  // download (if needed) and llama-server start happen in background threads.
  let snapshot;
  try {
    const r = await post('/api/local-fallback/enable', {});
    if (!r.data || r.data.enabled === false) {
      // v0.7.20 #336 tactical: surface real backend context instead of
      // 'unknown error'. Backend now populates r.data.error (single line)
      // + r.data.errors (full list) when enable() catches exceptions.
      // Fall back to HTTP status + raw response shape if even those are
      // missing — anything is better than 'unknown error' for diagnosing
      // the Win11 repro Stan @bsgdigital flagged.
      const data = r.data || {};
      const detail = data.error
        || (Array.isArray(data.errors) && data.errors.join('; '))
        || `HTTP ${r.status || '?'} — ${JSON.stringify(data).slice(0, 200)}`;
      alert('Could not enable local fallback: ' + detail
        + '\n\nIf this is a fresh install on Windows, please open an issue on GitHub'
        + ' with the message above + the output of `docker logs fox-in-the-box`.');
      return;
    }
    snapshot = r.data;
  } catch (e) {
    alert(`Network error while enabling local fallback: ${e?.message ? e.message : 'no detail'}`);
    return;
  }

  _renderLocalFallbackProgress(snapshot);

  // Poll until ui_state === 'ready'. Phi-4-mini is ~2.5 GB; on a typical
  // residential connection this can take several minutes, so we poll
  // patiently rather than time out.
  const startedAt = Date.now();
  const maxMs = 30 * 60 * 1000;  // 30 minutes — generous for slow links
  const tick = async () => {
    if (Date.now() - startedAt > maxMs) {
      alert('Local model setup is taking longer than expected. Check Settings → Providers later.');
      return;
    }
    let s;
    try {
      s = await getJson('/api/local-fallback/status');
    } catch (_e) {
      setTimeout(tick, 3000);
      return;
    }
    _renderLocalFallbackProgress(s);
    if (s.ui_state === 'ready') {
      // Bundled local model is now active. Continue through Step 2 so the
      // user explicitly completes the wizard at Step 3 — onboarding gets
      // marked complete in completeSetup() when they click Open Fox.
      state.localModel = { provider: 'llama-cpp', name: 'Phi-4-mini' };
      advance(2);
      return;
    }
    setTimeout(tick, 2000);
  };
  setTimeout(tick, 1500);
}

// ── Complete setup ───────────────────────────────────────────────────────────

async function _completeSetup() {
  const btn = document.getElementById('open-fox');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Starting...';
  }

  try {
    await post('/api/setup/complete', { tailscale_connected: false });
  } catch (_e) {
    // Non-fatal -- config is written, proceed anyway
  }

  try {
    await post('/api/setup/restart', {});
  } catch (_e) {
    // Non-fatal -- redirect anyway
  }

  // Wait for services to restart, then redirect
  setTimeout(() => { window.location.href = '/'; }, 3000);
}

// ── Boot ─────────────────────────────────────────────────────────────────────

async function loadOnboardingState() {
  // Welcome content (externalized), Ollama detection, and bundled-llama.cpp
  // status all run in parallel — the wizard renders with sensible fallbacks
  // if any probe fails. (#69 added local-fallback to the probe set.)
  const tasks = [
    getJson('/api/setup/welcome').then(d => { state.welcomeText = d.text || null; }).catch(() => {}),
    getJson('/api/ollama/status').then(async (s) => {
      if (s?.running) {
        try {
          const m = await getJson('/api/ollama/models');
          state.ollama = ({...s,models: (m?.models) || [] ,});
        } catch (_e) {
          state.ollama = ({...s,models: [] ,});
        }
      } else {
        state.ollama = { running: false, models: [] };
      }
    }).catch(() => { state.ollama = { running: false, models: [] }; }),
    getJson('/api/local-fallback/status').then(s => {
      // s.ui_state ∈ {disabled, needs-download, downloading, starting,
      //   warming, ready, no-supervisor, missing-model-registry}.
      // We care about: "ready" (instant fast-path) and supervisor-available
      // states (offer the download CTA). "no-supervisor" hides the CTA.
      state.localFallback = s || null;
    }).catch(() => { state.localFallback = null; }),
  ];
  await Promise.all(tasks);
}

// Delegated click handler for data-action buttons. Avoids inline onclick=
// strings that interpolate user-controlled values (model names from a
// remote Ollama daemon, etc.). Bound once at module init.
document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!t?.nodeType || t.nodeType !== 1) { return; }
  const btn = t.closest('[data-action]');
  if (!btn) { return; }
  const action = btn.getAttribute('data-action');
  if (action === 'use-ollama') {
    useLocalOllama(btn.getAttribute('data-model') || '');
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  // Show the welcome step immediately with hardcoded fallback content,
  // then re-render once the probes return so the user never sees a
  // blank screen if the API is slow.
  renderStep(1);
  updateProgress(1);
  // QA fix: disable Next while probes are in flight so a fast user can't
  // skip past Step 1 with no `state.ollama` / `state.localFallback`
  // populated and miss the local-model fast-paths.
  await loadOnboardingState();
  if (state.currentStep === 1) { renderStep(1); }
});

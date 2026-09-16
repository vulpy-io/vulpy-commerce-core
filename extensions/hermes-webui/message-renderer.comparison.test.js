

/**
 * Focused dependency-free Node test for the temporary side-by-side comparison
 * mode added to message-renderer.js (native transcript left, assistant-ui pane
 * right). Uses only Node built-ins (node:test + node:assert) and a minimal
 * fake DOM/host — no jsdom, no npm install.
 *
 * Run: node --test extensions/hermes-webui/message-renderer.comparison.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Minimal fake DOM / host
// ---------------------------------------------------------------------------

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.id = '';
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.attributes = {};
    this._listeners = {};
  }

  appendChild(child) {
    if (child?.parentNode && child.parentNode !== this) {
      child.parentNode.removeChild(child);
    }
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  insertBefore(child, ref) {
    if (child?.parentNode && child.parentNode !== this) {
      child.parentNode.removeChild(child);
    }
    if (!ref || ref.parentNode !== this) {
      return this.appendChild(child);
    }
    const idx = this.children.indexOf(ref);
    if (idx < 0) { return this.appendChild(child); }
    this.children.splice(idx, 0, child);
    child.parentNode = this;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }

  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  removeEventListener(type, fn) {
    const arr = this._listeners[type];
    if (!arr) { return; }
    const idx = arr.indexOf(fn);
    if (idx >= 0) { arr.splice(idx, 1); }
  }
}

class FakeDocument {
  constructor() {
    this.readyState = 'complete';
    this.documentElement = { clientWidth: 1400 };
    this._byId = Object.create(null);
    this._created = [];
  }

  createElement(tag) {
    const el = new FakeElement(tag);
    this._created.push(el);
    return el;
  }

  getElementById(id) {
    return this._byId[id] || null;
  }

  addEventListener() {}

  removeEventListener() {}
}

const observerInstances = [];
class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = null;
    this.options = null;
    this.disconnected = false;
    observerInstances.push(this);
  }

  observe(el, options) {
    this.observed = el;
    this.options = options || null;
  }

  disconnect() {
    this.disconnected = true;
    this.observed = null;
  }
}

/**
 * Build a fake host resembling the Hermes WebUI transcript area:
 *   #messages (scroller) > #emptyState, #msgInner
 * plus S (session state) and renderMessages() (native renderer).
 */
function makeHost(messages) {
  const doc = new FakeDocument();
  const emptyState = doc.createElement('div');
  emptyState.id = 'emptyState';
  const msgInner = doc.createElement('div');
  msgInner.id = 'msgInner';
  const messagesEl = doc.createElement('div');
  messagesEl.id = 'messages';
  doc._byId.emptyState = emptyState;
  doc._byId.msgInner = msgInner;
  doc._byId.messages = messagesEl;
  messagesEl.appendChild(emptyState);
  messagesEl.appendChild(msgInner);

  const host = {
    doc,
    S: { session: { session_id: 's1' }, messages: messages || [] },
    msgInner,
    messagesEl,
    _nativeRenderCalls: 0,
  };

  const originalRenderMessages = () => {
    host._nativeRenderCalls += 1;
    const lines = (host.S.messages || [])
      .map((m) => String(m.content === undefined ? '' : m.content))
      .join('|');
    host.msgInner.innerHTML = `<div class="msg-row">${lines}</div>`;
    return null;
  };
  host.originalRenderMessages = originalRenderMessages;
  host.renderMessages = originalRenderMessages;
  return host;
}

/** Wrap a fake host into the host-object shape activateComparison() expects. */
function hostObject(h) {
  return {
    S: h.S,
    renderMessages: h.renderMessages,
    renderOwner: h,
    document: h.doc,
    MutationObserver: FakeMutationObserver,
    innerWidth: 1400,
    addEventListener: null,
    removeEventListener: null,
  };
}

function findObserverFor(el) {
  for (const o of observerInstances) {
    if (o.observed === el) { return o; }
  }
  return null;
}

function shellOf(h) {
  return h.msgInner.parentNode && h.msgInner.parentNode.id === 'hermesComparisonShell'
    ? h.msgInner.parentNode
    : null;
}

function paneOf(h) {
  const shell = shellOf(h);
  if (!shell) { return null; }
  return shell.children.find((c) => c.id === 'hermesExtensionPane') || null;
}

function paneBodyOf(h) {
  const pane = paneOf(h);
  if (!pane) { return null; }
  return pane.children.find((c) => c.className.includes('hermes-comparison-pane-body')) || null;
}

// ---------------------------------------------------------------------------
// Host ready BEFORE the module is required → eval-time auto-activation.
// ---------------------------------------------------------------------------
const globalHost = makeHost([
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there' },
]);
globalThis.document = globalHost.doc;
globalThis.S = globalHost.S;
globalThis.renderMessages = globalHost.renderMessages;
globalThis.MutationObserver = FakeMutationObserver;
globalThis.innerWidth = 1400;

const HermesMessageRenderer = require('./message-renderer.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('auto-activates at load when host capabilities exist', () => {
  assert.ok(HermesMessageRenderer, 'module exports API');
  assert.equal(typeof HermesMessageRenderer.activateComparison, 'function');
  assert.equal(HermesMessageRenderer.isComparisonActive(), true);
  const msgInner = globalHost.msgInner;
  assert.ok(msgInner.parentNode, 'msgInner still connected');
  assert.notEqual(msgInner.parentNode, globalHost.messagesEl, 'msgInner wrapped in comparison shell');
  const pane = paneOf(globalHost);
  assert.ok(pane, 'extension pane exists');
  HermesMessageRenderer.deactivateComparison();
  assert.equal(HermesMessageRenderer.isComparisonActive(), false);
  assert.equal(msgInner.parentNode, globalHost.messagesEl, 'placement restored after deactivate');
});

test('native root content is preserved on activation', () => {
  const h = makeHost([{ role: 'user', content: 'Hello' }]);
  h.msgInner.innerHTML = '<div class="msg-row">native-seed</div>';
  const ok = HermesMessageRenderer.activateComparison(hostObject(h));
  assert.equal(ok, true);
  // Activation must NOT clear the native transcript.
  assert.equal(h.msgInner.innerHTML, '<div class="msg-row">native-seed</div>');
  assert.ok(shellOf(h), 'msgInner inside comparison shell');
  // Native render still rebuilds msgInner.
  h.renderMessages();
  assert.ok(h.msgInner.innerHTML.includes('Hello'), 'native render rebuilt msgInner');
  HermesMessageRenderer.deactivateComparison();
});

test('comparison mode never sets _hermesRendererActive', () => {
  const h = makeHost([]);
  HermesMessageRenderer.activateComparison(hostObject(h));
  assert.ok(!h.msgInner._hermesRendererActive, 'flag falsy after activation');
  assert.ok(!h.msgInner._hermesRendererOverlay, 'no overlay div created');
  h.renderMessages();
  assert.ok(!h.msgInner._hermesRendererActive, 'flag falsy after native render');
  HermesMessageRenderer.deactivateComparison();
});

test('comparison shell has separate native and assistant-ui panes', () => {
  const h = makeHost([{ role: 'user', content: 'Hello' }]);
  HermesMessageRenderer.activateComparison(hostObject(h));
  const shell = shellOf(h);
  assert.ok(shell, 'comparison shell wraps msgInner');
  const pane = paneOf(h);
  assert.ok(pane, 'extension pane present');
  assert.notEqual(pane, h.msgInner, 'pane is separate from native root');
  assert.ok(shell.children.includes(h.msgInner), 'msgInner lives inside shell');
  // Labels: Native chip + assistant-ui pane header.
  const nativeLabel = shell.children.find((c) => c.id === 'hermesComparisonNativeLabel');
  assert.ok(nativeLabel, 'native label present');
  assert.ok(nativeLabel.textContent.includes('Native'));
  const paneHeader = pane.children.find((c) => c.className.includes('hermes-comparison-pane-header'));
  assert.ok(paneHeader, 'pane header present');
  assert.ok(paneHeader.textContent.includes('assistant-ui'));
  HermesMessageRenderer.deactivateComparison();
  assert.equal(h.msgInner.parentNode, h.messagesEl, 'placement restored');
});

test('desktop layout reserves separate horizontal panes and teardown restores classes', () => {
  const h = makeHost([{ role: 'user', content: 'Hello' }]);
  h.messagesEl.className = 'messages-before';
  h.msgInner.className = 'inner-before';
  HermesMessageRenderer.activateComparison(hostObject(h));
  assert.match(h.messagesEl.className, /hermes-comparison-host/);
  assert.match(h.msgInner.className, /hermes-comparison-native/);
  const style = shellOf(h).children.find((c) => c.id === 'hermesComparisonCss');
  assert.ok(style.textContent.includes('.hermes-comparison-native{width:54%'), 'native pane reserves left width');
  assert.ok(style.textContent.includes('.hermes-comparison-pane{position:absolute'), 'assistant pane occupies right side');
  HermesMessageRenderer.deactivateComparison();
  assert.equal(h.messagesEl.className, 'messages-before');
  assert.equal(h.msgInner.className, 'inner-before');
});

test('host render update refreshes extension pane without recursion', async () => {
  const h = makeHost([
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'First answer' },
  ]);
  HermesMessageRenderer.activateComparison(hostObject(h));
  const body = paneBodyOf(h);
  assert.ok(body, 'pane body exists');
  // Initial render happens immediately, without touching the native renderer.
  assert.ok(body.innerHTML.includes('First answer'), 'initial render shows assistant text');
  assert.equal(h._nativeRenderCalls, 0, 'initial render did not call native renderer');

  // New message + native render through the wrapped function.
  h.S.messages.push({ role: 'assistant', content: 'Streaming tick text' });
  h.renderMessages();
  assert.equal(h._nativeRenderCalls, 1, 'native render called exactly once');
  assert.ok(body.innerHTML.includes('Streaming tick text'), 'pane refreshed after render');
  assert.ok(body.innerHTML.includes('First answer'), 'previous messages preserved');

  // MutationObserver path: streaming ticks that do not call renderMessages().
  const obs = findObserverFor(h.msgInner);
  assert.ok(obs, 'observer installed on msgInner');
  h.S.messages.push({ role: 'user', content: 'Another tick' });
  obs.callback();
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.ok(body.innerHTML.includes('Another tick'), 'pane refreshed via observer');
  assert.equal(h._nativeRenderCalls, 1, 'observer sync did not re-enter native renderer');
  HermesMessageRenderer.deactivateComparison();
});

test('repeated activation is idempotent', () => {
  const h = makeHost([{ role: 'user', content: 'Hello' }]);
  assert.equal(HermesMessageRenderer.activateComparison(hostObject(h)), true);
  const shellBefore = shellOf(h);
  assert.ok(shellBefore);
  assert.equal(HermesMessageRenderer.activateComparison(hostObject(h)), true);
  assert.equal(shellOf(h), shellBefore, 'no duplicate shell');
  const shells = h.doc._created.filter((el) => el.id === 'hermesComparisonShell');
  assert.equal(shells.length, 1, 'exactly one comparison shell created');
  assert.equal(h.renderMessages._hermesComparisonWrapped, true, 'renderMessages wrapped once');
  HermesMessageRenderer.deactivateComparison();
});

test('unmount restores native DOM behavior and layout', () => {
  const h = makeHost([{ role: 'user', content: 'Hello' }]);
  const original = h.renderMessages;
  HermesMessageRenderer.activateComparison(hostObject(h));
  assert.notEqual(h.renderMessages, original, 'renderMessages wrapped during comparison');
  const obs = findObserverFor(h.msgInner);
  assert.ok(obs);
  HermesMessageRenderer.unmount();
  assert.equal(h.msgInner.parentNode, h.messagesEl, 'msgInner restored to original parent');
  const shells = h.doc._created.filter((el) => el.id === 'hermesComparisonShell');
  assert.equal(shells.filter((el) => el.parentNode !== null).length, 0, 'shell removed from DOM');
  assert.equal(h.renderMessages, original, 'renderMessages wrapper removed');
  assert.equal(obs.disconnected, true, 'observer disconnected');
  assert.ok(!h.msgInner._hermesRendererActive, 'flag not set');
  assert.equal(HermesMessageRenderer.isComparisonActive(), false);
  // Native rendering remains functional after unmount.
  h.S.messages.push({ role: 'assistant', content: 'Post unmount native' });
  h.renderMessages();
  assert.ok(h.msgInner.innerHTML.includes('Post unmount native'), 'native render works after unmount');
});

test('activation fails closed without host capabilities', () => {
  HermesMessageRenderer.deactivateComparison();
  const h = makeHost([]);
  const bad = hostObject(h);
  bad.S = null;
  assert.equal(HermesMessageRenderer.activateComparison(bad), false);
  bad.S = h.S;
  const originalRender = bad.renderOwner.renderMessages;
  bad.renderOwner.renderMessages = null;
  bad.renderMessages = null;
  assert.equal(HermesMessageRenderer.activateComparison(bad), false);
  bad.renderOwner.renderMessages = originalRender;
  bad.renderMessages = originalRender;
  bad.document = null;
  assert.equal(HermesMessageRenderer.activateComparison(bad), false);
  assert.equal(HermesMessageRenderer.isComparisonActive(), false);
  assert.equal(h.msgInner.parentNode, h.messagesEl, 'no DOM changes on failed activation');
});

test('projection preserves roles and message grouping', () => {
  HermesMessageRenderer.deactivateComparison();
  const h = makeHost([
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Answer', reasoning: 'Think step' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'tc1', type: 'function', function: { name: 'search', arguments: '{"q":"x"}' } },
      ],
    },
  ]);
  HermesMessageRenderer.activateComparison(hostObject(h));
  const body = paneBodyOf(h);
  assert.ok(body, 'pane body exists');
  const html = body.innerHTML;
  assert.ok(html.includes('data-role="user"'), 'user grouping preserved');
  assert.ok(html.includes('data-role="assistant"'), 'assistant grouping preserved');
  assert.ok(html.includes('Hello'), 'user text projected');
  assert.ok(html.includes('Answer'), 'assistant text projected');
  assert.ok(html.includes('Think step'), 'reasoning projected');
  assert.ok(html.includes('search'), 'tool name projected');
  assert.ok(html.includes('&quot;q&quot;'), 'tool input projected and HTML-escaped');
  HermesMessageRenderer.deactivateComparison();
});

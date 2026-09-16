#!/usr/bin/env node
/**
 * Real-browser layout + interaction e2e for the cross-session approval banner
 * (issue #136 v2, patch-webui-global-approval-banner.py).
 *
 * WHY: jsdom cannot measure layout — the v1 bug (banner appended to
 * document.body inheriting .approval-card's bottom:-24px, landing below/
 * behind the composer) is invisible to unit tests. This harness loads the
 * REAL static/style.css + the REAL patcher-injected JS in headless Chromium
 * with a faithful composer layout, then verifies:
 *
 *   1. placement: banner fully inside the viewport, above the composer,
 *      every action button hit-testable (elementFromPoint returns the button)
 *   2. interaction: "Allow once" posts exactly once under rapid double-click,
 *      banner clears, buttons re-enable
 *   3. queue: the merged poll cycles through multiple cross-session approvals
 *      and hides when none remain; viewed-session approvals still route to
 *      the per-session card
 *   4. transcript padding: #messages gets .approval-open while the banner is
 *      visible (last message never hidden behind the card)
 *
 * Prereqs (this container):
 *   - Chrome: /opt/hermes/.playwright/chromium-&lt;ver&gt;/chrome-linux64/chrome
 *   - puppeteer-core (install once):
 *       cd /tmp/e2e-deps && npm init -y && npm install puppeteer-core@23 --no-save --legacy-peer-deps
 *
 * Run:
 *   node tests/guardrails-banner-layout.e2e.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PATCHER = path.join(ROOT, "scripts", "patch-webui-global-approval-banner.py");
const WEBUI_STATIC = "/app/hermes-webui/static";

const require = createRequire(import.meta.url);
let puppeteer = null;
try {
  puppeteer = require("puppeteer-core");
} catch {
  try {
    puppeteer = require("/tmp/e2e-deps/node_modules/puppeteer-core");
  } catch {
    console.error(
      "puppeteer-core not found. Install once:\n" +
        "  mkdir -p /tmp/e2e-deps && cd /tmp/e2e-deps && npm init -y && " +
        "npm install puppeteer-core@23 --no-save --legacy-peer-deps",
    );
    process.exit(2);
  }
}

function resolveChrome() {
  const candidates = [
    "/opt/hermes/.playwright/chromium-1234/chrome-linux64/chrome",
    "/opt/hermes/.playwright/chromium-1228/chrome-linux64/chrome",
    ...fs.existsSync("/app/.cache/puppeteer")
      ? fs.readdirSync("/app/.cache/puppeteer")
          .filter((d) => d.startsWith("chrome"))
          .map((d) => `/app/.cache/puppeteer/${d}/chrome-linux64/chrome`)
      : [],
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) { return c; }
  }
  throw new Error("No Chrome binary found — set CHROME_PATH or check /opt/hermes/.playwright");
}

// The exact JS the patcher injects (single source of truth = the patcher).
const BANNER_JS = execSync(
  `python3 -c "import importlib.util as u; s=u.spec_from_file_location('banner_patcher', '${PATCHER}'); m=u.module_from_spec(s); s.loader.exec_module(m); print(m.NEW.replace(m.OLD, ''))"`,
  { encoding: "utf-8" },
);

const HARNESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>approval banner e2e</title>
<link rel="stylesheet" href="/static/style.css">
<style>
  :root { --bg:#fdfbf7; --text:#26241f; --border:#e0dacb; --muted:#8a8478;
          --accent:#b5893a; --surface:#f5f1e8; --surface-subtle:#f0ebdf;
          --sidebar:#f8f5ee; --topbar-bg:#fdfbf7; --msg-max:760px;
          --font-ui:system-ui,sans-serif; --font-mono:ui-monospace,monospace; }
  html,body{height:100%;margin:0;background:var(--bg);color:var(--text);}
  .app{display:flex;flex-direction:column;height:100vh;}
  .messages-shell{flex:1;min-height:0;display:flex;flex-direction:column;}
  #messages{flex:1;overflow-y:auto;display:flex;flex-direction:column;min-height:0;
             border:1px solid var(--border);background:var(--bg);}
  .msg{min-height:54px;padding:10px 20px;border-bottom:1px solid var(--border);}
  .composer-wrap{position:relative;padding:12px 20px 16px;background:var(--bg);flex-shrink:0;
                 border-top:1px solid var(--border);}
  .composer-box{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--surface);
                border:1px solid var(--border);border-radius:12px;}
  .composer-box textarea{flex:1;min-height:40px;border:none;outline:none;resize:none;
                         background:transparent;color:var(--text);font:14px/1.4 var(--font-ui);}
</style></head><body>
<div class="app">
  <div class="messages-shell">
    <div class="messages" id="messages">
      <div class="msg">past message 1</div><div class="msg">past message 2</div>
      <div class="msg">past message 3</div><div class="msg">past message 4</div>
      <div class="msg">past message 5</div><div class="msg">past message 6</div>
      <div class="msg">past message 7</div><div class="msg">past message 8</div>
    </div>
  </div>
  <div class="composer-wrap" id="composerWrap">
    <div class="composer-flyout">
      <div class="approval-card" id="approvalCard" role="alertdialog" hidden aria-hidden="true" inert>
        <div class="approval-inner">
          <div class="approval-header"><span id="approvalHeading">Approval required</span></div>
          <div class="approval-desc" id="approvalDesc"></div>
          <div class="approval-cmd" id="approvalCmd"></div>
          <div class="approval-btns" id="approvalBtns">
            <button class="approval-btn once" id="approvalBtnOnce">Allow once</button>
          </div>
        </div>
      </div>
    </div>
    <div class="composer-box"><textarea id="msg" placeholder="Message Fox…"></textarea></div>
  </div>
</div>
<script src="/driver.js"></script>
</body></html>`;

const DRIVER_JS = `
// ── Stubs for host globals the injected banner code resolves at call time ──
window.S = { session: { session_id: "viewed" } };
window._promptActiveSessionId = () => "viewed";
window._approvalPromptBelongsToActiveSession = (sid) => sid === "viewed";
window._isApprovalDismissed = () => false;
window._markApprovalDismissed = () => {};
window._clearApprovalPendingForSession = () => {};
window._unmarkApprovalDismissed = () => {};
window._hideApprovalCardIfOwner = () => {};
window._approvalPollingSessionMissingOrMismatched = () => false;
window._approvalFallbackPollInFlight = false;
window._approvalPollingSessionId = "viewed";
window._approvalPendingBySession = new Map();
window._approvalMessagesNearBottom = () => true;
window.scrollToBottom = () => {};
window.showToast = (m) => { (window.__toasts = window.__toasts || []).push(m); };
window.showApprovalCard = (pending, count) => { window.__cardShown = { pending, count }; };
window.showApprovalForSession = (sid, pending, pendingCount) => {
  if (!pending) return;
  pending._session_id = sid;
  window.showApprovalCard(pending, pendingCount);
};
window._syncApprovalTranscriptSpace = (card, opts) => {
  const messages = document.getElementById("messages");
  if (!messages) return;
  if (!card || !card.classList || !card.classList.contains("visible")) {
    messages.classList.remove("approval-open");
    messages.style.removeProperty("--approval-card-height");
    return;
  }
  messages.classList.add("approval-open");
  const inner = card.querySelector(".approval-inner");
  const h = inner ? inner.getBoundingClientRect().height : 0;
  if (h > 0) messages.style.setProperty("--approval-card-height", Math.ceil(h + 24) + "px");
};
window.api = async (path, opts) => {
  const p = String(path || "");
  const rec = { path: p };
  window.__apiCalls = window.__apiCalls || [];
  if (p === "/api/approval/pending") {
    rec.response = { approvals: window.__mockApprovals || [] };
    window.__apiCalls.push(rec);
    return { approvals: window.__mockApprovals || [] };
  }
  if (p === "/api/approval/respond") {
    const body = JSON.parse((opts && opts.body) || "{}");
    window.__respondCalls = window.__respondCalls || [];
    window.__respondCalls.push(body);
    window.__apiCalls.push(rec);
    if (window.__respondDelayMs) await new Promise(r => setTimeout(r, window.__respondDelayMs));
    const idx = (window.__mockApprovals || []).findIndex(
      a => (a.approval_id || null) === (body.approval_id || null));
    if (idx >= 0) window.__mockApprovals.splice(idx, 1);
    return { ok: true };
  }
  window.__apiCalls.push(rec);
  return { ok: true };
};
${BANNER_JS}
window.__approval = {
  show: (e) => _showGlobalApprovalBanner(e),
  hide: () => _hideGlobalApprovalBanner(),
  respond: (c) => respondGlobalApproval(c),
  tick: () => _mergedApprovalPollTick(),
  entry: () => _globalApprovalEntry,
  responding: () => _globalApprovalResponding,
  cardShown: () => window.__cardShown,
  apiCalls: () => window.__apiCalls,
  respondCalls: () => window.__respondCalls || [],
  toasts: () => window.__toasts || [],
  setApprovals: (a) => { window.__mockApprovals = a; },
  setRespondDelay: (ms) => { window.__respondDelayMs = ms; },
};
`;

const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "approval-e2e-"));
fs.writeFileSync(path.join(tmpDir, "driver.js"), DRIVER_JS);
fs.writeFileSync(path.join(tmpDir, "index.html"), HARNESS_HTML);

let failures = 0;
function check(name, ok, detail) {
  const status = ok ? "  ✓" : "  ✗ FAIL";
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`${status} ${name}${suffix}`);
  if (!ok) { failures++; }
}

const server = http.createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/favicon.ico") { res.writeHead(204); res.end(); return; }
  if (p === "/") { p = path.join(tmpDir, "index.html"); }
  if (p === "/driver.js") { p = path.join(tmpDir, "driver.js"); }
  else if (p.startsWith("/static/")) { p = path.join(WEBUI_STATIC, p.slice("/static/".length)); }
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end(`nf:${p}`);
  }
});

const PORT = 8941;
server.listen(PORT, async () => {
  let browser = null;
  try {
    const chrome = process.env.CHROME_PATH || resolveChrome();
    console.log("chrome:", chrome);
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      userDataDir: `/tmp/approval-e2e-profile-${process.pid}`,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
             "--disable-gpu", "--no-first-run"],
      env: { ...process.env, HOME: "/tmp/chrome-home" },
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    page.on("console", (m) => console.log("  CONSOLE:", m.type(), m.text().slice(0, 300)));
    page.on("pageerror", (e) => console.log("  PAGEERROR:", e.message.slice(0, 300)));
    await page.evaluateOnNewDocument(() => {
      window.__pageErrors = [];
      window.addEventListener("error", (e) => window.__pageErrors.push(String(e.message || e)));
    });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
    try {
      await page.waitForFunction(() => !!window.__approval, { timeout: 10_000 });
    } catch {
      const diag = await page.evaluate(() => ({
        ready: document.readyState,
        resources: performance.getEntriesByType("resource").map((r) => r.name.split("/").pop()),
        errors: window.__pageErrors || [],
        hasDriver: !!window.api,
        driverKeys: Object.keys(window).filter((k) => k.startsWith("__")),
      }));
      console.log("  DIAG:", JSON.stringify(diag, null, 1));
      throw new Error("driver did not initialize");
    }

    // ── 1. Placement: banner fully visible, above composer, buttons hit-testable ──
    const geo = await page.evaluate(() => {
      window.__approval.show({
        _session_id: "other-session-1",
        session_id: "other-session-1",
        approval_id: "a-1",
        description: "run destructive command",
        command: "rm -rf /tmp/x",
      });
      const banner = document.getElementById("globalApprovalBanner");
      const rect = banner.getBoundingClientRect();
      const btns = [...banner.querySelectorAll(".approval-btns button")];
      const hit = (el) => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const top = document.elementFromPoint(x, y);
        return { x, y, hit: top ? (top === el || el.contains(top)) : false, tag: top ? top.tagName : null };
      };
      const input = document.getElementById("msg");
      const _inputR = input.getBoundingClientRect();
      const inputHit = hit(input);
      const messages = document.getElementById("messages");
      return {
        viewport: { w: innerWidth, h: innerHeight },
        banner: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
                  height: rect.height, parent: banner.parentElement ? banner.parentElement.className : null },
        buttons: btns.map((b) => ({ label: b.dataset.choice, ...hit(b) })),
        input: { ...inputHit },
        transcriptOpen: messages.classList.contains("approval-open"),
        cardVar: messages.style.getPropertyValue("--approval-card-height"),
      };
    });

    check("banner parent is .composer-flyout", geo.banner.parent === "composer-flyout");
    check("banner fully inside viewport",
      geo.banner.top >= 0 && geo.banner.bottom <= geo.viewport.h);
    check("banner above composer input",
      geo.banner.bottom <= geo.input.y + 2);
    for (const b of geo.buttons) {
      check(`button "${b.label}" hit-testable`, b.hit, `hit=${b.tag}`);
    }
    check("composer input still clickable", geo.input.hit, `hit=${geo.input.tag}`);
    check("transcript reserved space (.approval-open)", geo.transcriptOpen, `var=${geo.cardVar}`);

    // ── 2. Rapid double-click posts exactly once, banner clears ──
    await page.evaluate(() => {
      window.__apiCalls = [];
      window.__respondCalls = [];
      window.__approval.show({
        _session_id: "other-session-2",
        approval_id: "a-2",
        description: "double click test",
        command: "echo hi",
      });
    });
    await new Promise((r) => setTimeout(r, 120));
    const btn = await page.$("#globalApprovalBanner .approval-btn.once");
    const btnBox = await btn.boundingBox();
    await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2, { clickCount: 1 });
    await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2, { clickCount: 1 });
    await new Promise((r) => setTimeout(r, 250));
    const double = await page.evaluate(() => ({
      responds: window.__approval.respondCalls().length,
      entry: window.__approval.entry(),
      hidden: document.getElementById("globalApprovalBanner").hidden,
    }));
    check("double click → exactly 1 respond POST", double.responds === 1, `calls=${double.responds}`);
    check("banner cleared after approval", double.entry === null && double.hidden);

    // ── 3. Merged poll queue: cycles approvals, hides when none remain ──
    await page.evaluate(() => {
      window.__approval.setApprovals([
        { session_id: "child-a", approval_id: "q-1", description: "queue 1" },
      ]);
      window.__approval.tick();
    });
    await new Promise((r) => setTimeout(r, 80));
    const q1 = await page.evaluate(() => window.__approval.entry());
    check("queue: first cross-session approval shown", q1 && q1.approval_id === "q-1", JSON.stringify(q1));

    await page.evaluate(() => {
      window.__approval.setApprovals([
        { session_id: "child-b", approval_id: "q-2", description: "queue 2" },
        { session_id: "child-c", approval_id: "q-3", description: "queue 3" },
      ]);
      window.__approval.tick();
    });
    await new Promise((r) => setTimeout(r, 80));
    const q2 = await page.evaluate(() => window.__approval.entry());
    check("queue: advances to next approval", q2 && q2.approval_id === "q-2", JSON.stringify(q2));

    await page.evaluate(() => { window.__approval.setApprovals([]); window.__approval.tick(); });
    await new Promise((r) => setTimeout(r, 80));
    const q3 = await page.evaluate(() => window.__approval.entry());
    check("queue: banner hidden when none remain", q3 === null);

    // ── 4. Viewed-session approvals still route to the per-session card ──
    await page.evaluate(() => {
      window.__approval.setApprovals([
        { session_id: "viewed", approval_id: "v-1", description: "viewed cmd" },
      ]);
      window.__approval.tick();
    });
    await new Promise((r) => setTimeout(r, 80));
    const viewed = await page.evaluate(() => ({
      card: window.__approval.cardShown(),
      banner: window.__approval.entry(),
    }));
    check("viewed-session approval → per-session card (not banner)",
      viewed.card?.pending && viewed.card.pending.approval_id === "v-1" && viewed.banner === null,
      JSON.stringify(viewed));

    // ── 5. Stuck-UI guard: respond with in-flight disable + recovery ──
    await page.evaluate(() => {
      window.__approval.setApprovals([
        { session_id: "child-d", approval_id: "s-1", description: "slow respond" },
      ]);
      window.__approval.tick();
      window.__approval.setRespondDelay(400);
    });
    await new Promise((r) => setTimeout(r, 80));
    const during = await page.evaluate(() => {
      const p = window.__approval.respond("once");
      window.__slowRespondPromise = p;
      const btns = [...document.querySelectorAll("#globalApprovalBanner .approval-btns button")];
      return {
        disabled: btns.map((b) => b.disabled),
        responding: !!window.__approval.responding(),
      };
    });
    check("buttons disabled while respond in flight", during.disabled.every(Boolean) && during.responding);
    await page.evaluate(() => window.__slowRespondPromise);
    await new Promise((r) => setTimeout(r, 100));
    const after = await page.evaluate(() => ({
      entry: window.__approval.entry(),
      responding: window.__approval.responding(),
    }));
    check("respond resolves: banner cleared, state reset", after.entry === null && after.responding === null);

    console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
    await browser.close();
    server.close();
    process.exit(failures === 0 ? 0 : 1);
  } catch (e) {
    console.error("E2E ERROR:", e.message.split("\n")[0]);
    if (browser) { await browser.close().catch(() => {}); }
    server.close();
    process.exit(1);
  }
});

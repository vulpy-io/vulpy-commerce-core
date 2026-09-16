/* Vulpy Commerce — env actions feature.
 *
 * Action bar below the env pill: Push to Staging / Push to Live / Pull Data /
 * View Logs. Each action drives the host agent-cmd server
 * (scripts/vulpy-agent-cmd-server.py) directly through its file-drop protocol
 * using the WebUI's workspace file API:
 *
 *   1. POST /api/file/create  agent-cmds/req/<uuid>.req.json
 *   2. GET  /api/file?session_id=...&path=...  agent-cmds/resp/<uuid>.resp.json  (poll)
 *   3. POST /api/file/delete  cleanup (best-effort; the daemon prunes too)
 *
 * env.push / env.pull_data stream output incrementally — the server rewrites
 * the response file with "done": false until the subprocess exits — so the
 * mini log panel renders output as it arrives. env.logs is one-shot.
 *
 * Namespace: vc-env-actions-* ids/classes, data-vc-env-actions attributes.
 * No globals beyond the VulpyCommerce registry entry. Does NOT touch the
 * WebUI's embedded terminal, so it cannot interfere with the operator's own
 * terminal or other extensions.
 */
(() => {
  

  if (!window.VulpyCommerce) {
    console.error("[vulpy-commerce] core bootstrap missing — env-actions disabled");
    return;
  }
  if (typeof VulpyCommerce.getSessionEnv !== "function") {
    console.error("[vulpy-commerce] env-context missing — env-actions disabled");
    return;
  }
  if (!VulpyCommerce.isEnvironmentControlsVisible()) { return; }

  VulpyCommerce.register({
    id: "env-actions",
    name: "Environment Actions",
  });

  // ─── Constants ─────────────────────────────────────────────────────────
  const VALID_ENVS = ["dev", "staging", "live"];
  const REQ_DIR = "agent-cmds/req";
  const RESP_DIR = "agent-cmds/resp";
  const POLL_MS = 400;
  const TIMEOUT_MS = 320_000; // client-side; the daemon kills commands at 300s

  // ─── State ─────────────────────────────────────────────────────────────
  let bar = null;
  let logPanel = null;
  let logOutput = null;
  let logStatus = null;
  let logServiceSelect = null;
  let modal = null;
  let modalResolve = null;
  let pullMenu = null;
  let syncBtn = null;           // always visible sync button (mobile trigger)
  let mobileMenu = null;
  let mobilePull = null;
  let pullBtn = null;          // desktop Pull Data button (chevron state)
  let mobilePullBtn = null;    // mobile menu Pull Data button (chevron state)
  let activeRun = null;
  let built = false;

  // ─── Small helpers ─────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (key === "class") { node.className = value; }
        else if (key === "text") { node.textContent = value; }
        else if (key === "html") { node.innerHTML = value; }
        else { node.setAttribute(key, value); }
      }
    }
    for (const child of children || []) {
      if (child) { node.appendChild(child); }
    }
    return node;
  }

  function getSessionId() {
    if (typeof S !== "undefined" && S && S.session && S.session.session_id) {
      return String(S.session.session_id);
    }
    return null;
  }

  // ─── Thin chevron icons (stroke-width 2, like the host titlebar chevrons) ──
  function chevronIcon(direction) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("points", direction === "up" ? "18 15 12 9 6 15" : "6 9 12 15 18 9");
    svg.appendChild(poly);
    return svg;
  }

  // ─── Up/down arrow icons for sync button (thin SVG, like host iconography) ──
  function _syncArrowIcon(direction) {
    // Export (up arrow): a rightward arrow pointing out
    // Import (down arrow): a leftward arrow pointing in
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    if (direction === "up") {
      // Up-right arrow: export
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "3");
      line.setAttribute("y1", "13");
      line.setAttribute("x2", "13");
      line.setAttribute("y2", "3");
      svg.appendChild(line);
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      p1.setAttribute("points", "7 3 13 3 13 9");
      svg.appendChild(p1);
    } else {
      // Down-left arrow: import
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "3");
      line.setAttribute("y1", "13");
      line.setAttribute("x2", "13");
      line.setAttribute("y2", "3");
      svg.appendChild(line);
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      p1.setAttribute("points", "13 7 13 13 7 13");
      svg.appendChild(p1);
    }
    return svg;
  }

  function chevronWrap() {
    return el("span", { class: "vc-env-chevron", "aria-hidden": "true" }, [chevronIcon("down")]);
  }

  function setChevronState(btn, open) {
    if (!btn) { return; }
    btn.setAttribute("aria-expanded", String(!!open));
    const chev = btn.querySelector(".vc-env-chevron");
    if (chev) { chev.classList.toggle("is-open", !!open); }
  }

  function getCurrentEnv() {
    const env = VulpyCommerce.getSessionEnv();
    return VALID_ENVS.indexOf(env) === -1 ? "dev" : env;
  }

  function uuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID (never on modern browsers)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      // x → random nibble; y → RFC 4122 variant nibble (8, 9, a, b)
      return (c === "x" ? r : (r % 4) + 8).toString(16);
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function fmtArgs(args) {
    const parts = [];
    for (const key of Object.keys(args || {})) {
      const value = args[key];
      parts.push(`--arg ${key}=${value === true ? "true" : value === false ? "false" : value}`);
    }
    return parts.join(" ");
  }

  // ─── Agent-cmd bridge client (file-drop protocol via WebUI file API) ───
  function writeReq(runId, payload) {
    return api("/api/file/create", {
      method: "POST",
      body: JSON.stringify({
        session_id: getSessionId(),
        path: `${REQ_DIR}/${runId}.req.json`,
        content: payload,
      }),
    });
  }

  async function readResp(runId) {
    // Returns the parsed response object, or null when the resp file is not
    // there yet (the daemon writes it after it picks up the request).
    // Real WebUI contract: GET /api/file?session_id=...&path=... (the
    // /api/file/read route does not exist; see api/routes.py in hermes-webui).
    try {
      const body = await api(
        `/api/file?session_id=${encodeURIComponent(getSessionId())}` +
        `&path=${encodeURIComponent(`${RESP_DIR}/${runId}.resp.json`)}`
      );
      return JSON.parse(body.content || "{}");
    } catch (err) {
      if (err && err.status === 404) { return null; }
      throw err;
    }
  }

  function deleteFile(path) {
    return api("/api/file/delete", {
      method: "POST",
      body: JSON.stringify({ session_id: getSessionId(), path }),
    }).catch(() => { /* best-effort cleanup */ });
  }

  // ─── Log panel ─────────────────────────────────────────────────────────
  function appendLog(text, kind) {
    if (!logOutput) { return; }
    const maxChars = 20_000;
    const node = document.createElement("span");
    if (kind === "cmd") { node.className = "vc-env-actions-log-cmd"; }
    else if (kind === "err") { node.className = "vc-env-actions-log-err"; }
    node.textContent = text;
    logOutput.appendChild(node);
    // Bound the transcript so a long stream cannot grow the DOM forever.
    while (logOutput.childNodes.length > 0 && logOutput.textContent.length > maxChars) {
      logOutput.removeChild(logOutput.firstChild);
    }
    logOutput.scrollTop = logOutput.scrollHeight;
  }

  function setLogStatus(text, kind) {
    if (!logStatus) { return; }
    logStatus.textContent = text;
    logStatus.className = `vc-env-actions-log-status${kind ? ` vc-env-actions-log-status--${kind}` : ""}`;
  }

  function openLogPanel(title) {
    if (!logPanel) { return; }
    logPanel.hidden = false;
    logPanel.querySelector(".vc-env-actions-log-title").textContent = title;
    logOutput.textContent = "";
    setLogStatus("idle");
    // NOTE: do NOT reset logServiceSelect here — the user may have picked a
    // service; the visible select must match what the request will use.
    // Reset happens in finishRun/closeLogPanel.
  }

  function closeLogPanel() {
    if (activeRun) { activeRun.aborted = true; activeRun = null; }
    setButtonsEnabled(true);
    if (logServiceSelect) { logServiceSelect.value = "all"; }
    if (logPanel) { logPanel.hidden = true; }
    if (pullMenu) { pullMenu.hidden = true; setChevronState(pullBtn, false); }
    closeMobileMenu();
  }

  // ─── Confirm modal (push to live / pull data) ──────────────────────────
  function askConfirm({ title, message, confirmLabel }) {
    if (!modal) { return Promise.resolve(false); }
    modal.hidden = false;
    modal.querySelector(".vc-env-actions-modal-title").textContent = title;
    modal.querySelector(".vc-env-actions-modal-message").textContent = message;
    modal.querySelector(".vc-env-actions-modal-confirm").textContent = confirmLabel || "Continue";
    return new Promise((resolve) => {
      modalResolve = resolve;
    });
  }

  function resolveModal(value) {
    if (!modalResolve) { return; }
    modal.hidden = true;
    const resolve = modalResolve;
    modalResolve = null;
    resolve(value);
  }

  // ─── Run an agent-cmd operation ────────────────────────────────────────
  function runAgentCmd({ cmd, args, title }) {
    if (activeRun) {
      appendLog("\n[busy] another operation is still running — wait for it to finish.\n", "err");
      return Promise.resolve({ ok: false, busy: true });
    }

    const run = {
      id: uuid(),
      cmd,
      args: args || {},
      outLen: 0,
      errLen: 0,
      aborted: false,
    };
    activeRun = run;

    openLogPanel(title || `${cmd} — ${getCurrentEnv()}`);
    setButtonsEnabled(false);
    appendLog(`$ agent-cmd ${cmd} ${fmtArgs(run.args)}\n`, "cmd");
    setLogStatus("running…", "running");

    return (async () => {
      try {
        try {
          await writeReq(run.id, JSON.stringify({ id: run.id, cmd: run.cmd, args: run.args }));
        } catch (err) {
          return finishRun(run, { ok: false, error: apiErrorMessage(err) });
        }

        const deadline = Date.now() + TIMEOUT_MS;
        while (Date.now() < deadline) {
          if (run.aborted) { return finishRun(run, { ok: false, aborted: true }); }
          let resp = null;
          try {
            resp = await readResp(run.id);
          } catch (err) {
            return finishRun(run, { ok: false, error: apiErrorMessage(err) });
          }
          if (resp) {
            const out = resp.out || "";
            const errText = resp.err || "";
            if (out.length > run.outLen) { appendLog(out.slice(run.outLen)); run.outLen = out.length; }
            if (errText.length > run.errLen) { appendLog(errText.slice(run.errLen), "err"); run.errLen = errText.length; }
            // One-shot commands (env.logs, dev.status, ...) omit "done";
            // `undefined !== false` is treated as final, while streaming
            // commands write "done": false until the subprocess exits.
            if (resp.done !== false) {
              return finishRun(run, { ok: !!resp.ok, resp });
            }
          }
          await sleep(POLL_MS);
        }

        return finishRun(run, { ok: false, timeout: true });
      } finally {
        // Always clean up BOTH files. The client owns the req file (req/ is
        // Fox-owned) and the daemon cannot unlink it (PermissionError), so a
        // leftover req would re-execute after a daemon restart — including
        // mutating env.push/env.pull_data without fresh confirmation.
        await deleteFile(`${REQ_DIR}/${run.id}.req.json`);
        await deleteFile(`${RESP_DIR}/${run.id}.resp.json`);
      }
    })();
  }

  function finishRun(run, outcome) {
    if (activeRun === run) { activeRun = null; }
    setButtonsEnabled(true);
    // The run is over — the service select returns to the default so the
    // visible value always matches what the NEXT run will use.
    if (logServiceSelect) { logServiceSelect.value = "all"; }
    if (outcome.aborted) {
      setLogStatus("aborted", "err");
    } else if (outcome.timeout) {
      appendLog("\n[error] no response from the agent-cmd server after 320s — is it running on the host? (pnpm vulpy agent-server status)\n", "err");
      setLogStatus("timed out", "err");
    } else if (outcome.error) {
      appendLog(`\n[error] ${outcome.error}\n`, "err");
      setLogStatus("error", "err");
    } else if (outcome.ok) {
      appendLog("\ndone (exit 0)\n", "ok");
      setLogStatus("done (exit 0)", "ok");
    } else {
      appendLog("\nfailed (exit 1)\n", "err");
      setLogStatus("failed (exit 1)", "err");
    }
    return outcome;
  }

  function apiErrorMessage(err) {
    if (!err) { return "unknown error"; }
    return (err && (err.message || err.statusText)) || String(err);
  }

  // ─── HMAC client-side signing ──────────────────────────────────────────
  // Before dispatching a confirmed mutation, fetch the agent-cmd HMAC secret
  // and sign the operation. Approval = { ts, sig } where sig is
  // HMAC-SHA256(secret, "cmd|target|source|ts") matching the server's
  // approval_message() in vulpy-agent-cmd-server.py.
  let hmacSecret = null;

  async function fetchHmacSecret() {
    if (hmacSecret) { return hmacSecret; }
    try {
      const resp = await api("/api/file/agent-hmac-secret");
      hmacSecret = (resp?.key) ? resp.key : resp;
      return hmacSecret;
    } catch {
      return null;
    }
  }

  async function buildApproval(cmd, args) {
    const secret = await fetchHmacSecret();
    if (!secret) { return null; }
    const ts = Math.floor(Date.now() / 1000);
    const target = (args?.target) || "";
    const source = (args?.source) || "";
    const msg = `${cmd}|${target}|${source}|${ts}`;
    try {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" },
        false, ["sign"]
      );
      const rawSig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
      const sig = Array.from(new Uint8Array(rawSig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return { ts, sig };
    } catch {
      return null;
    }
  }

  // ─── Mutation redirect guards ─────────────────────────────────────────
  // Blocks mutations (push/pull) that would overwrite a higher env from a
  // lower one. The server also guards, but the client checks first for fast
  // feedback before calling the agent-cmd bridge.
  //   dev → push staging/live ok, pull staging/live ok
  //   staging → push live ok, pull live ok
  //   live → only logs (blocked by updateButtons, but guard is belt-and-suspenders)
  function guardMutation({ cmd, target, source }) {
    const currentEnv = getCurrentEnv();
    // From live: all mutations blocked
    if (currentEnv === "live") {
      return "Cannot push or pull from the live environment. Switch to dev or staging first.";
    }
    // From staging: can push to live, pull from live. Block pull from dev (upward).
    if (currentEnv === "staging") {
      if (cmd === "env.pull_data" && source === "dev") {
        return "Cannot pull data from dev into staging. Pull from live instead.";
      }
      // push to dev (downward) is also invalid
      if (cmd === "env.push" && target === "dev") {
        return "Cannot push to dev from staging. Use dev → staging for promotion.";
      }
      return null; // push to live, pull from live ok
    }
    // From dev: all pushes/pulls allowed (dev → staging is push, staging/live → dev is pull)
    if (cmd === "env.pull_data" && source === currentEnv) {
      return "Refusing to pull data from the same environment.";
    }
    if (cmd === "env.push" && target === currentEnv) {
      return "Refusing to push to the same environment.";
    }
    return null;
  }

  // ─── Actions ───────────────────────────────────────────────────────────
  async function actionPushStaging() {
    const err = guardMutation({ cmd: "env.push", target: "staging" });
    if (err) { appendLog(`\n[blocked] ${err}\n`, "err"); return; }
    const args = { target: "staging" };
    return runAgentCmd({
      cmd: "env.push",
      args,
      title: `Push to staging — ${getCurrentEnv()}`,
    });
  }

  async function actionPushLive() {
    const err = guardMutation({ cmd: "env.push", target: "live" });
    if (err) { appendLog(`\n[blocked] ${err}\n`, "err"); return; }
    const confirmed = await askConfirm({
      title: "Push to LIVE?",
      message: "This deploys the current branch to the production environment. This cannot be undone.",
      confirmLabel: "Push to Live",
    });
    if (!confirmed) { return; }
    const args = { target: "live", confirm: true };
    const approval = await buildApproval("env.push", args);
    if (approval) { args.approval = approval; }
    runAgentCmd({
      cmd: "env.push",
      args,
      title: "Push to live",
    });
  }

  async function actionPullData(source) {
    const target = getCurrentEnv();
    const err = guardMutation({ cmd: "env.pull_data", target, source });
    if (err) { appendLog(`\n[blocked] ${err}\n`, "err"); return; }
    const confirmed = await askConfirm({
      title: `Pull data from ${source} into ${target}?`,
      message: `This overwrites the ${target} database with a snapshot from ${source}. This cannot be undone.`,
      confirmLabel: `Pull from ${source}`,
    });
    if (!confirmed) { return; }
    const args = { target, source, confirm: true };
    const approval = await buildApproval("env.pull_data", args);
    if (approval) { args.approval = approval; }
    runAgentCmd({
      cmd: "env.pull_data",
      args,
      title: `Pull data ${source} → ${target}`,
    });
  }

  function actionLogs() {
    const env = getCurrentEnv();
    const args = { env, lines: 50 };
    const service = logServiceSelect && logServiceSelect.value !== "all"
      ? logServiceSelect.value
      : null;
    if (service) { args.service = service; }
    return runAgentCmd({
      cmd: "env.logs",
      args,
      title: `Logs — ${env}`,
    });
  }

  // ─── Pull data dropdown ────────────────────────────────────────────────
  function pullSourcesFor(env) {
    // Pull target is the CURRENT env; sources are the upstream envs above it.
    if (env === "dev") { return ["live", "staging"]; }
    if (env === "staging") { return ["live"]; }
    return [];
  }

  function rebuildPullMenu(env) {
    if (!pullMenu) { return; }
    pullMenu.textContent = "";
    const sources = pullSourcesFor(env);
    if (sources.length === 0) {
      pullMenu.appendChild(el("div", { class: "vc-env-actions-pull-empty", text: "No pull sources from live" }));
      return;
    }
    for (const source of sources) {
      const item = el("button", {
        class: "vc-env-actions-pull-option",
        type: "button",
        text: `from ${source}`,
      });
      item.addEventListener("click", () => {
        pullMenu.hidden = true;
        actionPullData(source);
      });
      pullMenu.appendChild(item);
    }
  }

  // ─── Mobile trigger + dropdown ─────────────────────────────────────────
  function isMobileViewport() {
    return typeof window !== "undefined" && window.innerWidth <= 640;
  }

  function applyMobileLayout() {
    const mobile = isMobileViewport();
    if (bar) { bar.hidden = mobile; }
    // Sync button: hidden on desktop (inline bar handles actions),
    // visible on mobile as the trigger for the actions dropdown.
    if (syncBtn) { syncBtn.hidden = !mobile; }
    if (!mobile) { closeMobileMenu(); }
  }

  function toggleMobileMenu() {
    if (!mobileMenu) { return; }
    const willOpen = mobileMenu.hidden;
    mobileMenu.hidden = !willOpen;
    setChevronState(syncBtn, willOpen);
    mobileMenu.setAttribute("aria-hidden", String(!willOpen));
    if (willOpen) {
      // Only one popup at a time — close the desktop pull menu.
      if (pullMenu) { pullMenu.hidden = true; setChevronState(pullBtn, false); }
      rebuildMobilePull(getCurrentEnv());
    } else if (mobilePull) {
      mobilePull.hidden = true;
      setChevronState(mobilePullBtn, false);
    }
  }

  function closeMobileMenu() {
    if (!mobileMenu) { return; }
    mobileMenu.hidden = true;
    setChevronState(syncBtn, false);
    mobileMenu.setAttribute("aria-hidden", "true");
    if (mobilePull) { mobilePull.hidden = true; }
    setChevronState(mobilePullBtn, false);
  }

  function buildMobileMenu() {
    if (!mobileMenu) { return; }
    mobileMenu.textContent = "";
    const closeAnd = (fn) => () => {
      closeMobileMenu();
      fn();
    };

    const pushStaging = el("button", {
      type: "button",
      "data-vc-env-actions": "push-staging",
      text: "Push to Staging",
    });
    pushStaging.addEventListener("click", closeAnd(actionPushStaging));

    const pushLive = el("button", {
      type: "button",
      "data-vc-env-actions": "push-live",
      text: "Push to Live",
    });
    pushLive.addEventListener("click", closeAnd(actionPushLive));

    const pull = el("button", {
      type: "button",
      "data-vc-env-actions": "pull-data",
      "aria-expanded": "false",
    });
    pull.appendChild(el("span", { text: "Pull Data" }));
    pull.appendChild(chevronWrap());
    mobilePullBtn = pull;
    pull.addEventListener("click", () => {
      if (mobilePull) {
        const willOpen = mobilePull.hidden;
        mobilePull.hidden = !willOpen;
        setChevronState(mobilePullBtn, willOpen);
      }
    });

    const logs = el("button", {
      type: "button",
      "data-vc-env-actions": "logs",
      text: "View Logs",
    });
    logs.addEventListener("click", closeAnd(actionLogs));

    mobilePull = el("div", { class: "vc-env-row-mobile-pull" });
    mobilePull.hidden = true;
    rebuildMobilePull(getCurrentEnv());

    mobileMenu.appendChild(pushStaging);
    mobileMenu.appendChild(pushLive);
    mobileMenu.appendChild(pull);
    mobileMenu.appendChild(mobilePull);
    mobileMenu.appendChild(logs);
  }

  function rebuildMobilePull(env) {
    if (!mobilePull) { return; }
    mobilePull.textContent = "";
    for (const source of pullSourcesFor(env)) {
      const item = el("button", {
        type: "button",
        "data-vc-env-actions-pull-source": source,
        text: `from ${source}`,
      });
      item.addEventListener("click", () => {
        closeMobileMenu();
        actionPullData(source);
      });
      mobilePull.appendChild(item);
    }
  }

  // ─── Button visibility per env ─────────────────────────────────────────
  function setButtonsEnabled(enabled) {
    if (!bar) { return; }
    for (const btn of document.querySelectorAll(
      "button[data-vc-env-actions], button[data-vc-env-actions-pull-source], " +
      ".vc-env-sync-btn, .vc-env-row-mobile-menu button, .vc-env-actions-pull-option"
    )) {
      btn.disabled = !enabled;
    }
  }

  function updateButtons(env) {
    if (!built) { return; }
    const safe = VALID_ENVS.indexOf(env) === -1 ? "dev" : env;
    const pushStaging = bar.querySelector('[data-vc-env-actions="push-staging"]');
    const pushLive = bar.querySelector('[data-vc-env-actions="push-live"]');
    const pull = bar.querySelector('[data-vc-env-actions="pull-data"]');
    pushStaging.hidden = safe !== "dev";
    pushLive.hidden = safe !== "staging";
    pull.hidden = safe === "live";
    rebuildPullMenu(safe);
    if (pullMenu && !pullMenu.hidden) { pullMenu.hidden = true; setChevronState(pullBtn, false); }
    if (mobileMenu) {
      const mPushStaging = mobileMenu.querySelector('[data-vc-env-actions="push-staging"]');
      const mPushLive = mobileMenu.querySelector('[data-vc-env-actions="push-live"]');
      const mPull = mobileMenu.querySelector('[data-vc-env-actions="pull-data"]');
      mPushStaging.hidden = safe !== "dev";
      mPushLive.hidden = safe !== "staging";
      mPull.hidden = safe === "live";
      rebuildMobilePull(safe);
      if (mobilePull && !mobilePull.hidden) { mobilePull.hidden = true; setChevronState(mobilePullBtn, false); }
    }
  }

  // ─── Build UI ──────────────────────────────────────────────────────────
  function buildUI() {
    if (built) { return; }
    built = true;

    const env = getCurrentEnv();

    // Titlebar chip container — created by env-context (contract §2.1 / §5.4).
    // Fall back to building one (inserted into header.app-titlebar) so the
    // feature stays functional standalone.
    let container = VulpyCommerce.envBar || document.querySelector(".vc-env-titlebar");
    if (!container) {
      container = el("div", { id: "vc-env-titlebar", class: "vc-env-titlebar", "data-vc-env-bar": "" });
      const host = document.querySelector(".app-titlebar");
      if (host) {
        const anchor = host.querySelector(".app-titlebar-new-chat")
          || host.querySelector(".app-titlebar-spacer");
        if (anchor) { host.insertBefore(container, anchor); }
        else { host.appendChild(container); }
      } else {
        document.body.appendChild(container);
      }
      VulpyCommerce.envBar = container;
    }

    // Action group inside the chip — env-context creates it empty; this
    // feature fills it. `bar` keeps pointing at the group so the existing
    // button-visibility / enable logic works unchanged.
    let actionsGroup = container.querySelector(".vc-env-actions");
    if (!actionsGroup) {
      actionsGroup = el("div", { class: "vc-env-actions", "data-vc-env-actions-bar": "" });
      container.appendChild(actionsGroup);
    }
    bar = actionsGroup;

    const pushStagingBtn = el("button", {
      class: "vc-env-actions-btn vc-env-actions-btn--staging",
      type: "button",
      "data-vc-env-actions": "push-staging",
      text: "Push to Staging",
    });
    pushStagingBtn.addEventListener("click", actionPushStaging);

    const pushLiveBtn = el("button", {
      class: "vc-env-actions-btn vc-env-actions-btn--live",
      type: "button",
      "data-vc-env-actions": "push-live",
      text: "Push to Live",
    });
    pushLiveBtn.addEventListener("click", actionPushLive);

    const pullBtnNode = el("button", {
      class: "vc-env-actions-btn",
      type: "button",
      "data-vc-env-actions": "pull-data",
      "aria-expanded": "false",
    });
    pullBtnNode.appendChild(el("span", { text: "Pull Data" }));
    pullBtnNode.appendChild(chevronWrap());
    pullBtn = pullBtnNode;
    pullBtn.addEventListener("click", () => {
      const willOpen = pullMenu.hidden;
      pullMenu.hidden = !willOpen;
      setChevronState(pullBtn, willOpen);
    });

    const logsBtn = el("button", {
      class: "vc-env-actions-btn",
      type: "button",
      "data-vc-env-actions": "logs",
      text: "View Logs",
    });
    logsBtn.addEventListener("click", () => {
      actionLogs();
    });

    pullMenu = el("div", { class: "vc-env-actions-pull-menu" });
    pullMenu.hidden = true;

    // Pull-data button + its dropdown share a relative wrapper so the menu
    // anchors under the button (contract §2.1).
    const pullWrapper = el("div", { class: "vc-env-actions-pull-wrapper" });
    pullWrapper.appendChild(pullBtn);
    pullWrapper.appendChild(pullMenu);

    bar.appendChild(pushStagingBtn);
    bar.appendChild(pushLiveBtn);
    bar.appendChild(pullWrapper);
    bar.appendChild(logsBtn);

    // Sync button (mobile trigger) — right end of the chip. Always rendered.
    // On desktop: hidden (inline action bar is used). On mobile (≤640px):
    // visible as the toggle for the actions dropdown.
    syncBtn = el("button", {
      class: "vc-env-sync-btn",
      type: "button",
      hidden: true,
      "aria-label": "Environment actions",
      "aria-expanded": "false",
      "aria-controls": "vc-env-actions-mobile-menu",
    });
    // Up/down arrow icons: export/import metaphor
    const syncSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    syncSvg.setAttribute("viewBox", "0 0 20 20");
    syncSvg.setAttribute("width", "16");
    syncSvg.setAttribute("height", "16");
    syncSvg.setAttribute("fill", "none");
    syncSvg.setAttribute("stroke", "currentColor");
    syncSvg.setAttribute("stroke-width", "1.5");
    syncSvg.setAttribute("stroke-linecap", "round");
    syncSvg.setAttribute("stroke-linejoin", "round");
    syncSvg.setAttribute("aria-hidden", "true");
    // Up arrow (export)
    const upPoly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    upPoly.setAttribute("points", "5 14 10 6 15 14");
    syncSvg.appendChild(upPoly);
    // Down arrow (import) — offset below
    const downPoly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    downPoly.setAttribute("points", "5 12 10 18 15 12");
    downPoly.setAttribute("opacity", "0.5");
    syncSvg.appendChild(downPoly);
    syncBtn.appendChild(syncSvg);
    syncBtn.addEventListener("click", toggleMobileMenu);
    container.appendChild(syncBtn);

    // Mobile dropdown — same actions as the inline row (contract §2.5/§3.5).
    mobileMenu = el("div", {
      class: "vc-env-row-mobile-menu",
      id: "vc-env-actions-mobile-menu",
    });
    mobileMenu.hidden = true;
    mobileMenu.setAttribute("aria-hidden", "true");
    buildMobileMenu();
    document.body.appendChild(mobileMenu);

    // Log panel — bottom-right mini terminal view.
    logPanel = el("div", { class: "vc-env-actions-log-panel" });
    logPanel.hidden = true;

    const logHeader = el("div", { class: "vc-env-actions-log-header" });
    logHeader.appendChild(el("span", { class: "vc-env-actions-log-title", text: "Agent-cmd" }));
    logStatus = el("span", { class: "vc-env-actions-log-status", text: "idle" });
    logHeader.appendChild(logStatus);
    const closeBtn = el("button", {
      class: "vc-env-actions-log-close",
      type: "button",
      "aria-label": "Close log panel",
      text: "\u00d7",
    });
    closeBtn.addEventListener("click", closeLogPanel);
    logHeader.appendChild(closeBtn);

    logOutput = el("pre", { class: "vc-env-actions-log-output" });

    const logFooter = el("div", { class: "vc-env-actions-log-footer" });
    logFooter.appendChild(el("label", { class: "vc-env-actions-log-label", text: "service" }));
    logServiceSelect = el("select", { class: "vc-env-actions-log-service" });
    for (const [value, label] of [["all", "all"], ["storefront", "storefront"], ["medusa", "medusa"]]) {
      logServiceSelect.appendChild(el("option", { value, text: label }));
    }
    logServiceSelect.addEventListener("change", () => {
      if (activeRun) { return; }
      actionLogs();
    });
    logFooter.appendChild(logServiceSelect);

    logPanel.appendChild(logHeader);
    logPanel.appendChild(logOutput);
    logPanel.appendChild(logFooter);
    document.body.appendChild(logPanel);

    // Confirm modal.
    modal = el("div", { class: "vc-env-actions-modal" });
    modal.hidden = true;
    const modalCard = el("div", { class: "vc-env-actions-modal-card", role: "dialog", "aria-modal": "true" });
    modalCard.appendChild(el("h3", { class: "vc-env-actions-modal-title", text: "Confirm" }));
    modalCard.appendChild(el("p", { class: "vc-env-actions-modal-message", text: "" }));
    const modalActions = el("div", { class: "vc-env-actions-modal-actions" });
    const cancelBtn = el("button", {
      class: "vc-env-actions-modal-cancel",
      type: "button",
      text: "Cancel",
    });
    cancelBtn.addEventListener("click", () => resolveModal(false));
    const confirmBtn = el("button", {
      class: "vc-env-actions-modal-confirm",
      type: "button",
      "data-vc-env-actions-confirm": "",
      text: "Continue",
    });
    confirmBtn.addEventListener("click", () => resolveModal(true));
    modalActions.appendChild(cancelBtn);
    modalActions.appendChild(confirmBtn);
    modalCard.appendChild(modalActions);
    modal.appendChild(modalCard);
    document.body.appendChild(modal);

    // ESC closes modal / mobile menu / pull menu / log panel.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (modal && !modal.hidden) { resolveModal(false); return; }
        if (mobileMenu && !mobileMenu.hidden) { closeMobileMenu(); return; }
        if (pullMenu && !pullMenu.hidden) { pullMenu.hidden = true; setChevronState(pullBtn, false); return; }
        if (logPanel && !logPanel.hidden) { closeLogPanel(); }
      }
    });

    // Click outside pull menu / mobile menu closes them. NOTE: use
    // contains() on the toggle, not target equality — real mouse clicks land
    // on the SVG chevron child inside the button, so `target !== btn` would
    // close the menu on its own toggle click.
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (mobileMenu && !mobileMenu.hidden && !mobileMenu.contains(target) &&
          ! (syncBtn?.contains(target))) {
        closeMobileMenu();
      }
      if (pullMenu && !pullMenu.hidden && !pullMenu.contains(target) &&
          !(pullBtn?.contains(target))) {
        pullMenu.hidden = true;
        setChevronState(pullBtn, false);
      }
    });

    // Mobile layout responds to viewport changes (≤640px breakpoint).
    window.addEventListener("resize", () => {
      applyMobileLayout();
    });

    updateButtons(env);
    applyMobileLayout();
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────
  VulpyCommerce.on("session:loaded", () => {
    updateButtons(getCurrentEnv());
  });

  window.addEventListener("vulpy-env-changed", (e) => {
    const env = e?.detail?.env ? e.detail.env : getCurrentEnv();
    updateButtons(env);
  });

  document.addEventListener("DOMContentLoaded", () => {
    buildUI();
  });

  if (document.readyState !== "loading") {
    buildUI();
  }
})();

---
name: building-resilient-agent-interfaces
description: Build or replace streaming AI chat interfaces without coupling UI rendering to a fragile network connection; use for SSE/WebSocket agent surfaces, reconnection, run replay, and framework integrations.
version: 1.6.0
author: Fox
---

# Building Resilient Agent Interfaces

## Use when

Use this skill when designing, investigating, or replacing an agent chat UI that streams text, reasoning, tool calls, or lifecycle status — especially if users report that a job “kept working but never got back,” blank live turns after reload, duplicate replay rows, or stuck working indicators.

## Core principle

**Execution, delivery, and rendering are separate systems.**

A dropped SSE/WebSocket/fetch stream does not prove the agent stopped. Never choose a UI framework or replace a renderer until the run lifecycle and recovery contract are verified.

## Required architecture

```text
Agent worker (durable run_id)
  → persisted event journal / replay cursor
  → stream transport (SSE/WebSocket is only delivery)
  → framework-neutral RunClient state machine
  → UI component library / renderer

Canonical persisted session/result is final authority.
```

### Source-of-truth rules

1. The server owns the active-run record and final session/result.
2. The journal owns in-progress recovery; persist a cursor per `(session_id, run_id)` after every accepted event.
3. The stream is not durable state. After any transport failure: **status → replay → canonical session reconciliation**.
4. A terminal UI state may only be declared after canonical state confirms the run is inactive or terminal.
5. Deduplicate replay by durable event id/sequence; a hash is a fallback only.
6. Reattach to an `active_run_id` on session load/reload. Do not make the user re-send or manually recover it.

## Investigation sequence

1. Identify the durable run id and determine whether workers survive a client disconnect.
2. List all emitted event types and terminal states; document their payload contract.
3. Locate event durability: journal, queue, database record, or none.
4. Trace disconnect paths: browser `error`, hidden-tab throttling, reload, server close, proxy timeout, session switch.
5. Verify the recovery sequence with a red-capable test: disconnect during an active run, let it complete, then reattach/reload and assert the final canonical answer appears exactly once.
6. Only then select a UI library and map the normalized event timeline into its components.

## External event injection into an existing chat

When an embedded preview, webhook, IDE pane, or background service must trigger agent work and report into the originating conversation, separate four identities:

1. external event/job ID;
2. authenticated preview or source binding;
3. agent run/session ID;
4. host-WebUI conversation and live client connection.

Never trust a browser-supplied raw session ID. Resolve an opaque, short-lived binding server-side and enforce one active writer per agent session.

A run API's `session_id` provides execution correlation and persistence; it does **not** prove an already-open WebUI will render an independently submitted run. Exact same-chat delivery requires the originating UI backend or a supported UI extension to own/relay the normal chat request. Otherwise render an adjacent progress surface and reconcile from canonical session history—never patch the session database directly.

To avoid a second browser SSE connection, let a trusted broker poll/replay run status and forward it over the application's existing channel, or have the host UI initiate the normal session stream. Do not attach a second client to an internal session WebSocket unless the protocol explicitly guarantees broadcast semantics; a resume operation may transfer transport ownership.

See `references/hermes-external-event-bridge.md` for the verified Hermes API/webhook/cron/plugin boundaries, broker contract, and a Fox workspace example.

For incremental migrations of a mature renderer, use a **strangler facade**: RunClient privately creates the native transport and exposes an EventSource-like listener surface after parsing, validation, dedupe, and generation checks. The existing renderer remains the sole projection/store consumer. Keep transport-only `close()` distinct from ownership-destroying `dispose()`, and avoid a double-open race when `send()` and later renderer attachment both want to create the source. See `references/run-client-migration-pattern.md` for the migration sequence, deterministic Node harness, compatibility-test guidance, and verification matrix.

## Framework decision rule

Pick a mature UI library for its component/runtime value, not merely its message bubbles.

- If a library supplies a capable agent runtime, tool/reasoning primitives, and a custom transport adapter, use it behind the framework-neutral RunClient.
- If it provides presentation components only, it is not the recovery solution; budget to own the run client.
- Do not force a framework solely because it is convenient if doing so means rebuilding all streaming/recovery behavior from scratch.
- Keep the run client independent from React/Vue/Svelte so the UI can change without rewriting correctness.

**`@assistant-ui/react` external-store pattern — proven integration shape (2026-08-10):**

When the host already owns a polling snapshot/subscription store (e.g. `window.HermesTranscriptStore`), the correct pattern is `useExternalStoreRuntime` — not a custom SSE adapter. The store becomes the sole transport bridge; the React island is a pure subscriber.

```tsx
// Renderer component
const runtime = useExternalStoreRuntime<ExternalMsg>({
  messages,
  isRunning: snapshot.isRunning,
  convertMessage: (m) => m,
  onNew: async () => undefined,
  setMessages: () => undefined,
});
return (
  <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root>
      <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>
);
```

Tool lifecycle metadata: embed `__hermes: { status }` inside the tool-call `args` object — `ToolPart` reads `args.__hermes.status` to render lifecycle labels without adding custom props outside the assistant-ui type system. For `malformed` state, also set `__hermes.malformed: true`.

Activity grouping: use `MessagePrimitive.Unstable_PartsGrouped` with a `groupingFunction` that returns `{ groupKey, indices }[]`. Consecutive reasoning + tool-call parts share a key; text parts get `groupKey: undefined`. The `<ActivityGroup>` renders a `<details>` (collapsed by default) with a summary counting running/approval/attention items.

See `vulpy-webui-extension-development` → `references/assistant-ui-island-architecture.md` for the full proven file layout, component source, test patterns, and deployment verification checklist.

## Minimal RunClient state machine

```ts
type RunPhase =
  | "idle" | "starting" | "streaming" | "reconnecting"
  | "replaying" | "settling" | "complete" | "cancelled" | "failed";
```

On event transport error:

```text
close failed transport
→ query run status
→ if active/replayable: reconnect using durable cursor
→ otherwise fetch canonical session/result
→ settle only when server confirms terminal state
```

Hidden-tab logic may affect retry timing but **must not change correctness**. Browser suspension can delay timers; on `pageshow` / `visibilitychange`, immediately run status/replay/reconcile.

## Executable transport-contract gate

Before implementing or extracting a `RunClient`, define the protocol as renderer-independent executable fixtures. Audit the exact upstream revision and extend the repository's normative transport RFC rather than creating a parallel spec. Work vertically: add one focused assertion, capture the intended semantic RED, add only that fixture/RFC delta, and rerun the same assertion to GREEN before taking the next gap.

At minimum, pin these decisions:

- **Cursor interval:** replay after an accepted cursor is exclusive, `(cursor, latest]`; event IDs remain opaque to clients.
- **Acceptance boundary:** advance the durable cursor only after accepting an event. Malformed JSON or an invalid known payload does not advance. A structurally valid unknown future event should be counted, ignored, and advance the cursor so reconnect cannot replay it forever.
- **Status meaning:** status and journal terminal fields are recovery hints, not canonical transcript truth. A status request failure is transport uncertainty, never terminal proof.
- **Settlement fence:** distinguish a finalized-content event from the relay-close fence. If post-finalization metadata can follow, do not settle on the content event; close transport, fetch canonical state, replace once, then clear ownership.
- **Single owner:** one framework-neutral client owns the stream plus send/cancel/approval/clarification. Renderers and extensions invoke that owner and never call transport/control endpoints directly. Generation-guard every callback.

A setup/import/tooling failure is not valid RED evidence. Repair prerequisites and rerun unchanged until the test fails because the contract case or behavior is missing. Preserve exact RED and GREEN commands/results for an auditable handoff. If the broad suite later fails outside the touched surface, reproduce that failure in isolation and report it separately rather than weakening the focused GREEN or changing unrelated code.

See `references/resumable-chat-contract-audit.md` for a concrete Hermes WebUI source map, fixture shape, and handoff checklist.

## Corrective planning for a public message-renderer extension

When correcting an architecture plan that drifted into adjacent domain features, rewrite it from the product boundary outward instead of preserving the old decomposition. Before any public repository, public issue, or implementation delegation, lock the artifact, core/extension boundary, explicit exclusions, proposed identity, and delivery/rollback posture. Treat a correction to the product noun as a stop signal: re-lock scope before further side effects.

1. Audit authoritative repositories, exact revisions, extension docs, current source, gallery schema, and referenced issue bodies before assigning dependencies.
2. Separate **current public API** from a **required upstream host seam**. If the host lacks sanctioned renderer registration, immutable projections, atomic owner selection, and deterministic disposal, mark that as a blocker; do not normalize a DOM takeover into production architecture.
3. Keep core as sole owner of transport, replay, canonical settlement, controls, and projection. A replacement extension owns pixels and renderer-local ephemeral state only.
4. Give issues distinct roles: contract prerequisite, core owner implementation, browser recovery prerequisite, rendering-library decision gate, production delivery/cutover, and parent coordination.
5. Make library selection a measured go/no-go spike. Preserve the host/projection contract if the candidate library fails.
6. Cover gallery manifest/build validation and deployment packaging separately: immutable revision, artifact size/hash, extracted-file hashes, default enablement, persisted disable precedence, and compatible host+extension rollback tuples.
7. Run a wrong-scope vocabulary scan and structural section check. If the plan is untracked, `git diff --check` does not inspect it; additionally run `git diff --no-index --check /dev/null <plan>` and interpret exit 1 with no diagnostic output as “content differs, no whitespace errors.”
8. Report the changed path, checks, and concise dependency verdict. Do not offer implementation when the user requested planning only.

See `references/public-message-renderer-extension-plan.md` for the current Hermes WebUI/gallery API facts, scope checklist, and verification recipe. See `references/scope-correction-and-delegated-gates.md` for pre-side-effect scope locking, stale subagent quarantine, GitHub issue rebaselining, and controller acceptance gates.

## Tests that are mandatory before cutover

- Active run + SSE disconnect + worker completion + reattach: final answer is visible once.
- Active replay/live overlap: reconnect while the worker is still active, replay an interval overlapping accepted IDs, then deliver a new live event; assert duplicate replay has no projection effect, the gap/live event is retained, and one owner remains until settlement.
- Reload during quiet tool/background work: client discovers active run and reattaches.
- Replay contains duplicate event: no duplicate text/tool/reasoning row.
- Completion races session persistence: client waits/retries rather than marking interrupted.
- Explicit cancellation: partial state and terminal marker reconcile correctly.
- Session navigation away/back: no second stream owner and no lost active run.
- Hidden page / BFCache restoration: reconcile immediately on resume.

## RED-evidence discipline

A requested RED is evidence, not a predetermined exit code. Before finalizing a regression:

1. Run the narrow acceptance assertion against the exact baseline first.
2. Use a control scenario to prove the browser/server harness itself is healthy.
3. If the acceptance already passes, report that truth. Do **not** manufacture RED by adding an unrelated assertion, forcing a test-only fault, or relabeling a broader failure as the requested bug.
4. A deliberate fault injection (“test bite”) is useful only to prove harness sensitivity; label it as such and never present it as an upstream behavioral RED.
5. If a broader recovery invariant fails—such as preserved tool/reasoning activity while final prose recovers—report both results separately: the narrow criterion is green, the adjacent invariant is red.
6. When GREEN depends on a not-yet-defined client API, avoid guessing module paths or browser globals merely to obtain a missing-symbol failure. Record the dependency as a blocker until its public contract exists.

For browser lifecycle tests, distinguish three events that are often conflated:

- `EventSource.close()` deterministically detaches transport but does not fire `onerror`.
- A real network interruption exercises error/backoff logic.
- `pageshow`, focus, or visibility resume exercises lifecycle reconciliation even when no transport error callback fired.

Choose the trigger that matches the acceptance criterion and state it in the evidence.

## Adversarial review gate for RunClient migrations

Do not infer architectural ownership from a class name or from moving native transport construction behind a facade. Trace the **production** path, not only unit tests:

1. Enumerate the server's authoritative emitted wire-event names and compare them mechanically with the client's known-event set and every renderer listener. Alias drift can silently classify current events as unknown, advance the cursor, and suppress their handlers.
2. Exercise events through the exact production facade options. If payload validators are optional or supplied only by tests, the claim “invalid known events do not advance the cursor” is unproved and usually false in production.
3. For each control promise cache (cancel, approval, clarify), distinguish in-flight dedupe from permanent memoization. Delete failed or rejected entries so a transient network failure remains retryable; test sequential prompts that lack durable IDs as well as duplicate clicks.
4. Audit `close()` versus `dispose()` at every terminal path. A transport-only close must not be reported as clearing run ownership. Per-run clients must unregister lifecycle listeners and release owners, especially for ephemeral/background streams.
5. Verify whether status probing, replay-URL construction, cursor persistence, canonical reconciliation, and terminal settlement actually moved into the client. If production sets `autoSettle: false` and keeps these decisions in the renderer, describe the result honestly as a transport-construction facade, not a sole lifecycle owner.
6. Add adversarial probes that the happy-path suite cannot absorb: every authoritative wire event dispatches once; malformed known payloads use production defaults; reject-then-retry performs a second request; terminal settlement leaves no owner; repeated ephemeral runs leave no lifecycle listeners or resume traffic.

Static source-presence tests are insufficient for these claims. Use a deterministic fake EventSource/fetch harness to emit real wire names and inspect dispatch, cursor, ownership, request count, and listener cleanup. Keep acceptance/dedupe at the native-event boundary and listener fan-out after acceptance; otherwise the first renderer callback can suppress later cursor or settlement callbacks for the same event ID. Test at least two listeners for one accepted event and verify both receive it once.

Audit production configuration parity explicitly. Re-run core invariants with the exact constructor options used by the shipped renderer, including explicit stream URLs, `autoSettle` switches, lifecycle callbacks, and default validators. A standalone unit configuration is not proof when production disables settlement, supplies no validators, or bypasses cursor URL construction. Browser gates must assert the RunClient owner snapshot is released in addition to checking renderer state such as `busy=false`.

When reviewing TDD evidence, classify tests as behavioral production tests, isolated units, static/source assertions, contract-fixture assertions, or mock self-tests. A fixture that was green before implementation specifies a decision but proves no implementation. Likewise, a batch RED caused by `MODULE_NOT_FOUND` proves only the missing module prerequisite; it does not certify each claimed vertical behavior. After the module loads, require a semantic RED for each slice before its fix. Preserve broad-suite failure logs before running focused tests because a later passing run may clear the test runner's last-failure cache.

## Extension activation when upstream host-seam is missing

When an extension is fully built but the upstream WebUI lacks the host-seam call site,
use this two-track strategy in parallel:

**Track A — Local dogfood patch** (immediate, temporary):
1. Copy `static/message-renderer.js` into `/app/hermes-webui/static/`.
2. Add `<script src="message-renderer.js"></script>` before `</body>` in `index.html`.
3. Patch `_wireSSE` inside `messages.js` at the line after `LIVE_STREAMS[activeSid]={streamId,source};`.
4. Verify with `node --check messages.js`; reload the browser.
5. **Caveat:** `/app/hermes-webui/` is a baked image layer — overwritten on next `docker pull`.

**Track B — Upstream PR** (durable):
1. Use a registration API (`window.registerHermesRenderer`) rather than checking for a specific global, so the seam is generic.
2. Keep the host-seam patch zero Vulpy-specific code; the renderer's `canActivate` handles the Vulpy side.
3. If repo access is unavailable, produce a unified diff against the baked `/app/hermes-webui/static/` files — it documents the exact changes needed and can be submitted directly.
4. Branch name: `feat/message-renderer-host-seam`; target: the pinned SHA.

Dispatch both tracks as parallel subagents — they are independent once the integration point (`_wireSSE` line, adapter shape, projection contract) is known.

## Deleting large node_modules from spike directories

Calling `rm -rf spike/node_modules` inside an `execute_code` script times out (300 s wall clock) on directories with hundreds of packages because the loop iterates inside a single shell call with no output.

**Safe pattern — delete depth-1 entries first, then the directory:**

```python
terminal("find /path/to/spike/node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null; echo done", timeout=120)
terminal("rmdir /path/to/spike/node_modules && echo done")
```

Each `find` batch removes one package tree at a time and exits promptly; the subsequent `rmdir` is instant. Do **not** loop `rm -rf` calls inside `execute_code` — it holds the tool-call budget open for the full timeout.

## Tool-call budget for evaluation spikes

Multi-gate GO/NO-GO spikes (build + test + CSP scan + dep audit + scorecard write + cleanup) routinely exhaust a session's tool-call limit if phases are not planned upfront.

**Budget rule:** Before starting a multi-gate spike, enumerate all deliverable-writing and cleanup steps and reserve calls for them. They are the last batch but must be budgeted first. A spike that finishes measurement but runs out before writing the scorecard and deleting throwaway code is incomplete.

Cost items to plan around:
- Each `npm install` + build + test cycle: ~5–8 calls.
- Iterative jsdom mock discovery adds ~3 calls per missing browser API. Front-load all required mocks — ResizeObserver, MutationObserver, IntersectionObserver — in a single block before the first `act()` call.
- Scorecard write + evidence copy + spike source deletion: ~3–5 calls; reserve before the final gate.

**Recovery rule:** If the limit is hit before writing deliverables, report all measured numbers in-text in the final assistant turn so a follow-up session can reconstruct them without re-running the spike.

## Cross-issue harness pitfall — always pin imports to the accepted revision

When a test suite (e.g. `issue-77`) imports a module produced by a prior issue (e.g.
`run_client.js` from `issue-74`), **point the import at the latest accepted version**,
not the founding-issue baseline. Preceding issues often contain bug fixes that are
required for later scenarios.

Diagnostic signals that you have the wrong version:
- A test *identical* to a passing test in the prior suite fails with a subtle assertion
  mismatch (e.g. `true !== false` on `snapshot().owned`).
- The test takes ~3 s instead of <100 ms — a retry timer is firing because the upstream
  fix is absent.

```python
# Wrong — issue-74 lacks the projectionReplaced guard
RUN_CLIENT = ROOT.parents[2] / "issue-74" / "static" / "run_client.js"
# Correct — issue-75 has the throw-fallback fix
RUN_CLIENT = ROOT.parents[2] / "issue-75" / "static" / "run_client.js"
```

See `references/message-renderer-extension-delivery.md` for the exact `_settle` /
`projectionReplaced` diff, gallery entry schema, packaging pin shape, and bundle metrics.

## Paint-first settle on stream completion

The live DOM is the correct final state after a successful stream. **Do not call `renderMessages()` (or equivalent) in the `done` handler** — it wipes `innerHTML`, scans all messages O(n), snapshots/restores scroll position, and blocks the browser paint for hundreds of milliseconds.

### What to do on `done` (synchronous, must not block paint)

1. `syncTopbar()` — update the status bar
2. `clearLiveToolCards()` — remove live tool indicators
3. `finalizeThinkingCard()` — close the thinking/reasoning card
4. `scrollToBottom()` — if the user is pinned to the tail

That's it. The browser paints the final answer on the next frame.

### What to defer to `setTimeout(0)` (non-essential UI)

- `loadDir('.')` — walks the entire workspace file tree
- `renderSessionList()` — rebuilds the session sidebar
- `playNotificationSound()` — audio feedback
- `noteWorkspaceMutationsFromToolCalls()` — file mutation scan
- `sendBrowserNotification()` — browser notification (natively async anyway)
- `autoReadLastAssistant()` — TTS readback

### What to skip entirely

- `renderMessages()` — full DOM wipe+rebuild; the stream already rendered the correct state
- `_renderMessagesWithScrollSnapshot()` — second `renderMessages()` call for scroll-snapshot; the first render was already unnecessary

### Why this matters

The `done` handler in `attachLiveStream` runs as a synchronous closure on the main thread. Every `renderMessages()` call:

1. Sets `inner.innerHTML = ''` — detaches the live DOM
2. Iterates all `S.messages` to rebuild HTML
3. Captures and restores scroll position
4. Runs `_rehydrateTransparentStreamDom` — another O(n) pass
5. Three `renderMessages()` calls means **three full DOM rebuilds** in a single event-loop tick

The browser cannot paint until all of this completes. With a large transcript (100+ messages, tool cards, reasoning), this takes 500ms–2s where the user sees a blank or frozen screen.

### Applying the fix to baked image files

When the streaming UI is baked into a container image (e.g. `/app/hermes-webui/static/messages.js`), the `done` handler patch must be applied on every container start via the entrypoint. Use `sed` to replace the `renderMessages()` block with the paint-first settle:

```sh
# Replace the block from syncTopbar;renderMessages through autoReadLastAssistant
# with a paint-first settle that defers non-essential work.
sed -i '/^          syncTopbar();renderMessages({preserveScroll:true});$/,/^          if(typeof autoReadLastAssistant=='\''function'\'') setTimeout(()=>autoReadLastAssistant(), 300);$/c\
          if(typeof _armKeepSettledWorklogOpen=='\''function'\'') _armKeepSettledWorklogOpen(_settledStreamId);\
          syncTopbar();clearLiveToolCards();\
          if(typeof finalizeThinkingCard=='\''function'\'') finalizeThinkingCard();\
          if(typeof _disarmKeepSettledWorklogOpen=='\''function'\'') _disarmKeepSettledWorklogOpen();\
          if(shouldFollowOnDone&&typeof scrollToBottom=='\''function'\'') scrollToBottom();\
          setTimeout(function(){\
            if(typeof noteWorkspaceMutationsFromToolCalls=='\''function'\'') noteWorkspaceMutationsFromToolCalls(S.toolCalls);\
            loadDir('\''.'\'', { preservePreview: true });\
            if(typeof autoReadLastAssistant=='\''function'\'') autoReadLastAssistant();\
          }, 0);' /app/hermes-webui/static/messages.js

# Also defer renderSessionList + playNotificationSound
sed -i '/^        renderSessionList();$/,/^        playNotificationSound();$/c\
        setTimeout(function(){\
          renderSessionList();\
          _setActivePaneIdleIfOwner();\
          playNotificationSound();\
        }, 0);' /app/hermes-webui/static/messages.js
```

The entrypoint script is bind-mounted from the host, so the patch survives container rebuilds. The `sed` is idempotent — on a fresh image it matches the upstream patterns; on a restarted container with the patch already applied it's a no-op.

## Pitfalls

- **Cross-repo PRs require fork → fork-push → `--head fork:branch`.** Direct `git push` to an upstream repo you don't have write access to returns 403. Correct flow: `gh repo fork <upstream> --clone=false` → `git remote set-url origin "https://$(gh auth token)@github.com/<fork-user>/<repo>.git"` → push to fork → `gh pr create --repo <upstream> --head <fork-user>:<branch> --base master`. Omitting `<fork-user>:` from `--head` causes "branch not found". See `references/hermes-webui-host-seam-pr.md` § "Cross-repo PR flow".
- **Parallel subagents writing to shared paths will silently overwrite each other.** After both return, run a syntax check on every shared file and grep for both integration patterns. Give each subagent an explicit, non-overlapping working directory in the task context. See `references/hermes-webui-host-seam-pr.md` § "Parallel subagent file-collision pitfall".
- **Renderer artifact done ≠ renderer active.** A self-contained extension script with a complete API (`mount`, `unmount`, `canActivate`) does nothing until a host-seam call site in the WebUI calls `mount()`. Always identify this call site before claiming the renderer is "usable." In Hermes WebUI, the call site is inside `_wireSSE` at `messages.js:4894` (local `/app/hermes-webui`) / `messages.js:5441` (upstream clone at SHA `320789ae`), which is an inner function inside `attachLiveStream` — it is not a top-level export and cannot be patched independently of the enclosing function. See `references/message-renderer-extension-delivery.md` § "Host-seam anatomy" for exact line numbers and the minimal adapter pattern. See `references/hermes-webui-host-seam-pr.md` for the completed upstream PR (Track B), branch `feat/message-renderer-host-seam`, commit `6b44bbc`.
- **DOM toggle should be owned by the extension panel, not `localStorage`/`canActivate`.** The instinct to add a `localStorage.getItem('hermes_renderer_disabled')` guard in `canActivate()` is wrong — it creates an invisible toggle that bypasses the UI. The correct approach is to register the renderer as a manifest-declared extension so it appears in **Settings → Extensions** with a native Enable/Disable toggle. The `localStorage` hack also goes stale on `docker pull` restarts (it's a browser-side flag, not the server's enable state). Use `canActivate` only for capability checks against `hostCaps.capabilities`; let the extension system's enable/disabled state control loading entirely. See `references/hermes-webui-extension-system.md` for the manifest format, env var, and Vulpy wiring.

- **Hardwiring a `<script>` tag in `index.html` bypasses the extension panel.** Loading the renderer via `<script src="static/message-renderer.js"></script>` directly in `index.html` means the user has no UI toggle and the script always loads — even after the user disables it in the panel. The correct approach: declare the script in the manifest only (`"scripts": ["/static/message-renderer.js"]`), set `HERMES_WEBUI_EXTENSION_MANIFEST`, and remove the inline tag. The server injects the script only when the extension is enabled.

- **Call site active ≠ DOM replaced.** Even with the host-seam wired (`canActivate` returns true, `mount()` is called on every stream), the renderer may be a **data-projection engine only** — writing projected part descriptors into `root._rendered` without touching `innerHTML`. The native `renderMessages()` in `ui.js` continues to own `#msgInner.innerHTML` and will overwrite any DOM the renderer produces. Visual replacement requires three concrete patches:

  **1. `mount()` — create overlay and claim ownership flag:**
  ```js
  if (!root._hermesRendererOverlay && root.id === 'msgInner') {
    var overlay = document.createElement('div');
    overlay.id = 'hermesRendererOverlay';
    overlay.style.cssText = 'width:100%;';
    root.innerHTML = '';
    root.appendChild(overlay);
    root._hermesRendererOverlay = overlay;
    root._hermesRendererActive = true;  // guard flag read by renderMessages()
  }
  ```
  Important: `root` IS `#msgInner` (messages.js passes `document.getElementById('msgInner')` directly). Do NOT look up `document.getElementById('msgInner')` again inside `mount()` — use `root` directly and check `root.id === 'msgInner'` as a safety assertion.

  **2. `handleUpdate()` — write HTML into overlay on every SSE event:**
  ```js
  if (root._hermesRendererOverlay) {
    root._hermesRendererOverlay.innerHTML = _partsToHtml(root._rendered);
  }
  ```
  Add `_partsToHtml()` as a separate helper that converts the descriptor array to HTML using the WebUI's existing CSS classes (`msg-row`, `msg-body`, `tool-card-row`, `tool-card`, `wl-reason`, etc.) so all skins are inherited without extra CSS.

  **3. `renderMessages()` in `ui.js` — yield guard (add at function entry):**
  ```js
  var _riInner = document.getElementById('msgInner');
  if (_riInner && _riInner._hermesRendererActive) return;
  ```
  Read the flag directly off the DOM element rather than via a `window._hermesRendererRoot` global — the element IS the canonical `root` object that `mount()` wrote to, so no external reference is needed. Place this before `_lastMessageRenderAt = performance.now()`.

  **4. `unmount()` — remove overlay, clear flag (rollback):**
  ```js
  if (root._hermesRendererOverlay) {
    var ov = root._hermesRendererOverlay;
    if (ov.parentNode) ov.parentNode.removeChild(ov);
    root._hermesRendererOverlay = null;
  }
  root._hermesRendererActive = false;
  ```
  Once the flag is cleared, `renderMessages()` resumes ownership on its next call — no restart needed.

  Verify ownership by inspecting `root._rendered` in DevTools after a stream token — if it contains part descriptors but `#msgInner` still shows native markup, the data-only path is confirmed and all four patches above are needed. See `references/dom-ownership-wiring-pattern.md` for the complete annotated diff.
- **`_wireSSE` terminal paths are three, not one.** When placing a renderer `unmount` call in `messages.js`, it must appear at ALL three terminal events: `done` (inside the `_finishDone` closure, after `_streamFadeCleanupReduceMotionListener()`), `apperror` (after `source.close()`), and `cancel` (after `source.close()`). Missing any one means streams that end by cancellation or application error will leak the renderer. The correct pattern: define one `_rendererUnmount()` closure after the mount call, then invoke it at each terminal site.
- **Patch context must be unique and must carry through trailing lines.** When patching large JS files (8000+ lines) with `patch(mode='replace')`, the accidental omission of lines immediately AFTER the insertion point is a real danger. Include the lines immediately after the change in both `old_string` and `new_string`. In this session the `cancel` handler patch dropped `_clearStreamHidden`, `_clearStreamNotificationBackground`, `_clearApprovalForOwner`, and `_clearClarifyForOwner` because `old_string` ended before them but `new_string` did not carry them — requiring a follow-up restore patch.
- **`environments/hermes/.env` vars do NOT reach the running Hermes container.** `docker-compose.hermes.yml` has no `env_file:` stanza — any `HERMES_WEBUI_*` variable set there is silently ignored. To set a WebUI env var durably, add `ENV HERMES_WEBUI_...=...` to `Dockerfile.hermes` and rebuild. Do not diagnose "extension not appearing" without first confirming the var is live: `printenv | grep HERMES_WEBUI`.

- **hermes-webui `.gitignore` blocks new `docs/` subdirectories.** The repo's `.gitignore` uses `docs/*` with only specific named subdirs allowed (`docs/rfcs/**`, `docs/architecture/**`, `docs/ui-ux/**`). Any new `docs/<subdir>/` directory will be silently blocked by `git add` unless you add `!docs/<subdir>/` and `!docs/<subdir>/**` to `.gitignore` in the same commit. Always check this before creating new docs directories.
- **Tool card design — present options + recommendation, execute on approval.** When the live-stream protocol doesn't carry tool output (e.g. Hermes WebUI `/api/chat/stream` `tool_complete` has no `result` field), there are two clean choices: (A) inline status only during streaming, full card after settlement; (B) card during streaming with running/done status, result after settlement. Present both with a recommendation; don't make the choice silently. The user is the ground truth on visual quality — they can observe animation; Fox cannot from screenshots.
- **`useExternalStoreRuntime` has a structural re-render wall for live streaming — the proven fix is a standalone live-turn component outside the store.** Every token event produces a new `liveTurnMsg` object → new `messages` array reference → `ExternalStoreThreadRuntimeCore` notifies ALL subscribers (reference equality check fails) → full component tree re-renders. `segmentPartCache` and `useMemo` stabilize sealed objects but cannot stop the cascade because `currentText` is always a new object and the runtime compares `oldStore.messages === store.messages`. After 3+ patch attempts still showing jumps/re-renders, stop patching and pivot (verified shipped 2026-08-15): render the live turn as a **standalone component outside `useExternalStoreRuntime`**, feeding `liveTurn` state directly. Settled messages keep going through the runtime (they're stable); optimistic sends append to the store tail; the live turn renders after `ThreadPrimitive.Messages` inside the same viewport. Implementation shape:
  ```tsx
  // LiveTurnView — outside the store, fed by liveTurn state directly
  const LiveTextSegment = memo(Comp, (p, n) => p.text === n.text);
  const LiveToolSegment = memo(Comp, (p, n) =>
    p.tool.toolName === n.tool.toolName &&
    p.tool.completed === n.tool.completed &&
    p.tool.isError === n.tool.isError &&
    JSON.stringify(p.tool.args) === JSON.stringify(n.tool.args));
  function LiveTurnView({ turn }) {
    return (
      <div className="hermes-message-assistant hermes-message-row" data-live-turn>
        {turn.segments.map((seg, i) => seg.kind === "text"
          ? <LiveTextSegment key={`t${i}`} text={seg.text} />
          : <LiveToolSegment key={`c${i}`} tool={seg.tool} />)}
        <LiveMarkdown text={turn.currentText} /> {/* only this re-renders per token */}
      </div>
    );
  }
  ```
  Markdown for live segments needs a prop-driven renderer (`ReactMarkdown` with the same plugins) — `MarkdownTextPrimitive` reads part text from assistant-ui context and throws outside the store. While a live turn is active, strip any server-written partial assistant tail from the settled list (keep up to the last user row) so the store never duplicates the live view. **Regression test:** capture the tool card DOM node after `tool_complete`, emit more `token` events, assert the same node reference is still in the DOM — a remount IS the visual jump.
- **Pick the stream channel from the host's adapter mode; the host's own UI wiring is ground truth.** The OpenAI-format channel (`/v1/runs/{runId}/events` on the agent sidecar) only exists in gateway-mode installs. In `legacy-direct` mode (`HERMES_WEBUI_RUNTIME_ADAPTER` unset/default) there is no native run id at all — the chat never touches the gateway API, so "fixing the id" is impossible and the correct channel is the WebUI's own `/api/chat/stream?stream_id=<hex>`. Determine the channel by reading the host UI's own subscription (e.g. `grep "chat/stream" static/messages.js` → `new EventSource("api/chat/stream?stream_id=...", {withCredentials:true})`) and the host's adapter module (default mode). The stream id comes from the host bus event (`hermes:run-started` carries `streamId`) — never from a watchdog/discovery poll. Wire format is named SSE events (`event: token\ndata: {...}`), NOT OpenAI chunk lines. See `references/hermes-webui-stream-channel-facts.md` for the channel comparison, event inventory, and mode verification.
- **`useMemo` is mandatory with `useExternalStoreRuntime`.** A 2s settled-poll `setMessages` call creates a new array reference even when content is identical. Without `useMemo` on `liveTurnMsg`, `displayed`, `settledUserTexts`, `visibleOptimistic`, `optimisticAsThread`, and `displayWithOptimistic`, `useExternalStoreRuntime` re-renders the full transcript on every poll tick. Add `useMemo` to all six derived lists with appropriate dep arrays — this is not optional for smooth UX. See `vulpy-webui-extension-development` → `references/durable-patches-and-wire-format.md` §6.
- **Teardown: collapse `setMessages` + `setLiveTurn(null)` into one React batch.** A 400ms `setTimeout` was an early fix for blank-frame flash at stream end — it worked but still caused two renders: `done` → poll → `setMessages` (render #1) → 400ms → `setLiveTurn(null)` (render #2, full remount). Preferred fix: use a `useRef` flag (`pendingClearLiveTurnRef`) set by `done`/`error` handlers and consumed inside the next poll callback — both setters fire back-to-back in the same async tick → React 18 auto-batches → single render, no intermediate frame, no arbitrary wait. The flag is a `useRef` (not state) so setting it does not trigger a render. See `vulpy-webui-extension-development` → `references/durable-patches-and-wire-format.md` §6b.

- **Consume the pending-clear flag regardless of merge result, gated on the final row being visible.** First version of the teardown fix consumed `pendingClearLiveTurnRef` inside the `setMessages` updater AFTER the stable-reference early return (`if (same) return prev`). For fast runs where the last poll already fetched the final rows, the post-`done` poll returned identical content → early return skipped the consumption → `liveTurn` never cleared → the LIVE (args-only, no-result) tool card stayed on screen forever and the settled card with the folded result never rendered. Operator reported "card shows only the call args" — that was a stuck-live-card bug, not a missing-result bug. Fix: compute `same` but consume the flag regardless of merge result, gated on `finalRowVisible` (the polled list contains an assistant row after the last user row) so it never clears early (blank-flash) when the final row hasn't landed yet. Regression test: stream tool + `tool_complete` + `done` while the settled store already contains the final rows; assert live view gone and settled tool card contains the folded result text.

- **File-only sends duplicate the optimistic bubble — reconcile by attachment name and mimic the native file chips.** The bus `hermes:message-sent` payload carries only display text (e.g. `Uploaded: pasted-text-….md`), but the settled user row stores raw typed text (often EMPTY for file-only sends) plus a separate `attachments` array. Text-match reconciliation can never match → bubble persists → "2 distinct messages instead of one". Fix: (1) snapshot attachment names at bus time from the host's `S.messages` TAIL user row — the host pushes `userMsg={role:'user', content: displayText, attachments: names[]}` into `S.messages` BEFORE emitting `hermes:message-sent` (messages.js:1603-1611). `window.S?.session?.pending_attachments` is EMPTY during send (only used in reconnect paths) — reading it gives no names and the bubble renders without chips. `S` is a top-level `const` in a classic script = a global LEXICAL binding, NOT a `window` property: reference bare `S` with a `typeof S !== "undefined"` guard (and `window.S` fallback for test harnesses), declared via `declare global { const S: ... }` so TSC compiles; (2) render native-style `.msg-files` chips (paperclip badge linking `api/file/raw?session_id=…&path=<basename>`, image thumbnails for image extensions) in both the optimistic bubble and the settled `UserMessageView` — native renderer `_renderAttachmentHtml` in `static/ui.js` is the reference; (3) extend reconcile to drop the bubble when the settled row matches by text OR any attachment name (`oAtt.some(a => mAtt.includes(a))`).

- **Verify the ACTUAL installed package version before trusting type exports — stale pnpm store dirs are traps.** Grepping `node_modules/.pnpm/@assistant-ui+react@*` matched an OLD pnpm dir (0.11.36) that exported `useMessage` from the root — but the installed version was 0.15.13, which does NOT re-export it. TSC failed with "Module has no exported member 'useMessage'". Before writing code against any library symbol: `ls -la node_modules/<pkg>` (symlink target), `node -e "console.log(require.resolve('<pkg>'))"`, and check version in the RESOLVED package.json — never glob results across `node_modules/.pnpm/`. When a hook isn't root-exported, thread the data via props/render-prop from a component that already has it (e.g. `ThreadPrimitive.Messages` render function has `message`) instead of fighting the package boundary.

- **The agent sidecar DB has NO `attachments` column — enrich settled rows from the host's `S.messages` and strip the `[Attached files: …]` marker.** The pane polls `/api/sessions/{sid}/messages` (agent `state.db` `messages` table), which has no `attachments` column — so a file-send's settled row loses its chip even though the WebUI store (`/api/session?messages=1` → session JSON) carries it. Verified 2026-08-15: the SVG thumbnail appeared in the optimistic bubble then vanished on settle. Fix: (1) keep attachment names in a side map keyed by message id (NOT on store message objects — the assistant-ui converter expects `CompleteAttachment[]` and crashes on plain strings); (2) when the API row reports no names, enrich by content-matching against the host's `S.messages` user rows (normalize both sides with `stripAttachedFilesMarker`); (3) the settled content is `text\n\n[Attached files: path]` — strip that marker in the mapper (`replace(/\n\n\[Attached files: [^\]]+\]$/, "")` — native `_stripAttachedFilesMarkerForDisplay` in `ui.js:7297` is the reference) so the settled row displays like the bubble AND its stripped text now matches the bubble's text for reconciliation.
- **Attachment chips render ABOVE the message text in BOTH optimistic and settled user rows — never `inline-flex` beside it.** The optimistic bubble used `display: inline-flex; align-items: center` (image in the right column next to the text) while the settled row stacked — a visible layout jump on settle. Operator: "image is in the right column, but then becomes stacked when replaced (put image above in both cases)". Fix: `display: block` on the optimistic bubble; render `<AttachmentChips/>` BEFORE the text in both `OptimisticMessageView` and `UserMessageView`; `.hermes-msg-files` uses `margin-bottom` (not `margin-top`) since chips lead.
- **Suppress interval polls during active streaming.** The background reconciliation poll
  ```tsx
  const webUiStreamIdRef = useRef<string | null>(null);
  webUiStreamIdRef.current = webUiStreamId; // keep in sync at render time

  // inside the poll effect:
  let isFirstPoll = true;
  const poll = async () => {
    const isThisPollFirst = isFirstPoll;
    isFirstPoll = false;
    const skipMessagesUpdate = !!webUiStreamIdRef.current && !isThisPollFirst;
    // ... fetch ...
    if (!skipMessagesUpdate) {
      setMessages(...);
      // CRITICAL: gate setOptimistic reconciliation in the same block as setMessages.
      // The reconciliation removes optimistic bubbles when the settled user row arrives.
      // If setMessages is skipped but setOptimistic still runs, the bubble is removed
      // before the settled row is written → user message disappears until next poll.
      setOptimistic(...);
    }
    // pendingClearLiveTurnRef check always runs (stream may have just ended)
    if (pendingClearLiveTurnRef.current) { ... setLiveTurn(null); }
  };
  poll(); // first call (isThisPollFirst=true) always writes messages
  timer = setInterval(poll, intervalMs); // subsequent calls suppress during streaming
  ```

  **Critical: `setMessages` and `setOptimistic` reconciliation are a unit.** And `setInitialLoading(false)` must stay OUTSIDE the gate — it signals that the first fetch has completed regardless of whether message state was updated. Gating it inside `if (!skipMessagesUpdate)` leaves `initialLoading = true` permanently on the first interval tick during streaming. When using `skipMessagesUpdate` to suppress interval polls during streaming, the `setOptimistic` reconciliation call that removes optimistic bubbles must be gated by the same condition. If you skip `setMessages` but still run `setOptimistic`, the user's optimistic message bubble disappears the moment the settled user row appears in the fetch response — while the actual settled message has not yet been written to React state. This causes the user message to be hidden until the next un-skipped poll. Always put both calls inside the same `if (!skipMessagesUpdate)` block.

- **Equality check must include `status.type`.** The `setMessages` equality guard that returns `prev` on unchanged content must also compare `m.status?.type`. When `finish_reason` arrives, a message transitions from `status: { type: "running" }` to no status — content JSON is identical, so the old guard returns the stale object and the settled message retains a phantom `running` status. Fix: add `mStatus === nStatus` to the every() check where `mStatus = m.status?.type ?? null`.

- **Never clear messages before a session-switch fetch — keep old content visible until new data lands.** The instinct to call `setMessages([])` immediately when `sessionId` changes causes a blank-flash for the full network round-trip (~1s on local dev, longer on network). The old messages are harmless to keep: when the new session's fetch resolves, replace atomically inside the `setMessages` updater (`if (sessionSwitched) return freshMapped;`). Reset all other pagination/optimistic state immediately (they have no visible DOM effect), but keep `messages` populated. Pattern:
  ```tsx
  let sessionSwitched = false;
  if (sid !== prevSessionIdRef.current) {
    prevSessionIdRef.current = sid;
    sessionSwitched = true;
    // Reset non-visual state immediately
    setTotal(null); setLoadingEarlier(false); setOptimistic([]); setRunError(null); setRunActive(false);
    // DO NOT setMessages([]) here — that causes blank flash
  }
  // ... fetch ...
  setMessages((prev) => {
    if (prevSessionIdRef.current !== fetchedSid) return prev; // raced
    if (sessionSwitched) return freshMapped; // atomic replace, no blank frame
    // normal merge path below
    ...
  });
  ```

- **Deduplicate `hermes:run-completed` vs SSE `done`.** Both the SSE `done` handler and the `hermes:run-completed` bus event call `setRefreshKey(k+1)` independently. Two triggers → two immediate polls → two `setMessages` calls → extra render cycles at completion. Fix: in `hermes:run-completed`, check `webUiStreamIdRef.current` before bumping the refresh key. If the SSE `done` already ran (stream ref is null), skip the redundant bump — the bus event still clears `runActive` and `webUiStreamId` state but doesn't need to re-trigger the poll:
  ```tsx
  sub("hermes:run-completed", () => {
    const alreadyHandled = !webUiStreamIdRef.current;
    setRunActive(false);
    setWebUiStreamId(null);
    if (!alreadyHandled) {
      setRefreshKey((k) => k + 1); // SSE done hasn't fired; need the refresh
    }
  });
  ```
- **Cache stable part objects per sealed segment to prevent full re-renders on every token.** `liveTurnMessage()` is called on every `token` SSE event via `useMemo([liveTurn])`. If it creates new object literals for sealed segments on every call, assistant-ui treats all parts as changed and re-renders the entire message — including completed tool cards and already-rendered text before the tool. Fix: pass a `Map<fingerprint, partObject>` ref into `liveTurnMessage`. Compute a fingerprint for each segment (`text:<content>` for text; `tool:<id>:<completed>:<isError>` for tool calls). Return the cached object for sealed segments; only the streaming `currentText` tail gets a new object each call. Clear the cache at stream-open, not on close — old parts shouldn't bleed into a new run. Pattern:\n  ```tsx\n  type SegmentPartCache = Map<string, Record<string, unknown> & { type: string }>;\n  function segmentFingerprint(seg): string {\n    if (seg.kind === \"text\") return `text:${seg.text}`;\n    const t = seg.tool;\n    return `tool:${t.toolCallId}:${t.completed ? 1 : 0}:${t.isError ? 1 : 0}`;\n  }\n  function liveTurnMessage(turn, cache?) {\n    for (const seg of turn.segments) {\n      const fp = segmentFingerprint(seg);\n      const cached = cache?.get(fp);\n      if (cached) { parts.push(cached); continue; }\n      // ... build part ...\n      cache?.set(fp, part);\n      parts.push(part);\n    }\n    // currentText is always fresh — not cached\n    if (turn.currentText.trim()) parts.push({ type: \"text\", text: turn.currentText });\n  }\n\n  // In HermesThread:\n  const segmentPartCacheRef = useRef<SegmentPartCache>(new Map());\n  // In stream useEffect, before EventSource open:\n  segmentPartCacheRef.current.clear();\n  // In useMemo:\n  const liveTurnMsg = useMemo(\n    () => liveTurn ? liveTurnMessage(liveTurn, segmentPartCacheRef.current) : null,\n    [liveTurn],\n  );\n  ```\n  Without this, the `currentText` growth after a completed tool call causes the tool card to flash/jump on every token because its object identity changes.\n\n- **`LiveToolState.completed` boolean, not a string sentinel.** Using `result: "…"` on the internal state leaks into the renderer as visible text and requires special-case exclusion in `ToolPart`. Use `completed?: boolean` on the internal type; emit `result: ""` only inside `liveTurnMessage()` where the type boundary contains it. Guard `hasResult` as `resultText && resultText !== "\"\""`. See `vulpy-webui-extension-development` → `references/durable-patches-and-wire-format.md` §5.
- **Context compaction can describe a false codebase state — always baseline with `git diff` before writing code.** When a session starts from a compacted summary claiming "we added X / the code now does Y", treat that as unverified. Run `git diff --stat` and `git log --oneline <file>` before writing any code. In this session, the summary claimed the renderer was on a "legacy-direct / `/api/chat/stream`" path; the actual committed code was already on the native runs-events path. Acting on the summary without checking produced a full spurious streaming layer that had to be reverted. The correct flow when resuming from compaction: (1) `git diff --stat` to see what's actually changed; (2) `git show <base>:<file> | grep <key symbol>` to verify the claimed feature is real; only then proceed. If the summary contradicts the diff, trust the diff.
- **A "revert my changes" order can also be a trap — verify what the revert restores before doing it.** When the operator says "use git diff to revert any changes if needed, but careful — there's other work", do NOT blanket `git checkout <base> -- <file>`. Check whether the baseline itself is the broken state that motivated the work in the first place; reverting to a known-broken baseline just moves the bug back (verified 2026-08-15: reverting the streaming pane to commit `089d1da` restored "no subscription and wrong id" + duplicate user rows, and the operator then reported "we're back to square one"). Also check the diff for OTHER work mixed into the same file — revert surgically (selective `git checkout -p` or re-apply only the spurious hunks), and state which baseline you're restoring and why. If the committed baseline predates the feature and the feature is a real fix, say so instead of reverting it.
- Replacing markdown/message rendering alone cannot fix missed completion delivery.
- Never open two stream consumers for one run; they race replay and produce duplicate UI state.
- Do not infer failure from browser `EventSource.onerror`.
- Do not derive final transcript by concatenating token frames; fetch the canonical persisted result.
- Do not make reconnection conditional on the tab being foregrounded.
- Do not retain DOM snapshots as the recovery source of truth.
- Do not call a RED valid when the requested assertion passed and only an adjacent assertion failed.
- Do not confuse a browser lifecycle signal with a hard reload; test and name them separately.

## References

- See `references/hermes-webui-sse-recovery.md` for a concrete Hermes WebUI investigation map and an integration-test recipe.
- See `references/hermes-external-event-bridge.md` for verified Hermes API/webhook/plugin boundaries and broker patterns.
- See `references/hermes-webui-extension-architecture.md` before designing a Hermes browser extension. It disambiguates the official React dashboard from the standalone vanilla-JS WebUI, maps Agent/dashboard/WebUI plugin boundaries, records session/SSE ownership, and gives the React-island decision rule.
- See `references/assistant-ui-external-store-evaluation.md` for the measured GO/NO-GO scorecard for `@assistant-ui/react@0.15.2` as a rendering library (Issue #76): gzip sizes, CSP audit results, jsdom headless test pattern, required browser API mocks, and API surface notes.
- See `references/message-renderer-extension-delivery.md` for the proven gallery entry schema (`extension.json`/`manifest.json`), Vulpy packaging pin shape, `_settle` throw-fallback mechanism, and `hermes-webui-message-renderer` v0.1.0 bundle metrics.
- See `references/hermes-webui-host-seam-pr.md` for the completed upstream PR anatomy: capability manifest pattern, `registerHermesRenderer` IIFE design, `_wireSSE` seam placement, and the `.gitignore` subdirectory allowlist fix.
- See `references/hermes-webui-extension-system.md` for the Hermes WebUI extension manifest format, `HERMES_WEBUI_EXTENSION_DIR`/`HERMES_WEBUI_EXTENSION_MANIFEST` env vars, Vulpy fox-overlay layout, manifest-bundle script injection, and the Enable/Disable panel toggle lifecycle.
- See `references/dom-ownership-wiring-pattern.md` for the complete annotated 4-patch fix when a renderer is wired but not visually active: `_partsToHtml()` helper, `mount()` overlay creation, `handleUpdate()` DOM write, `renderMessages()` yield guard, and `unmount()` cleanup with rollback instructions.
- See `references/hermes-webui-stream-channel-facts.md` for the verified channel decision (WebUI `/api/chat/stream` vs OpenAI `/v1/runs/{id}/events` by adapter mode), event inventory, subscription effect shape, and optimistic bubble placement rules.
- See `references/host-bus-single-subscriber-streaming.md` for the host-bus single-subscriber pattern (host owns ONE EventSource, forwards `hermes:stream-event` on the bus; avoids Chrome 6-connection pool saturation that stalls session switches).

# Hermes external-event bridge for agent UIs

Use this reference when an external browser surface (embedded preview, visual-feedback overlay, IDE pane, webhook source) must trigger Hermes work and show progress/results in the originating chat.

## Verified Hermes surfaces

- API server: `POST /v1/runs`, `GET /v1/runs/{run_id}`, `GET /v1/runs/{run_id}/events`, `POST /v1/runs/{run_id}/stop`, and approval handling.
- Persisted-session turns: `POST /api/sessions/{id}/chat` and `/chat/stream`; the streaming form emits assistant deltas, tool start/completion, and run completion.
- Capability discovery: check `/v1/capabilities` before depending on runs, cancellation, approval, or session endpoints.
- Open WebUI receives visible progress when it owns the normal Chat Completions/Responses request and its SSE stream.
- Webhooks provide authenticated ingress, filtering/transforms, idempotency, and automatic agent runs, but documented delivery targets are messaging/platform targets or logs—not an arbitrary live WebUI conversation.
- Cron `deliver=origin` and continuable delivery refer to saved messaging origins `{platform, chat_id, thread_id}`. They do not mean an HTTP caller, browser tab, Open WebUI chat, or arbitrary Hermes session.
- `ctx.inject_message()` is CLI-only and returns `False` in gateway mode.
- MCP is an agent-to-tool interface, not browser ingress or WebUI delivery.

Authoritative docs:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/user-guide/messaging/open-webui
- https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks
- https://hermes-agent.nousresearch.com/docs/user-guide/features/cron
- https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins
- https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard

## Supportability rule

**Execution APIs do not imply live UI injection.** A background run associated with `session_id` can be persisted and correlated, but an unrelated backend request does not automatically make an already-open frontend render it or update that frontend's own conversation database.

For an exact same-conversation experience, the originating WebUI backend or a supported UI extension must own/relay the normal Hermes chat request. If no such extension point exists, use an adjacent progress panel and reconcile from canonical Hermes session history; do not write directly to `state.db`.

Avoid treating the internal Dashboard/Desktop JSON-RPC WebSocket as a public fan-out bus. A second client that resumes a live session may rebind transport ownership rather than broadcast events. Prefer documented HTTP APIs and one active writer per session.

## Recommended architecture

```text
Embedded preview / external source
  -> trusted event broker
     - validates schema and authorization
     - resolves opaque binding -> user/store/preview/Hermes session
     - durable dedupe + queue + status journal
  -> originating WebUI backend or thin supported UI adapter
  -> Hermes Sessions stream (normal visible turn)
     OR Hermes Runs API (detachable background work)
  -> narrowly scoped native tool or MCP wrapper
  -> controlled worker/process rooted at the allowed workspace
```

### Avoiding a second browser SSE connection

Best path: notify the host UI through its existing application channel, then let its backend issue the normal Hermes session-chat request. Hermes progress returns through the same UI-owned stream.

For detached work, let the trusted broker poll `GET /v1/runs/{run_id}` and forward status over the application's existing channel. Persist events/status in the broker because Hermes retains terminal run status only briefly. Browser transport remains delivery, not authority.

## Correlation contract

Persist a server-side binding when the preview opens:

- opaque `binding_id`
- authenticated user/tenant
- store and preview-instance IDs
- allowed workspace root
- host-WebUI conversation ID
- Hermes `session_id` or external correlation ID
- source revision and expiry

Never accept a raw browser-supplied Hermes session ID as authorization. The browser presents only a short-lived binding token; the broker resolves and authorizes the session server-side.

## Event and run state

Use durable event IDs and revision-aware state:

```text
received -> validated -> queued -> running
                                -> awaiting_approval -> succeeded
                                -> failed
                                -> cancelling -> cancelled
succeeded -> accepted | discarding -> discarded
```

- Generate submits work.
- Discard while active calls run stop and terminates the child process group.
- Discard after completion reverts only that job's checkpoint/patch.
- Accept/discard must compare the current source revision to prevent stale actions.
- Serialize writes per checkout. If many stores share one worktree, use a global writer lock; parallelize only across isolated worktrees.

## Security checklist

- Keep Hermes API keys and webhook secrets out of browser code.
- Validate event type, sizes, selectors, URL/path allowlists, sequence, timestamp, and revision.
- Authenticate preview-to-session bindings; Origin/CORS alone is not authorization.
- Treat every business field as prompt-injection-capable even after HMAC verification.
- Restrict the tool interface: hardcode cwd/workspace, allowlisted operations, bounded flags/env/output/time.
- Resolve real paths and reject symlink escapes.
- Use durable broker idempotency; transient API/webhook caches are not workflow state.
- Propagate cancellation: broker -> Hermes run stop -> child SIGTERM -> bounded SIGKILL.
- Reconcile final UI state from canonical persisted session/result.

## Current Fox-in-the-Box deployment clue

In Vulpy's Hermes/Fox deployment, `docker-compose.hermes.yml` maps `:8787`, mounts the repo at `/app/workspace`, and derives from `ghcr.io/fox-in-the-box-ai/cloud:stable`. Do not assume this `:8787` UI is the documented Hermes Dashboard (`:9119`), API server (`:8642`), or webhook adapter (`:8644`). Verify the actual host UI's public extension/session API before promising same-tab write-back.

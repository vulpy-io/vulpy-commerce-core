---
name: figma-design-extraction
description: >
  Pull design data from a Figma file programmatically — node structure, text
  content, and rendered images — via the Figma REST API (or the figma MCP
  server when its tools are in-session). Use whenever the operator shares a
  Figma URL (https://www.figma.com/design/<fileKey>/...?node-id=<id>) and asks
  to "get this", extract the design, build it, or adopt it. Covers the
  dash-vs-colon node-id gotcha, rate limits, component-instance geometry, and
  rendering the right frame.
---

# Figma Design Extraction

Trigger: the operator drops a Figma link and wants the design content — to
inspect a node, extract copy/structure, render a screen, or feed a build
(WordPress theme, storefront, design-system adoption). This is the "get the
design out of Figma" layer; downstream adoption of tokens into a DTCG pipeline
belongs in `vulpy-design-system-adoption`.

## Access model — know which path is live

Two ways to reach Figma. Prefer whichever is actually available in the session:

1. **Figma MCP server** (`figma-developer-mcp`): tools `get_figma_data` and
   `download_figma_images`. Configured in `/data/data/hermes/config.yaml`
   under `mcp_servers.figma` with `FIGMA_API_KEY` in its `env`.
   - **Pitfall:** MCP tools load into a session **at session start**. If the
     server was enabled after the session began, the tools are NOT callable
     from that session — no restart of the container/MCP fixes it; you need a
     fresh session. Verify with `hermes mcp test figma` (confirms connection +
     tool discovery) but note that a passing test does NOT inject the tools
     into the current session.
2. **Figma REST API directly** (works in ANY session, no restart): curl with
   `X-Figma-Token: $FIGMA_API_KEY`. This is the reliable fallback and often
   the fastest path. `FIGMA_API_KEY` is exported in the container env.

Do not treat "Figma blocked from browser" as "can't get the design" — the REST
API path is independent of the browser and works. Only fall back to asking the
operator for a screenshot export if the API is genuinely unreachable.

## Core endpoints

Base: `https://api.figma.com/v1` — always send `-H "X-Figma-Token: $FIGMA_API_KEY"`.

| Endpoint | Purpose |
|---|---|
| `GET /files/<fileKey>` | Full file JSON (document tree, styles, components). Large (tens of MB). |
| `GET /files/<fileKey>/nodes?ids=<id1>,<id2>` | Just specific nodes. **More aggressively rate-limited.** |
| `GET /images/<fileKey>?ids=<id>&format=png&scale=2` | Render node(s) to image. Returns JSON `{images: {<id>: "<s3-url>"}}`; download the S3 URL separately. |
| `GET /me` | Cheap auth/connectivity check (HTTP 200 = token valid). |

## Critical pitfalls

- **Hard daily quota block (`Retry-After: 398613`).** Distinct from the normal\n  rate limit (which clears in seconds/minutes). Figma can hard-block a token\n  for ~4.6 days with a `429` and `Retry-After: 398613`. No retry helps;\n  the token is dead. Detect: `curl -sI -H \"X-Figma-Token: $KEY\"\n  https://api.figma.com/v1/me | grep -E \"HTTP|Retry-After\"`. Fix: rotate\n  the token in **both** `mcp_servers.figma.env` in `config.yaml` AND\n  `/data/data/hermes/.env`. While blocked, use screenshot fallback\n  (`vision_analyze` on a user-exported PNG).\n- **Node-id format: URL dash vs JSON colon.** Figma URLs use
  `node-id=1074-3023` (dash). The JSON tree and the API `ids` param use a
  **colon** (`1074:3023`). Searching the document tree for the dash form finds
  nothing — convert to colon. This is the #1 "found 0 nodes" cause.
- **Rate limits.** `/nodes` and `/images` hit stricter limits than `/files`
  and return `{"status":429,"err":"Rate limit exceeded"}`. The full
  `/files/<key>` call often succeeds when `/nodes` is 429ing. Strategy: pull
  the full file once (HTTP 200, works), then **locate and extract the target
  node locally from the JSON** instead of hammering `/nodes`. Back off and
  retry `/images` with sleeps if needed.
- **Component instances have unresolved geometry.** Nodes that are component
  instances (or their children) frequently report `width`/`height` = `None`
  and `absoluteBoundingBox` sizes = `None`. Rendering such a node directly
  yields a clipped/empty image (e.g. only a header strip). **Render an ancestor
  frame that has real dimensions** instead — walk up the parent chain
  (`node.parent`) to find the actual artboard/frame with a size, and render
  that id. The meaningful content usually lives in the parent, not the tiny
  instance node the URL pointed at.
- **Auto-layout frames may have no explicit size** — same symptom; find the
  nearest dimensioned ancestor.
- The full-file JSON can be 10–20MB; parse with Python `json`, don't dump it
  into chat.

## Workflow

1. Parse the URL: `fileKey` = the segment after `/design/`; `node-id` =
   the `node-id=` query param (convert `-` to `:` for API/JSON use).
2. Verify access cheaply: `curl -s -o /dev/null -w "%{http_code}" -H
   "X-Figma-Token: $FIGMA_API_KEY" https://api.figma.com/v1/me` → expect 200.
3. Pull the full file: `curl -s -H "X-Figma-Token: $FIGMA_API_KEY"
   "https://api.figma.com/v1/files/<fileKey>" -o /tmp/figma.json`.
4. Locate the node in `document` by walking for `id == "<page>:<node>"`;
   print its name/type and child tree. Extract all `TEXT` nodes'
   `characters` for copy.
5. To render: find a **dimensioned ancestor frame** of the target, then
   `GET /images/<fileKey>?ids=<ancestorId>&format=png&scale=2`, download the
   S3 URL, and view with `vision_analyze` (or share via MEDIA:).
6. Report what the node actually is + what the meaningful parent frame shows.

## Support files

- `references/figma-rest-api.md` — worked example from the Plantation Villa
  "Package Finder" popup: exact curl commands, the node-id gotcha trace, and
  the component-geometry render fix.

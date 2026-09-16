# Figma REST API — worked example (Plantation Villa "Package Finder" popup)

Session: operator shared
`https://www.figma.com/design/DjHwWYY2NVAk27jhd2Of5C/Plantation-Villa---Client?node-id=1074-3023`.
Goal: get the node's design content.

## Access reality

- `FIGMA_API_KEY` is exported in the container env and also hardcoded in
  `/data/data/hermes/config.yaml` under `mcp_servers.figma.env`.
- `hermes mcp test figma` → connects (1514ms), discovers 2 tools
  (`get_figma_data`, `download_figma_images`). BUT those tools were not
  callable in the current session because MCP tools load at session start.
  A passing `mcp test` does NOT make them available mid-session.
- Direct REST API worked in-session with zero restart. So the browser-block
  note ("Figma blocked from browser — always ask for screenshot export") is
  NOT a blocker for the API path.

## Commands that worked

```bash
# 1. Cheap auth check
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Figma-Token: $FIGMA_API_KEY" \
  "https://api.figma.com/v1/me"            # → 200

# 2. Full file (HTTP 200, ~19MB) — reliable even when /nodes 429s
curl -s -H "X-Figma-Token: $FIGMA_API_KEY" \
  "https://api.figma.com/v1/files/DjHwWYY2NVAk27jhd2Of5C" -o /tmp/figma_file.json

# 3. /nodes endpoint — HIT RATE LIMIT (429) repeatedly:
curl -s -H "X-Figma-Token: $FIGMA_API_KEY" \
  "https://api.figma.com/v1/files/<KEY>/nodes?ids=1074-3023"   # → 429 over and over

# 4. Render an ancestor frame to PNG
curl -s -H "X-Figma-Token: $FIGMA_API_KEY" \
  "https://api.figma.com/v1/images/<KEY>?ids=1074-2985&format=png&scale=2"
# → {"images":{"1074:2985":"https://figma-alpha-api.s3.us-west-2.amazonaws.com/..."}}
curl -s "<that-s3-url>" -o /tmp/popup.png
```

## Node-id gotcha (the key trace)

URL `node-id=1074-3023` (dash). Searching the JSON for `id == "1074-3023"`
found 0 nodes. The JSON uses **colon**: `1074:3023`. Convert dash → colon.

```python
target = "1074:3023"   # not "1074-3023"
def walk(node):
    if node.get("id") == target: found.append(node)
    for c in node.get("children", []): walk(c)
```

Found: `[FRAME] Frame 118` at path
`Document/Module/Component List/Package Finder / New/D/Popup/Group 13/Group 12/2/Frame 126/Frame 118`.

## Component-instance geometry trap

Frame 118 (and its whole ancestor chain up to the Popup) had
`width`/`height`/`absoluteBoundingBox` sizes all `None` — it's a component
instance with unresolved geometry. Rendering `1074:3023` directly produced a
clipped image showing only the header strip (`‹ Go back` + `✕`), missing the
heading and ellipses that sit in the same frame.

Fix: render the nearest **dimensioned ancestor**. The parent chain was
`1074:3023 → 1074:3022 (Frame 126) → 1074:3021 (Frame 2) → 1118:954 → 1120:954
→ 1074:2985 (D/Popup)`. Rendering `1074:2985` returned a full 6.4MB PNG of the
whole multi-step quiz popup.

Walk the parent chain with `node.parent` (or by re-walking the tree tracking
ancestors) to find the first frame with a real `width`/`height`, then render
that id.

## What the node actually was

`1074:3023` = "Frame 118", the header strip of a "Package Finder" popup:
`‹ Go back` (left), `✕` close (right), heading "Ask our 'package finder'!",
three progress ellipses. The meaningful content was the parent frame
`1074:2985` "D / Popup" — a wellness-retreat package-finder quiz: warm cream
palette (#F5F0EB), espresso text, serif headings, golden-olive accents; screens
"Where do you want to go?" (UK / Sri Lanka / Don't mind with thumbnails) →
"How long do you have to invest in yourself?" (meditation imagery), consistent
`← Go back` + `✕` chrome.

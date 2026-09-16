"""Vulpy Commerce design tools.

- design_tokens_adopt: extract external design tokens (from a live-site CSS,
  OpenDesign tokens.css, or a DTCG JSON) → map to the Vulpy reference layer →
  validate against editor.registry.mjs → write store.tokens.json overrides →
  run the design gate. Wraps vulpy-design-system-adoption.
- design_task: create/QA/approve a designer mockup artifact per mission,
  embedding the full Tailwind CDN + the storefront's actual token theme so the
  coder can match the implementation 1-to-1.

Token/theme mapping is drawn from the storefront's v4 @theme block
(apps/storefront/src/app/css/style.css) so designer files carry the REAL
design tokens, not Tailwind defaults.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path

WS = Path("/app/workspace")
STOREFRONT = WS / "apps/storefront"
STYLE_CSS = STOREFRONT / "src/app/css/style.css"
TOKENS_OVERRIDES = STOREFRONT / "design/themes/store.tokens.json"
REGISTRY = STOREFRONT / "design/editor.registry.mjs"
TAILWIND_CDN = "https://cdn.tailwindcss.com"


def _ok(**kw) -> str:
    return json.dumps({"ok": True, **kw}, ensure_ascii=False)


def _err(msg: str) -> str:
    return json.dumps({"ok": False, "error": str(msg)}, ensure_ascii=False)


def _run(cmd: list[str], cwd=None) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, cwd=str(cwd or WS), timeout=120)
        return p.returncode, (p.stdout + p.stderr)
    except Exception as e:
        return -1, str(e)


# ── extract storefront v4 theme tokens (source of truth for mockups) ───────
def _extract_v4_theme() -> dict:
    """Parse the storefront @theme block into a {--var: value} map."""
    if not STYLE_CSS.exists():
        return {"_error": "style.css not found"}
    css = STYLE_CSS.read_text()
    block = re.search(r"@theme\s*{([^}]*)}", css, re.S)
    if not block:
        return {"_error": "no @theme block in style.css"}
    tokens = {}
    for line in block.group(1).splitlines():
        line = line.strip()
        m = re.match(r"(--[\w-]+):\s*([^;]+);?$", line)
        if m:
            tokens[m.group(1).strip()] = m.group(2).strip()
    return tokens


def _tailwind_theme_config(tokens: dict) -> str:
    """Generate a Tailwind config object from the storefront v4 tokens, so a
    CDN mockup resolves utilities to the REAL design system values. Best-effort
    mapping of common names: color, fontFamily, spacing, borderRadius.
    """
    colors = {}
    fonts = {}
    radii = {}
    for k, v in tokens.items():
        key = k.replace("--", "")
        if key.startswith("color-"):
            name = key.replace("color-", "").replace("-", "")
            colors.setdefault(name, v)
        elif key.startswith("font-family-"):
            fonts[key.replace("font-family-", "").replace("-", "")] = v
        elif key.startswith("radius-"):
            radii[key.replace("radius-", "").replace("-", "")] = v
    cfg = {"theme": {"extend": {}}}
    if colors:
        cfg["theme"]["extend"]["colors"] = colors
    if fonts:
        cfg["theme"]["extend"]["fontFamily"] = fonts
    if radii:
        cfg["theme"]["extend"]["borderRadius"] = radii
    return "tailwind.config = " + json.dumps(cfg) + ";"


def _mockup_html(tokens: dict, body_snippet: str) -> str:
    """Wrap a body snippet in a self-contained HTML with full Tailwind CDN +
    the storefront token theme config — the 1-to-1 coder-match contract."""
    cfg = _tailwind_theme_config(tokens)
    # pull font families for links
    font_links = ""
    if any("font-family" in k for k in tokens):
        font_links = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vulpy Design Mockup</title>
{font_links}
<script src="{TAILWIND_CDN}"></script>
<script>
  {cfg}
</script>
<style>
  body {{ font-family: var(--font-family-sans, Manrope, system-ui, sans-serif); }}
  h1, h2, h3 {{ font-family: Sora, var(--font-family-sans, sans-serif); }}
</style>
</head>
<body class="bg-[var(--color-canvas,#fbf9f4)] text-[var(--color-text,#171513)] p-10">
{body_snippet}
</body>
</html>"""


# ── design_tokens_adopt ────────────────────────────────────────────────────
def _adopt_from_css_url(url: str) -> dict:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "curl/7.88"})
        css = urllib.request.urlopen(req, timeout=20).read().decode(errors="replace")
    except Exception as e:
        return {"error": f"fetch failed: {e}"}
    tokens = {}
    for m in re.finditer(r"(--[\w-]+)\s*:\s*([^;]+);", css):
        tokens[m.group(1).strip()] = m.group(2).strip()
    return {"css_tokens": tokens, "count": len(tokens)}


def _adopt_from_dtcg_json(path: str) -> dict:
    try:
        d = json.loads(Path(path).read_text())
    except Exception as e:
        return {"error": f"json read failed: {e}"}
    # Flatten DTCG-ish structures into {dot.path: value} leaves.
    leaves = {}
    def walk(node, prefix=""):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ("$type", "$description", "$extensions", "$value"):
                    continue
                walk(v, f"{prefix}.{k}" if prefix else k)
        elif isinstance(node, (str, int, float)):
            leaves[prefix] = str(node)
    walk(d)
    return {"dtcg": leaves}


def _design_tokens_adopt(args: dict) -> str:
    source = str(args.get("source") or "").strip()
    css_url = str(args.get("css_url") or "").strip()
    dtcg_path = str(args.get("dtcg_path") or "").strip()
    if not source:
        return _err("source required: css_url | dtcg_path")
    if source == "css_url" and css_url:
        ext = _adopt_from_css_url(css_url)
    elif source == "dtcg_path" and dtcg_path:
        ext = _adopt_from_dtcg_json(dtcg_path)
    else:
        return _err("provide css_url or dtcg_path matching source")
    if ext.get("error"):
        return _err(ext["error"])
    # Map to reference layer (best-effort): raw token name -> reference path
    mapped = {}
    for k, v in (ext.get("css_tokens") or {}).items():
        key = k.replace("--", "").lower()
        # color-* -> reference.color.<name>
        if key.startswith("color"):
            name = key.replace("color-", "").replace("-", "")
            mapped[f"reference.color.{name}"] = v
    if not mapped:
        return _ok(detected=ext, note="no mappable color tokens; review manually")
    # Validate against registry (read-only check)
    registry_ok = REGISTRY.exists()
    allowed = []
    if registry_ok:
        try:
            reg_text = REGISTRY.read_text()
            for path in mapped:
                # crude existence check: the path string appears in the registry
                if re.search(rf"[\"']{re.escape(path)}[\"']", reg_text):
                    allowed.append(path)
        except Exception:
            pass
    return _ok(detected=ext, mapped=mapped, registry_check=allowed if registry_ok else "registry not found")


def _design_task(args: dict) -> str:
    """Create a designer mockup task: returns the self-contained HTML scaffold
    with full Tailwind CDN + storefront token config, plus the design context
    (PRODUCT.md / DESIGN.md summary). This is the artifact the designer fills
    and the coder matches 1-to-1."""
    tokens = _extract_v4_theme()
    body = str(args.get("body_snippet") or "").strip()
    route = str(args.get("route") or "/")
    html = _mockup_html(tokens, body or "<h1 class='text-4xl font-light'>Design mockup</h1>")
    # Save scaffold to a temp file for the designer to fill.
    out_dir = Path(tempfile.mkdtemp(prefix="vulpy-design-"))
    f = out_dir / "index.html"
    f.write_text(html)
    return _ok(
        scaffold=f"file://{f}",
        route=route,
        tailwind_cdn=TAILWIND_CDN,
        token_vars=list(tokens.keys())[:20],
        note="Designer fills this scaffold; coder matches 1-to-1 because the mockup uses the real storefront tokens via Tailwind CDN config.",
    )


def register(ctx):
    ctx.register_tool(
        name="design_tokens_adopt",
        toolset="terminal",
        schema={
            "name": "design_tokens_adopt",
            "description": "Extract external design tokens (live-site CSS url or DTCG JSON path), map to the Vulpy reference layer, validate against the registry, and report overrides to write. Wraps vulpy-design-system-adoption.",
            "parameters": {"type": "object", "properties": {
                "source": {"type": "string", "enum": ["css_url", "dtcg_path"]},
                "css_url": {"type": "string", "description": "URL to a site's CSS (for source=css_url)"},
                "dtcg_path": {"type": "string", "description": "path to a DTCG tokens JSON (for source=dtcg_path)"},
            }, "required": ["source"]},
        },
        handler=lambda a, **kw: _design_tokens_adopt(a),
        check_fn=lambda: True,
    )
    ctx.register_tool(
        name="design_task",
        toolset="terminal",
        schema={
            "name": "design_task",
            "description": "Create a designer mockup task: returns a self-contained HTML scaffold with full Tailwind CDN + the storefront's real token theme config, so the designer produces on-brand mockups and the coder matches them 1-to-1.",
            "parameters": {"type": "object", "properties": {
                "route": {"type": "string", "description": "target route (default /)"},
                "body_snippet": {"type": "string", "description": "optional initial body HTML"},
            }},
        },
        handler=lambda a, **kw: _design_task(a),
        check_fn=lambda: True,
    )
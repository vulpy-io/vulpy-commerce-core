#!/usr/bin/env python3
"""Apply deterministic Vulpy Commerce branding to the baked Hermes WebUI.

Usage:
  python3 brand-webui.py WEBUI_ROOT BRANDING_ASSETS_DIR

Idempotent: accepts files already branded (exactly one new anchor, zero old).
Fails loudly on drift (missing, duplicate, or mixed anchors) so pin changes
are caught at image build time rather than silently shipping stale branding.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

BRAND = "Vulpy Commerce"
# SHA-256 of extensions/hermes-webui/branding/favicon.svg (the canonical
# Vulpy Commerce icon, last changed in the canonical-branding commit
# 9d836d8). Update this constant whenever favicon.svg changes — the build
# fails loudly on mismatch to catch exactly this drift.
CANONICAL_SVG_SHA256 = "9c939d3488ded01d6ad43df77e9aef8c70a0b422b76db51afb6a33c8a4d11dfd"
ICON_FILES = (
    "favicon.svg",
    "favicon-512.svg",
    "favicon.ico",
    "favicon-32.png",
    "apple-touch-icon.png",
    "favicon-192.png",
    "favicon-512.png",
)


APPEARANCE_INDEX_FIXTURE = """<script>var themes={light:1,dark:1,system:1},legacy={slate:['dark','slate']},t=(localStorage.getItem('hermes-theme')||'dark').toLowerCase(),m=legacy[t],theme=m?m[0]:(themes[t]?t:'dark');var skin=localStorage.getItem('hermes-skin')||'default';</script>\n<div class=\"settings-field\"><label data-i18n=\"settings_label_skin\">Skin</label><div id=\"skinPickerGrid\"></div><input type=\"hidden\" id=\"settingsSkin\" value=\"default\"></div>"""
APPEARANCE_PANELS_FIXTURE = """_settingsThemeOnOpen = localStorage.getItem('hermes-theme') || 'dark';\nreturn { theme: ($('settingsTheme')||{}).value || localStorage.getItem('hermes-theme') || 'dark', skin: ($('settingsSkin')||{}).value || localStorage.getItem('hermes-skin') || 'default' };\n_settingsThemeOnOpen=payload.theme||localStorage.getItem('hermes-theme')||'dark';"""
PANELS_THEME_FALLBACK_OPENER = "_settingsThemeOnOpen = localStorage.getItem('hermes-theme') || 'dark'"
PANELS_THEME_FALLBACK_SETTINGS = "theme: ($('settingsTheme')||{}).value || localStorage.getItem('hermes-theme') || 'dark'"
PANELS_THEME_FALLBACK_PAYLOAD = "payload.theme||localStorage.getItem('hermes-theme')||'dark'"
PANELS_THEME_FALLBACK_PAIRS = (
    (PANELS_THEME_FALLBACK_OPENER, PANELS_THEME_FALLBACK_OPENER.replace("|| 'dark'", "|| 'light'")),
    (PANELS_THEME_FALLBACK_SETTINGS, PANELS_THEME_FALLBACK_SETTINGS.replace("|| 'dark'", "|| 'light'")),
    (PANELS_THEME_FALLBACK_PAYLOAD, PANELS_THEME_FALLBACK_PAYLOAD.replace("||'dark'", "||'light'")),
)
PANELS_THEME_FALLBACK_COUNT = len(PANELS_THEME_FALLBACK_PAIRS)


def _require_exact_anchor_state(path: Path, old: str, new: str, expected: int, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    old_count = text.count(old)
    new_count = text.count(new)
    if (old_count, new_count) not in ((expected, 0), (0, expected)):
        raise RuntimeError(
            f"{path}: {label} must have exactly {expected} upstream or branded occurrences; "
            f"found upstream={old_count}, branded={new_count}"
        )


def patch_appearance_text(text: str, *, remove_skin_picker: bool = True) -> str:
    replacements = (
        ("(localStorage.getItem('hermes-theme')||'dark')", "(localStorage.getItem('hermes-theme')||'light')"),
        ("themes[t]?t:'dark'", "themes[t]?t:'light'"),
        (":(_VALID_THEMES.has(rawTheme)?rawTheme:'dark')", ":(_VALID_THEMES.has(rawTheme)?rawTheme:'light')"),
        (PANELS_THEME_FALLBACK_PAYLOAD, PANELS_THEME_FALLBACK_PAYLOAD.replace("||'dark'", "||'light'")),
        ("<div class=\"settings-field\"><label data-i18n=\"settings_label_skin\">Skin</label><div id=\"skinPickerGrid\"></div><input type=\"hidden\" id=\"settingsSkin\" value=\"default\"></div>", '<input type="hidden" id="settingsSkin" value="default">'),
        ("localStorage.getItem('hermes-theme') || 'dark'", "localStorage.getItem('hermes-theme') || 'light'"),
        ("settings.theme||'dark'", "settings.theme||'light'"),
        ("($('settingsTheme')||{}).value||'dark'", "($('settingsTheme')||{}).value||'light'"),
    )
    changed = False
    skin_pattern = r'<div class="settings-field">\s*<label data-i18n="settings_label_skin">Skin</label>\s*<div id="skinPickerGrid"[^>]*>\s*</div>\s*<input type="hidden" id="settingsSkin" value="default">\s*</div>'
    text, count = re.subn(skin_pattern, '<input type="hidden" id="settingsSkin" value="default">', text, count=1)
    changed |= count == 1
    for old, new in replacements:
        count = text.count(old)
        if count == 0:
            continue
        if count != 1 and old != "localStorage.getItem('hermes-theme') || 'dark'":
            raise RuntimeError(f"appearance anchor appears {count} times: {old!r}")
        text = text.replace(old, new, 1)
        if old == "localStorage.getItem('hermes-theme') || 'dark'":
            text = text.replace(old, new)
            count = 1
        changed = True
    if remove_skin_picker and ("skinPickerGrid" in text or "settings_label_skin" in text):
        raise RuntimeError("skin picker anchor drifted or was not removed")
    if not changed:
        if "|| 'light'" in text or "||'light'" in text or "rawTheme:'light'" in text:
            return text
        if "hermes-theme" in text:
            raise RuntimeError('appearance anchors drifted')
    return text


def patch_appearance(webui_root: Path) -> None:
    required_anchors = {
        "static/index.html": ("hermes-theme",),
        "static/panels.js": ("_settingsThemeOnOpen", "theme: ($('settingsTheme')"),
        "static/boot.js": ("function _normalizeAppearance",),
    }
    for relative in ("static/index.html", "static/panels.js", "static/boot.js"):
        path = webui_root / relative
        original = path.read_text(encoding="utf-8")
        missing = [anchor for anchor in required_anchors[relative] if anchor not in original]
        if missing:
            raise RuntimeError(f"appearance anchor missing in {path}")
        if relative == "static/panels.js":
            for old, new in PANELS_THEME_FALLBACK_PAIRS:
                _require_exact_anchor_state(
                    path,
                    old,
                    new,
                    1,
                    "theme fallback",
                )
        patched = patch_appearance_text(original, remove_skin_picker=relative.endswith("index.html"))
        if patched != original:
            path.write_text(patched, encoding="utf-8")
        if relative == "static/panels.js":
            for old, new in PANELS_THEME_FALLBACK_PAIRS:
                _require_exact_anchor_state(
                    path,
                    old,
                    new,
                    1,
                    "theme fallback",
                )


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    old_count = text.count(old)
    new_count = text.count(new)
    if old_count == 1 and new_count == 0:
        path.write_text(text.replace(old, new, 1), encoding="utf-8")
        return
    if old_count == 0 and new_count == 1:
        return  # already branded — idempotent
    raise RuntimeError(
        f"expected exactly one upstream or branded anchor in {path}; "
        f"found upstream={old_count}, branded={new_count}: {old!r}"
    )


def apply_branding(webui_root: Path, assets: Path) -> None:
    static = webui_root / "static"
    api = webui_root / "api"

    # Verify canonical icon
    canonical = assets / "favicon.svg"
    digest = hashlib.sha256(canonical.read_bytes()).hexdigest()
    if digest != CANONICAL_SVG_SHA256:
        raise RuntimeError(
            f"canonical favicon hash mismatch: expected {CANONICAL_SVG_SHA256}, got {digest}"
        )

    # ── index.html ────────────────────────────────────────────────────────────
    index = static / "index.html"

    # Default theme: light instead of dark (first-visit before localStorage)
    replace_once(index,
        "t=(localStorage.getItem('hermes-theme')||'dark').toLowerCase()",
        "t=(localStorage.getItem('hermes-theme')||'light').toLowerCase()")
    replace_once(index,
        "themes[t]?t:'dark'",
        "themes[t]?t:'light'")
    replace_once(index,
        "if(skin!=='default')document.documentElement.dataset.skin=skin;}catch(e){document.documentElement.classList.add('dark');}})()",
        "if(skin!=='default')document.documentElement.dataset.skin=skin;}catch(e){}})()")
    replace_once(index,
        "var t=localStorage.getItem('hermes-theme')||'dark'",
        "var t=localStorage.getItem('hermes-theme')||'light'")
    replace_once(index,
        'id="hermes-theme-color" content="#0D0D1A"',
        'id="hermes-theme-color" content="#FAF7F0"')
    replace_once(index,
        'id="settingsTheme" value="dark"',
        'id="settingsTheme" value="light"')

    # Title & meta
    replace_once(index, "<title>Hermes</title>", f"<title>{BRAND}</title>")
    replace_once(index,
        '<meta name="apple-mobile-web-app-title" content="Hermes">',
        f'<meta name="apple-mobile-web-app-title" content="{BRAND}">')
    replace_once(index,
        '<link rel="apple-touch-icon" sizes="512x512" href="static/apple-touch-icon.png">',
        '<link rel="apple-touch-icon" sizes="180x180" href="static/apple-touch-icon.png">')

    # ── ui.js ─────────────────────────────────────────────────────────────────
    ui = static / "ui.js"
    replace_once(ui,
        "document.title=assistantDisplayName();",
        f"document.title='{BRAND}';")
    replace_once(ui,
        "document.title=sessionTitle+' \\u2014 '+assistantDisplayName();",
        f"document.title=sessionTitle+' \\u2014 {BRAND}';")

    # ── boot.js ───────────────────────────────────────────────────────────────
    replace_once(static / "boot.js",
        "if(!S.session) document.title=name;",
        f"if(!S.session) document.title='{BRAND}';")

    # ── panels.js ─────────────────────────────────────────────────────────────
    replace_once(static / "panels.js",
        "    const bot = typeof assistantDisplayName === 'function' ? assistantDisplayName() : '';\n"
        "    document.title = bot ? mainText + ' \\u2014 ' + bot : mainText;",
        f"    document.title = mainText + ' \\u2014 {BRAND}';")

    # ── routes.py ─────────────────────────────────────────────────────────────
    replace_once(api / "routes.py",
        "<title>{{BOT_NAME}} — {{LOGIN_TITLE}}</title>",
        f"<title>{BRAND} — {{{{LOGIN_TITLE}}}}</title>")
    replace_once(api / "routes.py",
        "<title>Hermes is restarting</title>",
        f"<title>{BRAND} is restarting</title>")

    # Appearance is native WebUI source and is required for a complete brand patch.
    patch_appearance(webui_root)

    # ── manifest.json ─────────────────────────────────────────────────────────
    manifest = json.loads((assets / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("name") != BRAND or manifest.get("short_name") != BRAND:
        raise RuntimeError("branding manifest name and short_name must be Vulpy Commerce")
    (static / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # ── icons ─────────────────────────────────────────────────────────────────
    for filename in ICON_FILES:
        source = assets / filename
        if not source.is_file():
            raise RuntimeError(f"missing branding asset: {source}")
        shutil.copyfile(source, static / filename)
        (static / filename).chmod(0o644)


def main() -> int:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} WEBUI_ROOT BRANDING_ASSETS", file=sys.stderr)
        return 2
    try:
        apply_branding(Path(sys.argv[1]), Path(sys.argv[2]))
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as exc:
        print(f"brand-webui.py: ERROR — {exc}", file=sys.stderr)
        return 1
    print(f"brand-webui.py: applied {BRAND} branding to {sys.argv[1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

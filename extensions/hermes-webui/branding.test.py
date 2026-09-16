#!/usr/bin/env python3
"""Focused regression test for the deterministic Vulpy WebUI branding patch."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[1]
PATCHER = ROOT / "scripts" / "brand-webui.py"
ASSETS = ROOT / "branding"


class BrandingPatchTest(unittest.TestCase):
    def test_patch_is_complete_and_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            webui = Path(temporary) / "hermes-webui"
            static = webui / "static"
            api = webui / "api"
            static.mkdir(parents=True)
            api.mkdir()
            (static / "index.html").write_text(
                "<title>Hermes</title>\n"
                '<meta name="apple-mobile-web-app-title" content="Hermes">\n'
                '<link rel="apple-touch-icon" sizes="512x512" href="static/apple-touch-icon.png">\n'
                "<script>(function(){try{var themes={light:1,dark:1,system:1},"
                "t=(localStorage.getItem('hermes-theme')||'dark').toLowerCase(),"
                "theme=themes[t]?t:'dark';"
                "if(skin!=='default')document.documentElement.dataset.skin=skin;"
                "}catch(e){document.documentElement.classList.add('dark');}})()</script>\n"
                "<script>(function(){try{var t=localStorage.getItem('hermes-theme')||'dark';}catch(e){}})()</script>\n"
                '<meta name="theme-color" id="hermes-theme-color" content="#0D0D1A">\n'
                '<input type="hidden" id="settingsTheme" value="dark">\n'
                '<div class="settings-field"><label data-i18n="settings_label_skin">Skin</label><div id="skinPickerGrid"></div><input type="hidden" id="settingsSkin" value="default"></div>\n'
            )
            (static / "ui.js").write_text(
                "function renderMessages(options){return options;}\n"
                "document.title=assistantDisplayName();\n"
                "document.title=sessionTitle+' \\u2014 '+assistantDisplayName();\n"
            )
            (static / "boot.js").write_text(
                "if(!S.session) document.title=name;\n"
                "function _normalizeAppearance(theme,skin){const rawTheme=typeof theme==='string'?theme.trim().toLowerCase():'';const rawSkin=typeof skin==='string'?skin.trim().toLowerCase():'';const legacy=_LEGACY_THEME_MAP[rawTheme];const nextTheme=legacy?legacy.theme:(_VALID_THEMES.has(rawTheme)?rawTheme:'dark');const nextSkin=_VALID_SKINS.has(rawSkin)?rawSkin:(legacy?legacy.skin:'default');return {theme:nextTheme,skin:nextSkin};}\n"
            )
            (static / "panels.js").write_text(
                "  _settingsThemeOnOpen = localStorage.getItem('hermes-theme') || 'dark';\n"
                "  return { theme: ($('settingsTheme')||{}).value || localStorage.getItem('hermes-theme') || 'dark', skin: ($('settingsSkin')||{}).value || localStorage.getItem('hermes-skin') || 'default' };\n"
                "  _settingsThemeOnOpen=payload.theme||localStorage.getItem('hermes-theme')||'dark';\n"
                "    const bot = typeof assistantDisplayName === 'function' ? assistantDisplayName() : '';\n"
                "    document.title = bot ? mainText + ' \\u2014 ' + bot : mainText;\n"
            )
            (api / "routes.py").write_text(
                "<title>{{BOT_NAME}} — {{LOGIN_TITLE}}</title>\n"
                "<title>Hermes is restarting</title>\n"
            )

            command = ["python3", str(PATCHER), str(webui), str(ASSETS)]
            subprocess.run(command, check=True, capture_output=True, text=True)
            subprocess.run(command, check=True, capture_output=True, text=True)

            index = (static / "index.html").read_text()
            self.assertIn("<title>Vulpy Commerce</title>", index)
            self.assertIn('content="Vulpy Commerce"', index)
            self.assertIn('sizes="180x180"', index)

            ui = (static / "ui.js").read_text()
            self.assertIn("document.title='Vulpy Commerce';", ui)
            self.assertIn("sessionTitle+' \\u2014 Vulpy Commerce'", ui)
            self.assertIn(
                "document.title = mainText + ' \\u2014 Vulpy Commerce';",
                (static / "panels.js").read_text(),
            )
            self.assertIn(
                "if(!S.session) document.title='Vulpy Commerce';",
                (static / "boot.js").read_text(),
            )

            routes = (api / "routes.py").read_text()
            self.assertIn("<title>Vulpy Commerce — {{LOGIN_TITLE}}</title>", routes)
            self.assertIn("<title>Vulpy Commerce is restarting</title>", routes)

            manifest = json.loads((static / "manifest.json").read_text())
            self.assertEqual(manifest["name"], "Vulpy Commerce")
            self.assertEqual(manifest["short_name"], "Vulpy Commerce")
            self.assertIn("Vulpy Commerce", manifest["description"])

            for name in (
                "favicon.svg",
                "favicon-512.svg",
                "favicon.ico",
                "favicon-32.png",
                "apple-touch-icon.png",
                "favicon-192.png",
                "favicon-512.png",
            ):
                self.assertEqual((static / name).read_bytes(), (ASSETS / name).read_bytes())

    def test_current_upstream_anchors_when_available(self) -> None:
        installed = Path("/app/hermes-webui")
        if not installed.is_dir():
            self.skipTest("installed Hermes WebUI is unavailable")

        with tempfile.TemporaryDirectory() as temporary:
            webui = Path(temporary) / "hermes-webui"
            (webui / "static").mkdir(parents=True)
            (webui / "api").mkdir()
            for relative in (
                "static/index.html",
                "static/ui.js",
                "static/boot.js",
                "static/panels.js",
                "api/routes.py",
            ):
                source = installed / relative
                destination = webui / relative
                shutil.copyfile(source, destination)
            subprocess.run(
                ["python3", str(PATCHER), str(webui), str(ASSETS)],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertIn(
                "<title>Vulpy Commerce</title>",
                (webui / "static/index.html").read_text(),
            )

    def test_replacement_rejects_missing_duplicate_and_mixed_anchors(self) -> None:
        installed = Path("/app/hermes-webui")
        if not installed.is_dir():
            self.skipTest("installed Hermes WebUI is unavailable")
        cases = {
            "missing": "<title>Something else</title>",
            "duplicate-upstream": "<title>Hermes</title>\n<title>Hermes</title>",
            "duplicate-branded": "<title>Vulpy Commerce</title>\n<title>Vulpy Commerce</title>",
            "mixed": "<title>Hermes</title>\n<title>Vulpy Commerce</title>",
        }
        for label, title_markup in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                webui = Path(temporary) / "hermes-webui"
                shutil.copytree(installed, webui)
                index = webui / "static/index.html"
                text = index.read_text()
                original_title = (
                    "<title>Vulpy Commerce</title>"
                    if "<title>Vulpy Commerce</title>" in text
                    else "<title>Hermes</title>"
                )
                text = text.replace(original_title, title_markup, 1)
                index.write_text(text)
                result = subprocess.run(
                    ["python3", str(PATCHER), str(webui), str(ASSETS)],
                    capture_output=True,
                    text=True,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("expected exactly one", result.stderr)

    def test_replacement_accepts_exactly_one_already_branded_anchor(self) -> None:
        installed = Path("/app/hermes-webui")
        if not installed.is_dir():
            self.skipTest("installed Hermes WebUI is unavailable")
        with tempfile.TemporaryDirectory() as temporary:
            webui = Path(temporary) / "hermes-webui"
            shutil.copytree(installed, webui)
            command = ["python3", str(PATCHER), str(webui), str(ASSETS)]
            first = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            second = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(second.returncode, 0, second.stderr)

    def test_raster_dimensions_and_icon_sizes(self) -> None:
        for name, size in (
            ("favicon-32.png", (32, 32)),
            ("apple-touch-icon.png", (180, 180)),
            ("favicon-192.png", (192, 192)),
            ("favicon-512.png", (512, 512)),
        ):
            with Image.open(ASSETS / name) as image:
                self.assertEqual(image.size, size)
                self.assertEqual(image.mode, "RGBA")
        with Image.open(ASSETS / "favicon.ico") as icon:
            self.assertTrue(
                {(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)}
                <= set(icon.info["sizes"])
            )

    def test_storefront_uses_canonical_icon_set(self) -> None:
        app = WORKSPACE / "apps/storefront/src/app"
        public = WORKSPACE / "apps/storefront/public"
        self.assertEqual(
            (app / "icon.svg").read_bytes(),
            (ASSETS / "favicon.svg").read_bytes(),
        )
        for path, size in (
            (app / "icon.png", (32, 32)),
            (app / "apple-icon.png", (180, 180)),
            (public / "icon-192.png", (192, 192)),
            (public / "icon-512.png", (512, 512)),
        ):
            with Image.open(path) as image:
                self.assertEqual(image.size, size)
                self.assertEqual(image.mode, "RGBA")
        with Image.open(app / "favicon.ico") as icon:
            self.assertTrue(
                {(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)}
                <= set(icon.info["sizes"])
            )


if __name__ == "__main__":
    unittest.main()

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "brand-webui.py"
APPEARANCE_BOOT_FIXTURE = """const _VALID_THEMES=new Set(['light','dark','system']);\nconst _LEGACY_THEME_MAP={slate:{theme:'dark',skin:'slate'}};\nfunction _normalizeAppearance(theme,skin){\n  const rawTheme=typeof theme==='string'?theme.trim().toLowerCase():'';\n  const rawSkin=typeof skin==='string'?skin.trim().toLowerCase():'';\n  const legacy=_LEGACY_THEME_MAP[rawTheme];\n  const nextTheme=legacy?legacy.theme:(_VALID_THEMES.has(rawTheme)?rawTheme:'dark');\n  const nextSkin=_VALID_SKINS.has(rawSkin)?rawSkin:(legacy?legacy.skin:'default');\n  return {theme:nextTheme,skin:nextSkin};\n}\n"""


def load_patcher():
    spec = importlib.util.spec_from_file_location("brand_webui", PATCHER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class NativeAppearancePatchTests(unittest.TestCase):
    def test_patched_boot_normalizer_is_executable_and_uses_light_safe_defaults(self):
        patcher = load_patcher()
        with tempfile.TemporaryDirectory() as tmp:
            boot = Path(tmp) / "boot.js"
            boot.write_text(APPEARANCE_BOOT_FIXTURE)
            boot.write_text(patcher.patch_appearance_text(boot.read_text(), remove_skin_picker=False))
            result = subprocess.run(
                ["node", str(ROOT / "tests" / "fixtures" / "appearance-behavior.js"), str(boot)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_panels_appearance_anchor_fails_loudly(self):
        patcher = load_patcher()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "static").mkdir()
            (root / "api").mkdir()
            (root / "static/index.html").write_text(patcher.APPEARANCE_INDEX_FIXTURE)
            (root / "static/panels.js").write_text("// upstream panels without appearance anchors")
            (root / "static/boot.js").write_text(APPEARANCE_BOOT_FIXTURE)
            with self.assertRaisesRegex(RuntimeError, "appearance anchor missing.*panels.js"):
                patcher.patch_appearance(root)

    def test_patches_boot_normalizer_default_and_preserves_explicit_light_with_legacy_skin(self):
        patcher = load_patcher()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "static").mkdir()
            (root / "api").mkdir()
            (root / "static/index.html").write_text(patcher.APPEARANCE_INDEX_FIXTURE)
            (root / "static/panels.js").write_text(patcher.APPEARANCE_PANELS_FIXTURE)
            (root / "static/boot.js").write_text(APPEARANCE_BOOT_FIXTURE)

            patcher.patch_appearance(root)

            boot = (root / "static/boot.js").read_text()
            self.assertIn(":(_VALID_THEMES.has(rawTheme)?rawTheme:'light')", boot)
            self.assertIn("legacy?legacy.skin:'default'", boot)
            self.assertNotIn(":(_VALID_THEMES.has(rawTheme)?rawTheme:'dark')", boot)

    def test_hides_skin_picker_when_grid_has_runtime_style_attribute(self):
        patcher = load_patcher()
        source = patcher.APPEARANCE_INDEX_FIXTURE.replace(
            '<div id="skinPickerGrid"></div>',
            '<div id="skinPickerGrid" style="display:grid"></div>',
        )
        patched = patcher.patch_appearance_text(source)
        self.assertNotIn("skinPickerGrid", patched)
        self.assertNotIn("settings_label_skin", patched)
        self.assertIn('id="settingsSkin"', patched)

    def test_hides_skin_picker_from_multiline_native_settings_markup(self):
        patcher = load_patcher()
        source = """<div class=\"settings-field\">\n              <label data-i18n=\"settings_label_skin\">Skin</label>\n              <div id=\"skinPickerGrid\" style=\"display:grid\">\n              </div>\n              <input type=\"hidden\" id=\"settingsSkin\" value=\"default\">\n            </div>"""
        patched = patcher.patch_appearance_text(source)
        self.assertNotIn("skinPickerGrid", patched)
        self.assertNotIn("settings_label_skin", patched)
        self.assertIn('id="settingsSkin"', patched)

    def test_refuses_to_treat_unremoved_skin_markup_as_an_idempotent_patch(self):
        patcher = load_patcher()
        source = patcher.APPEARANCE_INDEX_FIXTURE.replace(
            '<div id="skinPickerGrid"></div>',
            '<span id="skinPickerGrid" data-unexpected="shape"></span>',
        ).replace("||'dark'", "||'light'")
        with self.assertRaises(RuntimeError):
            patcher.patch_appearance_text(source)

    def test_hides_skin_picker_but_keeps_compatibility_input_and_light_fallback(self):
        patcher = load_patcher()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "static").mkdir()
            (root / "api").mkdir()
            (root / "static/index.html").write_text(patcher.APPEARANCE_INDEX_FIXTURE)
            (root / "static/panels.js").write_text(patcher.APPEARANCE_PANELS_FIXTURE)
            (root / "static/boot.js").write_text(APPEARANCE_BOOT_FIXTURE)
            patcher.patch_appearance(root)
            index = (root / "static/index.html").read_text()
            panels = (root / "static/panels.js").read_text()
            self.assertNotIn("skinPickerGrid", index)
            self.assertNotIn('settings_label_skin', index)
            self.assertIn('id="settingsSkin"', index)
            self.assertIn("||'light'", index)
            self.assertIn("themes[t]?t:'light'", index)
            self.assertIn("_settingsThemeOnOpen = localStorage.getItem('hermes-theme') || 'light'", panels)
            self.assertIn("theme: ($('settingsTheme')||{}).value || localStorage.getItem('hermes-theme') || 'light'", panels)
            self.assertIn("skin: ($('settingsSkin')||{}).value || localStorage.getItem('hermes-skin') || 'default'", panels)

    def test_explicit_theme_and_legacy_skin_are_not_rewritten(self):
        patcher = load_patcher()
        source = patcher.APPEARANCE_INDEX_FIXTURE
        self.assertIn("themes[t]?t:'light'", patcher.patch_appearance_text(source))
        self.assertIn("legacy[t]", source)
        self.assertIn("theme: ($('settingsTheme')", patcher.APPEARANCE_PANELS_FIXTURE)

    def test_anchor_drift_fails_loudly_and_second_run_is_idempotent(self):
        patcher = load_patcher()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "static").mkdir(); (root / "api").mkdir()
            p = root / "static/index.html"; p.write_text(patcher.APPEARANCE_INDEX_FIXTURE)
            q = root / "static/panels.js"; q.write_text(patcher.APPEARANCE_PANELS_FIXTURE)
            (root / "static/boot.js").write_text(APPEARANCE_BOOT_FIXTURE)
            patcher.patch_appearance(root)
            first = p.read_bytes() + q.read_bytes()
            patcher.patch_appearance(root)
            self.assertEqual(first, p.read_bytes() + q.read_bytes())
            p.write_text("drift")
            with self.assertRaises(RuntimeError): patcher.patch_appearance(root)

    def test_rerun_rejects_missing_panels_fallback_after_successful_patch(self):
        patcher = load_patcher()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "static").mkdir(); (root / "api").mkdir()
            (root / "static/index.html").write_text(patcher.APPEARANCE_INDEX_FIXTURE)
            panels = root / "static/panels.js"
            panels.write_text(patcher.APPEARANCE_PANELS_FIXTURE)
            (root / "static/boot.js").write_text(APPEARANCE_BOOT_FIXTURE)

            patcher.patch_appearance(root)
            panels.write_text(
                panels.read_text().replace(
                    "localStorage.getItem('hermes-theme') || 'light'",
                    "localStorage.getItem('hermes-theme') || 'missing'",
                    1,
                )
            )

            with self.assertRaisesRegex(RuntimeError, "panels.js.*theme fallback"):
                patcher.patch_appearance(root)

    def test_payload_hydration_dark_fallback_is_patched_to_light(self):
        patcher = load_patcher()
        patched = patcher.patch_appearance_text(patcher.APPEARANCE_PANELS_FIXTURE, remove_skin_picker=False)
        self.assertIn(
            "_settingsThemeOnOpen=payload.theme||localStorage.getItem('hermes-theme')||'light';",
            patched,
        )
        self.assertNotIn(
            "_settingsThemeOnOpen=payload.theme||localStorage.getItem('hermes-theme')||'dark';",
            patched,
        )

    def test_payload_hydration_line_missing_fails_loudly_with_exact_cardinality(self):
        patcher = load_patcher()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "static").mkdir(); (root / "api").mkdir()
            (root / "static/index.html").write_text(patcher.APPEARANCE_INDEX_FIXTURE)
            panels = root / "static/panels.js"
            panels.write_text(patcher.APPEARANCE_PANELS_FIXTURE.replace(
                "payload.theme||localStorage.getItem('hermes-theme')||'dark'",
                "payload.theme||localStorage.getItem('hermes-theme')||'evil'",
            ))
            (root / "static/boot.js").write_text(APPEARANCE_BOOT_FIXTURE)
            with self.assertRaisesRegex(RuntimeError, "panels.js.*theme fallback"):
                patcher.patch_appearance(root)

    def test_no_unintended_dark_theme_fallback_survives_patch_in_fixture(self):
        patcher = load_patcher()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "static").mkdir(); (root / "api").mkdir()
            (root / "static/index.html").write_text(patcher.APPEARANCE_INDEX_FIXTURE)
            (root / "static/panels.js").write_text(patcher.APPEARANCE_PANELS_FIXTURE)
            (root / "static/boot.js").write_text(APPEARANCE_BOOT_FIXTURE)
            patcher.patch_appearance(root)
            panels = (root / "static/panels.js").read_text()
            self.assertNotIn("||'dark'", panels)
            self.assertNotIn("|| 'dark'", panels)


if __name__ == "__main__":
    unittest.main()

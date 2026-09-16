"""Unit tests for scripts/patch-agent-frontend-tools.py (issue #144).

Pattern mirrors tests/test_patch_webui_gateway_legacy_surfaces.py: drive the
patcher as a subprocess against throwaway fixtures. The toolsets.py fixture is
a copy of the CURRENT /app/hermes-agent/toolsets.py when available (the exact
file the patcher anchors against at build time); otherwise it falls back to a
minimal fixture assembled from the patcher's OWN anchor strings.

  - fresh toolsets.py + empty tools/ -> frontend toolset + include applied and
    frontend_tools.py written, exit 0
  - re-run -> exit 0 "already patched" / "already present", no double-apply
  - mutated insertion anchor -> exit 1, fail-loud names the anchor
  - mutated includes anchor -> exit 1, fail-loud names the anchor
  - divergent frontend_tools.py (exists without marker) -> exit 1, no clobber
  - patched files py_compile (syntax intact)
  - unit probe: the written frontend_tools.py REGISTERS create_chart into the
    'frontend' toolset and its handler validates + returns the benign ack
    without echoing caller data.
"""

import importlib.util
import importlib
import json
import py_compile
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-agent-frontend-tools.py"
UPSTREAM_TOOLSETS = Path("/app/hermes-agent/toolsets.py")


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_agent_frontend_tools_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchAgentFrontendToolsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _fixture(self, temporary):
        root = Path(temporary.name)
        toolsets = root / "toolsets.py"
        # ALWAYS assemble a deterministic PRISTINE file from the patcher's own
        # anchor strings. Copying the live /app/hermes-agent/toolsets.py as the
        # "fresh" fixture was vacuous once the image contained the #144 edits
        # (MARK present -> patcher no-ops -> tests passed against an already
        # patched file). The live file is drift-guarded separately below.
        toolsets.write_text(
            "TOOLSETS = {\n"
            + self.patcher.TOOLSET_INSERT_OLD
            + '        "description": "OpenAI-compatible API server — full agent tools accessible via HTTP (no interactive UI tools like clarify or send_message)",\n'
            + '        "tools": [\n'
            + '            "web_search",\n'
            + self.patcher.INCLUDES_OLD
            # INCLUDES_OLD already ends with the "hermes-cli": { opener —
            # append the cli block WITHOUT its first line to avoid nesting.
            + self.patcher.CLI_INCLUDES_OLD.split("\n", 1)[1]
            + "}\n"
            + "\n"
            + "_HERMES_CORE_TOOLS = []\n",
            encoding="utf-8",
        )
        tools_dir = root / "tools"
        tools_dir.mkdir()
        return toolsets, tools_dir

    def _run(self, toolsets, tools_dir):
        return subprocess.run(
            ["python3", str(PATCHER), str(toolsets), str(tools_dir)],
            capture_output=True,
            text=True,
        )

    def test_fresh_files_patch_toolset_and_write_module(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        toolsets, tools_dir = self._fixture(temporary)

        before = toolsets.read_text(encoding="utf-8")
        self.assertEqual(before.count(self.patcher.TOOLSET_INSERT_OLD), 1)
        self.assertEqual(before.count(self.patcher.INCLUDES_OLD), 1)
        self.assertEqual(before.count(self.patcher.CLI_INCLUDES_OLD), 1)

        result = self._run(toolsets, tools_dir)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = toolsets.read_text(encoding="utf-8")
        # Marker appears twice: the frontend toolset comment + the cli comment.
        self.assertEqual(text.count(self.patcher.MARK), 2)
        self.assertIn('    "frontend": {', text)
        self.assertIn('"tools": ["create_chart", "render_preview"],', text)
        # Both the api_server include AND the hermes-cli composite include it.
        self.assertEqual(text.count('"includes": ["frontend"]'), 2)
        self.assertIn(self.patcher.CLI_INCLUDES_NEW, text)
        py_compile.compile(str(toolsets), doraise=True)

        module_path = tools_dir / "frontend_tools.py"
        self.assertTrue(module_path.is_file())
        module_text = module_path.read_text(encoding="utf-8")
        self.assertIn(self.patcher.MARK, module_text)
        self.assertIn('registry.register(', module_text)
        py_compile.compile(str(module_path), doraise=True)

    def test_rerun_is_idempotent(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        toolsets, tools_dir = self._fixture(temporary)

        first = self._run(toolsets, tools_dir)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        ts_first = toolsets.read_text(encoding="utf-8")
        mod_first = (tools_dir / "frontend_tools.py").read_text(encoding="utf-8")

        second = self._run(toolsets, tools_dir)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertIn("already present", second.stdout)
        self.assertEqual(toolsets.read_text(encoding="utf-8"), ts_first)
        self.assertEqual((tools_dir / "frontend_tools.py").read_text(encoding="utf-8"), mod_first)

    def test_marker_owned_create_chart_only_files_upgrade_to_render_preview(self):
        """A previous #144 install is upgraded instead of being treated as done."""
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        toolsets, tools_dir = self._fixture(temporary)

        legacy_toolset = self.patcher.TOOLSET_INSERT_NEW.replace(
            '["create_chart", "render_preview"]', '["create_chart"]'
        )
        toolsets.write_text(
            toolsets.read_text(encoding="utf-8")
            .replace(self.patcher.TOOLSET_INSERT_OLD, legacy_toolset, 1)
            .replace(self.patcher.INCLUDES_OLD, self.patcher.INCLUDES_NEW, 1)
            .replace(self.patcher.CLI_INCLUDES_OLD, self.patcher.CLI_INCLUDES_NEW, 1),
            encoding="utf-8",
        )
        module_path = tools_dir / "frontend_tools.py"
        module_path.write_text(
            '"""Legacy create_chart-only frontend tool.\n\n'
            'Marker: vulpy-frontend-tools\n"""\n\n'
            'from tools.registry import registry\n\n'
            'registry.register(name="create_chart", toolset="frontend", schema={}, handler=lambda args: "{}")\n',
            encoding="utf-8",
        )

        result = self._run(toolsets, tools_dir)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("upgraded", result.stdout)
        self.assertIn('"tools": ["create_chart", "render_preview"],', toolsets.read_text(encoding="utf-8"))
        self.assertEqual(module_path.read_text(encoding="utf-8"), self.patcher.FRONTEND_TOOLS_MODULE)

        upgraded_toolsets = toolsets.read_text(encoding="utf-8")
        upgraded_module = module_path.read_text(encoding="utf-8")
        rerun = self._run(toolsets, tools_dir)
        self.assertEqual(rerun.returncode, 0, rerun.stderr + rerun.stdout)
        self.assertIn("already patched", rerun.stdout)
        self.assertIn("already present", rerun.stdout)
        self.assertEqual(toolsets.read_text(encoding="utf-8"), upgraded_toolsets)
        self.assertEqual(module_path.read_text(encoding="utf-8"), upgraded_module)

    def test_mutated_insertion_anchor_fails_loudly(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        toolsets, tools_dir = self._fixture(temporary)
        toolsets.write_text(
            toolsets.read_text(encoding="utf-8").replace(
                '    "hermes-api-server": {',
                '    "hermes-api-server-v2": {',
            ),
            encoding="utf-8",
        )
        result = self._run(toolsets, tools_dir)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("insertion point", result.stderr)
        self.assertIn("appears 0 times", result.stderr)

    def test_mutated_includes_anchor_fails_loudly(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        toolsets, tools_dir = self._fixture(temporary)
        toolsets.write_text(
            toolsets.read_text(encoding="utf-8").replace(
                "ha_list_entities",
                "ha_list_entities_renamed",
            ),
            encoding="utf-8",
        )
        result = self._run(toolsets, tools_dir)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("includes block", result.stderr)
        self.assertIn("appears 0 times", result.stderr)

    def test_mutated_cli_composite_anchor_fails_loudly(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        toolsets, tools_dir = self._fixture(temporary)
        toolsets.write_text(
            toolsets.read_text(encoding="utf-8").replace(
                '"Full interactive CLI toolset',
                '"Renamed interactive CLI toolset',
            ),
            encoding="utf-8",
        )
        result = self._run(toolsets, tools_dir)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("hermes-cli composite", result.stderr)
        self.assertIn("appears 0 times", result.stderr)

    def test_live_upstream_is_pristine_or_fully_patched(self):
        """Drift guard: the live image file must be either untouched by #144
        (pristine anchors intact) or fully patched (marker + all three edits).
        A half-patched live file means a rebuild would double-apply or the
        anchors have drifted from what the image carries."""
        if not UPSTREAM_TOOLSETS.is_file():
            self.skipTest("live toolsets.py not available")
        live = UPSTREAM_TOOLSETS.read_text(encoding="utf-8")
        if self.patcher.MARK in live:
            self.assertIn('    "frontend": {', live)
            self.assertEqual(live.count('"includes": ["frontend"]'), 2)
            self.assertIn('"tools": ["create_chart", "render_preview"],', live)
        else:
            self.assertEqual(live.count(self.patcher.CLI_INCLUDES_OLD), 1)

    def test_divergent_module_refused(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        toolsets, tools_dir = self._fixture(temporary)
        module_path = tools_dir / "frontend_tools.py"
        module_path.write_text("# operator-modified, no marker\n", encoding="utf-8")

        result = self._run(toolsets, tools_dir)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("refusing to overwrite", result.stderr)
        # The divergent file is untouched.
        self.assertEqual(module_path.read_text(encoding="utf-8"), "# operator-modified, no marker\n")

    def test_written_module_registers_and_handles(self):
        """Unit probe: the shipped module resolves against the registry shape."""
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        _, tools_dir = self._fixture(temporary)
        result = self._run(tools_dir.parent / "toolsets.py", tools_dir)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        module_path = tools_dir / "frontend_tools.py"

        # Stub tools.registry so the module imports in isolation (the image
        # provides the real one; the probe asserts registration + handler).
        class FakeRegistry:
            def __init__(self):
                self.entries = {}

            def register(self, name, toolset, schema, handler, **kwargs):
                self.entries[name] = {
                    "toolset": toolset,
                    "schema": schema,
                    "handler": handler,
                }

        fake = FakeRegistry()

        def tool_error(message, **extra):
            result = {"error": str(message)}
            result.update(extra)
            return json.dumps(result, ensure_ascii=False)

        stub_pkg = types.ModuleType("tools")
        stub_registry = types.ModuleType("tools.registry")
        setattr(stub_registry, "registry", fake)
        setattr(stub_registry, "tool_error", tool_error)
        sys.modules["tools"] = stub_pkg
        sys.modules["tools.registry"] = stub_registry
        try:
            spec = importlib.util.spec_from_file_location(
                "tools.frontend_tools", str(module_path)
            )
            assert spec is not None and spec.loader is not None
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        finally:
            sys.modules.pop("tools.frontend_tools", None)
            sys.modules.pop("tools", None)
            sys.modules.pop("tools.registry", None)

        entry = fake.entries.get("create_chart")
        self.assertIsNotNone(entry, "create_chart not registered")
        self.assertEqual(entry["toolset"], "frontend")
        schema = entry["schema"]
        self.assertEqual(schema["name"], "create_chart")
        self.assertIn("parameters", schema)
        self.assertEqual(schema["parameters"]["required"], ["chart_type", "title", "data"])
        self.assertEqual(
            schema["parameters"]["properties"]["chart_type"]["enum"],
            ["line", "bar", "pie", "area"],
        )

        handler = entry["handler"]
        # Valid request -> benign ack; NEVER echoes caller data.
        out = handler(
            {
                "chart_type": "line",
                "title": "Quarterly Revenue",
                "data": [{"label": "Jan", "value": 10}, {"label": "Feb", "value": 20}],
            }
        )
        payload = json.loads(out)
        self.assertEqual(payload, {"status": "rendered", "tool": "create_chart"})
        self.assertNotIn("Quarterly Revenue", out)
        self.assertNotIn("Jan", out)

        # Invalid shapes -> tool_error, still JSON, no crash.
        err_type = json.loads(handler({"chart_type": "donut", "title": "T", "data": [{"label": "a", "value": 1}]}))
        self.assertIn("chart_type must be one of", err_type["error"])
        err_empty = json.loads(handler({"chart_type": "bar", "title": "T", "data": []}))
        self.assertIn("non-empty array", err_empty["error"])
        err_shape = json.loads(handler({"chart_type": "bar", "title": "T", "data": [{"label": "a"}]}))
        self.assertIn("data[0]", err_shape["error"])
        err_title = json.loads(handler({"chart_type": "bar", "title": "  ", "data": [{"label": "a", "value": 1}]}))
        self.assertIn("title is required", err_title["error"])
        err_title_type = json.loads(handler({"chart_type": "bar", "title": 42, "data": [{"label": "a", "value": 1}]}))
        self.assertIn("title is required", err_title_type["error"])

        preview = fake.entries.get("render_preview")
        self.assertIsNotNone(preview, "render_preview not registered")
        self.assertEqual(preview["toolset"], "frontend")
        self.assertEqual(preview["schema"]["parameters"]["required"], ["type", "path"])
        self.assertEqual(preview["schema"]["parameters"]["properties"]["type"]["enum"], ["html", "svg", "image", "audio", "video"])
        preview_handler = preview["handler"]
        preview_path = "/tmp/private-preview.html"
        preview_out = preview_handler({"type": "html", "path": preview_path, "title": "Preview"})
        self.assertEqual(json.loads(preview_out), {"status": "rendered", "tool": "render_preview"})
        self.assertNotIn(preview_path, preview_out)
        self.assertIn("type must be one of", json.loads(preview_handler({"type": "pdf", "path": preview_path}))["error"])
        self.assertIn("absolute local path", json.loads(preview_handler({"type": "html", "path": "relative.html"}))["error"])
        self.assertIn("no longer than", json.loads(preview_handler({"type": "html", "path": preview_path, "title": "x" * 121}))["error"])


if __name__ == "__main__":
    unittest.main()

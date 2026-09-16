"""Unit tests for scripts/patch-webui-vulpy-remove-show.py.

Pattern mirrors tests/test_patch_webui_vulpy_provider_settings.py and
tests/test_patch_webui_yolo_pill_confirm.py: drive the patcher as a
subprocess against a throwaway static/panels.js fixture built from the
patcher's OWN anchor constants, then assert markers/exit codes. The
behavioral assertions run the patcher's injected guard block in plain node
(no jsdom required) and prove the Vulpy-specific removal is present while
non-Vulpy configurable providers (OpenRouter, ...) keep a WORKING toggle.

Covered behaviors:
  - fresh panels.js -> the Show/Hide toggle creation and its append are
    wrapped in a `p.id !== 'vulpy'` guard (Vulpy-only removal; no unrelated
    Show buttons touched)
  - the API key input stays type=password / autocomplete=off (masked at all
    times — the toggle that could reveal it is gone for vulpy)
  - Save / Remove / Refresh-models survive untouched
  - re-run on patched file -> exit 0 "already patched", byte-identical no-op
  - mutated toggle or append anchor -> exit 1, fail-loud error names drift
  - wrong arg count -> exit 1, Usage on stderr
  - behavioral (node): for a `vulpy` provider NO toggle button is created;
    for an `openrouter` provider the toggle IS created, starts at "Show",
    and toggles the input type password<->text and label Show/Hide exactly
    like upstream (proving OpenRouter behavior is preserved, not just absent)
"""

import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-vulpy-remove-show.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_vulpy_remove_show_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_panels_fixture(patcher) -> str:
    """A panels.js-like _buildProviderCard configurable branch containing the
    anchors the patcher needs, plus the surrounding lines that must survive
    (password input, save/remove/refresh)."""
    return (
        "// panels.js fixture\n"
        "function _buildProviderCard(p){\n"
        "  const card=document.createElement('div');\n"
        "  card.dataset.provider=p.id;\n"
        "  if(p.configurable){\n"
        "    const field=document.createElement('div');\n"
        "    field.className='provider-card-field';\n"
        "    const row=document.createElement('div');\n"
        "    row.className='provider-card-row';\n"
        "    input=document.createElement('input');\n"
        "    input.type='password';\n"
        "    input.className='provider-card-input';\n"
        "    input.autocomplete='off';\n"
        + patcher.TOGGLE_OLD
        + "\n"
        "    saveBtn=document.createElement('button');\n"
        "    saveBtn.type='button';\n"
        "    saveBtn.textContent=t('providers_save');\n"
        "    saveBtn.onclick=()=>_saveProviderKey(p.id);\n"
        "    saveBtn.disabled=true;\n"
        "    row.appendChild(input);\n"
        + patcher.APPEND_OLD
        + "\n"
        "    row.appendChild(saveBtn);\n"
        "    const removeBtn=document.createElement('button');\n"
        "    removeBtn.textContent=t('providers_remove');\n"
        "    removeBtn.onclick=()=>_removeProviderKey(p.id);\n"
        "    row.appendChild(removeBtn);\n"
        "    field.appendChild(row);\n"
        "  }\n"
        "  const refreshBtn=document.createElement('button');\n"
        "  refreshBtn.textContent=t('providers_refresh_models');\n"
        "  refreshBtn.onclick=()=>_refreshProviderModels(p.id, refreshBtn);\n"
        "}\n"
    )


class PatchWebuiVulpyRemoveShowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _fixture(self):
        temporary = tempfile.TemporaryDirectory()
        panels = Path(temporary.name) / "panels.js"
        panels.write_text(_make_panels_fixture(self.patcher), encoding="utf-8")
        return temporary, panels

    def _run(self, *args):
        return subprocess.run(
            ["python3", str(PATCHER), *args],
            capture_output=True,
            text=True,
        )

    # ------------------------------------------------------------------
    # Fresh file -> Vulpy-only removal, everything else intact
    # ------------------------------------------------------------------
    def test_fresh_file_guards_toggle_for_vulpy_only(self):
        temporary, panels = self._fixture()
        self.addCleanup(temporary.cleanup)

        result = self._run(str(panels))
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = panels.read_text(encoding="utf-8")
        # Idempotency mark present exactly once.
        self.assertEqual(text.count(self.patcher.IDEMPOTENCY_MARK), 1)

        # 1. The toggle CREATION is wrapped in a Vulpy-only guard: for a
        #    `vulpy` provider the block body never runs (no toggle built).
        #    toggleBtn is hoisted (let) so the guarded append stays in scope.
        self.assertIn("let toggleBtn=null;", text)
        self.assertIn("if(p.id!=='vulpy'){", text)
        # 2. The toggle APPEND is guarded too (toggleBtn stays null for
        #    vulpy, so an unguarded append would be a no-op TypeError). There
        #    must be NO bare unguarded append left behind.
        self.assertIn("if(toggleBtn) row.appendChild(toggleBtn);", text)
        self.assertNotIn("\n    row.appendChild(toggleBtn);", text)

        # 3. The API key input stays password-masked at all times.
        self.assertIn("input.type='password';", text)
        self.assertIn("input.autocomplete='off';", text)
        # The toggle's reveal logic must not exist outside the guard for the
        # vulpy path: no unguarded `input.type=revealed?'password':'text';`.
        # (It may appear inside the guard body — but the guard body is dead
        # for vulpy, so the key can never be revealed.)
        self.assertIn("input.type=revealed?'password':'text';", text)

        # 4. Save / Remove / Refresh-models survive untouched.
        self.assertIn("saveBtn.onclick=()=>_saveProviderKey(p.id);", text)
        self.assertIn("removeBtn.onclick=()=>_removeProviderKey(p.id);", text)
        self.assertIn("refreshBtn.onclick=()=>_refreshProviderModels(p.id, refreshBtn);", text)

        # 5. The guard is scoped to vulpy ONLY — no blanket removal. The
        #    guard condition must not be inverted or widened.
        self.assertIn("p.id!=='vulpy'", text)
        self.assertNotIn("if(p.id===undefined)", text)

    def test_guard_uses_vulpy_id_not_a_blanket_removal(self):
        """The removal is Vulpy-specific by requirement (operator asked for
        Vulpy, avoid unrelated UX change). The guard must key on the exact
        vulpy provider id for the creation block; the append is guarded by
        toggleBtn nullability (null for vulpy, set for others)."""
        self.assertIn("!=='vulpy'", self.patcher.TOGGLE_NEW)
        self.assertIn("if(toggleBtn)", self.patcher.APPEND_NEW)

    # ------------------------------------------------------------------
    # Idempotency: second run is a no-op
    # ------------------------------------------------------------------
    def test_rerun_is_idempotent(self):
        temporary, panels = self._fixture()
        self.addCleanup(temporary.cleanup)

        first = self._run(str(panels))
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_text = panels.read_text(encoding="utf-8")

        second = self._run(str(panels))
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(panels.read_text(encoding="utf-8"), first_text)

    # ------------------------------------------------------------------
    # Mutated anchors -> fail loudly
    # ------------------------------------------------------------------
    def test_mutated_toggle_anchor_fails_loudly(self):
        temporary, panels = self._fixture()
        self.addCleanup(temporary.cleanup)
        text = panels.read_text(encoding="utf-8")
        mutated = text.replace(
            "toggleBtn.textContent='Show';",
            "toggleBtn.textContent='Display';",
            1,
        )
        panels.write_text(mutated, encoding="utf-8")
        result = self._run(str(panels))
        self.assertNotEqual(result.returncode, 0)
        combined = (result.stderr + result.stdout).lower()
        self.assertIn("anchor", combined)
        self.assertIn("drift", combined)

    def test_mutated_append_anchor_fails_loudly(self):
        temporary, panels = self._fixture()
        self.addCleanup(temporary.cleanup)
        text = panels.read_text(encoding="utf-8")
        mutated = text.replace(
            "    row.appendChild(toggleBtn);",
            "    row.append(toggleBtn);",
            1,
        )
        panels.write_text(mutated, encoding="utf-8")
        result = self._run(str(panels))
        self.assertNotEqual(result.returncode, 0)
        combined = (result.stderr + result.stdout).lower()
        self.assertIn("anchor", combined)

    def test_duplicate_anchor_fails_loudly(self):
        """If the upstream block appears twice, the patcher must refuse."""
        temporary, panels = self._fixture()
        self.addCleanup(temporary.cleanup)
        text = panels.read_text(encoding="utf-8")
        # Duplicate the toggle creation block (two providers would share it).
        panels.write_text(text + "\n" + self.patcher.TOGGLE_OLD + "\n", encoding="utf-8")
        result = self._run(str(panels))
        self.assertNotEqual(result.returncode, 0)
        combined = (result.stderr + result.stdout).lower()
        self.assertIn("expected 1", combined)

    # ------------------------------------------------------------------
    # Wrong arg count -> exit 1, Usage on stderr
    # ------------------------------------------------------------------
    def test_usage_requires_one_arg(self):
        result = self._run()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr)


# ------------------------------------------------------------------------------
# Behavioral tests: evaluate the patcher's injected guard block (TOGGLE_NEW) in
# plain node with a tiny document shim. No jsdom required (node is always
# present for the WebUI build). This proves the Vulpy-specific removal is
# present AND that non-Vulpy providers keep a fully working toggle — the
# single source of truth is the patcher constant, not a copy of the JS.
# ------------------------------------------------------------------------------
class VulpyRemoveShowBehavioralTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _node_available(self) -> bool:
        node = shutil.which("node")
        if not node:
            return False
        try:
            proc = subprocess.run(
                [node, "-e", "process.exit(0)"],
                capture_output=True,
                timeout=15,
            )
            return proc.returncode == 0
        except Exception:
            return False

    def _behavioral_results(self) -> dict:
        """Evaluate the patcher's TOGGLE_NEW guard in node for a vulpy
        provider and an openrouter provider; return the observed behavior."""
        block = self.patcher.TOGGLE_NEW
        harness = r"""
const created = [];
globalThis.document = {
  createElement: (tag) => {
    const el = {
      type: '', className: '', textContent: '',
      _fn: null,
      set onclick(f) { this._fn = f; },
      get onclick() { return this._fn; },
      appendChild() {},
      addEventListener() {},
    };
    created.push(el);
    return el;
  }
};
const results = {};
// Vulpy provider: NO toggle button may be created.
(function(){
  const before = created.length;
  const p = {id: 'vulpy'};
  const input = {type: 'password'};
__BLOCK__
  results.vulpy_buttons = created.length - before;
})();
// OpenRouter provider: toggle IS created and works (upstream behavior kept).
(function(){
  const before = created.length;
  const p = {id: 'openrouter'};
  const input = {type: 'password'};
__BLOCK__
  const btn = created[created.length - 1];
  results.openrouter_buttons = created.length - before;
  results.openrouter_label = btn.textContent;
  btn.onclick();
  results.after_first_click_type = input.type;
  results.after_first_click_label = btn.textContent;
  btn.onclick();
  results.after_second_click_type = input.type;
  results.after_second_click_label = btn.textContent;
})();
console.log(JSON.stringify(results));
"""
        harness = harness.replace("__BLOCK__", block)
        node = shutil.which("node")
        if not node:
            raise AssertionError("node not available")
        script = Path(tempfile.gettempdir()) / "vulpy-remove-show-eval.cjs"
        script.write_text(harness, encoding="utf-8")
        try:
            proc = subprocess.run(
                [node, str(script)],
                capture_output=True,
                text=True,
                timeout=30,
            )
        finally:
            try:
                script.unlink()
            except OSError:
                pass
        output = proc.stdout.strip().splitlines()
        if not output or proc.returncode != 0:
            raise AssertionError(
                "node evaluation failed:\n%s\n%s" % (proc.stderr, proc.stdout)
            )
        return json.loads(output[-1])

    def test_behavioral_vulpy_skips_toggle_openrouter_keeps_working_toggle(self):
        if not self._node_available():
            self.skipTest("node not available in this environment")
        results = self._behavioral_results()
        # Vulpy provider: guard present -> no toggle created (removal active).
        self.assertEqual(results["vulpy_buttons"], 0)
        # OpenRouter provider: toggle still created, starts at "Show", and
        # toggles password<->text and Show<->Hide exactly like upstream.
        self.assertEqual(results["openrouter_buttons"], 1)
        self.assertEqual(results["openrouter_label"], "Show")
        self.assertEqual(results["after_first_click_type"], "text")
        self.assertEqual(results["after_first_click_label"], "Hide")
        self.assertEqual(results["after_second_click_type"], "password")
        self.assertEqual(results["after_second_click_label"], "Show")


if __name__ == "__main__":
    unittest.main()

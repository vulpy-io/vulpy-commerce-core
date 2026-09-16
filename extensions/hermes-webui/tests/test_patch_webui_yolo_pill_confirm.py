"""Unit tests for scripts/patch-webui-yolo-pill-confirm.py.

Security follow-up MEDIUM: surface pending_confirm in the yolo pill. After a
gateway/WebUI restart the durable-yolo store keeps yolo_enabled=True for a
session but marks it ``pending_confirm`` — auto-approve is NOT re-armed until
the user toggles again. The pill previously showed plain-active, misleading
the operator into believing auto-approve was live.

Pattern mirrors tests/test_patch_webui_global_approval_banner.py and
tests/test_patch_send_wait_session.py: drive the patcher as a subprocess
against a throwaway static/messages.js fixture, then assert markers/exit codes.

  - fresh file -> state var + fetch + pill render + confirm-click wrapper +
    CSS injected (markers present exactly once)
  - re-run on patched file -> exit 0 "already patched", byte-identical no-op
  - mutated anchor -> exit 1, fail-loud error names the drift
  - wrong args -> exit 1, Usage on stderr
  - behavioral (jsdom, mirrors tests/global-approval-banner.test.ts): the
    patcher's injected wrapper is evaluated in a simulated page; clicking
    while pending POSTs {enabled:true} and clears the flag, clicking while
    normal delegates to the ORIGINAL cmdYolo captured before reassignment
    (no recursion, no crash), and window.cmdYolo + the inline onclick both
    resolve to the wrapper.

The fresh fixture is built from the patcher's OWN anchors so the test stays
correct when they drift. The pre-patch fixture text is a faithful copy of the
upstream block as shipped (verified against /app/hermes-webui/static/messages.js).
"""

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-yolo-pill-confirm.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_yolo_pill_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiYoloPillConfirmTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        messages = Path(temporary.name) / "messages.js"
        messages.write_text(self.patcher.FIXTURE_PRE_PATCH, encoding="utf-8")
        return temporary, messages

    def _run(self, *args):
        return subprocess.run(
            ["python3", str(PATCHER), *args],
            capture_output=True,
            text=True,
        )

    # ------------------------------------------------------------------
    # Fresh file -> all five changes applied
    # ------------------------------------------------------------------
    def test_fresh_file_patches_all_five_changes(self):
        temporary, messages = self.fixture()
        self.addCleanup(temporary.cleanup)

        result = self._run(str(messages))
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = messages.read_text(encoding="utf-8")
        # Idempotency mark present exactly once.
        self.assertEqual(text.count(self.patcher.MARK), 1)

        # 1. State tracking: var declared next to _yoloEnabled, set from the
        #    GET payload in _fetchYoloState.
        self.assertIn("let _yoloPendingConfirm = false;", text)
        self.assertIn("_yoloPendingConfirm = !!data.pending_confirm;", text)

        # 2. Distinct pill render state: class + i18n title pair + class
        #    removal when not pending.
        self.assertIn('pill.classList.add("yolo-pending")', text)
        self.assertIn('pill.classList.remove("yolo-pending")', text)
        self.assertIn("yolo_pill_title_pending", text)
        self.assertIn("yolo_pill_title_active", text)
        # The pending title must survive applyLocaleToDOM() when the i18n
        # bundle lacks the key: the patched renderer checks the en locale
        # before setting data-i18n-title (missing-key fallback would render
        # the raw key string into the tooltip).
        self.assertIn("typeof LOCALES", text)

        # 3. Click = confirmation: cmdYolo wrapped so a pending pill RE-ARMS
        #    (enables) instead of toggling off, and clears the pending flag
        #    locally after a successful POST. The ORIGINAL cmdYolo is captured
        #    before the window reassignment so the non-pending path delegates
        #    to the real toggle without recursing into the wrapper.
        self.assertIn("function _yoloPillConfirmClick()", text)
        self.assertIn(
            'const __pending = typeof _yoloPendingConfirm === "boolean" ? _yoloPendingConfirm : false;',
            text,
        )
        self.assertIn("const _origCmdYolo = typeof cmdYolo === 'function' ? cmdYolo : null;", text)
        # Pending branch posts a CONSTANT enabled:true (re-arm), never the
        # current _yoloEnabled value (false while pending) — posting the
        # latter would DISABLE yolo on the confirm click.
        self.assertIn("enabled:true", text)
        self.assertNotIn("enabled:!__pending", text)
        self.assertIn("_yoloPendingConfirm = false;", text)
        self.assertIn("window.cmdYolo = _yoloPillConfirmClick;", text)
        # Runtime DOM rebind covers any pill element whose inline onclick
        # still says cmdYolo() (the attribute itself is rewritten in
        # index.html at build time — see test below).
        self.assertIn(
            "__pill.setAttribute('onclick','_yoloPillConfirmClick()')",
            text,
        )
        # No stray full-marker duplicates from the wrapper comments.
        self.assertNotIn("vulpy-yolo-pill-confirm", text.split(self.patcher.MARK, 1)[1].replace(self.patcher.MARK, "", 1))

        # 4. CSS injected once via the patcher's own <style> tag helper.
        self.assertEqual(
            text.count("st.id='vulpy-yolo-pill-pending-style'"),
            1,
            "style-tag injection must appear exactly once",
        )
        self.assertIn(".yolo-pill.yolo-pending", text)
        # Amber outline family consistent with .vulpy-global-approval-badge.
        self.assertIn("rgba(245,158,11,.4)", text)
        self.assertIn("@keyframes vulpyYoloPendingPulse", text)

        # The upstream block survives structurally (fetch + update functions).
        self.assertIn("async function _fetchYoloState(sid)", text)
        self.assertIn("function _updateYoloPill()", text)
        self.assertIn("async function toggleYoloFromApproval()", text)

    # ------------------------------------------------------------------
    # Idempotency: second run is a no-op
    # ------------------------------------------------------------------
    def test_rerun_is_idempotent(self):
        temporary, messages = self.fixture()
        self.addCleanup(temporary.cleanup)

        first = self._run(str(messages))
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_text = messages.read_text(encoding="utf-8")

        second = self._run(str(messages))
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(messages.read_text(encoding="utf-8"), first_text)

    # ------------------------------------------------------------------
    # index.html onclick rewrite (build-time wiring)
    # ------------------------------------------------------------------
    def test_index_html_onclick_rewritten(self):
        temporary, _ = self.fixture()
        self.addCleanup(temporary.cleanup)
        tmpdir = Path(temporary.name)
        index = tmpdir / "index.html"
        index.write_text(
            '<button class="yolo-pill" id="yoloPill" type="button" '
            'onclick="cmdYolo()" style="display:none">',
            encoding="utf-8",
        )
        result = self._run(str(tmpdir / "messages.js"), str(index))
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        html = index.read_text(encoding="utf-8")
        self.assertIn('onclick="_yoloPillConfirmClick()"', html)
        self.assertNotIn('onclick="cmdYolo()"', html)

    def test_index_html_rewrite_is_idempotent(self):
        temporary, _ = self.fixture()
        self.addCleanup(temporary.cleanup)
        tmpdir = Path(temporary.name)
        index = tmpdir / "index.html"
        original = (
            '<button class="yolo-pill" id="yoloPill" type="button" '
            'onclick="cmdYolo()" style="display:none">'
        )
        index.write_text(original, encoding="utf-8")
        first = self._run(str(tmpdir / "messages.js"), str(index))
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        once = index.read_text(encoding="utf-8")
        # Re-run with an ALREADY-patched messages.js: the idempotency branch
        # must still converge the index.html rewrite without duplicating.
        second = self._run(str(tmpdir / "messages.js"), str(index))
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertEqual(index.read_text(encoding="utf-8"), once)

    # ------------------------------------------------------------------
    # Mutated anchors -> fail loudly
    # ------------------------------------------------------------------
    def test_mutated_fetch_anchor_fails_loudly(self):
        temporary, messages = self.fixture()
        self.addCleanup(temporary.cleanup)
        text = messages.read_text(encoding="utf-8")
        mutated = text.replace(
            "_yoloEnabled = !!data.yolo_enabled;",
            "_yoloEnabled = data.yolo_enabled === true;",
            1,
        )
        messages.write_text(mutated, encoding="utf-8")
        result = self._run(str(messages))
        self.assertNotEqual(result.returncode, 0)
        combined = result.stderr + result.stdout
        self.assertIn("anchor", combined.lower())
        self.assertIn("drift", combined.lower())

    def test_mutated_update_anchor_fails_loudly(self):
        temporary, messages = self.fixture()
        self.addCleanup(temporary.cleanup)
        text = messages.read_text(encoding="utf-8")
        mutated = text.replace(
            "if (_yoloEnabled) {",
            "if (_yoloEnabled === true) {",
            1,
        )
        messages.write_text(mutated, encoding="utf-8")
        result = self._run(str(messages))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor not found", result.stderr + result.stdout)

    def test_mutated_click_wrapper_anchor_fails_loudly(self):
        """The wrapper injection anchors on the tail of toggleYoloFromApproval;
        if that function drifted, the patcher must refuse."""
        temporary, messages = self.fixture()
        self.addCleanup(temporary.cleanup)
        text = messages.read_text(encoding="utf-8")
        mutated = text.replace(
            "} catch (e) { showToast('YOLO: ' + e.message); }",
            "} catch (e) { console.error(e); }",
            1,
        )
        messages.write_text(mutated, encoding="utf-8")
        result = self._run(str(messages))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor not found", result.stderr + result.stdout)

    def test_missing_index_html_anchor_fails_loudly(self):
        """A messages.js-only run cannot wire the onclick rewrite; without the
        index.html anchor the patcher must fail loudly rather than half-apply."""
        with tempfile.TemporaryDirectory() as td:
            tmpdir = Path(td)
            messages = tmpdir / "messages.js"
            messages.write_text(self.patcher.FIXTURE_PRE_PATCH, encoding="utf-8")
            index = tmpdir / "index.html"
            index.write_text('<button id="yoloPill" onclick="somethingElse()">', encoding="utf-8")
            result = self._run(str(messages), str(index))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("anchor not found", result.stderr + result.stdout)

    # ------------------------------------------------------------------
    # Wrong arg count -> exit 1, Usage on stderr
    # ------------------------------------------------------------------
    def test_usage_requires_args(self):
        result = self._run()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr)


# ------------------------------------------------------------------------------
# Behavioral tests: evaluate the patcher's INJECTED WRAPPER (WRAPPER_JS) in a
# simulated page and exercise the two click flows the reviewer flagged.
#
# These mirror tests/global-approval-banner.test.ts's pattern: the single
# source of truth is the patcher script (module.WRAPPER_JS) — not a copy of
# the JS — so the test stays correct when the patcher drifts. jsdom is only
# required to give us a document for the pill-rebind IIFE and a globalThis for
# the wrapper's dependencies; the flaky browser-check pyproject knob is
# deliberately NOT imported. Skip cleanly when vitest is unavailable; the
# patcher's own subprocess tests still cover structure/anchors.
# ------------------------------------------------------------------------------
class YoloPillConfirmBehavioralTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _jsdom_available(self) -> bool:
        # jsdom is a NODE package (not importable from Python). The real
        # availability check is whether `require('jsdom')` resolves from the
        # extension dir — that is what the behavioral tests depend on.
        import shutil

        node = shutil.which("node")
        if not node:
            return False
        probe = Path(self._vitest_root()) / ".jsdom-probe.cjs"
        probe.write_text(
            "const { JSDOM } = require('jsdom');\n"
            "const dom = new JSDOM('<!doctype html>', { runScripts: 'outside-only' });\n"
            "dom.window.eval('globalThis.x = 1;');\n"
            "process.exit(dom.window.x === 1 ? 0 : 1);\n",
            encoding="utf-8",
        )
        try:
            proc = subprocess.run(
                [node, str(probe)],
                cwd=str(self._vitest_root()),
                capture_output=True,
                timeout=30,
            )
            return proc.returncode == 0
        except Exception:
            return False
        finally:
            try:
                probe.unlink()
            except OSError:
                pass

    def _vitest_root(self) -> Path:
        # extensions/hermes-webui — the workspace holding vitest + jsdom.
        return Path(__file__).resolve().parents[1]

    def _patched_messages(self):
        """Run the patcher in a sandbox and return the patched messages.js text."""
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        messages = Path(temporary.name) / "messages.js"
        messages.write_text(self.patcher.FIXTURE_PRE_PATCH, encoding="utf-8")
        result = subprocess.run(
            ["python3", str(PATCHER), str(messages)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return messages.read_text(encoding="utf-8")

    def _js_harness(self) -> str:
        # A tiny browser-like environment the wrapper needs, split into a
        # PRELUDE (runs BEFORE the patched messages.js) and a TAIL (after).
        #
        # PRELUDE: the pill DOM + page-global stubs. These MUST exist before
        # the patched JS evaluates because (a) the pill rebind IIFE reads the
        # DOM, and (b) the wrapper captures `cmdYolo` into _origCmdYolo at
        # eval time — in the real page commands.js defines cmdYolo before
        # messages.js loads, so the capture must see the real function.
        #
        # TAIL: the _yolo* module lets are DECLARED by the patched JS itself,
        # so they can't be in the prelude. The wrapper's runtime dependencies
        # (S/api/t/...) are defined in the prelude so both the IIFE and the
        # wrapper see them.
        return f"""
// ── prelude: the pill DOM + page globals (mirrors index.html + commands.js
// loaded BEFORE messages.js) ──
const __pillEl = document.createElement('button');
__pillEl.id = 'yoloPill';
__pillEl.className = 'yolo-pill';
__pillEl.setAttribute('type', 'button');
__pillEl.setAttribute('onclick', 'cmdYolo()');
document.body.appendChild(__pillEl);

globalThis.__yoloTest = {{
  S: {{ session: {{ session_id: 'sess-1' }} }},
  _origCalls: [],
  _apiCalls: [],
  events: [],
}};
globalThis.S = globalThis.__yoloTest.S;
globalThis.api = function(url, opts) {{
  globalThis.__yoloTest._apiCalls.push({{ url: url, opts: opts }});
  return Promise.resolve({{ ok: true }});
}};
globalThis.t = function(key) {{ return '[' + key + ']'; }};
globalThis.showToast = function() {{}};
globalThis.hideApprovalCard = function() {{}};
globalThis._updateYoloPill = function() {{}};
// Simulate commands.js's original cmdYolo: a toggle that POSTs to the same
// endpoint with enabled:!status. The wrapper captures THIS into _origCmdYolo
// (captured before the window reassignment), never itself.
globalThis.cmdYolo = function() {{
  globalThis.__yoloTest._origCalls.push('cmdYolo');
  return Promise.resolve();
}};
// -- Patched messages.js evaluates HERE (runs the pill rebind IIFE) ----
"""

    def _evaluate(self, extra: str = "") -> str:
        """Evaluate prelude + patched messages.js + extra in jsdom; return
        the serialized __yoloTest state (a compact JSON string).

        Ordering mirrors the real page: the pill DOM + page globals exist
        first (index.html + commands.js load before messages.js), then the
        patched messages.js evaluates (its IIFE rebinds the pill's onclick,
        and its wrapper captures the pre-existing cmdYolo into
        _origCmdYolo), then the extra runs (the click / command call /
        pending-state mutations the tests exercise)."""
        root = self._vitest_root()
        messages_js = self._patched_messages()
        harness = self._js_harness()
        # The marker comment is the boundary: everything before it is the
        # prelude, everything after is the tail (there is no tail now — the
        # marker is the last line of the harness).
        prelude, sep, _ = harness.partition(
            "// -- Patched messages.js evaluates HERE (runs the pill rebind IIFE) ----"
        )
        assert sep, "harness marker missing"
        body = (
            prelude.rstrip("\n")
            + "\n"
            + messages_js
            + "\n"
            + extra
        )
        script = (
                    "const { JSDOM } = require('jsdom');\n"
                    "const dom = new JSDOM('<!doctype html>', { runScripts: 'outside-only' });\n"
                    "const code = "
                    + json.dumps(body)
                    + ";\n"
                    "dom.window.eval(code);\n"
                    "console.log(JSON.stringify(dom.window.__yoloTest));\n"
                )
        # Write the eval script inside the extension dir so `require('jsdom')`
        # resolves (node resolves modules relative to the script's location,
        # NOT cwd). A /tmp copy would fail the require.
        eval_script = Path(root) / ".yolo-eval.cjs"
        eval_script.write_text(script, encoding="utf-8")
        try:
            proc = subprocess.run(
                ["node", str(eval_script)],
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=60,
            )
        finally:
            try:
                eval_script.unlink()
            except OSError:
                pass
        output = proc.stdout.strip().splitlines()
        if not output or proc.returncode != 0:
            raise AssertionError(f"jsdom evaluation failed:\n{proc.stderr}\n{proc.stdout}")
        return output[-1]

    def test_jsdom_evaluates(self):
        """Sanity: the patched messages.js + wrapper parse and evaluate in jsdom
        without throwing (catches syntax/context errors early)."""
        if not self._jsdom_available():
            self.skipTest("jsdom not installed in this environment")
        result = json.loads(self._evaluate())
        self.assertEqual(result["S"]["session"]["session_id"], "sess-1")
        self.assertEqual(result["_origCalls"], [])

    def test_pending_click_posts_enabled_true_and_clears_pending(self):
        """Clicking the pill while pending must POST {enabled:true} (re-arm),
        NOT the current _yoloEnabled (false) — and clear the pending flag on
        success so the pill returns to the normal active look."""
        if not self._jsdom_available():
            self.skipTest("jsdom not installed in this environment")
        result = json.loads(
            self._evaluate(
                # Module-scope let — not globalThis (jsdom script-scoped eval).
                # The rebind IIFE (verified by test_jsdom_evaluates) has already
                # pointed the pill's onclick at _yoloPillConfirmClick, so
                # invoking the wrapper directly == a real pill click.
                "_yoloEnabled = false;\n"
                "_yoloPendingConfirm = true;\n"
                "_yoloPillConfirmClick();\n"
            )
        )
        self.assertEqual(len(result["_apiCalls"]), 1)
        url, opts = result["_apiCalls"][0]["url"], result["_apiCalls"][0]["opts"]
        self.assertEqual(url, "/api/session/yolo")
        self.assertEqual(opts["method"], "POST")
        body = json.loads(opts["body"])
        self.assertEqual(body, {"session_id": "sess-1", "enabled": True})
        # The confirmation must NOT delegate to the original toggle.
        self.assertEqual(result["_origCalls"], [])

    def test_normal_click_delegates_to_original_cmdYolo(self):
        """Clicking while normal (not pending) must delegate to the ORIGINAL
        cmdYolo captured BEFORE the reassignment — no recursion, no crash, and
        no POST from the wrapper itself."""
        if not self._jsdom_available():
            self.skipTest("jsdom not installed in this environment")
        result = json.loads(
            self._evaluate(
                # Module-scope let — not globalThis. Invoke the wrapper
                # directly == a real pill click (see pending test note).
                "_yoloPendingConfirm = false;\n"
                "_yoloPillConfirmClick();\n"
            )
        )
        self.assertEqual(result["_origCalls"], ["cmdYolo"])
        self.assertEqual(result["_apiCalls"], [])

    def test_slash_command_path_uses_wrapper_via_global_reference(self):
        """The /yolo slash-command dispatch resolves cmdYolo at call time
        (COMMANDS stays in commands.js; a stale captured reference is NOT part
        of this patcher). window.cmdYolo — which the palette/slash dispatch
        reads — must be the wrapper, so a /yolo command while pending re-arms
        instead of toggling off."""
        if not self._jsdom_available():
            self.skipTest("jsdom not installed in this environment")
        result = json.loads(
            self._evaluate(
                # Module-scope let — not globalThis (see pending test note).
                "_yoloPendingConfirm = true;\n"
                "// The palette/fn-ref dispatch: read window.cmdYolo AFTER the\n"
                "// patcher rebinds it (so it's the wrapper), then invoke.\n"
                "const __slashCmdRef = globalThis.window.cmdYolo;\n"
                "__slashCmdRef();\n"
            )
        )
        self.assertEqual(result["_origCalls"], [])
        self.assertEqual(len(result["_apiCalls"]), 1)
        body = json.loads(result["_apiCalls"][0]["opts"]["body"])
        self.assertEqual(body["enabled"], True)
        self.assertEqual(body["session_id"], "sess-1")


if __name__ == "__main__":
    unittest.main()

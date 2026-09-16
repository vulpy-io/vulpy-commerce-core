"""Unit tests for scripts/patch-approval-yolo-durable.py.

This patcher touches three files (gateway api_server.py, webui
runner_client.py, webui routes.py). We drive it as a subprocess against
byte-copies of the LIVE files when available (catches anchor drift), falling
back to synthetic fixtures derived from the patcher's own anchors otherwise.

Coverage:
  - fresh copies -> markers injected (1/1/4) + patched files still compile
  - re-run on patched copies -> exit 0, no double-apply (idempotent)
  - mutated anchor -> exit 1, fail-loud error names the missing anchor
  - run-start binding carries the session override into every new run
    (cross-message persistence) + reapply pushes the override, not just a
    live run
"""

import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-approval-yolo-durable.py"

LIVE_FILES = {
    "api_server.py": pathlib.Path("/app/hermes-agent/gateway/platforms/api_server.py"),
    "runner_client.py": pathlib.Path("/app/hermes-webui/api/runner_client.py"),
    "routes.py": pathlib.Path("/app/hermes-webui/api/routes.py"),
    "server.py": pathlib.Path("/app/hermes-webui/server.py"),
}

EXPECTED_MARKERS = {
    "api_server.py": 1,
    "runner_client.py": 1,
    "routes.py": 4,
    "server.py": 1,
}


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_yolo_durable_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchApprovalYoloDurableTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _snapshot_live_files(self, tmpdir: pathlib.Path) -> dict[str, pathlib.Path]:
        """Copy the live files (if present) into tmpdir; skip missing ones."""
        paths = {}
        for name, live in LIVE_FILES.items():
            if live.exists():
                dest = tmpdir / name
                dest.write_bytes(live.read_bytes())
                paths[name] = dest
        return paths

    def _run(self, *args):
        return subprocess.run(
            [sys.executable, str(PATCHER), *args],
            capture_output=True,
            text=True,
        )

    def _paths_arglist(self, paths: dict[str, pathlib.Path]) -> list[str]:
        return [
            str(paths.get(n, pathlib.Path("/dev/null")))
            for n in ("api_server.py", "runner_client.py", "routes.py", "server.py")
        ]

    def test_live_copies_patch_cleanly_and_compile(self):
        """Real files must patch without anchor drift and still compile."""
        with tempfile.TemporaryDirectory() as td:
            tmpdir = pathlib.Path(td)
            paths = self._snapshot_live_files(tmpdir)
            if len(paths) != 4:
                self.skipTest("live webui/gateway files not present in this env")
            result = self._run(*self._paths_arglist(paths))
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            for name in EXPECTED_MARKERS:
                text = paths[name].read_text(encoding="utf-8")
                self.assertIn("yolo-durable", text, name)
            # Compile check on the patched python files.
            for name in EXPECTED_MARKERS:
                subprocess.run(
                    [sys.executable, "-m", "py_compile", str(paths[name])],
                    check=True,
                )

    def test_rerun_is_idempotent(self):
        with tempfile.TemporaryDirectory() as td:
            tmpdir = pathlib.Path(td)
            paths = self._snapshot_live_files(tmpdir)
            if len(paths) != 4:
                self.skipTest("live webui/gateway files not present in this env")
            first = self._run(*self._paths_arglist(paths))
            self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
            markers_after_first = {
                name: paths[name].read_text(encoding="utf-8").count("yolo-durable")
                for name in EXPECTED_MARKERS
            }
            second = self._run(*self._paths_arglist(paths))
            self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
            markers_after_second = {
                name: paths[name].read_text(encoding="utf-8").count("yolo-durable")
                for name in EXPECTED_MARKERS
            }
            self.assertEqual(markers_after_first, markers_after_second)
            # Sanity: the expected marker counts.
            self.assertEqual(markers_after_first, EXPECTED_MARKERS)

    def test_fail_loud_on_mutated_anchor(self):
        with tempfile.TemporaryDirectory() as td:
            tmpdir = pathlib.Path(td)
            # Build a PRISTINE runner_client from the patcher's OWN anchor so
            # the marker is absent and the patcher actually attempts to apply.
            # (Snapshoting the live file here was vacuous once the image
            # contained the yolo-durable edits — a live runner_client is
            # already patched, so the patcher idempotently skips it and the
            # mutated anchor never fails loud. Same lesson as the
            # frontend-tools drift test.)
            old_anchor = self.patcher.RUNNER_PATCHES[0]["old"]
            pristine = (
                "import urllib.parse\n"
                "from typing import Any\n\n"
                "class RunnerClient:\n"
                + old_anchor
                + "\n"
            )
            runner = tmpdir / "runner_client.py"
            runner.write_text(pristine, encoding="utf-8")
            self.assertNotIn("yolo-durable", pristine)
            # Mutate the respond_approval anchor so apply fails loud.
            mutated = pristine.replace(
                "def respond_approval(self, run_id: str, approval_id: str, choice: str) -> dict[str, Any]:",
                "def respond_approval(self, run_id: str, approval_id: str, choice: str, extra: bool) -> dict[str, Any]:",
                1,
            )
            self.assertNotEqual(mutated, pristine, "anchor mutation should apply")
            runner.write_text(mutated, encoding="utf-8")
            # Other files: live copies (already patched -> idempotent skip is
            # fine; they only need to exist so the patcher sees all four).
            for name in ("api_server.py", "routes.py", "server.py"):
                live = LIVE_FILES[name]
                if live.exists():
                    (tmpdir / name).write_bytes(live.read_bytes())
            result = self._run(
                str(tmpdir / "api_server.py"),
                str(runner),
                str(tmpdir / "routes.py"),
                str(tmpdir / "server.py"),
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("anchor not found", result.stderr)
            self.assertIn("runner_client.py", result.stderr)

    def test_durable_store_helpers_present(self):
        """The injected routes helpers must exist and be wired."""
        module = _load_patcher_module()
        helpers = module.ROUTES_STORE_HELPERS
        for fn in (
            "def _gateway_yolo_store_path(",
            "def reapply_persisted_yolo(",
            "def _is_gateway_yolo_enabled(",
            "def set_gateway_yolo_enabled(",
        ):
            self.assertIn(fn, helpers)
        # The marker must be a Python comment after substitution.
        self.assertTrue(helpers.startswith("#"))

    def test_run_start_seed_carries_session_override(self):
        """The API patch must seed EVERY new run from the session override.

        Regression for cross-message persistence: approval is enforced keyed
        by the run's approval_session_key (run_id) which is fresh per message.
        The patch must (a) init self._session_yolo_override, (b) record the
        override in POST /v1/yolo, and (c) call enable_session_yolo(run_id) at
        run-start binding when the run's sid is overridden — so run N+1 in the
        same session is auto-approved.
        """
        module = _load_patcher_module()
        # (a) init map exists in the patched source.
        init = api_patch_text(module, "init per-session yolo override map")
        self.assertIn("self._session_yolo_override: Dict[str, bool] = {}", init)
        # (b) handler records the override.
        handler = api_patch_text(module, "add _handle_yolo_set + _handle_yolo_get handlers")
        self.assertIn("self._session_yolo_override[override_sid] = True", handler)
        self.assertIn("self._session_yolo_override.pop(override_sid, None)", handler)
        # (c) run-start binding seeds the new run.
        seed = api_patch_text(module, "seed new runs with the session yolo override")
        self.assertIn("self._session_yolo_override.get(session_id)", seed)
        self.assertIn("enable_session_yolo(run_id)", seed)
        # Enable/disable semantics: disable clears the override so future runs
        # stop auto-approving (the handler resolves the sid from the run too).
        self.assertIn("override_sid = str((self._run_statuses.get(run_id) or {}).get", handler)

    def test_reapply_audits_and_marks_pending_not_silent_rearm(self):
        """HIGH-1: boot reapply must NOT silently re-arm persisted YOLO.

        After a gateway/agent restart the in-memory override is gone. The
        reapply now audits each enabled session and marks it
        pending_confirm instead of calling set_session_yolo_override/set_run_yolo
        (which would auto-approve without a fresh user confirmation).
        """
        module = _load_patcher_module()
        helpers = module.ROUTES_STORE_HELPERS
        # The old silent re-arm calls are GONE from reapply.
        self.assertNotIn("_cl.set_session_yolo_override(sid, True)", helpers)
        self.assertNotIn("_cl.set_run_yolo(run_id, True)", helpers)
        # Instead reapply audits the live gateway state and marks pending.
        self.assertIn('rec["pending_confirm"] = True', helpers)
        self.assertIn('rec["pending_confirm"] = False', helpers)
        self.assertIn("get_run_yolo(sid)", helpers)
        # The v2 store schema carries the pending marker per session.
        self.assertIn('"version": 2', helpers)
        self.assertIn('"pending_confirm"', helpers)
        self.assertIn('def _gateway_yolo_pending_confirm(', helpers)
        # A user toggle clears pending (a toggle IS the confirmation).
        self.assertIn('"pending_confirm": False', helpers)
        # v1 store normalization: legacy enabled sid -> pending_confirm=True.
        self.assertIn('"pending_confirm": v', helpers)
        # the POST /v1/yolo relay still records the override + live-run apply.
        post = module.YOLO_POST_NEW
        self.assertIn("_cl.set_session_yolo_override(sid, enabled)", post)
        self.assertIn("_cl.set_run_yolo(_run_id, enabled)", post)

    def test_yolo_handlers_validate_safe_ids(self):
        """Item 5: _handle_yolo_set/_get reject unsafe session/run ids."""
        module = _load_patcher_module()
        handler = api_patch_text(module, "add _handle_yolo_set + _handle_yolo_get handlers")
        helper = api_patch_text(module, "module-level _is_safe_yolo_id helper")
        # handler rejects bad ids
        self.assertIn("if not _is_safe_yolo_id(session_id) or not _is_safe_yolo_id(run_id):", handler)
        self.assertIn('code="invalid_target"', handler)
        self.assertIn('if not _is_safe_yolo_id(session_id):', handler)
        self.assertIn('code="invalid_session_id"', handler)
        # helper exists at module level and only accepts [A-Za-z0-9_-]
        self.assertIn("def _is_safe_yolo_id(value: str) -> bool:", helper)
        self.assertIn(r'fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", value)', helper)

    def test_webui_relay_caps_and_strips_deny_reason(self):
        """HIGH-2: every layer caps+strips the deny reason."""
        module = _load_patcher_module()
        # runner_client respond_approval
        runner = module.RUNNER_PATCHES[0]["new"]
        self.assertIn("choice == \"deny\" and reason", runner)
        self.assertIn("[:500]", runner)
        self.assertIn("' '.join(str(reason).split())", runner)
        # gateway _handle_run_approval relay
        relay = api_patch_text(module, "_handle_run_approval: thread body.reason into resolve_gateway_approval")
        self.assertIn("deny_reason = str(body.get('reason') or '').strip()", relay)
        self.assertIn("deny_reason = ' '.join(deny_reason.split())[:500]", relay)
        self.assertIn("reason=deny_reason or None", relay)
        # routes respond relay
        self.assertIn("deny_reason", module.RESPOND_NEW)
        self.assertIn("[:500]", module.RESPOND_NEW)

    def test_webui_excludes_subagent_children_from_yolo(self):
        """MEDIUM-3: delegated subagent child sids are excluded from yolo."""
        module = _load_patcher_module()
        post = module.YOLO_POST_NEW
        self.assertIn("_is_subagent_child_session_id(sid)", post)
        self.assertIn("Cannot toggle YOLO on a delegated subagent session", post)
        helpers = module.ROUTES_STORE_HELPERS
        self.assertIn("if _is_subagent_child_session_id(sid):", helpers)
        # The gateway fan-out exact-matches session_id (min bar for MEDIUM-3).
        handler = api_patch_text(module, "add _handle_yolo_set + _handle_yolo_get handlers")
        self.assertIn('str(status.get("session_id") or "") == session_id', handler)

    def test_store_write_is_no_follow_and_0600(self):
        """Item 6: approval_mode.json write uses O_NOFOLLOW + mode 0o600."""
        module = _load_patcher_module()
        helpers = module.ROUTES_STORE_HELPERS
        self.assertIn("tempfile as _tempfile", helpers)
        self.assertIn("mkstemp(prefix=\"", helpers)
        self.assertIn("_os.chmod(tmp, 0o600)", helpers)
        self.assertIn("_os.fsync(f.fileno())", helpers)
        self.assertIn("_os.replace(tmp, path)", helpers)
        # symlink at the final path is refused/removed before replace.
        self.assertIn("if _os.path.islink(path):", helpers)
        self.assertIn("_os.remove(path)", helpers)


def api_patch_text(module, description):
    """Return the 'new' string of the api_server patch with the given description."""
    for p in module.API_PATCHES:
        if p.get("description") == description:
            return p["new"]
    raise AssertionError(f"no API patch with description {description!r}")


if __name__ == "__main__":
    unittest.main()
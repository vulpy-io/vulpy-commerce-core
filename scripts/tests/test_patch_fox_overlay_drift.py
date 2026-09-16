"""Regression tests for the build-time fox-overlay drift patcher.

The fixture is a disposable copy of the installed-source boundary: the patcher
runs as a subprocess against fake ``/app`` contents, then the generated
``run_one_job`` substitution is applied to the fake upstream function and
compiled.  No baked overlay or live service is modified.
"""

import ast
import importlib.util
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATCHER = ROOT / "extensions/hermes-agent-patches/patch-fox-overlay-drift.py"


class PatchFoxOverlayDriftTests(unittest.TestCase):
    def _load_patcher_module(self):
        spec = importlib.util.spec_from_file_location("patch_fox_overlay_drift", PATCHER)
        if spec is None or spec.loader is None:
            self.fail("unable to load patcher module")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def _fixture(self, incompatible_verification=False, run_one_job_anchor=None):
        temporary = tempfile.TemporaryDirectory(prefix="fox-overlay-drift-test-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        app = root / "app"

        (app / "cron").mkdir(parents=True)
        (app / "tools").mkdir(parents=True)
        patches = (
            app
            / "fox-overlay/fox_overlay/agent_plugins/fox_overlay_plugin/monkey_patches"
        )
        patches.mkdir(parents=True)
        (app / "fox-overlay/fox_overlay").mkdir(exist_ok=True)

        (app / "cron/__init__.py").write_text("", encoding="utf-8")
        (app / "cron/jobs.py").write_text(
            "def mark_job_run(job_id, success, error):\n"
            "    return None\n",
            encoding="utf-8",
        )
        delivery_line = (
            "            deliver_content = final_response if success else _summarize_cron_failure_for_delivery(job, error)\n"
        )
        if run_one_job_anchor == "duplicate":
            delivery_line += delivery_line
        scheduler_source = (
            "def run_one_job(job):\n"
            "    try:\n"
            "        if success:\n"
            + delivery_line
            + "            return deliver_content\n"
            "    except Exception:\n"
            "        return False\n"
        )
        (app / "cron/scheduler.py").write_text(scheduler_source, encoding="utf-8")
        (app / "tools/__init__.py").write_text("", encoding="utf-8")
        (app / "tools/cronjob_tools.py").write_text("", encoding="utf-8")

        overlay = app / "fox-overlay/fox_overlay"
        (overlay / "__init__.py").write_text("", encoding="utf-8")
        (overlay / "_substitute.py").write_text(
            "# already in upstream\n",
            encoding="utf-8",
        )
        (patches.parent.parent.parent / "__init__.py").write_text("", encoding="utf-8")
        (patches.parent.parent / "__init__.py").write_text("", encoding="utf-8")
        (patches.parent / "__init__.py").write_text("", encoding="utf-8")
        (patches / "__init__.py").write_text("", encoding="utf-8")
        helper_source = (
            "def substitute_function(*args, **kwargs):\n"
            "    return None\n"
        )
        if run_one_job_anchor in {"missing", "duplicate"}:
            helper_source = (
                "import inspect\n\n"
                "def substitute_function(*, upstream_module, function_name, substitutions, **kwargs):\n"
                "    source = inspect.getsource(getattr(upstream_module, function_name))\n"
                "    for index, (old, _new) in enumerate(substitutions, start=1):\n"
                "        count = source.count(old)\n"
                "        if count != 1:\n"
                "            raise AssertionError(\n"
                "                f\"substitution #{index} for {function_name} expected one anchor, found {count}\"\n"
                "            )\n"
            )
        (patches / "_helpers.py").write_text(helper_source, encoding="utf-8")
        (patches / "auxiliary_client.py").write_text(
            "def apply():\n"
            "    pass\n",
            encoding="utf-8",
        )
        (patches / "runtime_provider.py").write_text(
            "# target_model or model_cfg\n"
            "def apply():\n"
            "    pass\n",
            encoding="utf-8",
        )

        verification_body = (
            "    raise RuntimeError('incompatible fixture')\n"
            if incompatible_verification
            else ("" if run_one_job_anchor in {"missing", "duplicate"} else "    return\n")
        )
        scheduler_import = (
            "from cron import scheduler as _u_scheduler\n\n"
            if run_one_job_anchor in {"missing", "duplicate"}
            else ""
        )
        run_one_job_old_literal = (
            "                '        deliver_content = final_response if success else _missing_anchor(job, error)\\n',\n"
            if run_one_job_anchor == "missing"
            else "                '        deliver_content = final_response if success else _summarize_cron_failure_for_delivery(job, error)\\n',\n"
        )
        (patches / "cron_diagnostics.py").write_text(
            scheduler_import
            + "from ._helpers import substitute_function\n\n"
            "def apply():\n"
            + verification_body
            + "    substitute_function(\n"
            "        upstream_module=_u_scheduler,\n"
            "        function_name=\"run_one_job\",\n"
            "        substitutions=[\n"
            "            (\n"
            + run_one_job_old_literal
            + "                '        if success:\\n'\n"
            "                '            deliver_content = final_response\\n'\n"
            "                '        else:\\n'\n"
            "                '            _fail_lines = [_summarize_cron_failure_for_delivery(job, error)]\\n'\n"
            "                '            _history = job.get(\"failure_history\") or []\\n'\n"
            "                '            if len(_history) > 1:\\n'\n"
            "                '                _fail_lines.append(\"failure history\")\\n'\n"
            "                '            deliver_content = \"\\\\n\".join(_fail_lines)\\n',\n"
            "            ),\n"
            "        ],\n"
            "        sentinel=\"_fox_patched_run_one_job_structured_failure\",\n"
            "    )\n",
            encoding="utf-8",
        )

        patcher = root / "patch-fox-overlay-drift.py"
        patcher_source = PATCHER.read_text(encoding="utf-8")
        patcher_source = re.sub(
            r'"/app([^"\\]*)"',
            lambda match: repr(str(app) + match.group(1)),
            patcher_source,
        )
        patcher.write_text(patcher_source, encoding="utf-8")
        return root, app, patcher

    def _run(self, patcher):
        app = patcher.parent / "app"
        environment = os.environ.copy()
        environment["PYTHONPATH"] = os.pathsep.join(
            (str(app / "fox-overlay"), str(app), environment.get("PYTHONPATH", ""))
        )
        return subprocess.run(
            [sys.executable, str(patcher)],
            capture_output=True,
            text=True,
            env=environment,
        )

    def _run_one_job_substitution(self, source):
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or getattr(node.func, "id", "") != "substitute_function":
                continue
            keywords = {keyword.arg: keyword for keyword in node.keywords}
            function_name = keywords.get("function_name")
            if getattr(function_name.value, "value", "") != "run_one_job":
                continue
            pair = keywords["substitutions"].value.elts[0].elts
            return pair[0].value, pair[1].value
        self.fail("run_one_job substitution missing from fixture")

    def test_generated_run_one_job_replacement_compiles_with_nested_indentation(self):
        root, app, patcher = self._fixture()
        scheduler = app / "cron/scheduler.py"
        cron_patch = (
            app
            / "fox-overlay/fox_overlay/agent_plugins/fox_overlay_plugin/monkey_patches/cron_diagnostics.py"
        )
        upstream = scheduler.read_text(encoding="utf-8")

        result = self._run(patcher)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        old, replacement = self._run_one_job_substitution(
            cron_patch.read_text(encoding="utf-8")
        )
        self.assertEqual(upstream.count(old), 1)
        patched = upstream.replace(old, replacement, 1)
        compile(patched, "<fox-overlay cron.scheduler.run_one_job>", "exec")

        lines = replacement.splitlines()
        self.assertEqual(lines[0].strip(), "if success:")
        self.assertGreater(len(lines[1]) - len(lines[1].lstrip()), len(lines[0]) - len(lines[0].lstrip()))
        self.assertEqual(lines[2].strip(), "else:")
        self.assertGreater(len(lines[3]) - len(lines[3].lstrip()), len(lines[2]) - len(lines[2].lstrip()))
        self.assertGreater(len(lines[6]) - len(lines[6].lstrip()), len(lines[5]) - len(lines[5].lstrip()))

    def test_replacement_accounts_for_prefix_overlap_in_actual_source_shape(self):
        patcher = self._load_patcher_module()
        upstream = (
            "def run_one_job(job):\n"
            "    try:\n"
            "            # Deliver the final response to the origin/target chat.\n"
            "            deliver_content = final_response if success else _summarize_cron_failure_for_delivery(job, error)\n"
            "            return deliver_content\n"
            "    except Exception:\n"
            "        return False\n"
        )
        anchor = "        deliver_content = final_response if success else _summarize_cron_failure_for_delivery(job, error)\n"
        target_line = next(
            line + "\n"
            for line in upstream.splitlines()
            if "_summarize_cron_failure_for_delivery(job, error)" in line
            and "deliver_content =" in line
        )

        source_line = next(line for line in upstream.splitlines() if "deliver_content =" in line)
        self.assertEqual(len(source_line) - len(source_line.lstrip()), 12)
        self.assertEqual(len(anchor.splitlines()[0]) - len(anchor.splitlines()[0].lstrip()), 8)
        self.assertEqual(upstream.count(anchor), 1)

        replacement = patcher._build_run_one_job_replacement(target_line, anchor, upstream)
        patched = upstream.replace(anchor, replacement, 1)
        compile(patched, "<fox-overlay cron.scheduler.run_one_job>", "exec")

        patched_lines = patched.splitlines()
        self.assertEqual(patched_lines[3].strip(), "if success:")
        self.assertEqual(len(patched_lines[3]) - len(patched_lines[3].lstrip()), 12)
        self.assertEqual(len(patched_lines[4]) - len(patched_lines[4].lstrip()), 16)

    def test_second_run_is_byte_for_byte_idempotent(self):
        _root, app, patcher = self._fixture()
        cron_patch = (
            app
            / "fox-overlay/fox_overlay/agent_plugins/fox_overlay_plugin/monkey_patches/cron_diagnostics.py"
        )

        first = self._run(patcher)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        after_first = cron_patch.read_bytes()
        second = self._run(patcher)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertEqual(cron_patch.read_bytes(), after_first)

    def test_incompatible_fixture_fails_verification_loudly(self):
        _root, _app, patcher = self._fixture(incompatible_verification=True)

        result = self._run(patcher)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("verify cron_diagnostics: FAIL RuntimeError: incompatible fixture", result.stdout)
        self.assertIn("FATAL: verification failed", result.stderr)

    def test_run_one_job_anchor_drift_fails_verification_loudly(self):
        for anchor_shape in ("missing", "duplicate"):
            with self.subTest(anchor_shape=anchor_shape):
                _root, _app, patcher = self._fixture(run_one_job_anchor=anchor_shape)

                result = self._run(patcher)

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(
                    "verify cron_diagnostics: FAIL AssertionError: substitution #1 for run_one_job expected one anchor",
                    result.stdout,
                )
                self.assertIn("FATAL: verification failed", result.stderr)


if __name__ == "__main__":
    unittest.main()

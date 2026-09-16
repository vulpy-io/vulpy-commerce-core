"""Unit tests for scripts/patch-agent-length-continuation-boost.py.

Pattern mirrors tests/test_patch_stream_switch_leak.py: drive the patcher as
a subprocess against a throwaway conversation_loop.py fixture built from the
patcher's own pristine anchor constants, then assert markers/exit codes.

  - fresh file -> both guards injected, idempotency mark appears
  - re-run on patched file -> exit 0 "already patched", no double-apply
  - mutated anchor -> exit 1, fail-loud error names the missing anchor
  - wrong arg count -> exit 1, Usage printed to stderr
"""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-agent-length-continuation-boost.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_lc_boost_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchAgentLengthContinuationBoostTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _make_fixture(self) -> tuple:
        """Return (tmpdir, conversation_loop_path) with the pristine anchors."""
        tmp = tempfile.TemporaryDirectory()
        target = Path(tmp.name) / "conversation_loop.py"
        target.write_text(
            "#!/usr/bin/env python3\n"
            "# conversation_loop.py fixture\n"
            + self.patcher.ANCHOR_A
            + "\n\n"
            + "            if length_continue_retries < 4:\n"
            + "                _continue_content = _get_continuation_prompt(False, None)\n"
            + "                messages.append(continue_msg)\n"
            + "                agent._session_messages = messages\n"
            + self.patcher.ANCHOR_B
            + "\n\n"
            + "            return {'partial': True}\n",
            encoding="utf-8",
        )
        return tmp, target

    def _run(self, target) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["python3", str(PATCHER), str(target)],
            capture_output=True,
            text=True,
        )

    # ------------------------------------------------------------------
    # Fresh file -> both guards applied
    # ------------------------------------------------------------------
    def test_fresh_file_patches_both_guards(self):
        tmp, target = self._make_fixture()
        self.addCleanup(tmp.cleanup)

        result = self._run(target)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = target.read_text(encoding="utf-8")
        # Idempotency mark present
        self.assertEqual(text.count(self.patcher.IDEMPOTENCY_MARK), 1)
        # Guard A: max_tokens boost via _ephemeral_max_output_tokens
        self.assertIn("_lc_boost = _lc_boost_base * (2 ** length_continue_retries)", text)
        self.assertIn("agent._ephemeral_max_output_tokens = min(_lc_boost, _lc_boost_cap)", text)
        # Guard B: fallback attempt after 4 retries
        self.assertIn("kept truncating after 4 retries", text)
        self.assertIn("_retry.restart_with_rebuilt_messages = True", text)
        # Both insertions landed in the right order
        self.assertLess(
            text.index(self.patcher.IDEMPOTENCY_MARK),
            text.index("_retry.restart_with_rebuilt_messages = True"),
        )

    # ------------------------------------------------------------------
    # Idempotency: second run is a no-op
    # ------------------------------------------------------------------
    def test_rerun_is_idempotent(self):
        tmp, target = self._make_fixture()
        self.addCleanup(tmp.cleanup)

        first = self._run(target)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_text = target.read_text(encoding="utf-8")

        second = self._run(target)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout.lower())
        self.assertEqual(target.read_text(encoding="utf-8"), first_text)

    # ------------------------------------------------------------------
    # Mutated anchor -> fail-loud
    # ------------------------------------------------------------------
    def test_mutated_anchor_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        target = Path(tmp.name) / "conversation_loop.py"
        # ANCHOR_A present but ANCHOR_B mutated away
        target.write_text(
            "# fixture\n"
            + self.patcher.ANCHOR_A
            + "\n\n"
            + "            _retry.restart_with_length_continuation = True\n"
            + "            break\n\n"
            + "            partial_response = 'mutated-shape'\n",
            encoding="utf-8",
        )
        result = self._run(target)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor", result.stderr + result.stdout)
        self.assertNotIn(self.patcher.IDEMPOTENCY_MARK, target.read_text(encoding="utf-8"))

    # ------------------------------------------------------------------
    # Wrong argument count -> usage + exit 1
    # ------------------------------------------------------------------
    def test_usage_requires_one_arg(self):
        result = subprocess.run(
            ["python3", str(PATCHER)],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr)


if __name__ == "__main__":
    unittest.main()

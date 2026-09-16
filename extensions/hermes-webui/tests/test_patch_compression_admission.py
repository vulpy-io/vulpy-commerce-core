import py_compile
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / 'scripts/patch-compression-admission.py'
FIXTURE = '''from typing import Optional

def summarize(agent, messages, system_message):
    return messages, system_message

def compress_context(agent, messages, system_message, *, approx_tokens=None, force=False):
    if getattr(agent, "api_mode", None) == "codex_app_server":
        return native(agent, messages, system_message)
    return summarize(agent, messages, system_message)
'''


class CompressionPatchTests(unittest.TestCase):
    def test_adds_bounded_fail_fast_guard(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'conversation_compression.py'
            p.write_text(FIXTURE)
            r = subprocess.run(['python3', str(PATCHER), str(p)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            t = p.read_text()
            self.assertIn('vulpy-compression-admission', t)
            self.assertIn('COMPRESSION_ADMISSION_MAX_TOKENS', t)
            self.assertIn('manual recovery', t.lower())

    def test_multiline_signature_is_valid_and_guard_is_after_codex_branch(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'conversation_compression.py'
            p.write_text('''from typing import Optional\n\ndef compress_context(\n    agent, messages, system_message, *, approx_tokens: Optional[int] = None,\n    force: bool = False,\n):\n    if getattr(agent, "api_mode", None) == "codex_app_server":\n        return native(agent, messages, system_message)\n    return messages, system_message\n''')
            subprocess.check_call(['python3', str(PATCHER), str(p)])
            py_compile.compile(str(p), doraise=True)
            t = p.read_text()
            self.assertGreater(t.rindex('_vulpy_compression_admitted(agent, approx_tokens)'),
                               t.index('if getattr(agent, "api_mode"'))

    def test_multiline_codex_condition_is_valid_and_guard_is_after_native_branch(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'conversation_compression.py'
            p.write_text('''def compress_context(agent, messages, system_message, *, approx_tokens=None):
    if (
        getattr(agent, "api_mode", None) == "codex_app_server"
        and getattr(agent, "codex_app_server", False)
    ):
        return native(agent, messages, system_message)
    return messages, system_message
''')
            r = subprocess.run(['python3', str(PATCHER), str(p)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            py_compile.compile(str(p), doraise=True)
            t = p.read_text()
            self.assertGreater(
                t.rindex('_vulpy_compression_admitted(agent, approx_tokens)'),
                t.index('return native(agent, messages, system_message)'),
            )

    def test_admission_is_bounded_fail_fast_and_manual_recovery_is_real(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'conversation_compression.py'
            p.write_text(FIXTURE)
            subprocess.check_call(['python3', str(PATCHER), str(p)])
            ns = {}
            exec(compile(p.read_text(), str(p), 'exec'), ns)

            class Agent:
                compression_admission_max_tokens = 10
                def __init__(self):
                    self.status = []
                def _emit_status(self, message):
                    self.status.append(message)

            a = Agent()
            original = (['m'], 's')
            self.assertEqual(ns['compress_context'](a, *original, approx_tokens=11), original)
            self.assertTrue(a.status)
            self.assertIn('manual recovery', a.status[0].lower())
            self.assertEqual(ns['compress_context'](a, *original, approx_tokens=10), original)

    def test_idempotent(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'conversation_compression.py'
            p.write_text(FIXTURE)
            subprocess.check_call(['python3', str(PATCHER), str(p)])
            a = p.read_text()
            subprocess.check_call(['python3', str(PATCHER), str(p)])
            self.assertEqual(a, p.read_text())


if __name__ == '__main__':
    unittest.main()

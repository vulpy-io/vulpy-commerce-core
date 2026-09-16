import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-session-db-recovery.py"
FIXTURE = '''import sqlite3\nclass SessionDB:\n    def __init__(self):\n        self._conn = None\n        self._lock = __import__("threading").RLock()\n        self._WRITE_MAX_RETRIES = 2\n    def _execute_write(self, fn):\n        for attempt in range(self._WRITE_MAX_RETRIES):\n            with self._lock:\n                self._conn.execute("BEGIN IMMEDIATE")\n                result = fn(self._conn)\n                self._conn.commit()\n                return result\n    def append_message(self, session_id, role, content=None):\n        def _do(conn):\n            return conn.execute("INSERT INTO messages VALUES (?, ?, ?)", (session_id, role, content)).lastrowid\n        return self._execute_write(_do)\n'''

class RecoveryPatchTests(unittest.TestCase):
    def test_patch_reopens_missing_connection_and_is_bounded(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'hermes_state.py'; p.write_text(FIXTURE)
            r = __import__('subprocess').run(['python3', str(PATCHER), str(p)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            text = p.read_text()
            self.assertIn('vulpy-session-db-recovery', text)
            self.assertIn('persistence failure', text.lower())
            self.assertIn('_VULPY_DB_APPEND_MAX_RETRIES', text)

    def test_patch_is_idempotent(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'hermes_state.py'; p.write_text(FIXTURE)
            import subprocess
            self.assertEqual(subprocess.run(['python3', str(PATCHER), str(p)]).returncode, 0)
            first = p.read_text()
            self.assertEqual(subprocess.run(['python3', str(PATCHER), str(p)]).returncode, 0)
            self.assertEqual(first, p.read_text())

if __name__ == '__main__': unittest.main()

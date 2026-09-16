#!/usr/bin/env python3
"""Patch Hermes SessionDB writes to recover a missing/closed sqlite handle once."""
import re, sys
from pathlib import Path
MARK = "vulpy-session-db-recovery"
BLOCK = '''\n# vulpy-session-db-recovery: bounded recovery for a missing/closed handle.\n_VULPY_DB_APPEND_MAX_RETRIES = 2\n\ndef _vulpy_reopen_session_db(self):\n    """Reopen through the existing constructor lifecycle; never create a new DB."""\n    old = getattr(self, "_conn", None)\n    try:\n        if old is not None:\n            old.close()\n    except Exception:\n        pass\n    self._conn = None\n    opener = getattr(self, "_connect_and_init", None)\n    try:\n        if opener is not None:\n            opener()\n        else:\n            self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False, timeout=1.0, isolation_level=None)\n            self._conn.row_factory = sqlite3.Row\n            self._conn.execute("PRAGMA foreign_keys=ON")\n            self._init_schema()\n    except Exception as exc:\n        raise RuntimeError(f"Session DB persistence failure: reopen failed: {exc}") from exc\n    if self._conn is None:\n        raise RuntimeError("Session DB persistence failure: reopen returned no connection")\n\n'''

def patch(src):
    if MARK in src: return src
    if "def append_message(" not in src or "return self._execute_write(_do)" not in src:
        raise SystemExit("[vulpy-session-db-recovery] ERROR: append_message anchors drifted")
    # Keep normal transaction semantics; retry only closed/missing-handle errors.
    src = src.replace("import sqlite3", "import sqlite3" + BLOCK, 1)
    old = "        return self._execute_write(_do)"
    new = '''        last_error = None\n        for _attempt in range(_VULPY_DB_APPEND_MAX_RETRIES):\n            try:\n                if self._conn is None:\n                    _vulpy_reopen_session_db(self)\n                return self._execute_write(_do)\n            except (AttributeError, sqlite3.ProgrammingError) as exc:\n                last_error = exc\n                if "closed" not in str(exc).lower() and "none" not in str(exc).lower():\n                    raise\n                if _attempt + 1 < _VULPY_DB_APPEND_MAX_RETRIES:\n                    _vulpy_reopen_session_db(self)\n        raise RuntimeError(f"Session DB persistence failure after {_VULPY_DB_APPEND_MAX_RETRIES} attempts: {last_error}") from last_error'''
    # target the first append return after its definition, not unrelated writes
    start = src.index("def append_message(")
    pos = src.index(old, start)
    src = src[:pos] + src[pos:].replace(old, new, 1)
    return src

def main():
    if len(sys.argv) != 2: print(f"Usage: {Path(sys.argv[0]).name} <hermes_state.py>", file=sys.stderr); return 1
    p=Path(sys.argv[1]);
    if not p.exists(): print(f"missing target: {p}", file=sys.stderr); return 1
    before=p.read_text(); after=patch(before); p.write_text(after)
    return 0
if __name__ == '__main__': sys.exit(main())

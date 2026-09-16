"""Tests for the non-destructive session retention sweep."""

import os

import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "vulpy-session-retention.sh"


def make_session_dir(base: Path, name: str) -> Path:
    d = base / name
    d.mkdir(parents=True)
    return d


def touch_json(path: Path, size_bytes: int, mtime_offset_s: int = 0) -> None:
    path.write_bytes(b"x" * size_bytes)
    # ALWAYS set the mtime: leaving offset 0 at wall-clock time would make that
    # file newer than every 1e9-based sibling and silently flip sort order.
    past = 1_000_000_000 + mtime_offset_s
    os.utime(path, (past, past))


def run_script(args: list[str], env_extra: dict[str, str] | None = None):
    env = {**os.environ, **(env_extra or {})}
    return subprocess.run(
        ["bash", str(SCRIPT), *args], capture_output=True, text=True, env=env
    )


class RetentionScriptTests(unittest.TestCase):
    """Black-box coverage of the archive-only retention contract."""

    def test_script_contains_no_delete_operation(self):
        script = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("rm -", script)
        self.assertNotIn("--max-dumps", script)

    def _write_session(self, path: Path, rows: int, size_bytes: int = 0) -> None:
        payload = {"messages": [{"role": "user", "content": "x"}] * rows}
        raw = __import__("json").dumps(payload).encode()
        if size_bytes > len(raw):
            raw += b" " * (size_bytes - len(raw))
        path.write_bytes(raw)

    def test_default_is_dry_run_and_never_creates_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = make_session_dir(Path(tmp), "s")
            large = store / "session-large.json"
            self._write_session(large, 2001)
            dump = store / "request_dump_old.json"
            touch_json(dump, 100)
            r = run_script(["--dir", str(store)])
            self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
            self.assertTrue(large.exists() and dump.exists())
            self.assertFalse((store / "archive").exists())
            self.assertIn("dry-run", r.stdout.lower())

    def test_apply_moves_only_sessions_over_row_or_size_threshold(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = make_session_dir(Path(tmp), "s")
            by_rows = store / "rows.json"
            by_size = store / "size.json"
            exact_rows = store / "exact-rows.json"
            exact_size = store / "exact-size.json"
            small = store / "small.json"
            self._write_session(by_rows, 2001)
            self._write_session(by_size, 1, 8 * 1024 * 1024 + 1)
            self._write_session(exact_rows, 2000)
            self._write_session(exact_size, 1, 8 * 1024 * 1024)
            self._write_session(small, 1)
            touch_json(store / "request_dump_1.json", 10)
            r = run_script(["--apply", "--dir", str(store)])
            self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
            archive = store / "archive"
            self.assertFalse(by_rows.exists())
            self.assertFalse(by_size.exists())
            self.assertTrue((archive / by_rows.name).exists())
            self.assertTrue((archive / by_size.name).exists())
            self.assertTrue(exact_rows.exists() and exact_size.exists() and small.exists())
            self.assertTrue((store / "request_dump_1.json").exists())

    def test_explicit_dry_run_is_non_destructive(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = make_session_dir(Path(tmp), "s")
            large = store / "large.json"
            self._write_session(large, 2001)
            r = run_script(["--dry-run", "--dir", str(store)])
            self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
            self.assertTrue(large.exists())
            self.assertFalse((store / "archive").exists())
            self.assertIn("would move", r.stdout.lower())

    def test_second_apply_is_noop_and_does_not_touch_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = make_session_dir(Path(tmp), "s")
            large = store / "large.json"
            self._write_session(large, 2001)
            args = ["--apply", "--dir", str(store)]
            first = run_script(args)
            second = run_script(args)
            self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
            self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
            self.assertFalse(large.exists())
            self.assertEqual(len(list((store / "archive").glob("large.json"))), 1)
            self.assertIn("0", second.stdout)

    def test_missing_dir_is_skipped_not_fatal(self):
        r = run_script(["--dir", "/nonexistent/hermes-sessions-xyz"])
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        self.assertIn("skip", r.stdout)

    def test_bad_numeric_arg_fails_loudly(self):
        r = run_script(["--dir", "/tmp", "--apply", "--unknown"])
        self.assertEqual(r.returncode, 1)
        self.assertIn("ERROR", r.stderr)

    def test_unknown_arg_fails_loudly(self):
        r = run_script(["--frobnicate"])
        self.assertEqual(r.returncode, 1)
        self.assertIn("ERROR", r.stderr)


if __name__ == "__main__":
    unittest.main()

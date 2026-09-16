"""Unit tests for scripts/patch-session-store-bounds.py.

Pattern mirrors tests/test_patch_send_wait_session.py: drive the patcher as a
subprocess against byte-copy fixtures of the live webui surface (api/models.py),
then assert markers / injected code / exit codes.

The fixture is a hand-built miniature of the live models.py anchor regions:
Session.save() with ``meta['messages'] = self.messages`` plus the
json.dumps({**meta, **extra}, ...) payload line, and Session.load() with the
read_text/json.loads pair.

Functional tests load the patched fixture module directly to exercise the
injected helpers (cap math, marker idempotency, LRU parse cache) without the
real webui package. Patcher-level tests run the script as a subprocess:

  - fresh fixture -> patcher applies, mark present, exit 0
  - re-run -> exit 0 "already patched", byte-identical output
  - mutated anchors -> exit 1 fail-loud naming the drifted anchor
  - wrong arg count -> exit 1 Usage on stderr
  - cap math: tool rows capped (8192) chars with an exact remainder marker;
    user/assistant capped at 16000; message 'id' preserved; nested dict/list
    values truncated recursively; already-marked rows untouched; non-text
    values never mutated; live row never mutated (persisted form is a copy)
  - parse cache: key is (path, mtime_ns, size), value is the parsed dict;
    write invalidates via mtime/size; LRU evicts beyond 8 entries; corrupt
    and missing files raise like plain load() and are never cached

(The §A routes.py /session-list-cache rewiring lives in
test_patch_session_list_cache_stale_on_wait.py — separate patcher.)
"""

import importlib.util
import json
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-session-store-bounds.py"

MODELS_MARK = "vulpy-session-store-bounds"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_store_bounds_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# Fixture — miniature of the live api/models.py around the anchor regions.
# ---------------------------------------------------------------------------

MODELS_FIXTURE = '''"""Fixture models module."""
import json
import copy
import os
import threading
import time
from pathlib import Path


SESSION_DIR = Path("/tmp")

METADATA_FIELDS = ("messages",)


class Session:
    def __init__(self, session_id=None, messages=None):
        self.session_id = session_id
        self.messages = messages or []

    @property
    def path(self):
        return SESSION_DIR / f'{self.session_id}.json'

    def save(self):
        meta = {}
        meta['message_count'] = len(self.messages or [])
        meta['messages'] = self.messages
        meta['tool_calls'] = self.tool_calls if hasattr(self, 'tool_calls') else None
        # Fields not in METADATA_FIELDS (e.g. last_usage) go at the end
        extra = {k: v for k, v in self.__dict__.items()
                 if k not in METADATA_FIELDS and k not in ('messages', 'tool_calls')
                 and not k.startswith('_')}
        payload = json.dumps({**meta, **extra}, ensure_ascii=False, indent=2)

        tmp = self.path.with_suffix('.tmp')
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(payload)
        os.replace(tmp, self.path)

    @classmethod
    def load(cls, sid):
        p = SESSION_DIR / f'{sid}.json'
        if not p.exists():
            return None
        data = json.loads(p.read_text(encoding='utf-8'))
        return cls(**data)
'''


def _make_models_fixture(path: Path) -> None:
    """models.py-shaped fixture with the save/load anchor region verbatim."""
    path.write_text(MODELS_FIXTURE, encoding="utf-8")


def _load_fixture_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchSessionStoreBoundsTests(unittest.TestCase):
    def _run(self, *paths):
        return subprocess.run(
            ["python3", str(PATCHER), *[str(p) for p in paths]],
            capture_output=True,
            text=True,
        )

    # ------------------------------------------------------------------
    # Fresh application
    # ------------------------------------------------------------------
    def test_fresh_apply_patches_models(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        models = Path(tmp.name) / "models.py"
        _make_models_fixture(models)

        result = self._run(models)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        mtext = models.read_text(encoding="utf-8")
        self.assertIn(MODELS_MARK, mtext)
        # Write-time cap wired into save(): helper used before dumps
        self.assertIn("vulpy_cap_message_bodies_for_disk", mtext)
        self.assertIn(
            "meta['messages'] = vulpy_cap_message_bodies_for_disk(self.messages)", mtext
        )
        # Read-time parse cache wired into load()
        self.assertIn("vulpy_load_with_parse_cache", mtext)
        self.assertIn("data = vulpy_load_with_parse_cache(p)", mtext)

    def test_fresh_apply_patches_multiple_targets_in_one_invocation(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        models_a = Path(tmp.name) / "models_a.py"
        models_b = Path(tmp.name) / "models_b.py"
        _make_models_fixture(models_a)
        _make_models_fixture(models_b)

        result = self._run(models_a, models_b)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn(MODELS_MARK, models_a.read_text(encoding="utf-8"))
        self.assertIn(MODELS_MARK, models_b.read_text(encoding="utf-8"))

    # ------------------------------------------------------------------
    # Idempotency: second run changes nothing
    # ------------------------------------------------------------------
    def test_rerun_is_idempotent(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        models = Path(tmp.name) / "models.py"
        _make_models_fixture(models)

        first = self._run(models)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        before = models.read_text(encoding="utf-8")

        second = self._run(models)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(models.read_text(encoding="utf-8"), before)

    # ------------------------------------------------------------------
    # Fail-loud: anchor drift exits 1 without writing
    # ------------------------------------------------------------------
    def test_mutated_save_anchor_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        models = Path(tmp.name) / "models.py"
        _make_models_fixture(models)
        text = models.read_text(encoding="utf-8")
        models.write_text(
            text.replace(
                "meta['messages'] = self.messages",
                "meta['messages'] = list(self.messages)",
            ),
            encoding="utf-8",
        )

        result = self._run(models)
        self.assertEqual(result.returncode, 1)
        self.assertIn("anchor", result.stderr.lower())
        self.assertIn("drift", result.stderr.lower())
        # No idempotency mark was written into the drifted file.
        self.assertNotIn(MODELS_MARK, models.read_text(encoding="utf-8"))

    def test_mutated_load_anchor_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        models = Path(tmp.name) / "models.py"
        _make_models_fixture(models)
        text = models.read_text(encoding="utf-8")
        models.write_text(
            text.replace(
                "data = json.loads(p.read_text(encoding='utf-8'))",
                "data = json.loads(p.read_bytes())",
            ),
            encoding="utf-8",
        )

        result = self._run(models)
        self.assertEqual(result.returncode, 1)
        self.assertIn("anchor", result.stderr.lower())

    def test_wrong_arg_count_fails_with_usage(self):
        result = subprocess.run(
            ["python3", str(PATCHER)], capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Usage", result.stderr)

    def test_missing_target_fails_loudly(self):
        result = self._run("/nonexistent/models.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("does not exist", result.stderr)


class InjectedCapMathTests(unittest.TestCase):
    """Load a patched models fixture and exercise the injected cap helper."""

    @classmethod
    def setUpClass(cls):
        tmp = tempfile.TemporaryDirectory()
        cls._tmp = tmp  # keep alive until class teardown
        models = Path(tmp.name) / "models.py"
        _make_models_fixture(models)
        proc = subprocess.run(
            ["python3", str(PATCHER), str(models)], capture_output=True, text=True
        )
        assert proc.returncode == 0, proc.stderr + proc.stdout
        cls.models_mod = _load_fixture_module("_patched_models_fixture", models)
        # staticmethod wrappers: bare functions on a class attribute would
        # bind through instances and shift every call's argument list.
        cls.cap = staticmethod(cls.models_mod.vulpy_cap_message_bodies_for_disk)
        cls.marker_prefix = cls.models_mod._VULPY_BOUNDS_MARKER_PREFIX
        cls.tool_cap = cls.models_mod._VULPY_TOOL_BODY_CAP_CHARS
        cls.text_cap = cls.models_mod._VULPY_TEXT_BODY_CAP_CHARS

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def _kept_and_dropped(self, body: str):
        kept = body.split(self.marker_prefix)[0]
        tail = body.rsplit(self.marker_prefix, 1)[1]  # " 7223 chars]"
        dropped = int(tail.strip().split(" ")[0])
        return kept, dropped

    # ------------------ role-aware caps ------------------
    def test_tool_row_capped_at_8192_with_marker(self):
        original = "x" * 9000
        row = {"role": "tool", "content": original}
        out = self.cap(row)
        body = out["content"]
        self.assertIn(self.marker_prefix, body)
        self.assertTrue(body.startswith("x"))
        kept, dropped = self._kept_and_dropped(body)
        self.assertEqual(len(original), len(kept) + dropped)
        self.assertLess(len(kept), self.tool_cap + 10)
        # live row untouched — persisted form is a copy
        self.assertEqual(row["content"], "x" * 9000)

    def test_user_row_uses_16k_cap(self):
        row = {"role": "user", "content": "u" * 20000}
        out = self.cap(row)
        body = out["content"]
        self.assertIn(self.marker_prefix, body)
        kept, dropped = self._kept_and_dropped(body)
        self.assertEqual(20000, len(kept) + dropped)
        self.assertLess(len(kept), self.text_cap + 10)
        self.assertEqual(row["content"], "u" * 20000)

    def test_assistant_row_uses_16k_cap(self):
        row = {"role": "assistant", "content": "a" * 30000}
        out = self.cap(row)
        body = out["content"]
        kept, dropped = self._kept_and_dropped(body)
        self.assertEqual(30000, len(kept) + dropped)
        self.assertEqual(row["content"], "a" * 30000)

    def test_unknown_role_defaults_to_tool_cap(self):
        out = self.cap({"role": "system-ish", "content": "s" * 9000})
        body = out["content"]
        kept, dropped = self._kept_and_dropped(body)
        self.assertLess(len(kept), self.tool_cap + 10)

    def test_missing_role_defaults_to_tool_cap(self):
        out = self.cap({"content": "s" * 9000})
        kept, dropped = self._kept_and_dropped(out["content"])
        self.assertLess(len(kept), self.tool_cap + 10)

    def test_short_content_untouched_verbatim(self):
        body = "short body"
        for role in ("user", "assistant", "tool", "developer", None):
            row = {"role": role, "content": body}
            out = self.cap(row)
            self.assertEqual(out["content"], body)

    # ------------------ identity & nesting ------------------
    def test_message_id_preserved_through_cap(self):
        row = {"id": 42, "message_id": 7, "role": "tool", "content": "t" * 9999}
        out = self.cap(row)
        self.assertEqual(out.get("id"), 42)
        self.assertEqual(out.get("message_id"), 7)

    def test_nested_reasoning_details_truncated(self):
        row = {
            "role": "assistant",
            "content": "",
            "reasoning": "r" * 20000,
            "reasoning_details": [{"type": "text", "text": "d" * 25000}],
            "_partial_tool_calls": [{"args": "p" * 22000}],
        }
        out = self.cap(row)
        # contract: kept head ≤ cap, remainder reported exactly via the
        # marker, so the whole stored body stays ≤ cap + short marker.
        self.assertLessEqual(len(out["reasoning"]), self.text_cap + 40)
        self.assertIn(self.marker_prefix, out["reasoning"])
        kept, dropped = self._kept_and_dropped(out["reasoning"])
        self.assertEqual(len(kept) + dropped, 20000)
        nested_text = out["reasoning_details"][0]["text"]
        self.assertIn(self.marker_prefix, nested_text)
        self.assertIn(self.marker_prefix, out["_partial_tool_calls"][0]["args"])
        # live row untouched
        self.assertEqual(row["reasoning"], "r" * 20000)

    def test_non_string_values_untouched(self):
        counts = {"in_tokens": 1234, "ok": True, "none": None, "arr": [1, 2]}
        row = {"role": "tool", "content": "c", **counts}
        out = self.cap(row)
        for k, v in counts.items():
            self.assertEqual(out[k], v)

    def test_non_dict_passthrough(self):
        self.assertEqual(self.cap("plain"), "plain")
        self.assertIsNone(self.cap(None))

    def test_tool_calls_list_of_dicts_capped(self):
        msg = {"role": "tool", "content": "", "tool_calls": [
            {"args": "q" * 12000, "id": "tc1"}
        ]}
        out = self.cap(msg)
        self.assertIn(self.marker_prefix, out["tool_calls"][0]["args"])
        self.assertEqual(out["tool_calls"][0]["id"], "tc1")

    # ------------------ idempotency ------------------
    def test_already_marked_row_not_double_truncated(self):
        original = "y" * 70000
        once = self.cap({"role": "tool", "content": original})
        twice = self.cap(once)
        self.assertEqual(twice["content"], once["content"])
        self.assertEqual(twice["content"].count(self.marker_prefix), 1)
        thrice = self.cap(twice)
        self.assertEqual(thrice["content"], once["content"])

    # ------------------ marker arithmetic ------------------
    def test_marker_reports_true_dropped_count(self):
        original = "z" * (self.tool_cap + 2000)
        out = self.cap({"role": "tool", "content": original})
        kept, dropped = self._kept_and_dropped(out["content"])
        self.assertEqual(len(original), len(kept) + dropped)

    # ------------------ end-to-end save() wiring ------------------
    def test_patched_save_writes_capped_json_and_keeps_live_object_full(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        sid_dir = Path(tmp.name) / "store"
        sid_dir.mkdir()

        models_path = Path(tmp.name) / "models_e2e.py"
        _make_models_fixture(models_path)
        proc = subprocess.run(
            ["python3", str(PATCHER), str(models_path)], capture_output=True, text=True
        )
        self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
        mod = _load_fixture_module("_patched_models_e2e", models_path)
        setattr(mod, "SESSION_DIR", sid_dir)

        big = "R" * 90000
        session = mod.Session(session_id="e2e", messages=[
            {"id": 9, "role": "tool", "content": big},
            {"id": 10, "role": "user", "content": "small"},
        ])
        session.save()
        persisted = json.loads((sid_dir / "e2e.json").read_text(encoding="utf-8"))
        capped_msg = persisted["messages"][0]
        self.assertIn(mod._VULPY_BOUNDS_MARKER_PREFIX, capped_msg["content"])
        kept, dropped = self._kept_and_dropped(
            capped_msg["content"]
        )
        self.assertEqual(len(big), len(kept) + dropped)
        self.assertEqual(capped_msg["id"], 9)
        # live object keeps the full body
        self.assertEqual(session.messages[0]["content"], big)


class InjectedParseCacheTests(unittest.TestCase):
    """Exercise the injected load-side parse cache against a temp store."""

    @classmethod
    def setUpClass(cls):
        tmp = tempfile.TemporaryDirectory()
        cls._tmp = tmp
        models = Path(tmp.name) / "models.py"
        _make_models_fixture(models)
        proc = subprocess.run(
            ["python3", str(PATCHER), str(models)], capture_output=True, text=True
        )
        assert proc.returncode == 0, proc.stderr + proc.stdout
        cls.models_mod = _load_fixture_module("_patched_models_cache_fixture", models)
        setattr(cls.models_mod, "SESSION_DIR", Path(tmp.name))
        # NOTE: read helpers via self.models_mod.<attr> — assigning plain
        # functions to class attributes would bind them as methods and shift
        # every call's argument list by one.
        cls.load_cached_ref = lambda self, p: self.models_mod.vulpy_load_with_parse_cache(p)  # noqa: E731
        cls.cache_reset_attr = cls.models_mod.vulpy_parse_cache_clear

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def setUp(self):
        self.models_mod.vulpy_parse_cache_clear()

    def _write_session(self, name: str, body: str) -> Path:
        p = Path(self._tmp.name) / name
        p.write_text(
            json.dumps({"messages": [{"content": body}], "role": "user"}),
            encoding="utf-8",
        )
        return p

    def test_key_shape_is_path_mtime_size_and_value_is_parsed_dict(self):
        p = self._write_session("hit.json", "one")
        data = self.models_mod.vulpy_load_with_parse_cache(p)
        self.assertEqual(data["messages"][0]["content"], "one")

        keys = [k for k in self.models_mod._VULPY_PARSE_CACHE if k[0] == str(p)]
        self.assertEqual(len(keys), 1)
        key = keys[0]
        st = p.stat()
        self.assertEqual(len(key), 3)  # (path, mtime_ns, size)
        self.assertEqual(key[1], st.st_mtime_ns)
        self.assertEqual(key[2], st.st_size)
        # warm entry serves an equivalent but isolated parsed dict (stat-hit
        # short-circuit must not expose the cache's mutable value).
        again = self.models_mod.vulpy_load_with_parse_cache(p)
        self.assertIsNot(again, data)
        self.assertEqual(again, data)

    def test_mutating_returned_parse_does_not_poison_cache(self):
        p = self._write_session("isolated.json", "original")
        first = self.models_mod.vulpy_load_with_parse_cache(p)
        first["messages"][0]["content"] = "poisoned"

        second = self.models_mod.vulpy_load_with_parse_cache(p)

        self.assertEqual(second["messages"][0]["content"], "original")
        self.assertIsNot(second, first)

    def test_write_invalidates_by_mtime_and_size(self):
        p = self._write_session("mut.json", "first")
        self.models_mod.vulpy_load_with_parse_cache(p)
        old_size = p.stat().st_size
        time.sleep(0.02)
        p.write_text(
            json.dumps({"messages": [{"content": "second"}]}), encoding="utf-8"
        )
        self.assertNotEqual(p.stat().st_size, old_size)
        d2 = self.models_mod.vulpy_load_with_parse_cache(p)
        self.assertEqual(d2["messages"][0]["content"], "second")
        # entry replaced, not duplicated
        keys = [k for k in self.models_mod._VULPY_PARSE_CACHE if k[0] == str(p)]
        self.assertEqual(len(keys), 1)
        self.assertEqual(keys[0][1], p.stat().st_mtime_ns)

    def test_lru_bound_at_capacity(self):
        limit = self.models_mod._VULPY_PARSE_CACHE_MAX_ENTRIES
        paths = []
        for i in range(limit + 4):
            paths.append(self._write_session(f"lru{i}.json", f"body-{i}"))
        for p in paths:
            self.models_mod.vulpy_load_with_parse_cache(p)
        cached_paths = {k[0] for k in self.models_mod._VULPY_PARSE_CACHE}
        self.assertEqual(len(cached_paths), limit)
        # oldest-inserted evicted; most recent retained
        self.assertNotIn(str(paths[0]), cached_paths)
        self.assertIn(str(paths[-1]), cached_paths)

    def test_corrupt_file_raises_like_plain_load(self):
        p = Path(self._tmp.name) / "bad.json"
        p.write_text("{not json", encoding="utf-8")
        with self.assertRaises(json.JSONDecodeError):
            self.models_mod.vulpy_load_with_parse_cache(p)

    def test_read_error_is_not_cached_negatively(self):
        missing = Path(self._tmp.name) / "ghost.json"
        with self.assertRaises(OSError):
            self.models_mod.vulpy_load_with_parse_cache(missing)
        self.assertFalse(
            any(k[0] == str(missing) for k in self.models_mod._VULPY_PARSE_CACHE)
        )
        # create it afterwards — picked up normally
        p = self._write_session("ghost.json", "now-here")
        d = self.models_mod.vulpy_load_with_parse_cache(p)
        self.assertEqual(d["messages"][0]["content"], "now-here")


if __name__ == "__main__":
    unittest.main()

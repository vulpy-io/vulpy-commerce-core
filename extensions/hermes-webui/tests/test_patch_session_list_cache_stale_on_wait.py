"""Unit tests for scripts/patch-session-list-cache-stale-on-wait.py.

§A fix: /api/sessions single-flight lock convoy. Today (routes.py
_get_cached_session_list_payload):

  1. a stale-by-source entry is NEVER served — cold waiters pile up on the
     rebuild Event while a huge invalidation-driven rebuild runs;
  2. after their 0.25 s wait, waiters with no stale value run builder()
     INLINE (the "safety path") → every sidebar poll serializes behind the
     slow rebuild instead of waiting on the inflight one.

Patch contract:
  - serve stale-on-wait: when an inflight rebuild exists AND a cached value
    exists but its stamp differs from the current source stamp, return it
    immediately (revalidation happens in background);
  - non-owners with NO stale value must NOT run builder() inline — they wait
    bounded on the inflight event and return whatever exists after; if truly
    nothing exists, return an empty shell payload dict.
  - invalidation semantics unchanged: writes that advance the global/profile
    invalidation version must still force real rebuilds for fresh callers.

Tests drive the patcher as a subprocess against the routes.py-shaped fixture,
then load the patched fixture and exercise behavior with controllable builders.
"""

import importlib.util
import hashlib
import os
import stat
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-session-list-cache-stale-on-wait.py"
MARK = "vulpy-session-list-cache-stale-on-wait"
# Drift probe: the distinctive first line of the safety-path anchor region.
ANCHOR_SAFETY_SNIPPET = "# Safety path if the owner died before storing anything."

# Keep the executable fixture small, but ensure it cannot silently outlive the
# current WebUI source shape. This fingerprint covers the complete injected
# helper + cache function region in the current operator image.
CURRENT_WEBUI_ROUTES = Path(
    os.environ.get("VULPY_WEBUI_ROUTES_SOURCE", "/app/hermes-webui/api/routes.py")
)
CURRENT_PATCHED_REGION_SHA256 = "2147abe3cb78cc6237ca81a2f25b0b762d253f97d4a86ad5ad9e0f0e5069fcef"

sys_path_setup = None  # noqa: E305 silence


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_stale_on_wait_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_routes_fixture(path: Path) -> None:
    # Same fixture body as tests/test_patch_session_store_bounds.py's routes
    # fixture generation (kept as its own copy so both files are standalone).
    fixture_path = Path(__file__).with_name(
        "test_patch_session_list_cache_stale_on_wait_fixture.py"
    )
    spec = importlib.util.spec_from_file_location(
        "_session_list_cache_stale_fixture_source", fixture_path
    )
    assert spec is not None and spec.loader is not None
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    fixture._make_routes_fixture(path)


def _load_fixture_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchStaleOnWaitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _run(self, *paths):
        return subprocess.run(
            ["python3", str(PATCHER), *[str(p) for p in paths]],
            capture_output=True,
            text=True,
        )

    def test_fresh_apply_marks_file(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        _make_routes_fixture(routes)

        result = self._run(routes)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        text = routes.read_text(encoding="utf-8")
        self.assertIn(MARK, text)
        # source-stale values are servable and the bounded fallback is an error,
        # not a successful empty list that would erase the sidebar.
        self.assertIn('stale_reason != "source"', text.replace('\\"', '"'))
        self.assertIn("session_list_cache_wait_timeout", text)

    def test_rerun_is_idempotent(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        _make_routes_fixture(routes)
        first = self._run(routes)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        before = routes.read_text(encoding="utf-8")
        second = self._run(routes)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(routes.read_text(encoding="utf-8"), before)

    def test_old_patched_fixture_is_upgraded_then_idempotent(self):
        """The sentinel must not hide the older empty-shell implementation."""
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        _make_routes_fixture(routes)
        pristine = routes.read_text(encoding="utf-8")
        old = pristine.replace(
            self.__class__.patcher.ANCHOR_SIGNATURE,
            self.__class__.patcher.OLD_REPLACEMENT_SIGNATURE,
        ).replace(
            self.__class__.patcher.ANCHOR_SAFETY_PATH,
            self.__class__.patcher.OLD_SAFETY_PATH,
        )
        routes.write_text(old, encoding="utf-8")
        self.assertIn("vulpy_empty_session_list_shell", old)
        self.assertIn("session_list_cache_empty_shell", old)

        first = self._run(routes)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        upgraded = routes.read_text(encoding="utf-8")
        self.assertNotIn("vulpy_empty_session_list_shell", upgraded)
        self.assertIn("session_list_cache_wait_timeout", upgraded)
        self.assertIn("stale_reason != \"source\"", upgraded)

        before = upgraded
        second = self._run(routes)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(routes.read_text(encoding="utf-8"), before)

    def test_apply_preserves_existing_readable_mode_across_idempotent_rerun(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        _make_routes_fixture(routes)
        os.chmod(routes, 0o644)

        first = self._run(routes)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        self.assertEqual(stat.S_IMODE(routes.stat().st_mode), 0o644)

        second = self._run(routes)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(stat.S_IMODE(routes.stat().st_mode), 0o644)

    def test_mutated_anchor_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        _make_routes_fixture(routes)
        text = routes.read_text(encoding="utf-8")
        routes.write_text(
            text.replace("# Safety path if the owner died before storing anything.", "# moved comment"),
            encoding="utf-8",
        )
        result = self._run(routes)
        self.assertEqual(result.returncode, 1)
        self.assertIn("anchor", result.stderr.lower())

    def test_wrong_arg_count_fails(self):
        result = subprocess.run(["python3", str(PATCHER)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Usage", result.stderr)

    def test_zero_anchor_extra_file_is_skipped_unchanged(self):
        """Live build passes routes.py AND route_session_list_cache.py; the
        cache module carries no §A anchors today. It must pass through
        untouched while the anchored file is patched."""
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        cache_mod = Path(tmp.name) / "route_session_list_cache.py"
        _make_routes_fixture(routes)
        cache_text = "# cache plumbing primitives (no payload fn here)\n\n\ndef get():\n    return {}\n"
        cache_mod.write_text(cache_text, encoding="utf-8")

        result = self._run(routes, cache_mod)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn(MARK, routes.read_text(encoding="utf-8"))
        self.assertEqual(cache_mod.read_text(encoding="utf-8"), cache_text)

    def test_no_target_matching_any_anchor_fails_loud(self):
        """Passing ONLY files without anchors must not silently succeed —
        that would let an upstream rename turn this build step into a no-op."""
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        a = Path(tmp.name) / "unrelated_a.py"
        b = Path(tmp.name) / "unrelated_b.py"
        a.write_text("x = 1\n", encoding="utf-8")
        b.write_text("y = 2\n", encoding="utf-8")

        result = self._run(a, b)
        self.assertEqual(result.returncode, 1)
        self.assertIn("anchor", result.stderr.lower())

    def test_partially_anchored_applicable_file_fails_loud(self):
        """A file carrying SOME §A anchors but not all must be refused —
        partial application of the convoy fix is worse than none."""
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        _make_routes_fixture(routes)
        text = routes.read_text(encoding="utf-8")
        # Drop ONLY the safety-path anchor, keeping the others: drifted file.
        routes.write_text(
            text.replace(ANCHOR_SAFETY_SNIPPET, "# moved"),
            encoding="utf-8",
        )
        result = self._run(routes)
        self.assertEqual(result.returncode, 1)
        self.assertIn("anchor", result.stderr.lower())

    def test_current_webui_source_matches_session_list_patch_fingerprint(self):
        """Fingerprint the current image source without editing the live file."""
        if not CURRENT_WEBUI_ROUTES.is_file():
            self.skipTest(f"current WebUI source unavailable: {CURRENT_WEBUI_ROUTES}")
        source = CURRENT_WEBUI_ROUTES.read_bytes()
        marker = b"# VULPY PATCH MARK: vulpy-session-list-cache-stale-on-wait\n"
        start = source.index(marker)
        end = source.find(b"\ndef _kanban_unknown_endpoint(", start)
        self.assertNotEqual(end, -1, "session-list patch boundary drifted")
        region = source[start:end]
        self.assertEqual(
            hashlib.sha256(region).hexdigest(),
            CURRENT_PATCHED_REGION_SHA256,
            "current WebUI session-list patch region is stale or changed; update the fixture/patcher deliberately",
        )


class StaleOnWaitBehaviorTests(unittest.TestCase):
    """Behavioral checks against a patched fixture with stubbed cache funcs."""

    @classmethod
    def setUpClass(cls):
        tmp = tempfile.TemporaryDirectory()
        cls._tmp = tmp
        routes = Path(tmp.name) / "routes_patched.py"
        _make_routes_fixture(routes)
        proc = subprocess.run(
            ["python3", str(PATCHER), str(routes)], capture_output=True, text=True
        )
        assert proc.returncode == 0, proc.stderr + proc.stdout
        cls.mod = _load_fixture_module("_patched_routes_stale_fixture", routes)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def setUp(self):
        mod = self.__class__.mod
        with mod._SESSIONS_CACHE_LOCK:
            mod._SESSIONS_CACHE.clear()
            mod._SESSIONS_CACHE_INFLIGHT.clear()
            setattr(mod, "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION",
                    getattr(mod, "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION") + 1)
            mod._SESSIONS_CACHE_PROFILE_INVALIDATION_VERSION.clear()
        mod._session_list_builder_calls["n"] = 0

    # ------------------------------------------------------------------
    def test_source_stale_entry_served_immediately_while_rebuild_inflight(self):
        mod = self.__class__.mod
        key = ("default",)
        old_stamp_call = {"stamp": ("stamp", ("default",))}
        # Prime the cache: set entry, then bump the GLOBAL VERSION so the
        # stored stamp no longer matches the resolved stamp (= source-stale,
        # previously never served).
        mod._session_list_cache_set(key, {"sessions": [{"old": True}]})
        setattr(mod, "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION",
                getattr(mod, "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION") + 1)

        gate = threading.Event()
        release = threading.Event()

        def slow_builder():
            gate.set()
            release.wait(5)
            return {"sessions": [{"new": True}]}

        served: dict = {}
        owner_started = threading.Event()

        def owner():
            got = mod._get_cached_session_list_payload(key=key, builder=slow_builder)
            served["owner"] = got
            owner_started.set()

        t_owner = threading.Thread(target=owner, daemon=True)
        t_owner.start()
        self.assertTrue(gate.wait(5))  # owner is inside the slow builder now

        t0 = time.monotonic()
        poller = mod._get_cached_session_list_payload(
            key=key, builder=lambda: (_ for _ in ()).throw(AssertionError("must not build inline"))
        )
        elapsed_ms = (time.monotonic() - t0) * 1000

        # The poller returned instantly with the STALE payload (source-stale!)
        self.assertLess(elapsed_ms, 1000, f"poller blocked {elapsed_ms:.0f} ms")
        self.assertEqual(poller, {"sessions": [{"old": True}]})

        release.set()
        t_owner.join(5)
        self.assertEqual(served.get("owner"), {"sessions": [{"new": True}]})

    def test_cold_poller_does_not_build_inline_waits_bounded(self):
        mod = self.__class__.mod
        key = ("cold",)
        started = threading.Event()
        release = threading.Event()

        def slow_builder():
            started.set()
            release.wait(5)
            return {"sessions": [{"built": True}]}

        served: dict = {}
        started_flag = threading.Event()

        def owner():
            got = mod._get_cached_session_list_payload(key=key, builder=slow_builder)
            served["owner"] = got
            started_flag.set()

        t_owner = threading.Thread(target=owner, daemon=True)
        t_owner.start()
        self.assertTrue(started.wait(5))

        inline_calls = {"n": 0}

        def counting_builder():
            inline_calls["n"] += 1
            return {"inline": True}

        t0 = time.monotonic()
        with self.assertRaisesRegex(TimeoutError, "still in flight"):
            mod._get_cached_session_list_payload(key=key, builder=counting_builder)
        elapsed = time.monotonic() - t0

        # Must NOT have built inline even though nothing was cached.
        self.assertEqual(inline_calls["n"], 0)
        # Bounded wait (~wait seconds), not full builder duration.
        self.assertLess(elapsed, 3.0)
        # Nothing cached + nothing fresh after wait must remain an error. A
        # successful empty payload makes sessions.js erase the visible list.

        release.set()
        t_owner.join(5)
        # After release, cache holds the built payload.

    def test_write_invalidation_still_forces_rebuild_for_fresh_caller(self):
        mod = self.__class__.mod
        key = ("inv",)
        # Warm cache.
        mod._get_cached_session_list_payload(
            key=key, builder=lambda: {"sessions": [{"v": 1}]}
        )
        # A write bumps the invalidation version (this is what
        # _session_list_cache_clear does via the version counters).
        setattr(mod, "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION",
                getattr(mod, "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION") + 1)
        # Fresh caller MUST see new data, not the stale entry.
        calls = {"n": 0}

        def builder():
            calls["n"] += 1
            return {"sessions": [{"v": 2}]}

        out = mod._get_cached_session_list_payload(key=key, builder=builder)
        self.assertEqual(out, {"sessions": [{"v": 2}]})
        self.assertEqual(calls["n"], 1)


if __name__ == "__main__":
    unittest.main()

"""Unit tests for scripts/patch-session-list-cache-background-rebuild.py.

§B fix: /api/sessions rebuild-owner path. Today (routes.py
_get_cached_session_list_payload) the thread that wins the single-owner claim
runs builder() INLINE in its own request thread — a 40-65s all_sessions()
projection that stalls the owning request while every waiter serializes behind
it on the GIL.

Patch contract:
  - the owner hands its builder() work to a dedicated background daemon thread
    (name="session-list-cache-background-rebuild") and returns immediately with
    the best available payload: stale if a cache entry exists, else a
    schema-valid empty shell ({"sessions": []}).
  - the background thread does exactly what the old owner loop did: read the
    invalidation stamp, run builder(), store via _session_list_cache_set when
    the stamp is unchanged, retry on stamp churn capped at 3 attempts, and
    release the inflight claim (via _session_list_cache_done) so waiters
    unblock on both success and timeout.
  - single-owner claim preserved: only ONE background rebuild per key.
  - diag stages session_list_cache_owner_background (on handoff) and
    session_list_cache_background_built (on store) expose the handoff in
    slow-request telemetry.

Tests drive the patcher as a subprocess against the routes.py-shaped fixture,
then load the patched fixture and exercise behavior with controllable builders.
The fresh-apply test also runs against a byte-copy of the CURRENT installed
/app/hermes-webui/api/routes.py to prove the anchors match live code.
"""

import importlib.util
import os
import stat
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-session-list-cache-background-rebuild.py"
MARK = "vulpy-session-list-cache-background-rebuild"
SENTINEL = "VULPY_SESSION_LIST_CACHE_BACKGROUND_REBUILD_PATCHED"
# Drift probe: a distinctive line of the owner-path anchor region.
ANCHOR_OWNER_SNIPPET = 'diag.stage("session_list_cache_rebuild_owner")'

CURRENT_WEBUI_ROUTES = Path(
    os.environ.get("VULPY_WEBUI_ROUTES_SOURCE", "/app/hermes-webui/api/routes.py")
)


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_background_rebuild_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_routes_fixture(path: Path) -> None:
    fixture_path = Path(__file__).with_name(
        "test_patch_session_list_cache_background_rebuild_fixture.py"
    )
    spec = importlib.util.spec_from_file_location(
        "_session_list_cache_background_fixture_source", fixture_path
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


class RecordingDiag:
    def __init__(self):
        self.stages = []

    def stage(self, name):
        self.stages.append(name)


class PatchBackgroundRebuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _run(self, *paths):
        return subprocess.run(
            ["python3", str(PATCHER), *[str(p) for p in paths]],
            capture_output=True,
            text=True,
        )

    def test_fresh_apply_marks_fixture(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        _make_routes_fixture(routes)

        result = self._run(routes)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        text = routes.read_text(encoding="utf-8")
        self.assertIn(MARK, text)
        self.assertIn(SENTINEL, text)
        # New owner shape: background thread + immediate NON-DESTRUCTIVE
        # return (stale rows, else TimeoutError) — the destructive empty shell
        # is gone.
        self.assertIn("session-list-cache-background-rebuild", text)
        self.assertIn("session_list_cache_owner_background", text)
        self.assertIn("session_list_cache_owner_pending", text)
        self.assertIn("session_list_cache_background_built", text)
        self.assertIn('raise TimeoutError("session list cache rebuild still in flight")', text)
        self.assertNotIn("def vulpy_empty_session_list_shell():", text)
        self.assertNotIn('return {"sessions": []}', text)

    def test_fresh_apply_on_byte_copy_of_current_webui_routes(self):
        """The anchors must match the CURRENT installed routes.py byte-for-byte
        (not a synthetic shape) — this is the build-time guarantee."""
        if not CURRENT_WEBUI_ROUTES.is_file():
            self.skipTest(f"current WebUI source unavailable: {CURRENT_WEBUI_ROUTES}")
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        routes.write_bytes(CURRENT_WEBUI_ROUTES.read_bytes())

        result = self._run(routes)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        text = routes.read_text(encoding="utf-8")
        self.assertIn(SENTINEL, text)
        self.assertIn("session-list-cache-background-rebuild", text)
        self.assertIn("session_list_cache_owner_background", text)
        self.assertIn("session_list_cache_background_built", text)
        # The old inline owner loop must be gone from the patched copy.
        self.assertNotIn('diag.stage("session_list_cache_rebuild_owner")', text)

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

    def test_old_shell_shape_upgrades_to_non_destructive_and_is_idempotent(self):
        """Upgrade coverage (task webui-settle-sidebar-reliability): a routes.py
        carrying the FIRST background-rebuild iteration (the injected
        vulpy_empty_session_list_shell + 'return stale if stale is not None else
        shell' owner path) is upgraded to the non-destructive contract (stale
        rows, else TimeoutError), converges with a fresh apply, and is
        idempotent on re-run."""
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        _make_routes_fixture(routes)
        # Apply the CURRENT patcher first, then downgrade the patched file to
        # the OLD shell shape (the first background-rebuild iteration).
        patched = self._run(routes)
        self.assertEqual(patched.returncode, 0, patched.stderr + patched.stdout)
        old = routes.read_text(encoding="utf-8").replace(
            self.__class__.patcher.REPLACEMENT_SIGNATURE,
            self.__class__.patcher.OLD_SIGNATURE,
        ).replace(
            self.__class__.patcher.REPLACEMENT_OWNER_PATH,
            self.__class__.patcher.OLD_OWNER_PATH,
        )
        routes.write_text(old, encoding="utf-8")
        self.assertIn("vulpy_empty_session_list_shell", old)
        self.assertIn("return stale if stale is not None else vulpy_empty_session_list_shell()", old)

        first = self._run(routes)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        upgraded = routes.read_text(encoding="utf-8")
        # The destructive empty-shell helper is gone...
        self.assertNotIn("def vulpy_empty_session_list_shell():", upgraded)
        self.assertNotIn('return {"sessions": []}', upgraded)
        # ...replaced by the non-destructive fail-the-request contract.
        self.assertIn("session_list_cache_owner_pending", upgraded)
        self.assertIn('raise TimeoutError("session list cache rebuild still in flight")', upgraded)
        self.assertIn("session_list_cache_owner_background", upgraded)

        # Convergence: a fresh apply produces the identical file.
        tmp2 = tempfile.TemporaryDirectory()
        self.addCleanup(tmp2.cleanup)
        routes2 = Path(tmp2.name) / "routes.py"
        _make_routes_fixture(routes2)
        fresh_result = self._run(routes2)
        self.assertEqual(fresh_result.returncode, 0, fresh_result.stderr + fresh_result.stdout)
        self.assertEqual(routes2.read_bytes(), routes.read_bytes())

        # Idempotent re-run on the upgraded file.
        before = upgraded
        second = self._run(routes)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(routes.read_text(encoding="utf-8"), before)

    def test_old_shell_shape_drift_fails_loudly(self):
        """Upgrade safety: a sentinel-bearing file whose old shell shape drifted
        must fail loudly instead of being silently upgraded."""
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        _make_routes_fixture(routes)
        pristine = routes.read_text(encoding="utf-8")
        old = pristine.replace(
            self.__class__.patcher.REPLACEMENT_SIGNATURE,
            self.__class__.patcher.OLD_SIGNATURE,
        ).replace(
            self.__class__.patcher.REPLACEMENT_OWNER_PATH,
            self.__class__.patcher.OLD_OWNER_PATH,
        )
        # Drift the old owner path (rename the shell helper call).
        old = old.replace(
            "vulpy_empty_session_list_shell()", "vulpy_empty_session_list_shellX()"
        )
        routes.write_text(old, encoding="utf-8")
        result = self._run(routes)
        self.assertEqual(result.returncode, 1)
        combined = (result.stdout + result.stderr).lower()
        self.assertIn("sentinel", combined)
        self.assertIn("does not match", combined)

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
            text.replace(
                'diag.stage("session_list_cache_rebuild_owner")',
                'diag.stage("renamed")',
            ),
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
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        cache_mod = Path(tmp.name) / "route_session_list_cache.py"
        _make_routes_fixture(routes)
        cache_text = "# cache plumbing primitives (no payload fn here)\n\ndef get():\n    return {}\n"
        cache_mod.write_text(cache_text, encoding="utf-8")

        result = self._run(routes, cache_mod)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn(MARK, routes.read_text(encoding="utf-8"))
        self.assertEqual(cache_mod.read_text(encoding="utf-8"), cache_text)

    def test_no_target_matching_any_anchor_fails_loud(self):
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
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        routes = Path(tmp.name) / "routes.py"
        _make_routes_fixture(routes)
        text = routes.read_text(encoding="utf-8")
        routes.write_text(
            text.replace(ANCHOR_OWNER_SNIPPET, 'diag.stage("moved")'),
            encoding="utf-8",
        )
        result = self._run(routes)
        self.assertEqual(result.returncode, 1)
        self.assertIn("anchor", result.stderr.lower())


class BackgroundRebuildBehaviorTests(unittest.TestCase):
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
        cls.mod = _load_fixture_module("_patched_routes_background_fixture", routes)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def setUp(self):
        mod = self.__class__.mod
        with mod._SESSIONS_CACHE_LOCK:
            mod._SESSIONS_CACHE.clear()
            mod._SESSIONS_CACHE_INFLIGHT.clear()
            setattr(
                mod,
                "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION",
                getattr(mod, "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION") + 1,
            )
            mod._SESSIONS_CACHE_PROFILE_INVALIDATION_VERSION.clear()
        mod._session_list_builder_calls["n"] = 0

    def _wait_inflight_released(self, mod, key, timeout=5.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline and key in mod._SESSIONS_CACHE_INFLIGHT:
            time.sleep(0.01)
        self.assertNotIn(key, mod._SESSIONS_CACHE_INFLIGHT)

    # ------------------------------------------------------------------
    def test_owner_cold_returns_shell_immediately_and_background_stores_fresh(self):
        """The 'real background, not a flag' proof: with nothing cached, the
        owner fails the request (TimeoutError, NOT a destructive empty shell)
        BEFORE the slow builder finishes, and the background thread stores the
        fresh payload afterward."""
        mod = self.__class__.mod
        key = ("cold-owner",)
        started = threading.Event()
        release = threading.Event()
        fresh = {"sessions": [{"built": True}]}

        def slow_builder():
            started.set()
            release.wait(5)
            return fresh

        t0 = time.monotonic()
        # The cold owner must never return {"sessions": []} as a visible
        # replacement — it fails the request so sessions.js preserves rows.
        with self.assertRaises(TimeoutError):
            mod._get_cached_session_list_payload(key=key, builder=slow_builder)
        elapsed = time.monotonic() - t0
        self.assertLess(elapsed, 1.0, f"owner blocked {elapsed:.2f}s on the builder")
        # Background rebuild claimed the key (single-owner held while building).
        self.assertTrue(started.is_set())
        self.assertIn(key, mod._SESSIONS_CACHE_INFLIGHT)

        release.set()
        self._wait_inflight_released(mod, key)
        val, is_fresh = mod._session_list_cache_get(key, allow_stale=True)
        self.assertEqual(val, fresh)
        self.assertTrue(is_fresh)

    # ------------------------------------------------------------------
    # Non-destructive cold-start contract (task webui-settle-sidebar-reliability):
    # a cold session-list cache rebuild must never hand the client a
    # schema-valid but EMPTY payload as if it were authoritative — that
    # makes the sidebar visibly empty while rows still exist server-side.
    # With nothing cached the owner must FAIL the request (TimeoutError)
    # so sessions.js preserves the last valid rows and retries.
    # ------------------------------------------------------------------
    def test_cold_owner_never_returns_empty_shell(self):
        """Sidebar-reliability contract: a cold rebuild must NEVER return
        {'sessions': []} as a visible authoritative replacement. The owner
        fails the request (TimeoutError) so the client preserves the last
        valid rows; the background rebuild still stores the fresh payload."""
        mod = self.__class__.mod
        key = ("cold-non-destructive",)
        started = threading.Event()
        release = threading.Event()
        fresh = {"sessions": [{"session_id": "s1"}]}

        def slow_builder():
            started.set()
            release.wait(5)
            return fresh

        t0 = time.monotonic()
        with self.assertRaises(TimeoutError):
            mod._get_cached_session_list_payload(key=key, builder=slow_builder)
        elapsed = time.monotonic() - t0
        self.assertLess(elapsed, 1.0, f"owner blocked {elapsed:.2f}s on the builder")
        # The background rebuild still ran (single-owner claim held)...
        self.assertTrue(started.is_set())
        self.assertIn(key, mod._SESSIONS_CACHE_INFLIGHT)

        release.set()
        self._wait_inflight_released(mod, key)
        val, is_fresh = mod._session_list_cache_get(key, allow_stale=True)
        self.assertEqual(val, fresh)
        self.assertTrue(is_fresh)

    def test_cold_owner_with_diag_records_pending_and_timeout(self):
        """The non-destructive owner records a pending diag stage on the cold
        path and never records a stored/background_built stage synchronously."""
        mod = self.__class__.mod
        key = ("cold-diag",)
        diag = RecordingDiag()
        started = threading.Event()
        release = threading.Event()
        fresh = {"sessions": [{"session_id": "s1"}]}

        def slow_builder():
            started.set()
            release.wait(5)
            return fresh

        with self.assertRaises(TimeoutError):
            mod._get_cached_session_list_payload(
                key=key, builder=slow_builder, diag=diag
            )
        self.assertIn("session_list_cache_owner_pending", diag.stages)
        self.assertNotIn("session_list_cache_owner_background", diag.stages)
        self.assertNotIn("session_list_cache_background_built", diag.stages)
        self.assertTrue(started.wait(5))

        release.set()
        self._wait_inflight_released(mod, key)
        self.assertIn("session_list_cache_background_built", diag.stages)

    def test_stale_owner_returns_stale_immediately_and_never_fails(self):
        """Sidebar-reliability contract: an owner WITH a stale cache entry
        returns the stale rows immediately (never a failure, never an empty
        replacement) while the background thread refreshes."""
        mod = self.__class__.mod
        key = ("stale-non-destructive",)
        mod._session_list_cache_set(key, {"sessions": [{"session_id": "old"}]})
        setattr(
            mod,
            "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION",
            getattr(mod, "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION") + 1,
        )
        started = threading.Event()
        release = threading.Event()
        fresh = {"sessions": [{"session_id": "fresh"}]}

        def slow_builder():
            started.set()
            release.wait(5)
            return fresh

        t0 = time.monotonic()
        out = mod._get_cached_session_list_payload(key=key, builder=slow_builder)
        elapsed = time.monotonic() - t0
        self.assertEqual(out, {"sessions": [{"session_id": "old"}]})
        self.assertLess(elapsed, 1.0, f"owner blocked {elapsed:.2f}s on the builder")

        release.set()
        self._wait_inflight_released(mod, key)
        val, is_fresh = mod._session_list_cache_get(key, allow_stale=True)
        self.assertEqual(val, fresh)

    def test_owner_with_stale_returns_stale_immediately_and_background_stores_fresh(self):
        mod = self.__class__.mod
        key = ("stale-owner",)
        # Prime an entry, then bump the global version -> source-stale (reaches
        # the rebuild-owner path, not the age-stale backgrounded path).
        mod._session_list_cache_set(key, {"sessions": [{"old": True}]})
        setattr(
            mod,
            "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION",
            getattr(mod, "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION") + 1,
        )
        started = threading.Event()
        release = threading.Event()
        fresh = {"sessions": [{"built": True}]}

        def slow_builder():
            started.set()
            release.wait(5)
            return fresh

        t0 = time.monotonic()
        out = mod._get_cached_session_list_payload(key=key, builder=slow_builder)
        elapsed = time.monotonic() - t0

        self.assertEqual(out, {"sessions": [{"old": True}]})
        self.assertLess(elapsed, 1.0, f"owner blocked {elapsed:.2f}s on the builder")
        self.assertIn(key, mod._SESSIONS_CACHE_INFLIGHT)

        release.set()
        self._wait_inflight_released(mod, key)
        val, is_fresh = mod._session_list_cache_get(key, allow_stale=True)
        self.assertEqual(val, fresh)

    def test_second_caller_does_not_run_parallel_rebuild_and_waits_bounded(self):
        """Only ONE background rebuild per key: a second caller arriving while
        the rebuild is inflight must NOT start a parallel builder — it waits
        bounded on the inflight event and the fresh value is stored once."""
        mod = self.__class__.mod
        key = ("single-owner",)
        started = threading.Event()
        release = threading.Event()
        fresh = {"sessions": [{"built": True}]}
        builder_calls = {"n": 0}

        def slow_builder():
            builder_calls["n"] += 1
            started.set()
            release.wait(5)
            return fresh

        owner_out = {}
        owner_done = threading.Event()

        def _owner():
            try:
                owner_out["v"] = mod._get_cached_session_list_payload(
                    key=key, builder=slow_builder
                )
            except TimeoutError as exc:
                owner_out["err"] = exc
            owner_done.set()

        t_owner = threading.Thread(target=_owner, daemon=True)
        t_owner.start()
        self.assertTrue(started.wait(5))
        self.assertTrue(owner_done.wait(5))
        # The cold owner FAILS the request (never a destructive empty shell) so
        # sessions.js preserves the last valid rows and retries.
        self.assertIn("err", owner_out)

        inline_calls = {"n": 0}

        def counting_builder():
            inline_calls["n"] += 1
            return {"inline": True}

        t0 = time.monotonic()
        with self.assertRaisesRegex(TimeoutError, "still in flight"):
            mod._get_cached_session_list_payload(key=key, builder=counting_builder)
        elapsed = time.monotonic() - t0
        self.assertEqual(inline_calls["n"], 0)  # never built inline / in parallel
        self.assertLess(elapsed, 3.0)  # bounded wait, not full builder duration

        release.set()
        t_owner.join(5)
        self.assertEqual(builder_calls["n"], 1)  # exactly one rebuild ran
        self._wait_inflight_released(mod, key)
        val, is_fresh = mod._session_list_cache_get(key, allow_stale=True)
        self.assertEqual(val, fresh)

    def test_invalidation_stamp_retry_capped_at_3(self):
        """When the source stamp churns on every build (e.g. concurrent writes
        during the projection), the background thread retries up to 3 attempts
        then gives up — matching the old owner-loop cap."""
        mod = self.__class__.mod
        key = ("churn",)
        calls = {"n": 0}

        def churn_builder():
            calls["n"] += 1
            setattr(
                mod,
                "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION",
                getattr(mod, "_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION") + 1,
            )
            return {"sessions": [{"v": calls["n"]}]}

        # Cold churn: nothing cached, so the owner fails the request instead
        # of returning a destructive empty shell.
        with self.assertRaises(TimeoutError):
            mod._get_cached_session_list_payload(key=key, builder=churn_builder)
        self._wait_inflight_released(mod, key)
        # 3 attempts, nothing stored (stamp churned every time).
        self.assertEqual(calls["n"], 3)
        val, is_fresh = mod._session_list_cache_get(key, allow_stale=True)
        self.assertIsNone(val)

    def test_diag_stages_record_handoff_and_background_build(self):
        mod = self.__class__.mod
        key = ("diag",)
        diag = RecordingDiag()
        started = threading.Event()
        release = threading.Event()
        fresh = {"sessions": [{"built": True}]}

        def slow_builder():
            started.set()
            release.wait(5)
            return fresh

        # Cold cache: the owner records the PENDING stage and fails the request.
        with self.assertRaises(TimeoutError):
            mod._get_cached_session_list_payload(
                key=key, builder=slow_builder, diag=diag
            )
        self.assertIn("session_list_cache_owner_pending", diag.stages)
        self.assertNotIn("session_list_cache_owner_background", diag.stages)
        self.assertTrue(started.wait(5))

        release.set()
        self._wait_inflight_released(mod, key)
        self.assertIn("session_list_cache_background_built", diag.stages)

    def test_waiters_unblock_on_inflight_event_after_background_store(self):
        """A waiter that starts AFTER the owner returns (but while the rebuild
        is inflight) unblocks on the event and reads the fresh value."""
        mod = self.__class__.mod
        key = ("waiter",)
        started = threading.Event()
        release = threading.Event()
        owner_done = threading.Event()
        fresh = {"sessions": [{"built": True}]}

        def slow_builder():
            started.set()
            release.wait(5)
            return fresh

        owner_out = {}
        owner_done = threading.Event()

        def _owner():
            try:
                owner_out["v"] = mod._get_cached_session_list_payload(
                    key=key, builder=slow_builder
                )
            except TimeoutError as exc:
                owner_out["err"] = exc
            owner_done.set()

        t_owner = threading.Thread(target=_owner, daemon=True)
        t_owner.start()
        self.assertTrue(started.wait(5))
        # The cold owner hands off to the background thread and fails the
        # request (never a destructive empty shell).
        self.assertTrue(owner_done.wait(5))
        self.assertIn("err", owner_out)

        waiter_results = {}

        def waiter():
            # No stale available; waits bounded on the inflight event. The
            # background store completes quickly after release -> fresh hit.
            try:
                waiter_results["v"] = mod._get_cached_session_list_payload(
                    key=key, builder=lambda: {"sessions": [{"never": True}]}
                )
            except TimeoutError as exc:
                waiter_results["err"] = exc

        t_waiter = threading.Thread(target=waiter, daemon=True)
        t_waiter.start()
        # Let the waiter reach the bounded event.wait() first.
        time.sleep(0.05)
        release.set()
        t_waiter.join(5)

        self.assertEqual(waiter_results.get("v"), fresh)
        self.assertNotIn("err", waiter_results)


if __name__ == "__main__":
    unittest.main()

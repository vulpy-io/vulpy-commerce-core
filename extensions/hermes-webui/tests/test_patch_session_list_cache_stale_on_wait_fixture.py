"""Shared routes.py-shaped fixture used by the stale-on-wait patcher tests.

Miniature of /app/hermes-webui/api/routes.py::_get_cached_session_list_payload
(the orchestration region lives in routes.py; the cache primitives live in
api/route_session_list_cache.py). The fixture reproduces both halves with
live-faithful stubs so behavior tests can drive the patched code standalone.

The region marked PATCH TARGET is verbatim from the live file (modulo nothing);
the stale-on-wait patcher keys its anchors on that text.
"""

import threading
from pathlib import Path

ROUTES_MARK = "vulpy-session-list-cache-stale-on-wait"

ROUTES_FIXTURE = '''"""Fixture routes module."""
import copy
import logging
import threading
import time
from collections import OrderedDict

logger = logging.getLogger(__name__)

_SESSIONS_CACHE_TTL_SECONDS = 2.5
_SESSIONS_CACHE_MAX_ENTRIES = 64
_SESSIONS_CACHE_STALE_WAIT_SECONDS = 0.10
_SESSIONS_CACHE_STREAMING_TTL_SECONDS = 12.0
_SESSIONS_CACHE_WAIT_SECONDS = 0.25
_SESSIONS_CACHE = OrderedDict()
_SESSIONS_CACHE_LOCK = threading.RLock()
_SESSIONS_CACHE_INFLIGHT = {}
_SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION = 0
_SESSIONS_CACHE_PROFILE_INVALIDATION_VERSION = {}


_session_list_builder_calls = {"n": 0}


def _session_list_cache_streaming_freeze_marker():
    return None


def _session_list_cache_profile_scope(profile):
    return profile


def _session_list_cache_invalidation_stamp(key):
    profile = key[0] if isinstance(key, tuple) and key else None
    return (
        _SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION,
        _SESSIONS_CACHE_PROFILE_INVALIDATION_VERSION.get(profile, 0),
    )


def _session_list_cache_resolved_source_stamp(key):
    return (("src", str(key)), _session_list_cache_invalidation_stamp(key))


def _session_list_cache_get(key, allow_stale=False):
    now = time.monotonic()
    current_stamp = _session_list_cache_resolved_source_stamp(key)
    with _SESSIONS_CACHE_LOCK:
        entry = _SESSIONS_CACHE.get(key)
        if not entry:
            return None, False
        ts, stamp, payload = entry
        if stamp != current_stamp:
            if allow_stale:
                _SESSIONS_CACHE.move_to_end(key)
                return copy.deepcopy(payload), False
            _SESSIONS_CACHE.pop(key, None)
            return None, False
        ttl = _SESSIONS_CACHE_TTL_SECONDS
        if _session_list_cache_streaming_freeze_marker() is not None:
            ttl = _SESSIONS_CACHE_STREAMING_TTL_SECONDS
        fresh = (now - ts) < ttl
        if fresh:
            _SESSIONS_CACHE.move_to_end(key)
            return copy.deepcopy(payload), True
        if allow_stale:
            _SESSIONS_CACHE.move_to_end(key)
            return copy.deepcopy(payload), False
        _SESSIONS_CACHE.pop(key, None)
        return None, False


def _session_list_cache_stale_reason(key):
    """Return why an existing cache entry is stale, if it is stale."""
    now = time.monotonic()
    current_stamp = _session_list_cache_resolved_source_stamp(key)
    with _SESSIONS_CACHE_LOCK:
        entry = _SESSIONS_CACHE.get(key)
        if not entry:
            return None
        ts, stamp, _payload = entry
        if stamp != current_stamp:
            return "source"
        ttl = _SESSIONS_CACHE_TTL_SECONDS
        if _session_list_cache_streaming_freeze_marker() is not None:
            ttl = _SESSIONS_CACHE_STREAMING_TTL_SECONDS
        if (now - ts) >= ttl:
            return "age"
        return None


def _session_list_cache_set(key, payload):
    if not isinstance(payload, dict):
        return
    stamp = _session_list_cache_resolved_source_stamp(key)
    with _SESSIONS_CACHE_LOCK:
        _SESSIONS_CACHE[key] = (time.monotonic(), stamp, copy.deepcopy(payload))
        _SESSIONS_CACHE.move_to_end(key)
        while len(_SESSIONS_CACHE) > _SESSIONS_CACHE_MAX_ENTRIES:
            _SESSIONS_CACHE.popitem(last=False)


def _session_list_cache_clear(profile=None):
    global _SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION
    normalized_profile = (
        _session_list_cache_profile_scope(profile) if profile else None
    )
    with _SESSIONS_CACHE_LOCK:
        _SESSIONS_CACHE.clear()
        _SESSIONS_CACHE_INFLIGHT.clear()
        _SESSIONS_CACHE_GLOBAL_INVALIDATION_VERSION += 1
        if normalized_profile:
            _SESSIONS_CACHE_PROFILE_INVALIDATION_VERSION[normalized_profile] = (
                _SESSIONS_CACHE_PROFILE_INVALIDATION_VERSION.get(normalized_profile, 0)
                + 1
            )


def _session_list_cache_claim_rebuild(key):
    with _SESSIONS_CACHE_LOCK:
        current = _SESSIONS_CACHE_INFLIGHT.get(key)
        if current is not None:
            return current, False
        event = threading.Event()
        _SESSIONS_CACHE_INFLIGHT[key] = event
        return event, True


def _session_list_cache_done(key, event):
    with _SESSIONS_CACHE_LOCK:
        if event is None:
            return
        if _SESSIONS_CACHE_INFLIGHT.get(key) is event:
            _SESSIONS_CACHE_INFLIGHT.pop(key, None)
    if event is not None:
        event.set()


def _build_payload_for_fixture(slow=0.0):
    _session_list_builder_calls["n"] += 1
    if slow:
        time.sleep(slow)
    return {"sessions": [{"n": _session_list_builder_calls["n"]}]}


def _get_cached_session_list_payload(
    *,
    key: tuple,
    builder,
    diag=None,
) -> dict:
    if diag is not None:
        try:
            diag.stage("session_list_cache_lookup")
        except Exception:
            pass

    cached, is_fresh = _session_list_cache_get(key, allow_stale=True)
    if cached is not None and is_fresh:
        if diag is not None:
            try:
                diag.stage("session_list_cache_hit")
            except Exception:
                pass
        return cached

    stale = cached  # now actually a stale payload when one exists, else None
    stale_reason = _session_list_cache_stale_reason(key) if stale is not None else None
    if stale is not None and stale_reason != "source":
        event, is_owner = _session_list_cache_claim_rebuild(key)
        if is_owner:
            if diag is not None:
                try:
                    diag.stage("session_list_cache_stale_background_rebuild")
                except Exception:
                    pass

            def _rebuild_stale_session_list_cache():
                try:
                    rebuild_attempts = 0
                    while True:
                        invalidation_stamp = _session_list_cache_invalidation_stamp(key)
                        try:
                            payload = builder()
                        except Exception:
                            logger.exception(
                                "session list stale-cache background rebuild failed"
                            )
                            return
                        if _session_list_cache_invalidation_stamp(key) == invalidation_stamp:
                            _session_list_cache_set(key, payload)
                            return
                        rebuild_attempts += 1
                        if rebuild_attempts >= 3:
                            return
                finally:
                    _session_list_cache_done(key, event)

            try:
                thread = threading.Thread(
                    target=_rebuild_stale_session_list_cache,
                    name="session-list-cache-rebuild",
                    daemon=True,
                )
                thread.start()
            except Exception:
                _session_list_cache_done(key, event)
        elif diag is not None:
            try:
                diag.stage("session_list_cache_stale_return")
            except Exception:
                pass
        return stale

    event, is_owner = _session_list_cache_claim_rebuild(key)
    if is_owner:
        if diag is not None:
            try:
                diag.stage("session_list_cache_rebuild_owner")
            except Exception:
                pass
        try:
            rebuild_attempts = 0
            while True:
                invalidation_stamp = _session_list_cache_invalidation_stamp(key)
                payload = builder()
                if _session_list_cache_invalidation_stamp(key) == invalidation_stamp:
                    _session_list_cache_set(key, payload)
                    if diag is not None:
                        try:
                            diag.stage("session_list_cache_stored")
                        except Exception:
                            pass
                    return payload
                rebuild_attempts += 1
                if diag is not None:
                    try:
                        diag.stage("session_list_cache_invalidated_during_rebuild")
                    except Exception:
                        pass
                if rebuild_attempts >= 3:
                    return payload
        finally:
            _session_list_cache_done(key, event)

    if diag is not None:
        try:
            if stale is not None:
                diag.stage("session_list_cache_wait_stale")
            else:
                diag.stage("session_list_cache_wait")
        except Exception:
            pass

    if stale is not None:
        timeout = _SESSIONS_CACHE_STALE_WAIT_SECONDS
    else:
        timeout = _SESSIONS_CACHE_WAIT_SECONDS
    event.wait(timeout)

    latest, is_fresh = _session_list_cache_get(key, allow_stale=False)
    if latest is not None:
        if diag is not None:
            try:
                diag.stage("session_list_cache_wait_hit")
            except Exception:
                pass
        return latest

    if stale is not None:
        if diag is not None:
            try:
                diag.stage("session_list_cache_wait_stale_fallback")
            except Exception:
                pass
        return stale

    # Safety path if the owner died before storing anything.
    if diag is not None:
        try:
            diag.stage("session_list_cache_fallback_rebuild")
        except Exception:
            pass
    invalidation_stamp = _session_list_cache_invalidation_stamp(key)
    payload = builder()
    if _session_list_cache_invalidation_stamp(key) == invalidation_stamp:
        _session_list_cache_set(key, payload)
    return payload
'''


def make_routes_fixture(path: Path) -> None:
    path.write_text(ROUTES_FIXTURE, encoding="utf-8")


# Back-compat alias for older test modules importing _make_routes_fixture.
_make_routes_fixture = make_routes_fixture


def _self_check() -> None:
    """Compile the embedded fixture to catch drift early."""
    compile(ROUTES_FIXTURE, "<routes-fixture>", "exec")


_self_check()

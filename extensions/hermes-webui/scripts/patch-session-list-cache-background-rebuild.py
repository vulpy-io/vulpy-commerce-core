#!/usr/bin/env python3
"""§B background-rebuild fix patcher for the hermes-webui session list cache.

Defect fixed (routes.py::_get_cached_session_list_payload, owner path): the
thread that wins the single-owner rebuild claim runs builder() INLINE in its
own request thread — a 40-65s all_sessions() projection that stalls the owning
request while every waiter serializes behind it on the GIL.

Fix contract (verified against tests/test_patch_session_list_cache_background_rebuild.py):

  - The owner hands its builder() work to a dedicated background daemon thread
    (name="session-list-cache-background-rebuild") and returns immediately
    with the best available NON-DESTRUCTIVE payload:
      * stale rows if a cache entry exists — the sidebar keeps showing the
        last known sessions while the background thread refreshes;
      * on a COLD cache (no entry at all) the owner FAILS the request with
        TimeoutError("session list cache rebuild still in flight") instead of
        returning a schema-valid empty shell. A `{"sessions": []}` success
        would replace the sidebar rows client-side and visibly erase
        conversations that still exist server-side (task
        webui-settle-sidebar-reliability); failing the request makes
        sessions.js preserve the last valid rows and retry.
  - The background thread does exactly what the old owner loop did: read the
    invalidation stamp, run builder(), store via _session_list_cache_set when
    the stamp is unchanged, retry on stamp churn capped at 3 attempts, and
    release the inflight claim (via _session_list_cache_done) so waiters
    unblock on both success and timeout.
  - Single-owner claim preserved: only ONE background rebuild runs per key.
  - Diag stages: session_list_cache_owner_background (stale handoff),
    session_list_cache_owner_pending (cold handoff) and
    session_list_cache_background_built (on store) expose the handoff in
    slow-request telemetry.

Mechanics: routes.py / route layers are generated upstream, so this patcher
edits files in place using verbatim live-code anchors, marks applied files
with VULPY_SESSION_LIST_CACHE_BACKGROUND_REBUILD_PATCHED, is idempotent, and
fails loudly (exit 1, message on stderr) on any anchor drift — never partially.

NOTE on patch ordering: this patcher runs AFTER
patch-session-list-cache-stale-on-wait.py in Dockerfile.hermes (fresh upstream
file → stale-on-wait → background-rebuild). It anchors on the stale-on-wait
patched shape. Re-running the stale-on-wait patcher afterwards would fail loud
on its old-shape upgrade check — that is by design (patchers must not be
re-run out of order) and the build never re-runs them.
"""

from __future__ import annotations

import sys
import os
from pathlib import Path

MARK = "vulpy-session-list-cache-background-rebuild"
SENTINEL = "VULPY_SESSION_LIST_CACHE_BACKGROUND_REBUILD_PATCHED"

# Anchor 1: the module-level signature of _get_cached_session_list_payload,
# carrying the stale-on-wait patch mark from the previous build step. The
# replacement is identical (the injected empty-shell helper from the earlier
# background-rebuild iteration is gone — the cold owner now fails the request
# instead of returning {"sessions": []}, see the module docstring).
ANCHOR_SIGNATURE = '''# VULPY PATCH MARK: vulpy-session-list-cache-stale-on-wait
def _get_cached_session_list_payload(
    *,
    key: tuple,
    builder,
    diag=None,
) -> dict:'''

REPLACEMENT_SIGNATURE = ANCHOR_SIGNATURE

# Anchor 2: the owner path that runs builder() inline in the request thread.
ANCHOR_OWNER_PATH = '''    event, is_owner = _session_list_cache_claim_rebuild(key)
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
            _session_list_cache_done(key, event)'''

REPLACEMENT_OWNER_PATH = '''    event, is_owner = _session_list_cache_claim_rebuild(key)
    if is_owner:
        # VULPY PATCH MARK: %MARK%
        # %SENTINEL%: the rebuild owner hands builder() to a dedicated daemon
        # thread and returns immediately with the best NON-DESTRUCTIVE payload:
        # stale rows when a cache entry exists, otherwise it FAILS the request
        # with TimeoutError so the sidebar keeps its last valid rows and
        # retries. Previously the owner ran the 40-65s all_sessions()
        # projection INLINE (stalling its own request), and the first
        # background-rebuild iteration returned a schema-valid {\"sessions\": []}
        # shell on a cold cache — which the client painted as an authoritative
        # empty sidebar, visibly erasing conversations that still exist
        # server-side (task webui-settle-sidebar-reliability).
        if diag is not None:
            try:
                diag.stage("session_list_cache_owner_pending" if stale is None else "session_list_cache_owner_background")
            except Exception:
                pass

        def _background_rebuild_session_list_cache():
            try:
                rebuild_attempts = 0
                while True:
                    invalidation_stamp = _session_list_cache_invalidation_stamp(key)
                    try:
                        payload = builder()
                    except Exception:
                        logger.exception(
                            "session list background rebuild failed"
                        )
                        return
                    if _session_list_cache_invalidation_stamp(key) == invalidation_stamp:
                        _session_list_cache_set(key, payload)
                        if diag is not None:
                            try:
                                diag.stage("session_list_cache_background_built")
                            except Exception:
                                pass
                        return
                    rebuild_attempts += 1
                    if rebuild_attempts >= 3:
                        return
            finally:
                _session_list_cache_done(key, event)

        try:
            thread = threading.Thread(
                target=_background_rebuild_session_list_cache,
                name="session-list-cache-background-rebuild",
                daemon=True,
            )
            thread.start()
        except Exception:
            _session_list_cache_done(key, event)
        if stale is not None:
            return stale
        # Cold cache: no rows exist to serve — fail the request instead of
        # returning a schema-valid empty shell that would erase the sidebar.
        # sessions.js preserves the last valid rows and retries.
        raise TimeoutError("session list cache rebuild still in flight")'''.replace(
    "%MARK%", MARK
).replace("%SENTINEL%", SENTINEL)

PAIRS = (
    (ANCHOR_SIGNATURE, REPLACEMENT_SIGNATURE),
    (ANCHOR_OWNER_PATH, REPLACEMENT_OWNER_PATH),
)

# ---------------------------------------------------------------------------
# Upgrade path: the FIRST background-rebuild iteration (feat(webui):
# background the session-list cache rebuild-owner path, e9f920c4) injected a
# module-level vulpy_empty_session_list_shell() and returned that shell to a
# COLD owner — a schema-valid {"sessions": []} that the client painted as an
# authoritative empty sidebar. That shape must migrate to the non-destructive
# contract (stale rows, else TimeoutError). These constants are the EXACT
# old-shape blocks; any drift fails loudly instead of a speculative edit.
# ---------------------------------------------------------------------------
OLD_SIGNATURE = '''# VULPY PATCH MARK: vulpy-session-list-cache-stale-on-wait
# VULPY_SESSION_LIST_CACHE_BACKGROUND_REBUILD_PATCHED: marker module-level helper injected by
# extensions/hermes-webui/scripts/patch-session-list-cache-background-rebuild.py
def vulpy_empty_session_list_shell():
    """VULPY: minimal schema-valid /api/sessions payload for starved owners."""
    return {"sessions": []}


def _get_cached_session_list_payload(
    *,
    key: tuple,
    builder,
    diag=None,
) -> dict:'''

OLD_OWNER_PATH = '''    event, is_owner = _session_list_cache_claim_rebuild(key)
    if is_owner:
        # VULPY PATCH MARK: vulpy-session-list-cache-background-rebuild
        # VULPY_SESSION_LIST_CACHE_BACKGROUND_REBUILD_PATCHED: the rebuild owner hands builder() to a dedicated daemon
        # thread and returns immediately with the best available payload (stale
        # if present, else an empty shell). Previously the owner ran the 40-65s
        # all_sessions() projection INLINE, stalling its own request while every
        # waiter serialized behind it on the GIL.
        if diag is not None:
            try:
                diag.stage("session_list_cache_owner_background")
            except Exception:
                pass

        def _background_rebuild_session_list_cache():
            try:
                rebuild_attempts = 0
                while True:
                    invalidation_stamp = _session_list_cache_invalidation_stamp(key)
                    try:
                        payload = builder()
                    except Exception:
                        logger.exception(
                            "session list background rebuild failed"
                        )
                        return
                    if _session_list_cache_invalidation_stamp(key) == invalidation_stamp:
                        _session_list_cache_set(key, payload)
                        if diag is not None:
                            try:
                                diag.stage("session_list_cache_background_built")
                            except Exception:
                                pass
                        return
                    rebuild_attempts += 1
                    if rebuild_attempts >= 3:
                        return
            finally:
                _session_list_cache_done(key, event)

        try:
            thread = threading.Thread(
                target=_background_rebuild_session_list_cache,
                name="session-list-cache-background-rebuild",
                daemon=True,
            )
            thread.start()
        except Exception:
            _session_list_cache_done(key, event)
        return stale if stale is not None else vulpy_empty_session_list_shell()'''

UPGRADE_PAIRS = (
    (OLD_SIGNATURE, REPLACEMENT_SIGNATURE),
    (OLD_OWNER_PATH, REPLACEMENT_OWNER_PATH),
)


def _fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def _apply_pairs(src: str, pairs) -> str:
    out = src
    for anchor, replacement in pairs:
        out = out.replace(anchor, replacement)
    return out


def _current_shape_ok(src: str) -> bool:
    """True when the file already carries exactly the current patched shape."""
    return (
        src.count(REPLACEMENT_SIGNATURE) == 1
        and src.count(REPLACEMENT_OWNER_PATH) == 1
        and src.count(ANCHOR_OWNER_PATH) == 0
        and src.count("session_list_cache_owner_background") == 1
        and src.count("session_list_cache_owner_pending") == 1
        and src.count("session_list_cache_background_built") == 1
        and src.count("def vulpy_empty_session_list_shell():") == 0
    )


def apply_patch(path: Path) -> bool:
    """Patch ``path`` in place.

    Returns True = changed, False = already patched.
    Raises SystemExit(1) on drift or partial-anchor presence.

    A file carrying NONE of this patcher's anchors is passed through
    unchanged (route_session_list_cache.py currently has no §B surface);
    a file carrying SOME but not ALL applicable anchors is refused —
    partial application of the background-rebuild fix is worse than none.
    """
    src = path.read_text(encoding="utf-8")

    if SENTINEL in src:
        if _current_shape_ok(src):
            print(f"{path}: already patched ({MARK}) — skipping")
            return False
        # Upgrade path: the FIRST background-rebuild iteration injected
        # vulpy_empty_session_list_shell() and returned {"sessions": []} to a
        # COLD owner. Migrate that exact old shape to the non-destructive
        # contract (stale rows, else TimeoutError). Any drift fails loudly.
        n_old_sig = src.count(OLD_SIGNATURE)
        n_old_owner = src.count(OLD_OWNER_PATH)
        if n_old_sig == 1 and n_old_owner == 1:
            out = _apply_pairs(src, UPGRADE_PAIRS)
            return _write_patched_file(path, out)
        _fail(
            f"{path}: sentinel present but the background-rebuild patch shape "
            "does not match — refusing speculative edit (upstream file drifted "
            "or patches were applied out of order)"
        )

    present = [anchor for anchor, _ in PAIRS if anchor in src]
    if not present:
        print(f"{path}: no §B anchors found — passing through unchanged")
        return False

    for anchor, _ in PAIRS:
        count = src.count(anchor)
        if count != 1:
            _fail(
                f"{path}: expected exactly 1 occurrence of patch anchor, "
                f"found {count}:\n---\n{anchor[:160]}\n---\n"
                f"(upstream file drifted; refusing speculative edit)"
            )

    out = _apply_pairs(src, PAIRS)

    return _write_patched_file(path, out)


def _write_patched_file(path: Path, out: str) -> bool:
    import tempfile

    original_mode = path.stat().st_mode & 0o777
    tmp_path = Path(tempfile.mkstemp(dir=str(path.parent), prefix=path.name)[1])
    try:
        tmp_path.write_text(out, encoding="utf-8")
        compile(out, str(path), "exec")  # fail before replacing on syntax drift
        tmp_path.replace(path)
        os.chmod(path, original_mode)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

    print(f"{path}: patched ({MARK})")
    return True


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(f"Usage: {Path(argv[0]).name} <file-to-patch> [...]", file=sys.stderr)
        raise SystemExit(1)
    changed = 0
    matched = 0
    for target in argv[1:]:
        path = Path(target)
        src_probe = path.read_text(encoding="utf-8")
        if SENTINEL in src_probe or any(anchor in src_probe for anchor, _ in PAIRS):
            matched += 1
        if apply_patch(path):
            changed += 1
    if matched == 0:
        _fail(
            "none of the given files carry the §B anchors — refusing to "
            "succeed as a silent no-op (upstream rename? wrong targets?)"
        )
    print(f"patched {changed} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

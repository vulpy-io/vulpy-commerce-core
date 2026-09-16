#!/usr/bin/env python3
"""§A stale-on-wait fix patcher for the hermes-webui session list cache.

Defects fixed (routes.py::_get_cached_session_list_payload):

  1. While a rebuild is inflight, waiters holding a source-stale entry still
     burn their whole STALE_WAIT_TIMEOUT before falling back — and the pop on
     read destroys the only cached copy for later pollers.
  2. Cold waiters with NO stale value run builder() INLINE after their bounded
     wait (the "safety path") — every sidebar poll serializes behind the slow
     rebuild instead of waiting on the inflight one.

Fix contract (verified against tests/test_patch_session_list_cache_stale_on_wait.py):

  - When a rebuild is already inflight AND any cached value exists, serve it
    immediately — even when its source stamp differs (the inflight rebuild
    refreshes the cache for subsequent polls).
  - With no rebuild inflight, source-invalidated callers keep the synchronous
    rebuild path so writes that bump the invalidation version still deliver
    fresh data to the next caller.
  - Non-owners never run builder() inline: after the bounded wait they return
    an empty, schema-valid shell payload when nothing usable is cached.

Mechanics: routes.py / route layers are generated upstream, so this patcher
edits files in place using verbatim live-code anchors, marks applied files
with VULPY_SESSION_LIST_CACHE_STALE_ON_WAIT_PATCHED, is idempotent, and fails
loudly (exit 1, message on stderr) on any anchor drift — never partially.
"""

from __future__ import annotations

import sys
import os
from pathlib import Path

MARK = "vulpy-session-list-cache-stale-on-wait"
SENTINEL = "VULPY_SESSION_LIST_CACHE_STALE_ON_WAIT_PATCHED"

ANCHOR_SIGNATURE = '''def _get_cached_session_list_payload(
    *,
    key: tuple,
    builder,
    diag=None,
) -> dict:'''

REPLACEMENT_SIGNATURE = '''# VULPY PATCH MARK: %MARK%
def _get_cached_session_list_payload(
    *,
    key: tuple,
    builder,
    diag=None,
) -> dict:'''.replace("%MARK%", MARK).replace("%SENTINEL%", SENTINEL)

OLD_REPLACEMENT_SIGNATURE = '''# VULPY PATCH MARK: %MARK%
# %SENTINEL%: marker module-level helpers below are injected by
# extensions/hermes-webui/scripts/patch-session-list-cache-stale-on-wait.py
def vulpy_empty_session_list_shell():
    """§A: minimal schema-valid /api/sessions payload for starved waiters."""
    return {"sessions": []}


def _get_cached_session_list_payload(
    *,
    key: tuple,
    builder,
    diag=None,
) -> dict:'''.replace("%MARK%", MARK).replace("%SENTINEL%", SENTINEL)

ANCHOR_STALE_REASON = '''    stale = cached  # now actually a stale payload when one exists, else None
    stale_reason = _session_list_cache_stale_reason(key) if stale is not None else None
'''

REPLACEMENT_STALE_REASON = '''    stale = cached  # now actually a stale payload when one exists, else None
    stale_reason = _session_list_cache_stale_reason(key) if stale is not None else None
    # %SENTINEL% §A stale-on-wait: while a rebuild is already inflight, serve
    # any cached value immediately — even when its source stamp differs. The
    # inflight rebuild refreshes the cache for subsequent polls; making these
    # waiters queue behind it turns /api/sessions into a lock convoy.
    if stale is not None and _SESSIONS_CACHE_INFLIGHT.get(key) is not None:
        if diag is not None:
            try:
                diag.stage("session_list_cache_stale_on_wait_hit")
            except Exception:
                pass
        return stale
'''.replace("%SENTINEL%", SENTINEL)

ANCHOR_SAFETY_PATH = '''    # Safety path if the owner died before storing anything.
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

REPLACEMENT_SAFETY_PATH = '''    # %SENTINEL% §A: the inflight owner may still be building; running
    # builder() here INLINE (old "safety path") serialized every sidebar poll
    # behind the slow rebuild. Nothing usable is cached after the bounded
    # wait — fail the request so sessions.js preserves the last valid rows;
    # a successful empty shell would erase the sidebar.
    if diag is not None:
        try:
            diag.stage("session_list_cache_wait_timeout")
        except Exception:
            pass
    raise TimeoutError("session list cache rebuild still in flight")
'''.replace("%SENTINEL%", SENTINEL)

OLD_SAFETY_PATH = '''    # %SENTINEL% §A: the inflight owner may still be building; running
    # builder() here INLINE (old "safety path") serialized every sidebar poll
    # behind the slow rebuild. Nothing usable is cached after the bounded
    # wait — hand back an empty shell and let the inflight rebuild (or the
    # next poll) deliver real rows.
    if diag is not None:
        try:
            diag.stage("session_list_cache_empty_shell")
        except Exception:
            pass
    return vulpy_empty_session_list_shell()
'''.replace("%SENTINEL%", SENTINEL)

PAIRS = (
    (ANCHOR_SAFETY_PATH, REPLACEMENT_SAFETY_PATH),
    (ANCHOR_STALE_REASON, REPLACEMENT_STALE_REASON),
    (ANCHOR_SIGNATURE, REPLACEMENT_SIGNATURE),
)


def _fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def _apply_pairs(src: str, pairs) -> str:
    out = src
    for anchor, replacement in pairs:
        out = out.replace(anchor, replacement)
    return out


def apply_patch(path: Path) -> bool:
    """Patch ``path`` in place.

    Returns True = changed, False = already patched.
    Raises SystemExit(1) on drift or partial-anchor presence.

    A file carrying NONE of this patcher's anchors is passed through
    unchanged (route_session_list_cache.py currently has no §A surface);
    a file carrying SOME but not ALL applicable anchors is refused —
    partial application of the convoy fix is worse than none.
    """
    src = path.read_text(encoding="utf-8")

    if SENTINEL in src:
        new_shape = (
            src.count(REPLACEMENT_SIGNATURE) == 1
            and src.count(REPLACEMENT_SAFETY_PATH) == 1
        )
        old_shape = (
            src.count(OLD_REPLACEMENT_SIGNATURE) == 1
            and src.count(OLD_SAFETY_PATH) == 1
        )
        if new_shape and "vulpy_empty_session_list_shell" not in src:
            print(f"{path}: already patched ({MARK}) — skipping")
            return False
        if not old_shape:
            _fail(
                f"{path}: sentinel has neither the current nor the known old "
                "stale-cache patch shape — refusing speculative upgrade"
            )
        out = src.replace(OLD_REPLACEMENT_SIGNATURE, REPLACEMENT_SIGNATURE)
        out = out.replace(OLD_SAFETY_PATH, REPLACEMENT_SAFETY_PATH)
        if "vulpy_empty_session_list_shell" in out:
            _fail(f"{path}: old stale-cache helper remained after upgrade")
        return _write_patched_file(path, out)

    present = [anchor for anchor, _ in PAIRS if anchor in src]
    if not present:
        print(f"{path}: no §A anchors found — passing through unchanged")
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
            "none of the given files carry the §A anchors — refusing to "
            "succeed as a silent no-op (upstream rename? wrong targets?)"
        )
    print(f"patched {changed} file(s)")
    return 0


import tempfile

if __name__ == "__main__":
    sys.exit(main(sys.argv))

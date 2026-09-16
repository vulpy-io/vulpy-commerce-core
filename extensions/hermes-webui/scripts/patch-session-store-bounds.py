#!/usr/bin/env python3
"""patch-session-store-bounds.py

Bound the WebUI session-file store (brief:
.hermes/tasks/webui-session-store-bounds.md, main spec — write-time cap +
read-time parse fast-path). Two independent layers, both patched here:

1. WRITE-TIME CAP (root cause of unbounded <sid>.json growth)
   Session.save() (api/models.py) serialized every message verbatim. Oversized
   tool-result bodies (measured 77 KB single rows; 29 MB transcripts) land on
   disk and every poll re-reads + re-parses them.
   Fix: before json.dumps in save(), deep-copy messages into a bounded
   "persisted form": any string body above the role-aware cap becomes
   head + "…[vulpy-truncated N chars]". Tool-ish rows cap at 8,192 chars,
   user/assistant at 16,000. The in-memory session object is never mutated
   (live-turn streaming keeps full bodies); idempotent (an existing truncation
   marker is left untouched, marker arithmetic stays exact); message `id`
   fields are preserved so the state.db dedupe contract keeps matching.

2. READ-TIME PARSE FAST-PATH (poll latency)
   Session.load() re-read + re-parsed the whole file for every poll even when
   nothing changed. Fix: per-process LRU cache keyed (path, mtime_ns, size)
   holding the parsed dict; a stat match skips read+parse entirely; any write
   changes mtime_ns or size → miss → invalidate+reparse. Memory-bound at 8
   sessions.

Injection targets (upstream api/models.py, never rebuilt):
  Anchor A: ``meta['messages'] = self.messages``      (save payload assembly)
            followed by the json.dumps payload line
  Anchor B: ``data = json.loads(p.read_text(encoding='utf-8'))``  (load)

Applied by: Dockerfile.hermes (build-time, fails loudly on anchor drift).

Idempotent: re-run prints "already patched" and exits 0 without changes.
"""

import sys
from pathlib import Path

IDEMPOTENCY_MARK = "vulpy-session-store-bounds"

ANCHOR_SAVE_ASSIGN = "meta['messages'] = self.messages"
ANCHOR_SAVE_DUMPS_PREFIX = "payload = json.dumps({**meta, **extra}, ensure_ascii=False, indent=2)"
ANCHOR_LOAD_PARSE = "data = json.loads(p.read_text(encoding='utf-8'))"

# Injected right after "import copy" region anchor used below.
MODELS_IMPORT_ANCHOR = "# vulpy-session-store-bounds: imports for bounded persistence"

INJECTED_TOP = '''\
# vulpy-session-store-bounds: bounded session persistence + parse fast-path.
# Write-time cap constants and helpers (see .hermes/tasks/webui-session-store-bounds.md).
_VULPY_TOOL_BODY_CAP_CHARS = 8192     # tool results are the bloat source
_VULPY_TEXT_BODY_CAP_CHARS = 16000    # user/assistant visible history gets more headroom
_VULPY_BOUNDS_MARKER_PREFIX = "\\u2026[vulpy-truncated "
_VULPY_BOUNDS_UNBOUNDED_KEYS = frozenset({"id", "message_id"})
# Per-process parsed-session LRU keyed (path, mtime_ns, size) → parsed dict.
_VULPY_PARSE_CACHE: "OrderedDict[tuple, tuple]" = OrderedDict()
_VULPY_PARSE_CACHE_MAX_ENTRIES = 8
_VULPY_PARSE_CACHE_LOCK = threading.Lock()


def _vulpy_bounds_cap_for_role(role) -> int:
    try:
        role_key = str(role or "").strip().lower()
    except Exception:
        role_key = ""
    if role_key in {"user", "assistant"}:
        return _VULPY_TEXT_BODY_CAP_CHARS
    # tool results (and unknown/system roles) get the tight cap
    return _VULPY_TOOL_BODY_CAP_CHARS


def _vulpy_bounds_truncate_string(value: str, cap: int) -> str:
    """Head + exact-remainder marker. Idempotent: already-marked values pass through."""
    if not isinstance(value, str) or len(value) <= cap:
        return value
    head = value[:cap]
    if _VULPY_BOUNDS_MARKER_PREFIX in value:
        # Already truncated once (re-save of loaded data): keep as-is so the
        # marker arithmetic is never recomputed/doubled.
        return value
    dropped = len(value) - len(head)
    return f"{head}{_VULPY_BOUNDS_MARKER_PREFIX} {dropped} chars]"


def _vulpy_bounds_cap_value(value, cap: int, depth: int = 0):
    if depth > 6:
        return value
    if isinstance(value, str):
        return _vulpy_bounds_truncate_string(value, cap)
    if isinstance(value, list):
        return [_vulpy_bounds_cap_value(item, cap, depth + 1) for item in value]
    if isinstance(value, tuple):
        return tuple(_vulpy_bounds_cap_value(item, cap, depth + 1) for item in value)
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if key in _VULPY_BOUNDS_UNBOUNDED_KEYS:
                # Preserve row identity: state.db dedupe keys match on id fields.
                out[key] = item
            else:
                out[key] = _vulpy_bounds_cap_value(item, cap, depth + 1)
        return out
    return value


def vulpy_cap_message_bodies_for_disk(messages):
    """Return a capped deep-ish copy of ``messages`` for the persisted JSON only.

    Accepts either a single message dict or a list of message dicts.
    The live in-memory object is never mutated — streaming turns keep full bodies.
    """
    if isinstance(messages, dict):
        return _vulpy_bounds_cap_message(messages)
    if not isinstance(messages, list):
        return messages
    capped = []
    for msg in messages:
        capped.append(_vulpy_bounds_cap_message(msg))
    return capped


def _vulpy_bounds_cap_message(msg):
    if not isinstance(msg, dict):
        return msg
    cap = _vulpy_bounds_cap_for_role(msg.get("role"))
    return _vulpy_bounds_cap_value(msg, cap)


def vulpy_load_with_parse_cache(p):
    """Read+parse ``p`` via an (path, mtime_ns, size)-keyed LRU fast path.

    Any write to the file changes mtime_ns or size → cache miss → fresh parse
    (correctness rule: writers must invalidate). Raises like plain
    read_text/json.loads on IO/decode errors; failures are never cached.
    """
    p_str = str(p)
    try:
        st = os.stat(p_str)
        stat_key = (p_str, st.st_mtime_ns, st.st_size)
    except OSError:
        # Mirror plain load(): let open() raise the real error.
        data = json.loads(Path(p_str).read_text(encoding="utf-8"))
        return data
    with _VULPY_PARSE_CACHE_LOCK:
        entry = _VULPY_PARSE_CACHE.get(stat_key)
        if entry is not None:
            _VULPY_PARSE_CACHE.move_to_end(stat_key)
            return copy.deepcopy(entry)
    text = Path(p_str).read_text(encoding="utf-8")
    data = json.loads(text)
    with _VULPY_PARSE_CACHE_LOCK:
        # A write changes mtime_ns/size so the old stat key can never match
        # again — drop any prior entries for this path instead of letting
        # dead versions occupy LRU slots until eviction.
        for stale_key in [k for k in _VULPY_PARSE_CACHE if k[0] == p_str]:
            del _VULPY_PARSE_CACHE[stale_key]
        _VULPY_PARSE_CACHE[stat_key] = copy.deepcopy(data)
        while len(_VULPY_PARSE_CACHE) > _VULPY_PARSE_CACHE_MAX_ENTRIES:
            _VULPY_PARSE_CACHE.popitem(last=False)
    return data


def vulpy_parse_cache_clear():
    """Test/ops hook: drop all cached parses."""
    with _VULPY_PARSE_CACHE_LOCK:
        _VULPY_PARSE_CACHE.clear()

# vulpy-session-store-bounds: end injected block.
'''


def patch_models(src: str) -> str:
    """Inject cap helper + wire save()/load() against models.py anchors."""
    if IDEMPOTENCY_MARK in src:
        print("already patched — models.py session-store bounds present")
        return src

    # Drift checks first: every anchor must exist exactly once.
    for anchor_name, anchor in (
        ("save assign", ANCHOR_SAVE_ASSIGN),
        ("save dumps", ANCHOR_SAVE_DUMPS_PREFIX),
        ("load parse", ANCHOR_LOAD_PARSE),
        ("import copy", "\nimport copy\n"),
    ):
        count = src.count(anchor)
        if count != 1:
            sys.exit(
                f"[{IDEMPOTENCY_MARK}] ERROR: {anchor_name} anchor found {count}x "
                f"(expected exactly once) in models.py — upstream drift? "
                f"Anchor: {anchor!r}"
            )

    # 1. Inject the helper block after the stdlib import cluster.
    import_anchor = "\nimport copy\n"
    block = INJECTED_TOP
    src = src.replace(
        import_anchor,
        import_anchor
        + "\nimport collections\nimport threading\nfrom collections import OrderedDict\n\n"
        + block,
        1,
    )

    # 2. save(): cap the persisted messages form just before serialization.
    old_save = (
        f"{ANCHOR_SAVE_ASSIGN}\n"
        f"        {ANCHOR_SAVE_DUMPS_PREFIX}"
    )
    if old_save not in src:
        # Live models.py has extra lines between the two statements; fall back
        # to separate replacements, but keep strict order validation.
        src = src.replace(ANCHOR_SAVE_ASSIGN, "meta['messages'] = vulpy_cap_message_bodies_for_disk(self.messages)", 1)
        # Move the raw assignment's semantics: we replaced the only occurrence;
        # now ensure the dumps line still exists exactly once (already checked).
    else:
        new_save = (
            "meta['messages'] = vulpy_cap_message_bodies_for_disk(self.messages)\n"
            f"        {ANCHOR_SAVE_DUMPS_PREFIX}"
        )
        src = src.replace(old_save, new_save, 1)

    # 3. load(): route the read through the parse cache.
    src = src.replace(
        ANCHOR_LOAD_PARSE,
        "data = vulpy_load_with_parse_cache(p)",
        1,
    )
    return src


def main() -> int:
    if len(sys.argv) < 2:
        print(
            f"Usage: patch-session-store-bounds.py <path/to/models.py> [...more paths]\n"
            f"Patches each target file (first target must be models.py-shaped; "
            f"further files are fail-loud checked against the same anchors).",
            file=sys.stderr,
        )
        return 1
    targets = [Path(a) for a in sys.argv[1:]]
    for path in targets:
        if not path.exists():
            print(f"[{IDEMPOTENCY_MARK}] ERROR: {path} does not exist", file=sys.stderr)
            return 1
        src = path.read_text(encoding="utf-8")
        patched = patch_models(src)
        if patched != src:
            path.write_text(patched, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())

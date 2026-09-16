#!/usr/bin/env python3
"""Patch the native WebUI renderer to only treat STANDALONE MEDIA:<abs-path> as media.

Problem (2026-08-29): `static/ui.js`'s `renderMd` stashed ANY `MEDIA:` occurrence
with the regex `MEDIA:([^\\s)\]]+)`. Prose and inline-code mentions of the token
-- e.g. `` `MEDIA:` `` or `` `MEDIA:/app/x.png` `` in a sentence -- were therefore
rewritten into a placeholder and re-rendered as a broken `📎` attachment link.

Fix: match only a standalone token, exactly like the island renderer
(`extensions/hermes-webui/src/message-renderer-island.tsx`, `preprocessMediaTokens`):

    (^|[\s([{:,])MEDIA:(\/[^\s)\]]+|https?:\/\/[^\s)\]]+)

- Preceded by start-of-string / whitespace / ( [ { : ,  (a token boundary).
- Payload is an absolute path (`/…`) or `http(s)://…`. A bare `MEDIA:` (no path)
  or a backticked / mid-word mention never matches.
- The leading character is preserved (only the `MEDIA:<ref>` part is replaced).

This is the durable host-side patcher: the repo does NOT ship `static/ui.js`
(it's baked into the upstream webui), so the fix is applied at image build time
via `Dockerfile.hermes`, mirroring `patch-webui-event-bus.py`.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.

Usage:
  python3 patch-webui-media-tokens.py /app/hermes-webui/static/ui.js
"""

import sys

MARK = "vulpy-media-token-boundary"  # injected into the patched comment

# Anchor must appear EXACTLY once in the pristine file: the start of the stash
# replace call. We anchor on the full old `s=s.replace(/MEDIA:.../g,` line.
OLD = (
    "  const media_stash=[];\n"
    "  s=s.replace(/MEDIA:([^\\s\\)\\]]+)/g,(_,raw_ref)=>{\n"
    "    media_stash.push(raw_ref);\n"
    "    return '\\x00D'+(media_stash.length-1)+'\\x00';\n"
    "  });"
)
ANCHOR = "s=s.replace(/MEDIA:([^\\s\\)\\]]+)/g,"

NEW = (
    "  const media_stash=[];\n"
    "  // vulpy-media-token-boundary: formatting markers are part of the token boundary;\n"
    "  // backticks/code remain protected by the later code-span stash.\n"
    "  const stashMedia=(_match,lead,raw_ref)=>{\n"
    "    media_stash.push(raw_ref);\n"
    "    return lead+'\\x00D'+(media_stash.length-1)+'\\x00';\n"
    "  };\n"
    "  s=s.replace(/(^|[\\s([{:,])\\*\\*MEDIA:(\\/[^\\s)\\]]+|https?:\\/\\/[^\\s)\\]]+)\\*\\*/g,stashMedia);\n"
    "  s=s.replace(/(^|[\\s([{:,])\\*MEDIA:(\\/[^\\s)\\]]+|https?:\\/\\/[^\\s)\\]]+)\\*/g,stashMedia);\n"
    "  s=s.replace(/(^|[\\s([{:,])MEDIA:(\\/[^\\s)\\]]+|https?:\\/\\/[^\\s)\\]]+)/g,stashMedia);"
)


def _count(haystack: str, needle: str) -> int:
    return haystack.count(needle)


def _fail(label: str, anchor: str, count: int, path: str) -> None:
    print(
        f"ERROR: anchor for {label} appears {count} times (expected 1):\n"
        f"  anchor: {anchor[:120]!r}\n"
        f"  File: {path}\n"
        f"  Hermes changed shape — update "
        f"extensions/hermes-webui/scripts/patch-webui-media-tokens.py",
        file=sys.stderr,
    )
    sys.exit(1)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {argv[0]} /app/hermes-webui/static/ui.js", file=sys.stderr)
        return 2
    path = argv[1]
    with open(path) as f:
        src = f.read()
    if MARK in src:
        print(f"already patched — MEDIA token boundary present ({path})")
        return 0
    n = _count(src, ANCHOR)
    if n != 1:
        _fail("ui.js MEDIA stash", ANCHOR, n, path)
    if OLD not in src:
        print(
            f"ERROR: old text for 'ui.js MEDIA stash' not found in {path}\n"
            f"  old starts with: {OLD[:80]!r}",
            file=sys.stderr,
        )
        return 1
    src = src.replace(OLD, NEW, 1)
    with open(path, "w") as f:
        f.write(src)
    print(f"  applied: MEDIA token boundary ({path})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

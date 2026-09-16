#!/usr/bin/env python3
"""Durably allow Markdown MEDIA previews on the WebUI server.

Fixes two server-side gaps that made MEDIA:<path>.md previews 403:

1. api/config.py MIME_MAP: `.md` / `.markdown` / `.mdx` are served as
   `application/octet-stream` instead of `text/markdown`, so the session-media
   token allow-list (which only admits safe inline MIME types) rejects them.
2. api/routes.py `_session_media_token_allows_path`: the token regex
   `MEDIA:([^\s)\]]+)` swallows a trailing emphasis marker (`**` / `*`) into the
   captured ref, so `**MEDIA:/x.md**` resolves to `/x.md**` and never matches
   the allow-list. Strip trailing `*` from the ref before resolving.

Both must be in place for `.md` previews to render; the client already fetches
`/api/media?...&session_id=...` for `.md` paths (patch-webui-markdown-media.py).

Fail-loud + idempotent, matching the patch-webui-*.py convention.
Usage: python3 patch-webui-markdown-media-server.py /app/hermes-webui/api
"""

import sys

MARK = "vulpy-markdown-media-server"

# --- routes.py ---
ROUTES_OLD_ALLOW = """        for ref in _MEDIA_TOKEN_RE.findall(text):
            if "://" in ref:
                continue
            try:
                if Path(ref).expanduser().resolve() == target_resolved:
                    return True"""
ROUTES_NEW_ALLOW = """        for ref in _MEDIA_TOKEN_RE.findall(text):
            if "://" in ref:
                continue
            # Trailing emphasis markers (** or *) wrapping a token are not part
            # of the path; the client strips them too (patch-webui-media-tokens.py).
            ref = ref.rstrip("*")
            try:
                if Path(ref).expanduser().resolve() == target_resolved:
                    return True"""
ROUTES_ALLOW_ANCHOR = 'if Path(ref).expanduser().resolve() == target_resolved:'

ROUTES_OLD_TYPES = '_SESSION_MEDIA_TOKEN_TYPES = _INLINE_IMAGE_TYPES | _AUDIO_VIDEO_PDF_TYPES | {"text/html"}'
ROUTES_NEW_TYPES = '_SESSION_MEDIA_TOKEN_TYPES = _INLINE_IMAGE_TYPES | _AUDIO_VIDEO_PDF_TYPES | {"text/html", "text/markdown"}'
ROUTES_TYPES_ANCHOR = 'text/html"}'

# --- config.py ---
CONFIG_OLD = '''    ".json": "application/json",
    ".html": "text/html",'''
CONFIG_NEW = '''    ".json": "application/json",
    ".html": "text/html",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".mdx": "text/markdown",'''
CONFIG_ANCHOR = '".html": "text/html",'


def _fail(label, anchor, count, path):
    print(f"ERROR: {label} anchor count={count} (expected 1):\n  {anchor[:80]!r}\n  File: {path}\n  update patch-webui-markdown-media-server.py", file=sys.stderr)
    return False


def main(argv):
    if len(argv) != 2:
        print(f"usage: {argv[0]} /app/hermes-webui/api", file=sys.stderr)
        return 2
    api = argv[1].rstrip("/")
    routes = f"{api}/routes.py"
    config = f"{api}/config.py"
    for path, old, new, anchor, label in (
        (routes, ROUTES_OLD_ALLOW, ROUTES_NEW_ALLOW, ROUTES_ALLOW_ANCHOR, "routes allow-list rstrip"),
        (routes, ROUTES_OLD_TYPES, ROUTES_NEW_TYPES, ROUTES_TYPES_ANCHOR, "routes session-media types"),
        (config, CONFIG_OLD, CONFIG_NEW, CONFIG_ANCHOR, "config MIME map"),
    ):
        try:
            src = open(path).read()
        except OSError as e:
            print(f"ERROR: cannot read {path}: {e}", file=sys.stderr)
            return 1
        # Idempotency guard: use a line that exists ONLY in the new content as a
        # positive marker, so an old-shape substring that is ALSO a substring of
        # the new shape (e.g. CONFIG_OLD ⊂ CONFIG_NEW) can never double-apply,
        # and a pristine file is never mistaken for already-patched.
        marker = next((ln for ln in new.splitlines() if ln not in old), "") if new else ""
        if marker and marker in src:
            print(f"already patched — {label} ({path})")
        elif old in src:
            src = src.replace(old, new, 1)
            open(path, "w").write(src)
            print(f"  applied: {label} ({path})")
        else:
            n = src.count(anchor)
            if n != 1:
                _fail(label, anchor, n, path)
                return 1
            else:
                print(f"ERROR: {label}: anchor present but old/new mismatch ({path})", file=sys.stderr)
                return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

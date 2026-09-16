#!/usr/bin/env python3
"""Build-time umask hardening for hermes_cli/config.py.

hermes_cli/config.py briefly flips umask to 0o007 around config init. Any file
written by an agent thread during that window lands mode 600/660 — stripping
group access. On Vulpy installs the workspace is shared with the host deploy
user via a shared GID, so those files become unreadable/unwritable for git
operations on the host ("Permission denied" / "cannot hash" on pull, stash,
commit — proven on the nicky install 2026-08-26).

Fix: replace the 0o007 flip with 0o002 so every agent-written file stays
group-readable AND group-writable regardless of when it is written. The
save/restore structure in upstream code is preserved — we only change the
constant, so the temporary window still restores the previous value.

Fails loudly (non-zero exit) if the anchor moves — upgrade drift must break
the build here, not silently regress to mode-600 files on customer installs.
Idempotent: skips cleanly when the patch is already present.
"""
from __future__ import annotations

import sys

TARGET = "/app/hermes-agent/hermes_cli/config.py"
ANCHOR = "old_umask = os.umask(0o007)"
REPLACEMENT = "old_umask = os.umask(0o002)"


def main() -> int:
    try:
        src = open(TARGET).read()
    except OSError as exc:
        print(f"[umask-fix] FATAL: cannot read {TARGET}: {exc}", file=sys.stderr)
        return 1

    if REPLACEMENT in src and ANCHOR not in src:
        print("[umask-fix] already applied")
        return 0

    count = src.count(ANCHOR)
    if count != 1:
        print(
            f"[umask-fix] FATAL: anchor expected exactly once, found {count}x "
            f"in {TARGET}. Upstream refactored the umask block — refresh "
            f"scripts/extensions/hermes-agent-patches/patch-hermes-umask.py.",
            file=sys.stderr,
        )
        return 1

    open(TARGET, "w").write(src.replace(ANCHOR, REPLACEMENT, 1))
    print(f"[umask-fix] patched {TARGET}: umask 0o007 -> 0o002 (group-rw files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
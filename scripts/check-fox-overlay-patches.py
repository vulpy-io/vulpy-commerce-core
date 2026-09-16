#!/usr/bin/env python3
"""Fox overlay patch-anchor gate.

Runs every fox-overlay agent monkey-patch module's ``apply()`` against the
hermes-agent baked into this image/container and fails loudly on anchor drift.

Why: the overlay patches anchor on exact source fragments of upstream
functions. When upstream refactors, anchors stop matching. Historically the
gateway logged one WARNING ("bootstrap failed ... will boot without Fox
monkey-patches") and continued — chats then broke silently (e.g. runs dying
with infinite typing dots, cron diagnostics missing). This gate makes the
failure LOUD:

* Build time (Dockerfile.hermes): a failed run aborts the image build.
* Boot time (hermes-fox-entrypoint.sh): a failed run writes a loud banner to
  stderr plus /data/state/fox-overlay-patch-status.json for tooling.

Exit codes: 0 = every patch applied (or was already absorbed upstream),
1 = one or more patches failed.
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback

PATCH_MODULES = [
    "auxiliary_client",
    "cron_diagnostics",
    "runtime_provider",
]

PKG = "fox_overlay.agent_plugins.fox_overlay_plugin.monkey_patches"


def _import_overlay() -> bool:
    try:
        import fox_overlay  # noqa: F401
        return True
    except Exception:
        # The overlay package may live outside sys.path in some contexts;
        # its install location inside the image is /app/fox-overlay.
        sys.path.insert(0, "/app/fox-overlay")
        try:
            import fox_overlay  # noqa: F401
            return True
        except Exception:
            return False


def main() -> int:
    if not _import_overlay():
        print(
            "[patch-gate] FATAL: fox_overlay package not importable "
            "(looked in sys.path and /app/fox-overlay)",
            file=sys.stderr,
        )
        return 1

    results = []
    failures = 0
    for mod_name in PATCH_MODULES:
        entry = {"module": mod_name, "status": "pass", "error": None}
        try:
            mod = __import__(f"{PKG}.{mod_name}", fromlist=[mod_name])
            apply_fn = getattr(mod, "apply", None)
            if apply_fn is None:
                raise RuntimeError("module has no apply()")
            apply_fn()
            entry["status"] = "pass"
        except Exception as exc:  # noqa: BLE001 — report any failure
            failures += 1
            entry["status"] = "fail"
            entry["error"] = f"{type(exc).__name__}: {exc}"
            print(f"[patch-gate] FAIL {mod_name}: {entry['error']}", file=sys.stderr)
            traceback.print_exc(limit=3)
        results.append(entry)
        print(f"[patch-gate] {entry['status'].upper():4} {mod_name}")

    summary = {
        "checked_at": time.time(),
        "ok": failures == 0,
        "results": results,
    }
    # Status file for tooling (webui health, watchdogs). Best-effort.
    for status_dir in ("/data/state", "/tmp"):
        try:
            os.makedirs(status_dir, exist_ok=True)
            with open(os.path.join(status_dir, "fox-overlay-patch-status.json"), "w") as fh:
                json.dump(summary, fh, indent=1)
            break
        except OSError:
            continue

    if failures:
        print(
            f"\n[patch-gate] {failures}/{len(PATCH_MODULES)} fox-overlay patches FAILED.\n"
            "[patch-gate] Upstream hermes-agent likely drifted past a patch anchor.\n"
            "[patch-gate] Fix: refresh the anchor in the named monkey_patches module\n"
            "[patch-gate] (check whether upstream absorbed the patch first — see\n"
            "[patch-gate] runtime_provider.py for the absorbed-upstream pattern).",
            file=sys.stderr,
        )
        return 1
    print("[patch-gate] all fox-overlay patches applied cleanly")
    return 0


if __name__ == "__main__":
    sys.exit(main())
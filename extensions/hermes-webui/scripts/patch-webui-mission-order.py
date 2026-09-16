#!/usr/bin/env python3
"""patch-webui-mission-order.py

Order the Vulpy mission chats (Mission 0 … Mission 8) on the sidebar by
mission index instead of the default newest-first timestamp sort.

Problem
-------
The WebUI sorts sidebar sessions by ``_session_sort_timestamp`` (desc) so the
most-recently-updated session sits on top. The Vulpy mission provisioner
creates Mission 0 first … Mission 8 last; with newest-first ordering Mission
8 appears at the top of the pinned group and Mission 0 sinks to the bottom.
The missions are a guided sequence — Mission 0 (Hello) must be first.

Fix
---
Pinned sessions that carry a numeric ``mission_order`` metadata field sort by
that value first (ascending; Mission 0 on top); everything else keeps the
existing timestamp behaviour. The provisioner
(extensions/hermes-webui/api/vulpy_missions.py) stamps ``mission_order`` from
the deterministic ``MissionDefinition.order`` at creation time.

Injection target (upstream api/routes.py, never rebuilt):
  Anchor: ``def _keep_latest_messaging_session_per_source``
  Add a mission-aware sort key and swap the sort at both sort sites inside
  the function body.

Idempotent: re-applying simply re-installs the same replacement.
"""

import re
import sys

TARGET = "/app/hermes-webui/api/routes.py"

OLD = """    if show_previous_messaging_sessions:
        return sorted(sessions, key=_session_sort_timestamp, reverse=True)"""

NEW_ANCHOR_FN = """    if show_previous_messaging_sessions:
        def _mission_key(s: dict) -> tuple:
            order = s.get("mission_order", -1) if s.get("mission_order") is not None else -1
            return (0, int(order)) if order >= 0 else (1, 0)
        return sorted(sessions, key=lambda s: (_mission_key(s), -_session_sort_timestamp(s)))

    def _mission_key(s: dict) -> tuple:
        order = s.get("mission_order", -1) if s.get("mission_order") is not None else -1
        return (0, int(order)) if order >= 0 else (1, 0)"""

OLD_KEEP = """    kept.sort(key=_session_sort_timestamp, reverse=True)"""
NEW_KEEP = """    kept.sort(key=lambda s: (_mission_key(s), -_session_sort_timestamp(s)))"""


def apply_patch() -> int:
    src = open(TARGET, encoding="utf-8").read()

    if "_mission_key" in src and "mission_order" in src:
        print(f"{TARGET}: already patched (mission order)")
        return 0

    # 1. the early-return sort inside _keep_latest_messaging_session_per_source
    if OLD not in src:
        print(f"{TARGET}: anchor OLD not found", file=sys.stderr)
        return 2
    src = src.replace(OLD, NEW_ANCHOR_FN, 1)

    # 2. the kept-list sort (same function body)
    if OLD_KEEP not in src:
        print(f"{TARGET}: anchor KEEP not found", file=sys.stderr)
        return 2
    src = src.replace(OLD_KEEP, NEW_KEEP, 1)

    open(TARGET, "w", encoding="utf-8").write(src)

    # Verify
    checks = [
        'def _mission_key(s: dict) -> tuple:' in src,
        "s.get(\"mission_order\"" in src,
        "_session_sort_timestamp(s))" in src,
    ]
    if not all(checks):
        print(f"{TARGET}: post-write verification failed", file=sys.stderr)
        return 2
    print(f"{TARGET}: patched mission order (both sort sites)")
    return 0


if __name__ == "__main__":
    sys.exit(apply_patch())
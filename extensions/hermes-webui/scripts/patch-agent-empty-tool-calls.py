#!/usr/bin/env python3
"""Patch agent_runtime_helpers.py: guard against empty tool_calls from dedup.

2026-08-18: DeepSeek V4 Flash rejects `tool_calls: []` with HTTP 400
("Invalid 'messages[N].tool_calls': empty array"). The pre-call sanitizer's
dedup step (agent_runtime_helpers.py:pre_call_message_sanitizer) collapses
duplicate tool_call_ids within an assistant message. When ALL tool calls in a
message are duplicates, `kept_tcs` is `[]` and the code writes
`tool_calls: []` back into the message — which strict providers reject.

The fix: when `kept_tcs` is empty, drop the `tool_calls` key entirely instead
of writing an empty array. The WebUI's own `_sanitize_messages_for_api` already
strips empty tool_calls, but the dedup runs *after* that sanitizer in the
gateway's message pipeline, so the guard must be at the dedup source.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once
    (upgrade drift → caught at build time, never silently skipped).
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH agent_runtime_helpers.py.

Usage: python3 patch-agent-empty-tool-calls.py /path/to/agent_runtime_helpers.py
"""

import sys

IDEMPOTENCY_MARK = "vulpy-empty-tool-calls-guard"
ANCHOR_TEXT = (
    '            if len(kept_tcs) != len(msg.get("tool_calls") or []):\n'
    "                msg = {**msg, \"tool_calls\": kept_tcs}\n"
)
REPLACEMENT_TEXT = (
    '            if len(kept_tcs) != len(msg.get("tool_calls") or []):\n'
    "                if kept_tcs:\n"
    "                    msg = {**msg, \"tool_calls\": kept_tcs}\n"
    "                else:\n"
    "                    # All tool calls in this assistant message were duplicates.\n"
    "                    # Strict providers (DeepSeek) reject tool_calls: [] with a\n"
    '                    # 400 ("empty array") even though empty tool_calls are\n'
    "                    # otherwise stripped earlier — drop the key entirely.\n"
    '                    msg = {k: v for k, v in msg.items() if k != "tool_calls"}\n'
)


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} /path/to/agent_runtime_helpers.py", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    with open(path) as f:
        src = f.read()

    # Idempotency check
    if IDEMPOTENCY_MARK in src:
        print(f"Already patched ({IDEMPOTENCY_MARK} found in {path})")
        return

    # Anchor check: must appear exactly once
    n = src.count(ANCHOR_TEXT)
    if n != 1:
        print(
            f"ERROR: anchor for '{IDEMPOTENCY_MARK}' appears {n} times (expected 1):\n"
            f"  anchor not found or duplicated in {path}\n"
            f"  hermes-agent source changed shape — update\n"
            f"  extensions/hermes-webui/scripts/patch-agent-empty-tool-calls.py",
            file=sys.stderr,
        )
        sys.exit(1)

    src = src.replace(ANCHOR_TEXT, REPLACEMENT_TEXT, 1)

    # Add idempotency marker as a comment after the new block
    MARKER_LINE = f"            # {IDEMPOTENCY_MARK}\n"
    src = src.replace(
        '                    msg = {k: v for k, v in msg.items() if k != "tool_calls"}\n',
        '                    msg = {k: v for k, v in msg.items() if k != "tool_calls"}\n'
        + MARKER_LINE,
        1,
    )

    with open(path, "w") as f:
        f.write(src)

    print(f"Patched {path} with empty-tool-calls guard ({IDEMPOTENCY_MARK})")


if __name__ == "__main__":
    main()
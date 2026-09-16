#!/usr/bin/env python3
"""
Patch agent/conversation_loop.py: strip continuation-scaffolding pairs from
the transcript after a successful output-length recovery.

When the model's output is truncated, the recovery loop (lines ~1889-1934)
appends an interim assistant fragment + a [System: ...] continuation nudge
to drive the retry.  On the recovered path, that scaffolding PAIR is still
in ``messages`` — keeping it creates an assistant->assistant adjacency
(the interim fragment is a partial answer) that contaminates the transcript
on the next user turn.

The fix strips the trailing-most (assistant + [System: ...] user) pair
right before appending ``final_msg``, after the existing thinking-prefill
and empty-response scaffolding pops.  The content is already folded into
the final response via ``truncated_response_parts``.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH conversation_loop.py.

Usage: python3 patch-agent-strip-continuation-scaffolding.py /path/to/conversation_loop.py
"""

import sys

IDEMPOTENCY_MARK = "vulpy-strip-continuation-scaffolding"

# Anchor: the thinking-prefill pop loop, which we need to INJECT AFTER.
# This is the exact text from the source (omitting indentation control).
ANCHOR = """                # Pop thinking-only prefill and empty-response retry
                # scaffolding before appending either a final response or a
                # verification-stop follow-up. These internal turns are only
                # for the next API retry and should not become durable
                # transcript context.
                while (
                    messages
                    and isinstance(messages[-1], dict)
                    and (
                        messages[-1].get("_thinking_prefill")
                        or messages[-1].get("_empty_recovery_synthetic")
                        or messages[-1].get("_empty_terminal_sentinel")
                    )
                ):
                    messages.pop()"""

REPLACEMENT = """                # Pop thinking-only prefill and empty-response retry
                # scaffolding before appending either a final response or a
                # verification-stop follow-up. These internal turns are only
                # for the next API retry and should not become durable
                # transcript context.
                while (
                    messages
                    and isinstance(messages[-1], dict)
                    and (
                        messages[-1].get("_thinking_prefill")
                        or messages[-1].get("_empty_recovery_synthetic")
                        or messages[-1].get("_empty_terminal_sentinel")
                    )
                ):
                    messages.pop()

                # Strip the continuation-scaffolding pair (interim assistant
                # fragment + [System: ...] user nudge) that was injected during
                # the truncation-recovery loop (lines ~1889-1934).  On success
                # the scaffolding is already folded into the final response via
                # truncated_response_parts, so keeping it in messages would
                # create an assistant->assistant adjacency (the interim fragment
                # is a partial answer) that contaminates the transcript on the
                # next user turn.  Only strip the trailing-most pair, so
                # multiple previous recovery rounds (rare) are each cleaned up
                # as the success path reaches this point.
                # vulpy-strip-continuation-scaffolding
                if (
                    len(messages) >= 2
                    and isinstance(messages[-1], dict)
                    and isinstance(messages[-2], dict)
                    and messages[-1].get("role") == "user"
                    and isinstance(messages[-1].get("content"), str)
                    and messages[-1]["content"].lstrip().startswith("[System:")
                    and messages[-2].get("role") == "assistant"
                ):
                    messages.pop()
                    messages.pop()"""


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} /path/to/conversation_loop.py", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    with open(path) as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print(f"Already patched ({IDEMPOTENCY_MARK} found in {path})")
        return

    n = src.count(ANCHOR)
    if n != 1:
        print(
            "ERROR: anchor for '%s' appears %d times (expected 1):\n"
            "  File: %s\n"
            "  hermes-agent source changed shape -- update\n"
            "  extensions/hermes-webui/scripts/patch-agent-strip-continuation-scaffolding.py"
            % (IDEMPOTENCY_MARK, n, path),
            file=sys.stderr,
        )
        sys.exit(1)

    src = src.replace(ANCHOR, REPLACEMENT, 1)
    with open(path, "w") as f:
        f.write(src)

    print(f"Patched {path} ({IDEMPOTENCY_MARK})")


if __name__ == "__main__":
    main()
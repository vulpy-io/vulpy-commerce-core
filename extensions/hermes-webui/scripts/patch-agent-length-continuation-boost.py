#!/usr/bin/env python3
"""
Patch agent/conversation_loop.py: make the output-length recovery loop
resilient (issue: "agent loop stops mid-response, no auto-recovery").

Two changes to the text-continuation retry path (~lines 1889-1946):

1. Boost max_tokens on each continuation retry via
   ``agent._ephemeral_max_output_tokens`` — the same exponential boost the
   tool-call truncation path already uses.  With a fixed budget, every
   continuation retry re-hits the same output cap and burns all 4 attempts,
   then returns ``partial=True`` and the gateway tells the user "Try again."

2. After the 4 continuation retries are exhausted, try the fallback
   provider before giving up — every other exhaustion path in the loop does
   this, but the length-continuation path returned partial without one.
   With a fallback activated, the partial fragments are rolled back to the
   last clean assistant turn so the fallback provider continues coherently.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH conversation_loop.py.

Usage: python3 patch-agent-length-continuation-boost.py /path/to/conversation_loop.py
"""

import sys

IDEMPOTENCY_MARK = "vulpy-length-continuation-boost"

# Anchor A: the top of the text-continuation branch — inject the max_tokens
# boost right after `length_continue_retries += 1`.
ANCHOR_A = """                        if assistant_message is not None and not _trunc_has_tool_calls:
                            length_continue_retries += 1
                            interim_msg = agent._build_assistant_message(assistant_message, finish_reason)"""

REPLACEMENT_A = """                        if assistant_message is not None and not _trunc_has_tool_calls:
                            length_continue_retries += 1

                            # Boost max_tokens on each retry so the model has
                            # more room to complete the response. A network
                            # stall doesn't need a bigger budget, but a genuine
                            # output-cap truncation does, and the boost is
                            # harmless for the stall case.
                            # vulpy-length-continuation-boost
                            _lc_boost_base = agent.max_tokens if agent.max_tokens else 4096
                            _lc_boost = _lc_boost_base * (2 ** length_continue_retries)
                            _lc_requested_cap = agent._requested_output_cap_from_api_kwargs(api_kwargs)
                            if _lc_requested_cap is not None:
                                _lc_boost = max(_lc_boost, _lc_requested_cap)
                            _lc_boost_cap = max(32768, _lc_requested_cap or 0)
                            agent._ephemeral_max_output_tokens = min(_lc_boost, _lc_boost_cap)

                            interim_msg = agent._build_assistant_message(assistant_message, finish_reason)"""

# Anchor B: the exhaustion point — after the `if length_continue_retries < 4:`
# block's break, before the partial return.  Inject the fallback attempt.
ANCHOR_B = """                                _retry.restart_with_length_continuation = True
                                break

                            partial_response = agent._strip_think_blocks("".join(truncated_response_parts)).strip()"""

REPLACEMENT_B = """                                _retry.restart_with_length_continuation = True
                                break

                            # All 4 continuation retries exhausted — try the
                            # fallback provider before giving up, matching
                            # every other exhaustion path in this loop.
                            if agent._has_pending_fallback():
                                agent._buffer_status(
                                    "⚠️ Response kept truncating after 4 retries — trying fallback..."
                                )
                            if agent._try_activate_fallback():
                                if truncated_response_parts:
                                    messages = agent._get_messages_up_to_last_assistant(messages)
                                agent._session_messages = messages
                                length_continue_retries = 0
                                truncated_response_parts = []
                                retry_count = 0
                                compression_attempts = 0
                                _retry.primary_recovery_attempted = False
                                _retry.restart_with_rebuilt_messages = True
                                break

                            partial_response = agent._strip_think_blocks("".join(truncated_response_parts)).strip()"""


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

    for tag, anchor in (("A", ANCHOR_A), ("B", ANCHOR_B)):
        n = src.count(anchor)
        if n != 1:
            print(
                "ERROR: anchor '%s' appears %d times (expected 1):\n"
                "  File: %s\n"
                "  hermes-agent source changed shape -- update\n"
                "  extensions/hermes-webui/scripts/patch-agent-length-continuation-boost.py"
                % (tag, n, path),
                file=sys.stderr,
            )
            sys.exit(1)

    src = src.replace(ANCHOR_A, REPLACEMENT_A, 1)
    src = src.replace(ANCHOR_B, REPLACEMENT_B, 1)
    with open(path, "w") as f:
        f.write(src)

    print(f"Patched {path} ({IDEMPOTENCY_MARK})")


if __name__ == "__main__":
    main()

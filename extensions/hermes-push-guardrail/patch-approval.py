#!/usr/bin/env python3
"""Insert the git-push approval patterns into Hermes' DANGEROUS_PATTERNS (issue #93).

Makes ANY `git push` trigger the dangerous-command approval popup, so the
operator approves every push in the UI. Covers both the plain form
(`git push`) and the worktree form (`git -C <path> push`), matching the 4-form
coverage of the subagent approvals.deny set (`git -C* push*`).

Idempotent: safe to run repeatedly. FAILS LOUDLY (exit 1) when the anchor
`DANGEROUS_PATTERNS = [` is missing — a Hermes upgrade that restructures the
pattern list must be caught at build time, not silently lose the guardrail.

Usage: python3 patch-approval.py /path/to/tools/approval.py
"""

import sys

ANCHOR = "DANGEROUS_PATTERNS = ["
PATTERN1 = '    (r\'\\bgit\\s+push\\b\', "git push (requires operator approval - issue #93)"),\n'
PATTERN2 = '    (r\'\\bgit\\s+-C\\s+\\S+(?:\\s+-{1,2}[\\w-]+)*\\s+push\\b\', "git push via -C (requires operator approval - issue #93)"),\n'
MARK1 = "git push (requires operator approval"
MARK2 = "git push via -C (requires operator approval"

path = sys.argv[1]
with open(path) as f:
    src = f.read()

if ANCHOR not in src:
    print(
        "ERROR: anchor 'DANGEROUS_PATTERNS = [' not found in " + path + "\n"
        "Hermes approval.py changed shape — update extensions/hermes-push-guardrail/patch-approval.py",
        file=sys.stderr,
    )
    sys.exit(1)

changed = False
if MARK1 not in src:
    src = src.replace(ANCHOR, ANCHOR + "\n" + PATTERN1, 1)
    changed = True
if MARK2 not in src:
    # Insert after the first git-push pattern line so the -C form sits adjacent.
    idx = src.find(MARK1)
    if idx == -1:
        idx = src.find(ANCHOR)
    line_end = src.find("\n", idx)
    src = src[: line_end + 1] + PATTERN2 + src[line_end + 1 :]
    changed = True

if changed:
    with open(path, "w") as f:
        f.write(src)
    print("patched: plain `git push` and `git -C <path> push` now require operator approval")
else:
    print("already patched — both guardrail patterns present")

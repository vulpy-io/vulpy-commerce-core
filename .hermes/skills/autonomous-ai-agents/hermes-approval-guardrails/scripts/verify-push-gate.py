#!/usr/bin/env python3
"""Verify the layered push gate (issue #93) is intact.

Checks:
1. tools/approval.py contains the git-push dangerous pattern (popup layer).
2. Every factory subagent profile config has the approvals.deny block.
3. The MAIN profile config does NOT have deny (Fox must hit the popup path).

Exit 0 = guardrail intact. Read-only — never writes config, never runs git.
Usage: python3 verify-push-gate.py [HERMES_HOME_ROOT]   # default /data/data/hermes
"""
import glob
import os
import re
import sys

HERMES_AGENT = "/app/hermes-agent"
ROOT = sys.argv[1] if len(sys.argv) > 1 else "/data/data/hermes"
APPROVAL_PY = os.path.join(HERMES_AGENT, "tools", "approval.py")

DENY_PATTERNS = [
    "git push*",
    "* && git push*",
    "*; git push*",
    "git -C* push*",
]

problems = []

# 1) popup layer: dangerous pattern present in the shipped module
try:
    with open(APPROVAL_PY) as f:
        src = f.read()
    if "git push (requires operator approval" not in src:
        problems.append("tools/approval.py missing the git-push dangerous pattern")
    if re.search(r"DANGEROUS_PATTERNS = \[\s*\n\s*\(r'\\bgit\\s\+push\\b'", src) is None:
        problems.append("git-push pattern not at the TOP of DANGEROUS_PATTERNS")
except FileNotFoundError:
    problems.append(f"{APPROVAL_PY} not found")

# 2) subagent deny layer
profiles = sorted(glob.glob(os.path.join(ROOT, "profiles", "*", "config.yaml")))
if not profiles:
    problems.append("no factory profile configs found")
for p in profiles:
    with open(p) as f:
        cfg = f.read()
    for pat in DENY_PATTERNS:
        if pat not in cfg:
            problems.append(f"{os.path.basename(os.path.dirname(p))}: missing deny pattern {pat!r}")

# 3) main profile must NOT carry deny (popup path for Fox)
main_cfg = os.path.join(ROOT, "config.yaml")
with open(main_cfg) as f:
    main_src = f.read()
if "deny:" in main_src and "git push" in main_src:
    problems.append("main config carries git-push deny — Fox would be hard-blocked, popup dead")

# 4) detection battery in a fresh interpreter (patched module must compile)
import subprocess
battery = subprocess.run(
    ["python3", "-c", (
        "import sys; sys.path.insert(0, %r)\n"
        "from tools.approval import detect_dangerous_command as d\n"
        "push=['git push','git push origin main','cd /app/workspace && git push origin main','; git push x','git push --force origin main']\n"
        "ok=['git stash push -m x','git status --short','git fetch origin main','git log --oneline -3']\n"
        "bad=[c for c in push if not d(c)[0]] + [c for c in ok if d(c)[0]]\n"
        "print(';'.join(bad))" % HERMES_AGENT
    )],
    capture_output=True, text=True,
)
if battery.returncode != 0:
    problems.append(f"detection battery crashed: {battery.stderr.strip()}")
else:
    bad = battery.stdout.strip()
    if bad:
        problems.append(f"detection battery mismatches: {bad}")

if problems:
    print("GUARDRAIL BROKEN:")
    for p in problems:
        print(f"  - {p}")
    sys.exit(1)
print("OK: popup pattern present, subagent deny present, main deny-free, battery clean")

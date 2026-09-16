#!/usr/bin/env python3
"""Narrow the "delete in root path" pattern so plain `rm` of individual files
under /tmp/ no longer trips the dangerous-command approval popup (false
positive: `rm /tmp/page.html`, `rm -f /tmp/a /tmp/b`).

The stock pattern `\brm\s+(-[^\s]*\s+)*/` flags ANY `rm` whose first path
argument is absolute, even a single, non-recursive file in /tmp. That makes
routine temp-file cleanup pop an approval every time.

This patcher inserts a negative lookahead so the root-path pattern no longer
fires when the (first) path argument is a specific file under /tmp. It is
deliberately narrow — the following deletions stay gated exactly as before:

  * recursive deletes: `rm -r/-rf/-fr ...`        (pattern: \brm\s+-[^\s]*r)
  * `rm --recursive ...`                          (pattern: \brm\s+--recursive)
  * glob deletes: `rm /tmp/*`, `rm /tmp/foo/*`    (glob metachars excluded from
                                                   the exemption, so the root-path
                                                   pattern still fires)
  * the tmp dir itself: `rm /tmp`                 (needs a trailing slash to be
                                                   exempt; bare `/tmp` is not)
  * ANY non-/tmp absolute path: `rm /etc/passwd`, `rm /home/user/file`,
    `rm /srv/data.sql`                            (exemption is /tmp-scoped)
  * the hardline floor (rm -rf / and system dirs) is untouched.

Exemption regex (appended to the existing pattern, before the literal `/`):

    (?!/tmp/(?:[^\s`&|;<>()*?\[\]]+/)*[^\s`&|;<>()*?\[\]]+(?=$|\s|[;&|<>`]))

i.e. NOT a `/tmp/<name>` (one or more non-glob, non-shell-metachar segments)
followed by end-of-command, whitespace, or a command separator. This exempts
`rm /tmp/x`, `rm -f /tmp/a /tmp/b`, and `rm /tmp/foo/bar` while keeping
globs, recursive deletes, and non-/tmp absolute paths flagged.

Accepted residual edge case: `rm /tmp/x /etc/passwd` in ONE command is no
longer caught by THIS pattern (the only reachable `/` position is the
exempted /tmp path). Non-recursive single-file deletes of critical files are
not the class this guard targets, and every destructive recursive form
(`rm -rf /etc`, `rm -rf /`) remains hardline-blocked. Documented here so a
future reviewer can tighten the boundary to end-or-separator if the trade-off
ever changes.

Idempotent: safe to run repeatedly. FAILS LOUDLY (exit 1) when the anchor
`DANGEROUS_PATTERNS = [` or the `"delete in root path"` rm line is missing —
a Hermes upgrade that restructures the pattern list must be caught at build
time, not silently lose the exemption.

Usage: python3 patch-approval-tmp-rm.py /path/to/tools/approval.py
"""

import sys

ANCHOR = "DANGEROUS_PATTERNS = ["
NEW_MARK = "(?!/tmp/"  # idempotency marker for the exemption

NEW_LINE = (
    "    (r'\\brm\\s+(-[^\\s]*\\s+)*(?!/tmp/(?:[^\\s`&|;<>()*?\\[\\]]+/)*"
    "[^\\s`&|;<>()*?\\[\\]]+(?=$|\\s|[;&|<>`]))/', \"delete in root path\"),"
)

path = sys.argv[1]
with open(path) as f:
    src = f.read()

if ANCHOR not in src:
    print(
        "ERROR: anchor 'DANGEROUS_PATTERNS = [' not found in " + path + "\n"
        "Hermes approval.py changed shape — update "
        "extensions/hermes-push-guardrail/patch-approval-tmp-rm.py",
        file=sys.stderr,
    )
    sys.exit(1)

lines = src.split("\n")
target_idx = None
for idx, line in enumerate(lines):
    if '"delete in root path"' in line and "\\brm" in line:
        target_idx = idx
        break

if target_idx is None:
    print(
        "ERROR: 'delete in root path' rm pattern line not found in " + path + "\n"
        "Hermes approval.py changed shape — update "
        "extensions/hermes-push-guardrail/patch-approval-tmp-rm.py",
        file=sys.stderr,
    )
    sys.exit(1)

if NEW_MARK in lines[target_idx]:
    print("already patched — /tmp file-delete exemption present")
    sys.exit(0)

lines[target_idx] = NEW_LINE
with open(path, "w") as f:
    f.write("\n".join(lines))
print("patched: `rm /tmp/<file>` no longer requires approval; recursive/glob/system deletes still gated")

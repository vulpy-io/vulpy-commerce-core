# sitecustomize.py — Fox container Python umask hardening.
#
# Python executes this module automatically at interpreter startup, before any
# other application code.  We use it to set a sane umask (0o002) so all files
# written by the Hermes process — write_file, tempfile, open() — come out
# world-readable (mode 664) rather than world-unreadable (mode 600/700).
#
# Background: hermes_cli/config.py calls os.umask(0o007) during init, leaving
# umask at 0o007 = 0b000_000_111 which strips all "other" bits AND group
# execute.  Any file written after that point comes out mode 0o660 at best,
# 0o600 for a typical 0o666 open().  Agent-created files then block the host
# deploy user from git-adding them, causing 500 errors and manual repairs.
#
# sitecustomize is the only place we can reliably intercept this:
#   - It runs before any import in the application.
#   - Per-thread umask changes in hermes_cli/config.py inherit our 0o002 and
#     restore it when their try/finally block exits.
#   - All subprocess children (pnpm, Node, bash) also inherit this umask from
#     the Python process on fork — no separate fix needed there.
#
# This file is baked into the Fox container image via Dockerfile.hermes:
#   COPY scripts/sitecustomize.py /usr/local/lib/python3.11/site-packages/

import os
os.umask(0o002)

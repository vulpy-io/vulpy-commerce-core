#!/usr/bin/env bash
# Read-only Fox Tailscale sidecar status probe (agent-cmd bridge: ts.status).
#
# Prints a compact one-line status of the Fox Tailscale sidecar:
#   sidecar-not-running   — the tailscale compose service is not up
#   up <magicdns>         — BackendState=Running, DNSName resolved
#   up                    — BackendState=Running, DNSName missing
#   needs-login <url>     — NeedsLogin, prints the AuthURL for approval
#   starting              — sidecar up but not Running and no AuthURL yet
#
# This intentionally calls vulpy_fox_tailscale_status_line() and NOTHING else:
# no serve config, no certs, no writes. It is the read-only counterpart to
# ts.serve (scripts/vulpy-tailscale-serve.sh). Exit status 0 on success
# (even for needs-login/starting — those are valid states, not errors).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=scripts/lib/install-helpers.sh
source "${ROOT_DIR}/scripts/lib/install-helpers.sh"

vulpy_fox_tailscale_status_line
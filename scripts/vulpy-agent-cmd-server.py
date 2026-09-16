#!/usr/bin/env python3
"""
vulpy-agent-cmd-server.py — file-drop agent command server.

Fox (uid=999 foxinthebox) writes *.req.json into agent-cmds/req/ (Fox-owned).
This daemon reads those files, executes whitelisted dev commands, and writes
*.resp.json into agent-cmds/resp/ (daemon-owned).

SCOPE: dev loop commands, environment operations (env.push / env.pull_data /
env.logs — code push, data pull and log tails for dev/staging/live, backed by
placeholder scripts until the real pipelines land in #166-#169), plus two
guarded exceptions: hermes.rebuild and hermes.rebuild.wait (non-interactive,
detached Hermes container rebuilds — see Allowed commands). No other hermes.*
commands — those are human-only per AGENTS.md.

Directory layout
----------------
  agent-cmds/req/   — owned by foxinthebox (uid=999); Fox creates req files
  agent-cmds/resp/  — owned by daemon user (vulpy-commerce); daemon writes resp files

Protocol
--------
  Request  (req/<uuid>.req.json):
    { "id": "<uuid>", "cmd": "<command>", "args": { ... } }

  The optional "args" object carries parameters for parametric commands
  (env.push / env.pull_data / env.logs). It is validated against a fixed
  allowlist of values before execution — no free-form input reaches the shell.

  Response (resp/<uuid>.resp.json):
    { "id": "<uuid>", "ok": true|false, "out": "<stdout>", "err": "<stderr>",
      "done": true|false }

  Streaming commands (env.push / env.pull_data) rewrite the response file
  incrementally with "done": false while the subprocess runs, so a polling
  client can render output as it arrives. The final write sets "done": true
  plus the real exit status. One-shot commands omit "done" (treated as final).

  Confirm / operator approval protocol (security-critical):
    Confirm-required commands (env.push → live, every env.pull_data) must
    carry BOTH:
      args.confirm  — the strict boolean true (no truthy strings)
      args.approval — {"ts": <integer unix seconds>, "sig": "<hex hmac>"}
    where sig = HMAC-SHA256(secret, "<cmd>|<target>|<source>|<ts>") and the
    secret is the per-install shared secret (VULPY_AGENT_HMAC_SECRET env, or
    /data/config/agent-hmac-secret — the same file as
    <checkout>/.data/hermes/config/agent-hmac-secret on the host). ts must be
    within 120s of now. The WebUI agent-cmd bridge produces the signature
    after the operator approves; the server refuses confirm-required requests
    without a valid signature (fail closed) so a req file forged by the agent
    cannot self-approve.

Allowed commands
----------------
  dev.up / dev.down / dev.restart / dev.wake / dev.sleep
  dev.status
  dev.logs / dev.logs-medusa / dev.logs-storefront
  status
  ts.status       — read-only Fox Tailscale sidecar status probe
                    (scripts/vulpy-fox-tailscale-status.sh — fixed argv,
                    calls vulpy_fox_tailscale_status_line, never mutates)
  env.push        — push code to staging|live (stub: scripts/env-push.sh)
  env.pull_data   — restore a database pull into dev|staging (stub: scripts/env-pull-data.sh)
  env.logs        — tail logs for an env (stub: scripts/env-logs.sh)
  hermes.rebuild   — guarded exception: rebuilds the Hermes container via
                     scripts/hermes-rebuild-bridge.sh. Refuses while a WebUI
                     session is active or a rebuild is already running; runs
                     detached (the 300s command timeout cannot kill it); same
                     rate-limit family as the dev mutators.
  hermes.rebuild.wait — same guarded rebuild, but QUEUES instead of refusing:
                     if a WebUI session is active it spawns a detached waiter
                     that launches the rebuild itself once the idle window
                     opens (max wait HERMES_REBUILD_MAX_WAIT_MIN, default 60
                     min; the immediate call returns fast). Same guards, same
                     rate-limit family.

Security properties
-------------------
  - Hardcoded whitelist — no runtime configuration
  - Parametric commands validate every argument against fixed allowlists
    (env names, service names, line counts); subprocess argv is built from
    validated values only — no shell interpolation, no free-form input
  - Live push requires an explicit confirm: true (strict boolean — the string
    "false" is not accepted); pull-data is destructive and always requires
    confirm: true
  - Confirm-required commands additionally require a fresh HMAC approval
    signature (see "Confirm / operator approval protocol" above) so an
    agent-forged confirm: true cannot bypass the live gate
  - req_id is forced to the request file stem — a crafted "id" cannot
    escape RESP_DIR (no path traversal)
  - env.push is additionally guarded by a per-target lockfile under
    $ROOT_DIR/.tmp/env-locks (daemon-private, 0700, O_EXCL creation with
    stale-lock steal after 10 min) so two pushes to the same env cannot
    run concurrently
  - hermes.rebuild and hermes.rebuild.wait are the only hermes.* exceptions
    (guards: active-session + no-double-launch checks inside the wrapper;
    detached; same rate-limit family as the dev mutators)
  - Sanitized output: secret-pattern lines redacted (key=value assignments,
    connection strings, Stripe/GitHub/AWS/Slack token prefixes, PEM private
    key blocks, Bearer tokens), 8KB cap
  - Mutating commands rate-limited to 3 per 60 s — NOTE: the rate limiter is
    in-memory and per-process; a daemon restart resets the budget (documented
    limitation, not a security boundary)
  - In-memory processed-ID cache prevents re-execution of stuck req files
  - Stale-REQ guard: req files older than 10 minutes at read time are skipped
    and left (never re-executed after a daemon restart without fresh
    confirmation; the client deletes its own req files on every exit path)
"""

import collections
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import shlex
import signal
import subprocess
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Host-only guard
# ---------------------------------------------------------------------------
# This daemon is a HOST service (manages host dev processes). If it starts
# inside the Hermes container it can only race the real host daemon on the
# shared agent-cmds/ drop dirs and answer dev.* requests with misleading
# refusals (issues #100/#105). Exit immediately instead of becoming a racer.
# The VULPY_AGENT_SERVER=1 marker is honored for legit host daemons on
# containerized VPS hosts (same escape hatch as the vulpy-dev.sh guard).
if (
    os.path.exists("/.dockerenv")
    and os.path.isdir("/app/workspace")
    and os.environ.get("VULPY_AGENT_SERVER") != "1"
):
    print(
        "vulpy-agent-cmd-server: refusing to run inside the Hermes container "
        "(host-only service). Start it on the host: pnpm vulpy agent-server start",
        file=sys.stderr,
    )
    sys.exit(0)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT_DIR  = Path(__file__).resolve().parent.parent
REQ_DIR   = ROOT_DIR / "agent-cmds" / "req"
RESP_DIR  = ROOT_DIR / "agent-cmds" / "resp"
PID_FILE  = ROOT_DIR / ".tmp" / "dev" / "agent-cmd-server.pid"
LOG_FILE  = ROOT_DIR / ".tmp" / "dev" / "agent-cmd-server.log"

# Create dirs the daemon owns (req/ is created by hermes-compose.sh and
# later chowned to Fox by the entrypoint; resp/ stays daemon-owned).
RESP_DIR.mkdir(parents=True, exist_ok=True)
PID_FILE.parent.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [agent-cmd-server] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger("agent-cmd-server")

# ---------------------------------------------------------------------------
# Allowed commands — dev loop + environment operations + the guarded
# hermes.rebuild exception (no other hermes.*)
# ---------------------------------------------------------------------------

PNPM = ["pnpm", "vulpy"]

ALLOWED: dict[str, list[str]] = {
    # Dev server lifecycle (mutating — rate-limited)
    "dev.up":              PNPM + ["dev", "up"],
    "dev.down":            PNPM + ["dev", "down"],
    "dev.restart":         PNPM + ["dev", "restart"],
    "dev.wake":            PNPM + ["dev", "wake"],
    "dev.sleep":           PNPM + ["dev", "sleep"],
    # Destructive dev-only catalog/content rebuild — fixed argv, no free-form args.
    "store.reseed":        ["bash", "scripts/store-reseed.sh"],
    # Repair only this checkout's local pnpm shim — fixed argv, no free-form args.
    "runtime.repair-pnpm":  ["bash", "scripts/repair-pnpm-shim.sh"],
    # Tailscale serve (Fox sidecar) — fixed, idempotent helper; no free-form args.
    "ts.serve":            ["bash", "scripts/vulpy-tailscale-serve.sh"],
    # Read-only Fox Tailscale sidecar status probe — fixed argv, no free-form args.
    "ts.status":           ["bash", "scripts/vulpy-fox-tailscale-status.sh"],
    # Hermes container rebuild — guarded exception (see module docstring):
    # refuses while a WebUI session is active or a rebuild is already running;
    # runs detached; rate-limited like the dev mutators. The .wait variant
    # queues instead of refusing when a session is active.
    "hermes.rebuild":      ["bash", "scripts/hermes-rebuild-bridge.sh"],
    "hermes.rebuild.wait": ["bash", "scripts/hermes-rebuild-bridge.sh", "--wait"],
    # Read-only Hermes container inspection (diagnostics; not rate-limited).
    # hermes-compose.sh forwards argv to `docker compose`; ps -a and logs are
    # the only subcommands allowed here — fixed argv, no free-form args.
    "hermes.ps":           ["bash", "scripts/hermes-compose.sh", "ps", "-a"],
    "hermes.logs":         ["bash", "scripts/hermes-compose.sh", "logs", "--tail=200"],
    # Environment operations — parametric (argv built from validated args by
    # the build_*_argv helpers; see PARAMETRIC_BUILDERS). env.push and
    # env.pull_data are mutating (rate-limited + lockfile-guarded) and stream
    # output into the response file; env.logs is read-only and one-shot.
    "env.push":            ["bash", "scripts/env-push.sh"],
    "env.pull_data":       ["bash", "scripts/env-pull-data.sh"],
    "env.logs":            ["bash", "scripts/env-logs.sh"],
    # Read-only (not rate-limited)
    "dev.status":          PNPM + ["dev", "status"],
    "dev.logs":            PNPM + ["dev", "logs"],
    "dev.logs-medusa":     PNPM + ["dev", "logs-medusa"],
    "dev.logs-storefront": PNPM + ["dev", "logs-storefront"],
    "status":              PNPM + ["agent", "status"],
}

# Commands that mutate service state — rate-limited.
MUTATING_CMDS = {
    "dev.up", "dev.down", "dev.restart", "dev.wake", "dev.sleep",
    "env.push", "env.pull_data",
    "hermes.rebuild", "hermes.rebuild.wait", "ts.serve", "store.reseed",
    "runtime.repair-pnpm",
    # Read-only inspection — not mutating, never rate-limited.
    "hermes.ps", "hermes.logs",
}

# Commands whose argv is built from request args (validated, never free-form).
PARAMETRIC_CMDS = {"env.push", "env.pull_data", "env.logs"}

# Commands that stream output into the response file incrementally
# ("done": false until the subprocess exits). Long-running pipelines benefit
# from progressive output; log tails are one-shot.
STREAMING_CMDS = {"env.push", "env.pull_data"}

# ---------------------------------------------------------------------------
# Env operation validation — fixed allowlists, no free-form input
# ---------------------------------------------------------------------------

ENV_NAMES      = ("dev", "staging", "live")
ENV_PUSH_TARGETS   = ("staging", "live")
ENV_PULL_SOURCES   = ("staging", "live")
ENV_PULL_TARGETS   = ("dev", "staging")
ENV_LOG_SERVICES   = ("storefront", "medusa")
ENV_LOG_MAX_LINES  = 500
ENV_LOG_DEFAULT_LINES = 50

# Per-target lockfile for env.push — one push per env at a time. Locks live
# in a daemon-private dir (not a predictable /tmp path): 0700, O_EXCL
# creation, stale-lock steal after ENV_LOCK_TTL_SECONDS.
ENV_LOCK_DIR = ROOT_DIR / ".tmp" / "env-locks"
ENV_LOCK_TTL_SECONDS = 600.0   # 10 min — longer than any push pipeline

# Shared HMAC secret for the operator-approval protocol (see docstring).
# Resolution order: env var → /data/config/agent-hmac-secret (in-container
# Hermes data dir) → <checkout>/.data/hermes/config/agent-hmac-secret (the
# same file seen from the host). Generated on first use (32 random bytes hex,
# 0600) so the WebUI bridge and the daemon always share one secret.
HMAC_SECRET_CANDIDATES = (
    Path("/data/config/agent-hmac-secret"),
    ROOT_DIR / ".data" / "hermes" / "config" / "agent-hmac-secret",
)
APPROVAL_MAX_AGE_SECONDS = 120.0


def validate_env_push(args: dict) -> str | None:
    """Validate env.push args. Return an error message or None."""
    target = args.get("target")
    if target not in ENV_PUSH_TARGETS:
        return (
            f"invalid target: {target!r} (expected one of "
            f"{', '.join(ENV_PUSH_TARGETS)})"
        )
    # Strict boolean: only `confirm: true` (JSON true) passes. A truthy
    # string ("false") or int (1) is NOT confirmation.
    if target == "live" and args.get("confirm") is not True:
        return (
            "confirm required: pushing to live is a production deploy, "
            "pass confirm: true"
        )
    return None


def build_env_push_argv(args: dict) -> list[str]:
    """Build the subprocess argv for env.push from validated args.

    --confirm is appended whenever confirm: true is passed (the shell script
    validates it and requires it for live; staging accepts it as a belt-and-
    suspenders signal for agent-cmd bridge transparency).
    """
    argv = ["bash", "scripts/env-push.sh", str(args["target"])]
    if args.get("confirm") is True:
        argv.append("--confirm")
    return argv


def validate_env_pull_data(args: dict) -> str | None:
    """Validate env.pull_data args. Return an error message or None."""
    target = args.get("target")
    source = args.get("source")
    if source not in ENV_PULL_SOURCES:
        return (
            f"invalid source: {source!r} (expected one of "
            f"{', '.join(ENV_PULL_SOURCES)})"
        )
    if target not in ENV_PULL_TARGETS:
        return (
            f"invalid target: {target!r} (expected one of "
            f"{', '.join(ENV_PULL_TARGETS)})"
        )
    if target == source:
        return f"invalid: source and target are the same ({source!r})"
    # Strict boolean — see validate_env_push.
    if args.get("confirm") is not True:
        return (
            "confirm required: pulling data overwrites the target database, "
            "pass confirm: true"
        )
    return None


def build_env_pull_data_argv(args: dict) -> list[str]:
    """Build the subprocess argv for env.pull_data from validated args.

    --confirm is appended whenever confirm is true — env-pull-data.sh is
    destructive and always requires it.
    """
    argv = [
        "bash", "scripts/env-pull-data.sh",
        str(args["target"]), "--from", str(args["source"]),
    ]
    if args.get("confirm") is True:
        argv.append("--confirm")
    return argv


def validate_env_logs(args: dict) -> str | None:
    """Validate env.logs args. Return an error message or None."""
    env = args.get("env")
    if env not in ENV_NAMES:
        return (
            f"invalid env: {env!r} (expected one of {', '.join(ENV_NAMES)})"
        )
    service = args.get("service")
    if service is not None and service not in ENV_LOG_SERVICES:
        return (
            f"invalid service: {service!r} (expected one of "
            f"{', '.join(ENV_LOG_SERVICES)})"
        )
    lines = args.get("lines")
    if lines is not None:
        try:
            lines_int = int(lines)
        except (TypeError, ValueError):
            return (
                f"invalid lines: {lines!r} (expected an integer "
                f"1..{ENV_LOG_MAX_LINES})"
            )
        if lines_int < 1 or lines_int > ENV_LOG_MAX_LINES:
            return (
                f"invalid lines: {lines!r} (expected 1..{ENV_LOG_MAX_LINES})"
            )
    return None


def build_env_logs_argv(args: dict) -> list[str]:
    """Build the subprocess argv for env.logs from validated args."""
    argv = ["bash", "scripts/env-logs.sh", str(args["env"])]
    service = args.get("service")
    if service:
        argv += ["--service", str(service)]
    lines = args.get("lines")
    if lines is not None:
        argv += ["--lines", str(lines)]
    return argv


PARAMETRIC_VALIDATORS = {
    "env.push":      validate_env_push,
    "env.pull_data": validate_env_pull_data,
    "env.logs":      validate_env_logs,
}

PARAMETRIC_BUILDERS = {
    "env.push":      build_env_push_argv,
    "env.pull_data": build_env_pull_data_argv,
    "env.logs":      build_env_logs_argv,
}


def env_push_lock_path(env: str) -> Path:
    """Absolute lockfile path for an env push target (daemon-private dir)."""
    return ENV_LOCK_DIR / f"env-push-{env}.lock"


def check_env_lockfile(env: str) -> str | None:
    """Return an error if an env push lock is held for the target, else None."""
    lock_path = env_push_lock_path(env)
    if lock_path.exists():
        return (
            f"env push already in progress for {env!r} "
            f"(lockfile {lock_path}) — try again later"
        )
    return None


def acquire_env_lockfile(env: str) -> bool:
    """Atomically create the per-target lockfile for an env push.

    Uses O_CREAT|O_EXCL|O_NOFOLLOW so a symlink cannot redirect the lock and
    two processes cannot both win. Writes this daemon's PID into the file. If
    the lock already exists but is stale (mtime older than
    ENV_LOCK_TTL_SECONDS), it is stolen with a warning so a crashed daemon
    cannot wedge the target forever.

    Returns True when the caller now holds the lock, False when a live lock
    exists (or the lock dir is unusable).
    """
    _ensure_env_lock_dir()
    lock_path = env_push_lock_path(env)

    def _try_create() -> bool:
        try:
            fd = os.open(
                lock_path,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
                0o600,
            )
        except OSError:
            return False
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(str(os.getpid()))
        return True

    if _try_create():
        return True

    # Lock exists — stale steal.
    try:
        age = time.time() - lock_path.stat().st_mtime
    except OSError:
        return False
    if age <= ENV_LOCK_TTL_SECONDS:
        return False
    log.warning(
        "Stealing stale env lock %s (age %.0fs > TTL %.0fs)",
        lock_path, age, ENV_LOCK_TTL_SECONDS,
    )
    try:
        lock_path.unlink(missing_ok=True)
    except OSError:
        return False
    return _try_create()


def _ensure_env_lock_dir() -> None:
    """Create the daemon-private lock dir with 0700 permissions."""
    try:
        ENV_LOCK_DIR.mkdir(parents=True, exist_ok=True)
        os.chmod(ENV_LOCK_DIR, 0o700)
    except OSError:
        pass


def release_env_lockfile(env: str) -> None:
    """Best-effort removal of the per-target lockfile."""
    try:
        env_push_lock_path(env).unlink(missing_ok=True)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Operator approval (HMAC) — confirm-required commands (H1)
# ---------------------------------------------------------------------------


def approval_required(cmd: str, args: dict) -> bool:
    """True when a confirm-required command additionally needs HMAC approval.

    env.push to live and every env.pull_data are destructive production
    operations: even with confirm: true, the server requires a fresh HMAC
    signed by the WebUI operator bridge so a req file forged by the agent
    cannot self-approve (H1).
    """
    if cmd == "env.push":
        return args.get("target") == "live" and args.get("confirm") is True
    if cmd == "env.pull_data":
        return args.get("confirm") is True
    return False


def approval_message(cmd: str, args: dict, ts: object) -> str:
    """Canonical string signed by the WebUI bridge for confirm-required cmds.

    WebUI sends approval: {"ts": <integer unix seconds>, "sig": <hex>} where
    sig = HMAC-SHA256(secret, "<cmd>|<target>|<source>|<ts>"). The signing
    side MUST produce this exact string.
    """
    target = str(args.get("target") or "")
    source = str(args.get("source") or "")
    return f"{cmd}|{target}|{source}|{ts}"


def verify_approval(args: dict, cmd: str, secret: str | None) -> tuple[bool, str]:
    """Verify the HMAC approval payload for a confirm-required command.

    Returns (ok, reason). Fails closed when secret is None — a confirm-required
    command is NEVER accepted without a usable shared secret.

    KNOWN GAP (replay window): the signed message binds cmd/target/source/ts
    but NOT req_id, so an identical op captured within APPROVAL_MAX_AGE_SECONDS
    can be replayed. No client signs approvals yet, so the gap is mitigated by
    construction (only the WebUI operator bridge holds the secret and can mint
    a fresh sig) and the window is intentionally short. Planned fix: bind
    req_id (or a per-request nonce) into approval_message when client signing
    lands.
    """
    if not secret:
        return (
            False,
            "no approval secret configured "
            "(VULPY_AGENT_HMAC_SECRET or /data/config/agent-hmac-secret)",
        )
    approval = args.get("approval")
    if not isinstance(approval, dict):
        return False, "approval payload missing (expected approval: {ts, sig})"
    ts = approval.get("ts")
    sig = approval.get("sig")
    if not isinstance(ts, int) or isinstance(ts, bool):
        return False, "approval.ts must be an integer unix timestamp"
    if not isinstance(sig, str) or not sig:
        return False, "approval.sig must be a non-empty string"
    now = time.time()
    if abs(now - float(ts)) > APPROVAL_MAX_AGE_SECONDS:
        return False, f"approval expired (ts outside ±{APPROVAL_MAX_AGE_SECONDS:.0f}s)"
    expected = hmac.new(
        secret.encode("utf-8"),
        approval_message(cmd, args, ts).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False, "approval signature mismatch"
    return True, ""


def _load_hmac_secret() -> str | None:
    """Return the shared approval HMAC secret, generating it once if needed.

    Resolution order: VULPY_AGENT_HMAC_SECRET env → /data/config/
    agent-hmac-secret (in-container view of the Hermes data dir) →
    <checkout>/.data/hermes/config/agent-hmac-secret (same file, host-side).
    When the file does not exist it is created with 32 random bytes hex and
    mode 0600. Returns None only when no candidate path is usable — callers
    must FAIL CLOSED in that case.
    """
    env_secret = os.environ.get("VULPY_AGENT_HMAC_SECRET")
    if env_secret:
        return env_secret.strip()
    for path in HMAC_SECRET_CANDIDATES:
        try:
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(secrets.token_hex(32), encoding="utf-8")
                os.chmod(path, 0o600)
                log.info("Generated agent approval HMAC secret → %s", path)
            return path.read_text(encoding="utf-8").strip()
        except OSError as exc:
            log.warning("HMAC secret candidate %s unusable: %s", path, exc)
            continue
    log.error("No usable path for the agent approval HMAC secret — fail closed")
    return None

# ---------------------------------------------------------------------------
# Output sanitization
# ---------------------------------------------------------------------------

# Lines matching these patterns are redacted before the response is written.
SECRET_LINE_RE = re.compile(
    # key=value / key:value assignments where the key smells secret — the
    # surrounding [a-z0-9_]* lets STRIPE_SECRET_KEY= / NEXT_PUBLIC_STRIPE_KEY=
    # etc. match even though the literal keyword is not at the key start.
    r"(?i)\b[a-z0-9_]*(?:password|secret|token|api[_-]?key|auth[_-]?key|"
    r"credential|jwt|bearer|private[_-]?key|access[_-]?key)[a-z0-9_]*\s*[=:]"
    # connection strings with embedded passwords
    r"|://[^:@\s]{1,80}:[^@\s]{1,200}@"
    # well-known secret class prefixes (Stripe, webhooks, GitHub, AWS, Slack)
    r"|sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|pk_live_[A-Za-z0-9]+|pk_test_[A-Za-z0-9]+"
    r"|whsec_[A-Za-z0-9]+|whlive_[A-Za-z0-9]+|ghp_[A-Za-z0-9]+"
    r"|AKIA[0-9A-Z]{16}"
    r"|xox[baprs]-[A-Za-z0-9-]+"
    # Bearer tokens (JWTs, opaque tokens)
    r"|\bBearer [A-Za-z0-9._~+/-]+=*"
)

# PEM private key blocks span multiple lines — the sanitizer redacts the
# whole block by tracking BEGIN/END state across lines.
PEM_BEGIN_RE = re.compile(r"-----BEGIN [A-Z ]+PRIVATE KEY-----")
PEM_END_RE = re.compile(r"-----END [A-Z ]+PRIVATE KEY-----")

MAX_OUT_BYTES = 8192


def sanitize(text: str) -> str:
    """Strip secret-looking lines and truncate to MAX_OUT_BYTES."""
    lines = text.splitlines(keepends=True)
    clean: list[str] = []
    in_pem = False
    for line in lines:
        if PEM_BEGIN_RE.search(line):
            in_pem = True
        if in_pem or SECRET_LINE_RE.search(line):
            clean.append("[redacted — matched secret pattern]\n")
        else:
            clean.append(line)
        if in_pem and PEM_END_RE.search(line):
            in_pem = False
    result = "".join(clean)
    encoded = result.encode(errors="replace")
    if len(encoded) > MAX_OUT_BYTES:
        result = encoded[:MAX_OUT_BYTES].decode(errors="replace") + "\n[truncated]\n"
    return result

# ---------------------------------------------------------------------------
# Rate limiting — mutating commands only
# ---------------------------------------------------------------------------

RATE_LIMIT_WINDOW = 60.0   # seconds
RATE_LIMIT_MAX    = 3      # executions per window per command family

_rate_buckets: dict[str, collections.deque] = collections.defaultdict(
    lambda: collections.deque()
)


def check_rate_limit(cmd: str) -> bool:
    """Return True if allowed, False if rate-limited. Updates the bucket."""
    if cmd not in MUTATING_CMDS:
        return True
    family = cmd.split(".")[0]
    now = time.time()
    dq = _rate_buckets[family]
    while dq and now - dq[0] > RATE_LIMIT_WINDOW:
        dq.popleft()
    if len(dq) >= RATE_LIMIT_MAX:
        return False
    dq.append(now)
    return True

# ---------------------------------------------------------------------------
# Processed-ID cache — prevents re-execution when daemon cannot unlink req file
# ---------------------------------------------------------------------------

_processed: collections.OrderedDict[str, float] = collections.OrderedDict()
MAX_PROCESSED_CACHE = 500


def mark_processed(req_id: str) -> None:
    _processed[req_id] = time.time()
    while len(_processed) > MAX_PROCESSED_CACHE:
        _processed.popitem(last=False)


def is_processed(req_id: str) -> bool:
    return req_id in _processed

# ---------------------------------------------------------------------------
# Stale-REQ guard — skip re-executing old req files after a daemon restart
# ---------------------------------------------------------------------------
# The client owns req/ and deletes its own req files on every exit path, but
# a client that died mid-flight (or a daemon restart with a stale drop) can
# leave a req behind. The daemon cannot unlink those files (PermissionError —
# req/ is Fox-owned), and the in-memory _processed cache is lost on restart,
# so re-executing a stale req would run mutating commands (env.push /
# env.pull_data) without fresh confirmation. A req whose mtime is older than
# STALE_REQ_MAX_AGE at read time is treated as stale: skip + leave (log it).

STALE_REQ_MAX_AGE = 600.0  # seconds (10 minutes)


def is_stale_req(mtime: float, now: float | None = None) -> bool:
    """True when a req file mtime is older than STALE_REQ_MAX_AGE."""
    if now is None:
        now = time.time()
    return (now - mtime) > STALE_REQ_MAX_AGE

# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------


def handle_request(req_path: Path) -> None:
    """Read a .req.json, execute, write .resp.json."""
    # Stale-REQ guard: skip + leave req files whose mtime is older than
    # STALE_REQ_MAX_AGE (see the guard section above). Checked before ANY
    # parsing or execution so a leftover req can never re-run a mutating
    # command after a daemon restart.
    try:
        req_mtime = req_path.stat().st_mtime
    except OSError:
        req_mtime = 0.0
    if is_stale_req(req_mtime):
        log.warning(
            "Skipping stale req %s (mtime %.0fs old, max %.0fs)",
            req_path.name, time.time() - req_mtime, STALE_REQ_MAX_AGE,
        )
        return

    try:
        raw = req_path.read_text(encoding="utf-8")
        req = json.loads(raw)
    except Exception as exc:
        log.warning("Bad request file %s: %s", req_path.name, exc)
        _try_unlink(req_path)
        return

    # H7: derive req_id from the request FILE NAME — never from the JSON "id"
    # field. A crafted "id" such as "../../etc/passwd" must not influence the
    # response path. Files are <uuid>.req.json, so strip that suffix to get
    # the uuid (Path.stem alone would leave ".req" in the name).
    if req_path.name.endswith(".req.json"):
        req_id = req_path.name[: -len(".req.json")]
    else:
        req_id = req_path.name.removesuffix(".json")
    cmd    = req.get("cmd", "")
    args   = req.get("args")
    if not isinstance(args, dict):
        args = {}

    # Skip already-processed requests (stuck req files Fox hasn't deleted yet).
    if is_processed(req_id):
        return

    resp_path = RESP_DIR / f"{req_id}.resp.json"

    if cmd not in ALLOWED:
        _write_resp(resp_path, req_id, ok=False, out="",
                    err=f"unknown command: {cmd!r}")
        mark_processed(req_id)
        _try_unlink(req_path)
        return

    # Parametric commands validate their args against fixed allowlists before
    # anything else — a bad request must not consume rate-limit budget or
    # touch lockfiles.
    if cmd in PARAMETRIC_CMDS:
        err = PARAMETRIC_VALIDATORS[cmd](args)
        if err:
            log.warning("Invalid args for %s (req %s): %s", cmd, req_id, err)
            _write_resp(resp_path, req_id, ok=False, out="",
                        err=f"invalid {cmd} args: {err}")
            mark_processed(req_id)
            _try_unlink(req_path)
            return

    # H1: confirm-required commands (live env.push, every env.pull_data) also
    # need a fresh HMAC approval from the WebUI operator bridge. Fail closed.
    if approval_required(cmd, args):
        ok, reason = verify_approval(args, cmd, _load_hmac_secret())
        if not ok:
            log.warning("Approval rejected for %s (req %s): %s",
                        cmd, req_id, reason)
            _write_resp(resp_path, req_id, ok=False, out="",
                        err=f"approval required: {reason}")
            mark_processed(req_id)
            _try_unlink(req_path)
            return

    if not check_rate_limit(cmd):
        err = (
            f"rate limit: '{cmd}' exceeded {RATE_LIMIT_MAX} calls "
            f"in {RATE_LIMIT_WINDOW:.0f}s — try again later"
        )
        log.warning("Rate-limited: %s (req %s)", cmd, req_id)
        _write_resp(resp_path, req_id, ok=False, out="", err=err)
        mark_processed(req_id)
        _try_unlink(req_path)
        return

    # env.push is additionally guarded per target: one push per env at a time.
    lock_env: str | None = None
    acquired_lock = False
    if cmd == "env.push":
        lock_env = str(args.get("target"))
        if not acquire_env_lockfile(lock_env):
            lock_err = check_env_lockfile(lock_env)
            if not lock_err:
                lock_err = (
                    f"env push already in progress for {lock_env!r} "
                    f"— try again later"
                )
            log.warning("env.push refused (req %s): %s", req_id, lock_err)
            _write_resp(resp_path, req_id, ok=False, out="", err=lock_err)
            mark_processed(req_id)
            _try_unlink(req_path)
            return
        acquired_lock = True

    try:
        if cmd in PARAMETRIC_CMDS:
            argv = PARAMETRIC_BUILDERS[cmd](args)
        else:
            argv = list(ALLOWED[cmd])
        log.info("Executing %s → %s", cmd, shlex.join(argv))
        if cmd in STREAMING_CMDS:
            _run_streaming(argv, resp_path, req_id, cmd)
        else:
            _run_once(argv, resp_path, req_id, cmd)
    finally:
        if acquired_lock and lock_env is not None:
            release_env_lockfile(lock_env)

    mark_processed(req_id)
    _try_unlink(req_path)


def _run_once(argv: list[str], resp_path: Path, req_id: str, cmd: str) -> None:
    """Run a short command to completion and write a single response."""
    # start_new_session: run the command in its own session/process group so a
    # wedged `dev wake` (300s timeout) can be killed with os.killpg on timeout
    # without touching the daemon or its other children. subprocess.run would
    # leave the wedged subprocess alive to race the next wake.
    proc = subprocess.Popen(
        argv,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=str(ROOT_DIR),
        start_new_session=True,
    )
    try:
        out, err = proc.communicate(timeout=300)
        ok = proc.returncode == 0
        _write_resp(resp_path, req_id, ok=ok,
                    out=sanitize(out),
                    err=sanitize(err))
        log.info("Finished %s (rc=%s)", cmd, proc.returncode)
    except subprocess.TimeoutExpired:
        log.warning("Timeout for %s — killing process group %s", cmd, proc.pid)
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.communicate()
        except ProcessLookupError:
            pass  # already exited on its own
        _write_resp(resp_path, req_id, ok=False, out="",
                    err="command timed out after 300s")
    except Exception as exc:
        _write_resp(resp_path, req_id, ok=False, out="", err=str(exc))
        log.error("Error running %s: %s", cmd, exc)


def _write_resp_streaming(path: Path, req_id: str, *, out: str, err: str,
                          done: bool, ok: bool = False) -> None:
    """Atomically write a (possibly intermediate) streaming response."""
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps({
            "id": req_id, "ok": ok, "out": out, "err": err, "done": done,
        }),
        encoding="utf-8",
    )
    tmp.rename(path)


def _run_streaming(argv: list[str], resp_path: Path, req_id: str,
                   cmd: str) -> None:
    """Run a long command, streaming stdout/stderr into the response file.

    The response is rewritten atomically (tmp + rename) as output arrives with
    "done": false, so a polling client can render progress incrementally. The
    final write carries "done": true and the real exit status. Output stays
    sanitized and capped at MAX_OUT_BYTES like the one-shot path.
    """
    try:
        import select
    except ImportError:  # pragma: no cover — POSIX-only daemon
        select = None

    proc = subprocess.Popen(
        argv,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=str(ROOT_DIR),
        start_new_session=True,
        bufsize=1,
    )
    out_stream = proc.stdout
    err_stream = proc.stderr
    # text=True + PIPE guarantees both streams exist (types can't know this).
    assert out_stream is not None and err_stream is not None
    out_chunks: list[str] = []
    err_chunks: list[str] = []
    _write_resp_streaming(resp_path, req_id, out="", err="", done=False)

    def _flush() -> None:
        _write_resp_streaming(
            resp_path, req_id,
            out=sanitize("".join(out_chunks)),
            err=sanitize("".join(err_chunks)),
            done=False,
        )

    def _collect(stream) -> None:
        # Read whatever is currently available via the raw fd — never
        # stream.read() (blocking until EOF would stall the whole loop).
        try:
            chunk = os.read(stream.fileno(), 4096)
        except (OSError, ValueError):
            return
        if not chunk:
            return
        text = chunk.decode("utf-8", errors="replace")
        (err_chunks if stream is err_stream else out_chunks).append(text)

    def _drain(stream) -> None:
        while True:
            try:
                chunk = os.read(stream.fileno(), 4096)
            except (OSError, ValueError):
                return
            if not chunk:
                return
            text = chunk.decode("utf-8", errors="replace")
            (err_chunks if stream is err_stream else out_chunks).append(text)

    timed_out = False
    deadline = time.monotonic() + 300.0
    try:
        while proc.poll() is None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                timed_out = True
                break
            if select is not None:
                try:
                    rlist, _, _ = select.select(
                        [out_stream, err_stream], [], [], min(remaining, 1.0)
                    )
                except (OSError, ValueError):
                    rlist = []
                for stream in rlist:
                    _collect(stream)
                if rlist:
                    _flush()
            else:  # pragma: no cover
                try:
                    out, err = proc.communicate(timeout=min(remaining, 1.0))
                except subprocess.TimeoutExpired:
                    continue
                if out:
                    out_chunks.append(out)
                if err:
                    err_chunks.append(err)
                _flush()
                break
        else:
            # Process exited on its own — drain whatever is left in the pipes.
            _drain(out_stream)
            _drain(err_stream)
    except Exception as exc:
        log.error("Error streaming %s: %s", cmd, exc)
        _write_resp_streaming(resp_path, req_id, done=True, ok=False,
                              out=sanitize("".join(out_chunks)),
                              err=sanitize("".join(err_chunks)) + f"\n{exc}\n")
        return

    if timed_out:
        log.warning("Timeout for %s — killing process group %s", cmd, proc.pid)
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.communicate()
        except ProcessLookupError:
            pass  # already exited on its own
        _write_resp_streaming(resp_path, req_id, done=True, ok=False,
                              out=sanitize("".join(out_chunks)),
                              err=sanitize("".join(err_chunks))
                              + "command timed out after 300s\n")
        return

    ok = proc.returncode == 0
    _write_resp_streaming(
        resp_path, req_id, done=True, ok=ok,
        out=sanitize("".join(out_chunks)),
        err=sanitize("".join(err_chunks)),
    )
    log.info("Finished %s (rc=%s)", cmd, proc.returncode)


def _try_unlink(path: Path) -> None:
    """Best-effort unlink — silently ignore PermissionError (Fox owns req/)."""
    try:
        path.unlink(missing_ok=True)
    except PermissionError:
        pass  # req/ is Fox-owned; Fox will delete its own req file
    except OSError as exc:
        log.debug("Could not unlink %s: %s", path.name, exc)


def _write_resp(path: Path, req_id: str, *, ok: bool, out: str, err: str) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps({"id": req_id, "ok": ok, "out": out, "err": err}),
        encoding="utf-8",
    )
    tmp.rename(path)

# ---------------------------------------------------------------------------
# Housekeeping — prune stale resp files (> 5 min old)
# ---------------------------------------------------------------------------


def prune_stale(max_age: float = 300.0) -> None:
    now = time.time()
    for p in RESP_DIR.glob("*.resp.json"):
        try:
            if now - p.stat().st_mtime > max_age:
                p.unlink(missing_ok=True)
                log.debug("Pruned stale response %s", p.name)
        except OSError:
            pass
    # Also remove any .tmp files left by crashed writes.
    for p in RESP_DIR.glob("*.tmp"):
        try:
            if now - p.stat().st_mtime > 60.0:
                p.unlink(missing_ok=True)
        except OSError:
            pass

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

_running = True


def _handle_signal(sig, _frame):
    global _running
    log.info("Received signal %s — shutting down.", sig)
    _running = False


def main() -> None:
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT,  _handle_signal)

    log.info("Agent command server started (pid=%s)", os.getpid())
    log.info("REQ_DIR:  %s", REQ_DIR)
    log.info("RESP_DIR: %s", RESP_DIR)
    log.info("Allowed: %s", ", ".join(sorted(ALLOWED)))

    prune_counter = 0
    while _running:
        try:
            if REQ_DIR.is_dir():
                for req_path in sorted(REQ_DIR.glob("*.req.json")):
                    if not _running:
                        break
                    handle_request(req_path)

            prune_counter += 1
            if prune_counter >= 60:   # every ~30 s at 0.5 s poll
                prune_stale()
                prune_counter = 0

        except Exception as exc:
            log.error("Unhandled error in main loop: %s", exc)

        time.sleep(0.5)

    PID_FILE.unlink(missing_ok=True)
    log.info("Agent command server stopped.")


if __name__ == "__main__":
    main()

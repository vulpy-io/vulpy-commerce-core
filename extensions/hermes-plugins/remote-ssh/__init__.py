"""remote-ssh plugin — JSON-parameter SSH tool for Vulpy boxes.

Kills the quote-mangling class of failures: the LLM passes plain JSON
(command text included); everything crosses to the remote host via a
single-line base64 pipe. No heredocs, no nested escaping, ever.

Actions:
  run   — run a command/script, return combined output + exit code
  bg    — launch detached (nohup) job, return PID + log path
  poll  — check bg job liveness + tail its log
  put   — scp local -> remote (optional sudo_dest for tenant homes)
  get   — scp remote -> local

Defaults: user=ubuntu, keys auto-tried from /data/config/ssh + ~/.ssh +
/app/.ssh (gateway key first, then demo key). Connections reused via
ControlMaster. Host keys accepted on first use (accept-new).
"""

from __future__ import annotations

import base64
import json
import os
import shlex
import shutil
import subprocess

DEFAULT_USER = "ubuntu"
DEFAULT_PORT = 22
MAX_OUTPUT_CHARS = 20000
POLL_TAIL_BYTES = 4000
CONTROL_PATH = "/tmp/.fox-ssh-cm-%r@%h-%p"
KEY_ORDER = ["id_ed25519_gateway", "id_ed25519_demo"]
KEY_DIRS = [
    "/data/config/ssh",
    os.path.expanduser("~/.ssh"),
    "/app/.ssh",
]


class RemoteError(Exception):
    pass


def _check_requirements() -> bool:
    return shutil.which("ssh") is not None


def _find_key(explicit: str | None) -> str:
    """Resolve an SSH private key path. Explicit wins; else first existing
    candidate in KEY_ORDER x KEY_DIRS preference."""
    if explicit:
        candidates = (
            [explicit]
            if os.path.isabs(explicit)
            else [os.path.join(d, explicit) for d in KEY_DIRS]
        )
        for path in candidates:
            if os.path.isfile(path):
                return path
        raise RemoteError(f"SSH key not found: {explicit}")
    for directory in KEY_DIRS:
        for name in KEY_ORDER:
            path = os.path.join(directory, name)
            if os.path.isfile(path):
                return path
    raise RemoteError(
        "No SSH key found in: " + ", ".join(KEY_DIRS)
    )


def _base_opts(port: int) -> list[str]:
    return [
        "-p", str(port),
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ConnectTimeout=10",
        "-o", "BatchMode=yes",
        "-o", f"ControlPath={CONTROL_PATH}",
        "-o", "ControlPersist=10m",
    ]


def _candidate_keys(key: str | None) -> list[str]:
    """Ordered unique list of existing key paths to try."""
    if key:
        return [_find_key(key)]
    seen: set[str] = set()
    keys: list[str] = []
    for directory in KEY_DIRS:
        for name in KEY_ORDER:
            path = os.path.join(directory, name)
            if os.path.isfile(path) and path not in seen:
                seen.add(path)
                keys.append(path)
    if not keys:
        raise RemoteError("No SSH key found in: " + ", ".join(KEY_DIRS))
    return keys


def _is_auth_failure(stderr: str) -> bool:
    return "Permission denied" in stderr or "publickey" in stderr


def _try_keys(host: str, user: str, port: int, key: str | None, argv_tail: list[str],
              timeout: int) -> tuple[str, str]:
    """Run ssh trying each available key in order. Returns (stdout, stderr).
    Raises RemoteError if all keys fail."""
    keys = _candidate_keys(key)

    last_err = ""
    for key_path in keys:
        cmd = ["ssh", *(_base_opts(port)), "-i", key_path,
               f"{user}@{host}", *argv_tail]
        try:
            proc = subprocess.run(
                cmd, capture_output=True, text=True,
                timeout=timeout, stdin=subprocess.DEVNULL,
            )
        except subprocess.TimeoutExpired:
            raise RemoteError(
                f"ssh timed out after {timeout}s. The remote process may "
                "STILL be running — do not blindly re-run; check state via "
                "action=poll or a status probe."
            )
        if proc.returncode == 255 and _is_auth_failure(proc.stderr):
            last_err = proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else "auth failed"
            continue  # try next key
        return proc.stdout, proc.stderr
    raise RemoteError(
        f"All SSH keys rejected by {user}@{host}. Last error: {last_err}"
    )


def _b64_pipe(script: str) -> str:
    """Wrap a script into a single-line remote command via base64 stdin.
    Prints a sentinel exit-code line parsed by _parse_rc."""
    b64 = base64.b64encode(script.encode()).decode()
    return f"echo {b64} | base64 -d | bash 2>&1; echo __RC__:$?"


def _parse_rc(out: str) -> tuple[int, str]:
    lines = out.splitlines()
    rc = -1
    if lines and lines[-1].startswith("__RC__:"):
        try:
            rc = int(lines[-1].split(":", 1)[1])
        except ValueError:
            pass
        lines = lines[:-1]
    return rc, "\n".join(lines)


def _clip(text: str, limit: int = MAX_OUTPUT_CHARS) -> str:
    if len(text) <= limit:
        return text
    head = text[: limit // 4]
    tail = text[-(limit - limit // 4):]
    return head + f"\n… [{len(text) - limit} chars clipped] …\n" + tail


def _run_script(host: str, user: str, port: int, key: str | None,
                script: str, timeout: int) -> dict:
    out, err = _try_keys(host, user, port, key, [_b64_pipe(script)], timeout)
    rc, body = _parse_rc(out)
    result = {"exit_code": rc, "output": _clip(body)}
    if err.strip():
        result["stderr"] = _clip(err.strip(), 2000)
    return result


# -- actions -----------------------------------------------------------------


def _action_run(args: dict) -> dict:
    command = args.get("command")
    if not command:
        raise RemoteError("run requires 'command' (multi-line scripts welcome)")
    return _run_script(
        args["host"], args.get("user", DEFAULT_USER),
        args.get("port", DEFAULT_PORT), args.get("key"),
        command, int(args.get("timeout", 60)),
    )


def _action_bg(args: dict) -> dict:
    command = args.get("command")
    if not command:
        raise RemoteError("bg requires 'command'")
    job_id = f"job-{os.getpid()}-{int(__import__('time').time())}"
    script_path = f"/tmp/{job_id}.sh"
    log_path = f"/tmp/{job_id}.log"
    b64 = base64.b64encode(command.encode()).decode()
    launcher = (
        f"echo {b64} | base64 -d > {script_path}"
        f" && chmod +x {script_path}"
        f" && rm -f {log_path}"
        f" && nohup bash {script_path} > {log_path} 2>&1 < /dev/null & echo PID:$!"
    )
    out, err = _try_keys(args["host"], args.get("user", DEFAULT_USER),
                         args.get("port", DEFAULT_PORT), args.get("key"),
                         [launcher], 30)
    pid_line = [ln for ln in out.splitlines() if ln.startswith("PID:")][-1:] or [""]
    pid = pid_line[0].split(":", 1)[1].strip()
    return {
        "pid": pid,
        "log_path": log_path,
        "script_path": script_path,
        "note": "Poll with action=poll. Empty log right after launch is normal.",
        **({"stderr": err.strip()[:500]} if err.strip() else {}),
    }


def _action_poll(args: dict) -> dict:
    pid = args.get("pid")
    log = args.get("log_path")
    if not pid or not log:
        raise RemoteError("poll requires 'pid' and 'log_path' (from bg)")
    probe = (
        f"kill -0 {shlex.quote(pid)} 2>/dev/null && echo RUNNING || echo DONE;"
        f" echo ---LOG---;"
        f" tail -c {POLL_TAIL_BYTES} {shlex.quote(log)} 2>/dev/null"
    )
    out, err = _try_keys(args["host"], args.get("user", DEFAULT_USER),
                         args.get("port", DEFAULT_PORT), args.get("key"),
                         [probe], 30)
    status, _, log_body = out.partition("---LOG---\n")
    return {
        "status": status.strip()[:16],
        "log": _clip(log_body.strip()),
        **({"stderr": err.strip()[:500]} if err.strip() else {}),
    }


def _scp(host: str, user: str, port: int, keys: list[str], src: str, dst: str,
         timeout: int) -> None:
    last_err = ""
    for key_path in keys:
        cmd = ["scp", "-P", str(port),
               "-o", "StrictHostKeyChecking=accept-new",
               "-o", "ConnectTimeout=10",
               "-o", "BatchMode=yes",
               "-o", f"ControlPath={CONTROL_PATH}",
               "-o", "ControlPersist=10m",
               "-i", key_path, src, dst]
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=timeout, stdin=subprocess.DEVNULL)
        if proc.returncode == 255 and _is_auth_failure(proc.stderr or ""):
            last_err = (proc.stderr or "").strip().splitlines()[-1] if (proc.stderr or "").strip() else "auth failed"
            continue
        if proc.returncode != 0:
            raise RemoteError(f"scp failed (rc={proc.returncode}): "
                              f"{(proc.stderr or proc.stdout).strip()[-800:]}")
        return
    raise RemoteError(f"scp: all SSH keys rejected by {user}@{host}. "
                      f"Last error: {last_err}")


def _action_put(args: dict) -> dict:
    local = args.get("local_path")
    remote = args.get("remote_path")
    if not local or not remote:
        raise RemoteError("put requires 'local_path' and 'remote_path'")
    if not os.path.isfile(local):
        raise RemoteError(f"Local file not found: {local}")
    host, user = args["host"], args.get("user", DEFAULT_USER)
    port = args.get("port", DEFAULT_PORT)
    keys = _candidate_keys(args.get("key"))
    if args.get("sudo_dest"):
        staged = f"/tmp/fox-upload-{os.path.basename(remote)}"
        _scp(host, user, port, keys, local, f"{user}@{host}:{staged}",
             int(args.get("timeout", 120)))
        copy = (
            f"sudo cp {shlex.quote(staged)} {shlex.quote(remote)}"
            f" && sudo chown $(stat -c '%U:%G' $(dirname {shlex.quote(remote)}))"
            f" {shlex.quote(remote)} && rm -f {shlex.quote(staged)} && echo COPIED"
        )
        result = _run_script(host, user, port, args.get("key"), copy,
                             int(args.get("timeout", 60)))
        if "COPIED" not in result.get("output", ""):
            result["error"] = f"sudo cp step failed: {result.get('output', '')[:300]}"
        return {"copied_to": remote, **result}
    _scp(host, user, port, keys, local, f"{user}@{host}:{remote}",
         int(args.get("timeout", 120)))
    return {"copied_to": f"{user}@{host}:{remote}"}


def _action_get(args: dict) -> dict:
    remote = args.get("remote_path")
    local = args.get("local_path")
    if not remote or not local:
        raise RemoteError("get requires 'remote_path' and 'local_path'")
    host, user = args["host"], args.get("user", DEFAULT_USER)
    _scp(host, user, args.get("port", DEFAULT_PORT),
         _candidate_keys(args.get("key")),
         f"{user}@{host}:{remote}", local, int(args.get("timeout", 120)))
    size = os.path.getsize(local) if os.path.isfile(local) else 0
    return {"saved_to": local, "bytes": size}


_ACTIONS = {
    "run": _action_run,
    "bg": _action_bg,
    "poll": _action_poll,
    "put": _action_put,
    "get": _action_get,
}

_SCHEMA = {
    "name": "remote",
    "description": (
        "Run commands, transfer files, and manage background jobs on remote "
        "Vulpy servers over SSH — with zero shell quoting (command text is "
        "transported verbatim via base64; multi-line scripts are fine).\n"
        "Actions:\n"
        "- run: execute command, returns {exit_code, output}\n"
        "- bg: launch long install/job detached; returns pid + log_path\n"
        "- poll: check bg job (RUNNING/DONE) + read log tail\n"
        "- put/get: scp file transfers; sudo_dest=true stages via /tmp + "
        "sudo cp for files owned by other users\n"
        "Defaults: user=ubuntu, key auto-selected (gateway, then demo). "
        "Connections are reused between calls (ControlMaster). If run times "
        "out, the remote process may still be alive — poll, don't re-run."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["run", "bg", "poll", "put", "get"],
                "description": "What to do on the remote host.",
            },
            "host": {
                "type": "string",
                "description": "Hostname or IP (required for all actions).",
            },
            "user": {
                "type": "string",
                "description": f"Remote user. Default: {DEFAULT_USER}.",
            },
            "port": {
                "type": "integer",
                "description": f"SSH port. Default: {DEFAULT_PORT}.",
            },
            "command": {
                "type": "string",
                "description": "Command or multi-line script (run/bg). Passed verbatim — no escaping needed.",
            },
            "local_path": {"type": "string", "description": "Local file (put source / get destination)."},
            "remote_path": {"type": "string", "description": "Remote file (put destination / get source)."},
            "sudo_dest": {
                "type": "boolean",
                "description": "put: stage via /tmp + sudo cp (needed when target dir is owned by another user).",
            },
            "pid": {"type": "string", "description": "Background PID from bg (poll)."},
            "log_path": {"type": "string", "description": "Log path from bg (poll)."},
            "key": {
                "type": "string",
                "description": "Override key: filename in a known key dir or absolute path. Default: auto (gateway → demo).",
            },
            "timeout": {
                "type": "integer",
                "description": "Seconds before giving up (default 60 for run, 120 for transfers).",
            },
        },
        "required": ["action"],
    },
}


def remote_tool(args: dict, **kwargs) -> str:
    try:
        action = args.get("action")
        fn = _ACTIONS.get(action)
        if fn is None:
            return json.dumps({
                "error": f"Unknown action {action!r}. Valid: {sorted(_ACTIONS)}"
            })
        if not args.get("host"):
            return json.dumps({"error": "'host' is required"})
        result = fn(args)
        return json.dumps(result)
    except RemoteError as exc:
        return json.dumps({"error": str(exc)})
    except Exception as exc:  # noqa: BLE001 — registry also guards, keep shape stable
        return json.dumps({"error": f"{type(exc).__name__}: {exc}"})


def register(ctx) -> None:
    ctx.register_tool(
        name="remote",
        toolset="terminal",
        schema=_SCHEMA,
        handler=remote_tool,
        check_fn=_check_requirements,
        description=_SCHEMA["description"],
        emoji="🔗",
    )

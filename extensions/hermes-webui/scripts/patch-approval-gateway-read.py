#!/usr/bin/env python3
"""Patch gateway+WebUI: native pending-approval read for gateway mode.

Problem: with webui_chat_backend=gateway, the agent (and its approval state)
runs in the GATEWAY process. The WebUI's /api/approval/pending handler reads
the WebUI process's own tools.approval store — always empty in gateway mode —
so the frontend's 1.5s poll returned null and actively HID the approval card.
Commands sat waiting 300s on an invisible approval, then BLOCKED.

Fix (three files):
  1. api_server.py: stamp a stable approval_id into the queue entry in
     _approval_notify (so SSE events and the read endpoint agree), and add
     GET /v1/runs/{run_id}/approval returning the head pending approval
     (redacted) + pending_count.
  2. runner_client.py: add HttpRunnerClient.get_pending_approval() and
     get_active_run().
  3. routes.py: _handle_approval_pending resolves the session's active run
     (via _STREAM_RUN_IDS or the gateway's active-run endpoint) and polls the
     gateway's native endpoint instead of the local (empty) store.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once
    (upgrade drift → must be caught at build time, not silently skip).
  - Idempotent: safe to run repeatedly on an already-patched file.

Usage:
  python3 patch-approval-gateway-read.py \
      /app/hermes-agent/gateway/platforms/api_server.py \
      /app/hermes-webui/api/runner_client.py \
      /app/hermes-webui/api/routes.py
"""

import sys

MARK_API = "gateway-read; approval_id stamp + GET /v1/runs/{run_id}/approval"
MARK_RUNNER = "gateway-read; get_pending_approval + get_active_run"
MARK_ROUTES = "gateway-read; _handle_approval_pending gateway branch"

# ---------------------------------------------------------------------------
# api_server.py patches
# ---------------------------------------------------------------------------

API_PATCHES = [
    # 1. Module docstring — document the new GET endpoint.
    {
        "anchor": "- POST /v1/runs/{run_id}/approval — resolve a pending run approval",
        "old": (
            "- POST /v1/runs/{run_id}/approval — resolve a pending run approval\n"
            "- POST /v1/runs/{run_id}/stop       — interrupt a running agent"
        ),
        "new": (
            "- POST /v1/runs/{run_id}/approval — resolve a pending run approval\n"
            "- GET  /v1/runs/{run_id}/approval — read the pending approval for a run\n"
            "- POST /v1/runs/{run_id}/stop       — interrupt a running agent\n"
            "\n"
            "gateway-read; approval_id stamp + GET /v1/runs/{run_id}/approval"
        ),
        "description": "api_server docstring: add GET approval read endpoint",
    },
    # 2. _approval_notify — stamp approval_id into queue entry data + event.
    {
        "anchor": "def _approval_notify(approval_data: Dict[str, Any]) -> None:",
        "old": (
            "                def _approval_notify(approval_data: Dict[str, Any]) -> None:\n"
            "                    event = dict(approval_data or {})\n"
            "                    # Redact credentials from the command before it enters the"
        ),
        "new": (
            "                def _approval_notify(approval_data: Dict[str, Any]) -> None:\n"
            "                    event = dict(approval_data or {})\n"
            "                    # Stamp a stable approval_id into BOTH the SSE event and the\n"
            "                    # queue entry's data dict (same object) so the WebUI can\n"
            "                    # respond by id after polling GET /v1/runs/{run_id}/approval.\n"
            "                    approval_data.setdefault(\"approval_id\", uuid.uuid4().hex)\n"
            "                    event[\"approval_id\"] = approval_data[\"approval_id\"]\n"
            "                    # Redact credentials from the command before it enters the"
        ),
        "description": "api_server _approval_notify: stamp approval_id",
    },
    # 3. New handler _handle_get_run_approval before _handle_stop_run.
    {
        "anchor": '    async def _handle_stop_run(self, request: "web.Request") -> "web.Response":',
        "old": (
            '            "resolved": resolved,\n'
            "        })\n"
            "\n"
            '    async def _handle_stop_run(self, request: "web.Request") -> "web.Response":'
        ),
        "new": (
            '            "resolved": resolved,\n'
            "        })\n"
            "\n"
            '    async def _handle_get_run_approval(self, request: "web.Request") -> "web.Response":\n'
            '        """GET /v1/runs/{run_id}/approval — read the pending approval for a run.\n'
            "\n"
            "        Returns the head pending approval entry (command, description,\n"
            "        pattern_keys, approval_id) plus the pending count, or\n"
            '        ``{"pending": null, "pending_count": 0}`` when the run has none.\n'
            "        The WebUI polls this in gateway mode because the approval state lives\n"
            "        in THIS process (tools.approval._gateway_queues), not in the WebUI.\n"
            '        """\n'
            '        auth_err = self._check_auth(request)\n'
            "        if auth_err:\n"
            "            return auth_err\n"
            "\n"
            '        run_id = request.match_info["run_id"]\n'
            "        status = self._run_statuses.get(run_id)\n"
            "        if status is None:\n"
            "            return web.json_response(\n"
            '                _openai_error(f"Run not found: {run_id}", code="run_not_found"),\n'
            "                status=404,\n"
            "            )\n"
            "\n"
            "        approval_session_key = self._run_approval_sessions.get(run_id)\n"
            "        pending = None\n"
            "        pending_count = 0\n"
            "        if approval_session_key:\n"
            "            try:\n"
            "                from tools.approval import _gateway_queues, _lock\n"
            "\n"
            "                with _lock:\n"
            "                    queue = _gateway_queues.get(approval_session_key) or []\n"
            "                    pending_count = len(queue)\n"
            "                    if queue:\n"
            "                        raw = getattr(queue[0], \"data\", None) or {}\n"
            "                        pending = dict(raw)\n"
            "                        # Redact credentials before they leave the gateway\n"
            "                        # (same egress rule as _approval_notify).\n"
            '                        if "command" in pending:\n'
            "                            from gateway.run import _redact_approval_command\n"
            "\n"
            '                            pending["command"] = _redact_approval_command(pending["command"])\n'
            "            except Exception as exc:\n"
            '                logger.debug("[api_server] approval read failed for run %s: %s", run_id, exc)\n'
            "\n"
            "        return web.json_response({\n"
            '            "run_id": run_id,\n'
            '            "status": status.get("status"),\n'
            '            "pending": pending,\n'
            '            "pending_count": pending_count,\n'
            "        })\n"
            "\n"
            '    async def _handle_stop_run(self, request: "web.Request") -> "web.Response":'
        ),
        "description": "api_server: add _handle_get_run_approval handler",
    },
    # 4. Route registration.
    {
        "anchor": 'self._app.router.add_post("/v1/runs/{run_id}/approval", self._handle_run_approval)',
        "old": 'self._app.router.add_post("/v1/runs/{run_id}/approval", self._handle_run_approval)',
        "new": (
            'self._app.router.add_post("/v1/runs/{run_id}/approval", self._handle_run_approval)\n'
            '            self._app.router.add_get("/v1/runs/{run_id}/approval", self._handle_get_run_approval)'
        ),
        "description": "api_server: register GET /v1/runs/{run_id}/approval",
    },
]

# ---------------------------------------------------------------------------
# runner_client.py patches
# ---------------------------------------------------------------------------

RUNNER_PATCHES = [
    {
        "anchor": "def get_run(self, run_id: str) -> dict[str, Any]:",
        "old": (
            "    def get_run(self, run_id: str) -> dict[str, Any]:\n"
            "        return self._get(f\"/v1/runs/{urllib.parse.quote(str(run_id), safe='')}\")\n"
            "\n"
            "    def cancel_run"
        ),
        "new": (
            "    def get_run(self, run_id: str) -> dict[str, Any]:\n"
            "        return self._get(f\"/v1/runs/{urllib.parse.quote(str(run_id), safe='')}\")\n"
            "\n"
            "    # gateway-read; get_pending_approval + get_active_run\n"
            "    def get_pending_approval(self, run_id: str) -> dict[str, Any]:\n"
            '        """GET /v1/runs/{run_id}/approval — read the pending approval for a run.\n'
            "\n"
            "        Gateway-mode approval state lives in the gateway process; the WebUI\n"
            "        polls this endpoint instead of its own (empty) local approval store.\n"
            '        """\n'
            "        return self._get(f\"/v1/runs/{urllib.parse.quote(str(run_id), safe='')}/approval\")\n"
            "\n"
            "    def get_active_run(self, session_id: str) -> dict[str, Any]:\n"
            '        """GET /api/sessions/{session_id}/active-run — discover the active run."""\n'
            "        return self._get(f\"/api/sessions/{urllib.parse.quote(str(session_id), safe='')}/active-run\")\n"
            "\n"
            "    def cancel_run"
        ),
        "description": "runner_client: add get_pending_approval + get_active_run",
    },
]

# ---------------------------------------------------------------------------
# routes.py patches
# ---------------------------------------------------------------------------

ROUTES_PATCHES = [
    {
        "anchor": "def _handle_approval_pending(handler, parsed):",
        "old": (
            "def _handle_approval_pending(handler, parsed):\n"
            "    sid = parse_qs(parsed.query).get(\"session_id\", [\"\"])[0]\n"
            "    with _lock:"
        ),
        "new": (
            "def _handle_approval_pending(handler, parsed):\n"
            "    sid = parse_qs(parsed.query).get(\"session_id\", [\"\"])[0]\n"
            "\n"
            "    # Gateway mode: the live approval state lives in the GATEWAY process\n"
            "    # (tools.approval._gateway_queues keyed by the run's approval session).\n"
            "    # The local WebUI store is empty in this mode, so the 1.5s frontend poll\n"
            "    # would otherwise return null and actively HIDE the approval card.  Poll\n"
            "    # the gateway's native GET /v1/runs/{run_id}/approval instead; fall back\n"
            "    # to the local mirror only when no run is active or the gateway is down.\n"
            "    if sid:\n"
            "        try:\n"
            "            from api.gateway_chat import (\n"
            "                _STREAM_RUN_IDS,\n"
            "                _gateway_base_url,\n"
            "                _gateway_api_key,\n"
            "                webui_gateway_chat_enabled,\n"
            "            )\n"
            "            from api.config import get_config as _gw_get_config\n"
            "            from api.runner_client import HttpRunnerClient, RunnerClientError\n"
            "            # gateway-read; _handle_approval_pending gateway branch\n"
            "            if webui_gateway_chat_enabled(_gw_get_config()):\n"
            "                _gw_run_id = None\n"
            "                _gw_session = get_session(sid)\n"
            "                if _gw_session is not None:\n"
            "                    _active_sid = getattr(_gw_session, \"active_stream_id\", None)\n"
            "                    if _active_sid:\n"
            "                        _gw_run_id = _STREAM_RUN_IDS.get(_active_sid)\n"
            "                if not _gw_run_id:\n"
            "                    try:\n"
            "                        _active = HttpRunnerClient(\n"
            "                            base_url=_gateway_base_url(_gw_get_config()),\n"
            "                            api_key=_gateway_api_key(),\n"
            "                        ).get_active_run(sid)\n"
            "                        _gw_run_id = (_active or {}).get(\"run_id\")\n"
            "                    except (RunnerClientError, ValueError):\n"
            "                        _gw_run_id = None\n"
            "                if _gw_run_id:\n"
            "                    try:\n"
            "                        _gw_data = HttpRunnerClient(\n"
            "                            base_url=_gateway_base_url(_gw_get_config()),\n"
            "                            api_key=_gateway_api_key(),\n"
            "                        ).get_pending_approval(_gw_run_id)\n"
            "                        if isinstance(_gw_data, dict) and _gw_data.get(\"run_id\") == _gw_run_id:\n"
            "                            return j(handler, {\n"
            "                                \"pending\": _gw_data.get(\"pending\"),\n"
            "                                \"pending_count\": _gw_data.get(\"pending_count\", 0),\n"
            "                            })\n"
            "                    except (RunnerClientError, ValueError):\n"
            "                        pass  # fall through to local mirror\n"
            "        except Exception:\n"
            "            pass\n"
            "\n"
            "    with _lock:"
        ),
        "description": "routes: _handle_approval_pending gateway branch",
    },
]


def _count(src: str, needle: str) -> int:
    return src.count(needle)


def _apply_group(path: str, patches: list, mark: str, label: str) -> None:
    with open(path) as f:
        src = f.read()

    if mark in src:
        print(f"already patched — {label} ({path})")
        return

    errors = []
    for patch in patches:
        anchor = patch["anchor"]
        n = _count(src, anchor)
        if n == 0:
            errors.append(
                f"ERROR: anchor not found for patch '{patch['description']}':\n"
                f"  anchor: {anchor!r}\n"
                f"  File: {path}\n"
                f"  Hermes changed shape — update "
                f"extensions/hermes-webui/scripts/patch-approval-gateway-read.py"
            )
        elif n > 1:
            errors.append(
                f"ERROR: anchor appears {n} times (expected 1) for patch '{patch['description']}':\n"
                f"  anchor: {anchor!r}\n"
                f"  File: {path}\n"
                f"  Cannot apply patch safely — update the patch script."
            )

    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        sys.exit(1)

    for patch in patches:
        old = patch["old"]
        new = patch["new"]
        if old not in src:
            print(
                f"ERROR: old text not found for patch '{patch['description']}'.\n"
                f"  old text starts with: {old[:80]!r}\n"
                f"  File: {path}",
                file=sys.stderr,
            )
            sys.exit(1)
        src = src.replace(old, new, 1)
        print(f"  applied: {patch['description']}")

    # Stamp the idempotency mark near the first patch's anchor (header area).
    with open(path, "w") as f:
        f.write(src)
    print(f"patched: {label} applied to {path}")


def main() -> None:
    if len(sys.argv) != 4:
        print(
            f"Usage: python3 {sys.argv[0]} api_server.py runner_client.py routes.py",
            file=sys.stderr,
        )
        sys.exit(1)

    api_path, runner_path, routes_path = sys.argv[1:4]
    _apply_group(api_path, API_PATCHES, MARK_API, "approval read (api_server)")
    _apply_group(runner_path, RUNNER_PATCHES, MARK_RUNNER, "approval read (runner_client)")
    _apply_group(routes_path, ROUTES_PATCHES, MARK_ROUTES, "approval read (routes)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Patch api_server.py: run steer endpoint + cross-session approvals listing.

Two gateway-mode legacy-surface fixes (issue #136):

  1. POST /v1/runs/{run_id}/steer — inject a steer message into a live run.
     In gateway mode the agent executes in the gateway process; the WebUI's
     _handle_chat_steer used to read its own in-process SESSION_AGENT_CACHE
     (always empty in gateway mode) and reported "No cached agent is
     available for steering this run".  The new endpoint looks up the run's
     live AIAgent in ``_active_run_agents`` (the same registry _handle_runs
     stores it in) and calls ``agent.steer(text)`` — thread-safe, applies at
     the next tool-result boundary, does NOT interrupt the run.

  2. GET /v1/approvals/pending — list pending approvals across ALL runs.
     Approvals that belong to sessions other than the WebUI's viewed session
     (delegated children, background runs) never surfaced — the frontend only
     polled ?session_id=<viewed>, so they parked invisibly for the full
     gateway approval timeout then BLOCKED the command.  The WebUI polls this
     endpoint to build its cross-session view.

Rules (patch-api-server-runs-fanout.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once
    (upgrade drift → must be caught at build time, not silently skip the patch).
  - Idempotent: safe to run repeatedly on an already-patched file.

Usage: python3 patch-api-server-runs-steer.py /path/to/api_server.py
"""

import sys

# Idempotency marks — presence of either means the patch is already applied.
MARKS = [
    'self._app.router.add_post("/v1/runs/{run_id}/steer", self._handle_steer_run)',
    "api_server; run steer + cross-session approvals",
]

# ---------------------------------------------------------------------------
# Patch declarations — each entry:
#   anchor      : unique substring that must appear EXACTLY ONCE in the file
#   old         : text to replace (must contain the anchor)
#   new         : replacement text
#   description : human-readable name for error messages
# ---------------------------------------------------------------------------

PATCHES = [
    # ------------------------------------------------------------------
    # 1. Module docstring — document the two new endpoints.
    # ------------------------------------------------------------------
    {
        "anchor": "- POST /v1/runs/{run_id}/stop       — interrupt a running agent",
        "old": (
            "- POST /v1/runs/{run_id}/stop       — interrupt a running agent\n"
            "\n"
            "gateway-read; approval_id stamp + GET /v1/runs/{run_id}/approval\n"
            "- GET  /api/sessions/{session_id}/active-run — active run lookup for a session\n"
            "- GET  /health                     — health check\n"
            "- GET  /health/detailed            — rich status for cross-container dashboard probing"
        ),
        "new": (
            "- POST /v1/runs/{run_id}/stop       — interrupt a running agent\n"
            "\n"
            "gateway-read; approval_id stamp + GET /v1/runs/{run_id}/approval\n"
            "- POST /v1/runs/{run_id}/steer      — inject a steer message into a live run\n"
            "- GET  /v1/approvals/pending        — list pending approvals across all runs\n"
            "- GET  /api/sessions/{session_id}/active-run — active run lookup for a session\n"
            "- GET  /health                     — health check\n"
            "- GET  /health/detailed            — rich status for cross-container dashboard probing"
        ),
        "description": "module-docstring: add steer + approvals-pending endpoint entries",
    },

    # ------------------------------------------------------------------
    # 2. New handlers _handle_steer_run + _handle_list_pending_approvals,
    #    inserted between _handle_stop_run and _sweep_orphaned_runs.
    # ------------------------------------------------------------------
    {
        "anchor": '        return web.json_response({"run_id": run_id, "status": "stopping"})',
        "old": (
            '        return web.json_response({"run_id": run_id, "status": "stopping"})\n'
            "\n"
            "    async def _sweep_orphaned_runs(self) -> None:"
        ),
        "new": (
            '        return web.json_response({"run_id": run_id, "status": "stopping"})\n'
            "\n"
            '    async def _handle_steer_run(self, request: "web.Request") -> "web.Response":\n'
            '        """POST /v1/runs/{run_id}/steer — inject a steer message into a live run.\n'
            "\n"
            "        Mirrors the CLI's /steer command: looks up the AIAgent backing the\n"
            "        run (``_active_run_agents`` — the same registry ``_handle_runs``\n"
            "        stores the live agent in), calls ``agent.steer(text)`` — thread-safe,\n"
            "        stashes the text for application at the next tool-result boundary,\n"
            "        and does NOT interrupt the run.  The WebUI forwards its /steer\n"
            "        payloads here in gateway mode because the agent (and its steer\n"
            "        state) lives in THIS process, not in the WebUI's cache.\n"
            '        """\n'
            "        auth_err = self._check_auth(request)\n"
            "        if auth_err:\n"
            "            return auth_err\n"
            "\n"
            '        run_id = request.match_info["run_id"]\n'
            "        agent = self._active_run_agents.get(run_id)\n"
            "        status = self._run_statuses.get(run_id)\n"
            "        if agent is None or status is None:\n"
            "            return web.json_response(\n"
            '                _openai_error(f"Run not found: {run_id}", code="run_not_found"),\n'
            "                status=404,\n"
            "            )\n"
            "\n"
            "        try:\n"
            "            body = await request.json()\n"
            "        except Exception:\n"
            '            return web.json_response(_openai_error("Invalid JSON"), status=400)\n'
            "\n"
            '        text = str(body.get("text", "") or "").strip()\n'
            "        if not text:\n"
            "            return web.json_response(\n"
            '                _openai_error("Missing \'text\' field", code="invalid_steer_text"),\n'
            "                status=400,\n"
            "            )\n"
            "\n"
            "        try:\n"
            "            accepted = bool(agent.steer(text))\n"
            "        except Exception as exc:\n"
            '            logger.warning("[api_server] steer failed for run %s: %s", run_id, exc)\n'
            "            return web.json_response(\n"
            '                _openai_error(f"Steer failed: {exc}", code="steer_failed"),\n'
            "                status=500,\n"
            "            )\n"
            "\n"
            '        return web.json_response({"run_id": run_id, "accepted": accepted})\n'
            "\n"
            '    async def _handle_list_pending_approvals(self, request: "web.Request") -> "web.Response":\n'
            '        """GET /v1/approvals/pending — list pending approvals across ALL runs.\n'
            "\n"
            "        The WebUI polls this in gateway mode to surface approvals that\n"
            "        belong to sessions OTHER than the viewed one (delegated children,\n"
            "        background runs).  Without it those approvals park invisibly until\n"
            "        the gateway approval timeout blocks the command.  Each entry carries\n"
            "        run_id + session_id + approval_id so the WebUI can respond by id.\n"
            '        """\n'
            "        auth_err = self._check_auth(request)\n"
            "        if auth_err:\n"
            "            return auth_err\n"
            "\n"
            "        try:\n"
            "            from tools.approval import _gateway_queues, _lock\n"
            "        except Exception:\n"
            '            return web.json_response({"object": "list", "data": [], "total": 0})\n'
            "\n"
            "        entries: List[Dict[str, Any]] = []\n"
            "        total = 0\n"
            "        with _lock:\n"
            "            for run_id, approval_session_key in list(self._run_approval_sessions.items()):\n"
            "                queue = _gateway_queues.get(approval_session_key) or []\n"
            "                if not queue:\n"
            "                    continue\n"
            "                raw = getattr(queue[0], \"data\", None) or {}\n"
            "                if not raw:\n"
            "                    continue\n"
            "                entry = dict(raw)\n"
            "                # Redact credentials before they leave the gateway (same egress\n"
            "                # rule as _approval_notify / _handle_get_run_approval).\n"
            "                if \"command\" in entry:\n"
            "                    from gateway.run import _redact_approval_command\n"
            "\n"
            "                    entry[\"command\"] = _redact_approval_command(entry.get(\"command\"))\n"
            "                entry[\"run_id\"] = run_id\n"
            "                status = self._run_statuses.get(run_id, {})\n"
            "                if status.get(\"session_id\"):\n"
            "                    entry[\"session_id\"] = status[\"session_id\"]\n"
            "                entry.setdefault(\"approval_id\", uuid.uuid4().hex)\n"
            "                entries.append(entry)\n"
            "                total += len(queue)\n"
            "\n"
            '        return web.json_response({"object": "list", "data": entries, "total": total})\n'
            "\n"
            "    async def _sweep_orphaned_runs(self) -> None:"
        ),
        "description": "add _handle_steer_run + _handle_list_pending_approvals handlers",
    },

    # ------------------------------------------------------------------
    # 3. Route registration — register both new routes after the stop route.
    # ------------------------------------------------------------------
    {
        "anchor": 'self._app.router.add_post("/v1/runs/{run_id}/stop", self._handle_stop_run)',
        "old": (
            '            self._app.router.add_post("/v1/runs/{run_id}/stop", self._handle_stop_run)\n'
            '            # Store the adapter after native routes are registered. Local Hermes-Relay\n'
            '            # bootstrap shims use this key as a feature-detection hook; registering\n'
            '            # native routes first lets those shims no-op instead of shadowing the\n'
            '            # upstream session-control handlers.\n'
            '            self._app["api_server_adapter"] = self'
        ),
        "new": (
            '            self._app.router.add_post("/v1/runs/{run_id}/stop", self._handle_stop_run)\n'
            '            self._app.router.add_post("/v1/runs/{run_id}/steer", self._handle_steer_run)\n'
            '            self._app.router.add_get("/v1/approvals/pending", self._handle_list_pending_approvals)\n'
            '            # Store the adapter after native routes are registered. Local Hermes-Relay\n'
            '            # bootstrap shims use this key as a feature-detection hook; registering\n'
            '            # native routes first lets those shims no-op instead of shadowing the\n'
            '            # upstream session-control handlers.\n'
            '            self._app["api_server_adapter"] = self'
        ),
        "description": "register steer + approvals-pending routes",
    },
]


def apply(path: str) -> None:
    with open(path) as f:
        src = f.read()

    # Idempotency: already patched → done.
    if any(mark in src for mark in MARKS):
        print("already patched — run steer + cross-session approvals present")
        return

    for patch in PATCHES:
        anchor = patch["anchor"]
        if src.count(anchor) != 1:
            print(
                f"ERROR: anchor appears {src.count(anchor)} times (expected 1) "
                f"for patch '{patch['description']}':\n"
                f"  anchor: {anchor!r}\n"
                f"  File: {path}\n"
                "  Cannot apply patch safely — update the patch script.",
                file=sys.stderr,
            )
            sys.exit(1)
        if patch["old"] not in src:
            print(
                f"ERROR: old text not found for patch '{patch['description']}'.\n"
                f"  old text starts with: {patch['old'][:80]!r}\n"
                f"  File: {path}",
                file=sys.stderr,
            )
            sys.exit(1)
        src = src.replace(patch["old"], patch["new"], 1)
        print(f"patched: {patch['description']} applied to {path}")

    with open(path, "w") as f:
        f.write(src)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: patch-api-server-runs-steer.py /path/to/api_server.py", file=sys.stderr)
        sys.exit(2)
    apply(sys.argv[1])

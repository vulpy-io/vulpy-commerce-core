#!/usr/bin/env python3
"""Patch WebUI: gateway-mode legacy surfaces — steer / approvals / children.

Issue #136: with webui_chat_backend=gateway the agent executes in the GATEWAY
process (`gateway/platforms/api_server.py`), so three WebUI surfaces that
assumed an in-process agent broke:

  1. STEER — `_handle_chat_steer` (api/streaming.py) read only the WebUI
     process's SESSION_AGENT_CACHE/STREAMS; in gateway mode that cache is
     empty, so steering errored with "No cached agent is available for
     steering this run" even though the run was live in the gateway.
     Fix: in gateway mode resolve the run_id (bridge's _STREAM_RUN_IDS or the
     gateway's active-run lookup) and forward POST /v1/runs/{run_id}/steer
     with a bearer key.  404 (unknown run) keeps the existing no_cached_agent
     fallback; an unreachable gateway returns a clear gateway_unreachable
     fallback code.

  2. APPROVALS — the frontend only polls /api/approval/pending?session_id=<viewed>;
     approvals for non-viewed sessions (delegated children) parked invisibly
     for the full gateway approval timeout.  Fix: /api/approval/pending
     WITHOUT session_id now returns ANY pending approval across sessions
     (gateway GET /v1/approvals/pending + the local mirror), and
     /api/approval/respond recovers the run_id from the approval_id stamp for
     approvals of sessions the WebUI has never streamed.

  3. CHILDREN — gateway-created child/subagent sessions were excluded from the
     WebUI's own import, so they vanished from the sidebar.  Fix: the sidebar
     payload merges gateway child rows imported over loopback
     GET /api/sessions?include_children=true (bearer) as READ-ONLY rows
     (read_only=true, is_cli_session=false — the frontend already hides the
     composer for read-only rows at static/panels.js).

Files (one patcher group per file):
  - api/runner_client.py : add HttpRunnerClient.steer_run() + list_pending_approvals()
  - api/streaming.py     : gateway-mode branch in _handle_chat_steer
  - api/routes.py        : cross-session pending, respond run_id resolution,
                           children merge in _build_session_list_cache_payload

Rules (patch-approval pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once
    (upgrade drift must be caught at build time, not silently skipped).
  - Idempotent: safe to run repeatedly on an already-patched file.

Usage:
  python3 patch-webui-gateway-legacy-surfaces.py \
      /app/hermes-webui/api/runner_client.py \
      /app/hermes-webui/api/streaming.py \
      /app/hermes-webui/api/routes.py
"""

import sys

MARK_RUNNER = "legacy-surfaces; steer_run + list_pending_approvals"
MARK_STREAMING = "legacy-surfaces; _handle_chat_steer gateway branch"
MARK_ROUTES = "legacy-surfaces; cross-session approvals + children merge"

# ---------------------------------------------------------------------------
# runner_client.py — steer_run + list_pending_approvals
# ---------------------------------------------------------------------------

RUNNER_PATCHES = [
    {
        "anchor": "    def respond_clarify(self, run_id: str, clarify_id: str, response: str) -> dict[str, Any]:",
        "old": (
            "    def respond_clarify(self, run_id: str, clarify_id: str, response: str) -> dict[str, Any]:\n"
            "        return self._post(\n"
            "            f\"/v1/runs/{urllib.parse.quote(str(run_id), safe='')}/clarifications/{urllib.parse.quote(str(clarify_id), safe='')}/respond\",\n"
            "            {\"response\": response},\n"
            "        )\n"
            "\n"
            "    def queue_message(self, run_id: str, message: str, *, mode: str = \"queue\") -> dict[str, Any]:"
        ),
        "new": (
            "    def respond_clarify(self, run_id: str, clarify_id: str, response: str) -> dict[str, Any]:\n"
            "        return self._post(\n"
            "            f\"/v1/runs/{urllib.parse.quote(str(run_id), safe='')}/clarifications/{urllib.parse.quote(str(clarify_id), safe='')}/respond\",\n"
            "            {\"response\": response},\n"
            "        )\n"
            "\n"
            "    # legacy-surfaces; steer_run + list_pending_approvals\n"
            "    def steer_run(self, run_id: str, text: str) -> dict[str, Any]:\n"
            "        \"\"\"POST /v1/runs/{run_id}/steer — inject a steer message into a live run.\n"
            "\n"
            "        Gateway-mode steer state lives in the gateway process; the WebUI\n"
            "        forwards its /steer payloads here because SESSION_AGENT_CACHE is\n"
            "        empty in gateway mode (issue #136).\n"
            "        \"\"\"\n"
            "        return self._post(\n"
            "            f\"/v1/runs/{urllib.parse.quote(str(run_id), safe='')}/steer\",\n"
            "            {\"text\": text},\n"
            "        )\n"
            "\n"
            "    def list_pending_approvals(self) -> dict[str, Any]:\n"
            "        \"\"\"GET /v1/approvals/pending — list pending approvals across ALL runs.\n"
            "\n"
            "        Each entry carries run_id + session_id + approval_id so the WebUI can\n"
            "        surface non-viewed-session approvals (global banner) and respond by id.\n"
            "        \"\"\"\n"
            "        return self._get(\"/v1/approvals/pending\")\n"
            "\n"
            "    def queue_message(self, run_id: str, message: str, *, mode: str = \"queue\") -> dict[str, Any]:"
        ),
        "description": "runner_client: add steer_run + list_pending_approvals",
    },
]

# ---------------------------------------------------------------------------
# streaming.py — gateway-mode branch in _handle_chat_steer
# ---------------------------------------------------------------------------

STREAMING_PATCHES = [
    {
        "anchor": '        return bad(handler, "text required")\n\n    evicted_cached_entry = None',
        "old": (
            '        return bad(handler, "text required")\n'
            "\n"
            "    evicted_cached_entry = None"
        ),
        "new": (
            '        return bad(handler, "text required")\n'
            "\n"
            "    # Gateway mode (#136): the agent (and its steer state) lives in the\n"
            "    # GATEWAY process, so forward to the gateway's POST /v1/runs/{run_id}/steer\n"
            "    # instead of reading the local (empty) SESSION_AGENT_CACHE.  Resolve the\n"
            "    # run_id via the bridge's stream→run map, or the gateway's active-run\n"
            "    # lookup for the session.\n"
            "    try:\n"
            "        from api.gateway_chat import (\n"
            "            _STREAM_RUN_IDS,\n"
            "            _gateway_base_url,\n"
            "            _gateway_api_key,\n"
            "            webui_gateway_chat_enabled,\n"
            "        )\n"
            "        from api.config import get_config as _gw_get_config\n"
            "        from api.runner_client import HttpRunnerClient, RunnerClientError\n"
            "        # legacy-surfaces; _handle_chat_steer gateway branch\n"
            "        if webui_gateway_chat_enabled(_gw_get_config()):\n"
            "            _gw_session = None\n"
            "            try:\n"
            "                _gw_session = get_session(sid)\n"
            "            except KeyError:\n"
            "                _gw_session = None\n"
            "            _gw_run_id = None\n"
            "            if _gw_session is not None:\n"
            "                _active_sid = getattr(_gw_session, \"active_stream_id\", None)\n"
            "                if _active_sid:\n"
            "                    _gw_run_id = _STREAM_RUN_IDS.get(_active_sid)\n"
            "            if not _gw_run_id:\n"
            "                try:\n"
            "                    _active = HttpRunnerClient(\n"
            "                        base_url=_gateway_base_url(_gw_get_config()),\n"
            "                        api_key=_gateway_api_key(),\n"
            "                    ).get_active_run(sid)\n"
            "                    _gw_run_id = (_active or {}).get(\"run_id\")\n"
            "                except (RunnerClientError, ValueError):\n"
            "                    _gw_run_id = None\n"
            "            if not _gw_run_id:\n"
            "                # Unknown run — keep the same fallback the legacy path uses.\n"
            "                return j(handler, {\"accepted\": False, \"fallback\": \"no_cached_agent\",\n"
            "                                   \"stream_id\": None})\n"
            "            try:\n"
            "                _steer_result = HttpRunnerClient(\n"
            "                    base_url=_gateway_base_url(_gw_get_config()),\n"
            "                    api_key=_gateway_api_key(),\n"
            "                ).steer_run(_gw_run_id, text)\n"
            "            except RunnerClientError as exc:\n"
            "                _err_text = str(exc)\n"
            "                if \"HTTP 404\" in _err_text:\n"
            "                    # Run vanished between lookup and steer — same fallback.\n"
            "                    return j(handler, {\"accepted\": False, \"fallback\": \"no_cached_agent\",\n"
            "                                       \"stream_id\": _active_sid})\n"
            "                if \"Runner request failed\" in _err_text:\n"
            "                    logger.debug(\n"
            "                        \"gateway unreachable for steer session=%s run=%s: %s\",\n"
            "                        sid, _gw_run_id, exc,\n"
            "                    )\n"
            "                    return j(handler, {\"accepted\": False, \"fallback\": \"gateway_unreachable\",\n"
            "                                       \"stream_id\": _active_sid})\n"
            "                logger.debug(\n"
            "                    \"gateway steer rejected session=%s run=%s: %s\",\n"
            "                    sid, _gw_run_id, exc,\n"
            "                )\n"
            "                return j(handler, {\"accepted\": False, \"fallback\": \"gateway_error\",\n"
            "                                   \"stream_id\": _active_sid})\n"
            "            accepted = bool((_steer_result or {}).get(\"accepted\"))\n"
            "            return j(handler, {\"accepted\": accepted, \"fallback\": None,\n"
            "                               \"stream_id\": _active_sid})\n"
            "    except Exception:\n"
            "        pass  # fall through to the legacy in-process path\n"
            "\n"
            "    evicted_cached_entry = None"
        ),
        "description": "streaming: _handle_chat_steer gateway branch",
    },
]

# ---------------------------------------------------------------------------
# routes.py — cross-session approvals + children merge
# ---------------------------------------------------------------------------

ROUTES_PATCHES = [
    # 1. Children-import helper before _build_session_list_cache_payload.
    {
        "anchor": "def _build_session_list_cache_payload(\n    active_profile: str | None,",
        "old": "def _build_session_list_cache_payload(\n    active_profile: str | None,",
        "new": (
            "def _gateway_children_sidebar_rows() -> list[dict]:\n"
            "    \"\"\"Import gateway-created child/subagent sessions as read-only sidebar rows.\n"
            "\n"
            "    In gateway mode (issue #136) delegated children execute inside the GATEWAY\n"
            "    process and their session rows live in the gateway's state.db; the WebUI's\n"
            "    own import excludes them (api/agent_sessions.py source filter), so they\n"
            "    vanished from the sidebar.  Fetch the gateway's session list with\n"
            "    include_children=true over loopback (bearer) and map child rows to\n"
            "    READ-ONLY sidebar rows — the frontend already hides the composer for\n"
            "    read_only rows (static/panels.js).  Returns [] when not in gateway mode,\n"
            "    the gateway is unreachable, or no child rows exist.\n"
            "    \"\"\"\n"
            "    try:\n"
            "        from api.gateway_chat import (\n"
            "            _gateway_base_url,\n"
            "            _gateway_api_key,\n"
            "            webui_gateway_chat_enabled,\n"
            "        )\n"
            "        from api.config import get_config as _gw_get_config\n"
            "        if not webui_gateway_chat_enabled(_gw_get_config()):\n"
            "            return []\n"
            "        base_url = _gateway_base_url(_gw_get_config())\n"
            "        api_key = _gateway_api_key()\n"
            "        if not base_url or not api_key:\n"
            "            return []\n"
            "        url = f\"{base_url}/api/sessions?include_children=true&limit=200\"\n"
            "\n"
            "        class _NoRedirect(HTTPRedirectHandler):\n"
            "            def redirect_request(self, *args, **kwargs):\n"
            "                return None\n"
            "\n"
            "        req = Request(\n"
            "            url,\n"
            "            headers={\"Authorization\": f\"Bearer {api_key}\", \"Accept\": \"application/json\"},\n"
            "        )\n"
            "        with build_opener(ProxyHandler({}), _NoRedirect()).open(req, timeout=5) as resp:\n"
            "            payload = json.loads(resp.read().decode(\"utf-8\", errors=\"replace\"))\n"
            "    except Exception as exc:\n"
            "        logger.debug(\"gateway children import failed: %s\", exc)\n"
            "        return []\n"
            "    if not isinstance(payload, dict):\n"
            "        return []\n"
            "    rows = payload.get(\"data\") or []\n"
            "    out: list[dict] = []\n"
            "    for row in rows:\n"
            "        if not isinstance(row, dict):\n"
            "            continue\n"
            "        parent = str(row.get(\"parent_session_id\") or \"\").strip()\n"
            "        if not parent:\n"
            "            continue  # only child rows\n"
            "        sid = str(row.get(\"id\") or row.get(\"session_id\") or \"\").strip()\n"
            "        if not sid:\n"
            "            continue\n"
            "        last_active = row.get(\"last_active\") or row.get(\"started_at\") or 0\n"
            "        title = str(row.get(\"title\") or \"\").strip() or sid\n"
            "        out.append({\n"
            "            \"session_id\": sid,\n"
            "            \"title\": title,\n"
            "            \"display_title\": title,\n"
            "            \"message_count\": int(row.get(\"message_count\") or 0),\n"
            "            \"source_tag\": \"subagent\",\n"
            "            \"raw_source\": str(row.get(\"source\") or \"subagent\"),\n"
            "            \"session_source\": str(row.get(\"source\") or \"subagent\"),\n"
            "            \"source_label\": \"Subagent\",\n"
            "            \"is_cli_session\": False,\n"
            "            \"is_messaging_session\": False,\n"
            "            \"read_only\": True,\n"
            "            \"is_read_only\": True,\n"
            "            \"parent_session_id\": parent,\n"
            "            \"relationship_type\": \"child\",\n"
            "            \"last_message_at\": last_active,\n"
            "            \"updated_at\": last_active,\n"
            "            \"created_at\": row.get(\"started_at\") or 0,\n"
            "            \"model\": row.get(\"model\"),\n"
            "            \"profile\": None,\n"
            "        })\n"
            "    return out\n"
            "\n"
            "\n"
            "def _build_session_list_cache_payload(\n"
            "    active_profile: str | None,"
        ),
        "description": "routes: add _gateway_children_sidebar_rows helper",
    },
    # 2. Cross-session pending collector before _handle_approval_pending.
    {
        "anchor": "def _handle_approval_pending(handler, parsed):",
        "old": "def _handle_approval_pending(handler, parsed):",
        "new": (
            "def _collect_cross_session_pending_approvals() -> list[dict]:\n"
            "    \"\"\"Return ANY pending approval across sessions for the global banner.\n"
            "\n"
            "    Combines the local per-session mirror with (in gateway mode) the\n"
            "    gateway's cross-run GET /v1/approvals/pending.  Every entry carries\n"
            "    session_id + approval_id (+ run_id when the gateway knows it) so the\n"
            "    frontend can respond by id (issue #136).  Gateway entries are collected\n"
            "    FIRST so the already-redacted gateway copy wins on approval_id collision\n"
            "    with the (unredacted) local mirror.\n"
            "    \"\"\"\n"
            "    entries: list[dict] = []\n"
            "    try:\n"
            "        from api.gateway_chat import (\n"
            "            _gateway_base_url,\n"
            "            _gateway_api_key,\n"
            "            webui_gateway_chat_enabled,\n"
            "        )\n"
            "        from api.config import get_config as _gw_get_config\n"
            "        from api.runner_client import HttpRunnerClient, RunnerClientError\n"
            "        if webui_gateway_chat_enabled(_gw_get_config()):\n"
            "            _gw_data = HttpRunnerClient(\n"
            "                base_url=_gateway_base_url(_gw_get_config()),\n"
            "                api_key=_gateway_api_key(),\n"
            "            ).list_pending_approvals()\n"
            "            for _e in (_gw_data or {}).get(\"data\") or []:\n"
            "                if not isinstance(_e, dict):\n"
            "                    continue\n"
            "                entry = dict(_e)\n"
            "                entry.setdefault(\"_session_id\", entry.get(\"session_id\"))\n"
            "                entries.append(entry)\n"
            "    except Exception:\n"
            "        pass  # gateway down — local mirror below still applies\n"
            "    _seen = {str(e.get(\"approval_id\") or \"\") for e in entries}\n"
            "    with _lock:\n"
            "        for _sid, queue in list(_pending.items()):\n"
            "            if isinstance(queue, list):\n"
            "                _queued = queue[:1]\n"
            "            elif queue:\n"
            "                _queued = [queue]\n"
            "            else:\n"
            "                _queued = []\n"
            "            for _p in _queued:\n"
            "                if not isinstance(_p, dict):\n"
            "                    continue\n"
            "                _aid = str(_p.get(\"approval_id\") or \"\")\n"
            "                if _aid and _aid in _seen:\n"
            "                    continue\n"
            "                entry = dict(_p)\n"
            "                entry[\"_session_id\"] = _sid\n"
            "                entry.setdefault(\"session_id\", _sid)\n"
            "                entries.append(entry)\n"
            "                if _aid:\n"
            "                    _seen.add(_aid)\n"
            "    return entries\n"
            "\n"
            "\n"
            "def _handle_approval_pending(handler, parsed):"
        ),
        "description": "routes: add _collect_cross_session_pending_approvals helper",
    },
    # 3. Cross-session branch when session_id is omitted.
    {
        "anchor": "                        pass  # fall through to local mirror\n        except Exception:\n            pass\n\n    with _lock:\n        _head, _total, _changed = reconcile_gateway_pending_mirror_locked(sid)",
        "old": (
            "                        pass  # fall through to local mirror\n"
            "        except Exception:\n"
            "            pass\n"
            "\n"
            "    with _lock:\n"
            "        _head, _total, _changed = reconcile_gateway_pending_mirror_locked(sid)"
        ),
        "new": (
            "                        pass  # fall through to local mirror\n"
            "        except Exception:\n"
            "            pass\n"
            "    else:\n"
            "        # Cross-session attention (#136): no session_id → return ANY pending\n"
            "        # approval across sessions (gateway-backed + local mirror) so the\n"
            "        # frontend can surface non-viewed-session approvals in a global banner\n"
            "        # instead of parking them invisibly for the full approval timeout.\n"
            "        # Keep the viewed-session shape when session_id IS provided (above).\n"
            "        # legacy-surfaces; cross-session approvals + children merge\n"
            "        try:\n"
            "            _cross_entries = _collect_cross_session_pending_approvals()\n"
            "            if _cross_entries:\n"
            "                return j(handler, {\n"
            "                    \"pending\": _cross_entries[0],\n"
            "                    \"pending_count\": len(_cross_entries),\n"
            "                    \"approvals\": _cross_entries,\n"
            "                })\n"
            "        except Exception:\n"
            "            pass\n"
            "        return j(handler, {\"pending\": None, \"pending_count\": 0, \"approvals\": []})\n"
            "\n"
            "    with _lock:\n"
            "        _head, _total, _changed = reconcile_gateway_pending_mirror_locked(sid)"
        ),
        "description": "routes: _handle_approval_pending cross-session branch",
    },
    # 4. Run-id recovery from approval stamp (helper).
    {
        "anchor": "def _session_has_pending_approval(sid: str) -> bool:",
        "old": "def _session_has_pending_approval(sid: str) -> bool:",
        "new": (
            "def _gateway_pending_run_id_by_stamp(approval_id: str) -> str | None:\n"
            "    \"\"\"Recover a run_id from a cross-session approval's approval_id stamp.\n"
            "\n"
            "    The global banner responds with {session_id, choice, approval_id}; the\n"
            "    run may belong to a session the WebUI has never streamed (delegated\n"
            "    child), so the stream→run map and local mirror have no entry.  Poll the\n"
            "    gateway's GET /v1/approvals/pending and match on approval_id (#136).\n"
            "    \"\"\"\n"
            "    approval_id = str(approval_id or \"\").strip()\n"
            "    if not approval_id:\n"
            "        return None\n"
            "    try:\n"
            "        from api.gateway_chat import (\n"
            "            _gateway_base_url,\n"
            "            _gateway_api_key,\n"
            "            webui_gateway_chat_enabled,\n"
            "        )\n"
            "        from api.config import get_config as _get_config\n"
            "        from api.runner_client import HttpRunnerClient, RunnerClientError\n"
            "        if not webui_gateway_chat_enabled(_get_config()):\n"
            "            return None\n"
            "        _gw_data = HttpRunnerClient(\n"
            "            base_url=_gateway_base_url(_get_config()),\n"
            "            api_key=_gateway_api_key(),\n"
            "        ).list_pending_approvals()\n"
            "        for _e in (_gw_data or {}).get(\"data\") or []:\n"
            "            if isinstance(_e, dict) and str(_e.get(\"approval_id\") or \"\") == approval_id:\n"
            "                return str(_e.get(\"run_id\") or \"\") or None\n"
            "    except Exception:\n"
            "        return None\n"
            "    return None\n"
            "\n"
            "\n"
            "def _session_has_pending_approval(sid: str) -> bool:"
        ),
        "description": "routes: add _gateway_pending_run_id_by_stamp helper",
    },
    # 5. Respond: resolve run_id from the stamp when the local paths have none.
    {
        "anchor": (
            "            if not _run_id and approval_id:\n"
            "                _run_id = _gateway_mirrored_pending_run_id(sid, approval_id)\n"
            "        if _run_id:"
        ),
        "old": (
            "            if not _run_id and approval_id:\n"
            "                _run_id = _gateway_mirrored_pending_run_id(sid, approval_id)\n"
            "        if _run_id:"
        ),
        "new": (
            "            if not _run_id and approval_id:\n"
            "                _run_id = _gateway_mirrored_pending_run_id(sid, approval_id)\n"
            "        if not _run_id:\n"
            "            # Non-viewed-session approval (global banner, #136): recover the\n"
            "            # run_id from the approval_id stamp in the gateway's cross-run\n"
            "            # pending list — the local stream→run map has no entry for a\n"
            "            # session the WebUI has never streamed.\n"
            "            _run_id = _gateway_pending_run_id_by_stamp(approval_id)\n"
            "        if _run_id:"
        ),
        "description": "routes: _handle_approval_respond run_id from stamp",
    },
    # 6. Children merge in _build_session_list_cache_payload.
    {
        "anchor": "    merged = webui_sessions + deduped_cli\n    merged.sort(",
        "old": "    merged = webui_sessions + deduped_cli\n    merged.sort(",
        "new": (
            "    merged = webui_sessions + deduped_cli\n"
            "    # Gateway-mode children import (#136): delegated child/subagent sessions\n"
            "    # live in the GATEWAY process and are excluded from the WebUI's own\n"
            "    # import, so restore their sidebar visibility by merging the gateway's\n"
            "    # child rows as READ-ONLY rows (no composer, no delete/edit affordances).\n"
            "    try:\n"
            "        _gw_child_rows = _gateway_children_sidebar_rows()\n"
            "        if _gw_child_rows:\n"
            "            _merged_ids = {s.get(\"session_id\") for s in merged}\n"
            "            merged = merged + [\n"
            "                r for r in _gw_child_rows\n"
            "                if r.get(\"session_id\") not in _merged_ids\n"
            "            ]\n"
            "    except Exception:\n"
            "        pass  # gateway unreachable — sidebar still works without children\n"
            "    merged.sort("
        ),
        "description": "routes: merge gateway children into sidebar payload",
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
                f"extensions/hermes-webui/scripts/patch-webui-gateway-legacy-surfaces.py"
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

    with open(path, "w") as f:
        f.write(src)
    print(f"patched: {label} applied to {path}")


def main() -> None:
    if len(sys.argv) != 4:
        print(
            f"Usage: python3 {sys.argv[0]} runner_client.py streaming.py routes.py",
            file=sys.stderr,
        )
        sys.exit(1)

    runner_path, streaming_path, routes_path = sys.argv[1:4]
    _apply_group(runner_path, RUNNER_PATCHES, MARK_RUNNER, "legacy surfaces (runner_client)")
    _apply_group(streaming_path, STREAMING_PATCHES, MARK_STREAMING, "legacy surfaces (streaming)")
    _apply_group(routes_path, ROUTES_PATCHES, MARK_ROUTES, "legacy surfaces (routes)")


if __name__ == "__main__":
    main()

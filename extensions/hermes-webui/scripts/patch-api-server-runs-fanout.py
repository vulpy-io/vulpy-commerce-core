#!/usr/bin/env python3
"""Patch api_server.py: fan-out run-events + session active-run lookup + messages offset/total.

Three features applied to a fresh Hermes api_server.py:

  1. Fan-out on GET /v1/runs/{run_id}/events — converts the single-consumer
     asyncio.Queue per run into a set of per-subscriber queues so the WebUI
     bridge and the assistant-ui pane can both subscribe simultaneously without
     splitting the event stream.

  2. GET /api/sessions/{session_id}/active-run — new endpoint that returns the
     currently-active run_id for a session (or null when idle), allowing the
     assistant-ui pane to discover which run to subscribe to natively.

  3. GET /api/sessions/{session_id}/messages — adds ?offset=K tail-window
     semantics and always returns "total" in the response, enabling paginated
     tail loading from the assistant-ui pane.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once
    (upgrade drift → must be caught at build time, not silently skip the patch).
  - Idempotent: safe to run repeatedly on an already-patched file.
  - Applies to the current live api_server.py shape (2026-08-14).

Usage: python3 patch-api-server-runs-fanout.py /path/to/api_server.py
"""

import sys

IDEMPOTENCY_MARK = "fan-out; multiple"
IDEMPOTENCY_MARK_OFFSET = "offset+total; messages pagination"


# ---------------------------------------------------------------------------
# Patch declarations — each entry:
#   anchor      : unique substring that must appear EXACTLY ONCE in the file
#   old         : text to replace (must contain the anchor)
#   new         : replacement text
#   description : human-readable name for error messages
# ---------------------------------------------------------------------------

PATCHES = [
    # ------------------------------------------------------------------
    # 1. Module docstring — add active-run endpoint to the endpoint list.
    # ------------------------------------------------------------------
    {
        "anchor": "- GET  /v1/runs/{run_id}/events    — SSE stream of structured lifecycle events\n- POST /v1/runs/{run_id}/approval — resolve a pending run approval\n- POST /v1/runs/{run_id}/stop       — interrupt a running agent",
        "old": (
            "- GET  /v1/runs/{run_id}/events    — SSE stream of structured lifecycle events\n"
            "- POST /v1/runs/{run_id}/approval — resolve a pending run approval\n"
            "- POST /v1/runs/{run_id}/stop       — interrupt a running agent"
        ),
        "new": (
            "- GET  /v1/runs/{run_id}/events    — SSE stream of structured lifecycle events\n"
            "- POST /v1/runs/{run_id}/approval — resolve a pending run approval\n"
            "- POST /v1/runs/{run_id}/stop       — interrupt a running agent\n"
            "- GET  /api/sessions/{session_id}/active-run — active run lookup for a session"
        ),
        "description": "module-docstring: add active-run endpoint entry",
    },

    # ------------------------------------------------------------------
    # 2. _run_streams type comment + declaration:
    #    Dict[run_id → Queue] → Dict[run_id → set[Queue]] (fan-out; multiple
    #    subscribers each get their own queue).
    # ------------------------------------------------------------------
    {
        "anchor": "# Active run streams: run_id -> asyncio.Queue of SSE event dicts\n        self._run_streams: Dict[str, \"asyncio.Queue[Optional[Dict]]\"] = {}",
        "old": (
            "        # Active run streams: run_id -> asyncio.Queue of SSE event dicts\n"
            '        self._run_streams: Dict[str, "asyncio.Queue[Optional[Dict]]"] = {}'
        ),
        "new": (
            "        # Active run streams: run_id -> set of asyncio.Queue (fan-out; multiple\n"
            "        # subscribers each get their own queue so no events are split).\n"
            '        self._run_streams: Dict[str, "set[asyncio.Queue[Optional[Dict]]]"] = {}'
        ),
        "description": "_run_streams type: single Queue → set of Queues (fan-out)",
    },

    # ------------------------------------------------------------------
    # 3. Run creation: single asyncio.Queue() → empty set() for fan-out.
    #    The live file creates `q` with type annotation on one line then
    #    assigns it to `self._run_streams[run_id]` on the next.
    # ------------------------------------------------------------------
    {
        "anchor": '        q: "asyncio.Queue[Optional[Dict]]" = asyncio.Queue()\n        created_at = time.time()\n        self._run_streams[run_id] = q',
        "old": (
            '        q: "asyncio.Queue[Optional[Dict]]" = asyncio.Queue()\n'
            "        created_at = time.time()\n"
            "        self._run_streams[run_id] = q"
        ),
        "new": (
            "        created_at = time.time()\n"
            "        self._run_streams[run_id] = set()"
        ),
        "description": "run creation: asyncio.Queue() → set() for fan-out",
    },

    # ------------------------------------------------------------------
    # 4. _make_run_event_callback._push: single q.put_nowait → fanout to
    #    all queues in the subscriber set.
    # ------------------------------------------------------------------
    {
        "anchor": '            q = self._run_streams.get(run_id)\n            if q is None:\n                return\n            try:\n                loop.call_soon_threadsafe(q.put_nowait, event)\n            except Exception:\n                pass',
        "old": (
            "            q = self._run_streams.get(run_id)\n"
            "            if q is None:\n"
            "                return\n"
            "            try:\n"
            "                loop.call_soon_threadsafe(q.put_nowait, event)\n"
            "            except Exception:\n"
            "                pass"
        ),
        "new": (
            "            queues = self._run_streams.get(run_id)\n"
            "            if not queues:\n"
            "                return\n"
            "            for _q in list(queues):\n"
            "                try:\n"
            "                    loop.call_soon_threadsafe(_q.put_nowait, event)\n"
            "                except Exception:\n"
            "                    pass"
        ),
        "description": "_make_run_event_callback._push: broadcast to all subscriber queues",
    },

    # ------------------------------------------------------------------
    # 5. _text_cb in run creation: single q.put_nowait → fanout.
    #    Note: after patch 3 removed the `q` variable, _text_cb must read
    #    from self._run_streams directly.
    # ------------------------------------------------------------------
    {
        "anchor": "        def _text_cb(delta: Optional[str]) -> None:\n            if delta is None:\n                return\n            try:\n                loop.call_soon_threadsafe(q.put_nowait, {",
        "old": (
            "        def _text_cb(delta: Optional[str]) -> None:\n"
            "            if delta is None:\n"
            "                return\n"
            "            try:\n"
            "                loop.call_soon_threadsafe(q.put_nowait, {\n"
            '                    "event": "message.delta",\n'
            '                    "run_id": run_id,\n'
            '                    "timestamp": time.time(),\n'
            '                    "delta": delta,\n'
            "                })\n"
            "            except Exception:\n"
            "                pass"
        ),
        "new": (
            "        def _text_cb(delta: Optional[str]) -> None:\n"
            "            if delta is None:\n"
            "                return\n"
            "            _ev = {\n"
            '                "event": "message.delta",\n'
            '                "run_id": run_id,\n'
            '                "timestamp": time.time(),\n'
            '                "delta": delta,\n'
            "            }\n"
            "            for _q in list(self._run_streams.get(run_id) or []):\n"
            "                try:\n"
            "                    loop.call_soon_threadsafe(_q.put_nowait, _ev)\n"
            "                except Exception:\n"
            "                    pass"
        ),
        "description": "_text_cb: fanout message.delta to all subscriber queues",
    },

    # ------------------------------------------------------------------
    # 6. Run finalisation: sentinel None → fanout to all subscribers.
    # ------------------------------------------------------------------
    {
        "anchor": "                # Sentinel: signal SSE stream to close\n                try:\n                    q.put_nowait(None)\n                except Exception:\n                    pass",
        "old": (
            "                # Sentinel: signal SSE stream to close\n"
            "                try:\n"
            "                    q.put_nowait(None)\n"
            "                except Exception:\n"
            "                    pass"
        ),
        "new": (
            "                # Sentinel: signal all SSE subscribers to close\n"
            "                for _q in list(self._run_streams.get(run_id) or []):\n"
            "                    try:\n"
            "                        _q.put_nowait(None)\n"
            "                    except Exception:\n"
            "                        pass"
        ),
        "description": "run finalisation: broadcast None sentinel to all subscriber queues",
    },

    # ------------------------------------------------------------------
    # 7. approval_responded push: single q → fanout.
    # ------------------------------------------------------------------
    {
        "anchor": '        q = self._run_streams.get(run_id)\n        if q is not None:\n            try:\n                q.put_nowait({\n                    "event": "approval.responded"',
        "old": (
            "        q = self._run_streams.get(run_id)\n"
            "        if q is not None:\n"
            "            try:\n"
            "                q.put_nowait({\n"
            '                    "event": "approval.responded",\n'
            '                    "run_id": run_id,\n'
            '                    "timestamp": time.time(),\n'
            '                    "choice": choice,\n'
            '                    "resolved": resolved,\n'
            "                })\n"
            "            except Exception:\n"
            "                pass"
        ),
        "new": (
            "        _ar_ev = {\n"
            '            "event": "approval.responded",\n'
            '            "run_id": run_id,\n'
            '            "timestamp": time.time(),\n'
            '            "choice": choice,\n'
            '            "resolved": resolved,\n'
            "        }\n"
            "        for _q in list(self._run_streams.get(run_id) or []):\n"
            "            try:\n"
            "                _q.put_nowait(_ar_ev)\n"
            "            except Exception:\n"
            "                pass"
        ),
        "description": "approval.responded push: fanout to all subscriber queues",
    },

    # ------------------------------------------------------------------
    # 8. _handle_run_events: single-consumer → per-subscriber fan-out.
    # ------------------------------------------------------------------
    {
        "anchor": "    async def _handle_run_events(self, request: \"web.Request\") -> \"web.StreamResponse\":\n        \"\"\"GET /v1/runs/{run_id}/events — SSE stream of structured agent lifecycle events.\"\"\"",
        "old": (
            '    async def _handle_run_events(self, request: "web.Request") -> "web.StreamResponse":\n'
            '        """GET /v1/runs/{run_id}/events — SSE stream of structured agent lifecycle events."""\n'
            "        auth_err = self._check_auth(request)\n"
            "        if auth_err:\n"
            "            return auth_err\n"
            "\n"
            '        run_id = request.match_info["run_id"]\n'
            "\n"
            "        # Allow subscribing slightly before the run is registered (race condition window)\n"
            "        for _ in range(20):\n"
            "            if run_id in self._run_streams:\n"
            "                break\n"
            "            await asyncio.sleep(0.05)\n"
            "        else:\n"
            '            return web.json_response(_openai_error(f"Run not found: {run_id}", code="run_not_found"), status=404)\n'
            "\n"
            "        q = self._run_streams[run_id]\n"
            "\n"
            "        response = web.StreamResponse(\n"
            "            status=200,\n"
            "            headers={\n"
            '                "Content-Type": "text/event-stream",\n'
            '                "Cache-Control": "no-cache",\n'
            '                "X-Accel-Buffering": "no",\n'
            "            },\n"
            "        )\n"
            "        await response.prepare(request)\n"
            "\n"
            "        try:\n"
            "            while True:\n"
            "                try:\n"
            "                    event = await asyncio.wait_for(q.get(), timeout=30.0)\n"
            "                except asyncio.TimeoutError:\n"
            '                    await response.write(b": keepalive\\n\\n")\n'
            "                    continue\n"
            "                if event is None:\n"
            "                    # Run finished — send final SSE comment and close\n"
            '                    await response.write(b": stream closed\\n\\n")\n'
            "                    break\n"
            '                payload = f"data: {json.dumps(event)}\\n\\n"\n'
            "                await response.write(payload.encode())\n"
            "        except Exception as exc:\n"
            '            logger.debug("[api_server] SSE stream error for run %s: %s", run_id, exc)\n'
            "        finally:\n"
            "            self._run_streams.pop(run_id, None)\n"
            "            self._run_streams_created.pop(run_id, None)\n"
            "\n"
            "        return response"
        ),
        "new": (
            '    async def _handle_run_events(self, request: "web.Request") -> "web.StreamResponse":\n'
            '        """GET /v1/runs/{run_id}/events — SSE stream of structured agent lifecycle events."""\n'
            "        auth_err = self._check_auth(request)\n"
            "        if auth_err:\n"
            "            return auth_err\n"
            "\n"
            '        run_id = request.match_info["run_id"]\n'
            "\n"
            "        # Allow subscribing slightly before the run is registered (race condition window)\n"
            "        for _ in range(20):\n"
            "            if run_id in self._run_streams:\n"
            "                break\n"
            "            await asyncio.sleep(0.05)\n"
            "        else:\n"
            '            return web.json_response(_openai_error(f"Run not found: {run_id}", code="run_not_found"), status=404)\n'
            "\n"
            "        # Register a per-subscriber queue for fan-out delivery.\n"
            '        my_q: "asyncio.Queue[Optional[Dict]]" = asyncio.Queue()\n'
            "        self._run_streams[run_id].add(my_q)\n"
            "\n"
            "        response = web.StreamResponse(\n"
            "            status=200,\n"
            "            headers={\n"
            '                "Content-Type": "text/event-stream",\n'
            '                "Cache-Control": "no-cache",\n'
            '                "X-Accel-Buffering": "no",\n'
            "            },\n"
            "        )\n"
            "        await response.prepare(request)\n"
            "\n"
            "        try:\n"
            "            while True:\n"
            "                try:\n"
            "                    event = await asyncio.wait_for(my_q.get(), timeout=30.0)\n"
            "                except asyncio.TimeoutError:\n"
            '                    await response.write(b": keepalive\\n\\n")\n'
            "                    continue\n"
            "                if event is None:\n"
            "                    # Run finished — send final SSE comment and close\n"
            '                    await response.write(b": stream closed\\n\\n")\n'
            "                    break\n"
            '                payload = f"data: {json.dumps(event)}\\n\\n"\n'
            "                await response.write(payload.encode())\n"
            "        except Exception as exc:\n"
            '            logger.debug("[api_server] SSE stream error for run %s: %s", run_id, exc)\n'
            "        finally:\n"
            "            # Remove only this subscriber's queue; keep the run entry while\n"
            "            # other subscribers or the run itself are still active.\n"
            "            subscribers = self._run_streams.get(run_id)\n"
            "            if subscribers is not None:\n"
            "                subscribers.discard(my_q)\n"
            "                # Remove the run's registry entry when the run is terminal AND\n"
            "                # no subscribers remain (the orphan TTL sweep handles the rest).\n"
            '                status = self._run_statuses.get(run_id, {}).get("status")\n'
            '                if not subscribers and status in {"completed", "failed", "cancelled", None}:\n'
            "                    self._run_streams.pop(run_id, None)\n"
            "                    self._run_streams_created.pop(run_id, None)\n"
            "\n"
            "        return response"
        ),
        "description": "_handle_run_events: per-subscriber queue fan-out",
    },

    # ------------------------------------------------------------------
    # 9. _handle_session_active_run: INSERT the handler (fresh upstream has
    #    none). Anchor: the _handle_session_messages signature, which exists
    #    in fresh upstream exactly once. Insert the active-run handler just
    #    before it. On already-patched files the whole PATCHES block is
    #    skipped by the fan-out idempotency mark, so no duplicate insert.
    # ------------------------------------------------------------------
    {
        "anchor": '    async def _handle_session_messages(self, request: "web.Request") -> "web.Response":',
        "old": (
            '    async def _handle_session_messages(self, request: "web.Request") -> "web.Response":\n'
        ),
        "new": (
            '    async def _handle_session_active_run(self, request: "web.Request") -> "web.Response":\n'
            '        """GET /api/sessions/{session_id}/active-run.\n'
            "\n"
            "        Return the newest run bound to this session (by session_id recorded in\n"
            "        run status) that is still active (queued, running, or waiting_for_approval),\n"
            "        or {run_id: null, status: null} when idle. Used by the assistant-ui pane to\n"
            "        discover which /v1/runs/{run_id}/events stream to subscribe to natively.\n"
            '        """\n'
            "        auth_err = self._check_auth(request)\n"
            "        if auth_err:\n"
            "            return auth_err\n"
            '        session_id = request.match_info["session_id"]\n'
            "        _, err = self._get_existing_session_or_404(session_id)\n"
            "        if err:\n"
            "            return err\n"
            '        active_statuses = {"queued", "running", "waiting_for_approval"}\n'
            "        # Scan _run_statuses for the newest active run matching this session.\n"
            "        # _run_statuses is ordered by insertion (Python 3.7+); iterate and keep\n"
            "        # the last match so we return the most-recently-started active run.\n"
            "        found_run_id = None\n"
            "        found_status = None\n"
            "        for rid, st in self._run_statuses.items():\n"
            '            if st.get("session_id") == session_id and st.get("status") in active_statuses:\n'
            "                found_run_id = rid\n"
            '                found_status = st.get("status")\n'
            '        return web.json_response({"run_id": found_run_id, "status": found_status})\n'
            "\n"
            '    async def _handle_session_messages(self, request: "web.Request") -> "web.Response":\n'
        ),
        "description": "_handle_session_active_run: insert handler before _handle_session_messages",
    },

    # ------------------------------------------------------------------
    # 10. Route registration — add active-run GET route if not present.
    #     Fresh upstream has ONLY the messages route; this patch adds the
    #     active-run route right after it. Already-patched files (both
    #     routes present) hit the idempotency check and no-op.
    # ------------------------------------------------------------------
    {
        "anchor": '            self._app.router.add_get("/api/sessions/{session_id}/messages", self._handle_session_messages)',
        "old": (
            '            self._app.router.add_get("/api/sessions/{session_id}/messages", self._handle_session_messages)\n'
        ),
        "new": (
            '            self._app.router.add_get("/api/sessions/{session_id}/messages", self._handle_session_messages)\n'
            '            self._app.router.add_get("/api/sessions/{session_id}/active-run", self._handle_session_active_run)\n'
        ),
        "description": "route registration: GET /api/sessions/{session_id}/active-run (added after messages route)",
    },
]

PATCHES_OFFSET = [
    # ------------------------------------------------------------------
    # 11. _handle_session_messages — fix offset tail-window semantics +
    #     always return "total" in the response.
    #
    #     The live file has a broken offset implementation that does
    #     messages[offset:] (slices FROM the front, returns 0 for large
    #     offsets) instead of the correct tail-window behaviour where
    #     offset counts from the NEWEST message.
    # ------------------------------------------------------------------
    {
        "anchor": '    async def _handle_session_messages(self, request: "web.Request") -> "web.Response":',
        "old": (
            '    async def _handle_session_messages(self, request: "web.Request") -> "web.Response":\n'
            '        """GET /api/sessions/{session_id}/messages."""\n'
            "        auth_err = self._check_auth(request)\n"
            "        if auth_err:\n"
            "            return auth_err\n"
            '        session_id = request.match_info["session_id"]\n'
            "        _, err = self._get_existing_session_or_404(session_id)\n"
            "        if err:\n"
            "            return err\n"
            "        db = self._ensure_session_db()\n"
            "        resolved_id = db.resolve_resume_session_id(session_id)\n"
            "        messages = db.get_messages(resolved_id)\n"
            "        return web.json_response({\n"
            '            "object": "list",\n'
            '            "session_id": resolved_id,\n'
            '            "data": [self._message_response(m) for m in messages],\n'
            "        })\n"
            "\n"
        ),
        "new": (
            '    async def _handle_session_messages(self, request: "web.Request") -> "web.Response":\n'
            '        """GET /api/sessions/{session_id}/messages.\n'
            "\n"
            "        Supports ``?limit=N`` (clamp 1..500) to return only the N most recent\n"
            "        messages (tail), and ``?offset=K`` (clamp 0..100_000) to skip the K\n"
            "        newest messages before applying the limit — enabling paged loading of\n"
            "        older history from the UI.  (offset+total; messages pagination)\n"
            "\n"
            "        Slice semantics:\n"
            "          - offset == 0: ``messages[-limit:]`` (newest *limit* messages)\n"
            "          - offset > 0:  ``messages[-(offset+limit):-offset]`` (page ending\n"
            "            *offset* messages before the tail); returns ``[]`` when\n"
            "            ``offset >= len(messages)``.\n"
            "\n"
            "        Response always includes ``\"total\": len(all_messages)`` so the UI can\n"
            "        determine whether older pages exist.\n"
            '        """\n'
            "        auth_err = self._check_auth(request)\n"
            "        if auth_err:\n"
            "            return auth_err\n"
            '        session_id = request.match_info["session_id"]\n'
            "        _, err = self._get_existing_session_or_404(session_id)\n"
            "        if err:\n"
            "            return err\n"
            "        db = self._ensure_session_db()\n"
            "        resolved_id = db.resolve_resume_session_id(session_id)\n"
            "        all_messages = db.get_messages(resolved_id)\n"
            "        total = len(all_messages)\n"
            "\n"
            '        raw_limit = request.query.get("limit")\n'
            "        if raw_limit:\n"
            "            try:\n"
            "                limit = max(1, min(int(raw_limit), 500))\n"
            "            except (TypeError, ValueError):\n"
            "                limit = 0\n"
            "        else:\n"
            "            limit = 0\n"
            "\n"
            '        raw_offset = request.query.get("offset")\n'
            "        if raw_offset:\n"
            "            try:\n"
            "                offset = max(0, min(int(raw_offset), 100_000))\n"
            "            except (TypeError, ValueError):\n"
            "                offset = 0\n"
            "        else:\n"
            "            offset = 0\n"
            "\n"
            "        if limit:\n"
            "            if offset >= total:\n"
            "                messages: list = []\n"
            "            elif offset > 0:\n"
            "                messages = all_messages[-(offset + limit):-offset]\n"
            "            else:\n"
            "                messages = all_messages[-limit:]\n"
            "        else:\n"
            "            messages = all_messages\n"
            "\n"
            "        return web.json_response({\n"
            '            "object": "list",\n'
            '            "session_id": resolved_id,\n'
            '            "total": total,\n'
            '            "data": [self._message_response(m) for m in messages],\n'
            "        })\n"
            "\n"
        ),
        "description": "_handle_session_messages: correct offset tail-window + total field",
    },
]


def _count(src: str, needle: str) -> int:
    return src.count(needle)


def apply(path: str) -> None:
    with open(path) as f:
        src = f.read()

    # --- Pass 1: fan-out + active-run ---
    # Idempotency check — if the fan-out mark is already present, all patches
    # have been applied; skip to pass 2.
    if IDEMPOTENCY_MARK not in src:
        errors = []
        for patch in PATCHES:
            anchor = patch["anchor"]
            n = _count(src, anchor)
            if n == 0:
                errors.append(
                    f"ERROR: anchor not found for patch '{patch['description']}':\n"
                    f"  anchor: {anchor!r}\n"
                    f"  File: {path}\n"
                    f"  Hermes api_server.py changed shape — update "
                    f"extensions/hermes-webui/scripts/patch-api-server-runs-fanout.py"
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

        for patch in PATCHES:
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
        print(f"patched: fan-out + active-run endpoint applied to {path}")
    else:
        print("already patched — fan-out + active-run endpoint present")

    # Re-read (may have just been written)
    with open(path) as f:
        src = f.read()

    # --- Pass 2: offset + total ---
    if IDEMPOTENCY_MARK_OFFSET in src:
        print("already patched — offset+total messages pagination present")
        sys.exit(0)

    errors = []
    for patch in PATCHES_OFFSET:
        anchor = patch["anchor"]
        n = _count(src, anchor)
        if n == 0:
            errors.append(
                f"ERROR: anchor not found for patch '{patch['description']}':\n"
                f"  anchor: {anchor!r}\n"
                f"  File: {path}\n"
                f"  Hermes api_server.py changed shape — update "
                f"extensions/hermes-webui/scripts/patch-api-server-runs-fanout.py"
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

    for patch in PATCHES_OFFSET:
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
    print(f"patched: offset+total messages pagination applied to {path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python3 {sys.argv[0]} /path/to/api_server.py", file=sys.stderr)
        sys.exit(1)
    apply(sys.argv[1])

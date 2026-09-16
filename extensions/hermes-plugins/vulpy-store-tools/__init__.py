"""Vulpy Commerce store tools — store_profile + mission_progress.

Structured store-profile and mission-state helpers for the operator journey.
State lives in a JSON file under the workspace (.hermes/store-state.json),
gitignored runtime state (ADR-059 — no hidden DB).

Tools:
- store_profile(get|set): read/write the structured store profile (name,
  store, niche, source, locale, timeline, tech_comfort).
- mission_progress(get|set|next): read/write/advance mission state per store;
  `next` returns the deterministic next actionable mission.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

STATE_FILE = Path(os.environ.get("VULPY_STORE_STATE", "/app/workspace/.hermes/store-state.json"))

MISSIONS = [
    "Mission 0: Hello",
    "Mission 1: Find your voice",
    "Mission 2: Set the mood",
    "Mission 3: Design the storefront",
    "Mission 4: Stock the shelves",
    "Mission 5: Raise the walls",
    "Mission 6: Money matters",
    "Mission 7: Open the doors",
    "Mission 8: After the grand opening",
]

PROFILE_FIELDS = [
    "owner_name",
    "store_name",
    "niche",
    "source",       # new | migration
    "locale",       # country/market → currency+language
    "timeline",     # launch target
    "tech_comfort", # hands-off | show-me | terminal
]


def _load() -> dict:
    try:
        d = json.loads(STATE_FILE.read_text())
        return d if isinstance(d, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def _save(d: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    d["_updated_at"] = time.time()
    STATE_FILE.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")


def _ok(**kw) -> str:
    return json.dumps({"ok": True, **kw}, ensure_ascii=False)


def _err(msg: str) -> str:
    return json.dumps({"ok": False, "error": msg}, ensure_ascii=False)


# ── store_profile ──────────────────────────────────────────────────────────
def _store_profile_get():
    return _ok(profile=_load().get("profile", {}))


def _store_profile_check(field, value):
    if field not in PROFILE_FIELDS:
        return _err(f"unknown profile field: {field} (allowed: {', '.join(PROFILE_FIELDS)})")
    if field == "source" and value not in ("new", "migration"):
        return _err('source must be "new" or "migration"')
    if field == "tech_comfort" and value not in ("hands-off", "show-me", "terminal"):
        return _err('tech_comfort must be "hands-off", "show-me", or "terminal"')
    return None


def _store_profile_set(fields: dict):
    if not isinstance(fields, dict) or not fields:
        return _err("set requires a non-empty `fields` object")
    state = _load()
    profile = state.get("profile", {})
    for k, v in fields.items():
        err = _store_profile_check(k, str(v))
        if err:
            return err
        profile[k] = v
    state["profile"] = profile
    _save(state)
    return _ok(profile=profile)


def _store_profile_clear():
    state = _load()
    state["profile"] = {}
    _save(state)
    return _ok()


def store_profile(args: dict) -> str:
    action = args.get("action", "get")
    if action == "get":
        return _store_profile_get()
    if action == "set":
        return _store_profile_set(args.get("fields", {}))
    if action == "clear":
        return _store_profile_clear()
    return _err("action must be get|set|clear")


# ── mission_progress ───────────────────────────────────────────────────────
def _mission_index(mission: str) -> int | None:
    m = str(mission).strip().lower()
    for i, title in enumerate(MISSIONS):
        if m in title.lower() or title.lower().startswith(m):
            return i
    # "0".."8" numeric shorthand
    if m.isdigit() and 0 <= int(m) <= 8:
        return int(m)
    return None


def _mission_progress_get():
    state = _load()
    return _ok(progress=state.get("missions", []))


def _mission_progress_set(mission: str, status: str):
    idx = _mission_index(mission)
    if idx is None:
        return _err(f"unknown mission: {mission}")
    if status not in ("pending", "in_progress", "done", "archived"):
        return _err("status must be pending|in_progress|done|archived")
    state = _load()
    missions = state.get("missions", [])
    while len(missions) <= idx:
        missions.append("pending")
    missions[idx] = status
    state["missions"] = missions
    _save(state)
    return _ok(mission=MISSIONS[idx], status=status, progress=missions)


def _mission_progress_next():
    state = _load()
    missions = state.get("missions", [])
    for i, status in enumerate(missions):
        if status in ("pending", "in_progress"):
            return _ok(next=MISSIONS[i], index=i, status=status)
    # none in progress — first not-done
    for i, status in enumerate(missions):
        if status != "done":
            return _ok(next=MISSIONS[i], index=i, status=status)
    return _ok(next=None, index=None, status="all_done")


def mission_progress(args: dict) -> str:
    action = args.get("action", "get")
    if action == "get":
        return _mission_progress_get()
    if action == "set":
        return _mission_progress_set(args.get("mission", ""), args.get("status", ""))
    if action == "next":
        return _mission_progress_next()
    return _err("action must be get|set|next")


def register(ctx):
    ctx.register_tool(
        name="store_profile",
        toolset="terminal",
        schema={
            "name": "store_profile",
            "description": "Read or write the structured Vulpy store profile (name, store, niche, source new|migration, locale, timeline, tech_comfort). State persists in .hermes/store-state.json. Use in/store missions as the canonical store context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["get", "set", "clear"], "description": "'get' reads the profile, 'set' writes fields, 'clear' empties it."},
                    "fields": {"type": "object", "description": "For 'set': the profile fields to write ({owner_name, store_name, niche, source, locale, timeline, tech_comfort})."},
                },
                "required": ["action"],
            },
        },
        handler=lambda a, **kw: store_profile(a),
        check_fn=lambda: True,
    )
    ctx.register_tool(
        name="mission_progress",
        toolset="terminal",
        schema={
            "name": "mission_progress",
            "description": "Read/advance mission state for the Vulpy store-building journey (Mission 0: Hello … Mission 8). 'next' returns the deterministic next actionable mission. Persists in .hermes/store-state.json.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["get", "set", "next"], "description": "'get' shows all mission states, 'set' marks one mission's status, 'next' returns the next actionable mission."},
                    "mission": {"type": "string", "description": "For 'set': mission number or title (e.g. '5' or 'Mission 5: Raise the walls')."},
                    "status": {"type": "string", "enum": ["pending", "in_progress", "done", "archived"], "description": "For 'set': the status to assign."},
                },
                "required": ["action"],
            },
        },
        handler=lambda a, **kw: mission_progress(a),
        check_fn=lambda: True,
    )
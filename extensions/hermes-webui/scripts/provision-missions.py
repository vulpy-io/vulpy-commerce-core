#!/usr/bin/env python3
"""Vulpy store-missions provisioning — write the 9 pinned mission chats.

Creates the 9 pinned, titled, persisted mission sessions directly as JSON in
the WebUI session store (SESSION_DIR), each carrying a static fox greeting
(image + plain markdown). This is the durable, renderer-independent mechanism:
no baked-server endpoint, no image rebuild — the sessions are plain files the
WebUI reads (pinned sorted first) and they render identically under both the
native surface and the message-renderer extension.

The native renderer may also consume the explicit
MEDIA:/extensions/images/fox_avatar_cropped.jpg token; provisioning keeps that
token available alongside the markdown image form.

Idempotent: a mission-titled session already present is skipped; re-running
creates no duplicates and no ghost "Untitled" sessions.

Run (host or inside the Hermes container as the fox user):
    python3 extensions/hermes-webui/scripts/provision-missions.py \
        [--session-dir SESSION_DIR] [--dry-run] [--force]

SESSION_DIR resolution (in order):
    --session-dir, else $HERMES_SESSION_DIR, else the container-default, else
    the host `.data/hermes/webui/config/sessions` equivalent.
"""
import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path

FOX_IMG = "/extensions/images/fox_avatar_cropped.jpg"
NATIVE_MEDIA_PREFIX = f"MEDIA:{FOX_IMG}"
LEGACY_MD_PREFIX = "![" + "Fox in the Box](" + FOX_IMG + ")"
LEGACY_EMOJI_PREFIX = "🦊\n\n"

# Deterministic skill per mission (0-based index matches title "Mission N").
MISSION_SKILLS = [
    "vulpy-mission-0-hello",
    "vulpy-mission-1-voice",
    "vulpy-mission-2-mood",
    "vulpy-mission-3-design",
    "vulpy-mission-4-catalog",
    "vulpy-mission-5-build",
    "vulpy-mission-6-money",
    "vulpy-mission-7-launch",
    "vulpy-mission-8-postlaunch",
]

# Greeting copy (final — approved 2026-08-25; copywriting factory; tightened
# 2026-08-31 — removed process detail that the mission skills already cover
# conversationally; greetings now state the mission's purpose + entry cue).
MISSIONS = [
    (
        "Mission 0: Hello",
        [
            f"MEDIA:{FOX_IMG}",
            "",
            "Hi! I'm Vulpy, aka Fox in the Box — your store manager. This first one "
            "is simple: we get to know each other. Your name, your store, what you "
            "sell, whether this is a fresh start or a move, where your customers "
            "are, and when you want to launch. I'll ask how hands-on you like to "
            "be, and I'll match your pace.\n\n"
            "Whenever you're ready, just drop me a line below. Your name is a fine "
            "place to start.",
        ],
    ),
    (
        "Mission 1: Find your voice",
        [
            f"MEDIA:{FOX_IMG}",
            "",
            "This mission is about how your store sounds. The brands you admire, "
            "the tone you want, who your customer is, and the words we'll love and "
            "the words we'll ban. No design yet — that comes next.\n\n"
            "Whenever you're ready, just drop me a line below. A few stores or brands "
            "you admire — links or names, even outside your niche — is a fine place "
            "to start.",
        ],
    ),
    (
        "Mission 2: Set the mood",
        [
            f"MEDIA:{FOX_IMG}",
            "",
            "Now that we know how your store sounds, this mission is about how it "
            "looks: colors, typography, and the kind of imagery that feels right. "
            "If you already have designs or a Figma file, we can pull the look "
            "straight from those instead.\n\n"
            "Whenever you're ready, just drop me a line below. Whether you already "
            "have brand colors, a logo, or any design files is a fine place to start.",
        ],
    ),
    (
        "Mission 3: Design the storefront",
        [
            f"MEDIA:{FOX_IMG}",
            "",
            "In this mission, you'll see your store before it exists. First we'll "
            "try two visual directions on one anchor block — usually the hero — so "
            "the difference is easy to feel. Then I'll use the direction you choose "
            "to make one complete homepage, with the real assets where we have them.\n\n"
            "Whenever you're ready, just drop me a line below. A \"go\" plus anything "
            "from the moodboard that must sit above the fold is a fine place to "
            "start.",
        ],
    ),
    (
        "Mission 4: Stock the shelves",
        [
            f"MEDIA:{FOX_IMG}",
            "",
            "Time to fill the store with your real products: items, prices, "
            "categories, and photos. If you're moving from another platform, we'll "
            "import what you already have and verify it came across clean.\n\n"
            "Whenever you're ready, just drop me a line below. Whatever product info "
            "you have on hand is a fine place to start.",
        ],
    ),
    (
        "Mission 5: Raise the walls",
        [
            f"MEDIA:{FOX_IMG}",
            "",
            "This is where we build what we designed, section by section: "
            "foundations first, then the header and footer, then the hero, then "
            "the rest of the page. After each section, you'll see it in your "
            "store, and we save a checkpoint so you can always go back if we hit "
            "a snag.\n\n"
            "Whenever you're ready, just drop me a line below. A \"go\" is all I need "
            "to lay the foundations.",
        ],
    ),
    (
        "Mission 6: Money matters",
        [
            f"MEDIA:{FOX_IMG}",
            "",
            "In this mission, we make sure your store can take money: payments "
            "through Stripe, a checkout that works, and a test order that runs end "
            "to end. We stay in test mode until everything checks out, and nothing "
            "goes near production keys without a security pass first.\n\n"
            "Whenever you're ready, just drop me a line below. A \"go\" is all I need "
            "— you don't need any Stripe keys yet.",
        ],
    ),
    (
        "Mission 7: Open the doors",
        [
            f"MEDIA:{FOX_IMG}",
            "",
            "This is the one where your store goes live: your own domain, HTTPS, "
            "your policies in place, and a final checklist before anyone else sees "
            "it. I'll prepare everything and hand you the last step, so the moment "
            "the doors open is yours.\n\n"
            "Whenever you're ready, just drop me a line below. The domain you want "
            "to launch on — or a mention that you need one — is a fine place to start.",
        ],
    ),
    (
        "Mission 8: After the grand opening",
        [
            f"MEDIA:{FOX_IMG}",
            "",
            "Your store is open, and this mission is a quiet one: a tour of what "
            "we can do from here. Design changes, marketing, analytics and "
            "reports, integrations, blog and content. None of it needs a mission "
            "anymore; from now on, you just ask me in any chat.\n\n"
            "Whenever you're ready, just drop me a line below. The part of running "
            "a store you're least sure about is a fine place to start.",
        ],
    ),
]

OLD_MISSION_TITLES = [
    "0 · Hello",
    "1 · Find your voice",
    "2 · Set the mood",
    "3 · Design the storefront",
    "4 · Stock the shelves",
    "5 · Raise the walls",
    "6 · Money matters",
    "7 · Open the doors",
    "8 · After the grand opening",
]


def _default_session_dir():
    """Return the WebUI SESSION_DIR for this install."""
    env = os.environ.get("HERMES_SESSION_DIR")
    if env:
        return Path(env)
    # Inside the Hermes container the sessions live under /data.
    p = Path("/data/state/webui/sessions")
    if p.is_dir():
        return p
    # Host-side equivalent.
    p2 = Path("/app/.data/hermes/webui/sessions")
    return p2


def _session_path(session_dir, sid):
    return Path(session_dir) / f"{sid}.json"


def _title_exists(session_dir, title):
    for p in Path(session_dir).glob("*.json"):
        if p.name.startswith("_"):
            continue
        try:
            d = json.loads(p.read_text())
        except Exception:
            continue
        if str(d.get("title", "")).strip().lower() == title.strip().lower():
            return True
    return False


def _mission_index(session):
    if not isinstance(session, dict):
        return None
    title = str(session.get("title", "")).strip().lower()
    current_titles = {
        mission_title.strip().lower(): index
        for index, (mission_title, _) in enumerate(MISSIONS)
    }
    old_titles = {
        mission_title.strip().lower(): index
        for index, mission_title in enumerate(OLD_MISSION_TITLES)
    }
    if title in current_titles:
        return current_titles[title]
    if title in old_titles:
        return old_titles[title]
    personality = session.get("personality")
    if personality in MISSION_SKILLS:
        return MISSION_SKILLS.index(personality)
    return None


def _existing_mission_paths(session_dir):
    """Map mission index -> sorted list of session files that claim that index.

    A mission may legitimately have multiple sessions (legacy duplicates from
    earlier provisioning), so every candidate is kept. Order is deterministic
    (sorted by path) so repeated runs behave identically.
    """
    paths = {}
    for path in sorted(Path(session_dir).glob("*.json")):
        if path.name.startswith("_"):
            continue
        try:
            session = json.loads(path.read_text())
        except Exception:
            continue
        index = _mission_index(session)
        if index is not None:
            paths.setdefault(index, []).append(path)
    return paths


def _repair_session(path, dry_run=False):
    """Rewrite a mission session's first assistant message to the native MEDIA prefix.

    Verdicts (never raises on malformed input):
      - "changed":   the first assistant greeting was legacy and was rewritten
      - "clean":     already native, no write performed
      - "unsafe":    recognized mission but shape/greeting cannot be safely repaired
      - "unrelated": not a recognized mission (or unreadable JSON) — never touched
    Recognized missions with a malformed shape fail closed ("unsafe", no write).
    """
    try:
        session = json.loads(Path(path).read_text())
    except Exception:
        return "unrelated"
    if _mission_index(session) is None:
        return "unrelated"
    messages = session.get("messages")
    if not isinstance(messages, list):
        return "unsafe"
    first_assistant = next(
        (
            (index, message)
            for index, message in enumerate(messages)
            if isinstance(message, dict) and message.get("role") == "assistant"
        ),
        None,
    )
    if not first_assistant or not isinstance(first_assistant[1].get("content"), str):
        return "unsafe"
    content = first_assistant[1]["content"]
    if content.startswith(NATIVE_MEDIA_PREFIX):
        return "clean"
    if content.startswith(LEGACY_MD_PREFIX):
        replacement = NATIVE_MEDIA_PREFIX + content[len(LEGACY_MD_PREFIX):]
    elif content.startswith(LEGACY_EMOJI_PREFIX):
        replacement = NATIVE_MEDIA_PREFIX + content[len(LEGACY_EMOJI_PREFIX):]
    else:
        return "unsafe"
    if not dry_run:
        replacement_session = dict(session)
        replacement_messages = list(messages)
        replacement_index = first_assistant[0]
        replacement_messages[replacement_index] = dict(replacement_messages[replacement_index])
        replacement_messages[replacement_index]["content"] = replacement
        replacement_session["messages"] = replacement_messages
        _atomic_write_json(Path(path), replacement_session)
    return "changed"


def _atomic_write_json(path, session):
    """Write session JSON via a same-directory temp file + atomic replace.

    A half-written session file would look like a corrupt/untitled session to
    the WebUI; writing to a temp file in the same directory and os.replace-ing
    it into place keeps the visible file either fully old or fully new.
    """
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(session, indent=2) + "\n")
    os.replace(tmp, path)


def _write_mission(session_dir, title, greeting_lines, index):
    sid = uuid.uuid4().hex[:12]
    now = time.time()
    # Sort key: pinned sessions render newest-first, so Mission 0 (index 0)
    # gets the newest timestamp; Mission 8 the oldest. now + (8 - index)
    # keeps all in the future by a few seconds — harmless and stable.
    ts = now + (8 - index)
    # greeting_lines ALREADY lead with the fox MEDIA token (first element).
    # Do NOT prepend a second token — it duplicated the image artifact in the
    # rendered greeting (two stacked fox images, one broken).
    message = "\n".join(greeting_lines)
    # Deterministic agent directive: the operator's first reply to this chat
    # triggers the agent, and the greeting (visible in context) carries a
    # hidden machine-readable marker telling the agent EXACTLY which skill to
    # load and follow. Kept as an HTML comment so it's invisible to the
    # operator but always present in the transcript the agent reads — no
    # title-matching, no metadata that could be dropped. personality also
    # carries the skill name as a redundant per-session signal.
    mission_index = index - 1  # 0-based
    skill_name = MISSION_SKILLS[mission_index]
    skill_path = f".hermes/skills/vulpy-store-missions/{skill_name}/SKILL.md"
    directive = (
        "\n\n"
        f"<!-- MISSION:{mission_index} SKILL:{skill_name} PATH:{skill_path} "
        "Agent: load this skill and follow it as your operating procedure for "
        "this conversation. -->"
    )
    message += directive
    session = {
        "session_id": sid,
        "title": title,
        "pinned": True,
        "archived": False,
        "created_at": ts,
        "updated_at": ts,
        "last_message_at": ts,
        # Deterministic per-session agent signal: personality = the skill.
        "personality": skill_name,
        "message_count": 1,
        "workspace": "/app/workspace",
        "messages": [
            {
                "role": "assistant",
                "content": message,
                "timestamp": now,
            }
        ],
    }
    out = _session_path(session_dir, sid)
    out.write_text(json.dumps(session, indent=2) + "\n")
    return sid


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session-dir", default=None)
    ap.add_argument("--dry-run", action="store_true", help="print plan only")
    ap.add_argument("--force", action="store_true",
                    help="rejected: would duplicate known missions (fails closed)")
    args = ap.parse_args()

    session_dir = Path(args.session_dir or _default_session_dir())
    if not session_dir.is_dir():
        print(f"ERROR: session dir not found: {session_dir}", file=sys.stderr)
        return 2

    existing = _existing_mission_paths(session_dir)

    # Safety invariant: provisioning must NEVER create a second session for a
    # mission that already exists (legacy duplicates from earlier runs break
    # pinned-mission ordering and split the operator's mission history). --force
    # historically re-wrote everything as brand-new sessions, which duplicates
    # known missions; on a store that already has any known mission it now fails
    # closed instead of duplicating. On an empty store it still provisions the
    # nine missions (nothing exists to duplicate).
    if args.force and existing:
        print(
            "ERROR: --force is not supported when a mission already exists: it "
            "would re-provision known missions as duplicate sessions and can "
            "never create a second mission session. Remove --force to resume "
            "idempotent repair.",
            file=sys.stderr,
        )
        return 2

    created = []
    skipped = []
    verdicts = {"changed": 0, "clean": 0, "unsafe": 0, "unrelated": 0}
    for i, (title, lines) in enumerate(MISSIONS, start=1):
        mission_index = i - 1
        if mission_index in existing:
            skipped.append(title)
            for path in existing[mission_index]:
                verdict = _repair_session(path, dry_run=args.dry_run)
                verdicts[verdict] += 1
            continue
        if args.dry_run:
            created.append(f"[dry] {title}")
            continue
        sid = _write_mission(session_dir, title, lines, i)
        created.append(f"{title} ({sid})")
        print(f"  created {title}: {sid}")

    print(f"\n{'DRY' if args.dry_run else 'Provisioned'} {len(created)} missions "
          f"({len(skipped)} skipped already-present).")
    print(
        f"Repaired {verdicts['changed']} changed "
        f"({verdicts['clean']} clean, {verdicts['unsafe']} unsafe, "
        f"{verdicts['unrelated']} unrelated)."
    )
    print("Session dir:", session_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
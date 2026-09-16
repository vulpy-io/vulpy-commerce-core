"""
Vulpy Commerce — mission provisioning.

Creates the store-builder mission chats as pinned sessions, each pre-seeded
with a static, renderer-independent greeting (fox image + plain markdown text).

Design constraints (from design session 2026-08-24):
- NO custom UI for missions: they are native pinned chats.
- Greetings must render identically under BOTH the native message surface and
  the public message-renderer extension -> image + plain markdown only.
- Greetings are static content written at provisioning time (zero LLM tokens).
- Idempotent: safe to run on every boot; never duplicates missions.
- No hidden state database: existence of the pinned sessions IS the state.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

logger = logging.getLogger(__name__)

# Model fallback order for providers that are configured (checked live).
_MODEL_CHOICE_HINTS = (
    "vulpy-default",
    "gpt-5.6-luna",
    "gpt-5.2",
    "claude-sonnet-4",
    "deepseek-v4-flash",
)

# Pinned-session sidebar cap. WebUI default is 3; Vulpy stores with onboarding
# need all missions visible at once, so we raise the ceiling.
PINNED_SESSIONS_LIMIT = 9


class MissionDefinition:
    """Static definition of one store-builder mission chat."""

    def __init__(self, key: str, order: int, title: str, greeting_md: str) -> None:
        self.key = key
        self.order = order
        self.title = title
        self.greeting_md = greeting_md


FOX_GREETING_MEDIA = "MEDIA:/extensions/images/fox_avatar_cropped.jpg"


def _fox_media_token() -> str:
    """Return the native WebUI media token for the fox greeting."""
    return FOX_GREETING_MEDIA


MISSIONS: list[MissionDefinition] = [
    MissionDefinition(
        key="mission-0-hello",
        order=0,
        title="0 · Hello",
        greeting_md=(
            f"{_fox_media_token()}\n\n"
            "**Hi! I'm Vulpy — aka Fox in the Box — your store manager.**\n\n"
            "This first one is simple: we get to know each other. Your name, your "
            "store, what you sell, whether this is a fresh start or a migration, "
            "where your customers are, and your target launch date. Also tell me how "
            "hands-on you like to be — and I'll match your pace.\n\n"
            "*(No rush. Whenever you're ready, just drop me a line below.)*"
        ),
    ),
    MissionDefinition(
        key="mission-1-voice",
        order=1,
        title="1 · Find your voice",
        greeting_md=(
            f"{_fox_media_token()}\n\n"
            "**Mission 1 — Find your voice.**\n\n"
            "Before we draw anything, let's agree how your store *sounds*. Share a "
            "few brands or stores you admire, pick a tone lane, and tell me about "
            "your customer. We'll write down the words we love and the words we "
            "ban.\n\n"
            "*(No design yet — that comes next. Drop me a note when you're ready.)*"
        ),
    ),
    MissionDefinition(
        key="mission-2-mood",
        order=2,
        title="2 · Set the mood",
        greeting_md=(
            f"{_fox_media_token()}\n\n"
            "**Mission 2 — Set the mood.**\n\n"
            "Now the look: colors, typography, and the kind of imagery that feels "
            "right. If you already have designs (Figma, images, a current site), "
            "we'll pull those in and adapt them. If not, I'll bring you 2–3 "
            "moodboards to pick from.\n\n"
            "*(If you have brand colors or a logo, mention them. Ready when you are.)*"
        ),
    ),
    MissionDefinition(
        key="mission-3-design",
        order=3,
        title="3 · Design the storefront",
        greeting_md=(
            f"{_fox_media_token()}\n\n"
            "**Mission 3 — Design the storefront.**\n\n"
            "Time to *see* your store before it exists. We'll compare two visual "
            "directions on one anchor block — usually the hero — then I'll compose "
            "one complete homepage in the direction you choose. You review the page "
            "as a whole, not a pile of disconnected blocks.\n\n"
            "*(A \"go\" plus anything that must sit above the fold is a fine place "
            "to start.)*"
        ),
    ),
    MissionDefinition(
        key="mission-4-catalog",
        order=4,
        title="4 · Stock the shelves",
        greeting_md=(
            f"{_fox_media_token()}\n\n"
            "**Mission 4 — Stock the shelves.**\n\n"
            "Now we fill the store with your real products — names, prices, "
            "categories, photos. New store? Hand over a list, spreadsheet, or "
            "photos. Migrating? We'll import from your current platform and verify "
            "what came across.\n\n"
            "*(Whatever product info you have on hand is a fine place to start.)*"
        ),
    ),
    MissionDefinition(
        key="mission-5-build",
        order=5,
        title="5 · Raise the walls",
        greeting_md=(
            f"{_fox_media_token()}\n\n"
            "**Mission 5 — Raise the walls.**\n\n"
            "Implementation time. My coder builds the approved design section by "
            "section — tokens first, then header + footer, then hero, then the "
            "rest — with an inspector checking each step before you see it. "
            "Each completed piece is a checkpoint: saved, safe, revertible.\n\n"
            "*(A \"go\" is all I need to lay the foundations.)*"
        ),
    ),
    MissionDefinition(
        key="mission-6-money",
        order=6,
        title="6 · Money matters",
        greeting_md=(
            f"{_fox_media_token()}\n\n"
            "**Mission 6 — Money matters.**\n\n"
            "Let's get you paid. We set up payments (Stripe by default), wire "
            "checkout, and run a real test order end-to-end. Security reviews "
            "everything before we touch production keys.\n\n"
            "*(A \"go\" is all I need — you don't need any Stripe keys yet.)*"
        ),
    ),
    MissionDefinition(
        key="mission-7-launch",
        order=7,
        title="7 · Open the doors",
        greeting_md=(
            f"{_fox_media_token()}\n\n"
            "**Mission 7 — Open the doors.**\n\n"
            "The big day. We attach your domain, set up HTTPS and policies, run the "
            "go-live checklist, and launch. I'll prepare everything and hand you the "
            "single final step — you get to open the doors yourself.\n\n"
            "*(The domain you want to launch on — or a mention that you need one — "
            "is a fine place to start.)*"
        ),
    ),
    MissionDefinition(
        key="mission-8-postlaunch",
        order=8,
        title="8 · After the grand opening",
        greeting_md=(
            f"{_fox_media_token()}\n\n"
            "**Mission 8 — After the grand opening.**\n\n"
            "Your store is live — congratulations! 🎉 This mission is a tour of "
            "everything Vulpy can do from here: design changes, marketing, "
            "analytics, integrations, and more. The great part: all of it continues "
            "in normal chats, no missions needed. Just ask.\n\n"
            "*(The part of running a store you're least sure about is a fine place "
            "to start.)*"
        ),
    ),
]


def _mission_key_to_title(m: MissionDefinition) -> str:
    return m.title


def create_mission_sessions(*, session_factory, session_dir=None, max_pinned: int = PINNED_SESSIONS_LIMIT) -> dict[str, Any]:
    """Create all mission sessions idempotently and return a summary.

    ``session_factory`` is injected so this module stays testable —
    production passes ``new_session`` (api.models / routes).

    Returns a dict with counts of created/existing/failed missions.
    """
    created: list[str] = []
    already: list[str] = []
    failed: list[tuple[str, str]] = []

    for m in MISSIONS:
        try:
            # Session identity is the mission key -> idempotent lookup by title.
            existing = _find_session_by_title(session_dir, m.title)
            if existing:
                already.append(m.title)
                continue
            session = session_factory(
                title=m.title,
                model=None,
                model_provider=None,
                pinned=True,
                archived=False,
                mission_order=m.order,
            )
            # Seed the static greeting as the first assistant message.
            greeting = [
                {
                    "role": "assistant",
                    "content": m.greeting_md,
                    "timestamp": time.time(),
                }
            ]
            # Only set messages if the factory supports seeding them; otherwise
            # the greeting is delivered on first open by the mission skill.
            if hasattr(session, "messages"):
                session.messages = greeting
            if hasattr(session, "save"):
                session.save()
            created.append(m.title)
        except Exception as exc:  # noqa: BLE001 — provisioning must not crash boot
            logger.exception("failed to provision mission %s", m.key)
            failed.append((m.title, str(exc)))

    return {
        "created": created,
        "already": already,
        "failed": failed,
        "total": len(MISSIONS),
    }


def _find_session_by_title(session_dir, title: str):
    """Return the first session whose metadata title matches (case-insensitive)."""
    try:
        from api.webui_session_db import list_sessions
        for row in list_sessions():
            if str(row.get("title") or "").strip().lower() == title.strip().lower():
                return row
    except Exception:  # noqa: BLE001
        return None
    return None
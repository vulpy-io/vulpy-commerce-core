"""Regression tests for fresh onboarding mission greeting payloads."""

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MEDIA_TOKEN = "MEDIA:/extensions/images/fox_avatar_cropped.jpg"
GENERIC_INTRO = "Hi! I'm Vulpy"
EXPECTED_SCRIPT_TITLES = [
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
EXPECTED_API_MISSIONS = [
    ("mission-0-hello", "0 · Hello"),
    ("mission-1-voice", "1 · Find your voice"),
    ("mission-2-mood", "2 · Set the mood"),
    ("mission-3-design", "3 · Design the storefront"),
    ("mission-4-catalog", "4 · Stock the shelves"),
    ("mission-5-build", "5 · Raise the walls"),
    ("mission-6-money", "6 · Money matters"),
    ("mission-7-launch", "7 · Open the doors"),
    ("mission-8-postlaunch", "8 · After the grand opening"),
]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MissionMediaContractTests(unittest.TestCase):
    def test_script_missions_use_native_media_and_preserve_titles(self):
        module = load_module(
            "provision_missions",
            ROOT / "extensions/hermes-webui/scripts/provision-missions.py",
        )

        self.assertEqual([title for title, _ in module.MISSIONS], EXPECTED_SCRIPT_TITLES)
        payloads = ["\n".join(lines) for _, lines in module.MISSIONS]

        self.assertTrue(all(payload.startswith(MEDIA_TOKEN) for payload in payloads))
        self.assertTrue(all("![Fox" not in payload for payload in payloads))
        self.assertTrue(all("🦊" not in payload for payload in payloads))
        self.assertIn(GENERIC_INTRO, payloads[0])
        self.assertTrue(all(GENERIC_INTRO not in payload for payload in payloads[1:]))

    def test_api_missions_use_native_media_and_preserve_ids_and_titles(self):
        module = load_module(
            "vulpy_missions",
            ROOT / "extensions/hermes-webui/api/vulpy_missions.py",
        )

        self.assertEqual(
            [(mission.key, mission.title) for mission in module.MISSIONS],
            EXPECTED_API_MISSIONS,
        )
        payloads = [mission.greeting_md for mission in module.MISSIONS]

        self.assertTrue(all(payload.startswith(MEDIA_TOKEN) for payload in payloads))
        self.assertTrue(all("![Fox" not in payload for payload in payloads))
        self.assertTrue(all("🦊" not in payload for payload in payloads))
        self.assertIn(GENERIC_INTRO, payloads[0])
        self.assertTrue(all(GENERIC_INTRO not in payload for payload in payloads[1:]))


if __name__ == "__main__":
    unittest.main()

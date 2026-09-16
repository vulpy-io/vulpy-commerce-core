import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[3]
PROVISIONER_PATH = ROOT / "extensions/hermes-webui/scripts/provision-missions.py"
NATIVE = "MEDIA:/extensions/images/fox_avatar_cropped.jpg"
LEGACY_MD = "![Fox in the Box](/extensions/images/fox_avatar_cropped.jpg)"
LEGACY_EMOJI = "🦊\n\n"


def load_provisioner():
    spec = importlib.util.spec_from_file_location("provision_missions", PROVISIONER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_session(directory, session):
    path = pathlib.Path(directory) / f"{session['session_id']}.json"
    path.write_text(json.dumps(session, indent=2) + "\n")
    return path


def session(session_id, title, content, personality=None):
    data = {
        "session_id": session_id,
        "title": title,
        "pinned": True,
        "archived": False,
        "created_at": 1.0,
        "updated_at": 2.0,
        "last_message_at": 3.0,
        "message_count": 3,
        "workspace": "/synthetic/workspace",
        "messages": [
            {"role": "assistant", "content": content, "timestamp": 1.0},
            {"role": "user", "content": "later user", "timestamp": 2.0},
            {"role": "assistant", "content": "later assistant", "timestamp": 3.0},
        ],
    }
    if personality is not None:
        data["personality"] = personality
    return data


class LegacyGreetingRepairTests(unittest.TestCase):
    def test_legacy_markdown_greeting_is_repaired_and_suffix_is_preserved(self):
        module = load_provisioner()
        suffix = "\n\nNeutral greeting.\n\n<!-- MISSION:0 SKILL:vulpy-mission-0-hello PATH:... -->"
        original = session("legacy0", "Mission 0: Hello", LEGACY_MD + suffix, "vulpy-mission-0-hello")
        with tempfile.TemporaryDirectory() as directory:
            path = write_session(directory, original)
            before = json.loads(path.read_text())
            verdict = module._repair_session(path)
            repaired = json.loads(path.read_text())
        self.assertEqual(verdict, "changed")
        self.assertEqual(repaired["messages"][0]["content"], NATIVE + suffix)
        self.assertEqual(repaired["messages"][0]["content"][len(NATIVE):], suffix)
        self.assertEqual(repaired["messages"][1:], before["messages"][1:])
        for key in ("session_id", "pinned", "archived", "created_at", "updated_at", "last_message_at", "personality", "message_count"):
            self.assertEqual(repaired[key], before[key])

    def test_clean_greeting_is_a_no_op(self):
        module = load_provisioner()
        original = session("clean0", "Mission 0: Hello", NATIVE + "\n\nNeutral")
        with tempfile.TemporaryDirectory() as directory:
            path = write_session(directory, original)
            before = path.read_bytes()
            self.assertEqual(module._repair_session(path), "clean")
            self.assertEqual(path.read_bytes(), before)

    def test_unrelated_session_is_untouched(self):
        module = load_provisioner()
        original = session("random", "Random chat", LEGACY_MD + "\n\nNeutral")
        with tempfile.TemporaryDirectory() as directory:
            path = write_session(directory, original)
            before = path.read_bytes()
            self.assertEqual(module._repair_session(path), "unrelated")
            self.assertEqual(path.read_bytes(), before)

    def test_malformed_known_mission_fails_closed(self):
        module = load_provisioner()
        original = session("bad0", "Mission 0: Hello", "Hello there")
        with tempfile.TemporaryDirectory() as directory:
            path = write_session(directory, original)
            before = path.read_bytes()
            self.assertEqual(module._repair_session(path), "unsafe")
            self.assertEqual(path.read_bytes(), before)

    def test_emoji_placeholder_is_repaired_for_old_api_title(self):
        module = load_provisioner()
        original = session("old0", "0 · Hello", LEGACY_EMOJI + "**Neutral greeting.**")
        with tempfile.TemporaryDirectory() as directory:
            path = write_session(directory, original)
            module._repair_session(path)
            repaired = json.loads(path.read_text())
        self.assertEqual(repaired["messages"][0]["content"], NATIVE + "**Neutral greeting.**")

    def test_second_repair_is_clean_and_byte_identical(self):
        module = load_provisioner()
        original = session("legacy0", "Mission 0: Hello", LEGACY_MD + "\n\nNeutral")
        with tempfile.TemporaryDirectory() as directory:
            path = write_session(directory, original)
            self.assertEqual(module._repair_session(path), "changed")
            first_result = path.read_bytes()
            self.assertEqual(module._repair_session(path), "clean")
            self.assertEqual(path.read_bytes(), first_result)

    def test_greeting_is_replaced_at_located_index_not_position_zero(self):
        module = load_provisioner()
        suffix = "\n\nNeutral greeting.\n\n<!-- MISSION:0 SKILL:vulpy-mission-0-hello PATH:... -->"
        original = session("lead0", "Mission 0: Hello", LEGACY_MD + suffix, "vulpy-mission-0-hello")
        original["messages"].insert(0, {"role": "system", "content": "system preamble", "timestamp": 0.5})
        with tempfile.TemporaryDirectory() as directory:
            path = write_session(directory, original)
            before = json.loads(path.read_text())
            self.assertEqual(module._repair_session(path), "changed")
            repaired = json.loads(path.read_text())
        self.assertEqual(repaired["messages"][0], before["messages"][0])
        self.assertEqual(repaired["messages"][1]["content"], NATIVE + suffix)
        self.assertEqual(repaired["messages"][2:], before["messages"][2:])
        for key in ("session_id", "pinned", "archived", "created_at", "updated_at", "last_message_at", "personality", "message_count"):
            self.assertEqual(repaired[key], before[key])

    def test_personality_marker_identifies_mission(self):
        module = load_provisioner()
        original = session("marker3", "Random-looking title", LEGACY_MD + "\n\nNeutral", "vulpy-mission-3-design")
        with tempfile.TemporaryDirectory() as directory:
            path = write_session(directory, original)
            self.assertEqual(module._repair_session(path), "changed")
            self.assertTrue(json.loads(path.read_text())["messages"][0]["content"].startswith(NATIVE))

    def test_main_repairs_existing_missions_and_is_idempotent(self):
        module = load_provisioner()
        with tempfile.TemporaryDirectory() as directory:
            first = write_session(directory, session("keep0", "Mission 0: Hello", LEGACY_MD + "\n\nNeutral"))
            fourth = write_session(directory, session("keep4", "Mission 4: Stock the shelves", LEGACY_MD + "\n\nNeutral"))
            unrelated = write_session(directory, session("random", "Random chat", LEGACY_MD + "\n\nNeutral"))
            unrelated_before = unrelated.read_bytes()
            output = io.StringIO()
            with mock.patch("sys.argv", ["provision-missions.py", "--session-dir", directory]), contextlib.redirect_stdout(output):
                self.assertEqual(module.main(), 0)
            self.assertIn("Repaired 2 changed", output.getvalue())
            self.assertTrue(json.loads(first.read_text())["messages"][0]["content"].startswith(NATIVE))
            self.assertTrue(json.loads(fourth.read_text())["messages"][0]["content"].startswith(NATIVE))
            self.assertEqual(json.loads(first.read_text())["session_id"], "keep0")
            self.assertEqual(json.loads(fourth.read_text())["session_id"], "keep4")
            self.assertEqual(unrelated.read_bytes(), unrelated_before)
            paths_after_first = sorted(pathlib.Path(directory).glob("*.json"))
            bytes_after_first = {path: path.read_bytes() for path in paths_after_first}
            output = io.StringIO()
            with mock.patch("sys.argv", ["provision-missions.py", "--session-dir", directory]), contextlib.redirect_stdout(output):
                self.assertEqual(module.main(), 0)
            self.assertIn("Repaired 0 changed", output.getvalue())
            self.assertEqual(sorted(pathlib.Path(directory).glob("*.json")), paths_after_first)
            self.assertEqual({path: path.read_bytes() for path in paths_after_first}, bytes_after_first)
            self.assertEqual(len(paths_after_first), 10)

    def test_force_with_existing_mission_fails_closed(self):
        module = load_provisioner()
        with tempfile.TemporaryDirectory() as directory:
            path = write_session(directory, session("keep0", "Mission 0: Hello", LEGACY_MD + "\n\nNeutral"))
            before = path.read_bytes()
            output, err = io.StringIO(), io.StringIO()
            with mock.patch("sys.argv", ["provision-missions.py", "--session-dir", directory, "--force"]), \
                    contextlib.redirect_stdout(output), contextlib.redirect_stderr(err):
                rc = module.main()
            self.assertNotEqual(rc, 0)
            self.assertEqual(sorted(pathlib.Path(directory).glob("*.json")), [path])
            self.assertEqual(path.read_bytes(), before)
            self.assertIn("--force", err.getvalue())
            self.assertIn("never create", err.getvalue())

    def test_force_with_existing_mission_fails_closed_even_in_dry_run(self):
        module = load_provisioner()
        with tempfile.TemporaryDirectory() as directory:
            path = write_session(directory, session("keep0", "Mission 0: Hello", LEGACY_MD + "\n\nNeutral"))
            output, err = io.StringIO(), io.StringIO()
            with mock.patch("sys.argv", ["provision-missions.py", "--session-dir", directory, "--force", "--dry-run"]), \
                    contextlib.redirect_stdout(output), contextlib.redirect_stderr(err):
                rc = module.main()
            self.assertNotEqual(rc, 0)
            self.assertEqual(sorted(pathlib.Path(directory).glob("*.json")), [path])
            self.assertIn("--force", err.getvalue())

    def test_force_on_empty_store_still_provisions_all_missions(self):
        module = load_provisioner()
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with mock.patch("sys.argv", ["provision-missions.py", "--session-dir", directory, "--force"]), \
                    contextlib.redirect_stdout(output):
                self.assertEqual(module.main(), 0)
            self.assertEqual(output.getvalue().count("created "), 9)
            self.assertEqual(len(list(pathlib.Path(directory).glob("*.json"))), 9)

    def test_malformed_messages_shapes_fail_closed(self):
        module = load_provisioner()
        malformed = [
            {"messages": {"role": "assistant", "content": "x"}},
            {"messages": ["not-a-dict"]},
            {"messages": None},
        ]
        for i, overrides in enumerate(malformed):
            with self.subTest(shape=overrides):
                base = session(f"bad{i}", "Mission 0: Hello", LEGACY_MD + "\n\nNeutral")
                base.update(overrides)
                with tempfile.TemporaryDirectory() as directory:
                    path = write_session(directory, base)
                    before = path.read_bytes()
                    self.assertEqual(module._repair_session(path), "unsafe")
                    self.assertEqual(path.read_bytes(), before)

    def test_non_dict_session_json_is_unrelated_not_an_error(self):
        module = load_provisioner()
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "toplevel.json"
            path.write_text(json.dumps(["not", "a", "dict"]) + "\n")
            before = path.read_bytes()
            self.assertEqual(module._repair_session(path), "unrelated")
            self.assertEqual(path.read_bytes(), before)

    def test_duplicate_mission_sessions_are_all_repaired_and_never_recreated(self):
        module = load_provisioner()
        with tempfile.TemporaryDirectory() as directory:
            first = write_session(directory, session("dupA", "Mission 0: Hello", LEGACY_MD + "\n\nA"))
            second = write_session(directory, session("dupB", "0 · Hello", LEGACY_MD + "\n\nB"))
            existing = module._existing_mission_paths(directory)
            self.assertEqual([p.name for p in existing[0]], ["dupA.json", "dupB.json"])
            output = io.StringIO()
            with mock.patch("sys.argv", ["provision-missions.py", "--session-dir", directory]), contextlib.redirect_stdout(output):
                self.assertEqual(module.main(), 0)
            self.assertIn("Repaired 2 changed", output.getvalue())
            self.assertEqual(output.getvalue().count("created "), 8)
            for p in (first, second):
                data = json.loads(p.read_text())
                self.assertTrue(data["messages"][0]["content"].startswith(NATIVE))
                self.assertIn(data["session_id"], ("dupA", "dupB"))
            mission_zero_sessions = [
                json.loads(p.read_text())
                for p in pathlib.Path(directory).glob("*.json")
                if json.loads(p.read_text()).get("title") == "Mission 0: Hello"
            ]
            self.assertEqual([s["session_id"] for s in mission_zero_sessions], ["dupA"])


if __name__ == "__main__":
    unittest.main()
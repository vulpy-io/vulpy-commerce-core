import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
PROVISIONER = (ROOT / "extensions/hermes-webui/scripts/provision-missions.py").read_text()
COMMERCE = (ROOT / "extensions/hermes-plugins/vulpy-commerce/__init__.py").read_text()

MISSION_PATHS = {
    0: ".hermes/skills/vulpy-store-missions/vulpy-mission-0-hello/SKILL.md",
    3: ".hermes/skills/vulpy-store-missions/vulpy-mission-3-design/SKILL.md",
    4: ".hermes/skills/vulpy-store-missions/vulpy-mission-4-catalog/SKILL.md",
    5: ".hermes/skills/vulpy-store-missions/vulpy-mission-5-build/SKILL.md",
}


class OnboardingLessonsIntegrationTests(unittest.TestCase):
    def test_fresh_provisioning_preserves_native_media_token(self):
        self.assertIn("MEDIA:/extensions/images/fox_avatar_cropped.jpg", PROVISIONER)

    def test_written_mission_contains_native_media_token(self):
        spec = importlib.util.spec_from_file_location(
            "provision_missions",
            ROOT / "extensions/hermes-webui/scripts/provision-missions.py",
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            module._write_mission(
                pathlib.Path(directory), module.MISSIONS[0][0], module.MISSIONS[0][1], 1
            )
            session = json.loads(next(pathlib.Path(directory).glob("*.json")).read_text())
        self.assertIn(
            "MEDIA:/extensions/images/fox_avatar_cropped.jpg",
            session["messages"][0]["content"],
        )

    def test_legacy_api_provisioning_contains_native_media_token(self):
        spec = importlib.util.spec_from_file_location(
            "vulpy_missions",
            ROOT / "extensions/hermes-webui/api/vulpy_missions.py",
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        class Session:
            messages = []

            def save(self):
                return None

        sessions = []

        def factory(**kwargs):
            session = Session()
            sessions.append(session)
            return session

        module._find_session_by_title = lambda _session_dir, _title: None
        module.create_mission_sessions(session_factory=factory)

        self.assertTrue(sessions)
        self.assertIn(
            "MEDIA:/extensions/images/fox_avatar_cropped.jpg",
            sessions[0].messages[0]["content"],
        )

    def test_missions_explain_empty_shell_and_decision_gates(self):
        for number, path in MISSION_PATHS.items():
            with self.subTest(mission=number):
                copy = (ROOT / path).read_text()
                self.assertRegex(copy, r"(?i)empty shell")
                self.assertRegex(copy, r"(?i)working (?:plumbing|wiring)|plumbing and wiring")
                self.assertRegex(copy, r"(?i)ready to move")
                self.assertRegex(copy, r"(?i)needs this decision")
                self.assertRegex(copy, r"(?i)usable,? (?:and )?can keep iterating")

    def test_typed_integration_status_is_explicitly_planning_only(self):
        self.assertRegex(COMMERCE, r"(?i)planning-only")
        self.assertRegex(COMMERCE, r"(?i)no executor|executor gap")

    def test_mutations_require_language_and_positive_provenance_contract(self):
        for surface, source in (("commerce", COMMERCE),):
            for marker in ("response_language", "provenance", "tenant_id", "source"):
                with self.subTest(surface=surface, marker=marker):
                    self.assertIn(marker, source)

    def test_duplicate_mutation_surface_rejects_missing_contract(self):
        for filename, function_name in (
            ("extensions/hermes-plugins/vulpy-commerce/__init__.py", "payload_upsert"),
        ):
            spec = importlib.util.spec_from_file_location("plugin_under_test", ROOT / filename)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            result = json.loads(
                getattr(module, function_name)(
                    {"collection": "pages", "identifier": "home", "data": {"title": "Home"}}
                )
            )
            with self.subTest(surface=filename):
                self.assertFalse(result["ok"])
                self.assertIn("response_language", result["error"])

    def test_response_language_is_explicit_override_not_locale_inference(self):
        spec = importlib.util.spec_from_file_location(
            "commerce_contract", ROOT / "extensions/hermes-plugins/vulpy-commerce/__init__.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        contract, error = module._request_contract(
            {
                "response_language": "de",
                "locale": "en-US",
                "provenance": {"tenant_id": "tenant-test", "source": "operator"},
            },
            "payload_upsert",
        )
        self.assertIsNone(error)
        self.assertEqual(contract["response_language"], "de")

    def test_status_contract_distinguishes_failures_and_verification(self):
        for marker in (
            "route_unavailable",
            "renderer_unavailable",
            "provider_unavailable",
            "bridge_unavailable",
            "rendered_verification",
            "stale_content",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, COMMERCE)

    def test_rendered_store_verification_covers_homepage_and_catalog_staleness(self):
        spec = importlib.util.spec_from_file_location(
            "commerce_verification", ROOT / "extensions/hermes-plugins/vulpy-commerce/__init__.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        seen = []
        module._rendered_verification = lambda path: seen.append(path) or {
            "code": "stale_content" if path == "/shop" else "rendered_verification",
            "path": path,
        }
        result = module._verify_rendered_store()
        self.assertEqual(seen, ["/", "/shop"])
        self.assertEqual(result["catalog"]["code"], "stale_content")


if __name__ == "__main__":
    unittest.main()

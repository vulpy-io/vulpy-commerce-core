import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "patch-ui.js.py"


class PatchUiTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        ui = root / "ui.js"
        ui.write_text(
            "const S={session:null,messages:[],toolCalls:[]};\n"
            "const INFLIGHT={};  // keyed by session_id while request in-flight\n"
            "function renderMessages(options){\n"
            "  // Vulpy: yield to external renderer when it owns the DOM.\n"
            "  var _riInner=document.getElementById('msgInner');\n"
            "  if(_riInner&&_riInner._hermesRendererActive) return;\n"
            "}\n",
            encoding="utf-8",
        )
        return temporary, ui

    def test_injects_projection_seam_without_disabling_native_renderer(self):
        temporary, ui = self.fixture()
        self.addCleanup(temporary.cleanup)

        subprocess.run(["python3", str(PATCHER), str(ui)], check=True)
        first_ui = ui.read_text(encoding="utf-8")

        self.assertEqual(first_ui.count("installHermesTranscriptStore"), 1)
        self.assertNotIn("_hermesRendererActive", first_ui)

        subprocess.run(["python3", str(PATCHER), str(ui)], check=True)
        self.assertEqual(ui.read_text(encoding="utf-8"), first_ui)

    def test_fails_when_host_state_anchor_is_missing(self):
        temporary, ui = self.fixture()
        self.addCleanup(temporary.cleanup)
        ui.write_text("function renderMessages(){}\n", encoding="utf-8")

        result = subprocess.run(["python3", str(PATCHER), str(ui)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("INFLIGHT anchor", result.stderr + result.stdout)


if __name__ == "__main__":
    unittest.main()

import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-workspace-browser.py"


class WorkspaceBrowserPatcherTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        path = Path(temporary.name) / "workspace.js"
        path.write_text(
            """let _workspacePanelActiveTab = 'files';
function _setWorkspacePanelTabDataset(){
  const panel = document.querySelector('.rightpanel');
  if(panel) panel.dataset.activeTab = _workspacePanelActiveTab;
}
function switchWorkspacePanelTab(tab){
  _workspacePanelActiveTab = tab === 'artifacts' ? 'artifacts' : tab === 'todos' ? 'todos' : 'files';
  _setWorkspacePanelTabDataset();
  const filesTab = $('workspaceFilesTab');
  const artifactsTab = $('workspaceArtifactsTab');
  const todosTab = $('workspaceTodosTab');
  if(filesTab){
    filesTab.classList.toggle('active', _workspacePanelActiveTab === 'files');
    filesTab.setAttribute('aria-selected', _workspacePanelActiveTab === 'files' ? 'true' : 'false');
  }
  if(artifactsTab){
    artifactsTab.classList.toggle('active', _workspacePanelActiveTab === 'artifacts');
    artifactsTab.setAttribute('aria-selected', _workspacePanelActiveTab === 'artifacts' ? 'true' : 'false');
  }
  if(todosTab){
    todosTab.classList.toggle('active', _workspacePanelActiveTab === 'todos');
    todosTab.setAttribute('aria-selected', _workspacePanelActiveTab === 'todos' ? 'true' : 'false');
  }
  const artifacts = $('workspaceArtifacts');
  if(artifacts) artifacts.hidden = _workspacePanelActiveTab !== 'artifacts';
  const todosPanel = $('workspaceTodosPanel');
  if(todosPanel) todosPanel.hidden = _workspacePanelActiveTab !== 'todos';
}
""",
            encoding="utf-8",
        )
        return temporary, path

    def test_adds_browser_state_without_coercing_files(self):
        temporary, path = self.fixture()
        self.addCleanup(temporary.cleanup)
        subprocess.run(["python3", str(PATCHER), str(path)], check=True)
        text = path.read_text(encoding="utf-8")
        self.assertIn("tab === 'browser'", text)
        self.assertIn("data-vc-native-browser-tab", text)
        self.assertIn("_workspacePanelActiveTab === 'browser'", text)

        first = text
        subprocess.run(["python3", str(PATCHER), str(path)], check=True)
        self.assertEqual(path.read_text(encoding="utf-8"), first)

    def test_refuses_unexpected_switcher_shape(self):
        temporary, path = self.fixture()
        self.addCleanup(temporary.cleanup)
        path.write_text("function switchWorkspacePanelTab(tab){ return tab; }\n", encoding="utf-8")
        result = subprocess.run(["python3", str(PATCHER), str(path)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("shape", result.stderr + result.stdout)


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Durably add the Vulpy Commerce Browser tab to the host workspace switcher.

The extension adds the Browser button at runtime, but the host owns active-tab
state. This patch keeps that state authoritative without editing the upstream
WebUI checkout directly. It is deliberately anchored to the current switcher
shape and fails closed when upstream changes it.

Usage:
  python3 patch-webui-workspace-browser.py <workspace.js>
"""
from pathlib import Path
import sys

MARKER = "// vulpy: browser workspace tab integration"
ASSIGNMENT = "  _workspacePanelActiveTab = tab === 'artifacts' ? 'artifacts' : tab === 'todos' ? 'todos' : 'files';"
ARTIFACTS_ANCHOR = "  const artifacts = $('workspaceArtifacts');"
BROWSER_ASSIGNMENT = "  _workspacePanelActiveTab = tab === 'browser' ? 'browser' : tab === 'artifacts' ? 'artifacts' : tab === 'todos' ? 'todos' : 'files';"
BROWSER_STATE = """  // vulpy: browser workspace tab integration
  const browserTab = document.querySelector('[data-vc-native-browser-tab]');
  if(browserTab){
    browserTab.classList.toggle('active', _workspacePanelActiveTab === 'browser');
    browserTab.setAttribute('aria-selected', _workspacePanelActiveTab === 'browser' ? 'true' : 'false');
  }
  const browserWrapper = document.querySelector('[data-vc-browser]');
  if(browserWrapper) browserWrapper.hidden = _workspacePanelActiveTab !== 'browser';
  const browserFileTree = $('fileTree');
  if(browserFileTree) browserFileTree.hidden = _workspacePanelActiveTab === 'browser';
  const browserBreadcrumb = $('breadcrumbBar');
  if(browserBreadcrumb) browserBreadcrumb.hidden = _workspacePanelActiveTab === 'browser';
  const browserPreview = $('previewArea');
  if(browserPreview) browserPreview.hidden = _workspacePanelActiveTab === 'browser';
"""


def fail(message: str) -> None:
    print(f"patch-webui-workspace-browser.py: ERROR — {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <workspace.js>", file=sys.stderr)
        return 1
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    if MARKER in text:
        print(f"patch-webui-workspace-browser.py: seam already present in {path}, skipping")
        return 0
    if text.count("function switchWorkspacePanelTab(tab){") != 1:
        fail("switcher shape: expected exactly one switchWorkspacePanelTab(tab) function")
    if text.count(ASSIGNMENT) != 1:
        fail("switcher shape: expected exactly one supported-tab assignment")
    if text.count(ARTIFACTS_ANCHOR) != 1:
        fail("switcher shape: expected exactly one artifacts visibility anchor")

    text = text.replace(ASSIGNMENT, BROWSER_ASSIGNMENT, 1)
    text = text.replace(ARTIFACTS_ANCHOR, BROWSER_STATE + ARTIFACTS_ANCHOR, 1)
    path.write_text(text, encoding="utf-8")
    print(f"patch-webui-workspace-browser.py: injected Browser workspace state into {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Add the opt-in demo read-only guard to the vendored WebUI.

The server guard remains authoritative. The static patches only make the
read-only state visible and prevent accidental composer/approval actions.
"""
from pathlib import Path
import sys

SERVER_MARKER = "# vulpy: demo read-only write guard"
INDEX_MARKER = "/* vulpy: demo read-only controls */"
MESSAGES_MARKER = "// vulpy: demo read-only global approval controls"

SERVER_ANCHOR = "    def _handle_write(self, route_func) -> None:\n"
ROUTES_CONFIG_ANCHOR = '        .replace("__MAX_UPLOAD_BYTES__", str(MAX_UPLOAD_BYTES))'
INDEX_ANCHOR = "<script>window.__HERMES_CONFIG__={maxUploadBytes:__MAX_UPLOAD_BYTES__,csrfToken:__CSRF_TOKEN_JSON__};</script>"
MESSAGES_ANCHOR = (
    "function showApprovalForSession(sid, pending, pendingCount) {\n"
    "  if (!pending) return;\n"
    "  pending._session_id = sid;\n"
    "  showApprovalCard(pending, pendingCount);\n"
    "}\n"
)

SERVER_REPLACEMENT = '''    def _handle_write(self, route_func) -> None:
        # vulpy: demo read-only write guard
        if os.environ.get("VULPY_DEMO_READ_ONLY", "0").strip().lower() in ("1", "true", "yes", "on"):
            return j(self, {"error": "Demo is read-only"}, status=403)
'''

SERVER_CONFIG_REPLACEMENT = '''        .replace("__MAX_UPLOAD_BYTES__", str(MAX_UPLOAD_BYTES))
        .replace("__VULPY_DEMO_READ_ONLY__", json.dumps(
            os.environ.get("VULPY_DEMO_READ_ONLY", "0").strip().lower() in ("1", "true", "yes", "on")
        ))'''

INDEX_REPLACEMENT = '''<script>window.__HERMES_CONFIG__={maxUploadBytes:__MAX_UPLOAD_BYTES__,csrfToken:__CSRF_TOKEN_JSON__,demoReadOnly:__VULPY_DEMO_READ_ONLY__};</script>
<script>
/* vulpy: demo read-only controls */
(function(){
  var cfg=window.__HERMES_CONFIG__||{};
  window.__vulpyDisableDemoReadOnlyControls=function(root){
    if(!cfg.demoReadOnly)return;
    var scope=root||document;
    var selectors='#msg,#btnSend,#approvalBtnOnce,#approvalBtnSession,#approvalBtnAlways,#approvalBtnDeny,#approvalSkipAll,.approval-btns button';
    scope.querySelectorAll(selectors).forEach(function(control){
      control.disabled=true;
      control.setAttribute('aria-disabled','true');
    });
  };
  if(cfg.demoReadOnly){
    document.addEventListener('DOMContentLoaded',function(){
      window.__vulpyDisableDemoReadOnlyControls();
    });
  }
})();
</script>'''

MESSAGES_REPLACEMENT = '''function showApprovalForSession(sid, pending, pendingCount) {
  if (!pending) return;
  pending._session_id = sid;
  showApprovalCard(pending, pendingCount);
  // vulpy: demo read-only global approval controls
  if (window.__vulpyDisableDemoReadOnlyControls) window.__vulpyDisableDemoReadOnlyControls();
}
'''


def _replace_once(text: str, anchor: str, replacement: str, label: str) -> str:
    count = text.count(anchor)
    if count != 1:
        raise SystemExit(f"ERROR: {label} anchor must occur exactly once (found {count})")
    return text.replace(anchor, replacement, 1)


def _patch_server(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if SERVER_MARKER in text:
        if "__VULPY_DEMO_READ_ONLY__" not in text:
            raise SystemExit("ERROR: server guard is present but config flag patch is missing")
        return
    text = _replace_once(text, SERVER_ANCHOR, SERVER_REPLACEMENT, "server write guard")
    path.write_text(text, encoding="utf-8")


def _patch_routes(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "__VULPY_DEMO_READ_ONLY__" in text:
        return
    text = _replace_once(text, ROUTES_CONFIG_ANCHOR, SERVER_CONFIG_REPLACEMENT, "routes index config")
    path.write_text(text, encoding="utf-8")


def _patch_index(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if INDEX_MARKER in text:
        return
    text = _replace_once(text, INDEX_ANCHOR, INDEX_REPLACEMENT, "index.html")
    path.write_text(text, encoding="utf-8")


def _patch_messages(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if MESSAGES_MARKER in text:
        return
    if MESSAGES_ANCHOR in text:
        text = _replace_once(text, MESSAGES_ANCHOR, MESSAGES_REPLACEMENT, "messages.js")
    else:
        # The global approval-banner patch may already have replaced the
        # original helper anchor. Add the demo control hook to the surviving
        # helper body instead of failing on patch-order dependence.
        marker = "  showApprovalCard(pending, pendingCount);"
        if text.count(marker) != 1:
            raise SystemExit("ERROR: messages.js has neither the original approval anchor nor one surviving showApprovalCard call")
        text = text.replace(marker, marker + "\n  // vulpy: demo read-only global approval controls\n  if (window.__vulpyDisableDemoReadOnlyControls) window.__vulpyDisableDemoReadOnlyControls();", 1)
    path.write_text(text, encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print(f"Usage: {argv[0]} <server.py> <routes.py> <index.html> <messages.js>", file=sys.stderr)
        return 1
    server, routes, index, messages = (Path(value) for value in argv[1:])
    if (
        SERVER_MARKER in server.read_text(encoding="utf-8")
        and "__VULPY_DEMO_READ_ONLY__" in routes.read_text(encoding="utf-8")
        and INDEX_MARKER in index.read_text(encoding="utf-8")
        and MESSAGES_MARKER in messages.read_text(encoding="utf-8")
    ):
        print("demo read-only controls already patched")
        return 0
    _patch_server(server)
    _patch_routes(routes)
    _patch_index(index)
    _patch_messages(messages)
    print(f"patched demo read-only controls in {server}, {routes}, {index}, and {messages}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

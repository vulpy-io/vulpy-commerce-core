# Hermes WebUI Test Suite — Container Environment Blockers

Use this reference when running the Hermes WebUI test suite
(`scripts/test.sh`) inside the Fox container (`vulpy-hermes:local` or
`ghcr.io/fox-in-the-box-ai/cloud:stable`) and encountering baseline-identical
failures that do not appear in CI.

All failures below are **environment-only** (category 4 per the skill's
classification). They pre-exist any change and reproduce identically on the
clean pinned-SHA baseline. Do NOT modify product or test code to address them.

---

## 1. Python version auto-detection picks 3.13 first

**File:** `scripts/test.sh`, line ~53  
**Probe order:** `python3.13 python3.12 python3.11 python3`

Python 3.13 is present on the Fox container but venv creation or dep install
may fail (depends on image build). If tests fail early during `pip install -r
requirements-dev.txt`, this is the cause.

**Workaround (always set in this container):**
```bash
export HERMES_WEBUI_TEST_PYTHON=/usr/local/bin/python3.11
```

`test.sh` lines ~146–171: when `HERMES_WEBUI_TEST_PYTHON` is set, auto-detection
is skipped entirely. Set it before every invocation; do not assume `.env` already
exports it.

**Diagnostic:**
```bash
python3.13 -m venv /tmp/probe-313 && \
  /tmp/probe-313/bin/pip install -r requirements-dev.txt 2>&1 | tail -20
```
If this succeeds, Python 3.13 is actually fine and the override is optional.
If it fails, the error will name the blocking package (often a C-extension
wheel with no 3.13 binary).

---

## 2. Missing `/etc/ssh` directory

**Test:** `tests/test_remote_terminal_workspace.py` (line ~107)  
```python
@pytest.mark.parametrize("workspace_path", ["/etc", "/etc/ssh"])
def test_remote_terminal_workspace_system_roots_still_reject(...)
```

`/etc/ssh` does not exist in the Fox container (no SSH server installed).
The workspace validator raises `"Path does not exist"` rather than the expected
`"Path points to a system directory"`, so the test fails on wrong exception
message, not wrong behavior.

**Workaround (env-level, no product change):**
```bash
sudo mkdir -p /etc/ssh
```
or (if root):
```bash
mkdir -p /etc/ssh
```

After creating the directory the test passes. Product behavior is correct; the
environment just lacks the fixture.

---

## 3. TLS `close_notify` — curl exit 56

**Tests:** `tests/test_tls_aware_probe.py`
- `test_helper_insecure_optin_is_silent`
- `test_helper_self_signed_warns_and_succeeds`

**Environment:** curl 8.14.1 / OpenSSL 3.5.6 (as of mid-2026)

curl 8.14.1 defaults to strict TLS `close_notify` handling. When the test
spins a local TLS server that sends a socket-level close without a proper TLS
`close_notify` alert, curl exits with code 56
(`CURLE_RECV_ERROR` — "Failure in receiving network data").

The test expects exit 0 (successful HTTPS connection). The server fixture and
curl version are incompatible; this is a toolchain contract issue, not a
product defect.

**No container-level workaround available** — curl version and OpenSSL are
system-wide. Fixing this requires either:
- patching the test server fixture to complete TLS shutdown properly
  (upstream PR to `nesquena/hermes-webui`), or
- running the tests in an environment with an older curl.

**Classification:** baseline-identical, upstream scope. Exclude from regression
counts; document in issue #91.

---

## 4. Hermes Agent 0.18.2 missing `_SESSION_UI_SESSION_ID`

**Tests:**
- `tests/test_xsession_wakeup_misroute.py::test_turn_identity_binder_sets_ui_session_id`
- `tests/test_issue4685_post_compression_context_metering.py::test_post_compression_estimate_uses_compressor_budget_counter_without_metadata_estimators`

**Root cause:** The `api` (Hermes Agent) package installed in the container is
version 0.18.2. The symbol `_SESSION_UI_SESSION_ID` (and related compat
attributes) were added in a later release. Both tests fail at **collection time**
with `ImportError` or `AttributeError`, not at execution.

**Diagnosis:**
```bash
# From the test suite root (with the test venv active):
python3.11 -c "import api; print([x for x in dir(api) if 'SESSION' in x.upper()])"
python3.11 -c "import api; print(api.__version__)"
```

**No container-level workaround** — `api` is part of the Hermes core image.
The symbol will appear when the image is updated to a newer Hermes Agent version.

**Classification:** baseline-identical, upstream scope. Exclude from regression
counts; document in issue #91.

---

## Summary table

| Failure | Root cause | Container fix available? | Upstream fix needed? |
|---------|-----------|--------------------------|----------------------|
| Python 3.13 dep install fails | `test.sh` probe order | ✅ Set `HERMES_WEBUI_TEST_PYTHON` | No |
| `/etc/ssh` missing | SSH server not installed | ✅ `mkdir -p /etc/ssh` | No |
| curl exit 56 TLS close_notify | curl 8.14.1 strict TLS | ❌ | ✅ Test server fixture |
| `_SESSION_UI_SESSION_ID` missing | Hermes Agent 0.18.2 | ❌ | ✅ Image update |

---

## Acceptance baseline for issue-74 and successors

All shards in the accepted #74 baseline had exactly **1 failure per shard** —
the `/etc/ssh` parametrized variant — with zero changed-path failures.

Reference logs:
- `ctrl-final2-shard-0.log`: 4562 passed, 1 failed (`/etc/ssh`)
- `ctrl-final-shard-1.log`: 4659 passed, 1 failed (`test_helper_insecure_optin_is_silent`)
- `ctrl-final-shard-2.log`: 4640 passed, 2 failed (`test_post_compression_…`, `test_helper_self_signed_…`, `test_turn_identity_binder_…`)

Any shard count matching these patterns (same named failures, same totals ±
normal flake) is a clean baseline-identical run.

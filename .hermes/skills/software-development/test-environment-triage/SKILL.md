---
name: test-environment-triage
description: "Triage and resolve container/CI environment failures that block test runs — permission denials, TLS/curl compat, missing system paths, version-gated API gaps, and skip-vs-fail classification."
version: 1.0.0
author: Hermes Agent
platforms: [linux]
metadata:
  hermes:
    tags: [debugging, testing, containers, ci, tls, environment, pytest]
    related_skills: [systematic-debugging, test-driven-development, behavioral-regression-testing]
---

# Test Environment Triage

## When to use

Load this skill when:
- Tests fail not because of product bugs but because the **container/CI environment** is missing something
- A test that passes in dev fails in CI with a permissions, path, or TLS error
- You need to distinguish "environment gap" from "product bug" before filing/commenting on an issue
- You're cataloguing blocker failures and need to communicate root causes clearly

## Core principle

**Baseline-identical failures are environment facts, not product bugs.** Before changing any product or test code, exhaust environment-level fixes. When those are blocked, document the exact error and recommend the minimal upstream action.

---

## 1. Classify the failure first

Run the test with `-v -s` to capture full stderr and stdout:

```bash
HERMES_WEBUI_TEST_PYTHON=/usr/local/bin/python3.11 ./scripts/test.sh <test> -v -s 2>&1 | tail -40
```

Then classify:

| Symptom | Class | Action |
|---------|-------|--------|
| `Path does not exist: /etc/ssh` instead of expected error | Missing system path | Create dir (if permitted) — or add `RUN mkdir -p /etc/ssh` to Dockerfile |
| `curl: (56) unexpected eof while reading` with body received | TLS close_notify (curl 8.x + OpenSSL 3.x + Python http.server) | See §3 |
| `AttributeError: module has no attribute '_SESSION_UI_SESSION_ID'` | Version-gated API gap | Upgrade package or add skip guard |
| Test status is `SKIPPED` not `FAILED` | `pytest.importorskip` degraded gracefully | No action needed |
| `ImportError: No module named 'requests'` | Missing .venv dependency | `pip install requests` in .venv |

---

## 2. Container privilege triage

When a fix requires creating a directory or installing something under a root-owned path:

```bash
# Escalation ladder — try in order:
whoami && id                                    # 1. Am I root?
sudo mkdir -p /path 2>&1                        # 2. sudo available?
unshare --user --map-root-user mkdir -p /path   # 3. user namespaces?
ls /var/run/docker.sock 2>&1                    # 4. Docker socket?
cat /proc/1/status | grep -i "^uid\|^gid"      # 5. What does PID 1 run as?
```

When all fail: document and report. Recommend the fix go in the image build (`RUN mkdir -p /etc/ssh`) or CI entrypoint.

---

## 3. TLS close_notify: curl 8.x / OpenSSL 3.x / Python http.server

**Exact error:**
```
curl: (56) OpenSSL SSL_read: OpenSSL/3.5.6: error:0A000126:SSL routines::unexpected eof while reading, errno 0
```

**What is happening:** Python's `http.server` closes the raw socket without sending a TLS `close_notify` alert. OpenSSL 3.x enforces RFC 8446 §6.1, so it surfaces this as a recv error. curl 8.x reports exit 56 — even though the response body was fully received.

**Distinguishing exit-56 causes:**
- Exit 56 **with `res.stdout` populated**: missing close_notify (this issue)
- Exit 56 **with empty stdout**: genuine network drop

**No curl-side workaround exists** (tested: `--http1.1`, `--tlsv1.2 --tls-max 1.2`, `--ssl-no-revoke` — all still exit 56).

**The fix is server-side (Python 3.11+):**
```python
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(cert, key)
ctx.options |= ssl.OP_IGNORE_UNEXPECTED_EOF   # ← suppresses missing close_notify
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
```

In a test fixture you cannot modify: file a PR to add the line above to the `_Server` fixture class.

**Affected environment:** curl ≥ 8.x + OpenSSL ≥ 3.x + Python http.server (any version). Not an issue with Python's `urllib`/`http.client` or with proper TLS servers (nginx, etc.).

---

## 4. Version-gated API attribute failures

When the installed package doesn't export an attribute the test expects:

```
AttributeError: module 'gateway.session_context' has no attribute '_SESSION_UI_SESSION_ID'
```

**Triage steps:**
```bash
python3.11 -c "from gateway import session_context as sc; print(dir(sc))"
python3.11 -c "import importlib.metadata; print(importlib.metadata.version('hermes-agent'))"
```

**Resolution options (in order of preference):**
1. Upgrade the package to the version that adds the attribute.
2. Add a `skipif` guard in the test: `pytest.mark.skipif(not hasattr(sc, '_SESSION_UI_SESSION_ID'), reason="hermes-agent < X.Y.Z")`.
3. Report to the package maintainer with the exact installed version and the version that introduced the attribute.

---

## 5. SKIP vs FAIL — do not conflate them

`pytest.importorskip("module")` → test is **SKIPPED**, not FAILED, when import fails. A skip is a graceful degradation that requires no action.

**Always verify test status in the output before reporting a test as "broken":**
```
SKIPPED [100%]   ← no action needed
FAILED  [100%]   ← investigate
```

A test that was listed as "failing" may actually be skipping. Run it individually with `-v` to confirm.

---

## 6. Writing the blocker comment

When filing/commenting on an issue with environment-specific failures, structure the comment as:

```
### ✅/❌ Failure #N — <short description> (<STATUS>)

**Root cause confirmed:** <one sentence>
**Fix attempted:** <what was tried> → <result>
**Exact error:**
\`\`\`
<paste exact error lines>
\`\`\`
**Recommended fix:** <minimal action — image change, package upgrade, test guard>
```

Include a summary table at the end:

| # | Test | Status | Owner |
|---|------|--------|-------|
| 1 | ... | ✅ Fixed / ❌ Blocked | infra / PR / upstream |

---

## 7. Python venv bootstrap failure — missing `python3.x-venv` package

**Symptom:** A test wrapper (e.g. `./scripts/test.sh`) auto-selects a higher-priority Python (3.13 > 3.12 > 3.11) because the version integer passes the supported-range check, but venv creation immediately fails:

```
Creating .venv with /usr/bin/python3.13 (3.13.5).
The virtual environment was not created successfully because ensurepip is not
available.  On Debian/Ubuntu systems, you need to install the python3-venv
package using the following command.

    apt install python3.13-venv
```

**Why it happens:** On Debian/Ubuntu, the `python3.x` interpreter package and its `python3.x-venv` (ensurepip) package are **separate**. A version check like `3.11 <= sys.version_info <= 3.13` passes, but `python3.x -m venv` still fails because `ensurepip` is absent.

**Diagnosis — run these three probes:**

```bash
# 1. Does venv actually work?
python3.13 -m ensurepip --version 2>&1   # expect "pip X.Y"; if "No module named ensurepip" → broken

# 2. Is the venv package even installed?
dpkg -l python3.13-venv                  # "un" = not installed; "ii" = installed

# 3. What does the existing .venv use?
ls -la .venv/bin/python*                 # confirms which interpreter the repo already fell back to
```

**Classification:** Image-level environment gap. The interpreter is present but the venv bootstrap toolchain is not. **Do not fix in product code.**

**Fix (in image Dockerfile / CI setup):**
```dockerfile
RUN apt-get install -y python3.13-venv
```

**Interim workaround (contributor-level):**
```bash
HERMES_WEBUI_TEST_PYTHON=/usr/local/bin/python3.11 ./scripts/test.sh
```
This is functional but requires every contributor/subagent to act — it does not satisfy a "works out of the box" acceptance criterion.

**Upstream hardening option:** Make the auto-selection loop in `scripts/test.sh` probe whether each candidate can bootstrap a disposable venv (try `python3.x -m ensurepip` or attempt venv in a tmp dir) before accepting it as the base interpreter.

**Issue comment template:** See §6 above. State: installed interpreter ✅, venv package ❌ (dpkg status `un`), working fallback ✅, recommended fix is image-level package install.

---

## References

- `references/tls-curl-python-httpserver-compat.md` — full TLS close_notify detail and reproduction recipe
- `references/container-privilege-investigation.md` — privilege escalation checklist for containers
- `references/python-venv-ensurepip-missing.md` — Python 3.13 venv bootstrap failure: reproduction recipe, dpkg evidence, and issue comment example

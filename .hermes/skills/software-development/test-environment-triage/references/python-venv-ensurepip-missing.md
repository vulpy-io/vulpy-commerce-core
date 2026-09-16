# Python 3.x venv bootstrap failure — `python3.x-venv` not installed

**Observed:** 2026-08-03, vulpy-io/vulpy-commerce-pro-private issue #88  
**Environment:** Debian/Ubuntu, Python 3.13.5-2+deb13u2 installed, `python3.13-venv` absent

---

## Exact reproduction

```bash
python3.13 -m venv /tmp/test-venv-313
```

Output:
```
The virtual environment was not created successfully because ensurepip is not
available.  On Debian/Ubuntu systems, you need to install the python3-venv
package using the following command.

    apt install python3.13-venv

You may need to use sudo with that command.  After installing the python3-venv
package, recreate your virtual environment.

Failing command: /tmp/test-venv-313/bin/python3.13
```

```bash
python3.13 -m ensurepip --version
# → /usr/bin/python3.13: No module named ensurepip

dpkg -l python3.13-venv
# → un  python3.13-venv  <none>  (no description available)  ← NOT installed

dpkg -l | grep python3.13
# ii  libpython3.13-minimal:amd64   3.13.5-2+deb13u2  ...
# ii  libpython3.13-stdlib:amd64    3.13.5-2+deb13u2  ...
# ii  python3.13                    3.13.5-2+deb13u2  ...
# ii  python3.13-minimal            3.13.5-2+deb13u2  ...
# (no python3.13-venv line)
```

## Working fallback

```bash
python3.11 -m ensurepip --version   # → pip 24.0  ✅
# python3.11 was installed at /usr/local/bin/python3.11 (Python 3.11.15)
# Existing .venv was correctly symlinked to python3.11 via prior HERMES_WEBUI_TEST_PYTHON workaround
```

## Root cause summary

Debian/Ubuntu splits Python interpreter and venv support into separate packages:
- `python3.13` → provides the interpreter binary only
- `python3.13-venv` → provides `ensurepip` / venv bootstrap; listed as **optional**

Auto-selection in `scripts/test.sh` checks version range (`3.11 ≤ ver ≤ 3.13`) and returns
the highest-numbered interpreter that passes — **without** probing whether `python3.x -m venv`
would actually succeed. So 3.13 wins the race, then fails.

## Fix

```dockerfile
# In image Dockerfile:
RUN apt-get install -y python3.13-venv
```

## Issue comment pattern used

```
## Diagnosis: #88 is still a real blocker — Python 3.13 venv creation fails

### Root cause confirmed

python3.13-venv is NOT installed (dpkg status: un). ensurepip absent.

| Component | Status |
|-----------|--------|
| python3.13 binary | ✅ installed |
| python3.13-venv package | ❌ not installed |
| ensurepip for 3.13 | ❌ missing |
| python3.11 + venv | ✅ fully working |

### Fix required
apt-get install -y python3.13-venv  (in image build)

### Interim workaround
HERMES_WEBUI_TEST_PYTHON=/usr/local/bin/python3.11 ./scripts/test.sh
```

## apt-cache show output (for reference)

```
Package: python3.13-venv
Source: python3.13
Version: 3.13.5-2+deb13u4
Depends: python3.13 (= 3.13.5-2+deb13u4), python3-pip-whl (>= 22.2), python3-setuptools-whl (>= 70.1)
```

The venv package depends on the **exact same version** of `python3.13` — version skew between
interpreter and venv package will also cause failure. Ensure both are upgraded together.

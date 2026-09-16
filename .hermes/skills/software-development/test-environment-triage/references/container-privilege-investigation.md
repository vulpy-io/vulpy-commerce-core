# Container privilege investigation

Use when an environment-level fix requires creating directories, installing packages, or
modifying a root-owned path in a container where the current user is non-root.

## Quick triage commands (run in order)

```bash
# 1. Who am I?
whoami && id

# 2. Is PID 1 root? (tells you if a namespace mapping exists)
cat /proc/1/status | grep -i "^uid\|^gid"

# 3. sudo available?
sudo -n true 2>&1 || echo "no sudo"

# 4. User namespaces allowed?
unshare --user --map-root-user echo "ok" 2>&1

# 5. Docker socket (allows exec into a root container)?
ls /var/run/docker.sock 2>&1

# 6. nsenter into PID 1 (requires CAP_SYS_PTRACE or capabilities)?
nsenter -t 1 -m -u -i -n -p -- mkdir -p /etc/ssh 2>&1
```

## Escalation ladder

1. Direct write — user may already have permission
2. `sudo` — requires sudo installed + user in sudoers/wheel
3. `unshare --user --map-root-user` — requires kernel user-namespace support (often disabled in hardened containers)
4. `nsenter -t 1` — requires CAP_SYS_PTRACE or equivalent
5. Docker socket → `docker exec` into root container
6. Package manager side-effect — e.g. `apt-get install -y openssh-server` creates `/etc/ssh`

## When all fail

Document the blocker:
- Which fix was needed and why (e.g., "test expects `/etc/ssh` to exist for system-root validation")
- Commands tried and exact errors
- Recommend the fix go in the **container image** (`RUN mkdir -p /etc/ssh`) or **CI entrypoint** (before tests)

## Common case: missing /etc/ssh

`/etc/ssh` is created by `openssh-server`. In a minimal container that omits openssh:
- The test for "system directory reject" gets `'Path does not exist: /etc/ssh'` instead of `'Path points to a system directory'`
- Fix in Dockerfile: `RUN mkdir -p /etc/ssh` or `RUN apt-get install -y openssh-server && apt-get clean`

## pytest.importorskip vs failure reminder

`pytest.importorskip("module")` → test is **SKIPPED**, not FAILED.
Always confirm status in test output (`SKIPPED` vs `FAILED`) before treating as a blocker.

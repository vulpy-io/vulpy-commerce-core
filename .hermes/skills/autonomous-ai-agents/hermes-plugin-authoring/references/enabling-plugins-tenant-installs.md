# Enabling user plugins on older / install-drift Hermes boxes

Verified 2026-08-25 enabling 4 vulpy operator plugins on a tenant Hermes
container (same v0.18.2 as the dev box) after copying them into
`/data/data/hermes/plugins/<name>/`.

## Symptom

`hermes plugins enable <name>` inside the target container prints:
`Plugin '<name>' is not installed or bundled.` even though the plugin dir
(`__init__.py` + `plugin.yaml`) is present under `/data/data/hermes/plugins/`.
And `PluginManager().discover_and_load()` still reports `enabled=False`.

## Root causes

1. `HERMES_HOME` may be **empty** in the container shell, so the CLI/manager
   resolves discovery against a different home than `/data/data/hermes` — the
   user-plugins dir the enable command checks isn't where the files landed. Find
   the REAL HERMES_HOME from the running process environ:
   `tr '\0' '\n' < /proc/<pid>/environ | grep HERMES_HOME`, and enable/patch
   THAT config path.
2. When you patch `plugins.enabled` in `config.yaml` by hand, the list must be a
   **flat sibling list at 2-space indent**:
   ```yaml
   plugins:
     enabled:
       - model-providers/vulpy
       - vulpy-store-tools
     disabled: []
   ```
   A naive regex that appends inside the wrong indentation nests the new items
   under the first existing item and YAML parses them as a nested list — the
   manager silently loads NONE of them (`enabled=False` for all). The regex must
   match the whole `enabled:` block and rewrite it flat.

## Fix
- Copy the plugin dirs into the real plugins dir (`/data/data/hermes/plugins/`).
- Fix `plugins.enabled` as a clean flat list in BOTH `/data/config.yaml` and
  `/data/data/hermes/config.yaml` (whichever the runtime reads).
- Verify with the PluginManager using the SAME HERMES_HOME the runtime uses:
  ```python
  import sys; sys.path.insert(0, "/app/hermes-agent/src")
  from hermes_cli.plugins import PluginManager
  pm = PluginManager(); pm.discover_and_load()
  p = pm._plugins.get("<name>"); print(p.enabled, p.tools_registered)
  ```
- On the dev box, the durable shipping path is the entrypoint seeding function
  (the `vulpy_ensure_*_plugin` helpers in `scripts/hermes-fox-entrypoint.sh`,
  e.g. `vulpy_ensure_remote_ssh_plugin` and `vulpy_ensure_operator_plugin` —
  the operator plugin is CONSOLIDATED into a single `vulpy-commerce` dir with
  9 tools, not a per-domain split), which copy + enable on every boot. Older
  installs predating that seeding need the manual enable above until they
  rebuild the Hermes container.

## Operational traps (verified the hard way)

- **`docker exec` has its OWN `/tmp`.** Files scp'd to the HOST `/tmp` are not
  visible in the container — a script "uploaded" via scp then run with
  `docker exec ... python3 /tmp/x.py` fails with `No such file or directory`.
  Pipe scripts in: `cat /tmp/script.py | docker exec -i <c> sh -c "cat > /tmp/script.py && python3 /tmp/script.py"`.
  Likewise for verify snippets.
- **Nested quoting explodes fast.** `python3 -c` inside `sh -c` inside
  `ssh '…'` (especially with `\u0027`, `$(...)`, or `\0` sequences) produces
  syntax errors that look like plugin bugs but are harness bugs. Write the
  script to a file and pipe it — never build nested inline `-c` strings.
- **`shutil.rmtree` for cleanup**, not `.rmdir()` — directory not empty throws
  `OSError: [Errno 39]`.
- **Same Hermes version on two boxes does NOT mean same behavior** — if one
  enables plugins and the other says "not installed or bundled", the drift is
  config path / HERMES_HOME / entrypoint age, not the Hermes version.
- When scanning "what changed", remember hand-copied files into a git checkout
  make the working tree dirty and can block `git merge --ff-only`
  ("Please move or remove them before you merge") — stash or reset deliberately
  when reproducing from the repo.
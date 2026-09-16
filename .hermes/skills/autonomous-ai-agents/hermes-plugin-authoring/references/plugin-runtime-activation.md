# Plugin dispatch and runtime activation

Hermes registry dispatch calls every handler as `handler(args_dict, **kwargs)` and may inject `task_id` or other session context. A plugin handler declared as `def tool(args)` fails at runtime with `TypeError: unexpected keyword argument 'task_id'`; this can break every tool in a plugin at once.

Use `def tool(args: dict, **kwargs) -> str` and add a repo-level signature scan plus a direct registry dispatch test with `task_id="verify"`. Verify both the workspace extension and the active `$HERMES_HOME/plugins/<name>/` copy.

Keep these states separate:

1. source changed/committed;
2. image rebuilt or runtime plugin copied;
3. process reloaded/restarted;
4. live tool dispatch verified.

A process reload cannot activate code that is absent from an image-baked plugin directory. Conversely, copying a runtime file without a durable source/build path will be lost on recreate. Never report “fixed” from source tests alone; include each activation state explicitly. After an explicit multi-action “go”, execute the approved actions in order and stop only for a new safety blocker.

---
name: atsys
description: Configure and launch coding tasks under the installed AtSys supervisor. Use when the user asks AtSys to manage an objective, automate execution and recovery, or monitor delegated coding work.
---

# Delegate work through AtSys

AtSys is installed as the `atsys` command. You prepare the task; its managed worker owns execution. The package supplies the schema, defaults, runtime and dashboard; no source checkout is needed.

If `ATSYS_TASK_ID` is set, or your prompt identifies you as an AtSys worker, supervisor or repair agent, perform that assigned role directly. Do not create a nested AtSys task.

For a new objective:

1. Inspect the current repository and the user's objective. Establish scope, constraints, a useful execution plan and independent completion checks. Preserve unrelated work. Prefer existing focused tests/builds; prepare a suitable acceptance script when necessary. Read [task configuration](references/task-config.md) for the installed interface.
2. Create a configuration using `atsys task template --objective "..." --output .atsys/tasks/<name>.json`. Set the real project directory and acceptance command. Use the Codex worker and current configured model unless the user specifies a model. Set supervised recovery with two retries and bounded deadlines. Enable bounded repair only within the work the user authorized; automatic repair does not authorize unrelated edits or external actions.
3. Use `atsys service status` and ensure watchdog protection is healthy (`atsys service install` on macOS when needed). Submit exactly once with `atsys task submit --config <file>`. Preserve the returned task ID; if submission output is lost, inspect `atsys task list` before considering another submission.
4. Use `atsys task show <id>` to confirm an attempt has started and its heartbeat is recent. Report the ID, objective, acceptance criteria, recovery limits and dashboard link from `atsys ui --no-open`. If startup fails, report the actual state/error rather than claiming a successful handoff.

For an existing task, inspect its state before changing it. `atsys task stop <id>` and `atsys task retry <id>` persist operator intent; configuration changes can be made in the dashboard. Report whether a task is running, validating, recovering, completed, stopped or needs attention based on persisted evidence. A model's success statement is not completion evidence.

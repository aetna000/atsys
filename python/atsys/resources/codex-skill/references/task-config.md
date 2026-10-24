# Installed task configuration

`atsys task template --objective "..." --output .atsys/tasks/task.json` writes a configuration for the current directory without starting work. Add `--project /repo` for another root, `--allow-repair` when authorized, and `--force` only to replace a known task configuration intentionally. `atsys task schema` prints the authoritative JSON schema from the installed package.

The JSON fields include:
- `name`, `objective`, `cwd`, `plan`: task identity, repository, instructions and acceptance criteria.
- `worker`: `codex` or `command`. `model` may be empty to use native Codex configuration. `reasoningEffort`: low/medium/high/xhigh.
- `argv`: exact command arguments for command workers. `resumeArgv`: optional retry-safe checkpoint command; empty reuses the original command.
- `validator`: prefer `command`; `validationArgv` is a nonempty argv array, e.g. `["npm","test"]` or `["python","-m","pytest","tests/test_feature.py"]`. `validationTimeoutSeconds` bounds the separate check. `exit-code` is available when it actually establishes success.
- `requiredArtifacts`: optional relative file paths whose presence/content digests should be recorded.
- `timeoutSeconds`, `taskTimeoutSeconds`: worker-attempt and total-task deadlines.
- `heartbeatTimeoutSeconds`: runner liveness window. `activityTimeoutSeconds`: optional output-silence deadline; set 0 for legitimately quiet tasks. New Codex tasks with `goalMonitoring=true` and no explicit `progressFile` get a unique task-local milestone file and ten-minute progress window on submission. Generic commands must supply their own progress source. Progress is worker-reported, not independently verified completion.
- `hooks`: opt-in callback definitions with event names, exact argv, phases, timeouts, intervals, invocation limits and fail/continue policy. Read [hooks](hooks.md) when configuring these; native Codex callbacks need normal trust review.
- `networkAccess`: false by default. Explicitly authorize Codex worker/repair networking only within the user's task scope (also available as template flag `--network-access`). The supervisor stays read-only.
- `recovery`: supervised/restart/notify. `maxRetries`: bounded worker retries. `backoffSeconds`: delay between retries.
- `supervisorModel`, `supervisorEffort`, `supervisorTimeoutSeconds`, `maxSupervisorCalls`: bounded read-only diagnosis.
- `allowRepair`, `repairTimeoutSeconds`: authorize a separate bounded workspace-write repair within the objective before retrying and validating.

Choose deadlines appropriate to the work. Do not replace unknown acceptance checks with a command that always exits zero. For shell syntax, use an explicit shell argv; AtSys does not implicitly parse shell strings. Keep credentials out of config arguments and output. Existing Codex authentication is reused by its CLI.

Submit: `atsys task submit --config .atsys/tasks/task.json`.
Inspect: `atsys task list`, `atsys task show <id>`, `atsys service status`.
Setup pilot: `atsys doctor --project /repo` or `atsys doctor --config <file>`; init and worker launch also run the doctor. Only AtSys-owned directories are auto-created, never executables, credentials or user configuration.
Dashboard: `atsys ui` starts/opens the packaged web UI; `--no-open` prints its URL without opening a browser.

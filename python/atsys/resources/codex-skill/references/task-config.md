# Installed task configuration

`atsys task template --objective "..." --output .atsys/tasks/task.json` writes a configuration for the current directory without starting work. Add `--project /repo` for another root, `--allow-repair` when authorized, and `--force` only to replace a known task configuration intentionally. `atsys task schema` prints the authoritative JSON schema from the installed package.

The JSON fields include:
- `name`, `objective`, `cwd`, `plan`: task identity, repository, instructions and acceptance criteria.
- `worker`: `codex` or `command`. `model` may be empty to use native Codex configuration. `reasoningEffort`: low/medium/high/xhigh.
- `argv`: exact command arguments for command workers. `resumeArgv`: optional retry-safe checkpoint command; empty reuses the original command.
- `validator`: prefer `command`; `validationArgv` is a nonempty argv array, e.g. `["npm","test"]` or `["python","-m","pytest","tests/test_feature.py"]`. `validationTimeoutSeconds` bounds the separate check. `exit-code` is available when it actually establishes success.
- `requiredArtifacts`: optional relative file paths whose presence/content digests should be recorded.
- `timeoutSeconds`, `taskTimeoutSeconds`: worker-attempt and total-task deadlines.
- `heartbeatTimeoutSeconds`: runner liveness window. `activityTimeoutSeconds`: optional output-silence deadline; set 0 for legitimately quiet tasks. `progressFile` and `progressTimeoutSeconds` are optional application progress signals, not requirements for coding work.
- `recovery`: supervised/restart/notify. `maxRetries`: bounded worker retries. `backoffSeconds`: delay between retries.
- `supervisorModel`, `supervisorEffort`, `supervisorTimeoutSeconds`, `maxSupervisorCalls`: bounded read-only diagnosis.
- `allowRepair`, `repairTimeoutSeconds`: authorize a separate bounded workspace-write repair within the objective before retrying and validating.

Choose deadlines appropriate to the work. Do not replace unknown acceptance checks with a command that always exits zero. For shell syntax, use an explicit shell argv; AtSys does not implicitly parse shell strings. Keep credentials out of config arguments and output. Existing Codex authentication is reused by its CLI.

Submit: `atsys task submit --config .atsys/tasks/task.json`.
Inspect: `atsys task list`, `atsys task show <id>`, `atsys service status`.
Dashboard: `atsys ui` starts/opens the packaged web UI; `--no-open` prints its URL without opening a browser.

# Installed task configuration

`atsys task template --objective "..." --output .atsys/tasks/task.json` writes a configuration for the current directory without starting work. Add `--project /repo` for another root, `--allow-repair` when authorized, and `--force` only to replace a known task configuration intentionally. `atsys task schema` prints the authoritative JSON schema from the installed package.

The JSON fields include:
- `name`, `objective`, `cwd`, `plan`: task identity, repository, instructions and acceptance criteria.
- `worker`: `codex`, `copilot`, `claude` or `command`. `model` may be empty to use native Codex configuration. `reasoningEffort`: low/medium/high/xhigh.
- `argv`: exact command arguments for command workers. `resumeArgv`: optional retry-safe checkpoint command; empty reuses the original command.
- `validator`: prefer `command`; `validationArgv` is a nonempty argv array, e.g. `["npm","test"]` or `["python","-m","pytest","tests/test_feature.py"]`. `validationTimeoutSeconds` bounds the separate check. `exit-code` is available when it actually establishes success.
- `requiredArtifacts`: optional relative file paths whose presence/content digests should be recorded.
- `timeoutSeconds`, `taskTimeoutSeconds`: worker-attempt and total-task deadlines.
- `heartbeatTimeoutSeconds`: runner liveness window. `activityTimeoutSeconds`: optional output-silence deadline; set 0 for legitimately quiet tasks. New agent tasks with `goalMonitoring=true` and no explicit `progressFile` get a unique task-local milestone file and ten-minute progress window on submission. Generic commands must supply their own progress source. Progress is worker-reported, not independently verified completion.
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

Goal workflow v1: goalContract is optional for legacy configs. New templates include an incomplete contract. Fill successCriteria and deliverables (nonempty lists), constraints, assumptions, unresolvedDecisions (must be empty at launch), unique ordered stages, planSource, observers ({signal: heartbeat|progress|activity|validator|hook, rationale, cadenceSeconds, optional hookId}), recoveryScope, escalationConditions and budget. Include a validator observer and rationale for every configured hook. Progress observer cadence controls goal-check event frequency; heartbeat deadlines, progress/activity stall windows and hook intervals retain separate configured enforcement. Cadence does not trigger a provider call.

Optional outcomeFile points to workspace JSON: `{version:1,summary,results:[{name,status:"passed"|"failed"|"partial"|"unknown",detail,evidence:[]}],limitations:[]}`. Limits: 64KB, 50 results, 30 limitations; no arbitrary keys, outside-workspace or credential paths. outcomeRequired:true validates the schema and records a digest with declared validation; missing/invalid/tampered outcome cannot complete. Content remains worker-reported even when linked to validator evidence. The validator must implement actual semantic acceptance.

Read/verify report: `atsys task report ID [--json]`. Explicit legacy attachment: `atsys task report ID --generate [--outcome-file relative.json]`. Durable storage: operations SQLite plus reports/<sha256>.json in the selected control-plane directory. Generation is idempotent for the same terminal transition and attachment source; history survives retries. Report access/attachment never starts a worker or service.

Outcome JSON may also carry optional metrics ({name,value:number|null,unit}, max 30) and costs ({amount:number|null,currency,source,kind:reported|estimated,evidence:[]}, max 10). These stay explicitly worker-reported/estimated, including unknown values; they never supply authoritative AtSys cost telemetry or silently imply zero. Partial totals and passing counts must be separate named metrics.

Optional supervisorProvider and repairProvider select coding agents independently. Omitted roles inherit the agent worker (Codex for command workers); repair inherits supervisor. repairModel/repairEffort inherit supervisor settings when blank/omitted. Copilot/Claude shell tools require trustedLocalExecution:true (--trusted-local-execution in templates) within authorized local coding scope; do not equate their permissions or networkAccess flag with Codex OS sandbox containment. Use atsys providers for capabilities and executable checks.

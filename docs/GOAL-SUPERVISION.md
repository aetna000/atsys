# Goal-oriented execution

AtSys pursues an objective through a worker, deterministic observer, read-only
supervisor, optional bounded repair and independent acceptance. It does not guarantee
that any arbitrary goal can succeed. It guarantees bounded attempts, explicit outcomes
and evidence-based completion—not indefinite retries or success from narration.

## Setup doctor

`atsys init` runs the setup doctor before attaching a project. Run it again with:

```sh
atsys doctor --project /path/to/repo
atsys doctor --config .atsys/tasks/my-task.json
```

Before every worker attempt, AtSys also records a `setup.checked` receipt. Checks cover
configuration, writable workspace, 64 MiB minimum setup reserve, a private write/read/delete
pilot and required executables on the service PATH. Missing `.atsys` storage is created
automatically. The probe removes only its own temporary directory. It refuses an `.atsys`
symlink outside the workspace, never starts the workload, and never checks or logs credentials.
Workload-specific data, disk and service requirements still need task-specific checks.
Malformed configuration is rejected with an actionable error; the doctor does not invent
a validator, download executables, delete data, change permissions or widen authority.

## Progress versus liveness

New Codex tasks get a unique `.atsys/progress/<task-id>.json` and ten-minute stall window
unless explicit progress settings are supplied or `goalMonitoring=false`. The worker is
instructed to report meaningful setup/task milestones using `completed`, `total` and
`checkpoint`. Keep a fixed total within each attempt. A timestamp-only change, counter
regression, moving total or previously seen signal does not refresh progress. A new
checkpoint is still worker-reported evidence, not independently verified success.

The observer records `goal.checked` at most once per minute while a worker is active.
The dashboard shows that receipt, reported progress and configured monitoring. Heartbeat
proves liveness, process output proves activity, milestones report progress; only the
validator proves completion. Missing telemetry reaches its stall deadline too. Generic
commands must explicitly supply a progress source; AtSys cannot infer their units of work.

## Permissions and recovery

Network access is off by default. Authorize it explicitly using `networkAccess=true`
or `atsys task template --network-access`. Worker and authorized repair then receive
workspace-write networking; the supervisor remains read-only. This does not authorize
extra spending, external writes, secret access or changes outside the task's scope.

Supervisors receive the complete plan, worker kind, acceptance contract, permissions and
remaining attempt/call limits. Empty argv is valid for an objective-driven Codex worker.
Recovery instructions reach the next worker, which must reconcile uncertain external
effects before any replay. Explicit operator retry does not reinterpret an interrupted
old worker as a new incident. Cleanup ownership is still required.

For escalation the supervisor supplies a typed blocker with evidence references,
attempted remedies and the exact human-only resolution. Unsupported escalation gets
one additional diagnosis when the configured call budget permits, never a blind workload
restart. Specific authorization, unavailable data/services, unsafe unknown outcomes and
exhausted budgets remain legitimate blockers. Reports are model-proposed evidence, not
an independently proven explanation. Retry, diagnostic and task deadlines are enforced.

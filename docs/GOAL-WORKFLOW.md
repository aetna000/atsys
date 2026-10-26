# Goal workflow

AtSys manages a general goal through conversational intake, an explicit plan, observed execution, bounded recovery, declared validation and a durable terminal report. No domain or benchmark policy is embedded in this workflow. It makes no additional model/API call to generate a report.

## Intake and planning

The packaged Codex skill (`python/atsys/resources/codex-skill`) inspects the request and relevant project evidence to extract the goal, deliverables, success criteria, constraints and assumptions. It asks only material unanswered questions and continues independent work while waiting. Scope, consequential external/destructive actions and needed budget decisions must be resolved before dependent execution. Existing task authority is preserved. Managed workers never submit nested tasks.

`atsys task template --objective "..." --project /repo --output .atsys/tasks/goal.json` produces an intentionally incomplete contract. Fill `plan`, `validationArgv` and `goalContract` before submitting. The optional version 1 contract contains:

- `successCriteria`, `deliverables`: nonempty lists describing concrete acceptance and output.
- `constraints`, `assumptions`, `unresolvedDecisions`: lists; material unresolved decisions block submission.
- `stages`: unique ordered names; `planSource` explains their origin. There is no default denominator or fixed stage count.
- `observers`: `{signal, cadenceSeconds, rationale, hookId?}`. Signals are heartbeat, progress, activity, validator and hook. Include a validator rationale. Every configured hook needs a matching hook observer and rationale; references to missing hooks are rejected.
- `recoveryScope`, `escalationConditions`, `budget`: explicit bounds and limitations. These descriptions supplement the existing deterministic retry, repair, network and deadline fields; prose cannot expand authority.

The skill supplies conversational judgment. The service enforces schema completeness, unresolved-decision guards, plan presence, observer/source linkage and hook rationale where machine-verifiable. It cannot determine whether a human's criteria are semantically sufficient. Old operator-supplied contracts without `goalContract` remain valid; removing a contract deliberately uses that legacy path, not a claim of qualified intake.

Progress observers use a progress file or hook. Contract progress must use the declared total, stages and plan source. Prior valid worker progress is retained across retries; it cannot regress or change its denominator. Checkpoint changes can convey new evidence; repeated identical data, heartbeat and metadata alone do not establish progress. Goal-check events use the progress observer's cadence (60 seconds for legacy tasks). This cadence does not create a provider call. Heartbeat deadlines, progress/activity stall windows and bounded hook intervals retain their existing separate enforcement. The observer inspects, the supervisor proposes, and deterministic policy alone authorizes bounded retries or separate workspace repair.

## Structured outcomes

Set `outcomeFile` to a relative workspace JSON file. Set `outcomeRequired: true` when its presence, schema and content digest must participate in acceptance. The existing declared validator still decides actual acceptance. Required outcomes are parsed during final validation and included in its artifact digests; missing, invalid or changed content prevents completion. Ordinary `requiredArtifacts` continue to be checked and hashed.

```json
{
  "version": 1,
  "summary": "Processing concluded with a partial domain failure",
  "results": [
    {"name": "Item A", "status": "passed", "detail": "Check passed", "evidence": ["output/a.txt"]},
    {"name": "Item B", "status": "failed", "detail": "Semantic check failed", "evidence": []}
  ],
  "limitations": ["Item B remains unresolved"],
  "metrics": [{"name": "processed", "value": 2, "unit": "items"}],
  "costs": [{"amount": null, "currency": "USD", "source": "No provider receipt", "kind": "reported", "evidence": []}]
}
```

`metrics` and `costs` are optional. Result status is passed/failed/partial/unknown. Null metrics and costs remain unknown, never zero. Counts of completed work and passing work must be distinct named metrics. All enrichment remains worker-reported or worker-estimated. A matching validator artifact digest links exact content to a receipt; it does not independently verify every claim, metric, cost or referenced file. Evidence strings are references, not paths that AtSys opens automatically.

Input is limited to 64,000 bytes, 50 result entries, 30 limitations, 30 metrics and 10 cost entries; text and reference lengths are bounded and arbitrary fields are rejected. Reads require a regular workspace-contained file, reject private credential filenames and resolved credential paths, and check symlink resolution. Common secret forms are redacted recursively; control characters are removed. This is no license to include secrets: arbitrary unlabeled sensitive prose cannot be reliably detected. Do not put credentials in task or outcome data.

## Terminal reporting and access

OperationsStore detects terminal transitions to completed, needs_attention or stopped, including changes made outside the watchdog. It creates a readable Markdown report embedded in an immutable JSON envelope under `ATSYS_DATA_DIR/reports/<sha256>.json`, fsyncs it, and indexes the complete snapshot in operations SQLite in the same logical transition. The digest covers the JSON payload excluding its id/digest/path envelope; CLI/API verify the file against both digest and indexed snapshot. Report generation and verification are local and deterministic. Generation time is the terminal event time; repeated generation for the same terminal identity/source returns the existing verified report. No original attempt, validation receipt or execution configuration is rewritten. Retry and later terminal transitions preserve earlier report history.

Reports include goal, criteria, constraints, attempts, repair results, reported progress, hook/cleanup state, validation receipts and artifact digests, partial domain results, limitations, unknown/available costs with provenance, and next action. Dispositions are success, blocked, stopped and failure; existing service status needs_attention remains compatible. Success means declared workflow acceptance, never universal domain success. Live/unknown cleanup remains visible even if a blocker is terminal. The exit-code validator retains its explicit historical semantics; choose a command validator when exit zero alone is insufficient.

Failure to write or verify a newly generated report persists `reportError` and a `report.failed` event. A proposed completed task becomes needs_attention; receipts are retained and completion is not claimed. Fix storage/evidence and explicitly regenerate a blocked/retrospective report. This does not silently restore completed status or reauthorize work. Invalid optional enrichment yields a report with an unknown outcome and a limitation. Optional enrichment is not acceptance evidence unless the declared validator recorded its digest.

```sh
atsys task status TASK_ID --json
atsys task report TASK_ID
atsys task report TASK_ID --json
atsys task logs TASK_ID
```

The dashboard has a goal contract panel, actual stages/source, observer and recovery context, and a persistent report panel with digest and storage location. Readable logs retain the terminal report. Node and packaged Python terminal views link to it. API: `GET /api/tasks/:id/report` reads/verifies the latest report; `POST /api/tasks/:id/report` explicitly attaches a retrospective report with optional `{ "outcomeFile": "relative.json" }`. `/api/operations` retains indexed report history. Files and SQLite survive browser/context loss. The report panel shows stored content; CLI or the report endpoint performs file-integrity verification.

## Legacy/pilot retrospective attachment — no rerun

Old configurations and completed tasks remain readable. They are not automatically backfilled merely by reading state or restarting the daemon. Root must select the exact existing task ID from task history; no benchmark evidence or frozen run configuration needs to be changed. The following source CLI commands work before installed rollout and do not start a service, worker, retry or validator:

```sh
cd /Users/javadtaghia/gitlab/atsys
export ATSYS_DATA_DIR="/Users/javadtaghia/.local/share/atsys"
: "${LEGACY_PILOT_TASK_ID:?Set the exact existing terminal task ID selected by root}"
node --import tsx server/cli.ts task report "$LEGACY_PILOT_TASK_ID" --generate --json
node --import tsx server/cli.ts task report "$LEGACY_PILOT_TASK_ID"
```

For generic enrichment, root may prepare a separate outcome-v1 file inside the original task cwd, derived from authorized evidence, preserving failures/unknown values. Do not edit the original pilot settings or receipts. Then attach it explicitly:

```sh
: "${LEGACY_OUTCOME_RELATIVE_PATH:?Set an existing outcome-v1 path relative to the original task cwd}"
node --import tsx server/cli.ts task report "$LEGACY_PILOT_TASK_ID" --generate --outcome-file "$LEGACY_OUTCOME_RELATIVE_PATH" --json
```

After rollout the identical commands are `atsys task report ...`. Attachments are labeled retrospective. Original validation is reported as historical evidence; a new attachment is not retroactively validated. The same terminal identity/source returns its existing attachment, even if that source subsequently changes; retain that history and use a separate source path for a deliberately revised attachment. Integrity failure returns an error rather than overwriting an existing report. A missing file can be restored byte-for-byte from its indexed snapshot after root verifies the snapshot digest; do not recompute receipts.

## Root-owned safe runtime rollout

None of these rollout actions were executed by the implementation worker. Perform them only after independent acceptance, in a maintenance window after **all** tasks (including this managed implementation task), callbacks and deliveries have settled. Keep the installed Python environment and data directory stable. Do not use `atsys service uninstall` to stop for upgrade: it deliberately starts a detached daemon.

1. Run the independent gates below in an unrestricted operator session. Build the candidate without publishing, and select the exact local wheel:

```sh
cd /Users/javadtaghia/gitlab/atsys
npm test
npm run typecheck
npm run build
ATSYS_E2E_PORT=4358 npx playwright test tests/e2e/tasks.spec.ts --grep 'goal workflow'
npm run build:python
python -m build --no-isolation --wheel --outdir .atsys/goal-workflow-wheel
export ATSYS_DATA_DIR="/Users/javadtaghia/.local/share/atsys"
: "${ATSYS_CANDIDATE_WHEEL:?Set the absolute path to the independently accepted wheel}"
: "${ATSYS_INSTALL_PYTHON:?Set the absolute Python executable owning the current atsys installation}"
```

2. Inspect `atsys service status` and close dashboard clients/submission sources. The following root-run maintenance command refuses active/unclean work or pending notifications, verifies PID identity before signaling, stops the existing service/API, waits for exit, and makes a consistent SQLite backup. It does not stop tasks to make a window artificially quiescent. A refusal requires inspection, not bypassing the guard:

```sh
node --import tsx --input-type=module <<'JS'
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {OperationsStore} from './server/operations/store.ts';
import {serviceStatus} from './server/operations/service.ts';
const dir = resolve(process.env.ATSYS_DATA_DIR);
if (!existsSync(join(dir, 'operations.sqlite'))) throw Error('Expected existing control plane');
const store = new OperationsStore(dir);
const s = store.read();
if (s.tasks.some(t => !['completed','stopped','needs_attention'].includes(t.status) || t.pauseState ||
    t.attempts.some(a => ['starting','running'].includes(a.status) || (a.pid && !a.cleanupConfirmed)) ||
    t.hookRuns?.some(h => ['queued','running'].includes(h.status) || (h.pid && !h.cleanupConfirmed))) ||
    s.deliveries.some(d => ['pending','sending'].includes(d.status))) throw Error('Not quiescent; preserve runtime');
const service = serviceStatus(dir);
const uiPath = join(dir, 'dashboard.json');
const ui = existsSync(uiPath) ? JSON.parse(readFileSync(uiPath, 'utf8')) : null;
const candidates = [{pid:s.daemon?.pid, role:'daemon'}, {pid:ui?.pid, role:'index'}].filter(x => x.pid);
function live(pid) { try { process.kill(pid, 0); return true; } catch(e) { if(e.code === 'ESRCH') return false; throw e; } }
function assertIdentity(c) {
  if (!live(c.pid)) return;
  const cmd = execFileSync('ps', ['-p', String(c.pid), '-o', 'command='], {encoding:'utf8'});
  if (!cmd.includes(`/${c.role}.mjs`) && !cmd.includes(`/operations/${c.role}.ts`)) throw Error('PID identity mismatch');
  // Installed dashboard has no directory argv: verify its cwd independently.
  if (c.role === 'daemon' && !cmd.includes(dir)) throw Error('Daemon directory mismatch');
  if (c.role === 'index') {
    const cwd = execFileSync('lsof', ['-a','-p',String(c.pid),'-d','cwd','-Fn'], {encoding:'utf8'});
    if (!cwd.split('\n').includes('n' + dir)) throw Error('Dashboard cwd mismatch');
  }
}
for (const c of candidates) assertIdentity(c);
if (service.loaded) execFileSync('launchctl', ['bootout', `gui/${process.getuid()}/${service.label}`]);
for (const c of candidates) if (live(c.pid)) { assertIdentity(c); process.kill(c.pid, 'SIGTERM'); }
for (let i=0; i<100 && candidates.some(c => live(c.pid)); i++) await new Promise(r => setTimeout(r,100));
if (candidates.some(c => live(c.pid))) throw Error('Process exit not confirmed; do not upgrade');
store.close();
const backupDir = resolve('.atsys', 'goal-workflow-backups');
mkdirSync(backupDir, {recursive:true, mode:0o700});
const db = new DatabaseSync(join(dir, 'operations.sqlite'));
db.prepare('VACUUM INTO ?').run(join(backupDir, `operations-${Date.now()}.sqlite`));
db.close();
console.log('Quiescence, owned process exit and SQLite backup confirmed. No task replayed.');
JS
```

3. Only after that succeeds, upgrade the same environment and restart the candidate runtime explicitly. These are root actions, not instructions for this implementation worker:

```sh
"$ATSYS_INSTALL_PYTHON" -m pip install --no-deps --force-reinstall "$ATSYS_CANDIDATE_WHEEL"
atsys service install
atsys service status
atsys ui --no-open
atsys integrate --project /Users/javadtaghia/gitlab/atsys
```

`integrate` updates only unchanged package-managed skill files and refuses local edits. This worker could edit the packaged skill but the sandbox protected `.agents/skills`; synchronize it through this existing integration mechanism after review. Do not overwrite a refusal. Verify the installed schema includes goalContract/outcomeFile/outcomeRequired, compare the installed packaged resources with the accepted candidate, use an isolated local command pilot with a real validator/report digest, and independently check desktop/mobile and legacy attachment behavior. A healthy old daemon or unchanged version string alone does not prove rollout. No release, tag, push or notification is part of this procedure. Linux needs the analogous explicitly owned service-manager maintenance window; the built-in commands above target macOS.

## Verification limits

On this macOS host, the existing Homebrew toolchain was verified as Node v26.5.0 and npm/npx 11.17.0. Select it for each validation process without changing the service or installed runtime:

```sh
PATH=/opt/homebrew/bin:$PATH npm test
PATH=/opt/homebrew/bin:$PATH npm run typecheck
PATH=/opt/homebrew/bin:$PATH npm run build
PATH=/opt/homebrew/bin:$PATH ATSYS_E2E_PORT=4358 npx --no-install playwright test tests/e2e/tasks.spec.ts --grep 'goal workflow'
```

These commands were rerun by the recovery worker: full suite 71/77, all six workflow tests passed, typecheck/build passed, and both browser projects failed during Chromium startup with macOS permission denial. They are worker evidence, not an independent validator receipt. The controller must apply the working PATH to its own validation process; changing a child worker's environment cannot repair its parent. Merely prefixing the wheel's npm bin directory is insufficient on this host: its shell launcher also failed locating `npm-prefix.js`. Do not patch the installed launcher, install packages or restart services to resolve this tool-selection issue. The existing operator acceptance setup note records the controller's separate correction.

Tests use local commands and fake provider CLI responses for separate repair; no external LLM/API. The implementation report records exact gate outcomes. Desktop/mobile test source is present; sandbox denial of Chromium launch is not a UI pass. Semantic sufficiency of user goals/validators, authentic provider cost accounting, arbitrary secret detection and actual installed deployment remain outside deterministic reporting guarantees.

## Scoped runner cleanup repair (2026-10-26)

Active lost-runner cleanup now uses the same bounded two-second reconciliation window as terminal cleanup. A pending cleanup remains pending across changing process snapshots and watchdog takeover; recovery cannot proceed until a fresh cleanup check succeeds. Attempt/task deadlines, retry budgets and ownership fencing still apply. This addresses the immediate escalation between an initial gone observation and an unsuccessful second identity check. The historical validator did not retain that second observation, so its exact OS transition cannot be reconstructed.

Process inspection distinguishes owned, gone, foreign and unknown. An inspection/probe error or an exiting/empty-command snapshot never authorizes a signal. Each cleanup obtains a fresh observation; it never reuses an earlier gone observation to signal a PID. Bounded `cleanupDiagnostic` values and `cleanup.pending`/`cleanup.confirmed` events retain only classification and allowlisted error codes, separating inspection uncertainty from a failed signal without retaining process commands or raw errors. Unresolved cleanup escalates after two seconds and blocks replay.

Three deterministic regression tests cover the observation race, foreign-process protection, reconciliation across takeover and distinct signal failures. The strengthened real-process takeover test waits for workload output before killing each runner, confirms cleanup before its one retry, checks budget exhaustion after the second kill, and verifies an unrelated live process survives. The final focused run passes all four checks. The final full suite is 74/80, with all six goal-workflow tests and all four repair checks passing; six existing process-control checks fail under denied process inspection (the zombie test reports `spawnSync ps EPERM`). Typecheck and build pass. Required desktop/mobile checks again fail during Chromium startup with macOS permission denial (1100); no UI pass or independent acceptance is claimed. Exact log locations are recorded in the implementation report and configured progress file. Progress remains 4/6 and T005/T006 remain open. No installed rollout or controller validation was performed.

## Final worker gate evidence (2026-10-26)

The final managed worker reran the documented commands with the existing Homebrew toolchain selected through a process-local PATH. Full suite: 74/80, with all six goal-workflow tests and four cleanup/recovery checks passing; six process-control checks remain failing in this sandbox, including explicit `ps EPERM`. Typecheck/build and five Python rendering checks passed. Desktop/mobile each failed before the test body because Chromium Mach-port bootstrap was denied (1100). Fresh logs are `.atsys/progress/goal-workflow-final-worker-{tests,typecheck,build,e2e,python}.log`. Historical evidence is retained in the implementation report. T005/T006 remain open, progress stays 4/6, and controller acceptance plus root-owned rollout remain pending. No ownership check was weakened to obtain a pass.

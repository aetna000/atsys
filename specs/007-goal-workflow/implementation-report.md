# Goal workflow implementation report

Date: 2026-10-26. Source implementation is ready for independent review. This is not an installed rollout, live deployment or acceptance receipt. T001–T004 are implemented; T005 has executable command coverage and authored desktop/mobile coverage, but browser execution remains unverified in this sandbox. T006 independent acceptance remains open. Reported implementation progress stays at 4/6 rather than marking those gates complete.

## Behavior delivered

- A backward-compatible, optional versioned goal contract records extracted criteria/deliverables, constraints, assumptions, material unresolved decisions, ordered stages/source, observation rationale/cadence, recovery scope, escalation and budget limitations. Deterministic submission/config guards reject unresolved material questions, missing execution plans, missing validator rationale, unconfigured signals and hooks without a matching rationale. New Python templates deliberately require completion; conversational extraction and concise clarification are taught by the packaged skill. Machine validation does not claim to understand semantic adequacy.
- Existing daemon/runner/validator/recovery architecture remains in charge. Progress files and hooks use contract stages/source; retries retain valid progress. Observer cadence is documented and enforced for progress checks, with independent existing heartbeat/stall/hook/attempt/lifetime limits. Supervisors remain read-only and proposal-only; repair remains separately policy-authorized and bounded. Empty Codex argv/resumeArgv remain valid. No new task, unattended workload or control policy was introduced.
- Every newly persisted terminal transition automatically attempts a deterministic local report: completed (workflow acceptance), needs_attention (failure/blocker) and stopped. Reports retain actual attempts, recovery, progress, hooks and cleanup uncertainty, acceptance receipts and digests, domain failures, costs/unknown values and next action. SQLite stores the complete indexed snapshot; an immutable digest-addressed JSON file stores its readable report. Reads through CLI/API verify identity/digest/file content. History survives retries. Legacy records are not silently backfilled.
- Generic outcome-v1 ingestion supports bounded result records, optional named metrics and costs, references and limitations. Data is validated/redacted, remains worker-reported/estimated, and distinguishes processed work from passing results. A matching validator artifact digest links content, not independent semantic verification of every claim. Required missing/malformed/changed outcomes cannot complete. Optional unavailable outcomes yield an explicit unknown/limitation. No domain-specific schema, reroll or automatic new scope was added.
- Report generation/verification failure is durable and visible as reportError/report.failed; completion is fenced to needs_attention. A pending completion delivery is withheld locally on report failure, preserving its failed receipt. No external delivery was invoked during this implementation. Storage failure is not hidden behind worker exit zero.
- Goal/criteria, stages, observer context, recovery and durable reports are available in the dashboard, Node CLI and Python terminal. `task report` reads/verifies reports; `--generate [--outcome-file relative.json]` explicitly attaches retrospective content without restarting work, modifying task config or rewriting original receipts.

Primary modules: `server/operations/goal.ts`, `reports.ts`, the existing store/runner/watchdog/hook paths, `shared/operations.ts`, `shared/task-presentation.ts`, CLI/API and Tasks UI. Packaged skill, templates/schema and Python terminal/acceptance fixtures were updated. Existing readable-pilot-progress changes in shared presentation, its tests, E2E and specs/005 were preserved. No private pilot evidence or run settings were inspected or changed.

## Evidence and gates

| Check | Observed result |
| --- | --- |
| `node --import tsx --test tests/goal-workflow.test.ts` | 6 passed. Real commands/validator processes, partial domain failure, redaction/unknown metrics/costs, required evidence, tamper detection, SQLite reopen, digest/idempotence, CLI access, bounded retry, separate policy-authorized repair, stop/blocker and report-storage failure. No model/API calls. |
| `npm test` | 77 tests: 71 passed, 6 failed in the sandbox. Required gate is not passed. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed; production assets built locally. No installed runtime changed. |
| `ATSYS_E2E_PORT=4358 npx playwright test tests/e2e/tasks.spec.ts --grep 'goal workflow'` | Required desktop/mobile test cases selected; both failed before test execution because Chromium bootstrap_check_in/MachPortRendezvousServer was denied (1100). UI acceptance remains unverified. Test uses isolated port/state and real command/validator/report API evidence; checks goal/stages, persisted report after reload, partial failure and mobile overflow. |
| `PYTHONPATH=python python3 -m unittest discover -s tests/packaging -p test_terminal.py -k TerminalRenderingTests` | 5 passed. |
| Skill creator `quick_validate.py python/atsys/resources/codex-skill` | Passed (`Skill is valid!`). |
| `python3 -m py_compile` for changed Python CLI/terminal and packaging fixtures | Passed. |
| `git diff --check` | Passed. |

Full-suite failures concern hook takeover/stop, local pause/stop/callback pause, and zombie ownership inspection. The explicit process test returns `spawnSync ps EPERM`; pause/cleanup tests report that ownership cannot be verified. The sandbox also denies direct `ps`. These ownership checks were preserved, with no test skips or policy weakening. Root must rerun independently with process introspection available; this report does not claim that suite passes outside the sandbox.

An additional full Python terminal test attempt encountered the old prebuilt repository runtime rejecting goalContract. The source template had been updated while the bundled runtime had deliberately not been rebuilt/installed. Packaging fixtures now complete new contracts; packaging/PTY acceptance must run against root's freshly built candidate. Five pure rendering tests pass independently. This is not an installed-package validation claim.

Local evidence logs (ignored task-owned storage) are `.atsys/progress/goal-workflow-{unit-tests,focused-tests,typecheck,build,python-rendering}.log`; the required browser attempt also produced Playwright error contexts/traces in `test-results`. The progress file is `.atsys/progress/goal-workflow-20261026.json`; its six ordered stages derive from spec tasks T001–T006, not benchmark totals or worker pass counts.

### Bounded recovery verification

The recovery worker inspected the existing source, project brief, constitution, active feature and six-stage plan without replacing implementation or pilot edits. No substantive code failure was established that justified weakening process ownership checks or modifying policy. Existing `/opt/homebrew/bin` tools (Node v26.5.0; npm/npx 11.17.0) ran the four required worker checks with a process-local PATH. The fresh full-suite result is 77 tests, 71 passed, six failed, zero skipped; all six goal-workflow tests passed within that run. Typecheck and production build passed. Desktop/mobile each failed before executing the test body because Chromium's Mach-port registration was denied (1100). Full-suite failures remain the same six process-control scenarios, including explicit `spawnSync ps EPERM`.

Fresh logs: `.atsys/progress/goal-workflow-recovery-{tests,typecheck,build,e2e}.log`. The docs now contain exact existing-toolchain commands. The suggested wheel-first PATH was also tried locally and failed before testing with a missing `npm-prefix.js`; direct Homebrew selection resolved npm setup without installation or installed-runtime changes. This does not alter the controller's historical validator receipt or create a new independent attempt. The operator-owned `operator-acceptance-setup.md` already records a separate parent-environment correction and was preserved.

T005/T006 and reported progress remain incomplete at 4/6. Root/controller must independently execute the unchanged acceptance checks where process inspection and Chromium startup are permitted. No controller redispatch, service restart, installed-runtime edit, package installation, pilot attachment or rollout was performed by this worker.

## Separate runner cleanup repair evidence (2026-10-26)

The preceding verification attempts are historical and retained. The separately authorized repair addresses a concrete difference between the active and terminal cleanup paths: active cleanup previously escalated immediately if a fresh identity check failed after detecting a dead/stale/overdue runner. Both paths now share bounded two-second reconciliation, with durable pending state across observation changes and watchdog takeover. Recovery remains fenced until fresh cleanup succeeds; deadlines, budgets and ownership guards are preserved. The exact second OS observation from the historical validator remains unavailable, so the original failure cannot be attributed conclusively to a particular process-table state.

`processes.ts` now distinguishes unknown inspection/probe failures from foreign identity and signal errors. Empty/exiting snapshots and denied inspection are never treated as verified ownership. Cleanup re-inspects before signaling and stores bounded classifications/allowlisted error codes rather than raw errors or process command lines. `cleanup.pending` and `cleanup.confirmed` retain the transition; sustained uncertainty escalates without replay.

Three deterministic tests reproduce gone-to-uncertain observations, subsequent foreign identity, bounded escalation/takeover and distinct signal errors. The existing real takeover test now waits for workload output before each kill and checks an unrelated live process survives both cleanup and bounded recovery. Final focused run: four passed, zero failed/skipped (`.atsys/progress/goal-workflow-repair-focused-final.log`). Typecheck passes (`goal-workflow-repair-typecheck-final.log`); build passes (`goal-workflow-repair-build.log`). Both browser projects again fail before test-body execution with Chromium bootstrap permission denial (1100), recorded in `goal-workflow-repair-e2e.log`. All logs are under `.atsys/progress/`.

During the first repair full run, a nested mock in the new regression harness leaked a scripted snapshot into the zombie test. This test-only issue was corrected by using one mock with a scripted snapshot sequence. The full process-file rerun (`goal-workflow-repair-processes.log`) confirms restoration: all three new regressions pass and the original real zombie test reaches `spawnSync ps EPERM`. The original repair log is retained as `goal-workflow-repair-tests.log`; the final full-suite rerun is `goal-workflow-repair-tests-final.log`. No test assertion was removed or skipped and no timeout was extended.

Final `npm test`: 80 tests, 74 passed, six failed, zero cancelled/skipped. All six goal-workflow tests, all three new cleanup regressions and the strengthened real killed-runner takeover passed. The remaining failures are existing hook takeover/stop, local pause/stop/callback pause, and zombie inspection scenarios under denied process inspection; the zombie test explicitly reports `spawnSync ps EPERM`. These are unresolved acceptance failures, not passing checks or proof of a defect outside the sandbox. The final test-harness correction changed only test scripting; the production build had already passed against the final production source, and typecheck was rerun successfully after the correction.

T005/T006 and reported implementation progress remain incomplete at 4/6 pending successful required gates and controller-owned independent acceptance. The unchanged declared validator, its receipt and required-artifact digests remain controller responsibilities. No worker retry, nested task, budget reset, package installation, service restart, installed-runtime edit, external notification or rollout was initiated by this repair worker.

## Safe runtime rollout and legacy attachment

[docs/GOAL-WORKFLOW.md](../../docs/GOAL-WORKFLOW.md) contains the exact root-only macOS maintenance procedure, including refusal of active/unclean tasks, callbacks or pending deliveries; PID/cwd verification; launchd bootout without the service-uninstall auto-start trap; confirmed process exit; SQLite backup; candidate build/install; service/UI restart and integration refresh. Do not run only the install/restart tail while tasks remain active, including this implementation task.

After the independent gates pass and the documented maintenance preflight succeeds, root's exact candidate/runtime commands are:

```sh
cd /Users/javadtaghia/gitlab/atsys
npm run build:python
python -m build --no-isolation --wheel --outdir .atsys/goal-workflow-wheel
: "${ATSYS_CANDIDATE_WHEEL:?Absolute independently accepted wheel path required}"
: "${ATSYS_INSTALL_PYTHON:?Absolute Python executable owning the existing installation required}"
"$ATSYS_INSTALL_PYTHON" -m pip install --no-deps --force-reinstall "$ATSYS_CANDIDATE_WHEEL"
atsys service install
atsys service status
atsys ui --no-open
atsys integrate --project /Users/javadtaghia/gitlab/atsys
```

The packaged skill was changed under `python/atsys/resources/codex-skill`; sandbox rules prevented editing `.agents/skills`. Root's existing hash-aware `integrate` refresh must preserve/refuse locally edited skills. No release, tag, push, service restart or package installation occurred in this worker.

Exact retrospective attachment commands, usable from source before installation without starting any service/workload:

```sh
cd /Users/javadtaghia/gitlab/atsys
export ATSYS_DATA_DIR="/Users/javadtaghia/.local/share/atsys"
: "${LEGACY_PILOT_TASK_ID:?Root must select the exact existing terminal task ID}"
node --import tsx server/cli.ts task report "$LEGACY_PILOT_TASK_ID" --generate --json
node --import tsx server/cli.ts task report "$LEGACY_PILOT_TASK_ID"
# Optional separate outcome-v1 attachment, prepared by root inside the original task cwd:
: "${LEGACY_OUTCOME_RELATIVE_PATH:?Existing relative outcome-v1 path required}"
node --import tsx server/cli.ts task report "$LEGACY_PILOT_TASK_ID" --generate --outcome-file "$LEGACY_OUTCOME_RELATIVE_PATH" --json
```

After rollout replace `node --import tsx server/cli.ts` with `atsys`. Do not rerun the pilot or edit its frozen settings/validation receipts. Reports explicitly label historical/worker-reported evidence and retain domain failures and unknowns.

## Remaining limitations

Independent full-suite and desktop/mobile acceptance, rebuilt-package validation, actual integration synchronization and installed rollout remain root-owned and unverified. Conversational judgment and validator semantics cannot be guaranteed by a JSON schema. Existing direct configs without a goal contract remain deliberately compatible. An exit-code validator still means its declared process check, not universal domain success.

Cost enrichment is worker-reported/estimated, not authoritative provider accounting. Redaction recognizes common secret forms, not arbitrary unlabeled sensitive text. A crash between report-file fsync and SQLite commit can leave an unindexed immutable file; only matching indexed/verified reports establish report identity. Failed generation remains explicit and does not automatically retry work or restore completed status. The dashboard displays the indexed snapshot; CLI/report API verify the file. No live integration health, zero cost, complete provider output or native pause/resume capability is inferred.

## Final managed worker verification (2026-10-26)

The final authorized worker retry inspected the existing implementation and cleanup repair, preserved all prior source/pilot edits, and reran the required gates using the existing toolchain with a process-local `PATH=/opt/homebrew/bin:$PATH`. No additional production change was warranted by the observed failures; process ownership safeguards remain intact.

| Fresh command | Observed result | Local evidence under `.atsys/progress/` |
| --- | --- | --- |
| `npm test` | 80 tests: 74 passed, 6 failed, 0 cancelled/skipped. All six goal-workflow tests and all four cleanup/recovery checks passed. | `goal-workflow-final-worker-tests.log` |
| `npm run typecheck` | Passed (exit 0). | `goal-workflow-final-worker-typecheck.log` |
| `npm run build` | Passed (exit 0). | `goal-workflow-final-worker-build.log` |
| `ATSYS_E2E_PORT=4358 npx playwright test tests/e2e/tasks.spec.ts --grep 'goal workflow'` | Desktop/mobile both failed during Chromium startup: Mach-port bootstrap permission denied (1100). Neither test body ran. | `goal-workflow-final-worker-e2e.log` |
| `PYTHONPATH=python python3 -m unittest discover -s tests/packaging -p test_terminal.py -k TerminalRenderingTests` | 5 passed. | `goal-workflow-final-worker-python.log` |

The six full-suite failures remain hook takeover/stop, local pause/stop/callback pause, and zombie process inspection. The explicit zombie test reports `spawnSync ps EPERM`; the other failures concern unconfirmed ownership/cleanup. These are failed gates in this environment, not waived checks or proof that unrestricted execution passes. No further retry, service restart, package install, acceptance-script change, installed-runtime edit or external-effect replay was initiated. The controller must run the unchanged declared validator and retain its own receipt and required-artifact digests. T005/T006 remain open and implementation progress stays 4/6. Installed rollout remains root-owned.

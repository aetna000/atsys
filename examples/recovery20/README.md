# Controlled 20-task recovery fixture

This is a local SQLite retrieval and supervision test, **not DolphinBench, an AtMem
accuracy comparison, or training data**. Each of twenty queries has a known record ID.
After the fifth result the runner disables its fixture engine and stays alive, emitting
output without advancing progress. AtSys must detect the progress stall, diagnose it,
authorize a separate repair, resume at six and independently validate twenty unique results.

Use a fresh task working directory for each run. Keep these source files outside that
working directory so the workspace-scoped repair cannot edit the runner or validator.
Set command/resume argv to `node /absolute/path/to/runner.mjs`, validator argv to
`node /absolute/path/to/validate.mjs`, progress file `progress.json`, progress window
12 seconds, supervised recovery with two retries and explicit repair permission.

The scoped repair restores `engine.json` to `{"enabled":true}`, runs the runner's
`--preflight` check, and writes `repair-receipt.json` with
`{"action":"restore_engine_config","checked":true}`. It must not change code,
state, progress, journal, SQLite or result records, nor start the workload itself.
The next AtSys worker runs the declared resume command. Completion requires the
independent validator, not the repair worker's success statement.

`scripts/observe-recovery-drill.mjs TASK_ID LABEL` watches the actual dashboard,
captures phase screenshots, and audits task IDs, source hashes, final progress,
repair timing and the worker/supervisor/repair/worker/validator sequence. Evidence
is written under ignored `.atsys/usability-20261024/LABEL`.

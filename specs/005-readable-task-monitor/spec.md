# Readable task monitoring

Operators must understand the current task, reported progress, latest observer check,
supervisor decision and required next action without reading JSON or tool transcripts.
Add compact `task status`, change-only `task watch`, and filtered `task logs`; preserve
existing `task show` JSON and machine-readable submit/stop/retry contracts. `atsys status`
must prefer actual managed tasks over the older simulator. Monitoring is read-only and
never retries/stops execution. Watch exit must not terminate the worker or erase terminal
history. Missing/stale telemetry and setup units must not imply benchmark completion.
The dashboard prioritizes the same summary, preserves worker progress during diagnosis,
and moves verbose plans/tool output behind explicit disclosure controls. Screenshots and
desktop/mobile and narrow-terminal tests assess information hierarchy, not human-study scores.

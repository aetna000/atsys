# Plan

Extend the existing operational service rather than introduce another scheduler.
Use additive configuration defaults with migration through OperationsStore. Share
the structured blocker parser between the provider boundary and deterministic policy.
Record periodic observer reviews without pretending a second agent is always running.
Default Codex goal telemetry is task-unique and bounded; generic commands remain opt-in.
Network stays opt-in; no credential or sandbox-bypass changes. Package refreshed runtime
locally only after gates, then update the existing task with explicit network permission
and real progress telemetry; no published release or old benchmark mutation.

Constitution check: deterministic authorization, bounded diagnosis/repair, independent
acceptance, unknown costs, untrusted worker evidence, preserved user state and no
guarantee of arbitrary task success. No distributed or concurrent supervisor redesign.

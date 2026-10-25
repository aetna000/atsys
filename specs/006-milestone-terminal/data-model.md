# Progress and pause state

Progress optionally declares milestones (unique ordered names) and planSource.
Total must equal the name count; completed is the integer completed prefix.
First declaration fixes names/order/source within an attempt. Legacy reports
remain valid and inherit declared metadata. Regression and changed totals/plans
are rejected. Ingestion records reporter kind/reference independently of rationale.

Task gains pausing/paused/resuming and pauseState(requestedAt, previousStatus,
resumeRequestedAt). Intent precedes signals. pausedMs credits are idempotent.
Attempts/hooks/watchdog advertise pauseProtocol=1. Resume grace and credits are
separate from actual heartbeat/progress timestamps. Legacy runners cannot opt in.
Ownership-checked SIGSTOP/SIGCONT confirms transitions or records a blocker.
Stop bypasses pause, kills owned groups and cancels automatic recovery.

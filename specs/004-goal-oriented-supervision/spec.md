# Goal-oriented bounded supervision

The worker pursues the operator's objective; the observer distinguishes liveness,
activity and reported goal progress; the supervisor diagnoses and proposes recovery.
An ordinary setup failure is work to resolve within the authorized scope, not an
automatic request for human intervention. Completion still requires the independent
validator. AtSys guarantees bounded follow-through and visible outcomes, not that
an arbitrary objective is achievable or that self-reported milestones are correct.

Requirements:
- `init`, explicit `doctor --config`, and each worker launch perform setup checks:
  configuration, workspace access, disk reserve, a private write/read/delete pilot,
  worker/validator/supervisor/resume executable availability. Only missing AtSys-owned
  directories are auto-created; user source, credentials and existing configuration
  are preserved. The pilot never runs the user's workload or probes credentials.
- Supervisor and repair roles receive the current complete plan, worker kind,
  effective permissions, validator, deadlines, and recovery budgets. Empty command
  arrays are valid for Codex workers, not an invalid restart configuration.
- Carry the approved supervisor instructions forward into subsequent workers.
- A human escalation identifies a concrete blocker, evidence, remedies attempted,
  and required resolution. An unsupported escalation receives one bounded diagnostic
  follow-up per incident where budget permits; never silently replay uncertain effects.
- Codex networking is explicit, opt-in and visible, never implicitly widened.
- Codex task creation defaults to a unique task-local progress file with a ten-minute
  stall window unless explicit progress settings are supplied or monitoring is opted out.
  Milestones are worker-reported, not verified completion. Clock-only changes do not count.
- Persist periodic observer reviews showing progress age, activity and heartbeat;
  detect stalls even when a process keeps talking. Display the most recent check.
- Explicit operator retry must start a new worker, not reprocess an interrupted old
  attempt as an unexplained failure. Preserve all history and stop/cleanup safeguards.
- Preserve validator, authority, process ownership, retries, time limits and credentials.

Acceptance: deterministic regression and real-process mock-provider tests cover the
observed failure chain, stall detection, recovery instruction handoff, unsupported
versus concrete escalation, explicit retry, policy denial, and independent validation.
Dashboard desktop/mobile smoke tests expose the effective monitoring and network policy.

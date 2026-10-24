# Task monitoring usability and controlled recovery review

Date: 2026-10-24. Local implementation installed; no new public release was published.

## What was evaluated

Read-only observation of the actual local dashboard at 1440×1050 and 390×844, plus
actual CLI output rendered at 1100×940 for screenshots. Those CLI images are explicitly
labelled rendered command output, not captures of the user's macOS Terminal window.
Narrow terminal fixtures cover widths 40, 60, 88 and 120 and a 24-row compact view.
This is an engineering/heuristic review, not a participant study or a SUS score.

The initial real task inspection returned 219,727 bytes and 903 lines of task/configuration
and nested provider history. The new status snapshot for that same blocked task is
1,690 bytes and 25 lines—about 99% less output, without deleting the underlying evidence.
This measures output size, not a measured reduction in human task time.

## Findings and corrections

| Finding | Correction and verification |
| --- | --- |
| Full JSON obscured status and next action | `task status`, quiet `task watch`, readable `task logs`; raw `task show` retained unchanged |
| Repeated heartbeat output could flood a terminal | Non-TTY watch prints only meaningful changes; test changes heartbeats for multiple polls and verifies one frame |
| Technical plans and nested tool payloads dominated the dashboard | Current-state overview first; configuration, raw output and older events available through disclosures |
| Truncated provider JSON leaked into readable messages | Filter partial/escaped JSON and render structured supervisor decisions as text |
| Direct task links failed under hidden installation directories | Public-filename-relative `sendFile` root; hidden-root regression test and installed-wheel deep-link checks |
| Rapid dashboard restart mistook TIME_WAIT for an occupied port | Listener-compatible port probe; installed same-port restart test |
| Supervisor was labelled standby while actually diagnosing | Phase-aware current activity, supervisor and next-action wording |
| A resumed worker briefly lost its visible saved progress | Retain the last reported checkpoint, label its provenance, and load the resume snapshot without advancing the progress clock |
| First drill ended with stale displayed 19/20 despite twenty validated records | Flush the final progress file on worker exit; regression test and fresh native confirmation drill |

The confirmation screenshots make the state, counter, observer incident, active role and
next action visible together on desktop. Mobile has no horizontal overflow, but detailed
recovery information still needs normal vertical scrolling. Long logs are intentionally
not expanded automatically. Missing telemetry is never converted to a success percentage.

## Native controlled failure test

These runs use twenty deterministic local SQLite retrieval checks. They are **not real
DolphinBench task executions or memory-model accuracy results**. The real DolphinBench
task remains blocked on frozen encrypted snapshot access; its original acceptance and
old 600-run evidence were not replaced or changed to make this drill pass.

The command worker deliberately disables its engine after task five and keeps emitting
activity. A 12-second progress window detects the stall despite liveness. The real native
Codex supervisor diagnoses read-only; deterministic policy authorizes a separate actual
Codex repair invocation. Only fixture engine configuration and its repair receipt may
change. The parent observer never manually fixes or restarts the fixture.

First run: `task-34c6630f-336e-4058-a79c-18a771a7a67f`. It validated twenty results, but
exposed the stale UI phase/counter defects above. Its original evidence was preserved.

Fresh confirmation: `task-e25bead4-5463-487d-8636-7757dc2ca76e`.

| Check | Observed result |
| --- | --- |
| Fault injection | Exactly once, after task 5 |
| Observer detection | 13.004 seconds after injection |
| Read-only diagnosis | 19.498 seconds |
| Authorized repair | 24.196 seconds |
| Total through independent validation | 103.667 seconds |
| Executions | IDs 1–20 exactly once; first five not replayed |
| Final persisted/displayed progress | 20/20 |
| Role sequence | worker → supervisor → repair → worker → validator |
| Acceptance | Independent command passed; three artifact SHA-256 receipts |
| Source integrity | Runner and validator hashes unchanged during the run |

The fixture workload is local CPU/SQLite. Supervisor/repair use the configured native
Codex login; their usage has not been converted into a dollar cost. No benchmark-reader
or judge API calls are part of this fixture.

Local screenshots and raw evidence are retained, not committed, under
`.atsys/usability-20261024/confirmation/`: `fault-at5.png`, `supervisor.png`, `repair.png`,
`resumed.png`, `completed.png`, `observations.json`, `task-evidence.json`, and `audit.json`.
Before/after terminal/dashboard images and metrics are in its parent directory.

## Gates

46 runtime/CLI/API tests, 18 desktop/mobile browser tests, and six clean installed-wheel
checks passed. Type checking, production build, formatting and diff checks passed.
The two native controlled drills are additional evidence beyond mock-provider tests;
they do not establish reliability for arbitrary workloads or substitute for the blocked
DolphinBench accuracy evaluation. The confirmation audit and source digests permit
inspection of this specific run.

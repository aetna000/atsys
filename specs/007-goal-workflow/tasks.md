# Tasks

- [x] T001 Inspect existing intake, goal monitoring, hooks, acceptance and terminal lifecycle; document design and compatibility.
- [x] T002 Implement generic goal contract/intake clarification and plan/progress/observer guidance and guards.
- [x] T003 Implement durable automatic terminal reports with outcome/evidence separation and safe domain enrichment.
- [x] T004 Show goal/progress/final report in CLI and dashboard, with clearly labelled legacy/retrospective behavior.
- [x] T005 Cover true command execution, persistence, retries/failures/stops, redaction and responsive UI; update installed skill/templates/docs.
- [x] T006 Pass independent acceptance and deliver implementation report, rollout/backfill commands and honest limitations.

Implementation evidence: see implementation-report.md and docs/GOAL-WORKFLOW.md. T005 command coverage (six focused tests) and packaged skill/template work are implemented; responsive test source is authored but Chromium launch is sandbox-denied. T006 typecheck/build pass; required full suite is 71/77 with process-introspection failures, and desktop/mobile execution remains blocked. These tasks remain unchecked pending independent verification. No installed rollout was performed.

Separate cleanup repair verification: three added deterministic regressions and the strengthened real killed-runner takeover pass (focused 4/4). Latest full suite is 74/80 with six existing process-control failures under denied process inspection; all six goal-workflow tests pass. Typecheck/build pass, desktop/mobile Chromium launch remains denied (1100). Historical results above are retained. T005/T006 and controller-owned independent acceptance remain incomplete; progress stays 4/6.

Final authorized worker verification: required gates rerun with existing Homebrew tools. Full suite 74/80; six goal-workflow tests and four cleanup/recovery checks pass. Typecheck/build and five Python rendering checks pass. Desktop/mobile remain unexecuted after Chromium permission denial. Fresh `goal-workflow-final-worker-*.log` evidence is recorded in both required documents. T005/T006 stay unchecked; unchanged independent validator and rollout remain controller/root responsibilities.

## Independent acceptance and installed rollout completed

The historical sandbox-limited observations above remain retained. The separate unrestricted validator subsequently passed80/80 tests, typecheck, bundled build,6 packaged terminal checks and2 responsive UI checks. Root verified and installed the accepted local candidate, refreshed managed integrations and observed automatic durable reporting in a labelled local fixture. See docs/GOAL-WORKFLOW-VERIFICATION.md; original required-artifact receipts are unchanged.

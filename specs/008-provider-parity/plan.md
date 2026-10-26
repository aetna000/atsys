# Implementation plan and constitution check

Preserve the 0.3.0b3 goal workflow and unrelated source/runtime state. Add a
provider registry and shared prompt builder around the existing attempt runner.
Keep Codex public exports compatible. Implement Claude stream-json/structured
output and Copilot JSONL/final-message parsing. Role selection never falls back
on provider failure. The existing watchdog/validator owns all terminal states.

Generate Claude settings and Copilot plugin hooks in the private attempt directory.
Extend the native bridge to provider-specific event/output adapters, persisted
identity checks and portable events. Read-only providers expose read/search only;
worker/repair local tools require explicit policy acknowledgment because CLI
permissions differ from Codex's OS sandbox. No credential inspection or policy
mutation in the project. Keep old hooks and settings intact.

Extend UI, doctor, CLI and Python onboarding, then verify actual runner launches
with fake native executables, strict recovery results and separate validation.
Build/test the installed wheel and responsive views. Retain provider limitations
and model/timeout configurations in durable reports and presentation.

Constitution: local-first; deterministic authority; independent evidence;
role/provider separation; unknown costs stay unknown; no external model calls in
tests. No global bypass, hidden privilege elevation, credential copying or fake
provider-native pause/resume. Post-design check uses the same constraints.


Post-implementation constitution check: validators, budgets, hook authorization,
process control and outcome reports remain deterministic and durable. Per-attempt
provider selection is recorded. Native settings/plugins are attempt-local and
managed skills preserve unrelated files and edits. New role/hook configurations
are fenced from legacy watchdogs. Copilot/Claude shell access requires explicit
local-tool permission; the UI, terminal and reports do not claim Codex sandbox
guarantees for them. Capability gaps are rejected/documented. No paid-model,
notification, credential inspection or installed-service replacement was used.

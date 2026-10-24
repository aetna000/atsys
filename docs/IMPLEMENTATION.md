# Implementation report — general coding supervision

Date: 2026-10-24 (Australia/Sydney). This report supersedes the first simulator-only milestone report. The original brief is preserved; the user's clarified intent is the active [operational specification](../specs/002-durable-task-supervision/spec.md).

The 0.3.0b1 candidate adds [lifecycle/native Codex hooks](HOOKS.md) and [operational UI/activity cleanup](../specs/005-operational-ui/spec.md). The product UI now excludes historical sample/unavailable screens; optional AtBot observation is implemented through Pydantic AI. See [candidate verification](releases/v0.3.0b1-verification.json) for current test coverage. Historical milestone details below retain their original scope.

## Delivered operational behavior

- Primary managed-task UI for arbitrary coding objectives, project roots, plans/constraints, command or Codex workers, model/effort settings and independent acceptance checks.
- Durable CLI submission (`run` or `task submit`) and local HTTP submission. Caller/UI/API lifetime does not own execution.
- Detached attempt runners, persisted identities/config snapshots, fenced watchdog ownership, heartbeat and process-loss detection, output inactivity and semantic progress-stall detection, attempt/task deadlines and owned group cleanup.
- Bounded restart/backoff or automatic Codex supervision. Read-only supervisor proposes; deterministic policy authorizes. Optional repair uses a separate workspace-write invocation. Worker retries, supervisor calls and phase deadlines are bounded.
- Generic independent validation commands as separate durable attempts. Required artifacts are presence-checked and content-hashed. Exit-code and specialized benchmark JSON checks remain optional alternatives.
- Current-user macOS LaunchAgent with KeepAlive/login startup, status and uninstall controls. Installed for this checkout's default `.atsys` directory and verified by killing its watchdog during a real task.
- Telegram configuration UI, private token storage, persistent outbox, retry/backoff and delivery outcomes. External delivery is disabled until configured. No real Telegram message was sent during implementation.
- Task wiring, status, attempt selection, redacted output, incidents, policy decisions, evidence and editable configuration in the web UI. Stale API data is explicit. Active attempts preserve their configuration snapshot.
- Spec Kit operational specification, plan, data model, API contract, quickstart, tasks, architecture and reuse assessment.
- Existing Headlamp-based sample console and notices preserved, with sample views separated from real managed tasks.

## Verification

| Check | Evidence |
| --- | --- |
| Backend/domain/API/process/CLI tests | 30 passing tests; temporary workspaces and fake provider/API contracts where appropriate |
| TypeScript and production build | Strict type check and Vite build pass |
| Desktop/mobile browser suite | 18 passing checks, including general coding submission, independent validation, editable configuration and actual recovery drill |
| Workload failure | Deliberate exit failure followed by declared checkpoint retry and independent validation |
| Watchdog ownership | Competing owner denied; stale lease takeover adopts existing runner; old owner fenced |
| Runner death | Owned runner SIGKILL detected, group cleaned, retry bounded and final exhaustion visible |
| Stalls/deadlines | Live but frozen progress, timestamp-only file changes, silent output, hard timeout and explicit stop checked |
| API shutdown | Task completes while HTTP API is shut down; reopening API returns persisted completion |
| Authorization | Repair proposal denied when repair permission is off; config revision conflicts rejected |
| Validation | Generic acceptance failure enters recovery; missing artifacts, unchanged benchmark results and invalid paths fail |
| Telegram | Mocked transient API failure retries and succeeds; token absent from returned state and private file mode checked |
| Real OS recovery | [OS receipt](os-recovery-verification.json): old PID 21967 killed, launchd replacement PID 23507, task recovered and validated |
| Real Codex recovery | [Native receipt](native-codex-verification.json): failed coding test → read-only diagnosis → authorized repair → worker retry → independent validation; original test file unchanged |

The native test used the installed Codex CLI and its existing login in a newly created isolated repository under `.atsys`. It fixed an intentionally incorrect arithmetic function. This is evidence for the end-to-end provider integration on this machine, not a claim about every model/provider or arbitrary coding task correctness. The supervisor/repair transcript remains in the local task record; the checked-in receipt contains only the scoped outcome and policy/validation evidence.

Screenshots are in `docs/screenshots/`; browser HTML reports are generated locally. Tests do not constitute a multi-hour production soak, complete accessibility audit or distributed-system qualification.

## Explicit limits

- Single-user loopback application. No remote authentication/team authorization.
- Built-in OS service installation is macOS only. Local sleep/power loss suspends work and alerts.
- Generic processes are trusted local code; they are not isolated containers. Codex workspace-write permits changes in the selected workspace. Automatic diff review/rollback/worktree isolation is future work.
- Restarts use original/configured resume argv. Arbitrary external side effects are not reconciled automatically; commands must be retry-safe or use application checkpoints.
- Current native adapter is noninteractive Codex exec. Native session continuation, tool approvals/live steering and other providers remain future work.
- Model costs remain unknown; no managed-task dollar budget is enforced. Time, retry and supervisor-call limits are enforced.
- Output/events are bounded, with best-effort redaction. The transactional JSON snapshot is a small local backend, not a production distributed scheduler.
- Generic artifact validation records presence and bytes; semantic correctness/freshness requires an appropriate acceptance command.
- Telegram has contract-tested delivery but no configured live destination in this workspace. Crash ambiguity can duplicate an accepted message.
- Old sample console budgets/roles/costs do not control operational tasks. AtMem/AtFlows/AtBot remain off.

## Reuse decision

Temporal, Windmill and Inngest already implement substantial workflow machinery. This local vertical slice validates AtSys's coding-task and supervision contract. Before expanding into distributed/team execution, reuse a mature orchestration engine rather than extending this embedded scheduler. [Assessment and sources](BUILD-VS-REUSE.md).

# Implementation plan

Use an independent SQLite operations store, preserving existing console history. Persist task definitions, attempts, event receipts, notification outbox, and daemon lease. A detached watchdog schedules independent attempt runners; each runner owns a process group, heartbeats, observes progress, captures redacted output, enforces deadlines and validates completion. A macOS LaunchAgent restarts the watchdog and starts it at login. API/CLI submit intent into the store, never become execution owners.

Codex exec supports JSON events and a schema-constrained final response. Supervisor is read-only; a policy-approved repair launches a separate workspace-write invocation. Restart reuses declared argv/resume argv only. Termination checks process identity before signaling. Recovery is bounded by attempts, supervisor-call limits and task lifetime. Outbox uses retries with backoff and visible terminal delivery failure; Telegram delivery is at-least-once across crashes.

Constitution check: durable deterministic authority; real timestamps and validation; isolated role permissions; no fabricated progress/cost; credentials in private local file excluded from API. Generic workloads remain explicitly trusted local commands. Existing native-adapter roadmap limitation superseded by the user's operational requirement.

References: https://learn.chatgpt.com/docs/non-interactive-mode ; https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex ; https://core.telegram.org/bots/api#sendmessage

General-purpose extension: worker → independent validator → completion is the primary path. Validator failure enters the same incident/supervisor/recovery loop as execution failure. Optional task plans, output inactivity windows, arbitrary validation argv and required artifact lists apply across coding workflows. A benchmark parser is one optional adapter, not the domain model.

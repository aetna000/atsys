# Plan

Read AGENTS.md, constitution, original operational brief and existing specs before implementation. Design generic contracts around existing objective/plan/progress/validator/recovery fields and lifecycle hooks; do not add benchmark-specific authority. Use native coding-agent skill for intent extraction/clarification and deterministic launch/report checks for enforceable guarantees. Preserve backward compatibility and exact original receipts. Keep reports outside transient context and label reported versus verified information.

Implement and verify intake contract; durable progress and observer-plan linkage; deterministic terminal report persistence and domain outcome ingestion; CLI/API/console surfacing; installed skill/template guidance; integration and desktop/mobile verification. No notifications to other people or external paid services. Root owns any later installed-runtime update, after confirming no active tasks will be disturbed.

Constitution check: local-first, explicit authority, evidence before claims, no invented costs, no receipt overwrite, no benchmark rerun. New behavior is generic and testable; final report is a deliverable, not proof of its own success.


Implementation design (T001): Extend optional TaskConfig fields rather than replace the operational service. A versioned goalContract records intake, stages and observer/hook rationale; legacy contracts remain valid. Existing watchdog and separate validator runners retain all execution authority. Capture bounded generic outcome JSON at validation; artifact digests link content, not semantic truth. OperationsStore observes terminal transitions and writes immutable digest-addressed report JSON plus an indexed snapshot in SQLite. Report errors persist visibly and fence completed status. Explicit CLI/API retrospective attachment reads original receipts without rerunning or changing config. Report history survives retries. Dashboard and CLI consume those durable snapshots. No installed runtime or policy changes.

Six implementation stages follow T001–T006: architecture inspection; intake/planning guards; automatic terminal reporting; CLI/dashboard surfaces; command/UI tests and packaged guidance; required gates and handoff. Reported progress is distinct from independent acceptance.

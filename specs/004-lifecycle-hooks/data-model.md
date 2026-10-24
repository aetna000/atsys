# Hook records

`TaskConfig.hooks` defaults to an empty array for existing tasks. Definitions specify ID, events, argv, attempt phases, timeout, tick interval, invocation limit, failure policy and native matcher. Active attempts retain their configuration snapshot.

`HookContext` uses protocol `atsys-hook-v1`, a stable invocation ID, event/time and bounded task/attempt evidence. Optional native context contains Codex event/model/session/turn/tool metadata. `HookResult` permits only message, continue/fail/escalate decision and finite bounded progress.

`ManagedTask.hookRuns` stores context/config snapshots, delivery keys, queued/running/terminal status, lease timestamps, PID, bounded result/error/stderr, applied bit and cleanup receipt. Per-definition counts and delivered-key hashes survive recent receipt pruning. Before-run gate IDs are attached to attempts. Attempt progress keys prevent repeated progress evidence refreshing a stalled task.

The daemon advertises `hookProtocol: 1`; older healthy daemons cannot accept hook tasks. Existing tasks without hooks retain their behavior.

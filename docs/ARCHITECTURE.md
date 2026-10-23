# Architecture

AtSys separates interaction, execution, observation, reasoning, authorization, validation and notification. The operational model is generic coding work; a benchmark is one possible command.

## Process boundaries

1. **CLI / HTTP API / web console** submit and inspect durable intent. Their lifetime does not own a task.
2. **Watchdog daemon** claims the SQLite owner lease, reconciles attempts, applies deadlines and bounded recovery, and services the notification outbox. macOS launchd supervises this daemon independently of the application.
3. **Detached attempt runner** creates an owned process group, starts a command or Codex, records heartbeat/output/progress, and persists terminal evidence. A watchdog restart adopts the same attempt instead of starting a duplicate.
4. **Codex supervisor** is an independently bounded read-only invocation. Its schema-validated output is a proposal. It cannot supply new executable arguments or enlarge policy limits.
5. **Repair worker**, when policy permits it, is a separate Codex invocation with workspace-write. It is followed by the configured task execution and independent acceptance check.
6. **Validator** is its own persisted attempt for arbitrary command checks. The worker's zero exit cannot skip it.

## State and transitions

`shared/operations.ts` defines task configuration, attempts, event receipts, service state, Telegram configuration and deliveries. `server/operations/store.ts` uses SQLite WAL, immediate transactions and a versioned document. Each attempt stores its exact configuration snapshot. Config edits use optimistic revision checks; active attempts retain their snapshot while later attempts and task lifetime use the current policy. Required new fields are merged with defaults for existing operational records.

Typical path: queued → running worker → running validator → completed. Failure opens an observer incident, then notify/needs-attention, retry/backoff, or supervising → proposal → policy → optional repairing → retry. Total task lifetime, worker retry count, supervisor invocation count and phase deadlines bound every automatic cycle. Supervisor failure escalates visibly; it does not silently drop ownership.

The owner token fences old watchdogs at each transaction. Starting attempts are persisted before process launch. A runner can claim only its scheduled attempt, and a lost starting lease is recovered. Each runner owns a POSIX group; cleanup checks the leader command and attempt token before signaling. An unrelated reused PID is never deliberately signaled. Unknown process ownership blocks automatic replay. Workloads that deliberately escape their process group need stronger isolation and are outside the trusted-local-command contract.

## Evidence and observation

Runner heartbeat proves runner liveness only. Optional JSON progress (`completed`, `total`, optional `checkpoint`) advances the progress clock only when those meaningful fields change. Arbitrary timestamp changes do not count. Optional process-output inactivity detects silent coding-agent hangs, separately from progress. Attempt and task deadlines provide an upper bound when no useful telemetry exists.

Output is bounded to 32 KB per attempt, line-buffered and redacted before persistence. Supervisor evidence is bounded again. Files must resolve inside the task workspace; escaping symlinks are rejected. Generic required artifacts are presence-checked and SHA-256 hashed from their actual bytes. The benchmark compatibility adapter additionally checks a fresh JSON result with complete cases and accuracy ≥ 0.80. Independent validation commands define general-purpose acceptance. Checks cannot establish facts beyond what they actually test.

## Codex adapter

`codex exec --json --output-last-message` runs noninteractively using the installed CLI and its existing authentication. Explicit sandbox selection separates read-only diagnosis from workspace-write coding/repair. `--output-schema` constrains supervisor/repair responses, and Zod verifies the final response again. No bypass-sandbox flags are used. Models and reasoning effort are task settings. Native session resume, interactive tool approval hooks, exact provider cost accounting and arbitrary provider adapters remain unimplemented.

See [official noninteractive documentation](https://learn.chatgpt.com/docs/non-interactive-mode) and [OpenAI repair-loop example](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex).

## Service and alerts

The current-user macOS LaunchAgent is named by a hash of the absolute data directory, so isolated workspaces do not collide. It uses the current Node executable, absolute loader/entry paths and explicit PATH. It is KeepAlive and starts at login. Moving the checkout or replacing a versioned Node binary requires reinstalling the service. The UI reports OS installation separately from the actual watchdog heartbeat.

Telegram secrets live outside the state document in a private file. Outbox entries are claimed transactionally, sent with a deadline, and retried with backoff, respecting retry-after. Success and exhausted delivery are visible. There is no exactly-once delivery promise across ambiguous network outcomes. [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage).

## Local security and limits

HTTP binds loopback, checks Host and mutation Origin, requires JSON and caps request size. There is no CORS or remote-user authentication. Generic tasks execute as the local user; Codex sandboxing is delegated to the installed CLI. Redaction is best effort. Task steps must be safe to retry or provide application-owned resume argv. AtSys does not automatically reconcile arbitrary external side effects. Local sleep/power loss prevents execution and alerts until the machine resumes.

This small embedded backend is not a replacement for a production distributed workflow engine. The scheduler/service boundary is intentionally separate from task semantics and UI; see the build-versus-reuse decision.

## Existing sample console

The first milestone's projects/fleet/runs/approvals/costs screens and separate `control-plane.sqlite` remain as explicitly labeled reference workflows. Their sample budgets and role records do not control the operational task service. `server/process-adapter.ts` remains available only for the legacy attached CLI mode. Headlamp attribution and source notices remain intact.

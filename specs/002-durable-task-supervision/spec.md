# Durable task supervision

The operator delegates any coding job and leaves: feature implementation, bug fixing, refactoring, tests, builds, migrations, code review, or an arbitrary local script. The benchmark was an incident motivating this product, not the product domain. AtSys must retain ownership independently of a Codex conversation, terminal, and dashboard. A task records objective, exact execution arguments, completion criteria, progress source, recovery policy, and notification routing. Existing demo screens are secondary examples, not evidence of operational coverage.

## Acceptance scenarios
1. Submit a real task from CLI or web UI; caller exits; execution and observation continue.
2. Kill the API; runner continues. Kill the watchdog; OS service restarts it and adopts the existing attempt without duplicate execution.
3. Workload exits unexpectedly, stalls, times out, or runner dies: persist an incident, stop the owned process group, then apply bounded retry or automatically request Codex supervision.
4. Supervisor receives bounded, redacted evidence and produces a schema-validated proposal. Deterministic policy permits only preconfigured restart or a separately enabled sandboxed Codex repair. Model output cannot replace execution arguments or disable limits.
5. Completion requires the chosen validator; failed recovery ends in visible needs-attention status and a queued notification.
6. Configure Telegram without returning its token to the browser; durable delivery retries and outcomes are visible.
7. UI displays task, worker, observer, supervisor, service heartbeat, actual progress, incidents, attempts, evidence, configuration and audit events. Models, effort, retry limits and timeouts can be edited for future attempts.
8. No project credentials are read or rewritten. No external notifications without configuration. Sample tasks stay distinct from real tasks.

## Boundaries
Single local operator, POSIX process supervision, macOS launchd service. Generic commands are trusted user code, not a sandbox. Codex diagnosis is read-only; repair uses workspace-write. Existing checkpoint-aware argv is configured by the user; AtSys does not invent application resume semantics. Machine power-off/sleep suspends local work; a remote always-on host is required for machine-independent alerts. Telegram outbound only, never authorizes actions.

## General-purpose completion and observation
Codex coding work and explicit local commands share the same task lifecycle. Optional execution plans and constraints guide the worker. A separate validation command (test suite, build, custom assertion) runs as its own durable attempt. Required artifacts are presence-checked and hashed. Exit-code validation remains available when sufficient. Benchmark JSON is an optional compatibility adapter only. Progress signals are optional; output inactivity is separate from verified progress, and neither substitutes for acceptance checks.

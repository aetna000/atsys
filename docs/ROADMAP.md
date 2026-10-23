# Remaining product work

AtSys supervises general coding tasks. The first console milestone and the second operational milestone are documented separately; current implementation is described in [the verification report](IMPLEMENTATION.md).

**Current priority: [testing and qualification](TESTING.md).** Codex plugin packaging and official directory submission are [saved as a deferred TODO](todos/codex-plugin.md).

1. **Reuse a mature orchestration backend for production scope.** Prototype Windmill and Temporal against the same crash/stall/recovery acceptance cases before adding distributed scheduling. See [build versus reuse](BUILD-VS-REUSE.md).
2. **Broader coding-provider support.** Add supported Claude/Copilot/etc. adapters; native resumable sessions, interactive hooks, live steering and normalized usage. Current native execution supports Codex exec plus arbitrary trusted commands.
3. **Stronger execution isolation and recovery.** Per-task worktrees/containers, reviewed diffs/rollback, application-specific side-effect reconciliation and recovery plugins. The current generic command runner is local-user execution, not a sandbox.
4. **Long-duration qualification.** Multi-hour soak tests, machine reboot/sleep/wake tests, disk-full/corruption handling, high-concurrency/resource limits, retention/export and log streaming beyond bounded snapshots. Current failure tests are accelerated and local.
5. **Workflow plans.** Persisted dependency graphs, multiple specialized workers, dynamic task decomposition, approval gates for individual external actions, and reusable coding-task templates. Today one objective can run through Codex or an arbitrary script, with separate supervision and acceptance checks.
6. **Models and money.** Native usage capture, token budgets, enforced monetary budgets and dated pricing provenance. Current time/attempt/call limits are enforced; costs remain unknown.
7. **Companions.** AtMem governed retrieval, AtFlows telemetry and AtBot assistance remain separate opt-in integrations. Their sample UI does not imply a live connector.
8. **Distribution and access.** Linux service installation, authenticated remote access and teams. Version 0.2.0 is published on PyPI with the runtime, dashboard and Codex onboarding skill; see [packaging](PACKAGING.md). Current built-in OS supervision is a per-user macOS LaunchAgent; HTTP is local-only.
9. **Alert operations.** Quiet hours, routing by task/severity, external always-on dead-man monitoring and additional transports. Telegram outbound delivery, durable retries and outcomes exist now; incoming messages cannot authorize actions.

No feature above is claimed complete by the sample console, by a provider executable being on PATH, or by a passing mock-provider contract test.

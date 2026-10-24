# Implementation plan

Add optional hook definitions to task configuration and bounded hook receipts/counters to persisted tasks. Execute hooks in detached, fenced hook runners independent of the watchdog transaction and API. Gate attempt launch on completed before-run/before-validation callbacks. Reconcile running callback processes and terminal receipts in watchdog ticks. Queue observational callbacks on existing lifecycle events; tick callbacks are nonoverlapping and invocation-budgeted.

Use a JSON stdin/stdout protocol with stable invocation IDs, redacted bounded context/output, explicit argv, per-invocation timeouts and fail/continue policy. Claims, heartbeat, result application and process cleanup are persisted. Crash uncertainty is reported rather than claiming exactly-once side effects. Progress is monotonic, task-scoped and cannot replace result validation.

Provide a standard-library Python Hooks/context/result SDK with sync/async decorators and a CLI runner. An optional AtBot command constructs its existing Pydantic AI provider with the explicitly selected configuration/capabilities and requires structured observer results. No new model/tool access is granted by the bridge itself.

Constitution check: local opt-in configuration; existing source and credentials preserved; deterministic authorization and validators remain authoritative; bounded receipts/evidence; provider-independent command protocol; reused dependencies retain notices. Validate execution/recovery boundaries, upgrade compatibility, UI at desktop/mobile sizes, and a clean installed wheel.

Post-design constitution check: native callback definitions preserve unrelated project configuration and require normal Codex trust; no credential/transcript reads or trust bypass. Hook decisions cannot authorize repair or completion. A real installed-wheel Codex test observed model/tool callbacks, denied the forbidden command and independently validated the repaired artifact. AtBot capability tests use the actual published provider with TestModel and are labeled accordingly.

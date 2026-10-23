# Build versus reuse

Assessment date: 2026-10-24. The user's goal is general coding supervision, not a benchmark application and not inventing another generic workflow engine.

| Candidate | Verified existing capability | Fit for AtSys |
| --- | --- | --- |
| [Temporal](https://temporal.io/pages/durable-agent-orchestration-white-paper) | Durable orchestration across crashes, retries and human approval | Strong long-term execution backend; AtSys supplies coding-provider adapters, evidence/acceptance semantics, recovery policies and operator experience |
| [Windmill agents](https://www.windmill.dev/docs/core_concepts/ai_agents) and [workflow retries](https://www.windmill.dev/docs/flows/retries) | Script tools, configurable AI-agent steps, workflow UI and retries | Evaluate first when prioritizing an assembled application over owning a custom UI/runtime |
| [Inngest durable agents](https://www.inngest.com/docs/durable-execution/durable-agents) | Persisted model/tool steps, retries, human waits and execution traces | Alternative durable runtime for code-defined task workflows |
| [Headlamp](https://github.com/kubernetes-sigs/headlamp) | Open-source Kubernetes resource console | UI patterns and adapted component reuse; not a generic job durability backend |

These are documented capabilities, not a claim that any one product has been installed or proved as a turnkey Codex supervisor here. No exhaustive market survey or deployment comparison was performed.

Decision for this increment: finish a small, working local vertical slice with SQLite and OS supervision to validate the task/worker/observer/supervisor/validator contract. Keep the operational modules separate from the UI and the old sample console. Do not expand this embedded backend into a distributed scheduler. Before team/multi-machine production use, prototype the same failure scenarios on Windmill and Temporal, compare deployment burden and provider integration, and reuse the selected engine.

The product-specific layer worth keeping is: delegate arbitrary coding work from Codex, know the objective and execution plan, observe real evidence, automatically diagnose exceptions, authorize bounded repair/retry, independently verify completion, and expose configuration/notifications. Generic workflow durability and team scheduling should be reused where their operational requirements warrant it.

# Research and decisions

## UI reuse
Decision: React/Material UI with Headlamp's adapted StatusLabel and resource-console patterns.
Rationale: Headlamp's full plugin/runtime expects Kubernetes and application-specific contexts; the brief explicitly requires standalone use. A pinned independently useful component gives actual reuse without importing cluster dependencies.
Alternatives: Full fork (excess coupling); plugin (requires Headlamp); bespoke badge (unnecessary duplication).
Evidence: [Headlamp plugins](https://headlamp.dev/docs/latest/development/plugins/), [source and adaptation](../../docs/headlamp-research.md).

## Durable local control plane
Decision: Node built-in SQLite with explicit transactional updates to a versioned domain snapshot.
Rationale: No native extension installation and enough atomicity for a single local operator; synchronous transactions make duplicate approval exclusion straightforward.
Alternatives: PostgreSQL (service requirement), browser storage (no server authority), JSON file (weak transactions).
Limit: Single process writer only; future normalized tables/migrations for team scale.

## Runtime boundary
Decision: Simulated UI start plus separately authorized CLI argv execution using shell:false. Runtime capability catalog distinguishes configured, installed and implemented support.
Rationale: Starting provider coding agents requires protocol, credentials and billing decisions; the first build must never suggest that a sample stream is real Codex activity.
Alternatives: Invented native provider hooks (unacceptable); unrestricted HTTP shell execution (unnecessary).

## Local browser access
Decision: Loopback bind, host/origin checks and JSON-only mutation endpoints; no CORS. Vite development proxy on loopback.
Rationale: Same-origin single-operator scope; explicitly disallow remote mode until authentication exists.

## Tests
Decision: Domain tests for validators, policies, duplicate decisions and restarts; HTTP tests for input and origin enforcement; browser smoke for creation, filtering and decision flows.
Rationale: These boundaries carry actual correctness risk. Cosmetic details can be checked through screenshots.

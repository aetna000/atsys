# Feature Specification: AtSys supervision console and local control plane

**Feature Branch**: `main` (initial repository)
**Created**: 2026-10-23
**Status**: Implemented milestone; see docs/IMPLEMENTATION.md
**Input**: Build AtSys from `AtSys Project Agent Supervision Framework and Dashboard.md`, first creating Spec Kit, then implementing the core UI. Make reasonable decisions without interactive clarification.

## User Scenarios & Testing

### User Story 1 - Understand project health (Priority: P1)
An operator opens a local console and sees project, branch, active agents, run progress, incidents, pending approvals, evidence and known spending. They filter the fleet and drill into an agent or run.

**Why this priority**: A trustworthy overview is the core product surface.
**Independent Test**: Open the sample workspace, search/filter fleet, inspect a run, navigate between views and reload.

**Acceptance Scenarios**:
1. **Given** sample data, **When** overview opens, **Then** a persistent demo label, update times, role topology, active runs, incident queue and log stream appear.
2. **Given** an agent with basic execution only, **When** details open, **Then** missing pause/resume/tool-hook features are explicitly unavailable.
3. **Given** a disconnected server, **When** refresh fails, **Then** the console marks its data stale and offers retry.

### User Story 2 - Start and inspect a supervised run (Priority: P1)
The operator chooses a project, coding agent and task through a compact wizard. For this release, the UI starts an explicitly simulated benchmark. A locally invoked process adapter provides genuine bounded command execution separately.

**Why this priority**: Exercises the lifecycle without using paid provider sessions or inventing capabilities.
**Independent Test**: Start a demo run, observe progress, inspect role events, stop it and confirm state survives a service restart.

**Acceptance Scenarios**:
1. **Given** a valid task, **When** started, **Then** a unique run, roles, normalized events and limits are persisted.
2. **Given** a completed process without a passing validator, **When** it exits, **Then** the result is incomplete or failed, never validated pass.
3. **Given** a run, **When** controlled stop is requested twice, **Then** one stop transition occurs and an auditable receipt remains.
4. **Given** a restart, **When** incomplete simulations load, **Then** they continue from persisted progress; orphaned real processes become blocked for reconciliation.

### User Story 3 - Investigate incidents and decide recovery (Priority: P1)
The operator inspects evidence and an exact proposal, then approves or rejects it. Decisions remain durable. A simulated interruption can demonstrate policy-gated recovery.

**Why this priority**: Human authorization is a central product boundary.
**Independent Test**: Open an incident, inspect proposed action, reject/approve it and verify a duplicate/conflicting decision cannot run twice.

**Acceptance Scenarios**:
1. **Given** a pending proposal, **When** approved, **Then** the policy gate verifies its target, action, attempt limit and current state before applying it atomically with a receipt.
2. **Given** a decided proposal, **When** a conflicting decision arrives, **Then** it is rejected without another action.
3. **Given** a real command run, **When** a simulated recovery request arrives, **Then** no process or external side effect is performed.

### User Story 4 - Inspect costs and optional companions (Priority: P2)
The operator reviews estimated spend by runtime and role, token coverage, budgets, optional memory and telemetry status, plus settings and provider diagnostics.

**Why this priority**: Completes the operational context while preserving honest unavailable states.
**Independent Test**: Switch project/time range, open costs and integration views, change permitted settings and run provider diagnostics.

**Acceptance Scenarios**:
1. **Given** unpriced records, **When** costs render, **Then** they appear as unknown with collection coverage, not a zero charge.
2. **Given** disabled companions, **When** their screens open, **Then** they remain unavailable and no fabricated native links appear.
3. **Given** changed budget or guardrails, **When** saved and reloaded, **Then** validated settings persist.

### Edge Cases
- Empty search results and projects with no runs have actionable empty states.
- Long commands, log messages and names must wrap or scroll within their panels at 390px.
- Stale heartbeat must differ from healthy activity; absent measurable progress must not show a percentage.
- Invalid budgets, paths, runtime names and decisions return actionable errors.
- Duplicate stop/approval actions are idempotent; contradictory approval actions conflict.
- Server restart preserves decisions and history; real execution cannot be silently replayed.
- Oversized/secret-bearing payloads must be bounded and redacted.
- Two simultaneous decisions cannot perform an operation twice.

## Requirements

### Functional Requirements
- **FR-001**: Provide Overview, Projects, Agent Fleet, Runs, Incidents, Approvals, Costs, Memory, Observability, AtBot and Settings routes.
- **FR-002**: Provide project selection, search, status/role filters, sortable fleet columns, detail drawers and responsive navigation.
- **FR-003**: Show timestamps, health/unknown/stale distinctions and explicit demo and capability labels.
- **FR-004**: Persist projects, agents, runs, events, incidents, proposals, evidence, settings and audit receipts locally.
- **FR-005**: Normalize role/runtime events with IDs, timestamps, native session identifiers and evidence references.
- **FR-006**: Start and stop simulated runs, show measurable progress, logs with pause/search, timeline and validator outcome.
- **FR-007**: Apply approval decisions through independent bounded policy checks and immutable receipts; preserve rejected decisions.
- **FR-008**: Require a validator receipt and artifact digest before showing validated pass.
- **FR-009**: Show known/estimated/unpriced cost and provenance separately; filter by project and time window.
- **FR-010**: Keep companions off by default; expose only verified discovered links; provide real local provider availability diagnostics without reading credentials.
- **FR-011**: Provide local CLI lifecycle foundation: init, doctor, dashboard, status, run, stop and uninstall with safe project data defaults.
- **FR-012**: Bind to loopback, reject cross-origin mutations, validate inputs, redact outputs and exclude existing environment files from Git.
- **FR-013**: Include meaningful automated domain/API tests and browser smoke coverage for critical user journeys.
- **FR-014**: Maintain an explicit implementation boundary and roadmap for native providers, remote/team auth and companion protocols.

### Key Entities
- **Project**: Repository identity, branch, configured budget and optional integration modes.
- **Agent**: Independent role identity, runtime, model, capabilities, session and heartbeat.
- **Run**: Objective, project, adapter, lifecycle, limits, measurable progress and validator result.
- **Event/Evidence**: Immutable timestamped observation and source-linked payload/artifact digest.
- **Incident/Proposal**: Diagnosis, target, evidence, bounded action and independent policy decision.
- **Receipt**: Durable decision/action/verification identity.
- **Usage**: Invocation ID, known amount or unpriced state, tokens, provenance and sample flag.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Operator can create a demo run through three primary choices in under two minutes.
- **SC-002**: Core routes work at 1440px and 390px without document-level horizontal overflow.
- **SC-003**: Approvals survive restart, conflicting decisions never execute twice and terminal runs cannot resume through stale proposals.
- **SC-004**: Every validated result has a receipt and digest; no incomplete result claims success.
- **SC-005**: All core views remain usable with every companion disabled and no coding agent installed.
- **SC-006**: Typecheck, production build, domain/API tests and core UI smoke tests pass before delivery.

## Assumptions
- Single local operator; loopback-only service with same-origin mutation checks. Remote authentication is future work.
- Preserve the source brief and existing `.env` file without reading credentials.
- Use Headlamp patterns and useful independent components with license attribution; no Kubernetes requirement.
- This milestone implements a functional console and control-plane foundation, not production adapters for every named provider.
- Native coding-provider start/resume, real reasoning supervision, AtMem/AtFlows ingestion, Telegram and remote isolation are subsequent milestones.
- No messages, paid provider tasks or remote deployments are needed for this build.

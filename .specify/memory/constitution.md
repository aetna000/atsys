<!-- Sync impact: scaffold → 1.0.0; establishes five principles, delivery constraints and quality gates. No deferred placeholders. -->
# AtSys Constitution

## Core Principles

### I. Local-first, project-attachable
AtSys MUST work locally without Kubernetes, Docker, AtMem or AtFlows. Initialization MUST NOT rewrite project source, Git hooks or provider credentials. Project-owned data MUST survive detachment by default.

### II. Durable deterministic authority
The control plane MUST own run state, incident records, approvals, budgets and receipts outside model context. A reasoning agent MUST only propose recovery. Mutation requires an independent policy decision, bounded attempts and a durable receipt.

### III. Evidence before claims
Completion MUST require declared validators and evidence. Process liveness MUST NOT imply progress. Unknown prices MUST remain unknown. Unsupported capabilities and simulated records MUST be labeled explicitly. Every operational status MUST have a timestamp.

### IV. Provider independence and isolation
Worker, Observer and Supervisor MUST be roles independent of runtime names. Adapters MUST advertise effective capabilities. Observers MUST be read-only; supervisors MUST be proposal-only. Credentials and raw secret material MUST NOT enter logs, browser bundles or source control.

### V. Reviewable, tested increments
Features MUST start with a specification, plan and executable tasks. Meaningful tests MUST cover state transitions, independent authorization, persistence and objective validation. UI changes MUST be checked at desktop and mobile sizes. Documentation MUST distinguish implemented functionality from future work.

## Delivery Constraints
The initial release is a single-operator loopback application. Simulation is permitted only with persistent labeling and separate execution semantics. External integrations are opt-in and MUST remain unavailable until verified. Notification channels cannot authorize operations. License notices MUST accompany reused source.

## Development Workflow and Quality Gates
Use Spec Kit: constitution, specification, research, plan, data model, interface contracts, tasks, implementation and validation. Type checks, production build, domain/API tests and UI smoke checks gate delivery. Record decisions and limitations in the repository. Scope reductions must be explicit in the implementation report and roadmap.

## Governance
This constitution governs AtSys implementation. Amendments require a documented rationale, semantic version update and impact review. Major versions change principles; minor versions add constraints; patch versions clarify wording. Each feature plan MUST record a constitution check before and after design.

**Version**: 1.0.0 | **Ratified**: 2026-10-23 | **Last Amended**: 2026-10-23

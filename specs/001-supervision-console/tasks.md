# Tasks: AtSys supervision console

**Input**: spec.md, plan.md, research.md, data-model.md, contracts/http-api.md
**Tests**: Explicitly required by FR-013. Domain/API tests before implementation; browser checks after UI integration.

## Phase 1: Setup
- [x] T001 Initialize scripts, dependencies and TypeScript/Vite configuration in package.json, tsconfig.json and vite.config.ts
- [x] T002 [P] Preserve local secrets/runtime artifacts through .gitignore and ship notices in public/licenses/

## Phase 2: Foundation
- [x] T003 Define normalized provider-neutral domain types in shared/types.ts
- [x] T004 Add persistence and policy tests in tests/control-plane.test.ts
- [x] T005 Implement transactional SQLite store, fixture seed and policy functions in server/store.ts, server/seed.ts and server/control-plane.ts
- [x] T006 Add input/origin API tests in tests/api.test.ts and implement server/app.ts and server/index.ts

## Phase 3: US1 — Project health (P1)
**Independent test**: Navigate project overview, filter/sort fleet, inspect capabilities and reload.
- [x] T007 [US1] Build accessible responsive shell, theme, navigation and status components in src/App.tsx, src/theme.ts and src/components/
- [x] T008 [US1] Implement overview health, role topology, live events and drill-through panels in src/pages/Overview.tsx
- [x] T009 [US1] Implement project/fleet tables, search, filters and detail drawer in src/pages/Fleet.tsx and src/pages/Projects.tsx
- [x] T010 [US1] Implement API polling, offline state and retry in src/api.ts

## Phase 4: US2 — Supervised runs (P1)
**Independent test**: Create sample run, inspect event/evidence history, validate, stop and restart service.
- [x] T011 [US2] Add simulator and objective validation tests in tests/control-plane.test.ts
- [x] T012 [US2] Implement deterministic simulated progression and controlled stop in server/control-plane.ts
- [x] T013 [US2] Implement new-run wizard, run details, log pause/search and evidence in src/components/NewRunDialog.tsx and src/pages/Runs.tsx
- [x] T014 [US2] Implement explicit argv process adapter and project lifecycle CLI in server/process-adapter.ts, server/cli.ts and bin/atsys.mjs

## Phase 5: US3 — Incident decisions (P1)
**Independent test**: Inject incident, inspect exact proposal, approve/reject once, verify receipt survives reload.
- [x] T015 [US3] Implement evidence-backed incident injection, acknowledgement and atomic proposal decisions in server/control-plane.ts
- [x] T016 [US3] Implement incident queue, approval review and durable receipt views in src/pages/Incidents.tsx and src/pages/Approvals.tsx

## Phase 6: US4 — Costs and companions (P2)
**Independent test**: Review unknown costs, change budget, run doctor, inspect companions off states.
- [x] T017 [US4] Implement time/project-scoped costs, provenance and coverage in src/pages/Costs.tsx
- [x] T018 [US4] Implement unavailable companion panels and real provider diagnostics in src/pages/Integrations.tsx and server/doctor.ts
- [x] T019 [US4] Implement persistent validated settings and third-party attribution in src/pages/Settings.tsx

## Phase 7: Polish and validation
- [x] T020 Add and run browser smoke tests in tests/e2e/console.spec.ts and capture desktop/mobile screenshots
- [x] T021 Document startup, architecture, acceptance mapping, limitations and roadmap in README.md and docs/
- [x] T022 Run typecheck, domain/API tests and production build; record actual results in docs/IMPLEMENTATION.md

## Dependencies & Execution Order
Setup → Foundation → US1 → US2 → US3 → US4 → Polish. US3 uses run state and events from US2; US4 uses shared shell and project scope. T002 can proceed independently of package setup. After foundation, independent page files can be developed in parallel, but this build uses sequential implementation.

## Parallel Examples
US1: Fleet.tsx and Projects.tsx share only domain types. US2: CLI and run views have separate files. US3: Incidents.tsx and Approvals.tsx share the API contract. US4: Costs.tsx and Integrations.tsx can be implemented independently.

## Implementation Strategy
Deliver working overview first; then lifecycle, authorization and companion visibility. Keep subsequent production-native provider and telemetry integrations in docs/ROADMAP.md, outside this milestone's completed tasks.

## Completion

All 22 tasks are complete for this milestone. Setup: 2; foundation: 4; US1: 4; US2: 4; US3: 2; US4: 3; polish: 3. Verification: 19 domain/API/CLI tests and 14 desktop/mobile browser tests pass, with strict typecheck, production build and formatting checks. See docs/IMPLEMENTATION.md. Future production integrations remain explicitly tracked in docs/ROADMAP.md.

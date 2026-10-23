# Implementation Plan: AtSys supervision console

**Branch**: `main` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

## Summary
Build a purpose-built React console, a loopback HTTP API with durable SQLite records, a deterministic simulator and a basic local process adapter. Reuse Headlamp's independent status badge and its resource-navigation patterns. Keep all provider-specific advanced capabilities explicitly unavailable until implemented.

## Technical Context
**Language/Version**: TypeScript; Node 22.16+ with built-in SQLite (Node 24+ recommended).
**Primary Dependencies**: React, Material UI, Lucide, Recharts, Vite, Express, Zod, tsx.
**Storage**: SQLite WAL; transactional control-plane document with normalized domain records. Initial single-writer scope; schema version tracked.
**Testing**: Node test runner through tsx, HTTP integration tests and Playwright UI smoke checks.
**Target Platform**: macOS/Linux local process and modern browser.
**Project Type**: Local web application and CLI.
**Performance Goals**: Two-second polling; bounded event history; first view under two seconds locally after build.
**Constraints**: No provider credential access, paid sessions, Kubernetes or companion dependencies. Bind loopback only and validate Origin/Host for mutation.
**Scale/Scope**: Single operator; eleven console views; demonstrable lifecycle and human recovery gate.

## Constitution Check
Pre-design: PASS. Local-only install, deterministic state, explicit simulation, independent policy gate, provider contract and test gates satisfy all five principles.
Post-design: PASS. Every simulated pass requires a validator receipt and digest. Real command exits require exit/artifact validation; process cancellation has a receipt. Optional companions default off. Reused code retains notices. No exceptions.

## Project Structure
```text
.specify/                     Spec Kit scripts, templates and constitution
specs/001-supervision-console/ specification, research, model, contracts and tasks
shared/types.ts               provider-neutral contract
server/                       persistence, simulator, policy, API, process adapter, CLI
src/                          React shell, pages, components, theme and API client
src/vendor/headlamp/          adapted StatusLabel plus license/NOTICE
public/licenses/              shipped third-party notices
bin/atsys.mjs                 local CLI launcher
 tests/                       control-plane, API and browser smoke tests
 docs/                        architecture, roadmap and verification report
```
**Structure Decision**: One npm project keeps local onboarding small; shared types avoid contract drift. The transactional document store is intentionally an MVP single-writer design, not a distributed workflow engine.

## Complexity Tracking
No constitution violations. Do not add Temporal, a cluster API or a full Headlamp fork for the initial local foundation.

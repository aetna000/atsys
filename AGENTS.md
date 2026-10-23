# AtSys implementation guidance

Read the source project brief, `.specify/memory/constitution.md`, and the active feature in `.specify/feature.json` before significant changes. The Spec Kit artifacts describe the implemented milestone; `docs/ROADMAP.md` tracks the remaining product scope.

Use Node 22.16+ with `npm install`. Run `npm test`, `npm run typecheck`, `npm run build`, and relevant Playwright checks. Browser tests use their own port/data directory. Do not read or print `.env*` or provider credentials. Preserve project source, hooks and user state.

Simulations must stay visibly labeled. Never infer native pause/resume, complete output, live integration health or zero cost from missing telemetry. Completion requires a declared validator receipt and artifact digest where applicable. Observers inspect; supervisors propose; deterministic policy authorizes. Keep approvals idempotent and attempts bounded.

The operational task service accepts explicit argv from the local operator over loopback JSON and CLI. Generic commands are trusted local code, not a worker sandbox. Codex diagnosis is read-only; a separate policy-authorized repair uses workspace-write. Keep the daemon and runners independent of the UI/API. The active operational specification supersedes the original simulator milestone boundaries. Preserve vendor license/NOTICE when modifying reused Headlamp source.

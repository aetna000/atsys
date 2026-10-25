# Verification — 24 October 2026

Local candidate: Python 0.3.0b2 / application 0.3.0-beta.2. Not published.

- 70 Node tests passed, including six named-progress/pause checks: file ingestion,
  immutable plans and count-only compatibility, validator rejection despite full
  reported progress, long pause excluded from task/attempt deadlines, watchdog
  takeover and same-process resume, stop while paused, hook deadline suspension,
  queued pause and legacy-runner rejection.
- 16 Playwright checks passed across desktop and mobile. New checks verify all
  eight fixture names/source, real pause with frozen output, resume from a task
  row, canceled stop confirmation, and confirmed process stop.
- Production TypeScript/Vite/runtime build and Prettier checks passed.
- Fresh wheel integration: eight checks passed without a source checkout/npm.
- Installed Python SDK: six checks passed, including named plan validation.
- Rich/terminal suite: six checks passed, including actual POSIX PTY pause,
  resize, resume, confirmed stop and terminal mode cleanup; bounded 40x12,
  80x24 and 120x40 frames, Unicode, literal markup and non-TTY suppression.
- Optional actual AtBot/Pydantic AI integration: two checks passed using a local
  test model, with no paid/external model or notification requests.
- Wheel and sdist build successfully; distributions checked with Twine.

Screenshots: docs/screenshots/tasks-paused-desktop.png and
 tasks-paused-mobile.png. Test logs and candidate wheel are retained in the
ignored .atsys directory. The candidate CLI is installed in
.atsys/milestone-wheel-venv; the wheel is in .atsys/milestone-release.

Limits: no native provider-session pause, remote timer suspension, Windows process
control, unlimited transcript retention or automatic retrofit of legacy runners.

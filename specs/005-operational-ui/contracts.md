# Operational UI contracts

Routes `/`, `/tasks`, `/tasks/:id` show managed work. `/settings` shows service and Telegram configuration. Historical sample routes redirect to `/`. The UI polls `/api/operations` without requiring `/api/state`; failures show stale-state warnings and a retry control.

The shared activity parser handles Codex agent/tool events, generic message/error/progress JSON, a complete pretty-printed JSON object, and plain command output. Nested provider/tool payloads remain in explicit raw views; no new transcript retention is promised. Results are bounded to 100 recent entries and 4000 characters per message.

`task logs ID` shows readable activity from all phases, newest first; `--raw` retains the worker output compatibility path. `task show`/`status --json` retain machine interfaces. The read-only monitor reacts to meaningful readable output as well as state/progress, while suppressing heartbeat-only frames.

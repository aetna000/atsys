# Operator interfaces

POST /api/tasks/:id/pause and /resume use the same deterministic
policy as CLI task pause/resume ID. Existing stop/retry routes remain. Pause
requires a healthy compatible watchdog and live runners; resume requires a pause.
Requests are durable and watchdog reconciliation confirms their effects.

Task status ID --json --activity returns bounded readable activity, timeline and
hook receipts. Task list --active --json includes paused/transitional work.
Explicit --json/--raw bypass Rich. Python aliases include monitor, tasks, watch
task ID, watch ID, logs ID and status ID. Monitor navigation is read-only; p and
confirmed s send control requests. Non-TTY views never send mutations. Web stop
requires confirmation; a CLI stop command is itself an explicit request.

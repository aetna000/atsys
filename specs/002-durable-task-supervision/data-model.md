# Data model

- Task: ID, objective/configuration, optimistic revision, created/updated timestamps, lifecycle, retry schedule, stop intent, bounded events and ordered attempts.
- Configuration: worker command/Codex, project directory, plan, model/effort, exact argv/resume argv, validation mode/argv/deadline, required artifacts, optional progress file, heartbeat/activity/progress windows, task/attempt deadlines, recovery mode/limits, supervisor model/effort/deadline/call bound, repair permission/deadline.
- Attempt: immutable ID/config snapshot/phase, process identity, lifecycle, heartbeat/activity/progress clocks, bounded output, exit/failure, validation evidence, proposal/repair result, cleanup and consumption markers.
- Watchdog: owner fencing token, PID, heartbeat and start time.
- Telegram: nonsecret configuration and token-presence boolean; credential is a separate private file.
- Delivery: idempotency key, task association, redacted text, state, attempt count, next delivery time, success/error receipt.

SQLite transactions atomically persist lifecycle/policy events and notification intent. Required new configuration fields receive defaults on read for compatibility. No provider credential is part of this model.

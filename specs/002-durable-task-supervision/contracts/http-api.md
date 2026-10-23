# Operational HTTP API

All routes are local-loopback only. Mutations require JSON with allowed Origin/Host. Invalid configuration is 400; missing tasks 404; conflicting configuration/lifecycle 409. Responses contain no Telegram token.

- GET /api/operations: tasks, attempts, events, daemon heartbeat, computed health, OS service state, Telegram nonsecret settings and outbox.
- POST /api/tasks: full TaskConfig; persist queued task, request watchdog availability, return 201.
- POST /api/tasks/drill: create isolated checkpoint/recovery fixture; no external model or messaging; return 201.
- PATCH /api/tasks/:id: {config, revision}; reject stale revision, return new task.
- POST /api/tasks/:id/stop: durable stop intent; watchdog confirms group cleanup.
- POST /api/tasks/:id/retry: explicit retry for stopped/needs-attention task within remaining configured limits.
- PATCH /api/telegram: enabled, chatId, optional replacement token, onIncident/onRecovery/onCompletion, maxAttempts.
- POST /api/telegram/test: enqueue an explicitly requested test message, return 202.
- POST /api/service/install, /uninstall, /start: current-data-directory OS service or detached daemon lifecycle.

CLI `run` / `task submit` writes the same durable model and returns immediately. Generic commands use exact argv, never implicit shell parsing. The web UI exposes the complete task configuration; active attempts retain their snapshot.

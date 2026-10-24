# Operational UI and readable activity

Expose only working managed-task functionality in the product UI. Remove sample fleet/runs/approvals/costs, unavailable companion screens and sample-only guardrail settings from navigation and routes. Preserve stored evidence and backend compatibility. Real task configuration, execution, validation, recovery, hooks, watchdog/service setup and Telegram configuration remain accessible. Settings opens the operational service/alerts screen.

Task activity must decode supported provider/tool and application JSON into readable messages, keep newest entries first and retain multiline message structure. Raw transcripts remain an explicit technical disclosure/CLI flag. Clearly identify attempt phase and status; current validator selection must not hide worker history. The read-only terminal monitor shows the latest activity near the top and updates for real output changes without heartbeat-only spam. It never changes task execution.

Acceptance: desktop/mobile controls exercise real task creation/configuration/validation, readable output ordering/filtering, route removal, theme persistence, settings persistence without external notifications, stale API recovery and bounded read-only monitor behavior. API and independent validators remain authoritative.

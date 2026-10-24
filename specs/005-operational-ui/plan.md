# Implementation and constitution check

Use the operational API as the UI data source, remove the sample-state prerequisite and expose tasks plus service/Telegram settings. Redirect retired sample URLs to managed tasks. Preserve Headlamp notices and existing state/API contracts.

Share a bounded provider/application JSON-to-activity parser between browser and CLI. Display messages newest first with command lifecycle/result summaries, without exposing nested provider envelopes. Include all attempt phases when browsing task activity, with attempt and text filters. Keep raw retained output available explicitly. Refresh the terminal view on output changes as well as policy/progress changes.

Constitution: local-only scope, no new providers or spending, no live external notification tests, no loss of persisted receipts, independent validation unchanged. Verify relevant domain/CLI tests, desktop/mobile end-to-end workflows, production build and installed wheel.

Post-implementation check: runtime/CLI, desktop/mobile, packaged SDK/AtBot and installed-wheel acceptance checks pass. Actual Codex native hook evidence is retained separately. Historical sample state is preserved; removed screens do not remain in the product routes. External notification/model tests were not broadened.

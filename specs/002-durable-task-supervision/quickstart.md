# Acceptance walkthrough

1. Start `npm run dev`, open localhost:5173, and install the OS watchdog through Service & Telegram or `npm run atsys -- service install`.
2. Create a Codex coding task with objective, directory, optional plan, and an independent test/build command. Configure retry/supervisor/repair limits.
3. Close the originating terminal or browser. Reopen and inspect the durable task, attempts, output and timeline.
4. Use the built-in recovery drill to observe an actual failure, checkpoint retry, independent validator and artifact digest without invoking a model.
5. Kill the owned watchdog while the OS service is active. Observe a replacement PID and the same task continuing. A checked result is recorded in docs/os-recovery-verification.json.
6. Configure Telegram with your own bot token/chat ID and explicitly send a test message. Check the outbox receipt. Automated tests mock the external API and never send messages.
7. Run npm test, npm run build and npm run test:e2e. Review docs/IMPLEMENTATION.md for live-provider evidence versus contract-test coverage.

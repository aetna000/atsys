# Research and design decisions

- The failure is lost task ownership after a conversation/terminal ends, not a missing chart. Use independent execution and OS supervision.
- General coding objectives, explicit argv and Codex execution share one task contract. Benchmark-specific results are an optional adapter; arbitrary acceptance commands are primary.
- Codex exec supports noninteractive operation, JSON events and schema-constrained final responses. Use native login without inspecting credentials. Separate read-only proposal generation from policy-authorized workspace-write repair. Sources: https://learn.chatgpt.com/docs/non-interactive-mode and https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex . Installed CLI tested: 0.163.0.
- Telegram sendMessage is suitable for opt-in outbound alerts. Keep token outside task state, persist intent before delivery, and state at-least-once semantics. Source: https://core.telegram.org/bots/api#sendmessage .
- Use launchd for the actual local watchdog-of-watchdog boundary on this macOS installation. Independent runners make API/daemon restarts recoverable; sleep/power loss requires an external always-on host for ongoing alerts.
- Existing market infrastructure should be reused for production expansion. Compare Temporal/Windmill/Inngest in docs/BUILD-VS-REUSE.md. No existing platform has been integrated here merely because its documentation matches a requirement.

Post-design constitution check: state and authority are durable/deterministic; supervisor remains proposal-only; repair is a separate worker; validation requires evidence; samples stay labeled; provider credentials remain untouched; meaningful failure tests and native/OS smoke receipts are retained. No constitutional amendment required.

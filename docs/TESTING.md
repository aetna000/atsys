# AtSys testing focus

Current priority: qualify the published runtime for ordinary coding work. Codex plugin work is [deferred](todos/codex-plugin.md).

## Existing evidence

The 0.2.0 release passed 31 runtime tests, 18 desktop/mobile browser checks, installed-package checks on Linux/macOS and a clean PyPI installation. macOS checks include watchdog termination and OS restart. [Release evidence](packaging-verification.json) and [native supervisor/repair evidence](native-codex-verification.json) record the scope of those checks.

The 0.3.0b1 beta adds bounded lifecycle/native Codex hooks, optional AtBot observation and operational UI/log cleanup. [Candidate verification](releases/v0.3.0b1-verification.json) records runtime/CLI, desktop/mobile, SDK and installed-wheel checks. [Native hook verification](native-hooks-verification.json) records an actual Codex tool denial followed by independently validated completion. These are accelerated checks, not multi-hour qualification.

## Qualification checklist

- [x] Run an actual Codex coding worker through the published CLI in an isolated Git project; preserve an unrelated edit and require an independent acceptance command plus artifact evidence. [Published-package coding acceptance](published-coding-acceptance.json) records a real duration-parser implementation, five passing test groups and unchanged unrelated/test files.
- [ ] Exercise project onboarding and task handoff through a fresh Codex conversation using the installed skill.
- [ ] Run a multi-hour task with real application progress and independent validation; record observed duration and heartbeat history.
- [ ] During that run, close the originating terminal/dashboard, interrupt the worker and restart the watchdog; verify continuity and bounded recovery.
- [ ] Confirm failed acceptance triggers diagnosis, permitted repair and revalidation; denied repair and exhausted budgets must stop automatic work.
- [ ] Exercise opt-in Telegram delivery and outage/retry behavior against a user-configured test destination.
- [ ] Qualify sleep/wake, reboot, disk exhaustion and resource/concurrency limits in controlled environments.

Use isolated repositories and data directories for destructive failure injection. Retain task IDs, configuration snapshots, receipts, artifact hashes, observed timings and cleanup results. Do not infer multi-hour reliability from accelerated tests or infer a real Telegram delivery from mocked transport checks.

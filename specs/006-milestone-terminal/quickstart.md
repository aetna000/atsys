# Verify this candidate

Run npm test, npm run format:check, npm run build:python and Playwright with an
isolated ATSYS_E2E_PORT. Build/install the wheel in a fresh environment. Run
packaging test_install.py, test_hooks_sdk.py and test_terminal.py with that
interpreter. The terminal suite uses a real POSIX PTY, temporary Git repository,
dedicated state directory and harmless command worker. No paid model or external
notification calls are needed.

Use an isolated ATSYS_DATA_DIR, atsys monitor, atsys watch task ID, p to pause or
resume and s twice to stop. Compare web controls and names/source. Counters should
freeze, the same process should resume, clocks exclude operator pause, and
completion still requires the independent validator.

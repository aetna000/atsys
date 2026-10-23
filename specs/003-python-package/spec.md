# Pip installation and Codex onboarding

An operator installs AtSys with pip/pipx, enters any existing repository, runs `atsys init`, and gives Codex an objective using `$atsys`. No checkout-specific paths, npm install, TypeScript loader, or copied setup prompt should be needed at runtime.

Acceptance: a built wheel installs in a clean virtual environment and runs outside this checkout; includes compiled server/runner/watchdog, built web UI, examples/licenses, and a Codex skill. The installed CLI initializes project integration idempotently, preserves existing instructions/credentials, verifies service availability, and starts the dashboard. Codex prepares objective/plan/acceptance/config, submits through the CLI, and reports a verified handoff. Runtime state is user-writable and separate from package files. An active AtSys worker never recursively delegates itself through the skill.

The sibling claude-atsys Python implementation is preserved. This checkout retains its tested operational backend and adds Python distribution/entry points. A release artifact is built and checked locally; publishing to PyPI is a separate explicitly requested action.

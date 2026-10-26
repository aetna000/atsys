# Interfaces

Task submit/configure accepts expanded worker and optional supervisorProvider,
repairProvider, trustedLocalExecution. Existing endpoints stay unchanged.
CLI run/template/init/integrate support --worker/--provider codex|copilot|claude;
explicit --trusted-local-execution authorizes new providers' local shell access.
atsys providers reports supported adapters/capabilities and executable presence,
without inferring login or subscription health. Portable hook configuration is
injected only into its managed attempt and receives the actual role provider.
All declared validation commands execute separately from the coding agent.

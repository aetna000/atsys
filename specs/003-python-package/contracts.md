# Installed interface

`atsys init [--project PATH] [--no-service] [--no-dashboard] [--open]` attaches an existing Git repository, installs the skill, verifies a recent watchdog heartbeat and reports JSON setup state. Linux reports its detached-service limitation.

`atsys integrate [--project PATH] [--remove]` manages only tracked skill files, refusing to overwrite/remove local edits.

`atsys ui [--no-open] [--port PORT]` reports the actual loopback URL, launching or reusing the matching instance.

`atsys task template --objective TEXT [--project PATH] [--name NAME] [--output PATH] [--allow-repair] [--force]` creates a Codex task configuration from canonical defaults. Existing files are preserved without --force. The caller must supply independent validation.

`atsys task schema` exports the authoritative JSON schema. Existing run/task/service/doctor commands dispatch to the bundled CLI with persistent user state and the packaged Node executable.

HTTP `/api/health` adds `instanceId`, which identifies the operations directory without exposing its pathname. Task submission uses the persisted dashboard port for its link.

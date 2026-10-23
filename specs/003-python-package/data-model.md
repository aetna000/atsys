# Installed data

- `.atsys/project.json`: schemaVersion, absolute root, controlPlaneDataDir, preserveSource. Existing attachments to another workspace are preserved and reported.
- `.atsys/codex-integration.json`: manifest version, packageVersion, relative skill file paths with SHA-256 hashes. Used to preserve user edits during install/remove.
- `<data>/dashboard.json`: port, process ID, instanceId (SHA-256 of canonical data directory). Endpoint discovery only; operational authority remains in SQLite.
- `<package>/_runtime/build.json`: package version, Node major and compiled entry points. Immutable installation resources include defaults, JSON schema, sample task and Codex skill.
- Task/attempt/policy state retains the durable supervision feature's existing model; packaging changes no authorization semantics.

# Interfaces

Task JSON, CLI submission and HTTP creation/configuration accept `hooks`; the generated installed task schema is authoritative. CLI/API starts a missing watchdog and checks hook protocol support before accepting hook configuration. Revision checking remains required for configuration edits.

Hook commands receive one JSON context on stdin and emit one strict result object on stdout (empty means `{}`). Nonzero exit, invalid/oversized output or timeout yields a failed receipt governed by failure policy. Explicit argv runs without implicit shell parsing. Diagnostic stderr is bounded and redacted. `ATSYS_HOOK_INVOCATION_ID` supports external deduplication.

Python exposes `Hooks`, `HookContext`, `HookResult`, event decorators and `atsys hooks run module-or-file:hooks`. `atsys hooks atbot` is optional. `atsys hooks codex-config` exports native definitions; `codex-install` merges/removes only managed project definitions, preserving unrelated configuration and requiring normal Codex trust review.

Native Codex callbacks use the same durable dispatcher. PreToolUse rejection maps to explicit native deny. Turn callbacks are UserPromptSubmit/Stop boundaries, not arbitrary HTTP model interception. Successful Codex completion with requested native hooks requires a bridge handshake. Independent command validators do not require a Codex handshake.

The dashboard accepts JSON hook definitions and shows recent receipts, status, messages/errors, model and tool metadata. Full durable snapshots remain available through `task show`.

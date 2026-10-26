# Coding provider parity

Owner request: every AtSys-managed coding workflow available with Codex must also
work with GitHub Copilot CLI and Claude Code. Implement after this specification.

1. Select codex, copilot or claude as a first-class worker, with independently
selectable supervisor and repair provider/model. Omitted role providers inherit
the agent worker, or Codex for command workers. Persist effective roles in attempt
snapshots. Existing Codex and command configs/receipts remain compatible.
2. Share goal intake/contracts, plans, milestone files, hooks, independent
validation, outcome reports, deadlines, retries, bounded repairs, pause/resume/
stop, watchdog takeover, escalation and opt-in Telegram. Provider exit or prose
cannot declare acceptance. Never silently substitute another provider.
3. Use installed native CLIs and native login; never read/copy credentials.
Diagnoses use only read/search tools. Codex retains its sandbox. Copilot/Claude
workspace tools have different containment: require explicit trustedLocalExecution
for their worker/repair shell access, label it as local-user execution, and never
present networkAccess=false as an OS network boundary for them. Native read-only
supervisors have no shell/edit/MCP tools. No global permission bypass flags.
4. Normalize structured provider messages/tools/results for readable web/terminal
activity. Parse bounded supervisor/repair results strictly; detect provider error
results even when the CLI exits zero. Keep raw redacted evidence. No fabricated
costs or native session-resume claims; retry is a new bounded invocation receiving
saved task evidence and approved guidance.
5. Portable agent_* tool/turn/session/compaction hook events run through the same
durable bounded hook service. Preserve legacy codex_* callbacks. Inject bridges
per attempt without overwriting project/user settings. Callback provider identity
must match the executing role. Tool denials never grant permissions. Copilot
lacks post-compaction and command-hook blocking before a model turn; reject
unsupported fail-closed configurations. Turn boundaries are not HTTP interception.
6. Python setup/integration/template commands and packaged skills support all
three agents, preserve unrelated files and local edits, and prevent recursive
submission. UI exposes role provider/model/policy choices and honest capability
limits. CLI diagnostics distinguish executable presence from authentication.
7. Tests use fake CLI executables and real managed command groups with separate
validators, not paid models or real user work. Cover each provider success,
supervisor/repair, mixed roles, malformed/error results, native hook normalization,
legacy configs, pause/stop, templates/skills and desktop/mobile controls.

No publication or installed-service replacement is authorized by this feature.

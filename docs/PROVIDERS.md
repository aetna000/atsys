# Coding providers — 0.3.0

AtSys supports Codex, GitHub Copilot CLI and Claude Code as coding workers,
read-only supervisors and bounded repair agents. The 0.3.0 release extends the
0.3.0b3 goal workflow with independent provider selection for each role.

| Function | Codex | GitHub Copilot | Claude Code |
| --- | --- | --- | --- |
| Objective, plan, goal contract and milestones | Supported | Supported | Supported |
| Independent validator, artifacts and final report | Supported | Supported | Supported |
| Watchdog, deadlines, retries and escalation | Supported | Supported | Supported |
| Supervisor and repair role selection | Supported | Supported | Supported |
| Task lifecycle hooks and Python SDK | Supported | Supported | Supported |
| Native tool/turn/session callbacks | Supported | Supported with event limits | Supported |
| Pre-compaction callback | Supported | Observation only | Supported |
| Post-compaction callback | Supported | Not exposed by CLI | Supported |
| Before-turn command hook can block | Supported | Not exposed by CLI | Supported |
| Native model HTTP interception | Not exposed | Not exposed | Not exposed |
| AtSys process pause/resume/stop | Supported | Supported | Supported |
| Native provider session resume | Not claimed | Not claimed | Not claimed |

Closing a monitor does not stop work. Retry starts a new bounded invocation with
saved goal/progress/evidence and approved recovery instructions; it does not
silently resume a provider's internal session. Native process suspension does not
pause remote requests or provider timers. Costs remain unknown unless supplied
as explicitly labelled outcome evidence.

## Select a provider

The native CLI and its existing login must be available on the watchdog's PATH.
`atsys providers` shows executable presence and capability limits. It does not
claim authentication, subscription or model access is healthy.

```sh
atsys init --provider copilot
# Or attach Claude Code; existing integrations can coexist:
atsys integrate --provider claude
atsys task template --worker copilot --objective "Implement my feature" \
  --output .atsys/tasks/feature.json
```

Setup installs the AtSys skill under `.agents/skills/atsys` for Codex,
`.github/skills/atsys` for Copilot or `.claude/skills/atsys` for Claude. Ask that
agent to use the AtSys skill for your objective. It inspects the project, defines
the goal contract, plan and acceptance command, submits once, and verifies the
handoff. An AtSys-managed agent never recursively submits another task.

`atsys integrate --provider PROVIDER --remove` removes only unmodified managed
skill files. Other provider integrations, repository instructions, hooks and
credentials remain intact. Local edits cause a preservation error.

Task configuration adds:

```json
{
  "worker": "copilot",
  "model": "",
  "supervisorProvider": "claude",
  "supervisorModel": "",
  "repairProvider": "codex",
  "repairModel": "",
  "trustedLocalExecution": true
}
```

This is a partial configuration, not a launchable task. Complete the template's
goalContract, plan and project-specific independent validation command before
submission. Omitted supervisor inherits the coding worker, or Codex for command
workers. Repair inherits supervisor unless explicitly selected. Blank repair
model/omitted effort inherit supervisor model/effort. There is no fallback to
another provider after an error. Model names must be valid for the chosen CLI. Copilot default/`auto` routing
uses native reasoning defaults; an explicit reasoning effort is passed only when
a concrete model is selected, since the auto router rejects this flag.

The dashboard's task configuration exposes the same worker, supervisor, repair,
model, effort, retry and timeout settings. Task wiring and terminal status show
selected providers. `atsys task logs` normalizes native messages/tools instead of
printing provider envelopes. Raw retained evidence remains available explicitly.

## Execution permissions

Codex keeps its existing read-only diagnosis and workspace-write sandbox.
Copilot/Claude diagnosis exposes read/search tools only, with no shell, edit,
subagent or MCP tools. Workspace workers/repairs use a limited native tool list
and require explicit `trustedLocalExecution:true`, available as template flag
`--trusted-local-execution` or the web's local-tool permission switch. No global
permission bypass flag is used.

Copilot/Claude shell tools execute with the local user's authority under their
native policies. This is **not** Codex OS sandbox containment. `networkAccess`
selects native web tools but is not an OS network-denial guarantee for these
shell tools. Use Codex when the task requires that existing sandbox boundary.
Task scope, repair permission and budgets remain binding instructions/policy;
they do not manufacture an OS boundary. AtSys never copies login credentials or
changes global CLI settings. Existing native/enterprise restrictions still apply.

## Portable native hooks

Use `agent_pre_tool`, `agent_post_tool`, `agent_before_model_turn`,
`agent_after_model_turn`, `agent_session_start`, `agent_pre_compact` and, where
supported, `agent_post_compact`. Legacy `codex_*` definitions remain supported
for Codex. Scope hooks to phases when mixing providers. Configuration rejects
unsupported events and fail-closed policies on Copilot observation-only events.

Claude receives attempt-local settings; Copilot receives an attempt-local plugin.
Neither overwrites repository/user hooks. Codex retains its normal hook trust
review. Startup connection must be recorded before a managed agent can claim
native hook coverage. Context records actual provider, event and available
model/session/tool metadata. Missing metadata stays unknown.

Callbacks use the same bounded durable hook service, pause accounting and replay
rules as lifecycle hooks. A portable callback failure/escalation fences the
current attempt according to policy; it never grants permissions or bypasses the
validator. Pre-tool denial cannot undo earlier side effects. Copilot's native
hook timeout behavior is not a universal fail-closed boundary. Use before_run or
before_validation gates when that guarantee is required. No bridge reads raw
provider transcripts or exposes an internal HTTP request hook.

## Upgrade and verify

The watchdog advertises multi-provider protocol support. An older watchdog
rejects new-provider tasks with an upgrade message rather than launching the
wrong worker. Upgrade/restart the runtime deliberately; do not replace a running
Python environment or disrupt unrelated tasks during testing.

Verification uses deterministic fixture CLIs and real owned process groups,
separate validators, report digests, denial/error handling and desktop/mobile
configuration checks. This does not establish live model access. See
[Spec Kit artifacts](../specs/008-provider-parity/spec.md).

## Opt-in model capacity fallback

For AtSys-managed Codex, Claude Code, or GitHub Copilot workers, configure an
ordered list of model IDs supported by that same provider in the task JSON, plus
a retry budget and restart or supervised recovery. The beta requires a healthy
upgraded watchdog; restart an owned, idle watchdog with the upgraded package
before submitting or changing a task that uses capacity fallback:

```json
{
  "worker": "codex",
  "model": "your-primary-model-id",
  "capacityFallbackModels": ["your-approved-fallback-model-id"],
  "recovery": "supervised",
  "maxRetries": 2,
  "backoffSeconds": 30
}
```

The model IDs are examples and must be available to your account and chosen worker
provider. Fallback selects a model within that provider; it does not switch
providers. AtSys recognizes these structured worker errors:

- Codex JSON `turn.failed` containing `Selected model is at capacity`, or JSON
  `error` containing that message when the process exits unsuccessfully.
- Claude JSON `error` with `overloaded_error`, or an error/result record that
  explicitly reports the model is at capacity or overloaded.
- Copilot JSON `session.error` explicitly reporting the model is at capacity or
  overloaded. Generic rate limits, quota and authentication errors do not switch.

After confirmed cleanup AtSys schedules a fresh worker attempt with the next
approved model, records the switch, and applies the existing retry budget,
deadline and validator. It does not wait indefinitely; exhaustion requires
operator attention. The original task configuration is not rewritten. The
fallback policy bypasses model-based supervisor diagnosis for these recognized
failures.

A new attempt is not a resumed native session: it receives the objective and
prior attempt evidence and uses the existing workspace. Review tasks with external
side effects before enabling automatic retries; AtSys cannot guarantee safe replay.
This does not control a separately launched interactive Codex session. Other
provider errors, different message formats, a process that never terminates, and
unavailable fallback models may require attention. Fixture tests do not establish
that real provider capacity responses use these event shapes, and other forms
may require attention. Provider CLI versions and error formats can change.

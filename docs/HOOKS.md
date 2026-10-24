# Task and agent hooks

AtSys 0.3.0b1 adds project-owned lifecycle callbacks, a Python decorator SDK, native Codex tool/turn callbacks and an optional AtBot/Pydantic AI observer. These are opt-in task settings. The AtSys watchdog, execution policy, retry limits and independent acceptance command retain authority.

## Quickstart

Create `build_hooks.py` in the project:

```python
import json
from pathlib import Path
from atsys.hooks import Hooks, HookResult

hooks = Hooks()

@hooks.on.before_run
def check_inputs(ctx):
    return HookResult(message="Build inputs checked")

@hooks.on.on_tick
async def check_progress(ctx):
    # Your build updates this file after real milestones.
    p = json.loads(Path("build-status.json").read_text())
    return HookResult(progress={
        "completed": p["completed"], "total": p["total"],
        "checkpoint": p.get("checkpoint", f"step-{p['completed']}"),
    })
```

Add definitions to an existing task configuration (this is a fragment):

```json
{
  "goalMonitoring": false,
  "activityTimeoutSeconds": 0,
  "progressTimeoutSeconds": 1800,
  "hooks": [{
    "id": "build-checks",
    "events": ["before_run", "on_tick"],
    "phases": ["worker"],
    "argv": ["atsys", "hooks", "run", "build_hooks.py:hooks"],
    "timeoutSeconds": 15,
    "intervalSeconds": 30,
    "maxInvocations": 1000,
    "failurePolicy": "fail"
  }]
}
```

The command must be on the watchdog's PATH; an absolute path to the Python/AtSys executable is suitable for controlled installations. An alternative argv is `["/path/to/python", "-m", "atsys.hooks", "run", "build_hooks.py:hooks"]` using an interpreter where AtSys is installed. No shell parsing is implicit. Sync callbacks run on a worker thread in the Python SDK; async callbacks are awaited. The outer hook process deadline bounds either kind.

Hooks can also be written in any language: consume a single `atsys-hook-v1` JSON object on stdin and emit one result JSON object on stdout. Empty stdout means an empty successful result. In the Python SDK, diagnostic `print` output is redirected to stderr. Exit nonzero for an error. Invalid JSON, unknown result fields, oversized output and expired deadlines are recorded as callback failures.

## Lifecycle and results

| Event | Meaning |
| --- | --- |
| `before_run` | Gate each worker, supervisor, repair or validator attempt before spawning it; filter with `phases` |
| `after_run` | Observe a successful attempt |
| `on_run_error` | Observe a failed/lost attempt |
| `on_tick` | Periodically inspect an active attempt without blocking the watchdog |
| `before_validation` | Gate the separate validation command |
| `after_validation` | Observe validation success or failure |
| `on_recovery` | Observe an independently authorized retry/repair; does not grant it |
| `on_task_complete`, `on_task_stop`, `on_escalation` | Observe the persisted task outcome |

Results accept only `message`, `decision` (`continue`, `fail`, `escalate`) and `progress` (`completed`, `total`, optional `checkpoint`). They cannot set task status, authorize repair, run a replacement command, increase retry budgets or extend deadlines. Callback argv is trusted local-user code, with the same trust boundary as command workers; it is not a hostile-code sandbox.

Before-run/before-validation rejection prevents the workload/check from starting. A failed `on_tick` callback with `failurePolicy: fail`, or an explicit `fail`, fences the attempt and enters normal recovery. `escalate` from gates, ticks or native Codex callbacks stops automatic work and records attention. `continue` failure policy tolerates callback execution errors; it does not override explicit rejection. After-outcome callbacks are observational: their errors remain visible and can enter the alert outbox, but they do not retroactively replace a validated result. A callback failure is not successful task acceptance.

Progress from `on_tick`, `codex_post_tool` and `codex_after_model_turn` can advance an active attempt. The total cannot change and completed units cannot decrease. Identical/replayed signals do not refresh the progress clock. A callback firing, touching a timestamp, or printing logs does not itself establish progress. Progress is reported evidence, not a substitute for independent semantic validation.

## Native Codex tools and model turns

| AtSys event | Native Codex event | Scope |
| --- | --- | --- |
| `codex_pre_tool` | `PreToolUse` | Inspect and deny supported local tools before execution |
| `codex_post_tool` | `PostToolUse` | Inspect results; cannot undo a tool that already ran |
| `codex_before_model_turn` | `UserPromptSubmit` | Prompt/turn boundary, with the reported active model |
| `codex_after_model_turn` | `Stop` | End-of-turn observation |
| `codex_session_start` | `SessionStart` | Session startup |
| `codex_pre_compact`, `codex_post_compact` | `PreCompact`, `PostCompact` | Context compaction |

Declare these events in a task's `hooks`; `matcher` optionally filters native tool names (e.g. `^Bash$`, `^apply_patch$`). The callback receives `ctx.native`, including reported model/session/turn IDs, tool name/call ID and input/result when provided. AtSys does not read the Codex transcript or provider authentication files. Per-attempt native configuration is passed to Codex without rewriting global configuration.

For initial trust review:

```sh
atsys hooks codex-install --config .atsys/tasks/build.json --project /path/to/project
# Open Codex in that project; review the generated AtSys definitions using /hooks.
atsys task submit --config .atsys/tasks/build.json
```

Installation merges the bridge into project `.codex/hooks.json` and tracks only the definitions it added. Existing hooks remain intact. `atsys hooks codex-install --remove` removes unmodified managed definitions; it refuses to overwrite/remove local modifications. `atsys hooks codex-config --config task.json` exports the generated configuration for inspection. AtSys enables no hook-trust bypass. A successful Codex exit without a verified bridge connection fails acceptance instead of claiming hook coverage.

A pre-tool handler can return `HookResult(decision="fail", message="Denied by project policy")`; AtSys translates this to Codex's explicit native denial response. Internal delivery errors/timeouts also return denial when the hook's failure policy is `fail`. Codex itself can skip untrusted hooks and some tool paths are outside native hook coverage: this is a guardrail, not a complete security boundary. Hosted tools and every internal model HTTP request are not exposed through this bridge. Turn callbacks must not be described as per-request model interception. Native availability depends on the installed Codex release; tested protocol details are recorded in the verification report.

## Optional AtBot and Pydantic AI hooks

Install `atsys[atbot]` to make the standalone `atbots` package and its Pydantic AI provider available. This integration does not use the separate `atmem-atbot` memory companion or require AtMem storage for observation. The base AtSys install has no model/framework dependency for hooks.

Use a hook argv such as:

```json
["atsys", "hooks", "atbot", "--config", "/project/atbot.json", "--provider", "local"]
```

The bridge calls the selected AtBot Pydantic AI provider directly, with constrained observation output. It does not create a second task authority, run the AtBot tool loop, or grant new tools. Configured `pydantic_capabilities` are passed through AtBot's existing capability loader. In that AtBot agent, use real Pydantic AI hooks such as `before_model_request`, `after_model_request` and `before_tool_execute` (for any tools actually supplied to that agent). See [the example capability](../examples/hooks/atbot_capability.py).

The provider receives only the bounded, redacted hook context. Remote providers require both AtBot's `remote_egress_allowed` and explicit `--allow-remote`. A hook's process timeout and invocation budget bound observer work; they do not enforce a monetary budget. Capability code is explicitly user-configured trusted code. Tests exercise actual Pydantic AI lifecycle callbacks with `TestModel`; they do not claim a live external-model integration was tested.

## Upgrading the watchdog

Hook tasks require a healthy watchdog advertising hook protocol 1. The CLI/API starts a missing watchdog, but rejects hook submissions or edits when an older daemon is still running. After upgrading, restart the daemon with the upgraded runtime. On macOS, run `atsys service uninstall` followed by `atsys service install` during a maintenance window; for a manually managed daemon, restart it through its process manager. This guard avoids silently ignoring callbacks after a package upgrade.

## Durability and limits

Each invocation has an immutable config/context snapshot and durable ID, lease, PID, outcome and cleanup receipt. At most four callback runners execute concurrently across tasks, with one dispatcher runner per task. Tick callbacks do not overlap a previous queued/running callback for the same definition. Defaults: 30-second timeout, 30-second interval, 1000 invocations per definition per task. Configured limits are enforced independently of hook results. Before-run waiting remains bounded by the total task lifetime.

Running callback processes survive API/watchdog closure and can be adopted by the next watchdog. An interrupted delivery is marked uncertain/interrupted and is not automatically replayed. Automatic task retries create new attempts and new callback invocations. Use `ctx.invocation_id` / `ATSYS_HOOK_INVOCATION_ID` to deduplicate external side effects. Exactly-once external effects are not promised. Keep callbacks bounded and do not create unattended child processes.

Task snapshots preserve active hooks when configuration changes. Recent receipts appear under **Lifecycle hooks** in the task detail UI; configuration is editable under **Edit task wiring → Lifecycle hooks**. `atsys task show TASK_ID` exposes full receipts. Callback stdout is bounded at 32 KB and retained stderr at 8 KB; prior settled receipts are pruned beyond the recent-history window while counters survive. Do not put credentials in callback arguments, results or context.

References: [Pydantic AI hooks](https://pydantic.dev/docs/ai/core-concepts/hooks/), [Codex native hooks](https://learn.chatgpt.com/docs/hooks).

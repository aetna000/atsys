"""Project-owned callbacks: copy this file into the repository being supervised."""

import json
from pathlib import Path
from atsys.hooks import Hooks, HookResult

hooks = Hooks()


@hooks.on.before_run
def preflight(ctx):
    if not Path(ctx.task["cwd"]).is_dir():
        return HookResult(decision="fail", message="Project directory is missing")
    return HookResult(message="Project preflight passed")


@hooks.on.on_tick
async def observe_build(ctx):
    # The build itself writes this file after real units of work, not on a timer.
    status = Path("build-status.json")
    if not status.is_file():
        return HookResult(message="Build has not reported units of work yet")
    if status.stat().st_size > 64000:
        return HookResult(
            decision="fail", message="Build progress exceeds its size limit"
        )
    value = json.loads(status.read_text())
    return HookResult(
        progress={
            "completed": value["completed"],
            "total": value["total"],
            "checkpoint": value.get("checkpoint", f"unit-{value['completed']}"),
        }
    )


@hooks.on.on_run_error
def failed(ctx):
    # Use invocation_id to deduplicate any external notification you implement.
    return HookResult(
        message=f"Attempt failed: {ctx.attempt.get('failure', 'unknown cause')}"
    )


@hooks.on.codex_pre_tool
def inspect_tool(ctx):
    # Real native Codex input; return decision='fail' to deny a supported call.
    return HookResult(message=f"Reviewed tool {ctx.native.get('toolName', 'unknown')}")


@hooks.on.codex_before_model_turn
def inspect_turn(ctx):
    # This is a turn boundary, not interception of every model HTTP request.
    return HookResult(
        message=f"Codex turn uses model {ctx.native.get('model', 'not reported')}"
    )

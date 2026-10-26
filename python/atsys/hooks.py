"""Sync/async lifecycle callbacks and the installed JSON hook command."""

from __future__ import annotations

import argparse
import asyncio
import importlib
import importlib.util
import inspect
import json
import math
import sys
from contextlib import redirect_stdout
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable

EVENTS = (
    "before_run",
    "after_run",
    "on_run_error",
    "on_tick",
    "before_validation",
    "after_validation",
    "on_recovery",
    "on_task_complete",
    "on_task_stop",
    "on_escalation",
    "codex_pre_tool",
    "codex_post_tool",
    "codex_before_model_turn",
    "codex_after_model_turn",
    "codex_session_start",
    "codex_pre_compact",
    "codex_post_compact",
)


@dataclass(frozen=True)
class HookContext:
    invocation_id: str
    event: str
    task: dict[str, Any]
    attempt: dict[str, Any] | None
    native: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "HookContext":
        if value.get("protocol") != "atsys-hook-v1" or value.get("event") not in EVENTS:
            raise ValueError("Unsupported AtSys hook protocol or event")
        if not isinstance(value.get("task"), dict) or not isinstance(
            value.get("invocationId"), str
        ):
            raise ValueError("Invalid hook context")
        return cls(
            value["invocationId"],
            value["event"],
            value["task"],
            value.get("attempt"),
            value.get("native"),
        )


@dataclass
class HookResult:
    message: str | None = None
    decision: str | None = None
    progress: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        value = {key: item for key, item in asdict(self).items() if item is not None}
        if self.message is not None and (
            not isinstance(self.message, str) or len(self.message) > 4000
        ):
            raise ValueError("Hook message must be at most 4000 characters")
        if self.decision is not None and self.decision not in (
            "continue",
            "fail",
            "escalate",
        ):
            raise ValueError(
                "Hooks may continue, fail or escalate; they cannot complete or authorize recovery"
            )
        if self.progress is not None:
            progress = self.progress
            if set(progress) - {
                "completed",
                "total",
                "checkpoint",
                "milestones",
                "planSource",
            }:
                raise ValueError("Unsupported progress fields")
            completed, total = progress.get("completed"), progress.get("total")
            if (
                any(
                    isinstance(v, bool)
                    or not isinstance(v, (int, float))
                    or not math.isfinite(v)
                    for v in (completed, total)
                )
                or not 0 <= completed <= total
                or total <= 0
            ):
                raise ValueError(
                    "Progress requires finite 0 <= completed <= total and total > 0"
                )
            names = progress.get("milestones")
            source = progress.get("planSource")
            if source is not None and (
                not isinstance(source, str) or not source.strip() or len(source) > 2000
            ):
                raise ValueError("Invalid milestone plan source")
            if names is not None:
                if (
                    not isinstance(names, list)
                    or not 1 <= len(names) <= 100
                    or any(
                        not isinstance(name, str) or not name.strip() or len(name) > 300
                        for name in names
                    )
                    or len(set(name.strip() for name in names)) != len(names)
                    or len(names) != total
                    or int(completed) != completed
                    or not source
                ):
                    raise ValueError(
                        "Milestones require unique ordered names, matching total, integer completed count and planSource"
                    )
            if "checkpoint" in progress and (
                not isinstance(progress["checkpoint"], str)
                or len(progress["checkpoint"]) > 2000
            ):
                raise ValueError("Invalid checkpoint")
        return value


class _Registration:
    def __init__(self, hooks: "Hooks") -> None:
        self.hooks = hooks

    def __call__(self, event: str) -> Callable:
        if event not in EVENTS:
            raise ValueError(f"Unsupported AtSys hook event: {event}")

        def register(handler: Callable) -> Callable:
            self.hooks.handlers.setdefault(event, []).append(handler)
            return handler

        return register

    def __getattr__(self, event: str) -> Callable:
        return self(event)


class Hooks:
    """Pydantic-style decorators, without requiring a model or framework."""

    def __init__(self) -> None:
        self.handlers: dict[str, list[Callable]] = {}
        self.on = _Registration(self)

    async def dispatch_async(self, context: HookContext) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for handler in self.handlers.get(context.event, []):
            if inspect.iscoroutinefunction(handler):
                value = await handler(context)
            else:
                value = await asyncio.to_thread(handler, context)
            if inspect.isawaitable(value):
                value = await value
            if value is None:
                continue
            if isinstance(value, dict):
                value = HookResult(**value)
            if not isinstance(value, HookResult):
                raise TypeError("A hook must return HookResult, dict or None")
            result.update(value.to_dict())
            if result.get("decision") in ("fail", "escalate"):
                break
        return result

    def dispatch(self, context: HookContext) -> dict[str, Any]:
        return asyncio.run(self.dispatch_async(context))


def load_hooks(reference: str) -> Hooks:
    source, separator, attribute = reference.rpartition(":")
    if not separator or not attribute:
        raise ValueError("Use module:hooks or /path/to/hooks.py:hooks")
    if source.endswith(".py"):
        path = Path(source).expanduser().resolve(strict=True)
        spec = importlib.util.spec_from_file_location("_atsys_project_hooks", path)
        if spec is None or spec.loader is None:
            raise ValueError("Cannot import hook module")
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    else:
        sys.path.insert(0, str(Path.cwd()))
        module = importlib.import_module(source)
    hooks = getattr(module, attribute)
    if not isinstance(hooks, Hooks):
        raise TypeError("Configured object must be atsys.hooks.Hooks")
    return hooks


def main(args: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="atsys hooks")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("events")
    run = commands.add_parser("run")
    run.add_argument("reference")
    atbot = commands.add_parser("atbot")
    atbot.add_argument("--config", required=True)
    atbot.add_argument("--provider")
    atbot.add_argument("--allow-remote", action="store_true")
    options = parser.parse_args(args)
    if options.command == "events":
        print(json.dumps(EVENTS))
        return 0
    try:
        raw = sys.stdin.read(64001)
        if len(raw.encode()) > 64000:
            raise ValueError("Hook context exceeds 64 KB")
        payload = json.loads(raw)
        context = HookContext.from_dict(payload)
        with redirect_stdout(sys.stderr):
            if options.command == "run":
                result = load_hooks(options.reference).dispatch(context)
            else:
                from .integrations.atbot import observe

                result = observe(
                    payload, options.config, options.provider, options.allow_remote
                )
        print(json.dumps(result, allow_nan=False))
        return 0
    except Exception as error:
        # Do not print arbitrary exception messages, which can contain model credentials.
        print(
            f"AtSys hook failed ({type(error).__name__}); inspect your handler and configuration",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    # Project callbacks import atsys.hooks; share types with the -m entry module.
    sys.modules["atsys.hooks"] = sys.modules[__name__]
    raise SystemExit(main(sys.argv[1:]))

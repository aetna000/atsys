"""Read-only Rich monitoring, with explicit operator process-control commands."""

from __future__ import annotations

import argparse
import json
import os
import re
import select
import signal
import sys
import time
from contextlib import contextmanager
from datetime import datetime, timezone

from rich import box
from rich.console import Console, Group
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

ACTIVE = {
    "queued",
    "running",
    "recovering",
    "supervising",
    "repairing",
    "pausing",
    "paused",
    "resuming",
}
FINAL = {"completed", "stopped", "needs_attention"}
COLORS = {
    "completed": "green",
    "needs_attention": "red",
    "paused": "yellow",
    "pausing": "yellow",
    "resuming": "cyan",
    "running": "cyan",
    "stopped": "yellow",
}


def clean(value: object) -> str:
    text = str(value if value is not None else "")
    text = re.sub(r"\x1b\][^\x07]*(?:\x07|\x1b\\)", "", text)
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    return re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", text)


def text(value: object, style: str = "", *, compact: bool = False) -> Text:
    return Text(
        re.sub(r"\s+", " ", clean(value)).strip() if compact else clean(value),
        style=style,
        overflow="ellipsis" if compact else "fold",
        no_wrap=compact,
    )


def read_json(args: list[str], backend) -> object:
    result = backend(args, capture=True)
    if result.returncode:
        raise RuntimeError(clean(result.stderr).strip() or "AtSys request failed")
    return json.loads(result.stdout)


def snapshot(task_id: str | None, backend) -> dict:
    return read_json(
        ["task", "status", *([task_id] if task_id else []), "--json", "--activity"],
        backend,
    )


def age(value: str | None) -> str:
    try:
        seconds = max(
            0,
            int(
                (
                    datetime.now(timezone.utc)
                    - datetime.fromisoformat(value.replace("Z", "+00:00"))
                ).total_seconds()
            ),
        )
        return (
            f"{seconds}s ago"
            if seconds < 60
            else f"{seconds // 60}m ago"
            if seconds < 3600
            else f"{seconds // 3600}h ago"
        )
    except (TypeError, ValueError, AttributeError):
        return "not recorded"


def task_table(tasks: list[dict], *, selected: int | None = None) -> Table:
    table = Table(box=box.SIMPLE, expand=True, show_lines=False)
    table.add_column("#", width=3, no_wrap=True)
    table.add_column("Task", ratio=2, overflow="fold")
    table.add_column("State", ratio=1)
    table.add_column("ID", ratio=1, overflow="fold")
    for i, item in enumerate(tasks):
        table.add_row(
            text(">" if selected == i else i + 1),
            text(item["name"]),
            text(item["state"], COLORS.get(item["status"], "")),
            text(item["id"]),
            style="bold" if selected == i else "",
        )
    return table


def milestone_panel(task: dict, *, compact: bool = False, max_items: int = 100):
    source = task.get("progressSource")
    progress = task.get("progress")
    if not progress:
        return Panel(
            text("No progress reported. No denominator or percentage is assumed."),
            title="Milestones",
        )
    plan = task.get("milestones", [])
    explanation = (
        source.get("explanation", "")
        if source
        else "Reporting source was not recorded."
    )
    reporter = source.get("reporter", "") if source else "Legacy progress report"
    table = Table.grid(padding=(0, 1), expand=True)
    table.add_column(width=3)
    table.add_column(
        ratio=1, overflow="ellipsis" if compact else "fold", no_wrap=compact
    )
    for i, item in enumerate(plan[:max_items]):
        marker = (
            "✓"
            if item["status"] == "reported complete"
            else "→"
            if item["status"] == "current"
            else "·"
        )
        table.add_row(
            text(
                f"{marker}{i + 1}",
                "green" if marker == "✓" else "cyan" if marker == "→" else "dim",
            ),
            text(item["name"], compact=compact),
        )
    if len(plan) > max_items:
        table.add_row(
            text("…"),
            text(
                f"{len(plan) - max_items} more; task status ID shows the full plan",
                compact=compact,
            ),
        )
    heading = f"{progress['completed']}/{progress['total']} reported · validator still decides completion"
    body = (
        Group(
            text(reporter, "dim", compact=compact),
            text(explanation, compact=compact),
            table,
        )
        if plan
        else Group(text(reporter, "dim"), text(explanation))
    )
    return Panel(
        body,
        title=text(heading),
        border_style="green" if task["status"] == "completed" else "dim",
    )


def activity_panel(
    task: dict, *, lines: int = 12, compact: bool = False, view: str = "activity"
):
    key = {"activity": "activity", "timeline": "timeline", "hooks": "hooks"}[view]
    entries = task.get(key, [])[:lines]
    table = Table.grid(padding=(0, 1), expand=True)
    table.add_column(width=13 if not compact else 9)
    table.add_column(
        ratio=1, overflow="ellipsis" if compact else "fold", no_wrap=compact
    )
    for entry in entries:
        label = entry.get("phase") or entry.get("role") or entry.get("name") or "hook"
        message = entry.get("message", "")
        if view == "hooks":
            message = f"{entry['event']} · {entry['status']} · {entry.get('decision') or ''} {entry.get('model') or ''} {entry.get('tool') or ''} {message}"
        elif view == "timeline":
            message = f"{entry['type'].replace('.', ' ')} · {message}"
        table.add_row(
            text(
                label, "red" if entry.get("kind") == "error" else "cyan", compact=True
            ),
            text(message, compact=compact),
        )
    if not entries:
        table.add_row(text(""), text(f"No {view} recorded yet."))
    return Panel(table, title=f"{view.title()} · newest first", border_style="dim")


def status_panel(task: dict):
    table = Table.grid(padding=(0, 2), expand=True)
    table.add_column(style="dim", width=12)
    table.add_column(ratio=1)
    for label, value in [
        ("State", task["state"]),
        ("Goal", task["objective"]),
        ("Phase", task["phase"]),
        (
            "Worker",
            f"{task.get('policy', {}).get('worker', 'unknown')} · {task.get('policy', {}).get('model', 'not recorded')}",
        ),
        (
            "Recovery",
            f"{task.get('policy', {}).get('recovery', 'unknown')} · retries {task.get('policy', {}).get('maxRetries', 'unknown')} · repair {'allowed' if task.get('policy', {}).get('allowRepair') else 'disabled'}",
        ),
        ("Heartbeat", age(task.get("heartbeatAt"))),
        ("Observer", task["observerSummary"]),
        (
            "Supervisor",
            f"{task.get('policy', {}).get('supervisorProvider', 'codex')} · {task['supervisor']}",
        ),
        (
            "Repair",
            f"{task.get('policy', {}).get('repairProvider', 'codex')} · {task.get('policy', {}).get('repairModel', 'configured default')}",
        ),
        (
            "Tool policy",
            task.get("policy", {}).get("executionIsolation", "not recorded"),
        ),
        (
            "Deadlines",
            f"worker {task.get('policy', {}).get('workerTimeout', '?')}s · task {task.get('policy', {}).get('taskTimeout', '?')}s · heartbeat {task.get('policy', {}).get('heartbeatTimeout', '?')}s",
        ),
        ("Progress", f"stall window {task.get('progressWindow', 0)}s (0 disables it)"),
        ("Acceptance", task["acceptance"]),
        (
            "Criteria",
            "; ".join(task.get("successCriteria", []))
            or "Legacy objective and validator",
        ),
        (
            "Report",
            task.get("reportError")
            or (
                f"atsys task report {task['id']} · {task['report']['digest']}"
                if task.get("report")
                else "Pending / legacy: explicit retrospective generation available"
            ),
        ),
        ("Next", task["next"]),
        ("Task", task["id"]),
    ]:
        table.add_row(text(label, "dim"), text(value))
    return Panel(
        table,
        title=text(task["name"], "bold"),
        border_style=COLORS.get(task["status"], "cyan"),
    )


def live_layout(
    task: dict, width: int, height: int, *, view="overview", notice=""
) -> Layout:
    height = max(8, height)
    layout = Layout()
    header = Panel(
        Group(
            text(task["name"], "bold", compact=True),
            text(
                f"{task['state']} · {task['phase']} · heartbeat {age(task.get('heartbeatAt'))}",
                compact=True,
            ),
        ),
        border_style=COLORS.get(task["status"], "cyan"),
    )
    footer = Group(
        text(notice or task["next"], "yellow" if notice else "", compact=True),
        text(
            "p Pause/Resume · s Stop · q Back",
            "dim",
            compact=True,
        ),
        text(
            "1 Overview · 2 Activity · 3 Timeline · 4 Hooks · 5 Wiring",
            "dim",
            compact=True,
        ),
    )
    if view == "policy":
        layout.split_column(
            Layout(header, size=4), Layout(status_panel(task)), Layout(footer, size=3)
        )
        return layout
    if view == "overview" and height >= 18:
        plan_height = (
            min(len(task.get("milestones", [])) + 4, height - 11)
            if task.get("milestones")
            else min(6, height - 11)
        )
        layout.split_column(
            Layout(header, size=4),
            Layout(
                milestone_panel(task, compact=True, max_items=max(1, plan_height - 4)),
                size=plan_height,
            ),
            Layout(
                activity_panel(
                    task, lines=max(1, height - plan_height - 8), compact=True
                )
            ),
            Layout(footer, size=3),
        )
    else:
        layout.split_column(
            Layout(header, size=4),
            Layout(
                activity_panel(
                    task,
                    lines=max(1, height - 9),
                    compact=False,
                    view="activity" if view == "overview" else view,
                )
            ),
            Layout(footer, size=3),
        )
    return layout


@contextmanager
def keys(enabled: bool):
    if not enabled:
        yield lambda timeout: time.sleep(timeout) or ""
        return
    import termios
    import tty

    fd = sys.stdin.fileno()
    previous = termios.tcgetattr(fd)
    tty.setcbreak(fd)
    pending = ""

    def read(timeout):
        nonlocal pending
        if not pending:
            if not select.select([sys.stdin], [], [], timeout)[0]:
                return ""
            pending = os.read(fd, 32).decode(errors="ignore")
        if pending == "\x1b" and select.select([sys.stdin], [], [], 0.03)[0]:
            pending += os.read(fd, 8).decode(errors="ignore")
        length = 3 if pending.startswith(("\x1b[A", "\x1b[B")) else 1
        value, pending = pending[:length], pending[length:]
        return value.lower() if length == 1 else value

    try:
        yield read
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, previous)


def watch(
    console: Console,
    backend,
    task_id: str | None,
    *,
    interval: int,
    once: bool,
    follow: bool,
    lines: int,
):
    task = snapshot(task_id, backend)
    task_id = task[
        "id"
    ]  # Stay attached to this task even if newer tasks are submitted.
    interactive = console.is_terminal and sys.stdin.isatty() and not once
    view = "activity" if follow else "overview"
    notice = ""
    confirm_until = 0.0
    last_signal = ""
    previous_handler = signal.getsignal(signal.SIGTERM)

    def interrupted(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    try:
        with (
            keys(interactive) as read_key,
            Live(
                console=console,
                screen=console.is_terminal and not once,
                auto_refresh=False,
                vertical_overflow="crop",
                redirect_stdout=False,
                redirect_stderr=False,
            ) as live,
        ):
            while True:
                current_signal = json.dumps(
                    {
                        k: v
                        for k, v in task.items()
                        if k not in ("heartbeatAt", "updatedAt")
                    },
                    sort_keys=True,
                )
                if console.is_terminal and not once:
                    live.update(
                        live_layout(
                            task,
                            console.size.width,
                            console.size.height,
                            view=view,
                            notice=notice,
                        ),
                        refresh=True,
                    )
                elif current_signal != last_signal:
                    console.print(
                        activity_panel(task, lines=lines)
                        if follow
                        else Group(
                            status_panel(task),
                            milestone_panel(task),
                            activity_panel(task, lines=lines),
                        )
                    )
                last_signal = current_signal
                if once or task["status"] in FINAL and not interactive:
                    break
                key = read_key(interval)
                if key in ("q", "b", "\x1b"):
                    break
                if key in ("1", "2", "3", "4", "5"):
                    view = {
                        "1": "overview",
                        "2": "activity",
                        "3": "timeline",
                        "4": "hooks",
                        "5": "policy",
                    }[key]
                elif key == "p":
                    action = "resume" if task.get("paused") else "pause"
                    try:
                        read_json(["task", action, task_id, "--json"], backend)
                        notice = f"{action.title()} requested; waiting for watchdog confirmation."
                    except RuntimeError as error:
                        notice = str(error)
                elif key == "s":
                    if time.monotonic() < confirm_until:
                        try:
                            read_json(["task", "stop", task_id, "--json"], backend)
                            notice = "Stop requested; waiting for process cleanup."
                        except RuntimeError as error:
                            notice = str(error)
                        confirm_until = 0
                    else:
                        confirm_until = time.monotonic() + 4
                        notice = "Press s again within 4 seconds to STOP. Files already changed will remain."
                if confirm_until and time.monotonic() > confirm_until:
                    confirm_until = 0
                    notice = ""
                task = snapshot(task_id, backend)
    except KeyboardInterrupt:
        pass
    finally:
        signal.signal(signal.SIGTERM, previous_handler)
    if console.is_terminal and not once:
        console.print(status_panel(task))
    if not once:
        console.print(
            text("Monitor closed. Task execution is controlled separately.", "dim")
        )
    return 0


def main(args: list[str], backend) -> int:
    console = Console(highlight=False)
    action = args[1]
    parser = argparse.ArgumentParser(prog=f"atsys task {action}")
    parser.add_argument("id", nargs="?")
    parser.add_argument("--active", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--follow", "-f", action="store_true")
    parser.add_argument("--interval", type=int, default=2)
    parser.add_argument("--lines", type=int, default=20)
    options = parser.parse_args(args[2:])
    if not 1 <= options.interval <= 60 or not 1 <= options.lines <= 100:
        raise ValueError("Interval must be 1–60 seconds; lines must be 1–100.")
    if action == "monitor":
        if not console.is_terminal or not sys.stdin.isatty():
            console.print(
                task_table(read_json(["task", "list", "--json", "--active"], backend))
            )
            return 0
        try:
            while (selected := choose_task(console, backend)) is not None:
                watch(
                    console,
                    backend,
                    selected,
                    interval=options.interval,
                    once=False,
                    follow=False,
                    lines=options.lines,
                )
        except KeyboardInterrupt:
            pass
        return 0
    if action == "list":
        tasks = read_json(
            ["task", "list", "--json", *(["--active"] if options.active else [])],
            backend,
        )
        console.print(task_table(tasks))
        console.print(
            text(
                "task watch ID · task logs ID --follow · task pause/resume/stop ID",
                "dim",
            )
        )
        return 0
    if action in ("pause", "resume", "stop", "retry"):
        if not options.id:
            raise ValueError(f"{action} requires a task ID")
        read_json(["task", action, options.id, "--json"], backend)
        console.print(status_panel(snapshot(options.id, backend)))
        return 0
    if action == "watch" or options.follow:
        if (
            not options.id
            and not options.once
            and console.is_terminal
            and sys.stdin.isatty()
        ):
            options.id = choose_task(console, backend)
            if options.id is None:
                return 0
        return watch(
            console,
            backend,
            options.id,
            interval=options.interval,
            once=options.once,
            follow=action == "logs",
            lines=options.lines,
        )
    task = snapshot(options.id, backend)
    console.print(
        activity_panel(task, lines=options.lines)
        if action == "logs"
        else Group(
            status_panel(task),
            milestone_panel(task),
            activity_panel(task, lines=options.lines),
        )
    )
    return 0


def choose_task(console: Console, backend) -> str | None:
    """Select using stable IDs; browsing never changes task execution."""
    selected_id = None
    selected = 0
    show_all = False
    with (
        keys(True) as read_key,
        Live(
            console=console, screen=True, auto_refresh=False, vertical_overflow="crop"
        ) as live,
    ):
        while True:
            tasks = read_json(["task", "list", "--json"], backend)
            if not show_all:
                tasks = [
                    task
                    for task in tasks
                    if task["status"] in ACTIVE or task["status"] == "needs_attention"
                ]
            selected = next(
                (i for i, task in enumerate(tasks) if task["id"] == selected_id),
                min(selected, max(0, len(tasks) - 1)),
            )
            count = max(1, console.size.height - 8)
            offset = max(0, selected - count + 1)
            table = Table(box=box.SIMPLE, expand=True)
            table.add_column("", width=1)
            table.add_column("Task", ratio=2, no_wrap=True, overflow="ellipsis")
            table.add_column("State", ratio=1, no_wrap=True, overflow="ellipsis")
            for i, task in enumerate(tasks[offset : offset + count], start=offset):
                table.add_row(
                    text(">" if i == selected else ""),
                    text(task["name"], compact=True),
                    text(task["state"], COLORS.get(task["status"], ""), compact=True),
                    style="bold reverse" if i == selected else "",
                )
            selected_id = tasks[selected]["id"] if tasks else None
            body = Group(
                table if tasks else text("No open tasks. Press a to show all tasks."),
                text(selected_id or "", "dim", compact=True),
                text(
                    "↑/↓ or j/k Select · Enter Open · a Open/All · q Exit",
                    "dim",
                    compact=True,
                ),
            )
            live.update(
                Panel(
                    body,
                    title="All managed tasks"
                    if show_all
                    else "Active, paused and attention tasks",
                ),
                refresh=True,
            )
            key = read_key(2)
            if key in ("q", "\x1b"):
                return None
            if key in ("\r", "\n") and tasks:
                return selected_id
            if key in ("j", "\x1b[B"):
                selected = min(len(tasks) - 1, selected + 1)
                selected_id = tasks[selected]["id"] if tasks else None
            elif key in ("k", "\x1b[A"):
                selected = max(0, selected - 1)
                selected_id = tasks[selected]["id"] if tasks else None
            elif key == "a":
                show_all = not show_all
                selected_id = None


def show_providers(backend) -> int:
    console = Console(highlight=False)
    values = read_json(["providers", "--json"], backend)
    table = Table(box=box.SIMPLE, expand=True)
    for name in ("Provider", "Executable", "Tool policy / limitations"):
        table.add_column(name, overflow="fold")
    for row in values:
        table.add_row(
            text(row["label"]),
            text(
                "Found" if row["executableAvailable"] else "Not found",
                "green" if row["executableAvailable"] else "yellow",
            ),
            text(row["executionIsolation"] + ". " + "; ".join(row["limitations"])),
        )
    console.print(table)
    console.print(
        text(
            "Executable presence does not verify login, subscription or model access. Use native CLI login when needed.",
            "dim",
        )
    )
    return 0

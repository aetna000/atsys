"""Rich rendering, read-only monitoring and real PTY operator controls."""

import copy
import fcntl
import io
import json
import os
import select
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from atsys import cli
from atsys.terminal import (
    activity_panel,
    live_layout,
    milestone_panel,
    status_panel,
    watch,
)
from rich.cells import cell_len
from rich.console import Console, Group


def task():
    names = [f"Milestone {i}" for i in range(1, 9)]
    return dict(
        id="task-rendering",
        name="Long coding work",
        state="Working",
        status="running",
        objective="Build a useful feature and independently validate it",
        phase="Worker execution",
        heartbeatAt="2026-10-24T00:00:00Z",
        observerSummary="Progress observed",
        supervisor="On standby",
        acceptance="Independent validation still required",
        next="No action required",
        paused=False,
        policy={
            "worker": "codex",
            "model": "configured default",
            "recovery": "supervised",
            "maxRetries": 2,
            "allowRepair": True,
        },
        progress={
            "completed": 2,
            "total": 8,
            "milestones": names,
            "planSource": "Worker decomposition of the objective and execution plan",
        },
        progressSource={
            "reporter": "Progress file: progress.json",
            "explanation": "Worker decomposition of the objective and execution plan",
        },
        milestones=[
            {
                "name": name,
                "status": "reported complete"
                if i < 2
                else "current"
                if i == 2
                else "pending",
            }
            for i, name in enumerate(names)
        ],
        activity=[
            {
                "phase": "worker",
                "kind": "message",
                "message": "Latest clear message\nMultiline body retained",
            },
            {
                "phase": "worker",
                "kind": "tool",
                "message": "Finished (exit 0): npm test",
            },
        ],
        timeline=[],
        hooks=[],
        updatedAt="now",
    )


class TerminalRenderingTests(unittest.TestCase):
    def render(self, value, width=80, height=24):
        stream = io.StringIO()
        console = Console(
            file=stream, width=width, height=height, color_system=None, record=True
        )
        console.print(value)
        return console.export_text()

    def test_live_frames_fit_resized_terminals_and_show_eight_names(self):
        for width, height in [(40, 12), (80, 24), (120, 40)]:
            value = task()
            value["activity"][0]["message"] = (
                "界 " * 150 + "\n" + "very long output " * 100
            )
            output = self.render(live_layout(value, width, height), width, height)
            self.assertLessEqual(len(output.splitlines()), height)
            self.assertTrue(
                all(cell_len(line) <= width for line in output.splitlines())
            )
            self.assertIn("Stop", output)
        output = self.render(live_layout(task(), 80, 24))
        for i in range(1, 9):
            self.assertIn(f"Milestone {i}", output)
        self.assertIn("Progress file", output)

    def test_live_overview_shows_reported_checkpoint_with_milestones(self):
        value = task()
        value["progress"]["checkpoint"] = "10/600 graded: 9 passed, 1 failed"
        for width, height in [(80, 24), (120, 40)]:
            output = self.render(live_layout(value, width, height), width, height)
            self.assertIn("10/600 graded: 9 passed, 1 failed", output)

    def test_full_status_preserves_provenance_and_does_not_render_user_markup(self):
        value = task()
        value["name"] = "[red]literal name[/red]\x1b[2J"
        value["progressSource"]["explanation"] = (
            "Derived from objective and plan.md; chosen by the worker"
        )
        output = self.render(
            Group(status_panel(value), milestone_panel(value), activity_panel(value))
        )
        self.assertIn("[red]literal name[/red]", output)
        self.assertNotIn("\x1b", output)
        self.assertIn("plan.md", output)
        self.assertIn("validator", output)
        self.assertIn("Multiline body retained", output)

    def test_legacy_denominator_never_invents_named_milestones(self):
        value = task()
        value["milestones"] = []
        value["progressSource"]["explanation"] = (
            "Milestone names and their derivation were not recorded."
        )
        output = self.render(milestone_panel(value))
        self.assertIn("not recorded", output)
        self.assertNotIn("Milestone 1", output)

    def test_piped_watch_is_read_only_and_suppresses_heartbeat_only_frames(self):
        first = task()
        second = copy.deepcopy(first)
        second["heartbeatAt"] = "new heartbeat"
        second["updatedAt"] = "later"
        final = copy.deepcopy(first)
        final.update(
            status="completed",
            state="Completed and validated",
            acceptance="Declared validator passed",
        )
        sequence = iter([first, second, final])
        calls = []

        def backend(args, **kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args, 0, json.dumps(next(sequence)), "")

        stream = io.StringIO()
        console = Console(file=stream, width=90, color_system=None)
        with patch("atsys.terminal.time.sleep"):
            watch(
                console,
                backend,
                "task-rendering",
                interval=1,
                once=False,
                follow=True,
                lines=20,
            )
        output = stream.getvalue()
        self.assertNotIn("\x1b", output)
        self.assertNotIn('"message"', output)
        self.assertEqual(output.count("Multiline body retained"), 2)
        self.assertTrue(all(args[:2] == ["task", "status"] for args in calls))

    def test_watch_task_alias_dispatches_to_formatted_snapshot(self):
        def backend(args, **kwargs):
            return subprocess.CompletedProcess(args, 0, json.dumps(task()), "")

        stream = io.StringIO()
        with (
            patch("atsys.cli.backend", backend),
            patch(
                "atsys.terminal.Console",
                lambda **kwargs: Console(file=stream, width=90, color_system=None),
            ),
        ):
            self.assertEqual(cli.main(["watch", "task", "task-rendering", "--once"]), 0)
        self.assertIn("Milestone 8", stream.getvalue())
        self.assertNotIn('"activity"', stream.getvalue())


@unittest.skipUnless(
    os.name == "posix", "POSIX terminal and process-group support required"
)
class TerminalPTYTests(unittest.TestCase):
    def test_real_monitor_controls_resize_and_terminal_cleanup(self):
        with tempfile.TemporaryDirectory(prefix="atsys-pty-") as directory:
            root = Path(directory)
            project = root / "project"
            project.mkdir()
            data = root / "state"
            subprocess.run(["git", "init", "-q", str(project)], check=True)
            env = {
                **os.environ,
                "ATSYS_DATA_DIR": str(data),
                "PYTHONPATH": str(cli.PACKAGE.parent),
                "TERM": "xterm-256color",
            }
            env.pop("COLUMNS", None)
            env.pop("LINES", None)

            def run(*args):
                result = subprocess.run(
                    [sys.executable, "-m", "atsys", *args],
                    cwd=project,
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                return result.stdout

            config = root / "task.json"
            run(
                "task",
                "template",
                "--objective",
                "Verify real PTY controls and cleanup",
                "--output",
                str(config),
            )
            value = json.loads(config.read_text())
            value.update(
                worker="command",
                goalMonitoring=False,
                recovery="notify",
                progressFile="progress.json",
                argv=[
                    cli.node_executable(),
                    "-e",
                    "const fs=require('fs');let n=0;setInterval(()=>{fs.writeFileSync('count',String(++n));console.log(JSON.stringify({message:'Human readable output '+n}));fs.writeFileSync('progress.json',JSON.stringify({completed:Math.min(n,7),total:8,milestones:Array.from({length:8},(_,i)=>'Milestone '+(i+1)),planSource:'Project fixture plan',checkpoint:'stage-'+Math.min(n,7)}))},200)",
                ],
                validationArgv=[cli.node_executable(), "-e", "process.exit(0)"],
                timeoutSeconds=60,
            )
            value["plan"] = "Exercise owned PTY controls with eight observed stages; verify through this test."
            value["goalContract"].update(
                successCriteria=["Owned controls preserve observed output"], deliverables=["progress.json"],
                unresolvedDecisions=[], stages=[f"Milestone {i+1}" for i in range(8)], planSource="Project fixture plan",
                observers=[{"signal":"progress","cadenceSeconds":1,"rationale":"Observe real fixture stages"}, {"signal":"validator","cadenceSeconds":1,"rationale":"Declared process check; PTY behavior is independently checked by this test"}],
                recoveryScope="No automatic repair", escalationConditions=["Control ownership cannot be verified"], budget="Local fixture only; no provider calls",
            )
            config.write_text(json.dumps(value))
            submitted = json.loads(run("task", "submit", "--config", str(config)))
            task_id = submitted["id"]

            def until(predicate):
                for _ in range(80):
                    # Drain while polling: a real terminal consumer must keep reading
                    # or the monitor correctly blocks on the PTY's output buffer.
                    drain(0.05)
                    state = json.loads(run("task", "status", task_id, "--json"))
                    if predicate(state):
                        return state
                    time.sleep(0.1)
                self.fail(
                    f"PTY task state did not converge: {state['status']}\n{captured[-3000:]!r}"
                )

            master, slave = os.openpty()
            original = termios.tcgetattr(slave)
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
            process = None
            captured = b""

            def drain(duration=0.3):
                nonlocal captured
                end = time.monotonic() + duration
                while time.monotonic() < end:
                    if select.select([master], [], [], 0.05)[0]:
                        try:
                            captured += os.read(master, 65536)
                        except OSError:
                            break

            try:
                until(lambda state: bool(state.get("progress")))
                process = subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "atsys",
                        "watch",
                        "task",
                        task_id,
                        "--interval",
                        "1",
                    ],
                    cwd=project,
                    env=env,
                    stdin=slave,
                    stdout=slave,
                    stderr=slave,
                    start_new_session=True,
                )
                for _ in range(30):
                    drain(0.1)
                    if b"Milestone 8" in captured:
                        break
                self.assertIn(b"Milestone 8", captured)
                os.write(master, b"p")
                until(lambda state: state["status"] == "paused")
                frozen = (project / "count").read_text()
                time.sleep(0.4)
                self.assertEqual((project / "count").read_text(), frozen)
                fcntl.ioctl(
                    slave, termios.TIOCSWINSZ, struct.pack("HHHH", 16, 48, 0, 0)
                )
                process.send_signal(signal.SIGWINCH)
                drain(1.1)
                os.write(master, b"p")
                until(lambda state: state["status"] == "running")
                os.write(master, b"2")
                drain(0.3)
                os.write(master, b"ss")
                until(lambda state: state["status"] == "stopped")
                os.write(master, b"q")
                for _ in range(100):
                    drain(0.1)
                    if process.poll() is not None:
                        break
                process.wait(timeout=1)
                drain(0.2)
                self.assertEqual(
                    process.returncode, 0, captured.decode(errors="ignore")
                )
                restored = termios.tcgetattr(slave)
                # macOS sets PENDIN when switching canonical modes: it is a
                # kernel pending-input marker, not a mode left enabled by us.
                restored[3] &= ~getattr(termios, "PENDIN", 0)
                original[3] &= ~getattr(termios, "PENDIN", 0)
                self.assertEqual(restored, original)
                self.assertNotIn(b'"aggregated_output"', captured)
                self.assertNotIn(b"Traceback", captured)
            finally:
                if process and process.poll() is None:
                    process.terminate()
                    for _ in range(30):
                        drain(0.1)
                        if process.poll() is not None:
                            break
                    if process.poll() is None:
                        process.kill()
                    process.wait(timeout=5)
                subprocess.run(
                    [sys.executable, "-m", "atsys", "task", "stop", task_id, "--json"],
                    cwd=project,
                    env=env,
                    capture_output=True,
                    timeout=30,
                )
                # Give the watchdog time to kill the owned worker before exit.
                until(lambda state: state["status"] in {"stopped", "completed"})
                status = json.loads(run("service", "status"))
                daemon = status.get("daemon")
                if daemon:
                    try:
                        command = subprocess.check_output(
                            ["ps", "-p", str(daemon["pid"]), "-o", "command="],
                            text=True,
                        )
                        if str(data) in command and "daemon.mjs" in command:
                            os.kill(daemon["pid"], signal.SIGTERM)
                    except (ProcessLookupError, subprocess.CalledProcessError):
                        pass
                os.close(master)
                os.close(slave)


if __name__ == "__main__":
    unittest.main()

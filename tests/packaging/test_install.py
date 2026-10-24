"""Run with the installed wheel's Python, from any working directory."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from atsys.cli import PACKAGE, RUNTIME, node_executable
from atsys import __version__


class InstalledWheelTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="atsys-wheel-")
        self.root = Path(self.temporary.name).resolve()
        self.project = self.root / "project with spaces"
        self.project.mkdir()
        subprocess.run(["git", "init", "-q", str(self.project)], check=True)
        self.data = self.root / "persistent data"
        self.env = {**os.environ, "ATSYS_DATA_DIR": str(self.data)}
        self.env.pop("ATSYS_PORT", None)
        self.env.pop("PYTHONPATH", None)

    def cli(self, *args, check=True):
        result = subprocess.run([sys.executable, "-m", "atsys", *args], cwd=self.project, env=self.env, capture_output=True, text=True, timeout=35)
        if check:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def tearDown(self):
        # Shut the API down first so it cannot restart the test watchdog.
        record = self.data / "dashboard.json"
        if record.exists():
            pid = json.loads(record.read_text())["pid"]
            try:
                command = subprocess.check_output(["ps", "-p", str(pid), "-o", "command="], text=True)
                if str(RUNTIME / "index.mjs") in command:
                    os.kill(pid, signal.SIGTERM)
            except (ProcessLookupError, subprocess.CalledProcessError):
                pass
        status = self.cli("service", "status", check=False)
        try:
            state = json.loads(status.stdout)
            if state.get("service", {}).get("loaded"):
                self.cli("service", "uninstall")
                for _ in range(40):
                    state = json.loads(self.cli("service", "status").stdout)
                    if state.get("daemon"):
                        break
                    time.sleep(0.1)
            daemon = state.get("daemon")
            if daemon:
                command = subprocess.check_output(["ps", "-p", str(daemon["pid"]), "-o", "command="], text=True)
                if str(self.data) in command and "daemon.mjs" in command:
                    os.kill(daemon["pid"], signal.SIGTERM)
        except (ValueError, ProcessLookupError, subprocess.CalledProcessError):
            pass
        time.sleep(0.2)
        self.temporary.cleanup()

    def test_wheel_contains_runtime_and_uses_bundled_node(self):
        self.assertIn("site-packages", str(PACKAGE))
        for name in ("cli.mjs", "index.mjs", "daemon.mjs", "attempt-runner.mjs", "dist/index.html", "THIRD_PARTY_NOTICES.txt"):
            self.assertTrue((RUNTIME / name).is_file(), name)
        self.assertIn("nodejs_wheel", node_executable())
        schema = json.loads(self.cli("task", "schema").stdout)
        self.assertIn("validationArgv", schema["properties"])
        self.assertEqual(self.cli("--version").stdout.strip(), __version__)
        self.assertEqual(json.loads((RUNTIME / "build.json").read_text())["version"], __version__)

    def test_init_is_idempotent_and_preserves_project_instructions(self):
        original = "# My instructions\nPreserve project behavior.\n"
        (self.project / "AGENTS.md").write_text(original)
        args = ("init", "--no-service", "--no-dashboard")
        first = json.loads(self.cli(*args).stdout)
        second = json.loads(self.cli(*args).stdout)
        self.assertEqual(first["skill"], second["skill"])
        self.assertTrue(first["doctor"]["ready"])
        self.assertTrue(any(c["name"] == "write-read-pilot" and c["passed"] for c in first["doctor"]["checks"]))
        self.assertEqual((self.project / "AGENTS.md").read_text(), original)
        skill = Path(first["skill"])
        self.assertIn("ATSYS_TASK_ID", skill.read_text())
        self.assertNotIn("/Users/", skill.read_text())
        skill.write_text(skill.read_text() + "\nMy customization\n")
        self.assertNotEqual(self.cli(*args, check=False).returncode, 0)
        self.assertIn("My customization", skill.read_text())
        self.assertNotEqual(self.cli("integrate", "--remove", check=False).returncode, 0)

    def test_doctor_checks_config_without_executing_workload(self):
        task_path = self.project / "task.json"
        self.cli("task", "template", "--objective", "Validate setup only", "--network-access", "--output", str(task_path))
        config = json.loads(task_path.read_text())
        self.assertTrue(config["networkAccess"])
        self.assertTrue(config["goalMonitoring"])
        config.update(worker="command", argv=[node_executable(), "-e", "require('fs').writeFileSync('DO_NOT_RUN','bad')"], validator="exit-code", recovery="notify")
        task_path.write_text(json.dumps(config))
        report = json.loads(self.cli("doctor", "--config", str(task_path)).stdout)
        self.assertTrue(report["ready"])
        self.assertFalse((self.project / "DO_NOT_RUN").exists())
        config["argv"] = ["atsys-nonexistent-program-for-test"]
        task_path.write_text(json.dumps(config))
        failed = self.cli("doctor", "--config", str(task_path), check=False)
        self.assertNotEqual(failed.returncode, 0)
        self.assertFalse(json.loads(failed.stdout)["ready"])

    def test_unmodified_integration_can_be_removed_without_touching_other_skills(self):
        other = self.project / ".agents/skills/other/SKILL.md"
        other.parent.mkdir(parents=True)
        other.write_text("Other skill")
        self.cli("integrate")
        self.cli("integrate", "--remove")
        self.assertFalse((self.project / ".agents/skills/atsys/SKILL.md").exists())
        self.assertEqual(other.read_text(), "Other skill")

    def test_installed_task_and_dashboard_work_without_checkout_or_npm(self):
        self.cli("init", "--no-service", "--no-dashboard")
        task_path = self.project / ".atsys/tasks/first.json"
        self.cli("task", "template", "--objective", "Create a feature and verify it independently", "--output", str(task_path))
        self.assertNotEqual(self.cli("task", "template", "--objective", "replace", "--output", str(task_path), check=False).returncode, 0)
        config = json.loads(task_path.read_text())
        config.update(worker="command", argv=[node_executable(), "-e", "require('fs').writeFileSync('feature.txt','works')"], validationArgv=[node_executable(), "-e", "process.exit(require('fs').readFileSync('feature.txt','utf8')==='works'?0:1)"], requiredArtifacts=["feature.txt"], recovery="notify")
        task_path.write_text(json.dumps(config))
        url = self.cli("ui", "--no-open").stdout.strip()
        self.assertEqual(self.cli("ui", "--no-open").stdout.strip(), url)
        with urllib.request.urlopen(url) as response:
            self.assertIn("<html", response.read().decode())
        with urllib.request.urlopen(url + "/tasks/direct-link-probe") as response:
            self.assertEqual(response.status, 200)
            self.assertIn("<html", response.read().decode())
        with urllib.request.urlopen(url + "/api/health") as response:
            self.assertEqual(json.load(response)["instanceId"], hashlib.sha256(str(self.data).encode()).hexdigest())
        submitted = json.loads(self.cli("task", "submit", "--config", str(task_path)).stdout)
        self.assertTrue(submitted["dashboard"].startswith(url))
        task = None
        for _ in range(50):
            task = json.loads(self.cli("task", "show", submitted["id"]).stdout)
            if task["status"] in ("completed", "needs_attention"):
                break
            time.sleep(0.15)
        self.assertEqual(task["status"], "completed", task)
        self.assertEqual([a["phase"] for a in task["attempts"]], ["worker", "validator"])
        self.assertEqual(task["attempts"][-1]["validation"]["artifacts"][0]["path"], "feature.txt")
        # Restart promptly on the same URL after real HTTP connections. TIME_WAIT
        # must not look like a live foreign instance and silently shift the port.
        record = json.loads((self.data / "dashboard.json").read_text())
        os.kill(record["pid"], signal.SIGTERM)
        for _ in range(40):
            try:
                command = subprocess.check_output(["ps", "-p", str(record["pid"]), "-o", "stat="], text=True, stderr=subprocess.DEVNULL).strip()
                if command.startswith("Z"):
                    break
            except subprocess.CalledProcessError:
                break
            time.sleep(0.05)
        self.assertEqual(self.cli("ui", "--no-open", "--port", str(record["port"])).stdout.strip(), url)

    @unittest.skipUnless(sys.platform == "darwin", "launchd integration requires macOS")
    def test_installed_watchdog_recovers_after_process_death(self):
        initialized = json.loads(self.cli("init", "--no-dashboard").stdout)
        state = initialized["watchdog"]
        self.assertTrue(state["service"]["loaded"])
        plist = Path(state["service"]["path"]).read_text()
        self.assertIn(str(RUNTIME / "daemon.mjs"), plist)
        self.assertIn(node_executable(), plist)
        self.assertNotIn("tsx", plist)
        old_pid = state["daemon"]["pid"]
        os.kill(old_pid, signal.SIGKILL)
        for _ in range(90):
            state = json.loads(self.cli("service", "status").stdout)
            daemon = state.get("daemon")
            if daemon and daemon["pid"] != old_pid:
                break
            time.sleep(0.25)
        self.assertIsNotNone(daemon)
        self.assertNotEqual(daemon["pid"], old_pid)
        command = subprocess.check_output(["ps", "-p", str(daemon["pid"]), "-o", "command="], text=True)
        self.assertIn(str(RUNTIME / "daemon.mjs"), command)


if __name__ == "__main__":
    unittest.main()

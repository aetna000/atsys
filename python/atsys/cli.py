"""Installed AtSys entry point; no development checkout or npm at runtime."""
from __future__ import annotations

import argparse
import hashlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

from . import __version__

PACKAGE = Path(__file__).resolve().parent
RESOURCES = PACKAGE / "resources"
RUNTIME = PACKAGE / "_runtime"


def data_directory() -> Path:
    configured = os.environ.get("ATSYS_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))) / "atsys").resolve()


def node_executable() -> str:
    from nodejs_wheel import node
    result = node(["-p", "process.execPath"], return_completed_process=True, capture_output=True, stdin=subprocess.DEVNULL, text=True, check=True)
    return result.stdout.strip()


def environment(node: str) -> dict[str, str]:
    env = os.environ.copy()
    env["ATSYS_DATA_DIR"] = str(data_directory())
    record = data_directory() / "dashboard.json"
    if "ATSYS_PORT" not in env and record.exists():
        try:
            port = json.loads(record.read_text()).get("port")
            if isinstance(port, int) and 1024 <= port <= 65535:
                env["ATSYS_PORT"] = str(port)
        except (OSError, ValueError):
            pass
    # Our runtime is launched by absolute path. Preserve the user's Node for
    # native provider launchers (the bundled Python wheel may use Rosetta).
    env["PATH"] = os.pathsep.join([str(Path(sys.executable).parent), env.get("PATH", ""), str(Path(node).parent)])
    return env


def backend(args: list[str], *, capture: bool = False) -> subprocess.CompletedProcess:
    if os.name != "posix":
        raise RuntimeError("AtSys process supervision currently requires macOS or Linux.")
    if not (RUNTIME / "cli.mjs").is_file():
        raise RuntimeError("This install is missing its bundled runtime. Install a built AtSys wheel.")
    executable = node_executable()
    return subprocess.run([executable, str(RUNTIME / "cli.mjs"), *args], env=environment(executable), text=True, capture_output=capture, stdin=subprocess.DEVNULL if capture else None, check=False)


def _private_json(path: Path, value: object, *, replace: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | (os.O_TRUNC if replace else os.O_EXCL), 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write(json.dumps(value, indent=2) + "\n")


def install_integration(project: Path, *, remove: bool = False, provider: str = "codex") -> dict:
    project = project.resolve(strict=True)
    if provider not in ("codex", "copilot", "claude"):
        raise ValueError("Unknown coding provider")
    target = project / {"codex": ".agents/skills/atsys", "copilot": ".github/skills/atsys", "claude": ".claude/skills/atsys"}[provider]
    manifest = project / f".atsys/{provider}-integration.json"
    resources = RESOURCES / f"{provider}-skill"
    if not target.resolve().is_relative_to(project) or not manifest.resolve().is_relative_to(project):
        raise RuntimeError("Integration paths must remain inside this repository.")
    tracked = json.loads(manifest.read_text()) if manifest.exists() else {}
    if not (resources / "SKILL.md").is_file():
        raise RuntimeError(f"Missing packaged skill for {provider}")
    files = {str(p.relative_to(resources)): p.read_bytes() for p in resources.rglob("*") if p.is_file()}
    digest = lambda content: hashlib.sha256(content).hexdigest()
    if remove:
        if not tracked:
            return {"integration": "absent"}
        for name, expected in tracked.get("files", {}).items():
            path = target / name
            if not path.resolve().is_relative_to(target.resolve()):
                raise RuntimeError("Invalid integration manifest path")
            if path.exists() and digest(path.read_bytes()) != expected:
                raise RuntimeError(f"Preserving locally modified integration: {path}")
        for name in tracked.get("files", {}):
            (target / name).unlink(missing_ok=True)
        manifest.unlink()
        return {"integration": "removed", "sourcePreserved": True}
    # Validate every existing destination before changing anything.
    for name, content in files.items():
        path = target / name
        if not path.resolve().is_relative_to(project):
            raise RuntimeError("Integration file resolves outside this repository")
        if path.exists():
            existing = digest(path.read_bytes())
            if existing != digest(content) and existing != tracked.get("files", {}).get(name):
                raise RuntimeError(f"Preserving existing skill file: {path}. Move it explicitly before installing AtSys integration.")
    for name, content in files.items():
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    _private_json(manifest, {"version": 1, "packageVersion": __version__, "files": {name: digest(content) for name, content in files.items()}})
    return {"integration": "installed", "skill": str(target / "SKILL.md"), "invoke": "$atsys <your objective>" if provider == "codex" else "Use the atsys skill to <your objective>"}


def health(port: int) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=0.5) as response:
            return json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return None


def dashboard(*, port: int | None = None, open_browser: bool = True) -> str:
    directory = data_directory()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    expected = hashlib.sha256(str(directory).encode()).hexdigest()
    record_path = directory / "dashboard.json"
    record = {}
    if record_path.exists():
        try:
            record = json.loads(record_path.read_text())
        except (ValueError, OSError):
            pass
    ports = [port] if port is not None else list(dict.fromkeys([record.get("port", 4310), *range(4310, 4331)]))
    selected = None
    for candidate in ports:
        if not isinstance(candidate, int) or not 1024 <= candidate <= 65535:
            raise ValueError("Dashboard port must be 1024..65535")
        live = health(candidate)
        if live and live.get("instanceId") == expected:
            url = f"http://127.0.0.1:{candidate}"
            if open_browser:
                webbrowser.open(url)
            return url
        try:
            with socket.socket() as probe:
                # Match Node's listener behavior: a just-closed dashboard may leave
                # TIME_WAIT sockets, which are not another live dashboard instance.
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(("127.0.0.1", candidate))
            selected = candidate
            break
        except OSError:
            continue
    if selected is None:
        raise RuntimeError("Dashboard port is occupied by another instance. Choose another --port.")
    executable = node_executable()
    env = environment(executable)
    env["ATSYS_PORT"] = str(selected)
    descriptor = os.open(directory / "dashboard.log", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(descriptor, "ab") as log:
        process = subprocess.Popen([executable, str(RUNTIME / "index.mjs")], env=env, cwd=directory, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    for _ in range(60):
        live = health(selected)
        if live and live.get("instanceId") == expected:
            _private_json(record_path, {"port": selected, "pid": process.pid, "instanceId": expected})
            url = f"http://127.0.0.1:{selected}"
            if open_browser:
                webbrowser.open(url)
            return url
        if process.poll() is not None:
            break
        time.sleep(0.1)
    if process.poll() is None:
        process.terminate()
    raise RuntimeError(f"Dashboard startup failed; inspect {directory / 'dashboard.log'}")


def initialize(args: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="atsys init", description="Attach a repository, install a coding-agent skill and start supervision.")
    parser.add_argument("--project", type=Path, default=Path.cwd())
    parser.add_argument("--provider", choices=("codex", "copilot", "claude"), default="codex")
    parser.add_argument("--no-service", action="store_true")
    parser.add_argument("--no-dashboard", action="store_true")
    parser.add_argument("--open", action="store_true", help="Open the dashboard browser tab")
    options = parser.parse_args(args)
    project = options.project.expanduser().resolve(strict=True)
    if not (project / ".git").exists():
        raise ValueError("Run atsys init inside an existing Git repository (or pass --project).")
    pilot = backend(["doctor", "--project", str(project)], capture=True)
    if pilot.returncode:
        raise RuntimeError("Setup doctor failed before initialization: " + (pilot.stdout.strip() or pilot.stderr.strip()))
    path = project / ".atsys/project.json"
    existing = json.loads(path.read_text()) if path.exists() else None
    if existing and (existing.get("schemaVersion") != 1 or existing.get("root") != str(project)):
        raise RuntimeError("Unrecognized existing project configuration; preserving it.")
    if existing and existing.get("controlPlaneDataDir") != str(data_directory()):
        raise RuntimeError(f"Project already uses {existing.get('controlPlaneDataDir')}. Set ATSYS_DATA_DIR to that directory to keep the existing attachment.")
    integration = install_integration(project, provider=options.provider)
    if not existing:
        _private_json(path, {"schemaVersion": 1, "root": str(project), "controlPlaneDataDir": str(data_directory()), "preserveSource": True}, replace=False)
    result = {"project": str(project), **integration, "dataDirectory": str(data_directory()), "codexInstalled": bool(shutil.which("codex")), "provider": options.provider, "providerInstalled": bool(shutil.which(options.provider)), "doctor": json.loads(pilot.stdout)}
    if not options.no_service:
        action = "install" if sys.platform == "darwin" else "start"
        service = backend(["service", action], capture=True)
        if service.returncode:
            raise RuntimeError(service.stderr.strip() or "Watchdog startup failed")
        # Verify actual heartbeat, not merely successful launchctl registration.
        for _ in range(70):
            status = backend(["service", "status"], capture=True)
            state = json.loads(status.stdout) if status.returncode == 0 else {}
            heartbeat = state.get("daemon", {}) or {}
            seen = datetime.fromisoformat(heartbeat.get("heartbeatAt", "1970-01-01T00:00:00+00:00").replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - seen).total_seconds() < 10:
                result["watchdog"] = state
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("Project integration installed, but watchdog did not acquire ownership. Run atsys service status.")
        if sys.platform != "darwin":
            result["serviceNote"] = "Detached watchdog started. Configure your Linux service manager for restart protection."
    if not options.no_dashboard:
        result["dashboard"] = dashboard(open_browser=options.open)
    result["next"] = f"Open or reopen {options.provider} in this repository and say: {integration['invoke']}"
    print(json.dumps(result, indent=2))
    return 0


def task_template(args: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="atsys task template")
    parser.add_argument("--objective", required=True)
    parser.add_argument("--name", default="Coding task")
    parser.add_argument("--project", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path)
    parser.add_argument("--worker", "--provider", choices=("codex", "copilot", "claude"), default="codex")
    parser.add_argument("--supervisor-provider", choices=("codex", "copilot", "claude"))
    parser.add_argument("--repair-provider", choices=("codex", "copilot", "claude"))
    parser.add_argument("--trusted-local-execution", action="store_true", help="Authorize Copilot/Claude CLI tools as your local user; not a Codex sandbox")
    parser.add_argument("--allow-repair", action="store_true")
    parser.add_argument("--network-access", action="store_true", help="Authorize network access in the worker/repair sandbox")
    parser.add_argument("--no-goal-monitoring", action="store_true", help="Explicitly opt out of default Codex milestone monitoring")
    parser.add_argument("--force", action="store_true")
    options = parser.parse_args(args)
    config = json.loads((RESOURCES / "task-defaults.json").read_text())
    config.update(name=options.name, objective=options.objective, cwd=str(options.project.resolve(strict=True)), worker=options.worker, trustedLocalExecution=options.trusted_local_execution, validator="command", validationArgv=[], activityTimeoutSeconds=600, allowRepair=options.allow_repair, networkAccess=options.network_access, goalMonitoring=not options.no_goal_monitoring)
    if options.supervisor_provider: config["supervisorProvider"] = options.supervisor_provider
    if options.repair_provider: config["repairProvider"] = options.repair_provider
    config["goalContract"] = {
        "version": 1, "successCriteria": [], "deliverables": [], "constraints": [],
        "assumptions": [], "unresolvedDecisions": ["Define material goal choices and acceptance evidence before launch"],
        "stages": [], "planSource": "", "observers": [], "recoveryScope": "",
        "escalationConditions": [], "budget": "",
    }
    if options.output:
        _private_json(options.output, config, replace=options.force)
        print(json.dumps({"config": str(options.output.resolve()), "next": "Complete goalContract and plan from request/project inspection; resolve material questions; set validationArgv to the real acceptance command, then submit with atsys task submit --config <file>."}, indent=2))
    else:
        print(json.dumps(config, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    try:
        if not args or args[0] in ("help", "--help", "-h"):
            print(f"""AtSys {__version__} — installed coding-task supervision

  atsys init [--project /repo]           Attach agent skill (--provider codex|copilot|claude) and start services
  atsys integrate [--project /repo]      Install a repository agent skill (--provider codex|copilot|claude)
  atsys integrate --remove              Remove the unmodified managed skill
  atsys ui [--no-open] [--port 4310]     Start/open bundled dashboard
  atsys task template --objective ... [--output .atsys/tasks/task.json]
  atsys task schema                     Print installed task JSON schema
  atsys hooks events                    List task and portable native agent callback events
  atsys hooks run file.py:hooks         Run a project callback (JSON stdin/stdout)
  atsys hooks codex-install --config task.json
                                       Preserve existing hooks; install native bridge for review
  atsys hooks atbot --config atbot.json  Optional Pydantic AI observer callback
  atsys task submit --config task.json  Hand off a task and return immediately
  atsys monitor                        Interactive task picker and live monitoring
  atsys tasks                          Active and paused tasks
  atsys task list [--active] | show ID
  atsys task pause ID | resume ID | stop ID | retry ID
  atsys task status [ID] [--json]       Readable progress, blocker and next action
  atsys task watch [ID] [--once]        Quiet live monitor; leaving does not stop work
  atsys task logs [ID] [--raw]          Formatted activity; --follow for live view, --raw for transcripts
  atsys service install | status | start | uninstall
  atsys run --worker codex --objective ... --validation '["npm","test"]'
  atsys doctor

In Codex: $atsys <your objective>
Persistent data: {data_directory()}
""")
            return 0
        if args[0] in ("--version", "version"):
            print(__version__)
            return 0
        if args[0] == "init":
            return initialize(args[1:])
        if args[:2] == ["hooks", "codex-install"]:
            from .codex_hooks import install
            return install(args[2:])
        if args[0] == "hooks" and args[1:2] != ["codex-config"]:
            from .hooks import main as hooks_main
            return hooks_main(args[1:])
        if args[0] == "integrate":
            parser = argparse.ArgumentParser(prog="atsys integrate")
            parser.add_argument("--project", type=Path, default=Path.cwd())
            parser.add_argument("--provider", choices=("codex", "copilot", "claude"), default="codex")
            parser.add_argument("--remove", action="store_true")
            options = parser.parse_args(args[1:])
            print(json.dumps(install_integration(options.project, remove=options.remove, provider=options.provider), indent=2))
            return 0
        if args[0] in ("ui", "dashboard"):
            parser = argparse.ArgumentParser(prog="atsys ui")
            parser.add_argument("--no-open", action="store_true")
            parser.add_argument("--port", type=int)
            options = parser.parse_args(args[1:])
            print(dashboard(port=options.port, open_browser=not options.no_open))
            return 0
        if args[:2] == ["task", "template"]:
            return task_template(args[2:])
        if args[:2] == ["task", "schema"]:
            print((RESOURCES / "task-schema.json").read_text(), end="")
            return 0
        if args[0] == 'providers' and '--json' not in args:
            from .terminal import show_providers
            return show_providers(backend)
        if args[0] == 'monitor':
            args = ['task','monitor',*args[1:]]
        if args[:2] == ['watch','task']:
            args = ['task','watch',*args[2:]]
        elif args[0] in ('watch','logs'):
            args = ['task',args[0],*args[1:]]
        elif args[0] == 'tasks':
            args = ['task','list','--active',*args[1:]]
        elif args[0] == 'status':
            args = ['task','status',*args[1:]]
        if args[0] == 'task' and args[1:2] and args[1] in ('list','status','watch','logs','pause','resume','stop','retry','monitor') and not any(flag in args for flag in ('--json','--raw')):
            from .terminal import main as terminal_main
            return terminal_main(args, backend)
        return backend(args).returncode
    except KeyboardInterrupt:
        print("\nAtSys CLI closed. Managed execution is controlled separately; use task status to check it.", file=sys.stderr)
        return 130
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, ImportError) as error:
        print(f"AtSys: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

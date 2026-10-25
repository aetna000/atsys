# AtSys

Installable supervision for general coding work: features, bug fixes, refactors, tests, builds, migrations and scripts.

```sh
pip install --upgrade atsys==0.3.0b1
cd /path/to/your/project
atsys init
```

Then open a Codex session in that repository and ask:

```text
$atsys Implement my feature, with tests, under automatic supervision.
```

The bundled skill teaches Codex to inspect the repository, prepare the task objective/plan and acceptance checks, configure bounded supervision/recovery, submit the task, and report a verified handoff. `atsys init` installs the repository skill, attaches the project, installs the macOS watchdog service, and starts the local dashboard. Existing source, AGENTS.md, Git hooks and provider credentials are preserved. Codex CLI and its native login must already be available for model-backed work.

```sh
atsys ui
atsys task list
atsys task status TASK_ID
atsys task watch TASK_ID
atsys doctor --config .atsys/tasks/task.json
atsys task show TASK_ID
atsys task stop TASK_ID
atsys service status
atsys task template --objective "My coding objective" --output .atsys/tasks/task.json
atsys task submit --config .atsys/tasks/task.json
```

The wheel contains the compiled backend and web assets. A Python dependency supplies Node 24; no npm install, development server, or source checkout is needed. State defaults to `~/.local/share/atsys`, overridable with `ATSYS_DATA_DIR`. Runtime state is never written into the installed package.

Version 0.2.1 adds setup checks and a private write/read pilot, progress-stall detection for newly configured Codex tasks, full recovery-plan handoff, readable status/watch/log commands and clearer dashboard phases. Watch is read-only; closing it does not stop the task. Existing task settings and evidence remain intact. Progress is worker-reported; only the independent validator establishes completion.

Tasks run independently of the terminal and dashboard. Codex diagnosis is read-only; separately authorized repair uses workspace-write. Completion requires the configured validator. Telegram is opt-in through the dashboard. Local sleep/power loss suspends work; generic commands run as the local user. Built-in OS service installation currently targets macOS; Linux requires a separately configured service manager. Windows process supervision is unsupported.

Use `atsys init --no-service --no-dashboard` for integration-only setup, `atsys integrate` to install just the Codex skill, and `atsys integrate --remove` to remove the unmodified managed skill. Reopen the Codex session if it was started before the skill was installed.

The 0.3.0b1 beta release adds project lifecycle callbacks (`atsys hooks run file.py:hooks`), native Codex tool/turn hooks and optional `atsys[atbot]` observers. Configure these in task `hooks`; run `atsys hooks events` for supported events. Native Codex hooks need normal `/hooks` trust review after `atsys hooks codex-install --config task.json`. Internal Codex model HTTP requests are not exposed.

The 0.3.0b1 beta UI exposes operational tasks and service/Telegram settings. Activity decodes structured logs, shows newest entries first across all attempts, and supports attempt/text filters and pause display. `atsys task logs ID` shows the same readable activity; the live monitor places the latest message near the top. Raw retained output remains available explicitly.

The unreleased 0.3.0b2 candidate adds Rich terminal views and `atsys monitor` for
task selection. `atsys tasks` lists active/paused work; `atsys watch task ID`
opens a live view with p to pause/resume, s twice to stop and q to leave. Keys
1–5 switch overview, activity, history, hooks and recovery wiring. Direct commands
are `atsys task pause ID`, `atsys task resume ID` and `atsys task stop ID`.
Web task rows and details expose the same controls with stop confirmation.

Pause suspends owned local POSIX process groups and excludes operator pause from
AtSys deadlines; remote requests and provider timers may continue. It requires
the new watchdog and runners. Named milestones explain their source, while
existing count-only reports stay readable. Only the independent validator decides
completion. Closing a monitor leaves task execution running.

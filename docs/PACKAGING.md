# Python installation and Codex onboarding

The wheel packages this checkout's operational runtime and web dashboard. It preserves the separate sibling Python implementation in `claude-atsys`; that checkout is not a build dependency. These implementations share the Python distribution name, so use separate environments when comparing them.

## Install the published release

The terminal/control beta is installed explicitly with `python -m pip install --upgrade atsys==0.3.0b2`. Stable users can remain on 0.2.1. See [beta release notes](releases/v0.3.0b2.md). Pause requires the upgraded watchdog and newly launched runners; older active runners can still be stopped.

```sh
python -m pip install --upgrade atsys==0.2.1
cd /path/to/your/project
atsys init
```

See [0.2.1 release notes](releases/v0.2.1.md), [PyPI](https://pypi.org/project/atsys/0.2.1/) and [GitHub release assets](https://github.com/aetna000/atsys/releases/tag/v0.2.1). Publication is complete only after the tag workflow and registry checks succeed. The historical [0.2.0 workflow](https://github.com/aetna000/atsys/actions/runs/40031931023) established the Trusted Publishing setup; its recorded artifact hashes apply only to that older release.

## Use a downloaded or locally built release

```sh
pip install /absolute/path/to/release/atsys-0.2.1-py3-none-any.whl
# Alternatively, isolate the command with pipx or uv:
uv tool install /absolute/path/to/release/atsys-0.2.1-py3-none-any.whl
cd /path/to/existing/git/repository
atsys init
```

Open/reopen Codex in the repository and invoke `$atsys` with an objective, desired behavior, and constraints. The installed skill performs the setup workflow: inspect the repository, define scope/plan/acceptance, generate a task configuration, configure supervision and bounded repair, check the watchdog, submit once, verify a live attempt, and report task ID and dashboard. Execution then belongs to a separate managed worker. A worker receives an explicit guard against recursively submitting itself.

Initialization preserves source, AGENTS.md, Git hooks, credentials and unrelated skills. It installs `.agents/skills/atsys/`, with content hashes tracked in `.atsys/codex-integration.json`, and writes `.atsys/project.json`. Repeated initialization is safe. Locally edited skill files cause a clear refusal to overwrite; `atsys integrate --remove` also preserves those edits. Keep private runtime/configuration files out of version control.

## CLI and state

```sh
atsys task template --objective "Fix the login regression" --output .atsys/tasks/login.json
atsys task schema
# Set validationArgv, plan and constraints in login.json before submitting.
atsys task submit --config .atsys/tasks/login.json
atsys task show TASK_ID
atsys service status
atsys ui
```

Templates intentionally leave the independent validation command empty: a placeholder success command must not silently validate arbitrary work. Defaults are two retries, supervised recovery, a six-hour attempt limit, a 24-hour task limit, 15-second runner heartbeat deadline, ten-minute output inactivity window, five-minute supervisor timeout and ten-minute validator/repair timeouts. Repair permission is false until explicitly enabled for the authorized objective. The Codex skill adjusts deadlines/checks to the repository and task.

Installed state defaults to `~/.local/share/atsys`, or `$XDG_DATA_HOME/atsys`; `ATSYS_DATA_DIR` overrides it. Dashboard health carries a hash identifying this directory. Startup reuses a matching instance or chooses a free port in 4310–4330. `atsys ui --port PORT` chooses an explicit port. Submission links use the persisted dashboard endpoint. The development dashboard at port 5173 is not needed by pip users.

The wheel bundles JavaScript dependencies and web assets, plus schema, defaults, example, skill and license notices. `nodejs-wheel-binaries>=24,<25` supplies Node as a Python dependency. Codex and project-specific test/build tools remain external prerequisites. Runtime supports macOS/Linux; built-in durable OS service installation currently supports macOS. Linux starts a detached watchdog and requires its own service-manager setup for restart protection. Windows supervision is unsupported. Linux runtime, browser and installed-package checks passed in the release workflow; macOS checks include actual LaunchAgent recovery.

The Python installation must remain present while its service/tasks run. Before moving or removing its environment, stop its tasks and remove its service; install the service again from the replacement environment. Use a consistent data directory to retain history. `service uninstall` removes OS restart protection but deliberately leaves a detached watchdog; it does not cancel existing work.

## Build and verify

Release maintenance requires Node/npm and Python; end users do not need npm.

```sh
npm ci
npm run build:python
python -m pip install build twine
python -m build --outdir release
python -m twine check release/*
python -m venv /tmp/atsys-wheel-test
/tmp/atsys-wheel-test/bin/pip install release/atsys-0.2.1-py3-none-any.whl
/tmp/atsys-wheel-test/bin/python tests/packaging/test_install.py -v
```

`build:python` compiles the backend's four entry points, builds the UI, exports schema/defaults and retains notices. The source distribution includes these prebuilt resources. Its build hook fails clearly if the assets are absent. `python -m build` also rebuilds the wheel from the sdist, verifying that it is self-contained.

Acceptance checks run the installed package from isolated Git workspaces with spaces in their paths. They exercise bundled runtime discovery, skill installation/conflict preservation/removal, dashboard identity, real command execution with separate validation/artifact evidence, and (on macOS) LaunchAgent startup/recovery after killing the watchdog. Tests remove their own services and processes. They do not launch a paid model.

Historical 0.2.0 verification covered 31 runtime tests, 18 desktop/mobile browser checks and five installed-wheel checks on macOS (four on Linux, with the macOS-only LaunchAgent check skipped). [That verification record](packaging-verification.json) contains the older release's artifact sizes and SHA-256 digests. For the new recovery/monitoring checks, see [the usability and native controlled-recovery review](USABILITY-20261024.md) and the 0.2.1 release workflow. Native Codex execution was also verified in [the operational milestone](native-codex-verification.json).

Publication is gated by `.github/workflows/workflows.yml`: manual dispatch verifies a candidate, while a matching version tag publishes only after the checks pass. Never move a published tag or overwrite release artifacts.

## Trusted Publishing configuration

AtMem's actual publisher in `aetnamem/.github/workflows/publish.yml` uses GitHub Actions OIDC (`id-token: write`, environment `pypi`, and `pypa/gh-action-pypi-publish`). It does not use the local `PYPI_TOKEN`. The local AtMem and AtSys token values were compared without printing them and are identical; the local token upload returned PyPI's invalid-authentication response. That response does not imply AtMem's OIDC publishing is broken.

The matching AtSys workflow is `.github/workflows/workflows.yml`. A manual run builds/tests only; a version tag publishes the tested artifacts. It runs application checks, browser tests and clean installed-wheel checks before granting the separate publishing job an OIDC identity. The macOS LaunchAgent check remains locally verified and is skipped on the Linux runner.

The GitHub repository is `aetna000/atsys`. Its initial history and Apache-2.0 license were preserved when the source and workflow were added. Publication succeeded using the following trusted-publisher identity:

| Field | Value |
| --- | --- |
| PyPI project | `atsys` |
| GitHub owner | `aetna000` |
| Repository | `atsys` |
| Workflow filename | `workflows.yml` |
| Environment | `pypi` |

For a new project, a pending publisher can be registered in the PyPI account's publishing settings. AtSys's registration was confirmed operationally by the successful OIDC upload. Future releases should verify the workflow, published digests and a clean registry installation. No static API token is needed for this path. See [PyPI Trusted Publishing](https://docs.pypi.org/trusted-publishers/using-a-publisher/).

"""Install only the generated bridge definitions, preserving unrelated Codex hooks."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def install(args: list[str]) -> int:
    from .cli import backend, _private_json

    parser = argparse.ArgumentParser(prog="atsys hooks codex-install")
    parser.add_argument("--config", type=Path)
    parser.add_argument("--project", type=Path, default=Path.cwd())
    parser.add_argument("--remove", action="store_true")
    options = parser.parse_args(args)
    project = options.project.expanduser().resolve(strict=True)
    target = project / ".codex/hooks.json"
    manifest = project / ".atsys/codex-hook-integration.json"
    if not target.resolve().is_relative_to(
        project
    ) or not manifest.resolve().is_relative_to(project):
        raise RuntimeError("Codex hook integration paths must stay inside the project")
    document = json.loads(target.read_text()) if target.exists() else {"hooks": {}}
    if (
        not isinstance(document, dict)
        or not isinstance(document.get("hooks"), dict)
        or any(not isinstance(v, list) for v in document["hooks"].values())
    ):
        raise ValueError("Preserving unrecognized existing Codex hook configuration")
    previous = json.loads(manifest.read_text()) if manifest.exists() else {}
    if previous and previous.get("version") != 1:
        raise ValueError("Preserving unrecognized Codex hook integration manifest")
    for event, groups in previous.get("added", {}).items():
        existing = document["hooks"].get(event, [])
        for group in groups:
            if group not in existing:
                raise ValueError(
                    "Preserving locally changed AtSys bridge; restore or remove it explicitly"
                )
            existing.remove(group)
        if not existing:
            document["hooks"].pop(event, None)
    if options.remove:
        if not previous:
            print(json.dumps({"integration": "absent"}))
            return 0
        added = {}
    else:
        if not options.config:
            raise ValueError("Supply --config task.json")
        result = backend(
            [
                "hooks",
                "codex-config",
                "--config",
                str(options.config.expanduser().resolve(strict=True)),
            ],
            capture=True,
        )
        if result.returncode:
            raise RuntimeError(
                "Cannot generate native hook configuration; validate the task config first"
            )
        generated = json.loads(result.stdout)["hooks"]
        added = {}
        for event, groups in generated.items():
            existing = document["hooks"].setdefault(event, [])
            for group in groups:
                if group not in existing:
                    existing.append(group)
                    added.setdefault(event, []).append(group)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".atsys-tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write(json.dumps(document, indent=2) + "\n")
    temporary.replace(target)
    if options.remove:
        manifest.unlink()
    else:
        _private_json(manifest, {"version": 1, "added": added})
    print(
        json.dumps(
            {
                "integration": "removed" if options.remove else "installed",
                "file": str(target),
                "next": (
                    "Managed definitions removed; unrelated hooks were preserved."
                    if options.remove
                    else "Open Codex in this project and review/trust the AtSys definitions with /hooks. Existing hooks were preserved; no trust bypass was enabled."
                ),
            },
            indent=2,
        )
    )
    return 0

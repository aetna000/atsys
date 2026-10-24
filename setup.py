"""Refuse incomplete source releases; runtime compilation is a release-build step."""
from pathlib import Path
from setuptools import setup
from setuptools.command.build_py import build_py

class CheckedBuild(build_py):
    def run(self):
        root = Path(__file__).parent / "python" / "atsys"
        for relative in ("_runtime/build.json", "_runtime/cli.mjs", "_runtime/index.mjs", "_runtime/daemon.mjs", "_runtime/attempt-runner.mjs", "_runtime/hook-runner.mjs", "_runtime/native-hook.mjs", "_runtime/dist/index.html", "resources/task-defaults.json"):
            if not (root / relative).is_file():
                raise RuntimeError("Missing bundled runtime. Release maintainers: run npm ci && npm run build:python before python -m build. End users should install a built AtSys wheel or source distribution.")
        super().run()

setup(cmdclass={"build_py": CheckedBuild})

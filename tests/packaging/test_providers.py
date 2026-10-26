"""Provider onboarding from source or an installed wheel; no model calls."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from atsys.cli import install_integration, task_template
from atsys.hooks import Hooks, HookContext, HookResult


class ProviderOnboardingTests(unittest.TestCase):
    def test_each_provider_skill_is_independent_and_preserves_local_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            paths = {"codex": ".agents", "copilot": ".github", "claude": ".claude"}
            for provider, folder in paths.items():
                with self.subTest(provider=provider):
                    install_integration(project, provider=provider)
                    skill = project / folder / "skills/atsys/SKILL.md"
                    self.assertTrue(skill.exists())
                    self.assertIn("goalContract", skill.read_text())
                    if provider != "codex":
                        self.assertIn(f"--worker {provider}", skill.read_text())
                        self.assertIn("trustedLocalExecution", skill.read_text())
                    install_integration(project, provider=provider)
                    skill.write_text(skill.read_text() + "\nlocal custom instruction\n")
                    with self.assertRaises(RuntimeError):
                        install_integration(project, provider=provider, remove=True)
                    self.assertIn("local custom instruction", skill.read_text())
                    skill.write_text(
                        skill.read_text().removesuffix("\nlocal custom instruction\n")
                    )
                    install_integration(project, provider=provider, remove=True)
                    self.assertFalse(skill.exists())

    def test_template_selects_worker_and_roles_without_granting_local_tools(self):
        with tempfile.TemporaryDirectory() as directory:
            for provider in ("copilot", "claude"):
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    self.assertEqual(
                        task_template(
                            [
                                "--worker",
                                provider,
                                "--project",
                                directory,
                                "--objective",
                                "Build a feature",
                                "--supervisor-provider",
                                "claude",
                                "--repair-provider",
                                "codex",
                            ]
                        ),
                        0,
                    )
                config = json.loads(output.getvalue())
                self.assertEqual(config["worker"], provider)
                self.assertEqual(config["supervisorProvider"], "claude")
                self.assertEqual(config["repairProvider"], "codex")
                self.assertFalse(config["trustedLocalExecution"])
                self.assertTrue(config["goalContract"]["unresolvedDecisions"])
                self.assertEqual(config["validationArgv"], [])

    def test_portable_hook_sdk_carries_native_provider_without_changing_authority(self):
        hooks = Hooks()

        @hooks.on.agent_pre_tool
        def deny(ctx):
            return HookResult(
                decision="fail", message=f"Observed {ctx.native['provider']}"
            )

        for provider in ("codex", "copilot", "claude"):
            value = {
                "protocol": "atsys-hook-v1",
                "invocationId": "fixture",
                "event": "agent_pre_tool",
                "task": {"id": "task", "cwd": "/tmp"},
                "attempt": None,
                "native": {
                    "provider": provider,
                    "event": "preToolUse",
                    "toolName": "view",
                },
            }
            result = hooks.dispatch(HookContext.from_dict(value))
            self.assertEqual(result["decision"], "fail")
            self.assertIn(provider, result["message"])


class ProviderEnvironmentTests(unittest.TestCase):
    def test_user_node_precedes_bundled_node_for_native_launchers(self):
        import os
        from unittest.mock import patch
        from atsys.cli import environment
        with patch.dict(os.environ, {"PATH": "/user/node/bin:/usr/bin"}):
            paths = environment("/bundled/node/bin/node")["PATH"].split(os.pathsep)
        self.assertLess(paths.index("/user/node/bin"), paths.index("/bundled/node/bin"))


if __name__ == "__main__":
    unittest.main()

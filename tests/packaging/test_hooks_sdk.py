"""Run using the installed wheel or PYTHONPATH=python for base SDK checks."""

import asyncio
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from atsys.hooks import Hooks, HookContext, HookResult, main


def payload(event="before_run"):
    return {
        "protocol": "atsys-hook-v1",
        "invocationId": "hook-test",
        "event": event,
        "task": {"id": "task-test", "cwd": "/tmp", "objective": "Test hooks"},
        "attempt": {"id": "attempt-test", "phase": "worker"},
    }


class HooksSDKTests(unittest.TestCase):
    def test_sync_async_order_and_rejection(self):
        hooks = Hooks()
        seen = []

        @hooks.on.before_run
        def first(ctx):
            seen.append(ctx.invocation_id)
            return HookResult(message="checked")

        @hooks.on.before_run
        async def second(ctx):
            await asyncio.sleep(0)
            seen.append(ctx.event)
            return {"decision": "fail", "message": "not ready"}

        @hooks.on.before_run
        def unreachable(ctx):
            self.fail("A denied gate must not run later callbacks")

        self.assertEqual(
            hooks.dispatch(HookContext.from_dict(payload())),
            {"message": "not ready", "decision": "fail"},
        )
        self.assertEqual(seen, ["hook-test", "before_run"])

    def test_cli_imports_file_without_polluting_stdout(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "project_hooks.py"
            source.write_text("""from atsys.hooks import Hooks, HookResult
print("module diagnostic")
hooks=Hooks()
@hooks.on.before_run
def check(ctx):
    print("handler diagnostic")
    return HookResult(message=ctx.task["objective"])
""")
            output, error = io.StringIO(), io.StringIO()
            with (
                patch("sys.stdin", io.StringIO(json.dumps(payload()))),
                redirect_stdout(output),
                redirect_stderr(error),
            ):
                self.assertEqual(main(["run", str(source) + ":hooks"]), 0)
            self.assertEqual(json.loads(output.getvalue()), {"message": "Test hooks"})
            self.assertIn("handler diagnostic", error.getvalue())
            self.assertIn("module diagnostic", error.getvalue())

    def test_results_cannot_change_authority_or_invent_invalid_progress(self):
        for value in (
            {"decision": "complete"},
            {"progress": {"completed": 4, "total": 3}},
            {"progress": {"completed": float("nan"), "total": 3}},
            {"progress": {"completed": True, "total": 3}},
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                HookResult(**value).to_dict()
        with self.assertRaises(TypeError):
            HookResult(allowRepair=True)
        with self.assertRaises(ValueError):
            HookContext.from_dict({**payload(), "protocol": "unknown"})

    def test_native_model_and_tool_context(self):
        hooks = Hooks()

        @hooks.on.codex_pre_tool
        def tool_policy(ctx):
            self.assertEqual(ctx.native["model"], "test-model")
            return HookResult(decision="fail", message=ctx.native["toolName"])

        context = HookContext.from_dict(
            {
                **payload("codex_pre_tool"),
                "native": {
                    "provider": "codex",
                    "model": "test-model",
                    "toolName": "Bash",
                },
            }
        )
        self.assertEqual(
            hooks.dispatch(context), {"decision": "fail", "message": "Bash"}
        )

    def test_handler_exception_does_not_print_credentials(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "bad.py"
            source.write_text(
                'from atsys.hooks import Hooks\nhooks=Hooks()\n@hooks.on.before_run\ndef fail(ctx): raise ValueError("secret-example-value")\n'
            )
            output, error = io.StringIO(), io.StringIO()
            with (
                patch("sys.stdin", io.StringIO(json.dumps(payload()))),
                redirect_stdout(output),
                redirect_stderr(error),
            ):
                self.assertEqual(main(["run", str(source) + ":hooks"]), 1)
            self.assertNotIn(
                "secret-example-value", output.getvalue() + error.getvalue()
            )


if __name__ == "__main__":
    unittest.main()

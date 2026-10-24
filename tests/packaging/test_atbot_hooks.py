"""Optional integration test: install atsys[atbot]; uses Pydantic TestModel, no network."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from atsys.integrations.atbot import observe
from atbots.config import AtBotConfig, ProviderConfig, save_config
from atbots.domain import ProviderResult
from atbots.providers.pydantic_ai import PydanticAIProvider
from pydantic_ai.models.test import TestModel


class AtBotHooksTests(unittest.TestCase):
    def test_actual_pydantic_agent_runs_configured_model_request_hooks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            trace = root / "model-hooks.log"
            capability = root / "capability.py"
            capability.write_text(f"""from pathlib import Path
from pydantic_ai.capabilities import Hooks
hooks=Hooks()
@hooks.on.before_model_request
def before(ctx, request_context):
    with Path({str(trace)!r}).open('a') as stream: stream.write('before\\n')
    return request_context
@hooks.on.after_model_request
def after(ctx, *, request_context, response):
    with Path({str(trace)!r}).open('a') as stream: stream.write('after\\n')
    return response
""")
            config = AtBotConfig(
                pydantic_capabilities=[str(capability) + ":hooks"],
                providers=[ProviderConfig(name="test-provider")],
            )
            path = root / "atbot.json"
            save_config(config, path)

            def complete(provider, *, system, prompt, schema, output_type):
                result = provider._run(
                    TestModel(
                        profile={"supports_json_schema_output": True},
                        custom_output_text=json.dumps(
                            {
                                "message": "Observed test evidence",
                                "decision": "continue",
                                "progress": None,
                            }
                        ),
                    ),
                    system,
                    prompt,
                    output_type,
                )
                return ProviderResult(
                    text=result.output.model_dump_json(),
                    structured=result.output.model_dump(),
                    provider="test",
                    model="test",
                    egress_class="local",
                )

            with patch.object(PydanticAIProvider, "complete", complete):
                result = observe(
                    {
                        "protocol": "atsys-hook-v1",
                        "task": {"objective": "Observe fixed test evidence"},
                    },
                    str(path),
                    "test-provider",
                )
            self.assertEqual(
                result, {"message": "Observed test evidence", "decision": "continue"}
            )
            self.assertEqual(trace.read_text().splitlines(), ["before", "after"])

    def test_remote_observation_requires_two_explicit_opt_ins(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "atbot.json"
            save_config(
                AtBotConfig(
                    providers=[
                        ProviderConfig(
                            egress_class="remote", endpoint="https://example.com"
                        )
                    ]
                ),
                path,
            )
            with patch.object(
                PydanticAIProvider,
                "complete",
                side_effect=AssertionError("No model should run"),
            ):
                with self.assertRaises(PermissionError):
                    observe({}, str(path))
                with self.assertRaises(PermissionError):
                    observe({}, str(path), allow_remote=True)


if __name__ == "__main__":
    unittest.main()

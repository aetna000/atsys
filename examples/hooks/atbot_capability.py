"""Optional AtBot/Pydantic AI capability; no AtSys runtime monkeypatching needed."""

from pydantic_ai.capabilities import Hooks

hooks = Hooks()


@hooks.on.before_model_request
def before_request(ctx, request_context):
    # Add project-specific bounded request checks here.
    return request_context


@hooks.on.after_model_request
def after_request(ctx, *, request_context, response):
    return response


@hooks.on.before_tool_execute
def before_tool(ctx, *, call, tool_def, args):
    # Applies to tools within this Pydantic AI agent, if capabilities add tools.
    return args

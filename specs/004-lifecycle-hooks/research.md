# Research and boundaries

Pydantic AI documents before/after/error/wrap hooks around agent runs, nodes, model requests and tools: https://pydantic.dev/docs/ai/core-concepts/hooks/ . AtSys owns task/attempt lifecycle, not the internal graph of a Codex CLI process. Native Codex 0.163.0 exposes PreToolUse/PostToolUse, UserPromptSubmit/Stop, SessionStart and compaction callbacks (https://learn.chatgpt.com/docs/hooks). Reuse those callbacks for tool observation/denial and turn boundaries; they do not expose every internal model HTTP request. Exact definitions require native trust review; bypassing trust is not part of this design. A successful session bridge handshake is required when native callbacks are configured.

The standalone AtBot project exposes `atbots.providers.pydantic_ai.PydanticAIProvider.complete` with typed output and configured `pydantic_capabilities`; those capabilities are passed to `Agent(capabilities=...)`. Reuse that integration through an optional bridge. The separate `atmem-atbot` memory companion does not provide the same independent-agent interface.

Ordinary callbacks should need no model or Python framework. Optional model observers are bounded observations/proposals, never task authority. Explicit argv is trusted local code, with the same local-user trust boundary as command workers.

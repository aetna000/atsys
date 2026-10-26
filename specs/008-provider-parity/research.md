# Provider interfaces

Inspected installed Copilot 1.0.103 and Claude CLI help. Primary references:
https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
https://docs.github.com/en/copilot/reference/hooks-reference
https://code.claude.com/docs/en/cli-reference
https://code.claude.com/docs/en/hooks

Claude print mode supports stream-json, json-schema, tools, allowedTools,
permission-mode dontAsk, settings and strict-mcp-config. Copilot supports JSONL,
stdin prompts, available-tools, allow-tool and attempt-local plugin hooks. Their
shell permission systems differ from Codex sandbox guarantees. Read-only roles
omit execution and mutation tools entirely. Explicit local execution authority
is required for workspace shell tools; do not claim equivalent OS containment.

Copilot native command hook failures/timeouts are not universally blocking and
there is no postCompact event. Advertise these differences; AtSys still records
failure and fences task validation. Do not invent per-HTTP model callbacks.

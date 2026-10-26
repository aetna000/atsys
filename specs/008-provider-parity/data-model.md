# Data model

AgentProvider = codex | copilot | claude; worker also supports command.
Optional supervisorProvider/repairProvider inherit by role. Optional
trustedLocalExecution defaults false. Existing JSON is valid without new fields.
Attempts retain their config snapshot and effective provider; native context
provider expands to all agent providers. Portable agent_* hook events coexist
with legacy codex_* names. Capability metadata describes local process control,
read-only tools, execution isolation, event support and limitations.

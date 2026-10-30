# Model capacity recovery

For AtSys-managed Codex, Claude, and Copilot workers, recognize an explicit provider capacity failure and, only when the operator configured fallback models and retry authority, retry with the next approved model. Preserve workspace, task evidence and existing independent validation. Record each model selection and failure. Do not switch for generic errors, other phases, unconfigured tasks or exhausted budgets. A fresh worker attempt is not native session resume; external side effects may be uncertain. Never promise uninterrupted execution or availability.

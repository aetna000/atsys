# Try the feature

Build/install the 0.3.0b1 candidate wheel in an isolated environment, then follow [the hooks guide](../../docs/HOOKS.md). Start with a command worker and `before_run`/`on_tick` callbacks using [the sample](../../examples/hooks/build_hooks.py). Supply an independent acceptance command.

For Codex, add native events, generate project definitions using `atsys hooks codex-install`, review them in `/hooks`, then submit. Inspect receipts for actual tool/turn observations and the validator receipt for acceptance. A reported active model does not imply per-request model interception.

See [the native verification record](../../docs/native-hooks-verification.json) for an actual Codex tool denial followed by a repaired artifact and independent validation. The optional AtBot tests use real Pydantic AI lifecycle callbacks with TestModel; they do not call an external model endpoint.

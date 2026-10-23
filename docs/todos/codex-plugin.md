# TODO: Codex desktop plugin

Status: deferred at the user's request on 2026-10-24. Resume after testing and qualifying the existing AtSys runtime. No plugin implementation or directory submission is currently scheduled.

## Intended experience

Install AtSys through Codex's plugin interface, run guided setup, and give Codex a coding objective. The plugin prepares and submits a task, reports a verified handoff, and exposes status/recovery actions. The independent AtSys watchdog remains the execution owner after Codex or its conversation closes. Retain the pip package and web dashboard.

## Work to revisit

- Choose the public architecture before submitting: skills that use the existing CLI, or a plugin with structured local MCP tools. The current portal does not support adding MCP to an existing skills-only plugin.
- Package a supported manifest, publisher/version information, icons, setup skill, task skill, and status/stop/retry workflows.
- Make onboarding verify the installed runtime, Codex availability, project attachment, watchdog heartbeat and actual dashboard endpoint. Explain background-service installation and platform limits.
- Preserve bounded repair, independent validation, idempotent submission, explicit scope, unrelated edits and the worker recursion guard.
- Test fresh installation, an existing install, upgrade/removal, worker failure and closing Codex while managed work continues.
- Prepare accurate listing text, support information, a published privacy policy, verified developer/business identity and review materials.
- Test a local marketplace installation before requesting public directory review.

## Public-distribution constraints recorded during research

As checked on 2026-10-24, skills that call local programs require `requires_local_executor: true` and desktop-only distribution. Local MCP public submissions additionally require approved-partner access and organization allowlisting. A directory listing is an approved third-party integration, not OpenAI authorship or endorsement. Recheck these requirements when resuming; they may change.

For MCP review, the documented materials include five positive test cases, three negative cases and a video walkthrough. Keep credentials out of the distributable package.

## Official references

- [Package a plugin](https://developers.openai.com/plugins/build/plugins)
- [Submit desktop-only plugins](https://developers.openai.com/plugins/deploy/desktop-only)
- [Submission and review](https://developers.openai.com/plugins/deploy/submission)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)

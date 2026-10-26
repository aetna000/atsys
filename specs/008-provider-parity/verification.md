# Verification — 26 October 2026

Implemented locally on feat/provider-parity, based on the 0.3.0b3 goal-workflow
release. This implementation is not published and does not replace the running
service. The local development wheel retains the base version 0.3.0b3; do not
upload it over the existing release. Choose a new version before publication.

- 97 backend tests passed. Seventeen provider checks use deterministic fixture
  CLI executables with real managed process groups: three workers, goal progress,
  independent validators and reports; Copilot/Claude supervision, scoped repair,
  retry, portable hook connection/denial, pause/resume/stop and zero-exit provider
  errors; mixed-provider roles; malformed proposals; compatibility guards and
  readable provider messages/tools. Existing Codex/native hook checks pass.
- 20 desktop/mobile Playwright checks passed, including provider/model/policy
  selection persistence and existing task, hook, progress, report and control UI.
- Production TypeScript/Vite/runtime build and Prettier checks passed.
- Wheel and source distribution built and passed Twine metadata checks.
- Fresh installed wheel: 8 installation/integration checks, 6 real terminal/
  rendering checks, 6 hook SDK checks and 3 provider onboarding checks passed.
- Installed CLI diagnostics locate Codex, Copilot and Claude on this machine.
  Copilot 1.0.103 and Claude Code 2.1.281 help interfaces were inspected.
- Source and installed onboarding checks verify independent managed skill paths,
  idempotent install, local-edit preservation/removal, role-selectable templates
  and portable SDK provider context.

No paid model calls or external notifications were used. Fixture execution does
not prove native accounts, subscriptions, remote model access or live provider
hook behavior. These require a separately authorized live task. Do not present
CLI executable presence as integration health. Provider HTTP hooks, native session
resume and universal native callback blocking are not claimed.

Artifacts: ignored .atsys/provider-*.log; local wheel/sdist under
.atsys/provider-parity-distributions; isolated install under
.atsys/provider-parity-venv; screenshots under docs/screenshots/provider-wiring-*.
Provider setup, inheritance, local-tool authority and native-event limits are in
docs/PROVIDERS.md. Existing user work, authentication and service state were not
replaced by this implementation.

## Authorized live acceptance follow-up

The user subsequently requested real small provider tasks and browser-visible
results. On 26 October 2026, separate Claude Code and GitHub Copilot workers each
implemented a standard-library Python slugify function in an isolated Git project.
Both passed the same external validator: eight string cases and three TypeError
cases, plus README existence. AtSys recorded separate successful validator
attempts, SHA-256 artifact digests and durable outcome reports. Claude recorded
18 successful native tool callbacks; Copilot recorded 17. Native login was used
without credential-file inspection. Costs remain unknown.

Dashboard: http://127.0.0.1:45875 (isolated data directory, separate watchdog;
existing user service unchanged). Successful task IDs:

- Claude: task-57b6c0d8-5289-496f-9303-b8a03af7425d
- Copilot: task-06840ccf-43ee-4327-82ce-934c6015c2c5

Failures retained in the dashboard exposed and led to fixes for three issues:
Python's bundled Intel Node shadowed the user's native Node for Copilot's npm
launcher; whole-document redaction truncated large hook context JSON; Copilot's
auto model router rejected an explicit reasoning effort. Regression tests cover
preserved system Node lookup order, bounded recursive context redaction, and
omission of reasoning effort when Copilot selects its default/auto model.
A separate explicit-model probe also failed because that model was unavailable
to the account; no silent fallback was used.

Latest checks: 99 backend tests pass; production/runtime build and Prettier pass;
four installed-wheel provider onboarding/environment tests pass. Completed result
pages were inspected using standalone Playwright at desktop/mobile sizes because
the in-app browser Node REPL tool was unavailable. The default browser was opened
to the real result pages. Artifacts and receipts are retained under ignored
.atsys/provider-live-20261026, including live-results.json and screenshots.

Remaining live finding: both workers paraphrased goalContract.planSource in their
progress files. The strict contract correctly refused those progress claims;
the UI shows no reported progress rather than inventing a percentage. Prompt
wording should require the literal planSource and avoid the later generic
instruction to choose milestone names when a goal contract already supplies them.
This does not invalidate the separate acceptance receipts. Live supervision,
repair, forced failures and native pause/resume were not exercised in this small
acceptance run; fixture coverage remains the evidence for those paths. Recovery
was notify-only with zero automatic retries and 180-second attempt limits.


## Codex and 0.3.0b4 release candidate

A real Codex worker completed the same isolated slugify objective, with 3/3
contract-bound milestones, two successful lifecycle receipts, an external
11-case validator, required artifact digests and durable final report:
task-68a3ec3d-87a3-440a-91a4-b3231561edbf. The first Codex probe
(task-063ae4ba-f0ab-4d69-87a0-37abdbe10ba6) produced code but failed
closed because its native hook bridge did not connect; native hook trust in the
fresh project was not bypassed. The successful run used lifecycle hooks instead.
Native tool-hook success is not claimed for this fresh Codex test.

The release prompt now explicitly supplies literal goal stages/planSource and
omits the conflicting instruction to choose new milestones when a goal contract
already declares them. Regression assertions cover that prompt contract. Source
versions were advanced to 0.3.0b4 (npm 0.3.0-beta.4). Release status and sanitized
live evidence are recorded separately in docs/releases/v0.3.0b4-verification.json.

Release candidate checks passed: 99 backend tests, 20 desktop/mobile browser
checks, 8 installed-wheel installation/integration checks, 6 SDK checks, 6 terminal
checks, 4 provider/environment checks and 2 optional AtBot tests using TestModel.
Production/runtime build, formatting and wheel/sdist metadata checks passed.
Codex completed status and independent receipt were verified in the browser.

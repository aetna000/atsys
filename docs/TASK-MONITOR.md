# Follow a task without the debug noise

```sh
atsys status                         # latest managed task, not the sample console
atsys task status task-79183f08      # snapshot; a unique ID prefix is enough
atsys task watch task-79183f08       # quiet live view, refreshed in place on a terminal
atsys task logs task-79183f08        # readable activity from every attempt, newest first
```

`watch` is read-only. Ctrl+C closes only the monitor. It does not stop, retry or alter
the managed worker. The monitor exits after completion, operator stop or a blocker,
leaving the final summary visible. Piped output prints only meaningful state changes,
not a fresh JSON document for every heartbeat. `--once` captures one snapshot;
`--interval 5` changes the polling interval (1–60 seconds).

The summary prioritizes state, reported progress, last observer check, supervisor
decision and **NEXT**. Latest readable activity appears near the top and refreshes when real output changes; heartbeat-only updates stay quiet. Reported units can include setup; they are not benchmark passes
or independently verified completion. A worker exiting zero does not mean the goal
passed its acceptance check. Unknown progress remains unknown.

For machine clients/debugging:

```sh
atsys task status ID --json          # compact structured status
atsys task show ID                   # original complete task JSON, unchanged
atsys task logs ID --raw             # complete retained redacted worker output
```

The 0.3.0b1 candidate dashboard shows the same overview first, with newest-first task activity across all attempts. Message/tool envelopes become readable entries, multiline text is preserved, and filters select an attempt or matching text. Pause display freezes only the activity panel; execution and supervision continue. Sample/unavailable console screens are removed from product navigation. Full configuration/plan and raw provider
output are expandable; the timeline shows twelve recent events with older events
available on demand. Deep links work when AtSys is installed beneath a hidden directory.
No provider payload or recovery receipt is removed from persisted state.

Available in [AtSys 0.2.1](releases/v0.2.1.md). Upgrade the package and restart the
dashboard to load the refreshed UI. See the release notes before replacing a running
service's installation environment.

# Plan

Implement a shared bounded plain-text task presenter, CLI snapshot/watch/log commands
and compact managed-task status. Preserve raw JSON interfaces. Strip control characters,
bound wrapping and show precise missing evidence rather than inventing success or cost.
The monitor reads durable state only and ends independently of task processes. Capture
before/after real CLI output rendered in a browser fixture and actual dashboard screenshots.
Use isolated Playwright ports/state. Do not inspect unrelated terminal/browser content.

Constitution: preserved authority/validators/credentials, no benchmark interruption,
no claim of a completed user study, accessible text and independently tested rendering.

## 2026-10-26 pilot log correction verification

Existing pilot JSON events were persisted but hidden by the readable formatter.
The shared presenter now renders explicit task IDs and deduplicated per-attempt
counts against the logged epoch total; unknown totals remain unknown. Counts are
completion reports, not independent acceptance or pass claims. Gates: 71 tests,
typecheck, build, and desktop/mobile real command activity checks passed. Live
installed dashboard and CLI showed `Pilot 10/20 completed · alex/102`. Screenshots:
`/tmp/atsys-pilot-task-numbers-{desktop,mobile}.png`. Only the two presentation
functions were refreshed in the installed CLI and existing dashboard asset, with
backups/digests under `~/.local/share/atsys/presentation-fixes/2026-10-26T04-39-40.163Z`.
No daemon, attempt runner, benchmark source/config or active workload was restarted
or changed. Refresh the browser to load the corrected asset. The existing frozen
pilot emits completion events only; this patch does not invent task-start events.

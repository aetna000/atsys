# Monitor and control coding tasks

AtSys 0.3.0b2 adds a Rich terminal interface and durable local
pause/resume. These controls require the new watchdog and new task runners.

```sh
atsys monitor                      # picker; includes tasks needing attention
atsys tasks                        # active and paused tasks
atsys task list                    # all managed tasks, including finished work
atsys task status ID               # full summary, named milestones and source
atsys watch task ID                # stable live terminal view
atsys task logs ID                 # multiline activity, newest first
atsys task logs ID --follow        # live activity view
atsys task pause ID
atsys task resume ID
atsys task stop ID
```

A unique task ID prefix is sufficient. In the picker, arrow keys or j/k select,
Enter opens, a switches open/all tasks, and q exits. Open tasks include active,
paused and needs-attention work. Selection follows a stable task ID.

In a live view, **p** requests pause or resume; **s twice within four seconds**
requests stop. **q**, Escape or Ctrl+C closes the monitor while the task continues.
The monitor stays open on completion for review. Use **1** for overview,
**2** for activity, **3** for event history, **4** for hook receipts, and **5** for
worker/model/recovery wiring. On small terminals, open a dedicated view or use
`task status ID` for the complete wrapped content. Long overview entries are
shortened to keep controls stable. Activity is newest first.

`--once` prints one snapshot; `--interval 5` changes polling (1–60 seconds).
Piped output contains no terminal control sequences and prints meaningful changes
rather than repeating every heartbeat. `--lines 50` increases static/log activity
shown (maximum 100). Logs show retained evidence, not unlimited history.

## What progress means

The overview shows ordered milestone names, their completed prefix, the reporter
(progress file or named hook), and the worker's explanation of the plan's source.
Eight is not a fixed AtSys total. A worker chooses its decomposition from the
objective and execution plan. Count-only tasks explicitly say names and their
derivation were not recorded.

Workers and hooks can report:

```json
{
  "completed": 1,
  "total": 3,
  "checkpoint": "implementation",
  "milestones": ["Inspect project", "Implement feature", "Run acceptance checks"],
  "planSource": "Decomposed from the objective and project execution plan"
}
```

Names must be unique, total must match their count, and completed is an integer
count of the completed prefix. Names/order/source stay fixed within an attempt;
later count-only updates retain them. Metadata alone does not reset the progress
timeout. Reported completion never replaces the separate validator.

## Pause and stop

Pause persists a request, then the watchdog suspends owned local attempt and hook
process groups with POSIX SIGSTOP. The UI shows **Pausing** until reconciliation
confirms **Paused**. Resume uses SIGCONT and restores the previous phase. AtSys
excludes operator pause from its task, attempt, hook, activity and progress
deadlines, preserving actual heartbeat/progress timestamps. Requests survive
watchdog restart. Unknown process ownership blocks confirmation.

This is local process suspension. Already-issued remote requests, provider
internal deadlines and processes that deliberately leave the managed group may
continue. Native provider session pause is not claimed. Paused tasks retain their
resources. A sleeping host cannot run tasks or send alerts.

Stop works while paused: AtSys kills owned local groups and cancels automatic
recovery. Existing file changes remain. A stopped task stays stopped until an
explicit bounded retry. Legacy runners cannot gain pause support mid-execution;
let them finish or stop and retry under an upgraded watchdog.

Web task rows and details both expose **Pause task**, **Resume task** and
**Stop task**, with stop confirmation. **Pause display** in the activity panel
freezes that panel only and is separate from pausing execution.

## Machine interfaces

```sh
atsys task list --active --json
atsys task status ID --json --activity
atsys task show ID                  # original full task JSON
atsys task logs ID --raw            # retained redacted provider output
atsys task pause ID --json
```

Source Node commands retain text/JSON interfaces. Rich runs through the Python
CLI shipped in the wheel. See [packaging](PACKAGING.md) for building a local
candidate without replacing an existing service installation.

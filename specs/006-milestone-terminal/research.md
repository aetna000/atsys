# Formatter decision

Use Rich Table, Panel, Layout and Live in the pip entry point. The alternate
screen and fixed layout avoid handwritten cursor movement. Text objects preserve
untrusted markup literally; ANSI/control characters are removed. Non-TTY output
uses static snapshots and suppresses heartbeat-only duplicates.

Primary references: https://rich.readthedocs.io/en/stable/live.html and
https://rich.readthedocs.io/en/stable/tables.html. Rich is a core dependency.
AtBot/Pydantic AI remain optional; Node retains policy/execution ownership.

# Derived activity

`ActivityEntry` is a read-only projection of retained attempt output: ID, kind, readable message, optional attempt ID and phase. Newest retained entries appear first within each attempt; task projections visit the latest attempt first. No per-line timestamps are fabricated because the stored output is an untimestamped bounded snapshot. Terminal attempt outcomes retain persisted validation/failure messages.

Filtering, pause-display and theme preferences are browser state. They do not mutate task state or control execution. Existing task/receipt schemas and raw retained output remain unchanged.

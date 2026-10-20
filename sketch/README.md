# sketch

Working files: the [prompt log](PROMPT-LOG.md), design notes, drafts,
and the [capability review](capability-review/index.md) with its
progress register.

**Every file in this folder is to be ignored.** None of it is
documentation, specification or instruction. A note here may be out of
date, or describe a design that changed or was never built, and no
documentation gate reads it. What holds now is in [`docs/`](../docs/),
the decisions are in [`ADR.md`](../ADR.md), and how work is done is in
[`DEV-PROCESS.md`](../DEV-PROCESS.md) and the agent guide,
[`AGENTS.md`](../AGENTS.md).

Two files here are kept to a rule, and both are read as records, not
as direction. An agent appends to the prompt log as `DEV-PROCESS.md`
says. A phase's row in the
[progress register](capability-review/progress.md) changes in the same
commit that changes its status, as `AGENTS.md` says, and
`ts/test/capability-review.test.ts` holds the review's links and
statuses.

# The capability-review progress register

The same-commit rule for the register, and what it carries that no test
can. Summary in [AGENTS.md](../../AGENTS.md).


Forward-looking design work lives in
[`docs/capability-review/`](../../docs/capability-review/index.md): eleven gap
documents (G1–G11), each ending in a numbered implementation plan
(G9 and G10 were opened 2026-08-30, after the original eight had landed;
G11 on 2026-09-09).
**When a phase of one of those plans lands, its row in
[`docs/capability-review/progress.md`](../../docs/capability-review/progress.md)
changes in the same commit** — the register is the single record of what
has been built, and the gap documents are design, not status.

The same-commit rule carries what no test can: whether a pin is TRUE.
The register's STRUCTURE is machine-checked —
`ts/test/capability-review.test.ts` derives the summary table from the
rows below it, requires every gap document to have a register section
and an index row, requires every LANDED row to cite a path or symbol,
keeps the `G1–Gn` range current in the four files that quote it, and
resolves every link — so a miscounted table or an unregistered gap
document fails the build rather than being rediscovered. It is the rule
that keeps
[`test/spec/errcodes.tsv`](../../test/spec/errcodes.tsv) accurate ("new engine
codes must land with a registry row in the same change"), and
errcodes.tsv is the only landing record in this repository that has
never gone stale. Two further rules from the register, worth knowing
before you write a phase entry:

- **A phase is landed only when both ports have it and shared rows pin
  it** (ADR-001). Implemented in TypeScript alone is *partial*, and the
  entry names what is missing.
- **A phase that lands differently from its design says so**, in the
  register and in the gap document, in that commit. G1 phase 6 is the
  worked example — the landed rule is exactness, not the magnitude band
  the design specified, and more rows changed than the design sanctioned.

Suite-size figures ("all N rows must not regress") belong in the
register and nowhere else; all eight gap documents once froze their
own, all eight went wrong within weeks, and each now links the
register's rule 5 instead.

# Minimal reproductions

One directory per defect family; every entry is indexed and explained
in [../BUGS.md](../BUGS.md). Each `.aon` file carries an
`# expected:` / `# actual:` header (and, where needed, the exact
command in an `# run:` line). Run any of them with:

```sh
node ../../ts/bin/aontu.js <file>       # or the command in # run:
```

Two cautions:

- `refer-cycles/refer-in-type-hang.aon` (with its `-schema` companion)
  does not terminate in any practical time — run it under
  `timeout 10` as its header says. `run-all.sh` never executes
  anything in this tree.
- Some entries reproduce **by-design** behaviour whose consequence is
  the finding (marked in their headers and in BUGS.md), and
  `enum-default/match-helper-workaround.aon` is deliberately the
  *working* spelling, kept beside the failing ones.

These are review artifacts. Per ADR-001, the durable home for any
behaviour contract is a `test/spec/*.tsv` row probed in both ports;
promoting these repros into rows is follow-up work for maintainers.

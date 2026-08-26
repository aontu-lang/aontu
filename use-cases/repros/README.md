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
- The whole `enum-default/` family is **FIXED** as of 2026-08-26 by
  the preference admission gate (ADR-004): each header records the
  new behaviour and the shared spec rows that pin it, and BUGS.md
  §1–5 carry Status lines.
- The whole `generator-seal/` family, `sibling-crosswire/`'s
  close/rank-pref halves (`close-key-pack.aon`,
  `rankpref-key-pack.aon`), and `pack-refs/`'s re-anchoring entries
  (`rel-ref-in-expr.aon`, `nested-pack-hole.aon`,
  `spread-expr-sibling.aon`, `hide-computed-drop.aon`) are **FIXED**
  as of 2026-08-26 by the template-clone isolation change (ADR-005):
  headers record the new behaviour and the pinning rows, and BUGS.md
  §8–12, §33–35 carry Status lines. Still open in those families:
  the unequal-spread crosswire (§6, §7 — `idmerge-ref-templates.aon`,
  `oneview-ref-templates.aon`, `two-spreads*.aon`) and the
  self-referential merge expression (§36,
  `merge-expr-onto-pack-child.aon`, `spread-then-pack.aon`).

These are review artifacts. Per ADR-001, the durable home for any
behaviour contract is a `test/spec/*.tsv` row probed in both ports;
promoting these repros into rows is follow-up work for maintainers.

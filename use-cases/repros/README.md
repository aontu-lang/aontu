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
  §8–12, §33–35 carry Status lines.
- The rest of both families is **FIXED** as of 2026-08-26 by the
  spread application rework (ADR-006): the unequal-spread crosswire
  (§6, §7 — `idmerge-ref-templates.aon`, `oneview-ref-templates.aon`,
  `two-spreads*.aon`), the self-referential merge expression (§36,
  `merge-expr-onto-pack-child.aon`), and the generator over
  spread-augmented data (`spread-then-pack.aon`). Headers record the
  new behaviour; the durable pins are the `spread-interleave.tsv`
  spread-unequal-* composition matrix, `gen-pack.tsv`/`gen-each.tsv`
  *-over-spread-augmented and pack-merge-expr-onto-child, `plus.tsv`
  peer-key-expr*, and `vet.tsv` vet-unequal-spread-depths.

- The three defects that fixing §44 surfaced are **FIXED** as of
  2026-08-28, and each has a header recording what changed:
  `diagnostics/pair-before-spread-dropped.aon` (§46, the `elem` rule's
  spread guard), `diagnostics/container-conflict-member-path.aon` with
  its `-map` companion (§47 and an unreported map twin, the container's
  own slot restored before the refusal), and
  `constraint-compose/composed-alias-atom-dropped.aon` (§48, regraded
  from minor to critical — the canon of a composed constraint dropped
  the atom added at the point of use, in BOTH ports). Their pins are
  `spread-list.tsv`, the new `container-path.tsv`, and
  `constraint-alias.tsv`.

- `includes/` (§49, filed 2026-08-28) is **FIXED** as of 2026-08-30,
  by the ruling in ADR-012: four extensions are read as Aontu source
  (`.aon`, `.aontu`, `.json`, `.jsonld`) and every other one — and a
  name with no extension — is refused by name. Both entries need a
  fixture beside them, so the directory carries `vocab.json` and
  `vocab.jsonld` — byte-identical, differing only in name, which was
  the whole point. Their pin is `file.tsv`, the `load-ext-*` block.

- `key-func/` (§50, filed 2026-08-28) is **open**, and was found by
  removing `.$KEY` (ADR-009): the only test covering a spread template
  read through a deep reference used that spelling, whose different code
  path hid a live parity break in `key()`. There is deliberately no
  shared spec row — a row would have to encode one port's answer, and
  which port is right is what is unsettled.

- `recursion/` (§52, filed 2026-08-28) is **open**, and a design
  question rather than a patch: every spelling of a recursive schema
  is refused (`path_cycle`), broken at depth one (`scalar_kind` naming
  neither the recursion nor the schema), or silently vacuous (the
  spread-template spelling generates at any depth and checks nothing).
  The design is written: `docs/design/RECURSION.0.md`.

These are review artifacts. Per ADR-001, the durable home for any
behaviour contract is a `test/spec/*.tsv` row probed in both ports;
promoting these repros into rows is follow-up work for maintainers.

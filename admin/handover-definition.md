# Handover: the Lean definition

Where the work on aontu's Lean definition stands on 2026-11-27, and what
whoever takes it on needs to know. The plan is
[`sketch/DEFINITION.0.md`](../sketch/DEFINITION.0.md): its phases (§5),
its decisions and rulings (§7) and its risks. This note is the state of
the work against it, what waits on whom, and what was learned building
it. It is a snapshot: the plan's phase rows,
[`spec/README.md`](../spec/README.md), [`CHANGELOG.md`](../CHANGELOG.md)
and the merged pull requests stay current, and this note does not.

## Where it stands

- **Shared rows generated from the definition:** 39,842 of the 51,030
  rows in `test/spec/*.tsv` (78.1 %) are written by the oracle into the
  fourteen `test/spec/def-*.tsv` files, and both engines answer every
  one as the definition does. The ledger, `spec/ledger.tsv`, is empty.
- **The definition:** 25 modules in `spec/Aontu/`, 34,436 lines and
  1,159 theorems, none resting on `sorry`. The oracle is
  `spec/Oracle.lean` and 29 modules in `spec/Oracle/`, 12,907 lines.
- **The phases:** P0, P1, P3, P4 and P6 are marked landed. P5 and P7
  to P12 are partial. P2's row carries no status word; what is left of
  it is the seal gap in the README's list.

What each partial phase still lacks, from its row in the plan and the
README's list of gaps. That list names each case the definition doesn't
state yet, with its issue, and is the place to start:

| Phase | Left |
|---|---|
| P5, order and verdicts | 45 rows of `subsume.tsv` the subsume differential can't read yet (session C's branch reads 199 of 201, below); the proof that a verdict is independent of the order a document is written in, which the rows `od0` on and `mp0` on check by evaluation |
| P7, the migration | rules 052, 054 and 062, which the definition states only as meaning or not at all; 052 waits on the ruling below |
| P8, calls on values | #1026, a preference under a call, which waits on its ruling; the rest as its row in the plan lists it |
| P9, generation | a named table that names itself over a selection the data alone supplies, deeper than the document's turns (#1088 first, then session A's branch); #1074; the `null-guard-generates` row of #1073 |
| P10, names and documents | a `move` of a list's element (#668); the bundled vocabularies and the `aontu:` models as documents |
| P11, links and relations | rows for a link in a generator's template whose data another link's template makes (below); the proof for a relation in a spread's template, which the reading answers too slowly |
| P12, grammars | the shaping of a grammar's tree by its annotations, stated over a raw parse the host supplies |

**P11's first item reads already.** A link inside a disjunction or a
selection has been read since 2026-11-06, rows rf108 on and rf150 on.
A link in the template of a generator whose data another link's
template makes reads too: the definition and both engines write the
same output for an `each` and for a `pack` over a list a link's
template supplies, as below. Only rows for it are owed, and the plan's
P11 row now says so:

```aontu
src: {}
l: relate({items: ["a"]}) & path($.src)
x: each($.src.items, {d: relate({z: 1}) & path($.y)})
y: {z: integer}
```

## In flight

The five parallel sessions (tracks A to E) were closed on 2026-11-27.
What each left:

- **C** (P5, then P12): branch `track-c-p5-rows`, no pull request, not
  verified. `ts/scripts/subsume-rows.cjs` writes
  `spec/Oracle/SubsumeRowCases.lean` through `defterm.cjs`, reading 199
  of `subsume.tsv`'s 201 rows (two `at` rows left out), and the Python
  reader is gone. Left: build, regenerate `def-subsume-rows.tsv`,
  check every other generated file is unchanged, run both engines and
  both contract tests, and file an issue for each row the engines
  answer outside its profile's contract. P12 has not started: the
  shaping lives in `@tabnas/abnf`'s compiled builders, and the oracle's
  host parses only one-literal grammars, so its rows need a richer
  host.
- **A** (P9): branch `track-a-p9-rec`, no pull request. #1066, the
  `custom` output option, merged earlier.
  - **#1088's cause is general.** `Val.members` in
    `spec/Aontu/Verdict.lean` reads no meet, so `each`, `pack`, `emit`
    and the folds give `nil` for a bag met with its own kind:
    `x: each(list & [1], _)` is `nil` in the definition, where both
    engines write `{"x":[1]}`. The data's tree reaches a spread's
    member as `list & [tree]`, so the generator's output was `nil` and
    `vet` answered `invalid`.
  - **On the branch, not yet compiled:** `Val.members` reads
    `list & [..]` and `map & {..}` as the bag (`Val.bagKind?`,
    `Val.kindOfBag`), with the new case in `Val.members_checkableA`.
    Also `Decls.readJ` re-expanding the read schema for the data's
    turns, which alone left every generated file unchanged, and
    `spec/Oracle/EmitData.lean` with its cases (rows `ed`, argument
    `emitdata`) and three probes in `spec/Oracle.lean`.
  - **Left, in order:** build, and adjust the proof if the new case
    needs it; regenerate every file and check each row the change moves,
    since a fold or generator over `kind & bag` moves toward the
    engines; rows for #1088's three cases, all three answers agreeing,
    with `emitdata` added to `make spec` or the cases folded into an
    existing file and the probes dropped; then the deep recursion rows,
    P9's row in the plan, the README, the tutorial and the changelog;
    then #1074 and #1073's `null-guard-generates`, not started.
  - **Speed:** a recursive table is very slow in the definition. Five
    probe documents in the three modes took 47 minutes, and a tree 80
    levels deep didn't finish in 50. To pass the document's own turns a
    tree must be about 46 levels deep for #1088's table, so a row there
    is probably impractical: take a smaller table, or prove a theorem
    over `Decls.readJ` instead. The non-recursive traces run in a
    fraction of a second.
- **E** (the engine side): two pull requests left open, both pushed
  and neither fully checked.
  - **#1095** (#984): `when` and `nof` report a stray path into their
    place as `no_path`, and so does a `match` result not taken, with
    rows in `vet.tsv`. `go test ./...` passes, and so do `def-path.tsv`
    and `vet.tsv` in TypeScript. The whole TypeScript spec run stopped
    reporting after 20 minutes and was killed, so it needs a clean run
    with `AONTU_SPEC_SHARES=1`, and the documentation and unit tests,
    before merging.
  - **#1096** (#983, the first half), stacked on #1095: merge #1095
    first, then point #1096 at `main`. Go's `vet.tsv` passes; nothing
    else has run.
  - **Left, in order:** verify and merge the two; #983's second half;
    the absolute stray path in a `match` result not taken (on #984);
    #1010, not started.
  - **Merged:** #1060, #1068, #1080, #1083, #1085, #1086, #1089 and
    #1091, for ruling 91 and #1018, #1032, #971, #963 to #965, #970,
    #1071 and #1078.
- **B** (P11, the engine side, since its container couldn't install
  Lean): nothing open. #1059 merged earlier, so `view`, `reaches` and
  `graph` read a default's edges (ruling 94). #1098 merged at the
  wrap-up and closed #1007. An absolute path below a relation's
  template's root now lands at the link's target, as ruling 50 has a
  relative path do, with sixteen rows in `refer.tsv` that the
  definition answers alike.
  - **Left, in order:** #991, a lone default's parent arm lifting a
    template that is a path met with a kind, which ruling 40 settles;
    #812, TypeScript reading a `must()` in a spread's template at each
    member, as Go and the definition do; #1061 once ruled.
  - **Learned:** deferring a path that is a relation's whole template,
    rather than one below its root, breaks `def-path.tsv` row j159 and
    `refer.tsv`'s `type-through-a-reference`, since that path reads its
    own target.
- **D** (the gaps the bulk check found): two branches pushed, neither
  with a pull request. #1076 (the bulk check, `ts/scripts/defcheck.cjs`),
  #1081, #1090 (closing #1069) and #1092 merged earlier.
  - **`gap-1065-moves`**, work in progress, not built:
    `Decls.movesMade` also counts the moves of the document read at its
    positions. The cause of #1065: `Decls.withMoves` hides only the
    sources of the moves `Decls.movesMade` finds in roots read with no
    position, where a template's `key(1)` is never placed, so the
    `move` waits, is never made, and hides nothing. The staged form
    reads with positions, so the move is made later and its target
    writes, but the source stays. #1075's `move` row is the same cause.
  - **`gap-1065-moves`, what's next:** build it. Probe `x: {&: {k: key()}}`,
    `x: a: {}`, `x: c: move($.x.a)`, which should write
    `{"x":{"c":{"k":"c"}}}`. Then add rows to `spec/Oracle/Gaps.lean`
    with four marked roots for `leftRootCases`: `hide(1)`,
    `type(1) & number`, `hide("x")` and `hide(*{a: 1} | {b: 2})`.
    Both engines and the definition write `null` for each.
  - **`gap-1075-gen-super`**, parked: `Val.super` keeps a `gen` rider.
    It builds, with its proofs fixed, but hasn't been regenerated. It
    isn't the fix for #1075's boolean row, which is #1097.
  - **Left, in order:** #1065; #1072, then #1064, the `key()` cluster;
    #1073's `atom-relation-member-is-a-link-target`. That last one:
    with `p: {}`, `r: relate() & {a: path($.p)}` and
    `q: relate() & path($.r.a)`, the checks pass but the staged form
    writes `nil`, so a link to a member of a relation meets a conflict
    in the link flow. Without `relate()` on `q`, or with it on `r.a`
    instead of `r`, it writes as both engines do.

Beside these, #1093, from the lang refinement work, merged on
2026-11-27. It adds `at` and a third argument to `pack` in both engines,
and the definition of both is owed: they are gaps here now.

## What waits on the maintainer

Seven rulings were put on 2026-11-27, each with a recommendation; "all
as recommended" settles them. The issue holds each question.

| Question | Recommended |
|---|---|
| #997, a bare `open()` inside `pref()` or `super()` | it lifts the seal, as decision 46 says for all three calls; the definition moves |
| #998, a bare `close()` and the value its place ends up with | it seals that value, whichever call made it; both sides move |
| #1026, `*1 \| integer` under `+` | it means `*1`; the engines move for the written form, the definition for the form a meet leaves |
| rule 052, how two `meta()` records merge | left out of the definition, as the syntax is; only the tools read it |
| #1058, a `match` pattern written as a path | it reads its target where it stands, as Go does; TypeScript moves |
| #1061, `view`, `reaches` and `graph` over a disjunction with no default | they read every arm; both engines move |
| #1070, a list literal as a `match` or `filter` pattern | it matches only lists of its own length, as an arm does; the definition moves |

One more, raised by session D on #1073 (`hide-computed-pack-copy`): at
the top of a place a path copies, is a call or an operation over a
relative path read where the place stands, as a bare relative path is,
or made again at the copy, as the reference says? The engines split:
they read `"|" + .se`, `.n + 1` and `upper(.se)` at the target, and
make a fold (`sum(.l)`, `join(.l, "-")`) again at the copy (#944). The
definition makes each again at the copy. The recommendation is to read
each where the place stands, as a bare relative path is: the definition
moves, and both engines move for the folds.

Four questions were settled by existing decisions, without a ruling.
The maintainer can overturn any of them:

- **#983** and **#984**: the engines move to the definition. Go holds
  the arm where defaults of two ranks both stand. A path that names
  nothing is an error across ranks, under `when` and `nof`, and in a
  `match` result not taken, relative or absolute (decision 17, rulings
  53, 61 and 96). Across ranks, the stray path a lone default's own
  value holds is the schema's error, as at one rank, while an arm the
  schema writes as a disjunction still just fails (#982); the comment
  on #983 says so.
- **#1088**: the definition moves to the engines' `valid`. A generator
  in a spread's template reads the member's sibling as the data writes
  it (decisions 26 and 37).
- **A marked scalar root** writes `null`. The definition already did,
  and #1091 brought both engines to it.

One call went the other way. #1075's `gen-boolean-default-overridden`
row looked like a gap in the definition, but it is a leak in both
engines. They write the annotation of a preferred arm the data overrides
onto the arm that survives, so the definition stays and the row's
expected value changes with the fix: #1097.

## How the work is done here

[`AGENTS.md`](../AGENTS.md), [`DEV-PROCESS.md`](../DEV-PROCESS.md),
[the testing page](../docs/contributing/testing.md) and
[`spec/README.md`](../spec/README.md#build-and-run) hold the rules. What
they do not say, learned on this work:

- **Building.** `lake build` in `spec/`, with `$HOME/.elan/bin` on the
  path. A change to `Syntax`, `Meet` or `Verdict` rebuilds almost
  everything, about 30 minutes. The heaviest chain of the oracle
  peaks near 12 GB, so run one build at a time.
- **Regenerating.** Run the oracle once for each of the fifteen files it
  writes (`make spec` on `main`), and require every file a change
  doesn't mean to touch to come out byte for byte. A row a change does
  mean to move is checked in both engines before it is committed:
  `go test -run 'TestSpec/def-path' -count=1 .` in `go/`, and
  `AONTU_SPEC_SHARES=1 node --test --test-name-pattern='def-path.tsv'
  dist-test/spec.test.js` in `ts/`.
- **Probing the definition.** `ts/scripts/defterm.cjs` turns aontu text
  into the definition's terms. Print them into a Lean file that imports
  `Aontu` and `Oracle.Print`, evaluate `vetG` (with `{}`,
  `{ fill := false }` and `{ lax := true }`) or `outputW`, and run it
  with `lake env lean`. A probe like this answers in seconds, where the
  oracle takes minutes. `ts/scripts/defcheck.cjs` runs the same
  comparison over every hand-written row.
- **Three answers, never one.** An expected value is what both engines
  and the definition agree on. Where they part, the question is which
  moves. TypeScript is canonical between the engines. An existing
  decision settles most questions. One that changes a decision, or
  picks between two readings no decision covers, goes to the
  maintainer with a recommendation.
- **The documentation quotes the code.** `docs/tutorial-definition.md`
  quotes the definition under `<!-- test: quote FILE -->`, and the
  documentation tests require each quote to be a verbatim run of the
  file, so a change to a quoted function updates the quote. The prose
  gate's count must come out "as recorded".
- **Merging.** Merge `main` into a branch, never rebase. When `main`
  brings a change to `spec/` or `test/spec/def-*`, rebuild and
  regenerate again before merging.

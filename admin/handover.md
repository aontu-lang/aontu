# Handover: the lang refinement plan

Where the work on [the lang refinement plan](../sketch/LANG-REFINEMENT-PLAN.0.md)
stands late on 2026-11-27, after the language server's last feature and
the definitions of `at` and of `pack`'s key argument merged, and what
whoever takes it on needs to know. The plan is the design: its parts,
its rulings and its order. This note is the state of the work against
it, what waits on whom, and what was learned building it. It is a
snapshot: the plan's progress notes, [`CHANGELOG.md`](../CHANGELOG.md)
and the merged pull requests stay current, and this note does not.

## Where it stands

The plan has 61 tasks. Part 5's six are deferred by ruling. Of the
other 55, which count P0, the rulings on parts 2 to 7, 30 are done, 2
are in progress and 23 have not started. No pull request from this
work is open.

| Part | Done | In progress | Not started |
|---|---|---|---|
| 1, comprehensions | C0, C1, C2, C7, C8 | C6 | C3, C4, C5 |
| 2, the guide for CUE users | CG1, CG2, CG4 | | CG3, CG5 |
| 3, the language server | LS1 to LS9 | | |
| 4, a short form for a key pattern | KP1, KP2 | | |
| 5, OpenAPI | deferred by ruling | | |
| 6, host values on the command line | HV1 to HV4 | | |
| 7, binary types | BT1, BT2, BT4, BT5 | | BT3 |
| 8, root path references | | | RP1 to RP5 |
| 9, language versions | | | LV1 to LV5 |
| 10, more scalar types | | | ST1 to ST7 |
| 11, the open issues | IS1, IS2 | IS3 | |

The two in progress:

- **C6**, the five defects on the comprehension routes. #870, #871 and
  #754 are fixed. #850, and the half of #868 still open, are the parser
  defect that IS3 fixes, and close with it.
- **IS3**, the parse of negative arguments, `neq(-1, -2, -3)`. The fix
  is merged in the parser as tabnas/expr#121. A release of
  `@tabnas/expr` past 0.6.4, then the pins raised in aontu with the
  shared row, close it. The same family is behind two more findings
  below.

Beside the plan, of the five input and output tasks ruled in
[`IO-FORMATS.0.md`](../sketch/IO-FORMATS.0.md#the-rulings), the data
file operand read by its extension is done; the pins, the output flag,
`encode` in a named format and the readers wait on IS3.

## What each remaining task waits on

- **Nothing, or only work that is done:** C4, `range(n)`. Part 1's
  order puts it last, since it alone changes a trust number, but C3 and
  C5 wait on work outside this plan, so C4 is the next built-in that
  can start; it settles first the diagnostic that already uses the word
  `range` in one engine (ruling 50's note on #313).
- **Another task of the plan:** BT3 on ST5. RP2 to RP5 on RP1. LV1 on
  RP1, and the rest of part 9 on LV1. ST1 on LV1, since by ruling the
  bare word is the kind, so the types need a file's version. The rest
  of part 10 on ST1.
- **Something outside the plan:** C3 and C5 on the defects in how
  `key()` counts levels, which part 11 names and the definition track
  is working through (#1064, #1065, #1072). RP1 on the issue plan's
  work on where copies, bodies and templates read paths. IS3, the rest
  of C6 and the pins on the `@tabnas/expr` release. CG3 on a push from
  an account with the GitHub `workflow` scope, since it changes
  `.github/workflows/daily.yml`. CG5 on access to `aontu-lang/web`.

## What waits on the maintainer

1. **A release of `@tabnas/expr`** carrying tabnas/expr#121. It
   unblocks IS3 and the rest of C6, then the pins and the input and
   output tasks after them. By ruling, raising the pins is a change of
   its own.
2. **A push from an account with the `workflow` scope**, for CG3.
3. **Access to `aontu-lang/web`**, for CG5.
4. **The kind under a hover.** Since LS2 both servers call `null`
   *null* and a `path(...)` value *path*, where TypeScript said
   *scalar*. Whether those two words stay is open.
5. **Whether to file the findings below**, and the questions in the
   last section, each settled conservatively in the building and each
   the maintainer's to change.

## Found and not filed

Each was found on the way to something else, and none is in an issue.

1. **The TypeScript parser throws on an include written as a key**,
   `@"./b.aontu" : 1`, where Go refuses it with
   `multisource_not_found`. The cursor module catches the throw.
2. **Go's diagnostics ignore a trust profile's budgets.** `CheckVars` in
   `go/check.go` builds its own context and never reads the budgets that
   `DiagnosticsTrust` sets. TypeScript's diagnostics apply them.
3. **The language servers read an include with a relative path from
   their working directory**, not from the document's folder.
4. **`aontu model why` through a call's argument**: TypeScript lists the
   value the argument read, and Go does not.
5. **The TypeScript parser overflows its stack** on a call whose first
   argument is an absolute path, the second a relative one, with a
   third after it, `pack($.xs, .q, "a")` or `match($.xs, .q, 1)`, and on
   `at($.xs, -1, -1)`, where Go answers. The IS3 family; the release
   should settle it.
6. **A bound whose argument holds `_` reads nothing in a trial.**
   `pick(filter($.xs, {a: above(at(_, b))}), a)` keeps nothing in both
   engines, and so does `above(.b)`, which is why the comprehension
   guide writes a condition over two fields with `match` and `sub`. In
   TypeScript, `rebuild` in `ts/src/val/PlaceVal.ts` replaces `peg` but
   not the constraint's `pending.args`; the Go cause is not traced. It
   bears on C5.
7. **A list that `pick` or `sort` answers, copied whole into a
   template, is `no_path`** in both engines: `b: pick([$.a], y)` with
   `out: each([1, 2], {v: $.b})`, where the path twin `b: [$.a.y]`
   generates. The fold's list does not keep its members' relative reads.
8. **A filter in an `emit` body still reads nothing** and answers `[]`,
   the defect #754 fixed for the other generators; the definition's
   rows eh6 to eh11 of `test/spec/def-path.tsv` hold today's reading,
   so it is a question for a ruling before it is fixed.
9. **Go's poset comparison does not pass `--text-ext` to `subsume`**,
   where TypeScript does. Older than the operand work.
10. **The hint for `unexpected` says the text is not valid aontu
    syntax**, even where the operand is a YAML or TOML file read as
    data; and a `--var` beside a `.toml` operand is not refused as
    unread, since the commands' data-extension lists stop at the
    include's older set.
11. **The `format_unknown` hint still says "the nineteen"**, with the
    three encodings named beside; and the recognizer's step limit caps
    `format(base64)` at about 210,000 characters, `base64url` at about
    170,000 and `hex` at about 500,000, refused as `parse_failed`.

## The language server, for what follows

Every feature of part 3 is built. Where things are:

- **The analysis layer**, in `ts/src/cursor.ts` and `go/cursor.go`:
  `pathAt`, `sitesOf`, `describeAt`, `definitionAt`, `membersAt`,
  `symbolsOf`, `referencesAt`, `renameAt` and `actionsAt`, with their Go
  twins in PascalCase, and `cursorWalk`, which `findVal`, the outline and
  the references share. Positions come from `positionOf`, which counts a
  line's code units once and finds the line by binary search, so a long
  line stays linear.
- **The servers**, in `ts/src/lsp.ts` and `go/lsp/lsp.go`, with Go's
  message handler in `go/lsp/handler.go`. Each capability is advertised
  in `initialize`; rename refuses with a `ResponseError` of code
  `-32803` whose message names the site, the same text in both.
- **The shared rows**, in `test/spec/cursor.tsv`, in the modes `at`,
  `sites`, `describe`, `define`, `members`, `symbols`, `refs`, `rename`
  and `actions`, which [the shared spec](../docs/shared-spec.md)
  describes; a row that names a fixture file writes `__FIXTURES__` for
  the fixture directory's path.
- **The documentation**: [`docs/lsp.md`](../docs/lsp.md) and
  [`wire-your-editor.md`](../docs/how-to/wire-your-editor.md).

What the next change to a server will meet:

- **References' writes are the `model why` sites**, so a reference's
  path lists the value it reads; rename finds the written key spans
  itself, in the open document and in included files under the root,
  whose text the TypeScript include record now keeps as Go's did.
- **Rename refuses a path a reference copies** wherever the copy is
  written or read, so a type's field that its instances write cannot be
  renamed; a plain `&:` spread beside a key allows it. The root is
  `workspaceFolders`, then `rootUri`, then `rootPath`, as the include
  root already uses.
- **Code actions run `trim --check` on each request**, one evaluation
  per removable entry, and the servers publish no diagnostic for what
  `trim` finds, so the action is offered by range only.
- **The outline is of what the document writes**: a key by its text
  without quotes, a key written twice as two symbols, list elements by
  position, a spread's template as `&`, a type or a conjunction as kind
  Variable, and no declarations.

Parity for each feature was proved by a probe: both servers driven over
standard input with the same requests at every character of a set of
documents, 15,988 requests for rename and 8,929 for references at the
last count, and their answers compared. The scripts were scratch files
and are not in the repository; a feature that answers at a position
deserves one.

## How the work is done here

[`AGENTS.md`](../AGENTS.md), [`DEV-PROCESS.md`](../DEV-PROCESS.md),
[the testing page](../docs/contributing/testing.md) and
[`STYLE-GUIDE.md`](../STYLE-GUIDE.md) hold the rules. What they do not
say, learned on this work:

- **The prompt log.** Each prompt goes into `sketch/PROMPT-LOG.md`
  before the work, and is committed with the first change after it.
  After merging `main` into a branch, read the log's tail: git's
  automatic merge of two appended entries has three times dropped a
  closing fence.
- **Rows from both engines.** Write the rows from the TypeScript engine,
  then run the Go runner over the same file. A row Go answers otherwise
  is a divergence to resolve, never a value to copy.
- **Parallel work in worktrees.** Independent tasks were built at once,
  each in its own `git worktree` on its own branch, sharing one
  `ts/node_modules` by symlink, and merged one at a time into the branch
  that opens the pull request. Two changes to one file that each pass
  the comment gate's density can fail it together; a resolved conflict
  in `ts/dist` must be rebuilt before the push, or the happy path
  refuses the tree; and two definition changes meet in
  `spec/Oracle.lean`'s imports and the oracle's `main`, whose nesting
  the compiler limits, so the `paths` rows are split into two lists.
- **A base that moved.** `main` moved under each pull request several
  times an hour. Merge it in before the pull request merges and run
  again what the change touches; in `CHANGELOG.md` keep both entries.
  Another track's engine change can leave a unit test stale that only
  the sampled group runs: #971's canon and #1078's marked root both did,
  and the fix was the test's expectation, said once on the pull request.
- **The prose counts.** CI pins Vale 3.14.0, and a `master` build
  reports some two thousand more alerts, so the counts must be measured
  with the pinned version: `go install
  github.com/errata-ai/vale/v3/cmd/vale@v3.14.0` with `-ldflags "-X
  main.version=3.14.0"`, since the counts script reads the version. Then
  `vale sync`, `make prose`, and `node ts/scripts/vale-counts.cjs
  --write`.
- **The definition.** `elan` installs with no toolchain; `elan
  toolchain install leanprover/lean4:v4.24.1` fetches the pinned one, and
  a full `lake build` of `spec/` takes half an hour on a loaded machine.
  One build at a time.
- **Coverage stays at 100 % in both ports**, and the daily run checks
  it. An export list's coverage exclusion counts its lines, so `N` moves
  with each export added, and `covcheck.test.ts` checks it.
- **The comment gate**, `make comments`: a comment is only for
  surprising code and as short as it can be, and a file's comment lines
  are at most 12 % of its code lines. "UTF-16 units" reads as a count
  claim.
- **Before a push**, `make quick`, then the tests of what changed; for a
  change to evaluation, every shared row in both engines, about twenty
  minutes together on four shared processors.
- **The automatic review.** A review posts findings when a pull request
  opens, three on each of this session's three. Every one reproduced;
  check each in both engines, fix it in both, answer the thread and
  resolve it. One found a quadratic step the twin test then exposed in
  the other port.
- **Each task's records** land with it: a progress note in the plan, an
  entry under Unreleased in the changelog, the register where the task
  is a built-in or a model, and the documentation pages it changes.

## What has been built

| Pull request | What it carried |
|---|---|
| #856 | the comparison with CUE, and part 1 of the plan |
| #877 | parts 2 to 11 of the plan with their rulings, every open issue placed (IS1, IS2), and the input and output note |
| #911 | C6 in part (#870, #871), C7, HV1, HV2 and HV4 |
| #915 | HV3, CG1, CG2 and LS4 |
| #925 | LS1 |
| #934 | a value sited where it is written, by ruling 65 |
| #966 | KP1 |
| #972 | a host value that reads a path refused in both engines, and the plan's notes on the decision records |
| #989 | KP2 |
| #999 | LS9 |
| #1019 | BT1 |
| #1039 | LS2 |
| #1046 | LS3 |
| #1049 | this note's first version |
| #1087 | CG4, BT2, LS5, and the data file operand read by its extension |
| #1093 | C1, C2, #658 with BT4 and BT5, #754, LS6, and the fold divergence found with C1 |
| #1100 | C8, LS7, LS8, and the definitions of `at` and of `pack`'s key argument |

Outside this repository, tabnas/expr#121 is the parser fix that IS3
waits to release.

## Questions for the maintainer

Each was settled conservatively in the building, is stated in the
plan's progress note of its task, and is the maintainer's to change.

- **`at`:** a choice key, `*a | b`, is refused as `func_arg` rather than
  read as its default; the string `"-1"` names no position in a list,
  as a path segment does not; `maybe(at($.m, $.gone))`, a missing key
  reference, stays `no_path` as `maybe(upper($.gone))` does.
- **`pack`'s key:** absence from `maybe` in `k` refuses the call rather
  than leaving the member out; `key(0)` in `t` reads the new key, not
  the member's; three arguments were `func_arity` and are now read.
- **The definition:** `at` under `maybe` other than as its whole
  argument, `maybe(at($.m, b) & 2)`, is absence in both engines and an
  error in the definition; `maybe(at(at($.m, true), b))` is absence in
  both engines and `func_arg` in the definition; a hidden or `type()`
  field that `k` reads with `at` is keyed by both engines and refused by
  the definition since #1069; a relative path in a three-argument
  `pack`'s `t` or `k` has no rows.
- **`aontu:num`:** PascalCase members; the names up to 32 bits are
  `integer` alone, so they refuse a `0d` value; `Float32` bounds the
  magnitude only; `name-a-reusable-constraint.md` keeps its hand-written
  block beside the pointer.
- **The formats:** the three grammars refuse stray low bits, as `decode`
  does; the names are not JSON Schema formats, so import is unchanged
  and export writes `x-aontu-format`.
- **The data operand:** `.json` and `.jsonld` stay aontu source, since
  the strict JSON reader rounds a whole number no double holds and
  ignores `--exact-numbers`; `fmt` on a data file is left as it was; a
  value read from a data operand carries no positions.
- **The language server:** references' writes are the `model why`
  sites; rename refuses a path a reference copies; a new name beyond
  ASCII is quoted; code actions run `trim --check` per request.
- **The guides:** a seventh how-to group, for readers coming from
  another language; the comprehension guide describes the silent `[]`
  of finding 6 and advises `match`.
- **#754:** whether a filter in an `emit` body reads its member, as the
  other generators' now do.

## Next

By the plan's order, C4, `range(n)`, is the next built-in that waits on
nothing. The definition's four gaps above, and findings 6 and 7, are the
engine and definition work most worth a ruling first. CG3 and CG5 go
once the maintainer supplies the scope and the access; BT3 once ST5
exists; the pins, and the input and output tasks after them, once the
parser is released. The 129 open issues each have their place in
[the issue plan](issue-plan.md).

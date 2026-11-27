# Handover: the lang refinement plan

Where the work on [the lang refinement plan](../sketch/LANG-REFINEMENT-PLAN.0.md)
stands on 2026-11-27, after LS3 merged, and what whoever takes it on
needs to know. The plan is the design: its parts, its rulings and its
order. This note is the state of the work against it, what waits on
whom, and what was learned building it. It is a snapshot: the plan's
progress notes, [`CHANGELOG.md`](../CHANGELOG.md) and the merged pull
requests stay current, and this note does not.

## Where it stands

The plan has 61 tasks. Part 5's six are deferred by ruling. Of the
other 55, which count P0, the rulings on parts 2 to 7, 19 are done, 2
are in progress and 34 have not started. Apart from the one that adds
this note, no pull request from this work is open.

| Part | Done | In progress | Not started |
|---|---|---|---|
| 1, comprehensions | C0, C7 | C6 | C1 to C5, C8 |
| 2, the guide for CUE users | CG1, CG2 | | CG3 to CG5 |
| 3, the language server | LS1 to LS4, LS9 | | LS5 to LS8 |
| 4, a short form for a key pattern | KP1, KP2 | | |
| 5, OpenAPI | deferred by ruling | | |
| 6, host values on the command line | HV1 to HV4 | | |
| 7, binary types | BT1 | | BT2 to BT5 |
| 8, root path references | | | RP1 to RP5 |
| 9, language versions | | | LV1 to LV5 |
| 10, more scalar types | | | ST1 to ST7 |
| 11, the open issues | IS1, IS2 | IS3 | |

The two in progress:

- **C6**, the five defects on the comprehension routes. #870 and #871
  are fixed. #850, and the half of #868 still open, are the parser
  defect that IS3 fixes, and close with it. #754, a `filter`'s
  condition in a member a generator makes, reads nothing and answers
  empty, and is not started.
- **IS3**, the parse of negative arguments, `neq(-1, -2, -3)`. The
  cause is in the expression parser, and the fix is merged there as
  tabnas/expr#121. A release of `@tabnas/expr`, then the pins raised in
  aontu with the shared row, close it.

Beside the plan, the five input and output tasks ruled in
[`IO-FORMATS.0.md`](../sketch/IO-FORMATS.0.md#the-rulings) have not
started: raise the tabnas pins, after IS3; an output flag, after the
pins; `encode` in a named format, after the flag; readers for CSV,
JSONL, XML and grammar-defined input, after the pins and a defect in how
an included file with a list at its root is read; and a data file
operand read by its extension, which needs no new dependency.

## What each remaining task waits on

- **Nothing, or only work that is done:** LS5, LS6 and LS8 stand on
  LS1. C1 and C4 stand on the rulings, though part 1 keeps its own
  order, C1, then C2, then C5 and C3, and C4 last, since it alone
  changes a trust number; C4 also settles first the diagnostic that
  already uses the word `range` in one engine. C8 stands on C7, and
  is revised as each built-in lands. CG4 stands on CG1 and CG2. BT2
  stands on nothing. So does the data file operand.
- **Another task of the plan:** C2 and C5 on C1. C3 and C5 on the
  defects in how `key()` counts levels, which part 11 names. LS7 on LS6.
  CG5 on CG4. BT3 on BT1 and ST5. BT5 on BT1 and BT4. RP2 to RP5 on
  RP1. LV1 on RP1, and the rest of part 9 on LV1. ST1 on LV1, since by
  ruling the bare word is the kind, so the types need a file's version.
  The rest of part 10 on ST1.
- **Something outside the plan:** RP1 on the issue plan's work on where
  copies, bodies and templates read paths. BT4 on #658, where a refusal
  sited in a built-in model frames the entry document's lines in
  TypeScript. IS3, the rest of C6 and the pins on the `@tabnas/expr`
  release. CG3 on a push from an account with the GitHub `workflow`
  scope, since it changes `.github/workflows/daily.yml`. CG5 on access to
  `aontu-lang/web`, where the site lives.

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
5. **Whether to file the four gaps below.**

## Found and not filed

Each was found on the way to something else, and none is in an issue.

1. **The TypeScript parser throws on an include written as a key**,
   `@"./b.aontu" : 1`, where Go refuses it with
   `multisource_not_found`. The cursor module catches the throw, so the
   language server stays up, but the two engines still answer
   differently.
2. **Go's diagnostics ignore a trust profile's budgets.** `CheckVars` in
   `go/check.go` builds its own context and never reads the budgets that
   `DiagnosticsTrust` sets. TypeScript's diagnostics apply them.
3. **The language servers read an include with a relative path from
   their working directory**, not from the document's folder.
   [`docs/lsp.md`](../docs/lsp.md#limitations-and-extension-points)
   says so, and a client can set the directory.
4. **`aontu model why` through a call's argument**: TypeScript lists the
   value the argument read, and Go does not.

## The language server, for LS5 to LS8

Where things are:

- **The analysis layer**, in `ts/src/cursor.ts` and `go/cursor.go`:
  `pathAt` and `PathAt` map a cursor to a path; `sitesOf` and `SitesOf`
  map a path to the sites that write it, as `aontu model why` reads
  them; `describeAt`, `definitionAt` and `membersAt`, and their Go
  twins, answer hover, definition and completion.
- **The servers**, in `ts/src/lsp.ts` and `go/lsp/lsp.go`, with Go's
  message handler in `go/lsp/handler.go`. Each feature's capability is
  advertised in `initialize`.
- **The shared rows**, in `test/spec/cursor.tsv`, in the modes `at`,
  `sites`, `describe`, `define` and `members`, which
  [the shared spec](../docs/shared-spec.md) describes.
- **The documentation**: each feature updates
  [`docs/lsp.md`](../docs/lsp.md) and
  [`wire-your-editor.md`](../docs/how-to/wire-your-editor.md) in the same
  change, as part 3 of the plan asks.

What the next features will meet:

- **A value an include loads is sited in its own file** (ruling 50),
  with a record of where the include stands, `site.load`, so the cursor
  still finds the key that holds it.
- **A value that is all a group holds**, `({ … })` or `(.a)`, is sited
  at the group's outermost `(`, not at its own first character.
  `groupStarts` in both cursor modules allows for it.
- **A relative reference resolves from the path the parser records for
  it**: under a key chain, `b: c: .x` reads inside `b`, and in a list it
  reads from the list. Completion reads the reference being typed by
  parsing the document up to the cursor and asking the engine's own
  `plainRefPath`. LS6 can find every reference that reads a path the
  same way, with `findVal` over the parsed tree.
- **The cursor's tree walk, `kids`, does not enter a constraint's
  arguments**, so `min(.b)` holds a reference it never meets; `findVal`
  adds them. Hover and definition still miss a reference there, the
  same in both servers.
- **The TypeScript parser throws on some text that Go refuses**, and
  `parsed()` in `ts/src/cursor.ts` catches it.
- **LS7 is ruled**: rename edits only files under the workspace root,
  and refuses the whole rename, naming the site, where an edit of text
  cannot keep the document true. **LS8** starts with the one action
  whose edit is decided: remove an entry that `trim --check` reports.

Parity for LS2 and LS3 was proved by a probe: both servers driven over
standard input with the same requests at every character of a set of
documents, 1,430 for completion, and their answers compared. It found
differences no row had pinned. The scripts were scratch files and are
not in the repository; a feature that answers at a position deserves
one.

## How the work is done here

[`AGENTS.md`](../AGENTS.md), [`DEV-PROCESS.md`](../DEV-PROCESS.md),
[the testing page](../docs/contributing/testing.md) and
[`STYLE-GUIDE.md`](../STYLE-GUIDE.md) hold the rules. What they do not
say, learned on this work:

- **The prompt log.** Each prompt goes into `sketch/PROMPT-LOG.md`
  before the work, and is committed with the first change after it.
  After merging `main` into a branch, read the log's tail: git's
  automatic merge of two appended entries has twice dropped a closing
  fence.
- **Rows from both engines.** Write the rows from the TypeScript engine,
  then run the Go runner over the same file. A row Go answers otherwise
  is a divergence to resolve, never a value to copy.
- **Coverage stays at 100 % in both ports**, and the daily run checks it.
  TypeScript counts lines, functions and branch arms: each arm of a
  ternary counts, and an optional chain's short-circuit does not. Go
  counts statements, so an unreachable `return` fails it. A focused run
  with `node --test --experimental-test-coverage` and
  `--test-coverage-include` on the changed module finds a gap before the
  daily run does.
- **An export list's coverage exclusion counts its lines**: the `N` of
  `/* node:coverage ignore next N */` must reach the end of the list,
  and `covcheck.test.ts` checks it. It changes with each export added.
- **The comment gate**, `make comments`: a comment is only for
  surprising code and as short as it can be, and a file's comment lines
  are at most 12 % of its code lines. 55 over 457 fails.
- **`ts/dist` and `ts/dist-test` are committed**: `make build-ts` after
  any change to `ts/src` or `ts/test`.
- **The prose counts.** A change to a gated page moves them: run the
  prose gate, then `node ts/scripts/vale-counts.cjs --write`.
- **Before a push**, `make quick`, about four minutes, then the tests of
  what changed. For the language server, those are the `lsp`,
  `coverage`, `coverage2`, `coverage3`, `trust` and `parity` files of
  `ts/dist-test`, `go test ./lsp`, and the cursor rows in each runner:
  `node --test --test-name-pattern='^cursor' dist-test/spec.test.js`
  with `AONTU_SPEC_SHARES=1` set, and
  `go test -run 'TestSpec/^cursor\.tsv:' .` in `go/`.
- **The automatic review.** A review posts findings when a pull request
  opens. On LS2 and LS3 every finding reproduced, three and then seven:
  check each in both engines, and fix it in both.
- **A base that moved.** When `main` has moved, merge it into the
  branch, and run again what the change touches, before the pull
  request merges.
- **Each task's records** land with it: a progress note in the plan, an
  entry under Unreleased in the changelog, and the documentation pages
  it changes.

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

Outside this repository, tabnas/expr#121 is the parser fix that IS3
waits to release.

## Next

By the plan's order, the language server continues in its table's
order: LS5, document symbols, which is small; then LS6, references;
then LS7, rename, and LS8, code actions. C1, `at`, then C2 are the
largest gain in the language itself: together they make ten of part
1's fifteen comprehension idioms direct or shorter. BT2 waits on
nothing. The 129 open issues each have their place in
[the issue plan](issue-plan.md).

# Test coverage

aontu holds **100 % coverage in both implementations** (Go statement
coverage, TypeScript line, branch and function coverage) as a
[recorded decision](../ADR.md#adr-002--test-coverage-stays-at-100--in-both-implementations),
not an aspiration. This page explains how that is measured, what the
suites actually exercise, and (because 100 % is only meaningful if the
exclusions are justified) every place where code is excluded from the
denominator and why.

## How to reproduce

From the repository root:

```
make cov        # both implementations, and fail if either is under 100 %
make cov-ts     # TypeScript only
make cov-go     # Go only
```

Each target ends in a **gate**: `make cov` exits non-zero and names
the offending lines if anything is uncovered. That is the ADR-002
floor made checkable.

Equivalently, by hand:

```
# TypeScript — Node's V8 coverage over the compiled tests, checked by
# ts/test/covcheck.js against the lcov report
cd ts && npm run build && npm run test-cov-check

# the human-readable table (not the gate, and not part of `make cov`:
# it is a whole extra pass of the suite, and the gate names every
# uncovered item without it)
cd ts && npm run test-cov

# Go — statement coverage, unit tests plus the GOCOVERDIR binary runs
cd go && go tool cover -func=coverage.out   # after `make cov-go`
cd go && go tool cover -html=coverage.out   # annotated source
```

> The two numbers are still **not the same measurement**: Node reports
> V8 line/branch/function coverage, Go reports *statement* coverage.
> Both now read 100 %, but they are 100 % of different things.

## Summary

| Implementation | Metric (tool) | Coverage |
|----------------|---------------|----------|
| TypeScript: `ts/src` | lines (Node `--experimental-test-coverage`) | **100.00 %** |
| TypeScript: `ts/src` | branches | **100.00 %** |
| TypeScript: `ts/src` | functions | **100.00 %** |
| Go: all four packages | statements (`go test -cover` + `GOCOVERDIR`) | **100.0 %** |

Both suites pass in full via `make test`: the TypeScript suite and four
green Go packages, including the shared spec that both engines execute.

Only the ratios are quoted. The absolute counts behind them move with
every change, so they are reproduced rather than remembered: rerun
`make cov`, which prints them, rather than trusting this page.
The suite's SIZE is deliberately not quoted here: every count of it
lives in the
[capability-review progress register](capability-review/progress.md#the-update-protocol),
rule 5, with its reproduction commands, because a figure kept in two
places goes wrong in one of them.

### What the measurement includes

A meaningful 100 % needs the measurement to be as sound as the tests it
counts:

- **Go `main()` functions really run.** `make cov-go` builds both
  command binaries with `go build -cover`, runs them for real (version,
  a piped document, an immediate-EOF LSP session) under `GOCOVERDIR`,
  converts with `go tool covdata textfmt`, and unions that profile into
  the unit profile with `go/scripts/covmerge`.
-  **TypeScript entry points are thin wrappers.** `bin/aontu.js` and
  `bin/aontu-lsp.js` hold the shebang and the `main(process.argv)`
  call (the two things no in-process run can execute) so `src/cli.ts` and
  `src/lsp-server.ts` are ordinary, fully measurable modules.
- **The gate reads lcov, not the summary table.** Node's built-in
  coverage reporter attributes the accessors `tsc` emits for
  `export { X }` to the import lines and then counts one of them unhit
  even when V8 recorded a call. The lcov reporter and the raw
  `NODE_V8_COVERAGE` data agree with each other at 100 %, so
  `ts/test/covcheck.js` reads lcov. The summary table remains a useful
  human report; it is simply not the thing CI checks.
- **The run does not flake.** `node --test` runs each test file in its
  own process and merges their coverage at the end; under load that
  merge drops a handful of observations, and which ones it drops moves
  around. The gate therefore goes through `ts/test/covrun.js`, which
  reruns and **unions** reports: a line seen executing in any run did
  execute, the same argument that lets `covmerge` union the Go
  profiles. (Single-process mode was tried first and rejected:
  several cases depend on a fresh module registry, and coverage drops
  to ~99.6 % because they stop exercising what they were written for.)
  The spawned-binary cases in `cli.test.ts` also no longer pass
  `NODE_V8_COVERAGE` to their children: those assert the packaged
  binary's behaviour, while the same paths are measured in-process.
- **What the union keys on decides whether it can hide a gap.** A line
  number identifies a line, so line counts union safely, and a gap in
  code no test exercises is short in every run. A branch arm's block
  number and a function's `anonymous_N` name identify nothing across
  runs: each numbers what that run reported for the file, so a record
  the run omitted renumbers every later one, and the same file came
  back with 118 function records in one run and 71 in another. A union
  keyed on either can credit one arm, or one function, with the hits of
  a different one. Arms and functions are kept per line instead, and a
  run vouches for a line only when it reports at least as many entries
  there as any other run and every one of them is covered. Keyed by
  name, the comparator that orders a package's retractions passed the
  gate whenever a covered function shared its number, and failed it
  when none did.

### One thing the TypeScript measurement does not catch

**A guarded `return` inside a never-taken branch can be reported as
covered.** Observed in `ts/src/vet.ts`: a guard whose
condition the branch above made impossible had its `return` attributed
the same hit count as the enclosing statement: the four source lines
of the `const`, the `if`, the `return` and the closing brace all read
`12` in the lcov. Appending to a file from inside the branch proved
the `return` never executed, in any test, in the whole suite.

The Go gate is not fooled by that shape: it counts coverage BLOCKS,
and the twin of the same guard came back as three uncovered blocks.
The two ports being held to parity is what surfaced it, which is the
second-order argument for ADR-001 that no design document makes. Treat
Go's block count as the sharper of the two instruments where they
disagree, and read a TypeScript line count as evidence that the
*statement* ran rather than that every arm of it did.

## What the suites exercise

### Shared, cross-language spec

`test/spec/*.tsv` (**6847 cases across 124 files**) is run by *both*
implementations and is the contract that defines shared behaviour
([ADR-001](../ADR.md#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec)):

| File | Cases | File | Cases |
|------|------:|------|------:|
| `constraint-product.tsv`    | 441 | `patch.tsv` | 41 |
| `number-tower.tsv`          | 395 | `place.tsv` | 41 |
| `edge.tsv`                  | 338 | `scalar.tsv` | 40 |
| `jsonschema.tsv`            | 291 | `constraint-when.tsv` | 39 |
| `jsonschema-import.tsv`     | 274 | `sort.tsv` | 39 |
| `fmt.tsv`                   | 232 | `disjunct.tsv` | 38 |
| `errcodes.tsv`              | 184 | `aontu-system.tsv` | 37 |
| `view.tsv`                  | 177 | `views.tsv` | 37 |
| `alias.tsv`                 | 172 | `graph.tsv` | 36 |
| `vet.tsv`                   | 167 | `defaults.tsv` | 35 |
| `types.tsv`                 | 166 | `gen-pack.tsv` | 34 |
| `func.tsv`                  | 148 | `seal.tsv` | 34 |
| `subsume.tsv`               | 142 | `template.tsv` | 34 |
| `number-model.tsv`          | 120 | `constraint-cross.tsv` | 33 |
| `constraint-re.tsv`         | 118 | `map.tsv` | 32 |
| `constraint-length.tsv`     | 109 | `gen-filter.tsv` | 31 |
| `str.tsv`                   |  99 | `gen-match.tsv` | 31 |
| `query.tsv`                 |  95 | `deprecate.tsv` | 30 |
| `cmp.tsv`                   |  93 | `super.tsv` | 29 |
| `refer.tsv`                 |  87 | `constraint-multiple.tsv` | 28 |
| `gen-emit.tsv`              |  86 | `diff.tsv` | 28 |
| `maybe.tsv`                 |  78 | `number-exact.tsv` | 28 |
| `pref.tsv`                  |  75 | `recursion.tsv` | 28 |
| `constraint-bound.tsv`      |  74 | `var.tsv` | 28 |
| `ref.tsv`                   |  74 | `engine-parity.tsv` | 23 |
| `meta.tsv`                  |  73 | `identity.tsv` | 22 |
| `file.tsv`                  |  71 | `constraint-alias.tsv` | 21 |
| `optional.tsv`              |  68 | `elision.tsv` | 21 |
| `marks.tsv`                 |  67 | `reach.tsv` | 19 |
| `path.tsv`                  |  66 | `list.tsv` | 18 |
| `uri.tsv`                   |  64 | `aontu-view.tsv` | 16 |
| `constraint-nof.tsv`        |  61 | `plus.tsv` | 16 |
| `number-cross-product.tsv`  |  59 | `aontu-profile.tsv` | 14 |
| `gen-join.tsv`              |  58 | `gen-key.tsv` | 14 |
| `hcanon.tsv`                |  58 | `conjunct.tsv` | 13 |
| `arith.tsv`                 |  57 | `merge-conflict.tsv` | 13 |
| `constraint-contains.tsv`   |  57 | `gen-close.tsv` | 11 |
| `relation.tsv`              |  56 | `trim.tsv` | 11 |
| `gen-each.tsv`              |  55 | `close.tsv` |  9 |
| `why.tsv`                   |  53 | `gen-spread.tsv` |  9 |
| `abnf.tsv`                  |  52 | `incomplete.tsv` |  9 |
| `agg.tsv`                   |  50 | `trace.tsv` |  9 |
| `mod.tsv`                   |  46 | `agentsmd.tsv` |  8 |
| `op-chars.tsv`              |  46 | `container-path.tsv` |  7 |
| `error.tsv`                 |  45 | `comment.tsv` |  6 |
| `constraint-must.tsv`       |  44 | `aontu-scheme.tsv` |  4 |
| `containerkind.tsv`         |  42 | `include-trust.tsv` |  4 |
| `rel.tsv`                   |  42 | `divergent.tsv` |  0 |
| `budget.tsv`                |  41 | `signature.tsv` |  0 |

plus the `spread*.tsv` family: **26 files, 173 cases**, one spread
topic per file. `divergent.tsv` is the parity ledger: commentary only,
no data rows (see [the shared spec](shared-spec.md#the-divergence-ledger)),
and `signature.tsv` is the built-in signature declaration the `sig`
generator reads, not a row file, so both count zero.

Regenerate the whole table rather than patching cells: it has drifted
before, and an omitted file reads as "this behaviour is not pinned":

```
for f in test/spec/*.tsv; do
  printf '%s %s\n' "$(grep -P '\t' "$f" | grep -vc '^#')" "$(basename "$f")"
done | sort -rn
```

`edge.tsv` is the coverage drive's own file: parity edges found by
reading uncovered engine code and probing candidate sources through both
engines byte-for-byte before pinning. Its ten batches cover constraint
ties and the residual algebra (leaf narrowing, bound tightening in both
orders, exclusion dedup and tie-breaks), junction folding,
reference/variable path parts of every scalar kind, canon escapes,
expects, lexer edges (based literals, overflow, exactness windows,
separator refusals), comment starters inside text tokens, dangling
operators, list-spread merging, duplicate-key merges of every bag shape,
optional pairs in list position, implicit top-level lists of every raw
scalar kind, and double negation of exact literals.

Each row asserts a canonical form (`canon`), a generated value (`gen`),
the exact serialised bytes (`gens`), an error substring (`err`), an exact
error code (`errc`), an error-code registry entry (`errcode`), the hash
form (`hcanon`) or the canon-hash itself (`hash`), a redundancy report
(`trim`), the derived entity index and edge set (`graph`), a
relation-property report (`relation`), a reachability verdict
(`reaches`), or (in the nine five-column modes) a whole report
about a second input: a validation (`vet`), a compatibility verdict
(`subsume`), a path's value (`query`) or the contributions that made it
(`why`), an overlay (`patch`), a comparison (`diff`), the generated
AGENTS.md stanza (`agentsmd`), or a generator's desugaring under a
marker (`fmt-template`, `fmt-template-lint`). The full encoding of each is in
[the shared spec](shared-spec.md#modes).

### Per-port tests

Only what a shared row cannot express gets a per-port test: ADR-001
prefers a row precisely because one row lifts both engines:

**TypeScript** (`ts/test/*.test.ts`, 2688 tests, 2257 of them shared
rows): every built-in function in depth, the exact leaves, the public
API, LSP diagnostics/hover/completion/framing, the CLI, error rendering,
the validation verb (`vet.test.ts`, and the verb's cases in
`cli.test.ts`), references, parsing, the fixpoint, worked examples: plus three
coverage-driven files (`coverage.test.ts`, `coverage2.test.ts`,
`coverage3.test.ts`) that reach what no source can: the explain-trace
formatters, raw (non-Val) variable bindings, `OpBaseVal` machinery,
`Val`'s inspect rendering, `unite`'s internal-exception catch and cycle
counter, spread-clone arms, constraint internals, the whole CLI driven
in-process on a swapped stdin (readline REPL included), and the LSP
server's frame codec and stream defaults.

**Go** (`go/*_test.go`, plus `lsp` and both commands): the
representation-level invariants, `Generate`'s native exact types, the
kind lattice, file loading, constructors, concurrency, `formatNumber`
parity, the validation verb (`vet_test.go` and `cmd/aontu/vet_test.go`,
the twins of the TypeScript files above): plus four coverage-driven files (`coverage_test.go` through
`coverage4_test.go`) covering scaled-comparison infinities, the
`Check`/`Spans` walkers on constructed trees, `RefVal`/`VarVal`
internals, defer and ratchet arms across the Val types, grammar actions
driven with hand-built `jsonic.Rule` values, the custom lex matchers on
a hand-built lexer, and the budget/clone paths that need a Val the
engine never builds.

## The exclusions, in full

100 % is only meaningful if what was excluded is visible. One hundred and twenty-four
Go sites carry a `//coverage:ignore` marker (five of them
`ignore-block` markers over a block) and TypeScript carries none at all
beyond the export blocks (see below). TypeScript's markers drop LINES
and not branch arms, so a defensive `if` cannot be excused there at
all: the arm is either reachable and tested, or it is deleted. Several
were, when the JSON Schema export landed. Every marker states, in the
source, what state would be required and why nothing can produce it: a
marker without that justification is a defect
([ADR-002](../ADR.md#adr-002--test-coverage-stays-at-100--in-both-implementations),
rule 3).

`make cov-go` prints what it actually dropped (`covmerge: dropped N
marked block(s), M statement(s)`) and that line, not this page, is the
figure of record. The site list below is regenerated, never patched.

**A line marker reaches its statement's BODY, brace to brace**, and the
precision has been wrong in both directions.

*Too short.* `go tool cover` decides where an if-body's coverage block
begins and it has moved: go1.24 opened it at the `{`, on the `if` line;
a later release opens it at the body's first statement. While `covmerge`
matched a marker against its own line alone, the first run of the
coverage gate (on a newer toolchain than any contributor had
installed) reported **forty-two** justified exclusions as failures at
once.

*Too long.* Widening to the whole statement instead reached past the
body into the `else` chain, which is a **sibling arm the author never
marked**, and excused genuinely untested code. That failure is silent:
the gate goes green. So the reach stops at the body's closing brace,
and is compared by **position** rather than line: a closing brace
shares its line with the `else if` that follows it.

`go/scripts/covmerge/main_test.go` pins both directions, naming lines
by marker rather than by number so the assertions cannot drift. And a
marker that matches no block is now **reported by source position**:
the original incident announced itself only as forty-two unrelated
coverage failures, when what had actually happened was that every
marker stopped working.

### Go: 125 marked sites

| Site | Why it cannot be reached, as the marker says |
|------|--------------------------|
| `allow.go` × 2 | `the shape has met the role as a map that holds both lists`; `the shape has met the anchor as a map` |
| `aontu.go` × 1 | `Abs fails only on an unreadable cwd` |
| `cmd/aontu-lsp/main.go` × 1 | `run under GOCOVERDIR by make cov-go` |
| `cmd/aontu/help.go` × 3 | `the file is embedded; absence fails the build`; `the generator writes four columns`; `every indexed file is embedded beside the index` |
| `cmd/aontu/init.go` × 4 | `the file is embedded; absence fails the build`; `the generator writes three columns`; `the generator writes an octal mode`; `every indexed file is embedded beside the index` |
| `cmd/aontu/main.go` × 8 | `no generated value is unencodable`; `Unify and Generate return an *AontuError on every failure path`; `Go has no package leg to warn about`; `Abs fails only on an unreadable cwd` (× 2); `run under GOCOVERDIR by make cov-go`; `Abs fails only on a deleted cwd`; `Getwd fails only on a deleted cwd` |
| `cmd/aontu/pkg.go` × 3 | `Abs fails only on an unreadable cwd`; `the reports are plain structs`; `see above` |
| `cmd/aontu/pkgnet.go` × 1 | `see above` |
| `cmd/aontu/render.go` × 3 | `the whole tree passed CmpTree already, and one File's name is not what it reads`; `the renamed tree claims the same paths bar one, so a check that succeeded once succeeds here`; `excludedPaths refuses only what the first check already took` |
| `cmd/aontu/repl.go` × 1 | `Getwd fails only on a deleted cwd` |
| `cmd/aontu/subsume.go` × 7 | `Abs fails only on an unreadable cwd`; `MkdirTemp fails only on an unwritable tmp`; `--show-prefix above fails first`; `a path git just listed always shows`; `MkdirAll under a fresh temp dir`; `WriteFile under a fresh temp dir`; `the entry was just written from the tree` |
| `cmd/aontu/view.go` × 1 | `Abs fails only on an unreadable cwd` |
| `cmp.go` × 1 | `each component declares its arity; a bad count is refused at parse` |
| `conjunct.go` × 1 | `a fold over >=1 term always appends` |
| `constraint.go` × 2 | `parse-time arity guarantees two; see above`; `no Val kind reaches this arm; see above` |
| `disjunct.go` × 2 | `no caller: the preference gate asks superOf (ADR-011 R4)`; `the meet returns the preference itself; see above` |
| `format.go` × 1 | `a spelling the formatter wrote that does not parse is its defect, and the syntactic check catches those first` |
| `func.go` × 10 | `no resolve arm returns nil`; `resolve never returns the func itself`; `arity {2,2} is refused at parse` (× 2); `arity {1,1} is refused at parse` (× 2); `arity {1,3} is refused at parse`; `arity is refused at parse`; `the 1-arg form returns from Unify`; `arity {1,2} is refused at parse` |
| `generate.go` × 1 | `hasNodeRef true implies a case above` |
| `graphatom.go` × 1 | `a string-kind scalar always holds a string` |
| `jsonschema_import.go` × 1 | `a panic that is not a refusal is a defect, re-raised as it came; TypeScript's twin is reached by an argument Go's signature cannot take` |
| `lang.go` × 10 | `makeLang cannot fail: see mustMakeLang`; `plugin registration cannot fail` (× 4); `allDigits above already vetted the run`; `the literal regex already vetted the digits`; `both callers pass a signed digit run`; `both callers pass unsigned digit runs`; `langForBase cannot fail: see makeLang` |
| `listval.go` × 1 | `no caller: superOf lifts a bag child by child (ADR-011 R4)` |
| `mapval.go` × 1 | `no caller: superOf lifts a bag child by child (ADR-011 R4)` |
| `maybe.go` × 1 | `the interface requires it; nothing asks an absence for a supertype` |
| `mod.go` × 1 | `Unify always answers a Val` |
| `nom.go` × 2 | `arity {1,3} is refused at parse`; `a name with words styles in every style` |
| `op.go` × 1 | `peg is always string, bool or float64` |
| `patch.go` × 1 | `a parsed v: X document is always a map; the guard is type safety on an interface value, not a reachable state` |
| `pkg.go` × 13 | `the caller stat'd this directory` (× 2); `ReadDir listed it a moment ago` (× 2); `a regular, listed file reads`; `a readable store copies` (× 2); `a writable project makes dirs`; `see above` (× 4); `the directory the lock was just read from` |
| `pkgnet.go` × 6 | `the platform's random source answers`; `see above` (× 4); `every URL the client builds parses` |
| `place.go` × 1 | `hasPlace true implies a case above` |
| `profile.go` × 1 | `vet passed, so the meet generates` |
| `query.go` × 3 | `a generated value is always encodable` (× 2); `the arm for a root that is nil-the-INTERFACE rather than nil-the-value, which unifyRoot cannot return: every caller's guard is nil != uerr \|\| nil == root \|\| root.Nil(), and Nil() is true of *NilVal alone, so a root reaching here carries no code and the caller's generic one stands (the same last resort failureFinding keeps in go/vet.go)` |
| `refer.go` × 1 | `pegs are pre-validated by the capture` |
| `scalar.go` × 1 | `no caller: superOf answers for a kind peg (ADR-011 R4)` |
| `sig.go` × 2 | `the grammar is static; registration failure is a build defect`; `the embedded text is suite-gated; a parse failure is a build defect` |
| `source.go` × 8 | `a plugin that cannot install is a broken dependency, not an input`; `Abs fails only on an unreadable cwd`; `an include's string always follows its @`; `parseBase always seats the sink`; `a resolution always carries its full path`; `jsonic hands back a Val or a map, never a raw`; `the readers cannot nest deeper than their own parser allows`; `a JSON-shaped value has no other kind` |
| `trace.go` × 1 | `a resolved tree holds no nil, and keys may outlive peg` |
| `translate.go` × 1 | `arity {2,3} is refused at parse` |
| `trim.go` × 2 | `parseEntry answers a value or an error, never neither`; `the baseline above already parsed this source` |
| `unify.go` × 1 | `a recorded path always resolves; see above` |
| `val.go` × 4 | `Getwd fails only if the cwd is gone`; `a stamped use always carries its offset`; `rowCol never returns a column below 1` (× 2) |
| `vet.go` × 5 | `Abs fails only on an unreadable cwd`; `needs two drives, so no test can reach it`; `the last resort for a root that is nil-the-INTERFACE rather than nil-the-value: every caller's condition is nil == root \|\| root.Nil() \|\| 0 < len(ctx.err), and the first arm has never been observed to fire, but a typed-nil assertion that failed would otherwise dereference nil here: the panic this whole function was fixed to stop (use-cases/BUGS.md §43)`; `every parse failure path returns an *AontuError (lang.go)`; `parseBase names a code on every failure path` |
| `view.go` × 2 | `Abs fails only on an unreadable cwd`; `Rel fails only across volumes` |

Regenerate the site list rather than patching rows: each row is a
file, its marker count, and the markers' own justifications in source
order (`see above` refers to the marker before it in the same file),
and the count above is whatever `covmerge` reports on the run:

```
cd go && grep -rn 'coverage:ignore' *.go cmd/*/*.go lsp/*.go | grep -v _test.go
```

The markers are implemented by `go/scripts/covmerge`, which parses the
marked sources and drops those blocks from the merged profile. Two
properties keep it from flattering the number: a marked block is dropped
**only when its count is zero**, so a coarse marker can never hide
executed code; and a file it cannot find or parse simply has no markers,
so the merge degrades to a plain union rather than silently dropping
everything.

### TypeScript: export blocks only

`ts/src` carries one directive per file, on the trailing
`export { … }` block, because V8 reports those lines as unexecuted in
every run. Nothing else is excluded.

Everything else that was unreachable is **gone rather than excused**,
per ADR-002 rule 4. The round deleted: a `null == resolved` branch that
`?? this` had already made impossible (`RefVal`), the same shape in
`OpBaseVal`, a `null == ctx` guard nine lines after `ctx` was
dereferenced, an `undefined === child` guard after `propagateMarks`
dereferenced the child (`MapVal` and `ListVal`), a `done` flag that was
never set false (`PrefVal`), an array arm unreachable because
`typeof [] === 'object'` (`utility.walk`), `Site` fallbacks that its own
constructor makes impossible, a `___merge` list branch multisource
cannot produce, and the two container arms of `lsp.valKind`: whose
removal also brings it back into line with `valKind` in `go/check.go`.
Two dot-operator handlers were folded onto one guarded builder so the
missing-operand guard has a single, reachable site.

## Keeping it

The floor holds because `make cov` fails when it is breached, and the
order of preference for closing a gap is fixed: a shared spec row first
(it lifts both engines), then a per-port unit test, then (only with a
written justification) a marker, and preferably a deletion instead. A
test that exists only to move the number is worse than the gap it
closes, because it makes the counter lie.

The probing that drives new rows also keeps finding real parity
differences rather than hiding them, each registered rather than
pinned or papered over.

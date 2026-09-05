# Test coverage

aontu holds **100 % coverage in both implementations**—Go statement
coverage, TypeScript line, branch and function coverage—as a
[recorded decision](../ADR.md#adr-002--test-coverage-stays-at-100--in-both-implementations),
not an aspiration. This page explains how that is measured, what the
suites actually exercise, and—because 100 % is only meaningful if the
exclusions are justified—every place where code is excluded from the
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

# the human-readable table (not the gate)
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
| TypeScript—`ts/src` | lines (Node `--experimental-test-coverage`) | **100.00 %** |
| TypeScript—`ts/src` | branches | **100.00 %** |
| TypeScript—`ts/src` | functions | **100.00 %** |
| Go—all four packages | statements (`go test -cover` + `GOCOVERDIR`) | **100.0 %** |

Both suites pass in full via `make test`: the TypeScript suite and four
green Go packages, including the shared spec that both engines execute.

Only the ratios are quoted. The absolute counts behind them move with
every change, so they are reproduced rather than remembered—rerun
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
  call—the two things no in-process run can execute—so `src/cli.ts` and
  `src/lsp-server.ts` are ordinary, fully-measurable modules.
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
  reruns and **unions** reports—a line seen executing in any run did
  execute, the same argument that lets `covmerge` union the Go
  profiles. It cannot mask a real gap: code no test exercises is
  missing from every run, so the union is still short and the gate
  still fails. (Single-process mode was tried first and rejected:
  several cases depend on a fresh module registry, and coverage drops
  to ~99.6 % because they stop exercising what they were written for.)
  The spawned-binary cases in `cli.test.ts` also no longer pass
  `NODE_V8_COVERAGE` to their children: those assert the packaged
  binary's behaviour, while the same paths are measured in-process.

### One thing the TypeScript measurement does not catch

**A guarded `return` inside a never-taken branch can be reported as
covered.** Observed in `ts/src/vet.ts`: a guard whose
condition the branch above made impossible had its `return` attributed
the same hit count as the enclosing statement—the four source lines
of the `const`, the `if`, the `return` and the closing brace all read
`12` in the lcov. Appending to a file from inside the branch proved
the `return` never executed, in any test, in the whole suite.

The Go gate is not fooled by that shape: it counts coverage BLOCKS,
and the twin of the same guard came back as three uncovered blocks.
The two ports being held to parity is what surfaced it—which is the
second-order argument for ADR-001 that no design document makes. Treat
Go's block count as the sharper of the two instruments where they
disagree, and read a TypeScript line count as evidence that the
*statement* ran rather than that every arm of it did.

## What the suites exercise

### Shared, cross-language spec

`test/spec/*.tsv`—**3751 cases across 97 files**—is run by *both*
implementations and is the contract that defines shared behaviour
([ADR-001](../ADR.md#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec)):

| File | Cases | File | Cases |
|------|------:|------|------:|
| `number-tower.tsv`          | 395 | `defaults.tsv` | 29 |
| `edge.tsv`                  | 312 | `diff.tsv` | 28 |
| `constraint-product.tsv`    | 256 | `super.tsv` | 28 |
| `func.tsv`                  | 122 | `file.tsv` | 27 |
| `errcodes.tsv`              | 120 | `recursion.tsv` | 27 |
| `constraint-re.tsv`         | 118 | `pipe.tsv` | 26 |
| `number-model.tsv`          | 112 | `budget.tsv` | 25 |
| `subsume.tsv`               | 106 | `engine-parity.tsv` | 23 |
| `constraint-length.tsv`     | 102 | `var.tsv` | 23 |
| `query.tsv`                 |  92 | `constraint-alias.tsv` | 21 |
| `id.tsv`                    |  81 | `deprecate.tsv` | 21 |
| `vet.tsv`                   |  80 | `elision.tsv` | 21 |
| `constraint-bound.tsv`      |  74 | `gen-each.tsv` | 21 |
| `pref.tsv`                  |  70 | `gen-match.tsv` | 21 |
| `refer.tsv`                 |  62 | `mod.tsv` | 21 |
| `arith.tsv`                 |  59 | `map.tsv` | 20 |
| `number-cross-product.tsv`  |  59 | `std-system.tsv` | 20 |
| `ref.tsv`                   |  56 | `list.tsv` | 18 |
| `jsonschema.tsv`            |  54 | `gen-filter.tsv` | 16 |
| `hcanon.tsv`                |  53 | `plus.tsv` | 16 |
| `why.tsv`                   |  50 | `conjunct.tsv` | 13 |
| `relation.tsv`              |  48 | `merge-conflict.tsv` | 13 |
| `agg.tsv`                   |  44 | `op-chars.tsv` | 13 |
| `patch.tsv`                 |  42 | `reach.tsv` | 13 |
| `place.tsv`                 |  41 | `gen-close.tsv` | 11 |
| `rel.tsv`                   |  40 | `trim.tsv` | 11 |
| `scalar.tsv`                |  40 | `gen-key.tsv` | 10 |
| `alias.tsv`                 |  38 | `close.tsv` |  9 |
| `disjunct.tsv`              |  38 | `gen-spread.tsv` |  9 |
| `graph.tsv`                 |  37 | `incomplete.tsv` |  9 |
| `optional.tsv`              |  37 | `agentsmd.tsv` |  7 |
| `constraint-must.tsv`       |  34 | `container-path.tsv` |  7 |
| `error.tsv`                 |  34 | `comment.tsv` |  6 |
| `gen-pack.tsv`              |  31 | `include-trust.tsv` |  4 |
| `constraint-cross.tsv`      |  30 | `divergent.tsv` |  0 |
| `marks.tsv`                 |  30 | | |

plus the `spread*.tsv` family—**26 files, 167 cases**, one spread
topic per file. `divergent.tsv` is the parity ledger: commentary only,
no data rows (see [the shared spec](shared-spec.md#the-divergence-ledger)).

Regenerate the whole table rather than patching cells—it has drifted
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
(`reaches`), or—in the seven five-column modes—a whole report
about a second input: a validation (`vet`), a compatibility verdict
(`subsume`), a path's value (`query`) or the contributions that made it
(`why`), an overlay (`patch`), a comparison (`diff`), or the generated
AGENTS.md stanza (`agentsmd`). The full encoding of each is in
[the shared spec](shared-spec.md#modes).

### Per-port tests

Only what a shared row cannot express gets a per-port test—ADR-001
prefers a row precisely because one row lifts both engines:

**TypeScript** (`ts/test/*.test.ts`, 2688 tests, 2257 of them shared
rows): every built-in function in depth, the exact leaves, the public
API, LSP diagnostics/hover/completion/framing, the CLI, error rendering,
the validation verb (`vet.test.ts`, and the verb's cases in
`cli.test.ts`), references, parsing, the fixpoint, worked examples—plus three
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
the twins of the TypeScript files above)—plus four coverage-driven files (`coverage_test.go` through
`coverage4_test.go`) covering scaled-comparison infinities, the
`Check`/`Spans` walkers on constructed trees, `RefVal`/`VarVal`
internals, defer and ratchet arms across the Val types, grammar actions
driven with hand-built `jsonic.Rule` values, the custom lex matchers on
a hand-built lexer, and the budget/clone paths that need a Val the
engine never builds.

## The exclusions, in full

100 % is only meaningful if what was excluded is visible. Seventy-five
Go sites carry a `//coverage:ignore` marker—two of them
`ignore-block` markers over a pair—and TypeScript carries none at all
beyond the export blocks (see below). TypeScript's markers drop LINES
and not branch arms, so a defensive `if` cannot be excused there at
all: the arm is either reachable and tested, or it is deleted. Several
were, when the JSON Schema export landed. Every marker states, in the
source, what state would be required and why nothing can produce it—a
marker without that justification is a defect
([ADR-002](../ADR.md#adr-002--test-coverage-stays-at-100--in-both-implementations),
rule 3).

`make cov-go` prints what it actually dropped—`covmerge: dropped N
marked block(s), M statement(s)`—and that line, not this page, is the
figure of record. The site list below is regenerated, never patched.

**A line marker reaches its statement's BODY, brace to brace**, and the
precision has been wrong in both directions.

*Too short.* `go tool cover` decides where an if-body's coverage block
begins and it has moved: go1.24 opened it at the `{`, on the `if` line;
a later release opens it at the body's first statement. While `covmerge`
matched a marker against its own line alone, the first run of the
coverage gate—on a newer toolchain than any contributor had
installed—reported **forty-two** justified exclusions as failures at
once.

*Too long.* Widening to the whole statement instead reached past the
body into the `else` chain, which is a **sibling arm the author never
marked**, and excused genuinely untested code. That failure is silent:
the gate goes green. So the reach stops at the body's closing brace,
and is compared by **position** rather than line—a closing brace
shares its line with the `else if` that follows it.

`go/scripts/covmerge/main_test.go` pins both directions, naming lines
by marker rather than by number so the assertions cannot drift. And a
marker that matches no block is now **reported by source position**:
the original incident announced itself only as forty-two unrelated
coverage failures, when what had actually happened was that every
marker stopped working.

### Go: 75 marked sites

| Site | Why it cannot be reached |
|------|--------------------------|
| `lang.go` × 6—`makeLang`, `langForBase`, and the four `j.Use(...)` registrations | Plugin registration takes compile-time literal options and ignores the base; the same registrations already succeed at package init, so a failure would panic at load rather than reach these arms. |
| `lang.go` × 4—`big.Int.SetString` guards in `isLossyIntegerLiteral`, `exactLiteral`, `exactDecimal` and the signed-digit helper | The digit strings are pre-vetted by `allDigits` or by the literal regex before the call, so `SetString` cannot reject them. |
| `func.go` × 2—`resolve() == nil` and the whole `result == Val(f)` block | No `FuncVal.resolve` arm returns nil or the receiver. The block mirrors TS `FuncBaseVal`, where `resolve()` can return `this`—kept for the ADR-001 shape correspondence. |
| `graphatom.go`—the string type-assert in `predicateName` | A `KindString` scalar always holds a `string`; the assert exists so a broken invariant refuses rather than panics. |
| `unify.go` / `unify.ts`—`applyFlows`' unresolved-path guard | A recorded type flow is written only for a path that HAD resolved, and unification never takes a node back out of the tree: `move` copies and hides its source rather than removing it, which is the one rearrangement that looked like it would (probed in both ports; `flow-lands-then-its-parent-moves` in `test/spec/refer.tsv` pins that the flow still resolves on every pass). The guard is the contract for a rearrangement that does. |
| `conjunct.go`—`case 0` of the outvals switch | A fold over ≥ 1 term always appends; the empty case returned 30 lines earlier. |
| `constraint.go` × 2—`must`'s arity guard, and the final arm of the meet ladder | The parser already refuses a `must` that is not given exactly two arguments. The ladder above the arm is total in practice: every remaining `Val` kind either sorts below a constraint in a conjunct and drives the meet from its own side, or resolves to a scalar or container before a constraint sees it. Both are kept because a broken invariant should fail as a refusal, not as a panic or a silent fall-through. |
| `disjunct.go`—the nil check after an equal-rank pref merge | `PrefVal.Unify` with a pref peer always yields a pref, never a bare nil. |
| `op.go`—the trailing `return nil` of `operate` | `peg` is provably one of string, bool or float64, all handled above. |
| `query.go` × 2—the JSON encoder error arms | A value that generated is a value that encodes; the arms exist so a future generator change refuses rather than emits half a document. |
| `trim.go`—the re-parse failure arm | The baseline pass already parsed the same source. |
| `val.go`—the caret-column clamp in `NilVal.frame` | `rowCol` never returns a column below 1. |
| `vet.go` × 2—the non-`*AontuError` and empty-code arms of `parseFinding` | Every parse failure path in `lang.go` returns an `*AontuError` and names a code; the two arms exist so the report cannot be built from nothing if one ever does not. |
| `aontu.go`, `cmd/aontu/main.go` × 2, `cmd/aontu/subsume.go`—`filepath.Abs` / `os.Getwd` guards | Both fail only on an unreadable or deleted working directory, which no test can produce without breaking the runner itself. |
| `cmd/aontu/main.go`—the `pkg` arm of the trust warning | The Go resolver chain has no package leg to warn about; the arm keeps the two ports' warning code the same shape. |
| `cmd/aontu/main.go`, `cmd/aontu-lsp/main.go`—`main()` | Executed for real by the `GOCOVERDIR` leg of `make cov-go`; the marker keeps the unit-only profile accurate rather than excusing an untested function. |
| `modtool.go` × 9, `mod.go`—the filesystem arms of the module tooling | Every one is a second failure of something the line above already succeeded at: a directory the caller just stat'd, a file the listing just named, or a copy into a project the same call chain has already written to. Making any of them fail needs the filesystem to change under the process mid-call. |
| `cmd/aontu/mod.go` × 2—the JSON round-trip arms of the report renderer | `Marshal` and `Unmarshal` over a plain struct the command itself built, so neither can fail; the arms exist so a future report shape refuses rather than prints half an object. |
| `mod.go`—the `strconv` guard after a `\d+` match | The pattern has already vetted the digits, so the conversion cannot reject them—the same family as the `big.Int.SetString` guards above. |
| `mod.go`—the `Unify` nil guard in the resolver | `Unify` always answers a `Val`; the guard exists so a broken invariant refuses rather than dereferences nil. |
| `source.go`—the `filepath.Abs` guard | Same family as the `aontu.go` and `cmd/` guards above: `Abs` fails only on an unreadable working directory. |
| `place.go`—the trailing `return v` of the place fold | `hasPlace` reporting true implies one of the cases above matched; the arm is the total-function tail. |
| `jsonschema.go` × 2—the `nil == v` child guard and `kindType`'s miss | A bag never holds a nil child, and every scalar kind has a JSON type; both arms exist so a broken invariant refuses rather than panics or emits an untyped schema. The TypeScript twin has NEITHER, because its marker cannot excuse a branch (above). |
| `patch.go`—the non-map guard on a parsed document | A parsed `v X` document is always a map; the guard is type safety on an interface value, not a reachable state. |
| `cmd/aontu/subsume.go` × 7—the temp-tree arms of the git-revision leg | Every one is a second failure of something the line above already succeeded at: `MkdirTemp`, then writes and reads under the directory it just created, and a path `git ls-tree` has just listed. |
| `cmd/aontu/repl.go`, `source.go`, `vet.go` × 2—`os.Getwd` / `filepath.Abs` guards | Same family as the `aontu.go` and `cmd/` guards above; one of the `vet.go` pair needs two drive letters and so is unreachable off Windows. |
| `source.go` × 2—the empty-`Full` guard and the jsonic result `ignore-block` | A resolution always carries its full path, and jsonic hands back a `Val` or a map, never a raw third thing. |
| `trim.go`—the neither-value-nor-error arm of `parseEntry` | `parseEntry` answers one or the other. (The re-parse arm is listed above.) |
| `lang.go` × 4 more than listed above—further `j.Use` registrations and digit guards | Same two families: compile-time plugin options that already succeeded at package init, and digit strings a regex or `allDigits` has already vetted. |
| `relation.go` × 5—`addressedNode`'s lookup, its two walk guards, its `default` arm, and the caller's nil check | An edge exists only because `refer()` RESOLVED its full address, so the walk cannot miss: an address that does not walk is `refer_unresolved` at unification and the document never reaches the graph—probed for a missing key, a scalar mid-path and an out-of-range index, in both ports. The TypeScript twin has NONE of them, because its marker cannot excuse a branch; it relies on optional chaining, where a Go nil would panic. |
| `vet.go`—`failureFinding`'s last resort | The fallback for a root that is nil-the-INTERFACE rather than nil-the-value. Every caller's condition is `nil == root \|\| root.Nil() \|\| 0 < len(ctx.err)` and the first arm has never been observed to fire, but a failed type assertion would otherwise dereference nil—the panic that function was fixed to stop ([use-cases/BUGS.md](../use-cases/BUGS.md), entry 43). |

Regenerate the site list rather than patching rows—the count above is
whatever `covmerge` reports on the run:

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
cannot produce, and the two container arms of `lsp.valKind`—whose
removal also brings it back into line with `valKind` in `go/check.go`.
Two dot-operator handlers were folded onto one guarded builder so the
missing-operand guard has a single, reachable site.

## Keeping it

The floor holds because `make cov` fails when it is breached, and the
order of preference for closing a gap is fixed: a shared spec row first
(it lifts both engines), then a per-port unit test, then—only with a
written justification—a marker, and preferably a deletion instead. A
test that exists only to move the number is worse than the gap it
closes, because it makes the counter lie.

The probing that drives new rows also keeps finding real parity
differences rather than hiding them, each registered rather than
pinned or papered over.

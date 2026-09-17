# aontu — agent & contributor guide

aontu is a JSON structure unifier (a purpose-specific dialect inspired by
[CUE](https://cuelang.org/)). This repository ships **two implementations
kept in parity**:

- **TypeScript** in `ts/` — the **canonical** implementation.
- **Go** in `go/` — a port that mirrors the TypeScript semantics.

Three decisions govern everything below and are recorded in
[`ADR.md`](ADR.md): **ADR-001** (the two implementations stay at full
parity, proved by the shared spec), **ADR-002** (coverage stays at
100 % in both, with every exclusion justified in the source), and
**ADR-003** (where a host subsystem supplies semantics, aontu defines
the meaning and rewrites the input rather than trusting the host). Read
those before proposing a change that touches one implementation only,
that adds code no test reaches, or that hands a value to a host library
to interpret.

The structural layout follows [`voxgig/util`](https://github.com/voxgig/util):
top-level `ts/` and `go/` siblings and a fan-out `Makefile`. On top of
that, this repo adds a **shared, data-driven test suite** so both
implementations are checked against the same cases.

> **CI note:** the workflow lives at
> [`.github/workflows/build.yml`](.github/workflows/build.yml) and runs
> three jobs — `build-ts`, `build-go`, and `coverage` (the ADR-002
> floor). Editing anything under `.github/workflows/` needs the GitHub
> `workflow` OAuth scope, so a push that touches it must come from an
> account that has the scope.

## Repository layout

```
.
├── ADR.md               # architecture decision record (the fundamentals)
├── AGENTS.md            # this file
├── CLAUDE.md            # pointer to AGENTS.md
├── Makefile             # fans out to ts/ and go/
├── README.md
├── aontu/               # the built-in aontu: models, named by their path
│   ├── view/view.aon    #   aontu:view — a file named after its folder collapses
│   ├── lang/            #   text.aon is aontu:lang/text
│   └── …                #   inlined into both ports by `make aontu`
├── docs/
│   ├── design/          # design notes — the why behind settled decisions
│   ├── lsp.md           # language server reference
│   └── shared-spec.md   # the shared TSV test format
├── editors/             # editor plugins (VS Code, Emacs, Vim) → aontu-lsp
├── test/
│   └── spec/            # shared test cases — *.tsv (language-agnostic)
│       └── divergent.tsv  # the parity ledger (commentary only, no rows)
├── ts/                  # canonical TypeScript implementation
│   ├── package.json     # `bin`: aontu -> bin/aontu.js, aontu-lsp -> bin/aontu-lsp.js
│   ├── src/             # source incl. cli.ts, lsp.ts, lsp-server.ts (+ src/tsconfig.json -> ../dist)
│   ├── scripts/         # the generators — aontu.cjs, sigdecl.cjs, helpdoc.cjs
│   ├── test/            # tests (+ test/tsconfig.json -> ../dist-test)
│   ├── dist/            # committed compiled JS + .d.ts (incl. cli.js)
│   └── dist-test/       # committed compiled tests (the run target)
└── go/                  # Go port
    ├── go.mod           # module github.com/aontu-lang/aontu/go
    ├── *.go             # package aontu (incl. check.go: Check -> []Problem)
    ├── aontumodel/      # GENERATED mirror of /aontu (//go:embed cannot read up)
    ├── lsp/             # LSP library (Diagnostics + Handler)
    ├── cmd/aontu/       # `aontu` CLI (package main, file/stdin/REPL)
    ├── cmd/aontu-lsp/   # `aontu-lsp` Language Server (stdio)
    ├── aontu_test.go    # Go-native sanity tests
    └── spec_test.go     # runs the shared test/spec/*.tsv suite
```

Both implementations also ship an `aontu` command-line tool
(`ts/src/cli.ts`, `go/cmd/aontu`) that evaluates a file or stdin and
starts a REPL when given no file. See
[`docs/reference-api.md`](docs/reference-api.md#command-line-interface).

Both also ship an `aontu-lsp` Language Server that reports unification
diagnostics over stdio. The LSP logic is a reusable library separate from
the server: analysis (`computeDiagnostics` in `ts/src/lsp.ts`;
`lsp.Diagnostics` over `aontu.Check` in `go/lsp`) and a transport-agnostic
handler (`LspHandler` / `lsp.Handler`), with a thin stdio server on top
(`ts/src/lsp-server.ts`, `go/cmd/aontu-lsp`). The two servers are kept in
parity (same capabilities — diagnostics, hover, completion — and identical
output text). The library does not depend on the server, so third parties
can reuse it with their own transport. Editor plugins live in
[`editors/`](editors/). Full reference: [`docs/lsp.md`](docs/lsp.md).
Long-form documentation lives under [`docs/`](docs/) (start at
`docs/index.md`); measure coverage with `make cov` (see
`docs/test-coverage.md`). **How the documentation is written is
normative**: [`docs/STYLE-GUIDE.md`](docs/STYLE-GUIDE.md) carries the
Diátaxis placement rules, the voice, the banned-phrase list, and the
snippet directive vocabulary — read it before editing any page, and
update it in the same commit as the first page that follows a new
rule. **Documented examples are executed**: `ts/test/docs.test.ts`
requires every tagged fenced block in the Diátaxis pages (`index.md`,
the tutorials, `docs/how-to/*.md`, the five references, `use-cases.md`)
to be tested — parse-checked, paired with its stated `json` result,
scaffolded and run through the scenario/transcript directives, or
skipped with a written reason — and applies the style gate to the prose.
A narrowed run for one page:
`DOCS_PAGES=tutorial-config.md node ts/dist-test/docs.test.js`.

**The prose has a second gate.** `make prose` runs
[Vale](https://vale.sh) over the same pages for spelling, Google's
conventions and the banned list, at the levels `.vale.ini` sets and with
a written reason beside every one that is not error. CI runs it in
`.github/workflows/docs.yml`. The two gates share one file list
(`ts/scripts/gated-docs.cjs`) and one banned list
(`.vale/styles/config/vocabularies/Aontu/reject.txt`) so neither can
drift from the other; `docs/STYLE-GUIDE.md`, "How this guide is
enforced", says which gate carries which rule and why. Vale needs the
binary on `PATH` and one `vale sync` to fetch the pinned Google
package.
`ts/test/skill.test.ts` does the same for `docs/skill/`. The trust contract —
hermeticity, termination, determinism, sandboxing, and exactly where
each is conditional today — is [`docs/trust.md`](docs/trust.md); the
budget/cycle error taxonomy it defines is pinned by
`test/spec/budget.tsv` and the code registry by
`test/spec/errcodes.tsv`.

## Build & test

Both languages at once, from the repo root:

```sh
make build      # build-ts + build-go
make test       # test-ts  + test-go
make            # build then test
make install    # install-ts + install-go: this clone on PATH (npm link, go install)
make prose      # the Vale prose gate (needs `vale` on PATH)
make comments   # the code-comment gate (ADR-032)
make hooks      # install .githooks: the comment gate runs before each push
```

Per language:

```sh
cd ts && npm install && npm run build && npm test
cd go && go build ./... && go vet ./... && go test ./...
```

The TypeScript `dist/` and `dist-test/` outputs are committed (as in
`voxgig/util`), so **rebuild after changing `ts/src/` or `ts/test/`**.

One consequence worth knowing: a static analyser pointed at the
repository sees the compiled JS as well as the source, so every finding
in `ts/src` can be reported twice. For DeepScan this is excluded in the
**project settings on its dashboard** (Exclusion, gitignore-style, one
pattern per line: `/ts/dist`, `/ts/dist-test`) — there is no repository
config file for it, so the setting cannot be made from a pull request.

`ts/src/tsconfig.json` carries `noUnusedLocals`, `noUnusedParameters`,
`noImplicitReturns` and `noFallthroughCasesInSwitch`: an unused import
or a routine that answers on only some paths fails the build rather
than reaching an analyser. The test project is not gated the same way.

### Before you push

Nothing in git refuses a push on its own, so the gates are these, in the
order that fails fastest:

```sh
make comments   # ADR-032: the code-comment gate, about a second
make build      # rebuilds ts/dist + ts/dist-test, sigdecl, helpdoc, aontu
make test       # both suites
make cov        # the ADR-002 floor, and what CI grades
make prose      # only if docs/ or a README changed
(cd use-cases && ./run-all.sh)
```

`make hooks` points git at [`.githooks/`](.githooks), whose `pre-push`
runs the comment gate before the push leaves the machine. It is a
convenience, not the enforcement: the gate that decides is
`ts/test/comments.test.ts`, which runs inside `npm test` and therefore
inside the TypeScript CI job on every push and pull request. A hook is
skippable (`--no-verify`); CI is not.

Two failures are worth naming because they are found in CI rather than
locally: a `ts/dist`/`ts/dist-test` that was not rebuilt (the coverage
job diffs the committed build against a fresh one), and a use case
broken by a language change (`use-cases/run-all.sh`).

## The shared test suite

`test/spec/*.tsv` is the single source of truth for cross-language
behaviour. Each row is one test case; both `ts/test/spec.test.ts` and
`go/spec_test.go` load the same files and must produce identical results.

One file is not rows: `test/spec/signature.tsv` is the DECLARED call
surface of the built-in functions (docs/design/SIGNATURES.0.md,
ADR-017), one signature line per builtin, parsed by both ports'
tabnas grammars (`ts/src/sig.ts`, `go/sig.go`). Both runners skip it;
its gates are the round-trip suites (`ts/test/sig.test.ts`,
`go/sig_test.go`). After editing it run `make sig` to regenerate the
build-time-inlined copies (`ts/src/sigdecl.ts`, `go/sigdecl.txt`) —
the suites assert byte identity, and `make build-ts` runs it for you.

**The same arrangement, for prose.** The teaching pack `aontu help
<topic>` serves (G11 phase 1) is generated by `make helpdoc` from
`docs/skill/*.md` and `grammar/aontu.abnf` into `ts/src/helpdoc.ts`
and `go/cmd/aontu/helpdoc/`, and both suites
(`ts/test/helpdoc.test.ts`, `go/cmd/aontu/help_test.go`) assert the
embedded copy is byte-identical with its source. Edit `docs/skill/`,
never the staged copies; `make build-ts` runs the generator for you.
The Go copy has to be committed under the command's own package
because `//go:embed` cannot read above its own directory, and a
generated copy that nothing compares is a second source of truth.

The **starting documents** `aontu init` writes (G11 phase 6) travel
the same way: `docs/skill/init/model.aon`, `data.aon` and `check.sh`
are real files, run by the suites where they live, and the same
generator stages them into `ts/src/helpdoc.ts` and
`go/cmd/aontu/helpdoc/init/` (with each file's mode in a generated
`index.tsv`) so the two ports write the same bytes. Edit them where
they live; the trio has to keep passing its own `check.sh`, which both
suites run.

**The same arrangement, for the built-in models.** The models the
`aontu:` scheme serves ([ADR-036](ADR.md#adr-036--a-bundled-model-is-a-file-in-aontu-not-a-string-in-each-port))
are real files under [`aontu/`](aontu/), each named by its path after
the scheme — `aontu/lang/text.aon` is `aontu:lang/text`. A
file named after the directory holding it collapses, so
`aontu/view/view.aon` is `aontu:view` and a module that wants a folder
of its own can have one without spelling its name twice.
`make aontu` inlines them into
`ts/src/aontumodel.ts` and, for Go, mirrors the tree into
`go/aontumodel/` and writes the `//go:embed` table `go/aontumodel.go`; `make build-ts`
runs it for you. Edit the `.aon` file, never a staged copy: both suites
(`ts/test/aontumodel.test.ts`, `go/aontumodel_test.go`) assert the
inlined copy is byte-identical with its file AND that the tree serves
exactly the models the table lists, so a model added and not
regenerated fails too. Each one has to stay `aontu fmt`-clean and
lint-clean, which the format suites check in both ports.

Tab-separated columns: `name <TAB> mode <TAB> src <TAB> expect`

| mode    | assertion                                              |
|---------|-------------------------------------------------------|
| `canon` | `unify(src).canon` equals `expect`                    |
| `gen`   | `generate(src)` deep-equals `JSON(expect)`            |
| `gens`  | `generate(src)` as compact JSON equals `expect` byte for byte |
| `err`   | `generate(src)` errors, message contains `expect`     |
| `errc`  | `generate(src)` errors, first failure's why-code equals `expect` |
| `errcode` | registry row: code / class / since — asserted against the engine's code→class table (see below) |
| `vet`   | FIVE columns — `name <TAB> vet <TAB> schema <TAB> data <TAB> expect` — the report of `vet(schema, data)` equals `expect`, minus each finding's message |

`vet` introduced the fifth column, because the validation verb takes
two documents; the review's later modes that need a second input or
options (`subsume`, `query`, `why`, `diff`, `patch`, `agentsmd`)
reuse the same five-column shape. Every mode reads the columns it
needs and ignores anything after them, which is what made the column
additive.

Escapes in `src`/`expect`: `\n` → newline, `\t` → tab, `\\` → backslash.
Lines starting with `#` and blank lines are ignored. See
[`docs/shared-spec.md`](docs/shared-spec.md) for details.

Pick the mode that can actually fail. **`canon` pins kind, `gens` pins
bytes, and `gen` is blind to both**: `gen` compares through a JSON
decode, so the numeric leaf is gone before the comparison happens and
every number lands in a `float64` — which makes two distinct exact
integers above 2^53 compare *equal*. So a behaviour that distinguishes
kinds must be pinned by `canon` or `err`, and one that turns on the
exact serialised bytes (which digits, which exponent form, which key
order) by `gens` — see
[Choosing a mode](docs/shared-spec.md#choosing-a-mode).

Error *codes* — unlike error message text — are in cross-port parity:
every code either engine can raise is registered with a class in
[`test/spec/errcodes.tsv`](test/spec/errcodes.tsv) (mode `errcode`;
both runners assert set equality against their `codeClasses` table in
`ts/src/hints.ts` / `go/hints.go`), and `errc` rows pin which code a
given source raises (TS `errs()[0].why`, Go `AontuError.Code`). Codes
are append-only and never renamed; a class change is breaking. New
engine codes must land with a registry row in the same change.

### Adding a behaviour

1. Add a row to the appropriate `test/spec/*.tsv` file, with its
   expected value obtained by the [parity probe](#the-parity-probe)
   below — never copied out of one engine.
2. Make it pass in the canonical implementation (`ts/src`), rebuild,
   and run `make test-ts`.
3. Make it pass in the Go port (`go/`) and run `make test-go`.

A behaviour is only "shared" once it passes in **both** — only add rows
that both implementations satisfy.

### The parity probe

**An expected value in a shared spec row must be obtained by running
both implementations and requiring them to agree.** Two command lines,
from the repository root:

```sh
echo 'x:1.0' | node ts/bin/aontu.js -c
(cd go && echo 'x:1.0' | go run ./cmd/aontu -c)
```

Both print `{"x":1.0}`, so that is the `canon` expectation and the row
may be written. Drop `-c` from both for a `gen` row — the CLIs then
print generated JSON. For an `err` row, probe the same way and assert a
substring that **both** messages contain. Thrown-error text is in
cross-port parity (#29: marker, headline, verbatim hints with
injected details, ANSI source frames — guarded byte-for-byte by the
full-message twin tests in ts/test/error.test.ts and
go/hints_test.go), but a spec row still asserts only its probed
substring and `errc` code: rows outlive renderer changes, twins pin
the renderer.

The TypeScript CLI runs the committed build, so run `make build-ts`
before probing if `ts/src` has changed, or the probe answers for the old
code.

Writing the expectation from one engine's output is how a divergence
gets baselined as the contract. The row then passes on the side it was
copied from and fails on the other, and the obvious next move — "make
the other side match" — quietly changes whichever engine happened to be
right. Nothing in the suite can warn you, because a row that was never
probed carries no record of having been agreed. Probing costs two
commands; the alternative costs a wrong contract that looks green.

### The vet ≡ eval differential

Beside the parity probe, which asks whether the two ENGINES agree,
sits a check that asks whether the two SURFACES agree:
[`ts/test/veteval.test.ts`](ts/test/veteval.test.ts) and
[`go/veteval_test.go`](go/veteval_test.go) read the shared spec's own
`vet` rows and require, for each, that `vet(S, D)` and `eval(S ∪ D)`
give the same accept/reject answer. Their *reports* legitimately
differ — vet names roles and sites across two documents, eval raises
the first failure — but a document the gate accepts must evaluate, and
one it refuses must not (ADR-007).

Its corpus is the spec itself, so **adding a `vet` row adds a
differential case for free**, and a change that makes the gate and the
evaluator disagree fails here even when every golden still matches.
That is how it earns its place: the five defects the 2026-08 review
found under this heading each passed a fully green suite.

Rows with no single-document spelling are skipped — `--at` and
`--closed` change the truth rather than the documents, `--partial`
calls residue acceptable where eval never does, `--maxErrors` shapes
only the report, a fixture-loading row would resolve from a different
base, and a rootless literal carrying an absolute reference has no
honest wrapped form. The skip COUNT is bounded by the check itself, so
a skip list that grew to swallow the corpus fails rather than passing
over nothing.

### The divergence ledger

When a probe shows the two engines disagreeing, that is a **bug**, and
the default response is to fix the engine.
[`test/spec/divergent.tsv`](test/spec/divergent.tsv) is the debt
register for the case where it cannot be fixed from this repository
right now — the behaviour originates in a pinned `@tabnas` dependency,
or which side is correct is an open language-design question.

It lives beside the suite, as a `.tsv`, so it is read whenever the spec
is read — but it carries **no data rows**. A row there would be executed
by both runners and, by definition, could not pass in both, so
everything in the file is commentary; both runners skip comment and
blank lines, and the file therefore contributes zero cases.

Adding an entry is a deliberate, reviewed act, **not** a way to silence
a failing row. An entry must carry an issue reference, the reason it is
not simply fixed, and the exact divergent inputs together with *both*
engines' outputs. An entry is removed — not amended — when the
divergence is fixed, and the behaviour then earns real rows in the
appropriate spec file.

The ledger is not the same list as
[Known TS/Go divergences](DIVERGENCE.md). Those differ
deliberately and permanently and are never going to be pinned, so they
are not tracked as debt. (After the 2026-08-11 reclassification that
list holds a single entry — the Unicode table vintage; everything else
that once lived there is now OPEN debt in the ledger.)

[`docs/design/number-model.md`](docs/design/number-model.md) is the
worked example of what this discipline catches. TypeScript classified a
numeric literal's kind with no range condition at all, while Go used a
`float64` → `int64` round-trip, so `a:1e21 & integer` **succeeded in
TypeScript and failed in Go** — a silent, magnitude-dependent parity
break that no existing row observed, because no row at that magnitude
had ever been asked of both engines. The review that found it produced
`test/spec/number-model.tsv` and the ledger's entries — of which the
last, integer-kind values above 2^53 that need more than 17 significant
digits to write exactly (#21), is now closed. The ledger is not empty:
it carries one `# OPEN` entry, lone surrogates in quoted strings folded
to U+FFFD by Go (#24, reopened 2026-08-11). Read
`test/spec/divergent.tsv` for the live list rather than trusting a count
written here.

That entry is worth reading anyway (`test/spec/divergent.tsv` keeps the
note). It was closed twice against a rule that never touched it — the
number tower's refusal of lossy integer literals, which refuses a
literal binary64 cannot carry *exactly* and not one that is merely
large. Both times the thing that caught it was re-probing **both** CLIs
at the exact inputs the entry recorded, which is why an entry must
record them.

### The capability-review progress register

Forward-looking design work lives in
[`docs/capability-review/`](docs/capability-review/index.md): eleven gap
documents (G1–G11), each ending in a numbered implementation plan
(G9 and G10 were opened 2026-08-30, after the original eight had landed;
G11 on 2026-09-09).
**When a phase of one of those plans lands, its row in
[`docs/capability-review/progress.md`](docs/capability-review/progress.md)
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
[`test/spec/errcodes.tsv`](test/spec/errcodes.tsv) accurate ("new engine
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

## Implementation parity & Go coverage

TypeScript is canonical; the Go port is kept in parity for the subset it
implements. The Go **parser** is built on the Go ports of the `@tabnas`
parser stack and its `expr`/`path` plugins (`github.com/tabnas/...`) —
the same stack as `ts/src/lang.ts` — so the surface syntax parses in
parity.

The Go port has **full parity** with the canonical TypeScript language:
scalars, scalar kinds (type constraints — `string`, `boolean`, `top`,
and the numeric tower `number` over its four leaves `integer`, `float`,
`biginteger`, `bigdecimal`; see [The number model](#the-number-model)),
`0d` exact literals and exact arithmetic, maps (implicit nesting,
duplicate-key merge, spreads `&:`, optional keys `a?:`, `close`/`open`),
lists (incl. `&:` spreads), conjunction (`&`), disjunction (`|`),
preference/defaults (`*`), references (`$.a.b`, relative `.x.a`,
cross/chained refs), `$name` variables, the `+` operator (and
parenthesised grouping), every built-in function declared in
`test/spec/signature.tsv` (48 at 2026-09-05, `upper` to `split`), type/hide marks, and `@"file"` source loading
via the multisource plugin — plus `parse`, `unify`, `generate` and
`canon`.

Both use the **same `@tabnas` parser stack**: TS `@tabnas/jsonic` +
`@tabnas/{expr,path,multisource,directive,debug}`; Go
`github.com/tabnas/{jsonic,expr,path,multisource,directive}/go` — the Go
ports. `$var` variables are supplied via the runner context
(`ctx.vars` in TS, `Aontu.GenerateVars(src, vars)` in Go); the shared
`test/spec/var.tsv` rows are checked with the same variable set in both.

Both implementations use the same `@tabnas` Go/TS stack (jsonic + expr +
path + multisource), so the parser and semantics stay in lock-step. The
shared spec is the contract; grow it whenever either side changes.

**Pin the `@tabnas` versions exactly** (`ts/package.json`, `go/go.mod`).
The spread (`&:`) and optional-key (`a?:`) rules depend on `@tabnas`
parser *internals*, not just its public API: the parent-seeded node that
descended rules share (hence the explicit `r.node = {}` resets in both
`lang.ts` and `lang.go`), the `B:`/`b:` backtrack accounting, and the
order plugins are applied. A minor `@tabnas` bump can change these
silently with no compile error — only the shared spec catches it — so
upgrade deliberately and run `make test` before loosening any pin.

> **Previously divergent, now fixed:** consecutive spreads at one map
> level — bare (`&:k:a &:p:2`) and space-separated braced
> (`x:{&:{k:a} &:{p:2}}`) — used to parse differently (Go nested the
> second bare spread inside the first's template; TS mis-attached a
> nested braced sibling spread to the root). Both grammars now gate the
> sibling-spread pair-close alt on the `pk`/`dmap` counters (see the
> pair close alts in `ts/src/lang.ts` and `go/lang.go`), so consecutive
> spreads are siblings on the enclosing map at any depth; covered by the
> `spread.tsv:sibling-*` shared-spec rows.

### The number model

The numeric lattice is a **tower**. `number` is a pure supertype that
never tags a concrete value; every numeric value carries one of four
leaves, fixed when the value is built:

| kind | holds | written |
|------|-------|---------|
| `integer`    | a double, whole, inside the int64 window | `1`, `1e3` |
| `float`      | any other double (IEEE-754 binary64)     | `1.5`, `1e21` |
| `biginteger` | exact, whole, unbounded                  | `0d5`, `0d1_000` |
| `bigdecimal` | exact base-10, with a point or exponent  | `0d0.1`, `0d1e3` |

Three properties govern every change in this area:

- **The leaves are disjoint.** `1 & 1.0`, `5 & 0d5` and `0d5 & 0d5.0`
  are all conflicts, and scalar identity compares kind as well as value
  (so `1|1.0` keeps both alternatives). Which leaf a value takes is
  therefore language surface, and a change to it must be pinned by
  `canon` or `err` — never by `gen`, which cannot see a kind.
- **Leaf by source, not by magnitude.** A literal without `0d` is
  `integer` only if its text has no `.`, its value is integral, and it
  is inside the int64 range; anything else is `float`. A literal with
  `0d` is `bigdecimal` if its source carries a `.` or an exponent, and
  `biginteger` otherwise. Both ports share one predicate for the first
  rule — `isIntegerKind` (`ts/src/val/numkind.ts`, `go/lang.go`) —
  applied at **every** construction site, including the raw/implicit-list
  path where there is no source text.
- **The exact leaves are opt-in.** They are reached only by a `0d`
  literal or by the exact-input constructors, never by promotion,
  coercion or inference, so a `0d`-free document means exactly what it
  always meant. Arithmetic is exact-always with a loud limit rather
  than a silent rounding: a bigdecimal beyond the budget (4096
  coefficient digits, absolute scale 4096) is refused, in a literal and
  in a computed result alike.

Representation differs by port and must not drift: TypeScript holds a
biginteger as a native `bigint` and a bigdecimal as a `Decimal`
(`ts/src/val/Decimal.ts`); Go uses `*big.Int` and `*Decimal`
(`go/decimal.go`). Both are **pointer/immutable** pegs — clones share
them, nothing mutates them in place — which is why identity must compare
the *number* and never the peg address in Go, nor object identity in TS.
`generate()` hands these native types out, so TypeScript ships its own
JSON emitter (`exactJSON`, `ts/src/exactjson.ts`); `JSON.stringify`
throws on a `bigint`. Its bytes must stay identical to Go's
`encoding/json` with `SetEscapeHTML(false)` — the `gens` rows are what
hold the two together. See
[`docs/reference-api.md`](docs/reference-api.md#exact-numbers-and-exactjson)
for the consumer-facing contract.

Where the rules are pinned: `test/spec/number-model.tsv` (the kind
rules), `test/spec/number-tower.tsv` (the exact leaves), and
`test/spec/number-cross-product.tsv` (the closed ordered-pair table for
`+`). The reasoning is in
[`docs/design/number-model.md`](docs/design/number-model.md) and
[`docs/design/number-tower.md`](docs/design/number-tower.md); the
user-facing rules are in
[`docs/reference-language.md`](docs/reference-language.md#the-four-numeric-leaves).

## Conventions

### Comments are for the surprising code, and nothing else

[ADR-032](ADR.md#adr-032--code-comments-are-sparse-and-terse-intent-lives-in-names-requirements-live-in-documents)
is the rule and `make comments` is the gate, over every `.ts`, `.go` and
`.rs` source outside the generated files and the worked-example corpora.
A comment exists only where the code is intricate or its correct form is
surprising; it runs to a line or two rather than a paragraph; semantic
intent is carried by the identifier name instead; and business logic and
requirements are carried by a document instead. When a comment fails one
of those tests, deletion is the default move, not rewriting.

The gate is not only about form. Its accuracy rules refuse a comment
naming a path, a symbol or a decision number that does not resolve, and
refuse the claims a reader cannot check from the tree — issue numbers,
dates, versions and counts. A comment that has gone stale fails the
build, which is what keeps the surviving prose true.

What a comment used to carry has homes: `docs/design/` for the why
behind a settled decision, [`ADR.md`](ADR.md) for a fundamental, the
commit message for how the work went, and `git log -L` / `git blame`
for reading any of it back.

### A document describes the thing, not the session that built it

**Findings, to-do items and CI plumbing do not belong in a README.**
They are issue-shaped: they have an owner, a resolution and an end,
and a document that carries them is stale from the day it is written.

The rb-solar system README carried two such sections and they are the
worked example. *"What the exercise found"* listed five engine defects
turned up while building it, prefaced with "they are listed here
because finding them is what a system like this is for" — a sentence
about the exercise, in a page a reader opens to learn what the system
*is*. *"In CI"* described a patch "waiting to be applied by a
maintainer", which is a task, and which stops being true the moment
someone applies it. Both moved to
[#176](https://github.com/aontu-lang/aontu/issues/176) and
[#177](https://github.com/aontu-lang/aontu/issues/177), where they can
be closed.

So, when writing or revising a document:

- **A defect goes to `use-cases/BUGS.md` or an issue**, never into the
  prose of a page about something else. Cite it from the page if the
  page's argument needs it — as the rb-solar model notes still cite
  §88 — but the record lives where records live.
- **A task goes to an issue.** "Waiting to be applied", "the next step
  is", "someone should" — if it can be *done*, it is not documentation.
- **A narrative of how the work went goes nowhere**, or into the commit
  message that did it. "The plan called for", "a first attempt", "this
  was found when" — the reader wants the conclusion, and the reasoning
  only where it stops them undoing it.
- **What stays** is what remains true once the work is finished: what
  the thing is, how it is built, what holds it, and the reasons a
  reader needs in order not to break it.

The same rule governs `docs/` through
[docs/STYLE-GUIDE.md](docs/STYLE-GUIDE.md); this section extends it to
the READMEs under `test/system/` and `use-cases/`, which are published
to the website by `aontu-lang/web` and are read by people who were not
here.


The Rails example's detail guides are published from
`test/system/rb-solar/doc/*.md`. After editing them, run
`node --test test/system/rb-solar/doc/guides.test.mjs`: it checks source
excerpts and executes the render and field-change recipes in a temporary
copy. The runtime application checks remain in the example's `check.sh`.

### Module and package are different words

**A module is imported. A package is published.** They are not
synonyms. The verbs follow: `aontu sync`, `add`, `get`, `remove`, `why`
and `publish` operate on packages, as do the `aontu pkg` subcommands;
`aontu model get|why|set` interrogate one document.

- A **module** is a language element: what `@"acme.example/schema"`
  names, what `resolveModule` resolves, what `canonHash` pins, what
  unifies into a document.
- A **package** is a unit of publication: a versioned, signed archive
  of one or more modules, usually exactly one. It is what a repository
  stores, what a version and a signature cover, what a quota counts,
  and what is retracted or tombstoned.

Write "package repository", "publish a package", "the package's
dependencies". Never "module registry" or "publish a module". The rule
applies to code comments, identifiers, error messages, commit messages
and documentation alike; `docs/STYLE-GUIDE.md` carries the same rule
for published prose.

**Go uses the two words the other way round** — its module is the
published collection and its package is a directory inside one. aontu
cannot follow, because "module" is already the language element in both
ports, in the import syntax and in `MODULE_RE`. So a phrase that sounds
right to a Go user may be wrong here: check which side of the
import/publish line the thing is on rather than trusting the ear.

- Keep new TypeScript code in the style of the surrounding `ts/src` files.
- Go is `package aontu`; exported API is `New().Parse/Unify/Generate`.
  Run `go vet ./...` and `gofmt` before committing.
- Go module releases (a Go module in a subdirectory) use git tags of the
  form `go/vX.Y.Z`, and carry the CLI binaries, packages and the
  package-manager manifests on a GitHub Release at that tag, and the
  image on GHCR (`go/scripts/binaries.sh`; docs/release-and-tag.md).
- Inside an aontu project, everything the tools generate lives under
  `aontu_meta/`: the lockfile `aontu_meta/pkg-lock.aon`, the vendored
  closure `aontu_meta/vendor/`, and by design the engine pin
  `aontu_meta/version`. `pkg.aon` and the documents stay at the root.
  New tooling that writes into a project writes there
  (docs/capability-review/g6-distribution.md, the layout amendment).
  A vendored package keeps the manifest and proof it was acquired with
  under its own `aontu_meta/`; a package in the user cache's store also
  keeps the lock it was verified against, which the vendored copy drops
  so that the consumer's lock governs (ADR-039).
- The package verbs reach a repository through one seam, `PkgHttp`
  (`ts/src/pkg-net.ts`) and `PkgHTTP` (`go/pkgnet.go`); every decision
  is above it and the platform transport below it. Tests hand in a
  directory-backed transport (`dirHttp`/`DirHTTP`) and a served
  registry on a loopback port, so nothing in either suite reaches the
  network.

### The site-attribution invariant

**Every site names the file whose text it excerpts.** A value carries
the url of the file it was PARSED FROM, and nothing may overwrite that
with the entry document's name: a report citing `entry.aon:3:7` for
text three files away — at a line the entry may not have — sends a
repair agent to edit the wrong file (use-cases/BUGS.md §25). Two
corollaries a change in this area has to keep:

- Only a value with NO name of its own may be stamped with the entry's.
  Those are the ones the engine minted rather than read.
- A site whose file the run holds no TEXT for reports `-1:-1`. Resolving
  an offset against another document's text names a real line that says
  something else, which is worse than saying nothing.

Provenance ROLES (vet's `data`/`schema`) therefore come from membership
of the url set each walk collected, never from comparing a name against
one entry. The report NAME is separate again: identity is the resolved
absolute path, and the printed name is the one the caller's own
spelling reaches (`displayFile`, both ports), so a report stays
openable from the invoking directory and repo-relative in SARIF.

### Provenance is part of the clone contract

The `why` recorder answers "which line set this value", and a model
that uses templates, generators or references reaches most of its
values by CLONING what the author wrote. So the authored mark lives ON
the value (`WRITTEN` / `base.fwrt`), and every place that carries a
value's SITE carries the mark with it — `Val.clone`, `Val.place`, the
disjunct fold. Deciding authorship by looking an id up in a set
stamped over the parsed tree is the shape that made `why` answer
"nothing met at this path" over values it had just printed
(use-cases/BUGS.md §22–24). Two rules hold it up:

- A value the engine MINTS is constructed rather than cloned and stays
  unmarked. That is what keeps the record to what the author can edit.
- A MEMBER is not a value beside its container (`INNER_OF` /
  `base.finner`): `*1|integer` is one thing the author wrote. The
  containment is recorded as a fact about the document at stamping
  time, never inferred from what the fixpoint happened to meet — the
  latter is what made identical siblings answer differently.

The extra reach is why `set --in-place` refuses a path reached through
a reference: the literal it correctly reports belongs to the referent's
line, and splicing there rewrites it for every reader.

### Colour is a decision about the destination

`NO_COLOR` (set, to anything) turns error-frame ANSI off for every
caller of the library; the CLI additionally turns it off when its own
stderr is not a terminal, and `--jsonl` turns it off unconditionally.
The library cannot see the destination, so the library never decides:
`setColor`/`SetColor` is the CLI's call to make, and a library caller
who knows better can make it too. The full-message twin tests run with
colour ON — the escapes are part of the byte parity they guard — so a
change here must keep the default (no override, no `NO_COLOR`) coloured.

### Mutation caveat (both implementations)

Although `Val.unify` is documented "MUST not mutate", the fixpoint
driver relies on `unify` mutating the result/`this` in place on the
self-unify-with-TOP path (e.g. `MapVal`/`ListVal` write back their
children, `Conjunct`/`Disjunct`/`Ref`/`Pref`/`Func` advance their own
`dc`/`peg`). This is safe **only** because a `Val` tree is unified once,
in place, and is not shared across independent unifications. Do not
cache, reuse, or unify the same parsed `Val` (or a node reachable from
it) in two different `unify` runs — clone first. The same constraint
applies to the Go port. Treat parsed `Val`s as single-use.

### Known TS/Go divergences

Moved to [`DIVERGENCE.md`](DIVERGENCE.md) at the repository root, which is
now the single record of permanent TypeScript/Go non-parity — what differs,
what it costs, and why the alternative was rejected. The debt register for
divergences still expected to be FIXED remains
[`test/spec/divergent.tsv`](test/spec/divergent.tsv).

Kept in one place deliberately: the same divergence had been described in
an AGENTS.md section, a ledger comment and an upstream doc, and they drifted
apart — the ledger claimed a behaviour was still divergent for some time
after it had been aligned.

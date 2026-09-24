# aontu — agent & contributor guide

aontu is a JSON structure unifier (a purpose-specific dialect inspired by
[CUE](https://cuelang.org/)). This repository ships **two implementations
kept in parity**: **TypeScript** in `ts/` — the **canonical** one — and
**Go** in `go/`, a port that mirrors its semantics.

Three decisions govern everything below and are recorded in
[`ADR.md`](ADR.md): **ADR-001** (the two implementations stay at full
parity, proved by the shared spec), **ADR-002** (coverage stays at 100 %
in both, with every exclusion justified in the source), and **ADR-003**
(where a host subsystem supplies semantics, aontu defines the meaning and
rewrites the input rather than trusting the host). Read those before
proposing a change that touches one implementation only, that adds code
no test reaches, or that hands a value to a host library to interpret.

**This file is an index, capped at 1200 words and gated by
[`ts/test/agents-guide.test.ts`](ts/test/agents-guide.test.ts).** Detail
belongs in the pages below; add it there, not here.

## Where the detail lives

| Page | What it carries |
|------|-----------------|
| [contributing/testing.md](docs/contributing/testing.md) | the shared `test/spec/*.tsv` suite and its modes, the generated-copy generators (`sig`, `helpdoc`, `aontu`), adding a behaviour, the parity probe, the vet ≡ eval differential, the divergence ledger |
| [contributing/parity.md](docs/contributing/parity.md) | what the Go port covers, why the `@tabnas` pins are exact, the numeric tower |
| [contributing/conventions.md](docs/contributing/conventions.md) | comments, what a document is for, module vs package, site attribution, provenance, colour, the mutation caveat |
| [contributing/capability-review.md](docs/contributing/capability-review.md) | the progress register and its same-commit rule |
| [docs/STYLE-GUIDE.md](docs/STYLE-GUIDE.md) | how documentation is written — normative, read before editing any page |
| [docs/shared-spec.md](docs/shared-spec.md) | the shared TSV format |
| [docs/release-and-tag.md](docs/release-and-tag.md) | releasing and tagging, including without `gh` |
| [DIVERGENCE.md](DIVERGENCE.md) | permanent TS/Go non-parity |
| [docs/trust.md](docs/trust.md) · [docs/lsp.md](docs/lsp.md) · [docs/index.md](docs/index.md) | the trust contract · the language server · the documentation set |

## Repository layout

```
.
├── ADR.md               # architecture decision record (the fundamentals)
├── AGENTS.md            # this file
├── CLAUDE.md            # symlink to AGENTS.md
├── DIVERGENCE.md        # permanent TS/Go non-parity
├── Makefile             # fans out to ts/ and go/
├── aontu/               # the built-in aontu: models, named by their path
├── docs/                # documentation, design notes, contributor detail
├── editors/             # editor plugins (VS Code, Emacs, Vim) → aontu-lsp
├── test/spec/           # shared test cases — *.tsv (language-agnostic)
├── ts/                  # canonical TypeScript implementation
│   ├── src/  test/      # source and tests
│   └── dist/ dist-test/ # COMMITTED compiled output — rebuild after editing
└── go/                  # Go port (package aontu, cmd/aontu, cmd/aontu-lsp)
```

Both implementations ship an `aontu` CLI and an `aontu-lsp` language
server, kept in parity down to their output text.

## Build & test

```sh
make build      # build-ts + build-go      make install  # this clone on PATH
make test       # test-ts  + test-go       make prose    # the Vale gate
make comments   # the code-comment gate    make hooks    # install .githooks
```

Per language: `cd ts && npm install && npm run build && npm test`;
`cd go && go build ./... && go vet ./... && go test ./...`.

`ts/dist` and `ts/dist-test` are **committed**, so rebuild after changing
`ts/src` or `ts/test`. One consequence: a static analyser sees the
compiled JS as well as the source and reports every `ts/src` finding
twice — for DeepScan this is excluded in its dashboard settings
(`/ts/dist`, `/ts/dist-test`), which no pull request can set.

`ts/src/tsconfig.json` carries `noUnusedLocals`, `noUnusedParameters`,
`noImplicitReturns` and `noFallthroughCasesInSwitch`, so an unused import
or a routine that answers on only some paths fails the build rather than
reaching an analyser. The test project is not gated the same way.

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
runs the comment gate. It is a convenience, not the enforcement: the gate
that decides is `ts/test/comments.test.ts`, inside `npm test` and so
inside CI on every push. A hook is skippable (`--no-verify`); CI is not.

Two failures are found in CI rather than locally: a `ts/dist` that was
not rebuilt (the coverage job diffs the committed build against a fresh
one), and a use case broken by a language change.

CI is [`.github/workflows/build.yml`](.github/workflows/build.yml).
Editing anything under `.github/workflows/` needs the GitHub `workflow`
OAuth scope, so such a push must come from an account that has it.

## Releasing

A release publishes over OIDC, by dispatching `publish.yml` — never a
local token publish, which bypasses the OIDC exchange entirely. `make
publish [V=x.y.z] [GOV=x.y.z]` dispatches it and refuses to run without
the `gh` CLI; without `gh`, see
[docs/release-and-tag.md](docs/release-and-tag.md), "Releasing without
`gh`".

## The rules that are easy to get wrong

- **An expected value in a shared spec row is obtained by running both
  engines and requiring them to agree** — never copied out of one.
  Writing it from one engine baselines a divergence as the contract, and
  nothing in the suite can warn you. See
  [the parity probe](docs/contributing/testing.md#the-parity-probe).
- **A behaviour is shared only once it passes in both ports** (ADR-001).
  TypeScript alone is *partial*.
- **A structural divergence registers like any other** (ADR-001): two
  shapes that answer the same bytes pass every shared row, so nothing
  but [`ts/test/parity.test.ts`](ts/test/parity.test.ts) and
  [`DIVERGENCE.md`](DIVERGENCE.md) can catch them. Recording one in a
  contributor page is absorbing it.
- **Error codes are append-only and never renamed**; a class change is
  breaking, and a new engine code lands with its
  [`test/spec/errcodes.tsv`](test/spec/errcodes.tsv) row in the same
  change.
- **A phase's row in
  [`docs/capability-review/progress.md`](docs/capability-review/progress.md)
  changes in the same commit that changes its status.** Forward-looking
  design is the gap documents G1–G11; the register is the only record of
  what has been built.
- **Comments are for the surprising code and nothing else** (ADR-032),
  and a comment naming a path, symbol or decision that does not resolve
  fails the build.
- **A `Val` tree is single-use.** Do not cache, reuse or re-unify a
  parsed `Val`; clone first. Both ports.
- **A transient task reports while it runs.** Every build, test run,
  script, background command, wait on CI and subagent prints a status
  line at least every 30 seconds, however minimal, with a percentage
  complete when one can be estimated (`checks 12/32, 37%`), and an agent
  relays progress to its person at the same cadence. A silent task cannot
  be told from a hung one.

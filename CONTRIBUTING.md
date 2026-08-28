# Contributing to Aontu

The actual contributor guide is [AGENTS.md](AGENTS.md) — repository
layout, build and test commands, the shared spec format, the parity
rules, and the conventions both human and agent contributors follow.
This file is the short version and the pointers.

## The three fundamentals

Recorded in [ADR.md](ADR.md); do not reverse them without a new ADR
entry:

- **ADR-001** — the TypeScript (`ts/`, canonical) and Go (`go/`)
  implementations stay at full parity, proved by the shared spec suite.
- **ADR-002** — test coverage stays at 100 % in both implementations,
  with every exclusion justified in the source.
- **ADR-003** — where a host subsystem supplies semantics, Aontu
  defines the meaning and rewrites the input rather than trusting the
  host.

## The shared-spec-first workflow

Cross-language behaviour lives in `test/spec/*.tsv`, run by both
`ts/test/spec.test.ts` and `go/spec_test.go`. A behaviour change starts
with a spec row, then lands in the canonical TypeScript implementation,
then in the Go port — it is only "shared" once both pass. `ts/dist` and
`ts/dist-test` are committed, so rebuild after editing `ts/src` or
`ts/test`.

```sh
make build   # build both implementations (rebuilds ts/dist)
make test    # run both suites against the shared spec
make cov     # check the ADR-002 coverage floor
```

## The parity probe

A spec row's expected value must be obtained by running **both**
implementations and requiring them to agree — never copied out of one:
`echo 'x:1.0' | node ts/bin/aontu.js -c` and
`(cd go && echo 'x:1.0' | go run ./cmd/aontu -c)`. Writing the
expectation from one engine's output is how a divergence gets baselined
as the contract (AGENTS.md, "The parity probe").

## Releasing

Two artifacts, two version series, one workflow file — and half of it is
irreversible, so the process has guards rather than steps to remember.
[`docs/release-and-tag.md`](docs/release-and-tag.md) is the whole story;
the short version is:

```sh
make publish V=0.54.0 GOV=0.1.12   # npm version, Go module version
```

That bumps, runs both suites, pushes `main`, and dispatches the publish
workflow, which publishes to npm over OIDC and then writes both tags.
Never run `npm run repo-publish` locally: it publishes over a token and
bypasses trusted publishing entirely.

## Where use-cases/ fits

[use-cases/](use-cases/) is the executable review: eleven enterprise
scenarios driven through the real CLI, with verified defects in
[use-cases/BUGS.md](use-cases/BUGS.md) and minimal reproductions under
[use-cases/repros/](use-cases/repros/). Those repros are **candidates
for `test/spec/` rows** — each documents a behaviour that, once fixed
(or confirmed as designed), should be pinned by a probed shared row.
They exercise the TypeScript implementation only, so ADR-001 applies:
a repro becomes a spec row via the parity probe, not by copying.

Security reports go through [SECURITY.md](SECURITY.md), not the issue
tracker.

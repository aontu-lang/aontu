# CLAUDE.md

See [AGENTS.md](AGENTS.md) for the full contributor and agent guide:
repository layout, build/test commands, the shared `test/spec/*.tsv`
suite, and TypeScript/Go parity conventions.

Fundamentals are recorded in [ADR.md](ADR.md): ADR-001 (TS/Go full
parity via the shared spec) and ADR-002 (100 % coverage in both, every
exclusion justified). Do not reverse those without a new ADR entry.

Quick reference:

- TypeScript (`ts/`) is the canonical implementation; the Go port
  (`go/`) is kept in parity for the subset it implements.
- `ts/dist` and `ts/dist-test` are committed — rebuild after editing
  `ts/src` or `ts/test` (`make build-ts`).
- Shared behaviour lives in `test/spec/*.tsv` and is run by both
  `ts/test/spec.test.ts` and `go/spec_test.go`.
- `make test` runs both suites; `make cov` checks the ADR-002 floor.
- Documentation edits follow [docs/STYLE-GUIDE.md](docs/STYLE-GUIDE.md)
  (Diátaxis placement, voice, banned phrases, snippet directives);
  `ts/test/docs.test.ts` enforces it — every tagged snippet tested or
  skipped with a reason.
- Forward-looking work is the capability review in
  `docs/capability-review/` (G1–G8, design) plus
  `docs/capability-review/progress.md` (the register of what has
  landed). **A phase's row in the register changes in the same commit
  that changes its status** — see AGENTS.md, "The capability-review
  progress register".

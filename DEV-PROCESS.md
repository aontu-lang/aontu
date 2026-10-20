# Development process

How work is done in this repository: what an agent records, how a
change is tested before it is pushed, how documentation is written, and
what each folder holds. [`AGENTS.md`](AGENTS.md) is the index an agent
reads first, and points here; the decisions behind these rules are in
[`ADR.md`](ADR.md).

## The prompt log

Every prompt given to an agent working here is recorded in
[`sketch/PROMPT-LOG.md`](sketch/PROMPT-LOG.md)
([ADR-076](ADR.md#adr-076--every-prompt-is-logged)).

- **Append the entry before the work starts**: the date and time the
  prompt was given, in UTC, the agent that took it, and the prompt as it
  was written, typos included.
- **Name the agent** by its tool and its session. A Claude Code
  session's commits carry the same session in their `Claude-Session`
  trailer; a tool with no session gives its run or task identifier, or
  `no session id`.
- **Redact secrets.** A credential, token or key, or personal data, is
  written as `[redacted: what it was]`. An entry found holding one is
  redacted where it stands, and a secret that reached a push is revoked.
- **Fence the prompt** with more backticks than the longest run of
  backticks inside it.
- **Commit the entry with the first change that follows.** A session
  that ends holding entries and no change commits them on a branch of
  their own, so a question is not lost with its checkout.
- **Never rewrite an entry**, except to redact. Git merges the file with
  its `union` driver (`.gitattributes`), so two branches' entries both
  survive.

## Testing

Local testing takes a few minutes at most, and is done with the unit
tests of what changed
([ADR-075](ADR.md#adr-075--local-testing-takes-minutes-and-the-long-runs-are-the-daily-cis)).

- **Before every push, `make quick`**: the comment gate, both builds,
  the gate group and the Go suite, inside two minutes. A commit may be
  broken; a push should not be.
- **Then the tests of what the change touches**: the test file of the
  module changed, and the shared rows of the `test/spec/*.tsv` files
  changed, in both ports (`--test-name-pattern='^(file)\.tsv:'` over the
  TypeScript spec tests, `go test -run 'TestSpec$/^(file)\.tsv'` in
  `go/`). `make prose` runs where a page changed, and `make spec` where
  `spec/` changed.
- **The long runs belong to the daily CI**
  ([`daily.yml`](.github/workflows/daily.yml)): `make test`, `make cov`,
  the other test groups, the use cases (`use-cases/run-all.sh`), the
  system and the definition. They are never run locally before a push or
  a merge, and nothing waits on them.
- **A pull request merges on its own CI.** Once
  [`build.yml`](.github/workflows/build.yml), five minutes at most, is
  green on its head and its review is answered, it merges. What the
  daily run finds is fixed in a change of its own.

An expected value in a shared row is obtained by running both engines
and requiring them to agree, never copied out of one
([testing.md](docs/contributing/testing.md#the-parity-probe)).

## Writing documentation

[`STYLE-GUIDE.md`](STYLE-GUIDE.md) is normative for every page under
`docs/`, the published use-case READMEs and the package READMEs. Read it
before editing a page.

- Two gates hold a page to it: `ts/test/docs.test.ts`, inside `npm
  test`, and the Vale prose gate, `make prose`.
- A change to a page re-measures the prose counts, `make prose-counts`,
  which records the totals in `.vale.ini` and in the style guide.
- A published page cites nothing internal: no decision record, no review
  and no file under `sketch/`.

## What each folder holds

- **`docs/` holds only documentation that is valid and up to date**: the
  tutorials, how-to guides, references and explanations a reader can act
  on, and the contributor pages under `docs/contributing/`. A page that
  stops being true is corrected or removed in the change that made it
  untrue.
- **`sketch/` holds working files, and every file in it is to be
  ignored**: the prompt log, design notes, drafts and the capability
  review. None of it is documentation, specification or instruction,
  and any of it may be out of date; the prompt log and the review's
  progress register are kept to their rules as records. [`sketch/README.md`](sketch/README.md) says the same.
- The decisions are [`ADR.md`](ADR.md), the permanent differences between
  the ports [`DIVERGENCE.md`](DIVERGENCE.md), and the agent guide
  [`AGENTS.md`](AGENTS.md), which `CLAUDE.md` links to.

# `aontu init` — starting a project, from templates that ship inside the engine

**Status:** PROPOSED. Design only. Nothing below is built.

**Origin:** Richard Rodger, 2026-09-04, from the question of whether
[jostraca](https://github.com/jostraca/jostraca) is used for templating
and project scaffolding. It is used for neither today, and the second
half of the question found a real gap: the language has modules, a
generated-state folder and a designed version manager, and no answer to
"start a new aontu project". The gap was recorded as an open question in
[g9-transformation.md](../capability-review/g9-transformation.md); this
note answers it.

**Method:** every claim about what the engine does *today* was probed
against the tree at `3598b91` and carries its probe. Claims about what
it *should* do are argument, and are marked as such. This note leans on
three others: [MODELS.0.md](MODELS.0.md) for how bundled text is served
and held to the form, [ENV.0.md](ENV.0.md) for the engine pin, and
[g9-transformation.md](../capability-review/g9-transformation.md) for
the write posture a generating verb needs.

---

## 1. The gap

There is no `aontu init`, in either CLI. Probed: the verb list is
`vet`, `subsume`, `breaking`, `trim`, `relations`, `reaches`, `view`,
`jsonschema`, `hash`, `mod`, `get`, `why`, `set`, `agentsmd`, `fmt`,
`lsp`, `mcp` — and `mod` takes `tidy|verify|vendor|manifest`, none of
which creates a project. Nothing writes a `mod.aon`.

So the first thing a new user does is the one thing the tool cannot
help with. They read the module reference, learn that `mod.aon` holds
`mod: { path, main }`, learn that generated state goes under
`aontu_meta/`, learn from [ENV.0.md](ENV.0.md) that the engine pin is
`aontu_meta/version` with a series prefix — three documents to produce
four lines of text, every one of which the engine already knows how to
write.

**For the agent mission it is worse than an inconvenience.** An agent
asked to set up an aontu project has to infer the layout from examples,
and every inference is a place to get it wrong quietly: a `mod.aon`
without `main`, a lockfile written by hand, a version pin with no
series (which [ENV.0.md §4.1](ENV.0.md) already has to raise an error
for). A scaffolder is the cheapest possible fix and it is one the
engine is uniquely placed to make correct, because it holds the
definition of every file involved.

## 2. What a project is, probed

The minimum that makes a directory an aontu project is two files:

```
mod.aon      mod: { path: "corp.example/hello", main: "main.aon" }
main.aon     greeting: "hello"
```

VERIFIED with exactly that pair: `aontu mod tidy .` answers
`verdict: ok` and writes `aontu_meta/mod-lock.aon`; `aontu mod verify .`
then answers `verdict: ok`; and `aontu main.aon` evaluates. VERIFIED
also that a bare `path: "hello"` is accepted — the domain-shaped path
in the use cases is a convention, not a rule, which matters because a
scaffolder must not invent a domain the user does not own.

Two things follow, and the second is the useful one:

- **`aontu_meta/` is committed, not ignored.** Probed: nothing in this
  repository ignores it, and the shared-modules use case says in its
  own comment that the vendored closure is committed. So `init` writes
  no ignore file — there is nothing to ignore — and a scaffolder that
  helpfully added one would be wrong about the project layout on the
  first line it wrote.
- **The lockfile is derivable, so `init` should derive it.** A project
  whose `mod verify` fails immediately after `init` is a bad first
  impression, and the fix is a call the engine already makes.

## 3. The verb

**D1.** `aontu init [--path <module-path>] [--main <file>] [--template <name>] [dir]`

`dir` defaults to `.`, and is created if it does not exist. `--path`
defaults to the target directory's own name; `--main` defaults to
`main.aon`; `--template` defaults to `minimal` (§5).

It writes, for the default template:

| file | content |
|---|---|
| `mod.aon` | `mod: { path: <path>, main: <main> }` |
| `<main>` | a document short enough to read whole, that evaluates |
| `aontu_meta/version` | the running build's series and version, per [ENV.0.md §4.1](ENV.0.md) |
| `aontu_meta/mod-lock.aon` | derived, by the code path `mod tidy` uses |

and prints what it wrote and the next command to run.

**D2 — It refuses rather than overwrites, and there is no `--force`.**
An existing `mod.aon` in the target directory means the directory is
already a project, and `init` stops with a located message naming it.
Any other file it is about to write that already exists is the same
refusal. A non-empty directory is otherwise fine: initialising aontu
inside an existing repository is the normal case, not the exception.
No flag overrides this — a scaffolder that can destroy work is a
scaffolder nobody runs in a directory that matters, and the recovery
for the rare case is `rm` plus `init`, typed deliberately.

**D3 — It never prompts.** Every input is a flag with a default. This
is not a style preference: an agent, a CI job and a `Dockerfile` all
run it non-interactively, and the [G9](../capability-review/g9-transformation.md)
mission is that an agent can drive the toolchain. An interactive
scaffolder is one an agent has to work around.

**D4 — Top-level, not `aontu mod init`.** It writes more than the
module file — the entry document and the engine pin are not `mod`'s
business — and "start a project" is a top-level concept the way
[`aontu env`](ENV.0.md) is. X-1 records the counter-argument.

## 4. The templates ship inside the engine

**D5.** A template is a table of relative path to text, held as source
constants in `ts/src/init.ts` and `go/init.go`, byte-identical across
the ports, pinned by a canon row and a hash row exactly as the bundled
models are ([MODELS.0.md](MODELS.0.md)). Nothing is read from disk.

This one decision carries most of the design's weight:

- **The trust contract is untouched.** Probed: `docs/trust.md` governs
  the resolver — what `@"..."` may read — and has no write clause and
  no notion of a template directory. A scaffolder that read templates
  from a user-supplied directory would add a fourth input to the trust
  contract that nobody declared, which is precisely the concern
  [G9's open questions](../capability-review/g9-transformation.md)
  raise about Jostraca's `Fragment.from` and `Copy.from`. Bundled text
  reads nothing, so there is nothing to confine.
- **The output is reproducible and hermetic.** Two `init` runs of the
  same version produce the same bytes on any machine, with no network
  and no cache, which is the [G5](../capability-review/g5-trust-contract.md)
  posture the rest of the toolchain already keeps.
- **Parity is a hash row.** The two ports cannot drift, and the gate
  that says so costs two rows per template.
- **The templates are held to the language's own form.** Per
  [MODELS.0.md](MODELS.0.md) D4: a test in each port asserts
  `fmt(template) == template` and that `--lint` reports nothing. Both
  gates shipped in 0.56.0, so this one is available on the day the
  verb lands rather than waiting for it. If the language's own
  scaffold cannot pass its formatter, the scaffold is wrong.

**Substitution is positional and tiny.** A template's text carries no
mini-language: the only values that vary are the module path, the main
file's name and the engine pin, and each is written by the code that
assembles the file rather than by substituting into a string. This is
deliberate — the moment a template has a placeholder syntax it has a
parser, an escaping rule and a failure mode, and this design's whole
argument is that scaffolding three files needs none of that.

## 5. The template set, and why it starts at one

**D6.** P1 ships exactly one template, `minimal`: the four files of
§3. It is the set that makes the verb useful and it is the set that
cannot be wrong.

The pressure to add more is real and should be resisted until there is
evidence, for the reason [G9](../capability-review/g9-transformation.md)
gives about escapes and the OpenAPI Generator: a template set that
grows one entry per use case becomes a directory of half-maintained
examples that nobody runs, and the corpus under
[`use-cases/`](../../use-cases/) is already the place where worked
examples live and are executed on every commit. A template is not a
worked example; it is the smallest thing that runs.

The second template, when it is justified, is `schema` — a schema
document, a data document and the `vet` that checks one against the
other — because that is the language's central act and the one shape
every new user writes next. X-2 records what would justify it.

## 6. The write posture

**D7.** `init` writes only below the target directory, resolved by
realpath; a template path that is absolute or contains `..` is a
refusal, not a normalisation. That is the posture
[G9 phase 6](../capability-review/g9-transformation.md) specifies for
`render --out`, and `init` should not invent a second one.

**A correction this note owes G9.** That phase says it specifies a
write posture "because this is the first verb with a write effect".
That is not so, and the claim should not survive into the amendment
that lands it. Probed, the verbs that already write are `fmt -w`,
`agentsmd --write`, `mod tidy` (which writes `aontu_meta/mod-lock.aon`),
`mod vendor` (which writes the whole closure under
`aontu_meta/vendor/`), `set --overlay` and `view --out`. What is true,
and worth stating in `docs/trust.md` once for all of them, is that
**the trust contract confines reads and says nothing about writes** —
every writing verb today is confined by the path it was given and by
nothing else. `init` does not change that; it is the occasion to write
it down, and the paragraph belongs to whichever of the two verbs lands
first.

## 7. Boundary: what it will not do

- **No `git init`**, no first commit, no remote. A scaffolder that
  runs `git` is a scaffolder that needs `git` on `PATH`, which the
  hermeticity posture refuses for the same reason the renderer will
  not shell out to `gofmt`.
- **No network, ever.** Not to resolve a dependency, not to check a
  version, not to fetch a template. `init` is offline by
  construction.
- **No package manager.** No `npm install`, no `go get`.
- **No interactive prompts** (D3).
- **No `--force`, no overwrite, no merge** (D2). `init` runs once on a
  directory; re-running over a hand-edited scaffold is exactly the job
  Jostraca exists for and exactly the job `init` does not have.
- **No template discovery from disk or from a registry.** Templates
  ship with the engine and are versioned with it (D5).
- **No LLM.**

## 8. Why this is not Jostraca, and where Jostraca still belongs

Jostraca is the right tool for re-running a generator over files a
human has since edited: it owns atomic write-then-rename, the
existing-file policy matrix, three-way merge against the previous
generate, `Inject` and protected regions, and exclusion. Every one of
those is about the *second* run.

`init` has no second run — D2 refuses it. It writes three or four
small files from bundled text into a directory that does not yet
contain them, and there is no merge, no protected region and no
previous generate to be the ancestor of anything. Taking the
dependency for that would put a fifteen-megabyte transitive closure
(VERIFIED in [G9's Jostraca seam](../capability-review/g9-transformation.md),
`@jsonjoy.com` alone being fourteen of it) behind the first command a
new user runs, to do work the engine can do in twenty lines.

**None of which changes G9's D3.** The generation bridge still drives
Jostraca as a library, because generation *is* the repeated run over
hand-edited files. The two verbs have opposite lifecycles and should
not share a mechanism: `init` writes once and refuses to write twice;
`render` writes every time and has to reason about what it finds.

## 9. Gates

- A canon row and a hash row per template, in each port, as
  `std-system.tsv` already does for a bundled model.
- `fmt(template) == template` and `--lint` clean, both ports.
- **The scaffold runs.** A test that runs `init` into a temporary
  directory, then `mod verify`, then evaluates the entry document, and
  asserts all three succeed — in both ports, on the same bytes. This
  is the gate that matters: a scaffold that does not run is worse than
  no scaffold.
- The refusals: an existing `mod.aon`; an existing file the template
  would write; a `..` or absolute path.
- A CLI transcript in `docs/reference-api.md`, executed by
  `ts/test/docs.test.ts` as the other verbs' transcripts are.
- Help text byte-identical across the builds, as the suite already
  asserts for every other verb.

## 10. Phases

| phase | delivers | needs |
|---|---|---|
| **I1** — the verb | D1–D7, the `minimal` template, both ports, the gates of §9, the reference transcript, the how-to, the CHANGELOG | nothing |
| **I2** — the trust paragraph | `docs/trust.md` gains the "reads are confined, writes are confined by their path" statement covering every writing verb, and G9's "first verb with a write effect" claim is corrected | I1, or G9 phase 6, whichever lands first |
| **I3** — the second template | `schema`, if X-2's evidence arrives | I1 |
| **I4** — the engine pin | `aontu_meta/version` written at init time with the running build's series | [ENV.0.md](ENV.0.md) M0's pin format, which I1 can anticipate but not verify |

I1 is small and independent, and it is worth doing before the module
tooling grows: every document that teaches the layout today teaches it
in prose, and prose is what a scaffolder replaces.

## 11. Open questions

- **X-1 — `aontu init` or `aontu mod init`?** This note recommends the
  top-level verb (D4), because the entry document and the engine pin
  are not the module system's business. The counter-argument is that
  `mod.aon` is the file that makes a project a project, that the `mod`
  group already exists, and that a top-level verb spends a name from a
  small budget. Decided by: whether `init` ever writes something no
  module needs — which, with `aontu_meta/version`, it already does.
- **X-2 — What justifies the second template?** Proposed: two
  independent requests for the same shape, or a documented workflow
  that cannot start from `minimal` in one step. Not: a new use case,
  since the corpus is already the home for worked examples.
- **X-3 — Should `init` seed an `AGENTS.md` stanza?** `aontu agentsmd
  --write` exists and splices a stanza into an existing file. Offering
  `--agents` at init would put the project's ground truth in front of
  an agent on day one, which is the mission — but it also makes `init`
  the second writer of a file whose first writer already has a merge
  rule, and two writers of one file is how the marker mechanisms in
  this repository got complicated. Decided by: whether `agentsmd`'s
  splice is safe to run on a file it created itself.
- **X-4 — Does `init` write the lockfile, or tell the user to run
  `mod tidy`?** This note says write it (§2), so that `mod verify`
  passes immediately. The counter-argument is that the lockfile is
  generated state and a scaffolder that produces generated state is
  making a claim about a dependency set it did not resolve. For a
  project with no dependencies the two positions coincide, which is
  why the question can wait for the first template that has one.
- **X-5 — A `--dry-run`?** It costs little and it is the natural way
  for an agent to ask what would be written. The argument against is
  that `init` is already refusable and already prints what it wrote,
  so a dry run is a second output format for a verb with one job.

# G11: The offline agent on-ramp

*Status: implemented — all seven phases landed in both ports on
2026-09-09 (the teaching pack, the mistyped-verb hint, `explain`, the
vacuity signals, `vet --coverage`, `init`, and the bare command's JSON
report). Part of the [capability review](index.md), opened 2026-09-09.
Per-phase status is in the [progress register](progress.md), which is
authoritative for status; this document is authoritative for design.
This document expands gap G11 — what an agent can learn about aontu
from aontu alone, with no network, no documentation site and no model
prior — with alternatives, an explicit boundary, risks, and an
implementation plan.*

## Problem

[G7](g7-machine-access.md) asked whether an agent can **consume** an
aontu definition and answered it: `get`, `why`, `set`, `hash` and the
MCP server are all in, in both ports where the design said both. The
question G7 never asked is the one before it. **Can an agent arrive at
a definition in the first place?**

The scenario is the deployment one, and it is not hypothetical. An
agent is told, in a system prompt or a tool description, some sentence
like *"aontu is a command you can run to generate and check ontologies
against code"*. It has the binary. It has no network. Whatever it knows
about aontu from pre-training is nothing, because this project is
smaller and newer than any training corpus that would carry it. The
only teacher in the room is the command.

The command teaches the toolchain and never the language.

### The measurement

Driven cold against the Go binary built from `f661a87`, with the
repository unavailable to the caller:

**`--help` is a strong machine contract.** Around 250 lines, twenty
verbs, every flag, and — rare in a CLI — the exit-code semantics of
each verb spelled out as a table of verdict classes. `vet` alone
documents five. Nothing below is a complaint about the help's
coverage of the *tool*.

**The language is absent from it.** The character `&` — the map
template, which is how a document says *every entry here must satisfy
this*, and therefore the single construct an ontology cannot be written
without — occurs **zero** times in `--help`. The word `template` occurs
fourteen times, and every one of them refers to the unrelated
code-generation verb, so an agent searching the help for the concept it
needs finds a different concept wearing its name.

**The word the caller was given is a word aontu does not say.**
`ontolog` matches nothing in either CLI (`ts/src/cli.ts`,
`go/cmd/aontu/main.go`) and nothing in the reader-facing documentation;
it appears only in `docs/design/ONTOLOGY.0.md` and inside this review.
The agent must guess, unaided, that its task decomposes into an entity
map, `relations`, `reaches` and `render --check`.

**The first move fails, and fails uninformatively.** `aontu help` —
the single most probable opening command an agent will issue — answers
`aontu: cannot read help: open help: no such file or directory` and
exits 1. The good hint that exists for this class of mistake,
*"a mistyped verb reads as a file name (try --help)"*, is gated behind
`1 < len(files)`, so it fires for `aontu check a.aontu b.aontu` and never
for the bare one-word guesses (`help`, `init`, `ontology`, `docs`)
that an agent actually makes first. Both ports, same gate
(`go/cmd/aontu/main.go` around the `1 < len(files)` refusal;
`ts/src/cli.ts:4381`).

**There is no offline documentation channel from the binary at all.**
`docs/skill/` (SKILL.md, grammar-card.md, examples.md, error-codes.md)
and `grammar/` are exactly the right content, and `ts/scripts/prepack.js`
already stages both into the npm tarball with its link rewrites
asserted. But nothing the CLI prints says those files exist, so an npm
installation carries the teaching pack into `node_modules/aontu/skill/`
where no agent will look for it, and `go install` ships no
documentation whatsoever — the only `//go:embed` in the Go tree is
`sigdecl.txt`.

**157 error codes are registered and none can be looked up.**
`test/spec/errcodes.tsv` registers 157 codes across seven classes, and
the spec suite asserts set equality between that file and the engine's
class map in both ports. The hint tables are smaller and are not
themselves in parity: 130 texts in `ts/src/hints.ts`, 131 in
`go/hints.go` (the extra is `decimal_syntax`, which TypeScript never
raises). Every one of those explanations is reachable only by
triggering the error that carries it, and the 27 registered codes with
no text are invisible for the same reason. There is no
`aontu explain <code>`.

### The failure this produces

Those are frictions. This one is a defect in the outcome.

Asked to constrain every entity in a model, an agent reaches for the
wildcard its neighbours use — JSON Schema's `additionalProperties`,
CUE's `[string]:`, a glob. It writes:

```aontu
entity: { "*": { name: string, table: string } }
```

`"*"` is a literal key named `*`. `aontu get $.entity --keys` on that
document returns exactly one key, `*`. The schema constrains nothing.
Vetting data in which `table: 42` plainly violates `table: string`:

```
$ aontu vet --partial schema.aontu data.aontu
verdict: valid
$ echo $?
0
```

aontu is not wrong here. It was asked a question about a document that
declares an entity called `*`, and it answered correctly. The defect is
that **a check that examined nothing and a check that passed are the
same bytes and the same exit code**, so the agent reports success and
the wrong data ships. Written correctly, with `&:`, the same run gives
a two-sited `no_scalar_unify` at exit 1 — a genuinely excellent
diagnostic that the agent had no offline way to earn.

The same silence recurs wherever a verb is handed a document of the
wrong shape:

| command | stdout | exit | stderr |
|---|---|---|---|
| `aontu view tree data.aontu` | 1 byte | 0 | empty |
| `aontu render s3.aontu` (no `--profile`) | 0 bytes | 0 | empty |
| `aontu relations data.aontu` (none declared) | `verdict: pass` | 0 | empty |

Three verbs that did nothing, reporting the exit code of a verb that
did something. For a human at a terminal this is a shrug and a re-read
of the help. For an unattended agent it is a green check mark on an
empty box, and the whole value proposition of a validation gate — that
a passing gate means something — is spent.

### Why this is a gap and not a documentation chore

The repository has already ruled on the principle, in
[G8 phase 6](progress.md), about `trim`:

> `--check` is REQUIRED — `aontu trim f.aontu` reads as "trim this file",
> and doing something else silently is worse than refusing.

That is the reasoning of this gap, applied once, to one verb, at a
moment when someone happened to notice. G11 is that ruling made
general: **a verb that cannot do its job must say so, and a check that
checked nothing must not answer like a check that passed.**

And the documentation half is not a chore either, because the content
already exists and is already maintained to a gate. `docs/skill/` is
tested by `ts/test/skill.test.ts`. The grammar is published. The
problem is one of *delivery*: the artefacts sit in a repository the
agent cannot reach, when they could sit in the binary the agent is
holding.

## Current state

What an offline agent has today, in full:

- **`aontu --help`.** Complete on verbs, flags and exit codes; silent
  on the language. Identical in both ports.
- **Failure messages.** Excellent. A conflict prints the rule that was
  violated, worked examples of the rule, and **both** contributing
  sites with carets and source lines. This is the strongest
  agent-facing surface aontu has, and it is a surface only reachable
  by failing.
- **`--format json` on every verb except the bare command**, with
  `code`, `class`, `path`, `severity`, `sites[]` and `hint`. Graded
  exit codes (0/1/2/3/4) throughout. The bare command refuses
  `--format` as an unknown option, so the default entry point is the
  one an agent must parse with a regular expression.
- **`aontu agentsmd`.** The right idea, derived rather than written,
  and pinned by a canon-hash. Its shape projection is fixed at
  `depth: 2`, so a two-level model reports `{"entity":{&:top}}` and the
  agent learns the root key and nothing about the fields under it.
- **The JSON superset holds.** Plain `.json` files evaluate. Trailing
  commas are accepted. An agent's existing JSON competence transfers on
  the first attempt, which is the one genuine on-ramp that exists
  today and is worth protecting.

What it does not have: any way to learn a construct it does not
already know, any way to look up a code it has just been handed, and
any way to tell a vacuous check from a real one.

## Prior art

**`go doc` and `go help <topic>`.** The Go toolchain ships its own
documentation inside the binary and treats `go help` as a first-class
verb with topics (`go help modules`, `go help gopath`). The relevant
property is not that the text exists but that **the entry point is the
word a newcomer types**. `go help` with no argument prints the topic
index rather than an error.

**`git help -g`.** The concept guides ship with the binary and are
enumerable. `git` also does the thing this gap asks for on typos:
`git stauts` suggests `status` rather than reporting a missing file.

**`rustc --explain E0308`.** The closest prior art for phase 3.
Rust registers every diagnostic code, and `--explain` prints the long
form with a worked example. aontu has the registry and most of the
texts already; it lacks the lookup, and lacks any way to see which
codes have no text.

**`kubectl explain`** and **`aws ... help`** show the failure mode to
avoid: documentation so voluminous that retrieving it costs more
context than the task. Whatever ships in the binary must be sized for
a context window, which is what makes `docs/skill/`'s four short files
the right corpus and `docs/reference-language.md` the wrong one.

**Coverage as a first-class report** already exists in this repository:
`aontu render --coverage` reports model paths no output consumed and
rendered declarations no rule produced. Phase 5 below is that idea
carried to `vet`, and it should be read as an extension of a shipped
design rather than a new one.

## Design space

**Alternative 1 — write better documentation and rely on the model
having read it.** Rejected by the premise. The scenario is offline and
the corpus predates the project.

**Alternative 2 — ship a skill file and expect the harness to load
it.** This is what `docs/skill/` is, and it works exactly when a
harness has been configured to mount it. It cannot be the only channel,
because the gap is defined by the case where nobody configured
anything. Keep it; do not depend on it.

**Alternative 3 — put everything in `--help`.** Rejected on size. The
help is already 250 lines and adding a language tutorial to it makes
the common case (a caller checking one flag) pay for the rare one.
Topics are the standard answer and `go help` is the precedent.

**Alternative 4 — a `--why-nothing` flag on each verb that did
nothing.** Rejected: it requires the caller to suspect the problem,
and the caller is an agent that has already believed the exit code.
The signal must be unconditional and on stderr, where it cannot
corrupt a `--format json` stdout contract.

**Alternative 5 — make a vacuous vet an error by default.** Rejected
as a breaking change to a shipped verdict contract, and wrong on the
merits: a schema that legitimately constrains a subset is not an
error. The report is the answer; `--strict-coverage` is how a caller
who wants it to be an error asks for that.

## Proposed design

Seven phases, each additive, each in both ports.

### 1. `aontu help [topic]` — the teaching pack, embedded

`aontu help` with no argument prints a topic index. `aontu help
<topic>` prints one topic to stdout, exit 0. Topics:

| topic | content | source |
|---|---|---|
| `language` | the grammar card — the whole surface on one page | `docs/skill/grammar-card.md` |
| `examples` | the JSON-superset ladder | `docs/skill/examples.md` |
| `codes` | the error-code index | `docs/skill/error-codes.md` |
| `tasks` | intent → verb, in the caller's vocabulary | new, this document |
| `grammar` | the ABNF | `grammar/aontu.abnf` |

The corpus is **generated into each port and committed**, on the
`sigdecl` precedent: `test/spec/signature.tsv` is already copied to
`go/sigdecl.txt` and `ts/src/sigdecl.ts` by `make sig`, with both
suites asserting byte identity. `//go:embed` cannot read above its own
package directory, so for Go a committed generated copy is not a
preference, it is the only mechanism. The same generator writes the
TypeScript copy, so neither port can drift from `docs/skill/` without
failing its suite.

`tasks` is new content and carries the vocabulary bridge:

```
describe a domain            an entity map, with `&:` for what every entry must satisfy
check data against a model   aontu vet model.aontu data.aontu
check a model is coherent    aontu relations model.aontu ; aontu reaches <a> <b> model.aontu
check code against a model   aontu render --check <dir> model.aontu
ask what a model says        aontu get $.path model.aontu
ask why it says it           aontu why $.path model.aontu
```

The words a caller arrives with — *ontology*, *schema*, *validate*,
*model* — appear on the left, so the mapping is findable by the term
the caller was given rather than the term aontu chose.

### 2. The one-argument mistyped-verb hint

The existing refusal is correct and only mis-scoped. Extend it: when
the bare command is given exactly one file that cannot be read, and
that argument looks like a bare word rather than a path (no `/`, no
`.`), say so and name the nearest verb by edit distance.

```
$ aontu help
aontu: `help` is not a file, and not a verb this port knows
aontu: did you mean `aontu --help`?  (`aontu help <topic>` after G11.1)
```

The path-shaped test matters: `aontu ./help` must keep meaning "read
the file named help", which is the same escape hatch the subcommand
dispatch already documents.

### 3. `aontu explain <code>`

`rustc --explain`, over a table this repository already maintains.
Prints the class, the hint text, and where the code sits in the
registry; `--format json` returns `{code, class, hint, since}`. An
unknown code exits 2 and lists near matches. **The registry is the list, not the hint table.** `codeClasses` is set-equal
with `test/spec/errcodes.tsv` in both ports; the hint tables are not in
parity with each other, so listing from them would make the verb differ
between ports over something that is not about what either can report.
Listing from the registry also makes the 27 codes with no text
**visible**, marked in the listing and saying so when asked — before
this verb, a missing hint could only be met beside the error that
raises it.

### 4. Vacuity signals

Each verb that can do nothing says so on **stderr**, leaving stdout —
and therefore every `--format json` contract — untouched:

- `view` with an empty figure: `aontu: nothing to draw: <why>` (the
  document declares no relation / the path names an empty subtree).
- `render` with no profile: `aontu: no profile given, and the document
  declares none; nothing was rendered (see aontu help tasks)`.
- `relations` with no relation declarations: `aontu: this document
  declares no relations; `pass` means nothing was checked`.

Exit codes do not change in this phase. The verdict word does not
change. What changes is that the caller is told, and a caller that
wants it to be fatal gets phase 5's flag.

### 5. `vet --coverage` and `--strict-coverage`

The phase that closes the defect. `vet --coverage` adds a `coverage`
object to the report:

```json
"coverage": {
  "checked": 0,
  "declared": 4,
  "leaves": 4,
  "unchecked": ["$.entity.moon", "$.entity.planet"],
  "unused": ["$.entity.*"],
  "vacuous": true
}
```

**`vacuous` is about LEAVES, and that is a correction this phase made
to its own design.** The sketch above said "no schema path constrained
any data path", and measuring it that way answers `false` on the very
failure it was written for: the `"*"` schema *does* declare `entity`,
so the container path `$.entity` matches and the count is not zero. A
leaf is where a value lives, and matching a container constrains no
value — so `checked` counts data leaves, and `vacuous` is true when
none of them was constrained over a document that has leaves. A
document with no leaves is not vacuous either: there was nothing to
examine.

Under `--strict-coverage` a vacuous run exits 1 regardless of the
verdict word, which is the flag a CI gate and an agent loop both want,
and it implies `--coverage` because a gate cannot fire on what was
never measured. Without the flag the verdict contract is unchanged, so
nothing that passes today starts failing.

The accounting is **structural** — what the schema declares about the
data — rather than a reading of the meet. A meet-based reading would
count a value the data supplied to itself as covered, which is the
opposite of the question being asked.

Modelled on `render --coverage`, including its refusal to write
anything, its `--coverage-at` narrowing, and its shallowest-path
reporting, so the two coverage reports read alike.

### 6. `aontu init`

Writes a minimal, correct, *working* trio into an empty directory:
`model.aontu` (an entity map using `&:`), `data.aontu` (an instance that
satisfies it), and `check.sh` (the four commands that check it). Refuses
to overwrite. The point is not scaffolding convenience; it is that the
agent's most expensive failure is writing a first document at all, and
a known-good starting document converts that from generation to
editing. The seventeen `use-cases/` directories are the corpus this is
minimised from.

### 7. `--format json` on the bare command, and `agentsmd --depth`

The bare command gains `--format text|json`, defaulting to text, so a
failure at the default entry point is machine-readable like every other
verb's. `agentsmd` gains `--depth <n>` (default unchanged at 2) so an
agent can ask for a shape it can actually act on, and its stanza gains
a line pointing at `aontu help language`.

## Boundary: what we will not do

- **No natural-language interface, and no bundled model.** The verbs
  are the interface. This gap makes them findable, not conversational.
- **No `--fix`, and no verb that edits a document to make a check
  pass.** `set` is the writing surface and it is deliberately narrow.
  A gate that repairs what it is gating is not a gate.
- **No shipping the full reference in the binary.** `docs/skill/`'s
  four files plus the ABNF are the corpus, chosen to fit a context
  window. `aontu help language` is a card, not a manual.
- **No change to any existing verdict word or exit code.** Every phase
  is additive. `--strict-coverage` is opt-in for exactly this reason.
- **No second source of truth for documentation.** Everything embedded
  is generated from `docs/skill/` and `grammar/` and asserted
  byte-identical, on the `sigdecl` precedent. A hand-maintained copy
  inside the CLI would be stale within one release.

## Risks

**Binary size.** The corpus is roughly 15 KB of Markdown. Against a
9.4 MB Go binary this is not a cost worth discussing, and the phase
should be refused if it ever grows past a few tens of kilobytes.

**Drift between the embedded copy and `docs/skill/`.** The whole
reason for generating rather than copying by hand. Both suites assert
byte identity, and `make build-ts` runs the generator, exactly as
`make sig` does today.

**Stderr noise breaking a caller that parses it.** Phase 4 writes to
stderr, which several verbs already use for loss reports
(`jsonschema`, `view`), so the precedent and the separation are both
established. No `--format json` stdout contract changes.

**`--strict-coverage` producing false positives on legitimately narrow
schemas.** Mitigated by being opt-in, and by `vacuous` being defined
narrowly — *no* schema path constrained *any* data path — rather than
as a percentage threshold nobody can defend.

**Coverage instrumentation costing evaluation time.** `render
--coverage` already threads this and is the implementation to copy;
the accounting is per-path and off unless asked for.

## Implementation plan

Spec-first throughout. Nothing may regress a shared row or either
coverage floor. Both ports per ADR-001; the parity probe (AGENTS.md)
runs before any row is written.

**Phase 1 — `aontu help [topic]`, both ports (M).** The generator
(`ts/scripts/helpdoc.cjs`, a `make helpdoc` target wired into
`make build-ts`), the committed corpora (`go/cmd/aontu/helpdoc/`,
`ts/src/helpdoc.ts`), the verb in both CLIs, the byte-identity
assertions, and `docs/skill/tasks.md` as new content.

**And the internal documentation gets a gate of its own.** Serving the
skill sources from the binary makes them shipped artifacts, so the
question of what keeps documentation current stops being a matter of
habit — which is the same question this review's own register answers
with "the discipline is the whole mechanism". Two checks close it. The
teaching pack is byte-compared with `docs/skill/` in both suites, so a
stale copy fails rather than ships. And the register itself becomes
machine-checked for structure (`ts/test/capability-review.test.ts`):
the summary table derived from the rows it summarises, every gap
document required to have a register section and an index row, every
LANDED row required to cite a path or a symbol, the `G1–Gn` range kept
current in the four files that quote it, and every link resolved. What
no test can check is whether a pin is TRUE; that half stays the
same-commit rule.

**Phase 2 — the one-argument hint, both ports (S).** The refusal, the
path-shaped test, and the nearest-verb suggestion.

**Phase 3 — `aontu explain <code>`, both ports (S).** The lookup over
the registry, the JSON envelope, near-match suggestions, and the
`(no text)` marking that makes the unexplained codes countable.

**Phase 4 — vacuity signals, both ports (M).** `view`, `render` and
`relations` report when they did nothing. One shared spec mode is not
needed: these are CLI-level messages and belong in the port-native
command suites, as the mistyped-verb refusal already does.

**Phase 5 — `vet --coverage` and `--strict-coverage`, both ports (L).**
The accounting in the engine, the report field, the flag, and shared
rows. The largest phase and the one that closes the defect; sequenced
after 1–4 because those are what stop an agent reaching this state in
the first place.

**Phase 6 — `aontu init`, both ports (S/M).** The trio, the refusal to
overwrite, and a check that the emitted documents pass their own
`check.sh` in CI.

**Phase 7 — `--format json` on the bare command, `agentsmd --depth`
(S).** The smallest phase, listed last because it is a convenience
where 1–5 are corrections.

## Open questions

1. **Should `aontu` with no arguments and no TTY print the topic index
   instead of reading stdin?** An agent that runs `aontu` bare with no
   pipe currently blocks or reads an empty stdin. Printing the index
   would be friendlier and would change a documented behaviour, so it
   is deferred rather than decided here.

2. **Does `vacuous` belong on `subsume` and `relations` too?** The same
   argument applies — a subsumption query with nothing to compare
   answers `subsumes` — but the coverage accounting is different for
   each and phase 5 should prove the shape on `vet` first.

3. **Should the embedded corpus be reachable as a resource over MCP?**
   The TypeScript MCP server could serve `help/language` as an MCP
   resource, which is the idiomatic channel for exactly this. Left out
   of phase 1 because Go serves no MCP (G7.6) and a TypeScript-only
   answer to an ADR-001 question needs its own argument.

4. **What is the right nearest-verb metric?** Edit distance is the
   obvious answer and mis-suggests on short words. `git`'s
   implementation is worth reading before phase 2 picks one.

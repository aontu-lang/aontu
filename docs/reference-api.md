# API reference

The programming interfaces of both implementations, plus the
command-line tool. For the language itself see the
[Language reference](reference-language.md).

## Contents

- [Command-line interface](#command-line-interface)
- [Evaluation consumes the tree](#evaluation-consumes-the-tree)
- [TypeScript API](#typescript-api)
  - [`Aontu`](#class-aontu)
  - [`AontuOptions`](#aontuoptions)
  - [`AontuContext`](#aontucontext)
  - [`Val`](#val-typescript)
  - [Exact numbers and `exactJSON`](#exact-numbers-and-exactjson)
  - [Variables](#variables)
  - [Exports](#exports)
- [Go API](#go-api)
  - [`Aontu`](#type-aontu)
  - [`Val`](#val-go)
  - [Exact numbers in Go](#exact-numbers-in-go)
  - [`Ctx` and errors](#ctx-and-errors)
  - [Variables in Go](#variables-in-go)
- [Behavioural parity](#behavioural-parity)

---

## Command-line interface

Both implementations ship the same `aontu` command. It evaluates a
source file (or stdin) and prints the result, or starts a REPL when run
interactively with no file. The synopsis, from the command itself:

<!-- test: run -->
```sh
$ aontu --help
Usage: aontu [options] [file]
       aontu vet [options] <schema> <data> [more-data...]
       aontu subsume [options] <general> <specific>
       aontu breaking --against <file|git#rev> [options] <file>
       aontu trim --check [options] <file>
       aontu relations [options] <file>
       aontu reaches <from> <to> [--relation <name>] [options] <file>
       aontu view <kind> [options] <file>...
       aontu view --views <path> [--check] [options] <file>
       aontu jsonschema [--at <path>] [--strict] [options] <file>
       aontu hash [options] <file>
       aontu mod tidy|verify|vendor|manifest [options] [dir]
       aontu get <path> [options] <file>
       aontu why <path> [options] <file>
       aontu set <path>=<value>... --entry <file> --overlay <file>
       aontu agentsmd [--write <AGENTS.md>] <file>

Evaluate an Aontu source file and print the result as JSON.
With no file on an interactive terminal, start a REPL.
With no file and piped input, read the source from stdin.
...
```

The elided remainder lists every option; the per-verb sections below
carry the same lists. Two options apply everywhere: `--trust <t>`
(the include capability — `system`, `none`, or `root[:dir]`; see
[`AontuOptions`](#aontuoptions) for what each admits) and its
shorthand `--include-root <dir>`.

**Behaviour**

- **File:** `aontu config.aontu` reads, unifies and prints the file.
  Relative `@"file"` loads inside it resolve against the file's own
  directory, so it works from any working directory.
- **Exactly one file.** The bare form is `aontu [options] [file]`,
  singular, and a second file name is a usage error (exit 2) rather
  than a silent discard. This is what makes a MISTYPED VERB fail
  loudly: `vet2` matches no subcommand, so it falls through as a file
  name, and `aontu vet2 schema.aon good.json` is a usage error rather
  than a plausible pass — in the one place a tool loop reads the exit
  code to decide whether the data is good. A file genuinely named like
  a verb is still reachable as `./vet`.
- **Stdin:** `echo 'a:1 b:$.a' | aontu` reads source from the pipe.
- **REPL:** `aontu` with no file on a terminal starts an interactive
  loop; each line is evaluated and printed.
- Output is pretty-printed JSON by default, or canonical form with
  `--canon`.
- **Exact numbers keep their digits.** A document using the `0d` exact
  literals prints them in full, at any magnitude: `x:0d9007199254740993`
  prints `9007199254740993`, not a rounded `…992`. The TypeScript CLI
  gets this from the library's [`exactJSON`](#exact-numbers-and-exactjson)
  export, the Go CLI from a `json.Encoder` over the
  [marshalling types](#exact-numbers-in-go) — with HTML escaping **off**
  in both, so `<`, `>` and `&` stay literal and the two CLIs print the
  same bytes.
- Results go to **stdout**; errors go to **stderr** with a non-zero exit
  status (`1` for an evaluation error, `2` for a bad option).

### `aontu vet`

Validate data documents against a schema document. This is the
emit → validate → repair loop's entry point: an agent writes a
document, `vet` says what does not hold and where, and the exit code
says which kind of "no" it was.

```
aontu vet [options] <schema> <data> [more-data...]

  --at <path>       Validate against this path of the schema ($.a.b)
  --closed          Refuse keys the anchor does not declare
  --partial         Residue is reported but does not fail the run
  --max-errors <n>  Cap the finding list (default 20)
  --format <f>      text (default), json or sarif
  --watch           Re-run whenever a watched file changes
```

**Exit codes are verdict classes**, not a pass/fail bit, because the
three ways to fail call for three different responses:

| Exit | Verdict | Meaning |
|------|---------|---------|
| 0 | `valid` | the data unifies and is concrete (or `--partial`) |
| 1 | `invalid` | the data does not hold: a contradiction it can never satisfy, or a document that would not parse |
| 2 | — | usage: a bad option, or a file that cannot be read |
| 3 | `incomplete` | no contradiction, but the truth is not yet satisfied |
| 4 | `error` | the run could not be set up from the schema side: an unusable schema, or an `--at` that names nothing — never the data's fault |

Each data file is vetted separately, and the worst verdict wins: two
data files are two candidates for the same truth, not one merged
candidate. `--max-errors` caps the whole report, not each file, and
says so with `truncated`.

**A data file that will not parse is the data's fault**, and is
reported as one `parse`-class finding with a site in that file — not as
a broken schema. The distinction matters to the loop the verb exists
for: exit 1 says "repair what you emitted", exit 4 says "the truth you
were given is unusable, stop".

**A parse failure is located.** Its single site carries the parser's
own row and column, 1-based — the same position the human renderer
draws its caret under. A document whose second line is `b: ]` reports
`row: 2, col: 4`, in both ports.

**A site has an extent, so a finding can be repaired.** Beside `row`
and `col` a site carries `len` — the span in UTF-16 code units, the
units `col` is already counted in — and `src`, the source text that
span covers. Both are `-1` and `""` when unknown, and a consumer must
not edit a site that says so.

The extent is not optional detail, because **`value` is the canon and
not the source text**. Vetting `port: 0x1F` reports `value: "31"` at
column 7, so replacing `(col, value.length)` writes `port: 90001F`.
With the span the edit is `(col, len)` — `(7, 4)` — and lands exactly
on `0x1F`.

`src` is what makes the span **verifiable**: read the document at
`(row, col, len)`, compare it to `src`, and refuse if they differ. That
check matters most where the span is honest but partial. A site names
the token it points at, exactly as `row` and `col` always have, so a
scalar reports its whole literal while a compound reports its opening
token — `min(1)` reports `src: "min"`, a map reports `src: "{"`. Seeing
`min` where it expected `min(1)`, a consumer refuses rather than
replacing the name and orphaning the arguments.

To see the site shape, pin `port` in a one-line `schema.aon`:

<!-- test: scenario vet-site -->
<!-- test: file schema.aon -->
```aontu
port: 8080
```

and vet a `data.aon` that spells a different port in hex:

<!-- test: file data.aon -->
```aontu
port: 0x1F
```

<!-- test: run -->
```sh
$ aontu vet --format json schema.aon data.aon
{
  "aontu": {
    "verb": "vet",
...
      "sites": [
        {
          "col": 7,
          "file": "data.aon",
          "len": 4,
          "role": "data",
          "row": 1,
          "src": "0x1F",
          "value": "31"
        },
...
$ echo $?
1
```

`value` says `31`, `src` says `0x1F`, and `len` says the span is four
code units — the three facts an editing consumer needs, together.

`aontu why` carries the same pair: each conjunct in the record has the
`len` on its site and the contribution's own `src` beside its `canon`.

**A site names the file whose text it excerpts**, which for a modular
document is not the entry file. A constraint written in
`lib/types.aon` and reached through `@"lib/types.aon"` is reported at
`lib/types.aon` with that file's row and column — never at the entry
with the included file's coordinates, which is a real file name
against a line it may not have.

The name is the one the CALLER'S OWN spelling reaches: `vet
contract.aon` names `types.aon`, `vet a/b/contract.aon` names
`a/b/types.aon`, and an absolute entry keeps absolute includes. So a
site can be opened from wherever the command was run, and a report
stays repo-relative — which is what a SARIF upload needs. Identity is
still the resolved path underneath: two documents loading one library
by different relative spellings are one file, not two.

**Every verdict carries its finding, `error` included.** A schema that
does not stand up — a contradiction inside it, a document that will not
parse, a merge marker — reports what failed and where, while the
verdict stays `error`: whose fault it is and what the fault is are two
separate answers, and the report gives both. Every site is in the
schema (role `schema`), and a contradiction names both of its operands,
exactly as one in the data would. A report that said only `error` was
the one a repair loop could do nothing with.

**`--at` takes a structural path** — map keys and list indices, the
same thing a reference means by `$.a.b`, with an index spelled as a
plain decimal integer. A path that names nothing is verdict `error`,
carrying the same `no_path` finding `get` and `why` give — including
the "did you mean" note when a near key exists.

**Relative `@"file"` loads inside either document** resolve from that
document's own directory, exactly as they do for `aontu <file>`.

**A finding names both sides.** Sites are labelled by provenance —
`data` first, because that is the one to edit — rather than by the
source-order heuristic a single-document error uses. Write a closed
schema as `service.aon`:

<!-- test: scenario vet -->
<!-- test: file service.aon -->
```aontu
service: close({
  name: string
  port: *8080 | integer
  replicas: integer
})
```

and a `deploy.json` with one mistyped key and one string where an
integer belongs:

<!-- test: file deploy.json -->
```json
{"service": {"name": "checkout", "prot": 8080,
  "replicas": "3"}}
```

<!-- test: run -->
```sh
$ aontu vet service.aon deploy.json
verdict: invalid

$.service.prot: closed [conflict]
  [aontu/closed]: Cannot resolve value at path $.service.prot
  data: deploy.json:1:42 (8080)
$.service.replicas: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.service.replicas
  data: deploy.json:2:15 ("3")
  schema: service.aon:4:13 (integer)
$ echo $?
1
```

The `closed` finding has no schema site — there is no line that
refuses `prot`, only a `close()` that never declared it — and the
`no_scalar_unify` finding names both.

`--format json` emits the same report as an object, with an `aontu`
stanza naming the producer, so a report read from a pipe says which
version and verb made it. Where the constraint algebra knows what would
have unified, the finding carries it as `expected`/`actual`, and a
`must()` check's author message rides along as `note`.

**A finding carries the repair beside the diagnosis.** `message` is
the headline and stays one line — that is what makes it comparable and
greppable — so a finding also carries `hint`: the engine's own
explanation of the failure class, with the offending values filled in.
It is the text a human sees under the error frame, and for several
codes it is the only place the FIX is written down. A lossy integer
literal is the clearest case (abridged):

<!-- test: skip abridged finding excerpt; hint prose is deliberately outside cross-port parity and tracks the engine's wording -->
```json
{ "code": "lossy_integer_literal",
  "message": "[aontu/lossy_integer_literal]: Cannot resolve value at path $.port",
  "hint": "This integer literal, 9007199254740993, is not exactly representable in\nbinary64 ... write it as a `0d`\nliteral to get the exact integer." }
```

The field is absent, not empty, for a code that has no hint text.
Hint prose, like `message`, is deliberately outside cross-port parity.

**Colour is a decision about the destination.** Error frames are
coloured for a terminal and plain everywhere else: `NO_COLOR` (set, to
anything) turns colour off for every caller of the library, the command
additionally turns it off when its own stderr is not a terminal, and
`--jsonl` turns it off unconditionally — a JSONL answer is machine-read
by definition. A piped report therefore never carries terminal control
codes into a log, a CI annotation or a parser.

`--format sarif` emits the report as SARIF 2.1.0, the interchange form
CI systems ingest (GitHub code scanning upload, PR annotation) — a
minimal profile: one run, one result per finding, the data site as the
primary location, the schema site under `relatedLocations`, and the
whole native finding embedded in `properties`, so a SARIF consumer
still holds the native contract. Severities map to SARIF levels
(`info` → `note`). The renderer is library API in both ports
(`sarifReport(report, version)` from `aontu`; `aontu.SarifReport` in
Go), and its bytes are held to cross-port parity by the golden in
[`test/spec/files/vet-sarif/`](../test/spec/files/vet-sarif/README.md).
A ready-made GitHub Action wrapping the verb ships in this repository:
[`vet-action/`](../vet-action/README.md).

`--watch` re-runs the whole vet whenever a watched file (the schema or
any data file) changes, streaming one report per run — honestly
non-incremental: parsed trees are single-use, so every run is a full
re-parse and re-unify, bounded by the fixpoint's pass budget. A file
that is briefly unreadable mid-save reports and keeps watching.

#### Vetting a recursive schema

A [recursive
schema](reference-language.md#recursive-references-fixpoints) needs
nothing extra from `vet`: the definition expands one level per
[meet](unification.md) with concrete data, so the checks descend exactly
as far as the data does, and a finding at depth is located there. The
vocabulary below is a trimmed version of
[use-cases/13-recursive-schema](../use-cases/13-recursive-schema/).
Write it as `chain.aon`:

<!-- test: scenario vet-recursive -->
<!-- test: file chain.aon -->
```aontu
spec: hide({
  Step: {
    approver: string & re("^[a-z]+@acme[.]example$")
    decision: *pending | pending | approved | rejected
    then?: $.spec.Step
  }
})
```

`--at` anchors the run at the definition — `hide()` keeps `spec` out
of generated output but not out of the path — so a data document is a
candidate `Step`, not a candidate whole file. A two-level chain in
`request.json` holds:

<!-- test: file request.json -->
```json
{"approver": "lead@acme.example", "decision": "approved",
 "then": {"approver": "cfo@acme.example"}}
```

<!-- test: run -->
```sh
$ aontu vet --at $.spec.Step chain.aon request.json
verdict: valid
```

A chain whose third level breaks the `approver` pattern, as
`request-deep.json` does, is refused **at that depth**:

<!-- test: file request-deep.json -->
```json
{"approver": "lead@acme.example", "decision": "approved",
 "then": {"approver": "cfo@acme.example",
          "then": {"approver": "EXTERNAL@other.example"}}}
```

<!-- test: run -->
```sh
$ aontu vet --at $.spec.Step chain.aon request-deep.json
verdict: invalid

$.spec.Step.then.then.approver: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.spec.Step.then.then.approver
  expected: re("^[a-z]+@acme[.]example$")
  actual:   "EXTERNAL@other.example"
  data: request-deep.json:3:32 ("EXTERNAL@other.example")
  schema: chain.aon:3:24 (re("^[a-z]+@acme[.]example$"))
$ echo $?
1
```

The finding's path is the unrolled position
(`$.spec.Step.then.then.approver`), while its schema site is the one
`re()` the author wrote — the definition is written once and applies
at every depth, and the report says both. For the recipe form see
[Define a recursive schema](how-to/define-a-recursive-schema.md).

### `aontu subsume`

The subsumption query as a command
([docs/reference-language.md, "Subsumption"](reference-language.md#subsumption)):
does the general document admit every instance the specific one admits?

```
aontu subsume [--profile values|defaults|gen] [--at <path>]
              [--format text|json] <general.aon> <specific.aon>
```

The exit code is the verdict class: `0` subsumes, `1` does not subsume
(the findings carry the witness — path, codes, both sites), `3`
undecided (always with a `sub_*` reason), `4` a document that does not
stand up on its own, `2` usage. The report reuses vet's finding object
and renderers, class `compat`.

**An unexpanded recursive position is `undecided`, never guessed.**
A [recursive reference](reference-language.md#recursive-references-fixpoints)
expands only against concrete data, and subsumption compares two
documents with no data on either side — so at the recursive position
there is no rule to apply, and the query says so rather than
answering from hope. Write a `general.aon`:

<!-- test: scenario subsume-recursive -->
<!-- test: file general.aon -->
```aontu
spec: hide({Step: {label: string, then?: $.spec.Step}})
doc: $.spec.Step
```

and a `specific.aon` whose step recurses into a DIFFERENT definition:

<!-- test: file specific.aon -->
```aontu
spec: hide({Step: {label: "start", then?: $.spec.Other},
            Other: {label: string}})
doc: $.spec.Step
```

<!-- test: run -->
```sh
$ aontu subsume general.aon specific.aon
verdict: undecided

$.spec.Step.then: sub_unresolved [compat]
  no subsumption rule covers this pair of value formers
  expected: $.spec.Step
  actual:   {"label":string}
  general: general.aon:1:42 ($.spec.Step)
  specific: specific.aon:2:20 ({"label":string})
...
$ echo $?
3
```

**The same recursion on both sides is decided**, and decided by
identity: a document that recurses, declares a relation or shares a
template by reference admits itself, because two values with the same
**hash form** are the same value. The rule runs only where the answer
would otherwise be `undecided`, so it narrows nothing else — and
without it a contract could not be gated against its own earlier
version at all.

This is the verdict [`breaking`](#aontu-breaking) fails on by
default: a gate that cannot decide a recursive contract reports
`undecided` and stops, and `--allow-undecided` is the deliberate
downgrade.

### `aontu breaking`

The evolution gate built on the same query: compare a document against
its own earlier versions.

```
aontu breaking --against <file|git#rev> [--at <path>]
               [--mode backward|forward|full]
               [--allow-undecided] [--format text|json] <file.aon>
```

- `--against` takes a file path or `git#<rev>`, and is repeatable.
  A `git#<rev>` spelling is the old version of the **whole tree**, not
  of the entry file alone: the revision's includable sources
  (`.aon`, `.aontu`, `.jsonic`, `.json`) are materialised into a
  temporary directory by shelling out to git — no embedded git — and
  the old document is evaluated from there, so a change inside an
  `@"…"`-included file is part of the comparison. The temporary tree
  is removed when the run ends. Sources outside the revision —
  package includes under `node_modules`, the bundled `std/system` —
  resolve as they always do; their versions travel with the lockfile
  rather than with this comparison. A file the revision does not carry
  is a usage failure naming it, not a comparison against nothing.
- `--at <path>` compares that path of **both** versions, the same
  anchor [`subsume`](#aontu-subsume) takes, and findings are reported
  from it. A module's top level carries the things that are *supposed*
  to change between releases — the version string, the
  `aontu_policy` block — so the whole-document comparison answers
  about those rather than about the contract, and a release that bumps
  only its version self-breaks the gate. Anchoring at the contract is
  the fix; splitting the file was the workaround.
- Modes: **backward** (the default) checks the new document subsumes
  the old — documents valid under v1 stay valid; **forward** checks the
  old subsumes the new; **full** checks both.
- The document can declare its own promise:
  `aontu_policy: hide({compat: *backward | forward | full | none})` —
  `breaking` reads `$.aontu_policy.compat` from the new document, and
  `--mode` overrides it. `none` declares no promise: nothing is
  checked.
- Exit codes mirror `subsume`'s: `0` compatible, `1` breaking, `3`
  undecided, `4` error, `2` usage. Undecided **fails** the gate by
  default — a gate that shrugs is not a gate — downgradable with
  `--allow-undecided`.
- `--allow-deprecated-removal` downgrades a finding about a value the
  old version already `deprecate()`d to a warning (still reported, no
  longer failing): deprecate-then-remove is the supported rename path.

### `aontu trim`

Report redundant map entries — entries whose removal leaves the
evaluated result unchanged, the spread-implied case included — as
paths.

```
aontu trim --check [--format text|json] <file.aon>
```

- The test is **evaluate-and-compare**: for each candidate entry the
  source is re-parsed, the entry deleted from the parsed tree, and the
  canon compared to the baseline. This covers everything the fixpoint
  can see (spread templates, references, duplicate-key merges), and a
  removal that *errors* is not redundant — the document does not stand
  up without that entry.
- Candidates are map entries at every depth; **list elements are not
  candidates** (removing one shifts every later index — a different
  document, not the same one minus a redundancy). A child of a
  redundant parent is skipped: removing the parent already covers it.
- `--check` is **required**: trim only reports, and `aontu trim f.aon`
  doing something other than trimming silently would be worse than
  saying so. It is not blocked on the machinery
  [`set --in-place`](#aontu-set) now has — a splice needs no
  format-preserving editor — but deleting an entry is a different
  edit from replacing one: a statement's span does not say which
  surrounding blank line or trailing comment went with it, and
  guessing wrong silently rewrites the file's shape.
- Exit codes: `0` clean, `1` redundant entries found, `4` the document
  itself does not evaluate, `2` usage.
- **A verdict of `error` says why.** A document that does not evaluate
  has no redundancy to report, but it does have a reason: the report
  carries `errors`, the engine's own first failure in the same finding
  shape [`vet`](#aontu-vet) reports in — code, class, path, sites with
  file, row, column and extent, and the repair `hint`. The field is
  present only on that verdict, and the text renderer prints the
  finding under the verdict line.

### `aontu relations`

Run the [declared-relation](reference-language.md#declared-relations)
checks — acyclicity and inverse consistency — over one finished model.

```
aontu relations [--format text|json] <file.aon>
```

The vocabulary is declared once, at the field; the model lists plain
names. The files below are a trimmed version of
[use-cases/12-relations](../use-cases/12-relations/).
Write the vocabulary as `spec.aon`:

<!-- test: scenario relations -->
<!-- test: file spec.aon -->
```aontu
spec: hide({
  Service: {
    kind: service
    dependsOn?: rel($.spec.ServiceShape) & acyclic() & inverse(usedBy)
    usedBy?: rel($.spec.ServiceShape)
  }
  ServiceShape: { kind: service }
})
```

A model whose edges hold, `system.aon`, passes:

<!-- test: file system.aon -->
```aontu
@"./spec.aon"
services: {
  &: $.spec.Service
  web:     { dependsOn: [path($.services.billing)] }
  billing: {
    dependsOn: [path($.services.ledger)]
    usedBy:    [path($.services.web)]
  }
  ledger:  { usedBy: [path($.services.billing)] }
}
```

<!-- test: run -->
```sh
$ aontu relations system.aon
verdict: pass
```

A `bad-system.aon` whose two services depend on each other, with
neither inverse written out, fails on every count at once:

<!-- test: file bad-system.aon -->
```aontu
@"./spec.aon"
services: {
  &: $.spec.Service
  auth:    { dependsOn: [path($.services.billing)] }
  billing: { dependsOn: [path($.services.auth)] }
}
```

<!-- test: run -->
```sh
$ aontu relations bad-system.aon
verdict: fail

$.services.auth.dependsOn.0  dependsOn: cycle $.services.auth -> $.services.billing -> $.services.auth
$.services.auth.dependsOn.0  dependsOn: $.services.billing does not list $.services.auth under usedBy
$.services.billing.dependsOn.0  dependsOn: $.services.auth does not list $.services.billing under usedBy
$ echo $?
1
```

- Relations are declared **at the field**, by
  [`rel(t)` and the graph atoms](reference-language.md#declared-relations):
  `acyclic()` and `inverse(name)` register the declaration during
  unification, and the verb reports the verdict over the finished
  model's edge set. There is no reserved `relations:` key — a document
  that writes one has written ordinary data.
- **These are not lattice constraints, deliberately.** Both properties
  are global and non-monotone — one more edge makes an acyclic graph
  cyclic — so they are facts about a finished model rather than
  something unification may hold. Generation enforces the same verdict
  (a located `relation_cycle` / `relation_inverse_missing` at the
  offending edge); the verb reports it without generating. The
  [language reference](reference-language.md#declared-relations) states
  the rule; the [explanation](explanation.md#why-there-is-a-verb-surface)
  argues it.
- A finding carries `at` (the position of the offending edge), `code`
  (`relation_cycle` or `relation_inverse_missing`), `relation`, and
  `detail` — for a cycle, the node paths it runs through in order; for
  a missing inverse, `[from, to, inverseName]`. Findings are **sorted by
  `at`**, so the report diffs cleanly.
- **The endpoint type is `rel(t)`'s flow**: declared once on the field,
  it flows into each far end at the site, so a conflict or a hole is an
  ordinary located evaluation error rather than a report row — and a
  document with a wrong-typed far end answers `verdict: error` here,
  because it does not stand up at all. (The old `target:` declaration
  and its `relation_target_unmet` finding are retired with the
  `relations:` key.)
- `--format json` wraps the same findings with the `aontu` producer
  block (`verb`, `version`) that every machine-readable report carries.
- Exit codes: `0` `pass`, `1` `fail`, `4` `error` (the document does
  not evaluate), `2` usage. Note these are the verb's own three
  verdicts, not [`vet`](#aontu-vet)'s five classes — there is no
  schema on the other side of this question, so `incomplete` has
  nothing to mean.
- **A verdict of `error` says why.** A document that does not stand up
  has no graph, so it has no relation findings — but the report carries
  `errors`, the engine's own first failure in the same finding shape
  [`vet`](#aontu-vet) reports in. `findings` stays the graph's own
  vocabulary; the two lists answer two different questions, and the
  `errors` field is present only on the `error` verdict.
- The library form is `relationCheck(src)` in TypeScript and
  `Aontu.RelationCheck(src)` in Go, returning the identical
  `{verdict, findings}` record (plus `errors` on a failed run); the
  derived graph the checks run over is `result.graph` /
  `Aontu.Graph`, described under [the TypeScript API](#class-aontu).

### `aontu reaches`

Ask whether one node **reaches** another over the link graph, at any
remove. Endpoints are `$.dotted` node paths.

```
aontu reaches <from> <to> [--relation <name>] [--format text|json] <file>
```

[`relations`](#aontu-relations) asks about the edge set as a whole.
This asks the question that needs the **closure**: does anything `from`
links to, at any remove, end up at `to`? That is the shape of every
blast-radius question an operator asks ("if the billing database goes,
what falls over?") and every containment question a policy asks
("nothing in the public tier may reach the ledger"), and neither can be
put one edge at a time. Ask it of the `system.aon` model above:

<!-- test: run -->
```sh
$ aontu reaches $.services.web $.services.ledger system.aon
verdict: reaches

$.services.web -> $.services.billing -> $.services.ledger
$ echo $?
0
```

- **The path is the answer**, not decoration: "yes" is worth little to
  an operator asking what a failure would take out, and the chain is
  what they act on. It is a **shortest** path, and among shortest ones
  the first in code-point order, so it is the same path in both ports.
  A `no` carries none — there is no evidence for a negative answer.
- **Transitive, not reflexive-transitive.** `reaches a a` is true only
  when a path of one or more edges returns to `a`, which says the graph
  has a cycle through `a` rather than saying nothing.
- `--relation <name>` follows only edges under that relation — the
  difference between "can this reach that at all" and "can it reach it
  *this way*".
- A link into part of a node (`$.services.auth.ports.http`) reaches
  **that node**, not the one above it: reachability is between tree
  positions, and there is no declared boundary to widen it to. Same
  rule [`relations`](#aontu-relations) uses, and it has to be, or the
  two verbs would disagree about what an edge connects.
- Exit codes: `0` `reaches`, `1` `unreachable`, `4` `error`, `2` usage.
  An unreachable pair is a **failed check**, not an error: the question
  was answered, and the answer was no.
- **An endpoint that names no node is a refusal**, reported as
  `refer_unresolved` with the linked nodes listed — answering `no`
  would report a typo as a fact about the model. An endpoint that
  exists but has no edges is a perfectly good question with the answer
  `unreachable`.
- Like acyclicity, this is a verb and **not a lattice constraint**:
  reachability is global and non-monotone, so a citizen asserting
  *non*-reachability could be true and then false as one more edge
  arrives.
- The library form is `reachCheck(src, from, to, options?)` in
  TypeScript and `Aontu.Reach(src, from, to, options)` in Go, returning
  the identical `{verdict, path?}` record (plus `errors` on a failed
  run).

In `system.aon` the `usedBy` inverses run the other way, so the ledger
reaches the web service in general but not along `dependsOn`:

<!-- test: run -->
```sh
$ aontu reaches $.services.ledger $.services.web system.aon
verdict: reaches

$.services.ledger -> $.services.billing -> $.services.web
$ aontu reaches $.services.ledger $.services.web --relation dependsOn system.aon
verdict: unreachable

$.services.ledger does not reach $.services.web
$ echo $?
1
```

And an endpoint that names no node refuses rather than answering:

<!-- test: run -->
```sh
$ aontu reaches $.services.web $.services.ledgr system.aon
verdict: error

$: refer_unresolved [reference]
  $.services.ledgr names no node in this document.
  note: nodes with links: $.services.billing, $.services.ledger, $.services.web
$ echo $?
4
```

### `aontu view`

Draw a **figure** of a finished model, as deterministic text a golden
diff can check: no coordinate is computed, nodes and edges are sorted
by code point, and both ports emit the same bytes.

```
aontu view <kind> [--as <profile>] [--at <path>] [--out <file> [--check]]
           [--strict] [--max-rows <n>] [--depth <n>] [--style <s>]
           [--format text|json] [options] <file>...
```

Nine kinds. Eight read a report the engine already produces; `doc`
reads the shape of the document itself, which is the one thing no
report holds:

| kind | draws | reads | profiles |
|---|---|---|---|
| `doc` | the document's own key tree, to a depth | the anchor walk, as `get --keys --types` reads it | `text`, `svg` |
| `tree` | the dependency tree of a relation: roots derived, repeats elided, cycles marked | the edge set | `text`, `svg` |
| `matrix` | the dependency-structure matrix over one relation, in `canon` or `partition` order, with `--closure` | the edge set and the relation declarations | `text`, `svg` |
| `graph` | the node-link drawing, grouped and labelled by fields of the nodes | the edge set, the declarations, the node values | `mermaid`, `dot`, `er` |
| `layer` | the architecture layers: one band per value of `--group-by`, upward edges named | the edge set and the node values | `text`, `mermaid`, `svg` |
| `sets` | the set-intersection panel over a family of sets (UpSet) | the generated value | `text`, `svg` |
| `layers` | which document contributed which path | the provenance record | `text`, `svg` |
| `ladder` | the meet ladder at one path: every contribution as a rung, in rank order | the [`why`](#aontu-why) record | `mermaid`, `dot` |
| `poset` | the subsumption order over several documents | [`subsume`](#aontu-subsume), pairwise | `mermaid`, `dot` |

The first profile listed is the kind's default; asking for another is
a refusal (`view_profile_unknown`), because there is no text form of a
node-link drawing and no Mermaid form of a matrix.

`--as svg` draws the cell-based kinds -- every kind whose text form is
a grid of character cells -- as a standalone SVG with the same
geometry: 8 units per character and 20 per line, every coordinate a
whole number, so no font is measured and both ports emit the same
bytes. The figure carries its own style block (dropped by
`--style none`, below); a host page sets the
colours through CSS variables (`--av-ink`, `--av-muted`, `--av-bg`,
`--av-rule`, `--av-rule-faint`, `--av-closure`, `--av-warn`,
`--av-alert`, `--av-bar`), and the defaults stand where it sets none.
The matrix fills a direct cell, tints a closure cell, marks an
unmirrored edge, and rules the diagonal; the layers draw each upward
edge as a dashed arrow; the panel draws its bars and dots. The
node-link kinds stay Mermaid and DOT, whose renderers lay them out.

Draw the `system.aon` model above over its `dependsOn` relation, first
as the tree, then as the matrix in partition order:

<!-- test: run -->
```sh
$ aontu view tree --relation dependsOn system.aon
web
└── billing
    └── ledger
```

<!-- test: run -->
```sh
$ aontu view matrix --relation dependsOn --order partition --closure system.aon
          1 2 3
ledger  1 \ . .
billing 2 X \ .
web     3 + X \
# above-diagonal direct cells: 0
```

A cell at (row, column) is set when the row depends on the column:
`X` a direct edge, `!` a direct edge whose declared inverse is not
written back, `+` reachable only transitively, `.` absent, `\` the
diagonal. In partition order an acyclic relation is a lower triangle,
and the footer's count of cells above the diagonal is the acyclicity
proof in the picture's own shape; a cycle survives every ordering as
an above-diagonal cell, and is reported as `cycle_block`.

The same edges as a node-link drawing, in Mermaid:

<!-- test: run -->
```sh
$ aontu view graph --relation dependsOn system.aon
flowchart LR
  n_billing["billing"]
  n_ledger["ledger"]
  n_web["web"]
  n_billing -->|"dependsOn"| n_ledger
  n_web -->|"dependsOn"| n_billing
```

- **The loss report.** Every run prints, on stderr, what the figure
  could not draw or drew differently from the model, one line per
  code with a count: `hidden_contribution` (an edge inside a `hide()`
  subtree, not drawn, because a committed figure discloses what it
  draws), `edges_in_disjunct` (a link under an unresolved disjunction,
  which is not a fact, so the figure reports it rather than
  picking an arm), `unresolved_field` (a node without a value for
  `--group-by` or `--label`), `cycle_block`, `cols_elided`, and for the
  poset
  `order_undecided`, `order_maybe_equal` and `order_intransitive`. Any
  of these makes the verdict `lossy`, which `--strict` turns into exit
  `1`. Three codes are informational and leave the verdict `rendered`:
  `edges_deduped` (a model declaring each entity at two positions
  writes each edge twice), `inverse_suppressed` (a declared mirror,
  implied by the edge drawn) and `crossings` (a property of the emitted
  order).
- **`--style <s>`** says how a figure carries the MEANING of its
  marks. Every mark has a reason the extractor established — a direct
  cell, a closure cell, an unmirrored edge, an upward edge, a repeated
  subtree — and each profile has one way to show it: SGR escapes for
  `text`, CSS classes for `svg`. `auto`, the default, picks that
  mechanism where the destination can carry it: escapes only when
  **stdout** is a terminal and `NO_COLOR` is unset (stdout, because
  that is where the figure goes — the error frames' own colour
  decision is about stderr), and an SVG keeps the
  stylesheet that makes it standalone. `none` drops both — on `svg` the
  classes stay (they are structure, not style) and only the embedded
  stylesheet goes, which is what a host page wants once it has bound
  `--av-ink` and its kin and is embedding several figures. `ansi` and
  `css` name a mechanism outright, and asking for one on a profile that
  cannot carry it is a usage error (`view_style_profile`) rather than a
  silent no-op. Escapes are never written to a file: `--out` with
  `--style ansi` is refused, and `auto` resolves to no escapes there.

  Neither mechanism states a colour, and a figure still cannot name
  one: SGR 31 means the colour the reader's terminal calls red, and a
  CSS class states nothing at all. A hex triple in a figure stays refused, and so
  does `style` in a view document — a declaration says which
  projection, never how it looks.
- **`--out <file>` and `--check`.** The figure is written to the file
  instead of stdout; with `--check` nothing is written and the exit is
  `1` when the file differs from what would be drawn, which is the CI
  gate for a committed figure.
- **`--max-rows <n>`** (default 60) is a refusal, exit `2`, not a
  truncation; the message names the narrowing options.
- `doc`: the shape of the model, before any of its values mean
  anything. Every other kind here needs the document to HAVE something
  — links, contributions, peers — and draws nothing from one that does
  not; this draws what is in the document and how it is arranged, which
  is what a reader meeting a model wants first. `--at` names the
  subtree (default `$`) and `--depth <n>` how many levels of key below
  it (default 3). Map keys are in code-point order and list indices in
  order, exactly as `get --keys` lists them. A leaf carries its canon,
  cut at 32 characters — the kind of thing it is, not its value. A
  container the depth bound stops at carries the number of keys not
  drawn, and they are counted into the loss report as `depth_elided`:
  a tree that stopped without saying so would be the one thing a
  structural drawing must not be.
- **`--at <path>`** restricts the edge-derived kinds to nodes under the
  path, names the subtree `doc` draws, the provenance panel to paths under it, and names the path the
  ladder draws (required) and where the poset compares.
- `tree`: `--relation` draws one relation; without it every relation is
  drawn, each branch naming its own. `--root <path>` (repeatable) draws
  one subtree; a root that is not a node of the drawn graph is refused
  (`refer_unresolved`). Roots are derived as the nodes nothing depends
  on; a shared subtree is expanded once and marked `(*)` after; a
  closing edge is `(cycle)`; labels are the shortest path suffix unique
  in the drawing.
- `matrix`: `--relation` is required unless exactly one relation has
  edges (`view_relation_ambiguous` otherwise); `--order canon`
  (label order, the default) or `partition`; `--closure` marks the
  transitively reachable cells. Ten or more rows stack the index
  digits in the header.
- `graph`: `--relation` (repeatable) keeps only those predicates; a
  declared inverse's mirror is suppressed and counted. `--group-by
  <field>` puts each node in a subgraph named by that field's value
  (ids `g0`, `g1`, ... in label order); `--label <field>` labels the
  node with it, a number or boolean as its canon. Node ids encode the
  label injectively: `n_` + the name when it is an ASCII identifier,
  else `nq_` + the name with every other code point as `_` and its
  hex (`cust-1` is `nq_cust_2d1`, so a name such as `end` or `graph`
  can never collide with a keyword). Text is escaped per code point:
  Mermaid as numeric entities (`#34;` for `"`, `#124;` for `|`), DOT
  as `\"` and `\\`. A label holding a line terminator is refused
  (`view_line_break`). `--as er` draws Mermaid's `erDiagram`, every
  relationship many-to-many because the model states no cardinality.
- `layer`: `--group-by <field>` (required, `view_group_required`)
  names each node's layer; bands are stacked in the partition order of
  the layer-level graph, reversed, so the layer nothing depends on is
  on top. `--layers a,b,c` fixes the order (top first) for a model
  whose upward edge makes the layer graph cyclic. The footer counts
  the relation's downward, sideways and upward edges, and names each
  edge `--edges` shows. `--edges upward|all|none` chooses which of them
  the figure draws over the bands: `upward` is the violations, and the
  default for the fixed grids (`text`, `svg`), because the bands
  already say which way the rest go; `all` draws the relation itself,
  which is what a reader tracing one module's dependencies wants, and
  is `mermaid`'s default since it lays edges out itself; `none` leaves
  the bands alone. In SVG an upward edge is dashed and alert-coloured,
  a downward one runs from the bottom of its box to the top of the one
  it names, and a sideways one dips below the boxes of its band.
- `sets`: `--sets <path>` names a map whose keys are the sets,
  `--member <key>` the field holding each set's members (a list of
  strings), `--universe <path>` a map or list of every element, so
  the covered-by-nothing column exists. A member written as an address
  (`path($.perms.read)`) meets a universe map's key on that address
  and is shown by its shortest unique suffix. Columns are the exact
  membership signatures, by degree, then cardinality, then name;
  `--min-degree <n>` drops the low ones and `--max-cols <n>` elides
  the rest (`cols_elided`). Both need the document to generate.
- `layers`: the same panel over the provenance record, sets being the
  documents and elements the paths each document wrote into. Files are
  shown relative to the entry document; `--min-size <n>` drops the
  small intersections.
- `ladder`: the `why` record at `--at`, one rung per contribution,
  sorted by rank descending (weakest first, so the winner is the last
  rung before the value), then by site.
- `poset`: several files; each pair is compared with `subsume` at
  `--at` under `--profile values|defaults|gen` (default `defaults`).
  Documents that subsume each other are one node, labelled `a = b`; an
  edge is a cover of the transitive closure, upward toward the more
  general document; an undecided pair with no proven order is a dashed
  edge labelled with the `sub_*` reason. Labels are the file names
  without `.aon`.
- Exit codes: `0` rendered or lossy, `1` a `--check` mismatch or lossy
  under `--strict`, `2` usage (an unknown kind or profile, a missing
  required option, `--max-rows` exceeded), `4` error (a document that
  does not stand up, a relation, root or path that names nothing). A
  document with nothing to draw renders an empty figure and exits `0`.
  In text form the figure is all that stdout carries, so a redirect is
  a golden file; `--format json` wraps the whole report as
  `{kind, verdict, text, loss}` under the usual `aontu` envelope, and
  a refusal carries `errors` in place of `text`.
- The library form is `view(src, options)` in TypeScript (`viewTree`
  remains for the tree) and `Aontu.View(src, options)` in Go, returning
  the identical `{verdict, kind, text?, loss, errors?}` record; the
  poset's further documents ride `options.docs` as `{src, path?, name?}`.

**The view document.** A projection that runs in CI belongs in a file.
`--views <path>` names a map, in an ordinary document that includes the
model, whose values declare figures: one evaluation, N figures, one exit
code. The keys of a declaration are the view options — the flags without
the dashes — and every declaration names its `kind` and the `out` file
it draws into. `views` is the author's key; nothing in the engine knows
the name, which is why the path is given. Write a `views.aon` beside the
`system.aon` above:

<!-- test: file views.aon -->
```aon
@"./system.aon"

views: {
  arch: {
    kind: matrix
    relation: dependsOn
    order: partition
    closure: true
    out: "arch.dsm.txt"
  }
  map: {
    kind: graph
    relation: dependsOn
    groupBy: owner
    as: mermaid
    out: "arch.mmd"
  }
}
```

<!-- test: run -->
```sh
$ aontu view --views '$.views' views.aon
$ aontu view --views '$.views' --check views.aon
$ echo $?
0
```

Each `out` is resolved against the **view document's own directory**,
so the gate passes from any working directory. Nothing is written
unless every figure rendered — N figures of one model are only
meaningful together, so a set whose third figure refuses leaves the
first two off disk, and its exit code is the worst of the figures'.
`--check` compares the whole set and names every difference; `--strict`
turns any figure's loss into exit `1`. A declaration that names an
option that is not one, gives a value of the wrong shape, or leaves out
`kind` or `out` is `view_document_shape`, reported for every faulty
declaration at once and before anything is drawn. The `poset` is
refused there: it compares several documents and a view document
declares figures of the one it includes. The library form is
`viewSet(src, options)` in TypeScript and `Aontu.ViewSet(src, options)`
in Go, returning `{verdict, views, errors?}` where each view is
`{name, kind, out, verdict, text?, loss, errors?}` — the caller writes
the files.

`@"std/view"` is the bundled schema for a declaration, so the same
mistakes are refused when the document is EVALUATED rather than when
the verb reads it. Write a `views-typed.aon`:

<!-- test: file views-typed.aon -->
```aon
@"std/view"
@"./system.aon"

views: {&: $.view.Figure} & {
  arch: {
    kind: matrix
    relation: dependsOn
    order: partition
    closure: true
    out: "arch.dsm.txt"
  }
}
```

<!-- test: run -->
```sh
$ aontu view --views '$.views' --check views-typed.aon
$ echo $?
0
```

`$.view.Figure` types every option, and a kind that is not a kind, an
order that is not an order or a count below zero is an ordinary
unification failure naming `std/view` as the other operand. It is
optional: a view document that does not include it is read exactly the
same way, and refused by `view_document_shape` instead. The
The source is served from the engine, as `std/system` is, so it needs
no filesystem and resolves under every include capability but
`'none'`.

The use cases pin one figure of each kind as a golden:
[01-service-catalog](../use-cases/01-service-catalog/) the graph and
the matrix, [04-schema-evolution](../use-cases/04-schema-evolution/)
the poset, [08-feature-flags](../use-cases/08-feature-flags/) the
ladder, [12-relations](../use-cases/12-relations/) the graph and the
ER diagram, and [16-module-deps](../use-cases/16-module-deps/) the
tree, the matrix and the layers; 16 also declares all seven of its
figures in a `views.aon` that its `check.sh` gates in one run.

### `aontu jsonschema`

Export a document as a **JSON Schema** (draft 2020-12), and say what
could not be carried.

```
aontu jsonschema [--at <path>] [--strict] [--format text|json] <file>
```

This is the interop bridge. Every major LLM provider's
structured-output API constrains generation to JSON Schema and to
nothing else, so the shape an enterprise actually deploys is: export
the model, let the provider generate under it, then
[`vet`](#aontu-vet) the result against the model itself — the schema
narrows what is *produced*, the model decides what is *true*. An MCP
tool's `inputSchema`, which the protocol requires to be JSON Schema, is
the same export.

**The schema goes to stdout and the losses to stderr**, so
`aontu jsonschema x.aon > schema.json` writes a usable schema and still
tells the reader what it left behind. Write a `contract.aon`:

<!-- test: scenario jsonschema -->
<!-- test: file contract.aon -->
```aontu
spec: {
  name: string & re("^[a-z][a-z0-9-]{2,39}$")
  tier: *internal | standard | critical
}
```

<!-- test: run -->
```sh
$ aontu jsonschema --at spec contract.aon
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "properties": {
    "name": {
      "pattern": "^[a-z][a-z0-9-]{2,39}$",
      "type": "string"
    },
    "tier": {
      "default": "internal",
      "enum": [
        "internal",
        "standard",
        "critical"
      ]
    }
  },
  "required": [
    "name",
    "tier"
  ],
  "type": "object"
}
```

- It exports the **unified** value, not the parse: what a document
  MEANS is what a consumer should be constrained to.
- `--at <path>` names the subtree to export — the same anchor
  [`vet --at`](#aontu-vet) takes, so `--at spec` means the same thing
  in both.
- `--format json` prints the whole report — `schema`, `lossy`,
  `verdict` — under the usual `aontu: {version, verb}` envelope.
- Exit codes: `0` exported, `1` lossy **under `--strict`**, `2` usage,
  `4` the document does not stand up on its own. Without `--strict` a
  lossy export is still an export and exits 0.

**What crosses exactly.** Kinds become `type`; a concrete scalar
becomes `const`; a disjunction of scalars becomes `enum`, and its
preference becomes `default`; bounds become `minimum`/`maximum`, with
the open endpoints as 2020-12's `exclusiveMinimum`/`exclusiveMaximum`;
`re` becomes `pattern` (Aontu's portable subset is a subset of
ECMA-262, which is what JSON Schema reads, so no translation happens);
`neq` becomes `not: {enum: …}`; `length` becomes
`minLength`/`maxLength` on a string and `minItems`/`maxItems`
otherwise; `unique()` becomes `uniqueItems`; an optional key is simply
absent from `required`. A spread is `additionalProperties: <template>`,
which is what a spread means. A written list is a **tuple**, so
`prefixItems` plus `items: false`.

**And `close()` is `additionalProperties: false`** — the one thing the
two languages say identically, and the reason the export is worth
having at all: the closedness an agent's output must respect crosses
without loss.

**What does not cross is REPORTED, never dropped in silence.** A
converter that quietly lost a constraint would hand its caller a schema
that admits *more* than the model does, which is the failure this
language exists to refuse. So each loss carries its path, the Aontu
construct's own name, and one sentence saying what the schema says
instead:

```
lossy: $.spec.total must: an evaluate-only check is opaque by
  construction … so it is DROPPED and the schema admits values `vet`
  refuses
```

The losses, and why each is one:

| Construct | Why JSON Schema cannot say it |
|---|---|
| `must(c, m)` | Band B is opaque by construction — it carries the author's own message and the algebra never reasons about it |
| `unique(k)` | there is no uniqueness-by-property keyword; `uniqueItems` compares whole items |
| `biginteger`, `bigdecimal`, and exact literals | JSON has one number type and it is binary64, so the exactness these leaves exist for has no receiver |
| `hide(x)` | a hidden entry is not generated, so it is not part of the value a consumer produces |
| `&:` on a closed map | the template constrains keys that cannot exist |
| a `length` with no domain | no keyword counts a string *or* a container, so it is exported as `minItems`/`maxItems` |
| residue — an unresolved reference, a waiting call | not a property constraint at all; guessing one would be inventing a promise |

The exact-leaf loss is the one with a way around it. Money carried as a
**decimal string** with a conversion mark exports without loss — the
pattern and the mark both cross — and stays exact on the Aontu side:
see [Carry exact money over JSON](how-to/carry-exact-money-over-json.md).

**A recursive position is residue, and exports as residue.** JSON
Schema can spell recursion (`$defs` plus `$ref`), but this exporter
does not mint it: a
[recursive reference](reference-language.md#recursive-references-fixpoints)
that has met no data is unresolved, so it crosses as the empty schema
`{}` — a position that admits *anything* — and is reported under
`lossy` as `unresolved`, like any other residue. Two consequences
follow. Anchor the export at a definition kept **un-hidden**, because
a `hide()` mark propagates and a hidden entry is omitted from the
export entirely; and treat the exported schema as wider than the
model at the recursive position — [`vet`](#aontu-vet) the produced
value against the model, which does check every depth. `--strict`
turns the loss into exit 1. Write a recursive `steps.aon`:

<!-- test: file steps.aon -->
```aontu
Step: {
  approver: string & re("^[a-z]+@acme[.]example$")
  then?: $.Step
}
```

<!-- test: run -->
```sh
$ aontu jsonschema --strict --at Step steps.aon
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "properties": {
    "approver": {
      "pattern": "^[a-z]+@acme[.]example$",
      "type": "string"
    },
    "then": {}
  },
  "required": [
    "approver"
  ],
  "type": "object"
}
lossy: $.Step.then unresolved: this is not a value yet, so there is nothing to constrain a consumer to; the schema admits anything here
$ echo $?
1
```

Everything above `then` crosses intact; the tail is the honest gap.
Without `--strict` the same export exits 0.

- The library form is `jsonSchema(src, options?)` in TypeScript and
  `Aontu.JSONSchema(src, at)` in Go, returning the identical
  `{verdict, schema, lossy}` record (plus `errors` on a failed run).

### `aontu get`

Select one node of an evaluated document by path and render it — the
task-sized slice, instead of the whole file as one JSON blob.

```
aontu get <path> [-c|--canon] [--keys] [--types] [--depth <n>]
          [--format text|json] <file.aon>
```

- **Evaluation is global.** Unification has no partial mode: the whole
  document is evaluated and then one node is selected. What `get` buys
  is the size of the *answer*, not the cost of producing it.
- The path is what a reference means by `$.a.b` — map keys and
  canonical-decimal list indices, and nothing else, so `$.a.01` names
  nothing here exactly as it names nothing there. A key that *contains*
  a dot is likewise unreachable, as it is to a reference.
- Default output is the fragment's generated JSON; `--canon` is its
  canonical form, and for the root path that is byte-identical to
  `aontu --canon`.
- Exit codes: `0` rendered, `1` the path names nothing (the finding
  carries a nearest-key suggestion), `2` usage, `4` the document does
  not stand up on its own — including a node that is not concrete, for
  which there is no JSON to print.

Write an `app.aon` whose spread template supplies defaults:

<!-- test: scenario query -->
<!-- test: file app.aon -->
```aontu
services: {
  &: {replicas: *1 | integer, port: *8080 | integer}
  auth: {replicas: 3}
  billing: {}
}
```

<!-- test: run -->
```sh
$ aontu get $.services.auth app.aon
{
  "port": 8080,
  "replicas": 3
}
$ aontu get --keys $.services app.aon
auth
billing
$ aontu get $.services.auht app.aon
$.services.auht: no_path [reference]
  The path $.services.auht names nothing in this document.
  note: did you mean auth?
$ echo $?
1
```

The mistyped path is exit 1 with a suggestion, not an empty render: a
missing key and an empty value are different answers.

**The projections are lattice abstractions.** Each view is a valid
Aontu document that *subsumes the truth* — generalisation, never
distortion:

| flag | view |
|------|------|
| `--types` | every concrete leaf lifted to its own kind: `{"replicas":3}` becomes `{"replicas":integer}` |
| `--depth n` | structure to depth n; every elided subtree renders as `top` — "no further information at this tier" |
| `--keys` | the node's own key names (or list indices), one per line |

On `app.aon` the shape view erases the concrete leaves:

<!-- test: run -->
```sh
$ aontu get --types $.services.auth app.aon
{"port":*integer|integer,"replicas":integer}
```

That claim is checked rather than asserted: every projection row of
`test/spec/query.tsv` runs
[`subsume`](#aontu-subsume)`(view, truth)` in both implementations and
requires `subsumes`. It runs under the **values** profile, deliberately
— a shape view *erases defaults* (`*8080|integer` becomes
`*integer|integer`, as above), which the `defaults` profile would
rightly call a compatibility break. The claim projections make is
about the values admitted, not about which one is generated.

Kinds are lifted through the lattice's own `superior()`, so the view
follows the type system rather than a table of the renderer's opinions;
a value that is *already* an abstraction (a kind marker, a constraint,
an unresolved reference) is left alone rather than generalised twice.
Projections are not canonical form and are never fed to
[`aontu hash`](#aontu-hash) — the flags are distinct from `--canon` to
keep that unambiguous.

### `aontu why`

Provenance: what *contributed* to the value at a path, in order, with
the site each contribution was written at. The positive twin of
[`vet`](#aontu-vet)'s report — errors explain what failed to unify,
`why` explains what did.

```
aontu why <path> [--format text|json] <file.aon>
```

Ask it about the `app.aon` above:

<!-- test: run -->
```sh
$ aontu why $.services.auth.replicas app.aon
$.services.auth.replicas = 3
  1. *1|integer  app.aon:2:17  (spread)
  2. 3  app.aon:3:20
```

- A **contribution** is a value the author *wrote* that met something
  at this path. Values the engine mints on the way — a kind lifted
  from a leaf while a disjunction trials its members, a fold's
  intermediate — are not contributions, and neither are the members
  *inside* one written value, which meet at the same path as that
  value resolves. A **conjunct** is the exception in the other
  direction: `a & b`, or the merge of two duplicate keys, is the
  statement that several separately-written values must all hold, so
  it expands into one contribution each.
- **Roles**: `literal`, `spread` (a template applied to this key),
  `ref` (the reference itself, whose canon names its target) and
  `pref`. A preference *inside* a spread template reports as `spread`,
  which is the thing the author needs to be told.
- Contributions are listed in **source order** — file, then row, then
  column — not in the order the fixpoint happened to meet them, which
  is an engine detail.
- **Provenance travels with a clone.** A value that reached this path
  by being copied from somewhere else — a spread template applied per
  key, a `pack()` generator's child, a `$ref`, a `refer(t)` flow — is
  reported as the value the author wrote, at the line
  they wrote it on. That is the whole audit question: *which file set
  this?* A clone of a written value is that written value somewhere
  else, so it is named; a value the engine mints on the way is not.
- **The value that stands at a path is a contribution when nothing met
  there.** A generator places a value without meeting anything, and a
  path with no meets still has a source.
- A value the author never wrote and no template supplied has **no
  contributions**, and says so. That is a fact about the document, not
  a failure.
- `--format json` emits the record: `{path, value, conjuncts:
  [{canon, role, site}]}`, with sites in the same shape the vet report
  uses. Exit codes mirror `get`'s: `0` explained, `1` the path names
  nothing, `2` usage, `4` the document does not stand up.
- **Cost**: the recorder rides the context and is off by default —
  uninstrumented evaluation pays one property load per meet. An
  instrumented run pays site materialisation, one map entry per path
  met, and the spread walk that marks a template's application.

### `aontu set`

Change a document by **appending to an overlay** — or, with
`--in-place`, by rewriting the literal inside that same overlay.
`--overlay` is required either way, and the entry document is never
written.

```
aontu set <path>=<value>... --entry <file> --overlay <file>
         [--in-place] [--dry-run] [--format text|json]
```

Write an `entry.aon` that constrains `owner` and pins `replicas`:

<!-- test: scenario set -->
<!-- test: file entry.aon -->
```aontu
services: {
  auth: {owner: string, replicas: 3}
}
```

<!-- test: run -->
```sh
$ aontu set '$.services.auth.owner="identity-2"' --entry entry.aon --overlay changes.aon
verdict: valid
wrote: changes.aon
```

A pinned value refuses the append and the overlay is left unchanged:

<!-- test: run -->
```sh
$ aontu set '$.services.auth.replicas=5' --entry entry.aon --overlay changes.aon
verdict: invalid

$.services.auth.replicas: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.services.auth.replicas
  data: changes.aon:2:33 (5)
  schema: entry.aon:2:35 (3)
$ echo $?
1
```

A literal the overlay itself pinned is `--in-place`'s case — the span
is rewritten where it was written, and the report says so as source
text:

<!-- test: run -->
```sh
$ aontu set '$.services.auth.owner="identity-3"' --entry entry.aon --overlay changes.aon --in-place
verdict: valid
replaced: changes.aon:1:30 "identity-2" -> "identity-3"
wrote: changes.aon
```

- The assignment becomes a **path-flattened conjunct** — `$.a.b=1`
  is appended as `"a": "b": 1`, keys quoted so a segment may be a
  word the grammar spells otherwise, a number, or hold a space. The
  text is split at the *first* `=`; everything after it is Aontu
  source, so a value may contain one.
- This needs no rewriter, and damages nothing: an overlay entry is
  just another conjunct, and unification is order-independent, so
  appending to a second file is the same value as writing into the
  first. The shared suite asserts that equivalence for every row
  rather than claiming it.
- **Appending cannot change a pinned value.** The lattice refuses `5`
  against `3`, the verdict is `invalid`, and the finding names the
  pinning site — which [`aontu why`](#aontu-why) then explains.
  `--in-place` closes that loop.
- **A path reached through a reference is refused** (`patch_not_editable`).
  `n: $.base` against `base: 7` is pinned by `base`'s line, not by
  `n`'s: splicing there would rewrite the referent for every reader of
  it and leave the named path where it was. The assignment is appended
  instead, exactly as it would be without the flag.
- **`--in-place` rewrites the literal where the author wrote it.** The
  span at `(row, col, len)` is replaced and nothing else is touched, so
  comments and layout survive — including a comment on the edited line.
  Nothing is re-serialised, which is why no CST is needed: a targeted
  splice never reads the bytes it does not replace.
- **The span is verified before a byte is written.** A site carries
  `src`, the source text it claims to cover, and the text at the span
  must equal it. That is what makes `port: 0x1F` safe to rewrite even
  though its value is `31` — the span is four code units and says so.
- **An overlay that loads another document is refused outright.** A
  literal reached through `@"..."` cannot be told apart from the
  overlay's own by position — an include holding `a: 42` at 1:4 and an
  overlay holding `x: 42` at 1:4 give the same site and the same text —
  so the evaluation that decides what to edit denies loads, and what
  resolves is what the overlay says by itself.
- **It rewrites only a single editable literal, and appends otherwise.**
  The contribution must be one `literal`-role conjunct in *this*
  overlay whose `src`, parsed alone, means the contribution's own canon
  — which refuses a compound, because a site names a compound's
  *opening token* (`min` for `min(1)`, `1` for `1+2`, `{` for a map).
  It must also be concrete: `a: integer` is a constraint, not a pin,
  and appending narrows it without discarding what it says. Anything
  else appends exactly as plain `set` would, plus one **warning**
  naming the case — `patch_not_editable`, `patch_ambiguous` or
  `patch_span_mismatch`. Warnings never move a verdict, so `--in-place`
  cannot turn a run that would have held into one that does not.
- A default (`a: *1`) is left alone with no warning: appending already
  overrides a default correctly.
- **The text form says `would replace:` when nothing was written**, and
  `replaced:` only when the file changed: a run can have one replaceable
  assignment and another that refuses it as a whole. A run that HOLDS
  writes its status to stdout whether or not it carries warnings; the
  warnings go to stderr beside it.
- The report gains `replaced`, one entry per rewrite, carrying the path,
  the site, and `from`/`to` as **source text** — replacing `0x1F` with
  `31` is a different edit from replacing it with `0x1F`, and only the
  spelling says which.
- **The overlay is written only when the change holds.** An `invalid`
  or `error` verdict leaves the file exactly as it was: a change the
  author still has to think about should not sit in their
  configuration while they do. `--dry-run` writes nothing either way
  and prints what would have been written.
- A missing overlay file is the empty overlay, and is created.
- Exit codes are [`vet`](#aontu-vet)'s verdict classes: `0` valid,
  `1` invalid, `2` usage, `3` incomplete, `4` the entry does not stand
  up on its own.

### `aontu agentsmd`

Generate the AGENTS.md stanza for a definition — the prose entrypoint,
derived from the formal source so it cannot drift from it.

```
aontu agentsmd [--write <AGENTS.md>] <file.aon>
```

The stanza names the document, its [canon-hash](#aontu-hash) pin, its
root keys and its shape, and spells the `get` / `why` / `vet` / `set`
commands with a path that actually exists in it. `--write` splices it
into a file between `<!-- aontu:begin -->` and `<!-- aontu:end -->`,
appending the markers when they are absent — everything outside them
is left exactly as it was, so the verb is safe to re-run and safe to
point at a file someone else writes prose in.

Exit codes: `0` generated, `2` usage, `4` the document does not stand
up on its own.

### `aontu hash`

The canon-hash: one string that pins what a document *means*, so a
lockfile, a registry or an agent can say "this module, this meaning"
and have the claim survive reformatting.

```
aontu hash [--form] [--format text|json] <file.aon>
```

- The hash is
  `"aon1-" + base64url(SHA-256(UTF-8(hcanon(unify(file)))))`, where
  `hcanon` is the **hash form** — see below. `aon1-` is a scheme id, so
  a future semantically-stronger normal form is an upgrade rather than
  a breakage.
- The document is evaluated **standalone**: its own `@"file"` closure
  resolved and unified at its own root, before any consumer context.
  That is what makes the pin transitive — an edit two includes deep
  changes the unified root, hence the hash.
- **The pin survives** comments, whitespace, formatting, key
  reordering, and splitting one file into several includes — any
  refactor that leaves the unified value identical. **It breaks on**
  any semantic change in the transitive closure: a default flipped, a
  field added, a map closed, a constraint tightened.
- `--form` prints the hashed TEXT instead of the digest, which is what
  to diff when a pin moves. `--format json` prints both under
  `hash` and `form`.
- Exit codes: `0` hashed, `2` usage, `4` the document does not
  evaluate on its own — a broken document has no meaning to pin, and a
  hash of the wreck would agree with every other wreck.

To see the pin hold still, write `svc.aon`:

<!-- test: scenario hash -->
<!-- test: file svc.aon -->
```aontu
service: {
  name: "checkout"
  port: *8080 | integer
}
```

and `svc-reformat.aon`, the same meaning re-ordered under a comment:

<!-- test: file svc-reformat.aon -->
```aontu
# the same meaning, reordered and commented
service: port: *8080 | integer
service: name: "checkout"
```

<!-- test: run -->
```sh
$ aontu hash svc.aon
aon1-nSY9noXFhWc_dtcRrErhCS9bZVtNfTJb0vVoCE9W1CM
$ aontu hash svc-reformat.aon
aon1-nSY9noXFhWc_dtcRrErhCS9bZVtNfTJb0vVoCE9W1CM
$ aontu hash --form svc.aon
{"service":{"name":"checkout","port":*8080|integer}}
```

Two spellings, one meaning, one pin — and `--form` prints the exact
text the digest is taken over.

**The hash form (`hcanon`)**

Exactly the unify-level [canon](#val-typescript) with the two
additions that close its semantic gaps:

| | canon | hash form |
|---|---|---|
| a closed map or list | `{"a":1}` | `close({"a":1})` |
| a `type`- or `hide`-marked value | `1` | `type(1)`, `hide(1)` |

Both reuse existing parseable syntax, so the hash form is itself valid
Aontu source and round-trips —
`hcanon(unify(parse(hcanon(v)))) == hcanon(v)` is asserted for every
row of `test/spec/hcanon.tsv`, in both implementations. Marks
propagate to every descendant at unification, so a wrapper is emitted
only where a mark *starts*. User-facing `canon` is unchanged.

This is a *canonical-text* hash, not a hash of semantic equivalence
classes: canon is deterministic syntax, not a unique normal form, so
`number|integer` and `number` denote the same value set and hash
differently. The failure direction is the safe one — a false "changed"
forces a needless re-review, while a false "unchanged" is impossible
provided the hash form is semantically complete, which is exactly why
the `close`/mark additions are part of the definition rather than an
optimisation.

### `aontu mod`

Module tooling: the commands that maintain a project's dependency
closure and describe what a publish would push. All are **local** —
they read and write the project, the vendor directory and the user
cache, and never reach the network.

```
aontu mod tidy     [--format text|json] [dir]
aontu mod verify   [--format text|json] [dir]
aontu mod vendor   [--format text|json] [dir]
aontu mod manifest [--against <dir>] [--format text|json] [dir]
```

`dir` is the project root — the directory holding `mod.aon` — and
defaults to the working directory.

**`tidy`** walks the dependency closure and rewrites `mod-lock.aon`.

- Dependencies are read from each module's own `mod.aon`, under a
  `dep` map keyed by module path, each entry declaring a version `v`:

  ```
  dep: { "corp.example/schemas/service@1": { v: "1.4.2" } }
  ```
- Selection is **minimum version selection**: each module is taken at
  the *highest of the minima* anyone in the closure asked for, never
  higher. Nothing is upgraded by the act of resolving, so a tidy is
  reproducible and adding a dependency cannot silently move an
  unrelated one.
- The closure is walked breadth-first and terminates without a cycle
  check, because a module's selected version only ever rises.
- Each entry's `canon` pin is **recomputed** from the module in the
  store, by unifying its entry file standalone and hashing it (see
  [`aontu hash`](#aontu-hash)). It is never carried over from the old
  lockfile, which would pin what the module *used* to mean. The `oci`
  digest *is* carried over: it is the registry's word about the bytes
  it served, and nothing local can hear it.
- The lockfile is written in canonical form under a generated-file
  header, so it is one diffable line and every reader strips `#`
  comments before parsing it:

  ```
  # mod-lock.aon (generated by `aontu mod tidy`; do not edit)
  {"lock":{"corp.example/schemas/service@1":{"canon":"aon1-oQs6…","oci":"","v":"1.4.2"}}}
  ```

- A module the stores do not hold is reported as missing and **the
  lockfile is not written at all**. A partial lock is worse than none:
  it would claim a closure that was never resolved.
- A module the stores *do* hold but which **does not evaluate on its
  own** is refused the same way (`verdict: error`, exit 4, no lockfile
  written), and named separately because the repair is different — a
  fetch cannot help it. This is the same refusal
  [`aontu hash`](#aontu-hash) gives for the same file, and for the same
  reason: a module that does not stand up has no meaning to pin, and
  every one of them hashes to the *same* string. A lockfile written
  from that hash looks exactly like a real pin and carries nothing.

**`verify`** asks whether every locked module still **means** what the
lockfile pins, and **changes nothing**. It is the CI gate.

`tidy` cannot be that gate. It recomputes and rewrites by design — a
pin is what a module means *now* — so a job that tidies before
evaluating makes the lockfile agree with whatever the store holds,
tampering included, and then passes. Verification is a question;
answering it must not be an edit.

```
$ aontu mod verify
verdict: mismatch
corp.example/schemas/service@1: pinned aon1-WXj9… but the store means aon1-pT2F…
```

- Verdicts: `ok` the lockfile covers the project and every locked
  module still means what it pins; `mismatch` at least one store no
  longer means what is pinned; `unlocked` the lockfile does not name a
  dependency the project declares; `missing` at least one locked module
  is in no store. Exit codes: `0`, and `1` for each of the three
  refusals, `2` for usage — a mismatch is a refused gate, the same class
  a breaking check uses.
- Both hashes are reported, because the useful question is which way it
  moved. A module that no longer stands up at all says so rather than
  reporting the hash of `nil` as though it were a meaning.
- **Nothing to check is not a pass.** A project with no lockfile at
  all, or one whose lockfile predates a dependency someone added, would
  otherwise verify clean over an empty set — the same shape as the
  defect the verb exists to close. The repair is a `tidy`, not a fetch,
  and the line says so. Transitive dependencies need no separate check:
  a locked module's own imports are resolved when its pin is
  recomputed, so one that is unreachable makes its *dependant* fail to
  evaluate and is reported as a mismatch.

**`vendor`** copies every locked module out of the stores into
`aon_vendor/`, as a whole source tree — that is what an OCI layer
holds, and a module is more than its entry file. A module already
resolving from `aon_vendor/` is left alone rather than copied onto
itself. Anything the stores do not hold is reported as missing.

Because the user cache is keyed by canon-hash, `vendor` can only find
what the lockfile already pins: a cold start with no lockfile has
nothing to search the cache *by*. `tidy` first, then `vendor`.

**The vendor layout** is `aon_vendor/<module-path>@<major>/`, beside
the project's `mod.aon`: each `/`-segment of the module path becomes a
directory, and the final segment carries the `@<major>` suffix — so
`corp.example/schemas/service@1` lives at
`aon_vendor/corp.example/schemas/service@1/` (`moduleDir`,
`ts/src/mod.ts`; the Go port mirrors it). The directory holds the
module's whole source tree — its own `mod.aon` (declaring `path`,
`version` and `main`) and its entry file — exactly what an OCI layer
would carry:

```
myproject/
  mod.aon                  # path, and the deps this project asks for
  mod-lock.aon             # generated by tidy; the resolved closure
  main.aon
  aon_vendor/
    corp.example/
      schemas/
        service@1/         # one module
          mod.aon          # path, version, main
          service.aon
        common@1/          # its dependency, FLAT beside it
          mod.aon
          common.aon
```

**The tree is FLAT, and a module's own dependencies are resolved
against it.** A vendored module carries its own `mod.aon`, so it is a
project inside a project — and its imports are resolved from its own
directory first and then from every project enclosing it, which is
where `vendor` put its dependencies. A module that ships its own
`aon_vendor/` still wins for its own tree; one that does not falls
through to the consumer that vendored it. So the flat tree `vendor`
writes is the tree a nested import reads, and nesting a second
`aon_vendor/` inside a dependency is unnecessary — which matters,
because `manifest` excludes `aon_vendor/` from the published layer, so
a nested store could never have travelled through a publish.

With `mod get` absent, hand-creating this layout is the supported cold
start: vendor the tree by hand, run `tidy` to lock its canon-hash, and
every later evaluation verifies the vendored content against that pin
(see the [hand-vendoring how-to](how-to/vendor-by-hand.md)).

- `--format json` prints every report as an object with the usual
  `aontu: {version, verb}` envelope, a `verdict`, and `missing`.
  `tidy` adds `lock` and `unevaluable`; `verify` adds `verified` and
  `mismatched` (each `{mod, want, got}`) and `unlocked`; `vendor` adds
  `vendored`.
- Exit codes for `vendor`: `0` resolved, `1` something was missing, `2`
  usage.

**`manifest`** prints the OCI artifact a publish would push, and gates
it on the breaking check.

- A module publishes itself, so its own `mod.aon` declares a version
  as well as a path and an entry:

  ```
  mod: { path: "corp.example/schemas/service", version: "1.4.2",
         main: "service.aon" }
  ```

  The **major an import spells lives inside that version** — `1.4.2` is
  published as `corp.example/schemas/service@1`. A module declaring no
  version, or one whose entry file is absent, has nothing to mint: that
  is an `error` verdict, not a missing fetch.
- The artifact: config media type
  `application/vnd.aontu.module.v1+json`, one layer holding the module
  source tree, and four annotations —
  `org.opencontainers.image.title` and `.version` for the path and
  version, and `com.github.rjrodger.aontu.canon` and `.major` for the
  two facts OCI has no predefined key for.
- The layer is the source tree, relative and forward-slashed so two
  implementations on two platforms describe the same layer.
  `aon_vendor/` is excluded: a published module carries its own
  sources, not a copy of everyone else's.
- **`--against <dir>` is the publish-time breaking gate.** It names a
  prior version's module tree, and runs
  [`breaking`](#aontu-breaking)'s backward check between the two: every
  instance the old version admitted must still be admitted. The
  verdict, the findings and the exit class are that check's, unchanged
  — this is wiring at the boundary where versions are minted, not a
  second definition of "breaking".
- **A major bump is where breaking is allowed.** When the prior
  version's major differs from this one's, the gate does not apply: the
  major lives in the module path, so a consumer of `@1` never sees `@2`
  unless it asks, and checking across majors would forbid the one
  change the version scheme exists to express.
- Exit codes: `0` may be published, `1` breaking, `2` usage, `3`
  undecided, `4` nothing to mint — [`subsume`](#aontu-subsume)'s
  classes, because the gate is a subsumption check.

**"Has the truth changed?" is one annotation read and a string
compare** — no download, no parse. The canon-hash in the annotation is
the same string `tidy` locks and [`aontu hash`](#aontu-hash) prints, so
a consumer holding `aon1-oQs6…` can ask a registry index whether the
module still means what it meant. A reformat, a comment or a file split
will not move it.

**`get` and `publish` need a registry client, which this build does
not ship.** They are the network half of the module tooling. The CLI
names them anyway and says which half is missing, because a reader
will type them and deserves a better answer than "unknown subcommand":

```
$ aontu mod get
aontu: mod get needs a registry client, which this build does not ship;
vendor the module by hand and run 'aontu mod tidy'
```

**REPL commands**

| Command | Effect |
|---------|--------|
| `:help` | show help |
| `:load <file>` | evaluate a document and hold it for the commands below |
| `:get [path]` | what the held document says at a path |
| `:keys [path]` | the keys at a path of the held document |
| `:why <path>` | every contribution to the value at a path |
| `:canon` | switch to canonical-form output |
| `:json` | switch to JSON output |
| `:quit`, `:exit` | leave (or press Ctrl-D) |

`:load` holds the document's **source**, not its evaluated tree —
parsed trees are single-use — so every later question re-evaluates
from the text. `:get` and `:keys` are the [query](#aontu-get) surface
and `:why` is the [provenance](#aontu-why) surface, answering about
the held document.

**`--jsonl` makes the session machine-drivable**: no banner, no
prompt, and every command answers as one JSON line
(`{"ok":true,"out":"…"}`), so a harness can drive the REPL the way it
drives the CLI. Human-readable output stays the default.

```
$ aontu
Aontu v0.55.0 REPL — :help for commands, :quit to exit
aontu> port: *8080 | integer
{
  "port": 8080
}
aontu> :canon
canon output
aontu> a:1|2|3
{"a":1|2|3}
aontu> :quit
```

### The MCP server

```
aontu-mcp [--root <dir>]
```

A Model Context Protocol server over stdio (newline-delimited
JSON-RPC 2.0), shipped as a second binary of the npm package. It
follows the language server's three-layer split
([docs/lsp.md](lsp.md)): the tools and the protocol are a
transport-free library (`ts/src/mcp.ts`), the binary is stdio and
nothing else.

| Tool | Answers |
|------|---------|
| `vet` | the [vet](#aontu-vet) report for a schema and a data document |
| `get` | the [query](#aontu-get) surface: a path, and a view of it |
| `why` | the [provenance](#aontu-why) record for a path |
| `diff` | what changed at which paths between two documents |
| `canon` | a document's canonical form |
| `summary` | the pin, the root keys and the top-tier shape — the first tier of progressive disclosure, expanded by calling `get` |
| `subsume` | the [subsume](#aontu-subsume) report: does the general document admit every instance the specific one admits? |
| `breaking` | the [breaking](#aontu-breaking) verdict (`compatible` \| `breaking` \| `undecided` \| `error`) plus the mode checked — the `mode` argument, else the document's own `$.aontu_policy.compat`, else `backward` |
| `set` | the [set](#aontu-set) report **plus the new overlay text**: assignments arrive as `{path, value}` pairs (with optional `inPlace`), and the server never writes files — the caller owns the write |
| `relations` | the [relations](#aontu-relations) report: acyclicity and inverse consistency over the entity edge set |
| `hash` | the [canon-hash](#aontu-hash) pin `{hash}` (plus the hash-form text when `form: true`) |
| `trim` | the [trim --check](#aontu-trim) report: redundant entries as paths |
| `reaches` | the [reachability check](#aontu-reaches): the verdict and, when it reaches, a shortest path — the closure question `relations` cannot ask one edge at a time |
| `view` | a [figure](#aontu-view) of the document as text: the tree, matrix, graph (mermaid, dot, er), layer, sets, layers or ladder kind, with the loss report; the poset takes several files and is CLI only |
| `jsonschema` | the [JSON Schema export](#aontu-jsonschema): the schema, and the `lossy` list naming what it could not say — the bridge to a structured-output API, and to an MCP tool's own `inputSchema` |

Every tool returns **the same JSON contract the CLI prints**, so a
report read from one is the report read from the other. A tool that
*refuses* — an invalid document, a path that names nothing, a document
the served trust profile cannot read — answers with its own report and
`isError: false`, because the report is the answer; `isError` is
reserved for a call that could not be made at all (an unknown tool, a
malformed argument, a file argument the server cannot serve).

Served evaluation is **confined** ([the trust contract](trust.md)): the
source arrives from a caller, and `@"..."` is exactly what a server
must not run unconfined. By default every include is denied
(`{ include: 'none' }`). Started with **`--root <dir>`**, the server
takes the CLI's `--trust root:<dir>` posture instead: includes resolve
confined below the (realpath'd) root, and every tool's document
arguments gain `<name>Path` alternatives — `schemaPath`, `srcPath`,
`sourcePath`, `generalPath`, … — naming files below that root, checked
by the same realpath-then-prefix rule the include resolver applies, so
a symlink escape is an escape. Without `--root`, path arguments are
refused with `isError: true`; the `initialize` handshake's
`instructions` field says which mode the server is in, and
`tools/list` advertises the `<name>Path` properties only when they are
served. The package-resolver leg is enabled by neither posture.

The Go port ships no separate MCP server — its role is embedding the
same library calls, and `Get`, `Why`, `Diff` and `AgentsMd` are in the
Go API for that.

### The published grammar

[`grammar/aontu.gbnf`](../grammar/aontu.gbnf) and
[`grammar/aontu.lark`](../grammar/aontu.lark) publish the **emission
surface** for constrained decoding. They are conservative by
construction — they accept less than the parser does, never more — and
they deliberately exclude `@"..."` includes, because generated
documents should describe values rather than reach for files.

The grammar is not a document that drifts: `ts/test/grammar.test.ts`
reads `aontu.gbnf`, interprets it, and requires it to accept **every
canonical-form output in the shared spec suite**.

### The skill

[`docs/skill/`](skill/) holds the agent-facing sources: a trigger
stub, a one-page grammar card, a JSON-first example ladder, and the
error-code index for repair loops. Every example document in the
ladder is evaluated by `ts/test/skill.test.ts`, so a skill that
teaches something the engine no longer does fails the build.

### LSP hover provenance

The language server can append a value's **contributions** to its
hover — what met at that path, in source order, with each site — the
same record [`aontu why`](#aontu-why) prints. It is off unless an
editor asks for it:

<!-- test: skip editor initialization sample; the hover surface is pinned by ts/test/lsp.test.ts -->
```json
{ "initializationOptions": { "aontu": { "provenance": true } } }
```

Hover already re-unifies the document per request, so an editor that
asks for this pays a second, instrumented evaluation knowingly, and
one that does not pays nothing. Diagnostics are unchanged either way.

**Getting the command**

- **TypeScript:** the npm package declares a `bin` named `aontu`
  (`dist/cli.js`), so `npm install -g aontu` (or `npx aontu`) provides
  it. From a clone: `node ts/dist/cli.js …`.
- **Go:** `go install github.com/aontu-lang/aontu/go/cmd/aontu@latest`, or
  from a clone: `go run ./cmd/aontu …` (inside `go/`).

Both commands accept the same options and produce the same results.

---

## Evaluation consumes the tree

A parsed `Val` tree is **single-use**, in both implementations.
`unify`/`generate` refine the tree in place (children are written
back, junction and reference nodes advance their own state), which is
safe only because a tree is unified once and never shared. Do not
cache, reuse, or unify the same parsed `Val` — or any node reachable
from it — in two different evaluations: the second run starts from
mutated state and the result is nondeterministic. Parse again (or
clone first) for every independent evaluation. The string entry points
(`generate(src)`, `unify(src)`) parse per call and are always safe.

This is a named rule of the [trust contract](trust.md)'s determinism
clause, not a performance note: violating it produces wrong answers,
not slow ones.

## TypeScript API

Package `aontu` (canonical). Entry point `dist/aontu.js`, types
`dist/aontu.d.ts`. Requires Node ≥ 22.

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
import { Aontu } from 'aontu'          // named
import Aontu from 'aontu'              // default (same class)
```

### class `Aontu`

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
new Aontu(opts?: AontuOptions)
```

Constructs an instance and its parser (`Lang`). One instance can process
many sources.

| Method | Signature | Returns | Notes |
|--------|-----------|---------|-------|
| `parse`    | `parse(src: string, opts?, ctx?)` | `Val \| undefined` | Parses to an unresolved AST. Does not unify. |
| `unify`    | `unify(src: string \| Val, opts?, ctx?)` | `Val` | Parses (if given a string) and runs the fixpoint to a fully unified `Val`. |
| `generate` | `generate(src: string, opts?, ctx?)` | `any` | Parse → unify → emit a native JS value. **Throws `AontuError`** on conflict or an unresolved result. Serialise the result with [`exactJSON`](#exact-numbers-and-exactjson), not `JSON.stringify`. |
| `ctx`      | `ctx(cfg?: AontuContextConfig)` | `AontuContext` | Creates a context (for variables, error collection, a custom `fs`, etc.). |

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
const aontu = new Aontu()
aontu.parse('a:number')                  // Val (AST)
aontu.unify('a:1 a:number').canon        // '{"a":1}'
aontu.generate('a:1 b:$.a')              // { a: 1, b: 1 }
aontu.generate('a:1 a:2')                // throws AontuError: Cannot unify value: 2 with value: 1
```

`unify` accepts a previously parsed `Val`, so a caller that wants the
AST first need not re-parse: `const p = aontu.parse(src);
aontu.unify(p)`. But note that the parsed tree is **single-use** — see
[Evaluation consumes the tree](#evaluation-consumes-the-tree) —
so each parse feeds at most one unify/generate.

### `AontuOptions`

Passed to the constructor, to any method's `opts` argument, or merged
into a context.

| Option     | Type        | Purpose |
|------------|-------------|---------|
| `src`      | `string`    | Source text (usually passed positionally instead). |
| `path`     | `string`    | Path of the entry file (for `@"…"` relative resolution and error sites). |
| `base`     | `string`    | Base path for the resolver. |
| `resolver` | `Resolver`  | Custom source resolver for `@"…"` loading. |
| `fs`       | `typeof fs` | Filesystem implementation — e.g. a `memfs` volume for tests. |
| `collect`  | `boolean`   | Collect errors onto `result.err` instead of throwing. |
| `err`      | `any[]`     | Pre-existing array to accumulate errors into (implies `collect`). |
| `explain`  | `any[]`     | Capture a structured trace of the unification. |
| `debug` / `trace` | `boolean` | Enable parser debug / parse tracing. |
| `deps`     | `object`    | Dependency record populated by `@"…"` loads. |
| `log`      | `number`    | Parser log verbosity. |

`@"…"` resolution tries an **in-memory** resolver, then the
**filesystem**, then **package** resolution, in that order. The chain
is unconfined by default — a relative include follows any path the
process can read — so **treat opening an untrusted source as running
it**. Confinement is the **`trust` option** ([the trust
contract](trust.md)), in both implementations:

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
const aontu = new Aontu({
  trust: {
    // include capability, one of:
    //   'none'              — @"…" always denied
    //   { mem: {...} }      — a virtual file set only
    //   { root: '/models' } — real files, realpath-confined below root;
    //                         no package resolution
    //   'system'            — the full chain (today's default)
    include: { root: '/models' },
    budget: { passes: 9, depth: 1000 },  // integer engine-event counts
  },
})
```

Go mirrors it as `Aontu.Trust` (`TrustOptions`: `IncludeNone`,
`IncludeMem`, `IncludeRoot`, `Budget`). A denied resolution is the
parse-stage `include_denied` error, pinned by
`test/spec/include-trust.tsv` in both runners. Confinement is
realpath-then-prefix-check on the resolved file, so a symlink inside
the root pointing outside it is denied. Note `fs` is *not* a sandbox —
it supplies source text for parsing and error context, and the file
and package legs read through their own channels; the trust profile is
the confinement surface.

**The include manifest.** After a parse, the resolved include closure
is observable as sorted, deduplicated `{ path, capability }` entries —
`result.deps` in TypeScript, `Aontu.IncludeDeps` in Go — hermeticity's
"file set" as data (capability is `mem`, `file` or `pkg`). Content
hashing and pinning belong to [`aontu hash`](#aontu-hash) and the
module tooling, [`aontu mod`](#aontu-mod).

**The bundled vocabularies.** `@"std/system"` ([the system
vocabulary](reference-language.md#the-stdsystem-vocabulary)) and
`@"std/view"` (the schema for a [view document's](#aontu-view)
declarations) are served from the engine rather than from disk, so they
need neither the filesystem nor package resolution and resolve under
every include capability except `'none'`. They appear in the manifest
with capability `std`. A host that wants a different vocabulary supplies its own source
under its own name; the bundled one is engine-owned.

**Relation checks.** `relationCheck(src)` in TypeScript and
`Aontu.RelationCheck(src)` in Go run the
[declared-relation](reference-language.md#declared-relations) checks
over the derived edge set, returning the `{verdict, findings}` record
that [`aontu relations`](#aontu-relations) prints — that section has
the verdicts, the finding fields, and the exit codes.

**The derived graph.** After a unification, an evaluated document's
link structure is observable too: `result.graph` in TypeScript —
also available as the pure function `graphOf(val)` — and `Aontu.Graph`
in Go. It is the edge set:

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
{
  edges: [ { from: '$.services.billing', key: 'dependsOn',
             to: '$.services.auth',
             at: '$.services.billing.dependsOn.0' }, … ],
}
```

There is no entity index, because there is no second namespace to index:
a node's address is its path. One entry per checked
[link](reference-language.md#checked-links-refert):

- **`from`** is the node the link starts at — the link's own position
  with the relation key and any list indices stripped, so a link inside
  a list is an edge from the node that holds the list. `$` when the
  link sits at the top of the document.
- **`key`** is the relation. A `rel()`-minted link carries its
  predicate declared; a bare `refer()` has it inferred as the first
  real key above the link.
- **`to`** is the **resolved** address, always absolute. A relative
  address means a different node from each position it is written at,
  so an edge set whose far ends were spellings could not be traversed —
  the link's own *value* is still what the author wrote.
- **`at`** is where the link is written.

It is **deterministic**: edges are sorted by construction, and both
runners re-derive the graph on a fresh engine and require the same
bytes (`test/spec/graph.tsv`). Impact analysis, reachability and node
slices are traversals over it; their
exposure as verbs and projections is the machine-access layer's.

### `AontuContext`

A context threads variables, error state, and resolver configuration
through a run. Create one with `aontu.ctx()`.

- `ctx.vars: Record<string, Val>` — values for `$name` variables.
- `ctx.err: any[]` — collected errors (when `collect`).
- `ctx.find(path: string[]): Val | undefined` — look a value up by path.

Pass the context as the third argument:
`aontu.generate(src, undefined, ctx)`.

### `Val` (TypeScript)

The unified value. Useful members:

| Member | Description |
|--------|-------------|
| `canon: string` | Reparseable canonical form (see [language reference](reference-language.md#canonical-form)). |
| `gen(ctx): any` | Emit the native value (used by `generate`). |
| `err: any[]`    | Errors attached to this value (`NilVal`s). |
| `isVal: boolean` and `isMap`/`isList`/`isScalar`/`isNil`/… | Type discriminators. |
| `path: string[]` | Path from the root. |

`Val` is an abstract base; concrete subclasses (`MapVal`, `ListVal`,
`IntegerVal`, `NumberVal`, `BigIntegerVal`, `BigDecimalVal`,
`StringVal`, `BooleanVal`, `NullVal`, `ScalarKindVal`, `ConjunctVal`,
`DisjunctVal`, `PrefVal`, `RefVal`, `VarVal`, the `*FuncVal`s, …) are
exported from their modules under `dist/val/`.

The four numeric subclasses are the four numeric leaves:
`IntegerVal` is `integer`, `NumberVal` is `float` (the class name is
historical: `number` is the pure supertype, not a leaf), and
`BigIntegerVal` / `BigDecimalVal` are the exact leaves
`biginteger` / `bigdecimal`.

### Exact numbers and `exactJSON`

`generate()` returns **native** values, and a document that opts into
the `0d` exact literals returns two of them that `JSON.stringify` cannot
write:

| Aontu kind   | Source     | `generate()` returns |
|--------------|------------|----------------------|
| `integer`    | `x:5`      | `number`, or `bigint` past `Number.MAX_SAFE_INTEGER` (see below) |
| `float`      | `x:1.5`    | `number`             |
| `biginteger` | `x:0d5`    | `bigint`             |
| `bigdecimal` | `x:0d0.1`  | `Decimal`            |

**Why an `integer` can be a `bigint`.** The `integer` leaf is an int64
window, and JavaScript stores it in a double. Below
`Number.MAX_SAFE_INTEGER` that is faithful: the integers are contiguous
there, so the `number` renders its own exact digits. Above it they are
not — `JSON.stringify(2**60)` is `1152921504606847000`, a *different*
integer that merely rounds to the same double — so `generate()` returns
a `bigint`, which `exactJSON` writes exactly. A `float` stays a `number`
at any magnitude, because a double's shortest form already names it
exactly (`1e21` serialises as `1e+21`, in this port and in Go).

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
typeof gen('x:9007199254740991').x     // 'number'  (2^53-1)
typeof gen('x:9007199254740992').x     // 'bigint'  (2^53)
typeof gen('x:1e21').x                 // 'number'  (float kind)
exactJSON(gen('x:1152921504606846976'))  // '{"x":1152921504606846976}'
```

An integer-kind `bigint` is still not a `biginteger`: the leaves stay
disjoint and only canon tells them apart (`1152921504606846976` versus
`0d1152921504606846976`). Go needs none of this — its `integer` leaf is
an `int64`, exact across the whole window, so `Generate` returns an
`int64` at every magnitude. The serialised JSON is identical in both
ports.

A `0d`-free document generates exactly what it always did — the exact
leaves are reached only by writing `0d` (see the
[language reference](reference-language.md#the-four-numeric-leaves)).
Both leaves survive nesting: `generate('x:{y:0d7} z:[0d1,0d0.5]')` puts
a `bigint` at `x.y` and a `Decimal` at `z[1]`. Note that an *integral*
bigdecimal is still a `Decimal` and never a `bigint`: `0d1e3` is a
bigdecimal by source form, and the leaves are disjoint.

`JSON.stringify` **throws** on a `bigint` (`TypeError: Do not know how
to serialize a BigInt`), and a `replacer` cannot rescue it — a replacer
may only return another *value*, and anything it returns that is not
already a JSON primitive gets quoted, so the exact digits could come
back only as a JSON *string*, which is a different document. JSON itself
was never the obstacle: a JSON number is arbitrary-precision decimal
text, and `{"x":9007199254740993}` is a legal document. Only
JavaScript's serialiser stands in the way, so the package ships its own.

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
exactJSON(value: any, indent?: number | string): string
```

Serialises a `generate()` result as JSON text, preserving exact numbers.
**Use it instead of `JSON.stringify` on generated output.**

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
import { Aontu, exactJSON } from 'aontu'

const out = new Aontu().generate('x:0d9007199254740993')
typeof out.x        // 'bigint'
exactJSON(out)      // '{"x":9007199254740993}'
exactJSON(out, 2)   // '{\n  "x": 9007199254740993\n}'
JSON.stringify(out) // TypeError: Do not know how to serialize a BigInt
```

- **`indent`** has `JSON.stringify`'s `space` semantics: a number of
  spaces (clamped to `0`–`10`) or a literal string (truncated to 10
  characters). Omitted or `0` gives **compact** output — no spaces, no
  newlines.
- A `bigint` writes its digits. A `Decimal` writes its plain digit form
  (`1000.0`, `0.1`, `-1.5`) — no `0d` marker, since that belongs to
  canon and is not JSON, but an integral bigdecimal keeps its `.0` so
  the JSON still shows a decimal.
- Object keys are emitted in **lexicographic order** (by UTF-16 code
  unit), matching Go's `encoding/json`, which sorts map keys. This is
  done at emit time and not by `generate()`, because a JavaScript object
  *cannot* hold the required order: ECMAScript lists canonical
  array-index keys first, ascending numerically, so an object can never
  present `"10"` before `"9"`. It applies to any object passed in, not
  only `generate()` output, since this is a general emitter — and it is
  the one place the result deliberately differs from `JSON.stringify`.
- Ordinary values are otherwise written exactly as `JSON.stringify`
  writes them: the same string escaping, `null` for `NaN` and
  `Infinity`, and `undefined`/function/symbol dropped from an object but
  written as `null` inside an array. An object with a `toJSON` method is
  asked for its replacement (`Decimal` is handled as a number before
  that check).
- U+2028 and U+2029 are escaped, which `JSON.stringify` does not do —
  that is the one place JavaScript and Go disagree by default, and
  escaping is both legal JSON and safe to embed in JavaScript source.
- It always returns a string: a top-level `undefined` becomes `null`.
- It throws `AontuError` if the value contains a reference cycle. A
  *shared* subtree — which unification produces routinely — is fine;
  only a true cycle is refused, as in `JSON.stringify`.

The output is byte-identical to the Go port's `encoding/json` with
`SetEscapeHTML(false)` for the same document; that equivalence is
pinned by the test suite both implementations run. The `aontu`
CLI calls this same export with `indent` of `2`, so there is exactly one
implementation for the pretty and compact forms to stay in step with.

`Decimal` is exported from `aontu` alongside it — the type a bigdecimal
generates as. It is an immutable exact base-10 value (`unscaled: bigint`
plus `scale: number`) in normal form, so numerically equal decimals have
equal fields:

| Member | Description |
|--------|-------------|
| `new Decimal(unscaled: bigint, scale: number)` | Construct and normalise. |
| `Decimal.fromString(src: string)` | Parse `[+-]?digits[.digits][e[+-]digits]`, with or without a `0d` marker. |
| `toString(): string` | Plain digit form — what `exactJSON` writes. |
| `canon(): string` | Canonical form, with the `0d` marker. |
| `equals` / `compare` / `add` / `negate` / `ceil` / `floor` / `isZero` | Exact operations — no rounding anywhere. |

`Decimal.fromString` refuses input beyond the exactness budget (at most
4096 coefficient digits and an absolute scale of at most 4096 — see the
[language reference](reference-language.md#the-exactness-budget)), the
same refusal a literal gets.

### Variables

`$name` references are filled from `ctx.vars`. Build value objects with
the exported `Val` constructors:

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
import { Aontu } from 'aontu'
import { IntegerVal } from 'aontu/dist/val/IntegerVal'
import { StringVal }  from 'aontu/dist/val/StringVal'
import { MapVal }     from 'aontu/dist/val/MapVal'

const aontu = new Aontu()
const ctx = aontu.ctx()
ctx.vars.foo = new IntegerVal({ peg: 11 })
ctx.vars.bar = new StringVal({ peg: 'hello' })
ctx.vars.obj = new MapVal({ peg: { x: new IntegerVal({ peg: 1 }) } })

aontu.generate('a:$foo b:$bar c:$obj', undefined, ctx)
// { a: 11, b: 'hello', c: { x: 1 } }
```

**Exact-input constructors.** The two exact leaves take a `bigint`, a
`Decimal`, or the digits as **text** — never a JS `number`, which
binary64 has already rounded before this library could inspect it, so an
exact value above 2^53 could not arrive that way intact:

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
import { Decimal }       from 'aontu'
import { BigIntegerVal } from 'aontu/dist/val/BigIntegerVal'
import { BigDecimalVal } from 'aontu/dist/val/BigDecimalVal'

new BigIntegerVal({ peg: 5n })                     // 0d5
new BigIntegerVal({ peg: '9007199254740993' })     // 0d9007199254740993
new BigIntegerVal({ peg: 5 })                      // throws: not-biginteger

new BigDecimalVal({ peg: new Decimal(15n, 1) })    // 0d1.5
new BigDecimalVal({ peg: '0.10' })                 // 0d0.1  (normalised)
new BigDecimalVal({ peg: 1.5 })                    // throws: not-bigdecimal
```

Both reject malformed text (`'5.5'` is not a biginteger).
`BigDecimalVal` additionally refuses input over the exactness budget,
exactly as a `0d` literal does; a biginteger has no bound and is as wide
as its digits. Because the constructor picks the leaf where a literal's
source text would, `new BigDecimalVal({ peg: '5' })` is a *bigdecimal*
and canons `0d5.0`.

### Exports

From `aontu`:

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
Aontu          // class (also default export)
AontuOptions   // type
AontuContext   // class
AontuError     // error class (thrown by generate)
Val            // base value type
Lang           // the parser
VERSION        // the package version string
runparse, util // parsing helpers
formatExplain  // pretty-print an `explain` trace
exactJSON      // exact JSON emitter — use instead of JSON.stringify
Decimal        // the type a bigdecimal generates as
vet            // the validation verb (see `aontu vet` above)
sarifReport    // a vet report as SARIF 2.1.0
subsume        // the subsumption query (docs/reference-language.md,
               // "Subsumption"): subsume(general, specific, {profile?, at?})
               // -> {verdict, findings}; Go: aontu.Subsume
trimCheck      // the redundancy reporter (see `aontu trim` above):
               // trimCheck(src, {path?}) -> {verdict, redundant};
               // Go: aontu.New().TrimCheck(src)
hcanon         // the HASH FORM of an evaluated Val (see `aontu hash`
               // above): canon plus the close()/type()/hide()
               // wrappers; Go: aontu.Hcanon
canonHash      // the canon-hash pin over that form,
               // "aon1-"+base64url(SHA-256(...)); Go: aontu.CanonHash
get            // the query surface (see `aontu get` above):
               // get(src, path, {view?, depth?, path?, trust?}) ->
               // {ok, out, findings}; Go: aontu.New().Get(src, path, opts)
why            // provenance (see `aontu why` above):
               // why(src, path, {path?, trust?}) -> {ok, record, findings},
               // record = {path, value, conjuncts}; Go: (*Aontu).Why
patch          // the overlay patch (see `aontu set` above):
               // patch(entry, overlay, ["$.a.b=1"], opts?) ->
               // {overlay, appended, verdict, findings}; Go: aontu.Patch
diff           // what changed at which paths between two documents:
               // diff(left, right, {at?, trust?}) -> {changes, same, findings};
               // Go: aontu.Diff
agentsMd       // the generated AGENTS.md stanza (see `aontu agentsmd`
               // above): agentsMd(src, {name?}) -> {stanza, ok};
               // Go: (*Aontu).AgentsMd
```

#### Evaluating a document you did not write

`vet`, `get`, `why` and `diff` each take a **`trust`** option, the same
profile [`AontuOptions.trust`](#aontuoptions) takes, and it means the
same thing: what the document being evaluated may reach.

These four verbs exist to be pointed at source from somewhere else — a
candidate an agent emitted, a live system dump, the other side of a diff
— and without a profile they resolve `@"…"` through the default chain,
which reaches anything on the filesystem the process can read. **Opening
an untrusted source is reading your disk**, so pass a profile whenever
the source is not yours. Reading, never running: an include's extension
decides what the file is — `.aon` and `.aontu` as Aontu source, and
`.json`, `.jsonld`, `.jsonc`, `.json5`, `.jsonic`, `.jsc`, `.toml`,
`.yaml`, `.yml` and `.ini` as configuration data — and every other
extension is refused.

<!-- test: skip TypeScript API sample; the API surface is pinned by ts/test/ -->
```ts
vet(schemaSrc, candidateSrc, { trust: { include: 'none' } })
```

The [MCP server](#the-mcp-server) supplies its profile —
`{ include: 'none' }`, or `{ include: { root } }` when started with
`--root <dir>` — to every tool from a single place, rather than each
tool applying it for itself: a tool that must remember to confine
itself is one that eventually forgets, and the forgetting is silent.
The engines that take no `trust` option (`subsume`, `trimCheck`,
`relationCheck`, `patch`) are confined there by a pre-parse under the
same profile: includes resolve at parse, so a document whose confined
parse is clean gives the engine nothing it could reach further with.

---

## Go API

Module `github.com/aontu-lang/aontu/go`, package `aontu`.

<!-- test: skip Go API sample; the API surface is pinned by the go/ test suite -->
```go
import aontu "github.com/aontu-lang/aontu/go"
```

### type `Aontu`

<!-- test: skip Go API sample; the API surface is pinned by the go/ test suite -->
```go
func New() *Aontu                 // relative @"file" loads resolve from the cwd
func NewWithBase(base string) *Aontu  // …resolve from base (a directory)
```

Use `NewWithBase` when a source's relative `@"file"` loads should resolve
from somewhere other than the process working directory — typically the
directory of an entry file:

<!-- test: skip Go API sample; the API surface is pinned by the go/ test suite -->
```go
abs, _ := filepath.Abs(file)
a := aontu.NewWithBase(filepath.Dir(abs))
```

Absolute `@"file"` paths are unaffected by the base. (The `aontu` CLI
does exactly this for a file argument.)

| Method | Signature | Notes |
|--------|-----------|-------|
| `Parse`        | `Parse(src string) (Val, error)` | AST, not unified. |
| `Unify`        | `Unify(src string) (Val, error)` | Parse + fixpoint unify. |
| `UnifyVars`    | `UnifyVars(src string, vars map[string]Val) (Val, error)` | `Unify` with `$name` variables. |
| `Generate`     | `Generate(src string) (any, error)` | Parse → unify → native Go value. |
| `GenerateVars` | `GenerateVars(src string, vars map[string]Val) (any, error)` | `Generate` with variables. |

<!-- test: skip Go API sample; the API surface is pinned by the go/ test suite -->
```go
a := aontu.New()
v, err := a.Unify("a:1 a:number")   // v.Canon() == `{"a":1}`
out, err := a.Generate("a:1 b:$.a") // out == map[string]any{"a":1,"b":1}
```

All methods return an `error` (never panic for ordinary conflicts);
`Generate` returns `(nil, err)` on any unresolved or conflicting value.
Generated output uses Go's natural types (`map[string]any`, `[]any`,
`int64`/`float64`, `string`, `bool`, `nil`), plus `*big.Int` and
`*Decimal` for the exact leaves — see
[Exact numbers in Go](#exact-numbers-in-go).

### `Val` (Go)

The lattice element interface:

<!-- test: skip Go API sample; the API surface is pinned by the go/ test suite -->
```go
type Val interface {
    Canon() string              // canonical source-like form
    Gen(ctx *Ctx) (any, error)  // native value (error if not generable)
    Unify(peer Val, ctx *Ctx) Val
    Dc() int                    // done-counter; DONE (-1) == fully resolved
    Nil() bool                  // true for a unification failure (bottom)
    // …plus unexported lattice-ordering methods
}
```

Concrete exported types: `TopVal`, `NilVal`, `ScalarVal`,
`ScalarKindVal`, `MapVal`, `ListVal`, `ConjunctVal`, `DisjunctVal`,
`PrefVal`, `RefVal`, `VarVal`, `FuncVal`, `PlusOpVal`. Every scalar leaf
— including the two exact ones — is a `ScalarVal`; it holds its kind
internally, so from outside the package a leaf is told apart by the
concrete type `Gen` returns, or by `Canon`.

### Exact numbers in Go

`Generate` returns Go's natural types, and the two exact leaves come out
as the two types that can hold them exactly:

| Aontu kind   | Source     | `Generate` returns |
|--------------|------------|--------------------|
| `integer`    | `x:5`      | `int64`            |
| `float`      | `x:1.5`    | `float64`          |
| `biginteger` | `x:0d5`    | `*big.Int`         |
| `bigdecimal` | `x:0d0.1`  | `*Decimal`         |

A `0d`-free document generates exactly what it always did. An
*integral* bigdecimal is still a `*Decimal` and never a `*big.Int`:
`0d1e3` is a bigdecimal by source form, and the leaves are disjoint.

Both types implement `json.Marshaler` and emit **exact digits as a raw
JSON number**, so `encoding/json` needs no help:

<!-- test: skip Go API sample; the API surface is pinned by the go/ test suite -->
```go
out, _ := aontu.New().Generate("a:0d9007199254740993 b:0d1e3 c:0d0.1")
b, _ := json.Marshal(out)
// {"a":9007199254740993,"b":1000.0,"c":0.1}
```

The pointer is part of the contract. A non-pointer `big.Int` inside an
`any` has no `MarshalJSON` in its method set, so `encoding/json` falls
back to the struct encoder and writes `{}` — an exact number silently
replaced by an empty object, which is the class of failure the exact
leaves exist to eliminate.

A generated `*big.Int` is a **copy**, so a caller may mutate it without
disturbing the value it came from.

`Decimal` is an exact base-10 value (coefficient plus scale), immutable
and always in normal form. Its exported surface is what a consumer of
generated output needs:

| Method | Description |
|--------|-------------|
| `String() string`             | Plain digit form (`1000.0`, `0.1`, `-1.5`). |
| `MarshalJSON() ([]byte, error)` | The same digits, as a raw JSON number. |
| `Canon() string`              | Canonical form, with the `0d` marker. |

`json.Marshal` output matches the TypeScript port's
[`exactJSON`](#exact-numbers-and-exactjson) byte for byte once HTML
escaping is off (`json.Encoder` + `SetEscapeHTML(false)`); that
equivalence is pinned by the test suite both implementations run.

### `Ctx` and errors

- `Ctx` carries the root, variables, and collected errors through a run;
  you normally let `Unify`/`Generate` create it.
- `AontuError{ Msg string }` implements `error` and is returned (wrapped)
  for conflicts; its message matches the TypeScript phrasing
  (e.g. `Cannot unify value: 2 with value: 1`).

### Variables in Go

`UnifyVars`/`GenerateVars` accept a `map[string]Val`. Build the values
with the exported constructors:

| Constructor | Returns |
|-------------|---------|
| `NewString(s string) Val`        | string scalar |
| `NewInteger(i int64) Val`        | `integer` scalar — **refuses** an `int64` binary64 cannot carry exactly (see below) |
| `NewNumber(f float64) Val`       | `float` scalar (the name is kept for API compatibility; the kind it builds is `KindFloat`) |
| `NewBigInteger(n *big.Int) Val`  | `biginteger` scalar — the exact unbounded integer leaf |
| `NewBigDecimal(s string) (Val, error)` | `bigdecimal` scalar — the exact base-10 leaf |
| `NewBoolean(b bool) Val`         | boolean scalar |
| `NewNull() Val`                  | null scalar |
| `NewScalarKind(k Kind) Val`      | type constraint (`KindString`, `KindBoolean`, `KindNull`, and the numeric lattice `KindNumber` with its leaves `KindInteger`, `KindFloat`, `KindBigInteger`, `KindBigDecimal`) |
| `NewMap(map[string]Val) Val`     | map (keys inserted in sorted order) |
| `NewList([]Val) Val`             | list |

<!-- test: skip Go API sample; the API surface is pinned by the go/ test suite -->
```go
vars := map[string]aontu.Val{
    "port": aontu.NewInteger(8080),
    "host": aontu.NewString("localhost"),
    "obj":  aontu.NewMap(map[string]aontu.Val{"x": aontu.NewInteger(1)}),
}
out, err := aontu.New().GenerateVars(
    "server: { host: $host, port: $port }", vars)
// out == map[string]any{"server": map[string]any{"host":"localhost","port":8080}}
```

Pass `nil` vars when a model uses no `$name` variables. An undefined
`$name` is a `Cannot resolve` error.

**`NewInteger` obeys the same storage contract as a literal.** An
`int64` that binary64 cannot carry exactly is refused rather than
stored, exactly as the equivalent literal is refused — otherwise the API
would be a hole straight through that rule, since Go's `integer` leaf is
an `int64` and the canonical TypeScript port's is a double. The refusal
is a **nil value**, not a panic and not a second return: aontu errors
are values, so it flows through unification and surfaces at `Generate`
with the same "not exactly representable" message and the same `0d`
escape a lossy literal gets.

The rule is **exactness, not magnitude**: every power of two in the
window is fine however large, `math.MinInt64` included.

<!-- test: skip Go API sample; the API surface is pinned by the go/ test suite -->
```go
aontu.NewInteger(1152921504606846976)   // 2^60 — fine
aontu.NewInteger(math.MinInt64)         // -2^63, a power of two — fine
aontu.NewInteger(9007199254740993)      // 2^53+1 — nil value
aontu.NewInteger(math.MaxInt64)         // 2^63-1, rounds up — nil value
aontu.NewBigInteger(big.NewInt(9007199254740993))  // the exact escape
```

**Exact-input constructors.** `NewBigInteger` **copies** its argument
and never mutates the copy, so a caller may keep using (and mutating)
the `*big.Int` it passed in; a `nil` argument is zero.
`NewBigDecimal` takes a **string** — an optional sign, an optional `0d`
marker, digits, an optional fraction and an optional exponent, and no
`_` separators (those are literal syntax, not part of a number's text).
A `float64` is deliberately not accepted: it has already rounded before
the library can inspect it.

<!-- test: skip Go API sample; the API surface is pinned by the go/ test suite -->
```go
n, _ := new(big.Int).SetString("123456789012345678901234567890", 10)
aontu.NewBigInteger(n)          // 0d123456789012345678901234567890
aontu.NewBigDecimal("0.10")     // 0d0.1   (normalised)
aontu.NewBigDecimal("0d1e3")    // 0d1000.0
aontu.NewBigDecimal("1_000")    // error: Not an exact decimal
```

`NewBigDecimal` returns an error for malformed text and for input over
the exactness budget (at most 4096 coefficient digits and an absolute
scale of at most 4096 — see the
[language reference](reference-language.md#the-exactness-budget)), the
same refusal a literal gets. A biginteger has no bound and is as wide as
its digits. Because the constructor picks the leaf where a literal's
source text would, `NewBigDecimal("5")` is a *bigdecimal* and canons
`0d5.0`.

---

## Behavioural parity

Both implementations are validated against the same
[`test/spec/*.tsv`](../test/spec/) cases and agree on: scalars and scalar
kinds — including the numeric tower's four leaves (`integer`, `float`,
`biginteger`, `bigdecimal`) under the pure supertype `number`, their
`0d` exact literals, and exact arithmetic — maps (nesting, merge,
spreads `&:`, optional keys, `close`/`open`), lists (incl. spreads),
conjunction `&`, disjunction `|`, preference `*`, references (`$.a.b`,
`.x.a`), `$name` variables, the `+` operator, all twelve
functions, `type`/`hide` marks, and `@"…"` source loading — plus
`parse` / `unify` / `generate` and the canonical form.

Generated **bytes** are in parity too: `exactJSON` in TypeScript and
`encoding/json` in Go produce the same JSON text for the same document,
which the shared suite's byte-exact `gens` rows pin. What byte equality
cannot see — a `bigint` where a `number` was due, since both serialise
as `5` — is pinned by per-port API tests instead.

**Validation reports** are in parity as well: `aontu vet` produces the
same report from both commands, text and JSON, with the same exit code —
pinned by the shared suite's [`vet.tsv`](../test/spec/vet.tsv) rows for
everything but each finding's `message`, which is prose. Two things
still differ by construction: the `aontu.version` field, because the
npm and Go module version series are independent, and the wording of a
"cannot read <file>" failure, which is the host's.

The shared parser stack is identical: TypeScript uses `@tabnas/jsonic` +
`@tabnas/{expr,path,multisource,directive,debug}`; Go uses the ports
`github.com/tabnas/{jsonic,expr,path,multisource,directive}/go`. See
the [Explanation](explanation.md#two-implementations-one-behaviour) for
how parity is maintained.

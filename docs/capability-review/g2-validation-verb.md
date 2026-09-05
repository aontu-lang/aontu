# G2: The validation verb

*Status: implemented — all six phases are landed in both ports.
Per-phase status and pins
are in the [progress register](progress.md), which is authoritative for
status; this document is authoritative for design. Part of the
[capability review](index.md) (August 2026). This document expands gap
G2 — turning aontu from an evaluator of its own files into a guardrail
that validates external data — with alternatives, an explicit boundary,
risks, and an implementation plan.*

## Problem

The canonical agent loop is *emit, validate, repair*. aontu's CLI
(ts/src/cli.ts) supports none of it: it evaluates one file (or stdin)
to JSON or canonical form, full stop. There is no way to hand the
engine a definition and a separate piece of concrete data and ask "is
this data admissible?". Because aontu is a JSON superset, the
unification machinery needed is already present — what is missing is
the verb, and the machine-readable contract around it.

Consider a schema an agent is meant to satisfy:

```aon
# service.aon
service: close({
  name:     string
  port:     integer
  replicas: integer
  owner:    string
})
```

An agent emits `deploy.json`:

```json
{ "service": { "name": "auth", "prot": 8080,
               "replicas": "3", "owner": "team-identity" } }
```

The user wants to write `aontu vet service.aon deploy.json` — and
cannot. The workaround is textual concatenation
(`cat service.aon deploy.json | aontu`), which unifies — but every
site now points into an anonymous synthetic document, the typo `prot`
is reported without the closed struct's allowed keys or a nearest-key
suggestion, the `"3"`-versus-`integer` conflict may never surface
because the fixpoint stops after the first erroring pass
(ts/src/unify.ts), and the report is ANSI-coloured prose on stderr
(`color: { active: true }` is hard-coded in ts/src/err.ts) that an
agent must regex-parse. Exit code 1 means only "something failed".

Second example: drift detection. The same verb pointed at a live
system dump is spec-versus-reality checking:

```aon
# system.aon
services: &: {
  image:    string
  replicas: integer
}
services: auth: { image: "auth:v2.3", replicas: 3 }
```

The platform reports reality as `live.json`:

```json
{ "auth": { "image": "auth:v2.4", "replicas": 3 } }
```

The user wants `aontu vet system.aon live.json --at $.services` and
to learn that `$.services.auth.image` conflicts — `"auth:v2.4"`
observed at live.json:1, `"auth:v2.3"` declared at system.aon:6 — a
located drift report. Today the dump must be hand-edited into an
aontu file that happens to nest under `services`, and the result is
still prose.

The deeper defect is the output contract. The survey's repair-loop
evidence is that error *content* — failing path, observed value, and
above all the admissible alternatives ("what would have unified
here") — drives an agent's ability to self-correct; one benchmark
reports gains of tens of percentage points from alternatives alone
(a single-benchmark figure, per the critique pass, but the direction
is corroborated). aontu's errors carry two sites and a why-code but
enumerate nothing: not the expected kind, not the closed struct's key
set, not the surviving disjunct branches. And the spec suite
conflates the two fundamentally different negative verdicts: in
test/spec/error.tsv, `a:1 a:2` (a contradiction) and `a:number` (mere
incompleteness) are both just `err` rows — yet for a gate, "your data
contradicts the truth" and "your data has not yet supplied everything
the truth requires" are different answers.

## Current state

What exists and is reusable:

- **Unification of external JSON is free.** Any JSON document is
  valid aontu source, so "validate data against schema" is "unify two
  parsed values and inspect the result". Parsing the data file with
  the aontu parser gives every node a site (`{row, col, url}`), so
  external data slots into the two-site error model as-is.
- **Collect mode.** `AontuOptions.collect` (ts/src/aontu.ts,
  ts/src/ctx.ts) accumulates errors on `result.err` instead of
  throwing; `AontuError.errs()` (ts/src/err.ts) exposes the raw
  `NilVal` list. The LSP already builds a structured surface on
  exactly this: `computeDiagnostics` (ts/src/lsp.ts) unifies with
  `{collect: true}`, walks the tree collecting every `NilVal`, and
  maps `nil.why` to a diagnostic `code` with LSP severity constants.
  This walk is the embryo of the vet report. *(When this was written
  it was the LSP's private `walkNils`; phase 2 generalised it into
  ts/src/walk.ts, whose landed exports are `walkVals` and
  `collectNils` — the LSP now imports the latter.)*
- **A why-code vocabulary.** ts/src/hints.ts holds some forty
  why-code strings (`scalar_kind`, `closed`, `no_path`,
  `mapval_required`, …) plus five dynamic prefix patterns (`func:`,
  `op:`, `var[`, `ref[`, `op[`), each with hint text; go/hints.go
  mirrors it. These seed a stable code scheme, but nothing pins them:
  test/spec/error.tsv asserts message substrings, not codes, so codes
  can silently drift between implementations.
- **The two-site error model.** `NilVal` (ts/src/val/NilVal.ts)
  carries `why`, `primary`, `secondary`, `path`, `site`, `details`;
  `NilVal.make` picks the primary by "later in the same file wins";
  `descErr` (ts/src/err.ts) renders both sites with source context.
- **Exit codes.** docs/reference-api.md documents 1 for an evaluation
  error, 2 for a bad option — a two-way split, no verdict classes.

What structurally blocked the capability, at the time of writing —
every item below has since been removed by this plan's own phases,
and the [progress register](progress.md) holds the pins:

- **Single-document CLI.** ts/src/cli.ts accepted one file and two
  output modes (`json`/`canon`); no (schema, data) pairing, no
  anchor concept.
- **First-error fixpoint break.** The pass loop in ts/src/unify.ts
  (bounded by what is now [G5](g5-trust-contract.md)'s pass budget,
  `uctx.budget.passes`, default 9) broke as soon as `uctx.err` was
  non-empty; go/unify.go did the same. Errors raised within one pass
  all collected, but no later pass ever ran — multi-error reporting
  was inherently truncated until phase 6 removed the break.
- **Prose-only rendering.** `descErr` produced ANSI-coloured terminal
  text; no JSON serialisation of a `NilVal` existed outside the LSP's
  partial mapping.
- **No incomplete/contradiction distinction.** Residual `top`/kind
  values became `nil_gen`/`no_gen`-family errors only at generate
  time; test/spec/error.tsv and incomplete.tsv pinned both as generic
  `err` rows.
- **Go had no public collect surface.** The Go API returned
  `(Val, error)` with one wrapped message; `Ctx.collect` (go/ctx.go)
  was internal optional-subtree machinery. A structured multi-finding
  report was a genuinely new surface on the Go side — `aontu.Vet` is
  now that surface.

## Prior art

**cue vet** is the direct model: `cue vet schema.cue data.yaml`
validates YAML/JSON against constraints without exporting;
concreteness is a separate dial (`vet -c`). It proves the verb's
value — "validate data" is CUE's homepage headline — and its failure
mode: output is prose, and CUE's community documents 3,000-line
configs erroring with 30+ stacked sites and no root cause, debugged
by bisection. Verb without contract does not serve agents.

**SHACL validation reports** show the contract half: a standard
machine-readable report vocabulary, three severities
(`sh:Info`/`sh:Warning`/`sh:Violation`), author-attached `sh:message`
on constraints. Cost: RDF-shaped verbosity, and no two-site conflict
concept — SHACL checks data against shapes, it does not merge peers.

**Rust and Elm** set the error-craft bar: stable codes (`E0123`) with
mandatory long-form explanations, JSON diagnostics, suggestions
graded by `Applicability` that rustfix applies automatically; Elm
shows the code as written, both conflicting fragments, one plain
sentence, one hint. Cost: a code registry is a forever-contract —
every code frozen, documented, parity-tested.

**SARIF** is the interchange standard CI systems and coding agents
already consume (GitHub code scanning, MSVC, rustc); the critique
pass flags "inventing a JSON report format" while ignoring SARIF as a
survey blind spot. Cost: rule-centric and verbose; two-site conflicts
squeeze into `relatedLocations`; much of the spec (code flows, fixes,
baselines) is dead weight for a unifier.

**Policy-as-code CI practice** (OPA/conftest, Kubernetes admission,
buf breaking) settles the ergonomics: exit-code classes, a published
GitHub Action, machine-readable output as table stakes, the engine as
a deterministic decision service at the boundary — "the agent does
not decide what is allowed; the policy engine does".
**datacontract-cli** demonstrates the drift half: a definition is
only ground truth if continuously verified against the running
system.

## Design space

**A. Bless the concatenation idiom.** Document
`cat schema.aon data.json | aontu` as the validation story. Zero
cost; but sites collapse into one synthetic document, there is no
report contract, no verdict classes, no anchor, and the identity
claim ("aontu is a gate") stays false. Rejected.

**B. A thin `vet` verb, text output only (cue parity).** Add the CLI
pairing, reuse `descErr`. Small (mostly ts/src/cli.ts); but it
reproduces CUE's documented weakness — the output contract matters as
much as the verb, and agents cannot branch on coloured prose.
Rejected as an end state; it is a waypoint of the phased plan.

**C. Vet with a full machine contract on today's engine.** The verb,
JSON and SARIF reports, stable codes with classes, verdict-classed
exit codes, admissible-alternative enumeration — the first-error
fixpoint break kept and reported honestly (`truncated: true` when the
pass loop stopped early). Moderate cost, no engine risk; the price is
that repair loops may need several round trips to see all errors.

**D. C plus an error-tolerant fixpoint.** Change ts/src/unify.ts and
go/unify.go to localise a `nil` to its subtree and continue passes,
collecting all independent errors in one run. Highest loop
efficiency; but real engine surgery: `nil` is currently absorbing,
and naive continuation risks exactly the cascading spurious-error
pathology CUE users report (one root cause, thirty stacked findings),
plus cost on the hot path.

**E. Validation as a resident service instead of a CLI verb.** Ship
validation as an LSP extension or MCP tool only. But the
delivery-channel evidence (llms.txt versus AGENTS.md) says CI gates
and exit codes are what pull a format into loops,
[G7](g7-machine-access.md) owns the MCP surface and will wrap
whatever engine call vet exposes, and a daemon without a CLI is
untestable in the spec suite. Rejected as a substitute; correct as a
later consumer.

**Recommendation: C, with D as a follow-on engine phase.** The verb
plus the contract changes the language's identity and is
implementable now on collect mode and the existing `NilVal` walk.
The repair literature supports the ordering: alternatives content,
not error count, drives repair success — one well-furnished finding
beats ten bare ones. Multi-error collection is then an efficiency
upgrade whose absence the contract already marks (`truncated`), so
the report shape does not change when D lands.

## Proposed design

### The verb

```
aontu vet [options] <schema.aon> <data.json|data.aon> [more-data...]

  --at <path>        validate data against this path of the
                     evaluated schema (e.g. --at $.services)
  --format <f>       text | json | sarif        (default: text)
  --closed           close() the anchor value for this run
  --partial          incomplete residue is not a failure
  --max-errors <n>   cap findings in the report (default 20)
  --watch            re-run on file change, streaming reports
```

*(One designed flag is not in this synopsis as landed: `--surplus` —
report unconstrained data keys, at `info` severity — has no engine
support yet, and neither CLI accepts it. The register's phase-3 note
records the omission; the flag remains additive if the engine ever
grows the support.)*

Semantics, in order:

1. Evaluate `schema.aon` alone. If it errors, the *schema* is broken:
   verdict `error`, exit 4 — never blamed on the data.
2. Select the anchor: the evaluated root, or the value at `--at`;
   `--closed` wraps it in `close()`. `--at` is a STRUCTURAL path — map
   keys and list indices, the same namespace a reference uses, with the
   index spelled as a plain decimal integer. (Reading it off whatever a
   value's `peg` held also walked into a junction's branches, a
   constraint's own arguments and an array's `length`, which handed
   back a JavaScript number as the anchor and made every document
   valid.)
3. Parse each data file with the aontu parser, so every data node
   carries `{row, col, url}` sites pointing into the data file. A data
   file that does NOT parse is the data's fault: verdict `invalid`,
   with one `parse`-class finding carrying the parser's own code and a
   site in that file. (The plan was silent here, and the first
   implementation answered `error` — the schema's verdict — which the
   engine already contradicted one character away: a refused CONSTRUCT
   such as a lossy integer literal reaches the tree as an ordinary nil
   and is reported as invalid data. The fork was which branch the
   parser happened to take.) Relative `@"file"` loads inside either
   document resolve from THAT document's directory, as they do for
   `aontu <file>`; vet still reads no file itself, so the caller passes
   the paths (`schemaPath`/`dataPath`).
4. Unify anchor & data under `{collect: true}`, then generate-check.
   Parsed trees are single-use, so each data file gets a fresh
   evaluation of the schema — the documented mutation caveat.
5. Walk the result (the LSP's nil walk, generalised into
   `walkVals`/`collectNils` in ts/src/walk.ts and go/walk.go): every
   `NilVal` is a finding; every residual non-generable value (`top`,
   scalar kinds, unresolved required keys) is an *incomplete*
   finding, a distinct class. Two things the landed collection does
   that this step did not say (the register's phase-2 departures):
   findings that never reach the tree are collected from the context
   as well — a parent collapsing to a nil takes its subtree with it,
   so the walk alone reported half of what the verb's own motivating
   example found — and a conflict inside a `&:` template reports the
   template's path, not the instance's, the data site still pointing
   at the offending value.
6. Render the report in the chosen format; exit by verdict class.

### Verdicts and exit codes

| Verdict      | Meaning                                        | Exit |
|--------------|------------------------------------------------|------|
| `valid`      | unifies, fully concrete (or `--partial`)       | 0    |
| `invalid`    | at least one contradiction-class finding, or a data document that would not parse | 1    |
| `incomplete` | no contradiction, but residue remains          | 3    |
| `error`      | the run cannot be set up from the schema side: an unusable schema, or an `--at` that names nothing | 4    |
| —            | usage error (bad flags, unreadable file)       | 2    |

Exit 2 stays reserved for usage, matching the existing CLI convention
(docs/reference-api.md). The `invalid`/`incomplete` split is the
mechanical answer to the error.tsv conflation: contradiction means
the data can never satisfy the truth; incomplete means it does not
yet. Agent-emitted whole documents want incomplete to fail (the
default); layered drift checks over partial dumps want `--partial`.

### The finding object

`--format json` emits one object (stable field order, canonical value
rendering, no ANSI). As landed the field order is `exactJSON`'s
lexicographic order — the one serialiser the suite already holds to
byte parity with Go's, which is why the Go report structs declare
their fields in sorted order; the register's phase-3 note records the
departure from the illustrative order this section first sketched.
This is the verb's own answer to the Problem section's example, keys
absent where the engine has nothing to say:

```json
{ "aontu": { "verb": "vet", "version": "0.53.0" },
  "findings": [
    { "class": "conflict", "code": "closed",
      "message":
        "[aontu/closed]: Cannot resolve value at path $.service.prot",
      "path": "$.service.prot", "severity": "error",
      "sites": [
        { "col": 40, "file": "deploy.json", "role": "data",
          "row": 1, "value": "8080" } ] },
    { "class": "conflict", "code": "no_scalar_unify",
      "message": "[aontu/no_scalar_unify]: …",
      "path": "$.service.replicas", "severity": "error",
      "sites": [
        { "col": 28, "file": "deploy.json", "role": "data",
          "row": 2, "value": "\"3\"" },
        { "col": 13, "file": "service.aon", "role": "schema",
          "row": 5, "value": "integer" } ] } ],
  "truncated": false, "verdict": "invalid" }
```

Field semantics:

- **`code`** — a frozen snake_case string: today's why-codes
  (ts/src/hints.ts, go/hints.go) promoted to contract — append-only,
  renames forbidden, each carrying a `class` and hint text. The
  registry becomes a shared spec asset (`test/spec/errcodes.tsv`:
  code, class, since-version) both implementations load in tests, so
  code parity is assertable the way error substrings are today.
- **`class`** — one of `conflict`, `incomplete`, `reference`,
  `parse`, `budget` (cycle/pass-limit, per
  [G5](g5-trust-contract.md)), `internal`. Verdicts derive from
  classes, so new codes never change exit behaviour.
- **`severity`** — `error`, `warning`, `info`. Conflict and
  incomplete findings are errors; `warning` is reserved for the
  [G3](g3-subsumption-evolution.md) deprecation mark and
  [G1](g1-constraint-algebra.md)'s evaluate-only advisories; `info`
  for the designed surplus reporting (`--surplus`, not landed — see
  the synopsis note above). Maps one-to-one onto the LSP severity
  constants in ts/src/lsp.ts and onto SARIF levels.
- **`expected` / `actual`** — the admissible-alternatives contract as
  landed, rendered in canonical form (deterministic and
  byte-identical across TS and Go, so reports are diffable and
  cacheable). They appear where the engine hands the content over:
  G1's constraint atoms attach the normalised residual and the
  offending value (`port: min(1024)` against `80` reports
  `"expected": "min(1024)", "actual": "80"`), so `expected` renders
  via G1's canonical bound syntax — consumed here, defined there. A
  bare kind conflict carries neither, as the example above shows.
- **`alternatives`, `allowed`, `nearest`** — designed, NOT landed;
  the register's phase-2 note records the omission. For a failed
  disjunction, `alternatives` would list the member canons a
  corrected value could still satisfy — rendered from member canons,
  *not* via `DisjunctVal.gen`, whose fold has a known
  over-unification defect (ts/src/val/DisjunctVal.ts); for a closed
  struct, `allowed` would list the key set and `nearest` give an
  edit-distance-≤2 suggestion. Each needs something the engine does
  not yet hand over, and none of the three changes the report's shape
  when it lands — which is why the omission is a gap rather than a
  departure from the contract.
- **`note`** — the author-attached message carried by G1's
  message-bearing constraint wrapper, which landed as `must`; the
  finding carries it when the failing constraint has one, and omits
  the key otherwise. Designed there; consumed here.

### The two-site model with external data

`NilVal.make`'s primary/secondary heuristic ("later in the same file
wins") is source-order reasoning within one document and says nothing
useful when one side is external. Vet assigns site *roles* by URL
provenance instead: a site whose `url` is a data file gets
`role: "data"` and is listed first (the thing to fix); schema sites
get `role: "schema"`. The underlying `NilVal` fields are unchanged —
a report-layer projection — so the existing error.tsv message
assertions do not move.

### SARIF output

`--format sarif` emits a minimal SARIF 2.1.0 profile: one run, one
`result` per finding with `ruleId: "aontu/<code>"`, `level` from
severity, the data site as primary `location`, the schema site under
`relatedLocations`, the JSON finding embedded in `properties`.
Nothing beyond this profile (no fixes, no code flows); enough for
GitHub code-scanning upload and PR annotation.

### What the spec suite can actually pin

Phase 2's deliverable is "rows before code", and reconnaissance against
the engine turned up five constraints on what a row *can* assert. Each
was probed, not reasoned about; together they rule out the obvious
encodings.

1. **A path is not delimiter-safe.** `"a b":1 "a b":2` produces a
   finding whose path is `a b`; `"a@b"` gives `a@b` and `"a+b"` gives
   `a+b`. Every character a compact `code@path` summary might use as a
   separator is legal inside a quoted map key, and JSON data carries
   such keys routinely. A finding list must therefore be **JSON-encoded
   in the expect cell**, reusing `exactJSON`/`json.Encoder` — the one
   serialiser pair the suite already holds to byte parity — rather than
   invented punctuation.

2. **Message text is deliberately not in parity.** Both runners say so
   at the `errc` site (ts/test/spec.test.ts, go/spec_test.go), and
   `test/spec/divergent.tsv` repeats it: codes are contractual, prose is
   not. A whole-report byte golden would silently promote every
   `message` string to a cross-port contract the repository refuses. So
   **`message` is excluded from any byte-pinned golden** and asserted by
   substring the way `err` rows already are; every other finding field
   is byte-pinned.

3. **Codes are partly dynamic.** `codeClasses` registers five *prefixes*
   — `func:`, `op:`, `op[`, `var[`, `ref[` — and `codeClass()` resolves
   an unregistered code through them. A check of the form "every code a
   vet row names is a key of `codeClasses`" would reject a whole family
   of real findings; the check must go through **`codeClass()`**.

4. **Finding order is not in parity today, so it cannot be pinned
   until vet defines it.** The walk this builds on iterates raw object
   keys, and the two hosts disagree: source `10:… 9:…` yields TS key
   order `["9","10"]` (JavaScript hoists integer-like keys) against Go's
   insertion order. `ts/src/keyorder.ts` exists for exactly this. Vet
   must therefore **sort findings itself** before emitting them — which
   also answers the ordering question left open below. The order is by
   data site (file, row, column), then code, compared by code point.

5. **`truncated` is rarer than the plan assumes.** Two independent
   conflicts *do* collect in one pass — `a:integer b:integer a:"x" b:"y"`
   yields two findings — so the first-error break truncates only when a
   *later pass* would have found more. `truncated` therefore means
   precisely "the pass loop stopped with work outstanding, or
   `--max-errors` capped the list", and phase 6 shrinks the first case
   without changing the field.

### Collect-mode API surface

TypeScript (ts/src/vet.ts, exported from ts/src/aontu.ts):

```ts
const report = aontu.vet(schemaSrc, dataSrc, { at: '$.services' })
// report: { verdict, truncated, findings: Finding[] } — never throws
// for findings; throws AontuError only for unusable schema/args.
```

Go (go/vet.go):

```go
report, err := a.Vet(schemaSrc, dataSrc, aontu.VetOpts{At: "$.services"})
// err != nil only for engine/schema failure; findings are data.
```

`Vet` is Go's first structured multi-finding surface, built on the
internal error list the unifier already accumulates (go/ctx.go)
rather than the single wrapped `AontuError` message. The report
struct is the parity contract: both implementations must emit
byte-identical JSON for the same inputs, pinned by spec rows.

### CI ergonomics

- **GitHub Action** (`aontu-vet-action`, separate repo): runs vet
  over declared (schema, data) pairs, uploads SARIF, fails the job by
  exit class. A pre-commit hook recipe ships in docs/how-to.md.
- **Watch mode**: `--watch` re-runs on file mtime change, one report
  per run. Honestly non-incremental: parsed trees are single-use, so
  every run is a full re-parse and re-unify — acceptable at current
  model sizes and bounded by the fixpoint's pass budget
  (`uctx.budget.passes`, default 9). Incremental
  re-validation is future engine work; evaluation budgets belong to
  [G5](g5-trust-contract.md).
- **Resolver posture**: vet inherits the include resolver chain
  (memory → filesystem → package, ts/src/lang.ts) and its documented
  stance that opening an untrusted source is running it. Untrusted
  schemas are a [G5](g5-trust-contract.md)/[G6](g6-distribution.md)
  problem (sandboxing, pinning) — vet adds no fetching of its own.

## Boundary: what we will not do

- **No auto-applied fixes.** Suggestions are data; applying a patch
  is [G7](g7-machine-access.md)'s format-preserving patch surface.
- **No JSON Schema import/export inside vet.** Interop is a separate
  capability and is lossy until G1's algebra exists.
- **No constraint-bound design.** What `number > 0` means, its meet
  and emptiness rules, and its canonical rendering belong to
  [G1](g1-constraint-algebra.md); vet only reports them.
- **No subsumption or breaking checks.** "Does v2 still admit v1?"
  is [G3](g3-subsumption-evolution.md)'s verb.
- **No lint-rule plugin framework.** Governance rules are ordinary
  aontu files unified over the target; a Spectral-style engine is
  surface-area creep toward CUE, a trap in [index.md](index.md).
- **No executable hooks in validation.** No callbacks or shell-outs
  on findings — deterministic and total, per the
  Turing-completeness trap.
- **No LLM-graded validation.** Vet's answer to the
  JSON-Schema-plus-prose null hypothesis is mechanical — two-site
  conflicts, merge-as-unification, admissible alternatives — not
  another eval harness.
- **No incremental evaluation engine here.** Watch mode is
  re-run-everything; incrementality is a later engine project shared
  with the LSP.
- **No full SARIF fidelity.** Minimal profile only; the JSON report
  is the native contract.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TS/Go report divergence (Go had no collect surface when this was written) | Medium | High | Report JSON pinned byte-for-byte by shared vet spec rows; Go builds on the existing internal error list, not new semantics |
| First-error truncation makes "multi-error report" oversell | High | Medium | `truncated: true` in the contract from day one; phased engine work (Phase 6) removes it; docs state the limit plainly |
| Error-tolerant fixpoint causes cascading spurious findings (CUE's stacked-error pathology) | Medium | High | Gate Phase 6 behind spec rows for nil-localisation; `--max-errors` cap; findings deduplicated by (code, path) |
| Freezing today's why-codes bakes in bad names | Medium | Low | Append-only registry with an alias/deprecation column; codes are contracts, hint text is not |
| Alternatives enumeration touches the known DisjunctVal.gen fold defect | Medium | Medium | Render alternatives from member canons only; never call `gen` on a disjunct to enumerate; add regression spec rows |
| Per-data-file schema re-evaluation is slow in watch/CI loops (single-use trees) | Medium | Medium | Acceptable now (the pass budget, default 9, bounds passes); measure; incrementality is explicitly deferred, budgets are G5's |
| Canon round-trip or existing error text regresses while adding classes | Low | High | `class` is additive on `NilVal`; error.tsv substrings and canon convergence stay green throughout (the enforced property is CONVERGENCE, not the stronger round-trip this line states — see the correction in [G1](g1-constraint-algebra.md#implementation-plan)) |
| Exit-class numbering collides with scripts assuming 0/1 | Low | Low | Non-zero on any failure is preserved; classes are refinements; documented in reference-api.md |
| Adoption risk: agents default to JSON Schema validators | Medium | High | Ship the Action + SARIF so vet drops into existing CI; lead with what JSON Schema cannot do (two-site conflicts, merge-as-unification) |

## Implementation plan

Spec-first throughout: every behaviour lands as `test/spec/*.tsv`
rows before code; TypeScript (canonical) first, Go port follows.
Nothing may regress: every row of the shared suite (counts and their
reproduction commands live in one place — see [the register's protocol rule 5](progress.md#the-update-protocol)), the
error.tsv substring assertions, and canon convergence stay green in
every phase. (This document originally stated that guard as
`parse(canon(v)) == v`; see the correction in
[G1](g1-constraint-algebra.md#implementation-plan) — the enforced
property is convergence, asserted by both spec runners for every canon
row.)

**Phase 1 — error taxonomy groundwork (M).** LANDED, in both ports —
and without touching ts/src/err.ts, which the deliverable list below
names: nothing was needed there, because the `[aontu/<code>]` message
marker predates the review (pinned by error.tsv
`errm-marker-headline`).
Spec: new `test/spec/errcodes.tsv` (code, class, since-version); new
error.tsv rows distinguishing incomplete from conflict (existing rows
untouched). Code: ts/src/hints.ts (registry export),
ts/src/val/NilVal.ts (`class` field), ts/src/err.ts; go/hints.go,
go/val.go. Runners ts/test/spec.test.ts and go/spec_test.go learn to
assert codes.

**Phase 2 — vet engine API (M).** LANDED, and the plan's own
"TypeScript" qualifier is gone: the engine exists in both ports
(`ts/src/vet.ts`, `go/vet.go`), because phase 4 is what makes the
shared rows executable.
Spec: [`test/spec/vet.tsv`](../../test/spec/vet.tsv), run by both
runners — its row count, which phase 6 grew, lives with the suite
counts in [the register's protocol rule
5](progress.md#the-update-protocol). **The row encoding was settled by
probing.** `code@path`
lists, written here before the reconnaissance below, are ruled out by
its first constraint: no punctuation is safe as a separator, because
every candidate is legal inside a quoted map key. The surviving shape
is documented at the head of the file:
**five columns** — name, mode, schema, data, expect — because vet takes
two documents; a **JSON-encoded** expect object, using the serialiser
pair the suite already holds to byte parity; `message` **excluded**
from the golden, asserted per port, because prose is deliberately not
in cross-port parity; and options (`at`, `closed`, `partial`,
`maxErrors`) riding an `opts` key rather than a column. That last part
was the one piece the phase-2 draft could not probe, since no runner
passed options then; it survived phase 4's probe unchanged.
Code: ts/src/vet.ts and go/vet.go (anchor selection, data parse,
unify-with-collect, residue walk generalising the LSP's nil walk into
ts/src/walk.ts and go/walk.go — the landed exports are `walkVals` and
`collectNils`, and the lsp.ts-private `walkNils` this phase set out
from is gone — finding construction);
exported from ts/src/aontu.ts and as `aontu.Vet`.

**Phase 3 — CLI verb and JSON format (M).** LANDED, in both ports.
Code: ts/src/cli.ts and go/cmd/aontu/vet.go (`vet` subcommand, `--at`,
`--closed`, `--partial`, `--max-errors`, `--format`, verdict exit
classes); docs/reference-api.md, docs/how-to.md. **Departure:** the
text renderer does NOT reuse `descErr`. `descErr` renders NilVals
through the TypeScript-only error path, ANSI colour included, while
the report is a plain projection the Go port matches byte for byte —
rendering from the projection is what lets one contract drive both.
Roles do replace the same-file primary heuristic for cross-file
sites, as planned.

**Phase 4 — Go port (L).** LANDED.
Code: go/vet.go, go/walk.go, go/cmd/aontu/vet.go. **Departures:** no
go/report.go — the renderers live beside the command, as they do in
ts/src/cli.ts, and the report types are the engine's exported API; and
go/hints.go needed nothing, because the codes vet reports were already
registered by phase 1. go/spec_test.go runs vet.tsv and errcodes.tsv
with no skip list, and the two CLIs were diffed over ~90 schema/data
pairs: byte-identical reports, text and JSON, exit codes included.
Byte parity is what made this phase an ENGINE phase as much as a port
one — it exposed nine pre-existing divergences no shared row had
reached (column counting, frame context lines, a closed bag's early
return, a lost path in the disjunct fold, unsited junctions, an
unplaced preference yardstick, the operand flip comparing offsets
across two documents, a constraint residual losing its source, and
generation under collect recording nothing), each fixed rather than
recorded. The progress register lists them.

**Phase 5 — SARIF, Action, watch (S).** LANDED, in both ports.
Code: ts/src/report-sarif.ts and its Go twin go/report_sarif.go —
library API (`sarifReport`/`SarifReport`), not CLI plumbing, so an
embedder and G7's MCP server can emit the interchange form without
shelling out; `--format sarif` and `--watch` in both CLIs; the SARIF
golden in test/spec/files/vet-sarif/ (message text and producer
version redacted, the same carve-outs the JSON report makes).
**Departure:** the Action ships in THIS repository as the composite
`vet-action/` (`rjrodger/aontu/vet-action@<ref>`), not as the separate
`aontu-vet-action` repository named above — in-repo it versions in
lock-step with the CLI it runs, and a subdirectory action is directly
referenceable, so the separate repository bought nothing but drift
risk. Watch polls mtime+size rather than using a native watcher, which
is what "re-run on file mtime change" turns out to mean once editor
save strategies (inode replacement) enter the picture.

**Phase 6 — multi-error collection (L, engine).** LANDED, in both
ports, and far smaller than its L sizing: removing the
`if (0 < uctx.err.length) break` site (ts/src/unify.ts, go/unify.go)
was the whole engine change, because the "localise `nil` to its
subtree" machinery this phase planned to build ALREADY EXISTS — the
absorption discipline (unite's isNil arms return the existing nil,
raising nothing) keeps one failure one NilVal through every later
meet. That was established by an adversarial probe corpus over both
engines (fan-in references, spread templates, disjunct trials, nested
conjuncts, prefs, `must`) before any row was written, and the rows are
`test/spec/vet.tsv` `multi-*`. **One departure:** the dedup key is
(code, sites), not the (code, path) sketched under Risks — a reference
resolves by CLONING its target, so one failed target can fail once per
referrer with a different path each time; the paths are exactly what
differ, so keying on them cannot collapse the family, and keying on
the meet's source positions also fixed a pre-existing double report
(a pure reference cycle reported at two of its three members even
under the single-pass loop). `truncated` now means only the
`--max-errors` cap, exactly as this plan predicted.

Rough sizing: S ≈ days, M ≈ a week or two, L ≈ several weeks per
implementation.

## Open questions

- ~~**Default completeness.**~~ **Decided: strict.** Bare `vet`
  requires full concreteness — residue with no contradiction is
  verdict `incomplete`, exit 3 — and `--partial` opts out. The gate is
  the primary use: a half-finished document must not pass one, and a
  verb that silently accepted "not yet finished" would answer the
  wrong question for the agent loop the verb exists to serve. The
  drift case is real but secondary, and it pays exactly one flag. The
  exit classes may therefore be documented as stable when phase 3
  lands them.
- **YAML ingestion.** Live dumps are often YAML. Accepting it means a
  site-accurate YAML parser in *both* implementations, or a
  documented `yq`-style conversion step; parser cost decides. *(All
  six phases landed without it: vet ingests aontu source — and so
  any JSON — only. Still open, and still additive.)*
- ~~**Relaxed versus strict data parsing.**~~ **Decided: full
  grammar.** A data file is ordinary aontu source, so a candidate may
  refine the truth (`replicas: min(2)`) rather than only satisfy it —
  vet's contract is "validate a **contribution**". This is what makes
  the verb compose with layering instead of standing outside it, and
  it costs nothing at the report layer: site *roles* are assigned by
  URL provenance, not by what the file's grammar was allowed to
  contain, so the labels stay crisp however rich the data is. A
  `--strict-data` JSON-only mode remains available as an additive
  flag if a caller wants the narrower contract; nothing in the report
  shape changes when it lands.
- ~~**Registry source of truth.**~~ **Decided by what phase 1
  landed: neither generator was built.**
  `test/spec/errcodes.tsv` declares itself the source of truth, both
  engines keep hand-maintained `codeClasses` tables (`ts/src/hints.ts`,
  `go/hints.go`), and both runners assert set equality in both
  directions (`spec-errcodes-registry`, `TestErrCodesRegistry`), so
  neither table can drift from the registry without a red suite. The
  question as posed — which artifact generates which — is answered by
  a third option: cross-checking beats generating, and the registry is
  the contract.
- **Anchor convention beyond `--at`.** A schema could name its own
  validation entrypoints (an in-file mark), which travels better than
  a flag once schemas are distributed ([G6](g6-distribution.md)) but
  adds language surface; the flag ships first. *(It did: the landed
  verb has `--at` only. The in-file mark stays open.)*
- ~~**Finding ordering.**~~ **Decided: vet sorts, by data site then
  code** — then path, then the walk index, the last field making every
  key unique so a tie cannot fall to the sort algorithm. Not a
  preference but a necessity — the underlying walk's
  order is not in cross-port parity (see "What the spec suite can
  actually pin", point 4), so an unsorted report could not be pinned by
  a shared row at all. Data-site document order is also what agent
  loops want, so the forced answer is the wanted one. The **cap**
  remains open: CUE's thirty-site pile-ups argue for a low default,
  and now that phase 6 has landed multi-error collection, the
  default (20) is live and adoption data can move it.

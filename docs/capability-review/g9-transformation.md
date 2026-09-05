# G9: Declarative transformation — one model, many generated artifacts

*Status: design proposal. Part of the
[capability review](index.md), opened August 2026 after G1–G8 landed.
This document expands a gap the original eight did not name: turning
an evaluated aontu model into OUTPUT CODE — TypeScript, Go, SQL,
YAML, OpenAPI — in three forms that must all feel native to the
language. Form (a) is a host program consuming the model; form (b) is
driving [jostraca](https://github.com/jostraca/jostraca) as a library;
form (c) is DECLARATIVE TRANSFORMATION, designed with XSLT as the
inspiration. The owner has settled the open questions as decisions D1
through D7 (see [Design space](#design-space)); this document
specifies them rather than relitigating them. Per-phase status will be
in the [progress register](progress.md), which is authoritative for
status; this document is authoritative for design. Every claim marked
VERIFIED was run against the built CLIs at 0.53.0 — `node
ts/bin/aontu.js` and a fresh `go build ./cmd/aontu` — during the
drafting of this document.*

## Problem

A model that is ground truth for a system, and cannot produce the
system's code, is ground truth for nothing that ships. Every one of
the fourteen use cases under [`use-cases/`](../../use-cases/) exists
to be *derived from*: `10-data-model/domain.aon` describes four record
types a Go server, a TypeScript client and a SQL schema all have to
agree about; `03-api-contract/` describes an API whose clients,
servers and tests all derive from it; `01-service-catalog/` describes
eight services whose Kubernetes manifests are the point. Today none of
those derivations exists, and the reason is one missing capability,
not fourteen.

**First failing example, from a real document.**
[`use-cases/10-data-model/domain.aon`](../../use-cases/10-data-model/domain.aon)
already carries every fact a TypeScript emitter needs:

```aon
schema: {
  Customer: type(close({
    id: string & re("^cust-[0-9]{4}$")
    ledgerId: integer & min(1) | biginteger & min(1)
    name: string & length(min(1) & max(120))
    country: string & re("^[A-Z]{2}$")
    currency: string & re("^[A-Z]{3}$") & neq("XXX", "XTS")
    email?: string & re("^[^@ ]+@[^@ ]+[.][a-z][a-z]+$")
    creditLimitCents?: integer & min(0) & max(100000000000)
  }))
  ...
}
```

The wanted artifact is fifteen lines of TypeScript. aontu cannot
produce a byte of it. `generate()` returns JSON and nothing else; a
document evaluates to a value, and there is no verb, no library
function and no vocabulary that turns a value into target-language
source. So the `Customer` interface gets written by hand, in three
languages, and then the model and the three copies drift — which is
exactly the disease [G8](g8-generation.md) diagnosed *inside* a
document, reappearing *between* the document and everything derived
from it. G8 removed the copy-paste within the model; nothing removed
it at the boundary.

**Second failing example, and this one is not a missing feature but a
missing shape.** The obvious repair is to build the text in the model.
aontu can already hold a code template as a value — VERIFIED,
backtick strings are multi-line and process escapes in both ports:

```
$ printf 'a: `x\\ty\\nz`\n' | aontu -    ->  {"a":"x\ty\nz"}
```

and `+` concatenates and even coerces — VERIFIED, both ports:
`"port: " + 8080` is `"port: 8080"`, `"x" + true` is `"xtrue"`. So a
model can compute one line of output per field. What it cannot do is
assemble those lines into a body:

```
$ printf 'n: [a, b]\nj: join($.n, ",")\n' | aontu -
[aontu/unknown_function]: Cannot resolve value at path $.j
$ printf 'n: [a, b]\nj: sum($.n)\n' | aontu -
[aontu/invalid-arg]: Cannot sum value at path $.j
```

There is no `join`, no `indent`, no `replace`, no case conversion
beyond whole-string `upper()`/`lower()`, and `sum()` is numeric only.
`sum` : `add` :: `join` : `+` — the fold over `+` is the exact
missing sibling of a fold the language already has.

**Third, the natural map is a meet.** `each()` looks like the
element-wise mapper every author reaches for and is not one —
VERIFIED, both ports:

```
$ printf 'n: [a, b]\nup: each($.n, upper(_))\n' | aontu -
[aontu/scalar_value]: Cannot unify values at path $.up.0
```

`each` MEETS the template into each child
(ts/src/val/EachFuncVal.ts, the `unite(elctx, el, ...)` call), so
`each($.ports, integer)` is a schema statement and a lattice citizen,
and `each($.names, upper(_))` is a contradiction. `pack()` maps, but
only into a map, and only over string-keyed data: VERIFIED,
`pack([{n: id},{n: name}], {x:1})` is `[aontu/pack_key]`, so a list of
records — the central shape of any code-generation model — cannot be
packed at all.

**Fourth, and this is the one that decides the architecture.** Nothing
checks the derivation. If a host program walks the model and prints
text, the text is checked by the target compiler, hours later, in
someone else's repository. XSLT's answer to this is its defining
trick: a stylesheet is itself an instance of its own output vocabulary
(XML), with instructions distinguished by namespace, so literal result
elements pass through and can be validated against the output schema.
aontu has no analogue, and without one, the "transformation layer"
would be a text templating engine with a lattice bolted to the front —
the failure mode every prior art below shares.

For the agent mission these four are one disease. An agent asked to
"add a field to Customer" must today edit the model, the TypeScript,
the Go, the SQL and the OpenAPI, infer the pattern from examples in
four languages, and hope. Every one of those edits is a place where an
agent can make the system disagree with itself, and no conflict is
detected anywhere.

## Current state

What exists is more than it looks like, and most of it is reusable.

- **A model can already be read by a model.** VERIFIED, and this was
  not previously recorded: `pack()` enumerates the keys of a
  `type(close({...}))` record, even though such a record generates
  as `{}`. So a transform CAN introspect a schema. The mechanism is
  that `PackFuncVal`'s key walk reads the bag's keys while the
  `type()` mark only affects `gen` (ts/src/val/BagVal.ts).
- **`match()` discriminates aontu kinds by trial meet.** VERIFIED:
  `match(_, integer, "int", string, "string", boolean, "bool", [],
  "list", {}, "map", "any")` classifies correctly, because `match`
  selects by unifiability (ts/src/val/MatchFuncVal.ts) and the four
  numeric leaves are mutually disjoint. One thing it cannot do:
  bare `number` unifies with every leaf, so a field declared `number`
  classifies as whichever leaf is tried first and no re-ordering
  fixes it. `domain.aon` lines 36–41 already argue, on its own
  terms, that bare `number` is the wrong spelling for a
  codegen-facing field.
- **`pick(pack(d, {f: t}), f)` is an element-wise map, and it
  composes.** VERIFIED byte-identically in BOTH ports, nested inside
  another `pack` template, over the real `domain.aon` across an
  `@"./domain.aon"` include. A complete transform is therefore
  expressible today, with no new grammar and no new builtin. The
  worked example is [below](#worked-example-1).
- **A source record's own fields are reachable through the
  placeholder.** The obvious spelling fails —
  VERIFIED `pack($.m, {got: _.n})` is `[aontu/no_path]` — but a
  hidden capture works, VERIFIED byte-identically in both ports:

  ```aon
  m: {a: {n: "one", t: "T"}, b: {n: "two", t: "U"}}
  v: pack($.m, {src: hide(_), d: `x` + .src.n + .src.t})
  # -> {"a":{"d":"xoneT"},"b":{"d":"xtwoU"}}
  ```

  This matters: a transform can read any number of fields of the
  record it is transforming, today. It also demonstrates why a
  REPLACING combinator is needed — under `each` the source keys `n`
  and `t` survive the meet into the produced element.
- **`funcMap` is the blessed extension point.** ts/src/lang.ts:530
  maps names to Val classes; the G1 atoms and the G8 combinators
  landed there "with zero grammar change". Adding `join` is a class
  plus registry entries, not a parser change.
- **Marker-delimited regeneration already exists.** `agentsMdSplice`
  (ts/src/agentsmd.ts) rewrites between markers and leaves
  surrounding hand-written text alone — the mechanism a generator
  needs for protected regions, already written once.
- **The loss-report contract exists.** `SchemaLoss`/`SchemaReport`
  (ts/src/jsonschema.ts:41-67) is the established shape for "the
  artifact ships, and what could not be carried is reported": a
  `{path, construct, reason}` triple, a three-valued verdict, and
  `--strict` turning the report into a refusal. A code emitter has
  strictly more loss than a JSON Schema emitter and must not invent
  a second shape.
- **`anchorAt` gives every verb a slice.** `--at <path>` already
  exists on `vet`, `jsonschema`, `diff` and `breaking`, and
  `aontu get $.db -c` already yields a stable canon fragment for a
  slice. D5's "every output declares the slice it consumes" needs no
  new selection mechanism.
- **`std/system` is the bundling precedent.** ts/src/std.ts:16-66 and
  go/std.go carry the same bytes, resolved from the engine itself
  under every include capability except `none`, pinned by
  test/spec/std-system.tsv's canon and hash rows. A shipped
  vocabulary costs no new machinery.
- **Jostraca is real, is the same author's, and is at parity.**
  `/home/user/jostraca/jostraca` at 0.33.1, module path
  `github.com/jostraca/jostraca/go`, tags `v0.33.1` and
  `go/v0.33.1`, 38 parity scenarios under `go/testdata/parity/`. It
  owns atomic write-then-rename, the `existing.txt` policy matrix
  (`write|preserve|present|diff|merge`), three-way merge with the
  previous generate as ancestor, `JOSTRACA_PROTECT`, `Inject`
  markers, `Fragment`/`Slot`, exclusion and dry-run.

What structurally blocks the capability:

- **There is no output vocabulary.** Nothing says what a transform
  result IS, so nothing can check one.
- **There is no fold to a string** (`join`), so per-item strings
  cannot become a body. This is the single missing primitive.
- **There is no order-preserving element-wise map.** `pick(pack(...))`
  goes through a map, and map keys are code-point sorted in both
  ports (ts/src/keyorder.ts). VERIFIED on a real document: the
  service catalog's source order is `payments, ledger, risk` and the
  generated order is `ledger, payments, risk`. For a struct's fields
  or a SQL DDL's columns that is valid but surprising output that
  changes silently when a field is renamed.
- **Four facts are invisible to any in-language transform.**
  VERIFIED: optionality (`email?:` packs with no marker), source key
  order, closedness, and disjunction arm membership
  (`ledgerId: integer & min(1) | biginteger & min(1)` collapses to
  one arm under `match`). All four are things generated code needs.
- **Hidden and unfilled-optional children flow into every bag.**
  VERIFIED identically in both ports:
  `m: {a: 1, b?: 2, c: hide(3)}` gives `each($.m)` = `[1,2,3]` while
  the map generates `{"a":1,"b":2}`. For an aggregate over numbers
  this was invisible; for a primitive whose output is bytes written
  to a file it is a disclosure hazard.
- **Three engine defects sit directly on this path**, none of them
  recorded in [`use-cases/BUGS.md`](../../use-cases/BUGS.md),
  [`DIVERGENCE.md`](../../DIVERGENCE.md) or
  [`test/spec/divergent.tsv`](../../test/spec/divergent.tsv) — which
  today has **zero** rows. They are enumerated in
  [Phase 0](#phase-0--the-four-gating-defects-s) and are gating.

## Prior art

Every system that generates code from a model chooses one of four
shapes, and the failure modes are consistent enough to be predictive.

**XSLT** is the direct inspiration and the direct warning. Its
defining property is that a stylesheet is an instance of its own
output vocabulary — XML — with `xsl:` as the escape, so literal result
elements pass through and can be validated against the output schema.
Nothing else in the field has that. Its failures are equally
instructive, and all four are avoidable here. (1) *Whitespace is
unowned*: whitespace-only text nodes are stripped but a node with any
non-whitespace is preserved whole *including its source indentation*,
and `xsl:output indent` applies only to the `xml` and `html` methods —
so the community's answer for text output was DTD entities expanding
to `xsl:text`. (2) *Conflict resolution is by accident*: XSLT 1.0's
four-valued default priority is resolved, when it ties, by
"choosing the template rule that occurs last", and XSLT 3.0 retracted
both that and import precedence. (3) *The built-in rule is unsafe for
text*: unhandled nodes have their string value copied into the result,
which for source code means model data silently landing in the middle
of a file. (4) *Action at a distance*: no local reading of a template
tells you what it emits. This document takes XSLT's one great idea and
refuses all four failures explicitly.

**Acceleo** (Eclipse/OMG MTL) is the closest working analogue: an OCL
query language over an EMF model, `[template]` blocks, and — the part
worth stealing — *protected regions* with markers that survive
regeneration. Its cost is a whole model layer (Ecore) before anything
can be transformed, and a template language that grew until it
was a programming language with an XML-adjacent syntax.

**StringTemplate** (Parr) contributes the strongest *negative*
theorem in the field: it deliberately enforces strict model–view
separation — no side effects, no assignment, no iteration counters, no
general expressions — on the argument that a template language which
can compute becomes an untestable second program. Its ADT-driven
`<attr:{x|...}>` maps are the discipline. It is also the proof that
"the template owns layout" is survivable *only* if the template
language cannot compute.

**TypeSpec** (Microsoft) and **Smithy** (AWS) are the two mature
"one model, many emitters" systems, and they agree on the two things
that matter here. Both have a *neutral IR* the emitters consume rather
than each emitter walking the source AST. Both have discovered that
the hard part is not the IR but **symbols**: Smithy's `SymbolProvider`
plus `$T` formatting exists so generation logic never writes an
identifier by hand and imports are derived from references, and
TypeSpec's Alloy has `refkey`s for the same reason. Smithy also
contributes the escape design: a typed property bag on `Symbol` rather
than a per-language dialect of the IR.

**protoc plugins** contribute the process shape: the compiler
produces a `CodeGeneratorRequest` — a serialised, complete,
language-neutral description — and every plugin is a program that
reads it on stdin and writes files on stdout. The lesson is that the
IR being *serialisable data* is what made twenty independent language
backends possible. The counter-lesson is **OpenAPI Generator**, whose
mustache-template-per-language design has 5,000+ open issues and
per-language template forks: an escape hatch with no cost attached
swallows the core.

**Pkl** (Apple) is the nearest neighbour in the configuration-language
family and made the opposite choice to D2 deliberately: its renderers
(`PcfRenderer`, `YamlRenderer`, ...) live in the *tooling*, and the
language stays value-valued. Its `@go.Package`/`@go.Name` annotations
are Smithy's property bag by another name.

**Jostraca** is the fourth form and the reason D3 is a dependency
rather than a design: it already owns file writing, folder structure,
three-way merge over hand-edited code, `Slot`/`Inject`, protected
regions and exclusion, in TypeScript and Go, by the same author, under
the same parity discipline. Reimplementing any of it here would be
building a second, worse copy of a solved problem one layer down.

## Design space

**A. A host program per target (form (a) alone).** Document
`generate()` and let each consumer walk the JSON. Near-zero cost, and
it is what people will do anyway. Rejected as the *end state* for
three reasons: `generate()` has already deleted optionality,
closedness, defaults, constraints and kinds by the time the host sees
it; a Go host cannot walk the Val tree at all (go/val.go exports
`Canon`/`Gen`/`Unify`/`Dc`/`Nil` and nothing else, and `MapVal`'s
fields are unexported), so form (a) is a TypeScript-only capability
today; and nothing checks the derivation. Kept as a supported form,
not as the mechanism.

**B. A template language in the document.** Backtick strings plus
interpolation plus a loop construct: the Acceleo/mustache shape.
Rejected: it puts layout in the template, which is XSLT's whitespace
failure and mustache's fork-per-language failure, and it needs the
comprehension keywords [G8](g8-generation.md) refused on grammar-size
grounds. The G8 boundary holds here.

**C. A second evaluator — an XSLT-shaped rule engine with its own
semantics.** A stylesheet document, its own pattern language, its own
priority scheme, its own conflict resolution. Rejected: it is a second
language to specify, teach and keep in TS/Go parity, and aontu already
has a pattern language whose patterns are values and whose match test
is unification. Reinventing that is surface-area creep of exactly the
kind [index.md](index.md) names.

**D. Emit JSON Schema (or OpenAPI) and generate from that.** Zero new
aontu surface; hand off to the mature ecosystem. Rejected on evidence
this repository already has: `aontu jsonschema` exists and its whole
`SchemaLoss` machinery exists *because* JSON Schema cannot carry what
the model says. Routing code generation through a strictly weaker
vocabulary discards the constraints, the identity, the relations and
the closedness dial — which is most of what makes the model worth
generating from.

**E. A neutral output vocabulary, expressed as an aontu schema, that a
transform written in ordinary aontu produces, that the unifier vets,
that a tooling renderer turns into bytes, and that Jostraca writes.**
The costs are real and stated: the transform reads a schema through
`pack`/`match` rather than through a reflection API; four facts are
invisible until a reflection sidecar lands; and the renderer will
never produce byte-for-byte what `gofmt` would.

**Recommendation: E.** It is the only option that keeps the XSLT
property — the result is an instance of the output vocabulary, and the
output vocabulary is an aontu schema, so the result is checked by the
same unifier that produced it — while refusing all four of XSLT's
failures and reusing rather than reimplementing Jostraca.

### The owner's decisions

The following are settled. They are recorded here with their reasons
so that a later reader does not re-derive them.

**D1 — the transform is aontu; the result is shaped like the target
language.** "The XSLT analogue exists in the output target language,
yet is syntax neutral" describes the RESULT TREE, not the transform
file. The result is a document of declarations, types, fields,
functions and comments, which a renderer turns into bytes. It is
syntax-neutral because the output vocabulary is neutral. And because
the output vocabulary is itself an aontu schema, a transform result
can be VETTED by unification against the vocabulary it claims to
speak — the analogue of XSLT validating literal result elements
against the output schema, and better, because it is the same
mechanism the language already uses for everything else.

This works today. VERIFIED, both ports, on the transform document
of [worked example 1](#worked-example-1):

```
$ aontu vet std-code.aon xf-domain.aon        -> verdict: valid
$ go run ./cmd/aontu vet std-code.aon xf-domain.aon  -> verdict: valid
```

and with one `prim: "int"` corrupted to `prim: "nope"`:

```
verdict: invalid
$.code.units.0.decls.0: empty [conflict]
  data:   xf-domain.aon:3:32 ({"fields":[...{"prim":"nope"}...],"k":"record","name":"Customer"})
  schema: std-code.aon:9:8  ({"doc"?:string,"fields":[&:$.%Field],...}|{"k":"text",...})
```

**D2 — text output lives in the tooling, not the engine.** The unifier
stays JSON-valued. A new CLI verb plus a library — the precedent is
ts/src/jsonschema.ts and ts/src/agentsmd.ts, engine functions with CLI
verbs and MCP tools over them — walks the evaluated model and renders
bytes. aontu documents never evaluate to a file; they evaluate to a
MODEL OF the output, and the tooling renders it.

**D3 — aontu drives Jostraca as a library**, in both ports (`jostraca`
on npm, `github.com/jostraca/jostraca/go`). Jostraca owns file
writing, folder structure, three-way merge, `Slot`/`Inject` and
protected regions; aontu reimplements none of it.

**D4 — four clauses of the [G8 boundary](g8-generation.md#boundary-what-we-will-not-do)
are opened**, and only these four: (i) a fold over strings —
`join(list, sep)` and family; (ii) string interpolation syntax,
previously refused outright; (iii) an engine-driven recursive walk —
an apply-templates analogue whose descent lives in the engine so that
no USER recursion exists; (iv) a general map combinator over lists.
Everything else in the G8 boundary stands.

**D5 — one model, many outputs, each over part of the model.** A
single model is the source of several artifacts in several target
languages at once, and each consumes only part of the model. This is
the normal case, not an extension.

**D6 — a transform is not confined to its slice.** The slice an output
declares is DOCUMENTATION — a statement of intent for readers and for
the coverage report — not a capability boundary. Nothing enforces
confinement, and there is therefore no sound per-output staleness
answer.

**D7 — one manifest, one run, N files.** The user invokes the
manifest; every output is produced in one pass over one evaluated
model; Jostraca receives ONE Project containing all N outputs, so its
merge, exclusion and protected-region logic sees the whole tree at
once and one consistent snapshot backs every file.

### Two specialist disagreements, resolved

Two designs were drafted in parallel and they disagree. Papering over
either would leave an implementer without an answer, so both are
resolved here.

**Resolution 1 — the IR is at DECLARATION level, not at TEXT level.**
One draft proposed a high-level vocabulary of units, declarations,
types and fields; another proposed a Jostraca-shaped plan of
project/folder/file/content nodes. They cannot both be the output
vocabulary. **The declaration vocabulary wins**, and the plan is
demoted to a data structure the *bridge* builds in the host from the
render report — never something a transform writes. Three reasons.
(i) At text level, and with no `join`, one output line is one plan
node: a forty-line Go struct is forty nodes carrying `kind`/`src`,
which is strictly worse to write and review than the fifty-line host
program it replaces. (ii) At text level the vocabulary can assert
almost nothing — "this is a string" — so D1's vetting claim
evaporates, which is the whole prize. (iii) At text level the layout
is baked into the leaf at construction time and a renderer can never
re-indent, which is XSLT's whitespace failure imported wholesale.

This resolution has a large consequence downstream: **`join` is not on
the critical path.** The renderer owns lines and indentation, so
`join` is needed only for leaf strings — a struct tag, a SQL column
list, a generic parameter list. It is still built (D4 i), and first,
because it is cheap and because those leaves are real; but no phase
blocks on it.

It also removes a claimed blocking requirement on the other
repository: because the bridge builds the Project tree in the host
from a render report, Jostraca needs no data-driven `Tree(nodedef)`
component. That was named as blocking; it is not.

**Resolution 2 — `_.field` is not unspellable, and the risk built on
that claim is withdrawn.** One draft recorded, correctly, that
`pack($.m, {got: _.n})` fails `[aontu/no_path]`, and concluded that a
transform cannot read a field of the record it is transforming. The
conclusion does not follow: the hidden-capture idiom in
[Current state](#current-state) reads any number of fields, VERIFIED
byte-identically in both ports. The phase that existed to decide
whether `_.field` was blocking is therefore not needed, and
`fillPlace` is not being taught to fill the head of a relative
reference in this design.

## Proposed design

Five parts. Each is separable, and the ordering below is the
dependency order.

```
  model.aon
    -- a transform, written in ORDINARY AONTU (pack/match/pick/join) -->
  a %Code instance         <-- VETTED against @"aontu:code" (D1)
    -- render(), a pure fold with a language PROFILE -->
  text units + a loss report
    -- the jostraca bridge (D3) -->
  one Project, one generate(), N files on disk (D7)
```

### 1. The output vocabulary — `@"aontu:code"`

A bundled aontu schema, served from the engine as `std/system` already
is (ts/src/std.ts, go/std.go, same bytes, pinned by a canon and a hash
row). It is ONE vocabulary, not a family: variation is carried by
`x?: {}`, an open map on every node keyed by backend name, which is
the language's own open/closed dial doing the job Smithy needs a typed
property bag for. A family would multiply the parity surface by the
number of dialects and would make "which vocabulary does this result
speak" a new failure mode.

Three properties carry the design, and each was reached by refusing an
earlier draft.

**It is anchored under a key, and `type()`-marked.** A root-anchored
vocabulary is *vacuous* and *polluting*, both VERIFIED. Vacuous:
with `units: [&: %Unit]` at the root, `aontu vet vocab.aon
<anything>` answers `valid` — a document containing only `other: 1`
passes, and so does one that typo'd the top-level key to `unit:`,
because a spread generates `[]` and a root cannot be closed.
Polluting: a document that includes such a vocabulary generates
`{"myconfig":{"a":1},"units":[]}`. The fix is the `std/system`
arrangement — namespace under one key, mark it — and it costs nothing:
VERIFIED, an includer of the marked vocabulary generates `{"my":1}`,
and vetting needs no `--at`.

Avoiding `--at` matters for a second reason. VERIFIED, a two-line
reproducer of an **unrecorded ADR-001 break**:

```aon
# p7.aon
%F = close({ n: string })
code: { fs: [&: %F] }
# p7d.aon
fs: [ {n:"x"} ]
```
```
$ aontu vet --at code p7.aon p7d.aon          -> verdict: valid    (exit 0)
$ go run ./cmd/aontu vet --at code p7.aon p7d.aon
verdict: invalid                                                   (exit 1)
$.code.fs.0: no_path [reference]   schema: p7.aon:2:17 ($.%F)
```

The cause is not what an earlier draft diagnosed (root-level aliases
becoming unreachable after re-rooting): a non-spread alias under `--at`
resolves fine in Go — VERIFIED, `code: { f: %F }` with `f: {n:"x"}`
is `valid` in both ports. It is the LIST SPREAD re-resolving its alias
after re-rooting. Both the failing and the passing case go into
[`use-cases/BUGS.md`](../../use-cases/BUGS.md) so the fixer can bisect
immediately.

**Container types take only LEAF types.** A recursive `%Type` —
`list.of: %Type` — is quadratic-to-exponential and, past a threshold,
non-terminating. VERIFIED, an eight-arm recursive `%Type` vetted
against a nested list type:

| nesting depth | TypeScript | Go |
|---|---|---|
| 4 | 0.18 s | 0.01 s |
| 6 | 0.28 s | 0.04 s |
| 7 | 0.49 s | 0.13 s |
| 8 | 1.14 s | 0.35 s |
| 9 | 2.27 s | 1.17 s |

and, worse, VERIFIED: a nine-arm recursive vocabulary INCLUDED BY BOTH
the schema and the data document does not terminate in **either** port
(both killed at 60 s). At five arms only TypeScript hangs and Go
answers in under a second — so the same construct is a G5 termination
failure at one size and an ADR-001 divergence at another. Making
`list.of`, `map.of`, `map.key` and `opt.of` accept only
`{k:"prim"|"ref"|"text"}` removes the blow-up entirely, and it matches
what every target language does anyway: you name the intermediate
type. VERIFIED with the capped vocabulary: the same double-include
evaluates in 0.17 s (TS) and 0.01 s (Go), the hash is byte-identical
in both ports, and — the unexpected bonus — **diagnostics stop
degrading with depth**. A bad node three levels down reports
`$.code.units.0.decls.0` with both a data site and a schema site,
where the recursive vocabulary reported `|:trial-nil [internal]` with
no sites at all.

**Two escapes, and only two, both counted.** `{k:"text", lang, text}`
carries verbatim target syntax at type, body or declaration position,
guarded by a check that `lang` matches its unit's `lang` — without
that guard a Go snippet silently lands in a `.ts` file. `x?: {}` is
the per-backend rider. Every `{k:"text"}` node and every check a
backend cannot enforce appears in the render report's `lossy[]`, and
`--strict` refuses when any exists. That counting is the only
mechanical pressure keeping the core from decaying into decoration —
the OpenAPI Generator failure mode.

The vocabulary, complete. It contains no backtick and no backslash,
because ts/src/std.ts holds it in a template literal and go/std.go in
a raw string that has no escape (ts/src/std.ts:13-14 states the rule).

```aon
# aontu:code --- THE OUTPUT VOCABULARY (G9).
#
# An aontu transform evaluates to an instance of this schema; the
# `render` verb turns the instance into bytes. Because it is an
# ordinary schema, a transform result is CHECKED by unification.
# `vet` takes FILE PATHS, not include expressions, so the vocabulary
# is reached through a one-line wrapper (VERIFIED against std/system,
# which is bundled the same way):
#
#   $ echo '@"aontu:code"' > code.aon
#   $ aontu vet code.aon result.aon
#
# `aontu vet @"aontu:code" result.aon` is NOT a command -- it fails with
# ENOENT on a file literally named `@"aontu:code"`.
#
# TWO ESCAPES. {k:"text", lang, text} carries verbatim target syntax;
# `x` is an open per-backend rider. A render report counts both.
#
# CONTAINER TYPES TAKE LEAVES ONLY. Anything deeper is a named alias
# declaration plus a {k:"ref"} -- which is what every target language
# makes you write anyway, and which keeps this schema's meet linear.
#
# IMPORTS ARE DERIVABLE: a renderer computes them from {k:"ref"}
# nodes; %Unit.imports is a manual supplement, merged, not a
# replacement.
#
# EXPERIMENTAL until the distribution layer can version it by
# canon-hash (the std/system marking, for the same reason).

%Name = string & re("^[A-Za-z_][A-Za-z0-9_]*$") & length(min(1) & max(255))

%Text = close({ k: "text", lang: string & length(min(1)), text: string })

%Doc = close({
  text: string
  deprecated?: close({ msg?: string, use?: string, since?: string })
})

%Check =
  close({ c: "min",    n: number, exclusive: *false | boolean })
| close({ c: "max",    n: number, exclusive: *false | boolean })
| close({ c: "re",     p: string })
| close({ c: "len",    min?: integer & min(0), max?: integer & min(0) })
| close({ c: "unique", key?: %Name })
| close({ c: "ne",     of: [&: string | number | boolean] })
| close({ c: "must",   note: string })

%Prim = close({ k: "prim",
  prim: "string"|"int"|"bigint"|"float"|"decimal"|"bool"|"null"|"any" })
%Ref =  close({ k: "ref", name: %Name, unit?: string })
%Leaf = %Prim | %Ref | %Text

%Type = %Leaf
| close({ k: "list", of: %Leaf })
| close({ k: "map",  key: %Leaf, of: %Leaf })
| close({ k: "opt",  of: %Leaf })
| close({ k: "union", of: [&: %Leaf] })
| close({ k: "lit",  of: [&: string | number | boolean | null] })

%Field = close({
  name: %Name
  type: %Type
  optional: *false | boolean
  doc?: %Doc
  default?: string | number | boolean | null
  check?: [&: %Check]
  rel?: close({ to: string, name?: string })
  x?: {}
})

%Member = close({ name: %Name, value?: string | number, doc?: %Doc, x?: {} })
%Param =  close({ name: %Name, type: %Type,
                 default?: string|number|boolean|null, x?: {} })
%Body =   %Text | close({ k: "abstract" })

%Record = close({ k: "record", name: %Name, doc?: %Doc, open: *false | boolean,
                 fields: [&: %Field], entity?: string,
                 check?: [&: %Check], x?: {} })
%Enum =   close({ k: "enum", name: %Name, doc?: %Doc,
                 members: [&: %Member], x?: {} })
%Alias =  close({ k: "alias", name: %Name, doc?: %Doc, type: %Type,
                 check?: [&: %Check], x?: {} })
%Const =  close({ k: "const", name: %Name, doc?: %Doc, type?: %Type,
                 value: string|number|boolean|null, x?: {} })
%Func =   close({ k: "func", name: %Name, doc?: %Doc, params: [&: %Param],
                 returns?: %Type, body: %Body, x?: {} })

%Decl = %Record | %Enum | %Alias | %Const | %Func | %Text

%Import = close({ from: string & length(min(1)), names?: [&: %Name],
                 alias?: %Name, x?: {} })

%Unit = close({
  path: string & length(min(1))
  lang: string & length(min(1))
  pkg?: string
  doc?: %Doc
  imports?: [&: %Import]
  decls: [&: %Decl]
  x?: {}
})

%Source = close({ path?: string, hash?: string & re("^aon1-[A-Za-z0-9_-]+$") })

code: type(close({ source?: %Source, units: [&: %Unit] }))
```

`%Source.hash` carries the `aon1-` pin of the model the result was
generated from — which
[`docs/design/ONTOLOGY.0.md`](../design/ONTOLOGY.0.md) already asks
every generated artifact to carry — and because it is a node of the
vocabulary it is *vetted*, not a renderer flag.

#### Five spelling rules the vocabulary imposes, each found by probe

These are the traps an author hits in the first hour. Each was
VERIFIED, and each is a spec row rather than a paragraph of advice.

1. **An atom kind in an IR value must be QUOTED.** `prim: string` is a
   `ScalarKindVal`, not the string `"string"`, and the whole document
   refuses at generation — VERIFIED,
   `t: {k: "prim", prim: string}` is `[aontu/mapval_no_gen]` at
   `$.t.prim`, while `prim: "string"` generates cleanly. The
   vocabulary's `%Prim` closes `prim` over eight string literals
   precisely so this is a *vet* error at the node rather than a
   generation failure at the root. One `ir-vet.tsv` row pins the
   refusal so the trap is caught once rather than rediscovered.
2. **`default?: _` is NOT part of the sanctioned idiom.** It looks
   irresistible — VERIFIED, it does recover `8080` from
   `*8080 | integer` and vanishes when there is no default, exploiting
   `BagVal.gen`'s rule that an optional key whose value is not
   generable is dropped. But it leaves an unsettled CONSTRAINT
   standing in the unified tree, which only `generate()` discards, so
   the transform document no longer vets: VERIFIED, adding it to
   worked example 1 turns `verdict: valid` into `empty [conflict]`
   with `"default"?:re("^[A-Z]{2}$")` visible in the data site. A
   default arrives through the reflection sidecar (Phase 5), which
   reports it as a settled scalar. Trading D1's in-place check for one
   recovered field is a bad trade, and the rule is stated here so
   nobody makes it twice.
3. **A `&:` spread carries the template's own scaffolding keys into
   every generated node.** VERIFIED: spreading
   `{ kind: "content", src: ... }` over `{n: "id"}` produces
   `{"kind":"content","n":"id","src":"..."}` — `n` is an unknown key
   on a closed node. The vocabulary does catch it: VERIFIED, a
   spread-generated bad node is refused `invalid` in both ports, and
   with the depth-capped vocabulary the finding carries both sites.
   But an author who reaches for `&:` to build declarations will fight
   `close()` on every node. `pick(pack(d, {f: t}), f)` — and, after
   Phase 3, `form` — produces clean nodes and is the idiom the
   worked examples use. The how-to says so with this example.
4. **`*[] | [&: %X]` is not the way to spell an empty-by-default
   list.** VERIFIED in both ports, it raises `pref_not_instance
   [compat]`: the empty list is not an instance of a one-or-more list
   spread (ADR-004). The vocabulary writes `imports?: [&: %Import]`
   instead — an optional key already means "absent is fine" — and the
   note goes in docs/reference-language.md, because every schema
   author reaching for the obvious spelling will hit it.
5. **`code:` is a CONVENTION of the vocabulary, not a magic key.**
   [ADR-010](../../ADR.md#adr-010--no-magic-keys-or-paths-the-tree-at-all-levels-is-user-space)
   is unconditional — "a plain, spellable key name never carries
   engine- or verb-assigned meaning, at any depth, the root
   included" — and its one grandfathered exception, `relations:`, was
   discharged the day before this document was drafted. So `render`
   defaults `--at` to `$`, not to `$.code`. The `code:` key means
   something only because `@"aontu:code"` declares it, in user space,
   opted into by inclusion — which is exactly the carve-out ADR-010
   makes for libraries. A document that nests its result elsewhere
   passes `--at` explicitly.

Killed from the vocabulary, with reasons. **`module`**: a unit IS the
compilation unit and grouping is `pkg` plus the directory implied by
`path`; a `module` node would duplicate the folder structure Jostraca
owns, which is the reimplementation D3 forbids. **A `comment` node
kind**: docs are a `doc?` rider on every named node, never a
positional node — the parser lexes `#` comments and discards them
(ts/src/lang.ts:245-255) and ts/src/patch.ts names the absent CST as
the blocker for format preservation, so doc text can only ever be
model data; and a positional comment node forces every renderer to
answer "does this attach to the next declaration or the previous
one", which is what makes every AST-printer's comment handling a bug
farm. **`statement`/`expression`/`block`**: the LCD trap in its purest
form; a function body is `{k:"text"}` or `{k:"abstract"}`, because a
transform cannot compute a body anyway — the only thing an aontu
document produces is data, so a body is always a string the transform
assembled, and modelling it as an expression tree buys nothing and
costs a per-target expression printer in two ports.

### 2. The rule layer — apply-templates, in the engine

D4(iii) sanctions an engine-driven recursive walk. Three things
already exist that make it small:

- `match()` IS the rule table: alternating pattern/result arguments,
  first match in argument order wins, patterns matched by
  unifiability only, no fallthrough, and a located error naming the
  patterns tried when nothing matches and there is no default. That
  is XSLT's template list with all four of its failures already
  designed out, shipped in G8 phase 2 and pinned by
  test/spec/gen-match.tsv. **This design adds no second rule engine
  and no second pattern language.**
- `filter()` selects by "already satisfies" — the same question
  `subsume` asks, answered locally.
- `pick(pack(d, {f: t}), f)` is the element-wise map, VERIFIED
  working in both ports.

What is missing is the DESCENT. `walk(data, tmpl)` produces a list of
`tmpl` instantiated once per node of `data` in pre-order, `data`
itself included, with `_` bound to the node. Then

```aon
join(walk($.model, match(_, <pattern>, <emit>, ..., <default>)), "\n")
```

is apply-templates, with the recursion in the engine and none in user
space, which is exactly what D4(iii) requires.

**The spelling above is superseded** by
[EMIT.0.md](../design/EMIT.0.md), which keeps every word of the
argument that follows and changes how a rule table is written: as a
list of `{match, body}` records, dispatched by `emit(select, table)`,
rather than as the argument positions of a `match` call. Read the
formula above as the shape of the thing, not as the syntax.

**The totality argument, and it must be real.** ts/src/walk.ts
describes its seen-set as "a termination guard, not an optimisation",
so the evaluated value graph does admit cycles. Reading it and its
neighbours, the reachable set is not a tree for four distinct reasons
and only one of them is a true cycle:

1. **Sharing.** `mergeEntities` (ts/src/unify.ts) installs ONE
   representative object at every position carrying the same `id()`.
   A visit-once walk over this terminates and is correct: it is a
   DAG, not a cycle.
2. **Off-peg back-edges.** ts/src/walk.ts deliberately follows
   `spread.cj`, `superpeg`, `musts[].v`, `primary` and `secondary`.
   `superpeg` is a preference's derived yardstick;
   `primary`/`secondary` are a failure's operands, which are values
   from elsewhere in the tree. These are DIAGNOSTIC edges, not
   structure. **`walk()` follows none of them**; it descends map and
   list `peg` only, which is what `walkBagVals` (ts/src/utility.ts)
   already does.
3. **Links are not edges.** ts/src/val/ReferFuncVal.ts is explicit —
   "the field's own value stays the address string: a LINK, not an
   embedding" — so `refer`/`rel` create no structural edge. The
   entity graph they induce is explicitly permitted to be cyclic
   (ts/src/reach.ts) and acyclicity is a report-layer verdict. A walk
   that dereferenced links would be a graph traversal needing a
   visited set and a declared visit order; a walk that descends
   children is a fold over a finite tree. They must stay separate,
   and `walk()` does not dereference.
4. **A true cycle in `peg`**, and it is the only one:
   `a: id(x) & { b: id(x) & { c: 1 } }` makes `res.peg.a.peg.b ===
   res.peg.a`. VERIFIED, both ports die:

   ```
   TS: aontu: unexpected error: Maximum call stack size exceeded
   GO: runtime: goroutine stack exceeds 1000000000-byte limit
       fatal error: stack overflow          (unrecoverable)
   ```

   This is a [G5](g5-trust-contract.md) violation on its own terms —
   "my budget ran out", "your model is cyclic" and "your model is
   incomplete" are distinct located codes, and a host stack overflow
   is none of them — and an ADR-001 hazard, a throw in one port and
   an uncatchable fatal in the other. It is fixed **at the merge**,
   as `id_ancestor` (class `conflict`), in [Phase 0](#phase-0--the-four-gating-defects-s).

With (4) closed and (2)/(3) refused by construction, the totality
argument is one sentence: *the structure `walk` descends is a finite
DAG, and a visit-once pre-order descent over a finite DAG halts.* A
`walk_budget` counter charged against `trust.budget.depth` is a
backstop, not the argument.

If (4) is ever reachable again, `walk` must **REFUSE on revisit**
(`walk_cycle`, class `conflict`), never skip: a silently truncated
document is worse for a code generator than a crash.

**`onNoMatch` is `fail`.** XSLT's built-in rule copies the string
value of unhandled nodes into the result, which for code output means
model data landing silently in the middle of a source file. That is
the single worst default in the prior art and it is refused.

**Provenance is a first-class output.** The render report records
(node path, rule index) for every emitted declaration. That one map
gives rule coverage (D5 vi: which parts of the model no output
consumed — dead model; which output consumed a part no rule matched —
a silent hole), a shadowing report, an explain-this-line command, and
source maps from generated code back to the model. It is what turns
XSLT's most durable criticism, action at a distance, into a feature,
and retrofitting it is what XSLT never managed. Build it from the
start.

**But a trace is not the whole answer, and saying so matters.** A
trace tells you what a particular run emitted; XSLT's criticism is
that you cannot read a rule set and know what it emits, which is a
READING problem. The static half is available here and is not
available in XSLT: because each rule's `emit` is a value and the
output vocabulary is a schema, **every rule's result is checked
against the vocabulary node it claims to produce BEFORE any input is
walked.** A rule that can never emit a well-formed declaration is a
finding at the rule, not a surprise on the third file of a run, and a
rule no input can reach is reported as unreachable in the same pass.
That is the static check XSLT has no way to express, it costs nothing
beyond a `vet` of each rule's arm, and it is a named deliverable of
Phase 6 rather than a property claimed for the trace.

**Modes (D5 iii).** Several outputs traverse one model independently,
which is exactly what XSLT modes are for. A mode here needs no new
mechanism: it is one more argument to `walk` naming which rule table
to apply, and the rule tables are ordinary `match` calls held under
distinct keys. Cheap, and it is the difference between "one giant
match with a `target` discriminator in every pattern" and N readable
tables.

### 3. The renderer and the language profiles

`render(value, profile) -> RenderReport` is a **pure, total fold from
`generate()` output plus a data profile to a byte string.** It never
touches the Val tree, never reads or writes a file, never shells out,
never sorts, and never iterates a map.

**The fold is total by inspection, and needs no counter of its own.**
`generate()` has already produced a finite JSON-shaped tree by the time
the renderer runs — the id() cycle of [§2](#2-the-rule-layer--apply-templates-in-the-engine)
cannot survive it, because generation is where it dies today. So there
is no `render_depth` error code and no render-side budget: registering
a code whose branch no input can reach would break ADR-002's set
equality between `errcodes.tsv` and both engines' tables, and a knob
one port's options struct cannot express would break ADR-001 at the
interface before a line was written. The cycle is refused upstream, at
the merge, where it belongs.

**It consumes `generate()` output, not the Val tree.** This is the
decision that makes ADR-001 tractable: Go's embedding surface cannot
read a single child of a `MapVal` — the exported `Val` interface is
`Canon`/`Gen`/`Unify`/`Dc`/`Nil`, and `MapVal`/`ListVal`/`ScalarVal`
have no exported fields — so a Val-tree renderer would be
TypeScript-only on the day it landed, in the exact layer the code
generation story depends on. The cost is stated: `generate()` destroys
provenance, so a render finding carries a `$.dotted.path` into the IR
rather than a source site. That is the addressing every other report
in the repository uses.

**Indentation is STRUCTURAL. The renderer owns the prefix.** Templates
never carry leading whitespace that means indentation. This is the one
XSLT failure it would be easiest to repeat and the algorithm is small:

- `nest(body)` renders `body` at `depth + 1` and produces no bytes.
- `line(body)` concatenates its inline pieces into `s`, and appends
  `pad + s` right-trimmed of space and tab, where `pad` is
  `indent.unit` repeated `indent.width x depth`.
- A blank line is zero bytes plus its terminator — never padding.
- **An inline piece may not contain U+000A, U+000D, U+2028 or
  U+2029.** This single rule is what makes the fold total and the
  output stable: a line is a line, and the check is local.
- A block-level `raw` node is the only node that may carry a line
  terminator. Its components each get the depth prefix and keep
  their own interior shape, so a multi-line escape nested three
  levels deep gets the depth-3 prefix on every line with its own
  relative indentation preserved on top. `reindent: false` emits at
  column 0 verbatim, for text where column 0 is contractual — a
  heredoc body, a C preprocessor directive, a fenced block inside a
  doc comment.
- **The renderer does not strip a raw's common leading indentation.**
  Guessing which of a template's leading whitespace is structural is
  precisely the XSLT mistake, and no rule is right for both a Python
  block and a Markdown fence.

**A profile is data, and only data.** The test, stated in the profile
document's own header so a reviewer can point at a rule: *a field
belongs in the profile only if the renderer applies it WITHOUT LOOKING
AT THE SHAPE OF ANY NODE.* Anything else is a lowering and lives in
the transform. This is the line that stops a profile accumulating
`if_optional_prefix` and `interface_embed_style` until it is a
badly-typed programming language, which is how OpenAPI Generator's
mustache templates got where they are.

A profile declares: `indent` (unit and width, width bounded 0..16 so
no port can differ on a repeat count); comment forms (line, block,
doc, each `{open?, prefix?, close?}`); string quoting and an escape
table **keyed by decimal code point** — a literal control character
cannot be an aontu key (`aontu/unprintable`), and a character-keyed
table would make replacement ORDER significant, where a per-code-point
lookup has no order at all; identifier character classes drawn from a
closed named set (no regular expressions: docs/trust.md already names
pattern matching as the one subsystem with a stated RE2-vs-RegExp
complexity divergence, and putting a regex on the hot path of every
emitted identifier would import that divergence into the renderer's
core); a reserved-word list matched by exact case-sensitive equality
(Go's `Type` is not reserved even though `type` is); a per-role naming
convention; an acronym set; and a primitive type map with
`open`/`close` per container form plus `prec`/`child_prec` for
parenthesisation.

**Case conversion is ASCII-only and does not call `upper()`/`lower()`.**
Those builtins are full Unicode — `String.prototype.toUpperCase` in
TypeScript, `cases.Upper(language.Und)` from `golang.org/x/text` in
Go. They agree today, but they are two independently versioned Unicode
tables, and an identifier's spelling must not depend on which minor
release of `x/text` a consumer pinned. Any code point at or above
U+0080 is carried into the current word verbatim, never split, never
case-converted. That rule is the parity guard.

**The acronym set is per-profile, and the reason is a real bug this
design hit.** With one shared acronym list, `ledgerId` renders as
`ledgerID` in TypeScript — correct for a Go field, wrong for a
TypeScript one. Go uppercases trailing acronyms; TypeScript does not.
The set is a profile field, empty for TypeScript and SQL.

**`prec`/`child_prec` are needed, and TypeScript proves it.** Atoms
have `prec: 9`; a form renders `open + inner + close`, wrapping
`inner` in parens when the inner expression's `prec` is strictly less
than this form's `child_prec`. TypeScript's `opt` is `" | null"` at
`prec: 1` and its `list` has `child_prec: 2`, so a list of nullable
strings renders `(string | null)[]` and not the wrong
`string | null[]`. Go needs no parens in a type expression, which is
why every Go `child_prec` is 0.

**The renderer NEVER invokes a formatter.** Not optionally, not behind
a flag, not "if available". Four reasons, each sufficient. (i) G5
hermeticity: a shelled-out formatter makes output depend on `PATH` and
a third-party version — `gofmt`'s output has changed between Go
releases — and it would make an `aon1`-stamped artifact a lie. (ii)
ADR-001: the TypeScript suite would need a Go toolchain to render a Go
target. (iii) ADR-002: "formatter absent", "exited non-zero",
"rewrote into something that no longer round-trips" and "timed out"
are four uncoverable branches per port. (iv) The shared suite cannot
express a dependency on a binary being on the runner's PATH.

**What that costs, plainly.** The renderer will not column-align
consecutive struct field types the way `gofmt` does, will not align
trailing comments, will not sort or group imports, and **has no
line-width concept at all**. That last is a decision: a
Wadler/Prettier `group`/`softline` document IR is refused, because
every group decision is a place two implementations can differ with no
cheap way to pin the difference, and because it makes a spec row's
expected bytes depend on a width setting three levels up. Line
breaking is the model's job, expressed as `line` and `nest`. The
hand-off is a pipeline step the user runs deliberately:

```
aontu render --profile go --stdout model.aon | gofmt
aontu render --profile go --out ./gen model.aon && gofmt -w ./gen
```

and the CI story is `aontu render --check`, which compares rendered
bytes against what is on disk and exits 1 on drift. One non-gating
exception, outside the contract: a per-port test may run `gofmt -l`
over a `.go` fixture golden when a toolchain is present and skip
otherwise — a canary, never an assertion.

**Everywhere the two ports could disagree, and the pin for each:**

| site | mechanism | pin |
|---|---|---|
| map iteration | **forbidden**; lookups only. `generate()` gives TypeScript code-point-sorted keys and Go a deliberately randomised range order, so a single `range` over a map is a guaranteed divergence. Every ordered thing is a LIST. | code review plus `grep -n 'range ' go/render.go` showing slices only |
| string escaping | one pass, per code point, table keyed by decimal code point | render rows: tab, quote, backslash, control, non-ASCII, astral, lone surrogate |
| numbers | delegated to `exactJSON` / `encoding/json`; **no second number formatter** | already pinned by every `gens` row in the suite |
| line endings | LF only. There is no `eol` profile field. | render rows; and a TSV cell cannot hold a carriage return at all |
| case conversion | ASCII-only, own tables | 6 rows including two non-ASCII pass-through |
| reserved words | exact case-sensitive equality on the converted name | 2 rows (`type` -> `type_`, `Type` -> `Type`) |
| sorting | **the renderer sorts nothing** — not imports, not fields, not keys. Import order is the transform's job. | removes the whole "is the sort stable the same way in both ports" question |
| profile values | one bundled source text, both ports | a `hash` row per profile |

### 4. The language additions (D4)

**`join(coll, sep?)` — the fold. BUILD.** Arity `[1,2]`; the default
separator is `""`, so `join(coll)` is concatenation and no `concat` is
needed, and `join(coll, "\n")` is lines so no `lines` is needed.
`split`/`words` is the inverse — an input-parsing operation with no
generation use — and is refused. **One builtin, not a family.**

It folds with `+` seeded with `""`, exactly as `sum` folds with `add`
seeded with `0`, so it inherits `+`'s number-to-text rule for free and
the language keeps exactly one answer to "how does a number become
text". Members are validated BEFORE folding, because `+` with a string
left residuates rather than refuses on a container or a null —
VERIFIED, `"" + {b:1}` and `"x" + null` both reach generation as
`mapval_no_gen` — so folding blindly would turn a bad member into a
useless late error. A settled non-text member is `join_member`, class
`conflict`. An UNSETTLED member — an unresolved kind, a stable
residue — is not a join failure at all: the call stays residual and
`mapval_no_gen` (class `incomplete`) fires at generation, exactly as
docs/trust.md requires ("a stable residue ... is ordinary
incompleteness"). Order is source order for a list and
`cmpCodePoint`-sorted key order for a map. Empty is `""` —
concatenation's identity, the exact parallel of `sum([]) == 0`.

**`form(data, tmpl)` — the map. BUILD.** One element per child of
`data`, being `tmpl` cloned per destination with `_` bound to the
source child. It REPLACES; it does not meet.

`each` is not a mistake and is not renamed. `each($.ports, integer)`
is a schema statement and is monotone — more information about the
template narrows the children — so it is a lattice citizen, and a
constructor is not. The language already draws this line twice:
`min`/`max` (bounds) versus `least`/`greatest` (aggregates), and
`filter` (select by unifiability) versus `match` (choose a result).
`each` is the bound; `form` is the construction. `each` also carries
the source child's identity (its clone keeps the entity), where
`form`'s element IS the template.

`form` earns its place on **order**, not on expressiveness.
`pick(pack(d, {f: t}), f)` already maps, VERIFIED in both ports — but
it goes through a map, so it re-sorts to code-point order, and it
refuses a list of records outright (`pack_key`). VERIFIED on a real
document, [`use-cases/01-service-catalog/catalog.aon`](../../use-cases/01-service-catalog/catalog.aon)
declares `payments, ledger, risk` and the generated units come out
`ledger, payments, risk`. For a struct's fields, a SQL DDL's columns
or a file's imports, silently alphabetising is wrong output.

`form` reuses `each`'s exported ordering helper, so the two can never
disagree about order. It joins `boundArgStart` in both ports —
ts/src/val/PlaceVal.ts:86 and go/place.go — and **forgetting that is
the silent failure mode**: every existing test passes and the new
combinator captures an outer generator's hole, which is
[BUGS.md](../../use-cases/BUGS.md) §34 exactly. The nesting rows are
therefore not optional.

**Hidden and unfilled-optional children are SKIPPED by `join` and
`form`, and by `each` and `pick` too.** VERIFIED that today they are
not: `m: {a: 1, b?: 2, c: hide(3)}` gives `each($.m)` = `[1,2,3]` in
both ports while the map generates `{"a":1,"b":2}`. A hidden value
reaching generated source text is a disclosure, and an unfilled
optional is not a value. Changing it is observable behaviour on
existing verbs and therefore lands in Phase 0 with rows pinning the
new behaviour on all four.

**String interpolation — `${...}` inside BACKTICK strings only.
BUILD, in the last phase, and the cost is not small.** D4(ii)
sanctions it and this document designs it rather than arguing it down;
what follows is the design, with the costs on the record.

- **Backticks only.** Single and double quotes stay inert. VERIFIED
  today, every candidate delimiter is live text in every quote
  style: `"cost $x and {y}"` is `"cost $x and {y}"` and
  `` `t ${a}` `` is `"t ${a}"`. Restricting to backticks halves the
  blast radius and gives authors a deliberate opt-in quote.
  `$$...$$` is refused: it is Jostraca's fragment macro, and two
  systems in one pipeline sharing a delimiter is a debugging trap.
- **`$${` escapes a literal `${`**, XSLT's `{{` doubling precedent,
  and non-recursive: braces are not re-scanned inside an
  interpolation.
- **It is PARSE-TIME SUGAR and reaches no Val.** `` `a${$.b}c` ``
  desugars to `"a" + $.b + "c"`. The precedent is decisive and
  already in the repository: `|>` was "pure parse-time sugar that
  never reaches a Val" (G8 phase 4, since removed by ADR-018 -- the
  MECHANISM precedent stands even though the operator is gone). No
  new Val kind, no dispatch arm, no canon spelling.
- **Canon prints the CONCATENATION**, `"a" + $.b + "c"`. This is
  forced, not chosen: canon must round-trip and converge, the `+`
  form already round-trips, and re-emitting `${...}` would require
  canon to decide which of `+`'s operands were originally
  interpolated — information the tree does not carry, because there
  is no CST. **The hash form and `hcanon` therefore see no change
  whatsoever**, which is the best property of this design.
- **The costs, stated.** (1) It is the FIRST change to string lexing
  in either port: ts/src/lang.ts calls `jsonic.options(...)` five
  times and sets comment, number, text and hint — never `string`;
  go/lang.go sets ErrMsg, Comment, List, Text, Number, Value, Map —
  no String key. Both inherit backtick multi-line and escape
  handling from @tabnas defaults unchanged, which is the one place a
  @tabnas bump in one port can silently diverge from the other.
  AGENTS.md already warns that the spread and optional-key rules
  depend on parser internals. (2) It is a **breaking change**: a
  document with a literal `${` in a backtick string changes meaning.
  It ships behind a language-version gate for one minor line, with
  `vet` reporting a `compat`-class finding at every backtick string
  containing `${`, then flips. (3) It **regresses `patch`**: the only
  port-neutral implementation sub-parses each `${...}` at parse time,
  and the Vals that come back carry synthetic sites, so
  `spanHolds` (ts/src/patch.ts) — which verifies recorded source
  text before writing a byte — must learn to REFUSE an interpolated
  span explicitly rather than silently degrading to
  append-with-a-warning. That refusal is a named deliverable of the
  phase, not a discovered surprise.

Because backticks are already multi-line and already process escapes
in both ports, and because only two spec rows anywhere touch backticks
and both are single-line, **multi-line backtick `gens`/`canon` rows go
into the shared suite in Phase 0**, whatever happens to interpolation.
They cost a handful of rows and they protect a feature this whole
capability already depends on.

### 5. The Jostraca seam (D3, D7)

**The dependency is exact-pinned in both ports.** `"jostraca":
"0.34.0"` in ts/package.json and `github.com/jostraca/jostraca/go
v0.34.0` in go/go.mod. Exact, no range operator, for the reason
AGENTS.md already gives for the `@tabnas` pins: the spec suite will
assert *through* Jostraca's public API — the `existing.txt` policy
defaults, the `Inject` marker pair, the merge conflict marker text,
the `.jostraca/generated/` baseline layout — and none of that is
versioned API. `^0.34.0` would let a Jostraca patch turn an aontu spec
row red with no aontu commit.

**A pin-equality guard lands with it, and covers `@tabnas` too.**
Nothing today checks that the two ports' shared pins agree. They
mostly do, by discipline — but VERIFIED they do not entirely:
`@tabnas/json` is `v0.5.2` in go/go.mod and resolves to `0.5.7` in the
TypeScript lockfile, and `@tabnas/debug` has no Go counterpart. The
test therefore asserts equality over an explicit SHARED-PIN SET plus a
declared exclusion list, and asserts the exclusion list is exhaustive
so a new one-sided dependency fails it. One copy in each port so
neither can be deleted quietly.

**The bridge is the only Jostraca importer, and it is isolated.** In
TypeScript the `require('jostraca')` happens inside the function body,
not at module top level, so `require('aontu')` does not pull the
generator. In Go the bridge is its own package —
`github.com/aontu-lang/aontu/go/emit` — so a consumer embedding aontu
for unification alone never links Jostraca. **The LSP may never reach
it**, asserted mechanically by walking the require graph of
`dist/lsp-server.js` and by `go list -deps` on go/lsp: an editor
plugin must never be able to write files.

**Install weight is a blocking cross-repository item.** Jostraca's own
runtime dependencies are zero, but it imports `memfs` unconditionally
at module load for a capability used only when `mem: true`. VERIFIED
by `du`: that closure is 15 MB (`@jsonjoy.com` alone is 14 MB) against
1.4 MB for aontu's entire `@tabnas` parser stack. That is an 11x
install growth for a capability a normal render never uses, and it is
also a parity absurdity — Jostraca's Go port ships its own `MemFS`
backed by a string-keyed map and needs no dependency at all. Lazy
loading it, and moving `shape` from `peerDependencies` (where it is
today, while four modules import it unconditionally) into
`dependencies`, are the two blocking asks on the other repository.

**What the bridge does, and what it does not.** It receives the render
report — N units, each a path and a byte string — and builds ONE
Jostraca `Project` containing all N as folders and files, then makes
ONE `generate()` call. aontu contributes no file writing, no diff, no
merge, no protected-region format. `agentsMdSplice` stays what it is —
a 20-line marker replacement for aontu's own AGENTS.md stanza —
and is explicitly NOT generalised into a second protected-region
mechanism that would put aontu and Jostraca in competition over the
same file. `Inject` is the sanctioned spelling.

`Content` templates unconditionally in Jostraca, so a `$$path$$`
sequence appearing in aontu-generated bytes would be silently
substituted. The bridge therefore passes `raw: true` (a small addition
on the Jostraca side); until it exists, the bridge passes an empty
model. Without this, "aontu owns the bytes" is not true — Jostraca
gets the last edit, invisibly.

**Dry run needs no new Jostraca feature.** `mem: true` plus
`result.vol()` runs the same write path a real run does, which a
bespoke dry-run reporter would not.

### 6. The manifest (D5 iv, D7)

One document names the N outputs, and it is an aontu document, so it
is vettable like anything else:

```aon
@"aontu:code"
@"./model.aon"

outputs: [
  { target: "typescript", at: "$.schema",  transform: $.xf.ts,   out: "ts/domain.ts" }
  { target: "go",         at: "$.schema",  transform: $.xf.go,   out: "go/domain.go", profile: {pkg: "domain"} }
  { target: "sql",        at: "$.schema",  transform: $.xf.sql,  out: "sql/schema.sql" }
  { target: "openapi",    at: "$.api",     transform: $.xf.oas,  out: "openapi.yaml" }
]
```

`at` is DOCUMENTATION (D6): it is what the coverage report measures
intent against, and nothing refuses a read outside it.

**Pinning (D5 ii): `hash --at` is not needed and will not be built.**
`aontu hash` hashes the whole document, so a docs-only edit moves the
pin even when a slice's canon is byte-identical. Under D7 that is the
right answer, not a defect: one run regenerates every output from one
model, so every generated file carries the SAME whole-model pin, and
drift is exactly "some file's pin is not the current model hash" — one
comparison, no per-slice bookkeeping.

**Incremental regeneration is refused (D5 v).** Everything regenerates
on every run. There is no dependency graph, no per-slice hash, no
staleness cache — and under D6 there could not be a sound one anyway,
because a transform may read anything. The cost at scale is one full
model evaluation plus N transform folds per run; the model is
evaluated ONCE and shared by every transform (D7), so the cost that
grows with N is the fold, which is linear in output size. For the
sizes in `use-cases/` this is milliseconds. If a model ever reaches
the point where a full run is intolerable, the honest fix is a faster
evaluator, not a cache that D6 makes unsound.

**Coverage cuts both ways (D5 vi), and it is free from provenance.**
The report names (a) model paths no output consumed — dead model —
and (b) output declarations produced by no rule — a silent hole. Both
fall out of the (node path, rule index) trace with no extra
machinery.

**One slice may feed several targets and one target may draw on
several slices (D5 vii).** Nothing in the manifest assumes a
partition, and the coverage report is computed as a set union over all
outputs, not per-output.

**Partial failure: the whole run is abandoned, and nothing is
written.** VERDICT and reason. Jostraca receives one `Project` and one
`generate()` call (D7), so there is no half-written tree to reason
about — but that is a mechanism, not a justification. The
justification is that the N outputs are N views of ONE model and are
only meaningful together: a Go server written from the model and a
TypeScript client left at the previous revision is precisely the drift
this whole capability exists to remove, and it is worse than no output
because it looks like success. So: render every output, collect every
finding, report all of them, and write nothing unless all N rendered.
One exit code, one report. This also makes `--check` meaningful — a
run either agrees with the tree on disk or does not.

---

## Worked examples

All four are real: the transforms run against real documents under
[`use-cases/`](../../use-cases/), the IR was produced by both CLIs and
diffed, and the bytes below came out of a reference renderer
implementing the algorithm in [§3](#3-the-renderer-and-the-language-profiles).

### Worked example 1

**One transform, over the real
[`use-cases/10-data-model/domain.aon`](../../use-cases/10-data-model/domain.aon),
read across an `@include`, to TypeScript.** This is nine lines of
actual transform, and every construct in it exists today.

```aon
# xf-domain.aon
@"./domain.aon"

step: hide(pack($.schema, { d: {
  k: "record"
  name: key(2)
  fields: pick(pack(_, { f: {
    name: key(2)
    type: match(_,
      integer,    { k: "prim", prim: "int" },
      biginteger, { k: "prim", prim: "bigint" },
      string,     { k: "prim", prim: "string" },
      boolean,    { k: "prim", prim: "bool" },
      [],         { k: "list", of: { k: "prim", prim: "any" } },
      { k: "prim", prim: "any" })
  }}), f)
}}))

code: { units: [ { path: "domain.ts", lang: "typescript", decls: pick($.step, d) } ] }
```

VERIFIED, the IR is byte-identical from both engines:

```
$ diff <(node ts/bin/aontu.js get '$.code' xf-domain.aon -c) \
       <(go run ./cmd/aontu   get '$.code' xf-domain.aon -c)
   (no output)
```

and VERIFIED, the transform document itself vets against the
vocabulary — D1's payoff, in place, in both ports:

```
$ aontu vet std-code.aon xf-domain.aon        -> verdict: valid
```

The rendered bytes, exactly (535 bytes, LF, final newline):

```typescript
export interface Customer {
  country: string;
  creditLimitCents: number;
  currency: string;
  email: string;
  id: string;
  ledgerId: number;
  name: string;
}

export interface Invoice {
  currency: string;
  grossCents: number;
  id: string;
  netCents: number;
  orderId: string;
  taxCents: number;
}

export interface Order {
  customerId: string;
  id: string;
  lines: unknown[];
  placed: string;
  status: string;
}

export interface OrderLine {
  amountCents: number;
  qty: number;
  sku: string;
  unitCents: number;
}
```

**Read the losses, because they are the honest state of the art.**
`email` should be `email?`, and is not, because optionality is
invisible to `pack` (Current state). `ledgerId` should be
`number | bigint`, and is `number`, because `match` selects one arm of
`integer & min(1) | biginteger & min(1)` and there is no `members()`.
`lines` should be `OrderLine[]` and is `unknown[]`. Field order is
alphabetical, not authored. Every `re()`, `min()`, `max()` and
`length()` in the source is gone. Each of those is a specific,
addressable gap and each is closed by a specific, named thing below —
none of them by "more transform".

### Worked example 2

**The same model, three targets, one run (D5, D7).** The transform
gains the two facts the record schema cannot state — stated once, as
data, which is what an author does before the reflection sidecar
lands — and names three units.

```aon
# xf-order.aon --- ONE model, THREE outputs, each over part of the model.
@"./domain.aon"

rec: hide(pack($.schema, { d: {
  k: "record"
  name: key(2)
  fields: pick(pack(_, { f: {
    name: key(2)
    optional: match(key(2), "email", true, "creditLimitCents", true, false)
    type: match(_,
      integer,    { k: "prim", prim: "int" },
      biginteger, { k: "prim", prim: "bigint" },
      string,     { k: "prim", prim: "string" },
      boolean,    { k: "prim", prim: "bool" },
      [],         { k: "list", of: { k: "ref", name: "OrderLine" } },
      { k: "prim", prim: "any" })
  }}), f)
}}))

decls: hide(pick($.rec, d))

code: { units: [
  { path: "ts/domain.ts",   lang: "typescript", decls: $.decls }
  { path: "go/domain.go",   lang: "go", pkg: "domain", decls: $.decls }
  { path: "sql/schema.sql", lang: "sql", decls: $.decls }
]}
```

VERIFIED byte-identical from both engines. The three rendered units,
exactly. `ts/domain.ts` (`Customer` only, the rest as above):

```typescript
export interface Customer {
  country: string;
  creditLimitCents?: number;
  currency: string;
  email?: string;
  id: string;
  ledgerId: number;
  name: string;
}
```

`go/domain.go`:

```go
package domain

type Customer struct {
	Country string `json:"country"`
	CreditLimitCents *int64 `json:"creditLimitCents,omitempty"`
	Currency string `json:"currency"`
	Email *string `json:"email,omitempty"`
	ID string `json:"id"`
	LedgerID int64 `json:"ledgerId"`
	Name string `json:"name"`
}
```

Three things to read off it. `Email` is `*string` with `omitempty`
while TypeScript got `email?` — presence and nullability are the same
fact here and would be two different facts if the model said
`email: string | null`, which is why the vocabulary keeps
`%Field.optional` and `{k:"opt"}` separate. `ID` and `LedgerID`
carry the acronym override where TypeScript's `ledgerId` does not,
because the acronym set is per-profile. And **the types are not
column-aligned**: `gofmt` would align them, this renderer does not,
and that is the stated cost of refusing a formatter subprocess.

`sql/schema.sql` (667 bytes), and this one found a real defect:

```sql
CREATE TABLE customer (
  country TEXT NOT NULL,
  credit_limit_cents BIGINT,
  currency TEXT NOT NULL,
  email TEXT,
  id TEXT NOT NULL,
  ledger_id BIGINT NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE "order" (
  customer_id TEXT NOT NULL,
  id TEXT NOT NULL,
  lines order_line[] NOT NULL,
  placed TEXT NOT NULL,
  status TEXT NOT NULL
);
```

The first render of this emitted `CREATE TABLE order (` — a syntax
error in every SQL dialect, produced silently, from a valid model, by
a correct-looking transform. `Order` is a record in the model and
`order` is a reserved word in the target. **This is the whole
argument for `ir_name` and for the reserved-word list being profile
data**, and the corrected line above is what the rule produces. It
also produces a loss entry, because the rename is a real loss —
hand-written consumer code referring to `order` will not compile
against `"order"`:

```
lossy: $.code.units.2.decls.2  ir_name: "Order" is reserved in sql; quoted as "order"
lossy: $.code.units.2.decls.2.fields.2  union-unsupported: SQL has no list-of-record type
```

The second entry is the other honest loss: `lines order_line[]` is
not what any real schema wants. SQL falls off the core here, and the
report says so rather than the renderer inventing a join table.

### Worked example 3

**A different real document, a different shape: one output FILE PER
ENTITY, from
[`use-cases/01-service-catalog/`](../../use-cases/01-service-catalog/).**

```aon
# xf-k8s.aon
@"./system.aon"

svc: hide(pack($.catalog.domains.payments.services, { u: {
  path:  `k8s/` + key(2) + `.yaml`
  lang:  "yaml"
  decls: [ { k: "record", name: key(4), open: false, fields: [
    { name: "tier",  type: {k:"prim", prim:"int"} }
    { name: "owner", type: {k:"prim", prim:"string"} }
  ]} ]
}}))

code: { units: pick($.svc, u) }
```

VERIFIED byte-identical from both engines, and it produces three
units:

```
k8s/ledger.yaml    ledger
k8s/payments.yaml  payments
k8s/risk.yaml      risk
```

**Two findings, both from this one small transform.** First, the
order: `catalog.aon` declares `payments` (line 11), `ledger` (17),
`risk` (22), and the generated units come out `ledger, payments,
risk`. That is the code-point sort, on a real document, changing the
order of generated files. Second, and worse, the FIRST version of
this transform wrote `name: key(2)` inside the `decls` list, and every
unit came out with `name: "decls"` — silently, with no error, in both
ports. `key(n)` counts UP: `key(0)` is the node's own key, and inside
a template nested one map deeper the source key has moved. It is
documented (docs/reference-language.md:1306) and it is still the
single easiest thing to get wrong when writing a transform. Both go in
the risk table; the first is what `form` fixes.

### Worked example 4

**What the vocabulary refuses, and where.** This is D1 doing its job,
in place, on the transform of worked example 1 with a single character
changed (`prim: "int"` to `prim: "nope"`):

```
$ aontu vet std-code.aon xf-domain-bad.aon
verdict: invalid

$.code.units.0.decls.0: empty [conflict]
  [aontu/empty]: Cannot unify values at path $.code.units.0.decls.0
  data:   xf-domain-bad.aon:3:32 ({"fields":[{"name":"country","type":{"k":"prim",
          "prim":"string"}},{"name":"creditLimitCents","type":{"k":"prim","prim":
          "nope"}},...],"k":"record","name":"Customer"})
  schema: std-code.aon:9:8 ({"doc"?:string,"fields":[&:$.%Field],"k":"record",
          "name":re("^[A-Za-z_][A-Za-z0-9_]*$"),"open":*false|boolean}|
          {"k":"text","lang":string,"text":string})
$.code.units.0.decls.1: empty [conflict]
  ...
```

Exit 1, both ports, with a site in the transform's own source. XSLT
could only validate the result against the output *schema*, after the
fact; here the same unification engine that built the result checks
it, at the node.

**And what it does NOT do well, stated because it will be the first
complaint.** When *every* arm of `%Decl` fails, the finding is one
`empty [conflict]` whose `schema:` field prints all six arms. When one
arm survives — the `k` matched and something inside it is wrong —
diagnostics are precise and path-anchored. Three mitigations, in
order: the RENDERER is the primary gate and refuses with a precise
`ir_*` code at the node; the per-kind aliases are public so an author
debugging one node vets it against `%Record` alone; and an
engine-level improvement is proposed in
[Open questions](#open-questions) — when all arms of a disjunction of
closed maps fail and exactly one arm's discriminator key matched,
report inside that arm. That last is diagnostics-only, changes no
semantics, and would improve every discriminated-union schema in the
language.

---

## Boundary: what we will not do

The [G8 boundary](g8-generation.md#boundary-what-we-will-not-do)
stands except where D4 opens it. Restated with what this document
adds:

- **No user-defined functions (`def()`)** — unchanged from G8. A
  transform is a template plus combinators; recursion in user space
  is what D4(iii) puts in the engine precisely so that it stays out
  of user space.
- **No comprehension keywords (`for`/`if`/`in`)** — unchanged.
- **No computed-key syntax** — unchanged; `pack` is that job.
- **No new operator tokens** — `-` `*` `/` `%` stay reserved.
- **No lazy-evaluation redesign** — unchanged.
- **No second rule engine, no second pattern language.** `match()`
  IS the rule table and unification IS the match test. A stylesheet
  with its own priority scheme, its own conflict resolution and its
  own patterns is the thing XSLT 3.0 retracted; it will not be
  imported.
- **No priority numbers and no import precedence.** Ordered
  first-match-wins, which is `match`'s existing, spec-pinned rule.
- **`onNoMatch` is never `copy`.** XSLT's built-in text-copy rule is
  refused: silently emitting model data into a source file is the
  worst available default.
- **No line-width concept, and no Wadler/Prettier document IR.** Line
  breaking is the model's job. Every `group`/`softline` decision is a
  TS/Go divergence site with no cheap pin, and it makes a spec row's
  bytes depend on a width three levels up. If it is ever wanted it
  needs its own phase and its own spec file; it must not arrive
  incrementally.
- **No formatter subprocess.** Not behind a flag, not "if available".
  Hermeticity (G5), parity (ADR-001) and coverage (ADR-002) each
  refuse it independently.
- **No heuristic quoting.** The IR node says which quoting form it
  wants; asking for a raw form on a string that cannot take one is a
  refusal, never a silent fallback. Heuristics are nondeterminism
  dressed as convenience.
- **No host-registered render extensions** — no handler table, no
  callback. A TypeScript handler has no Go twin (ADR-001), a host
  callback is neither deterministic nor hermetic (G5), and a handler
  that runs during rendering is a branch the shared suite cannot
  reach and ADR-002 cannot cover. The escape is `{k:"text"}` or a new
  vocabulary node landed in both ports with rows.
- **No map iteration in the renderer, and no sorting.** Ordered
  things are lists. Import ordering is the transform's job.
- **No re-implementation of anything Jostraca owns** — no file
  writer, no diff, no three-way merge, no protected-region format.
  `agentsMdSplice` is not generalised.
- **No incremental regeneration, no per-slice hash, no staleness
  cache, and no `hash --at`** (D5 v, D5 ii).
- **No slice confinement** (D6). A transform may read anything; the
  declared slice is documentation and a coverage input.
- **No partial writes.** Output 3 of 5 failing abandons the run.
- **No `drive`-style write tool over MCP.** The trust profile governs
  `@"..."` READS (ts/src/type.ts) and there is no write clause; a
  tool whose purpose is writing files cannot be confined by it, and
  ts/src/mcp.ts is explicit that a tool must never choose its own
  confinement. The plan half is served; the writing half is not.
- **No LLM anywhere in the pipeline.** Deterministic, mechanical
  derivation is the entire pitch.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The four invisible facts (optionality, source order, closedness, disjunction arms) make every sidecar-free transform quietly lossy — VERIFIED on `domain.aon`: `email` lost its `?`, `ledgerId` lost an arm, fields came out alphabetical | High | High | Named as losses in the docs and in every worked example, not hidden; the reflection sidecar (Phase 5) closes all four with zero language change, via the `$name` host-variable mechanism both ports already have; until then the model states them as data, as worked example 2 does |
| Go has NO public Val reflection (`go/val.go` exports five methods; `MapVal` fields are unexported), so form (a) is TypeScript-only today | High | High | Sized as its own phase, not "mostly not my area": exported Go accessors mirroring what `ts/src/val/MapVal` already exposes, with shared rows, land BEFORE the `$model` injection so the injection is a thin re-expression of one API rather than two new surfaces |
| The recursive-alias vocabulary does not terminate — VERIFIED, nine arms double-included is killed at 60 s in BOTH ports; five arms hangs TypeScript while Go answers, so the same construct is a G5 failure at one size and an ADR-001 divergence at another | High | High | The vocabulary is depth-capped by construction (containers take leaves only): VERIFIED 0.17 s / 0.01 s on the same document, byte-identical hash, and diagnostics stop degrading with depth. A `divergent.tsv` row and a BUGS.md entry regardless, because the engine defect outlives this vocabulary |
| `id()` naming a node and its own descendant stack-overflows both ports — VERIFIED, uncatchable `fatal error` in Go | Medium | High | Phase 0 refuses it at the merge as `id_ancestor`; the walk's totality argument depends on it and says so |
| `pick` orders a map's children differently in the two ports — VERIFIED, `["B","A"]` in TS and `["A","B"]` in Go with an astral key | Medium | High | Phase 0, one word: `ts/src/val/AggFuncVal.ts` uses a bare `.sort()` where Go uses `sort.Strings` and where `each` correctly uses `cmpCodePoint`. `join` inherits the same helper, so it must land first or the new builtin ships broken |
| `pick(each(d, {computing template}), k)` resolves in TypeScript and fails `mapval_no_gen` in Go — VERIFIED — and the INLINE spelling fails in BOTH | Medium | High | Phase 0 fixes Go's staged snapshot to defer as TypeScript's `argsnap` does, and pins BOTH spellings in both ports; the design does not depend on either, because `pick(pack(...))` nested is VERIFIED working in both |
| Hidden and unfilled-optional children flow into every bag — VERIFIED, `each({a:1,b?:2,c:hide(3)})` is `[1,2,3]` in both ports | Medium | High | Phase 0 makes `each`/`pick`/`join`/`form` skip both, with rows pinning the CHANGED behaviour on the two existing verbs; a hidden value reaching generated source is a disclosure, and this is the one place this design changes shipped semantics |
| `{k:"text"}` and `x` swallow the core, the OpenAPI Generator failure mode (5,000+ open issues, per-language template forks) | Medium | High | Every escape and every unenforceable check is an entry in `lossy[]` with its path; `--strict` refuses; `{k:"text"}` is opaque to `diff`/`subsume`/`breaking` and cannot render to more than one target, where a `ref` can. "How much of this generator is escapes" is a number, not a feeling |
| The union diagnostic is coarse when EVERY arm fails — VERIFIED, one `empty [conflict]` printing all six `%Decl` arms | High | Medium | The renderer is the primary gate with precise `ir_*` codes; per-kind aliases are public for narrowing; an engine diagnostics-only improvement is proposed in Open questions |
| `vet --at` loses `%alias` references through a LIST SPREAD in the Go port — VERIFIED, 2-line reproducer; `--at` is shared by `vet`, `jsonschema`, `diff` and `breaking` | Medium | Medium | The vocabulary is anchored under a key so no `--at` is needed; the defect lands in BUGS.md and `divergent.tsv` with the corrected diagnosis and the passing counter-case, so the fixer can bisect |
| An alias-bearing disjunction that crosses an `@include` reports different message text and a different SITE in the two ports — VERIFIED, TS `($.%A&{"k":"c"})\|($.%B&{"k":"c"})` against `top` at the schema file, Go the expanded form against the data at the include line, same code and class; docs/trust.md puts message text in parity | Low | Medium | Recorded in `divergent.tsv`; `vet` AGREES on the same input, so the divergence is in the plain evaluation path only and the design's own checks are unaffected |
| `gofmt` visibly disagrees with rendered Go — VERIFIED in worked example 2: struct field types are not column-aligned | High | Medium | The two-step pipeline is in `--help` and in the reference page with the reasoning; a non-gating `gofmt -l` canary in `go/render_test.go` tells the repository when its own goldens are not gofmt-clean |
| `key(n)` depth is miscounted and produces silently wrong output — VERIFIED on the service catalog: every unit came out named `"decls"`, no error, both ports | High | Medium | `form` removes the commonest nesting; the trap is documented in the how-to with this exact example; a spec row pins it |
| String interpolation destabilises @tabnas string lexing — it would be the FIRST such change in either port, in a component neither port configures, guarded by two single-line backtick rows | Medium | High | Phase 8 lands it alone, behind a version gate, with `patch`'s `spanHolds` refusal as a named deliverable; multi-line backtick `gens`/`canon` rows go into the suite in Phase 0 regardless, so a @tabnas bump cannot move the behaviour this design already depends on |
| Golden churn: the Jostraca fixture goldens are valid only for the pinned version | High | Medium | Goldens are small and vary OPTIONS rather than content; a scheduled non-blocking `jostraca-latest` CI job gives warning without letting another repository's cadence break `main` |
| The cross-repository dependency does not land: `memfs` lazy-loading and `shape` are blocking asks on jostraca | Medium | High | Phases 1–5 have no Jostraca dependency at all; `render --out` writes files directly and is a complete product without the bridge. The bridge is Phase 7 precisely so it cannot block the language work |
| ADR-002's 100 % floor on a hand-written checker with per-kind, per-key arms, times two ports | High | Medium | The vocabulary IS the checker for shape (unification does it), so the renderer's checker validates only what unification cannot see — `ref` resolution, `lang` agreement, duplicate names, reserved words. Fault injection through the render profile reaches every arm |
| Adoption: a transform reads worse than a fifty-line host program | Medium | Medium | Stated plainly rather than denied: what the layer buys over a host program is a vetted result, TS/Go byte parity, `--check`, a mandatory provenance pin and rule coverage. A single-host consumer with none of those needs should write the host program, and the docs say so |

## Implementation plan

Spec-rows-first throughout: every behaviour lands as `test/spec/*.tsv`
rows agreed before code; TypeScript (canonical) implements; the Go
port follows to green on the identical rows, with no skip list. At
every phase nothing may regress: the full shared suite (97 files,
3755 rows at drafting — re-derive with
[protocol rule 5](progress.md#the-update-protocol)), canon
convergence, and the ADR-002 floor in both ports.

Baseline for the register: `ls test/spec/*.tsv | wc -l` = **97**,
`awk -F'\t' 'NF>2 && $0 !~ /^#/' test/spec/*.tsv | wc -l` = **3755**.

### Phase 0 — the four gating defects (S)

> **Status, 2026-08-30: PARTIAL.** Items 1 (`pick` map ordering) and 3
> (`id_ancestor`) landed with #99. Item 2 (the staged pipeline) was
> re-probed after it and still diverges; it has the same root cause as
> `use-cases/BUGS.md` §63, found later and from the other side. Item 4
> (bag membership) is untouched. The authority for all of this is
> [progress.md](progress.md#g9--declarative-transformation), not this
> section — the text below is the design as written, kept as written.

None is recorded anywhere;
[`test/spec/divergent.tsv`](../../test/spec/divergent.tsv) has zero
rows today, so these would be its first entries, and per that file's
own rules a divergence fixable from this repository gets FIXED rather
than recorded — so three of the four are fixes and only the fourth is
a row.

1. **`pick` map ordering.** `ts/src/val/AggFuncVal.ts` sorts with a
   bare `Object.keys(...).sort()` (UTF-16 code-unit order) where
   `go/constraint.go`'s `bagChildren` uses `sort.Strings` (code-point
   order) and where `ts/src/val/EachFuncVal.ts` correctly uses
   `cmpCodePoint`. One import and one argument. `join` inherits the
   same helper, so this is genuinely blocking.
2. **The staged pipeline.** Go's snapshot of a staged producer with a
   computing template is taken before the template resolves;
   TypeScript's `argsnap` deferral (`ts/src/val/FuncBaseVal.ts`)
   waits. Fix in `go/func.go`/`go/generate.go`. Pin BOTH the
   two-statement and the inline spelling, in both ports.
3. **`id_ancestor`.** `mergeEntities` (ts/src/unify.ts,
   go/identity.go) refuses an `id()` whose named node is an ancestor
   or descendant of another position bearing the same name — a
   located `conflict` where today both ports die of stack overflow.
4. **Bag membership.** `each`, `pick`, `join` and `form` skip
   `hide`-marked children and unfilled optional keys. This is
   observable behaviour on two shipped verbs and is the one place
   this design changes existing semantics; it lands with rows
   pinning the change and a CHANGELOG note.

Also here, because they are cheap and protect what follows:
multi-line backtick `gens`/`canon` rows (the only backtick rows in the
suite today are single-line), and the `vet --at` list-spread alias
break recorded in BUGS.md and `divergent.tsv` with its corrected
diagnosis and its passing counter-case.

*Files:* ts/src/val/AggFuncVal.ts, ts/src/val/EachFuncVal.ts,
ts/src/unify.ts; go/agg.go, go/constraint.go, go/func.go,
go/generate.go, go/identity.go.
*Spec:* `agg.tsv` +6, `gen-each.tsv` +4, `id.tsv` +3,
`errcodes.tsv` +1 (`id_ancestor`, conflict), `edge.tsv` +4,
`divergent.tsv` +1.
**Acceptance:** the astral-key `pick`, both `pick(each(...))`
spellings, the `id()` ancestor document and the hide/optional bag all
answer identically in both ports; the full suite is green.

### Phase 1 — the vocabulary, as a bundled schema (S)

The `@"aontu:code"` text of [§1](#1-the-output-vocabulary--aontucode)
added to `ts/src/std.ts` (a `STD_CODE` constant plus two
`STD_SOURCES` entries) and `go/std.go` (the same bytes), containing no
backtick and no backslash. Nothing else in either engine changes: no
builtin, no grammar, no LSP list, no error code. VERIFIED already
working from a file in both ports, including the byte-identical hash.

*Files:* ts/src/std.ts, go/std.go, docs/reference-api.md.
*Spec:* new `std-code.tsv` (2 rows: canon, hash — mirroring
`std-system.tsv`); new `ir-vet.tsv`, ~40 rows in the EXISTING five-column
`vet` mode — one valid instance per node kind, plus a negative per
kind (unknown `k`, unknown `c`, unknown `prim`, a bad `%Name`, a key
`close()` refuses, and a missing required key asserting the
`incomplete` verdict rather than `invalid`). **No new spec mode and no
runner edit** — the single biggest saving in the design.
**Acceptance:** both ports vet a full instance valid and every
negative invalid; both hash the vocabulary identically; a document
that merely includes it generates nothing of its own.

### Phase 2 — `join` (S)

> **Status, 2026-08-30: LANDED**, substantially as written below. The
> departures are recorded in
> [progress.md](progress.md#g9--declarative-transformation): `join` is
> the first builtin that is both staged and defers resolution, so it
> needed a `make` override; the separator is refused unless it is a
> string; and phase 0 item 4 turned out not to be a prerequisite,
> because reusing `bagChildren` keeps `join` behaving exactly as
> `each` and `pick` do until that item changes all of them together.

`JoinFuncVal` beside `PickFuncVal` in ts/src/val/AggFuncVal.ts and
`joinBag` in go/agg.go, reusing `bagChildren` and `unpref`. Registry:
`funcMap`, `funcArity` `[1,2]`, `POSITIONAL_ARG_FUNCS` in TypeScript;
`funcSet`, `stagedFuncs`, `positionalArgFuncs`, `funcArity` and the
`resolve` arm in Go. `generatorFuncs` and `boundArgStart` are NOT
touched — `join` holds no template and binds no `_`, so a `_` inside
it belongs to the enclosing generator, which is what makes
`pack($.rows, join(_, ","))` work.

Both grammars' `name` rule, both LSP lists, and — **a repair that must
happen with the first new builtin** — extending
`ts/test/grammar.test.ts` to compare the lark grammar's `name`
alternation LITERALS against `BUILTIN_FUNCS`. The gbnf list is
set-equality checked both ways; the lark test compares only RULE
names, and `grammar/aontu.lark` is consequently already missing
`acyclic`, `inverse` and `rel`. Five lines, and it would have caught
that.

*Files:* ts/src/val/AggFuncVal.ts, ts/src/lang.ts, ts/src/lsp.ts,
ts/test/lsp.test.ts, ts/test/grammar.test.ts; go/agg.go, go/func.go;
grammar/aontu.gbnf, grammar/aontu.lark; docs/reference-language.md
(the function table, and the stale "thirty-seven built-in functions"
count at :1291 which docs/tutorial.md:440 repeats).
*Spec:* new `gen-join.tsv`, ~34 rows — order for lists and maps
(including the astral-key row that would have caught Phase 0's
defect), the `+` fold, the empty identity, member and separator
refusals, the settled/unsettled member split, staging, canon and
hcanon of an unfired call, composition with `pick`/`each`, arity;
`errcodes.tsv` +1 (`join_member`, conflict).
**Acceptance:** `join([8080, 443], "-")` is `"8080-443"` in both
ports; an unfired `join` canons as its call and reparses; the lark
literal check is green after the three missing names are added.

### Phase 3 — `form`, the order-preserving map (S/M)

`ts/src/val/FormFuncVal.ts` and `formFunc` in go/generate.go,
importing `each`'s exported ordering helper so the two can never
disagree about order. The five registries in both ports, **plus
`boundArgStart` in ts/src/val/PlaceVal.ts and go/place.go** — the
site whose omission is silent.

*Files:* ts/src/val/FormFuncVal.ts (new), ts/src/lang.ts,
ts/src/val/PlaceVal.ts; go/generate.go, go/func.go, go/place.go.
*Spec:* new `gen-form.tsv`, ~30 rows — order, replacement versus
meet (the paired `form-vs-each-same-template` rows that document the
whole distinction), identity non-carry, `key()` as index, relative
references resolving at the destination, the hidden-capture idiom
reading source fields, `_` binding under nesting, arity, canon,
hcanon; `place.tsv` +4 cross-referencing the binding rows;
`errcodes.tsv` +1 (`form_data`, parse — matching `each_data`'s class,
with two sentences in the registry prose reconciling it against
`aggregate_data`'s `conflict`, which will otherwise be reopened by
the next reviewer).
**Acceptance:** `form($.n, upper(_))` is `["A","B"]` where
`each($.n, upper(_))` is `scalar_value`; source order survives; the
service-catalog units come out `payments, ledger, risk`.

### Phase 4 — the renderer core and the first two profiles (M)

`ts/src/render.ts`: `renderValue(model, profile, opts)` implementing
the indentation algorithm, the per-code-point escaper, the ASCII word
splitter and case styles, the `prec`/`child_prec` type expression, the
reserved-word escaper and the banner. No engine, no I/O: the profile
arrives as a plain object. Then `go/render.go` as its twin, function
for function, as `go/jsonschema.go` mirrors `ts/src/jsonschema.ts` —
and the parity probe run on every case before a single expectation is
recorded. Profiles `aontu:lang/ts` and `aontu:lang/go` bundled in
ts/src/std.ts and go/std.go, byte-identical, pinned by a `hash` row
each.

*Files:* ts/src/render.ts (new), ts/src/std.ts; go/render.go (new),
go/std.go; ts/test/render.test.ts and go/render_test.go for the two
arms no TSV cell can reach (a lone surrogate; a lone carriage return —
the escape table is exactly `\n`, `\t`, `\\`).
*Spec:* new `render.tsv`, ~35 rows in a new four-column mode
(`name <TAB> render <TAB> src <TAB> {profile, opts} <TAB> expect`) —
indentation and nest depth, blank lines and trailing-whitespace
trimming, `raw` with and without reindent, the empty unit, all case
styles, the per-profile acronym override, reserved-word escaping in
both profiles, string escaping, the `(string | null)[]` paren rule,
and the `render_*` refusals. Newlines in expectations are written
`\n`, which the runner's escape pass expands — the format supports it,
contrary to an earlier draft's claim that it does not; only a carriage
return is unspellable. Plus `errcodes.tsv` +8.
**Acceptance:** worked examples 1 and 2 render byte-for-byte from
both ports; `grep -n 'range ' go/render.go` shows ranges over slices
only.

### Phase 5 — the reflection sidecar (M)

The four invisible facts close here, with **zero language change**,
via the `$name` host-variable mechanism both ports already have
(`ctx.vars` in TypeScript, `GenerateVars` with
`NewMap`/`NewList`/`NewString` in Go). But the Go half must be built
first and is not a footnote: `go/val.go` has no reflection surface at
all to inject FROM, so exported accessors mirroring what
`ts/src/val/MapVal` already exposes land as an ADR-001 parity item in
their own right, with shared rows, BEFORE the injection.

The injected `$model` carries, per named node: source key order (which
survives on the Val tree and is destroyed only by canon and gen —
the cheapest high-value item on the whole list), `optional`, `closed`,
disjunction `arms`, `checks` already in `%Check` shape (not a canon
string, or every transform reimplements a parser), the public kind
label including bare `number` (Go already computes it in
`valKind`, go/check.go — promote it; a transform must never switch on
`constructor.name`), `entity`, `link` and `deprecated`.

*Files:* go/val.go, go/mapval.go, go/listval.go (exported accessors);
ts/src/reflect.ts and go/reflect.go (new); ts/src/render.ts,
go/render.go (injection).
*Spec:* new `reflect.tsv`, ~25 rows — `order` is source order not
code-point, `optional` is true for a `?:` key, `closed` is true only
under `close()`, `arms` enumerates a disjunction, `checks`
round-trips into `%Check` shape, `kind` reports `number` for a bare
`number`.
**Acceptance:** worked example 1's transform, rewritten against
`$model`, produces `email?`, `ledgerId: number | bigint`,
`lines: OrderLine[]`, source field order and every `re()`/`min()`
carried as a check — in both ports.

### Phase 6 — `walk`, the manifest, and the verb (M)

`walk(data, tmpl)` in both ports: arity `[2,2]`, staged, positional,
in `generatorFuncs` and `boundArgStart`, producing a pre-order list
with `_` bound to the node, descending `peg` only. Codes `walk_data`
(parse, by `each_data`'s precedent), `walk_cycle` (conflict — refuse
on revisit, never skip) and `walk_budget` (budget, by
`recursion_budget`'s precedent, so "retry with a larger budget" is a
valid agent response signalled by the class). It must NOT reuse
`empty`.

Then `aontu render` in both CLIs, the manifest, the provenance trace,
the coverage report, and one MCP tool over the plan half only.

```
aontu render [--profile <name|file>] [--at <path>]
             [--out <dir> | --stdout | --check]
             [--manifest <file>] [--strict] <file>
```

Exit codes mirror `jsonschema` exactly — 0 ok, 1 lossy under
`--strict` or drift under `--check`, 2 usage or I/O, 4 the document
does not stand up — and `finish()` sets `process.exitCode` rather than
calling `process.exit`, so a large piped unit is not truncated at the
pipe buffer.

**A write posture is specified here, and docs/trust.md is amended**,
because this is the first verb with a write effect: `--out` is
realpath-confined below the given directory, a unit `path` that is
absolute or contains `..` is refused, and the trust contract gains one
paragraph saying that `render` is confined by PATH, not by the include
profile. `render` and `renderValue` are exported from the
`ts/src/aontu.ts` barrel — do not repeat the `jsonSchema` mistake, the
one emitter reachable only by deep import.

*Files:* ts/src/val/WalkFuncVal.ts, ts/src/render.ts, ts/src/cli.ts,
ts/src/mcp.ts, ts/src/aontu.ts; go/generate.go, go/func.go,
go/place.go, go/render.go, go/cmd/aontu/render.go,
go/cmd/aontu/main.go; docs/trust.md.
*Spec:* new `gen-walk.tsv` ~30 rows; `render.tsv` +10 (manifest and
coverage); `errcodes.tsv` +3. CLI behaviour is pinned by executable
transcripts in docs/reference-api.md, run by `ts/test/docs.test.ts`,
as the `jsonschema` section already is.
**Acceptance:** worked example 2's three units are produced by one
`aontu render --manifest` invocation in both ports; the coverage
report names `$.customers`, `$.orders` and `$.invoices` as consumed by
no output; a manifest whose third output fails writes nothing.

### Phase 7 — the Jostraca bridge (M)

The exact pins, the pin-equality guard (with its explicit shared set
and exhaustive exclusion list), `ts/src/emit-jostraca.ts` with the
`require` inside the function body, `go/emit/` as its own package, and
the LSP isolation assertions in both ports. Blocking on the other
repository: lazy `memfs`, `shape` moved to `dependencies`, and
`ContentProps.raw`.

*Spec:* no shared rows — this is cross-repository. Byte-exact fixture
directories under `test/spec/files/render-jostraca/<case>/` with a
README naming the pinned Jostraca version and the redactions, read by
one test per port with a count assertion so deleting a case on one
side fails the other. That is the `test/spec/files/vet-sarif/`
pattern, and it fits here because the goldens are valid
only for the pin and a directory with a README can say so where a TSV
row cannot.
**Acceptance:** worked example 2 written to disk through one
`generate()` call; a second run with one file hand-edited inside a
`JOSTRACA_PROTECT` region leaves it alone; a conflicted merge is a
first-class verdict at exit 1.

### Phase 8 — string interpolation (M/L, the parser phase)

Last, alone, and behind a version gate, for the reasons in
[§4](#4-the-language-additions-d4). Named deliverables include the
`spanHolds` refusal for interpolated spans, the `compat`-class
migration finding, and `edge.tsv` rows pinning the backtick lexer so a
@tabnas bump in one port cannot move it silently.

*Files:* ts/src/lang.ts, go/lang.go, ts/src/patch.ts, go/patch.go,
both grammars, both LSP tokenizers.
*Spec:* new `interp.tsv`, ~40 rows — delimiter, `$${` escape, nesting
refusal, canon-is-concatenation, hcanon round-trip, multi-line, every
other quote style inert, the migration finding; `errcodes.tsv` +2.
**Acceptance:** `` `a${$.b}c` `` and `"a" + $.b + "c"` have the same
canon, the same hash and the same value in both ports; `patch
--in-place` REFUSES an interpolated span with a located code rather
than degrading.

### Documentation and register obligations

In the landing commit of each phase, per CLAUDE.md and AGENTS.md:
`docs/design/EMISSION.0.md` for the design note;
`docs/how-to/generate-code.md` as a Diátaxis how-to with every fenced
block tagged and executed by `ts/test/docs.test.ts`;
`docs/reference-api.md` for the verb and the library functions;
`docs/shared-spec.md` and AGENTS.md's mode table for the `render`
mode; a `use-cases/15-generate/` directory following the
`14-jsonschema-export` pattern with `check.sh` and `expected/`; and
the phase's row in
[`docs/capability-review/progress.md`](progress.md) changing in the
**same commit** that changes its status. **ADR-012** is required —
"aontu depends on Jostraca, and the dependency is data" — because this
is a cross-repository coupling that changes the install story and adds
a dependency to a project that has taken seven in its life; without an
ADR a future maintainer will reverse it in good faith. ADR.md's index
table is also stale, stopping at ADR-008 while ADR-009, ADR-010 and
ADR-011 exist; fix it in the same commit.

## Open questions

- **The discriminated-disjunct diagnostic.** When every arm of a
  disjunction of closed maps fails and exactly one arm's
  DISCRIMINATOR key — a key present in every arm with a single
  literal value — matched, report inside that arm instead of dumping
  all arms. Diagnostics only, no semantics change, and it would
  improve every discriminated-union schema in the language, not just
  this one. It is the single change that would most improve this
  vocabulary's ergonomics and it is an engine change. Decided by:
  whether the renderer's own `ir_*` codes prove sufficient in
  practice once Phase 4 exists.
- **A `kindof(x)` builtin.** Bare `number` cannot be discriminated by
  `match`, because `match` selects by unifiability and `number`
  unifies with all four numeric leaves — VERIFIED, and no re-ordering
  fixes it. `kindof(x)` returning the kind name as a string would
  make it exact: arity `[1,1]`, one `funcMap` entry, no grammar
  change, squarely inside "prefer functions over new tokens", and Go
  already computes the label in `valKind`. This design proceeds
  without it (the vocabulary has no `prim:"number"`, and the
  reflection sidecar reports the true kind), but it would remove the
  sidecar's `kind` field for the common case.
- **A `doc(x, "text")` builtin.** aontu has no comment recovery and
  never will without a CST, so doc comments in generated code must be
  MODEL DATA. `%Doc` is in the vocabulary but today a transform can
  only supply doc text it wrote itself. A `doc()` builtin mirroring
  `deprecate(x, {...})` — which already has the whole rider, clone
  and canon machinery — would let a model carry its own documentation
  and the transform lift it. One `funcMap` entry, one arity entry, no
  grammar change. Decided by: whether the first two backends want it
  before Phase 5 lands, since the sidecar could carry it instead.
- **Whether `func` belongs in the core vocabulary at all.** It is
  kept, with a structured signature and an opaque body, on the
  argument that signatures are where symbols and imports pay off. The
  honest counter-argument is that a transform cannot compute a body,
  so a `func` decl is always a signature wrapped around a text blob,
  and the whole thing could be one `{k:"text"}` decl. Decided by:
  whether the first two backends ever use a body that is not
  `{k:"abstract"}`.
- **Whether the `{k:"lit"}` / `enum` split is the author's decision
  or the backend's.** An inline literal union stays inline unless
  someone names it; this design says the transform author decides by
  emitting an `enum` declaration plus a `{k:"ref"}`, and the renderer
  never promotes an inline `lit` on its own. A backend wanting
  auto-naming does it behind an `x` flag. Decided by: whether two
  backends independently want the same promotion.
- **Which target ships third.** TypeScript and Go ship first because
  they are the two ports and both profiles can be validated against
  this repository's own source. SQL is the more interesting stress
  test — it is where `union`, function bodies and half the checks
  fall off, and worked example 2 already found a reserved-word defect
  with it. YAML is the acid test of the indentation design, because
  it is the first target where structural indentation IS the
  language's syntax. Decided by: whether the goal is to demonstrate
  the design or to stress it.
- **Whether `x` should be shape-constrained.** `x?: {}` is an open
  map by convention keyed by backend name. Spelling it `x?: {&: {}}`
  costs nothing and makes a stray `x: {tag: "..."}` a vet error
  rather than a rider no backend reads — but a backend that publishes
  a schema CLOSING its own `x` key would then refuse another
  backend's riders under the same `x`, destroying the
  multi-backend-in-one-instance property the single-vocabulary
  decision is built on. Decided by: whether a second backend schema
  is ever written.
- **Fragment and Copy reads.** `%Fragment.from` and `%Copy.from` on
  the Jostraca side are filesystem READS performed outside
  `trust.include`'s confinement. Phase 7 does not use them, but a
  later phase that does needs a `--templates <dir>` root with the
  same realpath confinement `--out` gets, or the trust contract
  acquires a fifth input nobody declared. Decided by: the first
  transform that wants a hand-written template file.
- **Whether the render mode should read its expectation from a
  fixture FILE.** `__FIXTURES__` feeds only the `src` column today.
  Extending it to the expectation would give whole-file goldens that
  are reviewable `.go` and `.ts` files a compiler can be run over,
  while keeping the no-skip-list guarantee every TSV row has and a
  fixture pair does not. It widens what a spec row can do, and a row
  that reads a file can fail for a filesystem reason. Decided by:
  whether Phase 4's `\n`-escaped rows prove unreviewable at the
  eight-line cap.

---

## Amendment 2026-09-04: the plan, re-based on what landed

*Everything above is the design as drafted against 0.53.0, when
nothing had been built and the plan could assume a clean field. Two
phases have since moved, three facts underneath the design have
changed, and the idiom the design recommends was re-probed against the
tree at 0.56.0. [progress.md](progress.md) remains authoritative for
STATUS; this amendment is authoritative for the PLAN, and where it
contradicts the eight phases above, it wins. Every claim marked
VERIFIED below was run on 2026-09-04 against `node ts/bin/aontu.js`
and a fresh `go build ./cmd/aontu` at 0.56.0 / go 0.1.14.*

### What moved

`join` landed (phase 2). Phase 0 is partial. And the corpus the design
asked for exists: [use-cases/15-code-generation](../../use-cases/15-code-generation/)
generates Go, TypeScript and SQL from one model — **and it is at
parity, VERIFIED today**: `aontu get '$.file'` over its three
transforms is byte-identical from both CLIs (262, 175 and 238 bytes).
That is worth more than it looks. It means the phases below are not
building toward an unproven capability; a working, port-agreed
transform already exists, and what remains is to give it a checked
vocabulary, an order-preserving map, and a renderer.

### Three facts changed underneath the design

**1. ADR-014 removed `id()`, so phase 0 item 3 is VOID — and the walk
totality argument gets stronger, not weaker.** Item 3 was to refuse an
`id()` naming its own ancestor, which crashed both hosts' stacks. The
mark no longer exists and no document can ask for the shape. The
consequence reaches further than one deleted work item:
[§2](#2-the-rule-layer--apply-templates-in-the-engine) argues `walk`'s
totality by listing four reasons the reachable set is not a tree and
closing the only true `peg` cycle among them — and that cycle was
reachable ONLY through `id()`. **The argument now holds by
construction.** `walk_cycle` stays in phase 6 as a backstop for a
shape no document can write, which is a cheaper thing to justify than
a defence against one it can.

**2. `join` landed, and phase 0 item 4 changed from a deferred
tidy-up into the most urgent item in the plan.** Item 4 makes `each`,
`pick`, `join` and `form` skip `hide`-marked children and unfilled
optional keys. It was deferred when `join` landed, on the recorded
reasoning that `join` "treats `hide`-marked and unfilled optional
children exactly as `each` and `pick` do today" — true, and now the
defect rather than the justification. VERIFIED, both ports,
identically:

```aon
m: {a: "keep", b: hide("SECRET-not-for-output")}
leak: join($.m, "\n")
```
```
"m":{"a":"keep"}                        <- the mark is honoured
"leak":"keep\nSECRET-not-for-output"    <- and ignored by the fold
```

`each` and `pick` produce values, and a wrong aggregate over numbers
is a wrong number. `join` produces TEXT; it is what
[`docs/how-to/generate-code.md`](../how-to/generate-code.md) documents
as the way to assemble a generated file; so the same mechanism now
writes a value marked hidden into generated source. An unfilled
optional folds the same way (`join({x:"one", y?:"two"}, "-")` is
`"one-two"`). Recorded as [BUGS.md §79](../../use-cases/BUGS.md) with
a repro.

**3. The baseline moved.** Protocol rule 5, re-derived 2026-09-04:
`ls test/spec/*.tsv | wc -l` = **103**,
`awk -F'\t' 'NF>2 && $0 !~ /^#/' test/spec/*.tsv | wc -l` = **4324**,
against the 97 / 3755 the plan above records.

### What was re-verified, and what it settles

**Phase 1 is implementable exactly as [§1](#1-the-output-vocabulary--aontucode)
writes it, with no edits.** The vocabulary text was extracted from this
document and run at 0.56.0. VERIFIED, both ports agreeing on every
line: a full instance — record with checks, an optional field, a list
of `ref`, an enum with a valued member, a `{k:"text"}` decl — vets
`valid`; `prim: "nope"` vets `invalid`; a `%Name` of `"9bad"` vets
`invalid`; a nested `list of list` vets `invalid`, which is the
depth cap doing its job at the node rather than in the evaluator; a
document that merely includes the vocabulary generates only its own
keys; and `aontu hash` over it is byte-identical across the ports.
This is the one phase that needs no discovery.

**Phase 0 item 2 still diverges, and a third spelling reaches it.**
Beside the two in [BUGS.md §63](../../use-cases/BUGS.md), VERIFIED:
`p: pack($.m, {src: hide(_), d: ...})` / `v: pick($.p, "d")` /
`j: join($.v, ", ")` generates in TypeScript and refuses
`mapval_no_gen` in Go. Three spellings, one root cause, one fix.

**The traps the design names are all still live**, VERIFIED at 0.56.0
in both ports: `pack` re-sorts a map keyed with the service
catalogue's own `payments, ledger, risk` into `ledger, payments,
risk`, which is [§4](#4-the-language-additions-d4)'s whole argument
for `form`; `key()` inside a nested template returns the template's
own key, not the source's; a list of records still refuses
`pack_key`.

### Four corrections to the text above

**(i) `pick(pack(...))` and the hidden-capture idiom do not compose,
in EITHER port.** [Current state](#current-state) presents both as
working building blocks, and it is right about each alone. Composed
they fail: VERIFIED, `pick(pack($.m, {src: hide(_), d: "x" + .src.n}),
"d")` is `mapval_no_gen` at the `pick` in both ports. The reason is
structural rather than a defect — a relative reference resolves
against the bag it sits in, and `pick` lifts the value out of that
bag — and §63 already records the general form ("`pick` over an inline
spread expression does not settle"). But the consequence for this
design was not drawn: **the recommended idiom needs the staged
two-statement repair, and the staged repair is exactly what item 2
diverges on.** So until item 2 lands, the design's own recommended
idiom is a TypeScript-only capability. That is the second reason
phase 0 comes before everything.

**(ii) The idiom that works today is not the idiom this document
teaches.** The corpus computes its files with a list spread and a
projection —

```aon
rows: [&: { out: `\t` + .go + ` ` + match(.t, "string", `string`, ...) }] & .fields
body: join(pick(.rows, out), `\n`)
```

— where [spelling rule 3](#five-spelling-rules-the-vocabulary-imposes-each-found-by-probe)
warns an author off `&:` for building declarations. Both are correct
and the distinction has to be stated where an author meets it: rule 3
is about building CLOSED VOCABULARY NODES, where a template's
scaffolding keys collide with `close()` at every node; the corpus
builds an intermediate whose only consumer is `pick`, where they
cannot. Left as it is, an author reads the rule, reads the use case,
and gets opposite advice. The how-to owes one paragraph naming both
and the line between them.

**(iii) The verb name — DECIDED 2026-09-04: `aontu render`.** This
document and the register had disagreed, `aontu render` with the
manifest under `@"aontu:code"` against `aontu gen` with a `std/gen`
manifest. `render` wins on a collision the other spelling could not
avoid: `generate()` is already the library function that projects the
Val tree to JSON, and `mapval_no_gen`/`listval_no_gen` are codes users
meet constantly, so `aontu gen` would mean model → FILES in a tool
where `generate()` means tree → JSON. `render` is also already the name
of the fold it wraps. The reasoning and the flag surface are in
[EMIT.0.md D7](../design/EMIT.0.md#d7-the-verb-is-aontu-render); the
`std/gen` half of the disagreement was stale anyway, having died with
the `aontu:` rename.

**(iv) `docs/design/EMISSION.0.md` is named in the landing obligation
of every phase and does not exist.** What exists is
[GENERATION-FORMS.0.md](../design/GENERATION-FORMS.0.md), covering
forms (a) and (b) only. Either the obligation is corrected to name it,
or the design note is written in phase 1 — but a phase must not land
citing a file nobody wrote.

### The revised order

Phase 0 splits, because its two open items have nothing in common but
their number: one is a shipped-behaviour change in both ports, the
other a Go-only staging fix. Phases 1 and 0b touch disjoint files and
can run in either order or together. Everything after that keeps the
design's dependency order.

| # | Phase | Size | Why here |
|---|---|---|---|
| **0a** | Bag membership: `each`/`pick`/`join` skip `hide`-marked and unfilled-optional children | S | **First, alone, and ahead of the vocabulary.** It is the only item with a consequence in shipped code (BUGS §79), it changes observable behaviour on two shipped verbs plus `join`, which landed on 2026-08-30, and nothing else in the plan depends on it — so it should not wait behind work that does. `form` inherits the rule when it arrives rather than being retrofitted. Rows pinning the CHANGED behaviour on `each` and `pick`, a CHANGELOG note, and the `hide` repro inverted into a spec row |
| **0b** | The staged snapshot: Go defers as TypeScript's `argsnap` does | S | Closes BUGS §63 in all three spellings and makes the recommended idiom available in Go. Pin every spelling — `hide` over a staged spread, `pick` over a staged `each`, and the `pack`/`pick`/`join` chain above — in both ports |
| **1** | The vocabulary as a bundled schema | S | **Verified ready**, and it grows by the fragment nodes of the second amendment; it needs [MODELS.0.md](../design/MODELS.0.md)'s M0 first, for the `aontu:` resolver leg. Otherwise disjoint from 0b (`std.ts`/`std.go` only), so it can go in parallel. `std-code.tsv` (canon, hash) and `ir-vet.tsv` in the existing five-column `vet` mode — no new spec mode |
| **3** | `form`, the order-preserving map | S/M | Unchanged. `boundArgStart` in both ports is the silent omission; the nesting rows are not optional. Inherits 0a's membership rule by construction |
| **4** | The renderer core and the first two profiles | M | The algorithm is unchanged; the fold reads `at` instead of counting depth, and a fragment entry point plus a two-field `aontu:lang/text` profile land with it. Where the verb name (correction iii) becomes public, and the first phase whose output is bytes rather than values |
| **5** | The reflection sidecar | M | Unchanged, and the Go accessor surface (`go/val.go` exports five methods and no fields) is its own ADR-001 item landing BEFORE the injection, not a footnote inside it |
| **6** | `walk`, the manifest, and the verb | M | One simplification banked: the totality argument no longer rests on a defect fix (change 1), so `walk_cycle` is a backstop rather than a load-bearing refusal. Its acceptance case becomes a target the declaration vocabulary does not fit |
| **7** | The Jostraca bridge | M | Unchanged. Still carries the two cross-repository asks; still cannot block phases 1–6 |
| **8** | String interpolation | M/L | Unchanged: last, alone, behind a version gate. The multi-line backtick rows the design wants "in phase 0 regardless" go with 0a, since that is now the first phase to land |

**What this does not change.** The five parts of the proposed design,
the boundary, the vocabulary text, the renderer algorithm and every
decision D1–D7 stand exactly as written. The re-basing is about
ORDER and about four places where the text no longer matches the
tree — not about the design, which the corpus has since given
independent evidence for.

---

## Amendment 2026-09-04 (second): `aontu:code`, and the fragment algebra

*Two owner corrections, taken in order. The first is a rename with a
dependency behind it. The second is a design correction: the mechanism
that makes the XSLT algorithm worth having — composing text fragments
in a structured way — is specified in [§3](#3-the-renderer-and-the-language-profiles)
and is absent from [§1](#1-the-output-vocabulary--aontucode), so a
transform cannot reach it. Everything VERIFIED below was run on
2026-09-04 against both CLIs at 0.56.0 / go 0.1.14.*

### 1. The vocabulary is `@"aontu:code"`

[MODELS.0.md](../design/MODELS.0.md) settles the naming for every
language-supplied model: the `aontu:` prefix, Node's device, a
spelling no relative path or module path can reach, so the resolver
routes on it before any other leg and never touches the filesystem.
`std/code` was the old family name and had both confusions the prefix
exists to prevent. It is renamed here, and in
[VIEWS.0.md](../design/VIEWS.0.md) and the register; the profiles
become `aontu:lang/ts` and `aontu:lang/go`.

Three consequences, none of them cosmetic:

- **Phase 1 now depends on MODELS M0**, which builds the `aontu:`
  resolver leg. `aontu:code` cannot be served before there is a
  scheme to serve it from. M0 is independent of `fmt` and is
  recommended to go first anyway, so this is a sequencing note, not a
  new obstacle — but phase 1 must not be started as though it were
  self-contained.
- **The vocabulary adopts the model conventions.** Lower-case alias
  names (`%unit`, `%decl`, `%field`, not `%Unit`, `%Decl`, `%Field`);
  the root key names the model, which `code:` already satisfies; the
  source is `aontu fmt`-clean and `--lint`-clean, both now shipped, so
  that gate is available on the day the model lands rather than
  waiting; and `aontu:code` joins the no-shared-alias-name gate across
  the bundled set, where its twenty-odd names make it the model most
  likely to collide with a later one.
- **If the manifest survives phase 6's naming question it is
  `aontu:gen`**, which is one more reason to settle that question
  before phase 4 rather than after.

### 2. Any language: the algebra is in the renderer and not in the vocabulary

The owner's second correction is that generation must reach any
language, and that the XSLT-shaped algorithm was chosen to enable
exactly that, by composing text fragments in a structured way. Held
against the design as written, that is not what it delivers, and the
gap is precise.

**[§3](#3-the-renderer-and-the-language-profiles) already specifies a
fragment algebra.** `nest(body)` renders at `depth + 1` and produces
no bytes; `line(body)` concatenates inline pieces and prepends the
depth prefix; a blank line is a terminator and never padding; an
inline piece may not contain a line terminator, which is the rule that
makes the fold total; a block-level `raw` node is the only node that
may carry one, with `reindent: false` for text where column 0 is
contractual.

**[§1](#1-the-output-vocabulary--aontucode) contains none of it.**
`%Decl` is six declaration kinds plus `%Text`, and `%Text` is
`close({k: "text", lang, text})` — a flat blob with no depth and no
`reindent`. So `line`, `nest`, `blank` and `raw` are internal to the
renderer, produced only by lowering a declaration, and **a transform
has no way to emit them**.

What follows is the whole of the problem. A target the declaration
vocabulary does not fit — a Python module, a YAML manifest, a
Terraform file, a Makefile, a shell script, a Dockerfile, anything
whose artifact is not a list of type declarations — is reachable only
through `{k:"text"}`: one opaque blob, its layout baked in at
construction, counted in `lossy[]`, opaque to `diff`, `subsume` and
`breaking`, and unable to render to more than one target. "Any
language" is then true only in the sense that any bytes fit in a blob,
which is the OpenAPI Generator failure mode this design names and
refuses — refused by *counting* it rather than by offering an
alternative.

**And it defeats the rule layer.** apply-templates exists so that each
matched node emits a fragment and the fragments compose. If the only
general-purpose emission is an opaque blob, the rule layer is exactly
as general as the declaration vocabulary, and the XSLT analogy stops
at selection — the half the language already had in `match`.

### The correction: the fragment is a vocabulary node, and it is FLAT

Make the algebra reachable. A fragment is an ordered list of pieces,
each carrying its own depth:

```aon
%inline = string & re("^[^\n\r]*$") | %ref
%line =   close({ k: "line",  at: *0 | integer & min(0) & max(64), of: [&: %inline] })
%blank =  close({ k: "blank", n: *1 | integer & min(1) & max(16) })
%raw =    close({ k: "raw",   at: *0 | integer & min(0) & max(64),
                 text: string, reindent: *true | boolean })
%piece =  %line | %blank | %raw
%frag =   close({ k: "frag", of: [&: %piece] })
```

`%decl` gains `%frag`, and `%body` becomes `%frag | {k:"abstract"}`.

**Flat, not a tree, and this was decided by probe rather than by
taste.** The obvious spelling nests — a `%nest` node holding pieces,
mutually recursive with `%frag` — and VERIFIED, it does not work: with
that shape *even a valid instance* vets `invalid` in both ports. It is
the recursion hazard [§1](#1-the-output-vocabulary--aontucode) already
measured and capped the container types for, arriving from the other
direction. Depth as an integer on each piece removes it completely.

Flat is also the better fit, for three reasons that are not about
avoiding a defect:

- **It is what `walk` produces.** `walk(data, tmpl)` yields a
  pre-order LIST. A flat list of depth-tagged lines falls straight out
  of a pre-order walk; a tree would have to be reassembled, and the
  language has no combinator that reassembles one.
- **The two levels already exist.** `join` composes the inline pieces
  of one line; the list holds the lines. Nothing new is needed in the
  language for either.
- **Indentation stays structural.** `at` is a small bounded integer,
  never whitespace inside the text, so the renderer still owns every
  prefix and [§3](#3-the-renderer-and-the-language-profiles)'s
  algorithm is unchanged — it reads `at` where it currently counts
  recursion depth.

**VERIFIED, both ports agreeing on every line**, on the schema above:

| case | result |
|---|---|
| A Python class: two nesting levels, a `%ref` inline, a blank, a `raw` at `reindent: false` | `valid` |
| A line whose inline piece contains `\n` | `invalid`, at the node |
| A line with `at: -1` | `invalid`, at the node |
| `aontu hash` over the schema | byte-identical across the ports |

The second row is the one worth pausing on: **the rule §3 states as a
renderer check becomes a `vet` error at the node**, before any
rendering runs, because it is expressible as a constraint on a string.
That is D1's whole claim — the result is an instance of the output
vocabulary and the vocabulary is an aontu schema — applied to the one
invariant the renderer's totality argument rests on.

### What this does to Resolution 1

It does not reverse it. Taking the three reasons in turn:

- **Reason (i) is dead.** It was conditioned in its own words on
  "at text level, *and with no `join`*" — forty nodes for a forty-line
  struct. `join` landed in phase 2, and a fragment holds lines rather
  than characters, so a forty-line struct is one rule emitting lines,
  or one `form` over fields.
- **Reason (ii) survives and is answered.** A fragment asserts less
  than a `%record` and far more than "this is a string": the piece
  kinds are closed, the depth is bounded, a `%ref` is checked, and no
  inline piece may carry a terminator. The vetting prize is graded,
  not lost.
- **Reason (iii) argues FOR the fragment.** Layout baked into the leaf
  at construction time is exactly what a flat `{k:"text"}` blob does.
  `at` plus a renderer-owned prefix is what prevents it.

Restated, then: **the declaration vocabulary is a LOWERING onto the
fragment algebra, and the fragment algebra is the vocabulary's floor.**
The renderer already lowers `%record` into lines and nests through the
profile; this makes the target of that lowering public. One fold, one
indentation algorithm, one escape table, no second renderer, and a
transform mixes both in a single unit — declarations where the
vocabulary fits, fragments where it does not.

### What it changes downstream

- **Loss accounting gains a third tier, and this is the honest part.**
  Today the count is binary: a declaration is fine, an escape is loss.
  With fragments it is three — a declaration checked against the
  target's shape, a fragment that is structured, re-indentable and
  terminator-checked but says nothing about target syntax, and an
  opaque `raw` that says nothing at all. Report the three separately
  and let `--strict` refuse on the opaque tier. "How much of this
  generator is escapes" becomes a real measurement instead of a
  yes-or-no.
- **The indentation-as-syntax open question is answered rather than
  deferred.** YAML and Python are named in
  [Open questions](#open-questions) as the acid test of the
  indentation design. With `at` explicit and inline pieces
  terminator-free, structural indentation is precisely what the
  renderer provides — VERIFIED above on a Python class with two
  levels. They stop being the hard case and become the case the
  algebra was built for.
- **A fragment-only target needs almost no profile.** Two fields:
  `indent`, and the escape table. Naming conventions, reserved words,
  the primitive type map and `prec`/`child_prec` all serve the
  declaration lowering, so a profile's size is proportional to how
  much of the declaration vocabulary a target uses. That is what makes
  "a new language is data" true rather than aspirational.
- **`%body` stops being a dead end.** It is `%text | {k:"abstract"}`
  today on the argument that a transform cannot compute a body. A
  transform cannot compute *semantics*; it can compose *lines*, which
  is what a body is made of.
- **Phase 1 grows by the fragment nodes** and stays small. **Phase 4
  gains no renderer work** — it already implements this algorithm —
  only the entry point that renders a fragment directly. **Phase 6 is
  where it pays off**, because `walk` plus `match` plus fragments is
  apply-templates with its result tree, which is the thing the rule
  layer was for.

### What still bounds "any language"

Stated plainly, because the claim should not be oversold in the other
direction. Fragments buy structure and indentation, not target-language
correctness: nothing checks that the Python is valid Python. There is
still no line-width or wrapping concept, so the model decides where
lines break. There is still no formatter subprocess. And escaping,
comment forms and identifier rules remain per-language profile data.
The ceiling is real — but it is the ceiling of a composition mechanism
rather than of an enumerated list of supported shapes, and that is the
difference the correction buys.

### The phases, with the fragment algebra folded in

The order above is unchanged. What each phase now delivers differs,
and the deltas are small because the renderer already implements the
algorithm — what changes is who can reach it.

| phase | delta |
|---|---|
| **0a** | Unchanged. |
| **0b** | Unchanged. |
| **1** | The vocabulary grows the five fragment nodes (`%inline`, `%line`, `%blank`, `%raw`, `%frag`), `%decl` gains `%frag` and `%body` becomes `%frag \| {k:"abstract"}`. `ir-vet.tsv` grows by roughly ten rows and they are the cheapest high-value rows in the phase: a valid fragment, a line whose piece carries `\n` (**invalid at the node** — the renderer invariant checked before any renderer exists), `at` below zero and above its bound, a `raw` at `reindent: false`, and a `%ref` inline. Everything else about the phase stands, including that it needs no new spec mode. Its dependency on [MODELS.0.md](../design/MODELS.0.md) M0 is the only new prerequisite in the plan. |
| **3** | Unchanged, and now better motivated: `form` over a record's fields is how a transform builds a list of `%line`s in source order. |
| **4** | **No new renderer algorithm** — [§3](#3-the-renderer-and-the-language-profiles) is implemented as written, with one substitution: the fold reads `at` where it would have counted recursion depth, which is strictly simpler. What is added is the **entry point**: `render` accepts a unit whose `decls` are fragments and folds them directly, without a declaration lowering. Two things to pin. (i) A **fragment-only profile** — `indent` and the escape table, nothing else — rendered against a fragment unit, which is the executable form of the claim that a profile's size is proportional to how much of the declaration vocabulary a target uses; call it `aontu:lang/text` and make it the third profile rather than a fourth language. (ii) `render.tsv` rows for depth, blank runs, `raw` with and without `reindent`, and a line assembled by `join`. |
| **5** | Unchanged. The sidecar's four facts feed the declaration lowering; a fragment transform reads the model like any other. |
| **6** | **Where it pays off, and the acceptance case changes.** `walk` plus `match` plus fragments is apply-templates with its result tree: each matched node emits `%line`s at a depth, the list concatenates in pre-order, and the renderer serialises. The acceptance case should therefore be a target the declaration vocabulary does **not** fit — a Python module or a YAML manifest from the same model that produces the Go and TypeScript units — because that is the claim the rule layer exists to support, and a phase that only re-derives declaration output has not tested it. |
| **7** | Unchanged, and slightly less exposed: a fragment unit is bytes like any other, so the bridge sees no new shape. |
| **8** | Unchanged. Interpolation composes a line's inline pieces more cheaply than `+`, which is a convenience over the algebra rather than a prerequisite for it. |

**One thing the fragment algebra does not change.** It adds no
combinator, no grammar and no builtin. `walk` and `form` were already
in the plan; `join` has landed; the nodes are schema. The whole
correction is reachable in the phases as they stand.

### Open question added by this amendment

- **Scaffolding, and whether it is Jostraca's.** Neither this design
  nor [GENERATION-FORMS.0.md](../design/GENERATION-FORMS.0.md) has a
  story for starting a project — there is no `aontu init`, in either
  CLI, and nothing creates a `mod.aon` or an `aontu_meta/`. Jostraca
  owns exactly the primitives that job wants (folder structure,
  `Copy`, `Fragment`), and the G9 bridge deliberately uses none of
  them: it passes `raw: true` so that Jostraca templates nothing, and
  the two `from` reads are already flagged in
  [Open questions](#open-questions) as filesystem reads outside
  `trust.include`'s confinement. A scaffolder whose templates ship
  **inside the engine**, as the bundled models do, has neither
  problem — it reads nothing from disk and confines its writes the way
  `render --out` does. **Answered, 2026-09-04:**
  [INIT.0.md](../design/INIT.0.md) designs `aontu init` on exactly
  that footing — templates as bundled source constants, no filesystem
  read, no Jostraca, and the opposite lifecycle to `render` (it writes
  once and refuses a second run, where generation writes every time and
  must reason about what it finds). D3 is unaffected: the bridge still
  drives Jostraca, because generation is the repeated run over
  hand-edited files and that is what Jostraca is for. That note also
  corrects this design's claim that `render` is the first verb with a
  write effect — `fmt -w`, `agentsmd --write`, `mod tidy`,
  `mod vendor`, `set --overlay` and `view --out` all write today.

---

## Worked assessment 2026-09-04: a production backend

*The four worked examples above are built from this repository's own
[`use-cases/`](../../use-cases/). This one is not: it is
[voxgig/podmind](https://github.com/voxgig/podmind)'s `backend/`, a
deployed Seneca service on AWS Lambda, read at `ab7f333`. It is the
first external evidence this design has, and it is evidence of a
particular kind — a project that already runs the pipeline this design
proposes, with the pieces in different places. Every VERIFIED claim
below was run against `node ts/bin/aontu.js` at 0.56.0.*

### What the project does today

```
model/*.jsonic (5 files, ~540 lines, plus a common model from npm)
  -- voxgig-model, an evaluator -->
model/model.json (1577 lines)
  -- three builder scripts, named in model/.model-config/ -->
  -- each ~15 lines, calling @voxgig/build's EnvLambda.* -->
gen/serverless/*.yml (4 files, 542 lines)   src/handler/lambda/*.ts (10 files)
```

A hand-written `serverless.yml` then pulls the generated YAML in with
`functions: ${file(./gen/serverless/srv.yml)}` and
`resources: Resources: ${file(./gen/serverless/res.yml)}`.

That is [D5 and D7](#the-owners-decisions) already in production: one
model, many outputs, several target languages, one run.

### Finding 1 — the model layer is already aontu, and needs no work

The `.jsonic` files are aontu documents under the old extension: `@`
includes, `&:` spreads, `$.` references, preference marks. **VERIFIED
at 0.56.0**: with the one external include (`@voxgig/podmind-common`)
reconstructed from the committed `model.json`, the current engine
evaluates the model and reproduces **all twelve services and the whole
`msg` section byte-identically** against the committed output. The
remaining differences — `main.shape`, `main.conf.port`, the entity
field sets — are all supplied by that external model and absent from
the reconstruction, not engine behaviour.

One detail from the probe is worth keeping, because it is the kind of
thing a migration trips on: the reconstruction only completed once the
shape's scalar leaves were written as **preferences**. A shape supplies
defaults that a service overrides — `monitor` turns `api.web.active`
off — and a literal cannot be overridden. Generated JSON cannot carry
that mark, so a model reconstructed from its own output is not the
model.

So the migration is an extension rename and a version bump, not a
rewrite. Everything that follows is about the layer *after* the model.

### Finding 2 — the generator holds facts the model does not

VERIFIED by grep across the whole backend: `role:
BasicPodmindLambdaRole` and `memorySize: 1024` appear in **no model
file, no conf file and no hand-written YAML** — only in generated
output. They come from `@voxgig/build`. The IAM role that `srv.yml`
references is *defined*, ninety lines of it, by the same generator in
`res.yml`.

So this system's memory budget per function and its IAM naming
convention are decisions living in a Node library, not in the document
that is supposed to be ground truth. That is the disease this
capability review exists to remove, one layer further out than the
design had looked: [G8](g8-generation.md) removed the copy inside a
document, G9 removes it between the document and what is derived from
it, and here it is between the document and *the generator's own
defaults*.

**This is the cheapest available win and it needs none of G9.** Moving
`memorySize`, the role name and the timeout into the model is a model
change, available today, and it makes the model more nearly ground
truth whatever generates from it afterwards.

### Finding 3 — the two targets are exactly the two the fragment algebra was added for

**The serverless YAML is indentation-as-syntax**, which
[Open questions](#open-questions) named as the acid test of the
indentation design and which the
[second amendment](#amendment-2026-09-04-second-aontucode-and-the-fragment-algebra)
answers. It is not a mild case: `srv.yml` nests a list inside a map
inside a map —

```yaml
auth:
  handler: dist/handler/lambda/auth.handler
  timeout: 30
  events:
    - http:
        path: "/api/public/auth"
        method: POST
```

— which is four depths and a list marker, with every level structural.
A flat, depth-tagged fragment renders it directly; a declaration
vocabulary has no node for any of it.

**The lambda handlers are not declaration-shaped.** A handler is an
import, a small function, and an exported async arrow whose body is
real code. Under the declaration vocabulary alone the whole file is one
`{k:"text"}` blob — an escape, counted as loss, opaque to `diff` and
`subsume`, and unable to render to a second target. Under the fragment
algebra it is composed lines, and the ten handlers differ from each
other only in a name and one optional `complete()` body, which is
precisely a `walk` plus `match` over the service list.

### Finding 4 — the builders are form (a), and the split is already there

Each build script is about fifteen lines: it names an output folder and
calls one `EnvLambda` function. All the work is in `@voxgig/build`.
Comparing the evaluated `auth` service against its generated YAML,
every field is either a direct read or a concatenation the language can
already do today:

| generated | from the model |
|---|---|
| `handler: dist/handler/lambda/auth.handler` | `env.lambda.handler.path.prefix` + name + `.suffix` |
| `timeout: 30` | `env.lambda.timeout` |
| `path: "/api/public/auth"` | `api.web.path.prefix` + `.area` + name + `.suffix` |
| `method: POST` | `api.web.method` |
| `cors: false` | `api.web.cors.active` |
| `role`, `memorySize` | **nowhere** — finding 2 |

The split this design predicts — derivation to the transform, layout to
the renderer — is the split the project already has. The line is just
drawn inside a Node library rather than between a document and a
renderer, which is why the derivation half is invisible and untestable
today.

### What it would take, by phase

| what | needs |
|---|---|
| The model | nothing (finding 1) |
| `memorySize`, `role`, timeouts as model facts | nothing (finding 2) |
| `srv.yml` — twelve services, four depths | phase 1 (fragments), 3 (`form`, for source order), 4 (renderer, `aontu:lang/text` profile) |
| The ten lambda handlers | the same, plus phase 6 (`walk` + `match` over the service list) |
| `res.yml` — 306 lines of CloudFormation from the entity and conf sections | the same, and it is the largest single piece of real work: the AWS knowledge in `EnvLambda` becomes a transform |
| Four files and ten handlers in one run | phase 6 (the manifest), which is `.model-config`'s builder registry in another spelling |
| Regenerating over a tree that also holds hand-written files | phase 7 — `serverless.yml` is hand-written beside the generated tree, so protected regions are not optional for this consumer |

### What this use case adds to the design

- **A third profile with a waiting consumer.** "Which target ships
  third" is an open question here; this project answers it with YAML,
  and answers it with 542 lines of it that a real deployment depends
  on.
- **Evidence for the manifest, before it is built.** `.model-config`'s
  builder registry, three named entries loaded by path, is the manifest
  of [§6](#6-the-manifest-d5-iv-d7) with the outputs named as Node
  modules instead of as transforms. The shape is confirmed; what
  changes is what sits behind each name.
- **A caution the design should carry.** The honest sizing is that
  `res.yml` is not a formatting exercise: `EnvLambda` knows DynamoDB
  table shapes, IAM policy statements and S3 bucket conventions, and
  moving that into a transform is real work with a real risk of getting
  a deployed system wrong. The migration order that follows from
  findings 1 and 2 is therefore: fix the model first, which is free;
  then take `srv.yml`, which is the smallest artifact and the most
  mechanical; and leave `res.yml` until the renderer has been proven on
  the other two.

## Amendment 2026-09-04 (third): the rule layer moved to design notes

The rule layer of [§2](#2-the-rule-layer--apply-templates-in-the-engine)
and the surface above it are now specified as mechanisms, in two design
notes, on the pattern this document already uses for
[GENERATION-FORMS.0.md](../design/GENERATION-FORMS.0.md):

- **[EMIT.0.md](../design/EMIT.0.md)** — `emit(select, table)`. The
  table as data, the flat result, no `mode`, how a selector resolves,
  why `path()` is the wrong tool for it, and the four engine facts that
  make the dispatch a builtin rather than an idiom.
- **[TEMPLATE.0.md](../design/TEMPLATE.0.md)** — the target-syntax
  surface. The marker, `replace` in place of an inline hole, the two
  static checks, `esc`/`usc` and escape-by-default, the per-line quote,
  and whitespace control.

**What prompted them.** Four successive prototypes of a generator for
the [assessed backend](#worked-assessment-2026-09-04-a-production-backend)'s
twelve Lambda handlers were built, and **none contained an
apply-templates** — each was a functional transformation with the
target code inside aontu strings, so the output shape was welded to
that one target and the rule layer was never exercised. The fifth does
contain one, and reproduces all twelve handlers byte-identically from a
generator written in TypeScript with `//-` comments carrying the
aontu.

**What it changes here.**

| Phase | Change |
| --- | --- |
| **1** (`aontu:code`) | Unchanged. The vocabulary is what a body's pieces are checked against, and what `emit`'s return type names. |
| **3** (`form`) | Strengthened twice. The routes closed in EMIT.0.md's fact 2 are all "the value is there and the engine will not settle it inline"; and TEMPLATE.0.md's name-derivation chain needs `form` specifically, because `pack` over a list of strings REORDERS — VERIFIED, `aim, ingest, process, episode` comes back sorted. |
| **4** (the renderer) | Unchanged, and confirmed — `emit` returns the flat piece list the fold already reads. `esc`, `usc`, `rep` and `split` are ordinary string builtins with no renderer coupling and can land earlier. |
| **6** (`walk`) | **Re-scoped, and it is the load-bearing phase.** It ships `emit(select, table)` per EMIT.0.md rather than `walk(data, tmpl)` with the rules encoded in `match` argument positions, and gains a second acceptance case — a RECURSIVE rule set — because that is the one case no amount of user-space work reaches. |
| **new, after 6** | The template surface of TEMPLATE.0.md. It is a sugar with one rule and a round-trip test, and it cannot be written before `emit` exists, because it desugars to `emit`. |

The [§2](#2-the-rule-layer--apply-templates-in-the-engine) formula
`join(walk($.model, match(_, …)), "\n")` is superseded by
EMIT.0.md's spelling. Every word of the totality argument that follows
it stands: it is about the structure descended, not about how rules are
spelled.

## Amendment 2026-09-05 (fourth): the render plan

[RENDER.0.md](../design/RENDER.0.md) is the plan for the remaining
phases, with `aontu render` as the spine, on the pattern the third
amendment set for the rule layer. It inherits [§1](#1-the-output-vocabulary--aontucode),
[§3](#3-the-renderer-and-the-language-profiles) and [§6](#6-the-manifest-d5-iv-d7)
and departs from them in ten named places (its §9). The ones that
change what a reader of this document would otherwise plan against:

| Here | There |
| --- | --- |
| §3's `line(body)` right-trims space and tab | no trim: a body line is verbatim, because TEMPLATE.0.md D8's two-space lines are significant (RENDER D3) |
| the second amendment's `%piece` is three records | a bare string is a piece — a line at depth 0, terminator-checked at the node (RENDER D2) |
| §6's manifest document, `--manifest`, and the `aontu:gen` name | the unit is the manifest: `path`, `lang`, `pkg`, `profile?`; `at` is replaced by the coverage report (RENDER D4) |
| `--profile <name\|file>` applied to every unit | a profile declares its `lang`; `--profile <file>` repeats and matches by it; a fragment-only unit needs no profile (RENDER D5) |
| `--stdout` | one unit's bytes, or `--unit <path>`; `--check <dir>` needs no `--out` (RENDER D8) |
| phase 1 "needs MODELS M0 first" | needs M0's resolver leg only; the rename of the two shipped models follows on its own (RENDER P0) |
| phases 1, 4 and 6 as written | re-cut as P0–P7 around the verb; the surface phase is numbered **9**; phases 5, 7 and 8 leave the critical path with a recommendation each (RENDER §4, §7) |
| `docs/design/EMISSION.0.md`; "ADR-012 is required" for Jostraca | the note is RENDER.0.md; ADR-012 is taken, and the bridge, if it proceeds, takes the next free number |

The first usable `aontu render` is P0–P4 — the resolver leg, the
vocabulary with fragments, the `join` mark fix, the fragment fold with
the `text` profile, and the verb — and it is the release that ends
the 0.57.0 documentation skew. Acceptance case 1 is met there; the
declaration lowering and the two language profiles follow as P5, and
the template surface as P8.

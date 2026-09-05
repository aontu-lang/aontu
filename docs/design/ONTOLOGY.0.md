# Ontology, generation and independent validation — design note

**Status:** Discovery draft. **Nothing here is implemented.**
**Origin:** Richard Rodger, 2026-08-28 — ontological tooling for
software agents, for both specification and validation.
**Method:** every claim below about what the tools do **today** was
probed in-tree against both ports and carries its probe. Claims about
what they **should** do are argument, and are marked as such.

---

## 1. The goal, in three parts

An agent writing software needs three things, and aontu is positioned
to supply all three from **one** artefact:

1. **A specification it cannot misread.** Not prose, not a README: a
   document with a checked meaning, a canonical form, and a hash.
2. **Code generated from that specification**, so the agent does not
   re-derive the types by hand and get them subtly wrong.
3. **Validation that does not trust the agent**, driven by the same
   specification — scenarios and fuzz, executed by something that never
   saw the agent's code.

The third is the one that makes the first two worth having. An agent
that generates both the implementation and its tests from the same
misreading is *consistent and wrong*. Independent validation is what
converts a specification from documentation into a gate.

**Existing vocabularies matter because agents do not get to invent
meaning.** If a document says `name`, `identifier`, `dateCreated`, an
agent should be able to establish that these are Dublin Core or
schema.org terms and not local coinages — and a validator should be able
to check the document against what those terms actually require.

---

## 2. What this builds on

None of the three goals starts from nothing. The capability review's
G1–G8 already landed most of the substrate:

| Landed | What it gives this design |
|---|---|
| **G1** constraint algebra | `min`/`max`/`re`/`length`/`unique`/`must` — a *value space*, not just a type. This is what scenarios and fuzz are derived from. |
| **G2** `vet` | schema-vs-data validation with machine-readable findings (`path`, `code`, `expected`, `sites`). |
| **G3** `subsume` / `breaking` | "does this spec still admit everything the old one did" — version gating for a published vocabulary. |
| **G4** `id()` / `refer()` / `relations` / `reaches` | **an ontological substrate already exists.** Entities have addresses, links are typed and checked, and the graph is derivable. |
| **G5** trust contract | hermeticity — and, as §4 shows, the constraint that decides how importing works. |
| **G6** modules | `mod tidy` / `verify` / `vendor` / `manifest`, with `aon1-` integrity pinning. |
| **G7** machine access | `get`, `why`, `jsonschema`, `agentsmd` — the surfaces an agent reads. |
| **G8** generation | `pack`, `each`, `filter` — deriving many values from one template. |

**The `refer()`/`id()` layer is the point to notice.** aontu already has
entity identity and checked, typed links between entities. That is the
part of an ontology that most schema languages lack, and it was built
for a different reason. This design is largely about *feeding* it.

---

## 3. Empirical baseline — what the tools do today

Probed in-tree, both ports, at `0d1`-era `main`. This is the honest
starting line; several rows are worse than expected.

| # | Probe | Result | Note |
|---|---|---|---|
| 1 | `aontu jsonschema` on a constrained map | emits `2020-12` schema with `minimum`, `type`, `required` | **the code-generation path already exists** |
| 2 | `@"v.aon"` where the file holds JSON | parsed as source, both ports | JSON is a subset of the grammar, so a vocabulary dump is includable *as source* — and this is the **only** extension the two ports agree on |
| 3 | `@"v.jsonld"` | read as JSON data, both ports | was a parity break: TS handed back the raw TEXT. Settled by ADR-012 |
| 4 | `@"v.txt"`, `@"v.dat"`, a name with no extension | refused, `include_extension`, both ports | was the same split. Settled by ADR-012 |
| 5 | **`@"v.json"`** | read as JSON data, both ports | **was a TypeScript crash** with no code, path or site. Settled by ADR-012 |
| 6 | `relations` on an `id()`/`refer()` document | `verdict: pass` | the graph surface is live |

### 3.1 The prerequisite, now met

Rows 3–5 were not incidental. **Every vocabulary in §5 ships as `.json`
or `.jsonld`**: schema.org's releases are
`schemaorg-current-https.jsonld`, microformats2 parsers emit JSON, DCMI
publishes RDF serialisations. Not one of them is a `.aon` file, and
`.aon` was the only extension the two ports read the same way.

The cause was one line on each side — `ts/src/lang.ts` registered
`processor: {aontu, aon}` and let everything else fall through to raw
TEXT; `go/source.go` also registered the empty kind `""`, the fallback
for an unrecognised extension, and so parsed everything as source. So
TypeScript handed back a 40 KB *string* where Go handed back a map,
both at exit 0. `.json` alone crashed, because it is the one extension
with an upstream default processor: an internal error with no code, no
path and no site, the §43 shape again.

**Ruled and fixed 2026-08-30**, as
[ADR-012](../../ADR.md#adr-012--an-includes-extension-decides-what-the-file-is-aontu-source-config-data-or-refused):
the extension says which of two things a file is. `.aon` and `.aontu`
are aontu source; `.json` and `.jsonld` — with `.jsonc`, `.json5`,
`.jsonic`, `.jsc`, `.toml`, `.yaml`, `.yml` and `.ini` — are
configuration **data**, read by that format's own parser into the JSON
value it denotes. Every other extension, and a name with no extension,
is refused by name. A vocabulary is therefore data, not source: what
it holds is a map of scalars, lists and maps, and nothing in it is an
aontu construct. Filed as
[`use-cases/BUGS.md` §49](../../use-cases/BUGS.md#49-an-includes-extension-decides-the-answer-and-the-two-ports-decide-differently-fixed-2026-08-30).

**P1 below is therefore unblocked**: an included vocabulary now means
the same thing in both ports, so §6's projection can be tested. What
P1 still owes is its own work — this only removed the thing standing
in front of it.

---

## 4. Hermeticity decides how `@import` works

This is the load-bearing constraint, and it settles the question the
brief asks ("how?") before any syntax is chosen.

[`docs/trust.md`](../trust.md) clause 1 states that an evaluation's
output is a pure function of exactly four inputs — the entry text, the
resolved `@"…"` include closure, the host `$` bindings, and the
evaluator — and then says, of the language:

> **no clock, no randomness, no environment access, and no network**

That is not a current limitation. It is a permanent commitment, and the
determinism claims (byte-identical output across runs and across both
ports) rest on it.

**So `@import` cannot fetch.** Not lazily, not with a cache, not "only
the first time". A construct that reads `https://schema.org/…` during
evaluation would make the output a function of the network, and every
guarantee in trust.md would become conditional.

**The answer already exists in the repository: a vocabulary is a
module.** G6 built exactly this machinery for a different reason:

- `mod tidy` resolves the closure and writes `aontu_meta/mod-lock.aon`, pinning
  every dependency by `aon1-` hash — **this is where the network is
  touched, at tool time, by a human or CI, never during evaluation**;
- `mod verify` re-checks that every locked module still means what the
  lock pins, and changes nothing (the CI gate);
- `mod vendor` materialises the closure into `aontu_meta/vendor/`;
- evaluation then reads only local files through the ordinary `@"…"`.

**This is the whole answer to "how do we `@import` these?"** Not a new
verb — a *packaging convention* on top of a verb that exists. The
vocabulary is fetched once, converted once, pinned by hash, vendored,
and thereafter is just source. An agent evaluating the document reads
no network and gets a byte-identical answer to everyone else's.

It also gives the property that matters most for agents: **the meaning
of `dcterms:created` in your document is pinned to a hash.** If DCMI
revises the term, your build does not silently change; `mod verify`
fails and a human decides.

---

## 5. What the vocabularies actually publish

Concrete, because the projection in §6 depends on it.

### Dublin Core (DCMI Metadata Terms)

Four namespaces, still the canonical minimal vocabulary for describing
*anything*:

| Namespace | What it is |
|---|---|
| `http://purl.org/dc/elements/1.1/` | the original 15 elements |
| `http://purl.org/dc/terms/` | the extended terms |
| `http://purl.org/dc/dcmitype/` | the DCMI Type vocabulary |
| `http://purl.org/dc/dcam/` | terms for describing vocabularies |

Each term carries: **Name, Label, URI, Definition, Type of Term**, and
optionally **Comment, Subproperty Of, Domain, Range, Domain Includes,
Range Includes, Member Of, Equivalent Property**. Term URIs resolve to
RDF schemas for programmatic use.

That attribute set maps almost directly onto an aontu record — see §6.

### schema.org

The largest general vocabulary, and the one agents meet most often
(it is what search engines and LLM training corpora are saturated with).
Published as versioned releases (**30.0** at time of writing) in
`data/releases/<version>/`, as **JSON-LD, Turtle, N-Triples, N-Quads,
RDF/XML and CSV**, in `-current-` (live terms) and `-all-` (including
retired) variants, over `https` and `http` namespaces.

The JSON-LD is a flat `@graph` of entries. A class:

```json
{ "@id": "schema:Paperback",
  "@type": "schema:BookFormatType",
  "rdfs:label": "Paperback",
  "rdfs:comment": "A flexible, lightweight book…" }
```

A property:

```json
{ "@id": "schema:episodes",
  "@type": "rdf:Property",
  "rdfs:label": "episodes",
  "rdfs:comment": "An episode of a TV/radio series or season.",
  "schema:domainIncludes": [ … ],
  "schema:rangeIncludes": { … } }
```

**`domainIncludes` / `rangeIncludes` are the interesting part, and they
are deliberately weaker than `rdfs:domain` / `rdfs:range`.** They are
*suggestions* — a union of classes on which the property is expected —
not constraints that license inference. schema.org's own OWL export has
to convert them with `owl:unionOf` to make them formal. That weakness
is a **feature** for this design: it is already the "good enough"
posture the brief asks for, and it maps onto aontu's open-by-default
maps without pretending to more rigour than exists.

### microformats2

Not RDF at all — HTML class attributes with a defined **JSON** parse
result, which is why it is worth including: the projection target is
already JSON.

```json
{ "items": [ { "type": ["h-card"],
               "properties": { "name": ["John Doe"] },
               "children": [] } ],
  "rels": {}, "rel-urls": {} }
```

Four property prefixes carry the *value kind*, which is exactly a type
annotation by another name:

| Prefix | Meaning |
|---|---|
| `p-` | plain text |
| `u-` | URL, normalised absolute |
| `dt-` | date-time, with parsing rules |
| `e-` | embedded HTML (both `html` and `value`) |

`u-` and `dt-` are directly expressible as aontu constraints
(`re(…)` for URL shape, a date pattern for `dt-`). **`p-`/`u-`/`dt-`/
`e-` is a four-element type system that happens to be spelled as a
naming convention** — and mapping it into the constraint algebra loses
nothing.

### Others worth taking

Researched and ranked by what they would actually buy:

| Vocabulary | Why |
|---|---|
| **SKOS** | concept schemes, `broader`/`narrower`/`related` — the standard way to say "this is a controlled vocabulary". Increasingly used to ground LLM/RAG systems, which is this design's constituency. |
| **FOAF** | people/organisations/accounts; small, stable, ubiquitous. |
| **PROV-O** | provenance — who derived what from what. Directly relevant to agent-generated artefacts. |
| **DCAT** | dataset catalogues; the government/open-data lingua franca. |
| **OWL / RDFS** | not to *import* but to understand: `subClassOf` is the only cross-vocabulary relation that must survive projection. |
| **SHACL / ShEx** | the RDF world's *validation* layer. Closest in spirit to `vet`, and the right place to look for prior art on shapes-as-constraints. |
| **JSON Schema** | already a target (`aontu jsonschema`); should become a **source** too. |
| **CDDL** (RFC 8610) | concise data definitions for CBOR/JSON; unusually close to aontu's own grammar. |

**Prior art that should be read before building any of this: LinkML.**
It defines schemas in one place and compiles them to OWL, JSON Schema,
SHACL and more — the same "one source, many targets" shape this design
proposes, with years of experience in biomedical and government data.
Where LinkML is a schema language that emits ontology artefacts, aontu
would be a *unifier* that ingests them; the question worth asking is
whether LinkML should be an import format rather than a competitor.

---

## 6. The projection: RDF is a graph, aontu is a tree

This is where "good enough is good enough" has to be made precise,
because the impedance mismatch is real and cannot be wished away.

**The mismatch.** RDF is a set of triples over a global namespace with
no inherent nesting, multiple inheritance, and properties that exist
independently of any class. aontu is a tree of maps with unification,
open by default, where a "property" is a key *inside* a map.

**What projects cleanly:**

| RDF / vocabulary | aontu |
|---|---|
| a class | a `type()`-marked map, or an alias (`%Person`) |
| `rdfs:label`, `rdfs:comment` | documentation, not value — kept beside, not inside |
| a property with `domainIncludes: C` | a key on `C`'s map |
| `rangeIncludes: Text` | `string` (or a constraint) as the key's value |
| `rdfs:subClassOf` | conjunction: `%Employee = %Person & { … }` — **unification IS subclassing** |
| a controlled vocabulary (SKOS) | a disjunction of literals, `"a" \| "b" \| "c"` |
| `u-`/`dt-` microformat kinds | `re(…)` constraints |
| an entity link | `refer()` — already checked, already typed |

**Unification is the part that fits unusually well.** In RDF,
`subClassOf` is an inference rule that needs a reasoner. In aontu,
`%Employee = %Person & {employeeId: string}` *is* the subclass, checked
by the evaluator, with no reasoner and no open-world assumption to
reconcile. Multiple inheritance is `&` of several parents, and it
either unifies or it is a located conflict — which is a better answer
than silent inconsistency.

**What does not project, and should not be faked:**

- **Open-world semantics.** RDF says "absence is not denial"; `vet`
  says a required key is missing. These are different logics and the
  projection must pick one. **Pick aontu's**, and say so.
- **Reasoning.** No transitive closure, no `owl:sameAs`, no
  entailment. `reaches` answers reachability over *declared* relations;
  it is not a reasoner and should not pretend to be.
- **Global identifiers as first-class.** A URI is a string here. G4's
  `id()` addresses are the local analogue and are not the same thing.
- **Properties without a domain.** schema.org has plenty. They become
  *available* keys, not keys of any particular type.

**The rule that follows: a projection is a lossy, one-way, pinned
artefact — and it must say so in the file it produces.** Not a live
binding to the vocabulary. This is exactly the "good enough" the brief
asks for, and being explicit about the loss is what makes it safe:
an agent reading the projection must be able to tell that
`schema:Person` here means *what aontu could represent of* the 30.0
release of `schema:Person`, pinned by hash.

### The proposed surface

The brief asks how `@import` should be spelled. Given §4, the honest
answer is that **most of it is not new syntax at all**:

```
# aontu_meta/mod-lock.aon pins it; aontu_meta/vendor/ holds it; this is just an include.
%schema = @"aontu_meta/vendor/schemaorg/30.0/schema.aon"

Person: %schema.Person & {
  name:  string
  email: re("@")
}
```

Two things that *are* new, and both are tool-side rather than
language-side:

1. **A converter**, `aontu vocab import <url|file> --as <name>` —
   fetches (at tool time), projects per §6, writes an `.aon` module,
   records the source URL, the release version and the projection's own
   version in the file, and pins it in `aontu_meta/mod-lock.aon`.
2. **A namespace convention** so the projection is legible: one module
   per vocabulary release, classes as top-level `type()`-marked names.

**The alias sigil (`%`) is the right spelling for the imported names**,
and the alias work landed today is a prerequisite rather than a
coincidence — but note that P1 aliases are **file-local and do not
survive an include**, so cross-file alias binding (`export` and the
destructure, P2 of `ALIASES.0.md`) is a hard dependency of this design.
Until P2 lands, an imported vocabulary can only be reached by path
(`$.schema.Person`), not by name.

---

## 7. Versioning: schemas and models that move

The brief is right that this is a gap, and it is a bigger one than it
first looks. Everything in §§5–6 assumes a vocabulary *has* a version
(schema.org 30.0, DCMI 2020-01-20), and everything in §§9–10 assumes a
spec can change without silently invalidating what was generated from
it. aontu today has strong **module** versioning and almost no
**schema** versioning, and the two are not the same thing.

### 7.1 What exists

| Mechanism | What it does |
|---|---|
| `mod tidy` | minimum version selection over the module closure, writing `aontu_meta/mod-lock.aon` |
| `mod verify` | every locked module still means what the lock pins — an `aon1-` integrity check |
| `breaking --against <file\|git#rev>` | is this change breaking, against a prior version of the same document |
| `subsume <general> <specific>` | does the general admit everything the specific does |
| `deprecate(x, {msg, use, since})` | a per-field deprecation record with a `since` string, surfaced by `vet`, the LSP, and `breaking --allow-deprecated-removal` |
| `aon1-` | a content hash of *meaning*, not of text |

That is a real foundation — better than most schema languages have.
`aon1-` in particular is the thing that makes versioning tractable at
all: two documents with the same hash mean the same thing, so "did this
change?" is decidable rather than diffable.

### 7.2 What is missing, and why each matters here

**M-1. A document cannot state its own version.** There is no
first-class version on a schema — `deprecate`'s `since` is a string on
one field. So a generated artefact cannot record *which version of the
spec* it came from except by hash, and a hash is not orderable. An
agent asked "is this code current?" can compare hashes, but cannot say
"the spec has moved from 1.2 to 1.3".

**M-2. Two versions cannot coexist in one document.** Importing
schema.org 29 and 30 together, or holding an API's v1 and v2 side by
side during a migration, collides on names. This is the single most
common real requirement in schema evolution and the language has no
answer. Aliases help *within* a file, but P1 aliases do not survive an
include (§6), so today the only mechanism is path prefixing by hand.

**M-3. Compatibility is binary, when it has a direction.** `breaking`
answers yes/no. Real evolution distinguishes:

| Direction | Question | Who it protects |
|---|---|---|
| **backward** | can a *new* reader read *old* data? | deployed data, old records |
| **forward** | can an *old* reader read *new* data? | deployed code, slow rollouts |
| **full** | both | mixed fleets |

Avro and Protobuf make this explicit because distributed systems need
it. **aontu can already compute it and does not name it:** `subsume A B`
and `subsume B A` are exactly the two directions, so backward, forward
and full compatibility are derivable *today* from machinery that
landed for another purpose. That is a naming and surfacing job, not a
new engine capability, and it is the highest value-per-effort item in
this section.

**M-4. There is no migration expression.** `breaking` says a change is
breaking; nothing says *how to move data across it*. For the agent use
case this is the interesting half — given v1 and v2 of a spec, the
useful output is a migration, and an agent is well placed to write one
if the shapes are machine-readable on both sides.

**M-5. Version selection is module-level only.** `mod tidy` does MVS
over modules. A *field* cannot say "any 1.x shape of this type",
which is what a long-lived schema with plugin-supplied fragments needs.

**M-6. A vocabulary projection needs two versions, not one.** Recorded
already as O-2: the vocabulary release *and* the converter version,
since a converter fix changes the projection while the vocabulary
stands still.

### 7.3 The shape of an answer

Argument, not decision — these are the options that look worth
exploring, roughly in order of value over cost.

**Name the compatibility directions (cheap, high value).** A verb —
`aontu compat <a> <b>` — that runs `subsume` both ways and reports
`backward` / `forward` / `full` / `none`. No engine change; it is a
composition of what exists, and it turns a yes/no gate into the answer
CI actually wants.

**A version is a value, not a comment.** If a schema declares
`%version = "1.3.0"` as an ordinary alias or a marked field, then it
canons, it hashes, it unifies — and `breaking` can *require* that a
breaking change carries a major bump rather than merely reporting that
one occurred. The rule "the version must move when the meaning moves"
is checkable, because `aon1-` already decides when the meaning moved.
**That is the sharpest version property available here and no other
schema language can state it**, because none of them has a hash of
meaning.

**Coexistence by namespace, not by cleverness.** M-2 wants two versions
in one document. The honest mechanism is the module one: two vendored
modules, two names, `%v1` and `%v2` — which needs alias export (P2)
and nothing else. Resist anything smarter; version-aware name
resolution is where schema languages go to die.

**Migration as a document.** A migration from v1 to v2 is itself an
aontu document: a mapping from old paths to new, expressible with the
existing `set`/`get`/reference machinery, checkable by vetting the
*result* against v2. This wants no new language feature and would be a
good early test of whether the generation story (§9) holds up.

**Leave field-level version ranges (M-5) alone for now.** It is the
most invasive and the least evidently needed; a constraint algebra over
version ranges is a new domain in G1, and nothing in the brief requires
it yet.

### 7.4 Where versioning meets the agent story

The reason this section is not a digression: **an agent's most common
failure is working from a stale specification.** Every generated
artefact in §9 — types, validators, omni specs, fuzz corpora — should
carry the `aon1-` of the spec it came from, so "is this current?" is a
comparison rather than a judgement. And when it is *not* current, the
useful next output is a migration and a compatibility direction, not a
diff.

That is the whole argument for treating versioning as part of this
design rather than as separate work: the ontology gives an agent
*meaning*, the generation gives it *code*, the validation gives it a
*gate* — and versioning is what keeps the three from drifting apart the
first time the spec changes.

---

## 8. Formal specifications: TLA+, Lean, TypeScript, IDL

The brief's framing is right: **good enough is good enough**, and the
useful question is *direction*. For each, aontu is either a **source**
(it emits) or a **sink** (it ingests), and confusing the two is how
this kind of integration usually fails.

| System | Direction | What is realistic | What is not |
|---|---|---|---|
| **TypeScript types** | **both** | Emit `.d.ts` from a spec — structural, unions, optionals, literal types all map. Ingest a *subset* of `.d.ts` back (interfaces, unions, primitives). | Conditional types, mapped types, inference. Ingesting arbitrary TS is a compiler project. |
| **JSON Schema** | **both** | Already emitted (probe 1). Ingesting is tractable and high-value — it is how most APIs are described. | `$dynamicRef`, full `unevaluatedProperties` semantics. |
| **IDL** (Protobuf, Thrift, Avro, CDDL, ASN.1) | **source** | Emit `.proto`/`.cddl` from a spec. Field numbering is the only real design question, and `breaking` already knows about compatibility. | Ingesting is possible but low-value — IDL is *less* expressive than the spec, so the round trip loses the constraints that matter. |
| **TLA+** | **sink, narrowly** | Take the **state shape** and **invariants** from a spec and emit a TLA+ skeleton; take model-checker *output* back as data (`tla2json` exists). | Temporal logic, fairness, liveness. aontu has no notion of *time* or *step*, and trust.md forbids adding one. |
| **Lean** | **sink, narrowly** | Emit structure definitions. Lean 4 has JSON Schema derivation with proofs (`lean4-json-schema`), so the bridge is `jsonschema`, not a direct one. | Proofs. aontu is not a proof assistant and should not gesture at being one. |

**The honest summary: aontu is a good *source* and a poor *sink* for
the formal systems, and the reverse for the data-description ones.**
The reason is expressiveness. Emitting to a weaker language is a
projection you control; ingesting from a stronger one is a compiler you
must maintain forever. So the roadmap should be: emit TypeScript, IDL
and JSON Schema; ingest JSON Schema, CDDL, and vocabulary projections;
and treat TLA+/Lean as *adjacent* — hand them a state shape, take back
a verdict, do not try to be them.

**Where TLA+ genuinely earns its place** is the one thing this design
cannot do: aontu describes *states*, never *transitions*. A spec can
say what a valid order looks like; it cannot say that an order may go
`pending → paid → shipped` but never `shipped → pending`. If protocol
correctness matters, that is TLA+'s job, and the integration is to
generate its state shape from the spec so the two cannot drift.

---

## 9. Code generation for agents

`aontu jsonschema` already exists (probe 1), and JSON Schema is the
widest-reach target. What a *type-safe spec for agents* needs beyond it:

- **Emit to the target language's own types**, so the compiler is the
  enforcement: `.d.ts`, Go structs, Rust structs, Python dataclasses.
  The constraint algebra does not survive into most type systems —
  `min(0)` is not expressible in a Go struct — so each emitter must
  also produce a **validator**, and the two must be generated from the
  same source in one pass or they drift.
- **`agentsmd` is the sleeper here.** It already exists and generates
  agent-facing documentation from a document. The specification, its
  prose, and the generated types coming from one source is precisely
  what stops an agent reading a stale README.
- **`aon1-` on the generated artefact.** Every emitted file should
  carry the hash of the spec it came from, so drift is a check rather
  than a code review.

---

## 10. Independent validation with omni

[voxgig/omni](https://github.com/voxgig/omni) is the right shape for
goal 3, and its own description is the reason:

> One test spec, written once as plain JSON, run by the same runner in
> twenty-four languages.

Its spec format is hierarchical JSON:

```json
{ "primary": { "functionName": { "groupName": {
    "set": [ { "in": input, "out": expected } ] } } } }
```

with `in` / `args` / `out` / `err` / `match`, and the sentinels
`"__NULL__"`, `"__UNDEF__"`, `"__EXISTS__"`.

**This is a generation target, and aontu already generates JSON.** The
integration is not an API — it is `aontu` emitting an omni spec file.

**Why this delivers *independent* validation.** The omni runner has
never heard of aontu. It reads JSON and executes it against an
implementation in any of 24 languages. So the chain is:

```
spec.aon  ──(generate)──►  types + validator   ──►  the agent's code
   │
   └──────(generate)──────►  omni spec (JSON)  ──►  omni runner ──► verdict
```

The agent's code and the tests that judge it come from the same
*specification* but through **different generators and a different
executor**. An agent that misreads the spec fails the tests, which is
the property the whole exercise is for.

### Deriving scenarios from the constraint algebra

This is where G1 pays off, and it is the part that could not be built
before the algebra landed. A constraint is not a type — it is a
**description of a value space**, and a value space can be sampled
systematically:

| Constraint | Scenarios it implies |
|---|---|
| `min(0) & max(255)` | `0`, `255` (boundaries — where bugs live), `-1`, `256` (just outside), a middle value |
| `integer` | a float, to prove the kind is checked |
| `re("^a")` | a match, a near-miss, an empty string |
| `length(min(1), max(3))` | 0, 1, 3, 4 members |
| `unique()` | a duplicate |
| `"a" \| "b"` | each arm, plus one value in neither |
| an optional key | present and absent |
| `refer()` | a resolvable address, and a dangling one |
| `must(…)` | inputs either side of the predicate |

**Boundary derivation is mechanical and it is exactly what humans skip.**
Every one of those rows is a case an agent would plausibly not write.

**Fuzz** then comes from the same space with the opposite intent:
generate values that *satisfy* the spec (to check the implementation
accepts what it must) and values that *violate one atom at a time* (to
check it rejects precisely, and does not reject for the wrong reason).
The one-atom-at-a-time discipline matters: a fuzz corpus of uniformly
random garbage tests almost nothing, because almost everything is
rejected for the first reason encountered.

**Determinism is not optional here**, and trust.md already supplies it:
a generated corpus must be a pure function of the spec, or a failing
case cannot be reproduced. This is the reason fuzz seeding must come
from the spec's own `aon1-` hash rather than a clock — which is also
the only way this stays inside clause 1.

---

## 11. Open questions

Nothing should be built before these are answered.

| # | Question |
|---|---|
| **O-1** | **Does the projection round-trip, and must it?** If `vocab import` is one-way, a vocabulary revision means re-import and a diff. `subsume`/`breaking` can *judge* that diff, which may be enough — but it needs deciding, because it determines whether the projection must be information-preserving. |
| **O-2** | **What is the projection's own versioning?** A file must record the vocabulary release *and* the converter version, since a converter fix changes the projection without the vocabulary changing. Two hashes, not one. |
| **O-3** | **How much of the RDF graph survives?** §6 proposes classes and properties. `subClassOf` is essential. Are `equivalentProperty`, `sameAs`, SKOS `broader` in or out? Each one admitted is a reasoner obligation acquired. |
| **O-4** | **Where does omni generation live** — a verb (`aontu omni`), a library, or a template in the spec itself? The last is most flexible and least discoverable. |
| **O-5** | **Scenario budget.** The value space is combinatorially large; a spec with ten constrained fields has an unbounded cross-product. What bounds the generated set, and is the bound part of the spec or of the tool? |
| **O-6** | **Which ingest formats first?** JSON Schema is the highest-value sink and the most work. CDDL is the closest fit and the least work. |
| **O-7** | **Does `.json` include get fixed first?** §3.1 says yes — it is a prerequisite, not a task. |

---

## 12. Non-goals

Stating these is what keeps the design honest:

- **aontu does not become a reasoner.** No entailment, no transitive
  closure over imported vocabularies, no OWL profiles.
- **aontu does not become a proof assistant.** Lean is adjacent, not a
  target.
- **aontu does not model time or state transitions.** That is TLA+'s
  job, permanently — trust.md forbids a clock.
- **No network at evaluation.** Ever. §4.
- **Not a complete import of any vocabulary.** A projection is lossy by
  construction and says so in the file.
- **Not a replacement for hand-written tests.** Generated scenarios
  cover the value space; they do not cover intent.

---

## 13. Test plan

Sketch only, since §11 is open. Per ADR-001 nothing lands without
shared rows probed in both engines.

- **Vocabulary projection:** a pinned fixture of a small vocabulary
  slice, its projection, and the `aon1-` of both. The sharpest row is
  that **re-running the converter on the same input produces a
  byte-identical module** — a converter that is not deterministic
  cannot be pinned in a lock file.
- **Hermeticity:** the include closure of a document that imports a
  vendored vocabulary must contain no network resolution. Assertable
  today with the existing trust profiles (`--trust root:…`).
- **Projection fidelity:** for each projected class, a document that
  satisfies it and one that violates exactly one constraint, with the
  expected `vet` finding — negatives paired with positives, per the
  house rule.
- **Scenario generation:** for each constraint family in §9's table, the
  generated set is pinned. Boundary cases are the point; a row that
  does not include `min`'s exact boundary is not doing its job.
- **omni interop:** a generated omni spec is pinned byte-for-byte, and
  a round trip through the omni runner against a deliberately wrong
  implementation produces the expected failure.
- **Determinism:** the generated corpus is a pure function of the
  spec's hash — same spec, same corpus, both ports.

---

## 14. Phasing

| Phase | Content | Gate |
|-------|---------|------|
| **P0** | Fix the `.json` include divergence (§3.1). Answer O-1, O-2, O-7. | no new feature |
| **P1** | `vocab import` for **one** vocabulary — schema.org, as the largest and most-met — projecting classes and properties only. Vendored and pinned. | the byte-identical re-import row |
| **P2** | Dublin Core and microformats2; the projection conventions generalise or they do not. | three vocabularies, one convention |
| **P3** | Scenario generation from the constraint algebra; omni spec emission. | the omni round trip against a wrong implementation |
| **P4** | Fuzz corpus generation, seeded from the spec hash. | determinism across both ports |
| **P5** | Emitters: `.d.ts` first (widest agent reach), then IDL. | generated types + validator from one pass |

**P1 depends on `ALIASES.0.md` P2**, not P1: an imported vocabulary is
in another file, and file-local aliases do not cross an include. Until
`export` and the destructure land, imported names are reachable only by
path. That is a real ordering constraint between the two designs and is
the reason to settle the alias export semantics before starting here.

**P3 is the phase that delivers the brief's actual goal.** P1 and P2
are plumbing; the point of the exercise is an agent that cannot quietly
disagree with its specification, and that arrives when the tests come
from the spec and are run by something that never saw the code.

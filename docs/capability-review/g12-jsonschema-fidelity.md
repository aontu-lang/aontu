# G12: JSON Schema fidelity

*Status: design proposal. Part of the [capability review](index.md),
opened 2026-09-30. Per-phase status is in the
[progress register](progress.md), which is authoritative for status;
this document is authoritative for design. It expands gap G12, whether
aontu can carry every JSON Schema 2020-12 construct with full fidelity,
with a keyword-by-keyword gap matrix, alternatives, an explicit
boundary, risks, and an implementation plan.*

## Problem

The review names its own null hypothesis: the strongest competitor for
"ground truth for agents" is JSON Schema 2020-12 plus prose
([traps to refuse](index.md#traps-to-refuse)). aontu's answer is
unification, subsumption as compatibility, located two-site conflicts
and semantic hashing. That answer reaches a team whose contracts are
already JSON Schema only if their schemas can cross into aontu without
changing meaning, and cross back. Today they cannot. Interop is export
only, and the export is lossy.

Full fidelity is four properties, and this document holds the design to
all of them:

1. **Instance fidelity.** For every 2020-12 schema `S` and every JSON
   instance `I`, `vet --no-fill --exact-numbers import(S) I` answers
   `valid` exactly
   when a conforming 2020-12 validator accepts `I`. The verdicts
   `invalid` and `incomplete` both mean the validator rejects it.
2. **Round trip.** `import(export(import(S)))` is canon-equal to
   `import(S)`. `export(import(S))` accepts the same instances as `S`
   and carries the same annotations and identifiers.
3. **Native values.** An imported schema is ordinary aontu. It unifies
   with other aontu, `subsume` and `breaking` compare two versions of
   it, and `hash` identifies it. It is never an opaque document held by
   a special verb.
4. **A truthful export.** Every aontu value exports to a schema that
   admits exactly its instances, or the export names each difference as
   a loss. No difference is silent.

### The measurement

Driven on 2026-09-30 against both CLIs built from `7619130`. Every
result below is identical in the two ports unless it says otherwise.

**There is no import.** Neither engine has a `$ref` or `$defs` code
path; the only occurrences of either string in the sources are prose in
the help corpus.

**The export differs from the model in seven places while reporting
`ok`** ([#300](https://github.com/aontu-lang/aontu/issues/300)). An
open list `[integer, string]` exports `items: false`, so the schema
refuses `[1, "x", true]`, which aontu admits. A spread beside positions,
`[&: integer, 1, 2]`, drops the positions. `len(above(2))` exports
`minLength: 2`. `len(neq(3))` disappears. A preference `*1` exports
`const: 1`, though aontu admits `2` there. `float` and `integer` export
as `number` and `integer`, which admit `1` and `1.0` respectively. Three
more such defects were filed a day earlier
([#295](https://github.com/aontu-lang/aontu/issues/295),
[#296](https://github.com/aontu-lang/aontu/issues/296),
[#297](https://github.com/aontu-lang/aontu/issues/297)).

**An alias exported as a required property**, spelled `%T@<file>` in
TypeScript and `%T@#1` in Go, so the exported schema refused every
instance ([#301](https://github.com/aontu-lang/aontu/issues/301)). The
exporter now skips alias slots as generation does, in both ports,
pinned by `js-alias-is-not-a-property`. The cause remains: a data key
spelled `"%T"` still meets the alias `%T`, because alias slots share
the key namespace.

**Three engine behaviours contradict the lattice laws the importer
would rely on.** A required key met with an optional one answers
optional, so `{x: integer} & {x?: integer}` loses the requirement
([#298](https://github.com/aontu-lang/aontu/issues/298)). An optional
key holding `nil` has no settled meaning
([#299](https://github.com/aontu-lang/aontu/issues/299)): evaluation of
`{k?: nil}` with `{k: 1}` answers `{}`, silently dropping the supplied
value, while `vet` refuses `{}` against `{k?: nil}`, where no value was
supplied. JSON Schema's `properties: {k: false}` needs the opposite of
both. A third case, `vet` refusing a `nil` inside a spread template
that no child selected, split the ports on the finding's path; `vet`
now skips spread templates in both ports, pinned by the
`vet-nil-in-*-template-*` rows. A bare `$` followed by a map parses as
a variable named by the map and refuses with a different code in each
port ([#302](https://github.com/aontu-lang/aontu/issues/302)).

**aontu's only general predicate asks the wrong question.**
`must({x: any}, "needs x")` admits `{}`, because `must` asks whether
the peer can unify with its argument, not whether the peer is already
an instance of it. JSON Schema's `required` is the second question.

**The number model and the string model differ from JSON's at the
kind.** `integer` refuses `1.0`, which 2020-12 calls an integer.
`string` refuses `""`, which 2020-12 calls a string.

**A path reference into the instance tree sees the instance.**
`t: {n?: $.t, v?: integer}` vetted against three levels of data runs to
`unify_cycle` at a path hundreds of segments deep, because `$.t` names
the unified value, data included. The same recursion through an alias,
`%T = {n?: %T, v?: integer}`, answers `valid` and `invalid` correctly.
Every `$ref` target therefore becomes an alias, never a path.

**Existing constructs already carry five of the object and array
keywords.** A spread guarded by the child's own key,
`&: match(key(0), re("^x"), integer, any)`, applies `integer` to every
key that starts with `x` and nothing else, in both ports; this is
`patternProperties`. With the key test in the pattern position and
`nil` as the default, `&: match(key(0), len(max(3)), any, nil)` refuses
any key longer than three characters; this is `propertyNames`. The same
guard over a list spread,
`[&: match(key(0), "0", integer, "1", string, boolean)]`, types the
first two positions and every later one, without requiring either
position; this is `prefixItems` with `items`. Per-object closure, which
is `additionalProperties`, is spellable the same way: evaluation admits
`{}` for the meet of two such objects where `close() & close()`
refuses it, exactly as 2020-12 does.

### The gap in numbers

Every keyword of the 2020-12 vocabularies, every `format` attribute,
the legacy keywords of draft-04 to 2019-09 (grouped where one upgrade
carries several), and each evaluation and interop aspect (dialects,
references, output units, annotation collection, the number model) was
inventoried against aontu on 2026-09-30: 105 entries, listed one per
row with their class in the [appendix](#appendix-the-inventory). Five
cross exactly today, thirty-four cross lossily, sixty-three have no
carrier at all, and three differ from JSON Schema in the model itself
(the number tower, data-model equality and `$defs` placement). The
matrix below groups them and gives each group its carrier.

## Current state

**The exporter** is `jsonSchema()` in `ts/src/jsonschema.ts` and
`JSONSchema` in `go/jsonschema.go`, behind `aontu jsonschema [--at]
[--strict]` and the TypeScript MCP server. It walks the unified value,
not the parse tree, and answers a verdict of `ok`, `lossy` or `error`
with a loss list of `{path, construct, reason}`. It writes the 2020-12
dialect only, inlines every reference, and emits no `$defs`. Its rows
are `test/spec/jsonschema.tsv`, whose header is the export contract: a
schema that admits more than the model without a loss entry is the
failure the verb exists to refuse. Its own row in the register is
[G8 phase 6](progress.md#g8--generation-on-the-total-side-of-the-fork).

**Constructs that already carry JSON Schema meaning**, all in both
ports: the scalar kinds and `null`; `empty()`; the bounds `min`, `max`,
`above`, `below` with exact rational comparison across numeric leaves;
`neq` for scalar exclusion; `re` over aontu's portable regex subset
(ADR-003); `len` for code-point and member counts; `unique()`; `must`;
`parse(g)` for grammars (ADR-033); `close()` and `open()`; spreads
`&:` and their per-child `key()`; `match` and `filter` with the
"already satisfies" rule; aliases `%name`, including recursive ones;
`type()` and `hide()`; `deprecate()`; `*` preferences; `maybe()`; and
`nil`, the lattice's bottom.

**Two semantic choices differ from JSON's by design.** `string` refuses
`""` so that an unfilled string is visible, and `empty()` waives that.
The four numeric leaves `integer`, `float`, `biginteger` and
`bigdecimal` are disjoint, so `1` and `1.0` are different values;
bounds still compare across leaves by exact value. Neither choice is
revisited here. The design meets JSON's model at the boundary instead.

## Prior art

**CUE** (`cuelang.org/go/encoding/jsonschema`, read at master on
2026-09-30) is the only unification language with a full JSON Schema
importer. Its contract is soundness one way: the generated CUE "is
guaranteed to deem valid any value that is a valid instance of the
source JSON schema", and nothing is said about false acceptance. It
moves every non-lattice keyword into a validator builtin: `matchN(N,
[...])` for `allOf`, `matchN(>=1, ...)` for `anyOf`, `matchN(1, ...)`
for `oneOf`, `matchN(0, [x])` for `not`, `matchIf` for `if`/`then`/
`else`, and `list.MatchN` for `contains`. It declares `$anchor`,
`$dynamicRef`, `$vocabulary`, `unevaluatedProperties`,
`unevaluatedItems`, `contentSchema`, `readOnly` and `writeOnly`
unimplemented, drops `default` rather than emit `*`, treats most
formats as silent no-ops, and drops a pattern RE2 cannot compile unless
a strict flag is set. `integer` rejects `1.0`, its one `type.json`
failure. Its own test statistics report 83.6 % of the official suite's
tests passing across all drafts, 99.2 % of those whose schema it can
extract, and 18.6 % for an extract, generate, extract round trip.

**CUE's test method is the one to copy.** It vendors the official suite
and records every failing test as a skip inside the test data with the
error text, and the run fails when a skipped test unexpectedly passes,
so a fix must delete its own skip.

**Pkl, KCL and Dhall** have less. Pkl's `pkl-pantry` generator refuses
`not`, `allOf` and `anyOf` in its own header and falls back to its
loosest type for several patterns. KCL's `kcl import -m jsonschema`
turns value-level `oneOf`/`anyOf` into runtime checks, drops recursion
to `any`, and has no arm for `unevaluated*`, `$dynamicRef`,
`propertyNames` or `dependentRequired`. Dhall has no JSON Schema
tooling and no runtime predicates at all.

**The official JSON-Schema-Test-Suite** is the conformance fixture every
implementation reports against: for 2020-12, 46 required files, 13
optional files and 21 `optional/format` files, with `remotes/` served
by convention at `http://localhost:1234/`. Each test is a schema, an
instance and the expected `valid` boolean.

The lessons are three. Negation, exactly-one and conditionals leave the
lattice in every surveyed language, as checks rather than meets. Nobody
implements `unevaluated*` or `$dynamicRef` by rewriting, because both
depend on which branches passed or on the call stack. And a round trip
nobody measures does not hold: CUE's is at 18.6 %.

## The gap matrix

Each row is one keyword or aspect. *Today* is what aontu does with it
on 2026-09-30; *class* is `exact`, `lossy`, `absent` or `divergent`;
*carrier* is what this design gives it, described in the section named.
Every carrier is in both ports.

### Core and identifiers

| Keyword | Today | Class | Carrier |
|---|---|---|---|
| `$schema` | export writes the 2020-12 URI | lossy | the importer's dialect table ([13](#13-dialects-vocabularies-and-the-meta-schema)); never a value |
| `$id` | none | absent | the importer's resource table; the alias declaration carries it ([10](#10-references-resources-and-identity)) |
| `$ref` | export inlines references | lossy | an alias at the reference site; `$defs` and `$ref` on export |
| `$ref` with siblings | none | lossy | `%T & {…}` in 2019-09 and later; siblings dropped and reported under draft-07 and earlier |
| `$defs`, `definitions` | none; alias slots are skipped on export | divergent | one alias per entry, names escaped reversibly |
| `$anchor` | none | absent | an alias with a resource-qualified name |
| `$dynamicRef`, `$dynamicAnchor` | none | absent | import-time specialisation per dynamic scope ([11](#11-dynamic-references)) |
| `$recursiveRef`, `$recursiveAnchor` | none | absent | the 2019-09 upgrade rewrites them to the dynamic pair |
| `$vocabulary` | none | absent | the importer's vocabulary table |
| `$comment` | none | absent | the `meta` rider ([12](#12-annotations)) |
| boolean schema `true` | `any` exports `{}` | exact | `any` |
| boolean schema `false` | `nil` exports `{}` with a loss, or `error` | lossy | `nil`; exported as `false` |

### Applicators

| Keyword | Today | Class | Carrier |
|---|---|---|---|
| `allOf` | `&` exports flattened | lossy | `&`; `nil` where the meet is bottom ([8](#8-logic-and-conditionals)) |
| `anyOf` | `\|` exports `anyOf` | lossy | `\|` when at most one branch can survive the meet, else `nof(min(1), …)` |
| `oneOf` | none | absent | `nof(1, …)`; a literal enum may use `\|` |
| `not` | `neq` for scalars only | absent | `nof(0, S)`; `neq` for a typed scalar exclusion |
| `if`, `then`, `else` | none | absent | `when(c, t, e)` |
| `dependentSchemas` | none | absent | `when({k: any}, S)` |
| `dependentRequired` | none | absent | `when({k: any}, {n: any, …})` |
| `properties` | map keys | lossy | quoted optional keys ([6](#6-objects)) |
| `patternProperties` | none | absent | `&: match(key(0), re(p), S, any)` |
| `additionalProperties` | `close()` or a spread | lossy | the guarded spread whose default is `S`, or `nil` for `false` |
| `propertyNames` | none | absent | `&: match(key(0), c, any, nil)` |
| `prefixItems` | a written list, exported with a wrong `items: false` | lossy | `[&: match(key(0), "0", P0, …, T)]` ([7](#7-arrays)) |
| `items` | a list spread | lossy | the default arm of the same guard |
| `contains`, `minContains`, `maxContains` | none | absent | `contains(c, n)` |

### Unevaluated locations

| Keyword | Today | Class | Carrier |
|---|---|---|---|
| `unevaluatedProperties` | `close()` agrees only on a flat object | lossy | `rest(t, …)` over coverage ([9](#9-evaluated-coverage)) |
| `unevaluatedItems` | none | absent | the same atom over indexes |

### Validation

| Keyword | Today | Class | Carrier |
|---|---|---|---|
| `type` | the kinds | lossy | the kind split: `null`, `boolean`, `number`, `empty()`, `map`, `list` ([2](#2-the-kind-split)) |
| `type: "integer"` | the `integer` leaf, which refuses `1.0` | lossy | `number & multiple(1)` ([4](#4-numbers-and-equality)) |
| `enum`, `const` | literals and `\|` | lossy | literals, with numbers read and written by value under `--exact-numbers` |
| `multipleOf` | none | absent | `multiple(n)` |
| `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` | the bounds | lossy | the bounds, with an exact endpoint rule on export |
| `minLength`, `maxLength` | `len` | exact | `len`; the export's open-bound defect is fixed |
| `pattern` | `re` over the portable subset | lossy | a rewrite table, then an aontu-owned matcher ([5](#5-strings-patterns-and-formats)) |
| `minItems`, `maxItems` | `len` | lossy | `len`, exported in the list domain |
| `uniqueItems` | `unique()` | lossy | `unique()` over JSON equality |
| `minProperties`, `maxProperties` | `len`, exported as `minItems` | lossy | `len`, exported in the map domain |
| `required` | a key without `?` | lossy | a key without `?`, once the meet keeps it required |

### Annotations, format and content

| Keyword | Today | Class | Carrier |
|---|---|---|---|
| `title`, `description`, `examples`, `readOnly`, `writeOnly` | none | absent | the `meta` rider |
| `default` | a `*` preference exports `default` | lossy | the `meta` rider; `*` only under an option |
| `deprecated` | `deprecate()` | lossy | `deprecate()`, its record carried in an extension keyword |
| `format`, annotation mode | none | absent | the `meta` rider |
| `format`, assertion mode, 19 attributes | none | absent | `format(name)` with aontu-owned checkers |
| `contentEncoding`, `contentMediaType`, `contentSchema` | none | absent | the `meta` rider; never asserted |
| unknown keywords | none | absent | the `meta` rider, under `x` |

### Evaluation and interop

| Aspect | Today | Class | Carrier |
|---|---|---|---|
| JSON number model | disjoint leaves; wire literals beyond binary64 refused | divergent | `multiple(1)` for integrality; `vet --exact-numbers` reads wire numbers by exact value |
| JSON data-model equality | leaf and value | divergent | numbers normalised by value on both sides; export deduplicates |
| remote references | none | absent | a document set handed to the importer; nothing is fetched |
| draft detection, draft-04 to 2019-09 | none | absent | an upgrade stage inside the importer ([13](#13-dialects-vocabularies-and-the-meta-schema)) |
| meta-schema validation of the input | none | absent | the importer vets the input against bundled meta-schema models |
| output `flag`, `basic` | `vet` verdicts and findings | lossy | `vet --output` ([14](#14-the-verb-the-report-and-output-formats)) |
| output `detailed`, `verbose` | none | absent | outside the boundary unless the coverage channel lands |
| `instanceLocation`, `keywordLocation`, `absoluteKeywordLocation` | a `$.a.b` path | lossy | an RFC 6901 pointer, and the importer's source map |
| annotation collection | `deprecate()` only | lossy | the `meta` rider's union meet |
| the official test suite | not run | absent | vendored, with a skip ledger that shrinks ([16](#16-conformance)) |

## Design space

**A. Hand schemas to a JSON Schema validator library.** Refused by
ADR-003: the meaning would be the host's, the two ports would ship
different libraries that disagree at the edges, and an aontu value would
never be involved. It also answers none of goals 2 to 4.

**B. Import soundly one way, as CUE does.** Drop or loosen whatever
does not translate, so that everything the schema accepts, aontu
accepts. Refused: goal 1 is two-way, and an importer that loosens in
silence is the failure the export contract already forbids in the other
direction.

**C. A JSON Schema evaluator inside aontu.** Keep the schema as JSON and
walk it at `vet` time. Refused: the imported schema would not be an
aontu value, so it would not unify, subsume or hash (goal 3), and aontu
would become the null hypothesis with a different name.

**D. Translate every keyword into a lattice meet.** Refused because it
cannot be done. `not` is a complement, `oneOf` is a count, `if` is a
case split on an instance, `unevaluated*` depends on which branches
passed, and `$dynamicRef` depends on the path a reference was reached
by. None of these is a greatest lower bound, and the review already
refuses general negation as a lattice operation.

**E. Two bands, one trial, an importer that owns the meaning.**
Everything JSON Schema says that is a meet becomes a native aontu
construct (Band A, as G1 names it). The rest becomes a small family of
checks that decide on the settled instance and never narrow it (Band
B), all sharing one definition of "`V` is an instance of `c`". URIs,
anchors, dialects and dynamic scope are resolved by the importer before
evaluation, so nothing at unification time depends on them. Annotations
ride values without taking part in the meet.

**Recommendation: E.** It is the only option that meets all four goals,
and it keeps aontu's surface small: the design adds eight builtins,
four `vet` options, one evaluation option and an import mode. It
changes the meaning of an existing construct in six places only: the
four defects it has to fix first
([#298](https://github.com/aontu-lang/aontu/issues/298),
[#299](https://github.com/aontu-lang/aontu/issues/299),
[#301](https://github.com/aontu-lang/aontu/issues/301),
[#302](https://github.com/aontu-lang/aontu/issues/302)), the meet of
`deprecate()`'s record, which moves from first-wins to a union, and
`must`, which moves to the admission trial under its own ADR
(section 15).

## Proposed design

### 1. The importer owns the meaning

Import is a JSON-to-aontu rewrite in both ports, run before evaluation:
`importJsonSchema(text, opts)` in TypeScript, `ImportJSONSchema` in Go,
and an import mode of the `jsonschema` verb whose spelling phase 3
settles under the verb tiers of ADR-039. It answers the aontu text and
a report shaped like the exporter's, `{aontu, lossy, verdict,
errors}`, so the two directions read alike.

The importer is where ADR-003 applies. URI resolution, JSON Pointer
unescaping, the dialect, the vocabulary set, anchors and dynamic scope
are all decided by aontu code shared in meaning between the ports,
never by a host URL parser, a host regex engine or a host date parser.
A keyword the design does not yet carry is a loss in the report and a
listed skip in the conformance ledger, never a silent drop. Under
`--strict` a loss refuses the import.

Every schema position the importer writes is a value that does not
generate on its own. It writes `properties` as optional keys and
never writes `*`, so a missing member is visible to generation rather
than filled. The one construct that does generate by itself, a
literal from `enum` or `const`, is handled by `vet --no-fill`
(section 3).

### 2. The kind split

Most JSON Schema keywords apply to one instance kind and pass on every
other: `minimum` on a string, `properties` on an array. aontu's atoms
refuse the other kinds instead, so `min(0) & "x"` is a conflict. The
importer therefore splits every schema object by kind. Writing `I(S)`
for the import of a schema `S`, here and below, a schema object `O`
imports as:

```
I(O) = A & (Bnull | Bboolean | Bnumber | Bstring | Bobject | Barray)
```

`A` is the meet of the kind-agnostic keywords (`enum`, `const`, the
logic and conditional applicators, `$ref`, annotations). Each `Bk` is
the kind's aontu spelling met with the keywords scoped to it: `null`,
`boolean`, `number`, `empty()` for strings (never `string`, which
refuses `""`), `map` and `list`. `type` removes the branches it
excludes; `type: "integer"` adds `multiple(1)` to the number branch.
A branch with no scoped keywords is the bare kind, and when all six are
bare and `type` is absent the disjunction is `any` and is not written.

The branches are pairwise kind-disjoint, so exactly one survives any
concrete instance, and the disjunction is decided at the meet. ADR-007's
rule that an unresolved disjunction is incomplete never bites here,
because an instance is always concrete. The exporter recognises the
split and folds it back into one schema object with the matching
`type`.

The unifier selects the branch by the instance's kind before any meet,
since the branches are kind-disjoint by construction: no branch is
cloned or met for a kind the instance does not have, so the split
costs one meet per schema object, not six.

### 3. The admission trial and `vet --no-fill`

JSON Schema asks whether an instance *is* valid. aontu's meet asks
whether two values *can be made* consistent, and generation fills what
the schema supplies. Every Band B construct in this design, and the
instance-fidelity goal itself, needs the first question, so the design
defines it once, generalising the "already satisfies" rule that
`filter` and `match` use today.

A trial schema `c` **admits** a settled value `V` when:

1. `U = clone(V) & clone(c)` is not bottom;
2. every member `U` has that `V` lacks came from `c`: if `c` requires
   it, `c` does not admit `V`, and if `c` makes it optional it is
   removed from `U` before step 3; a list in `U` longer than in `V`
   does not admit;
3. `U` generates under a throwaway error list with no error, and the
   generated value is canon-equal to `V`'s. A filled default is a
   difference, so it does not admit.

For a scalar this reduces to the meet not being bottom and answering
`V`. The trial is decided on a concrete scalar at the meet, and on a
container only at generation, when no more members can arrive; the one
early answer allowed is a refusal that cannot be retracted. It runs on
clones, so the single-use rule for `Val` trees holds.

Three rules bound its cost. A trial runs on the subtree at the atom's
position, never on the document. Step 3 compares the two trees
structurally, without generating and canonicalising JSON. And every
verdict is memoised per atom and instance node for the length of one
evaluation, so a fixpoint re-wrap, a second atom over the same branch
and the coverage channel of section 9 never trial a branch twice. The
trials an evaluation runs are counted by a budget of their own,
`trials`, beside the passes, revisits and depth of the trust contract,
and exhausting it refuses with a new code, `trial_budget`, class
`budget`: charging trials to the revisit budget would move the verdict
of existing `budget.tsv` rows for large instances, and that budget is
spec-visible.

**`vet --no-fill`** is the same trial applied at the anchor: the verdict
is `vet`'s, and additionally the schema may not supply any member the
data does not carry. A filled member is a finding with a new code,
`vet_filled`, class `incomplete`. Goal 1 is stated against it, with
`--exact-numbers` from section 4, and the conformance harness runs
both. It also makes the
literal `const` exact under `required`: `x: 1` fills an absent `x`
under plain `vet`, and is refused under `--no-fill`. The vet-equals-eval
differential extends to it directly: `vet --no-fill S D` is `valid`
exactly when evaluating `S` with `D` succeeds and generates `D`'s own
value.

Both options are explicit. Nothing in aontu couples a verb to the
provenance of its input, so the import mode never stamps a document to
imply them; it prints the recommended `vet` invocation on stderr beside
its report, and the `jsonschema-import` rows pin the pairing.

### 4. Numbers and equality

**`multiple(n) : constraint`** is a Band A atom in the numeric domain,
named rather than an operator (ADR-008). It admits a number whose exact
value is an integer multiple of `n`, which must be positive. Integer
and `0d` leaves use their exact values; a `float` peer is read through
its shortest round-trip rendering, because divisibility, unlike order,
does not survive binary rounding (the double nearest 0.3 is not a
multiple of 0.1, and every JSON reader writes it as 0.3). Both ports
already render floats byte-identically. Several `multiple` atoms
accumulate without synthesising an lcm, the rule `re` follows, and
`multiple(1)` enables the integral-gap emptiness rule that today keys on
the `integer` leaf. The grammar's `name` rule lists `multiple` before
`mul`, since one prefixes the other.

**`type: "integer"`** imports as `number & multiple(1)`, which admits
`1`, `1.0`, `-0.0` and `1e21` as 2020-12 does, and leaves the `integer`
leaf untouched. The exporter reports `integer` and `float` kinds as
losses, since their schemas admit a leaf the kind refuses.

**Wire numbers are read by value.** Under **`--exact-numbers`**, an
option of `vet` and of evaluation alike, in the CLI and the API of both
ports, every number in the data is read as the exact value of its text and
then normalised by that value: an integral value becomes an `integer`
leaf where that leaf holds it exactly and a `biginteger` beyond, and
any other value becomes a `bigdecimal`, within the existing digit
budget. Nothing is rounded, so `1.0`, `1` and `1e0` are one value and
a twenty-digit decimal keeps all twenty digits. The importer writes
every schema number, whether a bound, a `multipleOf` divisor or an
`enum` or `const` point, by the same rule. Every comparison between a
schema and an instance is then between two exact values in the leaf
their value selects, which is how 2020-12 compares numbers, including
past the seventeenth significant digit.

It is an option, not the default, because it changes the answer for
native schemas: no data number is ever a `float` under it, so a native
`float` kind refuses every non-integral value, and a native `integer`
kind admits `1.0`. Without the option, data reads exactly as it does
today. Goal 1 is stated with it, and the harness passes it to `vet`
and to evaluation alike, so the vet-equals-eval differential reads the
data one way. An integral value takes the `integer` leaf's path and
costs what it costs today; a decimal allocates an exact value, and
`multiple(n)` divides exactly, so a numeric-heavy instance pays a
constant factor the register records rather than this document
promises.

**Equality** then needs no special case. Two JSON numbers are equal
exactly when their normalised values are the same aontu value, so
`const: 1` imports as `1`, `enum`, `const` and `uniqueItems` (as
`unique()`) are exact, and strings, booleans and `null` are imported
verbatim; a container member is imported closed. On export, where a
native value may hold both leaves of one number, the exporter
deduplicates `enum` and `not: {enum}` members by JSON value, reports a
lone numeric leaf as a loss, and reports `unique()` wherever a list can
hold two leaves of one number. An exact literal, `enum` member or
endpoint is written as its exact decimal text, so its digits are never
a loss; a consumer that parses the schema with binary64 rounds on its
own side. Both ports emit the number text directly rather than
through a double (`JSON.rawJSON` in TypeScript, the exact values'
own encoders in Go).

**An export is judged against the reading of the `vet` it serves.**
Plain `jsonschema` is judged against plain `vet`, which reads a JSON
spelling with a point as a float and one without as an integer, and
never as an exact leaf. Under that reading the `integer` and `float`
kinds, a literal written in one leaf, a `neq` of one leaf, a
`unique()` over a list that can hold both leaves of one number, and
every exact literal and kind are reported. `jsonschema --exact-numbers`
is judged against `vet --exact-numbers`, under which the `integer`
kind, an integer literal and an exact literal cross with nothing
reported, and the `float` kind and float literals are the losses. The
round-trip gate exports with the option, since the importer writes
every schema number by value.

### 5. Strings, patterns and formats

`minLength` and `maxLength` are `len`, which already counts code points
as 2020-12 does.

**`pattern` crosses in three stages.** First, the exporter writes the
normalised form of each `re`, which is valid ECMA-262 in `u` mode and
means what aontu means, instead of the source text, which it writes
today and which differs on `\s`, `.`, `\A` and `\z`. Second, the
importer rewrites ECMA constructs into the portable subset before `re`
sees them: `\s` to a class of the ECMA whitespace code points, `.` to
the class excluding the four line terminators, `\uHHHH` to the literal
character, named groups to non-capturing ones, and a quantified group
of single characters to a class. Whatever the subset still refuses is a
reported loss. Third, aontu owns its matcher, the direction ADR-003
records and has not scheduled: an ECMA-262 `u`-mode parser compiled to
a Pike VM that both ports run over code points, linear by construction,
with Unicode property tables generated once for both. After stage three
only backreferences and lookaround remain outside, because neither is a
regular language, and both stay reported losses.

**`format` has two modes, chosen by the vocabulary.** In annotation
mode, the 2020-12 default, `format` is a record on the `meta` rider and
never asserts. In assertion mode, selected by a meta-schema whose
`$vocabulary` requires `format-assertion` or by an explicit importer
switch, it is also **`format(name) : constraint`**, a Band A atom in
the string domain that accumulates like `re`. Its checkers are aontu
code in both ports: committed ABNF texts through the shared tabnas
engine (ADR-033) for `email`, `idn-email`, `uri`, `uri-reference`,
`iri`, `iri-reference`, `uri-template`, `duration`, `json-pointer`,
`relative-json-pointer` and `ipv6`; the owned ECMA-262 parser of
phase 14 for `regex`, a listed skip until that phase lands, so that the
dialect has one definition; hand-written twins for
`date`, `time` and `date-time` (calendar and leap-second rules),
`ipv4`, `uuid` and `hostname`; and IDNA2008 over a generated Unicode
table for `idn-hostname`. The ABNF checkers run under the event
budget, so a string that makes a grammar backtrack, which RFC 5322's
`CFWS` and `obs-` rules invite, refuses with the budget's code rather
than running on; the hot formats have hand-written twins for that
reason, and the register records each format's time over its corpus.
An unknown name in assertion mode refuses at
declaration with a new code, `format_unknown`. The exporter writes
`format` for either mode, and reports a loss when an asserting atom is
exported under the default dialect, which would read it as an
annotation.

The content keywords ride the `meta` rider and never assert, as the
specification requires.

### 6. Objects

Objects need no new builtin. **`properties`** imports each key quoted
and optional, `"k"?: I(S)`, because `properties` never implies
presence; `required` removes the `?` in the same literal, and a
required name not declared is `"k": any`. **`patternProperties`** is one
guarded spread per pattern, `&: match(key(0), re(p), I(S), any)`,
which the measurement shows working in both ports; spreads accumulate,
so every matching pattern applies, at one regex match per pattern per
key, which is the cost 2020-12 itself specifies; what a key must not
pay is a clone of every arm, which section 7 rules out.
**`additionalProperties: S`** is a
guarded spread whose literal arms are the object's own declared names
and whose `re` arms are its own patterns, each answering `any`, with
`I(S)` as the default, or `nil` for `false`. Because each object
carries its own exclusion list, closure stays per object under `&`,
which `close()` cannot give. **`propertyNames: c`** is
`&: match(key(0), empty() & I(c), any, nil)`. **`minProperties`** and
**`maxProperties`** are `len` on the map.

Three prerequisites make this exact. The meet must keep a required key
required ([#298](https://github.com/aontu-lang/aontu/issues/298)), or
`required` and `properties` split across `allOf` branches lose the
requirement. An optional key holding `nil` must refuse a supplied
value and pass an absent one, in evaluation and `vet` alike
([#299](https://github.com/aontu-lang/aontu/issues/299)), or
`properties: {k: false}` is wrong in both directions; a `nil` default
inside a spread template already passes, since `vet` stopped reading
templates. Alias slots must leave the key namespace
([#301](https://github.com/aontu-lang/aontu/issues/301)), or a
property may meet a minted alias name.

The exporter recognises each guarded spread shape and writes it back as
the keyword it came from. A guarded spread whose literal arms are not
the map's declared names has no JSON Schema spelling in one object and
exports as `allOf` of per-object schemas.

### 7. Arrays

**`prefixItems` and `items`** are one list spread guarded by index,
`[&: match(key(0), "0", I(P0), "1", I(P1), I(T))]`: `key(0)` in a list
spread answers the index as a string, positions are not required, the
list stays open, and the default arm is `items` (`any` when absent,
`nil` for `items: false`). The measurement shows this working in both
ports. A guarded spread is instantiated per child as every spread is
(ADR-005), but the instance holds only the key test and the arm the
child selects: the dead arms and the template body are shared,
immutable, until a meet needs a copy, so a hundred-thousand-element
list with ten prefix arms pays for one arm per element and not eleven.
A written list stays the spelling for positions that are also
required by `minItems`. **`minItems`**, **`maxItems`** are `len` on the
list.

**`contains(c, n?) : constraint`** is the one array atom. It counts the
members `c` admits, by the admission trial, and requires the count to
meet `n & integer & min(0)`, the count residual `len` already uses;
`n` defaults to `min(1)`. `minContains` and `maxContains` are the
count's endpoints. It folds late with `len` and `unique`, refuses an
exceeded upper bound at once, decides a lower bound at generation, and
keeps the matched indexes for the coverage channel.

### 8. Logic and conditionals

**`nof(n, ...c) : constraint`** is a Band B atom: the settled peer must
be admitted by a number of the trial schemas `c` that the count `n`
admits, where `n` is an integer or a count constraint over the same
algebra `len` uses. A branch is tried while a remaining branch can
still change the verdict: `nof(min(1), …)` stops at the first admitting
branch, `nof(0, …)` refuses at the first, and `nof(1, …)` tries every
branch, since a second admitting one refuses it.
It refuses with a new code, `nof`, class `conflict`, whose details
carry the admissible count, the observed count and each tried branch's
verdict. It is opaque to emptiness and subsumption, as `must` is.

Its branches are canon-sorted but **never deduplicated**, because a
count counts duplicates: `oneOf: [{type: "string"}, {type: "string"}]`
admits no string, since every string matches both branches, and a
deduplicated `nof(1, empty())` would admit them all. The branch list is
a sorted multiset. What is deduplicated is the atom: two canon-equal
`nof` atoms on one value are one check, so `&` stays commutative and
idempotent by canon. `must`'s written-order canon is not copied.

The importer's carriers:

- **`allOf`** is `&`. With per-object closure carried by guarded spreads
  and the required-key meet fixed, the meet is exact, and where it is
  bottom at import the position is `nil`, which is what an unsatisfiable
  `allOf` means. `nof(N, …)` remains available and is what the exporter
  writes back when a meet holds parts one object cannot express.
- **`anyOf`** is `|` when at most one branch can survive the meet with
  any instance: all branches are scalar literals, or they are pairwise
  kind-disjoint and hold no required key, container count, Band B atom
  or closure at any depth. Every other `anyOf` is `nof(min(1), …)`.
  `|` itself does not change; ADR-007 stands.
- **`oneOf`** is `nof(1, …)`. A `oneOf` of scalar literals with
  pairwise-distinct JSON values may be `|`, because a scalar equals at
  most one of them.
- **`not`** is `nof(0, S)`. The one Band A special case is a typed
  scalar exclusion: `not: {enum: [...]}` beside `type: "string"` or
  `"integer"` imports as `neq(...)`, with every numeric point in every
  leaf. Without a sibling `type` it must not become `neq`, which would
  refuse the other kinds.

**`when(c, t, e?) : constraint`** is the conditional: if `c` admits the
settled peer, `t` must admit it, otherwise `e` must, and an absent
branch passes. It refuses with a new code, `when`, class `conflict`,
naming the branch taken. The importer resolves adjacency per source
schema object before any meet, so an `if` in one `allOf` branch never
pairs with a `then` in another. `dependentSchemas: {k: S}` is
`when({k: any}, I(S))` and `dependentRequired: {k: [a, b]}` is
`when({k: any}, {a: any, b: any})`; the exporter recognises both shapes
and writes the dependent keywords back. `nil` is the false schema in
every trial position.

A separate `when` rather than a `nof` encoding of the case split keeps
the conditional readable in canon and exportable without pattern
matching nested counts. G8's refusal of boolean guards in `match` is
not touched: `when` checks, it never selects a value.

### 9. Evaluated coverage

`unevaluatedProperties` and `unevaluatedItems` apply to the members no
adjacent keyword and no passing in-place subschema evaluated. That is a
fact about which branches passed, so no rewrite into a meet exists.

**`rest(t, ...cover) : constraint`** is a Band B atom. Each `cover`
argument pairs a trial schema with a coverage record the importer
writes: the declared names, the patterns, the prefix length, or "all".
Covers from the object itself and from branches that always apply
(`allOf`, `$ref`) count unconditionally. Covers from conditional
branches (`anyOf`, `oneOf`, `dependentSchemas`) count only when their
trial admits the instance; `if` counts its own cover together with
`then`'s when it passes and `else`'s alone when it fails; `contains`
contributes the indexes it matched; and a nested `rest` is itself a
cover of every member when its trial passes, which is how an inner
`unevaluatedProperties: true` inside `allOf` satisfies an outer
`false`. At generation the atom
unions the passing covers and requires every uncovered member to be
admitted by `t` (`nil` for `false`). The importer hoists each
conditional branch into an alias, so the `nof` or `when` that checks it
and the `rest` that reads its coverage share one definition and one
memoised verdict: a `rest` that needs the verdict of a branch the count
stopped before trials it then, through the same memo, so no branch is
trialled twice in one evaluation.

On a flattened object with no conditional branch, `rest(nil)` and the
guarded spread agree, and the exporter writes `additionalProperties`;
it writes `unevaluatedProperties` or `unevaluatedItems` back only for a
`rest` that carries conditional covers.

### 10. References, resources and identity

A resource is a subschema with its own `$id`, or the document. The
importer resolves every `$id` against its enclosing base with an RFC
3986 resolver written once in meaning for both ports and pinned by a
shared corpus in the manner of the regex corpus, since host URL parsers
disagree at the edges. It builds a table from canonical URI to alias,
base, dialect and anchors.

**A duplicate identifier refuses the import**, with a new code,
`jsonschema_duplicate`, class `reference`, so that no table entry wins
by walk order. Two schema positions whose `$id` values resolve to one
canonical URI are a duplicate, and so are two `$anchor` values, or two
`$dynamicAnchor` values, with one name in one resource. An identifier
that sits in a non-schema position (inside `enum`, `const`, `default`,
`examples` or an unknown keyword) is data and is not registered. One
resource reached twice, by reference and by descent, is the same entry
and not a duplicate. Phase 3 lands the rule for anchors within one
document, and phase 10 extends it to `$id` across the document set.

**Every `$ref` target becomes an alias**: a `$defs` entry, an anchored
subschema, or any pointer target such as `#/properties/a/items`, hoisted
into `%name = I(target)`. The use site is `%name`, and `$ref` with
siblings is `%name & I(siblings)`. A path reference into the instance
tree is never used, for the reason the measurement shows. Alias names
are derived reversibly from the resource's URI and the fragment, since
anchors and `$defs` keys admit characters alias names do not.
`"$ref": "#"` names the document root, which the importer carries by
hoisting the root body into an alias, which is exact for validation. A
bare `$` at value position is not a root reference: it refuses at parse
time with one code in both ports, naming the `$name` variable form
([#302](https://github.com/aontu-lang/aontu/issues/302)), because a
path reference into the instance tree is never used here.

**Identity lives on the declaration, not on the value.** The alias
declaration carries the resource's `$id`, `$anchor` and original
`$defs` key in a declaration-only identity builtin, which only an alias
declaration may carry and whose name phase 10 settles, and a reference
copy strips it as it already clears `type()` and `hide()` marks: the
strip rule is a property of the construct, and the `meta` rider's union
meet carries no special keys. Two copies of
different resources therefore never meet identity records, and the
exporter reads them at the declaration to emit each alias once under
`$defs`, with its `$id` and `$anchor`, and each use as `$ref`. The
exporter needs one more fact for that: which values arrived through an
alias. A reference copy gains an origin mark, carried through the meet
and read by the exporter in both ports; phase 4 lands the mark and the
`$defs` and `$ref` export for local references, and phase 10 adds the
identity.

**Remote references** are resolved against a document set handed to
the importer, `{uri: text}`, never fetched: G5's trust contract has no
network clause to relax. A reference outside the set refuses the import
with a new code, `jsonschema_ref`. Every reached resource is imported
into the same aontu document, so the result is hermetic and holds only
internal references.

### 11. Dynamic references

`$dynamicRef` resolves against the dynamic scope, the chain of resources
the evaluation passed through. The importer specialises it away. Walking
the reference graph from each entry point, it carries an environment
`E` from each dynamic anchor name to the anchored node of the outermost
resource in scope that declares it. `E` only grows, and once a name is
bound its outermost binding never changes, so the set of distinct
environments is finite. Each pair of a node and an environment is
imported once, as its own alias, and inside it a `$dynamicRef` whose
initial target carries a matching `$dynamicAnchor` becomes a reference
to `E`'s binding; without that anchor it is a plain `$ref`. The walk
records a resource entry at every `$id` boundary, whether reached by
reference or by descent.

This is exact for the entry points imported. A later aontu document
that references an imported alias from a new outer scope does not
re-bind it, which the reference documents as static. A native
alternative, a reference resolved against the copy chain at
unification time, is rejected: the same term would denote different
values at different sites, breaking canon and the hash.

**Specialisation must not erase the dynamic edge**, or export cannot
restore it. After the rewrite, a `$dynamicRef` and a `$ref` that
resolve to the same alias in the imported scope are the same reference,
yet they differ under any other outer scope. So each rewritten use site
keeps a provenance record on the `meta` rider, `dynamicRef`, holding
the original fragment and the node of its initial target, and each
clone keeps the source resource it was cloned from and the environment
it was cloned under. The exporter folds the clones of one source
resource back into a single `$defs` entry carrying its
`$dynamicAnchor`, and writes each use that carries the record as
`$dynamicRef` with its original fragment. Where the clones cannot be
folded, because their bodies differ in more than the rewritten targets,
the exporter writes each clone as its own entry and reports a
`$dynamicRef` loss naming the entry point it was specialised for,
rather than a plain `$ref` that silently changes what an overriding
anchor would do.

The 2020-12 meta-schema is itself written with `$dynamicRef`, so this
section is a prerequisite for validating input against it.

### 12. Annotations

**`meta(v, ...r) : any`** is a value-transparent rider on the
precedent of `deprecate()`: it unifies exactly as `v`, and the records
ride the result through meets, reference copies and spread
applications. Its record keys are fixed: `title`, `description`,
`comment`, `default`, `examples`, `readOnly`, `writeOnly`, `format`,
`contentEncoding`, `contentMediaType`, `contentSchema`, and `x` for
unknown keywords, plus the use-site `dynamicRef` record of section 11;
identity never rides it (section 10).
A record value must be concrete data; a wrong kind
refuses with `func_arg`.

The rider's meet is a key-wise union of canon-sorted value sets: it is
commutative, idempotent and monotone, and it never refuses, which is
how JSON Schema aggregates annotations from every applicator that
passes. `deprecate()`'s record moves to the same rule; today two
different records on one value keep whichever arrived first. A failing
branch's rider is discarded with the branch, and `nof(0, …)` never
contributes one. Canon renders `meta(…)` in a fixed position after
`type`, `hide` and `deprecate`, and the hash includes it.

**`default` imports into the rider, never as `*`.** A preference fills
and gates admission (ADR-004), which a 2020-12 `default` never does.
An explicit importer option may add the preference where the property
is not required and its value is admitted by the local assertions, for
authors who want aontu's defaulting.

The exporter writes one record inline and several as an `allOf` of
annotation-only subschemas, the shape it already uses for several
patterns. `deprecate()`'s message, replacement and version cross in an
extension keyword, `x-aontu-deprecate`, beside `deprecated: true`,
which 2020-12 treats as an annotation. The LSP's hover gains `title`
and `description`.

### 13. Dialects, vocabularies and the meta-schema

**The dialect table** maps each known `$schema` URI, including the
`http` and trailing-`#` spellings of the drafts, to draft-04, draft-06,
draft-07, 2019-09 or 2020-12; absent means 2020-12 unless the caller
says otherwise. An unknown URI that the document set does not supply as
a meta-schema refuses with a new code, `jsonschema_dialect`, as aontu's
choice where the specification leaves the behaviour to the
implementation. Each embedded resource may switch dialect.

**An upgrade stage** rewrites a legacy resource into 2020-12 before the
mapping, keyword by keyword, and records each rewritten keyword under
its original pointer for the source map: `id` to `$id`, `"$id": "#x"`
to `$anchor`, boolean `exclusiveMinimum` and `exclusiveMaximum` folded
into their numeric siblings, array `items` and `additionalItems` to
`prefixItems` and `items`, `dependencies` split by member shape,
`$recursiveRef` and `$recursiveAnchor` to the dynamic pair, and
`$ref` siblings dropped and reported under draft-07 and earlier. Its
rows are a new shared mode, `jsonschema-upgrade`.

**The vocabulary table** is generated into both ports from one shared
TSV, as the signature table is, mapping each vocabulary URI to its
keywords and its format mode. A required vocabulary outside the table
refuses with `jsonschema_vocabulary`; an optional one turns its
keywords into rider entries.

**The input is validated against its meta-schema** before it is mapped.
The 2020-12 meta-schema and its vocabulary meta-schemas ship as bundled
models, produced by the importer from the published documents, which
makes self-hosting the acceptance test. A violation refuses the import
with `jsonschema_schema`, located by the meta-schema's keyword. The
check is on by default and is the import mode's one costly step for a
large input, since the meta-schema is recursive through `$dynamicRef`
and dense with `anyOf`; an option turns it off for a trusted input, its
result is cached by the hash of the input text within a run, and the
harness checks each schema once rather than once per instance.

### 14. The verb, the report and output formats

The import mode answers aontu text on stdout and the report on stderr,
as the export does, and `--format json` puts both in one object. Its
options are the dialect default, the retrieval URI, the document set,
format assertion, default filling, the meta-schema check of section 13
and `--strict`.

**`vet --output flag|basic`** projects a `vet` report onto 2020-12's
output units. `flag` is `{valid}`, where `incomplete` is `false`.
`basic` lists one unit per finding, with `instanceLocation` as an RFC
6901 pointer built from the finding's path and, for an imported schema,
`keywordLocation` and `absoluteKeywordLocation` read from a source map
the importer writes beside the aontu text: each span it wrote, with the
keyword pointer and resource URI it came from and the `$ref` it crossed.
Every existing report field keeps its spelling; the pointer is additive.
`detailed` and `verbose` are outside the boundary unless the coverage
channel of section 9 grows into a full evaluation trace.

**The source map is a file, named on both sides.** The import mode
writes it with `--source-map <file>`, and `--format json` also carries
it in its object. The map records the SHA-256 of the aontu text it
describes, because its spans are byte positions and any edit, a
reformat included, moves them. `vet --source-map <file>` reads it
back, and refuses at the command line when the schema's bytes no
longer hash to the recorded value, rather than attribute a finding to
the wrong keyword. `vet` never looks for a map it was not given:
finding one by file name would make a report depend on a file nobody
named. `--output basic` requires a map, since 2020-12 requires
`keywordLocation` on every unit; `--output flag` does not.

### 15. The exporter

The exporter keeps its contract and gains an arm for every construct
above, each the inverse of the importer's: the kind split folds to
`type`, the guarded spreads to their keywords, `nof`, `when`,
`contains`, `rest`, `multiple` and `format` to theirs, aliases to
`$defs` and `$ref`, `meta` records to annotations. Before any of that,
the defects the measurement found are fixed, and numbers follow
section 4: an exact literal, member or endpoint is written in its own
digits, the reading the export is judged against decides which leaves
are losses, and a non-finite endpoint is omitted with a loss.

The carriers come first. Today a constrained template or a guarded
spread exports as `{}` with a loss, because the exporter walks the
unified value and a template with a call in it is held residual, so
`export(import(S))` would be empty for most schemas. Phase 4, directly
after the importer core, exports a residual template by its structure,
each guarded-spread shape of sections 6 and 7 as its keyword, and each
alias once under `$defs` with its uses as `$ref`, through the origin
mark; that phase takes over the `$defs`/`$ref` export the recursion
design left as its P2.

`must` moves to the admission trial, under its own ADR after the logic
atom lands, so that `must(c)` and `nof(1, c)` ask one question; the ADR
carries a `breaking` run over every use case and bundled model first,
because a document that relies on `must` admitting a value that only
unifies changes its answer. Until it lands, `must` stays a reported
loss: its trial is unifiability, not admission, so `allOf: [c]` would
refuse values `must(c)` admits.

### 16. Conformance

The official suite is vendored under `test/vectors/jsonschema/`, pinned
to an upstream commit named in its README, with `remotes/` beside it
loaded into the importer's document set under both
`http://localhost:1234/` and each file's own `$id`. One runner per port
imports each schema once per test group, runs `vet --no-fill
--exact-numbers` on each instance, and requires
the verdict to match `valid`. It also requires evaluation of schema and
instance together, under the same `--exact-numbers`, to agree with
`vet`, and, from phase 18, that
`import(export(import(S)))` is canon-equal to `import(S)` and that
`subsume` holds both ways. The harness's pass and skip counts belong to
the register, never to this document.

**The skip ledger** is `test/vectors/jsonschema/skips.tsv`, one line per
upstream test the importer cannot yet honour, naming the construct and
the reason, and read by both runners. A listed test that passes fails
the run, so each fix deletes its own skips, and the ledger may not
exceed a bound the register tightens phase by phase. `optional/format/`
runs in assertion mode. The language behaviour each suite file
exercises is also pinned by shared rows in a new `jsonschema-import`
mode, or the phase that claims it is partial by the register's
definition.

**The vendored corpora.** The official suite is one of several public
corpora whose licences allow vendoring beside MIT code, each read from
its upstream on 2026-10-06. Every corpus lives in its own directory
under `test/vectors/`, carries its upstream LICENSE unchanged, and its
NOTICE where the licence is Apache-2.0, and has a README naming the
upstream URL and the pinned commit. A generator turns each corpus into
`jsonschema-vet` cases at test time, so one runner path serves them
all in both ports, and each corpus has its own skip ledger under the
rule above. The vendored files keep their own licences beside the
project's MIT; nothing under AGPL, which is what the Sourcemeta
tooling and benchmark carry, is vendored.

| Corpus | Licence | What it holds | Phase |
|---|---|---|---|
| JSON-Schema-Test-Suite | MIT | `tests/` for draft-03 to 2020-12 as `{schema, instance, valid}` triples, `optional/` with the 21 `format` files, `remotes/`, `output-tests/` and `annotations/` | 3; `annotations/` from 9; `optional/format/` from 13; `output-tests/` from 17 |
| json-schema-spec meta-schemas | BSD-3-Clause, offered beside AFL-3.0; BSD is taken | the 2020-12 meta-schema and its vocabulary schemas | 16 |
| Ajv `spec/extras` | MIT | further triples in the suite's shape | 3 |
| JSONTestSuite | MIT | RFC 8259 parser cases: accept, reject and implementation-defined | 3, for the instance reader under `--exact-numbers` |
| isemail `tests.xml` | BSD-3-Clause | an email-address corpus with per-address diagnostics | 13 |
| uritemplate-test | Apache-2.0 | the RFC 6570 examples, extended and negative cases | 13 |
| Unicode `IdnaTestV2.txt` | Unicode License V3 | UTS #46 conformance vectors, which cover the mapping and validity tables and not IDNA2008's contextual rules | 13 |
| test262 `built-ins/RegExp/property-escapes` | Ecma's BSD-style licence | generated tests for every `\p{…}` property and its complement | 14 |
| `rust-lang/regex` test data; RE2 and Go `regexp` test data | MIT or Apache-2.0; BSD-3-Clause | pattern, haystack and match-span cases | 14 |
| SchemaStore | Apache-2.0 | real-world schemas with positive instances under `src/test/` and negative under `src/negative_test/`; a pinned subset named in the README, never the store | 18, and the timing record |

Bowtie (MIT) is not vendored: its published reports say what each
real validator answers on every suite test, which is the reference
when a triple's `valid`, the two engines and this design disagree.

### 17. What lands, in one table

| Kind | Items |
|---|---|
| New builtins | `multiple(n)`, `nof(n, ...c)`, `when(c, t, e?)`, `contains(c, n?)`, `rest(t, ...cover)`, `format(name)`, `meta(v, ...r)`, and the declaration-only identity builtin of section 10 |
| New options | `vet --no-fill`, `--exact-numbers` on `vet`, on evaluation and on the export, `vet --output flag\|basic`, `vet --source-map`, the import mode of `jsonschema` |
| New engine codes | `nof`, `when` (class `conflict`); `vet_filled` (`incomplete`); `format_unknown` (`conflict`); `trial_budget` (`budget`) |
| New import codes | `jsonschema_schema` (`parse`); `jsonschema_ref`, `jsonschema_dialect`, `jsonschema_vocabulary`, `jsonschema_duplicate` (`reference`); `jsonschema_budget` (`budget`) |
| New shared modes | `jsonschema-import`, `jsonschema-upgrade` |
| Vendored corpora | the official suite, the meta-schemas, Ajv's extras, JSONTestSuite, isemail, uritemplate-test, `IdnaTestV2.txt`, the test262 property escapes, the regex test data and a SchemaStore subset, each under its own licence (section 16) |
| New ADRs | required wins in the meet; the admission trial and Band B checks; the annotation rider's union meet; the importer owns JSON Schema's meaning; `must` on the admission trial |
| Existing defects fixed first | [#295](https://github.com/aontu-lang/aontu/issues/295), [#296](https://github.com/aontu-lang/aontu/issues/296), [#297](https://github.com/aontu-lang/aontu/issues/297), [#298](https://github.com/aontu-lang/aontu/issues/298), [#299](https://github.com/aontu-lang/aontu/issues/299), [#300](https://github.com/aontu-lang/aontu/issues/300), [#301](https://github.com/aontu-lang/aontu/issues/301), [#302](https://github.com/aontu-lang/aontu/issues/302), [#310](https://github.com/aontu-lang/aontu/issues/310) |

Every code lands with its `errcodes.tsv` row in the same change, and
every builtin with its `signature.tsv` line (ADR-017), both ports and
shared rows.

### What aontu adds once a schema has crossed

This is the answer the null hypothesis asks for, and each item is an
existing capability applied to schemas it could not reach before. Two
imported schemas unify, and a contradiction between them is a located
two-site conflict rather than a schema that silently admits nothing.
`breaking` compares two versions of an imported schema and names what
narrowed. `hash` gives an imported schema a semantic identity that key
order and spelling do not change. `vet` reports every finding with both
sites. The limit is stated rather than hidden: subsumption answers
`undecided` where either side holds a Band B atom, as it already does
for `must`, so schemas built mainly from `oneOf` and `not` gain less
from `breaking` than schemas built from types, bounds and properties.

## Boundary: what we will not do

- **No network.** `$ref` and `$schema` never fetch. Remote resources
  arrive in the document set, and the trust contract is unchanged.
- **No host semantics.** No host regex, URL, date or IP parser decides
  a keyword's meaning (ADR-003). Every checker is aontu code in both
  ports.
- **No complement in the lattice.** `not`, `oneOf`, `if` and
  `unevaluated*` are Band B checks: they never narrow a value and never
  take part in emptiness or subsumption. The review's refusal of
  general negation stands.
- **No backreferences or lookaround** in `pattern`, ever. Neither is a
  regular language, and both stay reported losses after the owned
  matcher lands.
- **No number beyond the digit budget.** Under `--exact-numbers` a
  data number is read exactly within the existing budget of 4096 digits
  and scale. One beyond it is refused as data rather than rounded, and a
  suite test that needs one is a listed skip with that reason.
- **No export to older drafts.** The exporter writes 2020-12 only; the
  upgrade stage is one-way.
- **No `detailed` or `verbose` output** unless the coverage channel
  grows into a full trace, and no content assertion: 2020-12 forbids
  asserting the content keywords by default.
- **No in-tree identity.** `$id` never becomes a call on a value; ADR-014
  refused that and its argument holds.
- **No OpenAPI dialect semantics.** `nullable`, `discriminator` and the
  `x-kubernetes-*` family are unknown keywords, carried on the rider and
  never applied.
- **No change to `string`, `integer` or `|`.** The boundary meets JSON's
  model through the importer and three spellings; the language's own
  kinds and ADR-007's disjunction rule are unchanged.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| The required-wins meet (#298) changes the answer for existing documents | Medium | High | An ADR, a `breaking` run over every use case and bundled model before it lands, and `canon`, `gens` and `subsume` rows probed from both engines |
| The admission trial is slow: every Band B atom trials every branch | Medium | Medium | Subtree-only trials, structural comparison, one memoised verdict per atom and node and the `trials` budget (section 3); the short-circuit rule (section 8); the suite's timing per port is reported in the register |
| Specialising `$dynamicRef` multiplies aliases for deep generic schemas | Low | Medium | The environment set is finite by construction; a budget refuses runaway specialisation with `jsonschema_budget` rather than hanging |
| The two ports' format checkers or Unicode tables drift | Medium | High | Generated tables committed once and asserted byte-identical, the regex-corpus precedent; the vendored `optional/format` suite runs in both |
| The skip ledger becomes a place to hide failures | Medium | High | A passing skipped test fails the run; the bound tightens per phase; each skip names a construct and a reason |
| `nof` and `when` look like general predicates and grow into a programming language | Low | High | Band B atoms take only schema values, never functions; G8's no-guard rule for `match` stands; the ADR states the family closed |
| Eight builtins raise the surface an agent must learn | Medium | Medium | Each is named for the JSON Schema keyword family it carries; the teaching pack gains one page mapping keywords to spellings |
| Meta-schema validation dominates the import of a large schema | High | Medium | On by default and switchable off; cached by the input's hash; the harness checks each schema once (section 13) |
| Guarded spreads clone every arm into every child | High | High | Only the selected arm is instantiated per child; template bodies are shared until a meet needs a copy (section 7) |
| The Unicode, IDNA and format tables inflate both binaries | Medium | Low | Generate only the properties ECMA-262 `u` mode requires; the bytes each table adds to the npm package and the Go binary are recorded in the register |
| Reference copies and specialised aliases grow memory on large schemas | Medium | Medium | Bounded by `jsonschema_budget`; peak memory over the meta-schema and the SchemaStore subset is recorded per port |

### Performance

Performance is measured and recorded, never gated by a test: a
wall-clock gate is what the event budgets of the trust contract exist
to avoid. Each phase records in the register, per port, the harness
time over the suite; from phase 18 the time and peak memory over the
SchemaStore subset; and the bytes each generated table adds to the npm
package and the Go binary. A figure worse than the previous phase's is
a finding the phase's row carries, not a failing build.

The mechanisms the design commits to, each in the section that owns
it: the branch is selected by kind before any meet (2); a trial runs on
the subtree, compares structurally, is memoised per atom and node, and
is counted by its own budget (3); an integral value keeps the `integer`
leaf's path under `--exact-numbers` (4); the ABNF checkers run under
the event budget (5); a key pays one regex match per pattern and never
a clone of every arm (6, 7); a count stops when no remaining branch can
change its verdict (8); a `rest` reads the memo rather than trialling
again (9); the meta-schema check is switchable and cached, and the
harness runs it once per schema (13, 16).

## Implementation plan

Every phase is spec-first and lands in both ports (ADR-001), with every
expected value probed from both engines. Nothing may regress: every row
of the shared suite, whose size lives with the suite counts in the
register's [protocol rule 5](progress.md#the-update-protocol), and both
coverage floors (ADR-002). Each phase that claims a suite group deletes
that group's skips in the same commit.

**Phase 1: a truthful exporter (S).** Fix #295, #296, #297, #300 and
#310. Add the exact-number rule, the ceiling and floor of fractional and
open count bounds, `nil` exported as `false`, `map` and `list`
as `object` and `array`, a read-through for conjuncts of map literals,
the `type` array fold for a disjunction of bare kinds, `enum`
deduplication by JSON value, the losses of the numeric leaves under
plain `vet`'s reading (section 4), the normalised form of each
pattern (`pattern` stage one of section 5), and a refusal for a failure
nested in the exported value or an atom with unusable arguments. Each change is a `jsonschema` row in
`test/spec/jsonschema.tsv`; `ts/src/jsonschema.ts`, then
`go/jsonschema.go`.

**Phase 2: the engine prerequisites (M).** Required wins in the meet
(#298) with its ADR; an optional `nil` key refuses a supplied value and
passes an absent one, in evaluation and `vet` alike (#299); alias slots
move to a side table (#301); a bare `$` refuses at parse time with one
code in both ports, naming the variable form (#302), which removes its
`divergent.tsv` entry. Each lands `canon`,
`gens`, `vet`, `subsume` or `errc` rows. `ts/src/val/MapVal.ts`,
`ts/src/val/BagVal.ts`, `ts/src/vet.ts`, the grammar, then their Go
twins.

**Phase 3: the importer core, the admission trial and the harness
(L).** `importJsonSchema` and its Go twin and the import mode of the
verb; the admission trial as a shared primitive, with its memo, the
`trials` budget and `trial_budget` in `budget.tsv` and the trust
page's table, and `vet --no-fill` with `vet_filled`; `--exact-numbers` on `vet`, on evaluation and on
the export, and schema numbers written by value; the kind split; `type`, `enum`,
`const` and `null`, with `type: "integer"` a listed skip until phase 5;
`properties`, `required`, `additionalProperties`, `patternProperties`
and `propertyNames` as guarded spreads; `prefixItems` and `items` as
the index guard; the counts and bounds; `minLength` and `maxLength`;
`pattern` stages one and two; boolean schemas; local `$ref`, `$defs`
and `$anchor` as aliases, with `jsonschema_duplicate` for a repeated
anchor.
The `jsonschema-import` mode in both runners and `docs/shared-spec.md`;
the vendored suite, with Ajv's extras and JSONTestSuite beside it
under `test/vectors/` as section 16 vendors them, both runners and
`skips.tsv`, which lists everything later phases carry.

**Phase 4: the exporter's carriers (M).** The exporter reads a residual
template by its structure: a conjunct of a kind and constraint atoms
exports as one schema object, and the four guarded-spread shapes of
sections 6 and 7 export as the keywords they came from. A reference
copy gains the origin mark, and an alias exports once under `$defs`
with each use as `$ref`, for local references; `$id` and `$anchor`
wait for phase 10. This phase takes over the `$defs`/`$ref` export the
recursion design left as its P2. `jsonschema` rows for each shape,
probed from both engines; `ts/src/jsonschema.ts`, then
`go/jsonschema.go`.

**Phase 5: numbers (M).** `multiple(n)` with its grammar entry,
`type: "integer"` as `number & multiple(1)`, and the integral-gap rule
on `multiple(1)`. A new
`test/spec/constraint-multiple.tsv`.

**Phase 6: the logic atom (L).** `nof(n, ...c)` with the `nof` code;
the `anyOf`, `oneOf` and `not` carriers and the typed `neq` special
case; `allOf`'s `nil` for a bottom meet; exporter arms for all four
keywords. Its ADR states the admission trial and the Band B family.
After the atom lands, `must` moves to the admission trial under its own
ADR, with a `breaking` run over every use case and bundled model before
it.

**Phase 7: conditionals and dependencies (M).** `when(c, t, e?)` with
the `when` code; `if`, `then`, `else`, `dependentSchemas` and
`dependentRequired`, with the exporter's pattern for the two dependent
shapes. `nil` as the false schema in a trial position is pinned here:
it is inert today in both ports, and the rows hold it so.

**Phase 8: `contains` (M).** `contains(c, n?)`, its count endpoints,
its matched-index record, and `uniqueItems` over JSON equality.

**Phase 9: annotations (M).** `meta(v, ...r)` with its union meet and
its ADR; `deprecate()`'s record moved to the same meet; every
annotation keyword, unknown keywords under `x`, the content keywords,
`format` in annotation mode, `x-aontu-deprecate`, the `default` policy
and its option, the LSP hover in both servers, and the suite's
`annotations/` directory in the harness.

**Phase 10: resources and identity (M).** The RFC 3986 resolver and its
shared corpus; the resource table; the declaration-only identity
builtin on alias declarations and its stripping on copy; `$id` and
`$anchor` on export; the document set, remote references and
`jsonschema_ref`; the duplicate rule extended to `$id` across the
document set.

**Phase 11: dynamic references (M).** The specialisation walk, its
budget and `jsonschema_budget`, the use-site `dynamicRef` provenance
record, and the exporter's fold of clones back into `$dynamicRef` and
`$dynamicAnchor`, with a reported loss where clones cannot fold.

**Phase 12: evaluated coverage (L).** `rest(t, ...cover)`, the coverage
records the importer writes, the branch hoisting that shares them with
`nof` and `when`, and both `unevaluated*` keywords in both directions,
with its ADR.

**Phase 13: format assertion (L).** `format(name)` and
`format_unknown`; the ABNF texts; the date, time, IP, UUID and hostname
twins; IDNA2008 over a generated, committed Unicode table asserted
byte-identical in both ports; `optional/format/` in the harness, with
the isemail, uritemplate-test and `IdnaTestV2.txt` corpora vendored
beside it.

**Phase 14: the owned regex matcher (L).** An ECMA-262 `u`-mode parser
and a Pike VM in both ports, Unicode property tables limited to what
`u` mode requires and sized in the register, the regenerated
regex corpus (ADR-003 rule 6), the test262 property-escape tests and
the regex test data vendored, and `pattern` stage three. ADR-003's
recorded direction becomes a decision.

**Phase 15: legacy dialects (M).** The dialect table's legacy entries,
the upgrade stage, the `jsonschema-upgrade` mode, and the suite's
draft-04, draft-06, draft-07 and 2019-09 directories in the harness.

**Phase 16: vocabularies and the meta-schema (M).** The vocabulary
TSV generated into both ports; `jsonschema_dialect`,
`jsonschema_vocabulary` and `jsonschema_schema`; the bundled
meta-schema models, imported from the published documents; input
validation before mapping.

**Phase 17: output units (M).** `vet --output flag|basic`, the
pointer field, the importer's source map file with its text hash,
`--source-map` on the import mode and on `vet`, and the three location
fields; the suite's `output-tests/` in the harness.

**Phase 18: the round-trip gate (S).** The harness requires
`import(export(import(S)))` to be canon-equal to `import(S)` and
`subsume` to hold both ways for every schema it imports, the suite and
a pinned SchemaStore subset alike, with each port's timing over the
subset recorded in the register, and the skip ledger holds only the
boundary's cases. It needs the recursion design's P3, seen-pair
subsumption of recursive schemas, which is not a phase of this
document: without it `subsume` over a recursive import has no
termination argument.

Phases 1 and 2 have no dependencies and may land in either order, and
phase 3 needs both. Every later phase needs phase 3, and these orderings
are forced as well:

- Phase 4 needs 3, because it exports what the importer writes.
- Phase 11 needs 10, because dynamic scope is a chain of resources.
- Phase 12 needs 6, 7 and 8, whose atoms supply the conditional covers.
- Phase 15 needs 7 and 11, for `dependencies` and `$recursiveRef`.
- Phase 16 needs 11, because the meta-schema is written with dynamic
  references.
- Phase 17 needs 10, for the resource URIs in its locations.
- Phase 18 is last, and needs the recursion design's P3 (seen-pair
  subsumption of recursive schemas), which is outside this document.

## Open questions

1. **How are imported schemas published?** An `https` `$id` whose path
   is a valid module path could name an aontu package directly (ADR-020),
   which would let a JSON Schema catalogue become an aontu registry. Out
   of scope here and worth a gap of its own if asked for.

### Resolved on 2026-10-06

Four questions this document opened with, the choice phase 2 had left
open, and the two points a review raised were decided on 2026-10-06,
each probed against both CLIs. The design sections carry the decisions;
this list says where.

- **`nil` is enough as the false schema in a trial position.** It is
  inert there today: `match(1, nil, "yes", "no")` takes its default and
  `filter({x: 1}, nil)` keeps nothing, byte-identically in both ports,
  so a trial argument is never evaluated at the call site. Phase 7 pins
  it with rows.
- **The flags stay explicit.** No stamping and no new defaults; the
  import mode prints the recommended `vet` invocation (section 3), and
  `--exact-numbers` reaches evaluation as well as `vet` (section 4).
- **Identity is a declaration-only builtin**, not keys on the `meta`
  record (section 10).
- **`must` moves to the admission trial**, under its own ADR after the
  logic atom (section 15).
- **A bare `$` at value position is a parse error** with one code in
  both ports, and the importer keeps hoisting the root body for
  `"$ref": "#"` (section 10).
- **An exact number exports in its own digits** (section 4), and
  whether its leaf is a loss follows the reading the export is judged
  against; the exporter's carriers and local `$defs` export are phase 4
  (section 15).

## Appendix: the inventory

The 105 entries behind [the gap in numbers](#the-gap-in-numbers), one
per row, each classed by what aontu did with it on 2026-09-30. The
legacy keywords are grouped with the upgrade or keyword that carries
them, and an aspect two groups both examined is listed once.

| # | Entry | Group | Class |
|---|---|---|---|
| 1 | `$schema` | Core | lossy |
| 2 | `$id`, and base-URI resolution | Core | absent |
| 3 | `$ref` | Core | lossy |
| 4 | `$defs` | Core | divergent |
| 5 | `definitions` | Core | lossy |
| 6 | `$anchor` | Core | absent |
| 7 | `$dynamicRef` | Core | absent |
| 8 | `$dynamicAnchor` | Core | absent |
| 9 | `$recursiveRef`, `$recursiveAnchor` (2019-09) | Core | absent |
| 10 | `$vocabulary` | Core | absent |
| 11 | `$comment` | Core | absent |
| 12 | boolean schema `true` | Core | exact |
| 13 | boolean schema `false` | Core | lossy |
| 14 | `$ref` with sibling keywords | Core | lossy |
| 15 | `allOf` | Applicator | lossy |
| 16 | `anyOf` | Applicator | lossy |
| 17 | `oneOf` | Applicator | absent |
| 18 | `not` | Applicator | absent |
| 19 | `if` | Applicator | absent |
| 20 | `then` | Applicator | absent |
| 21 | `else` | Applicator | absent |
| 22 | `dependentSchemas` | Applicator | absent |
| 23 | `dependentRequired` | Applicator | absent |
| 24 | `dependencies` | Applicator | absent |
| 25 | `properties` | Object | lossy |
| 26 | `patternProperties` | Object | absent |
| 27 | `additionalProperties` | Object | lossy |
| 28 | `propertyNames` | Object | absent |
| 29 | `unevaluatedProperties` | Object | lossy |
| 30 | `required` | Object | lossy |
| 31 | `minProperties` | Object | lossy |
| 32 | `maxProperties` | Object | lossy |
| 33 | `prefixItems` | Array | lossy |
| 34 | `items` | Array | lossy |
| 35 | `items` array form and `additionalItems` (draft-04 to 2019-09) | Array | absent |
| 36 | `contains` | Array | absent |
| 37 | `minContains` | Array | absent |
| 38 | `maxContains` | Array | absent |
| 39 | `unevaluatedItems` | Array | absent |
| 40 | `minItems` | Array | lossy |
| 41 | `maxItems` | Array | lossy |
| 42 | `uniqueItems` | Array | lossy |
| 43 | `type`, one name | Any type | lossy |
| 44 | `type: "integer"` | Any type | lossy |
| 45 | `type`, an array of names | Any type | lossy |
| 46 | `enum` | Any type | lossy |
| 47 | `const` | Any type | lossy |
| 48 | `type: "null"`, and `null` in `enum` and `const` | Any type | exact |
| 49 | JSON data-model equality | Any type | divergent |
| 50 | `multipleOf` | Numeric | absent |
| 51 | `minimum` | Numeric | lossy |
| 52 | `maximum` | Numeric | lossy |
| 53 | `exclusiveMinimum` | Numeric | lossy |
| 54 | `exclusiveMaximum` | Numeric | lossy |
| 55 | boolean `exclusiveMinimum` and `exclusiveMaximum` (draft-04) | Numeric | absent |
| 56 | JSON number model | Numeric | divergent |
| 57 | `minLength` | String, format, content | exact |
| 58 | `maxLength` | String, format, content | exact |
| 59 | `pattern` | String, format, content | lossy |
| 60 | `format` | String, format, content | absent |
| 61 | `format: date-time` | String, format, content | absent |
| 62 | `format: date` | String, format, content | absent |
| 63 | `format: time` | String, format, content | absent |
| 64 | `format: duration` | String, format, content | absent |
| 65 | `format: email` | String, format, content | absent |
| 66 | `format: idn-email` | String, format, content | absent |
| 67 | `format: hostname` | String, format, content | absent |
| 68 | `format: idn-hostname` | String, format, content | absent |
| 69 | `format: ipv4` | String, format, content | absent |
| 70 | `format: ipv6` | String, format, content | absent |
| 71 | `format: uri` | String, format, content | absent |
| 72 | `format: uri-reference` | String, format, content | absent |
| 73 | `format: iri` | String, format, content | absent |
| 74 | `format: iri-reference` | String, format, content | absent |
| 75 | `format: uuid` | String, format, content | absent |
| 76 | `format: uri-template` | String, format, content | absent |
| 77 | `format: json-pointer` | String, format, content | absent |
| 78 | `format: relative-json-pointer` | String, format, content | absent |
| 79 | `format: regex` | String, format, content | absent |
| 80 | `contentEncoding` | String, format, content | absent |
| 81 | `contentMediaType` | String, format, content | absent |
| 82 | `contentSchema` | String, format, content | absent |
| 83 | `title` | Annotation | absent |
| 84 | `description` | Annotation | absent |
| 85 | `default` | Annotation | lossy |
| 86 | `deprecated` | Annotation | lossy |
| 87 | `readOnly` | Annotation | absent |
| 88 | `writeOnly` | Annotation | absent |
| 89 | `examples` | Annotation | absent |
| 90 | annotation collection | Annotation | lossy |
| 91 | output unit `flag` | Evaluation and interop | exact |
| 92 | output unit `basic` | Evaluation and interop | lossy |
| 93 | output unit `detailed` | Evaluation and interop | absent |
| 94 | output unit `verbose` | Evaluation and interop | absent |
| 95 | `instanceLocation` | Evaluation and interop | lossy |
| 96 | `keywordLocation` | Evaluation and interop | absent |
| 97 | `absoluteKeywordLocation` | Evaluation and interop | lossy |
| 98 | remote references | Evaluation and interop | absent |
| 99 | meta-schema validation of the input | Evaluation and interop | absent |
| 100 | draft detection | Evaluation and interop | absent |
| 101 | upgrade from draft-04 | Evaluation and interop | absent |
| 102 | upgrade from draft-06 | Evaluation and interop | absent |
| 103 | upgrade from draft-07 | Evaluation and interop | absent |
| 104 | upgrade from 2019-09 | Evaluation and interop | absent |
| 105 | conformance against the official test suite | Evaluation and interop | absent |

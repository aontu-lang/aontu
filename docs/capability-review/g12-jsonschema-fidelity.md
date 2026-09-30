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
| `$defs`, `definitions` | none; aliases export as properties | divergent | one alias per entry, names escaped reversibly |
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
and it keeps aontu's surface small: the design adds seven builtins,
four `vet` options and an import mode. It changes the meaning of an existing
construct in five places only: the four defects it has to fix first
([#298](https://github.com/aontu-lang/aontu/issues/298),
[#299](https://github.com/aontu-lang/aontu/issues/299),
[#301](https://github.com/aontu-lang/aontu/issues/301),
[#302](https://github.com/aontu-lang/aontu/issues/302)), and the meet
of `deprecate()`'s record, which moves from first-wins to a union.

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

**Wire numbers are read by value.** Under **`vet --exact-numbers`**,
every number in the data is read as the exact value of its text and
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
today. Goal 1 is stated with it, and the harness passes it.

**Equality** then needs no special case. Two JSON numbers are equal
exactly when their normalised values are the same aontu value, so
`const: 1` imports as `1`, `enum`, `const` and `uniqueItems` (as
`unique()`) are exact, and strings, booleans and `null` are imported
verbatim; a container member is imported closed. On export, where a
native value may hold both leaves of one number, the exporter
deduplicates `enum` and `not: {enum}` members by JSON value, reports a
lone numeric leaf as a loss, and reports `unique()` wherever a list can
hold two leaves of one number.

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
`relative-json-pointer`, `ipv6` and `regex`; hand-written twins for
`date`, `time` and `date-time` (calendar and leap-second rules),
`ipv4`, `uuid` and `hostname`; and IDNA2008 over a generated Unicode
table for `idn-hostname`. An unknown name in assertion mode refuses at
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
so every matching pattern applies. **`additionalProperties: S`** is a
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
ports. A written list stays the spelling for positions that are also
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
algebra `len` uses. Every branch is tried; there is no short-circuit.
It refuses with a new code, `nof`, class `conflict`, whose details
carry the admissible count, the observed count and each branch's
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
branches (`anyOf`, `oneOf`, `if` with the branch taken,
`dependentSchemas`) count only when their trial admits the instance, and
`contains` contributes the indexes it matched. At generation the atom
unions the passing covers and requires every uncovered member to be
admitted by `t` (`nil` for `false`). The importer hoists each
conditional branch into an alias, so the `nof` or `when` that checks it
and the `rest` that reads its coverage share one definition.

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
document, and phase 9 extends it to `$id` across the document set.

**Every `$ref` target becomes an alias**: a `$defs` entry, an anchored
subschema, or any pointer target such as `#/properties/a/items`, hoisted
into `%name = I(target)`. The use site is `%name`, and `$ref` with
siblings is `%name & I(siblings)`. A path reference into the instance
tree is never used, for the reason the measurement shows. Alias names
are derived reversibly from the resource's URI and the fragment, since
anchors and `$defs` keys admit characters alias names do not.
`"$ref": "#"` needs a reference to the document root, which waits on
[#302](https://github.com/aontu-lang/aontu/issues/302); until then the
importer hoists the root body into an alias, which is exact for
validation.

**Identity lives on the declaration, not on the value.** The alias
declaration carries the resource's `$id`, `$anchor` and original
`$defs` key in its `meta` record, and a reference copy strips those
keys as it already clears `type()` and `hide()` marks. Two copies of
different resources therefore never meet identity records, and the
exporter reads them at the declaration to emit each alias once under
`$defs`, with its `$id` and `$anchor`, and each use as `$ref`. The
exporter needs one more fact for that: which values arrived through an
alias. A reference copy gains an origin mark, carried through the meet
and read by the exporter in both ports.

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
unknown keywords, plus the identity keys of section 10, which only a
declaration keeps, and the use-site `dynamicRef` record of section 11.
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
with `jsonschema_schema`, located by the meta-schema's keyword.

### 14. The verb, the report and output formats

The import mode answers aontu text on stdout and the report on stderr,
as the export does, and `--format json` puts both in one object. Its
options are the dialect default, the retrieval URI, the document set,
format assertion, default filling and `--strict`.

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
the defects the measurement found are fixed, and endpoints follow one
exact-value rule: a `0d` endpoint that binary64 cannot hold exports as
the nearest number with a loss, and a non-finite one is omitted with a
loss.

`must` stays a reported loss. Its trial is unifiability, not
admission, so `allOf: [c]` would refuse values `must(c)` admits;
`nof(1, c)` is its exact successor for schema-shaped checks, and the
reference says so.

### 16. Conformance

The official suite is vendored under `test/vectors/jsonschema/`, pinned
to an upstream commit named in its README, with `remotes/` beside it
loaded into the importer's document set under both
`http://localhost:1234/` and each file's own `$id`. One runner per port
imports each schema, runs `vet --no-fill --exact-numbers` on each
instance, and requires
the verdict to match `valid`. It also requires evaluation of schema and
instance together to agree with `vet`, and, from phase 17, that
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

### 17. What lands, in one table

| Kind | Items |
|---|---|
| New builtins | `multiple(n)`, `nof(n, ...c)`, `when(c, t, e?)`, `contains(c, n?)`, `rest(t, ...cover)`, `format(name)`, `meta(v, ...r)` |
| New options | `vet --no-fill`, `vet --exact-numbers`, `vet --output flag\|basic`, `vet --source-map`, the import mode of `jsonschema` |
| New engine codes | `nof`, `when` (class `conflict`); `vet_filled` (`incomplete`); `format_unknown` (`conflict`) |
| New import codes | `jsonschema_schema` (`parse`); `jsonschema_ref`, `jsonschema_dialect`, `jsonschema_vocabulary`, `jsonschema_duplicate` (`reference`); `jsonschema_budget` (`budget`) |
| New shared modes | `jsonschema-import`, `jsonschema-upgrade` |
| New ADRs | required wins in the meet; the admission trial and Band B checks; the annotation rider's union meet; the importer owns JSON Schema's meaning |
| Existing defects fixed first | [#295](https://github.com/aontu-lang/aontu/issues/295), [#296](https://github.com/aontu-lang/aontu/issues/296), [#297](https://github.com/aontu-lang/aontu/issues/297), [#298](https://github.com/aontu-lang/aontu/issues/298), [#299](https://github.com/aontu-lang/aontu/issues/299), [#300](https://github.com/aontu-lang/aontu/issues/300), [#301](https://github.com/aontu-lang/aontu/issues/301), [#302](https://github.com/aontu-lang/aontu/issues/302) |

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
| The admission trial is slow: every Band B atom trial-generates every branch | Medium | Medium | Decide scalars at the meet; charge trials against the existing event budget; the suite's timing per port is reported in the register |
| Specialising `$dynamicRef` multiplies aliases for deep generic schemas | Low | Medium | The environment set is finite by construction; a budget refuses runaway specialisation with `jsonschema_budget` rather than hanging |
| The two ports' format checkers or Unicode tables drift | Medium | High | Generated tables committed once and asserted byte-identical, the regex-corpus precedent; the vendored `optional/format` suite runs in both |
| The skip ledger becomes a place to hide failures | Medium | High | A passing skipped test fails the run; the bound tightens per phase; each skip names a construct and a reason |
| `nof` and `when` look like general predicates and grow into a programming language | Low | High | Band B atoms take only schema values, never functions; G8's no-guard rule for `match` stands; the ADR states the family closed |
| Seven builtins raise the surface an agent must learn | Medium | Medium | Each is named for the JSON Schema keyword family it carries; the teaching pack gains one page mapping keywords to spellings |

## Implementation plan

Every phase is spec-first and lands in both ports (ADR-001), with every
expected value probed from both engines. Nothing may regress: every row
of the shared suite, whose size lives with the suite counts in the
register's [protocol rule 5](progress.md#the-update-protocol), and both
coverage floors (ADR-002). Each phase that claims a suite group deletes
that group's skips in the same commit.

**Phase 1: a truthful exporter (S).** Fix #295, #296, #297 and #300.
Add the exact-endpoint rule, `nil` exported as `false`, `map` and `list`
as `object` and `array`, a read-through for conjuncts of map literals,
the `type` array fold for a disjunction of bare kinds, and `enum`
deduplication by JSON value. Each change is a `jsonschema` row in
`test/spec/jsonschema.tsv`; `ts/src/jsonschema.ts`, then
`go/jsonschema.go`.

**Phase 2: the engine prerequisites (M).** Required wins in the meet
(#298) with its ADR; an optional `nil` key refuses a supplied value and
passes an absent one, in evaluation and `vet` alike (#299); alias slots
move to a side table (#301); a bare `$` gets one meaning in both ports
(#302), which removes its `divergent.tsv` entry. Each lands `canon`,
`gens`, `vet`, `subsume` or `errc` rows. `ts/src/val/MapVal.ts`,
`ts/src/val/BagVal.ts`, `ts/src/vet.ts`, the grammar, then their Go
twins.

**Phase 3: the importer core, the admission trial and the harness
(L).** `importJsonSchema` and its Go twin and the import mode of the
verb; the admission trial as a shared primitive and `vet --no-fill`
with `vet_filled`; `vet --exact-numbers` and schema numbers written by
value; the kind split; `type`, `enum`, `const` and `null`;
`properties`, `required`, `additionalProperties`, `patternProperties`
and `propertyNames` as guarded spreads; `prefixItems` and `items` as
the index guard; the counts and bounds; `minLength` and `maxLength`;
`pattern` stages one and two; boolean schemas; local `$ref`, `$defs`
and `$anchor` as aliases, with `jsonschema_duplicate` for a repeated
anchor.
The `jsonschema-import` mode in both runners and `docs/shared-spec.md`;
the vendored suite, both runners and `skips.tsv`, which lists
everything later phases carry.

**Phase 4: numbers (M).** `multiple(n)` with its grammar entry,
`type: "integer"` as `number & multiple(1)`, the integral-gap rule on
`multiple(1)`, and losses on the `integer` and `float` kinds'
export. A new
`test/spec/constraint-multiple.tsv`.

**Phase 5: the logic atom (L).** `nof(n, ...c)` with the `nof` code;
the `anyOf`, `oneOf` and `not` carriers and the typed `neq` special
case; `allOf`'s `nil` for a bottom meet; exporter arms for all four
keywords. Its ADR states the admission trial and the Band B family.

**Phase 6: conditionals and dependencies (M).** `when(c, t, e?)` with
the `when` code; `if`, `then`, `else`, `dependentSchemas` and
`dependentRequired`, with the exporter's pattern for the two dependent
shapes.

**Phase 7: `contains` (M).** `contains(c, n?)`, its count endpoints,
its matched-index record, and `uniqueItems` over JSON equality.

**Phase 8: annotations (M).** `meta(v, ...r)` with its union meet and
its ADR; `deprecate()`'s record moved to the same meet; every
annotation keyword, unknown keywords under `x`, the content keywords,
`format` in annotation mode, `x-aontu-deprecate`, the `default` policy
and its option, and the LSP hover in both servers.

**Phase 9: resources and identity (M).** The RFC 3986 resolver and its
shared corpus; the resource table; `$id` on alias declarations and its
stripping on copy; the origin mark; `$defs` and `$ref` on export; the
document set, remote references and `jsonschema_ref`; the duplicate
rule extended to `$id` across the document set.

**Phase 10: dynamic references (M).** The specialisation walk, its
budget and `jsonschema_budget`, the use-site `dynamicRef` provenance
record, and the exporter's fold of clones back into `$dynamicRef` and
`$dynamicAnchor`, with a reported loss where clones cannot fold.

**Phase 11: evaluated coverage (L).** `rest(t, ...cover)`, the coverage
records the importer writes, the branch hoisting that shares them with
`nof` and `when`, and both `unevaluated*` keywords in both directions,
with its ADR.

**Phase 12: format assertion (L).** `format(name)` and
`format_unknown`; the ABNF texts; the date, time, IP, UUID and hostname
twins; IDNA2008 over a generated, committed Unicode table asserted
byte-identical in both ports; `optional/format/` in the harness.

**Phase 13: the owned regex matcher (L).** An ECMA-262 `u`-mode parser
and a Pike VM in both ports, Unicode property tables, the regenerated
regex corpus (ADR-003 rule 6), and `pattern` stage three. ADR-003's
recorded direction becomes a decision.

**Phase 14: legacy dialects (M).** The dialect table's legacy entries,
the upgrade stage, the `jsonschema-upgrade` mode, and the suite's
draft-04, draft-06, draft-07 and 2019-09 directories in the harness.

**Phase 15: vocabularies and the meta-schema (M).** The vocabulary
TSV generated into both ports; `jsonschema_dialect`,
`jsonschema_vocabulary` and `jsonschema_schema`; the bundled
meta-schema models, imported from the published documents; input
validation before mapping.

**Phase 16: output units (M).** `vet --output flag|basic`, the
pointer field, the importer's source map file with its text hash,
`--source-map` on the import mode and on `vet`, and the three location
fields; the suite's `output-tests/` in the harness.

**Phase 17: the round-trip gate (S).** The harness requires
`import(export(import(S)))` to be canon-equal to `import(S)` and
`subsume` to hold both ways for every schema it imports, and the skip
ledger holds only the boundary's cases.

Phases 1 and 2 have no dependencies and may land in either order, and
phase 3 needs both. Every later phase needs phase 3, and these orderings
are forced as well:

- Phase 9 needs 8, because identity rides the declaration's `meta`
  record.
- Phase 10 needs 9, because dynamic scope is a chain of resources.
- Phase 11 needs 5, 6 and 7, whose atoms supply the conditional covers.
- Phase 14 needs 6 and 10, for `dependencies` and `$recursiveRef`.
- Phase 15 needs 10, because the meta-schema is written with dynamic
  references.
- Phase 16 needs 9, for the resource URIs in its locations.
- Phase 17 is last.

## Open questions

1. **Is `nil` enough as the false schema in trial positions?** It is
   the lattice's bottom and needs no new name, but a trial argument must
   never be evaluated at the call site for `when(c, nil)` to mean "the
   then branch fails". Phase 6 pins it; if a call refuses at
   construction, the rule that trial arguments are inert becomes part of
   the phase.
2. **Should `--no-fill` and `--exact-numbers` be the default for a
   schema that came from the importer?** The import mode could stamp
   the document so that `vet` applies both without the flags. That would couple a verb to
   provenance, which nothing else in aontu does.
3. **Where does identity metadata live when an alias is declared by
   hand?** Section 10 puts it on the declaration's `meta` record. A
   separate, declaration-only builtin would make the strip-on-copy rule
   a property of the builtin rather than of some record keys.
4. **Should `must` move to the admission trial?** It would make `must`
   and `nof(1, …)` the same check and remove a trap, and it would change
   the answer for documents that rely on `must` admitting a value that
   only unifies. Deferred to its own ADR.
5. **How are imported schemas published?** An `https` `$id` whose path
   is a valid module path could name an aontu package directly (ADR-020),
   which would let a JSON Schema catalogue become an aontu registry. Out
   of scope here and worth a gap of its own if asked for.

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

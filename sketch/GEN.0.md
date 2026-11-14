# Output options: `gen(spec)` — design note

Status: FIRST CUT IMPLEMENTED (2026-11-14), in both ports. The model
is `aontu/gen/gen.aontu` and the line is in `test/spec/signature.tsv`.
The record's meet, its check and the preference rule are
`ts/src/genrec.ts` and `go/genrec.go`; the rounding is
`ts/src/val/genwrite.ts` and `go/genwrite.go`; the builtin is
`ts/src/val/GenFuncVal.ts` and the `gen` arm of `go/func.go`. The
shared rows are `test/spec/annotation-gen.tsv`. What the first cut
leaves out is D-11. Deltas measured while implementing are recorded
beside the text they correct, each marked **Delta**.
Date: 2026-11-14

A value has one JSON form today and nothing in the language can change
it. This note proposes `gen(spec)`, a builtin that is unified with a
value and says how that value is written when the document is
generated. It answers the owner's request of 2026-11-14, quoted in §2,
and its first option is the request's own example:

```aontu
price: float & gen({ significant:2 })
price: 3.14159
```

```json
{"price": 3.1}
```

## 1. The problem

Each kind of value generates in one fixed way. Measured on both engines
on 2026-11-14:

| Source | Generates | Why |
|---|---|---|
| `x: 3.14159` | `3.14159` | every digit the double shows |
| `x: 2.0` | `2` | an integral float loses its point |
| `x: 0d1e3` | `1000.0` | a bigdecimal keeps one place |
| `x: 1e21` | `1e+21` | exponent form from 10^21 on |
| `x: path($.a.b)` | `"$.a.b"` | an address is written as its text |

What a document can control is *which* values generate (`hide`,
`type`, an optional key) and what it *computes* (`pack`, `each`,
arithmetic, `+`). To print a price to two digits an author must compute
a second, rounded field and hide the first, and there is no function
that rounds to digits at all: `upper` and `lower` round to a whole
number only.

The gap is general. Rounding is the first case; the form of an address,
a number written as a string, and the case of a key are the same kind
of question, and each would otherwise become its own builtin.

## 2. What was asked

The request, with the decision that answers each clause:

| The request says | Decision |
|---|---|
| "a new builtin: gen(spec:map) that can be unified with a value to determine how the value generated json" | D-1, D-6 |
| "Gen returns the type "annotation" which behaves similarly to constraint" | D-2, D-5, D-9 |
| "All gens in a value must unify their map arguments" | D-3 |
| "The map argument is a set of options to control output of the aontu types" | D-4 |
| "As a first case, float & gen({significant:2}) would print only 2 significant digits" | D-7 |
| "Each type has a standard set of options, each with defaults" | D-4 |
| "the user argument must also unify with the standard set" | D-5 |

## 3. The design in brief

- `gen(spec: map) : annotation` is written as a term of a meet, like a
  constraint: `float & gen({ significant:2 })`.
- An annotation is `any` carrying a record. Met with a value it leaves
  the value as it is and rides it, through meets, reference copies and
  spreads, as a `meta()` record does.
- Two annotations on one value unify their records as maps. A
  disagreement refuses the meet.
- Each type of value has a standard set of options, a closed map with a
  default for each option, published as the bundled model `aontu:gen`.
- A record must unify with the standard set of its value's type. So an
  annotation admits the values of the types that accept its options and
  no others, which is how it behaves as a constraint does.
- At generation the options in force are the standard set met with the
  record, defaults filled. They change what is written and nothing
  else: every other reading of the value is of the value.
- Canon and the hash form write the annotation where it rides, as
  `v&gen({...})`.

## 4. Decisions

### D-1. The surface is `gen(spec: map) : annotation`, a term of a meet

```
gen(spec: map) : annotation
```

`spec` is a map of concrete data: scalars, and maps and lists of them,
with no spread and no optional key, which is the rule a `meta()` record
is held to. Anything else refuses the call with `func_arg`. The
argument is a value, so a reference to a map elsewhere in the document
is read before the call resolves:

```aontu
style: hide({ money: { significant:2 } })
price: 3.14159 & gen($.style.money)
```

It is not a wrapper. `meta(v, r)`, `deprecate(v, r)` and `ident(v, r)`
take their value as an argument; `gen` takes none, because the request
writes it beside the value, and because a term of a meet composes with
a type the way a constraint does: `float & min(0) & gen({...})`.

Rejected: `gen(v, spec)`. It would read as a function that computes a
value from `v`, and the natural place to write an output option is the
schema, where the value has not arrived yet.

### D-2. An annotation is `any` carrying a record

`gen(spec)` denotes the value `any` with a record attached. The meet of
`any` and `v` is `v`, and the record goes to the result of every meet,
so:

- `3.14159 & gen(s)` is the float `3.14159` carrying `s`;
- `float & gen(s)` is the kind `float` carrying `s`, and data that
  arrives later takes the record with the meet;
- `gen(s)` alone is `any` carrying `s`, which generates nothing, as
  `min(1)` alone generates nothing (`mapval_no_gen` today).

Both engines already carry the records of `meta`, `deprecate` and
`ident` this way: `ride` and `rideOn` in `ts/src/unify.ts` and
`go/rider.go` put the operands' records on the result of each meet.
Measured: `x: meta(any, {title:"t"}) & 5` has the canon
`meta(5,{"title":"t"})`, a reference to a field that holds
`meta(any, r)` carries `r` to its copy, and a spread whose template is
`meta(any, r)` puts `r` on every member. `gen` uses the same road.

The record rides the value, not the place. A reference copies it, a
spread applies it to each member, and a call that computes a new value
from an annotated one does not carry it: `add($.price, 1)` is a new
number with no annotation.

### D-3. Records meet by unification

`gen(a) & gen(b)` is `gen(a & b)`, the two records unified as maps.
Where they disagree the meet is refused with `gen_conflict`:

```aontu
x: 1.2345 & gen({ significant:2 }) & gen({ significant:3 })
```

```
[aontu/gen_conflict]: Cannot unify values at path $.x
```

This is where `gen` differs from the other riders. Their records meet
as a key-wise union (ADR-052), which never refuses: two titles are two
titles. An output option is an instruction, and two instructions that
disagree cannot both be followed, so the meet has to say so. Map
unification is commutative, associative and idempotent, so the meet
still is, and the result does not depend on the order the annotations
were written in (ADR-081).

A record that says nothing is no record: `gen({})` is `any`, and
leaves nothing in canon.

A default written out is a statement. `gen({ significant:"all" })`
conflicts with `gen({ significant:2 })`, where `gen({})` doesn't.

**Delta.** Two arms of a disjunction that differ only in their
records are two arms, and two defaults of one rank that differ only in
their records clash, as `pref_rank_clash`. The first implementation
folded such twins into whichever was written first, which made the
output depend on the order of the arms (ADR-081). Rows
`gen-twin-defaults-differ` and its swapped twin hold it.

### D-4. Each type has a standard set, published as `aontu:gen`

The standard sets are one bundled model, a file under `aontu/` as
every language-supplied schema is (ADR-028, ADR-036):

```aontu
# aontu:gen --- THE OUTPUT OPTIONS. What `gen(spec)` may say about a
# value of each type. Every option has a default, and the default
# leaves the output as it is without the option.

aontu: Gen: type({
  Number: close({ significant: *"all"|integer & min(1) })
  String: close({})
  Boolean: close({})
  Null: close({})
  Path: close({})
  Map: close({})
  List: close({})
})
```

- A set is closed, so an option the type does not have is refused.
- An option is a disjunction whose preferred arm is its default, the
  form `aontu:profile` already uses for `indent`.
- The default leaves the output unchanged. So `gen({})` on a value of
  any type is the same as no annotation.
- The four numeric leaves share `Number`. An option that only one leaf
  can honour is refused where it is applied, not by a set of its own.
- A document can load the model (`@"aontu:gen"`) to read the sets, and
  the functions reference prints them.

The sets grow by adding options to this one file. §5 lists the
candidates; none is built in the first cut.

Rejected: a set per function argument position, checked by the
signature gate. The gate checks kinds, and an option's own type
(`integer & min(1)`) is a schema, which the language already has a
notation for.

Rejected: one flat set shared by every type. `significant` on a string
would then be accepted and ignored, and an option that is silently
ignored is how a typo ships.

### D-5. A record must unify with the standard set of its value's type

Where an annotation rides a value whose type is known, its record is
unified with that type's standard set. A record the set refuses
refuses the meet with `gen_option`:

```aontu
name: "ada" & gen({ significant:2 })
```

```
[aontu/gen_option]: Cannot unify values at path $.name
```

The type is known for a scalar, a scalar kind, a map, a list, and the
kinds `map` and `list`. An annotation on anything else waits: on
`any`, on a constraint with no kind beside it, on a reference or a
call not yet resolved.

This makes an annotation behave as a constraint does:

- it is a residual whose meet depends on its peer;
- it admits a value or refuses it, by the value's type;
- met with a disjunction it meets each arm, and an arm it refuses
  drops, so `(1.5 | "a") & gen({ significant:2 })` is `1.5`, as
  `(1.5 | "a") & min(1)` is today;
- `vet` reads it: against the schema `x: gen({ significant:2 })`, the
  data `x: "ada"` is `invalid`.

It differs from a constraint in one way. A constraint that a value
satisfies is spent, and an annotation stays on the value until the
value is generated.

### D-6. Generation applies the options, and nothing else reads them

When a value that carries a record is generated, the options in force
are the standard set of its type met with the record, with every
default filled. The generator writes the value as those options say.

Every other reading of the value is of the value itself:

| Reading | Sees |
|---|---|
| a reference, `$.price` | the value, and the copy carries the record |
| arithmetic, `add($.price, 1)` | the value; the result has no record |
| `+` beside a string | the value's own text |
| a constraint, `max(3.2)` | the value |
| `vet`, `subsume`, `breaking` | the value |
| canon, the hash form | the value and its record |
| generation | the value as the options say |

So an annotation never changes what a document means to the rest of
itself, and two documents that differ only in an annotation unify
alike and generate differently.

The trade-off is that the output of an annotated value is no longer an
instance of its own schema in general. `x: 3.14159 & gen({
significant:2 })` generates `3.1`, and `3.1` is not `3.14159`. A
schema that also bounds the value, `max(3.14)`, can be broken by the
rounded output of data that satisfied it. That is what asking for
fewer digits means, and it is why the options are read at generation
only. A document that vets its own output states its bounds on what it
prints.

### D-7. `significant`: at most this many significant digits

`significant: n` rounds a number to `n` significant digits when it is
generated. The default, `"all"`, writes every digit.

The rule, in the definition's terms:

1. Read the number as the decimal it shows, `c × 10^e` with `c` a
   whole number: an integer's and a biginteger's own digits, a
   bigdecimal's coefficient and scale, and for a float the shortest
   decimal that reads back as it (`Float.shortest` in
   `spec/Aontu/Data.lean`, which is what both engines print and what
   `mulof` reads).
2. If `c` has `n` digits or fewer, the number is unchanged.
3. Otherwise drop the digits past the `n`th and round what is left to
   the nearest whole number, a tie to the even one (`roundHalfEven` in
   `spec/Aontu/Arith.lean`, the one rounding rule the definition has).
4. The result stays in the number's own leaf, as `upper` and `lower`
   keep theirs:
   - a float is the double nearest the rounded decimal;
   - an integer is the rounded whole number, written digit for digit;
   - a biginteger and a bigdecimal are exact.

**Delta.** The proposal refused an integer whose rounded value no
double holds, with a code `gen_inexact`. It is written instead. What
is generated is data and not a value of the document, and TypeScript
already generates a `bigint` for an integer above 2^53
(`IntegerVal.gen`), so the exact digits add no native type there. Go
answers an `int64`, or a `*big.Int` past the int64 window. The code
was never registered.

Zero is unchanged, the sign is kept, and a rounded number is never
zero, so negative zero cannot appear. The number is then written as
its leaf is always written, so a bigdecimal keeps its one place.

| Source | Generates |
|---|---|
| `3.14159 & gen({ significant:2 })` | `3.1` |
| `1234.5 & gen({ significant:2 })` | `1200` |
| `0.000012345 & gen({ significant:2 })` | `0.000012` |
| `-3.14159 & gen({ significant:3 })` | `-3.14` |
| `99.96 & gen({ significant:3 })` | `100` |
| `1234 & gen({ significant:2 })` | `1200` |
| `1.5 & gen({ significant:5 })` | `1.5` |
| `0.25 & gen({ significant:1 })` | `0.2` |
| `0.35 & gen({ significant:1 })` | `0.4` |
| `2.5 & gen({ significant:1 })` | `2` |
| `0d1234.5 & gen({ significant:2 })` | `1200.0` |
| `0d123456789012345678901 & gen({ significant:3 })` | `123000000000000000000` |

One result is not a number its leaf holds. A float whose rounded
decimal is beyond the largest double is refused where the value is
generated, with `float_overflow`, the code arithmetic already gives.
It needs a value close to the largest double, 1.8e308, rounded up.

`999999999999999104 & gen({ significant:15 })` generates
`999999999999999000`, which no double holds.

Why a tie goes to the even digit: it is the rule the definition
already rounds by, IEEE 754's default, and unbiased over many values.
Why the decimal the number shows and not its binary value: a float
written `0.15` is a little below fifteen hundredths in binary, so
rounding the binary value to one digit gives `0.1`, where the number
the author wrote is a tie and rounds to `0.2`. An author reasons about
the digits they wrote. ADR-048 took the same reading for `mulof`.

Neither engine may hand this to its host. JavaScript's `toPrecision`
rounds the binary value and breaks a tie upward, and Go's
`FormatFloat` rounds the binary value and breaks a tie to even, so
they print `0.125` to two digits as `0.13` and `0.12`. Each engine
rounds the digits itself, from the shortest decimal both already
compute, and asks its host only for the double nearest a decimal text
(ADR-003).

### D-8. Canon and the hash form write the annotation where it rides

A value that carries a record renders as the value, then `&gen(`, the
record as a map with its keys in code-point order, then `)`:

```
3.14159&gen({"significant":2})
float&min(0)&gen({"significant":2})
gen({"significant":2})                 (on any)
1.5&gen({"significant":2})|2.5&gen({"significant":2})
meta(3.14159&gen({"significant":2}),{"title":"t"})
```

**Delta.** The proposal grouped a disjunction and wrote one record
after it. A disjunction holds no record: D-5 has the annotation meet
each arm, so each arm carries it and canon writes it on each. A
preference carries it whole, `*1.5&gen({...})`, so that a value that
overrides the default takes the record with it, and the record lands
on the preferred value where it is generated.

**Delta.** In an unresolved meet the call is ranked after every other
term, the late atoms included (`cjo` 160000), so that canon writes
`number&gen({...})` for a spread's template as it does for a value.

- The builtin is written under its own name (ADR-080).
- The annotation is the last term of its meet, whatever order the
  terms were written in, so one value has one rendering.
- The other riders are written outside it, so a reparse meets the
  annotation first and unions the records after, which gives the same
  value.
- The hash form includes it: two documents that generate differently
  must not hash alike.
- `aontu fmt` needs no rule: it formats the call as it formats any.

### D-9. `annotation` is a result word

`test/spec/signature.tsv` gains the line of D-1 and the result word
`annotation`, described there as `constraint` is: the result word for
a call that rides the value it meets. The parsers read any word, so
the grammar of a signature does not change; the functions reference
and both language servers render the line from the registry.

Every result word so far is also a kind a document can write, and
`constraint` is one: a field typed `constraint` holds constraints and
refuses a value. The matching kind `annotation` would let a document
say that a field holds an output option and nothing else:

```aontu
style: type({ money: annotation & gen({ significant:2 }) })
price: $.style.money & 3.14159
```

This note proposes the kind and leaves it out of the first cut, for
one reason: it reserves a bare word. A document that writes
`kind: annotation` today has the string `"annotation"`, and with the
keyword it would have a type. That is a breaking change to the
grammar, the three published grammar files and the editors, and it
deserves its own change with its own migration note. Without the
kind, a named annotation still works, since a field can hold
`gen({...})` alone and a reference copies it:

```aontu
style: type({ money: gen({ significant:2 }) })
price: $.style.money & 3.14159
```

`meta`, `deprecate` and `ident` keep their signatures. They are
wrappers, their records meet by union, and nothing reads them at
generation, so calling their result an `annotation` would give one
word two meets.

### D-10. What the definition holds

A language decision is a change to the definition (ADR-069). The whole
of this design is three changes to `spec/`:

1. `Number.significant`, the rounding of D-7, beside `Number.round`
   in `spec/Aontu/Arith.lean`.
2. A rider `gen` in `spec/Aontu/Syntax.lean` whose record is read,
   where the others' are carried and never read; its meet by D-3; and
   the standard sets as terms, with the check of D-5 in `Judge`.
3. Output. `Gen` in `spec/Aontu/Output.lean` reads `ride _ v _` as
   `v`. For `gen` it must write what the options say, and
   `output_admits`, that the output is an instance of its term, then
   holds of the value and not of what is written. The clean statement
   is two steps: `Output` stays as it is, and a function from the
   output and the records on its term gives what is written.

The first cut makes the first change and has the oracle write `gens`
rows from it, so the rounding has a third voice from the start: it is
the part two engines can share a wrong answer on. The second and third
wait, and `spec/README.md` says so under what the definition does not
yet hold. Until they land, shared rows that both engines agree on hold
the meet, the check and canon, as they hold every construct the
definition has not reached.

### D-11. What the first cut leaves out

- Every option but `significant`, and every type's options but
  `Number`'s.
- The kind `annotation` (D-9).
- The rider and the output step in the definition (D-10).
- JSON Schema. `aontu jsonschema` has no keyword for an output option.
  The exporter reports an annotation as a loss, as it reports anything
  it cannot write, and the importer never writes one.
- `subsume` and `breaking` read an annotation as the value it rides.
  That is exact between two values of one type. It overstates an
  annotation alone: `gen({ significant:2 })` admits numbers only, and
  `subsume` reads it as `any`.
- Inheritance. An annotation on a map says how the map is written, not
  its members. To round every member, annotate the spread:
  `{ &: number & gen({ significant:2 }) }`.

## 5. Options that could follow

None of these is proposed for the first cut. They are here to show
that the standard sets have somewhere to go, and to keep the names
consistent when they arrive.

| Type | Option | Would say |
|---|---|---|
| `Number` | `round: *"half-even"\|"half-up"\|"down"\|"up"` | how `significant` breaks a tie or truncates |
| `Number` | `places: *"all"\|integer & min(0)` | at most this many digits after the point |
| `Number` | `as: *"number"\|"string"` | write the digits as a JSON string, for a reader that parses numbers as doubles |
| `Path` | `as: *"address"\|"pointer"\|"key"` | `$.a.b` as a JSON Pointer `/a/b`, or as its last segment `b` |
| `String` | `case: *"as-written"\|"upper"\|"lower"` | the case of the text |
| `Boolean` | `as: *"boolean"\|"number"` | `1` and `0` |
| `Map` | `empty: *"keep"\|"omit"` | whether an empty map is written |

## 6. Errors

| Code | Class | Raised when |
|---|---|---|
| `func_arg` (exists) | conflict | the argument is not a map of concrete data |
| `gen_conflict` | conflict | two annotations on one value disagree |
| `gen_option` | conflict | the standard set of the value's type refuses the record |
| `float_overflow` (exists) | conflict | a float rounds beyond the largest double |
| `pref_rank_clash` (exists) | conflict | two defaults of one rank differ in their records |

Each new code lands with its `test/spec/errcodes.tsv` row and its hint
in the same change. A `gen_option` report names the option, the type
and the set, and a `gen_conflict` report names both annotations'
sites.

## 7. What must hold

Each is a shared row or a law test in both ports:

- `gen(a) & gen(b)` is `gen(b) & gen(a)`, `gen(a) & gen(a)` is
  `gen(a)`, and the meet associates.
- An annotated document reads alike in every order of its statements
  (ADR-081).
- The annotation survives a reference, a spread, a preference, a
  disjunction that resolves, and a meet across files.
- It does not survive a computed value.
- `vet` gives one verdict with and without an annotation the value's
  type accepts.
- Canon reparses to the same canon, and the hash form differs between
  two documents that differ only in an annotation.
- The two engines write the same bytes for every row, and for the rows
  the oracle writes, the bytes the definition gives.

## 8. Plan

Steps 1 to 4 and 6 are built. A record's reading against its standard
set is an evaluation of its own, `new Unify(...)` in TypeScript and
`New().unifyCtx(...)` in Go, kept for the 256 readings a process made
last. One further thing was built that the plan did not name: the
JSON Schema exporter's loss, `gen`, in both ports.

1. **The model and the signature.** `aontu/gen/gen.aontu`; the line in
   `test/spec/signature.tsv`; `make aontu`, `make sig`. The pins that
   list the bundled models move.
2. **TypeScript.** `GenFuncVal` resolves to `any` carrying the record;
   `ride` meets two records and runs the check of D-5 where the type
   is known; a disjunction sends the record to each arm; the scalar
   classes round at generation; canon and the hash form write it; the
   three codes and their hints.
3. **Go.** The same, file for file.
4. **Shared rows.** `test/spec/annotation-gen.tsv`, each expectation
   obtained by running both engines; the `errcodes.tsv` rows.
5. **The definition.** `Number.significant`, a family of `gens` rows
   from the oracle, and the README's note of what waits.
6. **Documentation.** The function's entry and a section of the
   language reference, the functions reference, the error reference,
   the changelog.

## 9. Decisions for the owner

Each has a recommendation, and the first cut follows it. None is
expensive to change before a release.

1. **The tie rule.** Recommended: to the even digit, for the reasons
   in D-7. The alternative is half-up, which is what school teaches
   and what `0.125` to `0.13` expects. A `round` option (§5) would let
   a document choose, with this as its default.
2. **The spelling of "no limit".** Recommended: `"all"`. The
   alternatives are `null`, or an optional key with no default, which
   the request's "each with defaults" rules out.
3. **An integer no double holds once rounded.** Built: the exact
   digits are written (the Delta under D-7). The alternative is to
   refuse it and name `0d` as the repair, as `lossy_integer_literal`
   does for a literal.
4. **The kind `annotation`.** Recommended: a change of its own, after
   this one (D-9).
5. **A type that refuses an option.** Recommended: refuse the meet
   (D-5). The alternative is to ignore an option the type does not
   have, which the request's "must also unify with the standard set"
   rules out.

# Output options: `gen(spec)` — design note

Status: SECOND CUT IMPLEMENTED (2026-11-15), in both ports: a standard
set of options for every type, D-12 to D-18, where the first cut
(2026-11-14) gave one option to numbers and none to anything else.
Building it found two defects of the first cut, which the Deltas under
D-6 and D-17 record. The owner then ruled two spellings (2026-11-15),
which D-19 records: the default that leaves a text as it is is
`"verbatim"`, and a string given to `gen` is the `form`. A third
ruling the same day, D-20, also built: a record may give `custom`, an
expression that writes the output, and placeholder templates are
rejected. The model
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

The first cut gave `significant` to numbers and an empty set to every
other type. The owner's correction of 2026-11-15:

| The request says | Decision |
|---|---|
| "I only used float gen options as an example, you need to define gen options for all the other types, such as integer, map, path, etc" | D-12 to D-18 |

## 3. The design in brief

- `gen(spec: string|map) : annotation` is written as a term of a meet, like a
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

### D-1. The surface is `gen(spec: string|map) : annotation`, a term of a meet

```
gen(spec: string|map) : annotation
```

**Delta.** The first two cuts took a map alone. D-19 adds the string,
which is read as the record `{form: spec}`.

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

**Delta.** A graph atom, `acyclic()` or `inverse()`, holds the value it
rides beside, and a record met with one went to the atom and stopped
there. With the annotation written after the address,
`relate() & acyclic() & path($.a) & gen("key")`, the address was
written verbatim and a record its type refuses was not refused, where
the same terms with the annotation written first did both: an order
dependence, which section 7 rules out, found on 2026-11-16 while the
pull request was prepared. A holder is now held to its record by the
value it holds, a preference and an atom alike (`under` in
`ts/src/genrec.ts`, `genUnder` in `go/genrec.go`), and an atom lands
the record on a copy of what it holds where it generates, since an
atom shares that value with its copies. Rows `gen-atom-annotation-last`
on of `test/spec/annotation-gen.tsv` hold both ports to it.

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
  Number: close({
    significant: *"all"|integer & min(1)
    places: *"all"|integer & min(0) & max(4096)
    as: *"number"|"string"
  })
  String: close({ case: *"verbatim"|"upper"|"lower" empty: *"keep"|"omit" })
  Boolean: close({ as: *"boolean"|"number"|"string" })
  Null: close({ empty: *"keep"|"omit" })
  Path: close({ form: *"verbatim"|"absolute"|"pointer"|"key" })
  Map: close({
    keys: *"verbatim"|"camel"|"dot"|"kebab"|"pascal"|"path"|"snake"|"text"|"title"|"upper"
    empty: *"keep"|"omit"
  })
  List: close({ empty: *"keep"|"omit" })
})
```

That is the second cut's model. The first cut's held `significant`
alone, and an empty set for every type but `Number`.

- A set is closed, so an option the type does not have is refused.
- An option is a disjunction whose preferred arm is its default, the
  form `aontu:profile` already uses for `indent`.
- The default leaves the output unchanged. So `gen({})` on a value of
  any type is the same as no annotation.
- The four numeric leaves and the kind `number` share `Number`. D-12
  says why.
- A document can load the model (`@"aontu:gen"`) to read the sets, and
  the functions reference prints them.

The sets grow by adding options to this one file. D-12 to D-18 are
the options of the second cut, and §5 lists what was considered and
left out.

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

**Delta.** The first cut read the options in every generation, and the
engines generate a value in order to read it in more places than the
table above lists: a size (`len`), the members a fold takes, a
containment and an admission trial, the test that every arm of an
unresolved disjunction generates alike, `vet`, the relation check, a
view, `allow` and the JSON Schema export. So an option leaked into
each. `(1.26|1.27) & gen({ significant:2 })` generated `1.3`, where
the document without the annotation is an unresolved disjunction, and
`empty: "omit"` would have changed what `len` counts. The second cut
splits the two: a generation that reads is plain (`ctx.plain` in both
ports, set by `genPlain` in `ts/src/val/genwrite.ts` and at each reader
in Go), and only the one that writes the document applies an option.
The all-arms-alike test reads plain first, and then requires the arms
to be written alike too, so that two arms whose records differ stay two
arms. Rows `gen-read-*` hold each reader.

One consequence is new. `vet` reads the value, so it does not report
what only writing refuses: `gen_key_clash`, `gen_address`, and a
`float_overflow` from rounding. §9 puts that to the owner.

**Delta.** A record is itself read, against its type's set, and that
reading wrote its options: `significant:$.precision` beside
`precision: 2 & gen({as: "string"})` read the string `"2"`, which the
rounding then ignored. The record is read plain now, as every other
reader is. Found by review on 2026-11-16; rows `gen-option-read-*`
hold it.

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

**Delta.** The function is in a module of its own,
`spec/Aontu/Written.lean`, where the output step will join it, and not
in `Arith.lean`, whose every importer would have been rebuilt.
`Number.significant_of_le`, `Number.inLeafOf_isSome` and
`Number.significant_isSome` are in the axiom gate. The oracle writes
59 rows, `gs0` on of `test/spec/def-gen.tsv`, and both engines answer
every one as the definition does, so none is ledgered. The largest
double at one digit has no row, since the definition gives it no
number, and the engines refuse it in `annotation-gen.tsv`.

### D-11. What is left out

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
  `{ &: number & gen({ significant:2 }) }`. §9 puts this to the owner,
  because `keys` makes it matter more.
- The options of §5.

### D-12. Every type has a standard set

The first cut gave one option to numbers. The second gives each type
the options below. A type is a kind a document can write, and the
five numeric kinds share one set.

| Type | Set | Option | Values, the default first | Decision |
|---|---|---|---|---|
| `number`, `integer`, `float`, `biginteger`, `bigdecimal` | `Number` | `significant` | `"all"`, or an integer from 1 | D-7 |
| | | `places` | `"all"`, or an integer from 0 to 4096 | D-13 |
| | | `as` | `"number"`, `"string"` | D-14 |
| `string` | `String` | `case` | `"verbatim"`, `"upper"`, `"lower"` | D-15 |
| | | `empty` | `"keep"`, `"omit"` | D-16 |
| `boolean` | `Boolean` | `as` | `"boolean"`, `"number"`, `"string"` | D-14 |
| `null` | `Null` | `empty` | `"keep"`, `"omit"` | D-16 |
| `path` | `Path` | `form` | `"verbatim"`, `"absolute"`, `"pointer"`, `"key"` | D-17 |
| `map` | `Map` | `keys` | `"verbatim"`, or a style of `nom` | D-18 |
| | | `empty` | `"keep"`, `"omit"` | D-16 |
| `list` | `List` | `empty` | `"keep"`, `"omit"` | D-16 |

What makes something an option, and what kept the others out (§5):

1. It changes how the value is written and never which value the
   document holds (D-6). Sorting a list or trimming a string is a
   computation, and the language has functions for those.
2. Its default is the output the type has today, so a record of
   defaults is no record.
3. One name means one thing in every set that has it. `as` is the JSON
   type that is written. `empty` is what becomes of an empty value.
4. The options of one set compose: every combination has one output,
   and no option's meaning depends on the order they were written in.
5. Neither engine hands an option to its host (ADR-003). The one
   exception is `case`, which is the conversion `upper()` and
   `lower()` already make.

**The numeric kinds share `Number`.** A field typed `number` takes an
integer and a float alike, so `price: number & gen({ places:2 })` has
to take `24` as it takes `24.5`. Every leaf therefore accepts what
`number` accepts. An option only one leaf could honour would get a set
of its own; none of the three is one. `places` on an integer is not
idle: with `as: "string"` it writes `"24.00"`.

**`any` has no set.** An annotation on `any`, on a constraint with no
kind beside it, or on a reference not yet resolved waits for the type,
as D-5 has it.

### D-13. `places`: this many digits after the point

`places: n` rounds a number to `n` digits after the decimal point when
it is generated. The default, `"all"`, writes every digit.

The rule reads the number as D-7 does, as the decimal it shows,
`c × 10^e`:

1. If the number shows `n` digits or fewer after the point, it is
   unchanged. An integer and a biginteger show none, so they always
   are.
2. Otherwise it is rounded to the nearest multiple of `10^-n`, a tie
   to the even one.
3. The result stays in the number's own leaf: a float is the double
   nearest the rounded decimal, and a bigdecimal is exact.
4. A number that rounds to zero is written as zero, with no sign.

| Source | Generates |
|---|---|
| `3.14159 & gen({ places:2 })` | `3.14` |
| `2.675 & gen({ places:2 })` | `2.68` |
| `0.125 & gen({ places:2 })` | `0.12` |
| `24.5 & gen({ places:2 })` | `24.5` |
| `24 & gen({ places:2 })` | `24` |
| `0.004 & gen({ places:2 })` | `0` |
| `-0.004 & gen({ places:2 })` | `0` |
| `1e21 & gen({ places:2 })` | `1e+21` |
| `0d24.456 & gen({ places:2 })` | `24.46` |
| `0d24.456 & gen({ places:0 })` | `24.0` |

`2.675` shows the digits `2.675`, a tie, and goes to the even `2.68`.
JavaScript's `toFixed(2)` answers `2.67`, because the double is a
little below the tie. The reason for reading the digits is D-7's.

**With `significant`.** A record that gives both rounds once, at
whichever position keeps fewer digits. Two roundings in a row can
differ from one: `1.2451` to four digits is `1.245`, and that to two
places is the tie `1.24`, where the number itself is nearer `1.25`.

**The bound.** No number in the language shows more than 4096 places:
it is the scale budget of a bigdecimal, and a float shows at most 324.
The bound keeps the string form of D-14 a size the engines agree
they can write, where an unbounded count would be the host's to
refuse.

Rounding to places cannot overflow. A float large enough to be near
the largest double shows no digits after the point.

### D-14. `as`: the JSON type that is written

**A number as a string.** `as: "string"` writes a JSON string that
holds the characters the number would have been written with:

| Source | Generates |
|---|---|
| `3.14159 & gen({ significant:2 as:"string" })` | `"3.1"` |
| `1e21 & gen({ as:"string" })` | `"1e+21"` |
| `0d1e3 & gen({ as:"string" })` | `"1000.0"` |
| `0d123456789012345678901 & gen({ as:"string" })` | `"123456789012345678901"` |

A reader that parses every JSON number as a double keeps an integer
past 2^53, or a bigdecimal, only if it arrives as a string.

**With `places`, the string has exactly that many.** Where the record
gives `places: n`, the string is the rounded number in plain decimal
notation with `n` digits after the point, zeros added to make them,
and no point where `n` is 0:

| Source | Generates |
|---|---|
| `24 & gen({ places:2 as:"string" })` | `"24.00"` |
| `24.5 & gen({ places:2 as:"string" })` | `"24.50"` |
| `0.30000000000000004 & gen({ places:2 as:"string" })` | `"0.30"` |
| `-0.004 & gen({ places:2 as:"string" })` | `"0.00"` |
| `1e21 & gen({ places:2 as:"string" })` | `"1000000000000000000000.00"` |
| `0d24.456 & gen({ places:0 as:"string" })` | `"24"` |

This is the fixed-scale form that
`docs/how-to/carry-exact-money-over-json.md` carries money in: no
exponent, one spelling for each amount, and no `-0.00`. The digits
come from the rounded decimal and not from the double, so no binary
remainder shows.

Why the zeros are kept in a string and not in a number: a number that
either engine writes has no trailing zero to keep. A float is handed
out as the host's double, and a bigdecimal drops its trailing zeros
where it is built, so `0d24.50` is written `24.5` today. Writing
`24.00` as a number would need a new type in what `generate()` hands
out, for a spelling that every JSON reader discards on the way in.

**A boolean.** `as: "number"` writes `1` for `true` and `0` for
`false`, and `as: "string"` writes `"true"` and `"false"`.

### D-15. `case`: the case of a string

`case: "upper"` writes the string as `upper(s)` answers it, and
`case: "lower"` as `lower(s)` does. The default, `"verbatim"`,
changes nothing.

The document keeps the string as it was written, for every reference,
pattern and comparison, and the wire gets the convention it expects.
A constant that is `"active"` in the model and `"ACTIVE"` in the
output is the use.

### D-16. `empty`: whether an empty value is written

The empty values are `""`, `null`, a map that writes no member, and a
list that writes no element. `empty: "omit"` leaves an empty value out
of the map or list that holds it. The default, `"keep"`, writes it.

```aontu
user: {
  name: "ada"
  nick: "" & gen({ empty:"omit" })
  tags: [] & gen({ empty:"omit" })
  note: null & gen({ empty:"omit" })
}
```

```json
{"user": {"name": "ada"}}
```

- Emptiness is judged on what is written. A map whose members are all
  hidden, or all omitted, writes no member and is empty.
- A value that is not empty is written, whatever the option says.
- A list closes up: the elements after an omitted one move down, as
  they do after a hidden one.
- Nothing holds the document's root. An omitted root generates
  nothing, as a hidden root does, and the CLI prints `null` for both.
- Zero and `false` are data and not absence, so numbers and booleans
  have no `empty`.

The language already drops one empty value: an optional key whose
value generates an empty map or list leaves no member (the reference,
"An empty container supplies nothing"). `empty: "omit"` says the same
of a required key, and of `""` and `null`, which an optional key
keeps.

Only generation reads it (D-6). The member is there for `len`, for a
closed map's count of its keys, for a reference and for `vet`.

### D-17. `form`: how an address is written

A `path` is written as its text today: `"$.a.b"`, `".a"`, `"..a"`.
`form` chooses the notation:

| `form` | Writes | `path(..b.c)` at `$.a.x` |
|---|---|---|
| `"verbatim"` | the text the document wrote | `"..b.c"` |
| `"absolute"` | the address from the root | `"$.b.c"` |
| `"pointer"` | the absolute address as a JSON Pointer (RFC 6901) | `"/b/c"` |
| `"key"` | the last segment | `"c"` |

- A relative address is resolved from the place the value is
  generated at, by the rule `relate()` resolves one by: the leading
  dot is the scope that holds the value, and each further dot is one
  step up. A link's address is the one `relate()` already resolved.
- A segment of an address is letters, digits, `_` and `-`, so no
  segment needs the pointer's `~0` and `~1` escapes.
- `"key"` is the form a foreign key takes: with it the file-system
  model writes `"parent": "etc"` where it writes
  `"parent": "$.fs.nodes.etc"` today.
- A relative address that climbs past the root has no absolute form.
  `"absolute"` and `"pointer"` refuse it where it is generated, with
  `gen_address`. `"key"` and `"verbatim"` need no position and
  write it.

`relate()` still checks the address and never rewrites it. `form`
changes the text that is written and nothing a relation reads.

**Delta.** "The place the value is generated at" was not something a
value knew. Both engines give a map or a list its place where it is
generated, and leave a scalar, a preference and an arm with the place
they were written at. A value that arrives through a spread's
template, a preference or a copy of a type therefore held the
template's place: the first cut reported a `float_overflow` under a
spread at the template's path, in both ports alike. The container now
tells the generation where it has reached (`ctx.genat` in TypeScript,
`Ctx.at` in Go), and `form` and every refusal of writing read that.
Rows `gen-form-spread-template`, `gen-form-default-in-a-spread`,
`gen-form-type-copy` and the three `*-names-the-place` rows hold it.

**Delta.** A pointer joined the keys as they were, so a key above a
relative address that held `/` or `~` named another place: under
`"a/b"`, `.x` was written `/a/b/x`. A written segment holds neither, a
key can, and the pointer now writes each as RFC 6901 does, `~0` and
`~1`. Go read a link's keys back out of its dotted address, which split
a key holding `.`; it reads the link's own keys now. Found by review
on 2026-11-16; rows `gen-form-pointer-escapes-a-slash` on hold it.

### D-18. `keys`: the naming style of a map's keys

`keys: s` writes each key of the map as `nom(key, s)` answers it. The
styles are `nom`'s: `camel`, `dot`, `kebab`, `pascal`, `path`,
`snake`, `text`, `title` and `upper`. The default, `"verbatim"`,
changes nothing.

```aontu
order: { orderId: 7 shipTo: "Cork" } & gen({ keys:"snake" })
```

```json
{"order": {"order_id": 7, "ship_to": "Cork"}}
```

- The style is one definition, the one `nom` has, so a key and a name
  computed with `nom` agree.
- It applies to the map's own keys. A map inside it is written by its
  own record (D-11).
- A key that holds no word, such as `_`, has no other spelling, and is
  written as it is. `nom` refuses such a name; a key is data the
  author did not choose to pass to a function.
- No acronym list. `nom` takes one as an argument, and §5 keeps it for
  later.
- Two keys that would be written as one key are refused where the map
  is generated, with `gen_key_clash`: `{ a_b:1 aB:2 }` in `snake`. The
  output would hold one member where the document holds two.
- The output's members are in the order of the keys that are written,
  as every map's are.

**Delta.** The report's details are `written`, `a` and `b`, the two
keys in code-point order. A detail named `key` is one the error frame
already reads, as the key of the member it points at.

### D-19. `verbatim`, and a string is the form

Two spellings the owner ruled on 2026-11-15, after the second cut.

**The default that leaves a text as it is is `"verbatim"`**, in the
three options that have such a default: `case`, `form` and `keys`. The
second cut spelled it another way, and nothing of that spelling is
kept, since no release carried it.

**A string given to `gen` is the form.** `gen("key")` is
`gen({ form:"key" })`:

```aontu
parent?: relate($.type.Folder) & acyclic() & gen("key")
```

- The string becomes the record `{form: X}` where the call resolves,
  so everything after that is the record's: two annotations meet as
  maps, `gen("key") & gen({ form:"key" })` is one annotation, and
  `gen("key") & gen("pointer")` is refused with `gen_conflict`.
- Canon writes the record, `path(.b)&gen({"form":"key"})`, so the two
  spellings of one annotation have one canon and one hash.
- The argument is a value, so a reference to a string is read before
  the call resolves, as a reference to a map is.
- The string is held to the standard set like any record. A form the
  type does not have is refused with `gen_option`, and so is the
  shorthand on a type that has no `form` at all.
- The signature gate reads `string|map`, so a number, a list or a
  boolean is still refused with `func_arg`, as is the kind `string`.
- It is the convention the layout builtins already have: `file`,
  `folder` and `content` take `spec: string|map`, and a bare string
  fills the one field a call most often gives.

Only `Path` has an option named `form`, so the shorthand writes a path
and nothing else today. §9 asks whether the other types should have a
`form`.

### D-20. `custom`: an expression that writes the output

The owner's instruction of 2026-11-15: "Placeholder templates are
explicitly rejected. Introduce the gen spec attribute "custom" that
has a custom expression to define the output."

**Rejected: placeholder templates.** A string with named parts, such
as `gen("urn:node:{key}")`, was proposed for a path and is ruled out.
It would be a second, smaller language inside a string, for what the
language's own expressions already say.

**The surface.** A record of any type may give `custom`, an expression
in which the hole `_` stands for the value being written:

```aontu
parent: path($.fs.nodes.etc) & gen({ form:"key" custom:"urn:node:" + _ })
price: 24 & gen({ places:2 as:"string" custom:"EUR " + _ })
tags: ["a", "b"] & gen({ custom:join(_, ",") })
```

```json
{"parent": "urn:node:etc", "price": "EUR 24.00", "tags": "a,b"}
```

**The rule.** Where the value is written, `custom: f` writes what
`apply(w, f)` generates, where `w` is what the value writes without
it:

1. The record's other options are applied first, and for a map or a
   list its members are written by their own records. So the
   expression has the address in the form asked for, the number's
   rounded digits, the keys in their style.
2. `w` is read as data, the way a document reads a JSON value, and
   `apply` binds the hole to it, as `apply` does anywhere.
3. What the expression gives is generated, and that is the output. An
   expression that generates nothing writes nothing.
4. `empty` is judged last, on the output.

The hole is the language's own (`_`, the reference's "The placeholder
`_`"), and `gen` joins the constructs that bind one: a hole in the
`custom` of a `gen` call's map is bound, and a hole anywhere else in
the call is one nothing binds, as before.

**Read as data.** `w` is JSON, and a JSON number has no leaf, so the
rule a document reads a literal by decides it. A whole number is an
integer where the integer leaf holds it and a biginteger where it does
not, a bigdecimal stays exact, and any other number is a float. A
float that writes no fraction, `2.0`, is therefore the integer `2` to
the expression, in both engines alike.

**The expression stands alone.** It is evaluated on its own, with the
hole and nothing else of the document:

- A reference in it names nothing, and refuses where the value is
  written. `key()` is not the member's key.
- It is written in the `gen` call's own map. A map elsewhere that
  holds a hole is `hole_unbound`, as any is, so a record reached by
  reference can give only a `custom` that has no hole, a constant.
- It is kept as it is written, in canon form, and is part of the
  record: canon writes it, `gen({"custom":"urn:node:"+_,"form":"key"})`,
  the hash covers it, and two records whose expressions differ are
  refused with `gen_conflict`.

**It is an option of every type's set**, written `custom?: any` in the
model: optional, with no default, since leaving it out is the default.
The engines do not hold the expression to the set, which has nothing
to say of an expression, and hold every other option as before.

**Only writing evaluates it** (D-6). `vet`, a size, a fold and every
other reading read the value, so an expression that fails is found
where the document is generated, with the new code `gen_custom`. The
report names the expression, what it was given, and the code of what
stopped it.

Why the hole is what the value writes, and not the value: the
expression is the last step of writing, and it is the other options
that make the text worth composing. `"EUR " + _` over the value reads
the number's own text, `24`, by D-6; over what is written it has
`24.00`. An expression that wants the value's own text asks for no
other option.

Why it stands alone: where a value is written is after the document
has been evaluated, and an expression that could read the document
there would make the output depend on an evaluation the document's
own readings never saw. §9 puts both choices to the owner.

**Delta.** Built as proposed, in both ports, the same day.

- The expression is taken where the call is built, the `GenFuncVal`
  constructor and `newFunc` in `go/func.go`, and not where it
  resolves. So no hole is left under the call for the check that
  finds unbound holes, or for a generator around the call to fill:
  in `each(l, _ & gen({ custom: "<" + _ + ">" }))` the second hole is
  the call's. It is kept as a scalar of a kind of its own, whose
  canon is its text, so the record still meets, compares and renders
  as a map.
- The output is made by an evaluation of its own, of
  `out: apply(w, f)`, as a record's reading against its set is. `w`
  is written by `lit` in `ts/src/val/genwrite.ts` and `genLit` in
  `go/genwrite.go`. An output that is a scalar is kept for the next
  value given the same input, for 256 pairs; a map or a list is made
  again for each place, so two places never share one.
- In Go a nil answer is both a written null and nothing. The
  generation tells its container which it was (`Ctx.wroteNull`), since
  an expression can write a null for a value that is not one.
- The set does not hold the expression: `optionsOf` reads a record
  against its set without it.

**Delta.** The expression's document was generated and nothing more,
so the checks a document's own generation runs after it, the relation
verdict and the declared names, never ran on it: an expression that
built a relation it declared `acyclic()` around a loop was written out.
Its output is now held to them, with what unifying it declared, and a
refusal is `gen_custom` with the check's code as its cause. Found by
review on 2026-11-16; rows `gen-custom-relation-checked` and
`gen-custom-relation-passes` hold it.

## 5. Options considered and left out

Each fails one of the tests of D-12, or has no use yet that pays for
its rows in two engines.

| Type | Option | Why it is out |
|---|---|---|
| `Number` | `round: "half-up"`, `"down"`, `"up"` | ruled out: a tie goes to the even digit (§9) |
| `Number` | `radix: 2`, `8`, `16` | a string form only, and no use has asked for it |
| `Number` | `notation: "plain"`, `"exponent"` | `places` already gives the plain form; the exponent form has no use yet |
| `Number` | `as: "boolean"` | which numbers are true is a rule, and a rule is a computation |
| `String` | `trim`, `max` | these compute a different string; `case` is kept because the letters stay |
| `String` | `as: "number"` | parsing can fail, so it is a function |
| `Path` | `as: "list"` | the segments as a JSON list; no use has asked for it |
| `Map` | `acronyms: [...]` | the list `nom` takes, so `userId` can be written `UserID` |
| `Map` | `as: "list"` | the members as a list of values; it loses the keys |
| `Map` | `order: "written"` | both engines write keys sorted, and Go's output type is unordered |
| `List` | `sort`, `unique` | order and membership are the value |
| every type | `deep: true` | the record reaching the members (§9) |
| `Path` | a template, `"urn:node:{key}"` | ruled out (D-20): `custom` says it in the language's own expressions |

## 6. Errors

| Code | Class | Raised when |
|---|---|---|
| `func_arg` (exists) | conflict | the argument is not a map of concrete data |
| `gen_conflict` | conflict | two annotations on one value disagree |
| `gen_option` | conflict | the standard set of the value's type refuses the record |
| `float_overflow` (exists) | conflict | a float rounds beyond the largest double |
| `pref_rank_clash` (exists) | conflict | two defaults of one rank differ in their records |
| `gen_key_clash` | conflict | two keys of a map are written as one key (D-18) |
| `gen_address` | reference | a relative address that climbs past the root is asked for its absolute form (D-17) |
| `gen_custom` | conflict | a `custom` expression gives no output for the value it is given (D-20) |

Each new code lands with its `test/spec/errcodes.tsv` row and its hint
in the same change. A `gen_option` report names the option, the type
and the set, and a `gen_conflict` report names both annotations'
sites. A `gen_key_clash` report names both keys and the key they would
share, and a `gen_address` report names the address.

The second cut's two codes are raised where the value is generated,
as `float_overflow` is, and not at the meet: a key clash depends on
which members are written, and an address on where it is written.

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

The second cut adds:

- A record that writes out every default of its type's set generates
  the bytes that no record does.
- Every option is written on a value, on its kind, through a
  reference, a spread, a preference and a disjunction, and generates
  alike on each road.
- `empty: "omit"` changes no verdict of `vet` and no answer of `len`.
- The rounding of `places`, alone and with `significant`, and the text
  of `as: "string"` are checked against a third implementation, as
  D-10 has the first cut's rounding checked.

## 8. Plan

Steps 1 to 6 are built, the fifth as the Delta under D-10 says. A record's reading against its standard
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

The second cut, the options of D-12 to D-18:

7. **The model.** The sets of D-4 in `aontu/gen/gen.aontu`;
   `make aontu`.
8. **TypeScript.** `places` and `as` beside `significant` in
   `ts/src/val/genwrite.ts`; `case`, `empty` and the boolean's `as`
   in the scalar classes; `form` in `PathVal`; `keys` and `empty` in
   `BagVal.gen`; the two codes and their hints.
9. **Go.** The same: `go/genwrite.go`, `go/scalar.go`, `go/mapval.go`,
   `go/listval.go`.
10. **Shared rows.** A family for each option in
    `test/spec/annotation-gen.tsv`, and the two `errcodes.tsv` rows.
11. **The definition.** `Number.places` and the fixed text beside
    `Number.significant` in `spec/Aontu/Written.lean`, with oracle
    rows.
12. **Documentation.** The section of the language reference grows a
    table of every type's options and a passage for each; the error
    reference; the changelog.

## 9. Decisions for the owner

### Ruled

The owner ruled on these on 2026-11-14, each as the first cut was
built:

1. **The tie rule.** To the even digit, for the reasons in D-7. No
   `round` option.
2. **The spelling of "no limit".** `"all"`.
3. **An integer no double holds once rounded.** The exact digits are
   written (the Delta under D-7).
4. **The kind `annotation`.** Later, as a change of its own (D-9).

The owner ruled two more on 2026-11-15, which D-19 records: the default
that leaves a text as it is is spelled `"verbatim"`, and a string
given to `gen` is the `form`. And a third, which D-20 records:
placeholder templates are rejected, and a record gives a custom
output as an expression, `custom`.

One was settled by the request itself:

5. **A type that refuses an option.** The meet is refused (D-5). The
   request's "must also unify with the standard set" rules out
   ignoring an option the type does not have.

### Open

Each has a recommendation, and the second cut follows it. None is
expensive to change before a release.

6. **Does a container's record reach its members?** Recommended: no
   (D-11). `keys` is where it costs: a document that wants every map
   in `snake` has to annotate every map. The alternative is a `deep`
   option on `Map` and `List` that hands the record down.
7. **The set for the numeric kinds.** Recommended: one, `Number`
   (D-12). The alternative is a set for each leaf, which lets an
   option belong to `integer` alone and refuses it on a field typed
   `number`.
8. **Exact places as a number.** Recommended: only the string form
   keeps trailing zeros (D-14). The alternative is a raw number in
   what `generate()` hands out, so that `24.00` can be a JSON number.
9. **An omitted root.** Recommended: it generates nothing, as a
   hidden root does (D-16). The alternative is that the option has no
   effect at the root.
10. **Which styles `keys` takes.** Recommended: all nine of `nom`
    (D-18). The alternative is the five that are common in JSON:
    `camel`, `kebab`, `pascal`, `snake`, `upper`.
11. **A key with no word.** Recommended: written as it is (D-18). The
    alternative is to refuse it, as `nom` refuses the name.
12. **`case` and the host.** `upper()` and `lower()` ask the host for
    the conversion, and `case` inherits that (D-15). It is the one
    option that does.
13. **Which types have a `form`.** Built: `path` alone, so `gen("x")`
    is a path's shorthand. Each other type has one option that chooses
    a notation: `case` for a string, `keys` for a map, `as` for a
    number and a boolean. Naming those `form` would let the shorthand
    reach every type, `"ada" & gen("upper")` and `7 & gen("string")`,
    and would give one name four meanings.
14. **What `custom` is given.** Built: what the value writes without
    it, read as data (D-20). The alternative is the value itself, with
    its leaf and its members' records, which makes the other options
    of the record idle beside `custom`.
15. **Whether `custom` may read the document.** Built: no, it stands
    alone (D-20). The alternative resolves its references where the
    annotation is written, so `custom: $.prefix + _` works, and has to
    say what a reference that settles late does.
16. **`vet` and a refusal of writing.** Built: `vet` reads the value
    and does not report a key clash, an address with no absolute form,
    or a rounding that overflows (the Delta under D-6). The alternative
    is that `vet` also runs the generation that writes, and reports
    what it refuses as findings.

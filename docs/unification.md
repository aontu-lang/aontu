# Unification

Aontu has one operation. Every construct in the language — a second
statement for the same key, an `&`, an included file, a spread applied
to a child, a schema checked against data — is that one operation
under a different spelling. It is called **unification**, and this page
is what it means.

The [language reference](reference-language.md) states the rules.
This page explains the idea they come from, and defines the vocabulary
the rest of the documentation uses: *meet*, *top*, *bottom*, *lattice*,
*residual*, *subsumption*.

## Values are ordered by how much they say

Start with an ordering rather than an operation. Of any two Aontu
values, one may be **more specific** than the other — it admits fewer
possibilities.

`integer` admits every whole number. `8080` admits one. So `8080` is
more specific than `integer`, and `integer` is more general than
`8080`. Write that as `8080 ⊑ integer`.

The ordering is partial, not total: `8080` and `"auto"` are not
comparable in either direction, and neither is `min(1024)` against
`max(65535)`. Most pairs of values have no ordering between them at
all. That is the normal case, and it is what makes the next paragraph
do any work.

## The meet is the answer to "both"

Given two values, the **meet** is the most general value that is at
least as specific as both. Written `a & b`. It is the answer to a
question you ask constantly without noticing: *what is still true if
both of these hold?*

`integer & 8080` is `8080` — the only whole number that is also `8080`.
`integer & min(1024)` is neither of its operands: it is a third value,
`integer & min(1024)`, still waiting to be narrowed. A value in that
state is a **residual** — it holds real information and is not yet one
concrete answer.

<!-- test: scenario unification-meet -->
```aon
port: integer
port: min(1024)
port: 8080
```

```json
{ "port": 8080 }
```

Three statements about one key, met into one value. The engine never
chose between them and never overwrote one with another; it asked what
satisfies all three.

"Meet" is the standard name for this operation in order theory, and
Aontu's error messages use it. When you read *"a constraint is the meet
of bound atoms"*, it is this: the one value that carries every
constraint at once.

## Top and bottom

An ordering like this needs two endpoints, and both are ordinary
values you can write.

**`top`** is the most general value: it admits everything. It is what
an unconstrained field is, and it is the identity of the meet —
`top & x` is `x`, for every `x`. A field that is still `top` at the end
of a run says nothing, so it cannot be generated.

**`nil`**, also called **bottom** and written `⊥` in order theory, is the most
specific: it admits nothing. It is what a failed unification produces.
`1 & 2` is `nil`, because no value is both. `nil` carries the error
that made it and cannot be generated either.

Every other value sits between them, under the kind it belongs to:

![The value lattice: top at the join; string, number, boolean and null under it; path() under string; integer, float, biginteger and bigdecimal under number; nil at the meet, below every kind.](figures/value-lattice.svg)

`"ada"` sits under `string`, `1` under `integer`, `0d0.1` under
`bigdecimal`, `true` under `boolean` — each one a point below the kind
that admits it, and every one of them above `nil`.

A structure with a top, a bottom, and a meet for every pair is a
**lattice**, which is where the term comes from. The
[value lattice](reference-language.md#the-value-lattice) section of
the language reference gives the rules, kind by kind.

## Three laws, and what they buy you

The meet obeys three laws. They are not decoration — everything Aontu
claims about being safe to split, merge and re-order rests on them.

**Idempotent.** `a & a` is `a`. Saying a thing twice says it once.

```aon
region: string
region: string
region: "eu-west-1"
region: "eu-west-1"
```

```json
{ "region": "eu-west-1" }
```

**Commutative.** `a & b` is `b & a`. Neither operand wins by being
first.

**Associative.** `(a & b) & c` is `a & (b & c)`. Grouping does not
matter either.

Take the three together and a document has no evaluation order to
reason about. There is no "later key wins", no cascade, no
precedence table, no question of which file was loaded first. Write
the shape as `shape.aon`:

<!-- test: file shape.aon -->
```aon
port: integer
port: min(1024)
```

the pin in another, `pin.aon`:

<!-- test: file pin.aon -->
```aon
port: 8080
```

and load them in one order as `a.aon`:

<!-- test: file a.aon -->
```aon
@"./shape.aon"
@"./pin.aon"
```

and the other order as `b.aon`:

<!-- test: file b.aon -->
```aon
@"./pin.aon"
@"./shape.aon"
```

<!-- test: run -->
```sh
$ aontu a.aon
{
  "port": 8080
}
$ aontu b.aon
{
  "port": 8080
}
```

The same document, twice. This is the property that makes an overlay
file, a vendored module and a machine-generated fragment all safe to
combine: none of them can silently outrank another by arriving later.

It is also why a conflict is reported rather than resolved. If `a: 1`
and `a: 2` both hold, no order of evaluation makes one of them correct,
so the engine refuses instead of picking:

<!-- test: skip the framed multi-line error is shown in Read a conflict error -->
```
[aontu/scalar_value]: Cannot unify values at path $.a
```

A last-write-wins merge would have answered `2` here, and been wrong
about it in a way nothing could detect.

## Subsumption is the same order, asked as a question

Once values are ordered, you can ask about the order directly rather
than computing with it. **Subsumption** is that question: does `A`
admit everything `B` admits? Every instance the specific document
allows, does the general one allow too?

That is `B ⊑ A`, the same relation the meet is built from — and it has
an equivalent phrasing in terms of the meet: `A` subsumes `B` exactly
when `A & B` is `B`. Nothing new is needed to decide it.

The [`aontu subsume`](reference-api.md#aontu-subsume) verb answers it
for two documents, and [`aontu breaking`](reference-api.md#aontu-breaking)
runs it between a document and its own earlier version, which is what
makes "is this schema change breaking?" a question with a mechanical
answer.

## What Aontu does not have

A lattice has a second operation, the **join**: the most *specific*
value at least as general as both, the answer to "either". Aontu's
disjunction `a|b` looks like a join and is deliberately not one — it
keeps both alternatives as a value that is still undecided, rather than
collapsing them to a common supertype. `1|2` stays `1|2`; it does not
become `integer`.

The difference matters when generating: an unresolved disjunction has
no single value, so generation refuses rather than guessing. A real
join would have thrown away exactly the information that refusal
depends on.

## Where to go next

- [The value lattice](reference-language.md#the-value-lattice) — the
  normative rules, kind by kind.
- [Conjunction `&`](reference-language.md#conjunction-) — the operator,
  exhaustively.
- [Read a conflict error](how-to/read-a-conflict-error.md) — what the
  engine prints when a meet lands on `nil`, and how to find the two
  statements responsible.
- [Explanation](explanation.md) — why the engine is built the way it
  is, including where the ordering is deliberately incomplete.

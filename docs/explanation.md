# Explanation: how and why Aontu works

This document is discursive. It explains the ideas behind Aontu and the
shape of the implementation, and argues some of the trade-offs. It is the
place to build a mental model; for precise rules use the
[Language reference](reference-language.md), and for recipes the how-to
guides listed in the [index](index.md).

## The core idea: one operation, three jobs

Most configuration stacks use *three* different mechanisms: a schema
language to say what is allowed, a defaults mechanism to fill gaps, and a
merge/override step to layer environments. Aontu — following
[CUE](https://cuelang.org/) — collapses all three into a single
operation, **unification**, by making types, defaults, and data the *same
kind of thing*: values in a lattice.

- A schema like `port: integer` is just a value (the set of all
  integers).
- A default like `port: *8080` is just a value (a preference annotation
  on `8080`).
- Data like `port: 9090` is just a value.

Combining any of them is the same act: take the **greatest lower bound**
of the two values — the most general value that is at least as specific
as both. When that bound exists you get a result that honours every input
at once; when it does not, you get a precise error. There is no
precedence to remember and no order dependence: `a & b` always equals
`b & a`, and re-applying a fact changes nothing (`a & a == a`).

This is why the same document can be schema, defaults, and data
simultaneously, and why merging two configurations can never silently
pick a winner — it either narrows to a consistent answer or fails loudly.

## The lattice

Values are ordered from general to specific:

```
top  ⊐  string ⊐ "ada"
     ⊐  number ⊐ integer ⊐ 1
     ⊐  boolean ⊐ true
                         ⊐ … ⊐  nil (⊥)
```

- **`top`** sits above everything and is the unit element: `x & top == x`.
  An unconstrained field *is* `top`.
- **`nil`** sits below everything; it is what you get when two values have
  no common lower bound. `nil` carries a message and poisons generation.
- Unification walks *down* the lattice. `number & integer` → `integer`
  (more specific); `integer & 1` → `1`; `1 & 2` → `nil` (no value is both).

Disjunction (`|`) builds a small lattice of alternatives; unifying a
concrete value against it keeps the branches that survive and discards
the rest. Preference (`*`) is a tie-breaker annotation that says "if the
choice is otherwise unforced, pick me".

## The pipeline

Both implementations share the same three-stage pipeline:

```
source text ──parse──▶ Val AST ──unify (fixpoint)──▶ unified Val ──generate──▶ native value
                                                              ├──canon──▶ source-like text
                                                              └──ask────▶ vet · get · why · subsume · hash
```

1. **Parse.** [`@tabnas/jsonic`](https://github.com/tabnas/jsonic) plus
   the `expr`, `path`, `multisource`, and `directive` plugins turn relaxed
   JSON-with-operators into a tree of `Val` nodes — `MapVal`,
   `ConjunctVal`, `RefVal`, `ScalarKindVal`, and so on. Operators like
   `&`, `|`, `*`, `.`, `+` are configured as parser expression operators
   with explicit binding powers, which is how precedence is defined (see
   [`ts/src/lang.ts`](../ts/src/lang.ts)).

2. **Unify.** A fixpoint loop repeatedly unifies the tree with `top`
   until it stops changing or an error appears. Each `Val` subclass knows
   how to unify itself with a peer.

3. **Generate / canon.** A converged tree is either emitted as a native
   value (`gen`) or rendered as canonical source (`canon`).

The third arrow fans out instead of adding a fourth stage. `vet`, `get`,
`why`, `subsume` and `hash` all interrogate the *same* converged tree
that `generate` renders, which is why they agree with one another by
construction rather than by care, and why none of them can be a partial
evaluation. What they are *for* is argued below, in
[Why there is a verb surface](#why-there-is-a-verb-surface).

### Why unification runs to a fixpoint

References make a single pass insufficient. Consider:

```
a: { v: $.b.v }
b: { v: $.c.v }
c: { v: 99 }
```

On the first pass `$.b.v` resolves to *another reference* (`$.c.v`),
which only resolves to `99` once `c` has settled. So unification runs in
rounds: each pass refreshes the root and re-resolves references against
the latest tree, and the loop ends when every node reports "done"
(`dc == DONE`) or an error is collected. The loop is bounded (a small
maximum pass count) so a pathological model terminates rather than
spinning.

### The dispatch ladder

The engine's dispatch is one binary function, `unite(a, b)` (see
[`ts/src/unify.ts`](../ts/src/unify.ts) and
[`go/unify.go`](../go/unify.go)), and it is a careful ladder of cases:

- degenerate/`top` cases first (unit element);
- `nil` short-circuits (bottom is absorbing);
- **complex** values that know how to "absorb" a peer — conjunction,
  disjunction, reference, preference, function — drive their own
  `unify`;
- otherwise the two concrete values are matched directly (equal scalars
  collapse; mismatches become `nil`).

Each `Val` type implements only the cases it understands and defers the
rest by unifying with `top`. This keeps the type-specific logic local:
`MapVal.unify` knows about keys and spreads, `DisjunctVal.unify` knows
about trying alternatives, `ScalarKindVal.unify` knows that `number`
subsumes `integer`, and none of them needs to know about the others.

### Distribution and trials

Conjunction distributes over disjunction: `x & (a | b)` tries `x` against
each alternative independently and keeps the survivors. The
implementation runs each alternative as a *trial* with its own throwaway
error bucket — if the trial collects an error, that branch is dropped.
The TypeScript version optimises this hot path with a shared "trial nil"
sentinel and save/restore of the error array instead of cloning a context
per alternative, because schemas with many disjunctions
(`GET | PUT | POST | …`) make this the busiest path in the engine.

## Recursive schemas and residuals

Unification needs a word for a value that is still waiting. A
**residual** is that word, and this page is its definition of record: a
residual is a value that has absorbed everything said about it so far
and still needs more information to be decided — a `min(1)` no number
has reached yet, a reference whose target a later include will declare,
an entity address whose entity has not yet appeared. Residuals are what
let the fixpoint loop be honest: each pass either brings information
that discharges one or leaves it standing, and the ones still standing
when the loop settles are the document's open questions, judged by
whatever consumes the tree next — `vet` reports them as its
`incomplete` verdict, generation refuses one left in a demanded
position, and canon prints each as it was written.

One residual deserves its own argument, because it looks like the thing
this engine most loudly refuses. A reference to a value from **inside
that value** — `$.schema.Step` written inside `Step` — means the
fixpoint: a `Step`, by this very definition. The engine's cycle
detector always recognised the shape; what changed is the response.
Where the prefix test used to refuse with `path_cycle`, it now answers
a **recursive residual**, a deferred reference carrying its target
exactly as a constraint atom carries its bound. When concrete data
meets the residual, it expands the definition one level — per
destination, under the same clone discipline spreads use — and the
clone's own self-reference is again a residual. Each meet with data
consumes one level of data:

```aontu
schema: hide({Step: {label: string, then?: $.schema.Step}})
doc: $.schema.Step & {label: "a", then: {label: "b", then: {label: "c"}}}
```

```json
{"doc": {"label": "a", "then": {"label": "b", "then": {"label": "c"}}}}
```

The schema is one reference deep; the checks descend exactly as far as
the data does, and no further. Mutual recursion needs nothing extra:
once `$.B` expands inside `A`, the `$.A` in the clone is a
self-reference at its landed position and residuates by the same rule.

That expansion rule is also the termination argument, and it has to be,
because the [limitations below](#limitations-and-trade-offs) refuse
user-defined functions on termination grounds. The two rulings are
consistent because they license different recursions. A recursive
*function* is a fixpoint of the program, and whether its expansion ends
is undecidable — admitting one would demote "every Aontu program
terminates" to "most do", and
[Termination is part of the offer](#termination-is-part-of-the-offer)
says what that demotion costs. A recursive *schema* is structural
descent on the data: an expansion happens only at a meet with concrete
structure and consumes one level of it, and data is finite, so the
expansions along any path are bounded by the data's depth. The one
shape that escapes the bound — two recursive definitions unified
directly, with no concrete layer between them to consume — is caught by
the depth budget, and exhausting it refuses with
`[aontu/recursion_budget]`, naming the recursion. The guarantee
survives as the smaller of the data's depth and the budget.

Guardedness is **emergent**: the engine never analyses a schema for
well-foundedness, because the data decides. Under an optional key
(`then?:`) an unexpanded residual drops with its key; under
`*null | $.Node` the preference generates; and a required recursive
field that no data reached refuses at generation, per instance, at the
exact position no finite document can fill:

```
schema: hide({Step: {label: string, then: $.schema.Step}})
doc: $.schema.Step & {label: "start"}
    → refused: [aontu/recursion_unexpanded] at $.doc.then
```

A static well-foundedness check was considered and declined: it would
need an analysis the lattice never needed, and the per-instance refusal
names the same fix at the place the author feels it.

In canon and the `aon1-` hash the recursion stays **symbolic** — the
residual prints as the reference the author wrote:

```
schema: hide({Step: {label: string, then?: $.schema.Step}})
    → canon: {"schema":{"Step":{"label":string,"then"?:$.schema.Step}}}
```

So the canonical form of a recursive schema is finite, reparses to
itself, and the hash pins the mu-form: one string names an infinitely
deep type, which is what makes the hash usable as a schema version pin.
This is a documented exception to the hash form's resolve-everything
rule, and a principled one — a recursive reference is the fixpoint
binder, and the binder *is* its own resolved form.

The rules are in the reference under
[Recursive references (fixpoints)](reference-language.md#recursive-references-fixpoints);
the recipe is
[Define a recursive schema](how-to/define-a-recursive-schema.md); and
the live version, an approval chain checked at every depth, is
[use-cases/13-recursive-schema](../use-cases/13-recursive-schema/).

## Immutability

A foundational rule, stated right on the base class: **`unify` must not
mutate its operands.** Unification returns a *new* value; the inputs are
left intact. This is what makes order-independence and the fixpoint loop
sound — a value can be unified many times, against many peers, across
many passes, and shared structurally between branches, without one
unification corrupting another. Cloning carries a value to a new path
(references resolve relative to where a value *is*), but the original is
never altered in place.

## Marks: separating schema from data

Two boolean **marks** ride along with every value: `type` and `hide`.
Both leave *what* a value unifies to alone and decide only whether it is
*emitted*. A `type`-marked field is schema and a `hide`-marked field is a
working value — both are omitted when their enclosing map is generated,
yet both still constrain unification. This is how a single document can
carry its own schema inline without that schema leaking into the output,
and why `copy()` (which clears the marks) is the way to turn a schema
node back into emittable data.

## Linking and relations

A document is a tree, and a tree gives every value exactly one name:
its path. The payments service is described by the catalog (owner,
tier) and by the deployment (image, replicas), in two files, under two
paths that never mention each other — and both descriptions are about
one thing. Unification is path-aligned, so on their own the two never
meet, and a contradiction between them survives in silence.

Bringing them into contact is a **reference**, which is to say it is
something an author writes at one of the two sites. The shape, trimmed
from the [service catalog use
case](../use-cases/01-service-catalog/):

```aontu
catalog: pay: { tier: 1 }
deploy: pay: $.catalog.pay & { replicas: 3 }
```

```json
{"catalog": {"pay": {"tier": 1}},
 "deploy": {"pay": {"replicas": 3, "tier": 1}}}
```

The deploy view now holds the whole service, and a contradiction
between the views — the catalog pinning `tier: 1` where the deployment
claims `tier: 2` — is an ordinary located error. That failure mode is
the argument. The alternative is an identity link bolted on beside the
data, `owl:sameAs` style, and such a link cannot fail: asserting
sameness costs nothing to be wrong about, each store keeps its own
copy, and drift between the copies is found by whoever gets paged.
Making the claim *inside* the operation the engine already trusts means
it is re-checked on every contact, and the commonest enterprise lie —
two systems quietly disagreeing about one thing — dies at evaluation
instead of in production.

The language once had a stronger form of this: `id(name)`, a global
second name, with every node carrying it unified into every other. It
is retired
([ADR-014](../ADR.md#adr-014--the-tree-is-the-namespace-there-is-no-identity-mark)).
A reference catches the same contradiction at the same site, and the
global name cost more than it bought: a model carrying one could not be
**instantiated twice**, because two mounts of one file were one entity
and the second one's overrides were contradictions. The tree is the
namespace, and a tree lets you have two of something.

Relations follow the same instinct: an edge is data on a **field**, and
the field declares what its data means. `rel(t)` on a field says the
field's strings are entity addresses; each must resolve in this
evaluation, and `t`, when given, is unified *into* every target.
(Check-only semantics would be non-monotone — true, then false as the
target grows — so referring to something as a `Service` makes it one,
and a target that cannot be one fails with an ordinary located error.)
The predicate, the relation's name, is the key the `rel()` sits on:
declared once, in the schema, never inferred. The first landed design
inferred it — "the nearest non-numeric key above the link" — and the
heuristic answered wrongly for map-valued relations, which meant two of
an edge's three parts were guesses and only the object was written.
Declaration also buys the property `vet` needs: with the schema side
carrying the `rel()`, a data document is plain JSON-shaped, links and
all, with no Aontu spelling in it.

The graph properties are where the lattice draws a line worth arguing.
`acyclic()` and `inverse(name)`, conjoined at the same field, declare
properties of the whole edge set — and both are global and non-monotone,
because one more edge is more information, and one more edge can turn
an acyclic graph cyclic. The lattice guarantee is that more information
never falsifies what has been observed, so a constraint that could
answer true and then false is one unification may not hold, and the
engine must not refuse early. The atoms are therefore **lattice-inert**
declarations: during unification they only register the predicate and
ride the field through meets, and the verdict lands at **generation**,
where the edge set is complete — the same settle point the sizing atoms
use:

```
a: { feeds: rel() & acyclic() & ["$.b"] }
b: { feeds: rel() & [path($.a)] }
    → refused: [aontu/relation_cycle] at $.a.feeds
```

A declaration that binds at generation also repairs an old
embarrassment: in the first design, plain generation happily emitted a
cyclic model and only the `relations` verb noticed, so `acyclic` was
advisory — a constraint the author wrote into the document that the
document did not enforce.

That first design kept its relation declarations under a `relations:`
key at the document root, a plain key that one verb's pass knew by
convention and nothing else in the engine knew at all. Retiring it is
[ADR-010](../ADR.md#adr-010--no-magic-keys-or-paths-the-tree-at-all-levels-is-user-space):
**the tree is user space.** A plain, spellable
key never carries engine-assigned meaning at any depth; reserved
meaning rides only on syntax an author visibly opts into, which
`rel()` and the atoms are. The retirement bought two concrete things. A
document that writes `relations:` today has written ordinary data. And
because the declarations now live in the lattice, they reach canon and
the `aon1-` hash, so a pin distinguishes two documents that disagree
about their relations — under the magic key the declaration's *meaning*
lived outside the hash's reach, in the verb.

The precise rules are the reference's
[Linking](reference-language.md#linking-the-tree-is-the-namespace) and
[Declared relations](reference-language.md#declared-relations)
sections; the live versions are
[use-cases/12-relations](../use-cases/12-relations/) (an ETL pipeline
DAG, one relation with its inverse) and
[use-cases/01-service-catalog](../use-cases/01-service-catalog/) (the
two-view catalog this section's example was trimmed from).

## Why there is a verb surface

A definition that can only be *evaluated* answers exactly one question:
what is the value? That is enough when a person reads the answer and a
program consumes it. It stops being enough when the thing on the other
end is writing the document as well as reading it, because then the
interesting questions are all the other ones. Does this data hold
against that definition, and *where* does it not? What does it say at
this one path? Why does it say that — who wrote the value that made it
so? Has its meaning changed since the pin you recorded? Can you change
it without breaking somebody downstream?

Every one of those is already answerable from the converged tree. The
source sites are on the nodes, the contributions met at known paths,
the canon is a deterministic rendering. Declining to expose them leaves
the questions standing, and pushes every consumer into re-deriving the
answers from generated JSON, badly and out of band. A definition that
can validate, be queried, explain itself and be diffed has become
ground truth that something else can act on, and the verbs are what
turn a document into that. The roster is in the
[API reference](reference-api.md#command-line-interface); what follows
is why it has the shape it has.

### The emit → validate → repair loop

One loop explains most of the surface. Something writes a document,
[`vet`](reference-api.md#aontu-vet) says what does not hold and where,
the author — human or otherwise — repairs it and goes round again.
Taking that loop seriously decides several things that would otherwise
be arbitrary.

**Exit codes are verdict classes** rather than a pass/fail bit, because
the three ways to fail call for three different next moves. A
contradiction (`invalid`) means repair what you emitted. An unsatisfied
truth (`incomplete`) means keep writing — nothing is wrong yet, the
document is merely unfinished. An unusable schema (`error`) means stop:
the fault lies outside the data, and another round of repair cannot
reach it. Collapsing those into "failed" discards exactly the bit the
repairing end needs in order to choose. For the same reason a finding
labels its two sites by provenance instead of by source order, and puts
the data's site first: that is the one you are meant to edit.

**[`why`](reference-api.md#aontu-why) is the positive twin of a failure
report.** An error explains what did not unify; `why` explains what
did, listing the values that met at a path with the site each was
written at, in source order. It exists because "the value is 3" is not
actionable and "a spread offered `*1|integer` here, and this line
pinned `3`" is. The same record is what the language server can append
to a hover and what the MCP tool of that name returns: one answer,
three ways in.

**[`get`](reference-api.md#aontu-get) buys the size of the answer
rather than the cost of it.** Unification has no partial mode — the
whole document converges or none of it does — so a query verb cannot be
an optimisation, and it would be dishonest to present it as one. It is
a way for a reader with a small question to receive a small answer,
which for a consumer paying by the token is no small thing. Its shape
views are held to a stronger claim than "a summary": each is itself a
valid document that *subsumes* the truth, so a projection may
generalise but may never mislead.

**[`set`](reference-api.md#aontu-set) appends by default**, and that
follows from the lattice rather than from a gap in the tooling. Because
unification is order-independent, a change written into a second file
is the same value as the same change written into the first — so an
overlay needs no format-preserving rewriter, and cannot damage the
document it is changing.

What appending cannot do is override a value that is already **pinned**:
the lattice refuses, because unification only narrows. That was a real
hole rather than a principled refusal, and an embarrassing one — the
commonest validation failure of all is "the data says the wrong thing",
and the verb built for repair could only fill holes.

`--in-place` closes it with a targeted splice: new text written over
the span where the author spelled the value, every other byte
untouched. The prerequisite the rewriter had long been deferred behind,
a comment-preserving CST, turned out to belong to a different job —
re-serialising a document needs one, and replacing one value serialises
nothing, which is why comments and layout survive without ever being
read. What the splice does need is to be right about the bytes, and the
rule that decides it generalises past this verb: instead of enumerating
which spans are safe to write over (a list is a thing to be incomplete
about), the candidate text is parsed on its own and required to mean
what the contribution meant, so the same unifier that produced the
value rules on whether the text is the whole of it, and the answer
cannot drift from the engine.

Rewriting stays **opt-in** for the reason appending was preferred in
the first place: appending is reversible in a way overwriting is not,
so the flag is asked for, never inferred. Where a span cannot be
established — a compound spelling, a path reached through a reference —
the assignment appends exactly as it would have without the flag, and
says why; an overlay that loads another document is refused outright,
because a position inside an include can collide with a position in the
overlay, and the span check would pass while lying about the place.
Refusing to edit is always safe; editing the wrong bytes never is. The
mechanics — span verification, the warning vocabulary, what counts as
an editable literal — are specified with
[`aontu set`](reference-api.md#aontu-set) in the API reference.

### What the hash pins

[`hash`](reference-api.md#aontu-hash) answers "has this changed?" over
what a document *means* rather than over the bytes it is stored in.
Reformat it, reorder its keys, split it into three files pulled back
together by `@"…"` includes, and the pin holds; flip one default and it
moves. That is only possible because canon renders the converged tree
rather than the source text.

The trade is real and taken deliberately. Canon is a deterministic
rendering and only that: two documents that denote the same set of
values can still hash differently, because no unique normal form is
computed — `number|integer` and `number` are the standing example. The
failure direction is the safe one: a spurious "changed" costs somebody
a second look, whereas a spurious "unchanged" would ship the break —
and the extra spellings the hash form carries over ordinary canon are
there precisely to keep that second failure out of reach. Trading cheap
false alarms for an assurance that cannot fail in the dangerous
direction is a good bargain, and it is the same bargain
[`subsume`](reference-api.md#aontu-subsume) and
[`breaking`](reference-api.md#aontu-breaking) make one level up, where
the question sharpens from "did the meaning change?" to "did it change
in a direction that hurts anyone downstream?" A check that answers
`undecided`, and fails the gate for saying so, is honest; one that
guesses "compatible" ships the break it was installed to catch.

### The same answers, through other transports

The MCP server, the language server, the published grammar and the
agent skill are the argument above carried to callers that do not run a
shell. The MCP tools return the identical JSON contract the CLI prints,
and a tool that *refuses* — an invalid document, a path naming nothing —
answers with its own report rather than a protocol error, because the
report is the answer. The grammar published for constrained decoding
accepts less than the parser does and never more, and leaves out `@"…"`
includes entirely, on the view that a generated document should
describe values rather than reach for files. Served evaluation is
confined for the same reason rather than as a deployment option: a tool
that has to remember to restrict itself is one that will eventually
forget, silently. And the skill's example documents are executed by the
test suite, on the same principle that governs the rest of this
repository — a teaching pack that taught something the engine no longer
did would fail the build rather than mislead a reader quietly.

## Closed-world validation is a dial

Schema languages usually take a global stance on unknown keys: JSON
Schema is open until you write `additionalProperties: false`, protobuf
is closed and you work around it. Aontu cannot take a global stance,
because the same tree is schema and data at once and at different
stages of completion. A half-written definition has to be allowed to be
incomplete while the finished one beside it is allowed to be strict,
and no single default serves both.

So closedness is a property of a **node**. `close()` seals one map or
one list and `open()` lifts that seal, and the seal covers the node it
was written on rather than everything beneath it: a map nested inside a
closed map is still open, and so is a list. That is deliberate, and the
alternative — a mark that travels further than it was written — is
worse in a language where a subtree is routinely a template someone
else will extend. `aontu vet --closed` is the same dial at the command
line: it closes the anchor being validated, not the whole document, so
"no keys you did not declare *here*" is a question you can ask without
sealing everything else.

The cost is that closedness has to be written rather than assumed. An
author who never reaches for `close()` is never told about a typo in a
key, and the sealing has to be repeated at each tier that wants it.
That is the bill for letting one notation carry both a finished
definition and the half-written one beside it.

## Two implementations, one behaviour

TypeScript is canonical; Go is a port kept in lock-step. Parity rests
on a **shared, data-driven contract** rather than on reading code side
by side: the [`test/spec/*.tsv`](../test/spec/) files. Each row is a
`name / mode / src / expect` tuple, and both
[`ts/test/spec.test.ts`](../ts/test/spec.test.ts) and
[`go/spec_test.go`](../go/spec_test.go) load the *same* files and assert
the *same* results — canonical form, generated JSON, or error substring.

Two things make this work in practice:

1. **The same parser stack.** Both sides use the `@tabnas` family
   (`jsonic` + `expr` + `path` + `multisource` + `directive`), TypeScript
   natively and Go via the matching Go ports. Surface syntax therefore
   parses identically, so the spec can exercise real syntax rather than a
   lowest common denominator.

2. **A single source of truth for behaviour.** A new behaviour is added
   to the canonical TypeScript implementation, captured as a spec row,
   then made to pass in Go. A row is only committed once *both* pass, so
   the spec always describes agreed, shared behaviour. Language-specific
   tests (the rich TypeScript `*.test.ts` suites, the Go-native sanity
   tests) live alongside the shared spec but never define cross-language
   behaviour on their own.

The Go port deliberately implements the *subset that the spec covers*
(which is, today, the full surface language) and mirrors the TypeScript
architecture closely — the same `Val` interface, the same `unite` ladder,
the same fixpoint loop — so that a change on one side has an obvious
counterpart on the other.

What the arrangement costs is worth naming, because it is paid on every
change. A language feature is written twice, and a row is only
committed once both engines produce it, so the cheapest possible change
to behaviour is still two ports and a spec row in one commit; features
are designed knowing that. What it buys is a claim no single
implementation can make. Two independently written engines agreeing
byte for byte across the whole shared suite is evidence about the
*specification* itself, of a kind one codebase's tests cannot supply —
and the suite becomes an unusually good detector of accidents, because
an optimisation that quietly reorders a fold shows up as failing rows
on whichever side moved. That friction is the mechanism working.

## Where the meaning is ours

Parity is enforceable only while everything either port does is ours to
fix. `re()` broke that assumption. A pattern is handed to a *host*
subsystem — JavaScript's `RegExp` on one side, RE2 on the other — and
those hosts are different languages, in different complexity classes,
over different alphabets, with no shared specification between them.
`\A` is an anchor in one and a literal `A` in the other; `\s` is
Unicode whitespace in one and ASCII in the other; one matches UTF-16
code units where the other matches code points. None of it can be
fixed from this repository.

The first attempt was a blacklist — enumerate the constructs known to
differ, refuse those, pass the rest through — and it leaked three times
in a day. The instructive part is where a blacklist's correctness
lives: in the *author's knowledge* of two large external systems, a
claim that decays silently as those systems evolve and that no test can
falsify. Two of the three leaks were found by reading and one while
writing documentation. None by the suite.

So [ADR-003](../ADR.md#adr-003--host-provided-semantics-are-normalised-not-trusted)
inverts it: **where a host subsystem supplies semantics, Aontu defines
the meaning and rewrites the input**, and the host is given only
constructs it cannot read two ways. `\d` is `[0-9]` because the ADR
says so, whether or not the hosts happen to agree. What that costs is
paid at the point of use — `\s` no longer means what a regex habit
expects in *either* language, and an author has one more small thing to
learn. The gain is that the guarantee stops depending on what the
implementer happens to know, and becomes checkable instead: a committed corpus pins
both normalisers, so a drift fails in whichever port drifted.

The rule is stated generally on purpose, because a date parser, a
collation order or a number formatter would each inherit it. It also
admits what it cannot close. Complexity is a property of the host's
matcher rather than of the pattern language — backtracking makes some
patterns exponential where an automaton is linear — so no rewriting
reaches it, and that axis is held by a syntactic restriction instead.
The principled end state is to own the matcher, at which point there is
no host subsystem left to normalise; that is recorded as a direction
rather than a plan.

## Performance shape

Unification is pointer-chasing over many small immutable nodes, run for
several passes, so most of the engineering effort goes into *not
allocating*: type discriminators, source positions, error arrays, path
indexing and per-pass descent are all arranged so that the common node
pays for none of them. The inventory of those optimisations lives as
comments beside the code that carries each one (start at
[`ts/src/unify.ts`](../ts/src/unify.ts) and the `Val` classes under
[`ts/src/val/`](../ts/src/val/)); none of them changes behaviour — the
shared spec guards that — and together they are why the engine stays
usable on realistically large models. The Go port keeps the same
overall structure but, lacking references-with-cycles in its hottest
paths, uses a simpler depth guard in place of the TypeScript seen-map.

## Two rules that surprise readers

Both of the rules below are specified, pinned by shared rows, and —
judging by how often they are written wrong — surprising. They belong
here rather than in a bug list, because in each case the rule is
defensible *and* the surprise is real, which is the shape of a
trade-off rather than of a defect.

### A preference is gated by kind, not by family

Overriding a default is judged by asking the two questions the long
form asks out loud. `*x` is sugar for `*x | super(x)`
([ADR-011](../ADR.md#adr-011)), so a peer meets it arm by arm:

    *x & peer   ==   (x & peer)  |  (super(x) & peer)

The first arm decides. Does the preferred value *itself* still admit
the peer? Then the default stands, narrowed to what survived: `*1 &
integer`, `*8080 & min(1024)`, and — because maps merge — `*{p:1} &
{q:2}`, which keeps the `p` default and gains `q`. Only when that arm
is empty does the second answer, and that is the override: `*8080`
meeting `9090` yields `9090`, because `8080` cannot admit it but
`integer` can. When both arms are empty nothing is left of the
disjunction the star stands for, and the refusal says exactly that —
`empty`. `*8080` meeting `3.5` is empty, and so is `*2.2` meeting `3`.

There is one rule here, and it reaches everything a default can be:
a scalar, a kind (`super(integer)` is `number`, so `*integer` admits
`7` and refuses `"s"`), a constraint, a map, a list. It used to be a
scalar gate with a hole beside it — a preferred map or list had no
yardstick at all, so any peer overrode one.

The surprise is that the two numeric leaves do not mix around a
preference, even though they share a supertype:

```
a: *2.2 & 3         → refused: [aontu/empty] at $.a
a: *1.5 & integer   → refused: [aontu/empty] at $.a
```

This is a choice, and the other one shipped for a while. A gate that
widens to the numeric *family* lets `*2.2 & 3` through, which reads as a
kindness — an author should not have to know which numeric leaf they
happened to write their default in. But that is one rule seen in one
direction, and the other direction is the idiom that looks most like "a
typed default":

```
port: *8080 | integer   with a later  port: 1.5
```

Under a family gate that generates `{"port":1.5}`. The preference widens
its branch to the base kind — `number` — so the `integer` the author
believes they wrote is not the constraint that survives, and every key
written the way [the agent skill](skill/examples.md) teaches it is
quietly a `number` key. No kind-based gate can keep the convenience and
refuse that; the leaf gate refuses both.

So the idiom now means what it looks like:

```
port: *8080 | integer
    alone                          → generates {"port":8080}
    with a later  port: 9090       → generates {"port":9090}
    with a later  port: 1.5        → refused: [aontu/empty] at $.port
```

and an author who *wants* the whole family writes it in the branch,
where a reader can see it:

```
port: *8080 | number    with a later  port: 1.5  → generates {"port":1.5}
```

`port: *8080 & integer` is still not the way to write a default,
tempting though it reads: a conjunction is not a choice, so the value is
pinned at `8080` and `9090` is refused along with `1.5`.

What the tightening costs is named rather than hidden: mixing the
numeric leaves around a preference is now an error instead of a silent
widening. `*1.5 & integer` used to answer `integer` and discard a
default that could never apply; it now says so, and names the line that
has to change. Only the numeric leaves were ever affected, because only
they sit under a common supertype — `*"us-east" | string` meeting a
later `42` was always an empty disjunction.

The rule is written down in [`test/spec/pref.tsv`](../test/spec/pref.tsv)
and [`test/spec/number-tower.tsv`](../test/spec/number-tower.tsv), and
the suite pins both of its directions: the `pref-kind-gate-*` rows pin
the cross-kind REFUSAL (`*1` against a map, a string, a boolean, a
list), `pref-override-within-kind-gens` pins the same-kind override that
is the same rule from the other side, and the tower's
`pref-idiom-refuses-other-leaf` / `pref-idiom-number-still-admits` pair
pins the numeric case that used to be the exception. Both ports agree on
it byte for byte.

### A list literal is positional

`tags: [string]` reads as "a list of strings" and is not one. A list
literal is **positional with an open tail**: it constrains element 0
and says nothing about anything after it.

```
tags: [string]     with a later  tags: [core, 7]  → generates {"tags":["core",7]}
tags: [&: string]  with a later  tags: [core, 7]  → refused: [aontu/no_scalar_unify] at $.tags.1
```

The homogeneous form is the spread, `[&: string]`, which applies its
template to every element — the same `&:` that templates a map. That
consistency is the defence: a list is a value like any other, so `[a,
b]` meeting `[c, d]` element-wise is the reading that keeps `&` meaning
one thing everywhere, and a bracket that silently meant "and all the
rest, too" would be the exception. Closing the enclosing map does not
close the tail either, because closedness is a mark on the node the
author closed; `close([string])` does close it, and refuses element 1
outright.

The surprise is nonetheless worth naming, because the two spellings
differ by three characters and fail in opposite directions: the
positional one accepts what it looks like it should refuse.

## Termination is part of the offer

The surface argued above is meant to be driven by something that is not
watching: a CI gate, a tool call, a repair loop several steps from
anyone's attention. For that caller, "usually finishes" is not a weaker
version of "finishes" — it is a different product. A definition
language that can loop is one you have to supervise, and a definition
you have to supervise is a program you are running on faith.

That is the reason for the refusals listed below, rather than the other
way round: the guarantee is made of them, and implementation difficulty
had no vote. The trust contract ([trust.md](trust.md)) states the
guarantee formally and is candid about the clauses that are conditional
today.

## Limitations and trade-offs

- **No user-defined functions.** The function set is fixed (41
  built-ins today, the constraint atoms, the graph atoms, identity and
  the generator combinators included). This keeps the language total
  and analysable. Of the [`IDEAS.md`](../IDEAS.md) sketches, piping
  (`|>`) and the placeholder `_` ARE now implemented — as fixed
  syntax, via the [G8 design](capability-review/g8-generation.md) —
  while custom functions were considered there and refused: a
  recursive function is a fixpoint of the program, and its termination
  is undecidable. [Recursive schemas](#recursive-schemas-and-residuals)
  stand on the other side of that line: they recurse on finite data,
  never on the program, so the guarantee survives them.
- **The fixpoint is bounded.** Extremely self-referential models hit the
  pass/cycle limits and surface a cycle error rather than diverging —
  correct, but it means some legal-looking models are rejected for
  practical termination reasons.

## Further reading

- The lattice and unification idea, in much greater depth, in the
  [CUE documentation](https://cuelang.org/docs/concept/the-logic-of-cue/).
- The design notes behind the two newest capabilities, history and
  failure modes included: [relations](design/RELATIONS.0.md) and
  [recursion](design/RECURSION.0.md).
- The shared test format: [shared-spec.md](shared-spec.md).
- What the suites actually exercise: [test-coverage.md](test-coverage.md).

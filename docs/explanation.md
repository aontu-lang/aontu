# Explanation: how and why Aontu works

This document is discursive. It explains the ideas behind Aontu and the
shape of the implementation, and argues some of the trade-offs. It is the
place to build a mental model; for precise rules use the
[Language reference](reference-language.md), and for recipes the
[How-to guides](how-to.md).

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
                                                              └──canon──▶ source-like text
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

### Why a *fixpoint*, not a single pass

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

The heart of the engine is a binary `unite(a, b)` function (see
[`ts/src/unify.ts`](../ts/src/unify.ts) and
[`go/unify.go`](../go/unify.go)). It is a careful ladder of cases:

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
They do not change *what* a value unifies to; they change whether it is
*emitted*. A `type`-marked field is schema and a `hide`-marked field is a
working value — both are omitted when their enclosing map is generated,
yet both still constrain unification. This is how a single document can
carry its own schema inline without that schema leaking into the output,
and why `copy()` (which clears the marks) is the way to turn a schema
node back into emittable data.

## Two implementations, one behaviour

TypeScript is canonical; Go is a port kept in lock-step. Parity is not
maintained by reading code side by side but by a **shared, data-driven
contract**: the [`test/spec/*.tsv`](../test/spec/) files. Each row is a
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

## Performance shape

Unification is pointer-chasing over many small immutable nodes, run for
several passes, so most of the engineering effort goes into *not
allocating*. The TypeScript implementation in particular carries a number
of deliberate optimisations, documented inline:

- **Type discriminators live on the prototype.** Every `Val` answers
  `isMap`, `isRef`, … via prototype defaults; a subclass overrides only
  its own flags. This removes dozens of property writes (and the hidden
  class transitions they cause) from every node construction.
- **Lazy `site` and `err`.** Source positions and error arrays are
  allocated on first use; the common node never pays for either, and all
  error-free nodes share one frozen empty array.
- **A path trie in the context.** Cycle detection and reference
  resolution need a stable index per path; the context memoises
  `(parent, key) → index` and reuses the materialised path array across
  passes instead of re-concatenating it.
- **A per-parent descend cache.** Visiting the same `(parent, key)` child
  context across fixpoint passes returns a cached context rather than a
  fresh `Object.create`.

None of these change behaviour — the shared spec guards that — but they
are why the engine stays usable on realistically large models. The Go
port keeps the same overall structure but, lacking references-with-cycles
in its hottest paths, uses a simpler depth guard in place of the
TypeScript seen-map.

## Limitations and trade-offs

- **No user-defined functions.** The function set is fixed (28
  built-ins today — the original twelve plus the constraint atoms,
  `deprecate`, `id`/`refer` and the generator combinators). This
  keeps the language total and analysable. Of the
  [`IDEAS.md`](../IDEAS.md) sketches, piping (`|>`) and the
  placeholder `_` ARE now implemented — as fixed syntax, via the
  [G8 design](capability-review/g8-generation.md) — while custom
  functions were considered there and refused: recursion would trade
  away the termination guarantee.
- **The fixpoint is bounded.** Extremely self-referential models hit the
  pass/cycle limits and surface a cycle error rather than diverging —
  correct, but it means some legal-looking models are rejected for
  practical termination reasons.

## Further reading

- The lattice and unification idea, in much greater depth, in the
  [CUE documentation](https://cuelang.org/docs/concept/the-logic-of-cue/).
- The shared test format: [shared-spec.md](shared-spec.md).
- What the suites actually exercise: [test-coverage.md](test-coverage.md).

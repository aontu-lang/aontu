# Native relations — design note

Status: PROPOSAL (nothing here is built)
Date: 2026-08-28
Supersedes the surface of: G4 phases 1–5 as landed
(docs/capability-review/g4-identity-relations.md)

The graph capability works — 331 use-case checks lean on it — but its
surface is not language. An edge's relation name is *inferred* from
where a string happens to sit; relation properties live under a magic
top-level key that "nothing in the engine knows" except one verb; the
data-side spelling is a spread-of-a-constraint idiom
(`dependsOn: [&: refer(), svc/auth]`) that no author would guess; and
satisfaction is decided twice, by two codepaths that must be kept in
agreement by hand. This note proposes the native replacement, and
records one naming decision that stands regardless.

## 1. Decisions taken as given

**D-1 — entity names are flat identifiers.** An `id` name matches

```
/[_a-zA-Z][-_a-zA-Z0-9]*/
```

No slash. No leading digit or hyphen. Hierarchy is spelled with
document structure or with the entity's own fields, never with name
punctuation: `svc/payments` was a *kind* smuggled into a *name*, and
the kind already has a field (`kind: service`) and a type
(`$.std.Service`) to live in. The slash also collided with nothing
else in the language — module paths (`@"std/system"`, `mod` deps) are
file paths and keep their slashes; this rule is about entity names
only.

What D-1 changes, measured at head: 38 slashed-name lines across the
use-case models (nearly all `01-service-catalog`), 21 spec rows in 5
files (`graph`, `id`, `refer`, `relation`, `std-system`). Migration is
mechanical — `svc/payments` → `payments` where unambiguous, hyphen-join
(`res-paydb`) where two namespaces collide in one document. Today's
engine also *accepts* a leading digit (`id(9x)` evaluates; probed) and
refuses a dotted name with the wrong error (`id(a.b)` dies downstream
as `mapval_no_gen`, not `id_name`; probed) — D-1's regex fixes the
first, and the redesign's single address grammar fixes the second.

## 2. What is actually janky, named

Read against `ts/src/{unify,graph,relation}.ts`,
`ts/src/val/{IdFuncVal,ReferFuncVal}.ts` and their Go twins
(~2,270 lines plus riders in `unite` and state on the context):

1. **The predicate is inferred, not declared.** An edge's relation
   name is "the nearest non-numeric key above the link"
   (`graph.ts relationKey`). It is a heuristic, and it answers
   wrongly today: a map-valued relation `uses: {primary: refer() &
   "a"}` reports its edge under `primary`, not `uses`
   (`graph.tsv:edge-map-valued-relation` pins the wrong-feeling
   answer). Two of an edge's three parts (subject, predicate) are
   inferred; only the object is written.

2. **Relation declarations live under a magic key.** `relations:` at
   the document root, by convention of the `std/system` vocabulary.
   The engine's own comment: "Nothing in the engine knows the name
   `relations`; this pass does, and says so." The language has no
   other reserved key — spreads are `&:`, optionality is `?:`,
   aliases are `%name:` — and this one is load-bearing for a whole
   capability.

3. **Data-side boilerplate.** A list of links is spelled
   `dependsOn: [&: refer(), svc/auth]` — a spread whose template is a
   constraint, applied so each member picks it up. 10 occurrences of
   exactly this shape in the corpus. The author meant "these strings
   name entities"; the spelling says "unify a nullary residual into
   every element".

4. **Two satisfaction codepaths.** `refer(t)` *flows* `t` into the
   target inside the lattice. `relations`' `target:` check *simulates*
   the same question after the fact (`relation.ts meets()`): clone
   both sides into a throwaway context, meet, then probe generation
   of the far end alone and again with the meet, and compare. The
   comment admits the coupling: "the two agree on what 'satisfies'
   means… which is what lets a relation declare once what every site
   would otherwise repeat."

5. **Action at a distance in the evaluator.** `ReferVal.settle`
   mutates the tree from inside a value's unify
   (`found.parent.peg[key] = merged`), guarded by a re-entrancy set
   on the context (`_referflow`) added after the inverse-pair hang
   (use-cases/BUGS.md §19). Existence is decided by comparing the
   pass counter against the pass *budget* (`ctx.cc + 1 >=
   ctx.budget.passes`) — correctness coupled to a resource limit.

6. **Identity is a side-channel.** `id()` resolves to a Top carrying
   `.entity`; a special-case rider in `unite` copies the stamp across
   every meet; a per-pass double walk (`mergeEntities`) collects and
   substitutes representatives, with comment-documented ordering
   hazards ("the substitution happens before the seen-guard, not
   after…").

None of this is wrong *semantically*. The split it implements is
right and this note keeps it: **edges are data in the lattice; graph
properties are facts about the finished model, checked after
fixpoint** — acyclicity and inverse-presence are non-monotone, and the
lattice guarantee (more information never falsifies what has been
observed) forbids holding them as constraints. What must change is
where the pieces are *declared* and how many mechanisms carry them.

## 3. The design

Three named functions replace the whole surface: `id`, `rel`, and the
graph atoms `acyclic`/`inverse`. No new operator, no sigil, no
reserved key. The reasoning for staying with function syntax is §4;
the design first.

### 3.1 Entities

```
# named by the enclosing key -- the common case, today's broken
# id(key(0)) idiom made primitive:
services: {
  payments: id() & { kind: service, tier: 1 }
  ledger:   id() & { kind: service, tier: 1 }
}

# named explicitly, for the cases where the key is not the name:
change: cr4711: id(ledger) & { tier: 2 }
```

`id()` with no argument names the entity by its enclosing key,
late-bound — it answers where the value *lands*, by exactly the rule
ADR-009 settled for `key()`. This is the fix for the use-case gap
where `&: id(key(0))` dies across an include (`10-data-model` gap 6):
the name is taken from the settled position, so there is no argument
to resolve too early. `id(name)` stays for explicit names, with D-1's
grammar enforced at resolution (`id_name`, as today).

Identity semantics are unchanged: every node in one evaluation
carrying one name unifies with every other (`id_conflict` when two
names collide on one node, `id_spread` for a constant id in a
template). What changes is bookkeeping, in §3.5.

### 3.2 Edges — `rel(t?)` on the field

```
# vocabulary
schema: {
  Service: type(id() & {
    kind: service
    tier: integer & min(1) & max(4)
    dependsOn?:    rel($.schema.Service) & acyclic() & inverse(dependedOnBy)
    dependedOnBy?: rel($.schema.Service)
  })
}

# data -- plain strings, no per-element ceremony
services: {
  payments: $.schema.Service & { tier: 1, dependsOn: [ledger, risk] }
  ledger:   $.schema.Service & { tier: 1 }
  risk:     $.schema.Service & { tier: 2, dependsOn: [ledger] }
}
```

`rel(t?)` is a residual constraint **on the field**, not on each
element — the same siting the sizing atoms (`length`, `unique`)
already have on containers. Its value may be one address, a list of
addresses, or a map whose leaves are addresses:

```
hostedOn: rel() & bastion                 # one link
dependsOn: rel() & [ledger, risk]         # a set of links
uses: rel() & {primary: ledger, fallback: risk}   # labelled links
```

Every string leaf under a `rel()` field is an entity address; each is
checked to resolve, and `t` — when given — flows into each target
exactly as `refer(t)` flows today (monotone: referring to something
as a Service makes it one, and a contradiction is an ordinary located
error at the site). The field's own value stays the strings: a link,
not an embedding, and generation emits plain data.

**The predicate is the key the `rel()` sits on.** Declared once, in
the schema, at the field — never inferred from the path. The
map-valued form fixes itself: every edge of `uses: rel() & {primary:
ledger}` is an edge under `uses`, with `primary` available as the
edge's label. The subject stays the nearest identified ancestor
(containment is real structure, not a heuristic), `''` outside every
entity, as today.

Addresses keep the `name(.seg)*` grammar — everything before the
first dot names the entity (D-1 makes that split trivial), the rest
walks into it (`ledger.ports.http`). Inner segments keep
`[A-Za-z0-9_-]+` (they are keys and list indices, so a leading digit
is legitimate there).

Because the schema carries the `rel()`, **data files are plain
JSON-shaped documents** — the property `vet` needs: a data document
with `dependsOn: ["ledger"]` validates against the schema with no
Aontu spelling in it at all.

### 3.3 Relation properties — atoms, not a magic key

`acyclic()` and `inverse(name)` are ordinary named atoms conjoined at
the same field as the `rel()` they govern (see the vocabulary above).
They are **lattice-inert**: during unification they only residuate —
they can never refuse a meet, because both properties are
non-monotone and refusing early would violate the lattice guarantee.
What they do is *declare*, on the tree itself, what the post-fixpoint
graph pass must check. The `relations:` root key, `$.std.Relation`,
and `relation.ts declaredRelations()` all retire; `std/system` keeps
providing entity *types* (`Port`, `Service`), which were always
ordinary values.

The checks and their findings are unchanged in meaning
(`relation_cycle`, `relation_inverse_missing`), minus one:
`relation_target_unmet` becomes unnecessary as a separate mechanism,
because the target type now flows at the site through the one
satisfaction path — an unmet target is an ordinary located conflict
or an incomplete generation at the entity, found where the author
wrote the link. `meets()` and its clone-and-probe dance are deleted,
not moved.

### 3.4 The verbs

`relations` and `reaches` remain the report surface, and shrink to
what they should have been: build the graph (entity registry + edge
set, both now read off declarations rather than reconstructed by
inference), run cycle detection per `acyclic()` relation and inverse
presence per `inverse(n)` relation, and report in the existing
finding shapes. `graph` mode rows change only where the old inference
answered wrongly (the `edge-map-valued-relation` predicate).

### 3.5 Mechanism (implementation sketch, both ports)

- The entity registry stays per-evaluation. `rel(t)`'s flow writes
  into the *registry representative only*; the existing identity-merge
  pass distributes it to positions. The tree mutation from inside
  `ReferVal.settle` and the `_referflow` re-entrancy set both die —
  flow-through-the-registry cannot re-enter.
- Existence ("the address names an entity in this evaluation") is
  decided when the evaluation *settles* — the fixpoint's own
  no-progress signal — not by comparing against the pass budget.
- The `unite` identity rider and `mergeEntities` stay (identity is
  genuinely global); `id()`'s no-arg form resolves at settle from the
  value's own path, sharing `key()`'s machinery.
- Canon: a `rel()` field canons as the atoms followed by the met
  value (`rel($.schema.Service)&acyclic()&["ledger"]`), the composed-
  constraint convention §48 fixed; the `aon1-` hash therefore pins
  relation declarations, which the magic key never reached (it was
  data like any other — but its *meaning* lived outside the hash's
  reach, in the verb).

## 4. Why function syntax, not an operator or annotation

The considered alternative was a relation-key marker, by analogy with
`?:` — `dependsOn>: [ledger, risk]`, the key suffix declaring "values
under this key are links, the key is the predicate". Declined, on
measurement and on precedent:

- **The lexical ground is hostile.** `a->: 1` is *already* a
  `negative` error today (the `-` prefix operator claims it), so the
  readable arrow form is not free. Bare `a>: 1` currently parses as
  the ordinary key `"a>"` (probed; zero corpus uses), so the terse
  form is takeable — but D-1's names may *end* in `-`, making
  `foo->:` parse as relation-key `foo-`, a corner nobody would guess.
- **It buys only what the schema already provides.** With `rel()` in
  the vocabulary, data files are plain strings; the annotation's
  remaining value is self-description of schemaless data, which the
  inline `dependsOn: rel() & [ledger]` spelling covers at a cost of
  seven characters.
- **ADR-008 is the standing rule**: constraints are named, not
  spelled with operators. The key suffixes that exist (`?:`, `&:`)
  govern the *key's* presence and application; a relation governs the
  *value's* interpretation, which is exactly what value-position
  constraints are for. Spending new grammar here would be spending it
  against the grain of the decision that shaped G1.

A full triple syntax (`subject predicate object` statements) was not
seriously considered: the document is a tree, and a second statement
form would make it two languages.

## 5. Failure modes

| shape | outcome |
|---|---|
| `id(9x)`, `id(x/y)` | `id_name` at resolution (D-1) |
| two names on one node | `id_conflict`, both sites (unchanged) |
| constant `id` in a template | `id_spread` (unchanged) |
| `rel() & 7`, `rel() & [7]` | `rel_address`: a non-string leaf can never be an address |
| address that resolves nowhere | `rel_unresolved` at settle, naming the address (refer_unresolved's successor) |
| `rel($.T)` and target cannot satisfy `T` | ordinary conflict at the entity, sited at the link that flowed it |
| cycle under an `acyclic()` relation | `relation_cycle` from the verb (unchanged shape) |
| missing inverse under `inverse(n)` | `relation_inverse_missing` (unchanged shape) |
| `acyclic()` on a field with no `rel()` | `rel_atom_alone`: the atoms govern a relation, so there must be one |

## 6. Compatibility and migration

Corpus at head: 69 `id(` uses, 55 `refer(` uses, 10
`[&: refer(), …]` spread-boilerplate lines, 2 `relations:` blocks, 38
slashed-name lines, 21 slashed spec rows. All in-tree; the out-of-tree
exposure (podmind, apidef, sdkgen) needs its own grep before P2.

- P0 lands D-1 alone inside the existing surface (tighten `ID_NAME`
  and `ADDR_NAME`, migrate the slashed corpus) — it is independent
  and every later phase assumes it.
- `refer()` and the `relations:` convention get `deprecate()` records
  (G3's own machinery) for one release, then are removed. The
  migration is mechanical in both directions and worth a codemod
  note: `[&: refer(), a, b]` → `rel() & [a, b]` at the site, or the
  `rel()` moved to the schema and the site left as plain data.

## 7. Test plan (shared spec, both engines, per ADR-001)

- `id()` no-arg: named by key; under an include (the gap-6 shape);
  inside a spread template per destination; conflict with an explicit
  `id(name)` at the same node.
- D-1 grammar rows: leading digit, hyphen, slash, dot refused with
  `id_name`; the same probes through `rel()` addresses.
- `rel()` on scalar / list / map; plain-data document against a
  `rel()`-bearing schema (the vet shape); type flow admitting and
  refusing; labelled-link predicate is the `rel()` key.
- graph rows re-pinned: predicate-from-declaration, including the
  map-valued fix.
- atoms: acyclic holds / two-cycle / three-cycle; inverse present /
  missing; `rel_atom_alone`.
- canon + `aon1-`: a relation-bearing document and its
  spelled-differently twin hash apart only when meaning differs;
  relation declarations reach the hash.
- Negatives paired with positives throughout, per the house rule.

## 8. Phasing

| Phase | Content | Gate |
|---|---|---|
| P0 | D-1: name grammar tightened in the existing surface; corpus migrated | both suites green on renamed corpus |
| P1 | `id()` no-arg; `rel(t?)` with flow-through-the-registry; `rel_*` codes | refer() still working beside it |
| P2 | `acyclic()`/`inverse()` atoms; verbs read declarations; `meets()` deleted | relation.tsv re-pinned |
| P3 | `deprecate()` on `refer()` + `relations:`; one release later, removal | corpus carries zero uses |

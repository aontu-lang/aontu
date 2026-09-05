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

**D-2 — no magic keys or paths (ADR-010).** A plain, spellable key
name never carries engine- or verb-assigned meaning, at any depth;
reserved meaning is carried only by syntax an author visibly opts
into. Recorded as an ADR because it outlives this note; here it makes
the `relations:` convention's retirement a ruling rather than a
preference, and constrains every alternative in §4 to spellings the
grammar marks.

What D-1 changes, measured at head: 38 slashed-name lines across the
use-case models (nearly all `01-service-catalog`), 21 spec rows in 5
files (`graph`, `id`, `refer`, `relation`, `std-system`). Migration is
mechanical — underscore-join (`svc/payments` → `svc_payments`).
Measured, not chosen: D-1 admits `-` in a NAME, but a hyphenated name
is only spellable QUOTED — bare `id(svc-auth)` is `func_arity` (the
minus infix splits it) and a bare `svc-auth` list element is
`negative`, so the unquoted spelling every model uses needs the
underscore. Today's
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
   aliases are `%name = value` — and this one is load-bearing for a whole
   capability. ADR-010 now forbids the shape outright and carries this
   key as its one grandfathered violation.

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
aontu spelling in it at all.

### 3.3 Relation properties — atoms, not a magic key

`acyclic()` and `inverse(name)` are ordinary named atoms conjoined at
the same field as the `rel()` they govern (see the vocabulary above).
**Their model is the sizing atoms** — `length()`, `unique()` — which
already solved this exact problem shape for containers
(use-cases/BUGS.md §16): a property that cannot be decided while
information can still arrive is *held* during unification and
*decided* at generation, where no more can.

What each does, precisely:

- **During unification: nothing, deliberately.** Both properties are
  global and non-monotone — one more edge can make an acyclic graph
  cyclic — and the lattice guarantee (more information never
  falsifies what has been observed) forbids a constraint that could
  answer true and then false. So the atoms only residuate: they ride
  the field through meets, dedup additively (`acyclic() & acyclic()`
  is one), appear in canon, and reach the `aon1-` hash — the
  declaration is part of the document's *meaning*, which the magic
  key never was.
- **The predicate they govern is the key name, evaluation-global.**
  Every `rel()` field spelled `dependsOn` contributes edges to the
  one `dependsOn` predicate, and a property declared on *any* of
  those fields holds for the predicate — the same additive rule two
  statements of one map already follow. Written once in the schema's
  spread or `type()` template, it lands on every entity.
- **At generation, the verdict.** Generation is where the edge set is
  complete — the sizing atoms' own settle point. A cycle under an
  `acyclic()` predicate refuses generation with `relation_cycle`,
  sited at an offending edge and naming the entities in the cycle; a
  pair without its mirror under `inverse(n)` refuses with
  `relation_inverse_missing`, naming both ends and the predicate that
  should have mirrored it. **This is the behavioural change from the
  landed design**: today `aontu doc.aon` happily generates a cyclic
  model and only the `relations` verb notices, which made the
  declaration advisory. A constraint the author wrote into the
  document now binds the document.
- **`inverse(n)` checks; it never writes.** Generation does not
  invent the mirroring edge for the author — the same rule the landed
  verb states for itself. The far side must be spelled.

The `relations:` root key, `$.std.Relation`, and
`relation.ts declaredRelations()` all retire (D-2/ADR-010 makes this
mandatory, not stylistic); `std/system` keeps providing entity
*types* (`Port`, `Service`), which were always ordinary values.

`relation_target_unmet` also retires as a separate mechanism: the
target type flows at the site through the one satisfaction path, so
an unmet target is an ordinary located conflict or an incomplete
generation at the entity, found where the author wrote the link.
`meets()` and its clone-and-probe dance are deleted, not moved.

### 3.4 The verbs

`relations` and `reaches` remain, and shrink to report-shaped views
of decisions the language now makes itself: the same cycle and
inverse verdicts generation reaches, rendered as verdict-plus-
findings for a CI gate that wants a report rather than an exit code —
exactly vet's relationship to evaluation. The graph (entity registry
+ edge set) is read off declarations rather than reconstructed by
inference; `graph` mode rows change only where the old inference
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
| cycle under an `acyclic()` relation | `relation_cycle` refuses generation, sited at an edge; the verb reports the same finding |
| missing inverse under `inverse(n)` | `relation_inverse_missing` refuses generation; the verb reports the same finding |
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
| P0 | ~~D-1: name grammar tightened in the existing surface; corpus migrated~~ **LANDED 2026-08-29** | both suites green on renamed corpus |
| P1 | ~~`id()` no-arg; `rel(t?)`; `rel_*` codes~~ **LANDED 2026-08-29** | refer() still working beside it |
| P2 | ~~`acyclic()`/`inverse()` atoms; verbs read declarations; `meets()` deleted~~ **LANDED 2026-08-29** | relation.tsv re-pinned |
| P3 | `deprecate()` on `refer()` + `relations:`; one release later, removal | corpus carries zero uses |

**P1 landed with three boundaries worth recording, each pinned:**

- **Bare `id()` holds its answer for one pass** (`deferResolve`), so the
  pass-zero snapshot a spread of a type body takes finds the id() still
  open and each child resolves at its own key. The definition's own
  position also resolves — a type body IS an entity named by the
  schema's key (`index-bare-id-spread-of-type`).
- **A plain `$.S &` reference copies identity-free** — clearing rule 1,
  already pinned by `ref-and-merge`, extends unchanged to the no-arg
  form: the schema idiom that confers identity is the SPREAD
  (`&: $.S`), not the copy (`id-bare-plain-ref-copies`).
- **A self-typed relation (`rel($.schema.Service)` written inside
  `Service`) is refused by the prefix test today** — the same guarded
  self-reference RECURSION.0.md licenses, and it waits for that note's
  P1. Layered vocabularies (`rel($.std.Service)` from a derived
  Service) do not self-refer and work now. *[Resolved 2026-08-29:
  RECURSION P1 landed in the same change-set, and with it the walk
  through a pending hide() wrapper (BUGS §53) — the natural sibling
  spelling is what use-cases/12-relations now writes, pinned by
  `rel-sibling-shape`.]*

An unmet `rel()` is DONE — its own settled residual, like `min(1)` —
which is what lets a `type()` body carry one and still settle: the
property `refer()` lacks, and G4 phase 4 recorded the cost of.

Settledness has one sharp edge, found and pinned while landing: two
DONE rels share an equally-absent peg, so unite's equal-scalar
shortcuts matched them as "the same value" and dropped one side's type
and held constraints — visibly order-dependent (`rel() & string` met
from separate statements kept or lost the kind depending on which
statement came first). The shortcuts now exclude rel residuals and the
merge arm runs instead (`rel-two-held-order-canon` and its
neighbours).

**P2 landed with its own boundaries, each pinned:**

- **The atom carries the value** (`held`), the sizing-constraint shape:
  absorbing its fold neighbours is what lets the pairwise fold merge
  the value across it. Riding beside as a conjunct member — the first
  build — derailed the fold (`rel & atom & [..]` never met the list).
- **The self-drive refines in place.** A fresh atom per pass changes
  object identity, so spread apply-once stamps and the entity merge's
  fast paths stop holding and the enclosing bags reopen every pass —
  the service catalog never converged until the atom followed MapVal's
  top-peer pattern.
- **A rewrite that minted nothing pending keeps the clone's doneness**,
  for the same convergence reason: the entity merge drops the spread
  stamp each pass, so the template re-applies, and its rewrite has to
  come back done over an already-settled value.
- **The rewrite installs its leaf constraint as the container's element
  spread** (flat containers only), so elements arriving after it — a
  patch position restating a list — convert exactly as the old
  per-element `[&: refer()]` idiom converted them (the onboarding
  proposal in use-cases/01 is the pin).
- **Held constraints apply per leaf**, never to the container
  (`re("^svc_")` met the whole list and refused it), and a constraint
  meeting a rel or an atom hands the drive over, so `rel(t) & re(x)`
  reads the same in either order.
- **The edge predicate is a D-1 name** in both ports (`fieldkey` and
  `register`): a list index or an out-of-grammar key declares nothing
  and stamps nothing, and the graph falls back to inference — also the
  parity guard, an index being a number in TS and a string in Go.

The `relations:` magic key, `meets()`, `declaredRelations()`, the
`Relation` vocabulary entry and `relation_target_unmet` are gone;
ADR-010's grandfather clause is discharged. `refer()` remains until P3.

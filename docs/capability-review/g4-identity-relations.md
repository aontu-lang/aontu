# G4: Identity and typed relations

*Status: implemented — all six phases landed in both ports.
Per-phase status and the corrections this
document needs are in the
[progress register](progress.md), which is authoritative for status;
this document is authoritative for design. Part of the
[capability review](index.md) (August 2026). This document expands
the G4 entry in the review index: a stable identity mark on any
node, reference constraints with checked referential integrity,
typed relations with inverse and acyclicity properties,
identity-merge semantics, and a standard-library vocabulary for
ports, interfaces, and connections. Sibling documents own adjacent
surfaces — see [Boundary](#boundary-what-we-will-not-do).*

## Problem

Systems are graphs; Aontu documents are trees whose only names are
tree paths. Every relation except containment must be smuggled in as
data, and the language can check nothing about it. Consider what an
author writes today:

```aon
# system.aon — nothing checks the dependsOn entries
services: {
  auth: { kind: service, port: 8080 }
  billing: {
    kind: service
    dependsOn: [auth, paymets]   # typo: no such service
  }
}
```

This evaluates and generates cleanly. `paymets` is a bare string;
no constraint can say "each `dependsOn` entry must name an existing
node that is a service". The obvious repair — writing
`dependsOn: [$.services.auth]` — makes a different mistake. A
reference does check existence (`a:$.nope` is pinned as `Cannot
resolve value: $.nope` in `test/spec/ref.tsv`), but resolution is
copy-based: `RefVal.find` clones the target into place
(`ts/src/val/RefVal.ts`, the `out = out.clone(ctx)` branch), so the
generated JSON embeds a full copy of the `auth` node inside
`billing.dependsOn`. That is an embedding, not a link — the output
shape is wrong, and the copy carries no identity of its own.
Today's choice is strings that check nothing or references that
embed everything.

Second, two files that describe the same real-world entity at
different paths never meet:

```aon
# catalog.aon
catalog: payments: { owner: "team-pay", tier: 1 }

# deploy.aon
deploy: eu1: payments: { replicas: 3, tier: 2 }
```

Both files evaluate together without complaint: unification is
path-aligned, so `tier:1` and `tier:2` are never brought into
contact. The contradiction survives silently — a quieter cousin of
the `owl:sameAs` failure mode. An agent reading
`catalog.payments.tier` learns a "fact" the deploy layout
contradicts, and no evaluation ever says so: there is no way to
declare that two nodes denote one entity and have the lattice
enforce the consequences.

Third, relation-level properties are inexpressible. A dependency
cycle in data passes silently:

```aon
a: { dependsOn: [b] }
b: { dependsOn: [c] }
c: { dependsOn: [a] }
```

(Reference cycles *are* caught — `RefVal.find` returns a
`path_cycle` nil when a path resolves through itself — but those
are evaluation cycles, not data-level relation cycles.) Nor can a
definition declare `dependedOnBy` as the inverse of `dependsOn` and
have the two checked for consistency. Impact analysis,
reachability, and the GraphRAG-style multi-hop retrieval the survey
identifies as the reason structured graphs beat markdown all
require an edge set the language can see. Today there is none.

## Current state

What exists is a tree evaluator with strong path machinery and
several reusable precedents:

- **References.** `RefVal` (`ts/src/val/RefVal.ts`, `go/ref.go`)
  resolves absolute (`$.a.b`) and relative (`.a.b`) paths from
  `ctx.root`, defers across fixpoint passes until the target
  appears (row `forward-ref` in `test/spec/ref.tsv`), detects
  self-prefix cycles, and *clones* the found target, clearing
  `type`/`hide` marks on the clone. Cross and chained references
  converge within the fixpoint (`cross`, `chain` rows).
- **Path lookup.** `ctx.find(path)` (`ts/src/ctx.ts`) walks the
  root; the `_pathTrie` assigns path indices for cycle detection
  and caching — an evaluation index, not an entity index.
- **A registry precedent.** `MapVal.unify`
  (`ts/src/val/MapVal.ts`) stores ref-spread snapshots on the unify
  root context, keyed by canon plus source site, surviving all
  fixpoint passes — exactly the shape an identity registry needs.
- **A second namespace, but host-owned.** `$name` variables
  (`ts/src/val/VarVal.ts`, `test/spec/var.tsv`) resolve outside the
  tree, but are injected by the calling program, not declarable
  in-language.
- **Marks.** `type()`/`hide()` set boolean marks; `copy()` clears
  them. Row `type-canon` in `test/spec/marks.tsv` pins that canon
  of `type(1)` is `1` — marks do not survive canonical form, so an
  identity cannot be a pure mark if canon round-trip and
  [G6](g6-distribution.md) semantic hashing are to preserve it.
- **Spread machinery.** `&:` templates (`MapVal.spread`,
  `spreadClone`, the `isPathDependent` flag) let a schema constrain
  every child of a map or list — the delivery mechanism for a
  vocabulary.
- **Resolver chain.** Includes resolve memory → filesystem →
  package (`ts/src/lang.ts`, `makeModelResolver`, beside its
  security comment). The memory resolver can serve
  `@"std/system"` before the [G6](g6-distribution.md) module layer
  exists.
- **Fixpoint.** A bounded pass loop (`ts/src/unify.ts` — since G5,
  the configurable `budget.passes`, default 9); anything that
  converges like references must converge within that bound.

Structurally blocking: (1) the only in-language names are tree
paths, so nothing can denote an entity independent of its location;
(2) reference resolution is copy-based — there is no machinery for
two tree positions to denote one value, only for copies to converge
during a single evaluation; (3) evaluation ends at generation or
canon — there is no post-unification analysis pass where a global
graph property (acyclicity, inverse consistency) could live; (4)
generation targets JSON trees, so shared or cyclic structure can
never be emitted directly.

## Prior art

- **JSON-LD `@id`** gives entities globally unique IRIs so the
  same entity can be referenced and merged across documents. The
  cost is the RDF stack and its open-world semantics — the stance
  Aontu deliberately rejects for validation.
- **`owl:sameAs`** is the cautionary tale: full-substitutability
  identity links with no conflict detection produced silent
  corruption at web scale. Unification inverts this — declaring
  two nodes the same entity means unifying them, so a
  contradiction is a hard, located error. This document designs
  toward that inversion deliberately.
- **DTDL** (Azure Digital Twins) is the closest JSON-shaped
  relative: named, typed, target-constrained `Relationship`s
  distinct from containment; a `Component` distinction for
  subtrees without independent identity; and DTMI ids that fuse
  identity and version (`dtmi:…:Thermostat;1`). The fusion makes
  evolution addressable but forces reference rewrites on every
  version bump — and makes "v1 and v2 describe the same entity"
  inexpressible. Take the relationship/component checklist; refuse
  the fusion.
- **SHACL** shows target-typed reference constraints
  (`sh:class`/`sh:node`) and declared inverse paths
  (`sh:inversePath`) checked closed-world — the right checks, paid
  for with a second language separate from the data.
- **SysML v2 / AADL / Structurizr** converge on ports, interfaces,
  and connections as the recurring modelling primitives, and AADL
  shows the payoff: once connection topology is first-class data,
  latency, error-propagation, and impact analyses are graph
  traversals. SysML's cost is enormous language weight; Structurizr
  gets identity by element name with no constraint checking. The
  lesson: primitives as vocabulary, not syntax.
- **Protobuf field numbers** (via buf): stable identity independent
  of names makes renames non-breaking. In Aontu, a key rename today
  silently breaks every `$.path` reference to it.
- **CUE structural cycles** (survey caution): graph-shaped values
  were a major source of evaluator complexity in the evalv3
  rewrite. Do not put aliasing into the value model.

## Design space

**A. Graph-native lattice.** Make references alias instead of
clone; identified nodes become one shared value. The semantically
purest reading of identity, and the most expensive thing this
language could do: it rewrites the clone-based, single-use-tree
evaluator in both implementations, leaves generation-to-JSON of
shared/cyclic structure undefined, and walks into the
structural-cycle complexity CUE paid a multi-year rewrite to
manage. Rejected.

**B. Convention plus external checks.** Reserve an `id` key by
convention; check uniqueness, integrity, and cycles in a lint pass;
change the language not at all. Cheapest — and the JSON Schema
null-hypothesis position: the lattice learns nothing, nodes sharing
an id are never merged, contradictions stay silent, and the checks
are exactly as principled as any external script. Fails the brief.

**C. Adopt JSON-LD.** Import `@id`/`@context`, gaining semantic-web
interop — but also IRI machinery and open-world assumptions
wholesale, plus a second document model to explain, for interop an
*export* can provide later at a fraction of the cost. Rejected as
the core mechanism.

**D. Identity as syntax.** A sigil for identified nodes (CUE-style
`#name`, or an anchor token). Terse, grep-able — and a grammar
change in a language whose recorded principle is "prefer new
functions instead of creating new tokens or syntax" (IDEAS.md),
whose operator characters are deliberately reserved
(`test/spec/op-chars.tsv`), and whose small surface the review
calls a moat. Everything a sigil can say, a builtin can say.
Rejected.

**E. Hybrid, split by monotonicity.** Identity and referential
integrity are *monotone* — more information only refines them, and
a conflict is a real conflict — so they enter the lattice as two
new builtins (`id()`, `refer()`) with defined unification
semantics. Global graph properties (acyclicity, inverse
consistency, reachability) are *not* monotone — an edge added
later can falsify them — so they must not be lattice citizens:
they are declared as ordinary data under a blessed vocabulary and
checked by a post-unification pass reported via the
[G2](g2-validation-verb.md) error contract.
Ports/interfaces/connections ship as vocabulary, not syntax.

**Recommendation: E.** It is the only option that keeps the
lattice guarantee intact, reuses the codebase's actual extension
points (`funcMap`, marks, spreads, the root-context registry
precedent), keeps the grammar frozen, and still delivers the
differentiator the survey identified: identity whose consequences
are checked by unification, with contradictions as located errors.

## Proposed design

Two new builtins join `funcMap` (`ts/src/lang.ts`) and `go/func.go`
— 12 today, 14 with G4, alongside the nine
[G1](g1-constraint-algebra.md) adds. The rest is vocabulary and a
vet-time pass.

### `id(name)`: the identity mark

`id(name)` declares that the enclosing value is an independent
entity named `name`. It composes by conjunction like any value:

```aon
services: auth: id(svc/auth) & {
  kind: service
  port: 8080
}
```

Semantics:

- `name` matches a pinned pattern (letters, digits, `_`, `-`, `/`;
  **no dots** — dots are reserved for sub-paths, see below); a
  non-conforming name is a located parse-time error. Under
  unification an identity behaves like a scalar: equal names unify;
  two *different* names on one node are a located conflict (one
  entity, one id — aliasing is an open question).
- **Identity-merge.** All nodes in one evaluation carrying the
  same id are unified with each other. Declaring two nodes the same
  entity *means* unifying them; any contradiction is a hard error
  naming both declaration sites — the anti-`owl:sameAs`. The
  `catalog.aon`/`deploy.aon` example becomes, once both add
  `id(svc/payments) &`, a located `Cannot unify value: 2 with
  value: 1` at the two `tier` sites instead of a silent fork.
- **Positions.** The tree stays a tree. After merging, *every*
  declared position holds the merged value, and generation emits it
  at each path — duplication, exactly as references generate today.
  Identity adds a location-independent addressing scheme without
  changing the shape of the output.
- **Canon.** Canon renders `id("svc/auth")&{…}` reparseably, and
  reparsing re-merges idempotently, so canon convergence (the enforced property is CONVERGENCE, not the stronger round-trip this line states — see the correction in [G1](g1-constraint-algebra.md#implementation-plan))
  holds. This deliberately differs from `type`/`hide` marks, which
  canon drops (`test/spec/marks.tsv`, row `type-canon`): identity
  is semantic content that [G6](g6-distribution.md) canon-hashing
  must see.
- **Generation.** The `id()` declaration itself is not data and is
  not emitted; id strings used in value position are ordinary
  strings.

Mechanics: an identity registry lives on the unify root context —
the same lifetime and placement as the ref-spread snapshot map in
`ts/src/val/MapVal.ts` — mapping id → representative value and
site. Each fixpoint pass, a position carrying an id unifies with
the representative and updates it; positions converge across passes
as chained references do today, within the `maxcc = 9` bound
(`ts/src/unify.ts`).

(As built, that is TWO walks per pass, not one — collect the
representative over the whole tree, then write it back to every
position. A single walk leaves the positions it already passed
holding the pre-merge value, so the sites disagree about what the
one entity is; see the departure note in
[the register](progress.md#g4--identity-and-typed-relations).) Whether bound exhaustion with an unconverged
merge is a distinct semantic error is owned by
[G5](g5-trust-contract.md).

Three rules protect existing behaviour, and all existing spec rows
must pass unchanged under them:

1. **References do not carry identity.** The clone `RefVal.find`
   produces clears the id, extending the existing mark-clearing
   walk. Otherwise `w:b:$.q.a & {y:2,z:3}` (row `ref-and-merge`,
   `test/spec/ref.tsv`) would push `y:2` back into `q.a` through
   the merge — a silent change to pinned behaviour.
2. **`copy()` clears identity**, consistent with `copy()` clearing
   marks today (`marks.tsv`, `copy-clears-type`).
3. **Spread templates may not stamp one id onto every child.** An
   `id()` with a concrete argument inside an `&:` template is a
   located error (all children would merge into one entity). A
   path-dependent argument is allowed — `&: id(key(0)) & {…}` gives
   each child a distinct id, resolved per destination by the existing
   `spreadClone` machinery.

   (This line originally sketched `id(svc/ + key())`. There is no
   string `+`, and `key()` reads one level UP — in a template applied
   at the child position it names the BAG, so every child collides on
   that one name. `key(0)` is the child's own key. The collision is a
   defined result rather than a refusal: rule 3 is a syntactic guard
   on CONSTANTS, and no parse-time check can know what a computed name
   resolves to.)

The entity/component distinction falls out free: a node with
`id()` is an independent entity; a node without one is a component
of its nearest identified ancestor, addressable only relative to
it — DTDL's `Component` with no further design.

### `refer(t?)`: checked, typed, link-shaped references

`refer(t)` is a constraint on a string-valued field: the string must
be an *entity address*, the addressed node must exist in the
evaluation, and — if the optional `t` is given — `t` is unified
**into** the target entity. The field's own value remains the
address string: a link, not an embedding.

```aon
@"std/system"

services: {
  auth: id(svc/auth) & $.std.Service & { port: 8080 }
  billing: id(svc/billing) & $.std.Service & {
    dependsOn: [&: refer($.std.Service), svc/auth, svc/payments]
  }
}
```

The list spread applies `refer` to every element; `svc/auth`
resolves; `svc/payments` names no entity, so evaluation fails with
a located error at the string's site. The generated `dependsOn` is
`["svc/auth", …]` — the link shape the Problem section could not
produce.

Semantics:

- **Address grammar.** An address is an entity id, optionally
  followed by a dot-separated path *inside* that entity:
  `svc/auth.ports.http`. This reconciles the two addressing
  schemes: `$.a.b` answers *where* (a tree location), an entity
  address answers *what* (an id anchor), and beneath entity
  granularity the tree is authoritative again. The no-dots rule on
  ids makes the split point unambiguous.
- **Constraints flow through links.** `refer(t)` does not merely
  check the target against `t`; it unifies `t` into it. Referring
  to something as a `Service` makes it one, and if it cannot be,
  the conflict is a located error naming the `refer` site and the
  target site. Check-only semantics would be non-monotone
  (true-then-false as the target grows); constraint flow is
  ordinary unification and keeps the lattice guarantee.
- **Timing.** `refer` residuates, using the defer branch
  `FuncBaseVal` already has (`ts/src/val/FuncBaseVal.ts`): a target
  may be introduced by a later conjunct, include, or spread, so the
  constraint retries each fixpoint pass, as forward references do
  today. Within one evaluation the document-set is fixed, so
  existence *is* decidable. *(As landed, the refusal comes at the
  LAST fixpoint pass, not "at generation" as this bullet first said:
  a generation-time refusal would arrive as the bag's generic
  `*_no_gen`, naming the map rather than the link, so a pending
  refer keeps the tree not-done until the final pass, where the
  refusal is a located nil naming the address. A `refer()` that
  never met an address at all is an ordinary unresolved constraint,
  like a bare `min(1)`. The register's G4.2 departure records it.)*
  Integrity is a unification-time property, per the
  review index — there is no vet-time deferral.
- **Canon** renders the residual reparseably:
  `"dependsOn":[refer($.std.Service)&"svc/auth", …]`. (As built, a
  RESOLVED refer is simply its address string — the link is the value —
  so it is the *pending* residual that renders as a call.)
- **Error data.** Failures carry both sites and the machine-facing
  details field established by [G1](g1-constraint-algebra.md);
  rendering into reports and codes is owned by
  [G2](g2-validation-verb.md).

### Relations, inverses, and acyclicity: vocabulary plus vet pass

Relation-level properties are declared as data under a blessed
vocabulary and checked after unification, because they are global
and non-monotone — an acyclic graph can become cyclic when one
more edge unifies in, and no lattice citizen may be falsified by
more information.

```aon
@"std/system"

relations: dependsOn: $.std.Relation & {
  target: $.std.Service
  inverse: dependedOnBy
  acyclic: true
}
```

(As built this is `aontu relations` / `relationCheck`, a verb of its
own rather than a leg of `vet`: vet answers "does this DOCUMENT
satisfy that SCHEMA" and these are facts about one finished model.
`target` is not re-checked here — `refer(t)` already flows it into the
addressed entity, checked by unification at the site. See
[the register](progress.md#g4--identity-and-typed-relations).)

The vet pass (delivered with G2's verb, reported via the G2 error
contract) walks the unified tree before generation: it collects
the edge set — (source entity, relation key, target address)
triples for every field whose key matches a declared relation —
then checks acyclicity (reporting the offending cycle as a path of
addresses) and inverse consistency (for each `a --dependsOn--> b`,
`b` must list `a` under `dependedOnBy`; the report names the exact
missing entry). *Derivation* of inverse fields — writing
`dependedOnBy` for the author — is field generation and belongs to
[G8](g8-generation.md)'s total combinators; v1 validates only.
Traversal order is sorted and deterministic in both
implementations, per [G5](g5-trust-contract.md).

### The `std/system` vocabulary

Ports, interfaces, and connections need no syntax — they are schemas
(abbreviated sketch):

(As built, four of the five schemas ship and the block is NOT wrapped
in `hide()`; `Connection` waits on engine work, `Service` states
itself rather than referencing `Component`, and `target` is optional.
Each is explained in
[the register](progress.md#g4--identity-and-typed-relations).)

```aon
# std/system.aon (sketch)
std: hide({
  Component: type({
    ports?: {&: $.std.Port}
  })
  Port: type({
    direction: *in | out | inout
    protocol?: string
  })
  Connection: type({
    from: refer($.std.Port)
    to: refer($.std.Port)
  })
  Service: type($.std.Component & { kind: service })
  Relation: type({
    target: top
    inverse?: string
    acyclic?: *false | boolean
  })
})
```

A connection's `from`/`to` are entity addresses reaching ports
inside identified components. Everything is ordinary unification:
`&` composition, spreads, marks, defaults. Until
[G6](g6-distribution.md) exists, `@"std/…"` is served by the
resolver's memory entry (`makeModelResolver`, `ts/src/lang.ts`) —
bundled with the implementation, touching neither filesystem nor
package resolution, so the [G5](g5-trust-contract.md) hermeticity
posture is not widened. The vocabulary is marked experimental until
G6's canon-hash pinning can version it; and — per the DTDL lesson —
entity ids do *not* embed versions.

### Downstream: what this buys the graph consumers

The evaluation result gains two derived structures: an entity index
(id → list of tree paths) and the relation edge set. (As built, the
edge set is the set of checked `refer` LINKS, each stamped at
resolution so nothing has to guess which strings are addresses; phase
5 filters it by declared relation rather than rebuilding it. See
`result.graph` / `Aontu.Graph` in
[the API reference](../reference-api.md).) Impact
analysis ("what reaches `svc/auth`?"), reachability, and
context-window-sized entity slices become traversals over them;
their exposure — CLI verbs, projections, the MCP tool set — is
owned by [G7](g7-machine-access.md). G4's deliverable is that the
structures exist and are deterministic. Renames also soften: moving
an entity to a new tree path breaks `$.path` references but no
entity address — the protobuf field-number lesson applied.

## Boundary: what we will not do

- **No graph-shaped values or aliasing references.** Positions
  converge to equal values; they never become one shared mutable
  node. The alternative rewrites both evaluators and re-opens CUE's
  structural-cycle scar (index trap: surface creep forcing an
  evaluator rewrite).
- **No acyclicity or reachability constraints inside the lattice.**
  They are non-monotone and would break "any observed field value
  holds for the final result"; they live in the vet pass.
- **No URI/IRI or JSON-LD machinery.** A JSON-LD export can come
  later as interop; the core mechanism stays closed-world.
- **No identity+version fusion in ids** (contra DTDL). Versioning
  belongs to [G6](g6-distribution.md); fused ids make cross-version
  identity inexpressible.
- **No automatic inverse derivation.** Writing fields is
  generation; it waits for [G8](g8-generation.md)'s totality story.
- **No new syntax for ports/interfaces/connections.** Vocabulary,
  not grammar — grammar size is acquisition cost (index trap:
  surface-area creep toward CUE; SysML's weight is the cautionary
  example).
- **No cross-evaluation entity registry.** Identity is scoped to
  one evaluated document-set; sharing truth across repos is G6's
  distribution problem.
- **No temporal or behavioural relation properties** ("eventually
  consistent") — inexpressible in a value lattice by construction
  (index trap).
- **No error formats or CLI verbs** — [G2](g2-validation-verb.md)
  owns them; **no query surface** — [G7](g7-machine-access.md); **no
  subsumption exposure** for id/refer — [G3](g3-subsumption-evolution.md).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Identity-merge fails to converge within `maxcc = 9` on deep id/ref chains, silently under-merging | Medium | High | Spec rows at the pass boundary; registry unifies eagerly per pass; escalate silent-stop semantics to G5 as designed there |
| Id leaks through `RefVal` clones, `copy()`, or spread snapshots, changing pinned behaviour | Medium | High | The three clearing rules land with dedicated spec rows; all existing `ref.tsv`, `spread-*.tsv`, `marks.tsv` rows must pass unchanged |
| Canon round-trip breaks for `id()`/`refer()` residuals | Medium | High | Canon-convergence rows for every new form before code lands (the enforced property is CONVERGENCE, not the stronger round-trip this line states — see the correction in [G1](g1-constraint-algebra.md#implementation-plan)) |
| TS/Go divergence in registry and vet-pass iteration order (Go map order is random) | High | Medium | Sort ids and keys at every iteration point; byte-identical canon and report rows in the parity suite |
| Constraint-flow through `refer(t)` surprises authors (a link mutates its target) | Medium | Medium | Document loudly; error messages name both sites; a lint-level notice via G2 when a refer adds fields rather than matching them |
| `DisjunctVal.gen` fold defect (`ts/src/val/DisjunctVal.ts` ~263) compounds when identified nodes appear in disjuncts | Low | Medium | Spec rows pin disjunct-of-entity generation before code; do not extend the defect's reach |
| Performance: per-pass registry unification on models with many entities | Medium | Medium | Merges are idempotent after convergence (apply-once discipline as in spread application); perf-annotated parity rows |
| Vocabulary churn before G6 versioning exists | High | Low | `std/system` marked experimental; breaking changes assessed with G3's check once it ships |
| Two addressing schemes confuse authors and agents | Medium | Medium | One documented rule — `$.path` for schema reuse and templating, entity addresses for system links — plus targeted hints in `ts/src/hints.ts` / `go/hints.go` |

## Implementation plan

Every phase is spec-first: TSV rows are authored and reviewed before
implementation, TypeScript (canonical) lands first, the Go port
follows, `make test` runs both, and committed `ts/dist` is rebuilt
(`make build-ts`). Nothing may regress: every row of the shared suite
(counts in [the register's protocol rule 5](progress.md#the-update-protocol))
passes unchanged, and canon convergence holds throughout, including
for the new forms.

1. **Phase 0 — semantics on paper (S).** New "Identity" and
   "Entity references" sections in `docs/reference-language.md`:
   id pattern, address grammar, merge semantics, the three
   clearing rules. Author `test/spec/id.tsv` (merge, contradiction
   with two sites, ref-clone/copy/spread clearing, canon
   round-trip, pass-boundary rows) and `test/spec/refer.tsv`
   (existence, typed flow, residual canon, unresolved errors).
2. **Phase 1 — `id()` (M).** New `ts/src/val/IdFuncVal.ts`; entity
   slot and canon rendering on the carriers (`ts/src/val/Val.ts`,
   `MapVal.ts`, `ListVal.ts`); registry on the unify root context
   (`ts/src/unify.ts`, `ts/src/ctx.ts`); clearing walks in
   `RefVal.ts`, `CopyFuncVal.ts`, and the spread snapshot path in
   `MapVal.ts`; messages in `ts/src/err.ts`, `ts/src/hints.ts`.
   Then the Go port: `go/func.go`, `go/val.go`, `go/mapval.go`,
   `go/ref.go`, `go/unify.go`, `go/hints.go`.
3. **Phase 2 — `refer()` (M).** New `ts/src/val/ReferFuncVal.ts`
   using the `FuncBaseVal` defer branch; address parsing;
   constraint flow into registry targets; unresolved-target errors
   (landed at the last fixpoint pass, not at generation — see the
   Timing bullet above and the register's G4.2 departure). Go:
   `go/func.go`, `go/unify.go`.
4. **Phase 3 — derived structures (S).** Entity index and edge-set
   extraction exposed through the evaluation result
   (`ts/src/aontu.ts`, `go/aontu.go`; `docs/reference-api.md`) for
   G2 and G7 to consume; deterministic ordering pinned by parity
   rows.
5. **Phase 4 — `std/system` vocabulary (M).** The vocabulary file
   served via the memory resolver entry (`ts/src/lang.ts`,
   `go/source.go`); `test/spec/std-system.tsv` rows exercising
   Component/Port/Connection/Relation purely through unification;
   experimental status noted in `docs/reference-language.md`.
6. **Phase 5 — relation graph checks (L).** The post-unification
   pass: edge extraction, acyclicity, inverse validation,
   deterministic cycle reports. *(Landed as its own verb, not
   "alongside G2's" as designed: `aontu relations` in both CLIs,
   `relationCheck`/`Aontu.RelationCheck` in the APIs, codes
   `relation_cycle` and `relation_inverse_missing`, goldens in the
   `relation` spec mode — the register's G4.5 row records it.)*

Phases 1–3 are self-contained language work; Phases 4–5 can trail
into the review's Phase C sequencing without blocking G1/G2.

## Open questions

- ~~**Naming.**~~ **Settled by what landed: `id()` and `refer()`**,
  in a roster that ended at 28 builtins once G8's four combinators
  joined. (The question as posed: `id()` collides with a common data
  key name only as a function, but `entity()`/`refer()` versus
  `id()`/`refers()` should be settled once against the final builtin
  roster — one naming pass, not two.) Note also
  that id arguments containing `-` must be quoted
  (`id("team-pay")`): `-` is an invalid bare-text character today
  (test/spec/op-chars.tsv pins `a:6-2` as a parse error), while `/`
  parses as plain text and may stay bare.
- **Aliasing.** Should one node be allowed several ids (merging the
  namespaces), for staged renames of entities? For: the protobuf
  `reserved` lesson suggests rename windows need overlap. Against:
  multiple ids reintroduce a sliver of `sameAs` ambiguity and
  complicate the registry. Decide with
  [G3](g3-subsumption-evolution.md)'s deprecation mark, which is
  the natural carrier for "old id, still honoured, warn on use".
- **Should generated output optionally include ids?** Marks are not
  data, but downstream consumers of plain JSON lose identity unless
  a projection includes it. Likely a [G7](g7-machine-access.md)
  projection flag rather than a generation change; decide when G7
  fixes its projection surface.
- **Subsumption of identified values.** For G3's compatibility
  check, does adding an `id()` to a previously anonymous node
  narrow it (breaking) or annotate it (compatible)? The
  scalar-like semantics suggest narrowing; the annotation reading
  matches author intent. G3 owns the answer; the semantics here
  must not foreclose it.
- ~~**Edge extraction from plain strings.**~~ **Settled strict, by
  construction:** the landed edge set is exactly the set of STAMPED
  links — a resolved `refer` stamps the address on the value it
  answers (the register's G4.3 departure) — so an unadorned string
  is never guessed into an edge. (The question as posed: permissive
  extraction catches more real systems; strict extraction never
  guesses.)

# Recursive schemas — design note

Status: PROPOSAL (nothing here is built)
Date: 2026-08-28
Prompted by: use-cases/BUGS.md §52 (a recursive schema has no working
spelling), and the question that filed it.

A tree of categories, a menu of menus, a linked chain of approvals, an
AST, JSON itself — the shapes agents most need schemas for are
recursive, and every formal-spec neighbour the ontology note wants to
import (TypeScript types, IDL, JSON Schema's `$ref`) writes recursion
routinely. Aontu currently has no working spelling for it. This note
proposes one rule that turns the existing cycle *detector* into the
recursion *mechanism*, with termination bounded by the data.

## 1. The baseline, measured

§52's probes, both ports agreeing byte-for-byte in every regime:

| spelling | today |
|---|---|
| `Node: {v: integer, next?: $.Node}` — also via map spread, also inside `type()`, also as a guarded alias (`%t: {v: integer, next?: %t}`) | `path_cycle` |
| mutual `A: {b?: $.B}` / `B: {a?: $.A}` | `path_cycle` at the second hop |
| `Node: hide({v: integer, next: null \| $.Node})` | base case works; one level of real nesting dies as `scalar_kind`, naming neither the recursion nor the schema |
| `Node: hide({v: integer, kids: [] \| [&: $.Node]})` | generates at any depth and checks **nothing** |

The refusals all come from one place: `RefVal`'s PREFIX TEST — a
reference whose target path is a prefix of its own position (`$.Node`
written anywhere inside `Node`) is answered with `path_cycle` before
any question of guardedness is asked. The test is a *correct detector*
of self-reference; only its *response* is wrong for the guarded case.
`aontu jsonschema` fails the same way at the same place, so the export
surface is blocked with the evaluator.

The mutual and chain VALUE cycles (`a:$.b b:$.a`,
`a:{x:$.b.y} b:{y:$.a.x}`, the func-routed forms) are caught by a
different mechanism — the chase detector — and are genuinely
unguarded: nothing in this note touches them.

## 2. The design: the detector's answer becomes a residual

**One rule.** Where the prefix test today answers `path_cycle`, it
instead answers a RECURSIVE RESIDUAL — a deferred reference carrying
the target path, exactly as a constraint atom carries its bound. No
new syntax, no marker function, no annotation: `$.Node` inside `Node`
(and `%t` inside `%t`, which is the same reference by the aliases
design) simply *means* the fixpoint, because that is what the author
wrote.

The residual's semantics, stated as the three moments every residual
has:

- **At unification: expand one level per meet with structure.** A
  residual met by a map, list, or scalar clones the schema body ONE
  level — per destination, under the template-clone isolation
  discipline ADR-005 landed for spreads — and unifies the clone with
  the peer. The clone's own inner self-reference is again a residual,
  so each expansion consumes one level of concrete data. A residual
  met by TOP, or by another residual of the same target, stays as it
  is (idempotent); two residuals of different targets are both held,
  each expanding as data arrives.
- **In canon and the hash: symbolic, never expanded.** The residual
  prints as the reference the author wrote — `{"next"?:$.Node}` — so
  canon of a recursive schema is finite and round-trips, and `aon1-`
  pins the μ-form rather than any unrolling. This is a documented
  exception to `hcanon`'s resolve-everything rule: a recursive
  reference is the fixpoint binder, and the binder IS the resolved
  form.
- **At generation: an unexpanded residual in a demanded position
  refuses** with a new code, `recursion_unexpanded`, naming the
  schema's path and the site that demanded it. Guardedness is
  therefore EMERGENT, not statically analysed: under `next?:` an
  unexpanded residual drops with its optional key; under
  `*null | $.Node` the preference generates; a REQUIRED recursive
  field with no data refuses, per instance, where the instance is.

### Termination

Two bounds, both already in the engine's vocabulary:

1. **Structural descent.** An expansion happens only at a meet with
   concrete structure, and consumes one level of it. Data is finite,
   so expansions along any path are bounded by the data's depth. This
   is the line AONTUCONSTRAINTS §9 drew without naming it: recursion
   licensed by a FIXPOINT is undecidable and stays refused (functions,
   comprehensions — upheld, not weakened); recursion driven by finite
   data is primitive recursion on the data and always terminates.
2. **The expansion budget** (T-1, the backstop the aliases note
   deferred to its P2). Schema-meets-schema shapes with no concrete
   layer — two mutually recursive definitions unified directly — can
   ping-pong; the per-path expansion count is capped by the existing
   evaluation budget, and exhaustion answers `recursion_budget`,
   naming the recursion rather than a generic pass limit. The
   trust.md guarantee ("every aontu program terminates") survives as
   min(data depth, budget).

## 3. Worked examples

The linked list, whole:

```
Node: hide({v: integer, next: *null | $.Node})

t: $.Node & {v: 1, next: {v: 2}}
```
```
{ "t": { "v": 1, "next": { "v": 2, "next": null } } }
```

The tree, children as a map, spread applying the type per child:

```
Cat: hide({label: string, sub: {&: $.Cat}})

menu: $.Cat & {
  label: "root"
  sub: {
    file: { label: "File", sub: { open: { label: "Open", sub: {} } } }
    edit: { label: "Edit", sub: {} }
  }
}
```

JSON itself, as a guarded alias — one line, the universal recursive
type, and the sharpest statement of what this buys the agent-tooling
goal:

```
%json: null | boolean | number | string | [&: %json] | {&: %json}

payload: %json
payload: { user: { id: 1, tags: [admin, [nested, true]] } }
```

Refusal is per-instance and located. A required recursive field:

```
Node: hide({v: integer, next: $.Node})     # no guard, deliberately
t: $.Node & {v: 1}
```
```
[aontu/recursion_unexpanded]: … at path $.t.next
The schema $.Node refers to itself here, and no data reached this
position to expand it against. Guard the recursion (`next?:`, or a
non-recursive alternative such as `*null | $.Node`) or supply the
data.
```

And enforcement reaches every level, which is regime 4's fix made
visible: `t: $.Node & {v: 1, next: {v: oops}}` refuses at
`$.t.next.v` with the ordinary integer conflict.

Mutual recursion needs nothing extra — after `$.B` expands once
inside `A`, its `$.A` is a prefix reference at its landed position and
residuates by the same rule:

```
Person: hide({name: string, employer?: $.Company})
Company: hide({title: string, staff: {&: $.Person}})
```

`vet` gets the marquee shape for free — the schema side carries the
recursion, the data document stays plain JSON:

```
$ aontu vet menu-schema.aon menu.json
```

## 4. Interactions

- **Aliases**: free. `%t` is `$.%t` by construction (ALIASES.0.md), so
  a self-referential alias residuates by the same prefix rule. The
  three pinned alias CYCLE rows (`%a: %a` and kin) are unguarded and
  keep refusing — see §6.
- **Spreads**: the vehicle, not a special case — expansion IS
  per-destination template instantiation, sharing ADR-005's clone
  discipline and its snapshot rules.
- **`jsonschema`**: recursive schemas export as `$defs` +
  `$ref` — the one JSON Schema feature everyone uses that the
  exporter currently cannot reach (today it dies with the evaluator's
  own `path_cycle`). The export is the symbolic form, so it is exact,
  not lossy.
- **`subsume` / `breaking` (G3)**: recursive-vs-recursive comparison
  without data needs the standard seen-pair memo (Amadio–Cardelli);
  scoped to its own phase. Until it lands, `subsume` on a recursive
  schema refuses with a clear "not yet comparable" rather than
  looping.
- **Graph/relations, modules, trust**: untouched. A residual is a
  value like any other; the include closure and the hash pin it
  symbolically.

## 5. Prerequisite defect

§52 regime 4: a DISJUNCT-SELECTED list spread never applies its
template (`kids: [] | [&: $.Node]` admits anything), consistent with
the pinned map-shape behaviour (`edge.tsv:edge-spread-disjunct-key`)
but silently vacuous from a schema an author would write in good
faith. The `kids` spelling in §3 stays unenforced until this is fixed,
whatever this note's fate — it is filed with §52's repros and is a
prerequisite of P1 below, not part of it.

## 6. Compatibility, measured

Every `path_cycle` pin at head classifies into three families, and
none pins a guarded shape — the capability this note adds was never
expressible, so no pinned OUTCOME changes:

| family | rows | under this design |
|---|---|---|
| prefix-test, unguarded | `budget.tsv:path-cycle-self` (`a:$.a`), `path-cycle-ancestor` (`a:b:$.a`), `alias.tsv`'s three cycle rows | still refuse; the refusal may move from unify to generation (`recursion_unexpanded`), so the rows' CODE changes — each gets re-pinned in the same commit, per the ADR-009 pattern of keeping the source and taking the new outcome |
| chase-detector | `path-cycle-mutual`, `-chain`, `-nested-mutual`, `-func-routed`, `-func-chain`, `edge-cycle-through-list` | untouched — different mechanism, still `path_cycle` at unify |
| degenerate | `func.tsv:path-empty-cycle` (`path("")`) | untouched |

The stage move in the first family is the one genuine cost: `a:$.a`
stops failing at unification and starts failing at generation, and
canon of such a document becomes the finite symbolic form
(`{"a":$.a}`) rather than an error. That is arguably the honest canon
— the source round-trips — but it is a behaviour change and the rows
must say so.

Out-of-tree exposure: none possible — no spelling of recursion
currently evaluates, so no existing model can be relying on one.

## 7. Failure modes

| shape | outcome |
|---|---|
| required recursive field, no data | `recursion_unexpanded` at generation, naming schema and site |
| `a: $.a` and other bodyless self-references | same — the degenerate case of the row above |
| expansion with no concrete layer exceeding the budget | `recursion_budget`, naming the recursion |
| unguarded VALUE cycles (mutual, chain, through a func or a list) | `path_cycle`, unchanged |
| data deeper than the evaluation budget | the existing budget error, unchanged — recursion adds no new unboundedness |
| `subsume` on recursive schemas before its phase lands | a located "recursive schemas are not yet comparable" refusal |

## 8. Non-goals

- **Recursive functions, comprehensions, unbounded fixpoints** —
  AONTUCONSTRAINTS §9's refusal stands. This note licenses structural
  recursion over finite data, nothing else.
- **Equirecursive canonicalisation** — two schemas that unroll to the
  same infinite tree are not identified; the hash pins the spelling.
  (Subsumption's seen-pair memo answers the useful half.)
- **Generating infinite values** — generation never invents depth; it
  only follows data.

## 9. Test plan (shared spec, both engines, per ADR-001)

- The four §52 regimes, inverted: each becomes a working row (list,
  tree-map, mutual, alias/JSON) with a refusing negative beside it.
- Depth rows: 0, 1, 3 — plus enforcement AT depth (`v: oops` refused
  at `$.t.next.next.v`, the row regime 4 makes meaningful).
- `recursion_unexpanded` and `recursion_budget` in errcodes.tsv, with
  message rows pinning what they name.
- Canon and `aon1-`: recursive schema canons finite and symbolic,
  round-trips, and its hash is stable under data growth; an
  `hcanon` row records the symbolic exception.
- The re-pinned first-family cycle rows (source kept, new code).
- `jsonschema`: `$defs`/`$ref` emission for the linked list and the
  mutual pair.
- `vet`: recursive schema against plain-JSON data, admit and refuse.

## 10. Phasing

| Phase | Content | Gate |
|---|---|---|
| P0 | Fix §52 regime 4 (disjunct-selected list spread applies) | its repro row, plus edge-spread-disjunct-key re-adjudicated |
| P1 | The residual: prefix-test response, expansion at meet, `recursion_*` codes, canon/hash symbolic; single-file | the §3 examples as rows; both gates |
| P2 | `jsonschema` `$defs`/`$ref`; vet flows | export rows |
| P3 | G3: seen-pair subsumption of recursive schemas | subsume rows |

## 11. Open questions

- **X-C1 — upfront productivity check.** Should `next: $.Node` with no
  guard be refused at the schema, before any instance? Declined here:
  it requires a static guardedness analysis the lattice never needed,
  and the per-instance `recursion_unexpanded` names the same fix at
  the place the author feels it. Revisit if practice shows schema
  authors shipping unguarded recursion that instances only discover
  late.
- **X-C2 — the budget's size and spelling.** Whether the expansion
  budget is the existing pass budget, a distinct knob, or T-1's
  eventual design. Decided with the implementation, not here.
- **X-C3 — `edge-spread-disjunct-key`.** P0 changes a pinned
  behaviour (template-through-disjunct). Whether the map shape follows
  the list shape or stays inert is its own small adjudication.

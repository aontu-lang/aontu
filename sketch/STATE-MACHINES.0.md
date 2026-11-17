# State machines from general primitives: design note

Status: PROPOSED, second draft (2026-11-17), its ten questions ruled
the same day as §10 records. Nothing here is built. The
first draft of the same day proposed a `machine(spec)` declaration with
its own vocabulary of initial and final states, patterns and
obligations; the owner found it too specific. This draft proposes
instead a rule and a handful of primitives that are not about state
machines at all, and builds the state-machine vocabulary from them as a
bundled model. §3 records what holds today, each claim run on both
engines; §6 proposes the design; §9 is the plan; §10 lists the
decisions the owner is asked for.
Date: 2026-11-17

A lifecycle is already writable in aontu: each state a member of a map,
each transition a link, each event a key. What a team then asks of it
is what the formal-methods literature has asked of state machines for
decades: that every state is reachable, that no state is a trap, that
some states never follow others, that a guarded transition preserves
what its target requires, and that a recorded run took legal steps.
Each of those questions is a question about a graph, about a choice
among values that data supplies, or about one schema implying another.
None is about state machines as such, so none needs a state-machine
word in the language.

## 1. The problem

Three questions came first, each answered by running both engines:
whether aontu can express state machines, what of them it can check,
and how that compares with the established ways to validate one.

- **What works** is the structure. A transition that names no state is
  `rel_unresolved`, two targets for one event are `scalar_value`, a loop
  under `acyclic()` is `relation_cycle`. `aontu reaches` and
  `aontu view state` read the graph. Records, changes and commands can
  be held to the machine one snapshot at a time. The `subsume` and
  `breaking` verbs prove a little for all data.
- **What is missing** has four shapes. The graph a document declares
  can be checked for cycles and inverses and nothing else, and can't be
  read as a value at all. A choice among values can't be built from
  data: a disjunction is written out by hand. A value can't be read by a
  key the document computes, though a link can be made to one. And one
  schema implying another can be asked of the command line, never
  stated in a document.

A primitive that filled one of those gaps for state machines alone
would be the first draft again. Each of the gaps is met as often in a
dependency graph, an organisation chart, a registry of allowed values or
an API's compatibility promise, and the primitives below are for all of
them.

## 2. What was asked

The owner, 2026-11-17, in order:

- "File issues for findings; prepare a plan to support state machines
  more effectively", which the first draft answered.
- "The problem with this proposal is that is it is too specific. What
  language primitives, new or extended, could enable state machine
  representations and validation", which a reply in the session
  answered with the primitives of §6.
- "Rewrite the note", which this draft is.

## 3. What holds today

Run on both engines at 0.76.0, on #791 (`relate`) and on `main` at
5b548f6 (`rel`), with one answer from both in every row.

**The machine and its checks.**

| Check | How it is written | A bad input gives |
|---|---|---|
| A transition names a state | `next: relate() & { ship: path($.lifecycle.shipped) }` | `rel_unresolved` at the transition |
| One target per event | events are map keys | `scalar_value` |
| No loop, for a one-way lifecycle | `acyclic()`, declared once on an empty `next` | `relation_cycle`, from `relations` and generation |
| One state reaches another | `aontu reaches A B --relation next` | `unreachable`, or the shortest path |
| A diagram | `aontu view state --root '$.lifecycle.draft'` | Mermaid, text, SVG |
| A record's status is a state | `state: hide(relate() & path("$.lifecycle." + .status))` | `rel_unresolved` under `vet` |
| A record holds what its state needs | a disjunction keyed on `status`, written by hand | `incomplete` or `invalid` under `vet` |
| A change lands where it says | `pick(pick(pick([$.lifecycle], .before), next), .event) & [path(…)]` | `scalar_value`, or `pick_key` |
| A transition preserves an invariant | `aontu subsume shipped.aontu placed-ship.aontu` | `compat_required_added`, `compat_narrowed`; `undecided` for `must`, `when` and patterns |
| Two guards never both hold | meet them | refused where exclusive; the overlap as residue |
| A new version keeps every transition | `aontu breaking --against v1.aontu --mode forward v2.aontu` | `breaking` at a dropped or retargeted transition |

**The general pieces the design composes with.** Each also checked on
both engines:

| Piece | Written | Does |
|---|---|---|
| A spread over the states | `lifecycle: { &: { name: key() }, … }` | gives each state its own key |
| "None of these" | `xs & contains(path($.c), 0)` | refuses a list that holds `path($.c)` |
| "All of these" | `xs & [&: min(2)]` | holds every element to the template |
| A map's keys as data | `pick(pack($.m, { k: key() }), k)` | `["a", "b"]` |
| A transition as text | `pick(pack($.lifecycle.placed.next, { l: key() + " -> " + _ }), l)` | `["cancel -> $.lifecycle.cancelled", …]` |
| A counterexample in a refusal | `[path($.a), path($.b)] & len(0)` | refused, and the report prints the list |

`key()` inside an `each` template reads where the output lands, not the
source member's key, which is why the keys go through `pack`.

## 4. The boundary this design keeps

**Option E of G4.** Global graph properties "must not be lattice
citizens: they are declared as ordinary data under a blessed vocabulary
and checked by a post-unification pass". The design keeps that and
generalises the pass: a value that reads the finished graph is computed
after unification, in a stage of its own, and never feeds back into
what it read (D-1). No primitive here is unified into the lattice
before the stage it reads has settled.

**G4's non-goal on temporal properties.** G4 rules out "temporal or
behavioural relation properties ('eventually consistent')" as
inexpressible in a value lattice. The graph reads of D-2 are not
properties of a running system. They are reachability over the finite
graph a finished document declares, which `aontu reaches` already
answers one pair at a time. Whether that reading stands is Q1.

**The ADRs.** ADR-001: each phase lands in both ports with shared rows
whose expectations come from both engines agreeing. ADR-002: every line
is covered. ADR-003: aontu defines what each primitive means; nothing
is handed to a host to interpret. ADR-081, on #791: a read's result,
and the order of any list it returns, does not depend on the order a
document is written in.

## 5. The design in brief

One rule and eight primitives:

| | Primitive | New or extended | Kind |
|---|---|---|---|
| S | stratified reads | extends the staging `filter`, `match` and `pack` have | rule |
| P1 | `reach(r, from, avoid?)`, `step(r, from)`, `route(r, from, to, avoid?)` | new; the algorithm of `aontu reaches` | graph read |
| P2 | `edges(r)` | new | graph read |
| P3 | edges that carry data | extends `relate()` | relation |
| P4 | `oneof(d)` | new | settled read |
| P5 | `get(m, k…)` | extends references to computed segments | reference |
| P6 | `implies(a, b)` | new; the `subsume` verb as a check | check |
| P7 | `here(n?)`, `pairs(l)` | new | positional; settled read |
| P8 | `keys(m)` | sugar for `pick(pack(m, { k: key() }), k)` | settled read |

From them a document states its own checks as ordinary constraints, and
the state-machine vocabulary is a bundled model, `aontu:machine`,
written in aontu with those primitives (D-10). A team that wants a
different notion of "final" changes a model, not an engine.

The order lifecycle's checks, in the proposed syntax:

```aontu
final: [path($.lifecycle.delivered), path($.lifecycle.cancelled)]

lifecycle: &: {
  reachable: reach(next, $.lifecycle.draft) & contains(here())   # every state reachable
  canFinish: reach(next, here()) & contains(oneof($.final))      # no trap state
}

never:   route(next, $.lifecycle.shipped, $.lifecycle.draft) & len(0)
through: route(next, $.lifecycle.draft, $.lifecycle.shipped, [$.lifecycle.placed]) & len(0)

orders:  &: oneof(each(keys($.lifecycle), { status: _ } & maybe(get($.lifecycle, _, "holds"))))

kept:    edges(next) & [&: { ok: implies(get(.from, "holds") & .attrs.guard, get(.to, "holds")) }]
```

`never` and `through`, when they fail, print the offending route, since
the refusal prints the value it refused (§3). `orders` reads the
machine and never the record it is met into, so it needs no ruling on
#818; a lookup by the record's own `status` would.

| Line | Established property |
|---|---|
| `reachable` | every state reachable from the initial state (CTL EF, asked of each state) |
| `canFinish` | no trap: AG EF final |
| `never` | absence after a state (Dwyer et al.); AG(shipped → AG ¬draft) |
| `through` | precedence: every path to `shipped` passes `placed`; ¬E[¬placed U shipped] |
| `orders` | each record conforms to its state's invariant |
| `kept` | Event-B invariant preservation, one obligation per transition |

## 6. Decisions (proposed)

### D-1. Rule S: stratified reads

`filter`, `match`, `pack` and `each` already "wait for the model to
settle before they answer", and the definition reads them once a
document is read (`resolveD` and `selectArm` in
`spec/Aontu/Verdict.lean`). Rule S makes that staging a rule with a
name, and gives it the stages the new reads need:

1. **The lattice**: unification, references, links.
2. **Settled bag reads**: `filter`, `match`, `pack`, `each`, `pick`, the
   folds, and P4, P5 where a key is computed, P7's `pairs`, P8.
3. **Graph reads**: P1 and P2, over the edge set of the finished stage 2.
4. **Checks**: the trials judged at generation, the graph atoms, P6.

A read takes its input from the stages below it and gives its result
to the stages above it or to the output. A read whose result would
change what it read is refused: a link made from a `reach`, or a
member whose existence a `filter` over its own map decides. That
refusal, `stage_cycle`, is the answer #818 asks for: the definition
already answers `error` where a `match` is met into the record whose
field it reads. Stratified Datalog is the precedent: negation and
aggregation are safe over a lower stratum, and a program that needs
them over its own is refused.

The rule is coarse by default, a whole value, and can be made finer
where a read's field is decided without the read's result: `status`
in `order: { status: "placed" } & get(…, .status, …)` is. Which of the
two the ports implement is Q2.

### D-2. Graph reads: `reach`, `step`, `route`

Over the edges of relation `r`, the field name every `relate()` of that
name shares:

- `reach(r, from, avoid?)`: the nodes reachable from `from`, an address
  or a list of them, by zero or more edges, passing no node of `avoid`.
  A list of addresses in code-point order.
- `step(r, from)`: the nodes one edge away.
- `route(r, from, to, avoid?)`: a shortest path from `from` to `to`, as
  a list of addresses, first in code-point order among the shortest; an
  empty list where there is none. It is the path `aontu reaches` prints.

A node is an address the graph names, as `reaches` reads it: a link
into part of a node reaches that node. `reach` includes `from`, where
the verb asks for one or more edges; `route(r, a, a)` is `[a]`. Q3.

With `contains`, `len` and a spread, these give the CTL properties that
matter to a lifecycle: EF (`contains`), AG over the reachable set (a
spread), E[¬a U b] (`avoid`), and AG EF (a spread of `reach` over every
state). AF and EG need cycles in a subgraph; `acyclic()` and the trap
check together give AF where final states have no exits, and nothing
here gives EG. They are left until a model needs them.

### D-3. `edges(r)`: the edge set as data

`edges(r)` is a list of `{ from, to, label, at }`, and `attrs` where
P3 gives it, in the order of `at`. `from`, `to` and `at` are addresses;
`label` is the member key under the relation (the event) or, for a
relation written as one path, the relation's name. It is the edge set
`graphOf` already builds (`ts/src/graph.ts`, `go/graph.go`), with the
label read from `at`.

It is what a check iterates (D-7's obligations), what a template
iterates to write SCXML or TLA+ (D-12), and what the state figure
labels its edges from (D-11).

### D-4. Edges that carry data

`relate()` rewrites every leaf path of its map into a link, and refuses
or waits at a leaf that is no path, so an edge can't carry a guard
today. Extended: a member may be a record, one field of which is the
link, `relate(t, { at: "to" })`, and the rest of which is the edge's
data, reported in `edges(r)` as `attrs`:

```aontu
next: relate(any, { at: "to" }) & {
  ship: { to: path($.lifecycle.shipped), guard: { trackingNo: string } }
}
```

The same is a dependency with its version range, a network link with
its port, a weighted edge. Whether the link field is named in the call
or by convention is Q5.

### D-5. `oneof(d)`: a choice from data

The disjunction of the members of a list or the values of a map:
`oneof(["a", "b"])` is `"a" | "b"`. `nof` takes its branches written
out; `oneof` takes them from data, so it is a settled read (stage 2).
`oneof([])` is `nil`. With it, `status: oneof(keys($.lifecycle))` is a
status that names a state, and a union of the states' shapes is
`oneof(each(keys($.lifecycle), { status: _ } & maybe(get($.lifecycle, _, "holds"))))`,
a state with no `holds` admitting any record with its status.
It is the allowed values of a registry, the tenants a policy names, the
regions a deployment may take.

### D-6. `get(m, k…)`: a read by computed key

The member of `m` at the keys `k…`, each a string or an index, the read
side of the `path("$." + …)` a link already computes. `m` is a map or
a list, or an address, which reads the node it names, so
`get(.from, "holds")` over an edge reads the source state's shape. `get($.lifecycle,
.from, "next", .event)` is a transition's target; a missing key is
refused as `get_key`, as `pick` refuses with `pick_key`, and
`maybe(get(…))` reads an absent one as absent. Today's
`pick([m], k)`, which is `[m[k]]`, is the workaround it replaces. Once
its keys are concrete it is an ordinary reference, which is why it is
in stage 1 where its keys come from the lattice and in stage 2 where a
read computes them.

### D-7. `implies(a, b)`: subsumption as a check

`a` implies `b` where every instance of `a` is an instance of `b`: the
`subsume` verb's question, with `b` general and `a` specific, asked in
the document and judged in stage 4. Three answers, as the verb gives:
it holds; it is refuted, refused as `implies_refuted` with the verb's
witness; or it is undecided, with the verb's `sub_*` reason. Where the
third lands is Q4.

It states in a document what today needs the command line: a transition
keeps its target's invariant (§5, `kept`), two guards are exclusive
(`implies(g1 & g2, nil)`), a schema's version 2 admits what version 1
did, a role's permissions imply another's. #819 is the gap it inherits
first.

### D-8. `here(n?)` and `pairs(l)`

- `here(n?)` is the address of the node `n` levels above where it
  stands, as `key(n)` is its key; `here()` in a spread over states is
  the state's address. Positional, stage 1.
- `pairs(l)` is the list of `{ from: lᵢ, to: lᵢ₊₁ }`, empty below two
  members. Stage 2. A recorded history is legal where
  `pairs(trail) & [&: { ok: step(next, .from) & contains(.to) }]`; the
  same shape checks timestamps that rise, versions that chain, a
  migration's order.

### D-9. `keys(m)`

`keys(m)` is `pick(pack(m, { k: key() }), k)`, which works today. It
earns a name because every check over a map's members needs it; it adds
no semantics.

### D-10. The machine vocabulary is a bundled model

`aontu:machine` is written in aontu with the primitives, as
`aontu:gen` holds the output options. A sketch of its shape, not its
text:

```aontu
aontu: machine: hide({
  Machine: {
    of: path              # the map of states
    over: string          # the relation whose edges are the transitions
    initial: [...path]
    final: [...path]
    checks: {
      unreachable: …      # each state of .of not in reach(.over, .initial)
      traps:       …      # each state whose reach holds none of .final
      finalExits:  …      # edges(.over) from a final state
    }
  }
})

orders_machine: $.aontu.machine.Machine & {
  of: path($.lifecycle), over: "next"
  initial: [path($.lifecycle.draft)]
  final: [path($.lifecycle.delivered), path($.lifecycle.cancelled)]
}
```

A violation is an ordinary refusal sited in the user's document,
because each check is a constraint over the user's own graph. The
model is the place for the patterns of the first draft (absence after,
precedence) and for the per-state union; the language holds none of
them.

### D-11. The figure reads the edge labels

`aontu view state` labels each edge with its `label` from D-3, the event,
where it labels it with the relation's name today; `--events relation`
draws today's labels. It needs nothing else from this note and can land
first. Whether the event becomes the default, which moves every golden
that draws a map relation, is Q7.

### D-12. Export is a template

An SCXML or TLA+ document is text written from `edges(r)` and the map of
states, which `emit`, `each` and the templates already write. A bundled
template beside `aontu:machine` writes SCXML; there is no exporter in
the engine. What a template can't write exactly, a guard outside the
subset it knows, it leaves out and says so in the text it writes.

### D-13. The definition

Rule S belongs in the definition, since it decides which documents are
refused: the stages, the read relation between them, and a theorem that
a document rule S admits has one reading. The graph reads can be
defined over the edge set of a reading in a `spec/Aontu/Graph.lean`,
with theorems that `route` returns a path of the graph and that
`reach` is closed under `step`, and oracle rows. The definition holds
no relation verdict today; `test/spec/relation.tsv` does. Q10.

## 7. Errors

Proposed, each appended to `test/spec/errcodes.tsv` with a hint in both
ports in the change that introduces it:

| Code | Class | Raised by |
|---|---|---|
| `stage_cycle` | reference | a read whose result feeds what it read (D-1) |
| `graph_relation` | reference | a relation name no `relate()` declares (P1, P2) |
| `get_key` | conflict | a key `get` finds no member at (D-6) |
| `implies_refuted` | conflict | an implication refuted, with the witness (D-7) |

The checks a model writes need no code of their own: a failed
`contains`, `len` or trial is refused with the code it has today, and
the model's `must` messages say what was meant.

## 8. What must hold

- **Parity.** Rule S in both evaluators; the graph reads beside
  `ts/src/reach.ts` and `go/reach.go`, reading `graphOf`; `relate()`'s
  record members in `ts/src/val/RelateFuncVal.ts` and its Go twin;
  `implies` over `ts/src/subsume.ts` and `go/subsume.go`. Each answer
  pinned by a shared row from both engines agreeing.
- **Rows.** A row file per stage of the plan: `test/spec/stage.tsv`,
  `test/spec/graph-read.tsv`, and the existing `relation.tsv`,
  `view.tsv`, `subsume.tsv`, `signature.tsv` and `errcodes.tsv` where a
  phase touches them.
- **Determinism.** Every list a read returns is in code-point order, or
  in `at` order for edges; a route is the first shortest in code-point
  order, as the verb's is.
- **Order independence.** A read's result does not depend on the order
  the document is written in (ADR-081, on #791).
- **One report.** `vet` reports what generation refuses (#491 is where
  it doesn't today).
- **Cost.** `reach`, `step` and `route` are linear in the edge set;
  a check that asks `reach` of every state is quadratic, which a
  lifecycle never notices and a registry of many thousand nodes might.
  A read may be cached per stage, since its input does not change once
  the stage below it has settled.
- **Coverage.** 100 % in both ports, every exclusion justified.

## 9. Plan

Each phase lands in both ports with its rows, codes, coverage and
documentation, and its row in the progress register if Q9 opens this
as a gap document.

0. **Blockers.** Close #816 (a graph atom hides its container's
   members) and #817 (a check under `hide()` never runs), since the
   checks above are often written hidden; #815 (a cycle's reported
   edge); #491 (`vet` and relation verdicts); #748 (a trial hides its
   container's members). On #791, before it merges: a pending link's
   `canon` is `''`, so a report that prints a relation's member template
   alone prints nothing.
1. **Rule S** (D-1, D-13). The stages in the definition, with
   `stage_cycle`; the ports' existing staged reads moved onto it;
   #818's documents refused as the definition refuses them.
2. **Graph reads** (D-2, D-3). `reach`, `step`, `route`, `edges`;
   `graph_relation`. The signature lines in `test/spec/signature.tsv`.
3. **Choice and lookup** (D-5, D-6, D-9). `oneof`, `get`, `keys`;
   `get_key`.
4. **Implication** (D-7), after #819. `implies`; `implies_refuted`.
5. **Edges that carry data** (D-4), and the figure's labels (D-11).
6. **Position and sequence** (D-8). `here`, `pairs`.
7. **The bundled model** (D-10). `aontu:machine`, its use rows, and
   `docs/how-to/model-a-state-machine.md`, every transcript run by the
   docs gate, beside the file-system and microservices guides.
8. **The export template** (D-12), if Q8 asks for it.

Phase 1 comes first because every later read is defined by its stage.
Phases 2 and 3 are independent of each other; 4 needs #819; 5 and 6
need nothing but 1; 7 needs 2, 3 and 6.

Out of scope: running a machine, composing machines, nested states,
parallel regions, history states, timing, probability, equivalence up
to renaming, and CTL as a language. A model can be written to TLA+ by
D-12's template where a team needs those.

## 10. Decisions for the owner

Each with a recommendation, and the owner's ruling of 2026-11-17. Every
ruling followed the recommendation.

- **Q1.** Do the graph reads, judged after unification, fall inside
  G4's option E and outside its non-goal on temporal properties?
  Recommended: yes, and G4's boundary text says so.
  **Ruled: yes.** G4's boundary text is to say so.
- **Q2.** Rule S at the grain of a value, or of a field? Recommended:
  a value first, as the definition refuses #818 today; a field where a
  model shows the need.
  **Ruled: a value first.**
- **Q3.** Does `reach` include its start? Recommended: yes, unlike the
  verb, so that "every state is reachable" includes the initial one.
  **Ruled: yes.**
- **Q4.** Where does an undecided `implies` land: `incomplete`, a class
  of its own, or refused? Recommended: `incomplete`, with its `sub_*`
  reason, so a gate fails on it and `--partial` doesn't.
  **Ruled: `incomplete`, with its `sub_*` reason.**
- **Q5.** Which field of a record member is the link: named in the call,
  or a convention? Recommended: named in the call.
  **Ruled: named in the call.**
- **Q6.** The names: `reach`, `step`, `route`, `edges`, `oneof`, `get`,
  `implies`, `here`, `pairs`, `keys`.
  **Ruled: as proposed**, each checked against the builtins as its phase lands.
- **Q7.** Does the state figure label by event by default?
  Recommended: yes; the goldens move once.
  **Ruled: yes.**
- **Q8.** Is `aontu:machine` bundled, with its SCXML template, or only
  a how-to guide? Recommended: bundled, as `aontu:gen` is.
  **Ruled: bundled, with its SCXML template.**
- **Q9.** A design note, or gap document G13 with register rows?
  Recommended: G13 once Q1 and Q2 are ruled.
  **Ruled: G13**, not yet opened.
- **Q10.** Rule S and the graph reads in the definition? Recommended:
  rule S yes, since it decides what is refused; the graph reads once
  phase 2 has rows.
  **Ruled: rule S now, the graph reads once their rows exist.**

## 11. Issues this note depends on

| Issue | What it blocks |
|---|---|
| #816 | reads through a relation that carries `acyclic()` or `inverse()` |
| #817 | any check written under `hide()` |
| #818 | the ruling rule S gives |
| #819 | `implies` over relations, and backward `breaking` over a machine |
| #815 | the edge a cycle finding names |
| #491 | `vet` reporting what generation refuses |
| #748 | sizes and trials beside a container's members |
| #661, #754 | relative paths in a template, which the model's checks use |
| #691 | a spread that reads what it supplies |
| #750 | `+` over an address a graph atom governs |
| #777 | ruled 2026-11-17: a relation's range checks its target, judged once the target has settled, and writes nothing into it |
| #457, #327 | the text and site of a refusal inside a call, which every check reports through |

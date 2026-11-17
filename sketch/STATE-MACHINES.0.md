# State machines: design note

Status: PROPOSED (2026-11-17). Nothing here is built. §3 records what
holds today, each claim run on both engines; §6 proposes the design;
§9 is the plan; §10 lists the decisions the owner is asked for.
Date: 2026-11-17

A lifecycle is already writable in aontu: each state a member of a map,
each transition a link, each event a key. What a team then asks of it
is what the formal-methods literature has asked of state machines for
forty years: that every state is reachable, that no state is a trap,
that some states never follow others, that a guarded transition
preserves what its target state requires, and that a new version keeps
every path the old one had. aontu answers some of these today, as
§3 shows, and the rest not at all. This note proposes a declaration
that states a machine once, the checks that read it, and the order to
build them in.

```aontu
lifecycle: machine({ over: "next", initial: "draft", final: ["delivered", "cancelled"],
                     never: [{ from: "shipped", to: "draft" }] })
lifecycle: {
  draft:     { next: relate() & { place: path($.lifecycle.placed), cancel: path($.lifecycle.cancelled) } }
  placed:    { holds: { paidAt: string },
               next: relate() & { ship: path($.lifecycle.shipped), cancel: path($.lifecycle.cancelled) },
               when: { ship: { paidAt: string, trackingNo: string } } }
  shipped:   { holds: { paidAt: string, trackingNo: string },
               next: relate() & { deliver: path($.lifecycle.delivered) } }
  delivered: {}
  cancelled: {}
}
orders: { &: stateof($.lifecycle, "status") }
```

## 1. The problem

Three questions came first, each answered by running both engines:
whether aontu can express state machines, what of them it can check,
and how that compares with the established ways to validate one. The
answers, in short:

- **What works** is the structure: a transition that names no state is
  `rel_unresolved`, two targets for one event are `scalar_value`, a
  loop under `acyclic()` is `relation_cycle`, and `aontu reaches` and
  `aontu view state` read the graph. Records, changes and commands can
  be held to the machine one snapshot at a time. `subsume` and
  `breaking` prove a little for all data.
- **What breaks** is a set of defects the work found and filed: §11.
  Several sit in the relation machinery this note extends.
- **What is absent** is every property over the graph as a whole other
  than acyclicity, every property over paths, transitions that carry
  data, and any way out to the tools that check the rest.

The established methods, for reference:

| Method | What it proves | Tools |
|---|---|---|
| Graph analysis | transitions name states, one initial state, determinism, completeness, reachability, no trap states, minimal and equivalent forms | automata algorithms |
| Model checking | safety, liveness and ordering over every run, with a counterexample | SPIN, NuSMV/nuXmv, TLA+ (TLC, Apalache), UPPAAL, PRISM, mCRL2 |
| Proof | invariants each transition preserves; refinement | Event-B/Rodin, TLAPS, Isabelle, Coq, Lean, Dafny |
| Refinement and equivalence | trace inclusion, bisimulation | FDR, mCRL2, CADP |
| Bounded search | counterexamples up to a size | Alloy |
| Testing | transition cover, runtime monitors | W-method, `@xstate/graph` |

Of these, aontu can reasonably own the first row, the patterns of the
second that are plain reachability over a finite graph, and the proof
obligations of the third that subsumption decides. The rest belongs to
the tools, and aontu's part is to hand them a faithful model.

## 2. What was asked

The owner, 2026-11-17: "File issues for findings; prepare a plan to
support state machines more effectively". It followed three questions:
"Can aontu express state machines?", the request to file what that
found, and "Are there well established ways to formally validate state
machines? Can aontu do this? What is missing?"

## 3. What holds today

Run on both engines at 0.76.0, on #791 (`relate`) and on `main` at
5b548f6 (`rel`), with one answer from both in every row.

| Check | How it is written | A bad input gives |
|---|---|---|
| A transition names a state | `next: relate() & { ship: path($.lifecycle.shipped) }` | `rel_unresolved` at the transition |
| One target per event | events are map keys | `scalar_value` |
| No loop, for a one-way lifecycle | `acyclic()`, declared once on an empty `next` | `relation_cycle`, from `relations` and generation |
| One state reaches another | `aontu reaches A B --relation next` | `unreachable`, or the shortest path |
| A diagram | `aontu view state --root '$.lifecycle.draft'` | Mermaid, text, SVG |
| A record's status is a state | `state: hide(relate() & path("$.lifecycle." + .status))` | `rel_unresolved` under `vet` |
| A record holds what its state needs | a disjunction keyed on `status` | `incomplete` or `invalid` under `vet` |
| A change's event leaves its start state | `legal: hide(relate() & path("$.lifecycle." + .before + ".next." + .event))` | `rel_unresolved` |
| A change lands where it says | `pick(pick(pick([$.lifecycle], .before), next), .event) & [path(…)]` | `scalar_value`, or `pick_key` |
| A guard on a command | `match(.event, "ship", { paidAt: string }, {}) & .order` | refused at the missing field |
| A transition preserves an invariant | `aontu subsume shipped.aontu placed-ship.aontu` | `compat_required_added`, `compat_narrowed`; `undecided` for `must`, `when` and patterns |
| Two guards never both hold | meet them | refused where exclusive; the overlap as residue |
| A new version keeps every transition | `aontu breaking --against v1.aontu --mode forward v2.aontu` | `breaking` at a dropped or retargeted transition |

Four things in that table are workarounds, and each is a reason for a
decision below:

- `acyclic()` on each state's own `next` hides that map's members from
  every link and path (#816), so the property is declared once on an
  empty relation of the same name.
- The diagram labels every edge `next`, the relation's name, because an
  edge's label is its relation. One relation per event labels the
  events but checks cycles per event, so a loop through two events
  passes.
- The lookup of a transition's target is `pick([m], k)`, which is
  `[m[k]]`, because a path can't be computed. It needs absolute
  addresses: a copied link reads a relative one where the copy stands
  (ruling 55).
- The per-state rule is a hand-written disjunction, because a `match`
  that reads the record it is met into never settles (#818).

## 4. The boundary this design keeps

**Option E of G4.** Identity and referential integrity are monotone and
live in the lattice; global graph properties are not, and "must not be
lattice citizens: they are declared as ordinary data under a blessed
vocabulary and checked by a post-unification pass". `acyclic()` is that
pass today: it registers a declaration during unification, adds nothing
to the value, and is judged over the finished edge set by generation
and by `aontu relations`. Every check this note proposes is judged the
same way, by the same pass. None is a lattice constraint.

**G4's non-goal on temporal properties.** G4 rules out "temporal or
behavioural relation properties ('eventually consistent')" as
inexpressible in a value lattice. The path patterns of D-4 are not
properties of a running system: they are reachability over the finite
graph a finished document declares, the question `reaches` already
answers one pair at a time. They sit in the pass G4 assigns graph
properties to. Whether that reading stands is Q1.

**ADR-001.** Each phase lands in both ports with shared rows whose
expectations come from both engines agreeing. **ADR-002.** Every line
is covered. **ADR-003.** The exporter of D-9 writes only what aontu
defines and reports what it drops; it hands no aontu value to a host to
interpret. **ADR-081** (on #791). A finding and its counterexample do
not depend on the order a document is written in.

## 5. The design in brief

A machine is a declaration on the map that holds its states. It names
the relation whose edges are the transitions, the initial states, and
the final ones. The relation stays what it is today: one `relate()` map
per state, its keys the events. From the declaration the engine knows
the state set, which the edge set alone does not (a state with no
transitions is in no edge), and it judges:

1. the structure: every transition stays inside the machine, every
   state is reachable from an initial one, every state can still reach
   a final one, and a final state has no transitions (D-3);
2. the path patterns a document opts into: one state never followed by
   another, one state always passed before another (D-4);
3. with data, what each transition owes: a guarded transition from a
   state lands a record its target accepts, and two guards on one event
   never both hold (D-7).

The diagram reads the declaration and labels each edge with its event
(D-5). A record is held to its state's shape by a disjunction the
machine builds (D-6). A version is held to the last one by `breaking`
(D-8). The model goes out as SCXML for the tools that check the rest
(D-9).

## 6. Decisions (proposed)

### D-1. A machine is `machine(spec)`, a declaration on the map of states

`machine(spec: map) : constraint`, met with the map whose members are
the states. `spec` holds `over`, the relation's name, `initial`, a
state's key or a list of them, and `final`, a list (empty where the
machine has no final state). It registers the declaration as
`acyclic()` registers its own and adds nothing to the value it meets.

It is a declaration on the container, so it depends on #816: a graph
atom on a container hides the container's members today, and a machine
declaration that did the same would hide every state. #816 closes
first.

**Alternative.** Separate atoms beside `acyclic()`: `rooted(p)`,
`noTraps()`, `finals(…)`. Each would need the state set, which only the
container knows, so each would be written on the container anyway, and
three atoms would be three places to keep consistent. Q2.

### D-2. States, transitions and events

A state is a member of the declaring map. A transition is an edge of
the relation `over` whose source is a state; its target must be a state
of the same machine. The event is the edge's member key under the
relation (`ship` in `next: relate() & { ship: path(…) }`), read from the
edge's position `at`, where `graphOf` already records it. A relation
written as a single path or a list has no events, and its edges are
labelled by the relation's name, as now.

A relation's name governs every relation of that name, but a machine
reads only the edges whose source is one of its states, so two
machines can share `next`.

### D-3. The structural checks

| Check | Code | Detail |
|---|---|---|
| a named initial or final state is a member | `machine_state` | the name, and the members |
| a transition's target is a state of the machine | `machine_outside` | the edge and its target |
| every state is reachable from an initial state | `machine_unreachable` | the state |
| every state can reach a final state | `machine_trap` | the state, and the states it is trapped among |
| a final state has no transition | `machine_final_exit` | the edge |

Each is sited at the edge or the state it names, judged after
unification, reported by `aontu relations` and refused by generation, as
`relation_cycle` is. A machine with no final state skips the trap check
and says so in the report. "Can always still finish", AG EF final in
CTL, is the trap check, asked of every state. Strict termination, AF
final, is the trap check together with `acyclic()` on the relation,
which stays as it is: with no cycle, every run ends in a state with no
transition, and with no trap, that state is final.

### D-4. Path patterns

After Dwyer, Avrunin and Corbett's specification patterns (ICSE 1999),
which catalogue the properties practitioners write, the two that are
plain reachability:

| Pattern | Written | Means | Code | Counterexample |
|---|---|---|---|---|
| absence after | `never: [{ from: "shipped", to: "draft" }]` | once in `from`, `to` is never reached | `machine_never` | the shortest path from `from` to `to` |
| precedence | `through: [{ to: "shipped", via: "placed" }]` | every path from an initial state to `to` passes `via` | `machine_bypass` | the shortest path that avoids `via` |

A state in a pattern is a key, or a list of keys. A counterexample is
chosen as `reaches` chooses its path: shortest, then first in code-point
order, so both ports print the same bytes. A general CTL is left out:
it is cheap to decide on an explicit graph, linear in the graph and the
formula, but a second language is a large surface for two patterns'
worth of use. Q3.

### D-5. The diagram reads the machine

`aontu view state` takes the initial and final states from a machine
declaration when one names the relation, so `--root` is not needed. An
edge of a map relation is labelled with its event; `--events relation`
draws today's labels. This lands first and alone (phase 1), because it
needs no declaration: the event is already in `at`. Whether the event
becomes the default, which moves every golden that draws a map
relation, is Q4.

### D-6. A state's shape, and the records that are in it

A state may hold `holds`, a schema a record in that state satisfies.
`stateof(m, k)` is the disjunction, over the states of the machine at
`m`, of `{ <k>: "<state>" } & <holds>`:

```aontu
orders: { &: stateof($.lifecycle, "status") }
```

is the disjunction §3 writes by hand, built from the machine, so a
state added to the machine is a status the records may take. It reads
the machine, never the record it is met into, so it does not meet
#818. The alternative, a lookup by the record's own status, waits on
#818's ruling. Q5.

### D-7. Transitions with data

Beside `next`, a state may hold `when`, a guard per event, and `set`, a
map per event of the fields the transition writes:

```aontu
placed: {
  holds: { paidAt: string }
  next: relate() & { ship: path($.lifecycle.shipped) }
  when: { ship: { trackingNo: string } }
  set:  { ship: { shippedAt: string } }
}
```

They sit beside `next`, not in it, so `relate()` keeps rewriting paths
alone. The machine generates two obligations per transition and
discharges each with the subsumption query:

- **preservation**: `holds(from)`, met with `when`, with the keys of
  `set` replaced by `set`'s, is subsumed by `holds(to)`. Refuted is
  `machine_invariant`, with the witness `subsume` gives.
- **exclusion**, where one event has two guarded transitions from one
  state: the meet of `holds(from)` and both guards is empty. Where it
  stands, `machine_overlap`, with the meet as the overlap.

An obligation `subsume` leaves `undecided` is reported as undecided,
never as a pass, with its `sub_*` reason. These are the Event-B
obligations for invariant preservation, restricted to what subsumption
decides. Q6.

### D-8. Evolution

`aontu breaking --against v1.aontu --mode forward v2.aontu` already
refuses a dropped or retargeted transition and passes an added one.
Backward mode is `undecided` at a dropped transition until #819 closes.
With a machine declaration, the initial and final states and the
patterns are part of what is compared, so a version that drops a
`never` is breaking. Equivalence up to renaming states is left out.

### D-9. Export

`aontu view state --as scxml` writes the W3C SCXML document: one
`<state>` or `<final>` per state, a `<transition event target>` per
edge, the `initial` attribute. A guard is written as `cond` only where
aontu can write it exactly; anything else is dropped and counted by the
view's loss report, as `hidden_contribution` is now. SCXML is a W3C
standard, and runtimes such as Qt SCXML and Apache Commons SCXML
execute it. A TLA+ emitter, for concurrency and the properties D-4
leaves out, is Q7.

### D-10. The definition

The definition holds no relation verdict today; `test/spec/relation.tsv`
holds them. A machine could be defined in a `spec/Aontu/Graph.lean`:
the edge set of a reading restricted to a machine, reachability, the
trap set, dominance, and theorems that a finding's counterexample is a
path of the graph, with oracle rows. Without it, `spec/README.md`
records that rows hold the machine. Q8.

## 7. Errors

Each appended to `test/spec/errcodes.tsv`, class `conflict`, with a hint
in both ports, in the change that introduces it:

`machine_state`, `machine_outside`, `machine_unreachable`,
`machine_trap`, `machine_final_exit`, `machine_never`, `machine_bypass`,
`machine_invariant`, `machine_overlap`.

`machine_spec` refuses a `spec` that is not a map of the known keys, as
`gen_option` refuses a record.

## 8. What must hold

- **Parity.** The declaration in `ts/src/val/GraphAtomVal.ts` and
  `go/graphatom.go` (or a value of its own in each), the checks in
  `ts/src/relation.ts` and `go/relation.go`, the events in
  `ts/src/graph.ts` and `go/graph.go`, the figure in `ts/src/view.ts`
  and `go/view.go`, the obligations through `ts/src/subsume.ts` and
  `go/subsume.go`. Each answer pinned by a shared row from both engines
  agreeing.
- **Rows.** `test/spec/machine.tsv` for the checks, beside
  `test/spec/relation.tsv`; `test/spec/view.tsv` for the figure; the
  code rows.
- **One report.** `vet` reports what generation refuses; #491 is where
  it does not today, and closes before D-3 lands, or `vet` passes a
  machine generation refuses.
- **Determinism.** Findings sorted by `at`, counterexamples chosen by
  length then code point, states and events by code point.
- **Cost.** Reachability, the trap set (strongly connected components)
  and dominance are linear or near it in the edge set.
- **Coverage.** 100 % in both ports, every exclusion justified.

## 9. Plan

Each phase lands in both ports with its rows, codes, coverage and
documentation, and its row in the progress register if Q9 opens this
as a gap document.

0. **Blockers.** Close #816 (a graph atom hides its container's
   members) and #815 (a cycle's reported edge), both in the code D-3
   extends; #817 (a check under `hide()` never runs), since a machine's
   checks are often written hidden; #491 (`vet` and relation
   verdicts); #819 (subsumption of a relation's members). Rule on #818
   and #777. On #791, before it merges: a pending link's `canon` is
   `''`, so a report that prints a relation's member template alone
   prints nothing (`subsume`'s `expected:` and its general site).
1. **Event labels** (D-5, first half). The figure labels a map
   relation's edge by its event; `--events`. `test/spec/view.tsv`; the
   reference's `state` paragraph and its transcripts.
2. **The declaration and the structure** (D-1 to D-3, the rest of
   D-5). `machine(spec)`; the five checks; `relations` and generation
   report them; the figure reads the machine. `test/spec/machine.tsv`;
   six codes; the language reference's "Declared relations" grows a
   section, the API reference's `relations` its findings.
3. **Path patterns** (D-4). `never` and `through`, with
   counterexamples. Rows; two codes; reference.
4. **States and records** (D-6). `holds`; `stateof`; its signature in
   `test/spec/signature.tsv`. Rows; reference.
5. **Transitions with data** (D-7). `when` and `set`; the two
   obligations through `subsume`; the report lists each with its
   verdict. Rows; two codes; reference.
6. **Evolution** (D-8). Rows for `breaking` over machines in both
   modes; a how-to section on gating a lifecycle change.
7. **Export** (D-9). The SCXML profile; its loss codes. Rows in
   `test/spec/view.tsv`; reference.
8. **The definition** (D-10), if Q8 rules for it.
9. **The guide.** `docs/how-to/model-a-state-machine.md`, after phase
   3, its every transcript run by the docs gate, beside the file-system
   and microservices guides.

Phases 1 and 2 are independent of each other once phase 0's #816 has
closed; 3 needs 2; 4 and 5 need 2; 6 needs #819; 7 needs 1 and 2.

Out of scope: running a machine, composing machines, nested states,
parallel regions, history, timing, probability, and equivalence up to
renaming. These are for the tools D-9 exports to.

## 10. Decisions for the owner

Each with a recommendation.

- **Q1.** Do the path patterns of D-4, reachability over the finished
  graph judged in the post-unification pass, fall inside G4's option E
  and outside its non-goal on temporal properties? Recommended: yes,
  and G4's boundary text says so.
- **Q2.** One `machine(spec)` declaration, or separate atoms?
  Recommended: one declaration.
- **Q3.** Two patterns, or a CTL subset? Recommended: the two patterns;
  revisit when a third is asked for.
- **Q4.** Does a map relation's edge default to its event label in
  `view state`? Recommended: yes, with `--events relation` for the old
  labels; the goldens move once.
- **Q5.** A record's shape from a generated disjunction, `stateof`, or
  a lookup by its own status? Recommended: `stateof`, which needs no
  ruling on #818.
- **Q6.** Do transitions carry data at all? Recommended: yes, beside
  `next` as D-7 has it, after phases 2 and 3 have shipped.
- **Q7.** Export: SCXML, TLA+, both or neither? Recommended: SCXML
  first.
- **Q8.** A machine in the definition, or rows alone? Recommended: the
  definition, as `Graph.lean`, since the relation verdicts have none
  and a machine adds more of them.
- **Q9.** A design note, or gap document G13 with register rows?
  Recommended: G13 once Q1 to Q3 are ruled, since the plan is several
  phases long.

## 11. Issues this note depends on

| Issue | What it blocks |
|---|---|
| #815 | the edge a cycle finding names; D-3's sites are chosen in the same code |
| #816 | a declaration on the map of states (D-1) |
| #817 | any machine check written under `hide()` |
| #818 | the lookup alternative of D-6 |
| #819 | backward `breaking` over a machine (D-8) |
| #491 | `vet` reporting what generation refuses |
| #748 | sizes and trials beside a relation's members |
| #691 | a spread over states that reads what it supplies |
| #750 | `+` over an address a graph atom governs |
| #777 | whether a relation's range checks or writes its target |
| #457, #327 | the text and site of a refusal inside a call, which the checks' reports reuse |

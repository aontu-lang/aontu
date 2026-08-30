# Order views: drawing the orders the engine already computes

*Design note, 2026-08-30. Companion to [VIEWS.0.md](VIEWS.0.md), which
covers the structural views — matrix, sets, node-link graph, layers —
their renderers, profiles and determinism rules. This note covers the
strand no other configuration language can offer, because drawing it
needs a semantic order over whole documents, a decision procedure for
that order exposed as a verb, and a canonical form under which two
spellings of one meaning are one node. Aontu has all three today. Every
claim marked VERIFIED was run against the built CLIs at 0.53.0 —
`node ts/bin/aontu.js` and a fresh `go build ./cmd/aontu`. This note is
design; status belongs in the
[progress register](../capability-review/progress.md).*

## Problem

Aontu computes lattice facts continuously and reports every one of them
as a line of text about a single pair, or a single path. `subsume`
decides the order between two documents. `why` returns the meet chain
that produced a value. The constraint algebra normalises a residual to
an interval and names both operands when the meet is empty. Nothing
shows the **shape**.

**First failing example, on this repository's own data.**
[`use-cases/04-schema-evolution/`](../../use-cases/04-schema-evolution/)
holds three released versions of a customer profile. The filenames read
as a chain. VERIFIED, all six ordered pairs:

```
$ aontu subsume profile-v2.aon profile-v1.aon   -> subsumes
$ aontu subsume profile-v1.aon profile-v2.aon   -> does_not_subsume
$ aontu subsume profile-v2.aon profile-v3.aon   -> does_not_subsume
$ aontu subsume profile-v3.aon profile-v2.aon   -> does_not_subsume
$ aontu subsume profile-v3.aon profile-v1.aon   -> does_not_subsume
$ aontu subsume profile-v1.aon profile-v3.aon   -> does_not_subsume
```

**The version history is not a chain.** v2 is a true generalisation of
v1; v3 is comparable with nothing. Adding the proposals,
`v2 ⊒ v3-remove-phone` and the rest are `does_not_subsume` with
labelled reasons — `compat_narrowed`, `compat_default_changed`,
`compat_required_added`. The whole poset:

```
graph BT
  v1 --> v2
  v3-remove-phone --> v2
```

with `profile-v3` attached to nothing at all — the structural signature
of a major break, visible at a glance rather than inferred from a
version number. A reader running the verb pair by pair gets six answers
and assembles that in their head. The engine already knows; the tooling
has no way to say it.

**Second: the order is over a set, and there is no n-ary verb.**
`subsume` takes two documents; `breaking` takes one and a repeatable
`--against` and answers a compatibility verdict rather than an order.
The n(n−1) runs, the equivalence classes, the transitive reduction and
the undecided pairs are all the caller's problem, in a shell loop, with
no report contract.

**Third: the verdict is four-valued, so the naive picture lies.**
`SubsumeVerdict` is `subsumes | does_not_subsume | undecided | error`
(`ts/src/subsume.ts`), and `undecided` is not decoration —
`test/spec/subsume.tsv` carries 16 undecided rows across five reason
codes. The module states its own policy in its header: where a rule
cannot decide, the answer folds toward "not subsumed" or "undecided",
the safe directions. A diagram that draws `undecided` as an absent edge
converts a documented, defensible conservative fold into a visible
falsehood.

**Fourth, and it gates everything above:
[BUGS 64](../../use-cases/BUGS.md).** Three of the seven use-case entry
documents do not subsume **themselves** — a referenced, aliased or
recursive spread template folds to `undecided` with `expected` and
`actual` byte-identical, in both ports. A poset over documents that do
not subsume themselves has no edges. That defect was found by this
design and must be fixed before any of it is worth building.

## What already exists

Almost everything, and almost all of it reusable unchanged.

- **The order is a verb, four-valued, with witnesses, in both ports.**
  `subsume(generalSrc, specificSrc, opts)` returns `{verdict, findings}`
  with findings in G2's shape, class `compat`. The CLI exit classes are
  already the ones an n-ary verb wants.
- **`subsumeNode` does not mutate its inputs** — the module header says
  so explicitly, and that is what makes an n-ary poset affordable: one
  evaluation per document, reused across n−1 comparisons, rather than
  2n(n−1) evaluations.
- **Identity is already canonical.** `hcanon`/`canonHash` give every
  document an `aon1-` pin that survives reformatting and moves on a
  change of meaning, byte-identical across ports. That is the node
  identity a document poset needs, with one caveat in the construction
  below.
- **`--at` is on every comparison verb**, through the shared `anchorAt`.
  An n-ary verb needs no new selection mechanism.
- **`--against git#<rev>` already materialises an old tree**, so a poset
  over a file's own history reuses that resolver verbatim.
- **`why` returns the ordered meet chain** with canon, role, site and
  source per conjunct (`WhyRecord` / `WhyConjunct` in
  `ts/src/provenance.ts`).
- **The constraint residual is normalised with typed endpoints** in both
  ports, and `cmpNumeric` is an exact scaled-integer comparison — no
  float division anywhere on the path.

What blocks the capability: there is no n-ary verb; `subsume` returns
`error` with an **empty** findings list (VERIFIED on a missing anchor,
exit 4, no reason given); `WhyConjunct` carries no rank, so a ladder
would have to recover it by counting `*` characters in a canon string;
and the residual's endpoints reach a report only as canon text.

## Prior art

The order-theoretic literature's most useful result here is a negative
one.

**Hasse layout has two dominant families and both are unusable.**
Sugiyama layers the vertices and minimises crossings between adjacent
layers; Freese's *Automated Lattice Drawing* takes height from a rank
function and computes position by a force-based method in 3D. The
recent line — DimDraw, ReDraw, Stratifimal Layout — is force-directed
with dimensional reduction, or an ILP over several readability criteria
at once. Every one is iterative, and **an iterative layout breaks
ADR-001 by construction**: two ports would have to agree on a
floating-point trajectory, and no spec row can pin one.

**Crossing-free is not on offer.** Upward planarity testing is
NP-complete for general digraphs (Garg & Tamassia, *Order* 12, 1995),
polynomial only for single-source or already-embedded cases. Eppstein &
Simons' confluent Hasse diagrams merge edge bundles into shared tracks
instead — a real escape, requiring geometry we are not going to own.

**The one closed-form layout applies to the one view not shipping.**
Attribute-additive line diagrams place a concept at the vector sum of
its intent's attribute vectors, y from the level (Ganter & Wille;
Ganter, JUCS 2004). Deterministic, no solver — exactly what a dual-port
emitter wants, and defined over ∨-irreducible *attributes*, which a
document poset does not have. The inversion is worth stating: the
diagram that looks like it needs a layout engine has a closed form, and
the one that looks trivial does not.

**FCA on configuration is Snelting's**, not the class-hierarchy work:
*Reengineering of Configurations Based on Mathematical Concept
Analysis* (ACM TOSEM 5(2), 1996) and Krone & Snelting (ICSE 1994) take
`#ifdef`-governed source pieces as objects and configuration symbols as
attributes, and read configuration structure and interferences off the
lattice. Aontu's layered documents are the same problem with better
syntax. The lineage — Snelting & Tip (TOPLAS 2000), Godin & Mili,
Al-Msie'deen et al. on feature location — reports the same payoff
consistently: finding anomalies in a structure, not constructing one.

**Set visualisation says do not.** Alsallakh et al., *The
State-of-the-Art of Set Visualization* (CGF 35, 2016), reports the
Euler/Venn family "very limited in scalability and visual accuracy",
and every area-proportional generator (eulerAPE, Edeap) is a
search-based optimiser. The natural Aontu set question — which layer
contributed which keys — has seven-plus layers in
`use-cases/02-deploy-config` alone. VIEWS.0.md answers it with an
intersection matrix instead, which is correct.

**Constraint-domain visualisation is the thinnest literature and so the
cheapest win.** CLPGUI (arXiv:cs/0207048) draws finite domains as bars
shrinking under propagation; for interval constraints the standard
picture is pruning on a number line (Benhamou & Granvilliers,
*Handbook of Constraint Programming* ch. 16). There is no established
idiom for "here is why this meet is **empty**", which is the picture an
Aontu conflict wants, and it needs no layout.

**The comparison that matters.** YAML, JSON, Jsonnet, HCL, Starlark and
Dhall have no semantic order over whole documents, no decision
procedure for one, and no canonical form under which two spellings are
one node. CUE has the lattice semantics and ships none of the three as
a verb. This is the one place where the picture is a picture of
something only this engine computes.

## Design space

| candidate | what the engine computes | verdict |
|---|---|---|
| Subsumption poset over a document set | the whole relation, four-valued, with witnesses and canonical identity | **build** — the headline |
| Meet ladder for one path | the ordered conjunct list, roles, sites, ranks | **build**, as an extract kind |
| Interval intersection and the emptiness witness | the normalised residual, and both operands of a failed meet | **build**, as the one view with geometry |
| Ranked-disjunction configuration space | one arbitrated *trajectory*, not the space | **refuse** |
| Concept lattice (FCA) | the objects; no attributes, no incidence | **research bet**, behind a flag |

**Why the configuration space is refused, and it is not taste.** A
feature model denotes a set of configurations; Aontu denotes that set
plus a preference preorder over it, and no feature-modelling notation
has the second half. The picture would be genuinely novel. It is
refused because **the engine does not compute the set**: disjunction
arms are not reachable as data — there is no arm enumerator in
`funcMap`, and `match` selects one arm rather than enumerating them,
which G9's own worked example records as a loss. What the engine
computes is one trajectory, and that trajectory is the meet ladder,
which we build. Enumerating the space is a new evaluator, exponential
in the number of disjunctions, needing a bound nobody has specified. It
is a capability, not a view.

## The three views

### 1. `aontu order` — the poset over a document set

A verb of its own rather than an extract kind, because it takes a
**set** and performs n(n−1) comparisons, has its own failure modes and
exit classes, and has a useful text output with no diagram in it. It is
the n-ary sibling of `subsume` and `breaking`.

```
aontu order [--at <path>] [--profile values|defaults|gen]
            [--against <file|git#rev>]... [--head <file>]
            [--allow-undecided] [--format text|json|mermaid|dot]
            <file>...
```

Exit classes mirror `subsume`: **0** every pair decided, **1** `--head`
given and some document incomparable with it, **3** some pair
undecided, **4** some document did not stand up or lacks the anchor.
`does_not_subsume` is not a failure — incomparability is a legitimate
fact about a poset, and is what `--head` exists to gate on.

**The construction, five closed-form steps.**

1. **Evaluate each document once**, not per pair. Safe because
   `subsumeNode` does not mutate its inputs. A document that fails
   evaluation becomes a detached node with a finding naming the cause.
2. **Fill the verdict matrix** — n(n−1) comparisons over the evaluated
   trees.
3. **Quotient by mutual subsumption.** Two documents that subsume each
   other are one node. **Mandatory, not an optimisation**: without it
   the measured relation is not antisymmetric and "transitive
   reduction" is undefined on it. The hash is a *sufficient* identity
   and never a necessary one — `a: 1|2` and `a: 2|1` subsume each other
   and hash differently, so a builder keyed on `canonHash` alone draws
   a 2-cycle and calls it a Hasse diagram.
4. **Close, reduce, and check.** Take the transitive closure of the
   quotient, then the cover relation over the *closure*. Reducing the
   raw measurement would be unsound, because the measured relation is a
   conservative under-approximation and an under-approximation of a
   transitive relation need not be transitive. Any pair the closure
   implies but the checker measured as `does_not_subsume` is reported
   as `order_intransitive` rather than absorbed.
5. **Order the output canonically** — class key is the code-point-least
   `aon1-` among its members, classes in `cmpCodePoint` order of that
   key. The result does not depend on the order the files were given.

**Six cases, one legend.**

| case | drawn as |
|---|---|
| `subsumes` both ways | one node, labels joined by ` = ` |
| `subsumes` one way, a cover | solid upward edge |
| `subsumes` one way, not a cover | nothing; implied by transitivity |
| `does_not_subsume` both ways | nothing. Proven incomparable |
| `undecided`, no proven order either way | **dashed** edge, labelled with the `sub_*` code |
| `subsumes` one way, `undecided` the other | the solid edge, plus a finding: the two may be equal and the checker cannot tell |

**The poset is profile-dependent, and that goes in the diagram.**
VERIFIED on `proposals/default-change.aon`, which flips a `*false`
consent default: under `--profile values` it is **one node** with v2;
under `defaults` and `gen` it is incomparable. Three profiles, three
posets over the same files. The profile and the anchor are emitted as a
leading comment (`%%` for Mermaid, `//` for DOT), are in the JSON
report, and are in the golden's filename. A poset without its profile
stated is unreadable.

### 2. The meet ladder

`aontu diagram meet <path> <file>` — hosted by VIEWS.0.md's verb,
reading the same `WhyRecord` that `aontu why` prints. The value at a
path is the meet of its contributions; the ladder is the descent from
`top` through each contribution, one rung per conjunct, carrying its
canon, rank badge, role and `file:row:col`. Where the contributions are
ranked preferences the ladder *is* the arbitration: fewer stars win, so
the rungs read weakest-first and the winner is the last before the
value.

**The rungs must be sorted, and this is where a naive emitter gets it
wrong.** `WhyRecord.conjuncts` is in the order the recorder saw the
meets, which is not rank order — an emitter that trusted it would draw
an arbitration that did not happen. Sort by `(rank descending, file,
row, col)`.

One report field is needed: `WhyConjunct.rank?`, the engine's 0-based
rank, absent for a non-preference. The engine has it
(`PrefVal.rank` / `pref.rank`); recovering it by counting `*`
characters in a canon string is the re-derivation this repository
refuses elsewhere.

### 3. The interval panel

`aontu view bounds <path> <file>`, and `--from-report` for a failure,
because a document whose meet is empty does not evaluate and the
operands exist only in the finding. Hosted by VIEWS.0.md's `view` verb
because it is the only view here that needs geometry, and that verb's
rule — every coordinate an integer function of a canonical sort — is
exactly the rule it needs.

**The axis is ordinal, not metric, and that is a decision.** A metric
axis needs division, division needs floats, and floats are a divergence
site with no cheap pin. What a reader needs is the *order* of the
endpoints and whether the intersection is empty; an ordinal axis gives
both. Endpoints are sorted by `cmpNumeric` and deduplicated; every
coordinate is a sum of products of even constants and small indices,
with no division except by two, of an even constant.

**It refuses what it cannot draw.** `re()` has no number line, so a
pattern finding is named in the caption and drawn as nothing. A panel
that drew a "pattern axis" would be decoration pretending to be
analysis.

## Does a document set induce a concept lattice?

Half of it comes free. `graphOf(root).entities` is a set of objects
with identities — `id()` *is* the object identity. What is missing is
the attributes and the incidence: nothing in either engine produces a
binary attribute. The bridge is **conceptual scaling** (Ganter &
Wille) — nominal on an enum, ordinal on a number, dichotomic on an
optional key — and it is a modelling *act*, not a derivation. That is
the step Snelting had to make for `#ifdef` configuration.

It works. Over the eight `id(svc_*)` entities of
`use-cases/01-service-catalog`, with nominal scaling on owner and
lifecycle, ordinal on tier and replicas, and dichotomic on the
dependency predicates: **46 concepts, 102 cover edges** from 32
attributes. The payoff is real — `tier<=1` and `replicas>=3` are
logically equivalent in that data and label one concept, a correlation
`spec.aon` declares as two independent fields and no verb reports.

And it still does not ship, for four reasons:

1. **Eight services are already past the ceiling.** 46 concepts, where
   Mermaid and DOT stop being readable around 40 nodes. The lattice of
   an eight-node catalogue is denser than the graph it came from.
2. **The growth is measured, and near-quadratic on this data** — mean
   concepts over all object subsets: 2.0, 4.0, 7.4, 12.4, 18.7, 26.4,
   35.5, 46.0. That is the optimistic reading and still fatal:
   extrapolating, 50 services give roughly 1,800 concepts.
3. **The threshold is therefore mandatory**, and its shape is
   determined: not `--min-support` with a guessed default, but
   `--max-nodes` (default 40) with a monotone integer search that
   raises support until the count fits, then reports the support it
   used.
4. **The category difference, which is the actual reason.** Every other
   view here draws something the engine *decided*. The concept lattice
   draws something a scaling and a threshold suggested about a sample.
   With eight objects, `owner=team-payments ⟹ tier<=2` is supported by
   three services and is almost certainly coincidence, and a diagram
   renders it with the same authority as the real equivalence. Aontu's
   claim is that a picture of the model is a picture of something
   checked. This one would not be.

**Verdict: a research bet behind `--experimental`.** If built, three
things are fixed in advance — the scaling is written in Aontu as an
ordinary document vetted against a bundled vocabulary, so the modelling
act is reproducible and diffable; the layout is attribute-additive, the
one place here where a real layout has a closed form; and `--max-nodes`
is not optional. Attribute *exploration* — propose each implication,
accept it as a constraint or refute it with a counterexample — is the
capability that would make FCA more than a poster, and it is a
schema-editing loop with a human in it, not a view. It belongs beside
`aontu set`, not here.

## Determinism and parity

**Exactly one of these views needs geometry.** The poset and the ladder
emit Mermaid or DOT and the consumer lays them out. That is not a
compromise: **the golden is the text, never the picture**. Two ports
emitting identical DOT is a contract; two ports agreeing with
Graphviz's layout is not one.

**Why the poset gets no SVG.** Its y is free — the level function is an
integer function of the cover relation. Its x is the hard part, and
choosing x is choosing a crossing-minimisation strategy, NP-hard even
in the two-layer case and NP-complete to decide whether a crossing-free
upward drawing exists at all. There is no closed form that is also
readable, and the moment we compute x we own that problem forever, in
two ports, under a 100 % coverage floor. What we do emit is a
deterministic hint: DOT `{rank=same; …}` groups from the integer level
function — text, goldenable, improving the picture without owning it.

**Three constraints on the emitter**, so a diagram fits a TSV cell: no
literal tab (indent with spaces), no CR (LF only), and a backslash in
emitted text is doubled in the cell because the escape pass runs first
— the same doubling every `vet` golden already does.

## Boundary: what we will not do

- **No force-directed, Sugiyama, Freese, ILP or dimensional-reduction
  layout.** A refusal on ADR-001 grounds alone, before any argument
  about quality.
- **No promise of a crossing-free drawing.** We promise *upward*, which
  is free from the level function, and treat crossings as the
  consumer's renderer's problem.
- **No SVG for the poset or the ladder.** The bounds panel gets
  geometry because its geometry has a closed form over a canonical
  sort, and for no other reason.
- **No Euler or Venn generation** — every generator is an iterative
  optimiser, and the question Aontu has is above the family's
  scalability ceiling. VIEWS.0.md's intersection matrix answers it.
- **No configuration-space enumeration.** The engine computes one
  trajectory, not the space.
- **No entity/relation graph** — that is VIEWS.0.md's. One caution
  belongs here because it is a lattice fact: `graphOf` on
  `use-cases/12-relations/model.aon` yields 6 edges for 3 logical ones,
  because `feeds` and `fedBy` are declared inverses and both directions
  are written out. Rendering the edge set directly doubles every
  relation with a declared inverse; collapse one edge per `inverse()`
  pair, drawn in the declaring direction.
- **No golden over a rendered picture**, and no metric axis on the
  bounds panel.
- **No attribute exploration**, and no LLM anywhere. The whole claim is
  that the picture is a picture of something the engine decided.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| BUGS 64 makes the poset edgeless on real models — VERIFIED, 3 of 7 use-case entry documents do not subsume themselves, both ports | High | High | Phase 0 is the hash-form short-circuit on the fold path, which is the law `subsume.tsv` already states. Recorded in BUGS.md with three repros whatever else happens |
| A builder keys nodes on `canonHash` and draws a 2-cycle — `a: 1\|2` and `a: 2\|1` subsume each other and hash differently | High | High | The mutual-subsumption quotient is step 3 and is not optional; a spec row pins that case |
| Transitive reduction over an under-approximated relation is unsound | Low | High | Reduce the closure, never the raw measurement, and report disagreement as `order_intransitive` |
| The poset silently means something different under a different profile — VERIFIED on `default-change.aon` | High | High | Profile and anchor in the diagram, the report and the golden filename. A diagram without them is not produced |
| Θ(n²) evaluations make the verb unusable | High | Medium | Evaluate once per document; the licence is `subsume`'s own no-mutation contract |
| `subsume`'s `error` verdict carries no findings — VERIFIED, exit 4, empty list | High | Medium | Two codes naming the document and the cause, added to both verbs |
| The diagram formats depend on G9, which is 0/9 in the register | High | Medium | `order` ships text and JSON first and is useful there; formats land with the renderer |
| The ladder is drawn in record order and claims an arbitration that did not happen | Medium | High | The canonical sort is part of the extractor, not an option; a spec row pins a record whose natural order differs from its rank order |

## Implementation plan

Spec-rows-first; TypeScript canonical, Go to green on identical rows.

**Phase 0 — BUGS 64 and two seams (S).** The hash-form short-circuit on
the fold path; findings on `subsume`'s `error` verdict; a
`subsumeVals(general, specific, opts)` split so an evaluated pair can be
compared without re-loading. *Acceptance:* all seven use-case entry
documents subsume themselves in both ports; the full suite green.

**Phase 1 — `aontu order`, text and JSON (S/M).** The construction
above, the verb, its exit classes and `--head`. No diagram formats. A
new five-column `order` spec mode over fixture directories: a chain, an
antichain, a fork, two mutual-subsumption spellings, an undecided pair,
an unevaluable document, a missing anchor, the three profiles over one
directory, and the same files supplied in two orders.

**Phase 2 — `WhyConjunct.rank` and the ladder extractor (S).** The rank
field in both ports; `meetLadder(record)` as a pure function, exercised
by rows rather than a CLI surface.

**Phase 3 — the bounds accessor and panel extractor (S/M).** A
read-only accessor over the residual the algebra already normalised, so
the panel does not re-parse canon; the panel as integer coordinates.
The phase's assertion is that both ports compute the same integers.

**Phase 4 — the diagram formats (M, gated on VIEWS.0.md's renderer).**
`--format mermaid|dot` on all three, through the shared profiles.

## Open questions

- **Should `order` gate on shape rather than only on `--head`?** "No two
  documents are mutually subsuming" (duplicate proposals) and "the
  poset has one maximum" are each one predicate over the report.
- **Should the undecided edge carry a direction at all?** It is drawn in
  the queried direction with the reason code, and an arrow asserts a
  direction the checker declined to give. The alternative is undirected,
  which most renderers make awkward.
- **Should the poset draw the `does_not_subsume` witness?** Every
  non-edge has a finding with a path and both canons, and a reviewer
  wants to know *why* two proposals are incomparable. Drawing it doubles
  the edge count; leaving it in the report makes the picture a lossy
  view of the report.
- **Is the regex fold worth attacking now?** Regex containment is
  decidable for the portable subset `re()` restricts itself to, and the
  fold currently shows more incomparability than the semantics warrant.
  Improving it has a visible payoff in this artifact that it does not
  have in a text report — the poset gets shorter and taller and starts
  telling the truth. That is a reason to prioritise it that did not
  exist before.

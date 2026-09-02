# Model views — diagrams from an evaluated document

*Status: BUILT (2026-09-02), as `aontu view` in both ports
(`ts/src/view.ts`, `go/view.go`, pinned by `test/spec/view.tsv`): the
tree, matrix, graph (mermaid, dot, er), sets and layers kinds, the
loss report, `--out`/`--check`/`--strict`/`--max-rows`, plus a `layer`
kind (the architecture bands) and the two order views of
VIEWS-ORDER.0.md. The view document (`--views`), `std/view`, the
`layer` figure's `--edges`, the `edges_in_disjunct` count and
`--style` ([Styling](#7-styling), which amends the colour boundary)
and the `doc` kind ([8. The document tree](#8-the-document-tree))
landed 2026-09-02, and SVG before them. Not built: the figure JSON projection
(the `--format json` report carries the drawn text, not the figure's
primitives) and VIEWS-ORDER's interval panel; `--loose` was dropped, since a path-native
graph (ADR-014) has no loose edge. Where the built verb departs from
the text below, the verb and [docs/reference-api.md](../reference-api.md)
are the record. Phase 0 landed with it; see use-cases/BUGS.md 70 and
71 for the two engine divergences it exposed. Date: 2026-08-30. This note
is the G10 candidate for the [capability
review](../capability-review/index.md), and it reverses a refusal
recorded there — [G7](../capability-review/g7-machine-access.md) ruled
out view and diagram generation in v1, on the ground that
model-once-render-many is "an exporter product". What has changed since
is named in [Problem](#problem). The note proposes a `view` verb that
draws four figures from an evaluated model: a dependency matrix, a
node-link graph in Mermaid and Graphviz DOT, a set-intersection panel,
and a document-layer panel. It reuses [G9](../capability-review/g9-transformation.md)'s
renderer DISCIPLINE and depends on none of G9's unbuilt code. Every
claim marked VERIFIED was run against the built TypeScript CLI at
0.53.0 during drafting; the counts and the emitted bytes in [Worked
examples](#worked-examples) came out of a reference implementation of
the extractors and renderers specified here, run against the real
documents under [`use-cases/`](../../use-cases/).*

> **Companion.** The order views — the subsumption poset, the meet
> ladder and the interval panel — are
> [VIEWS-ORDER.0.md](VIEWS-ORDER.0.md). They are separated because
> they draw the ORDERS the engine computes rather than the structures
> it holds, and because one of them is gated on a defect this design
> work found ([BUGS 64](../../use-cases/BUGS.md)): three of the seven
> use-case entry documents do not subsume themselves.

## Problem

A model that is ground truth for a system, and cannot show the system's
shape, is ground truth nobody looks at.

**First failing example, from a real document.**
[`use-cases/01-service-catalog/`](../../use-cases/01-service-catalog/)
holds eight services declared across two files —
[`catalog.aon`](../../use-cases/01-service-catalog/catalog.aon) (what
each service IS) and
[`deploy.aon`](../../use-cases/01-service-catalog/deploy.aon) (what
each cluster RUNS) — joined by nothing but `id(svc_*)`. The dependency
relation is declared once, at its field:

```aon
dependsOn?: rel($.std.Service) & re("^svc_") & acyclic() & inverse(dependedOnBy)
```

Ask the tree what that graph looks like and this is the whole answer:

```
$ aontu relations use-cases/01-service-catalog/system.aon
verdict: pass
```

VERIFIED. Eighteen written links, nine distinct dependency facts, three
ownership teams, two tiers, a declared acyclicity that holds and a
hand-maintained inverse that is complete — and the verb prints one
word, because a passing verdict has no findings and findings are all it
prints. `aontu reaches` answers one pair at a time. `aontu get` prints
JSON. Nothing in the repository shows the eight services and the nine
arrows, and the use case's own README describes a layering
(leaves, then middle, then `payments`, then `gateway`) that no command
derives and no file records.

**Second, and this is why the refusal is being reopened.** G7 declined
this capability with a reason that was true when it was written
([`g7-machine-access.md`](../capability-review/g7-machine-access.md),
Boundary):

> **No view/diagram generation in v1.** Model-once-render-many is real
> (Structurizr) but is an exporter product; the projection ladder is
> G7's contribution to it.

Four things landed after that sentence. G4 phase 3 shipped `graphOf`
in both ports with determinism asserted as a property rather than
claimed —
[`test/spec/graph.tsv`](../../test/spec/graph.tsv)'s header says both
runners "re-derive it on a fresh engine and require the same bytes".
RELATIONS P0–P2 replaced the inferred predicate and the magic
`relations:` key with `rel(t)` at the field and the `acyclic()` /
`inverse(n)` atoms, so the relation metamodel is now a declared thing
an extractor can read. G7 itself shipped `Provenance`, which records a
contribution list for EVERY path and not only the one `why` asks
about. And G9 wrote down a renderer discipline — pure total fold,
profiles that are data only, no formatter subprocess, escape tables
keyed by decimal code point — that this capability can inherit without
inheriting G9's unbuilt machinery. The exporter-product objection
stands against building a Structurizr; it does not stand against
drawing the graph the engine already computes.

**Third, and it is a soundness bug rather than a missing feature: the
first diagram would be a lie.** `graphOf`'s `visit()` descends `isMap`,
`isList` and the `isGraphAtom.held` transparency arm, and nothing else.
A relation field wrapped in a residual CONJUNCTION mints no edges.
[`use-cases/05-rbac-policy/roles.aon`](../../use-cases/05-rbac-policy/roles.aon)
writes exactly that shape:

```aon
grants: unique() & [&: refer() & string]
```

VERIFIED against the built 0.53.0 on
[`example.aon`](../../use-cases/05-rbac-policy/example.aon): the graph
has **13 entities and 3 edges**, and all three are `role` links written
outside every entity. Every one of the nine grants the document states
literally is invisible, and the consequence reaches a shipped verb:

```
$ aontu reaches owner admin_all use-cases/05-rbac-policy/example.aon
verdict: unreachable

owner does not reach admin_all
$ echo $?
1
```

`roles.aon` says `owner: { ... grants: [admin_all] }` on the line above.
A wrong JSON field is a bug; a wrong picture is a bug that everyone
believes, so this is [Phase 0](#phase-0--the-graphof-conjunct-blind-spot-s)
and it ships whether or not a diagram is ever drawn.

**Fourth, the failure mode that kills generated diagrams is not
ugliness, it is drift.** Forward and Lethbridge (MiSE 2008) surveyed
software professionals and found that the practitioners who model most
are the ones most likely to report their models going stale; Petre
(ICSE 2013) interviewed fifty professional developers and found the
large majority using UML not at all, or selectively and informally.
A diagram that lives in a README and is redrawn when someone remembers
is a document that disagrees with the model. The structural answer
already exists in this repository in two places — `trim --check` and
`mod verify` — and a diagram capability without it is a worse version
of drawing by hand.

For the agent mission these four are one problem. An agent asked "what
breaks if the ledger goes" can call `reaches` once per candidate, or
read a matrix column. An agent asked "which of these seven documents
decides the replica count" has no command at all today, and the answer
is recorded inside `Provenance` on every run.

## What the model already contains that can be drawn

More than it looks like, and none of it needs new engine work.

- **The entity graph, already deterministic and already exported.**
  `graphOf` (ts/src/graph.ts, `go/graph.go`) returns an entity index —
  id to the tree paths that hold it — and an edge set of `{from, key,
  to, at}`, ids and paths in `cmpCodePoint` order, edges sorted by
  written position. It is computed once per unify and hung on the root
  (`out.graph = graphOf(out)` in ts/src/aontu.ts), and it is one of the
  26 symbols the package index exports. VERIFIED on the three
  relation-bearing use cases: `01-service-catalog/system.aon` gives 8
  entities and 36 edges over 18 distinct `(from, key, to)` triples;
  `12-relations/model.aon` gives 4 entities and 6 edges over 6 distinct
  triples; `05-rbac-policy/example.aon` gives 13 entities and 3 edges,
  which is the defect above.

- **`Edge.at`, the source position of every link**, as a `$.dotted`
  path. Its own comment says why it is there: "so a report can point at
  it". No competing diagram tool has this, because no competing diagram
  tool built the graph out of a document with positions.

- **The relation metamodel.** `ctx._reldecls` (ts/src/ctx.ts) is a
  `Map<string, {acyclic?, inverses}>` populated by
  `GraphAtomVal.register` during unification. VERIFIED on
  `01-service-catalog/system.aon`:
  `[["dependsOn",{"acyclic":true,"inv":["dependedOnBy"]}]]`. This is
  what lets a figure suppress the hand-written mirror half of a
  relation instead of drawing every dependency twice, and what lets a
  matrix mark an edge whose declared inverse is missing.

- **Whole-document provenance.** `Provenance` (ts/src/provenance.ts)
  holds `paths: Map<string, PathRecord>` — a contribution list for
  every path the fixpoint met at, each contribution carrying its
  canon, its role (`literal` / `spread` / `ref` / `pref`) and its
  `file:row:col`. `why` narrows that to one path and prints it; the
  rest of the map is already computed and thrown away. VERIFIED on
  `02-deploy-config/stack.aon`: one instrumented run records **338
  paths** across **7 documents**.

- **The generated values**, for labels, grouping and set membership.
  `generate()` is what says a service's `owner` is `"team-payments"`
  and a role's `grants` is `["admin_all"]`.

- **The report shape.** `SchemaLoss` / `SchemaVerdict` /
  `SchemaReport` (ts/src/jsonschema.ts) is the established
  "the artifact ships, and what could not be carried is reported"
  contract: a `{path, construct, reason}` triple, a three-valued
  verdict, and `--strict` turning the report into a refusal. A figure
  is far lossier than a JSON Schema and must not invent a second shape.

- **The slice.** `--at <path>` and `anchorAt` already exist on `vet`,
  `jsonschema`, `diff` and `breaking`.

- **One map-key order.** `cmpCodePoint` (ts/src/keyorder.ts) is the
  single comparator the canon and the hash already share.

- **The bundled-vocabulary mechanism.** ts/src/std.ts and `go/std.go`
  carry `std/system` as the same bytes, pinned by
  `test/spec/std-system.tsv`'s canon and hash rows.

What is NOT there, and is not being added: any layout algorithm, any
coordinate, any text measurement, any colour model, and any `render`
verb — G9's `render` is designed and unbuilt, and
[`progress.md`](../capability-review/progress.md) records all nine of
its phases as NOT STARTED.

## Prior art

The field divides into three bodies of work that rarely cite each
other: the software-diagram tradition, the text-diagram tooling, and
the information-visualisation literature. The first is what everyone
asks for, the second is what everyone renders with, and the third is
the only one with experiments in it.

### The software-diagram tradition, and its measured record

**UML** (Booch, Rumbaugh and Jacobson, 1999; OMG 2.5.1, 2017) is the
reference point and the cautionary one. Petre's ICSE 2013 interview
study of fifty professional developers found the majority using UML
not at all or selectively and informally, with the class diagram the
one survivor and round-trip tooling widely abandoned. Forward and
Lethbridge (MiSE 2008) measured the mechanism: models are valued for
communication and abandoned for maintenance, and the heaviest modellers
report the most drift. Neither result says diagrams are worthless; both
say that a diagram maintained BESIDE the source decays, which is an
argument for derivation and against authoring.

**C4** (Simon Brown, 2011 onward) is the practitioner's correction:
four nested levels — system context, container, component, code — with
the explicit advice to stop at level three. Its contribution to this
design is not a notation but a ruling: the useful lever is choosing the
level of abstraction, which for an Aontu model is `--at` plus a
grouping field, not a new node vocabulary.

**Structurizr** (the DSL and the workspace format) is the closest
working analogue to what this note proposes: one model, several view
definitions, many exporters — and its exporters already emit Mermaid
and DOT. It is also the reason G7 refused: it is a product, its
positions live outside the DSL in a workspace JSON, and adopting it
means adopting a fourth ecosystem. What survives is its shape:
**views are a projection of one model, declared as data**.

**ArchiMate** (The Open Group) and **SysML v2** (OMG, whose textual
notation carries a normative grammar) are both derivable from an Aontu
model in principle and both are vocabulary-import problems rather than
drawing problems: the work is declaring which of sixty-odd element
types each entity is, for the benefit of an existing enterprise-
architecture or systems-engineering practice. Neither is a diagram
capability. SysML v2's textual notation, if it is ever wanted, is a G9
language profile beside TypeScript and Go.

**Kruchten's 4+1** (IEEE Software, 1995) is worth citing for one idea
this design uses directly: the same system deserves several
simultaneous views, and no single view is the architecture.
`01-service-catalog` already ships two views of eight entities — the
catalog tree and the deploy tree — joined only by identity.

### The text-diagram tooling, and where determinism dies

**Graphviz** (Gansner and North, *Software: Practice and Experience*
30(11), 2000; the layered algorithm in Gansner, Koutsofios, North and
Vo, IEEE TSE 19(3), 1993, after Sugiyama, Tagawa and Toda, IEEE Trans.
SMC 11(2), 1981) is the oldest and the most honest: a text language
whose semantics is a graph, with layout as a separate program. `dot`
on a pinned binary with byte-identical input is reproducible in
practice; the widely reported "graphviz non-determinism" cases are
producer-ordering bugs upstream of it, which is a class this design
eliminates by construction because `graphOf` sorts. Its physical-model
engines (`neato`, `fdp`, `sfdp`) are a different matter — random
initial placement, an explicit `start=` seed needed for
reproducibility — and are refused.

**Mermaid** renders natively in GitHub Markdown, issues and pull
requests (since early 2022), in every major static-site generator, and
in LLM surfaces. It carries no coordinates at all, so emission is
layout-free and the entire cross-port obligation is byte equality of
text. It also has the most fragile grammar of the family, which is a
reason to implement it first rather than last: it forces the escape
layer to be real and spec-pinned from the first commit.

**PlantUML** puts layout at generation time in one of three mutually
disagreeing engines and carries the heaviest reader toolchain of the
text family. Its bundled Smetana engine is the single most useful
counter-example in this whole area: a deliberate C-to-Java port of
Graphviz `dot` aimed at output parity, which does not produce
identical geometry, to the point that the project documents the
difference as a user-visible choice. **A faithful port of a layout
algorithm is not automatically identical output.** That is the
strongest available argument for a design with no layout algorithm in
it, and it comes from a project that tried.

**D2** (Terrastruct) computes layout at generation time in Go, through
ports of dagre and ELK, and its own release notes warn that layout-
engine updates move node coordinates, edge routes and component
packing in existing diagrams. **Kroki** is a rendering service, which
is a network dependency. **Excalidraw** and **tldraw** store
coordinates plus per-element randomised fields (`seed`, `versionNonce`)
and, for tldraw, on-load schema migrations, so byte-identical
round-trip is not a property those formats offer.

**elkrs** is the one project that achieved bit-identical cross-language
layout — 201 byte-identical golden cases against the ELK oracle — and
its residual divergence is the instructive part: roughly 7 % of radial
tree layouts differ by about one ULP, from trigonometric rounding.
Bit-identical layout across two languages is achievable and costs
exactly what this repository would refuse to pay.

### The information-visualisation literature

This is the body of work the owner asked for, and it is discriminating
about which of its techniques survive contact with ADR-001.

**The matrix.** Bertin's *Sémiologie graphique* (1967) introduced the
reorderable matrix, whose whole claim is that the ORDER carries the
information. Ghoniem, Fekete and Castagliola (IEEE InfoVis 2004,
extended in *Information Visualization* 4(2), 2005) ran the controlled
comparison: above roughly twenty vertices, and as density rises,
matrices beat node-link diagrams on most low-level readability tasks —
with path finding the clear exception, where node-link wins. Keller,
Eckert and Clarkson (*Information Visualization* 5(1), 2006) replicated
the connectivity result on engineering models. Okoe, Jianu and
Kobourov (Graph Drawing 2017) complicated it again, finding node-link
competitive on more tasks than the 2004 result implied. The settled
reading is not "matrices win" but "matrices and node-link are good at
different questions, and path finding is node-link's", which is why
this design ships both and points `reaches` at the third case.

**The design structure matrix.** Steward (IEEE Trans. Engineering
Management, 1981) introduced the DSM; Baldwin and Clark (*Design
Rules*, MIT Press, 2000) made design rules the unit of modularity;
Sangal, Jordan, Sinha and Jackson (OOPSLA 2005) applied it to software
architecture and — the part that matters here — put a RULE LANGUAGE on
top of the extracted matrix, so a forbidden dependency is a marked
cell. MacCormack, Rusnak and Baldwin (*Management Science* 52(7), 2006)
used the same instrument empirically on open-source and proprietary
codebases. Every one of those systems had to invent its rule language
because the matrix was extracted from code that had none. Aontu already
ships `rel()`, `acyclic()`, `inverse()`, `must()` and `reaches`, in the
same document as the model. **The DSM is the one classical software-
architecture instrument whose missing half this repository already
has.**

**Reordering, and why we do not do it.** Behrisch, Bach, Henry Riche,
Schreck and Fekete (*Computer Graphics Forum* 35(3), 2016) survey the
matrix-reordering families — barycentre, optimal leaf ordering,
spectral, bandwidth reduction; Liiv (*Statistical Analysis and Data
Mining* 3(2), 2010) gives the historical account of seriation. All of
them are float objectives with arbitrary tie-breaking, which is two
ports and a 100 % coverage floor over a heuristic. The one ordering
this design does adopt is not from that family: a canonical topological
sort is exact, integer, terminating, and carries a proof obligation
(see [Determinism](#determinism-and-parity)).

**Sets.** Alsallakh, Micallef, Aigner, Hauser, Miksch and Rodgers
(*Computer Graphics Forum* 35(1), 2016) survey set visualisation and
establish the ceiling that matters: Euler and Venn constructions stop
being comprehensible past about six sets with varied overlaps, and
generating one is a search-based optimiser. Lex, Gehlenborg, Strobelt,
Vuillemot and Pfister (IEEE TVCG 20(12), 2014) answered it with
**UpSet**, which replaces the region-packing problem with a sorted dot
matrix and two bar charts — a sort and no layout. It took the InfoVis
ten-year test-of-time award in 2024. For a constraint document this is
the highest-value borrowing in the whole survey, because the questions
a policy model poses are set questions: which permission is granted by
nothing, which two roles are indistinguishable, which layer decides
what.

**Node-link readability.** Purchase (Graph Drawing 1997) established
that edge crossings dominate human graph-reading performance, above
every other aesthetic tested. Minimising them is NP-hard (Garey and
Johnson, *SIAM J. Algebraic Discrete Methods* 4(3), 1983; the two-layer
case in Eades and Wormald, *Algorithmica* 11(4), 1994). The correct
response for a tool that cannot run a heuristic is to COUNT crossings
and offer exact data-side reductions, not to pretend.

**Bundling and arcs.** Holten (IEEE TVCG 12(5), 2006) introduced
hierarchical edge bundling, whose data model — a containment hierarchy
plus a non-hierarchical adjacency over its leaves — is a literal
description of an Aontu document with entities. Wattenberg (IEEE
InfoVis 2002) introduced arc diagrams, which are node-link drawings
with the node order as the only free parameter, and are therefore the
one node-link form that survives an integer-geometry rule. Both are
attractive and both are declined here, for reasons given in
[Boundary](#boundary-what-we-will-not-do): Holten's technique has no
controlled evaluation, and Wallinger, Archambault, Auber, Nöllenburg
and Peltonen (IEEE TVCG 28(1), 2022) establish that bundled edges
suggest adjacencies that do not exist — which is the failure mode this
project exists to refuse.

**Hierarchy.** Kruskal and Landwehr (*The American Statistician* 37(2),
1983) introduced the icicle plot; Barlow and Neville (IEEE InfoVis
2001) measured it against treemaps and found it better for structural
tasks. An icicle over the path tree is buildable and cheap. It is
declined because `aontu get --keys` and `aontu jsonschema` already
answer the questions it would answer.

**Focus and simplification.** Furnas (CHI 1986) gave the generalised
fisheye view, whose degree-of-interest function is, for an unweighted
graph, an exact breadth-first filter. Dunne and Shneiderman (CHI 2013)
gave motif simplification with fan, connector and clique glyphs; the
first two have exact canonical detection (a pendant-leaf group; nodes
with identical sorted neighbourhoods) and the third does not, because
maximum clique is NP-hard. These are the honest scale levers for a
node-link view and they are data-side, not layout-side.

**Grammars of graphics.** Wilkinson (*The Grammar of Graphics*, 1999),
Bostock, Ogievetsky and Heer (IEEE TVCG 17(12), 2011) and Satyanarayan,
Moritz, Wongsuphasawat and Heer (IEEE TVCG 23(1), 2017, Vega-Lite) are
the strongest deferred candidates in this survey. Vega-Lite in
particular is layout-free in the same sense Mermaid is — positions come
from declared scales — its escaping is JSON-trivial, and it is the only
target whose artifact pins its own dialect through `$schema`. It is
declined for v1 because it changes what the capability IS: "project the
model through a grammar of graphics" is a different product from "draw
the model", and every view it unlocks needs the canonical ordering pass
this design deliberately restricts to one exact algorithm.

**Lattices, which is what Aontu actually is.** Ganter and Wille
(*Formal Concept Analysis*, Springer 1999) is the closest theoretical
neighbour: a formal context of objects and attributes induces a
concept lattice, drawn as a Hasse diagram, and Aontu's meet is a
lattice meet. This is the most tempting experimental view in the whole
survey and it is declined, with a measurement rather than a wave.
VERIFIED, on the real corpus: the RBAC roles-by-grants context (4
objects, 6 attributes) has **6 formal concepts**; the service catalog's
entity-position-by-scalar-field context (16 objects, 30 attributes) has
**21 formal concepts**. So the count is small on this corpus and the
usual exponential objection does not apply here. The reason to decline
is the drawing: a Hasse diagram of 21 concepts needs a LAYERED LAYOUT
with crossing minimisation, which is the geometry this design refuses,
and the same information is more legible as the set panel that
[`sets`](#worked-example-3--sets-over-the-rbac-grants-lex-et-al-2014)
already emits.

**Constraint domains.** Fages, Soliman and Coolen (*Constraints* 9(4),
2004; CLPGUI) draw variable domains as bars that shrink under
propagation. This is the nearest thing in the literature to drawing a
meet, and Aontu could draw it EXACTLY rather than illustratively,
because the meet of two intervals is their intersection and emptiness
is decided eagerly. It is declined for v1 on a measurement, in
[Boundary](#boundary-what-we-will-not-do).

**The state of the evidence.** Merino, Ghafari, Anslow and Nierstrasz
(*Journal of Systems and Software* 144, 2018) reviewed 387 software-
visualisation papers and found the majority of proposed approaches
lacking strong evaluation. Of everything adopted below, the
matrix-versus-node-link comparison and the crossings result have real
experiments behind them, and the first was complicated by a
replication. The DSM's design-rule overlay and UpSet's application to a
constraint document are argued here, not measured.

## Design space

**A. Do nothing; document `graphOf` and let hosts draw.** Near-zero
cost, and it is what people will do anyway. Rejected as an end state
for three reasons. `graphOf` is exported in TypeScript and `GraphOf` in
Go, but the relation metamodel (`ctx._reldecls`), reachability
(`reachCheck`) and whole-document provenance (`Provenance`) are NOT in
the package index — VERIFIED, the index exports 26 symbols and
`graphOf` and `relationCheck` are the only graph-side two. Nothing
checks the derivation, so every host reinvents deduplication and
inverse suppression, wrongly. And there is no staleness gate, which is
the failure mode that actually matters. Kept as a supported form.

**B. Ride G9's renderer.** The transformation capability designs an
output vocabulary, a `render(value, profile)` fold and a manifest, and
a diagram is arguably a G9 artifact whose target language is Mermaid.
Rejected as a DEPENDENCY and adopted as a DISCIPLINE. All nine G9
phases are NOT STARTED; its Phase 4 (the renderer core) is sized M and
its rule layer was returned FATAL by adversarial review for a reason
that is a property of the language rather than of the design. Routing
diagrams through it buys a queue. What is inherited verbatim is
G9's set of rules, listed in
[How this reuses G9](#how-this-reuses-g9-rather-than-duplicating-it).

**C. Node-link only, layout-free text targets.** Emit Mermaid and DOT
from `graphOf`, no geometry, no coordinates, `--check` as the gate.
This is the smallest useful thing and it is most of what people ask
for. Rejected as the WHOLE design, because it declines the brief: a
node-link drawing is the most conventional form there is, the
literature's own answer above twenty vertices is the matrix, and the
two questions an Aontu model can answer that nothing else can — which
permission is granted by nothing, which document decides this value —
are not node-link questions.

**D. Integer-geometry ordered views.** Admit only layouts whose every
coordinate is an integer function of a canonical sort, and ship the
whole orderable family: matrix, arc, bundle, icicle, UpSet, interval,
Hasse, Marey, in text and SVG. The admission rule is right and is
adopted. The scope is not: three of its eight kinds have no
specifiable data source in the proposed CLI, one is blocked on engine
work its own worked example assumes, and SVG in the second phase puts
a geometry surface into the suite before a single text golden exists.

**E. What this note proposes.** D's admission rule, C's targets, and
four kinds — the three that reproduce and find things, plus the one
that costs an extractor on a renderer already built. Stated as a rule:

> **Every emitted coordinate is a non-negative decimal integer, and
> v1 emits none.** No transcendental function, no polar coordinate, no
> float, no iteration to a fixpoint, no randomness, no seed.

The rule's job in v1 is not to be exercised — the four kinds emit
character cells and node-link source, and neither has a coordinate. Its
job is to be DECLARED IN ADVANCE, so that the first proposal to add a
force-directed layout or a radial bundle is answered by a written rule
rather than by a taste argument eighteen months later. It also selects
the extension set honestly: what survives it is the orderable family
(matrix, arc, icicle, UpSet, interval, Marey), and what does not is
every radial, force-directed and packed form. That is a real
foreclosure and it belongs in an ADR (see [Open
questions](#open-questions)).

**F. A view DSL in the document.** A stylesheet language with node
shapes, colours and edge styles. Rejected on the same ground G8 and G9
refuse a template language: it puts presentation in the model, it
grows until it is a badly typed programming language, and it makes the
figure a thing to maintain rather than a thing to derive. What a view
document may declare is WHICH PROJECTION, never how it looks.

### Three specialist designs, and where they disagree

Three designs were drafted in parallel and they disagree on six points.
Each is resolved here, with the resolution stated rather than blended.

**Disagreement 1 — geometry: none, or integers?** One design ruled
"emit diagram source, never diagram pixels"; another ruled "every
coordinate is an integer". **The integer rule wins, and v1 emits no
coordinates.** "Never pixels" is too strong: it forecloses the text
matrix, which is character-cell geometry with pitch 1, and the text
matrix is the literature's own answer. "Integers, and SVG in phase 2"
is too fast: it commits a geometry surface to the shared suite before
one text golden exists. The rule is adopted as the admission test and
its first exercise is deferred.

**Disagreement 2 — the intermediate form: nodes/edges/groups, or
seq/nest/incidence/span?** **The four-primitive decomposition wins, and
ships as three.** A matrix is not nodes and edges; forcing it into that
shape means two renderers with nothing in common. `seq` (a total order
over items), `nest` (a containment tree over them) and `incidence` (a
labelled relation between them) carry all four v1 kinds. `span` — an
interval on a shared axis — is not built, because its only consumer was
the interval panel and the interval panel is cut.

**Disagreement 3 — is the figure a published vocabulary?** One design
made `std/diagram` a bundled schema in Phase 1; another kept the plot
document internal and said so in its own open questions. **Internal in
v1, published later, and the construction is now settled by
measurement.** The obvious spelling — a `type()`-marked anchor, copying
`std/code`'s arrangement — makes the figure INVISIBLE to the thing that
has to read it. VERIFIED, both spellings, on a two-file reproducer:

```
# voc.aon:  %Node: close({id: string, label: string})
#           plot: type(close({nodes: [&: %Node]}))
# fig.aon:  @"./voc.aon"
#           plot: {nodes: [{id: "a", label: "A"}]}

$ aontu fig.aon                 -> {}
$ aontu get '$.plot' fig.aon    -> null
$ aontu get '$.plot' -c fig.aon -> {"nodes":[&:$.%Node,{"id":"a","label":"A"}]}
```

The `type()` mark affects `gen` and not canon, so a marked figure
generates as nothing and `get` answers `null` with exit 0. Dropping the
mark makes the vocabulary POLLUTE — VERIFIED, a document that merely
includes the unmarked version generates `{"my":1,"plot":{"nodes":[]}}`.
The construction that works is neither: **an alias-only vocabulary**,
where every shape is a `%Name` and the anchor is the author's own key.
VERIFIED:

```
# voc3.aon: %Node: close({id: string, label: string})
#           %Plot: close({nodes: [&: %Node]})
# user.aon: @"./voc3.aon"
#           my: 1
#           plot: %Plot & {nodes: [{id: "a", label: "A"}]}

$ aontu user.aon -> {"my":1,"plot":{"nodes":[{"id":"a","label":"A"}]}}
```

No pollution, full generation, and the check still runs by unification.
This is a departure from `std/code`'s own arrangement and the reason is
that a code IR is walked by a renderer inside the process, where a
figure has to be readable back out with `get` and `--format json`. It
is recorded here because a future `std/view` must be built this way,
and because anyone who wants to read a `std/code` result out of a
document will hit the same `null`.

**Disagreement 4 — how many kinds?** Between them the three designs
proposed twelve. **Four ship**, and the cuts are made on evidence
rather than taste; the refusals are in
[Boundary](#boundary-what-we-will-not-do) with the measurement that
decided each.

**Disagreement 5 — do Mermaid and DOT count as checked output?** One
design made them the primary target; another shipped them marked
`profile_unchecked` and refused them under `--check`. **The marking is
wrong and is dropped.** `--check` asserts BYTES, for every profile.
Nothing asserts PIXELS, for any profile — an SVG is rendered by a
browser whose text shaping and font fallback this repository does not
control, exactly as a Mermaid file is rendered by whatever dagre
version GitHub has pinned. Treating one as checked and the other as not
draws the line in the wrong place. The line is drawn once, in
[Determinism](#determinism-and-parity): **you can pin the diagram
source; you cannot pin the picture.**

**Disagreement 6 — flags or a document?** One design put the projection
in fourteen CLI flags while arguing that the figure should be a
checkable document; another added a manifest on top of twenty. **A view
document is the recommended form and a small flag set stays for one-off
use.** A projection that must survive in CI belongs in a file that can
be reviewed, diffed, hashed and vetted, which is the argument the same
designs make for the figure and then deny to the projection.

## Proposed design

Four parts, in dependency order.

```
  model.aon
    -- an EXTRACTOR (graphOf / generate / Provenance) -->
  a FIGURE            (seq + nest + incidence + loss)
    -- a RENDERER driven by a data PROFILE -->
  bytes + a loss report
    -- --out / --check -->
  a file in the tree that CI proves is current
```

### 1. The figure — three primitives

The figure is the one intermediate every kind produces and every
renderer consumes. In v1 it is an internal TypeScript/Go type with a
JSON projection (`--format json`), not a bundled vocabulary; see
[Open questions](#open-questions) for the promotion.

```
Figure = {
  kind:  'matrix' | 'graph' | 'sets' | 'layers'
  seq:   Item[]        // a TOTAL ORDER over the items, already sorted
  nest:  Group[]       // containment over seq, empty when ungrouped
  inc:   Cell[]        // a labelled relation over seq (or seq x cols)
  cols:  Item[]        // present only when inc is not square (sets, layers)
  loss:  Loss[]        // {code, count, detail?}, in code order
  note:  string[]      // emitted as target comments, never as art
}

Item  = { id: string, label: string, at: string[], group?: string }
Group = { id: string, label: string, members: string[] }
Cell  = { row: string, col: string, key: string, state: CellState, at: string[] }

CellState = 'direct' | 'closure' | 'unmirrored' | 'absent'
```

Everything ordered is a LIST, sorted once by the extractor on a total
key. The renderer never sorts, never iterates a map, and never looks at
a value that is not in the figure.

`at` — the `$.dotted` positions a node or cell was written at — rides
every item and every cell. It costs nothing, it is the thing no
competing tool has, and it is what makes a clickable diagram cheap
later.

### 2. The extractors

Four, all engine code in both ports, all consuming structures that
already exist.

**`matrix`** reads `graphOf`, deduplicates to distinct `(from, key, to)`
triples keeping the `at` list, restricts to one relation, computes the
order (`canon` or `partition`), computes the transitive closure when
asked, and marks each cell `direct`, `closure` or `unmirrored`. The
`unmirrored` mark comes from `ctx._reldecls`: an edge under a predicate
that declares `inverse(n)` whose mirror is absent from the full edge
set.

**`graph`** reads the same deduplicated edge set, suppresses the
declared inverse half so a hand-maintained mirror does not double every
arrow, and joins `generate()` for `--group-by` and `--label`. Edges
whose `from` is `''` — a link written outside every entity — are
reported as `loose_edge` with their paths, and drawn as an edge from a
synthetic node named by the nearest identified ancestor path when
`--loose keep` is passed. The default is to drop them, and the report
says how many.

**`sets`** reads `generate()`: `--sets <path>` names a map whose keys
are the sets, `--member <key>` names the field holding each set's
members, and `--universe <path>` optionally names the full element
domain so that the covered-by-nothing column exists. Elements are
grouped by their exact membership signature; columns are ordered by
degree descending, then cardinality descending, then signature in
`cmpCodePoint` order.

**`layers`** runs one instrumented unification and reads
`Provenance.paths`, mapping each path to the set of FILES that
contributed to it. Sets are documents, elements are paths, and the
renderer is `sets`'s, unchanged. This is the kind that costs an
extractor and no renderer.

### 3. The renderers and the profiles

Three renderers, each a pure total fold from a figure plus a data
profile to a byte string. Each never touches the Val tree, never reads
or writes a file, never shells out, never sorts and never iterates a
map. This is G9's contract, adopted verbatim.

| profile | kinds | what it is |
|---|---|---|
| `text` | matrix, sets, layers | fixed-pitch character cells, LF only, ASCII by default |
| `mermaid` | graph | `flowchart` with `subgraph` groups |
| `dot` | graph | `digraph` with `cluster_` subgraphs |
| `json` | all four | the figure itself |

**Each kind declares the profiles it can render into, and the first is
its default.** There is no global default profile, because there is no
sensible text form of a node-link drawing and no sensible Mermaid form
of a matrix. Asking for a profile a kind does not declare is a usage
error, not a fallback.

**A profile is data and only data**, by G9's test: a field belongs in
the profile only if the renderer applies it without looking at the
shape of any node. The `text` profile declares the cell glyphs
(`direct`, `closure`, `unmirrored`, `absent`, `diagonal`), the label
gutter, the cell separator and the index style. The `mermaid` and `dot`
profiles declare the header, the node form, the edge form, the group
form, the identifier prefixes and the escape table.

**Identifiers are encoded, never mangled and never refused.** Entity
names are `/[_a-zA-Z][-_a-zA-Z0-9]*/` (ts/src/val/IdFuncVal.ts's
`ID_NAME`), so a legal Aontu name may contain hyphens and
[`use-cases/10-data-model/seed.aon`](../../use-cases/10-data-model/seed.aon)
declares `id("cust-1001")`. A design that refuses what it cannot spell
would refuse a whole use case. The encoder is injective by
construction, with two disjoint prefixes and one predicate:

- if the name's first code point is an ASCII letter and every code
  point is an ASCII letter, digit or `_`, the id is `n_` + the name
  verbatim;
- otherwise the id is `nq_` + the name with every non-alphanumeric
  code point replaced by `_` and two lower-case hex digits.

`n_` and `nq_` partition the identifier space, and each branch is
injective on its own domain, so two model entities can never collide on
one diagram node. The predicate is a code-point class test, not a
regular expression: docs/trust.md names pattern matching as the one
subsystem with a stated RE2-versus-RegExp divergence, and an identifier
encoder runs on every emitted name. VERIFIED, both branches, on real
documents: `svc_auth` becomes `n_svc_auth` and `cust-1001` becomes
`nq_cust_2d1001`.

The unconditional prefix also disposes of reserved words with no table
and no branch: Mermaid's lower-case `end` and DOT's case-insensitive
`graph` / `digraph` / `node` / `edge` / `subgraph` / `strict` are all
unreachable. VERIFIED with an entity actually named `end`:

```
flowchart LR
  n_end["end"]
  n_x["x"]
  n_end -->|"feeds"| n_x
```

**Group identifiers are ordinal**, `g0`, `g1`, ... in sorted-label
order, and the label carries the value. A group label is arbitrary user
text and the injective encoding of arbitrary text is unreadable —
VERIFIED, a team named `we|are "ops" <x> {y} #z & more` encodes to a
47-character identifier. A group id is referenced only inside its own
figure, so ordinal numbering costs a diff when a group is inserted and
buys a legible file. Node ids are NOT ordinal, because a node id is
compared across revisions by `--check`.

**Escaping is one pass, per code point, from a table keyed by DECIMAL
CODE POINT.** A literal control character cannot be an Aontu key
(`aontu/unprintable`), and a character-keyed table would make
replacement order significant where a per-code-point lookup has no
order at all. `mermaid`: 34 → `#34;`, 35 → `#35;`, 38 → `#38;`, 60 →
`#60;`, 62 → `#62;`, 123 → `#123;`, 124 → `#124;`, 125 → `#125;` —
numeric entities only, never HTML names, so there is no name table to
diverge. `dot`: 34 → `\"`, 92 → `\\`, which also makes it impossible
for user text to forge DOT's `\n` / `\l` / `\r` justification escapes.
Code point 124 is in the Mermaid table because `|` is the edge-label
delimiter in the `-->|"label"|` form and an unescaped one breaks the
line. VERIFIED, both tables, on the adversarial team name above.

**An inline piece may not contain U+000A, U+000D, U+2028 or U+2029.**
G9's rule verbatim, and it is what makes the fold total: a line is a
line and the check is local. Refusal code `view_line_break`, with the
figure path. It is a renderer refusal rather than a vocabulary regex
because the vocabulary cannot express it: ts/src/std.ts holds the
bundled text in a template literal and `go/std.go` in a raw string that
has no escape, so `re("^[^\n\r]*$")` cannot be the same bytes in both
ports without abandoning the one-literal-per-port rule that
`std-system.tsv`'s hash row guards.

**The renderer never formats a number, because there are none.** Every
label is a string; a numeric field used as a label is taken as its
CANON string, which is defined for every leaf including `biginteger`
and `bigdecimal` and is already pinned byte for byte in both ports by
the `canon` and `hash` rows. It is deliberately not routed through
`+`'s string coercion: VERIFIED, `"" + 9007199254740993` is
`[aontu/mapval_no_gen]` and `"" + 1.0d` is `[aontu/no_path]`, and
`use-cases/10-data-model/domain.aon` declares
`ledgerId: integer & min(1) | biginteger & min(1)`, so the failing
shape is already in the corpus.

### 4. The loss report

Every run produces one, in `SchemaLoss`'s shape and printed to stderr
while the figure goes to stdout — the arrangement `jsonschema` already
uses, so `aontu view matrix x.aon > docs/arch.txt` writes a figure and
still tells the reader what it could not draw. Entries are aggregated
by code with a count, so a missing field on forty nodes is one row and
not forty.

| code | meaning |
|---|---|
| `edges_deduped` | N written positions collapsed to M distinct triples |
| `inverse_suppressed` | N mirror edges of a declared `inverse(n)` not drawn |
| `loose_edge` | N links written outside every entity, with their paths |
| `unresolved_field` | `--group-by` / `--label` has no generated value at N nodes |
| `hidden_contribution` | N edges or cells came from a `hide()`-marked subtree |
| `rows_elided` | N rows beyond `--max-rows` |
| `cols_elided` | N intersection columns beyond `--max-cols` |
| `crossings` | N edge crossings in the emitted order (`graph` only) |
| `cycle_block` | the partition order hit a strongly connected component of N |

Verdict is `ok`, `lossy` or `error`; `--strict` exits 1 on `lossy`.

`hidden_contribution` is real but **conditional on Phase 0**, and the
distinction matters enough to state here rather than leave to the
worked example. On shipped 0.53.0 it cannot happen in
`use-cases/05-rbac-policy` at all: re-checked 2026-08-30, `graphOf`
over every entry document of that case (`example.aon`, `roles.aon`,
`tenant.aon`, `plans.aon`, `permissions.aon`) yields no entity and no
edge touching `$.registry_invariant...`, and the key is correctly
absent from the generated JSON. That is the same blind spot
[Phase 0](#phase-0--the-graphof-conjunct-blind-spot-s) exists to
close — the extractor does not descend there yet.

Once it does, it reaches a subtree written `hide({...})`, whose whole
purpose is to say "not output". A figure is committed to a repository,
so anything drawn is disclosed. **The disclosure hazard is therefore
created by Phase 0 and must be closed in the same phase**, not
discovered after it: the loss code, the path in the report and the
`--strict` refusal land with the conjunct descent, and whether the
extractor should skip hidden subtrees outright is an
[open question](#open-questions) that Phase 0 has to answer rather
than defer.

### 5. The CLI surface

```
aontu view <kind> [options] <file>

  kinds
    matrix    dependency matrix over entities and one relation
    graph     node-link drawing of the entity graph
    sets      set-intersection panel over a named set family
    layers    which document contributed which path

  common
    --as <profile>      text | mermaid | dot | json; per kind, see the table
    --at <path>         anchor the extraction ($.catalog)
    -o, --out <file>    write here instead of stdout
    --check             exit 1 if --out differs from what would be emitted
    --strict            exit 1 when the loss report is non-empty
    --max-rows <n>      refuse above this many rows (default 60)
    --format <f>        text (default) or json, for the LOSS REPORT
    --trust <t>         as every other verb

  matrix
    --relation <name>   required unless the document declares exactly one
    --order <o>         canon (default) | partition
    --closure           mark transitively reachable cells

  graph
    --relation <name>   restrict to one predicate (repeatable)
    --group-by <field>  one subgraph per distinct value of this field
    --label <field>     node label text (default: the entity id)
    --loose <l>         drop (default) | keep

  sets
    --sets <path>       the map whose keys are the sets
    --member <key>      the field holding each set's members
    --universe <path>   the full element domain, so the empty column exists
    --min-degree <n>    drop intersections below this degree
    --max-cols <n>      elide beyond this, counted in the report

  layers
    --at <path>         restrict to paths under here
    --min-size <n>      drop intersections holding fewer than n paths
    --max-cols <n>      elide beyond this, counted in the report

  exit codes
    0  emitted, or --check matched
    1  --check mismatch, or a non-empty loss report under --strict
    2  usage, or --max-rows exceeded
    4  the document does not stand up on its own
```

Exit codes mirror `jsonschema`'s and the 4-is-error convention every
other verb uses.

`--max-rows` is a REFUSAL, not a truncation, and the message names the
narrowing options. A view that quietly omits things is the failure this
capability exists to avoid.

### 6. The view document

A projection that runs in CI belongs in a file. The recommended form is
a separate document that includes the model, matching G9's manifest
shape, and `views` is the AUTHOR's key — nothing in the engine knows
the name (ADR-010).

```aon
# views.aon
@"./system.aon"

views: {
  arch:  { kind: matrix, relation: dependsOn, order: partition,
           closure: true, out: "docs/arch.dsm.txt" }
  map:   { kind: graph, relation: dependsOn, groupBy: owner,
           as: mermaid, out: "docs/arch.mmd" }
  teams: { kind: layers, at: "$.deploy.prod", out: "docs/layers.txt" }
}
```

```
$ aontu view --views '$.views' views.aon           # render all three
$ aontu view --views '$.views' --check views.aon   # the CI gate
```

One evaluation, N figures, one exit code. A run either agrees with the
tree on disk or does not; nothing is written unless every figure
rendered, for the same reason G9 abandons a partial manifest run — N
figures of one model are only meaningful together.

### 7. Styling

*Added 2026-09-02, amending the "no colour palette" boundary. The
amendment is narrow and the reason is in the difference between a
colour and a name for one.*

**What is drawn is not the same question as what it means.** Every mark
a figure makes already has a reason the renderer computed: this cell
stands for a declared edge, that one only for a reachable pair, that
one for an edge whose inverse is missing; this arrow runs the wrong way
up the layers; this tree row is a subtree drawn earlier. The SVG
profile has published those reasons since it landed — they are the
`av-direct`, `av-closure`, `av-unmirrored`, `av-up` classes it writes —
because an SVG cannot be drawn at all without saying what each shape
is. The `text` profile computes the same reasons, spends them on
choosing a glyph, and throws them away.

So the vocabulary already exists, in one profile, undeclared. This
section declares it in both, and adds the one thing missing: a way to
turn it on and off at the call.

**The roles are closed and derived.** Ten, and no more without an
amendment here:

| role | what it marks |
|---|---|
| `label` | an entity's own name |
| `muted` | an index, a legend, a footer, a count |
| `rule` | a box, a gutter, a connector |
| `direct` | a mark standing for a declared edge |
| `closure` | a mark standing for a reachable pair that is not declared |
| `unmirrored` | a mark whose declared inverse is absent |
| `upward` | an edge against the layering |
| `repeat` | a subtree drawn earlier, or a cycle closed |
| `bar` | a magnitude |
| `hole` | an absent member of a set |

Nothing here is authored. A role is a fact the extractor already
established, and no input chooses one — which is what separates this
from the stylesheet language [Design space](#design-space) F rejects.

**One mechanism per profile, and the profile owns it.**

| profile | mechanism |
|---|---|
| `text` | SGR escapes — the eight named colours, `bold` and `dim`, nothing else |
| `svg` | a CSS class per role, plus an embedded stylesheet that gives each a default and reads it from a CSS variable |
| `mermaid`, `dot`, `er` | none: their renderers lay the figure out, and `classDef` is what the boundary refuses |

**Why this is not the palette the boundary refuses.** The objection was
that colour is taste and is theme-dependent. Both mechanisms above are
INDIRECTIONS THROUGH THE DESTINATION'S OWN PALETTE, and neither states
a colour:

- SGR 31 does not mean red. It means *the colour the reader's terminal
  calls red*, which the reader chose. A truecolour escape (`38;2;r;g;b`)
  would state a colour, and is refused here for exactly the reason the
  boundary gives.
- A CSS class states nothing at all. The stylesheet the SVG carries
  states a default and reads `var(--av-closure, …)`, so a host page
  that has a palette overrides it and a host page that has none still
  gets a legible figure.

A hex triple in a figure is the thing that cannot follow a theme, and
it stays refused. The amendment is that a NAME for a role, resolved by
whatever renders the figure, is not a hex triple.

**The specifier is `--style`, and it is closed.**

| `--style` | meaning |
|---|---|
| `auto` (default) | the profile's mechanism, if the destination can carry it |
| `none` | no mechanism: plain characters; SVG with its classes but no embedded stylesheet |
| `ansi` | SGR escapes; a usage error on any profile but `text` |
| `css` | classes and the stylesheet; a usage error on any profile but `svg` |

`--style none` on the SVG profile is not "unstyled": the classes are
structure and stay. What it drops is the embedded stylesheet, which is
what a host page wants when it has already bound the variables and is
embedding eight figures that would otherwise carry eight copies of the
same rules.

**`auto` is resolved by the CLI, never by the engine.** `ts/src/err.ts`
already settles this for error frames: a library cannot see whether its
output is a terminal, and a caller who can is the only one who may
decide. So `viewOf` takes `none`, `ansi` or `css` and nothing else, and
the CLI maps `auto` to `ansi` when the profile is `text`, stdout is a
terminal and `NO_COLOR` is unset; to `css` when the profile is `svg`;
and to `none` otherwise. That keeps every shared-spec row deterministic
— a TTY is not a thing `test/spec/view.tsv` can have — and it keeps the
one policy the repository already has instead of inventing a second.

**`--out` and `--check` force `none`.** A pinned golden with terminal
escapes in it is not a golden anybody can read, and a byte comparison
against one would fail on the reader's terminal settings. A figure
written to a file is written plain, whatever `--style` says; the flag
governs what goes to stdout.

**A view document may not carry `style`.** The boundary above stands
unamended here: a declaration says which projection, and `style` is
how it looks. A declaration carrying `style` is refused by `std/view`'s
schema at evaluation and by the verb's own declaration check, with
`view_document_shape` — the same refusal a misspelled option gets, for
the same reason.

### 8. The document tree

*Added 2026-09-02. A ninth kind, and the one that does not fit the
admission rule below without a word about why.*

**The rule this bends.** [Proposed design](#proposed-design) says every
kind reads a REPORT the engine already produces and never the value
tree. That rule is what keeps the verb from becoming a second
evaluator, and it holds for the eight kinds above. It also means the
verb draws NOTHING from a document with no links, no contributions and
no peers — which is most documents, and every document on the day
somebody first opens it.

**What `doc` reads.** The anchor walk: `anchorAt`, which is what
`aontu get` steps through, and the same keys `get --keys --types`
lists. That is a report, and it is the one report whose subject is the
shape rather than the content. It is not a new traversal of the value
tree; it is the existing one, drawn.

**What it draws.** Map keys in code-point order, list indices in order,
a sizing residue and a preference stepped through because neither is a
level of the shape, and an alias declaration omitted because a
declaration is not part of the document
([`use-cases/BUGS.md`](../../use-cases/BUGS.md) 74 — `get --keys` still
lists them). A leaf carries its canon, cut at 32 characters: the kind
of thing it is, not its value. Values are what a document is FOR; the
shape is what a reader needs before any of them mean anything.

**`--depth`, and why the bound is loud.** Three levels by default. A
container the bound stops at carries the number of keys not drawn, and
they are counted into the loss report as `depth_elided`. A structural
drawing that stopped without saying so would be worse than no drawing:
the reader would take the leaf for a leaf. This is the same rule
`--max-rows` follows by refusing rather than truncating, applied where
truncation is the point.

**Why every use case now opens with one.** Sixteen worked examples had
five figures between them, all of them of the five models that happen
to have an edge set or a version history. The other eleven presented a
reader with prose and a file table. The model tree is the figure any of
them can carry, and putting it first — with the second section
explaining the arrangement — means the reader meets the shape before
the argument.

### How this reuses G9 rather than duplicating it

Inherited verbatim, as rules rather than as code:

- `render(figure, profile) -> bytes` is a pure total fold that never
  touches the Val tree, never reads or writes a file, never shells out,
  never sorts and never iterates a map.
- A profile is data and only data, by the "without looking at the shape
  of any node" test.
- The escape table is keyed by decimal code point.
- No line terminator inside an inline piece.
- Identifier character classes come from a closed named set, never a
  regular expression.
- No formatter subprocess, not behind a flag, not "if available".
- The loss report is `SchemaLoss`'s shape, and `--strict` turns it into
  a refusal.
- The bundled-vocabulary mechanism is `std/system`'s, when `std/view`
  is eventually published.
- The manifest is one document naming N outputs, one run, all or
  nothing.

Not inherited, and the reason each time:

- **`std/code`, `render`, `join`, `form`, `walk` and the Jostraca
  bridge.** None exists. This capability is buildable today from
  `graphOf`, `generate()` and `Provenance`, and making it wait on nine
  unbuilt phases would be a queue rather than a foundation.
- **The `type()`-marked anchor.** VERIFIED to make a figure invisible
  to `generate()` and to `get`; see
  [Disagreement 3](#three-specialist-designs-and-where-they-disagree).
- **The declaration-level vocabulary.** A figure's items are not
  declarations, and the three primitives are not a subset of `%Decl`.

When G9's `render` verb lands, a figure emitted by `--format json` is
one more thing it can consume, and the extractors become one more thing
a user transform could produce. Neither is promised here, because
promising an integration with an unbuilt verb is how a design acquires
a dependency it did not price.

## Worked examples

All five are real. The extractors and renderers specified above were
implemented as a reference against the built engine and run on the
documents named; the bytes below are what came out. The two RBAC
examples additionally require [Phase 0](#phase-0--the-graphof-conjunct-blind-spot-s),
and were produced with that fix applied — which is stated rather than
hidden, because on shipped 0.53.0 they are empty.

### Worked example 1 — the matrix, in two orders (Ghoniem et al. 2004; Sangal et al. 2005)

`use-cases/01-service-catalog/system.aon`: eight `id(svc_*)` entities
declared across `catalog.aon` and `deploy.aon` and joined by identity;
`dependsOn` declared with `acyclic()` and `inverse(dependedOnBy)`.

```
$ aontu view matrix --relation dependsOn --closure --order canon system.aon
```

```
                1 2 3 4 5 6 7 8
svc_auth      1 \ X . . . . . .
svc_directory 2 . \ . . . . . .
svc_email     3 . . \ . . . . .
svc_gateway   4 X + + \ + + X +
svc_ledger    5 . . . . \ . . .
svc_notify    6 . . X . . \ . .
svc_payments  7 X + + . X X \ X
svc_risk      8 . X . . . . . \
# above-diagonal direct cells: 3
```

```
$ aontu view matrix --relation dependsOn --closure --order partition system.aon
```

```
                1 2 3 4 5 6 7 8
svc_directory 1 \ . . . . . . .
svc_email     2 . \ . . . . . .
svc_ledger    3 . . \ . . . . .
svc_auth      4 X . . \ . . . .
svc_notify    5 . X . . \ . . .
svc_risk      6 X . . . . \ . .
svc_payments  7 + + X X X X \ .
svc_gateway   8 + + + X + + X \
# above-diagonal direct cells: 0

--- loss (stderr) ---
edges_deduped  18 written positions -> 9 distinct triples
```

A cell at row *r*, column *c* is set when *r* depends on *c*: `X` is a
direct edge whose declared inverse is present, `+` is transitively
reachable only, `.` is absent, `\` is the diagonal.

Three things to read off it. The partition order is a perfect lower
triangle, and **that is the acyclicity proof** — `above-diagonal direct
cells: 0` is not an annotation on the picture, it is the picture's
shape. The order itself is a layering nobody wrote down: leaves
(`directory`, `email`, `ledger`), then `auth` / `notify` / `risk`, then
`payments`, then `gateway` — which is what the use case's README
describes in prose. And rows 7 and 8 are the coupling: `payments` and
`gateway` reach almost everything, `gateway` reaches everything through
two hops. The empty upper triangle is DATA — for a document whose value
proposition is what a system may and may not do, the absent cell is
half the content, and no node-link drawing shows absence at all.

The `edges_deduped` line is not cosmetic. `graphOf` emits one edge per
WRITTEN POSITION by design, because each `at` is an editable site, and
identity-merged models declare each entity at two positions. VERIFIED:
36 raw edges, 18 distinct triples over both predicates, 18 written
positions and 9 distinct triples under `dependsOn` alone.
Deduplication is part of the extraction contract, not a renderer's
private cleverness, and the count is reported so nobody has to guess
which number they are looking at.

### Worked example 2 — the same matrix catching two real defects

`use-cases/12-relations/` ships the four-job ETL DAG and two bad
documents that `check.sh` already uses to pin `relation_inverse_missing`
and `relation_cycle`.

```
$ aontu view matrix --relation feeds --order partition --closure model.aon
                1 2 3 4
job_audit     1 \ . . .
job_load      2 . \ . .
job_transform 3 X X \ .
job_extract   4 + + X \
# above-diagonal direct cells: 0

$ aontu view matrix --relation feeds --order partition --closure bad/missing-inverse.aon
                1 2 3 4 5
job_audit     1 \ . . . .
job_load      2 . \ . . .
job_metrics   3 . . \ . .
job_transform 4 X X ! \ .
job_extract   5 + + + X \
# above-diagonal direct cells: 0

$ aontu view matrix --relation feeds --order partition --closure bad/cycle.aon
                1 2 3 4
job_audit     1 \ . . .
job_extract   2 + \ + X
job_load      3 + X \ +
job_transform 4 X + X \
# above-diagonal direct cells: 1
```

The missing inverse is one glyph — `!` at (`job_transform`,
`job_metrics`) — where today it is a line in a report, and the file's
own header explains why it is hand-maintained: "deriving the inverse
FOR the author is generation, not validation, and inverse() only
checks". The cycle is better still: the matrix CANNOT be triangularised,
and the above-diagonal cell that survives every ordering is the
acyclicity violation. That is the design-rule semantics Lattix had to
invent a rule language for, with the rule language already in the same
document as the model.

VERIFIED: `aontu relations bad/missing-inverse.aon` reports the same
two findings and `aontu relations bad/cycle.aon` the same cycle, so
the figure and the verb agree by construction — both read one edge set.

### Worked example 3 — sets over the RBAC grants (Lex et al. 2014)

`use-cases/05-rbac-policy/example.aon`: four roles, nine permissions,
grants written `unique() & [&: refer() & string]`.

```
$ aontu view sets --sets '$.roles' --member grants --universe '$.permissions' example.aon
```

```
# upset  sets=$.roles(4)  member=grants  elements=9  universe=$.permissions

admin    #     1
auditor  ####  4
member   ###   3
owner    #     1

admin   | . * . . .
auditor | * . * . .
member  | * . . * .
owner   | . * . . .
        +----------
        |         #
        | #   #   #
        | # # # # #
          2 1 2 1 3

  col 1: member_read project_read
  col 2: admin_all
  col 3: audit_read billing_read
  col 4: project_write
  col 5: billing_manage member_invite project_delete   (in no set)
```

This one found things. **Column 5 is the covered-by-nothing
intersection**: `billing_manage`, `member_invite` and `project_delete`
are declared in `permissions.aon` and granted by no role at all —
VERIFIED by reading `roles.aon`, whose four grant lists are
`[admin_all]`, `[admin_all]`, `[project_read, project_write,
member_read]` and `[project_read, member_read, billing_read,
audit_read]`. **Column 2 shows `admin` and `owner` are exactly
equivalent in grants**, differing only in `rank` and `tenantOwner`.
Neither fact is visible in the JSON, in `aontu relations` (which
reports a verdict and nothing drawable on a passing model), or in any
node-link picture — the first is an absence and the second is a
coincidence of two sets.

Euler and Venn are the wrong instrument here for the reason Alsallakh
et al. (2016) give: past about six sets with varied overlaps they stop
being comprehensible, and generating one is a search-based float
optimiser. UpSet is a sort and a dot matrix.

The same context as a matrix shows the absence a second way, as three
empty columns:

```
$ aontu view matrix --relation grants --order partition example.aon
                                    1 1 1 1
                  1 2 3 4 5 6 7 8 9 0 1 2 3
admin_all       1 \ . . . . . . . . . . . .
audit_read      2 . \ . . . . . . . . . . .
billing_manage  3 . . \ . . . . . . . . . .
billing_read    4 . . . \ . . . . . . . . .
member_invite   5 . . . . \ . . . . . . . .
member_read     6 . . . . . \ . . . . . . .
project_delete  7 . . . . . . \ . . . . . .
project_read    8 . . . . . . . \ . . . . .
project_write   9 . . . . . . . . \ . . . .
admin          10 X . . . . . . . . \ . . .
auditor        11 . X . X . X . X . . \ . .
member         12 . . . . . X . X X . . \ .
owner          13 X . . . . . . . . . . . \
# above-diagonal direct cells: 0
```

Columns 3, 5 and 7 are empty: `billing_manage`, `member_invite`,
`project_delete`. The partition order has separated permissions from
roles without being told there is a bipartite structure, because
permissions have out-degree zero.

### Worked example 4 — the node-link graph, both profiles

```
$ aontu view graph --relation dependsOn --group-by owner --as mermaid system.aon
```

```
flowchart LR
  subgraph g0["team-identity"]
    n_svc_auth["svc_auth"]
    n_svc_directory["svc_directory"]
  end
  subgraph g1["team-payments"]
    n_svc_ledger["svc_ledger"]
    n_svc_payments["svc_payments"]
    n_svc_risk["svc_risk"]
  end
  subgraph g2["team-platform"]
    n_svc_email["svc_email"]
    n_svc_gateway["svc_gateway"]
    n_svc_notify["svc_notify"]
  end
  n_svc_auth -->|"dependsOn"| n_svc_directory
  n_svc_gateway -->|"dependsOn"| n_svc_auth
  n_svc_gateway -->|"dependsOn"| n_svc_payments
  n_svc_notify -->|"dependsOn"| n_svc_email
  n_svc_payments -->|"dependsOn"| n_svc_auth
  n_svc_payments -->|"dependsOn"| n_svc_ledger
  n_svc_payments -->|"dependsOn"| n_svc_notify
  n_svc_payments -->|"dependsOn"| n_svc_risk
  n_svc_risk -->|"dependsOn"| n_svc_directory

--- loss (stderr) ---
edges_deduped  36 written positions -> 18 distinct triples
```

```
$ aontu view graph --relation dependsOn --group-by owner --as dot system.aon
```

```
digraph G {
  rankdir=LR;
  node [shape=box];
  subgraph cluster_g0 {
    label="team-identity";
    n_svc_auth [label="svc_auth"];
    n_svc_directory [label="svc_directory"];
  }
  subgraph cluster_g1 {
    label="team-payments";
    n_svc_ledger [label="svc_ledger"];
    n_svc_payments [label="svc_payments"];
    n_svc_risk [label="svc_risk"];
  }
  subgraph cluster_g2 {
    label="team-platform";
    n_svc_email [label="svc_email"];
    n_svc_gateway [label="svc_gateway"];
    n_svc_notify [label="svc_notify"];
  }
  n_svc_auth -> n_svc_directory [label="dependsOn"];
  n_svc_gateway -> n_svc_auth [label="dependsOn"];
  n_svc_gateway -> n_svc_payments [label="dependsOn"];
  n_svc_notify -> n_svc_email [label="dependsOn"];
  n_svc_payments -> n_svc_auth [label="dependsOn"];
  n_svc_payments -> n_svc_ledger [label="dependsOn"];
  n_svc_payments -> n_svc_notify [label="dependsOn"];
  n_svc_payments -> n_svc_risk [label="dependsOn"];
  n_svc_risk -> n_svc_directory [label="dependsOn"];
}
```

Nine arrows for nine facts. Getting there took two decisions the
figure records and a naive emitter gets wrong: 36 written positions
deduplicate to 18 distinct triples because each of eight entities is
declared at two tree positions, and the 18 halve to 9 because
`ctx._reldecls` says `dependsOn` declares `inverse(dependedOnBy)` and
the hand-written mirror is suppressed rather than drawn as a second
arrow in the opposite direction. Groups come from the generated `owner`
value; group ids are ordinal and the labels carry the team names.

The same figure on the RBAC model, and this one only exists after
Phase 0:

```
$ aontu view graph --as mermaid example.aon
flowchart LR
  n_admin["admin"]
  n_admin_all["admin_all"]
  n_audit_read["audit_read"]
  n_auditor["auditor"]
  n_billing_manage["billing_manage"]
  n_billing_read["billing_read"]
  n_member["member"]
  n_member_invite["member_invite"]
  n_member_read["member_read"]
  n_owner["owner"]
  n_project_delete["project_delete"]
  n_project_read["project_read"]
  n_project_write["project_write"]
  n_admin -->|"grants"| n_admin_all
  n_auditor -->|"grants"| n_audit_read
  n_auditor -->|"grants"| n_billing_read
  n_auditor -->|"grants"| n_member_read
  n_auditor -->|"grants"| n_project_read
  n_member -->|"grants"| n_member_read
  n_member -->|"grants"| n_project_read
  n_member -->|"grants"| n_project_write
  n_owner -->|"grants"| n_admin_all

--- loss (stderr) ---
loose_edge  4  $.registry_invariant.one_owner_role.owner.grants.0
               $.tenant.members.ada.role $.tenant.members.alan.role
               $.tenant.members.grace.role
hidden_contribution  1  $.registry_invariant.one_owner_role.owner.grants.0
edges_deduped  13 written positions -> 13 distinct triples
```

On shipped 0.53.0 this figure is three nodes and nothing else. The loss
report is doing real work in both directions: three tenant members
reference roles from positions that carry no `id()` of their own and
are dropped by default with their paths named, so the fix (give the
member position an `id()`) is in the message; and one contribution came
from a `hide()`-marked subtree, which a committed figure must not
disclose silently.

### Worked example 5 — layers, which nothing else in the repository can draw

`use-cases/02-deploy-config/stack.aon` composes four layers of
authority across seven documents. `Provenance` already records, for
every path, which documents contributed to it; the `layers` extractor
reads that map and renders it as a set panel.

```
$ aontu view layers --at '$.deploy.prod' --max-cols 12 stack.aon
```

```
# layers  file=stack.aon  documents=5  paths=44

envs/prod.aon      18
fleet.aon          17
org-policy.aon     36
stack.aon          16
team-defaults.aon  12

envs/prod.aon     | * * . . * . * . .
fleet.aon         | . * . * . . . . .
org-policy.aon    | * . * * * * . * .
stack.aon         | . * * . . * * . *
team-defaults.aon | * . * . . . . . .
                  +------------------
                    8 5 4 12 4 4 1 4 2

  col 1 (8): deploy.prod.workloads.auth.logLevel deploy.prod.workloads.auth.tracing
             deploy.prod.workloads.billing.logLevel ...
  col 2 (5): deploy.prod.workloads deploy.prod.workloads.auth
             deploy.prod.workloads.billing ...
  col 3 (4): deploy.prod.workloads.auth.image deploy.prod.workloads.billing.image
             deploy.prod.workloads.reports.image deploy.prod.workloads.web.image
  col 4 (12): deploy.prod.workloads.auth.critical deploy.prod.workloads.auth.port
              deploy.prod.workloads.auth.tier ...
  col 5 (4): deploy.prod.workloads.auth.replicas deploy.prod.workloads.billing.replicas
             deploy.prod.workloads.reports.replicas deploy.prod.workloads.web.replicas
  col 6 (4): deploy.prod.workloads.auth.service deploy.prod.workloads.billing.service
             deploy.prod.workloads.reports.service deploy.prod.workloads.web.service
  col 7 (1): deploy.prod
  col 8 (4): deploy.prod.workloads.auth.imagePullPolicy ...
  col 9 (2): deploy.prod.domain deploy.prod.promote
```

Five documents write into `deploy.prod`. Twelve paths are decided by
`org-policy.aon` alone (column 4) — the org shape nobody overrides.
Eight are decided by three writers at once (column 1: the environment
overlay, the org policy and the team defaults all state `logLevel` and
`tracing`), which is exactly the contention the use case exists to
demonstrate and which its README describes only in prose. Column 5 is
`replicas`, contributed by the environment overlay and the org policy —
VERIFIED consistent with the single-path answer, since
`aontu why '$.deploy.prod.workloads.billing.replicas' stack.aon`
reports three conjuncts from those two files.

VERIFIED at the whole document: one instrumented run of `stack.aon`
records 338 paths across seven documents. The `--at` restriction and
`--max-cols` are not conveniences — the unrestricted panel is 22
columns and unreadable, and the loss report says `cols_elided` when it
truncates.

## Determinism and parity

### The ceiling, stated first and stated in the file

**You can pin the diagram source. You cannot pin the picture.** Mermaid
carries no coordinates and has no positional syntax at any price; its
layout is dagre or ELK running in the reader's browser, at whatever
version the reader's platform has pinned. Graphviz gives no stability
contract on coordinates across releases. An SVG's line breaks depend on
the reader's font. So `aontu view --check` asserts that the committed
bytes are what this model produces today — the same assertion `trim
--check` and `mod verify` make — and it asserts nothing about pixels,
for any profile. Anyone who needs a byte-stable IMAGE in the repository
needs a layout algorithm emitted to SVG, and that is a different
project with a different bias.

Everything below that line is fully pinned.

### The nine sites where two ports could disagree

| site | mechanism | pin |
|---|---|---|
| entity and edge order | never a map iteration. `graphOf` already returns entities and paths in `cmpCodePoint` order and edges by written position; the extractor re-sorts deduplicated edges by `(from, key, to)` and cells by `(row, col)`, all with `cmpCodePoint`. Every ordered thing in the figure is a LIST | `view-matrix.tsv` / `view-graph.tsv` rows: model in, figure JSON out, byte-compared; plus `grep -n 'range ' go/view.go` showing slices only |
| the edge sort key | `graphOf` today sorts edges by `at` ALONE, justified in-comment as "which is unique — one link, one place". Phase 0's conjunct arm visits terms at the SAME path, so that comment stops being provable. The key becomes the total `(at, from, key, to)` in both ports, in the same commit | `graph.tsv` rows; and it removes the `Array.prototype.sort`-versus-`sort.Slice` stability question before it can matter (TypeScript's sort is stable, Go's `sort.Slice` is not) |
| identifier encoding | two disjoint prefixes and one code-point class test; injective by construction, no reserved-word table, no branch a coverage floor can leave uncovered | rows for a hyphenated name, an underscored name that must not collide with it, a name called `end`, a name called `graph`, a leading-underscore name |
| escaping | one pass, per code point, table keyed by decimal code point | `view-mermaid.tsv` / `view-dot.tsv` adversarial-label rows, including a label containing `|`, `"`, `#`, `&`, `<`, `>`, `{`, `}` |
| line terminators | an inline piece may not contain U+000A, U+000D, U+2028 or U+2029; refusal `view_line_break` | four rows, one per code point |
| numbers | **the renderer formats none**. Labels are strings; a numeric field taken as a label uses its CANON string, already pinned in both ports | covered by every existing `canon` row; one new row for a `biginteger` label |
| line endings | LF only. There is no `eol` profile field, and a TSV cell cannot hold a carriage return | structural |
| profile values | one bundled source text, both ports, same bytes | a `hash` row per profile, as `std-system.tsv` has |
| the partition order | see below | a shuffled-input row requiring identical output bytes |

### The one ordering algorithm, and why it is not a heuristic

`--order partition` is DSM triangularisation, specified as an EXACT
canonical topological sort rather than an optimiser: repeatedly take
the not-yet-placed items with no unplaced successors, sort them with
`cmpCodePoint`, emit them, and continue. On a cycle, place the
code-point-least remaining item, record `cycle_block` in the loss
report, and continue. Integer only, terminating, total, no ties by
construction.

It carries a proof obligation that is itself the payoff: **every direct
cell lands below the diagonal if and only if the relation is acyclic**,
which is why the matrix in worked example 2 fails to triangularise on
`bad/cycle.aon` and why the count is printed under every matrix. The
heuristic reordering families (Behrisch et al., 2016) are refused —
float objectives with arbitrary ties, in two ports, under a 100 %
coverage floor.

### What is banned by policy rather than by convention

No `Math.sin` / `cos` / `pow` / `exp` / `log` / `atan2` anywhere in the
view code — ECMAScript declares those implementation-approximated and
Go's `math` is a separate implementation. No floating point of any
kind. No randomness. No map iteration. No sorting inside a renderer:
the renderer receives lists and prints them.

Two enforcement mechanisms proposed elsewhere do not exist here and are
not used: this repository has no ESLint configuration (VERIFIED: no
`.eslintrc*`, no `eslint.config*`, no eslint script or devDependency in
`ts/package.json`), and the Go port is one flat package (VERIFIED:
`grep -h '^package' go/*.go | sort | uniq -c` gives `86 package
aontu`), eight files of which already import `math`, so "the view
package imports nothing from math" has no package boundary to attach
to — and creating one would cut the view code off from `ctx._reldecls`
and break ADR-001's file-for-file correspondence. The property is
therefore enforced on the OUTPUT and on the source text: a per-runner
test greps the view source files in both ports for `Math.` and
`math.`, and a spec-level assertion requires every numeric token in a
`view` golden to match `^[0-9]+$`. A grep test is symmetric across
ports, needs no linter and no package split, and checks the property
rather than a proxy for it.

### The shared-spec encoding, and its one hard limit

The suite's escape pass expands `\n` and `\t` and **silently drops the
backslash of every other escape** — VERIFIED in both runners
(`ts/test/spec.test.ts`'s `unescape` and `go/spec_test.go`'s
`unescapeSpec`, the latter byte-wise rather than rune-wise). So an
inline golden containing a literal backslash must spell it `\\`, and a
backslash immediately before a multi-byte character is a manufactured
parity hazard rather than a real one. `__FIXTURES__` substitutes into
the `src` column only, in both runners.

Inline multi-line goldens do work at this scale — `test/spec/agentsmd.tsv`
pins roughly 1 KB stanzas byte for byte on one physical line, VERIFIED —
and that is the precedent the `view` mode follows, with a stated cap:
**a figure whose smallest useful output does not fit in a reviewable
row does not belong in v1.** The `text` profile is line-oriented and
fits; the DOT golden for eight services is 25 lines and fits. Whether
to extend `__FIXTURES__` to the expectation column is a change to the
shared suite's contract and belongs to G9's open question, not here.

### The parity ledger

[`test/spec/divergent.tsv`](../../test/spec/divergent.tsv) has **zero
rows** at head, VERIFIED, and no entry against `graphOf` exists
anywhere in the tree. The extractor this design rests on is currently
in agreement between the ports, and Phase 0 must keep it that way: the
conjunct arm and the sort-key change land in ONE commit in both ports
with the same rows, per ADR-001.

## Boundary: what we will not do

Each refusal names the measurement or the rule that decided it.

- **No layout algorithm, in any port, ever, without a new ADR.** The
  integer rule forecloses force-directed, radial, polar, circular and
  packed forms permanently. PlantUML's Smetana is the evidence that a
  faithful port of a layout algorithm is not identical output; elkrs is
  the evidence that bit-identical layout is achievable at a price this
  repository will not pay.

- **No formatter, renderer or layout subprocess.** Not `dot -Tsvg`,
  not `mmdc`, not Kroki, not behind a flag, not "if available". G5
  hermeticity, ADR-001 and ADR-002 each refuse it independently, and
  it would make an `aon1`-stamped figure a lie.

- **No SVG in v1.** The integer rule makes SVG buildable later; nothing
  makes it cheap. It brings text measurement (there is no
  `measureText` in SVG and no TS/Go font-metrics pair worth trusting),
  a second escaping sub-language, and a geometry surface in the shared
  suite. It is a phase of its own, after two text kinds have proved the
  figure.

  *Status: BUILT (2026-09-02), as `--as svg` on the cell-based kinds
  (`tree`, `matrix`, `layer`, `sets`, `layers`) in both ports. Text
  is not measured: a character is 8 units and a line 20, so every
  coordinate is an integer from the counts that lay the text figure
  out, and the shared suite pins the bytes. The escape table has four
  entries. The node-link kinds stay Mermaid and DOT.*

- **No `why` diagram.** VERIFIED: `aontu why
  '$.deploy.regions.eu1.clusters.core.workloads.payments.replicas'
  system.aon` returns TWO conjuncts, and the existing text output is
  already three lines with clickable `file:row:col`. A four-node chain
  is a picture of a two-element list, and worse than the text it would
  replace.

- **No subsumption Hasse diagram (`order`).** VERIFIED by running all
  56 ordered pairs of `subsume --at '$.profile'` over the eight
  documents in `use-cases/04-schema-evolution/`: exactly FOUR return
  `subsumes`, two of them mutual (`require-loyalty.aon` and
  `waive-gate.aon` subsume each other). The Hasse diagram of the
  repository's richest evolution fixture is 7 nodes and 2 edges — a
  four-row table rendered as a graph. It also needs a layered layout,
  which the integer rule forbids. The finding it surfaces (two
  proposals are the same schema at `$.profile`) is worth a verb; it is
  not worth a picture.

- **No interval or domain panel, and no conflict witness.** This was
  the most novel view in the survey and it is cut on two measurements.
  First, `why` REFUSES on a document that does not stand up — VERIFIED,
  `aontu why '$.replicas' probes/bypassed-bound.aon` prints the
  `[aontu/empty]` frame and exits 4 with no conjunct list — so the
  conflict witness, which is the interesting half, cannot be built on
  the machinery it would need. Second, where `why` DOES answer, a
  disjoined bound stays folded: VERIFIED, the conjunct list for
  `$.deploy.regions.eu1.clusters.core.workloads.payments.replicas` is
  `6` and `*2|(min(1)&max(48)&integer)`, so drawing the bar would mean
  parsing `min` and `max` back out of a canon STRING. That is the
  reimplemented parser G9's reflection sidecar exists to prevent. The
  panel becomes cheap when checks arrive in structured form, and not
  before.

- **No concept lattice (formal concept analysis).** Measured rather
  than waved away: 6 formal concepts on the RBAC roles-by-grants
  context, 21 on the service catalog's entity-by-field context. Small,
  but a Hasse diagram of 21 concepts needs a layered layout, and the
  set panel shows the same structure legibly.

- **No hierarchical edge bundling, no arc diagram, no icicle, no
  Marey.** All four survive the integer rule and all four are declined
  for v1. Bundling is the one adopted-family technique with no
  controlled evaluation and a documented ambiguity failure (Wallinger
  et al., 2022). The arc diagram is a genuine complement to the matrix
  for path following, and is the first thing to add if a fifth kind is
  wanted. The icicle restates what `get --keys` and `jsonschema`
  already answer. Marey needs a git-revision walk and a second parity
  surface.

- **No crossing minimisation.** NP-hard, and every practical method is
  a heuristic with float ties. Crossings are COUNTED into the loss
  report; the reductions offered are exact and data-side (`--relation`,
  `--at`, `--group-by`, and later a Furnas degree-of-interest filter
  and the two exactly-detectable Dunne–Shneiderman motifs).

- **No colour palette, no `classDef`, no node shapes.** Colour is
  taste, is theme-dependent, and is the classic accretion vector. A
  profile may not grow a style field, by the same "without looking at
  the shape of any node" test that governs G9's profiles. AMENDED
  2026-09-02 — see [Styling](#7-styling): a NAMED colour is refused
  exactly as stated here, and an INDIRECTION through the destination's
  own palette is not one.

- **No view DSL in the model.** A view document declares WHICH
  PROJECTION, never how it looks. Unamended: the styling below is a
  CLI and API specifier, and a view-document declaration that carries
  `style` is refused.

- **No Excalidraw, tldraw, PlantUML, D2, Structurizr, ArchiMate or
  Vega-Lite target.** Reasons in [Prior art](#prior-art); Vega-Lite is
  the strongest deferred candidate and its own note is in
  [Open questions](#open-questions).

- **No interactive artifact.** SHriMP's nested view-swapping, Pad++'s
  semantic zoom and fisheye focus-plus-context are all unavailable. The
  substitute is re-running with `--at`, which is a worse answer, and is
  only defensible because the figures are cheap to regenerate and live
  in git.

- **No LLM anywhere in the pipeline.** Deterministic, mechanical
  derivation is the pitch.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Phase 0's conjunct arm flips a shipped verdict on a document that wraps a declared relation in a residual — `relations` from pass to fail, `reaches` from `unreachable` to `reaches` | Medium | High | Both flips are corrections and both need rows and a CHANGELOG note. VERIFIED at head with the arm applied: the RBAC model goes from 3 to 13 edges and `reaches owner admin_all` from exit 1 to exit 0; `01-service-catalog` stays at 36 edges and `12-relations` at 6; the full TypeScript suite (4,431 tests) is green. Whether it needs an ADR entry is an open question |
| The picture is not pinned and never will be: GitHub's Mermaid version lags upstream, dagre and ELK change, graphviz gives no coordinate contract | High | Medium | Stated in the design, in `--help`, and in the emitted comment header. `--check` asserts bytes and says so; nothing claims pixels |
| ADR-002's 100 % floor over four extractors, three renderers and two ports | High | High | Calibration from this tree: `ts/src/jsonschema.ts` is 511 lines and `go/jsonschema.go` 534 for a single-target emitter with one verb and two flags; `graph.ts` is 148, `reach.ts` 184, `relation.ts` 292, `diff.ts` 196, `agentsmd.ts` 135. The repository's ratio is 19,335 test lines to 30,670 source lines in TypeScript and 15,054 to 23,343 in Go, so every phase estimate below is quoted with the test lines it drags. The first landing is deliberately ONE kind and ONE profile |
| Phase 0's conjunct descent lets `graphOf` reach `hide()`-marked subtrees, so a committed figure discloses what the document hides. NOT reachable on shipped 0.53.0 — re-checked 2026-08-30, no entity or edge in `use-cases/05-rbac-policy` touches `$.registry_invariant...` — so this is a hazard Phase 0 CREATES | High, once Phase 0 lands | High | Reported as `hidden_contribution` with the path, and `--strict` refuses. Whether the extractor should SKIP hidden subtrees by default is an open question; G9 Phase 0 makes the same change for `each`/`pick` and the two should agree |
| The relation metamodel contains entries that are not predicates. VERIFIED on `use-cases/12-relations/bad/missing-inverse.aon`, where `ctx._reldecls` holds `feeds` plus five entries keyed `metrics`, `extract`, `transform`, `load`, `audit`, each carrying `inv:["fedBy"]`; not reproduced in a minimal document, and no verdict changes because the verb looks up by the edge's key | Medium | Medium | `--relation` is required for `matrix` rather than defaulting to one panel per declared relation, so a phantom entry cannot become a phantom figure. The observation goes in `use-cases/BUGS.md` with the document that shows it |
| `graphOf`'s edge sort key stops being total once the conjunct arm visits terms at one path. I could NOT construct a witness (probes with stacked `refer()` conjuncts either collapsed or refused), so this is an unproven invariant rather than a demonstrated bug — but the in-code comment that licenses the one-key sort becomes false | Low | Medium | One line per port in the same commit: sort by `(at, from, key, to)`, and update the comment |
| A matrix or a set panel is unreadable at real scale — a 200-service catalogue, a 60-attribute record set | High | Medium | `--max-rows` REFUSES rather than truncates, and the message names `--at`, `--relation` and `--group-by`; `--max-cols` and `--min-degree` elide with a counted loss row. The defaults (60 rows) have not been chosen against real large data, because the repository contains none |
| Node-link output is a hairball above roughly forty nodes, which is the size the literature says the matrix exists for | High | Medium | Both ship, over one edge set, and the docs say which question each answers, with `reaches` as the third. Crossings are counted |
| Inline `\n`-escaped goldens prove unreviewable | Medium | Medium | `agentsmd.tsv` is the precedent at ~1 KB per row and it holds; the cap is stated, and a kind whose smallest useful output exceeds it does not ship. The `text` profile is line-oriented by construction |
| The four kinds are the four kinds: a user cannot add a fifth without patching two ports | Medium | Medium | Stated. `--format json` publishes the figure so a host can render it differently, and the extractors become user-writable only when G9's reflection sidecar lands. Neither is promised |
| A view document is a second artifact to keep current, and `--check` only helps if someone wires it up | Medium | Medium | The manifest and `--check` are the structural answer, and structural answers only work when turned on. `use-cases/16-views/check.sh` turns it on for this repository, which is the only enforcement available |
| Escaping is too narrow and a figure silently mis-renders | Low | High | Escaping too much is safe; escaping too little is a silent mis-render, so the Mermaid table is deliberately wide (eight code points). Adversarial rows are mandatory from the first commit, not added later |
| Mermaid's fragile grammar changes | Low | Medium | The emitted subset is the smallest that draws the figure: `flowchart`, `subgraph`, a bracket-labelled node and a pipe-labelled edge. No `classDef`, no `click`, no styling, no shapes |

## Implementation plan

Spec-rows-first throughout: every behaviour lands as `test/spec/*.tsv`
rows agreed before code; TypeScript implements first; the Go port
follows to green on identical rows with no skip list. Nothing may
regress at any phase: the full shared suite, canon convergence, and the
ADR-002 floor in both ports.

Baseline for the register, re-derived 2026-08-30 per
[protocol rule 5](../capability-review/progress.md#the-update-protocol):
`ls test/spec/*.tsv | wc -l` = **97**,
`awk -F'\t' 'NF>2 && $0 !~ /^#/' test/spec/*.tsv | wc -l` = **3758**.

### Phase 0 — the `graphOf` conjunct blind spot (S)

*Status: BUILT with the verb; the `edges_in_disjunct` count landed
2026-09-02 as `Graph.disjunct` (the positions, not a bare count) and
the figures' loss row.*

The gate for everything else, and worth landing even if no figure is
ever drawn. A residual CONJUNCTION is transparent to the graph walk:
its terms sit at the field's own position, so a link inside
`unique() & [&: refer(), x]` is a link of the field. A DisjunctVal is
deliberately NOT transparent — ADR-007 says an unresolved disjunction
is not a value, so a link under an unresolved arm is not a fact, and it
is counted as `edges_in_disjunct` instead.

In `visit()`, beside the graph-atom arm already there:

```
if (true === node.isConjunct && Array.isArray(node.peg)) {
  ancestors.add(node)
  for (const t of node.peg) visit(t, path, inside, below, ancestors)
  ancestors.delete(node)
}
else if ((true === node.isMap || true === node.isList) && null != node.peg) { ... }
```

`go/graph.go` takes the mirror `case *ConjunctVal:` in the existing
type switch — `ConjunctVal.peg` is `[]Val`, so the arm is three lines.
In the same commit, both ports' edge sort becomes the total
`(at, from, key, to)` and the comment that asserts `at` is unique is
corrected.

*Files:* ts/src/graph.ts; go/graph.go, go/graph_test.go.
*Spec:* `graph.tsv` +8 — a bare list of links; `unique() & [&: refer(), x]`;
`length(...) & [&: refer(), x]`; a nested conjunct; a DisjunctVal NOT
walked; a PrefVal NOT walked; two edges under one conjunct sorting
totally. `reaches.tsv` +2, one of them the `owner`/`admin_all` question.
`errcodes.tsv` +0.
**Acceptance:** VERIFIED with the arm applied at head —
`05-rbac-policy/example.aon` goes from 3 to 13 edges,
`reaches owner admin_all` from `unreachable` (exit 1) to `reaches`
(exit 0), `01-service-catalog` stays at 36 edges over 18 distinct
triples, `12-relations` stays at 6, and the full TypeScript suite
(4,431 tests, 105 suites) is green. A CHANGELOG note states plainly
that this can flip a `relations` or `reaches` verdict, and why the flip
is a correction.

### Phase 1 — the figure, the text renderer, and `view matrix` (M)

The first kind, the first profile, no CLI flags beyond the minimum, and
the parity claim proved on line-oriented text before any target grammar
exists.

`ts/src/view.ts` and `go/view.go`, mirroring the `graph.ts` /
`graph.go` correspondence: the `Figure` type and its JSON projection;
`matrixOf(graph, decls, opts) -> Figure` with deduplication by
`(from, key, to)` keeping the `at` list, the canonical topological
sort, the transitive closure, and the `unmirrored` mark read from
`ctx._reldecls`; `renderText(figure, profile) -> string` as a pure fold
over lists with no sort, no map iteration and no number formatting; the
`text` profile bundled in ts/src/std.ts and go/std.go as the same bytes
with a hash row. The `view matrix` verb with `--relation`, `--order`,
`--closure`, `--at`, `--as text|json`, `--out`, `--check`, `--strict`,
`--max-rows`, `--format` and `--trust`.

Also here: widen the package index. It exports 26 symbols today and
`reachCheck`, `Provenance`, `relDecls` and `walkVals` are not among
them; the extractors need them and an out-of-tree tool should reach
them too.

*Files:* ts/src/view.ts (new), ts/src/std.ts, ts/src/cli.ts,
ts/src/aontu.ts; go/view.go (new), go/std.go, go/cmd/aontu/view.go,
go/cmd/aontu/main.go.
*Spec:* new `view-matrix.tsv` (~40 rows, four columns: model in,
figure JSON out) and new `view-text.tsv` (~30 rows, five columns:
figure plus profile in, bytes out) — the canon and partition orders,
the closure, the `unmirrored` mark, the cyclic fallback, a shuffled
input requiring identical bytes, the two header forms above and below
ten rows, `--max-rows` refusal, every loss code. `std-view-text.tsv`
(2 rows: canon, hash). `errcodes.tsv` +2.
**Acceptance:** worked examples 1 and 2 emit byte for byte from both
ports; `grep -n 'range ' go/view.go` shows ranges over slices only;
`grep -n 'math\.\|Math\.' ` over the view sources in both ports is
empty; every numeric token in every `view-text.tsv` golden matches
`^[0-9]+$`.

### Phase 2 — the node-link renderers and `view graph` (M)

Two target grammars sharing one data profile table — header, node
form, edge form, group form, identifier prefixes, escape table — and
one extractor.

The `graph` extractor: inverse suppression from `ctx._reldecls`,
`--group-by` and `--label` joined from `generate()`, the loose-edge
rule with `--loose drop|keep`, and the crossing count. The two
renderers as folds over the same figure. Adversarial escape rows are
mandatory in this phase, not later.

*Files:* ts/src/view.ts, ts/src/std.ts, ts/src/cli.ts; go/view.go,
go/std.go, go/cmd/aontu/view.go.
*Spec:* `view-graph.tsv` (~30 rows, model to figure), new
`view-mermaid.tsv` and `view-dot.tsv` (~30 rows each, figure to bytes)
— every escape-table code point, an entity named `end`, one named
`graph`, one named `x`, a hyphenated name beside the underscored name
it must not collide with, a leading-underscore name, a label containing
each of the eight escaped code points, the line-terminator refusal, the
ordinal group ids. `std-view-mermaid.tsv` / `std-view-dot.tsv` hash
rows. `errcodes.tsv` +2.
**Acceptance:** worked example 4 emits byte for byte from both ports in
both profiles; the RBAC figure emits the nine grants edges and both
loss rows.

### Phase 3 — `view sets` and `view layers` (S/M)

Two extractors, one new renderer, and the phase that proves the figure
was drawn in the right place: `layers` adds no renderer at all.

`sets`: `--sets`, `--member`, `--universe`, `--min-degree`,
`--max-cols`; the signature grouping and the deterministic column order
(degree descending, then cardinality descending, then signature in
`cmpCodePoint` order). `layers`: one instrumented unification, the
`Provenance.paths` walk, path-to-file-set, `--at` and `--min-size`.
`renderSets` as the third fold.

*Files:* ts/src/view.ts, ts/src/cli.ts, ts/src/aontu.ts (export
`Provenance`); go/view.go, go/provenance.go, go/cmd/aontu/view.go.
*Spec:* new `view-sets.tsv` (~35 rows) and `view-layers.tsv` (~20
rows); `view-text.tsv` +15 for the set panel's bars and matrix.
**Acceptance:** worked examples 3 and 5 emit byte for byte from both
ports; the covered-by-nothing column is present by default when
`--universe` is given and absent otherwise; the layer panel over
`stack.aon` names the same documents `why` names for
`$.deploy.prod.workloads.billing.replicas`.

### Phase 4 — the view document, the MCP tool, and the documentation (M)

*Status: BUILT (2026-09-02), as `aontu view --views <path>` and
`viewSet` / `Aontu.ViewSet` in both ports, pinned by
`test/spec/views.tsv` (mode `views`). The MCP tool `view` landed with
the kinds. Departures from the plan below: the declarations live in a
new `test/spec/views.tsv` rather than in `view-matrix.tsv`; the
figures are gated in `use-cases/16-module-deps/views.aon` rather than a
new `16-views/` case, since the figures to gate are that case's own;
`docs/how-to/draw-a-model.md` is not written. Every declaration must
name its `kind` and `out`, which the sketch below leaves implicit, and
the `poset` is refused inside a view document because it compares
several.*

`--views <path>` reading a map of view declarations out of an ordinary
document, one evaluation and N figures, all-or-nothing writing, and
`--check` across the set. One MCP tool `view` in ts/src/mcp.ts, read
only, so it needs no new trust clause. `use-cases/16-views/` following
the `14-jsonschema-export` pattern with `check.sh` and `expected/`,
drawing the figures for use cases 01, 02, 05 and 12 and gating them.
`docs/how-to/draw-a-model.md` and a reference section, both under
[docs/STYLE-GUIDE.md](../STYLE-GUIDE.md), with every tagged snippet
executed by `ts/test/docs.test.ts`. The register row in
[`progress.md`](../capability-review/progress.md) moves in the same
commit that changes its status, per AGENTS.md.

*Files:* ts/src/view.ts, ts/src/cli.ts, ts/src/mcp.ts; go/view.go,
go/cmd/aontu/view.go; docs/how-to/draw-a-model.md,
docs/reference-api.md, docs/shared-spec.md (three new modes), AGENTS.md
(the mode table), use-cases/16-views/, use-cases/README.md.
*Spec:* `view-matrix.tsv` +6 (the view document), CLI transcripts in
docs/reference-api.md executed by `ts/test/docs.test.ts`.
**Acceptance:** one `aontu view --views '$.views' --check` invocation
gates four figures in `use-cases/16-views/check.sh`; a manifest whose
third figure fails writes nothing; `run-all.sh` stays green.

### Phase 5 — `std/view`, published (S)

*Status: BUILT (2026-09-02) as the bundled `@"std/view"` in both ports
(ts/src/std.ts, go/std.go), pinned by `test/spec/std-view.tsv`. It is
the schema for a view-document DECLARATION -- `$.view.Figure` -- rather
than the alias-only vocabulary for a figure the sketch below describes,
because the figure JSON projection it would name is not built. Nothing
in the engine reads it: a view document that includes it is refused by
unification, one that does not is refused by the verb.*

Only after four kinds have exercised whether three primitives are
enough. The alias-only vocabulary in ts/src/std.ts and go/std.go as the
same bytes, with a canon row and a hash row, so a hand-written or
hand-edited figure vets by unification and a third party can produce
one. This is the phase that turns `--format json` from a debug dump
into a contract, and it is deliberately last.

## Open questions

- **Does the integer rule become an ADR?** Everything here follows from
  it, and v1 does not exercise it. Written as an ADR it permanently
  forecloses force-directed, radial, polar and packed layouts, which is
  most of the visually striking half of the literature. Left as a
  convention, someone adds a float in eighteen months and the parity
  guarantee dies quietly. Recommendation: the ADR, and it should say
  that it constrains the VIEW code specifically, not the engine.

- **Does the Phase 0 fix need its own ADR entry, or is a CHANGELOG note
  plus spec rows enough?** It changes what two shipped verbs answer on
  a class of existing documents — `use-cases/05-rbac-policy` goes from
  `unreachable` (exit 1) to `reaches` (exit 0) for a question the
  document already answered — which is unambiguously a correction and
  is also a behaviour change a user's CI may depend on.

- **Should the extractors skip `hide()`-marked subtrees by default?**
  Today `graphOf` walks them, VERIFIED, so a figure can draw what the
  document hides. Reporting it is the conservative answer and it is
  what this design does. Skipping is the safe answer and it changes
  `graphOf`'s shipped output, which would need its own rows and would
  want to agree with whatever G9 Phase 0 decides for `each` and `pick`.

- **Is `--order partition` "a reordering algorithm", and therefore
  forbidden?** The argument here is no: it is an exact canonical
  topological sort with a total tie-break, not a heuristic optimiser,
  and it carries a self-checking proof obligation. It is the one place
  this design departs from "emit in canonical order and let a
  downstream tool reorder", and it deserves an explicit ruling.

- **Does `sets` need a second element source?** `--sets`/`--member`
  reads generated values, which is right for `grants` and wrong for a
  relation whose targets are entities. Reading the edge set instead
  would unify `sets` and `matrix` on one extractor. Decided by: whether
  a second set family in a real document wants it.

- **Should the emitted Mermaid carry `click n_x "..."` directives built
  from the `at` paths?** It is the single highest-value addition for
  the agent story and it costs one URL-scheme decision — which is
  exactly why it is not in this plan.

- **Is the arc diagram the fifth kind?** It survives the integer rule,
  it is the path-following complement the Ghoniem/Okoe pair says a
  matrix needs, and in partition order every chord leans the same way
  so a chord leaning the other way is a cycle — the same invariant the
  matrix's diagonal states, by different means. It also needs the SVG
  profile, which is a phase of its own.

- **Vega-Lite as a fifth profile?** Its scales are declared over data
  ranges and the compiler owns the pixel mapping, so the geometry is
  not ours and the `--check` story would need restating (the JSON
  bytes are pinnable; the rendered chart is not, which is the same
  ceiling as Mermaid's). It is the right third profile in a design
  whose thesis is "project the model through a grammar of graphics",
  and the wrong fifth profile in this one.

- **Where does the crossing count come from for `graph`?** Mermaid and
  DOT own the layout, so a crossing count computed from the emitted
  ORDER is a lower bound on a drawing this design does not control.
  Reporting a number that does not describe the picture the reader sees
  may be worse than reporting none. Decided by: whether the count
  correlates with anything once the first figures are committed.

- **Do `--max-rows` and `--max-cols` default correctly?** 60 rows and
  12 columns are chosen from the corpus, and the corpus is small. The
  first user with a 200-service catalogue will find out, and the
  refusal message is the only thing standing between them and an
  unreadable file.

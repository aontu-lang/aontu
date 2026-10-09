# Model views — the further figures

`aontu view` drew the structure of a model: its key tree, its links as
a tree, a matrix or a node-link graph, its layers and set families, its
provenance and its subsumption order. A model that describes a system
also says how the system behaves, and which part of it belongs with
which, and four gaps kept that out of every figure:

- **Figure kinds.** There was no state, sequence, swim-lane or
  attribute-bearing entity-relationship kind, so lifecycles, sequences,
  lanes and per-group ER figures with their columns could not come from
  the model. Nor was there a figure of the model's bulk, which is what a
  treemap draws.
- **Selection by membership.** A group's tables are top-level entities
  the group refers to. `--at` restricts a figure to the nodes under a
  path, and no path holds exactly one group's tables.
- **Splitting.** Nothing cut a figure into parts by root or by budget,
  or drew ghosts for what lives elsewhere.
- **Labels with counts and summaries.** A group map or a surface map
  carries counts and per-group summaries that nothing computed.

This note records how each is closed and why the shape is what it is.
The reference is the `aontu view` section of
[reference-api.md](../reference-api.md#aontu-view); the shared rows are
in [`test/spec/view.tsv`](../../test/spec/view.tsv) and
[`test/spec/views.tsv`](../../test/spec/views.tsv).

## Constraints carried over from VIEWS.0

[VIEWS.0.md](VIEWS.0.md) set the boundary, and every decision here sits
inside it:

- **No layout algorithm.** A figure is either a fixed grid whose every
  coordinate follows from counts, or a target grammar whose renderer
  lays it out.
- **No node shapes, no colour.** A mark's meaning is carried by text or
  by the style mechanism, never by a shape or a named colour.
- **No view DSL.** A declaration says which projection, not how it
  looks.
- **Byte parity.** Both ports emit the same bytes, and every expected
  value is obtained by running both engines.

## Figure kinds

### `state`

A lifecycle is already in a model that links its states: the
transition from `draft` to `review` is a link, and the link's key is
the event (`submit: refer() & path($.order.review)`). So `state` reads
the edge set, as `graph` does, and draws Mermaid's `stateDiagram-v2` or
a text list of transitions.

The initial state is derived as one no other state enters, and that
derivation fails on the commonest lifecycle: one whose first state is
re-entered when work is sent back. `--root` (already the tree's option
for a named subtree) names the initial states; when it is given, only
the named states are initial, in every part of a split figure. A final
state is one that leaves to no other.

Rejected: an `initial` field in the model. It would make the engine
read an author's key, which ADR-010 refuses.

### `lane`

A swim-lane figure is a flow whose steps each have an actor. The steps
and the flow are the edge set; the actor is a field, read as `layer`
reads its band (`--group-by`, required). Mermaid draws it as a
flowchart with one subgraph per lane.

The text form had to avoid placement. Each step has a column of its
own, in flow order, so no two steps compete for a cell and nothing
needs to be laid out. The flow order is a topological order, least
label first; a loop is entered at its least label, and the edge that
closes it is named in the footer as running back rather than reported
as a loss, because a loop in a flow is a fact, not a drawing failure.

### `sequence`

A sequence is ordered data, not links: a list of steps, each naming a
sender and a receiver. It reads the generated value at `--steps`, with
`--from` and `--to` naming the fields (no defaults, since the engine
does not choose an author's keys). Only that subtree is generated, so a
model whose schema half is not concrete still draws its sequences.

The text form is a lifeline grid. Each lifeline column is a whole
number of characters, every gap wide enough for the name over it and
for each message spanning it; a span's shortfall goes to its last gap,
processed in order of span end, so the result follows from the counts
alone. Participants are numbered (`p0`, `p1`) in Mermaid so a label can
hold anything.

### `treemap`

A treemap is the one packed form VIEWS.0 named as foreclosed by the
integer rule. It is admitted here only because neither profile places
anything: Mermaid's `treemap-beta` lays the tiles out itself, and the
text form is the nested list with a bar of whole cells beside each
weight (`floor(weight × 40 / total)`, at least one cell for a tile that
weighs anything). A tile is weighed by the scalar leaves under it, or
by a numeric field (`--size`), and a tile that weighs nothing has no
area and is counted.

### ER columns

`graph --as er` drew relationships only. `--columns <field>` names a
map on each entity whose keys are its columns. Each column is typed by
the value lattice: the value's own point, else the kind its canon
starts with (`integer & min(1)` is `integer`), else `any`, counted as
`column_unplaced`. The canon rides as the attribute's comment where it
says more than the type. A column holding a link is marked `FK`, and
because graphOf attributes that link to the `columns` map rather than
the entity, the link is re-homed to the entity. That re-homing applies
whenever `--columns` is given, in every kind, so the flowchart and the
surface map see the same relationships the ER figure draws.

## Selection by membership

`--of <path>` draws the members of a node: what it, or any node under
it, links to, with `--member <key>` keeping only the links under that
key. A map of groups therefore selects every group's members at once.
The membership links themselves are not drawn. An edge with one end
outside the selection is left out and counted (`edges_outside`, which
is informational because the selection was asked for), or with
`--ghosts` drawn to a ghost of its far end.

Rejected: a query language over node fields. A selection by what a
group refers to is the selection the model already states.

## Splitting and ghosts

`--split-by <field>`, `--split-roots` and `--budget <n>` cut a `graph`,
`state` or `lane` figure into parts. A part takes its nodes, every edge
touching one of them, and the far end of each edge that leaves it as a
ghost. By root, each root takes what it reaches breadth-first that no
earlier root took, and what no root reaches (a cycle with no way in) is
taken from its least label. A budget alone cuts that same walk, so a
part holds nodes that reach each other.

A ghost is a label (`invoice (in billing)`, or `(outside)` for a node in
no part), because VIEWS.0 refuses node shapes and styling. Its id is
prefixed `x`, which no node id can start with.

The whole figure is drawn first, so the figure's refusals and loss
report are the whole figure's, and each part is held to `--max-rows`
on its own. The report carries `parts` as `{name, text}`; on stdout each
part follows a comment naming it, and a file name takes `{part}`,
replaced by the part's name with every code point outside letters,
digits, `.` and `-` spelled as `_`, its hex and `_` again. The closing
`_` makes the spelling injective (`" a"` and U+020A no longer meet),
and an ER column name is spelled the same way behind a `q_` that no
written name keeps.

Only the node-link kinds split. A part of a matrix, a tree or a set
panel would not stand on its own, and asking is `view_split_kind`.

## Counts and summaries

`--counts` titles a graph subgraph, a layer band or a lane with its
member count; `--count-by <field>` adds the members counted by that
field's value (`billing (3: process 1, table 2)`). A ghost is not a
member. `--collapse` draws a graph as its surface map: one node per
group, and one edge per pair of groups and relation, labelled with how
many edges it stands for. An edge inside one group is counted
(`edges_internal`).

## The view document

Every new option is a declaration key, typed in `aontu:view`. A split
declaration's `out` must hold `{part}`. The declarations are now
generated alone rather than with the whole document, because the
figures this note adds are most wanted for models whose schema half is
not concrete (an ER figure of tables typed `integer`); a figure that
reads generated values generates what it reads.

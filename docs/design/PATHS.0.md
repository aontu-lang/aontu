# Design: first-class paths and the container kinds

*Status: **IMPLEMENTED** (August 2026), in both ports: `path(p)`
captures, `path()` / `map()` / `list()` are kinds, the shared rows are
`test/spec/path.tsv` and `test/spec/containerkind.tsv`, and ADR-015
records the decision. **AMENDED** (ADR-016, later the same review):
the string bridges are gone — a bare string is never a path, the kind
does not promote, `refer()`/`rel()` take path values only, the
`path(...)` call's argument (literal or computed) is the one
conversion — and path values meet by the PREFIX rule, the longer
winning. The amendments below sit beside the text they correct, the
tower document's convention: the reasoning is the record.*

## The problem

An address was a string, everywhere. `refer(t)` checked one,
generation emitted one, the graph read them — and the value model
never held one:

- A resolved link was a `StringVal` with a side-channel `link` stamp
  (`ts/src/val/ReferFuncVal.ts`), needed precisely because the value
  could not carry linkness. The edge set was "the set of these
  stamps". A side channel on a string is the classic symptom of a
  missing kind.
- Addresses in data were ordinary strings until a `refer` met them;
  the address grammar was checked at unification time, not parse
  time; a key rename silently broke every string address — the
  protobuf lesson the G4 survey itself cites against `$.path`
  references applied doubly.
- The boundaries were fine as they were: generated output is JSON, so
  the wire form is a string regardless, and plain JSON-shaped data
  must be able to supply addresses. The question was first-class
  **inside the lattice**, string **encoding at both boundaries**.

Alongside it, two smaller facts. `path(p)` — the function form of a
reference, from the language's earliest era — was fully redundant:
every spelling it covered has a bare-reference form (`path(x.a)` is
`x.a`, quoted segments cover `path("team-pay")` as `$."team-pay"`),
and no document in the repository used it. And the kind system had an
asymmetry: `y: string` unmet refuses to generate, while `y: {}` unmet
generates `{}` — so "this must be a map, and it must be supplied" had
no spelling.

## Rejected designs

**A path argument to `refer` — `refer(p, t?)`.** Mechanically
possible (a function's `prepare` sees its argument before the driving
loop resolves it), but the argument slot already means "the value at
that path": `refer($.std.Service)` resolves its argument to the type
to flow, and pre-resolution a type reference and an address reference
are the same shape of Val, so one slot cannot carry both meanings.
Making the address the argument also moves it to the one author who
does not know it: the address is the field's *value*, supplied by the
data side of the `&`, often in another file, through spreads,
includes, defaults and patches. `[&: refer(T)]` over plain string
data, and `dependsOn?: rel($.T)` in a vocabulary, only work because
the constraint and the value arrive separately.

**A sigil — `%$.a.b` for the path, `%$` for the kind.** The lattice
design underneath was sound, but `%` is the alias sigil with a third
meaning already reserved (IDEAS.md: the argument list), operator
characters are deliberately scarce (`test/spec/op-chars.tsv`), and
the recorded principle (G4 design space, option D) is that everything
a sigil can say, a builtin can say. The number tower's `0d` prefix
shows literal syntax for an opt-in kind *can* land — that pattern is
followed here, with a call instead of a prefix.

**Self-checking path values** (existence checked by the value
itself). A value whose validity depends on the whole tree is a global
constraint: it must keep the pass loop alive, which is exactly the
not-done property that makes `refer` hang inside `type()` bodies (G4
phase 4); it would stop module fragments that address their
consumer's tree from standing alone ("collected, not raised",
`docs/capability-review/g6-distribution.md`); and it would put
effects back into disjunct branches. Checking is a constraint's job
because constraints have the machinery for deferral and timing.

## The design

**Capture.** `path(p)` captures the *spelling* of `p` — the one
non-strict argument position in the language. The capture runs in
`prepare`, before the argument is driven, off the reference's own
segments (`captureSpelling`); a string argument is address text; both
go through `parseAddress`, so what capture admits and what `refer`
reads cannot drift. Anchorless text was `path_address` as first
landed. **AMENDED (after ADR-016 landed): anchorless text is
RELATIVE** — `path("a.b")` converts as `.a.b`, the address the raw
spelling captures, because only raw reference spellings escape
evaluation, not string text missing its anchor; text that spells
nothing once anchored still refuses. A number or a container is
`invalid-arg`. Relative spellings stay relative
(`path(q.r)` captures `.q.r`): the value is position-independent
data, and resolution happens at read sites, which is what preserves
per-instance behaviour under template cloning.

**The kind, under string.** A path value is a scalar of kind `Path`,
one row in `KIND_PARENT` under `String` — the same move that put the
numeric leaves under `number`. Subsumption, the `super()` ladder,
string constraints and string-typed schemas over address fields all
follow from that row. `path()` is the kind; as first landed it
promoted a string that spelled an address into the path value
(`path() & "$.a"` as the mirror of `number & 1`). **AMENDED
(ADR-016): promotion is gone.** The bridge preserved the ambiguity
the kind exists to remove — whether `"$.a"` was a path depended on
what later met it — so the kind now refuses a string as any other
kind does, and the call's own argument (a literal at capture, a
computed string at resolve) is the one conversion. Two concrete
values of different kinds still refuse: `path($.a) & "$.a"` is
`scalar_kind` — the distinction between a path and a string that
looks like one is the feature.

**Meets are syntactic.** As first landed, two path values met only
when equal. **AMENDED (ADR-016): they meet by the PREFIX rule** —
same anchor, the shorter's segments opening the longer's, the LONGER
the result: one address that opens another is the same place, told
more precisely. Incomparable spellings refuse as unequal scalars, and
subsumption follows the meet (a prefix subsumes its extensions).
Still syntactic throughout: meeting by referent would need resolution
inside the meet, making the meet position-dependent — the property
the staging machinery (G8 phase 0) exists to quarantine. Three
consequences carried the rule through the engine: the refer residual
folds AFTER plain values (cjo 120000) so sibling paths merge before
it settles; a second path peer refines a pending address the same
way; and the RESOLVED LINK is a path value, because a string link
could not meet its own address re-stated.

**Generation and canon.** A path value generates as its address
string (the JSON boundary keeps its wire form; the jsonschema
projection says `string`, lossy by the ONTOLOGY.0.md rule). Canon is
the call form, `path($.a.b)`, which reparses to the same value: the
call is the literal syntax for the kind.

**The container kinds.** `map()` and `list()` admit exactly what `{}`
and `[]` admit, and default to nothing. The units keep their
behaviour; the kinds close the asymmetry with the scalar kinds. The
`type({})` near-miss was measured and rejected: marks OR through
direct meets, so `type({}) & {a:1}` drops from generation — types are
consumed via references, whose clone clears the marks, and that model
is not this feature's to change. Kind mismatches reuse the units' own
codes (`map`, `list`): same fact, same code. No argument forms —
element constraints belong to the spreads, and `map(V)` would be a
second spelling of `{&: V}`.

**The convention.** A value constructor's vacuous call is its kind;
the literal is its unit. `path()` fits (paths have no literal, so the
call is the only spelling); `refer()` is untouched — a constraint,
not a constructor, so its vacuous form stays the unmet constraint.

**The verbs.** `$.a` embeds, `path($.a)` names, `refer()` asserts,
`rel()` declares. `path($.a) & refer()` is the checked link; a
`path($.nope)` alone generates, because a document may address things
outside this evaluation, and existence is `refer`'s contract.

## Measured while deciding

Probing the engines settled several questions the design leans on:

- Cross-leaf value meets are disjoint in the house lattice (`1 & 1.0`
  and `1 & 0d1` refuse), which is why promotion lives at the kind.
- `refer() & string & "$.z"` is pinned green (`graph.tsv`), which
  forces `path <: string` — resolved links must satisfy `string`.
- The kinds settle inside `type()` bodies (`type({d: path()})`,
  `type({d: map()})`) — the property `refer` lacks, and the reason
  `rel` exists in its settling shape.
- `*path(.a) | path(.b)` is inert data in disjunct branches: the
  leak-free spelling of alternative addresses (see below for what is
  NOT fixed).

## Not done here, deliberately

- **The stamp stays — on a path value now.** A resolved link is a
  `PathVal` carrying the `link`/`relkey` stamps (AMENDED: ADR-016
  moved the link's value type; a string link could not meet its own
  address re-stated); the graph still reads the stamps rather than
  path values in general. Making checkedness fully intrinsic
  (`graphOf` reading values) remains the next step.
- **Effect timing is untouched.** Two measured behaviours around
  `refer`'s type flow are representation-independent and remain:
  a `refer(t)` that settles inside a *losing* disjunct branch still
  flows `t` into its target (`s: "plain" & ((refer({r:9}) & "$.z") |
  "plain")` leaves `z` with `r:9` — the flow record on the root
  context is replayed by `applyFlows` with no branch scoping), and
  address-side alternatives fail because preferences collapse at
  generation while `refer` needs its address at unification
  (`refer() & (*"$.a" | "$.b")` cannot resolve). Sound
  disjunction-of-links needs branch-scoped flows or earlier
  preference collapse; neither is a paths question.
- **No graph membership for unchecked paths.** Whether a path value
  never met by a `refer` should appear in `graphOf` (today: no —
  edges are checked links) is an open decision recorded here; a vet
  query for unchecked path values is the likely first surface.

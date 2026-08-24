# G8: Generation and abstraction, on the total side of the fork

*Status: implemented — all five phases landed in both ports: `pack`,
`each`, `filter`, `match`, the placeholder `_`, and phase 4's `|>`
pipe (phase 0's defect-fencing half went with G1 phase 0). Per-phase status is in
the [progress register](progress.md), which is authoritative for status;
this document is authoritative for design. Part of the
[capability review](index.md) (August 2026). This document expands gap
G8 — producing N similar children from data without copies that drift,
while keeping the guarantee that Aontu evaluation always terminates.
It resolves the fork sketched in IDEAS.md: total generator combinators
(`each`/`pack`/`filter`/`match`), placeholder arguments, and pipe
sugar are adopted; user-defined functions and recursion are refused.
The arithmetic semantics for IDEAS.md's maths-as-functions are
pre-registered here, not designed.*

## Problem

Producing N similar children from data — one block per service, per
region, per replica — is the bread-and-butter of systems definition.
Aontu's spread (`&:`) applies a template to children that already
exist; nothing in the language can *generate* a child, compute a key
from data, or select a subset. The result is that humans and agents
copy-paste, and the copies drift — which defeats ground-truth-ness
from the inside: a definition whose parts must be kept consistent by
hand is exactly the markdown failure mode the review's verdict
describes.

First failing example. A team's ground truth names its services once,
and wants one deployment block per service:

```aon
# services.aon — the list is the truth
names: [web, auth, billing]

# ...but the map must be written by hand, one copy per service
deploy: {
  web:     { image: "acme/web:1.4.2",     replicas: 2, port: 8080 }
  auth:    { image: "acme/auth:1.4.2",    replicas: 2, port: 8080 }
  billing: { image: "acme/billing:1.4.2", replicas: 2, port: 8080 }
}
```

`names` and `deploy` have no mechanical link. Adding `search` to
`names` changes nothing; an agent asked to "add the search service"
must edit two places and infer the copy-paste pattern from examples.
The spread cannot help: `deploy: {&:{replicas:2, port:8080}}` applies
its template only to keys that exist, and no key exists until someone
writes it. What the author wants to write — one template, keys drawn
from the data — is not expressible today.

Second failing example, and this one is *wrong behaviour*, not a
missing feature. An agent that needs a conditional today reaches for
the only branching construct the language has, disjunction:

```aon
# storage.aon — "either local or s3, then pick local"
store: ({kind: local, path: "/var/data"} | {kind: s3, bucket: b1})
       & {enabled: true}
```

Generation of this value is defective: `DisjunctVal.gen` folds the
disjunct members together instead of distributing the conjunct, so
`({x:1}|{y:2})&{z:3}` produces the merged chimera `{x:1,y:2,z:3}`
rather than a choice — the code admits it in a comment
(ts/src/val/DisjunctVal.ts, ~line 263). A user or agent emulating
"match" via disjunction can silently receive a map containing *both*
branches. The language needs a bounded, correct conditional, and the
defect must be fixed before anything is built near it.

Third, subset selection is inexpressible: "the services with
`debug: true` get a sidecar" has no spelling. The author enumerates
the debug services by hand — a second copy of information the
definition already contains, and a second thing that drifts.

For the agent mission these are one disease. An agent's edits are
only trustworthy when every fact lives in one place; every manual
copy is a place where an agent (or a human) can make the definition
disagree with itself without any conflict being detected.

## Current state

What exists is a solid substrate, and most of it is reusable:

- **Twelve builtins, hard-wired** — at review time; the roster is 28
  now, this design's four included. The parser's `funcMap`
  (ts/src/lang.ts) mapped `upper`, `lower`, `copy`, `key`,
  `type`, `hide`, `move`, `path`, `pref`, `close`, `open`, `super` to
  Val classes. There are no user-defined functions
  (docs/reference-language.md). Adding a combinator is adding a class
  and one `funcMap` entry — no grammar change.
- **Functions already defer.** `FuncBaseVal.unify`
  (ts/src/val/FuncBaseVal.ts) unifies its arguments each fixpoint
  pass and calls `resolve()` only when all are done; until then the
  call survives as itself or inside a `ConjunctVal`. This is
  proto-residuation: the firing discipline a generator needs already
  exists in embryo. `OpBaseVal` (ts/src/val/OpBaseVal.ts) does the
  same for the one operator, `+` (`PlusOpVal`).
- **The spread machinery.** `MapVal` (ts/src/val/MapVal.ts) holds the
  template in `spread.cj`, applies it once per child (the `_spr`
  apply-once marking), clones it per destination with a three-tier
  `spreadClone`, and snapshots path-dependent ref templates
  (`snapshotRefSpread`) so `key()`/`path()` resolve at the
  destination, not the source. This is the most intricate part of the
  engine, and the most heavily pinned: spread.tsv plus its
  `spread-*.tsv` variant files — over half of the shared spec suite
  when this was written, still its largest single family. Generated
  children must flow through exactly this
  machinery.
- **The strain is visible.** `KeyFuncVal.unify`
  (ts/src/val/KeyFuncVal.ts) special-cased `ctx.cc < 3` to delay
  resolution so keys inside spreads and refs resolve at their
  destination, under a comment: "this delay makes keys in spreads and
  refs work, but it is a hack - find a better way". Phase 0 has since
  replaced it with the staging rule below. Generation will
  multiply the situations where a value must wait for its
  surroundings; an ad-hoc pass-count check does not scale to them.
- **Bounded fixpoint.** The unify loop runs a bounded number of
  passes (ts/src/unify.ts — at review time the constant `maxcc = 9`,
  since G5 the configurable `budget.passes` defaulting to 9, with
  `MAXCYCLE = 999` guarding repeated
  node visits). Generators consume passes; the interaction with the
  bound is a design obligation, and the budget story is owned by
  [G5](g5-trust-contract.md).
- **Trial unification exists.** `ctx._trialMode` (ts/src/ctx.ts) lets
  `DisjunctVal` try alternatives without recording errors — the
  mechanism `filter` and `match` need to test unifiability.
- **Token reservation is already enforced.** test/spec/op-chars.tsv
  pins `6/2` and `6%2` as plain text and `6-2`/`6*2` as parse errors:
  the grammar is deliberately holding `-` `*` `/` `%` free, matching
  IDEAS.md's stated principle — "in general prefer using new
  functions instead of creating new tokens or syntax!".
- **IDEAS.md is sketches only.** Placeholder args (`upper(_)`,
  `_+2`), function ranking, maths-as-functions, `replace()`,
  namespaced `def()`, `match()`, `each`/`pack`/`filter`, and `|>`
  piping are all unimplemented, and the recursion the `def()` sketch
  implies is exactly what this document refuses.

What structurally blocks the capability: (1) no Val can create map
keys that were not in some source text — `MapVal.unify` only iterates
its own and its peer's existing keys; (2) `_` is ordinary text to the
parser, so placeholders do not parse; (3) evaluation staging was
ad hoc (the `cc < 3` hack) rather than a rule — phase 0 has since made
it one; (4) the Go port
(go/func.go, go/mapval.go, go/unify.go) mirrors all of the above and
must move in lockstep.

## Prior art

Every surveyed language that generates structure from data does it in
one of three ways, and the safety record tracks the choice.

**Comprehension syntax** — CUE (`for x in a if x > 1 { ... }`, with
interpolated field names), Pkl (`for`/`when` object generators),
Jsonnet and Starlark (Python-style comprehensions), Terraform
(`for_each`/`dynamic`). These are total when iteration is over finite
data, which all of them enforce. The cost is grammar: keywords,
scoping rules, and — in CUE's documented history — interactions with
closedness and defaults that contributed to a multi-year evaluator
rewrite, and a surface area its highest-profile adopter (Dagger)
cited when dropping it. Terraform contributes the key determinism
lesson: its index-keyed `count` churns every downstream instance when
a list reorders, which is why `for_each` over *maps with stable keys*
replaced it as best practice — generated children must be keyed by
data, not by position.

**Total combinators** — Dhall (folds, no recursion: "if an expression
type-checks then evaluating it always succeeds in finite time"),
Starlark (no recursion, no `while`, deterministic iteration). This is
the camp whose guarantee — evaluation terminates by construction —
every credible unattended-evaluation story lands on (Dhall, Starlark,
CEL, Cedar). CEL adds the backstop: a statically estimated cost
budget even for total programs, which is G5's territory.

**User-defined functions** — Jsonnet (Turing-complete, by design),
Nickel, KCL. CUE's deliberate refusal of user functions is the
counter-position: every file stays analysable without executing
anything, and evaluation stays hermetic and order-independent. The
Nickel ecosystem contributes a warning ("union and intersection
contracts are hard, actually"): the moment function values cross into
the data plane, otherwise-simple semantics (disjunction, export)
become subtle. Functions should not become values.

For the placeholder idea specifically, LIFE's residuation (Aït-Kaci &
Podelski, TOPLAS 1994) is exact prior art: a function whose arguments
are insufficiently instantiated suspends as a passive constraint and
fires when unification concretises them. [G1](g1-constraint-algebra.md)
adopts residuation for bounds with cross-field references; G8 reuses
the same account rather than inventing a second staging story.

## Design space

**A. Generation lives in tooling, not the language.** The
[G7](g7-machine-access.md) surface (or any external script) expands a
data list into children and patches them in; the language stays as it
is. Rejected: the expanded output is a second artifact, and the copies
drifting *is the disease* — the moment generated children are
materialised outside the definition, editing the data no longer
changes them, and validation (G2) checks the copies rather than the
rule. Single-source requires the generator to live where the data
lives.

**B. CUE-style comprehension syntax.** `for`/`if` clauses, computed
keys via interpolation. Proven semantics, familiar to CUE users.
Rejected: it adds keywords and string-interpolation tokens to a
JSON-superset grammar whose smallness the review names as a moat —
grammar size is acquisition cost for LLMs; it contradicts the
project's own stated principle (functions over tokens); the spread
and optional-key grammar already depends on parser internals fragile
enough that AGENTS.md warns a minor @tabnas bump can silently change
them; and it walks straight into the trap the index names
surface-area creep toward CUE.

**C. Total generator combinators as builtin functions.** `each`,
`pack`, `filter`, `match` join the builtins (twelve when this was
written, twenty-four when phase 1 landed the first two); placeholder `_`
gives templates residuated per-child computation; `|>` is optional
parse-time sugar. Combinators iterate only finite, settled data and
cannot recurse, so totality is structural; G5's budgets remain a
backstop, not the guarantee. Costs: argument-position conventions are
less pretty than syntax; deep nesting of calls is noisier than
comprehensions; the staging rule must be made principled first.

**D. `def()` — namespaced user functions without recursion.** The
IDEAS.md sketch, restricted to non-recursive bodies to preserve
totality. Deferred entirely, not merely postponed to a phase:
Aontu already has an abstraction mechanism native to its semantics —
a named, `hide()`-marked template applied by spread, reference, or
(with this design) a combinator, with `_` supplying the per-use
argument. `def()` adds call syntax, a namespace scheme, arity errors,
and a static no-recursion check (including recursion through mutual
references), for expressive power the combinator-plus-template layer
already covers. It is the first step onto the complexity clock's
general-purpose slope, and CUE's refusal of it is one of that
language's decisions the survey endorses. Revisit criteria are in
Open questions.

**E. A pre-unification macro stage.** Generation runs as an explicit
expansion phase before unification, keeping the fixpoint untouched.
Rejected: the data a generator consumes is itself assembled by
unification — `names` may be merged from three files, constrained by
a schema, and completed by a `$var` binding — so generation must be
able to observe unification results. A separate stage either forbids
that (crippling) or runs the evaluator twice with subtly different
semantics (two mental models, two canon stories).

**Recommendation: C.** It honours the language's own design
principle, adds zero grammar beyond `_` (and optionally `|>`), reuses
the existing function-deferral and spread machinery, keeps every file
statically analysable (a combinator call is data — a named node in
the tree — not code), and keeps the termination guarantee structural.
A is refused on single-source grounds, B on grammar-size grounds, D
on complexity-clock grounds, E on staging grounds.

## Proposed design

Four combinators join `funcMap`. Signatures are data-first (the
subject reads first, as in `close(x)` and `copy(x)` today), and the
pipe — if adopted — inserts the piped value as *first* argument,
Elixir-style. *(One landed exception, the register's G8.4 departure:
a constraint atom that already BUILT cannot be piped into — an atom
with a complete argument list folds into a residual at
construction, and the Go residual keeps no atom to rebuild; the
refusal is `pipe_target`, pinned by `pipe.tsv:pipe-into-built-atom`.)*
This deviates from the IDEAS.md sketch (data-last,
F#-style); the deviation is deliberate: without pipes, data-first
calls read as "pack these names into this template", and pipes must
follow the calls, not the reverse.

**`pack(data, tmpl)` — data to keyed children (map).** For each child
of `data`, produce one child of the result map. Keys: for a list of
strings, the strings themselves; for a map, its keys. Each generated
child is `tmpl` cloned per destination — exactly a spread template
application, reusing `spreadClone` and the snapshot discipline — so
`key()` resolves to the generated key and `_` (below) unifies with
the source child value. Duplicate generated keys are not an error:
the colliding children unify, exactly as duplicate source keys merge
today (test/spec/map.tsv), so conflicts surface as located two-site
errors. The first failing example becomes:

```aon
# services.aon — single source
names: [web, auth, billing]

deploy: close(pack($.names, {
  image: "acme/" + key() + ":1.4.2"
  replicas: *2 | integer
  port: *8080 | integer
}))

# an override composes by ordinary unification
deploy: billing: replicas: 4
```

**`each(data, tmpl)` — data to a list.** One element per child of
`data`, in source order for lists and sorted-key order for maps
(matching canon's key ordering, `MapVal.canon`, and the Go port's
JSON marshalling — generated order must be identical across
implementations and runs). `tmpl` unifies with each element; omitted,
`each(m)` converts a map's children to a list.

**`filter(data, cond)` — subset by ALREADY SATISFIES.** Children of
`data` that the condition adds nothing to are kept (keys preserved for
maps, order preserved for lists); children that fail are dropped, not
errors — the test runs under trial mode (`ctx._trialMode`,
ts/src/ctx.ts), the same mechanism disjunction uses. `cond` is any
Aontu value, so [G1](g1-constraint-algebra.md) atoms compose:
`filter($.deploy, {replicas: min(3)})`.

*This paragraph said "unify with" until phase 2 landed, and the
example below is why it does not now: a map is OPEN, so a service
without a `debug` key unifies with `{debug:true}` by GAINING it, and a
filter that keeps everything that could be made to match keeps
everything. "Already satisfies" is the meet changing nothing — the
same question `subsume` asks, answered locally.*

```aon
# sidecars for exactly the debug services — no hand-kept list
debugged: filter($.services, {debug: true})
sidecars: pack($.debugged, { image: "acme/debug:1.0" })
```

(`pack` over a map keys the generated children by the source map's
keys, so the sidecar map mirrors the debugged service names
directly.)

**`match(v, p1, r1, p2, r2, ..., d?)` — bounded conditional.**
Alternating pattern/result arguments, optional trailing default. The
first pattern (in argument order) that `v` successfully unifies with
— trial mode again — selects its result, and **the result is the
answer**.

*This said the answer was `v & p_i & r_i` until phase 2 landed. Under
that rule every arm whose result is not itself a `v` is a
contradiction, the example below among them — a string scrutinee and
map results. A match MAPS a value to another value.*
No pattern matching and no default is a located error whose report
lists the patterns tried (the admissible-alternatives shape,
reported via the [G2](g2-validation-verb.md) error contract). The
bounds that keep `match` from becoming a general conditional: the
scrutinee is matched by *unifiability only* — there are no boolean
guards, no comparisons beyond what G1 atoms already are, no
fallthrough (first match wins, in a spec-pinned order), and the whole
form is total. `match` is the correct spelling of what the second
failing example reached for; the `DisjunctVal.gen` distribution
defect gets fixed independently (it is a bug, not a feature gap), but
`match` removes the incentive to lean on it.

**Placeholder `_`.** `_` parses to a `PlaceVal`
(ts/src/val/PlaceVal.ts, new). A function or operator with a
placeholder argument residuates on its *unification peer*: the peer
fills the hole, and the call's result is the unification result —
`upper(_) & foo → "FOO"`, `x:&:{m: _+2} x:a:m:1 → a.m:3`, exactly the
IDEAS.md sketch. Inside `pack`/`each`/`filter` templates, `_` binds
the current source child. The semantics are residuation as specified
by [G1](g1-constraint-algebra.md) (which owns the mechanism for
bounds); G8 adds no second scheduling story. Two placeheld functions
meeting (`upper(_) & lower(_)`) is a located error; IDEAS.md's
`rank()` resolution is refused (Boundary). Note one compatibility
cost: today `_` is plain text (`a:_` is the string `"_"`), so
reserving it is a breaking change that must be flagged and
spec-pinned.

**String construction stays function-based.** `+` concatenation
already composes with functions and references
(docs/reference-language.md: `upper(a)+b → "Ab"`), and combined with
`key()` inside generated children it covers computed names, as in the
`image` line above. Interpolation syntax (`"acme/\(name)"`) is
refused: it adds lexer states and canon escaping rules to buy a
second spelling of something the language has — and `+` chains are
the easier form for constrained generation of Aontu by models.

**The staging rule (replacing the delay hack).** One rule, spec-
pinned, governs when generation happens: *a value whose answer
depends on where it is residuates until the MODEL has settled, then
fires exactly once, and its output replaces it.* "Fires once" reuses
the spread's apply-once discipline (`_spr` marking in
ts/src/val/MapVal.ts, and — since phase 0 — ts/src/val/ListVal.ts).
Termination is structural: firing strictly decreases the number of
unfired generator instances; a template may textually contain further
generator calls, but clones are one per settled data child and
nesting depth is fixed by the source text, so total firings are
bounded by a product of finite, already-settled data sizes — no
recursion can arise.

*Settled how.* The rule as first written said "until its DATA
ARGUMENT is settled (DONE)". Phase 0 found that too weak to be the
rule it claimed: `move()` hides its source one pass AFTER it copies
it, so a value whose own path and whose arguments have all settled
can still be moved out from under itself, and a `key()` that answered
on that evidence answered for the ghost. What landed reads stability
of the WHOLE MODEL — the pass loop compares the canon it enters each
pass with the previous pass's, and a staged value fires on the first
pass where they are identical, because nothing moved and so nothing
will move it again. That also settles where the rule is stated: the
pass loop (ts/src/unify.ts, go/unify.go), which is where two
consecutive models exist to compare, rather than FuncBaseVal, which
reads the flag (`AontuContext.settle` / `Ctx.settle`). This replaced
`KeyFuncVal`'s `cc < 3` check as a zero-behaviour-change refactor
gated on the full existing suite, before any combinator.
Generators consume fixpoint passes; per G5, exhausting the pass
budget with generators still unfired is a distinct semantic error
("budget exhausted", G5's contract), never silent truncation. The
budget itself — whether `maxcc = 9` scales with generator firings —
is G5's decision.

**Composition with the template machinery.** Once fired, generated
children are ordinary children: a destination map's `&:` spread
applies to them (and to children generated later by a sibling
conjunct — the apply-once marking already handles late-arriving
keys); `close()` counts them as allowed keys, so `close(pack(...))`
seals the generated shape; `key()` and relative references resolve at
the generated paths via the existing snapshot machinery. Each of
these interactions gets its own spec file, in the style of the
spread-*.tsv corpus, because 25 shared spec files exist precisely
because this machinery is where behaviour hides.

**Canonical form.** An unfired generator canons as its call —
`pack($.names,{"image":...})` — which reparses to the same value, so
canon convergence holds for incomplete models. A fired generator
canons as its output structure, exactly as `lower(HELLO)` already
canons as `"hello"` once resolved (test/spec/spread.tsv,
template-func-canon). `_` canons as `_`. `|>`, if adopted, never
appears in canon: it is parse-time sugar, desugared before the tree
exists, so canon and the Go parser are untouched by it.

### Arithmetic semantics, pre-registered

IDEAS.md sketches maths as functions — `add(x,y)`, `sub`, `mul`,
`div`, `mod`, `rem` — rather than as operator tokens, and the
[Boundary](#boundary-what-we-will-not-do) below keeps `-` `*` `/`
`%` reserved. Designing those functions is not this document's work,
but the *semantics* they must have can be settled now, at no cost,
so whoever lands them inherits one decision instead of making six
under deadline. All of it is prior art from the same author family:
boru (github.com/boru-lang/boru, MIT) ships these rules and pins
them in lang/spec/arithmetic.tsv and
lang/spec/numeric-cross-product.tsv, whose rows translate directly
into test/spec/*.tsv.

1. **Checked integer arithmetic.** `add`, `sub`, `mul` and `pow`
   over two integer-kind operands raise a **located overflow error**
   when the exact result leaves the integer range — never a
   two's-complement wrap, and never a silent degradation to
   `number`. Both of those are answers that look right and are not,
   which is the failure mode the number model exists to refuse
   (docs/design/number-model.md). boru arrived here after shipping
   the opposite: its design/INTEGER-OVERFLOW-STRATEGY.5.md records
   three contradictory silent behaviours in one language, and
   concludes that documentation cannot be the fix for a silent wrong
   answer.
2. **Integer division truncates toward zero.** `div(-7, 2)` is `-3`,
   not `-4`. Truncation rather than floor, stated once and
   spec-pinned, not left to whichever host language's `/` each port
   happens to call.
3. **Division or modulo by zero is a hard error for exact kinds.** A
   ground-truth language has no business manufacturing infinity: a
   definition that divides by zero is wrong, and the evaluator
   should say so with a located nil. Aontu cannot even represent the
   alternative — there is no way to write a non-finite number, an
   overflowing literal being a `not_number` error nil — so
   propagating one out of arithmetic would invent a value no
   generated JSON could carry.
4. **IEEE semantics only where a `number` operand is present.** With
   a number-kind operand the operation follows IEEE-754 binary64,
   with the JSON-superset constraint still biting: an infinite or
   NaN result is a located error, not a value, unless and until
   Aontu gains a notation for them (docs/design/number-model.md,
   known edge 4). This is the one point where Aontu must depart from
   boru, which has `inf`/`nan` literals precisely because it is not
   a JSON superset.
5. **Kind contagion extends to every new operator.** Rule R5 — no
   operator or function may introduce a kind narrower than its
   inputs — is written up for `+` and for `upper()`/`lower()`
   because those are the operations that exist today; it is a rule
   about operations, not about `+`. An integer-kind result requires
   integer-kind operands *and* a result that satisfies the kind
   rule; any number-kind operand makes the result number kind. Each
   arithmetic function therefore lands with its own cross-product
   rows — every kind combination, asserting value *and* kind — in
   the manner of numeric-cross-product.tsv, and those are canon
   rows: per [G5](g5-trust-contract.md), a gen row cannot see a
   kind.

**API/CLI surface.** None new. The combinators are language-level;
evaluation, `--canon`, and the G2/G7 verbs see generated children as
ordinary values. The LSP inherits hover/diagnostics for the new Vals
through the existing document pipeline (ts/src/lsp.ts).

## Boundary: what we will not do

- **No recursion, anywhere** — the termination guarantee is the
  product; this is the review's first trap to refuse
  (Turing-completeness).
- **No `def()` user functions in this design** — named hidden
  templates plus `_` cover the demonstrated need at a fraction of the
  analysability cost; deferred entirely, with revisit criteria below.
- **No comprehension keywords (`for`/`if`/`in`)** — grammar size is
  LLM acquisition cost and parser risk; the index's
  surface-creep-toward-CUE trap.
- **No string interpolation syntax** — `+` and functions already
  construct strings; one spelling per meaning.
- **No computed-key syntax** — keys computed from data are `pack`'s
  job; a key-position expression grammar is a large change for no
  added power.
- **No boolean guards or comparisons in `match`** — matching is by
  unifiability only, or `match` becomes a general conditional that
  harms analysability.
- **No `rank()` for competing placeheld functions** — an ordering
  channel between functions is a second preference system; the
  conflict stays an error until real models demand otherwise.
- **No new operator tokens** — `-` `*` `/` `%` stay reserved
  (test/spec/op-chars.tsv); maths beyond `+` arrives, if ever, as
  functions, and designing them is outside G8. This document
  pre-registers the semantics those functions must have
  ([above](#arithmetic-semantics-pre-registered)); it does not
  build them.
- **No lazy-evaluation redesign** — generation works inside the
  existing strict fixpoint; changing the evaluation strategy is a
  different, larger project.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Generator/spread interaction regresses the spread corpus (25 spec files) | Medium | High | Land the staging refactor (Phase 0) with zero behaviour change first; add gen-x-spread/close/key spec files before code; property-test commutativity and idempotence over generator-bearing values |
| Fixpoint budget (`maxcc = 9`) exhausted by nested generators, surfacing as wrong "cannot resolve" errors | Medium | High | Settled-argument rule makes firing eager; budget exhaustion is a distinct G5 error, never silence; spec rows pin nesting depths 2-3 |
| TS/Go divergence in generated key order, trial-mode behaviour, or clone-graph artifacts | Medium | High | Order pinned to sorted keys (already canon's and Go marshalling's order); every behaviour lands as shared TSV rows first; AGENTS.md parity discipline (no Go skip list) unchanged |
| Canon round-trip breaks for unfired generators or `_` | Low | High | Canon rows in the same TSV files as gen rows from Phase 1; canon convergence asserted for unfired forms explicitly |
| Reserving `_` breaks existing documents using it as text | Low | Medium | Breaking-change flag in CHANGELOG; a spec row pins the new parse; migration is mechanical (quote `"_"`) |
| `filter`/`match` inherit the DisjunctVal.gen distribution defect through trial unification | Medium | Medium | Fix or fence the defect (ts/src/val/DisjunctVal.ts) before Phase 2; add spec rows for match-over-disjunct scrutinees |
| Performance: pack/each clone templates per child on large data (the known dominant cost of spread application) | Medium | Medium | Reuse tiered `spreadClone` and apply-once `_spr` discipline; perf-annotate spec fixtures; G5 budgets cap runaway cost |
| Placeholder parsing destabilises the fragile @tabnas grammar (AGENTS.md warning) | Medium | Medium | `_` lands in its own phase with exact-pinned parser versions; op-chars.tsv-style rows pin every adjacent token interaction |
| Adoption: combinator calls read worse than comprehensions to CUE-trained users | Medium | Low | Documentation leads with the drift argument; `|>` sugar recovers left-to-right reading; grammar smallness is the trade being bought |
| `match` grows into a general conditional through user pressure | Medium | Medium | Boundary is explicit; unifiability-only is spec-pinned; feature requests route to G1 atoms, not guards |

## Implementation plan

Spec-first throughout: every behaviour lands as test/spec/*.tsv rows
agreed before code; TypeScript (canonical) implements; the Go port
follows to green on the identical rows. At every phase, all existing
spec rows and canon convergence must not
regress; the spread corpus is the regression canary.

**Phase 0 — staging rule (S). LANDED.** The `KeyFuncVal` `cc < 3`
delay is replaced by the model-settled residuation rule, stated in
the pass loop (see *Settled how* above); zero behaviour change across
the whole shared suite ([row counts](progress.md) live in the
register). Files: ts/src/ctx.ts, ts/src/unify.ts,
ts/src/val/KeyFuncVal.ts, ts/src/val/ListVal.ts; go/ctx.go,
go/unify.go, go/func.go, go/listval.go. The acceptance test is the
existing spread-key corpus, as planned — but the phase did not land
row-free: it exposed a missing apply-once guard in ListVal (a
residuating list template was re-applied every pass, doubling its
canon), and the four `spread-nested-list-key*` rows in
test/spec/spread.tsv pin the documents that fixed. Fix or fence
the DisjunctVal.gen distribution defect (ts/src/val/DisjunctVal.ts,
go/disjunct.go) here, with its own rows in disjunct.tsv — **fenced**
with G1 phase 0.

**Phase 1 — `pack` and `each` (M). LANDED.** Spec files gen-pack.tsv,
gen-each.tsv, gen-spread.tsv, gen-close.tsv, gen-key.tsv, as planned
(71 rows). Files: ts/src/val/PackFuncVal.ts, ts/src/val/EachFuncVal.ts
(new), ts/src/lang.ts (`funcMap`, arity, the positional-argument set);
go/generate.go (new), go/func.go, go/mapval.go, go/lang.go. No
generated-children admission was needed in MapVal after all: a fired
generator RESOLVES to an ordinary map or list at the call's position,
so the destination's spread, `close()` and references reach it through
the machinery that was already there — which is what gen-spread.tsv
and gen-close.tsv pin. The departures are in the
[register](progress.md); the sharpest is that a generator's template
must be CLONED per destination where a spread may share one.

**Phase 2 — `filter` and `match` (M). LANDED.** Spec files
gen-filter.tsv and gen-match.tsv (32 rows), including the no-arm
error rows. Files: ts/src/val/FilterFuncVal.ts,
ts/src/val/MatchFuncVal.ts (new), ts/src/val/FuncBaseVal.ts (the
shared trial meet); go/generate.go, go/func.go. The trial-mode
surface needed no change in either ctx: the flag disjunction already
sets was exactly the one to lend. Two of the semantics as written
could not be evaluated — see the corrections above and the
[register](progress.md).

**Phase 3 — placeholder `_` (M/L; the parser phase). LANDED.** Spec
file place.tsv (37 rows), as planned, including the compatibility
rows. Files: ts/src/val/PlaceVal.ts and go/place.go (new),
ts/src/lang.ts and go/lang.go (a value keyword — no operator config
was needed, `_` being a value rather than a token),
ts/src/val/FuncBaseVal.ts, ts/src/val/OpBaseVal.ts, go/func.go,
go/op.go (fill on peer), and ts/src/unify.ts / go/unify.go, where a
placeheld operator has to DRIVE: a scalar asked to unify with `_ + 2`
sees an operator rather than a hole and refuses it on kind. Both
published grammars and both LSP literal lists carry it too.

**Phase 4 — `|>` sugar (S, optional). LANDED.** Parse-time
desugaring only; pipe.tsv's canon rows all show call forms, proving
canon never emits the token. One departure, recorded in the
register and in the pipe rule above: a built constraint atom cannot
be piped into (`pipe_target`). Files: ts/src/lang.ts, go/lang.go. The
drop clause was not exercised: it asked for adoption evidence that
call nesting is acceptable, and there is none either way for a
capability that shipped in the same series. What landing it cost was
one operator and one shared call builder per port — the `f(...)`
handler and the pipe now go through the same `buildCall`, so the
arity check, the comma-group rule and the raw-value conversion are
stated once instead of twice.

Sequencing within the review: index.md places G8 in Phase C. Phase 0
here is a pure engine cleanup with independent value (it removes a
documented hack) and can land earlier without committing to the
combinators.

## Open questions

- ~~**Keying `pack` over lists of maps.**~~ **Settled by phase 1:
  the third option.** A packed list element that is not a string is
  refused with the registered `pack_key` error, so authors `pack`
  over extracted names and keys stay data. (The question as posed:
  a list of service *records* has no evident key — require a key
  field by convention, add a key-selector argument, or refuse
  list-of-maps data; the Terraform stable-keys lesson versus arity.)
- **`_` scoping under nesting.** When a `pack` template contains an
  `each`, which generator's child does an inner `_` bind? Innermost-
  binder lexical scoping is the presumption, but the alternative
  (an explicit depth argument mirroring `key(n)`) is more
  Aontu-like. *(The stated decision criterion — nested-generator
  models occurring in practice before Phase 3 — expired: Phase 3
  landed without such models forcing the question, so
  innermost-binder stands as the shipped presumption and the depth
  argument remains an open, additive option.)*
- **What `filter`'s trial observes.** Does `{replicas: *2|integer}`
  in a candidate satisfy `cond` `{replicas: 2}` (default considered)
  or not (only asserted structure counts)? Same question for
  closedness. Decided by: consistency with how disjunct trials treat
  defaults today, and by G3's subsumption semantics — `filter` must
  not become an accidental second subsumption with different answers.
- **Whether generator firings share `maxcc` or get their own budget
  dimension.** Owned by G5; G8's need is only that exhaustion is a
  distinct error. Decided by: measurement on nested-generation
  fixtures once Phase 1 exists. *(As landed, G5's budgets are
  `passes` and `depth`, shared by generator firings, and exhaustion
  IS the distinct `budget_passes` error — G8's need is met; a
  dedicated generator dimension remains open on measurement.)*
- ~~**`match` result shape.**~~ **Settled by phase 2: the result
  alone.** Exactly as this question's decision criterion predicted,
  the Phase 2 drafts decided it — under `v & p_i & r_i` every arm
  whose result is not itself a `v` is a contradiction — and the
  match section above records the correction in place. (The
  question as posed: scrutinee-flows-into-result is more
  lattice-natural; pure selection is easier to explain.)
- **`def()` revisit criteria.** Reopen only if (a) real models show
  named templates plus `_` failing to express a recurring
  abstraction, and (b) the proposed `def()` remains checkably
  non-recursive including through references, and (c) G5's budget
  and G6's module identity stories are in place to carry it. Absent
  all three, the refusal stands.

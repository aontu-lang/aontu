# `emit`: apply-templates as an engine builtin

*Design note, 2026-09-04. The rule layer of
[G9](../capability-review/g9-transformation.md) — its phase 6 — spelled
out as a mechanism rather than as a plan. Companion to
[TEMPLATE.0.md](TEMPLATE.0.md), which is the target-syntax surface that
desugars to what this note specifies, and to
[GENERATION-FORMS.0.md](GENERATION-FORMS.0.md), which covers the other
two generation forms. Every claim marked VERIFIED was run against the
built CLIs at 0.56.0, most of them against
[`voxgig/podmind`](https://github.com/voxgig/podmind)'s backend at
`ab7f333` — twelve deployed Lambda handlers generated today by a Node
library. This note is design; status lives in the
[progress register](../capability-review/progress.md).*

## Why: four prototypes with no apply-templates in them

G9's prior art calls apply-templates the thing worth keeping from XSLT,
and its
[§2](../capability-review/g9-transformation.md#2-the-rule-layer--apply-templates-in-the-engine)
designs it. Four successive prototypes of a generator for those twelve
handlers were built, and **not one of them contained an
apply-templates**. Each was a functional transformation — a `pack`
whose template computed every fragment in place, with the target code
carried inside aontu strings — so the output shape was welded to that
one target and the rule layer was never exercised.

The absence is the finding. The design's own centre had not been tried,
and every surface built without it drifted into the shape XSLT's critics
complain about: action at a distance with none of the compensating
structure.

## D1. The rule table is DATA, not argument positions

G9 §2 writes the table as the arguments of a `match` call. A table
written instead as a **list of records** is the same table with three
properties the argument form does not have: a template is addressable,
it can carry keys of its own, and the table is a value a document can
hold several of. The last matters immediately — the assessed backend
produces three artifacts from one model, and three tables read better
than one table with a discriminator in every pattern.

```aon
[ {match: <pattern>, esc?: <variant>, replace?: {<KEY>: <expr>, …}, body: [ … ]}, … ]
```

`match` is an ordinary aontu value used as a pattern, matched by
unifiability, exactly as `match()` and `filter()` already use one.
**This adds no second rule engine and no second pattern language.**
`body` is a list of output pieces. `replace` is
[TEMPLATE.0.md](TEMPLATE.0.md)'s substitution map and `esc` names the
escape variant its values take; both are specified there, including the
rule that escaping is ON and `esc` is optional.

**A single template may be written as the map itself** — the list of
one — because a map is never a list and the two are told apart by kind,
exactly as `match()` tells its patterns apart. Every inline site in the
worked generator is one template, so this is the common case.

## D2. `emit(select, table)`, and the result is flat

```
emit(select: any, table: [&: {match: any, esc?: string, replace?: {}, body: [&: any]}]) : [&: %piece]
```

For every node in `select`, in order: try the table's templates in list
order, take the first whose `match` the node unifies with, and
instantiate that template's `body` **against that node**.

**The result is FLAT, and that is a constraint rather than a
convenience.** A body nests one level wherever an `emit` appears in it;
the builtin splices those results in and returns a flat sequence of
pieces — `[&: string]` before the fragment algebra lands, `[&: %piece]`
after it. G9's
[fragment algebra](../capability-review/g9-transformation.md#amendment-2026-09-04-second-aontucode-and-the-fragment-algebra)
is flat because the nested spelling refuses even a valid instance in
both ports (VERIFIED), and a dispatch returning a tree would undo that
ruling.

**`emit`, not `apply`.** `apply` is XSLT's word and carries the
lineage, but in a language that has functions it reads as function
application, which this is not. `emit` says what the call produces, is
one syllable like `pack`, `pick`, `join`, `match` and `hide`, and pairs
with the vocabulary: `emit` produces `aontu:code` pieces and `render`
turns them into bytes. It reads as a side effect only until that split
is stated — nothing is written until `render`.

## D3. No match is an error; an empty selection is the conditional

**`onNoMatch` is `fail`.** XSLT's built-in rule copies an unhandled
node's string value into the result, which for code output means model
data landing silently in the middle of a source file. That is the
single worst default in the prior art and it is refused.

**An empty `select` emits nothing, and that is the whole conditional
mechanism.** It is what removes the invented `when` directive earlier
prototypes kept reaching for. A handler emits its gateway block only
when the service has an S3 event; written as apply-templates that is

```aon
emit(filter(.on.file.events, {source: 's3'}), <table>)
```

which selects nothing for the ten services that have none. There is no
branch to write, and none to read.

## D4. There is no `mode`, because a table is a value

XSLT has two constructs that are easily merged. A **named** template
(`<xsl:template name="x">`, invoked by `<xsl:call-template>`) is a
subroutine with no pattern. A **mode**
(`<xsl:template match="p" mode="toc">`) is a second traversal of the
same nodes producing different output. The handlers need the second: a
`listen` entry and a `client` entry are both `{pin: string}` and differ
only in which output the caller wants.

An earlier spelling gave a template a `mode` key and `emit` a third
argument. **Both are unnecessary.** Because a table is an ordinary
value, a mode is a table with a name, and naming a value is something
the language already does:

```aon
wiretpl: [{match: {pin: string}, replace: {PIN: .pin}, body: [ … ]}]
…
emit(.listen, $.wiretpl)
emit(.client, $.wiretpl)
```

VERIFIED, one table used from two sites. **The rule layer carries one
concept where XSLT carries two**: a named template is a table of one
used once, a mode is a table used from several sites, and neither needs
a keyword. `emit` stays two-ary.

## D5. How a selector resolves, and why it cannot be counted

`emit(.client, T)` raises the question directly: written where it sits
— inside a `{match, body}` record, inside a list — there is no `client`
key anywhere in scope. **A selector is not resolved lexically.**
VERIFIED, that spelling is `no_path`.

**A selector is part of a body, so it resolves against the node the
enclosing template matched** — the same rule as the body's own
substitutions, and one sentence covers both. `emit(.client, T)` inside
the file template means *the `client` field of the service this
template matched*. Because each instantiation is its own copy, the
selector is evaluated once per matched node in that node's context,
which is exactly what XSLT means by evaluating `select` at the current
node.

**The engine already resolves "where the value lands" — but by
COUNTING, and counting does not compose.** Both ports agree on both
probes:

| spelling, from inside `[&: {q: …}] & .ls` in a map holding `nm` | outcome |
| --- | --- |
| `.nm`, `..nm` | `no_path` |
| `...nm` | resolves — element, list, enclosing map |

Positional resolution exists and is exact. But the count is taken
wherever the value comes to rest, and a staged result carries its
pending template with it, so enriching a node-set with a relative
reference and consuming it in a second spread re-roots the first
template at the second's position — VERIFIED, `no_path`, in both ports.
The same chain with an ABSOLUTE reference composes correctly. **A
relative reference does not survive being consumed elsewhere.**

That is the builtin's argument from the selector's side: `emit` binds a
body to a **named origin — the node it matched — rather than to a
number of dots**, so composing two dispatches cannot shift what a
reference means.

**The nesting rule.** An inline table nested in a body creates a
nesting XSLT never had, since its templates are flat. Inside a nested
template, `.x` is the INNER node; an inner template does not reach the
outer one, because the only spelling that could is a dot count and a
count does not survive the composition. **The selector is the channel**:
evaluated at the outer node, and what it selects is all the inner
template sees. That is XSLT's rule too, and it is what the handlers
use.

## D6. A selector is a VALUE; `path()` is the wrong tool for it

`.client` is an ordinary relative reference in an ordinary strict
argument position: it resolves before `emit` sees it, and what `emit`
receives is a list. Nothing about the argument position is special —
the single special rule is D5's.

A capture buys nothing and costs several things:

1. **It is the spelling wherever it is written.** VERIFIED:
   `path(.client)` generates `".client"` at the document root, nested
   two deep, and inside a spread template alike. It postpones "relative
   to what" rather than answering it.
2. **Nothing dereferences a path value.** VERIFIED: with
   `cap: path(.client)`, `use: $.cap` is `".client"`. `refer()`
   constrains an address to resolve and the field keeps the address.
3. **It would be the second non-strict argument position.** The
   language reference calls `path(p)` "the one non-strict argument
   position in the language", and its own call is the marker;
   `emit(.client, T)` would be non-strict invisibly, which is the
   reserved meaning
   [ADR-010](../../ADR.md#adr-010--no-magic-keys-or-paths-the-tree-at-all-levels-is-user-space)
   exists to keep out.
4. **It would defeat the descent's totality argument.** G9 §2 rests on
   links not being edges: `refer`/`rel` create no structural edge and
   the descent follows `peg` only. An address-valued selector makes
   `emit` a traversal of the LINK graph, which the design explicitly
   permits to be cyclic.
5. **A value selector is strictly more expressive, and it is why there
   is no XPath here.** `filter(.on.file.events, {source: 's3'})` is a
   computed node-set; an address would need a predicate sub-language
   beside it.

**`path()` belongs on the other side of the call**: the render report
records (node path, rule index) per emitted piece, and that node path
is a captured spelling used as data, meetable by the prefix rule. It is
the type of what a run REPORTS and the wrong type for what `emit` is
GIVEN.

## D7. The verb is `aontu render`

Decided 2026-09-04, closing
[G9](../capability-review/g9-transformation.md)'s open question (iii),
which had this document saying `aontu render` and the register's phase
6 row saying `aontu gen`.

```
aontu render [--profile <name|file>] [--at <path>]
             [--out <dir> | --stdout] [--check] <file>
```

`--check` is the CI form: render, compare against what is on disk, and
report rather than write — the same shape `fmt --check` and `trim
--check` already have.

**`gen` collides with a meaning the codebase already has.**
`generate()` is the library function that projects the Val tree to
JSON; it has its own section in
[GENERATION-FORMS.0.md](GENERATION-FORMS.0.md), and `mapval_no_gen` and
`listval_no_gen` are error codes users meet constantly and shared rows
pin. `aontu gen` would mean model → FILES while `generate()` means tree
→ JSON, in one tool, with `no_gen` errors between them. Two saved
characters do not pay for that.

**`render` is already the name of the thing the verb does.** The layer
split is written down:
[`emit`](#d2-emitselect-table-and-the-result-is-flat) produces
`aontu:code` pieces and `render(value, profile) -> RenderReport` folds
them to bytes. When the library function is `render`, the verb that
wraps it is `render`.

**House style agrees.** The existing verbs — `vet`, `subsume`,
`breaking`, `trim`, `relations`, `reaches`, `view`, `jsonschema`,
`hash`, `mod`, `get`, `why`, `set`, `agentsmd`, `init`, `lsp`, `mcp` —
are full words except `fmt` and `mod`, both universal abbreviations.
`gen` is not one.

**What the decision commits.** The name appears as a verb in both
CLIs, an MCP tool, a source file in each port, help text the suite
asserts byte-identical across the builds, and every executable
transcript in the reference. The manifest goes under `@"aontu:code"`,
not `std/gen` — that spelling died with the
[`aontu:` rename](MODELS.0.md) and was stale in the register
independently of this choice.

## What it takes: four engine facts

The canonical form does not evaluate on the shipped engine. Each reason
is verified, and together they are why the dispatch is a builtin rather
than an idiom.

**1. A referenced body does not re-root its relative references, so a
table cannot be reached by reference.** A body held at
`$.wiretpl.0.body` whose line reads `` `A:` + ..s.v `` fails `no_path`
*at the definition site*. A spread template re-roots; a stored value
referenced by path does not. **This is the decisive one.**

**2. Dispatch works under `pack` and only under `pack`.** VERIFIED:
`pack(nodes, {s: hide(_), '#': match(.s, <pattern>, <body>, …)})`
selects the right arm per node and splices it. Also VERIFIED, each
closing a route: `_` does not bind inside a spread template; a staged
`match` scrutinee written as `.kind` inside one does not resolve
(`no_gen`); and `pack` over a list refuses with `pack_key`. So map
node-sets can be dispatched and **list node-sets cannot** — and
`listen`, `client` and `on.file.events` are all lists. The expansion
therefore uses a `filter` per template at each list site, which is not
first match wins.

**3. Static inlining cannot express a recursive template.** Since the
table cannot be reached by reference, the expansion inlines each body
at each site, and a template that reaches itself has no finite
expansion. A nested tree walked into nested output — the first example
in every XSLT tutorial — is **not expressible at any length**. This is
the capability the rule layer exists to add.

**4. The pass budget is not sized for this.** Two levels of staged
dispatch over twelve services exhausted the default nine fixpoint
passes (`budget_passes`); it settles at 64, and the CLI has no flag to
raise it. Phase 6 either raises the default for a generation run or
exposes the budget, and says which.

Go additionally refuses the expansion outright, at `pick(..a2, "#")` —
[`use-cases/BUGS.md` §63](../../use-cases/BUGS.md), a staged spread
template's reference under `hide()`. Under the builtin the idiom
disappears, so §63 stops gating generation, but it remains an ADR-001
break in its own right.

## Verified against the worked generator

The canonical document was expanded to aontu the shipped engine runs,
evaluated at 0.56.0, and rendered:

| property | result |
| --- | --- |
| Output against `voxgig/podmind` at `ab7f333` | **12 of 12 handler files byte-identical** |
| The surface's round trip, both directions | identical |
| The generator file parsed as TypeScript (`tsc --noEmit`) | **0 syntax errors** |
| Go, same expansion | refuses every service (BUGS §63) |

## Open

- **There is no `with-param`.** XSLT passes extra context to an applied
  template; the handlers did not need it. The natural aontu spelling is
  to enrich the node-set before dispatch, since a node-set is an
  ordinary value — and that is precisely the composition fact 1 shows
  failing today. Under a builtin that binds a named node it should
  work, but it is unverified: phase 6 either demonstrates it or ships a
  parameter. (Still open after the landing below: enriching a node-set
  with `pack`/`each` and dispatching over the result is untried.)
- **Descent.** `emit` with no explicit selection should be the node's
  children, which is how a recursive rule set walks a tree. The
  totality argument in G9 §2 is unchanged, since it is about the
  structure descended rather than how rules are spelled.
- **Provenance.** G9 §2 requires (node path, rule index) per emitted
  piece. That is what makes rule coverage, shadowing and source maps
  possible, and retrofitting it is what XSLT never managed.

## What phase 6 established

The builtin landed in both ports, `emit(s: map|list, template t:
map|list) : list`, with the shared rows in `test/spec/gen-emit.tsv` and
six codes in the registry. Four things the note could not settle from
outside the engine were settled by building it.

**A named table is a PLACEHELD `emit`, and that closes fact 1.** The
note's decisive fact — a table reached by reference does not re-root
its bodies' relative references — is not repaired by binding at the use
site, because the definition site drives the table first and the
references have already missed by then. Nothing in the language holds a
value unevaluated at a document position; what does hold one is a
CALL's template argument, which is never driven. `%wire = emit(_, T)` is
that position with the selection left open:

```aon
%wire = emit(_, {match: {pin: string}, body: [ … ]})
…
a: emit($.listen, %wire)
b: $.client & %wire
```

Both spellings are the same dispatch: `emit` follows a reference in its
table argument and reads a placeheld `emit` as the table it holds, and
the meet form is the ordinary hole fill. **A mode is a named table**
(D4) survives exactly as written, with the name carrying the hole.

**A placeheld generator was never filled, and that was an engine
defect.** `["a"] & pack(_, {x:1})` answered `*_no_gen` in both ports
while the unstaged `"hello" & upper(_)` filled as documented: `_` is
never `done`, so a staged generator's readiness gate held it residual
for ever and the fill was never reached. The gate now passes a
placeheld call through when a peer has arrived (`stagedReady` /
`stagedDrive`, both ports); against TOP it waits exactly as the hole
does. `pack`, `each` and `filter` gain the fill with `emit`, and the
rows are pinned in each combinator's spec file.

**A body's relative reference is BOUND, and a miss is `emit_ref`.**
Binding rather than re-pathing is what makes a computed selection work:
the nodes of `filter(…)` are values that live nowhere, so there is no
position for a dot count to be taken from. Only a chain of plain names
is a field — a parent step and a variable segment are refused at the
node rather than left to resolve somewhere else, which is the failure
mode the binding exists to remove. The walk stops at a nested
generator's binding argument, so an inner table's `.x` is the inner
node and the outer node reaches it only through the SELECTOR, which is
D5's nesting rule.

**A nested dispatch is driven where it is met.** Left standing, it
resolved a pass later and arrived as a list INSIDE the list, which
would have undone the flat algebra. It is driven through `unite`, so a
rule set that walks into itself without descending is charged to the
depth budget and refused as `unify_cycle` — recursion is bounded by the
selection, which is finite and already in the model.

**Fact 4 did not reproduce.** The two-level staged dispatch that
exhausted nine passes did so as an INLINED expansion; the builtin
dispatches inside one resolution, so the recursive rule set above
settles inside the default budget. No flag is needed, and the phase
does not raise the default.

**Acceptance case 2 is met** (the recursive rule set, `emit-recursive`);
case 1, a target the declaration vocabulary does not fit, waits on the
`replace`/`esc` layer and the `render` verb.

## Acceptance

Phase 6 ships `emit(select, table)` in both ports with shared spec
rows. Two acceptance cases, not one:

1. A target the declaration vocabulary does **not** fit — a Python
   module or a YAML manifest from the same model that produces the Go
   and TypeScript units — because that is the claim the rule layer
   exists to support.
2. **A recursive rule set** — a nested model into nested output —
   because fact 3 says that is exactly the case no amount of user-space
   work reaches.

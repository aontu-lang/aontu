# Aliases and export — design note

**Status:** **P1 is implemented in both ports** — file-local aliases,
with canon and hash erasure and the cycle refusals. `export` and the
destructure (P2) are not. `%` is the alias sigil, carried through the
declaration, the use site, `export`, the destructuring form and the
shorthand; there is no `import` verb.

**What P1 turned out to be.** An alias reference IS a path reference:
`%uint8` is `$.%uint8`, root-absolute and one segment. Everything §4
asks for then comes from the reference machinery the language already
had rather than a resolver beside it — order independence,
alias-of-alias, redeclaration unifying, and a cycle check that spans
both namespaces because there is only ever one graph. What had to be
built was the lexeme (so `%name` is one token in both positions) and
the ERASURE (`MapVal.aliasKeys`, filtered in gen, canon and hcanon).
Pinned by `test/spec/alias.tsv`, 31 rows, every expectation probed
through both engines.

**Two rules the implementation forced, both narrowing P1.** `$.%foo` is
refused — the alias and path namespaces are disjoint, and leaving the
root spelling writable would let `$.%b` inside an included file reach
the *includer's* `%b`. And a declaration must sit at the **document**
root, which is checked on the value rather than at the parse, because
the parse cannot see it: an included file's declarations are at the
root of their own text, and only once the loaded map is placed does it
become apparent that root is not the document's. So **a file using
aliases stands alone.** Carrying a name across files is exactly what
`export` is for, and P2 has to answer it rather than inheriting an
answer by accident.
**Origin:** Richard Rodger, 2026-08-28, as the general form behind the
sized-integer question that [ADR-008](../../ADR.md#adr-008--constraints-are-named-not-spelled-with-operators)
left standing.
**Method:** every claim below about what the language does *today* was
probed against `aontu@0.53.0` and `go/v0.1.11` in-tree, and carries its
probe. Claims about what it *should* do are argument, and are marked as
such.

## 1. The proposal

Three parts, as given:

1. **Alias declaration.** `%foo: 1` means that `%foo`, appearing in a
   value expression, denotes `1`. Aliases are **local to the file that
   declares them**.

   *The proposal as given spelled this `%foo = 1`, and X-1 (§10) is
   whether the `=` is needed at all now that `%` is reserved —
   `%foo: 1` already parses as an ordinary key. Examples throughout
   this note use the colon form, which is where §10 lands; nothing else
   in the design depends on which way X-1 goes.*
2. **`export({ %uint8, %port })`** declares which aliases a file
   publishes.
3. **The destructure.** `{ %uint8, %port } = @"types.aon"` binds a
   file's exported aliases. No import verb: `@"…"` already crosses the
   boundary for values, and a pattern on its left crosses it for names.
4. **Shorthand.** `{ %foo, %bar }` stands for `{ foo: %foo, bar: %bar }`
   — the JavaScript idea, **gated on the sigil**. `{ foo, bar }` without
   sigils stays a parse error, so the sugar can never be confused with
   bare strings. It is **load-bearing**, not a nicety: it is how both
   `export` and the destructure name what they name.

The worked case is the one from
[`docs/reference-language.md`](../reference-language.md#named-constraint-aliases):

```
# today
type: type({})
type: { uint8: integer & min(0) & max(255) }
listen: $.type.uint8
listen: 200

# proposed
%uint8: integer & min(0) & max(255)
listen: %uint8
listen: 200
```

## 2. What this buys that the `type()` idiom does not

The `type()`-marked block already gives named constraints, and ADR-008
leaned on it to decline built-in `int8`/`uint16`. So the first question
is whether aliases are a second spelling for a solved problem — the
exact thing ADR-008 refused. They are not, for three reasons, and the
distinction is worth stating because it is the whole justification:

- **A `type()` block is a value in the document; an alias is not.**
  `$.type.uint8` is a *path*, so it participates in unification, can be
  referenced from other documents that include this one, appears in
  `why` provenance, and occupies a name in the document's own key
  space. An alias is erased before any of that. The block is data about
  the document; an alias is a note to the reader of the source.
- **Aliases can name things a path cannot reach.** `$.type.uint8`
  requires the definition to live somewhere addressable. An alias for a
  fragment used twice in one file — a disjunction, a spread template, a
  `must` message — has nowhere natural to live as data.
- **Locality.** A `type()` block is visible to every document that
  includes the file. An alias is not, which is the point of §5–6: what
  crosses the file boundary should be *chosen*, not merely reachable.

That last one is the real argument. Today a file's helper definitions
are either public (a `type()` key anyone including the file can see and
unify against) or absent. There is no way to say *this name is mine*.

## 3. Empirical baseline — what the grammar does today

All probed 2026-08-28, both ports byte-identical unless noted.

| # | Source | Today | Bearing on the proposal |
|---|--------|-------|------------------------|
| 1 | `a:1` / `a: 1` / `a :1` / `a : 1` | all `{"a":1}` | **whitespace is insignificant** |
| 2 | `foo=1` | `"foo=1"` — one bare string | `=` is a bare-text character |
| 3 | `a: x=y` | `{"a":"x=y"}` | …in value position too |
| 4 | `a: b = 1` | **parse error**, `unexpected character(s): =` | spaced `=` in value position is FREE |
| 5 | `foo = 1` (top level) | the list `["foo","=",1]` | spaced `=` at top level is TAKEN, but by nonsense |
| 6 | `a: {foo, bar}` | **parse error**, `unexpected character(s): foo` | the `{foo,bar}` shorthand is FREE |
| 7 | `copy(@"foo.aon")` | works | `@"…"` composes as a sub-expression — so it can sit on the right of `=` |
| 8 | `a:1 b:$.a` canon | `{"a":1,"b":1}` | canon resolves references away |
| 9 | `foo := 1` | parse error; `foo:=1` → `{"foo":"=1"}` | `:=` is WORSE than `=` — it silently collides |
| 10 | `foo ~ 1` | the list `["foo","~",1]` | other sigils are no freer |
| 11 | `{ u8: uint8 } = @"f.aon"` | the list `[{"u8":"uint8"},"=",{…}]` | a destructuring LHS sits in the SAME slot as row 5 |
| 12 | `a: %x` / `~x` / `^x` / `!x` | all bare strings | free in the weak sense: text, no meaning |
| 13 | `a: ?x` / `:x` / `&x` | parse errors | free outright, but structurally confusing |
| 14 | `a: #x` / `.x` / `@x` | comment / path / include | genuinely taken |
| 15 | `%uint8: 1` | `{"%uint8":1}` — an ordinary key | **a sigil name is already a legal key** |
| 16 | `a: { %foo, %bar }` | parse error | the sigil-gated shorthand is FREE |
| 17 | `%`-led bare tokens, 345 files | **0**, and 0 in the spec | reserving `%` costs nothing measurable |

Row 6 is the happiest: the JavaScript shorthand costs nothing.
Row 11 matters for §6 — the destructuring form is the alias declaration
generalised from a name to a pattern, not a new construct.
Rows 12–14 matter for the capture hazard §4 describes, and rows 15–17 for the sigil that
answers it. **Row 15 is the surprise**: `%name:` already parses as a
key, so a sigil declaration needs no new operator — see §10. Rows 2–5
are where the difficulty was, and §10 now questions whether it remains.

## 4. Aliases

### Semantics

An alias binds a **name** to an **unevaluated value expression**, in
one file. Where the name appears in value position, the expression is
substituted. The alias itself is not a value: it does not unify, does
not generate, does not appear in canon, and cannot be referenced by
path.

That last clause is not a nicety. `aontu hash` pins *meaning*
(G6.0–1), and two documents that differ only in what they call a
private helper mean the same thing. **Aliases must be erased before
canon**, or the hash stops being a hash of meaning. Row 8 shows canon
already resolving references away, so the machinery is the right shape.

### Substitution, not assignment

`%uint8: integer & min(0) & max(255)` followed by `listen: %uint8`
must mean exactly what `listen: integer & min(0) & max(255)` means —
including at the *site* level, since a conflict reports the site that
wrote the value. **Decision point A-1: what does a finding point at
when the offending value came through an alias?** The alias's
declaration site is more informative for a schema bug; the use site is
more informative for a data bug. `why` (G7.3–4) already names every
contribution and its site, so the honest answer is probably *both* —
the alias as a contribution in its own right. This is a report-shape
question, and it is not free.

### Order independence

aontu is commutative — that is the language's central claim. So an
alias must be usable **before its declaration**:

```
listen: %uint8
%uint8: integer & min(0) & max(255)
```

must mean what the reverse order means. Anything else introduces a
reading order into a language that has none, and would be the first
place in aontu where moving two lines changes the answer.

**An alias resolves the way a path reference resolves.** `$.b.u8` is
not looked up as the parser walks either: it stays an unresolved node
and the fixpoint settles it over passes, so a referent completed by a
later statement is found without anyone reading the file twice.
`%uint8` is the same node in a different namespace — one that resolves
against the file's alias scope instead of against the tree.

Nothing new is needed for it, and three properties come free rather
than as rules:

- **Order independence**, for exactly the reason paths have it.
- **Redeclaration unifying** (§7), because that is what two statements
  for one name already do.
- **The late-referent case**, which is the machinery
  [`use-cases/BUGS.md`](../../use-cases/BUGS.md) §48 exercised: an atom
  conjoined at the point of use reaching a reference that resolves a
  pass late. Aliases inherit that path's fixes rather than needing their
  own.

No whole-file pre-pass is wanted here, and specifically not one: a
separate resolution phase would bring its own ordering, its own cycle
rules and its own error codes, none of which the language needs.

### Cycles

**May an alias reference another alias? Yes** —
`%u8: integer & %bounds` with `%bounds: min(0) & max(255)` is the useful
case, and it is what makes cycles possible at all. Three shapes have to
be refused, and they are not all the same shape:

```
%a: %a                         # 1. direct self-reference

%a: %b
%b: %a                         # 2. an alias cycle

%a: $.x
x:  %a                         # 3. a MIXED cycle, through the tree
```

The third is the one the sigil creates and the one an alias-only cycle
check would miss. `%a` resolves against the alias scope, `$.x` against
the tree — so the cycle exists in **neither graph alone**. A checker
that walks alias references finds no loop; `unify_cycle`, walking path
references, finds no loop either. **The reference graph has to span both
namespaces**, with alias references and path references as edges of one
graph, or shape 3 is detected only by exhausting the budget.

That is a real cost of the sigil, and it is the one this section is
careful not to net off against what the sigil buys.

**The refusal is not a parse-time property**, and shape 3 is why:
whether `x: %a` closes a loop cannot be known until `$.x` resolves,
which is evaluation. So an alias cycle is refused where a path cycle is
refused — at resolution, by the existing `unify_cycle` machinery
extended to alias edges.

Termination is still assured (§7: no parameters, no recursion, finite
name set); the guarantee simply comes from the same place the rest of
the language's does, rather than from a special one.

### The sigil

`%` is part of an alias's name: declared and used identically, and
carried everywhere a name goes — the declaration, the use site,
`export`, the destructuring pattern and the shorthand.

```
%uint8: integer & min(0) & max(255)
listen: %uint8
```

**It exists to stop name capture.** Aliases and bare strings occupy the
same syntactic position, so without a sigil every alias name silently
removes a bare string from the file's vocabulary. `status: active` is
the bare string `"active"` today; in a sigil-less design, a file that
later declared an alias named `active` would change that line, which
does not mention it. With the sigil, bare text stays bare text and no
declaration can reach a line that does not spell `%`.

The cost is a reserved character, which is the same *class* of change as
reserving `=` — so it gets the same measurement. Over the 345-file
corpus with comments stripped, bare tokens led by each candidate:

| Candidate | Files in corpus | Spec rows | Note |
|---|---|---|---|
| `%` | 0 | 0 | reads as substitution — the best semantic fit |
| `~` | 0 | 0 | free |
| `^` | 0 | 0 | free |
| `!` | 0 | 0 | free, but reads as negation |

All four are unused; `%` is adopted because it reads as substitution,
which is what an alias does. Row 17 re-confirms zero `%`-led bare tokens
in the corpus and none in the spec. CUE reaches for the same device with
`#Foo` definitions.

Two consequences worth stating, because other sections depend on them:
an alias and a key can no longer collide, and §8's four name-like things
become four distinct sigils — every name-like thing in the language is
legible at a glance.

## 5. `export`

`export({ %uint8, %port })` declares which of a file's aliases are
published. Three rules, all settled:

**It is self-erasing.** `export(…)` contributes nothing to the
document's value — it is a declaration, not a value, and the file
generates exactly as it would without it. This matches `type()`-marked
fields being omitted, and it means adding an export can never change
what a file produces.

```
# types.aon
%uint8: integer & min(0) & max(255)
%port:  integer & min(1) & max(65535)
%secret: string                        # declared, deliberately not exported

export({ %uint8, %port })

defaults: { retries: 3 }
```

```
# what types.aon generates, with or without the export line
{ "defaults": { "retries": 3 } }
```

**It takes aliases and nothing else.** `export({ uint8 })` — no sigil —
is refused, not silently reinterpreted as a key. Keys already cross the
boundary as values; the whole point of `export` is the thing that
otherwise cannot.

```
export({ %uint8 })       # ok
export({ uint8 })        # refused: not an alias
export({ defaults })     # refused: that is a key, and it already crosses
export(%uint8)           # refused: takes a set, even of one
```

**An unexported alias is invisible.** `%secret` above cannot be bound by
any importer; asking for it names the name rather than failing silently:

```
{ %secret } = @"types.aon"    # refused: types.aon does not export %secret
```

## 6. Crossing the file boundary

`@"…"` already carries a file's **values** across. What it cannot carry
is aliases, because an alias is erased before a value exists. A
destructuring left-hand side carries those, and nothing else changes.

### The destructure is additive

**Exported aliases are not injected automatically.** Writing
`@"types.aon"` gives you its values and none of its aliases; you have to
ask, by name:

```
{ %uint8, %port } = @"types.aon"
```

**And the include still does its ordinary job.** The destructure is
*additive*, not a replacement: the imported subtree lands exactly where
and as it would have without the pattern — as if the `{…} =` were not
written at all.

```
# these two lines place identical values; the second ALSO binds two aliases
svc: @"types.aon"
svc: { %uint8, %port } = @"types.aon"
```

```
# so a destructure at top level merges the file's values as usual
{ %uint8 } = @"types.aon"

listen: %uint8
listen: 8080
```

```
{ "defaults": { "retries": 3 }, "listen": 8080 }
```

That is worth stating twice because the JavaScript intuition points the
other way: there, destructuring is how you *narrow* what you take. Here
it only *adds* a binding, and taking the values is what `@"…"` was
already doing.

### Renaming

Both sides carry the sigil, because both are aliases:

```
{ %u8: %uint8 } = @"types.aon"     # bind the exported %uint8 as local %u8
```

### `{%}` — take all the exports

```
{%} = @"types.aon"                 # bind every alias types.aon exports
```

Sugar for naming them all, and the one place a wildcard is safe: the
exporting file chose the set, so `{%}` cannot reach anything the author
did not publish. It is still explicit at the *use* site — a reader sees
that aliases arrive here, even without seeing which.

The obvious hazard is that `{%}` makes an importing file's alias
namespace depend on a remote file's export list, so a new export
appears without a local edit. Two things bound it: an alias arriving
this way can only *conflict* with a local one by unifying (§7), never
silently replace it; and `{%}` is a choice the importer makes, so the
blast radius is the files that opted in.

### What the pattern binds, and what lands anyway

The two are independent, and both happen:

```
{ %uint8 } = @"types.aon"
# binds  : %uint8, because types.aon exported it
# places : types.aon's values, because that is what @"…" does
```

The right-hand side is a plain `@"…"`, so the resolver chain,
confinement, the include manifest and module-shaped paths all apply
unchanged. **There is no second file-reading route to govern** — which
is what keeps aliases out of `docs/trust.md`'s four hermeticity inputs.

### The shorthand, and how `export` still sees the sigil

`{ %foo, %bar }` stands for `{ foo: %foo, bar: %bar }` — key without the
sigil, value with it. Gated on the sigil, so `{ foo, bar }` stays the
parse error it is today and the sugar can never be confused with bare
strings. Canon expands it: `{ %foo }` and `{ foo: %foo }` are the same
document and must hash identically.

**That expansion is what lets `export` work, and it is worth being
exact about why**, because a plausible reading says it cannot. If
`{ %uint8, %port }` became `{ uint8: %uint8, port: %port }` and the
references were then *substituted*, `export` would receive a map of
plain keys to expanded values, with no sigils anywhere — unable to tell
an alias from a key, so `export({ uint8: 1 })` would be
indistinguishable from `export({ %uint8 })` when `%uint8: 1`.

**It does not, because an alias reference is a node, not its
expansion.** `%uint8` resolves the way `$.b.u8` does —
it stays an unresolved reference carrying its own name until the
fixpoint settles it. So the expansion is

```
{ uint8: <alias-ref %uint8>, port: <alias-ref %port> }
```

and `export` reads the names **off the reference nodes**, not off the
keys. The sigil survives because the *reference* survives. The key is
incidental — which is why renaming in a destructure
(`{ %u8: %uint8 }`) is coherent: the key is the local name, the value
is the reference that carries the remote one.

That is not a new capability. A builtin receiving an argument still
unresolved is how `refer($.X)` already works — it takes the reference
rather than its target — and `go/func.go` already branches on whether an
argument `.(*RefVal)` at the argument's *kind*. `export` needs the same
treatment, and it is the reason `export` is a **declaration** rather
than an ordinary call: it must see its argument before resolution, and
it contributes nothing to the value afterwards.

**What this makes enforceable**, which was the point:

```
export({ %uint8 })       # a reference node → the alias named uint8
export({ uint8: 1 })     # a scalar, not a reference → refused
export({ uint8 })        # parse error today (row 6), and stays one
```

**One position reads `%foo` differently, and it is worth naming.** In
value position `%foo` is a *use* — a reference, resolved. On the left of
`=` it is a *binding* — the name being introduced, never resolved,
because it has nothing to resolve to yet. The spelling is the same and
the shorthand expands the same way in both; what differs is use versus
binding, which is true of every name in every language, and is exactly
how `{ a, b } = obj` reads in JavaScript against `{ a, b }` as a value.

## 7. Failure modes, scope, and termination

### Redeclaration unifies

An alias declared more than once in a file denotes the **meet** of its
declarations, exactly as a key does. This keeps order-independence and
means a redeclaration is not an error by itself:

```
%port: integer                 # → %port denotes integer & min(1) & max(65535)
%port: min(1) & max(65535)
```

```
%n: 1
%n: integer                    # → 1, since integer & 1 = 1
```

```
%n: 1
%n: 2                          # conflict: 1 & 2 has no value
```

The conflict is reported at the declarations, not at some later use
site, because it is decidable without knowing where `%n` is used. Two
files can also both contribute — a local `%port` and an imported one
meet in the same way:

```
%port: integer
{ %port } = @"types.aon"       # types.aon exports %port: integer & min(1) & max(65535)
                               # → %port denotes the meet of both
```

That is the answer to the `{%}` hazard above: an alias arriving by
wildcard cannot quietly replace a local one, because arriving means
meeting.

### Aliases work only where defined or imported

An alias is in scope in the file that declares it, and in a file that
imports it by name. Nowhere else:

```
# a.aon
%t: integer & min(0)
inner: @"b.aon"                # b.aon does NOT see %t
```

```
# b.aon
x: %t                          # refused: %t is not defined here
```

The include carries *values* down, never the includer's names. Without
that rule an alias would be a dynamic scope, and a file's meaning would
depend on who included it.

### Where a declaration may sit, and who decides

A declaration must sit at the **document** root. Not the *file* root —
the document's — and the difference is the whole of this rule:

```
x: { %a: 1 }                   # refused: alias_not_toplevel at $.x.%a
```

`%a` resolves from the root, so a nested declaration would be erased
from the output (it *is* a declaration) and still unreachable by any
reference (it is *not* at the root) — a name that silently exists
nowhere. Refusing it is the better of the two.

**The parse cannot decide this, so it does not try.** Both ports collect
`%name` keys as they walk and refuse on the *value*, in `MapVal.unify`,
because an included file's declarations are at the root of their own
text and only once the loaded map is *placed* does it become apparent
that root is not the document's:

```
# f.aon
%b: integer & min(1)
q: %b
q: 7
```

```
a: @"f.aon"                    # refused: alias_not_toplevel at $.a.%b
```

That refusal is not pedantry about position. Left writable, `%b` in the
*includer* is what the included file's own `%b` would reach — the
cross-file capture the sigil exists to prevent, arriving one level up.

Spliced at the root, the same file is accepted, and for a reason that
is not a special case:

```
@"f.aon"
x: 1
```

```
{ "q": 7, "x": 1 }
```

There is one root map, so there is no second scope for a name to leak
out of: the declaration is a declaration *of this document*, which is
exactly what it says it is. Two documents unified are one document, and
a name declared in either is declared in the result — the same additive
rule optional keys and spreads already follow. `vet` is where two
separately parsed roots actually meet, so it is where the rule is
observable, and `alias-vet-across-documents` is the row.

Rows: `alias-nested-declaration-refused`, `alias-include-at-root-declares`,
`alias-include-under-key-refused`, `alias-vet-across-documents`.

### Aliases are not passed to children

Scope is lexical and **does not descend into generated children**. A
spread template or a generator sees the *expansion*, never the alias:

```
%row: { kind: string, id: integer }

table: {
  &: %row                      # every child meets the EXPANSION
  a: { kind: user, id: 1 }
  b: { kind: user, id: 2 }
}
```

```
{ "table": { "a": { "kind": "user", "id": 1 },
             "b": { "kind": "user", "id": 2 } } }
```

The children are constrained by `{kind: string, id: integer}`. They do
not acquire `%row` as a name, and nothing inside them can write `%row`
unless the file itself declared it. Same for `pack`/`each`:

```
%tmpl: { replicas: *2 | integer }

deploy: pack($.names, %tmpl)   # the template is the expansion
```

This is what keeps aliases erasable: if a child could carry one, the
alias would have to survive into the value, and canon could no longer
erase it (§4).

### Can aliases give Turing completeness? No.

**They cannot, and the reason is structural rather than a limit we
impose.** Three properties together:

1. **No parameters.** An alias substitutes a fixed expression. There is
   no application, so no way to build a function.
2. **No recursion.** The alias reference graph must be acyclic — §4
   refuses a cycle at resolution, and the check is on the graph, not
   just on direct self-reference, so `%a: %b` with `%b: %a` is refused
   too.
3. **Finite name set.** A file declares finitely many aliases, and each
   expansion step consumes one name from that set without adding any.

So expansion is a topological walk of a DAG. It terminates, always, and
its result is bounded. This is macro expansion *without* parameters —
strictly weaker than the untyped lambda calculus, and weaker than C's
preprocessor, which gets its (limited) power from arguments.

**But expansion can still explode, and that is the real hazard:**

```
%a0: 1
%a1: { x: %a0, y: %a0 }
%a2: { x: %a1, y: %a1 }
# … %aN expands to 2^N copies of %a0
```

Twenty declarations reach a million nodes. This is not
non-termination — it finishes — but
[`docs/trust.md`](../trust.md) clause 2 is about what an unattended
agent can be handed, and "terminates eventually" is not the promise
that clause makes.

**So expansion must be budgeted**, and the budget must be on *expanded
size*, not on depth or on declaration count, since the example above is
twenty shallow declarations. The evaluator already has a pass budget
with a deterministic bound; alias expansion needs the equivalent, and it
should be charged before evaluation begins rather than discovered
during it. Recorded as **T-1** in §9.

### What the sigil does not fix

Worth being explicit, since §4 credits it with a lot. The sigil ends
name *capture* and nothing else: redeclaration conflicts, out-of-scope
use and expansion blowup are all possible with `%`, and would all be
possible without it.

## 8. Interactions to keep straight

The language would then have **four** name-like things, and a reader
has to tell them apart at a glance:

| Form | Resolved from | Scope | Erased before canon |
|------|---------------|-------|---------------------|
| `$name` | the **host program** (§ Variables) | evaluation | no — it is a value |
| `$.path` | the **document** | document | resolved away |
| `foo` (alias) | the **file** | file | **yes** |
| `foo:` (key) | it *is* the document | document | no |

With `%` adopted this is **four sigils out of four**: every name-like
thing in the language is legible at a glance, and none can be mistaken
for a bare string. That is the property that will still matter in a
year — independent of the capture hazard that first motivated it.

## 9. Open questions

Three, and nothing should be built before they are answered.

| # | Question | Where |
|---|----------|-------|
| **A-1** | What site does a finding name when the value came via an alias — the declaration or the use? Probably both, as a `why` contribution in its own right. A report-shape question, and not free. | §4 |
| **T-1** | How is alias expansion budgeted? Expansion terminates, but can be exponential — twenty shallow declarations reach a million nodes. The budget must be on expanded *size*, charged before evaluation rather than discovered during it. | §7 |
| **X-1** | Is `=` the right spelling at all? `%uint8:` is already a legal key (row 15), so the operator — the proposal's only compatibility break — may be unnecessary. This one gates P1. | §10 |

Everything else the note raised is settled in place: the sigil (§4), the
cycle rules across both namespaces (§4), what `export` publishes and how
it still sees the sigil (§4–5), and the additive destructure (§6).

## 10. Compatibility, measured

The `=` break is **small but real**, and it is worth being exact
because ADR-008 declined a lexing break one day ago.

Measured over this repository's own corpus — 345 `.aon` files, comments
stripped first — the number of bare strings containing `=` is **zero**.
Zero again across the shared spec sources. (A first pass reported five;
all five turned out to be comment prose — `page_size=80`, `plan=free`
and so on, discussing the strings rather than being them. The corrected
command strips `#` to end-of-line before searching, and excludes quoted
values.)

So the *adjacent* form (row 2) is unused here, and the proposed grammar
(`KEY = value`, with `=` a separate token) would leave it alone anyway.
The form that changes meaning is the *spaced* one, which today parses as
the three-element list `["foo","=",1]` (row 5) — a value nobody writes
deliberately, and which appears nowhere in this corpus either.

**On this evidence the break is close to free.** One caveat the
evidence cannot cover: this repository is not a representative corpus.
`X=Y` is the natural spelling of a query string, a feature flag and an
environment variable, and aontu is a *configuration* language — the
places those appear are exactly the documents this repo does not
contain. A wider corpus check is cheap and should precede P1.

The residual price is not the strings, it is the precedent: `foo=1` and
`foo = 1` would mean **different things**, and row 1 shows whitespace is
insignificant everywhere else in the language. That is the cost to
weigh.

### The ADR-008 tension, stated plainly

ADR-008 decided that *constraints are named, not spelled with
operators*, and declined `>=10` partly because a synonym is paid for at
every surface that renders a residual. An alias declaration spelled `=`
is not a constraint and not a synonym — it buys something the language
cannot express at all — so the ADR does not decide this. But it is
worth noticing that **`=` is the only operator this proposal adds**:
`export` is a declaration in the house style, and the destructure reuses
`@"…"` on its right.

**X-1 is therefore a real fork — and adopting the sigil has changed
what is on it.** Row 15 is the reason: `%uint8: 1` *already* parses, as
an ordinary key named `%uint8`. So a third option exists that did not
before:

- `%foo = 1` — the proposal as written. Needs the `=` break above.
- `alias(%foo, 1)` — no break, consistent with ADR-008's named style,
  worse to read at the density where aliases pay off.
- **`%foo: integer & min(0)`** — declare an alias with the ordinary
  key syntax, in the namespace the sigil already creates. **No new
  operator, no lexing break, nothing to measure.** The whole of §10's
  compatibility argument becomes moot, because there is nothing to
  break.

The third looks strictly better and it should be tested properly before
being believed: it means a declaration and a key are spelled alike and
told apart only by the sigil, which is either the point (one syntax,
one namespace marker) or a confusion (two things that look the same).
It also needs an answer for the destructuring form, which is the one
place `=` is doing work a key cannot: `{ %a, %b } = @"f.aon"` binds
several names at once, and `%…:` has no obvious multi-binding spelling
(`%{ a, b }: @"f.aon"` is a parse error today, so it is available but
would be a new construct).

**Recommendation: settle X-1 before P1, and start from the third
option.** The syntax was the expensive part of this proposal; the sigil
may have made it free.

## 11. Non-goals

- **No computation.** An alias substitutes a value expression; it takes
  no parameters and is not a macro or a function. A parameterised alias
  is a user-defined function, which
  [AONTUCONSTRAINTS.0.md §9](AONTUCONSTRAINTS.0.md) refuses on
  termination grounds and this note refuses for the same reason. §7
  shows this is exactly what keeps aliases sub-Turing — no parameters,
  no recursion, finite name set, so expansion is a DAG walk. Adding
  parameters would give up that argument entirely, which is why this is
  a non-goal rather than a deferral.
- **No re-export.** A file that imports a name does not thereby publish
  it. Chains of re-export are how a name's origin becomes unfindable.
- **No dynamic names.** The importable set is textual and known after
  parsing, or `aontu mod verify` and the include manifest cannot see it.
- **Not a second module system.** See §6.

## 12. Test plan

Per ADR-001 nothing lands without shared rows probed in both engines.
Sketch only, since §9 is open:

- **Aliases:** substitution in every value position; use-before-declare
  (order independence); alias-of-alias; cycle refused; a bare `foo` and
  an alias `%foo` in one file staying independent (the capture guard,
  writable only because the sigil exists); erased from canon *and*
  from the hash — a document with aliases and its
  expanded twin must produce the identical `aon1-…` string, which is the
  sharpest single row in this list.
- **Export:** self-erasing — a file generates identically with and
  without its `export` line, which is one row and the sharpest statement
  of the rule; `export({ uint8 })` without a sigil refused; an
  unexported alias refused *by name* when an importer asks for it.
- **Destructuring:** exported name bindable; rename; `{%}` binding every
  export and nothing more; a module-shaped `@"…"` on the right resolving
  as it already does. And the additive rule as its own row:
  `svc: @"f.aon"` and `svc: { %a } = @"f.aon"` must **generate
  identically**, differing only in what is bound.
- **Failure modes (§7):** redeclaration meeting rather than erroring
  (`%n: 1` with `%n: integer` → 1) and conflicting when it cannot
  (`%n: 1` with `%n: 2`); an alias unavailable in an included file; an
  alias not reaching spread or generator children, pinned by the
  children carrying the expansion's constraint but no name; a cycle
  through two aliases refused, not just direct self-reference.
- **Expansion budget (T-1):** the doubling ladder of §7 refused at the
  budget rather than evaluated, with the refusal naming the budget.
  This row cannot be written until T-1 is settled.
- **Destructure:** a row per form — named, renamed (`{ %u8: %uint8 }`),
  and the `{%}` wildcard — each paired with a row proving the imported
  subtree still lands, which is the additive rule (§6) stated as a test.
- **Trust:** nothing new to pin. The right-hand side is a plain `@"…"`,
  so the existing include rows already cover every confinement mode and
  the include manifest. That absence is itself an argument for §6.
- **Shorthand:** `{%foo}` ≡ `{foo: %foo}` in canon, in every position;
  and `{foo}` without a sigil still a parse error — the guard that keeps
  the sugar unambiguous.
- **Negatives paired with positives** throughout, per the house rule.

## 13. Phasing

| Phase | Content | Gate |
|-------|---------|------|
| P0 | Settle X-1 and T-1 | no code |
| P1 | ~~Aliases, file-local, with canon erasure and the cycle refusals~~ **LANDED** | the hash row, `alias-hash-erases` + its longhand twin |
| P2 | `export`, and `{…} = @"…"` destructuring | canon expansion |

**P1 landed with X-1 taken the third way and T-1 not yet needed.** The
declaration is spelled `%foo: …`, the ordinary key syntax in the
namespace the sigil creates — so there is no `=` operator, no lexing
break beyond the sigil itself, and §10's compatibility argument is
moot for what shipped. T-1 does not bite yet either: without `export`
there is no cross-file expansion, and the doubling ladder it worries
about is bounded by one file. **Both remain open for P2**, where the
destructure needs `=` and imported aliases make expansion unbounded.

P1 is independently useful and independently shippable: file-local
aliases with nothing crossing a file boundary is the whole of §2's
argument, and it can be judged before any of §5–6 is built.

X-1 and T-1 both gated P1 when this note was written, and both were
answered rather than deferred: X-1 by taking the third option, which
removed the lexing break the compatibility section was written about,
and T-1 by P1 being single-file, which bounds expansion by one file.
They return as gates on P2 unchanged — the destructure needs `=`, and
imported aliases make expansion unbounded again.

`export` and the destructure are one phase: the destructure *is* how a
name crosses, so neither is useful without the other.

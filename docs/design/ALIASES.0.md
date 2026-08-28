# Aliases, export and import — design note

**Status:** Discovery draft. **Nothing here is implemented.**
**Revised 2026-08-28: `%` is adopted as the alias sigil** (A-4 Option A),
and it carries through the declaration, the use site, `export`, the
destructuring form and the shorthand. That decision closes A-4, dissolves
A-3, and reopens X-1 in a better place — see §10.
**Origin:** Richard Rodger, 2026-08-28, as the general form behind the
sized-integer question that [ADR-008](../../ADR.md#adr-008--constraints-are-named-not-spelled-with-operators)
left standing.
**Method:** every claim below about what the language does *today* was
probed against `aontu@0.53.0` and `go/v0.1.11` in-tree, and carries its
probe. Claims about what it *should* do are argument, and are marked as
such.

## 1. The proposal

Three parts, as given:

1. **Alias declaration.** `%foo = 1` means that `%foo`, appearing in a
   value expression, denotes `1`. Grammar: `%NAME = <aontu value>`.
   Aliases are **local to the file that declares them**. *(The proposal
   was written without the sigil; §4 adopts it, and §10 notes that with
   `%` reserved the `=` may not be needed either.)*
2. **`export({ %uint8, %port })`** declares which aliases a file
   publishes — the sigil marks each one as an alias rather than a key.
3. **`import(string, @<ref>, {...})`** takes the path (as a string) at
   which to place the import, the file to import, and an optional
   destructuring of the imported aliases so they can be used directly.
   **Superseded — see §6.** Asked whether `import` was needed at all,
   the answer is no: a destructuring left-hand side does the job with
   no new builtin.
4. **Shorthand.** `{ %foo, %bar }` stands for `{ foo: %foo, bar: %bar }`
   — the JavaScript idea, **gated on the sigil**. `{ foo, bar }` without
   sigils stays a parse error, so the sugar can never be confused with
   bare strings. It is **load-bearing** rather than a nicety, once §6
   drops `import`.

The worked case is the one from
[`docs/reference-language.md`](../reference-language.md#named-constraint-aliases):

```
# today
type: type({})
type: { uint8: integer & min(0) & max(255) }
listen: $.type.uint8
listen: 200

# proposed
%uint8 = integer & min(0) & max(255)
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
| 17 | `%`-led bare tokens, 309 files | **0**, and 0 in the spec | reserving `%` costs nothing measurable |

Row 6 is the happiest: the JavaScript shorthand costs nothing.
Row 11 matters for §6 — the destructuring form is the alias declaration
generalised from a name to a pattern, not a new construct.
Rows 12–14 matter for §4's A-4, and rows 15–17 for the sigil that
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

`%uint8 = integer & min(0) & max(255)` followed by `listen: %uint8`
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

Aontu is commutative — that is the language's central claim. So an
alias must be usable **before its declaration**:

```
listen: %uint8
%uint8 = integer & min(0) & max(255)
```

must mean what the reverse order means. Anything else introduces a
reading order into a language that has none, and would be the first
place in Aontu where moving two lines changes the answer.

This forces alias resolution to be a **whole-file pass before
evaluation**, not a fold performed as the parser walks.

### Cycles

`a = b` with `b = a` must be refused, and refused at resolution rather
than by exhausting a budget: aliases are textual substitution, so a
cycle is not slow, it is infinite. A new error code, and the refusal is
a *parse-time* property — which is a virtue, because it means aliases
cannot threaten [`docs/trust.md`](../trust.md) clause 2 (termination).

**Decision point A-2: may an alias reference another alias?** Allowing
it (`u8 = integer & bounds`, `bounds = min(0) & max(255)`) is the
useful case and costs only the cycle check above. Recommend yes.

### Shadowing — dissolved by the sigil

**A-3 asked** what a bare `uint8` means when a file declares both an
alias `uint8` and a key `uint8:`. **With `%` adopted the question does
not arise**: `%uint8` and `uint8:` are different namespaces, and no
spelling is ambiguous between them. The recommendation was to refuse the
collision; there is now no collision to refuse.

This is the second decision the sigil removes rather than answers, and
it is worth noticing that both were ambiguity questions. A namespace
that is visibly distinct has no ambiguities to adjudicate.

### A-4: the capture hazard — DECIDED, Option A

A bare string that happens to match an alias name is the worse case.
`status: active` is the bare string `"active"` today; if a file declares
`active = 1`, does `status` become `1`? Aliases and bare strings occupy
the same syntactic position, so every alias name silently removes a bare
string from the file's vocabulary — and adding an alias could change a
line that does not mention it.

**First, the part that is not a choice.** If aliases are referenced by a
bare name, the capture is *inherent*, not incidental: a bare `X` in a
file declaring `X = …` must mean the alias, or the alias is unusable.
So "make the alias win only sometimes" is not on the table. The three
real options are:

**Option A — put a sigil in the alias's name. ADOPTED 2026-08-28.**
Declared and used identically, so there is no question of which side
carries it, and the sigil goes everywhere a name goes: the declaration,
the use site, `export`, the destructuring pattern and the shorthand.

```
%uint8 = integer & min(0) & max(255)
listen: %uint8
```

This ends the hazard outright — bare text stays bare text, and no
declaration can reach a line that does not use the sigil. It also fixes
the *other* problem the design has: §8's table has four name-like things
and only three of them are distinguishable by sigil; this makes it four.
CUE reaches for the same device with `#Foo` definitions.

The cost is a reserved character, which is the same *class* of change as
reserving `=` — so it deserves the same measurement, and gets it.
Measured over the 309-file corpus with comments stripped, bare tokens
led by each candidate:

| Candidate | Files in corpus | Spec rows | Note |
|---|---|---|---|
| `%` | 0 | 0 | reads as substitution — the best semantic fit |
| `~` | 0 | 0 | free |
| `^` | 0 | 0 | free |
| `!` | 0 | 0 | free, but reads as negation |

All four are unused. `?`, `:` and `&` are free *outright* (parse errors
today) but are structurally confusing; `#`, `.` and `@` are genuinely
taken. **`%` is adopted** — it reads as substitution, which is what an
alias does, and row 17 re-confirms zero `%`-led bare tokens in the
corpus and none in the spec.

**Option B — refuse a declaration that would capture.** Keep the bare
spelling, and at the whole-file pass the design already requires for
order-independence, check whether the bare token `X` appears in value
position anywhere in the file. If it does, refuse `X = …` and name both
sites. The author quotes the string or renames the alias.

This is decidable and non-circular — the check runs at the *declaration*
against existing bare uses, so it never refuses the alias's own use
sites — and it converts a silent change into a parse-time refusal, which
is the opposite of the A-4 harm. It costs no character. Its residual
weakness is that it fixes the *silent change* without fixing the
*legibility*: a reader still cannot tell a bare `uint8` from a bare
string without checking the declarations.

**Option C — accept and document it.** Cheapest, and what most languages
with bare identifiers do. It leaves the property that adding a line can
change an unrelated line, which is the thing the rest of Aontu does not
do.

**A is adopted.** It was the only option that also answered §8, and the
measurement puts its cost at zero rather than merely near-zero. B and C
are recorded above because the reasoning is worth keeping, not because
either remains open.

What adopting it settles, beyond A-4 itself:

- **A-3 dissolves** — an alias and a key can no longer collide.
- **§8 becomes four sigils out of four**, so every name-like thing in
  the language is legible at a glance.
- **The shorthand can be general** rather than confined, because
  `{ %foo }` is unambiguous wherever it appears (§7). That is a better
  answer to S-1 than the one this note gave.
- **X-1 reopens in a better place.** Row 15 shows `%uint8:` is already a
  legal key, so the `=` operator — the proposal's only break — may be
  unnecessary. See §10.

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

### E-1 is closed by the additive rule

The earlier draft asked whether a destructure binds exported *aliases*
or the *keys* of the value. The answer is that the question was
malformed: **aliases are what the pattern binds, and keys land as values
regardless.** Both happen, and neither is a choice.

```
{ %uint8 } = @"types.aon"
# binds  : %uint8, because types.aon exported it
# places : types.aon's values, because that is what @"…" does
```

### Why this needs no new machinery

The right-hand side is a plain `@"…"`, so the resolver chain,
confinement, the include manifest and module-shaped paths all apply
unchanged. There is no second file-reading route to govern, which is
what made dropping `import` worth doing — see the §6 note in the
previous revision.

### The shorthand

`{ %foo, %bar }` stands for `{ foo: %foo, bar: %bar }` — key without the
sigil, value with it. Gated on the sigil, so `{ foo, bar }` stays the
parse error it is today and the sugar can never be confused with bare
strings. That gate is why it can be general rather than confined to
pattern position. Canon expands it: `{ %foo }` and `{ foo: %foo }` are
the same document and must hash identically.

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
name *capture*; it does nothing about the three failures above.
Redeclaration conflicts, out-of-scope use and expansion blowup are all
possible with `%` and would all be possible without it.

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
for a bare string. That property was the second argument for the sigil,
independent of A-4 — and it is the one that will still matter in a year,
when nobody remembers what A-4 was.

## 9. Decision points, gathered

Nothing should be built before these are answered.

| # | Question | This note's lean |
|---|----------|------------------|
| **A-1** | What site does a finding name when the value came via an alias? | Both, as a `why` contribution |
| **A-2** | May an alias reference another alias? | Yes, with a cycle check |
| **A-3** | Alias name colliding with a key | **Dissolved** by the sigil — different namespaces. §4 |
| **A-4** | Alias name colliding with a bare string | **DECIDED: `%` sigil in the name.** §4 |
| **E-1** | Does a destructure bind exported *aliases* or the value's *keys*? | **Closed** — the question was malformed. The pattern binds aliases; keys land as values regardless, because the destructure is additive. §6 |
| **T-1** | How is alias expansion budgeted? | **Open, new.** Expansion terminates (§7) but can be exponential; budget on expanded *size*, charged before evaluation |
| **S-1** | Is `{%foo, %bar}` general or confined? | **Answered: general** — the sigil disambiguates, so no confinement is needed. §6 |
| **X-1** | Is `=` the right spelling at all? | **Reopened, better placed** — row 15. §10 |

**Three of the original eight are now dissolved rather than decided,
and that is the pattern worth noticing.** `I-1` and `I-2` were questions
about `import`, which §6 removes. `A-3` was an ambiguity between an
alias and a key, which the sigil makes unrepresentable. In each case the
question disappeared with the construct that raised it, which is a
better outcome than answering it — an answered question is a rule
someone has to remember.

**Open: A-1, A-2, T-1, X-1.** A-1 (which site a finding names) and A-2
(alias-of-alias, lean yes) are unchanged. **E-1 closed** once the
destructure was settled as additive — the pattern binds aliases and the
values land anyway, so there was never a choice to make. **T-1 is new**,
and is what §7 turned up: aliases cannot loop, but they can explode, and
the budget for that is unspecified. X-1 still gates P1 — see §10.

## 10. Compatibility, measured

The `=` break is **small but real**, and it is worth being exact
because ADR-008 declined a lexing break one day ago.

Measured over this repository's own corpus — 309 `.aon` files, comments
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
environment variable, and Aontu is a *configuration* language — the
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
worth noticing that **this proposal is already two-thirds named**:
`export` and `import` are builtins in the house style, and `=` is the
one operator among them.

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
  an alias `%foo` in one file staying independent (the A-4 guard, which
  can only be written now the sigil exists); erased from canon *and*
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
- **Trust:** nothing new to pin. The right-hand side is a plain `@"…"`,
  so the existing include rows already cover every confinement mode and
  the include manifest. That absence is itself the argument for §6 —
  the earlier `import` design would have needed a row per mode.
- **Shorthand:** `{%foo}` ≡ `{foo: %foo}` in canon, in every position
  since S-1 lands general; and `{foo}` without a sigil still a parse
  error — the guard that keeps the sugar unambiguous.
- **Negatives paired with positives** throughout, per the house rule.

## 13. Phasing

| Phase | Content | Gate |
|-------|---------|------|
| P0 | Settle X-1 and T-1 first — A-4 decided, E-1 closed | no code |
| P1 | Aliases, file-local, with canon erasure and the cycle/shadow refusals | the hash row |
| P2 | `export`, and `{…} = @"…"` destructuring | canon expansion |

P1 is independently useful and independently shippable: file-local
aliases with nothing crossing a file boundary is the whole of §2's
argument, and it can be judged before any of §5–6 is built.

**A-4 is decided and no longer gates P1.** The `%` sigil ends the
capture hazard outright: bare text stays bare text, and no declaration
can reach a line that does not carry the sigil.

**What gates P1 now is X-1** — whether a declaration is `%foo = …` or
simply `%foo: …` — because that is the difference between a proposal
carrying a lexing break and one carrying none, and it cannot be deferred
into implementation. §10's third option would make the whole
compatibility section moot; it deserves a proper look before P1 rather
than a guess during it.

The old P2/P3 split is gone with `import`: `export` and destructuring
are one phase now, because destructuring *is* the import.

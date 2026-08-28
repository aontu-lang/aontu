# Aliases, export and import — design note

**Status:** Discovery draft. **Nothing here is implemented**, and this
note does not propose that it should be until the decision points in
§9 are settled.
**Origin:** Richard Rodger, 2026-08-28, as the general form behind the
sized-integer question that [ADR-008](../../ADR.md#adr-008--constraints-are-named-not-spelled-with-operators)
left standing.
**Method:** every claim below about what the language does *today* was
probed against `aontu@0.53.0` and `go/v0.1.11` in-tree, and carries its
probe. Claims about what it *should* do are argument, and are marked as
such.

## 1. The proposal

Three parts, as given:

1. **Alias declaration.** `foo = 1` means that `foo`, appearing in a
   value expression, denotes `1`. Grammar: `KEY = <aontu value>`.
   Aliases are **local to the file that declares them**.
2. **`export({...})`** declares which aliases a file publishes.
3. **`import(string, @<ref>, {...})`** takes the path (as a string) at
   which to place the import, the file to import, and an optional
   destructuring of the imported aliases so they can be used directly.
   **Superseded — see §6.** Asked whether `import` was needed at all,
   the answer is no: a destructuring left-hand side does the job with
   no new builtin.
4. **Shorthand.** `{ foo, bar }` stands for `{ foo: foo, bar: bar }`,
   as in JavaScript. This turns out to be **load-bearing** rather than a
   nicety, once §6 drops `import`.

The worked case is the one from
[`docs/reference-language.md`](../reference-language.md#named-constraint-aliases):

```
# today
type: type({})
type: { uint8: integer & min(0) & max(255) }
listen: $.type.uint8
listen: 200

# proposed
uint8 = integer & min(0) & max(255)
listen: uint8
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

Row 6 is the happiest: the JavaScript shorthand costs nothing.
Row 11 matters for §6 — the destructuring form is the alias declaration
generalised from a name to a pattern, not a new construct.
Rows 12–14 matter for §4's A-4. Rows 2–5 are where the difficulty is,
and §10 quantifies it.

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

`uint8 = integer & min(0) & max(255)` followed by `listen: uint8`
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
listen: uint8
uint8 = integer & min(0) & max(255)
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

### Shadowing

**Decision point A-3.** If a file declares `uint8 = …` and also has a
key `uint8:`, what does a bare `uint8` in value position mean? Three
options: alias wins, key wins, or it is an error. Recommend **error** —
the two readings are both plausible to a human, and Aontu's habit is to
refuse an ambiguity rather than resolve it by a rule the reader has to
remember. Cheap to check, since both names are known after the pass.

### A-4: the capture hazard, and three ways out

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

**Option A — put a sigil in the alias's name.** Declared and used
identically, so there is no question of which side carries it:

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
taken. **`%` is the recommendation**, and the choice among `% ~ ^` is
free on this evidence.

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

**Recommendation: A**, because it is the only one that also answers §8,
and the measurement puts its cost at the same near-zero as `=`. **B is
the fallback** if the sigil is judged to cost more than it looks —
it preserves the `listen: uint8` reading exactly. A and B compose, but
A alone makes B unnecessary.

## 5. `export`

`export({ uint8, port })` — using the row-6 shorthand — declares which
of the file's aliases are published. Everything else stays private.

Open shape questions:

- **Is `export` a declaration or a value?** It is written like a
  builtin call, but it cannot *evaluate* to anything without appearing
  in the output. Either it is erased like an alias (recommended, and
  consistent with `type()`-marked fields being omitted), or it needs a
  home key and the reader has to know it is special.
- **May a file export something that is not an alias** — a key, a
  constraint, a whole subtree? Recommend **no** for the first version.
  Exporting keys is what `@"…"` already does, and the value of this
  proposal is precisely that aliases are the things `@"…"` *cannot*
  carry.
- **Is export required for import?** Yes, or "local to the file" means
  nothing. An unexported alias must be invisible to an importer, and
  importing a name that is not exported must be an error naming the
  name — not a silent nothing.

## 6. Crossing the file boundary — and why `import` is not needed

The proposal gave `import` three arguments. Taken one at a time, two of
them duplicate machinery the language already has, and the third is the
only thing actually missing.

| Argument | What it does | Already expressible? |
|---|---|---|
| `"path.to.place"` | place the file's **values** at a path | yes — `svc: @"other.aon"` |
| `@"other.aon"` | read the file | yes — that *is* `@"…"` |
| `{ uint8, port }` | bring its **aliases** into scope | **no** — the only gap |

`@"…"` already crosses the file boundary for values. What it cannot
carry is aliases, because an alias is erased before a value exists. So
the missing feature is not an import verb; it is a way to bind names.

**A destructuring left-hand side does exactly that**, and row 11 shows it
occupies the same syntactic slot as the alias declaration — it is
`KEY = value` with the key generalised from a name to a pattern:

```
{ uint8, port }   = @"types.aon"     # bind two exported aliases
{ u8: uint8 }     = @"types.aon"     # …and rename while binding
svc: @"types.aon"                    # values, if also wanted — unchanged
```

One form, `<pattern> = <value>`, where the pattern is a name or a map of
names. No new builtin, and the two concerns separate cleanly: **values
cross via `@"…"`, names cross via a pattern on the left of `=`.**

### What dropping `import` buys

- **Decision I-1 disappears.** There is no placement argument, so there
  is no question of a string path as a write location — the thing
  nothing else in the language does. `move(p)` takes a real path
  expression and reads; a string path would have been unchecked by the
  parser and unfollowable by `why` or `get`.
- **Decision I-2 disappears.** The destructuring list *is* the import,
  so "exported but not destructured" has no meaning.
- **The trust question dissolves.** The earlier draft argued at length
  that `import` must ride the same resolver and confinement as `@"…"`,
  or it adds a fifth input to hermeticity's four and falsifies
  [`docs/trust.md`](../trust.md) clause 1 in both ports. With the
  right-hand side being a plain `@"…"`, **there is no new file-reading
  route to govern** — confinement, the resolver chain and the include
  manifest all apply unchanged, because it is the same include.
- **The module question dissolves too.** A module-shaped `@"…"` works on
  the right-hand side with no new machinery, so this adds no
  distribution surface at all — which §6 of the earlier draft named as
  the outcome to aim for and could only hope for.
- **The shorthand becomes load-bearing.** `{ uint8, port }` is now the
  import syntax rather than a convenience, which also answers **S-1**:
  it is confined to *pattern* position, a principled boundary rather
  than an arbitrary one, and never collides with bare strings in
  ordinary maps.

### The one question it opens

`@"other.aon"` evaluates to the file's **value**. So `{ port, host } =
@"config.aon"` has two readings: bind to the file's exported *aliases*,
or bind to the *keys* of the map it evaluates to.

**Decision point E-1.** The second reading is arguably more natural, and
it would make `export` unnecessary — the public surface would just be
the file's keys. But it also dissolves §2's locality argument, which is
the whole case for aliases crossing a boundary at all. The first reading
keeps `export` meaningful and keeps "this name is mine" expressible.
They could coexist (aliases when the name is exported, keys otherwise),
but a rule that silently falls back from one namespace to another is the
A-4 mistake in a new place, so: pick one.

Recommend the **alias** reading, with `export` retained — and note that
under Option A of §4 the two are visibly different anyway, since an
exported alias is written `%uint8` and a key is not.

## 7. The `{ foo, bar }` shorthand

Row 6 shows this is free syntax. Two notes:

- It should be **general**, not special to `export`/`import`. If
  `{foo, bar}` means `{foo: foo, bar: bar}` in one place and is a parse
  error in another, that is a second grammar to remember. But general
  means it also applies to ordinary maps, where `foo` in value position
  is a bare string today — so `{name, port}` would mean
  `{name: "name", port: "port"}` in a file with no such aliases, which
  is almost certainly not what anyone means.
  **Decision point S-1**: general (and therefore interacting with the
  bare-string hazard of §4) versus confined to the two builtins
  (and therefore a local rule). This note leans **confined**, on the
  grounds that the shorthand's whole value is in an alias context.
- Canon must expand it. `{foo}` and `{foo: foo}` are the same document
  and must hash identically.

## 8. Interactions to keep straight

The language would then have **four** name-like things, and a reader
has to tell them apart at a glance:

| Form | Resolved from | Scope | Erased before canon |
|------|---------------|-------|---------------------|
| `$name` | the **host program** (§ Variables) | evaluation | no — it is a value |
| `$.path` | the **document** | document | resolved away |
| `foo` (alias) | the **file** | file | **yes** |
| `foo:` (key) | it *is* the document | document | no |

Under the bare spelling, three of the four are distinguishable by sigil
and the alias is the one that is not — the ergonomic win and the
readability cost in one sentence, with §4's capture hazard as its
sharpest consequence. **Option A of §4 makes it four out of four**,
which is the second reason to prefer it: this table is an argument for
a sigil quite apart from A-4.

## 9. Decision points, gathered

Nothing should be built before these are answered.

| # | Question | This note's lean |
|---|----------|------------------|
| **A-1** | What site does a finding name when the value came via an alias? | Both, as a `why` contribution |
| **A-2** | May an alias reference another alias? | Yes, with a cycle check |
| **A-3** | Alias name colliding with a key | Refuse |
| **A-4** | **Alias name colliding with a bare string** | **Option A — a sigil in the name (`%uint8`)**; B as fallback. §4 |
| **E-1** | Does a destructure bind exported *aliases* or the value's *keys*? | Aliases, `export` retained. §6 |
| **S-1** | Is `{foo, bar}` general or confined? | **Answered** by §6 — confined to pattern position |
| **X-1** | Is `=` the right spelling at all? | See §10 |

**Dissolved, not decided.** `I-1` (placement as a string path) and `I-2`
(exported but not destructured) were questions about `import`, and §6
removes the builtin that raised them; `S-1` is answered by the same
change. A-4 moved from unresolved to a recommendation with a
measurement behind it. **Two open questions replace four.**

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

**X-1** is therefore a real fork, not a formality:

- `foo = 1` — best ergonomics, the break above, whitespace becomes
  significant in one place.
- `alias(foo, 1)` — no break at all, consistent with ADR-008 and with
  the proposal's own other two parts, worse to read at the density
  where aliases pay off.

This note does not resolve it. It records that the syntax is the
expensive part of the proposal and the semantics are the valuable part,
and that the two can be decided separately.

## 11. Non-goals

- **No computation.** An alias substitutes a value expression; it takes
  no parameters and is not a macro or a function. A parameterised alias
  is a user-defined function, which
  [AONTUCONSTRAINTS.0.md §9](AONTUCONSTRAINTS.0.md) refuses on
  termination grounds and this note refuses for the same reason.
- **No re-export.** A file that imports a name does not thereby publish
  it. Chains of re-export are how a name's origin becomes unfindable.
- **No dynamic names.** The importable set is textual and known after
  parsing, or `aontu mod verify` and the include manifest cannot see it.
- **Not a second module system.** See §6.

## 12. Test plan

Per ADR-001 nothing lands without shared rows probed in both engines.
Sketch only, since §9 is open:

- **Aliases:** substitution in every value position; use-before-declare
  (order independence); alias-of-alias; cycle refused; shadowing refused;
  erased from canon *and* from the hash — a document with aliases and its
  expanded twin must produce the identical `aon1-…` string, which is the
  sharpest single row in this list.
- **Export and destructuring:** exported name bindable; unexported name
  refused *by name*; destructure and rename; a module-shaped `@"…"` on
  the right-hand side resolving as it already does; and whichever way
  E-1 lands, a row pinning that a non-exported key is not silently
  reachable.
- **Trust:** nothing new to pin. The right-hand side is a plain `@"…"`,
  so the existing include rows already cover every confinement mode and
  the include manifest. That absence is itself the argument for §6 —
  the earlier `import` design would have needed a row per mode.
- **Shorthand:** `{foo}` ≡ `{foo: foo}` in canon; refusal wherever S-1
  lands it out of scope.
- **Negatives paired with positives** throughout, per the house rule.

## 13. Phasing

| Phase | Content | Gate |
|-------|---------|------|
| P0 | Settle X-1, A-4 and E-1 first | no code |
| P1 | Aliases, file-local, with canon erasure and the cycle/shadow refusals | the hash row |
| P2 | `export`, and `{…} = @"…"` destructuring | canon expansion |

P1 is independently useful and independently shippable: file-local
aliases with nothing crossing a file boundary is the whole of §2's
argument, and it can be judged before any of §5–6 is built.

**A-4 must be answered before P1, not during it** — if an alias name
silently captures a bare string, adding an alias to a file can change
the meaning of a line that does not mention it, which is the opposite of
what the rest of the language does. It is no longer the open risk it
was: §4 gives three ways out, a recommendation, and a corpus
measurement putting the recommended one at the same cost as `=`. But it
determines the spelling, so it cannot be deferred into implementation.

The old P2/P3 split is gone with `import`: `export` and destructuring
are one phase now, because destructuring *is* the import.

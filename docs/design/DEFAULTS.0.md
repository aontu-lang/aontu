# Defaults: the star is sugar, the disjunction is the structure

Status: P0 implemented (this document's rules). Owner ruling
(Richard, 2026-08-29): **the short form is sugar; the long form —
a disjunction of the default with its own type — is the real
structure.** `a: *x` means `a: *x | super(x)`, and every place the
two spellings disagreed is resolved in favour of the long form.

Recorded as [ADR-011](../../ADR.md#adr-011). This completes ADR-004
rather than reversing it: ADR-004 said a default inside a disjunction
must be admitted by that disjunction; this says a default *is* a
disjunction with its own type, so there is only ever one rule.

## What was wrong

`*x` and `*x | super(x)` were separately implemented mechanisms that
happened to agree on the common case. A probe of the whole cross
product (both ports, byte-identical) found four disagreements:

| Case | `a: *1` | `a: *1 \| super(1)` |
|---|---|---|
| peer `1.5` | refuses `no_scalar_unify` | refuses `\|:empty` |
| peer `*7` | refuses `scalar_value` | answers `*7` |
| `%x = {p:1}`, peer `{q:2}` | `{q:2}` — default dropped | `{q:2} \| {p:integer,q:2}` |
| `%x = {p:1}`, peer `"s"` | `"s"` — default dropped | refuses |

and two more the long form exposed by construction: `*integer` gated
nothing (any peer won, including a string), and a rank ladder inside
one disjunction (`*1 | **2`) discarded every arm but the lowest at
parse time, so eliminating that arm lost the whole default instead of
promoting the next.

The container rows are the sharpest: `*{p:1}` dropped a default that
`pref({p:1})` — the *function* spelling of the same thing — kept.
The two spellings of one operator did not agree with each other.

## The rules

### R1 — One refusal, and it is the disjunction's

A rejected override refuses as an **emptied disjunction**, code
`empty`, from both spellings. The short form used to raise whatever
its gate's inner meet produced (`no_scalar_unify`, `not-scalar-type`);
those are the codes of a meet the author did not write. What the
author wrote was a default, and the refusal is that nothing remains of
it.

The code is `empty`, not the old `|:empty`. The registry's
append-only rule is suspended for this one rename by the same owner
ruling: the leading `|:` named a spelling (the disjunction operator)
at a moment when the disjunction may never have been written, and a
code that lies about its own origin is worse than a frozen name. The
sibling `|:empty-dist` follows it to `empty-dist`.

### R2 — Same-rank distinct defaults refuse, in every spelling

Two surviving preferences of **equal rank and different value** refuse
at the meet, code `pref_rank_clash`, whose hint names the fix: rank
one of them (`**`). This replaces three different behaviours —
the short form's `scalar_value` conflict, the long form's silent
rebind to the newcomer, and the half-desugared spelling's answer of
the newcomer — with one.

Equal rank and *equal* value still collapses to one preference:
`*1 | *1` is `*1`, and `a:*1` twice is `*1`.

### R3 — A container default is leafwise in what it admits

A map or a list default had no gate at all: `superior()` answers `top`
for a bag, and `unite(top, peer)` is the peer, so *anything* overrode a
structural default — a value of another kind included — and a map that
merely added a key REPLACED the default rather than merging with it.

Under R1 and R4 together the bag meets the peer as the bag it is, and
the leafwise behaviour falls out with no rule of its own:

| `%x = {p:1}` | before | after | why |
|---|---|---|---|
| alone | `{p:1}` | `{p:1}` | — |
| `& {q:2}` | `{q:2}` — `p` lost | `{p:1, q:2}` | first arm: maps merge, so the default admits it |
| `& {p:2}` | `{p:2}` | `{p:2}` | first arm empty, `super({p:1})` = `{p:integer}` admits it |
| `& "s"` | `"s"` | refuses | both arms empty |

**The star stays where it was written.** An earlier draft of this rule
rewrote `*{p:1}` to `{p: *1}` at the value level, which is what
`pref({p:1})` produces and reads well — but it costs two things the
language cannot pay:

- **Canon stops round-tripping.** `*{p:1}` would canon as `{p:*1}`,
  which re-parses to `{p:**1}` — a star per trip. R6 exists because
  canon is a trust surface.
- **A defaulted alternative loses its star.** `*{a:1} | {a:number}` is
  the idiom for "this shape by default, that shape otherwise". With
  the star dissolved into the leaves, neither arm is preferred and
  generation cannot choose.

So the star distributes in EFFECT, through the meet, and not in
spelling. `pref({p:1})` still writes the leafwise form directly, and
the two agree on every value they generate and every peer they admit;
they differ only in canon, which is the difference between the two
spellings the author chose.

Shape is not a value and takes no star: key optionality, closedness
and a `&:` spread template are untouched.

The replace-anything reading stays spellable, as `*{p:1} | top`.

### R4 — The override gate is `super()`

The gate a peer must pass to replace a default is `super(x)` — the
same function the long form spells out loud
([SUPER.0.md](SUPER.0.md)). Two special cases retire with it:

- A kind peg gated nothing (`*integer` was overridden by `"s"`),
  written when a kind's superior was `top`. Its gate is now
  `super(integer)` = `number`: `7` still wins, `"s"` refuses.
- A constraint peg had no gate for the same reason. `*min(3)` now
  gates on `number`.

For a scalar peg the gate was already the kind, which is what
`super()` answers, so the common case does not move. The whole gate
is now one sentence: **a default yields to what its `super` admits.**

### R5 — Ranks order the surviving arms; they do not collapse at parse

`*1 | **2` keeps both arms. Generation takes the lowest-rank
**surviving** preference, so eliminating the lower one promotes the
next:

```
a: *1 | **2          generates 1
a: *1 | **2
a: neq(1)            generates 2   (was: the whole default was lost)
```

Ranking used to run once, before the member trials, and discard every
arm but the lowest — so an arm the trials would have eliminated took
the ladder with it. Rank is a *preference order over what survives*,
which is only knowable after the trials.

Cross-statement layering is untouched, because that is a conjunct
meet rather than a disjunction: `a:*1` with `a:**2` is `1`, and
`a:**1` with `a:*2` is `2` — fewer stars wins, more stars is the
weaker base layer.

### R6 — The desugaring is semantic, never syntactic

`*1` prints as `*1` in canon and hashes as `*1` in the `aon1-` form.
The equivalence lives in the machinery (R1–R5), not in a parse-time
rewrite: canon byte-stability is a trust-surface contract
(docs/trust.md), and rewriting `*x` to `*x | super(x)` at parse would
rehash every document that carries a default.

R3 obeys this rather than excepting itself from it: a container
default is leafwise in what it ADMITS, and keeps the shape the author
wrote. `*{p:1}` canons as `*{"p":1}` and reparses to itself.

## What deliberately does not move

Every scalar override, stand and refusal at every rank; the ADR-004
admission refusals (the enum-typo row, the constraint-branch rows);
the `*x | top` open-default idiom; `**hello & false` refusing; and
generation of an un-overridden default at any rank.

## The flipped rows

Eighteen pinned rows change, each replaced by a row pinning the new
behaviour and naming the rule. Four of them are the `pref.tsv` block
that recorded the structural-default behaviour "so that change cannot
be made by accident, in one port only, or without noticing which of
the two behaviours moved" — this is that change, made on purpose, in
both ports, with the movement named.

| Row | Was | Now | Rule |
|---|---|---|---|
| `pref-struct-map-default-yields-string` → `…-refuses-string` | `"s"` | `empty` | R3 |
| `pref-struct-list-default-yields-string` → `…-refuses-string` | `"s"` | `empty` | R3 |
| `pref-struct-map-default-replaced-not-merged` → `…-merges` | `{y:2}` | `{x:1,y:2}` | R3 |
| `pref-struct-list-default-yields-number` → `…-refuses-number` | `5` | `empty` | R3 |
| `pref-scalar-default-refuses-map` | `not-scalar-type` | `empty` | R1 |
| `pref-nested-concrete-wins` | `no_scalar_unify` | `empty` | R1 |
| `number-tower` pref-\*-err × 6 | `no_scalar_unify`, `scalar-type` | `empty` | R1 |
| `pref-float-kind-peg-yields-peer` → `…-refuses-other-kind` | `"hello"` | `empty` | R4 |
| `var-pref-kind-narrow` → `var-pref-kind-refuses-other-kind` | `"hello"` | `empty` | R4 |
| `edge-pref-of-constraint` | `5` | `*5` | R1 |
| `edge-pref-pref-disjunct` | `scalar_value` | `pref_rank_clash` | R2 |
| `why-pref-chain` | `scalar_value` | `pref_rank_clash` | R2 |
| `vet-pref-yardstick` | names `integer` | names `*1` | R1 |
| `ghost-*-canon` × 2, `spread-hidden-key-resolves-canon` | starless leaves | the star survives | R1 |

The last three are the same fact in canon: a default the peer
SATISFIES now stands (`*1 & 1` is `*1`, not `1`), because the first
arm of the distribution is the one that answered. The generated
values are unchanged.

## Implementation

- `ts/src/val/PrefVal.ts` / `go/pref.go`: `resuper()` gates on
  `superOf` (R4); the gate refusal is `empty` (R1); a same-rank
  distinct pref peer is `pref_rank_clash` (R2); a peg that resolves
  to a bag distributes (R3, for `*$.ref`).
- `ts/src/val/DisjunctVal.ts` / `go/disjunct.go`: `rankPrefs` keeps
  every rank and only folds equal ranks (R2, R5); `gen` picks the
  lowest-rank survivor (R5); the empty refusal is `empty` (R1).
- Shared rows: `test/spec/defaults.tsv` (new, 29 rows) pins every
  rule; the eighteen rows above change in place.

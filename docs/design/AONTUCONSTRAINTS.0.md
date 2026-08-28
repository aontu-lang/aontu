# Aontu Constraint Machinery — Gap Analysis and Design

**Status:** Discovery draft — **superseded in part; the §2 baseline is
stale.** Written against **Go port v0.1.6**. As of `aontu@0.53.0` /
`go/v0.1.11`, D1 and D2 are FIXED (ADR-004 and ADR-007), and N1/N2
landed as capabilities under *function* syntax — `min`, `max`, `above`,
`below`, `neq`, `re` — not the CUE operators proposed here, which is why
the §10 lexing break never happened. The operator SPELLINGS this note
proposes are **declined outright** — [ADR-008](../../ADR.md#adr-008--constraints-are-named-not-spelled-with-operators),
2026-08-28: constraints are named, not spelled with operators, and
adopting `>=10` later needs a new ADR. N3 is **deferred** (2026-08-28,
maintainer decision — unblocked, simply not now); the sized-integer
sugar is **not needed**, since named aliases express it in user space
(§6); and **row 7 was not a defect** — `port: >=1024` still evaluates to
`{"port":">=1024"}`, because `>` is not a reserved character and a bare
value containing one is ordinary text, exactly as `port: high` is
`"high"`. This note grades that "worse than unsupported"; the grading
was **retracted** on 2026-08-28, since it assumes an intent the document
never states. Do not read §2 as current behaviour. The item-by-item
reconciliation, re-run against both engines on 2026-08-28, is in
[`docs/capability-review/g1-constraint-algebra.md`](../capability-review/g1-constraint-algebra.md#reconciliation-with-the-2026-08-27-constraint-design-note);
row 7's disposition is [`use-cases/BUGS.md`](../../use-cases/BUGS.md) §45.
**Home:** this repository (TS canonical under `ts/`, Go port under `go/`)
**Origin:** empirical survey run from boru, which consumes the Go port
via its `boru:parselang` module (pinned at `go/` v0.1.6)

## 1. Purpose

Aontu occupies the rarest point in the configuration-language design space:
commutative, order-independent unification with defaults inside the value
lattice, in a terminating (non-Turing-complete) language. Of the widely
used config languages only CUE shares that core; Nickel approximates it
with merge priorities, and everything else (Jsonnet, Pkl, Dhall, Starlark,
HCL) is a directional override chain.

What keeps aontu from fully delivering on that position is its constraint
machinery. An empirical survey (§2) found that the *validated* half of
"validated enum with a default" — the most common schema pattern in
existence — silently does not validate, and that the machinery CUE users
reach for next (bounds, regex constraints) is absent. This note
root-causes the two defects in the current implementation and designs the
missing machinery as lattice values, so validation stays what it should
be: unification.

This note originates downstream — boru's upstream-first rule means
nothing is fixed behind a shim there; changes land here and flow down by
version bump. Aontu's Go port has full language parity with the TS
canonical implementation and both run the shared specs in `test/spec`,
so every change lands as spec rows first, then twice.

## 2. Empirical baseline

All rows verified 2026-08-26 against the Go port v0.1.6 through
`boru -e 'import "boru:parselang"  parse aontu <src>'`, cross-checked
against `cue export` (real CUE, not from docs) where a CUE column is
given.

| # | Source | aontu v0.1.6 | CUE | Verdict |
|---|--------|--------------|-----|---------|
| 1 | `a: *"i" \| "d" \| "w"` | `{a:'i'}` | same | default selection OK |
| 2 | … + `a: "w"` | `{a:'w'}` | same | override OK |
| 3 | … + `a: "nope"` | **`{a:'nope'}`** | conflict error | **D1: no validation** |
| 4 | `a: "i" \| "d"` (no default) | error `Cannot unify value: "i" with value: "d"` | `incomplete value "i" \| "d"` | **D2: wrong error class** |
| 5 | `a: ((*"i" \| "d") & "nope")` | **`{a:'nope'}`** | conflict error | D1 again, explicit `&` |
| 6 | `c: *{p:"tcp"} \| {p:"udp"}` | `{c:{p:'tcp'}}` | same | struct defaults OK |
| 7 | `a: >10  a: 20` | conflict: `20` vs string `">10"` | `{a:20}` | **N1: no bounds** (lexes as string) |
| 8 | `a: =~"^ab"  a: "abc"` | lex error | `{a:"abc"}` | **N2: no regex** |
| 9 | `m: {&: integer, a: 1, b: "x"}` | conflict `"x"` vs `integer` | (spelled `[string]: int`) | all-keys constraint EXISTS and validates |
| 10 | `l: [&: integer, 1, 2]` | `{l:[1 2]}` | (spelled `[...int]`) | element constraint EXISTS |
| 11 | `m: {a?: integer, b: 2}` | `{m:{b:2}}` (unresolved optional dropped) | `a?:` kept as schema | optional keys EXIST (different drop semantics — out of scope) |
| 12 | `a: $.a` | error `Cannot resolve value` | structural-cycle error | self-reference correctly refused |

Two conclusions frame the design. First, the inventory of *existing*
machinery is larger than a CUE-eyed reading suggests: `&:` spreads already
provide validating all-keys and list-element constraints, optional keys
exist, and close/open and type/hide marks exist. Nothing below rebuilds
those. Second, the actual gap is exactly three things: a defect in
disjunction validation (D1), a defect in the error model for unresolved
disjunctions (D2), and two absent constraint families (bounds N1, regex
N2) plus one scoping extension (key patterns N3).

## 3. Existing lattice inventory (Go port file map)

The unification core is small — under 1k lines across seven files — and
every design below slots into it rather than beside it.

| Val | File (Go port) | Role |
|-----|------|------|
| `TopVal` | `go/val.go` | lattice unit; `x & top = x` |
| `NilVal` | `go/val.go` | bottom; carries the conflict message; recorded on `Ctx.err` |
| `ScalarVal` | `go/scalar.go` | concrete scalar (string/int/number/bool/null) |
| `ScalarKindVal` | `go/scalar.go` | kind constraint (`string`, `integer`, …); `integer ⊑ number` special case |
| `ConjunctVal` | `go/conjunct.go` | `&` |
| `DisjunctVal` | `go/disjunct.go` | `\|`; trial-unifies peer against each member, drops failures |
| `PrefVal` | `go/pref.go` | `*x` default marker; rank for nested prefs |
| `MapVal` / `ListVal` | `go/mapval.go` / `go/listval.go` | structures; `&:` spread, `?:` optional, close/open |
| `RefVal` / `VarVal` / `FuncVal` / `PlusOpVal` | `go/ref.go` / `go/func.go` / `go/op.go` | references, `$name`, twelve builtins, `+` |

Two mechanisms the new machinery reuses directly:

- **`superior()`** — every Val knows its widening (a `ScalarVal`'s
  superior is its `ScalarKindVal`). Constraints slot in *between* kind
  and concrete: `string ⊒ =~"^ab" ⊒ "abc"`.
- **The `Gen` / `Unify` split** — `Unify` may return partial values;
  `Gen` is where "did not resolve to concrete data" is decided. Bounds
  and regexes are `Unify`-transparent and `Gen`-fatal, exactly like
  `ScalarKindVal` today.

## 4. D1 — disjunction does not validate (defect)

### Root cause

`DisjunctVal.Unify` (`disjunct.go`) is correct: it trial-unifies the peer
against each member in an error-isolated context and drops members that
fail. Row 4's defaultless disjunction proves the mechanism works — plain
scalar members reject non-equal peers.

The leak is `PrefVal.Unify`'s concrete-peer branch (`pref.go`):

```go
// Peer is a concrete or kind value. Unify the preferred value's
// type with peer: if peer is type-compatible (result is still the
// type), the preference value wins; otherwise peer narrows it.
out := unite(ctx, p.superpeg, peer)
if valSame(out, p.superpeg) {
    return p.peg
}
return out
```

It unifies the peer against `superpeg` — the default's *kind* — not
against the default's value. So the trial of member `*"info"` against
peer `"verbose"` computes `string & "verbose" = "verbose"`, succeeds, and
the disjunct keeps `"verbose"` while the literal members `"debug"`,
`"warn"` correctly drop. One kind-compatible impostor survives every
enum: the marked branch functions as `*"info" | string`.

### Fix

Make the *disjunct trial* test the default's payload, not its kind: in
`DisjunctVal.Unify`, trial a `PrefVal` member as `unite(ctx, m.peg, peer)`
(unwrap, unify, re-wrap in the pref on survival). Then:

- `(*"info"|"debug") & "warn"` → payload trial `"info" & "warn"` fails,
  member drops; `"debug" & "warn"` fails; empty disjunct → conflict. ✓
- `(*"info"|"debug") & "debug"` → marked branch drops, `"debug"`
  survives concrete. ✓ (Matches CUE: a discarded marked branch takes its
  default status with it.)
- `(*"info"|"debug")` alone → members trial only against `top`, nothing
  drops, default selected at Gen. ✓ (Row 1 unchanged.)

### Decision point D1-a: standalone `*x`

The kind-based branch also gives *standalone* prefs a soft-default
semantics: `a: *1  a: 2` → `2` (any kind-compatible peer overrides). CUE
sidesteps this by making `*` illegal outside a disjunction. Options:

1. **Keep soft standalone defaults, fix only the disjunct trial**
   (recommended). `*x` outside a disjunction means "x unless overridden
   by a same-kind value" — a genuinely useful semantics CUE lacks, and it
   stays sound because it is *declared* soft rather than accidentally
   soft. The fix above touches `disjunct.go` only; `pref.go` is
   untouched.
2. Adopt CUE's rule: `*` only inside `|`, standalone pref is a parse
   error. Simpler lattice story, breaks existing configs.

Option 1 preserves behavior everywhere except the defective case, and
turns today's bug into tomorrow's documented feature — but the shared
spec must then pin the standalone semantics explicitly so it can never
again be confused with the enum case.

## 5. D2 — unresolved disjunction reports the wrong error (defect)

### Root cause

`DisjunctVal.Gen` (`disjunct.go`), when no member is a `PrefVal`, folds
**all** members together by unification:

```go
val := vals[0]
for i := 1; i < len(vals); i++ {
    val = val.Unify(vals[i], ctx)
}
return val.Gen(ctx)
```

For `"info" | "debug"` that computes `"info" & "debug"`, and the user
sees `Cannot unify value: "info" with value: "debug"` — a *conflict*
message for what is actually an *unresolved choice*. CUE reports
`incomplete value "info" | "debug"`, which tells the user the fix is to
supply a value, not to remove one.

### Fix

The fold is only correct as a convergence step when the members can
still narrow each other. At Gen time, a multi-member disjunct with no
default is by definition unresolved:

- 1 member → generate it (unchanged).
- ≥1 pref members → fold the prefs, generate (unchanged).
- ≥2 members, no pref → new error class:
  `Cannot generate incomplete value: "info"|"debug" (no default; supply a value or mark one with *)`.

### Error taxonomy

This introduces a distinction the error model should carry explicitly,
because tooling downstream (boru, the LSP) will want to route on it:

| Class | Meaning | When | Today |
|-------|---------|------|-------|
| **conflict** | two things can never both hold | Unify (`NilVal` via `makeNilErr`) | exists |
| **incomplete** | consistent but not yet concrete | Gen (`ScalarKindVal.Gen`, `TopVal.Gen`, new `DisjunctVal.Gen` case, future bounds/regex Gen) | phrased as generic `Cannot generate value: …` |
| **unresolved** | reference target missing | resolve | exists (`Cannot resolve value`) |

Mechanically: a `Why` code on `AontuError` (mirroring `NilVal.why` and
the `hints.go` table), so the three classes are distinguishable without
string matching. boru's `boru:parselang` currently maps everything to
`parse_syntax_error`; once the codes exist it can split out
`parse_incomplete_value` (boru-side follow-up, out of scope here).

## 6. N1 — bound constraints

The largest absent family. Today `a: >10` silently lexes as the string
`">10"` (row 7) — worse than unsupported, since it produces a
well-formed wrong config.

### Syntax

> **DECLINED — [ADR-008](../../ADR.md#adr-008--constraints-are-named-not-spelled-with-operators),
> 2026-08-28.** The bound FAMILY landed (G1 phase 1) and is complete;
> these operator spellings did not and will not. The shipped syntax is
> named atoms — `min`, `max`, `above`, `below`, `neq` — so
> `port: integer & min(1024) & max(65535)` is the spelling of the
> example below. One spelling per concept; adopting the operators later
> needs a new ADR. And what `>=1024` does today is settled too: it stays
> the string `">=1024"`, because `>` is not a reserved character and a
> bare value containing one is ordinary text — `port: high` is `"high"`
> for the same reason.
>
> **The paragraph immediately below grades that "worse than unsupported,
> since it produces a well-formed wrong config". That grading is
> retracted** (2026-08-28; BUGS.md §45, itself retracted). It was
> reasonable when written — bounds existed in no spelling, so a reader
> writing `>10` could only have meant one thing — but it assumes an
> intent the document never states, and ADR-008 removes its premise.
> Nothing here needs fixing; the original text is kept as written.

Unary comparison prefixes in value position: `>10`, `>=10`, `<5`,
`<=5`, `!=0`. Composition needs no new syntax — `&` already exists:
`port: integer & >=1024 & <=65535`.

### Semantics: `BoundVal`

```
BoundVal { op: > | >= | < | <= | != ; limit: ScalarVal }
```

Lattice position: between kind and concrete —
`superior() = ScalarKindVal(limit.kind)`. Unify table (symmetric via the
`unite` dispatcher, one new `isBound` case):

| `BoundVal b &` | result |
|---|---|
| `top` | `b` |
| concrete scalar `s` | `s` if `s` satisfies `b` (same-kind comparison; `integer ⊑ number` as in `ScalarKindVal`), else conflict `NilVal("bound")` |
| kind `k` | `b` if `k` compatible with `limit.kind`, else conflict |
| bound `b2`, same kind | normalized interval (below) |
| bound, other kind | conflict |
| map/list/etc. | conflict |

`Gen` → **incomplete** (§5), exactly like a bare kind.

### Normalization

`b & b2` folds to a canonical interval `IntervalVal {lo, loOpen, hi,
hiOpen, excl[]}` so chains stay O(1) and emptiness is detected at unify
time, not deferred: `>10 & <5` → conflict immediately; `>=5 & <=5` →
the concrete scalar `5` (interval collapses); `!=` accumulates in
`excl` and punches out a collapsed point. Canon renders back to the
minimal `&` chain so specs and error messages stay readable.

### Kinds covered

`integer` and `number` first. String bounds (lexicographic, as in CUE)
are cheap once `BoundVal` exists but are a separate decision —
**D6-a: include string bounds?** Recommend yes-but-later: no known
aontu use case yet, and the comparison semantics (byte vs rune order)
deserves its own spec rows.

### Free win: sized integer kinds

> **NOT BUILT — 2026-08-28 — because the language already expresses
> it.** The conclusion below is right that bounds absorb these; the
> proposed *mechanism* (a name table in the engine) is not needed. A
> `type()`-marked block of named aliases does it in user space:
>
> ```
> type: type({})
> type: { uint8: integer & min(0) & max(255) }
> a: $.type.uint8
> ```
>
> The block emits nothing, the alias constrains at the referring field,
> and — unlike a closed list of built-in names — aliases compose and
> extend to `port`, `percent` or any project's own vocabulary. Pinned by
> `test/spec/constraint-alias.tsv`; documented in
> `docs/reference-language.md` "Named constraint aliases".
> One trap the sugar would have hidden and the idiom exposes: bounds
> alone bound a *number*, so an alias must lead with `integer` or `1.5`
> satisfies it.

`int8`, `uint16`, … become pure sugar: `int8 ≡ integer & >=-128 &
<=127`. A name table in `construct.go`, zero new lattice machinery. This
was surveyed as a separate CUE gap; bounds absorb it.

## 7. N2 — regex constraints

### Syntax

> **DECLINED — [ADR-008](../../ADR.md#adr-008--constraints-are-named-not-spelled-with-operators),
> 2026-08-28**, as with N1. The pattern family landed as `re("p")` in G1
> phase 2, under a normalisation posture stronger than the subset this
> section proposes ([ADR-003](../../ADR.md#adr-003--host-provided-semantics-are-normalised-not-trusted)).
> Note also that the premise below is stale: `=~"^ab"` is no longer a
> lex error, it is a bare string, so the syntax is not "free".

`=~"pattern"` and `!~"pattern"` in value position (CUE spellings; both
lex-error today so the syntax is free).

### Semantics: `RegexVal`

```
RegexVal { pattern: string ; negate: bool }
```

`superior() = ScalarKindVal(KindString)`. Unify: with a concrete string
→ match test, pass returns the string, fail conflicts; with `string`
kind → stays; with another `RegexVal` → plain `ConjunctVal` (both must
hold — no pattern-intersection computation, which is where termination
and implementability would go to die); anything else → conflict. `Gen` →
incomplete.

### Decision point N2-a: dialect parity (blocking)

The Go port would use RE2, the TS implementation native `RegExp` — and
the shared specs in `test/spec` run on both. The spec must therefore
pin a **common subset: RE2-compatible syntax, no backreferences, no
lookaround**, and the TS side should reject patterns outside it rather
than silently accept more. This is also the right posture for a
terminating language: RE2 guarantees linear-time matching, so a hostile
config cannot smuggle in exponential backtracking through a "mere"
validation pattern.

## 8. N3 — key-pattern constraints (scoping extension)

> **DEFERRED — 2026-08-28, maintainer decision.** Not built, and not
> scheduled. The deferral is a choice, not a consequence: `re` landed in
> G1 phase 2 and `&:` spreads already exist, so both ingredients this
> section depends on are in the engine. `&"…"` is a parse error in both
> ports today. The design below stands as written for whenever it is
> picked up.


`&:` already applies a constraint to *every* child (row 9) and is the
right primitive. What is missing is CUE's ability to scope the
constraint to keys matching a pattern (`[=~"^env_"]: string`). Rather
than import CUE's bracket syntax, extend the spread key, which is
already special:

```
m: {
  &: string            # every child (exists today)
  &"^env_": =~"^[A-Z]" # children whose KEY matches ^env_ (new)
}
```

A pattern spread unifies its constraint into matching children only, at
the point plain `&:` spreads apply (`mapval.go`). Multiple pattern
spreads all apply; unmatched keys see only the bare spread. Depends on
N2 for the pattern machinery. **N3-a:** whether a pattern spread should
also *require* at least one match is deliberately answered "no" —
spreads constrain, they do not assert existence (that is what concrete
keys are for).

## 9. Non-goals

Explicitly out of scope, to keep the property that makes this worth
doing — every aontu program terminates:

- **User-defined functions, comprehensions, recursion of any kind.** A
  fixpoint license anywhere makes evaluation undecidable everywhere;
  aontu's refusal to solve `a: $.a` (row 12) is the correct instinct
  and stays. Constraints are checked, never computed with.
- **Closedness changes, optional-key semantics** (row 11's drop-vs-keep
  divergence from CUE), definitions (`#Foo`) — real topics, separate
  notes.
- **Boru-side surface changes** beyond eventually splitting the error
  code (§5). `parse aontu` keeps decoding to plain Nodes.

## 10. Compatibility

- **D1/D2 are pure defect fixes** — no syntax changes, and any config
  relying on row 3's behavior is relying on its schema not being
  enforced. Still semver-major upstream, since outputs change.
- **N1 is a lexing break**: `a: >10` today produces the string `">10"`.
  Quoted strings are unaffected; only bare values beginning with
  `> < = !` change meaning. Corpus risk is minimal (such strings are
  overwhelmingly *intended* as future bounds) but it is a break:
  major version, called out in release notes.
  **This break was never taken and will not be** — ADR-008. Bounds
  arrived as named atoms, so nothing had to be reused, and the break
  would now buy only a synonym. The analysis above stands as the reason
  a *refusal* of those bare strings would still be a break, if BUGS.md
  §45 was retracted rather than closed.
- **N2/N3 are pure additions** (both currently lex errors).
- boru sees nothing until `lang/go/go.mod` bumps the pin; the boru-side
  test rows below make the bump's behavior change visible in one diff.

## 11. Test plan

Every behavior lands as shared spec rows (`test/spec`) run by both
implementations — that is the parity mechanism, and D1's fix is the
shared spec's first chance to pin the *rejection* rows that were always
missing. Pair every positive row with a negative (a discipline borrowed
from boru's test rules): each family ships with its refusals:

- D1: rows 1–3, 5–6 of §2, plus struct-disjunct rejection and
  standalone-pref semantics (whichever way D1-a lands).
- D2: incomplete-error rows for bare kind, defaultless disjunct, and
  (later) unresolved bound/regex; conflict rows unchanged.
- N1: satisfy/violate per operator, interval collapse (`>=5 & <=5` →
  `5`), empty interval (`>10 & <5` → conflict), cross-kind conflict,
  `integer ⊑ number` widening, sized-int sugar bounds, `!=` punch-out.
- N2: match/reject, `!~`, kind conflict (`=~"x" & 5`), out-of-subset
  pattern rejected on both implementations.
- N3: matched-key enforcement, unmatched-key exemption, interaction
  with bare `&:`.

Boru-side, now (before any upstream change):
`lang/go/test/parselang_aontu_test.go` gains a disjunction/default
section pinning rows 1–6 **as they behave today**, with the D1/D2 rows
commented as pinned defects. The upstream fix then surfaces here as an
explicit expectation flip in the version-bump PR instead of a silent
behavior change.

## 12. Phasing

| Phase | Content | Risk |
|-------|---------|------|
| P0 | D1 + D2 — **LANDED** (ADR-004, ADR-007) | outputs change; no syntax |
| P1 | N1 bounds — **LANDED as named atoms** (G1 phase 1); operator spelling **DECLINED**, ADR-008; sized-int sugar **not needed** — see §6 | no break taken |
| P2 | N2 regex — **LANDED as `re()`** (G1 phase 2), under ADR-003 normalisation rather than a pinned subset; operator spelling **DECLINED**, ADR-008 | additive |
| P3 | N3 key patterns — **DEFERRED 2026-08-28** | additive; depends on P2, which has landed |

P0 is independently shippable and is the highest-value single change:
it is the difference between "aontu has enums with defaults" and "aontu
has defaults that look like enums".

# Use case 07: event/message contracts (the schema-registry case)

An order service publishes `order.placed`, `order.paid` and
`order.cancelled` events to a stream. The contract is what a Kafka
schema registry holds: a shared envelope (id/type/time/source), one
payload schema per event type, a discriminated union over all of
them, and a compatibility gate between contract versions. Producers
vet before publishing; consumers vet what they receive; CI refuses a
contract revision that breaks subscribers. This is the bread and
butter of event-driven enterprise systems, and the place where
JSON Schema + registry (Confluent, Apicurio) is today's incumbent.

Run `./check.sh` — 29 assertions drive every claim below against the
real CLI.

## Files

| File | Role |
|---|---|
| `envelope.aon` | shared envelope: id, type, time, source, specversion, correlation_id |
| `orders-v1.aon` | the v1 contract: three closed event shapes, the `Event` union, the dispatch `registry` |
| `orders-v1-1.aon` | additive minor revision (optional field + new event type) |
| `orders-v2.aon` | deliberately breaking revision (required field added, enum narrowed) |
| `probes/*.aon` | kept FAILED attempts, each pinned by check.sh |
| `data/stream/` | a valid three-event stream sample |
| `data/bad/`, `data/ids/` | invalid and id-edge-case candidates |
| `expected/` | canon and inventory goldens |

## How the model is designed

- **Shared envelope by conjunction.** Each event shape is
  `close($.Envelope & { type: "order.paid", payload: close({...}) })`.
  The envelope include (`@"envelope.aon"`) plus a reference
  conjunction gives real reuse; `close()` seals each shape so surplus
  keys are refused.
- **Discriminated union.** `Event: $.OrderPlaced | $.OrderPaid |
  $.OrderCancelled`, discriminated by the pinned `type` string in
  each branch.
- **Dispatch registry.** `registry: {order_placed: $.OrderPlaced, ...}`
  so consumers can vet one branch: `vet --at '$.registry.order_paid'`.
  Keys are underscored because dotted keys are unaddressable (gap 7).
- **Formats by regex.** RFC 3339 timestamps, UUID v4 correlation ids,
  `ord-`/`psp-` id shapes — all `re()`, because there is no
  format/date-time/uuid type (gap 5).
- **Ids across the number tower.** `id: (integer | biginteger) &
  min(1)` admits both a plain JSON id and a `0d`-rescued 19-digit id
  (gap 6 explains why both leaves are needed).
- **Versions as whole documents**, gated by `breaking --against` and,
  where that gate fails (gap 3), by per-branch `subsume --at`.

## What worked

- **Stream vetting is exactly right for consumers.** One command vets
  a whole sample — `vet --at '$.Event' orders-v1.aon data/stream/*.json`
  — with one worst-verdict exit code, and the 0/1/3 exit distinction
  (invalid vs incomplete) maps cleanly onto "reject the message" vs
  "producer sent a partial event".
- **Branch-anchored findings are excellent.** Path, normalised
  expected residual, actual value, and row/col in *both* files:

  ```
  $.registry.order_paid.payload.amount_cents: constraint [conflict]
    [aontu/constraint]: Cannot unify values at path $.registry.order_paid.payload.amount_cents
    expected: integer&min(1)
    actual:   0
    data: data/bad/paid-zero-amount.json:9:21 (0)
    schema: orders-v1.aon:33:29 (integer&min(1))
  ```

  An agent can repair from `expected:` alone. This is better than
  most JSON Schema validators give.
- **The envelope-by-conjunction pattern composes.** `close($.Envelope
  & {...})` keeps optional keys optional, seals the shape, and vet
  enforces all of it ([aontu/closed] on a surplus `topic` key).
- **The lossy-literal refusal is genuine protection.** A 19-digit id
  that binary64 would silently corrupt is refused, not rounded — for
  event ids this is the correct behaviour and JSON toolchains
  routinely get it wrong.
- **Cross-leaf bounds.** `(integer | biginteger) & min(1)` admits
  `1002` and `0d9223372036854775807` and rejects `1.5`, exactly as an
  id column needs.
- **Precise compat findings when the gate can decide.**
  `breaking` against v2 names both real breaks with the witness:

  ```
  $.OrderPlaced.payload.currency: compat_narrowed [compat]
    a specific alternative is not admitted by the general value
    expected: "EUR"|"USD"
    actual:   "GBP"
  $.OrderCancelled.payload.reason: compat_required_added [compat]
    the general value requires this key; the specific value admits instances without it
  ```

  `compat_required_added` on a payload field is exactly the finding a
  registry wants for the most common real-world break.
- **Defaults fill under vet.** `cancelled-1003.json` omits
  `specversion`; the envelope's guarded default fills it and the
  event vets valid — right for envelope metadata (but see gap 4 for
  how fragile the spelling is).
- **Unions do localise *incomplete* data.** A paid event missing
  `source` at the union anchor is reported precisely — the
  discriminator dropped the other branches:

  ```
  $.Event.source: mapval_required [incomplete]
    [aontu/mapval_required]: Cannot resolve value at path $.Event.source
    schema: orders-v1.aon:30:11 (re("^/[a-z][a-z0-9/-]*$"))
  ```
- **The re() refusal messages teach the subset.** The
  `constraint_pattern` error restates the whole accepted/refused
  table inline; an agent can rewrite the pattern without docs.

## Gaps and friction

### 1. KEY FINDING — union error localisation: conflicts drown in alternatives (critical)

The scenario's central question: the discriminator is valid
(`"type": "order.paid"`), one payload field is wrong
(`amount_cents: 0`). Does the report point into the selected branch?
It does not. The entire report is one finding at the union path, with
the whole disjunction — all three branches, 1,535 characters on one
line — as the schema site, at `-1:-1`:

```
verdict: invalid

$.Event: |:empty [conflict]
  [aontu/|:empty]: Cannot unify values at path $.Event
  data: data/bad/paid-zero-amount.json:1:1 ({"id":2001,"payload":{"amount_cents":0,"method":"card","order_id":"ord-1a2b3c4d","payment_ref":"psp-adyen-88f2"},"source":"/payments/eu-1","time":"2026-08-26T10:00:00Z","type":"order.paid"})
  schema: orders-v1.aon:-1:-1 ({"correlation_id"?:re("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"),"id":integer&min(1)|biginteger&min(1),"payload":{"currency":"EUR"|"USD"|"GBP","customer_id":re("^cus-[0-9a-f]{8}$"),"lines":[&:close({... all three branches follow; 1,535 chars total ...}),"type":"order.cancelled"})
```

No field path, no `expected:`, no indication that the `order.paid`
branch matched the discriminator. The same event at the branch anchor
produces the perfect finding quoted under "What worked" — so the
information exists; the union reporter throws it away. Worse, an
*unknown* discriminator (`"type": "order.refunded"`) produces a
byte-identical finding header (`$.Event: |:empty [conflict]`), so an
agent cannot distinguish "unregistered event type" from "known type,
bad payload" without re-vetting per branch. Since a conflict in ANY
field of the selected branch kills that branch and therefore the
whole union, every conflict-class error at the union anchor reports
this way. The pragmatic consequence, adopted by this model: the union
is documentation, and consumers must dispatch client-side (read
`type`, underscore the dots, `vet --at '$.registry.<key>'` — the loop
in check.sh). CUE-style unification cannot know `type` is *the*
discriminator, but even heuristics (report the branch whose
discriminator matched; or per-branch sub-findings) would transform
agent usability.

### 2. Canonical form is not the contract: `close()` vanishes (major)

**Half closed 2026-08-27 ([ADR-007](../../ADR.md)): conjunct defaults
now survive.** `("1.0"|"1.1") & *"1.0"` canons as `*"1.0"|"1.1"` — a
preference conjoined with a disjunction is a preference on the
alternative it names — so the two identity probes below no longer
collide, and the round-tripped text loses `close()` and nothing else.
The rest of this entry is the diagnosis as it stood.

A registry's natural move is to store and serve the canonical text
(`--canon`; the docs say the semantic hash is taken over canon). But
canon renders `close({...})` as a plain open map and silently dropped a
`*default` sitting in a conjunct. check.sh re-parses
`expected/orders-v1.canon` as the contract and vets the surplus-key
event against it:

```
original contract:   exit 1   ([aontu/closed] on $.topic)
canon round-trip:    exit 0   verdict: valid
hash original: aon1-a13eE45SnED6cK8FJnoN15Mth8UwH4ASd6WlHXx0h6s
hash reparsed: aon1-sk4A6MN_8MqdEmXxAFNozEkPzLZ5Vtkwza70UjkUb1A
```

The canonical text of the contract is a *different, weaker* contract
(the differing hashes prove the engine knows) — still true for
`close()`. The defaults half is fixed: `probes/default-a.aon` and
`default-b.aon` differ only in which specversion is preferred, and now
canon differently and hash differently, as two contracts that admit
different values should. For a system whose pitch is "ground truth
with a semantic hash", canonical text that does not round-trip
closedness is still a real hole.

### 3. The breaking gate cannot pass an honest event contract (major) -- FIXED 2026-08-27

**Two of the three are closed, and the third no longer bites.**
Reflexivity is now a law of the subsumption walk, so the list template
compares to itself and `breaking --against orders-v1.aon
orders-v1.aon` answers `compatible`; and `breaking --at` landed, so
`--at '$.Event'` scopes the gate to the union and the purely additive
v1.1 revision answers `compatible` there. What remains is that the
WHOLE-DOCUMENT compare still reads a new top-level definition as a
required key — true, and now avoidable by anchoring rather than by
splitting the file. The gate is deployable. The diagnosis as it stood:

Three compounding problems, all pinned:

- A list element template was not comparable **to itself**. Self-compare
  of v1 was undecided (exit 3), with `expected` and `actual`
  byte-identical:

  ```
  $.OrderPlaced.payload.lines.&: sub_unresolved [compat]
    unresolved residue: the admitted set is not comparable
    expected: close({"qty":integer&min(1),"sku":re("^sku-[a-z0-9-]{4,40}$"),"unit_cents":integer&min(0)})
    actual:   close({"qty":integer&min(1),"sku":re("^sku-[a-z0-9-]{4,40}$"),"unit_cents":integer&min(0)})
  ```

  Any payload with a list-of-records field (order lines — hardly
  exotic) poisoned the gate permanently. **Closed**: every value admits
  itself, residue included, compared by hash form.
- The purely additive v1.1 (new event type, new optional field) is
  reported **breaking** (exit 1), because breaking compares whole
  documents and the new top-level definition reads as a required key
  of a data shape:

  ```
  $.OrderRefunded: compat_required_added [compat]
    the general value requires this key; the specific value admits instances without it
  ```

  Adding an event type is *the* routine registry change; the default
  gate refuses it.
- The gate could not be scoped to the union:

  ```
  aontu: unknown breaking option --at (try --help)
  ```

  **Closed**: `breaking --at '$.Event'` reports the additive v1.1 as
  `compatible`, keeping `--mode`, the policy declaration and the
  `--allow-*` flags that the `subsume --at` workaround gave up.

The per-branch workaround (check.sh section 8) —
`subsume --at '$.<Type>' <new> <old>` for the types both versions
declare, skipping new types as additive — still gives the right
answers, and now gives them for **every** branch: `OrderPlaced` no
longer stays undecided on its list template. It stays in the record as
the finer-grained alternative to anchoring the whole union.

### 4. "Enum with a default" has no sound spelling (major)

> **2026-08-26: fixed by the preference admission gate (ADR-004) —
> assertions updated to the new behaviour.** The disjunct spelling
> `*"1.0" | "1.1"` is now the sound one: `"9.9"` vets **invalid**
> (`[aontu/|:empty]`) and the unset field still generates `"1.0"`;
> the `pref_not_instance` warning is advisory and its message now
> correctly says "any *remaining* alternative". The conjunct
> spelling's limits below are unchanged (the phase-1 limit).
> The original finding is kept as the record.

The envelope wants `specversion: one of {"1.0","1.1"}, default
"1.0"`. Both spellings failed somewhere:

- Disjunct `*"1.0" | "1.1"` (probes/pref-enum.aon) does not enforce
  the set — a same-kind concrete value *overrides* the preferred
  branch, so `"9.9"` vets **valid**, and the accompanying warning is
  itself false ("1.0" is literally the first alternative):

  ```
  verdict: valid

  $.v: pref_not_instance [compat]
    the default "1.0" is not an instance of any alternative of *"1.0"|"1.1"
    schema: probes/pref-enum.aon:13:7 ("1.0")
  ```

- Conjunct `("1.0" | "1.1") & *"1.0"` (used in envelope.aon) enforces
  the set and fills the default under vet — but plain eval of the
  same value is a hard error
  (`[aontu/scalar_value]: ... Cannot unify value: "1.1" with value: "1.0"`,
  pinned via probes/default-a.aon), and canon drops the `*"1.0"`
  entirely (gap 2's hash collision). The reference itself documents
  the conjunct limitation for constraint atoms; here it also bites
  plain enums, in opposite directions on different verbs. There is
  currently no spelling that is simultaneously enforced, evaluable,
  and canon-faithful.

### 5. No format types; the portable regex subset fights RFC 3339 (major)

JSON Schema ships `format: date-time | uuid | uri`. Aontu has only
`re()`, which costs twice:

- Semantics: the pattern cannot know a calendar.
  `"time": "2026-13-41T25:61:61Z"` vets **valid** (`verdict: valid`,
  pinned by check.sh) — month 13, day 41, hour 25.
- Expressiveness: the natural optional-fraction spelling
  `(\.\d+)?(Z|[+-]\d{2}:\d{2})` is refused by the portable subset:

  ```
  [aontu/constraint_pattern]: Cannot constrain value at path $.BadTime.time

  This re() pattern is outside the supported subset. It uses
  a quantifier applied to a group containing another quantifier, which backtracks exponentially in JavaScript.
  ```

  The workaround (envelope.aon) unrolls the optionality into one
  unquantified alternation group —
  `(Z|\.\d+Z|[+-]\d{2}:\d{2}|\.\d+[+-]\d{2}:\d{2})` — which works but
  had to be *derived*; every timestamp field in every contract will
  repeat this dance. A `time.rfc3339()` / `format()` atom family
  would remove a whole class of contract bugs.

### 6. 19-digit event ids: the right refusal, the wrong ergonomics (major)

`data/ids/paid-id-19digit-plain.json` carries
`"id": 9223372036854775807`. Vet refuses it (correctly — binary64
would corrupt it), but the vet finding is terse:

```
$.id: lossy_integer_literal [conflict]
  [aontu/lossy_integer_literal]: Cannot resolve value at path $.id
  data: data/ids/paid-id-19digit-plain.json:2:9 (nil)
```

What an agent needs to know, none of which is in that finding:

- The fix is respelling the literal `0d9223372036854775807`. Plain
  *eval* of the same file says so beautifully ("Aontu refuses rather
  than corrupts: write it as a `0d` literal") — vet drops the advice.
- The rescued spelling is **no longer JSON** (check.sh pins that
  `json.load` refuses the 0d file), so a real producer serializing
  through any standard JSON library *cannot emit the fix*. The data
  path needs a rewriting shim or string-typed ids; this deserves a
  prominent place in the docs.
- The schema side must say `(integer | biginteger)` — the rescued
  value changes numeric leaf, so the obvious `id: integer` contract
  rejects every rescued id with a kind conflict.

### 7. Dotted keys are unaddressable — and event types are dotted (minor)

Wire event types are conventionally dotted (`order.placed`,
CloudEvents style). A registry keyed by them cannot be reached by any
path spelling:

```
$ aontu get '$.registry."order.placed"' orders-v1.aon
$.registry."order.placed": no_path [reference]
$ aontu get '$.registry.order\.placed' orders-v1.aon
$.registry.order\.placed: no_path [reference]
$ aontu get "\$.registry['order.placed']" orders-v1.aon
$.registry['order.placed']: no_path [reference]
```

The dot is always a separator; there is no quoting or escaping form.
Hence the underscored registry keys and the `${type//./_}` mapping in
the consumer loop.

### 8. No provenance through the envelope conjunction (minor, FIXED 2026-08-27)

`why` could not say where a shared field came from:

```
$ aontu why '$.OrderPaid.time' orders-v1.aon
$.OrderPaid.time = re("^\\d{4}-\\d{2}-\\d{2}T...")
  (no contributions: nothing met at this path)
```

The value demonstrably came from `envelope.aon` via `$.Envelope &`,
which is precisely the question a maintainer asks. (Use case 03 saw
`why` attribute across a plain include; the reference-conjunction
style used here defeated it.)

**Fixed** (the review's finding E): the field reached this path by
being cloned out of the envelope, and provenance now travels with a
clone, so the answer names the file and line the pattern was written
on:

```
$.OrderPaid.time = re("^\\d{4}-\\d{2}-\\d{2}T...")
  1. re("^\\d{4}-\\d{2}-\\d{2}T...")  .../envelope.aon:27:9
```

Check 4 pins it in both directions — the file is named, and "no
contributions" must not come back.

### 9. Cross-file misattribution in error sites (minor)

Both directions occur, pinned structurally by check.sh:

- vet's schema site for the bad timestamp says
  `schema: orders-v1.aon:27:9` — but line 27 of orders-v1.aon is not
  the pattern; envelope.aon:27 is. Entry file's name, included file's
  coordinates.
- eval's snippet for the contract cites `envelope.aon:14:32`
  (correct) but renders lines 12-16 *of orders-v1.aon* under it
  (`order_id`/`customer_id`/`total_cents` — text that does not exist
  in envelope.aon). Included file's name, entry file's text.

Either way an agent following the pointer lands on the wrong source.

### 10. No in-language discriminator dispatch (minor)

The obvious repair for gap 1 — make the schema itself select the
branch by `type` — cannot be expressed. `Event: match(_,
{type:"order.placed"}, $.Placed, ...)` (probes/match-dispatch.aon)
never settles under vet, for valid and invalid data alike:

```
verdict: incomplete

$: conjunct [incomplete]
  [aontu/conjunct]: Cannot resolve value at path $
  schema: :-1:-1 (match(_,{"type":"order.placed"},$.Placed,{"type":"order.paid"},$.Paid)&{"total_cents":4200,"type":"order.placed"})
```

(also note the empty file name in `:-1:-1`). Dispatch stays a
client-side responsibility.

### 11. Versions are whole-file copies (minor)

There is no way to write "v1.1 = v1 plus one union branch": including
v1 and restating `Event:` would *unify* (intersect) the two unions.
Each version is a full copy of its predecessor plus the delta —
tolerable, since `breaking`/`subsume` exist to keep copies honest,
but it is 60 lines of duplication per revision that CUE-style
`#Def & {...}` layering would avoid.

## Verdict for this scenario

The branch-level machinery is genuinely strong — closed shapes,
cross-leaf id constraints, regex formats, precise findings, exact
compat codes — and the client-dispatch pattern (registry + `--at`)
yields a working, agent-repairable contract loop today. But the two
things a *schema registry* is for — validate against the union of
subjects, and gate contract evolution automatically — both currently
require workarounds: union errors lose all localisation the moment
data conflicts, and the breaking gate cannot pass an unchanged
contract that contains a list template, flags additive changes as
breaking, and cannot be scoped. Those, plus format types, are the
gaps between "usable with care" and "drop-in replacement for the
incumbent registries".

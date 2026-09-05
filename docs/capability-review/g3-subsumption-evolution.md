# G3: Subsumption as a first-class query; schema evolution

*Status: implemented — all seven phases (the rules, the recursion,
the Go port, the CLI verbs, the deprecation mark, the default-validity
lint, the trim reporter) landed in both ports. Per-phase status and the
corrections this document needs are in the
[progress register](progress.md), which is authoritative for status;
this document is authoritative for design. Part of the
[capability review](index.md) (August 2026). This document expands gap
G3 — exposing the lattice's instance-of relation as a query, and
building the schema-evolution story (breaking checks, compatibility
policy, deprecation) on top of it. Sibling documents own adjacent
surfaces — see [Boundary](#boundary-what-we-will-not-do).*

## Problem

Ground truth is a claim about *time*. Agents cache and act on stale
snapshots of a definition; the definition evolves underneath them; and
today aontu cannot answer the one question that makes evolution safe:
*does the new truth still honour the old one?* The lattice makes the
principled answer nearly free — a value's instances are exactly the
values below it in the ordering — yet no API, verb, or builtin exposes
the relation.

Consider a schema that a platform team ships and other teams' agents
validate against:

```aon
# service-v1.aon
service: close({
  name: string
  port: *8080 | integer
})
```

```aon
# service-v2.aon
service: close({
  name:  string
  port:  *9090 | integer
  owner: string
})
```

The team wants a CI gate — the review index names the verb:
`aontu breaking --against git#main service.aon` — that reports two
findings: a required key `owner` was added to a closed struct (a
v1-valid document without it is now rejected: backward-breaking), and
the default port changed (every consumer that relied on the default
now materialises a different config). No such verb exists. The only
workaround is textual concatenation of the two files — which answers
the wrong question. Verified live, it fails with `Cannot add to
closed structure` at `$.service.owner`: a symmetric conflict that
cannot distinguish "these schemas disagree" from "v2 no longer
admits v1's instances". And it never reports the default change at
all: the meet quietly holds `9090|8080|integer` for the port, and
the equal-rank refusal (`Cannot unify value: 9090 with value: 8080`)
would surface only at generation, which the closed error preempts.

Nor can the check be derived naively from the engine. The obvious
approximation — "a subsumes b if `a & b` comes out as `b`" — fails
on exactly the values that matter, verified live against this
repository's Go implementation:

- `(*1|number) & (*1|number)` canonicalises to `*1|1|number` — even
  `a & a` is not syntactically `a`, so the comparison misfires on
  *identical* inputs.
- `(*1|number) & number` canonicalises to `1|number` — the meet
  silently erases the preference mark, so a derived check cannot see
  default changes at all.
- `close({x:1})` canonicalises to `{"x":1}`, and `hide(1)` to `1` —
  canon does not render closedness or marks, so canon comparison is
  blind to the two features that decide whether an extra key or an
  omitted field is breaking.

And parsed/unified trees are single-use (the documented mutation
caveat), so the original `b` no longer exists to compare against
once the meet is computed.

Second failing example: default validity. A default is supposed to be
one of its disjunct's alternatives, but nothing checks it:

```aon
# level.aon — the default is a typo; nothing objects
level: *wran | info | warn | debug
```

This unifies cleanly and *generates* `{"level":"wran"}` (verified:
`a:*5|string` generates `{"a":5}` today). The schema author shipped a
default its own disjunct does not admit, and every consumer that
leaned on the default received an invalid value from the ground truth
itself. "The default must be an instance of the rest of its disjunct"
is precisely a subsumption query.

Third, there is no way to retire anything. An author renaming
`service.port` can only delete the old field — instantly breaking —
or keep both forever, silently. What they want to write, and cannot:

```aon
# not expressible today
service: {
  port: deprecate(*8080 | integer, {
    msg: "renamed", use: "$.service.listen", since: "2.0.0" })
  listen: *8080 | integer
}
```

with the mark surfaced as a warning at every point of use. Finally,
the same missing relation is the entailment query agents need
directly: "does spec A still guarantee invariant B?" is
`subsume(B, A)` — if A is an instance of B, everything A admits, B
admits. The fact-check pass ranked this family aontu's most
defensible differentiator; none of it exists until the relation is an
operation.

## Current state

The ordering exists operationally; the relation does not.

- **The unite ladder** (`ts/src/unify.ts`, mirrored in `go/unify.go`)
  computes meets by dispatching on Val kinds. It is the semantics the
  subsumption rules must agree with, but it is not reusable as-is:
  the MapVal/ListVal TOP fast path refines in place (the single-use
  caveat), `DisjunctVal.unify` swap-and-restores the context error
  array for member trials (`ts/src/val/DisjunctVal.ts`), and the
  fixpoint is bounded at `maxcc = 9`. A non-mutating "check mode"
  would be a second behavioural contract on every Val.
- **`superior()` is the embryonic generalisation primitive.**
  `ScalarVal.superior()` lifts a scalar to its kind
  (`ts/src/val/ScalarVal.ts`); `UpperFuncVal`/`LowerFuncVal` lift to
  their argument's kind; the `FeatureVal` default is `top`. `PrefVal`
  already reasons with it: `superpeg = this.peg.superior()`
  (`ts/src/val/PrefVal.ts`), so a preference admits any peer that is
  an instance of the preferred value's generalisation — one place
  where the engine natively asks an instance-of question. *(The number tower briefly
  gave `PrefVal` a second yardstick, `familypeg`; it was removed on
  2026-08-25 and `superpeg` is once again both the reported type and
  the override gate — the register's G3 notes record why.)*
- **The `super()` builtin was degenerate and unpinned** — at review
  time. `docs/reference-language.md` documented `super(1)` → `number`,
  but `SuperFuncVal.resolve` returned `this.superior()`, which fell
  through to `FeatureVal`'s `top`; no spec row mentioned `super` at
  all. The builtin was reserved surface this design could re-found —
  and phase 1 re-founded it: `super(x)` now computes the kind
  generalisation the reference always promised, spec rows pin it,
  and the register's G3 notes record the correction (the claim above
  is kept for the design history it motivates, and is no longer
  true).
- **Defaults are rich and fragile.** `PrefVal` carries an integer
  `rank` (`**` outranks `*`); `DisjunctVal.rankPrefs` merges
  equal-rank preferences and drops outranked ones; `test/spec/pref.tsv`
  pins ranked behaviour, and equal-rank conflicting defaults refuse at
  generation (verified: `a:*1|number a:*2|number` errors). But meets
  can silently strip preference marks (the probes above), so default
  information cannot be reconstructed from unify output.
- **Closedness is directional machinery.** `BagVal` holds the
  `closed` flag and `optionalKeys` (`ts/src/val/BagVal.ts`);
  `MapVal.unify` redirects so the closed side drives, with a
  deterministic tie-break when both sides are closed
  (`ts/src/val/MapVal.ts`, ~lines 141–161). `test/spec/close.tsv`
  pins gen/err behaviour but contains no canon row — closedness never
  reaches canonical form.
- **Marks are boolean-only.** `ValMark` (`ts/src/val/Val.ts`) allows
  `type`, `hide`, and custom `_`-prefixed boolean flags. A deprecation
  needs a message, a replacement path, and a version — a record, not
  a bit.
- **Spread templates** live in `spread.cj` on `BagVal`; the
  `isPathDependent` flag (`ts/src/val/Val.ts`) already identifies
  templates whose meaning depends on their location (`key()`) —
  exactly the templates a subsumption comparison cannot decide
  structurally.
- **No verdict vocabulary, no pairing.** The CLI evaluates one file
  ([G2](g2-validation-verb.md) adds the (schema, data) pairing); the
  spec suite's modes are canon/gen/err over a single source — no mode
  compares two documents.

## Prior art

- **CUE `Value.Subsume`** is the direct model: instance ordering
  *is* compatibility checking ("for a newer version of an API to be
  backwards compatible with the previous version it must subsume
  it"), exposed in the Go API. Two costs observed: the answer is a
  bare boolean with documented false negatives, and CUE's production
  history shows defaults and closedness — the two non-lattice-pure
  features — are where the semantics rot; their interactions with
  disjunction forced the multi-year evaluator rewrite. aontu carries
  the same trio plus ranked preferences and spreads.
- **Confluent Schema Registry** contributes the policy vocabulary:
  BACKWARD (default), FORWARD, FULL, and `*_TRANSITIVE` variants,
  enforced at publish time — compatibility as *declared, checked
  policy* rather than reviewer judgement.
- **buf breaking** contributes the CI shape: compare against a past
  git ref, fail the build, ship as an Action; and protobuf's deeper
  lesson — `reserved` field numbers and deprecate-before-remove make
  retirement a staged, mechanical process. Both are curated rule
  catalogues, not computed relations; the null-hypothesis trap in
  [index.md](index.md) says aontu's answer must be the principled
  version.
- **Kubernetes and Terraform deprecation workflows** set the
  point-of-use bar: warnings surfaced by every client, naming the
  removal version and the replacement; the LSP protocol renders
  deprecated symbols natively (strikethrough). Deprecation that is
  only release-notes prose does not reach agents.
- **Typed-feature-structure lineage** (LKB): subsumption is
  quasi-linear alongside unification — the algorithmic cost is low;
  the design cost is writing the rules down per value former. The
  formal survey's algebra checklist is meet, join, emptiness, *and
  subsumption exposed as a query*; completing the disjunct/negation
  cases needs semantic-subtyping machinery whose cost the index's
  traps rule out.

## Design space

**A. Derive from unification.** `subsume(a,b)` := evaluate both,
unify fresh copies, compare the result's canon with `b`'s canon.
Cheapest; no new recursion. Structurally wrong, as verified in the
[Problem](#problem) section: canon idempotence fails on preferences,
defaults are erased by meets, closedness and marks never reach
canon, and single-use trees force the comparison through text.
Retained only as a *differential-testing oracle* where it is sound
(mark-free, pref-free, open, concrete values).

**B. A dedicated three-valued subsumption recursion over the Val
zoo.** A parallel structural walk with explicit rules per value
former — CUE's `Subsume` shape, but returning
subsumes / does-not (with witness) / undecided (with reason) instead
of a boolean with silent false negatives. Cost: a second recursion
whose rules can drift from `unify`'s semantics, twice (TS and Go).
Mitigable: rules land as spec rows first, and property-based
differential tests bind the two recursions together (laws below).

**C. A check-mode flag threaded through the unite ladder.** Reuse
the existing machinery in a non-mutating, non-erroring mode.
Rejected: the mutation exceptions (MapVal TOP fast path), the
trial-mode error plumbing, and preference erasure are load-bearing
behaviours of the hot path; a suppression mode is a second contract
on every Val anyway, and it still cannot make the meet *preserve*
the default/closedness information the meet is defined to consume.

**D. Normalise-then-compare.** Define a semantic normal form and
compare forms. Circular for this purpose — minimising `number|integer`
to `number` *is* a subsumption computation — and equality of normal
forms yields equivalence, not the ordering. This is
[G6](g6-distribution.md)'s hashing problem, which will consume G3's
relation, not the other way round.

**E. Witness-based bounded checking.** Generate concrete instances of
the specific side and vet them against the general side
(Alloy's small-scope UX). Can refute subsumption with a concrete
counterexample; can never affirm it. Adopted as the *fallback* that
sharpens the undecided band, not as the primitive.

**Recommendation: B, with A as the test oracle and E as the
counterexample refiner.** Only B gives a total, deterministic,
three-valued answer — the Ivy lesson in the survey: an agent-facing
query must return a definite verdict or an honest "undecided
because", never a silent false negative. The three-valued contract is
also the honest treatment of what [G1](g1-constraint-algebra.md)'s
algebra leaves open (regex relations, `must`) and what this
language's path-dependent features genuinely cannot decide
structurally.

## Proposed design

### The relation

`subsume(general, specific)` operates on two *evaluated* values (each
freshly parsed and unified — single-use trees make this mandatory)
and returns one of:

- `subsumes` — every instance admitted by `specific` is admitted by
  `general`, under the selected profile;
- `does_not_subsume` — with a witness: the failing path, the two
  sub-values in canonical form, and, where the fallback finds one, a
  concrete counterexample instance;
- `undecided` — with a reason code and the path, never silently.

Three profiles widen what "instance" measures:

| Profile | Compares | Use |
|---------|----------|-----|
| `values` | admitted value sets only | entailment queries |
| `defaults` | values + default materialisation | `breaking` (default) |
| `gen` | defaults + mark-driven output shape | strict pipelines |

Rules, by value former (the full pairwise table is a Phase 0
deliverable in `docs/reference-language.md`):

- **Scalars and kinds.** A scalar subsumes only itself; a kind
  subsumes its scalars and narrower kinds (`number` ⊒ `integer` ⊒
  integer scalars); `top` subsumes everything; nothing but nil
  relates to nil.
- **Maps.** `G` subsumes `S` iff every required key of `G` is
  required in `S` with `G.k ⊒ S.k`; every optional key of `G`
  present in `S` satisfies `G.k ⊒ S.k`; if `G` is closed, `S` is
  closed and `keys(S) ⊆ keys(G)`; if `G` carries a spread template,
  `S`'s surplus keys and template must be subsumed by it.
  Path-dependent templates (`isPathDependent`) are `undecided`
  (`sub_path_dependent_spread`).
- **Lists.** Element-wise by position; a closed general list bounds
  the specific list's length; spreads as for maps.
- **Disjunctions.** Member-wise sufficiency: `G` subsumes `S` if
  every member of `S` is subsumed by some member of `G`. Member-wise
  failure is *not* proof of non-subsumption (`{x:1}|{x:2}` does
  subsume `{x:1|2}` even though no single member does), so on failure
  the checker attempts to concretise the failing member into a real
  counterexample — built from member canons, never via
  `DisjunctVal.gen` and its known fold defect
  (`ts/src/val/DisjunctVal.ts`) — and returns `does_not_subsume` with
  the witness, else `undecided` (`sub_disjunct_distribution`).
- **Preferences.** Under `values`, a preference is its superior for
  admission (the existing `PrefVal.superpeg` semantics). Under
  `defaults`, the *effective default* of each side must additionally
  agree: adding a default where none existed is compatible; changing
  or removing one is not (removal turns previously generable
  documents incomplete). *(As landed the extraction is
  `effectiveDefault` in `ts/src/subsume.ts` — its own walk, not the
  `rankPrefs` reuse this bullet designed; the register records the
  departure. A side whose effective default cannot be determined is
  `undecided` with reason `sub_default_indeterminate`.)*
- **Marks.** Ignored under `values` and `defaults`. Under `gen`,
  changing `type`/`hide` on a field the old version emitted is a
  finding, because generated output changes.
- **G1 constraint atoms.** Deferred entirely to
  [G1](g1-constraint-algebra.md)'s subsumption rules (interval
  containment, exclusion/regex superset checks, `re` by syntactic
  equality only); G1's evaluate-only residue (`must`) surfaces here
  as `undecided` (`sub_evaluate_only`).
- **Unresolved residue.** References, functions, conjuncts, or
  operators surviving evaluation are `undecided`. *(As landed there
  is one code for the family, `sub_unresolved` — not the
  `sub_unresolved_ref`/`sub_unresolved_func` split designed here —
  and no `sub_budget`: exhaustion surfaces as the evaluation's own
  `budget_passes` error before the recursion runs, budget semantics
  being [G5](g5-trust-contract.md)'s. The registered undecided
  reasons are `sub_unresolved`, `sub_disjunct_distribution`,
  `sub_path_dependent_spread`, `sub_evaluate_only` and
  `sub_default_indeterminate` — `test/spec/errcodes.tsv` is the
  contract.)*

The recursion is bounded by the structure of the two values, carries
no fixpoint, and never mutates its inputs — it runs after evaluation,
on finished trees.

### API surface

```ts
// ts/src/subsume.ts, exported from ts/src/aontu.ts
const r = aontu.subsume(generalSrc, specificSrc, {
  profile: 'defaults', at: '$.service',
})
// r: { verdict: 'subsumes'|'does_not_subsume'|'undecided',
//      findings: Finding[] }   — G2's finding object, verbatim
```

Go mirrors it as `a.Subsume(generalSrc, specificSrc, SubsumeOpts)`
in `go/subsume.go`. Findings reuse [G2](g2-validation-verb.md)'s
object, codes, and formats — reported via the G2 error contract,
with new codes appended to the shared registry (`compat_narrowed`,
`compat_required_added`, `compat_default_changed`,
`compat_marks_changed`, `deprecated`, and the `sub_*` undecided
reasons).

### CLI verbs

```
aontu subsume [--profile values|defaults|gen] [--at <path>]
              <general.aon> <specific.aon>

aontu breaking --against <file|git#rev> [--mode backward|forward|full]
               [--allow-undecided] [--allow-deprecated-removal]
               <file.aon>
```

`breaking` evaluates both versions and runs the mode's checks:
backward = new subsumes old (v1-valid documents stay valid); forward
= old subsumes new; full = both — the index's framing, and CUE's.
`--against` takes a file path or `git#<rev>` (resolved by shelling
out to `git show <rev>:<relpath>` — no embedded git), and is
repeatable, which is the manual transitive form until
[G6](g6-distribution.md)'s registry can enumerate published versions;
"version" attaches to files and git refs now, module versions when
G6 lands.

Exit classes mirror G2's convention: 0 compatible, 1 breaking,
3 undecided, 4 schema/engine error, 2 usage. Undecided fails the
gate by default — a gate that shrugs is not a gate — downgradable
with `--allow-undecided`.

Per-document policy makes the mode declared rather than flagged:

```aon
# provisional key until G6 fixes module metadata; hidden, so it
# participates in unification but never generates
aontu_policy: hide({
  compat: *backward | forward | full | none
})
```

`breaking` reads `$.aontu_policy.compat` from the new document, and
`--mode` overrides it; the disjunction-with-default is itself the
declaration's schema. Where the key finally lives, and transitive
variants as registry-enforced policy, are G6 decisions.

### The deprecation mark

A new builtin (the registry's twenty-second, as it landed),
function-form per the G1 precedent:

```aon
port: deprecate(*8080 | integer, {
  msg: "renamed", use: "$.service.listen", since: "2.0.0" })
```

- **Unification-transparent:** `deprecate(x, m)` unifies exactly as
  `x`; the record (all keys optional; `use` is a path spelled as a
  string — a live reference would resolve and unify, which is not
  wanted) rides on the result through meets. *(As landed it rides as
  a rider at the tail of `unite` — the one place every meet passes —
  not "alongside the existing mark propagation" as designed: the
  boolean-mark sweeps are order-sensitive by construction, and a
  record lost in one meet shape is a use the tooling never warns
  about. The register's phase-4 departures record it.)* Boolean
  `ValMark`s cannot hold it, so the Val gains one optional record
  field.
- **Canonical form:** renders reparseably as the call,
  `deprecate(*8080|integer,{"msg":"renamed",...})`, in the existing
  function-canon style; canon convergence holds (the enforced property is CONVERGENCE, not the stronger round-trip this line states — see the correction in [G1](g1-constraint-algebra.md#implementation-plan)).
- **Point of use, three surfaces:** a [G2](g2-validation-verb.md)
  finding with code `deprecated` and severity `warning` — the slot
  G2 explicitly reserved for this mark — whenever vet unifies data
  against a deprecated value or generation emits one; an LSP
  diagnostic with the native Deprecated tag at reference sites
  resolving through the value (`ts/src/lsp.ts`); and a `breaking`
  downgrade — removing a field is breaking, but removing one already
  deprecated in the `--against` version warns instead, under
  `--allow-deprecated-removal` or document policy. Plain evaluation
  output is unchanged.
- `since` is free text until G6 defines module versions to check it
  against.

A key rename remains two findings (removal plus addition) — protobuf
makes renames safe through name-independent field numbers, and the
analogous move for aontu is [G4](g4-identity-relations.md)'s stable
identity mark, not anything G3 adds. Deprecate-then-remove is the
supported rename path meanwhile.

### Default validity and entailment

With the relation in place, the `*wran` defect becomes a mechanical
check: for every preference inside a disjunction, the effective
default must be subsumed by the disjunction of the remaining
members. Surfaced first as a vet `warning` (code
`pref_not_instance`): `a:*5|string` generating `{"a":5}` is today's
observed behaviour (no spec row pins it either way), and existing
documents may lean on it — promoting the warning to an error is
itself a breaking change, sequenced through this document's own
gate, exactly as G1 sequenced its lossy-literal rows.

Entailment for agents is the same call with the roles named: "does
spec A still guarantee B" is `subsume(B, A)` under `values`.
[G7](g7-machine-access.md) owns exposing it as an MCP tool and query
verb; G3 guarantees the engine call exists and is three-valued.

### Trim, as a follow-on

`aontu trim --check <file.aon>` reports redundant entries — implied
by a spread template, or leaving the evaluated result unchanged when
removed — as paths, report-only. The test, as landed, is
evaluate-and-compare alone (`ts/src/trim.ts`): delete the candidate,
re-evaluate, compare canons — which subsumes the spread case this
sentence originally listed separately, and is honest about
everything the fixpoint can see. *Rewriting* the file
is excluded: canon discards comments and layout, so deletion needs
[G7](g7-machine-access.md)'s format-preserving patch surface. Trim
ships as a reporter here and becomes an editor there.

## Boundary: what we will not do

- **No in-language `subsume()` builtin.** Documents reasoning about
  documents is reflection the surface does not need; the verdict is
  three-valued and does not fit a lattice scalar; revisit only if
  [G8](g8-generation.md)'s combinators demonstrate a need
  (surface-creep trap, [index.md](index.md)).
- **No semantic-subtyping completion of the disjunct rule.** Full
  union/complement decision procedures cost months twice over; the
  three-valued answer with witness search is the honest substitute
  (general-negation trap).
- **No version numbering, auto-bump, or registry enforcement.**
  [G6](g6-distribution.md) owns module identity and versions; G3 only
  computes the relation between two values it is handed.
- **No report formats, codes registry mechanics, or severities of our
  own.** [G2](g2-validation-verb.md) owns the error contract; G3
  appends codes to it.
- **No file rewriting** — not for trim, not for
  migrate-off-deprecated codemods; both need G7's patch surface.
- **No buf-style configurable rule packs.** The lattice is the rule;
  a curated rule catalogue is exactly the ad-hoc-ness the principled
  version replaces (null-hypothesis trap: this is what JSON Schema
  diffing and buf structurally cannot do).
- **No LLM-graded judgement, no behavioural/temporal compatibility.**
  The product is a deterministic verdict about values; "v2 eventually
  serves v1 traffic" is not a lattice fact (eval-harness and
  temporal-logic traps).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Rule drift between `subsume` and `unify` recursions (TS and Go, four artefacts) | Medium | High | Spec rows first; property laws bound both: `subsume(a, a&b)` holds whenever the meet is not nil; `canon(a&b)==canon(b)` ⇒ verdict is never `does_not_subsume`; run as PBT differential tests across TS/Go |
| Defaults × closedness × spreads interactions rot (CUE's documented scar) | Medium | High | Pin the pairwise interaction rows (`*` with `close()`, `&:`, `?`, ranked prefs) in Phase 0 before any code, per the index trap |
| False verdicts from member-wise disjunct rule | Medium | Medium | Three-valued contract; witness search from member canons only (never `DisjunctVal.gen`); `undecided` when no counterexample found |
| Undecided verdicts erode trust in the gate | Medium | Medium | Fail-closed default; every `undecided` carries a reason code and path; the reason taxonomy is spec-pinned so it cannot grow silently |
| Single-use trees force re-evaluation per comparison; CI loops re-evaluate both versions every run | High | Low | Accept now (`maxcc = 9` bounds evaluation); incrementality is an engine project outside G3; budgets are G5's |
| Canon blindness to closedness/marks leaks into golden reports | Medium | Medium | The recursion walks Vals, never canon; report goldens render closedness/marks via finding fields, not canon strings; flag the canon-fidelity gap to G6 |
| `deprecate()` record breaks canon round-trip or mark propagation | Low | High | Round-trip and propagation spec rows land before the builtin; record piggybacks on the existing propagation path |
| Surface creep: one new builtin plus two CLI verbs | Low | Medium | One builtin, function-form, zero grammar change; verbs mirror G2's established shape |
| `git#rev` resolution varies across environments | Medium | Low | Shell out to `git show`, document it, and always accept a plain file path; the Action pins its own git |
| Adoption: teams already wire buf/JSON-Schema diff tools | Medium | Medium | Ship exit classes + G2 SARIF so `breaking` drops into existing CI; lead with what rule lists cannot do (computed relation, located witnesses, default-awareness) |

## Implementation plan

Spec-first throughout: every behaviour lands as `test/spec/*.tsv`
rows before code; TypeScript (canonical) first, the Go port follows;
`make test` runs both. Nothing may regress: the shared suite (counts
live in [the register's protocol rule 5](progress.md#the-update-protocol)),
canon convergence, and today's generation behaviour of
invalid-default disjuncts (until the sanctioned flip, which goes
through `breaking` itself).

1. **Phase 0 — rules on paper (M).** Write the per-former subsumption
   table (all three profiles, including the `*` × `close()` × `&:` ×
   `?` interaction cells) into a new section of
   `docs/reference-language.md`. Author `test/spec/subsume.tsv` —
   as landed, in vet.tsv's five-column encoding (name, mode,
   general, specific, expected report) with options carried on an
   `opts` key rather than the six bespoke columns designed here (the
   register records the departure: one encoding, one parser, in both
   runners); extend `ts/test/spec.test.ts` and
   `go/spec_test.go` to run it. Include rows for every probe in the
   [Problem](#problem) section and for each `undecided` reason.
2. **Phase 1 — the recursion, TypeScript (L).** New
   `ts/src/subsume.ts` (a single visitor with a per-former dispatch
   table, so the Val zoo stays untouched); effective-default
   extraction (landed as the walk's own `effectiveDefault`, not the
   `rankPrefs` reuse designed here — see the register); witness
   construction from member canons; export via `ts/src/aontu.ts`;
   rebuild the committed dist (`make build-ts`).
3. **Phase 2 — Go port (L).** `go/subsume.go`, mirroring the
   dispatch table; `go/spec_test.go` runs every subsume row with no
   skip list.
4. **Phase 3 — CLI verbs (M).** `subsume` and `breaking` in
   `ts/src/cli.ts` and `go/cmd/aontu`; `git#rev` resolution; policy
   key read; exit classes; findings through G2's renderer (depends on
   G2 Phases 1–3, which the index sequences earlier);
   `docs/reference-api.md` and `docs/how-to.md`. A CI recipe and the
   Action variant follow G2's.
5. **Phase 4 — `deprecate()` (M).** `test/spec/deprecate.tsv` rows
   first (canon round-trip, unification transparency, propagation
   through refs and spreads, vet warning, breaking downgrade). Code:
   `funcMap` entry in `ts/src/lang.ts`, new
   `ts/src/val/DeprecateFuncVal.ts`, record propagation, `deprecated`
   code in `ts/src/hints.ts`; LSP tag in `ts/src/lsp.ts`; then
   `go/func.go`, `go/marks.go`, `go/hints.go`.
6. **Phase 5 — default-validity lint (S).** `pref_not_instance`
   warning wired through vet, built on Phase 1; rows in
   `subsume.tsv`; the future warning-to-error flip documented but not
   taken.
7. **Phase 6 — trim reporter (M).** `aontu trim --check` in both
   CLIs; redundancy rows in a new `test/spec/trim.tsv`; rewriting
   explicitly deferred to G7.

Ongoing: the PBT differential laws from the risk table run in both
implementations as the Val zoo grows — the ShardStore
lightweight-formal-methods pattern the review adopts throughout.

## Open questions

- ~~**Is a default change backward-breaking by default?**~~
  **Settled as proposed: yes.** The landed engine's default profile
  is `defaults` (`ts/src/subsume.ts`), so `breaking --mode backward`
  flags default changes, and the exit classes shipped documented on
  that footing. (The question as posed: Confluent's BACKWARD ignores
  defaults; this design flags them, because materialised configs
  change under agents' feet.)
- **The policy key.** `aontu_policy` is a plain reserved-by-convention
  name and could collide with user data; alternatives (a mark, a G6
  module-metadata field once modules exist) each move the
  declaration further from the document. G6's module design should
  get a veto before the name ships. *(It shipped as
  `$.aontu_policy.compat` — phase 3 — and G6's landed module design
  raised no veto; the collision concern stands as a known cost.)*
- **Witness search budget.** How hard the disjunct fallback tries
  (branch enumeration depth, instance count) trades undecided-rate
  against runtime; the budget must be deterministic and spec-stated,
  and its exhaustion class belongs to G5. Needs measurement on real
  schemas.
- **Does `subsume` get an `--explain` trace?** A proof-style trace
  ("subsumes because every member …") would serve agents, but
  provenance rendering is [G7](g7-machine-access.md)'s surface; the
  open question is whether the engine records the derivation from day
  one (cheap now, hard to retrofit — the site-tracking lesson) or
  waits for G7's format.
- ~~**Re-founding `super()`.**~~ **Settled: pinned to the documented
  kind-lift.** Both ports now resolve the argument's superior, spec
  rows pin it (`edge.tsv`'s `edge-super-*` among them), and the
  register's G3 notes record the correction. (The question as posed:
  the builtin was documented as kind-lift, implemented as top-lift,
  and spec-tested as neither — leaving it unpinned was the one
  indefensible option.)

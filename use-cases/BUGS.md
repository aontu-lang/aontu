# Verified engine defects

Every entry here was found by building the [use cases](README.md) or by
the readers behind [REVIEW.md](REVIEW.md), then **adversarially
verified**: an independent pass reproduced each claim minimally against
`ts/bin/aontu.js` (v0.53.0 in-tree), attempted to refute it from
`docs/reference-language.md` / `docs/reference-api.md` and the shared
spec, and only then graded it. Behaviour that is documented as intended
is marked **by design** and kept only where the practical consequence
is severe; everything else contradicts the project's own documentation
or spec rows.

Minimal reproductions live under [`repros/`](repros/), one directory
per family; each `.aon` carries an `# expected:` / `# actual:` header.
The nontermination repros (§57 and
`refer-cycles/refer-in-type-hang.aon`) are marked in-file to be run
under `timeout`. (`identity/id-names-own-descendant-crashes.aon` used
to belong beside them, overflowing the host stack; §58 is fixed and it
now refuses.) Severity: **critical** = silent wrong output, unsound vet
verdict, or nontermination; **major** = a documented capability fails;
**minor** = papercut.

Cross-cutting root causes, visible across families:

1. **Template state is shared between destinations that need
   independent instances.** **FIXED 2026-08-26, both halves.** The
   clone half by template-clone isolation (ADR-005): per-child
   template clones no longer share inner nodes — pack/each templates,
   filter conditions and applied spread constraints are FULL
   per-destination instances (the `dup` clone in `Val.clone`'s
   subclasses / `instanceClone` in Go), with every inner path
   normalised to the destination (`repathInstance` / setPaths). The
   unequal-spread half (§6, §7) by the spread application rework
   (ADR-006): the combined template of two unequal spreads carried a
   STATEFUL ExpectVal that tier-1 sharing handed to every destination,
   accumulating each sibling's data and meeting it into the next;
   `ExpectVal.unify` is now pure, so each child meets each template
   independently and children never meet each other's data.
   Families: sibling-crosswire (fixed), generator-seal (fixed).
2. **Vet's incompleteness check is generation-based and filters to
   incomplete-class errors**, so unresolved disjunctions vanished
   (`DisjunctVal.gen` folded members with unify and the conflict was
   filtered) and gen-time mark-skipping erased required-key findings.
   **FIXED 2026-08-27 (ADR-007), both halves.** An unresolved
   disjunction is now `disjunct_no_gen`, class *incomplete* — the class
   vet keeps — instead of a scalar conflict between its own branches;
   and under `--at` the completeness probe descends through the output
   marks, because a mark is a decision about output and `--at` names
   the truth to validate against. Family: vet-soundness (§13, §14).
3. **The schema layer settles alone before the data meet**, so
   schema-internal references, template-conjoined sizing atoms, and
   map-argument `must()` are consumed against schema-side values and
   never re-fired against data — vet and one-document eval return
   opposite verdicts for identical compositions.
   **FIXED 2026-08-27 (ADR-007), in two parts.** The staging half: the
   meet is now built from a FRESH PARSE of the schema, so the fixpoint
   runs once over both documents and references (§15) — and the
   `must()` audits on the write path, which is what made `aontu set`
   accept writes its own policy refuses — see the data. The standalone
   pass remains, as the diagnosis it always was. The engine half, which
   reproduced in a plain two-tree meet: a sizing atom (§16) and a
   map-argument `must()` (§17) were discharged against the layer they
   share a conjunct with. A verdict is now taken only when MORE MEMBERS
   CANNOT CHANGE IT — everything provisional residuates and is decided
   at generation, where nothing more can arrive — and a container that
   cannot be counted yet (every schema, whose members are types) no
   longer counts as one that passed. `--at` keeps the atom it anchors
   on, and the verdict is read by finding class rather than by the
   stage that found it. Family: vet-soundness.
4. **The provenance recorder only attributes meets on original AST
   nodes** — later spread siblings, pack-generated children, and one
   side of every id-merge see cloned/normalised structures whose meets
   are unrecorded, split, or site-less. Family: provenance.
5. **`refer()`/references resolving through a `type()`/`close()`/
   id-merge-cloned context fail to reach a fixpoint** — surfacing as
   `unify_cycle` (revisit budget tripped), `mapval_no_gen` (never
   settles), or unbounded CPU (stays under the per-pass budget).
   Family: refer-cycles. The mark/clone part — a reference cloning a
   still-pending `type()`/`hide()` wrapper and having the clone stamp
   marks at the reference's site — is **FIXED 2026-08-26** (ADR-005:
   references defer on pending mark wrappers); the refer()/fixpoint
   part remains open.

---

## enum-default — the default/validation conflict

### 1. Enum with a default fails open [critical, partly by design]
`k: *'auto' | 'literal' | 'data'` then `k: 'autoo'` → `{"k":"autoo"}`,
exit 0; `vet` says `valid`. Repeating the branch, `pref()` form, ranked
prefs, `close()` around the disjunction, and an `re()` alternative all
still admit the typo. The layered spelling (`k: 'auto'|'literal'|'data'`
plus `k: *'auto'`) enforces overrides but errors with `scalar_value`
when *not* overridden. The override-ignores-alternatives mechanism is
documented (std/system note: "a preferred member does not close a
disjunction") and spec-pinned — but the consequence is that **no
on-field spelling gives both a default and enum enforcement**, the most
common schema pattern in existence. A hidden helper key does work:
`chk: hide(match($.k, 'auto','ok', 'literal','ok', 'data','ok'))`
(repro `match-helper-workaround.aon`) — refusing `'autoo'` with
`match_none`, at the cost of the error naming `$.chk`.
Repros: `enum-fails-open.aon`, `enum-vet-schema.aon` + `out-of-enum.json`.
Status: FIXED 2026-08-26 (the preference admission gate, ADR-004) —
`k:'autoo'` is the `|:empty` refusal in eval and vet alike; `*A|B|C`
is a true enum-with-default (unset generates A, members override,
`*x|top` is the deliberately-open spelling).

### 2. A `*` default disables the constraints in its own disjunction [critical]
`port: *8080 | (integer & min(1024) & max(65535))` with `port: 80` →
`80`, exit 0. Starker: `port: *8080 | (integer & neq(80))` with
`port: 80` → `80` — an alternative that *explicitly excludes* the value
is bypassed. The docs' recommended disjunct spelling for
default-with-bound (`*8080 | min(1024)`) is exactly the form that stops
checking the bound on override; the conjunct form enforces but cannot
default (documented phase-1 limit). Repro: `pref-disables-constraint.aon`.
Status: FIXED 2026-08-26 (ADR-004) — the constraint alternative is
consulted on override: `port: 80` is refused (`|:empty`), `2048` is
admitted, unset still generates 8080; the disjunct spelling now both
defaults and validates. The conjunct form followed on 2026-08-29
(ADR-011): `*x` is sugar for `*x | super(x)`, so the preferred value
answers the meet first and `port: *8080` beside `port: min(1024)`
defaults to 8080 while the bound rides the override space. The
phase-1 limit is closed in both spellings.

### 3. A bare-kind conjunct swallows a rank≥2 default [major]
`a: *1.5 & float` → `1.5` (documented), but `a: **1.5 & float` →
`mapval_no_gen`, exit 1 — the ranked default silently drops out of the
lattice value (`--canon` shows the bare kind). Constraint conjuncts
kill defaults of every rank (that half was the documented phase-1
limit, closed 2026-08-29 by ADR-011); the rank≥2-vs-bare-kind loss is
undocumented and contradicts
the pref section's own rule. Repro: `ranked-default-swallowed.aon`.
Status: FIXED 2026-08-26 (the rank-uniform meet, ADR-004) — a rank≥2
preference defends the innermost value's kind exactly as rank 1 does:
`a:**1.5 & float` → 1.5, and `**2|integer` met by `integer` keeps the
default 2 (the preference stands as itself, rank intact).

### 4. `pref_not_instance` fires on the idiom, with a false message and a real false positive [major]
The lint fires on `role: *member | admin | owner` — and on the bundled
`@"std/system"`'s own `direction: *in | out | inout`, with the site
misattributed into the user's file at the bundled source's row/col.
The message ("the default is not an instance of any alternative of
`*"member"|"admin"|"owner"`") prints the full disjunction including the
preferred branch, making it read as false. The repeated-branch spelling
silences the lint *without restoring any enforcement* (see 1). And a
ranked default (`**member | member | admin | owner`) is a genuine false
positive: generation produces `member`, an instance of the plain
branch, yet the lint still fires — `effectiveDefault` unwraps exactly
one pref layer (`ts/src/subsume.ts:136-138`). Repro:
`lint-ranked-false-positive.aon` + `role-admin.json`.
Status: FIXED 2026-08-26 (ADR-004) — the ranked false positive is gone
(the effective default unwraps every pref layer), the message says
"…not an instance of any remaining alternative of…", and with the
admission gate the lint is an advisory (a typo-shaped default), not a
soundness warning: the repeated-branch spelling now both silences it
and enforces the same admitted set. It still fires, deliberately, on
`*A|B|C` schemas whose default is not drawn from the remaining
alternatives — including the bundled `std/system` `direction:` field —
and the site misattribution for bundled sources remains open (the
site-attribution family).

### 5. `match()` on a defaulted scrutinee takes the first admissible arm [critical]
`side_effect: *readonly | write | destructive` with
`requires_approval: match(.side_effect, destructive, true, false)` →
`{"requires_approval": true, "side_effect": "readonly"}` — the derived
value contradicts the generated value beside it, exit 0. The pattern
unifies with the still-open disjunction via the same-kind override
gate, so the first arm wins while generation picks the default.
Repro: `match-default-crosswire.aon`.
Status: FIXED 2026-08-26 (the defaulted-scrutinee rule, ADR-004) —
match() on a settled scrutinee carrying an effective default tests
patterns against the generation-effective value:
`requires_approval` is false when `side_effect` is unset and true only
when it is genuinely `destructive`.

---

## sibling-crosswire — template state shared across destinations

*2026-08-26: this family is closed — §8 and §9 by the template-clone
isolation change (ADR-005), §6 and §7 by the spread application rework
(ADR-006); see the Status lines.*

### 6. Unequal by-reference templates on one map merge sibling children with each other [critical]
**Status: FIXED 2026-08-26 (the spread application rework, ADR-006).**
Same root as §7: the combined template of two unequal spreads baked in
a stateful ExpectVal that tier-1 sharing handed to every destination.
`ExpectVal.unify` is now pure, so both the id()-merged two-view form
and the one-view conjunction form evaluate green with per-child,
per-template meets. Pinned in both engines: `spread-interleave.tsv`
spread-unequal-idmerge, spread-unequal-map-ref-{2,3},
spread-unequal-list-ref. Historically: two views of one `id()`-merged
entity, each under a `&:` spread whose template arrived by reference,
templates unequal → the entity's own sibling ports were unified with
each other (`Cannot unify value: 9901 with value: 443`), and in the
full model a *different entity's* port leaked in too; `id()` was
sufficient but not necessary. Repros: `idmerge-ref-templates.aon`,
`oneview-ref-templates.aon`.

### 7. Two unequal cross-statement spreads on one map cross-wire siblings [critical]
**Status: FIXED 2026-08-26 (the spread application rework, ADR-006).**
The combined template is stateless: the 'map-self' meet of two unequal
templates wraps a one-sided key as an ExpectVal, the combined map is
shared across destinations when path-independent, and the expectation
accumulated the first sibling's data IN PLACE and met it into the next
(`$.w.y.r: Cannot unify value: 6 with value: 5` — both values sibling
DATA). `ExpectVal.unify` now answers with a new node instead of
mutating itself, a carried expectation is re-wrapped fresh at its
destination, and the stale `TODO: handle existing spread!` is a
documented rule. The vet form (two spreads at different depths) vets
correct data as valid. Pinned in both engines: the
`spread-interleave.tsv` spread-unequal-* composition matrix (literal /
ref-arriving / key()-bearing × 2,3 children × map,list, requiredness
and defaults through the combine) and `vet.tsv`
vet-unequal-spread-depths. Repros: `two-spreads.aon`,
`two-spreads-vet-schema.aon` + data.

### 8. `close()` around a `key()`-bearing pack template evaluates `key()` once [critical]
**Status: FIXED 2026-08-26 (template-clone isolation, ADR-005).**
Each generated child is a full per-destination instance (deep `dup`
clone / instanceClone), so key() resolves per child; the garbled
`$.deploy.NaN.p` on partial overrides is gone (extra keys refuse
cleanly with `closed` at the child's real path). Pinned in both
engines: `gen-close.tsv` close-template-keys-per-child,
close-template-key-pref-override, close-template-key-refuses-extra.
Historically: `deploy: pack($.names, close({ name: key() }))` alone →
`{"auth":{"name":"web"},"web":{"name":"web"}}`, exit 0 — every child
got the first key (without `close()` it was correct).
Repro: `close-key-pack.aon`.

### 9. A rank-2 `key()` default evaluates once and is shared by all children [critical]
**Status: FIXED 2026-08-26 (template-clone isolation, ADR-005).**
A template instance owns its preference's inner value (PrefVal deep
`dup` clone), so `**key(1) | string` answers per generated child and
stays overridable through the admission gate. Pinned in both engines:
`gen-pack.tsv` pack-rankpref-key-per-child, pack-rankpref-key-override.
Historically every child got the first child's key, exit 0 (the
single-star spellings escaped only because the rank-1 meet builds a
fresh pref per destination). Repro: `rankpref-key-pack.aon`.

---

## generator-seal — call wrappers around generators

*2026-08-26: this family is closed — §10, §11 and §12 are fixed by the
template-clone isolation change (ADR-005); see the Status lines.*

### 10. `close(pack(d, _ & t))` + overlay: the overlay fills the hole [critical]
**Status: FIXED 2026-08-26 (template-clone isolation, ADR-005).**
A hole belongs to its nearest enclosing generator: `hasPlace` and the
fill walk no longer cross into a generator's template argument, so the
outer `close()` call does not report the template's `_` as its own and
the overlay merges with the generated child exactly as it does without
`close()`. Pinned in both engines: `gen-close.tsv`
close-pack-hole-overlay-merges. Historically the overlay was absorbed
*into the hole* — every generated child grew a bogus `prod:` child and
the real override was silently lost, exit 0.
Repro: `close-pack-hole-absorb.aon`.

### 11. `hide(pack(...))`: the hide mark leaks onto generated children [critical]
**Status: FIXED 2026-08-26 (template-clone isolation, ADR-005).**
A reference defers on a pending type()/hide() wrapper instead of
cloning the call, so `hide(pack(...))` hides the FIELD exactly as
`hide({literal map})` does and downstream packs over the hidden
children emit their values. Pinned in both engines: `marks.tsv`
hide-pack-field-hidden, hide-pack-downstream-pack. Historically the
downstream pack's data reference cloned the still-pending hide call
and the clone stamped marks at the destination after the reference's
mark-clearing walk had run — children emitted EMPTY, exit 0.
Repro: `hide-pack-mark-leak.aon`.

### 12. Type-alias references inside `type()` bodies silently drop records [critical]
**Status: FIXED 2026-08-26 (template-clone isolation, ADR-005), all
manifestations.** The inline three-line form emits `use` fully
unified; the include-crossing shapes emit their records; `id(key(0))`
resolves; the phantom `mapval_spread_required` is gone. Three
mechanisms, one campaign: references defer on pending mark wrappers
(so a type() mark belongs to the field it was written at, extending
the edge.tsv edge-type-template contract to conjunction-bearing and
include-crossing shapes), spread applications are full
per-destination instances, and a marked peer-only child is carried
rather than wrapped as an expectation. Pinned in both engines:
`marks.tsv` type-alias-conjunct-ref, type-conjunct-arg-ref,
type-conjunct-target-ref, type-alias-ref-first; `file.tsv`
load-alias-spread, load-alias-idspread, load-alias-top-conjunct.
Repros: `include-alias-*.aon`, `alias-*.aon`.
(Related but **by design**: `close()` is uniformly shallow — the
deep-seal spelling `close(pack(d, close(tmpl)))` exists and works; the
reference's "seals the generated shape" phrasing is the papercut.)

---

## vet-soundness — the gate disagrees with the evaluator

### 13. A missing required enum field vets as valid [critical]
Schema `user: { role: 'a'|'b' }`, data `{"user": {}}` →
`verdict: valid`, exit 0, zero findings. Any disjunction whose members
fold to a conflict or over-unify is swallowed (`'a'|'b'`, `1|2`,
`number|string`, `{x:1}|{y:2}`, `string & ('a'|'b')`); bare kinds and
constraints correctly answer `incomplete`. Bare eval of the same
residue errors. The only spelling giving the correct triple is
`role: string & must('a'|'b', "msg")`. Repros: `enum-missing-key.aon`,
`plain-disjunct-satisfied.aon`.


Status: FIXED 2026-08-27 (ADR-007) — an unresolved disjunction no longer
FOLDS its members together at generation. Generation answers the
preferred alternative, or the single surviving one; more than one still
admitted raises `disjunct_no_gen`, class **incomplete** — so vet's
incompleteness pass, which keeps incomplete-class findings, now reports
it. `user:{role:'a'|'b'}` with `user:{}` answers `verdict: incomplete`,
exit 3, naming `$.user.role`; a value that selects an alternative still
passes and one that selects none is still the `|:empty` refusal. The
fold's other victim went with it: `({x:1}|{y:2}) & {z:3}` no longer
generates `{x:1,y:2,z:3}`, a map in neither branch. Both ports; pinned
by `vet.tsv` vet-enum-missing-is-incomplete and its two controls, and by
four `disjunct_no_gen` rows in `disjunct.tsv`.
### 14. `type()`/`hide()` above the vet anchor drops required-key checks [critical]
`vet --at '$.marked.R'` where `marked: type({R: {a: string, b:
string}})` → `valid` for data missing `b`; the unmarked anchor answers
`incomplete`. Wrong-kind values are still refused — only the
required-presence findings vanish (gen's mark-skipping leaking into
vet). **Correction to the use-case READMEs: `copy()` does restore
enforcement** in every arrangement tried. Repro:
`mark-drops-required.aon`.


Status: FIXED 2026-08-27 (ADR-007) — vet finds residue by GENERATING the
anchored meet, and generation honours the output marks. Under `--at` the
probe now descends through them (`Ctx.probe` / `AontuContext.probe`): a
mark is a decision about output, and `--at` names the truth to validate
against explicitly. `vet --at '$.marked.R'` against
`marked: type({R:{a:string,b:string}})` reports the missing `b` and
answers incomplete, while complete data still passes and a wrong-kind
value is still refused. Both ports; pinned by `vet.tsv`
vet-at-marked-anchor-required / -complete / -conflict.
### 15. Schema-internal references bind schema-side only under vet [critical]
Schema `a: integer` / `b: $.a`, data `{"a": 3, "b": 4}` →
`verdict: valid`; the same four lines as one document refuse with
`scalar_value`. The conditional-branch form (a branch keyed on a
data-supplied field via a reference) passes vet and fails eval the same
way. References are consumed during the schema-only evaluation and
never re-fired when data arrives. Repros: `stale-reference.aon`,
`stale-reference-branch.aon`.


Status: FIXED 2026-08-27 (ADR-007) — vet evaluated the schema ALONE to
decide whether it stands up, then used that SETTLED tree as the left
side of the meet, so every reference had already resolved against the
schema's own values and been replaced by them. The standalone pass
remains, as the diagnosis it always was; the meet is now built from a
FRESH PARSE, so the fixpoint runs once over both documents and
references, spreads and generators all see the data. `a:integer b:$.a`
with `{"a":3,"b":4}` answers `verdict: invalid`, `$.b: scalar_value`,
which is what the same four lines as one document have always said.

**Under `--at` the settled anchor is kept, by decision.** An anchor is
a subtree *lifted out of* the schema, and an absolute reference inside
it (`$.OrderPlaced`, the discriminated-union idiom) names a sibling of
the document root the lifted subtree no longer has; the settled tree is
where such a reference has already been resolved. Pinned by
`vet.tsv:vet-at-absolute-ref-*` so the two ports cannot drift on it.

The sharpest practical consequence is on the WRITE path: `aontu set`
takes vet's verdict, so it used to accept writes its own `must()`
audits refuse — use case 08's expired-flag and out-of-range-rollout
traps, both caught only post-hoc in the assembled runtime view. A
refused write is now refused at the point of writing and never reaches
the overlay. Both ports.
### 16. Sizing atoms sharing a conjunct with a container fold against that layer alone [critical]
**Status: FIXED 2026-08-27** (the review's finding C). "Sizing atoms
fold last" was only half the rule: sorting the atom to the end of its
conjunct does not help when the container settles in ONE document and
still gains members from another. A verdict is now taken only when more
members cannot change it — members accumulate under unification and are
never removed — so an upper bound violated, a lower bound satisfied and
a duplicate found are decided at once, and everything else RESIDUATES
and is decided at generation, where nothing more can arrive. A
residuated atom is visible in canon, which is honest: the value really
does still carry the constraint.

The other half was `vet`'s generation probe keeping the `incomplete`
class alone — the first of the two engine causes the review named. A
conflict raised at generation is a conflict, and it now counts.

Two further faults in the same rule surfaced while pinning it, both
found by running the two engines against each other rather than
trusting either. A container that CANNOT GENERATE cannot be counted,
and a schema is exactly that (`{a: integer}` emits nothing): the atom
was discharged there as satisfied, so `length(min(2)) & {a: integer}`
dropped its bound while still alone and the data was never measured at
all. And the verdict was read POSITIONALLY -- whatever the meet found
counted as contradiction, whatever generation added counted as
incompleteness -- so the conflict this fix moved to generation was
reported as `incomplete` where the evaluator refuses. An error-severity
finding that is not incompleteness now makes the document `invalid`
wherever it was found.

`--at` had the same hole one level down: the anchor walk handed back
the container INSIDE a residue, dropping the constraint the author
wrote at that node, so `vet --at $.x` passed data the evaluator
refuses. Stepping THROUGH a residue is still right -- `$.x.a` names a
key whatever its container must still satisfy -- but ARRIVING at one
now keeps the atom.

Both fixes together are what makes `vet(S,D)` and `eval(S ∪ D)` agree
here; the `vet-equals-eval` harness caught the second one the moment
the first landed, which is what it is for.

`x: length(max(2)) & { &: {r:integer} }` vs 3 data entries → `valid`
(canon of the schema alone already shows the atom stripped);
`length(min(1))` beside a template refuses the *schema* (`error`, exit
4); the same compositions in one document behave correctly. Members
from the vet data, an `@` include, or a later pack are never counted.
Bare sizing atoms (no container beside them) residuate and re-check
correctly — the failure is specific to the idiomatic
template-plus-bound spelling, contradicting the reference's "sizing
atoms fold last… written order does not matter". Repros:
`sizing-max-vanishes.aon`, `sizing-min-kills-schema.aon`,
`list-sizing-dropped.aon`.

### 17. Map-argument `must()` is consumed by the schema layer [critical]

**Status: FIXED 2026-08-27** (the review's finding C, with §16). A
`must` over a container residuates with the sizing atoms and for the
same reason: `must({t: max(60)}, …)` beside a `{t: integer}` schema was
answered against the schema layer ALONE and discharged before the data
it was written to judge ever arrived. It is decided at generation now,
and a `must` whose own check is a sizing atom inherits that atom's
provisionality rather than reading its residue as a pass.

`s: {t: integer} & must({t: max(60)}, "session too long")`, data
`{"s":{"t":120}}` → `valid`, exit 0 (canon shows the must already
consumed: `{t:integer}` unified residually with the check and the bound
was discarded, contradicting "residuates until its peer is concrete").
**Field-level `must()` works correctly across the vet meet and
includes** and is spec-pinned — the failure is the cross-field
map-argument form, which is the form cross-field rules need. Repro:
`must-cross-layer.aon`.

(Also verified, **by design** with a doc papercut: `vet --closed` seals
the anchor node only — deep closing needs explicit `close()` per level,
which works.)

---

## refer-cycles — identity, marks, and the fixpoint

### 18. `refer()` inside a named type definition: never settles, or non-termination [critical]
Single file: a `type(close({... refer() ...}))` schema applied by
spread → `mapval_no_gen`, exit 1, with the refer unresolved in the
residue. Crossing an include: `unify_cycle` naming a value meeting
*itself*. With sizing/must atoms alongside: a 25-line two-file document
ran **>570s without terminating** (killed; the equivalent with
`refer()` attached at the bag spread instead: 0.17s, correct and
checked). Repros: `refer-in-type-def.aon`, `refer-in-type-include.aon`,
`refer-in-type-hang.aon` (+schema; run under `timeout`).

### 19. `refer($.X)` — a *reference* as the type argument — trips spurious unify_cycle [major]

**Status: FIXED 2026-08-27** (the review's finding J). Two halves, and
they were two defects. The `typed-refer-two-views.aon` half fell to the
template-clone isolation work (ADR-005) earlier in this effort. The
`inverse-pair.aon` half — typing BOTH directions of an inverse pair,
which every real relation has — was the type FLOW re-entering itself:
`refer(t)` unifies `t` into the target, uniting the target drives the
target's own subtree, and a pair that links back at each other flows
into each other until the depth budget or the host stack ends it. The
model whose meet is a fixpoint on sight (`{kind:service}` meeting
`{kind:service}`) never got far enough for anyone to notice. A flow
that would re-enter an entity is now SKIPPED, because the flow it is
nested in is already uniting that entity, so the same information
arrives by the same channel one frame up; the differs-each-way and
cycle-of-three rows in `test/spec/refer.tsv` pin that nothing is lost.
`use-cases/01-service-catalog/spec.aon` now carries the documented
idiom `refer($.std.Service)` on both directions of the real model, in
both ports, and its gap 8 workaround is gone.

The reference manual's own idiom `refer($.std.Service)` fails with
`unify_cycle` on a two-view id-merged model whose shared schema carries
a referenced ports template — the error names
`integer&min(1)&max(65535)` failing to unify with *itself*. The same
constraint written literally (`refer({kind: service})`) passes.
Typing both directions of an inverse pair fails even in 2 lines.
Repros: `typed-refer-two-views.aon`, `inverse-pair.aon`.

### 20. `refer()` inside a `close()`d spread template never settles [major]
`&: close({ role: refer() & string })` → `mapval_no_gen`; deleting only
`close()` makes the identical document generate and the refer still
enforce. Repro: `close-spread-refer.aon`.

### 21. A reference into a `type()`-marked map from inside that map deadlocks [minor]
`spec: type({ SE: 'a'|'b', TS: close({ side_effect: $.spec.SE }) })` →
`mapval_no_gen` at `$.spec`, far from the cause; the same reference
from outside the map resolves. Loud, trivial workaround (separate
top-level `type()` fields), but the diagnostic misdirects. Repro:
`type-map-self-ref.aon`.

---

## provenance — `why` answers that are wrong or empty

### 22. `why` output differs by sibling position for identical statements [major]
First spread-templated child: the written disjunction is one
contribution (matching the documented contract and the spec golden);
every later sibling: the same disjunction split into two contributions
at different columns — and a spread-only field present on the first
sibling answers "(no contributions)" on later ones. Repro:
`sibling-split.aon`.

Status (§22–24): FIXED 2026-08-27 — PROVENANCE IS PART OF THE CLONE
CONTRACT, which is the review's own recommendation and the one change
all three defects were waiting for. The recorder decided "did the
author write this" by looking the operand's id up in a set stamped
over the parsed tree — true of the parsed tree, and of nothing derived
from it. Every value that reached a path through a clone was therefore
dark. The mark now lives ON the value, and `Val.clone`, `Val.place`
and the disjunct fold carry it exactly as they carry the site: a clone
of a written value IS that written value somewhere else, and it holds
the author's site, so it can be pointed at. Values the engine MINTS
are constructed rather than cloned and stay unmarked, which is what
keeps the record to what the author can edit.

Three further pieces landed with it:

- **A member is not a value beside its container.** Which of the two
  the recorder saw was decided by evaluation order, so §22's siblings
  answered differently for identical statements. The containment is
  now recorded as a fact about the DOCUMENT at stamping time, and an
  operand is reported as the outermost written value it is part of.
- **`markSpread`'s guard was a "done" flag where a cycle guard was
  meant.** A template is applied once per destination and the fixpoint
  advances values in place between applications, so the second key's
  spread walked into an already-marked container and stopped —
  leaving every replaced child unmarked.
- **The value that STANDS at a path is a contribution when nothing
  met.** A generator places a value without a meet, and "nothing met
  at this path" is not an answer to "where did this come from".

One safety rule came with the extra reach: `set --in-place` now
REFUSES a path reached through a reference. `n: $.base` against
`base: 7` correctly reports the literal `7` — at `base`'s line, not
`n`'s — and splicing there would rewrite the referent for every reader
of it while leaving the named path unmoved.

Pinned by seven new shared rows (`why-spread-first-sibling` and
`why-spread-later-sibling` are the pair the review asked for, plus
`why-spread-untouched-later-sibling`, the two `why-pack-generated-*`
and the two `why-id-merge-*`), and five existing rows whose goldens
recorded the defect now record the file and line the value came from.

Two smaller things went with the sweep. A contribution's ROLE is no
longer part of its identity when the record is deduplicated: one
written value can reach a path both as a template application and as
the value written there, and reporting it twice at one position says
nothing the reader can use — the more informative role wins. And the
Go port counted a contribution's byte offset in the ENTRY text even
when the contribution came from an included file, so the two ports
reported different rows for the same value; `why` now carries the same
per-file text map `vet` does, which is finding F's rule applied to
this surface.

WHAT REMAINS, narrowed: §24's id-merge asymmetry is no longer a
silence, but on a large model the position that did not write the
value names the SCHEMA ROW that admits it rather than the line that
selected it — the merge carries the resolved member across, and the
selecting meet happened at the other position's path. Use case 01's
check 7 pins both halves: the file is named, and "no contributions"
must not come back.

### 23. `why` is blind through `pack()` and spread sites can be empty [major]
A default flowing through `pack()` produces the output value while
`why` at the generated path answers
"(no contributions: nothing met at this path)" — a false statement
delivered with exit 0. A `&:` spread applied to pack-generated children
prints a contribution with **no site at all**
(`{file:"", row:-1, col:-1}`). Repros: `pack-blind.aon`,
`spread-site-empty.aon`.

### 24. `why` is one-sided across an id()-merge [critical]
One position of every id-merged entity gets the correct value with a
false "(no contributions)", and **which** position is blind is
model-dependent (the minimal repro and the full model point opposite
ways). Cross-merge sites *are* tracked for errors, so the data exists.
Repro: `idmerge-onesided.aon`.

(Also verified: the tutorial §12 `why` walkthrough documents output the
engine does not produce — a docs defect; and `why` printing unresolved
canon for defaulted values while `get` prints the resolved value is
goldened behaviour worth revisiting, not a bug.)

---

## site-attribution — findings that send agents to the wrong file

### 25. Vet/eval findings mix entry-file names with included-file coordinates [major]
Data-role: a fragment's `name: 7` at line 3 is reported as
`data: <entry>.aon:3:7` — the entry has no line 3. Schema-role: a
constraint from an included library is reported at the entry file with
the library's row/col — "a repair agent that follows the site edits the
wrong file". Inverse mode: the human error frame names the *included*
file while quoting the *entry* file's text under it. Junction/derived
values get the entry file's name with `-1:-1`. (`why` on the same
values attributes correctly, so the engine has the data.) Repros:
`vetsite-*.aon`, `refclone-*.aon`, `excerpt-*.aon`, `junction-*` files.

Status: FIXED 2026-08-27 — ONE INVARIANT, *every site names the file
whose text it excerpts*. The provenance walk used to OVERWRITE every
url with the entry document's name while leaving the coordinates as
they were, which is what produced a real file name against a line it
does not have. It now stamps only the values that carry no name of
their own — the ones the engine minted rather than read — and collects
the urls it actually saw, so a value loaded through `@"lib/types.aon"`
keeps that path with that file's row and column, and the report still
knows which DOCUMENT a site belongs to (roles come from url-set
membership, not from a name comparison). The error frame follows the
same rule: a frame quotes the text of the file its header names, and
where the run holds no text for that file it reports `-1:-1` rather
than resolving an offset against the wrong document. Both ports;
pinned by `a-site-names-the-file-its-text-lives-in` and
`an-included-data-file-is-still-data` (ts/test/vet.test.ts) and
`TestVetSiteNamesTheIncludedFile` / `TestVetIncludedDataIsStillData`
(go/vet_test.go).

The NAME is the one the caller's own spelling reaches: the resolved
absolute path is the right identity (two documents loading one library
by different relative spellings are one file) and the wrong name, so
`vet contract.aon` reports `types.aon` and `vet a/b/contract.aon`
reports `a/b/types.aon`. Without that the fix would have traded a
wrong file name for an unusable one — a SARIF upload naming the build
machine's home directory annotates nothing. Pinned by
`an-included-file-is-named-as-the-entry-reaches-it` and
`TestDisplayFileNamesTheIncludeAsTheEntryReachesIt`.

Two ledger items closed with it. Parity divergence **#66** — a Go
finding's site naming the wrong file under an include — is closed by
the same stamping, its recorded fixture now byte-identical from both
ports. And the junction half of this entry is closed in Go: a clone
rebuilt a disjunction carrying the url and the source text but not the
POSITION, so an enum declared once and named by `$.Role` reported its
`|:empty` at row -1 where TypeScript reported it at the enum. The site
travels whole through every clone now (`clonePathRec`), pinned by the
shared row `vet-refd-disjunct-site`.

Three companion repairs from the same review finding landed with it:

- **Findings carry the repair, not just the diagnosis.** `message` is
  the headline and stays one line, so the `0d` escape that fixes a
  lossy integer literal — and every other hint the engine already
  writes for a terminal reader — reached a machine reader nowhere. A
  finding now carries `hint`, the whole shared hint text with its
  placeholders filled in, present for every code that has one. Excluded
  from spec goldens exactly as `message` is (prose is per-port), pinned
  by `a-finding-carries-the-repair-hint` and its Go twin, and carried
  into SARIF through the embedded finding.
- **`relations` and `trim` report WHY.** Both answered an unusable
  document with `verdict: error` and an empty list. Both now carry
  `errors`, in the vet finding shape, present only on that verdict —
  the engine's own first error, with its site, its hint and the file it
  belongs to. Spec rows `trim-broken-error`, `trim-unparseable-error`
  and `broken-document-is-not-blamed-on-relations` pin the shape in
  both ports.
- **Colour is a decision about the destination.** Error frames
  hardcoded their ANSI escapes, so a piped report carried terminal
  control codes into logs, CI annotations and agents' parsers. The
  library honours `NO_COLOR`; the command additionally turns colour off
  when its stderr is not a terminal, and `--jsonl` turns it off
  unconditionally. Pinned by
  `color-is-gated-by-no-color-and-the-caller` (ts/test/error.test.ts),
  `TestColorGate` (go/color_test.go) and the command-side
  `TestColorForDestination` / `TestRunGatesColor`.

### 26. `breaking --against git#rev` resolves the old side's includes from the working tree [critical]
Entry committed at v1; the *included* schema narrowed in the working
tree; `breaking --against git#HEAD entry.aon` → `verdict: compatible`,
exit 0. A discriminating probe proves old = old-entry-text +
new-includes (a conflict that exists in no committed version). The
file-path `--against old/entry.aon` spelling is sound — the git
spelling alone silently un-gates every non-entry file, on the
multi-file layout every real model uses, in the exact form
`docs/how-to.md` recommends for CI. Repro:
`breaking-git-tree-includes.sh` (self-building fixture).

Status: FIXED 2026-08-26 — a `git#<rev>` spelling now materialises the
revision's includable sources into a temporary tree and evaluates the
old document from there, so a narrowing inside an included file reports
`breaking` (exit 1) while an unchanged tree still reports `compatible`.
Both ports; pinned by `ts/test/cli.test.ts`
`breaking-git-compares-the-old-tree` and `go/cmd/aontu/subsume_test.go`
`TestBreakingGitComparesTheOldTree`, each asserting the unchanged-tree
control too, so a fix that merely reported breaking would fail. A file
absent from the revision is now refused by name.

Correction 2026-08-27: the first cut of that fix computed the
repo-relative path by relativising `git rev-parse --show-toplevel`
against the caller's resolved path, which subtracts two different
coordinate systems -- git prints the real path, the caller's is
whatever they typed. On macOS a temp file under `/var` is
`/private/var` to git and on Windows a `TMP` short name is the long
form, so the verb exited 2 on both platforms while passing on Linux.
The path now comes from git itself (`rev-parse --show-prefix`), and
both tests gained a leg that reaches the entry through a SYMLINK, so
the case runs on every platform.

### 27. Module-internal references break under nested import, naming a phantom path [major]
A module that evaluates and hashes standalone fails when imported at a
nested key (`no_path` at `$.mod.spec.port` — a path existing in
neither document; the phantom first segment is the *last top-level key
of the module's own `mod.aon`*, leaked from metadata evaluation). The
`$`-re-rooting itself matches include semantics, but it contradicts the
module identity model: the same reference resolves during the
standalone canon-hash evaluation that defines the module's pinned
meaning. Repro: `phantom-mod-path/`.

---

## evolution-gate — the compatibility check on its own idioms

### 28. Constraint residue inside a spread template answers sub_unresolved against itself [major]
`{&:{port: integer & min(0)}}` is not self-subsumable
(`sub_unresolved`, expected == actual byte-identical), though the same
expression at a plain key subsumes itself and the documented rules
table licenses no such refusal. Plain constant templates *are*
reflexive; path-dependent templates (`key()`, references) answering
`undecided` is documented design. Consequence: `breaking` on contracts
written in the documented close-per-entry idiom hard-fails reflexivity
and must run `--allow-undecided`, which then masks genuine undecideds.
Repro: `spread-residue-self-undecided.aon`.


Status: FIXED 2026-08-27 — REFLEXIVITY IS A LAW of the subsumption
walk, not a rule the ladder gets to skip. Every value admits itself,
residue included: the set admitted by `integer & min(0)` is exactly the
set admitted by `integer & min(0)`. The check sits on the
`sub_unresolved` branch, where the answer would otherwise be undecided,
so the hot path is untouched, and identity is the HASH FORM rather than
the canon — canon drops closedness and the marks, so `close({a:1})` and
`{a:1}` share a canon while admitting different sets. Contracts written
in the documented close-per-entry idiom now pass their own gate without
`--allow-undecided`, which means the flag is back to meaning what it
says. Both ports; pinned by `subsume.tsv` self-spread-residue and
self-spread-residue-closed, and by use case 07's self-compare check.
### 29. `--profile gen` is not reflexive on the documented policy idiom [major]
`aontu_policy: hide({compat: *backward | forward | full | none})` — the
verbatim idiom from `reference-api.md` — fails self-subsumption under
`--profile gen` (`sub_disjunct_distribution`; the specific side's
hidden pref-disjunction collapses to its effective default). Trigger:
`hide()` around a preference-bearing disjunction. Repro:
`gen-hide-pref-self-undecided.aon`.


Status: FIXED 2026-08-27 — two causes, both ADR-004 leftovers. (a) The
walk compared a pref MEMBER of a disjunction by its KIND superior, the
pre-gate reading: under ADR-004 a preferred branch contributes exactly
its own value to the admitted set, so `*backward` admits `"backward"`
and not every string. Every member of the specific side widened to
`string`, which no general member admits, and the walk answered the
distribution case. (b) The `gen` profile's mark rule fired inside a
DISTRIBUTION TRIAL — comparing a whole marked disjunction against a
member extracted out of one, which are not corresponding nodes of the
two documents. A trial asks about admitted sets; the marks question
belongs to the correspondence walk, where the enclosing node's marks
are already compared. Both ports; pinned by `subsume.tsv`
self-hide-pref-disjunct, self-policy-idiom, and hide-added-still-refused
(the control: a mark that really did change is still refused).

(a) also sharpened two existing rows from `undecided` to
`does_not_subsume`: with a pref member admitting its own value, the
counterexample is CONCRETE and the walk can name it instead of
shrugging — see subsume.tsv default-indeterminate-general and
default-rank-mixed, both re-probed.
### 30. The judged document waives its own gate [major, by design]
`breaking` reads `$.aontu_policy.compat` from the **new** side, so a PR
that pins `compat: "none"` waives the gate judging it — documented, and
the text report gives no hint nothing was checked (only `--format
json`'s `"mode":"none"` shows it). CI must pin `--mode`. Repro pair:
`policy-waiver-*.aon` (header cites the design).

(Also verified: concrete version strings self-break the gate and
`breaking` has no `--at` — by design per subsumption's own rules; the
module boundary (`mod.aon`'s `version:`) is the documented safe home.
**`breaking --at <path>` landed 2026-08-27**, the same anchor `subsume`
has taken since G3: a module's top level carries exactly the things
that are supposed to change between releases, so anchoring at the
contract is the fix and splitting the file was the workaround. Findings
are reported from the anchor. §30's waiver stands as designed.)

---

## modules-dist — distribution before the network verbs

### 31. Transitive dependencies do not survive vendoring, and tidy pins `nil` [critical]
Consumer vendors module A (which imports module B): evaluation fails
with `module not fetched` **even when B is vendored flat beside A** —
the nested import resolves against A's own root, while `mod vendor`
only ever produces the flat layout. Worse: `tidy` locks a pin for A
that is the canon-hash of `nil` — two entirely different broken
modules lock the *identical* pin (`canonHash(nil)`), silently violating
the "breaks on any semantic change in the transitive closure" contract;
`aontu hash` refuses the same file. Repro: `transitive-vendor/`.

**Status: FIXED 2026-08-27, both halves.** (a) *The store belongs to
the project, not to the file that names it.* A vendored module carries
its own `mod.aon`, and that stopped the upward walk — so an import
made from inside `aon_vendor/…/service@1/` looked for a store under
`service@1/`, found none, and refused, while the module it wanted sat
flat beside it. Resolution now collects **every** enclosing `mod.aon`
root (`projectRoots` in `ts/src/mod.ts`, `go/mod.go`) and tries each
one's `aon_vendor/` and lockfile in turn, nearest first, so the flat
tree `mod vendor` writes is the tree a nested import reads. The old
workaround — nesting a second `aon_vendor/` inside the dependency —
could never have travelled anyway, because `mod manifest` strips
`aon_vendor/` from the published layer. (b) *A pin that cannot be
computed is not written.* `tidy` refuses a module that does not
evaluate on its own (verdict `error`, exit 4, lockfile untouched) with
the message `aontu hash` already gave the same file — "does not
evaluate on its own; nothing to pin" — instead of locking
`canonHash(nil)`, so the pin can no longer be a hash of nothing shared
by every broken module. Both ports; pinned by
`TestModTransitiveVendorResolves` and
`TestModTidyRefusesAnUnevaluableModule` (and their TypeScript twins),
and the `mod-nested-has-its-own-root` spec row now records the nested
root as resolving.

### 32. `tidy` re-pins tampered store content; no verify-without-rewrite verb [major]
Tamper a vendored module → eval correctly refuses with the integrity
error → run `mod tidy` → lockfile silently rewritten to the tampered
hash, `verdict: ok`, and eval now passes emitting the tampered value.
The recompute-always semantics is documented; the operational hole is
the absence of any `mod verify` — a CI job that tidies before
evaluating has no integrity protection. Repro: `tidy-repin/`.

**Status: FIXED 2026-08-27 — `aontu mod verify <root>`.** Recomputing
the pin is `tidy`'s job and stays as documented; the missing piece was
a verb that *reads* the lockfile rather than writing it. `verify`
recomputes every pin from the store, compares it against the committed
lock, writes nothing, and exits 1 on any disagreement naming both
hashes: `<mod>: pinned <want> but the store means <got>`. A module that
does not evaluate reports "nothing (it does not evaluate)" rather than
a hash, so an unevaluable module cannot read as agreement. Neither can
an empty lockfile: the gate walks what is *locked*, so a project whose
lockfile was never committed — or whose lockfile predates a dependency
someone added — would otherwise verify clean over nothing at all, which
is this same defect one step earlier. Every dependency the project
declares must be in the lockfile before the pins mean anything;
`verdict: unlocked` says so and names `mod tidy` as the repair rather
than a fetch. That is the verb a CI job runs before it evaluates. Both
ports; pinned by `TestModVerify`,
`TestModVerifyRefusesAnUncoveredProject`,
`TestModVerifyReportsWhatNoStoreHolds` and `TestModVerifyCommand` (and
their TypeScript twins).

(Also confirmed, by design: the content-addressed cache is unreachable
until a pin exists, and with `mod get` absent, hand-vendoring is the
only cold start. Its directory layout — documented nowhere when this
was written — is now `docs/reference-api.md`, "Vendor a module by
hand", with the flat-tree rule and the `verify` step.)

---

## pack-refs — expressions inside generator and spread templates

The family's cross-cutting mechanism — **a relative reference or hole
re-anchored per clone only when it stood as a whole value or a meet
operand; nested inside a `+` expression or a call argument it resolved
at the template's own location** (visible as the `NaN` path segment in
diagnostics) — is **FIXED 2026-08-26** (template-clone isolation,
ADR-005): a per-destination instance has every inner path normalised
to the destination, so 33, 34, 35a and 35b are closed. §36 and the
generator-over-spread-augmented-data failure below are closed by the
spread application rework (ADR-006), which finishes the family.

**Pack over spread-augmented data** (claim C4, use-case 06 gap 6;
repro `spread-then-pack.aon`): **FIXED 2026-08-26 (ADR-006).** A
generator's data argument snapshots its source only once the source
has SETTLED in the tree (the `argsnap` flag in
driveStagedArgs/stagedDrive, honoured by RefVal.find), so a
spread-injected relative reference resolves at the source child before
the copy is taken — copied earlier it dangled under the generator
(rebased where no root traversal reaches) and the model died as
`mapval_no_gen` with the generator never firing. `each()` over the
same source works identically. Pinned in both engines: `gen-pack.tsv`
pack-over-spread-augmented, `gen-each.tsv` each-over-spread-augmented;
the same rule flipped the unfired-generator canon rows (the data
argument now canons as the still-standing reference — see the notes on
each-unfired-*/pack-unfired-canon).

### 33. Relative references in template *expressions* do not re-anchor [major]
**Status: FIXED 2026-08-26 (template-clone isolation, ADR-005).**
`b: .a + 1` and `b: upper(.a)` inside a pack template now answer for
the child exactly as the bare `b: .a` always did. Pinned in both
engines: `gen-pack.tsv` pack-rel-ref-in-expr, pack-key-in-expr-and-call.
Repro: `rel-ref-in-expr.aon`.

### 34. Nested pack: the inner template's `_` binds to the outer source child [critical]
**Status: FIXED 2026-08-26 (template-clone isolation, ADR-005).**
A hole belongs to its nearest enclosing generator: the outer pack's
fill pass no longer descends into the inner pack's template argument,
so the inner `_` binds the inner generator's source child
(`deploy.dev.services.web.v = {"replicas":1}`). Pinned in both
engines: `place.tsv` place-nested-pack-inner-binding,
place-nested-pack-inner-meet, place-hole-as-inner-data.
Repro: `nested-pack-hole.aon`.

### 35. Sibling refs in expressions; hide() swallowing a failure into silent loss [critical]
**Status: FIXED 2026-08-26 (template-clone isolation, ADR-005), both
halves.** (a) The in-expression sibling reference in a spread template
(`&: {md: "|" + .side_effect}`) now answers per child — pinned by
`spread.tsv` spread-expr-sibling-ref. Repro: `spread-expr-sibling.aon`.
(b) The copy()'d reference to a computed hide()-marked field of a
pack-generated child now defers until the wrapper has resolved and
yields the computed value (`docs = ["|readonly"]`, the pack-free
spelling's outcome — better than the minimum surface-the-failure bar)
— pinned by `marks.tsv` hide-computed-pack-copy.
Repro: `hide-computed-drop.aon`.

### 36. An expression reading the generated child's own fields cannot be merged onto it [major]
**Status: FIXED 2026-08-26 (the spread application rework, ADR-006) —
it works: surge is 3.** An operator arriving as a peer-only key is
CARRIED, never wrapped as an expectation (handleExpectedVal / the
pcIsOp guard in go/mapval.go): a wrapped op froze — an expectation only
advances when a peer arrives — and the residue then blamed a spread
that existed nowhere (`mapval_spread_required … Cannot unify value:
$.deploy.web.replicas+1 with value: nil`). The carried op keeps
computing and resolves against the generated child once the pack has
fired. The failure was never pack-specific: `a:{x:1} a:{y:.x+1}` died
identically and is fixed by the same rule; an op that can NEVER
resolve is an honest error naming the real path. Pinned in both
engines: `gen-pack.tsv` pack-merge-expr-onto-child, `plus.tsv`
peer-key-expr, peer-key-expr-unresolvable.
Repro: `merge-expr-onto-pack-child.aon`.
(By design, not a bug: `each()`'s template is a *meet*, so scalars
cannot be reshaped into maps, and `key()` at a list element is the
index — the doc's `pack` spelling covers the transform case.)

---

## defaults — the enum-with-default written the other way round

### 38. A preference conjoined with a disjunction is silently dropped [critical]
`("1.0"|"1.1") & *"1.0"` — the enum-with-default spelled as a conjunct
rather than as `*"1.0"|"1.1"` — carried **no default at all**.
Distribution takes the preference to each member, and the kind gate
then replaces a scalar preference *by* the concrete member it met, so
nothing preferred survived: canon read `"1.0"|"1.1"`, the two spellings
of the same idiom disagreed, and two contracts differing only in their
default hashed identically (use case 07's `probes/default-a.aon` vs
`default-b.aon`). Generation's old member fold hid all of it by folding
the alternatives together.

Status: FIXED 2026-08-27 (ADR-007) — `(A|B) & *A` is now `*A|B`: after
distribution, a surviving member equal to the preferred value is
wrapped back as a preference of the peer's rank. `default-a.aon`
generates `"1.0"`, canon keeps the `*`, and the two probes hash
differently. A preference naming no alternative is still dropped — it
has nothing to prefer, and the default-validity lint is what reports
that shape. Both ports; pinned by six `pref.tsv` rows
(pref-conjunct-distributes-* and pref-conjunct-names-nothing-*),
including one asserting the two spellings canon identically.

## trust — surfaces that ignored the include capability

### 37. Verbs, the REPL and LSP hover all ran the unconfined resolver [critical]
`--trust`/`--include-root` were wired to `aontu <file>` alone. Every
verb — `vet`, `subsume`, `breaking`, `get`, `why`, `set`, `relations`,
`trim`, `hash`, `agentsmd` — parsed its own argument tail and ran the
full system resolver with no way to confine it, which is the surface an
agent actually scripts. The REPL *accepted* `--trust` and dropped it, so
the `--jsonl` session mode built to be driven by a harness evaluated
unconfined however it was invoked. And the LSP confined the diagnostics
it published while leaving hover on the system resolver, so a
workspace-confined editor session resolved an escaping include the
moment a cursor rested on it. One document under two postures is not a
confinement.

Status: FIXED 2026-08-26 — the flags are stripped before each verb
parses its tail and turned into the engine's capability, in both ports;
the REPL threads a session capability through `:load`, `:get`, `:why`
and bare snippets; and the LSP's hover and hover-provenance run under
the same capability as its diagnostics (`HoverTrust` in Go, the `trust`
argument to `computeHover` in TypeScript). Two parity holes surfaced and
closed with it: Go's `PatchOptions.Trust` was declared but never reached
the `Vet` call underneath `set`, and `breaking` read its own
`$.aontu_policy.compat` declaration through an unconfined evaluation in
both ports — confining the comparison but not the question. Pinned by
`every-verb-honours-the-capability`, `verbs-take-include-root`,
`repl-honours-the-capability` and `workspace-root-confines-hover` in
`ts/test/trust.test.ts`, with Go twins in `go/cmd/aontu/trust_test.go`
and `go/lsp/lsp_test.go`. Each verb is asserted twice — the escape
resolves under the default and is denied under `--trust none` — so a
verb that quietly dropped the flag again would fail; the hover tests
probe every column of the line and carry an unconfined control, so they
assert the capability rather than hover failing everywhere.

---

## arithmetic — a non-finite result with no code, and no way to say it

### 39. A float sum that overflows escapes as an internal error, differently in each port [major]
`1.0e308 + 1.0e308` is not a value Aontu can carry — the language is a
JSON superset with no notation for an infinity, and no JSON a generator
could emit for one. Neither port said so. TypeScript crashed with
`[aontu/internal]` ("Internal error during unification"), which is the
engine reporting a bug in itself; Go leaked its marshaller's raw
`json: unsupported value: +Inf`, with no `[aontu/…]` banner, no site,
and no line of source — the one shape a harness grepping `\[aontu/`
cannot see at all. A CLI test in the Go port even *pinned* the
marshaller error as expected behaviour.

**Status: FIXED 2026-08-27, with the arithmetic family.** A non-finite
binary64 result is now `float_overflow`, located at the operation, in
both ports — the number model's own rule (docs/design/number-model.md,
rule 4: "an infinite or NaN result is a located error, not a value")
applied where it was reachable. `PlusOpVal.operate` and its Go twin go
through the same check the six new arithmetic functions do
(`ts/src/val/arith.ts`, `go/arith.go`). The Go CLI test that pinned the
old behaviour now asserts the new one, and `render`'s encode-error
branch is marked unreachable with its reason: with the engine refusing
every non-finite float, no generated value reaches the encoder that it
cannot encode. Pinned by `arith-plus-float-overflow` and
`arith-float-overflow` in `test/spec/arith.tsv`.

### 40. The published grammar cannot parse a relative reference [minor]
`grammar/aontu.lark` and `grammar/aontu.gbnf` — the grammars shipped
for LLM-constrained generation — had a production for an ABSOLUTE
reference (`$.a.b`) and none at all for a RELATIVE one (`.a`). Canon
emits a relative reference wherever a spread template survives
unresolved (`{&:{v:add(.n,1)}}` canons with the `.n` intact), so the
engine could print output its own published grammar refuses. A model
generating under the gbnf could not write the sibling reference the
language's own examples use.

**Status: FIXED 2026-08-27.** Both grammars gained
`ref: ("." segment)+` beside the `$` form. There is no ambiguity with
a numeric literal, which always starts with a digit or `-`. Found by
the repository's own `every-canon-output-parses-under-the-published-grammar`
test the moment a canon row emitted one — which is exactly what that
test is for, and why the row (`arith-in-spread-template`) is worth
having beyond the behaviour it pins.

## diagnostics — a finding that named the record instead of the field

### 41. Every conflict inside a referenced record reported the record's path [major]
A schema that names its record types once and applies them by
reference — the shape use case 10's `domain.aon` is built on, and the
first thing anyone writing a reusable model does — reported every
conflict inside such a record at the RECORD's path rather than the
key's:

```
$ aontu vet two.aon two.json          # M: close({a:"x", b:"p"})  q: $.M
$.q: scalar_value [conflict]   ... data "y", schema "x"
$.q: scalar_value [conflict]   ... data "r", schema "p"
```

Two different fields, one path, printed twice. The sites were right and
the paths were not, so a repair loop reading `path` — the field the
report exists to give it — was told to rewrite the whole record, twice,
instead of the two keys that clash. The two ports disagreed as well
(Go named the key, TypeScript the record), which is an ADR-001
divergence in the user-facing half of the report.

The cause is the same in both ports and older than the reference case.
A `NilVal` took its path from the OPERAND it blames, which decides the
SITE correctly and the path only by accident: a value that arrives by
reference is re-pathed to the referring field (TypeScript re-pathed the
children there too, rather than rebasing them under it), and a MINTED
operand — a preference's yardstick, an arithmetic or concat result —
carries no path at all, so `a:*1` against `a:{}` reported `$`, the whole
document, in BOTH ports.

**Status: FIXED 2026-08-27, with one case left open.** The path is now
taken from the location the meet is being driven at — TypeScript's
`ctx.path`, Go's `ctx.slot`, which are the same thing — and only when
that EXTENDS the operand's own path, so a nil minted away from the
descent keeps what its operand carries. Taking the context path
unconditionally was tried and reverted: it moves every closed-key,
spread-template and `--at` finding to the driving location, which is
not where those belong.

Found while probing the money wire convention (finding I), by running
both engines on the same document and diffing, which is what that probe
is for. Pinned by `vet-ref-clone-names-the-key-not-the-record` and
`vet-type-alias-names-the-key-not-the-record` in `test/spec/vet.tsv`;
three existing rows (`vet-pref-yardstick`,
`vet-minted-arith-operand-unsited`, `vet-minted-concat-operand-unsited`)
moved from `$` to `$.a` and are the minted-operand half of the same
defect.

**Still open**: a reference whose target sits DEEPER than the referring
field (`quote: $.schema.M`, where `$.schema.M` is two segments and
`quote` is one) leaves exactly one stale segment in TypeScript —
`$.quote.M.a`. The extension rule above cannot reach it, because that
path is not a prefix of the driving one, it is simply wrong. The cause
is the clone-path difference `ts/src/val/RefVal.ts` already documents
in `detectRefCycle`: Go re-paths a resolved clone to the referring
site, TypeScript overlays. Rebasing with the existing `repathInstance`
walk is NOT the same operation — it moves relative references with it,
so `match(.side_effect, …)` in `use-cases/09-agent-tools/registry.aon`
dies `no_path` — so the real fix is a TypeScript twin of Go's
`cloneAt`/`overlayPath`, a clone that takes a destination path. Recorded
in `test/spec/divergent.tsv`; at equal depth both ports agree, which is
why `use-cases/10-data-model/money-wire.aon` declares its types at the
top level.

### 44. A list's `&:` element spread shifts every later index in the TypeScript port's error paths [major]
**Status: FIXED 2026-08-28 (the `elem` rule's path-index rewind).**
Broader than reported: a plain `k:v` pair in list position stole an
index too, so `[x:1,10,20]` had the same shift. Root cause was neither
port's evaluator but `@tabnas/path`'s `@elem-ao`, which increments its
element index for **every** `elem` rule the grammar enters — and three
of aontu's four `elem` alternatives contribute no element. The array
slot they occupy was already given back (`restorePairSlot`); the path
index was not. The `elem` rule now rewinds it and re-paths the child,
the exact twin of the correction the `pair` rule already carried for
map spreads. Pinned by `test/spec/spread-list.tsv`
`spread-list-elem-path*`, `spread-list-pair-path` and the three
`spread-list-gen-*` rows, every expectation probed through both engines.
Verified by reverting the fix: exactly four of the new rows fail, and
`spread-list-elem-path-code` is **not** one of them — the code-only row
passes in the broken engine, which is the finding below, demonstrated
inside the suite.

The same defect as §41 — a right site under a wrong path — in the one
container §41's fix did not reach. A `&:` element spread occupies an
index slot in TypeScript's error paths and not in Go's, so every
element written after the spread is reported one index too high:

```
$ cat l.aon                                   # l: [&: integer, 10, 20, "bad"]
$ node ts/bin/aontu.js l.aon
[aontu/no_scalar_unify]: Cannot unify values at path $.l.3
$ go/aontu l.aon
[aontu/no_scalar_unify]: Cannot unify values at path $.l.2
```

Go is right, and the TypeScript port's own verbs prove it rather than
the Go port doing so. On the passing form `l: [&: integer, 10, 20, 30]`
both ports generate `{"l":[10,20,30]}` and both answer `aontu get $.l.2`
with `30` — the spread is not an element anywhere except in one port's
error paths. So TypeScript **contradicts itself**, and the contradiction
is on the machine surface:

```
$ node ts/bin/aontu.js vet l.aon l.aon --format json | jq -r '.findings[0].path'
$.l.3
$ node ts/bin/aontu.js get '$.l.3' l.aon
$.l.3: no_path [reference]          # the port rejects the path it just emitted
$ node ts/bin/aontu.js get '$.l.2' l.aon
30
```

An agent doing the loop G7 exists to serve — read `.findings[].path`,
`get` it, patch it — is handed a path that resolves to nothing. On a
one-element list it points off the end entirely: `l: [&: integer, "bad"]`
reports `$.l.1`.

Two things bound it. Elements written **before** the spread are
unaffected (`l: ["bad", &: integer]` is `$.l.0` in both ports), and the
spread and the offending element must be in the **same list literal** —
when the failure arrives from a separate document, which is the ordinary
`vet` schema/data shape, both ports agree on `$.l.2`. That is why the
`vet.tsv` rows did not catch it.

Neither did anything else, and the reason is structural: of the shared
suite's **252 `err` rows only 20 include a `$.` path** in their
expectation, against 615 `errc` rows asserting the code alone (measured
at the commit before the §46–§48 fixes; an earlier version of this
paragraph said "7,679 and 15", and neither figure reproduces — the
corrected counts and their commands are in
`docs/capability-review/progress.md`). Both ports emit
`no_scalar_unify` here, so every gate the suite has agrees while the two
paths differ. **The suite pins error codes and message substrings; the
path — the field the machine surface hands to agents — is very nearly
unasserted.** Fixing this one index without also pinning paths leaves
the class open. §47 later added a second edge: an `err` row asserting a
path can be vacuous even when it is written, because the match is a
substring and a wrong path may EXTEND the right one.

Not entered in `test/spec/divergent.tsv`: that register is for
divergences which cannot be fixed from this repository, and this one can.

### 46. A `k:v` pair written before a `&:` spread makes the TypeScript port drop the spread [major]
**Status: FIXED 2026-08-28 (the `elem` rule's spread guard narrowed).**
Found while fixing §44 and **not caused by it** — TypeScript's output was
byte-identical to the published `aontu@0.53.0`.

```
# BEFORE THE FIX
$ echo 'a:[x:1,&:integer,"bad"]' | aontu        # TypeScript
{ "a": [ "bad" ] }                              # exit 0 — spread ignored
$ echo 'a:[x:1,&:integer,"bad"]' | go/aontu     # Go
[aontu/no_scalar_unify]: Cannot unify values at path $.a.0
```

Both ports now give Go's answer.

Go applies the element constraint and rejects; TypeScript silently does
not apply it at all. Order-dependent, which is the part that should not
be true of a commutative language: move the pair after the spread
(`a:[&:integer,x:1,"bad"]`) and both ports agree on `$.a.0`. Silent
wrong output on the canonical side, so **critical** by consequence; kept
at major only because reaching it needs a pair and a spread in one list
literal.

The cause was one over-broad test. The `elem` rule marks all four of its
alternatives `spread: true` — that flag is what says "contributes no
element" — and the SPREAD collector took every one of them, so a `k:v`
pair in list position was collected as though it were a `&:` spread.
`ListVal`'s `'&' === spread.o` test then rejected the resulting entry
and the real constraint went with it. `pair` distinguishes the two, and
the collector now asks for `spread && !pair`.

Pinned by `test/spec/spread-list.tsv`
(`spread-list-pair-before-spread…`), including the accepting case and
the reversed order, so the two orders cannot drift apart again.
Reverting the fix fails exactly the four pair-before rows and leaves the
pair-after control passing. Repro:
[`repros/diagnostics/pair-before-spread-dropped.aon`](repros/diagnostics/pair-before-spread-dropped.aon).

### 47. A conjunct of unequal-length lists paths its finding differently in each port [minor]
**Status: FIXED 2026-08-28 (the container slot restored before the
refusal), and a second, unreported instance fixed with it.**
Also found while fixing §44, also predating it.

```
# BEFORE THE FIX
$ echo 'a:[x:1,10,"bad"]&{a:[integer,integer,integer]}' | aontu
[aontu/list]: Cannot unify values at path $.a          # TypeScript
[aontu/list]: Cannot unify values at path $.a.1        # Go
```

Both ports now give TypeScript's answer.

Same code, same verdict, different path — the §41/§44 shape again
(right refusal, wrong label) in a third container. Go named the element,
TypeScript the list. Minor because the refusal itself is correct in both
ports and the code is identical, so only a caller navigating by path was
misled.

TypeScript was right: when a list meets a peer that is not a list, no
element is party to the failure. `ListVal.Unify` drives its element loop
through `ctx.slot` and only the in-branch paths restored it, so a stale
element slot survived into the not-a-list branch and `makeNilErr`'s
slot-extension stamped it. One line — restore the container's own slot
before the refusal.

**`MapVal` had the identical bug, and it had not been reported.** It was
found by looking for it once the list cause was understood: same shape,
same one-line cause, same fix. `a:{p:1,q:2,r:3} a:"str"` named a key
that is not party to the failure. Both are pinned by
`test/spec/container-path.tsv`.

**Those rows had to be `vet` rows, and the reason is a hole in the
suite's own instrument.** An `err` row matches its expectation as a
SUBSTRING, and a container's path is a PREFIX of every member path
beneath it: `at path $.a` is contained in `at path $.a.2`, so an `err`
row asserting the container passes against the very answer it was
written to forbid. The rest of the message is byte-identical between the
two, so no other substring discriminates. A `vet` row compares the
finding object field by field, where `path` is matched exactly.
Reverting the fix fails exactly the three `vet` rows while all four
`errc` rows keep passing — the §44 lesson (a code-only row is blind to
a path defect) with a second edge on it: an `err` row can be blind too,
whenever the wrong path extends the right one. Repros:
[`repros/diagnostics/container-conflict-member-path.aon`](repros/diagnostics/container-conflict-member-path.aon)
and its `-map` companion.

### 48. A composed constraint lost the atom added at the point of use [critical]
**Status: FIXED 2026-08-28 (an expectation carries the meet as its peg).**
**Regraded from minor.** Filed as a message difference; it was a canon
soundness defect in BOTH ports, and the message was the symptom that
led to it. Critical by this file's own ladder: `aontu -c` and
`aontu hash` emitted **silent wrong output** — a document admitting
values the source rejects. Repro:
[`repros/constraint-compose/composed-alias-atom-dropped.aon`](repros/constraint-compose/composed-alias-atom-dropped.aon).

Found while verifying the named-constraint-alias idiom for
`docs/reference-language.md`, then re-probed after the first assessment
proved too narrow.

```
# BEFORE THE FIX
$ echo 'type:type({}) type:{u8:integer&min(0)&max(255)} a:$.type.u8&max(15) a:20' | aontu
Cannot unify value: 20 with value: integer&min(0)&max(15)    # TypeScript
Cannot unify value: 20 with value: max(15)                   # Go
```

The original entry recorded that difference, judged TypeScript correct,
and called the cost low because "the code, the path and the accept/reject
decision all agree; only the `expected` half of the finding differs".
The verdict on TypeScript was right. The **cost was wrong**, and so was
the family: this is not another §41/§44/§47 right-verdict-wrong-label
case. Two further probes settled it.

**First: the residual named was not stable even within one port.** Go
answered `max(15)` for `a:20` but `integer&min(0)&max(255)` for `a:1.5`
and `a:-3` — it named whichever conjunct happened to reject, and for the
float that meant reporting a ceiling of 255 where the value had to
satisfy 15. Not a partial explanation; a wrong one.

**Second, and the reason for the regrade: the canon dropped the atom.**

```
# BEFORE THE FIX
$ echo 'type:type({}) type:{u8:integer&min(0)&max(255)} a:$.type.u8&max(15)' | aontu -c
{"a":integer&min(0)&max(15),…}     # TypeScript
{"a":integer&min(0)&max(255),…}    # Go — max(15) gone
```

Re-parsing Go's own canon admits `20`, which the source rejects. **Canon
did not round-trip meaning**, and the two ports produced different
`aon1-` hashes for one document — a parity break at the trust layer,
where the hash is the thing that pins meaning. `subsume`, `breaking` and
`diff` all read that canon.

And it was **not only Go**. Under plain layering both ports dropped it:

```
# BEFORE THE FIX
$ echo 'b:{z:1} b:{u8:min(0)} a:$.b.u8&max(15)' | aontu -c
{"a":min(0),…}                     # BOTH ports — max(15) gone
```

Both ports now answer `{"a":min(0)&max(15),…}`, and the two `aon1-`
hashes agree.

The evaluator enforced `max(15)` in every one of these; only the
recorded value did not carry it. A canon that silently drops an enforced
constraint is the defect the `ExpectVal.canon` comment already warned
about twice, in its own words — "a canon that silently drops a
constraint is worse than one that fails to parse" — reached a third way.

**Cause.** When the referent is completed by a *later* statement the
reference resolves a pass late, so the atom conjoined at the point of
use arrives as a **peer** of an `ExpectVal`. `ExpectVal.unify` computed
the meet, saw it was still not generable, and rebuilt the surviving node
from the **original** `peg`, keeping the meet only in `peer`. `canon`
renders `peg`. Every later copy — the bag's expect re-wrap, `Val.clone`
— rebuilt from `peg` too, so the atom was dropped again at each one.

**Fix.** The meet becomes the new `peg`: an expectation that has met a
peer without being freed by it stands for `peg & peer` from then on.
That is what a later peer must satisfy and what canon has to state, and
it needs no new field and no carrying, because every copy site already
preserves `peg`. Purity is untouched — the node is new, so a shared
template keeps the peg it was written with (§6–§7). With the meet in
`peg`, the incoming peer is met against the whole expectation rather
than against the accumulated `peer` first, which is what had reduced the
message to a single atom.

Both halves are pinned in `test/spec/constraint-alias.tsv`: the refusal
names `integer&min(0)&max(15)` whichever atom the value offends, and the
canon rows hold both engines to what the evaluator enforces. The
unlayered forms are pinned alongside as controls.

Reverting the fix separates the two ports exactly as the diagnosis
predicts: **Go fails seven rows, TypeScript two.** The two TypeScript
failures are the plain-layered pair — the half both ports got wrong —
and the five Go-only failures are the `type()`-marked forms TypeScript
already handled. That split is the evidence for the regrade: a
TypeScript-only defect would have been a parity difference, and a
Go-only one would have been the minor entry as filed.

**Enforcement was never affected**, which is why this survived: every
accepting case agreed byte-for-byte across both ports and every
violating case refused in both, before the fix as after. The composition
was sound in both engines throughout. What was wrong was the value they
wrote down for it.

## relations — a graph one port can only partly see

### 42. Go's derived graph loses most of its edges on a two-view model [critical]
`aontu relations` is the verb an operator trusts to say "this estate
has no dependency cycle". On use case 01 — eight services described by
a catalog view and a deployment view, joined by `id()` — the two ports
do not see the same graph:

| | entities | edges | distinct from/key/to |
|---|---|---|---|
| TypeScript | 8 | 40 | 19 |
| Go | 8 | 6 | 2 |

The consequence is the one that matters: `aontu relations
bad/cycle.aon` reports `cycle svc_payments -> svc_ledger ->
svc_payments` in TypeScript and **reports no cycle at all** in Go. It
also reports inverse-missing findings for inverses it simply cannot
see. A verdict of `pass` from the port that cannot see the edges is
worse than no verdict.

**BOTH VIEWS ARE NEEDED to trigger it.** With `deploy: {}` the two
ports agree exactly (21 edges each); with one catalog domain and the
full deployment view they differ by four. So the trigger is the
id-merge across two trees, not the include, the spread, or the
vocabulary — each of which agrees on its own, and every synthetic
reduction tried (two views plus a spread, two views plus an include, an
entity in one view pointing at one in two) agrees in both ports.

**Status: OPEN**, recorded in `test/spec/divergent.tsv`. Not introduced
by the review's finding J — the pre-change Go binary loses the same
edges. It went unnoticed because `use-cases/run-all.sh` drives the
TypeScript CLI, and nothing had run a use case through the Go one.
`use-cases/01-service-catalog/check.sh` asserts the cycle, so the Go
CLI fails that check today rather than passing it quietly; that is the
honest state and how a fix will be noticed. The fix is engine work: how
each port's identity merge places a link-stamped value at an entity's
other positions.

## verbs — a refusal that arrived as a stack trace

### 43. A nil root with no collected error crashed four verbs, in both ports [critical]
`&: id(root)` is a refusal — an `id()` in a bag spread has no single
entry to name — and the refusal IS THE ROOT: the evaluation answers a
nil, and collects nothing beside it. Every verb that reports "this
document does not stand up" then read the context's first error, which
was not there:

```
$ aontu relations doc.aon
/…/ts/dist/vet.js:182
    if (null == nil.msg || '' === nil.msg) {
                    ^
$ aontu-go relations doc.aon
panic: runtime error: index out of range [0] with length 0
```

`relations`, `reaches`, `jsonschema` and `trim` all did it, in both
ports — a TypeError in TypeScript, a panic in Go. It is the one shape
where the review's own finding F, that a document which does not stand
up SAYS SO in the finding shape, was answered with a stack trace. Worse
than a wrong answer: a harness grepping `[aontu/` sees nothing at all,
and an exit code that means "the tool broke" rather than "your document
is wrong".

`failureFinding`'s own comment asserted the state was impossible — "ctx
.err is never empty at a call site: every caller has already
established that the document failed, and it can only fail by
collecting an error". The second half is what is untrue: it can fail by
BEING a nil.

**Status: FIXED 2026-08-27.** `failureFinding` takes the failing root
as its last argument and builds the finding from it when the context
carries nothing; every caller already had it, since each one's
condition is `0 < ctx.err.length || root.isNil` and the second half is
exactly this case. All four verbs now report
`$: id_spread [parse]` and exit 4.

Found while closing the ADR-002 gate on the JSON Schema export: the
per-caller belt-and-braces guard was deleted as unreachable, which
turned a wrong-but-safe path into a crash and made the real defect
visible. Pinned by
`a-nil-root-with-no-collected-error-is-reported-not-thrown`
(ts/test/cli.test.ts) and its Go twin. The two ports still give this
nil a different PATH (`$` and `$.&`) — a pre-existing engine
disagreement that plain evaluation shows too, now recorded in
`test/spec/divergent.tsv`.

## constraint-syntax — the notation the constraint algebra did not claim

### 45. CUE-style constraint operators lex as bare strings [RETRACTED — not a defect]
**Status: RETRACTED 2026-08-28. This entry was wrong, and is kept
because the numbering is cited elsewhere.**

`>`, `<`, `=` and `!` are not reserved characters. A bare value
containing them is **undifferentiated text content**, for exactly the
reason `port: high` is the string `"high"` — the language never assigned
those characters a meaning, and
[ADR-008](../ADR.md#adr-008--constraints-are-named-not-spelled-with-operators)
settled that it never will. `port: >=1024` producing `">=1024"` is
therefore not a silent failure; it is the bare-string rule applying
uniformly.

**What the entry got wrong** is that it graded the behaviour against an
*intent* rather than against the language. Calling the output "a
well-formed wrong config" assumes the author meant a bound — but nothing
in the document says so, and an engine cannot read that. By the same
argument `timeout: fast` would be a critical defect, which nobody would
claim. The severity was inherited uncritically from
`AONTUCONSTRAINTS.0.md` §6, which wrote it when bounds did not exist in
any spelling and CUE's operators were the proposal on the table; once
ADR-008 declines that proposal, the premise is gone and the sentence
should not have outlived it.

There is consequently **nothing to fix and no repair outstanding**. The
earlier suggestion — refuse a bare string leading with `> < = !` — is
withdrawn: it would carve an arbitrary hole in the bare-string rule to
serve a guess about intent, and make `a: >x` an error while `a: ?x`
stayed fine.

What survives is a *documentation* point, not a defect: a reader arriving
from CUE may expect those characters to mean something, and the
reference should make the named atoms easy to find from where they would
look. `docs/reference-language.md` "Named constraint aliases" and
`docs/how-to.md` "Name a reusable constraint" are that surface.

`>10`, `>=10`, `<5`, `!=0` and `=~"^ab"` are all legal aontu — as
**strings**. A schema written in them parses, evaluates, validates
nothing and exits 0:

```
$ echo 'port: >=1024' | aontu
{
  "port": ">=1024"
}
$ echo $?
0
```

Identical in both ports. Bare strings are a documented scalar form
(`reference-language.md`: `bare string | a:hello | "hello"`), and a
leading `>` does not except a value from that rule.

`docs/design/AONTUCONSTRAINTS.0.md` §6 named this in its row 7 and
called it "worse than unsupported, since it produces a well-formed wrong
config". G1 then landed the constraint algebra under **function** syntax
— `min`, `max`, `above`, `below`, `neq`, `re` — which dissolved that
design's headline compatibility risk (§10 had budgeted a lexing break
for reusing `>`; nothing had to break, because nothing was reused). The
capability landed and the defect that motivated it was never in a
phase's scope. See the reconciliation in
[`docs/capability-review/g1-constraint-algebra.md`](../docs/capability-review/g1-constraint-algebra.md#reconciliation-with-the-2026-08-27-constraint-design-note).

The conjunct spelling does fail, but unhelpfully: `port: integer & >=1024`
raises `no_scalar_unify`, "Literal scalar values of different kinds
cannot unify" — which names neither the mistake nor `min(1024)`, the
atom that fixes it.

Why it matters more than an unfamiliar spelling would: the design note's
own framing is that CUE is the **only** widely used language sharing
aontu's commutative-unification core, which makes CUE notation the thing
a new user most plausibly arrives holding. `min(1024)` is not
discoverable from a document that silently accepted `>=1024`.

*(The original entry proposed refusing such bare strings. Withdrawn —
see the Status note above.)*

## includes — what an included file's EXTENSION decides

### 49. An include's extension decides the answer, and the two ports decide differently [FIXED 2026-08-30]

`@"file"` reads a file. What the engine did with the bytes depended on
the file's extension, and the two ports had different rules — so the
same document and the same file evaluated to different values. One
extension crashed TypeScript outright.

Probed with the identical file content `{"a":1,"b":{"c":2}}` under six
names, both ports:

| file | TypeScript (was) | Go (was) | both (now) |
|---|---|---|---|
| `v.aon` | the map | the map | the map |
| `v.json` | `Cannot convert object to primitive value` | the map | the map |
| `v.jsonld` | string | the map | the map |
| `v.txt` | string | the map | refused |
| `v.dat` | string | the map | refused |
| `vnoext` | string | the map | refused |

**THE RULING (ADR-012).** The extension decides, from a fixed table,
and it says which of two things the file is. `.aon` and `.aontu` are
Aontu source. `.json`, `.jsonld`, `.jsonc`, `.json5`, `.jsonic`,
`.jsc`, `.toml`, `.yaml`, `.yml` and `.ini` are configuration DATA,
read by that format's own parser — every one of them maps onto JSON.
Every other extension — and a name with no extension — is refused by
name with `include_extension`:

```
include not readable: notes.txt (extension: .txt)
```

Both ports run the same parsers, one per format, which is what lets
these rows be shared at all. `.csv` is deliberately absent: the two
ports' CSV parsers disagree about what a CSV file is, and ADR-001 does
not admit that.

JSON reads as data because it IS data. That is what unblocks
[`docs/design/ONTOLOGY.0.md`](../docs/design/ONTOLOGY.0.md) §3.1, which
named this a prerequisite of its phase P1: schema.org ships
`schemaorg-current-https.jsonld`, microformats2 parsers emit JSON, DCMI
publishes RDF serialisations.

**What each defect was.**

*(a) The parity break.* One line on each side. `ts/src/lang.ts`
registered `processor: {aontu, aon}` and let every other extension fall
through to multisource's default, which hands the file back as raw
TEXT; `go/source.go`'s `msOptions` also registered the empty kind `""`,
the fallback for an unrecognised extension, so Go parsed everything as
Aontu source. Either rule is defensible; having both is not, and
ADR-001 says so.

*(b) The crash.* `.json` is the one extension with an upstream default
processor, which returns a plain JS object where the aontu grammar
produces Vals — so the tree met a value it could not convert and raised
an unhandled internal error with no code, no path and no site: the §43
shape, invisible to a harness grepping `[aontu/`.

**Why it was graded critical.** It produced a well-formed WRONG
document: `schema: @"vocab.jsonld"` gave a map in Go and a string in
TypeScript, and both exited 0. A document pinning a vendored vocabulary
validated against the vocabulary in one port and against a 40 KB string
in the other.

**Two things the fix carried with it.** The refusal is RAISED in the
resolver, not injected by the processor: a bare-member include merges
into the enclosing map and a nil contributes no keys, so an injected
refusal would vanish and leave a plausible, silently-partial document —
the same reason `include_denied` is raised. And `.js` is no longer
includable in either port, which closes the `@"x.js"` code-execution
hazard `docs/trust.md`, the MCP server and three verbs each warned
about; the TypeScript package leg narrows with it, which closes a
divergence (Go has no package leg) rather than opening one.

Pinned by `test/spec/file.tsv`, the `load-ext-*` block: the two JSON
forms that parse, the extensions that refuse, the extension being
NAMED, four bare-member positions where a refusal must not vanish, and
the precedence of not-found over extension. `include_extension` joins
`test/spec/errcodes.tsv` (class `parse`, 0.54.0).

Repros: [`repros/includes/extension-decides-the-value.aon`](repros/includes/extension-decides-the-value.aon)
for (a) and
[`repros/includes/json-extension-crashes-ts.aon`](repros/includes/json-extension-crashes-ts.aon)
for (b), with the byte-identical `vocab.json` / `vocab.jsonld` pair
beside them.

A narrower form of this was recorded in [REVIEW.md](REVIEW.md) —
"`@"file.json"` includes yielding `{}` silently at top level and a raw
TypeError nested". This entry supersedes it: the top-level `{}` was one
symptom of the text reading, and the divergence covered every
extension, not only `.json`.

## key() — the enclosing key at a generated or referenced position

### 50. A spread template's `key()`, read through a reference four levels down, refuses in TypeScript and answers in Go [FIXED 2026-08-30]
Found by removing `.$KEY` (ADR-009): the only test covering this shape
used that spelling, which took the RefVal path and never reached the
divergence. Translating it to `key()` surfaced this immediately.

```
a: b: c: d: e: $.a.b.f
a: b: f: &: {n: key()}
a: b: f: {x: {}}
```

```
$ aontu-go repro.aon
{"a":{"b":{"c":{"d":{"e":{"x":{"n":"x"}}}},"f":{"x":{"n":"x"}}}}}

$ aontu repro.aon
[aontu/scalar_value]: Cannot unify values at path $.a.b.f.x.n.n
 Cannot unify value: "n" with value: "x"
```

**The path in the TypeScript refusal is the diagnosis.** `$.a.b.f.x.n.n`
has `n` twice: the spread template is being applied a second time
*inside* the field it already resolved. `n: key()` answers `"x"` at
`$.a.b.f.x.n`; the template then meets that string as though it were a
map, and the inner `n: key()` answers `"n"` — hence `"n"` against `"x"`.
Five levels gives `$.a.b.f.x.n.e.n`, the referring path's own tail
spliced in, which says the re-application is being driven by the
REFERENCE rather than by the spread.

**It is a depth threshold, not the shape.** The same document with the
destination three levels down agrees in both ports:

| destination | outcome |
|---|---|
| `a: b: e: $.a.b.f` | agree |
| `a: b: c: e: $.a.b.f` | agree |
| `a: b: c: d: e: $.a.b.f` | **Go answers, TypeScript refuses** |

A threshold at four is a fixpoint-pass artefact, not a rule anyone
wrote, which is the argument for calling it a defect rather than a
divergence to be documented.

Status: FIXED 2026-08-30 in TypeScript. **GO WAS RIGHT**, and the
evidence settles what the entry called unsettled: Go's four-level
answer is the agreed THREE-level answer with one more level of
nesting, character for character.

    3 levels, both ports  {"a":{"b":{"c":{"e":{"x":{"n":"x"}}},"f":{"x":{"n":"x"}}}}}
    4 levels, Go          {"a":{"b":{"c":{"d":{"e":{"x":{"n":"x"}}}},"f":{"x":{"n":"x"}}}}}

Go is consistent across the threshold; the refusal was the defect,
exactly as "a threshold at four is a fixpoint-pass artefact" argued.

**The cause is that the apply-once mark is by template IDENTITY, and
identity does not survive a clone.** The bag loops already keep a
template from being applied twice: `_spr` on a value records which
template has been merged into it (MapVal.unify, ListVal.unify). But
every Val takes a fresh `id` when it is constructed, and a reference
resolving to a templated bag clones the bag AND its template -- so the
fresh template matched no mark, and it was applied a SECOND time over
the value the first application had produced. `n: key()` had already
answered `"x"`; the template met that string as though it were a map
and the inner `key()` answered `"n"`, giving `"n"` against `"x"` at
`$.a.b.f.x.n.n`.

Carrying `_spr` through the clone is NOT enough on its own and was the
first thing tried: the id it holds is stale either way. A spread
template now takes a stable identity (`spreadId`, fixed once to the
template's own id) that clones carry, and the mark compares on that.

Pins: `test/spec/gen-key.tsv` -- `key-spread-through-ref-2` through
`-5`. The depth ladder IS the row set, because the threshold was the
defect. `ts/test/val-ref.test.ts` is back at the four levels it was
written with, having been shallowed to three while this stood.

Repro:
[`repros/key-func/spread-key-through-deep-ref.aon`](repros/key-func/spread-key-through-deep-ref.aon).

### 51. `key()` is late-bound and `.$KEY` was early-bound — a translation is not always value-preserving [by design, recorded]
Not a defect. Recorded because ADR-009 asks every `.$KEY` in an existing
document to be rewritten as `key()`, and in three shapes that rewrite
CHANGES THE VALUE — always from the wrong answer to the right one, but
a change:

```
a: { n: <the enclosing key>, x: 1 }
b: { c: $.a }
```

`.$KEY` gave `b.c.n == "a"` — the key where the reference was *written*.
`key()` gives `b.c.n == "c"` — the key where the copy *landed*. The same
split appears under `move()` (`.$KEY` names the source, `key()` the
destination) and inside a `type()` block referenced from elsewhere
(`.$KEY` names the definition's key, `key()` the using site's).

In a literal position nothing travels and the two agree, which is why
every ordinary case translates untouched — 331 use-case checks and the
whole shared suite passed the rewrite unchanged. These three are where
the difference lives, and `key()`'s answer is the one G8 phase 1
specified. Recorded so that a model whose numbers move after the rewrite
has somewhere to look.

## recursion — schema self-reference

### 52. A recursive schema is refused, broken, or silently vacuous, depending on the spelling [FIXED 2026-08-29]
Probed in both ports (which agree byte-for-byte throughout) on
2026-08-28, prompted by the question "is it possible to define
recursive schemas?" The answer is no, and the three failure regimes
are worth recording because two of them are silent.

| spelling | outcome |
|---|---|
| `Node: {v: integer, next?: $.Node}` | `path_cycle` — also for a map-spread body and inside `type()` |
| `A: {b?: $.B}` with `B: {a?: $.A}` | `path_cycle` at the second hop |
| `Node: hide({v: integer, next: null \| $.Node})` | base case works; **one level of real nesting dies as `scalar_kind`** at the parent — the recursive alternative does not re-resolve at the nested position, so the disjunct is left holding only `null` against a map, and the error names neither the recursion nor the schema |
| `Node: hide({v: integer, kids: [] \| [&: $.Node]})` | **generates at any depth and checks nothing**: `v: oops` and a missing `v` both pass at every level. The disjunct admits the list branch wholesale and the spread template inside it is never applied — the vet-shaped worst case, a tree that looks validated and is not |

The first regime is the cycle detector doing its job too early:
`RefVal`'s prefix test fires on `$.Node` *written inside* `Node`,
before any question of whether the recursion is guarded by a base case
(`?`, a `null |` alternative, an empty-list alternative). Guardedness
is not considered anywhere: the language currently has no way to say
"expand this reference lazily, at data that is finite".

The fourth regime is the one with teeth for agents: it is the
well-formed wrong config shape. It is consistent with the pinned
template-through-disjunct behaviour (`edge.tsv:edge-spread-disjunct-key`
— a spread whose template is a disjunct does not apply the map branch),
but here the non-application is reached FROM a schema an author would
write in good faith, and nothing says so.

**FIXED 2026-08-29**, by the landing of
[`docs/design/RECURSION.0.md`](../docs/design/RECURSION.0.md) P0+P1 in
both ports — per regime:

- **Regimes 1–2 (`path_cycle` on the self- and mutual reference):**
  the prefix detector's response is now a RECURSIVE RESIDUAL — the
  reference the author wrote simply means the fixpoint. It expands
  one level per meet with concrete data, stays symbolic in canon and
  the `aon1-` hash, and refuses at generation only where a REQUIRED
  recursive position never met data (`recursion_unexpanded`; the
  depth budget answers `recursion_budget`). The degenerate all-empty
  self-reference (`a: $.a`) keeps `path_cycle`'s honesty as an
  unexpandable residual. Rows: `test/spec/recursion.tsv` throughout
  (`list-depth-*`, `mutual-pair`, `canon-symbolic`,
  `hash-stable-under-data`, `required-unexpanded`).
- **Regime 3 (nullable alternative dies at depth as `scalar_kind`):**
  the recursive alternative is a residual inside the disjunct and
  re-resolves per destination, so `*null | $.Node` now guards
  correctly at every level (`null-guard-generates`,
  `enforced-at-depth`).
- **Regime 4 (the silently vacuous `[] | [&: $.Node]`):** two rules.
  `same()`/`valSame` compare SPREADS, so the disjunct no longer
  deduplicates `[]` with `[&: $.Node]` at the definition; and the
  X-C3 adjudication (`list_length` in a member trial: a literal list
  alternative without a spread admits only a peer of its own length)
  makes the disjunct select by shape instead of first-match. The
  spread template applies at every depth; `v: oops` at depth is
  refused where it sits (`kids-enforced`, `enforced-at-depth`,
  `list-alternative-is-its-length`).

The reference now documents the spelling
(`docs/reference-language.md`, recursive schemas) and
use-cases/13-recursive-schema exercises the whole surface end to end,
`vet --at` over plain JSON included.

Repros (kept as history — the first now generates at depth, the
second now refuses `v: oops`, as `|:empty` at the list: the refusal
the disjunct can state):
[`repros/recursion/guarded-next-breaks-at-depth-one.aon`](repros/recursion/guarded-next-breaks-at-depth-one.aon)
and
[`repros/recursion/spread-template-never-applies.aon`](repros/recursion/spread-template-never-applies.aon).

## relations — rel(t) at its boundaries

### 53. A rel(t) whose t references a sibling of its own schema bag never resolves [FIXED 2026-08-29]

`rel($.spec.JobShape)` written inside `$.spec.Job` deadlocks: the
func's argument is a reference back into the bag being resolved, the
reference defers while its ancestor is open (the prefix rule's
conservatism -- whole-bag granularity, though `JobShape` itself is
done), the func waits for the argument, the bag waits for the func.
Every spread destination then holds the unresolved `$.spec.Job & {…}`
conjunct forever and generation refuses with `mapval_no_gen`. Both
ports agree.

```aon
spec: hide({
  Job: {kind: job, feeds?: rel($.spec.JobShape)}
  JobShape: {kind: job}
})
p: jobs: {&: $.spec.Job, a: id(job_a) & {feeds: [job_b]}, b: id(job_b) & {}}
```

The same target spelled the old way -- `feeds?: [&:
refer($.spec.JobShape)]` -- WORKS, because the refer sits in the
list-spread template, whose snapshot is taken lazily at each
destination, outside the bag. And a `t` that references a DIFFERENT
bag (`rel($.shape.JobShape)`, `rel($.std.Service)`) works from
anywhere: the deadlock needs the argument to point into the func's own
enclosing bag.

One step from the recorded self-typed boundary (`rel($.spec.Job)`
inside `Job`, RELATIONS.0.md P1 landing notes), and the same family
RECURSION.0.md exists for.

**FIXED 2026-08-29**, by the recursion landing's reference-walk rule:
a pending hide()/type() wrapper is TRANSPARENT to the walk -- the
wrapper only marks, and its argument is the structure the path names
-- so the sibling reference resolves instead of deadlocking against
the unresolved bag (`rel-sibling-shape` in test/spec/rel.tsv;
use-cases/12-relations spells the natural form). The self-typed
`rel($.spec.Job)` inside `Job` remains with the recursion note's
rel-side wiring.

### 54. Relation findings misreport when the schema include nests inside the data file [NOT REPRODUCIBLE 2026-08-30]

Found 2026-08-29 while writing docs/tutorial-graph.md, probed in the
TypeScript CLI. With the schema loaded as a NESTED include (overlay ->
pipeline -> spec, a two-file chain) instead of as a sibling include of
one root model, a mirrored cycle overlay misreports: generation refuses
with `[aontu/relation_inverse_missing]` although the mirror entry is
present, and `aontu relations` emits four inverse-missing findings whose
relation column shows entity keys (`load:`, `extract:`) instead of the
relation name, with no `relation_cycle` at all.

Repro shape: `spec.aon` declaring
`feeds?: rel(...) & acyclic() & inverse(fedBy)`; `pipeline.aon` starting
with `@"./spec.aon"` plus three jobs with both directions written; an
overlay file with `@"./pipeline.aon"` plus
`change: id(job_load) & {feeds: [job_extract]}` and the mirror
`mirror: id(job_extract) & {fedBy: [job_load]}`. The three-file layout
(a root including spec and pipeline as siblings) reports the correct
`relation_cycle` -- use-cases/12-relations and the tutorial both use
that shape. Cosmetic quirk observed alongside: generation-time relation
errors at overlay positions append the relation name to the path
(`$.change.feeds.1.feeds`).

Status, 2026-08-30: **does not reproduce**. Left OPEN rather than
closed, because not reproducing is not the same as knowing what fixed
it.

This entry is entirely a claim that the NESTED layout differs from the
SIBLING one. Rebuilt from the repro shape above, the two now emit
BYTE-IDENTICAL reports:

    $.jobs.extract.feeds.0  feeds: cycle job_extract -> job_report -> job_load -> job_extract
    $.jobs.extract.feeds.0  feeds: job_report does not list job_extract under fedBy
    $.jobs.report.feeds.0   feeds: job_load does not list job_report under fedBy
    $.mirror.feeds.0        feeds: job_report does not list job_extract under fedBy

Every clause inverts: generation refuses with `relation_cycle` and not
`relation_inverse_missing`, the `relation_cycle` finding IS present,
and the relation column shows the relation NAME (`feeds:`) rather than
entity keys. Three readings of the prose were tried -- the cycle in
the overlay, the cycle in `pipeline.aon` with both directions written,
and forward-only edges with the mirror supplied by the overlay. The
last is the only one that raises inverse-missing findings at all, and
it reports them correctly.

There is no committed repro for this entry -- the description is
prose, and `repros/` has no relations directory -- so what was
actually probed cannot be re-run. Several relation fixes landed
between the filing and now, §53 on 2026-08-29 among them, and one of
them plausibly closed it; which is not established. **Re-probe against
the `docs/tutorial-graph.md` draft it was found in before closing, and
commit the repro this time.**

### 55. `why` drops the spread role when template and keys arrive in separate statements [PARTLY FIXED 2026-08-30]

Found 2026-08-29 while writing docs/how-to/explain-a-value.md, probed in
the TypeScript CLI. When the `&:` template and the concrete keys sit in
two separate duplicate `services:` statements, `why` at a templated path
drops the `(spread)` role annotation; with two spreads contributing to
one field it displays the merged disjunction as the org contribution's
value instead of the text the author wrote. The single-block spelling
(template and keys in one statement) reports roles and sources exactly
as documented, and the guide uses it.

Status, 2026-08-30. **The role half is FIXED**; the two-spread display
is still open and is a different defect.

*The role.* `MapVal.unify` marks a spread template so `why` can say the
contribution came from `&:` rather than from the key -- but only in the
OWN-KEY arm. Written as two duplicate statements the template arrives
as a PEER, and that arm did not mark it, so one document reported
`spread` and the other `literal` on nothing but how the author spaced
their statements. `ListVal`'s peer arm already marked its template,
which is what said which side was wrong rather than leaving it a
choice. Go agreed with the corrected TypeScript already, so both ports
pass the new rows unchanged. Pins: `test/spec/why.tsv`
`why-spread-split-statements` and `why-spread-split-untouched`.

*The two-spread display is STILL OPEN, and its cause is not the mark.*
Several spreads in ONE statement become a ConjunctVal, which the
recorder already splits into its terms. Spreads in SEPARATE statements
MEET in the spread combination instead, and the result is a new value
carrying the first one's site -- so `why` shows one contribution whose
canon is the merged `*8080|integer&min(1024)` at the position of
`*8080|integer`: the site is right and the text is not what is written
there. Showing both authored templates means holding them unmet until
`why` has seen them, which changes WHEN spreads combine rather than
what a report walks. That is more than this minor warrants, and it is
adjacent to the spread machinery §50 just moved, so it is left filed
rather than bundled in.

### 56. `jsonschema` drops `deprecate()` silently, against its own loss contract [FIXED 2026-08-30]

Found 2026-08-29 while building use-cases/14-jsonschema-export, probed
in both CLIs (which agree). `deprecate(x, meta)` exports as `x` alone:
no `deprecated: true` keyword (2020-12 has one), and no loss line on
stderr even under `--strict` -- the one silent drop found while pinning
the export surface, against the verb's stated rule that nothing is
dropped in silence. Related boundaries that ARE reported (and now
documented in docs/how-to/export-json-schema.md): `must()` exports `{}`
as construct `nil` and takes the conjoined kind with it; a spread
template crosses as `additionalProperties`/`items` only when it is a
bare kind; list `length()` exports `minItems`/`maxItems` yet still
reports a domain-less loss. The case's `check.sh` pins today's
behaviour; fixing any of these means re-pinning there and in the guide.

Status: FIXED 2026-08-30, in both ports and byte-identically.
`deprecated: true` is emitted -- 2020-12 has the annotation, so the
FACT crosses faithfully -- and the record's `msg`/`use`/`since` are
reported as a loss, because the draft has no field for what a
deprecation says. They are NOT invented into `description`: this
exporter emits none anywhere, and quietly redefining it as "the
deprecation note" is a mapping a consumer cannot undo. An empty record
(`deprecate(x, {})`) therefore loses nothing and reports nothing.

`--strict` now exits 1 on that loss where it used to pass, which is
the point: the contract is that nothing is dropped in silence.

Pins: `test/spec/jsonschema.tsv` -- `js-deprecate-flag` (the record
with nothing said: flag, no loss), `js-deprecate-msg-is-a-loss`, and
`js-deprecate-all-three-keys`. Re-pinned in
`docs/how-to/export-json-schema.md` and
`use-cases/14-jsonschema-export/README.md`, as the entry said fixing
it would require; the use-case's own eight checks are unchanged and
still pass.

The other boundaries this entry lists -- `must()` exporting `{}`, a
constrained spread template, list `length()`'s domain-less loss -- are
untouched. They were already REPORTED, so they are not the contract
breach; changing them is a design question about the export surface
rather than a defect.

### 57. A recursive spread conjoined with a map does not terminate at depth two, in both ports [critical]

Found 2026-08-30 while surveying what a declarative code-generation
layer could be built on. Recursion through a **list spread** works,
and so does conjoining anything at a recursive position -- until the
two meet at depth two, where both engines run unbounded:

```aon
%T: {name: string, kids?: [&: %T & {}]}
d: %T & {name: a, kids: [{name: b, kids: [{name: c}]}]}
```

| spelling | depth 1 | depth 2 |
|---|---|---|
| `[&: %T]` | 0.11 s | **0.15 s** |
| `[&: %T & top]` | 0.11 s | **0.14 s** |
| `[&: %T & {}]` | 0.13 s | **no answer** |
| `[&: %T & {tag: X}]` | 0.14 s | **no answer** |
| `[&: $.schema.T & {tag: X}]` (path form) | 0.15 s | **no answer** |
| `{name: string, tag?: X, kids?: [&: %T]}` (conjunct OUTSIDE the spread) | 0.16 s | 0.16 s |

(Wall clock for the whole CLI run, node 24, this tree; the point is
three orders of magnitude, not the third digit.)

So it is not the recursion, not the spread, and not the conjunct's
content -- `& {}`, which adds nothing, is enough. `& top` is fine
because top is absorbed rather than kept as a conjunct. Both ports
behave identically: TypeScript and the Go CLI each answer depth one in
a sixth of a second and are still running when killed at 20 s on depth two.

It is an ALLOCATION explosion, not a spin: TypeScript holds 563 MB of
resident memory 21 s in and 700 MB 41 s in, growing steadily at about
one core. That is the clone-graph signature -- the recursive residual
and its conjunct being re-instantiated per pass per destination -- and
not a loop that fails to advance.

**Why this is critical rather than a performance note.**
[`docs/trust.md`](../docs/trust.md) clause 2 promises that evaluation
terminates, and the budget taxonomy in
[`test/spec/budget.tsv`](../test/spec/budget.tsv) promises that giving
up is *reported* (`budget_passes`, `recursion_budget`, `unify_cycle`)
rather than silent. Neither holds here, and the reason is structural:
the pass budget (`maxcc = 9`, `ts/src/unify.ts:545`) bounds the NUMBER
of fixpoint passes, not the work inside one. The explosion happens
within a single pass, so no budget code can fire. A document like this
one hangs the CLI, the LSP, and any agent harness that evaluates
untrusted input -- which is the case G5 exists to rule out.

The recursion machinery is a week old (§52, fixed 2026-08-29 by
[`docs/design/RECURSION.0.md`](../docs/design/RECURSION.0.md) P0+P1),
and the shape here is regime 4's neighbour: `test/spec/recursion.tsv`
pins `list-depth-*` for the bare spread, and no row conjoins anything
with the recursive position inside a spread.

**It also blocks the transform layer.** A recursive reference is the
natural home for an apply-templates analogue -- descent bounded by the
data, which is exactly the termination argument G8 asks for -- and
per-node computation at a recursive position is precisely
`[&: %T & {...}]`. A second, milder defect sits beside it: computation
written INSIDE a recursive definition is evaluated at the definition
rather than per instance, so `up: upper(.name)` in
`hide({T: {name: string, up: upper(.name), kids?: [&: $.schema.T]}})`
refuses with `[aontu/invalid-arg]` at `$.schema.T.up`, `.name` having
resolved to `string`. Per-destination instantiation (ADR-005) reaches
`pack` templates and `&:` spreads but not recursive expansion.

Repro:
[`repros/recursion/recursive-spread-conjunct-hangs.aon`](repros/recursion/recursive-spread-conjunct-hangs.aon)
-- run it under `timeout`, as its header says.

## identity — id() at its own boundary

### 58. An `id()` naming a node and its own descendant crashes both engines on the host stack [FIXED 2026-08-30]

Found 2026-08-30, same survey as §57, while asking whether the
evaluated value graph is a tree (a transform layer that walks children
needs to know). It is not, and one construct makes it cyclic:

```aon
a: id(x) & { b: id(x) }
```

| port | outcome |
|---|---|
| TypeScript | `Aontu: unexpected error: Maximum call stack size exceeded`, exit 1 — **no `[aontu/…]` marker**, so a harness that greps for one sees nothing |
| Go | `runtime: goroutine stack exceeds 1000000000-byte limit` / `fatal error: stack overflow`, exit 2 — Go stack overflow is **not recoverable**, so an embedding server cannot catch it |

Identity merge means every node carrying a name unifies with every
other node carrying it ([`docs/reference-language.md`](../docs/reference-language.md#identity-idname)),
so naming a node and its own descendant the same entity asks for a
value that contains itself, and `a.peg.b === a`. What is missing is
the refusal, not the detection: the merge has both sites in hand.

The boundary is exactly ancestor-to-descendant. Everything adjacent
works, which is why this has not been seen:

| spelling | outcome |
|---|---|
| `{p: id(x) & {c:1}, q: id(x) & {d:2}}` (siblings) | merges — the feature working |
| `a: id(x) & {b: id(y) & {c:1}}` (distinct names) | fine |
| `a: id(x) & {b: {c: 1}}` (id on the node alone) | fine |
| `a: id(x) & {b: id(x)}` | **crash, both ports** |
| `a: id(x) & {b: {c: id(x) & {d: 1}}}` (deeper) | **crash, both ports** |

Three things follow. First, it is a
[trust-contract](../docs/trust.md) breach of the plainest kind: a
22-character document takes down the CLI, the LSP and the MCP server,
and the Go side cannot be defended against by the host. Second, the
error taxonomy has a hole the registry cannot see —
[`test/spec/errcodes.tsv`](../test/spec/errcodes.tsv) carries
`id_name`, `id_conflict` and `id_spread`, and this failure has no code
at all, so `codeClasses` set-equality stays green while a whole class
of input is unhandled. An `id_ancestor` conflict (or `id_conflict`
reused, the two sites being exactly what it reports) closes it. Third,
it bounds what a transform layer may assume: **the evaluated structure
is a DAG with sharing, and one construct can make it cyclic**, which
is why [`ts/src/walk.ts`](../ts/src/walk.ts) calls its `seen` set "a
termination guard, not an optimisation". Any walk primitive that
recurses on `peg` inherits this crash until the refusal lands.

Status: FIXED 2026-08-30. The refusal is `id_ancestor`, class
`conflict`, raised in the entity merge's COLLECT half -- before the
`unite` that would build the self-containing value, which is where the
stack went. It lands on the DESCENDANT, the position that cannot
stand, and names the ancestor as the finding's other site. A separate
code rather than `id_conflict` reused, because it is a different
mistake: `id_conflict` is one node claiming two names, this is one
name claiming a node and something inside it. That also closes the
registry hole the entry names -- the failure now has a code, so
`codeClasses` set-equality is answering for it.

**One narrowing the fix needed, found by an existing test.** The
ancestor check compares NODES, not just names: a unified tree is a
graph, so a resolved reference shares its target and a node can be
reached through itself with nobody having written two `id()`s
(`TestMergeEntitiesCycleGuards` builds exactly that). One entity at
one position is fine; the defect is two DISTINCT nodes, one inside the
other, claiming one name.

Pins: `test/spec/id.tsv` -- `id-ancestor-names-own-child` and
`-names-deeper-descendant` for the refusal, and
`-siblings-still-merge`, `-distinct-names-nest`,
`-id-on-the-node-alone` for the boundary, two of which are the feature
itself. `test/spec/errcodes.tsv` carries `id_ancestor`.

Repro:
[`repros/identity/id-names-own-descendant-crashes.aon`](repros/identity/id-names-own-descendant-crashes.aon).

## anchoring — what `--at` can still see

### 59. `vet --at` loses `%alias` references in the Go port [FIXED 2026-08-30]

Found 2026-08-30 while specifying a code-generation vocabulary as an
Aontu schema — the vocabulary is alias-heavy, and `--at` is how you
point a validation at one part of a document. The two engines return
**opposite verdicts and opposite exit codes** for the same inputs:

```aon
# schema
%F: close({ n: string })
%U: close({ p: string, fs: [&: %F] })
%C: close({ units: [&: %U] })
code: type(%C)

# data
units: [ { p: "a", fs: [ {n:"x"} ] } ]
```

```
$ aontu      vet --at code schema.aon data.aon    verdict: valid     exit 0
$ aontu-go   vet --at code schema.aon data.aon    verdict: invalid   exit 1
                                                  $.code.units.0: no_path [reference]
                                                  schema: schema.aon:3:24 ($.%U)
```

Isolated to `--at` alone: removing `type()` still breaks in Go, one
alias level instead of three still breaks in Go, and dropping `--at`
(wrapping the data in a `code:` key instead) makes **both** ports say
valid. The likely cause is that Go's anchor re-roots the schema subtree
while `%alias` declarations live at the document root (`$.%U`), so
after anchoring the alias is unreachable; TypeScript's `anchorAt`
keeps root context.

`--at` is a shared seam, but the break is not, and this was probed
rather than assumed: `jsonschema --at code` **agrees** between the
ports over the same document (both render `"items": {}`), and `diff`
takes no `--at` at all. So it is vet's anchor, not every anchor.

The direction matters. Go REFUSES a document TypeScript ACCEPTS, so a
pipeline running the Go CLI fails builds the canonical implementation
passes — and `vet` is the verb whose whole purpose is to be that gate
(ADR-007, and the `vet ≡ eval` differential in
[`AGENTS.md`](../AGENTS.md#the-vet--eval-differential)). It is in no
debt register: not here, not
[`test/spec/divergent.tsv`](../test/spec/divergent.tsv), not
[`DIVERGENCE.md`](../DIVERGENCE.md). By the ledger's own rule it does
not belong in `divergent.tsv` either — that register is for
divergences that cannot be fixed from this repository right now, and
this one is Go's `anchorAt`.

Status: FIXED 2026-08-30, and the guess above was right about the
mechanism but wrong about which port was missing a piece. Go already
HAD the tree — `Ctx.fixroot`, the settled schema root, which vet sets
under `--at` — and `RecurseVal.body` already read it. What it lacked
was the second reader: TypeScript's `RefVal.find` falls back to
`_fixroot` for any absolute reference the meet's root cannot answer,
and Go's reference walk did not. Go now does the same, with the walk
factored into `RefVal.walkFrom` so the two roots share one set of
mark-wrapper and list-index rules rather than growing a second copy to
drift.

The comment in TypeScript's own fallback asserted that "the Go port
answers the anchored meet from settled structures and never sees the
gap". It does see it; that sentence is what this entry cost.

**A second divergence came out of writing the rows**, invisible from
the CLI because both ports printed the same headline: BOTH stamped the
schema url onto the LIFTED ANCHOR only, so a node reached through the
root fallback carried no url at all. Go answered `-1:-1` with no file
(its rule for a file it holds no text for) and TypeScript gave the
right coordinates while naming no file — against finding F's
invariant that every site names the file whose text it excerpts (§25).
Both now stamp the settled schema root; `stampURL` fills only an EMPTY
url, so the superset never renames a value that came through an
include.

Pins: `test/spec/vet.tsv` — `vet-at-alias-chain-valid`,
`-inner-kind` and `-inner-closed`. Three alias levels, because one
would not have shown it, and the two invalid rows are the half that
matters: a fallback resolving to `top` would answer "valid" too, so
they pin that the alias is still ENFORCED through the anchor.

Repro:
[`repros/anchor/vet-at-loses-aliases-in-go.aon`](repros/anchor/vet-at-loses-aliases-in-go.aon)
with its `-data` companion.

## hashing — what `aon1-` can still see

### 60. The canon-hash is blind to an alias used as a spread template [critical]

Found 2026-08-30, by an adversarial reviewer checking a
code-generation vocabulary\'s anti-drift story and finding that the pin
proving it did not discriminate. Both ports, identically — a shared
defect, not a divergence.

```aon
# A          %A: close({ n: string })          box: [&: %A]
# B          %A: close({ n: integer, EXTRA: string })   box: [&: %A]
# A-longhand box: [&: close({ n: string })]
```

| document | hash |
|---|---|
| A | `aon1-ZaobmDyyIw5ibjA8DREEXj0h7I5SpzZdnSDVE5SGQLM` |
| B — **different meaning** | `aon1-ZaobmDyyIw5ibjA8DREEXj0h7I5SpzZdnSDVE5SGQLM` — **the same** |
| A-longhand — **same meaning** | `aon1-p1pejKOs3tEJLbpVHlFa2xXy67X-LwvGI3iK8r0tf74` — **different** |

Backwards on both counts. And A and B really do differ: against
`box: [{n: "x"}]`, A vets `valid` and B vets `invalid`.

**Root cause, and the exact boundary.** `hcanon` erases alias
declarations on purpose, and says why
([`ts/src/hcanon.ts`](../ts/src/hcanon.ts), the `aliasKeys` filter):
"`aon1-` pins MEANING, so a document written with aliases and the same
document written longhand must hash to one string". That is
[`docs/design/ALIASES.0.md`](../docs/design/ALIASES.0.md)\'s own
sharpest requirement. The erasure is correct **wherever unification
consumes or substitutes the alias**, and that is every case the suite
covers:

| use site | canon | erasure |
|---|---|---|
| scalar, consumed (`listen: %p` / `listen: 8080`) | `{"listen":8080}` | correct — this is `alias.tsv:alias-hash-erases` and its longhand twin |
| map, substituted (`a: %A`) | `{"a":{"n":string}}` | correct — twin matches, changed meaning moves the hash |
| **spread template (`box: [&: %A]`)** | `{"box":[&:$.%A]}` | **broken** |

At a spread template the alias stays **symbolic** in canon as
`$.%A`. The declaration is erased from the hash form while the
*reference* survives, so the hash form carries a dangling name with no
content behind it. Erasure and symbolic survival are each right on
their own; together they lose the meaning. The fix is to expand the
alias at its use site when building the hash form, rather than
dropping the declaration and keeping the reference.

The two `hash` rows in [`test/spec/alias.tsv`](../test/spec/alias.tsv)
cannot see this: both use the scalar-consumed spelling, where the
alias is gone before canon runs.

**What it costs.** `aontu hash` is the drift check, and
[`ts/src/agentsmd.ts`](../ts/src/agentsmd.ts) writes the claim into
every generated AGENTS.md stanza in the user\'s own repository — "the
canon-hash: it survives reformatting and **moves on any change of
meaning**". For any document whose schema is spelled with aliases at a
spread — the idiom the alias feature exists for — that sentence is
false, and the failure is silent and in the unsafe direction: a real
change of meaning reports no change. G6 pins modules by the same
`#aon1-…` fragment.

`subsume` is **not** fooled — `aontu subsume A B` answers
`does_not_subsume` with `$.%A.n: compat_narrowed` — so the breaking
check still sees what the pin misses.

Repro:
[`repros/hash/alias-spread-hash-blind.aon`](repros/hash/alias-spread-hash-blind.aon)
with its `-2` and `-longhand` companions.

## trials — the flag one port sets and the other does not

### 61. Go's `trialUnify` never sets `ctx.trial`, so `match` and `filter` answer differently in the two ports [FIXED 2026-08-30]

Found 2026-08-30 by an adversarial reviewer of the transform-layer
design, while checking whether unifiability-matching could carry a
rule layer. It cannot yet: the two ports disagree about what unifies.

| source | TypeScript | Go |
|---|---|---|
| `match([1,2], [], "hit", "miss")` | `"miss"` | **`"hit"`** |
| `match([1], [], "hit", "miss")` | `"miss"` | **`"hit"`** |
| `filter([[1],[1,2]], [])` | `[]` | **`[[1],[1,2]]`** |
| `a: *[]` / `a: [1]` | `[aontu/empty]`, exit 1 | **`{"a":*[1]}`, exit 0** |
| `a: *[1]` / `a: [1,2]` | `[aontu/empty]`, exit 1 | **`{"a":*[1,2]}`, exit 0** |

`match` selects the other arm and `filter` makes the **opposite**
selection — TypeScript drops every element, Go keeps every element —
and neither port raises anything. This is the silent-wrong-output
class, in the two combinators a transform layer would dispatch on.

The agreeing cases draw the boundary and confirm the cause:
`a: [] a: [1]` merges to `[1]` in both (no trial); `a: *[] a: []`
gives `*[]` in both (same length); `match([],[],…)` is `"hit"` in both
(same length); and `match([1,2],[&:integer],…)` is `"hit"` in both (a
spread makes the pattern variadic).

**Root cause — a one-line omission.** Both ports carry the same gate,
with the same comment, for the rule §52 regime 4 introduced:

- [`ts/src/val/ListVal.ts`](../ts/src/val/ListVal.ts): `if (true === ctx._trialMode && … this.peg.length !== peer.peg.length) return makeNilErr(ctx, 'list_length', …)`
- [`go/listval.go`](../go/listval.go): `if pl, ok := peer.(*ListVal); ok && nil != ctx && ctx.trial && … len(l.peg) != len(pl.peg)`

TypeScript's `trialUnify`
([`ts/src/val/FuncBaseVal.ts`](../ts/src/val/FuncBaseVal.ts)) saves,
**sets** and restores `ctx._trialMode`. Go's `trialUnify`
([`go/generate.go`](../go/generate.go)) swaps `ctx.err` and **never
sets `ctx.trial`**, so the gate it shares with TypeScript can never
fire from a combinator trial. Go's flag is set on the disjunct-member
path instead, which is why `[] | [&: T]` behaves and `match`/`filter`
do not.

**The fix is one line; its blast radius is not.** `go/pref.go` calls
the same `trialUnify` three times (`:158`, `:200`, `:227`) for the
`*x & peer` distribution, so setting the flag there changes every
default meet in Go — ADR-004 and ADR-011 territory, with ~190 lines of
`test/spec/pref.tsv` behind it. That the suite is green today means it
does not cover this, not that the change is small: **pref-side rows
for a trial peer of a different length should land before the fix
does.**

Status: FIXED 2026-08-30. `trialUnify` saves, sets and restores
`ctx.trial`, exactly as TypeScript's does -- saved and restored rather
than merely set, because a trial nested inside a trial must not clear
the outer one. All five divergent rows and all three agreeing rows in
the tables above now match between the ports.

**The blast radius the entry warned about did not materialise, and the
pref rows are why we know rather than hope.** They were written FIRST,
from the canonical port's answers, and run against Go before the fix:
`pref-struct-list-default-shorter-peer` and `-longer-peer` failed,
which is the gap, and the three boundary rows passed. After the fix
all five pass and the ~190 lines of `pref.tsv` behind them are
untouched -- so the suite being green today did mean the change is
contained, once the rows that cover it existed.

Pins: `test/spec/pref.tsv` -- `pref-struct-list-default-shorter-peer`,
`-longer-peer`, and `-same-length`, `-same-length-one`,
`-spread-peer` for the boundary (same length still merges leafwise,
which is ADR-011 R3, and a spread makes the pattern variadic so length
stops being the question). `test/spec/gen-match.tsv` --
`match-list-longer-scrutinee-misses`, `-one-vs-empty-misses`,
`-same-length-hits`, `-spread-pattern-hits`.
`test/spec/gen-filter.tsv` -- `filter-list-empty-pattern-keeps-none`,
`-one-element-pattern`, `-top-keeps-both`.

Repro:
[`repros/trial/go-trial-flag-unset.aon`](repros/trial/go-trial-flag-unset.aon)
and its `-pref` companion.

## ordering — the one call site that does not use cmpCodePoint

### 62. `pick` orders an astral-keyed map by UTF-16 code units in TypeScript [FIXED 2026-08-30]

Found 2026-08-30 while checking that a transform's generated line order
is stable across ports. It is not.

```aon
m: {"\u{1F600}": {v:"astral"}, "\uFFF0": {v:"bmp"}}
p: pick($.m, v)
```

| | result |
|---|---|
| canon of `m`, both ports | `{"\uFFF0":…,"\u{1F600}":…}` — U+FFF0 first |
| `each($.m, integer)`, both ports | `[2,1]` — same order |
| `pick`, **TypeScript** | `["astral","bmp"]` — **U+1F600 first** |
| `pick`, **Go** | `["bmp","astral"]` — matches canon |

So the map's own order agrees, `each` agrees, and only `pick` moves —
which means the two functions the language documents as sharing one
order do not. `go/agg.go` states the contract: "sorted-key order for a
map — `each`'s order, and for the same reason (a map has no order of
its own, so the language picks one and states it)". Go honours it;
TypeScript does not.

**Cause, one line.** `bagChildren` in
[`ts/src/val/AggFuncVal.ts`](../ts/src/val/AggFuncVal.ts) does

```js
return Object.keys(data.peg).sort().map((k) => data.peg[k])
```

A bare `.sort()` is JavaScript's **UTF-16 code-unit** order. U+1F600
is the surrogate pair `D83D DE00`, and `D83D` sorts below `FFF0`, so
TypeScript reverses the pair. Go sorts UTF-8 bytes, which *is*
code-point order. Every other ordering site in the port imports
`cmpCodePoint` from [`ts/src/keyorder.ts`](../ts/src/keyorder.ts) —
`agentsmd.ts`, `diff.ts`, `exactjson.ts` and `graph.ts` all do. This
one call site does not. The fix is `.sort(cmpCodePoint)`.

`bagChildren` also feeds `sum`, `least` and `greatest`, but those fold
order-insensitively, so `pick` is the only observable divergence.

**Why it matters beyond Unicode.** `pick` is the order-preserving
projection — the primitive that turns a bag of records into an ordered
list of generated lines, and the one a code generator leans on for
exactly that. Two ports, two orders, means one model producing two
different generated files: an ADR-001 break in the primitive the
generation story depends on.

Status: FIXED 2026-08-30 — `bagChildren` sorts with `cmpCodePoint`,
the order `keyorder.ts` exists to state and the one every other
emitting site in the port already used. The three pins are
`test/spec/agg.tsv`: `pick-astral-key-order`, `each-astral-key-order`
and `pick-astral-key-order-three`, which spans ASCII, BMP and astral
in one map so the position a bare `.sort()` gets wrong is in the
middle of the row rather than at its end.

Repro:
[`repros/order/pick-astral-key-order.aon`](repros/order/pick-astral-key-order.aon).

## marks — what `hide()` stops resolving

### 63. Inside `hide()`, Go does not resolve a spread template's reference [critical]

Found 2026-08-30 by building
[use case 15](15-code-generation/README.md), whose first draft used the
obvious spelling and passed in TypeScript.

```aon
src: [{n: "a"}]
u: {rows: hide([&: {o: .n}] & $.src)}
```

| | canon | generate |
|---|---|---|
| TypeScript | `{"src":[{"n":"a"}],"u":{"rows":[&:{"o":.n},{"n":"a","o":"a"}]}}` | `{"src":[{"n":"a"}],"u":{}}`, exit 0 |
| Go | `{"src":[{"n":"a"}],"u":{"rows":hide([&:{"o":.n},{"n":"a","o":.n}])}}` | `[aontu/mapval_no_gen]` at `$.u.rows`, exit 1 |

Read the Go canon closely: the element's `o` is still the
**unresolved** `.n`, where TypeScript resolved it to `"a"`, and the
`hide(` wrapper is still there where TypeScript absorbed the mark. So
under `hide()` the Go port never applies the spread template's
computation, and everything downstream of it refuses. Opposite exit
codes on a document neither port reports as wrong.

**Boundary, probed.** The break needs the mark AND a template that
computes from a relative reference:

| spelling | outcome |
|---|---|
| `[&: {o: .n}] & $.src` (no `hide`) | both ports agree |
| `hide([{o: "a"}])` (literal list) | both ports agree |
| `hide([&: {o: "K"}] & $.src)` (constant template) | both ports agree |
| `hide([&: {o: .n}] & $.src)` | **diverge** |

**Why it matters.** `hide()` around a staged intermediate is the
natural way to keep scaffolding out of a generated value, and staging
is *required* because `pick` over an inline spread expression does not
settle. So the obvious spelling of a code-generation transform —
compute the lines into a hidden key, project them with `pick` — works
in the canonical implementation and refuses in the port. Use case 15
had to drop `hide()`; its `check.sh` asserts byte-identical output from
both ports, and without that assertion the repository would have
shipped a TypeScript-only transform that looked correct.

Repro:
[`repros/hide/hide-blocks-spread-compute-in-go.aon`](repros/hide/hide-blocks-spread-compute-in-go.aon).

## subsumption — the law that holds only for one spelling

### 64. A referenced, aliased or recursive spread template breaks reflexivity, in both ports [critical]

Found 2026-08-30 while designing a subsumption poset — a diagram whose
nodes are documents and whose edges are `subsume` verdicts. Three of
the seven use-case entry documents do not subsume **themselves**:

| document | self-subsumption |
|---|---|
| `01-service-catalog/system.aon` | **undecided** (`sub_path_dependent_spread`, `sub_unresolved`) |
| `12-relations/model.aon` | **undecided** (`sub_path_dependent_spread`, `sub_unresolved`) |
| `13-recursive-schema/model.aon` | **undecided** (`sub_unresolved`) |
| `02-deploy-config/stack.aon` | subsumes |
| `06-k8s-golden-path/main.aon` | subsumes |
| `08-feature-flags/system.aon` | subsumes |
| `15-code-generation/model.aon` | subsumes |

[`test/spec/subsume.tsv`](../test/spec/subsume.tsv) states the rule in
capitals — "REFLEXIVITY IS A LAW (2026-08-27). Every value admits
itself, residue included" — and its comment records that this exact
failure mode was fixed once already (§28): "a constraint inside a
SPREAD TEMPLATE made a contract non-self-subsumable — expected and
actual byte-identical, verdict undecided". The class is back, by three
other spellings.

**Minimised, both ports, three lines each.** The control cases are the
boundary:

| spelling | verdict |
|---|---|
| `defs: {x: {&: integer & min(0)}}` — inline constraint, the case §28 fixed | `subsumes` |
| `a: {b: 1}` — plain map | `subsumes` |
| `defs: hide({F: {n: string}})` / `code: {fs: {&: $.defs.F}}` — **reference**-valued template | **`undecided`** `sub_path_dependent_spread` |
| `%F: {n: string}` / `code: {fs: {&: %F}}` — **alias**-valued template | **`undecided`** `sub_path_dependent_spread` |
| `spec: hide({Step: {label: string, then?: $.spec.Step}})` / `doc: $.spec.Step & {label: "a"}` — **recursive** | **`undecided`** `sub_unresolved` |

The finding's two operands are byte-identical, which is what makes it
a bug rather than a conservative answer:

```
code    : sub_path_dependent_spread
path    : $.code.fs
expected: '$.%F'
actual  : '$.%F'
```

**What it costs.** §28 already recorded the consequence: `breaking` on
a non-self-subsumable contract hard-fails and has to be run with
`--allow-undecided`, "which then masks the genuine undecideds it exists
to surface". Every layered model in `use-cases/` shares a template by
reference or alias, because that is the idiom the language is for. The
fold also destroys decided answers either side of the shared template —
`1|2|3 ⊒ 1|2` is decided, and a byte-identical shared template beside
it drags the whole comparison to `undecided`.

**The repair the law implies.** Before folding to `undecided`, compare
the two operands' **hash forms**; equal means `subsumes`. That is not a
heuristic — `subsume.tsv` already says "Identity is the HASH FORM" — and
it runs only where an `undecided` was about to be returned, so it costs
nothing in the common case.

Repros:
[`repros/subsume/reflexivity-reference-spread.aon`](repros/subsume/reflexivity-reference-spread.aon),
[`reflexivity-alias-spread.aon`](repros/subsume/reflexivity-alias-spread.aon),
[`reflexivity-recursive-ref.aon`](repros/subsume/reflexivity-recursive-ref.aon).

## the entity graph — what a conjunct hides

### 65. A `refer()` behind a conjunct is invisible to the entity graph, so `reaches` answers wrongly [critical]

Found 2026-08-30 while drawing the use cases: the dependency matrix for
`use-cases/05-rbac-policy` came out **entirely empty** — thirteen
entities, zero edges — on a model whose whole subject is which role
grants which permission.

```aon
p: id(pp) & {n: 1}
a: id(x) & {link: unique() & [&: refer() & string], link: ["pp"]}
```

```
$ aontu reaches x pp guarded.aon     verdict: unreachable   exit 1
$ aontu reaches x pp control.aon     verdict: reaches       exit 0
```

The two documents differ by the two tokens `unique() &`. Both ports
agree in both directions, so this is a shared defect and not a parity
break.

**Minimised through `graphOf` directly**, which is where the loss
happens:

| spelling | edges |
|---|---|
| `link: refer() & string` | 1 |
| `link: [&: refer() & string]` | 1 |
| `link: unique() & [&: refer() & string]` | **0** |

So it is the **conjunct**, not the list and not the spread.
`graphOf`'s walk does not descend into conjunct arms, so any relation
guarded by a sizing atom, a constraint, or any other `&` term drops out
of the graph entirely.

**It is the natural spelling, not a contrived one.**
[`use-cases/05-rbac-policy/roles.aon`](05-rbac-policy/roles.aon)
writes

```aon
grants: unique() & [&: refer() & string]
```

which is how one says "a set of grants, no duplicates". On that model
`graphOf` reports 13 entities and 0 edges, and

```
$ aontu reaches admin admin_all --trust root:. example.aon
verdict: unreachable
```

although `roles.admin.grants` evaluates to `["admin_all"]`. `relations`
answers `verdict: pass` over the same model, having checked nothing.
The case's own `check.sh` never calls `reaches`, which is why the suite
is green over it.

**What it costs.** `reaches` and `relations` are check verbs: a wrong
`unreachable` is a silent false negative in a referential-integrity
gate, and the guard that causes it (`unique()`) is exactly what a
careful author adds. G4's referential integrity, the `acyclic()` check
and the `inverse()` check all read the same graph.

This is the blind spot
[`docs/design/VIEWS.0.md`](../docs/design/VIEWS.0.md) Phase 0 exists to
close; recorded here because it is a defect in shipped check verbs on
its own, independent of whether any diagram is ever drawn.

Repros:
[`repros/graph/refer-behind-conjunct-invisible.aon`](repros/graph/refer-behind-conjunct-invisible.aon)
and its `refer-in-list-visible.aon` control.

## Elsewhere in this review

Defects verified earlier in the effort and recorded in
[REVIEW.md](REVIEW.md) with their evidence rather than duplicated here:
the leading-`//` line silently converting a document into a list and
dropping every following key (exit 0); `@"file.json"` includes yielding
`{}` silently at top level and a raw TypeError nested; the
`DisjunctVal` generation chimera (`({x:1}|{y:2}) & {z:3}` → merged
map, **FIXED 2026-08-27 by ADR-007** -- see §13); canon not
round-tripping constraint residuals
(`a: min(true)` → `constraint()`); the `$KEY`-in-default and
`$KEY`-with-referenced-shape resolution bugs that podmind's models
carry workarounds for (**RETIRED 2026-08-28 by ADR-009**, which removed
the spelling entirely — `key()` is the replacement, and the
referenced-shape one was the early-binding difference §51 records);
`why`'s tutorial mismatch; and the ADR-002
coverage gate itself flaking red on an untouched tree
(`ListVal.ts:206-207` branch arms) during this PR's own CI runs.

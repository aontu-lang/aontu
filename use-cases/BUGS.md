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
The one nontermination repro is marked in-file to be run under
`timeout`. Severity: **critical** = silent wrong output, unsound vet
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
   **PARTLY FIXED 2026-08-27 (ADR-007)**: the meet is now built from a
   FRESH PARSE of the schema, so the fixpoint runs once over both
   documents and references (§15) — and the `must()` audits on the
   write path, which is what made `aontu set` accept writes its own
   policy refuses — see the data. The standalone pass remains, as the
   diagnosis it always was. What survives is the pair that is an engine
   defect rather than a staging one: a sizing atom (§16) and a
   map-argument `must()` (§17) are discharged against the layer they
   share a conjunct with, and reproduce in a plain two-tree meet.
   Family: vet-soundness.
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
defaults and validates (the conjunct form remains the phase-1 limit).

### 3. A bare-kind conjunct swallows a rank≥2 default [major]
`a: *1.5 & float` → `1.5` (documented), but `a: **1.5 & float` →
`mapval_no_gen`, exit 1 — the ranked default silently drops out of the
lattice value (`--canon` shows the bare kind). Constraint conjuncts
kill defaults of every rank (that half is the documented phase-1
limit); the rank≥2-vs-bare-kind loss is undocumented and contradicts
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

### 32. `tidy` re-pins tampered store content; no verify-without-rewrite verb [major]
Tamper a vendored module → eval correctly refuses with the integrity
error → run `mod tidy` → lockfile silently rewritten to the tampered
hash, `verdict: ok`, and eval now passes emitting the tampered value.
The recompute-always semantics is documented; the operational hole is
the absence of any `mod verify` — a CI job that tidies before
evaluating has no integrity protection. Repro: `tidy-repin/`.

(Also confirmed, by design: the content-addressed cache is unreachable
until a pin exists, and with `mod get` absent, hand-vendoring is the
only cold start — whose directory layout is documented nowhere.)

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
carry workarounds for; `why`'s tutorial mismatch; and the ADR-002
coverage gate itself flaking red on an untouched tree
(`ListVal.ts:206-207` branch arms) during this PR's own CI runs.

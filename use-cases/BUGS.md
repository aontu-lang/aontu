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
   independent instances.** Spread machinery combines unequal templates
   and entangles them with the first destination's data
   (`MapVal`, the in-code `TODO: handle existing spread!`); per-child
   template clones share inner nodes because `Val.clone` passes `peg`
   by reference and neither `FuncBaseVal` (`close`) nor `PrefVal`
   deep-clones its argument. Families: sibling-crosswire,
   generator-seal.
2. **Vet's incompleteness check is generation-based and filters to
   incomplete-class errors**, so unresolved disjunctions vanish
   (`DisjunctVal.gen` folds members with unify and the conflict is
   filtered), and gen-time mark-skipping erases required-key findings.
   Family: vet-soundness.
3. **The schema layer settles alone before the data meet**, so
   schema-internal references, template-conjoined sizing atoms, and
   map-argument `must()` are consumed against schema-side values and
   never re-fired against data — vet and one-document eval return
   opposite verdicts for identical compositions. Family: vet-soundness.
4. **The provenance recorder only attributes meets on original AST
   nodes** — later spread siblings, pack-generated children, and one
   side of every id-merge see cloned/normalised structures whose meets
   are unrecorded, split, or site-less. Family: provenance.
5. **`refer()`/references resolving through a `type()`/`close()`/
   id-merge-cloned context fail to reach a fixpoint** — surfacing as
   `unify_cycle` (revisit budget tripped), `mapval_no_gen` (never
   settles), or unbounded CPU (stays under the per-pass budget).
   Family: refer-cycles.

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

### 2. A `*` default disables the constraints in its own disjunction [critical]
`port: *8080 | (integer & min(1024) & max(65535))` with `port: 80` →
`80`, exit 0. Starker: `port: *8080 | (integer & neq(80))` with
`port: 80` → `80` — an alternative that *explicitly excludes* the value
is bypassed. The docs' recommended disjunct spelling for
default-with-bound (`*8080 | min(1024)`) is exactly the form that stops
checking the bound on override; the conjunct form enforces but cannot
default (documented phase-1 limit). Repro: `pref-disables-constraint.aon`.

### 3. A bare-kind conjunct swallows a rank≥2 default [major]
`a: *1.5 & float` → `1.5` (documented), but `a: **1.5 & float` →
`mapval_no_gen`, exit 1 — the ranked default silently drops out of the
lattice value (`--canon` shows the bare kind). Constraint conjuncts
kill defaults of every rank (that half is the documented phase-1
limit); the rank≥2-vs-bare-kind loss is undocumented and contradicts
the pref section's own rule. Repro: `ranked-default-swallowed.aon`.

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

### 5. `match()` on a defaulted scrutinee takes the first admissible arm [critical]
`side_effect: *readonly | write | destructive` with
`requires_approval: match(.side_effect, destructive, true, false)` →
`{"requires_approval": true, "side_effect": "readonly"}` — the derived
value contradicts the generated value beside it, exit 0. The pattern
unifies with the still-open disjunction via the same-kind override
gate, so the first arm wins while generation picks the default.
Repro: `match-default-crosswire.aon`.

---

## sibling-crosswire — template state shared across destinations

### 6. Unequal by-reference templates on one map merge sibling children with each other [critical]
Two views of one `id()`-merged entity, each under a `&:` spread whose
template arrives by reference, templates unequal → the entity's own
sibling ports are unified with each other
(`Cannot unify value: 9901 with value: 443`), and in the full model a
*different entity's* port leaks in too. `id()` is sufficient but not
necessary — one view with two reference-templates meeting via a
conjunction fails identically. Repros: `idmerge-ref-templates.aon`,
`oneview-ref-templates.aon`.

### 7. Two unequal cross-statement spreads on one map cross-wire siblings [critical]
`w: &: {p:integer}` + `w: &: {r:integer}` + two children that fill a
template key with different values → earlier siblings' concrete values
ride the combined template into later siblings
(`$.w.y.r: Cannot unify value: 6 with value: 5`). An evaluator bug, not
a vet bug; `spread-interleave.tsv` pins unequal-spread support as
correct, and `MapVal` carries `TODO: handle existing spread!`.
Repros: `two-spreads.aon`, `two-spreads-vet-schema.aon` + data.

### 8. `close()` around a `key()`-bearing pack template evaluates `key()` once [critical]
`deploy: pack($.names, close({ name: key() }))` alone →
`{"auth":{"name":"web"},"web":{"name":"web"}}`, exit 0 — every child
gets the first key. Without `close()` it is correct. Partial overrides
on the corrupted children fail with a garbled path
(`$.deploy.NaN.p`). Contradicts the pack doc's "key() answers for the
child"; `gen-close.tsv` pins close-in-template but never with `key()`
and 2+ names. Repro: `close-key-pack.aon`.

### 9. A rank-2 `key()` default evaluates once and is shared by all children [critical]
`out: pack($.col, { value: **key(1) | string })` → every child gets the
first child's key, exit 0. Single-star spellings (`*key(1)|string`)
resolve correctly per child, so the trigger is the rank-2 pref —
`PrefVal.clone`'s deep-clone of its inner value is commented out.
Repro: `rankpref-key-pack.aon`.

---

## generator-seal — call wrappers around generators

### 10. `close(pack(d, _ & t))` + overlay: the overlay fills the hole [critical]
With a `_` hole in the template, an ordinary overlay statement
(`deploy: prod: x: 2`) is absorbed *into the hole* — every generated
child grows a bogus `prod:` child and the real override is silently
lost, exit 0. Without `close()` the same document merges correctly;
with a hole-free template, `close(pack(...))` + overlay works as
documented. Repro: `close-pack-hole-absorb.aon`.

### 11. `hide(pack(...))`: the hide mark leaks onto generated children [critical]
`m: hide(pack($.col, _))` then `out: pack($.m, {got:_})` →
`{"out":{"web":{}}}`, exit 0 — canon shows the values fully built, but
the leaked mark suppresses them at generation. `hide({literal map})`
does not behave this way, and hidden values are documented as usable
downstream. Workaround: `hide({ m: pack(...) })`. Repro:
`hide-pack-mark-leak.aon`.

### 12. Type-alias references inside `type()` bodies silently drop records [critical]
Three-line inline form: `Base: {kind:"service"}` /
`Entry: type($.Base & {owner: string})` / `use: $.Entry &
{owner:"team-pay"}` → `use` is **silently absent** from output, exit 0,
while `--canon` shows it fully unified. Crossing an `@` include, the
sibling-alias shape (a `type()` schema referencing a `type()` alias)
drops applied records the same way, or kills `id(key(0))` with a bogus
`id_name`, or raises `mapval_spread_required` naming a spread that
exists in neither file. Repros: `include-alias-*.aon`, `alias-*.aon`.
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

### 14. `type()`/`hide()` above the vet anchor drops required-key checks [critical]
`vet --at '$.marked.R'` where `marked: type({R: {a: string, b:
string}})` → `valid` for data missing `b`; the unmarked anchor answers
`incomplete`. Wrong-kind values are still refused — only the
required-presence findings vanish (gen's mark-skipping leaking into
vet). **Correction to the use-case READMEs: `copy()` does restore
enforcement** in every arrangement tried. Repro:
`mark-drops-required.aon`.

### 15. Schema-internal references bind schema-side only under vet [critical]
Schema `a: integer` / `b: $.a`, data `{"a": 3, "b": 4}` →
`verdict: valid`; the same four lines as one document refuse with
`scalar_value`. The conditional-branch form (a branch keyed on a
data-supplied field via a reference) passes vet and fails eval the same
way. References are consumed during the schema-only evaluation and
never re-fired when data arrives. Repros: `stale-reference.aon`,
`stale-reference-branch.aon`.

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

### 29. `--profile gen` is not reflexive on the documented policy idiom [major]
`aontu_policy: hide({compat: *backward | forward | full | none})` — the
verbatim idiom from `reference-api.md` — fails self-subsumption under
`--profile gen` (`sub_disjunct_distribution`; the specific side's
hidden pref-disjunction collapses to its effective default). Trigger:
`hide()` around a preference-bearing disjunction. Repro:
`gen-hide-pref-self-undecided.aon`.

### 30. The judged document waives its own gate [major, by design]
`breaking` reads `$.aontu_policy.compat` from the **new** side, so a PR
that pins `compat: "none"` waives the gate judging it — documented, and
the text report gives no hint nothing was checked (only `--format
json`'s `"mode":"none"` shows it). CI must pin `--mode`. Repro pair:
`policy-waiver-*.aon` (header cites the design).

(Also verified: concrete version strings self-break the gate and
`breaking` has no `--at` — by design per subsumption's own rules; the
module boundary (`mod.aon`'s `version:`) is the documented safe home.)

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

The family's cross-cutting mechanism: **a relative reference or hole
re-anchors per clone only when it stands as a whole value or a meet
operand; nested inside a `+` expression or a call argument it resolves
at the template's own location** (visible as the `NaN` path segment in
diagnostics). That one inconsistency underlies 33, 35a and 36; its
`hide()`-wrapped form (35b) and the nested-hole capture (34) turn it
into silent data corruption.

### 33. Relative references in template *expressions* do not re-anchor [major]
`pack($.names, {a:1, b: .a})` works (the bare ref re-anchors per
child), but `pack($.names, {a:1, b: .a + 1})` and `b: upper(.a)` fail
with `no_path` at `$.deploy.NaN.b` — while `"acme/" + key() + ":1.4.2"`
(the doc's flagship expression) works. Contradicts the reference's
"relative references inside the template answer for the child".
Repro: `rel-ref-in-expr.aon`.

### 34. Nested pack: the inner template's `_` binds to the outer source child [critical]
`deploy: pack($.envs, { services: pack($.fleet, {v: _}) })` →
`deploy.dev.services.web.v = "dev"` (the *env name*), exit 0 — the
outer pack fills every hole lexically inside its template, including
the nested generator's, before the inner pack fires. Silent wrong
output. Repro: `nested-pack-hole.aon`.

### 35. Sibling refs in expressions; hide() swallowing a failure into silent loss [critical]
(a) A spread template *can* reference the child's sibling fields as
bare values (`&: {md: .side_effect}` works); only the in-expression
form fails (`&: {md: "|" + .side_effect}` → `no_path`) — same
mechanism as 33. Repro: `spread-expr-sibling.aon`.
(b) Referencing a computed `hide()`-marked field of a pack-generated
child yields `[]` with exit 0 — and the *un-hidden* spelling of the
same merge hard-errors, so `hide()` is converting a real unification
failure into silent data loss. Repro: `hide-computed-drop.aon`.

### 36. An expression reading the generated child's own fields cannot be merged onto it [major]
Computed expressions in templates and merged onto generated children
mostly work (constants, absolute refs to outside data, `key()`
concatenation). What cannot be written is any expression that reads the
generated child's *own* fields — and the failure blames a spread that
exists nowhere in the document
(`mapval_spread_required … Cannot unify value: $.deploy.web.replicas+1
with value: nil`). Repro: `merge-expr-onto-pack-child.aon`.
(By design, not a bug: `each()`'s template is a *meet*, so scalars
cannot be reshaped into maps, and `key()` at a list element is the
index — the doc's `pack` spelling covers the transform case.)

---

## Elsewhere in this review

Defects verified earlier in the effort and recorded in
[REVIEW.md](REVIEW.md) with their evidence rather than duplicated here:
the leading-`//` line silently converting a document into a list and
dropping every following key (exit 0); `@"file.json"` includes yielding
`{}` silently at top level and a raw TypeError nested; the
`DisjunctVal` generation chimera (`({x:1}|{y:2}) & {z:3}` → merged
map); canon not round-tripping constraint residuals
(`a: min(true)` → `constraint()`); the REPL and LSP-hover surfaces
ignoring `--trust`/workspace confinement; the `$KEY`-in-default and
`$KEY`-with-referenced-shape resolution bugs that podmind's models
carry workarounds for; `why`'s tutorial mismatch; and the ADR-002
coverage gate itself flaking red on an untouched tree
(`ListVal.ts:206-207` branch arms) during this PR's own CI runs.

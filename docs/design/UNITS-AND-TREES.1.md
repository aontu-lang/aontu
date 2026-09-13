# Retiring `aontu:code`: the component tree as the only output

**Status:** PROPOSED, 2026-09-13; P1 LANDED the same day and §10 says
what it cost. **§12's three open questions were ANSWERED by the owner
on 2026-09-13, and the ADR §12 asks for is written:
[ADR-038](../../ADR.md#adr-038--the-component-tree-is-the-only-output-road-and-aontu-knows-no-languages).
§12a records the answers**; §1, §2, §3, §5, §6, §9,
§10 and §11 carry what the answers changed. **§6 carries one thing the
answers exposed and this note had missed:** `aontu:render` also holds
the profile schema `template` and `fmt` vet against, so it splits
rather than goes. The rest is design and
plan. Status of every phase this note names lives in the
[progress register](../capability-review/progress.md), never here.

**Origin:** Richard Rodger, 2026-09-13: *"Our aim is to retire and
remove code units, and rely entirely on jostraca. To this end we can
extend jostraca as needed as well as refactor aontu. Prepare a design
for this."*

**What this reverses.** [UNITS-AND-TREES.0.md](UNITS-AND-TREES.0.md)
concluded that neither surface absorbs the other, and proposed nothing.
The instruction above overrules that conclusion. This note is what
carrying it out costs, and it does not re-argue the decision. Where
`.0`'s evidence bears on the cost it is cited rather than repeated;
where this note found `.0` too pessimistic, §4 says so.

**Method:** every claim marked VERIFIED was run against `aontu` at
`f057465` and `jostraca` at `653659b` (shallow clone, `git rev-parse`
checked against the origin URL). Claims about what the design *should*
be are argument, and are marked as such.

---

## 1. The three facts, and where each lands

`.0` §2–5 measured what a unit holds that a tree does not. There are
three things, and a design that removes units has to put each of them
somewhere:

| what a unit carries | today | after, as this note first proposed | after, as DECIDED 2026-09-13 |
|---|---|---|---|
| declarations, spelled by a language profile | `%decl` inside `%unit.decls`, lowered by `render` | `lower(decls, lang)`, an aontu function | **deleted** with the profiles; a generator writes target text |
| module identity and derived imports | `%unit.path` plus `{k:"ref", unit}`, resolved across the unit list | `resolve(tree, lang)`, over the finished tree | **deleted** with them; §3a says what survives |
| the fragment algebra | `%frag`, `%line`, `%blank`, `%raw`, `%piece` | **deleted** — the components already are it | unchanged |

**§2 and §3 are kept as the record of an argument the decision
overtook, not as the plan.** They say why a lowering is a function and
why imports resolve inside aontu; both conclusions stand on their own
terms and both are now moot, because there are no declarations left to
lower and no `{k:"ref"}` nodes left to resolve. Each carries a banner.

Nothing in that table is a jostraca extension. That is the design's
main claim and §2 to §4 are the argument for it: **the capability
`aontu:code` carries is a lowering, and a lowering is a function, not
an output vocabulary.** What jostraca has to gain is separate, small,
and §5.

## 2. The lowering becomes a function

> **SUPERSEDED 2026-09-13, and P1 is transitional.** The owner chose to
> drop the declaration schema as well, so `lowerdecls`/`lowerloss`, the
> declaration vocabulary and the two LOWERING profiles all go in the
> end. This section is why the lowering-as-a-function step was worth
> taking anyway: it is what lets the unit road be removed before the
> declaration road is, so the corpus migrates once rather than twice.
> What the decision costs is in §12a.


`aontu:code` conflates two things. `%unit` is an output shape — a list
`render` walks and turns into files. `%record`, `%enum`, `%alias`,
`%const`, `%func`, `%field`, `%type` and `%check` are an *input* shape:
a language-neutral declaration a profile knows how to spell. Removing
the first does not require removing the second, and the second is the
capability `.0` §3 measured — one `%decls` list rendering `idUrl:
string` in TypeScript and ``IDURL string `json:"id_url"` `` in Go.

**Argument.** Keep the declaration schema, drop the unit around it, and
expose the lowering as a call:

```aon
%decls = [
  { k:"record" name:"user_account" fields: [
    { name:"id_url" type: { k:"prim" prim:"string" } }
  ] }
]

out: project([
  file("acct.ts", lower(%decls, "typescript"))
  file("acct.go", lower(%decls, "go", { pkg: "acct" }))
])
```

`lower` takes declarations and a language, and returns a list of
component nodes. The document places them. There is no `units` list,
no `aontu: Code:` anchor, and no `render` verb.

**The implementation is already written and already at parity.**
`ts/src/lower.ts` (586 lines) and `go/lower.go` (822) hold the whole of
it: `splitWords`, `caseName`, `capitalise` with the per-profile acronym
set, `ident` with reserved-word escaping, `quote` with the escape
table, `typeExpr` with `prec`/`child_prec`, `lowerDecl` and
`lowerHeader`. None of that is unit machinery. It emits through one
helper:

```ts
function ln(at: number, text: string): any {
```

— a `{k:"line", at, n:[text]}` fragment node. **Retargeting the whole
lowering to the component tree is changing what `ln` builds**, from a
fragment node to `{cmp:"Line", props:{src, indent}}`. The four bundled
profiles (`aontu/render/lang/*.aon`, 241 lines, plus `render.aon`)
survive untouched, as does `aontu-profile.tsv`'s hash pinning.

**What `lower` needs that `render` gave it for free.** The lowering
context carries the profile, the family, the unit path and a loss sink.
Profile and family come from the `lang` argument, resolved against
`$.aontu.render.Lang` exactly as today. The unit path is §3. The loss
sink is §6, and it is the one place where something is genuinely lost.

## 3. Imports resolve inside aontu, over the finished tree

> **LARGELY CANCELLED 2026-09-13.** A derived import is a
> declaration-lowering concern: no declarations, no `{k:"ref"}` nodes,
> nothing for `resolve()` to walk. The argument below still holds — the
> tree IS a value and aontu could do this — but there is no longer a
> caller. §3a is what survives.


This is the fact `.0` §2 called load-bearing, and the one that looks
like it needs jostraca. VERIFIED there, and re-verified for this note:
a unit at `app/geo.ts` referencing a record in `lib/geo.ts` emits
`import { Point } from "../lib/geo";`, and moving the unit to
`app/deep/geo.ts` rewrites it to `"../../lib/geo"`. The specifier is
computed by `relImport` from two paths, so it needs to know where both
files land.

The obvious reading is that only the build phase knows that, so
jostraca must resolve it. **That reading is wrong, and the reason is
worth stating plainly: in aontu the whole tree is a value.** A document
that builds `project([folder("lib", [...]), folder("app", [...])])`
holds every file's position before anything leaves the engine. A
function over the root can walk it, collect what each file exports,
find the references, and compute each specifier — with no more
information than `render` has today, and at the same moment in the
pipeline.

**Argument.** So `resolve` is a second function, applied at the anchor:

```aon
out: resolve(project([
  folder("lib", [ file("geo.ts", lower(%geo, "typescript")) ])
  folder("app", [ file("shape.ts", lower(%shape, "typescript")) ])
]), "typescript")
```

`lower` emits a `{cmp:"Ref", props:{name, from}}` node where a
`{k:"ref", unit}` appears in a declaration, and an `{cmp:"Imports"}`
placeholder at the head of the file. `resolve` walks the tree, matches
each `Ref` to the file whose declarations exported that name, computes
the relative specifier with the same `relImport`, and rewrites the
`Imports` placeholder into `Line` nodes spelled by the profile — the
work `lowerHeader` does today, moved from per-unit to per-tree.

Three things fall out of this that are better than today, and one that
is worse:

- **A dangling reference becomes detectable.** `.0` §2 recorded that
  `{k:"ref", unit:"lib/nowhere.ts"}` renders `import { Point } from
  "../lib/nowhere";` with `verdict: ok` and exit 0, because `ref.unit`
  names a path and nothing checks a unit lives there. Over a tree the
  sibling is a node, so `resolve` can tell a reference it placed from
  one it could not. It must still admit an unresolved reference — the
  pinned row `lower-ts-derived-imports` references `shared/x.ts`, which
  is deliberately outside the rendered set, because a generated module
  may import a hand-written one. **Argument:** make that explicit
  rather than silent — `{k:"ref", name, from:"pkg"}` for an external
  module, and an unresolvable bare `ref` is `invalid-arg`.
- **Go stops being a special case by accident.** VERIFIED: the same
  reference in a Go unit derives no import at all — `Origin Point` with
  no import line, because Go's module identity is the `package` clause
  ([RENDER.0.md §9 item 22](RENDER.0.md#9-departures-from-the-texts-this-note-inherits)).
  Under `resolve` that is a profile fact, in the profile, rather than a
  branch in the lowering.
- **The unit path stops being written twice.** `.0` §7 asked whose path
  wins when a unit sits inside a `file`. It does not arise: there is no
  unit, and the tree's nesting is the only statement of where the bytes
  go.
- **Worse: `resolve` is a whole-tree rewrite, and aontu has never had
  one.** `emit`, `pack`, `pick` and `each` build values from a model;
  none of them takes a finished structure and returns an edited copy.
  This is new machinery in both ports, and §10 puts it on the critical
  path rather than pretending it is small.

## 3a. What survives of the import question

Dropping the declarations removes the machinery, not the PROBLEM.
[UNITS-AND-TREES.0.md](UNITS-AND-TREES.0.md) §2 measured it: a unit at
`app/geo.ts` referencing `lib/geo.ts` emits `"../lib/geo"`, and moving
the unit one folder down rewrites that to `"../../lib/geo"`. A
generator writing its own imports has to compute the same thing, and a
specifier hand-written against a `folder(...)` nesting goes stale the
moment the nesting changes.

**Argument.** What is wanted is small and is not a phase: one function
answering the relative specifier between two paths — the `relImport`
already in `ts/src/lower.ts` and `go/lower.go`, exposed rather than
deleted with the rest. A generator then writes
`line("import { Point } from \"" + relpath(.from, .to) + "\"")` and the
specifier follows the tree. **Open: whether that is worth a builtin at
all**, given a document can compute it with `split`, `join` and `each`,
and given `path` is already taken by the projector.

## 4. The fragment algebra is deleted, and jostraca's props are why

`.0` §4 tabled the overlap and called it a re-spelling. Two facts found
while preparing this note make the deletion cleaner than that table
suggested.

**Component props pass through to jostraca uninspected.** VERIFIED:

```
$ echo 'a: line({ src: "x" indent: "  " })' | aontu -c
{"a":{"children":[],"cmp":"Line","props":{"indent":"  ","src":"x"}}}
```

**And jostraca's `Line` honours `indent`.** From that repository's
`docs/reference-components.md`: `Line({arg: 'L', indent: '..'})` writes
`..L\n`.

Together those retire the last of
[G9 Resolution 1](../capability-review/g9-transformation.md#two-specialist-disagreements-resolved).
Reason (iii) was *"at text level the layout is baked into the leaf at
construction time and a renderer can never re-indent, which is XSLT's
whitespace failure imported wholesale"*, and
[JOSTRACA.0.md §6](JOSTRACA.0.md) left it standing as the spike's
clearest open question. It does not stand: depth crosses the seam as a
prop, and the engine on the far side applies it. `%line.at` maps to
`Line.indent`, `%blank` to `line("")`, a bare `%piece` string to
`content` — the sugar [PR #204](https://github.com/aontu-lang/aontu/pull/204) added — and `%raw`'s re-indentation to
the same `indent`. The one construct with no counterpart is `%raw`'s
`reindent: false`, which is a `Content` with the text as given.

So the algebra is not re-spelled, it is *subsumed*, and by an engine
that already implements the half aontu's fold approximates.

## 5. What jostraca must gain

Less than the instruction allows for. The data path already exists in
both ports: `ts/src/tree.ts` (305 lines) exports `cmpTree(tree)`, and
`go/tree.go` is its twin with byte-identical output, both pinned by the
drift guard that reads `src/cmp/` and fails on an unreachable
component. That repository's `docs/design/AONTU.0.md` records the
pipeline as verified end to end.

Three asks, and the first is already on their own list:

1. **`raw: true` on `Content`, or a `cmpTree` option that sets it for
   every node.** `Content` templates unconditionally, so a `$$path$$`
   sequence in aontu-generated bytes is substituted from the generate
   model. `AONTU.0.md` §5 records this, calls the fix small, and notes
   that aontu withdrew the ask when it retired the bridge. **This
   design reinstates it, and as a blocker rather than a nicety**: once
   the tree is the only road, every byte aontu produces passes through
   `Content`, so any generator emitting `$$` in a shell script, a
   makefile or a doc comment is silently corrupted.
2. **`cmpTree` promoted from convenience to supported surface.** Its
   own note ends by asking whether it belongs in the package at all,
   on the grounds that it is "a small, self-contained surface with one
   known consumer". This design makes that consumer aontu's only output
   road, which is the argument the note asks for.
3. **A prop schema, or an explicit statement that there is none.** §9.

**Not asked for: a declaration layer.** Jostraca gains no profiles, no
acronym sets, no reserved-word tables and no type expressions. That
conclusion SURVIVES §12a's first answer; the reason this section gave
for it does not. It reached it from §2 keeping the lowering in aontu,
and there is no lowering left to keep — so the seam does not stay where
this section put it. **It moves, and §12a says where: aontu knows
neither languages nor files, and the generator author knows both.**
Jostraca is unaffected either way, which is why the ask list above is
unchanged. Its `explanation.md` argues it is not a template dialect and
that components are function calls in the host language; a `Record`
component needing a language profile would be a second language inside
it, for one consumer.

**No dependency either way.** The contract stays the JSON shape and the
integration stays a pipe, which is what `AONTU.0.md` §4 records and
what ADR-023's retirement sanctioned before it was itself retired.

## 6. What dies

Being straight about this is the point of the section. Four capabilities
go, and two of them matter.

- **Loss tiers — re-homed, and this note's first proposal for them was
  wrong.** `render` reports tier 1 (a construct the target cannot
  enforce), tier 2 (a fragment where a declaration was wanted) and
  tier 3 (text, which the target cannot vet). This section first
  proposed that `lower` refuse tier 1 as `invalid-arg` at the call.
  **That is wrong, and reading the loss sites is what showed it:**
  `ts/src/lower.ts` raises tier 1 for a reserved-word rename
  (`class` → `class_`), a Go union falling back to `any`, a Go literal
  type falling back to its primitive and a Go open struct — every one
  of them a DEGRADATION THAT STILL PRODUCES VALID CODE. Refusing them
  would turn four working features into errors. **What landed instead**
  is a second function over the same pair of arguments: `lowerdecls`
  answers the nodes and `lowerloss` answers the report, so a document
  that cares can vet it and one that does not pays nothing. Tiers 2 and
  3 disappear with the fragment algebra that produced them.
- **The provenance trace — KEPT, and it gets its own verb.** DECIDED
  2026-09-13, against this section's first proposal. `RenderTrace` maps
  a rendered piece to the model node and rule that produced it, and
  there is no verb left to carry it, so `aontu trace <file>` is a new
  published surface — both ports, shared rows, its own design. It has
  to be DESIGNED rather than ported: `RenderTrace` keys an entry by
  unit and piece, and a tree has neither, so what an entry is keyed by
  is the first question. **It is the only new VERB.** It is not the only
  new surface: §11 counts three, the prop schema (§9) and jostraca's
  `cmptree-gen --check` (§5) being the other two.
- **`--coverage`'s dead-model report — gone.** `RenderCoverage.dead`
  named the shallowest model paths no render read. `reaches` and
  `trim --check` cover part of it; the render-specific part goes.
- **The unit path guards — replaced.** `render` refuses an absolute
  path, a `..` segment and a duplicate ([RENDER.0.md](RENDER.0.md) D8).
  jostraca's `cmpTree` already refuses an absolute or upward
  `Project.folder`, and `validName` refuses a `..` segment in a `File`
  or `Folder` name — a check `AONTU.0.md` §3a records adding *because*
  the data path made it reachable. Duplicate detection is the gap, and
  is a `cmpTree` ask if it matters.

One thing people expect to lose and does not: **the byte-for-byte
drift gate** (§7). The language lowering was the second until §12a's
first answer; it goes.

**One thing that must NOT go with it, and this note missed it until
review.** `aontu:render` is not only the lowering's vocabulary. Its
`template` member — `template.marker` and `template.ext`,
`aontu/render/render.aon` — is the schema `loadProfiles` vets a
`--profile` document against, and `loadProfiles` is shared by THREE
verbs: `render`, `template` and `fmt` (`ts/src/cli.ts`, and
`go/cmd/aontu/render.go` called from `template.go` and `fmt.go`).
Deleting `aontu:render` wholesale would therefore break the published
`template --profile` and `fmt --profile`, neither of which this design
otherwise touches. **The template-profile schema and its loader split
out and STAY**; only the lowering half of `aontu:render` goes, and the
loader moves out of the render module before the render module is
deleted. The `text` and `markdown` profiles stay with it — neither has
a `lowering`, and markdown's marker is
[ADR-035](../../ADR.md#adr-035--a-language-is-configured-in-its-profile-and-a-marker-may-name-its-closer)'s
own decision. P5 carries this.

## 7. The check story

`render --check <dir>` is the CI gate that holds a committed tree to
what the generators produce. It has four consumers, all of which must
land before the verb goes: `use-cases/10-data-model`,
`use-cases/15-code-generation`, `use-cases/17-lambda-handlers`, and
`test/system/rb-solar`, whose `check.sh` renders nine generators
against a committed Rails app: seven Ruby files from `RUBY_GENS`, plus
`views.aon` and `erd.mmd` under its own `%%-` marker.

**Argument.** jostraca has the parts: a memory filesystem (`mem`), a
`dryrun` mode, a `diff` mode that forces the write off, a
`write: false` mode, and a run report — with how-to pages for
generating in memory, previewing a run, reporting what a run did, and
testing a generator. The replacement is `aontu gen.aon | cmptree-gen
--check <dir>`: generate into memory, compare against the tree on disk,
exit non-zero on drift. **That is a jostraca-side tool change, and it
should be built and proved against rb-solar before a single line of
`render` is deleted.**

## 8. The trust boundary gets stronger

`render --out` is aontu's only writer, and `docs/trust.md` states that
a render reaches neither the filesystem nor a process — guarded by
`render-source-has-no-filesystem-access` in both ports. Removing the
verb removes the writer: **aontu would no longer write output files at
all.** The guard stops being a property of one subsystem and becomes a
property of the tool.

The corollary is that the four file-touching components — `fragment`
and `copyfiles` read a file, `inject` edits one that already exists,
`slot` fills a `fragment`'s marker — stop being unreachable. They were
the reason `.0` §5 said the tree's unique capability sits on the far
side of a line aontu holds. After this change the line is the pipe, and
jostraca is on the other side of it doing what it is for. That is the
half of the instruction this design is unambiguously good for.

## 9. The prop surface becomes the interface, and it is not checked

VERIFIED, and this is the finding that most needs acting on:

```
$ echo 'a: line({ src: "x" idnent: "  " })
b: file({ name: "f.ts" nosuchprop: 1 })' | aontu -c
{"a":{"children":[],"cmp":"Line","props":{"idnent":"  ","src":"x"}},
 "b":{"children":[],"cmp":"File","props":{"name":"f.ts","nosuchprop":1}}}
```

Exit 0. The component defs check the named prop and the admissible
children, and pass everything else through. Today that is tolerable
because the tree is one road of four and `aontu:code` is `close()`d
throughout. After this change **the props are the entire contract with
the engine that writes the files**, and a typo is a silently dropped
`indent`, `mode` or `exclude`.

**DECIDED 2026-09-13: check every prop.** A prop schema per component,
in `test/spec/cmp.tsv`, refusing an unknown prop at the call — the same
rule `close()` gives the vocabulary today, applied where the vocabulary
used to be. The accepted cost is the coupling: aontu tracks jostraca's
component props across a seam whose whole virtue is that neither repo
depends on the other, and a prop jostraca adds is a prop aontu must
learn or wrongly refuse. That is versionable; a silently dropped
`indent`, `mode` or `exclude` is not.

**The decision to drop the declarations makes this MORE load-bearing,
not less.** With no declaration vocabulary left, the component props
are the only typed surface anywhere in the output path.

## 10. Staging

Ordered so that nothing is deleted before its replacement is proved.
Each phase is a register row; none of them changes a status until it
lands.

**RE-CUT 2026-09-13 by §12a's answers.** The programme is now closer to
*delete four output roads down to one* than to *build new machinery*:
P2 is largely cancelled, P1 is a waypoint, and the only phase that
builds a new published surface is P6, the trace verb. The phases below
keep their numbers so the register's rows do not have to be renamed.

**P0 — jostraca (blocking).** `raw` on `Content` or the `cmpTree`
option; `cmpTree` argued into the supported surface; `cmptree-gen
--check <dir>`. Nothing on the aontu side can be deleted until
`--check` exists here.

**P1 — `lowerdecls()` and `lowerloss()`.** LANDED; `lower` was taken by
the case function, so the compound follows `copyfiles` and `listitems`.
The retarget was the one helper this section predicted: `ln` builds a
`Line` node instead of a fragment piece, and the existing lowering is
otherwise untouched. Declared in `test/spec/signature.tsv` and pinned by
`test/spec/lowerdecls.tsv`; the profiles in those rows are compact and
inline, because the rows pin the FUNCTION and `aontu-profile.tsv`
already pins the bundled profiles. The `aontu:code` declaration schema
stays, minus `%unit`, `%source` and `%import`.

*Found by the shared spec, and the Go port was right:* a type form that
is PRESENT BUT PARTIAL — `union: {prec:1 childPrec:2}`, no `open` or
`close` — read `undefined` in TypeScript and spelled it into the type
(`export type Kind = undefinedstring | numberundefined;`), where Go's
map lookup answered `""`. Reachable today through `render --profile`
with such a profile, so it is a pre-existing defect and not this
phase's. Fixed in the type-form lookup, TypeScript only, per AGENTS.md.

**P1a — the profile by name. NOW OPTIONAL.** It buys two bundled
languages in one document, which is a capability §12a's first answer
is removing anyway. Worth doing only if the migration in P4 turns out
to want it; otherwise skip straight past it and let P5 delete the
profiles. The rest of this entry is the design, if it is wanted.
`lowerdecls` takes a profile MAP, not a language name, because a
function cannot reach the engine: resolving
`"typescript"` means evaluating `aontu:render/lang/typescript`, and
`val/` importing the engine is a cycle CommonJS would answer with a
half-built module. A document therefore writes
`@"aontu:render/lang/go"` and passes `$.aontu.render.Lang`, and a
document wanting TWO bundled languages cannot, because the second
include meets the first at the same path and conflicts. The fix is the
house pattern one more time — the EVALUATED profiles inlined as data,
beside `sigdecl.ts` and `aontumodel.ts`, with a drift test that
evaluates the `.aon` sources and compares. Until then two languages in
one document means writing one profile out, which `lowerdecls-two-languages`
pins.

**P2 — `resolve()`. CANCELLED**, and §3a says why: no declarations, no
`{k:"ref"}` nodes, nothing to walk. What survives is the question in
§3a — whether the relative-specifier helper is worth a builtin — which
is a decision, not a phase, and should be taken during P4 when the
migrated generators show whether they need it.

**P3 — the prop schema (§9).** Before the corpus migrates, so the
corpus is written against a checked surface. Now the FIRST substantive
phase, P2 having gone: with the declarations going too, this is the
only typed surface the output path will have.

**P4 — migrate the corpus.** The template surface first: a `#-` header
today ends in `aontu: Code: units: emit(...)` with
`{path, lang, decls:[{k:"frag", n:[...]}]}` — VERIFIED by desugaring
`test/system/rb-solar/gen/model.rb` — and becomes `out: emit(...)` with
`file(path, [...])`, the backtick body lines landing as `content`
through [PR #204](https://github.com/aontu-lang/aontu/pull/204)'s bare-string sugar. Then the three use-cases, then
rb-solar's nine. rb-solar is the acceptance case: it is
fragment-only, so it exercises §4 and nothing of §2 or §3.

**P5 — delete, and it is now the bulk of the work.** The `render` verb
and its help, `ts/src/render.ts` and `go/render.go`, the `RenderReport`
types, the five `render_*` error codes and their hints, and the four
spec files §11 names. Then, because §12a answer 1 says so, everything
P1 was built to preserve: `lowerdecls` and `lowerloss`,
`ts/src/lower.ts` and `go/lower.go` apart from whatever §3a keeps, the
lowering half of `aontu:render` with the two lowering profiles, and
`aontu/code/code.aon` and its Go twin ENTIRELY rather than reduced.
`aontu:code` is not renamed; it is removed.

**P5 has one prerequisite inside itself, and §6 states it.**
`loadProfiles` and the `template.marker`/`template.ext` schema serve
`template --profile` and `fmt --profile`, which this design does not
touch. They come OUT of the render module and out of `aontu:render`
first, with their own rows, and only then does the rest go. A P5 that
starts by deleting `render.ts` takes two unrelated published verbs with
it.

**P6 — `aontu trace`.** The provenance verb §6 now keeps. NUMBERED last
and ORDERED before P5's deletions, which is not a contradiction: it
keeps the register's rows stable while obeying this section's own
invariant. `RenderTrace` is implemented by the renderers P5 deletes, so
running P6 after P5 would drop the capability §12a's second answer
keeps — the one thing the ordering rule above exists to prevent. Design
first, and the design is the hard part: a `RenderTrace` entry is keyed
by unit and piece, and a tree has neither.

## 11. The removal ledger

**RE-CUT 2026-09-13**: §12a's first answer moves most of the "kept"
column into "deleted", because the declarations go with the units.

**No sizes, and that is deliberate.** The first cut of this table
carried per-file line counts and per-file row counts, summed them, and
the sum was wrong: it counted the spec files' comment and blank lines
as rows, roughly doubling the spec figure. AGENTS.md puts suite-size
figures in the progress register and nowhere else, for exactly the
reason this table demonstrated — a frozen count rots, and a rotted
count in a design document is read as a requirement. What is deleted is
named instead, which is checkable at any commit.

| | fate as first proposed | fate as DECIDED |
|---|---|---|
| `ts/src/render.ts`, `go/render.go` | deleted | **deleted** |
| `ts/src/lower.ts`, `go/lower.go` | kept, re-fronted | **deleted**, bar whatever §3a keeps |
| `aontu/render/lang/typescript.aon`, `go.aon` | kept — the profiles are the lowering | **deleted**; there is nothing left to spell |
| `aontu/render/lang/text.aon`, `markdown.aon` | kept | **KEPT** — no lowering in either; they are `template`/`fmt` profiles ([ADR-035](../../ADR.md#adr-035--a-language-is-configured-in-its-profile-and-a-marker-may-name-its-closer)) |
| `aontu/render/render.aon` | kept | **SPLIT** — the lowering half goes, the `template` half stays (§6) |
| `aontu/code/code.aon` and its Go twin | reduced to the declaration schema | **deleted entirely**, both copies |
| `ts/src/val/LowerDeclsFuncVal.ts`, `go/lowerdecls.go` | — (P1, landed after the table) | **deleted**; P1 is a waypoint |
| `test/spec/render.tsv`, `aontu-code.tsv`, `aontu-profile.tsv`, `lowerdecls.tsv` | ported, reduced, kept, — | **deleted** |
| `ts/test/render.test.ts`, `go/cmd/aontu/render_test.go`, `go/render_test.go` | deleted or ported | **deleted** |
| the prop schema (P3), `aontu trace` (P6), the `--check` tool (P0) | — | **new**, both ports plus jostraca |

So **both renderers, both lowerings, the two lowering profiles, the
`aontu:code` schema in both copies and four whole spec files go**,
against three new surfaces, one of which is jostraca's. That is a much
larger deletion and a much smaller construction than this note first
planned, which is the shape §12a's first answer buys.

Net line count is not the measure and this table is not an argument
that the change is small. `ts/src/cli.ts`'s render verb, `hints.ts`,
`explain`, the MCP surface, `docs/reference-api.md`,
`docs/reference-language.md`, `docs/how-to/generate-code.md`,
`docs/trust.md` and `docs/use-cases.md` all name the verb. ADR-002
holds throughout: every line that survives keeps its coverage, and
every new line arrives with it.

## 12. What this needs before it starts

**An ADR. WRITTEN 2026-09-13 as
[ADR-038](../../ADR.md#adr-038--the-component-tree-is-the-only-output-road-and-aontu-knows-no-languages).**
It reverses G9 Resolution 1 — which chose the declaration vocabulary
over a Jostraca-shaped plan and demoted the plan to "something the
bridge builds, never something a transform writes" — and it removes a
published verb and a published vocabulary. The register's G9 rows and
`docs/reference-*.md` are downstream of that entry, not of this note.

**Read the two together in one direction only.** ADR-038 decides the
DESTINATION and nothing else; this note is the plan for reaching it,
and a plan changes as plans do. Where they disagree, the entry wins and
this note is wrong.

## 12a. The three decisions, ANSWERED 2026-09-13

Richard Rodger, asked directly. Each answer is recorded with what it
costs, because two of the three went against this note's own
recommendation and the reasons for the recommendation do not stop being
true by being overruled.

**1. Does the declaration schema survive? NO — drop it as well.**
Against §2's recommendation. `%record`, `%enum`, `%alias`, `%const`,
`%func`, `%field`, `%type` and `%check` go with `%unit`, and with them
`lowerdecls`, `lowerloss`, `ts/src/lower.ts`, `go/lower.go` and the
two lowering profiles. A generator writes target text.

*What it buys:* aontu becomes a model-and-tree language with NO
language knowledge in it at all — no acronym sets, no reserved-word
tables, no case rules, no type expressions. The seam §5 draws moves:
aontu knows neither languages nor files, and the generator author knows
both. §11 names what goes. What a profile still says is where a
language's marker, extensions and indentation live for `template` and
`fmt`, which is
[ADR-035](../../ADR.md#adr-035--a-language-is-configured-in-its-profile-and-a-marker-may-name-its-closer)
and is untouched.

*What it costs, stated plainly:* one model rendering to two languages
with each language's own casing, acronym and optionality rules. That is
`use-cases/10-data-model/xf-domain.aon` and `xf-order.aon`, and after
this there is no successor to them — a generator wanting TypeScript and
Go writes the text twice. The capability `.0` §3 measured, `idUrl:
string` against ``IDURL string `json:"id_url"` `` from one `%decls`
list, is the thing being given up. It was given up knowingly.

*What it also does:* cancels P2 (§3), makes P1a optional (§10), and
makes P3 more load-bearing (§9).

**2. Is the provenance trace worth a home? YES — it gets its own
verb.** Against §6's recommendation. `aontu trace <file>` over the
component tree, both ports, shared rows. §6 and §10 P6 carry it. It is
now the only phase in the plan that adds a published surface.

**3. How far does the prop schema go? Check EVERY prop.** As §9
recommended. The coupling to jostraca's component props is accepted:
it is versionable, and a silently dropped `indent`, `mode` or
`exclude` is not.

## 12b. Still open, and still the owner's

- **Is the relative-specifier helper worth a builtin?** §3a. Decide
  during P4, when the migrated generators show whether they need it.
- **P0 lands in `jostraca/jostraca`, not here.** The `raw: true` fix
  and `cmptree-gen --check` are changes to that repository, and nothing
  in P1a-P6 can be deleted until they ship. Who does that work, and
  when, belongs in an issue.
- **The vocabulary needs a name.** ADR-038 says `aontu:render` cannot
  keep a name built on a verb that no longer exists, and does not
  choose the replacement. It is what `template` and `fmt` vet a
  `--profile` against, so it is read by people who never generated
  anything.

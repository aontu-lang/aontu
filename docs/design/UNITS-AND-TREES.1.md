# Retiring `aontu:code`: the component tree as the only output

**Status:** PROPOSED, 2026-09-13. Design and plan; nothing below is
built. Status of every phase it names lives in the
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

| what a unit carries | today | after |
|---|---|---|
| declarations, spelled by a language profile | `%decl` inside `%unit.decls`, lowered by `render` | **`lower(decls, lang)`** — an aontu function returning component nodes |
| module identity and derived imports | `%unit.path` plus `{k:"ref", unit}`, resolved across the unit list | **`resolve(tree, lang)`** — an aontu function over the finished tree |
| the fragment algebra | `%frag`, `%line`, `%blank`, `%raw`, `%piece` | **deleted** — the components already are it |

Nothing in that table is a jostraca extension. That is the design's
main claim and §2 to §4 are the argument for it: **the capability
`aontu:code` carries is a lowering, and a lowering is a function, not
an output vocabulary.** What jostraca has to gain is separate, small,
and §5.

## 2. The lowering becomes a function

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

**Not asked for: a declaration layer.** §2 keeps the lowering in aontu,
so jostraca gains no profiles, no acronym sets, no reserved-word
tables and no type expressions. That is deliberate. Jostraca's
`explanation.md` argues it is not a template dialect and that
components are function calls in the host language; a `Record`
component needing a language profile would be a second language inside
it, for one consumer. **Argument:** the seam is right where it is —
aontu knows languages, jostraca knows files.

**No dependency either way.** The contract stays the JSON shape and the
integration stays a pipe, which is what `AONTU.0.md` §4 records and
what ADR-023's retirement sanctioned before it was itself retired.

## 6. What dies

Being straight about this is the point of the section. Four capabilities
go, and two of them matter.

- **Loss tiers — reduced, not kept.** `render` reports tier 1 (a
  construct the target cannot enforce, such as a `%check` with no
  equivalent), tier 2 (a fragment where a declaration was wanted) and
  tier 3 (text, which the target cannot vet). A function has no report
  channel. **Argument:** `lower` refuses tier 1 as `invalid-arg` at the
  call, where the argument is in hand and the site is the author's, and
  tiers 2 and 3 disappear along with the fragment algebra that produced
  them. That is a real reduction: a document can no longer ask "what
  did this generation give up".
- **The provenance trace — gone.** `RenderTrace` maps a rendered piece
  to the model node and rule that produced it. There is no verb left to
  carry it. `why` answers the neighbouring question about a value, and
  does not answer this one.
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

Two things people expect to lose and do not: **the byte-for-byte
drift gate** (§7) and **the language lowering** (§2).

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

**Argument.** A prop schema per component, in `test/spec/cmp.tsv`,
refusing an unknown prop at the call — the same rule `close()` gives the
vocabulary today, applied where the vocabulary used to be. It has to
track jostraca's components, which is a coupling the pipe does not
otherwise have; the alternative is to state in `docs/trust.md` that
props are unchecked, and mean it.

## 10. Staging

Ordered so that nothing is deleted before its replacement is proved.
Each phase is a register row; none of them changes a status until it
lands.

**P0 — jostraca (blocking).** `raw` on `Content` or the `cmpTree`
option; `cmpTree` argued into the supported surface; `cmptree-gen
--check <dir>`. Nothing on the aontu side can be deleted until
`--check` exists here.

**P1 — `lower()`.** Retarget `ln` to a `Line` node; front the existing
lowering as a function; declare it in `test/spec/signature.tsv`; port
`render.tsv`'s declaration rows to `lower` rows. Both ports, one spec.
The `aontu:code` declaration schema stays, minus `%unit`, `%source`
and `%import`.

**P2 — `resolve()`.** The whole-tree walk, the `Ref` and `Imports`
nodes, the external-reference spelling, the unresolved-reference
refusal. This is the new machinery and the phase most likely to slip.

**P3 — the prop schema (§9).** Before the corpus migrates, so the
corpus is written against a checked surface.

**P4 — migrate the corpus.** The template surface first: a `#-` header
today ends in `aontu: Code: units: emit(...)` with
`{path, lang, decls:[{k:"frag", n:[...]}]}` — VERIFIED by desugaring
`test/system/rb-solar/gen/model.rb` — and becomes `out: emit(...)` with
`file(path, [...])`, the backtick body lines landing as `content`
through [PR #204](https://github.com/aontu-lang/aontu/pull/204)'s bare-string sugar. Then the three use-cases, then
rb-solar's nine. rb-solar is the acceptance case: it is
fragment-only, so it exercises §4 and nothing of §2 or §3.

**P5 — delete.** The `render` verb and its help, `ts/src/render.ts`
(580) and `go/render.go` (764), `%unit`/`%source`/`%import` and the
fragment algebra from `aontu/code/code.aon` and its Go twin, the
`RenderReport` types, the five `render_*` error codes and their hints,
and the spec rows §11 counts. `aontu:code` is renamed to what it has
become: an argument schema for `lower`.

## 11. The removal ledger

Measured on `f057465`. Deleted, kept-but-re-fronted, and new are three
different columns and the difference matters:

| | lines | fate |
|---|---|---|
| `ts/src/render.ts` | 580 | **deleted**; the fold goes with the algebra |
| `go/render.go` | 764 | **deleted** |
| `ts/src/lower.ts` | 586 | **kept**, re-fronted as `lower`/`resolve` |
| `go/lower.go` | 822 | **kept** |
| `aontu/render/lang/*.aon` + `render.aon` | 306 | **kept** — the profiles are the lowering |
| `aontu/code/code.aon` (+ Go twin) | 140 | **reduced** to the declaration schema |
| `test/spec/render.tsv` | 189 rows | **ported** to `lower`/`resolve` rows, minus the unit-path and report rows |
| `test/spec/aontu-code.tsv` | 66 rows | **reduced** with the schema |
| `test/spec/aontu-profile.tsv` | 51 rows | **kept** |
| `ts/test/render.test.ts`, `go/cmd/aontu/render_test.go`, `go/render_test.go` | 573 | **deleted or ported** |
| `resolve()`, the prop schema, the `--check` tool | — | **new**, both ports plus jostraca |

Net line count is not the measure and this table is not an argument
that the change is small. `ts/src/cli.ts`'s render verb, `hints.ts`,
`explain`, the MCP surface, `docs/reference-api.md`,
`docs/reference-language.md`, `docs/how-to/generate-code.md`,
`docs/trust.md` and `docs/use-cases.md` all name the verb. ADR-002
holds throughout: every line that survives keeps its coverage, and
every new line arrives with it.

## 12. What this needs before it starts

**An ADR.** This reverses G9 Resolution 1 — which chose the declaration
vocabulary over a Jostraca-shaped plan and demoted the plan to
"something the bridge builds, never something a transform writes" — and
it removes a published verb and a published vocabulary. The register's
G9 rows and `docs/reference-*.md` are downstream of that entry, not of
this note.

**Three decisions that are yours, not this note's:**

1. **Does the declaration schema survive at all?** §2 keeps it as
   `lower`'s argument, which is what preserves one model rendering to
   two languages. Dropping it as well makes the change much larger in
   effect and much smaller in code: generators would write target text,
   and `xf-domain.aon`'s derive-the-type-from-the-schema case has no
   successor.
2. **Is the provenance trace worth a home?** §6 lets it go. If it is
   not expendable it needs a verb, and the cheapest one is
   `aontu trace <file>` over the tree — a new surface this design does
   not otherwise need.
3. **How far does the prop schema go?** §9's version couples aontu to
   jostraca's component props across a seam whose whole virtue is that
   neither depends on the other. Checking nothing is the other end. A
   middle — check the props aontu itself names, pass the rest with a
   documented warning — is possible and is worse than both in a way
   worth thinking about before it is chosen.

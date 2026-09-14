# Retiring `aontu:code`: the component tree as the only output

**Status:** PROPOSED, 2026-09-13. **P1 LANDED** and §10 says what it
cost. **§12's three open questions were ANSWERED by the owner and the
ADR §12 asks for is written:**
[ADR-038](../../ADR.md#adr-038--the-component-tree-is-the-only-output-road-and-aontu-knows-no-languages);
§12a records the answers, and §1, §2, §3, §5, §6, §9, §10 and §11
carry what they changed. **P0 IS DONE** — jostraca v0.38.0 answered all
three asks and two beyond the ask, so NOTHING BLOCKS: §5 and §7 say
what arrived, and the drift check arrived as an API rather than the CLI
flag §7 asked for. **§6 carries one thing the answers exposed and this
note had missed:** `aontu:render` also holds the profile schema
`template` and `fmt` vet against, so it splits rather than goes. The
rest is design and plan. Status of every phase this note names lives in
the [progress register](../capability-review/progress.md), never here.

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
`Line.indent`, `%blank` to `line("")`, a `%piece` to a `content` the
author writes, and `%raw`'s re-indentation to the same `indent`. The
one construct with no counterpart is `%raw`'s `reindent: false`, which
is a `Content` with the text as given.

**CORRECTED 2026-09-14, by testing the bytes rather than the shape.**
This paragraph said a bare `%piece` string maps to `content`, via the
sugar [PR #204](https://github.com/aontu-lang/aontu/pull/204) added,
and P4 rested on it. It is wrong twice over. A `%piece` is a span
INSIDE a line, and aontu's `line` is a leaf — pieces are concatenated
into one `src`, never children — so a bare string in a children list is
never a piece. And jostraca's `Content` writes `node.content = src`
where `Line` does `src += '\n'` first, so a file of bare strings came
out `alphabeta` rather than `alpha\nbeta`. **A bare string child is now
a LINE in both ports.** #204 was not careless: at the time
`aontu render --at` lowered a component tree and made "its `line` and
`content` children ... one line piece each", so the choice was verified
against a lowering that has since been deleted. Nothing has validated
it against bytes since, which is why P4 found it and not P3.

So the algebra is not re-spelled, it is *subsumed*, and by an engine
that already implements the half aontu's fold approximates.

## 5. What jostraca must gain

Less than the instruction allows for. The data path already exists in
both ports: `ts/src/tree.ts` (305 lines) exports `cmpTree(tree)`, and
`go/tree.go` is its twin with byte-identical output, both pinned by the
drift guard that reads `src/cmp/` and fails on an unreachable
component. That repository's `docs/design/AONTU.0.md` records the
pipeline as verified end to end.

**ANSWERED 2026-09-13, all of them, in `jostraca` v0.38.0**
([#73](https://github.com/jostraca/jostraca/pull/73)). The list below
is the ask as it was put; what arrived is under it, and one of the
three arrived in a different shape from the one asked for.

Three asks, and the first was already on their own list:

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

**What arrived, VERIFIED against `origin/main` at `ae8e282`.**

1. `raw` on `Content` and `Line`, plus `cmpTree(tree, {raw: true})` for
   a whole tree — the option sets `raw` BENEATH a node's own props, so
   a tree that wants templating in one node keeps it. It reaches
   `Content` and `Line` only; the other eight refuse a `raw` they have
   no use for.
2. `cmpTree` is a supported surface: both reference pages, an executed
   how-to, tests in both ports.
3. **The prop schema arrived as TYPES, which is more than was asked
   for.** Every component declares what it reads and the package
   exports all ten — `ProjectProps`, `FolderProps`, `FileProps`,
   `ContentProps`, `LineProps`, `SlotProps`, `InjectProps`,
   `FragmentProps`, `CopyFilesProps`, `ListItemsProps` — with `cmp()`
   generic so the declaration reaches the caller. §9 says what this
   changes for P3.

**And the drift check, which is the one that changed shape.** §7 asked
for `cmptree-gen --check <dir>`, a flag on a script. What landed is a
GENERATION MODE in the published package: `Jostraca().check(opts, root)`
and `(*J).Check(Options, root)` generate into memory, compare with the
folder, and answer a `CheckResult` — `folder`, `checked`, `drift`,
`files` — as data. Their reasoning is worth keeping: a flag on
`tools/cmptree-gen.js` made a general capability look like one
consumer's integration detail and left it outside the package. It is
proved against `test/system/rb-solar` here: sixteen files across nine
generators, byte-identical, with a hand edit and a deletion as
controls.

**Two things beyond the ask.** Two `File` components resolving to one
output path are now refused, naming the path and both components — at
the build phase, so it covers every road in. That is the duplicate
detection §6 records as the open gap, closed. And seven TS-Go
divergences were closed at the data path.

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
  drift check (§5) being the other two — and the drift check has since
  SHIPPED, as `Jostraca().check()` rather than the CLI flag §7 asked
  for.
- **The all-or-nothing write — gone.** `render --out` rendered every
  unit before writing any of it, so one refusal meant no file was
  touched, and `15-code-generation` check 8 held it. jostraca writes as
  it walks: the files before a refused one are already on disk. The
  REFUSAL survives and is still checked; the atomicity does not.
- **The loss report — gone**, with the fragment algebra that graded it.
  Every fragment was a tier-2 claim about a language the renderer could
  not parse, and `--strict` refused the tier-3 raw pieces. A component
  tree makes no such claim: jostraca writes the bytes and neither
  engine parses the target, so there is nothing left to grade.
- **`--coverage`'s dead-model report — gone.** `RenderCoverage.dead`
  named the shallowest model paths no render read. `reaches` and
  `trim --check` cover part of it; the render-specific part goes.
- **The unit path guards — replaced.** `render` refuses an absolute
  path, a `..` segment and a duplicate ([RENDER.0.md](RENDER.0.md) D8).
  jostraca's `cmpTree` already refuses an absolute or upward
  `Project.folder`, and `validName` refuses a `..` segment in a `File`
  or `Folder` name — a check `AONTU.0.md` §3a records adding *because*
  the data path made it reachable. Duplicate detection was the gap and
  is CLOSED (§5): two `File` components resolving to one output path
  are refused, naming the path and both components, at the build phase
  so it covers every road in.

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
`write: false` mode, and a run report. This section asked for
`aontu gen.aon | cmptree-gen --check <dir>` — a flag on a script — and
said it should be built and proved against rb-solar before a line of
`render` is deleted.

**SHIPPED 2026-09-13, in a better shape than the ask.** jostraca
v0.38.0 makes the drift check a GENERATION MODE in the published
package rather than a flag on a tool: `Jostraca().check(opts, root)`
and `(*J).Check(Options, root)` generate into memory, compare with the
folder, and answer a `CheckResult` — `folder`, `checked`, `drift`,
`files` — as DATA rather than as an exit code. Their reason for moving
it is the right one: a flag on `tools/cmptree-gen.js` made a general
capability look like one consumer's integration detail. It is proved
against `test/system/rb-solar` — sixteen files across nine generators,
byte-identical, with a hand edit and a deletion as controls — so the
"proved before `render` is deleted" condition is MET, and met on this
repository's own hardest case.

**What that leaves for aontu.** The four consumers still have to move
from `render --check <dir>` to a call, and a result-as-data is a
different integration from an exit code: something on this side turns
`CheckResult.drift` into the non-zero exit a `check.sh` needs. That is
P4's work, not a jostraca ask, and it is smaller than the verb it
replaces.

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

**2026-09-13: the coupling this accepted is now typed at its source,
which changes what P3 READS and not what it decides.** jostraca v0.38.0
exports a props type per component (§5), so the ten shapes have one
authoritative declaration instead of living in a page of prose that
aontu transcribes.

**It does not make the schema derivable, and an earlier draft of this
paragraph said it did.** Deriving it, or drift-testing against it, means
importing jostraca — and aontu takes no dependency in either direction,
which is the seam §5 exists to keep. `sigdecl.ts` and `aontumodel.ts`
are not the precedent they look like: both derive from aontu's OWN
sources. So the table is hand-kept in both ports with the version it was
read from recorded, and a prop jostraca adds is a prop aontu does not
learn until someone looks.

**Open, and the owner's: whether a dev-only dependency is worth it.**
A `devDependency` on jostraca in `ts/` alone would let one test compare
the table against the exported types, and the shared spec would carry
the result to Go — so the check is reachable without either port
depending on jostraca at run time. It is still a coupling where the
design says there is none. Not taken either way here: P3 landed
hand-kept, which is the choice that needs no decision.

## 10. Staging

Ordered so that nothing is deleted before its replacement is proved.
Each phase is a register row; none of them changes a status until it
lands.

**RE-CUT 2026-09-13 by §12a's answers.** The programme is now closer to
*delete four output roads down to one* than to *build new machinery*:
P2 is largely cancelled, P1 is a waypoint, and the only phase that
builds a new published surface is P6, the trace verb. The phases below
keep their numbers so the register's rows do not have to be renamed.

**AND P0 IS DONE, so nothing blocks.** The order to work is P3, P4, P6,
P5, with P1a optional between P4 and P5 if the migration wants it. P6
is numbered last and ordered before P5's deletions, for the reason its
entry gives.

**P0 — jostraca. DONE 2026-09-13**, in `jostraca` v0.38.0
([#73](https://github.com/jostraca/jostraca/pull/73)), VERIFIED against
`origin/main` at `ae8e282`. All three asks answered and two of them
beyond the ask: `raw` on `Content` and `Line` plus
`cmpTree(tree, {raw: true})`; `cmpTree` a supported surface;
`Jostraca().check(opts, root)` and `(*J).Check(Options, root)` as a
generation mode answering a `CheckResult` — NOT the `cmptree-gen
--check <dir>` flag this note asked for, and §7 says why theirs is the
better shape. Beyond the ask: a props type per component, all ten
exported (§9), and the duplicate output path refused (§6). **The
"nothing is deleted until `--check` exists" condition is met**, and met
against `test/system/rb-solar` — sixteen files, nine generators,
byte-identical, with a hand edit and a deletion as controls.

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

**P3 — the prop schema (§9). LANDED 2026-09-14.** Before the corpus
migrates, so the corpus is written against a checked surface. It was
the first substantive phase, P2 having gone. Every prop each component
declares and nothing else, refused at the call in both ports, with
seventeen rows in `test/spec/cmp.tsv`: the full set for each of the
ten, six refusals of which four prove the schema is per COMPONENT
rather than one union, and one that pins WHICH prop is named — the
first written, since Go ranges a map in no order and walks
`MapVal.keys` instead. The tables are hand-kept; §9 says why they
cannot be derived and what that leaves open.

**P4 — migrate the corpus.** The template surface first: a `#-` header
today ends in `aontu: Code: units: emit(...)` with
`{path, lang, decls:[{k:"frag", n:[...]}]}` — VERIFIED by desugaring
`test/system/rb-solar/gen/model.rb` — and becomes `out: emit(...)` with
`file(path, [...])`, the backtick body lines landing as `content`
through [PR #204](https://github.com/aontu-lang/aontu/pull/204)'s bare-string sugar. Then the three use-cases, then
rb-solar's nine. rb-solar is the acceptance case: it is
fragment-only, so it exercises §4 and nothing of §2 or §3.

**The first thing P4 found, before a generator moved.** Those backtick
body lines landed as `content`, which writes no newline, so the
migration's first output would have been one long line. §4 carries the
finding and the fix: a bare string child is a LINE in both ports. It is
the case for doing P4 against BYTES rather than against the shape of
the tree, which is what rb-solar's golden files are for.

**rb-solar IS MIGRATED, 2026-09-14**, all nine generators and all
sixteen files byte-identical through jostraca, with a hand edit and a
restore as controls; `check.sh` is 8 of 8. The byte gate is
`tools/cmptree-check.js`: the tree on stdin, jostraca required at run
time, exit 3 when it is absent so the check skips rather than fails.
**P4 IS COMPLETE, 2026-09-14**: the whole corpus is on the component
road and green — eighteen use-cases and rb-solar. `10-data-model` is
where §12a's first answer is actually paid: `xf-order.aon` writes
TypeScript and Go separately now, with Go's casing spelled
`nom(.n, pascal, $.acronyms)` in the transform where the bundled
profile's acronym set used to do it. Both byte-identical.

**`15-code-generation` is migrated too**, its eleven checks passing
with jostraca and ten of them without — the five that need bytes skip.
Its loss report and its all-or-nothing write are both recorded in §6 as
costs rather than quietly dropped. What remains is `10-data-model`,
which is the hard one because it is the DECLARATION road, and
`17-lambda-handlers`. Whether CI installs jostraca, so the byte gate
runs rather than skips, is §12b's decision and not this phase's.

**P5 — delete, and it is now the bulk of the work.** The `render` verb
and its help, `ts/src/render.ts` and `go/render.go`, the `RenderReport`
types, and the spec files §11 names. **The five `render_*` error codes
are NOT among them**: AGENTS.md makes codes append-only and
`spec-errcodes-registry` asserts set equality with each engine's
`codeClasses` table, so they stay registered with their classes, keep
their hints, and stop being raisable.

Then, because §12a answer 1 says so, everything P1 was built to
preserve: `lowerdecls` and `lowerloss`,
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

**P6 — `aontu trace`. LANDED 2026-09-14**, before P5's deletions as
the ordering rule requires. `ts/src/trace.ts` and `go/trace.go`,
`test/spec/trace.tsv`, both CLIs.

**The design question answered itself, and not the way §6 guessed.** It
said an entry is keyed by unit and piece and a tree has neither. A tree
HAS files, and `unit` was a file path all along; only `piece` has no
successor, the tree being the pieces. What specified the verb was its
own consumer: `17-lambda-handlers`' check, which asserts the rule set
by the name it was read through, each service at its own model path,
and `#0` for a table written inline at the call. An entry carries
`file`, `at`, `node` and `rule`.

**One thing had to be fixed for it to be true at all.** The bare-string
sugar builds a NEW value from the text, so a rule's stamp died there
and the trace saw one mark per file instead of one per line — thirteen
where the consumer asserts over two hundred and fifty. The mark now
rides across in both ports. That is what makes `emit`'s provenance
survive the component road.

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
| `test/spec/render.tsv`, `aontu-code.tsv`, `lowerdecls.tsv` | ported, reduced, — | **deleted** |
| `test/spec/aontu-profile.tsv` | kept | **SPLIT** — the `text`/`markdown` hash and generate rows, `shape-hash` and the `profile-*` shape rows pin what survives; the `lowering`/`case` refusals and the four TypeScript/Go rows go |
| `test/spec/errcodes.tsv` | — | **UNTOUCHED** — codes are append-only, so the five `render_*` rows stay registered with their classes |
| `ts/test/render.test.ts`, `go/cmd/aontu/render_test.go`, `go/render_test.go` | deleted or ported | **deleted** |
| the prop schema (P3), `aontu trace` (P6) | — | **new**, both ports |
| the drift check (P0) | — | **DONE** — `Jostraca().check()`, jostraca v0.38.0 |

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
- ~~**P0 lands in `jostraca/jostraca`, not here.**~~ DONE: v0.38.0,
  2026-09-13. See P0 and §5.
- **Does CI get jostraca?** P4's byte gate runs the tree through
  jostraca, because a tree checked against anything else proves nothing
  about what a user gets — which is exactly how §4's `content` sugar
  went wrong. Without it the gate SKIPS: five of eleven checks in
  `15-code-generation`, every byte check among them. **This reaches CI,
  and an earlier draft here said it did not:** `use-cases/run-all.sh`
  runs rb-solar too, and the build job runs `run-all.sh`. A `ts/` dev
  dependency buys the gate back, at the price of a coupling §5 says
  there is none of. The same question §9 asks about the prop schema,
  with more at stake.
- **The vocabulary needs a name.** ADR-038 says `aontu:render` cannot
  keep a name built on a verb that no longer exists, and does not
  choose the replacement. It is what `template` and `fmt` vet a
  `--profile` against, so it is read by people who never generated
  anything.

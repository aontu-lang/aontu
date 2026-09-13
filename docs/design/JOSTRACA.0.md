# Jostraca component primitives as aontu functions

**Status:** LANDED 2026-09-11, in both ports. The ten component
primitives, `nom` and `translate` are aontu functions in TypeScript
and Go, declared in [`test/spec/signature.tsv`](../../test/spec/signature.tsv)
and held by [`test/spec/cmp.tsv`](../../test/spec/cmp.tsv); the
register row is
[G9 phase 7](../capability-review/progress.md#g9--declarative-transformation),
and the bridge that row was opened for stays retired. The sections
below are as the spike left them on 2026-09-09 — built in TypeScript
only, with no Go port, no shared-spec row and no declaration — and
record what was built, what it proved, and what it did not. Where they
argue about a decision, the decision has since been taken.

**Origin:** Richard Rodger, 2026-09-09: *"Jostraca should be used by
aontu for code generation. The Jostraca component primitives like
Folder, File etc should be available as aontu functions (keep upper
case). This replaces the use of a conventional schema (code.units
etc). Implement a spike with only folder, file, content to investigate
the implementation. Just work in ts at first."*

**Method:** every claim marked VERIFIED was run against this tree —
`node ts/bin/aontu.js` after `make build-ts`, and the jostraca
checkout at `804014f` with the companion change on its own spike
branch. Claims about what the design *should* be are argument, and
are marked as such.

---

## 1. What this reverses, and why that is worth doing

Two decisions stand in the way, and the spike is worth building because
it bears on one of them and not the other. §8 has both;
[ADR-023](../../ADR.md#adr-023--g9-completes-at-the-renderer-the-reflection-sidecar-the-jostraca-bridge-and-string-interpolation-are-retired)
retired the Jostraca *bridge* and the spike does not reopen it, taking no
dependency and running as the pipeline hand-off that entry names. This
section is about the other one.

[G9 Resolution 1](../capability-review/g9-transformation.md#two-specialist-disagreements-resolved)
settled the output vocabulary against exactly this proposal. Two
drafts disagreed: a DECLARATION vocabulary of units, declarations,
types and fields, and a JOSTRACA-SHAPED plan of project/folder/file/
content nodes. The declaration vocabulary won, became
[`aontu:code`](../../test/spec/aontu-code.tsv), and the plan was
demoted to "a data structure the *bridge* builds in the host from the
render report — never something a transform writes". Resolution 1 also
withdrew a claimed blocking ask on the other repository: "because the
bridge builds the Project tree in the host from a render report,
Jostraca needs no data-driven `Tree(nodedef)` component."

The instruction above reverses that. The spike exists to find out
whether Resolution 1's three reasons survive contact with an
implementation, because two of the three turn on an assumption the
spike does not have to make.

Resolution 1's reasons, and what the spike found:

**(i) "At text level, and with no `join`, one output line is one plan
node: a forty-line Go struct is forty nodes carrying `kind`/`src`,
which is strictly worse to write and review than the fifty-line host
program it replaces."** This is the reason that does not survive.
It assumes the nodes are WRITTEN. As functions they are CALLED, and
`each()` already makes one node per model child, so the source scales
with the MODEL, not with the output. VERIFIED — the five-line
interface below is seven lines of aontu whatever the record's field
count, and adding a field to the model adds a line to the output and
nothing to the transform:

```
model: { name:planet fields:[id name mass] }

out: folder("src", [
  file($.model.name + ".ts", [
    content("export interface Planet {\n")
    each($.model.fields, content("  " + _ + ": string\n"))
    content("}\n")
  ])
])
```

That is [`ts/test/cmp-spike.aon`](../../ts/test/cmp-spike.aon) verbatim —
the fixture `ts/test/cmp.test.ts` asserts and the pipeline command in §9
runs, so this block, the engine and the pipeline cannot drift apart. It
is in the canonical form: `aontu fmt --check` passes on it, which is
also the small finding that a document built from component calls needs
nothing from the formatter.

Resolution 1 was written before `each` landed and reasoned about the
plan as data. Against generated nodes the argument has no purchase.

**But it has no purchase on `aontu:code` either, and that is the part
worth being straight about.** The same combinators write the landed
vocabulary: `use-cases/10-data-model/xf-domain.aon` walks a whole
record schema into TypeScript in thirty lines, and it DERIVES each
field's type from the schema rather than spelling it, so one instance
renders to TypeScript and to Go with each language's own casing and
acronym rules. The component tree cannot do that — a `Content` is
text, for one target, and knows nothing about the field it came from.
So Resolution 1 (i) is withdrawn as an argument against the component
road; it was never an argument for it.

**(ii) "At text level the vocabulary can assert almost nothing — 'this
is a string' — so D1's vetting claim evaporates, which is the whole
prize."** This one survives, and the spike does not rescue it. A
`Content` is a string and nothing in the language knows whether it is
valid TypeScript. What the spike DOES recover is the other half of the
prize, and it recovers it in a stronger form than a schema does: the
structural rules are checked AT THE CALL, with the arguments in hand
and at the site the author wrote. See §3.

**(iii) "At text level the layout is baked into the leaf at
construction time and a renderer can never re-indent, which is XSLT's
whitespace failure imported wholesale."** This one survives too, and
is the spike's clearest open question. See §6.

So the honest summary is: one of Resolution 1's three reasons is
withdrawn by the spike, and two stand. Whether the two that stand are
worth `aontu:code` is a decision, not a finding, and this note does
not make it.

## 2. What was built

All ten of jostraca's components, in
[`ts/src/val/CmpFuncVal.ts`](../../ts/src/val/CmpFuncVal.ts) and
registered in `funcMap` (`ts/src/lang.ts`):

```
project(spec?, children?)   folder(spec, children?)   file(spec, children?)
fragment(spec, children?)   slot(spec, children?)     inject(spec, children?)
listitems(spec, children?)     copyfiles(spec)
content(spec)               line(spec)
```

**The functions are LOWER CASE, like every other builtin in this
language; the node each one builds names the JOSTRACA component it
drives.** `file(...)` is aontu and `"File"` is jostraca's, and the two
spellings say which side of the seam they are on. The bridge looks a
node up by the capitalised name, so it is unchanged by this.

**TWO NAMES WERE NOT FREE, which is the first thing lower case costs.**
`copy` and `list` are already aontu builtins with settled, unrelated
meanings: `copy(v)` copies a VALUE and `list()` is the list container
kind, both declared in `test/spec/signature.tsv` and implemented in
both ports. Taking those names would either shadow landed language
surface or make one name mean two things by arity. So jostraca's `Copy`
is `copyfiles` here and its `List` is `listitems`. Capitalisation was what
had kept the two vocabularies from colliding; dropping it means the
overlap has to be settled name by name, and a future jostraca component
called `Match`, `Each` or `Pick` would need the same treatment.

**`listitems` is the one component the aontu side already subsumes.**
jostraca's `List` renders its children once per element of `item`,
binding `{item}` and `{item.path}` macros. `each($.rows, content(...))`
does the same job in the MODEL, so the repetition is finished before
the tree exists and every produced node is data a document can
reference, vet and diff — where `listitems` defers it into jostraca's
define phase behind a string macro aontu cannot see into, which is the
layer this spike exists to remove. It is implemented so the set is
complete; a generator should reach for `each` first.

`spec` is a string or a props map; the string spelling fills the one
prop the component cannot work without (`name`, `name`, `src`).
`children` is a list.

**Upper case cost the grammar nothing.** VERIFIED before anything was
written: `x: Folder(a)` already parsed as a call and failed with
`unknown_function`, so the name rule never cared about case.

**A call resolves to an ordinary map**, which is what makes this a
spike rather than a project:

```
$ printf 'x: file("a.ts", [content("k")])\n' | node ts/bin/aontu.js -c
{"x":{"children":[{"children":[],"cmp":"Content","props":{"src":"k"}}],"cmp":"File","props":{"name":"a.ts"}}}
```

Nothing downstream needed a change. `generate()` emits the tree as
JSON, `canon` renders it, references reach into it (`$.a.props.name`
is `"a.ts"`, VERIFIED), and a children list is an ordinary list — so
`each()` over model data drops straight into one. That last point is
the whole result: **the generation combinators reach the component
tree with no new machinery at all.**

`{cmp, props, children}` is deliberately jostraca's own component
surface rather than a new schema. `cmp` names an exported component,
`props` is its first argument, `children` its second — so the
vocabulary needs no entry per component and no version of its own, and
the aontu side can grow one primitive at a time.

## 3. What the call refuses, and why that is the interesting part

A schema refuses an instance. A call refuses its arguments — at the
site, with the argument in hand, before a value exists. Four rules, all
VERIFIED; the first three refuse as `invalid-arg` and the fourth is the
lattice's own:

- **The containment grammar.** A Folder holds folders and files, a
  File holds content, Content is a leaf. Unification cannot state this
  on its own: a node is a map, and every node map unifies with every
  other. `folder("a", [content("c")])` is refused.
- **The spec.** A string or a props map, and the one prop the
  component cannot work without must be a non-empty string.
  `file({mode: 493})` is refused.
- **Arity.** `content("a", "b")` is refused.
- **Closedness.** The node map is `close()`d — three keys are the
  vocabulary — so `folder("s") & {childrn: []}` is `closed`. The
  `props` map is left OPEN, because props are the component's
  business: jostraca's `File` already reads `mode` and `exclude`, and
  a component the spike does not implement reads its own.

This is the answer to the half of Resolution 1 (ii) that the spike
does recover. `aontu:code` gets its refusals from `close()` marks on
alias templates — a mechanism that has already gone wrong once in a
way nothing caught (the hash form dropped the `close()` at all 139 of
them; see the 2026-09-07 note at the head of
`test/spec/aontu-code.tsv`). A refusal in the constructor cannot be
erased by a hashing bug, because there is no schema text to erase it
from.

## 4. Children flatten, and that is forced

The finding the worked example produced. A generator's output lands in
the MIDDLE of a written list:

```
file("planet.ts", [
  content("export interface Planet {\n")
  each($.fields, content("  " + _ + ": string\n"))
  content("}\n")
])
```

so that list holds two nodes and a LIST OF NODES. A list is not a node
and could only be an error otherwise, which makes splicing the total
rule and nesting no rule at all. Children are therefore flattened to
any depth before the containment grammar is checked. Every component
system that takes children arrives here; it is recorded because it was
not obvious in advance, and because the first version of the spike
refused the worked example outright.

The same reasoning is why the second argument must BE a list rather
than accepting a bare node as a convenience: `each(...)` already
returns the list, and a one-child special case would make
`file(n, each(...))` and `file(n, [each(...)])` both legal and
different.

## 5. Not staged, and that was checked

A component call answers from its arguments alone. It has no
dependence on WHERE it sits — unlike `key()` — and it reads no bag a
sibling may still merge into — unlike `pack`/`each`. So it does
not set `staged`, and the ordinary args-done gate is correct: a
children list BUILT by one of the combinators still waits, because the
combinator residuates and the enclosing call is not `pegdone` until it
fires. VERIFIED by the worked example, whose `each()` fires inside a
`File` inside a `Folder` and lands in model order.

## 6. What the spike did not answer

**Indentation, which is Resolution 1 (iii).** Half answered, and the
half that is missing is the half the objection was about. jostraca
carries an `indent` prop on `Content`, and the props map reaches it —
VERIFIED end to end, `content({src: "y = 1\n", indent: 2})` inside a
`File` writes `  y = 1`. So a span's own indent is expressible today
with no new primitive. What is not is RE-indentation: the author picks
each span's depth at construction, and nothing can take a finished
block and shift it, which is exactly what `aontu:code`'s fragment
algebra exists for (every piece carries its `at` and the renderer owns
every prefix). A `Fragment` primitive would raise the unit from a span
to a block; it would not make the depth someone else's to change.

**`listitems` and `line` do not compose, and the cause is on the other
side.** VERIFIED end to end: `listitems` over two rows with a `content`
child substitutes (`item=alpha`, `item=beta`), and the same with a
`line` child emits `item={item.n}` twice, literally. jostraca's `Line`
calls `template(src, model)` and never forwards `props.replace`, while
`Content` does — so the per-item bindings reach one and not the other.
It reads as an oversight rather than a decision (nothing states why the
two differ). FIXED on the jostraca side rather than worked around here:
`Line` now merges `props.extra` into the model and forwards
`props.replace`, as `Content` already did. The Go port needed no
change, having delegated to `ContentP` all along — the case AGENTS.md
names, where the port pre-empts a latent TypeScript bug.

**Line termination.** jostraca's `FileOp` joins a file's content
spans with the empty string, so `content("a")` and `content("b")`
concatenate to `ab`. The examples above carry their own `\n`, which is
honest but not pleasant. `line` is jostraca's answer and landed with
the other nine (§2); the worked example predates it and still spells
its own newlines.

**Identifier case — CLOSED, see §7.** This was the spike's first
finding: the worked example wanted `Planet`, aontu had whole-string
`upper`/`lower` and no title case, and the header line was written out
rather than derived. `nom` closes it.

**`$$...$$`.** jostraca's `Content` templates unconditionally, so a
`$$path$$` in aontu-generated bytes is silently substituted from the
generate model — aontu owns the bytes right up until jostraca takes the
last edit. VERIFIED both halves: with an empty model `a $$path$$ b`
survives; with `model: {path: 'ZZZ'}` it becomes `a ZZZ b`. G9 §5 asked
for a `raw: true` on the jostraca side and
[ADR-023](../../ADR.md#adr-023--g9-completes-at-the-renderer-the-reflection-sidecar-the-jostraca-bridge-and-string-interpolation-are-retired)
withdrew the ask with the phase, so it is not outstanding — the pipeline
passes an empty model instead, which is safe for a caller who wants no
model of their own and not for one who does.

**Everything about parity.** No Go port, so: no row in
`test/spec/*.tsv` (a shared row must pass in both engines), no line in
`test/spec/signature.tsv`, no entry in `BUILTIN_FUNCS` and none in
`grammar/`. Each of those is asserted in cross-port parity and a
TS-only entry turns the Go suite red. Two consequences inside the
implementation follow from it and would go away with a declaration:
arity is refused in the call rather than by the parse-time table, and
every refusal is `invalid-arg` rather than a code of its own, because
a new code needs a row in `test/spec/errcodes.tsv` and an entry in
BOTH ports' tables. The cases live in
[`ts/test/cmp.test.ts`](../../ts/test/cmp.test.ts) and become spec
rows, probed against both CLIs, if this lands.

**Whether it replaces `aontu:code` or sits beside it.** The
instruction says replaces. The spike does not settle it: `aontu:code`
carries declaration-level constructs (`record`, `enum`, the type
algebra) that a `Content` string cannot express and that the renderer's
language profiles exist to lower, and it is landed capability in both
ports rather than a proposal. §8 has the argument.

## 7. `nom` — name transformation, the general case

Generated code is mostly names, and no two targets spell them the same
way: one model field is `user_id` in SQL, `userId` in TypeScript,
`UserID` in Go, `USER_ID` in an environment variable, `user-id` in a
URL. The gap above was the whole of aontu's answer — `upper` and
`lower` over the whole string — so the fixture wrote `Planet` out by
hand.

```
nom(s)                  every spelling, as a map
nom(s, style)           one spelling
nom(s, acronyms)        every spelling, with an acronym set
nom(s, style, acronyms) one spelling, with an acronym set
```

**The source format is not declared**, and that is what makes it the
general case rather than a family of pairwise converters. A name is
SPLIT INTO WORDS first, then rendered: VERIFIED, all nine of
`user_id`, `userId`, `UserId`, `UserID`, `USER_ID`, `user-id`,
`user.id`, `user/id` and `user id` render as `UserId` under `pascal`
and `user_id` under `snake`. N formats in and M out is one splitter
and M renderers, not N×M.

**The splitter is the renderer's own** (`splitWords`,
[`ts/src/lower.ts`](../../ts/src/lower.ts)) — the one
`aontu:profile`'s `%case` already uses to lower a declaration — so a
name derived in a document and a name the renderer derives cannot
disagree. That is the point of reusing it rather than writing a
second: `HTTPServer` is `http_server`, `XMLHttpRequest` is
`XML_HTTP_REQUEST` and `utf8String` is `utf-8-string` here for exactly
the reason they are there.

The nine styles are `caseName`'s five — `camel`, `pascal`, `snake`,
`kebab`, `upper` — and four of nom's own: `title`, `text`,
`dot`, `path`. `nom` spells them `upper` and `text` where the
profile says `screaming` and nothing; the mapping lives on nom's side,
since `%case`'s names are pinned cross-port. The split matters. `%case` is a cross-port vocabulary
pinned by the renderer's rows, so the extra styles, and the extra
separators `.` and `/`, are nom's and are folded to `_` before the
shared splitter is asked. `aontu:profile` is unchanged.

**The acronym set is an argument, and that is the design decision.**
`ledgerId` is `LedgerID` in Go and `ledgerId` in TypeScript, which is
a fact about the TARGET and not about the name — so a document
generating for two targets passes a different set to each, and the
model says nothing about either. VERIFIED: `nom("ledgerId", pascal)`
is `LedgerId`, `nom("ledgerId", pascal, [ID])` is `LedgerID`, and
Go's unexported spelling `nom("ledgerId", camel, [ID])` is
`ledgerID` — camel never treats the first word as an acronym, which is
`caseName`'s rule and therefore the renderer's.

**Two things the tests caught**, both worth recording because both are
the same mistake in different clothes — an answer that depended on
something other than the name and the style:

- **`text` read the input's spelling.** Deciding an acronym by asking
  whether `capitalise` had changed the word made
  `nom("ledgerId", human, [ID])` answer `Ledger ID` while
  `nom("ledgerID", human, [ID])` answered `Ledger id`. Membership in
  the set decides it now.
- **A name with no words was accepted by one spelling of the call and
  refused by the other.** `caseName` answers its INPUT when the split
  is empty — right for the renderer, whose names are vetted before
  they reach it — so `nom("_", pascal)` was `"_"` while `nom("_")`
  refused. It is refused in every style now.

`nom` is not staged, for the reason the component primitives are not:
it answers from its arguments alone. The map form is `close()`d — the
nine keys are the vocabulary, so `nom($.n) & {pascel: ...}` is
`closed`.

Spike scope is the same as the primitives': TypeScript only, so out of
`signature.tsv`, `BUILTIN_FUNCS` and `grammar/`, with arity and
argument shape refused in the call and every refusal `invalid-arg`.
Cases in [`ts/test/nom.test.ts`](../../ts/test/nom.test.ts).

**What it does not answer.** Nothing here knows a target's reserved
words — `nom("type", camel)` is `type`, and Go's renamer lives in
`ident()` behind a profile. A generator using `nom` rather than the
renderer gets the casing and not the reserved-word rule, which is the
narrower half of the same job.

## 7a. `translate`, and the case range on `upper`/`lower`

Two more string primitives the generation work asked for. One is a
spike function like the rest; the other is not, and the difference is
the point.

**`translate(s, from, to?)`** is `tr`: each character of `from` becomes
the one at the same position in `to`, a short `to` pads with its last
character, and an absent one deletes. Ranges (`a-z`) expand in both
sets. It exists because `rep` cannot do it: `rep` matches a REGION, so
a per-character map spelled as N calls composes wrongly — each pass
sees the previous one's output, and VERIFIED,
`rep(rep("abab","a","b"),"b","a")` is `"aaaa"` where
`translate("abab","ab","ba")` is `"baba"`. TypeScript only, like `nom`.

**The case range is different: it landed in BOTH ports**, because
`upper` and `lower` are not new. They are declared in
`test/spec/signature.tsv`, implemented in Go, and used across twenty
spec files, so extending them in TypeScript alone would have been a
silent divergence in landed behaviour — `upper("foo",0,1)` answering
`"Foo"` here and `"FOO"` there, with no gate to notice. That is the
one thing the spike's TypeScript-only posture cannot cover, so this
part was done properly: `ts/src/val/caserange.ts` and
`caseSpan`/`caseRange` in `go/func.go`, the declaration widened, both
inlined copies regenerated by `make sig`, and eighteen shared rows in
`test/spec/func.tsv` whose every expectation was obtained by running
both engines.

```
upper(s, start?, len?)
```

**`start` is a boundary, not a character.** Zero or positive it is
where the run BEGINS and the run reaches forward; negative it counts
from the end and is where the run STOPS, the character it lands on
being the first one NOT modified. One index, two directions, no second
argument to say which. `len` of -1, and the absent argument, are the
source's length; both ends clamp.

That rule was chosen by the owner over two alternatives after the
examples that specified it turned out to be mutually inconsistent —
`upper("foo",-1,2)` wanting `fOO` needs an inclusive end, and
`lower("FOOBAR",-3,-1)` wanting `fooBAR` needs an exclusive one. The
exclusive reading won, so the first is `FOo` and the last two
characters of `"foo"` are `upper("foo",1)`. Recorded because the
inclusive reading is the one a reader is likely to assume.

Two properties fall out of full Unicode case mapping rather than out
of the range, and both are pinned:

- **The result may be longer than the source.** `upper("straße",3,3)`
  is `"strASSE"`, six code points in and seven out.
- **Final sigma is decided within the run**, since a slice taken out
  of its word has no following letter to see: `lower("ΟΣ")` is `ος`
  and `lower("ΟΣ",1,1)` is `Οσ`.

Indices are CODE POINTS, so one index is one Go rune and
`upper("a😀b",2,1)` reaches the `b` in both ports.

Extending a landed function also moved something no design named: the
arity table had no phrasing for a span, so `[1,3]` rendered as "one
argument or two", a wrong count rather than an imprecise one. Both
ports gained the arm, and a row pins the message.

## 8. Where this sits against the decisions already taken

Two of them, and a premise of one that has gone stale since it was
written. The spike settles neither decision: a spike is evidence, and
the decision is the owner's. A third question the spike raised and did
not answer — what the component tree leaves `aontu:code` to do — is
[UNITS-AND-TREES.0.md](UNITS-AND-TREES.0.md).

**[ADR-023](../../ADR.md#adr-023--g9-completes-at-the-renderer-the-reflection-sidecar-the-jostraca-bridge-and-string-interpolation-are-retired)
retired the Jostraca bridge, and the spike does not reopen it.**
(That entry was itself retired on 2026-09-11, when these primitives
became a production design choice. The bridge is not what came back:
the paragraph below is still the standing position.) G9
phase 7 was one `Project`, one `generate()` call and an exact-pinned
production dependency in both ports, and ADR-023 retired it on two
grounds: the write story is `render --out` rather than a merge over
hand-edited files, and the dependency would be an 11x install growth.
The spike takes NO dependency in either direction, and the pipe in §9 is
precisely what ADR-023 sanctions in its place — *"a generation over
hand-edited files is a workflow for a tool that owns files, and the
hand-off to one is a pipeline step the user runs."* Its enforcement
clause is unmoved: the entry is superseded by a phase that adds a
file-merge DEPENDENCY, and nothing here adds one.

**One of ADR-023's two premises has since gone stale**, which is worth
recording where it can be found. The install-growth figure was
`memfs`, which jostraca imported unconditionally for a capability used
only under `mem: true` — 15 MB against 1.4 MB for aontu's whole parser
stack. jostraca has since replaced it with an in-repo port
(`ts/src/util/memfs.ts`) and now installs `shape` and nothing else:
VERIFIED, 736 KB with no transitive dependency at all. The other
premise — the regenerate-everything lifecycle — is untouched and is
the load-bearing one.

**G9 Resolution 1 and the landed renderer are what "replaces" means.**
`aontu:code` is not a proposal: phases 1, 3, 4, 6 and 9 landed on
2026-09-06, in both ports, with the profiles, the lowering, the
provenance trace and the coverage report over them. Replacing it is
reversing landed capability in two engines, and it needs an ADR that
says so rather than a spike that works. What the spike establishes is
narrower and is the thing that was actually in doubt: the
component-primitive road is buildable and cheap, and the verbosity that
was the first of Resolution 1's three reasons against it is not real.
It does not answer the other two — see §1 (ii) and (iii) — and the
first, once withdrawn, argues for neither road.

The likeliest reading of the evidence, offered as argument and not as a
finding: these are two layers rather than two candidates. `aontu:code`
is a program — declarations, a type algebra, a lowering per target
language. A component tree is a file layout plus text. A transform that
emitted `aontu:code` units INTO a `File` would use both, and neither
would have to grow the other's job.

## 9. The other half

The jostraca side is one file, `ts/src/tree.ts`, exporting
`cmpTree(tree)`: a component tree given as data in, a define-phase
callback out. It is not an interpreter — it calls the same exported
components a hand-written generator calls, in the same define phase, so
every rule the components carry holds unchanged. Its design note is
`docs/design/AONTU.0.md` in that repository, and it records that this
is the `Tree(nodedef)` component G9 Resolution 1 ruled out as
unnecessary. It cost 150 lines.

**Neither project depends on the other.** The contract is the JSON
shape, and the integration is a pipe:

```sh
aontu ts/test/cmp-spike.aon | node tools/cmptree-gen.js --at out --folder ./build
```

VERIFIED end to end against the fixture in §1: the command writes
`build/src/planet-body.ts` holding the five expected lines, and
`--dryrun` writes nothing.

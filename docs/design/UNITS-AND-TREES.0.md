# Units and trees: what `aontu:code` holds that a component tree cannot

**Status:** ANALYSIS, 2026-09-12. **Its conclusion has since been
overruled**: on 2026-09-13 the owner directed that the unit list be
retired and the component tree become the only output road, and
[UNITS-AND-TREES.1.md](UNITS-AND-TREES.1.md) is the design for that.
This note stands as the measurement `.1` builds on — what a unit
carries is unchanged by the decision to stop carrying it that way — and
`.1` §4 records where this note was too pessimistic. No phase, no
register row, nothing proposed for building. This note exists because the question below has
been asked twice and re-derived from scratch both times, and because
the answer is a layering rather than a preference. Status of the two
surfaces it compares lives in the
[progress register](../capability-review/progress.md), never here.

**Origin:** Richard Rodger, 2026-09-12: *"Why are we still using
Code.units now that we have jostraca?"*

**Method:** every claim marked VERIFIED was run against this tree at
`2af9a61` — `node ts/bin/aontu.js` after `make build-ts`, and
`go run ./cmd/aontu` from `go/` where a claim is about both ports.
Commands and their output are quoted verbatim. Claims about what the
design *should* be are argument, and are marked as such.

---

## 1. The question, and the short answer

The [component primitives](JOSTRACA.0.md) landed in both ports on
2026-09-11, and they generate code: `use-cases/15-code-generation`
carries one job written both ways, and `check.sh` holds the component
spelling to the same committed bytes the `aontu:code` spelling renders.
So the question is fair. If a tree of `folder` and `file` calls
produces the deliverable, what is the unit list still for?

**Because a `file` is a place and a `unit` is a translation unit, and
the two are not the same fact.** A file says where bytes land. A unit
says what a compiler is handed: a language, a package, a set of
declarations, and a module identity that other units resolve against.
Every part of that except the bytes is invisible to a placement tree.

Three sections of evidence follow, then the part worth taking away:
the two surfaces do not compete, they sit either side of one seam, and
nothing in the language crosses it today.

## 2. A unit's path is module identity, not placement

`%unit.path` looks like a filename and is read as one by `render --out`.
It is also read by the TypeScript lowering as the module's address, and
that makes it part of the program's meaning rather than part of its
filing. VERIFIED, on a unit that references a record in another unit:

```aon
@"aontu:code"

aontu: Code: units: [
  {
    path: "app/geo.ts"
    lang: "typescript"
    decls: [
      { k:"record" name:"Shape" fields: [
        { name:"origin" type: { k:"ref" name:"Point" unit:"lib/geo.ts" } }
      ] }
    ]
  }
]
```

```
$ aontu render --stdout u1.aon
import { Point } from "../lib/geo";

export interface Shape {
  origin: Point;
}
```

Nothing in that document spells `../lib/geo`. It is computed from the
two paths by `derivedImports` and `relImport` in `ts/src/lower.ts`, and
moving the unit one folder down rewrites the emitted bytes. VERIFIED,
the same document with `path: "app/deep/geo.ts"`:

```
import { Point } from "../../lib/geo";
```

**The same path means something different in another language, and only
the profile knows which.** VERIFIED, the same document with
`path: "app/shape.go"`, `lang: "go"`, `pkg: "app"` and the reference
retargeted to `unit: "lib/geo.go"`:

```
$ aontu render --stdout goref.aon
package app

type Shape struct {
	Origin Point `json:"origin"`
}
```

No import is derived. Go's module identity is the `package` clause, not
the path, so the Go profile reads `%unit.pkg` and ignores what
TypeScript's reads — the departure recorded as
[RENDER.0.md §9 item 22](RENDER.0.md#9-departures-from-the-texts-this-note-inherits).

A component tree carries the same placement information — `file("geo.ts")`
under `folder("lib")` is `lib/geo.ts` — and carries it as nesting that
nothing in aontu reads. No verb consumes a component tree: `ts/src/render.ts`
reaches only `$.aontu.Code.units`, and every other occurrence of `cmp` in
`render.ts` and `cli.ts` is the `cmpCodePoint` comparator. A tree leaves
the engine through `generate()` as JSON, for an engine that is not this
one.

**Argument.** That is the right division and not an oversight. The tree's
nesting is placement for a tool that will do the placing. The unit's path
is a fact the lowering must resolve *before* any bytes exist, which is
why it is a field the vocabulary states rather than a position in a
structure.

**One consequence to know about.** `{k:"ref", unit:"..."}` names a path,
not a unit, and no check requires a unit to live there. VERIFIED: a ref
to `lib/nowhere.ts` renders `import { Point } from "../lib/nowhere";`
with `verdict: ok` and exit 0. This is deliberate — the pinned row
`lower-ts-derived-imports` in `test/spec/render.tsv` references
`shared/x.ts`, which is not in its unit list, because a generated module
may legitimately import a hand-written one. The cost is that aontu cannot
tell a reference to a module it is not generating from a typo, and a tree
would not have that problem, because a sibling in a tree is a node you
can point at. It is a trade the vocabulary makes on purpose; it is not
free.

## 3. A unit's contents are language-neutral; a file's are bytes for one target

A `%decl` is a declaration — `%record`, `%enum`, `%alias`, `%const`,
`%func` — and says nothing about how any language spells it. The profile
spells it. VERIFIED, one declaration list bound to two units:

```aon
@"aontu:code"

%decls = [
  { k:"record" name:"user_account" fields: [
    { name:"id_url" type: { k:"prim" prim:"string" } }
    { name:"limit_cents" type: { k:"prim" prim:"int" } optional:true }
  ] }
]

aontu: Code: units: [
  { path:"acct.ts" lang:"typescript" decls:%decls }
  { path:"acct.go" lang:"go" pkg:"acct" decls:%decls }
]
```

```
$ aontu render two.aon --out two
wrote acct.ts
wrote acct.go
$ cat two/acct.ts
export interface UserAccount {
  idUrl: string;
  limitCents?: number;
}
$ cat two/acct.go
package acct

type UserAccount struct {
	IDURL string `json:"id_url"`
	LimitCents *int64 `json:"limit_cents,omitempty"`
}
```

One source of truth, two case styles, two acronym rules (`idUrl` against
`IDURL`), two optionality spellings (`?:` against a pointer and
`omitempty`), two type mappings (`number` against `int64`), and a struct
tag one language has and the other does not.

A `content` cannot do any of this. It is a string, produced for one
target, and it knows nothing about the field it came from. Writing the
Go spelling means writing a second tree.

This is the half of [G9 Resolution 1](../capability-review/g9-transformation.md#two-specialist-disagreements-resolved)
that survived the component spike, and [JOSTRACA.0.md §1](JOSTRACA.0.md#1-what-this-reverses-and-why-that-is-worth-doing)
says so in the same words: the spike withdrew Resolution 1's first
reason and left its second and third standing. This section is the
second one, measured.

## 4. Where the two overlap, the unit is strictly more capable

The overlap is text. A unit whose `decls` are `%frag` nodes is a file of
lines, and that is exactly what a `file` of `line` children is. The
fragment algebra and the component set are the same vocabulary twice:

| component | `aontu:code` |
|---|---|
| `folder("src")` nesting | a `/` segment in `%unit.path` |
| `line("x")` | `{k:"line", n:["x"]}`, a `%piece` |
| `line("")` | `{k:"blank"}` |
| `content("x")` | a bare string `%piece` |
| `file("a.ts", [...])` | a unit with one `%frag` decl |

Nothing on the left says anything the right cannot. Everything on the
right that is not on the left — declarations, a language, a package, a
banner from `%source`, loss tiers — is capability the left does not
have.

**The one thing the left is better at is how it reads.** VERIFIED, by
counting the two spellings of the same job in
`use-cases/15-code-generation`, non-blank and non-comment lines
(`grep -v '^[[:space:]]*$' | grep -cv '^[[:space:]]*#'`):

| file | lines | what it produces |
|---|---|---|
| `gen-ts.aon` | 31 | an `aontu:code` unit |
| `gen-ts-cmp.aon` | 23 | a component tree |

Both carry the bytes in `expected/types.ts`, and `check.sh` diffs both
against it. **Half of the eight lines is not a saving.** Four of them
are the unit's own wrapper — `path`, `lang`, `decls` and two
`{k:"frag"}` nodes — becoming one `file("types.ts", [...])` call, and
`path` and `lang` are exactly the two facts §2 and §3 just showed the
tree cannot state. The document is shorter because it says less. The
other four are real: `{k:"line", at:1, n:[...]}` becoming
`line("  " + ...)`, and `k:"blank"` becoming `line("")`. A call with a
name reads better than a map with a tag.

So the result is about **spelling**, in the one corner where the two
vocabularies overlap exactly — this generator emits `%frag` and nothing
else. Rewrite `use-cases/10-data-model/xf-domain.aon`, which derives
each field's type from the schema by `match`, and there is nothing on
the component side to rewrite it into.

**Argument.** The honest reading is that the component surface is a
better *fragment* syntax than the fragment algebra is, and says nothing
about declarations. If those four lines are worth having, the cheap way
to get them is sugar for `%piece`, not a second output vocabulary.

## 5. Where the tree is uniquely capable, aontu cannot follow

Three of the ten components touch a file that already exists, and they
are the reason to reach for a component engine at all. From
[`docs/reference-language.md`](../reference-language.md): `fragment` is
*"a file read from `from` with its `<[SLOT]>` markers filled by the
slots beneath it"*, `inject` is *"a body written between markers in a
file that already exists"*, and `copyfiles` is *"files copied verbatim
from `from`"*. A fourth, `slot`, exists only to fill a `fragment`'s
marker. Merging generated output into hand-written code is the job
Jostraca is for, and it is a job no unit list describes.

(The tenth, `listitems`, touches nothing: it is repetition, and
`each($.rows, ...)` already does it in the model, before the tree
exists. It is implemented so the set is complete.)

aontu cannot do the other three, and not by accident.
`ts/test/render.test.ts:64` is `render-source-has-no-filesystem-access`,
a guarded property of both ports and a stated one in
[`docs/trust.md`](../trust.md): a render reaches neither the filesystem
nor a process. A component that reads a file cannot be served by
`render` without moving that boundary, which is an ADR and not a patch.

So the tree's unique capability is real, is the point of the tree, and
is on the far side of a line this engine holds on purpose. That is why
the component road ends at `generate()` and a pipe, and why
`gen-ts-cmp.aon`'s header says the tree *is* the deliverable.

## 6. The seam, and that nothing crosses it today

Putting §2 to §5 together:

```
  model.aon
     │
     ▼ unify()
  the Val tree
     │
     ├──► units  ──► render ──► bytes          declarations, a language,
     │      %unit: path, lang, pkg, decls      a module identity
     │
     └──► a component tree ──► generate() ──► JSON ──► a component engine
            {cmp, props, children}                    placement, merge,
                                                      the existing file
```

**The two roads do not meet.** A unit list cannot say "merge this into
the file that is already there". A component tree cannot say "this is a
record, spell it for Go". And a document picks one: the anchor is either
`aontu: Code: units` or a tree, and a unit map is not admissible as a
component's child. VERIFIED:

```
$ echo 'out: file("a.ts", [{ k:"frag" n: ["x"] }])' | aontu -c
[aontu/invalid-arg]: Cannot children values at path $.out
```

and a component tree handed to `render` finds no units at all. VERIFIED
in both ports, on `c1.aon` holding one line —
`out: folder("src", [file("geo.ts", [line("x")])])` — same two messages,
exit 2 from each:

```
$ aontu render --stdout c1.aon
aontu: nothing was rendered: no profile was given, and the document declares none (see aontu help tasks)
aontu: --stdout needs exactly one unit, and the instance has 0; --unit names one

$ go run ./cmd/aontu render --stdout c1.aon
aontu: nothing was rendered: no profile was given, and the document declares none (see aontu help tasks)
aontu: --stdout needs exactly one unit, and the instance has 0; --unit names one
```

**Argument, and this is the part worth writing down.** The composition
that would pay is neither surface absorbing the other. It is **a `file`
whose content is a rendered unit** — the tree saying where the bytes go
and how they merge with what is already on disk, the unit saying what
the program means and which language spells it. Each layer would then
hold the fact it is good at, and the eight-line spelling gap in §4 would
stop being a reason to choose.

That was tried in the other direction once. [PR #204](https://github.com/aontu-lang/aontu/pull/204) taught `render` to
lower a *component tree* to units, and it was reverted before it landed:
lowering a tree to units re-spells the five components that need no help
and cannot serve the five that do. The direction above is the other one
— a unit reached *from inside* a tree — and it has not been tried.

## 7. What it would cost

Not a recommendation. The questions a proposal would have to answer
first, in the order they bite:

1. **Whose path?** A unit's path is load-bearing (§2) and a tree's
   nesting is the same information. Either the unit inside a `file`
   drops its `path` and the tree supplies it, or both are written and
   one is redundant. Dropping it is cleaner and breaks `%unit`'s
   `close()`.
2. **A derived import is a whole-set computation.** `relImport` needs
   the referencing unit's path and the referenced one's. Inside a tree
   the first is only known after a walk from the root, so the lowering
   would take a path-so-far it does not take today. The change is in
   `lowerHeader`'s signature, which is small; the change in what
   `render` walks is not.
3. **Who renders?** If `render` produces the bytes for the unit inside
   the `file`, the tree that leaves the engine is no longer the tree a
   component engine consumes — it has bytes in it where a node used to
   be. That is either a second output shape or a rule about when the
   substitution happens.
4. **The trust boundary does not move.** Even composed, the three
   file-touching components stay unserved by `render`. The composition
   buys declarations inside a tree; it does not buy a merge.
5. **Both ports, one spec.** Per [ADR-001](../../ADR.md#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec)
   any of this is TypeScript and Go together, pinned by shared rows,
   before it is anything.

## 8. What this note does not decide

It does not propose the composition, open a phase, or ask for one. It
records why `aontu:code` still has a `units` list after the component
primitives landed — because the unit holds two facts the tree cannot
state, a module identity a lowering resolves and declarations a profile
spells, and the tree holds one the engine will not, a merge into a file
that already exists — and it names the one shape in which all three
could be true at once, so that the next person to ask starts from §6
rather than from the beginning.

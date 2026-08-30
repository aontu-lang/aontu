# Generation forms (a) and (b): the host program, and the Jostraca path

*Design note, 2026-08-30. Companion to
[G9](../capability-review/g9-transformation.md), which is the plan for
form (c), the declarative transformation layer. This note covers the
other two forms an Aontu model can become output code — a host program
reading the model directly, and driving
[jostraca](https://github.com/jostraca/jostraca) as a library — and
argues that both are nearer than they look, with one exception that is
nearer to a defect than to a feature. Every claim marked VERIFIED was
run against the built CLIs and, for the Go embedding claims, against a
real external Go module. This note is design; status lives in the
[progress register](../capability-review/progress.md).*

## Why the two forms share one layer

The three forms are not three products. They differ only in who walks
the model:

```
  model.aon
     │
     ▼  unify()                        exists, both ports
  the Val tree                         the only complete view
     │
     ├──► generate()  ──► JSON         exists; LOSSY (§1)
     │
     └──► a reflection view            MUST BE BUILT
              │
    ┌─────────┼──────────────┐
    ▼         ▼              ▼
  (a) host  (b) Jostraca   (c) transform
   program    driver         (G9)
```

Form (c) is a transform whose source tree is that view. Form (b) is a
walk over it ending in Jostraca. Form (a) is the author writing that
walk. **There is one layer, and it is a data record rather than an
object graph** — which is what makes it portable to Go, testable by a
shared TSV mode, and re-usable by all three.

## 1. What `generate()` deletes

`generate()` is the JSON projection, and JSON cannot carry a lattice.
VERIFIED, both ports, on this document:

```aon
schema: type(close({
  id: string & re("^c-")
  port?: *8080 | integer
  tags: [&: string]
}))
```

```
$ aontu p1.aon
{}

$ aontu -c p1.aon
{"schema":{"id":re("^c-"),"port"?:*8080|integer,"tags":[&:string]}}
```

`generate()` returns **`{}`**. A `type()`-marked subtree — which is
precisely the schema, the thing a generator generates *from* — is
skipped by generation. Even unmarked, the projection would have
dropped closedness, the `?`, the default's *defaultness*, the
disjunction, the `re` residual, source key order and every site.

None of it is lost from the tree; it is simply not in the JSON. So a
code generator that consumes `generate()` output is working from the
one view that deleted everything it needs, and a generator that
consumes the `Val` tree is working from internals.

## 2. The asymmetry that decides the design

**In TypeScript it works today, as internals.** `walkBagVals` is
exported from `ts/src/utility.ts` but is *not* in the barrel export
block of `ts/src/aontu.ts`, so a host deep-imports
`aontu/dist/utility`. And a value's kind lives in two different fields
depending on class — a concrete scalar carries `.kind`, a bare kind
carries `.peg`. Nothing about that is documented and nothing pins it.

**In Go it does not work at all.** VERIFIED with an external module
(`replace github.com/aontu-lang/aontu/go => …`), compiler output
quoted verbatim:

```
./main.go:16:8: m.Keys undefined (type *aontu.MapVal has no field or
    method Keys, but does have unexported field keys)
./main.go:17:8: m.Closed undefined (… unexported field closed)
./main.go:18:8: m.Optional undefined (… unexported field optional)
```

The type assertion `v.(*aontu.MapVal)` **succeeds** — VERIFIED, prints
`MapVal assertion ok: true` — and then there is nothing on it. The
exported `Val` interface carries five exported methods (`Canon`,
`Gen`, `Unify`, `Dc`, `Nil`, `go/val.go`); `MapVal`'s `keys`, `peg`,
`closed`, `spread`, `optional` and `aliasKeys` are all lower-case
(`go/mapval.go`). What a Go host can obtain is a canon *string* it
would have to re-parse, and a `Gen()` that answers `map[]` for the
schema above.

> **Form (a) is a TypeScript-only capability in this repository today,
> and nothing says so.** That is the most important fact in this note.
> It is not a feature request; it is an ADR-001 question — does the
> parity obligation cover the *embedding surface*, or only the
> language? — and it is unanswered in
> [`ADR.md`](../../ADR.md), [`DIVERGENCE.md`](../../DIVERGENCE.md) and
> [`docs/reference-api.md`](../reference-api.md) alike.

Three answers are available and only the third is honest for long:

1. **Language only.** Say so in `DIVERGENCE.md`: the Go port evaluates
   and validates; it does not expose the model. Cheap, and it tells a
   Go embedder the truth on day one.
2. **Full parity.** Export ~12 accessors on the Go side. Freezes a
   large surface forever.
3. **The split.** Land one reflection view in both ports as an
   ADR-001 obligation, pinned byte-for-byte by a shared TSV mode, and
   simultaneously demote the raw TypeScript `Val` fields in the
   documentation to "internals, may change". Go gets parity where it
   matters, no accessor set is frozen, and TypeScript hosts stop
   writing against unpinned internals.

The third is the recommendation, and it is the same artifact G9's
transform layer needs, which is why it is not a detour.

## 3. What a reflection view must carry

The list is not speculative — it is what the JSON projection drops,
and each item is already on the tree:

| fact | why a generator needs it |
|---|---|
| kind, over the numeric tower | `int64` vs `float64` vs a decimal type |
| closedness | `additionalProperties`, a sealed struct, a strict decoder |
| optionality (key presence) | `field?:`, `*T`, `omitempty`, SQL `NULL` |
| defaults, and their rank | an initialiser, and whether it is one |
| disjunction arms | a union type, an enum, a `oneOf` |
| constraint atoms | what the target's type system *cannot* say, and so what the emitted validator must |
| entity id / relations | foreign keys, references, a graph edge |
| deprecation | a `@deprecated` tag |
| marks (`type`, `hide`) | what is schema and what is data |
| source key order | field order a reader can diff against the model |
| site | a generated line traced back to the model line |

**Three of these are already extracted, in both ports, by shipped
code.** VERIFIED over `use-cases/10-data-model/domain.aon`:

```
$ aontu jsonschema --at schema use-cases/10-data-model/domain.aon
  "additionalProperties": false                      <- closedness
  "required": [country,currency,id,ledgerId,name]    <- optionality
  "ledgerId": { "anyOf": [ … ] }                     <- disjunction arms
  "pattern" / "minimum" / "maximum" / "minLength" / "not"
                                                     <- the atoms
```

`email` and `creditLimitCents` are correctly absent from `required`.
So a reflection surface is an extension of `jsonschema`'s existing
projection, not a new subsystem — and `ts/src/jsonschema.ts`'s
`SchemaLoss` record (`{path, construct, reason}`) is the loss
discipline to reuse rather than reinvent: what a target cannot express
is **reported**, never silently dropped.

## 4. Form (a) is often the right answer, and should be said so

A host program is not the poor relation of a declarative transform. It
is the right choice whenever the target's shape is decided by the host
language anyway:

- the output is one artifact, and the emitter is fifty lines;
- the target has a real AST library (`ts-morph`, `go/ast`, JavaPoet)
  and the honest move is to use it;
- naming, imports and reserved-word escaping dominate the work — the
  "symbol provider" layer that Smithy makes explicit and that no
  template language has ever expressed well;
- the generation is one step in a pipeline the host already owns.

What makes it *native* rather than internals-poking is small and
concrete: the view in the barrel export of both ports, documented in
`docs/reference-api.md`, pinned by shared rows, addressed by the same
path syntax as `get`/`why`, and carrying sites so a generator can
attribute its output. None of that is a language change.

## 5. Form (b): the Jostraca path

Jostraca is by the same author, ships TypeScript-canonical with a Go
port in feature parity, and pins behaviour with a shared cross-stack
corpus — the same discipline as this repository. It already owns
everything Aontu should not build: file writing, folder structure,
three-way merge against the previous generate, `Slot`/`Inject`,
protected regions, exclusion, and an in-memory mode
(`{mem: true}` with `result.vol()`) that makes a generation testable
without touching disk.

**The seam is narrower than it looks.** A Jostraca model is a plain
untyped object read through its `getx` path mini-language, and Go
narrows it to `map[string]any` — so what crosses is ordinary JSON.
`Jostraca({model: aontu.generate(src)})` is close to working today.

Two things are genuinely needed:

1. **Exact numerics.** `generate()` can return `bigint` and `Decimal`
   for the exact leaves, and Jostraca's substitution `JSON.stringify`s
   an object-valued match. Either Aontu offers a plain projection that
   downgrades the exact leaves, or Jostraca learns the two types. The
   former is cleaner: the lossiness decision belongs where the type
   information is.
2. **A schema for the Jostraca model.** This is the strongest argument
   for the pairing and it should lead the story. Jostraca's model is
   untyped and its failure mode is *silent* — an unmatched `$$a.b.c$$`
   is left verbatim in the emitted file. An Aontu document that both
   computes the model and constrains it turns "a literal `$$app.name$$`
   shipped to production" into a unification error before any file is
   written.

Under [G9's D7](../capability-review/g9-transformation.md) the driver
hands Jostraca **one** `Project` containing all N outputs in a single
`generate()` call, so its merge and exclusion logic sees the whole
tree and one consistent snapshot of the model backs every file.

**Where the ownership line falls.** Aontu renders the output
vocabulary to text and never touches the filesystem — the engine
returns units and the CLI writes them, which is the rule
`aontu set` already follows for the same reason (an engine that
touched the filesystem could not be used by a server). Jostraca owns
bytes-to-disk and everything about re-running over hand-edited files.

**One caution worth inheriting rather than rediscovering.** Jostraca's
merge is explicitly not "every generated line survives": a region the
user deleted and the generator did not touch stays deleted, and a file
still holding conflict markers is skipped entirely on the next run.
A driver should surface a conflicted file as a first-class outcome
rather than swallowing it. Where Aontu only partly owns a file,
`Inject` — marker-scoped and deterministic — is the right primitive
and `merge` is not.

## 6. What must be built, and what already exists

| | exists | must be built |
|---|---|---|
| (a) | `unify`, `generate`, `get`, `why`, `jsonschema`'s projection and its loss record, sites, `canonHash` | the reflection view, in **both** ports; its barrel export; its documentation; its shared rows |
| (b) | all of Jostraca; `generate()` as a model source; in-memory generation for tests | the driver; the exact-leaf projection; the Jostraca-model schema; the dependency and release contract |

Neither list contains a language change. That is the point of this
note: **forms (a) and (b) are tooling, and they are close.** Form (c)
is where the language questions live, and they are in
[G9](../capability-review/g9-transformation.md).

## 7. Open, and owner-level

- Does ADR-001 cover the embedding surface, or only the language?
  (§2. Nothing currently says.)
- Does the Go root module take the Jostraca dependency, or does the
  driver live in a separate package inside it? A separate package is
  enough — Go's linker drops it from binaries that never import it —
  and it avoids a second module's version matrix.
- Does ADR-002's 100 % floor extend to the code that overwrites
  hand-edited files? It should; it is the last place to want a
  carve-out. That makes an injectable filesystem a design requirement
  of the driver rather than a testing convenience.

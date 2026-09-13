# GRAMMAR-SHAPE.0 — an ABNF grammar should be able to say what it builds

**Status:** an UPSTREAM REQUEST against `@tabnas/abnf` (and
`github.com/tabnas/abnf/go`), written from aontu's side. Nothing here is
a change to aontu. **ANSWERED 2026-09-12** — `@tabnas/abnf` 0.4.11
carries the request as a value annotation in an RFC 5234 comment, and
0.4.12 completes it for repetitions. §8 says what arrived and what did
not; the aontu-side review is
[GRAMMAR-SHAPE.1.md](GRAMMAR-SHAPE.1.md).

**Date:** 2026-09-10
**Against:** `@tabnas/parser` 0.9.0, `@tabnas/abnf` 0.4.7, `@tabnas/bnf`
0.1.10 — the versions both aontu ports pin.

## 1. What aontu does today

[ADR-033](../../ADR.md#adr-033--a-grammar-is-a-string-and-parsing-is-a-function)
gives aontu two builtins. `abnf(g)` compiles an RFC 5234 grammar and
answers its source; `parse(g, v)` applies one and answers the tabnas
AST. The AST is the whole of the answer:

```
{ rule: "ver", src: "v1.2.30", kids: [ … ] }
```

That is enough to make a grammar a CHECK, which is what the
one-argument `parse(g)` constraint form is for, and it is what
`aontu:system`'s `Semver` uses. It is not enough to make a grammar a
READER: a document that wants `{major: 1, minor: 2}` out of `1.2` has
to walk the tree itself.

## 2. What the engine already has

`@tabnas/parser` ships native-value builders as named refs, present and
identical in both ports:

```
@object$  @array$  @reset$  @key$  @setval$  @push$  @value$
```

They are exactly the pieces needed: allocate a container, capture a
key, assign a child under it, append a child, resolve a scalar token to
its native value. `@tabnas/json` builds real JSON with them and no
closures at all.

## 3. The gap

**No ABNF front-end path reaches them.** In both ports, the ABNF
converter emits only the tree family — `@node$`, `@capture$`,
`@bubble$`, `@fold$` — and neither package mentions a value builder
anywhere:

```bash
grep -rl '@object\$\|@array\$\|@push\$\|@setval\$\|@value\$' \
  node_modules/@tabnas/abnf/        # no match
grep -rl '@object\$\|@array\$\|@push\$\|@setval\$\|@value\$' \
  "$(go env GOMODCACHE)"/github.com/tabnas/abnf/go@v0.4.7/   # no match
```

The two attachment seams that exist do not close it either:

- `attachActions(spec, map)` binds HOST CLOSURES to `@<rule>:o|c:<mark>`.
  A closure is not something a data-only consumer can write: aontu
  documents are data, and a serialized grammar has to stay
  function-free.
- `attachActionSlots(spec, names)` injects the SLOT NAME itself as the
  ref, so the address and the ref are the same string. There is no way
  to say "at `@ver:o:maj`, run `@object$`".

The missing sibling is small — an `attachActionRefs(spec, {target:
refName})` that appends an arbitrary ref to the addressed alt's `a` —
but it is not the right layer on its own; see §5.

## 4. Why the tree is hard to shape from outside

Two properties of the emitted tree, both verified identical in the
TypeScript and Go engines (so: a property of the compiler, not a parity
break).

**4.1 A production's leading element folds into the parent.** Its node
is not pushed as a child; its own children flatten upward.

```abnf
ver = maj "." min "." pat
maj = 1*DIGIT
min = 1*DIGIT
pat = 1*DIGIT
DIGIT = %x30-39
```

Parsing `1.2.30` answers children named `["DIGIT", "min", "pat"]`. The
first field has lost its name, so it cannot be selected by rule. It is
purely positional, not an inlining rule: the same single-element
production keeps its name anywhere but first.

```abnf
pair = key "=" val          ->  kids ["ALPHA", "ALPHA", "val"]
pair = "@" key "=" val      ->  kids ["key", "val"]
```

Today's workaround is to give every production a leading terminal,
which is a grammar written around the compiler rather than around the
format.

**4.2 Every leaf is text.** `src` is the matched characters, so `"30"`
is a string. A grammar that has just proved a token is a number cannot
say so; `@value$` exists precisely to resolve a token to its native
value, and the ABNF path never reaches it.

## 5. The request

**Let the grammar author say what a production builds, in the ABNF
source, and have the converter emit the right builders against its own
generated rules.**

Only the converter can do this. It owns the desugaring: a five-rule
grammar becomes twenty-two rules, and the generated names
(`_gen1_plus_ALPHA`, `pair$step1`, `__start__`) are compiler artifacts.
Any consumer attaching builders from outside would be naming those, and
would break on the next release. That is why the missing
`attachActionRefs` is necessary but not sufficient.

A sketch of the surface, not a specification — the notation is the
front-end's to choose:

```abnf
ver = maj "." min "." pat     ; -> object
maj = 1*DIGIT                 ; -> number
min = 1*DIGIT                 ; -> number
pat = 1*DIGIT                 ; -> number

list = item *( "," item )     ; -> array
```

`; -> object` on a production would emit `@object$` on its open and
`@key$`/`@setval$` per named field; `; -> array` would emit `@array$`
plus `@push$` per repetition; `; -> number`, `; -> string` would emit
`@value$` with the token resolution. An RFC 5234 comment is a natural
carrier because it keeps the grammar a valid ABNF document that other
tools can still read.

What matters to a caller is not the notation but the guarantees:

1. **Opt-in.** A grammar with no annotation compiles exactly as it does
   today, `{rule, src, kids}` unchanged. This is a compatibility
   commitment for aontu: `parse(g, v)` rows are pinned in a shared spec
   run by both engines.
2. **Pure data.** The result must serialise through `abnfCompile` with
   no closures, because a grammar that a document can write must be a
   grammar the engine can load from data.
3. **Both ports, same bytes.** aontu holds TypeScript and Go at full
   parity ([ADR-001](../../ADR.md#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec)),
   and would need the feature in both before using it.
4. **Named fields survive.** §4.1 has to be answered for an object
   shape to mean anything — either by fixing the fold or by having the
   annotation carry the field name itself.

## 6. Reproducers

Both are runnable against the pinned versions.

```js
// The generated-rule problem (§5): five author rules, twenty-two emitted.
const { abnfConvert, markListing } = require('@tabnas/abnf')
const spec = abnfConvert(
  'pair = key "=" val\nkey = 1*ALPHA\nval = 1*DIGIT\n' +
  'ALPHA = %x61-7A\nDIGIT = %x30-39\n',
  { marks: true, builtins: true })
Object.keys(spec.rule).length        // 22
markListing(spec)                    // the addressable alts
```

```js
// The leading-fold problem (§4.1).
const { Tabnas } = require('@tabnas/parser')
const { abnf } = require('@tabnas/abnf')
const tn = new Tabnas({ plugins: [abnf] })
tn.abnf('ver = maj "." min "." pat\nmaj = 1*DIGIT\nmin = 1*DIGIT\n' +
        'pat = 1*DIGIT\nDIGIT = %x30-39\n')
tn.parse('1.2.30').kids.map((k) => k.rule)   // ['DIGIT','min','pat']
```

## 7. Until then

aontu ships the tree and shapes it in the language: `pick` projects one
field of every child, `filter` selects children by rule, `join` folds a
one-element selection back to a scalar. That is documented under
["Shaping an unannotated tree"](../reference-language.md#shaping-an-unannotated-tree)
and
pinned by the `shape-*` rows in `test/spec/abnf.tsv`, including a row
for the leading fold so the limit is recorded rather than worked around
silently. It reads acceptably and it costs a walk per field, and it
cannot answer §4.2 at all: a version part stays `"30"`, never `30`.

## 8. What arrived

`@tabnas/abnf` 0.4.11 answered §5 with a value annotation carried in a
trailing RFC 5234 comment, and 0.4.12 made a repetition collect into
one. Two words: `; @object <names…>` names one member per part that
produces a value, and `; @array` names nothing and takes every such
part as an element. Values nest, and the output is pure data.

Against the four guarantees §5 asked for: **opt-in** holds (an
unannotated grammar compiles unchanged, and every row of
[`test/spec/abnf.tsv`](../../test/spec/abnf.tsv) still passes);
**pure data** holds (an annotated grammar converts with an empty `ref`
map and no closures); **both ports** holds, pinned upstream by shared
fixtures compared byte for byte; and **named fields survive** — by the
second route the request offered, the annotation carrying the name,
rather than by fixing the fold. §4.1's fold is still there and is now a
REFUSAL naming the rule rather than a silent renaming.

§4.2 is untouched. There is no scalar annotation, so `@value$` stays
unreachable from ABNF and every leaf is still the text the rule
matched.

**None of it is reachable from aontu today**, because both ports pin
`abnf` 0.4.7 and the feature needs 0.4.12, which requires `parser`
≥ 0.9.6 and `bnf` ≥ 0.1.15. Moving the pin is measured as safe and
exposes a latent defect in `astVal` in both ports.
[GRAMMAR-SHAPE.1.md](GRAMMAR-SHAPE.1.md) is that review, and it carries
the decision aontu owes.

Until the pin moves, §7 above is still what aontu ships.

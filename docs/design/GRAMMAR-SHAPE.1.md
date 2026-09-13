# GRAMMAR-SHAPE.1 — the request came back answered, and aontu cannot take it

**Status:** **LANDED 2026-09-12.** A review of what `@tabnas/abnf`
shipped against [GRAMMAR-SHAPE.0.md](GRAMMAR-SHAPE.0.md), and then the
change it asked for: §7's D1(b) is implemented in both ports, the pins
are moved, and §10's list is done bar the scalar ask. §11 records what
shipped and the one thing the landing probe found.

**Date:** 2026-09-12
**Reviewed:** `@tabnas/abnf` 0.4.12, `@tabnas/parser` 0.9.6,
`@tabnas/bnf` 0.1.15 — the current releases.
**Against:** `@tabnas/abnf` 0.4.7, `@tabnas/parser` 0.9.0,
`@tabnas/bnf` 0.1.10 — the versions both aontu ports pin today.

## 1. The short answer

A grammar can now say what it builds, and it says it in an RFC 5234
comment:

```abnf
ver = maj "." min "." pat   ; @object maj min pat
maj = 1*DIGIT
min = 1*DIGIT
pat = 1*DIGIT
```

Parsing `1.2.30` under that grammar answers `{maj: "1", min: "2", pat:
"30"}`. Two words carry the whole feature — `@object`, which names one
member per part that produces a value, and `@array`, which names
nothing and takes every such part as an element in order. Values nest:
a member whose own rule is annotated is assigned whole.

That is the shape GRAMMAR-SHAPE.0 asked for, and it arrived with the
guarantees it asked for. **aontu cannot use any of it**, for a reason
that has nothing to do with the feature: both ports pin `abnf` 0.4.7,
the annotations landed in 0.4.11, and 0.4.12 requires `parser` ≥ 0.9.6
and `bnf` ≥ 0.1.15.

Moving the pin is safe — §5 measures it — and the moment it moves,
`parse(g, v)` on an annotated grammar is broken in both ports, in two
different ways. §6.

## 2. How this was measured

Every claim below was run, not read. `@tabnas/abnf` 0.4.12 and
`@tabnas/parser` 0.9.6 were installed beside a copy of aontu's own
`compileGrammar` and `astVal` — the engine constructed exactly as
`ts/src/grammar.ts` constructs it, with space lexing off — and the same
cases were run through the Go port with `go/grammar.go`'s construction.
Both aontu ports were then bumped in place and their full suites run.

Where a number appears it came from that run. Where a shape appears it
is the engine's own answer.

## 3. Against the four guarantees

GRAMMAR-SHAPE.0 §5 named four guarantees. All four arrived. What did
not arrive is the other half of the same section's sketch — the scalar
form, `; -> number` — and that is §4.

**1. Opt-in — met.** A grammar with no annotation compiles exactly as
it did. Every `parse-*` and `shape-*` row of
[`test/spec/abnf.tsv`](../../test/spec/abnf.tsv) passes against 0.4.12
in both ports, unchanged, including the row that pins the leading fold.

**2. Pure data — met.** `abnfConvert(src, {builtins: true})` on the
annotated `ver` grammar above emits 28 rules, an EMPTY `ref` map and
zero closures anywhere in the spec. `abnfCompile(src, {recognition:
false})` serialises it with `@object$` and `@setval$` as named refs.
A document can write a grammar that a data-only engine loads.

**3. Both ports, same bytes — met.** Every case in this note answers
identically in `@tabnas/abnf` and `github.com/tabnas/abnf/go`,
including each refusal's wording. Upstream pins it with 20 positive
rows in `test/spec/alignment-abnf-ast.tsv` and 17 refusals in
`test/spec/alignment-abnf-errors.tsv`, compared byte for byte in both
runtimes.

**4. Named fields survive — met, by naming rather than by fixing.**
GRAMMAR-SHAPE.0 §4.1 offered two ways out: fix the fold, or have the
annotation carry the field name. The second is what happened. The fold
is still there, and an annotation whose first member the fold would
erase is now REFUSED with a diagnostic naming the rule:

```
abnf: rule 'top' begins with 'inner', and 'inner' is folded into 'top'
by left-recursion elimination — which erases the value 'inner' is
annotated to build, so nothing would produce it. Put a literal before
'inner', or remove the annotation on 'inner'.
```

A silent wrong answer became a loud refusal with a fix in it. That is
the better half of the trade; §4 is the worse half.

## 4. What did not arrive

**§4.2 is untouched: every leaf is still text.** There is no scalar
annotation. `@object` emits `@object$`, `@key$` and `@setval$`;
`@array` emits `@array$` and `@push$`; `@value$` — the builder that
resolves a matched token to a native value, the one GRAMMAR-SHAPE.0
§4.2 named — appears in `@tabnas/bnf`'s builder set and in no compiled
annotated grammar, because no word names it. `"30"` is still `"30"`,
and the `ver` example above proves it: three digit runs, three strings.

**An unknown annotation word is silently ignored.** `; @objekt a b` and
`; @ARRAY` compile without a diagnostic and answer the tree. The
member-count and alternation checks are strict and their messages are
good, but they only run once the word itself has matched, so the one
mistake with no feedback is the one a reader is most likely to make. In
aontu the symptom would be a `parse()` answering `{rule, src, kids}`
where the author wrote `@object` and meant it.

**A separator inside an option leaks into its member.** `semver = maj
"." min "." pat [ "-" pre ]` with `; @object maj min pat pre` answers
`pre: "-alpha"`, not `"alpha"` — the member is the option GROUP, whose
text includes the literal, and the annotation names it `pre` anyway.
Absent, it is `""` rather than no key. Both follow from the stated
contract (a group is one element, resolved to its matched text), and
both read as surprises at the call site.

## 5. Moving the pin is safe

[ADR-033](../../ADR.md#adr-033--a-grammar-is-a-string-and-parsing-is-a-function)
pinned all three packages exactly rather than by range, and gave a
reason: `parser` 0.9.1 regressed `path($.z.x.a)` in TypeScript alone,
which ADR-001 makes fatal. **That regression is gone at 0.9.6** —
`p: path($.z.x.a)` answers `"$.z.x.a"` — and both suites are green at
the bumped versions:

| | at 0.4.7 / 0.9.0 / 0.1.10 | at 0.4.12 / 0.9.6 / 0.1.15 |
|---|---|---|
| `(cd ts && npm test)` | green | green |
| `(cd go && go test ./...)` | green | green |

No row count is quoted here on purpose: a suite-size figure belongs in
the register and nowhere else (AGENTS.md, "The capability-review
progress register"). What this table pins is the verdict, which does
not go stale when an unrelated test is added.

So the reason for the exact pin has expired. The pin itself should
stay exact — the argument that a fresh install must not cross a
behaviour line by itself is unaffected — but the version it names can
move.

## 6. What the bump exposes

`astVal` in both ports assumes the answer is a tree:

```ts
function astVal(node: any, ctx: AontuContext): Val {
  const kids: Val[] = node.kids.map(…)
  …
}
```

An annotated grammar answers a plain object or a plain array. Neither
port survives it, and they do not fail the same way:

| | TypeScript | Go |
|---|---|---|
| `parse(g, v)`, `; @object` | `[aontu/internal]`, exit 1 | `{"rule":"","src":"","kids":[]}`, **exit 0** |
| `parse(g, v)`, `; @array` | `[aontu/internal]`, exit 1 | `{"rule":"","src":"","kids":[]}`, **exit 0** |

TypeScript throws a host `TypeError` on `node.kids.map`, which
`unite()`'s catch-all turns into an `internal` nil — contained, but
reported as an engine defect rather than as anything the author can
act on. Go's type assertions are the two-value form, so a missing
`rule`, `src` and `kids` each answer their zero value and the document
generates an empty tree with exit 0. A schema reading `$.t.src` gets
`""` and passes.

That is an [ADR-001](../../ADR.md#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec)
break, and the Go half is the dangerous one: silent wrong output is the
`critical` severity in this repository's own grading.

**Nothing is broken today.** At 0.4.7 an annotation is an ordinary
comment, so an annotated grammar answers the tree and the two ports
agree. The defect is latent in the pin, which is why it belongs in a
design note rather than in `use-cases/BUGS.md`.

### 6.1 The one-argument form is unaffected

`parse(g)` — the constraint — never reaches `astVal`. It compiles, it
parses, and it answers its peer unchanged. An annotated grammar works
correctly as a constraint at 0.4.12 in both ports, and
`aontu:system`'s `Semver`, which uses only that form, still refuses
`alpha..1` and still admits `001`. Whatever §7 decides, the constraint
half needs no change.

## 7. The decision aontu owes

Three questions, and the first settles the other two.

**D1. What does `parse(g, v)` answer for an annotated grammar?**

- **(a) Refuse it.** The two-argument `parse(g, v)` rejects a grammar
  carrying an annotation, with a new code. The tree contract holds,
  `kids` is always present, one line of documentation covers it. It
  also throws away the whole capability, and a grammar that is valid
  ABNF and compiles upstream would be refused here for carrying a
  comment. **The refusal cannot sit in `abnf(g)`.** That is where a
  grammar is DECLARED, so refusing there takes the one-argument
  constraint form with it — the form §6.1 measures as unaffected — and
  it would not even be complete: `parse` compiles an inline grammar
  itself (the `parse-grammar-inline` row), so the two-argument call is
  the only place that sees every grammar it applies.
- **(b) Answer the built value.** `astVal` becomes a general host-value
  converter: object → `MapVal`, array → `ListVal`, string → `StringVal`,
  and a node bearing `rule`/`src`/`kids` keeps today's shape. Small —
  it is one recursive function in each port — and it is the answer that
  makes the feature reachable.

**The recommendation is (b), and D2 and D3 assume it.** The tree is a
value like any other; the annotation says which value. Refusing a
grammar that is valid ABNF and compiles upstream, to protect a shape
aontu chose for itself, spends the capability to keep a sentence.

**D2. The declared signature changes.** `parse(g: string, v?: string) :
map|constraint` in [`test/spec/signature.tsv`](../../test/spec/signature.tsv)
becomes `map|list|constraint`. An `@array` grammar answers a list, and
the signature gate reads that declaration.

**D3. Two documented sentences stop being true**, and both are pinned
prose rather than incidental:

- ADR-033's consequence — *"until a builtin can be named as DATA the
  output shape is not something a `.aon` file can choose"* — is now
  false. It needs an amendment, not a rewrite: the decision it records
  (a grammar is a string, parsing is a function) is unaffected.
- [`docs/reference-language.md`](../reference-language.md#shaping-an-unannotated-tree)'s
  closing sentence — *"the grammar compiler cannot yet express them as
  data"* — is false in the same way, and the "Shaping the tree" section
  around it now describes the SECOND-best way to get structure out of a
  grammar.

Both are honest statements of what was true when they were written.
Neither survives the bump.

## 8. Is it comfortable?

The question this review was asked. Measured, on the shapes an aontu
document actually wants:

| what the author writes | answer |
|---|---|
| `ver = maj "." min "." pat   ; @object maj min pat` | `{maj:"1", min:"2", pat:"30"}` |
| `ip = a "." b "." c "." d   ; @object a b c d` | `{a:"192", b:"168", c:"0", d:"1"}` |
| `ip = o "." o "." o "." o   ; @array` | `["192","168","0","1"]` |
| `doc = "@" name items   ; @object name items` with an `@array` `items` | `{name:"ab", items:["1","2","3"]}` |
| `list = "[" item *( "," item ) "]"   ; @array` with an `@object` `item` | `[{k:"a",v:"1"},{k:"b",v:"2"}]` |

**Yes, with one shape that has no spelling.** Objects, arrays and
nesting compose, and the five `shape-*` grammars of `abnf.tsv` — each
written around the compiler, each needing a `pick`/`filter`/`join` walk
per field — collapse to one annotation each. Four of the five drop
their leading terminal as written; the fifth, `dur = "P" seg *seg`,
drops it when respelled `dur = *seg`.

The shape with no spelling is a separator-delimited list of ANNOTATED
items and no surrounding literal. `list = item *( "," item )` with an
`@object` `item` is refused for the fold, and each rewrite that
compiles describes a DIFFERENT language:

| spelling | | |
|---|---|---|
| `item *( "," item )` | refused | — |
| `*item` | compiles | drops the separator |
| `*( item "," )` | compiles | requires a trailing separator |
| `[ item ] *( "," item )` | compiles | admits a leading separator |
| `"[" item *( "," item ) "]"` | compiles | needs brackets the format may not have |

So `[a=1,b=2]` is comfortable and `a=1,b=2` is not — and only when the
item is annotated. Leave the item unannotated (elements are text) and
every spelling works, which is the case `abnf.tsv`'s own list row
already covers. The rule underneath is narrow and worth stating in
whatever documentation follows: **the first part of an annotated rule
may not be a bare reference to a rule that itself builds a value.** The
fold is not fixed; it is narrowed to that one position and made loud.

What stays out of reach is §4: `"30"` is a string, and a document that
wants `30` still writes the conversion itself.

## 9. Reproducers

Runnable against `@tabnas/abnf` 0.4.12 / `@tabnas/parser` 0.9.6.

```js
// §1 and §3: the shape, and that it is pure data.
const { Tabnas } = require('@tabnas/parser')
const A = require('@tabnas/abnf')
const src = 'ver = maj "." min "." pat   ; @object maj min pat\n' +
  'maj = 1*DIGIT\nmin = 1*DIGIT\npat = 1*DIGIT\n'
const tn = new Tabnas({ space: { lex: false } })
tn.use(A.abnf)
tn.abnf(src)
tn.parse('1.2.30')                              // { maj:'1', min:'2', pat:'30' }
Object.keys(A.abnfConvert(src, { builtins: true }).ref)   // []
```

```js
// §6: what astVal does with that answer.
const node = tn.parse('1.2.30')
node.kids.map(() => 0)     // TypeError: Cannot read properties of undefined
```

```sh
# §6, the Go half: the same document, exit 0 and an empty tree.
# The module lives in go/, so the whole thing runs from there; bump
# go.mod to abnf 0.4.12 first, or 0.4.7 answers the tree as it should.
printf 'G: abnf("ver = maj \\".\\" min \\".\\" pat   ; @object maj min pat\\nmaj = 1*DIGIT\\nmin = 1*DIGIT\\npat = 1*DIGIT\\n")\nv: parse($.G, "1.2.30")\n' > /tmp/ann.aon
(cd go && go run ./cmd/aontu /tmp/ann.aon)
# "v": { "kids": [], "rule": "", "src": "" }
```

## 10. What to do

In order, and the first two are one change:

1. **Bump all three pins in both ports** — `abnf` 0.4.12, `parser`
   0.9.6, `bnf` 0.1.15 — keeping them exact and identical, and record
   in ADR-033 that the 0.9.1 regression which forced 0.9.0 is gone.
2. **Make `astVal` a value converter in both ports**, per D1(b), and
   widen the declared signature per D2. Without this the bump is a
   regression rather than a feature.
3. **Pin the new shape in `test/spec/abnf.tsv`**, both forms and the
   refusals, every expectation from a run of both engines — the
   `shape-*` rows stay as they are, since an unannotated grammar is
   unchanged.
4. **Amend ADR-033 and the reference**, per D3, and say the leading
   fold is narrowed rather than gone.
5. **Leave §4 alone.** Native scalars are a second upstream request,
   and a smaller one now that the notation exists to carry it: the gap
   is a word, not a mechanism.

## 11. What landed

All of §10 bar item 5, in one change.

**The pins moved** to `abnf` 0.4.12, `parser` 0.9.6 and `bnf` 0.1.15,
exactly and identically in both ports, and ADR-033 records that the
0.9.1 regression which forced 0.9.0 is gone.

**`astVal` became a value converter**, per D1(b), and it is smaller than
the design expected. A tree node is just the map `{rule, src, kids}`, so
it needs no case of its own: string, list and map are the whole
function, and the tree falls out of the map arm unchanged. Keys are
sorted in both ports, because Go ranges a map in no order.

**One thing the design did not foresee.** The Go host answers a built
map as its own `*tabnas.OrderedMap` while a tree node is a plain map, so
`go/grammar.go` flattens at the seam (`plain`) and `astVal` stays the
twin of the TypeScript rather than growing a host type. That is ADR-003
applied literally: aontu defines the meaning and rewrites the input.

**The signature is `map|list|constraint`**, and the reference gained
["A grammar can say what it builds"](../reference-language.md#a-grammar-can-say-what-it-builds)
with two executed examples. "Shaping the tree" is now "Shaping an
unannotated tree", which is what it always described.

**Nineteen rows** in `test/spec/abnf.tsv`, every expectation from the
parity probe and green in both ports.

### 11.1 The probe found a divergence, and it was upstream

Two candidate rows were REJECTED by the probe, which is what it is for.
A **nested `; @array`** — an `@array` rule used as a member of an
`@object`, or as an element of another `@array` — answered differently
in the two engines. Measured against the RAW engines, with no aontu in
the picture:

| shape | TypeScript | Go, before the fix |
|---|---|---|
| `@array` in `@object` | `{"a":"ab","b":["1","2"]}` | `{"a":"ab"}` |
| `@array` in `@array` | `[["1","2"],["3"]]` | `["1",["1","2"],["3"]]` |
| `@array` as an object's only member | `{"b":["1","2"]}` | `["1"]` |

An `@object` nested correctly either way; it was specifically the array.
The third row was the sharpest: Go answered the wrong KIND of value, not
a damaged map.

Filed as [tabnas/abnf#63](https://github.com/tabnas/abnf/issues/63) and
fixed the same day in
[tabnas/parser#169](https://github.com/tabnas/parser/pull/169). Go's
`@push$` re-published the grown slice header to `r.Parent`
unconditionally, overwriting whatever the parent held — the enclosing
`@object$`'s map, or the enclosing list. The write-back is now guarded
by ownership, so only a parent building into the same container receives
it. Released as `@tabnas/parser` 0.9.7 and `@tabnas/abnf` 0.4.13, which
is what the pins here require.

It was the next step out from the Go slice-versus-reference problem
`array-repetition.md` §6 records: `nodeOwner` makes a list grow at any
depth WITHIN one annotated rule, and this was a finished list that had
to be handed to an ENCLOSING builder's container.

The three shapes now carry real rows in `test/spec/abnf.tsv`, and the
ledger entry is gone — which is what that file asks for when a
divergence closes. They go red against the older pins.

### 11.2 What is still wanted

1. **The scalar annotation** — §4, unchanged, and it matters more than
   §4 said. `@value$` is reachable from `@tabnas/bnf` and named by no
   ABNF grammar, so `"30"` is a string. What makes that a hole rather
   than an inconvenience is that **aontu has no conversion either**:
   there is no `int()`, no `num()`, no coercion anywhere in the sixty-odd
   builtins, and `add($.t.min, 1)` on a parsed leaf is refused
   `func_arg` by the signature gate. So a grammar that has just proved a
   token is a number cannot hand aontu a number, and neither can the
   document afterwards. The upstream annotation is not the convenient
   route, it is the only one. It is also the smaller of the two changes
   it could be answered by, now that the notation exists to carry it —
   the alternative is a new aontu builtin that parses text the grammar
   already parsed.
2. **A diagnostic for an unknown annotation word.** `; @objekt a b`
   compiles silently and answers the tree, in both runtimes. aontu
   cannot detect it — a grammar with a misspelled annotation is a
   perfectly good grammar — so this too is upstream.

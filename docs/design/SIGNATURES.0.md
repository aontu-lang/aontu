# Design: exact typed signatures for the built-in functions

*Status: **IMPLEMENTED** (August 2026), in both ports: the
declaration is `test/spec/signature.tsv`, the parsers are
`ts/src/sig.ts` and `go/sig.go` (tabnas grammars), the gate is
`ts/src/siggate.ts` / `go/siggate.go` refusing `func_arg`, the arity
and positional tables are derived, and the docs table and both LSPs
(completion detail and signatureHelp) render from the registry.
Revised in review before implementation: the signatures are DECLARED
in the signature syntax itself, and both ports parse the one
declaration — the first draft's hand-authored registry per port is
among the rejected designs. Deltas measured while implementing are
recorded beside the text they correct, the tower document's
convention. Convention as in PATHS.0.md: the reasoning is the
record.*

## The problem

The language knows how many arguments each builtin takes, and nothing
else about them. The whole recorded shape of the call surface is:

- `funcArity` — a `[min, max]` written-argument count per name, one
  table per port (`ts/src/lang.ts`, `go/func.go`), asserted equal by
  eye and comment only.
- `POSITIONAL_ARG_FUNCS` — a second table naming which comma groups
  are positions rather than one argument list.
- Everything past the count is ad-hoc: each function's `prepare` and
  `resolve` hand-roll their own argument checks, in each port, with
  their own refusal codes (`pack_data`, `pack_key`, `each_data`,
  `filter_data`, `path_address`, a bare `invalid-arg` for the rest).
- The docs carry hand-written headers (`pack(d, t)`, `refer(t?)`) in
  the reference's functions table; nothing gates them against the
  engine. The LSP completes names with the generic detail "Aontu
  built-in function" and offers no signature help. The drift gates
  that exist compare NAME SETS only.

Three costs, all paid recently:

1. **Validation is late and vague.** A wrong-shaped argument travels
   until some deep site refuses — often as `invalid-arg` with no
   "which argument" and no "expected what" — or does not refuse at
   all: the `re`-pattern parity gap found while landing ADR-016 (TS
   refused a path value as pattern text, Go accepted it) existed
   precisely because "the pattern is string text" lived in two
   hand-rolled checks instead of one table.
2. **Error messages cannot say what was expected.** A hint can only
   render what is recorded, and nothing records that `pack`'s first
   argument is a bag or that `must`'s second is the author's message.
3. **Every consumer re-states the shape.** Two ports, the docs table,
   the LSP, the arity tables: five places to agree, none checked
   against each other beyond names and counts.

## What a signature must be able to say

A TypeScript-style signature is the right *surface* — it is what
users read fluently — but plain pseudo-TypeScript misleads here,
because several argument positions are not call-by-value. The
language has a small closed set of argument MODES:

- **value** — driven and read as a value. Most arguments
  (`upper(s)`, `min(n)`, both operands of the arithmetic family).
- **capture** — read as a spelling, never driven: `path(p)`, the one
  non-strict position (PATHS.0.md).
- **template** — not consumed at the call, cloned per destination:
  `pack(d, t)`'s `t`, `each`'s `t`, `refer(t)`'s flowed type.
- **trial** — met speculatively, the meet discarded: `filter(d, c)`'s
  `c`, `must(c, msg)`'s check, `match`'s patterns.
- **projector** — a key name applied to each child: `unique(k)`,
  `pick(bag, k)`'s `k`.
- **text** — literal text read for its content, not constrained
  against the value: `re`'s pattern, `must`'s message.

`path(p: string): Path` in honest TypeScript is simply wrong — `p` is
not a string value and is never evaluated. `path(capture p?: path)`
is exact. The mode vocabulary is the design's core; the types are the
language's own words (kind names, `any`, unions like `map|list`), not
a new type language.

## The design

**The signatures are declared, in the syntax itself.** One
declaration, written in the signature syntax — the declaration is the
SOURCE, not a rendering of something recorded elsewhere. It lives
where shared behaviour lives, `test/spec/signature.tsv`: one row per
builtin, the row's body the declaration line, so the file is at once
the language artifact and the parity fixture (ADR-001's one file,
two readers).

**Both ports read and parse it, with a custom tabnas grammar.** The
signature language is a small grammar built on the `@tabnas` stack
the aontu grammar itself extends — a jsonic-based grammar in each
port (`@tabnas/jsonic`, `github.com/tabnas/jsonic/go`), the pair
whose shared behaviour the house already knows how to pin. Neither
port authors a table: each carries a build-time-inlined copy of the
declaration text (the committed-dist pattern; the suite asserts the
copies are byte-identical with the spec file) and parses it at
initialisation into the registry — the parsed form the checker and
the message builder consume:

    line = name '(' [ arg {',' arg} ] ')' ':' type
    arg  = [mode] name ['?'] ':' type
         | '...' name ':' ( type | '(' [mode] type {',' [mode] type} ')' )
    type = word {'|' word}
    mode = 'capture' | 'template' | 'trial' | 'projector' | 'text'

    type ArgSig = {                       // the PARSED form
      name: string, mode: ArgMode, type: string,
      opt?: boolean, rest?: boolean, group?: GroupSig[],
    }

`funcArity` and `POSITIONAL_ARG_FUNCS` become derivable from the
parse, and the parsed registry is the ONE input to the runtime
signature checker and the error-message builder below. (Implemented:
a rest slot with a plain type is `neq`'s spelling, so the grammar
gained that arm and the parsed form a `group` field; the arity
derivation counts required slots plus a rest slot's group size, and
the positional set derives as "two or more slots, excluding the
`constraint` results" — the constraint atoms expand their own comma
group in `atomArgs`, deliberately before the settled check, which is
why `must` is not positional and must not become so.)
Representative declaration lines:

    upper(s: string) : string
    add(a: number, b: number) : number
    path(capture p?: path) : path
    pack(d: map|list, template t: any) : map
    each(d: map|list, template t?: any) : list
    filter(d: map|list, trial c: any) : map|list
    must(trial c: any, text msg: string) : constraint
    unique(projector k?: string) : constraint
    re(text p: string) : constraint
    refer(template t?: any) : constraint
    key(up?: integer) : string
    join(d: map|list, sep?: string) : string

The rendering rules: `value` mode is unmarked; the other five modes
prefix the name, the way TypeScript's own parameter modifiers read;
`?` and `...` keep their TypeScript meanings; `:` after the close
paren is the result. `constraint` is the result word for residuals
(the meet's outcome depends on the peer); `any` is the honest type
where the function is a wrapper. `match` is the one signature needing
a repeat group — `match(s: any, ...pr: (trial any, any), dflt?: any)`
— and the full declaration is the implementation's first deliverable, one
row per name in `funcArity` today.

**Validation reads the registry.** One argument gate, in each port's
shared function machinery (`FuncBaseVal` / `func.go`), runs before a
builtin's own logic: written arity (as today, from the registry), and
for `value`-mode arguments whose declared type is scalar-kind words,
the driven Val's kind against the declared type — `number` admitting
every numeric leaf and `string` admitting a path, the subsumption
walk. A failure refuses with a NEW code, `func_arg`, whose message
renders from the registry: the signature line, the offending position
by name, what arrived. The specific codes that carry more meaning
than a shape mismatch (`pack_key`, `path_address`, …) STAY — the
registry supplies the signature line into their hints, it does not
flatten the error taxonomy. (Implemented: the MODES do the scoping —
`projector`, `template`, `trial`, `text` and `capture` slots are
never gate-read, container words are the bespoke bag codes' to judge,
and the gate refuses only what it positively identifies: a
wrong-kinded concrete scalar, a map, a list, or a kind marker in a
value slot — a preference or residual passes through, which is what
keeps arith's unpref reading working. `key()` is the one named skip:
its level meaning lives in `key_level`. The gate took over fifteen
spec rows that were bare `invalid-arg` — the case family, the
arithmetic operands, join's separator.) Before: `invalid-arg`.
After:

    pack(d: map|list, template t: any)
      argument 1 (`d`): a number has no children to pack

**Docs and LSP render, never restate.** The reference's functions
table gets its signature column from the same renderer; the docs test
gains a drift check asserting each row equals the registry's
rendering, the way snippet enforcement already works. The LSP's
completion detail becomes the rendered signature and `signatureHelp`
is served from the registry; the LSP tests compare against the same
renderer. Nobody writes a signature by hand anywhere, in either port.

**The parity gate is the shared spec, per ADR-001.** The declaration
ROUND-TRIPS: `render(parse(line))` is the line, normalised. Each
port's suite parses every `signature.tsv` row with its grammar,
re-renders, and compares — the same machinery that pins unification
behaviour pins the two parsers to each other, and a grammar edit in
one port fails the other's suite until it lands there too. With one
declaration file and two parsers of it, drift between the ports'
registries is not merely tested against: it has no place to live —
which is what the hand-authored tables could never offer.

## Rejected designs

**A hand-authored registry per port** — this document's own first
draft: a TS object literal in `lang.ts`, mirrored by hand in
`go/func.go`, pinned only by a rendered comparison. Mirrored
literals are `funcArity`'s drift surface with more fields; the
review that accepted the mode vocabulary rejected the mirroring, and
the declaration-plus-grammar above replaced it.

**Actual TypeScript declarations as the source** (a `.d.ts`, or
types alone). Cannot express modes — the one thing the signatures
must say — and cannot drive the Go port, the arity gate, or hint
rendering without a parser for a language whose semantics
(call-by-value) are the wrong ones.

**Deriving signatures from the code.** The hand-rolled checks are
what is being specified; reflecting over them re-states today's drift
with extra steps, and the Go/TS check pair that disagrees (the
`re`-pattern gap) derives two different signatures.

**A JSON-schema-like description per function.** Heavier than the
need, a vocabulary users never see, and it still needs the mode
words, which do all the work.

**Dependent shapes** (typing `pack`'s `t` by `d`, arity varying by
argument kind). Out of scope: modes plus kind words cover the errors
users actually hit, and nothing in the engine can consume the extra
precision yet.

## Not done here, deliberately

- **No user-defined functions.** The registry describes the fixed
  builtin set; it neither enables nor anticipates user functions.
- **No overloads.** One signature per name; alternatives are unions
  in the type position. A function that needs two signatures is two
  functions, which is the existing house rule (`join` absorbing
  `concat` rather than overloading).
- **Signatures are metadata, not Vals.** The kinds (`path()`,
  `map()`, `list()`) are in the lattice; a signature is a fact about
  a CALL, lives beside the grammar, and never unifies with anything.
- **Hint prose stays authored.** The registry contributes the
  signature line and the position phrase; the explanatory sentences
  in `hints.ts`/`hints.go` remain written by hand, because the good
  ones explain intent, not shape.

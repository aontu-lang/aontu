# `aontu render` — from `emit` pieces to bytes, and the end of G9

**Status:** PROPOSED, 2026-09-05. Design and plan; nothing below is
built. This note is the plan for the remaining phases of
[G9](../capability-review/g9-transformation.md), with `render` as the
spine. Where it changes what the gap document's phase text says, that
document carries the change as its fourth amendment, and the
[progress register](../capability-review/progress.md) points here for
the phases it names. Status lives in the register, never here.

**Origin:** Richard Rodger, 2026-09-05: *"Prepare a plan for the
implementation of aontu render (using emit() etc), so that we can
complete the capability programme."*

**Method:** every claim about what the engine does *today* was checked
against the tree at `3669dfab` (`aontu@0.57.0` plus #148–#152) and is
marked VERIFIED with what was read or run. Decisions already taken in
G9 [§1](../capability-review/g9-transformation.md#1-the-output-vocabulary--aontucode),
[§3](../capability-review/g9-transformation.md#3-the-renderer-and-the-language-profiles)
and [§6](../capability-review/g9-transformation.md#6-the-manifest-d5-iv-d7),
in [EMIT.0.md](EMIT.0.md) and in [TEMPLATE.0.md](TEMPLATE.0.md) are
inherited and not re-argued; where this note departs from one it says
so, with the reason, in [§3](#3-decisions) and lists every departure in
[§9](#9-departures-from-the-texts-this-note-inherits). Claims about
what `render` *should* do are argument, and are marked as such.

---

## 1. Where the programme stands

The register's G9 rows at `3669dfab`, re-read for this note:

| Phase | Status | What exists | What does not |
|---|---|---|---|
| 0 — gating defects | PARTIAL | §58, §59, §61, §62 fixed | §57, §60, §63, §79 open |
| 1 — the vocabulary `@"aontu:code"` | NOT STARTED | the text, re-verified implementable | the `aontu:` resolver leg (MODELS M0), the fragment nodes, the bundling |
| 2 — `join` | LANDED | 47 rows | — |
| 3 — `form` | NOT STARTED | — | the order-preserving map |
| 4 — renderer and profiles | PARTIAL | `esc`, `usc`, `rep`, `split` (99 rows) | the fold, the profiles, the fragment entry point |
| 5 — reflection sidecar | NOT STARTED | `jsonschema`'s projection covers three of its facts | the view, in both ports |
| 6 — `emit`, manifest, verb | PARTIAL | `emit(select, table)` (45 rows, six codes) | `replace`/`esc` in a template, provenance, the manifest, **the verb** |
| 7 — Jostraca bridge | NOT STARTED | — | everything, and two asks on the other repository |
| 8 — interpolation | NOT STARTED | — | deferred behind evidence |
| (unnumbered) — the template surface | no row | the expansion verified against twelve handlers | `//-` desugar and resugar; it cannot exist before `emit` did |

Everything G9 was opened for is downstream of one missing verb. VERIFIED
against `ts/src/cli.ts` and `go/cmd/aontu/main.go`: the verb list is
`vet`, `subsume`, `breaking`, `trim`, `relations`, `reaches`, `view`,
`jsonschema`, `hash`, `mod`, `get`, `why`, `set`, `agentsmd`, `fmt`,
`lsp`, `mcp`; there is no `render` and no `init`. VERIFIED against
`ts/src/std.ts` and `go/std.go`: the bundled sources are `std/system`
and `std/view`, served from one table in each port; no `aontu:` name
resolves anywhere yet, so `@"aontu:code"` cannot be served until the
resolver has that leg. VERIFIED against `test/spec/gen-emit.tsv` and
the reference's [Transforming: `emit`](../reference-language.md#transforming-emit):
`emit` returns a flat list whose pieces are whatever the bodies hold —
strings in every documented example (`["listen(srv:a)", "serve(/a)"]`),
maps where a body writes one. VERIFIED against
`use-cases/15-code-generation/`: the three generators evaluate to ONE
string each (`file: join(pick($.units, text), "\n\n") + "\n"`), and
`check.sh` unwraps that string with Python and writes the bytes itself.
That script is the `render` verb, written by hand in the one place the
repository needed it.

**What `render` closes.** With the verb, phase 6 is done, phase 4 is
done, phase 1 has a consumer, the use case stops carrying its own
renderer, acceptance case 1 (a target the declaration vocabulary does
not fit) becomes runnable, and the template surface has something to
desugar into. Phases 5, 7 and 8 are not on that path, and
[§7](#7-the-rest-of-the-programme) says what to do with each.

## 2. The pipeline

```
  model.aon                       the model, and the transform that reads it
     │
     ▼  unify()                   exists, both ports
  the Val tree
     │
     ▼  generate()                exists; the JSON projection
  an instance of aontu:code       {code: {units: [{path, lang, decls: [...]}]}}
     │
     ▼  vet against @"aontu:code" exists as a mechanism (vet); the vocabulary is P1
     │
     ▼  render(instance, profiles)   P3, P5 — a pure fold, no I/O
  RenderReport {verdict, units: [{path, lang, text}], lossy, provenance}
     │
     ├──► --stdout                 one unit's bytes
     ├──► --out <dir>              all units or nothing, confined below <dir>
     └──► --check                  compare with what is on disk; exit 1 on drift
```

Two hand-offs, two owners. **The engine never writes** — `render` and
`renderValue` return units, and the CLI writes them — which is the rule
`aontu set` and `aontu view --out` already follow (an engine that
touched the filesystem could not be used by a server, and the MCP tool
over `render` must return bytes it cannot place). And `render` consumes
`generate()` output, not the Val tree, for the reason G9 §3 gives and
GENERATION-FORMS.0.md §2 documents: a Go host cannot read one child of
a `MapVal`, so a Val-tree renderer would be TypeScript-only on the day
it landed.

`emit` sits *inside* the model evaluation, not in the pipeline after
it: a transform's `decls` hold an `emit(...)` and the unifier settles
it like any other value. That is what makes the hand-off simple — by
the time `render` runs, every dispatch has fired and every relative
reference has been bound (EMIT.0.md, "What phase 6 established").

## 3. Decisions

### D1. `render` consumes an `aontu:code` instance, at `$`

`aontu render <file>` evaluates the document, takes the value at
`--at` (default `$`, never `$.code` — G9's spelling rule 5 and
[ADR-010](../../ADR.md#adr-010--no-magic-keys-or-paths-the-tree-at-all-levels-is-user-space)),
vets it against the bundled vocabulary, and folds `code.units`. The
document need not include `@"aontu:code"` itself — the vet is the
verb's, exactly as `aontu vet code.aon result.aon` would run it — but a
document that does include it gets the same check at edit time from
the LSP, which is the point of the vocabulary being an ordinary schema.

A bare piece list is not an instance. The shortest renderable document
is one unit:

```aon
code: { units: [ { path: "out.py", lang: "python",
                   decls: [ { k: "frag", of: emit($.model, %rules) } ] } ] }
```

That is one line of scaffolding and it buys a path, a language and a
vet, so the verb has no second entry point for "just these lines".
`aontu render --stdout` on a one-unit instance prints the bytes and
nothing else, which is the quick path.

### D2. A piece may be a bare string, and a bare string is a line at depth 0

G9's second amendment defines the fragment algebra's pieces as records:

```aon
%inline = string & re("^[^\n\r]*$") | %ref
%line =   close({ k: "line",  at: *0 | integer & min(0) & max(64), of: [&: %inline] })
%blank =  close({ k: "blank", n: *1 | integer & min(1) & max(16) })
%raw =    close({ k: "raw",   at: *0 | integer & min(0) & max(64),
                 text: string, reindent: *true | boolean })
%piece =  %line | %blank | %raw
%frag =   close({ k: "frag", of: [&: %piece] })
```

This note adds one alternative to `%piece`:

```aon
%piece = %line | %blank | %raw | string & re("^[^\n\r  ]*$")
```

**A bare string piece is `{k: "line", at: 0, of: [s]}`**, and the
terminator rule is enforced on it at the node, as a vet error, before
any renderer runs. Three reasons, in order of weight:

1. **It is what every `emit` body already produces.** VERIFIED: every
   row in `gen-emit.tsv` and every example in the reference emits
   strings. Without the shorthand, every body line in every generator
   would be wrapped in `{k: "line", of: [...]}` — ceremony on the hot
   path of the one construct the rule layer exists for.
2. **It is what the template surface produces.** TEMPLATE.0.md D7's
   generator is body lines that are *verbatim target text*, indented
   to match where they land ("Indentation is right by construction").
   Those lines are depth-0 strings carrying their own spaces. A surface
   that had to lower each line into a record would not be the surface
   the note verified against twelve handlers.
3. **`at` stays available for the one case that needs it.** D8's
   residual — one table used at two depths — is written as
   `{k: "line", at: 1, of: [...]}`, and the renderer's prefix is added
   to whatever the text carries.

A string that holds a line terminator is refused at the node
(`invalid`, from the vocabulary); multi-line verbatim text is
`{k: "raw", text}`, or `split(s, "\n")` spliced in as lines. That is
the totality argument of G9 §3 — a line is a line, and the check is
local — kept exactly, with the check moved to where D1 says checks
go.

### D3. The renderer does not trim trailing whitespace

G9 §3 has `line(body)` append `pad + s` *right-trimmed of space and
tab*. This note removes the trim. **A body line is verbatim, and two
lines that are two spaces and nothing else are significant**:
TEMPLATE.0.md D8 reproduces the twelve handlers byte-identically
*including* such lines, and records that an editor set to trim on save
destroys them silently — which is what a trimming renderer would do,
deterministically, on every run. The trim existed to keep `pad` off a
blank line; that is handled by the rule that a line whose text is
empty emits no prefix, and by `%blank`, which emits nothing but its
terminators. The renderer emits what it is given. Trailing whitespace
is the transform's, like everything else about the text.

### D4. The unit is the manifest

G9 §6 designs a separate manifest — `outputs: [{target, at, transform,
out, profile}]` — and its second amendment asks whether it survives
phase 6 and what to name it (`aontu:gen`). It does not survive.
**Every fact the manifest carried is already on the unit or derivable
from it:**

| manifest field | where it lives now |
|---|---|
| `out` | `units[].path` |
| `target` | `units[].lang`, which selects the profile (D5) |
| `profile: {pkg: …}` | `units[].pkg`, and `units[].profile?` for an inline override (D5) |
| `transform` | the document itself — under `emit` the transform *is* the value at `decls` |
| `at` (documentation of intent) | replaced by the coverage report, which measures what was read (P7) |

One document, one evaluation, N units, all-or-nothing writes: §6's
"partial failure" rule survives intact because it never depended on
the manifest being a second file. What is retired with it: the
`--manifest` flag, the `aontu:gen` name, and the question.

### D5. A profile is data that knows its language

Three profiles ship bundled, byte-identical in both ports and pinned
by a `hash` row each: `aontu:lang/typescript`, `aontu:lang/go` and
`aontu:lang/text`. Each is an aontu document whose root is
`profile: { lang: "…", … }`, and **the `lang` field is how a profile is
matched to a unit**. Selection, per unit, in this order:

1. a `--profile <file>` whose `lang` equals the unit's `lang` (the
   flag repeats; two files claiming one `lang` is a usage error);
2. `units[].profile`, an inline map merged over the bundled profile of
   that `lang` — the `{pkg: "domain"}` case, without a manifest;
3. the bundled profile named by `lang`;
4. `aontu:lang/text`, **if and only if every declaration in the unit
   is a fragment or a text escape** — a Python or YAML unit needs no
   profile of its own, which is the amendment's "a fragment-only
   target needs almost no profile" made operational;
5. otherwise `render_profile`: a declaration in a language no lowering
   knows.

The profile's fields are G9 §3's list and no more — `indent`, the
comment forms, the string quote and its escape table keyed by decimal
code point, the identifier character class from a closed named set,
the reserved words, the per-role case convention, the acronym set, and
the primitive type map with `open`/`close`/`prec`/`child_prec` per
container form — held to §3's test, stated in each profile's header:
*a field belongs in the profile only if the renderer applies it
without looking at the shape of any node*. `aontu:lang/text` has
`indent` and nothing else.

**The declaration lowering is code, not profile data**, and it is the
one place "a new language is data" does not hold. `%record` becoming
`export interface X {` or `type X struct {` is a per-language-family
function in `render.ts`/`render.go`, selected by the profile's
`lowering: "typescript" | "go"` field and parameterised by the fields
above. Two lowerings ship; a third language with *declarations* is a
code change in both ports. A third language with *fragments* is a
profile with one field — and since the fragment algebra was added
precisely so that any language is reachable without a lowering, that is
the intended shape of the ceiling. (Whether the lowering itself could
be a bundled `emit` table, making the declaration path data too, is
[X-4](#8-open-questions).)

### D6. The fold, as G9 §3 wrote it, with two substitutions

`renderValue(instance, profiles) -> RenderReport` is a pure, total
fold from `generate()` output plus profile data to byte strings. It
never touches the Val tree, never reads or writes a file, never shells
out, never sorts, and never iterates a map (Go: slices only, and
`grep -n 'range ' go/render.go` is the acceptance check). The
algorithm is §3's, unchanged, except that (i) the fold reads a piece's
`at` where §3 counted recursion depth, which the amendment already
made, and (ii) D3's trim is gone.

- `%line`: `pad(at) + join(of)` where `pad(at)` is `indent.unit`
  repeated `indent.width × at` times, and an empty text emits no pad.
- `%blank`: `n` line terminators.
- `%raw`: each of `text`'s lines gets `pad(at)` unless
  `reindent: false`, which emits at column 0 verbatim. Common leading
  indentation is never stripped.
- `%ref` inline: the name, through the profile's identifier rules
  under a declaration-capable profile; verbatim under `text`.
- Declarations: the lowering (P5), producing pieces that then take the
  same fold.
- Line terminator LF; no `eol` field. Numbers through `exactJSON` /
  `encoding/json`, no second formatter. Escapes one pass per code
  point. Case conversion ASCII-only, non-ASCII carried into the current
  word verbatim. Reserved words by exact equality on the converted
  name. Parenthesisation by `prec`/`child_prec`. **No formatter is ever
  invoked**, and the hand-off is a pipeline step the user runs
  (`aontu render --stdout --profile go … | gofmt`).

### D7. Three loss tiers, and what `--strict` refuses

The report's `lossy[]` records, per unit and path: tier 1, a check the
target's type system cannot enforce (from the declaration lowering);
tier 2, a fragment — structured, re-indentable, terminator-checked,
saying nothing about target syntax; tier 3, an opaque `{k: "text"}`
escape or a `%raw`. `--strict` refuses tier 3 and only tier 3. A
fragment-only unit under `text` therefore reports tier 2 for every
declaration and passes `--strict`, which is the right answer: the
author chose fragments, and the report says so without refusing them.

### D8. The verb

```
aontu render [--at <path>] [--profile <file>]... [--unit <path>]
             [--stdout | --out <dir> | --check <dir>] [--strict]
             [--format text|json] <file>
```

- **`--stdout`** prints one unit's bytes and nothing else, so the
  output can be piped into a formatter or a file. It needs exactly one
  unit: a one-unit instance, or `--unit <path>` naming one. Several
  units with no `--unit` is a usage error, because any delimiter would
  make the bytes not the unit's.
- **`--out <dir>`** writes every unit below `<dir>`, or nothing: every
  unit is rendered first, every finding collected, and no file is
  touched unless all N rendered (G9 §6). `<dir>` is realpath-confined;
  a unit `path` that is absolute, contains `..`, or repeats another
  unit's is `render_path`, refused before anything is written. `render`
  never deletes: a file under `<dir>` that no unit names is left alone.
- **`--check <dir>`** renders and compares: a unit whose bytes differ
  from the file at `<dir>/<path>`, or whose file is absent, is drift,
  listed by path, exit 1. This is the CI form, and it is what
  `use-cases/15-code-generation/check.sh` becomes (P4).
- **Exit codes mirror `jsonschema`**: 0 ok; 1 lossy under `--strict`,
  or drift under `--check`; 2 usage or I/O, including a refused unit
  path; 4 the document does not stand up, or the instance is not
  `aontu:code` — the vet findings are the report, in `vet`'s text and
  JSON shapes.
- `--format json` prints the `RenderReport` — units with their text,
  `lossy`, provenance when P7 has landed — and is the shape the MCP
  tool returns.
- `finish()` sets `process.exitCode` rather than calling
  `process.exit`, so a large piped unit is not truncated (the
  `jsonschema` precedent).

**The write posture is confined by path, and `docs/trust.md` says so.**
Includes are confined by the trust profile; writes are confined below
the `--out` directory, and the two are separate inputs to the
contract. INIT.0.md already corrected G9's claim that `render` is the
first verb with a write effect (`fmt -w`, `agentsmd --write`,
`mod tidy`, `mod vendor`, `set --overlay`, `view --out` all write); the
new paragraph in trust.md is about the confinement, not the novelty.

### D9. The library surface, and the tool

TypeScript: `render(src, opts): RenderReport` (evaluate, vet, fold) and
`renderValue(instance, profiles): RenderReport` (the fold alone), both
exported from the `ts/src/aontu.ts` barrel — not repeating the
`jsonSchema` mistake, the one exporter reachable only by deep import.
Go: `aontu.Render` and `aontu.RenderValue`, the twins. The report:

```
RenderReport {
  verdict: "ok" | "lossy" | "error"
  units:   [{ path, lang, text }]         // in units[] order
  lossy:   [{ unit, path, tier, construct, reason }]
  errors?: [VetFinding]                   // on error only, jsonschema's shape
  trace?:  [{ unit, piece, node, rule }]  // P7
}
```

**The MCP tool `render` returns the report and never writes.** It
carries no `--out`; the model that calls it receives units as text and
places them itself, under whatever confinement the host applies. That
keeps the server's write surface at zero, which the LSP already relies
on — and the assertion that the LSP cannot reach `render`'s write path
is a test in each port, as G9 §5 asked for the bridge.

### D10. The shared spec mode

A new `render` mode, four columns, with the options riding `expect.ask`
as `view` does (VERIFIED: `view.tsv`'s header states the pattern and
the reason — the same document renders differently under different
options, and a fifth column is for a second *document*):

```
name <TAB> render <TAB> src <TAB> {"ask": {"at"?, "profiles"?: [...], "unit"?, "strict"?}, "verdict", "units": [{"path","lang","text"}], "lossy": [...]}
```

`ask.profiles` carries inline profile maps for rows that exercise a
profile field; a row with no `profiles` uses the bundled set. Newlines
in `text` are written `\n`, which the runner's escape pass expands;
only a carriage return is unspellable, and the two arms no TSV cell can
reach — a lone surrogate, a lone CR — get one per-port test each.
Whether whole-file goldens should come from a fixture file instead
stays open (G9's last open question) until the `\n` rows prove
unreviewable; the eight-line cap is the tripwire.

### D11. `emit` gains `replace` and `esc`, and provenance; `form` lands

Three pieces of the rule layer are not `render`'s but stand between
`render` and the surface, and the plan carries them:

- **`replace` and `esc` on a template** (TEMPLATE.0.md D3, D4): a
  single left-to-right pass over the template's own literal body
  strings, longest key wins, a substituted value never re-scanned,
  spliced results never touched; every value escaped through the
  landed `esc` (`ts/src/escape.ts`, `go/escape.go`) under the
  template's `esc:` variant, `none` the only opt-out; the two static
  checks `replace_overlap` and `replace_unused`, class `parse`, checked
  on the template before any data.
- **Provenance**: `emit` records `(node path, table, rule index)` per
  emitted piece, and `render` carries it per unit and piece in
  `trace`. Coverage — model paths no output consumed, declarations no
  rule produced — is a set computation over the trace and needs no
  other machinery (G9 §6). This is the item XSLT never managed to
  retrofit, and it is cheap only if it lands while `emit` is young.
- **`form(data, tmpl)`** (G9 §4): the order-preserving map, the
  construction `each` is not. VERIFIED still open: `pick(pack(…))`
  re-sorts to code-point order, so a struct's fields, a DDL's columns
  and TEMPLATE.0.md's name-derivation chain all wait on it.

## 4. The phases

Sizes are the register's (S/M/L). Each phase lands in both ports with
shared rows, or it is PARTIAL. The order is a dependency order: nothing
in a phase needs a later one, and the first four phases together are
the first usable `aontu render`.

### P0 — the `aontu:` resolver leg (S)

**Deliverable.** An include whose path begins `aontu:` is served from
the bundled table before any other leg runs and never touches the
filesystem; under `none` it is denied like everything else; it appears
in the include manifest under capability `std`. This is
[MODELS.0.md](MODELS.0.md) M0's resolver leg **split from its rename**:
renaming `std/system` and `std/view` to `aontu:system` and `aontu:view`
is a breaking change to two shipped experimental models with fallout
in use cases, docs and the site, and it is not what `render` needs.
The leg is. MODELS.0.md's M0 row should record the split; the rename
follows on its own commit, with X-1 of that note decided then.

*Files:* `ts/src/std.ts`, `ts/src/lang.ts` (the multisource resolver),
`go/std.go`, `go/lang.go`; `docs/trust.md` (one sentence: the `aontu:`
names are the bundled set). *Spec:* `include-trust.tsv` +4 (served
under `system`, `root` and `mem`; denied under `none`); a `hash` row is
P1's. **Acceptance:** `@"aontu:code"` resolves to the P1 text in both
ports from a document with no filesystem access.

### P1 — the vocabulary, with fragments and the string piece (S)

**Deliverable.** `@"aontu:code"` as G9 §1 wrote it, with the second
amendment's fragment nodes, D2's string piece, lower-case alias names
per MODELS.0.md, `fmt`-clean and `--lint`-clean, bundled byte-identical
in both ports. Plus a profile vocabulary alongside it — `@"aontu:profile"`,
the schema a profile document is vetted against, so that a
user-supplied `--profile <file>` is checked before the fold reads it.

*Files:* `ts/src/std.ts`, `go/std.go`; `docs/reference-language.md`
(a section per bundled vocabulary, as `std/system` has). *Spec:* new
`code-vet.tsv`, ~30 rows in `vet` mode: a full valid instance; each of
§1's five spelling rules as a refusal at the node; the fragment rows
the amendment names (a valid fragment; a line whose inline piece
carries `\n` — invalid at the node; `at` below zero and above its
bound; `raw` with `reindent: false`; a `%ref` inline); D2's rows (a
bare string piece is valid; a bare string holding a terminator is
invalid at the node); two `hash` rows (each vocabulary's `aon1-` pin,
byte-identical across ports). **Acceptance:** the instance in G9's
worked example 2 vets `valid` in both ports through the served name;
an includer of the vocabulary generates only its own keys.

### P2 — phase 0b: `join` honours the marks (S)

**Deliverable.** [BUGS.md §79](../../use-cases/BUGS.md): `join`,
`each`, `pick` and `filter` consult `hide` and unfilled optionals
through one shared child enumeration, so a hidden value never reaches
a string the document hands out. This is on the render path because
every fragment line is a `join` or a `+` over model data, and a
generator that writes a hidden field into a source file is the failure
`hide` exists to prevent. §63 (Go, a spread template under `hide`) is
not on the path — `emit` removed the idiom that needed it — and stays a
phase-0 item in its own right; §57 and §60 likewise.

*Spec:* `gen-join.tsv` +4, one row per combinator in its own file.
**Acceptance:** the §79 reproducer generates `"keep"` in both ports.

### P3 — the renderer core, fragments first (M)

**Deliverable.** `ts/src/render.ts` and `go/render.go`, function for
function: the fragment fold of D6 (`%line`, `%blank`, `%raw`, the
string piece, `%ref` verbatim), the per-code-point escaper, the profile
loader and D5's selection order, D7's tiers, D9's `renderValue`, and
the `aontu:lang/text` profile. No declaration lowering yet: a unit
holding a `%record` under a profile without a lowering is
`render_profile`, which is what makes the phase small and the fold
testable alone.

*Spec:* new `render.tsv`, ~30 rows: depth and `at`, blank runs, `raw`
with and without `reindent`, the empty unit, the string piece, a line
assembled by `join`, two units in order, the three tiers in `lossy`,
`render_profile`, `render_path` (absolute, `..`, duplicate),
`render_lang` (a `{k:"text"}` whose `lang` is not the unit's), and a
Python class and a YAML document rendered from `emit` output.
`errcodes.tsv` +3 (`render_profile` parse, `render_path` parse,
`render_lang` conflict); the final list is settled at landing, each
code with a row that reaches it. **Acceptance:** the amendment's Python
class (two nesting levels, a `%ref`, a blank, a `raw` at
`reindent: false`) renders byte-identically from both ports.

### P4 — the verb, and the use case (M)

**Deliverable.** `aontu render` in both CLIs per D8; `render` and
`renderValue` in both barrels; the `render` MCP tool per D9; the
trust.md paragraph; `docs/reference-api.md` `### aontu render` with
executable transcripts run by `ts/test/docs.test.ts`;
`docs/how-to/generate-code.md` rewritten onto `emit` and `render`;
`use-cases/15-code-generation/` migrated — the three generators emit
fragment units, `check.sh`'s Python unwrap and its byte-writing go,
and the goldens are held by `aontu render --check expected`. The
compile checks stay: the Go output must build, and `gofmt -l` must
still *want* to change it, which is the formatter hand-off pinned.

*Files:* `ts/src/cli.ts`, `ts/src/mcp.ts`, `ts/src/aontu.ts`;
`go/cmd/aontu/render.go`, `go/cmd/aontu/main.go`, `go/mcp*.go`;
`docs/trust.md`, `docs/reference-api.md`, `docs/how-to/generate-code.md`,
`docs/shared-spec.md` and AGENTS.md's mode table for `render`;
`use-cases/15-code-generation/*`. *Spec:* CLI behaviour by transcript;
`render.tsv` +6 (`--at` off the root, `--unit`, `--strict` on tier 3).
**Acceptance:** G9 acceptance case 1 — a Python module or a YAML
manifest from the same model that produces the Go and TypeScript units
— rendered by one `aontu render --out` in both ports; a three-unit
instance whose third unit fails writes nothing; `--check` against the
use case's `expected/` is green in CI for both ports, and red when a
golden is edited.

**After P4, `aontu render` is usable for every language, through
fragments.** That is the release to cut; see [§7](#7-the-rest-of-the-programme).

### P5 — the declaration lowering, and the TypeScript and Go profiles (M/L)

**Deliverable.** The lowering of `%record`, `%enum`, `%alias`,
`%const`, `%func` and `%import` for the two language families,
`aontu:lang/typescript` and `aontu:lang/go` as bundled profiles, the
ASCII word splitter and case styles, the per-profile acronym set, the
reserved-word escaper, the `prec`/`child_prec` type expression, import
derivation from `{k:"ref"}` nodes merged with `%unit.imports`, the
banner from `%source`, and tier-1 loss for every `%check` a target
cannot enforce.

*Spec:* `render.tsv` +40 — all case styles, the acronym override
(`ledgerId` → `LedgerID` in Go and not in TypeScript), reserved words
(`type` → `type_`, `Type` → `Type`), string escaping (tab, quote,
backslash, control, non-ASCII, astral), the `(string | null)[]` paren
rule, each declaration kind in each profile; two `hash` rows for the
profiles. **Acceptance:** G9's worked examples 1 and 2 render
byte-for-byte from both ports; `grep -n 'range ' go/render.go` shows
ranges over slices only.

### P6 — `replace`/`esc` in `emit`, and `form` (M)

**Deliverable.** D11's first and third items. `replace` and `esc` as
template keys with the three substitution rules and the two static
checks; `form(data, tmpl)` per G9 §4, in `generatorFuncs` and
`boundArgStart` in both ports (forgetting the second is BUGS §34's
silent failure, and the nesting rows are what catch it).

*Spec:* `gen-emit.tsv` +12 (substitution, longest key, no re-scan,
spliced results untouched, escaping on by default, each variant, `none`,
both static checks); new `gen-form.tsv` ~25 rows; `errcodes.tsv`
+2 (`replace_overlap`, `replace_unused`, both parse) plus `form`'s
codes by `each`'s precedent. **Acceptance:** TEMPLATE.0.md's twelve
handlers, written as the note's canonical (desugared) form, reproduce
byte-identically through `emit` and `aontu render --check` in both
ports; `join(form(split(…), …), "")` closes the name-derivation chain.

### P7 — provenance and coverage (M)

**Deliverable.** D11's second item: the `(node path, table, rule
index)` trace per piece, carried in `RenderReport.trace` and printed
under `--format json`; the coverage report — model paths no output
consumed, declarations no rule produced — as `render --coverage`.

*Spec:* `render.tsv` +8 (trace shape; a consumed path; an unconsumed
one; a declaration with no rule). **Acceptance:** worked example 2's
report names `$.customers`, `$.orders` and `$.invoices` as consumed by
no output, from both ports.

### P8 — the template surface (M/L) — G9's phase 9

**Deliverable.** TEMPLATE.0.md as a verb-reachable surface: a
generator file in the target language whose `//-` (or the target's
comment token plus a dash) lines carry aontu, desugared to the
canonical `emit` form and rendered; the resugar that tests the round
trip (D6 of that note: the sugar is the fixpoint of the two
transforms); `fmt`'s reach into marker lines decided and pinned.
Numbered here because the status note asked for the number and the
row: it is G9's ninth phase, after `emit` (6) and behind `render` (4),
which it cannot precede.

*Spec:* new `template.tsv` ~30 rows (desugar, resugar, the marker's
own escape, the per-line quote, a trailing-whitespace line preserved);
`fmt.tsv` +4 for marker files. **Acceptance:** the twelve handlers
reproduced from the note's generator file, both ports.

## 5. What "done" means for G9

G9 is complete when every row below is green in both ports, and the
register says so in the same commits:

| claim | pinned by |
|---|---|
| a target the declaration vocabulary does not fit renders from `emit` (acceptance case 1) | P4's Python/YAML rows and use case 15 |
| a recursive rule set renders nested output (acceptance case 2) | `emit-recursive` (landed) plus one `render.tsv` row over it |
| worked examples 1 and 2 byte-for-byte | P5 |
| one model, three units, one run, nothing written on a partial failure | P4 |
| the twelve handlers byte-identical through `emit` + `render`, and then through the surface | P6, P8 |
| coverage names dead model and silent holes | P7 |
| `render` never writes from the engine, the MCP tool or the LSP | P4's isolation tests |
| both vocabularies and three profiles hash identically across ports | `hash` rows |
| ADR-002's floor holds with every `render_*` branch reached | `make cov` |

Phases 5, 7 and 8 are not in the table. G9 is declarative
transformation — one model, many artifacts — and the table is the
whole of that claim.

## 6. The first release

P0–P4 together are one release, and it should be **0.58.0 / go
0.1.16**, which is already owed: the shipped 0.57.0 declares aliases
with a colon and reads `x=y` as text, and the synced documentation
describes `=` and `bare_punct`. Cutting 0.58.0 at P4 ends that skew and
ships `render` in the same breath. P5–P8 follow as 0.59.0 and after.

## 7. The rest of the programme

What stands between the last G9 row and "the capability programme is
complete", with a recommendation for each. These are the owner's
decisions; the recommendations are argued, not assumed.

| item | recommendation | why |
|---|---|---|
| **G9 phase 5, the reflection sidecar** | Keep, as its own design note after P5; not on `render`'s path | `render` reads `generate()` output by design. The sidecar is what makes forms (a) and (b) native in Go and lets a transform *derive* `%field.optional` and defaults rather than state them; GENERATION-FORMS.0.md §2 says it is first an ADR-001 question (does parity cover the embedding surface?) and that question wants its own ADR before code. |
| **G9 phase 7, the Jostraca bridge** | Retire by ADR, or move it outside the programme | `render --out` writes, `--check` gates CI, and the engine owns no merge. Jostraca's value is the *repeated run over hand-edited files* — protected regions, three-way merge — which is a different lifecycle from "regenerate everything, write nothing on failure" (G9 §6). Two of its prerequisites are asks on another repository. The programme should not wait on them; a bridge can come later as tooling, with the ADR the design already says it needs (the register's "ADR-012" citation is stale — that number is taken — so it would be ADR-023 or later). |
| **G9 phase 8, string interpolation** | Retire | It was deferred "behind evidence that `join` did not suffice", and the evidence went the other way: TEMPLATE.0.md D3 measured `${expr}` breaking on the project's own material and chose `replace`, whose canonical form has zero concatenations. A parser phase with a version gate, for a convenience the surface has already made unnecessary, is the wrong last item. |
| **G5 phase 6, the default trust flip** | A release act; do it with 0.58.0 or state the release it will happen in | Already recorded as such in the register. |
| **G10 phases 3, 4, 6** | Out of this repository; tracked in `aontu-lang/system` | The status note records the register's rows lag that repository's seven design notes; the fix is register hygiene, not engine work. |
| **Register hygiene** (status note §5: numbering the surface phase, SUPERSEDED/RETIRED/REMOVED defined, ADR-022's entries, counts) | Do with the P0 commit | Cheap, and every later phase's row depends on the section being right. This note gives the surface phase its number and row. |

## 8. Open questions

- **X-1 — Does `render --out` refuse to overwrite a file it did not
  write?** Recommendation: no. `render` is the repeated run; the
  contract is "these paths are generated", and a `DO NOT EDIT` banner
  from `%source` is the notice. A refusal would need a record of what
  was written, which is Jostraca's job and the thing D4 declined to
  rebuild. `--check` is how a CI catches a hand edit.
- **X-2 — Is the `text` fallback (D5 step 4) too permissive?** A
  fragment-only unit for a language with a bundled profile — a
  TypeScript unit written entirely as fragments — renders under
  `typescript`, not `text`, so `%ref` gets the identifier rules; the
  fallback fires only for a `lang` with no profile. Recommendation: keep
  it, and count it as tier 2 in `lossy` so `--format json` says which
  profile served.
- **X-3 — Where does the coverage report's notion of "the model"
  start?** Everything the transform read, or only under `--at`? With
  the manifest gone, `at` is not stated anywhere. Recommendation: the
  trace records what was read, coverage is computed over the document
  root, and a document that wants a narrower measure puts its model
  under one key and passes `--coverage-at`. Decided by P7's first real
  report.
- **X-4 — Could the declaration lowering be a bundled `emit` table
  rather than code?** It would make the declaration path data too, and
  dogfood the rule layer on the renderer itself. It needs builtins the
  language does not have (case conversion by role, identifier
  escaping, the `prec` type expression) and would put those on the
  path of every emitted identifier. Recommendation: build the two code
  lowerings first (P5), list what they needed, and decide then.
- **X-5 — `--stdout` for several units.** D8 refuses it. The
  alternative is a delimiter (`==> path <==`, the `tail` convention).
  Recommendation: refuse; `--out` to a temporary directory is the
  multi-unit answer and it is what a formatter hand-off wants anyway.
- **X-6 — The tier for a `%raw` with `reindent: true`.** It is
  re-indented, so it is structured; it is opaque text, so it is not
  checked. D7 puts it in tier 3 with the escape. Recommendation: keep
  it there — `--strict` is the switch for "no unchecked text", and a
  reindented blob is unchecked text.

## 9. Departures from the texts this note inherits

Each is recorded in G9's fourth amendment and in MODELS.0.md where it
touches M0.

1. **No trailing-whitespace trim** (D3), departing from G9 §3's
   `line(body)`.
2. **A bare string is a piece** (D2), extending the second amendment's
   `%piece`.
3. **The unit is the manifest** (D4): `outputs:`, `--manifest` and
   `aontu:gen` are retired; G9 §6's write rule survives on the unit
   list.
4. **A profile declares its `lang`**, and `--profile` takes a file and
   repeats (D5), replacing `--profile <name|file>` applied to every
   unit.
5. **`--stdout` renders one unit** (D8, X-5).
6. **`--check` takes a directory**, so the CI form needs no `--out`.
7. **M0 is split** (P0): the `aontu:` leg first, the rename of the two
   shipped models after.
8. **Phases are re-cut** around the verb: G9's 1, 4 and 6 become P0–P7
   here, the surface phase is numbered 9, and 5, 7 and 8 leave the
   critical path with §7's recommendations.
9. **The design note is `RENDER.0.md`**, not the `EMISSION.0.md` G9's
   documentation obligations named; the verb is `render` (EMIT.0.md
   D7) and the note is named for it.
10. **The Jostraca ADR is not ADR-012** — that number is
    [taken](../../ADR.md#adr-012--an-includes-extension-decides-what-the-file-is-aontu-source-config-data-or-refused);
    the bridge, if it proceeds, takes the next free number.

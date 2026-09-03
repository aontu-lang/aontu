# Changelog

All notable changes to this project are documented here. The TypeScript
package (`ts/`, npm `aontu`) and the Go module (`go/`,
`github.com/aontu-lang/aontu/go`) are versioned independently; entries note
which implementation each change affects.

## Go 0.1.14 — 2026-09-03 · TypeScript 0.56.0

### Every verb honours `--text-ext`, and a per-verb test says so

`--text-ext` is the include option that rides WITH the capability:
both answer what an include may read, and a verb that threads one and
not the other refuses under a flag the bare command honours. Three
verbs threaded only the capability, and the ports disagreed in
opposite directions:

| command | was, TypeScript | was, Go |
|---|---|---|
| `view doc --text-ext md` | refused the include | drew the figure |
| `set --text-ext md` | refused, and wrote nothing | wrote the overlay |
| `breaking --text-ext md` | compared the documents | refused, exit 4 |

Fixed by routing every one of them through the shared include-options
helper (`includeOpts` in TypeScript, `aontuForPathTrust` in Go):
`view`'s loader and its three forwards into `why`, `subsume` and the
per-figure options; `patch`'s vet; `breaking`'s `Subsume` call and the
`PolicyCompat` read that finds the document's own mode. `agentsmd` had
the same hole one level down — it listed a document's keys and then
reported an EMPTY shape, because the second evaluation the shape comes
from refused the include the first had honoured.

The test that let this through was a REPRESENTATIVE one: `--text-ext`
was asserted on `get` alone, which proves the road the flag travels
and not the engine at the end of it, and every verb has its own
engine. It is now one case per verb in both ports
(`every-verb-honours-the-text-extensions`), each asserted twice — the
verb refuses the include with no flag, and does not refuse it with the
flag — because an assertion that the flag works, on a verb that never
reads the include at all, passes for the wrong reason. The capability's
own per-verb test gained the four verbs it had never named: `reaches`,
`jsonschema`, `view tree` and `view doc`.

`--text-ext` now appears in the reference's list of the options that
apply everywhere, where it was missing.

### `aontu hash` says WHY a document does not stand up (Go)

The Go port printed only `nothing to hash`; the canonical port printed
the engine's own diagnosis under it (the review's finding F), and that
half was never ported. Both ports now print the finding, byte for
byte, for every failure — a conflict, a denied include, an unreadable
extension. Exported as `aontu.EvalFailure`, the Go twin of
TypeScript's `evalFailure`.

### `aontu fmt` refuses a multi-document source, and the refusal is pinned

Two bags at the top level — `{a:1}` then `{b:2}` — evaluate to a LIST
of two documents and format to a single map. The formatter's
self-check catches the difference and writes nothing, identically in
both ports, so no file is corrupted. A new spec mode, `fmt-refuse`,
pins the refusal (`test/spec/fmt.tsv`), and
[FMT.0.md](docs/design/FMT.0.md) §9 records what is still open: the
refusal is the right failure and its message is not, since it names a
formatter defect when what it has found is a document class the form
does not cover.

### Release plumbing, and the records that had gone stale

`make publish` staged `ts/package.json` alone after `npm version` had
also rewritten `ts/src/aontu.ts` and `make all` had rebuilt `ts/dist`
from it, so the release commit could claim a version its own source
and build did not. It fails closed — `ts/test/version.test.ts` catches
it in the publish job, before `npm publish` — but it fails after the
tag push, which is the irreversible half. All three paths are staged
now.

Corrected with it: the reference's REPL banners (one still read
v0.53.0) and `vet-action`'s default version; the verb count in
`docs/index.md`; the `view` kinds in `README.md`, `llms.txt` and the
MCP tool table, none of which named `doc` or `lattice`; `llms.txt` and
the grammar card on the grammar files, which have been four since the
ABNF landed; `MODELS.0.md`, which said twice that the formatter does
not exist; the claim in the changelog and in `FMT.0.md` that the
documentation fence gate runs in both ports, when it runs in the
canonical port; and the shared suite's counts in the
capability-review register, which rule 5 of that register says live
there and nowhere else — 103 files, 4,245 rows, twenty-four modes.

### Recorded, not fixed

[BUGS.md](use-cases/BUGS.md) §75: the value an `@"file"` expression
produces DIRECTLY gets a different site in each port — the canonical
port names the `@` where it was written, the Go port names the
included file with no coordinates and an absolute path. Every value
below it agrees. Which port is right is a design question rather than
a typo, and it is open.

### `aontu fmt` -- the source formatter, in the tradition of gofmt

`aontu fmt [-w|-l|--check|-d] <file>...`, in both ports: one agreed
form for Aontu source, so that layout is never argued about and a diff
shows only what changed (docs/design/FMT.0.md, phase P1 -- the
syntactic tier). The form: two-space indentation, `key: value` with the
colon tight to the key, no commas between entries (they stay in a
call's argument list), braces only where the language needs them -- a
one-pair map is a chain, `a: b: c: 1`, and a one-key map in a list is a
pair element, `[a:1 b:2]` -- containers on one line when they fit an
80-column budget and padded inside braces, `{ a:1 b:2 }`, and as a block
when they do not. Every comment and every blank-line break the author
put between groups is kept; keys are bare where they can be; a
single-quoted string becomes double-quoted unless it holds a double
quote; numbers are never rewritten; the formatter never breaks a line,
and keeps the author's breaks inside an expression at their operators.

The formatter reads the token stream the parser reads, so it sees what
the value tree throws away, and it resolves no include: `@"..."` is a
token like any other, and the verb takes no `--trust`. Before it
returns a byte it re-parses what it wrote and compares the two parse
trees; a disagreement is refused as its own defect (`format_check`,
class internal) with both spellings in the finding, and nothing is
written. `--write` rewrites in place, `--list` names the files whose
form would change, `--check` is the CI gate (exit 1), `--diff` prints a
unified diff -- a patience diff, byte-identical across the ports. With
no file the verb reads standard input; with several files it needs one
of those options. Exit 4 for a document that does not parse.

Library: `format(src, {path?}, hooks?)` and `unifiedDiff(name, before,
after)` in TypeScript; `Aontu.Format(src)` and `aontu.UnifiedDiff` in
Go. A new spec mode, `fmt` (`test/spec/fmt.tsv`, 103 rows): both
runners assert the formatted text byte for byte, that it is a fixed
point, and -- where the source evaluates -- that the canon-hash is
unchanged. Gates: every `.aon` under `use-cases/` and
`test/spec/files/` formats to a fixed point in BOTH ports, and every
Aontu fence in the documentation does so in the canonical port, which
is where the documentation gate lives. The lawful tier (repeating the prefix,
`server: host: ...` / `server: port: ...`, which rests on the meet) is
P2 and has not landed; nothing is merged or split yet.

### The grammar, in the notation a person reads, with railroad diagrams

`grammar/aontu.abnf`. The same rules as the GBNF and Lark files, in
RFC 5234 notation with RFC 7405's case-sensitive `%s"..."` literals --
a third consumer of one grammar, and the first written for a READER
rather than a decoder. The language reference publishes it, and draws
two railroad diagrams from it: how a value COMPOSES, and how one is
SPELLED. Whitespace is elided from the figures, as railroad diagrams
conventionally elide it, and the caption says so.

The file is EXECUTED, not merely published. `ts/scripts/abnf.cjs`
reads it into the same expression tree `ts/test/grammar.test.ts`
already builds from the GBNF, so the corpus test, the reachability
walk and the builtin-name check apply to it unchanged rather than
through a second interpreter -- which is also why the reader lives in
`scripts/` rather than in the test: `ts/scripts/figures.cjs` needs it
too. Every canonical-form output in the shared suite parses under it,
and the same ten excluded forms are refused, `@"..."` includes first
among them.

One notation decision is load-bearing: a bare `"..."` literal is
case-INSENSITIVE in RFC 5234, and Aontu is not -- `TRUE` is a bare
word where `true` is a boolean. The reader refuses one rather than
guess which was meant, so the file is `%s"..."` throughout.

The renderer states its palette in hex, which no host page can follow;
the figure generator rewrites each colour to a `--rr-*` CSS variable
with that hex as its default, and fails the build if a rewrite stops
matching -- the arrangement the engine's own SVG figures have with
`--av-ink` and its kin.

### `aontu view lattice`: the value lattice, with a document on it

Both ports, a tenth kind. What it draws is the LANGUAGE, not the
model: `top` at the join, `string`, `number`, `boolean` and `null`
under it, `path()` under `string`, the four numeric leaves under
`number`, and `nil` at the meet -- the same shape for every document,
including the nodes a given one never reaches. That is the point.
Two figures of two models are comparable because they are the same
figure with different annotations; a picture assembled out of whatever
the document happened to contain would teach a reader the shape of
their own file rather than the shape of the language.

What the document adds is a count at each node it reaches. A concrete
scalar counts at its kind, because `superior()` is the lattice's own
answer to which; a kind marker counts AT that node, because `integer`
written as a schema is the node and not a value under it; `top` and
`nil`, both of them values a document can write, count at the
endpoints. A container is walked and not placed -- a map is not a
scalar lattice citizen, and counting one at `top` would put every
document's root there.

A value at no single point is `lattice_unplaced`, and it is a loss of
PLACE rather than of detail: `integer & min(1024)` is a region of the
lattice and `*8080 | integer` is two places at once, so the report
NAMES the paths rather than the figure drawing a node it cannot stand
behind. Profiles `text` and `svg`, `--at` and `--style` as every other
kind, declarable in a view document, and `--max-rows` still refuses at
ten rows even though nothing narrows a figure whose size is fixed.

`test/spec/super.tsv`'s new `super-kind-ladder-canon` is where the
figure's copy of the kind table is held to the engine's: it walks the
whole ladder through `super()`, so changing `kindParent` fails a
shared row rather than leaving a figure quietly out of date.

### The documentation's figures are drawn by the engine

`docs/reference-language.md` drew the value lattice in box characters,
and it was wrong: no `path()`, no `null`, and the four numeric leaves
collapsed into a row of example values. A hand-drawn picture of the
one thing the language is built on is a second source of truth that
nothing checks.

`ts/scripts/figures.cjs` now draws `docs/figures/value-lattice.svg`
with the new kind, `make build-ts` runs it, and `ts/test/docs.test.ts`
refuses a stale commit -- the same relationship the use cases already
have with their own figures through `--check`. The language reference
and `docs/unification.md` show it; `docs/STYLE-GUIDE.md` gains the
rule, which also requires alt text that says what a figure shows.

### `@"notes.txt"` loads a file as a string

Both ports. An include's extension already decided what the file IS --
`.aon` source, or one of the named data formats -- and every other
extension was a refusal. TEXT is the third thing it can mean: `.txt`
needs no flag and unifies as an ordinary string, so
`notes: @"notes.txt"` is the whole of it.

`--text-ext <e>` widens that to a comma-separated list of extensions
without dots (`md,sql`), on every verb, so a document can pull in a
template or a query the same way. A named format keeps its meaning --
`--text-ext json` does not turn a JSON file into a string -- and `.js`
stays refused whatever the flag says, because the extension that means
"executable" is not one a document may reinterpret.

`ADR.md` records the amendment: an extension now names one of three
things rather than two.

### A prose gate, and the copy it found

Documentation. [Vale](https://vale.sh) now runs over the reader-facing
pages in CI (`.github/workflows/docs.yml`, `make prose`), with the
binary and the Google package both pinned by version so that somebody
else's release cannot turn a one-word pull request red. Google's
conventions are the base for everything `docs/STYLE-GUIDE.md` does not
rule on, and every rule set below error level carries the count it
produced on a clean run -- "it reported 30 serial commas, of which 14
were two-item lists after a comma clause" is a reason; "it was noisy" is
not.

The banned-phrase list moved out of `ts/test/docs.test.ts` and into
`.vale/styles/config/vocabularies/Aontu/reject.txt`, which both gates now
read, and the gated page set moved into `ts/scripts/gated-docs.cjs`,
which both gates now run. Two gates over different files, or over
different lists, disagree in silence.

The local gate grew the rules a linter cannot carry: it matches over
joined paragraphs rather than physical lines (these pages wrap at 72
columns, so where a line breaks was a way through it), and it now
enforces em-dash spacing and the aside ration, first person by page kind,
the exclamation ration, and no emoji. Em-dash spacing is enforced here
rather than by Vale for a measured reason: Vale stops skipping fenced
blocks part-way through several of these pages, and reads a dash written
tight against an inline code span as spaced. Eleven findings, eleven
false.

What the gate found, all of it now fixed: 1,180 spaced em dashes
converted to Google's unspaced form; 53 link-list glosses separated from
their link by a full stop rather than a dash; 16 serial commas; 28 uses
of banned phrases, `honest` and `quietly` between them; eight Latin
abbreviations; a stray repeated word in the API reference; two how-to
pages whose frontmatter was not valid YAML, which is what stopped Vale
running at all until it was fixed.


## Go 0.1.13 — 2026-09-03 · TypeScript 0.55.0

### Every use case opens with its model tree

`use-cases/`. Sixteen worked examples had five figures between them,
all of them of the five models that happen to have an edge set or a
version history; the other eleven met a reader with prose and a file
table. Every case now opens with its model tree, drawn by `view doc`
and pinned by its own `check.sh` as text and SVG, and its second
section explains the arrangement -- so the reader meets the shape
before the argument. The five cases with a subject figure keep it,
where the prose that explains it is.

Three findings came out of writing them, all recorded in
`use-cases/BUGS.md`: 72 (an alias through a root-spliced include
strands a `must()`, in TypeScript only), 73 (an alias inside a spread
template leaks into canon as `$.%Name` and moves the hash, both ports)
and 74 (an alias declaration is a key of the root map, so `get --keys`
lists it).

### `%` aliases, put to work

`use-cases/`. Three cases name a repeated shape instead of repeating
it: `%CatalogAddr`, `%Owner`, `%Lifecycle` and `%Description` in
01-service-catalog, `%JobEdge` in 12-relations, and `%Key`, `%Owner`,
`%Description`, `%Date` in 08-feature-flags' `flag-schema.aon`. Every
entry document hashes exactly as it did before, which is the claim the
construct rests on: an alias does not generate and does not appear in
canon, so naming a value changes nothing but the reading. Where an
alias could NOT be used the reason is now written down beside the
duplication rather than left to be rediscovered -- a spread template
(73), a file boundary, and 10-data-model's `must()`s (72).

### `aontu view doc`: the shape of the model itself

Both ports, a ninth kind. Every other figure the verb draws reads a
REPORT -- the edge set, the provenance record, the subsumption order --
so it can only draw a document that HAS links, contributions or peers,
and draws nothing from one that does not. A reader meeting a model
wants the plainer thing first: what is in it, and how it is arranged.

`aontu view doc` draws the document's own key tree. `--at` names the
subtree (default `$`) and `--depth <n>` how many levels below it
(default 3). It reads the anchor walk, which is the walk `get --keys
--types` reads: map keys in code-point order, list indices in order, a
sizing residue and a preference stepped through because neither is a
level of the shape. A leaf carries its canon cut at 32 characters --
the kind of thing it is, not its value -- and a container the depth
bound stops at carries the number of keys not drawn, counted into the
loss report as `depth_elided`. A tree that stopped without saying so
would be the one thing a structural drawing must not be.

Profiles `text` and `svg`, `--style` as every other kind, declarable in
a view document (`kind: doc`, `depth`), and in the MCP `view` tool.
`std/view`'s `Figure` gains `depth` and `doc`, so its canon and hash
rows in `test/spec/std-view.tsv` move.

### `aontu view --style`: a figure's marks say what they mean

Both ports. Every mark a figure makes already has a reason the
extractor established -- a cell is `direct` because the edge is
declared, `closure` because the pair is only reachable, `unmirrored`
because the declared inverse is not written back; an arrow is `upward`
because it runs against the bands; a tree row is `repeat` because the
subtree was drawn earlier. The SVG profile has published those reasons
as CSS classes since it landed, because an SVG cannot be drawn without
saying what each shape is. The `text` profile computed the same
reasons, spent them on choosing a glyph, and threw them away.

`--style` declares the vocabulary in both and turns it on at the call.
One mechanism per profile: SGR escapes for `text`, classes and the
embedded stylesheet for `svg`, nothing for `mermaid`, `dot` and `er`,
whose renderers lay the figure out. `auto` (the default) picks the
mechanism where the destination can carry it -- escapes only when
stdout is a terminal and `NO_COLOR` is unset, and an SVG keeps the
stylesheet that makes it standalone. `none` drops both; on `svg` the
classes stay, since they are structure, and only the stylesheet goes,
which is what a host page wants once it has bound `--av-ink` and its
kin and is embedding several figures. `ansi` and `css` name a
mechanism outright, and asking for one on a profile that cannot carry
it is `view_style_profile` rather than a silent no-op.

Escapes are never written to a file: `--out --style ansi` is refused,
and `auto` resolves to none there. `auto` is resolved by the CLI and
is not a value the library takes -- a library cannot see whether its
output is a terminal, and keeping the decision out of `viewOf` is what
keeps every `test/spec/view.tsv` row deterministic.

THE FIGURE'S TERMINAL IS STDOUT'S, not stderr's. `SetColor` settles
the ERROR FRAMES, which go to stderr, and reusing its answer for the
figure would have got both common cases wrong: no escapes for
`aontu view tree m.aon 2>/dev/null` at a terminal, and escapes into
the pipe for `aontu view tree m.aon | less`. `auto` therefore reads
`process.stdout.isTTY` (the `*os.File` character-device test in Go)
and `NO_COLOR` directly, by the rule no-color.org states and `err.ts`
implements.

THE COLOUR BOUNDARY IS AMENDED, NARROWLY
(`docs/design/VIEWS.0.md`, "7. Styling"). Neither mechanism states a
colour: SGR 31 means the colour the reader's terminal calls red, which
the reader chose, and a CSS class states nothing at all -- the
stylesheet reads `var(--av-closure, ...)` so a host page's palette
wins. A hex triple is the thing that cannot follow a theme, and it
stays refused: no truecolour escape, no 256-colour escape, no
`classDef`. A view document still may not carry `style`; a declaration
says which projection, never how it looks, and one that carries it is
refused with `view_document_shape` as any other non-option is.

New codes: `view_style_profile`, `view_style_unknown`.


### `view.ts` imported a bare `path`, which no bundler resolves

TypeScript. `src/view.ts` was the only file in the tree importing a
Node builtin without the `node:` prefix. Node resolves both spellings,
so every test and every CLI run passed; a bundler does not, and the
first thing to build the engine for a browser after the view verb
landed -- aontu-lang/web's playground, which aliases `node:path`,
`node:fs`, `node:crypto` and `node:util` to shims -- failed with
`Could not resolve "path"`. `ts/test/imports.test.ts` now asserts the
tree has one spelling, since a downstream build failure is a poor
detector for a one-word typo.

### Documentation: the source fences carry their language

Fences holding Aontu source across `docs/` and the use-case READMEs
carried no language tag, so aontu.dev rendered them as plaintext beside
identical source that coloured. Every one that is source now says so
(`aon`), which brings it under `ts/test/docs.test.ts` -- parse-checked,
or carrying a stated skip. Two of use case 16's model fragments moved
from indented blocks to fences for the same reason, and its declared-
figure snippet no longer elides with `...`, which is not source.

## Go 0.1.12 — 2026-09-02 · TypeScript 0.54.0

### Subsumption: reflexivity holds for a shared template, a relation and a recursion

Both ports. **Correction** (use-cases/BUGS.md 64, and 28 before it).
Three of the seven use-case entry documents did not subsume
THEMSELVES: a spread template written as a reference (`{&: $.defs.F}`)
or an alias (`{&: %F}`) folded to `sub_path_dependent_spread`, and a
recursion, a relation declaration or a `refer()` target constraint
fell past the subsumption ladder to `sub_unresolved` -- with
byte-identical operands in the finding. Since `breaking` fails on
`undecided`, gating a contract against its own earlier version needed
`--allow-undecided`, which masks the genuine undecideds it exists to
surface.

REFLEXIVITY IS A LAW and identity is the HASH FORM, which
`test/spec/subsume.tsv` already stated: both folds now answer
`subsumes` when the two operands have the same hash form. A nil is the
exception -- it is not a value, so it admits nothing, itself included
-- and two DIFFERENT templates, relations or recursions still fold, so
nothing decidable is swept up. The law runs only where the answer would
otherwise be `undecided`, so the common path is untouched. All fifteen
use-case entry documents now subsume themselves in both ports, and
`use-cases/03-api-contract` gates its contract against itself without
the escape hatch.

### `aontu view layer --edges`: the depends relation over the bands

Both ports. **New option.** The layer figure drew the upward edges
alone -- the violations the bands cannot show on their own -- and now
`--edges upward|all|none` chooses. `all` draws the relation itself,
which is what a reader tracing one module's dependencies wants: in SVG
a downward edge runs from the bottom of its box to the top of the one
it names, a sideways edge dips below the boxes of its band, and an
upward one stays dashed and alert-coloured. `none` leaves the bands
alone. The default is what each profile drew before: `upward` for the
fixed grids (`text`, `svg`) and `all` for `mermaid`, which lays edges
out itself, so no committed figure moves. The text footer names every
edge the option shows, labelled by its direction. A view document
takes `edges` like any other option, and its enumerated values -- like
`order`'s -- are checked there rather than silently falling back.
`use-cases/16-module-deps` commits the drawn-edges figure as
`expected/diagram-layer-edges.svg`.

### The figures report a link the document has not decided

Both ports. **New loss code.** `graphOf` gains `disjunct`, the
positions of links written under an UNRESOLVED DISJUNCTION. Such a link
is not an edge (ADR-007: an unresolved disjunction is not a value, so a
link under one of its arms is not a fact), and the walk was right to
leave it out -- but it left it out in SILENCE, which is the failure the
views exist to avoid. Every figure now reports it as
`edges_in_disjunct` with the positions, so `--strict` refuses a figure
of a document that has not decided. The field is absent when there are
none, so a graph of a decided document is the shape it always was.

### `std/view`: the bundled schema for a figure declaration

Both ports. **New bundled source.** `@"std/view"` serves
`$.view.Figure`, the schema for one view-document declaration: every
option typed, `kind` and the profiles as closed disjunctions, the
counts non-negative. Spread it over the declarations
(`views: {&: $.view.Figure} & {...}`) and a misspelled option or a kind
that is not a kind is refused when the document is evaluated, naming
`std/view` as the other operand, rather than by the verb that reads it
afterwards. It is optional; a view document without it is read the same
way. Like `std/system` the source is served from the engine -- no
filesystem, no package resolution -- and `test/spec/std-view.tsv` pins
its canon and canon-hash in both engines, so the two copies cannot
drift. `use-cases/16-module-deps/views.aon` uses it.

### `aontu view --views`: the figures a document declares

Both ports. **New surface.** A projection that runs in CI belongs in a
file: `aontu view --views <path> <file>` reads a map of figure
declarations out of an ordinary document that includes the model, and
draws every one of them from ONE evaluation. A declaration's keys are
the view options -- the flags without the dashes -- and each names its
own `kind` and the `out` file it draws into, resolved against the view
document's own directory so the gate passes from any working
directory. `views` is the author's key and nothing in the engine knows
the name (ADR-010). Nothing is written unless every figure rendered;
`--check` compares the whole set and names every difference, `--strict`
turns any figure's loss into exit 1, and the exit code is the worst of
the figures'. A declaration that names an option that is not one, gives
a value of the wrong shape, or leaves out `kind` or `out` is the new
`view_document_shape`, reported for every faulty declaration at once
and before anything is drawn; the `poset` is refused there, because it
compares several documents. Library: `viewSet(src, options)`
(TypeScript), `Aontu.ViewSet(src, options)` (Go), returning
`{verdict, views, errors?}` -- the caller writes the files.
`test/spec/views.tsv` (the new `views` mode) pins both ports on the
declarations, every refusal and every figure's bytes.
`use-cases/16-module-deps/views.aon` declares all seven of that case's
figures and its `check.sh` gates them in one run.

### `aontu view --as svg`: the cell-based figures as SVG

Both ports. **New profile.** `tree`, `matrix`, `layer`, `sets` and
`layers` render as a standalone SVG under the design's integer rule:
8 units per character, 20 per line, every coordinate a whole number
from the counts that lay the text figure out, so no font is measured
and both ports emit the same bytes. Each figure carries its own style
block and takes its colours from CSS variables (`--av-ink`, `--av-bg`,
`--av-rule`, `--av-closure`, `--av-warn`, `--av-alert`, `--av-bar`,
...), with defaults where a host page sets none, and a description in
`aria-label`. The matrix fills direct cells, tints the closure, marks
an unmirrored edge and rules the diagonal; the layers draw an upward
edge as a dashed arrow between its boxes; the panels draw their bars
and dots. The node-link kinds stay Mermaid and DOT. **Correction**,
both ports: the `layer` figure of a document with no edges named its
relation as `undefined` (TypeScript) or as nothing (Go); the footer
now reads `# -: 0 downward, 0 sideways, 0 upward` in both. A set name
or element holding a line terminator is refused (`view_line_break`),
as a layer name already was. `test/spec/view.tsv` pins every figure.
Use cases 01 and 16 pin their SVG figures beside the text goldens and
embed them in their READMEs.

### `aontu view`: every figure of the design, drawn by the engine

Both ports. **New kinds, new flags, one verb.** `aontu view <kind>`
now draws the figures of `docs/design/VIEWS.0.md` and
`VIEWS-ORDER.0.md` from a finished model, as deterministic text: the
`tree` (as before), the `matrix` (dependency-structure matrix over one
relation, `--order canon|partition`, `--closure`, the `!` unmirrored
mark, a stacked index header at ten rows), the `graph` (node-link, as
`mermaid`, `dot` or `er`, with `--group-by` and `--label` read off each
node, a declared inverse's mirror suppressed, injective `n_`/`nq_`
identifiers and per-code-point escape tables), the `layer`
(architecture bands from a `--group-by` field, in the derived order or
`--layers`, upward edges named), the `sets` panel (UpSet over a set
family: `--sets`, `--member`, `--universe`, `--min-degree`,
`--max-cols`), the `layers` panel (which document wrote which path,
from the provenance record, `--min-size`), the `ladder` (the `why`
record at `--at`, one rung per contribution in rank order) and the
`poset` (the subsumption order over several files, quotiented by
mutual subsumption, covers over the closure, undecided pairs dashed).
Every run carries a LOSS REPORT on stderr (`hidden_contribution`,
`unresolved_field`, `cycle_block`, `cols_elided`, `order_*`; and the
informational `edges_deduped`, `inverse_suppressed`, `crossings`),
which makes the verdict `lossy` and, under `--strict`, exit 1.
`--out <file>` writes the figure and `--check` gates a committed one;
`--max-rows` refuses rather than truncates (exit 2); `--as` picks the
profile; `--at` restricts. Refusals are findings with new codes
(`view_kind_unknown`, `view_profile_unknown`, `view_rows_exceeded`,
`view_line_break`, `view_relation_ambiguous`, `view_sets_shape`,
`view_sets_required`, `view_at_required`, `view_group_required`).
Library: `view(src, options)` (TypeScript), `Aontu.View(src,
options)` (Go); the MCP tool `view` takes every kind but the poset.
`test/spec/view.tsv` pins every kind in both ports. Use cases 01, 04,
08, 12 and 16 draw their figures with the verb, and 16 gains the
architecture layers; `use-cases/tools/diagram.js` is retired.

### The graph walk descends a residual conjunction, and flags hidden edges

Both ports. **Correction.** `graphOf` stopped at a residual
conjunction, so a link inside `unique() & [&: refer(), x]` -- the
shape every checked member list has -- was not an edge, and a
`relations` or `reaches` verdict over such a model could say
`unreachable` for a link the document plainly writes (VIEWS.0.md,
Phase 0). The walk now descends a `ConjunctVal`'s terms at the same
position; an unresolved disjunction stays opaque (ADR-007). Edges sort
on the total key `(at, from, key, to)`, and an edge written inside a
`hide()`-marked subtree carries `hidden: true`, which the figures
decline to draw and report instead. This can flip a `reaches` verdict
from `unreachable` to `reaches`, and the flip is the correction. Two
engine divergences the figures exposed are recorded as
use-cases/BUGS.md 70 and 71.

### `WhyConjunct.rank`

Both ports. **Addition.** A `why` contribution that is a preference
now carries its 0-based `rank` (`*x` is 0, `**x` is 1), the engine's
own number rather than a count of stars in a canon string; absent for
anything else.

### `aontu view tree`: the dependency tree of a relation, drawn by the engine

Both ports. **New verb.** `aontu view tree [--relation <name>]
[--root <path>]... <file>` draws the link graph of a finished model as
the dependency tree a reader of `cargo tree` expects: roots derived as
the nodes nothing depends on, a shared subtree expanded once and
marked `(*)` after, an edge that closes a loop marked `(cycle)` rather
than walked, and labels shortened to the least path suffix unique in
the drawing. A declared inverse pair draws as one edge; a mutual
relation stays two. A relation with no edges (`view_relation_unknown`,
new, class `reference`) and a root that is not a node of the drawn
graph (`refer_unresolved`) are refusals, exit 4, because an empty
tree and a typo are the same file on disk. Library: `viewTree`
(TypeScript), `Aontu.ViewTree` (Go); MCP tool `view`; shared rows in
`test/spec/view.tsv`. It is the `tree` kind of
`use-cases/tools/diagram.js`, ported: use-case 16's three tree goldens
are the acceptance test and now come from the verb.

### A type flow nested inside another one is deferred, not dropped

Both ports. **Soundness.** `refer(t)`/`rel(t)` skip their meet where it
would re-enter a target another flow is already inside — the guard that
stops the evaluator running its own stack out — and the skip took the
flow's RECORD with it. That is sound only when both flows carry the
same type: a nested flow carrying a different one was lost for good,
and which of two flows was the nested one depended on which link the
evaluator reached first. A rule declared on one field and reached
through another node's link therefore held in one declaration order
and not in the other. The record is now written whether or not the
meet is skipped, so the flow lands through `applyFlows` instead of
being destroyed; the guard is untouched. (use-cases/BUGS.md 69.)

### A discarded alternative no longer asserts its types on the model

Both ports. **Soundness.** `refer(t)` and `rel(t)` assert `t` on
another node, and a disjunct member trial was transactional over the
error list but not over the two channels that flow commits through, so
EVERY alternative's assertion landed on the target and the records were
met together — leaving the target more constrained than any single
alternative licenses:

    x: ({k:1, d?: refer({z:1})} | {k:2, d?: refer({w:2})}) & {k:1, d: path($.y)}
    y: {}

answered `y: {"w":2,"z":1}`, the type of the alternative it discarded,
and answered with the engine's internal trial sentinel as an error code
when the two types clashed. A member's flow is part of that member: the
record is staged per trial and only survivors' records are merged, and
the write into the live tree waits for the trial to end.
(use-cases/BUGS.md 66.)

### A conjunct member sits at the junction's own position

TypeScript, restoring parity with Go. `JunctionVal.clone` left its
members' paths to the context cut, so a member reached through a
reference took the map's path instead of the field's — which stamped a
`rel()`-minted link with the ENTITY's key as its predicate, and
`inverse(n)` then looked for a mirror under a relation nobody declared
and called a written one missing. (use-cases/BUGS.md 67.)

### A document that cannot be generated is not blamed on its relations

Both ports. The relation verdict is decided after generation and only
when generation succeeded, and `aontu relations` asks generation first
and reports what it says. An unsettled disjunction used to surface as a
false `relation_inverse_missing` that buried the `disjunct_no_gen` that
actually stopped the document. (use-cases/BUGS.md 68.)

### A sixteenth use case: a layered module graph, drawn as a tree

`use-cases/16-module-deps/` models a codebase's own module graph —
twelve modules across four layers — and enforces "never depend on a
layer above you" with nothing but unification: `rel(t)` flows a
per-layer target shape into every module an edge names, so an upward
edge is a failed meet at the far end rather than a separate checking
pass. Thirteen assertions, including the layering refusal, a cycle
between same-layer modules, and both drawn views.

`use-cases/tools/diagram.js` grows a `tree` kind for it: an indented
dependency tree with derived roots and repeated subtrees elided
`(*)`, in the manner of `cargo tree`. Writing the case found a defect
in the tool's edge collapse — a MUTUAL dependency (`a dependsOn b`
with `b dependsOn a`) folded into one undirected edge, hiding the
shortest cycle a model can have. The collapse is now per key pair;
every existing golden is unchanged.

### The pipe operator is removed (ADR-018)

Both ports. **Breaking**: `|>` no longer parses. It was parse-time
sugar — `x |> f(a)` WAS `f(x, a)`, never in canon — and every
spelling it covered has the ordinary call form. Removed with it: the
operator in both published grammars (`grammar/aontu.gbnf`,
`grammar/aontu.lark`), so a constrained decoder cannot be told `|>` is
legal by the same release that stops parsing it; the
`pipe_target` error code, `test/spec/pipe.tsv`, and the one spelling
that could synthesise an unsited value (patch's span-verification
refusal is now unreachable through `patch` and kept as an exported
seam, `verifiedSite`, unit-tested in both ports).

### Fixed

- The arity message for a zero-argument builtin, in both ports:
  `map(1)` now says "map takes no arguments, but was given 1" — the
  renderer predated the zero-arity builtins (ADR-015's `map()`,
  `list()`, `acyclic()`) and claimed "exactly one argument".

### The builtin call surface is declared, and checked (ADR-017)

Both ports. The signatures of the built-in functions are now DECLARED
in the signature syntax itself (`test/spec/signature.tsv`, one line
per builtin — `pack(d: map|list, template t: any) : map`) and parsed
by a custom tabnas grammar in each port; the arity and positional
tables are derived from the parse, and a runtime signature gate
checks value-mode scalar arguments against the declaration.

- New error code `func_arg` (class `conflict`): a driven argument
  that does not fit the declared signature. Its hint renders the
  signature line and names the offending argument. **Breaking**:
  fifteen refusals that were bare `invalid-arg` now report
  `func_arg` — `upper`/`lower` operands, the arithmetic operands,
  `join`'s separator. Every bespoke code (`pack_data`, `pick_key`,
  `key_level`, the constraint atoms' refusals) is unchanged.
- The LSP now serves `signatureHelp` (the declared signature of the
  enclosing call, active parameter tracked) and renders each
  completion's detail as its signature, in both servers.
- The reference's functions and constraint-atom tables carry the
  exact rendered signatures, drift-gated against the registry.
- The declaration round-trips through both parsers over every line
  (`render(parse(line))` is the line), pinning the two ports to the
  one source. `make sig` regenerates the inlined copies.

### A string is never a path; paths meet by prefix (ADR-016)

Both ports. **Breaking**, tightening ADR-015 below: the string
bridges are gone. The `path(...)` call's own argument is the one
conversion — a string literal converts at capture, and a computed
argument (an expression, a reference to a string) evaluates first and
converts by the same grammar. Text with no anchor converts as
**relative** (`path("a.b")` is `path(.a.b)`, the address the raw
spelling captures; text that spells nothing once anchored still
refuses), so addresses stay buildable:

```aon
accountFor: refer() & path("$.customers." + key())
```

Everywhere else a string stays a string: `path() & "$.a"` refuses as
`integer & "x"` does (the kind no longer promotes), `refer()` refuses
a string address (`refer_address`), and `rel()` refuses string leaves
(`rel_address`). Data documents that carry addresses are Aontu
documents now — a JSON file cannot spell a path — and the corpus's
agent-emitted records moved from `.json` to `.aon` accordingly.

Two path values unify when one spells a **prefix** of the other, and
the result is the longer: `path($.a) & path($.a.b)` is
`path($.a.b)`; incomparable spellings refuse (`scalar_value`);
subsumption follows (a prefix subsumes its extensions). The refer
residual folds after plain values so sibling paths merge before it
settles, a second path peer refines a pending address by the same
rule, and the resolved link is itself a path value — canon renders
every address as the call (`refer(t)&path($.a)`). The string-domain
constraints treat a path as a string with more structure: `re()` and
`length()` check the spelling, and `neq(path($.x))` excludes by path
identity.

### First-class paths and the container kinds: `path(p?)`, `map()`, `list()`

Both ports. **Breaking**: `path(p)` no longer resolves its argument —
it **captures** it. The old meaning (resolve a path expression, the
function form of a reference) was fully redundant: every spelling it
covered has a bare-reference form (`path(x.a)` is `x.a`,
`path("team-pay")` is `$."team-pay"`), and the repository held no use
of it. The new meaning gives addresses a value of their own
(ADR-015):

```aon
a: {b: 1}
emb: $.a.b        # a reference: the value at the path
cap: path($.a.b)  # a capture: the path itself -> ".a.b" stays a name
```

A path value is a scalar under `string` in the kind lattice; meets
are syntactic (by spelling); generation emits the address string;
canon renders the call back. `path()` with no argument is the path
**kind**, which promotes a string that spells an address
(`path() & "$.a"` is `path($.a)`) and settles inside `type()` bodies
— so a vocabulary can declare a path-valued field and plain string
data meets it. `refer()` and `rel()` accept path values as
addresses: `path($.a) & refer()` is the checked link. New error code
`path_address` (class `parse`).

`map()` and `list()` are the container **kinds**: they admit exactly
what `{}` and `[]` admit and default to nothing, where the unit
literals default to empty — the spelling of "a map must be supplied
here", which no earlier form could say. Mismatches reuse the units'
own codes (`map`, `list`); neither function takes arguments (element
constraints belong to the spreads).

Pinned by `test/spec/path.tsv` and `test/spec/containerkind.tsv`;
design in `docs/design/PATHS.0.md`.

### The use-case corpus is a CI gate

No engine change; one job added to `.github/workflows/build.yml`.

`use-cases/run-all.sh` drives the real CLI end to end over fifteen
worked models — through files, includes, data merges and exit codes —
which makes it the only check here that can notice a removed language
feature still being used by a model. It ran on contributors' machines
and nowhere else.

The cost arrived with [ADR-014](ADR.md), which removed `id()`: four use
cases — 01-service-catalog, 05-rbac-policy, 10-data-model and
12-relations — were left broken on main while every suite stayed green
and every gate passed, and stayed broken across four merges until #107
and #109 repaired them. The engine was right; the corpus was never
asked. This is the job that asks it.

### `join(coll, sep?)` — the fold to a string

Both ports. The one primitive between a model and a generated file. A
spread can put a separator AFTER each element; putting one BETWEEN N
elements is a reduction over strings, and the language had none — `sum`
is numeric, `+` does not reduce a list, and indexed concatenation needs
the arity known in advance. So a generated SQL column list carried a
trailing comma and did not parse.

```aon
ports: [8080, 443]
addr:  join($.ports, "-")     # "8080-443"
lines: join($.rows, "\n")      # a file
name:  join($.parts)          # concatenation: the separator defaults to ""
```

**It folds with `+` seeded with `""`**, exactly as `sum` folds with
`add` seeded with `0`, and not as a figure of speech: the member
renderer is the function `+`'s own string branch calls, so the language
keeps exactly one answer to "how does a number become text" and the two
cannot drift. No `0d` marker, no `.0` float suffix, a big integer's
exact digits.

`join([])` is `""` — concatenation's identity, the parallel of
`sum([]) == 0` and the opposite of `least([])`, which refuses because
comparison has none. Order is source order for a list and code-point
key order for a map, which is `each`'s rule and `pick`'s.

**Members are validated before the fold**, and the split matters. A
settled non-text member — a map, a list, a null — is `join_member`
(class `conflict`), refused at the member: `+` with a string on the
left *residuates* on those rather than refusing, so folding blindly
would report the failure at generation, naming the whole call instead
of the member. A member that is merely UNRESOLVED is not a join failure
at all; the call stays residual and generation reports ordinary
incompleteness, so `join` can be written in a schema over data that has
not arrived.

The separator must be a string (`invalid-arg` otherwise). A number
would render perfectly well through `+`, and is still refused: the
separator is not a member of the fold but the parameter naming the text
between members, and `pick`'s key argument draws the same line.

One new error code, `join_member`. No grammar change beyond the name
itself. `test/spec/gen-join.tsv`, 47 rows run by both runners.

Downstream, `use-cases/15-code-generation` changed shape: its
transforms now compute the whole FILE rather than its lines, the
host-side fold is gone, and the check that proved the gap — the SQL
golden REFUSED by a real parser — is inverted. The SQL parses, and
`check.sh` opens it in SQLite and asserts the tables and columns the
model describes really exist.

`aontu.lark` also gained `acyclic`, `inverse` and `rel`, which it had
been missing since those builtins landed: its test compared rule NAMES
only, so the alternation could drift. It now gets the literal check the
gbnf grammar has.

### `id()` is removed; `refer()` addresses tree paths

**Breaking, both implementations.** The identity mark gave any node a
second, global name, and every node in one evaluation carrying that
name was unified with every other. It is removed
([ADR-014](ADR.md#adr-014--the-tree-is-the-namespace-there-is-no-identity-mark)).

The collision hazard a global namespace implies is not what decided
it. The deciding cost is that **a model carrying an `id()` could not be
instantiated twice**: two mounts of one file were one entity, so a
per-instance override was a contradiction, and the bare `id()` escape
hatch did not help — it names itself by its enclosing key, which is the
same key in both instances. Only the full path disambiguates, which is
the argument.

**What replaces it.** Bringing two descriptions into contact is a
reference, written at one of the two sites:

```aon
catalog: pay: { tier: 1 }
deploy: pay: $.catalog.pay & { replicas: 3 }
```

A contradiction between the views is the same located error the shared
id produced, at the same path, with the same code. The reference is
directional, which is what stops two unrelated models merging because
they chose the same word.

**`refer(t?)` keeps everything that made it worth having** — a link
rather than an embedding, checked existence, constraint flow into the
target — and now takes a tree address:

```
$.services.auth   from the document root
.auth             beside the link itself
..auth            one level up from there
```

Relative addressing is new capability, not a consolation: a link
written `..auth` resolves inside whichever instance holds it, so one
file mounted at two paths gives two self-contained instances.

**The derived graph is path-native.** There is no entity index, because
a node's address is its path. A link's source node is derived from
where the link sits rather than declared by a mark, and `Edge.to` is
the RESOLVED path — a relative address means a different node from each
position it is written at, and an edge set whose far ends were
spellings could not be traversed. The link's own value is still what
the author wrote. `relations` and `reaches` take and report `$.dotted`
node paths.

**Removed:** the `id` builtin (the roster goes 41 → 40); the codes
`id_name`, `id_conflict`, `id_ancestor` and `id_spread`; the identity merge, its
registry and its rider in `unite`; identity's canon and canon-hash
wrappers (two documents that differed only in their ids no longer
differ at all); and the three clearing rules, which existed only to
stop a global name leaking through a reference clone, a `copy()`, or a
spread template. Relation predicates are unaffected —
`inverse(dependedOnBy)` is a vocabulary term, not an address.

`id_ancestor` and its refusal go with the mark. It was added in this
same unreleased cycle, for a document that named a node and its own
descendant one entity and made both engines build a value containing
itself — a host stack overflow with no `[aontu/…]` code, unrecoverable
in Go. Nothing can ask for that shape now: two positions are one node
only if they are the same path, and a path does not contain itself.

**Two long-standing TS/Go divergences close with it**
(`test/spec/divergent.tsv`): Go's derived graph losing most of its
edges on a two-view model, and the id-spread refusal pathed differently
by each port. `AONTU=<go binary> use-cases/01-service-catalog/check.sh`
now passes all 20 assertions.
### `why` says `spread` however the statements are spaced

TypeScript only. `why` annotates a contribution that came from a `&:`
template rather than from the key itself — but only when the template
and the keys were written in ONE statement. Written as two duplicate
statements the template arrives from the other side, and that arm
never marked it, so the same document reported the role or dropped it
on nothing but the author's spacing. The Go port, and this port's own
list twin, already marked both sides.

The two-spread half of that entry is untouched and still open: spreads
written in separate statements are combined before `why` sees them, so
one contribution is shown carrying the merged value at the first
template's position. Separating them means changing when spreads
combine, not what the report walks. Was `use-cases/BUGS.md` §55, now
partly fixed.

### A spread template is applied once, however deep the reference

TypeScript only. A bag with `&: {n: key()}`, read through a reference
four or more levels down, refused with `scalar_value` at a **doubled**
path (`$.a.b.f.x.n.n`) where Go answered — while two and three levels
agreed in both ports. A threshold at four is a fixpoint artefact
rather than a rule anyone wrote, and Go's four-level answer turns out
to be the agreed three-level answer with one more level of nesting,
character for character. Go was right.

The bag loops already keep a template from being applied twice, by
recording which template has been merged into a value. But that mark
is by template IDENTITY, and every value takes a fresh id when it is
constructed — so a reference resolving to a templated bag, which
clones the bag *and* its template, produced a template the mark could
not match. The template was applied a second time over the value the
first application had produced: `n: key()` had answered `"x"`, the
template met that string as though it were a map, and the inner
`key()` answered `"n"`.

A spread template now takes a stable identity that its clones carry.
Was `use-cases/BUGS.md` §50.

### `jsonschema` no longer drops `deprecate()` in silence

Both implementations. `deprecate(x, meta)` exported as `x` alone: no
`deprecated` keyword although 2020-12 has one, and no loss line even
under `--strict` — against this verb's own rule that nothing is
dropped in silence. It was the only silent drop in the export surface.

The flag now crosses, because it is exactly the annotation JSON Schema
has for this. What the deprecation SAYS — the record's `msg`, `use`
and `since` — has no field in the draft, so it is reported as a loss
rather than invented into `description`: the exporter emits no
`description` anywhere, and quietly redefining it as a deprecation
note is a mapping a consumer cannot undo. A record that says nothing
(`deprecate(x, {})`) loses nothing and reports nothing.

`aontu jsonschema --strict` consequently exits 1 on a deprecation
carrying text where it used to pass. Was `use-cases/BUGS.md` §56.

### `match` and `filter` answered differently in the two ports

Go only. A list is a POSITIONAL structure, so a peer of another length
cannot narrow it, and both ports carry the same length gate for a
TRIAL meet. TypeScript's `trialUnify` set the flag that gate reads;
Go's never did, setting it only on the disjunct-member path — so the
gate could not fire from a combinator or from the preference
distribution:

| source | was, in Go | now, both ports |
|---|---|---|
| `match([1,2], [], "hit", "miss")` | `"hit"` | `"miss"` |
| `filter([[1],[1,2]], [])` | every element | none |
| `a: *[]` / `a: [1]` | `{"a":*[1]}`, exit 0 | refused, `empty` |

`match` selected the other arm and `filter` made the **opposite**
selection, both silently and at exit 0 — the silent-wrong-output class,
in the two combinators a transform layer dispatches on, and in the
operator ADR-004 and ADR-011 are built on.

The fix is one flag, saved and restored so a nested trial cannot clear
the outer one. Its reach was the real question, since the same call
drives every `*x & peer` distribution in Go: the preference rows for a
trial peer of a different length were written from the canonical
port's answers and run against Go **before** the change, where they
failed exactly as predicted while the boundary rows passed. After it,
all pass and the rest of `pref.tsv` is unmoved. Was
`use-cases/BUGS.md` §61.

### `pick` and `each` agree on one key order again

TypeScript only. `bagChildren` sorted a map's keys with a bare
`.sort()`, which is JavaScript's UTF-16 **code unit** order: an astral
key is a surrogate pair beginning `D800`-`DBFF`, so it sorted below
everything in U+E000-U+FFFF. `pick` therefore answered in a different
order from `each`, from the map's own canon, and from Go — which sorts
UTF-8 bytes, i.e. code points.

`pick` is the order-preserving projection a generator turns a bag of
records into ordered lines with, so this was one model producing two
different files. It now sorts with `cmpCodePoint`, the order
`ts/src/keyorder.ts` exists to state and the one every other emitting
site in the port already used. `sum`, `least` and `greatest` share
`bagChildren` but fold order-insensitively, so `pick` was the only
observable divergence. Was `use-cases/BUGS.md` §62.

### `vet --at` sees a `%alias` again in the Go port

Both implementations. An anchor is a subtree LIFTED out of the schema,
and an absolute reference inside it — a `%alias` target (`[&: %U]` is
`$.%U`), or a recursive residual's `$.spec.Step` — names a sibling of
the document root the lifted subtree no longer has. Go's reference
walk saw only the meet's root, so an alias-heavy schema under `--at`
was **invalid in Go and valid in TypeScript**: the Go CLI failing
builds the canonical implementation passes, in the verb whose whole
purpose is to be that gate.

Go already had the tree — `Ctx.fixroot`, the settled schema root vet
sets under `--at` — and `RecurseVal.body` already read it. The
reference walk now reads it too, as TypeScript's `RefVal.find` does.

**A site fix rides with it, in both ports.** Each stamped the schema
url onto the lifted anchor alone, so a value reached through the root
fallback carried no url: Go reported `-1:-1` naming no file, and
TypeScript gave the right coordinates while naming no file — against
the rule that every site names the file whose text it excerpts. Both
now stamp the settled schema root, and stamping fills only an EMPTY
url, so nothing read through an include is renamed. Was
`use-cases/BUGS.md` §59.


### An include's extension decides what the file is

Both implementations. `@"file"` read a file, and what the engine did
with the bytes depended on the extension — differently in each port, so
the same document and the same file evaluated to different values.
TypeScript handed every non-`.aon` file back as raw TEXT; Go parsed
everything as Aontu source; `.json` crashed TypeScript with an
unhandled internal error carrying no code, path or site.

[ADR-012](ADR.md#adr-012) settles it with one table, and the table says
which of two things a file is. `.aon` and `.aontu` are **Aontu source**
— the language, with everything in it. `.json`, `.jsonld`, `.jsonc`,
`.json5`, `.jsonic`, `.jsc`, `.toml`, `.yaml`, `.yml` and `.ini` are
**configuration data**, read by that format's own parser:

    port: integer
    hosts: [string]

    @"server.toml"

Every one of those formats maps onto JSON, which is why one word covers
them — a `.toml` file is a map of scalars, lists and maps, and so is
the `.aon` file that unifies with it. What a data format does not get
is the language: a `&` in a YAML file is a YAML anchor, not a spread
key, because the YAML parser reads it. **Both ports run the same
parsers** (@tabnas, one per format), which is what lets the shared spec
rows hold them to one answer.

A format's own semantics apply: `.ini` has no types, so `port=8080`
from a `.ini` is the string `"8080"`. `.csv` is deliberately absent —
the two ports' CSV parsers disagree about what a CSV file is, and
ADR-001 does not admit that.

Every other extension, and a name with no extension, is refused by
name:

    include not readable: notes.txt (extension: .txt)

The refusal is `include_extension` (class `parse`), raised in the
resolver rather than injected as a value, so a bare-member include
cannot vanish in the merge and leave a plausible, partial document.

**`.js` is no longer includable.** multisource's `js` processor
`require()`d the file in the evaluating process, so `@"x.js"` was
arbitrary code execution — the hazard `docs/trust.md`, the MCP server
and three verbs each warned about. It is now refused by the same rule
that refuses `.txt`. The TypeScript package leg narrows with it: a
`@"some-pkg"` resolving to a `.js` entry point refuses. The module
system (`aon_vendor/`) is unaffected.

This was `use-cases/BUGS.md` §49, and it unblocks
`docs/design/ONTOLOGY.0.md` phase P1, whose vocabularies all ship as
`.json` or `.jsonld`.

### Security: a module path could escape its store

Both implementations. `aontu mod vendor`, given a lockfile naming a
module whose path contained `..`, copied that module's source tree
**outside the project directory** and reported `verdict: ok` with exit
0. The module-path pattern's element class admits `..`, and `pathJoin`
/ `filepath.Join` *clean* a `..` element rather than refusing it, so a
store path built from one resolved above the store:

    corp.example/../../etc/passwd@1   ->   <store>/../etc/passwd@1

Exploitation needs a `mod-lock.aon` supplied by an attacker — a
hostile repository that is cloned and vendored — and the read path was
already contained under a `root` trust capability. The write path was
not contained at all. Affects `aontu@0.53.0` and `go/v0.1.11`.

A module path is now **validated before anything is built from it**, by
Go's module-path rules: no element may be empty, begin or end with `.`
(which is what forbids `..`), or be a reserved device name, and the
path is bounded in length and element count. The refusal is a new code
`module_path`, and it names the rule that was broken. The same gate
applies to lockfile and `dep` keys, so a lockfile written before the
gate existed cannot bypass it.

The routing predicate is unchanged: a path it rejects still falls
through to the file resolver, so no document that resolves today is
re-routed.

**Uppercase in a module path is now escaped on disk** as
`!`+lowercase, Go's proxy rule. `corp.example/Widgets` and
`corp.example/widgets` were two lockfile identities and one directory
on macOS and Windows, so whichever was written second silently served
both. The written path remains the identity.

One parity hole surfaced with the fix and is closed: TypeScript's parse
layer recognised module refusals from a longhand list of codes, so a
newly added one surfaced as `unexpected error` where Go printed it
correctly.

### The star is sugar; the disjunction is the structure

Both implementations. `a: *x` and `a: *x | super(x)` were two
mechanisms that agreed on the common case and disagreed in six places.
[ADR-011](ADR.md#adr-011) makes the long form the structure and the
short form sugar for it, and the meet now distributes over the
disjunction the star stands for:

    *x & peer   ==   (x & peer)  |  (super(x) & peer)

The preferred value answers first, so a peer that merely narrows the
default leaves it **standing**: `*8080 & min(1024)` is still `*8080`,
where it used to drop the default and answer the bare constraint. Only
when that arm is empty does the type answer, and that is the override.
When both are empty the refusal is `empty` — one code for a rejected
override, whatever the shapes, in place of `no_scalar_unify`,
`scalar-type` and `not-scalar-type`, which named the gate's own inner
meet rather than anything the author wrote.

**The gate is `super()`**, so the kinds of default that never had one
now do: `*integer` admits `7` and refuses `"s"`, `*min(3)` gates on
`number`, and a map or list default is gated leafwise — `*{p:1}` meeting
`{q:2}` **merges** and keeps the `p` default (it used to be replaced
outright), while `*{p:1}` meeting `"s"` refuses (it used to take the
string). The replace-anything reading stays spellable as `*{p:1} | top`.

**Two defaults of the same rank that disagree** refuse as
`pref_rank_clash`, whose hint names the fix, in every spelling — `*1`
beside `*7`, and `*1|*7`.

**Rank orders the surviving arms** instead of collapsing them at parse:
`*1 | **2` generates `1`, and generates `2` once something rules `1`
out. The ladder used to be discarded before the member trials ran, so
eliminating its lowest rung lost the whole default.

Canon and the `aon1-` hash keep the written spelling: the desugaring is
semantic, never a parse-time rewrite.

**Breaking.** `|:empty` and `|:empty-dist` are renamed `empty` and
`empty-dist` — the registry's one sanctioned rename, recorded in
ADR-011, because the `|:` prefix named a spelling a bare `*x` default
never had. A default the peer satisfies now survives in canon (`*1 & 1`
is `*1`; the generated value is unchanged). Eighteen pinned rows moved,
listed in `docs/design/DEFAULTS.0.md`; `test/spec/defaults.tsv` adds 29.

### `super()` answers the immediate parent type

Both implementations. `super(x)` answered `top` for everything the
lattice primitive could not name — maps, lists, preferences,
disjunctions, constraints — which is sound and useless. It now answers
the immediate parent type structurally: maps and lists lift child by
child, preferences unwrap, disjunctions distribute, and a constraint
answers the kind it constrains. `top` remains only where `top` is the
immediate parent. A recursion residual's lift stays symbolic, finite in
canon. See `docs/design/SUPER.0.md`.

The TypeScript CLI's error frames stripped the working-directory prefix
with a hardcoded `/`, so a Windows run named an absolute path where
POSIX — and the Go CLI — named the file as typed.

`go/aontu`, a binary committed once and never rebuilt, is removed from
the repository.

## Go 0.1.11 — 2026-08-28 · TypeScript 0.53.0

### The gate agrees with the evaluator about size

Both implementations. The 2026-08 review's finding C, second half:
"for every schema S and data D, `vet(S, D)` and `eval(S ∪ D)` must
agree on accept/reject". Two of the five defects it named
(`use-cases/BUGS.md` 16 and 17) were still open, and both were
`vet` answering **valid** for data the evaluator refuses.

**"Sizing atoms fold last" was only half the rule.** Sorting `length`
and `unique` to the end of their conjunct does not help when the
container settles in ONE document and still gains members from
another: the data half of a `vet` meet, an `@` include, a later
`pack`. The atom counted whatever the container held when its own
layer settled — for the ubiquitous template-plus-bound spelling,
nothing at all — discharged itself as satisfied, and vanished. Three
entries then vetted clean against `length(max(2))`, duplicate labels
passed `unique()`, and `length(min(1))` refused the schema it was
written for.

A sizing verdict is now taken only when **more members cannot change
it** — members accumulate under unification and are never removed. An
upper bound violated, a lower bound satisfied and a duplicate found are
permanent and decided at once; everything else **residuates** and is
decided at **generation**, where nothing more can arrive. A residuated
atom is visible in canon, which is honest: the value really does still
carry the constraint.

**A `must` over a container residuates with them**, for the same reason
and fixing the same class: `must({t: max(60)}, …)` beside a
`{t: integer}` schema was answered against the schema layer alone, so
the cross-field form — the form cross-field rules need — vetoed
same-file and vanished under `vet`.

**And `vet`'s generation probe now counts conflicts**, not only the
`incomplete` class — the *other* engine cause the review named. A
contradiction raised at generation is a contradiction; dropping it left
the verdict `valid`. The `vet-equals-eval` harness caught this the
moment the first fix landed, which is exactly what it is for.

**A container that cannot generate cannot be counted**, and a schema is
exactly that: the members of `{a: integer}` are types, so nothing is
emitted. Discharging the atom there was the same defect wearing its
other face — `length(min(2)) & {a: integer}` dropped its bound while
still alone, so the data half of the meet was never measured. It
residuates now, and is decided at generation like every other
provisional reading.

**The verdict is read by class, not by stage.** Whatever the meet found
counted as contradiction and whatever generation added counted as
incompleteness — positional, and no longer true once a sizing atom
could hold its reading until generation. An error-severity finding that
is not incompleteness now makes the document `invalid` wherever it was
found; warnings still never touch the verdict.

**`--at` keeps the atom it anchors on.** The anchor walk handed back the
container inside a residue, dropping a constraint the author wrote at
that node, so `vet --at $.x` passed data the evaluator refuses.
Stepping THROUGH a residue is still right — `$.x.a` names a key
whatever its container must satisfy — but arriving at one no longer
discards what it must satisfy.

Four use-case gap pins flipped from pinning the defect to pinning the
fix (05's cross-layer folding pair and its `must` pin, 09's duplicate
labels, 06's `length(min(1))`-beside-a-generator probe, which moved
from the expected-failure list to the goldens).

### Relations that enforce, and a graph you can ask questions of

Both implementations. The 2026-08 review's finding J: aontu is "a sound
entity-and-edge substrate whose query and constraint layers over that
substrate are one more capability review away". The review named a
concrete slice — "make `relations` enforce `target`, add
`unique()`-by-projection, and ship a transitive `reaches(a, b)` check
verb". `unique(k)` landed with the arithmetic family; here are the
other two, and the defect that made the first of them worth nothing.

**`refer(t)` in both directions no longer eats itself** (`use-cases/BUGS.md`
19). The flow unifies `t` into the target, and uniting a target drives
the target's own subtree — so a pair that links back at each other, the
shape *every* inverse relation has, flowed into each other until the
depth budget or the host stack ended it. Two lines were enough:
`a` typed-refers `b`, `b` typed-refers `a`, both `{kind: service}`, and
the evaluator reported `unify_cycle` on a meet that is a fixpoint on
sight. A flow that would re-enter an entity is now skipped — the flow
it is nested in is already uniting that entity — and nothing is lost,
as the differs-each-way and cycle-of-three rows pin. Use case 01 now
carries the documented idiom `refer($.std.Service)` on **both**
directions of a real model, and its gap 8 workaround is gone.

**`relations` enforces `target`.** The field looked like a typed
endpoint declaration and was read by nothing, on the reasoning that
`refer(t)` already flows the type in at the site. It does — which is
exactly why the declaration was worth nothing, because the site then
has to repeat it, and the idiom that avoids repeating it was the one
that ate itself. Satisfaction is the meet **and not merely the absence
of a conflict**: a target key the far end does not have unifies happily
and leaves a hole, so the check asks what `refer(t)` answers at the site
— can the far end still generate once the target is met? — and compares
it with the far end alone, so a node already incomplete for its own
reasons is not blamed on the relation pointing at it. New code
`relation_target_unmet`; the check never writes, because flowing the
type in here would be generation.

**`aontu reaches <from> <to>`**, a verb in both ports plus a library
call and an MCP tool. `relations` asks about the edge set; this asks
the question that needs the *closure* — does anything `from` links to,
at any remove, end up at `to`? — which is the shape of every
blast-radius question an operator asks and every containment question a
policy asks, and which cannot be put one edge at a time. The path is
the answer, not decoration: a shortest one, and among shortest ones the
first in code-point order, so it is the same path in both ports.
Transitive and **not** reflexive-transitive: an entity reaches itself
only through a cycle. `--relation` follows one relation, which is the
difference between "can this reach that at all" and "can it reach it
*this way*" — and on a model that writes both a relation and its
inverse, the second question is the only interesting one. An endpoint
naming no entity is a refusal, not a `no`.

**A critical defect found on the way, and NOT fixed** (`use-cases/BUGS.md`
42, `test/spec/divergent.tsv`): on a two-view id-merged model, Go's
derived graph has 6 edges where TypeScript's has 40, so `aontu
relations` reports **no cycle** in Go where TypeScript reports a real
one. It is not new — the pre-change Go binary loses the same edges —
and it went unseen because `use-cases/run-all.sh` drives the TypeScript
CLI and nothing had run a use case through the Go one. Use case 01's
`check.sh` asserts the cycle, so the Go CLI fails that check today
rather than passing it quietly.

### Arithmetic, aggregation and projection

Both implementations. The 2026-08 review's finding I, the
expressiveness walls that "fall on the wrong side of what total
combinators can do". Ten new built-ins, 24 → 38, and one defect they
uncovered on the way.

**Arithmetic arrives as functions: `add` `sub` `mul` `div` `mod`
`rem`.** The tokens `-` `*` `/` `%` stay reserved, as the design's
boundary requires, so there is no infix arithmetic to learn beyond `+`.
The semantics are the ones
[G8 pre-registered](docs/capability-review/g8-generation.md#arithmetic-semantics-pre-registered):
the exact ladder and R5 kind contagion the number tower already had,
integer division truncating **toward zero** (`div(-7,2)` is `-3`, not
`-4` — stated by the language rather than inherited from whichever host
`/` each port calls, since Go's `Quo` truncates and its `Div` floors),
and `rem`/`mod` differing only in whose sign the answer follows, the
dividend's and the divisor's, which is the whole reason both exist.

The family is **numeric where the operator is polymorphic**, and that
is what makes `add` more than a second spelling of `+`. A Kubernetes
quantity written `"500m" + "500m"` is the string `"500m500m"` and
nothing complains; `add("500m","500m")` is a located error, because a
function named for a numeric operation has no business inventing a
string.

Three refusals, each because the answer would be a value Aontu cannot
carry: a zero divisor in any leaf including floats (`divide_by_zero`),
a non-finite binary64 result (`float_overflow`), and `div`/`mod`/`rem`
over a bigdecimal (`inexact_divide`) — one third has no finite decimal
form, so exact decimal division either rounds, which is the one thing
that leaf exists to prevent, or refuses.

**`float_overflow` fixes a defect `+` already had** (`use-cases/BUGS.md`
39): `1.0e308+1.0e308` used to escape as `[aontu/internal]` in
TypeScript and as Go's raw `json: unsupported value: +Inf` — no code,
no site, invisible to any harness grepping `[aontu/`. A Go CLI test
pinned the marshaller error as expected; it now asserts the located
refusal instead.

**Aggregation: `sum` `least` `greatest`** fold a finite, settled bag —
a list, or a map in sorted-key order. `sum` folds with `add`, so the
number tower's whole law comes with it. They are named `least` and
`greatest` rather than `min` and `max` because those two are already
the constraint atoms for a lower and an upper *bound*, and an aggregate
over a set is a different thing from a bound on a value. `sum([])` is
`0` and `least([])` is an error: addition has an identity, comparison
has none, and answering with a zero or an infinity would invent a value
the data does not contain. Comparison is exact — `0d9007199254740993`
and `9007199254740992` share a float image and are still ordered
correctly.

**Projection: `pick(d, k)`**, one element per child of `d`, being that
child's `k`. Without it the aggregates cannot reach the case that
motivated them, because `sum` needs a bag of numbers and a model holds
a bag of records: `total: sum(pick($.lines, amountCents))`. It is not
`each` with a clever template — `each` *meets* each child, and a meet
cannot select. A child missing the key is an error, not a silently
shorter list.

**`unique(k)` spends the reserved arity.** `unique()` compared whole
members, so "no two services share a port" and "event ids are unique"
were inexpressible and two records differing anywhere else slipped
through. The atom's single argument is now the projector the reference
had reserved it for. A member without the key fails rather than being
skipped; `unique(a) & unique(b)` demands both; canon sorts the keys.

Use case 10's gap 3 (no aggregate computation) and gap 8 (no uniqueness
by projection) are closed, and its checks now assert a derived invoice
total and a caught duplicate ledger id where they used to assert the
absence of both.

**JSON Schema export: `aontu jsonschema`.** The other half of finding
I's interop wall. The constraint algebra maps onto JSON Schema's core,
so the mapping is now specified and executable rather than left to
whoever needs it first: `re` becomes `pattern`, `min`/`max` become
`minimum`/`maximum`, `length` becomes the string/array/object length
keywords per type, a disjunction becomes `anyOf` (or `enum` where every
member is a literal), a preference becomes `default`, `close()` becomes
`additionalProperties: false`, an optional key is simply absent from
`required`, and a list with a spread template becomes `items` where a
written list literal becomes `prefixItems` plus `items: false`. Draft
2020-12, on stdout, so `aontu jsonschema x.aon > x.schema.json` writes
a usable file. Also an MCP tool and a library call in both ports.

**A loss is never silent.** What JSON Schema cannot say — `must()`, an
exact numeric leaf, an unresolved residue — is reported on *stderr*
beside the schema rather than instead of it, because a weaker schema is
still a usable one and the reader needs to know which. `--strict` turns
the report into a refusal for the CI job that would rather fail than
ship a schema weaker than its model; `--format json` puts both halves
in one envelope.

**A documented wire convention for money**, which finding I asked for
ahead of any new machinery. Money crosses the wire as a *decimal
string* validated by `re()` at a fixed scale, with an optional-but-
constant **conversion mark** (`dec?: "bigdecimal:2"`) naming the leaf
and the scale — optional so a producer is never asked to send it,
constant so one that does cannot contradict it, and exported as a
`const` outside `required` so a consumer holding only the JSON Schema
still learns both. `docs/how-to.md` carries the convention and the
three details that decide whether an implementation of it is correct:
the sign goes *outside* the `0d` prefix, scale is not part of the value
(`0d10.50` and `0d10.5` are the same number), and at scale 0 the point
must still be written or the value lands on the `biginteger` leaf.
`use-cases/10-data-model/money-wire.aon` and `money-convert.aon` are
the executable form, and gap 1 — "exact money is unreachable from plain
JSON" — is answered.

**A finding that named the record instead of the field**
(`use-cases/BUGS.md` 41), found by the money probe running both engines
and diffing. A `NilVal` took its path from the operand it blames, which
decides the *site* correctly and the path only by accident: every
conflict inside a referenced record reported the record's path — the
same path for every one of its fields — and a conflict against a
*minted* operand, a preference's yardstick or an arithmetic result,
reported `$`, the whole document, in both ports. The path now comes
from the location the meet is being driven at, where that extends the
operand's own. One case remains open and is recorded in
`test/spec/divergent.tsv`: a reference to a target *deeper* than the
referring field still leaves one stale segment in TypeScript.

### A module closure that travels, and a verb that verifies it

Both implementations. The 2026-08 review's finding H: a ground truth
that cannot move between repositories tamper-evidently is a
convention, not a truth. Three defects stood between the module layer
and that claim, on either side of `mod-lock.aon`.

**The store belongs to the project, not to the file that names it.**
A vendored module carries its own `mod.aon`, so it is a project inside
a project — and resolution walked up to the *nearest* one and stopped.
An import made from inside `aon_vendor/corp.example/schemas/service@1/`
therefore looked for a store beneath `service@1/`, found none, and
refused with `module not fetched` while the module it wanted sat flat
beside it, which is the only layout `aontu mod vendor` writes. The
tooling produced a tree the resolver could not read: one dependency
deep worked, a dependency *graph* did not. Resolution now collects
every enclosing `mod.aon` root (`projectRoots`, both ports) and tries
each one's `aon_vendor/` and lockfile in turn, nearest first — so a
module shipping its own vendor tree still wins for its own tree, and
one that does not falls through to the consumer that vendored it. The
old workaround, a second `aon_vendor/` nested inside the dependency,
is now a no-op that does not move the pin; it could never have
travelled anyway, because `mod manifest` excludes `aon_vendor/` from
the published layer.

**A pin that cannot be computed is not written.** `tidy` pinned
modules it could not evaluate, and the hash it locked for them was
`canonHash(nil)` — the string *every* unevaluable module hashes to. Two
entirely different broken modules locked the identical pin, so the
lockfile's promise to break on any semantic change in the transitive
closure was silently vacuous, and `aontu hash` refused the very file
`tidy` had just pinned. Tidy now refuses it too, in the same words —
`does not evaluate on its own; nothing to pin` — with `verdict: error`,
exit 4, and no lockfile written. That is the verb's existing rule (a
partial lock claims a resolve that never happened) applied to a pin
that is present but means nothing, which is the harder case to see.

**Verifying is not editing: `aontu mod verify [dir]`.** Nothing
checked the store against the committed lock. `tidy` recomputes and
rewrites by design, so a CI job that tidied before evaluating made the
lockfile agree with whatever the store held — tampering included — and
then passed: the integrity pin defeated by the order of two commands.
The new verb recomputes every pin, compares it against the lockfile,
**writes nothing**, and refuses on any disagreement with both hashes
named (`pinned <want> but the store means <got>`); a module that no
longer stands up says so rather than reporting the hash of `nil` as
though it were a meaning.

Nothing to check is not a pass, either — the obvious way to get this
verb wrong. The gate walks what is *locked*, so a project whose
lockfile was never committed, or whose lockfile predates a dependency
someone added, would verify clean over an empty set: absence reading as
agreement, which is the same shape as the defect above. Every
dependency the project declares must be in the lockfile before the pins
mean anything, and the repair is a `tidy` rather than a fetch:
`verdict: unlocked`, and the line says so. Transitive dependencies need
no separate check — a locked module's own imports are resolved when its
pin is recomputed, so one that is unreachable makes its *dependant*
fail to evaluate and is reported as a mismatch.

Verdicts `ok`, `mismatch`, `unlocked` and `missing`; exit 0 and 1 for
each of the three refusals, 2 for usage — a mismatch is a refused gate,
the class `breaking` already uses. `--format json` carries `verified`,
`mismatched` and `unlocked`. Run it beside your tests; run `tidy` only
when you mean to move a pin.

Documented in [`docs/reference-api.md`](docs/reference-api.md#aontu-mod)
and the hand-vendoring how-to, which gained the flat transitive layout
and the CI section. Use case 11 (`use-cases/11-shared-modules`) asserts
all three behaviours where it previously pinned the defects.

### Provenance is part of the clone contract

Both implementations. The 2026-08 review's finding E: `why` is the
agent-facing differentiator, and it went dark exactly where an
enterprise model puts its values.

**The authored mark lives on the value, not in a set beside it.** The
recorder decided "did the author write this" by looking the operand's
id up in a set stamped over the parsed tree — which is true of the
parsed tree and of nothing derived from it. So a default flowing into
a `pack()`-generated child, a shape carried by a `$ref`, one side of an
`id()`-merge were all invisible, and `why` answered "(no contributions:
nothing met at this path)" over a value it had just printed, with exit
0 (`use-cases/BUGS.md` §22–24). `Val.clone`, `Val.place` and the
disjunct fold now carry the mark exactly as they carry the site: a
clone of a written value IS that written value somewhere else, and it
holds the author's site, so it can be pointed at. Values the engine
MINTS are constructed rather than cloned and stay unmarked.

**A member is not a value beside its container.** `*1|integer` is one
thing the author wrote; `*1` is not a second thing next to it. The
recorder knew that only where the container itself met something,
which the fixpoint decides — so the first key under a spread template
reported one contribution and the second reported two, for identical
statements. The containment is now a fact about the document, recorded
at stamping time, and an operand is reported as the outermost written
value it is part of.

**A spread's mark walked into an already-marked container and stopped.**
Its guard was written as a "done" flag where a cycle guard was meant.
A template is applied once per destination and the fixpoint advances
values in place between applications, so every child replaced between
the first key and the second stayed unmarked.

**The value that stands at a path is a contribution when nothing met
there.** A meet is where information vanishes, so a meet is what the
recorder watches — but a generator PLACES a value without meeting
anything, and "nothing met at this path" is not an answer to "where did
this come from".

**`set --in-place` refuses a path reached through a reference.** With
provenance travelling, `n: $.base` against `base: 7` reports the
literal `7` — correctly, and at `base`'s line rather than `n`'s. A
splice there would rewrite the referent for every reader of it while
leaving the named path unmoved, so the reference is refused as not
editable and the assignment is appended as it always would have been.

### Every site names the file whose text it excerpts

Both implementations. The 2026-08 review's finding F, in four parts:
the diagnostics an agent repairs from.

**One invariant: a site names the file whose text it excerpts.** The
provenance walk used to OVERWRITE every value's url with the entry
document's name and leave the coordinates alone, so a finding cited
`entry.aon:3:7` for text that lives three files away, at a line the
entry may not even have — *a repair agent that follows the site edits
the wrong file* (`use-cases/BUGS.md` §25). Only values that carry no
name of their own are stamped now — those the engine minted rather than
read — and the urls actually seen are collected, so a value loaded
through `@"lib/types.aon"` keeps that path with that file's row and
column, and the report still knows which DOCUMENT a site belongs to:
roles come from membership of the url set, never from a name
comparison. Error frames follow the same rule, and where the run holds
no text for a named file the site reports `-1:-1` rather than resolving
an offset against the wrong document.

**And it is named as the entry's own name reaches it.** The resolved
absolute path is the right IDENTITY — two documents loading one library
by different relative spellings must be one file — and the wrong NAME:
a report whose entry reads `contract.aon` and whose included site reads
`/home/someone/checkout/types.aon` cannot be uploaded as SARIF, diffed
between machines, or read beside the command that produced it. A site
is therefore printed relative to the entry's directory and re-anchored
on however the caller spelled the entry: `vet contract.aon` names
`types.aon`, `vet a/b/contract.aon` names `a/b/types.aon`, and an
absolute entry keeps absolute includes.

**A junction reached through a reference keeps its site.** Go's clone
rebuilt a disjunction as a fresh value carrying the url and the source
text but not the POSITION, so the commonest schema shape there is — an
enum declared once and named by `$.Role` from wherever it applies —
reported its `|:empty` finding at row -1 while the canonical port
reported it at the enum. The site now travels whole through every
clone, which closes divergence #66's neighbour in the same sweep. Pinned
by `vet-refd-disjunct-site`.

**Parity ledger: #66 is closed.** Go's include resolver stamps the
resolved path onto every value a loaded document parses into, and keeps
that document's text so an offset can be resolved in the file it
belongs to. The fixture recorded in `test/spec/divergent.tsv` now
reports `part.aon:1:7` from both ports, byte-identical.

**Findings carry the repair.** `message` is the headline and stays one
line — that is what makes it comparable — so everything the engine
knows about how to FIX a failure reached a terminal reader in the
frames and a machine reader not at all. A finding now carries `hint`:
the whole shared hint text with its placeholders filled in, for every
code that has one. The clearest case is a lossy integer literal, where
the hint names the `0d` exact-decimal escape that fixes it. Excluded
from the shared spec's goldens exactly as `message` is, because prose
is per-port; carried into SARIF through the embedded finding, and
redacted in the SARIF golden the same way.

**`relations` and `trim` say WHY.** Both answered a document that does
not stand up with `verdict: error` and an empty list — something is
wrong, and nothing about what, which is the one answer a repair loop
cannot act on. Both reports now carry `errors`, in the vet finding
shape and present only on that verdict: the engine's own first error,
with its site, its hint and the file it belongs to. The `findings` list
of `relations` still means what it meant — facts about the GRAPH — and
a document with no graph has none of those to report.

**Colour is a decision about the destination, not about the message.**
Error frames hardcoded their ANSI escapes, so a piped report carried
terminal control codes into logs, CI annotations and agents' parsers.
The library honours `NO_COLOR` (set, to anything, means no colour) for
every caller; the command additionally turns colour off when its own
stderr is not a terminal, since a library cannot see the destination
and a caller who can is the only one who may say. `--jsonl` turns it
off unconditionally: a JSONL answer is machine-read by definition, even
in a session attached to a terminal.

### The evolution gate stops failing its own idioms

Both implementations. Three fixes to `subsume`/`breaking`, all from the
2026-08 review's finding D.

**Reflexivity is a law of the walk.** Every value admits itself,
residue included: the set admitted by `integer & min(0)` is exactly the
set admitted by `integer & min(0)`. Without that, a constraint inside a
SPREAD TEMPLATE made a contract non-self-subsumable — expected and
actual byte-identical, verdict `undecided` — so `breaking` on the
documented close-per-entry idiom hard-failed reflexivity and had to run
`--allow-undecided`, which then masks the genuine undecideds the gate
exists to surface (`use-cases/BUGS.md` §28). The check sits on the
`sub_unresolved` branch, where the answer would otherwise be undecided,
and identity is the HASH FORM: canon drops closedness and the marks, so
`close({a:1})` and `{a:1}` share a canon while admitting different sets.

**A preferred branch contributes exactly its own value** — ADR-004's
rule, which the subsumption walk had never adopted. It still compared a
pref MEMBER of a disjunction by its kind superior, so every member of
`*backward|forward|full|none` widened to `string`, which no general
member admits, and a disjunction with a default did not subsume itself
(§29). Two existing rows sharpen from `undecided` to
`does_not_subsume` as a result: with a pref member admitting its own
value the counterexample is CONCRETE, so the walk names it instead of
shrugging.

**The `gen` profile's mark rule is a correspondence question**, and it
was firing inside DISTRIBUTION TRIALS — comparing a whole marked
disjunction against a member extracted out of one, which are not the
same node of the two documents. `aontu_policy: hide({compat:
*backward|forward|full|none})`, the verbatim idiom from
`reference-api.md`, failed self-subsumption under `--profile gen`
because of it. The enclosing node's marks are still compared where they
correspond, and a mark that really did change is still refused.

**`breaking --at <path>`** joins `subsume`'s anchor: a module's top
level carries the version string and the policy block, which are
*supposed* to change between releases, so the whole-document comparison
answered about those rather than about the contract and a release that
bumped only its version self-broke the gate. Findings are reported from
the anchor.

Pinned by `subsume.tsv` self-spread-residue, self-spread-residue-closed,
self-hide-pref-disjunct, self-policy-idiom and hide-added-still-refused,
plus `breaking-at-gates-a-subtree` and its Go twin.

### `breaking --against git#<rev>` on macOS and Windows

Both implementations. The repo-relative path of the entry file was
computed by relativising `git rev-parse --show-toplevel` against the
caller's resolved path — two DIFFERENT COORDINATE SYSTEMS on either
side of the subtraction. git prints the real path, while the caller's
is whatever they typed: on macOS a temp file under `/var` is
`/private/var` to git, and on Windows a `TMP` short name (`RUNNER~1`)
is the long form. The subtraction then produced a `../..` climb, the
entry was reported "not in that revision", and the documented CI
spelling exited 2 on both platforms while passing on Linux.

The path now comes from git itself (`rev-parse --show-prefix`), which
is the same question asked in git's coordinates. Pinned on every
platform by a leg that reaches the entry through a symlink —
`breaking-git-compares-the-old-tree` and its Go twin — so the case runs
on Linux too rather than waiting for a macOS runner to notice.

Two Windows-only test defects went with it, both in the MCP suite: an
absolute path interpolated raw into an `@"..."` include (where a
backslash is an escape), and a raw path substring-matched against its
own JSON encoding.

### Vet asks the same question the evaluator does (ADR-007)

**Breaking, both implementations.** `1|2`, `null|top` and
`({x:1}|{y:2}) & {z:3}` no longer generate a value.

Generation used to FOLD an unresolved disjunction's surviving members
together with unify and emit the result — a value in no branch of the
disjunction. `({x:1}|{y:2}) & {z:3}` generated `{x:1,y:2,z:3}`, a map
the model never admits, and `role: 'a'|'b'` with no data died as a
scalar_value CONFLICT: the conflict of the fold, not of anything the
author wrote. Vet's incompleteness pass keeps incomplete-class
findings, so it filtered that out and a **missing required enum field —
the commonest schema idiom there is — vetted valid with zero
findings** (the 2026-08 review's finding C; `use-cases/BUGS.md` §13).

An unresolved disjunction is now incomplete residue: generation answers
the preferred alternative when there is one (that is what `*` is for)
or the single surviving one, and more than one still admitted raises
`disjunct_no_gen`, class `incomplete` — the same class a bare `string`
residue answers. The spelling that decides a disjunction is a
preference (`*null|top`) or a value that selects an alternative.

**Vet met the settled schema, not the schema.** The standalone pass
that decides whether a schema stands up on its own was also serving as
the left side of the meet, so every reference in the schema had already
resolved against the schema's own values and been replaced by them:
`a:integer b:$.a` settled to `a:integer b:integer`, and `{a:3,b:4}`
vetted valid while the same four lines as one document refuse with
`scalar_value` (§15). The meet is now built from a fresh parse, so the
fixpoint runs once over both documents; the standalone pass remains as
the diagnosis it always was. A `--at` path that exists only in the
settled tree falls back to it, so no such path stops working.

**A mark above the anchor is not a reason to check nothing.** Vet finds
residue by generating the anchored meet, and generation honours
`type()` and `hide()`. Under `--at` the probe now descends through them
(§14): a mark is a decision about output, and `--at` names the truth to
validate against explicitly.

**A preference conjoined with a disjunction now names an alternative.**
`(A|B) & *A` is `*A|B`, the same value the direct spelling denotes.
Distribution carried the peer to each member and the kind gate then
replaced a scalar preference *by* the concrete member it met, so the
preference simply vanished: `specversion: ("1.0"|"1.1") & *"1.0"` —
the enum-with-default written this way round — held no default at all,
canon dropped the `*`, and two contracts differing only in their
default hashed identically. The fold hid all three.

Two more consequences fell out and shipped with it. The disjunct dedup
compared object identity, so `x:*{a:1}|{a:number}` met by `x:{a:2}`
left `{"a":2}|{"a":2}` — one value spelled twice, which the old fold
hid; two bags are now the same value when they have the same shape.
And a narrowed disjunction keeps the site of the one it came from:
findings naming a disjunction that had met anything used to point at
row −1 with no file, and now carry real coordinates in both ports (part
of the review's finding F).

**The invariant is now asserted as standing infrastructure**, beside
the parity probe: `ts/test/veteval.test.ts` and `go/veteval_test.go`
read the shared spec's own `vet` rows, compute `vet(S, D)` and
`eval(S ∪ D)` for each, and require them to agree on accept/reject. The
corpus is the spec, so it grows with every row anyone adds. Every one
of the defects above would have failed it.

`disjunct_no_gen` is registered in `test/spec/errcodes.tsv` (class
`incomplete`, since 0.53.0). Pinned by `disjunct.tsv`, `vet.tsv`
(vet-enum-missing-is-incomplete, vet-at-marked-anchor-*,
vet-junction-site), `pref.tsv` and the re-probed site columns across
`subsume.tsv`, `edge.tsv`, `number-tower.tsv` and `place.tsv`.

The sharpest practical consequence is on the write path: `aontu set`
takes vet's verdict, so it used to accept writes its own `must()`
audits refuse — the entry's audits had been discharged before the
overlay existed — and only the assembled runtime view caught them,
post-hoc. A refused write is now refused at the point of writing, and
never reaches the overlay.

Still open, recorded in ADR-007: a sizing atom sharing a conjunct with
a spread template is discharged against that layer alone (§16), and a
map-argument `must()` is consumed by the schema layer (§17).

### The include capability reaches every surface

Both implementations. `--trust` / `--include-root` were wired to
`aontu <file>` alone. Every VERB — `vet`, `subsume`, `breaking`, `get`,
`why`, `set`, `relations`, `trim`, `hash`, `agentsmd` — parsed its own
argument tail and ran the full system resolver with no way to confine
it, which is the surface an agent actually scripts. The REPL *accepted*
`--trust` and dropped it, so the `--jsonl` session mode built to be
driven by a harness evaluated unconfined however it was invoked. And
the language server confined the diagnostics it published while leaving
HOVER on the system resolver, so a workspace-confined editor session
resolved an escaping include the moment a cursor rested on it — one
document under two postures is not a confinement. (The 2026-08 review's
finding G; `use-cases/BUGS.md` §37.)

Every verb now takes `--trust <system|none|root[:dir]>` and
`--include-root <dir>` anywhere in its argument tail, a bare `root`
meaning the primary document's own directory. The REPL carries a
session capability through `:load`, `:get`, `:why` and bare snippets.
Hover and hover-provenance run under the same capability as
diagnostics; the Go API gains `lsp.HoverTrust` beside `Hover`,
following the existing `DiagnosticsTrust` precedent.

Two parity holes closed with it. Go's `PatchOptions.Trust` was declared
but never reached the `Vet` call underneath `set`. And `breaking` read
its own `$.aontu_policy.compat` declaration through an unconfined
evaluation in *both* ports, confining the comparison but not the
question that chooses its mode.

Pinned by `every-verb-honours-the-capability`,
`verbs-take-include-root`, `repl-honours-the-capability` and
`workspace-root-confines-hover` in `ts/test/trust.test.ts`, with Go
twins in `go/cmd/aontu/trust_test.go` and `go/lsp/lsp_test.go`. Each of
the ten verbs is asserted twice — the escape resolves under today's
default and is denied under `--trust none` — so a verb that quietly
dropped the flag again would fail. The hover tests probe every column
of the line (a hover span is measured in the *included* document's
coordinates) and carry an unconfined control, so they assert the
capability rather than hover failing everywhere.

No default changed: `system` with the phase-6 warning window remains
the posture until the staged flip.

### The evolution gate compares the old TREE

Both implementations. `breaking --against git#<rev>` took only the ENTRY
file's text from git and then evaluated it with the WORKING file as its
path, so every `@"..."` include in the old document resolved against the
working tree: the "old" side was old entry text meeting NEW includes,
and a breaking change made inside an included file compared against
itself and answered `compatible`. The documented CI spelling therefore
un-gated every non-entry file of the multi-file layout real models use
(the 2026-08 review's finding D; `use-cases/BUGS.md` §26).

A `git#<rev>` spelling now materialises the revision's includable
sources (`.aon`, `.aontu`, `.jsonic`, `.json` — the only files an
include can name) into a temporary directory and evaluates the old
document from there; the tree is removed when the run ends. Sources
outside the revision (package includes, the bundled `std/system`)
resolve as before. A file the revision does not carry is a usage
failure naming it rather than a comparison against nothing.

Pinned by `ts/test/cli.test.ts` `breaking-git-compares-the-old-tree`
and `go/cmd/aontu/subsume_test.go` `TestBreakingGitComparesTheOldTree`,
both of which also assert that an UNCHANGED tree still answers
`compatible` — a fix that merely reported breaking would fail them.

### The spread application rework (ADR-006)

Both implementations. The remaining defects of the 2026-08 language
review's finding B (`use-cases/BUGS.md` §6, §7, §36 and the
pack-over-spread-augmented-data failure), which ADR-005 named openly as
different roots. Two rules, mirrored TS/Go:

- **Template application is stateless.** The combination of two
  unequal `&:` spread templates (MapVal/ListVal's spread meet) bakes a
  key present in only one side into the combined map as an
  `ExpectVal`, and a path-independent combined template is SHARED
  across every destination — so the expectation's in-place peer
  accumulation unified each sibling's own data with the next
  sibling's (`$.w.y.r: Cannot unify value: 6 with value: 5`, both
  values sibling data; the id-merged and one-view by-reference forms
  identically). `ExpectVal.unify` is now pure — a non-escaping peer
  rides a NEW node, the met expectation is never mutated — and a
  carried expectation is re-wrapped fresh at its destination
  (`handleExpectedVal` / the Go peer loop), which also unstacks the
  double-wrap. Each child now meets each template independently;
  children never meet each other's data (§6, §7, the `TODO: handle
  existing spread!` retired). An operator arriving as a peer-only key
  is CARRIED, never wrapped: a wrapped op froze (an expectation only
  advances when a peer arrives) and the residue blamed a spread that
  existed nowhere — `deploy: web: {surge: $.deploy.web.replicas + 1}`
  merged onto a pack child now answers `surge: 3`, `a:{x:1}
  a:{y:.x+1}` answers `y: 2`, and an op that can never resolve is an
  honest error naming the real path (§36).
- **A generator snapshots a settled source.** A staged function's data
  argument (`pack`, `each`, `filter`, `match`) resolves references
  under an `argsnap` flag (TS `driveStagedArgs` → `RefVal.find`; Go
  `stagedDrive` → `ref.go`): the copy is taken only once the target
  has finished resolving IN THE TREE. Copied earlier, a
  spread-injected relative reference in the snapshot dangled at the
  argument's location (rebased where no root traversal reaches) and
  the generator never fired — `ports: &: {port: .containerPort}` +
  `out: pack($.ports, {})` died as `mapval_no_gen`; it now generates,
  and `each()` over the same source likewise. One deliberate canon
  flip rides this rule: an unfired generator over a permanently stuck
  source canons with the data reference still standing
  (`pack($.n,{"x":1})`, which reparses to the same document) instead
  of with a baked-in copy of the stuck value — `gen-each.tsv`
  each-unfired-canon / each-unfired-template-canon and `gen-pack.tsv`
  pack-unfired-canon flipped, parity-probed.

Pinned by parity-probed shared rows: the `spread-interleave.tsv`
spread-unequal-* composition matrix (unequal spreads × literal /
ref-arriving / key()-bearing templates × 2,3 children × map,list, plus
requiredness, defaults and id-merge through the combine), `vet.tsv`
vet-unequal-spread-depths, `gen-pack.tsv`
pack-over-spread-augmented / pack-merge-expr-onto-child,
`gen-each.tsv` each-over-spread-augmented, and `plus.tsv`
peer-key-expr / peer-key-expr-unresolvable. `make cov` stays at 100%
in both ports. Downstream effects recorded with dated notes in the
use-case suite: 01 (shared-PortSpec discipline now style, not
workaround), 02 (stacked-spread guardrails vet correctly), 05 (the
`owner` role was silently missing from the generated registry — the
filter's mid-resolution snapshot re-stamped entity ids inside the
hidden witness and the id-merge pulled the hide mark onto the real
role; the eval-path hallucinated-permission diagnostic that rode the
same artifact is gone, the vet path unchanged), 06 (the DRY
port-column derivation works).

### Template-clone isolation (ADR-005)

Both implementations. The language review's finding B
(`use-cases/REVIEW.md`; `use-cases/BUGS.md` §8–12, §33–35), taken as
one engineering campaign with the review's minimal repros as its
acceptance suite. One mechanical root — template clones sharing inner
nodes — and its surfaces, every one of them silent wrong output with
exit 0:

- **Instantiation is per destination, to the leaves.** A pack/each
  template, a filter condition, and an applied spread constraint are
  now FULL instances: function arguments, a preference's inner value
  and operator operands are cloned per destination (the `dup` clone in
  TS, `instanceClone` in Go) with every inner path normalised to the
  destination (`repathInstance` / the Go `setPaths` shape). Fixes:
  `pack($.names, close({name: key()}))` stamping the FIRST child's key
  on every child (§8, and its garbled `$.deploy.NaN.p` override
  paths); a rank-2 `**key(1)|string` default shared by all children
  (§9); relative references and `key()` inside template *expressions*
  resolving at the template's own location — the `NaN`-path family
  (§33, §35a).
- **A hole belongs to its nearest enclosing generator.** `hasPlace`/
  `fillPlace` no longer cross into a generator's template or condition
  argument, so `close(pack(d, _ & t))` + overlay merges with the
  generated child instead of absorbing the overlay into the template
  (§10), and a nested pack's `_` binds the INNER source child instead
  of the outer one (§34). A hole in a generator's *data* argument is
  still the outer generator's to fill.
- **A mark belongs to the field its wrapper was written at.** A
  reference that lands on a still-pending `type()`/`hide()` call now
  DEFERS until the wrapper resolves at its own field, instead of
  cloning the call and having the clone stamp marks at the referring
  site after the mark-clearing walk had run. Fixes: `hide(pack(...))`
  leaking its mark onto generated children so downstream packs emitted
  them empty (§11); type-marked alias references silently suppressing
  the referring field — inline and across `@` includes — plus the
  bogus `id_name` on `id(key(0))` and the phantom
  `mapval_spread_required` naming a spread in neither file (§12); and
  `hide()` around a computed field of a pack child swallowing the
  value into a silent `[]` (§35b — it now yields the computed value).
  A marked peer-only child in a map meet is carried, never wrapped as
  an expectation.

One deliberate canon flip: a path-dependent spread template no longer
canons with the last destination's resolution baked into it
(`spread.tsv` spread-close-template-canon rewritten, with the move()
combination pinned as `spread-close-template-move-gens`). The move()/
copy() ghost-innard sharing (`func.tsv` ghost-*) is untouched.

Pinned by parity-probed shared rows: `gen-close.tsv`
(close-template-keys-per-child, close-template-key-pref-override,
close-template-key-refuses-extra, close-pack-hole-overlay-merges),
`gen-pack.tsv` (pack-rankpref-key-per-child, pack-rankpref-key-override,
pack-rel-ref-in-expr, pack-key-in-expr-and-call), `place.tsv`
(place-nested-pack-inner-binding, place-nested-pack-inner-meet,
place-hole-as-inner-data, place-hole-as-inner-data-tmpl), `marks.tsv`
(hide-pack-field-hidden, hide-pack-downstream-pack,
type-alias-conjunct-ref, type-conjunct-arg-ref,
type-conjunct-target-ref, type-alias-ref-first,
hide-computed-pack-copy), `spread.tsv` (spread-expr-sibling-ref), and
`file.tsv` (load-alias-spread, load-alias-idspread,
load-alias-top-conjunct, over the new `alias_schema.aon` /
`alias_top.aon` fixtures). Rationale: `ADR.md` ADR-005; author-facing
rules: `docs/reference-language.md` ("Generating children", "The
placeholder `_`", "Marks"). Still open, honestly: the unequal-spread
sibling crosswire (BUGS.md §6–7) and the self-referential merge
expression (§36).

### The preference admission gate (ADR-004, BREAKING)

Both implementations. The top-priority recommendation of the 2026-08
language review (`use-cases/REVIEW.md` finding A; `use-cases/BUGS.md`
§1–5), taken as a deliberate breaking change:

- **A preference override must be admitted by its disjunction.** A peer
  meeting a scalar `*`-default inside a disjunction must unify with at
  least one alternative — the preferred value's own admitted set counts
  — or the meet is the empty disjunction (`|:empty`). `k: *'auto' |
  'literal' | 'data'` + `k:'autoo'` is now REFUSED (it used to answer
  `"autoo"`, exit 0); `port: *8080 | (integer & neq(80))` + `port: 80`
  is refused instead of bypassing the exclusion. `*8080 | integer` +
  `9090` still answers 9090, and an unset field still generates its
  default. A deliberately open default is spelled `*x | top` (the
  apidef machine-emitted idiom keeps its meaning).
- **The rank-uniform meet.** A rank≥2 preference now defends the
  innermost preferred value's kind exactly as rank 1 does:
  `a: **1.5 & float` is `1.5` (was `mapval_no_gen`), `**2|integer` met
  by a bare `integer` keeps the default 2 (was silently dropped), and
  `**hello & false` is the same kind conflict `*hello & false` is
  (the flipped `pref.tsv:pref-nested-concrete-wins` row).
- **`match()` on a defaulted scrutinee** tests patterns against the
  generation-effective value, so a pattern can no longer select an arm
  by overriding the default and contradicting the value generated
  beside it.
- **`pref_not_instance` is advisory and honest.** The ranked-default
  false positive is fixed (the effective default unwraps every pref
  layer), the message now reads "…not an instance of any remaining
  alternative of…", and the lint's post-gate meaning (a typo-shaped
  default, no longer a soundness hole) is documented in `ts/src/vet.ts`.
- **`std/system` tightens.** `direction: *in | out | inout` is a true
  enum-with-default; `sideways` is refused.

Pinned by parity-probed shared rows: `pref.tsv` (`pref-admit-*`,
`pref-rank2-*`, flipped `pref-nested-concrete-wins`), `std-system.tsv`
(flipped `port-direction-refuses-nonmember`), `vet.tsv`
(`vet-enum-default-*`), `gen-match.tsv` (`match-defaulted-scrutinee-*`,
`match-bare-pref-scrutinee`), `subsume.tsv` (`pref-lint-ranked-clean`,
flipped `default-rank-min`). Rationale and the escape hatch: `ADR.md`
ADR-004; author-facing rules: `docs/reference-language.md`
("Preference / default `*`").

### Documentation — the four quadrants brought back level

A pass over `docs/` after the last four changes landed, against the
split `docs/index.md` declares: a tutorial teaches, a how-to gives the
recipe, a reference is exhaustive, and only the explanation argues.

- **The reference documented ten of the eleven verbs.**
  `aontu relations` had a line in the synopsis and a paragraph under the
  library API, but no section of its own — so the one page that promises
  to be exhaustive was the one place the verb could not be looked up. It
  now has one, with the finding fields, the `--format json` shape, and
  its three verdicts (`pass`/`fail`/`error` — not `vet`'s five, because
  there is no schema on the other side of the question). The library
  paragraph points at it instead of restating half of it.
- **`--in-place` had reached two quadrants of four.** It is now in the
  tutorial's closing (as the command that does by hand what §13 just
  did), the index's verb map, and the agent skill's repair loop, which
  stopped at diagnosis and now ends with the fix.
- **The explanation gained the argument.** Why appending is the default,
  why the deferred CST turned out to be for a different job, why a site
  names a *token* and what that does to `min(1)`, why the candidate text
  is parsed alone rather than checked against a list of safe shapes, and
  why a load in the overlay is refused rather than detected — all of it
  previously lived only in commit messages and design notes.
- **The how-to gave up arguing and gained a recipe.** The eight lines
  reasoning about the include collision moved to the explanation; in
  their place is the thing a reader actually needs — how to edit a value
  that lives in an include, and the trap of naming an entry that pulls
  the same file in (the value meets itself, verdict `invalid`, nothing
  written). Both ports were measured; they agree.
- **Two claims had outlived their premise.** `trim --check`'s
  justification was that rewriting needs a format-preserving editor —
  which `set --in-place` disproved; the real reason is that deleting an
  entry is a different edit from replacing one, and a span does not say
  which blank line went with it. `AGENTS.md` described a CI tree under
  `ci/` that does not exist; the workflow is live in
  `.github/workflows/build.yml`.
- **Two overstatements corrected, both found in review.** A relation
  declaration does **not** have to unify with the bundled
  `$.std.Relation`: both checkers read every map under the root
  `relations` key and take its `acyclic` and `inverse` fields directly,
  so a bare `{ inverse: usedBy, acyclic: true }` declares the same
  relation — which is what keeps `relations` usable under the `'none'`
  include capability, where `@"std/system"` does not resolve. And
  `--in-place` is not an alternative to `--overlay`: `set` requires an
  overlay either way, `--in-place` only decides whether the assignment
  is appended to that file or rewritten inside it, and the entry
  document is never written.
- **Smaller repairs.** Two internal links pointed at nothing
  (`reference-api.md#options`, now `#aontuoptions`), the how-to's
  contents list was missing its newest section, a REPL transcript still
  showed `v0.50.1`, and the trust contract was still stamped `v0.51`.

### Added — `set --in-place`, so the repair loop closes

`aontu set` could not repair the commonest failure it exists for.
Unification only narrows, so where the data **pins the wrong value** —
`replicas: 42` against `integer & above(0) & below(10)` — appending
`replicas: 5` produced a document contradicting itself: `verdict:
invalid`, `written: false`, exit 1. It succeeded only where the document
had left a hole. That is the first bullet of §5 of the 2026-08-21 status
report, and the whole of what remained of the repair-half finding.

`--in-place` rewrites the pinned literal **where the author wrote it**:

```
$ aontu set '$.replicas=5' --entry schema.aon --overlay deploy.aon --in-place
verdict: valid
replaced: deploy.aon:2:11 42 -> 5
wrote: deploy.aon
```

The G7 design deferred this behind two prerequisites. The first now
exists — `why` is the evaluated-path → contributing-span map, and sites
carry `len` and `src` since a site was given an extent. **The second, a
comment-preserving CST, turns out not to be needed**, and the reason is
worth stating: a CST is what you need to RE-SERIALISE a document, and a
targeted span splice serialises nothing. It replaces `len` code units at
one offset and leaves every other byte — every comment, every blank
line, every alignment space — exactly as the author left it, because it
never reads them. A comment on the edited line survives.

**The edit is verified, not assumed.** The site carries the text it
claims to cover, so the span is checked against `src` before a byte is
written. The corrupting arithmetic this repository already shipped once
— `port: 0x1F` reporting canon `"31"` at column 7, so `(col,
canon.length)` writes `port: 5x1F` — is unreachable: `0x1F` is four code
units and says so, and a span that does not match is refused rather than
guessed.

**`role === 'literal'` is not the test, and that matters.** A site names
the TOKEN it points at, so a compound value reports its OPENING token
while its canon is the whole thing: `min(1)` is a literal-role
contribution whose `src` is `min`, `1+2` reports `1`, `{b:1}` reports
`{`. Splicing any of those writes the new value *into* the expression
(`a: 5(1)`, `a: 5+2`) — the same corruption class by another route.
Rather than enumerate the shapes, the `src` is parsed ALONE and required
to mean the contribution's own canon. That is decided by the same
unifier that produced the contribution, so it cannot drift from it, and
it gets the interesting case right without naming it: `0x1F` canons to
`31`, which is not its own spelling but IS the contribution's canon.

**Never worse than appending.** Where the value is not a single editable
literal in this overlay — a spread template governing other keys, a
reference whose site is the `$`, two statements pinning one path, a
literal in an included file, a constraint rather than a pin — the
assignment is appended exactly as it would have been without the flag,
plus one **warning** naming the case: `patch_not_editable`,
`patch_ambiguous` or `patch_span_mismatch` (registered in
`errcodes.tsv`). Warnings never move a verdict. Both runners assert this
for every in-place row by re-running it without the flag and requiring a
verdict at least as good. A default (`a: *1`) earns no warning at all —
appending already overrides a default correctly.

**An overlay that loads another document is refused outright**, and the
case that forces it is worth stating: an include holding `a: 42` at row
1 column 4, and the overlay holding `x: 42` at row 1 column 4. The site
is real, the text at the span really is `42`, so the verification
PASSES — and a splice that trusted it rewrites `x` while reporting a
replacement of `$.a`, with a valid verdict and no findings. The site's
`file` cannot save it: a library caller need not pass `overlayPath`, and
the Go port names the entry document for an included value anyway (issue
#66). So the evaluation that decides what to edit **denies loads**, and
what resolves is what the overlay says by itself. That removes the
ambiguity at its source rather than detecting it, costs nothing in the
shape `set` is for — an overlay it owns and appends to — and makes both
ports agree without waiting on #66.

The span verification and the no-extent guard **merged into one
condition** on the way: they read as two guards and were one question
asked twice, with the second half unreachable once loads were denied.
Merged — and ordered before the round-trip — the question is reachable
through the case that has no extent at all (`x: hello |> upper`
synthesises a call the parser never sited), so the check is exercised
rather than argued for. `spanHolds` is exported and tested directly
against sites the engine would never produce, which is the only way to
reach the half that stays theoretical; it also checks the site's `len`
against the text's own length, since a site that disagrees with itself
is exactly the state it exists to catch.

Two reporting defects went with it. The text form printed `replaced:` in
the **past tense** for edits a refused run never applied — one
assignment can be replaceable while another makes the whole run invalid,
and unlike `--dry-run` there was nothing on the line to say so; it now
says `would replace:` wherever the file was not written. And a
**successful** run carrying only a warning sent its whole report to
stderr, leaving stdout empty and `$(aontu set ...)` with nothing:
routing on the finding count was right while every finding this verb
could raise was an error, and `--in-place` made a warning possible. The
verdict decides the stream now; warnings are diagnostics beside it.

The report gains `replaced`, carrying `from`/`to` as **source text**:
replacing `0x1F` with `31` is a different edit from replacing it with
`0x1F`, and only the spelling says which. 19 rows in
`test/spec/patch.tsv`, executed by both runners; `ts/test/patch.test.ts`
and `go/patch_test.go` cover what a row cannot reach, the file paths.

### Fixed — a value nobody wrote is nowhere in particular (Go)

Found by the parity probe for the above, and fixed rather than recorded:

- **A minted value claimed row 1, column 1.** Go's `sp` zero value IS a
  position — the first byte — so a value unification produced was
  indistinguishable from one written at the very start of the document.
  `a: 1+2` met against `a: 5` reported its arithmetic RESULT at 1:1 in
  Go and at -1:-1 in TypeScript. Every constructor now starts at an
  `unsited` sentinel and the parser moves it; conjuncts, disjuncts, tops
  and nils each already did this for their own reason, and this makes it
  the invariant TypeScript has structurally. `siteOf` already guarded on
  `0 <= v.pos()` and needed no change — it was being handed a position
  that looked real. Pinned by `vet-minted-arith-operand-unsited` and
  `vet-minted-concat-operand-unsited`.
- **A piped call was sited at its left operand.** `x |> upper`
  synthesises `upper(x)`, and Go's `buildCall` took its position from
  the rule's opening token — which for a pipe is the pipe's LEFT
  OPERAND. So the synthesised call reported at `x` with src `"hello"`
  where TypeScript reported it unsited. The canonical port never had the
  choice: its `buildCall` does not site the success value at all, and
  the written path sites it afterwards. Pinned by
  `why-piped-call-is-unsited` and `why-written-call-sites-its-name`.

Two more in the same machinery are **recorded, not fixed**
(`test/spec/divergent.tsv`), and they are two rather than one because
**they fail in opposite directions**:

- **#66** — a literal in an `@"included"` file. TypeScript names the
  INCLUDED document, correctly; Go names the ENTRY document. The value
  has a home and is attributed to the wrong one, so the fix is to
  PROPAGATE the loaded document's url — Go's loader stamps none for a
  guard to preserve. Recorded a week before this work and rediscovered
  by its parity probe, which is the ledger's own failure mode and is
  left visible in the entry rather than tidied away.
- **#76** — a value minted during unification. TypeScript names NO
  document, correctly; Go names the entry document. The value has no
  home and is attributed to one anyway, so the fix is the opposite:
  withhold attribution. Go does not track whether a value was parsed or
  minted, and guarding `stampURL` on the `unsited` sentinel was tried
  and breaks `vet-unsited-junction`, which is the correct row.

Stating them as one defect — "Go names a file TypeScript does not" — is
true only of the second, and would point a fixer at clearing
attribution where #66 needs it carried further. Knowing WHICH file a
value came from is not the same as knowing whether it came from a file
at all.

Safety in `set --in-place` is unaffected by either: the overlay-alone
evaluation refuses to edit a document that loads anything, so no
attribution question arises before a write.

### Breaking — a preference is gated by kind, not by family

`port: *8080 | integer` — the default idiom this project's own
documentation and agent skill card teach — accepted `port: 1.5`, in both
implementations, and generated `{"port":1.5}`. The preference widened
its branch to the base kind `number`, so the `integer` the author wrote
was not the constraint that survived: every key written that way was
quietly a `number` key.

The gate a concrete peer had to pass to override a default was the
preferred value's **family**. That let `*2.2 & 3` through, which reads
as a kindness, and `*8080 & 3.5` through, which is the same rule seen
from the other end. No kind-based gate can keep the first and refuse the
second. The gate is now the preferred value's own **kind**
(`superpeg`), and both are refused.

What changes:

```
*8080 | integer   with  1.5      was {"port":1.5}    now [aontu/|:empty]
*2.2 & 3                         was 3               now a conflict
*2 & 3.0                         was 3.0             now a conflict
*1.5 & integer                   was integer         now a conflict
```

What does not change: the same-kind override that is the point of a
preference (`*1 & 2` is `2`, `*1.5 & 2.5` is `2.5`), a kind peer the
default already satisfies (`*1.5 & float` and `*1.5 & number` are both
`1.5`), the cross-kind refusal (`*1 & {}`), and every non-numeric
default — only the numeric leaves ever had a family to widen into.

An author who wants the whole numeric family now writes it, in the
branch, where a reader can see it: `*8080 | number` still admits `1.5`.
The `kind & (*value | kind)` shape the documentation used to prescribe
as a workaround keeps working and now says nothing the inner branch does
not; `docs/tutorial.md`, `docs/how-to.md`, `docs/explanation.md`,
`docs/reference-language.md` and the skill card teach the direct form.

**The gate is a SCALAR gate**, and the reference now says so instead of
letting a general phrasing stand for it. A preferred map or list has no
kind yardstick — `superior()` is `top` for both — so any peer overrides
one, of any kind, and replaces rather than merges it: `*{x:1}` meeting
`"s"` is the string. That long predates this change and both ports agree
on it; it is now pinned (`pref-struct-*` in `test/spec/pref.tsv`) rather
than merely true, so it cannot move in one port or by accident. Write
`{x:*1}` rather than `*{x:1}` when you mean a map whose `x` defaults.

Pinned by `test/spec/number-tower.tsv` (the `pref-*-leaf-*` and
`pref-idiom-*` rows) and `test/spec/pref.tsv` (the cross-kind gate rows,
renamed `pref-family-gate-*` → `pref-kind-gate-*`). The newly-failing
rows are `errc`, not `err`: message text is not in cross-port parity but
codes are, and these codes (`no_scalar_unify`, `scalar-type`,
`|:empty`) are now promised to a reader by name in the teaching
documents, which makes them public surface. Closes §6 of the 2026-08-21
status report, and supersedes the phase-1 implementation note in
`docs/design/number-tower.md` that argued for the family gate — the note
is kept, with its reasoning and the reason that reasoning was
incomplete. TypeScript and Go move together.

### Added — a site has an extent

A finding's site was a point: `row` and `col` and nothing else. The only
length a consumer could reach for was the **canon**, and canon is not
source text — vetting `port: 0x1F` reports `value: "31"` at column 7, so
replacing `(col, value.length)` writes `port: 90001F` and corrupts the
document. The same arithmetic already shipped in the language server,
where hovering `0x1F` highlighted `0x` and hovering `1F` answered
nothing at all.

Sites now carry **`len`**, the span in UTF-16 code units — the units
`col` is already counted in — and **`src`**, the source text that span
covers, in both implementations:

- `aontu vet` findings: every site gains both.
- `aontu why`: each conjunct's site gains `len`, and the conjunct gains
  `src` beside its `canon`, so the value and its spelling are both on
  the page.
- The language server sizes hovers and diagnostic ranges by the real
  span, falling back to canon only where a value carries none.

Both are `-1` and `""` when unknown, and a report **never guesses**: a
consumer must not edit a site that says so. The parser had the extent
all along — the token that supplies `row` and `col` also carries its
text — so this reads what was already there rather than computing
anything new.

`src` is what makes a span **verifiable**, and that turned out to
matter. A site names the TOKEN it points at, exactly as `row` and `col`
always have, so a scalar reports its whole literal while a compound
reports its opening token: `min(1)` reports `src: "min"`, a map reports
`src: "{"`. Read the document at `(row, col, len)`, compare it to
`src`, and refuse when they differ — which turns "replace the name and
orphan the arguments" from an undetectable mistake into a caught one.

**Compatibility, precisely.** The JSON is additive: anything READING a
report — `row`, `col`, `value`, `canon` — is unaffected and simply sees
two more keys. TypeScript code that CONSTRUCTS a `VetSite` is not:
`len` is required on the type, so a synthetic report must now state a
span (`-1` where there is none). That is deliberate — the guarantee
worth having is that every site a report carries has the field — and it
costs nothing here, because `vet` itself ships first in this same
unreleased 0.53.0 line: the newest published version is 0.52.1, which
has no `vet` verb at all, so no released consumer constructs one. An
earlier draft of this entry said "existing consumers are unaffected"
without that distinction, which was true of readers and not of
constructors.

### Fixed — what happened when the gates that never ran, ran

Making the Go CI matrix real and adding a coverage job turned two
long-dormant gates on. Both failed immediately, and neither failure was
a flake.

An earlier draft of this entry recorded the Windows absolute include as
a shared gap that could not be fixed without a Windows machine. Both
halves of that were wrong, and it is fixed below.

- **An absolute include was resolved against the base on Windows.**
  The resolver stack tests absoluteness with a leading `/` or `\`
  (`multisource.ResolvePathSpec`), which no drive-letter path passes,
  so `@"C:/other/schema.aon"` was joined onto the entry's directory and
  never found — and because the confinement check sits inside the
  successful-read branch, a rooted profile answered "source not found"
  where it should have answered "include denied". This was a **Go-only
  divergence**, not the shared gap first recorded: the TypeScript
  package survives the same library rule by accident, its file resolver
  appending `resolve(base, 'node_modules', path)` as a fallback that
  win32 `path.resolve` collapses to the absolute path. Fixed with
  `filepath.IsAbs`, which is the platform's own rule — false for `C:/x`
  on Linux, where `C:` is a legal directory name and the include must
  keep resolving against the base, and true on Windows. No hand-written
  platform branch, and the POSIX arm is covered by the suite that runs
  there.
- **`aontu agentsmd --write` cut one byte after its end marker**,
  assuming the LF of that line. On a CRLF document it took the CR and
  left the LF, so every regeneration of an `AGENTS.md` gained a blank
  line. Where the marker is the document's last content it indexed past
  the end: **Go panicked while TypeScript returned cleanly** — a crash
  on one port and a result on the other. Both now skip an optional CR
  then an optional LF, bounded by the length.
- **Windows had no user module cache.** The location rule read
  `XDG_CACHE_HOME` then `HOME`, neither of which Windows sets by
  default, so `aontu mod get` had nowhere to write and a module fetched
  a moment earlier came back `module not fetched`. Both implementations
  now take `LOCALAPPDATA` on Windows, beneath `XDG_CACHE_HOME` and
  `HOME`, both of which remain honoured everywhere: the order is
  explicit before implicit, because a platform default that overrides
  what the environment was told is not a default. The rule takes the
  platform as an argument so the Windows arm is tested from Linux.
- **The VS Code extension never started its server on Windows.** npm
  installs the entry point as the shim `aontu-lsp.cmd`, and
  `CreateProcess` will not execute a `.cmd` without a shell — so the
  extension's own default command failed on the path the docs describe.
  Spawned through a shell on win32 only.
- **The Go port had never been tested on Windows.** `build-go` declared
  three operating systems while hardcoding `runs-on: ubuntu-latest`, so
  the Windows job had never once run on Windows — and fifteen tests
  failed there the moment it did. Every one interpolated a native path
  into Aontu SOURCE, where a backslash is a string escape: the resolver
  received `C:UsersRUNNER~1...oot` for `C:\Users\RUNNER~1\...\root`,
  `\r` arriving as a literal carriage return. The canonical port has
  guarded this since it was written; the Go twin never got the guard.
  It has it now, spelled as an unconditional replace rather than
  `filepath.ToSlash`, so the behaviour is testable off Windows — and it
  is tested there, on a path carrying real backslashes.
- **The coverage gate broke on a newer toolchain than contributors
  run.** `go tool cover` moved where an if-body's coverage block
  begins — go1.24 opened it at the `{`, on the `if` line; a later
  release opens it at the body's first line — and `covmerge` matched a
  `//coverage:ignore` against that one line. Forty-two justified
  exclusions stopped applying at once, reporting as ADR-002 failures.
  A line marker now reaches its statement's **body**, brace to brace,
  compared by position rather than by line: widening to the whole
  statement instead would reach past the body into the `else` chain —
  a sibling arm the author never marked — and excuse genuinely
  untested code, silently, with the gate green. Both directions are
  pinned by tests. And a marker that matches **no** block is now
  reported by source position, because the original incident announced
  itself only as forty-two unrelated coverage failures when what had
  happened was that every marker stopped working.
- **The coverage job measured a build it never made.** It ran the
  committed `dist-test/**` from a fresh checkout without building, so
  a change to `ts/src` that forgot to rebuild would have been graded
  against the old code and kept its old 100 %. It now builds first,
  and fails if the committed `ts/dist` differs from what the build
  produces — a stale artifact means every other CI job just tested
  code the branch does not ship.
- **`vet-action` expanded globs in its inputs.** The unquoted
  expansion that splits whitespace also performs pathname expansion,
  so a data path of `[ab].json` became `a.json b.json`: the action
  validated two files nobody asked for and went green over the one
  they did. Split with `set -f`.
- **`vet`'s schema-side findings repeated once per data file.** A
  broken schema is one fault however many candidates are named, and
  `error` means exactly that — the run could not be set up from the
  truth's side. Concatenating the per-file reports emitted the
  identical finding N times and, past the cap, called the report
  `truncated` over a single underlying problem. Invisible until the
  `error` verdict started carrying findings at all.
- **`--jsonl` ended its stream with a record that was not JSON.** The
  REPL's closing newline is for a human leaving a prompt line; in a
  protocol whose whole contract is one JSON object per line it added a
  bare empty line, and a harness parsing every line failed after every
  command had succeeded. Both ports' tests had trimmed it away; they
  now assert every line.
- **The LSP mishandled a real Windows workspace root**, in both
  implementations. `file:///C:/Users/me/project` — three slashes, the
  shape every editor sends — became `/C:/Users/me/project`, so the
  workspace-root confinement compared real paths against nonsense and
  an editor on Windows got no confinement it could rely on. Neither
  port's tests caught it because both built `'file://' + path`, two
  slashes, which no client sends. The leading slash is now dropped
  before a drive letter and nowhere else, so a POSIX path keeps its
  root; the tests send what a client sends. Three more divergences in
  the same function fell out of fixing it, all now closed: a malformed
  percent-escape **threw** in TypeScript where Go swallowed it; a
  well-formed escape naming a raw byte (`%FF`, a legal Linux filename)
  decoded in Go and could not in JavaScript, so the two derived
  different workspace roots for a uri neovim really sends; and `file://`
  alone yielded `''`, which is not nullish and therefore survived
  TypeScript's `??` chain to become a confinement root of `''`. All
  nineteen uri shapes now agree between the ports, byte for byte.
- **One malformed field discarded the whole LSP trust configuration**
  in the Go port. The `initialize` params were decoded into typed
  fields on one struct, so `"rootUri": 42` failed the unmarshal and the
  session opened **unconfined** — failing open on the one surface that
  must not. Each field is read on its own now, as the canonical port
  already did.

### Fixed — a sixth verdict flip, and two costs on the refusal path

Raised by the automated review on #72 and confirmed by measurement.

- **A quantifier on `\b` or `\B` flipped the verdict.** The rule that
  refuses `^{1}` and `${1}` — nothing to repeat, a syntax error under
  JavaScript's `u` flag and an accepted assertion under RE2 — shipped
  covering the two anchors only, on a comment asserting that the word
  boundaries "quantify identically in both". They do not:
  `re("\\b{1}x")` was `constraint_pattern` in TypeScript and an
  accepted schema in Go. All four assertions now take the same rule,
  refused in the normaliser before either engine compiles
  ([ADR-003](ADR.md)). The shared row that claimed to pin this tested
  a quantified **backspace** — one backslash where the regex needs two
  — so it passed while the real case diverged; it is renamed for what
  it tests, and the boundary rows it was standing in for are added.
- **Rejecting a long repeat bound was quadratic in Go.** The scan
  built the digit run into a string one character at a time, rebuilding
  the whole immutable string per digit, so `x{111…1}` with 200 000
  digits took **8.0 s** and gigabytes of transient copying before the
  overflow was ever detected — on a path that runs over a
  caller-supplied pattern and is counted by no evaluator budget. The
  digits are folded as they are read: the same input now takes 8 ms.
  Every verdict, and the order the two failures are detected in, is
  unchanged.
- **The packaged skill shipped two broken links.** `prepack` copies
  `docs/skill/` to the package root, two levels closer to it, so
  `../../grammar/aontu.gbnf` resolved outside the tarball and
  `../../test/spec/errcodes.tsv` named a tree the tarball does not ship
  at all. Staging now rewrites both and refuses to pack if a rewrite
  stops matching; a test fails in CI if a new escaping link is added.

### Fixed — the report says WHAT, not only whose fault it is

Four defects the 2026-08-21 status report's repair-loop walkthrough
turned up, all of them in the part an agent loop reads. Fixed in both
implementations.

- **`vet`'s `error` verdict now carries its finding.** A schema that
  does not stand up — a contradiction inside it, a document that will
  not parse, a merge marker — used to answer `findings: []` with exit
  4, so a caller was told the truth was unusable and never what or
  where, while `aontu <schema>` rendered the same fault in full. The
  finding now travels with the verdict, every site in the schema. Two
  causes, and the second is the general one: the provenance walk
  stopped AT a nil, so a failure's OPERANDS — which are what a
  finding's sites are — went unstamped and named no file. Both walks
  now descend into them. `aontu set` inherits the finding: an entry
  that will not parse names the parser's code.
- **A parse failure keeps its position.** The machine-readable path
  reported `row: -1, col: -1` for a fault the human renderer draws a
  caret under; the parser knew all along and the rendered message held
  the only copy. Sites now carry the real 1-based row and column.
- **`vet --at` naming nothing reports too**, with the same `no_path`
  finding `get` and `why` give — "did you mean" included — instead of
  exit 4 and an empty list.
- **A mistyped verb is a usage error, not a silent success.** Verb
  dispatch reads the first argument only, and anything matching no
  verb fell through to the bare form as a file name, last one winning
  — so `aontu vet2 schema.aon good.json` printed `good.json` and
  **exited 0**, which in a tool loop reads as a passing validation.
  The bare form has always been documented as `aontu [options]
  [file]`, singular; a second file name is now exit 2, naming the
  likely cause. A file genuinely named like a verb is still reachable
  as `./vet`.

### Added — the loop, and the documentation, are executed

- **An end-to-end repair-loop test**, in both implementations:
  emit → vet → why → set → re-vet through the whole command, with the
  exit code asserted at every step. The shared suite pins each verb in
  isolation, so every verb could be right and the loop still not
  close. Three arms — the loop that closes, the pinned value that
  refuses the repair and leaves both files untouched, and the schema
  that does not stand up.
- **The teaching documents are held to the engine.** Every
  `aontu`/`aon` example in `index.md`, `tutorial.md`, `how-to.md` and
  `reference-language.md` must parse, and every one that states its
  result must generate exactly that. The skill sources were already
  executed this way; the prose documentation was not.

### Fixed — the two release blockers (security, and cross-port parity)

Both were found by driving the delivered surface end to end
(`docs/capability-review/status-2026-08-21.md`) and had to be closed
before this line could be published.

- **A served evaluation no longer executes caller-supplied code.**
  `vet`, `get`, `why` and `diff` took no trust profile at all, so a
  document containing `@"x.js"` was `require()`d in the evaluating
  process — and four of the MCP server's six tools ran that way while
  the module and the API reference both claimed confinement. The
  library entry points now take a `trust` option, and the MCP server
  INJECTS the confined profile into every tool from one place, so a
  tool cannot run unconfined without visibly discarding it. Covered
  per tool from the live tool list, and against the spawned
  `bin/aontu-mcp.js`.
- **The two ports no longer disagree about `vet`'s verdict.** Five
  constructs flipped, in both directions:
  a call whose target is not a name (`f(1)(2)`, `(1)(2)`,
  `upper("x")(2)`) — Go returned the last term and answered `valid`
  where TypeScript refused; `path()` given something that is not a
  path (`path([1,2])`, and every spelling of a `-0` segment) — Go
  handed the argument back; and two regex cases where RE2's own
  compile failure reached the user, contrary to ADR-003 — a repeat
  count above 1000, and a brace that opens no counted quantifier
  (`x{y}`), which JavaScript's `u` flag calls a syntax error and RE2
  reads as a literal. The repeat bound is now Aontu's, checked in the
  normaliser before either engine compiles. Two more of the same
  family, found by sweeping around it: a quantifier applied to `^` or
  `$`, and a `}` that closes no counted quantifier — JavaScript's `u`
  flag calls each a syntax error where RE2 accepts it. Shared rows pin
  all of it, in both runners (counts live in the register). The sweep
  stopped one construct short: `\b` and `\B` are assertions too, and
  the entry above closes them.
- **A refused call keeps its position and its code.** The non-name
  refusal is sited where TypeScript sites it, rather than rendering
  `<no-file>:-1:-1`, and survives a pipe (`0 |> f(1)(2)`) as
  `unknown_function` instead of being reclassified `pipe_target`.

One related divergence is recorded rather than fixed: under an
`@"…"` include the Go port names the entry file on a schema-role
site where TypeScript names the included file (row and column agree)
— OPEN #66 in `test/spec/divergent.tsv`.

### Added — the rest of the capability review (G1 completion, G3–G8)

Everything after `re()` below landed in this line too; this heading
summarises rather than itemises, and the
[progress register](docs/capability-review/progress.md) is the
per-phase record with pins. In both implementations unless noted:

- **Constraint algebra completed** (G1 phases 3–6): `length` and
  `unique`, cross-field arguments with residuation, the `must`
  evaluate-only check, and the `lossy_integer_literal` exactness
  rule.
- **`aontu vet` completed** (G2 phases 3–6): the CLI verb, the Go
  port, SARIF and `--watch`, the in-repo `vet-action/`, and
  multi-error collection.
- **Subsumption and evolution** (G3): the `subsume` and `breaking`
  verbs, `$.aontu_policy.compat`, `deprecate()`, the
  default-validity lint, and `trim --check`.
- **Identity and relations** (G4): `id()`, `refer()`, the derived
  entity/edge graph, the bundled `std/system` vocabulary, and
  `aontu relations`.
- **The trust profile** (G5): include capability, deterministic
  `passes`/`depth` budgets, and the include manifest — the
  capability default flip is still staged for the next major.
- **Distribution, local half** (G6): the hash form and
  `aontu hash`, module identity and resolution,
  `mod tidy`/`mod vendor`/`mod manifest`,
  and the publish boundary; the two network verbs are not built.
- **Machine access** (G7): `aontu get`, `why` with the provenance
  recorder, the overlay `set`, the path-addressed `diff` (API and
  MCP), the MCP server
  (TypeScript), the published grammars, `agentsmd`, the skill, and
  the REPL inspection mode (`--jsonl` still unreachable in the Go
  CLI — the register's G7.7 records it).
- **Generation** (G8): `pack`, `each`, `filter`, `match`, the
  placeholder `_`, and the `|>` pipe.

## Go 0.1.10 — 2026-08-17 · TypeScript 0.52.1

### Added — `re()`, pattern membership in the constraint algebra

The constraint algebra gains its sixth atom (capability G1 phase 2).
`re(p)` admits a string matching `p`, in both implementations:

```
name: string & re("^[a-z][a-z0-9-]{0,62}$")
```

- **Matching is unanchored**, as it is in both host engines, so
  `re("el")` admits `"hello"`. Anchor with `^` and `$` to constrain the
  whole string.
- **The string kind is implied**, so `string & re("x")` canonicalises to
  `re("x")` — the same rule that already makes `number & min(0)`
  canonicalise to `min(0)`.
- **Patterns accumulate and are never simplified.** `re("x") & re("a")`
  keeps both, sorted by pattern text, and a value must match every one.
  Two patterns are never declared empty at composition time: that would
  be regex containment, which this algebra deliberately does not do, so
  a contradiction between patterns surfaces against data instead.

**Aontu defines the pattern language; the host engines are rewritten to
it** (new **ADR-003**). TypeScript compiles with JavaScript's
backtracking `RegExp` and Go with RE2 — different languages, in
different complexity classes, over different alphabets. Rather than
enumerate the differences and refuse them (which leaked three times:
`\A` is an anchor in RE2 and a literal `A` in JavaScript, `\s` matched
U+00A0 in one engine only, and `.` counted UTF-16 units in one and code
points in the other), `re()` **normalises** the pattern before either
engine compiles it:

    \d  [0-9]              \D  [^0-9]
    \w  [0-9A-Za-z_]       \W  [^0-9A-Za-z_]
    \s  [ \t\n\r\f\v]      \S  [^ \t\n\r\f\v]
    .   [^\n]              \A  ^        \z  $

These are Aontu's definitions, not either host's. Note that **`\s` is
those six ASCII characters only** — it does not match U+00A0, though
JavaScript's does. Matching counts code points in both.

Refusal is reserved for what rewriting cannot reach: constructs one
engine lacks (backreferences, lookaround), spellings that change meaning
wholesale (any `(?…)` but `(?:`), and a quantifier applied to a group
containing a quantifier or an alternation — that last about *cost*, not
meaning, since `(a+)+$` against twenty-nine characters takes 45 seconds
in JavaScript and 0.065s under RE2, and a regex match is counted by no
evaluator budget. Refusals raise the registered `constraint_pattern`
code, and the message restates the whole accepted subset so an author
need not consult the reference.

Canon renders the pattern **as written**, never the rewritten form.

Pinned by the new `test/spec/constraint-re.tsv` (89 shared rows,
promoted from `test/spec/draft/` with every expectation re-probed
through both engines). The builtin registry goes from 17 to 18 names,
in both ports and both LSP completion lists. `test/spec/files/regex-corpus.tsv`
is a differential corpus of 400 generated patterns: both ports run their
own normaliser over it and must reproduce the pinned verdict byte for
byte, so a drift fails in whichever port drifted.

## Go 0.1.4 — 2026-06-22 · TypeScript 0.47.0 (unreleased)

### Breaking — the number tower (TypeScript and Go)

`number` is no longer a leaf of the lattice. It is now the pure
supertype of four **disjoint** numeric leaves — `integer`, the new
`float`, and two new exact leaves, `biginteger` and `bigdecimal`,
reached only through the new `0d` literal prefix:

```
number                the set of all numeric values
├── integer           int64-window exact
├── float             IEEE-754 binary64        (what number used to name)
├── biginteger        unbounded exact integer  (0d123)
└── bigdecimal        exact base-10 decimal    (0d0.1)
```

Alongside it, every numeric operation the language has is now **exact
or an error**: nothing rounds silently any more, in either port. The
rationale is in `docs/design/number-tower.md`; the contract is pinned
by the shared `test/spec/number-tower.tsv` and is identical in both
implementations.

**Migration in two lines.** A schema that said `number` and *meant*
binary64 must now say `float`. A value that binary64 cannot hold
exactly must now be written `0d` — where such a value was previously
rounded in silence, it is now refused.

- **`number` widens to a supertype; `float` names the binary64 leaf.**
  `number` now admits a value of *any* numeric leaf and no concrete
  value ever carries it; `float` is a new kind keyword for the
  IEEE-754 binary64 leaf. Kind meets follow from disjointness:
  `number & float` → `float`, `number & 1.5` → `1.5`, and
  `float & integer` is an error (two leaves describe disjoint value
  sets, so they have no common lower bound). The `super()` ladder
  gains its real rung: `super(1.5)` → `float` (was `number`),
  `super(float)` → `number`, `super(number)` → `top` — one landed row
  (`number-model.tsv:super-float-canon`) flips. What breaks: a schema
  written `a: number` still admits everything it admitted, and now
  *also* admits `0d` values — the new schema subsumes the old, so
  existing data is unaffected, but a schema that meant "binary64 only"
  silently became more permissive. *Write `float` where you meant the
  binary64 leaf, and keep `number` where you meant "any number".*

- **`0d` literals, and the two exact leaves.** `0d` opts a literal into
  an exact leaf, and the leaf follows the source exactly as R1's `.`
  rule already did: digits only is a **biginteger** (`0d5`, `-0d5`,
  `0d123456789012345678901234567890`), while a `.` or an exponent
  anywhere makes it a **bigdecimal** (`0d0.1`, `0d1.5e2`, `0d1e3`).
  The exact leaves are reached *only* this way — never by promotion,
  coercion or inference — so a document that writes neither `0d` nor
  `float` means exactly what it meant before. Details that are
  contract, not incidental:
  - **One value, one rendering.** Scale is presentation, not identity,
    so a literal normalises at parse: `0d0.10`, `0d0.1` and `0d1e-1`
    are the same value and canon as `0d0.1`. An integral bigdecimal
    keeps one decimal place (`0d1e3` canons as `0d1000.0`), because
    `0d1000` would reparse as a *biginteger*. Negative zero never
    survives: `-0d0` is `0d0`, `-0d0.0` is `0d0.0`.
  - **The leaves are disjoint.** `5 & 0d5`, `1.5 & 0d1.5` and
    `0d5 & 0d5.0` are all errors, for the same reason `1 & 1.0` is:
    a cross-leaf meet would have to pick a kind, which makes `&`
    asymmetric in kind.
  - **The sign goes before the prefix** (`-0d5`). `0d-5`, `0d.5` and a
    bare `0d` are not literals.
  - **An exactness budget, not a rounding mode.** At most 4096
    coefficient digits and an absolute scale of at most 4096, checked
    at parse and at every operation; beyond it the value is refused
    (`decimal_budget`), never approximated. `0d1e1000000000` is
    rejected on sight rather than materialising a gigabyte of zeros.
  - **Programmatic construction obeys the same contract**, including
    the budget: Go gains `NewBigInteger(*big.Int)` and
    `NewBigDecimal(string)`, TypeScript `BigIntegerVal` (a `bigint`)
    and `BigDecimalVal` (a string). A float argument is deliberately
    not accepted — it has already rounded before the library can see
    it.

  What breaks: `0d12` used to be the bare string `"0d12"`, `0d1.5`
  used to be a path-reference error, and `-0d5` used to be a
  `negative` error. *Quote it (`"0d12"`) to keep the string.*

- **Arithmetic is exact, and `integer + integer` now refuses an inexact
  sum.** The exact ladder is `integer < biginteger < bigdecimal`: a
  mixed exact operation promotes to the widest operand, is computed
  exactly, and never demotes (`1 + 0d0.5` → `0d1.5`, `0d7 + -0d2` →
  `0d5`). `0d0.1 + 0d0.2` is `0d0.3`, which is the reason the exact
  leaves exist — binary64 gives `0.30000000000000004`. `float` stays
  off that ladder with its existing contagion against `integer`
  (`1 + 2.0` → `3.0`, unchanged), and mixing it with either exact leaf
  is a hard error in **both** operand orders (`1.0 + 0d2` and
  `0d0.5 + 1.0` are both `exact_float_mix`): an exact value never
  silently becomes a binary float. `upper()`/`lower()` are exact
  ceiling/floor keeping the argument's kind, unary minus negates
  exactly, and string concatenation renders marker-free digits
  (`"q" + 0d0.1` is `"q0.1"`, never `"q0d0.1"`).

  The breaking part is plain `integer + integer`. It is now computed
  exactly — `bigint` in TypeScript, checked `int64` in Go — and the
  exact answer must then satisfy the same storage contract R1 applies
  to a literal: integral, inside int64, **and** exactly representable
  in binary64. Binary64 addition silently rounded sums of exact
  operands, so `4503599627370496 + 4503599627370497` produced
  `9007199254740992` instead of `…993`; it is now an
  `inexact_integer_sum` error. The exactly-representable half of the
  test is what keeps the ports together: Go's `int64` can hold sums
  TypeScript's double cannot, so both refuse rather than diverge.
  *Write the operands as `0d` literals for a sum that leaves the exact
  binary64 window.*

- **Lossy integer literals are refused, with a `0d` escape.** An
  integer-source literal — plain decimal, or `0x`/`0o`/`0b`, with or
  without a non-negative exponent — whose value binary64 cannot hold
  exactly is now a located parse error (`lossy_integer_literal`) whose
  hint names the fix. **The rule is exactness, not magnitude.**
  `9007199254740992` (2^53), `100000000000000000000` (10^20), `1e21`
  and `0x10000000000000000000000000000000` (2^124, a power of two) are
  all exact and remain values; `9007199254740993` (2^53+1),
  `0x7fffffffffffffff` (2^63−1, which rounds *up* to 2^63) and
  `0xffffffffffffffff` (2^64−1) are refused. Literals and computed
  sums ask one shared exactness predicate, so they cannot disagree
  about what exact means. Six landed rows flip
  (`scalar.tsv:hex-big`/`hex-big-canon` and the `number-model.tsv`
  lossy rows).

  This reaches beyond `0d`-using documents: a plain JSON document
  containing `{"x":9007199254740993}` writes no `0d` at all, yet flips
  from silently generating a rounded number to an error. That is the
  deliberate point — refusal over corruption — but it means the
  JSON-superset guarantee is "every JSON document parses", not "every
  JSON document behaves identically". *Write `0d9007199254740993` to
  keep the exact value.*

- **Exact generation, and a new public `exactJSON` export
  (TypeScript).** An exact value now reaches JSON as exact digits. Go
  `Generate` returns `*big.Int` for a biginteger and `*Decimal` for a
  bigdecimal; `encoding/json` already emits exact digits for the
  former and the latter has a `MarshalJSON`, so the Go CLI is
  unchanged. TypeScript `generate()` returns a native `bigint` and a
  `Decimal` — and `JSON.stringify` **throws** on a `bigint`, with no
  replacer able to emit an unquoted number. TypeScript therefore gains
  its own emitter, `exactJSON(value, indent?)`, exported publicly
  alongside the `Decimal` class; the CLI (indented) and the shared
  suite's byte-exact `gens` mode (compact) both go through it, so
  neither can drift from the other or from Go. JSON itself was never
  the obstacle — a JSON number is arbitrary-precision text.

  What breaks: a TypeScript consumer of `generate()` on a document
  that uses `0d` receives `bigint`/`Decimal` where it expected
  `number`, and `JSON.stringify` on that output throws. *Use
  `exactJSON`.* A `0d`-free document generates exactly what it
  generated before.

- **An integer past 2^53 now generates as a `bigint` (TypeScript).**
  Aontu's `integer` leaf is an int64 window, but TypeScript stores it in
  a double, and above `Number.MAX_SAFE_INTEGER` a double no longer
  renders its own digits: `x:1152921504606846976` (2^60) generated and
  canoned as `1152921504606847000` — a *different* integer that merely
  rounds to the same double — while Go printed the true value from its
  int64. That was the parity ledger's last entry (issue #21), and it is
  now closed: TypeScript renders an integer-kind value by its exact
  digits in canon, and `generate()` hands back a `bigint` past the
  safe-integer line so `exactJSON` can write those digits. `Number.
  isSafeInteger` is the threshold because it is exactly "this double is
  an integer that renders its own digits".

  This is not a rendering choice made to force agreement: the tower's
  refusal of lossy literals means both ports now hold *exactly* the
  value the source asked for, so there is a right answer, and Go was
  already printing it.

  What breaks: a TypeScript consumer reading an integer above 2^53 out
  of `generate()` receives a `bigint` where it expected a `number`, so
  `out.x + 1` throws a `TypeError`. Those are precisely the values that
  were already silently wrong — a loud failure replaces a quiet one.
  *Nothing below 2^53 changes, in type or in bytes.* Go is unaffected:
  its leaf is an int64, exact at every magnitude, so it returns an
  `int64` throughout. The serialised JSON now agrees in both ports.

- **`NewInteger` refuses an inexact `int64` (Go).** Programmatic
  construction now obeys the same storage contract as a literal:
  `NewInteger(9007199254740993)` was exact in Go and unreachable in the
  canonical TypeScript port, a divergence no parse-time rule could see
  because no literal can express it. An `int64` that binary64 cannot
  carry exactly now yields a nil value carrying the same "not exactly
  representable" hint — and the same `0d` escape — that a lossy literal
  gets, so it surfaces at `Generate` rather than corrupting the
  document. The signature is unchanged. *Use `NewBigInteger` for an
  exact integer of any size.* The rule is exactness, not magnitude:
  `math.MinInt64` is a power of two and still constructs.

- **Three new reserved words, plus the `0d` prefix.** `float`,
  `biginteger` and `bigdecimal` are kind keywords; all three were
  ordinary bare strings, as was any `0d…` run. Nothing in the
  repository, the shared suite, the docs or the editor files used any
  of them meaningfully, but a real document might. The concrete shape
  this takes for a *reference* is worth naming: `a:$.float` against a
  `float:` key now fails exactly as `a:$.number` already did — the
  pre-existing keyword-versus-path behaviour, reached by one more
  word. *Quote them (`"float"`) to keep the string.*

- **A preference is now overridden by a peer of a sibling numeric
  leaf.** `a:*2 & 3.0` was an error and now yields `3.0`. This is a
  loosening, and it removes an asymmetry that existed only because
  `number` was simultaneously the binary64 leaf and `integer`'s parent
  — the mirror case `a:*2.2 & 3` already worked. `PrefVal` uses
  `superior()` as its override gate, so moving a float value's
  superior from `number` to `float` would otherwise have *tightened*
  four behaviours both ports agreed on before the tower (`*2.2 & 3`,
  `*lower(2.2) & 3`, `*upper(1.1) & 3`, `*1.5 & integer`); the gate
  therefore tests the numeric **family**, not the leaf. *Nothing to do
  unless you relied on the error.*

- The shared spec gains `test/spec/number-tower.tsv`, and the runners
  gain a fourth mode, `gens`, which compares the **byte-exact** JSON
  serialisation of a generated value. The existing `gen` mode decodes
  through float64 on both sides, so two distinct exact integers above
  2^53 compare equal there — exactness is unassertable without `gens`.

### Fixed — spreads & `type()` (TypeScript and Go)

- **`key()` through spreads (TypeScript and Go)**: `key()` (and other
  path-dependent functions) no longer leak the *source* key when a spread
  is applied through a `$ref` (`&:$.ref`) or through nested maps — they
  resolve to the destination key at each level. The TypeScript behaviour
  was brought to full Go parity.
- **`type()` spreads now apply (TypeScript and Go)**: a `type()` used as a
  spread emits its constrained values at the destination rather than
  marking the destination as a type, so `&:type({k:key(),x:number})`
  behaves like the non-type spread `&:{k:key(),x:number}` (`key()`
  resolves to the destination key, kinds constrain, fields are emitted).
  This holds for both inline and `$ref` spreads and for nested types;
  previously an inline `type()` spread dropped the child in TypeScript and
  a `type()`+`key()` spread errored in Go. Type/hide marks on applied
  spreads are cleared recursively.
- Salvaged the `perf0` spread spec corpus into the shared
  `test/spec/spread-*.tsv` suite, run by both implementations.

### Fixed — fragility audit

- **Deep-structure marks (TypeScript)**: `walk()` defaulted to a depth
  limit of 32 and silently returned partial, so `$ref`/function
  mark-clearing missed marks on structures nested deeper than 32 levels
  (wrong gen output). The default is now high enough that real configs
  are never truncated while still bounding accidentally-cyclic walks.
- **Deep-input safety (Go)**: `asVal` now bounds its recursion
  (`maxNodeDepth`), so pathologically deep input yields a clean
  `max_depth` error instead of an unrecoverable stack overflow; this
  also transitively bounds `setPaths`/`clonePath`. (Extremely deep input
  can still exhaust the underlying `@tabnas` parser, which has no depth
  option — a dependency limit.)
- **Trial-mode exception safety (TypeScript)**: `DisjunctVal.unify`
  restores the swapped `ctx.err`/`ctx._trialMode` in a `finally`, so a
  throw inside a member trial can no longer leak `_trialMode=true` (which
  would collapse later real errors to the shared `TRIAL_NIL` sentinel).
- **Disjunct defaults (TypeScript and Go)**: when generating a disjunction
  with preference (`*`) members, the fold over the preferred members
  indexed the unfiltered member list, so prefs that were not the leading
  alternatives were skipped (`1 | *{x:1} | *{y:2}` produced `{x:1}`
  instead of `{x:1,y:2}`). Both implementations now fold over the filtered
  list. Regression rows added to `test/spec/disjunct.tsv`.
- **`unknown_var` diagnostic (TypeScript)**: an undefined `$var` reported
  `invalid_var_kind` because the `unknown_var` branch fell through the
  `typeof` ladder; it now reports `unknown_var`. (Go already reported it
  correctly.)
- **`NumberVal` validation (TypeScript)**: the constructor used the
  coercing global `isNaN`, which accepts `null`/`''` as numbers; it now
  uses `Number.isFinite`, matching `IntegerVal`.
- **Robustness (TypeScript)**: `isExpect` is now declared/defaulted on the
  `Val` prototype like every other type discriminator (previously it
  worked only because `undefined` is falsy); the unify catch-all now
  preserves the original error message (and flags stack-overflow
  `RangeError`s) on the `internal` Nil instead of discarding it.

### Changed — hardening & docs (fragility audit)

- **Go**: the per-base parser cache (`langForBase`) is now bounded
  (`maxLangCache`) so long-running hosts (e.g. the LSP) cannot grow it
  without limit.
- **Go**: a source map key in the reserved sentinel namespace (prefix
  `\x00aontu_`, used internally for key order / spreads / optional keys)
  is now rejected with a clean parse error instead of silently colliding
  with that internal state. (The TS implementation stores the state under
  a `Symbol` and is already immune.)
- Documented that a `parse()`/`Parse()` result is **single-use**:
  `unify`/`generate` refine the tree in place (the MapVal/ListVal TOP
  fast-path returns `this`), so the same Val must not be re-unified,
  re-generated, or shared across threads. The public entry points
  re-parse per call, so this only affects callers that hold a parsed Val.
- Documented the security model of the `@"file"`/`@"pkg"` resolvers
  (they read any reachable file/module; supply a confined resolver in
  less-trusted contexts), the process-global Val id counter's growth, and
  the requirement to pin `@tabnas` versions exactly because the spread /
  optional rules depend on parser internals.

### Changed — parser packages (TypeScript and Go)

- **Go**: migrated the parser from the `github.com/jsonicjs/*` Go modules
  to the `github.com/tabnas/*` modules (`tabnas/jsonic`, `tabnas/expr`,
  `tabnas/multisource`, `tabnas/path`, `tabnas/directive`). Behaviour
  unchanged; the full suite passes. Adaptations: the `RuleSpec` API moved
  from exported slice fields to methods (`PrependOpen`/`AddClose`/`AddAC`);
  and the map `Merge` now returns the value as-is for a new key
  (`prev == nil`) — `tabnas/multisource` calls `Merge` for every key of a
  top-level `@"file"` load, and `asVal(nil)` is an empty map, so the old
  code wrongly produced `{} & val` and dropped the loaded keys.

- **TypeScript**: migrated the parser from the `@jsonic`/`jsonic` packages
  to the `@tabnas` packages (`@tabnas/jsonic`, `@tabnas/expr`,
  `@tabnas/multisource`, `@tabnas/path`, `@tabnas/directive`,
  `@tabnas/debug`). Behaviour is unchanged — the full suite (393 tests)
  passes. Three integration points needed adapting to `@tabnas`'s parser:
  - the parser core is split into `@tabnas/parser` + `@tabnas/jsonic`, so
    plugin `Plugin` types are reconciled via a small `asPlugin` cast and
    the model resolver is typed against `Tabnas`;
  - literal scalars are wrapped into Vals in the `val` rule's *after-close*
    (`.ac`) hook rather than before-close, because `@tabnas` re-resolves
    the scalar token during before-close;
  - `MultiSource` is applied before the grammar customisation so the `@`
    directive's `val` alt survives, and the spread/optional `val→map`
    dives reset to a fresh node (`@tabnas` parent-seeds a descended node,
    which otherwise made nested `&:`/`?:` maps share — and self-reference —
    their parent's node).
- Requires Node.js >= 24 (the `@tabnas` packages require it; CI already
  runs node 24.x).

### Changed — source file extensions

- `.aon` is now the **preferred** Aontu source extension; `.aontu` also
  works. Both are tried (in that order) for extension-less `@"path"`
  loads.
- **`.jsonic` is retired**: it is no longer in the implicit-extension
  search or the resolver's processor configuration in either
  implementation. (An explicitly named file still parses via the default
  processor, but `.jsonic` is no longer a recognised Aontu extension.)
- All shared-spec and test fixtures renamed from `.jsonic` to `.aon`;
  docs updated accordingly.

### Added — Language Server (LSP)

- New `aontu-lsp` Language Server in both implementations, reporting
  unification diagnostics over stdio (TypeScript `bin` `aontu-lsp` →
  `dist/lsp-server.js`; Go `go/cmd/aontu-lsp`). The two servers are kept
  in parity: same capabilities and identical diagnostic text.
- The LSP logic is exposed as a reusable library, separate from serving:
  - analysis — `computeDiagnostics(src)` (`ts/src/lsp.ts`) and
    `lsp.Diagnostics(src)` (`go/lsp`, built on the new
    `aontu.Check(src) []Problem` in `package aontu`);
  - a transport-agnostic protocol handler — `LspHandler` (TS) /
    `lsp.Handler` (Go);
  - a thin stdio JSON-RPC server on top.
- Diagnostics report genuine errors only (conflicts, unresolved
  references, unknown functions, syntax errors); valid non-concrete
  schemas such as `a:string` produce none. Full documentation in
  `docs/lsp.md`.
- **Hover** (`textDocument/hover`): resolves the value under the cursor
  from the unified tree and shows its canon and kind. Library:
  `computeHover` (TS) / `lsp.Hover` (Go), built on the new
  `(*aontu.Aontu).Spans` core API.
- **Completion** (`textDocument/completion`): the built-in functions,
  scalar-kind keywords and literals. Library: `computeCompletions` (TS) /
  `lsp.Completions` (Go); function names sourced from the engine
  (`aontu.BuiltinFuncNames`).
- (Go) Reference, dot, and unknown-function NilVals now carry source byte
  offsets, so `no_path` and `unknown_function` diagnostics are positioned
  precisely (matching TS).

### Added — editor plugins

- `editors/` now contains thin LSP-client plugins that launch `aontu-lsp`:
  **VS Code** (`editors/vscode`), **Emacs** (`editors/emacs`, Eglot and
  lsp-mode, with a major mode + syntax), and **Vim/Neovim**
  (`editors/vim`, filetype/syntax + Neovim built-in LSP autostart). All
  associate `.aon` and `.aontu`.
- The LSP **library is server-independent** in both languages (Go `lsp`
  package does not import `cmd/aontu-lsp`; TS `lsp.ts` does not import
  `lsp-server.ts`), so third parties can reuse the analysis + handler with
  their own transport. Documented under "Bring your own server" in
  `docs/lsp.md`.

### Breaking (TypeScript)

- **Number model is now CUE-faithful and matches the Go port.** `integer`
  and `number` are distinct kinds, so two concrete literals of different
  kind no longer unify: `1 & 1.0` now errors (`scalar_kind`) instead of
  resolving to `1`. Previously the canonical TS treated `1` and `1.0` as
  equal because JavaScript has a single number type. Kind-constraint
  cases are unchanged (`number & 1` → `1`, `integer & 1` → `1`).
- **Negative zero normalises to `0`** in generated output and the AST,
  matching the Go port (JSON has no `-0`). Previously TS preserved `-0`.

### Breaking — number model (TypeScript and Go)

The kind of a numeric literal, the canonical rendering of a number, and
the result kind of `+`, `upper()`, `lower()` and `super()` are now a
single contract, identical in both implementations and pinned by the
101 rows of the new `test/spec/number-model.tsv`. Everywhere the two
ports previously disagreed about a number, they now agree. Full
rationale in `docs/design/number-model.md`; the rules are stated in
`docs/reference-language.md`.

- **A numeric literal has `integer` kind only if it fits int64.** The
  rule is now: the source text contains no `.`, **and** the value is
  integral, **and** the value lies in
  `-9223372036854775808 ≤ n < 9223372036854775808`. The upper bound is
  exclusive because 2^63−1 is not representable as an IEEE-754 double
  — it rounds up to 2^63. So `1e21`, `100000000000000000000`,
  `0x7fffffffffffffff` and `0xffffffffffffffff` are `number` kind and
  **no longer unify with `integer`**; `1e3` and `9007199254740992` are
  still `integer`, and `1.0` is still `number`. TypeScript previously
  called all of those `integer` (it tested only for an integral value),
  while Go called them `number` — so `1e21 & integer` succeeded in one
  port and errored in the other. Go reached its answer via
  `n == float64(int64(n))`, and converting an out-of-range float64 to
  an int64 is *implementation-dependent* per the Go spec, so it was not
  guaranteed either; the bound is now compared against the float64
  limits explicitly, before any conversion. *If you constrain a value
  of that magnitude, write `& number` instead of `& integer`.* The rule
  now lives in one helper per port (`ts/src/val/numkind.ts`,
  `isIntegerKind` in `go/lang.go`) and is applied at **every**
  construction site — parsed literal, `$var` binding, raw value from
  the API — so the same number can no longer acquire different kinds by
  different routes.

- **Canon renders a number-kind value with a fraction or an exponent.**
  Canon must reparse to a value of the same kind, so a number-kind
  value whose shortest rendering carries neither a `.` nor an exponent
  now gains a `.0` suffix: `1.0` canons as `1.0` (was `1`), `0.0` as
  `0.0`, and `1e20` as `100000000000000000000.0`. Already-unambiguous
  renderings are untouched (`1e21` → `1e+21`, `0.000001` →
  `0.000001`), and integer-kind canon is unchanged (`1000`). *Anything
  that compares canon text will see new output* — two rows in
  `test/spec/scalar.tsv` flipped accordingly. **Generation is
  unaffected** (`generate` still yields `1` for `1.0`), and so is
  string coercion inside `+`: `a+1.0` is still `"a1"`, never `"a1.0"`.

- **`+` no longer narrows the kind of its operands.** A numeric sum has
  `integer` kind only when **both** operands are of `integer` kind and
  the sum itself satisfies the literal rule; otherwise the result is
  `number` kind. Both ports previously re-derived the kind from the
  result value alone, so `1.5+1.5` produced an `integer` `3` and
  `(1.5+1.5) & integer` succeeded — **it now errors**. `1+1.0` is
  likewise `number`. `1+2` is still `integer`, and a `*`-preferred
  operand contributes its preferred value's kind. *Replace
  `& integer` with `& number` on any sum that can take a fractional
  operand.*

- **`super(x)` is no longer inert.** It returned the `super()`
  function's own superior — `top` — so it unified with anything. It now
  returns the lattice-superior of its **argument**: `super(1)` →
  `integer`, `super(1.5)` → `number`, `super(a)` → `string`,
  `super(true)` → `boolean`. Where the argument has no meaningful
  superior (a map, a list, a bare kind, `top`) the result is still
  `top`. *A `super()` that was previously a no-op will now constrain* —
  `super(1) & 2.5` is a conflict where it used to succeed. (The
  language reference's `super(1)` → `number` example was wrong under
  the documented lattice — `number ⊐ integer ⊐ 1` — and has been
  corrected to `integer`.)

- **Malformed digit separators are rejected instead of silently
  accepted.** A `_` is legal only as a *single* separator *between*
  digits. A run that breaks the rule is no longer a number at all: it
  falls through to text, so `1__0` is the string `"1__0"` (was `10`)
  and `0x_ff` / `0xff_` are strings (were `255`). A typo now surfaces
  as a string rather than becoming a different number. `1_000_000`,
  `0xf_f`, `1_0.5_1` and `1e1_0` are unaffected.

### Fixed — number model (TypeScript and Go)

- **Unary `-` bound looser than every infix operator (TypeScript and
  Go).** Every aontu operator is re-based far above the `@tabnas/expr`
  defaults, but the unary prefixes were not, so `-1 & integer` parsed
  as `-(1 & integer)` — whose operand is an unresolved conjunction,
  which negation rejects. `-1 & integer`, `-2+3` and `-1|2` therefore
  all collapsed to `nil` in **both** ports; they now yield `-1`, `1`
  and `-1|2`. Unary `-`/`+` now bind tighter than `+`, `&` and `|`, and
  looser than `.`.
- **`upper()` / `lower()` narrowed an integer argument (TypeScript and
  Go).** Both returned a plain number-kind value, so `upper(2) &
  integer` errored. The ceiling/floor now keeps the **argument's**
  kind: `upper(2)` is an `integer` `2`, `upper(1.1)` a `number` `2`.
  This also makes the actual result kind agree with the `superior()`
  these functions already advertised.
- **`1|1.0` collapsed to a single alternative (TypeScript).**
  `ScalarVal.same` compared only the value — a leftover from before
  `integer` and `number` became distinct kinds — so disjunct
  deduplication merged the two branches and `(1|1.0) & 1.0` then
  errored. It now compares kind as well, so `1|1.0` keeps both
  alternatives and `(1|1.0) & 1.0` resolves to the float. (Go's
  `valSame` already compared kind; its canon for `1|1.0` was the
  ambiguous `1|1`, which the canon rule above resolves to `1|1.0`.)
- **Negative zero survived in Go.** `-0.0` generated `-0` and canoned
  as `-0`. Unary minus now yields positive zero for both kinds, the
  generate path normalises `-0` to `0`, and the number formatter
  renders both zeros as `0` — the three things TypeScript already did.
  `-0` generates `0` and canons as `0`; `-0.0` generates `0` and canons
  as `0.0`.
- **Negating the int64 minimum wrapped in Go.** `negate` applied
  two's-complement wrap-around to `math.MinInt64` (reachable only
  through the `NewInteger` API — no literal can express it). It now
  widens to a `number` instead.

### Fixed (Go)

- Unknown function calls now error with `unknown_function` instead of
  silently degrading to parenthesised grouping (`x:foo(1)` previously
  returned `{"x":1}`; it now errors, matching the canonical TS).
- Unifying two `close`d maps now selects a deterministic driver (fewer
  keys, then lexicographic key order), so the result is independent of
  operand order, matching `ts/src/val/MapVal.ts`.
- `jsonString` canon escaping now covers `\b`, `\f` and other control
  characters (`\u00XX`), matching JavaScript's `JSON.stringify`.

### Changed

- (Go CLI) The REPL no longer silently truncates lines over 64 KB,
  reports scanner errors, and no longer ignores stdin read errors.
- (TypeScript) Internal type-discriminator flags corrected for
  consistency (`LowerFuncVal` → `isLowerFunc`, `OpBaseVal` → `isOp`,
  `NullVal`'s `isNull` now has a prototype default). No behaviour change;
  these flags were previously never read.

### Documentation / tests

- Expanded the shared spec (`test/spec/*.tsv`) with order-independence
  and commutativity cases (refs, chained refs, disjunction, spread+pref),
  scalar edges (`1.0`, `-0`), the `1 & 1.0` conflict, and an
  unknown-function error row — each verified to pass identically in both
  implementations.
- `AGENTS.md` documents the in-place mutation caveat (parsed `Val`s are
  single-use), and the remaining known TS/Go divergences: numeric canon
  formatting is guaranteed only for a documented decimal subset
  (`0` and roughly `1e-6 ≤ |x| < 1e20`), error message text, and
  parse-level canon.
- New shared spec file `test/spec/number-model.tsv` (101 rows) pins the
  number model end to end: kind classification and the int64 bound,
  negative zero, kind-aware scalar identity, kind-preserving canon,
  kind contagion through `+` / `upper()` / `lower()`, `super()`, and
  the lexical edges (base prefixes, digit separators, exponents,
  leading zeros, numeric map keys, unary minus).
- New `test/spec/divergent.tsv` — a parity ledger recording behaviours
  where the two ports are known to disagree, so a divergence is tracked
  rather than rediscovered or accidentally baselined as the contract.
  Every entry is commentary (a row here could not pass in both ports by
  definition, so the file contributes none), and it currently records
  two: upper-case base prefixes (`0X1F`), and integer-kind values above
  2^53 that need more than 17 significant digits to write exactly.
- `docs/reference-language.md` states the number model: the three-part
  integer-kind rule and what falls outside int64, the kind-preserving
  results of `+`, `upper()`, `lower()` and `super()`, and the canonical
  rendering of number-kind values. New design note
  `docs/design/number-model.md` carries the rationale.

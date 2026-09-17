# Generation reference

A component tree is the value a generator answers: nested nodes that
name every output file, every folder above it, and every span of text
inside it.

This page is normative for the tree's shape, for each component's props
and admitted children, and for what each verb writes when handed one.
The constructs that *compute* a tree are specified in the language
reference and not here: [Generating children: `pack` and
`each`](reference-language.md#generating-children-pack-and-each),
[Selecting: `filter` and `match`](reference-language.md#selecting-filter-and-match),
[The placeholder `_`](reference-language.md#the-placeholder-_),
[Transforming: `emit`](reference-language.md#transforming-emit), and
[Generation](reference-language.md#generation) for what `generate`
requires of a model. Each component function's one-entry summary is in
that page's [Functions](reference-language.md#functions) index.

The option lists and synopses for the verbs belong to the API
reference, under [`aontu render`](reference-api.md#aontu-render) and
[`aontu trace`](reference-api.md#aontu-trace). Behaviour stated below is
pinned by [`test/spec/cmp.tsv`](../test/spec/cmp.tsv) and
[`test/spec/trace.tsv`](../test/spec/trace.tsv), which both
implementations run.

## Contents

- [The component tree](#the-component-tree)
- [The components](#the-components)
  - [`project`](#project)
  - [`folder`](#folder)
  - [`file`](#file)
  - [`content`](#content)
  - [`line`](#line)
  - [`fragment`](#fragment)
  - [`slot`](#slot)
  - [`inject`](#inject)
  - [`copyfiles`](#copyfiles)
  - [`listitems`](#listitems)
- [What `aontu render` writes](#what-aontu-render-writes)
- [What `aontu trace` reports](#what-aontu-trace-reports)
- [Order and determinism](#order-and-determinism)
- [Related](#related)

---

## The component tree

Every component function answers a map of exactly three keys: `cmp`,
the string a generator runtime looks the component up by; `props`, a map
holding that component's declared props; and `children`, a list of
further nodes. A node built by a component function is
[closed](reference-language.md#closed-values-close--open), so a fourth
key is a `closed` refusal rather than an ignored field:

```aon
out: file("a.txt", ["x" ["y" "z"]])
```

```json
{
  "out": {
    "children": [
      { "children": [], "cmp": "Line", "props": { "src": "x" } },
      { "children": [], "cmp": "Line", "props": { "src": "y" } },
      { "children": [], "cmp": "Line", "props": { "src": "z" } }
    ],
    "cmp": "File",
    "props": { "name": "a.txt" }
  }
}
```

Two rules are visible in those three children. **A bare string child is
a `line`**, terminator included, which is what a template body line
desugars to; an explicit `content()` is still a span with no terminator.
And **a nested list splices rather than nests**: the children argument
is flattened in place, recursively, so `emit`'s list of pieces arrives
as siblings of the strings written beside it. Both are pinned by
`test/spec/cmp.tsv` (`cmp-bare-string-child`, `cmp-bare-string-spliced`,
and `cmp-children-splice`).

The conversion happens only where `line` is an admitted child, so
`file`, `fragment`, `slot`, `inject`, and `listitems` take a bare string
and `folder` and `project` refuse one (`cmp-bare-string-needs-line`,
`cmp-bare-string-not-in-project`).

**A node is an ordinary map, so every query verb reads it.** Write a
`tree.aon`:

<!-- test: scenario generation-tree -->
<!-- test: file tree.aon -->
```aon
out: project(".", [folder("src", [file("main.js", ["const x = 1"])])])
```

and address a node inside it by path:

<!-- test: run -->
```sh
$ aontu model get '$.out.children.0.cmp' tree.aon
"Folder"
$ aontu model get '$.out.children.0.children.0.children.0' tree.aon
{
  "children": [],
  "cmp": "Line",
  "props": {
    "src": "const x = 1"
  }
}
```

The `Line` node under a `File` was written as the string `"const x = 1"`.

**The prop schema is enforced by the component function, not by the
tree.** A hand-written map carrying a `cmp` key that names a component
is admitted as a child, and its props are never checked against the
schema below: an undeclared prop reaches the runtime, where eight of
the ten components drop it in silence. Build a node with `file()`,
`line()`, and their eight siblings, and a misspelled prop is a refusal
at the call instead.

## The components

Ten functions build nodes. The signature column is the arity the parser
enforces, so a leaf handed a children list is a `func_arity` error
rather than a bad argument (`cmp-leaf-takes-no-children`). The shorthand
column names the prop a bare string spec sets.

| signature | node | shorthand | children | props |
|---|---|---|---|---|
| `project(spec?: string\|map, children?: list) : map` | `Project` | `folder`, optional | `project`, `folder`, `file`, `copyfiles` | `name`, `folder` |
| `folder(spec: string\|map, children?: list) : map` | `Folder` | `name` | `folder`, `file`, `copyfiles` | `name` |
| `file(spec: string\|map, children?: list) : map` | `File` | `name` | `content`, `line`, `fragment`, `inject`, `listitems`, `copyfiles` | `name`, `exclude`, `mode` |
| `content(spec: string\|map) : map` | `Content` | `src`, a span | none | `arg`, `src`, `name`, `indent`, `extra`, `replace`, `raw` |
| `line(spec: string\|map) : map` | `Line` | `src`, a span | none | `arg`, `src`, `name`, `indent`, `extra`, `replace`, `raw` |
| `fragment(spec: string\|map, children?: list) : map` | `Fragment` | `from` | `slot`, `content`, `line`, `listitems` | `from`, `indent`, `replace`, `eject` |
| `slot(spec: string\|map, children?: list) : map` | `Slot` | `name` | `content`, `line`, `fragment`, `listitems` | `name` |
| `inject(spec: string\|map, children?: list) : map` | `Inject` | `name` | `content`, `line`, `listitems` | `name`, `markers`, `exclude` |
| `copyfiles(spec: string\|map) : map` | `CopyFiles` | `from` | none | `from`, `to`, `replace`, `exclude` |
| `listitems(spec: map, children?: list) : map` | `ListItems` | none | `content`, `line`, `fragment` | `item`, `line`, `indent` |

Every bad call answers the same error code, `invalid-arg`, registered
under the `conflict` class. The message's attempt word is the offending
name rather than a fixed verb: the prop that is not declared, the
required prop that is missing, `children` for a child the component does
not admit, or `spec` where the argument is neither a string nor a map.
Where more than one prop is wrong, the one named is the **first
written**, not the first in sorted order, and both ports walk the
written key list to keep that promise (`cmp-props-names-first-written`).

A child the component does not admit:

<!-- test: scenario generation-refusal -->
<!-- test: run -->
```sh
$ echo 'out: folder("src", [line("x")])' | aontu
[aontu/invalid-arg]: Cannot children values at path $.out
...
$ echo $?
1
```

`Cannot children` is the whole diagnosis: the argument is a well-formed
`line` node, and `folder` takes folders, files, and copies.

### `project`

Props `name` and `folder`. The one component whose text prop is
optional: `project()` answers a node with empty props, and a runtime
defaults the folder to `.`. Admits `project`, `folder`, `file`, and
`copyfiles` children, so a bare string is refused. A `folder` written as
anything but a non-empty string is refused by that name
(`cmp-project-folder-kind`, `cmp-project-folder-not-empty`). A runtime
joins `folder` under the run's output folder as a further path segment;
`name` names the project and adds no segment.

### `folder`

Prop `name`, required and non-empty (`cmp-folder-needs-a-name`,
`cmp-folder-name-not-empty`). Admits `folder`, `file`, and `copyfiles`;
a `content`, `line`, `fragment`, `slot`, `inject`, or `listitems` child
is refused as `children`, and so is a bare string. A runtime writes one
or more path segments below the enclosing folder, so `folder("a/b")` is
two of them.

### `file`

Props `name`, `exclude`, and `mode`. Admits `content`, `line`,
`fragment`, `inject`, `listitems`, and `copyfiles`, plus a bare string,
which becomes a `line`. Refuses a `folder` or `project` child, and
refuses an empty `name`. A runtime writes one output file at `name`
below the enclosing folder; the name may hold `/`, and the folders on
the way are made. `exclude` leaves an existing file alone, as `true`, a
path, or a list of paths and regexes. `mode` sets the file's permission
bits, written in decimal because aontu has no octal literal: `mode: 493`
is `0o755`, and `test/spec/cmp.tsv` uses `mode: 420` for `0o644`.

### `content`

Props `arg`, `src`, `name`, `indent`, `extra`, `replace`, and `raw`, the
span set. A leaf: a children list is a `func_arity` error, because
`content` takes exactly one argument. A span's text prop may be the
empty string, so `content("")` is a node where `folder("")` is a
refusal. A runtime writes the text with no terminator, taking it from
`arg`, then `src`, then a string child, and writing nothing where it has
none of the three. `indent` is a count of spaces or a literal prefix.

### `line`

`line` is `content` with a newline appended, and takes the same seven
props from the same alias, so the two cannot drift apart. The name is
also a `listitems` prop, which is a different thing spelled the same
way. Everything else in [`content`](#content) applies unchanged.

### `fragment`

Props `from`, `indent`, `replace`, and `eject`. Admits `slot`,
`content`, `line`, and `listitems`, plus a bare string. A runtime reads
the file at `from`, resolved against the *output* folder, and writes it
with its `<[SLOT]>` and `<[SLOT:name]>` markers filled by the slots
beneath. `eject` names a start and end marker pair, and only the region
between them is read. The source file must exist, and a missing one is a
write-time refusal. `fragment` is one of the two components whose props
the runtime itself validates against a closed set, so a prop the schema
above admits and the runtime does not is refused by name at render time.

### `slot`

Prop `name`, required and non-empty. Admits `content`, `line`,
`fragment`, and `listitems`, plus a bare string. A runtime fills the
`<[SLOT:name]>` marker of the enclosing `fragment`; the unnamed
`<[SLOT]>` marker is a nameless slot, which `slot()` cannot build.

### `inject`

Props `name`, `markers`, and `exclude`. Admits `content`, `line`, and
`listitems`, plus a bare string. A runtime rewrites the region between a
marker pair in a file that already exists and never creates one; the
default pair is `#--START--#` followed by a newline, and a newline
followed by `#--END--#`. A `markers` pair with exactly one empty member
is refused; both empty reads as unset. A missing target file is a
write-time refusal.

### `copyfiles`

Props `from`, `to`, `replace`, and `exclude`. A leaf. A runtime copies
the file or directory at `from` to `to` below the enclosing folder, and
`from` resolves against the process working directory rather than
against the output folder. `replace` substitutes in copied text, and a
binary file is copied through unchanged. Like `fragment`, its props are
validated by the runtime against a closed set.

### `listitems`

The one component with no text prop, so it takes no bare string spec
(`cmp-listitems-takes-no-string`), and the one with a bag: `item` must
be present and must be a list, whatever else it holds
(`cmp-listitems-needs-item`, `cmp-listitems-item-is-a-list`). Props
`item`, `line`, and `indent`, where `line` is a prop and not the
component of that name. Admits `content`, `line`, and `fragment`, plus a
bare string. A runtime walks its children once per element of `item` and
writes a blank line after the last one unless `line: false`.

## What `aontu render` writes

`render` hands the tree to
[jostraca](https://github.com/jostraca/jostraca), which writes the
bytes. Per node, on disk:

| node | effect |
|---|---|
| `Project` | Joins `folder` under the run's output folder. `name` writes nothing. |
| `Folder` | One or more path segments below the enclosing folder. |
| `File` | One output file at `name` below the enclosing folder, with `mode` and `exclude` applied. |
| `Content` | A span of text, with no terminator. |
| `Line` | The same span, with a newline after it. |
| `Fragment` | The file at `from`, read from the output folder, with its slot markers filled. |
| `Slot` | One marker of the enclosing `Fragment`. |
| `Inject` | The region between a marker pair, in a file that already exists. |
| `CopyFiles` | A copy of `from`, at `to` below the enclosing folder. |
| `ListItems` | Its children once per element of `item`. |

Where the files land is decided by the tree root and by whether
`<path>` already exists:

1. A single generator whose root is a `File`, with `<path>` not an
   existing directory: the file is written at `<path>` itself, and the
   tree's `name` prop is replaced by the base name of `<path>`.
2. The same tree with `<path>` an existing directory: the file keeps its
   own `name`, below that directory.
3. Any other root, a `Project`, a `Folder`, or a list, is written below
   `<path>` with the paths the tree spells.
4. A `Project`'s own `folder` is joined under `<path>` as a further
   segment, so `project("pkg", …)` against `build2` writes
   `build2/pkg/…`. Its `name` adds nothing to the path.
5. A folder argument is a set of generators, and in a set rule 1 does
   not apply: every tree goes below `<path>`.

**Text reaches the file verbatim.** `render` sets `raw` on every
`Content` and `Line` node, so the substitution the runtime would
otherwise apply to a span does not run, and a `$$…$$` sequence in a
shell script, a doc comment, or a regex is written as it stands. Two
props in the span set follow from that: `extra` and `replace` are inert
unless the node writes `raw: false` itself. `indent` is placement
rather than substitution and applies either way.

**The write is not atomic.** The runtime writes as it walks, so a
refusal part way through leaves the files written before it on disk. Two
generators in one set claiming a single output path are refused that
way, at exit 2, with the first file already written.

`--check` writes nothing. It runs the generator against an in-memory
filesystem and compares, reporting one `kind: path` line per difference
and exiting 1. There are three kinds: `missing`, where the generated
path is not there; `content`, where the bytes differ; and `mode`, where
the bytes match and the permission bits do not, and only where the tree
declared a `mode`. Paths are relative to `<path>`. The comparison covers
the files the generator emits and not the directory, so a file that
stops being generated is not reported, and a file carrying
`exclude: true` is held to the bytes the generator would have written
even though `render` leaves it alone.

Write a `gen.aon` that answers a project of one file:

<!-- test: scenario generation-render -->
<!-- test: file gen.aon -->
```aon
out: project(".", [folder("src", [file("main.js", ["const x = 1" ""])])])
```

Render it, then check it:

<!-- test: run -->
```sh
$ aontu render gen.aon build
$ aontu render --check gen.aon build
```

Nothing is printed either time. Now edit the generated
`build/src/main.js` by hand:

<!-- test: file build/src/main.js -->
```text
const x = 2
```

and check again:

<!-- test: run -->
```sh
$ aontu render --check gen.aon build
content: src/main.js
$ echo $?
1
```

The reported path is `src/main.js`, relative to `build`, which is the
path the generator names rather than the one the command was given.

Exit codes, with the flag list in
[`aontu render`](reference-api.md#aontu-render):

| refusal | exit |
|---|---|
| an unknown option, a bad `--format`, or the wrong number of positional arguments | 2 |
| a generator file that cannot be read, or a folder holding no regular file | 2 |
| a file that is neither `.aon` nor `.aontu` and carries no marker line | 2 |
| a write-time refusal: two files claiming one path, a `..` segment in a `File` name, a missing `inject` or `fragment` source | 2 |
| `--check` drift | 1 |
| the document does not stand up, or `--at` names nothing | 4 |
| the tree root is a `File` with no `name` | 4 |
| the tree is refused before any write: an absolute or climbing `Project` folder, or a `props` that is not a map | 4 |

The split between the last two exit codes is where the guard sits. A
climbing `Project` folder is refused while the tree is still data, at
exit 4; a climbing `File` name is refused by the write, at exit 2. The
nameless-`File` guard reads the tree root alone, so a hand-written
nameless `File` nested inside a `Project` renders and writes a file
called `undefined`; `file()` requires a name, so no generator written in
aontu can reach it.

## What `aontu trace` reports

`trace` reports one row per piece an
[`emit`](reference-language.md#transforming-emit) rule stamped,
attributed to the file it reached. The text form is four tab-separated
columns, in this order:

1. `file`, the `name` prop of the innermost enclosing `File` node.
2. `at`, the address of the stamped piece in the document.
3. `node`, the address of the model node the dispatch matched.
4. `rule`, the rule table's address, `#`, and the template's index.

`--format json` answers one object under a `trace` key, whose entries
carry the same four fields keyed `at`, `file`, `node`, and `rule`. Both
ports print the four in those two orders.

Write a `gen.aon` whose fields come from a rule set:

<!-- test: scenario generation-trace -->
<!-- test: file gen.aon -->
```aon
fields: [n:"id" n:"name"]

%field = emit(_, { match:n:string body: [line("  " + .n + ": string")] })

out: file("t.ts", ["type T = {" emit($.fields, %field) "}"])
```

Ask what wrote each line:

<!-- test: run -->
```sh
$ aontu trace gen.aon
t.ts	$.children.1	$.fields.0	$.%field#0
t.ts	$.children.2	$.fields.1	$.%field#0
$ aontu trace --format json gen.aon
{"trace":[{"at":"$.children.1","file":"t.ts","node":"$.fields.0","rule":"$.%field#0"},{"at":"$.children.2","file":"t.ts","node":"$.fields.1","rule":"$.%field#0"}]}
```

`$.children.0` and `$.children.3` are the two hand-written braces, and
they have no row. Four rules decide what else has none:

- A piece no rule stamped, which covers every hand-written child
  (`trace-no-rule-no-entry`).
- A piece under no `File` node at all, and a piece under a `File`-shaped
  map whose `props` is not a map, which names no file.
- The descendants of a stamped piece. Only the top level of a spliced
  result is stamped, so a rule whose body is
  `[file(.n + ".txt", [line(.n)])]` puts a row on the `File` node and
  none on the `Line` inside it.
- Anything outside the anchor, which is `$.out` unless `--at` names
  another path.

Two addresses need reading care. The `file` column is the innermost
enclosing `File`, by longest matching address prefix rather than by
first match, and a `File` node that a rule stamped itself gets a row
naming itself. The `rule` column addresses a table read through a
`%name` by that name, as `$.%field#0`; a table written inline at the
call has no address of its own and is `#0`, `#1`, and so on, so an
address before the hash is what tells the two apart
(`test/spec/trace.tsv`).

`trace` reads a `<file>` whose name does not end in `.aon` as a
generator in the target's own syntax, desugared by its marker. That
includes a `.aontu` file, which [`aontu render`](reference-api.md#aontu-render)
and [`aontu fmt`](reference-api.md#aontu-fmt) both read as plain aontu;
traced, it has no `$.out` and answers `no_path` at exit 4. Exit codes
are `0` for a report, empty or not, `2` for usage or I/O, and `4` where
the document does not stand up or `--at` names nothing.

## Order and determinism

`children` is a list and keeps document order. A nested list is spliced
flat, in place, recursively, and each spliced child is checked against
the same parent's admitted children, so a nested list cannot smuggle an
inadmissible child through (`cmp-splice-refuses-inside`).

A node's own three keys print in code-point order, `children`, `cmp`,
then `props`, and a props map prints its keys sorted the same way,
whatever order they were written in. Every transcript above shows it.
List elements print in index order.

What a rule visits, and in what order, is the member order of its
selection: index order for a list, sorted-key order for a map, which
[Generating children: `pack` and
`each`](reference-language.md#generating-children-pack-and-each) states
for `pack` and `each` and which `emit` shares. The sort is by code
point, so `Mango` precedes `apple`.

`pack` answers a map, and no component accepts a map as `children`, so a
`pack` result reaches a `file` as `Cannot children`. `each` and `emit`
answer lists and feed `children` directly. [Generate code from a
model](how-to/generate-code.md) makes the practical point about which to
reach for.

Where rules nest, the innermost owns its pieces. A nested `emit`
flattens its result into the parent's piece list in place, and the
stamp is applied only where a piece carries none, so an outer rule never
overwrites an inner rule's attribution. The stamps themselves are opt
in: they are built only for a run that asks for them, which `trace`
does and ordinary evaluation does not, so no stamp appears in the tree
`generate` or `model get` answers.

Both implementations promise the same tree and the same report. Every
tree row and every refusal row of
[`test/spec/cmp.tsv`](../test/spec/cmp.tsv) runs in `ts/test/spec.test.ts`
and `go/spec_test.go`, as does every row of
[`test/spec/trace.tsv`](../test/spec/trace.tsv), and the Go component
table mirrors the TypeScript one entry for entry. What `render` writes
is one step further out: the two ports call two separate builds of the
generator runtime, and it is the goldens in
[`use-cases/15-code-generation/`](../use-cases/15-code-generation/), held
by `render --check`, that hold the bytes to each other.

## Related

- [Language reference, Generation](reference-language.md#generation).
  What `generate` requires of a model, and the per-function index entry
  for each of the ten components.
- [`aontu render`](reference-api.md#aontu-render). The flags, the
  synopsis, and the seven groups `--format json` sorts written files
  into.
- [`aontu trace`](reference-api.md#aontu-trace). The verb's own
  reference entry.
- [Generate code from a model](how-to/generate-code.md). The worked
  recipe: a rule set over the records, a tree of files and lines, and
  the bytes held against goldens.
- [`use-cases/15-code-generation/`](../use-cases/15-code-generation/).
  Three targets from one model, with the checks that keep both ports
  agreeing.
- [Trust and determinism](trust.md#clause-4-sandboxing). What the
  runtime is allowed to touch while it writes.

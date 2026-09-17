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
that page's [Functions](reference-language.md#functions) index, and the
arity and argument modes of every name are in [The call
surface](reference-functions.md#the-call-surface).

The option lists and synopses for the verbs belong to the API
reference, under [`aontu render`](reference-api.md#aontu-render) and
[`aontu trace`](reference-api.md#aontu-trace), and the error codes
named below to [The codes](reference-errors.md#the-codes). Behaviour
stated here is pinned by [`test/spec/cmp.tsv`](../test/spec/cmp.tsv) and
[`test/spec/trace.tsv`](../test/spec/trace.tsv), which both
implementations run.

## Contents

- [The component tree](#the-component-tree)
- [The components](#the-components)
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

**A bare string child is a `line`**, terminator included, which is what
a template body line desugars to; an explicit `content()` is still a
span with no terminator (`cmp-bare-string-child`,
`cmp-bare-string-spliced`). The conversion happens only where `line` is
an admitted child, so `file`, `fragment`, `slot`, `inject`, and
`listitems` take a bare string and `folder` and `project` refuse one
(`cmp-bare-string-needs-line`, `cmp-bare-string-not-in-project`). The
children argument is flattened in place, recursively
(`cmp-children-splice`), under the rule [Transforming:
`emit`](reference-language.md#transforming-emit) states for a body.

A node is an ordinary map addressed by path, printing its keys in the
[order every value prints in](#order-and-determinism). Write a
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

[Generate code from a model](how-to/generate-code.md) reads a whole
tree with the same verb.

**The prop schema is enforced by the component function, not by the
tree.** A hand-written map carrying a `cmp` key that names a component
is admitted as a child, and its props are never checked against the
schema below: an undeclared prop reaches the runtime, where eight of
the ten components drop it in silence. A prop a component does not
declare is refused at the call.

## The components

Ten functions build nodes. A leaf handed a children list is a
`func_arity` error ([Class `parse`](reference-errors.md#class-parse))
rather than a bad argument (`cmp-leaf-takes-no-children`). The
shorthand column names the prop a bare string spec sets.

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

Every bad call answers the same error code, `invalid-arg` ([Class
`conflict`](reference-errors.md#class-conflict)). The message's attempt
word is the offending name rather than a fixed verb, and it is one of
five:

- the prop that is not declared;
- the text prop's own name, where that prop is required and missing, or
  is present and is not a non-empty string, so `project({folder: 1})`
  and `project({folder: ""})` both answer `Cannot folder`;
- `item`, where a `listitems` bag is absent or is not a list, so
  `listitems({})` and `listitems({item: "a"})` both answer
  `Cannot item`;
- `children`, for a child the component does not admit;
- `spec`, where the argument is not a form the component's spec takes,
  which covers the string `listitems("a")`.

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

What each component adds to the table:

- **`project`**: the one component whose text prop is optional, so
  `project()` answers a node with empty props. A `folder` written as
  anything but a non-empty string is refused by that name
  (`cmp-project-folder-kind`, `cmp-project-folder-not-empty`).
- **`folder`**: `name` is required and non-empty
  (`cmp-folder-needs-a-name`, `cmp-folder-name-not-empty`).
- **`file`**: `name` is required and may hold `/`, and the folders on
  the way are made. `exclude: true` leaves the file alone when it is
  already there, and is the only form each runtime honours: a path or a
  list of paths is matched against the COMPONENT path rather than the
  output path, and the Go runtime skips nothing for either. `mode` is
  the permission bits
  as a number: `mode: 493` and `mode: 0o755` are the same value, both
  spellings being [numeric
  literals](reference-language.md#lexical-structure), and
  `test/spec/cmp.tsv` writes `mode: 420` for `0o644`.
- **`content`**: the text prop may be the empty string, so `content("")`
  is a node where `folder("")` is a refusal. The text is taken from
  `arg`, then `src`, then a string child, and a node holding none of the
  three writes nothing. `indent` is a count of spaces or a literal
  prefix.
- **`line`**: the same seven props as `content`, from the same alias.
  The name is also a `listitems` prop, which is a different thing
  spelled the same way.
- **`fragment`**: `from` resolves against the output folder. `eject`
  names a start and end marker pair, and only the region between them is
  read. The source file must exist. `fragment` and `copyfiles` are the
  two components whose props the runtime validates against a closed set,
  so an undeclared prop on a hand-written `Fragment` or `CopyFiles` node
  is refused by name at render time rather than dropped, and `eject` is
  refused unless it is a list of two markers: `eject: true` builds a
  node (`cmp-props-fragment-all`) and does not render.
- **`slot`**: `name` is required and non-empty, and fills the
  `<[SLOT:name]>` marker of the enclosing `fragment`. The unnamed
  `<[SLOT]>` marker takes that fragment's non-`slot` children instead,
  so a bare string, `content`, `line`, or `listitems` written directly
  under a `fragment` lands there; a `fragment` carrying such children
  whose source has no unnamed marker is a refusal at exit 2.
- **`inject`**: the default marker pair is `#--START--#` followed by a
  newline, and a newline followed by `#--END--#`. A `markers` pair with
  exactly one empty member is refused at render, and both empty reads as
  unset. `inject` rewrites a file that already exists and never creates
  one, so a missing target is a refusal at exit 2.
- **`copyfiles`**: `from` resolves against the process working directory.
  `replace` substitutes in copied text, and a binary file is copied
  through unchanged. This `replace`, here and in the span set, is a
  substitution the runtime applies, and not [`emit`'s `replace`
  key](reference-language.md#replacing-text-in-a-body-replace-and-esc).
- **`listitems`**: the one component with no text prop, so it takes no
  bare string spec (`cmp-listitems-takes-no-string`), and the one with a
  bag: `item` must be present and must be a list, whatever else it holds
  (`cmp-listitems-needs-item`, `cmp-listitems-item-is-a-list`). `line`
  here is a prop and not the component of that name.

## What `aontu render` writes

Per node, on disk:

| node | effect |
|---|---|
| `Project` | Joins `folder` under the run's output folder. `name` writes nothing. |
| `Folder` | One or more path segments below the enclosing folder, so `folder("a/b")` is two of them. |
| `File` | One output file at `name` below the enclosing folder, with `mode` and `exclude` applied. |
| `Content` | A span of text, with no terminator. |
| `Line` | The same span, with a newline after it. |
| `Fragment` | The file at `from`, resolved against the output folder, with its markers filled by the slots beneath. |
| `Slot` | One marker of the enclosing `Fragment`. |
| `Inject` | The region between a marker pair, in a file that already exists. |
| `CopyFiles` | A copy of `from`, resolved against the process working directory, at `to` below the enclosing folder. |
| `ListItems` | Its children once per element of `item`, then a blank line unless `line: false`. |

Where a root lands is stated under [`aontu
render`](reference-api.md#aontu-render). One segment of the path is the
tree's own: a `Project`'s `folder` is joined under `<path>` as a further
segment, so `project("pkg", [file("a.txt")])` against `build2` writes
`build2/pkg/a.txt`, and the project's `name` adds nothing to the path.

**Text reaches the file verbatim.** `render` sets `raw` on every
`Content` and `Line` node, so the substitution the runtime would
otherwise apply to a span does not run, and a `$$…$$` sequence in a shell
script, a doc comment, or a regex is written as it stands. Two props in
the span set follow from that: `extra` and `replace` are inert unless
the node writes `raw: false` itself. `indent` is placement rather than
substitution and applies either way.

**The write is not atomic.** The runtime writes as it walks, so a
refusal part way through leaves the files written before it on disk. Two
generators in one set claiming a single output path are refused that
way, at exit 2, with the first file already written.

`--check` writes nothing, and its flag entry is under [`aontu
render`](reference-api.md#aontu-render). What it holds is the tree's own
surface: the files the generator emits and not the directory, so a file
that stops being generated is not reported. It answers the question
`render` answers, so it reports no difference for a file `render`
leaves alone: a `file` carrying `exclude: true` is reported neither for
its bytes nor for its mode. The one difference it still reports for
such a file is `missing`, because `exclude` is consulted only when the
target is already there, and `render` writes an absent one. A reported
path is the one the generator names, relative to `<path>`, rather than
the path the command was given.

Write a `gen.aon` answering a project of one file:

<!-- test: scenario generation-render -->
<!-- test: file gen.aon -->
```aon
out: project(".", [folder("src", [file("main.js", ["const x = 1" ""])])])
```

and a `build/src/main.js` holding different bytes:

<!-- test: file build/src/main.js -->
```text
const x = 2
```

<!-- test: run -->
```sh
$ aontu render --check gen.aon build
content: src/main.js
$ echo $?
1
```

The same edit under `exclude: true` is not a difference, because
`render` does not make it. Write a generator that excludes its one
file, as `gen.aon`:

<!-- test: scenario generation-render-exclude -->
<!-- test: file gen.aon -->
```aon
out: project(".", [file({ name:"keep.txt" exclude:true }, ["generated"])])
```

and a hand-written `build/keep.txt`:

<!-- test: file build/keep.txt -->
```text
hand written
```

`render` leaves those bytes where they are, and the check then
reports nothing:

<!-- test: run -->
```sh
$ aontu render gen.aon build
$ aontu render --check gen.aon build
$ echo $?
0
```

Exit codes for the verb are listed under [`aontu
render`](reference-api.md#aontu-render), and the five values the engine
uses under [Exit codes](reference-errors.md#exit-codes). Two of them are
decided by the tree rather than by the command:

| refusal | exit |
|---|---|
| the tree root is a `File` with no `name` | 4 |
| the tree is refused before any write: an absolute or climbing `Project` folder, or a `props` that is not a map | 4 |

A climbing `Project` folder is refused while the tree is still data, at
exit 4; a climbing `File` or `Folder` name is refused by the write, at
exit 2. The nameless-`File` guard reads the tree root alone, so a
hand-written nameless `File` nested inside a `Project` renders and
writes a file called `undefined`.

## What `aontu trace` reports

`trace` reports one row per piece an
[`emit`](reference-language.md#transforming-emit) rule stamped,
attributed to the file it reached. The text form is four tab-separated
columns, in this order:

1. `file`, the `name` prop of the innermost enclosing `File` node.
2. `at`, the address of the stamped piece in the document.
3. `node`, the address of the model node the dispatch matched, and the
   empty string where the selection was written inline at the call and
   so has no address (`test/spec/trace.tsv`).
4. `rule`, the rule table's address, `#`, and the template's index,
   addressed as [`aontu trace`](reference-api.md#aontu-trace) states.

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

Four rules decide what has no row:

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

The `file` column is the innermost enclosing `File`, by longest matching
address prefix rather than by first match, and a `File` node that a rule
stamped itself gets a row naming itself.

`trace` reads a `<file>` whose name does not end in `.aon` as a
generator in the target's own syntax, desugared by its marker. That
includes a `.aontu` file, which [`aontu render`](reference-api.md#aontu-render)
and [`aontu fmt`](reference-api.md#aontu-fmt) both read as plain aontu;
traced, it has no `$.out` and answers `no_path` ([Class
`reference`](reference-errors.md#class-reference)) at exit 4. Exit codes
are `0` for a report, empty or not, `2` for usage or I/O, and `4` where
the document does not stand up or `--at` names nothing.

## Order and determinism

`children` is a list and keeps document order. Each spliced child is
checked against the same parent's admitted children
(`cmp-splice-refuses-inside`).

A node's own three keys print in code-point order, `children`, `cmp`,
then `props`, and a props map prints its keys sorted the same way,
whatever order they were written in: `cmp-map-spec` writes
`file({name: "a.ts", mode: 420})` and pins the printed props as `mode`
then `name`. List elements print in index order.

`emit` visits its selection in the [order every bag
reader uses](reference-language.md#generating-children-pack-and-each).

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

Both implementations promise the same tree and the same report, under
[Behavioural parity](reference-api.md#behavioural-parity), and the Go
component table mirrors the TypeScript one entry for entry. What
`render` writes is one step further out: the two ports call two separate
builds of the generator runtime, and it is the goldens in
[`use-cases/15-code-generation/`](../use-cases/15-code-generation/), held
by `render --check`, that hold the bytes to each other.

## Related

- [Language reference, Generation](reference-language.md#generation).
  What `generate` requires of a model, and the per-function index entry
  for each of the ten components.
- [The call surface](reference-functions.md#the-call-surface). The
  arity, argument modes, and result word of every declared name.
- [The codes](reference-errors.md#the-codes). `invalid-arg`,
  `func_arity`, and `no_path` by class, with the exit code each run ends
  on.
- [`aontu render`](reference-api.md#aontu-render). The flags, the
  synopsis, where a root lands, and the seven groups `--format json`
  sorts written files into.
- [Generate code from a model](how-to/generate-code.md). The worked
  recipe: a rule set over the records, a tree of files and lines, and
  the bytes held against goldens.
- [Trust and determinism](trust.md#clause-4-sandboxing). Why nothing in
  the engine writes a file, and which tree-shape refusals stand before
  `render` hands the tree on.

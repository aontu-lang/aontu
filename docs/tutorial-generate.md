# Tutorial: from a model to a file tree

A client library for an HTTP API says the same thing three times: once
in a route table, once in a function per route, once in the types. Two
of those are derivable from the first, and a model that already holds
the route table already holds the file.

This tutorial computes a small TypeScript client from a model of its
routes. The result is a **component tree**: an ordinary aontu value
whose nodes are a project, a folder, files, and lines. The tree is
checkable on its own, and [§6](#6-write-the-files) writes it to disk
with `aontu render`.

Commands are written as `aontu`; from a clone, `node ts/bin/aontu.js`
stands in. Every result on this page is the engine's own.

## 1. The model

Two routes are enough to show the shape. Save this as `api.aon`:

<!-- test: scenario generate-client -->
<!-- test: file api.aon -->
```aontu
routes: [
  { name:"list" verb:GET path:"/orders" }
  { name:"create" verb:POST path:"/orders" }
]
```

<!-- test: run -->
```sh
$ aontu api.aon
{
  "routes": [
    {
      "name": "list",
      "path": "/orders",
      "verb": "GET"
    },
    {
      "name": "create",
      "path": "/orders",
      "verb": "POST"
    }
  ]
}
```

Plain data, and deliberately so. A model worth generating from is one
the rest of the project can also validate, query and diff, which is
what the [first tutorial](tutorial-config.md) built.

## 2. A file is a value

`file(name, children)` names a file and holds its lines. Write
`client.aon`, which loads the model and describes one file:

<!-- test: file client.aon -->
```aontu
@"./api.aon"

out: file("client.ts", ["export const timeout = 5000"])
```

`@"./api.aon"` loads a source file and unifies it in place, so
`$.routes` is in scope here. The file itself is at `$.out`, and the
verb that reads a value is `get`:

<!-- test: run -->
```sh
$ aontu model get '$.out' client.aon
{
  "children": [
    {
      "children": [],
      "cmp": "Line",
      "props": {
        "src": "export const timeout = 5000"
      }
    }
  ],
  "cmp": "File",
  "props": {
    "name": "client.ts"
  }
}
```

Three keys make up every node of the tree. `cmp` is what kind of node
it is, `props` carries what that kind needs, and `children` holds what
sits inside it. The bare string became a `Line`, which is the node
that writes its own newline, so nothing in the source spells one.

## 3. One line per record

A generator is a **rule set**. `emit(selection, table)` visits every
node of a selection, takes the first template whose `match` the node
unifies with, and instantiates that template's `body` against the node,
where `.name` is that node's `name`. A list is visited in its own
order, which is why the route table is a list: a map is visited in
code-point order of its keys, whatever order it was written in. Rewrite
`client.aon`:

<!-- test: file client.aon -->
```aontu
@"./api.aon"

%route = emit(_, {
  match: verb: GET
  body: [`export const ` + .name + ` = () => get("` + .path + `")`]
})

out: file("client.ts", emit($.routes, %route))
```

Two things about the spelling. A backtick string may hold a literal
newline and a `"` without escaping it, which is what makes it the way
to carry another language's text. And `%route` is a named table,
declared once and called by name, so a document can hold several
generators without nesting them.

Run it:

<!-- test: run -->
```sh
$ aontu model get '$.out' client.aon
...
No template matched a node, and there is no catch-all. `emit`
tries each template in the order written and takes the first the
node unifies with; the node {"name":"create","path":"/orders","verb":"POST"} unified with none of {"verb":"GET"}.
...
$ echo $?
4
```

The refusal is the lesson. `create` is a `POST`, the only template
matches `GET`, and a generator that silently dropped the route would
have produced a client missing a function. The node it could not place
and the matches it tried are both in the message.

## 4. A second template, and the dispatch

Give `POST` a template of its own. A table may be a list of them, tried
in the order written. Rewrite `client.aon`:

<!-- test: file client.aon -->
```aontu
@"./api.aon"

%route = emit(_, [
  {
    match: verb: GET
    body: [`export const ` + .name + ` = () => get("` + .path + `")`]
  }
  {
    match: verb: POST
    body: [`export const ` + .name + ` = (b) => post("` + .path + `", b)`]
  }
])

out: file("client.ts", emit($.routes, %route))
```

<!-- test: run -->
```sh
$ aontu model get '$.out' client.aon
{
  "children": [
    {
      "children": [],
      "cmp": "Line",
      "props": {
        "src": "export const list = () => get(\"/orders\")"
      }
    },
    {
      "children": [],
      "cmp": "Line",
      "props": {
        "src": "export const create = (b) => post(\"/orders\", b)"
      }
    }
  ],
  "cmp": "File",
  "props": {
    "name": "client.ts"
  }
}
```

Two lines, in the model's order, each taking the body its `verb`
selected. The one to ask about later is which rule wrote which line,
and `aontu trace` answers it, one row per piece:

<!-- test: run -->
```sh
$ aontu trace client.aon
client.ts	$.children.0	$.routes.0	$.%route#0
client.ts	$.children.1	$.routes.1	$.%route#1
```

The file it reached, the node in the tree, the model record that
matched, and the rule: `%route#0` is the `GET` template and `#1` the
`POST` one. A line nobody generated has no row, which is worth
remembering when a report looks short.

## 5. A folder, and a project

A client is more than one file, and files live in directories.
`folder(name, children)` is a directory, `project(dir, children)` is
the root and names the output directory, and both hold children the
same way a file holds lines. Rewrite `client.aon` a last time:

<!-- test: file client.aon -->
```aontu
@"./api.aon"

%route = emit(_, [
  {
    match: verb: GET
    body: [`export const ` + .name + ` = () => get("` + .path + `")`]
  }
  {
    match: verb: POST
    body: [`export const ` + .name + ` = (b) => post("` + .path + `", b)`]
  }
])

out: project("build", [
  folder("src", [
    file("client.ts", [
      `import { get, post } from "./http"`
      emit($.routes, %route)
    ])
    file("index.ts", each(pick($.routes, name), `export { ` + _ + ` } from "./client"`))
  ])
])
```

Two new shapes in there. The `import` line is a plain string beside an
`emit` call, and the call **splices**: its pieces join the list rather
than nesting inside it, so a body can mix written lines with generated
ones. And `index.ts` uses a different generator: `pick` projects one
field out of every record, and `each` makes one element per member, so
the re-exports come out in the model's order. `pack` would key them by
data and sort the keys, which is right for a map and wrong for a file.

<!-- test: run -->
```sh
$ aontu model get '$.out' client.aon
{
  "children": [
    {
      "children": [
        {
          "children": [
            {
              "children": [],
              "cmp": "Line",
              "props": {
                "src": "import { get, post } from \"./http\""
              }
            },
            {
              "children": [],
              "cmp": "Line",
              "props": {
                "src": "export const list = () => get(\"/orders\")"
              }
            },
            {
              "children": [],
              "cmp": "Line",
              "props": {
                "src": "export const create = (b) => post(\"/orders\", b)"
              }
            }
          ],
          "cmp": "File",
          "props": {
            "name": "client.ts"
          }
        },
        {
          "children": [
            {
              "children": [],
              "cmp": "Line",
              "props": {
                "src": "export { list } from \"./client\""
              }
            },
            {
              "children": [],
              "cmp": "Line",
              "props": {
                "src": "export { create } from \"./client\""
              }
            }
          ],
          "cmp": "File",
          "props": {
            "name": "index.ts"
          }
        }
      ],
      "cmp": "Folder",
      "props": {
        "name": "src"
      }
    }
  ],
  "cmp": "Project",
  "props": {
    "folder": "build"
  }
}
```

A `Project` whose `folder` is `build`, holding a `Folder` named `src`,
holding two `File` nodes, each holding its lines. Nothing in that tree
is a template waiting to be filled or a string waiting to be split: it
says which files exist, in which directories, with which lines, in
which order.

And because it is an ordinary value, `get` reads any node of it. Read
one leaf:

<!-- test: run -->
```sh
$ aontu model get '$.out.children.0.children.1.props.name' client.aon
"index.ts"
```

`aontu vet` can check the tree against a schema, and the rule behind
one generated line is what
[§4](#4-a-second-template-and-the-dispatch)'s `aontu trace` names.

## 6. Write the files

`aontu render` writes the tree. It hands it to a **generator runtime**,
[jostraca](https://github.com/jostraca/jostraca), which both
implementations depend on; each node's `cmp` is the component name that
runtime looks up, which is what those keys in the JSON above are for.
The path argument is the root the tree is written under, and the
`Project`'s own `folder` names the directory inside it:

<!-- test: run -->
```sh
$ aontu render --at '$.out' client.aon .
```

It prints nothing, and `build/src/client.ts` and `build/src/index.ts`
are on disk. `--check` writes nothing and compares instead:

<!-- test: run -->
```sh
$ aontu render --check --at '$.out' client.aon .
$ echo $?
0
```

Hand-edit `build/src/client.ts`:

<!-- test: file build/src/client.ts -->
```ts
export const oops = 1
```

and the check names the file and refuses:

<!-- test: run -->
```sh
$ aontu render --check --at '$.out' client.aon .
content: build/src/client.ts
$ echo $?
1
```

That is the form for CI: commit the generated files beside the model,
and an edit to one of them is a red build rather than a quiet
divergence from the model that produced it. The tree is still a value
either way, which is why [§5](#5-a-folder-and-a-project) could read a
leaf of it with `aontu model get` before anything was written.

The rest is a pipe, and it is a recipe rather than a lesson:
[generate code from a model](how-to/generate-code.md) has the command
that hands `aontu model get` output to a runtime, the `--folder` form
that compares instead of writing (a generated file edited by hand is
then a red build), and the way to write the generator in the target's
own syntax so that `gofmt` and an editor can read it.

## Where to go next

You have a model that computes its own source files, and the questions
that follow are what else the model should hold:

- The recipes: [generate code from a
  model](how-to/generate-code.md) end to end with goldens,
  [seal generated children deeply](how-to/seal-generated-children.md)
  when a generated shape must stay closed, and [keep schema out of the
  output](how-to/keep-schema-out-of-output.md) for the helper fields a
  generator needs and a file does not.
- The rules in full:
  [transforming with `emit`](reference-generation.md#transforming-emit)
  for dispatch order, splicing and recursion,
  [`each`](reference-generation.md#each-the-order-preserving-map) and its
  `_ & …` idiom, and
  [the component tree](reference-generation.md#the-component-tree) for
  the ten component functions and what each node means for the output.
  [`aontu trace`](reference-api.md#aontu-trace) is specified with the
  other verbs.
- The live version: three targets in one document, committed goldens,
  and a check that both implementations answer byte-identical files, in
  [use-cases/15-code-generation](../use-cases/15-code-generation/).
- The other tutorials: [share a model as a
  package](tutorial-package.md) gives the model a version and a hash so
  another project can import it, and the
  [tutorials index](tutorial.md) lists all four.

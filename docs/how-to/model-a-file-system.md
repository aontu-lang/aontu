---
description: Model folders and files as one table of nodes, with a base type, two subtypes of it, and a parent relation whose target must be a folder.
group: schemas
order: 55
---

# Model a file system

A file system is a tree of two kinds of node. A folder holds other
nodes and a file holds bytes, and both carry a name and a parent. The
model is a base type for what they share, two subtypes of it, and one
relation: a node's parent must be a folder.

## Declare the types

Write the model as `fs.aontu`:

<!-- test: scenario file-system -->
<!-- test: file fs.aontu -->
```aontu
type: type({
  Name: string & re("^[^/]+$")

  Folder: close($.type.Node & { kind:"folder" })
  File: close($.type.Node & { kind:"file" size:integer & min(0) })

  Node: open({
    name: "/"|$.type.Name
    kind: "folder"|"file"
    parent?: relate($.type.Folder) & acyclic()
  })
})

fs: nodes: {
  &: match(key(0), "root", $.type.Folder & { name:"/" }, ($.type.Folder|$.type.File) & {
    name: $.type.Name
    parent: re("^\\$\\.fs\\.nodes\\.[^.]+$")
  })
}
```

`Node` holds what a folder and a file share: `name`, `kind`, and
`parent`. `Folder` and `File` are each `Node`
[met](../unification.md) with what that kind adds. Each is a subtype
of `Node`, because a meet admits only what both of its sides admit.
`Node` is written `open()`, which is how a type says that it is meant
to be extended, as `File` extends it with `size`. Each subtype is
`close()`d, so a member that no type declares is refused.

`parent` is the relation. `relate($.type.Folder)` makes its value a
checked address and unifies the `Folder` type into what the address
names, so only a folder can be a parent. `acyclic()` adds that no node
is its own ancestor. The member is optional on `Node` because the root
has no parent.

The `&:` rule on `fs.nodes` gives every member its type by its key,
which `key(0)` reads. The member named `root` is the folder called
`/`. Any other member is a `Folder` or a `File` with a name of its
own, and its parent is now required and must be an address in this
table.

## Write a tree

The data is one statement for each node. Write it as `tree.aontu`:

<!-- test: file tree.aontu -->
```aontu
@"./fs.aontu"

fs: nodes: root: {}
fs: nodes: etc: { name:"etc" kind:"folder" parent:path($.fs.nodes.root) }
fs: nodes: hosts: {
  name: "hosts"
  kind: "file"
  size: 220
  parent: path($.fs.nodes.etc)
}
fs: nodes: motd: { name:"motd" kind:"file" size:96 parent:path($.fs.nodes.etc) }
```

Now generate it:

<!-- test: run -->
```sh
$ aontu tree.aontu
{
  "fs": {
    "nodes": {
      "etc": {
        "kind": "folder",
        "name": "etc",
        "parent": "$.fs.nodes.root"
      },
      "hosts": {
        "kind": "file",
        "name": "hosts",
        "parent": "$.fs.nodes.etc",
        "size": 220
      },
      "motd": {
        "kind": "file",
        "name": "motd",
        "parent": "$.fs.nodes.etc",
        "size": 96
      },
      "root": {
        "kind": "folder",
        "name": "/"
      }
    }
  }
}
```

`root` was written as `{}` and came out as the folder named `/`: the
rule filled it in. Each `parent` comes out as the address the author
wrote, a plain string. `relate()` checks an address and never rewrites
it.

## A file is nobody's parent

Put a node inside `hosts`, which is a file. Write it as
`inside.aontu`:

<!-- test: file inside.aontu -->
```aontu
@"./tree.aontu"

fs: nodes: bad: { name:"bad" kind:"file" size:1 parent:path($.fs.nodes.hosts) }
```

<!-- test: run -->
```sh
$ aontu inside.aontu
[aontu/scalar_value]: Cannot unify values at path $.fs.nodes.hosts.kind
...
$ echo $?
1
```

The refusal names the target, not the link. The relation unified
`Folder` into `hosts`, and `hosts` already says `file`.

## A folder is not its own ancestor

Two folders that hold each other agree field by field, so nothing
conflicts where either is written. The loop is a fact about the whole
edge set. Write it as `loop.aontu`:

<!-- test: file loop.aontu -->
```aontu
@"./tree.aontu"

fs: nodes: a: { name:"a" kind:"folder" parent:path($.fs.nodes.b) }
fs: nodes: b: { name:"b" kind:"folder" parent:path($.fs.nodes.a) }
```

<!-- test: run -->
```sh
$ aontu relations loop.aontu
verdict: fail

$.fs.nodes.a.parent  parent: cycle $.fs.nodes.a -> $.fs.nodes.b -> $.fs.nodes.a
$ echo $?
1
```

Generating the same document is refused with
`[aontu/relation_cycle]` at the same edge.

## Total a folder's files

`parent` points up the tree, and a filter reads it downwards. Write
the question as `usage.aontu`:

<!-- test: file usage.aontu -->
```aontu
@"./tree.aontu"

usage: etc: sum(
  pick(filter($.fs.nodes, { kind:"file" parent:path($.fs.nodes.etc) }), size)
)
```

<!-- test: run -->
```sh
$ aontu model get $.usage usage.aontu
{
  "etc": 316
}
```

`filter` keeps the files whose parent is `etc`, `pick` takes the
`size` of each, and `sum` adds 220 and 96.

## Write each parent as a key

A reader that keys its nodes by name wants `"parent": "etc"`, where
the document holds an address.
[`gen()`](../reference-language.md#addresses-form) says how a value is
written and changes nothing the document reads. Write the overlay as
`keys.aontu`:

<!-- test: file keys.aontu -->
```aontu
@"./tree.aontu"

fs: nodes: { &: { parent?:gen({ form:"key" }) } }
```

<!-- test: run -->
```sh
$ aontu model get $.fs.nodes.hosts keys.aontu
{
  "kind": "file",
  "name": "hosts",
  "parent": "etc",
  "size": 220
}
$ aontu relations keys.aontu
verdict: pass
```

`form: "key"` writes the last segment of each address. The relation
still reads the address itself, so the check passes as it did, and a
filter on `parent` matches the address and not the key.

## What to watch for

The two subtypes are written before `Node`, and both engines read the
model only in that order. With `Node` written first, the same tree is
refused as `[aontu/disjunct_no_gen]`. The language gives the order of
a map's members no meaning, so this is a defect, which
[#778](https://github.com/aontu-lang/aontu/issues/778) tracks.

The model does not hold a name unique within its folder. A second file
named `hosts` under `etc` generates.

The relation is specified under [Checked
links](../reference-language.md#checked-links-relatet) and [Declared
relations](../reference-language.md#declared-relations), the seals
under [Closed values](../reference-language.md#closed-values-close--open),
and the mark under [Marks](../reference-language.md#marks-type-and-hide).
For a relation with an inverse, see [Check that components agree about
their relations](check-relations.md). For a tree that nests its
nodes, where this one keeps them in one table, see [Define a recursive
schema](define-a-recursive-schema.md).

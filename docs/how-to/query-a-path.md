---
description: Print one node of the evaluated document by path, or a keys, types, or depth-limited view of it.
group: query-change
order: 10
---

# Query a path

An evaluated document is one JSON value, and most questions are about
one node of it. `aontu get` selects that node by path—the same path
a reference means by `$.a.b`—and prints it alone. Write
`system.aon`:

<!-- test: scenario query-a-path -->
<!-- test: file system.aon -->
```aontu
services: {
  &: { replicas: *1 | integer, tier: *standard | string }
  auth:    { replicas: 3 }
  billing: { tier: premium }
}
```

Now ask for one service:

<!-- test: run -->
```sh
$ aontu get $.services.auth system.aon
{
  "replicas": 3,
  "tier": "standard"
}
```

The `tier` came from the `&:` template, not from the `auth` line: you
are querying the evaluated document, not the source text. (Evaluation
is global—unification has no partial mode—so `get` buys you a
smaller answer, never a cheaper run.)

Three flags give a smaller answer rather than a smaller slice: the
keys alone, the shape with concrete leaves lifted to their kinds, and
the structure cut off at a depth:

<!-- test: run -->
```sh
$ aontu get $.services --keys system.aon
auth
billing
$ aontu get $.services.auth --types system.aon
{"replicas":integer,"tier":*string|string}
$ aontu get $ --depth 1 --canon system.aon
{"services":top}
```

Each view is itself a valid Aontu document that generalises the
truth—`top` means "no further information at this tier". `--depth` needs
`--canon` or `--types`, because JSON has no way to write `top`.

A path that names nothing exits `1` and guesses:

<!-- test: run -->
```sh
$ aontu get $.services.authz system.aon
$.services.authz: no_path [reference]
  The path $.services.authz names nothing in this document.
  note: did you mean auth?
$ echo $?
1
```

A missing key and an empty value are different answers, so this is a
refusal with a suggestion, not an empty render. In a script, branch on
the exit code: `0` rendered, `1` no such path, `4` the document does
not stand up on its own (a residual node has no JSON to print).

The flags, exit codes, and the subsumption claim behind the
projections are specified under [`aontu
get`](../reference-api.md#aontu-get). To see the whole document in
one reparseable line instead of a slice, [see the canonical
form](see-canonical-form.md); to ask who put the value there rather
than what it is, [explain the value](explain-a-value.md).

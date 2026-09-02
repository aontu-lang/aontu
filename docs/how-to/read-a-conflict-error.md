---
description: What a conflict message names, in what order, and how to tell a conflict from an unresolved path.
group: run-embed
order: 80
---

# Read a conflict error

A conflict message names both operands, and it pays to know which is
which. For two plain facts [meeting](../unification.md) at a path, the
later-in-source one is named first:

```
Cannot unify value: 2 with value: 1
```

means two facts reached the same path (`1` earlier, `2` later) and
they cannot both hold. To see everything the engine prints around
that line, write `clash.aon`:

<!-- test: scenario conflict -->
<!-- test: file clash.aon -->
```aontu
a: b: 1
a: b: 2
```

<!-- test: run -->
```sh
$ aontu clash.aon
[aontu/scalar_value]: Cannot unify values at path $.a.b
...
 Cannot unify value: 2 with value: 1
  --> clash.aon:2:7
...
 Cannot unify value: 1 with value: 2
  --> clash.aon:1:7
...
$ echo $?
1
```

Read it top to bottom. The `[aontu/scalar_value]` line carries the
error code and the path; a hint block restates the rule that was
broken; then each operand appears with an annotated source frame —
file, line, column, and the offending text with a caret under it.
Note the path: a nested conflict reports the leaf values that
clashed, so `a:b:1` against `a:b:2` is that same one-line message at
`$.a.b`, not a complaint about `a`.

Where the conflict is reached through a disjunction, a list spread or
a reference, both operands are still named but the ordering heuristic
no longer applies — the value "later in source" may have travelled.
Trust the two source frames, not the order.

An unresolved path is a different failure, with a different code:

```
[aontu/no_path]: Cannot resolve value at path $.x
```

Nothing contradicted anything; a `$.reference` names a key the
document does not have. (An undefined `$name` variable is
`[aontu/unknown_var]`, a third case — see [inject host
values](inject-host-values.md).)

The error codes, spelled as they render, are catalogued in the
language reference under [Errors](../reference-language.md#errors).
To see every contribution that met at a path (including the ones
that agreed), [explain a value](explain-a-value.md); to gather every
failure in one pass instead of reading them one throw at a time,
[collect errors](collect-errors.md).

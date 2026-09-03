---
description: Rewrite a pinned literal where the author wrote it with aontu set --in-place, and know the cases where the verb appends instead.
group: query-change
order: 40
---

# Change a pinned value

Appending cannot change a pinned value: the append makes two concrete
facts at one path, and the lattice refuses both. `--in-place` closes
the loop by rewriting the literal where the author wrote it. To see
both behaviours, write a `schema.aon` that constrains the fields:

<!-- test: scenario change-pinned -->
<!-- test: file schema.aon -->
```aontu
replicas: integer & min(1) & max(24)
port: integer
```

and a `deploy.aon` overlay that pins them, comments included:

<!-- test: file deploy.aon -->
```aontu
# the deployment
replicas: 42   # too many
port: 0x1F
```

Plain [`aontu set`](change-a-value-with-an-overlay.md) refuses,
because the overlay would then disagree with itself:

<!-- test: run -->
```sh
$ aontu set '$.replicas=5' --entry schema.aon --overlay deploy.aon
verdict: invalid

$.replicas: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.replicas
  data: deploy.aon:4:13 (5)
  data: deploy.aon:2:11 (42)
$ echo $?
1
```

Both sites are labelled `data:`—the pin and the contradiction live
in the same file, which is exactly why appending cannot help. Add
`--in-place` and the literal is rewritten instead:

<!-- test: run -->
```sh
$ aontu set '$.replicas=5' --entry schema.aon --overlay deploy.aon --in-place
verdict: valid
replaced: deploy.aon:2:11 42 -> 5
wrote: deploy.aon
$ echo $?
0
```

The file now reads:

```aon
# the deployment
replicas: 5   # too many
port: 0x1F
```

Comments and layout survive, including the one on the edited line,
because nothing is re-serialised: the span at `(row, col, len)` is
replaced and every other byte is left exactly as it was. The edit is
also verified before it is written—a site carries the source text
it claims to cover, and the text at the span must match it. That is
what makes a hex literal safe to rewrite even though its *value* is
`31`:

<!-- test: run -->
```sh
$ aontu set '$.port=80' --entry schema.aon --overlay deploy.aon --in-place
verdict: valid
replaced: deploy.aon:3:7 0x1F -> 80
wrote: deploy.aon
```

The report speaks in source text (`0x1F -> 80`), because replacing a
spelling is a different edit from replacing a value.

Where it cannot rewrite, it appends as plain `set` would and says why
in a warning. A warning never moves a verdict, so `--in-place` is
never worse than `set` without it:

| the overlay says | why not | what happens |
|---|---|---|
| `a: min(1)`, `a: 1+2`, `a: {b:1}` | the site names the opening token of a compound, not the whole value | appended, `patch_not_editable` |
| `a: 1` twice | two statements pin it; there is no single place to edit | appended, `patch_ambiguous` |
| a `&:` template, a `$ref` | the value comes from elsewhere; edit it there | appended, `patch_not_editable` |
| `a: integer`, `a: above(0)` | a constraint, not a pin—appending narrows it without discarding it | appended, `patch_not_editable` |
| anything, when the overlay itself `@"includes"` another document | a loaded literal's position cannot be told from the overlay's own | appended, `patch_not_editable` |

A default (`a: *1`) is not in the table: appending already overrides
it correctly, so `--in-place` leaves it alone and says nothing.

The last row cuts both ways, and the reverse direction is easy to get
wrong. To change a value that lives in an *included* file, name that
file as the overlay—but give `--entry` something that constrains the
value without also pulling the file in. Write a `stack.aon` entry that
loads `deploy.aon`, the natural arrangement and the wrong one here:

<!-- test: file stack.aon -->
```aontu
@"./deploy.aon"
replicas: integer & min(1) & max(24)
port: integer
```

<!-- test: run -->
```sh
$ aontu set '$.replicas=9' --entry stack.aon --overlay deploy.aon --in-place
verdict: invalid
would replace: deploy.aon:2:11 5 -> 9

$.replicas: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.replicas
  data: deploy.aon:2:11 (9)
  schema: deploy.aon:2:11 (5)
$ echo $?
1
```

The overlay's value [meets](../unification.md) *itself* through the
entry's include, so the run is refused and nothing is written. `would
replace:` (rather than `replaced:`) tells you the edit itself was
possible and the conflict lay elsewhere—here, in the shape of the
invocation. Pass `schema.aon` as the entry, as the earlier runs do, and
the same command holds. ([Why the tool refuses the shape instead of
detecting the
collision](../explanation.md#the-emit--validate--repair-loop).)

Pair `--in-place` with `--dry-run` to see the rewritten overlay
without writing it. The full editability rules are under [`aontu
set`](../reference-api.md#aontu-set); after any refusal, [`aontu
why`](explain-a-value.md) lists every line involved; and the live
version, an ops overlay repeatedly rewritten in place, is
[use-cases/08-feature-flags](../../use-cases/08-feature-flags/).

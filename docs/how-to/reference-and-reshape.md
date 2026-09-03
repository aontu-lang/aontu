---
description: Pull other parts of the document in by reference, extend them, and relocate them with `move` and `copy`.
group: compose
order: 40
---

# Reference and reshape other parts of the document

A reference pulls another node in and **unifies** with it—it adds,
it never overrides. That one sentence decides most of what follows:

```aontu
base: { region:"us-east" tier:free }
prod: $.base & { replicas:3 }
```

```json
{ "base": { "region": "us-east", "tier": "free" },
  "prod": { "region": "us-east", "replicas": 3, "tier": "free" } }
```

`prod` extends the base and the base is untouched. (Note the quotes
on `"us-east"`: a bare word stops at the `-`.) Now try to *change* a
field instead of adding one—the same base with `prod: $.base &
{ tier: paid }`, as `tier.aon`:

<!-- test: scenario reference-conflict -->
<!-- test: file tier.aon -->
```aontu
base: { region:"us-east" tier:free }
prod: $.base & { tier:paid }
```

<!-- test: run -->
```sh
$ aontu tier.aon
[aontu/scalar_value]: Cannot unify values at path $.prod.tier
...
 Cannot unify value: "paid" with value: "free"
...
$ echo $?
1
```

A conflict, not an override. To let a referrer change a field, the
base has to offer it as a [default](provide-defaults.md):

```aontu
base: { region:"us-east" tier:*free | string }
prod: $.base & { tier:paid }
```

```json
{ "base": { "region": "us-east", "tier": "free" },
  "prod": { "region": "us-east", "tier": "paid" } }
```

The addressing and reshaping vocabulary, in full:

- `$.a.b`—absolute path from the document root.
- `.a.b`—path relative to the current map.
- `key()`—the key the current value is stored under.
- `copy($.x)`—a deep copy, `type`/`hide` marks cleared.
- `move($.x)`—a reference that relocates: the source is dropped
  from the output, along with any unresolved optional keys.

The last one reshapes in the strict sense—the value leaves its old
address:

```aontu
m: { x?:number y:Y }
n: move($.m)
```

```json
{ "n": { "y": "Y" } }
```

`m` is gone from the output and the unresolved optional `x` went
with it; a plain `n: $.m` would have kept both `m` and `n`.

Path grammar and composition rules are specified in [References and
paths](../reference-language.md#references-and-paths), and the
`copy`/`move`/`key` rows in
[Functions](../reference-language.md#functions). For reference
conjunction at scale, the [feature-flag
catalog](../../use-cases/08-feature-flags/) is the live version: its
served views are built as `$.flags & $.envs.prod.flags &
$.tenants.megacorp.flags`, so every layer's write flows into the
view by reference alone.

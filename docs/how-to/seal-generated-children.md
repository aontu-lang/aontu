---
description: Close both the set of `pack`-generated children and each child's shape, or seal from the side with a hidden guard.
group: compose
order: 30
---

# Seal generated children deeply

`close` seals exactly the node it wraps — it is deliberately
shallow. Around a
[`pack`](../reference-language.md#generating-children-pack-and-each)
generator, that means `close(pack(...))` forbids adding *children*
to the generated map while each child's own keys stay open. A typo'd
override is then absorbed instead of refused:

```aontu
names: hide({ web: {}, auth: {} })

deploy: close(pack($.names, {
  replicas: *1 | integer
  tier:     *standard | string
}))

deploy: web: replicaz: 3
```

```json
{
  "deploy": {
    "auth": { "replicas": 1, "tier": "standard" },
    "web":  { "replicas": 1, "replicaz": 3, "tier": "standard" }
  }
}
```

Exit 0 — and `web` ships with the default `replicas: 1`, the
misspelled `replicaz` riding along beside it, doing nothing. The
deep-seal spelling closes the template as well, so every generated
child is sealed too:

```aontu
names: hide({ web: {}, auth: {} })

deploy: close(pack($.names, close({
  replicas: *1 | integer
  tier:     *standard | string
})))

deploy: web: replicas: 3
```

```json
{
  "deploy": {
    "auth": { "replicas": 1, "tier": "standard" },
    "web":  { "replicas": 3, "tier": "standard" }
  }
}
```

The legitimate override composes exactly as before: `web` gets its
`replicas: 3`, `auth` keeps the defaults. Now misspell it against
the same sealed shape — the same document with `deploy: web:
replicaz: 3`, as `deploy.aon`:

<!-- test: scenario deep-seal -->
<!-- test: file deploy.aon -->
```aontu
names: hide({ web: {}, auth: {} })

deploy: close(pack($.names, close({
  replicas: *1 | integer
  tier:     *standard | string
})))

deploy: web: replicaz: 3
```

<!-- test: run -->
```sh
$ aontu deploy.aon
[aontu/closed]: Cannot resolve value at path $.deploy.web.replicaz
...
$ echo $?
1
```

The child refuses, naming the key. The rule generalises: `close`
never travels, so seal each level you mean to seal — the outer
`close(...)` pins the *set* of children, the inner `close({...})`
pins each child's *shape*.

## Seal the set without closing the tree

Sometimes the generated map itself has to stay open: other statements
merge into it, or overlays you do not control land on it. A hidden guard
seals from the side — [meet](../unification.md) a clone of the tree with
a closed pack of the same table and an empty template:

```aontu
environments: hide({ dev: {}, prod: {} })

deploy: pack($.environments, { replicas: *1 | integer })

envguard: hide($.deploy & close(pack($.environments, {})))

deploy: prod: replicas: 3
```

```json
{ "deploy": { "dev": { "replicas": 1 }, "prod": { "replicas": 3 } } }
```

`envguard` evaluates on every run and emits nothing. An environment
that exists nowhere in the table now has nowhere to land — change
the last line of `guard.aon` to invent one:

<!-- test: scenario envguard -->
<!-- test: file guard.aon -->
```aontu
environments: hide({ dev: {}, prod: {} })

deploy: pack($.environments, { replicas: *1 | integer })

envguard: hide($.deploy & close(pack($.environments, {})))

deploy: prod2: replicas: 3
```

<!-- test: run -->
```sh
$ aontu guard.aon
[aontu/closed]: Cannot resolve value at path $.envguard
...
$ echo $?
1
```

The annotated site is the overlay line that invented `prod2`; the
reported path is the guard's own, which is the cost of guarding from
the side rather than in the tree.

For the shallow basics of `close` on a plain map, start at [forbid
unexpected keys](forbid-unexpected-keys.md); the semantics are
specified in [Closed values: `close` /
`open`](../reference-language.md#closed-values-close--open). Both
recipes run live: the [Kubernetes golden
path](../../use-cases/06-k8s-golden-path/) seals its service set
with `close(pack(...))` as its drift guard, and the [deployment
fleet](../../use-cases/02-deploy-config/) keeps the environment
guard as a worked example in `stack.aon`.

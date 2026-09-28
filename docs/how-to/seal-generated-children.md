---
description: Close the set of `pack`-generated children and each child's shape in one seal, hold a level open, or seal from the side with a hidden guard.
group: compose
order: 30
---

# Seal generated children

`close` is recursive: it seals the node it wraps and every map and list
beneath it. Around a
[`pack`](../reference-language.md#generating-children-pack-and-each)
generator, that means one `close(pack(...))` forbids adding *children*
to the generated map and forbids adding *keys* to each child. A typo'd
override is refused, naming the key. Write the document as
`deploy.aontu`:

<!-- test: scenario deep-seal -->
<!-- test: file deploy.aontu -->
```aontu
names: hide({ web: {} auth: {} })

deploy: close(pack($.names, { replicas: *1|integer tier: *standard|string }))

deploy: web: replicaz: 3
```

<!-- test: run -->
```sh
$ aontu deploy.aontu
[aontu/closed]: Cannot resolve value at path $.deploy.web.replicaz
...
$ echo $?
1
```

The legitimate override composes exactly as before: with `deploy: web:
replicas: 3` as the last line, `web` gets its `replicas: 3` and `auth`
keeps the defaults:

```aontu
names: hide({ web: {} auth: {} })

deploy: close(pack($.names, { replicas: *1|integer tier: *standard|string }))

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

## Hold a level open

Sometimes the children have to stay open: each one carries keys the
template cannot know. An `open()` inside the seal holds its subtree
open, and the outer `close` still pins the *set* of children:

```aontu
names: hide({ web: {} auth: {} })

deploy: close(pack($.names, open({ replicas: *1|integer })))

deploy: web: tier: frontend
```

```json
{
  "deploy": {
    "auth": { "replicas": 1 },
    "web":  { "replicas": 1, "tier": "frontend" }
  }
}
```

A child named nowhere in the table is still refused, since the set is
closed; only the shape of each child is left to the overlays.

## Seal the set without closing the tree

Sometimes the generated map itself has to stay open: other statements
merge into it, or overlays you do not control land on it. A hidden guard
seals from the side: [meet](../unification.md) a clone of the tree with
a closed pack of the same table and an open, empty template:

```aontu
environments: hide({ dev: {} prod: {} })

deploy: pack($.environments, { replicas: *1|integer })

envguard: hide($.deploy & close(pack($.environments, open({}))))

deploy: prod: replicas: 3
```

```json
{ "deploy": { "dev": { "replicas": 1 }, "prod": { "replicas": 3 } } }
```

The `open({})` matters: a closed empty template would seal each
environment's keys as well, and the guard would refuse the
`replicas` it is meant to leave alone. `envguard` evaluates on every
run and emits nothing, and an environment that exists nowhere in the
table has nowhere to land. Invent one on the last line of `guard.aontu`:

<!-- test: scenario envguard -->
<!-- test: file guard.aontu -->
```aontu
environments: hide({ dev: {} prod: {} })

deploy: pack($.environments, { replicas: *1|integer })

envguard: hide($.deploy & close(pack($.environments, open({}))))

deploy: prod2: replicas: 3
```

<!-- test: run -->
```sh
$ aontu guard.aontu
[aontu/closed]: Cannot resolve value at path $.envguard
...
$ echo $?
1
```

The annotated site is the overlay line that invented `prod2`; the
reported path is the guard's own, which is the cost of guarding from
the side rather than in the tree.

For the basics of `close` on a plain map, start at [forbid unexpected
keys](forbid-unexpected-keys.md); the semantics are specified in
[Closed values: `close` /
`open`](../reference-language.md#closed-values-close--open). Both
recipes run live: the [Kubernetes golden
path](../../use-cases/06-k8s-golden-path/) seals its service set
with `close(pack(...))` as its drift guard, and the [deployment
fleet](../../use-cases/02-deploy-config/) keeps the environment
guard as a worked example in `stack.aontu`.

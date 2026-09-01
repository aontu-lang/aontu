---
description: Write a default in a disjunction with the type an override must satisfy, and layer defaults by rank.
group: compose
order: 10
---

# Provide defaults that callers can override

A default that nothing can override is a constant, and a default
that anything can override is a bug with a delay on it. The
disjunction holds the ground between: write the default beside the
type an override must satisfy:

```aontu
timeout: *30 | integer      # 30 unless overridden
```

```json
{ "timeout": 30 }
```

The `*` marks the preferred branch, so with no other statement the
document generates `30`. A later `timeout: 60` — in the same file or
merged from another — takes its place:

```aontu
timeout: *30 | integer
timeout: 60
```

```json
{ "timeout": 60 }
```

An override is admitted only if an alternative of the disjunction
accepts it or it equals the preferred value, so `timeout: 1.5` is
refused. Write both lines as `timeout.aon`:

<!-- test: scenario provide-defaults -->
<!-- test: file timeout.aon -->
```aontu
timeout: *30 | integer
timeout: 1.5
```

<!-- test: run -->
```sh
$ aontu timeout.aon
[aontu/empty]: Cannot unify values at path $.timeout
...
 Cannot unify value: 1.5 with value: *30|integer
...
$ echo $?
1
```

The branch is doing the admitting, which means it is also the dial:
`*30 | number` is how you ask for a default that any number may
override:

```aontu
timeout: *30 | number
timeout: 1.5
```

```json
{ "timeout": 1.5 }
```

A bound goes inside the branch the same way:

```aontu
replicas: *2 | (integer & min(1) & max(24))
replicas: 12
```

```json
{ "replicas": 12 }
```

Unset, this field generates `2`; `12` is admitted; `40` must be
refused, because a fleet that quietly accepts `replicas: 40` has no
policy at all. Check it with `replicas.aon`:

<!-- test: file replicas.aon -->
```aontu
replicas: *2 | (integer & min(1) & max(24))
replicas: 40
```

<!-- test: run -->
```sh
$ aontu replicas.aon
[aontu/empty]: Cannot unify values at path $.replicas
...
 Cannot unify value: 40 with value: *2|integer&min(1)&max(24)
...
$ echo $?
1
```

A lone `*5` with no `|` is just a default `5` and needs none of
this, and the spelling `integer & (*30 | integer)` means the same as
`*30 | integer`.

## Layer defaults by rank

When several layers of authority each want to supply the default,
stars decide. The fewer the stars, the stronger the default — `*`
beats `**` beats `***` — and a concrete value beats them all, so an
organisation writes `***`, a team `**`, an environment `*`:

```aontu
logLevel: ***info      # org
logLevel: **debug      # team
logLevel: *warn        # environment
```

```json
{ "logLevel": "warn" }
```

No priority table, no merge order: the three statements can arrive
from three files in any order and `warn` still wins. Two defaults of
the same rank that disagree refuse as `[aontu/pref_rank_clash]`, whose
hint names the fix, so two teams cannot both claim the same rung
silently.

Ranks also order the arms of one disjunction, and there the ladder
survives elimination: `*1 | **2` generates `1`, and generates `2` once
something rules `1` out. Adding a rung is therefore safe — it cannot
take the rungs above it with it.

The marker is specified in [Preference / default
`*`](../reference-language.md#preference--default-). Two live
versions run this at scale: the [feature-flag
catalog](../../use-cases/08-feature-flags/) arbitrates org, then
environment, then tenant over the same rank ladder, and the
[deployment fleet](../../use-cases/02-deploy-config/) layers org,
team and environment files the same way. Offering a default is also
how a referenced base lets its referrers differ — see [reference and
reshape](reference-and-reshape.md) — and when the value is already
pinned concrete, overriding means [changing a pinned
value](change-a-pinned-value.md) instead.

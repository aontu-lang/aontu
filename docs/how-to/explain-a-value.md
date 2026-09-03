---
description: List every contribution that met at a path—which file, which line, which layer—with aontu why.
group: query-change
order: 20
---

# Explain a value

A layered document tells you what won and keeps quiet about who was in
the race. `aontu why` lists every value the author *wrote* that
[met](../unification.md) at a path, in source order, with the site each
was written at. The file below is the [deployment
fleet](../../use-cases/02-deploy-config/) use case trimmed to two layers
in one file—in the live version the layers are separate files, and the
sites carry each file's name. Write `stack.aon`:

<!-- test: scenario explain-a-value -->
<!-- test: file stack.aon -->
```aontu
# the org layer: a default for every service
services: { &: { logLevel:***info | string replicas:***1 | integer } }

# the prod layer: stronger defaults and pins
services: auth: { logLevel:*warn | string replicas:3 }
services: billing: {}
```

Ask why `auth` runs three replicas:

<!-- test: run -->
```sh
$ aontu why $.services.auth.replicas stack.aon
$.services.auth.replicas = 3
  1. ***1|integer  stack.aon:2:53  (spread)
  2. 3  stack.aon:5:52
```

The role in brackets marks a contribution that arrived indirectly:
`(spread)` is the `&:` template on line 3, applied to this key. The
concrete `3` carries no role—the author wrote it at the path it
stands at. Contributions are listed in source order (file, row,
column), not in the order the engine happened to meet them.

The same question at `logLevel` shows the rank ladder mid-argument:

<!-- test: run -->
```sh
$ aontu why $.services.auth.logLevel stack.aon
$.services.auth.logLevel = *"warn"|***"info"|string
  1. ***"info"|string  stack.aon:2:27  (spread)
  2. *"warn"|string  stack.aon:5:28
```

The value at the path is the merged disjunction of both defaults;
generation then picks `warn`, because fewer stars is the stronger
rank (see [provide defaults](provide-defaults.md)). `why` shows the
value *standing* at the path, which is exactly what you need when the
generated answer surprises you.

A path where only a template ever wrote still answers—the default
that stands there is a contribution, and its site is the line the
author wrote it on:

<!-- test: run -->
```sh
$ aontu why $.services.billing.replicas stack.aon
$.services.billing.replicas = ***1|integer
  1. ***1|integer  stack.aon:2:53  (spread)
```

A path that names nothing is a refusal, exactly as it is for `get`:

<!-- test: run -->
```sh
$ aontu why $.services.auth.memory stack.aon
$.services.auth.memory: no_path [reference]
  The path $.services.auth.memory names nothing in this document.
$ echo $?
1
```

For a program, `--format json` emits the record—`{path, value,
conjuncts: [{canon, role, site}]}`—with sites in the shape the vet
report uses. Provenance travels with a clone, so a value that reached
its path through a template, a `pack()` generator, or a `$ref` is
reported as the value the author wrote, where they wrote it.

The contribution rules and roles are specified under [`aontu
why`](../reference-api.md#aontu-why); the live version asks the same
question across four layers of authority in
[use-cases/02-deploy-config](../../use-cases/02-deploy-config/).
`why` also names the line that will refuse your next edit—when it
does, [change the value with an
overlay](change-a-value-with-an-overlay.md).

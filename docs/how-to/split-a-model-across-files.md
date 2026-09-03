---
description: Load other source files with @"path" so a base model and its overrides unify into one document.
group: modules
order: 10
---

# Split a model across files

One file holds a model well until two teams edit it, or until the
environment-specific lines outnumber the shared ones. `@"path"` loads
another source file and unifies it in place, so a split costs nothing:
the parts mean exactly what the whole meant. Write the shared shape
as `base.aon`:

<!-- test: scenario split-model -->
<!-- test: file base.aon -->
```aontu
server: {
  host: string
  port: *8080 | integer
  debug: *false | boolean
}
```

the production pins as `override.aon`:

<!-- test: file override.aon -->
```aontu
server: { host: "app.corp.example", port: 8443 }
```

and an entry file `main.aon` that loads both:

<!-- test: file main.aon -->
```aontu
@"./base.aon"
@"./override.aon"
```

<!-- test: run -->
```sh
$ aontu main.aon
{
  "server": {
    "debug": false,
    "host": "app.corp.example",
    "port": 8443
  }
}
```

The override beats the `*8080` default, `debug` falls back to its
own, and `host: string` is satisfied rather than replaced.
Unification is order-independent, so swapping the two include lines
changes nothing: there is no cascade to reason about, only one merged
document.

An include is an ordinary value, so it can land under a key. Write
`car.aon`:

<!-- test: file car.aon -->
```aontu
color: silver
doors: 4
```

and mount it in `lot.aon`, constraints attached:

<!-- test: file lot.aon -->
```aontu
car: @"./car.aon"
car: { doors: number, wheels: 4 }
```

<!-- test: run -->
```sh
$ aontu lot.aon
{
  "car": {
    "color": "silver",
    "doors": 4,
    "wheels": 4
  }
}
```

The loaded file never learns it was mounted: its `doors: 4`
[meets](../unification.md) the local `doors: number` the way any two
conjuncts meet, and a conflict between a loaded value and a local one is
a normal unification error (read one with [read a conflict
error](read-a-conflict-error.md)).

Watch the paths. A relative include resolves against the including
file's own directory (the CLI starts the chain at the entry file's
directory), so a tree of split files moves as a unit. The embedding
APIs accept a base directory and an in-memory resolver for tests; see
[`AontuOptions`](../reference-api.md#aontuoptions). And one shape of
path bypasses the filesystem entirely: a first segment carrying a dot
plus an `@N` major suffix (`@"corp.example/schemas/service@1"`) is a
module import, resolved from local stores under an integrity pin.
That story starts in
[vendor a dependency closure](vendor-a-dependency-closure.md).

The full loading contract, extension defaulting included, is [source
loading](../reference-language.md#source-loading-) in the language
reference. [Change a value with an
overlay](change-a-value-with-an-overlay.md) uses this same split so
machine edits land in a file of their own, and
[use-cases/11-shared-modules](../../use-cases/11-shared-modules/) is
the live version of a model split all the way across repositories.

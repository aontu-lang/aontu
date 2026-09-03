---
description: Build a `uint8`/`port` vocabulary as a `type()`-marked block of ordinary fields.
group: schemas
order: 40
---

# Name a reusable constraint

Aontu has no `uint8`, `int8` or `port` keyword, and does not need
one: a constraint is a value, so a name for one is a field. A
`type()`-marked block gives you a library of them that unifies like
everything else and emits nothing:

```aontu
type: type({})
type: {
  uint8: integer & min(0)    & max(255)
  int8:  integer & min(-128) & max(127)
  port:  integer & min(1)    & max(65535)
}

listen: $.type.port
listen: 8080
```

```json
{ "listen": 8080 }
```

The block is absent from the output and present for unification, and
the key name is not reserved—`type` here is a field that happens to
be `type()`-marked, so `defs` or `schema` reads the same.

An out-of-range value is refused at the field that holds it. Write
the same document with `listen: 70000` as `types.aon`:

<!-- test: scenario named-constraints -->
<!-- test: file types.aon -->
```aontu
type: type({})
type: {
  uint8: integer & min(0)    & max(255)
  int8:  integer & min(-128) & max(127)
  port:  integer & min(1)    & max(65535)
}

listen: $.type.port
listen: 70000
```

<!-- test: run -->
```sh
$ aontu types.aon
[aontu/constraint]: Cannot unify values at path $.listen
...
 Cannot unify value: 70000 with value: integer&min(1)&max(65535)
...
$ echo $?
1
```

The refusal states the normalised residual the value had to satisfy,
not the alias's name—the constraint travelled, the label did not.

Lead with the kind. `min(0) & max(255)` alone bounds a *number*, so
`1.5` satisfies it:

```aontu
loose: type({})
loose: { byteish: min(0) & max(255) }
a: $.loose.byteish
a: 1.5
```

```json
{ "a": 1.5 }
```

A sized integer is `integer & min(0) & max(255)`, which is why every
alias above starts with `integer`.

Aliases are ordinary values, so they compose: one can be defined in
terms of another, and a use site can narrow one further
(`$.type.uint8 & max(15)`). For a file-local name that skips the
path entirely, `%port: integer & min(1) & max(65535)` declares an
[alias](../reference-language.md#aliases-) used as bare `%port`.

The idiom is specified in [Named constraint
aliases](../reference-language.md#named-constraint-aliases); the
`type()` mark's mechanics are the subject of [keep schema out of the
output](keep-schema-out-of-output.md).

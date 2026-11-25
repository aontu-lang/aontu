---
description: Hold every key a pattern matches to one schema with `keyed`, and type or refuse the keys it does not match.
group: schemas
order: 25
---

# Hold keys to a pattern

Some maps have keys you can describe but not list: every `env_`
variable is a string, every `_port` is an integer. A plain `&:` spread
holds every key to one schema, which is too many keys. `keyed` holds
the keys a pattern matches:

```aontu
cfg: { &: keyed(re("^env_"), string) env_name:prod other:1 }
```

```json
{
  "cfg": {
    "env_name": "prod",
    "other": 1
  }
}
```

`env_name` matches the pattern and is held to `string`. `other`
matches nothing and is left alone. Now give a matching key the wrong
kind of value. Write this as `cfg.aontu`:

<!-- test: scenario keyed-howto -->
<!-- test: file cfg.aontu -->
```aontu
cfg: { &: keyed(re("^env_"), string) env_name:8080 }
```

<!-- test: run -->
```sh
$ aontu cfg.aontu
[aontu/no_scalar_unify]: Cannot unify values at path $.cfg.env_name
...
$ echo $?
1
```

The refusal names the key that broke its pattern's schema.

## Type or refuse the other keys

A third argument is the schema for every key the pattern does not
match. `nil` admits nothing, so only patterned keys get in. Change
`cfg.aontu`:

<!-- test: file cfg.aontu -->
```aontu
cfg: { &: keyed(re("^env_"), string, nil) env_name:prod other:1 }
```

<!-- test: run -->
```sh
$ aontu cfg.aontu
[aontu/literal_nil]: Cannot resolve value at path $.cfg.other
...
$ echo $?
1
```

Any schema fits there: `keyed(re("^env_"), string, integer)` holds
the rest to `integer`.

## Several patterns

Join the calls with `&`. Each pattern holds its own keys, and a key
two patterns match is held to both:

```aontu
cfg: { &: keyed(re("^env_"), string) & keyed(re("_port$"), integer) }
cfg: env_name: prod
cfg: http_port: 8080
cfg: other: true
```

```json
{
  "cfg": {
    "env_name": "prod",
    "http_port": 8080,
    "other": true
  }
}
```

An `env_port` would have to be a string and an integer at once, so
no value can sit under that key. Write patterns that do not overlap,
or mean it when they do.

## What to watch for

A pattern declares no key. So a sealed map still refuses a key that
only the pattern matches, and that includes every instance of a
`type()`. A type that takes patterned keys is held open, and closed
again by the `nil`:

```aontu
Env: type(open({ &: keyed(re("^env_"), string, nil) }))
cfg: $.Env & { env_name:prod }
```

```json
{
  "cfg": {
    "env_name": "prod"
  }
}
```

A `re()` pattern matches anywhere in the key unless you anchor it, as
a JSON Schema pattern does, so `re("env")` also holds `my_env_x`. In a
list the key is the position as a string: `keyed("0", string,
integer)` holds the first element to `string` and the rest to
`integer`.

`keyed` is a short form. It means the guarded spread
`match(key(0), p, t, e)`, and the canonical form shows whichever of
the two you wrote. (CUE writes the first example as
`[=~"^env_"]: string`.)

The semantics are specified in [Key patterns:
`keyed`](../reference-language.md#key-patterns-keyed). To hold every
key to one template, see [apply a template to many
keys](apply-a-template-to-many-keys.md); to refuse every key the
schema does not name, [forbid unexpected keys](forbid-unexpected-keys.md).
The export writes a pattern as `patternProperties`: see [export JSON
Schema](export-json-schema.md).

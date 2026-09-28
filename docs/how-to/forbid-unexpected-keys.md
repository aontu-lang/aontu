---
description: Seal a map with `close` so a typo'd or invented key is refused instead of absorbed.
group: schemas
order: 20
---

# Forbid unexpected keys

Maps are open by default: a key the schema never mentioned unifies in
without comment. That openness is what makes composition work, and it
is exactly wrong for config. Seal the map with `close`:

```aontu
config: close({ host:string port:integer })
config: { host:h port:1 }
```

```json
{
  "config": {
    "host": "h",
    "port": 1
  }
}
```

Declared keys compose as before. Now add a key the schema does not
declare. Write this as `config.aontu`:

<!-- test: scenario closed-map -->
<!-- test: file config.aontu -->
```aontu
config: close({ host:string port:integer })
config: { host:h port:1 debug:true }
```

<!-- test: run -->
```sh
$ aontu config.aontu
[aontu/closed]: Cannot resolve value at path $.config.debug
...
$ echo $?
1
```

The error names the key, which is the point: an absorbed `debug`
would have run in production doing nothing.

`open(x)` lifts a seal again, so a schema you import closed can be
extended deliberately:

```aontu
a: open(close({ x:1 })) & { y:2 }
```

```json
{
  "a": {
    "x": 1,
    "y": 2
  }
}
```

What to watch for: `close` seals the node it wraps and everything
beneath it, so children generated inside it are sealed too. Around a
`pack` generator that is what refuses a misspelled override, and
[seal generated children](seal-generated-children.md) walks through
it, including how an inner `open()` holds one level open. A list
under the seal is fixed in length unless an element template `[&: T]`
declares its elements: see [constrain every element of a
list](constrain-list-elements.md).

The semantics are specified in [Closed values: `close` /
`open`](../reference-language.md#closed-values-close--open).
Closedness is also the one thing aontu and JSON Schema say
identically (`additionalProperties: false`): see
[export JSON Schema](export-json-schema.md).

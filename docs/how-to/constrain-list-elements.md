---
description: Type every element of a list with a `&:` spread, and know why a bare `[string]` does not.
group: schemas
order: 10
---

# Constrain every element of a list

A bare `[string]` is a positional constraint: it types element 0 and
says nothing about the rest. Most lists are collections, and most
authors learn the difference from data that should have failed:

```aontu
tags: [string]
tags: [core, 7]
```

```json
{
  "tags": [
    "core",
    7
  ]
}
```

The `7` passed because position 1 was never constrained—the two
lists unified element by element, and the schema list simply ran out.

The collection form is a `&:` spread: a template unified into every
element. Write this as `tags.aon`:

<!-- test: scenario list-elements -->
<!-- test: file tags.aon -->
```aontu
tags: [&: string]
tags: [core, 7]
```

Now run it:

<!-- test: run -->
```sh
$ aontu tags.aon
[aontu/no_scalar_unify]: Cannot unify values at path $.tags.1
...
$ echo $?
1
```

The path names the exact element, so a thousand-entry list fails at
`$.tags.999`, not "somewhere in tags".

Reach for the positional form when the positions genuinely differ (a
pair, a fixed header) and for `[&: T]` whenever the list is a
collection. `close` on the enclosing map seals that map's
keys and leaves the list tail open—the spread is what constrains
the elements. Constraints on the list itself (`length`, `unique`)
sit beside the spread with `&`; see [`length`
semantics](../reference-language.md#length-semantics).

The constructs are specified in the language reference under
[Lists](../reference-language.md#lists) and
[Spreads `&:`](../reference-language.md#spreads-). To close the map
around the list too, see
[forbid unexpected keys](forbid-unexpected-keys.md); a bare-kind
element template also crosses to JSON Schema as `items`—see
[export JSON Schema](export-json-schema.md).

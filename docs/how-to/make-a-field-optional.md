---
description: Suffix a key with `?` so a field that never receives a value is dropped instead of erroring.
group: schemas
order: 30
---

# Make a field optional

Some fields are genuinely sometimes-absent, and a schema that demands
them anyway teaches producers to send empty strings. Suffix the key
with `?` instead. An optional field that never receives a concrete
value is dropped from the output:

<!-- fmt: keep a schema and its data as separate statements -->
```aontu
record: { id: integer, note?: string }
record: { id: 1 }
```

```json
{
  "record": {
    "id": 1
  }
}
```

Dropped means absent—no `note`, not `note: null`. Supplying a value
keeps the field, checked against its constraint as usual:

<!-- fmt: keep a schema and its data as separate statements -->
```aontu
record: { id: integer, note?: string }
record: { id: 1, note: hi }
```

```json
{
  "record": {
    "id": 1,
    "note": "hi"
  }
}
```

An optional key with a [ranked
default](../reference-language.md#preference--default-) is filled
rather than dropped, because the default is a concrete value arriving:

<!-- fmt: keep a schema and its data as separate statements -->
```aontu
record: { id: integer, retries?: *3 | integer }
record: { id: 1 }
```

```json
{
  "record": {
    "id": 1,
    "retries": 3
  }
}
```

Use `note?:` for "may not exist" and `retries?: *3 | integer` for
"always exists, sender may omit". The two read almost the same and
generate differently.

An optional key is still a declared key, so it coexists with
[`close`](forbid-unexpected-keys.md): the sealed map admits the key
when it arrives and drops it when it does not:

```aontu
config: close({ id:integer note?:string })
config: id: 1
```

```json
{
  "config": {
    "id": 1
  }
}
```

The full rules, including how optionality survives references, are in
[Optional keys `?`](../reference-language.md#optional-keys-). For
defaults on their own, see [provide defaults](provide-defaults.md);
on a JSON Schema export an optional key is simply absent from
`required`—see [export JSON Schema](export-json-schema.md).

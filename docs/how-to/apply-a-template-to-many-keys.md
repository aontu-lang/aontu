---
description: Use a `&:` spread entry to unify one template into every key of a map or every element of a list.
group: compose
order: 20
---

# Apply a template to many keys

Ten endpoints, one policy, and the policy written ten times: that is
how drift starts. Write it once as a `&:` spread entry—it is
unified into every other key of the map:

```aontu
endpoints: {
  &: { method: *GET | string, auth: *true | boolean }
  list:   {}
  create: { method: POST }
}
```

```json
{ "endpoints": {
  "create": { "auth": true, "method": "POST" },
  "list":   { "auth": true, "method": "GET" }
} }
```

`create` keeps its own `method` and picks up the rest: the template
is a peer of each child, so children override its defaults the
ordinary way. (Keys come out sorted, whatever order they were
written in.) The same entry works in lists:

```aontu
a: [&: {x: 1}, {y: 1}, {y: 2}]
```

```json
{ "a": [ { "x": 1, "y": 1 }, { "x": 1, "y": 2 } ] }
```

A top-level `&: {...}` applies to every key of the root map.

## Stamp a schema and a shared field

A template does not have to be defaults. The service-catalog pattern
stamps a `type()`-marked schema together with the one field every
child in a block shares:

```aontu
CatalogEntry: type({
  owner: string
  tier: integer & min(1) & max(3)
  description: string
})

payments: services: {
  &: $.CatalogEntry & { owner: "team-payments" }
  payments: { tier: 1, description: "Card capture API." }
  ledger:   { tier: 1, description: "Ledger of record." }
}
```

```json
{ "payments": { "services": {
  "ledger":   { "description": "Ledger of record.",
                "owner": "team-payments", "tier": 1 },
  "payments": { "description": "Card capture API.",
                "owner": "team-payments", "tier": 1 }
} } }
```

`CatalogEntry` itself never appears in the output—the mark keeps
it for unification only, per [keep schema out of the
output](keep-schema-out-of-output.md)—and no service repeats its
`owner`. The stamped constraints are enforced per child. Change
`ledger` to `tier: 4` and run it as `catalog.aon`:

<!-- test: scenario stamp-catalog -->
<!-- test: file catalog.aon -->
```aontu
CatalogEntry: type({
  owner: string
  tier: integer & min(1) & max(3)
  description: string
})

payments: services: {
  &: $.CatalogEntry & { owner: "team-payments" }
  payments: { tier: 1, description: "Card capture API." }
  ledger:   { tier: 4, description: "Ledger of record." }
}
```

<!-- test: run -->
```sh
$ aontu catalog.aon
[aontu/constraint]: Cannot unify values at path $.payments.services.ledger.tier
...
 Cannot unify value: 4 with value: integer&min(1)&max(3)
...
$ echo $?
1
```

The refusal lands on the child that broke the rule, not on the
template—the reader of a CI log gets the offending service by
name.

One thing to watch: a spread constrains the children it
[meets](../unification.md) and creates none of its own, so a map holding
only `&:` generates `{}`. Generating children from a table is `pack`'s
job, and sealing what it generates is the subject of [seal generated
children deeply](seal-generated-children.md). For lists, the choice
between `[&: T]` and the positional `[T]` is decided in [constrain every
element of a list](constrain-list-elements.md).

Spreads are specified in [Spreads
`&:`](../reference-language.md#spreads-). The live versions: the
[service catalog](../../use-cases/01-service-catalog/) stamps a
schema and an owner across three domains exactly as above, and the
[Kubernetes golden path](../../use-cases/06-k8s-golden-path/)
combines spreads with generators to fan one service model out into
whole manifests.

---
description: Model services and the stores they own as two tables, with a dependency relation that must name a service that can be called and may not loop, and one owner for each store.
group: schemas
order: 57
---

# Model a microservices architecture

A microservices architecture is a graph before it is anything else:
services call services, and each store belongs to one of them. The
model is two tables and two relations, and the rules that usually live
in a wiki are checked when the document is evaluated.

## Declare the types

Write the vocabulary as `arch.aontu`:

<!-- test: scenario microservices -->
<!-- test: file arch.aontu -->
```aontu
type: type({
  Name: string & re("^[a-z][a-z0-9-]*$")

  Service: close({
    team: $.type.Name
    tier: "edge"|"core"
    needs?: relate($.type.Callable) & acyclic()
    owns?: relate($.type.Store) & inverse(owner)
  })

  Store: close({
    engine: "postgres"|"redis"|"kafka"
    owner: relate($.type.Service) & inverse(owns)
  })

  Callable: tier: "core"
})

services: { &: $.type.Service }
stores: { &: $.type.Store }
```

A `Service` has a team, a tier, and two relations. `needs` lists the
services it calls, and `owns` lists the stores it keeps its data in.
Each entry is a [tree
address](../reference-language.md#checked-links-relatet), and
`relate(t)` makes it a checked link: the address must name a node, and
the type `t` is [met](../unification.md) with what it names.

The other terms are rules about the whole edge set. `acyclic()` says
that calls never loop. `inverse(owner)` says that a store a service
owns names that service as its `owner`, and `inverse(owns)` on the
other side says that an owner lists its store. Between them a store
has one owner.

`Callable` is the type a dependency must have. It is the `core` tier
alone, so nothing calls into the edge.

## Write the architecture

A shop has a gateway, four services behind it, and three stores. Write
it as `shop.aontu`:

<!-- test: file shop.aontu -->
```aontu
@"./arch.aontu"

services: gateway: {
  team: "web"
  tier: "edge"
  needs: [path($.services.orders) path($.services.catalog)]
}
services: orders: {
  team: "commerce"
  tier: "core"
  needs: [path($.services.payments) path($.services.inventory)]
  owns: [path($.stores.orderdb)]
}
services: payments: {
  team: "commerce"
  tier: "core"
  owns: [path($.stores.ledger)]
}
services: catalog: {
  team: "browse"
  tier: "core"
  needs: [path($.services.inventory)]
}
services: inventory: { team:"supply" tier:"core" owns: [path($.stores.stock)] }

stores: orderdb: { engine:"postgres" owner:path($.services.orders) }
stores: ledger: { engine:"postgres" owner:path($.services.payments) }
stores: stock: { engine:"redis" owner:path($.services.inventory) }
```

Now check the edge set, and read one service back:

<!-- test: run -->
```sh
$ aontu relations shop.aontu
verdict: pass
$ aontu model get $.services.orders shop.aontu
{
  "needs": [
    "$.services.payments",
    "$.services.inventory"
  ],
  "owns": [
    "$.stores.orderdb"
  ],
  "team": "commerce",
  "tier": "core"
}
```

Both ends of an ownership are written out, in `owns` and in `owner`.
`inverse()` checks that the other end is there, and never writes it.

## A dependency has to be a service that can be called

Have the catalogue call a service nobody declared. Write the change as
`missing.aontu`:

<!-- test: file missing.aontu -->
```aontu
@"./shop.aontu"

services: catalog: needs: [path($.services.inventory) path($.services.billing)]
```

<!-- test: run -->
```sh
$ aontu missing.aontu
[aontu/rel_unresolved]: Cannot relate value at path $.services.catalog.needs.1
...
$ echo $?
1
```

The refusal is at the entry that names nothing. Now have the catalogue
call the gateway, which is on the edge. Write the change as
`edge.aontu`:

<!-- test: file edge.aontu -->
```aontu
@"./shop.aontu"

services: catalog: needs: [path($.services.inventory) path($.services.gateway)]
```

<!-- test: run -->
```sh
$ aontu edge.aontu
[aontu/scalar_value]: Cannot unify values at path $.services.gateway.tier
...
$ echo $?
1
```

This refusal names the target, not the link. The relation met
`Callable` with the gateway, and the gateway already says `edge`.

## Calls may not loop

Two services that call each other agree field by field, so nothing
conflicts where either is written. The loop is a fact about the whole
edge set. Write it as `cycle.aontu`:

<!-- test: file cycle.aontu -->
```aontu
@"./shop.aontu"

services: inventory: needs: [path($.services.orders)]
```

<!-- test: run -->
```sh
$ aontu relations cycle.aontu
verdict: fail

$.services.inventory.needs.0  needs: cycle $.services.inventory -> $.services.orders -> $.services.inventory
$ echo $?
1
```

The finding is at an edge on the loop, and lists the services the loop
runs through. Generating the same document is refused with
`[aontu/relation_cycle]` at the same edge.

## A store has one owner

Have payments read the orders database directly. Write the change as
`shared.aontu`:

<!-- test: file shared.aontu -->
```aontu
@"./shop.aontu"

services: payments: owns: [path($.stores.ledger) path($.stores.orderdb)]
```

<!-- test: run -->
```sh
$ aontu relations shared.aontu
verdict: fail

$.services.payments.owns.1  owns: $.stores.orderdb does not list $.services.payments under owner
$ echo $?
1
```

`orderdb` names `orders` as its owner, and an `owner` is one address,
so a second service has nowhere to be listed. A store whose owner does
not list it fails the same way, at the store.

## Ask what a service can reach

`aontu reaches` follows the edges. Ask whether a request at the
gateway can reach the ledger, and whether one at the catalogue can:

<!-- test: run -->
```sh
$ aontu reaches $.services.gateway $.stores.ledger shop.aontu
verdict: reaches

$.services.gateway -> $.services.orders -> $.services.payments -> $.stores.ledger
$ aontu reaches $.services.catalog $.stores.ledger shop.aontu
verdict: unreachable

$.services.catalog does not reach $.stores.ledger
$ echo $?
1
```

The path is the answer to the first question. The second exits `1`,
which is what a containment rule asserts in CI: the catalogue never
reaches the ledger.

## Draw the architecture

The figures are drawn from the same edges, so they cannot fall out of
step with the model:

<!-- test: run -->
```sh
$ aontu view tree --relation needs shop.aontu
gateway
├── catalog
│   └── inventory
└── orders
    ├── inventory
    └── payments
$ aontu view layer --relation needs --group-by tier shop.aontu
+--------------------------------------------+
| edge  gateway                              |
+--------------------------------------------+
| core  catalog  inventory  orders  payments |
+--------------------------------------------+
# needs: 2 downward, 3 sideways, 0 upward
```

The footer of the layer figure counts the calls by direction. `0
upward` is the tier rule again, read off the picture.

## Write names instead of addresses

A reader of the JSON usually wants `"needs": ["payments",
"inventory"]`. [`gen("key")`](../reference-language.md#addresses-form)
writes an address as its last segment, and changes nothing the
relations read. Write the overlay as `names.aontu`:

<!-- test: file names.aontu -->
```aontu
@"./shop.aontu"

services: { &: { needs?: [&: gen("key")] owns?: [&: gen("key")] } }
stores: { &: { owner:gen("key") } }
```

<!-- test: run -->
```sh
$ aontu model get $.services.orders names.aontu
{
  "needs": [
    "payments",
    "inventory"
  ],
  "owns": [
    "orderdb"
  ],
  "team": "commerce",
  "tier": "core"
}
$ aontu relations names.aontu
verdict: pass
```

## What to watch for

`aontu reaches` with no `--relation` follows every declared edge, and
`owner` is one: it points from a store back to its service. Pass
`--relation needs` to ask about calls alone. A store calls nothing,
because `Store` is closed and has no `needs`, so a store that lists a
dependency is refused with `[aontu/closed]`.

The relation is specified under [Checked
links](../reference-language.md#checked-links-relatet) and [Declared
relations](../reference-language.md#declared-relations). For the
checks, see [Check that components agree about their
relations](check-relations.md), for the queries [Query reachability
between entities](query-reachability.md), and for the figures [Draw a
model](draw-a-model.md). A catalogue of a whole company's services,
with its checks, is
[use-cases/01-service-catalog](../../use-cases/01-service-catalog/).

---
description: Draw each group of a model as its own ER figure, the groups themselves as a surface map, and commit one file per group with aontu view.
group: query-change
order: 61
---

# Draw one figure per group

A model that files its tables under domains already says which figure
each table belongs in. When the tables are top-level entities and a
domain only refers to them, no path holds one domain's tables, so
`--at` cannot cut the figure. `aontu view --of` can: it draws the
members of a node, which are what its links point at.

<!-- test: scenario groups -->

Write `shop.aontu`, two domains and three tables, each with its
columns:

<!-- test: file shop.aontu -->
```aontu
domains: billing: tables: [&: refer() path($.invoice) path($.payment)]
domains: identity: tables: [&: refer() path($.customer)]

customer: { domain:identity columns: { id:integer email:string } }

invoice: domain: billing
invoice: columns: {
  id: integer
  customer: refer() & path($.customer)
  total: number
}

payment: domain: billing
payment: columns: { id:integer invoice:refer() & path($.invoice) }
```

## Draw one group's tables

`--of` names the group and `--member` the key its tables are under.
`--columns` names the field holding each table's columns, and
`--ghosts` keeps the relationship that leaves the group:

<!-- test: run -->
```sh
$ aontu view graph --as er --columns columns --of '$.domains.billing' --member tables --ghosts shop.aontu
erDiagram
  xn_customer["customer (outside)"]
  n_invoice["invoice"] {
    path customer FK
    integer id
    number total
  }
  n_payment["payment"] {
    integer id
    path invoice FK
  }
  n_invoice }o--o{ xn_customer : "customer"
  n_payment }o--o{ n_invoice : "invoice"
```

A column holding a link is a foreign key, and the relationship it makes
is drawn from the table and named by the column. `customer` lives in
another domain, so it is drawn as a ghost with no columns. Without
`--ghosts` the edge to it is left out and counted as `edges_outside`.

## Draw the domains themselves

`--of` over the map of domains selects every domain's tables at once.
`--collapse` then draws one node per `--group-by` value, titled with
its count, and one edge per pair of domains:

<!-- test: run -->
```sh
$ aontu view graph --columns columns --of '$.domains' --member tables --group-by domain --collapse shop.aontu
flowchart LR
  g0["billing (2)"]
  g1["identity (1)"]
  g0 -->|"customer (1)"| g1
```

The `invoice` to `payment` edge lies inside `billing`, so it is not
drawn: the loss report counts it as `edges_internal`. `--count-by
<field>` adds a breakdown to each title, such as `billing (3: process 1,
table 2)`.

## Write one file per domain

`--split-by` cuts the figure into one part per value, each a whole
figure, and `--out` writes each part to the file its `{part}` names:

<!-- test: run -->
```sh
$ aontu view graph --as er --columns columns --of '$.domains' --member tables --split-by domain --out 'er-{part}.mmd' shop.aontu
$ aontu view graph --as er --columns columns --of '$.domains' --member tables --split-by domain --out 'er-{part}.mmd' --check shop.aontu
$ echo $?
0
```

That writes `er-billing.mmd` and `er-identity.mmd`. A relationship
that crosses into another part draws its far end as a ghost that names
the part it lives in, so `er-identity.mmd` shows `invoice (in
billing)`. `--split-roots` cuts by root instead, and `--budget <n>`
caps each part at `n` tables, alone or after either.

## Keep the figures in a view document

Declare the figures as data, so one run draws them all and one
`--check` gates them in CI. Write `views.aontu`:

<!-- test: file views.aontu -->
```aontu
@"aontu:view"
@"./shop.aontu"

views: { &: $.aontu.View.Figure } & {
  map: {
    kind: graph
    columns: columns
    of: "$.domains"
    member: tables
    groupBy: domain
    collapse: true
    out: "map.mmd"
  }
  er: {
    kind: graph
    as: er
    columns: columns
    of: "$.domains"
    member: tables
    splitBy: domain
    out: "er-{part}.mmd"
  }
}
```

<!-- test: run -->
```sh
$ aontu view --views '$.views' views.aontu
$ aontu view --views '$.views' --check views.aontu
$ echo $?
0
```

A split declaration's `out` must hold `{part}`. Only the declarations
are generated to read them, so the schema half of a model (a column
typed `integer`, say) does not stop its figures being drawn.

## Related

- [`aontu view`](../reference-api.md#aontu-view). Every kind and option,
  including the `state`, `lane`, `sequence` and `treemap` kinds.
- [Draw a model](draw-a-model.md). The dependency tree, the matrix and
  the architecture layers of one model.

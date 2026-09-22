---
description: "Inspect the Rails model: field properties, parent associations, entity order, and prepared seed rows."
group: rb-solar
order: 1
---

# Read the Rails application model

The Rails example keeps entity names, fields, routes, actions, and seed
rows in `model.aontu`. Each generator imports that file and selects the
values its output needs. Start with the [application overview](../README.md)
for the entities and the running Rails architecture.

## Run the example's CLI

Clone the engine repository and enter the example directory:

```sh
git clone git@github.com:aontu-lang/aontu.git
cd aontu/ts
npm ci
cd ../test/system/rb-solar
```

Use the CLI from this checkout throughout these guides. Define a shell
function in the terminal where you run the commands, and make the
scratch directory the recipes write their intermediate documents to:

```sh
aontu() { node ../../../ts/bin/aontu.js "$@"; }
mkdir -p work
```

All commands below run from `test/system/rb-solar`. `work/` is scratch
and is not committed; `check.sh` clears and recreates it. Ruby is needed
to run the Rails app; inspecting the model and generating files requires
Node.js and the engine dependencies, the generator runtime among
them. Follow the repository's
[installation instructions](../../../../ts/README.md) for its supported toolchain.

## Read a field as data

The planet's diameter field is declared in the [model source](../model.aontu):

<!-- source: ../model.aontu -->
```aontu
    field: diameter: {
      name: "diameter"
      json: "diameter"
      fk: false
      kind: "float"
      required: true
      pk: false
      write: true
    }
```

`kind` is the string `"float"`. The migration generator interprets that
string as a Rails column type. `required` controls a presence validation,
`write` controls ordinary API input, and `pk` and `fk` identify keys.
These are properties defined by this example; aontu does not assign Rails
behaviour to them automatically.

The `name` property is the database column name. `json` is the response
property name. They can differ: `terraform_state` is returned as
`terraformState`. Keeping both names explicit lets the API preserve its
existing contract.

Inspect the entity without evaluating the generated application:

```sh
aontu view doc --depth 2 --at '$.entity.planet' model.aontu
```

The command draws the planet's key tree. `$.entity.planet` starts at the
document root; the depth limit keeps nested field and action definitions
out of this view.

## Describe the parent relationship

Moon declares the names used for its parent:

<!-- source: ../model.aontu -->
```aontu
  moon: parent: "planet"
  moon: parent_class: "Planet"
  moon: parent_param: "planet_id"
  moon: parent_controller: "planets"
  moon: parent_title: "Planet"
```

The [Active Record generator](../gen/model.rb) reads the parent class and
foreign-key parameter to write `belongs_to`. The
[ERD generator](../gen/doc/erd.mmd) reads the parent class and association
name to draw the relationship. The controller generators use the parent
information to scope moon queries to a planet.

Planet also declares its child association in `children`. The generator
uses that entry to write `has_many` with `dependent: :destroy`.
These declarations must agree; `parent` is an application convention,
not a built-in aontu relation that infers the other side for you.

## Use maps for names and lists for order

Entities and fields are maps, so a field has a stable address such as
`$.entity.planet.field.diameter`. Walking a map visits sorted keys.
A migration must create planets before moons, so the model also declares:

<!-- source: ../model.aontu -->
```aontu
sequence: [$.entity.planet $.entity.moon]
```

Each list entry refers to the entity already defined. It does not copy
its fields into a second definition. The migration and seed generators
read this list to preserve parent-before-child order.

An action's `rule` is also a list. The API generator emits conditional
assignments in that order, so the last matching assignment wins.
The model puts lower-priority rules first.

## Prepare values for a template

The seed data is imported from the reference application's JSON file.
The model adds a class name to each planet row:

<!-- source: ../model.aontu -->
```aontu
    rows: each($.seed.planet, _ & { class:"Planet" })
```

`each` applies a template to each selected value. `_` is the current
row, and `&` combines that row with the added class property through
[unification](../../../../docs/unification.md). The seed generator can
then read the row and its Rails class in the same place.

This matters for nested generation rules: put the values a rule needs
on the node it matches. Do not assume an inner rule can read the outer
rule's current entity.

Continue with [generating Rails code](rails-code.md) to see how these
values become filenames, associations, routes, and view content.

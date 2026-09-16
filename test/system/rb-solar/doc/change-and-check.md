---
description: "Add an optional field, regenerate Rails code and diagrams, and check the resulting application."
group: rb-solar
order: 4
---

# Change and check the generated Rails app

A change to a modelled field can affect the database schema, API,
browser pages, and ERD. Make the change in the model, regenerate each
target, and review the resulting files together. Complete the
[CLI setup](model.md#run-the-examples-cli) before running these commands.

## Add an optional field

Use a disposable checkout for this exercise. Add this declaration at
the end of `model.aon`:

```aontu
entity: planet: field: nickname: {
  name: "nickname"
  json: "nickname"
  kind: "string"
  required: false
  pk: false
  fk: false
  write: true
}
```

The repeated path adds a new field to the existing Planet entity through
[unification](../../../../docs/unification.md). Its optional status lets
the existing seed rows keep working without a nickname.

`write: true` makes the field eligible for ordinary API input. It does
not add an editing form: this example's browser pages are read-only.

## See the stale output

Check the ERD before regenerating it:

```sh
aontu render --check --marker '%%-' gen/doc/erd.mmd doc
```

The command exits with status 1 and reports `erd.mmd` as drift. The
model now includes `nickname`, but the committed diagram does not.
The migration, API controller, and view outputs also need updating.

## Regenerate the application and diagram

Run the application generators, every file directly in `gen/`, as one
run with `app` as the output directory, and the diagram generator with
`doc`:

```sh
aontu render gen app
aontu render --marker '%%-' gen/doc/erd.mmd doc
```

Stop and resolve any failure before continuing. The first command
evaluates every generator before it writes, and refuses the set when
one fails; the two commands are not a transaction across each other.

Review the generated changes:

```sh
git diff -- model.aon app doc/erd.mmd
```

The new field produces a migration column, an API response property,
permitted API input, browser table and detail entries, and an ERD field.
The Active Record class needs no additional declaration for an optional
column, and the seed generator has no nickname values to write.

The example generates initial create-table migrations. On an existing
database, editing one does not apply a new column. Recreate only a
disposable example database, or design an incremental migration for an
application whose data must survive. Regeneration itself never runs a
database migration.

## Refresh generated model views

The example also commits text and SVG views of the model. Regenerate
them after model changes:

```sh
for format in text svg; do
  extension=txt
  if [ "$format" = svg ]; then extension=svg; fi
  aontu view doc --depth 2 --as "$format" --out "doc/model-tree.$extension" model.aon
  aontu view doc --depth 2 --at '$.entity.planet' --as "$format" --out "doc/planet-tree.$extension" model.aon
  aontu view lattice --as "$format" --out "doc/value-lattice.$extension" model.aon
done
```

Some views can remain identical when a change is below their depth
limit. Review their diffs alongside the [generated ERD](erd.md).

## Format and run the checks

Format the changed model, then run the example's checks:

```sh
aontu fmt --write model.aon
./check.sh
```

The script checks generated files, Ruby template syntax, template round
trips, diagram output, model-read coverage, and formatting. It also runs
the application checks when their dependencies are available.

Coverage is combined across generators: a path is unused by the system
only if no generator reads it. A single generator's `--coverage` report
will include properties used by other generators. A read also does not
prove that the output is correct; inspect the diff and run the app tests.

For the Rails checks, install the bundle first:

```sh
(cd app && bundle install)
./check.sh
```

The script resets the example's development database before starting
Rails. Use it with disposable example data. It then runs the reference
API validation and checks the browser pages. The Ruby SDK check requires
`RB_SOLAR_SDK` to point to the reference SDK's `rb` directory.
Read the `SKIP` lines: a successful generation check does not prove the
server tests ran. Add an API assertion for the nickname field if you
keep this extension; the reference tests do not cover your new field.

## Choose who owns a custom change

Change `model.aon` for facts shared by generated targets. Change a
[generator](rails-code.md) for the Ruby or ERB it should emit. Put custom
runtime behaviour in the handwritten part of the Rails application,
such as a service object called by generated code.

If a generated file becomes handwritten, remove its output rule and its
generated banner together. Review its tests as ordinary application
code. The byte gate checks only the files the generator names; it will
not flag an obsolete file after its rule has been removed.

Return to the [application's folder and ownership guide](../README.md#folder-structure-and-file-ownership)
when deciding where a change belongs.

---
description: Run aontu vet in a pipeline so a document that does not hold fails the build, with the reason attached.
group: validate-evolve
order: 10
---

# Validate data in CI

A schema nobody runs is a comment. The `vet` verb turns yours into a
gate: it validates data files against a schema document, prints
located findings, and exits with the verdict class, which is
everything a pipeline needs to go red for a reason.

Write the schema as `schema.aontu`:

<!-- test: scenario ci-vet -->
<!-- test: file schema.aontu -->
```aontu
user: { id:integer name:string admin:boolean }
```

and the data your pipeline produced as `user.json`:

<!-- test: file user.json -->
```json
{"user": {"id": "seven", "name": "ada", "admin": true}}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet schema.aontu user.json
verdict: invalid

$.user.id: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.user.id
  data: user.json:1:17 ("seven")
  schema: schema.aontu:1:12 (integer)
$ echo $?
1
```

The finding names both sides, data site first, because the data is
the side to edit. (To refuse *extra* keys too, wrap the schema in
`close`: see [Forbid unexpected keys](forbid-unexpected-keys.md).)

## The exit code is the verdict class

There is more than one kind of "no", and a gate that collapses them
throws information away. Drop `id` from the data instead of mistyping
it, as `user2.json` does:

<!-- test: file user2.json -->
```json
{"user": {"name": "ada", "admin": true}}
```

<!-- test: run -->
```sh
$ aontu vet schema.aontu user2.json
verdict: incomplete

$.user.id: mapval_no_gen [incomplete]
  [aontu/mapval_no_gen]: Cannot resolve value at path $.user.id
  schema: schema.aontu:1:12 (integer)
$ echo $?
3
```

Nothing contradicts here; the truth is simply not met yet, and the
exit code says so:

| Exit | Verdict | What the pipeline should do |
|------|---------|-----------------------------|
| 0 | `valid` | pass |
| 1 | `invalid` | fail: the data contradicts the schema; repair the data |
| 3 | `incomplete` | fail: no contradiction, but required truth is unmet |
| 4 | `error` | fail loudly: the *schema* side is unusable, never the data's fault |

(Exit 2 is usage: a bad flag or an unreadable file.) A blanket
"non-zero is red" still gates correctly, but keeping 1 and 3 apart
lets an emit → validate → repair loop route the failure: exit 1 means
repair what was emitted, exit 3 means finish it, exit 4 means stop
and page whoever owns the schema. The full classes are specified
under [`aontu vet`](../reference-api.md#aontu-vet).

## Reports for machines

`--format json` emits the same findings as one object; `--format
sarif` emits SARIF 2.1.0, the form GitHub code scanning ingests:

<!-- test: run -->
```sh
$ aontu vet --format sarif schema.aontu user.json
{
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "runs": [
    {
      "invocations": [
        {
          "executionSuccessful": true
        }
      ],
...
$ echo $?
1
```

The exit code still carries the verdict, so a job can upload the
report and stay red.

## Wire it in

In GitHub Actions, the repository ships an action wrapping the verb,
[`vet-action/`](../../vet-action/README.md), which fails the job by
verdict class and can hand the SARIF to code scanning:

<!-- test: skip CI configuration; not executable here -->
```yaml
steps:
  - uses: actions/checkout@v4
  - uses: aontu-lang/aontu/vet-action@main
    with:
      schema: schema.aontu
      data: user.json
```

As a pre-commit hook, the verb is one line, and the verdict classes
mean a half-finished document blocks the commit too:

<!-- test: skip git hook configuration; not executable here -->
```sh
#!/bin/sh
# .git/hooks/pre-commit
exec aontu vet schema.aontu user.json
```

While editing, `--watch` re-runs the whole vet whenever the schema or
a data file changes, streaming one report per run:

<!-- test: skip --watch runs until interrupted; not executable here -->
```sh
$ aontu vet --watch schema.aontu user.json
```

Every run is a full re-parse and re-unify, so what you see on each
save is exactly what CI will say.

## Make the gate prove it checked something

A gate that passes because it examined **nothing** is worse than no
gate: it reports success. The usual cause is one construct, and it is
silent. A schema written with the wildcard other tools use is a key
**named** `*` in aontu, so it meets no data key and constrains
nothing. Here it is as `wild.aontu`:

<!-- test: scenario vacuous-gate -->
<!-- test: file wild.aontu -->
<!-- fmt: keep the braces are the point: this is the block shape a caller writes, and the agreed form collapses it to a chain -->
```aontu
entity: { "*": { table: string } }
```

`rows.aontu` is the data it was meant to check:

<!-- test: file rows.aontu -->
```aontu
entity: planet: table: 42
```

<!-- test: run -->
```sh
$ aontu vet --partial --strict-coverage wild.aontu rows.aontu
verdict: valid
...
coverage: VACUOUS — no data leaf was constrained by the schema; this run checked nothing
coverage: 0/1 data leaves checked, 3 schema declarations
  unchecked: $.entity.planet
  unused: $.entity.*
aontu: no data leaf was constrained by the schema: this run checked nothing
...
$ echo $?
1
```

`--strict-coverage` is the CI form: it measures what the run examined
and exits 1 when the answer is nothing. The verdict word stays
`valid`, because the unification really did hold; what failed is the
gate's claim to have checked anything. Written with the template
`&:` the same run checks the field and refuses the `42`.

Use `--coverage` alone while writing a schema, to see which
declarations no data meets and which data paths nothing constrains,
and `--coverage-at` to measure one subtree.

Vetting gates the data; the schema itself changes too, and that gate
is [`aontu breaking`](gate-schema-changes.md). For decoding an
individual finding, see [Read a conflict
error](read-a-conflict-error.md).

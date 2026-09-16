# What do you want to do?

The verb for a job, found by the word you arrived with. aontu's own
vocabulary is on the right; yours is probably on the left.

## Start from a document that works

Nothing written yet? Do not invent the first document, edit one:

```
aontu init            # into the working directory
aontu init model/     # or into a named one
sh check.sh           # the four questions, on what was just written
```

`init` writes `model.aon` (an entity map constrained with `&:`),
`data.aon` (an instance of it that holds) and `check.sh` (the four
checks to run after every edit). It never overwrites: if any
of the three already stands there, it refuses and writes none of them.

## Describe a domain

An **ontology**, a **schema**, a **data model**, a **contract** — in
aontu these are all one thing: a document. Write the entities as a
**map keyed by name**, and say what every entry must satisfy with the
`&:` template:

```
entity: {
  &: {
    table:  string
    fields: { &: { type: string, required: *false | boolean } }
  }
  planet: { table: "planets", fields: { name: { type: "string" } } }
  moon:   { table: "moons",   fields: { name: { type: "string" } } }
}
```

`&:` is the construct to reach for first, and the one most easily
missed. It meets **every** key of the map it sits in. A quoted `"*"`
is not a wildcard — it is a key named `*`, and a schema written that
way constrains nothing while still reporting `valid`.

Prefer a named map to a list unless the order is a fact (a migration
sequence, a rule table tried in order). A key is an address, a name
other parts can refer to, and a diff that shows one insertion instead
of every following element renumbered.

## Check data against a model

```
aontu vet model.aon data.aon
```

Exit `0` valid, `1` a contradiction, `3` incomplete (nothing
contradicts, but the model is not yet satisfied), `4` the model does
not stand up on its own. `--format json` for the machine-readable
report, `--closed` to refuse keys the model does not declare,
`--max-errors <n>` to cap the list.

**Make the check prove it checked something.** A check that examined
nothing answers exactly like one that passed:

```
aontu vet --coverage model.aon data.aon         # what did it examine?
aontu vet --strict-coverage model.aon data.aon  # exit 1 if nothing
```

`--coverage` reports how many data leaves a declaration constrained,
the data paths none did, and the declarations no data met.
`--strict-coverage` exits 1 when the answer is nothing. The usual
cause is the `"*"` mistake above: reach for `&:`.

## Check the model is coherent with itself

```
aontu relations model.aon        # declared entity edges: targets resolve, no cycles
aontu reaches planet moon model.aon   # does one entity reach another, at any remove?
aontu trim --check model.aon     # entries whose removal changes nothing
```

## Generate code from a model, and hold it

```
aontu model get out gen.aon      # the component tree: files, and the lines in them
aontu trace gen.aon        # what rule wrote each line
```

A generator answers a **component tree** -- `file(name, [lines])` and
its neighbours -- which a generator runtime writes to disk. Hand the
tree to one and compare with what is committed: the model is the truth,
the code is the claim, and drift is a finding. `aontu trace` answers
the other direction: for a line of the output, the model node and the
rule behind it.

## Ask what a model says, and why

```
aontu model get  $.entity.planet.table model.aon
aontu model why  $.entity.planet.table model.aon
aontu model get  $.entity --keys       model.aon
aontu model get  $.entity --types      model.aon
```

`why` names **every** contribution to a value, with the file and line
each was written on. It is the first thing to run when a value is not
what you expected, and the second thing to run when `vet` refuses.

## Change a value without editing the file

```
aontu model set '$.entity.planet.table=planet_v2' --entry model.aon --overlay local.aon
```

The change is checked before it is written; a change that contradicts
a pinned value is refused, and the file is left alone.

## Gate a change to the model itself

```
aontu subsume old.aon new.aon              # does the general admit every specific?
aontu breaking --against git#HEAD~1 model.aon
aontu hash model.aon                       # a pin that survives reformatting
```

## Hand a model to another agent

```
aontu agentsmd --write AGENTS.md model.aon
```

Splices a derived stanza — the pin, the root keys, the shape, and the
commands spelled with paths that exist — between two markers, and
leaves the rest of the file alone. Re-run it in the commit that
changes the model.

## When something refuses

Read the code in the brackets, then look it up:

```
aontu explain no_scalar_unify
```

Every finding carries a `code`, a `class`, a `path` and the **two
sites** that disagree — the value and the constraint it failed, each
with its file and line. The class says what kind of answer it is:
`conflict` (two things cannot both hold), `incomplete` (nothing is
wrong yet, something is missing), `parse`, `reference`, `budget`.

Full index: [`error-codes.md`](error-codes.md). The language on one
page: [`grammar-card.md`](grammar-card.md). The worked ladder from
plain JSON upward: [`examples.md`](examples.md).

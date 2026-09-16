---
name: aontu
description: >-
  Write, check and query aontu definitions — a JSON superset where
  documents UNIFY instead of overwriting. Use when a repository holds
  `.aon` files, when configuration must satisfy a schema rather than
  merely parse, or when you need to ask what a configuration says at a
  path and why it says it.
---

# aontu

aontu is JSON plus a lattice. Two documents do not override each
other, they **unify**: the result is the most specific value that
satisfies both, or an error naming the contradiction. That makes a
definition checkable, queryable and safe to change.

Start here:

- Every JSON document is an aontu document. Write JSON, then add
  what JSON cannot say.
- [`tasks.md`](tasks.md) — the verb for a job, indexed by the word
  you arrived with (ontology, schema, validate, model).
- [`grammar-card.md`](grammar-card.md) — the whole surface on one
  page.
- [`examples.md`](examples.md) — the JSON-superset ladder: plain
  JSON, then kinds, defaults, templates, constraints.
- [`error-codes.md`](error-codes.md) — what a refusal means and what
  to do about it.

The verbs, all of which answer as JSON with `--format json`:

```
aontu vet schema.aon data.aon   # does this data satisfy that truth?
aontu model get $.a.b file.aon        # what does it say at a path?
aontu model why $.a.b file.aon        # why does that value hold?
aontu model set $.a.b=1 --entry file.aon --overlay over.aon
aontu allow --role dev roles.aon $.a.b   # may this role change that subtree?
aontu hash file.aon             # a pin that survives reformatting
```

These four files also ship INSIDE the command, so they answer with no
network and no checkout: `aontu help` lists the topics, `aontu help
language` is the grammar card, and `aontu explain <code>` says what one
refusal means.

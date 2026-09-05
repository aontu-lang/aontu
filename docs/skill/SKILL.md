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
- [`grammar-card.md`](grammar-card.md) — the whole surface on one
  page.
- [`examples.md`](examples.md) — the JSON-superset ladder: plain
  JSON, then kinds, defaults, templates, constraints.
- [`error-codes.md`](error-codes.md) — what a refusal means and what
  to do about it.

The verbs, all of which answer as JSON with `--format json`:

```
aontu vet schema.aon data.aon   # does this data satisfy that truth?
aontu get $.a.b file.aon        # what does it say at a path?
aontu why $.a.b file.aon        # why does that value hold?
aontu set $.a.b=1 --entry file.aon --overlay over.aon
aontu hash file.aon             # a pin that survives reformatting
```

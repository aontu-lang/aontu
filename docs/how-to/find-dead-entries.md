---
description: Report map entries whose removal changes nothing, so layered files do not silt up with lines a template already implies.
group: query-change
order: 50
---

# Find dead entries

Layered files silt up: an entry written before the template existed
now repeats what the template already says, and deleting it by eye is
a bet. `aontu trim --check` settles the bet by evaluation — each map
entry is deleted in turn, the document re-evaluated, and the entries
that made no difference are reported as paths. Write `services.aon`:

<!-- test: scenario find-dead-entries -->
<!-- test: file services.aon -->
```aontu
services: {
  &: { tier: standard }
  auth:    { tier: standard, replicas: 3 }
  billing: { replicas: 1 }
}
```

Now check it:

<!-- test: run -->
```sh
$ aontu trim --check services.aon
verdict: redundant

$.services.auth.tier
$ echo $?
1
```

`auth.tier` restates the `&:` template, so the document means the
same thing without it. The test is evaluate-and-compare, not pattern
matching, which covers everything the fixpoint can see: spread
templates, references, duplicate-key merges. (A removal that makes
the document *error* is not redundant — the document does not stand
up without that entry.)

Delete the dead line yourself — trim only reports — and re-declare
`services.aon`:

<!-- test: file services.aon -->
```aontu
services: {
  &: { tier: standard }
  auth:    { replicas: 3 }
  billing: { replicas: 1 }
}
```

<!-- test: run -->
```sh
$ aontu trim --check services.aon
verdict: clean
$ echo $?
0
```

Exit `0` is `clean` and exit `1` is `redundant`, so the verb gates a
lint job as it stands; `--format json` gives the paths as a
`redundant` array. Two limits to know: list elements are never
candidates (removing one renumbers the rest, a different document
rather than a leaner one), and `--check` is required — a bare `aontu
trim` that silently did something other than trimming would be worse
than refusing.

The candidate rules and the `error` verdict's report shape are under
[`aontu trim`](../reference-api.md#aontu-trim). Run it beside your
schema gate when you [validate in CI](validate-in-ci.md); when a
reported path surprises you, [explain the value](explain-a-value.md)
to see which template is doing the implying.

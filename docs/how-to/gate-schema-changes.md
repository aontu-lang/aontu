---
description: Gate schema edits with aontu breaking, so a change that would refuse previously valid documents fails the review.
group: validate-evolve
order: 20
---

# Gate schema changes

Consumers validated their documents against the schema you published.
Edit it, and every one of those documents is re-judged. `vet` answers
"does this data hold?"; `breaking` answers the question a schema edit
raises: do documents that were valid against the old version still
hold under the new one?

Point it at the earlier version. Here is a released `profile-v1.aon`:

<!-- test: scenario gate -->
<!-- test: file profile-v1.aon -->
```aontu
profile: close({
  id: string & re("^C[0-9]{7}$")
  email: string
  tier: "standard" | "premium" | "enterprise"
})
```

and a proposed `profile-v2.aon` that adds one optional key:

<!-- test: file profile-v2.aon -->
```aontu
profile: close({
  id: string & re("^C[0-9]{7}$")
  email: string
  tier: "standard" | "premium" | "enterprise"
  locale?: string
})
```

Now ask whether the proposal breaks anybody:

<!-- test: run -->
```sh
$ aontu breaking --against profile-v1.aon profile-v2.aon
verdict: compatible
```

Additive and optional, so every v1-valid document is still admitted.
A proposal that *requires* a new key is a different story — write it
as `require-owner.aon`:

<!-- test: file require-owner.aon -->
```aontu
profile: close({
  id: string & re("^C[0-9]{7}$")
  email: string
  tier: "standard" | "premium" | "enterprise"
  locale?: string
  owner: string
})
```

<!-- test: run -->
```sh
$ aontu breaking --against profile-v2.aon require-owner.aon
verdict: breaking

$.profile.owner: compat_required_added [compat]
  the general value requires this key; the specific value admits instances without it
  expected: string
  actual:   {"email":string,"id":re("^C[0-9]{7}$"),"locale"?:string,"tier":"standard"|"premium"|"enterprise"}
  general: require-owner.aon:6:10 (string)
  specific: profile-v2.aon:1:10 ({"email":string,"id":re("^C[0-9]{7}$"),"locale"?:string,"tier":"standard"|"premium"|"enterprise"})
$ echo $?
1
```

Every old document that omitted `owner` is now refused, and the
finding names the key and both versions' sites. Narrowing an existing
field breaks the same way (`compat_narrowed`): tightening `email` to
a pattern rejects any v1 document with a plain string there.

## The query underneath

`breaking` is [subsumption](../reference-language.md#subsumption)
pointed at history: the new version must **subsume** the old — admit
every instance the old admitted. The query is a verb of its own when
you want to compare two arbitrary documents rather than versions:

<!-- test: run -->
```sh
$ aontu subsume profile-v2.aon profile-v1.aon
verdict: subsumes
```

The general document goes first, the specific second. The same query
is a library export in both ports (`subsume` / `aontu.Subsume`) for
programmatic gates.

## In CI

`--against` also takes `git#<rev>`, so the gate needs no copies of
old versions lying around — it materialises the revision's tree and
evaluates the old document from there, includes and all:

<!-- test: skip requires a git checkout; the live version is use-cases/04-schema-evolution/check.sh -->
```sh
$ aontu breaking --against git#HEAD profile.aon
```

One line then gates every pull request against the branch it merges
into:

<!-- test: skip CI configuration; not executable here -->
```yaml
- run: aontu breaking --against git#origin/main profile.aon
```

## What to watch for

Exit `1` means a previously valid document is now refused. Exit `3`
means the query could not decide (always with a `sub_*` reason
naming why), and it **fails the gate** unless you pass
`--allow-undecided`; a gate that shrugs is not a gate. Two more
flags earn their keep in practice: `--at <path>` anchors the
comparison at the contract, so a version string at the top level
stops self-breaking the gate on every release, and
`--allow-deprecated-removal` admits the removal of a field the old
version already marked `deprecate()` — the supported rename path.
All of it is specified under [`aontu
breaking`](../reference-api.md#aontu-breaking).

The live version is
[use-cases/04-schema-evolution](../../use-cases/04-schema-evolution/):
three released versions of a customer profile, every verdict above
asserted by its `check.sh`, the `git#HEAD` gate included. When a
change lands, [pin the new meaning](pin-a-document-hash.md) so
consumers can tell it moved.

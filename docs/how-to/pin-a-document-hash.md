---
description: Pin a document's meaning to one string with aontu hash, and detect when the meaning moves.
group: validate-evolve
order: 50
---

# Pin what a document means

A file hash moves when a comment moves. `aontu hash` prints one
string that identifies a document's *meaning*, so a lockfile, a
registry entry or an agent can say "this definition, this version"
and check the claim later. Write a small model as `system.aontu`:

<!-- test: scenario hash -->
<!-- test: file system.aontu -->
```aontu
services: { &: { replicas: *1|integer tier: *standard|string } }
services: auth: replicas: 3
services: billing: tier: premium
```

<!-- test: run -->
```sh
$ aontu hash system.aontu
aon1-kmZi3pPU2hnWQfwLnaFoC5iUtlrt6vbUzU7og-KxWJE
```

The `aon1-` prefix is a scheme id; the rest is a digest of the
document's canonical meaning after evaluation. Reorder the keys, add
comments and split entries apart, as `system-reordered.aontu` does:

<!-- test: file system-reordered.aontu -->
```aontu
# same meaning: keys reordered, comments added, one entry split
services: billing: tier: premium
services: auth: replicas: 3
services: { &: { replicas: *1|integer tier: *standard|string } }
```

<!-- test: run -->
```sh
$ aontu hash system-reordered.aontu
aon1-kmZi3pPU2hnWQfwLnaFoC5iUtlrt6vbUzU7og-KxWJE
```

Same pin. The document is evaluated standalone before hashing, so
even splitting it across files leaves the pin alone. Move the
template into its own `defaults.aontu`:

<!-- test: file defaults.aontu -->
```aontu
services: { &: { replicas: *1|integer tier: *standard|string } }
```

and load it from a two-line `system-split.aontu`:

<!-- test: file system-split.aontu -->
<!-- fmt: keep the split spelling the hash survives -->
```aontu
@"./defaults.aontu"
services: auth: replicas: 3
services: billing: tier: premium
```

<!-- test: run -->
```sh
$ aontu hash system-split.aontu
aon1-kmZi3pPU2hnWQfwLnaFoC5iUtlrt6vbUzU7og-KxWJE
```

The include is part of the evaluation, which also means the pin is
transitive: an edit two includes deep moves it.

## When the pin moves

Change what the document *means* and the string changes. Flip the
`replicas` default from 1 to 2, as `system-changed.aontu` does:

<!-- test: file system-changed.aontu -->
```aontu
services: { &: { replicas: *2|integer tier: *standard|string } }
services: auth: replicas: 3
services: billing: tier: premium
```

<!-- test: run -->
```sh
$ aontu hash system-changed.aontu
aon1-2kHqTOm6-XLy1j322NI3Wje3AEAgdN5K6OEZdLpor84
```

A stored pin is therefore a one-string staleness check: re-run the
verb, compare, and only re-read the document when the strings differ.
When one has moved and you want to see *what* moved, `--form` prints
the exact text the digest is taken over, which is the thing to diff:

<!-- test: run -->
```sh
$ aontu hash --form system.aontu
{"services":{&:{"replicas":*1|integer,"tier":*"standard"|string},"auth":{"replicas":3,"tier":*"standard"|string},"billing":{"replicas":*1|integer,"tier":"premium"}}}
```

The form carries marks the display canon omits (`close()`, `hide()`),
so two documents that render alike but close differently pin
differently. That is the point.

## A broken document has no pin

A document that does not evaluate has no meaning to identify, and a
hash of the wreck would agree with every other wreck. Give
`broken.aontu` an outright contradiction:

<!-- test: file broken.aontu -->
```aontu
port: 8080
port: 9090
```

<!-- test: run -->
```sh
$ aontu hash broken.aontu
aontu: broken.aontu does not evaluate on its own; nothing to hash
...
$ echo $?
4
```

Exit `4` with the engine's own refusal attached, so a pipeline that
pins on release fails on the release that broke.

The hash form and its guarantees are specified under [`aontu
hash`](../reference-api.md#aontu-hash). A pin also holds still across
a recursive definition's unrollings ([Define a recursive
schema](define-a-recursive-schema.md) shows one), and it pairs with
[the breaking gate](gate-schema-changes.md): `hash` says whether the
meaning moved, `breaking` says whether the move breaks anyone.

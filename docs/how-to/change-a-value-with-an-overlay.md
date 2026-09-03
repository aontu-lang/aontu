---
description: Append a change to an overlay file with aontu set, so the original document keeps its bytes and a bad change is refused before it lands.
group: query-change
order: 30
---

# Change a value with an overlay

The safest edit is the one that touches no existing file. `aontu set`
appends your change to an *overlay*—a second document unified with
the entry—so nothing is rewritten, no formatting is lost, and a
change that does not hold is refused before any file changes. Write
`system.aon`:

<!-- test: scenario change-overlay -->
<!-- test: file system.aon -->
```aontu
services: { &: { replicas:*1 | integer tier:*standard | string } }
services: auth: replicas: 3
services: billing: tier: premium
```

Now raise billing's replicas without opening the file:

<!-- test: run -->
```sh
$ aontu set '$.services.billing.replicas=2' --entry system.aon --overlay overlay.aon
verdict: valid
wrote: overlay.aon
```

A missing overlay is the empty overlay, and is created. It now holds
one path-flattened conjunct—the assignment as a chain of quoted
keys:

```aon
services: billing: replicas: 2
```

The entry and the overlay together are the changed document.
Unification is order-independent, so appending to a second file means
the same thing as writing into the first; to consume both, write an
`all.aon` that loads them:

<!-- test: file all.aon -->
```aontu
@"./system.aon"
@"./overlay.aon"
```

<!-- test: run -->
```sh
$ aontu all.aon
{
  "services": {
    "auth": {
      "replicas": 3,
      "tier": "standard"
    },
    "billing": {
      "replicas": 2,
      "tier": "premium"
    }
  }
}
```

Billing overrides its `*1` default; auth keeps its pin. Overriding a
default is the case `set` handles cleanly, because a default invites
a concrete peer. A pinned value does not:

<!-- test: run -->
```sh
$ aontu set '$.services.auth.replicas=5' --entry system.aon --overlay overlay.aon
verdict: invalid

$.services.auth.replicas: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.services.auth.replicas
  data: overlay.aon:2:33 (5)
  schema: system.aon:2:27 (3)
$ echo $?
1
```

The overlay is written only when the change holds, so this refusal
leaves it exactly as it was: a change you still have to think about
should not sit in your configuration while you do. The finding names
the site doing the pinning—`system.aon:3:24`, which [`aontu
why`](explain-a-value.md) will list as a contribution—and to
rewrite that literal rather than contradict it, [change the pinned
value](change-a-pinned-value.md).

`--dry-run` writes nothing either way and prints what would have been
written; exit codes are [`aontu
vet`](../reference-api.md#aontu-vet)'s verdict classes, so the verb
gates automation on its own. Keep the overlay *outside* the entry's
include graph—an entry that loads its own overlay counts every
change twice. The flag-by-flag contract is under [`aontu
set`](../reference-api.md#aontu-set), and the live version is
[use-cases/08-feature-flags](../../use-cases/08-feature-flags/),
where an ops overlay is written by `set --in-place` and never by
hand, and repeated writes of one path leave one line.

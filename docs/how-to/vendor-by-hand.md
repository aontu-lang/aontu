---
description: Bootstrap a module dependency without a fetch verb by copying its source tree into aon_vendor/ and letting aontu mod tidy pin what it means.
group: modules
order: 30
---

# Vendor a module by hand

There is no `aontu mod get`. The network verbs are named and refused
(see [vendor a dependency closure](vendor-a-dependency-closure.md)),
and the content-addressed user cache cannot be searched until a
lockfile pins a hash — so the cold start for every module dependency
is hand-vendoring: put the module's source tree into `aon_vendor/`
yourself, then let `tidy` pin it. `cp -r` is the distribution
protocol.

Start on the consumer side. The project declares the dependency in
its `mod.aon`:

<!-- test: scenario vendor-by-hand -->
<!-- test: file mod.aon -->
```aontu
mod: { path: "corp.example/app", main: "main.aon" }
dep: { "corp.example/schemas/service@1": { v: "1.0.0" } }
```

and the entry file `main.aon` imports it:

<!-- test: file main.aon -->
```aontu
svc: @"corp.example/schemas/service@1"
svc: name: "auth"
```

With nothing received yet, `tidy` refuses, and the fix it names is
the verb that does not ship:

<!-- test: run -->
```sh
$ aontu mod tidy
verdict: missing
corp.example/schemas/service@1: not fetched (run: aontu mod get)
$ echo $?
1
```

No lockfile is written; a partial lock would claim a closure that was
never resolved. So do the fetch's job by hand. The layout is
`aon_vendor/<module-path>@<major>/` beside your `mod.aon`: each
`/`-segment of the module path becomes a directory, and the last
carries the `@<major>` suffix:

```
project/
  mod.aon
  main.aon
  aon_vendor/
    corp.example/
      schemas/
        service@1/
          mod.aon
          service.aon
```

The directory holds the module's own source tree. Its
`aon_vendor/corp.example/schemas/service@1/mod.aon`:

<!-- test: file aon_vendor/corp.example/schemas/service@1/mod.aon -->
```aontu
mod: { path: "corp.example/schemas/service", version: "1.0.0", main: "service.aon" }
```

and its entry file,
`aon_vendor/corp.example/schemas/service@1/service.aon`:

<!-- test: file aon_vendor/corp.example/schemas/service@1/service.aon -->
```aontu
name: string
port: *8080 | integer
```

Now `tidy`, from the project root. It resolves the closure against
the hand-made tree, evaluates the module standalone, and locks its
canon-hash; evaluation then resolves the import:

<!-- test: run -->
```sh
$ aontu mod tidy
verdict: ok
corp.example/schemas/service@1 1.0.0 aon1-oQs6Ng6XxP2FHQGTYescREGDrDPfLLW1Liq4OS8Gs2E

$ aontu main.aon
{
  "svc": {
    "name": "auth",
    "port": 8080
  }
}
```

The pin is what the hand-vendoring was for. Every later evaluation
re-derives the vendored module's canon-hash and compares it to the
locked one, so a change to the module's evaluated meaning is refused
rather than silently used. Flip the vendored default in
`aon_vendor/corp.example/schemas/service@1/service.aon`:

<!-- test: file aon_vendor/corp.example/schemas/service@1/service.aon -->
```aontu
name: string
port: *9090 | integer
```

<!-- test: run -->
```sh
$ aontu main.aon
module integrity: corp.example/schemas/service@1 expected aon1-oQs6Ng6XxP2FHQGTYescREGDrDPfLLW1Liq4OS8Gs2E got aon1-Bd4OQlOyzyJcXZvYbVcV7NZbMJGGxQH6GtNctkC26VA
$ echo $?
1
```

Both hashes are named: the meaning that was reviewed and the meaning
the store now holds. Be precise about what that pin protects. It is a
semantic pin, taken over the canonical form of the module's entry
document and its include closure; comments, whitespace, refactored
spellings that canon to the same value, `mod.aon` metadata, and files
the entry never includes all keep the hash, deliberately. Byte-level
integrity of a distributed artifact is the `oci` digest's job (the
lockfile carries both pins — see the [language
reference](../reference-language.md#modules)); the canon pin answers
"has the truth changed?", not "are these the same bytes?".

## In CI, verify — do not tidy

`tidy` rewrites the lockfile from whatever the store currently holds,
so a job that tidies before evaluating makes the lock agree with a
tampered store and then passes. `aontu mod verify` asks the question
without answering it by editing — against the still-tampered store:

<!-- test: run -->
```sh
$ aontu mod verify
verdict: mismatch
corp.example/schemas/service@1: pinned aon1-oQs6Ng6XxP2FHQGTYescREGDrDPfLLW1Liq4OS8Gs2E but the store means aon1-Bd4OQlOyzyJcXZvYbVcV7NZbMJGGxQH6GtNctkC26VA
$ echo $?
1
```

It recomputes every pin, compares against the committed lockfile,
writes nothing, and exits `1` on any disagreement. Run it beside your
tests ([validate in CI](validate-in-ci.md) is the surrounding job);
run `tidy` only when you intend to move a pin, and review its diff
like code. Nothing to check is not a pass, either. Take a project
that declares the dependency but never committed a lockfile — only
its `mod.aon`:

<!-- test: scenario verify-unlocked -->
<!-- test: file mod.aon -->
```aontu
mod: { path: "corp.example/app", main: "main.aon" }
dep: { "corp.example/schemas/service@1": { v: "1.0.0" } }
```

<!-- test: run -->
```sh
$ aontu mod verify
verdict: unlocked
corp.example/schemas/service@1: not in the lockfile (run: aontu mod tidy)
$ echo $?
1
```

An uncovered project is refused rather than verified over an empty
set, and the line names the repair.

## A module with its own dependencies vendors flat

A vendored module carries its own `mod.aon` and may declare its own
`dep`. Its imports resolve from its own directory and from every
enclosing project root, so its dependency goes in the same
`aon_vendor/` tree, beside it — never nested inside it:

```
project/
  mod.aon
  aon_vendor/
    corp.example/
      schemas/
        service@1/         # imports common@1
          mod.aon
          service.aon
        common@1/          # flat beside it, not nested inside it
          mod.aon
          common.aon
```

Declaring only the top of the closure is enough, because `tidy` walks
the rest. A consumer `mod.aon`:

<!-- test: scenario vendor-transitive -->
<!-- test: file mod.aon -->
```aontu
mod: { path: "corp.example/app", main: "main.aon" }
dep: { "corp.example/schemas/service@1": { v: "1.0.0" } }
```

its entry `main.aon`:

<!-- test: file main.aon -->
```aontu
svc: @"corp.example/schemas/service@1"
svc: name: "auth"
```

a hand-vendored
`aon_vendor/corp.example/schemas/service@1/mod.aon` that declares a
dependency of its own:

<!-- test: file aon_vendor/corp.example/schemas/service@1/mod.aon -->
```aontu
mod: { path: "corp.example/schemas/service", version: "1.0.0", main: "service.aon" }
dep: { "corp.example/schemas/common@1": { v: "1.0.0" } }
```

and its entry
`aon_vendor/corp.example/schemas/service@1/service.aon`, importing
it:

<!-- test: file aon_vendor/corp.example/schemas/service@1/service.aon -->
```aontu
@"corp.example/schemas/common@1"
name: string
port: *8080 | integer
```

With `common@1` not yet vendored, `tidy` refuses the whole closure:

<!-- test: run -->
```sh
$ aontu mod tidy
verdict: error
corp.example/schemas/service@1: does not evaluate on its own; nothing to pin
corp.example/schemas/common@1: not fetched (run: aontu mod get)
$ echo $?
4
```

A module that does not evaluate on its own is refused rather than
pinned, because every module that fails to evaluate hashes to the
same string — a lockfile written from one would look like a pin and
mean nothing. (`aontu hash` refuses the same file with the same
wording.) Vendor the dependency flat beside its dependant:
`aon_vendor/corp.example/schemas/common@1/mod.aon`:

<!-- test: file aon_vendor/corp.example/schemas/common@1/mod.aon -->
```aontu
mod: { path: "corp.example/schemas/common", version: "1.0.0", main: "common.aon" }
```

with its entry, a shared naming vocabulary, as
`aon_vendor/corp.example/schemas/common@1/common.aon`:

<!-- test: file aon_vendor/corp.example/schemas/common@1/common.aon -->
```aontu
name: string & re("^[a-z][a-z0-9-]*$")
```

and the closure resolves, both modules pinned:

<!-- test: run -->
```sh
$ aontu mod tidy
verdict: ok
corp.example/schemas/common@1 1.0.0 aon1-btDT9RfDGjP4uvd5osF3R3mRW5aIeDz49_JbJpVLDwU
corp.example/schemas/service@1 1.0.0 aon1-GublSGsGCwYBgyQBAZSk9imd7xfbeCYKY6qbud8okdc

$ aontu main.aon
{
  "svc": {
    "name": "auth",
    "port": 8080
  }
}
```

One caution to carry away: the first copy is trusted axiomatically.
There is no published hash to compare a hand-vendored tree against,
so review what you vendor as if it were your own code; every copy
after that is held to the first by the pin. The verbs' full contract
is [`aontu mod`](../reference-api.md#aontu-mod), and the live version
of all of this (tamper, refactor-stable hashes, trust confinement,
the publish gate, 33 assertions) is
[use-cases/11-shared-modules](../../use-cases/11-shared-modules/).

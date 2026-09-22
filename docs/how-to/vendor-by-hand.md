---
description: Bootstrap a module dependency with no repository to fetch from by copying its source tree into aontu_meta/vendor/ and letting aontu sync pin what it means.
group: modules
order: 30
---

# Vendor a module by hand

`aontu sync` fetches a package from a repository, and a package that
was never published to one cannot be fetched. The content-addressed
user cache cannot be searched until a lockfile pins a hash, either, so
the cold start for a package that lives only in a colleague's checkout
is hand-vendoring: put its source tree into `aontu_meta/vendor/`
yourself, then let `sync` pin it. `cp -r` is the distribution protocol.

Start on the consumer side. The project declares the dependency in
its `pkg.aontu`:

<!-- test: scenario vendor-by-hand -->
<!-- test: file pkg.aontu -->
```aontu
pkg: { path:"corp.example/app" main:"main.aontu" }
dep: "corp.example/schemas/service": v: "1.0.0"
```

and the entry file `main.aontu` imports it:

<!-- test: file main.aontu -->
```aontu
svc: @"corp.example/schemas/service"
svc: name: "auth"
```

With nothing received yet, `aontu pkg tidy`, the resolve step that
fetches nothing, refuses and names the module:

<!-- test: run -->
```sh
$ aontu pkg tidy
verdict: missing
corp.example/schemas/service: not fetched (run: aontu sync)
$ echo $?
1
```

No lockfile is written; a partial lock would claim a closure that was
never resolved. So do the fetch's job by hand. The layout is
`aontu_meta/vendor/<package-path>/` under your project, beside its
`pkg.aontu`: each `/`-segment of the package path becomes a directory,
and an uppercase letter is written `!` followed by its lowercase:

```
project/
  pkg.aontu
  main.aontu
  aontu_meta/
    vendor/
      corp.example/
        schemas/
          service/
            pkg.aontu
            service.aontu
```

The directory holds the package's own source tree. Its
`aontu_meta/vendor/corp.example/schemas/service/pkg.aontu`:

<!-- test: file aontu_meta/vendor/corp.example/schemas/service/pkg.aontu -->
```aontu
pkg: path: "corp.example/schemas/service"
pkg: version: "1.0.0"
pkg: main: "service.aontu"
```

and its entry file,
`aontu_meta/vendor/corp.example/schemas/service/service.aontu`:

<!-- test: file aontu_meta/vendor/corp.example/schemas/service/service.aontu -->
```aontu
name: string
port: *8080|integer
```

Now `sync`, from the project root. It finds the hand-made tree at the
version the project asked for, evaluates the module standalone, locks
its canon-hash and the digest of its archive, and verifies both;
evaluation then resolves the import:

<!-- test: run -->
```sh
$ aontu sync
verdict: ok
corp.example/schemas/service 1.0.0 aon1-oQs6Ng6XxP2FHQGTYescREGDrDPfLLW1Liq4OS8Gs2E

$ aontu main.aontu
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
`aontu_meta/vendor/corp.example/schemas/service/service.aontu`:

<!-- test: file aontu_meta/vendor/corp.example/schemas/service/service.aontu -->
```aontu
name: string
port: *9090|integer
```

<!-- test: run -->
```sh
$ aontu main.aontu
module integrity: corp.example/schemas/service expected aon1-oQs6Ng6XxP2FHQGTYescREGDrDPfLLW1Liq4OS8Gs2E got aon1-Bd4OQlOyzyJcXZvYbVcV7NZbMJGGxQH6GtNctkC26VA
$ echo $?
1
```

Both hashes are named: the meaning that was reviewed and the meaning
the store now holds. Be precise about what that pin protects. It is a
semantic pin, taken over the canonical form of the module's entry
document and its include closure; comments, whitespace, refactored
spellings that canon to the same value, `pkg.aontu` metadata, and files
the entry never includes all keep the hash, deliberately. The bytes are
the `archive` pin's job, and the tooling checks that one first.

<a id="in-ci-verifydo-not-tidy"></a>

## In CI, verify: do not tidy

`tidy` rewrites the lockfile from whatever the store currently holds,
so a job that tidies before evaluating makes the lock agree with a
tampered store and then passes. `aontu pkg verify` asks the question
without answering it by editing: against the still-tampered store, the
bytes are checked before the meaning, so it is the archive pin that
speaks:

<!-- test: run -->
```sh
$ aontu pkg verify
verdict: mismatch
corp.example/schemas/service: pinned archive sha256:5329cc3fa261177d3ed41b8245e0b68b8a0efc18b0721f0d9eb27533bdc654af but the store holds sha256:4ee5283f7794083afa842addc12067c28b5063c8e0fa8a5d96be8c638969a851
$ echo $?
1
```

It recomputes every pin, compares against the committed lockfile,
writes nothing, and exits `1` on any disagreement. Run it beside your
tests ([validate in CI](validate-in-ci.md) is the surrounding job), or
run `aontu sync --frozen`, which refuses the same way and fetches what
a locked version needs; run `sync` without the flag only when you
intend to move a pin, and review its diff like code. Nothing to check
is not a pass, either. Take a project that declares the dependency but
never committed a lockfile: only its `pkg.aontu`:

<!-- test: scenario verify-unlocked -->
<!-- test: file pkg.aontu -->
```aontu
pkg: { path:"corp.example/app" main:"main.aontu" }
dep: "corp.example/schemas/service": v: "1.0.0"
```

<!-- test: run -->
```sh
$ aontu pkg verify
verdict: unlocked
corp.example/schemas/service: not in the lockfile (run: aontu sync)
$ echo $?
1
```

An uncovered project is refused rather than verified over an empty
set, and the line names the repair.

## A package with its own dependencies vendors flat

A vendored package carries its own `pkg.aontu` and may declare its own
`dep`. Its imports resolve from its own directory and from every
enclosing project root, so its dependency goes in the same
`aontu_meta/vendor/` tree, beside it: never nested inside it:

```
project/
  pkg.aontu
  aontu_meta/
    vendor/
      corp.example/
        schemas/
          service/         # imports common
            pkg.aontu
            service.aontu
          common/          # flat beside it, not nested inside it
            pkg.aontu
            common.aontu
```

Declaring only the top of the closure is enough, because `sync` walks
the rest. A consumer `pkg.aontu`:

<!-- test: scenario vendor-transitive -->
<!-- test: file pkg.aontu -->
```aontu
pkg: { path:"corp.example/app" main:"main.aontu" }
dep: "corp.example/schemas/service": v: "1.0.0"
```

its entry `main.aontu`:

<!-- test: file main.aontu -->
```aontu
svc: @"corp.example/schemas/service"
svc: name: "auth"
```

a hand-vendored
`aontu_meta/vendor/corp.example/schemas/service/pkg.aontu` that declares a
dependency of its own:

<!-- test: file aontu_meta/vendor/corp.example/schemas/service/pkg.aontu -->
```aontu
pkg: path: "corp.example/schemas/service"
pkg: version: "1.0.0"
pkg: main: "service.aontu"

dep: "corp.example/schemas/common": v: "1.0.0"
```

and its entry
`aontu_meta/vendor/corp.example/schemas/service/service.aontu`, importing
it:

<!-- test: file aontu_meta/vendor/corp.example/schemas/service/service.aontu -->
```aontu
@"corp.example/schemas/common"
name: string
port: *8080|integer
```

With `common` not yet vendored, `tidy` refuses the whole closure:

<!-- test: run -->
```sh
$ aontu pkg tidy
verdict: error
corp.example/schemas/service: does not evaluate on its own; nothing to pin
corp.example/schemas/common: not fetched (run: aontu sync)
$ echo $?
4
```

A module that does not evaluate on its own is refused rather than
pinned, because every module that fails to evaluate hashes to the
same string: a lockfile written from one would look like a pin and
mean nothing. (`aontu hash` refuses the same file with the same
wording.) Vendor the dependency flat beside its dependant:
`aontu_meta/vendor/corp.example/schemas/common/pkg.aontu`:

<!-- test: file aontu_meta/vendor/corp.example/schemas/common/pkg.aontu -->
```aontu
pkg: { path:"corp.example/schemas/common" version:"1.0.0" main:"common.aontu" }
```

with its entry, a shared naming vocabulary, as
`aontu_meta/vendor/corp.example/schemas/common/common.aontu`:

<!-- test: file aontu_meta/vendor/corp.example/schemas/common/common.aontu -->
```aontu
name: string & re("^[a-z][a-z0-9-]*$")
```

and the closure resolves, both packages pinned:

<!-- test: run -->
```sh
$ aontu sync
verdict: ok
corp.example/schemas/common 1.0.0 aon1-btDT9RfDGjP4uvd5osF3R3mRW5aIeDz49_JbJpVLDwU
corp.example/schemas/service 1.0.0 aon1-GublSGsGCwYBgyQBAZSk9imd7xfbeCYKY6qbud8okdc

$ aontu main.aontu
{
  "svc": {
    "name": "auth",
    "port": 8080
  }
}
```

One caution to carry away: the first copy is trusted axiomatically.
There is no signed manifest to compare a hand-vendored tree against,
so review what you vendor as if it were your own code; every copy
after that is held to the first by the pins. A package that has been
published carries its publisher's proof instead: that is
[publish a package](publish-a-package.md). The verbs' full contract is
[`aontu sync`](../reference-api.md#aontu-sync) and
[`aontu pkg`](../reference-api.md#aontu-pkg), and the live version of
all of this (tamper, refactor-stable hashes, trust confinement, the
publish gate) is
[use-cases/11-shared-modules](../../use-cases/11-shared-modules/).

# Tutorial: share a model as a package

A schema two projects need gets copied into both, and from that moment
there are two schemas. This tutorial takes one model out of its
repository and gives it a version, a signature and a hash, so the
second project imports it instead of copying it, and a later change to
what it means is refused rather than absorbed.

Everything here runs on one machine, with no network: the package
repository is a directory. The one step that needs a listening process
is described in [§9](#9-where-the-network-comes-in) and left to its
guide.

Commands are written as `aontu`; from a clone, `node ts/bin/aontu.js`
stands in. Every result on this page is the engine's own.

## 1. The model two projects need

Money has two fields and one rule that should exist in exactly one
place. Save this as `rates/rates.aon`:

<!-- test: scenario share-a-package -->
<!-- test: file rates/rates.aon -->
```aontu
currency: string & re("^[A-Z]{3}$")
amount: bigdecimal
```

`re` bounds a string by a pattern, and `bigdecimal` is the exact
decimal leaf from
[§5 of the first tutorial](tutorial-config.md#5-exact-numbers-with-0d):
a price is not a `float`. A document of your own can be checked against
it. Save one as `price.aon`:

<!-- test: file price.aon -->
```aontu
currency: "eur"
amount: 0d19.99
```

and [vet](reference-api.md#aontu-vet) it:

<!-- test: run -->
```sh
$ aontu vet rates/rates.aon price.aon
verdict: invalid

$.currency: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.currency
  expected: re("^[A-Z]{3}$")
  actual:   "eur"
  data: price.aon:1:11 ("eur")
  schema: rates/rates.aon:1:20 (re("^[A-Z]{3}$"))
$ echo $?
1
```

That is the value of the rule and the reason to share it: a lowercase
currency code is caught in one line, in whichever project asks. Fix the
data, in `price.aon`:

<!-- test: file price.aon -->
```aontu
currency: "EUR"
amount: 0d19.99
```

<!-- test: run -->
```sh
$ aontu vet rates/rates.aon price.aon
verdict: valid
```

## 2. Make it a package

A **module** is what an import names. A **package** is what you
publish: a versioned archive of one or more modules. Both words are
about to appear, and they are not synonyms.

A package declares itself in a `pkg.aon` beside its sources. Write
`rates/pkg.aon`:

<!-- test: file rates/pkg.aon -->
```aontu
pkg: { path:"corp.example/schemas/rates" version:"1.0.0" main:"rates.aon" }
publish: public
```

Four facts, and no more: the `path` importers will write, the `version`
this release carries, the `main` file an import of the bare path
resolves to, and `publish: public`, which is the package saying it may
leave the machine. The path's first segment carries a dot, which is
what separates a module import from a file path.

## 3. Publish it into a directory

A publish is signed, so there is a key first. `aontu pkg keygen` mints
one and prints the public half, which is the id a consumer names:

<!-- test: run -->
```sh
$ aontu pkg keygen key.pem
...
```

Keep `key.pem` where a build job can read it and nobody else can. Now
publish, into a directory called `repo`. Without `--yes` every check
runs and nothing is sent:

<!-- test: run -->
```sh
$ aontu publish --key key.pem --to repo rates
verdict: dry-run
corp.example/schemas/rates 1.0.0 public
archive: sha256:171e30a516146c364a20ddb7291cf9c9856fecb6b6223f5f29e8cdfb63096dcf (2 files, 353 bytes)
module: corp.example/schemas/rates rates.aon aon1-vO_nsrLAdRBPpq8Vi8G_FgDDMWmoVGRjm6eZThS0QHA
file: pkg.aon sha256:0f2e3cb9456aede3ec8e9fa99e5a1dd2c4bb5376b7ca23871e2f6aa9516773c0 92
file: rates.aon sha256:fed42fa726c3df4155c84dd35e690383b8a1a07d7f05a0544168a7f487c524d2 55
...
dry run: nothing sent (add --yes)
```

Two of those lines are the ones to keep your eye on. `archive` is the
digest of the bytes; `module` is the **canon-hash**, `aon1-…`, which is
what the module MEANS after evaluation. They answer different
questions, and both are about to be pinned. Send it:

<!-- test: run -->
```sh
$ aontu publish --yes --key key.pem --to repo rates
verdict: sent
...
sent
```

`repo` now holds the layout a consumer reads:

```
repo/
  pkg/corp.example/schemas/rates/
    @latest
    @v/
      list
      1.0.0.zip        the archive
      1.0.0.manifest   what it holds, file by file, and what it means
      1.0.0.sig        the proof, over the manifest
  advisory/corp.example/schemas/rates.aon
```

Nothing in that directory was evaluated by the repository, and a
consumer trusts none of it for more than availability: every pin is
recomputed on the way in.

## 4. Take it on, in another project

The consumer is a second project, beside the first. Its `checkout/pkg.aon`
names itself and what it depends on:

<!-- test: file checkout/pkg.aon -->
```aontu
pkg: { path:"corp.example/checkout" main:"main.aon" }
dep: "corp.example/schemas/rates": v: "1.0.0"
```

The `v` is a **minimum**, not a pin: the lockfile pins, and §5 writes
it. The entry document imports the module and adds its own facts.
Write `checkout/main.aon`:

<!-- test: file checkout/main.aon -->
```aontu
price: @"corp.example/schemas/rates"
price: { currency:"EUR" amount:0d19.99 }
```

Those two lines are what the exercise is for: the schema arrives by
import and the data meets it in the [ordinary way](unification.md).
Nothing has been received yet, though, and `aontu pkg tidy`, the
resolve step that fetches nothing, says so:

<!-- test: run -->
```sh
$ aontu pkg tidy checkout
verdict: missing
corp.example/schemas/rates: not fetched (run: aontu sync)
$ echo $?
1
```

No lockfile was written: a partial lock would claim a closure that was
never resolved. The hint names the arrangement in
[§9](#9-where-the-network-comes-in), where a repository answers; here
§5 puts the copy in place by hand instead.

## 5. Vendor the tree, and lock what it means

The consumer's copy of a package lives in its own project, under
`aontu_meta/vendor/<package path>/`, one directory per path segment.
Put the package's source tree there. Its
`checkout/aontu_meta/vendor/corp.example/schemas/rates/pkg.aon`:

<!-- test: file checkout/aontu_meta/vendor/corp.example/schemas/rates/pkg.aon -->
```aontu
pkg: { path:"corp.example/schemas/rates" version:"1.0.0" main:"rates.aon" }
publish: public
```

and its
`checkout/aontu_meta/vendor/corp.example/schemas/rates/rates.aon`:

<!-- test: file checkout/aontu_meta/vendor/corp.example/schemas/rates/rates.aon -->
```aontu
currency: string & re("^[A-Z]{3}$")
amount: bigdecimal
```

That is a copy and nothing more: `cp -r` of the published tree. §9 is
where a repository does the copying for you. Either way, `sync` is what
turns a copy into a dependency:

<!-- test: run -->
```sh
$ aontu sync checkout
verdict: ok
corp.example/schemas/rates 1.0.0 aon1-vO_nsrLAdRBPpq8Vi8G_FgDDMWmoVGRjm6eZThS0QHA
```

That hash is the one the publish printed. `sync` resolved the closure,
evaluated the module on its own, and wrote one canonical line to
`checkout/aontu_meta/pkg-lock.aon`:

```
# pkg-lock.aon (generated by `aontu sync`; do not edit)
{"lock":{"corp.example/schemas/rates":{"archive":"sha256:171e30a516146c364a20ddb7291cf9c9856fecb6b6223f5f29e8cdfb63096dcf","canon":"aon1-vO_nsrLAdRBPpq8Vi8G_FgDDMWmoVGRjm6eZThS0QHA","v":"1.0.0"}}}
```

One line, JSON-parseable, and diffable like code. Commit it together
with `aontu_meta/vendor/`: that pair is the build, on a machine with no
network.

## 6. Evaluate with nothing but the project

<!-- test: run -->
```sh
$ aontu checkout/main.aon
{
  "price": {
    "amount": 19.99,
    "currency": "EUR"
  }
}
```

The import resolved from the vendor tree, the pattern held, and
`0d19.99` reached the output exactly. Ask why the package is in the
closure and the answer is a path of requirements:

<!-- test: run -->
```sh
$ aontu why corp.example/schemas/rates checkout
verdict: ok
corp.example/checkout -> corp.example/schemas/rates
```

One hop, because the project asked for it directly. A package pulled in
by a dependency of a dependency prints the chain that reaches it.

## 7. The pin earns its keep

Here is the part a copied file cannot do. Someone relaxes the vendored
schema, perhaps to get a build through. Rewrite
`checkout/aontu_meta/vendor/corp.example/schemas/rates/rates.aon`:

<!-- test: file checkout/aontu_meta/vendor/corp.example/schemas/rates/rates.aon -->
```aontu
currency: string
amount: bigdecimal
```

The data still satisfies it, so nothing about the document is wrong.
Evaluate anyway:

<!-- test: run -->
```sh
$ aontu checkout/main.aon
module integrity: corp.example/schemas/rates expected aon1-vO_nsrLAdRBPpq8Vi8G_FgDDMWmoVGRjm6eZThS0QHA got aon1-wixJdyL2g90c1HaWaoBKBpHA6da7Hn-MEikz6LW-BVI
$ echo $?
1
```

Both hashes are named: the meaning that was reviewed, and the meaning
the store holds now. `aontu pkg verify` asks the same question without
evaluating anything, and answers on the bytes, which are checked before
the meaning:

<!-- test: run -->
```sh
$ aontu pkg verify checkout
verdict: mismatch
corp.example/schemas/rates: pinned archive sha256:171e30a516146c364a20ddb7291cf9c9856fecb6b6223f5f29e8cdfb63096dcf but the store holds sha256:62be1cd19a5db54c374a3b0539ec0973ae66bbb0b5d2411f28fbba3eb7a1e716
$ echo $?
1
```

That is the command for a build job: it recomputes every pin, writes
nothing, and exits `1` on any disagreement. Put
`checkout/aontu_meta/vendor/corp.example/schemas/rates/rates.aon`
back:

<!-- test: file checkout/aontu_meta/vendor/corp.example/schemas/rates/rates.aon -->
```aontu
currency: string & re("^[A-Z]{3}$")
amount: bigdecimal
```

<!-- test: run -->
```sh
$ aontu pkg verify checkout
verdict: ok
corp.example/schemas/rates: verified
```

Be precise about what the canon-hash protects. It is taken over what
the module MEANS, so comments, whitespace, and a rewrite that canons
to the same value all keep it, deliberately. The bytes are the
`archive` pin's job, and it is the stricter of the two: a comment
added to a vendored file keeps the meaning and still fails
`aontu pkg verify`, which is why a vendored tree is re-vendored rather
than edited.

## 8. The next version is gated on this one

Back in the package. Currencies differ in how many decimal places they
carry, so `rates.aon` gains a field. Rewrite `rates/rates.aon`:

<!-- test: file rates/rates.aon -->
```aontu
currency: string & re("^[A-Z]{3}$")
amount: bigdecimal
precision?: integer
```

The `?` makes the key optional, so a document that never mentions it
still holds. Bump the version in `rates/pkg.aon`:

<!-- test: file rates/pkg.aon -->
```aontu
pkg: { path:"corp.example/schemas/rates" version:"1.0.1" main:"rates.aon" }
publish: public
```

and publish. `publish` fetches the highest version the repository
already holds and compares the two:

<!-- test: run -->
```sh
$ aontu publish --yes --key key.pem --to repo rates
verdict: sent
corp.example/schemas/rates 1.0.1 public
...
against: corp.example/schemas/rates 1.0.0
...
sent
```

`against` names what it was gated on. Now make the same field
required, which is the edit that feels like a tidy-up and is not.
Rewrite `rates/rates.aon`:

<!-- test: file rates/rates.aon -->
```aontu
currency: string & re("^[A-Z]{3}$")
amount: bigdecimal
precision: integer
```

with `rates/pkg.aon` at a new minor version:

<!-- test: file rates/pkg.aon -->
```aontu
pkg: { path:"corp.example/schemas/rates" version:"1.1.0" main:"rates.aon" }
publish: public
```

<!-- test: run -->
```sh
$ aontu publish --yes --key key.pem --to repo rates
verdict: breaking
corp.example/schemas/rates 1.1.0 public
...
$.precision: the general value requires this key; the specific value makes it optional, so instances without it are admitted
...
$ echo $?
1
```

Refused, at the key it refuses on, and nothing was written. The two
names in that message are the sides of the question: the candidate is
the general value, the version already published is the specific one,
and a release ships only when the candidate admits every instance its
predecessor did. Every 1.0.1 consumer with no `precision` would stop
evaluating, and no version number lifts the gate: a break ships as a
new package path, and [modules](reference-language.md#modules) has the
`moved` declaration that retires the old one.

Meanwhile `checkout` is untouched at 1.0.0, because its lockfile says
so. `aontu get corp.example/schemas/rates@1.0.1` is how it moves, when
it chooses to, and it needs a repository to reach: the arrangement in
[§9](#9-where-the-network-comes-in), or a fresh vendored copy and
`aontu sync`.

## 9. Where the network comes in

Every command above ran against a directory, which is why this page
needs none. A colleague cannot read your directory, though, so the
arrangement between two machines serves it instead: `aontu pkg serve
repo` serves the same bytes over HTTP on a loopback address and runs
until interrupted, which is the one thing a transcript cannot show. A
consumer then names the base and the signer it accepts, in its own
`pkg.aon`:

<!-- test: skip the consumer of a served repository; §5 runs the vendored form -->
```aontu
pkg: { path:"corp.example/checkout" main:"main.aon" }
dep: "corp.example/schemas/rates": v: "1.0.0"

repo: base: ["http://127.0.0.1:8017"]
repo: trust: "corp.example/*": { signer:"ed25519:…" inclusion:none }
```

and `aontu sync` fetches the archive, the manifest and the proof,
checks the proof, then the bytes, then the meaning, and refuses at the
first that does not hold. What it writes is the lockfile and the
vendor tree from §5, with one pin more: `manifest`, the digest of what
the publisher signed. The rest of the page is unchanged, which is the
reason it was worth learning in this order.

Evaluation never reaches the network in either arrangement. An `@"…"`
import resolves from the vendor tree and a local cache, and from
nowhere else.

## Where to go next

Your model is now a thing with a version, and the two questions that
follow are what to pin it against and who may move it:

- The recipes, each one task: [publish a
  package](how-to/publish-a-package.md) with a served repository and a
  trust stanza, [vendor a dependency
  closure](how-to/vendor-a-dependency-closure.md) for the frozen CI
  form, [vendor a module by hand](how-to/vendor-by-hand.md) for a
  package that was never published, and [gate schema
  changes](how-to/gate-schema-changes.md) for the compatibility query
  §8 ran, asked of two documents rather than two versions.
- The rules in full: [`aontu sync`](reference-api.md#aontu-sync),
  [`aontu publish`](reference-api.md#aontu-publish),
  [`aontu pkg`](reference-api.md#aontu-pkg), and
  [modules](reference-language.md#modules) for how an import resolves.
- The live version, cold start through tamper, trust confinement and
  the publish gate, with a `check.sh` that drives all of it:
  [use-cases/11-shared-modules](../use-cases/11-shared-modules/).
- The other tutorials: [from a model to a file
  tree](tutorial-generate.md) computes source files from the model you
  just shared, and the [tutorials index](tutorial.md) lists all four.

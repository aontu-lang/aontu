---
description: Publish a package with aontu publish, gated on compatibility with the version before it, into a local repository that aontu pkg serve serves and aontu sync reads.
group: modules
order: 40
---

# Publish a package

A package is a versioned, signed archive of a module. Publishing one
sends three objects to a repository: the manifest that describes the
archive file by file and pins what the module means, a proof that
signs the manifest, and the archive itself. A consumer's `sync` fetches
the three, checks the proof, the bytes and the meaning in that order,
and refuses at the first that does not hold. This guide publishes into
a directory, which is a repository a laptop can serve, and gates the
next version on the one before it.

The package declares its path, its version, its entry, and that it may
leave the machine. Its `service/pkg.aon`:

<!-- test: scenario publish -->
<!-- test: file service/pkg.aon -->
```aontu
pkg: { path:"corp.example/schemas/service" version:"1.4.2" main:"service.aon" }
publish: public
```

and its entry, `service/service.aon`:

<!-- test: file service/service.aon -->
```aontu
name: string
port: *8080|integer
```

A publish is signed. The key is an Ed25519 private key in PKCS#8 PEM,
and `aontu pkg keygen` mints one, once, printing the signer id that a
consumer will name:

<!-- test: run -->
```sh
$ aontu pkg keygen key.pem
...
```

The line is `signer: ed25519:…`, the public half of the key. Keep the
file where a CI job can read it and nobody else can; the id is not a
secret.

## A dry run, then the publish

Without `--yes`, `publish` runs every check and sends nothing. `--to`
names a directory to publish into instead of the write path:

<!-- test: run -->
```sh
$ aontu publish --key key.pem --to repo service
verdict: dry-run
corp.example/schemas/service 1.4.2 public
archive: sha256:8a26b9f1b78620c8d452e69e9681a31027df431c833896bc98545627e6df3016 (2 files, 339 bytes)
module: corp.example/schemas/service service.aon aon1-oQs6Ng6XxP2FHQGTYescREGDrDPfLLW1Liq4OS8Gs2E
file: pkg.aon sha256:7cc6671240e0c5f327dad20a10361edb98c687430eeadc9fc3d9604e287a11f4 96
file: service.aon sha256:36851584bea3d7109995deae363852734aca001c9e494b8868d736c5c49e7275 33
...
dry run: nothing sent (add --yes)
```

Read it top to bottom: the package and version, the archive's digest
and what it holds, the module's canon-hash, then the manifest's digest,
the signer, and where it would go. Then send it:

<!-- test: run -->
```sh
$ aontu publish --yes --key key.pem --to repo service
verdict: sent
...
sent
```

The directory now holds the read-path layout: `pkg/<path>/@v/` with
the archive, manifest and proof, the version list and `@latest`, and
an advisory. It is a repository. Nothing in it was evaluated by the
repository, and nothing in it is trusted by a consumer for more than
availability: the consumer recomputes every pin.

## The gate

The version after this one must admit every document this one
admitted, and resolve every position this one resolved, to the same
value: a consumer whose build worked keeps the same build. `publish`
fetches the highest version the repository holds and compares. A
candidate `service-1.4.3/pkg.aon`:

<!-- test: file service-1.4.3/pkg.aon -->
```aontu
pkg: { path:"corp.example/schemas/service" version:"1.4.3" main:"service.aon" }
publish: public
```

whose `service-1.4.3/service.aon` adds an optional key:

<!-- test: file service-1.4.3/service.aon -->
```aontu
name: string
port: *8080|integer
owner?: string
```

is compatible, and the report names what it was gated against:

<!-- test: run -->
```sh
$ aontu publish --yes --key key.pem --to repo service-1.4.3
verdict: sent
...
against: corp.example/schemas/service 1.4.2
...
```

A candidate `service-1.5.0/pkg.aon`:

<!-- test: file service-1.5.0/pkg.aon -->
```aontu
pkg: { path:"corp.example/schemas/service" version:"1.5.0" main:"service.aon" }
publish: public
```

whose `service-1.5.0/service.aon` makes that key required:

<!-- test: file service-1.5.0/service.aon -->
```aontu
name: string
port: *8080|integer
owner: string
```

is refused, with the key it refuses on, and nothing is written:

<!-- test: run -->
```sh
$ aontu publish --yes --key key.pem --to repo service-1.5.0
verdict: breaking
...
$.owner: the general value requires this key; the specific value makes it optional, so instances without it are admitted
...
$ echo $?
1
```

Every 1.4.3 consumer without an `owner` would stop evaluating, so the
release is refused, and there is no major version to bump past the
gate: compatibility is decided, not asserted. A breaking change ships
as a new package path, and the last version of the old path declares
`moved: <new path>`, which refuses every import of the old name with
the destination.

## Serve it, and read from it

`aontu pkg serve` serves the directory over HTTP on a loopback address,
byte for byte, and runs until interrupted:

<!-- test: skip serve runs until interrupted, which a transcript cannot show -->
```sh
$ aontu pkg serve repo
serving /home/me/repo at http://127.0.0.1:8017
```

A consumer names the base and the signer it accepts in its own
`pkg.aon`, and syncs. A base is `https`, or `http` on a loopback host,
which is what makes the laptop's registry reachable:

<!-- test: skip the consumer reads from the served registry above -->
```aontu
pkg: { path:"corp.example/checkout" main:"main.aon" }
dep: "corp.example/schemas/service": v: "1.4.2"

repo: base: ["http://127.0.0.1:8017"]
repo: trust: "corp.example/*": { signer:"ed25519:…" inclusion:none }
```

<!-- test: skip the consumer reads from the served registry above -->
```sh
$ aontu sync
verdict: ok
fetched: corp.example/schemas/service 1.4.2
corp.example/schemas/service 1.4.2 aon1-oQs6Ng6XxP2FHQGTYescREGDrDPfLLW1Liq4OS8Gs2E
```

`aontu get corp.example/schemas/service@1.4.3` raises the dependency
and syncs; `aontu pkg outdated` asks what could move. A version is
selectable by name at once, and by `get` without a version only after
the repository has held it for three days, so a compromised publisher's
newest release does not reach every consumer the hour it lands.

Publishing to the public repository is the same command without
`--to`: `aontu publish --yes --key key.pem --token token` from a CI
job, where the token is the forge's OIDC token and the write path
decides admission from it. The verb's full contract is
[`aontu publish`](../reference-api.md#aontu-publish); the consumer
side is [vendor a dependency closure](vendor-a-dependency-closure.md).

The public repository is not serving yet. Its default bases have no
address, so until they do a project names its `repo.base`, and a
publisher writes with `--to <dir>` and serves with `aontu pkg serve`.

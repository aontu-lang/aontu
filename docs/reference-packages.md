# Packages reference

A **module** is a document another document imports. A **package** is a
module that was published: a tree of aontu source with a path, a
version, a signed manifest, and an archive whose bytes one digest
names. The language reference states how an import routes to one; this
page states what the package system keeps on disk while it does so.

This page is normative for the artefacts: the files the package system
reads and writes, every field `pkg.aon` declares, the name and version
rules, the caps every consumer applies, what an archive may hold, and
every code a package operation refuses with. It states no verb's
options and no verb's exit codes.

The verbs are the API reference: [`aontu
sync`](reference-api.md#aontu-sync) for the one that makes a project
correct, [`aontu add`, `aontu get`, `aontu
remove`](reference-api.md#aontu-add-aontu-get-aontu-remove) for
changing what a project depends on, [`aontu
publish`](reference-api.md#aontu-publish) for sending one out, and
[`aontu pkg`](reference-api.md#aontu-pkg) for the remaining steps.
[Modules](reference-language.md#modules) in the language reference
states how a reference routes, and
[`tutorial-package.md`](tutorial-package.md) walks the whole path once
with a real package.

## Contents

- [The files](#the-files)
- [What pkg.aon declares](#what-pkgaon-declares)
- [Names and versions](#names-and-versions)
- [Where a module resolves from](#where-a-module-resolves-from)
- [The caps](#the-caps)
- [What an archive may hold](#what-an-archive-may-hold)
- [Refusals](#refusals)
- [Related](#related)

---

## The files

Everything the package system keeps in a project is a file in it, and
every one of those is ordinary text: nothing is hidden in a database,
and nothing outside this table is consulted. The two stores outside a
project are not text alone. The user cache and a repository directory
hold the archives themselves, which are zips, beside the manifest and
proof that travel with them.

| path | written by | read by | commit it |
|---|---|---|---|
| `pkg.aon` | the author, and `add`, `get`, `remove` by the smallest text change | every package verb, and module resolution | yes |
| `aontu_meta/pkg-lock.aon` | `sync`, `pkg tidy`, `pkg refreeze` | `sync --frozen`, `pkg verify`, `pkg tree`, `why`, and resolution for a pinned import | yes |
| `aontu_meta/vendor/<package-path>/` | `sync`, `pkg vendor` | resolution, first of the stores | yes |
| `aontu_meta/vendor/<package-path>/aontu_meta/` | `sync`, holding the manifest and proof as served | `pkg verify` | yes |
| the user cache | `sync`, `add`, `get` | resolution, when the expected canon-hash is known | it is outside the project |
| a repository directory | `publish --to <dir>` | `pkg serve`, and any consumer whose `repo.base` names it | it is not part of a project |
| the signing key | `pkg keygen`, once | `publish --key` | never |

A project that has been synced evaluates from its own directory with no
cache and no network, because the vendor tree is a real copy rather
than a link. The lockfile and the vendor tree are written together and
belong in one commit: a lockfile without the tree it pins names bytes
the project does not have.

## What pkg.aon declares

`pkg.aon` is an ordinary aontu document, evaluated as any other. The
tools read the fields below and nothing else, so a field of the
author's own is carried rather than refused.

| field | value | default | read by |
|---|---|---|---|
| `pkg.path` | this package's path | none | resolution, `publish`, `why` |
| `pkg.version` | this package's own version | none | `publish`, `pkg manifest` |
| `pkg.main` | the entry document, a path inside the tree | `main.aon` | resolution, `publish` |
| `dep."<path>".v` | the minimum version of a dependency | none | `sync`, and every verb that resolves |
| `dep."alias:<name>".pkg` | the package an alias names | none | resolution of an `alias:` import |
| `dep."alias:<name>".v` | the minimum version taken under that alias | none | `sync` |
| `publish` | `public`, to allow publication at all | `private` | `publish` |
| `moved` | the package path that replaces this one | absent | resolution, `publish` |
| `retract` | versions withdrawn, as a list of strings | empty | `publish --to`, which derives the advisory |
| `repo.base` | repositories to read from, in order | none | every verb that fetches |
| `repo.write` | the write path a publish sends to | none | `publish` |
| `repo.private` | patterns never sent to a public base | none | every verb that fetches |
| `repo.private_base` | repositories for a name on the private list | none | every verb that fetches |
| `repo.trust."<pattern>".signer` | `forge`, or `ed25519:` and a public key | the entry for `*`, which names the forge signer | acquisition |
| `repo.trust."<pattern>".inclusion` | `none`, to accept a key proof that carries no log inclusion | inclusion is required | acquisition |

A consuming project declares what it depends on, and where those
packages are read from:

```aon
pkg: { path:"corp.example/checkout" main:"main.aon" }

dep: "corp.example/schemas/service": v: "1.4.2"
dep: "alias:legacy": { pkg:"corp.example/schemas/service" v:"1.2.0" }

repo: base: ["https://pkg.aontu.dev"]
repo: private: ["corp.example/*"]
repo: private_base: ["https://pkg.corp.example"]
repo: trust: "corp.example/*": { signer:"ed25519:q520" inclusion:none }
```

A package that is published declares its own version and says so out
loud, and the last version of a path that has been superseded points at
its replacement:

```aon
pkg: { path:"corp.example/schemas/service" version:"1.4.2" main:"service.aon" }
publish: public
retract: ["1.4.1"]
moved: "corp.example/schemas/service2"
```

Both fields are shown together above for the field's sake. A package
declares `moved` when its path is finished, and a path that is finished
gains no further versions.

## Names and versions

A **package path** is a domain-shaped path: the first element contains a
dot, and no element is a major version, because compatibility is
computed when a package is published rather than declared in its name.
A path that routes to a package becomes a directory on every platform
the toolchain runs on, so the shape is bounded before anything is built
from it.

- At most **512** characters, and at most **32** elements.
- No element is empty, and none begins or ends with `.`.
- The part of an element before its first `.` is not a reserved device
  name. The set, matched without regard to case: `con`, `prn`, `aux`,
  `nul`, `com1` to `com9`, and `lpt1` to `lpt9`.
- An uppercase letter is written as `!` and its lowercase form in every
  store, so two paths differing only in case stay two identities on a
  filesystem that would fold them into one.

A **version** is three parts separated by `.`, each either `0` or a
digit string with no leading zero. That is what a publish mints and
what a manifest carries. The comparator reads a part a version omits as
`0`, so `1.2` and `1.2.0` are one version to it, and a lockfile
rewritten from either says the same thing.

An **alias key** is `alias:` followed by the name the imports use. A
**local** import carries `./`, `../` or `/`; a bare relative path whose
last segment has an extension the include table knows is refused with
`module_local` rather than read as a package.

## Where a module resolves from

Resolution reads local stores only, in this order, and stops at the
first that holds the module:

1. `aontu_meta/vendor/` of the project whose directory holds `pkg.aon`.
2. `aontu_meta/vendor/` of each project enclosing that one, outward, so
   a vendored module resolves its own dependencies from the tree that
   vendored it.
3. The user cache, which is keyed by canon-hash and so is consulted
   only where the expected hash is already known.

The cache directory is the first of these that applies:

| condition | directory |
|---|---|
| `XDG_CACHE_HOME` is set | `$XDG_CACHE_HOME/aontu/pkg` |
| `HOME` is set | `$HOME/.cache/aontu/pkg` |
| Windows, and `LOCALAPPDATA` is set | `%LOCALAPPDATA%\aontu\pkg` |
| none of those | there is no cache, and the vendor tree is the only store |

## The caps

Every cap is a fixed number, the same in both implementations, and each
is refused by name so a report says which one was reached.

| cap | value | refused as |
|---|---|---|
| a module path, in characters | 512 | `module_path` |
| elements in a module path | 32 | `module_path` |
| dependency nesting, in levels | 16 | `module_depth` |
| packages in one closure | 1024 | `closure_too_large` |
| an archive, compressed | 16777216 bytes | `archive_too_large` |
| an archive, extracted | 67108864 bytes | `archive_bomb` |
| files in an archive | 4096 | `archive_too_many_files` |
| one file in an archive | 8388608 bytes | `archive_bomb` |

The four archive caps are applied twice. A consumer applies them while
acquiring, before a byte of the archive is parsed. A publish applies
the same four before anything is minted, so a package that every
consumer would refuse never leaves the machine; there the reasons are
reported as what stopped the mint rather than as a refusal code.

## What an archive may hold

The archive of a package holds source and the text that travels with
it. The list is enumerated and refused by default, so a new extension
is admitted by a change to the engine and never by a package.

| group | admitted |
|---|---|
| aontu source | `aon`, `aontu` |
| data the include table reads | `json`, `jsonld`, `jsonc`, `json5`, `jsonic`, `jsc`, `toml`, `yaml`, `yml`, `ini` |
| text | `md`, `txt` |
| by name, with no extension | `LICENSE`, `NOTICE` |

No path element may begin with `.`, and nothing under `aontu_meta/` is
sent: a lockfile and a vendor tree are the consuming project's, and a
package that carried them would ship one project's resolution to
another. Anything else in the tree is refused with
`archive_entry_forbidden`, which names the file.

## Refusals

A package operation refuses with a **code**, a message, and the package
it was about. There are thirty codes.

Six of them are also engine codes, raised while a document is
evaluated, and those six are in the registry with a class and a
registered-at version: see [the
codes](reference-errors.md#the-codes) for `module_path`,
`module_local`, `module_missing`, `module_moved`, `module_integrity`
and `module_depth`. The other twenty-four name a refusal by a verb.
They are not findings, carry no class, and arrive under `refusal` in a
verb's `--format json` report.

The step each code is raised at: **resolution** reads the local stores
while a document is evaluated; **configuration** reads `repo` and the
signing key; **acquisition** reads a repository, in the order version
list, manifest, proof, archive; **publication** mints and sends.

| code | raised at | what it means |
|---|---|---|
| `archive_bomb` | acquisition | a file, or the running total, is over the size cap once extracted |
| `archive_digest_mismatch` | acquisition | the archive's digest is not the one the manifest declares |
| `archive_entry_forbidden` | acquisition | the archive carries a file the allowlist does not admit |
| `archive_not_canonical` | acquisition | the zip is not in the canonical form one tree has one digest under |
| `archive_path_invalid` | acquisition | a path in the archive breaks the element rules |
| `archive_too_large` | acquisition | the archive is over the compressed cap |
| `archive_too_many_files` | acquisition | the archive is over the file-count cap |
| `base_not_https` | configuration | a repository base is neither `https` nor `http` on a loopback host |
| `closure_too_large` | acquisition | the closure is over the package cap |
| `config_invalid` | configuration | a `repo.trust` entry is not a pattern, or names no signer |
| `fetch_failed` | acquisition | no repository answered, or answered with a status, for a list, manifest or archive |
| `file_manifest_mismatch` | acquisition | the archive holds a file the manifest does not list, or lacks one it does |
| `inclusion_missing` | acquisition | the trust entry requires log inclusion, which a key proof does not carry |
| `key_invalid` | configuration | the key file is not a PEM private key, or is not Ed25519 |
| `list_rollback` | acquisition | a version seen before is absent from the list now served |
| `manifest_invalid` | acquisition | the manifest is malformed, names another package or version, or declares a dependency without the package it names |
| `module_depth` | resolution, acquisition | dependency nesting is past the level cap |
| `module_integrity` | resolution, acquisition | the module's meaning is not the canon-hash that was pinned |
| `module_local` | resolution | a local file was written without a `./` prefix |
| `module_missing` | resolution | no store holds the module, or an alias is not declared |
| `module_moved` | resolution, acquisition | the package declares `moved`, and nothing follows a move |
| `module_path` | resolution | the path breaks a name rule or a length cap |
| `not_public` | publication | the package does not declare `publish: public` |
| `path_moved` | publication | the path is frozen by a `moved` declaration |
| `private_name_public_path` | configuration | the name is on the private list and `repo.private_base` names no repository |
| `proof_missing` | acquisition | no proof is served for the version |
| `proof_signer_untrusted` | acquisition | the proof's signer is not the one the trust entry accepts for that name |
| `response_mismatch` | acquisition | a served document is malformed, or names something other than what was asked for |
| `tombstoned` | acquisition | the version was withdrawn by the repository |
| `version_exists` | publication | the version was published before, and a version is never reusable |

## Related

- [`aontu sync`](reference-api.md#aontu-sync) for the verb that makes a
  project correct, its report, and the order the checks run in.
- [`aontu publish`](reference-api.md#aontu-publish) for what a publish
  sends, the compatibility gate, and the proof.
- [`aontu pkg`](reference-api.md#aontu-pkg) for the individual
  operations, including `verify`, `vendor`, `tree` and `serve`.
- [Modules](reference-language.md#modules) in the language reference for
  how a reference routes to a package, a file or an alias.
- [The codes](reference-errors.md#the-codes) in the errors reference for
  the six codes that are also engine codes, with their classes.
- [Vendor a dependency
  closure](how-to/vendor-a-dependency-closure.md) and [publish a
  package](how-to/publish-a-package.md) for the two jobs in recipe form.

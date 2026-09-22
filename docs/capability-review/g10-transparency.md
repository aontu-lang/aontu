# G10: A transparency log — the first resolution, made public and auditable

*Status: partly built; the design is superseded in places. Part of the
[capability review](index.md), opened 2026-08-30. This document expands
a gap G1–G9 did not name: [G6](g6-distribution.md) made a module's
meaning **pinnable**, and this one makes the **first** pinning of it
public, append-only and independently auditable. It exists because a
design review of a proposed "Forge Tag Transparency Registry" found the
log sound and its substrate wrong for aontu; that review's decisions are
recorded in
[ADR-013](../../ADR.md#adr-013--the-project-operates-one-transparency-log-and-nothing-else)
and in [Design space](#design-space) rather than relitigated here.
Phases 1, 3 and 4 have landed, phase 2 is partial, phase 5 was retired
as designed and phase 6 is rewritten for the federated design: the
[progress register](progress.md) carries those rows and is authoritative
for status, and this document is authoritative for design. The design
below is as designed, and [Design space](#design-space) carries the four
dated amendments that revised it. Every claim marked VERIFIED was run
against the built CLIs during drafting, and
[Current state](#current-state) is re-stated as of 2026-09-18: of the
four blockers it named, two have closed, one is half-closed and one
stands.*

## Problem

A lockfile is a private memory. G6 gives a project a canon-hash that
survives refactors and breaks on meaning, and `aontu mod verify` to
check it — but every guarantee it offers begins *after* someone has
already decided what a version means. Nothing in the language speaks to
the moment before that.

**First failing example: two projects, two truths, one name.** Alice
resolves `corp.example/schemas/service@1` at `1.4.2` in January and
locks `aon1-4vJe…`. Bob resolves the same module and version in March
and locks `aon1-9kQz…`, because the publisher moved what that version
points at. Both lockfiles verify. Both `mod verify` runs report
`verdict: ok`. Both developers believe they are running the reviewed
truth, and **no command in the toolchain can tell either of them
otherwise**, because each is comparing the store against its own
memory of it. The divergence is only visible from outside both
projects, and today there is no outside.

**Second failing example: the first resolution is unwitnessed.** A new
machine, a new contributor, or an agent session with no lockfile asks
what a version means for the first time. Whatever it is handed becomes
that project's truth, and the integrity machinery then defends it
perfectly. G6's own boundary says so plainly — verification is local,
and the registry's annotation is advisory — which is right, and which
also means a first resolution has nothing to be checked *against*.

**Third failing example: a maintainer cannot prove they did not
equivocate.** An honest publisher who is accused of shipping different
bytes to different consumers has no evidence to offer. There is no
public record that `1.4.2` has meant one thing since it was minted.
This cuts both ways: without such a record, a compromised publisher
also leaves none.

What is missing is a **public append-only statement** — *at log index
N, module M at version V had OCI digest D and meaning H* — that any
party can verify inclusion in, and that no party, the operator
included, can silently rewrite.

## Current state

G6 landed the whole local half, and it is good bones.

- **The canon-hash.** `canonHash(v)` is `"aon1-" +
  base64url(SHA-256(UTF-8(hcanon(unify(module)))))` — a hash of
  post-unification *meaning*, `ts/src/hcanon.ts`, `go/hcanon.go`, in
  cross-port parity by the shared suite's `hash` rows. It survives
  comments, formatting and refactoring; it breaks on any semantic
  change in the transitive closure.
- **Three pins, every one of them locally checkable.**
  `aontu_meta/pkg-lock.aontu` carries `v`, `canon` (the meaning that was
  reviewed) and `archive` (the digest of the tree's canonical zip),
  plus `manifest` where the package came from a repository; `canon` is
  the one `resolveModule` checks (`ts/src/mod.ts`, `go/mod.go`). This
  document was written when there were two pins and one of them, `oci`,
  was the registry's word about bytes nothing local could recompute.
  ADR-039 part 6 retired it, because nothing ever computed it.
- **The publish boundary.** `aontu pkg manifest` computes what a
  publish would send — the specification's signed manifest, not an OCI
  artifact — and gates it on [G3](g3-subsumption-evolution.md)'s
  breaking check.
- **The verbs.** `pkg tidy`, `pkg verify`, `pkg vendor` and
  `pkg manifest` in both ports, with MVS resolution and a lockfile
  written in canonical form.
- **The path gate.** Module paths are validated before becoming
  directories, and uppercase is escaped on disk (landed 2026-08-30;
  see the register's G6.2 note).

Four things structurally blocked the capability when this was written.
**Two still do** — one whole, one half. The items keep their own
numbers, because the rest of this document refers to them by number,
and because what closed the other two is worth keeping: both were
closed by the work this document went on to argue for.

1. **The fetch and the publish exist.** They did not at drafting: both
   exited 2 naming the missing half, and G6.3's departure 1 recorded
   why they had not landed — untestable network code would breach
   [ADR-002](../../ADR.md). They are `aontu get` and `aontu publish` in
   both ports, landed 2026-09-16 as G10 **phase 3** under ADR-039;
   phase 4, the same day, is the trusted-publishing identity over them.
   What answered ADR-002 is the seam phase 3 below argues for, and it
   landed as one injectable transport per port — `PkgHttp` in
   `ts/src/pkg-net.ts`, `PkgHTTP` in `go/pkgnet.go`, with a directory
   transport below for tests and for `publish --to <dir>`.
   `ModuleFetch` was this document's name for it and is a symbol in
   neither port.
2. **There is no public record of anything.** This is the one that
   stands whole: nothing has been published to a repository the
   project operates, so there is nothing for a second resolver to
   compare against. What it no longer rests on is the `oci` pin, which was the
   registry's word about bytes nothing local could recompute. That pin
   is retired, so every pin a lock entry carries is now checkable by
   the client carrying it.
3. **Half of the transparency client exists.** Go has record, node and
   tree hashing, inclusion and consistency proof checking, tile
   addressing and note verification, in `go/tlog.go`, importing
   `golang.org/x/mod/sumdb/tlog` and `sumdb/note` behind about fifty
   lines of glue. TypeScript has none of it in `ts/`: the port lives in
   [aontu-lang/mod](https://github.com/aontu-lang/mod), unpublished, so
   nothing here can import it and no shared spec row executes either
   half. Register row G10.2 is PARTIAL for that reason, and returns to
   LANDED with the shared rows rather than with the publish. **So this
   one still blocks, half-closed**: by ADR-001 a behaviour in one port
   is partial, and a client only the Go binary can run is not a client
   this project ships.
4. **The cache distinguishes identities.** `cacheStoreDir` takes the
   package path as well as the canon-hash (`ts/src/mod.ts`), so two
   modules that mean the same thing no longer share a directory. The
   hole was closed before anything wrote the cache, which was the point
   of naming it here while it was still latent.

## Prior art

- **Go: `sum.golang.org` plus `proxy.golang.org`.** The decisive
  precedent, and the decisive *warning*. Go's checksum database is the
  log this design follows; Go's **proxy**, which caches module content,
  is what supplies availability, forge independence and the answer to a
  deleted repository. Go separated the integrity layer from the
  artifact layer and operates both. A design that takes the log and
  refuses the cache inherits half the system and calls it whole.
- **`golang.org/x/mod/sumdb/tlog` and `sumdb/note`.** BSD-3, mature,
  independently executable, and the thing to reuse rather than
  reinvent: record and node hashing, tree roots, inclusion and
  consistency proofs, tile addressing, signed notes. Note that sumdb
  still serves `/lookup/` alongside `/tile/` — the tile format defines
  no key-to-record index, so a lookup endpoint is not legacy, it is
  necessary.
- **Certificate Transparency.** The origin of the tree and proof
  design, and a decade of operational lessons: log operators do get
  distrusted; gossip largely never shipped in browsers; and the
  direction of travel is *static tiled logs* (`static-ct-api`,
  Sunlight) rather than stateful servers with bespoke proof endpoints.
- **Sigstore Rekor.** A transparency log for signatures, whose v2
  redesign removed exactly the per-index parameterised proof API a
  naive design reaches for first.
- **C2SP `tlog-tiles`, `tlog-checkpoint`, `tlog-witness`.** The current
  standards. Conforming means existing auditors and witnesses work off
  the shelf; not conforming means writing and funding them.
- **npm and PyPI: trusted publishing.** OIDC from CI binds a release to
  a workflow identity. It addresses first-observation capture and
  account compromise — which a log does not — and both ecosystems
  report it as the higher-yield mechanism. PyPI's history is the
  sharper lesson: the elaborate thing (PEP 458/480 TUF) was specified
  and largely not adopted, while the simple thing shipped and worked.
- **Deno.** The closest match to identity-from-forge with no artifact
  hosting, and the reason to treat it as a null result: Deno built JSR.
- **Bazel Central Registry.** A git repository of static metadata with
  SRI integrity and no server component — the credible zero-service
  alternative, and proof the shape works at real scale.

## Design space

**A. Do nothing; lockfiles are enough.** Zero cost, and it covers the
90 % case honestly. Rejected because it cannot address any of the three
failing examples above: each concerns what happens *between* projects,
and a lockfile is by construction within one.

**B. A git-backed log.** Publish leaves and signed checkpoints as files
in a public repository. $0, replicated by every clone, no service.
Genuinely attractive, and force-push — the obvious objection — is
neutralised by signed checkpoints plus witnesses. Rejected as the
primary mechanism because it has no lookup path (a client would clone
the world to answer one question) and because commit-level concurrency
makes the append path a serialisation problem with worse failure modes
than a sequencer. **Retained as the archival and mirror format**, which
is where its replication property actually pays.

**C. A hosted log over forge tags** — the reviewed proposal. Identity
from Git tags; the service resolves a tag, fetches a tree, canonicalises
and hashes it. Rejected on three independent grounds, each sufficient:

- **aontu module paths cannot address a forge repository.** Identity is
  domain-based (`corp.example/schemas/service@1`); there is no function
  from that to a GitHub repository. Supplying one means Go's
  `?go-get=1` vanity-import protocol, which puts arbitrary DNS holders
  inside the trust base the forge allowlist exists to bound.
- **The digest would be one no aontu client checks.** The proposal's
  security-critical field is a byte-level canonical-tree SHA-256. Both
  ports enforce exactly one pin, the canon-hash, and have no
  byte-digest verification path anywhere.
- **Fetching source is the entire cost.** Archive-versus-tree
  divergence, `.gitattributes`, CRLF, symlinks, submodules, Git LFS,
  SSRF allowlisting, decompression bombs, forge API quotas, and size
  budgets that exceed a Worker isolate — every one of these is a
  consequence of the service downloading source, and every one
  disappears if it does not.

**D. A hosted log over OCI digests, recording publisher-asserted
claims.** The log binds `{module path, major, version, OCI digest,
canon-hash}` and never fetches, parses or evaluates anything. G6's
artifact channel is untouched.

**Recommendation: D, with B as the mirror format.** It keeps every
property the log exists to provide, deletes the whole ingestion surface
along with its threat model, and restores availability — an OCI
registry is contractually obliged to keep bytes that a forge tag is
not. The cost is precise and acceptable: the log records what a
publisher *claims*, so a lying publisher can log one thing and serve
another. The client detects that on first use, because it recomputes
the canon-hash locally and fails closed — which
`ts/src/mod.ts` already does. The log's job is not to be an
independent observer; it is to make a claim **permanent, public, and
impossible to silently retract**.

### The artifact channel is superseded, 2026-09-03

**D's OCI channel is foreclosed by a constraint set after this review:
the project will not run an OCI registry and will not store module
bytes, and bytes live on the forge.** The transparency layer above is
unaffected -- what changes is where the artifact comes from.

Read the paragraph above with that in mind, because half its reasoning
no longer holds. D was preferred to C partly because "an OCI registry is
contractually obliged to keep bytes that a forge tag is not"; with bytes
on a forge, that availability argument is gone and the honest position
is C's own §60 -- the log can prove what a release was without being
able to provide it. `aontu mod vendor` is the answer, and it is
consumer-side discipline rather than an ecosystem guarantee.

The three grounds on which C was rejected do not all survive the change
either. Ground 3 -- that fetching source is the entire cost -- was an
objection to **the service** downloading source, and a client fetching
from a forge while the service records only publisher-asserted claims is
a different proposition. Ground 2 -- that both ports enforce one pin and
have no byte-digest verification path -- was an objection to **adding**
one, and the replacement design adds none: `ts/src/mod.ts` already
checks meaning alone, and the `oci` field is a registry assertion
nothing local reads. Ground 1, module paths against forge paths, stands
unchanged.

The successor design, with the three decisions it turns on and a
sequence whose first phase is decision-independent, is
[`aontu-lang/system`'s `docs/design/DISTRIBUTION.0.md`](https://github.com/aontu-lang/system/blob/main/docs/design/DISTRIBUTION.0.md).
**Nothing here is amended until that design is accepted**, per the
register's protocol that a status changes in the commit that changes it.
Two consequences are already certain and are recorded so they are not
discovered late:

- **`aontu mod manifest` is orphaned.** It builds an OCI manifest, with
  an OCI config media type and a layer of the module's source tree, for
  a channel that will not exist. It is repurposed to a forge release
  manifest or retired; either way its `--against` breaking gate is worth
  keeping, because that gate is [G3](g3-subsumption-evolution.md) and
  independent of the channel.
- **The `oci` digest in `mod-lock.aon`** loses the meaning its own
  comment gives it, "the bytes the registry served".

One defect surfaced while writing the successor, and it is this
document's to record because it is about what the pin covers. The
canon-hash covers the **entry file's** evaluated meaning, but
`mod vendor` copies the whole source tree and `layerFiles` walks the
whole source tree. **A file evaluation never reaches is unpinned and
still lands, committed, in a consumer's repository.** Nothing executes
it -- the trust contract holds -- but an editor, an agent, a generator
or a later version of the module may read it. A file manifest recorded
by `tidy` and checked by `verify` closes it as a list comparison rather
than a second hashing algebra.

### The channel is settled: bytes are stored, 2026-09-04

The successor design was not accepted as written. What was accepted
instead reverses its founding constraint:
[ADR-019](../../ADR.md#adr-019--the-project-stores-module-bytes-and-federates-the-log)
stores module bytes in a project-operated repository and federates the
log to Sigstore. The design is `REPOSITORY.0.md` in
[`aontu-lang/system`](https://github.com/aontu-lang/system/blob/main/docs/design/REPOSITORY.0.md).
Three consequences land on this document.

**Phase 5 is retired rather than deferred.** The log service this gap
designed will not be built, because Rekor v2 is served in the format
phase 2 already verifies — C2SP `tlog-tiles` with `sumdb/note`
checkpoints. The client half is unaffected and its value goes up: it
becomes the verifier for a log somebody else runs and staffs.

**The availability argument returns, and this time it is collectable.**
Design D was preferred to C partly because an OCI registry is obliged to
keep bytes a forge tag is not; the superseding note above recorded that
this reasoning had been lost. It is restored by a different route. The
repository serves the bytes, and `aontu_meta/vendor/` drops back to
being a hedge.

**Both pins become real.** The leaf below records `oci` and `canon`, and
the objection has always been that `oci` names an identity no client
checks. Under a repository the field is the stored archive's digest, and
a client checks it *before parsing* — which also answers the survey's
sharper complaint that hashing meaning makes the evaluator the
verification surface. The leaf shape stands; what changes is that its
first field is now load-bearing.

**Rejection ground 1 is retired.** The superseding note above recorded
that grounds 2 and 3 had fallen and that "ground 1, module paths against
forge paths, stands unchanged". It no longer does. The approved naming
convention is `<domain>/<path>`, with forge hosts admitted first and
verified domains later, and it dissolves the ground rather than trading
against it. `github.com/alice/widgets` **is** domain-shaped — `MODULE_RE`
matches it today, unamended — so nothing is reshaped; and the path is a
**name rather than a fetch instruction**, so `?go-get=1` is not needed
either. Bytes always come from the repository, nothing resolves a domain
at install time, and the arbitrary DNS holders this ground existed to
keep out of the trust base are therefore not in it. Ownership is proved
at publish instead, by the OIDC claim the forge already issues and
Fulcio already carries in the certificate. All three grounds on which
design C's substrate was rejected have now been answered — none of them
by design C.

The pin-covers-only-the-entry-file defect above is unchanged and more
urgent: unpinned files now land in the project's own bucket rather than
on somebody else's forge.

### The provider is not the contract, 2026-09-06

[ADR-024](../../ADR.md#adr-024--the-forges-token-authorises-a-publish-and-sigstore-is-one-provider-of-the-proof-not-its-definition)
separates two acts the settled design had fused, and it changes this
document in two places.

**A publish is authorised from the forge's own token.** The write path
verifies it directly against the forge's published key set and reads
the namespace claim, the identifier pair, the trigger and the runner
from it — never from a certificate. Fulcio leaves the admission path,
so a host is tier-A admissible under ADR-020's rule alone, and not under
the issuers Fulcio happens to accept, which was a coupling nothing had
recorded.

**What the client verifies is stated in this project's terms.** A
signed manifest; a signer the proof names and the client's trust
configuration accepts for the package's name; and, where the
configuration requires it, inclusion in a `tlog-tiles` log whose
checkpoint key the client trusts — checked by the phase-2 client
unchanged, which is the second time federating has raised that client's
value rather than moved it. A Sigstore bundle is one encoding of that
proof and the default for public tier-A packages; it is not the
definition. The contract admits a second provider, and the minimal one
— a named key, no log, which the local registry and a private package
already need — proves the seam before the first third-party publish.
The exit from Sigstore is a provider swap.

The contract's specification lands in `aontu-lang/mod`, beside the leaf
and checkpoint specification the split below already places there,
because it is what a client relies on to verify. The pseudocode under
"What the client verifies" and the split table's key-custody row are
left as the record of design D: they describe a fetch, a lookup and a
custody the settled design replaced, and a rewrite belongs with the
phase-3 work that supersedes them.

### Phases 3 and 4 landed, 2026-09-16

Under [ADR-039](../../ADR.md#adr-039--the-package-system-has-one-vocabulary-one-set-of-files-and-three-pins)
both ports gained the read and write verbs against the repository:
`aontu sync`, `get`, `add`, `remove`, `why` and `publish`, with
`pkg outdated`, `pkg serve` and `pkg keygen`. The seam the
implementation plan asked for is one injectable transport per port
(`PkgHttp` in TypeScript, `PkgHTTP` in Go) with a directory transport
below it for tests and for `publish --to <dir>`, so every decision above
the wire is covered without a socket and the adapter below is the thin
exclusion the plan argued for. The acquire order is the specification's
(`ops.acquire`), bytes before meaning: proof, archive digest, canonical
unpack, file manifest, dependencies, evaluation, canon-hash. Trusted
publishing is the client half: `publish --token` carries the forge's
OIDC token to the write path and copies its claims into the manifest,
per [ADR-024](../../ADR.md#adr-024--the-forges-token-authorises-a-publish-and-sigstore-is-one-provider-of-the-proof-not-its-definition);
the write path that verifies it is `aontu-lang/system`'s Worker. The
cooldown is timed from the repository's first-seen time rather than the
client's (ADR-039 part 9), because a fresh machine must be able to
select something; the client's own `seen` records are what detect a
rollback (`list_rollback`). The gate is wired at the one place versions
are minted, with all three of ADR-022's components.

Phase 6 is rewritten in the register for the federated design: the log
is Sigstore's, so witnesses and gossip are theirs; what remains here is
repository mutation alerting, the git mirror, and the hardening a first
third-party publisher forces. The register's rows are the record.

**What the vocabulary below is now.** ADR-039 renamed the whole package
surface, so the design sections keep spellings the engine no longer
answers to. Where this document says `mod-lock.aon`, read
`aontu_meta/pkg-lock.aontu`; where it says `mod get` or `mod publish`,
read `aontu get` and `aontu publish`; where it says `aontu mod <op>`,
read `aontu pkg <op>`; where it names `ts/src/mod-tool.ts` or
`go/modtool.go`, read `ts/src/pkg.ts` with `ts/src/pkg-net.ts` and
`ts/src/pkg-zip.ts`, and `go/pkg.go` with `go/pkgnet.go`. The `oci` pin
is retired and `archive` and `manifest` took its place, so wherever the
design gives `oci` a role, read the archive digest. And **a package
path no longer carries `@<major>`**
([ADR-022](../../ADR.md#adr-022--compatibility-is-computed-so-the-major-leaves-the-name)
part 1, built), which is the one supersession that changes a shape
rather than a name: `corp.example/schemas/service@1` is now
`corp.example/schemas/service`, and the major survives in the leaf
alone.

## Proposed design

### The leaf

```
{
  "schema":  "aontu-release/v1",
  "module":  "corp.example/schemas/service",
  "major":   1,
  "version": "1.4.2",
  "oci":     "sha256:6b86b273ff34fce1…",
  "canon":   "aon1-4vJemVYtWFR2mQeN…",
  "observed_at": "2026-08-30T13:00:00Z"
}
```

Serialised for hashing in a deterministic encoding with explicitly
length-prefixed fields — never bare JSON, whose canonicalisation is a
second specification to get wrong.

**Both pins, with the roles the lockfile already gives them**
([ADR-013](../../ADR.md#adr-013--the-project-operates-one-transparency-log-and-nothing-else)).
`oci` certifies the bytes; `canon` certifies the meaning. Recording
only the byte digest would log an identity no client checks; recording
only the canon-hash would put aontu's *least stable* value in its most
permanent place — G6's own risk register predicted a canon change would
invalidate every pin, and G1 duly did it. The `aon1-` scheme id is what
makes that survivable: a canon change ships as `aon2-` in *new* leaves,
and old leaves stay true about what they said.

**The major is in the leaf as well as in the path**, because the
version scheme and the import path must not be able to disagree — the
same rule `aontu mod manifest` already enforces at publish. *(The
reason is spent. ADR-022 part 1 took the major out of the path, so
there is nothing for the leaf's major to agree with, and nothing at
publish checks one: `pkgManifest` validates `pkg.version` as
MAJOR.MINOR.PATCH and `pkg.path` as a package path, and the gate that
used to skip a comparison across majors is the computed compat check
now. Whether the leaf should still carry a `major` field, given the
version already spells it, is for the phase that builds the leaf.)*

### The log

`sumdb/tlog`'s tree, unchanged: leaf and node hashing with domain
separation, inclusion proofs, consistency proofs, tile addressing. The
checkpoint is a `sumdb/note`-format signed note — **one checkpoint
format**, not a JSON envelope beside a note format.

Served as C2SP `tlog-tiles` static objects (`<prefix>/checkpoint`,
`<prefix>/tile/<L>/<N>`, `<prefix>/tile/entries/<N>`) plus a
`/lookup/<module>@<major>/<version>` endpoint, which is Go's actual
shape and is necessary because the tile format carries no key index.
Immutable objects, long-cached; no parameterised proof endpoints whose
argument space an attacker can walk.

### What the client verifies

```
verify(module, major, version):
    record, proof, checkpoint = log.lookup(module, major, version)

    assert record.module  == module      # bind response to request
    assert record.major   == major
    assert record.version == version

    verify_note_signature(checkpoint)
    verify_consistency(saved_checkpoint, checkpoint)   # if one is saved
    verify_inclusion(record, proof, checkpoint)

    bytes = oci.fetch(module, record.oci)              # digest-addressed
    assert canonHash(evaluate(bytes)) == record.canon
```

The three `assert record.* == …` lines are not decoration. A
cryptographically valid inclusion proof **for the wrong leaf** passes
every other check in that list, and the client would then install
whatever module the server named. This is a ninth security invariant
the reviewed design omitted from its normative pseudocode, its
verification list and its invariant table alike.

### Where it fits, and where it must not

Evaluation never touches the network — [G5](g5-trust-contract.md)'s
contract, unchanged. `mod get` consults the log; `mod verify`, `mod
tidy`, `mod vendor` and every evaluation do not. **A build with a
lockfile never reaches the service**, which is
[ADR-013](../../ADR.md#adr-013--the-project-operates-one-transparency-log-and-nothing-else)'s
constraint 2 and the reason a dead log stalls new adoption rather than
breaking existing projects.

### Repository split

| Repository | Holds | Why |
|---|---|---|
| `aontu-lang/aontu` | `mod get`/`publish`, lockfile proof material, the client verifier's *use* | Language behaviour, both ports, shared spec rows |
| `aontu-lang/mod` | The TypeScript `tlog`/`note` port, the leaf and checkpoint specification, the auditor | Public and verifiable — **anything a client relies on to verify lives here** |
| `aontu-lang/system` | Rate limits, quotas, key custody, runbooks, deploy | Operational, where secrecy adds security and nothing else does |

The split has one hard rule: **nothing a client relies on to verify may
live in `system`.** A log whose auditor cannot be rebuilt from public
code is a database with extra steps.

## Boundary: what we will not do

- **No source fetching, parsing or evaluation by the service.** It
  sequences and signs publisher-asserted claims. This is what deletes
  the entire ingestion threat model, and reversing it re-opens all of it.
- ~~**No artifact storage, ever**~~ — *reversed 2026-09-04 by
  [ADR-019](../../ADR.md#adr-019--the-project-stores-module-bytes-and-federates-the-log),
  which stores module bytes in a repository and federates the log to
  Sigstore. The bullet was written to stop a log drifting into a
  registry by accretion, and that danger was real; what it got wrong was
  the price, because storage is single-digit dollars a month at any
  scale this project will reach and egress is free on the chosen
  provider. The bullet below it — no source fetching, parsing or
  evaluation by the service — is what actually held the ingestion threat
  model shut, it is unchanged, and it now carries the weight this one
  used to share.*
- **No log on the path of a locked build.** Adding a *new* dependency
  may require it; building an existing project may not.
- **No bespoke proof protocol.** C2SP `tlog-tiles` and `tlog-checkpoint`,
  or the auditors and witnesses are ours to write forever.
- **No provider-specific verification contract.** What a client checks
  on first acquisition is stated in the project's terms, per
  [ADR-024](../../ADR.md#adr-024--the-forges-token-authorises-a-publish-and-sigstore-is-one-provider-of-the-proof-not-its-definition),
  and a Sigstore bundle is one encoding of it. A client that verifies a
  bundle outside the contract, or a write path that decides admission
  from a certificate rather than the forge's token, breaches that entry.
- **No clean-room Merkle implementation** — port `sumdb/tlog`, pin the
  upstream version, gate on differential tests.
- **No witnesses in v1** — but the checkpoint format must be
  cosignable from the first leaf, because that is not retrofittable.
- **No forge-tag identity, and no `?go-get=1` vanity resolution** — see
  [Design space](#design-space) C.
- ~~**No private-module or auth design in v1**~~ — *reversed 2026-09-04
  by [ADR-021](../../ADR.md#adr-021--the-project-hosts-private-packages-with-authenticated-reads),
  which hosts private packages behind authenticated reads as a second
  service, bounded by seven constraints. The public read path is
  unchanged and still mirrorable; the private tier is additive, and a
  locked build still contacts neither.*
- **No approval of what a module contains.** The log records that a
  claim was made, not that it was good. Publisher trustworthiness,
  malware and a compromised maintainer's *new* version are all outside
  it — and the last is the dominant real-world attack, which is why
  trusted publishing is phased ahead of the service.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A TS port of `tlog` diverges from upstream in a security-relevant way | Medium | High — proofs that verify when they should not | Differential tests against pinned upstream Go as a CI release gate; committed golden vectors; the client half in both ports so two independent readings must agree |
| The operator's own credentials are the cheapest attack | Medium | High — forged checkpoints | Offline root key; online key rotated; **the deploy path is in the threat model**, which the reviewed design omitted — a Worker's secrets are readable by whatever is deployed to that Worker |
| An operator appends a *second* contradictory leaf | Low | High — undetectable by proofs alone | Inherent: a Merkle log proves inclusion, never exclusion. Accepted, as Go's sumdb accepts it — but stated in the threat model, with a published auditor SLO and a named owner, not implied |
| Canon changes and invalidates every `canon` pin | High | Medium — one-time re-pin | The `aon1-` scheme id, already in the string; a bump ships as `aon2-` in new leaves and old leaves stay true |
| Nobody publishes; the log proves nothing | High | Low | The format is the commitment, not the contents; the client verifier is useful against lockfile-carried proofs with no service running |
| The key holder is unavailable | Medium | High — the log stops | Custody arrangements are part of standing the service up, not an afterthought; ADR-013 constraint 5's freeze is the floor |
| Append-only data cannot be deleted (takedown, erasure) | Low | Medium | Module paths and version strings are attacker-chosen text; Go has run this exposure for years at millions of entries, so it is survivable — but it is a decision recorded before launch, not discovered after |
| Operating a service pulls the project toward operating more | Medium | High — the thing G6 rejected | ADR-013 admits exactly one and says so; a second needs its own entry |

## Implementation plan

Spec-first throughout. Nothing may regress a shared row (counts in
[the register's protocol rule 5](progress.md#the-update-protocol)) or
either coverage floor.

**Phase 1 — decide and document (S).** ADR-013, this document, the G6
boundary amendment, the register rows — one commit, per the register's
protocol.

**Phase 2 — the transparency client, both ports (L).** The bound set is
`recordHash`, `nodeHash`, `treeHash`, `checkRecord`, `checkTree`, tile
decode, note verification and the leaf encoding. TypeScript: a port of
upstream's client subset into `aontu-lang/mod`. Go: **not** a port —
`go/` imports `golang.org/x/mod/sumdb/tlog` and `note` behind glue, so
the differential test compares aontu's TypeScript against real upstream
Go rather than two readings by the same author. A new shared spec mode
carrying golden vectors. BSD-3 attribution and `UPSTREAM_GO_MOD.md`.
Useful with no service running: it verifies proofs a lockfile carries.

**Phase 3 — `mod get` and `mod publish` over OCI (L).** The ADR-002
problem, solved by a seam: a total `ModuleFetch` injected exactly as
`ModuleFs` and `ModuleEval` are, every decision above it, a thin
adapter below carrying an argued exclusion. A `(module, version)`-keyed
download tree feeding the canon-keyed store — the canon-hash cannot
address a module that has not been fetched yet. **Closes the cache
identity hole** (blocker 4 above) before anything writes the cache.

**Phase 4 — trusted publishing and the gate that already exists (M).**
OIDC from CI binding a release to a workflow identity; `mod manifest
--against`'s breaking check wired into publish; a cooldown before a new
version is selectable by default. Ahead of the service deliberately: it
addresses the attacks that dominate incident reports, which the log
does not.

**Phase 5 — the log service (L).** Tiles in object storage, a lookup
endpoint, a note checkpoint, a sequencer for the append path. Public
schema and auditor in `aontu-lang/mod`; operations in
`aontu-lang/system`.

**Phase 6 — witnesses and hardening (M).** *Rewritten 2026-09-18 for
the federated design; it read "Cosignatures, gossip, mutation
alerting, the git mirror" and the first two are no longer this
project's to run.*
[ADR-019](../../ADR.md#adr-019--the-project-stores-module-bytes-and-federates-the-log)
federated the log to Sigstore, so its cosignatures, checkpoint gossip
and witnesses are theirs to operate and phase 2's client to verify —
nothing here builds a witness, and phase 5 was retired on that same
ground. What survives as this project's: mutation alerting on the
repository, the git mirror **of the read-path layout** (not of a log
this project does not keep), and the hardening a first third-party
publisher forces. The register's row for this phase is the current
list.

## Open questions

- **Does the lockfile carry proof material, or only the index?**
  `mod-lock.aon` is machine-written canonical aontu read by both ports
  *without an evaluator*, pinned by shared fixtures and a byte-diffed
  parity probe. Embedding an inclusion proof and checkpoint is
  therefore a landed-format migration in two implementations, not a new
  field. Decided by: whether offline verification of *log membership*
  (as against meaning, which already works offline) is worth that.
- **What is `observed_at` for, given it makes the leaf
  non-reproducible?** A timestamp the publisher supplies is a claim; one
  the service supplies makes the leaf unverifiable from the publisher's
  own inputs. Decided by: whether anything actually consumes it.
- **Who may request an observation for a module they do not control?**
  Anyone, or only a publisher proving control? The first makes the log
  complete; the second makes it accurate. Go's answer is the first,
  because its records are derived rather than asserted — which is
  precisely the property design D gives up.
- **Cooldown as policy or mechanism.** A "not selectable for N hours"
  rule is the cheapest defence against a compromised publisher, and it
  is either an MVS input or a client policy. Decided by: whether it can
  live outside the resolver without becoming advisory.
- **Key custody, concretely.** Who holds the offline root, where, and
  what is the documented recovery when they are unreachable? This is
  the question most likely to be deferred and least survivable if it is.

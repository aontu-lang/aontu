# G10: A transparency log — the first resolution, made public and auditable

*Status: design proposal. Part of the [capability review](index.md),
opened 2026-08-30. This document expands a gap G1–G9 did not name:
[G6](g6-distribution.md) made a module's meaning **pinnable**, and this
one makes the **first** pinning of it public, append-only and
independently auditable. It exists because a design review of a
proposed "Forge Tag Transparency Registry" found the log sound and its
substrate wrong for Aontu; that review's decisions are recorded in
[ADR-013](../../ADR.md#adr-013--the-project-operates-one-transparency-log-and-nothing-else)
and in [Design space](#design-space) rather than relitigated here.
Per-phase status will be in the [progress register](progress.md), which
is authoritative for status; this document is authoritative for design.
Every claim marked VERIFIED was run against the built CLIs during
drafting.*

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
  cross-port parity by 17 `hash` spec rows. It survives comments,
  formatting and refactoring; it breaks on any semantic change in the
  transitive closure.
- **Two pins, two roles.** `mod-lock.aon` carries `oci` (the bytes the
  registry served) and `canon` (the meaning that was reviewed). Only
  the second is checkable without the registry, and it is the one
  `resolveModule` checks (`ts/src/mod.ts`, `go/mod.go`).
- **The publish boundary.** `aontu mod manifest` computes the OCI
  artifact a publish would push — config media type
  `application/vnd.aontu.module.v1+json`, one layer, four annotations
  including the canon-hash — and gates it on
  [G3](g3-subsumption-evolution.md)'s breaking check.
- **The verbs.** `tidy`, `verify`, `vendor`, `manifest` in both ports,
  with MVS resolution and a lockfile written in canonical form.
- **The path gate.** Module paths are validated before becoming
  directories, and uppercase is escaped on disk (landed 2026-08-30;
  see the register's G6.2 note).

Four things structurally block the capability:

1. **`mod get` and `mod publish` do not exist.** Both exit 2 naming the
   missing half (`ts/src/cli.ts`, `go/cmd/aontu/mod.go`) — VERIFIED.
   Without a fetch there is nothing to log about, and G6.3's departure
   1 records why they did not land: untestable network code would
   breach [ADR-002](../../ADR.md).
2. **There is no public record of anything.** The `oci` pin is
   described in `ts/src/mod-tool.ts` as the registry's word, which
   "nothing local can hear" — an honest admission that one of the two
   pins is currently unverifiable by the client that carries it.
3. **No transparency primitives exist in either port.** No Merkle
   hashing, no inclusion or consistency proofs, no signed checkpoint,
   in TypeScript or Go.
4. **The cache cannot distinguish identities.** The user cache is keyed
   by canon-hash alone (`ts/src/mod.ts`), which contains no module path
   and no version, so two modules that mean the same thing share a
   directory. Latent while nothing writes the cache; a substitution
   hole the moment `get` fills it.

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

- **Aontu module paths cannot address a forge repository.** Identity is
  domain-based (`corp.example/schemas/service@1`); there is no function
  from that to a GitHub repository. Supplying one means Go's
  `?go-get=1` vanity-import protocol, which puts arbitrary DNS holders
  inside the trust base the forge allowlist exists to bound.
- **The digest would be one no Aontu client checks.** The proposal's
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
only the canon-hash would put Aontu's *least stable* value in its most
permanent place — G6's own risk register predicted a canon change would
invalidate every pin, and G1 duly did it. The `aon1-` scheme id is what
makes that survivable: a canon change ships as `aon2-` in *new* leaves,
and old leaves stay true about what they said.

**The major is in the leaf as well as in the path**, because the
version scheme and the import path must not be able to disagree — the
same rule `aontu mod manifest` already enforces at publish.

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
- **No artifact storage, ever** — that is the registry
  [ADR-013](../../ADR.md#adr-013--the-project-operates-one-transparency-log-and-nothing-else)
  admits no service to become.
- **No log on the path of a locked build.** Adding a *new* dependency
  may require it; building an existing project may not.
- **No bespoke proof protocol.** C2SP `tlog-tiles` and `tlog-checkpoint`,
  or the auditors and witnesses are ours to write forever.
- **No clean-room Merkle implementation** — port `sumdb/tlog`, pin the
  upstream version, gate on differential tests.
- **No witnesses in v1** — but the checkpoint format must be
  cosignable from the first leaf, because that is not retrofittable.
- **No forge-tag identity, and no `?go-get=1` vanity resolution** — see
  [Design space](#design-space) C.
- **No private-module or auth design in v1**, inheriting G6's boundary
  for G6's reason.
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

Spec-first throughout. Nothing may regress a shared row or either
coverage floor.

**Phase 1 — decide and document (S).** ADR-013, this document, the G6
boundary amendment, the register rows — one commit, per the register's
protocol.

**Phase 2 — the transparency client, both ports (L).** The bound set is
`recordHash`, `nodeHash`, `treeHash`, `checkRecord`, `checkTree`, tile
decode, note verification and the leaf encoding. TypeScript: a port of
upstream's client subset into `aontu-lang/mod`. Go: **not** a port —
`go/` imports `golang.org/x/mod/sumdb/tlog` and `note` behind glue, so
the differential test compares Aontu's TypeScript against real upstream
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

**Phase 6 — witnesses and hardening (M).** Cosignatures, gossip,
mutation alerting, the git mirror.

## Open questions

- **Does the lockfile carry proof material, or only the index?**
  `mod-lock.aon` is machine-written canonical Aontu read by both ports
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

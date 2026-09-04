# G6: A distribution layer — versioned, integrity-hashed, pinnable modules

*Status: implemented — all five phases landed in both ports: the
hash form, the canon-hash with `aontu hash` on both command lines,
module identity with local resolution, the `tidy`/`vendor` tooling,
and the publish boundary. Only the two network verbs (`mod get`,
`mod publish`) are absent — the parts that carry no semantics.
Per-phase status and the corrections this document needs are in the
[progress register](progress.md), which is authoritative for status;
this document is authoritative for design. Part of the
[capability review](index.md) (August 2026). This document expands gap
G6 — growing `@"…"` file inclusion into module identity, versioning,
registry distribution, and semantic integrity hashing over Aontu's
canonical form. Sibling documents own adjacent surfaces — see
[Boundary](#boundary-what-we-will-not-do).*

## Problem

Textual file inclusion is a single-project mechanism. A ground truth
earns the name only if it can travel — across repositories, teams,
and agent sessions — and remains tamper-evident while it travels.
Today Aontu has neither an identity for a shareable unit of truth,
nor a version to name a moment in its evolution, nor an integrity
check to prove the truth received is the truth reviewed.

First failing example: importing across a repository boundary. A
platform team publishes a service schema; a consuming team's agent
wants to validate against it by name and version:

```aon
# consumer.aon — what a user wants to write today, and cannot
service: @"corp.example/schemas/service@1"
service: {
  name: "checkout"
  port: 9091
}
```

Today this fails with `source not found:
corp.example/schemas/service@1` after the resolver chain exhausts
memory, filesystem, and package resolution (the error shape pinned
by `test/spec/file.tsv:load-not-found`). The only cross-repository
channel that *does* work is the package resolver — `@"pkg"` via
`require()` — so distributing a schema today means publishing an
npm package and having every consumer execute its code on load. The
security comment above `makeModelResolver` (`ts/src/lang.ts`) is
blunt: treat opening an untrusted source as running
it. That is a supply chain without any of a supply chain's
protections.

Second failing example: vendored copies drift silently. Two
repositories each copied `service.aon` in January; one was edited in
March:

```aon
# repo-a/vendor/service.aon  (as reviewed)
service: close({ name: string, port: *8080 | integer })
```

```aon
# repo-b/vendor/service.aon  (edited later; nothing objects)
service: close({ name: string, port: *9090 | integer })
```

Both evaluate cleanly. Agents in the two repositories now hold
different ground truths under the same name, materialise different
defaults, and no tool in the language can detect the divergence, let
alone locate it. "Ground truth" that forks silently is prose with
extra steps.

Third failing example: "has the truth changed?" cannot be answered
cheaply or correctly. An agent caching a definition must decide
whether to re-read and re-review it. Byte comparison — the only
check available today — fails in both directions:

```aon
# service.aon, before a tidy-up commit
service: { port: *8080 | integer, name: string }
```

```aon
# service.aon, after a tidy-up — new bytes, identical meaning
# The service schema.
service: { name: string, port: *8080 | integer }
```

Both unify to canon
`{"service":{"name":string,"port":*8080|integer}}`, yet a byte-level
pin breaks, forcing a pointless re-review; conversely, a semantic
change hidden two includes deep never touches the bytes the agent
pinned. The economics compound: prompt caches require byte-identical
prefixes, so a meaning-stable name for "the truth as of hash H" is
directly monetisable as cache hits — the query surface is
[G7](g7-machine-access.md)'s; the hash that names its entries is
this document's.

What is missing is one coherent layer: module identity, a version
scheme, a lockfile, a distribution channel that does not execute
code, and — the differentiator Aontu's canonical form makes nearly
free — a semantic integrity hash that survives refactors and
comments but breaks on any semantic change in the transitive
include closure.

## Current state

What exists is a resolver chain and a canonical form; both are good
bones, and both fall short in specific, enumerable ways.

- **Source loading.** `@"path"` loads, parses, and unifies another
  source in place (`docs/reference-language.md`, "Source loading").
  Extensions `.aon`/`.aontu` are tried for bare paths; relative
  paths resolve against the including file's own directory
  (`test/spec/file.tsv:load-rel-chain`); the entry base is
  configurable (TS `path` option, Go `NewWithBase`).
- **The resolver chain.** `makeModelResolver` (`ts/src/lang.ts`,
  ~757–816) tries memory → filesystem → package, composing
  `makeMemResolver`, `makeFileResolver`, and `makePkgResolver` from
  `@tabnas/multisource`. The memory resolver
  (`options.resolver.mem`) is the sandbox-friendly entry point the
  review counts as an asset; the package resolver calls
  `require()`, with the consequences the security comment above
  the function documents. At review time the Go port wired only the
  file leg (`go/source.go`, over `github.com/tabnas/multisource/go`);
  the landed chain in both ports is memory → module (this design's
  phase 2) → filesystem, and only the package leg remains
  TypeScript's, an asymmetry [G5](g5-trust-contract.md) records.
- **Spec coverage.** `test/spec/file.tsv` pins loading,
  merging, nested and colon-chain imports, relative chains,
  conflict errors, and the not-found error text, against fixtures
  in `test/spec/files/` (`__FIXTURES__` keeps rows hermetic).
- **Canonical form.** `unify(src).canon` renders a deterministic,
  reparseable text: map keys sorted alphabetically
  (`ts/src/val/MapVal.ts`, ~421, matching Go's sorted JSON
  marshalling), strings via `JSON.stringify`
  (`ts/src/val/StringVal.ts`), numbers pinned to JavaScript
  `Number.toString` in both implementations (`go/scalar.go`,
  `formatNumber`). Includes are load-transparent: the imported value
  unifies in place, so canon shows the merged result with no module
  boundary.

Four things structurally block the capability:

1. **No identity or version anywhere.** The resolver interface is
   find-by-path; nothing models "module", "version", or "the same
   truth in two places". There is no lockfile and no verb to fetch,
   pin, or publish (at review time `ts/src/cli.ts` accepted one file
   and `-c/--canon`, plus help/version flags; nothing else — the
   review's own verbs have since multiplied that surface).
2. **Canon is not semantically complete.** Closedness is not
   rendered — `MapVal.canon` and `ListVal.canon` emit `{…}`/`[…]`
   with no `close(…)` wrapper, so `close({x:1})` and `{x:1}`
   canonicalise identically despite behaving differently under
   further unification; `hide`/`type` marks are likewise invisible.
   A hash over today's canon could report "unchanged" for a real
   semantic change — the dangerous direction.
3. **Parse-level canon is outside the shared contract.** *(As first
   written this blocker said parse-level canon was not in TS/Go
   parity, citing an AGENTS.md divergence entry. That divergence
   (#30) is fixed and the entry deleted; parity is pinned by twin
   tests in both ports.)* The conclusion stands on a corrected
   footing: no shared spec mode *observes* `parse(src).canon`, so
   only `unify(src).canon` is contractual, and a hash must be scoped
   to post-unification canon.
4. **Evaluation and fetching are fused.** The resolver reads at
   parse time, inside evaluation; a network-fetching resolver
   there would break the hermeticity contract
   [G5](g5-trust-contract.md) establishes. Parsed trees are also
   single-use (the documented mutation caveat), so hashing needs a
   deliberate evaluation, not a peek at a live tree.

## Prior art

- **Dhall — semantic integrity checks.** `dhall freeze` pins each
  import with a SHA-256 of the CBOR-encoded *normal form* of the
  imported expression. Refactors, comments, and whitespace do not
  break the pin; any semantic change, including in transitive
  dependencies, does. The cost: Dhall has no versioning or
  discovery at all — every upgrade edits every import site, and
  content addresses carry no "what changed" narrative. Dhall pays a
  normalisation pass per hash; Aontu's existing canon makes the
  same idea nearly free. No unification-family language has it.
- **CUE — modules v3 and the Central Registry.** Domain-based
  module paths with the major version in the path (`@v0`),
  `cue.mod/module.cue`, Minimum Version Selection, distribution
  over any OCI registry with a hosted default (registry.cue.works),
  `cue mod init/tidy/publish`. The cost: a large tooling surface
  and registry operations; CUE's own history warns that each added
  stratum raised its floor. Integrity is byte-level (OCI digests),
  not semantic.
- **KCL — kpm.** `kcl.mod` plus `kcl.mod.lock`, push/pull to any
  OCI registry (ghcr.io, Harbor). Confirms OCI as the settled
  ecosystem default: every platform team already runs one.
- **Go modules and Nix flakes.** MVS resolution, `go.sum` byte
  hashes, a public checksum transparency log (sumdb); `flake.lock`
  pins byte-level narHashes. Byte hashing suits Go because gofmt
  makes formatting churn rare; config languages churn more, and
  meaning-preserving refactors break these pins.
- **buf / BSR.** Breaking-change checks enforced server-side at
  publish time — the precedent for registry hooks that refuse a
  push whose semantics regress, which
  [G3](g3-subsumption-evolution.md) makes computable for Aontu
  rather than heuristic.
- **Agent practice.** Context7's resolve-then-query pattern shows
  agents preferring a named, versioned authority over parametric
  memory; prompt-cache studies (a 7%→84% hit-rate gain purely from
  serialisation stability) make byte-stable canonical output an
  economic asset.

## Design space

**A. Git/URL imports with optional byte-hash pins.** Terraform- and
Bazel-style: `@"github.com/org/repo//schemas/service?ref=v2"`. No
new infrastructure, transparent provenance. Costs: tags are mutable
(a moved tag silently changes the truth), no version resolution
across a dependency graph, byte pins break on refactors, and fetch
logic creeps into the evaluator — against
[G5](g5-trust-contract.md).

**B. Piggyback on host package managers.** Ship `.aon` files inside
npm and Go modules; the package resolver already half-does this.
Disqualifying: `require()` executes code on load, the TS and Go
ecosystems would resolve versions differently (breaking the "same
truth in both implementations" contract), and non-Node/Go
consumers are locked out.

**C. Pure content addressing, Dhall-style.** Every remote import is
a URL plus a semantic hash; no versions, no registry, no lockfile.
Maximally tamper-evident and beautifully simple. Costs: no
discovery, no upgrade story short of editing every import site, and
no place to hang publish-time policy (G3 breaking gates). Right
mechanism, insufficient layer.

**D. Versioned modules over OCI, with a lockfile and canon-hash
pins.** CUE/KCL's settled shape — domain-based module identity,
SemVer with MVS, any OCI registry — plus the Dhall idea grafted on
top: the lockfile pins each dependency by a hash of its canonical
form, not its bytes. Costs: the largest tooling surface of the
four; a module file and lockfile to specify; OCI plumbing in two
implementations.

**E. A bespoke hosted registry service.** A custom protocol and a
service the project operates. Rejected without much ceremony:
infrastructure the project must run forever, and OCI already
provides storage, auth, replication, and org familiarity.

**Recommendation: D, with C's inline pin as a degenerate mode.**
The registry layer is commodity — adopt the ecosystem default and
spend no novelty budget on it. The differentiation is entirely in
the integrity layer: semantic hashes over canon give pins that
survive refactors and break on meaning — which none of CUE, KCL,
Go, or Nix offer, and which Dhall offers only without versioning.
An inline hash fragment keeps the no-lockfile case — a gist, a
prompt, a one-file agent sandbox — honest and pinnable. A is
subsumed (a git remote can become a fetch source later); B is
retired to a legacy role and fenced off by G5's resolver
confinement.

## Proposed design

### Module identity and import syntax

A module path is domain-based, CUE/Go-style, with the major version
in the path. An import is still just `@"…"` — the string's *shape*
routes it, so the grammar is untouched and every existing include
keeps its exact behaviour:

*(Refined 2026-09-04 by
[ADR-020](../../ADR.md#adr-020--a-module-path-is-domainpath-and-the-domain-is-a-proved-namespace),
which settles **which** domains. The shape below is unchanged and needs
no amendment — `github.com/alice/widgets@1` already matches it, so the
convention costs no grammar, no pattern and no spec row. What ADR-020
adds sits above the language, in what a repository will accept for
publication: forge namespaces first, proved by the OIDC claim the forge
issues, and verified domains later. A module resolved locally or from a
vendor tree is unaffected, which is why nothing here moves.)*

```aon
# Module import: domain-shaped first segment + @<major>.
service: @"corp.example/schemas/service@1"

# Optionally frozen inline (SRI-style fragment) — the degenerate
# no-lockfile mode for single-file and agent-sandbox use:
service: @"corp.example/schemas/service@1#aon1-4vJemVYtWFR2mQeN…"

# Everything else resolves exactly as today:
extra: @"./local-fragment.aon"
```

A string routes to the module resolver only when it matches
`host.tld/path…/name@N` (first segment contains a dot; trailing
`@<integer>` major). Anything else falls through to the existing
chain unchanged, so no current spec row can be affected.

### Module file and lockfile — written in Aontu

The module file is ordinary Aontu, validated against a schema the
toolchain ships (the language dogfooding its own validation verb,
[G2](g2-validation-verb.md)):

```aon
# mod.aon — module identity and requirements
mod: {
  path: "corp.example/schemas"
  main: "schemas.aon"
}
dep: {
  "corp.example/schemas/service@1": { v: "1.4.2" }
}
```

The lockfile is machine-written Aontu **in canonical form** — one
line, sorted keys, diffable, and parseable by the language itself:

```aon
# mod-lock.aon (generated by `aontu mod tidy`; do not edit)
{"lock":{"corp.example/schemas/service@1":{"canon":"aon1-4vJemVYtWFR2mQeN…","oci":"sha256:6b86b273ff34fce1…","v":"1.4.2"}}}
```

Each entry carries **two** pins with distinct roles: the OCI digest
certifies *these are the bytes the registry served* (transport
tamper-evidence, free from OCI); the canon-hash certifies *this is
the meaning that was reviewed* (semantic tamper-evidence, Aontu's
contribution). Version selection is Minimum Version Selection —
deterministic without a solver; the lockfile *confirms* the
resolution rather than determining it.

### The canon-hash

`canonHash(v)` is defined as:

```
"aon1-" + base64url( SHA-256( UTF-8( hcanon( unify(module) ) ) ) )
```

where `hcanon` — the **hash form** — is exactly today's
unify-level canon with two additions that close its semantic gaps:

- a closed map or list renders wrapped: `close({…})`, `close([…])`
  (today `MapVal.canon`/`ListVal.canon` drop closedness);
- `hide`/`type` marks render as their builtin wrappers:
  `hide(x)`, `type(x)`.

Both additions reuse existing parseable syntax, so the hash form
remains valid Aontu source and round-trips:
`hcanon(unify(parse(hcanon(v)))) == hcanon(v)` is a spec-suite
property. The hash is scoped to *post-unification* canon only —
parse-level canon parenthesisation differs between TS and Go
(AGENTS.md) and is excluded by construction. User-facing `canon`
is unchanged; `hcanon` is a separate rendering, so no existing
canon row moves.

The hash covers the module evaluated **standalone**: its own
include closure resolved and unified at its own root, before any
consumer context — Dhall's choice (hash the normal form of the
imported expression), and what makes the pin transitive: an edit
two includes deep changes the unified root, hence the hash.
Unresolved references to consumer context (`$.x`) must stay part
of the hashed meaning in textual form; today standalone
unification reports them as `no_path` errors and canon renders
`nil`, so preserving them is part of the `hcanon` definition, not
free behaviour.

**The pin survives** comments, whitespace, formatting, key
reordering, splitting one file into several includes — any refactor
that leaves the unified value identical. **It breaks on** any
semantic change in the transitive closure: a default flipped, a
field added, a map closed, a constraint tightened.

**The honest label.** This is a *canonical-text* hash, not a hash
of semantic equivalence classes: canon is deterministic syntax,
not a unique normal form — `number|integer` denotes the same value
set as `number` yet canonicalises differently (`DisjunctVal` drops
only `same()` alternatives). The failure direction is the safe one:
a false "changed" forces a needless re-review, while a false
"unchanged" is impossible *provided the hash form is semantically
complete* — exactly why the `close`/mark additions are part of the
definition, not an optimisation. Once
[G3](g3-subsumption-evolution.md)'s subsumption lands, a
minimisation pass (drop disjuncts subsumed by siblings) can
upgrade the hash toward a true semantic normal form under a new
scheme id; the `aon1-` prefix exists so that day is an upgrade,
not a breakage.

### Resolution, offline, and vendoring

Evaluation never touches the network. The module resolver slots
into the existing chain — memory → **module** → filesystem →
package — and reads only local stores: `aontu_meta/vendor/` in the
project, then a content-addressed user cache
(`~/.cache/aontu/mod`, keyed by canon-hash). The memory resolver
stays first so sandboxes and the spec suite can stub module paths
without touching disk. [G5](g5-trust-contract.md) pre-registers
sandbox rules for any future remote resolver; this design
satisfies them trivially by never resolving remotely during
evaluation. Fetching is a separate, explicit tool step:

```
aontu mod get           # fetch deps into the cache, verify both pins
aontu mod tidy          # resolve MVS, rewrite aontu_meta/mod-lock.aon
aontu mod vendor        # materialise the closure into aontu_meta/vendor/
aontu mod publish       # package + push the current module
aontu hash [file]       # print the canon-hash of a file/module
```

A module import absent from vendor and cache is an evaluation
error instructing the fetch step; a present module whose
*recomputed* canon-hash disagrees with the lock (or inline
fragment) is an integrity error — verification is always local,
the registry's annotation merely advisory. Both errors are
reported via the [G2](g2-validation-verb.md) contract; in the
spirit of the existing `source not found:` row, the asserted
substrings are:

```
module not fetched: corp.example/schemas/service@1 (run: aontu mod get)
module integrity: corp.example/schemas/service@1 expected aon1-4vJe… got aon1-9kQz…
```

The determinism this rests on — same file set plus same `$`
bindings gives identical output — is
[G5](g5-trust-contract.md)'s guarantee; this design consumes it
and adds none of its own.

### Distribution and registry hooks

A module is an OCI artifact: config media type
`application/vnd.aontu.module.v1+json`, one layer holding the
module source tree, manifest annotations carrying module path,
version, and canon-hash. Any OCI registry works; no hosted default
is required for v1. Two hooks make the registry more than storage:

- **Publish-time breaking gate.** `aontu mod publish` runs the
  breaking check against prior published versions, and a
  registry-side hook can enforce the same check server-side,
  buf-style. The semantics of "breaking" belong wholly to
  [G3](g3-subsumption-evolution.md); this layer only invokes them
  where versions are minted.
- **"Has the truth changed?"** becomes one annotation read and a
  string compare — no download, no parse. The same hash names
  cache entries for [G7](g7-machine-access.md)'s query surface: an
  agent's context keyed "truth as of `aon1-4vJe…`" stays
  prompt-cache-stable until the meaning actually moves.

## Boundary: what we will not do

- **No network access during evaluation, ever** — fetching is a
  tool verb; hermeticity is [G5](g5-trust-contract.md)'s contract
  and this design must not be the thing that breaks it.
- **No private-registry auth design in v1** — ambient OCI
  credentials (docker login) suffice to start; a credential surface
  designed in haste becomes an exfiltration channel.
- **No signing or provenance attestation in v1** — dual pins give
  tamper-evidence; signatures answer "who", a separable problem
  with mature OCI ecosystem answers (sigstore) to adopt later.
- **No version ranges or dependency solver** — MVS only; a
  constraint solver in resolution reintroduces the
  nondeterminism the review's "no SMT solvers" trap exists to keep
  out.
- **No project-operated central REGISTRY service** — any OCI
  registry works; running infrastructure forever is not a language
  feature. *(Amended 2026-08-30 by
  [ADR-013](../../ADR.md#adr-013--the-project-operates-one-transparency-log-and-nothing-else),
  which admits exactly one service and is explicit about what this
  bullet was right about. The rejection above has two halves: "OCI
  already provides storage, auth, replication and org familiarity"
  does NOT apply to a transparency log — a log provides none of those,
  and OCI provides no log — while "infrastructure the project must run
  forever" applies unchanged and is the whole cost. A transparency log
  is not a registry: it stores no artifacts, a build with a lockfile
  never touches it, and it can be frozen without breaking any lockfile
  that references it. Those constraints are the ADR, not implementation
  detail. This bullet still forbids what it always forbade — a hosted
  place that keeps module bytes. See [G10](g10-transparency.md).)*
  *(Amended again 2026-09-04 by
  [ADR-019](../../ADR.md#adr-019--the-project-stores-module-bytes-and-federates-the-log):
  **the remaining half now goes too.** The project stores module bytes
  and operates a repository, and the log it was admitted for is
  federated to Sigstore rather than run — one service, and a different
  one. What survives of this bullet is its true premise, that running
  infrastructure forever is a cost and not a feature. What it got wrong
  was the size of the cost: storage of a million module versions is
  single-digit dollars a month and egress is free on the chosen
  provider, so the recurring bill is a moderation obligation with a
  named human attached, not a hosting bill. The other half of the
  original reasoning, "OCI already provides storage, auth, replication
  and org familiarity", is moot — the constraint that put bytes on a
  forge foreclosed the OCI channel before this decision was taken.)*
- **No import namespaces or symbol system** — an import stays a
  value unified in place, not a scope; module-scoped identifiers
  are exactly the surface-area creep toward CUE the review warns
  against.
- **No semantic minimisation inside the v1 hash** — it needs
  [G3](g3-subsumption-evolution.md)'s subsumption to be principled;
  v1 ships the clearly-labelled canonical-text hash.
- **No error-format invention** — integrity and not-fetched errors
  are shaped by the [G2](g2-validation-verb.md) contract.
- **No comment or formatting preservation in distributed modules**
  — modules travel as source but pin as meaning; a
  format-preserving rewrite story belongs to
  [G7](g7-machine-access.md)'s patch surface.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TS/Go hash divergence (string escaping, number formatting, future canon drift) | Medium | High — pins flap by implementation | Scope to unify-level canon (already in parity); add escape-heavy and extreme-magnitude `hcanon` rows; add cross-implementation byte-equality of hash form to the shared suite |
| Hash form misses a semantic feature (as canon misses closedness today) | Medium | High — false "unchanged", the unsafe direction | Per-Val completeness audit as a spec-writing step; scheme id (`aon1-`) so a discovered gap ships as `aon2-` rather than silently re-pinning |
| G1's new constraint syntax changes canon, invalidating all pins | High | Medium — one-time ecosystem re-pin | Coordinate: hash GA after [G1](g1-constraint-algebra.md)'s canon settles, or bump the scheme id with G1's landing |
| Single-use trees force an extra evaluation per hash; large closures are slow | Medium | Medium | Content-address the cache by source-byte digest so unchanged inputs never re-evaluate; hash at fetch/publish time, not per eval |
| Canon round-trip regression from `hcanon` work leaking into `canon` | Low | High — breaks the shared-suite contract ([counts: register rule 5](progress.md#the-update-protocol)) | `hcanon` is a separate rendering; existing canon/gen/err rows are the regression gate |
| Registry/tooling surface overwhelms a small project (CUE's floor-raising lesson) | Medium | Medium | Phase strictly: hash first (useful alone, zero infrastructure), registry later; vendoring works with no registry at all |
| Dependency confusion / name squatting on domain paths | Low | Medium | Domain-based identity ties names to DNS control; first-segment host mapping; lockfile pins make substitution detectable |
| Adoption: nobody publishes modules for a small ecosystem | Medium | Medium | The hash is valuable with zero publishers (vendored-copy drift detection, cache keys); inline pins work on gists and single files |

## Implementation plan

Spec-first throughout: every behaviour lands as `test/spec/*.tsv`
rows, TypeScript (canonical) makes them pass, then the Go port.
Nothing may regress any row of the shared suite (counts in [the register's protocol rule 5](progress.md#the-update-protocol)) or the
canon convergence; `@tabnas` pins stay exact.

**Phase 0 — the hash form (S/M).** Add the `hcanon` rendering
(closedness wrappers, mark wrappers) and a new shared-spec mode
`hcanon` asserting its text. Rows: closed maps/lists at depth,
marks, spreads, optional keys, prefs, refs, escape-heavy strings,
extreme-magnitude numbers, and `hcanon` idempotence/round-trip.
Touches: `ts/src/val/MapVal.ts`, `ts/src/val/ListVal.ts`,
`ts/src/val/Val.ts` (default `hcanon` delegating to `canon`),
`ts/test/spec.test.ts`, `go/mapval.go`, `go/listval.go`,
`go/val.go`, `go/spec_test.go`, `docs/shared-spec.md`, new
`test/spec/hcanon.tsv`. User-facing `canon` must not change.

**Phase 1 — the hash itself (S).** `canonHash()` in the API and
`aontu hash` in the CLI; a `hash`-mode row family pinning full
`aon1-…` strings cross-implementation. Touches: `ts/src/aontu.ts`,
`ts/src/cli.ts`, `go/aontu.go`, `go/cmd/aontu/`, the two spec
runners, new rows in `test/spec/hcanon.tsv` (or a sibling
`hash.tsv`). This completes the review's Phase B item ("canon-hash
pinning") and is independently useful with no registry.

**Phase 2 — module identity and local resolution (M). LANDED.**
Module-path routing in the resolver chain, `mod.aon`/`aontu_meta/mod-lock.aon`
reading, vendor-dir and cache lookup, integrity verification, and the
error shapes — three rather than two, the third being the depth bound
verification needs (see the [register](progress.md)). Spec rows stay
hermetic the way `file.tsv`'s do: real fixture trees under
`test/spec/files/mod*/`, run under the FIXTURES trust root. (The memory
resolver still shadows module paths — it is first in the chain — but a
stub proves routing only, and what needed proving was the store
lookup.) Touches: `ts/src/lang.ts` (resolver chain), new
`ts/src/mod.ts`, `go/source.go`, new `go/mod.go`, new
`test/spec/mod.tsv`, `docs/reference-language.md`. Existing `file.tsv`
rows are the guard that non-module paths behave byte-identically, and
`mod.tsv` adds three of its own for the routing predicate.

**Phase 3 — module tooling (L). LANDED, local half.** `aontu mod
tidy/vendor`; MVS resolution; lockfile writing in canonical form.
Landed as designed, in `ts/src/mod-tool.ts`, new `go/modtool.go`,
`ts/src/cli.ts`, new `go/cmd/aontu/mod.go` and
`docs/reference-api.md`. `get`/`publish` over OCI did NOT land: the
network code the design puts outside evaluation also sits outside
what this build can test — there is no registry to integrate
against — and the CLIs name the two subcommands and say which half
is missing rather than answering "unknown subcommand". Because
nothing the phase does is language behaviour, its parity discipline
is the CLI one (twin per-port tests plus a byte-for-byte diff of the
two commands over a fixture corpus, streams AND the files they
leave behind), not shared spec rows. See the
[register](progress.md) for the three departures.

**Phase 4 — registry hooks and agent integration (M). LANDED.**
Publish-time canon-hash annotations; the breaking gate invoking
[G3](g3-subsumption-evolution.md); hash-keyed cache/query
integration with [G7](g7-machine-access.md)'s surface. Sized M
here because the semantics are owned elsewhere; this phase is
wiring at the publish boundary — and that is exactly what landed,
as `aontu mod manifest`, which computes and gates everything a
publish would send and stops before sending it. The annotation set
and the gate ARE the phase; the push is the one part that carries
no semantics, and it is the part with no registry to send to. The
hash-keyed cache integration needed no new code: the cache G6.2
built is already keyed by the hash the annotation carries. See the
[register](progress.md) for the three departures.

## Open questions

- **Standalone-evaluation hashing of fragment modules.** A module
  written as a reusable fragment may lean on consumer context
  (`$`-rooted refs, `$name` variables); the hash form keeps them
  in unresolved textual form — correct, but is it
  *useful* for heavily parameterised modules, or should `mod.aon`
  declare required bindings so the hash covers a closed interface?
  Decided by: how common context-dependent modules prove to be,
  and G5's ruling on `$` bindings as evaluation inputs.
- ~~**Text versus binary hash encoding.**~~ **Settled: text.** The
  landed hash is computed over UTF-8 hash-canon text, with the
  `aon1-` scheme id in the string and cross-implementation identity
  pinned by the `hash` spec mode. The one escaping edge the fuzz
  concern predicted is real and tracked: lone surrogates are
  DIVERGENCE.md's open entry #24. (The question as posed: Dhall
  hashes CBOR to dodge text-escaping ambiguity; the parity suite's
  byte-identical canon argued text is safe.)
- ~~**New spec modes versus native-only tests.**~~ **Settled: new
  modes.** `hcanon` and `hash` are shared spec modes run by both
  runners (their counts live in the register's rule 5), so
  cross-implementation identity is contractual, as this question
  said it had to be. (The question as posed: native-only testing
  would leave the hash outside the cross-language contract.)
- **Scheme-bump policy when canon evolves.** G1 will extend canon
  with constraint-atom syntax; later features will too. Options: a
  scheme id bump per canon-affecting release, or freezing hash
  scope to a language-version tag recorded in the lockfile.
  Decided by: how often canon actually changes once G1 lands, and
  registry migration cost per bump. *(Half settled by landing order:
  the hash shipped AFTER G1's canon settled, with the scheme id
  (`aon1`) in the string as the bump mechanism — the register's G6
  notes record that its own risk row materialised on schedule. The
  bump cadence itself stays open.)*
- **Lockfile granularity in monorepos.** One `mod.aon` per
  repository versus per directory-module (CUE allows nesting);
  affects vendoring layout and the resolver's search rules.
  Decided by: the first real multi-module consumer's shape.
- **Memory-resolver shadowing of module paths.** Letting the memory
  resolver pre-empt module resolution is what makes spec rows and
  sandboxes hermetic — but it also lets an embedding host silently
  substitute a pinned module. Whether shadowing requires an
  explicit opt-in is a [G5](g5-trust-contract.md) capability-surface
  question this design defers.

## Amendment 2026-09-03: generated state under `aontu_meta/`

Everything the tools write into a project lives in one folder,
`aontu_meta/`, and nothing authored does. Today that is the lockfile,
`aontu_meta/mod-lock.aon`, and the vendored closure,
`aontu_meta/vendor/<module-path>@<major>/`; the engine pin of
`docs/design/ENV.0.md` joins them as `aontu_meta/version` when it is
built. `mod.aon` stays at the root, because it is the declaration a
person writes, as `go.mod` and `package.json` are, and the project root
is still found by walking up to it.

Why one folder: a reader of a repository sees one place to expect
generated files and one place to ignore, a container image or a sandbox
copies one tree, and a new tool that needs to write into a project has
a home without a new convention each time. The resolver's stores are
unchanged in kind: the project's `aontu_meta/vendor/` first, then the
user cache; `manifest` excludes `aontu_meta/` from the published layer
as it excluded `aon_vendor/`, for the same reason.

The old layout, `aon_vendor/` and `mod-lock.aon` at the root, is not
read. The `mod` verbs name it once when they find it, with the two
commands that rebuild the new one, and the fixtures, the use cases and
the documentation moved with the code.

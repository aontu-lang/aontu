# Support structures for community and production use

*Companion to [REVIEW.md](REVIEW.md): what aontu needs around the
language for actual adoption. Everything checkable below was checked
on 2026-08-26 — against the live npm registry, the Go module proxy,
the GitHub API, and this repository — during the same review effort.*

## The one-sentence version

The semantics are years ahead of the support structures; adoption will
be decided entirely by the latter.

## 1. Release reality (blocking everything else)

**Nothing an enterprise team can install today contains any of the
agent-facing surface.** npm's `latest` is 0.52.1 and Go's is v0.1.10
(both 2026-08-17); everything this repository is positioned around —
`vet`, `subsume`, `breaking`, `get`, `why`, `set`, `hash`,
`relations`, `mod`, the MCP server, the skill, the grammars — is
post-0.52.1 and unpublished. Verified worst case: the *installed*
0.52.1 CLI, invoked as `aontu vet schema.aon data.json`, **silently
evaluates the first file and exits 0** — a validation gate that passes
everything, wired exactly as the README's loop suggests. Compounding
it: `vet-action/` defaults to `npx aontu@0.53.0`, a version that does
not exist, so the shipped CI action fails at install; 38 error codes
are stamped `since 0.53.0` in the registry an agent would filter
against a 0.52.1 binary; and the npm metadata is a stub
(`"description": "Unifier."`, `"keywords": ["unify"]`).

**Act:** publish 0.53.0 (npm) and tag Go, with real package metadata.
Until this ships, every other row in this document points at vapor —
and the flagship consumers stay pinned to 0.49 via `@voxgig/model`,
which is the second act: bump that pin and release the toolchain, or
the only production users can never touch the new surface.

## 2. Interop is strategy, not a checklist item

JSON Schema's decisive 2026 advantage is not its validator ecosystem —
it is that **every major LLM provider's structured-output API natively
constrains generation to JSON Schema**. Aontu's GBNF grammar serves
only self-hosted stacks. Without a JSON Schema *export*, aontu cannot
ride the native structured-output path and then apply `vet` as the
semantic gate — the hybrid an enterprise would actually deploy — and
MCP tool `inputSchema`s (which the protocol requires as JSON Schema)
cannot be derived from aontu tool models (use case 09's interop wall).
Without an *import*, the existing schema estates (OpenAPI, CRDs) have
no migration path, and apidef remains 10k lines × 2 ports of bespoke
ingestion with its own defect history. The constraint algebra maps
cleanly onto JSON Schema's core (bounds, pattern, length, enum,
required/closed); the mapping is lossy at the edges (defaults,
cross-field, exact leaves) and should say so per construct.

**Act:** `aontu jsonschema <file> [--at path]` export first (it
unlocks structured outputs + MCP interop), import second, both
specified in docs with the lossy edges named. This is the highest-
leverage feature outside the language itself.

**Export done 2026-08-27.** `aontu jsonschema [--at <path>] [--strict]
[--format text|json] <file>` in both ports, plus a library call and an
MCP tool. Draft 2020-12 on stdout, so a redirect writes a usable file.
The mapping is specified per construct in
[`docs/reference-api.md`](../docs/reference-api.md#aontu-jsonschema),
and the lossy edges are *named at runtime*, not just in prose: `must()`,
the exact numeric leaves and an unresolved residue each produce a
`SchemaLoss` on stderr beside the schema, `--strict` turns the report
into a refusal for a CI job that would rather fail than ship a schema
weaker than its model, and `--format json` puts both halves in one
envelope. `test/spec/jsonschema.tsv` (54 rows) pins the mapping in both
engines.

The money edge that made the "exact leaves" loss look fatal is answered
by convention rather than machinery — a decimal string plus a
conversion mark, in
[`docs/how-to.md`](../docs/how-to.md#carry-exact-money-over-json) —
so an exported schema can carry exact money that a stock validator
enforces. Import remains open, and remains the migration path for the
existing OpenAPI/CRD estates.

## 3. Distribution: finish the trust loop before the network

The local module half exists; use case 11 and BUGS.md §31–32 showed
the sharp edges (nil pins, transitive vendoring, tidy re-pinning
tampered content, undocumented vendor layout, no `mod verify`).

**Done 2026-08-27** — the trust loop closes locally: a transitive
closure vendored flat now resolves (every enclosing `mod.aon` root is
tried, not just the nearest), `tidy` refuses to pin a module it cannot
evaluate rather than locking `canonHash(nil)`, `aontu mod verify`
checks the store against the committed lock without rewriting it (the
verb a CI job runs instead of `tidy`), and the hand-vendoring layout
is documented in
[`how-to.md`](../docs/how-to.md#vendor-a-module-by-hand) and
[`reference-api.md`](../docs/reference-api.md#aontu-mod). See BUGS.md
§31–32 and the CHANGELOG.

The network half (`mod get`/`publish`) needs a registry to exist — but
the *consumer-shaped* requirements are already discoverable from
sdkgen, which built copy-based distribution with provenance stamps,
drift checking, and install-time renames because live includes didn't
fit its needs. Design the registry against that user, not in the
abstract. Still open beside it: decide the package-import story
*before* the G5.6 trust flip breaks every consumer's `node_modules`
include pattern.

## 4. Developer surfaces

| Surface | State (verified) | Act |
|---|---|---|
| Playground / web REPL | None; zero mentions in-repo. The TS engine embeds in a browser trivially — the cheapest credibility artifact this project could ship | Static page: editor, eval/canon/vet panes, shareable snippets |
| Docs site | Excellent Diátaxis markdown, in-repo only; no rendering, search, or versioning | GitHub Pages over the existing docs; version selector at first breaking change |
| Editor extensions | VS Code extension exists at v0.1.0, unpublished; vim/emacs are copy-files-manually; LSP lacks go-to-definition/references and hover evaluates unconfined | Publish to Marketplace + Open VSX; confine hover; definition/references next (the graph data already exists) |
| MCP | Server is real but exposes 6 of 11 capabilities (no subsume/breaking/set/relations/hash), takes document *text* per call (no file/uri param), and is listed in no MCP registry | Complete the tool set, add a path/uri parameter, list it (pulsemcp/glama et al.), ship an `mcpServers` stanza in the README |
| CLI gaps | `diff` is MCP/library-only; `relations`/`trim` error verdicts carry zero findings; ANSI hardcoded into piped output; no `aontu explain <code>` though ~100 rich hints exist in `hints.ts` | Mechanical fixes; `explain` + a rendered code→remediation catalog serve agents and humans alike |
| Conformance | `test/spec/` (86 files, 3k+ rows, 18 modes) is a real conformance suite — excluded from the npm tarball, no third-party harness story | Ship it in the package; document "how to claim conformance" for a third implementation |

## 5. Community and governance

Verified absent, all of it: SECURITY.md, CODE_OF_CONDUCT.md,
CONTRIBUTING.md, issue templates, Discussions (disabled), any chat
channel, any second maintainer. GitHub shows 10 stars, 0 forks, 8
open issues — all self-filed. The dependency closure (`@tabnas/*`) is
same-author, so an enterprise vendor-risk review reads the entire
stack as bus-factor 1. Four of six README badges (Coveralls, Snyk,
DeepScan, CodeClimate) have no backing CI and contradict the repo's
own anti-drift doctrine. And this review's own CI runs caught the
ADR-002 coverage gate flaking red on an untouched tree
(`ListVal.ts:206–207` branch arms pass/fail/pass across identical
trees) — the kind of nondeterminism that erodes exactly the trust the
gate exists to build.

**Act:** SECURITY.md (the trust contract makes disclosure-handling a
product promise, not hygiene), CONTRIBUTING.md pointing at the
AGENTS.md discipline that already exists, enable Discussions, prune or
re-wire the badges, pin the flaky coverage arms with a deterministic
spec row. A second maintainer is not a file you can add, but the
conformance suite plus the parity method is precisely the
infrastructure that makes one possible — say so publicly.

## 6. The LLM-facing problem is existential and fixable

For a language whose thesis is "agents read and write this", the
decisive support structure is *what models know*. Today: near zero.
Training-data presence is a pre-2026 unifier with none of the current
surface; search resolves "aontu" to the Irish political party; the
mitigations the repo already built — the skill, the GBNF/Lark
grammars, `agentsmd`, the executable docs — are exactly right and all
unpublished. There is no `llms.txt`, no MCP-registry listing, and the
`agentsmd` stanza on a real production model degenerates to a
depth-1 all-`top` shape (near-zero information).

**Act:** publish (again, §1 gates everything); add `llms.txt` +
llms-full to the docs site; make the skill and grammar installable
artifacts, not repo files; deepen `agentsmd`'s shape rendering; and
consider the name problem honestly — if renaming is off the table,
own the SEO battle deliberately ("aontu lang", consistent tagline,
the playground as the canonical link target).

## 7. A versioned language, separate from its implementations

`_` becoming a reserved hole was a deliberate breaking change shipped
in a 0.x minor; the language's identity currently rides two package
version lines. Before any 1.0: a language version distinct from
implementation versions, a stability policy naming what the spec suite
pins as frozen, and a compatibility statement per release ("documents
valid under L1 remain valid under L2, except…") — the language has a
`breaking` verb; its own releases should be held to the standard it
sells. The dogfooding opportunity is free marketing: run
`aontu breaking` over `std/system` and the spec corpus between
releases and publish the reports.

## 8. Sequenced

1. **Publish 0.53.0 + Go tag; fix vet-action's default; real npm
   metadata; bump `@voxgig/model`'s pin.** (Days; unblocks all.)
2. **JSON Schema export; MCP completion + registry listings;
   llms.txt; publish the VS Code extension.** (The agent-facing
   wedge.)
3. **Playground + rendered docs site.** (The human-facing wedge.)
4. **SECURITY/CONTRIBUTING/Discussions; badge hygiene; ship the
   conformance suite.** (The trust wedge.)
5. **Module verify/transitive-vendor fixes; package-import design;
   then the registry, interviewed against sdkgen.** (The sharing
   wedge.)
6. **Language versioning policy; dogfooded breaking reports.**
   (The 1.0 runway.)

Items 2–6 are each independently useful; item 1 is the tide that
floats them.

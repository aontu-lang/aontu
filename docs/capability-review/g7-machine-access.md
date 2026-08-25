# G7: A machine-facing access surface

*Status: implemented — all seven phases landed in both ports (`get`
and its projections, `why` with its provenance recorder, the overlay
`set`, the delivery skin, and the REPL inspection mode). Phase 7 stood
PARTIAL from 2026-08-21 until 2026-08-24, while its `--jsonl` session
mode was unreachable in the Go CLI and TTY-gated in the TypeScript
one; the register records what closed it. Phase 5's STAGE 2, the
format-preserving in-place edit, remains deferred by the phase
itself. Per-phase status and the
corrections this document needs are in the
[progress register](progress.md), which is authoritative for status;
this document is authoritative for design. Part of the
[capability review](index.md) (August 2026). This document expands gap
G7 — query, provenance, patch, and delivery: the surfaces through
which agents consume an Aontu definition as ground truth — with
alternatives, an explicit boundary, risks, and an implementation
plan.*

## Problem

Agents do not consume ground truth by evaluating whole files into one
JSON blob. They hold lightweight identifiers, retrieve task-sized
slices on demand, ask why a value holds, and patch by path. Aontu
today supports none of these: the CLI (ts/src/cli.ts) evaluates one
file to JSON or canonical form, full stop, and the evaluated output
is a terminal artifact rather than a knowledge substrate.

First failure: query. A modest system definition —

```aon
# system.aon
services: &: {
  image:    string
  replicas: integer
  owner:    string
}
services: auth:    { image: "auth:v2.3", replicas: 3, owner: "identity" }
services: billing: { image: "billing:v1.9", replicas: 2, owner: "payments" }
services: gateway: { image: "gw:v4.0", replicas: 4, owner: "platform" }
```

An agent repairing the auth deployment needs `$.services.auth` and
nothing else. It wants to write `aontu get $.services.auth --canon`
— and cannot. The only option is `aontu system.aon`, whose output
grows linearly with the whole system: every billing and gateway
token is context-window noise for the auth task. The survey's
context-engineering doctrine is unambiguous — the smallest set of
high-signal tokens, retrieved just-in-time by identifier — and there
is no way to follow it. Nor is there a cheaper first look: no
keys-only listing ("what services exist?"), no types-only view
("what shape must a service have?"), no depth limit.

Second failure: provenance. Layered definitions are Aontu's home
ground:

```aon
# org.aon
services: &: { replicas: *1 | integer }

# service.aon
@"org.aon"
services: auth: { replicas: 3 }
```

The evaluated result has `replicas: 3`. A reviewer — human or
agent — asks: why 3? Which file set the default, which overrode
it? The question has no answer today. Sites (`{row, col, url}`)
are tracked only for *errors*: a conflict gets a two-site
`NilVal`, but on every successful unification the winning value
keeps its own site and the peer's is dropped — `update()` in
ts/src/unify.ts is literally a one-line function with a
`TODO: update x with y.site` comment. So
`aontu why $.services.auth.replicas` cannot be built without
touching the engine, and LSP hover (ts/src/lsp.ts `computeHover`)
can show the resolved value but never its origin story. CUE's
community documents exactly this as the incumbent's worst pain;
building positive provenance into a young engine is far cheaper
than retrofitting it later.

Third failure: patch. The agent decides auth needs five replicas.
The lattice-honest move — append a new conjunct — fails correctly
but unhelpfully:

```aon
@"service.aon"
services: auth: { replicas: 5 }   # conflict: 5 vs 3 — correct, but
                                  # now what?
```

`3` is a pinned literal, so the overlay conflicts; the right repair
is to edit the pinning site. But there is no evaluated-path →
file/line map to find that site, canon destroys comments and source
order by construction (docs/reference-language.md), and no
format-preserving rewriter exists — the parser stack discards
comments at parse time. The agent's remaining option is regex
surgery on text it does not understand.

Finally, delivery. There is no MCP server, so none of the above is
reachable from an agent harness; the REPL is human-only (no
structured per-command protocol); and no machine-consumable grammar is
published, so constrained decoding — now production infrastructure
— cannot guarantee syntactically valid Aontu emission. Aontu is a
low-resource language for every model, and the llms.txt post-mortem
shows a file sitting in a repo is advisory unless tools actively
pull it into agent loops. *(Every delivery gap this paragraph names
is now closed by phase 6 — the `aontu-mcp` server, the published
grammar under `grammar/`, and the executed skill — and the register
has the pins; the paragraph stands as the problem statement it
was.)*

## Current state

What exists and is reusable:

- **Path lookup.** `ctx.find(path: string[])` (ts/src/ctx.ts) walks
  the unified root through `MapVal`/`ListVal` pegs — the seed of
  `get`. TS only: go/ctx.go has no equivalent; at review time it was
  also not exposed on any CLI. *(The landed `get` took a different
  seed — see the query section's as-landed note.)*
- **Per-node canonical form.** `Val.canon` renders any node, not
  just the root, as deterministic reparseable text
  (docs/reference-language.md). A path-scoped slice is therefore
  "find, then canon" — the rendering half of query is free.
- **The explain trace.** `AontuOptions.explain`
  (docs/reference-api.md) threads an opt-in trace through
  `ctx.explain`; `explainOpen`/`ec`/`explainClose` and
  `formatExplain` (ts/src/utility.ts) record every `unite` call in
  ts/src/unify.ts as nested positional arrays (pass count, path,
  operand ids and canon, result). Honest assessment: this is a
  *derivation trace*, not provenance. It proves the hook points
  exist and costs nothing when off (`ctx.explain &&` guards), but
  it records no file/line sites, has no per-path index, grows with
  every unite call across up to `maxcc = 9` passes, its positional
  format is not a contract, and it is TS-only — the Go port has no
  explain machinery at all.
- **Sites, lazily.** `Site` (ts/src/site.ts) carries
  `{row, col, url}`; `Val` allocates its site on first access via a
  getter (ts/src/val/Val.ts) — an explicit optimisation because
  most sites are never read. Provenance must not silently defeat it.
- **The LSP split.** The library/handler/server layering
  (ts/src/lsp.ts, ts/src/lsp-server.ts, go/lsp, docs/lsp.md) is the
  template for any resident surface: pure analysis functions, a
  transport-free protocol handler, a thin stdio loop. Hover already
  reads the unified tree — and re-parses and re-unifies the whole
  document per request, which bounds what per-request provenance
  may cost.
- **A REPL.** ts/src/cli.ts ships one (CUE has none): line-oriented,
  one `Aontu` instance per session, each line evaluated
  independently, `:canon`/`:json` mode switches. A head start for
  an inspection tool.
- **Marks as projection machinery.** `hide`/`type` marks already
  exclude nodes from generation (ts/src/val/BagVal.ts) — evidence
  the engine can carry view-relevant metadata through unification.

What structurally blocks the capability:

- **Positive provenance is not recorded.** Success drops the peer's
  site (`update()` in ts/src/unify.ts); only `NilVal` keeps
  `primary`/`secondary`. Nothing remembers which ordered conjuncts
  produced a resolved value.
- **Single-use trees.** The documented contract in ts/src/val/Val.ts
  (the MapVal/ListVal TOP fast-path refines in place) makes parsed
  and unified trees single-use. A resident server cannot cache live
  `Val`s and serve queries from them; it must cache *rendered*
  artifacts.
- **Unification is global.** A `$.path` reference or spread anywhere
  can contribute to any node, so there is no sound partial
  evaluation of a fragment. `get` must evaluate the whole document;
  the honest win is output slicing plus caching, not partial
  evaluation.
- **No source map, no CST.** Comments and layout are discarded at
  parse; no evaluated-path → contributing-spans map exists; nothing
  can rewrite a file in place while preserving what the author
  wrote.
- **No grammar artifact.** The surface is defined operationally by
  the jsonic plugin stack (ts/src/lang.ts and the `@tabnas/*`
  ports); there is no declarative grammar file to publish.
- **Resolver posture.** Any resident server inherits the
  memory → filesystem → package resolver chain (`makeModelResolver`,
  ts/src/lang.ts) and its documented stance that opening
  an untrusted source is running it — confinement is
  [G5](g5-trust-contract.md)'s contract and a precondition here.

## Prior art

**Context engineering and progressive disclosure.** Anthropic's
doctrine (smallest high-signal token set, identifiers over
documents), the Skills three-tier loading model (~100-token stub,
body on demand), and Context7's resolve-then-query pattern all
converge: agents prefer querying an authority for a scoped fragment
over holding a corpus. Cost: someone must run the authority.

**GraphQL introspection.** The proven model of "schema queryable
by the consumer" — the critique pass notes the survey's query
recommendations partially reinvent it. Its lesson is the habit it
created, not its machinery; the machinery costs a full query
language with resolvers, far beyond path selection.

**SysML v2 API & Services and Structurizr's MCP server.** MBSE
learned that a language without a standard machine API cannot
anchor a toolchain; Structurizr — the nearest commercial neighbour
— already ships an MCP server so agents can inspect architecture
models. Neither has constraint checking worth the name; Aontu's
differentiator is that its slices are *unified, validated* values.
Cost of the SysML route: an enormous REST/CRUD spec surface.

**nix why-depends and OPA's explain ladder.** The exemplars for
"why": a shortest path through the graph with the exact fragment at
each hop; filtered trace levels (full for machines, notes for
humans, fails as default). CUE's discussion #3723 (30+ stacked
sites, 3,000-line config, debugging by deletion) is the
counter-example that motivates doing this early; CUE is on its
second evaluator partly to retrofit error tracking.

**Terraform plan.** Diff-as-explanation works — until noise
destroys trust. Deterministic canon already gives Aontu
noise-free diffs; the design must protect that, not add it.

**Grammar-constrained decoding.** Lark CFGs are accepted by
provider custom-tool APIs; llguidance/XGrammar make enforcement
cheap; GBNF covers local inference. A published grammar makes
syntactic validity guaranteed and leaves semantics to the unifier —
a clean two-layer story competitors lack. Few-shot studies say
low-resource DSLs are learnable given a grammar card plus curated
examples. Cost: the artifact must be parity-tested against both
parsers forever, or it rots into a liar.

**AGENTS.md versus llms.txt.** The delivery-channel verdict:
harnesses actively read AGENTS.md (adopted across agent tooling);
llms.txt failed because nothing pulled it. Ship the stanza and the
tools that make it true, not a passive file.

## Design space

**A. Library-only.** Document `ctx.find` and `explain`, let the
ecosystem build servers. Near-zero cost; but Go has neither
surface, the explain format is not a contract, and the llms.txt
lesson says capabilities nothing pulls into loops go unused.
Rejected.

**B. CLI slicing only.** Ship `get` with projections and a REPL
JSON mode; defer provenance, patch, and MCP. Cheap and real; but
"why" is the incumbent's most documented pain and gets strictly
more expensive to add as the engine matures, and without MCP the
surface never reaches the harnesses that need it. Kept as Phase 1
of the plan, not the end state.

**C. A query language.** Embed filters and predicates
(JSONPath-style wildcards, jq-like expressions) in CLI and MCP.
Powerful, but it is a second language to specify, teach, and keep in
TS/Go parity — surface-area creep of exactly the kind
[index.md](index.md) warns about, and the survey's agent-usage
evidence is that path + fixed projections cover the consumption
pattern. Rejected.

**D. Always-on provenance.** Extend the engine so every `Val`
carries its ordered conjunct history with sites, unconditionally.
Best possible UX (hover-provenance with no second evaluation); but
it taxes every evaluation for a rarely-asked question, collides
with the lazy-site optimisation the hot path relies on, and grows
memory with conjuncts × passes. Rejected for v1 — but its *data
shape* should be designed now so always-on can land later behind a
flag when incremental evaluation makes it cheap.

**E. Staged surface on today's engine.** Path-scoped `get` with
lattice-sound projections; provenance-on-demand (`why`
re-evaluates with an opt-in recorder — the explain pattern with
sites and a per-path index); patch as overlay-append first,
format-preserving rewriting later; delivery via a thin MCP server
over the TS library, a published grammar, a skill, and an
AGENTS.md generator; the REPL grown into an inspection tool. Costs
honesty: `get` is not faster than full evaluation, `why` runs the
evaluator twice, stage-1 patch cannot change pinned values in
place.

**Recommendation: E, with D's record shape specified up front.**
It is the only option honest about the engine (global unification,
single-use trees, lazy sites) that still ships every consumption
surface the survey identifies. It matches the review's sequencing
note that G7 depends on nothing and is the cheapest adoption wedge
— it wraps today's evaluator, and every later capability
([G2](g2-validation-verb.md) vet,
[G3](g3-subsumption-evolution.md) breaking) becomes another tool
on the same server.

## Proposed design

### Query: `aontu get`

```
aontu get <path> [file] [options]

  -c, --canon      canonical-form fragment (default: JSON)
  --keys           keys at the node, one level
  --types          shape view: concrete leaves generalised to kinds
  --depth <n>      subtree to depth n; elided nodes render as top
```

Semantics: evaluate the whole document (stated plainly: unification
is global, so there is no partial evaluation to sell), select the
node, and render. *(As landed, selection is not "the `ctx.find`
walk promoted" — it REUSES `anchorAt`, vet's `--at` walk, already
type-directed and already in parity, so a path means exactly what a
reference means by `$.a.b`, down to the canonical-decimal index
rule; the register's G7.1 row records it.)* The renderings:

- default: generated JSON of the fragment — which inherits `gen`
  semantics, including the known `DisjunctVal.gen` fold defect
  (ts/src/val/DisjunctVal.ts, ~line 263) until it is fixed;
- `--canon`: the fragment's canonical form — constraint-preserving,
  deterministic, and for the root path byte-identical to today's
  `--canon` output (pinned by a spec row).

A missing path is an error reported via the
[G2](g2-validation-verb.md) contract (a `no_path`-family code with a
nearest-key suggestion); `get` invents no error format.

### Projections are lattice abstractions

The three projections are defined so that each emits a *valid Aontu
document that subsumes the truth* — generalisation, never
distortion:

- `--types` replaces each concrete scalar with its kind:
  `{"image":"auth:v2.3","replicas":3}` becomes
  `{"image":string,"replicas":integer}`. When
  [G1](g1-constraint-algebra.md)'s bounds land, this view renders
  them via G1's canonical bound syntax — consumed here, defined
  there.
- `--depth n` keeps structure to depth n and renders every elided
  subtree as `top` — "no further information at this tier".
- `--keys` is `--depth 1 --types` degenerated to a listing.

This gives progressive disclosure the Skills model wants — a
stub-sized first tier, expansion by path on demand — with a property
no markdown spec has: every tier is itself checkable, and "view
subsumes truth" is mechanically verifiable once
[G3](g3-subsumption-evolution.md)'s `subsume` exists. Projections
are not canonical form and are never fed to
[G6](g6-distribution.md)'s hash; the flags are distinct from
`--canon` to keep that unambiguous.

Caching: single-use trees mean a resident server must never hold
live `Val`s. The unit of caching is the *rendered* slice, keyed by
(content hash per [G6](g6-distribution.md), path, projection) —
which also makes slices prompt-cache-stable, the economics G6
identifies.

### Provenance: `aontu why`

```
$ aontu why $.services.auth.replicas service.aon
$.services.auth.replicas = 3
  1. *1 | integer   org.aon:2:26    (spread &: at org.aon:2:11)
  2. 3              service.aon:3:29
resolved: 3 — literal overrides preference *1
```

Mechanism: a provenance recorder on the context — the explain
pattern, but recording a *contract*, not a debug trace. *(As
landed, simpler on every axis than the design below, and the
register's G7.3 departures carry the reasoning. This text named
five instrumentation points — the `update()` site-drop, the
`ConjunctVal` fold, spread application, `PrefVal` and `RefVal`
resolution — and a `ctx._pathidx` key; the landed recorder hooks
`unite` ALONE, the one place every meet passes through, plus a mark
at the spread clone, because a ref is still a `RefVal` and a pref
still a `PrefVal` when each meets its peer. A contribution must be
a value the author WROTE — engine-minted intermediates are dropped.
Deduplication is by (path, val id) as designed, keyed on the path
STRING rather than `ctx._pathidx` — the string is what the report
prints. And `why` is NOT two evaluations: the recorder rides the
one run the call already makes, off by default.)*

The record shape (the part designed now for a later always-on
mode):

```json
{ "path": "$.services.auth.replicas", "value": "3",
  "conjuncts": [
    { "canon": "*1|integer", "role": "spread",
      "site": { "file": "org.aon", "row": 2, "col": 26 } },
    { "canon": "3", "role": "literal",
      "site": { "file": "service.aon", "row": 3, "col": 29 } } ] }
```

`--format json` emits it; sites reuse the G2 site object shape.
Costs, honestly: `why` is two evaluations (determinism, per
[G5](g5-trust-contract.md), guarantees the second derives the same
result); memory is proportional to conjunct events on the queried
run; the lazy-site getter is untouched on the normal path, and
instrumented runs pay site materialisation knowingly. LSP
hover-provenance reuses the recorder: hover already re-unifies the
whole document per request (ts/src/lsp.ts), so recording during
that existing re-evaluation is a config-gated increment, not a new
cost class. `why` is the positive twin of G2's error report:
errors explain what failed to unify; `why` explains what did.

### Patch: `aontu set`, in stages

**Stage 1 — overlay append (no rewriter needed).**

```
aontu set $.services.auth.owner=\"identity-2\" \
  --entry system.aon --overlay changes.aon
```

Appends a path-flattened conjunct
(`services: auth: owner: "identity-2"`) to the overlay file
(creating it if absent) and reports a
[G2](g2-validation-verb.md)-shaped verdict. *(As landed the order
is reversed from this text's "appends, then re-evaluates": the verb
evaluates first and writes the overlay ONLY when the change holds —
a refusal leaves the file exactly as it was, because a broken
overlay with only an exit code saying so is what the design's order
would have left behind. The register's G7.5 departures record it.)*
This is
semantically clean: an overlay entry is just another conjunct, and
unification is order-independent — no parsing of the target file,
no comment or layout damage, nothing to preserve. It refines open
values and fills unpinned fields. What it *cannot* do is change a
pinned value: the lattice correctly rejects `5` against `3`, and
the verdict says so with the pinning site — which `why` locates.
The loop "set → conflict → why → edit the pinning site" is
coherent even before stage 2, with the last step manual.

**Stage 2 — format-preserving in-place edit (deferred, L).**
Requires two missing assets: an evaluated-path →
contributing-source-spans map (a by-product of the provenance
recorder) and a comment-and-layout-preserving CST for the parser
stack, which today discards comments. Only then can
`aontu set --in-place` rewrite the pinning literal where the
author wrote it. Sibling documents deferring "applying a fix" to
G7's format-preserving patch surface ([G2](g2-validation-verb.md),
[G3](g3-subsumption-evolution.md)) are deferring to this stage;
until it lands, overlay-append is the only patch verb, and the
docs must say so.

### Delivery: the MCP server

A thin server over the TypeScript library, following the LSP's
three-layer template (docs/lsp.md): a transport-free tool library
(ts/src/mcp.ts), a stdio server (ts/src/mcp-server.ts), published
as a bin (`aontu-mcp`). Tools, all returning the same JSON
contracts as the CLI:

| Tool      | Backed by                                            |
|-----------|------------------------------------------------------|
| `vet`     | [G2](g2-validation-verb.md)'s verb and report        |
| `get`     | the query surface above (path + projection)          |
| `why`     | the provenance recorder                              |
| `diff`    | path-addressed diff of two evaluations               |
| `canon`   | normalise a source text to canonical form            |
| `summary` | a document summary: root keys + [G6](g6-distribution.md) hash |

`diff` is dyff-style — deterministic rendering on both sides means
no phantom noise — and reports *what changed at which paths*.
*(As landed it compares the [G6](g6-distribution.md) HASH FORM, not
the plain canon this text named: canon drops closedness and the
marks, so a canon diff would call `close({a:1})` and `{a:1}`
identical — the dangerous direction. G6 landing first is what made
the stronger form available; the register's G7.6 departures record
it.)* Whether
a change is breaking is [G3](g3-subsumption-evolution.md)'s
question, exposed later as G3's tool on this same server.
*(A second departure: MCP RESOURCES are not implemented — the
progressive disclosure this design wanted from them is the
`summary` TOOL plus `get`, the same disclosure without a second
protocol surface to keep in parity.)*
The server runs with a confined resolver
per [G5](g5-trust-contract.md) — as landed, served evaluation is
confined to no includes at all; the package resolver
leg is never enabled under a server. The Go port ships no separate
MCP server: its role is gateway/sidecar embedding of the same
library calls (`get`/`why` land in the Go API for parity), and
any Go MCP wrapper is left to hosts.

### Grammar, skill, AGENTS.md stanza

- **Published grammar**: `grammar/aontu.lark` and
  `grammar/aontu.gbnf`, covering the documented emission surface
  (excluding `@"…"` includes — constrained decoding should not
  emit source-loading directives). Parity-tested from day one:
  every canonical-form output in the shared spec suite must parse
  under the published grammar, and grammar-sampled strings must be
  accepted by both real parsers. Conservative by construction: it
  may under-approximate the surface, never over-approximate it.
- **Official skill**: a ~100-token trigger stub, a one-page grammar
  card, curated examples (JSON-superset first: agents may write
  plain JSON and add operators incrementally), and the G2
  error-code index for repair loops.
- **`aontu agentsmd`**: generates or updates an AGENTS.md stanza
  from the definition itself — where the truth lives, how to
  `vet`, `get`, and `why` it — so the prose entrypoint cannot
  drift from the formal source.

### REPL as inspection tool

The existing REPL (ts/src/cli.ts) gains `:load <file>`, `:get`,
`:keys`, `:why`, and a JSONL session mode in which every command
answers in one JSON line, making the REPL drivable by a harness.
Human-readable output stays the default. *(Two departures as
landed: `:load` holds the SOURCE, not the rendered document this
text specified — every later question re-evaluates, which is what
single-use trees require — and the session flag is `--jsonl`, not
`--json`, which would read as the `:json` output mode the REPL
already has. And the phase is PARTIAL: the `--jsonl` flag is
unreachable in the Go CLI and TTY-gated in TypeScript — the
register's G7.7 row, recorded 2026-08-21, says exactly what is
missing.)*

## Boundary: what we will not do

- **No query language.** Path plus fixed projections only; filters
  and predicates are a second language and surface-area creep
  toward CUE, a trap named in [index.md](index.md).
- **No partial-evaluation claims.** `get` evaluates the whole
  document; incremental evaluation is a later engine project shared
  with the LSP, and marketing slicing as speed would be false.
- **No always-on provenance in v1.** On-demand only; the record
  shape is the forward-compatible part, the collection policy is
  not.
- **No format-preserving rewriting in stage 1.** Overlay-append
  ships first precisely because it needs no rewriter; in-place
  editing waits for the CST and the source map.
- **No error-format invention.** Every failure across get/why/set
  and the MCP tools is reported via the
  [G2](g2-validation-verb.md) contract.
- **No fetching or arbitrary writes in the server.** The MCP server
  evaluates what it is given under a confined resolver
  ([G5](g5-trust-contract.md)); distribution and pinning are
  [G6](g6-distribution.md)'s; the only write tool is the overlay
  append.
- **No subsumption semantics in `diff`.** Path-level change
  reporting only; breaking-ness is
  [G3](g3-subsumption-evolution.md)'s verb.
- **No LLM components in the surface.** Deterministic, mechanical
  answers are the entire pitch against the JSON-Schema-plus-prose
  null hypothesis; an LLM summariser tool would surrender it.
- **No view/diagram generation in v1.** Model-once-render-many is
  real (Structurizr) but is an exporter product; the projection
  ladder is G7's contribution to it.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Provenance instrumentation slows the uninstrumented hot path | Medium | High | Explain-style `ctx` guards (already proven zero-cost when off); benchmark gate in CI before/after Phase 3; lazy-site getter untouched on the normal path |
| TS/Go divergence: Go has no `find`, no explain, no collect surface | High | High | `get`/`why` land as shared spec rows (query.tsv; why.tsv as landed) run by both suites with no skip list; Go port is a dedicated phase, not an afterthought |
| Resident server misuses single-use trees (stale or corrupted Vals) | Medium | High | Server caches rendered artifacts only, keyed by G6 content hash; a test asserts no `Val` outlives its evaluation |
| Why-chains explode on large conjunct fan-in (CUE's 30-site pile-up) | Medium | Medium | Dedupe by (pathidx, val id); default chain cap with `--all`; order entries by application, not discovery |
| Published grammar drifts from the real parsers | Medium | High | CI parity test: all spec-suite canon outputs parse under the grammar; sampled grammar strings accepted by both parsers; grammar versioned with the language |
| Projections mistaken for canonical form (fed to hashes/pins) | Medium | Medium | Distinct flags; projected output carries no `--canon`; G6 hashes only unify-level canon; docs state it |
| `get --json` hits the DisjunctVal.gen fold defect | Medium | Medium | Default agent guidance is `--canon`; fix tracked with regression spec rows; JSON output of unresolved disjunctions documented as affected until then |
| Overlay files accumulate into an unreadable sediment | High | Low | One well-known overlay per entry document; `why` shows overlay sites like any other; consolidation tooling deferred to stage 2 |
| MCP spec churn breaks the server | Medium | Low | Tool library is transport-free (LSP split); only ts/src/mcp-server.ts tracks protocol versions |
| Adoption risk: agents read the file instead of calling tools | Medium | High | `aontu agentsmd` writes the stanza that names the tools; skill teaches the get/why/vet loop; slices are cheaper in tokens than the file — measured and stated |
| Canon round-trip regression via fragment rendering | Low | High | Spec row pins `get $ --canon` == document canon; canon convergence stays green in every phase |

## Implementation plan

Spec-first throughout: every behaviour lands as `test/spec/*.tsv`
rows before code; TypeScript (canonical) first, Go follows. Nothing
may regress in any phase: every row of the shared suite (counts in [the register's protocol rule 5](progress.md#the-update-protocol)),
canon convergence, LSP diagnostic parity, and
the performance of uninstrumented evaluation.

**Phase 1 — `get` and projections, TypeScript (M).**
Spec: new `test/spec/query.tsv` — columns name, source, path,
projection, output — including the pins `get $ --canon` ==
document canon and projection-subsumes-truth examples. Code: new
ts/src/query.ts (path parsing, projection rendering over the
`ctx.find` walk); ts/src/ctx.ts (escaped keys, list indices);
ts/src/cli.ts (`get` verb); docs/reference-api.md. Runner:
ts/test/spec.test.ts learns the query mode.

**Phase 2 — `get`, Go port (M).**
Code: new go/query.go; go/ctx.go (find); go/cmd/aontu.
go/spec_test.go runs query.tsv with no skip list.

**Phase 3 — provenance recorder and `why`, TypeScript (L).**
Spec: a new provenance spec file (landed as `test/spec/why.tsv`,
in the five-column mode, not the bespoke `provenance.tsv` columns
sketched here) — sources multi-file
via the memory resolver so file/line assertions are stable, path,
ordered chain entries with roles. Code: new
ts/src/provenance.ts (recorder, record shape, JSON rendering);
ts/src/unify.ts (as landed, the `unite` hook alone — see the
provenance section's as-landed note);
ts/src/val/ConjunctVal.ts, ts/src/val/PrefVal.ts,
ts/src/val/MapVal.ts, ts/src/val/ListVal.ts, ts/src/val/RefVal.ts
(record points); ts/src/cli.ts (`why`). Benchmark gate on the
uninstrumented path.

**Phase 4 — `why`, Go port (L).**
Code: go/provenance.go (new); go/unify.go, go/conjunct.go,
go/pref.go, go/mapval.go, go/listval.go, go/ref.go; go/cmd/aontu.
Byte-identical `--format json` output pinned by the shared rows
(why.tsv as landed).

**Phase 5 — overlay `set` (M).**
Spec: new `test/spec/patch.tsv` — source, set expression, overlay
result, verdict — pinning that overlay-append is semantically
identical to hand-written conjuncts (order-independence rows).
Code: new ts/src/patch.ts; ts/src/cli.ts; Go twin go/patch.go
(S once TS settles). Verdicts via the G2 report.

**Phase 6 — delivery: MCP server, grammar, skill, agentsmd (M).**
Code: new ts/src/mcp.ts (transport-free tool library) and
ts/src/mcp-server.ts (stdio), mirroring the LSP split; `agentsmd`
verb in ts/src/cli.ts; new grammar/aontu.lark and
grammar/aontu.gbnf with a parity test (ts/test/grammar.test.ts —
as landed it interprets the gbnf file itself as an ordered-choice
PEG over the suite's whole canon corpus; the "Go acceptance twin"
sketched here was not built, the register's G7.6 departures
recording that the discipline arrived without a toolchain the CI
does not have); skill
sources under docs/. The server ships with the memory/filesystem
resolver only.

**Phase 7 — REPL inspection mode and hover-provenance (S).**
Code: ts/src/cli.ts (`:load`, `:get`, `:why`, the JSONL session
mode — landed as `--jsonl`, and PARTIAL per the register's G7.7
row); ts/src/lsp.ts and go/lsp (config-gated provenance in hover
markdown). LSP diagnostic text is unchanged.

## Open questions

- ~~**Path syntax details.**~~ **Settled by the `anchorAt` reuse:**
  a `get` path means exactly what a reference means — `$.a.0`
  spelling, the canonical-decimal index rule included — because the
  landed selection IS the reference walk, so there was no second
  syntax to align. query.tsv froze that spelling. (The question as
  posed: escaping for keys containing dots, `$.a.0` versus
  `$.a[0]`.)
- ~~**Provenance granularity.**~~ **Settled by the landed
  contribution rule, which dissolved the leaf-versus-container
  framing:** a contribution is a value the author WROTE at the
  queried path — a conjunct expands into its terms, engine-minted
  intermediates and structurally-inside values are dropped, and the
  spread clone carries its own mark (the register's G7.3
  departures). No filter shipped; patch stage 2 can revisit if it
  needs more. (The question as posed: leaf scalars only, or
  container-level events too, both behind a filter?)
- ~~**One evaluation or two in the server.**~~ **Dissolved: it is
  one evaluation everywhere.** The landed recorder rides the single
  run the call already makes (`why` was never two evaluations as
  the design assumed), so there is no resident-recorder trade to
  measure; only LSP hover provenance pays a second evaluation, for
  reasons the register's G7.7 departures record. (The question as
  posed: a resident server could keep the recorder always on at the
  cost of memory per document version.)
- **Fragment canon as a stable contract.** Is the canon of a slice
  stable across engine versions (making slice and prompt caches
  durable), or only within a version? Interacts with
  [G6](g6-distribution.md)'s hash scheme id; needs an explicit
  statement either way.
- **Grammar scope versus teaching scope.** Should the emission
  grammar also exclude rarely-emitted forms (custom marks, `@`
  directives) to shrink the constrained-decoding surface, with the
  skill teaching the full language? Small grammars are cheaper to
  learn; the risk is agents acquiring a dialect. *(The landed
  grammar took the first step: it refuses the include directive
  while accepting every canon in the suite. How much further to
  shrink stays open.)*
- **Overlay conventions.** One well-known overlay per entry
  document versus per-agent overlays; declared in the entry file
  (`@"changes.aon"`) or composed by the tool at evaluation time.
  Composition-by-tool keeps the source honest but hides a conjunct
  from plain `aontu system.aon`; interacts with
  [G6](g6-distribution.md) module boundaries.

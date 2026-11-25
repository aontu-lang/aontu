# Decision record

The fundamental decisions of aontu: the few choices that change what
the project *is*, which a contributor, person or agent, does not
quietly reverse. How one part works lives in the code and in
[`docs/`](docs/). A rule of the language lives in the definition under
[`spec/`](spec/). A rule of how work is done lives in
[`DEV-PROCESS.md`](DEV-PROCESS.md) or [`AGENTS.md`](AGENTS.md).

- **Only the maintainer adds an entry.** An agent may propose one, in a
  pull request or an issue, and never writes one here.
- **An entry is at most 200 words.** It states the decision, why it
  holds, and what it costs or how it is enforced, in the present tense.
- **An entry has no history.** No status, no dates, no issue or pull
  request numbers, no amendment and no superseding. A decision that
  stops holding is rewritten or deleted, and version control keeps what
  it said.

| ADR | Decision |
|-----|----------|
| [ADR-001](#adr-001--the-language-is-defined-in-lean-and-the-ports-implement-it) | The language is defined in Lean, and the ports implement it |
| [ADR-002](#adr-002--two-implementations-held-at-parity-by-shared-rows) | Two implementations, held at parity by shared rows |
| [ADR-003](#adr-003--coverage-stays-at-100--in-both-implementations) | Coverage stays at 100 % in both implementations |
| [ADR-004](#adr-004--one-version-names-a-release-of-both-ports) | One version names a release of both ports |
| [ADR-005](#adr-005--aontu-owns-the-meaning-of-what-it-reads) | aontu owns the meaning of what it reads |
| [ADR-006](#adr-006--the-tree-is-user-space) | The tree is user space |
| [ADR-007](#adr-007--language-supplied-models-are-aontu-modules) | Language-supplied models are `aontu:` modules |
| [ADR-008](#adr-008--generated-output-is-a-component-tree-and-aontu-knows-no-target-language) | Generated output is a component tree, and aontu knows no target language |
| [ADR-009](#adr-009--json-schema-crosses-by-rewrite-and-comes-back-from-its-own-export) | JSON Schema crosses by rewrite, and comes back from its own export |
| [ADR-010](#adr-010--the-project-operates-a-module-repository-and-no-build-needs-it) | The project operates a module repository, and no build needs it |
| [ADR-011](#adr-011--a-package-name-is-a-proved-namespace-and-compatibility-is-computed) | A package name is a proved namespace, and compatibility is computed |
| [ADR-012](#adr-012--a-forge-token-authorises-a-publish-under-a-proof-contract-the-project-owns) | A forge token authorises a publish, under a proof contract the project owns |
| [ADR-013](#adr-013--a-lock-pins-a-packages-bytes-and-its-meaning) | A lock pins a package's bytes and its meaning |
| [ADR-014](#adr-014--the-site-renders-the-documentation-it-does-not-author-it) | The site renders the documentation; it does not author it |

---

## ADR-001 — The language is defined in Lean, and the ports implement it

The language is defined under `spec/`, in Lean 4, as relations:
`Admits`, `Output` and `Le` say what the right answer is, not how to
compute it. The definition is normative. `ts/` and `go/` implement it,
and a shared spec row's expected value agrees with it wherever it
covers the row's construct. Executable Lean enters the definition only
beside a proof that it computes its relation.

A rule of the language is stated and changed in the definition, by its
Lean diff and the theorems it adds or gives up, not in this record.
Error codes, budgets, messages, the CLI, packages and the tools stay
outside it.

**Why:** two ports that agree prove parity, not correctness, and a rule
written in prose cannot be checked.

**Cost and enforcement:** every language change carries a proof.
`make spec` regenerates the definition's rows into
`test/spec/def-*.tsv`, which both ports run with no Lean at test time.
A case the ports answer otherwise is a row of `spec/ledger.tsv` naming
which side moves; a generated row is never edited to match an engine.

## ADR-002 — Two implementations, held at parity by shared rows

aontu ships a TypeScript and a Go implementation, at parity for every
behaviour either exposes: verdicts, output, error codes and messages,
the CLI and the language server. Parity is proved by data, not by
inspection: behaviour is pinned in `test/spec/*.tsv`, which both ports
run, and a row's expectation comes from running both engines, never
from one of them or from belief. Where the definition is silent and the
ports disagree, TypeScript is canonical, and Go mirrors its structure
arm for arm.

Whatever both ports need, such as builtin signatures, bundled models,
grammars and Unicode tables, is authored once and staged into each, and
each suite asserts its copy identical to the source.

**Why:** a user in either ecosystem gets one language, and two
hand-kept copies drift where nothing looks.

**Cost and enforcement:** every behaviour is built twice. A divergence
that cannot be fixed at once is registered, in `test/spec/divergent.tsv`
or, when structural, in `DIVERGENCE.md` with `ts/test/parity.test.ts`,
and is removed when fixed; an unregistered divergence is a defect. A
behaviour is shared only once both ports pass it.

## ADR-003 — Coverage stays at 100 % in both implementations

Both implementations hold 100 % coverage: Go statements, and TypeScript
lines, branches and functions. A gap is closed by a shared row first, by
a per-port unit test where no source input reaches the code, and by an
exclusion marker only where neither can. A marker carries a comment
saying what state would reach the code and why nothing produces it.
Unreachable code that nothing depends on is deleted, not excluded, and a
test that asserts nothing in order to move the number is a defect.

**Why:** with two ports, code that no test reaches is code whose parity
nothing checks.

**Cost and enforcement:** every branch needs a reason to exist and a
test that reaches it. `make cov` fails under 100 %, in the daily CI.

## ADR-004 — One version names a release of both ports

The npm package and the Go module share one version series. Every
release sets `ts/package.json` and `go/aontu.go` to the same number, and
the tags `v<version>` and `go/v<version>` name one commit.

**Why:** a user, a bug report or a lockfile names one aontu, not a pair
to be matched up.

**Cost and enforcement:** the Go module path is correct for majors 0
and 1 only, so a major beyond 1 changes the import path of every Go
consumer; that cost is accepted. `make publish` refuses a `V` and a
`GOV` that disagree, since both tags are immutable once pushed.

## ADR-005 — aontu owns the meaning of what it reads

Where a host library would supply meaning, aontu defines it and runs it
itself. It matches `re()` with its own engine, over ECMA-262's `u`-mode
syntax with ASCII meanings for `.`, `\s`, `\d` and `\w`. It reads and
runs format grammars itself. It reads JSON Schema with its own reader,
which keeps every number's text and every key's order. It lays out and
writes every byte of a figure's SVG, with no renderer subprocess. A host
engine is handed only input that it cannot read two ways, as `rep()` and
`split()` hand each port's pattern engine a subset both read alike.

**Why:** two hosts disagree, change between releases and fail
differently, and a verdict that depends on the host is not one both
ports can promise. An owned matcher also runs in linear time, so no
pattern backtracks catastrophically.

**Cost and enforcement:** aontu maintains its own pattern engine,
Unicode tables, grammar runner and layouts. Generated corpora under
`test/spec/files/` pin both ports' answers, and both ports read the
vendored test262 and RE2 vectors.

## ADR-006 — The tree is user space

No plain, spellable key carries a meaning that the engine or a verb
assigns, at any depth, the root included, and no location singles out
plain-named children for a special reading. Reserved meaning is carried
only by syntax that the grammar marks and quoting escapes: an operator,
a sigil or a call.

A library may set conventions in user space, since a document opts into
a library by including it. The engine and the verbs, which a document
cannot opt out of, may not. An internal sentinel is unspellable, never
merely unlikely.

**Why:** a document's keys belong to its author. A key that silently
means something to the engine is a collision waiting for the first
author who wants that name.

**Cost and enforcement:** every engine feature needs a syntactic
spelling rather than a convenient key. No mechanical gate can see that
a verb reads a plain key, so review carries this entry.

## ADR-007 — Language-supplied models are `aontu:` modules

Every model the language supplies is a file under `aontu/` at the
repository root, named by its path under the `aontu:` scheme:
`aontu/lang/text.aontu` is `aontu:lang/text`, and a file named after its
folder takes the folder's name. Everything such a model defines lands
under the one root key `aontu`, as `$.aontu.System` or `$.aontu.View`.
Both ports inline the files at build time.

**Why:** one scheme and one key keep the language's vocabulary apart
from the author's names, so a reader who sees `$.aontu` knows it is not
the document's own. A model is a source file to read and review, not a
string inside each port.

**Cost and enforcement:** a document that includes a bundled model
cannot use the key `aontu` for itself. Since a model is opted into by
inclusion, ADR-006 holds. Each port asserts every inlined model
identical to its file, and asserts that its table lists exactly the
files under `aontu/`.

## ADR-008 — Generated output is a component tree, and aontu knows no target language

A document that generates files builds a component tree, of `project`,
`folder`, `file`, `content` and their peers, and nothing else. aontu
holds no knowledge of any target language: no reserved words, case
rules, type expressions or lowering tables. A generator's author writes
the target text. `aontu render` evaluates the generator and hands the
tree to jostraca, the npm package in TypeScript and the Go module in Go,
which writes and checks the files; neither port walks the tree to disk
itself.

**Why:** one output road keeps one contract between aontu and the file
writer, the tree's shape. Language knowledge in the engine grows without
bound and is never complete.

**Cost and enforcement:** a generator's author must know the target
language, and aontu cannot help with it. The CLI depends on jostraca:
the npm package takes it as a peer dependency at a range, so a project
resolves one runtime, and the Go module requires a minimum version. A
change that adds a language table or a second output vocabulary to
either port breaches this entry.

## ADR-009 — JSON Schema crosses by rewrite, and comes back from its own export

JSON Schema is not a concept of the language. Import rewrites a schema
into aontu text, in the form `aontu fmt` writes, and export writes aontu
back as JSON Schema, in both ports. The importer owns the meaning: it
reads with its own reader, upgrades an earlier dialect to 2020-12 before
reading it, honours `$vocabulary`, checks the input against its
meta-schema, and writes only forms the definition holds. Nothing is
dropped in silence; what does not cross is a reported loss.

**Why:** an imported schema becomes a source that a person reads, edits
and evaluates with every other aontu tool, and the language's own
meaning, not a second validator, answers what it admits.

**Cost and enforcement:** the importer carries the whole of JSON
Schema's complexity. Both harnesses run the official suite and a
vendored SchemaStore subset. `import(export(import(S)))` must equal
`import(S)`, and a schema that does not come back is a row of a bounded
ledger naming why. The admission trial must agree with
`vet --no-fill --exact-numbers` on every instance of the suite, and
`spec/forms.tsv` holds the importer to the definition's forms.

## ADR-010 — The project operates a module repository, and no build needs it

The project stores module bytes and operates a module repository. It
operates no transparency log; attestation is federated. Its constraints
are the decision:

1. A build with a lockfile never contacts it. It is consulted only to
   add a version the lock does not pin.
2. The public read path is static, content-addressed objects with no
   code on it, so mirroring is a directory copy.
3. It fetches nothing, and evaluates only at publish, on authenticated
   input, under a deterministic budget.
4. A private package is read by authentication that is delegated to the
   forge's own permissions: no accounts, no long-lived read credentials,
   and a private package is indistinguishable from a missing one.
5. Withdrawal changes selection, never the record of what was published.
6. Its exit is stated: the public tier freezes and is mirrored, and the
   private tier exports.

**Why:** an operated service is admissible only where its failure
cannot break a build and leaving it costs nothing.

**Cost and enforcement:** the project carries a service's availability
and cost. The client half, pin and proof checking, is in both ports
under ADR-002.

## ADR-011 — A package name is a proved namespace, and compatibility is computed

A package path is `<domain>/<path>`, a name and never a fetch
instruction: the bytes always come from the repository. A publisher
proves the namespace at every publish, and the repository records the
forge's stable identifier pair, not its name, so a recycled name is an
event rather than a routine publish. No package is unnamespaced.

A path carries no major version. The repository refuses a publish that
is not backwards compatible with its predecessor: every document the
old version evaluated must evaluate under the new one to the same
value, checked by subsumption and canonical-form comparison, refusing
wherever neutrality is not proved. A real break takes a new name, and a
rename is a signed forward link that resolution refuses, naming the
destination.

**Why:** a name nobody can prove they own is one nobody can publish,
and a computed guarantee replaces a version number's promise.

**Cost and enforcement:** only a forge that proves ownership and issues
identifiers it never reuses is admissible. Two versions of one package
coexist only under an alias the consumer declares, and a local import
carries `./`, `../` or `/`.

## ADR-012 — A forge token authorises a publish, under a proof contract the project owns

The write path authorises a publish from the forge's OIDC token,
verified against the forge's published keys, and decides the namespace,
identifier pair and trigger from it. What a client verifies on first
acquisition is stated in the project's own terms: a signed manifest of
the archive digest, the file list and each module's canon hash; a
signer the client's trust configuration accepts for that name; and,
where required, an inclusion proof in a `tlog-tiles` log. Sigstore is
one provider of that proof, and a signature by a named key is another.

**Why:** a third party's certificate issuer must not decide who may
publish, and a provider's terms, formats or availability must not
change what a client checks.

**Cost and enforcement:** the project maintains a provider seam, and
verifiers held to differential vectors from a pinned reference. Leaving
a provider is a swap under the same contract, and neither builds nor
the verification of stored proofs stop with it.

## ADR-013 — A lock pins a package's bytes and its meaning

A module is imported and a package is published, and the vocabulary
keeps the two apart. A project's package file is `pkg.aontu`, and its
lockfile `aontu_meta/pkg-lock.aontu`. A lock entry pins three things:
the canon hash of the module evaluated standalone, the digest of the
canonical archive of its tree, and, where it came from a repository,
the digest of the signed manifest. The canonical archive is a
deterministic zip, so one tree has one digest in both ports, and an
archive that is not canonical is refused before it is unpacked.
Verification checks bytes before meaning.

**Why:** a byte pin alone misses a change of meaning, and a meaning pin
alone misses tampered files. Together they let a vendored or mirrored
tree be checked offline, and keep two packages that mean the same thing
out of one cache entry.

**Cost and enforcement:** a change to the canonical form invalidates
canon pins, which `aontu pkg refreeze` recomputes. A client that checks
one pin only is a defect.

## ADR-014 — The site renders the documentation; it does not author it

`docs/*.md` in this repository is synced into the site repository and
rendered there. A page that states what the engine does is written
here; the site may frame it, link it and set it in type, and never
restates it. A page with no counterpart here, such as the landing page
or a comparison, is authored in the site.

**Why:** a statement of behaviour kept in two places drifts, and only
the copy beside the code changes with it.

**Cost and enforcement:** a correction to an engine page is made here,
never on the site. The synced pages are generated and committed in the
site repository, so a hand edit there is overwritten by the next sync.

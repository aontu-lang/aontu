# Security policy

Aontu's product is a trust contract: documents that agents and CI
pipelines evaluate unattended, under stated guarantees of hermeticity,
termination, determinism and sandboxing. That contract is written down
in [docs/trust.md](docs/trust.md), and it is the reason this policy
treats evaluator-confinement defects as security vulnerabilities, not
ordinary bugs. If Aontu is the gate, a way past the gate is a
vulnerability by definition.

## Supported versions

| Distribution | Package | Supported |
|---|---|---|
| npm (TypeScript, canonical) | [`aontu`](https://npmjs.com/package/aontu) | the latest published release only |
| Go module | `github.com/rjrodger/aontu/go` (tags `go/vX.Y.Z`) | the latest published tag only |

The project is pre-1.0 with a single maintainer. There are no
long-term-support branches: a fix ships as a new release of each
implementation, and the honest advice is to track the latest version.
Note that published versions can lag this repository — the README's
npm badge shows what is actually installable — so check that a
suspected vulnerability is present in a *published* version, and say
which one, but report it either way: the in-tree code is what the next
release ships.

## Reporting a vulnerability

**Do not open a public issue for an exploitable defect.** Use GitHub's
private vulnerability reporting for this repository:

- <https://github.com/rjrodger/aontu/security/advisories/new>

That goes directly and privately to the maintainer,
[@rjrodger](https://github.com/rjrodger). A report is most useful as a
minimal `.aon` (or schema + data pair) plus the exact invocation —
implementation (TypeScript or Go), version, command line or API call,
trust profile in effect, and what happened versus what the trust
contract says must happen. The [use-cases/repros/](use-cases/repros/)
directory shows the shape of a good repro.

## Scope: the trust profile is the security surface

The four clauses of [docs/trust.md](docs/trust.md) define what counts.
**In scope** — treated as vulnerabilities:

- **Include-confinement escapes.** Under `trust.include` of `none`,
  `{mem}` or `{root}`, any `@"…"` resolution outside the declared set:
  a symlink or path traversal out of a `{root}`, package resolution
  running when the profile excludes it, `include_denied` being
  bypassed or silently skipped, or the MCP server's confined
  evaluation reading a file.
- **Budget bypasses.** A document that makes evaluation fail to halt,
  or halt outside the deterministic budgets (`passes`, `revisits`,
  `depth`) — nontermination is a denial-of-service against every
  unattended evaluator.
- **Hermeticity breaks.** Evaluation observing anything beyond its
  four declared inputs (entry text, resolved include closure, `$`
  bindings, evaluator), or the include manifest omitting something
  that was read.
- **Sandboxing breaks.** A document obtaining more capability than the
  host declared — the document, not the host, choosing what is read —
  or code execution during evaluation or include resolution.
- **Module-integrity bypasses.** Vendored or cached module content
  that evaluates despite not matching its locked canon-hash pin.
- The ordinary kind too: memory-safety issues, dependency
  vulnerabilities in the `@tabnas` stack, malicious-input crashes in
  the parser, CLI, LSP or MCP server.

**Documented conditionality is not a vulnerability** — but check the
document. docs/trust.md states exactly where each guarantee is
conditional today: the default `'system'` include capability reads
anything the process can ("treat opening an untrusted source as
running it"), and pattern-matching cost in the TypeScript port sits
outside the event-counted budgets (bounded instead by the portable
pattern subset). Behaviour inside a stated condition is a known
limitation; an escape from a confinement the document says is total is
exactly what to report. When in doubt, report privately — a
misclassified limitation costs a reply, a misclassified vulnerability
costs users.

## Response expectations

Honest numbers for a bus-factor-1 project, best effort rather than an
SLA:

- **Acknowledgement** within 7 days of a private report.
- **Assessment** (in scope or not, severity, affected versions) as
  part of the acknowledgement or shortly after, worked out with you in
  the advisory thread.
- **Fix and disclosure**: confinement and integrity defects take
  priority over feature work. The fix lands with a regression pinned
  in the shared spec suite (`test/spec/`) where the behaviour is
  cross-implementation — an escape fixed in one port is not fixed —
  and the advisory is published when a release containing the fix is
  out. Coordinated disclosure timelines are agreed in the thread;
  there is no bug bounty.

Credit is given in the advisory and the changelog unless you ask
otherwise.

# Aon2 Language Design Notes

*Status: **historical** (marked 2026-08-24; the notes themselves are
undated and predate the capability review). Each of the three
territories sketched below has since been designed and largely
shipped, under different decisions, by the review's gap documents:
collection primitives landed as
[G8](capability-review/g8-generation.md)'s total combinators
(`pack`/`each`/`filter` rather than `iota`/`map`, and user-defined
functions were explicitly refused); pattern matching landed as G8
phase 2's `match()`, selecting by unifiability rather than by a
predicate language; and modules/versioning are
[G6](capability-review/g6-distribution.md)'s design, with identity,
local resolution, `tidy`/`vendor` and the publish boundary landed.
These notes are kept as the earliest sketch of those directions, not
as a plan.*

## 1. Functional Collection Primitives

### Goal

Reduce repetitive configuration without introducing imperative loops.

### Proposal

- Introduce a pure `iota(n)` primitive returning `[0..n-1]`.
- Build higher-order collection primitives (`map`, later `zip`) on top.
- Treat `map` as a deferred pure function compatible with fixed-point unification.
- Avoid `fold`/`reduce` initially because accumulator semantics may interfere with convergence.
- Explore exposing contextual metadata (key, path, index) during mapping and spreads.

### Open Questions

- How should `map` interact with partially unified values?
- Should mapping over maps expose keys, indices, or both?
- How can these primitives preserve convergence guarantees?

## 2. First-Class Pattern Matching

### Goal

Express conditional constraints without introducing imperative control flow.

### Proposal

- Prefer pure pattern matching (`match`) or `when()` functions over `if` statements.
- Functions return constraints rather than performing actions.
- Evaluation is deferred until the matched value is sufficiently concrete.
- Preserve order independence and composability.

### Open Questions

- How should overlapping patterns unify?
- How should disjunctions interact with matching?
- How should recursive matches be handled without compromising convergence?

## 3. Declarative Modules and Dependency Management

### Goal

Enable reusable third-party modules while preserving the "single unified document" philosophy.

### Proposal

- Treat modules as values rather than executable programs.
- Imports contribute values for unification instead of executing code.
- Consider a reserved internal namespace for dependency declarations instead of an external manifest.
- Express versions as declarative constraints where appropriate.
- Keep transport and resolution (GitHub, local filesystem, OCI, etc.) as host responsibilities.
- Investigate lazy loading and provenance-aware diagnostics.

### Open Questions

- What syntax should represent internal namespaces?
- How should dependency metadata be kept out of the final unified document?
- How can module provenance improve diagnostics while remaining declarative?

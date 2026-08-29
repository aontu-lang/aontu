# How-to guides

One task per guide. Each assumes you know the basics (the
[tutorial](../tutorial.md) teaches those), solves one job, and links
the reference for depth. Every example is executed by
`ts/test/docs.test.ts` — what a guide shows is what the engine did.

<!-- Generated from the guides' own frontmatter; regenerate by
     re-running the snippet in the docs rewrite PR, or edit by hand
     and keep order consistent with each guide's `order` field. -->

## Run, embed and integrate

Getting Aontu into your process or pipeline, and its answers out.

- [Run a file or start a REPL](run-cli-and-repl.md) — Evaluate a file, read from stdin, or question a document interactively with the `aontu` command.
- [Call Aontu from TypeScript](call-from-typescript.md) — Embed the engine in Node with the `Aontu` class — parse, unify and generate from your own code.
- [Call Aontu from Go](call-from-go.md) — Embed the engine with the Go port — the same three calls, with errors returned instead of thrown.
- [See the canonical form](see-canonical-form.md) — Print what a document means — defaults, disjunctions and all — instead of what it resolves to.
- [Inject values from the host program](inject-host-values.md) — Fill `$name` variables from the calling program to parameterise a model from code.
- [Give an agent an entrypoint to a definition](give-an-agent-an-entrypoint.md) — Generate a ground-truth stanza with `aontu agentsmd` and serve the verbs over MCP with `aontu-mcp`.
- [Collect errors instead of throwing](collect-errors.md) — Gather every problem in one pass with `collect: true` (TypeScript) or `Check` (Go) instead of stopping at the first.
- [Read a conflict error](read-a-conflict-error.md) — What a conflict message names, in what order, and how to tell a conflict from an unresolved path.
- [Wire your editor](wire-your-editor.md) — Connect `aontu-lsp` to VS Code, Neovim, or any LSP client for diagnostics as you type.

## Templates, defaults and composition

Building one model out of reusable parts.

- [Provide defaults that callers can override](provide-defaults.md) — Write a default in a disjunction with the type an override must satisfy, and layer defaults by rank.
- [Apply a template to many keys](apply-a-template-to-many-keys.md) — Use a `&:` spread entry to unify one template into every key of a map or every element of a list.
- [Seal generated children deeply](seal-generated-children.md) — Close both the set of `pack`-generated children and each child's shape, or seal from the side with a hidden guard.
- [Reference and reshape other parts of the document](reference-and-reshape.md) — Pull other parts of the document in by reference, extend them, and relocate them with `move` and `copy`.
- [Keep schema and helper fields out of the output](keep-schema-out-of-output.md) — Mark schema and helper fields with `type()` or `hide()` so they constrain and compute without being generated.

## Schemas and constraints

Saying what data must look like, from optional keys to recursive shapes.

- [Constrain every element of a list](constrain-list-elements.md) — Type every element of a list with a `&:` spread, and know why a bare `[string]` does not.
- [Forbid unexpected keys](forbid-unexpected-keys.md) — Seal a map with `close` so a typo'd or invented key is refused instead of absorbed.
- [Make a field optional](make-a-field-optional.md) — Suffix a key with `?` so a field that never receives a value is dropped instead of erroring.
- [Name a reusable constraint](name-a-reusable-constraint.md) — Build a `uint8`/`port` vocabulary as a `type()`-marked block of ordinary fields.
- [Define a recursive schema](define-a-recursive-schema.md) — Reference a definition inside itself to get a schema that applies at every depth of the data.
- [Carry exact money over JSON](carry-exact-money-over-json.md) — Keep money exact inside Aontu and cross JSON as a fixed-scale decimal string with a conversion mark.
- [Export JSON Schema](export-json-schema.md) — Export a model as JSON Schema 2020-12 with `aontu jsonschema`, and read the loss report it owes you.

## Query, explain and change

The get, why, set and trim loop over a live document.

- [Query a path](query-a-path.md) — Print one node of the evaluated document by path, or a keys, types, or depth-limited view of it.
- [Explain a value](explain-a-value.md) — List every contribution that met at a path — which file, which line, which layer — with aontu why.
- [Change a value with an overlay](change-a-value-with-an-overlay.md) — Append a change to an overlay file with aontu set, so the original document keeps its bytes and a bad change is refused before it lands.
- [Change a pinned value](change-a-pinned-value.md) — Rewrite a pinned literal where the author wrote it with aontu set --in-place, and know the cases where the verb appends instead.
- [Find dead entries](find-dead-entries.md) — Report map entries whose removal changes nothing, so layered files do not silt up with lines a template already implies.

## Validate and evolve

The gate verbs: vet, breaking, relations, reaches and hash.

- [Validate data in CI](validate-in-ci.md) — Run aontu vet in a pipeline so a document that does not hold fails the build, with the reason attached.
- [Gate schema changes](gate-schema-changes.md) — Gate schema edits with aontu breaking, so a change that would refuse previously valid documents fails the review.
- [Check that components agree about their relations](check-relations.md) — Declare a relation once at the field with rel(), acyclic() and inverse(), and have the whole model's edge set checked.
- [Query reachability between entities](query-reachability.md) — Ask whether one entity reaches another over the declared edges with aontu reaches, and get the path as the answer.
- [Pin what a document means](pin-a-document-hash.md) — Pin a document's meaning to one string with aontu hash, and detect when the meaning moves.

## Modules and multi-file

Splitting a model across files and vendoring a dependency closure.

- [Split a model across files](split-a-model-across-files.md) — Load other source files with @"path" so a base model and its overrides unify into one document.
- [Vendor a dependency closure for an offline build](vendor-a-dependency-closure.md) — Lock a module closure with aontu mod tidy and copy it into aon_vendor/ so a build resolves every import with no network at all.
- [Vendor a module by hand](vendor-by-hand.md) — Bootstrap a module dependency without a fetch verb by copying its source tree into aon_vendor/ and letting aontu mod tidy pin what it means.

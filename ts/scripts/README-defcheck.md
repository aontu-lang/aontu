# Checking the hand-written rows against the definition

Three scripts run the definition in `spec/` over the `verdict` and
`gens` rows of `test/spec` that nobody generated from it, and sort what
they find.

| Script | What it does |
|--------|--------------|
| `defterm.cjs` | Reads aontu text with the TypeScript engine's parser and prints it as the definition's terms: a document as its `Decls` and a `Val`, data as `Data` |
| `defcheck.cjs` | Converts each row, evaluates it with the definition in batches, and compares the answer with the row's |
| `defcheck-engines.cjs` | Runs each row the definition answers differently through both engines, and sorts it |

## Before you run them

Build the TypeScript engine (`cd ts && npm run build`), the definition
(`cd spec && lake build Aontu Oracle.Print`) and have `go` on the path.
The runner looks for `lake` on the path, and also in
`~/lean-dl/lean-4.24.1-linux/bin`, where the release archive unpacks.

```sh
node ts/scripts/defterm.cjs 'a: *1 | 2'            # one document's terms
node ts/scripts/defcheck.cjs --dry                 # what converts, and why the rest doesn't
node ts/scripts/defcheck.cjs                       # every row; or --files a.tsv,b.tsv
node ts/scripts/defcheck-engines.cjs               # sort the disagreements
```

Both write to `sketch/defcheck/` unless `--out` names another
directory: `agreement.md`, the count per file; `results.tsv`, every row
with the definition's answer and the source its term prints back as;
and `worklist.tsv`, each disagreement with its class. The Lean batches
and their output stay in `lean/` there, which git ignores.

## How a row is read

A `verdict` row is `vetG` in the mode its options name: the default,
`noFill` (`fill := false`) or `partial` (`lax := true`). A `gens` row
is `outputW`, written as the engines write JSON. A document's top-level
declarations are its `Decls`, and a row that reads a variable reads the
bindings both test runners make (`progVars` in `spec/Oracle/Gen.lean`).

The converter follows the reader's conventions that `spec/Aontu/Syntax.lean`
states: `*x` as an arm is the arm `x` of rank one, a list literal beneath
an arm or a lone `*` is sealed, a written `nil` is `Val.void`, and
`close(v)` seals every literal container in `v`. JSON data keeps each
number's text and reads it as `vet` does (`NumText.read`).

A row the definition can't take is skipped, and `results.tsv` says why:
a construct with no term (`custom`, `export`, a declaration below the
top, `empty()` alone), a row that loads a file, a variable the runners
bind that the definition doesn't.

## The classes of a disagreement

| Class | Meaning |
|-------|---------|
| `reading` | The engine reads the term's printed source differently from the row's own: the converter, or the printer, doesn't carry the document, so the row says nothing about the definition yet |
| `definition` | Both engines answer as the row does and the definition differs: a gap in the definition |
| `row` | The TypeScript engine answers as the definition does: the row may be wrong |
| `engines` | None of the above; read it by hand |

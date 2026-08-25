# API reference

The programming interfaces of both implementations, plus the
command-line tool. For the language itself see the
[Language reference](reference-language.md).

## Contents

- [Command-line interface](#command-line-interface)
- [Evaluation consumes the tree](#evaluation-consumes-the-tree)
- [TypeScript API](#typescript-api)
  - [`Aontu`](#class-aontu)
  - [`AontuOptions`](#aontuoptions)
  - [`AontuContext`](#aontucontext)
  - [`Val`](#val-typescript)
  - [Exact numbers and `exactJSON`](#exact-numbers-and-exactjson)
  - [Variables](#variables)
  - [Exports](#exports)
- [Go API](#go-api)
  - [`Aontu`](#type-aontu)
  - [`Val`](#val-go)
  - [Exact numbers in Go](#exact-numbers-in-go)
  - [`Ctx` and errors](#ctx-and-errors)
  - [Variables in Go](#variables-in-go)
- [Behavioural parity](#behavioural-parity)

---

## Command-line interface

Both implementations ship the same `aontu` command. It evaluates a
source file (or stdin) and prints the result, or starts a REPL when run
interactively with no file.

```
Usage: aontu [options] [file]
       aontu vet [options] <schema> <data> [more-data...]
       aontu subsume [options] <general> <specific>
       aontu breaking --against <file|git#rev> [options] <file>
       aontu trim --check [options] <file>
       aontu relations [options] <file>
       aontu hash [options] <file>
       aontu mod tidy|vendor|manifest [options] [dir]
       aontu get <path> [options] <file>
       aontu why <path> [options] <file>
       aontu set <path>=<value>... --entry <file> --overlay <file> [--in-place]
       aontu agentsmd [--write <AGENTS.md>] <file>

Evaluate an Aontu source file and print the result as JSON.
With no file on an interactive terminal, start a REPL.
With no file and piped input, read the source from stdin.

Options:
  -c, --canon     Print the canonical form instead of generated JSON
  -h, --help      Show this help and exit
  -v, --version   Print the version and exit
```

**Behaviour**

- **File:** `aontu config.aontu` reads, unifies and prints the file.
  Relative `@"file"` loads inside it resolve against the file's own
  directory, so it works from any working directory.
- **Exactly one file.** The bare form is `aontu [options] [file]`,
  singular, and a second file name is a usage error (exit 2) rather
  than a silent discard. This is what makes a MISTYPED VERB fail
  loudly: `vet2` matches no subcommand, so it falls through as a file
  name, and `aontu vet2 schema.aon good.json` used to print
  `good.json` and exit 0 — a plausible pass, in the one place a tool
  loop reads the exit code to decide whether the data is good. A file
  genuinely named like a verb is still reachable as `./vet`.
- **Stdin:** `echo 'a:1 b:$.a' | aontu` reads source from the pipe.
- **REPL:** `aontu` with no file on a terminal starts an interactive
  loop; each line is evaluated and printed.
- Output is pretty-printed JSON by default, or canonical form with
  `--canon`.
- **Exact numbers keep their digits.** A document using the `0d` exact
  literals prints them in full, at any magnitude: `x:0d9007199254740993`
  prints `9007199254740993`, not a rounded `…992`. The TypeScript CLI
  gets this from the library's [`exactJSON`](#exact-numbers-and-exactjson)
  export, the Go CLI from a `json.Encoder` over the
  [marshalling types](#exact-numbers-in-go) — with HTML escaping **off**
  in both, so `<`, `>` and `&` stay literal and the two CLIs print the
  same bytes.
- Results go to **stdout**; errors go to **stderr** with a non-zero exit
  status (`1` for an evaluation error, `2` for a bad option).

### `aontu vet`

Validate data documents against a schema document. This is the
emit → validate → repair loop's entry point: an agent writes a
document, `vet` says what does not hold and where, and the exit code
says which kind of "no" it was.

```
aontu vet [options] <schema> <data> [more-data...]

  --at <path>       Validate against this path of the schema ($.a.b)
  --closed          Refuse keys the anchor does not declare
  --partial         Residue is reported but does not fail the run
  --max-errors <n>  Cap the finding list (default 20)
  --format <f>      text (default), json or sarif
  --watch           Re-run whenever a watched file changes
```

**Exit codes are verdict classes**, not a pass/fail bit, because the
three ways to fail call for three different responses:

| Exit | Verdict | Meaning |
|------|---------|---------|
| 0 | `valid` | the data unifies and is concrete (or `--partial`) |
| 1 | `invalid` | the data does not hold: a contradiction it can never satisfy, or a document that would not parse |
| 2 | — | usage: a bad option, or a file that cannot be read |
| 3 | `incomplete` | no contradiction, but the truth is not yet satisfied |
| 4 | `error` | the run could not be set up from the schema side: an unusable schema, or an `--at` that names nothing — never the data's fault |

Each data file is vetted separately, and the worst verdict wins: two
data files are two candidates for the same truth, not one merged
candidate. `--max-errors` caps the whole report, not each file, and
says so with `truncated`.

**A data file that will not parse is the data's fault**, and is
reported as one `parse`-class finding with a site in that file — not as
a broken schema. The distinction matters to the loop the verb exists
for: exit 1 says "repair what you emitted", exit 4 says "the truth you
were given is unusable, stop".

**A parse failure is located.** Its single site carries the parser's
own row and column, 1-based — the same position the human renderer
draws its caret under. A document whose second line is `b: ]` reports
`row: 2, col: 4`, in both ports.

**A site has an extent, so a finding can be repaired.** Beside `row`
and `col` a site carries `len` — the span in UTF-16 code units, the
units `col` is already counted in — and `src`, the source text that
span covers. Both are `-1` and `""` when unknown, and a consumer must
not edit a site that says so.

The extent is not optional detail, because **`value` is the canon and
not the source text**. Vetting `port: 0x1F` reports `value: "31"` at
column 7, so replacing `(col, value.length)` writes `port: 90001F`.
With the span the edit is `(col, len)` — `(7, 4)` — and lands exactly
on `0x1F`.

`src` is what makes the span **verifiable**: read the document at
`(row, col, len)`, compare it to `src`, and refuse if they differ. That
check matters most where the span is honest but partial. A site names
the token it points at, exactly as `row` and `col` always have, so a
scalar reports its whole literal while a compound reports its opening
token — `min(1)` reports `src: "min"`, a map reports `src: "{"`. Seeing
`min` where it expected `min(1)`, a consumer refuses rather than
replacing the name and orphaning the arguments.

```json
{ "col": 7, "file": "data.aon", "len": 4, "role": "data",
  "src": "0x1F", "row": 1, "value": "31" }
```

`aontu why` carries the same pair: each conjunct in the record has the
`len` on its site and the contribution's own `src` beside its `canon`.

**Every verdict carries its finding, `error` included.** A schema that
does not stand up — a contradiction inside it, a document that will not
parse, a merge marker — reports what failed and where, while the
verdict stays `error`: whose fault it is and what the fault is are two
separate answers, and the report gives both. Every site is in the
schema (role `schema`), and a contradiction names both of its operands,
exactly as one in the data would. A report that said only `error` was
the one a repair loop could do nothing with.

**`--at` takes a structural path** — map keys and list indices, the
same thing a reference means by `$.a.b`, with an index spelled as a
plain decimal integer. A path that names nothing is verdict `error`,
carrying the same `no_path` finding `get` and `why` give — including
the "did you mean" note when a near key exists.

**Relative `@"file"` loads inside either document** resolve from that
document's own directory, exactly as they do for `aontu <file>`.

**A finding names both sides.** Sites are labelled by provenance —
`data` first, because that is the one to edit — rather than by the
source-order heuristic a single-document error uses:

```
$ aontu vet service.aon deploy.json
verdict: invalid

$.service.prot: closed [conflict]
  [aontu/closed]: Cannot resolve value at path $.service.prot
  data: deploy.json:1:40 (8080)
$.service.replicas: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.service.replicas
  data: deploy.json:2:28 ("3")
  schema: service.aon:4:13 (integer)
```

`--format json` emits the same report as an object, with an `aontu`
stanza naming the producer, so a report read from a pipe says which
version and verb made it. Where the constraint algebra knows what would
have unified, the finding carries it as `expected`/`actual`, and a
`must()` check's author message rides along as `note`.

`--format sarif` emits the report as SARIF 2.1.0, the interchange form
CI systems ingest (GitHub code scanning upload, PR annotation) — a
minimal profile: one run, one result per finding, the data site as the
primary location, the schema site under `relatedLocations`, and the
whole native finding embedded in `properties`, so a SARIF consumer
still holds the native contract. Severities map to SARIF levels
(`info` → `note`). The renderer is library API in both ports
(`sarifReport(report, version)` from `aontu`; `aontu.SarifReport` in
Go), and its bytes are held to cross-port parity by the golden in
[`test/spec/files/vet-sarif/`](../test/spec/files/vet-sarif/README.md).
A ready-made GitHub Action wrapping the verb ships in this repository:
[`vet-action/`](../vet-action/README.md).

`--watch` re-runs the whole vet whenever a watched file (the schema or
any data file) changes, streaming one report per run — honestly
non-incremental: parsed trees are single-use, so every run is a full
re-parse and re-unify, bounded by the fixpoint's pass budget. A file
that is briefly unreadable mid-save reports and keeps watching.

### `aontu subsume`

The subsumption query as a command
([docs/reference-language.md, "Subsumption"](reference-language.md#subsumption)):
does the general document admit every instance the specific one admits?

```
aontu subsume [--profile values|defaults|gen] [--at <path>]
              [--format text|json] <general.aon> <specific.aon>
```

The exit code is the verdict class: `0` subsumes, `1` does not subsume
(the findings carry the witness — path, codes, both sites), `3`
undecided (always with a `sub_*` reason), `4` a document that does not
stand up on its own, `2` usage. The report reuses vet's finding object
and renderers, class `compat`.

### `aontu breaking`

The evolution gate built on the same query: compare a document against
its own earlier versions.

```
aontu breaking --against <file|git#rev> [--mode backward|forward|full]
               [--allow-undecided] [--format text|json] <file.aon>
```

- `--against` takes a file path or `git#<rev>` (resolved by shelling
  out to `git show <rev>:./<basename>` from the file's own directory —
  no embedded git), and is repeatable.
- Modes: **backward** (the default) checks the new document subsumes
  the old — documents valid under v1 stay valid; **forward** checks the
  old subsumes the new; **full** checks both.
- The document can declare its own promise:
  `aontu_policy: hide({compat: *backward | forward | full | none})` —
  `breaking` reads `$.aontu_policy.compat` from the new document, and
  `--mode` overrides it. `none` declares no promise: nothing is
  checked.
- Exit codes mirror `subsume`'s: `0` compatible, `1` breaking, `3`
  undecided, `4` error, `2` usage. Undecided **fails** the gate by
  default — a gate that shrugs is not a gate — downgradable with
  `--allow-undecided`.
- `--allow-deprecated-removal` downgrades a finding about a value the
  old version already `deprecate()`d to a warning (still reported, no
  longer failing): deprecate-then-remove is the supported rename path.

### `aontu trim`

Report redundant map entries — entries whose removal leaves the
evaluated result unchanged, the spread-implied case included — as
paths.

```
aontu trim --check [--format text|json] <file.aon>
```

- The test is **evaluate-and-compare**: for each candidate entry the
  source is re-parsed, the entry deleted from the parsed tree, and the
  canon compared to the baseline. This covers everything the fixpoint
  can see (spread templates, references, duplicate-key merges), and a
  removal that *errors* is not redundant — the entry is load-bearing.
- Candidates are map entries at every depth; **list elements are not
  candidates** (removing one shifts every later index — a different
  document, not the same one minus a redundancy). A child of a
  redundant parent is skipped: removing the parent already covers it.
- `--check` is **required**: trim only reports for now — rewriting the
  file in place needs a format-preserving editor (G7) — and
  `aontu trim f.aon` doing something other than trimming silently
  would be worse than saying so.
- Exit codes: `0` clean, `1` redundant entries found, `4` the document
  itself does not evaluate, `2` usage.

### `aontu get`

Select one node of an evaluated document by path and render it — the
task-sized slice, instead of the whole file as one JSON blob.

```
aontu get <path> [-c|--canon] [--keys] [--types] [--depth <n>]
          [--format text|json] <file.aon>
```

- **Evaluation is global.** Unification has no partial mode: the whole
  document is evaluated and then one node is selected. What `get` buys
  is the size of the *answer*, not the cost of producing it.
- The path is what a reference means by `$.a.b` — map keys and
  canonical-decimal list indices, and nothing else, so `$.a.01` names
  nothing here exactly as it names nothing there. A key that *contains*
  a dot is likewise unreachable, as it is to a reference; the escape
  spelling is [G4](../docs/capability-review/g4-identity-relations.md)'s
  to settle for both at once.
- Default output is the fragment's generated JSON; `--canon` is its
  canonical form, and for the root path that is byte-identical to
  `aontu --canon`.
- Exit codes: `0` rendered, `1` the path names nothing (the finding
  carries a nearest-key suggestion), `2` usage, `4` the document does
  not stand up on its own — including a node that is not concrete, for
  which there is no JSON to print.

**The projections are lattice abstractions.** Each view is a valid
Aontu document that *subsumes the truth* — generalisation, never
distortion:

| flag | view |
|------|------|
| `--types` | every concrete leaf lifted to its own kind: `{"replicas":3}` becomes `{"replicas":integer}` |
| `--depth n` | structure to depth n; every elided subtree renders as `top` — "no further information at this tier" |
| `--keys` | the node's own key names (or list indices), one per line |

That claim is checked rather than asserted: every projection row of
`test/spec/query.tsv` runs
[`subsume`](#aontu-subsume)`(view, truth)` in both implementations and
requires `subsumes`. It runs under the **values** profile, deliberately
— a shape view *erases defaults* (`*8080|integer` becomes
`*integer|integer`), which the `defaults` profile would rightly call a
compatibility break. The claim projections make is about the values
admitted, not about which one is generated.

Kinds are lifted through the lattice's own `superior()`, so the view
follows the type system rather than a table of the renderer's opinions;
a value that is *already* an abstraction (a kind marker, a constraint,
an unresolved reference) is left alone rather than generalised twice.
Projections are not canonical form and are never fed to
[`aontu hash`](#aontu-hash) — the flags are distinct from `--canon` to
keep that unambiguous.

### `aontu why`

Provenance: what *contributed* to the value at a path, in order, with
the site each contribution was written at. The positive twin of
[`vet`](#aontu-vet)'s report — errors explain what failed to unify,
`why` explains what did.

```
aontu why <path> [--format text|json] <file.aon>
```

```
$ aontu why $.services.auth.replicas service.aon
$.services.auth.replicas = 3
  1. *1|integer  service.aon:2:18  (spread)
  2. 3  service.aon:3:21
```

- A **contribution** is a value the author *wrote* that met something
  at this path. Values the engine mints on the way — a kind lifted
  from a leaf while a disjunction trials its members, a fold's
  intermediate — are not contributions, and neither are the members
  *inside* one written value, which meet at the same path as that
  value resolves. A **conjunct** is the exception in the other
  direction: `a & b`, or the merge of two duplicate keys, is the
  statement that several separately-written values must all hold, so
  it expands into one contribution each.
- **Roles**: `literal`, `spread` (a template applied to this key),
  `ref` (the reference itself, whose canon names its target) and
  `pref`. A preference *inside* a spread template reports as `spread`,
  which is the thing the author needs to be told.
- Contributions are listed in **source order** — file, then row, then
  column — not in the order the fixpoint happened to meet them, which
  is an engine detail.
- A value written once and never met has **no contributions**, and
  says so. That is a fact about the document, not a failure.
- `--format json` emits the record: `{path, value, conjuncts:
  [{canon, role, site}]}`, with sites in the same shape the vet report
  uses. Exit codes mirror `get`'s: `0` explained, `1` the path names
  nothing, `2` usage, `4` the document does not stand up.
- **Cost**: the recorder rides the context and is off by default —
  uninstrumented evaluation pays one property load per meet. An
  instrumented run pays site materialisation, one map entry per path
  met, and the spread walk that marks a template's application.

### `aontu set`

Change a document by **appending to an overlay**, not by rewriting it.

```
aontu set <path>=<value>... --entry <file> --overlay <file>
         [--in-place] [--dry-run] [--format text|json]
```

```
$ aontu set '$.services.auth.owner="identity-2"' \
    --entry system.aon --overlay changes.aon
verdict: valid
wrote: changes.aon
```

- The assignment becomes a **path-flattened conjunct** — `$.a.b=1`
  is appended as `"a": "b": 1`, keys quoted so a segment may be a
  word the grammar spells otherwise, a number, or hold a space. The
  text is split at the *first* `=`; everything after it is Aontu
  source, so a value may contain one.
- This needs no rewriter, and damages nothing: an overlay entry is
  just another conjunct, and unification is order-independent, so
  appending to a second file is the same value as writing into the
  first. The shared suite asserts that equivalence for every row
  rather than claiming it.
- **Appending cannot change a pinned value.** The lattice refuses `5`
  against `3`, the verdict is `invalid`, and the finding names the
  pinning site — which [`aontu why`](#aontu-why) then explains.
  `--in-place` closes that loop.
- **`--in-place` rewrites the literal where the author wrote it.** The
  span at `(row, col, len)` is replaced and nothing else is touched, so
  comments and layout survive — including a comment on the edited line.
  Nothing is re-serialised, which is why no CST is needed: a targeted
  splice never reads the bytes it does not replace.
- **The span is verified before a byte is written.** A site carries
  `src`, the source text it claims to cover, and the text at the span
  must equal it. That is what makes `port: 0x1F` safe to rewrite even
  though its value is `31` — the span is four code units and says so.
- **It rewrites only a single editable literal, and appends otherwise.**
  The contribution must be one `literal`-role conjunct in *this*
  overlay whose `src`, parsed alone, means the contribution's own canon
  — which refuses a compound, because a site names a compound's
  *opening token* (`min` for `min(1)`, `1` for `1+2`, `{` for a map).
  It must also be concrete: `a: integer` is a constraint, not a pin,
  and appending narrows it without discarding what it says. Anything
  else appends exactly as plain `set` would, plus one **warning**
  naming the case — `patch_not_editable`, `patch_ambiguous` or
  `patch_span_mismatch`. Warnings never move a verdict, so `--in-place`
  cannot turn a run that would have held into one that does not.
- A default (`a: *1`) is left alone with no warning: appending already
  overrides a default correctly.
- The report gains `replaced`, one entry per rewrite, carrying the path,
  the site, and `from`/`to` as **source text** — replacing `0x1F` with
  `31` is a different edit from replacing it with `0x1F`, and only the
  spelling says which.
- **The overlay is written only when the change holds.** An `invalid`
  or `error` verdict leaves the file exactly as it was: a change the
  author still has to think about should not sit in their
  configuration while they do. `--dry-run` writes nothing either way
  and prints what would have been written.
- A missing overlay file is the empty overlay, and is created.
- Exit codes are [`vet`](#aontu-vet)'s verdict classes: `0` valid,
  `1` invalid, `2` usage, `3` incomplete, `4` the entry does not stand
  up on its own.

### `aontu agentsmd`

Generate the AGENTS.md stanza for a definition — the prose entrypoint,
derived from the formal source so it cannot drift from it.

```
aontu agentsmd [--write <AGENTS.md>] <file.aon>
```

The stanza names the document, its [canon-hash](#aontu-hash) pin, its
root keys and its shape, and spells the `get` / `why` / `vet` / `set`
commands with a path that actually exists in it. `--write` splices it
into a file between `<!-- aontu:begin -->` and `<!-- aontu:end -->`,
appending the markers when they are absent — everything outside them
is left exactly as it was, so the verb is safe to re-run and safe to
point at a file someone else writes prose in.

Exit codes: `0` generated, `2` usage, `4` the document does not stand
up on its own.

### `aontu hash`

The canon-hash: one string that pins what a document *means*, so a
lockfile, a registry or an agent can say "this module, this meaning"
and have the claim survive reformatting.

```
aontu hash [--form] [--format text|json] <file.aon>
```

- The hash is
  `"aon1-" + base64url(SHA-256(UTF-8(hcanon(unify(file)))))`, where
  `hcanon` is the **hash form** — see below. `aon1-` is a scheme id, so
  a future semantically-stronger normal form is an upgrade rather than
  a breakage.
- The document is evaluated **standalone**: its own `@"file"` closure
  resolved and unified at its own root, before any consumer context.
  That is what makes the pin transitive — an edit two includes deep
  changes the unified root, hence the hash.
- **The pin survives** comments, whitespace, formatting, key
  reordering, and splitting one file into several includes — any
  refactor that leaves the unified value identical. **It breaks on**
  any semantic change in the transitive closure: a default flipped, a
  field added, a map closed, a constraint tightened.
- `--form` prints the hashed TEXT instead of the digest, which is what
  to diff when a pin moves. `--format json` prints both under
  `hash` and `form`.
- Exit codes: `0` hashed, `2` usage, `4` the document does not
  evaluate on its own — a broken document has no meaning to pin, and a
  hash of the wreck would agree with every other wreck.

**The hash form (`hcanon`)**

Exactly the unify-level [canon](#val-typescript) with the two
additions that close its semantic gaps:

| | canon | hash form |
|---|---|---|
| a closed map or list | `{"a":1}` | `close({"a":1})` |
| a `type`- or `hide`-marked value | `1` | `type(1)`, `hide(1)` |

Both reuse existing parseable syntax, so the hash form is itself valid
Aontu source and round-trips —
`hcanon(unify(parse(hcanon(v)))) == hcanon(v)` is asserted for every
row of `test/spec/hcanon.tsv`, in both implementations. Marks
propagate to every descendant at unification, so a wrapper is emitted
only where a mark *starts*. User-facing `canon` is unchanged.

This is a *canonical-text* hash, not a hash of semantic equivalence
classes: canon is deterministic syntax, not a unique normal form, so
`number|integer` and `number` denote the same value set and hash
differently. The failure direction is the safe one — a false "changed"
forces a needless re-review, while a false "unchanged" is impossible
provided the hash form is semantically complete, which is exactly why
the `close`/mark additions are part of the definition rather than an
optimisation.

### `aontu mod`

Module tooling: the commands that maintain a project's dependency
closure and describe what a publish would push. All are **local** —
they read and write the project, the vendor directory and the user
cache, and never reach the network.

```
aontu mod tidy     [--format text|json] [dir]
aontu mod vendor   [--format text|json] [dir]
aontu mod manifest [--against <dir>] [--format text|json] [dir]
```

`dir` is the project root — the directory holding `mod.aon` — and
defaults to the working directory.

**`tidy`** walks the dependency closure and rewrites `mod-lock.aon`.

- Dependencies are read from each module's own `mod.aon`, under a
  `dep` map keyed by module path, each entry declaring a version `v`:

  ```
  dep: { "corp.example/schemas/service@1": { v: "1.4.2" } }
  ```
- Selection is **minimum version selection**: each module is taken at
  the *highest of the minima* anyone in the closure asked for, never
  higher. Nothing is upgraded by the act of resolving, so a tidy is
  reproducible and adding a dependency cannot silently move an
  unrelated one.
- The closure is walked breadth-first and terminates without a cycle
  check, because a module's selected version only ever rises.
- Each entry's `canon` pin is **recomputed** from the module in the
  store, by unifying its entry file standalone and hashing it (see
  [`aontu hash`](#aontu-hash)). It is never carried over from the old
  lockfile, which would pin what the module *used* to mean. The `oci`
  digest *is* carried over: it is the registry's word about the bytes
  it served, and nothing local can hear it.
- The lockfile is written in canonical form under a generated-file
  header, so it is one diffable line and every reader strips `#`
  comments before parsing it:

  ```
  # mod-lock.aon (generated by `aontu mod tidy`; do not edit)
  {"lock":{"corp.example/schemas/service@1":{"canon":"aon1-oQs6…","oci":"","v":"1.4.2"}}}
  ```

- A module the stores do not hold is reported as missing and **the
  lockfile is not written at all**. A partial lock is worse than none:
  it would claim a closure that was never resolved.

**`vendor`** copies every locked module out of the stores into
`aon_vendor/`, as a whole source tree — that is what an OCI layer
holds, and a module is more than its entry file. A module already
resolving from `aon_vendor/` is left alone rather than copied onto
itself. Anything the stores do not hold is reported as missing.

Because the user cache is keyed by canon-hash, `vendor` can only find
what the lockfile already pins: a cold start with no lockfile has
nothing to search the cache *by*. `tidy` first, then `vendor`.

- `--format json` prints the report as an object with the usual
  `aontu: {version, verb}` envelope, `verdict` (`ok` or `missing`),
  the resolved list, and `missing`.
- Exit codes: `0` resolved, `1` something was missing, `2` usage.

**`manifest`** prints the OCI artifact a publish would push, and gates
it on the breaking check.

- A module publishes itself, so its own `mod.aon` declares a version
  as well as a path and an entry:

  ```
  mod: { path: "corp.example/schemas/service", version: "1.4.2",
         main: "service.aon" }
  ```

  The **major an import spells lives inside that version** — `1.4.2` is
  published as `corp.example/schemas/service@1`. A module declaring no
  version, or one whose entry file is absent, has nothing to mint: that
  is an `error` verdict, not a missing fetch.
- The artifact: config media type
  `application/vnd.aontu.module.v1+json`, one layer holding the module
  source tree, and four annotations —
  `org.opencontainers.image.title` and `.version` for the path and
  version, and `com.github.rjrodger.aontu.canon` and `.major` for the
  two facts OCI has no predefined key for.
- The layer is the source tree, relative and forward-slashed so two
  implementations on two platforms describe the same layer.
  `aon_vendor/` is excluded: a published module carries its own
  sources, not a copy of everyone else's.
- **`--against <dir>` is the publish-time breaking gate.** It names a
  prior version's module tree, and runs
  [`breaking`](#aontu-breaking)'s backward check between the two: every
  instance the old version admitted must still be admitted. The
  verdict, the findings and the exit class are that check's, unchanged
  — this is wiring at the boundary where versions are minted, not a
  second definition of "breaking".
- **A major bump is where breaking is allowed.** When the prior
  version's major differs from this one's, the gate does not apply: the
  major lives in the module path, so a consumer of `@1` never sees `@2`
  unless it asks, and checking across majors would forbid the one
  change the version scheme exists to express.
- Exit codes: `0` may be published, `1` breaking, `2` usage, `3`
  undecided, `4` nothing to mint — [`subsume`](#aontu-subsume)'s
  classes, because the gate is a subsumption check.

**"Has the truth changed?" is one annotation read and a string
compare** — no download, no parse. The canon-hash in the annotation is
the same string `tidy` locks and [`aontu hash`](#aontu-hash) prints, so
a consumer holding `aon1-oQs6…` can ask a registry index whether the
module still means what it meant. A reformat, a comment or a file split
will not move it.

**`get` and `publish` are not in this build.** They are the network
half of the design (`docs/capability-review/g6-distribution.md`) and
need a registry client. The CLI names them anyway and says which half
is missing, because a reader of the design will type them and deserves
a better answer than "unknown subcommand":

```
$ aontu mod get
aontu: mod get needs a registry client, which this build does not ship
(docs/capability-review/g6-distribution.md)
```

**REPL commands**

| Command | Effect |
|---------|--------|
| `:help` | show help |
| `:load <file>` | evaluate a document and hold it for the commands below |
| `:get [path]` | what the held document says at a path |
| `:keys [path]` | the keys at a path of the held document |
| `:why <path>` | every contribution to the value at a path |
| `:canon` | switch to canonical-form output |
| `:json` | switch to JSON output |
| `:quit`, `:exit` | leave (or press Ctrl-D) |

`:load` holds the document's **source**, not its evaluated tree —
parsed trees are single-use — so every later question re-evaluates
from the text. `:get` and `:keys` are the [query](#aontu-get) surface
and `:why` is the [provenance](#aontu-why) surface, answering about
the held document.

**`--jsonl` makes the session machine-drivable**: no banner, no
prompt, and every command answers as one JSON line
(`{"ok":true,"out":"…"}`), so a harness can drive the REPL the way it
drives the CLI. Human-readable output stays the default.

```
$ aontu
Aontu v0.50.1 REPL — :help for commands, :quit to exit
aontu> port: *8080 | integer
{
  "port": 8080
}
aontu> :canon
canon output
aontu> a:1|2|3
{"a":1|2|3}
aontu> :quit
```

### The MCP server

```
aontu-mcp
```

A Model Context Protocol server over stdio (newline-delimited
JSON-RPC 2.0), shipped as a second binary of the npm package. It
follows the language server's three-layer split
([docs/lsp.md](lsp.md)): the tools and the protocol are a
transport-free library (`ts/src/mcp.ts`), the binary is stdio and
nothing else.

| Tool | Answers |
|------|---------|
| `vet` | the [vet](#aontu-vet) report for a schema and a data document |
| `get` | the [query](#aontu-get) surface: a path, and a view of it |
| `why` | the [provenance](#aontu-why) record for a path |
| `diff` | what changed at which paths between two documents |
| `canon` | a document's canonical form |
| `summary` | the pin, the root keys and the top-tier shape — the first tier of progressive disclosure, expanded by calling `get` |

Every tool returns **the same JSON contract the CLI prints**, so a
report read from one is the report read from the other. A tool that
*refuses* — an invalid document, a path that names nothing — answers
with its own report and `isError: false`, because the report is the
answer; `isError` is reserved for a call that could not be made at
all.

Served evaluation is **confined to no includes** (G5,
[docs/trust.md](trust.md)): the source arrives from a caller, and
`@"..."` is exactly what a server must not run unconfined. The Go port
ships no separate MCP server — its role is embedding the same library
calls, and `Get`, `Why`, `Diff` and `AgentsMd` are in the Go API for
that.

### The published grammar

[`grammar/aontu.gbnf`](../grammar/aontu.gbnf) and
[`grammar/aontu.lark`](../grammar/aontu.lark) publish the **emission
surface** for constrained decoding. They are conservative by
construction — they accept less than the parser does, never more — and
they deliberately exclude `@"..."` includes, because generated
documents should describe values rather than reach for files.

The grammar is not a document that drifts: `ts/test/grammar.test.ts`
reads `aontu.gbnf`, interprets it, and requires it to accept **every
canonical-form output in the shared spec suite**.

### The skill

[`docs/skill/`](skill/) holds the agent-facing sources: a trigger
stub, a one-page grammar card, a JSON-first example ladder, and the
error-code index for repair loops. Every example document in the
ladder is evaluated by `ts/test/skill.test.ts`, so a skill that
teaches something the engine no longer does fails the build.

### LSP hover provenance

The language server can append a value's **contributions** to its
hover — what met at that path, in source order, with each site — the
same record [`aontu why`](#aontu-why) prints. It is off unless an
editor asks for it:

```json
{ "initializationOptions": { "aontu": { "provenance": true } } }
```

Hover already re-unifies the document per request, so an editor that
asks for this pays a second, instrumented evaluation knowingly, and
one that does not pays nothing. Diagnostics are unchanged either way.

**Getting the command**

- **TypeScript:** the npm package declares a `bin` named `aontu`
  (`dist/cli.js`), so `npm install -g aontu` (or `npx aontu`) provides
  it. From a clone: `node ts/dist/cli.js …`.
- **Go:** `go install github.com/rjrodger/aontu/go/cmd/aontu@latest`, or
  from a clone: `go run ./cmd/aontu …` (inside `go/`).

Both commands accept the same options and produce the same results.

---

## Evaluation consumes the tree

A parsed `Val` tree is **single-use**, in both implementations.
`unify`/`generate` refine the tree in place (children are written
back, junction and reference nodes advance their own state), which is
safe only because a tree is unified once and never shared. Do not
cache, reuse, or unify the same parsed `Val` — or any node reachable
from it — in two different evaluations: the second run starts from
mutated state and the result is nondeterministic. Parse again (or
clone first) for every independent evaluation. The string entry points
(`generate(src)`, `unify(src)`) parse per call and are always safe.

This is a named rule of the [trust contract](trust.md)'s determinism
clause, not a performance note: violating it produces wrong answers,
not slow ones.

## TypeScript API

Package `aontu` (canonical). Entry point `dist/aontu.js`, types
`dist/aontu.d.ts`. Requires Node ≥ 22.

```ts
import { Aontu } from 'aontu'          // named
import Aontu from 'aontu'              // default (same class)
```

### class `Aontu`

```ts
new Aontu(opts?: AontuOptions)
```

Constructs an instance and its parser (`Lang`). One instance can process
many sources.

| Method | Signature | Returns | Notes |
|--------|-----------|---------|-------|
| `parse`    | `parse(src: string, opts?, ctx?)` | `Val \| undefined` | Parses to an unresolved AST. Does not unify. |
| `unify`    | `unify(src: string \| Val, opts?, ctx?)` | `Val` | Parses (if given a string) and runs the fixpoint to a fully unified `Val`. |
| `generate` | `generate(src: string, opts?, ctx?)` | `any` | Parse → unify → emit a native JS value. **Throws `AontuError`** on conflict or an unresolved result. Serialise the result with [`exactJSON`](#exact-numbers-and-exactjson), not `JSON.stringify`. |
| `ctx`      | `ctx(cfg?: AontuContextConfig)` | `AontuContext` | Creates a context (for variables, error collection, a custom `fs`, etc.). |

```ts
const aontu = new Aontu()
aontu.parse('a:number')                  // Val (AST)
aontu.unify('a:1 a:number').canon        // '{"a":1}'
aontu.generate('a:1 b:$.a')              // { a: 1, b: 1 }
aontu.generate('a:1 a:2')                // throws AontuError: Cannot unify value: 2 with value: 1
```

`unify` accepts a previously parsed `Val`, so a caller that wants the
AST first need not re-parse: `const p = aontu.parse(src);
aontu.unify(p)`. But note that the parsed tree is **single-use** — see
[Evaluation consumes the tree](#evaluation-consumes-the-tree) —
so each parse feeds at most one unify/generate.

### `AontuOptions`

Passed to the constructor, to any method's `opts` argument, or merged
into a context.

| Option     | Type        | Purpose |
|------------|-------------|---------|
| `src`      | `string`    | Source text (usually passed positionally instead). |
| `path`     | `string`    | Path of the entry file (for `@"…"` relative resolution and error sites). |
| `base`     | `string`    | Base path for the resolver. |
| `resolver` | `Resolver`  | Custom source resolver for `@"…"` loading. |
| `fs`       | `typeof fs` | Filesystem implementation — e.g. a `memfs` volume for tests. |
| `collect`  | `boolean`   | Collect errors onto `result.err` instead of throwing. |
| `err`      | `any[]`     | Pre-existing array to accumulate errors into (implies `collect`). |
| `explain`  | `any[]`     | Capture a structured trace of the unification. |
| `debug` / `trace` | `boolean` | Enable parser debug / parse tracing. |
| `deps`     | `object`    | Dependency record populated by `@"…"` loads. |
| `log`      | `number`    | Parser log verbosity. |

`@"…"` resolution tries an **in-memory** resolver, then the
**filesystem**, then **package** resolution, in that order. The chain
is unconfined by default — a relative include follows any path the
process can read — so **treat opening an untrusted source as running
it**. Confinement is the **`trust` option** (G5, [the trust
contract](trust.md)), in both implementations:

```ts
const aontu = new Aontu({
  trust: {
    // include capability, one of:
    //   'none'              — @"…" always denied
    //   { mem: {...} }      — a virtual file set only
    //   { root: '/models' } — real files, realpath-confined below root;
    //                         no package resolution
    //   'system'            — the full chain (today's default)
    include: { root: '/models' },
    budget: { passes: 9, depth: 1000 },  // integer engine-event counts
  },
})
```

Go mirrors it as `Aontu.Trust` (`TrustOptions`: `IncludeNone`,
`IncludeMem`, `IncludeRoot`, `Budget`). A denied resolution is the
parse-stage `include_denied` error, pinned by
`test/spec/include-trust.tsv` in both runners. Confinement is
realpath-then-prefix-check on the resolved file, so a symlink inside
the root pointing outside it is denied. Note `fs` is *not* a sandbox —
it supplies source text for parsing and error context, and the file
and package legs read through their own channels; the trust profile is
the confinement surface.

**The include manifest.** After a parse, the resolved include closure
is observable as sorted, deduplicated `{ path, capability }` entries —
`result.deps` in TypeScript, `Aontu.IncludeDeps` in Go — hermeticity's
"file set" as data (capability is `mem`, `file` or `pkg`). Content
hashing and pinning belong to the distribution layer (G6).

**The bundled vocabulary.** `@"std/system"` (G4, [the system
vocabulary](reference-language.md#the-stdsystem-vocabulary)) is served
from the engine rather than from disk, so it needs neither the
filesystem nor package resolution and resolves under every include
capability except `'none'`. It appears in the manifest with capability
`std`. A host that wants a different vocabulary supplies its own source
under its own name; the bundled one is engine-owned.

**Relation checks.** `relationCheck(src)` in TypeScript and
`Aontu.RelationCheck(src)` in Go run the
[declared-relation](reference-language.md#declared-relations) checks —
acyclicity and inverse consistency — over the derived edge set, and
return `{verdict, findings}` with `verdict` one of `pass`, `fail` or
`error`. `aontu relations <file>` is the same report from the command
line (`--format json` for the machine-readable form). Findings are
sorted by the position of the offending edge, so the report diffs
cleanly.

**The derived graph.** After a unification, an evaluated document's
identity structure is observable too (G4):
`result.graph` in TypeScript — also available as the pure function
`graphOf(val)` — and `Aontu.Graph` in Go. It has two parts:

```ts
{
  entities: [ { id: 'svc/auth', paths: ['$.services.auth'] }, … ],
  edges:    [ { from: 'svc/billing', key: 'dependsOn',
                to: 'svc/auth', at: '$.services.billing.dependsOn.0' }, … ],
}
```

- **`entities`** is the entity index: each `id(name)` and every tree
  path that holds it. More than one path is the normal case — the
  merge puts an entity's value at every position that declared it —
  and it is why moving an entity to a new path breaks `$.path`
  references but no entity address.
- **`edges`** is the edge set: one entry per checked
  [link](reference-language.md#entity-references-refert). `from` is the
  entity the link sits inside (empty outside every entity), `key` is
  the nearest map key below that entity — so a link inside a list is
  an edge under its relation, not under its index — and `at` is where
  the link is written.

Both are **deterministic**: ids, paths and edges are sorted by
construction, and both runners re-derive the graph on a fresh engine
and require the same bytes (`test/spec/graph.tsv`). Impact analysis,
reachability and entity slices are traversals over these; their
exposure as verbs and projections is the machine-access layer's.

### `AontuContext`

A context threads variables, error state, and resolver configuration
through a run. Create one with `aontu.ctx()`.

- `ctx.vars: Record<string, Val>` — values for `$name` variables.
- `ctx.err: any[]` — collected errors (when `collect`).
- `ctx.find(path: string[]): Val | undefined` — look a value up by path.

Pass the context as the third argument:
`aontu.generate(src, undefined, ctx)`.

### `Val` (TypeScript)

The unified value. Useful members:

| Member | Description |
|--------|-------------|
| `canon: string` | Reparseable canonical form (see [language reference](reference-language.md#canonical-form)). |
| `gen(ctx): any` | Emit the native value (used by `generate`). |
| `err: any[]`    | Errors attached to this value (`NilVal`s). |
| `isVal: boolean` and `isMap`/`isList`/`isScalar`/`isNil`/… | Type discriminators. |
| `path: string[]` | Path from the root. |

`Val` is an abstract base; concrete subclasses (`MapVal`, `ListVal`,
`IntegerVal`, `NumberVal`, `BigIntegerVal`, `BigDecimalVal`,
`StringVal`, `BooleanVal`, `NullVal`, `ScalarKindVal`, `ConjunctVal`,
`DisjunctVal`, `PrefVal`, `RefVal`, `VarVal`, the `*FuncVal`s, …) are
exported from their modules under `dist/val/`.

The four numeric subclasses are the four numeric leaves:
`IntegerVal` is `integer`, `NumberVal` is `float` (the class name is
historical — `number` used to name that leaf and is now the pure
supertype), and `BigIntegerVal` / `BigDecimalVal` are the exact leaves
`biginteger` / `bigdecimal`.

### Exact numbers and `exactJSON`

`generate()` returns **native** values, and a document that opts into
the `0d` exact literals returns two of them that `JSON.stringify` cannot
write:

| Aontu kind   | Source     | `generate()` returns |
|--------------|------------|----------------------|
| `integer`    | `x:5`      | `number`, or `bigint` past `Number.MAX_SAFE_INTEGER` (see below) |
| `float`      | `x:1.5`    | `number`             |
| `biginteger` | `x:0d5`    | `bigint`             |
| `bigdecimal` | `x:0d0.1`  | `Decimal`            |

**Why an `integer` can be a `bigint`.** The `integer` leaf is an int64
window, and JavaScript stores it in a double. Below
`Number.MAX_SAFE_INTEGER` that is faithful: the integers are contiguous
there, so the `number` renders its own exact digits. Above it they are
not — `JSON.stringify(2**60)` is `1152921504606847000`, a *different*
integer that merely rounds to the same double — so `generate()` returns
a `bigint`, which `exactJSON` writes exactly. A `float` stays a `number`
at any magnitude, because there its shortest form *is* the right answer
(`1e21` serialises as `1e+21`, in this port and in Go).

```ts
typeof gen('x:9007199254740991').x     // 'number'  (2^53-1)
typeof gen('x:9007199254740992').x     // 'bigint'  (2^53)
typeof gen('x:1e21').x                 // 'number'  (float kind)
exactJSON(gen('x:1152921504606846976'))  // '{"x":1152921504606846976}'
```

An integer-kind `bigint` is still not a `biginteger`: the leaves stay
disjoint and only canon tells them apart (`1152921504606846976` versus
`0d1152921504606846976`). Go needs none of this — its `integer` leaf is
an `int64`, exact across the whole window, so `Generate` returns an
`int64` at every magnitude. The serialised JSON is identical in both
ports.

A `0d`-free document generates exactly what it always did — the exact
leaves are reached only by writing `0d` (see the
[language reference](reference-language.md#the-four-numeric-leaves)).
Both leaves survive nesting: `generate('x:{y:0d7} z:[0d1,0d0.5]')` puts
a `bigint` at `x.y` and a `Decimal` at `z[1]`. Note that an *integral*
bigdecimal is still a `Decimal` and never a `bigint`: `0d1e3` is a
bigdecimal by source form, and the leaves are disjoint.

`JSON.stringify` **throws** on a `bigint` (`TypeError: Do not know how
to serialize a BigInt`), and a `replacer` cannot rescue it — a replacer
may only return another *value*, and anything it returns that is not
already a JSON primitive gets quoted, so the exact digits could come
back only as a JSON *string*, which is a different document. JSON itself
was never the obstacle: a JSON number is arbitrary-precision decimal
text, and `{"x":9007199254740993}` is a legal document. Only
JavaScript's serialiser stands in the way, so the package ships its own.

```ts
exactJSON(value: any, indent?: number | string): string
```

Serialises a `generate()` result as JSON text, preserving exact numbers.
**Use it instead of `JSON.stringify` on generated output.**

```ts
import { Aontu, exactJSON } from 'aontu'

const out = new Aontu().generate('x:0d9007199254740993')
typeof out.x        // 'bigint'
exactJSON(out)      // '{"x":9007199254740993}'
exactJSON(out, 2)   // '{\n  "x": 9007199254740993\n}'
JSON.stringify(out) // TypeError: Do not know how to serialize a BigInt
```

- **`indent`** has `JSON.stringify`'s `space` semantics: a number of
  spaces (clamped to `0`–`10`) or a literal string (truncated to 10
  characters). Omitted or `0` gives **compact** output — no spaces, no
  newlines.
- A `bigint` writes its digits. A `Decimal` writes its plain digit form
  (`1000.0`, `0.1`, `-1.5`) — no `0d` marker, since that belongs to
  canon and is not JSON, but an integral bigdecimal keeps its `.0` so
  the JSON still shows a decimal.
- Object keys are emitted in **lexicographic order** (by UTF-16 code
  unit), matching Go's `encoding/json`, which sorts map keys. This is
  done at emit time and not by `generate()`, because a JavaScript object
  *cannot* hold the required order: ECMAScript lists canonical
  array-index keys first, ascending numerically, so an object can never
  present `"10"` before `"9"`. It applies to any object passed in, not
  only `generate()` output, since this is a general emitter — and it is
  the one place the result deliberately differs from `JSON.stringify`.
- Ordinary values are otherwise written exactly as `JSON.stringify`
  writes them: the same string escaping, `null` for `NaN` and
  `Infinity`, and `undefined`/function/symbol dropped from an object but
  written as `null` inside an array. An object with a `toJSON` method is
  asked for its replacement (`Decimal` is handled as a number before
  that check).
- U+2028 and U+2029 are escaped, which `JSON.stringify` does not do —
  that is the one place JavaScript and Go disagree by default, and
  escaping is both legal JSON and safe to embed in JavaScript source.
- It always returns a string: a top-level `undefined` becomes `null`.
- It throws `AontuError` if the value contains a reference cycle. A
  *shared* subtree — which unification produces routinely — is fine;
  only a true cycle is refused, as in `JSON.stringify`.

The output is byte-identical to the Go port's `encoding/json` with
`SetEscapeHTML(false)` for the same document; that equivalence is what
the shared suite's [`gens` mode](shared-spec.md#modes) pins. The `aontu`
CLI calls this same export with `indent` of `2`, so there is exactly one
implementation for the pretty and compact forms to stay in step with.

`Decimal` is exported from `aontu` alongside it — the type a bigdecimal
generates as. It is an immutable exact base-10 value (`unscaled: bigint`
plus `scale: number`) in normal form, so numerically equal decimals have
equal fields:

| Member | Description |
|--------|-------------|
| `new Decimal(unscaled: bigint, scale: number)` | Construct and normalise. |
| `Decimal.fromString(src: string)` | Parse `[+-]?digits[.digits][e[+-]digits]`, with or without a `0d` marker. |
| `toString(): string` | Plain digit form — what `exactJSON` writes. |
| `canon(): string` | Canonical form, with the `0d` marker. |
| `equals` / `compare` / `add` / `negate` / `ceil` / `floor` / `isZero` | Exact operations — no rounding anywhere. |

`Decimal.fromString` refuses input beyond the exactness budget (at most
4096 coefficient digits and an absolute scale of at most 4096 — see the
[language reference](reference-language.md#the-exactness-budget)), the
same refusal a literal gets.

### Variables

`$name` references are filled from `ctx.vars`. Build value objects with
the exported `Val` constructors:

```ts
import { Aontu } from 'aontu'
import { IntegerVal } from 'aontu/dist/val/IntegerVal'
import { StringVal }  from 'aontu/dist/val/StringVal'
import { MapVal }     from 'aontu/dist/val/MapVal'

const aontu = new Aontu()
const ctx = aontu.ctx()
ctx.vars.foo = new IntegerVal({ peg: 11 })
ctx.vars.bar = new StringVal({ peg: 'hello' })
ctx.vars.obj = new MapVal({ peg: { x: new IntegerVal({ peg: 1 }) } })

aontu.generate('a:$foo b:$bar c:$obj', undefined, ctx)
// { a: 11, b: 'hello', c: { x: 1 } }
```

**Exact-input constructors.** The two exact leaves take a `bigint`, a
`Decimal`, or the digits as **text** — never a JS `number`, which
binary64 has already rounded before this library could inspect it, so an
exact value above 2^53 could not arrive that way intact:

```ts
import { Decimal }       from 'aontu'
import { BigIntegerVal } from 'aontu/dist/val/BigIntegerVal'
import { BigDecimalVal } from 'aontu/dist/val/BigDecimalVal'

new BigIntegerVal({ peg: 5n })                     // 0d5
new BigIntegerVal({ peg: '9007199254740993' })     // 0d9007199254740993
new BigIntegerVal({ peg: 5 })                      // throws: not-biginteger

new BigDecimalVal({ peg: new Decimal(15n, 1) })    // 0d1.5
new BigDecimalVal({ peg: '0.10' })                 // 0d0.1  (normalised)
new BigDecimalVal({ peg: 1.5 })                    // throws: not-bigdecimal
```

Both reject malformed text (`'5.5'` is not a biginteger).
`BigDecimalVal` additionally refuses input over the exactness budget,
exactly as a `0d` literal does; a biginteger has no bound and is as wide
as its digits. Because the constructor picks the leaf where a literal's
source text would, `new BigDecimalVal({ peg: '5' })` is a *bigdecimal*
and canons `0d5.0`.

### Exports

From `aontu`:

```ts
Aontu          // class (also default export)
AontuOptions   // type
AontuContext   // class
AontuError     // error class (thrown by generate)
Val            // base value type
Lang           // the parser
VERSION        // the package version string
runparse, util // parsing helpers
formatExplain  // pretty-print an `explain` trace
exactJSON      // exact JSON emitter — use instead of JSON.stringify
Decimal        // the type a bigdecimal generates as
vet            // the validation verb (see `aontu vet` above)
sarifReport    // a vet report as SARIF 2.1.0
subsume        // the subsumption query (docs/reference-language.md,
               // "Subsumption"): subsume(general, specific, {profile?, at?})
               // -> {verdict, findings}; Go: aontu.Subsume
trimCheck      // the redundancy reporter (see `aontu trim` above):
               // trimCheck(src, {path?}) -> {verdict, redundant};
               // Go: aontu.New().TrimCheck(src)
hcanon         // the HASH FORM of an evaluated Val (see `aontu hash`
               // above): canon plus the close()/type()/hide()
               // wrappers; Go: aontu.Hcanon
canonHash      // the canon-hash pin over that form,
               // "aon1-"+base64url(SHA-256(...)); Go: aontu.CanonHash
get            // the query surface (see `aontu get` above):
               // get(src, path, {view?, depth?, path?, trust?}) ->
               // {ok, out, findings}; Go: aontu.New().Get(src, path, opts)
why            // provenance (see `aontu why` above):
               // why(src, path, {path?, trust?}) -> {ok, record, findings},
               // record = {path, value, conjuncts}; Go: (*Aontu).Why
patch          // the overlay patch (see `aontu set` above):
               // patch(entry, overlay, ["$.a.b=1"], opts?) ->
               // {overlay, appended, verdict, findings}; Go: aontu.Patch
diff           // what changed at which paths between two documents:
               // diff(left, right, {at?, trust?}) -> {changes, same, findings};
               // Go: aontu.Diff
agentsMd       // the generated AGENTS.md stanza (see `aontu agentsmd`
               // above): agentsMd(src, {name?}) -> {stanza, ok};
               // Go: (*Aontu).AgentsMd
```

#### Evaluating a document you did not write

`vet`, `get`, `why` and `diff` each take a **`trust`** option, the same
profile [`AontuOptions.trust`](#aontuoptions) takes, and it means the
same thing: what the document being evaluated may reach.

These four verbs exist to be pointed at source from somewhere else — a
candidate an agent emitted, a live system dump, the other side of a
diff — and without a profile they resolve `@"…"` through the default
chain, which reaches the filesystem and `require()`s a `.js` path.
**Opening an untrusted source is running it**, so pass a profile
whenever the source is not yours:

```ts
vet(schemaSrc, candidateSrc, { trust: { include: 'none' } })
```

The [MCP server](#the-mcp-server) supplies `{ include: 'none' }` to
every tool from a single place, rather than each tool applying it for
itself: a tool that must remember to confine itself is one that
eventually forgets, and the forgetting is silent.

---

## Go API

Module `github.com/rjrodger/aontu/go`, package `aontu`.

```go
import aontu "github.com/rjrodger/aontu/go"
```

### type `Aontu`

```go
func New() *Aontu                 // relative @"file" loads resolve from the cwd
func NewWithBase(base string) *Aontu  // …resolve from base (a directory)
```

Use `NewWithBase` when a source's relative `@"file"` loads should resolve
from somewhere other than the process working directory — typically the
directory of an entry file:

```go
abs, _ := filepath.Abs(file)
a := aontu.NewWithBase(filepath.Dir(abs))
```

Absolute `@"file"` paths are unaffected by the base. (The `aontu` CLI
does exactly this for a file argument.)

| Method | Signature | Notes |
|--------|-----------|-------|
| `Parse`        | `Parse(src string) (Val, error)` | AST, not unified. |
| `Unify`        | `Unify(src string) (Val, error)` | Parse + fixpoint unify. |
| `UnifyVars`    | `UnifyVars(src string, vars map[string]Val) (Val, error)` | `Unify` with `$name` variables. |
| `Generate`     | `Generate(src string) (any, error)` | Parse → unify → native Go value. |
| `GenerateVars` | `GenerateVars(src string, vars map[string]Val) (any, error)` | `Generate` with variables. |

```go
a := aontu.New()
v, err := a.Unify("a:1 a:number")   // v.Canon() == `{"a":1}`
out, err := a.Generate("a:1 b:$.a") // out == map[string]any{"a":1,"b":1}
```

All methods return an `error` (never panic for ordinary conflicts);
`Generate` returns `(nil, err)` on any unresolved or conflicting value.
Generated output uses Go's natural types (`map[string]any`, `[]any`,
`int64`/`float64`, `string`, `bool`, `nil`), plus `*big.Int` and
`*Decimal` for the exact leaves — see
[Exact numbers in Go](#exact-numbers-in-go).

### `Val` (Go)

The lattice element interface:

```go
type Val interface {
    Canon() string              // canonical source-like form
    Gen(ctx *Ctx) (any, error)  // native value (error if not generable)
    Unify(peer Val, ctx *Ctx) Val
    Dc() int                    // done-counter; DONE (-1) == fully resolved
    Nil() bool                  // true for a unification failure (bottom)
    // …plus unexported lattice-ordering methods
}
```

Concrete exported types: `TopVal`, `NilVal`, `ScalarVal`,
`ScalarKindVal`, `MapVal`, `ListVal`, `ConjunctVal`, `DisjunctVal`,
`PrefVal`, `RefVal`, `VarVal`, `FuncVal`, `PlusOpVal`. Every scalar leaf
— including the two exact ones — is a `ScalarVal`; it holds its kind
internally, so from outside the package a leaf is told apart by the
concrete type `Gen` returns, or by `Canon`.

### Exact numbers in Go

`Generate` returns Go's natural types, and the two exact leaves come out
as the two types that can hold them exactly:

| Aontu kind   | Source     | `Generate` returns |
|--------------|------------|--------------------|
| `integer`    | `x:5`      | `int64`            |
| `float`      | `x:1.5`    | `float64`          |
| `biginteger` | `x:0d5`    | `*big.Int`         |
| `bigdecimal` | `x:0d0.1`  | `*Decimal`         |

A `0d`-free document generates exactly what it always did. An
*integral* bigdecimal is still a `*Decimal` and never a `*big.Int`:
`0d1e3` is a bigdecimal by source form, and the leaves are disjoint.

Both types implement `json.Marshaler` and emit **exact digits as a raw
JSON number**, so `encoding/json` needs no help:

```go
out, _ := aontu.New().Generate("a:0d9007199254740993 b:0d1e3 c:0d0.1")
b, _ := json.Marshal(out)
// {"a":9007199254740993,"b":1000.0,"c":0.1}
```

The pointer is load-bearing. A non-pointer `big.Int` inside an `any` has
no `MarshalJSON` in its method set, so `encoding/json` falls back to the
struct encoder and writes `{}` — an exact number silently replaced by an
empty object, which is the class of failure the exact leaves exist to
eliminate.

A generated `*big.Int` is a **copy**, so a caller may mutate it without
disturbing the value it came from.

`Decimal` is an exact base-10 value (coefficient plus scale), immutable
and always in normal form. Its exported surface is what a consumer of
generated output needs:

| Method | Description |
|--------|-------------|
| `String() string`             | Plain digit form (`1000.0`, `0.1`, `-1.5`). |
| `MarshalJSON() ([]byte, error)` | The same digits, as a raw JSON number. |
| `Canon() string`              | Canonical form, with the `0d` marker. |

`json.Marshal` output matches the TypeScript port's
[`exactJSON`](#exact-numbers-and-exactjson) byte for byte once HTML
escaping is off (`json.Encoder` + `SetEscapeHTML(false)`); that is the
equivalence the shared suite's [`gens` mode](shared-spec.md#modes) pins.

### `Ctx` and errors

- `Ctx` carries the root, variables, and collected errors through a run;
  you normally let `Unify`/`Generate` create it.
- `AontuError{ Msg string }` implements `error` and is returned (wrapped)
  for conflicts; its message matches the TypeScript phrasing
  (e.g. `Cannot unify value: 2 with value: 1`).

### Variables in Go

`UnifyVars`/`GenerateVars` accept a `map[string]Val`. Build the values
with the exported constructors:

| Constructor | Returns |
|-------------|---------|
| `NewString(s string) Val`        | string scalar |
| `NewInteger(i int64) Val`        | `integer` scalar — **refuses** an `int64` binary64 cannot carry exactly (see below) |
| `NewNumber(f float64) Val`       | `float` scalar (the name is kept for API compatibility; the kind it builds is `KindFloat`) |
| `NewBigInteger(n *big.Int) Val`  | `biginteger` scalar — the exact unbounded integer leaf |
| `NewBigDecimal(s string) (Val, error)` | `bigdecimal` scalar — the exact base-10 leaf |
| `NewBoolean(b bool) Val`         | boolean scalar |
| `NewNull() Val`                  | null scalar |
| `NewScalarKind(k Kind) Val`      | type constraint (`KindString`, `KindBoolean`, `KindNull`, and the numeric lattice `KindNumber` with its leaves `KindInteger`, `KindFloat`, `KindBigInteger`, `KindBigDecimal`) |
| `NewMap(map[string]Val) Val`     | map (keys inserted in sorted order) |
| `NewList([]Val) Val`             | list |

```go
vars := map[string]aontu.Val{
    "port": aontu.NewInteger(8080),
    "host": aontu.NewString("localhost"),
    "obj":  aontu.NewMap(map[string]aontu.Val{"x": aontu.NewInteger(1)}),
}
out, err := aontu.New().GenerateVars(
    "server: { host: $host, port: $port }", vars)
// out == map[string]any{"server": map[string]any{"host":"localhost","port":8080}}
```

Pass `nil` vars when a model uses no `$name` variables. An undefined
`$name` is a `Cannot resolve` error.

**`NewInteger` obeys the same storage contract as a literal.** An
`int64` that binary64 cannot carry exactly is refused rather than
stored, exactly as the equivalent literal is refused — otherwise the API
would be a hole straight through that rule, since Go's `integer` leaf is
an `int64` and the canonical TypeScript port's is a double. The refusal
is a **nil value**, not a panic and not a second return: aontu errors
are values, so it flows through unification and surfaces at `Generate`
with the same "not exactly representable" message and the same `0d`
escape a lossy literal gets.

The rule is **exactness, not magnitude**: every power of two in the
window is fine however large, `math.MinInt64` included.

```go
aontu.NewInteger(1152921504606846976)   // 2^60 — fine
aontu.NewInteger(math.MinInt64)         // -2^63, a power of two — fine
aontu.NewInteger(9007199254740993)      // 2^53+1 — nil value
aontu.NewInteger(math.MaxInt64)         // 2^63-1, rounds up — nil value
aontu.NewBigInteger(big.NewInt(9007199254740993))  // the exact escape
```

**Exact-input constructors.** `NewBigInteger` **copies** its argument
and never mutates the copy, so a caller may keep using (and mutating)
the `*big.Int` it passed in; a `nil` argument is zero.
`NewBigDecimal` takes a **string** — an optional sign, an optional `0d`
marker, digits, an optional fraction and an optional exponent, and no
`_` separators (those are literal syntax, not part of a number's text).
A `float64` is deliberately not accepted: it has already rounded before
the library can inspect it.

```go
n, _ := new(big.Int).SetString("123456789012345678901234567890", 10)
aontu.NewBigInteger(n)          // 0d123456789012345678901234567890
aontu.NewBigDecimal("0.10")     // 0d0.1   (normalised)
aontu.NewBigDecimal("0d1e3")    // 0d1000.0
aontu.NewBigDecimal("1_000")    // error: Not an exact decimal
```

`NewBigDecimal` returns an error for malformed text and for input over
the exactness budget (at most 4096 coefficient digits and an absolute
scale of at most 4096 — see the
[language reference](reference-language.md#the-exactness-budget)), the
same refusal a literal gets. A biginteger has no bound and is as wide as
its digits. Because the constructor picks the leaf where a literal's
source text would, `NewBigDecimal("5")` is a *bigdecimal* and canons
`0d5.0`.

---

## Behavioural parity

Both implementations are validated against the same
[`test/spec/*.tsv`](../test/spec/) cases and agree on: scalars and scalar
kinds — including the numeric tower's four leaves (`integer`, `float`,
`biginteger`, `bigdecimal`) under the pure supertype `number`, their
`0d` exact literals, and exact arithmetic — maps (nesting, merge,
spreads `&:`, optional keys, `close`/`open`), lists (incl. spreads),
conjunction `&`, disjunction `|`, preference `*`, references (`$.a.b`,
`.x.a`, `.$KEY`), `$name` variables, the `+` operator, all twelve
functions, `type`/`hide` marks, and `@"…"` source loading — plus
`parse` / `unify` / `generate` and the canonical form.

Generated **bytes** are in parity too: `exactJSON` in TypeScript and
`encoding/json` in Go produce the same JSON text for the same document,
which the shared suite's byte-exact `gens` rows pin. What byte equality
cannot see — a `bigint` where a `number` was due, since both serialise
as `5` — is pinned by per-port API tests instead.

**Validation reports** are in parity as well: `aontu vet` produces the
same report from both commands, text and JSON, with the same exit code —
pinned by the shared suite's [`vet.tsv`](../test/spec/vet.tsv) rows for
everything but each finding's `message`, which is prose. Two things
still differ by construction: the `aontu.version` field, because the
npm and Go module version series are independent, and the wording of a
"cannot read <file>" failure, which is the host's.

The shared parser stack is identical: TypeScript uses `@tabnas/jsonic` +
`@tabnas/{expr,path,multisource,directive,debug}`; Go uses the ports
`github.com/tabnas/{jsonic,expr,path,multisource,directive}/go`. See
the [Explanation](explanation.md#two-implementations-one-behaviour) for
how parity is maintained, and [Test coverage](test-coverage.md) for what
each suite exercises.

# aontu and CUE, feature by feature

**Status:** Survey, 2026-11-20. Compares aontu at `main` (`967c5f3`,
both ports; the latest release is 0.76.3) with CUE v0.17.1, the latest
release, and v0.18.0-rc.4, the release candidate of 2026-11-11. Every
difference in meaning below was checked by running both aontu engines
and both CUE binaries on the same input: the probes and their answers
are in [The probes](#the-probes), and the two aontu engines agree on
every one. Facts about CUE that no probe shows come from cuelang.org and
from CUE's published module sources, listed under [Sources](#sources).
**Basis:** [CONFIG-LANGUAGES.0.md](CONFIG-LANGUAGES.0.md), the survey of
2026-10-01, which compares nine languages more briefly. This note goes
deeper on CUE alone and corrects that survey where either language has
moved since.
**Plan:** [LANG-REFINEMENT-PLAN.0.md](LANG-REFINEMENT-PLAN.0.md) proposes
the tasks that answer this note, starting with what comprehensions do.

## In short

- **The core is shared.** Both languages evaluate by unification on one
  lattice, with disjunctions, `*` defaults, closed structures,
  constraints that meet as values, recursion over finite data, and no
  user-defined functions in a stable release
  ([The shared core](#the-shared-core)).
- **The surface is not.** A CUE file is not an aontu file. A bare word
  is a string in aontu and a reference in CUE, `#` starts a comment in
  aontu and a definition in CUE, `'…'` is text in aontu and bytes in
  CUE, and aontu names its constraints (`min(1)`) where CUE spells them
  as operators (`>=1`). On the same text, the two also answer
  differently about the empty string, numbers, integer division,
  optional keys, list literals, defaults, cycles and output order
  ([Where the same text means different things](#where-the-same-text-means-different-things)).
- **CUE computes more and converts more.** It has comprehensions,
  interpolation, arithmetic and comparison operators, computed keys, a
  standard library of 33 packages, and YAML, TOML, JSONL, protobuf,
  OpenAPI and Go types in and out. It also has a registry that serves,
  a language version per module, and a language server with references,
  rename and code actions.
- **aontu checks more.** It has verdicts with 204 stable error codes,
  `subsume` and `breaking` with three answers and a witness, provenance
  through `model why`, hashes of meaning, checked links with
  `relations` and `reaches`, ten kinds of view, formats as grammars,
  generation through a component tree, a JSON Schema import that keeps
  annotations and an export that reports its losses, an MCP server, and
  two engines held to one Lean definition.
- **v0.18 moves CUE toward aontu in three places and away in one.** A
  field declared beside an embedded closed schema is now refused, as
  aontu refuses it (probe x8); integer arithmetic past 34 digits is
  exact, where v0.17.1 rounded it without a word (n2); and the
  `openlists` preview makes list literals open, as aontu's are (x4).
  The `functions` preview adds user-defined functions (x3), which aontu
  rules out to keep evaluation terminating.
- **A comprehension computes nothing aontu can't, bar one loop.** 38
  probes pair a comprehension with aontu's nearest spelling. Mapping,
  filtering, flattening and conditions are direct. Keyed results,
  lookups, pairings and positions take constructions that count levels,
  unwrap through an aggregate and leave helper fields behind. Only a
  loop whose length comes from a number alone has no spelling
  ([What comprehensions do that the built-ins do not](#what-comprehensions-do-that-the-built-ins-do-not)).
- **Three aontu gaps surfaced that no decision explains**, each now an
  issue: `aontu trim` examines nothing below a key stated twice
  ([#860](https://github.com/aontu-lang/aontu/issues/860)), a field
  can't be projected with its keys in one call
  ([#861](https://github.com/aontu-lang/aontu/issues/861)), and the
  command line can't bind `$name`
  ([#862](https://github.com/aontu-lang/aontu/issues/862)). See
  [Found along the way](#found-along-the-way).

## What is current in CUE

**Releases.** v0.17.1, of 2026-07-16, is the latest release. v0.18.0 is
at its fourth release candidate, of 2026-11-11, after three alphas and
three earlier candidates since August. A minor release comes every
three to four months, and CUE is still at 0.x.

**A language version gates the language.** A module declares
`language: version` in `cue.mod/module.cue`, and a module that declares
an older version is evaluated with that version's semantics. The
version gates the experiments, the `error()` builtin and some parser
rules. A file outside any module takes the version of the binary that
reads it, which is why probe g12, CUE's old alias `[N=_]`, passes under
v0.17.1 and is refused under v0.18.0-rc.4. v0.18 adds a
`--language-version` flag and a `@version()` file attribute for such
files, and makes `cue mod upgrade`, which rewrites a module for a newer
version, visible.

**What v0.18 makes standard**, at language version v0.18.0:

- **Postfix aliases and `self`.** `label~X` and `[string]~(K,V)` replace
  the `X=` forms, which are refused, and `self` names the enclosing
  struct or list (the `aliasv2` experiment; probes g12, x6 and x7).
- **The spread and stricter embedding.** `x...` takes a closed value's
  fields without its closedness, and embedding becomes unification, so
  a field declared beside an embedded closed schema is refused (the
  `explicitopen` experiment; x5 and x8).
- **Exact integer arithmetic.** v0.17.1 rounds an integer sum or
  product past 34 significant digits without an error; v0.18.0-rc.4
  computes it exactly (found by probe n2).
- **Smaller changes:** `close()` takes lists and other values,
  multi-line strings accept a backslash before a newline, and `==` is a
  unary constraint.
- **Tooling:** a new formatter behind `cue fmt`, a new YAML codec, an
  experimental INI encoding, JSON Schema export to Draft 7 and to the
  OpenAPI 3.0 dialect, and a visible `cue lsp` with a daemon mode.

**What v0.18 previews**, each behind `@experiment(…)`:

- **`functions`**: user-defined functions, with named, defaulted and
  labelled arguments and partial application (x3).
- **`openlists`**: list literals open outside definitions, with `#[…]`
  for a closed one (x4).
- **`try`**, since v0.16: a comprehension clause that yields nothing
  when a reference marked `?` is missing, with `else` and `otherwise`
  clauses (x1, x2).
- **`shortcircuit`**, since v0.17, and **`openapiv2`** for whole OpenAPI
  documents.

**What arrived during 2025 and 2026, before v0.18:**

- evalv3, the only evaluator since v0.15;
- `==` over structs and lists (`structcmp`, stable in v0.15; x9);
- validators that stay validators;
- the `error()` builtin (v0.14; c14), with `matchN` and `matchIf` since
  v0.11 (c11 to c13);
- JSON Schema export (v0.15) and file embedding with `@embed` (stable in
  v0.14);
- output in source order (`toposort`, stable in v0.14; o1);
- multi-line lists without commas, and local module replaces (both
  v0.17).

The standard library has the same 33 packages and names in v0.17.1 and
v0.18.0-rc.4. v0.18 adds a signature file to each package, which the
language server reads.

## The shared core

Both languages evaluate by unification. Types, constraints, defaults
and data are all values on one lattice, and `&` takes the greatest
lower bound of two of them, so it is commutative, associative and
idempotent and no statement wins by its position. The probes agree on
all of this:

- A kind narrows to a value and two different values conflict (s1 to
  s4, m19, m20), and an integer and a float of the same magnitude
  conflict in both (s3).
- A disjunction keeps its alternatives until a value selects one, a
  `*` default answers when nothing does, and an enum with a default
  refuses an outsider (d2, d3, d4, u1). A default met by a peer that
  still admits it survives in both (d8).
- A closed structure refuses a new key at any depth, also where the
  key comes from another statement than the one that embeds the closed
  schema, and a closed structure can be reopened (m5, m6, m8, m21).
  Closed alternatives of a union refuse an extra key (u2).
- A template can constrain every key of a map, or only the keys a
  pattern matches, and can read the key it is applied at (m9 to m11,
  g12).
- A value can be kept out of the output and still be read (m12 to m14).
- Bounds meet to one bound, and an empty range is refused when it is
  written, not when data arrives (c1 to c3).
- Patterns, inequality, lengths, uniqueness, multiples, formats,
  exactly-n-of and if-then constraints exist in both and refuse the same
  data (c4 to c18).
- Recursion is allowed over finite data and refused where it would
  build an infinite structure (r5, r6). Neither language has
  user-defined functions in a stable release; CUE's v0.18 previews them
  (x3).
- Missing input can be tolerated rather than refused: aontu's
  `maybe($.a.y)` and CUE's `try` with `a.y?` both yield nothing, and a
  fallback fills the gap (x1). A two-way choice is `match` in aontu and
  `if … else` in CUE (x2).
- Validation of a data file against a schema reports every failure
  with the data's site and the schema's site, and JSON Schema 2020-12
  can be exported by both and imported by both
  ([Interchange](#interchange)).

## Where the same text means different things

These are the probes whose answers differ. Each is a place where a CUE
user's expectation fails in aontu, or the reverse.

| Area | aontu | CUE | Probes |
|---|---|---|---|
| The empty string | `string` is a non-empty string, and `string & empty()` admits `""` | `string` admits `""` | s5 |
| Integer precision | a plain number is a binary64 double. An integer literal the double would round is refused (`lossy_integer_literal`), and so is integer arithmetic whose exact result a double cannot hold (`inexact_integer_sum`). `0d` literals and their arithmetic are exact at any size | integer literals are exact at any size. In v0.17.1, `+`, `-` and `*` round an integer result past 34 significant digits without an error: `12345678901234567890123456789012345678 + 1` is `1.234567890123456789012345678901235E+37`. v0.18.0-rc.4 computes it exactly | s6, s7, s20, n1, n2 |
| Decimal arithmetic | `0.1 + 0.2` is `0.30000000000000004`; `0d0.1 + 0d0.2` is `0.3` | `0.1 + 0.2` is `0.3` | s8, s9 |
| The kind of `1e3` | an integer: an exponent without a `.` keeps integer kind | a float, so `1e3 & int` conflicts | s22 |
| A float that is whole | `1.0 & number` is written `1` | written `1.0` | s21 |
| `+` with a string and a number | concatenates as text: `"port:" + 80` is `"port:80"`, `"n=" + 1.5 + true` is `"n=1.5true"` | refused; text is built by interpolation | s15, g5 |
| `+` with two lists | joins them: `[1, 2] + [3]` is `[1, 2, 3]` | refused since v0.11, which points to `list.Concat` | s24 |
| `div` and `mod` of negative numbers | `div` truncates toward zero and `mod` takes the divisor's sign: `div(-7, 2)` is `-3`, `mod(7, -2)` is `-1` | both Euclidean: `div(-7, 2)` is `-4`, `mod(7, -2)` is `1`; `quo` and `rem` truncate | s10, s23 |
| Equality | no equality test. `match` and `filter` ask whether a value already satisfies a pattern, so `{x: 1, y: 2}` matches `{x: 1}` | `==` compares any two values, so `{x: 1, y: 2} == {x: 1}` is `false` | x9 |
| A bare word | a string: `a: Mercury` | a reference, refused when nothing is named so | s18 |
| `'…'` | a string | bytes, written as base64 in JSON | s19 |
| `1Ki` | the bare string `"1Ki"` | the number 1024 | s17 |
| A default with no alternatives | `a: *1` is a default that any integer overrides: `*x` is `x \| super(x)` | refused: `*` is allowed only in a disjunction | d1, d10 |
| Two defaults that disagree | refused, `pref_rank_clash` | an incomplete value, refused at export | d5 |
| Ranked defaults | `**` outranks `*`, and `*1 \| **2` is `1` | no ranks | d6 |
| An optional key with a value | `x?: 1` and `x?: *1 \| integer` are written to the output | an optional field is never written | m1, d11 |
| A key that data must supply | every key that is not optional must generate, so `x: integer` with no data is refused, `mapval_no_gen`. A schema that writes `x: 1` supplies the value itself | `x!: int` is refused until a regular field supplies `x`, and so is `x!: 1`: the marker requires the data to state even a value the schema fixes | m4, m22, m23 |
| A list literal | open: `[integer, integer] & [1, 2, 3]` is `[1, 2, 3]`, and `close()` fixes the length | closed: the length is fixed, and `[...T]` opens it. The v0.18 `openlists` preview opens literals outside definitions, as aontu's are | m15, m16, m17, x4 |
| A field beside an embedded closed schema | refused, `closed`: a meet with a closed map admits only its keys | allowed in v0.17.1; refused from v0.18, where embedding is unification | x8 |
| A cycle that a value resolves | `a: $.b`, `b: $.a`, `a: 1` is refused, `path_cycle` | `a: b`, `b: a`, `a: 1` resolves both to `1` | r3, r4 |
| Output order | keys are written sorted, and a map is walked in sorted-key order | keys keep their source order, and so does a `for` over a struct | o1, g10 |
| An alias in a pattern | `key()` reads the key | `[N=_]` reads the key in v0.17; v0.18 refuses the `=` alias at language version v0.18.0 and asks for `~N` | g12 |

Every aontu answer above is stated in its reference, so none is an
accident: [the empty string](../docs/reference-language.md#the-empty-string-empty),
[the four numeric leaves](../docs/reference-language.md#the-four-numeric-leaves)
and [lossy literals](../docs/reference-language.md#exact-or-refused-lossy-literals),
[`+`](../docs/reference-language.md#the--operator-and-grouping),
[arithmetic](../docs/reference-language.md#arithmetic-add-sub-mul-div-mod-rem),
[preferences](../docs/reference-language.md#preference--default-),
[optional keys](../docs/reference-language.md#optional-keys-),
[lists](../docs/reference-language.md#lists) and
[references](../docs/reference-language.md#references-and-paths). The
surface follows decisions on the record too: constraints are named
rather than spelled with operators
([ADR-008](../ADR.md#adr-008--constraints-are-named-not-spelled-with-operators)),
and comprehension keywords and interpolation are ruled out (see
[What this suggests for aontu](#what-this-suggests-for-aontu)).

## Feature by feature

Each table reads across: what aontu offers, then what CUE offers, as of
`main` and v0.18.0-rc.4. A probe ID points at the row of
[The probes](#the-probes) that shows it.

### Syntax and values

| Feature | aontu | CUE |
|---|---|---|
| Base syntax | relaxed JSON: bare words are strings, `#` comments, newlines or commas separate entries | identifiers are references, `//` comments, commas inserted at line ends |
| Strings | `"…"`, `'…'` and backtick strings, all text; a backtick string may span lines | `"…"`, multi-line `"""…"""`, raw `#"…"#`, interpolation `\(x)` |
| Bytes | none | `bytes`, written `'…'` (s19) |
| Numbers | binary64 `integer` and `float`, the kind decided by the source text; exact `biginteger` and `bigdecimal` written with `0d`; a lossy literal or an inexact integer result is refused (s6, n1); `--exact-numbers` reads every number by its value | `int` exact at any size, and in v0.18 its arithmetic too (n2); `float` as a decimal, with `+ - * /` in a 34-digit context; multipliers such as `1Ki` (s17) |
| Named numeric types | none built in; a library of named constraints is written with `type()` (m14) | predeclared `uint8` to `uint128`, `int8` to `int128`, `rune`, `float32`, `float64` |
| Other kinds | `boolean`, `null`, `map`, `list`, `path`, `constraint`, `any`, and `nil` as the failure | `bool`, `null`, `_` as top, `_\|_` as bottom |
| Arithmetic | `+` (numbers, text when either side is text, and two lists end to end), unary `-`, and `add`, `sub`, `mul`, `div`, `mod`, `rem` | `+ - * /`, `div mod quo rem`, and `*` to repeat a string |
| Comparison and logic | none as operators: `match` and `filter` test admission | `== != < <= > >=` and `&& \|\| !` |

### Composition

| Feature | aontu | CUE |
|---|---|---|
| Meet and join | `&` and `\|` | `&` and `\|` |
| Defaults | `*` on any value; a lone `*x` gives way to any value of its type (d1); `**` ranks above `*` (d6); `pref()` makes a value its own default | `*` on a disjunct only, refused elsewhere (d1) |
| Closedness | `close()` and `open()`, each reaching every depth (m6, m8) | definitions `#X` close recursively, `close()` one level, `...` opens one struct; v0.18's `x...` takes fields without closedness (x5) |
| Optional and required | `?`, dropped only when no value arrives (m1, d11) | `?`, never written to the output; `!`, which data must fill (m22) |
| Templates over keys | the spread `&:` applies to every member; `key()` names it (g12); a pattern is a guarded spread, `&: match(key(0), re(p), T, any)` (m10) | pattern constraints `[expr]: T`, with the key bound by `[string]~(K,_)` from v0.18 (x7) |
| Lists | literals open; `[&: T]` for every element; `close()` fixes the length (m15 to m17) | literals closed; `[...T]` opens; the `openlists` preview opens literals (x4) |
| Values kept out of the output | `type()`, `hide()` and `%name` declarations (m12 to m14) | definitions `#X`, hidden fields `_x`, and `let` |
| Embedding | none beside `&`; an include unifies in place | `{#A, x: 1}`, equal to unification from v0.18 (x8) |

### References and names

| Feature | aontu | CUE |
|---|---|---|
| References | paths: `$.a.b` from the root, `.x` from the enclosing map, `..x` a level up, `$.a.1` for a list index (r1, r2, r7) | lexical identifiers with selectors and indexes, `a.b` and `a[1]`; `self` from v0.18 (x6) |
| Names for values | `%name = v`, declared at the top of a file; `export` and the destructure carry names between files | `let`, field and label aliases (postfix `~` from v0.18), and every top-level field of a package |
| Cycles | a name or path that reaches itself with nothing between is refused before evaluation, `path_cycle` (r3, r4) | a reference cycle resolves to its fixpoint (r4); a structural cycle is refused (r5) |
| Missing input | `maybe(v)`: absence passes through every built-in and through `+` (x1) | `try` with `a?` markers, a preview (x1) |
| Values from the host | `$name`, bound only through the TypeScript and Go APIs | `@tag(name)` set with `-t name=value`, typed with `type=int`; `-T` adds `now`, `os`, `hostname` and others |

### Constraints

| Constraint | aontu | CUE |
|---|---|---|
| Bounds | `min`, `max`, `above`, `below` (c1 to c3) | `>=`, `<=`, `>`, `<` |
| Not equal | `neq(v…)` (c7) | `!=` |
| Pattern | `re(p)`, matched by aontu's own engine; a negation is `nof(0, re(p))` (c4 to c6) | `=~` and `!~`, matched by RE2 |
| Length | `len(n)`, over strings and lists (c8, c9) | `len()` returns a length; `strings.MinRunes`, `list.MinItems` and their twins bound it |
| Unique, contains, multiple | `unique(k?)`, `contains(c, n?)`, `mulof(n)` (c10, c15, c18) | `list.UniqueItems`, `list.Contains(v)`, `math.MultipleOf(n)` |
| n of, if then | `nof(n, …)`, `when(c, t, e)`, `rest(t, …)` (c11 to c13) | `matchN(n, […])`, `matchIf(c, t, e)` |
| Custom message | `must(c, msg)`, evaluate-only (c14) | `error(msg)` (c14) |
| Formats | `format(g)`: the nineteen JSON Schema formats, each an ABNF grammar, or a grammar written inline (c16, c17) | `time.Time`, `time.Format`, `net.IP`, `net.IPv4`, `net.IPCIDR`, `net.FQDN`, `net.URL`, `uuid.Valid` and others |
| Grammars | `abnf()` and `parse()` read text by a grammar | none |
| Equality | none (x9) | `==` over any values |

### Computation and generation

| Feature | aontu | CUE |
|---|---|---|
| Iteration | `pack`, `each`, `filter`, `match`, `emit` and `apply` over bags that already exist (g1, g2, g9, g10); what they reach and at what cost is in [the next section](#what-comprehensions-do-that-the-built-ins-do-not) | `for`, `if` and `let` clauses in struct and list comprehensions, each binding names the body and its keys can use |
| A conditional field | `x?: match($.c, p, v, any)` (g3) | `if c { x: v }`, with `else` in the `try` preview (x2) |
| Text | `+`, `join`, `upper`, `lower`, `split`, `rep`, `esc`, `usc`, `nom` (g4 to g8) | interpolation, and the `strings`, `regexp`, `strconv` and `text/template` packages |
| Projection | `pick` projects a field into a list (g14); keeping the keys takes an aggregate for a number or a string (g1) and a built link for anything else (k18) | `{for k, v in m {(k): v.f}}` |
| Computed keys | `pack([$.k], v)` (g11) | `(expr): v` and `"\(k)": v` |
| Counting and aggregates | `sum`, `least`, `greatest`, `sort`; a count is `sum(each(d, 1))` (g7, g13) | `len`, and `list.Sum`, `Min`, `Max`, `Avg`, `Product`, `Sort` and others |
| Functions | 72 built-ins, declared in both ports; no user-defined functions, by decision ([`g8-generation.md`](capability-review/g8-generation.md)) | builtins and 33 standard packages, among them `crypto/*`, `encoding/*`, `time`, `net`, `path` and `uuid`; user-defined functions in the `functions` preview (x3) |
| Output order | keys sorted (o1) | source order (o1) |
| Writing files | the component tree, through `render`, `template` and `trace` ([the generation reference](../docs/reference-generation.md)) | `cue cmd` workflows with `tool/file` and `text/template`, and `cue exp writefs` |

### Interchange

| Format | aontu | CUE |
|---|---|---|
| Read as data | JSON, JSON-LD, JSONC, JSON5, jsonic, YAML, TOML, INI and text, by the include's extension | JSON, JSONL, YAML, TOML, text, binary, textproto, XML through the koala mapping, and INI from v0.18 |
| Write | JSON and the canonical form, and files through the component tree | JSON, JSONL, YAML, TOML, CUE, text, binary, textproto, and INI from v0.18 |
| JSON Schema import | draft-04, draft-06, draft-07, 2019-09 and 2020-12; keeps `default`, `format` and the other annotations as `meta()` records; reads `"type": "integer"` as `number & mulof(1)`, since JSON Schema admits `1.0` | the same drafts, the OpenAPI 3.0 dialect and Kubernetes schemas; on the probe's schema it wrote `int`, `close()` and `host!`, and dropped `default` and `format` |
| JSON Schema export | 2020-12, with each loss reported | `cue def --out jsonschema` or `cue export --out jsonschema`, marked experimental: 2020-12, and from v0.18 Draft 7 and the OpenAPI 3.0 dialect |
| OpenAPI | none | import and export of `components.schemas`; whole documents behind the `openapiv2` preview |
| Protobuf | none | `.proto` import, textproto both ways, and the protobuf JSON mapping |
| Go types | none; Go calls aontu through its API | `cue get go` reads Go types, `cue exp gengotypes` writes them, and `cuego` validates Go values |
| Kubernetes | none | `cue get crd` |

The two imports differ the most. On the same 2020-12 schema, aontu
wrote:

```aontu
port?: meta(number & mulof(1) & min(1) & max(65535), { default:8080 })
host: meta(empty(), { format:"hostname" })
mode?: "a"|"b"
tags?: [&: empty()] & unique()
&: match(key(0), "host", any, "mode", any, "port", any, "tags", any, nil)
```

and CUE v0.17.1 wrote:

```cue
close({
	port?: int & >=1 & <=65535
	host!: string
	mode?: "a" | "b"
	tags?: list.UniqueItems() & [...string]
})
```

The tabnas packages that aontu reads these formats with can now write
them too, in versions newer than the ones aontu pins.
[IO-FORMATS.0.md](IO-FORMATS.0.md) has what they write, what they
lose, and what stands between aontu and them.

### Modules and packages

| Feature | aontu | CUE |
|---|---|---|
| The unit | a file; `@"./x.aontu"` unifies another file in place | a package of files, with imports |
| Dependencies | domain-shaped paths in `pkg.aontu`, minimum version selection, a lockfile with three pins, vendoring, signed manifests over Sigstore or a key, a cooldown, and a `breaking` gate at publish ([the package reference](../docs/reference-packages.md)) | `cue.mod/module.cue`, minimum version selection with no lockfile, OCI registries, no vendoring command |
| Registry | `pkg.aontu.dev` has no address yet, so a project names its own base, and `pkg serve` serves one | the Central Registry, `registry.cue.works`, serves; `cue login`, `cue mod mirror` and a local `cue mod registry` |
| Language version | none: a package's own version is its contract | `language: version` per module, experiments gated by it, `cue mod upgrade` and `cue fix` to migrate |

### Tooling

| Feature | aontu | CUE |
|---|---|---|
| Validate data | `vet`: a verdict (valid, invalid, incomplete or error) with exit classes, each finding with a stable code, a class and the data's and the schema's sites, as text, JSON or SARIF, and a GitHub Action | `cue vet`: each error with its sites; `-c` asks for concrete values |
| Compare schemas | `subsume` and `breaking`: subsumes, does not subsume with a witness, or undecided with a reason; backward, forward and full modes | the Go API's `Value.Subsume`; no command |
| Explain a value | `model why`, the contributions to a value in order | none |
| Pin a meaning | `hash`: one `aon1-` hash for documents that mean the same, whatever their order | none |
| Graphs | `relate`, `path()`, `relations`, `reaches`, `acyclic()`, `inverse()`, `ident()` | none beyond references |
| Draw a model | `view`, ten kinds | none |
| Format | `fmt` | `cue fmt`, with a new formatter in v0.18 |
| Trim | `trim --check` reports; it examines nothing below a key stated twice, an explicit `&` or a call ([#860](https://github.com/aontu-lang/aontu/issues/860)) | `cue trim` rewrites, across statements, and removes values a default implies |
| Language server | diagnostics, hover, completion, go-to-definition on alias names, signature help ([the LSP page](../docs/lsp.md)) | completion, definition, hover, references, rename, code actions, document symbols, code lens and external validators; visible and with a daemon mode from v0.18 |
| Editors | VS Code, Emacs and Vim plugins in this repository | not documented on cuelang.org |
| Agents | the MCP server (TypeScript only), `help`, `explain`, `init`, `agentsmd`, the skill pack, and GBNF, Lark and ABNF grammars for constrained decoding | none found |
| Playground | `web/playground.html`, one static page | cuelang.org/play, in WebAssembly |
| Implementations | TypeScript (canonical) and Go, held to parity by a shared suite and a Lean definition, each at 100 % coverage | Go, with a Java API and libcue for C as experimental previews |

### Trust and termination

| Feature | aontu | CUE |
|---|---|---|
| Hermetic evaluation | no clock, randomness, environment or network in the language ([the trust contract](../docs/trust.md)) | the same for evaluation, but `-T` injects the time, the OS and the host name into `@tag` fields, and `cue cmd` runs `exec`, `http` and `file` tasks |
| Reading files | `@"…"` under a capability: `--trust none`, `root:<dir>` or `system` | imports from the module and its dependencies, and `@embed` inside the module |
| Termination | event budgets for passes, revisits and depth, with recursion expanded only against data | no user functions in a stable release, and structural cycles refused |

## What comprehensions do that the built-ins do not

A CUE comprehension binds names. `for k, v in m` names a member and its
key, a nested clause sees every name outside it, and each name can be
used in the body and in the key of what the body makes. aontu's
built-ins bind less. A template holds its member whole, as `_`, and
can't select from it. Only an `emit` body reads a field of its node,
by a relative reference. A key is reached by counting levels, `key(2)`,
and an outer member by counting dots, `..name`.

That difference decides what is direct and what takes a construction.
Probes k1 to k38 pair a comprehension with the nearest aontu spelling.

### One thing has no spelling

**A loop whose length comes from a number alone.** `each($.n, …)` is
refused, `each_data` (k30): a generator iterates a bag that already
exists, which is the termination guarantee that
[G8](capability-review/g8-generation.md) chose. A number can still
drive a loop under a bound the document writes:
`filter([0, 1, …, 9], below($.n))` is the first `n` of ten (k31). Past
the bound the answer is the bound's, with no finding: twelve asked for,
ten made (k32).

### Direct in both

- a new record from each record, in an `emit` body (k1);
- a filter by a bound, `|`, a second key or `neq`, against a written
  value or a value anywhere in the document (k2, k3, k38);
- flattening the lists that members hold, since the lists of an `emit`
  body splice (k6), and two lists end to end under `+` (k28);
- a block of fields, a list element and a chain of cases under a
  condition, and a test for a field's presence: `match`, with `maybe`
  for the element that isn't there (k22 to k25);
- a sum of products (k27), and a count (g13).

### Reached by a construction

| What the comprehension does | CUE | aontu | Probes |
|---|---|---|---|
| compares two fields of one member | `if x.a > x.b` | derive `d: sub(.a, .b)` on a copy, then filter on `d`. Written directly, `filter($.xs, {a: above(.b)})` answers `[]` with no finding | k4, k5 |
| uses a value made in the loop | `let y = x.a * 2` | an `emit` that makes the value, then a `filter` over the result | k26 |
| reads the outer member in an inner loop | `for s in svcs for p in s.ports {"\(s.name):\(p)"}` | keep the member with `_ &`, build the inner list beside it by a climb, `..name`, then flatten with `emit` | k7, k8 |
| keeps the members another list names | `if list.Contains(allowed, x.name)` | `pack` over the names, a `filter` by `key(2)` in each child, then flatten; the order becomes the keys' | k9 |
| keys a map by a field, or by anything computed | `(x.name): …`, `"svc-\(k)": …`, `"\(x.ns)/\(x.name)": …` | `pack` over the picked keys, and in each child a `filter` by `key(2)` back into the source, unwrapped by `sum` or `join` | k10, k14 to k16 |
| the same, holding a record | `(x.name): x` | make the keys with `pack`, then pour each record in through a checked link whose address is built, `relate(_) & path("$.out." + .name)` | k11, k18 |
| groups by a field | `(x.team): [for y in xs if y.team == x.team {y.name}]` | `pack` over the picked teams, and a `filter` by `key(2)` | k12 |
| pairs every member of two lists, keyed by both | `"\(a)-\(b)": {left: a, right: b}` | build the keys as text, `pack` over them, and `split` each key back apart | k17 |
| looks a value up by a member's field | `teams[s.team].email` | stamp each team with its key, then in a spread a `filter` by a climb, `{id: ...team}`, unwrapped by `join` | k19 |
| the same, for a whole record | `teams[s.team]` | group the members' keys under each team, then pour the team's record into each through a built link | k20 |
| pairs two lists by position | `ys[i]` | stamp each member with its position, then a `filter` by `key(3)` | k21 |
| uses a position as a number | `xs[len(xs)-1]`, `xs[i-1]`, `xs[1:3]`, `list.Reverse(xs)` | a position is text. The count reaches the last member. The rest take a written list of numbers to turn positions into numbers, then `sort` or a bound | k33 to k36 |
| lists a map's keys | `[for k, _ in m {k}]` | `each(pack($.m, key(0)), _)`, in sorted order | k29 |

### What the constructions cost

- **Levels are counted, and a miscount answers nothing.** `key(2)` is
  right in k12, and `key(3)` gives every group as `[]` with no finding
  (k13). A miscounted climb does the same.
- **A value is unwrapped by an aggregate.** `sum` and `join` stand in
  for "the one member", so a number or a string comes out bare, a
  boolean comes out as text, and a record takes the link route
  ([#861](https://github.com/aontu-lang/aontu/issues/861)).
- **Helpers stay in the document.** Each construction adds fields that
  `hide()` keeps out of the output. The hash still covers them, and
  links show in `aontu view graph` as edges, or as hidden contributions
  when their field is hidden.
- **Order follows the keys.** A result that passes through a map comes
  out in sorted-key order (k9, k29).
- **Two open faults sit on these routes.** In a member a generator
  made, a `filter`'s condition reads no relative path and answers empty
  ([#754](https://github.com/aontu-lang/aontu/issues/754)), which is
  why k36 looks up by `key(3)` and not by a climb. And a `match` whose
  pattern is a relative reference, as in
  `same: match(.a, .b, true, false)`, overflows the TypeScript stack
  where Go answers
  ([#868](https://github.com/aontu-lang/aontu/issues/868), beside
  [#850](https://github.com/aontu-lang/aontu/issues/850), which names
  the result position).

### What would shorten them

None of these is decided, and none needs a comprehension keyword.
[The plan](LANG-REFINEMENT-PLAN.0.md) makes them tasks, each with the
code in both languages:

1. **The member of a bag at a key or a position**, `at(d, ...k)`. It is
   a field of the member in an `each`, `pack` or `apply` template, as an
   `emit` body already reads one (k37 is the refusal today), and it is
   the lookup that replaces the stamp, the `filter` by a counted level
   and the aggregate.
2. **A key for each child of `pack`**, in place of a `pack` over picked
   keys with a lookup back.
3. **A position as an integer**, the sibling of `key()`.
4. **The member of an enclosing generator**, the depth argument that
   [G8](capability-review/g8-generation.md) left open.
5. **A loop driven by a number**, which needs a ruling on the
   termination guarantee before it is a built-in.

## Found along the way

Three gaps surfaced while writing the probes, each in both engines, and
each is now an issue.

- **`aontu trim --check` examines nothing below a key stated twice, an
  explicit `&` or a call**
  ([#860](https://github.com/aontu-lang/aontu/issues/860)). It reports
  `$.a.b.x` in `a: { &: { x: 1 }, b: { x: 1, y: 2 } }`, and answers
  `clean` for the same document written as `a: &: { x: 1 }` and
  `a: b: { x: 1, y: 2 }`, as it does inside `close()` and `type()`. The
  walk that lists candidates descends maps and lists only. One part of
  this is by design: `test/spec/trim.tsv` pins a repeated statement of
  one key as one entry. What it doesn't pin is that the entries below
  such a key stop being examined. `cue trim` removes the entry in the
  statement spelling. A value that a default implies is kept by
  `aontu trim` on purpose, since its canon differs from the default's.
- **No direct keyed projection**
  ([#861](https://github.com/aontu-lang/aontu/issues/861)).
  `pick($.svc, port)` projects a field of each member into a list and
  drops the keys. Keeping them takes `pack($.svc, sum(pick([_], port)))`
  for a number, the `join` twin for a string, and a checked link with a
  built address for any other kind (k18). CUE writes
  `{for k, v in svc {(k): v.port}}`.
- **No command-line binding for `$name`**
  ([#862](https://github.com/aontu-lang/aontu/issues/862)). A host
  variable reaches a document only through the TypeScript or Go API, so
  a document that reads one is `unknown_var` under every verb. CUE
  binds a value from the command line with `-t name=value` into a field
  marked `@tag(name)`.

Four defects surfaced too, and each is an issue:

- a `match` whose pattern is a relative reference overflows the
  TypeScript stack, and one whose pattern is a bound over it is
  refused there, where Go answers both
  ([#868](https://github.com/aontu-lang/aontu/issues/868));
- a call refused at parse, an unknown name or a wrong count, is silent
  inside a trial, in both ports: `filter($.xs, length(3))`, with the
  retired name, answers `[]`
  ([#870](https://github.com/aontu-lang/aontu/issues/870));
- in TypeScript, a `maybe` of a relative reference never resolves as a
  second or later argument of a call in a written field, where Go
  answers: `x: { b: 2, d: sub(5, maybe(.b)) }` is `mapval_no_gen`
  there, where Go answers `d: 3`
  ([#871](https://github.com/aontu-lang/aontu/issues/871));
- `llms.txt` and the language-server page count 68 built-ins, where the
  declarations hold 72
  ([#869](https://github.com/aontu-lang/aontu/issues/869)).

## What this suggests for aontu

None of this is decided. Each item is a candidate for the maintainer.

1. **The three issues above**: [#860](https://github.com/aontu-lang/aontu/issues/860),
   [#861](https://github.com/aontu-lang/aontu/issues/861) and
   [#862](https://github.com/aontu-lang/aontu/issues/862).
2. **[The plan](LANG-REFINEMENT-PLAN.0.md)**, whose first part is the
   five additions under
   [What would shorten them](#what-would-shorten-them), the defects on
   their routes, the rows that pin today's routes and the guide. Its
   parts 2 to 7, added and ruled on 2026-11-21, make tasks of items 3
   and 4 below, of the language server and the key pattern in item 6,
   and of #862 in item 1, and add bytes and sized numbers. The ruling
   defers OpenAPI, which is to be added separately.
3. **The CUE guide that the plan's H3 asks for now has its table.** The
   table in
   [Where the same text means different things](#where-the-same-text-means-different-things),
   with each row's probe as an executed example, is most of
   "aontu for CUE users". M8's pattern catalogue can start from
   [Reached by a construction](#reached-by-a-construction), whose rows
   are the idioms a CUE user reaches for.
4. **The probes can seed L6.** The plan's differential corpus against a
   pinned `cue` binary needs a corpus; these probes run both engines and
   two CUE releases in under a minute. Committed with expectations
   that both engines agree on, they would hold the rows where aontu
   follows CUE, and show where CUE itself moves, as v0.18 moved g12 and
   x8.
5. **Three CUE previews change what a CUE user expects.** `openlists`
   would make CUE's list literals behave as aontu's do, `functions`
   would leave aontu the only one of the two without user-defined
   functions, and `try` is CUE's `maybe`. None needs action yet. Each
   changes what the CUE guide says once it is stable.
6. **The plan's other CUE gaps stand.** YAML and TOML output (M1), the
   language server's references, rename and key completion (M5), a
   repository that serves (M6), OpenAPI import (L3), type generation
   (L9) and the short form for a key pattern (L2) are all still open.
   The language server is the widest of these gaps: CUE's has answered
   references and rename since v0.15 and code actions and symbols since
   v0.16, and v0.18 makes it a visible command.

The decisions that rule out CUE's other features still hold, and CUE
still has all of them: operators for constraints (ADR-008), string
interpolation
([ADR-023](../ADR.md#adr-023--g9-completes-at-the-renderer-the-reflection-sidecar-the-jostraca-bridge-and-string-interpolation-are-retired)),
comprehension keywords, side-effecting workflows, and user-defined
functions, which CUE now previews.

## Corrections to the survey of 2026-10-01

aontu has moved since that survey, which measured 0.76.0.

- **aontu imports JSON Schema.** The survey's matrix answers "no", and
  the plan's H2 proposes the importer. All eighteen phases of G12 have
  landed ([progress.md](capability-review/progress.md)), so
  `aontu jsonschema import` reads 2020-12 and the earlier dialects, and
  keeps `default`, `format` and the other annotations as `meta()`
  records where CUE's importer drops them ([Interchange](#interchange)).
  The same gap document landed the plan's M2 (`format()` over the
  nineteen JSON Schema formats, each an ABNF grammar,
  [ADR-059](../ADR.md#adr-059--a-format-is-a-grammar-aontu-reads-and-runs-itself)),
  M3 (`nof`, `when`, `contains`, `rest` and `meta`), M4 (a
  regular-expression engine of aontu's own in both ports,
  [ADR-060](../ADR.md#adr-060--aontu-matches-a-pattern-with-its-own-engine))
  and L1.
- **The constraint atoms are more than eight.** Beside `min`, `max`,
  `above`, `below`, `neq`, `re`, `len`, `unique` and `must` there are
  now `mulof`, `empty`, `format`, `nof`, `when`, `contains` and `rest`
  ([the grammar card](../docs/skill/grammar-card.md)).
- **The error registry holds 204 codes**, not 175
  ([`test/spec/errcodes.tsv`](../test/spec/errcodes.tsv)).
- **The query verbs moved under `model`**: `model get`, `model why` and
  `model set`, beside new verbs the survey does not list: `trim`,
  `relations`, `reaches`, `template`, `trace`, `allow`, `agentsmd`,
  `explain`, `init` and the package verbs
  ([`aontu --help`](../docs/reference-api.md#command-line-interface)).

One claim about CUE needs correcting. The survey's last table says
that "CUE's integers and decimals are arbitrary-precision, so CUE has
no rounding to refuse". Its literals are exact, but v0.17.1 rounds an
integer sum or product past 34 significant digits without an error,
and its decimals compute `+ - * /` in a 34-digit context (n2). Only
v0.18.0-rc.4 makes the integer arithmetic exact. The rest holds:
v0.17.1 is still the latest release, and what has moved is the release
candidate, described in [What is current in CUE](#what-is-current-in-cue).

## The probes

Each of the 154 probes was written once for each language, to say the
same thing, and run through `aontu` (TypeScript and Go, built from this
commit), and through `cue export --out json` from v0.17.1 and
v0.18.0-rc.4 (`cue eval` for c2, c3 and c19, beside `aontu -c`). A file
with no module, as here, takes the language version of the binary that
reads it. "refused" names aontu's error code, or quotes the first line
of CUE's message. "same" means v0.18.0-rc.4 answered as v0.17.1 did,
which it did for 146 of them. Both aontu engines gave the same answer
to every probe. For k1 to k38 the answer shown is the member the probe
is about, `out`, and the helpers beside it are left out. To run a probe
again, write its two sources to `p.aontu` and `p.cue`, then run
`aontu p.aontu` and `cue export p.cue --out json`.

| ID | Probe | aontu source | CUE source | aontu (both engines) | CUE v0.17.1 | v0.18.0-rc.4 |
|---|---|---|---|---|---|---|
| s1 | equal scalars meet | `a: 1 & 1` | `a: 1 & 1` | `{"a":1}` | `{"a":1}` | same |
| s2 | different scalars conflict | `a: 1 & 2` | `a: 1 & 2` | refused, `scalar_value` | refused: conflicting values 2 and 1 | same |
| s3 | int meets float of same value | `a: 1 & 1.0` | `a: 1 & 1.0` | refused, `scalar_kind` | refused: conflicting values 1 and 1.0 (mismatched types int and float) | same |
| s4 | number narrows to integer | `a: number & integer & 3` | `a: number & int & 3` | `{"a":3}` | `{"a":3}` | same |
| s5 | string admits the empty string | `a: string & ""` | `a: string & ""` | refused, `string_empty` | `{"a":""}` | same |
| s6 | 2^53+1 integer literal | `id: 9007199254740993` | `id: 9007199254740993` | refused, `lossy_integer_literal` | `{"id":9007199254740993}` | same |
| s7 | exact integer literal | `id: 0d9007199254740993` | `id: 9007199254740993` | `{"id":9007199254740993}` | `{"id":9007199254740993}` | same |
| s8 | 0.1 + 0.2 | `a: 0.1 + 0.2` | `a: 0.1 + 0.2` | `{"a":0.30000000000000004}` | `{"a":0.3}` | same |
| s9 | exact 0.1 + 0.2 | `a: 0d0.1 + 0d0.2` | `a: 0.1 + 0.2` | `{"a":0.3}` | `{"a":0.3}` | same |
| s10 | integer division | `a: div(7, 2)` `b: mod(-7, 2)` `c: rem(-7, 2)` | `a: div(7, 2)` `b: mod(-7, 2)` `c: rem(-7, 2)` | `{"a":3,"b":1,"c":-1}` | `{"a":3,"b":1,"c":-1}` | same |
| s11 | division operator | `a: div(7.0, 2)` | `a: 7 / 2` | `{"a":3.5}` | `{"a":3.5}` | same |
| s12 | multiplication | `a: mul(6, 7)` | `a: 6 * 7` | `{"a":42}` | `{"a":42}` | same |
| s13 | int + float | `a: 1 + 2.5` | `a: 1 + 2.5` | `{"a":3.5}` | `{"a":3.5}` | same |
| s14 | string concatenation | `a: "ab" + "cd"` | `a: "ab" + "cd"` | `{"a":"abcd"}` | `{"a":"abcd"}` | same |
| s15 | string + number | `a: "port:" + 80` | `a: "port:" + 80` | `{"a":"port:80"}` | refused: invalid operands "port:" and 80 to '+' (type string and int) | same |
| s16 | hex, octal, binary, separators | `a: 0x1f` `b: 0o17` `c: 0b1010` `d: 1_000_000` | `a: 0x1f` `b: 0o17` `c: 0b1010` `d: 1_000_000` | `{"a":31,"b":15,"c":10,"d":1000000}` | `{"a":31,"b":15,"c":10,"d":1000000}` | same |
| s17 | SI multiplier literal | `a: 1Ki` | `a: 1Ki` | `{"a":"1Ki"}` | `{"a":1024}` | same |
| s18 | bare word | `a: Mercury` | `a: Mercury` | `{"a":"Mercury"}` | refused: reference "Mercury" not found | same |
| s19 | single-quoted text | `a: 'abc'` | `a: 'abc'` | `{"a":"abc"}` | `{"a":"YWJj"}` | same |
| s20 | int64 overflow arithmetic | `a: add(9223372036854775807, 1)` | `a: 9223372036854775807 + 1` | refused, `invalid-arg` | `{"a":9223372036854775808}` | same |
| s21 | integer equality across int and float | `a: 1 & number` `b: 1.0 & number` | `a: 1 & number` `b: 1.0 & number` | `{"a":1,"b":1}` | `{"a":1,"b":1.0}` | same |
| s22 | float literal kind | `a: 1e3 & integer` | `a: 1e3 & int` | `{"a":1000}` | refused: conflicting values 1E+3 and int (mismatched types float and int) | same |
| s23 | integer division of a negative number | `a: div(-7, 2)` `b: mod(-7, 2)` `c: rem(-7, 2)` `d: div(-7, -2)` `e: mod(7, -2)` | `a: div(-7, 2)` `b: mod(-7, 2)` `c: rem(-7, 2)` `d: div(-7, -2)` `e: mod(7, -2)` | `{"a":-3,"b":1,"c":-1,"d":3,"e":-1}` | `{"a":-4,"b":1,"c":-1,"d":4,"e":1}` | same |
| s24 | two lists under + | `a: [1, 2] + [3]` | `a: [1, 2] + [3]` | `{"a":[1,2,3]}` | refused: Addition of lists is superseded by list.Concat; see https://cuelang.org/e/v0.11-list-arithmetic | same |
| d1 | standalone default, overridden | `a: *1` `a: 2` | `a: *1` `a: 2` | `{"a":2}` | refused: preference mark not allowed at this position | same |
| d2 | default in a disjunction, overridden | `a: *1 \| integer` `a: 2` | `a: *1 \| int` `a: 2` | `{"a":2}` | `{"a":2}` | same |
| d3 | default in a disjunction, unset | `a: *1 \| integer` | `a: *1 \| int` | `{"a":1}` | `{"a":1}` | same |
| d4 | enum with default refuses an outsider | `k: *"auto" \| "literal" \| "data"` `k: "autoo"` | `k: *"auto" \| "literal" \| "data"` `k: "autoo"` | refused, `empty` | refused: 3 errors in empty disjunction | same |
| d5 | two defaults disagree | `a: *1 \| *2` | `a: *1 \| *2` | refused, `pref_rank_clash` | refused: incomplete value 1 \| 2 | same |
| d6 | ranked defaults | `a: *1 \| **2` | `a: *1 \| 2` | `{"a":1}` | `{"a":1}` | same |
| d7 | unresolved disjunction | `a: 1 \| 2` | `a: 1 \| 2` | refused, `disjunct_no_gen` | refused: incomplete value 1 \| 2 | same |
| d8 | default meets a narrowing peer | `a: *8080 \| integer` `a: integer & min(1024)` | `a: *8080 \| int` `a: int & >=1024` | `{"a":8080}` | `{"a":8080}` | same |
| d9 | struct default, extended | `a: *{x: 1}` `a: y: 2` | `a: *{x: 1} \| {...}` `a: y: 2` | `{"a":{"x":1,"y":2}}` | `{"a":{"x":1,"y":2}}` | same |
| d10 | two standalone defaults of the same value | `a: *1` `a: *1` | `a: *1` `a: *1` | `{"a":1}` | refused: preference mark not allowed at this position | same |
| m1 | optional key with a concrete value | `x?: 1` `y: 2` | `x?: 1` `y: 2` | `{"x":1,"y":2}` | `{"y":2}` | same |
| m2 | optional key filled | `x?: integer` `x: 1` | `x?: int` `x: 1` | `{"x":1}` | `{"x":1}` | same |
| m3 | optional key unfilled | `x?: integer` `y: 2` | `x?: int` `y: 2` | `{"y":2}` | `{"y":2}` | same |
| m4 | required kind left unfilled | `x: integer` | `x!: int` | refused, `mapval_no_gen` | refused: field is required but not present | same |
| m5 | closed map refuses a new key | `a: close({x: integer}) & {x: 1, y: 2}` | `#A: {x: int}` `a: #A & {x: 1, y: 2}` | refused, `closed` | refused: field not allowed | same |
| m6 | closed map refuses a nested new key | `a: close({x: {y: integer}}) & {x: {y: 1, z: 2}}` | `#A: {x: {y: int}}` `a: #A & {x: {y: 1, z: 2}}` | refused, `closed` | refused: field not allowed | same |
| m7 | open map accepts a new key | `a: {x: integer} & {x: 1, y: 2}` | `a: {x: int} & {x: 1, y: 2}` | `{"a":{"x":1,"y":2}}` | `{"a":{"x":1,"y":2}}` | same |
| m8 | reopened closed map | `a: open(close({x: integer})) & {x: 1, y: 2}` | `#A: {x: int, ...}` `a: #A & {x: 1, y: 2}` | `{"a":{"x":1,"y":2}}` | `{"a":{"x":1,"y":2}}` | same |
| m9 | template for every key | `m: {&: integer}` `m: {a: 1, b: "x"}` | `m: [string]: int` `m: {a: 1, b: "x"}` | refused, `no_scalar_unify` | refused: conflicting values "x" and int (mismatched types string and int) | same |
| m10 | template for keys matching a pattern | `m: {&: match(key(0), re("^x"), integer, any)}` `m: {xa: 1, b: "s"}` | `m: [=~"^x"]: int` `m: {xa: 1, b: "s"}` | `{"m":{"b":"s","xa":1}}` | `{"m":{"b":"s","xa":1}}` | same |
| m11 | pattern template refuses a match | `m: {&: match(key(0), re("^x"), integer, any)}` `m: {xa: "s"}` | `m: [=~"^x"]: int` `m: {xa: "s"}` | refused, `no_scalar_unify` | refused: conflicting values "s" and int (mismatched types string and int) | same |
| m12 | hidden value used by another | `h: hide(1)` `a: $.h + 1` | `_h: 1` `a: _h + 1` | `{"a":2}` | `{"a":2}` | same |
| m13 | schema block not in output | `%D = {x: 1}` `a: %D` | `#D: {x: 1}` `a: #D` | `{"a":{"x":1}}` | `{"a":{"x":1}}` | same |
| m14 | type() block not in output | `type: type({ Port: integer & min(1) })` `port: $.type.Port & 80` | `#Port: int & >=1` `port: #Port & 80` | `{"port":80}` | `{"port":80}` | same |
| m15 | closed list refuses a longer list | `l: close([integer, integer]) & [1, 2, 3]` | `l: [int, int] & [1, 2, 3]` | refused, `closed` | refused: incompatible list lengths (2 and 3) | same |
| m16 | list literal met with a longer list | `l: [integer, integer] & [1, 2, 3]` | `l: [int, int] & [1, 2, 3]` | `{"l":[1,2,3]}` | refused: incompatible list lengths (2 and 3) | same |
| m17 | list of any length, one element type | `l: [&: integer]` `l: [1, 2, 3]` | `l: [...int]` `l: [1, 2, 3]` | `{"l":[1,2,3]}` | `{"l":[1,2,3]}` | same |
| m18 | null or string | `a: null \| string` `a: null` | `a: null \| string` `a: null` | `{"a":null}` | `{"a":null}` | same |
| m19 | duplicate key merge | `a: {b: 1}` `a: {c: 2}` | `a: {b: 1}` `a: {c: 2}` | `{"a":{"b":1,"c":2}}` | `{"a":{"b":1,"c":2}}` | same |
| m20 | nested shorthand | `a: b: c: 1` | `a: b: c: 1` | `{"a":{"b":{"c":1}}}` | `{"a":{"b":{"c":1}}}` | same |
| m21 | embedding a closed schema and adding a field | `%A = close({x: integer})` `b: %A & {x: 1}` `b: y: 2` | `#A: {x: int}` `b: {#A, x: 1}` `b: y: 2` | refused, `closed` | refused: field not allowed | same |
| r1 | relative reference | `a: {x: 1, y: .x}` | `a: {x: 1, y: x}` | `{"a":{"x":1,"y":1}}` | `{"a":{"x":1,"y":1}}` | same |
| r2 | absolute reference | `a: 1` `b: {c: $.a}` | `a: 1` `b: {c: a}` | `{"a":1,"b":{"c":1}}` | `{"a":1,"b":{"c":1}}` | same |
| r3 | reference cycle, unresolved | `a: $.b` `b: $.a` | `a: b` `b: a` | refused, `path_cycle` | refused: incomplete value _ | same |
| r4 | reference cycle, resolved by a value | `a: $.b` `b: $.a` `a: 1` | `a: b` `b: a` `a: 1` | refused, `path_cycle` | `{"a":1,"b":1}` | same |
| r5 | structural cycle | `a: b: $.a` | `a: b: a` | refused, `recursion_unexpanded` | refused: structural cycle | same |
| r6 | recursive schema on finite data | `%T = {v: integer, next?: %T}` `t: %T & {v: 1, next: {v: 2, next: {v: 3}}}` | `#T: {v: int, next?: #T}` `t: #T & {v: 1, next: {v: 2, next: {v: 3}}}` | `{"t":{"next":{"next":{"v":3},"v":2},"v":1}}` | `{"t":{"next":{"next":{"v":3},"v":2},"v":1}}` | same |
| r7 | list index | `a: [10, 20, 30]` `b: $.a.1` | `a: [10, 20, 30]` `b: a[1]` | `{"a":[10,20,30],"b":20}` | `{"a":[10,20,30],"b":20}` | same |
| r8 | named value (let / alias) | `%x = 2` `a: mul(%x, 3)` | `let x = 2` `a: x * 3` | `{"a":6}` | `{"a":6}` | same |
| r9 | reference to an undefined path | `a: $.nope` | `a: nope` | refused, `no_path` | refused: reference "nope" not found | same |
| r10 | self-reference through arithmetic | `a: {n: 2, m: mul(.n, 3)}` | `a: {n: 2, m: n * 3}` | `{"a":{"m":6,"n":2}}` | `{"a":{"m":6,"n":2}}` | same |
| c1 | integer range | `a: integer & min(1) & max(10)` `a: 11` | `a: int & >=1 & <=10` `a: 11` | refused, `constraint` | refused: invalid value 11 (out of bound <=10) | same |
| c2 | two lower bounds meet | `a: min(1) & min(5)` | `a: >=1 & >=5` | `{"a":min(5)}` | `a: >=5` | same |
| c3 | empty range | `a: above(10) & below(5)` | `a: >10 & <5` | refused, `constraint` | refused: incompatible number bounds <5 and >10 | same |
| c4 | regular expression | `a: re("^a") & "abc"` | `a: =~"^a" & "abc"` | `{"a":"abc"}` | `{"a":"abc"}` | same |
| c5 | regular expression refuses | `a: re("^a") & "xbc"` | `a: =~"^a" & "xbc"` | refused, `constraint` | refused: invalid value "xbc" (out of bound =~"^a") | same |
| c6 | negated pattern | `a: nof(0, re("^a")) & "xbc"` | `a: !~"^a" & "xbc"` | `{"a":"xbc"}` | `{"a":"xbc"}` | same |
| c7 | not equal | `a: neq(3) & 3` | `a: !=3 & 3` | refused, `constraint` | refused: invalid value 3 (out of bound !=3) | same |
| c8 | string length | `a: len(min(3)) & "ab"` | `import "strings"` `a: strings.MinRunes(3) & "ab"` | refused, `constraint` | refused: invalid value "ab" (does not satisfy strings.MinRunes(3)) | same |
| c9 | list length | `a: len(min(2)) & [1]` | `import "list"` `a: list.MinItems(2) & [1]` | refused, `constraint` | refused: invalid value [1] (does not satisfy list.MinItems(2)): len(list) < MinItems(2) (1 < 2) | same |
| c10 | unique items | `a: unique() & [1, 1]` | `import "list"` `a: list.UniqueItems() & [1, 1]` | refused, `constraint` | refused: invalid value [1,1] (does not satisfy list.UniqueItems): equal value (1) at position 0 and 1 | same |
| c11 | exactly one of | `a: nof(1, integer, string) & 1` | `a: matchN(1, [int, string]) & 1` | `{"a":1}` | `{"a":1}` | same |
| c12 | exactly one of, two admit | `a: nof(1, min(0), integer) & 1` | `a: matchN(1, [>=0, int]) & 1` | refused, `nof` | refused: invalid value 1 (does not satisfy matchN): 2 matched, expected 1 | same |
| c13 | if-then constraint | `a: when({k: any}, {n: any}) & {k: 1}` | `a: matchIf({k!: _}, {n!: _}, _) & {k: 1}` | refused, `when` | refused: invalid value {k:1} (does not satisfy matchIf): field is required but not present | same |
| c14 | custom message | `a: must(min(0), "a must not be negative") & -1` | `a: -1` `if a < 0 { error("a must not be negative") }` | refused, `must` | refused: a must not be negative | same |
| c15 | multiple of | `a: mulof(5) & 12` | `import "math"` `a: math.MultipleOf(5) & 12` | refused, `constraint` | refused: invalid value 12 (does not satisfy math.MultipleOf(5)) | same |
| c16 | date format | `a: format("date") & "2024-02-30"` | `import "time"` `a: time.Format("2006-01-02") & "2024-02-30"` | refused, `parse_failed` | refused: invalid value "2024-02-30" (does not satisfy time.Format("2006-01-02")): invalid time "2024-02-30" | same |
| c17 | IPv4 format | `a: format("ipv4") & "1.2.3.256"` | `import "net"` `a: net.IPv4 & "1.2.3.256"` | refused, `parse_failed` | refused: invalid value "1.2.3.256" (does not satisfy net.IPv4): ParseAddr("1.2.3.256"): IPv4 field has value >255 | same |
| c18 | contains | `a: contains(min(10)) & [1, 2]` | `import "list"` `a: list.Contains(10) & [1, 2]` | refused, `constraint` | refused: invalid value [1,2] (does not satisfy list.Contains(10)) | same |
| c19 | bound on an open string | `a: string & len(max(3))` | `import "strings"` `a: string & strings.MaxRunes(3)` | `{"a":string&len(integer&min(0)&max(3))}` | `import "strings" a: strings.MaxRunes(3)` | same |
| c20 | constraint on a float | `a: float & above(0) & 0.5` | `a: float & >0 & 0.5` | `{"a":0.5}` | `{"a":0.5}` | same |
| g1 | map from a map | `svc: {a: {port: 1}, b: {port: 2}}` `ports: pack($.svc, sum(pick([_], port)))` | `svc: {a: {port: 1}, b: {port: 2}}` `ports: {for k, v in svc {(k): v.port}}` | `{"ports":{"a":1,"b":2},"svc":{"a":{"port":1},"b":{"port":2}}}` | `{"ports":{"a":1,"b":2},"svc":{"a":{"port":1},"b":{"port":2}}}` | same |
| g2 | filter a list | `l: [1, 5, 3]` `big: filter($.l, above(2))` | `l: [1, 5, 3]` `big: [for x in l if x > 2 {x}]` | `{"big":[5,3],"l":[1,5,3]}` | `{"big":[5,3],"l":[1,5,3]}` | same |
| g3 | conditional field | `env: prod` `replicas?: match($.env, prod, 3, any)` | `env: "prod"` `if env == "prod" {replicas: 3}` | `{"env":"prod","replicas":3}` | `{"env":"prod","replicas":3}` | same |
| g4 | string building | `name: web` `image: "acme/" + $.name + ":1.0"` | `name: "web"` `image: "acme/\(name):1.0"` | `{"image":"acme/web:1.0","name":"web"}` | `{"image":"acme/web:1.0","name":"web"}` | same |
| g5 | number into a string | `port: 80` `url: "http://h:" + $.port` | `port: 80` `url: "http://h:\(port)"` | `{"port":80,"url":"http://h:80"}` | `{"port":80,"url":"http://h:80"}` | same |
| g6 | upper, split, join | `a: upper("ab")` `b: split("a,b", ",")` `c: join(["a", "b"], "-")` | `import "strings"` `a: strings.ToUpper("ab")` `b: strings.Split("a,b", ",")` `c: strings.Join(["a", "b"], "-")` | `{"a":"AB","b":["a","b"],"c":"a-b"}` | `{"a":"AB","b":["a","b"],"c":"a-b"}` | same |
| g7 | sum and sort | `a: sum([1, 2, 3])` `b: sort([3, 1, 2])` | `import "list"` `a: list.Sum([1, 2, 3])` `b: list.Sort([3, 1, 2], list.Ascending)` | `{"a":6,"b":[1,2,3]}` | `{"a":6,"b":[1,2,3]}` | same |
| g8 | regex replace | `a: rep("caaat", "a+", "x")` | `import "regexp"` `a: regexp.ReplaceAll("a+", "caaat", "x")` | `{"a":"cxt"}` | `{"a":"cxt"}` | same |
| g9 | names to keyed children | `names: [web, auth]` `deploy: pack($.names, {image: "acme/" + key()})` | `names: ["web", "auth"]` `deploy: {for n in names {(n): image: "acme/\(n)"}}` | `{"deploy":{"auth":{"image":"acme/auth"},"web":{"image":"acme/web"}},"names":["web","auth"]}` | `{"deploy":{"auth":{"image":"acme/auth"},"web":{"image":"acme/web"}},"names":["web","auth"]}` | same |
| g10 | map to list | `m: {b: 2, a: 1}` `l: each($.m, _)` | `m: {b: 2, a: 1}` `l: [for _, v in m {v}]` | `{"l":[1,2],"m":{"a":1,"b":2}}` | `{"l":[2,1],"m":{"a":1,"b":2}}` | same |
| g11 | computed key | `k: dyn` `m: pack([$.k], 1)` | `k: "dyn"` `m: {(k): 1}` | `{"k":"dyn","m":{"dyn":1}}` | `{"k":"dyn","m":{"dyn":1}}` | same |
| g12 | template names each child | `a: { &: { name: key() }, c: {}, d: {} }` | `a: { [N=_]: { name: N }, c: {}, d: {} }` | `{"a":{"c":{"name":"c"},"d":{"name":"d"}}}` | `{"a":{"c":{"name":"c"},"d":{"name":"d"}}}` | refused: old-style alias syntax (=) is not allowed as of language version v0.18.0; use postfix syntax (~X or ~(K,V)) |
| g13 | count and max | `l: [7, 8, 9]` `a: sum(each($.l, 1))` `b: greatest([1, 5, 3])` | `import "list"` `l: [7, 8, 9]` `a: len(l)` `b: list.Max([1, 5, 3])` | `{"a":3,"b":5,"l":[7,8,9]}` | `{"a":3,"b":5,"l":[7,8,9]}` | same |
| g14 | project a field to a list | `svc: {a: {port: 1}, b: {port: 2}}` `ports: pick($.svc, port)` | `svc: {a: {port: 1}, b: {port: 2}}` `ports: [for _, v in svc {v.port}]` | `{"ports":[1,2],"svc":{"a":{"port":1},"b":{"port":2}}}` | `{"ports":[1,2],"svc":{"a":{"port":1},"b":{"port":2}}}` | same |
| n1 | integer arithmetic past 2^53 | `a: 9007199254740992 + 1` | `a: 9007199254740992 + 1` | refused, `inexact_integer_sum` | `{"a":9007199254740993}` | same |
| n2 | integer arithmetic past 34 digits | `a: 0d12345678901234567890123456789012345678 + 1` `b: div(mul(0d12345678901234567890123456789012345678, 10), 10)` | `a: 12345678901234567890123456789012345678 + 1` `b: div(12345678901234567890123456789012345678 * 10, 10)` | `{"a":12345678901234567890123456789012345679,"b":12345678901234567890123456789012345678}` | `{"a":1.234567890123456789012345678901235E+37,"b":12345678901234567890123456789012350000}` | `{"a":12345678901234567890123456789012345679,"b":12345678901234567890123456789012345678}` |
| d11 | optional key with a default | `x?: *1 \| integer` `y: 2` | `x?: *1 \| int` `y: 2` | `{"x":1,"y":2}` | `{"y":2}` | same |
| u1 | discriminated union | `a: {kind: "a", x: integer} \| {kind: "b", y: string}` `a: {kind: "b", y: "s"}` | `a: {kind: "a", x: int} \| {kind: "b", y: string}` `a: {kind: "b", y: "s"}` | `{"a":{"kind":"b","y":"s"}}` | `{"a":{"kind":"b","y":"s"}}` | same |
| u2 | closed union refuses an extra key | `a: close({kind: "a", x: integer}) \| close({kind: "b", y: string})` `a: {kind: "b", y: "s", z: 1}` | `#A: {kind: "a", x: int} \| {kind: "b", y: string}` `a: #A & {kind: "b", y: "s", z: 1}` | refused, `empty` | refused: 2 errors in empty disjunction | same |
| o1 | output key order | `b: 1` `a: 2` | `b: 1` `a: 2` | `{"a":2,"b":1}` | `{"a":2,"b":1}` | same |
| m22 | required marker on a concrete schema value | `x: 1` | `x!: 1` | `{"x":1}` | refused: field is required but not present | same |
| m23 | required marker satisfied | `x: integer` `x: 1` | `x!: int` `x: 1` | `{"x":1}` | `{"x":1}` | same |
| x1 | optional input, with a fallback | `a: {x: 1}` `b: add(maybe($.a.x), 1)` `c: add(maybe($.a.y), 1) & *0` | `@experiment(try)` `a: {x: 1}` `try { b: a.x? + 1 }` `try { c: a.y? + 1 } else { c: 0 }` | `{"a":{"x":1},"b":2,"c":0}` | `{"a":{"x":1},"b":2,"c":0}` | same |
| x2 | if and else | `n: 3` `size: match($.n, min(2), big, small)` | `@experiment(try)` `n: 3` `if n >= 2 { size: "big" } else { size: "small" }` | `{"n":3,"size":"big"}` | `{"n":3,"size":"big"}` | same |
| x3 | a user-defined function | `x: apply(1, add(_, 10))` `y: apply(1, add(_, 2))` | `@experiment(functions)` `_add: func(a: int, b: int = 10) -> int: a + b` `x: _add(1)` `y: _add(1, 2)` | `{"x":11,"y":3}` | refused: parsing experiments for version "v0.17.1": unknown experiment "functions" | `{"x":11,"y":3}` |
| x4 | list literals met element by element | `y: [3]` `y: [any, 4]` | `@experiment(openlists)` `y: [3]` `y: [_, 4]` | `{"y":[3,4]}` | refused: parsing experiments for version "v0.17.1": unknown experiment "openlists" | `{"y":[3,4]}` |
| x5 | reopen a closed schema to extend it | `%A = close({x: integer})` `b: open(%A) & {x: 1, y: 2}` | `#A: {x: int}` `b: {#A..., x: 1, y: 2}` | `{"b":{"x":1,"y":2}}` | refused: postfix ... operator requires @experiment(explicitopen) | `{"b":{"x":1,"y":2}}` |
| x6 | a reference to the enclosing map | `a: {x: 1, y: .x}` | `a: {x: 1, y: self.x}` | `{"a":{"x":1,"y":1}}` | refused: predeclared identifier "self" requires @experiment(aliasv2) | `{"a":{"x":1,"y":1}}` |
| x7 | a pattern that names its key, postfix alias | `m: {&: {name: key()}}` `m: {c: {}, d: {}}` | `m: [string]~(K,_): {name: K}` `m: {c: {}, d: {}}` | `{"m":{"c":{"name":"c"},"d":{"name":"d"}}}` | refused: postfix alias syntax requires @experiment(aliasv2) | `{"m":{"c":{"name":"c"},"d":{"name":"d"}}}` |
| x8 | a field beside an embedded closed schema | `%A = close({x: *0 \| integer})` `b: %A & {y: 1}` | `#A: {x: *0 \| int}` `b: {#A, y: 1}` | refused, `closed` | `{"b":{"x":0,"y":1}}` | refused: field not allowed |
| x9 | struct equality | `e: match({x: 1}, {x: 1}, yes, no)` `f: match({x: 1, y: 2}, {x: 1}, yes, no)` | `e: {x: 1} == {x: 1}` `f: {x: 1, y: 2} == {x: 1}` | `{"e":"yes","f":"yes"}` | `{"e":true,"f":false}` | same |
| k1 | a new record from each record | `xs: [{name: web, host: h1, port: 80}, {name: db, host: h2, port: 5432}]` `out: emit($.xs, {match: any, body: [{name: .name, addr: .host + ":" + .port}]})` | `xs: [{name: "web", host: "h1", port: 80}, {name: "db", host: "h2", port: 5432}]` `out: [for x in xs {name: x.name, addr: "\(x.host):\(x.port)"}]` | `{"out":[{"addr":"h1:80","name":"web"},{"addr":"h2:5432","name":"db"}]}` | `{"out":[{"addr":"h1:80","name":"web"},{"addr":"h2:5432","name":"db"}]}` | same |
| k2 | filter on a bound, then project | `xs: [{name: web, host: h1, port: 80}, {name: db, host: h2, port: 5432}]` `out: pick(filter($.xs, {port: above(1000)}), name)` | `xs: [{name: "web", host: "h1", port: 80}, {name: "db", host: "h2", port: 5432}]` `out: [for x in xs if x.port > 1000 {x.name}]` | `{"out":["db"]}` | `{"out":["db"]}` | same |
| k3 | or, and, not in a condition | `xs: [{n: a, env: prod, tier: gold}, {n: b, env: dev, tier: gold}, {n: c, env: dev, tier: tin}]` `or: pick(filter($.xs, {env: prod} \| {tier: gold}), n)` `and: pick(filter($.xs, {env: dev, tier: gold}), n)` `not: pick(filter($.xs, {env: neq(prod)}), n)` | `xs: [{n: "a", env: "prod", tier: "gold"}, {n: "b", env: "dev", tier: "gold"}, {n: "c", env: "dev", tier: "tin"}]` `or: [for x in xs if x.env == "prod" \|\| x.tier == "gold" {x.n}]` `and: [for x in xs if x.env == "dev" && x.tier == "gold" {x.n}]` `not: [for x in xs if x.env != "prod" {x.n}]` | `{"and":["b"],"not":["b","c"],"or":["a","b"]}` | `{"and":["b"],"not":["b","c"],"or":["a","b"]}` | same |
| k4 | a condition that compares two fields of one member | `xs: [{a: 3, b: 1}, {a: 1, b: 2}]` `out: filter($.xs, {a: above(.b)})` | `xs: [{a: 3, b: 1}, {a: 1, b: 2}]` `out: [for x in xs if x.a > x.b {x}]` | `{"out":[]}` | `{"out":[{"a":3,"b":1}]}` | same |
| k5 | the same, through a derived field | `xs: [{a: 3, b: 1}, {a: 1, b: 2}]` `tmp: hide(each($.xs, _ & {d: sub(.a, .b)}))` `out: pick(filter($.tmp, {d: above(0)}), a)` | `xs: [{a: 3, b: 1}, {a: 1, b: 2}]` `out: [for x in xs if x.a > x.b {x.a}]` | `{"out":[3]}` | `{"out":[3]}` | same |
| k6 | flatten the lists the members hold | `svcs: [{name: web, ports: [80, 443]}, {name: db, ports: [5432]}]` `out: emit($.svcs, {match: any, body: [.ports]})` | `svcs: [{name: "web", ports: [80, 443]}, {name: "db", ports: [5432]}]` `out: [for s in svcs for p in s.ports {p}]` | `{"out":[80,443,5432]}` | `{"out":[80,443,5432]}` | same |
| k7 | an inner loop that reads the outer member | `svcs: [{name: web, ports: [80, 443]}, {name: db, ports: [5432]}]` `tmp: hide(each($.svcs, _ & {pairs: each(.ports, ..name + ":" + _)}))` `out: emit($.tmp, {match: any, body: [.pairs]})` | `svcs: [{name: "web", ports: [80, 443]}, {name: "db", ports: [5432]}]` `out: [for s in svcs for p in s.ports {"\(s.name):\(p)"}]` | `{"out":["web:80","web:443","db:5432"]}` | `{"out":["web:80","web:443","db:5432"]}` | same |
| k8 | every pair from two lists | `as: [a, b]` `bs: [x, y]` `tmp: hide(each($.as, {a: _, row: each($.bs, ..a + "-" + _)}))` `out: emit($.tmp, {match: any, body: [.row]})` | `as: ["a", "b"]` `bs: ["x", "y"]` `out: [for a in as for b in bs {"\(a)-\(b)"}]` | `{"out":["a-x","a-y","b-x","b-y"]}` | `{"out":["a-x","a-y","b-x","b-y"]}` | same |
| k9 | the members named in another list | `allowed: [web, cache]` `xs: [{name: web}, {name: db}, {name: cache}]` `tmp: hide(pack($.allowed, filter($.xs, {name: key(2)})))` `out: pick(emit($.tmp, {match: any, body: [_]}), name)` | `import "list"` `allowed: ["web", "cache"]` `xs: [{name: "web"}, {name: "db"}, {name: "cache"}]` `out: [for x in xs if list.Contains(allowed, x.name) {x.name}]` | `{"out":["cache","web"]}` | `{"out":["web","cache"]}` | same |
| k10 | a map keyed by a field of each member | `xs: [{name: web, host: h1, port: 80}, {name: db, host: h2, port: 5432}]` `out: pack(pick($.xs, name), sum(pick(filter($.xs, {name: key(2)}), port)))` | `xs: [{name: "web", host: "h1", port: 80}, {name: "db", host: "h2", port: 5432}]` `out: {for x in xs {(x.name): x.port}}` | `{"out":{"db":5432,"web":80}}` | `{"out":{"db":5432,"web":80}}` | same |
| k11 | the same, holding each whole record | `xs: [{name: web, port: 80}, {name: db, port: 5432}]` `out: pack(pick($.xs, name), {})` `links: hide(emit($.xs, {match: any, body: [relate(_) & path("$.out." + .name)]}))` | `xs: [{name: "web", port: 80}, {name: "db", port: 5432}]` `out: {for x in xs {(x.name): x}}` | `{"out":{"db":{"name":"db","port":5432},"web":{"name":"web","port":80}}}` | `{"out":{"db":{"name":"db","port":5432},"web":{"name":"web","port":80}}}` | same |
| k12 | group by a field | `xs: [{name: a, team: core}, {name: b, team: web}, {name: c, team: core}]` `out: pack(pick($.xs, team), pick(filter($.xs, {team: key(2)}), name))` | `xs: [{name: "a", team: "core"}, {name: "b", team: "web"}, {name: "c", team: "core"}]` `out: {for x in xs {(x.team): [for y in xs if y.team == x.team {y.name}]}}` | `{"out":{"core":["a","c"],"web":["b"]}}` | `{"out":{"core":["a","c"],"web":["b"]}}` | same |
| k13 | the same, with the key level miscounted | `xs: [{name: a, team: core}, {name: b, team: web}, {name: c, team: core}]` `out: pack(pick($.xs, team), pick(filter($.xs, {team: key(3)}), name))` | `xs: [{name: "a", team: "core"}, {name: "b", team: "web"}, {name: "c", team: "core"}]` `out: {for x in xs {(x.team): [for y in xs if y.team == x.team {y.name}]}}` | `{"out":{"core":[],"web":[]}}` | `{"out":{"core":["a","c"],"web":["b"]}}` | same |
| k14 | invert a map | `m: {a: x, b: y}` `st: hide(pack($.m, {k: key(), v: _}))` `out: pack(pick($.st, v), join(pick(filter($.st, {v: key(2)}), k)))` | `m: {a: "x", b: "y"}` `out: {for k, v in m {(v): k}}` | `{"out":{"x":"a","y":"b"}}` | `{"out":{"x":"a","y":"b"}}` | same |
| k15 | a prefix on every key | `m: {a: 1, b: 2}` `st: hide(pack($.m, {k: "svc-" + key(), v: _}))` `out: pack(pick($.st, k), sum(pick(filter($.st, {k: key(2)}), v)))` | `m: {a: 1, b: 2}` `out: {for k, v in m {"svc-\(k)": v}}` | `{"out":{"svc-a":1,"svc-b":2}}` | `{"out":{"svc-a":1,"svc-b":2}}` | same |
| k16 | a key built from two fields | `xs: [{ns: a, name: web, port: 80}, {ns: b, name: web, port: 81}]` `st: hide(each($.xs, _ & {id: .ns + "/" + .name}))` `out: pack(pick($.st, id), sum(pick(filter($.st, {id: key(2)}), port)))` | `xs: [{ns: "a", name: "web", port: 80}, {ns: "b", name: "web", port: 81}]` `out: {for x in xs {"\(x.ns)/\(x.name)": x.port}}` | `{"out":{"a/web":80,"b/web":81}}` | `{"out":{"a/web":80,"b/web":81}}` | same |
| k17 | every pair from two lists, keyed by both | `as: [a, b]` `bs: [x, y]` `tmp: hide(each($.as, {a: _, row: each($.bs, ..a + "-" + _)}))` `keys: hide(emit($.tmp, {match: any, body: [.row]}))` `out: pack($.keys, {parts: hide(split(key(), "-")), left: .parts.0, right: .parts.1})` | `as: ["a", "b"]` `bs: ["x", "y"]` `out: {for a in as for b in bs {"\(a)-\(b)": {left: a, right: b}}}` | `{"out":{"a-x":{"left":"a","right":"x"},"a-y":{"left":"a","right":"y"},"b-x":{"left":"b","right":"x"},"b-y":{"left":"b","right":"y"}}}` | `{"out":{"a-x":{"left":"a","right":"x"},"a-y":{"left":"a","right":"y"},"b-x":{"left":"b","right":"x"},"b-y":{"left":"b","right":"y"}}}` | same |
| k18 | one field of each member, keys kept, any kind | `svc: {a: {cfg: {x: 1}}, b: {cfg: {x: 2}}}` `out: pack($.svc, {})` `links: hide(emit(pack($.svc, _ & {id: key()}), {match: any, body: [relate(.cfg) & path("$.out." + .id)]}))` | `svc: {a: {cfg: {x: 1}}, b: {cfg: {x: 2}}}` `out: {for k, v in svc {(k): v.cfg}}` | `{"out":{"a":{"x":1},"b":{"x":2}}}` | `{"out":{"a":{"x":1},"b":{"x":2}}}` | same |
| k19 | look one field up by a field of the member | `teams: {core: {email: "core@x", tier: 1}, web: {email: "web@x", tier: 2}}` `svc: {a: {team: core}, b: {team: web}, c: {team: core}}` `tst: hide(pack($.teams, _ & {id: key()}))` `svc: &: {owner: join(pick(filter($.tst, {id: ...team}), email))}` `out: pack($.svc, join(pick([_], owner)))` | `teams: {core: {email: "core@x", tier: 1}, web: {email: "web@x", tier: 2}}` `svc: {a: {team: "core"}, b: {team: "web"}, c: {team: "core"}}` `out: {for k, s in svc {(k): teams[s.team].email}}` | `{"out":{"a":"core@x","b":"web@x","c":"core@x"}}` | `{"out":{"a":"core@x","b":"web@x","c":"core@x"}}` | same |
| k20 | look a whole record up by a field of the member | `teams: {core: {email: "core@x", tier: 1}, web: {email: "web@x", tier: 2}}` `svc: {a: {team: core}, b: {team: web}, c: {team: core}}` `sst: hide(pack($.svc, _ & {id: key()}))` `g: hide(pack($.teams, {rec: _, links: each(pick(filter($.sst, {team: key(3)}), id), relate({owner: ...rec}) & path("$.out." + _))}))` `out: pack($.svc, {})` | `teams: {core: {email: "core@x", tier: 1}, web: {email: "web@x", tier: 2}}` `svc: {a: {team: "core"}, b: {team: "web"}, c: {team: "core"}}` `out: {for k, s in svc {(k): owner: teams[s.team]}}` | `{"out":{"a":{"owner":{"email":"core@x","tier":1}},"b":{"owner":{"email":"web@x","tier":2}},"c":{"owner":{"email":"core@x","tier":1}}}}` | `{"out":{"a":{"owner":{"email":"core@x","tier":1}},"b":{"owner":{"email":"web@x","tier":2}},"c":{"owner":{"email":"core@x","tier":1}}}}` | same |
| k21 | pair two lists by position | `xs: [a, b]` `ys: [1, 2]` `yi: hide(each($.ys, {i: key(), y: _}))` `out: each($.xs, {k: _, y: sum(pick(filter($.yi, {i: key(3)}), y))})` | `xs: ["a", "b"]` `ys: [1, 2]` `out: [for i, x in xs {k: x, y: ys[i]}]` | `{"out":[{"k":"a","y":1},{"k":"b","y":2}]}` | `{"out":[{"k":"a","y":1},{"k":"b","y":2}]}` | same |
| k22 | a block of fields under a condition | `env: prod` `out: {name: web} & match($.env, prod, {replicas: 3, tier: gold}, {})` | `env: "prod"` `out: {name: "web", if env == "prod" {replicas: 3, tier: "gold"}}` | `{"out":{"name":"web","replicas":3,"tier":"gold"}}` | `{"out":{"name":"web","replicas":3,"tier":"gold"}}` | same |
| k23 | a list element under a condition | `debug: false` `out: [run, match($.debug, true, "--verbose", maybe($.none)), now]` | `debug: false` `out: ["run", if debug {"--verbose"}, "now"]` | `{"out":["run","now"]}` | `{"out":["run","now"]}` | same |
| k24 | a chain of conditions, first match wins | `n: 7` `out: match($.n, below(3), small, below(10), medium, large)` | `n: 7` `out: [if n < 3 {"small"}, if n >= 3 && n < 10 {"medium"}, if n >= 10 {"large"}][0]` | `{"out":"medium"}` | `{"out":"medium"}` | same |
| k25 | a field present or absent | `x: {opt: 1}` `y: {}` `out: [match($.x, {opt: any}, true, false), match($.y, {opt: any}, true, false)]` | `x: {opt: 1}` `y: {}` `out: [[if x.opt != _\|_ {true}, false][0], [if y.opt != _\|_ {true}, false][0]]` | `{"out":[true,false]}` | `{"out":[true,false]}` | same |
| k26 | a local value in the loop | `xs: [{a: 1}, {a: 2}, {a: 3}]` `tmp: hide(emit($.xs, {match: any, body: [{v: mul(.a, 2)}]}))` `out: filter($.tmp, {v: above(2)})` | `xs: [{a: 1}, {a: 2}, {a: 3}]` `out: [for x in xs let y = x.a * 2 if y > 2 {v: y}]` | `{"out":[{"v":4},{"v":6}]}` | `{"out":[{"v":4},{"v":6}]}` | same |
| k27 | a sum of products | `lines: [{qty: 2, price: 5}, {qty: 1, price: 7}]` `out: sum(emit($.lines, {match: any, body: [mul(.qty, .price)]}))` | `import "list"` `lines: [{qty: 2, price: 5}, {qty: 1, price: 7}]` `out: list.Sum([for l in lines {l.qty * l.price}])` | `{"out":17}` | `{"out":17}` | same |
| k28 | two lists end to end | `a: [1, 2]` `b: [3]` `out: $.a + $.b` | `a: [1, 2]` `b: [3]` `out: [for x in a {x}, for y in b {y}]` | `{"out":[1,2,3]}` | `{"out":[1,2,3]}` | same |
| k29 | the keys of a map as a list | `m: {b: 1, a: 2}` `out: each(pack($.m, key(0)), _)` | `m: {b: 1, a: 2}` `out: [for k, _ in m {k}]` | `{"out":["a","b"]}` | `{"out":["b","a"]}` | same |
| k30 | a loop over a number itself | `n: 3` `out: each($.n, "node-" + key())` | `import "list"` `n: 3` `out: [for i in list.Range(0, n, 1) {"node-\(i)"}]` | refused, `each_data` | `{"out":["node-0","node-1","node-2"]}` | same |
| k31 | a loop driven by a number, under a written bound | `n: 3` `out: each(filter([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], below($.n)), "node-" + _)` | `import "list"` `n: 3` `out: [for i in list.Range(0, n, 1) {"node-\(i)"}]` | `{"out":["node-0","node-1","node-2"]}` | `{"out":["node-0","node-1","node-2"]}` | same |
| k32 | the same, with the number past the written bound | `n: 12` `out: sum(each(filter([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], below($.n)), 1))` | `import "list"` `n: 12` `out: len([for i in list.Range(0, n, 1) {i}])` | `{"out":10}` | `{"out":12}` | same |
| k33 | the last member of twelve | `xs: [a, b, c, d, e, f, g, h, i, j, k, l]` `st: hide(each($.xs, {i: key(), v: _}))` `lp: hide("" + sub(sum(each($.xs, 1)), 1))` `out: join(pick(filter($.st, {i: $.lp}), v))` | `xs: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"]` `out: xs[len(xs)-1]` | `{"out":"l"}` | `{"out":"l"}` | same |
| k34 | a list reversed | `xs: [c, a, b]` `nums: hide(each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], {i: key(), n: _}))` `s1: hide(each($.xs, {v: _, n: sum(pick(filter($.nums, {i: key(3)}), n))}))` `out: pick(sort($.s1, n, desc), v)` | `import "list"` `xs: ["c", "a", "b"]` `out: list.Reverse(xs)` | `{"out":["b","a","c"]}` | `{"out":["b","a","c"]}` | same |
| k35 | a slice | `xs: [1, 2, 3, 4]` `nums: hide(each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], {i: key(), n: _}))` `s1: hide(each($.xs, {v: _, n: sum(pick(filter($.nums, {i: key(3)}), n))}))` `out: pick(filter($.s1, {n: min(1) & below(3)}), v)` | `xs: [1, 2, 3, 4]` `out: xs[1:3]` | `{"out":[2,3]}` | `{"out":[2,3]}` | same |
| k36 | each member against the one before it | `xs: [3, 5, 9]` `nums: hide(each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], {i: key(), n: _}))` `st: hide(each($.xs, {i: key(), v: _}))` `m: hide(pack(pick($.st, i), {v: sum(pick(filter($.st, {i: key(3)}), v)), n: sum(pick(filter($.nums, {i: key(3)}), n))}))` `m2: hide(each($.m, _ & {p: "" + sub(.n, 1)}))` `m3: hide(pack(pick($.m2, p), {prev: sum(pick(filter($.st, {i: key(3)}), v)), v: sum(pick(filter($.m2, {p: key(3)}), v)), n: sum(pick(filter($.m2, {p: key(3)}), n))}))` `out: emit(sort(filter($.m3, {n: above(0)}), n), {match: any, body: [sub(.v, .prev)]})` | `xs: [3, 5, 9]` `out: [for i, x in xs if i > 0 {x - xs[i-1]}]` | `{"out":[2,4]}` | `{"out":[2,4]}` | same |
| k37 | a field of the member in an each template | `xs: [{name: web}, {name: db}]` `out: each($.xs, {n: .name})` | `xs: [{name: "web"}, {name: "db"}]` `out: [for x in xs {n: x.name}]` | refused, `no_path` | `{"out":[{"n":"web"},{"n":"db"}]}` | same |
| k38 | a condition that reads a value elsewhere in the document | `limit: 2` `xs: [{a: 3}, {a: 1}]` `out: filter($.xs, {a: above($.limit)})` | `limit: 2` `xs: [{a: 3}, {a: 1}]` `out: [for x in xs if x.a > limit {x}]` | `{"out":[{"a":3}]}` | `{"out":[{"a":3}]}` | same |

## Sources

- CUE's language specification, from v0.17.1, at
  [cuelang.org/docs/reference/spec](https://cuelang.org/docs/reference/spec/),
  and the v0.18.0-rc.4 specification in that version's module source.
- CUE's experiments:
  [`cue help experiments`](https://cuelang.org/docs/reference/command/cue-help-experiments/)
  and the how-to pages for
  [aliasv2](https://cuelang.org/docs/howto/try-aliasv2-experiment/),
  [explicitopen](https://cuelang.org/docs/howto/try-explicitopen-experiment/),
  [structcmp](https://cuelang.org/docs/howto/try-structcmp-experiment/),
  [try](https://cuelang.org/docs/howto/try-try-experiment/) and
  [`else` comprehensions](https://cuelang.org/docs/howto/use-else-comprehensions/).
- [The CUE language version](https://cuelang.org/docs/concept/cue-language-version/),
  [upgrading from evalv2 to evalv3](https://cuelang.org/docs/concept/faq/upgrading-from-evalv2-to-evalv3/),
  [how CUE works with JSON Schema](https://cuelang.org/docs/concept/how-cue-works-with-json-schema/),
  [with OpenAPI](https://cuelang.org/docs/concept/how-cue-works-with-openapi/)
  and [with protocol buffers](https://cuelang.org/docs/concept/how-cue-works-with-protocol-buffers/),
  [the modules reference](https://cuelang.org/docs/reference/modules/),
  and [embedding files](https://cuelang.org/docs/howto/embed-files-in-cue-evaluation/).
- CUE's published versions and their dates, from the Go module proxy:
  [`cuelang.org/go/@v/list`](https://proxy.golang.org/cuelang.org/go/@v/list)
  and each version's `.info`.
- CUE's module sources for v0.17.1 and v0.18.0-rc.4 from the same proxy,
  with v0.10.0 to v0.16.0 to date when a feature arrived:
  `doc/ref/spec.md`, `internal/cueexperiment`, `cmd/cue/cmd`, `pkg/`,
  `encoding/` and `internal/filetypes`.
- The two CUE binaries, built with `go install cuelang.org/go/cmd/cue@v0.17.1`
  and `@v0.18.0-rc.4`, which answered every probe.
- aontu at `967c5f3`: both CLIs built from this commit, the
  [language reference](../docs/reference-language.md), the
  [API reference](../docs/reference-api.md), the
  [LSP page](../docs/lsp.md) and the
  [progress register](capability-review/progress.md).
- On 2026-11-20 the Central Registry, `registry.cue.works`, answered
  HTTP 200, and `pkg.aontu.dev` had no address.

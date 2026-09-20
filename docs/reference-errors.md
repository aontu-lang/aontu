# Errors reference

Every refusal the engine can make carries a **code**, and every code
carries a **class**. The code names the condition that was refused; the
class says what kind of thing went wrong, and so which repair applies.

This page is normative for the registry: every registered code, its
class, and the version it was first registered at. It is not normative
for the report a code arrives in, nor for the failures themselves.
[`aontu vet`](reference-api.md#aontu-vet) specifies the report: the
fields a finding carries, what a site names, and the `--format json`
object each verb answers. The language reference specifies each
construct where that construct belongs, and states what refuses it
there: see [Errors](reference-language.md#errors) for the message
families, [Exact or refused: lossy
literals](reference-language.md#exact-or-refused-lossy-literals) and
[The exactness budget](reference-language.md#the-exactness-budget) for
the numeric rules, and [Errors](reference-language.md#errors-1) under
[The constraint algebra](reference-language.md#the-constraint-algebra)
for a constraint violation.

[`aontu explain`](reference-api.md#aontu-explain) answers one code from
the same table a finding carries, and `aontu help codes` prints the
agent-facing card of the classes, which is shorter than the table below
and carries no counts.

## Contents

- [Classes](#classes)
- [Dynamic-prefix families](#dynamic-prefix-families)
- [The registry in a finding](#the-registry-in-a-finding)
- [Exit codes](#exit-codes)
- [The codes](#the-codes)
  - [Class `parse`](#class-parse)
  - [Class `conflict`](#class-conflict)
  - [Class `incomplete`](#class-incomplete)
  - [Class `reference`](#class-reference)
  - [Class `compat`](#class-compat)
  - [Class `budget`](#class-budget)
  - [Class `internal`](#class-internal)
- [Related](#related)

---

## Classes

There are seven classes, and the registry holds **168** codes across
them.

| class | codes | what went wrong |
|---|---|---|
| `parse` | 51 | the text is not a document |
| `conflict` | 55 | two values cannot both hold |
| `incomplete` | 11 | nothing contradicts, but the value is not concrete |
| `reference` | 26 | a name or path resolves to nothing |
| `compat` | 13 | a change breaks an earlier version |
| `budget` | 7 | evaluation hit a deterministic limit |
| `internal` | 6 | the engine reached a state it should not reach |

A class states which repair applies rather than where in the engine the
failure arose. [`aontu explain`](reference-api.md#aontu-explain) answers
one code with its class and the engine's own text for it.

Two `conflict` codes are reported after unification rather than by it:
`relation_cycle` and `relation_inverse_missing`, whose shape and timing
are under [`aontu relations`](reference-api.md#aontu-relations).

## Dynamic-prefix families

Five registry rows are prefixes rather than whole codes: `func:`,
`op:`, `op[`, `ref[`, and `var[`. The engine appends a name or a value,
so a reported code may be `func:upper` or `ref[$.x]`. The bare `func`,
`op`, `ref`, and `var` are separate rows with their own classes, and
are not the same codes as the families.

Class lookup takes the exact registry entry first, then the registered
prefix the code extends, and then `internal`, because an unregistered
code is an engine defect rather than a user error. Hint lookup has no
such fallback. It is exact, so a finding whose code extends a family
carries no hint text although the prefix row has some, and
[`aontu explain`](reference-api.md#aontu-explain) is the only place a
prefix's text is answered. `func:upper` is not a registry row, and
resolves through `func:`:

<!-- test: run -->
```sh
$ aontu explain func:upper
code:  func:upper
class: conflict

Function error:
```

Both the class and the text are the prefix's. A finding carrying that
code would take the class and carry no `hint` key.

## The registry in a finding

Three of a finding's fields are read from the registry, and each
carries a qualification the registry alone does not show.

**Class.** A finding's `class` is the registered class, on every
surface that reports one. A finding that mints its own code takes the
class that code is registered with; a finding that repeats a code the
engine raised takes the class from the same row, never one of its own.
`message` is the code's one-line headline throughout; the wording of
that line is each implementation's own, since the shared suite holds
codes and classes rather than prose.

**Hint text.** All 168 codes have hint text. `aontu explain --list`
prints them one per line, with each code's class beside it; a code
carrying no text would be marked `(no text)`, and none is. A finding
carries that text under `hint` when it repeats a code the engine
raised and the run asked for `--format json`:
[`vet`](reference-api.md#aontu-vet),
[`allow`](reference-api.md#aontu-allow),
[`model get`](reference-api.md#aontu-model-get),
[`model why`](reference-api.md#aontu-model-why),
[`view`](reference-api.md#aontu-view),
the library's `diff`
([TypeScript](reference-api.md#typescript-api), and no CLI verb of its
own), and the [MCP tools](reference-api.md#the-mcp-server). A finding
the report mints for itself carries its own message and no `hint`, and
so does the bare command that evaluates a document. No text format
prints hint text at all:
[`aontu explain`](reference-api.md#aontu-explain) is the verb that
answers one code's.

**Severity.** The field's domain is `error`, `warning`, and `info`, and
nothing in either implementation reports `info`. Five codes are always
reported at `warning`: `deprecated`, `pref_not_instance`,
`patch_not_editable`, `patch_ambiguous`, and `patch_span_mismatch`.
Under [`aontu breaking`](reference-api.md#aontu-breaking) with
`--allow-deprecated-removal`, any error finding at a path the prior
version marked with
[`deprecate`](reference-language.md#deprecatev-any-r-map--any) is
reported at `warning` instead, so a `compat` code otherwise reported at
`error` arrives at `warning` there.

Class `incomplete` is the only class a verdict rule reads. Under `vet`
a schema that does not stand up on its own is verdict `error` whatever
the finding's class; otherwise any error outside class `incomplete`
makes the verdict `invalid`, errors only of class `incomplete` make it
`incomplete` unless `--partial` was passed, and a `warning` never moves
it.

## Exit codes

A code's class does not determine the exit code. `scalar_value`, class
`conflict`, exits 1 where the contradiction is between schema and data,
and 4 where it is inside the schema. Which values a verb answers, and
what each one means for that verb, is in the API reference beside that
verb's option list. [`aontu vet`](reference-api.md#aontu-vet),
[`aontu subsume`](reference-api.md#aontu-subsume),
[`aontu breaking`](reference-api.md#aontu-breaking),
[`aontu view`](reference-api.md#aontu-view),
[`aontu model set`](reference-api.md#aontu-model-set), and
[`aontu fmt`](reference-api.md#aontu-fmt) each state their own table.

`aontu view` is the one verb whose refusals split across two exits.
Nine `view_*` codes are usage rather than the document's fault and exit
2: `view_kind_unknown`, `view_profile_unknown`, `view_rows_exceeded`,
`view_at_required`, `view_sets_required`, `view_group_required`,
`view_document_shape`, `view_style_profile`, and `view_style_unknown`.
A view kind that names no kind at all is caught while the arguments are
being read, so it exits 2 with no report at all.

## The codes

The registry is [`test/spec/errcodes.tsv`](../test/spec/errcodes.tsv),
which both implementations run as part of the shared suite; the parity
it holds them to is stated under
[`aontu explain`](reference-api.md#aontu-explain).

The tables below are that file, one section per class, alphabetical
within each. A `since` column is the version line at which the code was
first registered, and `0.51.0` is the registry's own inception version,
so every code older than the registry carries it. Codes are
append-only: a registered code is never renamed or reused, so a row
stays registered after the condition it named stops arising. The
parenthetical link on a row is the section that specifies the refusal;
twenty rows have no such section and carry no link.

### Class `parse`

| code | since | raised when |
|---|---|---|
| `abnf_grammar` | 0.63.0 | The grammar could not be compiled; `abnf()` takes RFC 5234 ABNF, with `=` and `/` rather than `::=`. ([Grammars: `abnf()` and `parse()`](reference-language.md#grammars-abnf-and-parse)) |
| `alias_colon` | 0.58.0 | Reserved for the former rejection of alias keys; `%name: value` now creates a field and declares its alias. ([Aliases `%`](reference-language.md#aliases-)) |
| `alias_in_path` | 0.53.0 | An alias name used as a segment of a path. ([Aliases `%`](reference-language.md#aliases-)) |
| `alias_not_toplevel` | 0.53.0 | An alias declaration has no map root, or a key declaration sits below it. ([Aliases `%`](reference-language.md#aliases-)) |
| `bare_punct` | 0.58.0 | A bare string holding a character outside letters, digits, `-`, and `_`. ([Errors](reference-language.md#errors)) |
| `decimal_syntax` | 0.51.0 | A `0d` literal that is not a valid exact number. ([The four numeric leaves](reference-language.md#the-four-numeric-leaves)) |
| `each_data` | 0.53.0 | The first argument to `each()` is not a bag, so it has no children to make elements from. ([Generating children: `pack` and `each`](reference-language.md#generating-children-pack-and-each)) |
| `elided_value` | 0.53.0 | A key, element, or spread with no value. ([Errors](reference-language.md#errors)) |
| `emit_body` | 0.57.0 | A template body in an `emit()` table is not a list. ([Transforming: `emit`](reference-language.md#transforming-emit)) |
| `emit_data` | 0.57.0 | The first argument to `emit()` is not a bag, so the selection has no children to visit. ([Transforming: `emit`](reference-language.md#transforming-emit)) |
| `emit_table` | 0.57.0 | The second argument to `emit()` is not a rule table. ([Transforming: `emit`](reference-language.md#transforming-emit)) |
| `emit_template` | 0.57.0 | A template in an `emit()` table is not a rule naming both `match` and `body`. ([Transforming: `emit`](reference-language.md#transforming-emit)) |
| `esc_variant` | 0.57.0 | `esc()`, `usc()`, or a template's `esc:` key was given a variant naming no convention. ([`esc(s, variant?)` and `usc(s, variant?)`](reference-language.md#escs-variant-and-uscs-variant)) |
| `export_arg` | 0.69.0 | `export()` was given something other than a set of alias names. ([Publishing a name: `export`](reference-language.md#publishing-a-name-export)) |
| `filter_data` | 0.53.0 | The first argument to `filter()` is not a bag. ([Selecting: `filter` and `match`](reference-language.md#selecting-filter-and-match)) |
| `form_data` | 0.58.0 | The first argument to the list generator `form` is not a bag; `form` was renamed `each`, which answers `each_data`. |
| `func_arity` | 0.53.0 | A call whose argument count is not the built-in's arity. ([Errors](reference-language.md#errors)) |
| `include_denied` | 0.53.0 | An `@"..."` include refused by the active trust profile. ([Clause 1: hermeticity](trust.md#clause-1-hermeticity)) |
| `include_extension` | 0.54.0 | An `@"..."` include naming a file whose extension the include table does not know. ([Source loading `@"…"`](reference-language.md#source-loading-)) |
| `incomplete_expression` | 0.51.0 | An expression missing a term, grouping parentheses with nothing inside included. ([The `+` operator and grouping](reference-language.md#the--operator-and-grouping)) |
| `inverse_name` | 0.53.0 | The argument to `inverse()` is not a relation name. ([Declared relations](reference-language.md#declared-relations)) |
| `merge_conflict` | 0.53.0 | A version-control conflict marker left in the source. ([Errors](reference-language.md#errors)) |
| `module_integrity` | 0.53.0 | A module resolved locally does not carry the meaning its canon-hash pin recorded. ([Modules](reference-language.md#modules)) |
| `module_local` | 0.65.0 | A bare module reference whose last segment carries an extension the include table knows. ([Modules](reference-language.md#modules)) |
| `module_missing` | 0.53.0 | A module import naming a package that is not in the project's local stores. ([Modules](reference-language.md#modules)) |
| `module_moved` | 0.65.0 | A later version of the imported package declares a new path. ([Modules](reference-language.md#modules)) |
| `module_path` | 0.54.0 | A domain-shaped module import whose path cannot be a directory on every platform the toolchain runs on. ([Modules](reference-language.md#modules)) |
| `negative` | 0.51.0 | Unary minus applied to a non-numeric operand. ([The four numeric leaves](reference-language.md#the-four-numeric-leaves)) |
| `not_number` | 0.51.0 | A numeric literal that reads as a non-finite value. ([The four numeric leaves](reference-language.md#the-four-numeric-leaves)) |
| `pack_data` | 0.53.0 | The first argument to `pack()` is not a bag. ([Generating children: `pack` and `each`](reference-language.md#generating-children-pack-and-each)) |
| `pack_key` | 0.53.0 | A list packed by `pack()` holds an element that is not a string. ([Generating children: `pack` and `each`](reference-language.md#generating-children-pack-and-each)) |
| `parse` | 0.51.0 | The outer wrapper for a source that could not be turned into a document; the inner error carries the code that explains it. |
| `parse_arg` | 0.63.0 | `parse()` was given something other than a grammar string and a text string. ([Grammars: `abnf()` and `parse()`](reference-language.md#grammars-abnf-and-parse)) |
| `parse_bad_src` | 0.51.0 | The source handed in for parsing is not a non-empty string. |
| `parse_unknown` | 0.51.0 | A parsed node of a kind the value builder has no case for. |
| `patch_assignment` | 0.53.0 | A `set` argument that is not `<path>=<value>`. ([`aontu model set`](reference-api.md#aontu-model-set)) |
| `path_address` | 0.54.0 | `path()` was given text that is not a tree address. ([First-class paths: `path(p?)`](reference-language.md#first-class-paths-pathp)) |
| `pref_implicit_bag` | 0.53.0 | A preference mark written on a bare key rather than on a value. ([Preference / default `*`](reference-language.md#preference--default-)) |
| `refer_address` | 0.53.0 | `refer()` was given something that is not a path value. ([Addresses](reference-language.md#addresses)) |
| `rel_address` | 0.53.0 | A `rel()` field holds something other than path values. ([Declared relations](reference-language.md#declared-relations)) |
| `render_path` | 0.58.0 | A unit path that is not relative, below the output directory, and distinct from every other unit's. ([What `aontu render` writes](reference-generation.md#what-aontu-render-writes)) |
| `render_profile` | 0.58.0 | A declaration needing a lowering, under a profile whose language has none. ([What `aontu render` writes](reference-generation.md#what-aontu-render-writes)) |
| `rep_pattern` | 0.57.0 | The pattern given to `rep()` is outside the portable subset `re()` takes. ([`rep(s, pattern, sub)`](reference-language.md#reps-pattern-sub)) |
| `rep_sub` | 0.57.0 | The substitution given to `rep()` names a group the pattern does not have. ([`rep(s, pattern, sub)`](reference-language.md#reps-pattern-sub)) |
| `replace_overlap` | 0.58.0 | Two keys of a template's `replace` map overlap, one inside the other. ([Replacing text in a body: `replace` and `esc`](reference-language.md#replacing-text-in-a-body-replace-and-esc)) |
| `replace_unused` | 0.58.0 | A key of a template's `replace` map appears in none of the body's literal lines. ([Replacing text in a body: `replace` and `esc`](reference-language.md#replacing-text-in-a-body-replace-and-esc)) |
| `reserved_key` | 0.69.0 | A source key beginning with the engine's reserved `\u0000aontu_` prefix, where the parser keeps a document's marks. ([Errors](reference-language.md#errors)) |
| `sort_dir` | 0.63.0 | A sort direction other than `asc` or `desc`. ([Ordering: `sort`](reference-language.md#ordering-sort)) |
| `split_sep` | 0.57.0 | The separator given to `split()` is neither a string nor a pattern. ([Text: `esc` `usc` `rep` `split`](reference-language.md#text-esc-usc-rep-split)) |
| `syntax` | 0.51.0 | The parser refused the source text; the message is the parser's own, with the operator-character hint appended. ([Lexical structure](reference-language.md#lexical-structure)) |
| `unify_no_src` | 0.51.0 | No source was handed in for unification. |
| `usc_malformed` | 0.57.0 | `usc()` was given text the named convention could not have produced. ([`esc(s, variant?)` and `usc(s, variant?)`](reference-language.md#escs-variant-and-uscs-variant)) |
| `view_line_break` | 0.54.0 | A label the figure would draw holds a line terminator. ([`aontu view`](reference-api.md#aontu-view)) |

### Class `conflict`

| code | since | raised when |
|---|---|---|
| `aggregate_data` | 0.53.0 | An aggregate was given something other than a bag to fold. ([Aggregating: `sum` `least` `greatest`](reference-language.md#aggregating-sum-least-greatest)) |
| `aggregate_empty` | 0.53.0 | `least` or `greatest` given an empty bag. ([Aggregating: `sum` `least` `greatest`](reference-language.md#aggregating-sum-least-greatest)) |
| `arg` | 0.51.0 | A required argument is missing. |
| `close` | 0.51.0 | The structure could not be closed. ([Closed values: `close` / `open`](reference-language.md#closed-values-close--open)) |
| `closed` | 0.51.0 | A key or element added to a closed map or list. ([Errors](reference-language.md#errors)) |
| `constraint` | 0.52.0 | The value does not satisfy the normalised residual the constraint reduced to. ([The constraint algebra](reference-language.md#the-constraint-algebra)) |
| `constraint_pattern` | 0.53.0 | An `re()` pattern outside the supported subset. ([The constraint algebra](reference-language.md#the-constraint-algebra)) |
| `decimal_budget` | 0.51.0 | An exact decimal past 4096 coefficient digits or an absolute scale of 4096. ([The exactness budget](reference-language.md#the-exactness-budget)) |
| `divide_by_zero` | 0.53.0 | `div`, `mod`, or `rem` given a zero divisor. ([Arithmetic: `add` `sub` `mul` `div` `mod` `rem`](reference-language.md#arithmetic-add-sub-mul-div-mod-rem)) |
| `emit_none` | 0.57.0 | No template matched a node, and the table has no catch-all. ([Transforming: `emit`](reference-language.md#transforming-emit)) |
| `emit_ref` | 0.57.0 | A template body names a field the node it matched does not carry. ([Transforming: `emit`](reference-language.md#transforming-emit)) |
| `empty` | 0.54.0 | A disjunction with no admitted alternative. ([Preference / default `*`](reference-language.md#preference--default-)) |
| `empty-dist` | 0.54.0 | Every alternative of a distributed disjunction is refused. ([Disjunction `|`](reference-language.md#disjunction-)) |
| `exact_float_mix` | 0.51.0 | An exact number combined with a binary float. ([The four numeric leaves](reference-language.md#the-four-numeric-leaves)) |
| `float_overflow` | 0.53.0 | A result that is not a finite binary64 number. ([Arithmetic: `add` `sub` `mul` `div` `mod` `rem`](reference-language.md#arithmetic-add-sub-mul-div-mod-rem)) |
| `func` | 0.51.0 | A function operation failed; the named function carries the detail. ([How a call is checked](reference-functions.md#how-a-call-is-checked)) |
| `func:` | 0.51.0 | Dynamic-prefix family: a named function's own failure, the name appended (`func:upper`). |
| `func_arg` | 0.55.0 | An argument does not fit the function's signature. ([How a call is checked](reference-functions.md#how-a-call-is-checked)) |
| `inexact_divide` | 0.53.0 | An exact decimal operand given to `div`, `mod`, or `rem`; exact decimal division is not closed, so it is refused rather than rounded, while a `0d` biginteger divides. ([Arithmetic: `add` `sub` `mul` `div` `mod` `rem`](reference-language.md#arithmetic-add-sub-mul-div-mod-rem)) |
| `inexact_integer_sum` | 0.51.0 | An `integer` result outside the integral, int64, exactly representable range. ([Arithmetic: `add` `sub` `mul` `div` `mod` `rem`](reference-language.md#arithmetic-add-sub-mul-div-mod-rem)) |
| `invalid-arg` | 0.51.0 | An argument does not match the expected type or format. |
| `join_member` | 0.54.0 | A member of the bag `join()` folds is not text and never will be. ([Folding to a string: `join`](reference-language.md#folding-to-a-string-join)) |
| `key_level` | 0.51.0 | The argument to `key()` is not a level. ([How a call is checked](reference-functions.md#how-a-call-is-checked)) |
| `list` | 0.51.0 | A list was expected and the value is of another kind. ([Container kinds: `map()` and `list()`](reference-language.md#container-kinds-map-and-list)) |
| `list_length` | 0.53.0 | A literal list alternative admits only a list of its own length; a spread makes it take any length. ([Lists](reference-language.md#lists)) |
| `literal_nil` | 0.51.0 | A literal nil met another value. ([The value lattice](reference-language.md#the-value-lattice)) |
| `lossy_integer_literal` | 0.51.0 | An integer literal not exactly representable in binary64; the hint names the `0d` spelling. ([Exact or refused: lossy literals](reference-language.md#exact-or-refused-lossy-literals)) |
| `make` | 0.51.0 | A value could not be constructed. |
| `map` | 0.51.0 | A map was expected and the value is of another kind. ([Container kinds: `map()` and `list()`](reference-language.md#container-kinds-map-and-list)) |
| `match_none` | 0.53.0 | No pattern matched, and `match` has no default. ([Selecting: `filter` and `match`](reference-language.md#selecting-filter-and-match)) |
| `must` | 0.53.0 | The value fails an evaluate-only check written with `must()`; the author's message rides on the finding. ([Band B: `must`](reference-language.md#band-b-must)) |
| `nil_gen` | 0.51.0 | A nil survived unification, and nil is not a literal value to generate. ([Generation](reference-language.md#generation)) |
| `no_first_arg` | 0.51.0 | The function's first argument is missing. |
| `no_scalar_unify` | 0.51.0 | Two scalar values of incompatible types. ([Unification rules](reference-language.md#unification-rules)) |
| `not-scalar-type` | 0.51.0 | A scalar type was expected and the value is not one. ([Unification rules](reference-language.md#unification-rules)) |
| `op` | 0.51.0 | An operator operation failed; the named operator carries the detail. |
| `op:` | 0.51.0 | Dynamic-prefix family: a named operator's own failure, the name appended (`op:add`). |
| `op[` | 0.51.0 | Dynamic-prefix family: an operator failure carrying the offending value (`op[1]`). |
| `operate` | 0.51.0 | The operation could not be performed over the values given. |
| `parse_failed` | 0.63.0 | The text does not parse under the grammar given, so the field is refused. ([Grammars: `abnf()` and `parse()`](reference-language.md#grammars-abnf-and-parse)) |
| `pick_key` | 0.53.0 | A child of the bag has no key for `pick` to project. ([Missing fields and invalid arguments](reference-language.md#missing-fields-and-invalid-arguments)) |
| `place_pair` | 0.53.0 | Two placeholders met, and neither has a value to fill the other. ([The placeholder `_`](reference-language.md#the-placeholder-_)) |
| `pref_rank_clash` | 0.54.0 | Two defaults of the same rank disagree. ([Preference / default `*`](reference-language.md#preference--default-)) |
| `relation_cycle` | 0.53.0 | A relation declared `acyclic()`, and its edges form a cycle. ([Declared relations](reference-language.md#declared-relations)) |
| `relation_inverse_missing` | 0.53.0 | A relation declared `inverse(name)`, and an edge has no mirroring edge. ([Declared relations](reference-language.md#declared-relations)) |
| `render_lang` | 0.58.0 | A text escape carrying verbatim syntax of a language other than the unit's. ([What `aontu render` writes](reference-generation.md#what-aontu-render-writes)) |
| `render_strict` | 0.58.0 | An opaque escape, which the renderer cannot check, under strict rendering. ([What `aontu render` writes](reference-generation.md#what-aontu-render-writes)) |
| `replace_value` | 0.58.0 | A replacement value is not text by the time the dispatch fires. ([Replacing text in a body: `replace` and `esc`](reference-language.md#replacing-text-in-a-body-replace-and-esc)) |
| `resolve` | 0.51.0 | The value could not be resolved. |
| `scalar-type` | 0.51.0 | Two scalar kinds where neither contains the other. ([Unification rules](reference-language.md#unification-rules)) |
| `scalar_kind` | 0.51.0 | Two literal scalars of different kinds. ([Unification rules](reference-language.md#unification-rules)) |
| `scalar_value` | 0.51.0 | Two literal scalars of the same kind that are not equal. ([Unification rules](reference-language.md#unification-rules)) |
| `sort_domain` | 0.63.0 | A bag with no order to be put in. ([Ordering: `sort`](reference-language.md#ordering-sort)) |
| `sort_key` | 0.63.0 | A child of the bag has no key to order by. ([Ordering: `sort`](reference-language.md#ordering-sort)) |
| `unite` | 0.51.0 | Two values could not be united. |

### Class `incomplete`

| code | since | raised when |
|---|---|---|
| `conjunct` | 0.51.0 | A conjunction has a term that could not be resolved. ([Conjunction `&`](reference-language.md#conjunction-)) |
| `disjunct_no_gen` | 0.53.0 | More than one alternative is still admitted, so there is no single value to generate. ([Disjunction `|`](reference-language.md#disjunction-)) |
| `listval_no_gen` | 0.51.0 | A list element survived unification as something other than a literal value. ([Generation](reference-language.md#generation)) |
| `listval_required` | 0.51.0 | A required list element has no value. ([Optional keys `?`](reference-language.md#optional-keys-)) |
| `listval_spread_required` | 0.51.0 | A key a spread requires has no value, in a list. ([Spreads `&:`](reference-language.md#spreads-)) |
| `mapval_no_gen` | 0.51.0 | A map value survived unification as something other than a literal value. ([Optional input: `maybe`](reference-language.md#optional-input-maybe)) |
| `mapval_required` | 0.51.0 | A required map value has no value. ([Optional keys `?`](reference-language.md#optional-keys-)) |
| `mapval_spread_required` | 0.51.0 | A key a spread requires has no value, in a map. ([Spreads `&:`](reference-language.md#spreads-)) |
| `no_gen` | 0.51.0 | A value survived unification as something other than a literal value. ([Generation](reference-language.md#generation)) |
| `recursion_unexpanded` | 0.53.0 | A schema refers to itself, and no data reached the position to expand it against. ([Recursive references (fixpoints)](reference-language.md#recursive-references-fixpoints)) |
| `required_listelem` | 0.51.0 | A non-optional list element has no value. ([Optional keys `?`](reference-language.md#optional-keys-)) |

### Class `reference`

| code | since | raised when |
|---|---|---|
| `import_not_exported` | 0.69.0 | A destructure asked for a name the other file does not publish. ([Taking a name: the destructure](reference-language.md#taking-a-name-the-destructure)) |
| `invalid_var_kind` | 0.51.0 | A variable's kind is not the kind the use expects. ([Variables `$name`](reference-language.md#variables-name)) |
| `multisource_not_found` | 0.51.0 | An `aontu:` name that is not one of the language-supplied models; the message names the set. ([The `aontu:` models](reference-language.md#the-aontu-models)) |
| `no_path` | 0.51.0 | A path reference resolves to nothing. ([Optional input: `maybe`](reference-language.md#optional-input-maybe)) |
| `patch_ambiguous` | 0.53.0 | Two or more statements pin the path, so an in-place edit has no single place to write. ([`aontu model set`](reference-api.md#aontu-model-set)) |
| `patch_not_editable` | 0.53.0 | An in-place edit found no single literal to rewrite, so the assignment was appended. ([`aontu model set`](reference-api.md#aontu-model-set)) |
| `path_cycle` | 0.51.0 | A path reference closes a cycle. ([Recursive references (fixpoints)](reference-language.md#recursive-references-fixpoints)) |
| `ref` | 0.51.0 | A reference could not be resolved to a value. ([References and paths](reference-language.md#references-and-paths)) |
| `ref[` | 0.51.0 | Dynamic-prefix family: a reference failure carrying the address (`ref[$.x]`). ([References and paths](reference-language.md#references-and-paths)) |
| `refer_unresolved` | 0.53.0 | A `refer()` address names no node in this evaluation. ([Existence is decided, not deferred](reference-language.md#existence-is-decided-not-deferred)) |
| `rel_unresolved` | 0.53.0 | A `rel()` address names no node in this evaluation. ([Declared relations](reference-language.md#declared-relations)) |
| `render_unit` | 0.58.0 | The unit asked for is not in the instance. ([What `aontu render` writes](reference-generation.md#what-aontu-render-writes)) |
| `unknown_function` | 0.51.0 | A function name that resolves to no built-in. ([How a call is checked](reference-functions.md#how-a-call-is-checked)) |
| `unknown_var` | 0.51.0 | A variable that has not been defined. ([Variables `$name`](reference-language.md#variables-name)) |
| `var` | 0.51.0 | An unresolved variable reached generation. ([Variables `$name`](reference-language.md#variables-name)) |
| `var[` | 0.51.0 | Dynamic-prefix family: a variable failure carrying the name (`var[$x]`). ([Variables `$name`](reference-language.md#variables-name)) |
| `view_at_required` | 0.54.0 | The meet ladder draws the contributions at one path, and none was named. ([`aontu view`](reference-api.md#aontu-view)) |
| `view_document_shape` | 0.54.0 | A figure in a view document does not name both its `kind` and its `out` file. ([`aontu view`](reference-api.md#aontu-view)) |
| `view_group_required` | 0.54.0 | The layer diagram bands nodes by a field, and none was named. ([`aontu view`](reference-api.md#aontu-view)) |
| `view_kind_unknown` | 0.54.0 | The figure kind is not one the verb draws; the note lists the kinds. ([`aontu view`](reference-api.md#aontu-view)) |
| `view_profile_unknown` | 0.54.0 | The figure kind does not render into the profile asked for. ([`aontu view`](reference-api.md#aontu-view)) |
| `view_relation_ambiguous` | 0.54.0 | The document has edges under several relations, and the figure draws one. ([`aontu view`](reference-api.md#aontu-view)) |
| `view_relation_unknown` | 0.54.0 | The relation named to the view has no edges in this document. ([`aontu view`](reference-api.md#aontu-view)) |
| `view_sets_required` | 0.54.0 | The set panel needs both the sets map and the member field, and one was missing. ([`aontu view`](reference-api.md#aontu-view)) |
| `view_sets_shape` | 0.54.0 | The sets map or the universe does not have the shape the set panel reads. ([`aontu view`](reference-api.md#aontu-view)) |
| `view_style_profile` | 0.55.0 | The style asked for is not the one that profile carries. ([`aontu view`](reference-api.md#aontu-view)) |
| `view_style_unknown` | 0.55.0 | A style other than `none`, `ansi`, `css`, or the command line's `auto`. ([`aontu view`](reference-api.md#aontu-view)) |

### Class `compat`

| code | since | raised when |
|---|---|---|
| `compat_default_changed` | 0.53.0 | The effective default changed, so a document generable before materialises differently or becomes incomplete. ([Profiles](reference-language.md#profiles)) |
| `compat_marks_changed` | 0.53.0 | The marks on the two values differ. ([Maps, lists, closedness, optionality, spreads](reference-language.md#maps-lists-closedness-optionality-spreads)) |
| `compat_narrowed` | 0.53.0 | The specific value admits something the general does not; the message names which comparison failed. ([Rules, by value former](reference-language.md#rules-by-value-former)) |
| `compat_outcome_changed` | 0.65.0 | A position both versions resolve with nothing supplied, to different values. ([`aontu publish`](reference-api.md#aontu-publish)) |
| `compat_required_added` | 0.53.0 | The general value requires a key the specific omits or makes optional. ([Maps, lists, closedness, optionality, spreads](reference-language.md#maps-lists-closedness-optionality-spreads)) |
| `compat_undetermined` | 0.65.0 | A position the prior version resolved with nothing supplied, and nothing resolves now. ([`aontu publish`](reference-api.md#aontu-publish)) |
| `deprecated` | 0.53.0 | A use of a value carrying a `deprecate` mark. ([`deprecate(v: any, r?: map) : any`](reference-language.md#deprecatev-any-r-map--any)) |
| `pref_not_instance` | 0.53.0 | A disjunction's effective default is not an instance of any remaining alternative. ([Default validity](reference-language.md#default-validity)) |
| `sub_default_indeterminate` | 0.53.0 | Equal-rank preferences disagree, so the effective default is not a single value. ([Profiles](reference-language.md#profiles)) |
| `sub_disjunct_distribution` | 0.53.0 | A specific alternative is not admitted member-wise, and no concrete counterexample settles the distribution case. ([Rules, by value former](reference-language.md#rules-by-value-former)) |
| `sub_evaluate_only` | 0.53.0 | An evaluate-only check makes the admitted set opaque. ([Rules, by value former](reference-language.md#rules-by-value-former)) |
| `sub_path_dependent_spread` | 0.53.0 | A path-dependent spread template cannot be compared structurally. ([Maps, lists, closedness, optionality, spreads](reference-language.md#maps-lists-closedness-optionality-spreads)) |
| `sub_unresolved` | 0.53.0 | Unresolved residue, or no subsumption rule covers the pair of value formers. ([Rules, by value former](reference-language.md#rules-by-value-former)) |

### Class `budget`

| code | since | raised when |
|---|---|---|
| `alias_budget` | 0.69.0 | Alias expansion counted past the size budget before evaluation; expansion terminates whatever the budget, so this is about size. ([Aliases `%`](reference-language.md#aliases-)) |
| `budget_passes` | 0.52.0 | The fixpoint pass budget was spent before the model converged; the hint names what was still refining. ([Cross-field bounds and residuation](reference-language.md#cross-field-bounds-and-residuation)) |
| `max_depth` | 0.51.0 | Input nested deeper than the engine processes. ([Clause 2: termination](trust.md#clause-2-termination)) |
| `module_depth` | 0.53.0 | Module verification nested past its depth, usually a vendor tree leading back to itself. ([Modules](reference-language.md#modules)) |
| `recursion_budget` | 0.53.0 | A recursive schema expanded past the depth budget without meeting concrete data. ([Recursive references (fixpoints)](reference-language.md#recursive-references-fixpoints)) |
| `unify_cycle` | 0.51.0 | A circular reference reached during unification. ([Clause 2: termination](trust.md#clause-2-termination)) |
| `view_rows_exceeded` | 0.54.0 | The figure has more rows than the row cap allows; the figure is refused rather than trimmed. ([`aontu view`](reference-api.md#aontu-view)) |

### Class `internal`

| code | since | raised when |
|---|---|---|
| `format_check` | 0.56.0 | The formatted text is not the same document, so nothing was written. ([`aontu fmt`](reference-api.md#aontu-fmt)) |
| `internal` | 0.51.0 | An unexpected state during unification. |
| `unify_failed` | 0.67.0 | A document does not evaluate, and the failure carries no code of its own. |
| `patch_span_mismatch` | 0.53.0 | The overlay text does not hold the recorded source at the recorded span, so the span cannot be verified before writing. ([`aontu model set`](reference-api.md#aontu-model-set)) |
| `unify_no_res` | 0.51.0 | Unification produced no result. |
| `unknown_op` | 0.51.0 | An operator expression the evaluator has no rule for. |

## Related

- [`aontu vet`](reference-api.md#aontu-vet) for the report these
  findings arrive in, the fields they carry, and its own exit table.
- [`aontu explain`](reference-api.md#aontu-explain) for the verb that
  answers one code, and for what `--list` prints.
- [Errors](reference-language.md#errors) in the language reference for
  the message families and the rules that refuse a document.
- [Read a conflict error](how-to/read-a-conflict-error.md) for reading
  a two-site conflict message operand by operand.
- [Collect errors instead of throwing](how-to/collect-errors.md) for
  gathering every finding in one pass from the embedded API.
- [`test/spec/errcodes.tsv`](../test/spec/errcodes.tsv) for the
  registry itself, which both implementations run.

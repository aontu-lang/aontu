# Errors reference

Every refusal the engine can make carries a **code**, and every code
carries a **class**. The code names the condition that was refused; the
class says what kind of thing went wrong, and so which repair applies.
A report is a list of findings, each one a code, a class, a path, and
the source spans the failure was read from.

This page is normative for the registry: every registered code, its
class, and the version it was first registered at. It is also normative
for the shape of a report, the fields a finding carries, and what a
site names. It is not normative for the failures themselves. The
language reference specifies each construct where that construct
belongs, and states what refuses it there: see
[Errors](reference-language.md#errors) for the message families,
[Exact or refused: lossy
literals](reference-language.md#exact-or-refused-lossy-literals) and
[The exactness budget](reference-language.md#the-exactness-budget) for
the numeric rules, and [Errors](reference-language.md#errors-1) under
[The constraint algebra](reference-language.md#the-constraint-algebra)
for a constraint violation.

The exit code each verb answers with, verb by verb, is in the API
reference beside that verb's option list, starting at [`aontu
vet`](reference-api.md#aontu-vet). [`aontu
explain`](reference-api.md#aontu-explain) answers one code from the
same table a finding carries, and `aontu help codes` prints the
agent-facing card of the classes, which is shorter than the table
below and carries no counts.

## Contents

- [Classes](#classes)
- [What a report carries](#what-a-report-carries)
  - [What a site names](#what-a-site-names)
  - [The `json` shape](#the-json-shape)
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

There are seven classes, and the registry holds **167** codes across
them: 55 `conflict`, 51 `parse`, 26 `reference`, 13 `compat`, 11
`incomplete`, 6 `budget`, and 5 `internal`.

| class | codes | what went wrong | what to do |
|---|---|---|---|
| `parse` | 51 | the text is not a document | fix the syntax at the site the finding points at |
| `conflict` | 55 | two values cannot both hold | one of them is wrong: `aontu model why <path>` names both and where they were written |
| `incomplete` | 11 | nothing contradicts, but the value is not concrete | supply what is missing, or accept the residue with `--partial` |
| `reference` | 26 | a name or path resolves to nothing | check the spelling: `aontu model get $ --keys` lists what is there |
| `compat` | 13 | a change breaks an earlier version | widen the change, or version it |
| `budget` | 6 | evaluation hit a deterministic limit | usually a cycle: simplify, or raise the budget deliberately |
| `internal` | 5 | the engine reached a state it should not reach | report it, with the source |

A class states which repair applies, not where in the engine the
failure arose, and several assignments follow from that rather than
from the failure's origin. `decimal_budget` and `lossy_integer_literal`
are `conflict` rather than `budget`: each literal is well formed and
refused by a fixed rule about the value, so the repair is changing the
value. `path_cycle` is `reference` rather than `budget`: a proven
structural cycle is a defect of the model, and raising a budget never
clears it. `module_depth` is `budget`, because verification evaluates
the module and a vendor tree leading back to itself is an evaluation
bound. `patch_span_mismatch` is `internal` by design: the site and the
text come from the source the run has just parsed, so a mismatch
between them is the engine's own.

Two `conflict` codes are report-layer only. `relation_cycle` and
`relation_inverse_missing` are global and non-monotone, so they are
checked once unification has finished and the lattice never sees them.

Five codes are **dynamic-prefix families**: `func:`, `op:`, `op[`,
`ref[`, and `var[`. The engine appends a name or a value to the prefix,
so a reported code may be `func:upper` or `ref[$.x]`. Class lookup
takes the exact registry entry first, then the registered prefix the
code extends, and then `internal`, because an unregistered code is an
engine defect rather than a user error. Explanation text comes from the
prefix too: `aontu explain func:upper` answers with the `func:` entry.
The bare `func`, `op`, `ref`, and `var` are separate registry rows with
their own classes, and are not the same codes as the families.

Codes are append-only and are not renamed, so a row stays registered
after the condition it named stops arising. One rename has happened:
`|:empty` and `|:empty-dist` became `empty` and `empty-dist` in 0.54.0,
which is why those two carry that version rather than an earlier one.

## What a report carries

A finding is a fixed set of fields. Six are always present, and four
more appear when the failure records them.

| field | what it holds |
|---|---|
| `code` | the registered code string, the family suffix included |
| `class` | that code's class, read from the registry |
| `severity` | `error`, `warning`, or `info`; every finding derived from a nil is `error` |
| `path` | the path the failure was reported at |
| `message` | the first line of the engine's message, terminal colour escapes removed |
| `hint` | the registered explanation for the code, with the offending values filled in |
| `sites` | the source spans the failure was read from, data sites before schema sites |
| `expected`, `actual` | the value the failure required and the value it was given, where it records them |
| `note` | the failure's own detail message, where it carries one |

`message` is the headline and is not prefixed with the reported code:
a source that will not parse reports the code `syntax` under a message
headed `[aontu/unexpected]`.

`hint` is the engine's own explanation of the code, taken from the same
table [`aontu explain`](reference-api.md#aontu-explain) reads, with the
failure's own values substituted into the text's placeholders. **139 of
the 167 codes have hint text, and 28 do not.** A finding whose code has
none carries no `hint` key at all, rather than an empty one, and
`aontu explain --list` marks each of the 28 `(no text)`.

`severity` decides nothing about the verdict except by being `error`.
The verdict is computed over the error findings alone: any error
outside class `incomplete` makes the verdict `invalid`, errors only of
class `incomplete` make it `incomplete` unless `--partial` was passed,
and a `warning` never moves it. Five codes are reported at severity
`warning`: `deprecated`, `pref_not_instance`, `patch_not_editable`,
`patch_ambiguous`, and `patch_span_mismatch`.

### What a site names

A site names **the file whose text it excerpts**, so its row and column
are safe to edit at even when the document loads others.

| field | what it holds |
|---|---|
| `file` | the file the span is in, spelled as the caller's own entry path reaches it |
| `row`, `col` | the position of the span in that file, counted from 1 |
| `len` | the span's length in code units, or `-1` where no span is known |
| `role` | `data` or `schema` under `vet`; `general` or `specific` under `subsume` and `breaking` |
| `src` | the source text the span covers |
| `value` | that value's canonical form |

### The `json` shape

`--format json` answers one object whose `aontu` key carries the `verb`
and the engine `version`. The rest of the keys are the verb's own.

| verb | the report's own keys | findings carry sites |
|---|---|---|
| `vet` | `findings`, `truncated`, `verdict` | yes |
| `model set` | `appended`, `findings`, `overlay`, `replaced`, `verdict`, `written` | yes |
| `subsume`, `breaking` | `findings`, `verdict` | yes, with roles `general` and `specific` |
| default entry point | `findings`, `ok`, `out` | no: `sites` is empty and no `hint` is carried |
| `view` | `errors`, `kind`, `loss`, `verdict` | no: `note` carries the detail instead |
| `relations` | `findings`, `verdict` | no, and the findings are a different shape |

Two of those rows carry a further rule. The default entry point
reports the code, the class, and the message, and nothing else: its
findings have an empty `sites` and no `hint`, because the frames it
prints under the headline are drawn for a person and hint prose is
outside cross-port parity. And a `relations` finding is the one shape
that is not a finding of the kind tabulated above: it carries `at`,
`code`, `detail`, and `relation`, with no `class`, `severity`, `path`,
`message`, `sites`, or `hint`.

To see the fields on a real report, pin a kind in `model.aon`:

<!-- test: scenario report-shape -->
<!-- test: file model.aon -->
```aon
a: integer
```

and vet a `data.aon` that spells the value as text:

<!-- test: file data.aon -->
```aon
a: "x"
```

<!-- test: run -->
```sh
$ aontu vet --format json model.aon data.aon
{
  "aontu": {
    "verb": "vet",
...
  "findings": [
    {
      "class": "conflict",
      "code": "no_scalar_unify",
...
      "message": "[aontu/no_scalar_unify]: Cannot unify values at path $.a",
      "path": "$.a",
      "severity": "error",
      "sites": [
        {
          "col": 4,
          "file": "data.aon",
          "len": 3,
          "role": "data",
          "row": 1,
          "src": "\"x\"",
          "value": "\"x\""
        },
        {
          "col": 4,
          "file": "model.aon",
          "len": 7,
          "role": "schema",
          "row": 1,
          "src": "integer",
          "value": "integer"
        }
      ]
    }
  ],
  "truncated": false,
  "verdict": "invalid"
}
$ echo $?
1
```

The elided line is the `hint`, one string that for `no_scalar_unify`
carries a paragraph and four worked examples. The data site comes
first, and it is the one to edit.

A code with no hint text reports without the key. Write a `broken.aon`
that will not parse:

<!-- test: file broken.aon -->
```
a: ]
```

<!-- test: run -->
```sh
$ aontu vet --format json model.aon broken.aon
{
...
      "class": "parse",
      "code": "syntax",
      "message": "[aontu/unexpected]: unexpected character(s): ]",
      "path": "$",
      "severity": "error",
      "sites": [
        {
          "col": 4,
          "file": "broken.aon",
          "len": -1,
          "role": "data",
          "row": 1,
          "src": "",
          "value": "nil"
        }
      ]
    }
  ],
  "truncated": false,
  "verdict": "invalid"
}
$ echo $?
1
```

`syntax` is one of the 28 codes with no hint text, so the finding holds
nothing between its `code` and its `message`. `len` is `-1` here: the
parser refused a character and there is no span to excerpt.

## Exit codes

An exit code is a verdict class, and the five values mean the same
thing across the verbs that use them.

| exit | what it says |
|---|---|
| 0 | the verb's affirmative verdict: `valid`, `subsumes`, `clean`, `pass`, `reaches`, `rendered`, `allowed` |
| 1 | the verb's negative verdict: `invalid`, `does_not_subsume`, `redundant`, `fail`, `unreachable`, `refused`, or a `--check` that found drift |
| 2 | usage: a bad option, a file that cannot be read, an unknown help topic or error code |
| 3 | undecided: `incomplete` under `vet`, `undecided` under `subsume` and `breaking` |
| 4 | the document handed in does not stand up on its own |

**A class is not an exit code.** The same code answers different exits
depending on which document failed: `scalar_value`, class `conflict`,
exits 1 when the contradiction is between schema and data, and 4 when
the contradiction is inside the schema. Which verbs answer which
values, and what each value means for that verb, is in the API
reference: [`aontu vet`](reference-api.md#aontu-vet),
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

The registry is [`test/spec/errcodes.tsv`](../test/spec/errcodes.tsv).
Both implementations run it as part of the shared suite and assert set
equality with their own code-to-class table, so a code registered in
one and absent from the other fails the suite in that implementation.
`aontu explain --list` prints the same 167 codes, one per line, with
each code's class beside it.

The tables below are that file, one section per class, alphabetical
within each. A `since` column is the version line at which the code was
first registered; `0.51.0` is the registry's own inception version, so
every code older than the registry carries it. A blank gloss is a
registered code whose condition neither the engine's hint table nor the
shared spec pins, and it is left blank rather than guessed at.

### Class `parse`

| code | since | raised when |
|---|---|---|
| `abnf_grammar` | 0.63.0 | The grammar could not be compiled; `abnf()` takes RFC 5234 ABNF, with `=` and `/` rather than `::=`. |
| `alias_colon` | 0.58.0 | An alias declaration spelled with a colon; the declaration form is `%name = value`. |
| `alias_in_path` | 0.53.0 | An alias name used as a segment of a path. |
| `alias_not_toplevel` | 0.53.0 | An alias declared somewhere other than the document root. |
| `bare_punct` | 0.58.0 | A bare string holding a character outside letters, digits, `-`, and `_`. |
| `decimal_syntax` | 0.51.0 | A `0d` literal that is not a valid exact number. |
| `each_data` | 0.53.0 | The first argument to `each()` is not a bag, so it has no children to make elements from. |
| `elided_value` | 0.53.0 | A key, element, or spread written with nothing after its colon. |
| `emit_body` | 0.57.0 | A template body in an `emit()` table is not a list. |
| `emit_data` | 0.57.0 | The first argument to `emit()` is not a bag, so the selection has no children to visit. |
| `emit_table` | 0.57.0 | The second argument to `emit()` is not a rule table. |
| `emit_template` | 0.57.0 | A template in an `emit()` table is not a rule naming both `match` and `body`. |
| `esc_variant` | 0.57.0 | `esc()`, `usc()`, or a template's `esc:` key was given a variant naming no convention. |
| `filter_data` | 0.53.0 | The first argument to `filter()` is not a bag. |
| `form_data` | 0.58.0 | The list generator `form` was renamed `each`, which answers `each_data`; the row stays because codes are append-only. |
| `func_arity` | 0.53.0 | A function called with the wrong number of arguments. |
| `include_denied` | 0.53.0 | An `@"..."` include refused by the active trust profile. |
| `include_extension` | 0.54.0 | An `@"..."` include naming a file whose extension the include table does not know. |
| `incomplete_expression` | 0.51.0 | An expression missing a term, grouping parentheses with nothing inside included. |
| `inverse_name` | 0.53.0 | The argument to `inverse()` is not a relation name. |
| `merge_conflict` | 0.53.0 | A version-control conflict marker left in the source. |
| `module_integrity` | 0.53.0 | A module resolved locally does not carry the meaning its canon-hash pin recorded. |
| `module_local` | 0.65.0 | A bare module reference whose last segment carries an extension the include table knows. |
| `module_missing` | 0.53.0 | A module import naming a package that is not in the project's local stores. |
| `module_moved` | 0.65.0 | A later version of the imported package declares a new path. |
| `module_path` | 0.54.0 | A domain-shaped module import whose path cannot be a directory on every platform the toolchain runs on. |
| `negative` | 0.51.0 | Unary minus applied to a non-numeric operand. |
| `not_number` | 0.51.0 | A numeric literal that reads as a non-finite value. |
| `pack_data` | 0.53.0 | The first argument to `pack()` is not a bag. |
| `pack_key` | 0.53.0 | A list packed by `pack()` holds an element that is not a string. |
| `parse` | 0.51.0 | The outer wrapper for a source that could not be turned into a document; the inner error carries the code that explains it. |
| `parse_arg` | 0.63.0 | `parse()` was given something other than a grammar string and a text string. |
| `parse_bad_src` | 0.51.0 | The source handed in for parsing is not a non-empty string. |
| `parse_unknown` | 0.51.0 |  |
| `patch_assignment` | 0.53.0 | A `set` argument that is not `<path>=<value>`. |
| `path_address` | 0.54.0 | `path()` was given text that is not a tree address. |
| `pref_implicit_bag` | 0.53.0 | A preference mark written on a bare key rather than on a value. |
| `refer_address` | 0.53.0 | `refer()` was given something that is not a path value. |
| `rel_address` | 0.53.0 | A `rel()` field holds something other than path values. |
| `render_path` | 0.58.0 | A unit path that is not relative, below the output directory, and distinct from every other unit's. |
| `render_profile` | 0.58.0 | A declaration needing a lowering, under a profile whose language has none. |
| `rep_pattern` | 0.57.0 | The pattern given to `rep()` is outside the portable subset `re()` takes. |
| `rep_sub` | 0.57.0 | The substitution given to `rep()` names a group the pattern does not have. |
| `replace_overlap` | 0.58.0 | Two keys of a template's `replace` map overlap, one inside the other. |
| `replace_unused` | 0.58.0 | A key of a template's `replace` map appears in none of the body's literal lines. |
| `sort_dir` | 0.63.0 | A sort direction other than `asc` or `desc`. |
| `split_sep` | 0.57.0 | The separator given to `split()` is neither a string nor a pattern. |
| `syntax` | 0.51.0 | The parser refused the source text; the message is the parser's own, with the operator-character hint appended. |
| `unify_no_src` | 0.51.0 | No source was handed in for unification. |
| `usc_malformed` | 0.57.0 | `usc()` was given text the named convention could not have produced. |
| `view_line_break` | 0.54.0 | A label the figure would draw holds a line terminator. |

### Class `conflict`

| code | since | raised when |
|---|---|---|
| `aggregate_data` | 0.53.0 | An aggregate was given something other than a bag to fold. |
| `aggregate_empty` | 0.53.0 | `least` or `greatest` was given an empty bag, which has no such element. |
| `arg` | 0.51.0 | A required argument is missing. |
| `close` | 0.51.0 | The structure could not be closed. |
| `closed` | 0.51.0 | A key or element added to a closed map or list. |
| `constraint` | 0.52.0 | The value does not satisfy the normalised residual the constraint reduced to. |
| `constraint_pattern` | 0.53.0 | An `re()` pattern outside the supported subset. |
| `decimal_budget` | 0.51.0 | An exact decimal past 4096 coefficient digits or an absolute scale of 4096. |
| `divide_by_zero` | 0.53.0 | `div`, `mod`, or `rem` given a zero divisor. |
| `emit_none` | 0.57.0 | No template matched a node, and the table has no catch-all. |
| `emit_ref` | 0.57.0 | A template body names a field the node it matched does not carry. |
| `empty` | 0.54.0 | A disjunction with no admitted alternative. |
| `empty-dist` | 0.54.0 | Every alternative of a distributed disjunction is refused. |
| `exact_float_mix` | 0.51.0 | An exact number combined with a binary float. |
| `float_overflow` | 0.53.0 | A result that is not a finite binary64 number. |
| `func` | 0.51.0 | A function operation failed; the named function carries the detail. |
| `func:` | 0.51.0 | Dynamic-prefix family: a named function's own failure, the name appended (`func:upper`). |
| `func_arg` | 0.55.0 | An argument does not fit the function's signature. |
| `inexact_divide` | 0.53.0 | A `0d` operand given to `div`, `mod`, or `rem`, where exact division is not closed. |
| `inexact_integer_sum` | 0.51.0 | An `integer` result outside the integral, int64, exactly representable range. |
| `invalid-arg` | 0.51.0 | An argument does not match the expected type or format. |
| `join_member` | 0.54.0 | A member of the bag `join()` folds is not text and never will be. |
| `key_level` | 0.51.0 | The argument to `key()` is not a level. |
| `list` | 0.51.0 | A list was expected and the value is of another kind. |
| `list_length` | 0.53.0 | A literal list alternative admits only a list of its own length; a spread makes it take any length. |
| `literal_nil` | 0.51.0 | A literal nil met another value. |
| `lossy_integer_literal` | 0.51.0 | An integer literal not exactly representable in binary64; the hint names the `0d` spelling. |
| `make` | 0.51.0 | A value could not be constructed. |
| `map` | 0.51.0 | A map was expected and the value is of another kind. |
| `match_none` | 0.53.0 | No pattern matched, and `match` has no default. |
| `must` | 0.53.0 | The value fails an evaluate-only check written with `must()`; the author's message rides on the finding. |
| `nil_gen` | 0.51.0 | A nil survived unification, and nil is not a literal value to generate. |
| `no_first_arg` | 0.51.0 | The function's first argument is missing. |
| `no_scalar_unify` | 0.51.0 | Two scalar values of incompatible types. |
| `not-scalar-type` | 0.51.0 | A scalar type was expected and the value is not one. |
| `op` | 0.51.0 | An operator operation failed; the named operator carries the detail. |
| `op:` | 0.51.0 | Dynamic-prefix family: a named operator's own failure, the name appended (`op:add`). |
| `op[` | 0.51.0 | Dynamic-prefix family: an operator failure carrying the offending value (`op[1]`). |
| `operate` | 0.51.0 | The operation could not be performed over the values given. |
| `parse_failed` | 0.63.0 | The text does not parse under the grammar given, so the field is refused. |
| `pick_key` | 0.53.0 | A child of the bag has no key for `pick` to project. |
| `place_pair` | 0.53.0 | Two placeholders met, and neither has a value to fill the other. |
| `pref_rank_clash` | 0.54.0 | Two defaults of the same rank disagree. |
| `relation_cycle` | 0.53.0 | A relation declared `acyclic()`, and its edges form a cycle. Checked after unification, in the report layer. |
| `relation_inverse_missing` | 0.53.0 | A relation declared `inverse(name)`, and an edge has no mirroring edge. Checked after unification, in the report layer. |
| `render_lang` | 0.58.0 | A text escape carrying verbatim syntax of a language other than the unit's. |
| `render_strict` | 0.58.0 | An opaque escape, which the renderer cannot check, under strict rendering. |
| `replace_value` | 0.58.0 | A replacement value is not text by the time the dispatch fires. |
| `resolve` | 0.51.0 | The value could not be resolved. |
| `scalar-type` | 0.51.0 | Two scalar kinds where neither contains the other. |
| `scalar_kind` | 0.51.0 | Two literal scalars of different kinds. |
| `scalar_value` | 0.51.0 | Two literal scalars of the same kind that are not equal. |
| `sort_domain` | 0.63.0 | The bag mixes text with numbers, or holds a boolean, a null, or a container, so it has no order. |
| `sort_key` | 0.63.0 | A child of the bag has no key to order by. |
| `unite` | 0.51.0 | Two values could not be united. |

### Class `incomplete`

| code | since | raised when |
|---|---|---|
| `conjunct` | 0.51.0 | A conjunction has a term that could not be resolved. |
| `disjunct_no_gen` | 0.53.0 | More than one alternative is still admitted, so there is no single value to generate. |
| `listval_no_gen` | 0.51.0 | A list element survived unification as something other than a literal value. |
| `listval_required` | 0.51.0 | A required list element has no value. |
| `listval_spread_required` | 0.51.0 | A key a spread requires has no value, in a list. |
| `mapval_no_gen` | 0.51.0 | A map value survived unification as something other than a literal value. |
| `mapval_required` | 0.51.0 | A required map value has no value. |
| `mapval_spread_required` | 0.51.0 | A key a spread requires has no value, in a map. |
| `no_gen` | 0.51.0 | A value survived unification as something other than a literal value. |
| `recursion_unexpanded` | 0.53.0 | A schema refers to itself, and no data reached the position to expand it against. |
| `required_listelem` | 0.51.0 | A non-optional list element has no value. |

### Class `reference`

| code | since | raised when |
|---|---|---|
| `invalid_var_kind` | 0.51.0 | A variable's kind is not the kind the use expects. |
| `multisource_not_found` | 0.51.0 | An `aontu:` name that is not one of the language-supplied models; the message names the set. |
| `no_path` | 0.51.0 | A path reference resolves to nothing. |
| `patch_ambiguous` | 0.53.0 | Two or more statements pin the path, so an in-place edit has no single place to write. Severity `warning`. |
| `patch_not_editable` | 0.53.0 | An in-place edit found no single literal to rewrite, so the assignment was appended. Severity `warning`. |
| `path_cycle` | 0.51.0 | A path reference closes a cycle. |
| `ref` | 0.51.0 | A reference could not be resolved to a value. |
| `ref[` | 0.51.0 | Dynamic-prefix family: a reference failure carrying the address (`ref[$.x]`). |
| `refer_unresolved` | 0.53.0 | A `refer()` address names no node in this evaluation. |
| `rel_unresolved` | 0.53.0 | A `rel()` address names no node in this evaluation. |
| `render_unit` | 0.58.0 | The unit asked for is not in the instance. |
| `unknown_function` | 0.51.0 | A function name that resolves to no built-in. |
| `unknown_var` | 0.51.0 | A variable that has not been defined. |
| `var` | 0.51.0 | An unresolved variable reached generation. |
| `var[` | 0.51.0 | Dynamic-prefix family: a variable failure carrying the name (`var[$x]`). |
| `view_at_required` | 0.54.0 | The meet ladder draws the contributions at one path, and none was named. |
| `view_document_shape` | 0.54.0 | A figure in a view document does not name both its `kind` and its `out` file. |
| `view_group_required` | 0.54.0 | The layer diagram bands nodes by a field, and none was named. |
| `view_kind_unknown` | 0.54.0 | The figure kind is not one the verb draws; the note lists the kinds. |
| `view_profile_unknown` | 0.54.0 | The figure kind does not render into the profile asked for. |
| `view_relation_ambiguous` | 0.54.0 | The document has edges under several relations, and the figure draws one. |
| `view_relation_unknown` | 0.54.0 | The relation named to the view has no edges in this document. |
| `view_sets_required` | 0.54.0 | The set panel needs both the sets map and the member field, and one was missing. |
| `view_sets_shape` | 0.54.0 | The sets map or the universe does not have the shape the set panel reads. |
| `view_style_profile` | 0.55.0 | The style asked for is not the one that profile carries. |
| `view_style_unknown` | 0.55.0 | A style other than `none`, `ansi`, or `css`. |

### Class `compat`

| code | since | raised when |
|---|---|---|
| `compat_default_changed` | 0.53.0 | The effective default changed, so a document generable before materialises differently or becomes incomplete. |
| `compat_marks_changed` | 0.53.0 | The marks on the two values differ. |
| `compat_narrowed` | 0.53.0 | The specific value admits something the general does not; the message names which comparison failed. |
| `compat_outcome_changed` | 0.65.0 | A position both versions resolve with nothing supplied, to different values. |
| `compat_required_added` | 0.53.0 | The general value requires a key the specific omits or makes optional. |
| `compat_undetermined` | 0.65.0 | A position the prior version resolved with nothing supplied, and nothing resolves now. |
| `deprecated` | 0.53.0 | A use of a value carrying a `deprecate` mark. Severity `warning`. |
| `pref_not_instance` | 0.53.0 | A disjunction's effective default is not an instance of any remaining alternative. Severity `warning`. |
| `sub_default_indeterminate` | 0.53.0 | Equal-rank preferences disagree, so the effective default is not a single value. |
| `sub_disjunct_distribution` | 0.53.0 | A specific alternative is not admitted member-wise, and no concrete counterexample settles the distribution case. |
| `sub_evaluate_only` | 0.53.0 | An evaluate-only check makes the admitted set opaque. |
| `sub_path_dependent_spread` | 0.53.0 | A path-dependent spread template cannot be compared structurally. |
| `sub_unresolved` | 0.53.0 | Unresolved residue, or no subsumption rule covers the pair of value formers. |

### Class `budget`

| code | since | raised when |
|---|---|---|
| `budget_passes` | 0.52.0 | The fixpoint pass budget was spent before the model converged; the hint names what was still refining. |
| `max_depth` | 0.51.0 | Input nested deeper than the engine processes. |
| `module_depth` | 0.53.0 | Module verification nested past its depth, usually a vendor tree leading back to itself. |
| `recursion_budget` | 0.53.0 | A recursive schema expanded past the depth budget without meeting concrete data. |
| `unify_cycle` | 0.51.0 | A circular reference reached during unification. |
| `view_rows_exceeded` | 0.54.0 | The figure has more rows than the row cap allows; the figure is refused rather than trimmed. |

### Class `internal`

| code | since | raised when |
|---|---|---|
| `format_check` | 0.56.0 | The formatted text is not the same document, so nothing was written. |
| `internal` | 0.51.0 | An unexpected state during unification. |
| `patch_span_mismatch` | 0.53.0 | The overlay text does not hold the recorded source at the recorded span, so the span cannot be verified before writing. Severity `warning`. |
| `unify_no_res` | 0.51.0 | Unification produced no result. |
| `unknown_op` | 0.51.0 |  |

## Related

- [`aontu vet`](reference-api.md#aontu-vet) for the verb these findings
  are shaped for, its options, and its own exit table.
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

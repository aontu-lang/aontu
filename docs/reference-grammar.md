# Grammar reference

One grammar, published four times. The rules below are the **emission
surface**: what a document should be allowed to write, which is a
superset of JSON plus the operators, constraints and marks the
canonical form emits. The grammar is conservative by construction, so
it accepts less than the parser does and never more.

This page is normative for the published grammar as a set of rules:
which rules there are, what each spells, which spellings the parser
accepts beyond them, and what holds the four files to the engine. It
does not draw the grammar: [The published
grammar](reference-language.md#the-published-grammar) in the language
reference carries the railroad diagrams and the status of the emission
surface, and each construct is specified where the language reference
defines it. A refusal while a document is read is class `parse`, and
the codes are the [errors reference](reference-errors.md#class-parse).

## Contents

- [The published files](#the-published-files)
- [The rules](#the-rules)
- [Two notation choices](#two-notation-choices)
- [Where order matters](#where-order-matters)
- [What the parser also accepts](#what-the-parser-also-accepts)
- [What the grammar excludes](#what-the-grammar-excludes)
- [Lexical sets](#lexical-sets)
- [What holds the files to the engine](#what-holds-the-files-to-the-engine)
- [Related](#related)

---

## The published files

| file | notation | for | held to |
|---|---|---|---|
| [`grammar/aontu.abnf`](../grammar/aontu.abnf) | RFC 5234, with RFC 7405 case-sensitive literals | a reader, and the railroad diagrams the language reference draws | interpreted and run against every canonical output of the shared spec suite; every rule reachable; the name set checked against the engine |
| [`grammar/aontu.gbnf`](../grammar/aontu.gbnf) | GBNF | a constrained decoder | interpreted and run against the same corpus; the name set checked against the engine |
| [`grammar/aontu.lark`](../grammar/aontu.lark) | Lark | a parser generator | rule names checked against the other two; the name set checked against the engine |
| [`grammar/aontu.tmLanguage.json`](../grammar/aontu.tmLanguage.json) | TextMate | editor highlighting | the name set checked against the engine, and the copy the editor extensions ship checked against this one |

The first three name the same rules, rule for rule and name for name.
The fourth is a highlighter rather than a parser, and shares only the
built-in name set.

## The rules

Thirty-three rules, in the order the file defines them. Every one is
reachable from `root`, and a rule that stops being reachable fails the
suite rather than sitting in the file.

| rule | what it spells |
|---|---|
| `root` | a whole document: whitespace, one value, whitespace |
| `value` | a value, which is a disjunction |
| `disjunct` | alternatives, separated by the vertical bar |
| `conjunct` | values that must all hold, separated by `&` |
| `prefixed` | a `*` preference, or a sum |
| `sum` | atoms joined by `+` |
| `atom` | a map, a list, a call, a reference, a kind, the placeholder, a scalar, or a parenthesised value |
| `map` | a brace-delimited bag of entries |
| `entry` | a spread template, or a pair |
| `spread` | `&`, `:` and the template every key of the bag must satisfy |
| `pair` | a key, an optional `?`, `:`, and a value |
| `list` | a bracket-delimited sequence of elements |
| `element` | a spread template, or a value |
| `func` | a built-in name applied to arguments |
| `name` | the closed set of built-in names |
| `ref` | a path reference, absolute from `$` or relative from `.` |
| `segment` | one path segment: letters, digits and `_` |
| `place` | the placeholder, `_`, bare |
| `kind` | a kind name |
| `scalar` | a string, an exact number, a number, `true`, `false` or `null` |
| `string` | a double-quoted run of characters |
| `char` | one character: unescaped, or `\` and an escape |
| `unescaped` | every code point but the quote and the backslash |
| `escape` | what may follow a backslash, including `u` and four hex digits |
| `hex` | one hexadecimal digit |
| `exact` | an exact literal: `0d`, digits, an optional fraction and exponent |
| `number` | digits, an optional fraction and exponent |
| `exponent` | `e` or `E`, an optional sign, and digits |
| `digits` | one or more digits |
| `ws` | the whitespace characters |
| `ALPHA` | a letter |
| `DIGIT` | a digit |
| `DQUOTE` | the double-quote character |

`root` is the start rule. Whitespace is permitted between every
element and is carried by `ws` rather than drawn.

## Two notation choices

**Every literal is case-sensitive**, spelled `%s"..."`. A plain
`"..."` is case-insensitive in RFC 5234, and this language is not:
`TRUE` is a bare word and `true` is a boolean. The reader refuses a
bare quoted literal rather than guess which was meant, so a rule
cannot acquire a case-insensitive literal by accident.

**Alternation is ordered.** RFC 5234's `/` is formally unordered, and
both consumers of the file take the first branch that matches. Where
one spelling is a prefix of another the longer comes first, which is
what makes the ordered reading and the unordered one accept the same
language.

## Where order matters

Ordered alternation has a consequence wherever one branch matches a
prefix of what another would match: the longer branch has to come
first. Every such place in the file, and what a swap would do:

| earlier | later | what a swap would do |
|---|---|---|
| `exact` | `number` | `0d5` begins with a digit, so `number` would match `0` and leave `d5` unread |
| `copyfiles` | `copy` | a call to `copyfiles` would be read as `copy` |
| `listitems` | `list` | a call to `listitems` would be read as `list` |
| `refer` | `re` | a call to `refer` would be read as `re` |
| `rel` | `re` | a call to `rel` would be read as `re` |
| `rem` | `re` | a call to `rem` would be read as `re` |
| `rep` | `re` | a call to `rep` would be read as `re` |

The first row is an ordering between two rules, in `scalar`. The rest
are built-in names inside the `name` rule, and are every prefix pair
that rule holds.

## What the parser also accepts

The grammar describes what a document should write. The parser accepts
these spellings too, and each means what the canonical form in the
third column says. A model generating aontu should write the canonical
spelling; a human reading a document may meet either.

| spelling | written | means |
|---|---|---|
| an unquoted key | `a: 1` | `{"a":1}` |
| a document with no outer braces | `a: 1 b: 2` | `{"a":1,"b":2}` |
| a bare word as a string | `a: hello` | `{"a":"hello"}` |
| a single-quoted string | `a: 'x'` | `{"a":"x"}` |
| a trailing comma | `a: {b: 1,}` | `{"a":{"b":1}}` |
| a path-flattened pair | `a: b: 1` | `{"a":{"b":1}}` |
| a comment to end of line | `a: 1 # note` | `{"a":1}` |
| an unquoted key the canonical form quotes | `a-b: 1` | `{"a-b":1}` |

A newline separates entries as a comma does, and a backtick-quoted
string reads as a double-quoted one. Two entries naming the same key
meet rather than replace, which is the language's own rule and not a
spelling: see [Unification](reference-language.md#unification).

## What the grammar excludes

Two forms are deliberately absent, and the suite requires the grammar
to refuse them rather than merely omit them:

- **`@"..."` includes.** A generated document should describe values
  rather than reach for files, so nothing a constrained decoder emits
  can read the filesystem.
- **The tolerated spellings above.** The canonical form quotes every
  key and writes one spelling per construct, and one spelling is what
  a grammar is for.

An excluded form is still valid aontu. The exclusion says what a
generator should write, not what the engine reads.

## Lexical sets

| set | members |
|---|---|
| whitespace | space, tab, carriage return, line feed |
| an escape after `\` | `"`, `\`, `/`, `b`, `f`, `n`, `r`, `t`, and `u` with four hex digits |
| unescaped | every code point except `"` and `\`, control characters included |
| a hex digit | `0` to `9`, `A` to `F`, `a` to `f` |
| a path segment | letters, digits and `_`, and never `-` |

Control characters are admitted because the canonical form writes them
escaped, and a grammar that refused them would refuse less than the
parser accepts in the one direction this file may not take.

A path segment has no `-` because a hyphen is not a bare-text
character: `a:6-2` is a parse error rather than the key `6-2`, so
admitting it in a segment would describe a language wider than the one
the engine reads.

## What holds the files to the engine

The grammar is executed rather than published and left alone. In both
implementations' test suites:

| check | what it proves |
|---|---|
| the reader parses the file | the notation is well formed, and no literal is case-insensitive |
| every canonical output of the shared spec suite is accepted | the grammar has not fallen behind the engine |
| every excluded form is refused | the exclusions are real, rather than an omission |
| the three parser grammars name the same rules | one grammar, three notations |
| every rule is reachable from `root` | no rule outlives the construct it spelled |
| all four files name exactly the engine's built-ins | a function added or retired cannot leave a grammar behind |
| the editor extensions' copy is the published file | an editor highlights what the engine reads |

## Related

- [The published grammar](reference-language.md#the-published-grammar)
  in the language reference for the railroad diagrams and the status of
  the emission surface.
- [The formatted
  form](reference-language.md#the-formatted-form) for what `aontu fmt`
  writes, which is the spelling a page shows.
- [Class `parse`](reference-errors.md#class-parse) in the errors
  reference for every code a refusal while reading carries.
- [Grammars: `abnf()` and
  `parse()`](reference-language.md#grammars-abnf-and-parse) for using a
  grammar of your own inside a document, which is a different thing
  from this one.
- [The published grammar](reference-api.md#the-published-grammar) in
  the API reference for the files as an artefact of the distribution.

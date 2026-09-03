# aontu fmt — the agreed form of Aontu source

**Status:** ACCEPTED for implementation, 2026-09-03. P1 LANDED 2026-09-03 (§7.7); P2 LANDED 2026-09-03 (§7.8); P3–P4 are not built.
yet. The open questions of §11 were put to the owner the day the note
was written: X-1, X-2, X-3, X-5 and X-6 decided as recommended, X-7
decided *against* the recommendation (a spread-only map keeps its
braces — §3.3 carries the exception), X-4 stands as recommended. The
worked examples in §6 are hand-formatted to the rules — they are what
the formatter *should* print, not what anything printed. P1 begins on
its own branch once this note is merged.

**Origin:** Richard Rodger, 2026-09-03: *"This is not a pretty printer
of canonical form. This is a source code formatter in the tradition of
go fmt, so that aontu code can have an agreed form."* With five
suggestions, each taken up where it lands: minimise brackets of every
kind, above all where closers bunch (§3.3, §3.5); prefer repeating the
higher levels of a colon chain, which also minimises indentation
(§3.4); prefer `%` aliases for what recurs (§4.2); prefer lower-case
keys, CamelCase acceptable, no underscores (§4.1); a key and its value
stay together, `{ a:1 b:2 }` (§3.2, §3.5).

**Method:** every claim below about what the language does *today* was
probed against the tree at `a5efddc` (TypeScript 0.55.0 plus the two
pull requests merged that morning). Every "the same document" claim
carries the `aon1-` hash of both spellings, from `aontu hash`; two
spellings with one hash are one document, and that is the whole
argument. Corpus figures are over the 400 `.aon` files under
`use-cases/` and `test/spec/files/` plus the 266 `aon` fences in the
published documentation — 8,508 lines. Claims about what the formatter
*should* do are argument, and are marked as such.

---

## 1. Two forms, two jobs

Aontu already has one mechanical spelling of a document: the canonical
form, `aontu -c`. It is not this. Canon answers a different question,
and the two must not be confused, because a formatter that borrowed
canon's rules would destroy the thing a formatter exists to keep.

| | canonical form (`-c`) | formatted source (`fmt`) |
|---|---|---|
| **for** | machines: hashing, diffing, comparing two ports byte for byte | people: reading, reviewing, editing |
| **input** | the *unified* value | the *source text* |
| **comments** | gone | kept, every one |
| **key order** | sorted by code point | the author's |
| **keys** | every key quoted | bare wherever bare is legal |
| **layout** | one line | lines, indentation, blank lines |
| **includes** | resolved | left as written |
| **residuals** | `integer&min(1)` | as the author spelled them |
| **unevaluable input** | none: a conflict has no canon | formatted anyway: a conflict is still a document |

Canon is what a document *means*. Formatted source is one way of
*writing* it, agreed in advance so that nobody argues about it and no
diff is about whitespace. `gofmt` is the model: one form, no options,
idempotent, and it never changes what the program does.

### Prior art, and what is taken from each

- **gofmt.** No configuration at all — that is the feature. `-w`
  writes, `-l` lists, `-d` diffs, `-s` applies simplifications that go
  beyond layout. It preserves every comment and never *breaks* a line
  the author did not break: it joins, indents and aligns, but a long
  line stays long. Taken: all of that, including the split between
  layout (always) and simplification (opt-in).
- **`cue fmt`.** The nearest relative: CUE is a unification language
  whose idiomatic source leans on colon chains, `a: b: c: 1`, and its
  formatter keeps them. Taken: chains are the ordinary spelling of
  nesting, not a shorthand to be expanded.
- **Black.** "Uncompromising", and one argument worth borrowing
  whole: it does not align trailing comments or values into columns,
  because alignment makes a one-line edit into a many-line diff.
  Taken: no alignment (§3.7).
- **prettier.** A *print width* it packs to (80), and `bracketSpacing`:
  braces are padded, `{ a: 1 }`, brackets are not, `[1, 2]`. Taken:
  the packing budget and the padding rule (§3.5).
- **rustfmt, `terraform fmt`, `jsonnetfmt`.** `--check` for CI, exit
  non-zero on a file that would change. Taken.

## 2. What the formatter promises

Six properties, and the implementation plan in §7 says how each is
held rather than hoped for.

**P1 — One form.** No options that change the output. Two people
formatting the same document get the same bytes.

**P2 — The same document.** `aontu hash` of the input equals
`aontu hash` of the output, for every input that has a hash. The only
equivalences the formatter may use are the three laws of unification —
idempotent, commutative, associative — and the spellings the parser
already treats as one. §3 names each rewrite and which of those it
rests on; nothing else is permitted.

**P3 — Idempotent.** `fmt(fmt(x)) = fmt(x)`, byte for byte, and the
whole corpus is the test.

**P4 — Nothing lost.** Every comment, every blank-line break the author
put between groups, the order of every key and element, the spelling
of every number, the contents of every string. What the formatter
touches is whitespace, commas, quotes where two spellings are one, and
brackets where the language does not need them.

**P5 — It checks its own work.** Before it writes a byte, the
formatter re-parses what it is about to write and compares the parse
tree with the input's; where it applied a rewrite that goes beyond the
parse tree (§3.4), it checks that rewrite by unification, locally. A
formatter that cannot prove its output is the same document refuses
and says so, exit code and all, rather than writing it. `gofmt` does
not need this, because it prints from a syntax tree it never
transforms; this formatter transforms, so it proves.

**P6 — Both ports, one spec.** The formatted text is behaviour under
ADR-001: `test/spec/fmt.tsv` holds source-to-formatted rows executed by
both runners, and the two CLIs are diffed byte for byte over the
corpus.

## 3. The form

### 3.1 Lines

- Two spaces per level of indentation; never tabs. (The corpus: 1,414
  lines at two spaces, 849 at four — which is two levels — and nothing
  at a tab.)
- `LF` line endings, no trailing whitespace, exactly one newline at the
  end of the file. Runs of blank lines collapse to one (§3.8).
- **A packing budget of 80 columns.** The budget decides which of two
  legal spellings to use — one line or several — and nothing else.
  **The formatter never breaks a line.** A scalar that is 200
  characters wide stays 200 characters wide; a conjunction of five
  calls that runs to 110 columns stays on its line. `gofmt` makes the
  same choice, and for the same reason: the formatter that breaks
  lines is the formatter whose output nobody can predict. (Corpus: 140
  of 8,508 lines exceed 80 columns; the longest is 10,506, a fixture
  holding one number.)

### 3.2 A pair

A pair is `key: value` — no space before the colon, one after — and it
is **atomic**: the key, the colon and the value are never on different
lines. At the level of a statement (§3.3) every pair has its own line,
so `a: 1 b: 2` on one line becomes two lines. Inside an inline
container (§3.5) the colon is tight, `{ a:1 b:2 }`, and the space
between pairs is what separates them.

Optional keys keep the marker tight to the key, `port?: integer`. A
spread is `&: value`. An alias declaration is `%Name: value`.

### 3.3 Braces are for shape, not for nesting

Aontu does not need a brace to say "inside": `a: b: c: 1` is
`{"a":{"b":{"c":1}}}`, and the parser builds the same tree from either
spelling. The formatter uses that everywhere it can, because every
brace it does not write is a closer it does not have to stack:

```
# written                     # formatted
a: {                          a: b: c: 1
  b: {
    c: 1
  }
}
```

**D1 — Chains.** A pair whose value is a map holding exactly one entry
is written as a chain: the value's single pair follows the key,
recursively. `a: {b: 1}` and `a: b: 1` are one document
(`aon1-gVzmkHO_…` from both). The root map has no braces at all.

One exception, decided at X-7: **a map whose only entry is a spread
keeps its braces**, `a: { &: integer }`. The chain `a: &: integer` is
legal and is the same document, but the braces are what say "this is a
map shape" — a spread alone reads as a constraint on `a` rather than
on `a`'s members, which is the opposite of what it does.

The same collapse applies to a list element: a one-key map in list
position is written as a pair element, `[a:1 b:2]` for
`[{a:1},{b:2}]` (`aon1-3crbLgG3…` from both), which the language
reference already documents as the same document.

Two things are deliberately *not* chained, because they are
expressions rather than statements: a map that is an operand
(`a: {b:1} & T` keeps its braces — the `&` needs an operand to bind
to), and a map that is a call's argument (`spec: hide({...})`,
`s: close({a:1})`). Inside those braces the rules of this section
apply again to each entry.

### 3.4 Repeat the prefix

**D2.** When a pair's value is a map of several entries and the whole
pair does not fit on one line (§3.5), the formatter does *not* open a
brace and indent. It writes one statement per entry, each carrying the
key again:

```
# written                                 # formatted
server: {                                 server: host: "0.0.0.0"
  host: "0.0.0.0"                         server: port: 8080
  port: 8080                              server: tls: { enabled:true cert:"/etc/tls/cert.pem" }
  tls: { enabled: true,
         cert: "/etc/tls/cert.pem" }
}
```

This is the suggestion at the origin of this note, and it is legal
only because of what Aontu is. `s: {a: 1, b: 2}` and the two
statements `s: a: 1` / `s: b: 2` are one document — `aon1-RU6XbBs_…`
from both — because a key written twice is a meet, and the meet of two
maps with disjoint keys is their union. The same holds through an
optional key (`s?: a: 1` / `s?: b: 2`, `aon1-uRZIq3CZ…` either way),
through a spread (`s: { &: integer }` / `s: a: 1`, `aon1-RV1jsawl…` —
the repeated spread entry is a one-entry map holding only a spread, so
by D1's exception it keeps its braces), and through depth (`s: a: 1` / `s: b: c: 2` / `s: b: d: 3` is
`s: {a: 1, b: {c: 2, d: 3}}`, `aon1-hQg010sm…`). No other language's
formatter could make this rewrite; in a last-write-wins language the
second `server:` would erase the first.

What it buys, beyond fewer brackets:

- **No indentation.** A value three maps deep is written at the left
  margin: `catalog: services: web: port: 8080`.
- **Every line says where it is.** A reader of one line knows the full
  path; a `grep` for `server:` finds every fact about the server; a
  diff that changes a port touches one line, and the line names what
  changed.
- **The lines are independent.** Because the meet is commutative and
  idempotent, the statements can be reordered, split across files, or
  duplicated without changing the document. The formatter does none of
  those, but the form makes them safe for the author.

**The decision procedure.** For a pair whose value is a plain map
literal in statement position, in this order:

1. **One line**, if the pair written as `key: { a:v b:v … }` fits the
   budget and holds no comment and no multi-line value.
2. **Repeat**, if every entry, written with the prefix in front of it,
   is itself a one-liner by rule 1 — recursively, so a nested map that
   fits stays inline on its line and one that does not repeats further.
3. **A braced block**, otherwise: `key: {` on the pair's line, each
   entry a statement at one more level of indentation, `}` alone on its
   line. A block is what is left for a map some entry of which cannot
   be a single line — a long list, a map with a comment inside it, a
   value that is a multi-line string.

There is no numeric cap on repetition: a map of forty short pairs is
forty statements. That is what the suggestion asks for, the
greppability argument holds at forty as it does at four, and a cap
would be a second magic number after the budget. X-2 in §11 records
the doubt.

**Merging goes the other way too.** Adjacent statements at one level
that name the same key — `s: a: 1` directly followed by `s: b: 2` —
are one map to the formatter, which then re-decides their layout by
the same procedure: if `s: { a:1 b:2 }` fits, that is what is written.
Otherwise the formatter would not be idempotent across spellings, and
`fmt` would have two agreed forms for one document. Only *adjacent*
statements merge: a `server:` line, then something else, then another
`server:` line stays as it is, because merging them would move a
statement, and the formatter never reorders (§3.13). Comments attached
to a statement (§3.7) travel with its entry.

**What the rule never touches.** Anything that is not a plain map
literal in statement position. A map wrapped in a call is an
expression, and splitting it changes the document: `s: close({a: 1})`
/ `s: close({b: 2})` does not evaluate at all, where
`s: close({a: 1, b: 2})` does (`aon1-nmSY0UG9…`). The same for
`type()`, `hide()`, an operand of `&` or `|`, a list element, and the
argument of any function. Those keep their braces, and inside them the
entries are laid out by §3.5.

### 3.5 Containers on one line, and on several

**D5 — a pair stays together.** A map whose one-line spelling fits the
budget is written on one line, padded inside the braces and with the
colons tight:

```
limits: { rps:100 burst:200 }
routes: [get:"/health" post:"/orders"]
ports: [80 443 8080]
```

Braces are padded and brackets are not — prettier's `bracketSpacing`,
and for prettier's reason: `{a:1 b:2}` runs the delimiter into the
first key, while `[80 443 8080]` reads as a row. The tight colon inside
an inline map is the suggestion at the origin, and the argument for it
is the one against the alternative: `{ a: 1 b: 2 }` has two kinds of
space that mean different things and look the same, where `{ a:1 b:2 }`
binds each pair into a visible unit and leaves the space to separate
units. It is also the more common spelling in the corpus today
(1,266 of 1,952 one-line maps). X-1 records the cost — the form has
one spelling of a pair at statement level and another inside braces.

A container goes to several lines when it does not fit, or when it
holds a comment (a comment runs to the end of its line, so a container
with one inside cannot be on one line), or when an element is itself
several lines. Then:

- **A list** puts each element on its own line at one more level, and
  the closing bracket alone on a line. An element that is a one-key map
  is a pair element; an element that is a wider map is either an inline
  map, if it fits, or a braced block.

  ```
  fields: [
    { n:"id" t:"string" req:true }
    { n:"email" t:"string" req:false }
  ]
  ```

- **A map in statement position** repeats or blocks by §3.4.
- **A map in expression position** — an operand, an argument, a list
  element — is a braced block: `{` at the end of the line that opens
  it, entries as statements one level in, `}` alone. The `& {` at the
  end of a line is the ordinary spelling of a constrained map:

  ```
  CatalogEntry: $.std.Service & {
    owner: %Owner
    tier: 1 | 2 | 3
    dependsOn?: rel($.std.Service) & %CatalogAddr & acyclic() & inverse(dependedOnBy)
  }
  ```

  (That third line is 83 columns where it sits and stays so; §3.1.)

Empty containers are `{}` and `[]`, always inline.

### 3.6 Separators

**No commas** between pairs or between elements. A newline or a space
separates, the language needs nothing more, and a comma is a character
that carries no information and has to be argued about at the end of
every line. Commas on input are accepted wherever the parser accepts
them — between entries, and trailing (`[1,2,]` is `[1,2]`) — and are
dropped.

**Commas stay in a call's argument list**, `match(.t, "string", "x")`,
with one space after each. The parser does not need them there either
(`match(1 1 "x" 2 "y")` parses), but arguments are positional, a comma
is what marks a position, and `min(1 2)` is a line a reader has to
think about. X-3 records the inconsistency.

### 3.7 Comments

Only `#` comments exist, and every one is kept, its text untouched.

- **An own-line comment** attaches to the statement that follows it,
  and is indented to that statement's level. A comment that is
  followed by a blank line and then a statement still attaches to the
  statement, blank line kept; a comment at the end of a block, with
  nothing after it but the closer, stays at the end of the block.
- **A trailing comment** stays on its line, one space after the last
  token: `port: 8080 # the admin port`. Trailing comments are **not
  aligned into a column** across lines — Black's argument: alignment
  turns one changed line into a diff of every line around it.
- A comment inside a container forces the container onto several
  lines (§3.5), which is the only way the comment can keep its place.
- A comment on the line that opens a block stays there:
  `server: { # what the edge sees`.

### 3.8 Blank lines

A blank line is a paragraph break the author chose, and the formatter
keeps it: any run of blank lines becomes exactly one. None at the
start or end of a block, none between a comment and the statement it
attaches to, none at the start of the file; one at the end, which is
the final newline.

### 3.9 Keys and strings

- **A key is bare when it can be.** A quoted key whose text is a legal
  bare key — `[A-Za-z_][A-Za-z0-9_]*` — is written bare; `"host": 1`
  becomes `host: 1`. Anything else stays quoted, and a key whose
  quoting *means* something is never touched: `"a?": 1` is a key named
  `a?`, where `a?: 1` is an optional `a`.
- **Strings keep their quoting**, with one normalisation: a
  single-quoted string becomes double-quoted, `'plain'` → `"plain"`,
  unless it contains a double quote — `'say "hi"'` stays as it is,
  because the alternative is `"say \"hi\""`, an escape the author did
  not write. Backtick strings are never touched: they carry newlines,
  and their interior is verbatim, indentation included. A string's
  *content* is never changed.
- **Bare strings stay bare, quoted stay quoted.** The formatter does
  not unquote `"Mercury"` to `Mercury` or quote `Mercury` to
  `"Mercury"`, although both are the same document: which is clearer
  is the author's call, and a rule that unquoted would have to know
  every word that is not a bare string (`true`, `null`, `top`, `nil`,
  `_`, a number) and every word that may become one.

### 3.10 Numbers are never rewritten

`1`, `1.0`, `0d1`, `0d1.0` are four different values — integer, float,
biginteger, bigdecimal — and `1_000`, `0x1f`, `1e3` are spellings the
author chose for a reason. The formatter copies a number's source text
exactly. There is no normalisation that is safe here: `1.0 → 1` changes
the kind, and `0x1f → 31` loses the base the author was thinking in.

### 3.11 Operators, preferences, calls

- Binary operators are spaced: `a & b`, `a | b`, `a + b`.
- A preference is tight: `*8080 | 9090`, `**{ x:1 }`.
- Calls: `name(arg, arg)`, no space before the parenthesis, none inside
  it, a comma and a space between arguments (§3.6). An empty argument
  list is `name()`.
- References and paths are copied as written: `$.a.b`, `.n`, `%Name`,
  `$var`, `_`.
- **Parentheses are the author's.** The formatter neither adds nor
  removes a grouping parenthesis; `gofmt` keeps them too. Precedence is
  documented, but a parenthesis is often there for the reader.

### 3.12 The root

The root map has no braces. `@"…"` includes and `%Name:` alias
declarations are statements like any other, kept where the author put
them and in that order: a file that starts with its includes, then its
aliases, then its body reads well, and the formatter has no reason to
impose that or to disturb it.

### 3.13 Never

The formatter never: reorders a key, an element, an include or a
declaration (canon sorts, and that is one of the reasons canon is not
this form — the author's order is the narrative); renames a key
(§4.1 is advice, not a rewrite); introduces an alias (§4.2 likewise);
resolves an include or reads any file it was not given; evaluates the
document, beyond the local checks P5 needs; changes a number, a string's
content, or a parenthesis; breaks a line.

## 4. Style beyond the formatter

Two of the origin's suggestions are not things a formatter can do,
because doing them changes the document. They are style — the
*Effective Go* half of the pair whose *gofmt* half is §3 — and the
tool can point at them without touching them.

### 4.1 Names

**D4.** Keys are lower-case words, or CamelCase when a key is several
words: `host`, `dependsOn`, `CatalogEntry`. Not `snake_case`, not
`SCREAMING_CASE`. A bare key cannot contain `-` (`a-b: 1` is not a
key), so the only separator available is `_`, and the suggestion is not
to reach for it.

The formatter **never renames a key** — `credit_cents` in a model that
mirrors a SQL column is that column's name, and a tool that changed it
would break the generator that reads it. What it can do is say so:
`aontu fmt --lint` reports `style/key-case` for a key holding `_` or
an initial capital followed by more capitals, on stderr, without
changing the exit code unless `--strict` is given.

### 4.2 Aliases for what recurs

**D3.** A value written twice is a value that can drift. An alias,
`%Owner: string & re("^team-[a-z]+$")`, names it once, generates
nothing and changes no hash — the use cases already lean on this. The
suggestion is to prefer one wherever a shape recurs.

Introducing one is a refactoring, not a formatting: it picks a name,
and it moves a definition to the root, which the formatter must not do
(§3.13). `--lint` can report `style/repeat` — a subtree whose canon
appears two or more times in the file, above some size — with the
count and the sites, and leave the naming to the author. This is the
least certain part of the note; §11 X-5.

### 4.3 What the lint is not

Not a second formatter, not fatal by default, not a home for rules the
formatter could apply mechanically. If a `--lint` finding ever has a
mechanical fix that preserves the document, it belongs in §3, and the
lint rule is retired.

## 5. The verb

```
aontu fmt [options] <file>...
aontu fmt < in.aon > out.aon
```

| option | does |
|---|---|
| (none) | the formatted text on stdout; one file, or stdin |
| `-w`, `--write` | rewrite each file in place, only if it would change |
| `-l`, `--list` | print the name of each file whose formatting would change |
| `--check` | like `--list`, and exit 1 if any would — the CI gate, as `view --check` is |
| `-d`, `--diff` | a unified diff per file that would change |
| `--lint` | the §4 findings on stderr |
| `--strict` | a `--lint` finding exits 1 |

Exit codes follow the other verbs: `0` formatted or clean; `1` a
`--check` file would change, or a `--strict` finding; `2` usage;
`4` a file does not parse, with the parse error as the other verbs
print it — a document with a *conflict* is formatted (it parses), a
document with a *syntax error* is not.

With several files and no `--write`, `--list`, `--check` or `--diff`,
the verb refuses with a usage error rather than concatenate them to
stdout; X-6.

`fmt` takes no `--trust` and no `--text-ext`: it reads the files it is
given and nothing else. It does not resolve includes, so it needs no
capability to.

## 6. Worked examples

Hand-formatted to §3; the hashes of the before and after are the
argument that they are one document. *(Argument, not output — nothing
here has run.)*

**A JSON-ish configuration.** As an author coming from JSON writes it:

```
{
  "server": {
    "host": "0.0.0.0",
    "port": 8080,
    "tls": { "enabled": true, "cert": "/etc/tls/cert.pem" }
  },
  "features": ["auth", "metrics"],
  "limits": { "rps": 100, "burst": 200 }
}
```

Formatted — root braces gone (§3.12), keys bare (§3.9), commas gone
(§3.6), `server` repeated because its one-line form is 82 columns
(§3.4), `limits` inline because its one-line form is 29 (§3.5):

```
server: host: "0.0.0.0"
server: port: 8080
server: tls: { enabled:true cert:"/etc/tls/cert.pem" }
features: ["auth" "metrics"]
limits: { rps:100 burst:200 }
```

**The code-generation model.** `use-cases/15-code-generation/model.aon`
today, one record of it:

```
records: [
  {
    name: "Customer"
    sql:  "customer"
    fields: [
      {n: "id",     t: "string",  req: true,  go: "ID",     sql: "id"}
      {n: "email",  t: "string",  req: false, go: "Email",  sql: "email"}
    ]
  }
]
```

Formatted — the element maps are inline (they fit), the record is a
braced block (its `fields` cannot be one line), the aligned padding
after `sql:` goes (§3.7's argument against alignment applies to values
too), the comment block above `records:` — not shown — stays exactly
where it is:

```
records: [
  {
    name: "Customer"
    sql: "customer"
    fields: [
      { n:"id" t:"string" req:true go:"ID" sql:"id" }
      { n:"email" t:"string" req:false go:"Email" sql:"email" }
    ]
  }
]
```

**A constrained map with comments.** From
`use-cases/01-service-catalog/spec.aon`, the shape is already the form:
an operand map is a braced block (§3.5), the comments inside it hold it
open (§3.7), and the 83-column line stays (§3.1). The formatter would
change nothing but the `# ...` comment indentation where it drifted.

**Depth.** The language reference's own example is already formatted:

```
a: b: c: 1
a: b: d: 2
a: e: 3
```

is `{"a":{"b":{"c":1,"d":2},"e":3}}`, and the braced spelling of it
would be five lines and three closers.

## 7. Implementation

### 7.1 Where the tokens come from

A formatter needs what the value tree throws away: comments, blank
lines, the quote a string used, the spelling of a number. Both ports
already have it. The parser stack under `ts/src/lang.ts` and
`go/lang.go` is `@tabnas/jsonic` over `@tabnas/parser`, and both expose
a **lex subscriber** — `jsonic.sub({ lex })` in TypeScript,
`Tabnas.Sub(lexSub, ruleSub)` in Go — that is called with *every* token
the lexer produces, comments (`#CM`), spaces (`#SP`) and line runs
(`#LN`) included, each with its source text and row/column. Probed:
with the comment configuration aontu already sets (`#` only, lexed),
`a: 1 # trailing` arrives as `#TX #CL #SP #NR #SP #CM #LN`, and a double
newline as one `#LN` token whose text is `"\n\n"`. Nothing has to be
written to see the source; the formatter reads the stream the parser
reads, from the same lexer, in both ports, which is what makes P6 a
plan rather than a wish.

### 7.2 The pipeline

1. **Lex and parse once**, through the ordinary aontu parser with the
   subscriber attached: the token stream for layout, the parse for
   structure, and the parse error — if any — for exit 4.
2. **Build a layout tree** from the two: statements, their values as
   spans of tokens, comments attached by the rules of §3.7, blank-line
   breaks from the `#LN` tokens.
3. **Decide the shape** of every map by §3.4's procedure and every
   list by §3.5, measuring one-line spellings against the budget.
4. **Emit.**
5. **Check** (§7.3), then write.

Step 3 is where the whole of §3 lives, and it is pure string logic over
a tree — the part that ports function for function.

### 7.3 The check

Two tiers, matched to the two kinds of rewrite in §3.

**Syntactic rewrites** — whitespace, commas, quotes, bare keys, chains,
pair elements — leave the parse tree unchanged: `a: {b:1}` and
`a: b: 1` are one tree to the parser. The check is to parse the output
and compare the two trees structurally, positions aside. It is cheap
and it always applies, conflict or not.

**Lawful rewrites** — the split and the merge of §3.4 — change the
tree and rely on the meet. Each is checked where it happens: the map
that was split, and the statements it became, are evaluated in
isolation, and their canons, the kinds of failure they collect, and
the outcome of generating them are compared. Local, so it needs no
include and no capability, and it applies whether or not the document
as a whole evaluates. The whole-document `aontu hash` equality of P2
is then a property of the test suite (§7.4) rather than a runtime
check, because a document that does not evaluate has no hash to
compare.

A check that fails is not a formatter bug, and it is not a refusal
(amended in P2, §7.8): the statement keeps its syntactic spelling. The
check is the engine's agreement that the two spellings are one
document, and the engine's own repros hold maps whose two spellings it
evaluates differently. The formatter never writes a spelling its
engine evaluates differently; it does not fix the engine.

### 7.4 The shared spec

`test/spec/fmt.tsv`, four columns: `name`, `fmt`, `src`, `expect`,
with `expect` the formatted text under the suite's escapes. Both
runners assert three things per row: `fmt(src) == expect`;
`fmt(expect) == expect`; and, where `src` evaluates,
`hash(src) == hash(expect)`. Rows are written from the canonical port
and held to the Go port as every other file is. The rows pin every
rule in §3 by example, and every exclusion — a call's map not split, a
non-adjacent repeat not merged, a number not rewritten.

### 7.5 The gates

- **Idempotence over the corpus:** every `.aon` under `use-cases/` and
  `test/spec/files/`, and every `aon` fence in the documentation, is
  formatted twice and the second run changes nothing. In `docs.test.ts`
  for the fences, in a new `fmt.test.ts` for the files.
- **The use cases still pass** after their sources are formatted —
  every case pins its outputs, so `run-all.sh` over a formatted tree is
  an end-to-end proof of P2 on 400 real documents.
- **The two CLIs agree** byte for byte over the corpus, the parity
  probe this repository already runs for every verb.
- **Later, the documentation is formatted:** every `aon` fence on a
  published page is `fmt`-clean, gated in `docs.test.ts`, as Go's
  documentation is `gofmt`-clean. That is a large diff and a phase of
  its own.

### 7.6 Phases

| phase | delivers | size |
|---|---|---|
| **P0** — the decisions | this note reviewed; §11 answered or deferred explicitly | — |
| **P1** — layout | the verb in both ports with the syntactic rewrites only: §3.1–3.3, 3.5–3.13; `fmt.tsv`; the corpus idempotence gate; `--write`, `--list`, `--check`, `--diff`. **LANDED 2026-09-03** — `ts/src/format.ts`, `go/format.go`, `test/spec/fmt.tsv` (103 rows); the amendments are in §7.7 | M |
| **P2** — the lawful tier | §3.4 split and merge, with the local unification check; rows for every exclusion; the use-case tree formatted and `run-all.sh` green. **LANDED 2026-09-03** — `fmt.tsv` at 147 rows, the tree formatted (174 files); the amendments are in §7.8 | M |
| **P3** — the documentation | every fence formatted and gated; STYLE-GUIDE adopts the form; a how-to, *Format a document*; a reference section, *The formatted form*, published from this note's §3 | M |
| **P4** — lint | `--lint`, `style/key-case`, `style/repeat`, `--strict` | S/M |

P1 before P2 on purpose: a formatter that only lays out is already
useful and already checkable, and the lawful tier is the part with an
open question against it (X-2, X-4).

### 7.7 P1 as landed

What the implementation settled that §3 left open, and where it
departs from the note. Each is pinned by a row of `fmt.tsv`.

- **Line breaks inside an expression are kept** (§3.11 said nothing).
  The formatter never breaks a line, and it does not join lines the
  author broke either: a break at a binary operator stays, `gofmt`'s
  own rule. The break is normalised to *before* the operator, which
  then leads its continuation line — `a: 1` / `  | 2` — because a
  disjunction of alternatives reads as the list it is. The continuation
  is one level in when the expression follows a key on its line, and
  level with the first operand when the expression has the line to
  itself (an argument of a block call). A comment inside an expression
  ends its line and the value continues one level in.
- **A call has three shapes** (§3.5 gave one). Its one-line form when
  that fits; a single container argument hugging the parentheses,
  `hide({` … `})`, when it does not; the arguments on one line however
  wide when each has a one-line form (the never-break rule); and a
  block, `type(` / one argument per line / `)`, when an argument is
  itself several lines — a disjunction of closed shapes, a comment
  among the arguments. The same for a parenthesis. *Amended in P2
  (§7.8): the never-break rule for arguments holding a container is
  withdrawn, and the hug is the last argument's.*
- **A spread is padded inside braces**, `{ &: integer }`, where a pair
  is tight, `{ a:1 }`: the marker reads as a marker and not as a key,
  and it is how every example in this note and in the use cases writes
  it.
- **An empty list slot is `nil`.** `[1,,2]` is `[1,nil,2]` to the
  parser, so dropping the comma would drop an element; the formatter
  writes the element the parser read. A map's stray comma is nothing.
- **A chain through a spread takes the braces**, `a: &: integer` →
  `a: { &: integer }`: X-7 named the braces the agreed form, so the
  bracket-free spelling is read as the map it is.
- **§3.8, corrected.** A blank line between a comment and the statement
  it precedes is the author's and stays, as §3.7 says; §3.8's "none
  between a comment and the statement it attaches to" was the opposite
  claim and is withdrawn.
- **The self-check refuses under its own code**, `format_check`, class
  `internal`, with the input's parse tree in `expected` and the text it
  would have written in `actual` (P5's two spellings). The check is
  injectable — a hook in TypeScript, a package variable in Go — so the
  refusal is exercised by the suites without a formatter that is wrong.
- **The file names are `format.ts` and `format.go`**, not `fmt.*` (§8):
  a Go file named `fmt.go` reads as the standard package.
- **`--diff` is a patience diff**, written the same way in both ports
  so the two CLIs print identical bytes; not always the shortest edit
  script, and linear in space.
- **CRLF is a change.** The input is read with `\r\n` as `\n`, the
  output is LF, and `--check` reports the file.
- **A depth budget.** A document nested more than 1000 levels deep —
  the evaluation budget, past which unification itself refuses — is
  refused with `max_depth` rather than read: the layout is recursive,
  as the tree it reads is, and the canonical port's stack gives out
  somewhere past that; both ports refuse at the same depth, so the CLIs
  agree on the two fixtures that nest to 1200 maps and 1500 calls.
- **The gates as landed:** 103 `fmt.tsv` rows under the three assertions
  of §7.4; every `.aon` under `use-cases/` and `test/spec/files/` (400
  files, 396 formatted, the 4 that do not parse refused for their
  syntax) and every Aontu fence in the documentation (263) format to a
  fixed point, in both ports; 100 % coverage in both.

### 7.8 P2 as landed

The lawful tier of §3.4, in both ports, and what building it over the
corpus settled. Each is pinned by a row of `fmt.tsv` or by a case in
`ts/test/format.test.ts` and `go/format_test.go`.

- **The check is the engine's agreement, and failing it keeps the
  spelling before** (§7.3, amended). Formatting the use cases found
  two documents whose two spellings the engine evaluates differently
  — `use-cases/BUGS.md` §75 (a spread template's `key()` through a
  reference, TypeScript only) and §76 (a key reaching a map through
  the meet of two statements is an *expectation*, as a spread's key
  is, in both ports). A refusal would make those files unformattable
  for an engine defect; instead the statement stays as the syntactic
  tier wrote it, which is a fixed point too. §75 is the one file in
  the repository the two ports format differently, by design of the
  check: each port defers to its own engine.
- **The check compares generation as well as the meet.** §76 showed
  the engine generating from more than the canon: the same canon, and
  a key refused in one spelling. So the check compares the canon, the
  kinds of failure collected (kinds, not counts — one unresolved
  reference is reported once by a block and once per key it reaches
  by the statements), and the outcome of generation: generated, or
  the first refusal.
- **Two spreads never share a map.** `s: { &: A }` / `s: { &: B }`
  stays two statements, and a map holding two spreads keeps its
  braces however wide: the engine keeps two spread entries as a
  conjunction, whose canon is not the meet of the two maps.
- **A trailing comment travels onto the last entry** of the statement
  it closed when statements merge (`s: { a: 1 } # x` / `s: b: 2` is
  `s: a: 1 # x` / `s: b: 2`), and a statement whose comment has no
  entry to sit on (`s: {} # x`) does not merge. Comments and blank
  lines *between* merged statements stay between the entries, in the
  merged map's block or between the repeated lines. A map whose last
  entry is a comment keeps its braces: the repeat has nowhere to put
  the comment that keeps it in the map.
- **Two `fmt.tsv` rows moved.** `fmt-repeat-not-merged` became
  `fmt-merge-adjacent` (`s: a: 1` / `s: b: 2` is `s: { a:1 b:2 }`
  now), and `fmt-comment-holds-block-open` became
  `fmt-comment-first-entry-repeats`: a comment before a map's first
  entry is repeated with it, as any other entry is.
- **The repeat is checked once, at the outermost statement it
  rewrites**, chain heads included: `a: b: { c: 1, d: 2 }` too wide is
  `a: b: c: 1` / `a: b: d: 2`, and the check compares the whole
  statement, at its indentation.
- **Calls, amended.** Formatting the corpus under the never-break rule
  for arguments produced lines of 200 to 500 columns —
  `hide(pack($.schema, { d: { … } }))` on one line — so the rule now
  holds only for *flat* arguments, none of which holds a container: a
  scalar is no narrower on a line of its own. Otherwise the last
  argument hugs the parentheses when it is a container, an expression
  the author did not break that ends in one, or a call whose own last
  argument hugs — `close($.E & {` … `})`, `type(close({` … `}))`, the
  schema idiom — and the arguments before it fit on the opener's line;
  and the call is a block, one argument per line, when none of that
  holds. `match(.plan, free, close({…}), …)` too wide is a block of
  seven lines, one argument each: the pairing the author drew with
  alignment is not a thing a formatter knows.
- **Separators, amended (§3.6, X-3).** The author's separators in a
  call are kept — a comma stays a comma, a space stays a space —
  rather than spaces normalised to commas. The parser reads
  `must((v) => 0 <= v, "not negative")` as a run of six arguments, and
  the normalised `must((v), =>, 0, <=, v, "not negative")` is the same
  tree and no predicate anyone can read. In a block, a comma follows an
  argument only where the author wrote one.
- **The gates as landed:** 147 `fmt.tsv` rows; the 400-file corpus and
  the 263 fences at a fixed point in both ports; the use-case tree
  formatted in place (174 files changed, the generated `mod-lock.aon`
  and the repro register left as written) with `run-all.sh` green and
  the source positions its checks and READMEs quote moved with the
  text; 100 % coverage in both.

## 8. Parity and determinism

The output is a function of the input bytes and nothing else: no
locale, no terminal width, no clock. Map keys are never iterated in
hash order (both ports carry source order through the parse already).
The width of a one-line spelling is measured in code points, the same
in both ports. The Go twin of `ts/src/fmt.ts` is `go/fmt.go`, function
for function, and `test/spec/fmt.tsv` is what they must agree on.

## 9. Boundary: what this will not do

- **No options.** Not indent width, not line width, not comma style.
  The first option is the end of "an agreed form".
- **No line breaking.** §3.1.
- **No reordering, renaming, aliasing, or resolving.** §3.13.
- **No formatting of what is not Aontu.** A `.json`, `.yaml` or
  `.toml` include is another language's file; `fmt` formats `.aon` and
  stdin.
- **No `--fix` for the lint.** §4.3.

## 10. Risks

- **The repeat rule surprises people.** `server:` written six times
  looks wrong to anyone arriving from JSON, and it *is* wrong in JSON.
  The mitigation is the one this note leans on: the form is only
  legal because of the meet, the published explanation of the form
  says so, and the inline rule (§3.5) means short maps never repeat.
  If it turns out to read badly at scale, X-2's cap is the dial.
- **Two spellings of a pair** (`a: 1` at statement level, `a:1` inline)
  is the kind of thing that generates a bug report a month. X-1.
- **The lawful tier is a real transformation**, and its correctness
  argument rests on the meet of maps, which has edges — spreads,
  optional keys, aliases at the root, `close()`. Every edge this note
  probed came out equal except `close()`, which is excluded; the ones it
  did not probe are excluded until they are (X-4), and P2 lands the
  tier behind the local check.
- **The parser stack is pinned**, and the formatter reads its token
  stream. A parser bump that changed token names or the comment
  configuration would break the formatter loudly; the spec rows would
  catch it before a release.

## 11. Open questions

- **X-1 — Tight colons inside inline maps.** `{ a:1 b:2 }` as the
  origin wrote it, or `{ a: 1 b: 2 }` for one spelling everywhere?
  Recommendation: as written, for the reason in §3.5, and revisit if it
  generates the bug reports §10 predicts. **Decided 2026-09-03:
  tight.**
- **X-2 — A cap on repetition.** None, per §3.4, or repeat only up to
  *n* entries and block beyond? Recommendation: none; add a cap only
  from evidence. **Decided 2026-09-03: no cap.**
- **X-3 — Commas in calls.** Keep them (§3.6) or drop them for
  consistency with maps and lists? Recommendation: keep. **Decided
  2026-09-03: keep.** P2 narrowed it: a comma the author wrote is
  kept, and one the author did not write is not added (§7.8), because
  a predicate's tokens are arguments to the parser.
- **X-4 — The lawful tier's edges.** Spreads and optional keys are
  probed equal and included; a map holding an alias *declaration* is
  root-only and never nested, so it does not arise; a map whose
  repeated key carries a `?` on one line and not another cannot be
  produced by the formatter. Anything else? Recommendation: P2 lands
  with exactly the probed set and a row per exclusion. **Landed
  2026-09-03 so:** the exclusions are a map with two spreads, one
  holding an include, one with a comment on its opener or as its last
  entry, and a statement whose trailing comment has no entry to sit
  on, each with its row; and two edges the probes did not reach, which
  the check found and the engine owns (§7.8, BUGS.md §75 and §76).
- **X-5 — `style/repeat`.** Worth building, and at what size threshold?
  Recommendation: defer to P4 and decide with the first three lint
  rules' reception. **Decided 2026-09-03: build it in P4, advisory
  only; the threshold from the corpus when it lands.**
- **X-6 — Several files, no flag.** Refuse, or print them concatenated
  as `gofmt` does? Recommendation: refuse; concatenated output is never
  what anyone wanted. **Decided 2026-09-03: refuse.**
- **X-7 — A chain through a spread.** `a: &: integer` is legal and
  bracket-free; `a: { &: integer }` is the idiom readers know.
  Recommendation was the chain, by D1. **Decided 2026-09-03: the
  braces.** §3.3 carries the exception and the reason — a spread alone
  reads as a constraint on the key rather than on its members.

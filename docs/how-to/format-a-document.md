---
description: Put a document in the agreed form with `aontu fmt`, gate a repository on it in CI, read what the formatter will and will not change, and point `--lint` at the style it never touches.
group: validate-evolve
order: 60
---

# Format a document

`aontu fmt` writes a document in one agreed form, in the tradition of
`gofmt`: two-space indentation, no commas between entries, braces only
where the language needs them, and a map that does not fit on one line
written as one statement per entry with its key repeated. What comes
back is the same document, with the same canon-hash, and formatting it
again changes nothing. The form itself is in the language reference,
[The formatted form](../reference-language.md#the-formatted-form).

Write this as `catalog.aon`, in whatever shape it arrived:

<!-- test: scenario fmt -->
<!-- test: file catalog.aon -->
<!-- fmt: keep the input the transcript formats -->
```aontu
services: {
  web: { image: "registry.acme.internal/web:4.7.3", port: 8080 },
  auth: {
    image: "registry.acme.internal/auth:5.2.0",
    port: 8443
  }
}
```

## See the form

With a file and no option, the verb prints the formatted text and
touches nothing:

<!-- test: run -->
```sh
$ aontu fmt catalog.aon
services: web: { image:"registry.acme.internal/web:4.7.3" port:8080 }
services: auth: { image:"registry.acme.internal/auth:5.2.0" port:8443 }
```

The commas are gone, each service is one line with the colons tight
inside the braces, and `services:` is repeated rather than opened as a
block: a key written twice is a meet, so the two statements are the
one map the source wrote. `--diff` shows the change as a unified diff
instead, which is what to read before rewriting a file you did not
write.

## Rewrite the file

`--write` rewrites each file in place, and only when its form would
change; `--check` says whether it would, and is the gate:

<!-- test: run -->
```sh
$ aontu fmt --check catalog.aon
catalog.aon
$ echo $?
1
$ aontu fmt --write catalog.aon
$ aontu fmt --check catalog.aon
$ echo $?
0
```

`--check` prints the name of every file whose form would change and
exits 1 when there is one, so a pipeline step of `aontu fmt --check
*.aon` fails the build on a file that is not in the form, and names
it. `--list` prints the same names without the exit code. Several
files need one of `--write`, `--list`, `--check` or `--diff`: the verb
does not print two documents as one stream.

## Point at style

Two things the origin of the form suggests are not the formatter's to
do, because doing them changes the document: keys as lower-case words
or CamelCase rather than `snake_case`, and an alias for a value that
recurs. `--lint` reports them and touches nothing. Write `deploy.aon`:

<!-- test: file deploy.aon -->
```aontu
services: web: limits: { cpu:"500m" memory:"256Mi" restart:"always" }
services: auth: limits: { cpu:"500m" memory:"256Mi" restart:"always" }
max_replicas: 4
```

<!-- test: run -->
```sh
$ aontu fmt --strict deploy.aon
deploy.aon:1:16: style/repeat: this map is written 2 times (again at 2:17); an alias would name it once
deploy.aon:3:1: style/key-case: key max_replicas holds an underscore; maxReplicas would follow the form
$ echo $?
1
```

Each finding is one line on standard error, `file:line:col: rule:
message`. `style/repeat` points at the first of the sites and names
the others: the map after `limits:` is written twice, and a map that
is 40 columns or wider and written twice is one that can drift. An
alias names it once, and the document is the same document.
`style/key-case` says what the key would be under the form and no
more: `max_replicas` may be the name a generator or a column reads,
so whether to rename it is the author's call. With an alias, the two
`services:` statements are short enough to be one map in the form.
Write `services.aon` with both taken up:

<!-- test: file services.aon -->
```aontu
%Limits = { cpu:"500m" memory:"256Mi" restart:"always" }
services: { web:limits:%Limits auth:limits:%Limits }
maxReplicas: 4
```

<!-- test: run -->
```sh
$ aontu fmt --strict services.aon
$ echo $?
0
```

`--lint` alone prints the same lines and leaves the exit code alone;
`--strict` is the gate, and `aontu fmt --check --strict *.aon` is both
gates in one step.

## What the formatter refuses, and what it never does

A document that does not parse is not formatted: the verb prints the
syntax error as every other verb does and exits 4, and the file is left
as it was. A document with a conflict in it is formatted, because it
parses; the conflict is the evaluator's business.

The formatter never reorders a key, an element, an include or an alias
declaration; never renames a key; never changes a number, a string's
content or a parenthesis; never resolves an include, so it needs no
`--trust`; and never breaks a line. A line that is too wide stays as
wide as it is. Where it repeats a key or merges two statements it
checks the rewrite with the engine first, and keeps the spelling it
was given when the engine evaluates the two differently.

The verb's options and exit codes are in the
[API reference](../reference-api.md#aontu-fmt).

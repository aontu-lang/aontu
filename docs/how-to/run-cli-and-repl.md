---
description: Evaluate a file, read from stdin, or question a document interactively with the `aontu` command.
group: run-embed
order: 10
---

# Run a file or start a REPL

Both implementations ship the same `aontu` command, and it decides what
to do from what you hand it: a file argument evaluates, piped input
evaluates, and an empty interactive terminal becomes a REPL. Three
inputs, one command.

Write this as `config.aon`:

<!-- test: scenario cli -->
<!-- test: file config.aon -->
```aontu
a: 1
b: $.a
```

Now run it, three ways:

<!-- test: run -->
```sh
$ aontu config.aon
{
  "a": 1,
  "b": 1
}
$ echo 'a:1 b:$.a' | aontu
{
  "a": 1,
  "b": 1
}
$ aontu --canon config.aon
{"a":1,"b":1}
```

Pretty-printed JSON is the default; `--canon` prints the
[canonical form](see-canonical-form.md) instead—the same document, as
the engine would write it back.

With no file and a terminal on stdin, `aontu` starts a REPL. Each line
is evaluated and printed, `:canon` and `:json` switch the output mode,
and `:quit` (or Ctrl-D) leaves:

<!-- test: skip interactive REPL session -->
```sh
$ aontu
Aontu v0.56.0 REPL — :help for commands, :quit to exit
aontu> a:*1|number
{
  "a": 1
}
aontu> :quit
```

`:load <file>` holds a document so that `:get`, `:keys` and `:why` can
question it—the same [query](query-a-path.md) and
[provenance](explain-a-value.md) surfaces the CLI verbs offer, from
inside the session. A harness can hold a session too: `--jsonl` drops
the banner and the prompt and answers each command as one JSON line,
so a program drives the REPL the way it drives the CLI. This
transcript was run exactly that way:

<!-- test: run -->
```sh
$ echo 'a:*1|number' | aontu --jsonl
{"ok":true,"out":"{\n  \"a\": 1\n}"}
```

One caution: the REPL evaluates each line as a complete document—there
is no continuation prompt, and the permissive parser closes what you
left open, so a half-typed `a: {` evaluates to `{"a":{}}` rather than
waiting for more. Paste whole statements.

Get the command with `npm install -g aontu` (or `npx aontu`) for the
TypeScript build; as a built binary for Linux, macOS or Windows from
the [releases page](https://github.com/aontu-lang/aontu/releases),
which needs no toolchain and has `aontu-lsp` beside it; or with
`go install github.com/aontu-lang/aontu/go/cmd/aontu@latest` for Go.
From a clone: `node ts/bin/aontu.js …`, or `go run ./cmd/aontu …`
inside `go/`. Both accept the same options and print the same bytes.

The full option, verb and REPL-command tables are in the
[CLI reference](../reference-api.md#command-line-interface). To keep
the answers inside a program instead of a terminal,
[call Aontu from TypeScript](call-from-typescript.md) or
[from Go](call-from-go.md).

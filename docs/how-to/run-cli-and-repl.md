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

Get the command in whichever of these fits the machine. Every one
installs the same `aontu`, whose `lsp` verb is the editor's language
server (the Go builds bring the standalone `aontu-lsp` binary too).

- `npm install -g aontu` (or `npx aontu`) for the TypeScript build.
- `curl -fsSL https://aontu.dev/install.sh | sh` on Linux or macOS:
  the script fetches the release archive for the platform, checks it
  against the release's `SHA256SUMS`, and puts the binaries in
  `~/.local/bin`; `AONTU_INSTALL_DIR` and `AONTU_VERSION` change the
  place and the release.
- A package from the
  [releases page](https://github.com/aontu-lang/aontu/releases): a
  `.deb`, `.rpm` or `.apk`, a zip for Windows, or the archive itself.
- `docker run --rm -v "$PWD:/work" ghcr.io/aontu-lang/aontu …`, the
  image on GitHub's registry, for containers and CI.
- `uses: aontu-lang/aontu/setup-action@main` in a GitHub workflow.
- `nix run github:aontu-lang/aontu`, or the flake as an input, built
  from source.
- `go install github.com/aontu-lang/aontu/go/cmd/aontu@latest` with a
  Go toolchain.

From a clone, `make install` puts both builds on `PATH`, each by its
own toolchain: `make install-ts` links the checkout as the global npm
package, so `make build-ts` updates the command in place, and
`make install-go` runs `go install` for `aontu` and `aontu-lsp`. Both
builds provide `aontu`, so `PATH` order decides which one answers and
`aontu --version` says which did. Without installing:
`node ts/bin/aontu.js …`, or `go run ./cmd/aontu …` inside `go/`. Both
accept the same options and print the same bytes.

The full option, verb and REPL-command tables are in the
[CLI reference](../reference-api.md#command-line-interface). To keep
the answers inside a program instead of a terminal,
[call Aontu from TypeScript](call-from-typescript.md) or
[from Go](call-from-go.md).

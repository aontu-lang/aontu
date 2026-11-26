# Aontu for JetBrains IDEs

Language-server integration and syntax highlighting for Aontu source
files (`.aontu`) in IntelliJ IDEA, WebStorm, GoLand, PyCharm and the
other JetBrains IDEs, Community editions included.

There is no Aontu plugin to install. The client is
[LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij), a free
plugin that connects a JetBrains IDE to any language server, and this
directory is the template that tells it how to start `aontu lsp` and
which files to send it. The colours come from the published TextMate
grammar, which the IDE reads without a plugin.

## Prerequisites

Install the CLI so `aontu` is on your `PATH`; the server is its `lsp`
verb:

```sh
npm install -g aontu            # or any install channel
```

A JetBrains IDE started from a desktop launcher does not always see the
`PATH` of your shell. If the server does not start, give the command
by absolute path (see [Configuration](#configuration)).

## Language server

1. Install **LSP4IJ**: `Settings` > `Plugins` > `Marketplace`, search
   for `LSP4IJ`. It needs a 2024.2 IDE or later.
2. Open `Settings` > `Languages & Frameworks` >
   `Language Servers (LSP4IJ)` and click `+`. The New Language Server
   dialog opens.
3. Click `Import template...`, beside `Choose template...`, and select
   this directory, `editors/jetbrains` of a checkout.
4. Click `OK`.

The template fills in the name, the command `aontu lsp`, and one
mapping: the filename pattern `*.aontu`, sent to the server as the
language `aontu`. Open a `.aontu` file and the server starts.
[`docs/lsp.md`](../../docs/lsp.md) says what it provides.

The mapping is a filename pattern and not a file type of its own, so
that the IDE goes on colouring the file with the TextMate grammar
below.

## Syntax highlighting

JetBrains IDEs read a TextMate grammar from a bundle directory, and
accept a bundle in the layout of a VS Code extension. The
[`vscode/`](../vscode/) directory beside this one is such a bundle. It
carries a copy of the published grammar,
[`grammar/aontu.tmLanguage.json`](../../grammar/aontu.tmLanguage.json),
that a test holds to the original:

1. Open `Settings` > `Editor` > `TextMate Bundles`.
2. Click `+` and select `editors/vscode` of a checkout.

Nothing in that directory needs building for this: the IDE reads
`package.json`, the grammar and the language configuration, which give
it the colours, the `#` comment prefix and the bracket pairs.

If `.aontu` files stay uncoloured, look in `Settings` > `Editor` >
`File Types` for an `*.aontu` pattern under another type, such as
`Text`. A pattern registered there takes the files away from the
bundle. Remove it.

## Configuration

Everything the template sets can be changed afterwards in the settings
of the language server. The command is the `Command` field of its
`Server` tab.

To run the TypeScript server from a checkout without installing the
binary, set the command to:

```text
node /abs/path/to/aontu/ts/bin/aontu-lsp.js
```

To use the Go server, set it to a Go build of `aontu` by absolute path,
with the verb:

```text
/abs/path/to/aontu lsp
```

The server needs no configuration. One initialization option is
available, hover provenance, which appends to each hover the
contributions record `aontu model why` prints. Put it in the
`Initialization Options` field of the `Configuration` tab:

```json
{ "aontu": { "provenance": true } }
```

**On Windows the command is `cmd /C aontu lsp`.** npm installs the
entry point as the shim `aontu.cmd`, and LSP4IJ starts a command
without a shell, which cannot run a `.cmd` by its bare name. `cmd /C`
resolves the name as a terminal would, to the shim or to a Go build's
`aontu.exe`. Nothing changes on macOS or Linux.

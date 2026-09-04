# Aontu for VS Code

Language support for [Aontu](../../README.md) — diagnostics, hover and
completion — by launching the language server, `aontu lsp`, and connecting
it to `.aon` and `.aontu` files.

## Prerequisites

Install the CLI so `aontu` is on your `PATH`; the server is its `lsp` verb:

```sh
npm install -g aontu            # or any install channel
```

Or point the extension at a checkout (see configuration below).

## Build & run (from source)

```sh
cd editors/vscode
npm install
npm run compile
```

Then press <kbd>F5</kbd> in VS Code (with this folder open) to launch an
Extension Development Host, and open a `.aon` file.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `aontu.server.command` | `aontu` | Command to launch the server; `aontu.server.args` defaults to `["lsp"]`. |
| `aontu.server.args` | `[]` | Arguments for the command. |

To run the TypeScript server directly from a repo checkout without
installing the binary:

```jsonc
{
  "aontu.server.command": "node",
  "aontu.server.args": ["/abs/path/to/aontu/ts/dist/lsp-server.js"]
}
```

To use the Go server, set `aontu.server.command` to a Go build of
`aontu` by absolute path and keep `aontu.server.args` as `["lsp"]`.

**On Windows the server is spawned through a shell**, because npm
installs the entry point as the shim `aontu.cmd` and `CreateProcess`
will not execute a `.cmd` directly. Nothing changes on macOS or Linux.
One consequence worth knowing if you set `aontu.server.args`: on Windows
those arguments pass through `cmd.exe`, so an argument containing spaces
needs quoting the way `cmd.exe` expects.

## Packaging (.vsix)

A `.vsix` is the single installable bundle for a VS Code extension (a ZIP
of the manifest, compiled `out/`, and assets). Build one with
[`@vscode/vsce`](https://github.com/microsoft/vscode-vsce), which is a dev
dependency:

```sh
cd editors/vscode
npm install
npm run package          # → aontu-<version>.vsix (runs compile first)
```

`npm run package` invokes `vsce package`; the `vscode:prepublish` script
compiles the TypeScript beforehand, so the produced `.vsix` contains the
built `out/extension.js`.

Install the bundle without the Marketplace:

```sh
code --install-extension aontu-0.1.0.vsix
```

…or in VS Code: **Extensions** panel → **⋯** → **Install from VSIX…**.

To publish to the Marketplace (requires a publisher and a Personal Access
Token; see the [vsce docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)):

```sh
npm run publish         # vsce publish
```

This directory ships a `LICENSE` (MIT) and a 128×128 `icon.png`, so `vsce`
packages cleanly without the usual warnings.

## How it works

This extension is a thin LSP client (`src/extension.ts`); all language
intelligence lives in the reusable server library. See
[`docs/lsp.md`](../../docs/lsp.md) for the architecture and protocol.

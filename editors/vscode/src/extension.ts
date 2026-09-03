/* Copyright (c) 2025 Richard Rodger, MIT License */

// VS Code extension: thin client that launches the Aontu language server
// (aontu lsp) and connects it to .aon / .aontu files. All language
// intelligence lives in the server; this file only wires it up.

import * as vscode from 'vscode'
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node'

let client: LanguageClient | undefined

export function activate(_context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration('aontu')
  const command = cfg.get<string>('server.command', 'aontu')
  const args = cfg.get<string[]>('server.args', ['lsp'])

  // SPAWN THROUGH A SHELL ON WINDOWS, and only there. npm installs the
  // command's entry point as the shim `aontu.cmd`, and
  // vscode-languageclient spawns with child_process and no `shell`
  // option — CreateProcess will not execute a .cmd, so the default
  // command this extension ships never started at all on Windows, on
  // the one path docs/lsp.md tells a user to configure.
  //
  // Windows-only because that is where the shim is: on POSIX the
  // command is an executable with a shebang and a shell would only add
  // a level of word-splitting to an argument list the user configures.
  // Nothing in CI exercises editors/, so this is reasoned rather than
  // measured — the failure it fixes is CreateProcess's documented
  // refusal, not a guess about it.
  const options = { shell: 'win32' === process.platform }

  const serverOptions: ServerOptions = {
    run: { command, args, options, transport: TransportKind.stdio },
    debug: { command, args, options, transport: TransportKind.stdio },
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'aontu' }],
  }

  client = new LanguageClient('aontu', 'Aontu', serverOptions, clientOptions)
  client.start()
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}

/* Copyright (c) 2025 Richard Rodger, MIT License */

// Aontu MCP server (stdio).
//
//   aontu-mcp [--root <dir>]
//
// Speaks the Model Context Protocol over stdio: newline-delimited
// JSON-RPC 2.0, one message per line. This binary is intentionally
// thin — every tool and every protocol decision lives in the reusable
// library ./mcp, the same three-layer split the language server uses
// (docs/lsp.md).
//
// NDJSON, not the LSP's Content-Length framing: MCP stdio transport
// is line-delimited, and a server that invented its own framing would
// not be reachable by any client.
//
// The one startup decision is the PATH CAPABILITY: `--root <dir>`
// grants the served evaluation the CLI's `--trust root:<dir>` posture
// — includes resolve confined below the root, and every tool's
// document arguments accept `<name>Path` file alternatives, confined
// the same way. Without it the server denies all includes and refuses
// path arguments (./mcp). The root is realpath'd HERE, once, so the
// confinement prefix the library compares against is the real
// directory, not a spelling of it.

import { realpathSync, statSync } from 'node:fs'

import { handle, parseError } from './mcp'
import type { McpRequest, McpResponse } from './mcp'
import { VERSION } from './aontu'


const USAGE = 'aontu mcp - aontu MCP server (stdio, NDJSON JSON-RPC)\n' +
  '\n' +
  '  aontu mcp [--root <dir>]\n' +
  '\n' +
  '  --root <dir>  Serve <name>Path file arguments and resolve\n' +
  '                @"..." includes, confined below <dir>\n' +
  '                (realpath-checked). Without it, served evaluation\n' +
  '                denies every include and refuses path arguments.\n'


// The startup arguments. Parsed here rather than in bin/aontu-mcp.js
// or the CLI's mcp verb
// so the parsing is import-testable; unknown options REFUSE rather
// than warn, because a server whose operator typo'd --root must not
// come up quietly unconfined.
export type ServerArgs = {
  root?: string
  help?: boolean
  err?: string
}

export function parseArgs(argv: string[]): ServerArgs {
  let root: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      return { help: true }
    }
    if ('--root' === arg) {
      const dir = argv[++i]
      if (null == dir) {
        return { err: 'aontu-mcp: --root needs a directory' }
      }
      root = dir
    }
    else {
      return { err: `aontu-mcp: unknown option ${arg} (try --help)` }
    }
  }
  return { root }
}


// A line-oriented JSON-RPC codec: feed it incoming chunks, and it
// splits lines, dispatches them, and writes replies. Kept
// transport-injectable (write/onExit) so the wiring is unit-testable
// without real stdio, exactly as the LSP's FrameCodec is.
class LineCodec {
  private buffer = ''

  constructor(
    private write: (line: string) => void,
    private onExit: (code: number) => void,
    private version: string,
    private root?: string,
  ) { }

  push(chunk: string | Buffer) {
    this.buffer += chunk.toString()
    for (; ;) {
      const nl = this.buffer.indexOf('\n')
      if (nl < 0) {
        return
      }
      const line = this.buffer.slice(0, nl).trim()
      this.buffer = this.buffer.slice(nl + 1)
      if ('' !== line) {
        this.line(line)
      }
    }
  }

  end() {
    this.onExit(0)
  }

  private line(line: string) {
    let msg: McpRequest
    try {
      msg = JSON.parse(line)
    }
    catch {
      this.send(parseError())
      return
    }
    const out = handle(msg, this.version, this.root)
    if (null != out) {
      this.send(out)
    }
  }

  private send(out: McpResponse) {
    this.write(JSON.stringify(out) + '\n')
  }
}


// The streams and exit are injectable (defaulting to real stdio) so
// the full wiring is unit-testable. Returns undefined when the
// arguments end the run before a codec exists (--help, a bad option,
// a --root that is not a directory).
function main(
  stdin: NodeJS.ReadableStream = process.stdin,
  write: (line: string) => void = (line) => void process.stdout.write(line),
  exit: (code: number) => void = (code) => process.exit(code),
  version: string = VERSION,
  argv: string[] = process.argv.slice(2),
  errwrite: (line: string) => void =
    (line) => void process.stderr.write(line),
): LineCodec | undefined {
  const args = parseArgs(argv)
  if (true === args.help) {
    write(USAGE)
    exit(0)
    return undefined
  }
  if (null != args.err) {
    errwrite(args.err + '\n')
    exit(2)
    return undefined
  }

  // FAIL FAST on a root that is not a real directory: every later
  // call would refuse anyway, but a misconfigured server that answers
  // a thousand confusing refusals is worse than one that says so at
  // startup.
  let root: string | undefined
  if (null != args.root) {
    try {
      root = realpathSync(args.root)
      if (!statSync(root).isDirectory()) {
        throw new Error('not a directory')
      }
    }
    catch {
      errwrite(`aontu-mcp: --root ${args.root} is not a directory\n`)
      exit(2)
      return undefined
    }
  }

  const codec = new LineCodec(write, exit, version, root)
  stdin.on('data', (chunk: Buffer) => codec.push(chunk))
  stdin.on('end', () => codec.end())
  return codec
} /* node:coverage ignore next 11 */


// No require.main guard here: bin/aontu-mcp.js is the executable entry
// and calls main() itself, so this module stays import-only.


export {
  LineCodec,
  main,
}

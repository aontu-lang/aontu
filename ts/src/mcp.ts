/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE MCP TOOL LIBRARY (G7 phase 6,
// docs/capability-review/g7-machine-access.md): the verbs an agent
// calls, over the Model Context Protocol, as a transport-free library.
// The split follows the LSP's (docs/lsp.md): this file is the protocol
// and the tools, ts/src/mcp-server.ts is stdio and nothing else, and
// the whole thing is testable without a socket.
//
// Every tool returns THE SAME JSON CONTRACT THE CLI PRINTS. That is
// the point of the surface: an agent that has read `aontu vet
// --format json` output knows what the `vet` tool answers, and a
// report copied from one to the other is the same object. The tools
// add no vocabulary of their own.
//
// The server evaluates under a CONFINED resolver (G5, docs/trust.md):
// a caller hands source text, and text that could reach out through
// `@"..."` is exactly what a server must not run unconfined. The
// package-resolver leg is never enabled here.

import { Aontu } from './aontu'
import type { TrustOptions } from './type'
import { vet } from './vet'
import { get, why } from './query'
import { diff } from './diff'
import { canonHash } from './hcanon'
import { evalFailure } from './query'
import { cmpCodePoint } from './keyorder'


export const MCP_PROTOCOL = '2024-11-05'


export type McpRequest = {
  id?: number | string | null
  jsonrpc?: string
  method?: string
  params?: any
}

export type McpResponse = {
  error?: { code: number, message: string }
  id: number | string | null
  jsonrpc: '2.0'
  result?: any
}


// JSON-RPC's own codes, the three a server this small can raise.
const PARSE_ERROR = -32700
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602


export type ToolDef = {
  name: string
  description: string
  properties: Record<string, { type: string, description: string }>
  required: string[]
  run: (args: any, trust: TrustOptions) => any
}


// The trust profile a served evaluation runs under: no includes at
// all. A caller who wants an include closure evaluated should use the
// library or the CLI, where the profile is theirs to choose.
//
// The profile is INJECTED into every tool by callTool rather than
// applied by each tool for itself. That is deliberate: four of the six
// tools once called the library with no profile at all, so a served
// `@"x.js"` was require()d in the server process, while the module
// header claimed confinement. A tool that must remember to confine
// itself is a tool that eventually forgets, and the forgetting is
// silent. With the profile arriving as an argument, a tool cannot run
// unconfined without visibly discarding it.
const SERVED_TRUST: TrustOptions = { include: 'none' }

function served(trust: TrustOptions): Aontu {
  return new Aontu({ trust } as any)
}


const TOOLS: ToolDef[] = [
  {
    name: 'vet',
    description:
      'Validate a data document against a schema document. Returns the ' +
      'vet report: verdict (valid | invalid | incomplete | error), and ' +
      'findings with codes, paths and sites.',
    properties: {
      schema: { type: 'string', description: 'The schema document' },
      data: { type: 'string', description: 'The data document' },
      at: { type: 'string', description: 'Validate at this path ($.a.b)' },
    },
    required: ['schema', 'data'],
    run: (a, trust) => vet(str(a.schema), str(a.data),
      null == a.at ? { trust } : { at: str(a.at), trust }),
  },
  {
    name: 'get',
    description:
      'Select one node of an evaluated document by path and render it: ' +
      'generated JSON by default, or the canon, types, keys or ' +
      'depth-elided view. A view other than json is a valid Aontu ' +
      'document that subsumes the truth it summarises.',
    properties: {
      src: { type: 'string', description: 'The document' },
      path: { type: 'string', description: 'The path ($.a.b)' },
      view: {
        type: 'string',
        description: 'json (default), canon, types or keys',
      },
      depth: {
        type: 'number',
        description: 'Structure to this depth; deeper nodes render as top',
      },
    },
    required: ['src', 'path'],
    run: (a, trust) => get(str(a.src), str(a.path), {
      view: a.view,
      depth: 'number' === typeof a.depth ? a.depth : undefined,
      trust,
    }),
  },
  {
    name: 'why',
    description:
      'Explain the value at a path: every contribution that met there, ' +
      'in source order, with its role (literal, spread, ref, pref) and ' +
      'the site it was written at.',
    properties: {
      src: { type: 'string', description: 'The document' },
      path: { type: 'string', description: 'The path ($.a.b)' },
    },
    required: ['src', 'path'],
    run: (a, trust) => why(str(a.src), str(a.path), { trust }),
  },
  {
    name: 'diff',
    description:
      'What changed, at which paths, between two documents. Compares ' +
      'the hash form, so reformatting is not a change and closing a ' +
      'map is. Whether a change is BREAKING is the subsume verb\'s ' +
      'question, not this one.',
    properties: {
      left: { type: 'string', description: 'The earlier document' },
      right: { type: 'string', description: 'The later document' },
      at: { type: 'string', description: 'Compare at this path ($.a.b)' },
    },
    required: ['left', 'right'],
    run: (a, trust) => diff(str(a.left), str(a.right),
      null == a.at ? { trust } : { at: str(a.at), trust }),
  },
  {
    name: 'canon',
    description:
      'Normalise a document to its canonical form: the deterministic ' +
      'text two documents that mean the same thing share.',
    properties: {
      src: { type: 'string', description: 'The document' },
    },
    required: ['src'],
    run: (a, trust) => canonOf(str(a.src), trust),
  },
  {
    name: 'summary',
    description:
      'A document at a glance: its canon-hash pin, its root keys, and ' +
      'the shape of its top tier. The first tier of progressive ' +
      'disclosure — expand by calling get with a path.',
    properties: {
      src: { type: 'string', description: 'The document' },
    },
    required: ['src'],
    run: (a, trust) => summaryOf(str(a.src), trust),
  },
]


function str(v: any): string {
  return 'string' === typeof v ? v : ''
}


function canonOf(src: string, trust: TrustOptions): any {
  const aontu = served(trust)
  const ctx = aontu.ctx({ collect: true })
  const v: any = aontu.unify(src, undefined, ctx)
  if (0 < ctx.err.length) {
    return { ok: false, canon: '', findings: [evalFailure(ctx)] }
  }
  return { ok: true, canon: v.canon, findings: [] }
}


function summaryOf(src: string, trust: TrustOptions): any {
  const aontu = served(trust)
  const ctx = aontu.ctx({ collect: true })
  const v: any = aontu.unify(src, undefined, ctx)
  if (0 < ctx.err.length) {
    return {
      ok: false, hash: '', keys: [], shape: '', findings: [evalFailure(ctx)],
    }
  }
  const keys = true === v.isMap ? Object.keys(v.peg).sort(cmpCodePoint) : []
  return {
    ok: true,
    hash: canonHash(v),
    keys,
    // The top tier only: every key, with its subtree elided to `top`.
    shape: get(src, '$', { view: 'types', depth: 2, trust }).out,
    findings: [],
  }
}


// The tool list as MCP spells it: a name, a description, and a JSON
// Schema for the arguments.
export function toolList(): any[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: {
      type: 'object',
      properties: t.properties,
      required: t.required,
    },
  }))
}


// One tool call. A tool that REFUSES (an invalid document, a path that
// names nothing) is not a protocol error: it answers with its own
// report and `isError` false, because the report IS the answer the
// agent asked for. `isError` is reserved for a call that could not be
// made at all.
// `tools` is injectable for the same reason the watch loop's waiter
// is: the catch below is defensive code no document reaches -- every
// verb answers with a report rather than throwing -- and code the
// suite cannot execute is code the ADR-002 floor cannot hold.
export function callTool(
  name: string, args: any, tools: ToolDef[] = TOOLS): any {
  const tool = tools.find((t) => t.name === name)
  if (null == tool) {
    return {
      content: [{ type: 'text', text: `no such tool: ${name}` }],
      isError: true,
    }
  }
  for (const req of tool.required) {
    if ('string' !== typeof args?.[req]) {
      return {
        content: [{
          type: 'text',
          text: `tool ${name} needs a string argument: ${req}`,
        }],
        isError: true,
      }
    }
  }
  // The served profile is supplied HERE, once, for every tool.
  // A tool never chooses its own confinement.
  let out: any
  try {
    out = tool.run(args, SERVED_TRUST)
  }
  catch (e: any) {
    // A tool that throws is a call that could not be made, which is
    // what isError means -- and it must not take the server process
    // down with it: a stdio server serves one client for a whole
    // session, so an unhandled throw on one document loses every
    // later call too.
    return {
      content: [{
        type: 'text',
        text: `tool ${name} failed: ${e?.message ?? e}`,
      }],
      isError: true,
    }
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
    isError: false,
  }
}


// Handle one JSON-RPC message. Returns undefined for a NOTIFICATION
// (no id): MCP sends `notifications/initialized`, and answering a
// notification is a protocol error in the other direction.
export function handle(msg: McpRequest, version: string): McpResponse | undefined {
  const id = msg.id ?? null

  if (null == msg.id) {
    return undefined
  }

  switch (msg.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: MCP_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'aontu', version },
      })

    case 'ping':
      return ok(id, {})

    case 'tools/list':
      return ok(id, { tools: toolList() })

    case 'tools/call': {
      const name = msg.params?.name
      if ('string' !== typeof name) {
        return err(id, INVALID_PARAMS, 'tools/call needs a tool name')
      }
      return ok(id, callTool(name, msg.params?.arguments ?? {}))
    }

    default:
      return err(id, METHOD_NOT_FOUND, `no such method: ${msg.method}`)
  }
}


// A message that did not decode at all.
export function parseError(): McpResponse {
  return err(null, PARSE_ERROR, 'invalid JSON')
}


function ok(id: number | string | null, result: any): McpResponse {
  return { jsonrpc: '2.0', id, result }
}


function err(
  id: number | string | null, code: number, message: string): McpResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

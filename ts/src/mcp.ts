/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE MCP TOOL LIBRARY (G7 phase 6,
// docs/capability-review/g7-machine-access.md; completed to the full
// CLI verb surface by the use-case review's MCP recommendation,
// use-cases/SUPPORT.md): the verbs an agent calls, over the Model
// Context Protocol, as a transport-free library. The split follows
// the LSP's (docs/lsp.md): this file is the protocol and the tools,
// ts/src/mcp-server.ts is stdio and nothing else, and the whole thing
// is testable without a socket.
//
// Every tool returns THE SAME JSON CONTRACT THE CLI PRINTS. That is
// the point of the surface: an agent that has read `aontu vet
// --format json` output knows what the `vet` tool answers, and a
// report copied from one to the other is the same object. The tools
// add no vocabulary of their own.
//
// The server evaluates under a CONFINED resolver (G5, docs/trust.md):
// a caller hands source text, and text that could reach out through
// `@"..."` is exactly what a server must not run unconfined. By
// default every include is denied; a server started with
// `--root <dir>` (ts/src/mcp-server.ts) resolves includes confined
// below that root instead — the CLI's `--trust root:<dir>` posture —
// and lets every document argument arrive as a `<name>Path` file
// under the same root. The package-resolver leg is never enabled
// here.

import { readFileSync, realpathSync } from 'node:fs'
import {
  basename as pathBasename,
  dirname as pathDirname,
  join as pathJoin,
  resolve as pathResolve,
  sep as pathSep,
} from 'node:path'

import { Aontu } from './aontu'
import type { TrustOptions } from './type'
import { vet } from './vet'
import type { VetFinding } from './vet'
import { get, why, evalFailure } from './query'
import { diff } from './diff'
import { canonHash, hcanon } from './hcanon'
import { cmpCodePoint } from './keyorder'
import { subsume } from './subsume'
import type { SubsumeVerdict } from './subsume'
import { trimCheck } from './trim'
import { jsonSchema } from './jsonschema'
import { relationCheck } from './relation'
import { reachCheck } from './reach'
import { viewTree } from './view'
import { patch } from './patch'


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
  properties: Record<
    string, { type: string, description: string, items?: any }>
  required: string[]
  // The properties that carry DOCUMENT TEXT. Each one gains a
  // `<name>Path` file alternative when the server runs with --root
  // (toolList), and each one is what the confined pre-parse below
  // covers for a tool that declares `refuse`.
  docs?: string[]
  // Argument validation beyond "required and a string": the message
  // for a call that could not be made, or undefined for a good call.
  check?: (a: any) => string | undefined
  // ENGINES THAT TAKE NO TRUST PROFILE (subsume, trimCheck,
  // relationCheck, patch) build their own evaluators, so the served
  // profile cannot ride into them as an argument the way it rides
  // into vet or get. Their documents are PRE-PARSED under the profile
  // by callTool instead (confinedParseFailure below), and `refuse` is
  // the tool's own error report for a document that fails it. A tool
  // whose engine takes `trust` directly declares no `refuse`.
  refuse?: (
    a: any, finding: VetFinding, trust: TrustOptions,
    paths: Record<string, string>) => any
  run: (
    a: any, trust: TrustOptions, paths: Record<string, string>) => any
}


// The trust profile a served evaluation runs under: no includes at
// all — or, when the server was started with --root, includes
// realpath-confined below that root (the CLI's `--trust root:<dir>`
// semantics; docs/trust.md). The package-resolver leg is enabled by
// neither.
//
// The profile is INJECTED into every tool by callTool rather than
// applied by each tool for itself. That is deliberate: four of the six
// original tools once called the library with no profile at all, so a
// served `@"x.js"` was require()d in the server process, while the
// module header claimed confinement. (That particular include is
// refused outright now -- ADR-012 -- but a served document could still
// read every file the server can.) A tool that must remember to
// confine itself is a tool that eventually forgets, and the forgetting
// is silent. With the profile arriving as an argument, a tool cannot
// run unconfined without visibly discarding it.
export function servedTrust(root?: string): TrustOptions {
  return null == root
    ? { include: 'none' }
    : { include: { root } }
}

function served(trust: TrustOptions): Aontu {
  return new Aontu({ trust } as any)
}


// DOES THIS DOCUMENT STAND UP UNDER THE SERVED PROFILE — or the
// finding that says why not. This is the confinement gate for the
// engines that take no trust profile, and parse is the whole include
// story: `@"..."` resolves at parse time (ts/src/lang.ts), so a
// document whose confined parse is clean either has no includes at
// all (capability 'none') or resolves every one below the root — and
// an engine that then re-resolves the same closure under the default
// profile reads exactly the files the confined parse proved in
// bounds. A parse that fails for any reason refuses the call: an
// engine's own answer for a document this profile cannot read is not
// an answer this server may compute.
export function confinedParseFailure(
  src: string, trust: TrustOptions, path?: string
): VetFinding | undefined {
  const aontu = served(trust)
  const ctx = aontu.ctx({ collect: true })
  aontu.parse(src, null == path ? undefined : { path }, ctx)
  return 0 < ctx.err.length ? evalFailure(ctx) : undefined
}


// Confinement is realpath-then-prefix-check, mirroring the include
// resolver's own rule (ts/src/lang.ts, docs/trust.md): the file's
// real path must sit below the root's real path, so a symlink inside
// the root pointing outside it is an escape, not a loophole.
//
// A path that does not (fully) exist cannot be realpath'd whole, and
// falling back to the LEXICAL form compares apples to oranges when the
// root itself sits behind a symlink -- on macOS a root under /var
// realpaths to /private/var, so a merely-missing file inside it read
// as an escape instead of "cannot read" (the CI failure that bought
// this comment). Realpath the deepest EXISTING ancestor and re-attach
// the rest, so both sides of the prefix check are in real coordinates.
function realpathOf(p: string): string {
  try {
    return realpathSync(p)
  }
  catch {
    const parent = pathDirname(p)
    if (parent === p) {
      return p
    }
    return pathJoin(realpathOf(parent), pathBasename(p))
  }
}

function outsideRoot(root: string, full: string): boolean {
  const rootReal = realpathOf(root)
  const fullReal = realpathOf(full)
  return fullReal !== rootReal && !fullReal.startsWith(rootReal + pathSep)
}


const TOOLS: ToolDef[] = [
  {
    name: 'vet',
    description:
      'Validate a data document against a schema document. Returns the ' +
      'vet report: verdict (valid | invalid | incomplete | error), and ' +
      'findings with codes, paths, sites and a repair hint. A site ' +
      'names the file whose text it excerpts, so its row and column ' +
      'are safe to edit at even when the schema loads other files.',
    properties: {
      schema: { type: 'string', description: 'The schema document' },
      data: { type: 'string', description: 'The data document' },
      at: { type: 'string', description: 'Validate at this path ($.a.b)' },
    },
    required: ['schema', 'data'],
    docs: ['schema', 'data'],
    run: (a, trust, paths) => vet(str(a.schema), str(a.data), {
      ...(null == a.at ? {} : { at: str(a.at) }),
      schemaPath: paths.schema,
      dataPath: paths.data,
      schemaUrl: paths.schema,
      dataUrl: paths.data,
      trust,
    }),
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
    docs: ['src'],
    run: (a, trust, paths) => get(str(a.src), str(a.path), {
      view: a.view,
      depth: 'number' === typeof a.depth ? a.depth : undefined,
      path: paths.src,
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
    docs: ['src'],
    run: (a, trust, paths) =>
      why(str(a.src), str(a.path), { path: paths.src, trust }),
  },
  {
    name: 'diff',
    description:
      'What changed, at which paths, between two documents. Compares ' +
      'the hash form, so reformatting is not a change and closing a ' +
      'map is. Whether a change is BREAKING is the breaking verb\'s ' +
      'question, not this one.',
    properties: {
      left: { type: 'string', description: 'The earlier document' },
      right: { type: 'string', description: 'The later document' },
      at: { type: 'string', description: 'Compare at this path ($.a.b)' },
    },
    required: ['left', 'right'],
    docs: ['left', 'right'],
    run: (a, trust, paths) => diff(str(a.left), str(a.right), {
      ...(null == a.at ? {} : { at: str(a.at) }),
      leftPath: paths.left,
      rightPath: paths.right,
      trust,
    }),
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
    docs: ['src'],
    run: (a, trust, paths) => canonOf(str(a.src), trust, paths.src),
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
    docs: ['src'],
    run: (a, trust, paths) => summaryOf(str(a.src), trust, paths.src),
  },

  // The evolution and change verbs (the use-case review's "MCP is a
  // read-only subset" gap, use-cases/09-agent-tools/README.md gap 11).

  {
    name: 'subsume',
    description:
      'Does the general document admit every instance the specific ' +
      'one admits? Returns the subsume report: verdict (subsumes | ' +
      'does_not_subsume | undecided | error) and compat findings, ' +
      'each with a witness at the path that narrowed.',
    properties: {
      general: { type: 'string', description: 'The general document' },
      specific: { type: 'string', description: 'The specific document' },
      profile: {
        type: 'string',
        description: 'values, defaults (default) or gen',
      },
      at: { type: 'string', description: 'Compare at this path ($.a.b)' },
    },
    required: ['general', 'specific'],
    docs: ['general', 'specific'],
    check: (a) => null == a.profile || 'values' === a.profile ||
      'defaults' === a.profile || 'gen' === a.profile
      ? undefined : 'profile needs values, defaults or gen',
    refuse: (_a, finding) => ({ verdict: 'error', findings: [finding] }),
    run: (a, _trust, paths) => subsume(str(a.general), str(a.specific), {
      ...(null == a.profile ? {} : { profile: a.profile }),
      ...(null == a.at ? {} : { at: str(a.at) }),
      generalUrl: paths.general,
      specificUrl: paths.specific,
      generalPath: paths.general,
      specificPath: paths.specific,
    }),
  },
  {
    name: 'breaking',
    description:
      'Is the new version of a document a breaking change against the ' +
      'old one? Wraps subsume in the CLI\'s policy logic: the mode ' +
      'argument, else the document\'s own $.aontu_policy.compat, else ' +
      'backward. Returns verdict (compatible | breaking | undecided | ' +
      'error), the mode checked, and the findings.',
    properties: {
      old: { type: 'string', description: 'The old (published) version' },
      new: { type: 'string', description: 'The new (proposed) version' },
      mode: {
        type: 'string',
        description: 'backward, forward or full; overrides the ' +
          'document\'s own $.aontu_policy.compat declaration',
      },
    },
    required: ['old', 'new'],
    docs: ['old', 'new'],
    check: (a) => null == a.mode || 'backward' === a.mode ||
      'forward' === a.mode || 'full' === a.mode
      ? undefined : 'mode needs backward, forward or full',
    refuse: (a, finding, trust, paths) => ({
      verdict: 'error',
      mode: breakingMode(a, trust, paths),
      findings: [finding],
    }),
    run: (a, trust, paths) => breakingOf(a, trust, paths),
  },
  {
    name: 'set',
    description:
      'Change values by appending to an overlay document (or, with ' +
      'inPlace, rewriting a pinned literal where that is provably ' +
      'safe). Returns the vet-class report plus the NEW OVERLAY TEXT: ' +
      'this server never writes files, so the caller owns the write.',
    properties: {
      entry: {
        type: 'string',
        description: 'The entry document (the truth the overlay must ' +
          'hold against)',
      },
      overlay: {
        type: 'string',
        description: 'The overlay document as it stands (may be empty)',
      },
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'The path ($.a.b)' },
            value: {
              type: 'string',
              description: 'The value, as Aontu source text',
            },
          },
          required: ['path', 'value'],
        },
        description: 'The assignments to apply, in order',
      },
      inPlace: {
        type: 'boolean',
        description: 'Rewrite a pinned literal where it was written, ' +
          'where provably safe; otherwise append as usual',
      },
    },
    required: ['entry', 'overlay', 'assignments'],
    docs: ['entry', 'overlay'],
    check: checkAssignments,
    refuse: (a, finding) => setError(str(a.overlay), finding),
    run: (a, trust, paths) => setOf(a, trust, paths),
  },
  {
    name: 'relations',
    description:
      'Check the declared relations of a finished model: acyclicity ' +
      'and inverse consistency over the link edge set. Returns ' +
      'verdict (pass | fail | error) and relation findings.',
    properties: {
      source: { type: 'string', description: 'The document' },
    },
    required: ['source'],
    docs: ['source'],
    // The pre-parse finding rides `errors`, exactly where the engine
    // puts its own reason for a document that does not stand up
    // (ts/src/relation.ts, the review's finding F). NOT `findings`:
    // RelationFinding is its own vocabulary (code, relation, at,
    // detail) and a document with no graph has no graph findings.
    refuse: (_a, finding) =>
      ({ verdict: 'error', findings: [], errors: [finding] }),
    run: (a, _trust, paths) =>
      relationCheck(str(a.source), { path: paths.source }),
  },
  {
    name: 'reaches',
    description:
      'Ask whether one node reaches another over the link graph, ' +
      'at any remove — the closure question `relations` cannot ask one ' +
      'edge at a time (blast radius, containment). Returns verdict ' +
      '(reaches | unreachable | error) and, when it reaches, a shortest ' +
      'path. Transitive, not reflexive: a node reaches itself only ' +
      'through a cycle.',
    properties: {
      source: { type: 'string', description: 'The document' },
      from: { type: 'string', description: 'The node path to start at' },
      to: { type: 'string', description: 'The node path to look for' },
      relation: {
        type: 'string',
        description: 'Follow only edges under this relation (optional)',
      },
    },
    required: ['source', 'from', 'to'],
    docs: ['source'],
    refuse: (_a, finding) => ({ verdict: 'error', errors: [finding] }),
    run: (a, _trust, paths) =>
      reachCheck(str(a.source), str(a.from), str(a.to), {
        path: paths.source,
        relation: null == a.relation ? undefined : str(a.relation),
      }),
  },
  {
    name: 'view',
    description:
      'Draw a figure of the link graph as deterministic text: the ' +
      'dependency tree of a relation (kind "tree"), roots derived as ' +
      'the nodes nothing depends on, a repeated subtree elided as (*), ' +
      'a closing edge marked (cycle). Returns verdict (rendered | ' +
      'error), kind, and the text.',
    properties: {
      source: { type: 'string', description: 'The document' },
      kind: {
        type: 'string',
        description: 'The figure to draw: tree (the default)',
      },
      relation: {
        type: 'string',
        description: 'Draw the tree over this relation only (optional)',
      },
      root: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Draw only the subtrees under these node paths (optional)',
      },
    },
    required: ['source'],
    docs: ['source'],
    check: (a) => null == a.kind || 'tree' === a.kind
      ? undefined : `kind must be tree, not ${JSON.stringify(a.kind)}`,
    refuse: (_a, finding) =>
      ({ verdict: 'error', kind: 'tree', errors: [finding] }),
    run: (a, _trust, paths) =>
      viewTree(str(a.source), {
        path: paths.source,
        relation: null == a.relation ? undefined : str(a.relation),
        roots: Array.isArray(a.root) ? a.root.map(str) : undefined,
      }),
  },
  {
    name: 'hash',
    description:
      'The canon-hash pin of a document: "aon1-" + ' +
      'base64url(SHA-256(hash form)). Survives reformatting; moves on ' +
      'any change of meaning. Pass form: true for the hash form text ' +
      'the pin digests.',
    properties: {
      source: { type: 'string', description: 'The document' },
      form: {
        type: 'boolean',
        description: 'Include the hash form text as well',
      },
    },
    required: ['source'],
    docs: ['source'],
    run: (a, trust, paths) =>
      hashOf(str(a.source), true === a.form, trust, paths.source),
  },
  {
    name: 'trim',
    description:
      'Report redundant map entries — entries whose removal leaves ' +
      'the evaluated result unchanged, the spread-implied case ' +
      'included — as paths. Report-only, the CLI\'s trim --check. ' +
      'Returns verdict (clean | redundant | error).',
    properties: {
      source: { type: 'string', description: 'The document' },
    },
    required: ['source'],
    docs: ['source'],
    // The pre-parse finding rides `errors`, exactly where the engine
    // puts its own reason for a document that does not stand up
    // (ts/src/trim.ts, the review's finding F).
    refuse: (_a, finding) =>
      ({ verdict: 'error', redundant: [], errors: [finding] }),
    run: (a, _trust, paths) =>
      trimCheck(str(a.source), { path: paths.source }),
  },
  {
    name: 'jsonschema',
    description:
      'Export a document as a JSON Schema (draft 2020-12), and say ' +
      'what could not be carried. This is the bridge to a ' +
      'structured-output API, which constrains generation to JSON ' +
      'Schema and to nothing else -- and to an MCP tool\'s own ' +
      'inputSchema, which the protocol requires to be one. Returns ' +
      'verdict (ok | lossy | error), the schema, and a `lossy` list ' +
      'naming every construct the schema could not say and what it ' +
      'says instead. A lossy schema admits MORE than the model does, ' +
      'so vet the result against the model rather than trusting the ' +
      'schema alone.',
    properties: {
      source: { type: 'string', description: 'The document' },
      at: {
        type: 'string',
        description: 'Export this path of the document ($.a.b)',
      },
    },
    required: ['source'],
    docs: ['source'],
    refuse: (_a, finding) =>
      ({ verdict: 'error', schema: {}, lossy: [], errors: [finding] }),
    run: (a, _trust, paths) =>
      jsonSchema(str(a.source), {
        at: null == a.at ? undefined : str(a.at), path: paths.source,
      }),
  },
]


function str(v: any): string {
  return 'string' === typeof v ? v : ''
}


function canonOf(src: string, trust: TrustOptions, path?: string): any {
  const aontu = served(trust)
  const ctx = aontu.ctx({ collect: true })
  const v: any = aontu.unify(
    src, null == path ? undefined : { path }, ctx)
  if (0 < ctx.err.length) {
    return { ok: false, canon: '', findings: [evalFailure(ctx)] }
  }
  return { ok: true, canon: v.canon, findings: [] }
}


function summaryOf(src: string, trust: TrustOptions, path?: string): any {
  const aontu = served(trust)
  const ctx = aontu.ctx({ collect: true })
  const v: any = aontu.unify(
    src, null == path ? undefined : { path }, ctx)
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
    shape: get(src, '$', { view: 'types', depth: 2, path, trust }).out,
    findings: [],
  }
}


// The pin, computed under the served profile — this engine is the
// evaluation itself, so the profile rides in directly and no pre-parse
// is needed. The error answer follows canonOf's shape; the CLI prints
// nothing but a message there (ts/src/cli.ts runHash), so this shape
// is the served superset of it.
function hashOf(
  src: string, form: boolean, trust: TrustOptions, path?: string): any {
  const aontu = served(trust)
  const ctx = aontu.ctx({ collect: true })
  const v: any = aontu.unify(
    src, null == path ? undefined : { path }, ctx)
  if (0 < ctx.err.length || null == v || true === v.isNil) {
    return { ok: false, hash: '', findings: [evalFailure(ctx)] }
  }
  return {
    ok: true,
    hash: canonHash(v),
    ...(form ? { form: hcanon(v) } : {}),
    findings: [],
  }
}


// ---------------------------------------------------------------------
// THE BREAKING POLICY WRAPPER. Re-implemented from ts/src/cli.ts
// (runBreaking and policyCompat) rather than extracted from it: cli.ts
// owns the process-facing halves — files, git revisions, exit codes,
// rendering — that a served tool must not import, and the policy
// itself (which mode applies, which side is general, how verdicts
// aggregate) is small enough that a shared home would be all seam.
// cli.ts is the reference; a change there is a change here.

type BreakingMode = 'backward' | 'forward' | 'full' | 'none'

// Verdict aggregation: an error anywhere makes the run an error;
// otherwise a witness anywhere makes it breaking; otherwise an open
// question anywhere leaves it undecided.
const BREAKING_RANK: Record<SubsumeVerdict, number> = {
  subsumes: 0,
  undecided: 1,
  does_not_subsume: 2,
  error: 3,
}

const BREAKING_VERDICT: Record<SubsumeVerdict, string> = {
  subsumes: 'compatible',
  does_not_subsume: 'breaking',
  undecided: 'undecided',
  error: 'error',
}


// The document's own compatibility declaration: `$.aontu_policy.compat`,
// a disjunction whose default is the declared mode. Undefined when the
// key is absent or does not spell a mode. The one departure from the
// cli.ts original: the read runs CONFINED, because here the document
// came from a caller.
function policyCompatOf(
  newSrc: string, trust: TrustOptions, path?: string
): BreakingMode | undefined {
  const aontu = served(trust)
  const ctx = aontu.ctx({ collect: true })
  const v: any = aontu.unify(
    newSrc, null == path ? undefined : { path }, ctx)
  if (0 < ctx.err.length || true === v?.isNil) {
    return undefined
  }
  let compat: any = v?.peg?.aontu_policy?.peg?.compat
  if (null == compat) {
    return undefined
  }
  if (true === compat.isDisjunct && Array.isArray(compat.peg)) {
    compat = compat.peg.find((m: any) => true === m?.isPref) ?? compat.peg[0]
  }
  if (true === compat.isPref) {
    compat = compat.peg
  }
  const m = true === compat?.isString ? compat.peg : undefined
  return 'backward' === m || 'forward' === m || 'full' === m || 'none' === m
    ? m : undefined
}


// The declared mode: the mode argument overrides the document's own
// policy; neither means backward (v1-valid documents stay valid).
function breakingMode(
  a: any, trust: TrustOptions, paths: Record<string, string>
): BreakingMode {
  return a.mode ?? policyCompatOf(str(a.new), trust, paths.new) ?? 'backward'
}


function breakingOf(
  a: any, trust: TrustOptions, paths: Record<string, string>): any {
  const mode = breakingMode(a, trust, paths)

  if ('none' === mode) {
    // The document declares no compatibility promise: nothing to check.
    return { verdict: 'compatible', mode, findings: [] }
  }

  const sides = {
    old: { src: str(a.old), url: paths.old ?? 'old', path: paths.old },
    new: { src: str(a.new), url: paths.new ?? 'new', path: paths.new },
  }

  // backward: the NEW document is the general side — every old
  // instance must still be admitted. forward: the old one is.
  const checks: Array<{
    general: typeof sides.old, specific: typeof sides.old
  }> = []
  if ('backward' === mode || 'full' === mode) {
    checks.push({ general: sides.new, specific: sides.old })
  }
  if ('forward' === mode || 'full' === mode) {
    checks.push({ general: sides.old, specific: sides.new })
  }

  let worst: SubsumeVerdict = 'subsumes'
  const findings: VetFinding[] = []
  for (const check of checks) {
    const report = subsume(check.general.src, check.specific.src, {
      generalUrl: check.general.url,
      specificUrl: check.specific.url,
      generalPath: check.general.path,
      specificPath: check.specific.path,
    })
    if (BREAKING_RANK[worst] < BREAKING_RANK[report.verdict]) {
      worst = report.verdict
    }
    findings.push(...report.findings)
  }

  return { verdict: BREAKING_VERDICT[worst], mode, findings }
}


// ---------------------------------------------------------------------
// The set tool: the CLI's `set` verb minus the filesystem — the patch
// engine (ts/src/patch.ts) already answers with the new overlay text,
// and the caller owns the write.

// The assignments arrive structured ({path, value}) rather than as the
// CLI's `<path>=<value>` spelling, and are re-joined for the engine's
// parseAssignment — so the path must not smuggle a `=` that would move
// the split.
function checkAssignments(a: any): string | undefined {
  if (0 === a.assignments.length) {
    return 'assignments needs at least one {path, value}'
  }
  for (const x of a.assignments) {
    if ('string' !== typeof x?.path || '' === x.path.trim() ||
      'string' !== typeof x?.value || '' === x.value.trim()) {
      return 'each assignment needs a path and a value, both strings'
    }
    if (x.path.includes('=')) {
      return `assignment path may not contain "=": ${x.path}`
    }
  }
  return undefined
}


function setError(overlay: string, finding: VetFinding): any {
  return {
    overlay,
    appended: [],
    replaced: [],
    verdict: 'error',
    findings: [finding],
  }
}


function setOf(
  a: any, trust: TrustOptions, paths: Record<string, string>): any {
  // THE ASSIGNMENT VALUES ARE DOCUMENTS TOO: each one is appended (or
  // spliced) into the overlay and evaluated there by the engine's
  // final vet, so a value that smuggles an include — or a newline and
  // then an include — gets the same confined pre-parse as the
  // documents themselves, wrapped exactly as the engine's own
  // spanValue wraps a fragment (ts/src/patch.ts).
  for (const x of a.assignments) {
    const denied = confinedParseFailure('v: ' + x.value, trust, paths.overlay)
    if (null != denied) {
      return setError(str(a.overlay), denied)
    }
  }

  return patch(str(a.entry), str(a.overlay),
    a.assignments.map((x: any) => x.path + '=' + x.value),
    {
      entryPath: paths.entry,
      overlayPath: paths.overlay,
      inPlace: true === a.inPlace,
    })
}


// ---------------------------------------------------------------------
// The tool list as MCP spells it: a name, a description, and a JSON
// Schema for the arguments. With a served root, every document
// property gains its `<name>Path` file alternative — and comes OFF the
// `required` list, because JSON Schema's `required` cannot say "one of
// the two"; callTool's own argument check still refuses a call that
// carries neither.
export function toolList(root?: string): any[] {
  return TOOLS.map((t) => {
    const properties: Record<string, any> = { ...t.properties }
    let required = t.required
    if (null != root && null != t.docs) {
      for (const doc of t.docs) {
        properties[doc + 'Path'] = {
          type: 'string',
          description: `File below the server's --root, read as ` +
            `\`${doc}\`; an alternative to inline \`${doc}\` text`,
        }
      }
      required = t.required.filter(
        (r) => !(t.docs as string[]).includes(r))
    }
    return {
      name: t.name,
      description: t.description,
      inputSchema: {
        type: 'object',
        properties,
        required,
      },
    }
  })
}


function refusal(text: string): any {
  return { content: [{ type: 'text', text }], isError: true }
}


// One tool call. A tool that REFUSES (an invalid document, a path that
// names nothing, a document the served profile cannot read) is not a
// protocol error: it answers with its own report and `isError` false,
// because the report IS the answer the agent asked for. `isError` is
// reserved for a call that could not be made at all — an unknown tool,
// a missing or malformed argument, a file argument the server cannot
// serve.
// `opts.tools` is injectable for the same reason the watch loop's
// waiter is: the catch below is defensive code no document reaches --
// every verb answers with a report rather than throwing -- and code
// the suite cannot execute is code the ADR-002 floor cannot hold.
export function callTool(
  name: string, args: any,
  opts?: { root?: string, tools?: ToolDef[] }): any {
  const root = opts?.root
  const tools = opts?.tools ?? TOOLS
  const tool = tools.find((t) => t.name === name)
  if (null == tool) {
    return refusal(`no such tool: ${name}`)
  }

  const a: any = { ...(args ?? {}) }
  const paths: Record<string, string> = {}

  // THE FILE ALTERNATIVES (--root). A document that did not arrive as
  // inline text may arrive as a `<name>Path` file — served only when
  // the operator granted a root at startup, confined below it by the
  // same realpath rule the include resolver applies, and recorded in
  // `paths` so the engine resolves the file's own relative includes
  // from its directory (the CLI's rule for a named file). Inline text
  // wins when a caller sends both.
  for (const doc of tool.docs ?? []) {
    if ('string' === typeof a[doc]) {
      continue
    }
    const rel = a[doc + 'Path']
    if ('string' !== typeof rel) {
      continue
    }
    if (null == root) {
      return refusal(
        `tool ${name}: ${doc}Path needs a server started with ` +
        `--root <dir>; pass ${doc} as document text instead`)
    }
    const full = pathResolve(root, rel)
    if (outsideRoot(root, full)) {
      return refusal(
        `tool ${name}: ${doc}Path escapes the server root: ${rel}`)
    }
    try {
      a[doc] = readFileSync(full, 'utf8')
    }
    catch (e: any) {
      return refusal(
        `tool ${name}: cannot read ${doc}Path ${rel}: ${e?.message ?? e}`)
    }
    paths[doc] = full
  }

  for (const req of tool.required) {
    const kind = tool.properties[req]?.type
    const okv = 'array' === kind
      ? Array.isArray(a[req])
      : 'string' === typeof a[req]
    if (!okv) {
      const alt = null != root && (tool.docs ?? []).includes(req)
        ? ` (or ${req}Path)` : ''
      return refusal(
        `tool ${name} needs ${'array' === kind ? 'an array' : 'a string'}` +
        ` argument: ${req}${alt}`)
    }
  }

  const bad = null == tool.check ? undefined : tool.check(a)
  if (null != bad) {
    return refusal(`tool ${name}: ${bad}`)
  }

  // The served profile is supplied HERE, once, for every tool.
  // A tool never chooses its own confinement.
  const trust = servedTrust(root)
  let out: any
  try {
    // The confined pre-parse, for the engines that cannot take the
    // profile themselves (see ToolDef.refuse).
    if (null != tool.refuse) {
      for (const doc of tool.docs ?? []) {
        if ('string' !== typeof a[doc]) {
          continue
        }
        const denied = confinedParseFailure(a[doc], trust, paths[doc])
        if (null != denied) {
          out = tool.refuse(a, denied, trust, paths)
          break
        }
      }
    }
    if (undefined === out) {
      out = tool.run(a, trust, paths)
    }
  }
  catch (e: any) {
    // A tool that throws is a call that could not be made, which is
    // what isError means -- and it must not take the server process
    // down with it: a stdio server serves one client for a whole
    // session, so an unhandled throw on one document loses every
    // later call too.
    return refusal(`tool ${name} failed: ${e?.message ?? e}`)
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
    isError: false,
  }
}


// What a connecting client is told once, at the handshake: which
// confinement mode this server is in. The --root capability is a
// startup grant, not a per-call negotiation, so initialize is where a
// caller learns whether `<name>Path` arguments are served.
export function serverInstructions(root?: string): string {
  return 'Aontu tools take document TEXT arguments and answer the ' +
    'same JSON reports the aontu CLI prints with --format json. ' +
    (null == root
      ? 'Evaluation is confined: includes (@"...") are denied, and ' +
      'file-path arguments (schemaPath, srcPath, sourcePath, ...) ' +
      'are refused. Start the server with --root <dir> to serve ' +
      'both, confined below that directory.'
      : `This server was started with --root ${root}: every document ` +
      'argument also accepts a <name>Path alternative naming a file ' +
      'below that root, and includes (@"...") resolve confined to it.')
}


// Handle one JSON-RPC message. Returns undefined for a NOTIFICATION
// (no id): MCP sends `notifications/initialized`, and answering a
// notification is a protocol error in the other direction.
export function handle(
  msg: McpRequest, version: string, root?: string
): McpResponse | undefined {
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
        instructions: serverInstructions(root),
      })

    case 'ping':
      return ok(id, {})

    case 'tools/list':
      return ok(id, { tools: toolList(root) })

    case 'tools/call': {
      const name = msg.params?.name
      if ('string' !== typeof name) {
        return err(id, INVALID_PARAMS, 'tools/call needs a tool name')
      }
      return ok(id, callTool(name, msg.params?.arguments ?? {}, { root }))
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

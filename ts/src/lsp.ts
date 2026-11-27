/* Copyright (c) 2025 Richard Rodger, MIT License */


import type { Val } from './type'

import { Aontu, VERSION } from './aontu'
import { getHint } from './err'
import { collectNils } from './walk'
import { collectDeprecations, deprecationMessage,
  includeOpts,
} from './utility'
import { why } from './query'
import { format } from './format'
import { utf8Bytes } from './escape'
import {
  pathAt, sitesOf, describeAt, definitionAt, describeVal, membersAt,
} from './cursor'
import type { CursorMembers, CursorPath, Member, PathSite, PathValue } from './cursor'
import type { WhyConjunct } from './provenance'


// LSP DiagnosticSeverity subset.
const SEVERITY_ERROR = 1
const SEVERITY_WARNING = 2
const SEVERITY_INFORMATION = 3
const SEVERITY_HINT = 4

const LSP_VERSION = VERSION


type Position = { line: number, character: number }

type Range = { start: Position, end: Position }

// A single LSP diagnostic.
type Diagnostic = {
  range: Range
  severity: number
  code?: string
  source: string
  message: string
  // LSP DiagnosticTag values; [1] is Unnecessary, [2] is Deprecated —
  // the native tag editors strike through (G3 phase 4).
  tags?: number[]
}


// Incoming JSON-RPC message (request or notification).
type Message = {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: any
}

// Outgoing JSON-RPC message (response or notification).
type OutMessage = {
  jsonrpc: string
  id?: number | string | null
  method?: string
  params?: any
  result?: any
  error?: { code: number, message: string }
}


function computeDiagnostics(
  src: string,
  opts?: { vars?: Record<string, Val>, trust?: any, textExt?: string[] }
): Diagnostic[] {
  const aontu = new Aontu(includeOpts(opts ?? {}))

  let root: any
  let ac: any
  try {
    ac = aontu.ctx({ collect: true })
    if (opts?.vars) {
      Object.assign(ac.vars, opts.vars)
    }
    root = aontu.unify(src, { collect: true }, ac)
  }
  catch (err: any) {
    // Hard parse/syntax failure: report a single diagnostic. jsonic
    // errors may carry 1-based line/col; fall back to the document start.
    return [parseErrorDiagnostic(err)]
  }

  // The walk's `seen` set is reused below to dedup context errors
  // against the nils already found in the tree.
  const seen = new Set()
  const nils: any[] = collectNils(root, seen)

  for (const e of ac.err) {
    if (e?.isNil && '|:trial-nil' !== e.why && !seen.has(e)) {
      seen.add(e)
      nils.push(e)
    }
  }

  // A conflict copied to another path is still one conflict at one site.
  const said = new Set<string>()
  const out = nils.map(nilToDiagnostic).filter((d) => {
    const key = JSON.stringify([d.range, d.code, d.message])
    return !said.has(key) && undefined !== said.add(key)
  })

  for (const { val } of collectDeprecations(root)) {
    const v: any = val
    if (1 > (v.site?.row ?? -1) || 1 > (v.site?.col ?? -1)) {
      continue
    }
    out.push({
      range: {
        start: { line: v.site.row - 1, character: v.site.col - 1 },
        end: {
          line: v.site.row - 1,
          character: v.site.col - 1 + siteExtent(v),
        },
      },
      severity: 4,
      code: 'deprecated',
      source: 'aontu',
      message: deprecationMessage(v.deprecation),
      tags: [2],
    })
  }

  return out
}


// Convert a NilVal (1-based site row/col) to an LSP diagnostic (0-based
// line/character).
function nilToDiagnostic(nil: any): Diagnostic {
  const { site, len } = placeOf(nil)
  const row = site?.row ?? -1
  const col = site?.col ?? -1

  let start: Position
  let end: Position
  if (row >= 1 && col >= 1) {
    start = { line: row - 1, character: col - 1 }
    end = { line: row - 1, character: col - 1 + len }
  }
  else {
    start = { line: 0, character: 0 }
    end = { line: 0, character: 1 }
  }

  return {
    range: { start, end },
    severity: SEVERITY_ERROR,
    code: nil.why,
    source: 'aontu',
    message: nilMessage(nil),
  }
}


// An included file's row and column mean nothing here: use this file's
// operand, or else where this file loaded the value.
function placeOf(nil: any): { site: any, len: number } {
  const elsewhere = (v: any): boolean => '' !== (v?.site?.url ?? '')
  const from = nil.primary ?? nil
  if (!elsewhere(from)) {
    return { site: nil.site, len: labelLength(nil) }
  }
  if (null != nil.secondary && !elsewhere(nil.secondary)) {
    return { site: nil.secondary.site, len: siteExtent(nil.secondary) }
  }
  const load = from.site.load
  return null != load && !load.url ?
    { site: load, len: 1 } : { site: nil.site, len: labelLength(nil) }
}


function labelLength(nil: any): number {
  return null == nil.primary ? 1 : siteExtent(nil.primary)
}


function siteExtent(v: any): number {
  const len = v?.site?.len
  if ('number' === typeof len && len > 0) {
    return len
  }
  let c = ''
  try { c = v?.canon } catch { c = '' }
  return 'string' === typeof c && c.length > 0 ? c.length : 1
}


// Build the human-readable message. Kept identical to the Go port's
// NilVal.Message() (go/val.go) so diagnostics match across
// implementations: "Cannot <attempt> value: X with value: Y\n<hint>".
function nilMessage(nil: any): string {
  const attempt = nil.attempt ?? (null == nil.secondary ? 'resolve' : 'unify')
  let msg = 'Cannot ' + attempt + ' value'
  if (null != nil.primary) {
    msg += ': ' + nil.primary.canon
    if (null != nil.secondary) {
      msg += ' with value: ' + nil.secondary.canon
    }
  }
  const hint = getHint(nil.why, nil.details)
  if (hint) {
    msg += '\n' + hint
  }
  return msg
}


function parseErrorDiagnostic(err: any): Diagnostic {
  // jsonic/AontuError may expose 1-based line/col.
  const row = err?.lineNumber ?? err?.row ?? err?.line ?? -1
  const col = err?.column ?? err?.col ?? -1
  const start: Position = row >= 1 && col >= 1
    ? { line: row - 1, character: col - 1 }
    : { line: 0, character: 0 }
  return {
    range: { start, end: { line: start.line, character: start.character + 1 } },
    severity: SEVERITY_ERROR,
    code: 'parse',
    source: 'aontu',
    message: ('string' === typeof err?.message ? err.message : String(err)),
  }
}


// initialize result: advertise full-text document sync feeding diagnostics.
function initializeResult() {
  return {
    capabilities: {
      textDocumentSync: 1,
      hoverProvider: true,
      definitionProvider: true,
      completionProvider: { triggerCharacters: ['.'] },
      signatureHelpProvider: { triggerCharacters: ['(', ','] },
      documentFormattingProvider: true,
    },
    serverInfo: {
      name: 'aontu-lsp',
      version: LSP_VERSION,
    },
  }
}


function computeSignatureHelp(text: string, pos: any): any {
  // Position to offset, under the full-sync model: lines are exactly
  // the text's newlines.
  const lines = text.split('\n')
  const line = Math.max(0, Math.min(Number(pos.line) || 0, lines.length - 1))
  let offset = 0
  for (let li = 0; li < line; li++) {
    offset += lines[li].length + 1
  }
  offset += Math.max(0, Math.min(Number(pos.character) || 0, lines[line].length))
  let depth = 0
  let commas = 0
  let open = -1
  for (let i = offset - 1; 0 <= i; i--) {
    const c = text[i]
    if ('"' === c || "'" === c) {
      for (i--; 0 <= i && text[i] !== c; i--) { }
      continue
    }
    if (')' === c) { depth++ }
    else if ('(' === c) {
      if (0 === depth) { open = i; break }
      depth--
    }
    else if (',' === c && 0 === depth) { commas++ }
    else if ('\n' === c && 0 === depth) { break }
  }
  if (0 > open) { return null }
  let start = open
  while (0 < start && /[a-zA-Z0-9_]/.test(text[start - 1])) { start-- }
  const name = text.slice(start, open)
  const sig = funcSig[name]
  if (undefined === sig) { return null }
  const last = sig.args.length - 1
  return {
    signatures: [{
      label: renderSig(sig),
      parameters: sig.args.map((a) => ({ label: renderSigArg(a) })),
    }],
    activeSignature: 0,
    activeParameter: Math.min(commas, 0 <= last ? last : 0),
  }
}


function publishDiagnosticsMsg(uri: string, diagnostics: Diagnostic[]): OutMessage {
  return {
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: { uri, diagnostics },
  }
}


type MarkupContent = { kind: 'markdown' | 'plaintext', value: string }
type Hover = { contents: MarkupContent, range?: Range }


function provenanceMarkdown(
  src: string, path: string[], trust?: any): string {
  if (0 === path.length) {
    return ''
  }
  // A document with an error ELSEWHERE still hovers — the tree the
  // hover walked is there — while `why` refuses it, so the record may
  // be absent for a value the cursor is sitting on.
  const report = why(src, '$.' + path.join('.'), { trust } as any)
  return contributionsMarkdown(report.record?.conjuncts ?? [])
}


export function contributionsMarkdown(conjuncts: WhyConjunct[]): string {
  if (0 === conjuncts.length) {
    return ''
  }
  return '\n\n---\n\nContributions:\n' + conjuncts.map((c) =>
    '- `' + c.canon + '` — ' + c.role +
    (0 > c.site.row ? '' : ' (' +
      ('' === c.site.file ? '' : c.site.file + ':') +
      c.site.row + ':' + c.site.col + ')')).join('\n')
}


// The alias name the cursor sits on, with its span. A `%` inside a
// string is text (`a: "%foo"`), so quoted runs are stepped over.
function aliasAt(
  src: string, position: Position,
): { name: string, start: number, end: number } | undefined {
  const line = src.split('\n')[position.line]
  if (null == line) {
    return undefined
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if ('"' === c || "'" === c) {
      for (i++; i < line.length && line[i] !== c; i++) { }
      continue
    }
    if ('%' !== c) {
      continue
    }
    const m = ALIAS_RE.exec(line.substring(i))
    if (null == m) {
      continue
    }
    if (i <= position.character && position.character < i + m[0].length) {
      return { name: m[0], start: i, end: i + m[0].length }
    }
    i += m[0].length - 1
  }
  return undefined
}


// The binding for a name the cursor is on, or nothing where the name is
// used but never bound -- which the diagnostics already report.
function aliasBindingAt(
  src: string, position: Position,
): { at: { name: string, start: number, end: number }, bind: AliasBinding }
  | undefined {
  const at = aliasAt(src, position)
  if (undefined === at) {
    return undefined
  }
  for (const bind of aliasScope(src)) {
    if (bind.name === at.name) {
      return { at, bind }
    }
  }
  return undefined
}


function aliasMarkdown(bind: AliasBinding): string {
  return '```aontu\n' + bind.decl + '\n```\n\n*alias' +
    ('' === bind.from ? '' : ', taken from ' + bind.from) + '*'
}


type Location = { uri: string, range: Range }

type TextEdit = { range: Range, newText: string }


// The whole document as `aontu fmt` writes it: no edit where it already
// is, and no answer where it doesn't parse, which its diagnostics say.
function computeFormatting(text: string): TextEdit[] | null {
  const report = format(text)
  if ('formatted' !== report.verdict) {
    return null
  }
  if (!report.changed) {
    return []
  }
  const lines = text.split('\n')
  return [{
    range: {
      start: { line: 0, character: 0 },
      end: { line: lines.length - 1, character: lines[lines.length - 1].length },
    },
    newText: report.text,
  }]
}


// The path under a cursor, and every site that writes a path: the
// mapping the features beyond formatting stand on.
function computePathAt(text: string, pos: Position, trust?: any): CursorPath | null {
  return pathAt(text, pos, { trust }) ?? null
}


function computeSitesOf(text: string, path: string[], trust?: any): PathSite[] | null {
  return sitesOf(text, path, { trust }) ?? null
}


// Go to where the name is BOUND: its declaration, or the destructure
// that brought it in, which is where this file gets the name.
function computeDefinition(
  src: string, position: Position, uri: string): Location | null {
  const found = aliasBindingAt(src, position)
  if (undefined === found) {
    return null
  }
  const line = found.bind.row - 1
  const col = found.bind.col - 1
  return {
    uri,
    range: {
      start: { line, character: col },
      end: { line, character: col + found.bind.name.length },
    },
  }
}


// Every site that writes the path a key or a reference names.
function computePathDefinition(
  src: string, position: Position, uri: string, trust?: any): Location[] | null {
  const places = definitionAt(src, position, { trust })
  return places?.map((p) => ({
    uri: '' === p.file ? uri : pathToUri(p.file),
    range: p.range,
  })) ?? null
}


function computeHover(
  src: string, position: Position, provenance?: boolean,
  trust?: any): Hover | null {
  // A NAME IS NOT A VALUE: the tree holds what it resolves to, at the
  // declaration's site, so a use has no span for the walk below to
  // find. The unify below takes a parsed Val as well as text, and text
  // is the only thing with a name in it to read.
  const named = 'string' === typeof src ?
    aliasBindingAt(src, position) : undefined
  if (undefined !== named) {
    return {
      contents: { kind: 'markdown', value: aliasMarkdown(named.bind) },
      range: {
        start: { line: position.line, character: named.at.start },
        end: { line: position.line, character: named.at.end },
      },
    }
  }

  // On a key or a reference, what stands at the path it names.
  const at = 'string' === typeof src ?
    describeAt(src, position, { trust }) : undefined
  if (undefined !== at) {
    return {
      contents: {
        kind: 'markdown',
        value: hoverMarkdown(at) +
          (true === provenance ? provenanceMarkdown(src, at.path, trust) : ''),
      },
      range: at.range,
    }
  }

  let root: any
  try {
    root = new Aontu(null == trust ? {} : { trust }).unify(src, { collect: true })
  }
  catch {
    return null
  }

  const cands: { val: any, line: number, start: number, end: number }[] = []
  collectHoverCandidates(root, cands, new Set())

  // A span measured by its canon stops at the end of its line.
  const lines = 'string' === typeof src ? src.split('\n') : []
  let best: { val: any, line: number, start: number, end: number } | null = null
  for (const c of cands) {
    c.end = Math.min(c.end, lines[c.line]?.length ?? c.end)
    if (c.line === position.line &&
      c.start <= position.character && position.character < c.end) {
      // Most specific (smallest) span wins.
      if (null == best || (c.end - c.start) < (best.end - best.start)) best = c
    }
  }
  if (null == best) return null

  return {
    contents: {
      kind: 'markdown',
      value: hoverMarkdown(describeVal(best.val)) +
        (true === provenance
          ? provenanceMarkdown(src, best.val.path, trust) : ''),
    },
    range: {
      start: { line: best.line, character: best.start },
      end: { line: best.line, character: best.end },
    },
  }
}


function collectHoverCandidates(
  v: any,
  out: { val: any, line: number, start: number, end: number }[],
  seen: Set<any>,
) {
  if (null == v || 'object' !== typeof v || true !== v.isVal) return
  if (seen.has(v)) return
  seen.add(v)

  const row = v.site.row
  const col = v.site.col
  let canon = ''
  try { canon = v.canon } catch { canon = '' }
  // The span to highlight: the value's own source text where it has
  // one, canon otherwise. See siteExtent.
  const span = siteExtent(v)
  const spanSrc = 'string' === typeof v.site?.src ? v.site.src : ''
  const multiline = '' === spanSrc ? canon.includes('\n') : spanSrc.includes('\n')
  // An included file's row and column mean nothing here.
  if (row >= 1 && col >= 1 && canon.length > 0 && !multiline &&
    !v.isMap && !v.isList && '' === (v.site.url ?? '')) {
    out.push({ val: v, line: row - 1, start: col - 1, end: col - 1 + span })
  }

  const peg = v.peg
  if (Array.isArray(peg)) {
    for (const c of peg) collectHoverCandidates(c, out, seen)
  }
  else if (null != peg && 'object' === typeof peg) {
    for (const k in peg) collectHoverCandidates(peg[k], out, seen)
  }
  const spreadCj = v.spread?.cj
  if (spreadCj) collectHoverCandidates(spreadCj, out, seen)
}


// A value's canon and kind, then its titles in bold and its
// descriptions, as the Go hover writes them.
function hoverMarkdown(val: PathValue): string {
  return '```aontu\n' + val.canon + '\n```\n\n' + '*' + val.kind + '*' +
    [...val.titles.map((t) => '**' + t + '**'), ...val.descriptions]
      .map((said: string) => '\n\n' + said).join('')
}


type CompletionItem = {
  label: string
  kind?: number   // LSP CompletionItemKind
  detail?: string
  insertText?: string
}

import { funcSig, renderSig, renderSigArg } from './sig'
import { ALIAS_RE } from './aliasname'
import { aliasScope } from './alias'
import type { AliasBinding } from './alias'

// LSP CompletionItemKind subset.
const COMPLETION_FUNCTION = 3
const COMPLETION_FIELD = 5
const COMPLETION_VARIABLE = 6
const COMPLETION_KEYWORD = 14

const BUILTIN_FUNCS = [
  'abnf', 'above', 'acyclic', 'add', 'apply', 'below', 'close', 'contains', 'content', 'copy',
  'copyfiles', 'decode', 'deprecate',
  'div',
  'each', 'emit', 'empty', 'encode', 'esc',
  'file', 'filter', 'folder', 'format', 'fragment', 'gen', 'greatest',
  'hide', 'ident', 'inject', 'inverse', 'join', 'key', 'keyed', 'least', 'len', 'line',
  'listitems', 'lower',
  'match', 'max', 'maybe', 'meta', 'min', 'mod', 'move', 'mul', 'mulof', 'must', 'neq',
  'nof', 'nom', 'open',
  'pack', 'parse', 'path', 'pick',
  'pref', 'project', 're', 'relate', 'rem', 'rep', 'rest', 'slot', 'sort',
  'split', 'sub', 'sum',
  'super', 'translate', 'type', 'unique', 'upper', 'usc', 'when',
]

// Scalar-kind and literal keywords.
// `number` is the numeric supertype; `integer`, `float`, `biginteger`
// and `bigdecimal` are its leaves. New leaves join this list as they land.
const KIND_KEYWORDS = [
  'string', 'number', 'integer', 'float', 'biginteger', 'bigdecimal', 'boolean',
  'map', 'list', 'constraint',
]
// `_` joins these as of G8 phase 3: it is a literal of the language
// now, not text.
const LITERAL_KEYWORDS = ['_', 'true', 'false', 'null', 'any']


// The keys `aontu fmt` writes bare, and a list's positions.
const PLAIN_KEY = /^([A-Za-z_][A-Za-z0-9_]*|0|[1-9][0-9]*)$/

// What a path's segment reads as a value, not as a name.
const VALUE_WORDS = ['_', 'false', 'nil', 'null', 'true']


// A key that is not a plain name where it goes is written as the canon
// writes a string.
function memberItem(m: Member, on: CursorMembers['on']): CompletionItem {
  const plain = PLAIN_KEY.test(m.key) && !('path' === on && VALUE_WORDS.includes(m.key))
  return {
    label: m.key,
    kind: COMPLETION_FIELD,
    detail: m.canon + (m.optional ? ' (optional)' : ''),
    ...(plain ? {} : { insertText: JSON.stringify(m.key) }),
  }
}


// The members at the position where there are any, or the path a dot
// began; else the built-ins and names, except after a dot.
function computeCompletions(
  src: string, position?: Position, opts?: { trust?: any, trigger?: string },
): CompletionItem[] {
  const at = undefined === position ? undefined :
    membersAt(src, position, { trust: opts?.trust })
  if (undefined !== at && ('path' === at.on || 0 < at.members.length)) {
    return at.members.map((m) => memberItem(m, at.on))
  }
  if ('.' === opts?.trigger) {
    return []
  }
  const out: CompletionItem[] = []
  for (const f of BUILTIN_FUNCS) {
    // The detail is the rendered SIGNATURE (sketch/SIGNATURES.0.md)
    // -- the same renderer the hints and the docs table use, so the
    // completion list cannot drift from the declaration.
    out.push({ label: f, kind: COMPLETION_FUNCTION, detail: renderSig(funcSig[f]) })
  }
  for (const k of KIND_KEYWORDS) {
    out.push({ label: k, kind: COMPLETION_KEYWORD, detail: 'scalar kind' })
  }
  for (const k of LITERAL_KEYWORDS) {
    out.push({ label: k, kind: COMPLETION_KEYWORD, detail: 'keyword' })
  }
  // A name that binds more than once is still one name to offer.
  const named = new Set<string>()
  for (const bind of aliasScope(src)) {
    if (named.has(bind.name)) {
      continue
    }
    named.add(bind.name)
    out.push({
      label: bind.name, kind: COMPLETION_VARIABLE,
      detail: '' === bind.from ? 'alias' : 'alias from ' + bind.from,
    })
  }
  return out
}


const URI_PLAIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
  "0123456789-._~/!$&'()*+,;=:@"


export function uriToPath(uri: unknown): string | undefined {
  if ('string' !== typeof uri || !uri.startsWith('file://')) {
    return undefined
  }
  const path = percentDecode(uri.slice('file://'.length))
  if ('' === path) {
    return undefined
  }
  return driveLetterPath(path) ? path.slice(1) : path
}


function percentDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  }
  catch {
    return text
  }
}


// The inverse of uriToPath, as pathToURI is in go/lsp/handler.go.
export function pathToUri(path: string): string {
  const p = driveLetterPath('/' + path) ? '/' + path.replaceAll('\\', '/') :
    path.startsWith('\\\\') ? path.slice(2).replaceAll('\\', '/') : path
  let out = 'file://'
  for (const ch of p) {
    out += URI_PLAIN.includes(ch) ? ch : utf8Bytes(ch).map((b) =>
      '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('')
  }
  return out
}


// Whether p is `/X:…` for a drive letter X — the one shape whose
// leading slash is uri syntax rather than path. Mirrors the same
// predicate in go/lsp/handler.go.
function driveLetterPath(p: string): boolean {
  return 3 <= p.length && '/' === p[0] && ':' === p[2] &&
    /[A-Za-z]/.test(p[1])
}


class LspHandler {
  private docs = new Map<string, string>()
  private shutdownOK = false
  private exited = false

  private trust: any = undefined

  // Hover provenance (G7 phase 7): off unless an editor asks for it
  // with `initializationOptions.aontu.provenance`. It costs a second,
  // instrumented evaluation per hover, which is a cost to opt into.
  private provenance = false

  // True once an `exit` notification has been received.
  get shouldExit(): boolean { return this.exited }

  // Process exit code per the LSP spec: 0 if `shutdown` preceded `exit`,
  // else 1.
  get exitCode(): number { return this.shutdownOK ? 0 : 1 }

  // Current text of an open document, or undefined.
  doc(uri: string): string | undefined { return this.docs.get(uri) }

  // Process one incoming message, returning zero or more to send.
  handle(msg: Message): OutMessage[] {
    switch (msg.method) {
      case 'initialize': {
        const params = msg.params ?? {}
        this.provenance =
          true === params.initializationOptions?.aontu?.provenance
        const explicit = params.initializationOptions?.aontu?.trust?.include
        if (null != explicit) {
          this.trust =
            'system' === explicit ? undefined :
              'none' === explicit ? { include: 'none' } :
                ('string' === typeof explicit?.root && '' !== explicit.root)
                  ? { include: { root: explicit.root } } :
                  (null != explicit?.mem && 'object' === typeof explicit.mem)
                    ? { include: { mem: explicit.mem } } :
                    { include: 'none' }
        }
        else {
          const root = uriToPath(params.workspaceFolders?.[0]?.uri)
            ?? uriToPath(params.rootUri)
            ?? (('string' === typeof params.rootPath && '' !== params.rootPath)
              ? params.rootPath : undefined)
          this.trust = null != root ? { include: { root } } : undefined
        }
        return [{ jsonrpc: '2.0', id: msg.id, result: initializeResult() }]
      }

      case 'initialized':
        return []

      case 'shutdown':
        this.shutdownOK = true
        return [{ jsonrpc: '2.0', id: msg.id, result: null }]

      case 'exit':
        this.exited = true
        return []

      case 'textDocument/didOpen': {
        const td = msg.params?.textDocument
        if (null == td?.uri) return []
        this.docs.set(td.uri, td.text ?? '')
        return [this.publish(td.uri)]
      }

      case 'textDocument/didChange': {
        const uri = msg.params?.textDocument?.uri
        const changes = msg.params?.contentChanges
        if (null == uri || !Array.isArray(changes) || 0 === changes.length) return []
        // Full document sync: the last change holds the entire new text.
        this.docs.set(uri, changes[changes.length - 1].text ?? '')
        return [this.publish(uri)]
      }

      case 'textDocument/didClose': {
        const uri = msg.params?.textDocument?.uri
        if (null == uri) return []
        this.docs.delete(uri)
        // Clear diagnostics for the closed document.
        return [publishDiagnosticsMsg(uri, [])]
      }

      case 'textDocument/hover': {
        const uri = msg.params?.textDocument?.uri
        const pos = msg.params?.position
        const text = null != uri ? this.docs.get(uri) : undefined
        const hover = (null != text && null != pos)
          ? computeHover(text, pos, this.provenance, this.trust) : null
        return [{ jsonrpc: '2.0', id: msg.id, result: hover }]
      }

      case 'textDocument/completion': {
        const uri = msg.params?.textDocument?.uri
        const text = null != uri ? this.docs.get(uri) : undefined
        return [{
          jsonrpc: '2.0', id: msg.id,
          result: computeCompletions(text ?? '', msg.params?.position, {
            trust: this.trust,
            trigger: msg.params?.context?.triggerCharacter,
          }),
        }]
      }

      case 'textDocument/formatting': {
        const uri = msg.params?.textDocument?.uri
        const text = null != uri ? this.docs.get(uri) : undefined
        return [{
          jsonrpc: '2.0', id: msg.id,
          result: null == text ? null : computeFormatting(text),
        }]
      }

      case 'textDocument/definition': {
        const uri = msg.params?.textDocument?.uri
        const pos = msg.params?.position
        const text = null != uri ? this.docs.get(uri) : undefined
        const at = (null != text && null != pos)
          ? computeDefinition(text, pos, uri) ??
          computePathDefinition(text, pos, uri, this.trust) : null
        return [{ jsonrpc: '2.0', id: msg.id, result: at }]
      }

      case 'textDocument/signatureHelp': {
        const uri = msg.params?.textDocument?.uri
        const pos = msg.params?.position
        const text = null != uri ? this.docs.get(uri) : undefined
        const help = (null != text && null != pos)
          ? computeSignatureHelp(text, pos) : null
        return [{ jsonrpc: '2.0', id: msg.id, result: help }]
      }

      default:
        // Unknown request (has an id): reply method-not-found. Unknown
        // notification: ignore.
        if (null != msg.id) {
          return [{
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32601, message: 'method not found: ' + msg.method },
          }]
        }
        return []
    }
  }

  private publish(uri: string): OutMessage {
    return publishDiagnosticsMsg(uri,
      computeDiagnostics(this.docs.get(uri) ?? '', { trust: this.trust }))
  }
} /* node:coverage ignore next 38 */


export {
  computeDiagnostics,
  computeHover,
  computeDefinition,
  computePathDefinition,
  computeCompletions,
  computeFormatting,
  computePathAt,
  computeSitesOf,
  LspHandler,
  LSP_VERSION,
  BUILTIN_FUNCS,
  SEVERITY_ERROR,
  SEVERITY_WARNING,
  SEVERITY_INFORMATION,
  SEVERITY_HINT,
  COMPLETION_FUNCTION,
  COMPLETION_FIELD,
  COMPLETION_VARIABLE,
  COMPLETION_KEYWORD,
}

export type {
  Position,
  Range,
  Diagnostic,
  Message,
  OutMessage,
  Hover,
  MarkupContent,
  CompletionItem,
  Location,
  TextEdit,
  CursorPath,
  PathSite,
}

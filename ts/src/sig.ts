/* Copyright (c) 2021-2026 Richard Rodger, MIT License */

// THE SIGNATURE REGISTRY (docs/design/SIGNATURES.0.md). The call
// surface of the built-in functions is DECLARED, in the signature
// syntax itself, in test/spec/signature.tsv; this module is the
// TypeScript half of the pair that reads it. The declaration text is
// inlined at build time (ts/src/sigdecl.ts, `make sig`) and parsed at
// initialisation by the signature grammar -- a custom tabnas grammar,
// the same engine the aontu grammar itself is built on -- into the
// registry the runtime signature checker, the error-message builder,
// the docs table and the LSP all consume. Neither port authors a
// table: go/sig.go parses the same text with the same grammar, and
// the shared suite round-trips every line (render(parse(line)) is the
// line) so the two parsers cannot drift.
//
//   line = name '(' [ arg {',' arg} ] ')' ':' type
//   arg  = [mode] name ['?'] ':' type
//        | '...' name ':' ( type | '(' [mode] type {',' [mode] type} ')' )
//   type = word {'|' word}
//   mode = 'capture' | 'template' | 'trial' | 'projector' | 'text'
//
// `value` mode is unmarked; the five marked modes are the vocabulary
// plain pseudo-TypeScript cannot say (a captured spelling is not a
// string value). The grammar is line-oriented: the loader strips
// comment and blank lines and parses each declaration line alone, so
// the grammar never sees line structure.

import { Tabnas } from '@tabnas/parser'

import { SIGDECL } from './sigdecl'


type ArgMode = 'value' | 'capture' | 'template' | 'trial' | 'projector' | 'text'

// One group member of a rest-group argument (match's pattern/result
// pair): a mode and a type, no name -- the group repeats.
type GroupSig = {
  mode: ArgMode
  type: string
}

type ArgSig = {
  name: string
  mode: ArgMode
  type: string
  opt?: boolean
  rest?: boolean
  group?: GroupSig[]
}

type FuncSig = {
  name: string
  args: ArgSig[]
  out: string
}

const ARG_MODES: Record<string, boolean> = {
  capture: true, template: true, trial: true, projector: true, text: true,
}


// The signature grammar, as a tabnas grammar plugin. Rules: sig (the
// line) -> args -> arg -> argtype -> type | group -> gmember. Alts
// match at most two tokens, the engine's shape; lists loop the
// json-grammar way (the element rule replaces itself on ',' and
// backtracks the closer for its parent to consume).
function sigGrammar(tn: any) {
  tn.options({
    fixed: {
      token: {
        '#OP': '(',
        '#CP': ')',
        '#QM': '?',
        '#PI': '|',
        '#DD': '...',
      },
    },
    rule: { start: 'sig' },
  })

  // Parse-level validation errors, collected by the actions: the
  // engine's own errors cover token shape, these cover word choice (a
  // mode that is not a mode). Read after parse by parseSigLine.
  const errs: string[] = []
  tn.sigErrs = errs

  const mode = (word: string): ArgMode => {
    if (true !== ARG_MODES[word]) {
      errs.push('mode:' + word)
      return 'value'
    }
    return word as ArgMode
  }

  tn.grammar({
    ref: {
      '@sig-bo': (r: any) => {
        r.node = { name: '', args: [], out: '' }
        r.u.words = []
      },
      '@signame': (r: any) => {
        r.node.name = String(r.o0.val)
      },
      '@sigargs': (r: any) => {
        r.node.args = r.child.node
      },
      '@sigout': (r: any) => {
        r.node.out = r.u.words.join('|')
      },

      '@args-bo': (r: any) => {
        r.node = []
      },

      '@arg-bo': (r: any) => {
        r.u.sig = { name: '', mode: 'value', type: '' }
      },
      '@arg-rest': (r: any) => {
        r.u.sig.rest = true
        r.u.sig.name = String(r.o1.val)
      },
      '@arg-modename': (r: any) => {
        r.u.sig.mode = mode(String(r.o0.val))
        r.u.sig.name = String(r.o1.val)
      },
      '@arg-name': (r: any) => {
        r.u.sig.name = String(r.o0.val)
      },
      '@arg-opt': (r: any) => {
        r.u.sig.opt = true
      },
      '@arg-done': (r: any) => {
        const sig = r.u.sig
        const at = r.child.node
        if (Array.isArray(at)) {
          sig.group = at
          sig.type = ''
        }
        else {
          sig.type = String(at)
        }
        r.node.push(sig)
      },

      '@argtype-bo': (r: any) => {
        r.u.words = []
      },
      '@argtype-bc': (r: any) => {
        r.node = 0 < r.u.words.length ?
          r.u.words.join('|') : r.child.node
      },

      '@type-word': (r: any) => {
        r.parent.u.words.push(String(r.o0.val))
      },

      '@group-bo': (r: any) => {
        r.node = []
      },
      '@gm-two': (r: any) => {
        r.u.gm = { mode: mode(String(r.o0.val)), type: String(r.o1.val) }
      },
      '@gm-one': (r: any) => {
        r.u.gm = { mode: 'value', type: String(r.o0.val) }
      },
      '@gm-done': (r: any) => {
        r.node.push(r.u.gm)
      },
    },

    rule: {
      sig: {
        open: [
          { s: '#TX #OP', a: '@signame', p: 'args' },
        ],
        close: [
          { s: '#CL', p: 'type', a: '@sigargs' },
          { s: '#ZZ', a: '@sigout' },
        ],
      },

      args: {
        open: [
          { s: '#CP', b: 1 },
          { p: 'arg' },
        ],
        close: [
          { s: '#CP' },
        ],
      },

      arg: {
        open: [
          { s: '#DD #TX', a: '@arg-rest' },
          { s: '#TX #TX', a: '@arg-modename' },
          { s: '#TX', a: '@arg-name' },
        ],
        close: [
          { s: '#QM #CL', a: '@arg-opt', p: 'argtype' },
          { s: '#CL', p: 'argtype' },
          { s: '#CA', a: '@arg-done', r: 'arg' },
          { s: '#CP', a: '@arg-done', b: 1 },
        ],
      },

      argtype: {
        open: [
          { s: '#OP', p: 'group' },
          { p: 'type' },
        ],
        close: [
          {},
        ],
      },

      type: {
        open: [
          { s: '#TX', a: '@type-word' },
        ],
        close: [
          { s: '#PI', r: 'type' },
          {},
        ],
      },

      group: {
        open: [
          { p: 'gmember' },
        ],
        close: [
          { s: '#CP' },
        ],
      },

      gmember: {
        open: [
          { s: '#TX #TX', a: '@gm-two' },
          { s: '#TX', a: '@gm-one' },
        ],
        close: [
          { s: '#CA', a: '@gm-done', r: 'gmember' },
          { s: '#CP', a: '@gm-done', b: 1 },
        ],
      },
    },
  })
}


let sigParser: any = undefined

function makeSigParser(): any {
  if (undefined === sigParser) {
    sigParser = new Tabnas({ plugins: [sigGrammar] })
  }
  return sigParser
}


// Parse ONE declaration line. A malformed line is an Error: the
// declaration is repository content, read at build and test time, so
// failing loudly is the right shape (the round-trip suite holds the
// gate).
function parseSigLine(line: string): FuncSig {
  const tn = makeSigParser()
  tn.sigErrs.length = 0
  const out = tn.parse(line)
  if (0 < tn.sigErrs.length) {
    throw new Error('signature: bad declaration ' +
      tn.sigErrs.join(',') + ': ' + line)
  }
  if (null == out || '' === out.name || '' === out.out) {
    throw new Error('signature: incomplete declaration: ' + line)
  }
  return out as FuncSig
}


// Render one argument of a signature -- the piece the LSP's
// signatureHelp parameters share with the whole-line renderer.
function renderSigArg(a: ArgSig): string {
  const type = undefined === a.group ? a.type :
    '(' + a.group.map((g: GroupSig) =>
      ('value' === g.mode ? '' : g.mode + ' ') + g.type).join(', ') + ')'
  return (true === a.rest ? '...' : '') +
    ('value' === a.mode || true === a.rest ? '' : a.mode + ' ') +
    a.name +
    (true === a.opt ? '?' : '') +
    ': ' + type
}


// Render the canonical line for a parsed signature -- the round-trip
// twin of parseSigLine, and the one renderer every consumer (hints,
// docs, LSP) uses.
function renderSig(sig: FuncSig): string {
  return sig.name + '(' +
    sig.args.map(renderSigArg).join(', ') + ') : ' + sig.out
}


// Parse the whole declaration text: comment (#) and blank lines are
// the loader's to skip, one FuncSig per remaining line, name-keyed.
// A duplicate name is an error for the same reason a bad line is.
function parseSigText(text: string): Record<string, FuncSig> {
  const reg: Record<string, FuncSig> = {}
  for (const rawline of text.split('\n')) {
    const line = rawline.trim()
    if ('' === line || line.startsWith('#')) {
      continue
    }
    const sig = parseSigLine(line)
    if (undefined !== reg[sig.name]) {
      throw new Error('signature: duplicate declaration: ' + sig.name)
    }
    reg[sig.name] = sig
  }
  return reg
}


export type {
  ArgMode,
  ArgSig,
  GroupSig,
  FuncSig,
}

// The parsed registry, built once from the inlined declaration -- the
// one source every consumer (the arity tables, the runtime gate, the
// hints, the docs table, the LSP) reads. A parse failure here throws
// at module load: the inlined text is repository content whose parse
// the round-trip suite gates, so a failure is a build defect, not a
// runtime condition. Twin: funcSig in go/sig.go.
const funcSig: Record<string, FuncSig> =
  parseSigText(SIGDECL) /* node:coverage ignore next 8 */


export {
  funcSig,
  parseSigLine,
  parseSigText,
  renderSig,
  renderSigArg,
}

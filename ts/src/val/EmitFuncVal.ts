/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { unite } from '../unify'
import { makeNilErr } from '../err'
import { isEscVariant, escapeText } from '../escape'
import { cmpCodePoint } from '../keyorder'
import { top } from './top'
import { ListVal } from './ListVal'
import { StringVal } from './StringVal'
import { FuncBaseVal, trialUnify, sameMembers } from './FuncBaseVal'
import { repathInstance } from './Val'
import type { EmitOrigin } from './Val'
import { boundArgStart, fillPlace, rebuild } from './PlaceVal'
import { plusText } from './PlusOpVal'
import { bagMembers } from './members'


type Template = {
  match: Val,
  body: Val,
  replace?: Val,
  esc: string,
  lits: LitSpot[],
  // The rule's index in its table, which with the table's own address
  // is the address the trace names it by (RENDER.0.md P7).
  idx: number,
}


// One literal string of a body: element `i`, and within a map element
// the `n` index or the `text` key, with the text itself.
type LitSpot = { i: number, n?: number, text?: boolean, s: string }


// What is wrong with a table, with the detail the message carries.
type Refusal = { code: string, details?: Record<string, string> }


// One replacement: the key, and the text it becomes at a node.
type Pair = [string, string]


function isRefusal(x: any): x is Refusal {
  return 'string' === typeof x.code
}


// Read the table. A map is one template; a list is many. The shape is
// checked here rather than at the call, because a table is ordinary
// data and may be computed.
function tableTemplates(table: Val | undefined): Template[] | Refusal {
  const t: any = table

  if (true === t?.isEmitFunc) {
    return tableTemplates(t.peg[1])
  }

  if (true === t?.isMap) {
    const one = oneTemplate(t, 0)
    return isRefusal(one) ? one : [one]
  }

  if (true === t?.isList) {
    const out: Template[] = []
    for (const el of t.peg as Val[]) {
      const e: any = el
      if (true !== e?.isMap) {
        return { code: 'emit_template' }
      }
      const one = oneTemplate(e, out.length)
      if (isRefusal(one)) {
        return one
      }
      out.push(one)
    }
    return out
  }

  return { code: 'emit_table' }
}


function oneTemplate(m: any, idx: number): Template | Refusal {
  const match: Val = m.peg.match
  const body: any = m.peg.body
  if (null == match || null == body) {
    return { code: 'emit_template' }
  }
  if (true !== body.isList) {
    return { code: 'emit_body' }
  }

  const replace: any = m.peg.replace
  if (null != replace && true !== replace.isMap) {
    return { code: 'emit_template' }
  }

  const escv: any = m.peg.esc
  let esc = ''
  if (null != escv) {
    const name = textOf(escv)
    if (undefined === name || ('none' !== name && !isEscVariant(name))) {
      return { code: 'esc_variant' }
    }
    esc = name
  }

  const lits = literalSpots(body.peg)
  if (null != replace) {
    const bad = checkReplace(Object.keys(replace.peg), lits)
    if (undefined !== bad) {
      return bad
    }
  }

  return { match, body, replace, esc, lits, idx }
}


// The string a value carries, or undefined when it is not a string.
function textOf(v: any): string | undefined {
  return true === v?.isScalar && 'string' === typeof v.peg ? v.peg : undefined
}


function literalSpots(elems: Val[]): LitSpot[] {
  const out: LitSpot[] = []
  elems.forEach((el: any, i: number) => {
    const s = textOf(el)
    if (undefined !== s) {
      out.push({ i, s })
      return
    }
    if (true !== el?.isMap) {
      return
    }
    const chunks: any = el.peg.n
    if (true === chunks?.isList) {
      (chunks.peg as any[]).forEach((p: any, j: number) => {
        const ps = textOf(p)
        if (undefined !== ps) {
          out.push({ i, n: j, s: ps })
        }
      })
    }
    const ts = textOf(el.peg.text)
    if (undefined !== ts) {
      out.push({ i, text: true, s: ts })
    }
  })
  return out
}


function checkReplace(keys: string[], lits: LitSpot[]): Refusal | undefined {
  const sorted = [...keys].sort(cmpCodePoint)
  for (const a of sorted) {
    for (const b of sorted) {
      if (a !== b && b.includes(a)) {
        return { code: 'replace_overlap', details: { key: quoted(a), other: quoted(b) } }
      }
    }
  }
  for (const k of sorted) {
    if ('' === k || !lits.some((l) => l.s.includes(k))) {
      return { code: 'replace_unused', details: { key: quoted(k) } }
    }
  }
  return undefined
}


function substitute(text: string, pairs: Pair[]): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const hit = pairs.find((p) => text.startsWith(p[0], i))
    if (undefined === hit) {
      out += text[i]
      i += 1
    }
    else {
      out += hit[1]
      i += hit[0].length
    }
  }
  return out
}


function substituted(
  inst: Val, i: number, lits: LitSpot[], pairs: Pair[], ctx: AontuContext
): Val {
  for (const l of lits) {
    if (l.i !== i) {
      continue
    }
    const sv = new StringVal({ peg: substitute(l.s, pairs) }, ctx)
    if (undefined !== l.n) {
      (inst as any).peg.n.peg[l.n] = sv
    }
    else if (true === l.text) {
      (inst as any).peg.text = sv
    }
    else {
      inst = sv
    }
  }
  return inst
}


// A key as the message writes it, quoted so an empty key is visible.
function quoted(s: string): string {
  return '"' + s + '"'
}


function unpref(v: any): any {
  while (true === v.isPref) {
    v = v.peg
  }
  return v
}


// The reference a body named that the node could not answer, kept by
// the walk so `resolve` can report the first one against the node it
// was tried on -- and a refusal a replacement raised.
type Fail = { ref?: string, code?: string, details?: Record<string, string> }


// Every relative reference in `v` replaced by the field of `node` it
// names. Answers `v` unchanged when it holds none, so a body with no
// substitutions is never needlessly rebuilt -- the identity test
// `fillPlace` already relies on.
function bindNode(v: any, node: Val, ctx: AontuContext, fail: Fail): Val {
  if (true === v?.isRef && true !== v.absolute) {
    const found = nodeField(v, node)
    if (undefined === found) {
      fail.ref = undefined === fail.ref ? v.canon : fail.ref
      return v
    }
    const out = found.clone(ctx)
    if (null == (out as any).origin && null != (node as any).origin) {
      ; (out as any).origin = (node as any).origin +
        (v.peg as string[]).map((seg: string) => '.' + seg).join('')
    }
    return out
  }

  const peg: any = v?.peg
  const bound = boundArgStart(v)

  if (Array.isArray(peg)) {
    let changed = false
    const out = peg.map((c: any, cI: number) => {
      if (true !== c?.isVal || bound <= cI) {
        return c
      }
      const b = bindNode(c, node, ctx, fail)
      changed = changed || b !== c
      return b
    })
    return changed ? rebuild(v, out, ctx) : v
  }

  if (true === peg?.isVal) {
    const b = bindNode(peg, node, ctx, fail)
    return b === peg ? v : rebuild(v, b, ctx)
  }

  if (null != peg && 'object' === typeof peg) {
    let changed = false
    const out: Record<string, Val> = {}
    for (const k of Object.keys(peg)) {
      const c = peg[k]
      // No isVal guard, for the reason fillPlace gives: a slot holding
      // something that is not a Val answers itself, because the tests
      // above -- is it a reference, has it a peg -- are both false for
      // one.
      const b = bindNode(c, node, ctx, fail)
      changed = changed || b !== c
      out[k] = b
    }
    return changed ? rebuild(v, out, ctx) : v
  }

  return v
}


function nodeField(ref: any, node: Val): Val | undefined {
  let cur: any = node
  for (const seg of ref.peg as any[]) {
    if ('string' !== typeof seg || '.' === seg) {
      return undefined
    }
    const peg: any = cur?.peg
    if (true !== cur?.isBag || null == peg) {
      return undefined
    }
    cur = true === cur.isList ? peg[Number(seg)] : peg[seg]
    if (true !== cur?.isVal) {
      return undefined
    }
  }
  return cur
}


function nodeAddr(sel: string | undefined, key: string, node: any): string {
  if (null != node.origin) {
    return node.origin
  }
  return undefined === sel ? '' : sel + '.' + key
}


// A body element that is itself a list splices, which is what makes a
// nested emit compose into one flat sequence.
function splice(v: Val, out: Val[]): void {
  if (true === (v as any)?.isList) {
    for (const el of (v as any).peg as Val[]) {
      splice(el, out)
    }
    return
  }
  out.push(v)
}


class EmitFuncVal extends FuncBaseVal {
  isEmitFunc = true

  // THE STAGING RULE (G8 phase 0, see AontuContext.settle). The
  // selection is not settled merely by being `done` once -- a sibling
  // conjunct, an include or a spread can still merge nodes into it,
  // and pieces emitted from the half-merged bag would be missing.
  staged = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  funcname() {
    return 'emit'
  }


  // NEITHER ARGUMENT IS DRIVEN BY THE BASE. The selection is driven by
  // hand below; the TABLE is not driven at all, because a body is a
  // template and driving it would resolve its references at the call
  // site -- the one position a body is never used at.
  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  unify(peer: Val, ctx: AontuContext): Val {
    // ONE argument is driven: the selection. The table holds bodies,
    // which are templates (see prepare above).
    if (!this.stagedReady(peer, ctx, 1)) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const nodes = bagMembers(args?.[0], ctx)
    if (undefined === nodes) {
      return makeNilErr(ctx, 'emit_data', this)
    }

    let table: any = args?.[1]
    if (true === table?.isRef) {
      table = table.unify(top(), ctx)
    }

    const templates = tableTemplates(table)
    if (isRefusal(templates)) {
      return this.refuse(ctx, templates)
    }

    const rec = undefined !== ctx.reads
    const tableAddr = rec ? ((table as any)?.origin ?? '') : ''
    const selAddr = rec ? (args?.[0] as any)?.origin : undefined

    const peg: Val[] = []

    for (const member of nodes) {
      const node = member.val
      const tmpl = this.dispatch(ctx, node, templates)
      if ('string' === typeof tmpl) {
        return makeNilErr(ctx, 'emit_none', this, undefined, 'resolve', {
          value: node.canon,
          tried: tmpl,
        })
      }
      const fail: Fail = {}
      let mark: EmitOrigin | undefined = undefined
      if (rec) {
        const naddr = nodeAddr(selAddr, member.key, node)
        if ('' !== naddr && null == (node as any).origin) {
          ; (node as any).origin = naddr
        }
        mark = { node: naddr, rule: tableAddr + '#' + tmpl.idx }
      }
      this.instantiate(ctx, node, tmpl, peg, fail, mark)
      if (undefined !== fail.ref) {
        return makeNilErr(ctx, 'emit_ref', this, undefined, 'resolve', {
          ref: fail.ref,
          value: node.canon,
        })
      }
      if (undefined !== fail.code) {
        return this.refuse(ctx, { code: fail.code, details: fail.details })
      }
    }

    // THE PIECES ARE PATHED WHERE THEY LAND, once the splicing has
    // settled how many there are. A piece keeps no trace of the body
    // it was written in: the body is a template, and a template's
    // parse position is the one place it is never used.
    for (let i = 0; i < peg.length; i++) {
      repathInstance(peg[i], [...ctx.path, String(i)])
    }

    return new ListVal({ peg }, ctx)
  }


  // The located error for a refusal, with the message's details when
  // the refusal carries them.
  refuse(ctx: AontuContext, r: Refusal): Val {
    return undefined === r.details ? makeNilErr(ctx, r.code, this)
      : makeNilErr(ctx, r.code, this, undefined, 'resolve', r.details)
  }


  // First match wins, in table order, by unifiability -- the same
  // question `match` and `filter` ask, answered the same way. Returns
  // the patterns tried when nothing matched, for the located error.
  dispatch(ctx: AontuContext, node: Val, templates: Template[]): Template | string {
    const tried: string[] = []
    for (const tmpl of templates) {
      tried.push(tmpl.match.canon)
      // The trial is against CLONES: `unite` refines a bag in place
      // against a TOP peer, and a pattern that failed must be untouched
      // for the next node.
      const met = trialUnify(ctx, node.clone(ctx), tmpl.match.clone(ctx))
      if (undefined !== met && sameMembers(node, met, ctx)) {
        return tmpl
      }
    }
    return tried.join(' ')
  }


  replacements(ctx: AontuContext, node: Val, tmpl: Template, fail: Fail): Pair[] | undefined {
    if (undefined === tmpl.replace) {
      return undefined
    }
    let inst: any = tmpl.replace.clone(ctx, { dup: true })
    inst = fillPlace(bindNode(inst, node, ctx, fail), node, ctx)
    if (!inst.done) {
      inst = unite(ctx, inst, top(), 'emit')
    }
    const pairs: Pair[] = []
    for (const key of Object.keys(inst.peg)) {
      const v: any = unpref(inst.peg[key])
      const text = plusText(v)
      if (undefined === text) {
        fail.code = 'replace_value'
        fail.details = { key: quoted(key), value: String(v?.canon) }
        return undefined
      }
      pairs.push([key, 'none' === tmpl.esc ? text : escapeText(text, tmpl.esc)])
    }
    pairs.sort((a, b) => b[0].length - a[0].length || cmpCodePoint(a[0], b[0]))
    return pairs
  }


  instantiate(ctx: AontuContext, node: Val, tmpl: Template,
    out: Val[], fail: Fail, mark?: EmitOrigin): void {
    const pairs = this.replacements(ctx, node, tmpl, fail)
    if (undefined !== fail.code) {
      return
    }

    const elems: Val[] = (tmpl.body as any).peg

    for (let i = 0; i < elems.length; i++) {
      const elctx = ctx.descend(String(out.length))
      let inst = elems[i].clone(elctx, { dup: true })
      if (undefined !== pairs) {
        inst = substituted(inst, i, tmpl.lits, pairs, elctx)
      }
      let piece = fillPlace(bindNode(inst, node, elctx, fail), node, elctx)

      if (!piece.done) {
        piece = unite(elctx, piece, top(), 'emit')
      }

      const at = out.length
      splice(piece, out)
      if (undefined !== mark) {
        for (let k = at; k < out.length; k++) {
          if (null == (out[k] as any).emitted) {
            ; (out[k] as any).emitted = mark
          }
        }
      }
    }
  }

} /* node:coverage ignore next 6 */


export {
  EmitFuncVal,
}

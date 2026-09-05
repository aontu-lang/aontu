/* Copyright (c) 2025 Richard Rodger, MIT License */

// TRANSFORMATION: `emit(select, table)` (G9 phase 6,
// docs/design/EMIT.0.md). Apply-templates, with the dispatch in the
// engine and none of it in user space.
//
//   emit($.services, [
//     {match: {kind: sqs}, body: [`listen(` + .pin + `)`]}
//     {match: {kind: http}, body: [`serve(` + .path + `)`]}
//   ])
//
// For every node of `select`, in order, the first template whose
// `match` the node unifies with is taken and its `body` instantiated
// AGAINST THAT NODE. The result is one flat list.
//
// WHY THIS CANNOT BE WRITTEN IN THE DOCUMENT (EMIT.0.md, "What it
// takes"). A rule table held as a value cannot be dispatched against:
// a body referenced by path resolves its relative references AT THE
// DEFINITION SITE, and the positional resolution that does exist is a
// dot COUNT that does not survive being consumed by a second dispatch.
// The builtin instantiates a body at the node it matched -- a NAMED
// origin -- which is the whole capability.
//
// THE BODY'S RELATIVE REFERENCES ARE BOUND TO THE NODE. `.pin` inside
// a body is the matched node's `pin`, and `_` is the node itself, as
// it is in every other generator. The binding is done HERE rather than
// left to path resolution: a relative path is a COUNT taken wherever
// the value comes to rest, and the nodes of a computed selection
// (`filter(...)`) come to rest nowhere -- there is no position for a
// count to be taken from. An ABSOLUTE reference is untouched and still
// reads the document root.
//
// The binding stops at a nested generator's own binding argument
// (boundArgStart): a rule table nested in a body is the INNER emit's
// to bind, so `.x` inside it is the inner node. What crosses the
// boundary is the nested call's SELECTOR, which is argument 0 and is
// bound here -- the selector is the channel.
//
// THE RESULT IS FLAT, and that is a constraint rather than a
// convenience: the fragment algebra is flat because the nested
// spelling refuses even a valid instance in both ports, so a dispatch
// returning a tree would undo that ruling. A body element that is
// itself a list SPLICES, which is what makes a nested emit compose.
//
// NO MATCH IS AN ERROR (`emit_none`). XSLT's built-in rule copies an
// unhandled node's string value into the result, which for code output
// means model data landing silently in the middle of a source file.
// That is the single worst default in the prior art and it is refused.
// An EMPTY selection, by contrast, emits nothing -- which is the whole
// conditional mechanism, and why no `when` directive exists.
//
// A NAMED TABLE IS A PLACEHELD `emit` (`%wire = emit(_, T)`). A table
// written at a document position is DRIVEN there, so its bodies'
// relative references resolve against wherever it sits and miss;
// nothing in the language holds a value unevaluated at such a
// position, and what does hold one is a CALL's template argument.
// `emit(.listen, %wire)` follows the reference and reads the table out
// of the placeheld call; `.listen & %wire` fills the hole. Both are
// the same dispatch, and it is what lets a rule set name ITSELF.
//
// TERMINATION IS THE SELECTION'S. Unlike `pack` and `each`, this one
// recurses -- a nested model walked into nested output is the
// capability the rule layer exists to add -- so the bound is not "it
// cannot call itself" but "each dispatch descends into a finite bag
// that already exists, and a selection that empties emits nothing". A
// rule set that walks into itself WITHOUT descending is charged to the
// depth budget and refused as `unify_cycle`, like any other runaway
// descent.

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { unite } from '../unify'
import { makeNilErr } from '../err'
import { top } from './top'
import { ListVal } from './ListVal'
import { FuncBaseVal, trialUnify } from './FuncBaseVal'
import { repathInstance } from './Val'
import { boundArgStart, fillPlace, rebuild } from './PlaceVal'
import { dataValues } from './EachFuncVal'


// One entry of the rule table: the pattern to try and the body to
// instantiate. A table is a LIST of these; a single template map is
// that list of one, told apart by kind, exactly as match() tells its
// patterns apart.
type Template = { match: Val, body: Val }


// Read the table. A map is one template; a list is many. The shape is
// checked here rather than at the call, because a table is ordinary
// data and may be computed.
function tableTemplates(table: Val | undefined): Template[] | string {
  const t: any = table

  // A NAMED TABLE IS A PLACEHELD `emit`, and its table is the table.
  // A table written at a document position is DRIVEN there -- a body's
  // relative references resolve against wherever it sits and miss --
  // so the position that holds one unevaluated is the one position the
  // language already never drives: a call's template argument.
  // `%wire = emit(_, [ … ])` is that position with the selection left
  // open, and it reads as what it is, an apply-templates waiting for
  // its nodes: `emit(.listen, %wire)` passes them, `.listen & %wire`
  // fills the hole, and both are the same dispatch.
  if (true === t?.isEmitFunc) {
    return tableTemplates(t.peg[1])
  }

  if (true === t?.isMap) {
    const one = oneTemplate(t)
    return 'string' === typeof one ? one : [one]
  }

  if (true === t?.isList) {
    const out: Template[] = []
    for (const el of t.peg as Val[]) {
      const e: any = el
      if (true !== e?.isMap) {
        return 'emit_template'
      }
      const one = oneTemplate(e)
      if ('string' === typeof one) {
        return one
      }
      out.push(one)
    }
    return out
  }

  return 'emit_table'
}


function oneTemplate(m: any): Template | string {
  const match: Val = m.peg.match
  const body: any = m.peg.body
  // Both keys are required: a template with no pattern would match
  // everything by accident, and one with no body would emit nothing
  // while claiming a node.
  if (null == match || null == body) {
    return 'emit_template'
  }
  if (true !== body.isList) {
    return 'emit_body'
  }
  return { match, body }
}


// The reference a body named that the node could not answer, kept by
// the walk so `resolve` can report the first one against the node it
// was tried on.
type BindFail = { ref?: string }


// Every relative reference in `v` replaced by the field of `node` it
// names. Answers `v` unchanged when it holds none, so a body with no
// substitutions is never needlessly rebuilt -- the identity test
// `fillPlace` already relies on.
function bindNode(v: any, node: Val, ctx: AontuContext, fail: BindFail): Val {
  if (true === v?.isRef && true !== v.absolute) {
    const found = nodeField(v, node)
    if (undefined === found) {
      fail.ref = undefined === fail.ref ? v.canon : fail.ref
      return v
    }
    return found.clone(ctx)
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
      const b = true === c?.isVal ? bindNode(c, node, ctx, fail) : c
      changed = changed || b !== c
      out[k] = b
    }
    return changed ? rebuild(v, out, ctx) : v
  }

  return v
}


// The field of `node` a reference names, or undefined when it names
// none. Only a chain of plain NAMES is a field: a parent step has no
// answer at a node that is an origin rather than a position, and a
// variable segment is not a name until something resolves it -- both
// are refused here rather than left to resolve somewhere else, which
// is the failure mode the binding exists to remove.
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
    const nodes = dataValues(args?.[0])
    if ('string' === typeof nodes) {
      // dataValues names the each_data code; emit answers for itself.
      return makeNilErr(ctx, 'emit_data', this)
    }

    // A NAMED TABLE IS REACHED BY REFERENCE, and the reference -- not
    // the table -- is what is followed. Followed HERE rather than in
    // the staged drive, which waits for a SETTLED target: a table is a
    // template, a template holding a hole never settles, and waiting
    // for one would mean the dispatch never fires.
    let table: any = args?.[1]
    if (true === table?.isRef) {
      table = table.unify(top(), ctx)
    }

    const templates = tableTemplates(table)
    if ('string' === typeof templates) {
      return makeNilErr(ctx, templates, this)
    }

    const peg: Val[] = []

    for (const node of nodes) {
      const tmpl = this.dispatch(ctx, node, templates)
      if ('string' === typeof tmpl) {
        return makeNilErr(ctx, 'emit_none', this, undefined, 'resolve', {
          value: node.canon,
          tried: tmpl,
        })
      }
      const fail: BindFail = {}
      this.instantiate(ctx, node, tmpl, peg, fail)
      if (undefined !== fail.ref) {
        return makeNilErr(ctx, 'emit_ref', this, undefined, 'resolve', {
          ref: fail.ref,
          value: node.canon,
        })
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
      if (undefined !== trialUnify(ctx, node.clone(ctx), tmpl.match.clone(ctx))) {
        return tmpl
      }
    }
    return tried.join(' ')
  }


  // Instantiate one body at the node and SPLICE its pieces into the
  // output. A full instance to the leaves (`dup`, ADR-005), because a
  // bare clone shares the inner structure of any call in the body and
  // the first node's resolution would answer for every node; then the
  // two bindings, relative references and the hole, both to the node.
  instantiate(ctx: AontuContext, node: Val, tmpl: Template,
    out: Val[], fail: BindFail): void {
    const elems: Val[] = (tmpl.body as any).peg

    for (let i = 0; i < elems.length; i++) {
      const elctx = ctx.descend(String(out.length))
      const inst = elems[i].clone(elctx, { dup: true })
      let piece = fillPlace(bindNode(inst, node, elctx, fail), node, elctx)

      // A NESTED DISPATCH IS DRIVEN HERE, not left for the next pass.
      // Its selection is bound and the model has settled, so it has
      // everything it needs -- and it must answer NOW, because what
      // makes the result flat is splicing its pieces into this one.
      // Left standing, a nested `emit` resolved a pass later, as a
      // list INSIDE the list, and the fragment algebra is flat.
      // Through `unite` rather than by hand: a rule set that walks
      // into itself for ever is charged to the depth budget and
      // refused as `unify_cycle`, like any other runaway descent.
      if (!piece.done) {
        piece = unite(elctx, piece, top(), 'emit')
      }

      splice(piece, out)
    }
  }

} /* node:coverage ignore next 6 */


export {
  EmitFuncVal,
}

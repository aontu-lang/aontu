/* Copyright (c) 2026 Richard Rodger, MIT License */

// The grammar pair, ADR-033. Twin of go/abnf.go.

import type { Val, ValSpec } from '../type'
import { DONE } from '../type'
import { AontuContext } from '../ctx'
import { FuncBaseVal } from './FuncBaseVal'
import { StringVal } from './StringVal'
import { MapVal } from './MapVal'
import { ListVal } from './ListVal'
import { ConjunctVal } from './ConjunctVal'
import { makeNilErr } from '../err'
import { compileGrammar, parseWith } from '../grammar'


class AbnfFuncVal extends FuncBaseVal {
  isAbnfFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  funcname() {
    return 'abnf'
  }

  resolve(ctx: AontuContext, args: Val[]): Val {
    const a: any = args[0]

    // Not an arity check: the arity and signature gates run first, so
    // what reaches here is a nil argument, which both pass over.
    if ('string' !== typeof a?.peg) {
      return this.place(makeNilErr(ctx, 'abnf_grammar', this, undefined,
        'abnf'))
    }

    const [, why] = compileGrammar(a.peg)
    if (undefined !== why) {
      return this.place(makeNilErr(ctx, 'abnf_grammar', this, undefined,
        'abnf', { reason: why }))
    }

    return this.place(new StringVal({ peg: a.peg }, ctx))
  }
}


// A tree node is just the map {rule, src, kids}, so it needs no case of
// its own. Keys are sorted so both ports build the same member order.
function astVal(node: any, ctx: AontuContext): Val {
  if ('string' === typeof node) {
    return new StringVal({ peg: node }, ctx)
  }

  if (Array.isArray(node)) {
    return new ListVal({
      peg: node.map(
        (e: any, i: number) => astVal(e, ctx.descend(String(i)))),
    }, ctx)
  }

  const peg: Record<string, Val> = {}
  for (const k of Object.keys(node).sort()) {
    peg[k] = astVal(node[k], ctx.descend(k))
  }
  return new MapVal({ peg }, ctx)
}


class ParseFuncVal extends FuncBaseVal {
  isParseFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  funcname() {
    return 'parse'
  }


  // Meets its peer instead of resolving, so it must see the peer
  // before the base drives to resolve().
  unify(peer: Val, ctx: AontuContext): Val {
    if (1 !== this.peg.length) {
      return super.unify(peer, ctx)
    }

    this.driveStagedArgs(ctx, 1)

    const g: any = this.peg[0]
    if ('string' !== typeof g?.peg) {
      return this.residuate(peer, ctx)
    }

    // A settled constraint is stable, as a residual constraint atom is.
    // Without this a `type()` holding one never resolves.
    this.dc = DONE

    const p: any = peer
    if (true !== p?.isString || 'string' !== typeof p?.peg) {
      return this.hold(peer, ctx)
    }

    const [grammar, why] = compileGrammar(g.peg)
    if (undefined !== why) {
      return makeNilErr(ctx, 'abnf_grammar', this, peer, 'parse',
        { reason: why })
    }
    if ('' === p.peg) {
      return makeNilErr(ctx, 'parse_failed', this, peer, 'parse',
        { reason: 'the empty string parses under no grammar' })
    }
    const [, err] = parseWith(grammar, p.peg, ctx)
    if (undefined !== err) {
      return makeNilErr(ctx, 'parse_failed', this, peer, 'parse',
        { reason: err })
    }

    return peer
  }


  // The stable twin of residuate: no `notdone()`, because a settled
  // constraint stays done while it waits for a value.
  hold(peer: Val, ctx: AontuContext): Val {
    if (peer.isTop || peer.id === this.id) {
      // Cloned, or a driver meeting it twice reports `unify_cycle`.
      const out: Val = this.clone(ctx)
      out.dc = DONE
      return out
    }

    if (peer.isFunc
      && (peer as any).funcname() === this.funcname()
      && peer.path.join('.') === this.path.join('.')
      && peer.canon === this.canon) {
      return this
    }

    return new ConjunctVal({ peg: [this, peer] }, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]): Val {
    const g: any = args[0]
    const v: any = args[1]

    // Not an arity check: see the abnf twin above.
    if ('string' !== typeof g?.peg || 'string' !== typeof v?.peg) {
      return this.place(makeNilErr(ctx, 'parse_arg', this, undefined, 'parse'))
    }

    const [grammar, why] = compileGrammar(g.peg)
    if (undefined !== why) {
      return this.place(makeNilErr(ctx, 'abnf_grammar', this, undefined,
        'parse', { reason: why }))
    }

    // The host answers an empty tree for empty input.
    if ('' === v.peg) {
      return this.place(makeNilErr(ctx, 'parse_failed', this, undefined,
        'parse', { reason: 'the empty string parses under no grammar' }))
    }

    const [node, err] = parseWith(grammar, v.peg, ctx)
    if (undefined !== err) {
      return this.place(makeNilErr(ctx, 'parse_failed', this, undefined,
        'parse', { reason: err }))
    }

    return this.place(astVal(node, ctx))
  }
} /* node:coverage ignore next 6 */


export {
  AbnfFuncVal,
  ParseFuncVal,
}

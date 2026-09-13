/* Copyright (c) 2026 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import {
  lowerDecl,
  type LowerCtx,
} from '../lower'

import type { RenderLoss } from '../render'

import { MapVal } from './MapVal'
import { ListVal } from './ListVal'
import { StringVal } from './StringVal'
import { IntegerVal } from './IntegerVal'
import { FuncBaseVal } from './FuncBaseVal'


// The kinds a profile's lowering spells. The fragment algebra's own
// kinds are not here: a component tree states a line directly.
const DECL_KINDS = ['record', 'enum', 'alias', 'const', 'func']


function pad(profile: any, at: number): string {
  const indent = profile.indent ?? { unit: ' ', width: 2 }
  return (indent.unit ?? ' ').repeat((indent.width ?? 2) * at)
}


// One lowered piece as a Line node. A string is a line at depth 0, a
// `blank` is its terminator alone, and an empty span takes no pad --
// the fold's rule, kept so the bytes are the unit road's.
function lineNode(piece: any, profile: any, ctx: AontuContext): Val {
  let text = ''
  let at = 0
  if ('string' === typeof piece) {
    text = piece
  }
  else if ('line' === piece.k) {
    text = piece.n[0]
    at = piece.at ?? 0
  }

  const peg: Record<string, Val> = {
    src: new StringVal({ peg: text }, ctx),
  }
  if ('' !== text && 0 < at) {
    peg.indent = new StringVal({ peg: pad(profile, at) }, ctx)
  }

  const props = new MapVal({ peg }, ctx)
  props.closed = true
  const node = new MapVal({
    peg: {
      cmp: new StringVal({ peg: 'Line' }, ctx),
      props,
      children: new ListVal({ peg: [] }, ctx),
    },
  }, ctx)
  node.closed = true
  return node
}


function lossNode(loss: RenderLoss, ctx: AontuContext): Val {
  const node = new MapVal({
    peg: {
      tier: new IntegerVal({ peg: loss.tier }, ctx),
      construct: new StringVal({ peg: loss.construct }, ctx),
      path: new StringVal({ peg: loss.path }, ctx),
      reason: new StringVal({ peg: loss.reason }, ctx),
    },
  }, ctx)
  node.closed = true
  return node
}


class LowerDeclsFuncVal extends FuncBaseVal {
  isLowerDeclsFunc = true

  // Both arguments are data and must settle before a declaration can
  // be spelled: a half-unified type lowers to the wrong text.
  staged = true

  loss: boolean

  constructor(loss: boolean, spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
    this.loss = loss
  }


  funcname() {
    return this.loss ? 'lowerloss' : 'lowerdecls'
  }


  unify(peer: Val, ctx: AontuContext): Val {
    if (!this.stagedReady(peer, ctx, 2)) {
      return this.residuate(peer, ctx)
    }
    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]): Val {
    // Arity is checked at parse (funcArity); both arguments are here.
    const declsVal: any = args[0]
    const profileVal: any = args[1]

    if (true !== declsVal?.isList) {
      return makeNilErr(ctx, 'invalid-arg', this, declsVal, 'decls')
    }
    if (true !== profileVal?.isMap) {
      return makeNilErr(ctx, 'invalid-arg', this, profileVal, 'profile')
    }

    const profile: any = profileVal.gen(ctx)
    const family: string = profile?.lowering
    if ('typescript' !== family && 'go' !== family) {
      return makeNilErr(ctx, 'invalid-arg', this, profileVal, 'profile')
    }

    const decls: any[] = declsVal.gen(ctx)
    for (const decl of decls) {
      if (null == decl || !DECL_KINDS.includes(decl.k)) {
        return makeNilErr(ctx, 'invalid-arg', this, declsVal, 'decls')
      }
    }

    const lossy: RenderLoss[] = []
    const lctx: LowerCtx = { profile, family, unit: profile.lang, lossy }
    const out: Val[] = []

    decls.forEach((decl: any, i: number) => {
      // One blank line between declarations, and none before the
      // first: the separation `aontu render` writes.
      if (0 < i && !this.loss) {
        out.push(lineNode('', profile, ctx))
      }
      for (const piece of lowerDecl(decl, '$.' + i, lctx)) {
        if (!this.loss) {
          out.push(lineNode(piece, profile, ctx))
        }
      }
    })

    if (this.loss) {
      return this.place(
        new ListVal({ peg: lossy.map((l) => lossNode(l, ctx)) }, ctx))
    }
    return this.place(new ListVal({ peg: out }, ctx))
  }

} /* node:coverage ignore next 3 */


function lowerDeclsFuncClass(loss: boolean): any {
  class LowerDecls extends LowerDeclsFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext) {
      super(loss, spec, ctx)
    }

    make(_ctx: AontuContext, spec: ValSpec): Val {
      return new LowerDecls(spec)
    }
  }
  return LowerDecls
}


const LowerDeclsFunc = lowerDeclsFuncClass(false)
const LowerLossFunc = lowerDeclsFuncClass(true)


export {
  DECL_KINDS,
  LowerDeclsFunc,
  LowerLossFunc,
  LowerDeclsFuncVal,
}

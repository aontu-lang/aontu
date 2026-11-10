/* Copyright (c) 2024 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  descErr,
  makeNilErr,
  AontuError
} from '../err'

import { AontuContext } from '../ctx'
import { unite, withDepth } from '../unify'

import {
  explainOpen,
  ec,
  explainClose,
} from '../utility'

import {
  top
} from './top'

import { ConjunctVal } from './ConjunctVal'
import { FeatureVal } from './FeatureVal'


class OpBaseVal extends FeatureVal {
  // An op sorts BEFORE the kinds in a conjunct: only it knows to wait
  // for a staged operand, and a kind met first refuses it outright.
  cjo = 48000

  isOp = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
    this.peg = []

    for (let pI = 0; pI < spec.peg.length; pI++) {
      this.append(spec.peg[pI])
    }
  }


  append(part: any) {
    this.peg.push(part)
  }


  make(ctx: AontuContext, _spec: ValSpec): Val {
    return makeNilErr(ctx, 'op:' + this.opname(), this, undefined, 'make')
  }

  opname() {
    return 'op'
  }


  unify(peer: Val, ctx: AontuContext): Val {
    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Op:' + this.opname(), this, peer)
    let out: Val

    if (this.id == peer.id) {
      return this
    }


    let pegdone = true
    let newpeg: Val[] = []

    for (let arg of this.peg) {
      if (!arg.done) {
        const a = arg
        arg = withDepth(ctx, a, top(), () => a.unify(top(), ctx, ec(te, 'ARG')))
      }
      pegdone &&= arg.done
      newpeg.push(arg)
    }

    // console.log('OPVAL', this.id, this.opname(), pegdone, newpeg.map(p => p.canon))

    if (pegdone) {
      // `|| this` makes result truthy, so an op that cannot compute yet
      // takes the OpBaseVal arm below rather than a separate null arm.
      let result: Val = this.operate(ctx, newpeg) || this

      if (result instanceof OpBaseVal) {
        if (peer.isTop) {
          out = this
        }
        else if (peer.isNil) {
          out = makeNilErr(ctx, 'op[' + this.peg + ']', this, peer)
        }

        else if (this.canon === peer.canon) {
          out = this
        }

        else {
          this.dc = DONE === this.dc ? DONE : this.dc + 1
          out = new ConjunctVal({ peg: [this, peer] }, ctx)
        }
      }
      else {
        out = result.done && peer.isTop ? result :
          unite(te ? ctx.clone({ explain: ec(te, 'RES') }) : ctx, result, peer, 'op')
      }

      out.dc = DONE === out.dc ? DONE : this.dc + 1
    }
    else if (peer.isTop) {
      this.notdone()
      out = this.make(ctx, { peg: newpeg })

      out.site.row = this.site.row
      out.site.col = this.site.col
      out.site.url = this.site.url
      out.path = this.path

    }
    else if (peer.isNil) {
      this.notdone()
      out = peer
    }
    else {
      this.notdone()
      out = new ConjunctVal({ peg: [this, peer] }, ctx)

      out.site.row = this.site.row
      out.site.col = this.site.col
      out.site.url = this.site.url
      out.path = this.path
    }

    explainClose(te, out)

    return out
  }


  same(peer: Val): boolean {
    return null == peer ? false : this.peg === peer.peg
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, {
      peg: this.peg,
    }) as OpBaseVal)
    // THE PER-DESTINATION INSTANTIATION RULE (ADR-005): an operation
    // inside a template clones its operands as instances — the
    // default clone shares them (see FuncBaseVal.clone). Every
    // operand is a Val by construction, as in the Go twin's []Val.
    if (true === spec?.dup) {
      out.peg = this.peg.map((a: Val) => a.clone(ctx, { dup: true }))
    }
    return out
  }


  operate(ctx: AontuContext, _args: Val[]): Val | undefined {
    return makeNilErr(ctx, 'op:' + this.opname(), this, undefined, 'operate')
  }


  get canon() {
    return 'op'
  }


  primatize(v: any): undefined | null | string | number | boolean {
    const t = typeof v
    if (null == v || 'string' === t || 'number' === t || 'boolean' === t) {
      return v
    }
    else if (v?.isVal) {
      return this.primatize(v.peg)
    }
    else if (v?.toString) {
      return '' + v
    }
    else {
      return undefined
    }
  }


  gen(ctx?: AontuContext) {
    // Unresolved op cannot be generated, so always an error.
    let nil = makeNilErr(
      ctx,
      'op',
      this,
      undefined
    )

    nil.path = this.path
    nil.site.url = this.site.url
    nil.site.row = this.site.row
    nil.site.col = this.site.col

    descErr(nil, ctx)

    if (ctx) {
      ctx.adderr(nil)
    }
    else {
      throw new AontuError(nil.msg)
    }

    return undefined
  }
} /* node:coverage ignore next 6 */


export {
  OpBaseVal,
}

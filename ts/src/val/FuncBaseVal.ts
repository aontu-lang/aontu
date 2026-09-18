/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE
} from '../type'

import { AontuContext } from '../ctx'
import { unite, withDepth } from '../unify'


import {
  propagateMarks,
  ec,
  explainClose,
  explainOpen,
} from '../utility'

import { makeNilErr, AontuError } from '../err'
import { sigRefuse } from '../siggate'

import {
  top
} from './top'

import { ConjunctVal } from '../val/ConjunctVal'
import { FeatureVal } from '../val/FeatureVal'
import { hasPlace, fillPlace } from '../val/PlaceVal'


// Did the meet ADD a key or narrow a leaf, or only constrain?
function sameKids(a: any, b: any): boolean {
  if (true === a?.isMap && true === b?.isMap) {
    const ak = Object.keys(a.peg ?? {})
    if (ak.length !== Object.keys(b.peg ?? {}).length) {
      return false
    }
    return ak.every((k) => sameKids(a.peg[k], b.peg?.[k]))
  }
  if (true === a?.isList && true === b?.isList) {
    return a.peg.length === b.peg.length &&
      a.peg.every((el: any, i: number) => sameKids(el, b.peg[i]))
  }
  return a?.canon === b?.canon
}


// A disjunction WHOLE is several values at once, so whether any
// matches is what the meet answered; one under it is a member.
function sameMembers(a: any, b: any): boolean {
  return true === a?.isDisjunct || sameKids(a, b)
}


function trialUnify(ctx: AontuContext, a: Val, b: Val): Val | undefined {
  const savedErr = ctx.err
  const savedTrial = ctx._trialMode
  // Restored by DELETION where they were inherited, for the reason
  // DisjunctVal.unify's own sandbox gives at length: contexts are
  // Object.create(parent) and cached per (parent, key), so writing
  // these back leaves own properties that shadow the ancestor and make
  // a later trial invisible to the value running inside it.
  const ownErr = Object.prototype.hasOwnProperty.call(ctx, 'err')
  const ownTrial = Object.prototype.hasOwnProperty.call(ctx, '_trialMode')
  const trialErr: any[] = []

  ctx.err = trialErr
  ctx._trialMode = true

  let out: Val
  try {
    out = unite(ctx, a, b, 'trial')
  }
  finally {
    if (ownErr) {
      ctx.err = savedErr
    }
    else {
      delete (ctx as any).err
    }
    if (ownTrial) {
      ctx._trialMode = savedTrial
    }
    else {
      delete (ctx as any)._trialMode
    }
  }

  return 0 < trialErr.length || out.isNil ? undefined : out
}


class FuncBaseVal extends FeatureVal {
  isFunc = true

  forgives = false
  isGenable = true

  staged = false

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  validateArgs(args: Val[], min: number) {
    if (min < args.length) {
      throw new AontuError('The ' + this.funcname() + ' function needs at least ' +
        min + ' argument' + (1 === min ? '' : 's') + '.')
    }
  }


  make(ctx: AontuContext, _spec: ValSpec): Val {
    return makeNilErr(ctx, 'func:' + this.funcname(), this, undefined, 'make')
  }


  driveStagedArgs(ctx: AontuContext, count: number): boolean {
    const TOP = top()
    let alldone = true

    const actx: AontuContext = ctx.clone({})
    ; (actx as any).argsnap = true

    for (let i = 0; i < count && i < this.peg.length; i++) {
      const arg: Val = this.peg[i]
      if (!arg.done) {
        // Charged to the depth budget, as FuncBaseVal's own arg loop is:
        // this recurses without going through `unite`.
        this.peg[i] = withDepth(ctx, arg, TOP, () => arg.unify(TOP, actx))
      }
      alldone = alldone && true === this.peg[i].done
    }

    return alldone
  }


  stagedReady(peer: Val, ctx: AontuContext, count: number): boolean {
    const ready = this.driveStagedArgs(ctx, count)
    return (ready || (!peer.isTop && hasPlace(this))) && true === ctx.settle
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    const out = super.clone(ctx, spec) as FuncBaseVal
    if (true === spec?.dup && Array.isArray(this.peg)) {
      out.peg = this.peg.map((a: Val) => a.clone(ctx, { dup: true }))
    }
    return out
  }


  // The shape a staged func holds while it waits: not done, so the pass
  // loop keeps going; unchanged against TOP, so nothing reads an answer
  // it has not given; and collapsed against an identical twin at the
  // same position, so `key() & key()` does not grow a conjunct per pass.
  residuate(peer: Val, ctx: AontuContext): Val {
    this.notdone()

    if (peer.isTop || (peer.id === this.id)) {
      // Cloned rather than returned: a driver that met the same object
      // twice in one pass would charge the revisit budget and report
      // `unify_cycle`.
      return this.clone(ctx)
    }

    if (peer.isNil) {
      return peer
    }

    if (peer.isFunc
      && (peer as any).funcname() === this.funcname()
      && peer.path.join('.') === this.path.join('.')
      && peer.canon === this.canon) {
      return this
    }

    return new ConjunctVal({ peg: [this, peer] }, ctx)
  }


  unify(peer: Val, ctx: AontuContext): Val {
    if (this.staged && !ctx.settle) {
      return this.residuate(peer, ctx)
    }

    if (!peer.isTop && !peer.isNil && this.id !== peer.id && hasPlace(this)) {
      if (hasPlace(peer)) {
        return makeNilErr(ctx, 'place_pair', this, peer)
      }
      return fillPlace(this, peer, ctx).unify(top(), ctx)
    }

    const TOP = top()
    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Func:' + this.funcname(), this, peer)


    let why = ''
    let out: Val = this


    let pegdone = true

    if (this.id !== peer.id) {

      if (peer.isTop && (this.mark.type || this.mark.hide)) {
        this.dc = DONE
      }

      else {

        let newpeg: Val[] = []
        let newtype = this.mark.type
        let newhide = this.mark.hide

        let pegprep = this.prepare(ctx, this.peg)

        if (null === pegprep) {
          pegdone = true
          newpeg = this.peg
        }
        else {
          this.peg = pegprep

          for (let arg of this.peg) {

            let newarg = arg
            if (!arg.done) {
              const argctx = te ? ctx.clone({ explain: ec(te, 'ARG') }) : ctx
              newarg = withDepth(ctx, arg, TOP, () => arg.unify(TOP, argctx))
              newtype = newtype || newarg.mark.type
              newhide = newhide || newarg.mark.hide
            }
            // pegdone &&= arg.done
            pegdone &&= newarg.done
            newpeg.push(newarg)
          }
        }

        // console.log('FUNCBASE-PEG', this.id, pegdone, this.peg.map((p: any) => p?.canon))

        // ABSENCE PROPAGATES (ADR-034), ahead of deferResolve.
        const gone = this.forgives ? undefined :
          newpeg.find((a: Val) => true === (a as any).isAbsent)

        if (pegdone &&
          (undefined !== gone || !this.deferResolve(ctx, newpeg))) {
          // THE SIGNATURE GATE (docs/design/SIGNATURES.0.md): the
          // driven arguments against the declared signature, before
          // the builtin's own logic sees them. See siggate.ts for
          // what the gate owns and what stays with the builtins.
          const resolved = gone ?? sigRefuse(ctx, this, newpeg) ??
            this.resolve(ctx, newpeg)

          // The TOP peer is DROPPED as the unit it is.
          out = resolved.done && peer.isTop ? resolved :
            unite(te ? ctx.clone({ explain: ec(te, 'PEG') }) : ctx,
              resolved, peer, 'func-' + this.funcname() + '/' + this.id)
          propagateMarks(this, out)

          out.site.row = this.site.row
          out.site.col = this.site.col
          out.site.url = this.site.url
          out.site.len = this.site.len
          out.site.src = this.site.src
          out.path = this.path

          why += 'pegdone'
        }
        else if (peer.isTop) {
          this.notdone()
          out = this.make(ctx, { peg: newpeg, mark: { type: newtype, hide: newhide } })

          out.site.row = this.site.row
          out.site.col = this.site.col
          out.site.url = this.site.url
          out.site.len = this.site.len
          out.site.src = this.site.src
          out.path = this.path

          why += 'top'
        }
        else if (peer.isNil) {
          this.notdone()
          out = peer
          why += 'nil'
        }
        else {
          this.notdone()
          out = new ConjunctVal({
            peg: [this, peer], mark: { type: newtype, hide: newhide }
          }, ctx)

          out.site.row = this.site.row
          out.site.col = this.site.col
          out.site.url = this.site.url
          out.site.len = this.site.len
          out.site.src = this.site.src
          out.path = this.path

          why += 'defer'
        }
      }
    }

    // console.log('FUNC-UNIFY-OUT', ctx.cc, this.funcname(), this.id, this.canon, 'D=', pegdone, 'W=', why, peer.id, peer.canon, 'O=', out.dc, out.id, out.canon)

    explainClose(te, out)

    return out
  }


  get canon() {
    return '' +
      // (this.type ? '<type>' : '') +
      // (this.done ? '<done>' : '') +
      // (this.id + '=') +
      this.funcname() + '(' + (this.peg.map((p: any) => p.canon).join(',')) + ')'
  }


  funcname() {
    return 'func'
  }


  prepare(_ctx: AontuContext, args: Val[]): Val[] | null {
    return args
  }


  resolve(ctx: AontuContext, _args: Val[]): Val {
    return makeNilErr(ctx, 'func:' + this.funcname(), this, undefined, 'resolve')
  }


  deferResolve(_ctx: AontuContext, _args?: Val[]): boolean {
    return false
  }


} /* node:coverage ignore next 7 */


export {
  trialUnify,
  sameMembers,
  FuncBaseVal,
}

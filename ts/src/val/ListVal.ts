/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValList,
  ValSpec,
} from '../type'

import {
  DONE,
  SPREAD,
} from '../type'

import { AontuContext } from '../ctx'
import { unite } from '../unify'

import { sealChild } from './SealVal'

import {
  propagateMarks,
  canonRiders,
  bareTop,
  explainOpen,
  ec,
  explainClose,
} from '../utility'

import { makeNilErr, AontuError } from '../err'


import {
  top
} from './top'

import { ConjunctVal } from './ConjunctVal'
import { NilVal } from './NilVal'
import { BagVal, undecided } from './BagVal'
import { repathInstance, spreadId } from './Val'
import { markSpread } from '../provenance'
import { meetSpreads } from './MapVal'


class ListVal extends BagVal {
  isList = true

  constructor(
    spec: {
      peg: ValList
    },
    ctx?: AontuContext
  ) {
    super(spec, ctx)

    if (null == this.peg) {
      throw new AontuError('ListVal spec.peg undefined')
    }

    let spread = (this.peg as any)[SPREAD]
    delete (this.peg as any)[SPREAD]

    if (spread) {
      if ('&' === spread.o) {

        // Multiple same-level spreads conjoin; an unequal spread from
        // another statement meets this one in unify's combination
        // below (see the MapVal constructor note — the combined
        // template is stateless, BUGS.md §6-§7).
        this.spread.cj =
          Array.isArray(spread.v) ?
            1 < spread.v.length ?
              new ConjunctVal({ peg: spread.v }, ctx) :
              spread.v[0] :
            spread.v

      }
    }
  }


  // NOTE: order of keys is not preserved!
  // not possible in any case - consider {a,b} unify {b,a}
  unify(peer: Val, ctx: AontuContext): Val {
    // A rel() peer drives: the relation constraint rewrites this list
    // leaf by leaf (RELATIONS.0.md §3.2); see the twin arm in MapVal.
    if (true === (peer as any)?.isRel) {
      return (peer as any).unify(this, ctx)
    }

    const TOP = top()
    peer = peer ?? TOP

    if (true === (peer as any).isConstraint) {
      return peer.unify(this, ctx)
    }

    if (true === ctx._trialMode && true === (peer as any).isList
      && null == this.spread.cj && null == (peer as any).spread.cj
      && this.peg.length !== (peer as any).peg.length) {
      return makeNilErr(ctx, 'list_length', this, peer)
    }

    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'List', this, peer)
    let done: boolean = true
    let exit = false

    // NOTE: not a clone! needs to be constructed.
    let out: ListVal | NilVal = (peer.isTop ? this : new ListVal({ peg: [] }, ctx))

    out.closed = this.closed
    out.opened = this.opened
    out.optionalKeys = [...this.optionalKeys]
    out.spread.cj = this.spread.cj
    out.site = this.site

    if (peer instanceof ListVal) {
      if (!this.closed && peer.closed) {
        out = peer.unify(this, te ? ctx.clone({ explain: ec(te, 'PMC') }) : ctx) as ListVal
        exit = true
      }
      else {
        out.closed = out.closed || peer.closed
        out.spread.cj = null == out.spread.cj ? peer.spread.cj : (
          null == peer.spread.cj ? out.spread.cj :
            meetSpreads(te ? ctx.clone({ explain: ec(te, 'SPR') }) : ctx,
              out.spread.cj, peer.spread.cj, 'list-peer')
        )
      }
    }


    if (!exit) {
      out.dc = this.dc + 1

      let spread_cj = out.spread.cj || TOP

      // Always unify children first
      for (let key in this.peg) {
        const keyctx = ctx.descend(key)
        const child = this.peg[key]

        propagateMarks(this, child)

        let oval: Val
        if (!spread_cj.isTop && (child.isAbsent || undecided(child))) {
          oval = child.isAbsent ? child :
            unite(te ? keyctx.clone({ explain: ec(te, 'PEG:' + key) }) : keyctx,
              child, TOP, 'list-own')
          // Decided to be there: the template applies next pass.
          done = done && oval.isAbsent
        }
        else if (!spread_cj.isTop
          && (child as any)._spr === spreadId(spread_cj)) {
          oval = child.done ? child :
            unite(te ? keyctx.clone({ explain: ec(te, 'PEG:' + key) }) : keyctx,
              child, TOP, 'list-own')
          ; (oval as any)._spr = spreadId(spread_cj)
        }
        else {
          const key_spread_cj = spread_cj.spreadClone(keyctx)
          // The spread mark the provenance recorder reads (G7 phase 3),
          // as in MapVal: this is where a template becomes a per-element
          // contribution. Instrumented runs only.
          if (undefined !== keyctx.prov) {
            markSpread(key_spread_cj)
          }

          // child is non-nullish: propagateMarks above dereferences it.
          oval =
            child.isNil ? child :
                key_spread_cj.isNil ? key_spread_cj :
                  bareTop(key_spread_cj) && child.done &&
                    undefined === keyctx.prov ? child :
                    bareTop(child) && key_spread_cj.done ? key_spread_cj :
                      unite(te ? keyctx.clone({ explain: ec(te, 'PEG:' + key) }) : keyctx,
                        child, key_spread_cj, 'list-own')

          if (!spread_cj.isTop && !oval.isNil) {
            ; (oval as any)._spr = spreadId(spread_cj)
          }
        }

        out.peg[key] = oval

        done = (done && DONE === oval.dc)
      }

      const allowedKeys: string[] = this.closed ? Object.keys(this.peg) : []
      let bad: NilVal | undefined = undefined

      if (peer instanceof ListVal) {
        let upeer: ListVal = peer.done ? peer as ListVal : (unite(
          te ? ctx.clone({ explain: ec(te, 'PER') }) : ctx,
          peer, TOP, 'list-peer-list') as ListVal)

        // NOTE: peerkey is the index
        for (let peerkey in upeer.peg) {
          let peerchild = upeer.peg[peerkey]

          // A spread declares every element, so a closed list with one
          // fixes nothing here; the template judges the element.
          if (this.closed && null == out.spread.cj &&
            !allowedKeys.includes(peerkey)) {
            bad = makeNilErr(ctx, 'closed', peerchild, undefined)
          }

          let child = out.peg[peerkey]

          const peerctx = ctx.descend(peerkey)

          if (this.closed && undefined !== child) {
            child = out.peg[peerkey] = sealChild(peerctx, child)
          }

          let oval = out.peg[peerkey] =
            undefined === child ? peerchild :
              bareTop(child) && peerchild.done ? peerchild :
                child.isNil ? child :
                  peerchild.isNil ? peerchild :
                    unite(te ? peerctx.clone({ explain: ec(te, 'CHD') }) : peerctx,
                      child, peerchild, 'list-peer')

          if (this.spread.cj && undecided(oval)) {
            done = false
          }
          else if (this.spread.cj && !oval.isAbsent) {
            let key_spread_cj = spread_cj.spreadClone(peerctx)
            if (undefined !== peerctx.prov) {
              markSpread(key_spread_cj)
            }

            oval = out.peg[peerkey] =
              unite(te ? peerctx.clone({ explain: ec(te, 'PSP:' + peerkey) }) : peerctx,
                out.peg[peerkey], key_spread_cj, 'list-spread')
          }

          propagateMarks(this, oval)

          done = (done && DONE === oval.dc)
        }
      }
      else if (true === (peer as any).isContainerKind) {
        // The container KIND delegates to its own arm, exactly as a
        // scalar delegates to a ScalarKindVal peer (MapVal has the
        // same arm).
        out = peer.unify(this, ctx) as any
      }
      else if (!peer.isTop) {
        out = makeNilErr(ctx, 'list', this, peer)
      }

      if (null != bad) {
        out = bad
      }

      if (!out.isNil && (out as any).closed) {
        for (const key of Object.keys(out.peg)) {
          out.peg[key] = sealChild(ctx.descend(key), out.peg[key])
        }
      }

      if (!out.isNil) {
        ;(out.uh ??= []).push(peer.id)

        out.dc = done ? DONE : out.dc
        propagateMarks(peer, out)
        propagateMarks(this, out)
      }
    }

    ctx.explain && explainClose(te, out)

    return out
  }


  spreadClone(ctx: AontuContext): Val {
    // B1: share directly when the spread tree has no path-dependent
    // leaves. See MapVal.spreadClone for rationale.
    if (!this.isPathDependent) return this

    let allScalarKind = true
    for (let key in this.peg) {
      if (!(this.peg[key] as any)?.isScalarKind) {
        allScalarKind = false
        break
      }
    }

    if (!allScalarKind) {
      // A full instance (`dup`, ADR-005), paths normalised to the
      // destination: see Val.spreadClone and repathInstance.
      const out = this.clone(ctx, { dup: true })
      repathInstance(out, out.path)
      return out
    }

    let out = (super.clone(ctx) as ListVal)

    for (let entry of Object.entries(this.peg)) {
      out.peg[entry[0]] = entry[1]
    }

    // Must create a new spread object to avoid mutating the original.
    out.spread = {
      cj: this.spread.cj ? this.spread.cj.spreadClone(ctx) : undefined,
    }

    out.closed = this.closed
    out.opened = this.opened
    out.optionalKeys = [...this.optionalKeys]

    return out
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, spec) as ListVal)
    // The instantiation flag descends with the mark (ADR-005): a
    // template's elements are part of the instance.
    const childspec = spec?.mark || spec?.dup ?
      { mark: spec?.mark, dup: spec?.dup } : {}
    for (let entry of Object.entries(this.peg)) {
      out.peg[entry[0]] =
        (entry[1] as any)?.isVal ? (entry[1] as Val).clone(ctx, {
          ...childspec,
          path: [...out.path, entry[0]],
        }) : entry[1]
    }
    if (this.spread.cj) {
      out.spread.cj = this.spread.cj.clone(ctx, childspec)
    }

    out.closed = this.closed
    out.opened = this.opened
    out.optionalKeys = [...this.optionalKeys]

    return out
  }


  get canon() {
    let keys = Object.keys(this.peg)
    return '' +
      '[' +
      (this.spread.cj ? '&:' + this.spread.cj.canon +
        (0 < keys.length ? ',' : '') : '') +
      keys.map(k => canonRiders(this.peg[k])).join(',') +
      ']'
  }
} /* node:coverage ignore next 8 */


export {
  ListVal,
}

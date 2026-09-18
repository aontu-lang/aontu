/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
  SPREAD,
} from '../type'

import { AontuContext } from '../ctx'
import { unite } from '../unify'

import {
  propagateMarks,
  canonRiders,
  walk,
  explainOpen,
  ec,
  explainClose,
} from '../utility'

import { makeNilErr, AontuError } from '../err'

import {
  top
} from './top'
import { pendingMarkWrapper } from './RefVal'


import { ConjunctVal } from './ConjunctVal'
import { NilVal } from './NilVal'
import { BagVal } from './BagVal'
import { repathInstance, spreadId } from './Val'
import { cmpCodePoint } from '../keyorder'
import { aliasBareName, EXPORT_DECL_NAME } from '../aliasname'
import { markSpread } from '../provenance'


function spreadSnapKey(cj: any): string {
  return cj.spelling + '~' + cj.site.url + '~' + cj.site.row + ':' + cj.site.col
}

function snapshotRefSpread(cj: any, ctx: AontuContext): Val | undefined {
  let snapmap: Map<string, Val> | undefined = (ctx as any).snapmap
  if (undefined === snapmap) {
    // Direct Val.unify use without a Unify run: degrade to a ctx-local
    // map (snapshots then live only for that subtree, as before).
    snapmap = new Map()
    ; (ctx as any).snapmap = snapmap
  }
  const sk = spreadSnapKey(cj)
  let snap: Val | undefined = snapmap.get(sk)
  if (undefined === snap) {
    // snap mode: the pending-mark-wrapper defer in find must not
    // apply here — the snapshot WANTS the pre-resolution structure.
    let tgt: Val | undefined = cj.find(ctx, true)
    // A ref to a type() resolves to its inner template — snapshot that,
    // so a type-wrapped ref behaves like a plain-map ref spread.
    if (tgt && (tgt as any).isTypeFunc) tgt = (tgt as any).peg?.[0]
    if (tgt && pendingMarkWrapper(tgt)) {
      return undefined
    }
    // Only snapshot a found, path-dependent target. If the target is not
    // present yet (it may be introduced by a later conjunct/merge), do
    // NOT cache — retry on the next fixpoint pass.
    if (tgt && tgt.isVal && tgt.isPathDependent) {
      snap = tgt.clone(ctx)
      // Clear TYPE marks on the snapshot (recursively): a type() template
      // constrains values but must not make the spread destination
      // type-invisible at any depth. HIDE marks are preserved.
      walk(snap, (_k: any, v: Val) => {
        v.mark.type = false
        return v
      })
      snapmap.set(sk, snap)
    }
  }
  return snap
}


class MapVal extends BagVal {
  isMap = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)

    if (null == this.peg) {
      throw new AontuError('MapVal spec.peg undefined')
    }

    this.mark.type = !!spec.mark?.type
    this.mark.hide = !!spec.mark?.hide

    let spread = (this.peg as any)[SPREAD]
    delete (this.peg as any)[SPREAD]

    if (spread) {
      if ('&' === spread.o) {
        this.spread.cj =
          Array.isArray(spread.v) ?
            1 < spread.v.length ?
              new ConjunctVal({ peg: spread.v }, ctx) :
              spread.v[0] :
            spread.v
      }
    }

  }


  // An `export` answers to the root rule a declaration does.
  aliasDeclarationsAreRooted(ctx: AontuContext): Val | undefined {
    const named = 0 < this.aliasKeys.length ?
      aliasBareName(this.aliasKeys[0]) :
      0 < this.exportKeys.length ? EXPORT_DECL_NAME : undefined
    if (undefined === named || 0 === this.path.length) {
      return undefined
    }
    const nv: any = new NilVal({ why: 'alias_not_toplevel' }, ctx)
    nv.site = this.site
    nv.path = [...this.path, named]
    return nv
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const arooted = this.aliasDeclarationsAreRooted(ctx)
    if (undefined !== arooted) {
      return arooted
    }

    const TOP = top()
    peer = peer ?? TOP

    if (true === (peer as any).isConstraint) {
      return peer.unify(this, ctx)
    }

    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Map', this, peer)

    let done: boolean = true
    let exit = false

    // NOTE: not a clone! needs to be constructed.
    let out: MapVal | NilVal = (peer.isTop ? this : new MapVal({ peg: {} }, ctx))

    out.closed = this.closed
    out.optionalKeys = [...this.optionalKeys]
    out.aliasKeys = [...this.aliasKeys]
    out.spread.cj = this.spread.cj
    out.site = this.site

    if (true === (peer as any)?.isRel) {
      return peer.unify(this, te ? ctx.clone({ explain: ec(te, 'REL') }) : ctx)
    }

    if (peer instanceof MapVal) {
      if (!this.closed && peer.closed) {
        out = peer.unify(this, te ? ctx.clone({ explain: ec(te, 'PMC') }) : ctx) as MapVal
        exit = true
      }

      // ensure determinism of unification
      else if (this.closed && peer.closed) {
        const peerkeys = Object.keys(peer.peg)
        const selfkeys = Object.keys(this.peg)

        if (
          peerkeys.length < selfkeys.length
          || (peerkeys.length === selfkeys.length
            && peerkeys.join('~') < selfkeys.join('~')
          )
        ) {
          out = peer.unify(this, te ? ctx.clone({ explain: ec(te, 'SPC') }) : ctx) as MapVal
          exit = true
        }

      }

      if (!exit) {
        out.spread.cj = null == out.spread.cj ? peer.spread.cj : (
          null == peer.spread.cj ? out.spread.cj :
            out.spread.cj.canon === peer.spread.cj.canon ? out.spread.cj :
              unite(te ? ctx.clone({ explain: ec(te, 'SPR') }) : ctx,
                out.spread.cj, peer.spread.cj, 'map-self')
        )
      }
    }
    else {
    }


    if (!exit) {
      out.dc = this.dc + 1


      let spread_cj = out.spread.cj ?? TOP

      if (spread_cj.isRef && (spread_cj as any).find) {
        const snap = snapshotRefSpread(spread_cj, ctx)
        if (snap) spread_cj = snap
      }

      if ((spread_cj as any).isTypeFunc) {
        spread_cj = (spread_cj as any).peg?.[0] ?? TOP
      }

      // Always unify own children first
      for (let key in this.peg) {
        const child = this.peg[key]
        const keyctx = ctx.descend(key)

        propagateMarks(this, child)

        let oval: Val
        // No `undefined !== child` here: propagateMarks above already
        // dereferenced it, so a missing child would have thrown there.
        if (!spread_cj.isTop
          && (child as any)._spr === spreadId(spread_cj)) {
          oval = child.done ? child :
            unite(te ? keyctx.clone({ explain: ec(te, 'KEY:' + key) }) : keyctx,
              child, TOP, 'map-own')
          ; (oval as any)._spr = spreadId(spread_cj)
        }
        else {
          const key_spread_cj = spread_cj.spreadClone(keyctx)

          // The one place a spread is APPLIED, so the one place that
          // knows a contribution came from a template rather than
          // from the key itself (G7 phase 3). Only when someone is
          // recording: the walk is O(template) per key per pass.
          if (undefined !== keyctx.prov) {
            markSpread(key_spread_cj)
          }

          // child is non-nullish: propagateMarks above dereferences it.
          oval =
            child.isNil ? child :
                key_spread_cj.isNil ? key_spread_cj :
                  key_spread_cj.isTop && child.done && undefined === keyctx.prov
                    ? child :
                    child.isTop && key_spread_cj.done ? key_spread_cj :
                      unite(te ? keyctx.clone({ explain: ec(te, 'KEY:' + key) }) : keyctx,
                        child, key_spread_cj, 'map-own')

          if (!spread_cj.isTop && !oval.isNil) {
            ; (oval as any)._spr = spreadId(spread_cj)
          }
        }

        out.peg[key] = oval


        done = (done && DONE === oval.dc)
      }

      const allowedKeys: string[] = this.closed ? Object.keys(this.peg) : []
      let bad: NilVal | undefined = undefined

      if (peer instanceof MapVal) {
        let upeer: MapVal = peer.done ? peer as MapVal : (unite(
          te ? ctx.clone({ explain: ec(te, 'PER') }) : ctx,
          peer, TOP, 'map-peer-map') as MapVal)

        for (let peerkey in upeer.peg) {
          let peerchild = upeer.peg[peerkey]

          if (this.closed && !allowedKeys.includes(peerkey)) {
            bad = makeNilErr(ctx, 'closed', peerchild, undefined)
          }

          // key optionality is additive
          if (upeer.optionalKeys.includes(peerkey) && !out.optionalKeys.includes(peerkey)) {
            out.optionalKeys.push(peerkey)
          }

          if (upeer.aliasKeys.includes(peerkey) && !out.aliasKeys.includes(peerkey)) {
            out.aliasKeys.push(peerkey)
          }

          let child = out.peg[peerkey]

          const peerctx = ctx.descend(peerkey)

          let oval = out.peg[peerkey] =
            undefined === child
              ? (undefined !== peerctx.prov && peerchild.isGenable
                ? unite(peerctx, peerchild, TOP, 'map-peer-only')
                : this.handleExpectedVal(peerkey, peerchild, this, ctx)) :
              child.isTop && peerchild.done ? peerchild :
                child.isNil ? child :
                  peerchild.isNil ? peerchild :
                    unite(te ? peerctx.clone({ explain: ec(te, 'CHD') }) : peerctx,
                      child, peerchild, 'map-peer')

          if (this.spread.cj) {
            // Same apply-once discipline as the own-key loop: once the
            // constraint is merged into the value (marked with the
            // constraint's id), later passes only self-unify.
            if ((oval as any)._spr !== spreadId(spread_cj)) {
              let key_spread_cj = spread_cj.spreadClone(peerctx)

              if (undefined !== peerctx.prov) {
                markSpread(key_spread_cj)
              }

              oval = out.peg[peerkey] =
                unite(te ? peerctx.clone({ explain: ec(te, 'PSP:' + peerkey) }) : peerctx,
                  oval, key_spread_cj, 'map-peer-spread')

              if (!spread_cj.isTop && !oval.isNil) {
                ; (oval as any)._spr = spreadId(spread_cj)
              }
            }
          }

          propagateMarks(this, oval)

          done = (done && DONE === oval.dc)
        }
      }
      else if (true === (peer as any).isContainerKind) {
        // The container KIND delegates to its own arm, exactly as a
        // scalar delegates to a ScalarKindVal peer: the kind knows to
        // admit this map, and this map knows nothing about kinds.
        out = peer.unify(this, ctx) as any
      }
      else if (!peer.isTop) {
        out = makeNilErr(ctx, 'map', this, peer)
      }

      if (null != bad) {
        out = bad
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

    let out = (super.clone(ctx) as MapVal)
    out.peg = {}

    for (let entry of Object.entries(this.peg)) {
      out.peg[entry[0]] = entry[1]
    }

    // Must create a new spread object to avoid mutating the original.
    out.spread = {
      cj: this.spread.cj ? this.spread.cj.spreadClone(ctx) : undefined,
    }

    out.closed = this.closed
    out.optionalKeys = [...this.optionalKeys]
    out.aliasKeys = [...this.aliasKeys]

    return out
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, spec) as MapVal)
    out.peg = {}

    for (let entry of Object.entries(this.peg)) {
      out.peg[entry[0]] =
        (entry[1] as any)?.isVal ?
          (entry[1] as Val).clone(ctx, {
            mark: spec?.mark ?? {},
            path: [...out.path, entry[0]],
            // The instantiation flag descends (ADR-005): a template's
            // children are part of the instance.
            dup: spec?.dup,
          }) :
          entry[1]
    }
    if (this.spread.cj) {
      out.spread.cj = this.spread.cj.clone(ctx,
        spec?.mark || spec?.dup ?
          { mark: spec?.mark, dup: spec?.dup } : {})
    }

    out.closed = this.closed
    out.optionalKeys = [...this.optionalKeys]
    out.aliasKeys = [...this.aliasKeys]


    return out
  }


  get canon() {
    let keys = Object.keys(this.peg)
      .filter(k => !this.aliasKeys.includes(k))
      .sort(cmpCodePoint)
    return '' +
      // this.errcanon() +
      // (this.mark.type ? '<type>' : '') +
      // (this.id + '=') +
      '{' +
      (this.spread.cj ? '&:' + this.spread.cj.canon +
        (0 < keys.length ? ',' : '') : '') +
      keys
        .map(k => [
          JSON.stringify(k) +
          (this.optionalKeys.includes(k) ? '?' : '') +
          ':' +
          (true === this.peg[k]?.isVal
            ? canonRiders(this.peg[k]) : this.peg[k])
        ])
        .join(',') +
      '}' // + '<' + (this.mark.hide ? 'H' : '') + '>'

  }


  inspection(d?: number) {
    return this.spread.cj ? '&:' + this.spread.cj.inspect(null == d ? 0 : d + 1) : ''
  }

} /* node:coverage ignore next 6 */


export {
  MapVal,
  spreadSnapKey,
}

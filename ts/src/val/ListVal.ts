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

import {
  propagateMarks,
  canonRiders,
  constantIdFunc,
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
import { BagVal } from './BagVal'
import { repathInstance, spreadId } from './Val'
import { markSpread } from '../provenance'


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

        // Clearing rule 3 (G4 phase 1): a CONSTANT id in the template
        // would declare every child to be one entity. The refusal
        // replaces the template, so it reaches every child and the
        // bag itself (see the isNil arm where the spread is applied)
        // as ONE nil identity — made here, once, rather than per
        // pass, so the report names it once.
        const idfn: any = constantIdFunc(this.spread.cj)
        if (undefined !== idfn) {
          const nil: any = new NilVal({ why: 'id_spread' }, ctx)
          nil.site.row = idfn.site.row
          nil.site.col = idfn.site.col
          nil.site.url = idfn.site.url
          nil.primary = idfn
          this.spread.cj = nil
        }

        // let tmv = Array.isArray(spread.v) ? spread.v : [spread.v]
        // this.spread.cj = new ConjunctVal({ peg: tmv }, ctx)
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

    // A sizing residual (`length`, `unique`) sorts AFTER containers in a
    // conjunct so that it counts the MERGED list rather than the first
    // fragment (SIZING_CJO in ConstraintVal.ts). That makes the list the
    // accumulator and the constraint its peer, the reverse of the usual
    // order — and the reading belongs to the constraint either way, so
    // hand it straight back.
    if (true === (peer as any).isConstraint) {
      return peer.unify(this, ctx)
    }

    // A DISJUNCT ALTERNATIVE MATCHES ITS OWN LENGTH (BUGS.md §52
    // regime 4, the X-C3 adjudication): in a trial, a literal list
    // with no spread admits only a peer list of the same length -- a
    // spread makes it variadic. Outside trials the ordinary
    // elementwise merge stands (two statements of one list are one
    // list), so `[] | [&: T]` stops admitting every list through the
    // empty arm while `a: [] a: [1]` still merges.
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
          null == peer.spread.cj ? out.spread.cj : (
            out.spread.cj =
            unite(te ? ctx.clone({ explain: ec(te, 'SPR') }) : ctx,
              out.spread.cj, peer.spread.cj, 'list-peer')
          )
        )
      }
    }


    if (!exit) {
      out.dc = this.dc + 1

      let spread_cj = out.spread.cj || TOP

      // The template REFUSED at construction (clearing rule 3, G4
      // phase 1): the bag itself is that refusal. Returning the nil
      // here rather than only letting it reach the children is what
      // makes an EMPTY bag with a bad template an error too — there
      // are no children to carry it.
      //
      // Narrow to THIS code on purpose. A nil spread from any other
      // cause keeps its existing behaviour of driving every key
      // (coverage3 `nil-spread-drives-every-key`): a template that has
      // merely not resolved yet must not permanently kill the bag that
      // holds it.
      if ('id_spread' === (spread_cj as any).why) {
        return spread_cj
      }

      // Always unify children first
      for (let key in this.peg) {
        const keyctx = ctx.descend(key)
        const child = this.peg[key]

        propagateMarks(this, child)

        // APPLIED ONCE PER ELEMENT, the guard MapVal has carried since
        // the spread was written: an element that already holds this
        // template's contribution is progressed by self-unification
        // instead of having the template met into it a second time.
        // Re-applying is the identity for a template that has already
        // RESOLVED, which is why the missing guard went unnoticed here
        // — but a template that residuates (`&: id(key(1))`, G8 phase
        // 0) is not yet a value to be idempotent about, so each pass
        // conjoined another copy and the element's canon DOUBLED per
        // pass. The old `ctx.cc < 3` key delay hid it by ending the
        // growth at three passes; the staging rule waits for the model
        // to settle, and a model whose canon doubles every pass never
        // does.
        let oval: Val
        if (!spread_cj.isTop
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
                  // The no-op meet is SKIPPED on the normal path (it is the
                  // identity) but TAKEN while recording: a value written once
                  // and never met is still a contribution the author wants
                  // pointed at, and the Go port's unite sees that meet (G7
                  // phase 4). Instrumented runs pay knowingly.
                  key_spread_cj.isTop && child.done && undefined === keyctx.prov
                    ? child :
                    child.isTop && key_spread_cj.done ? key_spread_cj :
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

          if (this.closed && !allowedKeys.includes(peerkey)) {
            bad = makeNilErr(ctx, 'closed', peerchild, undefined)
          }

          let child = out.peg[peerkey]

          const peerctx = ctx.descend(peerkey)

          let oval = out.peg[peerkey] =
            undefined === child ? peerchild :
              child.isTop && peerchild.done ? peerchild :
                child.isNil ? child :
                  peerchild.isNil ? peerchild :
                    unite(te ? peerctx.clone({ explain: ec(te, 'CHD') }) : peerctx,
                      child, peerchild, 'list-peer')

          if (this.spread.cj) {
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
      else if (!peer.isTop) {
        out = makeNilErr(ctx, 'list', this, peer)
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


  // Spread clone: only deep-clone children that are path-dependent
  // (isFunc, isRef). Share all other children directly.
  // Spread clone: when all children are ScalarKindVal (simple type
  // constraints like `string`, `number`), share them directly to avoid
  // N x M allocations. ScalarKindVal is safe to share: it is immutable,
  // always done, never path-dependent, and never has marks mutated.
  // For anything more complex, fall back to full deep clone.
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
        (entry[1] as any)?.isVal ? (entry[1] as Val).clone(ctx, childspec) : entry[1]
    }
    if (this.spread.cj) {
      out.spread.cj = this.spread.cj.clone(ctx, childspec)
    }

    out.closed = this.closed
    out.optionalKeys = [...this.optionalKeys]

    // console.log('LISTVAL-CLONE', this.canon, '->', out.canon)
    return out
  }


  get canon() {
    // console.log('LISTVAL-CANON', this.optionalKeys)
    let keys = Object.keys(this.peg)
    return '' +
      // this.errcanon() +
      '[' +
      (this.spread.cj ? '&:' + this.spread.cj.canon +
        (0 < keys.length ? ',' : '') : '') +
      // No optional-element rendering. A list HAS no optional elements to
      // render: a key:value pair in list position contributes no element
      // at all, in either spelling and whatever its key (issue #40), so
      // nothing a source can write reaches this method with an optional
      // key. The Go port's ListVal.Canon has no such arm either, and the
      // two canons must agree -- a canon is round-trippable, and a marker
      // on an element the grammar cannot produce would not reparse.
      // canonRiders, not .canon: a deprecated element renders
      // back as its `deprecate(x, m)` call, reparseably (G3).
      keys.map(k => canonRiders(this.peg[k])).join(',') +
      ']'
  }
} /* node:coverage ignore next 8 */




export {
  ListVal,
}

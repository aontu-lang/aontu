/* Copyright (c) 2021-2025 Richard Rodger, MIT License */



import {
  walk,
  explainOpen,
  ec,
  explainClose,
} from '../utility'


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import { AontuContext } from '../ctx'

import { makeNilErr } from '../err'
import { RecurseVal, containsRecurseOf } from './RecurseVal'
import { unite } from '../unify'


import {
  top
} from './top'


import { StringVal } from './StringVal'
import { IntegerVal } from './IntegerVal'
import { NumberVal } from './NumberVal'
import { ConjunctVal } from './ConjunctVal'
import { VarVal } from './VarVal'
import { FeatureVal } from './FeatureVal'
import { integerDigits } from './numkind'
import { BigIntegerVal } from './BigIntegerVal'
import { BigDecimalVal } from './BigDecimalVal'



// A path segment no spelling can produce, used when append meets a Val
// class it has no rule for. A key cannot contain a NUL, so this can never
// match, which turns a silent path-shortening bug into a visible miss.
const UNSPELLABLE_SEGMENT = '\u0000unspellable'


// Is this value an unresolved type()/hide() call — or a conjunct still
// carrying one? A reference that lands on one must defer rather than
// clone it (see the call site in `find`): the marks such a call will
// stamp belong to the field it was WRITTEN at, and a clone resolving
// at the reference's site re-applies them after the reference's
// mark-clearing walk has already run. Only the two mark wrappers
// qualify — every other pending call resolves to an unmarked value,
// and the existing early-clone behaviour for those is pinned
// (move()/copy() ghost rows, hole-filling conjuncts).
function pendingMarkWrapper(v: any): boolean {
  if (true === v.isTypeFunc || true === v.isHideFunc) {
    return !v.done
  }
  if (true === v.isConjunct && Array.isArray(v.peg)) {
    for (const t of v.peg) {
      if (pendingMarkWrapper(t)) {
        return true
      }
    }
  }
  return false
}


class RefVal extends FeatureVal {
  isRef = true
  isGenable = true
  cjo = 32500

  absolute: boolean = false
  prefix: boolean = false

  constructor(
    spec: {
      peg: any[],
      absolute?: boolean,
      prefix?: boolean
    },
    ctx?: AontuContext
  ) {
    super(spec, ctx)
    this.peg = []

    // The field initialiser (absolute = false) has just run, so only
    // the spec can carry absoluteness in (RefVal.clone re-passes it).
    this.absolute = true === spec.absolute

    this.prefix = true === spec.prefix

    for (let pI = 0; pI < spec.peg.length; pI++) {
      this.append(spec.peg[pI])
    }

    //console.log('RefVal', this.id, this.peg)
  }


  append(part: any) {
    let partval

    // console.log('APPEND', part)

    if ('string' === typeof part) {
      partval = part
      this.peg.push(partval)
    }

    else if (part instanceof StringVal) {
      partval = part.peg
      this.peg.push(partval)
    }

    else if (part instanceof IntegerVal) {
      // partval = '' + part.peg
      partval = part.src
      this.peg.push(partval)
    }

    // TODO: this is a bit of a hack, review
    // Seems like a fundamental ambiguity?
    // Resolved by path function
    else if (part instanceof NumberVal) {
      // let partvals: string[] = part.peg.toFixed(11).replace(/(\.0)?0+$/, '$1').split('.')
      let partvals: string[] = part.src.split('.')
      this.peg.push(...partvals)
    }

    // THE EXACT LEAVES ARE PATH TEXT LIKE ANY OTHER SPELLING. `0d1` as a
    // segment addresses the key literally spelled `0d1` -- the same key
    // `a:{0d1:7}` creates -- and is NOT the number 1, so it neither
    // indexes a list nor reaches a key spelled `1`.
    //
    // Without these branches the part fell off the end of the chain and
    // was SILENTLY DROPPED, so `$.a.0d0` resolved to `$.a` and handed back
    // the CONTAINER. That is a wrong value, not a miss -- strictly worse
    // than an error -- and it made `$.a.0d0` and `$.a.0d1` denote the same
    // location.
    else if (part instanceof BigIntegerVal || part instanceof BigDecimalVal) {
      // A bigdecimal splits on its point exactly as a float does, so
      // `$.x.0d1.5` addresses two levels.
      this.peg.push(...part.src.split('.'))
    }

    else if (part instanceof VarVal) {
      partval = part
      this.peg.push(partval)
    }

    else if (part instanceof RefVal) {
      if (part.absolute) {
        this.absolute = true
      }

      if (this.prefix) {
        if (part.prefix) {
          this.peg.push('.')
        }
      }
      else {
        if (part.prefix) {
          if (0 === this.peg.length) {
            this.prefix = true
          }

          else if (0 < this.peg.length) {
            this.peg.push('.')
          }
        }
      }

      this.peg.push(...part.peg)
    }

    // A closed chain, deliberately. Every branch above ends in a push, so
    // an unhandled Val class used to fall through in SILENCE and shorten
    // the path by one segment -- which is how the two exact leaves, added
    // by the number tower, made references resolve to their own container.
    // A segment that cannot be spelled is pushed as one that cannot match,
    // so the reference misses loudly instead of succeeding wrongly.
    else {
      this.peg.push(UNSPELLABLE_SEGMENT)
    }
  }


  unify(peer: Val, ctx: AontuContext): Val {
    peer = peer ?? top()

    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Ref', this, peer)
    let out: Val = this

    if (this.id !== peer.id) {

      // TODO: not resolved when all Vals in path are done is an error
      // as path cannot be found
      // let resolved: Val | undefined = null == ctx ? this : ctx.find(this)
      let found: Val | undefined = this.find(ctx)

      // `?? this` makes resolved non-nullish, so an unresolved reference
      // takes the RefVal arm below rather than a separate null arm.
      const resolved = found ?? this

      if (resolved instanceof RefVal) {
        if (peer.isTop) {
          out = this
        }
        else if (peer.isNil) {
          out = makeNilErr(ctx, 'ref[' + this.peg + ']', this, peer)
        }

        // same path
        else if (this.canon === peer.canon) {
          out = this
        }

        else {
          // Ensure RefVal done is incremented
          this.dc = DONE === this.dc ? DONE : this.dc + 1
          out = new ConjunctVal({ peg: [this, peer] }, ctx)
        }
      }
      else {
        out = unite(te ? ctx.clone({ explain: ec(te, 'RES') }) : ctx, resolved, peer, 'ref')
      }

      out.dc = DONE === out.dc ? DONE : this.dc + 1
    }

    // console.log('REFVAL-UNIFY-OUT', ctx.cc, this.id, this.canon, this.done, 'P=', peer.id, peer.canon, peer.done, '->', out.id, out.canon, out.done)

    explainClose(te, out)
    return out
  }


  // `snap` is set by snapshotRefSpread (MapVal): a SPREAD snapshot
  // wants the target's pre-resolution STRUCTURE — key()/path() still
  // unresolved, to be re-resolved per destination — so the
  // pending-mark-wrapper defer below must not apply to it. Deferring
  // there made the snapshot wait until the target's own key() had
  // resolved at the target, and the literal leaked into every
  // destination (the exact failure the snapshot exists to prevent —
  // test/spec/spread-type.tsv, spread-type-key-ref).
  find(ctx: AontuContext, snap?: boolean) {
    let out: Val | undefined = undefined

    // Check if self.path starts with peg (cycle detection).
    // Element-by-element comparison avoids string join+startsWith allocations.
    let isprefixpath = this.peg.length <= this.path.length
    if (isprefixpath) {
      for (let i = 0; i < this.peg.length; i++) {
        if (this.peg[i] !== this.path[i]) {
          isprefixpath = false
          break
        }
      }
    }
    // Degenerate case: peg is all empty strings (e.g. path("")) and path is empty.
    if (!isprefixpath && this.peg.length > 0 && this.path.length === 0) {
      let allEmpty = true
      for (let i = 0; i < this.peg.length; i++) {
        if ('' !== this.peg[i]) { allEmpty = false; break }
      }
      isprefixpath = allEmpty
    }

    let refpath: string[] = []
    let pI = 0
    // let descent = ''

    if (isprefixpath) {
      // THE DETECTOR'S ANSWER IS A RESIDUAL (RECURSION.0.md): a
      // self-reference under a guarded shape is the fixpoint the
      // author wrote, so the prefix hit mints the recursive residual
      // instead of refusing -- except the degenerate all-empty
      // spelling (path("")), which names nothing and keeps its
      // path_cycle. Only all-string paths recurse; anything else
      // keeps the conservative refusal.
      let degenerate = 0 === this.path.length
      let target: string[] = []
      for (let i = 0; i < this.peg.length && !degenerate; i++) {
        if ('string' !== typeof this.peg[i] || '' === this.peg[i]) {
          degenerate = true
          break
        }
        target.push(this.peg[i] as string)
      }
      if (degenerate) {
        out = makeNilErr(ctx, 'path_cycle', this)
      }
      else {
        const rec: any = new RecurseVal({ target } as any, ctx)
        rec.site = this.site
        rec.path = [...this.path]
        out = rec
      }
    }
    else {

      let parts: string[] = []

      for (let pI = 0; pI < this.peg.length; pI++) {
        let part = this.peg[pI]
        // An unspellable segment MISSES BEFORE ANY LOOKUP. The marker
        // is NUL-prefixed because no spelling produces one, but a
        // document can still hold a key spelled with an escaped NUL
        // (`a:{" unspellable":7}`), and matching it would turn the
        // silent path-shortening this marker exists to prevent into a
        // different silent wrong value. The marker is a marker, never a
        // lookup key.
        if (UNSPELLABLE_SEGMENT === part) {
          return makeNilErr(ctx, 'no_path', this)
        }
        if (part instanceof VarVal) {
          // EVERY `$name` IN A PATH IS AN ORDINARY VARIABLE. `$KEY`,
          // `$SELF` and `$PARENT` used to be intercepted here by name;
          // they are gone (ADR-009). `key()` is the replacement for
          // `$KEY` and answers where a value LANDS rather than where it
          // was written, `$SELF.x` was only ever `$.x`, and `$PARENT.x`
          // was only ever `.x`.
          {
            part = (part as VarVal).unify(top(), ctx)
            if (part.isNil) {
              // TODO: var not found, so can't find path
              return
            }
            else {
              // The resolved variable IS a path segment: $seg.r with
              // seg="x" reads ...x.r (previously the coerced value was
              // dropped, silently reading the path without it).
              //
              // Integer kind renders its EXACT digits -- the FOURTH site
              // to get this wrong (see integerDigits and #21). `'' + peg`
              // on a JS number gives the shortest round-tripping form, so
              // a variable bound to 2^60 addressed the key
              // "1152921504606847000" and missed the real one. Go's
              // ref.go dispatches on kind here and was already correct.
              //
              // Every other kind is already right under `'' +`: a bigint
              // and a Decimal stringify to exact digits, and a float must
              // keep JS parity.
              parts.push(part.isInteger ?
                integerDigits(part.peg as number) : '' + part.peg)
            }
          }
        }
        else {
          parts.push(part)
        }
      }

      if (this.absolute) {
        refpath = parts
      }
      else {
        // A relative reference reads from the SIBLING scope: drop this
        // node's own key and append the written segments.
        refpath = this.path.slice(0, -1).concat(parts)
      }

      let sep = '.'
      refpath = refpath
        .reduce(((a: string[], p: string) =>
          (p === sep ? a.length = a.length - 1 : a.push(p), a)), [])

      let node = ctx.root as Val

      let nopath = false

      if (null != node) {
        for (; pI < refpath.length; pI++) {
          let part = refpath[pI]
          // console.log('PART', pI, part, node)

          // descent += (' | ' + pI + '=' + node.canon) // Util.inspect(node))

          if (node.isMap) {
            node = node.peg[part]
          }
          else if (node.isList) {
            node = node.peg[part]
          }
          // A PENDING MARK WRAPPER IS TRANSPARENT TO THE WALK: hide()
          // and type() only mark, and their argument is the structure
          // the path names. Without this, two sibling schemas in one
          // hide() bag deadlock -- the wrapper waits for its argument,
          // the argument's members wait for references that walk into
          // the unresolved wrapper (BUGS.md §53's family; the
          // recursive Policy/Step pair found it again). The found node
          // is cloned and mark-cleared exactly as any reference target
          // is, and the wrapper still marks its own field.
          else if (true === (node as any).isFunc
            && ((node as any).isHideFunc || (node as any).isTypeFunc)
            && (true === (node as any).peg?.[0]?.isMap
              || true === (node as any).peg?.[0]?.isList)) {
            node = (node as any).peg[0].peg[part]
          }
          else if (node.done) {
            nopath = true
            break;
          }
          else {
            break;
          }

          if (null == node) {
            nopath = true
            break
          }

        }
      }

      // THE ANCHORED-MEET FALLBACK (vet --at): an absolute reference
      // inside a lifted subtree names the SCHEMA's namespace, and the
      // meet's root does not contain it. The settled schema root the
      // lifter kept (AontuContext._fixroot; see RecurseVal.body) is
      // the tree such a reference means. Without this, a recursion
      // re-entering through a list spread died as no_path at the
      // first element under vet --at, while the map-tail form (whose
      // residual was minted during schema settling) worked; the Go
      // port answers the anchored meet from settled structures and
      // never sees the gap.
      const fixroot: any = (ctx as any)._fixroot
      if (this.absolute && null != fixroot
        && (nopath || pI !== refpath.length)) {
        nopath = false
        pI = 0
        let fnode: any = fixroot
        for (; pI < refpath.length; pI++) {
          const part = refpath[pI]
          if (true === fnode.isMap || true === fnode.isList) {
            fnode = fnode.peg[part]
          }
          else {
            break
          }
          if (null == fnode) {
            break
          }
        }
        if (null != fnode && pI === refpath.length) {
          node = fnode
        }
        else {
          nopath = true
        }
      }

      if (nopath) {
        out = makeNilErr(ctx, 'no_path', this)
      }
      else if (pI === refpath.length) {
        out = node

        // A reference landing on another reference -- or on a FUNCTION,
        // whose arguments the chase now follows (issue #35) -- may be a
        // PROVEN mutual cycle (a: $.b, b: $.a; a: $.b, b: upper($.a)).
        // Follow the chain and, if it returns to a node still open above
        // it, report path_cycle now instead of deferring every pass and
        // dying later as a spent budget. No proof (the chain leaves plain
        // refs and calls, or ends) defers as before.
        if (null != out && ((out as any).isRef || (out as any).isFunc) &&
          this.detectRefCycle(ctx)) {
          out = makeNilErr(ctx, 'path_cycle', this)
        }
        // A PENDING MARK WRAPPER IS NOT YET A VALUE TO COPY (ADR-005).
        // A type()/hide() call still waiting for its argument — an
        // alias reference inside a type() body, a generator inside a
        // hide() — would be cloned here as the CALL, and the clone
        // then resolves at the REFERENCE's site, stamping marks that
        // the mark-clearing walk below has already run too early to
        // clear. That is how a type-marked alias silently suppressed
        // the referring field's emission (use-cases/BUGS.md §12), how
        // `hide(pack(...))` leaked its mark onto downstream packs
        // (§11), and how hide() around a computed field swallowed the
        // value into a silent [] (§35b). Defer instead: the reference
        // residuates until the wrapper has resolved at its OWN field,
        // and the ordinary marked-value path below then clears the
        // marks on the clone as documented. The move() reference
        // (`_hide_found`) is exempt: a move TRANSPLANTS the pending
        // call, and the ghost rows (test/spec/func.tsv) pin that its
        // innards resolve at the destination.
        else if (null != out && !snap && !this.mark._hide_found &&
          pendingMarkWrapper(out)) {
          out = undefined
        }
        // A STAGED ARGUMENT SNAPSHOTS A SETTLED SOURCE (the argsnap
        // flag, set by driveStagedArgs). A generator's data argument is
        // a copy OUTSIDE the tree, so anything in the target that still
        // resolves against its own tree location — a spread-injected
        // relative reference, a pending template — must finish there
        // BEFORE the copy is taken: cloned earlier, the copy's rebased
        // relative refs dangle under the generator and the model dies
        // as *_no_gen with the generator never firing. Deferring here
        // is exactly the documented staging rule: the generator waits
        // for the source, then snapshots it whole.
        else if (null != out && !snap && true === (ctx as any).argsnap &&
          !out.done) {
          out = undefined
        }
        // A REFERENCE TO A RECURSIVE DEFINITION IS THE FIXPOINT
        // REFERENCE (RECURSION.0.md): resolving it to a clone
        // unrolled the schema one level, and every reparse of a
        // canon then unrolled one more -- canon never converged. The
        // residual is the resolved form, exactly as at the prefix
        // positions inside the definition.
        else if (null != out && !snap && containsRecurseOf(out, this.peg as any)) {
          const rec: any = new RecurseVal({ target: [...this.peg] } as any, ctx)
          rec.site = this.site
          rec.path = [...this.path]
          out = rec
        }
        // Types and hidden values are cloned and made concrete
        else if (null != out) { //  && (out.mark.type || out.mark.hide)) {

          // console.log('FOUND-A', out)

          if (this.mark.type || this.mark.hide) {
            out.mark.type = this.mark.type
            out.mark.hide = this.mark.hide

            // walk(out, (_key: string | number | undefined, val: Val) => {
            //   val.mark.type = this.mark.type
            //   val.mark.hide = this.mark.hide
            //   return val
            // })
          }

          if (this.mark._hide_found) {
            out.mark.hide = true
          }

          // console.log('FOUND-B', out)

          out = out.clone(ctx)

          // if (this.mark.type || this.mark.hide) {
          walk(out, (_key: string | number | undefined, val: Val) => {
            val.mark.type = false
            val.mark.hide = false
            // REFERENCES DO NOT CARRY IDENTITY (G4 phase 1, clearing
            // rule 1). The clone is a copy of an entity, not the
            // entity: without this, `w:b:$.q.a & {y:2,z:3}` (row
            // `ref-and-merge`, test/spec/ref.tsv) would push `y:2`
            // back into `q.a` through the identity merge — pinned
            // behaviour, silently changed by a mark the author never
            // wrote at the reference site.
            //
            // The LINK is NOT cleared (G4 phase 3): an identity says
            // what a value IS, so a copy must not be that entity; a
            // link says what a value POINTS AT, and a copy of a link
            // points at the same thing.
            val.entity = undefined
            return val
          })
          //}

          // onsole.log('FOUND-C', out)
        }
      }
    }

    // console.log('REF-FIND', ctx.cc, this.id, selfpath, 'PEG=', pegpath, 'RP', pI, refpath.join('.'), descent, 'O=', out?.id, out?.canon, out?.done)

    return out
  }


  // Follow the chain of plain references from this node; true iff the
  // chain revisits a node -- a PROVEN reference cycle, distinct from a
  // merely unresolved reference. Detection is only on the resolution
  // chain revisiting a node, never on syntactic shape: a chain that
  // passes through a variable segment, a conjunct or any other non-ref
  // value yields no proof and the ref defers as before.
  //
  // A FUNCTION is followed, through its arguments (issue #35). A
  // function resolves only once every argument does, so a chain that
  // reaches `b:upper($.a)` and out through `$.a` has proved the same
  // dependency a bare `b:$.a` proves -- `a:$.b b:upper($.a)` is a cycle
  // whichever link wears the call. Without this the shape exhausted the
  // depth budget instead: a `unify_cycle`, which under the G5 taxonomy
  // means "retry with more may help", where a proven structural cycle is
  // FIX THE MODEL. A conjunct and a disjunct stay unfollowed for reasons
  // that are not the same: a disjunct member may simply not be taken, so
  // reaching one proves nothing; a conjunct would be sound to follow, and
  // is left out only because nothing needs it yet.
  //
  // The Go port reaches the same verdict on this shape by a DIFFERENT
  // arm, and that difference outlives this method: its clonePath re-paths
  // a resolved clone to the referring site, so the inner `$.a` lands at
  // path [a] and the plain isprefixpath test proves the cycle before any
  // chase is needed. TypeScript's clone keeps the source paths. ADR-001
  // asks for arm-for-arm correspondence, so the clone-path difference is
  // worth closing on its own; it is wider than this issue and both ports
  // now agree on the verdict and the code either way.
  detectRefCycle(ctx: AontuContext): boolean {
    // Depth-first with an explicit ANCESTOR set, because a function may
    // carry several reference arguments and the cycle can run through
    // any one of them. The set holds the chain currently being walked,
    // not every node ever walked: revisiting a node reached down a
    // DIFFERENT branch is an ordinary shared reference (two keys reading
    // one third key), and only revisiting one that is still open above
    // us is a cycle.
    //
    // Identity is the RESOLVED PATH, not the RefVal instance: the same
    // target can be reached through distinct ref instances, and it is
    // returning to the same place that closes a loop.
    const chase = (ref: RefVal, ancestors: Set<string>): boolean => {
      const rp = ref.plainRefPath()
      if (null == rp) {
        return false
      }
      const key = rp.join(' ')
      if (ancestors.has(key)) {
        return true
      }

      let node: any = ctx.root
      for (let i = 0; i < rp.length && null != node; i++) {
        node = (node.isMap || node.isList) ? node.peg[rp[i]] : undefined
      }
      if (null == node) {
        return false
      }

      // Terminates: each level adds a path to `ancestors` and refuses a
      // repeat, and the tree holds finitely many distinct paths.
      ancestors.add(key)
      let found = false
      if (node.isRef) {
        found = chase(node, ancestors)
      }
      else if (node.isFunc && Array.isArray(node.peg)) {
        for (const arg of node.peg) {
          if (null != arg && arg.isRef && chase(arg, ancestors)) {
            found = true
            break
          }
        }
      }
      ancestors.delete(key)

      return found
    }

    return chase(this, new Set<string>())
  }


  // The resolved absolute path of a reference whose segments are all
  // plain strings; undefined when the ref has variable segments (no
  // cycle proof is attempted for those). Mirrors find's refpath
  // computation for the plain case, including the `.` prefix reduction.
  plainRefPath(): string[] | undefined {
    const parts: string[] = []
    for (const p of this.peg) {
      if ('string' !== typeof p) {
        return undefined
      }
      parts.push(p)
    }
    const refpath = this.absolute ? parts :
      this.path.slice(0, -1).concat(parts)
    const reduced: string[] = []
    for (const p of refpath) {
      if ('.' === p) {
        // A parent step off the top of the path proves nothing.
        if (0 === reduced.length) {
          return undefined
        }
        reduced.length = reduced.length - 1
      }
      else {
        reduced.push(p)
      }
    }
    return reduced
  }


  same(peer: Val): boolean {
    return null == peer ? false : this.peg === peer.peg
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, {
      peg: this.peg,
      absolute: this.absolute,
      ...(spec || {})
    }) as RefVal)
    return out
  }


  get canon() {
    let str =
      (this.absolute ? '$' : '') +
      (0 < this.peg.length ? '.' : '') +
      // this.peg.join(this.sep)
      this.peg.map((p: any) => '.' === p ? '' :
        (p.isVal ? p.canon : '' + p))
        .join('.')
    return str
  }


  gen(ctx: AontuContext) {
    // Unresolved ref cannot be generated, so always an error.
    let nil = makeNilErr(
      ctx,
      'ref',
      this, // (formatPath(this.peg, this.absolute) as any),
      undefined,
    )

    // TODO: refactor to use Site pointer
    nil.path = this.path
    nil.site.url = this.site.url
    nil.site.row = this.site.row
    nil.site.col = this.site.col

    return undefined
  }


  inspection() {
    return [
      this.absolute ? 'absolute' : '',
      this.prefix ? 'prefix' : '',
    ].filter(p => '' != p).join(',')
  }

} /* node:coverage ignore next 6 */


export {
  pendingMarkWrapper,
  RefVal,
}

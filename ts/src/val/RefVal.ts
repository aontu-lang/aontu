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
import { RecurseVal, containsRecurseOf, declaration, throughRider } from './RecurseVal'
import { fixSeals, sealTree, unsealTree } from './SealVal'
import { rereadTerms, unite } from '../unify'


import {
  top
} from './top'


import { StringVal } from './StringVal'
import { IntegerVal } from './IntegerVal'
import { NumberVal } from './NumberVal'
import { ConjunctVal } from './ConjunctVal'
import { trialUnify } from './FuncBaseVal'
import { VarVal } from './VarVal'
import { FeatureVal } from './FeatureVal'
import { repathInstance } from './Val'
import { walkVals } from '../walk'
import { integerDigits } from './numkind'
import { BigIntegerVal } from './BigIntegerVal'
import { BigDecimalVal } from './BigDecimalVal'


// A path segment no spelling can produce, used when append meets a Val
// class it has no rule for. A key cannot contain a NUL, so this can never
// match, which turns a silent path-shortening bug into a visible miss.
const UNSPELLABLE_SEGMENT = '\u0000unspellable'


// A copy takes `x` from a pending NESTED `hide(x)`/`type(x)`; a root
// wrapper is left for the caller, which defers on it. So is an `each`'s
// template, whose mark leaves every instance out of the list it makes.
function rereadKids(v: any, made?: boolean): any {
  const args = (true === made || true === v.folds) && (true === v.isFunc || true === v.isOp) &&
    Array.isArray(v.peg)
  return true === v.isMap || true === v.isList || args || true === v.isConjunct ||
    true === v.isDisjunct ? v.peg : true === v.isPref ? v : undefined
}


function holdsReread(v: any): boolean {
  const kids = rereadKids(v)
  return undefined !== v.reread || (true === v.isPref ? holdsReread(v.peg) :
    Object.keys(kids ?? {}).some((k: string) => holdsReread(kids[k])))
}


// A copy reads each relative path again where it stands (ruling 26), a call's arguments
// only in a call made again (`made`): a staged call's copy keeps its own.
function rereadAt(ctx: AontuContext, v: any, path: string[], made?: boolean): Val {
  const terms: Val[] | undefined = v.reread
  if (undefined !== terms) {
    const again = terms.map((t: Val) => {
      const c: any = t.clone(ctx, { path, dup: true })
      repathInstance(c, path)
      c.reread = undefined
      c.again = true === c.isRef
      return rereadAt(ctx, c, path, true)
    })
    const out: any = 1 === again.length ? again[0] :
      new ConjunctVal({ peg: again, path } as any, ctx)
    out.dc = 0
    return out
  }
  const kids = rereadKids(v, made)
  for (const k of true === v.isPref ? ['peg'] : Object.keys(kids ?? {})) {
    // A list's position is a number in a path, as the parser records it.
    const at = true === v.isMap ? [...path, k] : true === v.isList ? [...path, +k as any] : path
    const kid = rereadAt(ctx, kids[k], at, made)
    if (kid !== kids[k]) {
      kids[k] = kid
      v.dc = 0
    }
    else if (true !== kid.done && true === v.done) {
      v.dc = 0
    }
  }
  return v
}


function dropPendingMarkWrappers(v: Val): Val {
  return walk(v, (key: string | number | undefined, val: any, parent: any) =>
    undefined !== key && !(true === parent?.isEachFunc && 1 === Number(key)) &&
      (true === val.isTypeFunc || true === val.isHideFunc) && !val.done &&
      null != val.peg?.[0] ? val.peg[0] : val)
}


// The walk stops at a preference, whose value is a Val, so a pass over a
// copy steps into it here.
function walkPrefs(v: Val, fn: (key: string | number | undefined, val: any) => Val): Val {
  return walk(v, (key: string | number | undefined, val: any) => {
    const out: any = fn(key, val)
    if (true === out?.isPref && true === out.peg?.isVal) {
      out.peg = walkPrefs(out.peg, fn)
    }
    return out
  })
}


// A list holds no position for an element its own mark leaves out, so a
// copy drops the element where clearing the mark would show it.
function dropMarkedElements(v: Val): Val {
  return walkPrefs(v, (_key: string | number | undefined, val: any) => {
    if (true === val.isList && Array.isArray(val.peg)) {
      val.peg = val.peg.filter((e: any) => !markedElement(val, e))
    }
    return val
  })
}


function markedElement(list: any, e: any): boolean {
  if (true === e?.isTypeFunc || true === e?.isHideFunc) {
    return !e.done
  }
  return (true === e?.mark?.hide && true !== list.mark.hide) ||
    (true === e?.mark?.type && true !== list.mark.type)
}


// A staged call's copy shares its arguments with the call it copies, and
// a preference its value, so each takes its own before the copy changes.
function ownArgs(ctx: AontuContext, v: Val): Val {
  return walk(v, (_key: string | number | undefined, val: any) => {
    if (true === val.isPref && true === val.peg?.isVal) {
      const pref: any = val.clone(ctx, { path: [...val.path] })
      pref.peg = ownArgs(ctx, val.peg.clone(ctx, { path: [...val.peg.path] }))
      return pref
    }
    if (true !== val.isFunc || !Array.isArray(val.peg)) {
      return val
    }
    const out: any = val.clone(ctx, { path: [...val.path] })
    // A fold's argument reads where the fold stands (ruling 26).
    out.peg = val.peg.map((a: Val) =>
      a.clone(ctx, { path: [...(true === val.folds ? val.path : a.path)] }))
    return out
  })
}


// A seal's value is its argument, as a rider's is: a path reads a member through one that waits.
function throughWrap(v: any): any {
  v = throughRider(v)
  while (true === v?.isFunc && (true === v.isCloseFunc || true === v.isOpenFunc) && !v.done &&
    null != v.peg?.[0]) {
    v = throughRider(v.peg[0])
  }
  return v
}


const waitingWrap = (t: any): boolean => t !== throughWrap(t)
const readsAsBag = (t: any): boolean => true === throughWrap(t)?.isMap || true === throughWrap(t)?.isList


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


// The child a term of the walk can supply for one path segment, or
// undefined when it has none. A map or a list answers from its own
// members; a PENDING type()/hide() answers from its argument's, because
// the wrapper only marks and its argument is the structure the path
// names (see the call sites in `find`).
function markedChild(v: any, part: any): Val | undefined {
  v = throughWrap(v)
  if (true === v?.isMap || true === v?.isList) {
    return member(v, part)
  }
  if (true === v?.isFunc
    && (true === v.isHideFunc || true === v.isTypeFunc)
    && (true === v.peg?.[0]?.isMap || true === v.peg?.[0]?.isList)) {
    return member(v.peg[0], part)
  }
  return undefined
}


// A held arm (Decls.armChosen) and its peer answer for the arm's members.
function heldAt(ctx: AontuContext, refpath: string[], pI: number):
  [Val, Val | undefined, boolean] | undefined {
  const held = ctx._armAt?.get(refpath.slice(0, pI).join('\u0000'))
  return undefined === held || undefined === markedChild(held[0], refpath[pI]) ? undefined : held
}


// A held arm answers from its own level, however the levels above it stand.
function heldFrom(ctx: AontuContext, refpath: string[], pI: number): number {
  for (let hI = refpath.length - 1; undefined !== ctx._armAt && pI < hI; hI--) {
    if (undefined !== heldAt(ctx, refpath, hI)) {
      return hI
    }
  }
  return pI
}


// Met with its peer's; one a later meet could still narrow waits (null).
function heldMet(ctx: AontuContext, mine: Val, peer: Val | undefined, own: boolean,
  parts: string[]): Val | null {
  let theirs: any = peer
  for (const part of parts) {
    theirs = undefined === theirs ? undefined : markedChild(theirs, part)
  }
  const met = undefined === theirs || true === (mine as any).isScalar || !mine.done ? mine :
    trialUnify(ctx, mine.clone(ctx), theirs.clone(ctx)) ?? mine
  return own || true === (met as any).isScalar || true === ctx.settle ? met : null
}


const CANONICAL_LIST_INDEX = /^(0|[1-9][0-9]*)$/

function member(v: any, part: any): any {
  if (true === v.isList && !CANONICAL_LIST_INDEX.test(String(part))) {
    return undefined
  }
  return v.peg[part]
}


// A link's template reads the relative paths that stay inside it where it lands, at the link's
// target (ruling 50); one that climbs past the template reads where the link is written.
function landPaths(tmpl: Val, base: string[]): void {
  walkVals(tmpl, (t: any) => {
    if (true === t.isRef && !t.absolute) {
      let climbs = 0
      while ('.' === t.peg[climbs]) {
        climbs++
      }
      t.lands = t.lands || climbs < t.path.length - base.length
    }
    return true
  }, new Set())
}


// Whether a template waits for nothing but the paths it reads where it lands.
function landsOnly(tmpl: Val): boolean {
  let lands = false
  let other = false
  walkVals(tmpl, (t: any) => {
    lands = lands || (true === t.isRef && t.lands)
    other = other || (true === t.isRef && !t.lands) ||
      (true === t.isFunc && 0 === t.peg.length && !t.done)
    return !other
  }, new Set())
  return lands && !other
}


// The template as it lands: each such path read at the target.
function landedAt(ctx: AontuContext, tmpl: Val, to: string[]): Val {
  const out = tmpl.clone(ctx, { dup: true })
  if (landsOnly(tmpl)) {
    repathInstance(out, to)
  }
  walkVals(out, (t: any) => {
    t.lands = false
    return true
  }, new Set())
  return out
}


import { ALIAS_NAME_RE, aliasBareName } from '../aliasname'
import { unionVia } from '../rider'
import { undeclared } from './IdentFuncVal'


class RefVal extends FeatureVal {
  isRef = true
  isGenable = true
  cjo = 32500

  absolute: boolean = false

  // The value an alias reference canons as, attached by expandAliases
  // after unification (see `canon` below). Not a ValSpec field: it is
  // a rendering of the settled tree, never a parse-time property.
  expansion: Val | undefined = undefined

  rxc: number = 0

  // A relative path in a link's template, which reads where the template lands (ruling 50).
  lands: boolean = false
  prefix: boolean = false
  copyFound: boolean = false

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

  }


  append(part: any) {
    let partval


    if ('string' === typeof part) {
      partval = part
      this.peg.push(partval)
    }

    else if (part instanceof StringVal) {
      partval = part.peg
      this.peg.push(partval)
    }

    else if (part instanceof IntegerVal) {
      partval = part.src
      this.peg.push(partval)
    }

    else if (part instanceof NumberVal) {
      let partvals: string[] = part.src.split('.')
      this.peg.push(...partvals)
    }

    else if (part instanceof BigIntegerVal || part instanceof BigDecimalVal) {
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

    else if (true === part?.isScalarKind || true === part?.isContainerKind ||
      true === part?.isTop ||
      (true === part?.isConstraintKind && null == part.held)) {
      this.peg.push(part.canon)
    }

    else {
      this.peg.push(UNSPELLABLE_SEGMENT)
    }
  }


  unify(peer: Val, ctx: AontuContext): Val {
    peer = peer ?? top()

    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Ref', this, peer)
    let out: Val = this

    if (this.id !== peer.id) {

      let found: Val | undefined = this.lands ? undefined : this.find(ctx)

      // `?? this` makes resolved non-nullish, so an unresolved reference
      // takes the RefVal arm below rather than a separate null arm.
      const resolved = found ?? this

      // A path a copy reads again resolves here; any other reference found waits for its own place.
      if (resolved instanceof RefVal && (resolved === this || true !== (resolved as any).again)) {
        if (peer.isTop) {
          out = this
        }
        else if (peer.isNil) {
          out = makeNilErr(ctx, 'ref[' + this.peg + ']', this, peer)
        }

        // same path
        else if (this.spelling ===
          (true === (peer as any).isRef ? (peer as any).spelling : peer.canon)) {
          out = this
        }

        else {
          // Ensure RefVal done is incremented
          this.dc = DONE === this.dc ? DONE : this.dc + 1
          out = new ConjunctVal({ peg: [this, peer] }, ctx)
        }
      }
      else {
        // A NAME IS WHERE THE VALUE ENTERED THIS PATH; find() answers
        // a clone, so the use travels with it.
        const aname = this.aliasName
        if (undefined !== aname) {
          resolved.site.via = {
            row: this.site.row, col: this.site.col,
            url: this.site.url, src: this.site.src, name: aname,
          }
        }
        out = unite(te ? ctx.clone({ explain: ec(te, 'RES') }) : ctx, resolved, peer, 'ref')
        if (!this.absolute && !out.isNil) {
          const kept: any = peer.isTop || true === out.isConjunct ? out :
            out.clone(ctx, { path: out.path })
          kept.reread = [this, ...rereadTerms(peer)]
          out = kept
        }
      }

      out.dc = DONE === out.dc ? DONE : this.dc + 1
    }


    explainClose(te, out)
    return out
  }


  find(ctx: AontuContext, snap?: boolean) {
    let out: Val | undefined = undefined

    // Check if self.path starts with peg (cycle detection).
    // Element-by-element comparison avoids string join+startsWith allocations.
    // A path a held value answers reads that value, not the place around it.
    let isprefixpath = this.peg.length <= this.path.length &&
      !(this.absolute && 0 < heldFrom(ctx, this.peg as string[], 0))
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

    if (isprefixpath) {
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
        const rec: any = new RecurseVal({ target, xc: this.rxc } as any, ctx)
        rec.site = this.site
        rec.path = [...this.path]
        out = rec
      }
    }
    else {

      let parts: string[] = []

      for (let pI = 0; pI < this.peg.length; pI++) {
        let part = this.peg[pI]
        if (UNSPELLABLE_SEGMENT === part) {
          return makeNilErr(ctx, 'no_path', this)
        }
        if (part instanceof VarVal) {
          {
            part = (part as VarVal).unify(top(), ctx)
            if (part.isNil) {
              return
            }
            else if (true !== part.isScalar || true === part.isNull) {
              return makeNilErr(ctx, 'no_path', this)
            }
            else {
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

      // A PARENT STEP OFF THE TOP names nothing, and underflows.
      let offtop = false
      const reduced: string[] = []
      for (const part of refpath) {
        if ('.' === part) {
          if (0 === reduced.length) {
            offtop = true
            break
          }
          reduced.length = reduced.length - 1
          continue
        }
        reduced.push(part)
      }
      refpath = reduced

      let node: any = ctx.root

      let nopath = offtop
      let held = false
      let peer: [Val | undefined, boolean, number] = [undefined, false, 0]

      if (!offtop && null != node) {
        pI = heldFrom(ctx, refpath, pI)
        for (; pI < refpath.length; pI++) {
          let part = refpath[pI]

          const arm = heldAt(ctx, refpath, pI)
          if (undefined !== arm) {
            node = arm[0]
            held = true
            peer = [arm[1], arm[2], pI]
          }
          node = throughWrap(node)

          if (node.isMap) {
            node = node.peg[part]
          }
          else if (node.isList) {
            node = member(node, part)
          }
          else if (true === (node as any).isFunc
            && ((node as any).isHideFunc || (node as any).isTypeFunc)
            && (true === (node as any).peg?.[0]?.isMap
              || true === (node as any).peg?.[0]?.isList)) {
            node = member((node as any).peg[0], part)
          }

          else if (true === (node as any).isConjunct && undefined !== this.aliasKey
            && Array.isArray((node as any).peg) && !pendingMarkWrapper(node)) {
            const decl = declaration(node, part)
            if (undefined === decl) {
              break
            }
            node = decl
          }
          else if (true === (node as any).isConjunct
            && Array.isArray((node as any).peg)
            && pendingMarkWrapper(node)) {
            const kids: Val[] = []
            for (const term of (node as any).peg) {
              const kid = markedChild(term, part)
              if (undefined !== kid && null !== kid) {
                kids.push(kid)
              }
            }
            // No term has it YET. Not a miss: the conjunct is still
            // folding, and the member may arrive with the fold.
            if (0 === kids.length) {
              break
            }
            node = 1 === kids.length ?
              kids[0] : new ConjunctVal({ peg: kids }, ctx)
          }
          // A meet can't fold while its rider or seal waits on this very member: each term answers.
          else if (true === (node as any).isConjunct && Array.isArray((node as any).peg) &&
            (node as any).peg.some(waitingWrap)) {
            const kids: Val[] = (node as any).peg.map((t: Val) => markedChild(t, part))
              .filter((k: Val | undefined) => null != k)
            if (0 === kids.length || !(node as any).peg.every(readsAsBag)) {
              break
            }
            node = 1 === kids.length ? kids[0] : new ConjunctVal({ peg: kids }, ctx)
          }
          // A choice inside a held arm is read before the arm: wait for it.
          else if (node.done && !(held && (true === (node as any).isDisjunct ||
            true === (node as any).isPref))) {
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
        if (held && !nopath && pI === refpath.length) {
          node = heldMet(ctx, node, peer[0], peer[1], refpath.slice(peer[2]))
        }
      }

      const fixroot: any = (ctx as any)._fixroot
      if (this.absolute && !offtop && null != fixroot
        && (nopath || pI !== refpath.length)) {
        nopath = false
        pI = 0
        let fnode: any = fixroot
        for (; pI < refpath.length; pI++) {
          const part = refpath[pI]
          fnode = throughRider(fnode)
          if (true === fnode.isMap || true === fnode.isList) {
            fnode = member(fnode, part)
          }
          else if (true === fnode.isConjunct && undefined !== this.aliasKey) {
            fnode = declaration(fnode, part)
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

        if (undefined !== ctx.reads && null != node) {
          // The root's own address is `$`, as the coverage walk spells
          // it: a dot with nothing after it would match no path there.
          // An alias is addressed by the NAME its source spells.
          const aname = this.aliasName
          const addr = undefined === aname ?
            '$' + refpath.map((seg: string) => '.' + seg).join('') :
            '$.' + aname
          // AN ALIAS IS NOT A PATH. `%wire` names a value the document
          // holds unevaluated and the tree never carries, so it is an
          // address a rule can be reported AT and never a path coverage
          // could call dead: it is stamped, and it is not in the set
          // the model is measured against.
          if (!refpath[0]?.startsWith('%')) {
            ctx.reads.add(addr)
          }
          if (null == (node as any).origin) {
            ; (node as any).origin = addr
          }
        }

        if (null != out && ((out as any).isRef || (out as any).isFunc) &&
          this.detectRefCycle(ctx)) {
          out = makeNilErr(ctx, 'path_cycle', this)
        }
        else if (null != out && !snap && !this.mark._hide_found &&
          pendingMarkWrapper(out)) {
          out = undefined
        }
        else if (null != out && !snap && true === (ctx as any).argsnap &&
          !out.done) {
          out = undefined
        }
        else if (null != out && !snap && containsRecurseOf(out, this.peg as any, 0, ctx.root)) {
          const rec: any = new RecurseVal(
            { target: [...this.peg], xc: this.rxc } as any, ctx)
          rec.site = this.site
          rec.path = [...this.path]
          out = rec
        }
        // Types and hidden values are cloned and made concrete
        else if (null != out) { //  && (out.mark.type || out.mark.hide)) {


          if (this.mark.type || this.mark.hide) {
            out.mark.type = this.mark.type
            out.mark.hide = this.mark.hide

          }

          if (this.mark._hide_found) {
            out.mark.hide = true
          }


          const lifted = true !== (ctx as any).argsnap
            || true === out.mark.type || true === out.mark.hide
          const typed = true === out.mark.type

          const staged = out.holdsStaged
          // The copy stands at the reference's own place, on arguments of its own: the walk writes into each.
          const moved = ctx.path.length !== out.path.length && !out.path.includes('&')
          out = out.clone(ctx, moved ? { dup: !staged, path: [...ctx.path] } : { dup: !staged })
          if (moved) {
            out = staged ? ownArgs(ctx, out) : out
            repathInstance(out, out.path)
          }
          out = undeclared(out)
          // A path reads through a place that is itself a relative path; a name's use reads it again.
          if (undefined === this.aliasKey) {
            out.reread = undefined
          }
          // A staged call's argument is a value read, with no place of its own.
          if (true !== (ctx as any).argsnap && holdsReread(out)) {
            out = rereadAt(ctx, out, ctx.path)
          }
          fixSeals(out)

          if (lifted) {
            if (staged && !moved) {
              out = ownArgs(ctx, out)
            }
            out = dropMarkedElements(out)
            // The copy carries a held constraint without its type.
            out = walkPrefs(out, (_key: string | number | undefined, val: Val) => {
              val.mark.type = false
              val.mark.hide = false
              const held = (val as any).held
              return true === (val as any).isConstraintKind && null != held ?
                held : val
            })
            out = dropPendingMarkWrappers(out)
            if (typed && !this.copyFound) {
              sealTree(out, true)
            }
          }
          if (this.copyFound) {
            unsealTree(out)
          }
          // An alias's copy remembers it; copy() unseals, so may admit more.
          else if (undefined !== this.aliasKey) {
            out.via = unionVia(out.via, [this.aliasKey])
          }

        }
      }
    }

    // console.log('REF-FIND', ctx.cc, this.id, selfpath, 'PEG=', pegpath, 'RP', pI, refpath.join('.'), descent, 'O=', out?.id, out?.canon, out?.done)

    return out
  }


  detectRefCycle(ctx: AontuContext): boolean {
    const chase = (ref: RefVal, ancestors: Set<string>): boolean => {
      const rp = ref.plainRefPath()
      if (null == rp) {
        return false
      }
      const key = rp.join('\u0000')
      if (ancestors.has(key)) {
        return true
      }

      let node: any = ctx.root
      for (let i = 0; i < rp.length && null != node; i++) {
        node = (node.isMap || node.isList) ? member(node, rp[i]) : undefined
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
  plainRefPath(at?: string[]): string[] | undefined {
    const parts: string[] = []
    for (const p of this.peg) {
      if ('string' !== typeof p) {
        return undefined
      }
      parts.push(p)
    }
    const refpath = this.absolute ? parts :
      (at ?? this.path).slice(0, -1).concat(parts)
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
    out.expansion = this.expansion
    // The recursion seed travels with the clone: a spread template is
    // cloned per destination, and each clone's residual must start
    // where the level it came from left off.
    out.rxc = this.rxc
    out.copyFound = this.copyFound
    out.lands = this.lands
    return out
  }


  // THE KEY THIS REFERENCE RESOLVES AGAINST, or undefined for a path
  // reference. `%u` is spelled internally as the root reference `$.%u`
  // (ALIASES.0.md), so an alias reference is an absolute reference of
  // one segment that is a name -- carrying the url of the file the
  // reference was WRITTEN in (ALIAS-FILE-SCOPE.0.md).
  get aliasKey(): string | undefined {
    return this.absolute && 1 === this.peg.length &&
      'string' === typeof this.peg[0] &&
      ALIAS_NAME_RE.test(aliasBareName(this.peg[0])) ?
      this.peg[0] : undefined
  }


  // What the source spells: the key without its scope.
  get aliasName(): string | undefined {
    const key = this.aliasKey
    return undefined === key ? undefined : aliasBareName(key)
  }


  // THE REFERENCE'S OWN SPELLING: the alias name, or the path. This is
  // the reference's identity (the snapshot key of a ref spread, the
  // same-path test in unify), which `canon` below is not once an
  // expansion is attached.
  get spelling(): string {
    const name = this.aliasName
    if (undefined !== name) {
      return name
    }
    return (this.absolute ? '$' : '') +
      (0 < this.peg.length ? '.' : '') +
      this.peg.map((p: any) => '.' === p ? '' :
        (p.isVal ? p.canon : '' + p))
        .join('.')
  }


  get canon() {
    if (undefined !== this.expansion) {
      return this.expansion.canon
    }
    return this.spelling
  }


  gen(ctx: AontuContext) {
    // Unresolved ref cannot be generated, so always an error.
    let nil = makeNilErr(
      ctx,
      'ref',
      this, // (formatPath(this.peg, this.absolute) as any),
      undefined,
    )

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

} /* node:coverage ignore next 11 */


export {
  dropPendingMarkWrappers,
  landPaths,
  landedAt,
  landsOnly,
  member,
  pendingMarkWrapper,
  RefVal,
}

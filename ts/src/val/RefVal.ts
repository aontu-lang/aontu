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
  if (true === v?.isMap || true === v?.isList) {
    return v.peg[part]
  }
  if (true === v?.isFunc
    && (true === v.isHideFunc || true === v.isTypeFunc)
    && (true === v.peg?.[0]?.isMap || true === v.peg?.[0]?.isList)) {
    return v.peg[0].peg[part]
  }
  return undefined
}


import { ALIAS_NAME_RE } from '../aliasname'


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

    else {
      this.peg.push(UNSPELLABLE_SEGMENT)
    }
  }


  unify(peer: Val, ctx: AontuContext): Val {
    peer = peer ?? top()

    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Ref', this, peer)
    let out: Val = this

    if (this.id !== peer.id) {

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
        out = unite(te ? ctx.clone({ explain: ec(te, 'RES') }) : ctx, resolved, peer, 'ref')
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

      let node = ctx.root as Val

      let nopath = offtop

      if (!offtop && null != node) {
        for (; pI < refpath.length; pI++) {
          let part = refpath[pI]


          if (node.isMap) {
            node = node.peg[part]
          }
          else if (node.isList) {
            node = node.peg[part]
          }
          else if (true === (node as any).isFunc
            && ((node as any).isHideFunc || (node as any).isTypeFunc)
            && (true === (node as any).peg?.[0]?.isMap
              || true === (node as any).peg?.[0]?.isList)) {
            node = (node as any).peg[0].peg[part]
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

      const fixroot: any = (ctx as any)._fixroot
      if (this.absolute && !offtop && null != fixroot
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

        if (undefined !== ctx.reads && null != node) {
          // The root's own address is `$`, as the coverage walk spells
          // it: a dot with nothing after it would match no path there.
          const addr = '$' + refpath.map((seg: string) => '.' + seg).join('')
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
        else if (null != out && !snap && containsRecurseOf(out, this.peg as any)) {
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

          out = out.clone(ctx, { dup: !out.holdsStaged })

          if (lifted) {
            walk(out, (_key: string | number | undefined, val: Val) => {
              val.mark.type = false
              val.mark.hide = false
              return val
            })
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
    out.expansion = this.expansion
    // The recursion seed travels with the clone: a spread template is
    // cloned per destination, and each clone's residual must start
    // where the level it came from left off.
    out.rxc = this.rxc
    return out
  }


  // THE NAME OF THE ALIAS THIS REFERENCE NAMES, or undefined for a
  // path reference. `%u` is spelled internally as the root reference
  // `$.%u` (docs/design/ALIASES.0.md: the name is a path into the
  // declaration), so an alias reference is an absolute reference of
  // one segment that is an alias name.
  get aliasName(): string | undefined {
    return this.absolute && 1 === this.peg.length &&
      'string' === typeof this.peg[0] && ALIAS_NAME_RE.test(this.peg[0]) ?
      this.peg[0] : undefined
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

} /* node:coverage ignore next 6 */


export {
  pendingMarkWrapper,
  RefVal,
}

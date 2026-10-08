/* Copyright (c) 2022-2025 Richard Rodger, MIT License */

import { inspect } from 'node:util'

import type { AontuContext } from '../ctx'

import {
  Site
} from '../site'

import { INNER_OF, WRITTEN } from '../provenance'


// THE DISPATCH RECORD (RENDER.0.md D11, P7): the address of the node
// a rule matched, and the address of the rule that matched it -- the
// table's own address and the rule's index in it, joined by `#`,
// which no path holds.
type EmitOrigin = {
  node: string,
  rule: string,
}


type ValMark = {
  type: boolean,
  hide: boolean,

  // Custom marks must have _ prefix.
  [name: `_${string}`]: boolean,
}

type ValSpec = {
  peg?: any,
  mark?: Partial<ValMark>,
  kind?: any,

  dup?: boolean,


  row?: number,
  col?: number,
  url?: string,

  path?: string[],
  id?: number,
  src?: string,

  // NilVal specific
  why?: string,
  msg?: string,
  err?: any[] | any,

  // RefVal specific
  absolute?: boolean,
  prefix?: boolean,
}


const DONE = -1

const SPREAD = Symbol('spread')

// Shared frozen empty array for lazy err initialization.
// Most Vals never accumulate errors, so this avoids one allocation per Val.
// Frozen to catch accidental mutation (e.g. push) - callers that need a
// mutable error array must create their own.
const EMPTY_ERR: any[] = Object.freeze([]) as unknown as any[]


let ID = 1000


abstract class Val {
  // Type-discriminator flags: defaults live on Val.prototype (see
  // bottom of this file). Each subclass overrides only its own
  // discriminator(s), so a plain Val instance writes zero flags.
  declare isVal: boolean

  declare isTop: boolean
  declare isAbsent: boolean
  declare isNil: boolean
  declare isNull: boolean
  declare isMap: boolean
  declare isList: boolean
  declare isScalar: boolean
  declare isScalarKind: boolean
  declare isRef: boolean
  declare isPref: boolean
  declare isVar: boolean
  declare isBag: boolean
  declare isNumber: boolean
  declare isInteger: boolean
  declare isString: boolean
  declare isBoolean: boolean
  declare isConjunct: boolean
  declare isDisjunct: boolean
  declare isExpect: boolean
  declare isJunction: boolean

  // Conjunct sort order. Lower values sort first in norm().
  declare cjo: number

  declare isOp: boolean
  declare isPlusOp: boolean

  declare isFunc: boolean
  declare isCloseFunc: boolean
  declare isCopyFunc: boolean
  declare isHideFunc: boolean
  declare isMoveFunc: boolean
  declare isKeyFunc: boolean
  declare isLowerFunc: boolean
  declare isOpenFunc: boolean
  declare isPathFunc: boolean
  declare isPrefFunc: boolean
  declare isSuperFunc: boolean
  declare isTypeFunc: boolean
  declare isUpperFunc: boolean

  declare isGenable: boolean

  id: number
  dc: number = 0
  path: string[] = []

  // Lazy site: allocated on first access via getter.
  // Saves one Site allocation per Val in hot paths where
  // site is replaced before first access (e.g. MapVal/ListVal.unify).
  private _site?: Site

  get site(): Site {
    return this._site ??= new Site()
  }

  set site(s: Site) {
    this._site = s
  }

  // Map of boolean flags.
  mark: ValMark = {
    type: false,
    hide: false,
  }

  deprecation?: Record<string, string[]>

  meta?: Record<string, Val[]>

  // The aliases this value is a copy of, which the exporter writes as $ref.
  via?: string[]

  link?: string

  origin?: string

  emitted?: EmitOrigin

  // The GRAPH of an evaluated document (G4 phase 3): the edge set,
  // stamped on the result by Aontu.unify the way the include manifest
  // is. Absent on every Val that is not a unify result.
  graph?: any

  // Actual native value.
  peg: any = undefined

  // Lazy err: shared empty array avoids allocation per Val.
  // Most Vals never accumulate errors. Only NilVal and top-level
  // results assign a real error array.
  err: any[] = EMPTY_ERR
  explain: any[] | null = null

  // Lazy uh: only allocated on first push in MapVal/ListVal.unify.
  uh?: number[]

  deps?: any

  // TS-private (as _site above): the `#` form emits downlevel helper
  // functions whose branches no supported Node can execute.
  private _ctx: any

  constructor(spec: ValSpec, ctx?: AontuContext) {
    this._ctx = ctx

    this.peg = spec?.peg

    if (Array.isArray(this.peg)) {
      let spread = (this.peg as any)[SPREAD]
      this.peg = this.peg.filter(n => undefined !== n)
        ; (this.peg as any)[SPREAD] = spread
    }

    // spec.path takes precedence over ctx.path: lets callers (notably
    // Val.clone) specify the target path without paying for a full
    // ctx.clone just to carry it.
    this.path = spec?.path ?? ctx?.path ?? []

    this.id = ++ID

    this.mark.type = !!spec.mark?.type
    this.mark.hide = !!spec.mark?.hide

  }


  ctx() {
    return this._ctx
  }


  get done() {
    return this.dc === DONE
  }


  same(peer: Val): boolean {
    return null == peer ? false : this.id === peer.id
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let path = spec?.path
    if (null == path) {
      let cut = this.path.indexOf('&')
      cut = -1 < cut ? cut + 1 : ctx.path.length
      path = ctx.path.concat(this.path.slice(cut))
    }

    // Carry the target path via the spec instead of cloning ctx just
    // to hold it: the Val constructor now reads spec.path first. This
    // saves ~120k ctx.clone calls (two Object.create each) on a
    // foo-sdk-sized model.
    let fullspec = {
      peg: this.peg,
      mark: { type: this.mark.type, hide: this.mark.hide },
      ...(spec ?? {}),
      path,
    }

    let out = new (this as any)
      .constructor(fullspec, ctx)

    out.dc = this.done ? DONE : out.dc

    // this.site is a lazy getter that always yields a Site, and Site's
    // constructor coerces row/col to numbers and url to a string, so the
    // spec value is the only one that can be absent.
    out.site.row = spec?.row ?? this.site.row
    out.site.col = spec?.col ?? this.site.col
    out.site.url = spec?.url ?? this.site.url
    out.site.len = this.site.len
    out.site.src = this.site.src

    out.mark = Object.assign({}, this.mark, fullspec.mark ?? {})
    out.mark.type = this.mark.type && (fullspec.mark?.type ?? true)
    out.mark.hide = this.mark.hide && (fullspec.mark?.hide ?? true)

    // The LINK rider travels with the clone: the address a resolved
    // link POINTS AT is part of what the value is, and a copy of a
    // link is still a link.
    if (null != this.link) {
      out.link = this.link
    }
    if (null != this.deprecation) {
      out.deprecation = this.deprecation
    }
    if (null != this.meta) {
      out.meta = this.meta
    }
    if (null != this.via) {
      out.via = this.via
    }

    if (null != this.origin) {
      out.origin = this.origin
    }
    if (null != this.emitted) {
      out.emitted = this.emitted
    }

    if (null != (this as any)._spr) {
      ; (out as any)._spr = (this as any)._spr
    }
    if (null != (this as any)._sid) {
      ; (out as any)._sid = (this as any)._sid
    }

    if (true === (this as any)[WRITTEN]) {
      (out as any)[WRITTEN] = true
    }
    if (null != (this as any)[INNER_OF]) {
      (out as any)[INNER_OF] = (this as any)[INNER_OF]
    }

    return out
  }


  spreadClone(ctx: AontuContext): Val {
    const out = this.clone(ctx, { dup: true })
    repathInstance(out, out.path)
    return out
  }


  _isPathDependent?: boolean
  get isPathDependent(): boolean {
    if (this._isPathDependent !== undefined) return this._isPathDependent
    let dep =
      this.isRef || this.isKeyFunc || this.isPathFunc ||
      this.isMoveFunc || this.isSuperFunc
    if (!dep) {
      const peg = this.peg
      if (Array.isArray(peg)) {
        for (let i = 0; i < peg.length; i++) {
          const c = peg[i]
          if (c && c.isVal && c.isPathDependent) { dep = true; break }
        }
      }
      else if (peg != null && typeof peg === 'object') {
        for (const k in peg) {
          const c = (peg as any)[k]
          if (c && c.isVal && c.isPathDependent) { dep = true; break }
        }
      }
      if (!dep) {
        const spreadCj = (this as any).spread?.cj as Val | undefined
        if (spreadCj && spreadCj.isPathDependent) dep = true
      }
    }
    this._isPathDependent = dep
    return dep
  }


  get holdsStaged(): boolean {
    if (true === (this as any).staged) {
      return true
    }
    const peg: any = this.peg
    if (Array.isArray(peg)) {
      for (let i = 0; i < peg.length; i++) {
        if (true === peg[i]?.isVal && peg[i].holdsStaged) return true
      }
    }
    else if (null != peg && 'object' === typeof peg) {
      for (const k in peg) {
        if (true === peg[k]?.isVal && peg[k].holdsStaged) return true
      }
    }
    const spreadCj = (this as any).spread?.cj as Val | undefined
    return true === spreadCj?.isVal && (spreadCj as any).holdsStaged
  }


  place(v: Val) {
    v.site.row = this.site.row
    v.site.col = this.site.col
    v.site.url = this.site.url
    v.site.len = this.site.len
    v.site.src = this.site.src
    if (true === (this as any)[WRITTEN]) {
      (v as any)[WRITTEN] = true
    }
    if (null != (this as any)[INNER_OF]) {
      (v as any)[INNER_OF] = (this as any)[INNER_OF]
    }
    return v
  }

  unify(_peer: Val, _ctx: AontuContext): Val { return this }

  abstract get canon(): string


  errcanon(): string {
    return 0 === this.err.length ? '' : `<ERRS:${this.err.length}>`
  }


  gen(_ctx: AontuContext): any {
    return undefined
  }


  notdone() {
    this.dc = DONE === this.dc ? DONE : this.dc + 1
  }


  abstract superior(): Val


  [inspect.custom](d: number, _opts: any, _inspect: any) {
    return this.inspect(d)
  }

  inspect(d?: number): string {
    d = null == d ? -1 : d
    let s = ['<' + this.constructor.name.replace(/Val$/, '') + '/' + this.id]

    s.push('/@' + this.site?.row + ',' + this.site?.col)

    s.push('/' + this.path.join('.') + '/')

    s.push([
      DONE === this.dc ? 'D' : 'd' + this.dc,
      ...Object.entries(this.mark).filter(n => n[1]).map(n => n[0]).sort()
    ].filter(n => null != n).join(','))

    let insp = this.inspection(1 + d)
    if (null != insp && '' != insp) {
      s.push('/' + insp)
    }

    s.push('/')

    if (this.peg?.isVal) {
      s.push(this.peg.inspect(1 + d))
    }
    else if (null != this.peg && 'object' === typeof this.peg &&
      (Object.entries(this.peg)[0]?.[1] as any)?.isVal) {
      s.push(inspectpeg(this.peg, 1 + d))
    }
    else if ('function' === typeof this.peg) {
      s.push(this.peg.name)
    }
    else {
      s.push(this.peg?.toString?.() ?? '')
    }

    s.push('>')

    const out = s.join('')

    return out
  }


  inspection(_d?: number) {
    return ''
  }

}


Object.assign(Val.prototype, {
  isVal: true,

  isTop: false,
  isAbsent: false,
  isNil: false,
  isNull: false,
  isMap: false,
  isList: false,
  isScalar: false,
  isScalarKind: false,
  isRef: false,
  isPref: false,
  isVar: false,
  isBag: false,
  isNumber: false,
  isInteger: false,
  isString: false,
  isBoolean: false,
  isConjunct: false,
  isDisjunct: false,
  isExpect: false,
  isJunction: false,

  cjo: 99999,

  isOp: false,
  isPlusOp: false,

  isFunc: false,
  isCloseFunc: false,
  isCopyFunc: false,
  isHideFunc: false,
  isMoveFunc: false,
  isKeyFunc: false,
  isLowerFunc: false,
  isOpenFunc: false,
  isPathFunc: false,
  isPrefFunc: false,
  isSuperFunc: false,
  isTypeFunc: false,
  isUpperFunc: false,

  isGenable: false,
})


function repathInstance(v: any, path: string[]): void {
  if (true !== v?.isVal) {
    return
  }
  v.path = path

  const peg = v.peg

  if (true === v.isBag) {
    const spread = v.spread?.cj
    if (null != spread && true === spread.isVal) {
      repathInstance(spread, path)
      spread.path = [...path, '&']
    }
    if (true === v.isList) {
      for (let i = 0; i < peg.length; i++) {
        // Numeric, as the parser records list positions: a numeric
        // segment is what tells key() an element is not a keyed
        // position (KeyFuncVal.resolve, `positioned`).
        repathInstance(peg[i], [...path, i as unknown as string])
      }
    }
    else {
      for (const k of Object.keys(peg)) {
        repathInstance(peg[k], [...path, k])
      }
    }
  }
  else if (Array.isArray(peg)) {
    for (const t of peg) {
      repathInstance(t, path)
    }
  }
  else if (true === peg?.isVal) {
    repathInstance(peg, path)
  }
}


function inspectpeg(peg: any, d: number) {
  const indent = '  '.repeat(d)
  return pretty(Array.isArray(peg) ?
    ('[' + peg.map(n => '\n  ' + indent + (n.inspect?.(d) ?? n)).join(',') +
      '\n' + indent + ']') :
    ('{' +
      Object.entries(peg).map((n: any) =>
        '\n  ' + indent + n[0] + ': ' +
        n[1].inspect(d)
      ).join(',') +
      '\n' + indent + '}')
  )
}

function pretty(s: string) {
  return (
    (String(s))
      .replace(/\[Object: null prototype\]/g, '')
    // .replace(/([^\n]) +/g, '$1')
  )
}


function spreadId(cj: any): number {
  return cj._sid ?? (cj._sid = cj.id)
}

function empty(o: any) {
  return (
    (Array.isArray(o) && 0 === o.length)
    || (null != o && 'object' === typeof o && 0 === Object.keys(o).length)
    || false
  )
} /* node:coverage ignore next 18 */


export type {
  EmitOrigin,
  ValMark,
  ValSpec,
}


export {
  spreadId,
  Val,
  DONE,
  SPREAD,
  EMPTY_ERR,
  empty,
  repathInstance,
}

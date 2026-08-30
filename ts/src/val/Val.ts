/* Copyright (c) 2022-2025 Richard Rodger, MIT License */

import { inspect } from 'node:util'

import type { AontuContext } from '../ctx'

import {
  Site
} from '../site'

import { INNER_OF, WRITTEN } from '../provenance'


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

  // THE PER-DESTINATION INSTANTIATION FLAG (ADR-005). A generator's
  // template is cloned once per destination, and every clone must be
  // a full instance: nothing path-dependent may be shared between two
  // destinations, or the first destination's resolution answers for
  // them all. The default clone shares inner structure deliberately
  // (`peg: this.peg` below — the move()/copy() ghost rows in
  // test/spec/func.tsv pin that sharing), so instantiation asks for
  // depth explicitly: `dup: true` makes FuncBaseVal, PrefVal and
  // OpBaseVal clone their inner Vals too, and the bag/junction clones
  // carry the flag down. Set by pack/each template instantiation,
  // filter condition testing, and spread application (MapVal/
  // ListVal.spreadClone) — never by the residuation or ref-resolution
  // clones, whose sharing is pinned behaviour.
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


// Process-global, monotonic Val id source. Correctness only requires ids
// to be unique within a single unify run (fast-path identity checks,
// `same()`), which holds. It is NOT reset between generate() calls, so in
// a long-running host (e.g. the LSP) it grows for the process lifetime;
// that is acceptable — an id is a small number and is never used as a
// memory key. TODO: switch to the per-run ctx.vc counter (see ctx.ts).
let ID = 1000


// A fresh Val id, for the one carrier that cannot take the one its
// class fixes: TopVal pins `id = 0` (there is only one top), and the
// identity mark (G4 phase 1) resolves to a top that must NOT collide
// with it — the fast path in `unite` returns early on two done Vals
// with the same id, which would drop an identity before the rider
// could carry it.
export function nextValId(): number {
  return ID++
}


abstract class Val {
  // Type-discriminator flags: defaults live on Val.prototype (see
  // bottom of this file). Each subclass overrides only its own
  // discriminator(s), so a plain Val instance writes zero flags.
  declare isVal: boolean

  declare isTop: boolean
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

  // The deprecation record (G3 phase 4, `deprecate(x, m)`): boolean
  // marks cannot hold a message, a replacement path and a version, so
  // the Val carries one optional record. Keys are the three the
  // builtin defines (msg, use, since), all optional, values strings;
  // `use` is a path spelled as a STRING — a live reference would
  // resolve and unify, which is not wanted. Propagated through meets
  // by propagateMarks and carried by clone, exactly as the boolean
  // marks are.
  deprecation?: Record<string, string>

  // The IDENTITY (G4 phase 1, `id(name)`): the entity this value IS.
  // A separate slot for the same reason the deprecation record has
  // one — a boolean ValMark cannot hold a name — and carried through
  // meets by the same rider in `unite`. Unlike the marks, canon
  // RENDERS it: identity is semantic content, and G6's hash must see
  // it.
  entity?: string

  // The LINK (G4 phase 2/3): the entity address a `refer` resolved to,
  // stamped on the string it answers. The string IS the value — a
  // link, not an embedding — so nothing downstream could otherwise
  // tell a checked link from a literal that happens to look like one,
  // and the edge set (ts/src/graph.ts) is exactly the set of these.
  link?: string

  // The GRAPH of an evaluated document (G4 phase 3): the entity index
  // and the edge set, stamped on the result by Aontu.unify the way the
  // include manifest is. Absent on every Val that is not a unify
  // result.
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

  // TODO: Site needed in ctor
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

    // TODO: make this work
    // this.id = spec?.id ?? (ctx ? ++ctx.vc : ++ID)
    this.id = ++ID

    this.mark.type = !!spec.mark?.type
    this.mark.hide = !!spec.mark?.hide

    // console.log('BV', this.id, this.constructor.name, this.peg?.canon)
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
    // THE SPAN TRAVELS WITH THE POSITION. Copying row and col but not
    // the extent would leave a site that names a place and denies it has
    // any width — internally inconsistent, and it made the two ports
    // disagree on every derived value (the shared subsume rows caught
    // it). Safe because the span is VERIFIABLE: a consumer reads the
    // document at (row, col, len) and refuses when it does not match
    // `src`, so a span that has stopped describing its value is
    // detectable rather than believed. See ts/src/site.ts.
    //
    // Read from `this.site`, never from the spec: ValSpec.src is a
    // DIFFERENT field — ScalarVal's literal spelling, kept so `$.a.0x0`
    // addresses the key `0x0` — and reading it here would put a path
    // segment where a source span belongs.
    //
    // UNCONDITIONAL, as the Go twin is (clonePath, go/clone.go). A
    // guard dropping the span when the spec relocates the value was
    // written first and the coverage gate refused it as dead: nothing
    // clones to a new row or column. Should a relocating caller ever
    // appear it must drop both fields — an extent belongs to a place,
    // and the text at a new one is not this value's to claim.
    out.site.len = this.site.len
    out.site.src = this.site.src

    out.mark = Object.assign({}, this.mark, fullspec.mark ?? {})
    out.mark.type = this.mark.type && (fullspec.mark?.type ?? true)
    out.mark.hide = this.mark.hide && (fullspec.mark?.hide ?? true)

    // The two IDENTITY riders travel together, under one test: the
    // entity a value IS, and the address a resolved link POINTS AT.
    // One guard rather than two because the pair is what a clone
    // either carries or does not — and because a second test for the
    // link alone would be a branch no document takes, the reference
    // clone catching the pending residual before it ever resolves.
    if (null != this.entity || null != this.link) {
      out.entity = this.entity
      out.link = this.link
    }
    if (null != this.deprecation) {
      out.deprecation = this.deprecation
    }

    // THE APPLY-ONCE MARK TRAVELS WITH THE CLONE. `_spr` records which
    // spread template has already been merged into this value, and the
    // bag loops read it to keep a template from being applied twice
    // (MapVal.unify, ListVal.unify). A clone that dropped it looked
    // un-spread, so a REFERENCE resolving to a templated bag had the
    // template applied a second time -- over the value the first
    // application had already produced. With `n: key()` that meant
    // meeting the answered `"x"` as though it were a map and asking
    // `key()` again, which answered `"n"`: `$.a.b.f.x.n.n`, "n"
    // against "x" (use-cases/BUGS.md §50). The Go port carries it and
    // answered correctly; this is the canonical side catching up.
    if (null != (this as any)._spr) {
      ; (out as any)._spr = (this as any)._spr
    }
    if (null != (this as any)._sid) {
      ; (out as any)._sid = (this as any)._sid
    }

    // PROVENANCE TRAVELS WITH THE CLONE, exactly as the site does, and
    // for the same reason: a clone of a value the author wrote IS that
    // written value somewhere else, and it carries the author's site,
    // so it can be pointed at. Without this a default reaching a
    // `pack()`-generated child, or a shape carried by a `$ref`, was
    // invisible to `why` -- which answered "nothing met at this path"
    // over a value it had just printed (the review's finding E). See
    // WRITTEN in ts/src/provenance.ts; the mark is only ever set by an
    // instrumented run, so this is one undefined read otherwise.
    if (true === (this as any)[WRITTEN]) {
      (out as any)[WRITTEN] = true
    }
    // AND SO DOES BEING PART OF SOMETHING. A clone of a disjunction's
    // member is still that member of that written disjunction, and the
    // whole statement is what the author needs shown -- otherwise a
    // default reaching a generated child reports `*"info"` and
    // `string` as two contributions at two columns, where the author
    // wrote `*info | string` once. A number, deliberately: a Val
    // holding another Val as an own property is a cycle through the
    // tree. See INNER_OF in ts/src/provenance.ts.
    if (null != (this as any)[INNER_OF]) {
      (out as any)[INNER_OF] = (this as any)[INNER_OF]
    }

    return out
  }


  // Shallow clone for spread constraints: creates a new Val with the
  // correct path context but shares non-path-dependent children.
  // Override in MapVal/ListVal to avoid deep-cloning simple children.
  //
  // A FULL INSTANCE (`dup`, ADR-005): a spread constraint is applied
  // once per destination child, and each application must own its
  // path-dependent innards — a bare clone shared a call's arguments
  // and a preference's inner value across destinations, so a spread
  // like `&: id(key(0)) & $.schema.C` resolved its one shared key()
  // at the first child it met (use-cases/BUGS.md §12's id_name form).
  spreadClone(ctx: AontuContext): Val {
    const out = this.clone(ctx, { dup: true })
    repathInstance(out, out.path)
    return out
  }


  // True if this Val's unification result depends on its own `path`
  // — i.e. the tree contains a RefVal, KeyFuncVal, PathFuncVal,
  // MoveFuncVal, or SuperFuncVal. Used by MapVal/ListVal.spreadClone
  // to share the spread constraint across keys when it's safe.
  // Lazy + cached: the answer is a function of the Val's immutable
  // structure, so we compute once per Val.
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


  // PUT A MINTED VALUE WHERE THIS ONE STANDS: the site travels, and so
  // does provenance, because the two answer one question. A narrowed
  // disjunction, a lifted kind, a resolved reference -- each is a
  // value the engine built from a value the author wrote, standing
  // where that one stood. Carrying the site and withholding the mark
  // would let `why` print a value, know the line it came from, and
  // still answer "nothing met at this path" (the review's finding E).
  // See WRITTEN and INNER_OF in ts/src/provenance.ts.
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

  // CONTRACT: implementations should treat `this` and `peer` as
  // immutable and return a new Val. KNOWN EXCEPTION: the MapVal/ListVal
  // fast-path for a TOP peer returns and refines `this` in place (an
  // intentional optimization for the fixpoint loop). The practical
  // consequence is that a parsed/unified tree is SINGLE-USE — do not
  // re-unify or re-generate the same Val, and do not share it across
  // threads. The public Aontu.unify/generate entry points re-parse per
  // call, so this only matters if you hold and reuse a Val yourself.
  unify(_peer: Val, _ctx: AontuContext): Val { return this }

  // TODO: indicate marks in some way that is ignored by reparse.
  // Need an annotation/taggins syntax? a:{}/type ?
  // ABSTRACT: every concrete Val renders its own canonical form. There
  // used to be an empty-string default here, and the one class relying
  // on it (ExpectVal) was rendering a key with no value -- `{"r":}`,
  // text that is not a document (issue #43). With that fixed, nothing
  // reached the default, so it is declared rather than defaulted: a new
  // Val that forgets `canon` is now a compile error instead of silently
  // canoning as nothing.
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

    // let insp = this.inspection(inspect)
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


// Prototype-level defaults for Val's type-discriminator flags.
// Keeping these on the prototype (instead of per-instance class-field
// initializers) removes ~35 property writes from every Val construction
// and eliminates the corresponding hidden-class transitions. Subclasses
// override only the flags that differ, via their own class-field
// initializers (e.g. `MapVal.isMap = true`).
Object.assign(Val.prototype, {
  isVal: true,

  isTop: false,
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


// THE INSTANCE PATH NORMALISATION (ADR-005), the TS mirror of the Go
// port's setPaths (go/clone.go): assign every value in a freshly
// instantiated template the path the PARSER would have given it at the
// instance's destination. A deep instance clone (`dup`) copies values
// whose stored parse paths are argument-shaped — a func argument has
// no key of its own, a spread template lives under a '&' segment — and
// Val.clone's ctx-cut cannot rebase those: it derives the child path
// from the driving ctx alone and drops the segments in between, which
// is how a nested list spread inside a close()d template lost its
// parent key and every finding under it named the wrong path (the
// 06-k8s use case's env findings). One canonical walk instead:
// bag children descend by key (numeric for a list element, as the
// parser records them), a spread constraint sits under '&' with its
// content at the bag's own path, and junction members, operator
// operands, function arguments and a preference's value all sit AT
// their holder's path — exactly the parse-time shape.
function repathInstance(v: any, path: string[]): void {
  if (true !== v?.isVal) {
    return
  }
  v.path = path

  const peg = v.peg

  if (true === v.isBag) {
    const spread = v.spread?.cj
    if (null != spread && true === spread.isVal) {
      // The spread's CONTENT is pathed at the bag (its fields land on
      // the bag's children); only its ROOT carries the '&' segment —
      // the same two steps as the Go twin's setPaths.
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
        '\n  ' + indent + n[0] + ': ' + // n[1].inspect(d)
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


function empty(o: any) {
  return (
    (Array.isArray(o) && 0 === o.length)
    || (null != o && 'object' === typeof o && 0 === Object.keys(o).length)
    || false
  )
} /* node:coverage ignore next 16 */



export type {
  ValMark,
  ValSpec,
}

// THE STABLE IDENTITY OF A SPREAD TEMPLATE, across clones. Every Val
// takes a fresh `id` when it is constructed, so the bag loops'
// apply-once mark -- which records WHICH template has already been
// merged into a value -- could never match after a clone: a reference
// resolving to a templated bag clones the bag AND its template, and the
// fresh template's id matched nothing, so the template was applied a
// second time over the value the first application had produced
// (use-cases/BUGS.md §50). The first call fixes the identity to the
// original's own id; Val.clone carries `_sid`, so every clone of that
// template answers with it.
function spreadId(cj: any): number {
  return cj._sid ?? (cj._sid = cj.id)
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

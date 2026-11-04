/* Copyright (c) 2025 Richard Rodger, MIT License */


export type WhyRole = 'literal' | 'spread' | 'ref' | 'pref'

// The G2 site object, minus its data/schema role: a contribution's
// role is its own (above), and a `why` run has one document.
export type WhySite = {
  col: number
  file: string
  len: number
  row: number
}

export type WhyConjunct = {
  canon: string
  role: WhyRole
  site: WhySite
  src: string
  rank?: number
}

export type WhyRecord = {
  conjuncts: WhyConjunct[]
  path: string
  value: string
}


// Set on a spread template's per-key clone, at the one place a spread
// is applied (MapVal/ListVal.unify), and carried by a clone of it.
export const FROM_SPREAD = '_fromSpread'


export const WRITTEN = '_written'


export const INNER_OF = '_innerOf'


export function markSpread(v: any, seen?: Set<any>): void {
  const marked = seen ?? new Set<any>()
  if (null == v || true !== v.isVal || marked.has(v)) {
    return
  }
  marked.add(v)
  v[FROM_SPREAD] = true
  if (true === v.isMap && null != v.peg) {
    for (const k of Object.keys(v.peg)) {
      markSpread(v.peg[k], marked)
    }
  }
  else if (true === v.isList && null != v.peg) {
    for (const k of Object.keys(v.peg)) {
      markSpread(v.peg[k], marked)
    }
  }
  else if (Array.isArray(v.peg)) {
    // A junction, a func's arguments, an op's operands: every one of
    // them can hold the value that reaches the destination.
    for (const m of v.peg) {
      markSpread(m, marked)
    }
  }
  else if (true === v.isPref) {
    markSpread(v.peg, marked)
  }
}


// The children that stand at the SAME path as v. See INNER_OF.
function samePathKids(v: any): any[] {
  if (true === v.isMap || true === v.isList || true === v.isConjunct) {
    return []
  }
  if (true === v.isPref) {
    return null != v.peg && true === v.peg.isVal ? [v.peg] : []
  }
  return Array.isArray(v.peg)
    ? v.peg.filter((k: any) => null != k && true === k.isVal) : []
}


function cmpSite(a: Contribution, b: Contribution): number {
  return a.site.file.localeCompare(b.site.file) ||
    a.site.row - b.site.row ||
    a.site.col - b.site.col ||
    a.canon.localeCompare(b.canon)
}


function roleOf(v: any): WhyRole {
  if (true === v[FROM_SPREAD]) {
    return 'spread'
  }
  if (true === v.isRef) {
    return 'ref'
  }
  if (true === v.isPref) {
    return 'pref'
  }
  return 'literal'
}


type Contribution = WhyConjunct & {
  id: number
}

type PathRecord = {
  conjuncts: Contribution[]
  // Ids of values PRODUCED by a meet at this path: an operand among
  // them is an intermediate result, not a source contribution.
  made: Set<number>
  seen: Set<number>
}


export class Provenance {
  paths: Map<string, PathRecord> = new Map()

  containers: Map<number, any> = new Map()

  writtenFrom(v: any): void {
    if (null == v || true !== v.isVal || true === v[WRITTEN]) {
      return
    }
    v[WRITTEN] = true
    const kids: any[] =
      (true === v.isMap || true === v.isList) && null != v.peg
        ? Object.keys(v.peg).map((k) => v.peg[k])
        : Array.isArray(v.peg) ? v.peg
          : null != v.peg && true === v.peg.isVal ? [v.peg]
            : []
    for (const k of kids) {
      this.writtenFrom(k)
    }
    // OUTERMOST WINS: the walk is top-down, so a value already pointed
    // at a container is inside that one and this one, and the answer
    // the author wants is the whole written statement.
    for (const k of samePathKids(v)) {
      if (null == k[INNER_OF]) {
        k[INNER_OF] = v.id
        this.containers.set(v.id, v)
      }
    }
    if (null != v.spread?.cj) {
      this.writtenFrom(v.spread.cj)
    }
  }

  // One meet. Both operands are candidate contributions; the result is
  // remembered so a later meet does not mistake it for a source.
  record(path: string[], a: any, b: any, out: any): void {
    const key = path.join('.')
    let rec = this.paths.get(key)
    if (null == rec) {
      rec = {
        conjuncts: [], made: new Set(), seen: new Set(),
      }
      this.paths.set(key, rec)
    }

    this.contribute(rec, a)
    this.contribute(rec, b)

    if (null != out && true === out.isVal && out !== a && out !== b) {
      rec.made.add(out.id)
    }
  }

  private contribute(rec: PathRecord, v: any): void {
    if (null == v || true !== v.isVal || true === v.isTop || true === v.isNil ||
      rec.made.has(v.id) || rec.seen.has(v.id)) {
      return
    }

    // PART OF a written value is not a value beside it: report the
    // whole statement the author wrote, whichever piece of it the
    // fixpoint happened to meet here. See INNER_OF.
    let outer: any = v
    for (let up = this.containers.get(outer[INNER_OF]);
      null != up; up = this.containers.get(outer[INNER_OF])) {
      outer = up
    }
    if (outer !== v) {
      this.contribute(rec, outer)
      return
    }
    // Not the author's: see WRITTEN.
    if (true !== v[WRITTEN] && true !== v[FROM_SPREAD]) {
      return
    }
    if (true === v.isConjunct && Array.isArray(v.peg)) {
      rec.seen.add(v.id)
      for (const term of v.peg) {
        this.contribute(rec, term)
      }
      return
    }
    rec.seen.add(v.id)
    rec.conjuncts.push({
      canon: v.canon,
      id: v.id,
      role: roleOf(v),
      // COALESCED, unlike vet's siteOf: a `why` run reads whatever
      // source it was handed, and an inline document (a spec row, a
      // piped stdin) has no file name to stamp. The Go port answers
      // the empty string for the same value, so the two agree.
      site: {
        col: v.site.col, file: v.site.url ?? '', len: v.site.len,
        row: v.site.row,
      },
      src: v.site.src,
      ...(true === v.isPref ? { rank: v.rank } : {}),
    })
  }

  stands(path: string[], v: any): void {
    const key = path.join('.')
    const rec = this.paths.get(key)
    if (null != rec && 0 < rec.conjuncts.length) {
      return
    }
    this.record(path, v, undefined, undefined)
  }

  at(path: string[]): WhyConjunct[] {
    const rec = this.paths.get(path.join('.'))
    if (null == rec) {
      return []
    }
    const shown = new Map<string, Contribution>()
    const order = ['spread', 'ref', 'pref', 'literal']
    const out: Contribution[] = []
    for (const c of rec.conjuncts.slice().sort(cmpSite)) {
      if (c.site.row < 0) {
        out.push(c)
        continue
      }
      const key = [c.src, c.site.file,
        c.site.row, c.site.col, c.site.len].join('\u0000')
      const had = shown.get(key)
      if (null == had) {
        shown.set(key, c)
        out.push(c)
      }
      else if (order.indexOf(c.role) < order.indexOf(had.role)) {
        had.role = c.role
      }
    }
    return out.map(({ id, ...rest }) => rest)
  }
}

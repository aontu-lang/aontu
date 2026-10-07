/* Copyright (c) 2021-2026 Richard Rodger, MIT License */


import type { Val } from './type'

import { makeNilErr } from './err'

import { cmpCodePoint } from './keyorder'
import { spreadSnapKey } from './val/MapVal'
import { ALIAS_NAME, aliasSetItems } from './aliasname'
import { restArgs } from './walk'


const ALIAS_DECL_RE = new RegExp('(?:^|[\\s{[:,(])(' + ALIAS_NAME + ')[ \\t]*(?::|=(?!=))', 'g')
const NON_CODE_RE = /"(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$)|`(?:\\[\s\S]|[^`\\])*(?:`|$)|\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g

// Whether the head IS a set is aliasSetItems's answer, not the shape's.
const ALIAS_TAKE_RE = /^(\{[^}]*\})[ \t]*=[ \t]*@[ \t]*"([^"]*)"/


type AliasBinding = {
  name: string
  row: number
  col: number
  decl: string
  from: string    // the include a destructure took it from, '' if local
}


// THE NAMES A FILE BINDS, from its TEXT rather than its tree: an editor
// asks while the document is half-written and would not parse.
function aliasScope(src: string): AliasBinding[] {
  const out: AliasBinding[] = []
  const lines = src.split('\n')
  const code = src.replace(NON_CODE_RE, text => text.replace(/[^\n]/g, ' ')).split('\n')

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const lead = line.length - line.replace(/^[ \t]+/, '').length
    const rest = line.substring(lead)
    const decl = line.trim()

    const tm = ALIAS_TAKE_RE.exec(rest)
    const binds = null == tm ? undefined : aliasSetItems(tm[1])
    if (null == tm || undefined === binds) {
      for (const dm of code[li].matchAll(ALIAS_DECL_RE)) {
        const col = dm.index + dm[0].indexOf(dm[1]) + 1
        out.push({ name: dm[1], row: li + 1, col, decl, from: '' })
      }
      continue
    }

    // The column is each item's own, so a set jumps to the name asked
    // for rather than to the pattern.
    let at = lead
    for (const b of binds) {
      at = line.indexOf(b.local, at)
      out.push({ name: b.local, row: li + 1, col: at + 1, decl, from: tm[2] })
      at += b.local.length
    }
  }

  return out
}


// EVERY ALIAS REFERENCE NAMES A DECLARED NAME, whether or not anything
// reaches it. Resolution is lazy, so a reference inside a template that
// nothing instantiates is never tried and a misspelling compiles clean.
// Whether a NAME is declared does not depend on what the tree holds, so
// it is answered here instead. See docs/design/ALIASES.0.md
function aliasErrors(ctx: any, root: Val): void {
  if (true !== (root as any).isMap) {
    return
  }
  const declared = new Set<string>((root as any).aliasKeys)
  const seen = new Set<Val>()

  const visit = (v: any): void => {
    if (null == v || true !== v.isVal || seen.has(v)) {
      return
    }
    seen.add(v)

    if (true === v.isRef) {
      const key: string | undefined = v.aliasKey
      if (undefined !== key && !declared.has(key)) {
        ctx.adderr(makeNilErr(ctx, 'no_path', v, undefined, 'resolve'))
      }
      return
    }

    if (true === v.isMap) {
      for (const k of Object.keys(v.peg)) {
        visit(v.peg[k])
      }
    }
    else if (Array.isArray(v.peg)) {
      for (const e of v.peg) {
        visit(e)
      }
    }
    else if (null != v.peg && true === v.peg.isVal) {
      visit(v.peg)
    }

    if ((true === v.isMap || true === v.isList) && null != v.spread.cj) {
      visit(v.spread.cj)
    }
  }

  visit(root)
} /* node:coverage ignore next 3 */


// T-1 (ALIASES.0.md sections 7 and 9). Expansion TERMINATES -- no
// parameters, no recursion, a finite name set -- but a name that names
// names expands to the product of what they hold. The budget is on
// EXPANDED SIZE and charged here, ahead of evaluation.
function aliasBudget(ctx: any, root: Val): Val | undefined {
  // A DOCUMENT THAT INCLUDES parses to a conjunct, not a map: the
  // deferred terms are where an included file's names arrive, so the
  // budget must see all of them, not only the first.
  const maps: any[] = []
  const gather = (v: any): void => {
    if (true === v?.isMap) {
      maps.push(v)
    }
    else if (true === v?.isConjunct && Array.isArray(v.peg)) {
      for (const t of v.peg) {
        gather(t)
      }
    }
  }
  gather(root)
  if (0 === maps.length) {
    return undefined
  }
  const decl: Record<string, Val> = {}
  for (const m of maps) {
    for (const k of m.aliasKeys) {
      decl[k] = m.peg[k]
    }
  }
  const limit: number = ctx.budget.alias
  const size = new Map<string, number>()
  const open = new Set<string>()
  let over: Val | undefined = undefined

  // A cycle is refused at resolution, which has not run yet, so a name
  // already open costs nothing here rather than looping.
  const nameSize = (key: string): number => {
    if (size.has(key)) {
      return size.get(key) as number
    }
    if (open.has(key) || !(key in decl)) {
      return 0
    }
    open.add(key)
    const n = valSize(decl[key])
    open.delete(key)
    size.set(key, n)
    return n
  }

  const valSize = (v: any): number => {
    if (true === v.isRef) {
      const key: string | undefined = v.aliasKey
      return undefined === key ? 1 : 1 + nameSize(key)
    }
    let n = 1
    if (true === v.isMap) {
      for (const k of Object.keys(v.peg)) {
        n += valSize(v.peg[k])
      }
    }
    else if (Array.isArray(v.peg)) {
      for (const e of v.peg) {
        n += valSize(e)
      }
    }
    else if (null != v.peg && true === v.peg.isVal) {
      n += valSize(v.peg)
    }
    if ((true === v.isMap || true === v.isList) && null != v.spread?.cj) {
      n += valSize(v.spread.cj)
    }
    return limit < n ? limit + 1 : n
  }

  let total = 0
  for (const m of maps) {
    for (const k of Object.keys(m.peg)) {
      if (!(k in decl)) {
        total += valSize(m.peg[k])
        if (limit < total) {
          break
        }
      }
    }
  }

  if (limit < total) {
    over = makeNilErr(ctx, 'alias_budget', root, undefined, 'resolve')
    ; (over as any).details = { budget: '' + limit }
  }
  return over
}


function expandAliases(root: Val, snapmap: Map<string, Val>): void {
  if (true !== (root as any).isMap) {
    return
  }

  const seen = new Set<Val>()
  const path = new Map<Val, number>()

  // A copy may share its call's arguments with the declaration, so the
  // value a reference names can hold it: the walk answers how shallow a
  // value it meets again on its own path, and the deepest expansion
  // such a cycle passes through is a knot instead.
  const visit = (v: any, stack: string[]): number => {
    if (null == v || true !== v.isVal) {
      return Infinity
    }
    if (seen.has(v)) {
      return path.get(v) ?? Infinity
    }
    seen.add(v)
    const depth = path.size
    path.set(v, depth)
    try {
      if (true !== v.isRef) {
        let low = Infinity
        for (const kid of aliasKids(v)) {
          low = Math.min(low, visit(kid, stack))
        }
        return low
      }
      const key: string | undefined = v.aliasKey
      v.expansion = undefined
      if (undefined === key || stack.includes(key)) {
        return Infinity
      }
      const target: Val | undefined =
        snapmap.get(spreadSnapKey(v)) ?? (root as any).peg[key]
      if (null != target) {
        v.expansion = target
        if (visit(target, [...stack, key]) <= depth) {
          v.expansion = undefined
        }
      }
      return Infinity
    }
    finally {
      path.delete(v)
    }
  }

  visit(root, [])
}


// The values an alias reference inside `v` may stand in, as its canon
// reaches them. A declaration is reached through its references, each
// under its own name, never as a child: a self-reference inside it is
// a knot only from inside.
function aliasKids(v: any): any[] {
  const out: any[] = true === v.isMap ? Object.keys(v.peg)
    .filter((k: string) => !v.aliasKeys.includes(k))
    .sort(cmpCodePoint).map((k: string) => v.peg[k]) :
    Array.isArray(v.peg) ? [...v.peg] :
      null != v.peg && true === v.peg.isVal ? [v.peg] : []
  if (true === v.isMap || true === v.isList) {
    out.push(v.spread.cj)
  }
  // A merged residual's peg is empty: its atoms hold the arguments.
  if (true === v.isConstraint) {
    out.push(...v.musts.map((m: any) => m.v),
      ...v.nofs.flatMap((n: any) => n.branches),
      ...v.whens.flatMap((w: any) => [w.c, w.t, w.e]),
      ...v.contains.map((c: any) => c.c),
      ...v.rests.flatMap(restArgs))
  }
  return out
}


// A value's canon with each alias reference spelled by its name, as a
// declaration and its copy both are, however each was reached.
function spelledCanon(v: Val): string {
  const held: [any, Val][] = []
  const seen = new Set<Val>()
  const visit = (n: any): void => {
    if (null == n || true !== n.isVal || seen.has(n)) {
      return
    }
    seen.add(n)
    if (true === n.isRef) {
      if (undefined !== n.expansion) {
        held.push([n, n.expansion])
        n.expansion = undefined
      }
      return
    }
    aliasKids(n).forEach(visit)
  }
  visit(v)
  try {
    return v.canon
  }
  finally {
    for (const [n, e] of held) {
      n.expansion = e
    }
  }
} /* node:coverage ignore next 14 */


export {
  aliasBudget,
  aliasErrors,
  aliasScope,
  expandAliases,
  spelledCanon,
}


export type {
  AliasBinding,
}

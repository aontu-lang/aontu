/* Copyright (c) 2021-2026 Richard Rodger, MIT License */


import type { Val } from './type'

import { makeNilErr } from './err'

import { spreadSnapKey } from './val/MapVal'
import { ALIAS_NAME, aliasSetItems } from './aliasname'


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


function expandAliases(root: Val, snapmap: Map<string, Val>, errs: any[]): void {
  if (true !== (root as any).isMap) {
    return
  }

  const decl: any = (root as any).peg
  const aliasKeys: string[] = (root as any).aliasKeys
  const targetOf = (ref: any): Val | undefined =>
    snapmap.get(spreadSnapKey(ref)) ?? decl[ref.aliasKey]

  // Whether v holds a reference to the alias, through each reference's
  // own target in turn. A reference to an alias that reaches itself keeps
  // its name, as the residual it resolves to does: no rendering loops,
  // and none depends on whether the reference has resolved yet.
  const reaches = (v: any, key: string, met: Set<Val>): boolean => {
    if (null == v || true !== v.isVal || met.has(v)) {
      return false
    }
    met.add(v)
    if (true === v.isRef) {
      return undefined !== v.aliasKey &&
        (key === v.aliasKey || reaches(targetOf(v), key, met))
    }
    // A residual of an alias stands for a reference to it.
    const alias: string | undefined = true === v.isRecurse &&
      1 === v.target.length && aliasKeys.includes(v.target[0]) ? v.target[0] : undefined
    if (undefined !== alias) {
      return key === alias || reaches(decl[alias], key, met)
    }
    return kids(v).some((k: Val) => reaches(k, key, met))
  }

  const seen = new Set<Val>()
  const looped = new Map<string, boolean>()

  const visit = (v: any): void => {
    if (null == v || true !== v.isVal || seen.has(v)) {
      return
    }
    seen.add(v)

    if (true === v.isRef) {
      const key: string | undefined = v.aliasKey
      if (undefined === key) {
        return
      }
      const target: Val | undefined = targetOf(v)
      const memo = key + '\u0000' + target?.id
      if (null != target && !looped.has(memo)) {
        looped.set(memo, reaches(target, key, new Set()))
      }
      v.expansion = looped.get(memo) ? undefined : target
      visit(target)
      return
    }

    kids(v).forEach(visit)
  }

  // A refusal's operands render in its sites, wherever they were copied.
  visit(root)
  aliasKeys.forEach((k: string) => visit(decl[k]))
  errs.forEach((e: any) => (visit(e.primary), visit(e.secondary)))
}


// The values a rendering descends into, a map's declarations aside.
function kids(v: any): Val[] {
  const out: Val[] = true === v.isMap ?
    Object.keys(v.peg)
      .filter((k: string) => !v.aliasKeys.includes(k))
      .map((k: string) => v.peg[k]) :
    Array.isArray(v.peg) ? v.peg :
      null != v.peg && true === v.peg.isVal ? [v.peg] : []
  return (true === v.isMap || true === v.isList) && null != v.spread.cj ?
    [...out, v.spread.cj] : out
} /* node:coverage ignore next 13 */


export {
  aliasBudget,
  aliasErrors,
  aliasScope,
  expandAliases,
}


export type {
  AliasBinding,
}

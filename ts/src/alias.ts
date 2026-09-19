/* Copyright (c) 2021-2026 Richard Rodger, MIT License */


import type { Val } from './type'

import { makeNilErr } from './err'

import { cmpCodePoint } from './keyorder'
import { spreadSnapKey } from './val/MapVal'


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


function expandAliases(root: Val, snapmap: Map<string, Val>): void {
  if (true !== (root as any).isMap) {
    return
  }

  const seen = new Set<Val>()

  const visit = (v: any, stack: string[]): void => {
    if (null == v || true !== v.isVal || seen.has(v)) {
      return
    }
    seen.add(v)

    if (true === v.isRef) {
      const key: string | undefined = v.aliasKey
      if (undefined === key) {
        return
      }
      v.expansion = undefined
      if (stack.includes(key)) {
        return
      }
      const target: Val | undefined =
        snapmap.get(spreadSnapKey(v)) ?? (root as any).peg[key]
      if (null == target) {
        return
      }
      v.expansion = target
      visit(target, [...stack, key])
      return
    }

    if (true === v.isMap) {
      // A declaration is reached through its references, each under
      // its own name, never as a child: a self-reference inside it
      // is a knot only from inside.
      const keys = Object.keys(v.peg)
        .filter((k: string) => !v.aliasKeys.includes(k))
        .sort(cmpCodePoint)
      for (const k of keys) {
        visit(v.peg[k], stack)
      }
    }
    else if (Array.isArray(v.peg)) {
      for (const e of v.peg) {
        visit(e, stack)
      }
    }
    else if (null != v.peg && true === v.peg.isVal) {
      visit(v.peg, stack)
    }

    if ((true === v.isMap || true === v.isList) && null != v.spread.cj) {
      visit(v.spread.cj, stack)
    }
  }

  visit(root, [])
} /* node:coverage ignore next 6 */


export {
  aliasErrors,
  expandAliases,
}

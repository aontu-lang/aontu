/* Copyright (c) 2025 Richard Rodger, MIT License */


import { createHash } from 'node:crypto'

import type { Val } from './val/Val'

import { cmpCodePoint } from './keyorder'
import { wrapRiders } from './utility'


type HMarks = {
  type: boolean
  hide: boolean
}


function render(v: any, inh: HMarks): string {
  if (true !== v?.isVal) {
    return String(v)
  }

  const mtype = true === v.mark?.type
  const mhide = true === v.mark?.hide
  const inner: HMarks = {
    type: inh.type || mtype,
    hide: inh.hide || mhide,
  }

  let s: string
  if (true === v.isMap) {
    const keys = Object.keys(v.peg)
      .filter((k) => !v.aliasKeys.includes(k))
      .sort(cmpCodePoint)
    s = '{' +
      (v.spread.cj ? '&:' + render(v.spread.cj, inner) +
        (0 < keys.length ? ',' : '') : '') +
      keys.map((k) =>
        JSON.stringify(k) +
        (v.optionalKeys.includes(k) ? '?' : '') +
        ':' +
        render(v.peg[k], inner)).join(',') +
      '}'
    if (true === v.closed) {
      s = 'close(' + s + ')'
    }
  }
  else if (true === v.isList) {
    const keys = Object.keys(v.peg)
    s = '[' +
      (v.spread.cj ? '&:' + render(v.spread.cj, inner) +
        (0 < keys.length ? ',' : '') : '') +
      keys.map((k) => render(v.peg[k], inner)).join(',') +
      ']'
    if (true === v.closed) {
      s = 'close(' + s + ')'
    }
  }
  else if (true === v.isPref) {
    s = '*' + render(v.peg, inner)
  }
  else if (true === v.isConjunct || true === v.isDisjunct) {
    s = junctionText(v, true === v.isConjunct ? '&' : '|', inner)
  }
  else if (true === v.isRef && undefined !== v.expansion) {
    s = render(v.expansion, inner)
  }
  else {
    s = v.canon
  }

  if (mtype && !inh.type) {
    s = 'type(' + s + ')'
  }
  if (mhide && !inh.hide) {
    s = 'hide(' + s + ')'
  }

  // The riders ride outermost, as canonRiders renders them (the
  // wrappers are all reparseable calls, so order only has to be FIXED,
  // and this matches the canon the G3 rows pinned).
  return wrapRiders(s, v)
}


function junctionText(v: any, sym: string, inner: HMarks): string {
  return v.peg.map((m: any) =>
    true === m?.isJunction && 1 < m.peg.length
      ? '(' + render(m, inner) + ')'
      : render(m, inner))
    .join(sym)
}


// The hash form of an EVALUATED Val (unify first; parse-level canon
// parenthesisation differs between the ports and is excluded by
// construction — AGENTS.md).
export function hcanon(v: Val): string {
  return render(v, { type: false, hide: false })
}


export function canonHash(v: Val): string {
  return 'aon1-' +
    createHash('sha256').update(hcanon(v), 'utf8').digest('base64url')
}

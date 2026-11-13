/* Copyright (c) 2025 Richard Rodger, MIT License */


import { createHash } from 'node:crypto'

import type { Val } from './val/Val'

import { cmpCodePoint } from './keyorder'
import { riderText } from './rider'
import { relateText } from './val/PathVal'


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
    s = '{' + spreadText(v, 0 < keys.length, inner) +
      keys.map((k) =>
        JSON.stringify(k) +
        (v.optionalKeys.includes(k) ? '?' : '') +
        ':' +
        render(v.peg[k], inner)).join(',') +
      '}'
    if (true === v.closed) {
      s = 'close(' + s + ')'
    }
    s = relateText(v) + s
  }
  else if (true === v.isList) {
    const keys = Object.keys(v.peg)
    s = '[' + spreadText(v, 0 < keys.length, inner) +
      keys.map((k) => render(v.peg[k], inner)).join(',') +
      ']'
    if (true === v.closed) {
      s = 'close(' + s + ')'
    }
    s = relateText(v) + s
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

  // The riders go outermost, as canonRiders renders them: the wrappers
  // are reparseable calls, so the order only has to be fixed.
  return riderText(s, v)
}


// A bag's template, where it has one with a text of its own.
function spreadText(v: any, members: boolean, inner: HMarks): string {
  const s = v.spread.cj ? render(v.spread.cj, inner) : ''
  return '' === s ? '' : '&:' + s + (members ? ',' : '')
}


function junctionText(v: any, sym: string, inner: HMarks): string {
  const parts = (v.peg as any[]).map((m: any): [number, string] => [m.cjo,
    true === m?.isJunction && 1 < m.peg.length
      ? '(' + render(m, inner) + ')'
      : render(m, inner)]).filter((p) => '' !== p[1])
  // As canon writes a meet: terms of one rank in code-point order.
  if ('&' === sym) {
    parts.sort((a, b) => a[0] - b[0] || cmpCodePoint(a[1], b[1]))
  }
  return parts.map((p) => p[1]).join(sym)
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

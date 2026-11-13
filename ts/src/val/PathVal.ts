/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import { propagateMarks, walk } from '../utility'
import { cmpCodePoint } from '../keyorder'

import { ScalarVal } from './ScalarVal'
import { ScalarKindVal, Path } from './ScalarKindVal'


const ADDR_SEGMENT = /^[A-Za-z0-9_-]+$/

export type Address = {
  // Anchored at the document root (`$.a.b`) rather than at the link's
  // own position (`.a.b`).
  absolute: boolean
  // Parent steps, for a relative address that climbs (`..a` is one).
  up: number
  // The written segments, below the anchor.
  parts: string[]
}


export function parseAddress(s: string): Address | undefined {
  if ('$' === s) {
    // The whole document is not a relation's target: an address must
    // name something with a position to be written back into.
    return undefined
  }
  if (s.startsWith('$.')) {
    const parts = s.slice(2).split('.')
    for (const seg of parts) {
      if (!ADDR_SEGMENT.test(seg)) {
        return undefined
      }
    }
    return { absolute: true, up: 0, parts }
  }
  if (!s.startsWith('.')) {
    return undefined
  }
  // A relative address: the leading dot anchors it at the sibling
  // scope, and every FURTHER leading dot is one step up from there --
  // the same reduction a relative reference's `.` segments perform.
  let up = 0
  let rest = s.slice(1)
  while (rest.startsWith('.')) {
    up++
    rest = rest.slice(1)
  }
  if ('' === rest) {
    return undefined
  }
  const parts = rest.split('.')
  for (const seg of parts) {
    if (!ADDR_SEGMENT.test(seg)) {
      return undefined
    }
  }
  return { absolute: false, up, parts }
}


export function addressPath(
  addr: Address, at: (string | number)[]
): string[] | undefined {
  if (addr.absolute) {
    return addr.parts
  }
  // The SIBLING scope: drop the link's own key, then take the parent
  // steps. A link at `$.a.b.dep` spelling `.other` means `$.a.b.other`.
  const cut = at.length - 1 - addr.up
  if (cut < 0) {
    return undefined
  }
  return at.slice(0, cut).map(String).concat(addr.parts)
}


function concreteFlow(ctx: AontuContext, t: Val): Val {
  let marked = false
  walk(t, (_key: string | number | undefined, v: Val) => {
    marked = marked || v.mark.type || v.mark.hide
    return v
  })
  // An unmarked flow type is passed THROUGH: cloning one anyway would
  // move the site an error names, and a conflict has to point at what
  // the author wrote.
  if (!marked) {
    return t
  }
  const out = t.clone(ctx)
  walk(out, (_key: string | number | undefined, v: Val) => {
    v.mark.type = false
    v.mark.hide = false
    return v
  })
  return out
}


export function textAddress(s: string): string {
  return ('$' === s[0] || '.' === s[0]) ? s : '.' + s
}


// The templates of the links met at one position, each once.
export function joinFlows(
  a: [string, Val][] | undefined, b: [string, Val][] | undefined
): [string, Val][] | undefined {
  if (undefined === b || a === b) {
    return a
  }
  if (undefined === a) {
    return b
  }
  const more = b.filter((f) => !a.includes(f))
  return 0 === more.length ? a : a.concat(more)
}


// The templates of the `relate()` calls written at one value, each once.
export function joinRelates(
  a: Val[] | undefined, b: Val[] | undefined
): Val[] | undefined {
  if (undefined === b || a === b) {
    return a
  }
  if (undefined === a) {
    return b
  }
  const have = a.map((t) => t.canon)
  const more = b.filter((t) => !have.includes(t.canon))
  return 0 === more.length ? a : a.concat(more)
}


// The `relate()` written at a value, as canon writes it before the value.
export function relateText(v: Val): string {
  if (true !== v.relroot) {
    return ''
  }
  const relates = v.relates as Val[]
  if (0 === relates.length) {
    return 'relate()&'
  }
  return relates.map((t) => 'relate(' + t.canon + ')&').sort(cmpCodePoint).join('')
}


export function prefixMeet(a: string, b: string): string | undefined {
  const pa = parseAddress(a) as Address
  const pb = parseAddress(b) as Address
  if (pa.absolute !== pb.absolute || pa.up !== pb.up) {
    return undefined
  }
  const short = pa.parts.length <= pb.parts.length ? pa : pb
  const long = short === pa ? pb : pa
  for (let i = 0; i < short.parts.length; i++) {
    if (short.parts[i] !== long.parts[i]) {
      return undefined
    }
  }
  return short === pa ? b : a
}


// The link a path written at `at` is, carrying each template to the node
// it names; undefined where a relative path climbs off the top of the tree.
export function linkAt(
  ctx: AontuContext, addrsrc: string, at: string[], flows: [string, Val][] | undefined,
  relates: Val[], relroot: boolean
): PathVal | undefined {
  const target = addressPath(parseAddress(addrsrc) as Address, at)
  if (undefined === target) {
    return undefined
  }
  const out: any = new PathVal({ peg: addrsrc }, ctx)
  const key = target.join('\x00')
  out.dc = DONE
  out.link = '$.' + target.join('.')
  out.linkto = target
  out.flows = joinFlows(flows, 0 === relates.length ? undefined
    : relates.map((t): [string, Val] => [key, concreteFlow(ctx, t)]))
  out.relates = relates
  out.relroot = relroot
  out.path = at
  return out
}


class PathVal extends ScalarVal {
  isPath = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super({ peg: spec.peg, kind: Path }, ctx)
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer
    // A relate() peer drives, as it does beside a map or a list.
    if (true === p.isRelate) {
      return peer.unify(this, ctx)
    }
    if (true === p.isPath) {
      const merged = prefixMeet(this.peg, p.peg)
      if (undefined === merged) {
        return makeNilErr(ctx, 'scalar_value', this, peer)
      }
      // Of one address met twice, the side a link made keeps the edge.
      let out = merged !== this.peg || (merged === p.peg
        && undefined === this.link && undefined !== p.link) ? p : this
      const other = out === this ? p : this
      // A link refined by a longer path is a link to what that path names,
      // which climbs no further than the link did.
      if (undefined === out.link && undefined !== other.link) {
        const moved = linkAt(ctx, merged, other.path, undefined,
          other.relates, true === other.relroot) as PathVal
        propagateMarks(other, moved)
        propagateMarks(out, moved)
        moved.site = out.site
        return moved
      }
      const flows = joinFlows(out.flows, other.flows)
      const relates = joinRelates(out.relates, other.relates)
      const relroot = true === out.relroot || true === other.relroot
      if (flows !== out.flows || relates !== out.relates || relroot !== (true === out.relroot)) {
        out = out.clone(ctx)
        out.flows = flows
        out.relates = relates
        out.relroot = relroot
      }
      propagateMarks(other, out)
      return out
    }
    return super.unify(peer, ctx)
  }

  // Reparses to the same VALUE: the call form is the literal syntax
  // for this kind, so canon renders it back. The peg is already the
  // address grammar, which the argument grammar also accepts.
  get canon(): string {
    return relateText(this) + 'path(' + this.peg + ')'
  }

  superior() {
    return this.place(new PathKindVal({}))
  }

} /* node:coverage ignore next 4 */


class PathKindVal extends ScalarKindVal {
  isPathKind = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super({ ...spec, peg: Path }, ctx)
  }

  get canon(): string {
    return 'path'
  }

} /* node:coverage ignore next 6 */


export {
  PathVal,
  PathKindVal,
}

/* Copyright (c) 2023-2025 Richard Rodger, MIT License */


import type { AontuOptions, TrustOptions, Val } from './type'
import { riderText } from './rider'


type IncludeOptions = {
  trust?: TrustOptions
  textExt?: string[]
}

function includeOpts(options: IncludeOptions): Partial<AontuOptions> {
  return {
    ...(null == options.trust ? {} : { trust: options.trust }),
    ...(null == options.textExt || 0 === options.textExt.length
      ? {} : { textExt: options.textExt }),
  }
}


const WALK_DEFAULT_MAXDEPTH = 9999


// Mark value in source is propagated to target (true ratchets).
function propagateMarks(source: Val, target: Val): void {
  // Don't infect top!
  if (source.isTop || target.isTop) {
    return
  }
  for (let name in source.mark) {
    (target.mark as any)[name] = (target.mark as any)[name] || (source.mark as any)[name]
  }
}


function collectDeprecations(
  root: Val): Array<{ val: Val, path: string[] }> {
  const out: Array<{ val: Val, path: string[] }> = []
  walkBagVals(root, (v: any, path) => {
    if (null != v.deprecation) {
      out.push({ val: v, path })
    }
  })
  return out
}


// Visit every Val reachable through bag children, with its path — the
// walk under collectDeprecations and vet's default-validity lint. The
// non-Val guard is for a bag's raw peg entries, which degenerate
// parses can leave behind (pinned by the collect-deprecations direct
// test, ts/test/coverage3.test.ts).
function walkBagVals(
  root: Val, fn: (v: Val, path: string[]) => void): void {
  const walk = (v: any, path: string[]): void => {
    if (null == v || true !== v.isVal) {
      return
    }
    fn(v, path)
    if ((true === v.isMap || true === v.isList) && null != v.peg) {
      for (const k of Object.keys(v.peg)) {
        walk(v.peg[k], [...path, k])
      }
    }
  }
  walk(root, [])
}


// The one-line prose for a deprecation record, shared by vet's warning
// findings and the LSP's tagged diagnostics.
// Records met on one value read as one, each field's values joined.
function deprecationMessage(d: Record<string, string[]>): string {
  const field = (k: string): string | undefined =>
    undefined === d[k] ? undefined : d[k].join('; ')
  const msg = field('msg') ?? ''
  return 'deprecated' + ('' === msg ? '' : ': ' + msg) +
    (undefined === d.use ? '' : ' (use ' + field('use') + ')') +
    (undefined === d.since ? '' : ' (since ' + field('since') + ')')
}


function canonRiders(v: Val): string {
  return riderText(v.canon, v)
}


function formatPath(path: Val | string[], absolute?: boolean) {
  let parts: string[]
  if (Array.isArray(path)) {
    parts = path
  }
  else {
    parts = path.path
  }

  let pathstr = (0 < parts.length && false !== absolute ? '$.' : '') + parts.join('.')

  return pathstr
}


type WalkApply = (
  key: string | number | undefined,
  val: Val,
  parent: Val | undefined,
  path: (string | number)[]
) => Val

/**
 * Walk a Val structure depth first, applying functions before and after descending.
 * Only traverses Val instances - stops at non-Val children.
 */
function walk(
  // These arguments are the public interface.
  val: Val,

  // Before descending into a node.
  before?: WalkApply,

  // After descending into a node.
  after?: WalkApply,

  // Maximum recursive depth, default: WALK_DEFAULT_MAXDEPTH. Use null for
  // infinite depth.
  maxdepth?: number | null,

  // These arguments are used for recursive state.
  key?: string | number,
  parent?: Val,
  path?: (string | number)[]
): Val {
  let out = null == before ? val : before(key, val, parent, path || [])

  maxdepth = null != maxdepth && 0 <= maxdepth ? maxdepth : WALK_DEFAULT_MAXDEPTH
  if (null != maxdepth && 0 === maxdepth) {
    return out
  }
  if (null != path && null != maxdepth && 0 < maxdepth && maxdepth <= path.length) {
    return out
  }

  const child: any = out.peg

  // Container Vals (Map etc) have peg = plain {} or []
  if (null != child && !child.isVal) {
    // A ListVal's array peg is an object too, and for-in yields its
    // indices as string keys, so this one loop covers both bag shapes.
    if ('object' === typeof child) {
      for (let ckey in child) {
        if (child[ckey] && child[ckey].isVal) {
          child[ckey] = walk(
            child[ckey], before, after, maxdepth, ckey, out, [...(path || []), ckey])
        }
      }
    }
  }

  out = null == after ? out : after(key, out, parent, path || [])

  return out
}


const T_NOTE = 0
const T_WHY = 1
const T_PATH = 2
const T_AVAL = 3
const T_BVAL = 4
const T_OVAL = 5
const T_CHILDREN = 6


function explainOpen(
  ctx: any,
  t: any[] | undefined | null | false,
  note: string,
  ac?: Val,
  bc?: Val
): any[] | null {
  if (false === t) return null;

  t = t ?? [null, 'root', null, null, null, null]
  t[T_WHY] = t[T_WHY] ?? ''
  t[T_NOTE] = (0 <= ctx.cc ? ctx.cc + '~' : '') + note
  t[T_PATH] = ['$', ctx.path.join('.')].filter(p => '' != p).join('.') + '  '
  if (ac) {
    t[T_AVAL] = ac.id + (ac.done ? '' : '!') + '=' + ac.canon
  }
  if (bc) {
    t[T_BVAL] = bc.id + (bc.done ? '' : '!') + '=' + bc.canon
  }

  return t
}


function ec(t: any[] | undefined | null, why: string) {
  if (null == t) return;

  const child = [null, why, null, null, null, null]
  t[T_CHILDREN] = t[T_CHILDREN] ?? []
  t[T_CHILDREN].push(child)
  return child
}


function explainClose(t: any[] | undefined | null, out?: Val) {
  if (null == t) return;

  if (out) {
    t[T_OVAL] = '-> ' + out.id + (out.done ? '' : '!') + '=' + out.canon
  }
}


function formatExplain(t: any[], d?: number) {
  d = null == d ? 0 : d
  const indent = ('  '.repeat(d))

  if (Array.isArray(t)) {
    const b = [
      indent + t.slice(0, t.length - 1).join(' ')
    ]

    const children = t[t.length - 1]
    if (Array.isArray(children)) {
      for (let ce of children) {
        b.push(formatExplain(ce, d + 1))
      }
    }

    return b.join('\n')
  }
  else {
    return indent + t
  }
}


function items(o: any) {
  if (Array.isArray(o)) {
    return o.map((n: any, i: number) => ([i, n]))
  }
  else if (null != o && 'object' === typeof o) {
    return Object.entries(o)
  }
  else {
    return []
  }
} /* node:coverage ignore next 20 */


export type { IncludeOptions }

export {
  includeOpts,
  items,
  propagateMarks,
  canonRiders,
  collectDeprecations,
  walkBagVals,
  deprecationMessage,
  formatPath,
  walk,
  WalkApply,
  explainOpen,
  ec,
  explainClose,
  formatExplain,
}


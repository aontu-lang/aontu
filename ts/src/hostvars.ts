/* Copyright (c) 2026 Richard Rodger, MIT License */

// Host bindings as the command line and the MCP server take them: the
// names a document reads, and whether a binding's source is a value.

import { Aontu } from './aontu'
import type { AontuOptions } from './type'


// The names a document reads, into read; false where it doesn't parse.
function varNamesIn(src: string, opts: AontuOptions, read: Set<string>): boolean {
  let root: any
  try {
    root = new Aontu(opts).parse(src)
  }
  catch (_err: any) {
    return false
  }
  eachPart(root, (v: any) => {
    if (true === v.isVar && 'string' === typeof v.peg?.peg) {
      read.add(v.peg.peg)
    }
  })
  return true
}


// Why a binding's source is no value, or undefined where it is one.
function bindingFailure(src: string): string | undefined {
  let v: any
  try {
    v = new Aontu({ trust: { include: 'none' } }).unify(src)
  }
  catch (err: any) {
    return String(err.message).split('\n')[0]
  }
  let holds = false
  eachPart(v, (n: any) => { holds = holds || true === n.isRef || true === n.isVar })
  return holds ? 'a binding is a value, and reads no path or variable' : undefined
}


function eachPart(root: any, visit: (v: any) => void): void {
  const seen = new Set<any>()
  const stack: any[] = [root]
  while (0 < stack.length) {
    const v = stack.pop()
    if (true !== v?.isVal || seen.has(v)) {
      continue
    }
    seen.add(v)
    visit(v)
    const peg: any = v.peg
    const kids: any[] = Array.isArray(peg) ? peg : true === peg?.isVal ? [peg] :
      null != peg && 'object' === typeof peg ? Object.values(peg) : []
    kids.forEach((kid: any) => stack.push(kid))
    stack.push(v.spread?.cj)
  }
} /* node:coverage ignore next 6 */


export {
  varNamesIn,
  bindingFailure,
}

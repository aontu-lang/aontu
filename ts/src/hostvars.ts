/* Copyright (c) 2026 Richard Rodger, MIT License */

// Host bindings as the command line and the MCP server take them: the
// names a document reads, and whether a binding's source is a value.

import { Aontu } from './aontu'
import { eachPart, holdsReference } from './walk'
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
  return holdsReference(v) ? 'a binding is a value, and reads no path or variable' : undefined
}


export {
  varNamesIn,
  bindingFailure,
}

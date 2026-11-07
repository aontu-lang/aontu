/* Copyright (c) 2025 Richard Rodger, MIT License */

import type { AontuOptions } from './type'
import { Aontu } from './aontu'


// Building an engine costs about 11 ms, nearly all of it the parser's
// grammar, far more than a verb's own work on a small document. A verb
// that never hands its engine out takes one from here, keyed by its
// options (includeOpts) and the directory a relative include root
// resolves against, and holding its own copy of those options.
const ENGINES = new Map<string, Aontu>()
const MAX_ENGINES = 8


function sharedEngine(opts: Partial<AontuOptions>): Aontu {
  const key = process.cwd() + '\n' + JSON.stringify(opts)
  let engine = ENGINES.get(key)
  if (undefined === engine) {
    if (MAX_ENGINES <= ENGINES.size) {
      ENGINES.delete(ENGINES.keys().next().value as string)
    }
    engine = new Aontu(structuredClone(opts))
    ENGINES.set(key, engine)
  }
  return engine
} /* node:coverage ignore next 6 */


export {
  sharedEngine,
  MAX_ENGINES,
}

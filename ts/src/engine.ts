/* Copyright (c) 2025 Richard Rodger, MIT License */

import type { AontuOptions } from './type'
import { Aontu } from './aontu'


// Building an engine costs about 11 ms, nearly all of it the parser's
// grammar, where a verb's own work on a small document costs a fraction
// of one. A verb that builds an engine for its own use and never hands
// it out takes one from here: one per set of options, which for such a
// verb are its trust profile and text extensions (includeOpts).
const ENGINES = new Map<string, Aontu>()
const MAX_ENGINES = 8


function sharedEngine(opts: Partial<AontuOptions>): Aontu {
  const key = JSON.stringify(opts)
  let engine = ENGINES.get(key)
  if (undefined === engine) {
    if (MAX_ENGINES <= ENGINES.size) {
      ENGINES.delete(ENGINES.keys().next().value as string)
    }
    engine = new Aontu({ ...opts })
    ENGINES.set(key, engine)
  }
  return engine
}


export {
  sharedEngine,
  MAX_ENGINES,
}

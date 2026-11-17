/* Copyright (c) 2026 Richard Rodger, MIT License */


import type { ValSpec } from '../type'

import { AontuContext } from '../ctx'

import { ScalarVal } from './ScalarVal'


class Custom { }


// An expression kept as it is written, for a `gen` record: nothing
// evaluates it until the value it rides is written.
class CustomVal extends ScalarVal {
  isCustom = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super({ peg: spec.peg, kind: Custom }, ctx)
  }

  get canon() {
    return this.peg
  }

} /* node:coverage ignore next 5 */


export {
  CustomVal,
}

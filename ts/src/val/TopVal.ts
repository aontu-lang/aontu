/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import {
  Val
} from './Val'


// There can be only one.
class TopVal extends Val {
  isTop = true

  id = 0
  dc = DONE

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)

    // TOP is always DONE, by definition.
    this.dc = DONE
    this.mark.type = false
    this.mark.hide = false
  }

  same(peer: Val): boolean {
    // return this === peer
    return peer.isTop
  }

  unify(peer: Val, ctx: AontuContext): Val {
    return peer.unify(this, ctx)
  }

  get canon() { return 'top' }

  superior(): Val {
    return this
  }

  clone(_ctx: AontuContext, _spec?: ValSpec): Val {
    return this
  }

  gen(_ctx?: AontuContext) {
    return undefined
  }

} /* node:coverage ignore next 6 */


export {
  TopVal,
}

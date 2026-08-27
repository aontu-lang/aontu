/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { FuncBaseVal } from './FuncBaseVal'
import { arith } from './arith'
import type { ArithOp } from './arith'


// ONE CLASS FOR SIX FUNCTIONS, because every rule they obey is a rule
// about arithmetic rather than about any one operation (see arith.ts).
// Six near-identical classes would be six places for the exact ladder,
// the zero divisor and the storage contract to drift apart, and the
// number tower's whole point is that they cannot.
//
// The op is carried on the instance and answered by `funcname()`, which
// is what canon renders and what an error names. The six one-line
// subclasses below exist only because the parser's registry constructs
// with `new funcval({peg: args})` and has nowhere to put a name; every
// line of behaviour is here.
class ArithFuncVal extends FuncBaseVal {
  isArithFunc = true

  // The operation this call performs. Carried on the instance because
  // `make` rebuilds the value during residuation and must rebuild the
  // SAME function.
  op: ArithOp

  constructor(
    spec: ValSpec,
    ctx: AontuContext | undefined,
    op: ArithOp
  ) {
    super(spec, ctx)
    this.op = op
  }


  // Rebuilt as its own class, carrying its own op: residuation must not
  // turn a `sub` into a bare arithmetic call with no operation.
  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new (this.constructor as any)(spec, undefined, this.op)
  }

  funcname() {
    return this.op
  }


  resolve(ctx: AontuContext | undefined, args: Val[]) {
    return this.place(arith(ctx, this.op, this, args?.[0], args?.[1]))
  }


  // NO superior() OVERRIDE, deliberately. An arithmetic call could only
  // advertise a kind once both its operands were concrete scalars -- and
  // at that point it has RESOLVED, so what `super()` sees is the result,
  // whose own superior is already the right answer:
  // `super(mul(2,3))` is `integer` and `super(mul(2,1.5))` is `float`,
  // through the value rather than through a promise about it. The
  // override was written and then removed as unreachable; the same is
  // true of FuncVal.superior in the Go port.
}


// The six the registry names. Each is its operation and nothing else.
class AddFuncVal extends ArithFuncVal {
  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx, 'add') }
}

class SubFuncVal extends ArithFuncVal {
  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx, 'sub') }
}

class MulFuncVal extends ArithFuncVal {
  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx, 'mul') }
}

class DivFuncVal extends ArithFuncVal {
  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx, 'div') }
}

class ModFuncVal extends ArithFuncVal {
  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx, 'mod') }
}

class RemFuncVal extends ArithFuncVal {
  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx, 'rem') }
} /* node:coverage ignore next 11 */


export {
  ArithFuncVal,
  AddFuncVal,
  SubFuncVal,
  MulFuncVal,
  DivFuncVal,
  ModFuncVal,
  RemFuncVal,
}

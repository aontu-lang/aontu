/* Copyright (c) 2025 Richard Rodger, MIT License */

// AGGREGATION AND PROJECTION: `sum(d)`, `least(d)`, `greatest(d)`
// and `pick(d, k)`.
//
// The review's finding I: "No aggregation. `length()` counts but
// nothing sums: an invoice total, a fleet-wide resource budget, a quota
// roll-up -- all inexpressible." Use case 10 had to write totals by
// hand and spot-check them with `must()`, which is a model asserting
// what it should be able to COMPUTE.
//
//   total:   sum($.lines)                 # an invoice total
//   cheapest: least($.quotes)             # ... and the extremes
//   peak:    greatest($.hourly)
//
// A FOLD OVER A FINITE, SETTLED BAG IS AS TOTAL AS `each`. There is no
// recursion here and no user-supplied step: the bag is the one the
// model already holds, the operation is fixed, and the walk visits each
// child exactly once. That is the whole reason these are built-ins
// rather than a `fold` combinator -- a fold takes a function, and a
// language with no user functions has none to take.
//
// THE NAMES ARE `least` AND `greatest`, NOT `min` AND `max`, because
// those two are already the constraint atoms for a LOWER and UPPER
// BOUND (`min(3)` means "at least 3"). An aggregate over a bag and a
// bound on a value are different things and must not share a spelling;
// least and greatest are the lattice's own words for the extremes of a
// set, which is exactly what these compute.
//
// `sum` FOLDS WITH `add`, so the number tower's whole law comes with it
// (arith.ts): the exact ladder, R5 contagion, the refusal to mix a
// binary float with an exact leaf, and the refusal to store a result
// that will not fit. A bag of integers sums to an integer; one integer
// float among them makes the total a float; `0d` operands keep it
// exact. And `sum([])` is `0` -- addition has an identity, which is
// what makes the empty case answerable.
//
// `least`/`greatest` have NO identity to answer an empty bag with: the
// least element of nothing is not a value, it is a question with no
// answer, so an empty bag is a located `aggregate_empty` rather than an
// invented zero or infinity. They compare with the tower's EXACT
// comparator (numcmp), so an integer and a bigdecimal in one bag order
// correctly rather than through binary64, and the winner is returned
// with its own kind intact.

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'
import { IntegerVal } from './IntegerVal'
import { ListVal } from './ListVal'
import { FuncBaseVal } from './FuncBaseVal'
import { arith } from './arith'
import { cmpNumeric } from './numcmp'
import { cmpCodePoint } from '../keyorder'


type AggOp = 'sum' | 'least' | 'greatest'


// The children of a bag, in the order the aggregate sees them: source
// order for a list, sorted-key order for a map -- `each`'s order, and
// for the same reason (a map has no order of its own, so the language
// picks one and states it).
function bagChildren(data: any): Val[] | undefined {
  if (true === data?.isList) {
    return data.peg as Val[]
  }
  if (true === data?.isMap) {
    // THE ONE MAP-KEY ORDER (../keyorder.ts), not a bare `.sort()`:
    // JavaScript compares by UTF-16 code unit, so an astral key's
    // leading surrogate sorts BELOW U+E000-U+FFFF and `pick` answered
    // in a different order from `each`, from canon, and from Go --
    // which sorts UTF-8 bytes, i.e. code points. `pick` is the
    // order-preserving projection, so that was one model producing two
    // different generated files (BUGS.md 62).
    return Object.keys(data.peg).sort(cmpCodePoint).map((k: string) => data.peg[k])
  }
  return undefined
}


class AggFuncVal extends FuncBaseVal {
  isAggFunc = true

  // THE STAGING RULE (G8 phase 0). A total over a bag that is still
  // being merged into is a total of the wrong bag -- the same reason
  // `filter` and `each` wait.
  staged = true

  op: AggOp

  constructor(
    spec: ValSpec,
    ctx: AontuContext | undefined,
    op: AggOp
  ) {
    super(spec, ctx)
    this.op = op
  }


  // NO `make` OVERRIDE, matching the other STAGED funcs (pack, each,
  // filter, match): a staged call returns `residuate` before `unify`
  // ever reaches the rebuild branch, so an override there would be
  // unreachable code pretending to be a contract. The base's `make`
  // raises `func:<name>` if that ever stops being true, which is the
  // loud answer rather than a value that silently lost its operation.

  funcname() {
    return this.op
  }


  // The base does not drive the argument: `unify` drives it by hand,
  // because a staged func must advance what it is waiting on every
  // pass rather than only on the pass it fires.
  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  unify(peer: Val, ctx: AontuContext): Val {
    const ready = this.driveStagedArgs(ctx, 1)

    if (!ready || !ctx.settle) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const children = bagChildren(args?.[0])

    if (undefined === children) {
      return this.place(makeNilErr(ctx, 'aggregate_data', this, undefined,
        this.op))
    }

    if ('sum' === this.op) {
      // Zero is addition's identity, so an empty bag has an answer and
      // it is an integer -- the narrowest kind, which the first real
      // operand then widens under R5 exactly as `add(0, x)` would.
      let total: Val = new IntegerVal({ peg: 0 })
      for (const child of children) {
        total = arith(ctx, 'add', this, total, child, this.op)
        // A refusal inside the fold IS the answer: adding on past a
        // non-numeric child or an overflow would report the wrong
        // reason, or none.
        if (true === (total as any).isNil) {
          return this.place(total)
        }
      }
      return this.place(total)
    }

    if (0 === children.length) {
      return this.place(makeNilErr(ctx, 'aggregate_empty', this, undefined,
        this.op))
    }

    const want = 'least' === this.op ? -1 : 1
    let best: any = undefined
    for (const child of children) {
      const c: any = unpref(child)
      if (!(c?.isVal && c.isScalar && 'string' !== typeof c.peg &&
        'boolean' !== typeof c.peg && !c.isNull)) {
        return this.place(makeNilErr(ctx, 'invalid-arg', this, undefined,
          this.op))
      }
      // The EXACT comparator (numcmp), never binary64: a bigdecimal and
      // an integer in one bag must order by their values and not by
      // whatever their float images happen to be.
      if (undefined === best || want === cmpNumeric(c, best)) {
        best = c
      }
    }
    // The winner is returned as itself, so it keeps its own kind: the
    // least of a bag of bigdecimals is a bigdecimal.
    return this.place(best.clone(ctx))
  }
}


// A pref child contributes its preferred value, and therefore that
// value's kind too -- the rule `+` and the arithmetic family apply to
// operands, applied here to bag members.
function unpref(v: any): any {
  while (v?.isPref) {
    v = v.peg
  }
  return v
}


// PROJECTION: `pick(d, k)` -- one element per child of `d`, being that
// child's `k`.
//
// The other half of the review's finding I: "`_.field` is unspellable,
// `filter` cannot see into lists, `unique()`-by-field is reserved but
// absent -- so 'no two services share a port' and 'unique event ids'
// cannot be said." Without it the aggregates above cannot reach the
// case that motivated them, because `sum` needs a bag of NUMBERS and a
// model holds a bag of RECORDS:
//
//   total: sum(pick($.lines, amountCents))
//
// IT IS NOT `each` WITH A CLEVER TEMPLATE. `each(d, t)` MEETS each
// child with `t`, and a meet cannot select: `each($.lines, _.amount)`
// asks for a child that is simultaneously the whole record and one of
// its fields, which is why every spelling of it answers `no_path`.
// Selection is a different operation and gets its own verb.
//
// A CHILD MISSING THE KEY IS AN ERROR, not a silently shorter list.
// Skipping would make `sum(pick(...))` quietly total the wrong set of
// records -- the failure mode an aggregate exists to prevent -- so the
// refusal names the child (`pick_key`).
class PickFuncVal extends FuncBaseVal {
  isPickFunc = true

  // The bag must settle before it is projected, exactly as it must
  // before it is folded.
  staged = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  funcname() {
    return 'pick'
  }


  // The base drives neither argument: the DATA is driven by hand below
  // (a staged func must advance what it waits on every pass), and the
  // KEY is a bare word, which the parser has already made a string.
  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  unify(peer: Val, ctx: AontuContext): Val {
    const ready = this.driveStagedArgs(ctx, 1)

    if (!ready || !ctx.settle) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const children = bagChildren(args?.[0])
    const key: any = args?.[1]

    if (undefined === children) {
      return this.place(makeNilErr(ctx, 'aggregate_data', this, undefined,
        'pick'))
    }

    // The key is a STRING for a map child and the decimal spelling of an
    // index for a list child -- the same rule a reference segment
    // follows, so `pick(d, 0)` and `$.d.0.x` agree about what `0` names.
    const name = null == key?.peg ? undefined :
      'string' === typeof key.peg ? key.peg :
        'number' === typeof key.peg && key.isInteger ? String(key.peg) :
          undefined

    if (undefined === name) {
      return this.place(makeNilErr(ctx, 'invalid-arg', this, undefined,
        'pick'))
    }

    const peg: Val[] = []
    for (const child of children) {
      const c: any = child
      const got =
        true === c?.isMap ? c.peg[name] :
          true === c?.isList ? c.peg[Number(name)] :
            undefined
      if (null == got) {
        return this.place(makeNilErr(ctx, 'pick_key', this, undefined, 'pick',
          { key: name }))
      }
      peg.push(got.clone(ctx.descend(String(peg.length))))
    }
    return this.place(new ListVal({ peg }, ctx))
  }
}


// The three the registry names. Each is its operation and nothing else.
class SumFuncVal extends AggFuncVal {
  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx, 'sum') }
}

class LeastFuncVal extends AggFuncVal {
  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx, 'least') }
}

class GreatestFuncVal extends AggFuncVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx, 'greatest')
  }
} /* node:coverage ignore next 9 */


export {
  AggFuncVal,
  PickFuncVal,
  SumFuncVal,
  LeastFuncVal,
  GreatestFuncVal,
}

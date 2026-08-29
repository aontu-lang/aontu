/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


// THE IMMEDIATE PARENT TYPE (docs/design/SUPER.0.md): super(x) answers
// the type one step above its argument, structurally. The lattice
// primitive Val.superior() stays what it always was -- the preference
// override gate and query's kind lift -- and answers here only for the
// forms it already served (scalars, kinds, top). Everything structural
// is this file's walk: maps and lists lift child by child, preferences
// unwrap, disjunctions distribute, constraints answer the kind they
// constrain, and a recursion residual stays a symbolic call -- the
// finite spelling of a lift that is itself recursive.

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'


import { FuncBaseVal } from './FuncBaseVal'
import { MapVal } from './MapVal'
import { ListVal } from './ListVal'
import { DisjunctVal } from './DisjunctVal'
import { ScalarKindVal } from './ScalarKindVal'
import { top } from './top'


class SuperFuncVal extends FuncBaseVal {
  isSuperFunc = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new SuperFuncVal(spec)
  }

  funcname() {
    return 'super'
  }


  // A DIRECT residual rides the residuate path rather than resolving:
  // the pending call IS the answer (SUPER.0.md, the phase boundary),
  // printing as written and refusing at generation exactly as an
  // unexpanded recursion does. Residuals met DURING descent are minted
  // as pending child calls by superOf below; only the top-level
  // argument needs the defer, or resolve would re-mint the same call
  // inside one pass forever.
  deferResolve(_ctx: AontuContext, args?: Val[]): boolean {
    return true === (args?.[0] as any)?.isRecurse
  }


  resolve(ctx: AontuContext, args: Val[]) {
    // One argument, always a Val: funcArity pins super at [1,1]
    // before any resolve, and the parser builds arguments as Vals --
    // a guarded fallback here is dead code under ADR-002.
    return this.place(superOf(ctx, args[0]))
  }

}


// superOf answers the immediate parent type of a RESOLVED value (the
// caller drives arguments before resolve fires, so pending forms --
// held conjuncts, unresolved references, holes -- never arrive).
function superOf(ctx: AontuContext, v: any): Val {
  // A failed argument is the failure: super(1 & 2) reports the
  // conflict, it does not type it.
  if (true === v.isNil) {
    return v
  }

  // The residual's lift is itself recursive, so the finite answer is
  // the symbolic call (SUPER.0.md): a fresh pending super() holding a
  // clone of the residual, standing wherever the residual stood --
  // the `next?` slot of a lifted recursive body prints
  // `super($.Node)` and drops under an optional key at generation.
  if (true === v.isRecurse) {
    const call = new SuperFuncVal({ peg: [v.clone(ctx)] }, ctx)
    return v.place(call)
  }

  // Maps and lists lift child by child. Shape is carried, not lifted:
  // key optionality and closedness describe the container, and the
  // spread template lifts so the result admits at the lifted level
  // for future keys exactly as the original admitted at its own.
  // A fresh bag (ADR-005 instantiation): type/hide marks are not
  // copied -- the lift of a hidden definition is output.
  if (true === v.isMap) {
    const peg: Record<string, Val> = {}
    for (const k of Object.keys(v.peg)) {
      peg[k] = superOf(ctx, v.peg[k])
    }
    const out: any = new MapVal({ peg }, ctx)
    out.optionalKeys = [...v.optionalKeys]
    out.closed = v.closed
    if (null != v.spread?.cj) {
      out.spread.cj = superOf(ctx, v.spread.cj)
    }
    return v.place(out)
  }

  if (true === v.isList) {
    const peg: Val[] = v.peg.map((e: Val) => superOf(ctx, e))
    const out: any = new ListVal({ peg }, ctx)
    out.closed = v.closed
    if (null != v.spread?.cj) {
      out.spread.cj = superOf(ctx, v.spread.cj)
    }
    return v.place(out)
  }

  // The parent TYPE of a soft value is the parent of the value --
  // softness does not survive typing. Deliberately NOT superpeg,
  // whose top-for-a-kind answer is override-gate semantics.
  if (true === v.isPref) {
    return superOf(ctx, v.peg)
  }

  // A choice lifts arm by arm: super(1|2) is integer, super(1|"a") is
  // integer|string. An arm whose lift is top absorbs the whole answer
  // -- a disjunct carrying top says nothing -- and duplicate lifts
  // collapse so the common case answers as the one kind it is.
  if (true === v.isDisjunct) {
    const arms: Val[] = []
    const seen: Record<string, boolean> = {}
    for (const a of v.peg) {
      const lift = superOf(ctx, a)
      if (true === (lift as any).isTop) {
        return v.place(top())
      }
      if (true !== seen[lift.canon]) {
        seen[lift.canon] = true
        arms.push(lift)
      }
    }
    if (1 === arms.length) {
      return v.place(arms[0])
    }
    return v.place(new DisjunctVal({ peg: arms }, ctx))
  }

  // A constraint's parent is the kind it constrains: the absorbed
  // leaf kind when it has one (integer & min(3) -> integer), else the
  // domain its atoms compare in (min(3) -> number, min("a") ->
  // string). length() constrains strings, lists and maps alike, so
  // with neither it falls through to top.
  if (true === v.isConstraint) {
    if (null != v.kind) {
      return v.place(new ScalarKindVal({ peg: v.kind }))
    }
    if ('number' === v.domain) {
      return v.place(new ScalarKindVal({ peg: Number }))
    }
    if ('string' === v.domain) {
      return v.place(new ScalarKindVal({ peg: String }))
    }
    return v.place(top())
  }

  // The lattice primitive answers for the forms it always served:
  // a concrete scalar lifts to its leaf kind, a kind to its parent,
  // and top to itself. Where it has no meaningful answer (superior()
  // defaults to top for features), top is the honest remainder.
  const sup = v.superior()
  if (null != sup && true !== (sup as any).isTop) {
    return sup
  }
  return v.place(top())
} /* node:coverage ignore next 6 */


export {
  SuperFuncVal,
}

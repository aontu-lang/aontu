/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'
import { graphAtomsText } from '../rider'
import type { DeclRecord } from '../rider'

import { FuncBaseVal } from './FuncBaseVal'
import { FeatureVal } from './FeatureVal'


// A graph atom met with nothing. Met with a value it hands the value back,
// and the meet's riders carry the declaration on, as they carry meta().
class GraphAtomVal extends FeatureVal {
  isGraphAtom = true
  isGenable = true
  // AFTER relate() (45000): the atoms say nothing about the value.
  cjo = 46000

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
    this.reldecl = (spec as any).reldecl
    this.dc = DONE
  }

  unify(peer: Val, ctx: AontuContext): Val {
    // Atoms meet on a fresh value, since each may be written elsewhere.
    if (true === (peer as any).isGraphAtom) {
      return this.clone(ctx)
    }
    return true === peer.isTop ? this : peer
  }

  get canon(): string {
    return graphAtomsText(this.reldecl as DeclRecord)
  }

  gen(_ctx: AontuContext) {
    // Silent, as an unmet relate() is: the verdict is the relation's.
    return undefined
  }
}


// D-1 (sketch/RELATIONS.0.md): the name grammar shared by entity
// names, edge predicates and inverse names.
const GRAPH_ATOM_NAME = /^[_a-zA-Z][-_a-zA-Z0-9]*$/


class AcyclicFuncVal extends FuncBaseVal {
  isAcyclicFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new AcyclicFuncVal(spec)
  }

  funcname() {
    return 'acyclic'
  }

  resolve(ctx: AontuContext, _args: Val[]) {
    const out: any = new GraphAtomVal(
      { reldecl: { acyclic: true, inverses: [] } } as any, ctx)
    out.site = this.site
    out.path = this.path
    return out
  }
}


class InverseFuncVal extends FuncBaseVal {
  isInverseFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new InverseFuncVal(spec)
  }

  funcname() {
    return 'inverse'
  }

  resolve(ctx: AontuContext, args: Val[]) {
    const a: any = args[0]
    // The mirroring predicate is a NAME -- D-1, spelled bare or
    // quoted. A relation is a vocabulary term, not an address.
    if (true !== a?.isScalar || 'string' !== typeof a.peg
      || !GRAPH_ATOM_NAME.test(a.peg)) {
      return makeNilErr(ctx, 'inverse_name', this, undefined, 'inverse')
    }
    const out: any = new GraphAtomVal(
      { reldecl: { acyclic: false, inverses: [a.peg] } } as any, ctx)
    out.site = this.site
    out.path = this.path
    return out
  }
} /* node:coverage ignore next 7 */


export {
  GraphAtomVal,
  AcyclicFuncVal,
  InverseFuncVal,
}

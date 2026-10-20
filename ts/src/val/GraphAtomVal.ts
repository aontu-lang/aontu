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

import { FuncBaseVal } from './FuncBaseVal'
import { FeatureVal } from './FeatureVal'
import { unite } from '../unify'
import { propagateMarks } from '../utility'


export type RelDecl = {
  acyclic?: boolean
  inverses: Set<string>
}

export function relDecls(ctx: any): Map<string, RelDecl> {
  return ctx._reldecls
}


class GraphAtomVal extends FeatureVal {
  isGraphAtom = true
  isGenable = true
  // AFTER rel() (45000): the atoms say nothing about the value.
  cjo = 46000

  akind: 'acyclic' | 'inverse'
  invname?: string
  held?: Val

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
    this.akind = (spec as any).akind ?? 'acyclic'
    this.invname = (spec as any).invname
    this.held = (spec as any).held
    this.dc = undefined === this.held || true === this.held.done
      ? DONE : 0
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    const out: any = super.clone(ctx, spec)
    out.akind = this.akind
    out.invname = this.invname
    out.held = this.held
    out.dc = this.dc
    return out
  }

  private carry(ctx: AontuContext, held: Val): Val {
    const out: any = new GraphAtomVal(
      { akind: this.akind, invname: this.invname, held } as any, ctx)
    propagateMarks(this, out)
    out.site = this.site
    out.path = this.path
    return out
  }

  register(ctx: AontuContext): void {
    const seg = this.path[this.path.length - 1]
    if ('string' !== typeof seg || !GRAPH_ATOM_NAME.test(seg)) {
      return
    }
    const decls = relDecls(ctx)
    let d = decls.get(seg)
    if (undefined === d) {
      d = { inverses: new Set() }
      decls.set(seg, d)
    }
    if ('acyclic' === this.akind) {
      d.acyclic = true
    }
    else if (undefined !== this.invname) {
      d.inverses.add(this.invname)
    }
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer
    this.register(ctx)

    // The self-drive: unite's tail calls unify(top) directly on any
    // not-done result, and the held is what still has work to do.
    // (A null/nil peer never arrives -- unite's ladder absorbs both.)
    if (null == peer || true === p.isTop) {
      if (undefined === this.held) {
        return this
      }
      if (true === this.held.done) {
        // Doneness is monotone, so recording it in place is safe --
        // and without it the bag walk keeps asking and generation
        // refuses a finished value.
        this.dc = DONE
        return this
      }
      const held = unite(ctx, this.held, undefined, 'atom-drive')
      if (true === held.isNil) {
        return held
      }
      this.held = held
      if (true === held.done) {
        this.dc = DONE
      }
      return this
    }

    // The SAME declaration twice is one declaration; their helds
    // merge.
    if (true === p.isGraphAtom &&
      p.akind === this.akind && p.invname === this.invname) {
      const held = undefined === this.held ? p.held
        : undefined === p.held ? this.held
          : unite(ctx, this.held, p.held, 'atom-dup')
      if (undefined !== held && true === held.isNil) {
        return held
      }
      return undefined === held ? this : this.carry(ctx, held)
    }

    // Anything else -- the rel, the container, a different atom -- is
    // ABSORBED: the atom carries the value and the fold's pairwise
    // walk merges across it.
    const held = undefined === this.held ? peer
      : unite(ctx, this.held, peer, 'atom-held')
    return true === held.isNil ? held : this.carry(ctx, held)
  }

  get canon(): string {
    const own = 'acyclic' === this.akind
      ? 'acyclic()'
      : 'inverse(' + JSON.stringify(this.invname) + ')'
    return undefined === this.held ? own : this.held.canon + '&' + own
  }

  gen(ctx: AontuContext) {
    // The atom is transparent at generation -- its verdict is global
    // (relationVerdict), never a value at this field -- and a BARE
    // atom is silent, exactly as an unmet rel() is.
    return undefined === this.held ? undefined : this.held.gen(ctx)
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
    const out: any = new GraphAtomVal({ akind: 'acyclic' } as any, ctx)
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
      { akind: 'inverse', invname: a.peg } as any, ctx)
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

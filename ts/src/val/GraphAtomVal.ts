/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE GRAPH ATOMS (RELATIONS.0.md §3.3): `acyclic()` and
// `inverse(name)`, conjoined at the same field as the `rel()` they
// govern. Their model is the sizing atoms -- a property that cannot be
// decided while information can still arrive is HELD during
// unification and DECIDED at generation, where no more can.
//
// During unification they are lattice-inert: both properties are
// global and non-monotone (one more edge can make an acyclic graph
// cyclic), and the lattice guarantee -- more information never
// falsifies what has been observed -- forbids a constraint that could
// answer true and then false. So the atoms only RESIDUATE: they ride
// the field through meets, dedup additively, appear in canon and reach
// the `aon1-` hash, and REGISTER the declaration on the context. The
// predicate they govern is the key they sit on, evaluation-global,
// additive across declarations.
//
// The verdict lands at generation (relationVerdict,
// ts/src/relation.ts) and is reported identically by the `relations`
// verb -- one decision, two surfaces.

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


// The declarations one evaluation accumulates: predicate -> what its
// atoms said. Additive, exactly as two statements of one map are. The
// map lives on the CONTEXT (created in the constructor, like the
// _depth box), so every clone shares one registry.
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
  // The value the atom rides on -- the sizing-constraint shape: the
  // atom ABSORBS its fold neighbours (the rel, the container, another
  // atom) and carries them, so the fold's pairwise walk still merges
  // the value across it. Absent until the atom meets one.
  held?: Val

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
    this.akind = (spec as any).akind ?? 'acyclic'
    this.invname = (spec as any).invname
    this.held = (spec as any).held
    // A settled residual, like an unmet rel(): the bare atom is its
    // own value, and a type() body carrying one must settle. Holding
    // an unsettled value, it is exactly as done as the value.
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

  // A rebuilt atom around a new held, at this atom's position.
  private carry(ctx: AontuContext, held: Val): Val {
    const out: any = new GraphAtomVal(
      { akind: this.akind, invname: this.invname, held } as any, ctx)
    propagateMarks(this, out)
    out.site = this.site
    out.path = this.path
    return out
  }

  // The predicate is the key the atom sits on -- and a predicate is a
  // D-1 NAME, by exactly fieldkey's rule: an atom landed anywhere
  // else declares nothing. Registration is idempotent (the
  // declaration set is a set) and happens at every drive, so
  // whichever pass first sees the atom at its landed position records
  // it.
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
      // The self-drive refines IN PLACE (the MapVal top-peer
      // pattern): a fresh atom per pass changes object identity, so
      // spread apply-once stamps and the entity merge's fast paths
      // stop holding, and the enclosing bags re-open every pass --
      // the service catalog never converged.
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


// D-1 (docs/design/RELATIONS.0.md): the name grammar shared by entity
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
    // quoted, exactly an id()'s argument shape.
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

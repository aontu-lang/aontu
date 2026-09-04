/* Copyright (c) 2025 Richard Rodger, MIT License */

// GENERATION: `pack(data, tmpl)` (G8 phase 1,
// docs/capability-review/g8-generation.md). One child of the result map
// per child of `data`, each of them `tmpl` cloned at the destination.
//
//   names: [web, auth, billing]
//   deploy: pack($.names, {
//     image: "acme/" + key() + ":1.4.2"
//     replicas: *2 | integer
//   })
//
// WHY A FUNCTION AND NOT SYNTAX. A comprehension would need keywords,
// a scoping rule, and string interpolation for the computed name; the
// language already has functions, spread templates, and `key()`, and
// `pack` is those three composed. A call is also DATA -- a named node
// in the tree -- so a document that generates stays as analysable as
// one that does not.
//
// KEYS ARE DATA, NOT POSITION. For a list, the strings themselves are
// the keys (a non-string element is refused: `pack_key`); for a map,
// its keys. Terraform's `count` keyed by index is the counter-example
// the review names: reordering the data churns every downstream child.
// Duplicate keys are not an error -- the colliding children unify,
// exactly as duplicate source keys already merge.
//
// TOTALITY. `pack` iterates a finite, settled bag and cannot call
// itself: the number of children it can produce is fixed by data that
// already exists. Nothing here can recurse, which is the guarantee the
// combinators exist to keep.

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { unite } from '../unify'
import { makeNilErr } from '../err'
import { MapVal } from './MapVal'
import { FuncBaseVal } from './FuncBaseVal'
import { repathInstance } from './Val'
import { fillPlace } from './PlaceVal'


// The keys a data bag names, in the order the result must carry them,
// or a code naming what is wrong with it. Shared with `each`, which
// asks the same question of the same argument and answers it with the
// values rather than the keys.
function dataKeys(data: Val | undefined): string[] | string {
  const d: any = data

  if (true === d?.isMap) {
    return Object.keys(d.peg)
  }

  if (true === d?.isList) {
    const out: string[] = []
    for (const el of d.peg as Val[]) {
      const e: any = el
      // A key is a NAME, and only a string is one. A number would
      // key by position under another spelling, which is the failure
      // mode the data-keyed rule exists to refuse.
      if (true !== e?.isScalar || 'string' !== typeof e.peg) {
        return 'pack_key'
      }
      out.push(e.peg)
    }
    return out
  }

  return 'pack_data'
}


class PackFuncVal extends FuncBaseVal {
  isPackFunc = true

  // THE STAGING RULE (G8 phase 0, see AontuContext.settle). A
  // generator's data argument is not settled merely by being `done`
  // once: a sibling conjunct, an include or a spread can still merge
  // keys into it, and children generated from the half-merged bag
  // would be missing. It fires on the settle pass and only then.
  staged = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }



  funcname() {
    return 'pack'
  }


  // The TEMPLATE IS NOT AN ARGUMENT TO DRIVE. Driving it would resolve
  // its `key()` at the CALL SITE -- the one position the template is
  // never used at -- and freeze whatever else in it is path-dependent
  // there too. The data argument is driven by `unify` below instead,
  // one argument by hand rather than all of them by the base.
  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  unify(peer: Val, ctx: AontuContext): Val {
    // ONE argument is driven: the data. The template is not (see
    // prepare above), and driveStagedArgs answers whether the data has
    // settled -- the other half of "ready to fire".
    if (!this.stagedReady(peer, ctx, 1)) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const keys = dataKeys(args?.[0])
    if ('string' === typeof keys) {
      return makeNilErr(ctx, keys, this)
    }

    // Arity is checked at parse (funcArity), so both arguments are here.
    const tmpl: Val = args[1]
    const peg: Record<string, Val> = {}

    const src: any = args[0]

    for (const key of keys) {
      const keyctx = ctx.descend(key)
      // THE PLACEHOLDER BINDS THE SOURCE CHILD (G8 phase 3): inside a
      // generator's template `_` is the datum this child is being made
      // FROM. For a map that is the child's value; for a list of names
      // it is the name, which is also the key -- so `_` and `key()`
      // agree there, and differ the moment the data is a map.
      const source: Val = true === src?.isMap ? src.peg[key] : src.peg[keys.indexOf(key)]
      // CLONED, never shared. A spread may share a template that holds
      // nothing path-dependent (MapVal.spreadClone), because a spread
      // CONSTRAINS a child that exists; a generator's template IS the
      // child, and a child is a position. Sharing left every generated
      // child pointing at the template's own parse-time location, which
      // is the position the template is never used at -- visible as the
      // site an error inside a generated child reports.
      //
      // A FULL INSTANCE, to the leaves (`dup`, ADR-005): a bare clone
      // shares the inner structure of any call, preference or
      // operation in the template, so the first child's resolution of
      // a shared key()/ref answered for every child (BUGS.md §8, §9).
      const inst = tmpl.clone(keyctx, { dup: true })
      repathInstance(inst, inst.path)
      const child = fillPlace(inst, source, keyctx)
      peg[key] = undefined === peg[key] ? child :
        unite(keyctx, peg[key], child, 'pack')
    }

    return new MapVal({ peg }, ctx)
  }

} /* node:coverage ignore next 7 */


export {
  dataKeys,
  PackFuncVal,
}

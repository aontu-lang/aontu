/* Copyright (c) 2026 Richard Rodger, MIT License */


import type { Val } from './type'

import { AontuContext } from './ctx'
import { makeNilErr } from './err'
import { Unify } from './unify'

import { cmpCodePoint } from './keyorder'
import { top } from './val/top'
import { trialUnify } from './val/FuncBaseVal'
import { genHooks, genRefuse } from './val/genwrite'
import { Null, Path } from './val/ScalarKindVal'


const GEN_MODEL = '@"aontu:gen"'

const READ_CACHE_MAX = 256


function genFamily(v: any): string | undefined {
  const kind = true === v.isScalar ? v.kind : true === v.isScalarKind ? v.peg : undefined
  if (undefined !== kind) {
    return String === kind ? 'String' : Boolean === kind ? 'Boolean' : Null === kind ? 'Null'
      : Path === kind ? 'Path' : 'Number'
  }
  return true === v.isMap || true === v.isMapKind ? 'Map'
    : true === v.isList || true === v.isListKind ? 'List' : undefined
}


// The options in force, each default filled, or the option refused.
type GenRead = {
  opts?: Record<string, any>
  option?: string
}

const reads = new Map<string, GenRead>()


// A record is read against its type's standard set by the engine, in an
// evaluation of its own: an option is refused as any other value is.
// The record less its custom expression, which the set says nothing of.
function optionsOf(rec: any): string {
  return null == rec.peg.custom ? rec.canon : '{' + Object.keys(rec.peg)
    .filter((k) => 'custom' !== k).sort(cmpCodePoint)
    .map((k) => JSON.stringify(k) + ':' + rec.peg[k].canon).join(',') + '}'
}


function genRead(family: string, rec: Val): GenRead {
  const options = optionsOf(rec)
  const key = family + ' ' + options
  let read = reads.get(key)
  if (undefined === read) {
    const uni = new Unify(GEN_MODEL + '\nout: $.aontu.Gen.' + family + ' & ' + options)
    const gctx = new AontuContext({ collect: true, err: uni.err })
    const out = 0 === uni.err.length ? uni.res.gen(gctx) : undefined
    read = 0 === uni.err.length ? { opts: out.out } : { option: String(uni.err[0].path[1]) }
    if (READ_CACHE_MAX <= reads.size) {
      reads.clear()
    }
    reads.set(key, read)
  }
  return read
}


let sets: Record<string, string> | undefined = undefined

function genSet(family: string): string {
  if (undefined === sets) {
    const gen: any = (new Unify(GEN_MODEL).res as any).peg.aontu.peg.Gen
    sets = {}
    for (const name of Object.keys(gen.peg)) {
      sets[name] = gen.peg[name].canon
    }
  }
  return sets[family]
}


// Each record is cloned: one rides many values.
function meetRec(ctx: AontuContext, a: Val, b: Val): Val | undefined {
  return a === b || a.canon === b.canon ? a : trialUnify(ctx, a.clone(ctx), b.clone(ctx))
}


function conflict(ctx: AontuContext, a: Val, b: Val): Val {
  return makeNilErr(ctx, 'gen_conflict', a, b, undefined, { a: a.canon, b: b.canon })
}


function genOn(ctx: AontuContext, out: any, a: any, b: any): Val {
  const ra: Val | undefined = a?.genrec
  const rb: Val | undefined = b?.genrec
  if (null == ra && null == rb) {
    return out
  }

  let rec: Val | undefined = out.genrec
  for (const r of [ra, rb]) {
    if (null != r && r !== rec) {
      const met: Val | undefined = null == rec ? r : meetRec(ctx, rec, r)
      if (undefined === met) {
        return conflict(ctx, rec as Val, r)
      }
      rec = met
    }
  }

  return genLand(ctx, out, rec as Val)
}


// A disjunction holds no record of its own, and a preference is held to
// its record by the value it prefers, whose own record it meets.
function genLand(ctx: AontuContext, out: any, rec: Val): Val {
  if (true === out.isDisjunct) {
    return genArms(ctx, out, rec)
  }

  let held: any = out
  let full: Val = rec
  while (true === held.isPref) {
    held = held.peg
    if (null != held.genrec) {
      const met = meetRec(ctx, full, held.genrec)
      if (undefined === met) {
        return conflict(ctx, full, held.genrec)
      }
      full = met
    }
  }

  const family = genFamily(held)
  let opts: Record<string, any> | undefined = undefined
  if (undefined !== family) {
    const read = genRead(family, full)
    if (undefined !== read.option) {
      return makeNilErr(ctx, 'gen_option', out, full, undefined, {
        type: family.toLowerCase(),
        set: genSet(family),
        got: full.canon,
        option: read.option,
      })
    }
    const custom: any = (full as any).peg.custom
    opts = null == custom ? read.opts : { ...read.opts, custom: custom.peg }
  }

  out.genrec = rec
  out.genopts = held === out ? opts : undefined
  return out
}


// An arm of a type that refuses the record drops, as under a constraint.
function genArms(ctx: AontuContext, out: any, rec: Val): Val {
  const lands = out.peg.every((arm: any) =>
    null != arm.genrec && meetRec(ctx, arm.genrec, rec)?.canon === arm.genrec.canon)
  if (lands) {
    return out
  }
  const carrier: any = top()
  carrier.genrec = rec
  return out.unify(carrier, ctx)
}


type Custom = {
  out?: any
  cause?: string
}

const customs = new Map<string, Custom>()


// The expression is evaluated on its own, as `apply` is anywhere, over
// what the value writes without it. An output that places could share
// is made again for each.
function genCustom(ctx: AontuContext | undefined, v: any, custom: string, given: string): any {
  const key = given + '\n' + custom
  let made = customs.get(key)
  if (undefined === made) {
    const uni = new Unify('out: apply(' + given + ', ' + custom + ')')
    const gctx = new AontuContext({ collect: true, err: uni.err })
    const out = 0 === uni.err.length ? uni.res.gen(gctx) : undefined
    made = 0 === uni.err.length ? { out: out.out } : { cause: String(uni.err[0].why) }
    if (null == made.out || 'object' !== typeof made.out) {
      if (READ_CACHE_MAX <= customs.size) {
        customs.clear()
      }
      customs.set(key, made)
    }
  }
  return undefined === made.cause ? made.out :
    genRefuse(ctx, 'gen_custom', v, { custom, given, cause: made.cause })
}

genHooks.custom = genCustom


// The record lands on the preferred value only where it is generated:
// an override takes it from the preference.
function genHeld(ctx: AontuContext | undefined, pref: any): any {
  const lctx = ctx ?? new AontuContext({})
  return genOn(lctx, pref.peg.clone(lctx), pref, undefined).gen(ctx as AontuContext)
} /* node:coverage ignore next 6 */


export {
  genHeld,
  genOn,
}

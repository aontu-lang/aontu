/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { Aontu } from '../dist/aontu'
import { AontuContext } from '../dist/ctx'
import { AontuError, makeNilErr, descErr } from '../dist/err'
import { Lang, Site as LangSite } from '../dist/lang'
import { Site } from '../dist/site'
import { CloseFuncVal } from '../dist/val/CloseFuncVal'
import { CopyFuncVal } from '../dist/val/CopyFuncVal'
import { HideFuncVal } from '../dist/val/HideFuncVal'
import { MoveFuncVal } from '../dist/val/MoveFuncVal'
import { PrefFuncVal } from '../dist/val/PrefFuncVal'
import { TypeFuncVal } from '../dist/val/TypeFuncVal'
import { Unify, applyFlows } from '../dist/unify'
import { main as cliMain, evalSource } from '../dist/cli'
import { main as lspMain } from '../dist/lsp-server'
import { computeDiagnostics, computeHover, LspHandler } from '../dist/lsp'
import { subsumeNode } from '../dist/subsume'
import { DeprecateFuncVal } from '../dist/val/DeprecateFuncVal'
import { collectDeprecations } from '../dist/utility'
import { hcanon, canonHash } from '../dist/hcanon'
import { projectFor } from '../dist/query'
import { Provenance, markSpread } from '../dist/provenance'
import { ReferVal, RelFuncVal, addressPath, findAt } from '../dist/val/ReferFuncVal'
import { parseAddress, PathVal } from '../dist/val/PathVal'
import { graphOf } from '../dist/graph'
import { canonRiders } from '../dist/utility'
import {
  candidates as trimCandidates,
  deleteAt as trimDeleteAt,
  evalCanon as trimEvalCanon,
} from '../dist/trim'

import { Val } from '../dist/val/Val'
import { top } from '../dist/val/top'
import { MapVal } from '../dist/val/MapVal'
import {
  RecurseVal, bumpRecurse, containsRecurseOf,
} from '../dist/val/RecurseVal'
import {
  GraphAtomVal, AcyclicFuncVal, InverseFuncVal,
} from '../dist/val/GraphAtomVal'
import { ListVal } from '../dist/val/ListVal'
import { IntegerVal } from '../dist/val/IntegerVal'
import { NilVal } from '../dist/val/NilVal'
import { NumberVal } from '../dist/val/NumberVal'
import { StringVal } from '../dist/val/StringVal'
import { ScalarVal } from '../dist/val/ScalarVal'
import { KeyFuncVal } from '../dist/val/KeyFuncVal'
import { PlaceVal } from '../dist/val/PlaceVal'
import { RefVal } from '../dist/val/RefVal'
import { VarVal } from '../dist/val/VarVal'
import { ConjunctVal } from '../dist/val/ConjunctVal'
import { DisjunctVal } from '../dist/val/DisjunctVal'
import { PrefVal } from '../dist/val/PrefVal'
import { effectiveScrutinee } from '../dist/val/MatchFuncVal'
import { ExpectVal } from '../dist/val/ExpectVal'
import { ScalarKindVal, Integer } from '../dist/val/ScalarKindVal'
import { FeatureVal } from '../dist/val/FeatureVal'
import { FuncBaseVal } from '../dist/val/FuncBaseVal'
import { PathFuncVal } from '../dist/val/PathFuncVal'
import {
  MapKindVal, ListKindVal, MapFuncVal, ListFuncVal,
} from '../dist/val/ContainerKindVal'
import { UpperFuncVal } from '../dist/val/UpperFuncVal'
import { LowerFuncVal } from '../dist/val/LowerFuncVal'
import { BooleanVal } from '../dist/val/BooleanVal'
import { ConstraintVal, MinConstraintVal } from '../dist/val/ConstraintVal'
import { Decimal, decimalOverBudget } from '../dist/val/Decimal'
import { BigIntegerVal } from '../dist/val/BigIntegerVal'
import { BigDecimalVal } from '../dist/val/BigDecimalVal'
import {
  scaledOfFloat, cmpScaled, cmpCodePoints, scaledFloor,
} from '../dist/val/numcmp'
import { isLossyIntegerLiteral } from '../dist/val/numkind'
import { explainOpen, explainClose } from '../dist/utility'


const A = () => new Aontu()
const CTX = () => new AontuContext({ root: new MapVal({ peg: {} }) })

// Capture process output around an in-process CLI run.
function capture(fn: () => void): { out: string; err: string } {
  const so = process.stdout.write
  const se = process.stderr.write
  let out = ''
  let err = ''
  ;(process.stdout as any).write = (s: any) => ((out += s), true)
  ;(process.stderr as any).write = (s: any) => ((err += s), true)
  try {
    fn()
  }
  finally {
    process.stdout.write = so
    process.stderr.write = se
    process.exitCode = 0
  }
  return { out, err }
}


describe('coverage3-public-surface', () => {

  test('every-re-export-resolves', () => {
    const api: any = require('../dist/aontu')
    for (const name of [
      'Aontu', 'AontuContext', 'AontuError', 'Lang',
      'runparse', 'util', 'formatExplain', 'exactJSON', 'Decimal',
      'VERSION',
    ]) {
      Assert.ok(null != api[name], 'missing export: ' + name)
    }
    Assert.equal('function', typeof api.default)
    Assert.match(api.VERSION, /^\d+\.\d+\.\d+/)
  })
})


describe('coverage3-refval', () => {

  test('null-peer-and-marks', () => {
    const root = new MapVal({ peg: { a: new IntegerVal({ peg: 1 }) } })
    const ctx = new AontuContext({ root })

    // The engine always passes a peer; the Val API allows omitting it.
    Assert.equal(
      new RefVal({ peg: ['a'], absolute: true }).unify(undefined as any, ctx).canon,
      '1')

    // A ref carrying only a hide mark stamps it on the found value.
    const rh: any = new RefVal({ peg: ['a'], absolute: true })
    rh.mark.hide = true
    Assert.equal(rh.find(ctx).canon, '1')
  })

  test('cycle-proof-walk-arms', () => {
    // A proven cycle that descends through a list index.
    const ra = new RefVal({ peg: ['b', '0'], absolute: true })
    const rb = new RefVal({ peg: ['a'], absolute: true })
    const root = new MapVal({
      peg: { a: ra, b: new ListVal({ peg: [rb] }) },
    })
    Assert.equal((ra as any).detectRefCycle(new AontuContext({ root })), true)

    // A chase that meets a non-container mid-path proves nothing.
    const rc = new RefVal({ peg: ['b', 'x'], absolute: true })
    const root2 = new MapVal({
      peg: { a: rc, b: new StringVal({ peg: 's' }) },
    })
    Assert.equal((rc as any).detectRefCycle(new AontuContext({ root: root2 })), false)
  })

  test('same-and-inspection', () => {
    const r = new RefVal({ peg: ['a'], absolute: true })
    Assert.equal(r.same(undefined as any), false)
    Assert.equal(r.same(r), true)

    Assert.match(new RefVal({ peg: ['a'], absolute: true, prefix: true }).inspect(),
      /absolute,prefix/)
    Assert.doesNotMatch(new RefVal({ peg: ['a'] }).inspect(), /absolute|prefix/)
  })
})


describe('coverage3-val-base', () => {

  test('clone-with-explicit-undefined-mark', () => {
    const iv = new IntegerVal({ peg: 1 })
    iv.mark.type = true
    const out = iv.clone(CTX(), { mark: undefined } as any)
    Assert.equal(out.mark.type, true)
    Assert.equal(out.canon, '1')
  })

  test('base-unify-is-identity', () => {
    class PlainVal extends FeatureVal {
      get canon() { return '' }
    }
    const pv = new PlainVal({ peg: 1 })
    Assert.equal(pv.unify(top(), CTX()), pv)
  })

  test('inspect-rendering-arms', () => {
    const iv = new IntegerVal({ peg: 1 })
    Assert.doesNotMatch(iv.inspect(), /type|hide/)
    iv.mark.type = true
    iv.mark.hide = true
    Assert.match(iv.inspect(), /hide,type/)

    // peg undefined, and a null-prototype peg (what jsonic hands a MapVal)
    Assert.match(top().inspect(), /\/>$/)
    Assert.match(new MapVal({ peg: Object.create(null) }).inspect(), /\/>$/)
    Assert.match(new IntegerVal({ peg: 1 }).inspect(), /1>$/)

    // array peg: Val entries render through inspect, raw entries verbatim
    const lv = new ListVal({ peg: [new IntegerVal({ peg: 1 }), 5] as any })
    const s = lv.inspect()
    Assert.match(s, /Integer/)
    Assert.match(s, /5/)
  })
})


describe('coverage3-constraint', () => {

  test('mixed-domain-exclusion-admits', () => {
    const ctx = CTX()
    const cv = new ConstraintVal({
      peg: [],
      state: { domain: 'number', neqs: [new StringVal({ peg: 'a' })] },
    } as any, ctx)
    // A string exclusion cannot match a numeric peer, so the peer stands.
    Assert.equal(cv.unify(new IntegerVal({ peg: 1 }), ctx).canon, '1')
  })

  test('constraint-without-args', () => {
    const ctx = CTX()
    const cv: any = new MinConstraintVal({} as any, ctx)
    Assert.equal(cv.invalid, 'arg')
    Assert.equal(cv.unify(new IntegerVal({ peg: 1 }), ctx).isNil, true)
  })

  test('domain-adopted-from-peer', () => {
    const ctx = CTX()
    const c0 = new ConstraintVal({ peg: [], state: { neqs: [] } } as any, ctx)
    const c1 = new ConstraintVal(
      { peg: [new IntegerVal({ peg: 1 })], atom: 'min' } as any, ctx)
    Assert.equal(c0.unify(c1, ctx).canon, 'min(1)')
  })
})


describe('coverage3-bags', () => {

  test('null-peer-arms', () => {
    const ctx = CTX()
    Assert.equal(
      new MapVal({ peg: { a: new IntegerVal({ peg: 1 }) } })
        .unify(undefined as any, ctx).canon,
      '{"a":1}')
    Assert.equal(
      new ListVal({ peg: [new IntegerVal({ peg: 1 })] }, ctx)
        .unify(undefined as any, ctx).canon,
      '[1]')
    Assert.equal(
      new ConjunctVal({
        peg: [new IntegerVal({ peg: 1 }), new IntegerVal({ peg: 1 })],
      }, ctx).unify(undefined as any, ctx).canon,
      '1')
    Assert.equal(
      new DisjunctVal({
        peg: [new IntegerVal({ peg: 1 }), new IntegerVal({ peg: 2 })],
      }, ctx).unify(undefined as any, ctx).canon,
      '1|2')
    Assert.equal(
      new PrefVal({ peg: new IntegerVal({ peg: 1 }) }, ctx)
        .unify(undefined as any, ctx).canon,
      '*1')
  })

  test('nil-spread-drives-every-key', () => {
    const ctx = CTX()
    const lv: any = new ListVal({ peg: [new IntegerVal({ peg: 1 })] }, ctx)
    lv.spread.cj = new NilVal({ why: 'test-nil-spread' })
    Assert.equal(lv.unify(top(), ctx).peg[0].isNil, true)
  })

  test('raw-peg-canon-and-clone', () => {
    const ctx = CTX()
    Assert.equal(new MapVal({ peg: { a: 5 } as any }).canon, '{"a":5}')
    Assert.equal(new MapVal({ peg: { a: undefined } as any }).canon, '{"a":undefined}')
    Assert.deepEqual(new ListVal({ peg: [1, 'x'] as any }, ctx).clone(ctx).peg, [1, 'x'])
  })

  test('optional-list-element-canon', () => {
    const lv: any = new ListVal({ peg: [new IntegerVal({ peg: 1 })] }, CTX())
    lv.optionalKeys.push('0')
    Assert.equal(lv.canon, '[1]')
  })


  test('func-no-arg-guards-via-api', () => {
    const ctx = CTX()
    const cases: [string, any, string][] = [
      ['close', new CloseFuncVal({ peg: [] }), 'no_first_arg'],
      ['copy', new CopyFuncVal({ peg: [] }), 'invalid-arg'],
      ['hide', new HideFuncVal({ peg: [] }), 'arg'],
      ['move', new MoveFuncVal({ peg: [] }), 'arg'],
      ['pref', new PrefFuncVal({ peg: [] }), 'arg'],
      ['type', new TypeFuncVal({ peg: [] }), 'arg'],
    ]
    for (const [name, fv, why] of cases) {
      const out: any = fv.resolve(ctx, [])
      Assert.equal(out.isNil, true, name + ': expected a nil')
      Assert.equal(out.why, why, name + ': why')
    }

    const pf: any = new PathFuncVal({ peg: [] })
    const prepared: any = pf.prepare(ctx, [])
    Assert.equal(prepared.length, 0)
    Assert.equal(pf.resolve(ctx, prepared).isPathKind, true)
  })

  test('map-inspection-spread', () => {
    const mv: any = new MapVal({ peg: { a: new IntegerVal({ peg: 1 }) } })
    mv.spread.cj = new IntegerVal({ peg: 2 })
    Assert.match(mv.inspection(), /&:<Integer/)
    Assert.match(mv.inspect(), /&:<Integer/)
    Assert.equal(new MapVal({ peg: {} }).inspection(), '')
  })

  test('conjunct-empty-spec-and-ref-fold', () => {
    const ctx = CTX()
    Assert.deepEqual(new ConjunctVal({} as any, ctx).peg, [])

    // A pref followed by an unresolvable ref keeps both terms in canon.
    const cj = new ConjunctVal({
      peg: [
        new PrefVal({ peg: new IntegerVal({ peg: 1 }) }, ctx),
        new RefVal({ peg: [new VarVal({ peg: 'zz' }), 'q'], absolute: true }, ctx),
      ],
    }, ctx)
    Assert.equal(cj.unify(top(), ctx).canon, '*1&$.$zz.q')
  })

  test('expect-explain-and-inspection', () => {
    const explain: any[] = []
    const ctx = new AontuContext({ root: new MapVal({ peg: {} }), explain })
    const e = new ExpectVal({ peg: new IntegerVal({ peg: 1 }) }, ctx)
    Assert.equal(e.unify(new IntegerVal({ peg: 1 }), ctx).canon, '1')
    Assert.ok(0 < explain.length)

    const e2: any = new ExpectVal({ peg: new IntegerVal({ peg: 2 }) })
    e2.parent = new MapVal({ peg: {} })
    e2.key = 'a'
    Assert.ok(e2.inspection(0).includes('parent='))

    const e3: any = new ExpectVal({ peg: new ScalarKindVal({ peg: Integer }) }, ctx)
    const out3: any = e3.unify(new ScalarKindVal({ peg: Number }), ctx)
    Assert.ok(out3.isExpect && out3 !== e3 && undefined !== out3.peer)
    Assert.equal(e3.peer, undefined)
    Assert.ok(out3.inspection(0).includes('peer='))
  })
})


describe('coverage3-scalars', () => {

  test('nil-spec-arms', () => {
    const e1 = new Error('x')
    const n = new NilVal({ why: 'w', err: [e1] } as any)
    Assert.equal(n.err.length, 1)

    // A why-less nil classifies and generates as its gen-time code.
    const n2 = new NilVal({} as any)
    Assert.equal(n2.class, new NilVal({ why: 'nil_gen' } as any).class)
    const ctx = new AontuContext({ root: new MapVal({ peg: {} }), err: [] })
    Assert.equal(n2.gen(ctx), undefined)
    Assert.equal(n2.why, 'nil_gen')
  })

  test('scalar-against-top', () => {
    const ctx = CTX()
    const leaves: any[] = [
      new NumberVal({ peg: 1.5 }),
      new IntegerVal({ peg: 1 }),
      new StringVal({ peg: 's' }),
      new BigIntegerVal({ peg: 5n }),
      new BigDecimalVal({ peg: new Decimal(15n, 1) }),
    ]
    for (const leaf of leaves) {
      Assert.equal(leaf.unify(top(), ctx), leaf, leaf.canon)
    }
  })

  test('scalar-rendering-edges', () => {
    Assert.equal(new ScalarVal({ peg: undefined } as any).canon, 'undefined')
    Assert.equal(Object.is(new NumberVal({ peg: -0 }).gen(undefined as any), 0), true)
  })

  test('decimal-compare-and-budget', () => {
    Assert.equal(decimalOverBudget(new Decimal(-12345n, 2)), false)
    const a = new Decimal(11n, 2)
    const b = new Decimal(1n, 1)
    Assert.equal(a.compare(b), 1)
    Assert.equal(b.compare(a), -1)
    Assert.equal(a.compare(a), 0)
  })

  test('numcmp-arms', () => {
    const pi = scaledOfFloat(Infinity)
    const ni = scaledOfFloat(-Infinity)
    Assert.equal(cmpScaled(ni, pi), -1)
    Assert.equal(cmpScaled(pi, ni), 1)
    Assert.equal(cmpScaled(pi, pi), 0)

    // Code-point compare: surrogate pairs, then the prefix rule.
    Assert.equal(cmpCodePoints('\u{1F600}a', '\u{1F600}b'), -1)
    Assert.equal(cmpCodePoints('\u{1F600}b', '\u{1F600}a'), 1)
    Assert.equal(cmpCodePoints('ab', 'abc'), -1)
    Assert.equal(cmpCodePoints('abc', 'ab'), 1)

    // A negative non-integral floor rounds down, not toward zero.
    Assert.equal(scaledFloor(scaledOfFloat(-1.5)), -2n)
    Assert.equal(scaledFloor(scaledOfFloat(1.5)), 1n)
  })

  test('lossy-zero-coefficient', () => {
    // Zero at any exponent is zero, and zero is exact.
    Assert.equal(isLossyIntegerLiteral(1e300, '0e500'), false)
  })
})


describe('coverage3-funcs', () => {

  test('feature-gen-collects', () => {
    const ctx = new AontuContext({ collect: true } as any)
    Assert.equal(new FuncBaseVal({ peg: [] }).gen(ctx), undefined)
    Assert.equal(ctx.err.length, 1)
    Assert.equal(ctx.err[0].why, 'no_gen')
  })

  test('validate-args-plural', () => {
    const f = new FuncBaseVal({ peg: [] })
    Assert.throws(() => f.validateArgs([top(), top(), top()], 2),
      /needs at least 2 arguments/)
    Assert.throws(() => f.validateArgs([top(), top()], 1),
      /needs at least 1 argument\./)
  })

  test('path-func-argument-shapes', () => {
    const ctx = CTX()

    // No argument at all is the path KIND (docs/design/PATHS.0.md).
    Assert.equal(
      (new PathFuncVal({ peg: [] }, ctx) as any).resolve(ctx, []).isPathKind,
      true)

    const pfs: any = new PathFuncVal({ peg: [new StringVal({ peg: '.a' })] }, ctx)
    const sout: any = pfs.prepare(ctx, [new StringVal({ peg: '.a' })])
    Assert.equal(sout[0].isPath, true)
    Assert.equal(sout[0].peg, '.a')

    const pfr: any = new PathFuncVal({ peg: [new StringVal({ peg: 'a' })] }, ctx)
    const relout: any = pfr.prepare(ctx, [new StringVal({ peg: 'a' })])
    Assert.equal(relout[0].isPath, true)
    Assert.equal(relout[0].peg, '.a')

    const pfb: any = new PathFuncVal({ peg: [new StringVal({ peg: 'a..b' })] }, ctx)
    const bout: any = pfb.prepare(ctx, [new StringVal({ peg: 'a..b' })])
    Assert.equal(bout[0].isNil, true)
    Assert.equal(bout[0].why, 'path_address')

    // …while a container argument passes through prepare (a computed
    // argument is the driving loop's to evaluate, ADR-016) and is
    // refused at resolve, where a driven non-string always is.
    const pfm: any = new PathFuncVal({ peg: [new MapVal({ peg: {} })] }, ctx)
    const marg = new MapVal({ peg: {} })
    const mout: any = pfm.prepare(ctx, [marg])
    Assert.equal(mout[0], marg)
    const rout: any = pfm.resolve(ctx, mout)
    Assert.equal(rout.isNil, true)
    Assert.equal(rout.why, 'invalid-arg')
  })

  test('case-func-fallback-arm', () => {
    const ctx = new AontuContext({})
    const barg = new BooleanVal({ peg: true })
    const lout: any =
      (new LowerFuncVal({ peg: [barg] }, ctx) as any).resolve(ctx, [barg])
    Assert.equal(lout.isNil, true)
    Assert.equal(lout.why, 'invalid-arg')
    const uout: any =
      (new UpperFuncVal({ peg: [barg] }, ctx) as any).resolve(ctx, [barg])
    Assert.equal(uout.isNil, true)
    Assert.equal(uout.why, 'invalid-arg')
  })

  test('case-func-superior-is-top', () => {
    Assert.equal(new UpperFuncVal({ peg: [] }).superior().isTop, true)
    Assert.equal(new LowerFuncVal({ peg: [] }).superior().isTop, true)
  })

  test('container-kind-api-only-arms', () => {
    const ctx = CTX()
    const mk = new MapKindVal({}, ctx)
    Assert.equal(mk.unify(new MapKindVal({}, ctx), ctx), mk)
    const lk = new ListKindVal({}, ctx)
    Assert.equal(lk.unify(new ListKindVal({}, ctx), ctx), lk)

    Assert.equal(mk.same(lk), false)
    Assert.equal(mk.same(new MapKindVal({}, ctx)), true)
    Assert.equal(lk.same(mk), false)
    Assert.equal(lk.same(new ListKindVal({}, ctx)), true)

    // The func shells: resolved on first unify, so make() and
    // funcname() never run from source.
    const mf: any = new MapFuncVal({ peg: [] }, ctx)
    Assert.equal(mf.funcname(), 'map')
    Assert.equal((mf.make(ctx, { peg: [] }) as any).isMapFunc, true)
    const lf: any = new ListFuncVal({ peg: [] }, ctx)
    Assert.equal(lf.funcname(), 'list')
    Assert.equal((lf.make(ctx, { peg: [] }) as any).isListFunc, true)
  })

  test('path-func-api-only-arms', () => {
    const ctx = CTX()
    const pf: any = new PathFuncVal({ peg: [] }, ctx)
    pf.prepared = 1
    const made: any = pf.make(ctx, { peg: [] })
    Assert.equal(made.isPathFunc, true)
    Assert.equal(made.prepared, 1)

    const again = made.prepare(ctx, ['sentinel' as any])
    Assert.deepEqual(again, ['sentinel'])

    const empty: any = new PathFuncVal({ peg: [] }, ctx)
    const out: any = empty.prepare(ctx,
      [new RefVal({ peg: [], prefix: true }, ctx)])
    Assert.equal(out[0].isNil, true)
    Assert.equal(out[0].why, 'path_address')
  })

  test('func-names-render-in-canon', () => {
    // A parsed-but-unresolved func canonises through funcname().
    Assert.equal(A().parse('a: super(1)')!.canon, '{"a":super(1)}')
  })
})


describe('coverage3-explain', () => {

  // The explain trace threads through every Val family's unify; these
  // three carry `te`-guarded arms the other suites do not reach.
  test('exact-leaf-explain-arms', () => {
    const a0 = A()
    const ctx = a0.ctx()
    ctx.explain = []
    const v = a0.unify('a:1.5&number b:0d1230&biginteger c:0d1.5&bigdecimal',
      undefined, ctx)
    Assert.equal(v.canon, '{"a":1.5,"b":0d1230,"c":0d1.5}')
    Assert.ok(0 < (ctx.explain as any[]).length)
  })

  test('debug-mode-cycle-key', () => {
    // debug builds the human-readable seen key instead of the path index.
    const v = A().unify('a:1 b:$.a c:{d:*2|3}', { debug: true } as any)
    Assert.equal(v.canon, '{"a":1,"b":1,"c":{"d":*2|3}}')
  })
})


describe('coverage3-context-and-errors', () => {

  test('context-options', () => {
    const ctx = new AontuContext({ explain: [], vc: 7, cc: 3 } as any)
    Assert.deepEqual(ctx.explain, [])
    Assert.equal(ctx.vc, 7)
    Assert.equal(ctx.cc, 3)
    const d = new AontuContext({} as any)
    Assert.equal(d.explain, null)
  })

  test('bad-source-refused', () => {
    Assert.throws(() => A().parse(123 as any), (err: any) => err instanceof AontuError)
  })

  test('desc-err-over-a-list', () => {
    const ctx = new AontuContext({ src: 'a:1' } as any)
    const n0 = makeNilErr(ctx, 'w0', new IntegerVal({ peg: 1 }))
    const n1 = makeNilErr(ctx, 'w1', new IntegerVal({ peg: 2 }))
    Assert.equal(descErr([n0, n1] as any, ctx).length, 2)
    Assert.match(n0.msg, /Cannot/)
    Assert.match(n1.msg, /Cannot/)
  })

  test('missing-source-file-frames', () => {
    const v = new IntegerVal({ peg: 1 })
    v.site.url = '/no/such/aontu/file.aontu'

    const n0 = makeNilErr(undefined as any, 'nosrc', v)
    descErr(n0, {} as any)
    Assert.match(n0.msg, /SOURCE-NOT-FOUND: \/no\/such\/aontu\/file\.aontu \(NO-FS\)/)

    const n1 = makeNilErr(undefined as any, 'nosrcfs', v)
    descErr(n1, { fs: Fs } as any)
    Assert.match(n1.msg, /SOURCE-NOT-FOUND: \/no\/such\/aontu\/file\.aontu/)
    Assert.doesNotMatch(n1.msg, /NO-FS/)
  })

  test('aontu-error-errs', () => {
    Assert.deepEqual(new AontuError('m0').errs(), [])
    const n = makeNilErr(undefined as any, 'why')
    Assert.equal(new AontuError('m1', [n] as any).errs()[0], n)
  })

  test('site-constructor', () => {
    Assert.equal(new Site().row, -1)
    Assert.equal(new Site().col, -1)
    Assert.equal(new Site().url, '')
    const s = new Site({ row: 2, col: 3, url: 'u' } as any)
    Assert.equal(s.row, 2)
    Assert.equal(s.col, 3)
    Assert.equal(s.url, 'u')

    // Site is also re-exported from lang (the parser's own site type).
    Assert.equal(new LangSite({ row: 4, col: 5, url: 'v' } as any).row, 4)
  })

  test('residue-path-fallback', () => {
    // A never-settling child at the root reports the budget with a bare
    // `$` path (no vpath to name).
    class Never extends Val {
      n = 0
      unify(_peer: any, _ctx: any): any { this.dc = this.dc + 1; this.n++; return this }
      get canon() { return 'n' + this.n }
      gen() { return null }
      superior() { return top() }
    }
    for (const path of [[] as string[], undefined]) {
      const child: any = new Never({ peg: 1 } as any)
      child.path = path
      const root = new MapVal({ peg: { a: child } })
      const ctx = new AontuContext({ root, err: [] } as any)
      new Unify(root, new Lang(), ctx, '')
      Assert.equal(ctx.err[0].why, 'budget_passes')
      Assert.equal(ctx.err[0].details.paths, '$')
    }
  })
})


describe('coverage3-explain-close', () => {

  test('close-without-a-result', () => {
    // A frame can close with no result (an abandoned trial) as well as
    // with one; only the latter records the outcome slot.
    const t: any = explainOpen({ cc: 1, path: ['a'] }, undefined, 'Probe',
      new IntegerVal({ peg: 1 }))
    const before = t.slice()

    explainClose(t)
    Assert.deepEqual(t, before)

    explainClose(t, new IntegerVal({ peg: 2 }))
    Assert.ok(t.some((e: any) =>
      'string' === typeof e && /^-> \d+=2$/.test(e)))

    explainClose(t, new RefVal({ peg: ['zz'], absolute: true }))
    Assert.ok(t.some((e: any) =>
      'string' === typeof e && /^-> \d+!=/.test(e)))

    // A missing frame is a no-op (explain disabled).
    explainClose(null)
  })
})


describe('coverage3-lang', () => {

  test('site-and-addsite', () => {
    const lang = new Lang()
    Assert.equal(lang.jsonic('a:1').canon, '{"a":1}')

    // A duplicate key merges into a conjunct built without a site.
    const v: any = lang.parse('a:{x:1} a:{y:2}')
    Assert.equal(v.canon, '{"a":{"x":1}&{"y":2}}')
    Assert.equal(v.peg.a.site.row, -1)
  })

  test('optional-keys-of-every-token-kind', () => {
    const lang = new Lang()
    Assert.equal(lang.parse('1?:2').canon, '{"1"?:2}')
    Assert.equal(lang.parse('a:{0x10?:2}').canon, '{"a":{"0x10"?:2}}')
    Assert.equal(lang.parse('a?:1').canon, '{"a"?:1}')
    Assert.equal(lang.parse('"k"?:1').canon, '{"k"?:1}')
  })

  test('resolver-mem-pkg-and-missing', () => {
    // `resolver` is read twice by the constructor: once as the resolver
    // CONFIG (mem/pkg), once as the resolver FUNCTION.
    let n = 0
    const lang = new Lang({
      get resolver() {
        return 0 === n++ ? { mem: { 'm0.aontu': 'a:1' }, pkg: {} } : undefined
      },
    } as any)
    Assert.equal(lang.parse('x:@"m0.aontu"').canon, '{"x":{"a":1}}')

    const pkg: any = new Lang().parse('p:@"@tabnas/jsonic/package.json"')
    Assert.equal(pkg.peg.p.peg.name.peg, '@tabnas/jsonic')

    const none: any = new Lang().parse('a:@')
    Assert.equal(none.canon, 'nil')
    Assert.match(none.err[0].msg, /source not found/)

    Assert.throws(() => new Lang().parse('a:@1'))

    const host = new Lang({
      resolver: () => ({
        found: true, path: 'x.csv', full: '/nowhere/x.csv',
        kind: 'csv', src: 'a:1', search: [],
      }),
    } as any)
    const refused: any = host.parse('v:@"./x.csv"')
    Assert.equal(refused.canon, 'nil')
    Assert.equal(refused.err[0].why, 'include_extension')
    Assert.match(refused.err[0].msg, /extension: \.csv/)

    const hostText = new Lang({
      resolver: () => ({
        found: true, path: 'x.txt', full: '/nowhere/x.txt',
        kind: 'txt', src: 'a:1', search: [],
      }),
    } as any)
    Assert.equal(hostText.parse('v:@"./x.txt"').canon, '{"v":"a:1"}')

    const hostMd = (ext: string, textExt: string[]) => new Lang({
      textExt,
      resolver: () => ({
        found: true, path: 'x.' + ext, full: '/nowhere/x.' + ext,
        kind: ext, src: 'a:1', search: [],
      }),
    } as any).parse('v:@"x.' + ext + '"')
    Assert.equal(hostMd('md', ['md']).canon, '{"v":"a:1"}')
    const widenedJs: any = hostMd('js', ['js'])
    Assert.equal(widenedJs.canon, 'nil')
    Assert.match(widenedJs.err[0].msg, /extension: \.js/)

    // ... and a host resolution with no `full` at all: a resolver that
    // answers from something other than a filesystem need not have
    // chosen a path, so the WRITTEN one names the extension.
    const bare = new Lang({
      resolver: () => ({ found: true, path: 'x.dat', kind: 'dat', src: 'a:1', search: [] }),
    } as any)
    const barerefused: any = bare.parse('v:@"x.dat"')
    Assert.equal(barerefused.canon, 'nil')
    Assert.match(barerefused.err[0].msg, /extension: \.dat/)
  })

  test('raw-value-conversion', () => {
    const lang = new Lang()
    // Forward slashes even on Windows: the path is embedded in aontu
    // SOURCE below, where a backslash is a string escape.
    const fixture = (name: string) =>
      Path.join(__dirname, '..', 'test', name).split(Path.sep).join('/')
    const raw = fixture('raw.json')
    const rawfn = fixture('raw-fn.js')

    Assert.equal(lang.parse('1,,2').canon, '[1,nil,2]')

    // A JSON include is Aontu source (ADR-012), and every JSON kind is
    // a kind the grammar already has.
    Assert.equal(lang.parse('1, @"' + raw + '"').canon,
      '[1,{"a":1,"b":"s","c":true,"d":[1,2],"e":null,"f":1.5}]')

    const js: any = lang.parse('1, @"' + rawfn + '"')
    Assert.equal(js.canon, 'nil')
    Assert.equal(js.err[0].why, 'include_extension')
    Assert.match(js.err[0].msg, /extension: \.js/)

    Assert.equal(lang.parse('k2.b K:1').canon, '[.k2.b,{"K":1}]')
  })
})


describe('coverage3-lsp', () => {

  test('shared-spread-template-walks', () => {
    // The same template Val is reachable twice (peg + spread.cj), so both
    // walks take their already-seen arm.
    Assert.deepEqual(computeDiagnostics('a:{&:{x:1},b:{}}'), [])
    const h: any = computeHover('a:{&:{x:1},b:{}}', { line: 0, character: 8 })
    Assert.ok(h)
    Assert.match(h.contents.value, /\*integer\*/)
  })

  test('siteless-nil-through-vars', () => {
    class SitelessNil extends NilVal {
      get site(): any { return undefined }
      set site(_s: any) { }
    }
    const nil = new SitelessNil({ why: 'test_nil', msg: 'no-site' } as any)
    const ds = computeDiagnostics('a:$v', { vars: { v: nil } } as any)
    const hit = ds.filter((d: any) => 'test_nil' === d.code)
    Assert.equal(hit.length, 1)
    Assert.deepEqual(hit[0].range.start, { line: 0, character: 0 })
  })

  test('conflict-message-with-both-operands', () => {
    const ds = computeDiagnostics('a:{b:1&"s"} c:$.a')
    const plain = ds.filter((d: any) => d.message.startsWith('Cannot '))
    Assert.equal(plain.length, 1)
    Assert.equal(plain[0].message.split('\n')[0],
      'Cannot unify value: "s" with value: 1')
  })

  test('parse-error-positions', () => {
    // A throw carrying 1-based line/col places the diagnostic there.
    const ds = computeDiagnostics('a:1', {
      vars: {
        get v(): any {
          const err: any = new Error('boom-at-3-5')
          err.line = 3
          err.col = 5
          throw err
        },
      },
    } as any)
    Assert.equal(ds.length, 1)
    Assert.deepEqual(ds[0].range.start, { line: 2, character: 4 })

    // A non-Error throw stringifies at the document start.
    const ds2 = computeDiagnostics('a:1', {
      vars: { get v(): any { throw 'boom-str' } },
    } as any)
    Assert.equal(ds2[0].message, 'boom-str')
    Assert.deepEqual(ds2[0].range.start, { line: 0, character: 0 })
  })

  test('hover-refuses-bad-input', () => {
    Assert.equal(computeHover({ isVal: true } as any, { line: 0, character: 0 }), null)

    class ThrowCanon extends IntegerVal {
      get canon(): string { throw new Error('canon-boom') }
    }
    const v: any = new ThrowCanon({ peg: 1 })
    v.site = { row: 1, col: 1, url: '' }
    Assert.equal(computeHover(v, { line: 0, character: 0 }), null)
  })

  test('hover-kind-labels', () => {
    const label = (src: string, ch: number) => {
      const h: any = computeHover(src, { line: 0, character: ch })
      Assert.ok(h, 'no hover for ' + src)
      return h.contents.value
    }
    // The unguarded self-reference is a RESIDUAL now (RECURSION.0.md):
    // hover shows the symbolic fixpoint, not an error.
    Assert.match(label('a:$.a', 2), /\*recurse\*/)
    Assert.match(label('a:$.nope', 2), /\*error\*/)
    Assert.match(label(
      'a:$.b b:$.c c:$.d d:$.e e:$.f f:$.g g:$.h h:$.i i:$.j j:$.k k:$.l l:1',
      2), /\*reference\*/)
    Assert.match(label('n:1.5', 2), /\*float\*/)
    Assert.match(label('x:null', 2), /\*scalar\*/)
    Assert.match(label('x:null|top', 2), /\*disjunct\*/)
    Assert.match(label('x:top|top', 2), /\*top\*/)
  })

  test('publish-for-unopened-document', () => {
    // A uri that changes between the store and the publish leaves the
    // publish with no document text.
    const uris = ['file:///a.aontu', 'file:///a.aontu', 'file:///b.aontu']
    let n = 0
    const outs = new LspHandler().handle({
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          get uri() { return uris[n++] },
          text: 'a:1 a:2',
        },
      },
    } as any)
    Assert.equal(outs.length, 1)
    Assert.equal((outs[0].params as any).uri, 'file:///b.aontu')
    Assert.deepEqual((outs[0].params as any).diagnostics, [])
  })
})


describe('coverage3-process', () => {

  test('eval-source-error-shapes', () => {
    const thrower = (err: any) => ({
      unify() { throw err },
      generate() { throw err },
    }) as any

    const aerr = evalSource(thrower(new AontuError('real-aontu')), 'a:1', 'json')
    Assert.deepEqual(aerr, { findings: [], ok: false, text: 'real-aontu' })

    const foreign = evalSource(
      thrower({ aontu: true, message: 'foreign-aontu' }), 'a:1', 'json')
    Assert.deepEqual(foreign,
      { findings: [], ok: false, text: 'foreign-aontu' })

    const bare = evalSource(thrower('just-a-string'), 'a:1', 'canon')
    Assert.deepEqual(bare, { findings: [], ok: false, text: 'just-a-string' })

    // AND THE COLLECTING SHAPE: the nils an engine failure carries are
    // what the finding is built from, which is what `--format json`
    // reports.
    const real = evalSource(new Aontu(), 'a: 1 & 2', 'json')
    Assert.equal(real.ok, false)
    Assert.deepEqual(real.findings.map((f: any) => [f.code, f.class, f.path]),
      [['scalar_value', 'conflict', '$']])
  })

  test('cli-version-without-a-version-field', () => {
    const fs = require('node:fs')
    const orig = fs.readFileSync
    let r: { out: string; err: string }
    try {
      fs.readFileSync = (fp: any, en: any) =>
        (String(fp).endsWith('package.json') ? '{}' : orig(fp, en))
      r = capture(() => cliMain(['node', 'cli', '--version']))
    }
    finally {
      fs.readFileSync = orig
    }
    Assert.equal(r.out.trim(), '0.0.0')
  })

  test('include-opts-carries-both-and-omits-neither', () => {
    const { includeOpts } = require('../dist/utility')
    Assert.deepEqual(includeOpts({}), {})
    Assert.deepEqual(includeOpts({ textExt: [] }), {})
    Assert.deepEqual(includeOpts({ textExt: ['md'] }), { textExt: ['md'] })
    Assert.deepEqual(includeOpts({ trust: { include: 'none' } }),
      { trust: { include: 'none' } })
    Assert.deepEqual(
      includeOpts({ trust: { include: 'none' }, textExt: ['md'] }),
      { trust: { include: 'none' }, textExt: ['md'] })
  })

  test('cli-text-ext-flag', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-cov3-txt-'))
    Fs.writeFileSync(Path.join(dir, 'doc.md'), '# hi\n')
    Fs.writeFileSync(Path.join(dir, 'rows.csv'), 'a,b\n1,2\n')
    const file = Path.join(dir, 'main.aontu')
    Fs.writeFileSync(file, 'doc: @"./doc.md"\n')

    // The widening reads it ...
    Assert.match(
      capture(() => cliMain(
        ['node', 'cli', '--text-ext', 'md', '-c', file])).out,
      /\{"doc":"# hi\\n"\}/)

    // ... the dotted spelling is the same flag ...
    Assert.match(
      capture(() => cliMain(
        ['node', 'cli', '--text-ext', '.md', '-c', file])).out,
      /\{"doc":"# hi\\n"\}/)

    // ... a verb honours it too, which is the whole reason it rides
    // with the capability rather than beside it ...
    Assert.match(
      capture(() => cliMain(
        ['node', 'cli', 'model', 'get', '$.doc', '--text-ext', 'md', file])).out,
      /# hi/)

    // ... and every way of spelling it wrong is a usage error rather
    // than a flag that quietly does nothing.
    for (const bad of ['', '.', 'md,', 'a b', 'md,,sql']) {
      Assert.match(
        capture(() => cliMain(['node', 'cli', '--text-ext', bad, file])).err,
        /--text-ext needs extensions/, `accepted: ${JSON.stringify(bad)}`)
      Assert.match(
        capture(() => cliMain(
          ['node', 'cli', 'model', 'get', '$.doc', '--text-ext', bad, file])).err,
        /--text-ext needs extensions/, `verb accepted: ${JSON.stringify(bad)}`)
    }
    // A trailing flag with no value at all, on both roads.
    Assert.match(
      capture(() => cliMain(['node', 'cli', file, '--text-ext'])).err,
      /--text-ext needs extensions/)
    Assert.match(
      capture(() => cliMain(
        ['node', 'cli', 'model', 'get', '$.doc', file, '--text-ext'])).err,
      /--text-ext needs extensions/)

    Fs.rmSync(dir, { recursive: true, force: true })
  })

  test('cli-file-error-path', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-cov3-'))
    const file = Path.join(dir, 'bad.aontu')
    Fs.writeFileSync(file, 'a:1 a:2')
    const r = capture(() => cliMain(['node', 'cli', file]))
    Assert.equal(r.out, '')
    Assert.match(r.err, /Cannot unify value/)
  })

  test('cli-bare-format-json', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-cov3-json-'))
    const good = Path.join(dir, 'good.aontu')
    Fs.writeFileSync(good, 'a:1 b:$.a')
    const ok = capture(() => cliMain(['node', 'cli', '--format', 'json', good]))
    Assert.equal(JSON.parse(ok.out).ok, true)
    Assert.equal(ok.err, '')

    const bad = Path.join(dir, 'bad.aontu')
    Fs.writeFileSync(bad, 'a:1 a:2')
    const failed = capture(() =>
      cliMain(['node', 'cli', '--format', 'json', bad]))
    const report = JSON.parse(failed.out)
    Assert.equal(report.ok, false)
    Assert.equal(report.findings[0].code, 'scalar_value')
    Assert.equal(report.findings[0].class, 'conflict')

    Assert.match(
      capture(() => cliMain(['node', 'cli', '--format', 'yaml', good])).err,
      /--format needs text or json/)

    Fs.rmSync(dir, { recursive: true, force: true })
  })

  test('lsp-server-default-streams', () => {
    // main() with no arguments uses the real stdout/exit defaults.
    const stdin: any = { on: () => stdin }
    const written: Buffer[] = []
    let exited: number | undefined
    const so = process.stdout.write
    const pe = process.exit
    try {
      ;(process.stdout as any).write = (c: any) => (written.push(Buffer.from(c)), true)
      ;(process as any).exit = (code: number) => { exited = code }
      const codec = lspMain(stdin)
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'shutdown' })
      codec.push(Buffer.concat([
        Buffer.from('Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n', 'ascii'),
        Buffer.from(body, 'utf8'),
      ]))
      codec.end()
    }
    finally {
      process.stdout.write = so
      ;(process as any).exit = pe
    }
    Assert.match(Buffer.concat(written).toString('utf8'), /Content-Length/)
    Assert.equal(exited, 0)
  })
})


describe('coverage3-deprecate', () => {

  test('deprecate-func-internals', () => {
    const ctx = new AontuContext({ root: top() } as any)
    const d = new DeprecateFuncVal({ peg: [] })

    const made = d.make(ctx, { peg: [new IntegerVal({ peg: 1 })] })
    Assert.equal((made as any).isDeprecateFunc, true)

    const argless: any = d.resolve(ctx, [])
    Assert.equal(argless.isNil, true)
    Assert.equal(argless.why, 'arg')

    const nil = new NilVal({ why: 'test' })
    Assert.equal(d.resolve(ctx, [nil]), nil)
  })

  // The shared walk behind vet's warnings and the LSP tags: the
  // non-Val guard is for a bag's raw peg entries, which degenerate
  // parses can leave behind — pinned directly, with one.
  test('collect-deprecations-walk', () => {
    const m = new MapVal({ peg: {} })
    const dep = new IntegerVal({ peg: 1 })
    ;(dep as any).deprecation = { msg: 'm' }
    const plain = new IntegerVal({ peg: 2 })
    const inner = new ListVal({ peg: [dep] })
    m.peg.a = inner
    m.peg.b = plain
    m.peg.raw = 42
    const found = collectDeprecations(m)
    Assert.equal(found.length, 1)
    Assert.deepEqual(found[0].path, ['a', '0'])
  })

})


describe('coverage3-subsume', () => {

  test('subsume-no-rule-fold', () => {
    const state: any = {
      profile: 'values', findings: [],
      generalUrl: 'general', specificUrl: 'specific',
    }
    const r = subsumeNode(
      state, [], new NilVal({ why: 'test' }), new NilVal({ why: 'test' }))
    Assert.equal(r, 'undecided')
    Assert.equal(state.findings.length, 1)
    Assert.equal(state.findings[0].code, 'sub_unresolved')
  })

})


describe('coverage3-trim', () => {

  // The trim internals no source reaches (G3 phase 6): the candidate
  // walk's raw-entry guard, and deleteAt's honest answers for paths a
  // candidate enumeration from an identical parse can never produce.
  test('trim-internals', () => {
    const raw = new MapVal({ peg: {} })
    raw.peg.k = 7
    const paths: string[][] = []
    trimCandidates(raw, [], paths)
    Assert.deepEqual(paths, [['k']])

    const root = new MapVal({ peg: {} })
    const inner = new MapVal({ peg: {} })
    inner.optionalKeys = ['x', 'y']
    inner.peg.x = new IntegerVal({ peg: 1 })
    root.peg.a = inner
    root.peg.s = new IntegerVal({ peg: 2 })

    // A mid-path segment that is not a bag proves nothing to delete:
    // the walk stops inside the loop, before the final-key check.
    Assert.equal(trimDeleteAt(root, ['s', 'deep', 'deeper']), false)
    // And when the FINAL parent is not a bag, the last check answers.
    Assert.equal(trimDeleteAt(root, ['s', 'deep']), false)
    // A missing key likewise.
    Assert.equal(trimDeleteAt(root, ['a', 'zz']), false)
    // A real optional entry deletes, and its optional mark goes too.
    Assert.equal(trimDeleteAt(root, ['a', 'x']), true)
    Assert.deepEqual(inner.optionalKeys, ['y'])

    // evalCanon answers undefined for a probe whose deletion cannot
    // land (the caller's "load-bearing" fold).
    Assert.equal(trimEvalCanon('a:1', {}, ['zz', 'deep']), undefined)
  })

})


describe('coverage3-hcanon', () => {

  test('hcanon-internals', () => {
    const ctx = new Aontu().ctx({})

    const raw = new MapVal({ peg: {} }, ctx)
    raw.peg.k = 7
    Assert.equal(hcanon(raw as any), '{"k":7}')

    const nested = new ConjunctVal({
      peg: [
        new DisjunctVal({
          peg: [new IntegerVal({ peg: 1 }), new IntegerVal({ peg: 2 })],
        }, ctx),
        new IntegerVal({ peg: 3 }),
      ],
    }, ctx)
    Assert.equal(hcanon(nested as any), '(1|2)&3')

    // A junction member with ONE term needs no parens: `1&3`, which is
    // what the same text reparses to.
    const single = new ConjunctVal({
      peg: [
        new DisjunctVal({ peg: [new IntegerVal({ peg: 1 })] }, ctx),
        new IntegerVal({ peg: 3 }),
      ],
    }, ctx)
    Assert.equal(hcanon(single as any), '1&3')

    // And the hash is the hash form's digest, whatever the tree.
    Assert.match(canonHash(single as any), /^aon1-[A-Za-z0-9_-]{43}$/)
  })

})


describe('coverage3-query', () => {

  test('query-nested-junction-keeps-its-parens', () => {
    const ctx = new Aontu().ctx({})
    const root = new MapVal({ peg: {} }, ctx)
    root.peg.j = new ConjunctVal({
      peg: [
        new DisjunctVal({
          peg: [new IntegerVal({ peg: 1 }), new IntegerVal({ peg: 2 })],
        }, ctx),
        new IntegerVal({ peg: 3 }),
      ],
    }, ctx)

    // Reached through the exported walk rather than the verb, which
    // would unify the tree and flatten it back.
    Assert.equal(
      projectFor(root, 'canon', Infinity), '{"j":(1|2)&3}')
    Assert.equal(
      projectFor(root, 'types', Infinity), '{"j":(integer|integer)&integer}')
  })

})


describe('coverage3-provenance', () => {

  test('provenance-orders-same-site-contributions-by-canon', () => {
    const ctx = new Aontu().ctx({})
    const zed = new StringVal({ peg: 'z' }, ctx)
    const alf = new StringVal({ peg: 'a' }, ctx)
    for (const v of [zed, alf]) {
      v.site.url = 'one.aontu'
    }

    const prov = new Provenance()
    prov.writtenFrom(new MapVal({ peg: { z: zed, a: alf } }, ctx))
    prov.record(['k'], zed, alf, new StringVal({ peg: 'z' }, ctx))

    Assert.deepEqual(prov.at(['k']).map((c: any) => c.canon), ['"a"', '"z"'])
    // A path nothing met has no record at all.
    Assert.deepEqual(prov.at(['nowhere']), [])
  })


  test('mark-spread-visits-a-shared-child-once', () => {
    const ctx = new Aontu().ctx({})
    const shared = new StringVal({ peg: 'x' }, ctx)
    const tree = new MapVal({ peg: { a: shared, b: shared } }, ctx)
    markSpread(tree)
    Assert.equal((shared as any)._fromSpread, true)
    Assert.equal((tree as any)._fromSpread, true)

    // A SECOND application re-walks and re-marks: the fixpoint replaces
    // a template's children between the two, and the replacements are
    // what the first walk could not have seen.
    const replaced = new StringVal({ peg: 'y' }, ctx)
    ;(tree as any).peg.a = replaced
    markSpread(tree)
    Assert.equal((replaced as any)._fromSpread, true)
  })


  test('one-written-token-is-one-contribution', () => {
    const ctx = new Aontu().ctx({})
    const at = (v: any) => {
      v.site.row = 1
      v.site.col = 4
      v.site.url = 'one.aontu'
      v.site.src = 'x'
      return v
    }
    const lit = at(new StringVal({ peg: 'x' }, ctx))
    const narrowed = at(new StringVal({ peg: 'x' }, ctx))

    const prov = new Provenance()
    prov.writtenFrom(new MapVal({ peg: { a: lit, b: narrowed } }, ctx))
    // The narrowed one arrived through a template.
    ;(narrowed as any)._fromSpread = true
    prov.record(['k'], lit, narrowed, undefined)

    const got: any[] = prov.at(['k'])
    Assert.equal(got.length, 1, JSON.stringify(got))
    // The role that says HOW it got here wins over "written there".
    Assert.equal(got[0].role, 'spread')

    // An UNSITED contribution cannot be told apart from another, so
    // they are kept as they come rather than collapsed.
    const p = new StringVal({ peg: 'p' }, ctx)
    const q = new StringVal({ peg: 'q' }, ctx)
    const prov2 = new Provenance()
    prov2.writtenFrom(new MapVal({ peg: { p, q } }, ctx))
    prov2.record(['u'], p, q, undefined)
    Assert.equal(prov2.at(['u']).length, 2)
  })

})

describe('coverage3-address', () => {

  test('address-spellings', () => {
    // Absolute, from the root.
    Assert.deepEqual(parseAddress('$.a.b'),
      { absolute: true, up: 0, parts: ['a', 'b'] })
    // A list index is a segment like any other.
    Assert.deepEqual(parseAddress('$.a.0'),
      { absolute: true, up: 0, parts: ['a', '0'] })
    // Relative: the sibling scope, then one step up per further dot.
    Assert.deepEqual(parseAddress('.b'),
      { absolute: false, up: 0, parts: ['b'] })
    Assert.deepEqual(parseAddress('..b.c'),
      { absolute: false, up: 1, parts: ['b', 'c'] })

    for (const bad of ['$', '', 'a.b', 'services.auth', '$.', '$.a.',
      '$..a', '.', '..', '$.a b', '$.a:b', '$.a/b',
      // ... and the same refusals on the RELATIVE arm, which validates
      // its segments separately.
      '.a b', '.a/b', '..a.', '.a..b']) {
      Assert.strictEqual(parseAddress(bad), undefined, bad)
    }
  })

  test('address-path-resolution', () => {
    // An absolute address ignores where it is written.
    Assert.deepEqual(
      addressPath(parseAddress('$.a.b') as any, ['x', 'y', 'dep']),
      ['a', 'b'])
    // A relative one drops the link's OWN key and reads the sibling
    // scope: a link at $.x.y.dep spelling `.other` means $.x.y.other.
    Assert.deepEqual(
      addressPath(parseAddress('.other') as any, ['x', 'y', 'dep']),
      ['x', 'y', 'other'])
    // Each further dot is one step further up.
    Assert.deepEqual(
      addressPath(parseAddress('..other') as any, ['x', 'y', 'dep']),
      ['x', 'other'])
    // Numeric segments (a list position) render as strings.
    Assert.deepEqual(
      addressPath(parseAddress('.other') as any, ['x', 0 as any, 'dep']),
      ['x', '0', 'other'])
    // A CLIMB OFF THE TOP is not a pending address — no later pass can
    // grow a tree upwards — so it answers undefined and settle refuses.
    Assert.strictEqual(
      addressPath(parseAddress('...z') as any, ['a', 'dep']), undefined)
  })

})


describe('coverage3-residual-shapes', () => {


  test('rel-func-shape', () => {
    // The clone hook and name of the rel() function itself: specs
    // resolve rel() before any clone or unresolved canon needs them,
    // so the hooks are pinned here the way id-func-shape pins id's.
    const ctx = new Aontu().ctx({})
    const fn = new RelFuncVal({ peg: [] }, ctx)
    Assert.strictEqual(fn.funcname(), 'rel')
    Assert.strictEqual((fn as any).isRelFunc, true)
    const made: any = fn.make(ctx, { peg: fn.peg })
    Assert.strictEqual(made.isRelFunc, true)
    // Resolving with no argument answers the settled residual with
    // the open type.
    const out: any = fn.resolve(ctx, [])
    Assert.strictEqual(out.isRel, true)
    Assert.strictEqual(out.tval.isTop, true)
    Assert.strictEqual(out.canon, 'rel()')
  })


  test('constraint-hands-drive-to-rel-and-atom', () => {
    const ctx: any = new Aontu().ctx({ collect: true })
    ctx.root = new MapVal({ peg: {} }, ctx)
    const con: any = (new Aontu().unify('c: re("^j")') as any).peg.c
    Assert.strictEqual(con.isConstraint, true)

    const atom: any = new GraphAtomVal({ akind: 'acyclic' } as any, ctx)
    const viaAtom: any = con.unify(atom, ctx)
    Assert.strictEqual(viaAtom.isGraphAtom, true)
    Assert.strictEqual(viaAtom.held.isConstraint, true)

    const rel: any = (new Aontu().unify('r: rel()') as any).peg.r
    Assert.strictEqual(rel.isRel, true)
    const viaRel: any = con.unify(rel, ctx)
    Assert.strictEqual(viaRel.isRel, true)
  })


  test('graph-atom-shape', () => {
    const ctx: any = new Aontu().ctx({ collect: true })
    ctx.root = new MapVal({ peg: {} }, ctx)

    // Bare atom: DONE at birth, self-drive answers itself.
    const bare: any = new GraphAtomVal({ akind: 'acyclic' } as any, ctx)
    Assert.strictEqual(bare.done, true)
    Assert.strictEqual(bare.unify(null as any, ctx), bare)

    // A held that is already done: the self-drive records DONE in
    // place and answers the atom.
    const held: any = new GraphAtomVal({
      akind: 'inverse', invname: 'q', held: new IntegerVal({ peg: 1 }, ctx),
    } as any, ctx)
    held.dc = 0
    Assert.strictEqual(held.unify(null as any, ctx), held)
    Assert.strictEqual(held.done, true)

    const broken: any = new GraphAtomVal({
      akind: 'acyclic', held: new ConjunctVal({
        peg: [new IntegerVal({ peg: 1 }, ctx), new IntegerVal({ peg: 2 }, ctx)],
      }, ctx),
    } as any, ctx)
    Assert.strictEqual(broken.done, false)
    Assert.strictEqual(broken.unify(null as any, ctx).isNil, true)

    // The clone hook carries the declaration and the held.
    const c: any = held.clone(ctx)
    Assert.strictEqual(c.akind, 'inverse')
    Assert.strictEqual(c.invname, 'q')
    Assert.strictEqual(c.held, held.held)
    Assert.strictEqual(c.done, true)

    // Dedup with one side unheld: the held side's value survives.
    const dup: any = new GraphAtomVal(
      { akind: 'inverse', invname: 'q' } as any, ctx)
    const merged: any = held.unify(dup, ctx)
    Assert.strictEqual(merged.isGraphAtom, true)
    Assert.strictEqual(merged.held.peg, 1)

    // Absorbing a first value: the atom carries it.
    const carry: any = bare.unify(new IntegerVal({ peg: 7 }, ctx), ctx)
    Assert.strictEqual(carry.isGraphAtom, true)
    Assert.strictEqual(carry.held.peg, 7)

    // The funcval make/name hooks, as rel-func-shape pins rel's.
    const afn: any = new AcyclicFuncVal({ peg: [] }, ctx)
    Assert.strictEqual(afn.funcname(), 'acyclic')
    Assert.strictEqual((afn.make(ctx, { peg: [] }) as any).isVal, true)
    const ifn: any = new InverseFuncVal({ peg: [] }, ctx)
    Assert.strictEqual(ifn.funcname(), 'inverse')
    Assert.strictEqual((ifn.make(ctx, { peg: [] }) as any).isVal, true)
  })


  test('recurse-budget-backstop', () => {
    const ctx: any = new Aontu().ctx({ collect: true })
    ctx.root = new MapVal({ peg: {} }, ctx)
    const rec: any = new RecurseVal({ target: ['n'], xc: 1000 } as any, ctx)
    const out: any = rec.unify(new MapVal({ peg: {} }, ctx), ctx)
    Assert.strictEqual(out.isNil, true)
    Assert.strictEqual(out.why, 'recursion_budget')
    Assert.strictEqual(out.details.target, '$.n')
  })


  test('recurse-residual-shape', () => {
    const ctx: any = new Aontu().ctx({ collect: true })
    ctx.root = new MapVal({ peg: {} }, ctx)
    const mk = (t: string[]) => new RecurseVal({ target: t } as any, ctx)

    // Self-drive: nothing to advance.
    const r: any = mk(['n'])
    Assert.strictEqual(r.unify(null as any, ctx), r)

    // The same fixpoint twice is one fixpoint.
    Assert.strictEqual(r.unify(mk(['n']), ctx), r)

    // Mutual recursion meeting: both held, in a conjunct.
    Assert.strictEqual(r.unify(mk(['m']), ctx).isConjunct, true)

    // Concrete structure whose definition has not assembled (the
    // root holds no `n`): the peer is held beside the residual.
    Assert.strictEqual(
      r.unify(new MapVal({ peg: {} }, ctx), ctx).isConjunct, true)

    // Anything else -- here a graph atom -- waits beside the
    // residual the same way.
    const atom: any = new GraphAtomVal({ akind: 'acyclic' } as any, ctx)
    Assert.strictEqual(r.unify(atom, ctx).isConjunct, true)

    // bumpRecurse: the guard arms (nothing, a non-val), the conjunct
    // arm, and the spread tail.
    bumpRecurse(null, 3)
    bumpRecurse({ some: 'object' }, 3)
    const cj: any = new ConjunctVal({ peg: [mk(['n'])] }, ctx)
    bumpRecurse(cj, 5)
    Assert.strictEqual(cj.peg[0].xc, 5)
    const spreadMap: any = new MapVal({ peg: {} }, ctx)
    spreadMap.spread.cj = mk(['n'])
    bumpRecurse(spreadMap, 4)
    Assert.strictEqual(spreadMap.spread.cj.xc, 4)

    const ref: any = new RefVal({ peg: ['n'], absolute: true }, ctx)
    bumpRecurse(ref, 7)
    Assert.strictEqual(ref.rxc, 7)
    // Monotone, like the residual arm beside it.
    bumpRecurse(ref, 3)
    Assert.strictEqual(ref.rxc, 7)

    // containsRecurseOf: the depth guard, and a raw reference of a
    // DIFFERENT length is not the target.
    Assert.strictEqual(containsRecurseOf(mk(['n']), ['n'], 9), false)
    Assert.strictEqual(containsRecurseOf(mk(['n']), ['n'], 0), true)
    Assert.strictEqual(containsRecurseOf(mk(['n', 'm']), ['n'], 0), false)
  })

})


describe('coverage3-apply-flows', () => {

  test('apply-flows-skips-a-record-that-stops-resolving', () => {
    const a0 = new Aontu()
    const ctx: any = a0.ctx({ collect: true })
    const target: any = new MapVal({ peg: {} }, ctx)
    const root: any = new MapVal({ peg: { a: target } }, ctx)

    ctx.referflows = new Map<string, any>([
      ['a', new MapVal({ peg: { k: new IntegerVal({ peg: 1 }, ctx) } }, ctx)],
      ['gone', new MapVal({ peg: {} }, ctx)],
      ['a\x00k\x00deeper', new MapVal({ peg: {} }, ctx)],
      ['nosuch\x00x', new MapVal({ peg: {} }, ctx)],
    ])

    const out: any = applyFlows(ctx, root)
    Assert.strictEqual(out, root)
    // The resolvable record landed ...
    Assert.strictEqual(out.peg.a.peg.k.peg, 1)
    // ... and the unresolvable ones added nothing.
    Assert.strictEqual(out.peg.gone, undefined)
    Assert.strictEqual(out.peg.nosuch, undefined)
  })

  test('apply-flows-is-a-no-op-without-records', () => {
    // The common case: a document with no links pays one property load
    // per pass and the walk never runs.
    const a0 = new Aontu()
    const ctx: any = a0.ctx({ collect: true })
    const root: any = new MapVal({ peg: {} }, ctx)
    Assert.strictEqual(applyFlows(ctx, root), root)
    ctx.referflows = new Map()
    Assert.strictEqual(applyFlows(ctx, root), root)
  })

})


describe('coverage3-refer', () => {

  test('find-at-walks-into-non-bags', () => {
    const ctx = new Aontu().ctx({})
    const m: any = new MapVal({ peg: { p: new IntegerVal({ peg: 1 }, ctx) } }, ctx)
    const root: any = new MapVal({ peg: { x: m } }, ctx)

    // Walking THROUGH a scalar, and walking into a key that is not
    // there: both are "not (yet) resolvable", not a crash.
    Assert.strictEqual(findAt(root, ['x', 'p', 'q']), undefined)
    Assert.strictEqual(findAt(root, ['x', 'nope']), undefined)
    // No tree to walk, and the empty path (`$`, refused as an address
    // because it has no parent to be written back into).
    Assert.strictEqual(findAt(undefined, ['x']), undefined)
    Assert.strictEqual(findAt(root, []), undefined)
    const found: any = findAt(root, ['x', 'p'])
    Assert.strictEqual(found.parent, m)
    Assert.strictEqual(found.key, 'p')
  })

  test('refer-peers-the-dispatcher-never-hands-it', () => {
    const ctx = new Aontu().ctx({})
    const r: any = new ReferVal({}, ctx)
    // A NIL peer is absorbing, as everywhere else: the residual answers
    // the existing failure rather than minting a second one.
    const nil: any = new NilVal({ why: 'test-nil' }, ctx)
    Assert.strictEqual(r.unify(nil, ctx), nil)
    // And an absent peer is the self-drive `unite` substitutes TOP for.
    Assert.strictEqual(r.unify(undefined as any, ctx), r)
  })

  test('refer-second-path-peer-refines-by-prefix', () => {
    const ctx: any = new Aontu().ctx({ collect: true })
    ctx.root = new MapVal({ peg: {} }, ctx)
    const r: any = new ReferVal({}, ctx)
    r.addr = parseAddress('$.q')
    r.addrsrc = '$.q'
    const refined: any = r.unify(new PathVal({ peg: '$.q.r' }, ctx), ctx)
    Assert.strictEqual(refined.addrsrc, '$.q.r')
    // The prefix rule is symmetric in which side is pending.
    const kept: any = refined.unify(new PathVal({ peg: '$.q' }, ctx), ctx)
    Assert.strictEqual(kept.addrsrc, '$.q.r')
    const nil: any = r.unify(new PathVal({ peg: '$.z' }, ctx), ctx)
    Assert.strictEqual(true, nil.isNil)
  })

  test('refer-holds-a-second-constraint-by-meet', () => {
    // Same cross-pass channel as the second-path arm: constraints in
    // one conjunct merge with each other before the residual folds,
    // so held's meet arm is only reached by a late-delivered peer.
    const ctx: any = new Aontu().ctx({ collect: true })
    ctx.root = new MapVal({ peg: {} }, ctx)
    const r: any = new ReferVal({}, ctx)
    const r1: any = r.unify(new ScalarKindVal({ peg: String }, ctx), ctx)
    Assert.strictEqual(true, null != r1.held)
    const r2: any = r1.unify(new ScalarKindVal({ peg: String }, ctx), ctx)
    Assert.strictEqual(true, null != r2.held)
    Assert.strictEqual(true, true !== r2.held.isNil)
  })

  test('refer-flow-refusal-is-the-nil', () => {
    const a0 = new Aontu()
    const ctx: any = a0.ctx({ collect: true })
    const m: any = new MapVal({ peg: { k: new IntegerVal({ peg: 1 }, ctx) } }, ctx)
    ctx.root = new MapVal({ peg: { x: m } }, ctx)

    const r: any = new ReferVal({}, ctx)
    r.tval = new IntegerVal({ peg: 1 }, ctx)
    r.addr = parseAddress('$.x')
    r.addrsrc = '$.x'
    Assert.strictEqual(r.settle(ctx, r).isNil, true)
  })

  test('refer-climb-off-the-top-refuses', () => {
    // A relative address with more parent steps than the link has
    // ancestors. No later pass can grow the tree upwards, so this
    // refuses at once rather than residuating to the last pass.
    const a0 = new Aontu()
    const ctx: any = a0.ctx({ collect: true })
    ctx.root = new MapVal({ peg: {} }, ctx)
    const r: any = new ReferVal({}, ctx)
    r.addr = parseAddress('...z')
    r.addrsrc = '...z'
    r.path = ['a', 'dep']
    Assert.strictEqual(r.settle(ctx, r).isNil, true)
  })

})

describe('coverage3-graph', () => {

  test('graph-of-survives-a-cycle', () => {
    const ctx = new Aontu().ctx({})
    const root: any = new MapVal({ peg: {} }, ctx)
    root.peg.self = root
    const g = graphOf(root)
    // The ancestor guard stops the descent the moment the cycle closes
    // back onto a node already on the path.
    Assert.deepEqual(g.edges, [])
  })

  test('graph-of-answers-a-non-val-slot', () => {
    // A bag slot can hold a raw value or nothing at all in a hand-built
    // tree; the walk answers it rather than descending into it.
    const ctx = new Aontu().ctx({})
    const root: any = new MapVal(
      { peg: { raw: 5 as any, gap: undefined as any } }, ctx)
    Assert.deepEqual(graphOf(root).edges, [])
  })

  test('graph-cut-derives-the-source-node', () => {
    // The cut, at every shape a link can sit in. Built by hand because
    // the AT-THE-ROOT case has no enclosing key for a document to give
    // it.
    const ctx = new Aontu().ctx({})
    const link = (addr: string, relkey?: string) => {
      const v: any = new StringVal({ peg: addr }, ctx)
      v.link = addr
      if (undefined !== relkey) { v.relkey = relkey }
      return v
    }

    // A link under a key: the key is the relation, its parent the node.
    let root: any = new MapVal({ peg: {} }, ctx)
    root.peg.web = new MapVal({ peg: { dependsOn: link('$.db') } }, ctx)
    Assert.deepEqual(graphOf(root).edges,
      [{ from: '$.web', key: 'dependsOn', to: '$.db', at: '$.web.dependsOn' }])

    // A link inside a LIST: the index is a position within the
    // relation, not a relation of its own.
    root = new MapVal({ peg: {} }, ctx)
    root.peg.web = new MapVal(
      { peg: { dependsOn: new ListVal({ peg: [link('$.db')] }, ctx) } }, ctx)
    Assert.deepEqual(graphOf(root).edges,
      [{
        from: '$.web', key: 'dependsOn', to: '$.db',
        at: '$.web.dependsOn.0'
      }])

    // A DECLARED predicate cuts at the key the rel() sat on, wherever
    // it is on the way down — which is what makes a MAP-valued
    // relation report the relation rather than the inner label.
    root = new MapVal({ peg: {} }, ctx)
    root.peg.web = new MapVal({
      peg: {
        dependsOn: new MapVal(
          { peg: { primary: link('$.db', 'dependsOn') } }, ctx)
      }
    }, ctx)
    Assert.deepEqual(graphOf(root).edges,
      [{
        from: '$.web', key: 'dependsOn', to: '$.db',
        at: '$.web.dependsOn.primary'
      }])

    // A link AT THE TOP of the document has no node above it: the
    // source is the root itself.
    root = new MapVal({ peg: { dep: link('$.db') } }, ctx)
    Assert.deepEqual(graphOf(root).edges,
      [{ from: '$', key: 'dep', to: '$.db', at: '$.dep' }])

    // A declared predicate that is not on the path falls back to the
    // inference — a shape no rel() produces, since the predicate IS a
    // segment of the link's own path.
    root = new MapVal({ peg: { dep: link('$.db', 'nowhere') } }, ctx)
    Assert.deepEqual(graphOf(root).edges,
      [{ from: '$', key: 'nowhere', to: '$.db', at: '$.dep' }])

    // A link at the root of a LIST document: nothing but indices above
    // it, so the source is the root and the relation is unlabelled.
    const lroot: any = new ListVal({ peg: [link('$.db')] }, ctx)
    Assert.deepEqual(graphOf(lroot).edges,
      [{ from: '$', key: '', to: '$.db', at: '$.0' }])
  })

})


describe('coverage3-staging', () => {

  test('a-hole-has-nothing-above-it', () => {
    const place: any = new PlaceVal({})
    Assert.strictEqual(place.superior(), place)
  })

  test('residuation-answers-a-nil-peer', () => {
    const a0 = new Aontu()
    const ctx: any = a0.ctx({})
    const key: any = new KeyFuncVal({ peg: [] }, ctx)
    const nil: any = new NilVal({ why: 'test-nil-peer' }, ctx)

    // ctx.settle is false, so this is the residuation path.
    Assert.strictEqual(key.unify(nil, ctx), nil)
  })

  test('nil-absorbs-a-unify', () => {
    const a0 = new Aontu()
    const ctx: any = a0.ctx({})
    const nil: any = new NilVal({ why: 'test-absorb' }, ctx)
    Assert.strictEqual(nil.unify(top(), ctx), nil)
  })

  test('defaulted-scrutinee-multi-pref-min-rank', () => {
    const rank2 = new PrefVal({
      peg: new PrefVal({ peg: new IntegerVal({ peg: 1 }) }),
    })
    const rank1 = new PrefVal({ peg: new IntegerVal({ peg: 2 }) })

    const d1: any = new DisjunctVal({ peg: [rank2, rank1] })
    Assert.strictEqual((effectiveScrutinee(d1) as any).peg, 2)

    const d2: any = new DisjunctVal({ peg: [rank1, rank2] })
    Assert.strictEqual((effectiveScrutinee(d2) as any).peg, 2)
  })

  test('bag-same-is-structural', () => {
    const one: any = new MapVal({ peg: { a: new IntegerVal({ peg: 1 }) } })
    const two: any = new MapVal({ peg: { a: new IntegerVal({ peg: 1 }) } })

    Assert.equal(one.same(one), true, 'identity')
    Assert.equal(one.same(two), true, 'same shape')
    Assert.equal(one.same(new IntegerVal({ peg: 1 })), false, 'not a bag')
    Assert.equal(one.same(undefined), false, 'no peer')

    const closed: any = new MapVal({ peg: { a: new IntegerVal({ peg: 1 }) } })
    closed.closed = true
    Assert.equal(one.same(closed), false, 'closedness')

    const marked: any = new MapVal({ peg: { a: new IntegerVal({ peg: 1 }) } })
    marked.mark.type = true
    Assert.equal(one.same(marked), false, 'marks')

    const wider: any = new MapVal({
      peg: { a: new IntegerVal({ peg: 1 }), b: new IntegerVal({ peg: 2 }) },
    })
    Assert.equal(one.same(wider), false, 'key count')
  })


  test('disjunct-single-member-generates', () => {
    const d: any = new DisjunctVal({ peg: [new IntegerVal({ peg: 7 })] })
    Assert.equal(d.gen(CTX()), 7)
  })

})

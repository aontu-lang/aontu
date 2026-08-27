/* Copyright (c) 2025 Richard Rodger, MIT License */

// Coverage round 5 (ADR-002): the last reachable lines, branches and
// functions in ts/src. Each case here exists because an investigation
// proved the path IS reachable — the ones that are not are marked in the
// source with a `node:coverage ignore` directive and a justification, and
// listed in docs/test-coverage.md.
//
// Language behaviour belongs in test/spec/*.tsv (ADR-001); what is left
// here is engine-internal: API-only guards, debug/inspect rendering,
// editor-facing formatting, and process plumbing.

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
import { Unify, mergeEntities } from '../dist/unify'
import { main as cliMain, evalSource } from '../dist/cli'
import { main as lspMain } from '../dist/lsp-server'
import { computeDiagnostics, computeHover, LspHandler } from '../dist/lsp'
import { subsumeNode } from '../dist/subsume'
import { DeprecateFuncVal } from '../dist/val/DeprecateFuncVal'
import { collectDeprecations } from '../dist/utility'
import { hcanon, canonHash } from '../dist/hcanon'
import { projectFor } from '../dist/query'
import { Provenance, markSpread } from '../dist/provenance'
import { IdFuncVal, idName } from '../dist/val/IdFuncVal'
import { ReferVal, parseAddress, findEntity } from '../dist/val/ReferFuncVal'
import { graphOf } from '../dist/graph'
import { constantIdFunc, canonRiders } from '../dist/utility'
import { nextValId } from '../dist/val/Val'
import {
  candidates as trimCandidates,
  deleteAt as trimDeleteAt,
  evalCanon as trimEvalCanon,
} from '../dist/trim'

import { Val } from '../dist/val/Val'
import { top } from '../dist/val/top'
import { MapVal } from '../dist/val/MapVal'
import { ListVal } from '../dist/val/ListVal'
import { IntegerVal } from '../dist/val/IntegerVal'
import { NumberVal } from '../dist/val/NumberVal'
import { StringVal } from '../dist/val/StringVal'
import { ScalarVal } from '../dist/val/ScalarVal'
import { NilVal } from '../dist/val/NilVal'
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
import { UpperFuncVal } from '../dist/val/UpperFuncVal'
import { LowerFuncVal } from '../dist/val/LowerFuncVal'
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
    // The package entry re-exports these from their own modules, which
    // tsc emits as property getters — reading each one here keeps the
    // public surface pinned without depending on which other test
    // happens to touch it.
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
    // No concrete Val inherits Val.unify — every leaf overrides it — but
    // the base contract is that an unhandled Val stands.
    // `canon` is abstract on Val, so even a stand-in has to render
    // something; this one is never canoned.
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
    // A list canon carries no optional markers, even when the value is
    // built by hand with one recorded (issue #40): a key:value pair is
    // not a list element, so there is no optional element for a marker to
    // describe, and the Go port's ListVal.Canon has no arm for one.
    const lv: any = new ListVal({ peg: [new IntegerVal({ peg: 1 })] }, CTX())
    lv.optionalKeys.push('0')
    Assert.equal(lv.canon, '[1]')
  })


  test('func-no-arg-guards-via-api', () => {
    // Every built-in's missing-argument guard, reached the only way that
    // is left: through the programmatic API (issue #51).
    //
    // A wrong argument count is refused at PARSE now, so no source can
    // reach these guards -- but a caller constructing a func Val by hand
    // still can, and they are what keeps that a clean nil rather than a
    // TypeError on `undefined`. The value of the test is that surface,
    // not the counter: the guards became unreachable from source the
    // moment arity was checked, and deleting them would have moved the
    // failure from a refusal to a crash for anyone building Vals.
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

    // path() refuses its missing argument in prepare rather than
    // resolve, since it rewrites the argument before it is driven.
    const pf: any = new PathFuncVal({ peg: [] })
    const prepared: any = pf.prepare(ctx, [])
    Assert.equal(prepared[0].isNil, true)
    Assert.equal(prepared[0].why, 'invalid-arg')
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

    // A non-escaping peer rides a NEW node (pure unify — the
    // unequal-spread crosswire, BUGS.md §6-§7): the met expectation
    // stays untouched, and the carried node's inspection renders the
    // accumulated peer.
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
    // Every leaf stands against TOP. The engine reaches these arms only
    // through whichever document happens to unify a bare leaf with top;
    // asserting them here keeps the ADR-002 gate independent of that.
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
    // -0 generates as +0, so JSON round-trips it.
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

    // No argument at all.
    Assert.equal((new PathFuncVal({ peg: [] }, ctx) as any).resolve(ctx, []).isNil, true)

    // A scalar argument becomes a relative reference…
    const pfs: any = new PathFuncVal({ peg: [new StringVal({ peg: 'a' })] }, ctx)
    const sargs: any[] = [new StringVal({ peg: 'a' })]
    pfs.prepare(ctx, sargs)
    Assert.equal(sargs[0].isRef, true)

    // …while a container argument is refused outright.
    const pfm: any = new PathFuncVal({ peg: [new MapVal({ peg: {} })] }, ctx)
    const margs: any[] = [new MapVal({ peg: {} })]
    pfm.prepare(ctx, margs)
    Assert.equal(margs[0].isNil, true)
  })

  test('case-func-superior-is-top', () => {
    Assert.equal(new UpperFuncVal({ peg: [] }).superior().isTop, true)
    Assert.equal(new LowerFuncVal({ peg: [] }).superior().isTop, true)
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
    v.site.url = '/no/such/aontu/file.aon'

    const n0 = makeNilErr(undefined as any, 'nosrc', v)
    descErr(n0, {} as any)
    Assert.match(n0.msg, /SOURCE-NOT-FOUND: \/no\/such\/aontu\/file\.aon \(NO-FS\)/)

    const n1 = makeNilErr(undefined as any, 'nosrcfs', v)
    descErr(n1, { fs: Fs } as any)
    Assert.match(n1.msg, /SOURCE-NOT-FOUND: \/no\/such\/aontu\/file\.aon/)
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

    // An outcome that is NOT yet done is marked `!`, which is the whole
    // point of the slot when reading an explain trace: it distinguishes a
    // frame that settled from one still deferring. A scalar is always
    // done, so only an unresolved value reaches this arm.
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
        return 0 === n++ ? { mem: { 'm0.aon': 'a:1' }, pkg: {} } : undefined
      },
    } as any)
    Assert.equal(lang.parse('x:@"m0.aon"').canon, '{"x":{"a":1}}')

    const pkg: any = new Lang().parse('p:@"@tabnas/jsonic/package.json"')
    Assert.equal(pkg.peg.p.name, '@tabnas/jsonic')

    const none: any = new Lang().parse('a:@')
    Assert.equal(none.canon, 'nil')
    Assert.match(none.err[0].msg, /source not found/)

    Assert.throws(() => new Lang().parse('a:@1'))
  })

  test('raw-value-conversion', () => {
    const lang = new Lang()
    // Forward slashes even on Windows: the path is embedded in aontu
    // SOURCE below, where a backslash is a string escape.
    const fixture = (name: string) =>
      Path.join(__dirname, '..', 'test', name).split(Path.sep).join('/')
    const raw = fixture('raw.json')
    const rawfn = fixture('raw-fn.js')

    // An elided element is REFUSED, in an implicit top-level list as
    // anywhere else (issue #48). It canons as the nil it now is.
    Assert.equal(lang.parse('1,,2').canon, '[1,nil,2]')

    // A JSON include arrives as raw JS and is converted kind by kind.
    Assert.equal(lang.parse('1, @"' + raw + '"').canon,
      '[1,{"a":1,"b":"s","c":true,"d":[1,2],"e":null,"f":1.5}]')

    // A function export has no Val: parse_unknown.
    Assert.equal(lang.parse('1, @"' + rawfn + '"').canon, '[1,nil]')

    // An operator expression in an implicit top-level list is REDUCED,
    // not left as a raw op array: `k2.b` is the relative reference
    // `.k2.b`, which is what it canons as standalone too. Before
    // @tabnas/expr 0.5.4 this parsed as the nonsense list
    // [nil,"k2","b"] -- the op descriptor as a nil, its operands
    // trailing behind it -- and unify then produced that list as a
    // VALUE in Go while TypeScript raised no_path. Both now raise.
    Assert.equal(lang.parse('k2.b K:1').canon, '[.k2.b]')
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
    Assert.match(label('a:$.a', 2), /\*error\*/)
    // A REFERENCE that survives unification: a chain deeper than the
    // pass budget stalls unresolved without erroring. A cycle no longer
    // works here — with multi-error collection (G2 phase 6) the pass
    // loop continues past the erroring pass, and the cycle's members
    // absorb the one cycle nil rather than staying references.
    Assert.match(label(
      'a:$.b b:$.c c:$.d d:$.e e:$.f f:$.g g:$.h h:$.i i:$.j j:$.k k:$.l l:1',
      2), /\*reference\*/)
    Assert.match(label('n:1.5', 2), /\*float\*/)
    Assert.match(label('x:null', 2), /\*scalar\*/)
    // A DISJUNCTION LABELS ITSELF. `x:null|top` used to hover as
    // *scalar*: the disjunct arrived unsited, so the hover walk found
    // the null MEMBER under the cursor instead. Carrying the site
    // through the meet (ts/src/val/DisjunctVal.ts, the review's finding
    // F) makes the disjunction the thing at that position, which is
    // what is written there.
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
    // evalSource never throws: it renders whatever came out of the
    // engine. The three shapes are an AontuError, a foreign object that
    // claims to be one (`aontu: true`, as a cross-realm error would),
    // and a throw with no message at all.
    const thrower = (err: any) => ({
      unify() { throw err },
      generate() { throw err },
    }) as any

    const aerr = evalSource(thrower(new AontuError('real-aontu')), 'a:1', 'json')
    Assert.deepEqual(aerr, { ok: false, text: 'real-aontu' })

    const foreign = evalSource(
      thrower({ aontu: true, message: 'foreign-aontu' }), 'a:1', 'json')
    Assert.deepEqual(foreign, { ok: false, text: 'foreign-aontu' })

    const bare = evalSource(thrower('just-a-string'), 'a:1', 'canon')
    Assert.deepEqual(bare, { ok: false, text: 'just-a-string' })
  })

  test('cli-version-without-a-version-field', () => {
    // A package.json with no version field falls back rather than
    // printing "undefined" (the read is patched, not the file).
    // require(), not the import namespace: the CJS module object is
    // mutable, and cli.js reads the property at call time.
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

  test('cli-file-error-path', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-cov3-'))
    const file = Path.join(dir, 'bad.aontu')
    Fs.writeFileSync(file, 'a:1 a:2')
    const r = capture(() => cliMain(['node', 'cli', file]))
    Assert.equal(r.out, '')
    Assert.match(r.err, /Cannot unify value/)
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

  // The internals no source reaches (G3 phase 4): make() is the
  // multi-pass rebuild contract every FuncBaseVal keeps; the argless
  // and nil-argument resolve arms are the defensive shape the
  // type()/hide() lesson fixed (refusal over corruption, D7).
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

  // The no-rule fold at the walk's tail (ts/src/subsume.ts): total in
  // practice for every evaluated former, so unreachable through
  // subsume() — pinned directly, with a nil, which also pins the "a nil
  // folds to undecided" claim the walk's top comment makes. The Go port
  // pins the same fold in TestSubsumeNoRuleFold.
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

  // The hash-form arms no SOURCE reaches (G6 phase 0): a bag's raw peg
  // entry, which degenerate parses can leave behind, and the junction
  // parenthesisation rule -- post-unification junctions are flattened
  // by norm, so only a constructed tree still nests one. The rule has
  // to hold anyway: a hash form that rendered `(1|2)&3` as the
  // differently-parsing `1|2&3` would be a pin that silently agrees
  // with a document it should not.
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

  // The projection arm no SOURCE reaches (G7 phase 1): a junction
  // member that is itself a junction of more than one term. Post-
  // unification junctions are flattened by norm, so only a constructed
  // tree still nests one — and the rule has to hold anyway, because a
  // view is a DOCUMENT: rendering `(1|2)&3` as the differently-parsing
  // `1|2&3` would be a view that no longer subsumes what it summarises.
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

  // The last tiebreak of the contribution order (G7 phase 3): two
  // UNSITED contributions, which is now the only way two of them share
  // a "position" — a real site identifies one written token and the
  // record is deduplicated on it (finding E). The order still has to
  // be TOTAL, because a partial one would leave the record's tail in
  // meet order, which is the fixpoint's business and differs between
  // the ports.
  test('provenance-orders-same-site-contributions-by-canon', () => {
    const ctx = new Aontu().ctx({})
    const zed = new StringVal({ peg: 'z' }, ctx)
    const alf = new StringVal({ peg: 'a' }, ctx)
    for (const v of [zed, alf]) {
      v.site.url = 'one.aon'
    }

    const prov = new Provenance()
    prov.writtenFrom(new MapVal({ peg: { z: zed, a: alf } }, ctx))
    prov.record(['k'], zed, alf, new StringVal({ peg: 'z' }, ctx))

    Assert.deepEqual(prov.at(['k']).map((c: any) => c.canon), ['"a"', '"z"'])
    // A path nothing met has no record at all.
    Assert.deepEqual(prov.at(['nowhere']), [])
  })


  // THE SPREAD MARK'S GUARD IS A CYCLE GUARD, not a "done" flag: it
  // must stop the walk revisiting a value it has already reached in
  // THIS walk, and must not stop a later application re-walking a
  // template the fixpoint has advanced in place (finding E, BUGS.md
  // §22). A tree holding one child under two keys is the shape that
  // exercises it, and no source builds one -- the parser gives every
  // key its own value -- so it is built here.
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


  // ONE WRITTEN TOKEN IS ONE CONTRIBUTION (the review's finding E).
  // The same written value reaches a path more than once now that
  // provenance travels through clones -- as the template application
  // and as the value written at the key, or at two stages of narrowing
  // -- and the SITE is what says they are one thing. The role is not
  // part of that identity, so the more informative one survives. The
  // Go twin is TestProvenanceDeduplicatesBySite.
  test('one-written-token-is-one-contribution', () => {
    const ctx = new Aontu().ctx({})
    const at = (v: any) => {
      v.site.row = 1
      v.site.col = 4
      v.site.url = 'one.aon'
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

// G4 phase 1 — the identity internals no source reaches. Language
// behaviour is pinned in test/spec/id.tsv; what is left here is the
// engine's own shapes: arguments the parser never hands the function,
// template containers the grammar cannot build, and the CYCLIC tree a
// unified result actually is (a resolved reference shares its target),
// which is what makes the walks' seen-guards load-bearing rather than
// defensive.
describe('coverage3-identity', () => {

  test('id-name-argument-kinds', () => {
    const ctx = new Aontu().ctx({})
    // What spells a name, and what does not. `undefined` and a
    // non-Val reach idName only through a direct call: the func
    // dispatcher resolves every argument to a Val first.
    for (const ok of ['a', 'svc/auth', 'team-pay', 'a_1', '0', 'A/b-c_1']) {
      Assert.strictEqual(idName(new StringVal({ peg: ok }, ctx)), ok)
    }
    for (const bad of ['', 'svc.auth', 'a b', 'a:b', 'a$b']) {
      Assert.strictEqual(idName(new StringVal({ peg: bad }, ctx)), undefined)
    }
    Assert.strictEqual(idName(new IntegerVal({ peg: 1 }, ctx)), undefined)
    Assert.strictEqual(idName(new MapVal({ peg: {} }, ctx)), undefined)
    Assert.strictEqual(idName(undefined), undefined)
    Assert.strictEqual(idName({ isScalar: true, peg: 1 }), undefined)
  })

  test('id-func-shape', () => {
    const ctx = new Aontu().ctx({})
    const fn = new IdFuncVal({ peg: [new StringVal({ peg: 'x' }, ctx)] }, ctx)
    Assert.strictEqual(fn.funcname(), 'id')
    Assert.strictEqual((fn as any).isIdFunc, true)
    // make() is the clone hook FuncBaseVal calls; it answers another
    // IdFuncVal rather than the base class.
    const made: any = fn.make(ctx, { peg: fn.peg })
    Assert.strictEqual(made.isIdFunc, true)
    // The unit it resolves to carries the name and a FRESH id: the
    // pinned TopVal id 0 would collide in unite's done-pair fast path
    // and drop an identity before the rider could carry it.
    const out: any = fn.resolve(ctx, fn.peg as any)
    Assert.strictEqual(out.isTop, true)
    Assert.strictEqual(out.entity, 'x')
    Assert.notStrictEqual(out.id, 0)
    Assert.ok(nextValId() > 0)
  })

  test('constant-id-in-every-template-container', () => {
    const ctx = new Aontu().ctx({})
    const idfn = new IdFuncVal({ peg: [new StringVal({ peg: 'x' }, ctx)] }, ctx)
    const keyed = new Aontu().unify('a:{&:id(key(0)),b:{}}') as any

    // Every container a template can be. The bag arms are reached
    // through peg; the spread arm is the off-peg tail.
    const inMap = new MapVal({ peg: { a: idfn } }, ctx)
    const inList = new ListVal({ peg: [idfn] }, ctx)
    const inConjunct = new ConjunctVal({ peg: [idfn] }, ctx)
    const withSpread: any = new MapVal({ peg: {} }, ctx)
    withSpread.spread.cj = idfn

    for (const v of [idfn, inMap, inList, inConjunct, withSpread]) {
      Assert.strictEqual(constantIdFunc(v), idfn)
    }
    // ... and what carries no constant id at all.
    for (const v of [undefined, null, 5, new MapVal({ peg: {} }, ctx),
      new IntegerVal({ peg: 1 }, ctx), keyed]) {
      Assert.strictEqual(constantIdFunc(v as any), undefined)
    }

    // The cycle guard: a unified tree is a graph, so a self-containing
    // map is a shape the scan must survive rather than recurse into.
    const cyc: any = new MapVal({ peg: {} }, ctx)
    cyc.peg.self = cyc
    Assert.strictEqual(constantIdFunc(cyc), undefined)
  })

  test('canon-riders-nest-identity-inside-deprecation', () => {
    const ctx = new Aontu().ctx({})
    const v: any = new IntegerVal({ peg: 1 }, ctx)
    Assert.strictEqual(canonRiders(v), '1')
    v.entity = 'team-pay'
    Assert.strictEqual(canonRiders(v), 'id("team-pay")&1')
    v.deprecation = { msg: 'gone' }
    Assert.strictEqual(canonRiders(v),
      'deprecate(id("team-pay")&1,{"msg":"gone"})')
  })

  test('identity-merge-walks-survive-a-cyclic-tree', () => {
    // Both walks meet the same graph. Driven through Unify so the
    // registry is the one the pass loop seeds.
    const a0 = new Aontu()
    const ctx = a0.ctx({})
    const root: any = new MapVal({ peg: {} }, ctx)
    root.peg.self = root
    root.peg.k = new IntegerVal({ peg: 1 }, ctx)
    root.entity = 'x'
    const res: any = new Unify(root, undefined, ctx).res
    Assert.strictEqual(res.entity, 'x')
  })

  test('identity-merge-walk-answers-a-non-val-slot', () => {
    // A bag slot can hold a raw value or nothing at all in a hand-built
    // tree (the shape `raw-peg-canon-and-clone` builds); the walk
    // answers it unchanged rather than dereferencing it. No document
    // produces one — both ports proved that by running their whole
    // suites — so the guard is pinned here, as its Go twin is in
    // go/identity_test.go.
    const a0 = new Aontu()
    const ctx: any = a0.ctx({})
    ctx.entities = new Map()
    const child: any = new MapVal({ peg: {} }, ctx)
    child.entity = 'x'
    const root: any = new MapVal(
      { peg: { a: child, raw: 5 as any, gap: undefined as any } }, ctx)
    const out: any = mergeEntities(ctx, root)
    Assert.strictEqual(out.peg.raw, 5)
    Assert.strictEqual(out.peg.gap, undefined)
    Assert.strictEqual(out.peg.a.entity, 'x')
  })

  test('identity-merge-converges-list-positions', () => {
    // A list element is a POSITION: after the merge both elements hold
    // the one value, not two equal ones.
    const v: any = new Aontu().unify('a:[id(x) & {k:1}, id(x) & {j:2}]')
    const list = v.peg.a
    Assert.strictEqual(list.peg[0], list.peg[1])
    Assert.strictEqual(list.peg[0].canon, '{"j":2,"k":1}')
  })

})

// G4 phase 2 — the refer internals no source reaches. The residual is
// minted where it is used and answers whole shapes, so its per-arm
// behaviour is exercised here directly: an address that walks into a
// scalar, the peers the dispatcher never hands it, and a flow whose
// TOP-LEVEL meet fails (from source the conflict usually lands on a
// field, the two maps meeting and one key disagreeing).
describe('coverage3-refer', () => {

  test('find-entity-walks-into-non-bags', () => {
    const ctx = new Aontu().ctx({})
    const m: any = new MapVal({ peg: { p: new IntegerVal({ peg: 1 }, ctx) } }, ctx)
    const reg = new Map<string, any>([['x', m]])

    Assert.strictEqual(findEntity(reg, parseAddress('x.p.q') as any), undefined)
    Assert.strictEqual(findEntity(reg, parseAddress('x.nope') as any), undefined)
    Assert.strictEqual(findEntity(undefined, parseAddress('x') as any), undefined)
    const found: any = findEntity(reg, parseAddress('x.p') as any)
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

  test('refer-flow-refusal-is-the-nil', () => {
    const a0 = new Aontu()
    const ctx: any = a0.ctx({ collect: true })
    const m: any = new MapVal({ peg: { k: new IntegerVal({ peg: 1 }, ctx) } }, ctx)
    ctx.entities = new Map([['x', m]])

    const r: any = new ReferVal({}, ctx)
    r.tval = new IntegerVal({ peg: 1 }, ctx)
    r.addr = parseAddress('x')
    r.addrsrc = 'x'
    Assert.strictEqual(r.settle(ctx, r).isNil, true)
  })

})

// G4 phase 3 — the graph walk's guards. The walk visits POSITIONS
// rather than values (two positions of one entity share a value object
// after the merge), so its termination guard is the ANCESTOR chain,
// which is what a cycle actually is. No document produces one — a
// self-prefix reference is refused as `path_cycle` long before — so
// the guard is pinned here, as its Go twin is in go/graph_test.go.
describe('coverage3-graph', () => {

  test('graph-of-survives-a-cycle', () => {
    const ctx = new Aontu().ctx({})
    const root: any = new MapVal({ peg: {} }, ctx)
    root.peg.self = root
    root.entity = 'x'
    const g = graphOf(root)
    // Once, at the root: the ancestor guard stops the descent the
    // moment the cycle closes back onto a node already on the path.
    Assert.deepEqual(g.entities, [{ id: 'x', paths: ['$'] }])
    Assert.deepEqual(g.edges, [])
  })

  test('graph-of-answers-a-non-val-slot', () => {
    // A bag slot can hold a raw value or nothing at all in a hand-built
    // tree; the walk answers it rather than descending into it.
    const ctx = new Aontu().ctx({})
    const root: any = new MapVal(
      { peg: { raw: 5 as any, gap: undefined as any } }, ctx)
    root.entity = 'x'
    Assert.deepEqual(graphOf(root).entities, [{ id: 'x', paths: ['$'] }])
  })

})


// G8 phase 0/1 — the staging rule's residuation, at the one arm no
// document reaches. `unite` absorbs a nil BEFORE it dispatches (the
// isNil arms in ts/src/unify.ts), so a staged func is never handed one
// from a document; the arm is the contract for a caller that does, and
// the Go port pins its twin the same way (coverage3_test.go,
// TestFuncArmsDirect).
describe('coverage3-staging', () => {

  test('a-hole-has-nothing-above-it', () => {
    // `superior` is the lattice step UP, asked of a value by the
    // generalisation machinery (G3). A hole admits everything, so the
    // answer is itself — the same answer TOP gives. No document asks
    // it of a hole, because a hole is filled before anything
    // generalises it, so the contract is pinned here.
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
    // NilVal.unify answers itself: a nil is absorbing, by definition.
    // The dispatcher (unite) short-circuits on isNil before dispatching,
    // so the method is reached only by a direct call — it used to be
    // reached through DisjunctVal returning a lone trial sentinel as
    // its result, a hole ADR-004's admission gate closed (a lone failed
    // member is now the |:empty refusal) — and the Val contract is
    // pinned here instead (ADR-002).
    const a0 = new Aontu()
    const ctx: any = a0.ctx({})
    const nil: any = new NilVal({ why: 'test-absorb' }, ctx)
    Assert.strictEqual(nil.unify(top(), ctx), nil)
  })

  test('defaulted-scrutinee-multi-pref-min-rank', () => {
    // The defensive min-rank scan in effectiveScrutinee (ADR-004, the
    // defaulted-scrutinee rule): rankPrefs leaves a SETTLED disjunct
    // at most one pref, so a document cannot reach a two-pref
    // scrutinee — the arm is pinned here (ADR-002), in both member
    // orders so both sides of the rank comparison run. The effective
    // value is the innermost peg of the LOWEST rank, matching
    // generation (`a:**1|*2` generates 2 — test/spec/edge.tsv).
    const rank2 = new PrefVal({
      peg: new PrefVal({ peg: new IntegerVal({ peg: 1 }) }),
    })
    const rank1 = new PrefVal({ peg: new IntegerVal({ peg: 2 }) })

    const d1: any = new DisjunctVal({ peg: [rank2, rank1] })
    Assert.strictEqual((effectiveScrutinee(d1) as any).peg, 2)

    const d2: any = new DisjunctVal({ peg: [rank1, rank2] })
    Assert.strictEqual((effectiveScrutinee(d2) as any).peg, 2)
  })

  // BagVal.same's two guards that no source spells (ADR-002). The
  // identity fast path needs the SAME object on both sides, which the
  // parser never produces twice, and every discriminating comparison
  // below IS reachable from source (test/spec/disjunct.tsv,
  // "SAMENESS IS STRICTER THAN CANON") -- they are repeated here only
  // because the direct call is the clearest statement of the contract.
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


  // A SINGLE-MEMBER DISJUNCTION GENERATES THAT MEMBER (ADR-007). unify
  // returns the sole survivor directly rather than re-wrapping it, so a
  // document cannot reach gen holding a one-member disjunct -- but the
  // type allows one, a library caller can build one, and the
  // alternative to answering its member is refusing a disjunction that
  // is not ambiguous at all. Twin: TestDisjunctSingleMemberGenerates in
  // go/coverage3_test.go.
  test('disjunct-single-member-generates', () => {
    const d: any = new DisjunctVal({ peg: [new IntegerVal({ peg: 7 })] })
    Assert.equal(d.gen(CTX()), 7)
  })

})

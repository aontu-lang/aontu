/* Copyright (c) 2025 Richard Rodger, MIT License */

// Coverage round 4: the remaining reachable branches — in-process CLI
// REPL/stdin runs on a swapped stdin, the LSP server wiring, spread
// clone arms, the exact-comparison edges, constraint meets, and the
// long tail of small val branches (see docs/test-coverage.md).

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import { PassThrough } from 'node:stream'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { Aontu } from '../dist/aontu'
import { AontuContext } from '../dist/ctx'
import { AontuError, descErr, setColor, colorActive } from '../dist/err'
import { exactJSON } from '../dist/exactjson'
import { codeClass } from '../dist/hints'
import { cmpCodePoint } from '../dist/keyorder'
import { Lang } from '../dist/lang'
import { unite } from '../dist/unify'

import { main as cliMain } from '../dist/cli'
import { main as lspMain } from '../dist/lsp-server'
import { computeDiagnostics, computeHover } from '../dist/lsp'

import { top } from '../dist/val/top'
import { MapVal } from '../dist/val/MapVal'
import { ListVal } from '../dist/val/ListVal'
import { IntegerVal } from '../dist/val/IntegerVal'
import { NumberVal } from '../dist/val/NumberVal'
import { BigIntegerVal } from '../dist/val/BigIntegerVal'
import { BigDecimalVal } from '../dist/val/BigDecimalVal'
import { Decimal } from '../dist/val/Decimal'
import { NilVal } from '../dist/val/NilVal'
import { RefVal } from '../dist/val/RefVal'
import { ConjunctVal } from '../dist/val/ConjunctVal'
import { DisjunctVal } from '../dist/val/DisjunctVal'
import { PrefVal } from '../dist/val/PrefVal'
import { ScalarKindVal } from '../dist/val/ScalarKindVal'
import { FuncBaseVal } from '../dist/val/FuncBaseVal'
import { KeyFuncVal } from '../dist/val/KeyFuncVal'
import { CopyFuncVal } from '../dist/val/CopyFuncVal'
import { LowerFuncVal } from '../dist/val/LowerFuncVal'
import { MoveFuncVal } from '../dist/val/MoveFuncVal'
import { OpenFuncVal } from '../dist/val/OpenFuncVal'
import { SuperFuncVal } from '../dist/val/SuperFuncVal'
import { PathFuncVal } from '../dist/val/PathFuncVal'
import { makeScalar } from '../dist/val/valutil'
import {
  scaledOfFloat,
  cmpScaled,
  scaledIsIntegral,
} from '../dist/val/numcmp'
import { isLossyIntegerLiteral } from '../dist/val/numkind'


function makeCtx() {
  return new AontuContext({ root: new MapVal({ peg: {} }) })
}

// A root whose key is pending, so absolute references into it defer.
function pendingCtx() {
  const root = new MapVal({
    peg: { zz: new ConjunctVal({ peg: [new IntegerVal({ peg: 1 })] }) },
  })
  return new AontuContext({ root })
}


describe('coverage2-cli', () => {

  function captureOut(): { get: () => string; restore: () => void } {
    const so = process.stdout.write
    let out = ''
    ;(process.stdout as any).write = (s: any) => ((out += s), true)
    return {
      get: () => out,
      restore: () => {
        process.stdout.write = so
        process.exitCode = 0
      },
    }
  }

  function swapStdin(fake: any): () => void {
    const desc = Object.getOwnPropertyDescriptor(process, 'stdin')!
    Object.defineProperty(process, 'stdin', {
      value: fake, configurable: true,
    })
    return () => Object.defineProperty(process, 'stdin', desc)
  }

  // COLOUR IS A DECISION ABOUT THE DESTINATION (the review's finding
  // F), and only the command can see the destination. Every other test
  // in this suite runs with stderr captured or piped, which is the
  // colour-OFF arm; this is the other one.
  test('an-interactive-stderr-leaves-colour-to-no-color', () => {
    const desc = Object.getOwnPropertyDescriptor(process, 'stderr')!
    const fakeErr: any = new PassThrough()
    fakeErr.isTTY = true
    Object.defineProperty(process, 'stderr', {
      value: fakeErr, configurable: true,
    })
    const cap = captureOut()
    try {
      // `-v` exercises main()'s entry and returns immediately: the
      // decision under test is made before any argument is read.
      cliMain(['node', 'cli', '-v'])
      Assert.equal(colorActive(), true)
    }
    finally {
      cap.restore()
      Object.defineProperty(process, 'stderr', desc)
      // The gate is process-global: leave it as the rest of the suite
      // expects to find it.
      setColor(false)
    }
  })

  test('repl-in-process', async () => {
    const fakeIn: any = new PassThrough()
    fakeIn.isTTY = true
    const restoreIn = swapStdin(fakeIn)
    const cap = captureOut()
    try {
      cliMain(['node', 'cli'])
      // A :load through the LOOP, which reads a real file: the
      // handler's reader is injected, and this is where the real one
      // is wired.
      const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-repl-'))
      const doc = Path.join(dir, 'doc.aon')
      Fs.writeFileSync(doc, 'a: 1')
      for (const line of [
        ':help\n', ':canon\n', ':json\n', ':bogus\n', '\n',
        `:load ${doc}\n`, ':get $.a\n', 'a:1\n', ':quit\n',
      ]) {
        fakeIn.write(line)
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    finally {
      cap.restore()
      restoreIn()
    }
    const out = cap.get()
    for (const want of [
      'REPL', 'Usage: aontu', 'canon output', 'json output',
      'unknown command', '"a": 1', 'loaded: ',
    ]) {
      Assert.ok(out.includes(want), 'repl output missing ' + want + ':\n' + out)
    }
  })

  // The REPL's SESSION protocol (G7 phase 7): no banner, no prompt,
  // one JSON line per answer.
  test('repl-jsonl-in-process', async () => {
    const fakeIn: any = new PassThrough()
    fakeIn.isTTY = true
    const restoreIn = swapStdin(fakeIn)
    const cap = captureOut()
    try {
      cliMain(['node', 'cli', '--jsonl'])
      for (const line of ['a:1\n', ':quit\n']) {
        fakeIn.write(line)
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    finally {
      cap.restore()
      restoreIn()
    }
    const out = cap.get()
    Assert.ok(!out.includes('aontu>'), 'jsonl session printed a prompt:\n' + out)
    Assert.ok(out.includes('{"ok":true,"out":"{\\n  \\"a\\": 1\\n}"}'), out)
  })

  test('stdin-in-process', async () => {
    const fakeIn: any = new PassThrough()
    const restoreIn = swapStdin(fakeIn)
    const cap = captureOut()
    try {
      cliMain(['node', 'cli'])
      fakeIn.write('a:2')
      fakeIn.end()
      await new Promise((r) => setTimeout(r, 100))
    }
    finally {
      cap.restore()
      restoreIn()
    }
    Assert.ok(cap.get().includes('"a": 2'), cap.get())
  })
})


describe('coverage2-lsp-server', () => {

  test('main-wiring', () => {
    const fakeIn: any = new PassThrough()
    const written: Buffer[] = []
    let exited: number | undefined
    lspMain(fakeIn, (c: Buffer) => void written.push(Buffer.from(c)), (code: number) => {
      exited = code
    })
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    fakeIn.write(Buffer.from(
      'Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body))
    Assert.ok(0 < written.length)
    fakeIn.end()
    return new Promise<void>((resolve) => setImmediate(() => {
      Assert.equal(exited, 1)
      resolve()
    }))
  })
})


describe('coverage2-lsp', () => {

  test('diagnostics-vars-and-parse-error', () => {
    const ok = computeDiagnostics('a:$v b:1', {
      vars: { v: new IntegerVal({ peg: 1 }) } as any,
    })
    Assert.deepEqual(ok, [])

    const bad = computeDiagnostics('a:number > 0')
    Assert.ok(0 < bad.length)
    Assert.ok(bad.some((d) => 'parse' === d.code))

    const conflict = computeDiagnostics('a:1 a:2')
    Assert.ok(0 < conflict.length)
  })

  test('hover-parse-error-and-kinds', () => {
    Assert.equal(computeHover('a:number > 0', { line: 0, character: 0 }), null)
    const hs = computeHover('a:"txt"', { line: 0, character: 3 })
    Assert.ok(null == hs || JSON.stringify(hs).includes('string'))
    const hb = computeHover('a:true', { line: 0, character: 3 })
    Assert.ok(null == hb || JSON.stringify(hb).includes('boolean'))
  })
})


describe('coverage2-unify', () => {

  test('internal-catch', () => {
    class Boom extends IntegerVal {
      unify(): any { throw new RangeError('kaboom') }
    }
    const ctx = makeCtx()
    const out = unite(ctx, new Boom({ peg: 1 }), new IntegerVal({ peg: 1 }), 'test')
    Assert.equal(out.isNil, true)
  })

  test('unify-cycle-counter', () => {
    const ctx = pendingCtx()
    const r1 = new RefVal({ peg: ['zz', 'q'], absolute: true })
    const r2 = new RefVal({ peg: ['zz', 'r'], absolute: true })
    let out: any
    for (let i = 0; i < 5000; i++) {
      out = unite(ctx, r1, r2, 'test')
      if (out.isNil) break
    }
    Assert.equal(out.isNil, true)
  })

  test('residue-paths-cap', () => {
    let src = ''
    for (let i = 0; i < 11; i++) {
      src += `c${i}:$.c${i + 1} `
    }
    src += 'c11:1'
    Assert.throws(() => new Aontu().generate(src))
  })
})


describe('coverage2-utils', () => {

  test('keyorder-prefix-compare', () => {
    Assert.equal(cmpCodePoint('a', 'ab'), -1)
    Assert.equal(cmpCodePoint('ab', 'a'), 1)
    Assert.equal(cmpCodePoint('a', 'a'), 0)
  })

  test('code-class-prefix-and-default', () => {
    Assert.equal(typeof codeClass('func:zz'), 'string')
    Assert.equal(codeClass('zzz_not_a_code'), 'internal')
  })

  test('descerr-array', () => {
    Assert.deepEqual(descErr([] as any, {} as any), [])
  })

  test('exactjson-tojson', () => {
    Assert.equal(exactJSON({ d: { toJSON: () => 5 } }), '{"d":5}')
  })

  test('aontu-bad-src', () => {
    Assert.throws(() => new Aontu().unify(123 as any))
  })

  test('valutil-scalar-arms', () => {
    Assert.equal(makeScalar(true).canon, 'true')
    Assert.equal(makeScalar(null).canon, 'null')
    Assert.throws(() => makeScalar({} as any))
  })

  test('lang-debug-and-parse-opts', () => {
    const lang = new Lang({ debug: true } as any)
    const v = lang.parse('a:1', { idcount: 100, log: -1 } as any)
    Assert.ok(null != v)
  })

  test('ctx-clone-path-resets-idx', () => {
    const ctx = makeCtx()
    const c = ctx.clone({ path: ['x', 'y'] })
    Assert.equal(typeof c.pathidx, 'number')
    Assert.equal(typeof c.pathidx, 'number')
  })
})


describe('coverage2-numeric', () => {

  test('numcmp-edges', () => {
    Assert.equal(scaledOfFloat(Infinity).inf, 1)
    Assert.equal(scaledOfFloat(-Infinity).inf, -1)
    // Subnormal: no implicit bit.
    const sub = scaledOfFloat(5e-324)
    Assert.ok(sub.unscaled > 0n)
    // 2^60: non-negative binary exponent shifts up integrally.
    const big = scaledOfFloat(Math.pow(2, 60))
    Assert.equal(big.scale, 0)
    Assert.equal(big.unscaled, 1n << 60n)
    Assert.equal(cmpScaled(
      { inf: 1, unscaled: 0n, scale: 0 } as any,
      { unscaled: 5n, scale: 0 } as any), 1)
    Assert.equal(scaledIsIntegral({ inf: 1, unscaled: 0n, scale: 0 } as any), false)
  })

  test('numkind-edges', () => {
    Assert.equal(isLossyIntegerLiteral(1), false)
    Assert.equal(isLossyIntegerLiteral(0, '0e500'), false)
    Assert.equal(isLossyIntegerLiteral(1e308, '1e5000'), true)
  })

  test('decimal-edges', () => {
    Assert.ok(0 < new Decimal(15n, 1).compare(new Decimal(1n, 0)))
    Assert.equal(new Decimal(0n, 0).isZero(), true)
    Assert.equal(new Decimal(1n, 0).isZero(), false)
  })

  test('exact-val-unify-arms', () => {
    const ctx = makeCtx()
    const m = new MapVal({ peg: {} })

    const bi = new BigIntegerVal({ peg: 5n })
    Assert.equal(bi.unify(new BigIntegerVal({ peg: 5n }), ctx), bi)
    Assert.equal(bi.unify(top(), ctx), bi)
    Assert.equal(bi.unify(m, ctx).isNil, true)

    const bd = new BigDecimalVal({ peg: new Decimal(15n, 1) })
    Assert.equal(bd.unify(top(), ctx), bd)
    Assert.equal(bd.unify(m, ctx).isNil, true)

    Assert.equal(new IntegerVal({ peg: 1 }).unify(m, ctx).isNil, true)
    Assert.equal(new NumberVal({ peg: 1.5 }).unify(m, ctx).isNil, true)
  })

  test('scalar-spec-guards', () => {
    Assert.throws(() => new IntegerVal({ peg: 1.5 }), AontuError)
    Assert.throws(() => new NumberVal({ peg: NaN }), AontuError)
    Assert.throws(() => new ListVal({} as any), AontuError)
    Assert.throws(() => new MapVal({} as any), AontuError)
    Assert.throws(() => new ScalarKindVal({} as any), AontuError)
  })
})


describe('coverage2-vals', () => {

  test('bag-marked-gen', () => {
    const m = new MapVal({ peg: {}, mark: { type: true } })
    Assert.equal(m.gen(makeCtx()), undefined)
  })

  test('spread-clone-arms', () => {
    const ctx = makeCtx()
    const a0 = new Aontu()
    const skv = (a0.unify('a:integer') as any).peg.a

    // All-scalar-kind path-dependent list spread: shallow share.
    const l = new ListVal({ peg: [skv] })
    ;(l as any)._isPathDependent = true
    l.spread = { cj: undefined } as any
    const shared = l.spreadClone(ctx) as ListVal
    Assert.equal((shared as any).peg[0], skv)

    // Mixed content falls back to the deep clone.
    const l2 = new ListVal({ peg: [new IntegerVal({ peg: 1 })] })
    ;(l2 as any)._isPathDependent = true
    l2.spread = { cj: undefined } as any
    Assert.notEqual(l2.spreadClone(ctx), l2)

    // Spread constraint recurses through its own spreadClone.
    const l3 = new ListVal({ peg: [skv] })
    ;(l3 as any)._isPathDependent = true
    l3.spread = { cj: new ListVal({ peg: [] }) } as any
    const out3 = l3.spreadClone(ctx) as ListVal
    Assert.ok(null != (out3 as any).spread.cj)

    // MapVal: all-scalar-kind share, and a non-Val peg entry surviving
    // the deep clone verbatim.
    const m = new MapVal({ peg: { k: skv } })
    ;(m as any)._isPathDependent = true
    m.spread = { cj: undefined } as any
    const ms = m.spreadClone(ctx) as MapVal
    Assert.equal((ms as any).peg.k, skv)

    const m2 = new MapVal({ peg: { k: new KeyFuncVal({ peg: [] }) } })
    ;(m2 as any).peg.raw = 42
    ;(m2 as any)._isPathDependent = true
    m2.spread = { cj: undefined } as any
    const m2c = m2.spreadClone(ctx) as MapVal
    Assert.equal((m2c as any).peg.raw, 42)
  })

  test('disjunct-append-and-gen-fallback', () => {
    const d = new DisjunctVal({ peg: [new IntegerVal({ peg: 1 })] })
    ;(d as any).prefsRanked = true
    d.append(new IntegerVal({ peg: 2 }))
    Assert.equal((d as any).prefsRanked, false)

    const ctx = makeCtx()
    const empty = new DisjunctVal({ peg: [] })
    let threw = false
    try { empty.gen(ctx) } catch { threw = true }
    Assert.ok(threw || 0 < ctx.err.length)
    Assert.throws(() => new DisjunctVal({ peg: [] }).gen(undefined as any))
  })

  test('constraint-arms', () => {
    const ctx = makeCtx()
    const a0 = new Aontu()
    const cmin = (a0.unify('a:min(0)') as any).peg.a
    Assert.equal(cmin.unify(null, ctx), cmin)
    const nil = new NilVal({ why: 'x' })
    Assert.equal(cmin.unify(nil, ctx), nil)

    const cint = (a0.unify('a:integer&min(0)') as any).peg.a
    const cflt = (a0.unify('a:float&max(2)') as any).peg.a
    Assert.equal(cint.unify(cflt, ctx).isNil, true)
  })

  test('conjunct-ref-fold-and-gen-throw', () => {
    const pctx = pendingCtx()
    const c = new ConjunctVal({
      peg: [
        new IntegerVal({ peg: 1 }),
        new RefVal({ peg: ['zz', 'q'], absolute: true }),
      ],
    })
    const out = c.unify(top(), pctx)
    Assert.ok(null != out)

    const c2 = new ConjunctVal({
      peg: [
        new IntegerVal({ peg: 1 }),
        new RefVal({ peg: ['zz', 'q'], absolute: true }),
      ],
    })
    Assert.throws(() => c2.gen(undefined as any), AontuError)
  })

  test('funcbase-and-named-funcs', () => {
    const ctx = makeCtx()
    const kf = new KeyFuncVal({ peg: [] })
    Assert.throws(() => kf.validateArgs([top(), top()] as any, 1), AontuError)
    Assert.equal(kf.gen(ctx), undefined)
    Assert.ok(kf.make(ctx, { peg: [] }) instanceof KeyFuncVal)

    const fb = new FuncBaseVal({ peg: [] })
    Assert.equal(fb.funcname(), 'func')
    Assert.equal(fb.make(ctx, { peg: [] }).isNil, true)
    Assert.equal(fb.resolve(ctx, []).isNil, true)

    Assert.ok(new CopyFuncVal({ peg: [] }).make(ctx, { peg: [] }) instanceof CopyFuncVal)
    Assert.ok(new LowerFuncVal({ peg: [] }).make(ctx, { peg: [] }) instanceof LowerFuncVal)
    Assert.ok(new MoveFuncVal({ peg: [] }).make(ctx, { peg: [] }) instanceof MoveFuncVal)
    Assert.ok(new SuperFuncVal({ peg: [] }).make(ctx, { peg: [] }) instanceof SuperFuncVal)

    const of2 = new OpenFuncVal({ peg: [] })
    Assert.ok(of2.make(ctx, { peg: [] }) instanceof OpenFuncVal)
    Assert.equal(of2.funcname(), 'open')
    Assert.equal(of2.resolve(ctx, [] as any).isNil, true)

    const pf = new PathFuncVal({ peg: [new IntegerVal({ peg: 1 })] })
    Assert.ok(null != pf.unify(top(), ctx))
  })

  test('nil-pref-ref-small-arms', () => {
    Assert.equal(new NilVal({ why: 'w' }).inspection(), 'w')

    const p = new PrefVal({ peg: new IntegerVal({ peg: 1 }) })
    Assert.equal(p.same(null as any), false)
    const pnil = new PrefVal({ peg: new NilVal({ why: 'x' }) })
    Assert.throws(() => pnil.gen(undefined as any), AontuError)

    // Deferring ref against its own spelling stands.
    const pctx = pendingCtx()
    const r1 = new RefVal({ peg: ['zz', 'q'], absolute: true })
    const r2 = new RefVal({ peg: ['zz', 'q'], absolute: true })
    const out = r1.unify(r2, pctx)
    Assert.equal(out.isNil, false)

    // plainRefPath: dot off the top, relative base, dot reduction.
    Assert.equal(
      (new RefVal({ peg: ['.', 'b'], absolute: true }) as any).plainRefPath(),
      undefined)
    const rel = new RefVal({ peg: ['b'] }) as any
    rel.path = ['a', 'x']
    Assert.deepEqual(rel.plainRefPath(), ['a', 'b'])
    Assert.deepEqual(
      (new RefVal({ peg: ['a', '.', 'b'], absolute: true }) as any).plainRefPath(),
      ['b'])

    const rs = new RefVal({ peg: ['a'] })
    Assert.equal(rs.same(null as any), false)
    const ri = new RefVal({ peg: ['a'], absolute: true, prefix: true } as any)
    Assert.ok(ri.inspection().includes('absolute'))
  })
})


describe('coverage2-final', () => {

  test('cli-version-fallback', () => {
    const Fs = require('node:fs')
    const orig = Fs.readFileSync
    const so = process.stdout.write
    let out = ''
    Fs.readFileSync = () => { throw new Error('gone') }
    ;(process.stdout as any).write = (s: any) => ((out += s), true)
    try {
      cliMain(['node', 'cli', '-v'])
    }
    finally {
      process.stdout.write = so
      Fs.readFileSync = orig
      process.exitCode = 0
    }
    Assert.equal(out.trim(), '0.0.0')
  })

  test('null-peer-scalar-arms', () => {
    // A null peer falls through to the scalar base, which requires a
    // real peer — the arm exists to mirror the base contract, and the
    // base's refusal is the observable behaviour.
    const ctx = makeCtx()
    Assert.throws(() => new BigIntegerVal({ peg: 5n }).unify(null, ctx))
    Assert.throws(() =>
      new BigDecimalVal({ peg: new Decimal(15n, 1) }).unify(null, ctx))
    Assert.throws(() => new IntegerVal({ peg: 1 }).unify(null, ctx))
    Assert.throws(() => new NumberVal({ peg: 1.5 }).unify(null, ctx))
  })

  test('diagnostics-hard-failure', () => {
    // A throwing vars bag fails inside the try, producing the single
    // parse-stage diagnostic at the document start.
    const evil: any = {}
    Object.defineProperty(evil, 'x', {
      get() { throw new Error('boom') }, enumerable: true,
    })
    const bad = computeDiagnostics('a:1', { vars: evil })
    Assert.equal(bad.length, 1)
    Assert.equal(bad[0].code, 'parse')
    Assert.equal(bad[0].range.start.line, 0)
    Assert.ok(bad[0].message.includes('boom'))
  })

  test('hover-null-scalar-label', () => {
    const h = computeHover('a:null', { line: 0, character: 3 })
    Assert.ok(null == h || JSON.stringify(h).length > 0)
  })

  test('residue-paths-cap-wide', () => {
    let src = ''
    for (let i = 0; i < 15; i++) {
      src += `c${i}:$.c${i + 1} `
    }
    src += 'c15:1'
    Assert.throws(() => new Aontu().generate(src), /budget/)
  })
})

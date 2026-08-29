/* Copyright (c) 2020-2025 Richard Rodger and other contributors, MIT License */


import Fs from 'node:fs'
import { describe, test } from 'node:test'
import { memfs as Memfs } from 'memfs'
import { expect } from './expect'
import { MapVal } from '../dist/val/MapVal'

import { Lang, Aontu, AontuContext } from '../dist/aontu'
import { srcPath } from './srcpath'

type FST = typeof Fs


describe('aontu', function() {

  test('basic-api', async () => {
    let a0 = new Aontu()

    let p0 = a0.parse('a:number')
    expect(p0?.canon).equal('{"a":number}')

    let v0 = a0.unify('a:1')
    expect(v0?.canon).equal('{"a":1}')

    let v0a = a0.unify(v0 as any)
    expect(v0a?.canon).equal('{"a":1}')

    let d0 = a0.generate('a:2')
    expect(d0).equal({ a: 2 })
  })


  test('error-api', async () => {
    let a0 = new Aontu()

    expect(() => a0.parse('a::number')).throws(/unexpected char/)
    expect((a0 as any).parse('a:number a:A').canon).equal('{"a":number&"A"}')

    expect(() => a0.unify('a::1')).throws(/unexpected char/)
    expect(() => a0.unify('a:1 a:2')).throws(/Cannot unify value: 2 with value: 1/)

    expect(() => a0.generate('a::A')).throws(/unexpected char/)
    expect(() => a0.generate('a:A a:B')).throws(/Cannot unify value: "B" with value: "A"/)
  })


  test('clone', async () => {
    let a0 = new Aontu()

    const v0 = a0.unify('a:1')

    const c0 = makeCtx()
    const v0c = v0.clone(c0)

    expect(v0.done).equal(v0c.done)
  })


  test('happy', async () => {
    let ctx = makeCtx()
    let a0 = new Aontu()

    let v0 = a0.unify('a:1') as any
    expect(v0.canon).equal('{"a":1}')

    expect((a0.unify('a:{b:1},a:{c:2}') as any).canon).equal('{"a":{"b":1,"c":2}}')
    expect((a0.unify('a:b:1,a:c:2') as any).canon).equal('{"a":{"b":1,"c":2}}')

    expect(
      (a0.unify(`
a:{b:1}
a:{c:2}
`) as any).canon
    ).equal('{"a":{"b":1,"c":2}}')

    let p0 = new Lang()

    expect(
      p0.parse(`
u: { x: 1, y: number}
q: a: $.u
w: b: $.q.a & {y:2,z:3}
`).canon
    ).equal(
      '{"q":{"a":$.u},"u":{"x":1,"y":number},"w":{"b":$.q.a&{"y":2,"z":3}}}'
    )

    expect(
      (a0.unify(`
q: a: { x: 1 }
w0: b: $.q.a & {y:2,z:3}
w1: b: {y:2,z:3} & $.q.a
`) as any).gen(ctx)
    ).equal({
      q: { a: { x: 1 } },
      w0: { b: { x: 1, y: 2, z: 3 } },
      w1: { b: { x: 1, y: 2, z: 3 } },
    })

    // TODO: fix in jsonic
    expect((a0.unify('{a:b:1\na:c:2}') as any).canon).equal('{"a":{"b":1,"c":2}}')
  })


  // TODO: create ctx.test.ts
  /*
  test('util', async () => {
    expect(util.options('x')).include({ src: 'x', print: 0 })
    expect(util.options('x', { print: 1 })).include({ src: 'x', print: 1 })
    expect(util.options({ src: 'x' }, { print: 1 })).include({
      src: 'x',
      print: 1,
    })
    expect(
      util.options({ src: 'x', print: 1 }, { src: 'y', print: 2 })
    ).include({ src: 'y', print: 2 })
  })
  */

  test('file', async () => {
    let ctx = makeCtx()
    let a0 = new Aontu()

    let v0 = a0.unify('@"' + srcPath(__dirname) + '/../test/t02sys.aon"') as any

    expect(v0.canon).equal(
      '{"ent":{"bar":{"fields":{"f0":{"kind":"Number"}},"name":"bar"},"foo":{"fields":{"f0":{"kind":"String"}},"name":"foo"}},"sys":{"ent":{"name":string}}}'
    )

    expect(v0.gen(ctx)).equal({
      // sys: { ent: { name: undefined } },
      ent: {
        foo: {
          name: 'foo',
          fields: {
            f0: {
              kind: 'String',
            },
          },
        },
        bar: {
          name: 'bar',
          fields: {
            f0: {
              kind: 'Number',
            },
          },
        },
      },
    })
  })


  test('pref', async () => {
    let a0 = new Aontu()

    try {
      a0.unify('@"' + srcPath(__dirname) + '/../test/t03uxc.aon"', {
        base: __dirname,
      })
    }
    catch (err: any) {
      expect(err.message).include('Cannot unify value: integer|*1 with value: true')
    }
  })


  test('map-spread', () => {
    let a0 = new Aontu()

    let v0 = a0.unify('c:{&:{x:2},y:{k:3},z:{k:4}}') as any
    expect(v0.canon).equal(
      '{"c":{&:{"x":2},"y":{"k":3,"x":2},"z":{"k":4,"x":2}}}'
    )

    let v1 = a0.unify('c:{&:{x:2},z:{k:4}},c:{y:{k:3}}') as any

    expect(v1.canon).equal(
      '{"c":{&:{"x":2},"y":{"k":3,"x":2},"z":{"k":4,"x":2}}}'
    )

    let v10 = a0.unify('a:{&:{x:1}},b:.a,b:{y:{k:2}},c:{&:{x:2}},c:{y:{k:3}}') as any
    expect(v10.canon).equal(
      '{"a":{&:{"x":1}},' +
      '"b":{&:{"x":1},"y":{"k":2,"x":1}},' +
      '"c":{&:{"x":2},"y":{"k":3,"x":2}}}'
    )
  })


  test('empty-and-comments', () => {
    let ctx = makeCtx()
    let a0 = new Aontu()

    expect(a0.unify('').gen(ctx)).equal({})
    expect(a0.unify(`
    # comment
    `).gen(ctx)).equal({})

    expect(a0.unify(undefined as any).gen(ctx)).equal({})


    expect(a0.parse('')?.isMap).equal(true)
    expect(a0.parse(null as any)?.isMap).equal(true)
    expect(a0.parse(undefined as any)?.isMap).equal(true)

    expect(a0.unify('')?.isMap).equal(true)
    expect(a0.unify(null as any)?.isMap).equal(true)
    expect(a0.unify(undefined as any)?.isMap).equal(true)

    expect(a0.generate('')).equal({})
    expect(a0.generate(null as any)).equal({})
    expect(a0.generate(undefined as any)).equal({})
  })


  test('spread-edges', () => {
    let ctx = makeCtx()
    let a0 = new Aontu()

    expect(a0.unify('a:b:{} a:&:{x:1}').gen(ctx)).equal({ a: { b: { x: 1 } } })

    expect(a0.unify('a:{} &:{x:1}').gen(ctx)).equal({ a: { x: 1 } })
  })


  test('key-edges', () => {
    let ctx = makeCtx()
    let a0 = new Aontu()

    expect(a0.unify('a:{k:key()}').gen(ctx)).equal({ a: { k: 'a' } })
    expect(a0.unify('a:b:{k:key()}').gen(ctx)).equal({ a: { b: { k: 'b' } } })

    expect(a0.unify('a:{k:key()} x:1').gen(ctx)).equal({ x: 1, a: { k: 'a' } })
    expect(a0.unify('a:b:{k:key()} x:1').gen(ctx)).equal({ x: 1, a: { b: { k: 'b' } } })

    expect(a0.unify('x:1 a:{k:key()}').gen(ctx)).equal({ x: 1, a: { k: 'a' } })
    expect(a0.unify('x:1 a:b:{k:key()}').gen(ctx)).equal({ x: 1, a: { b: { k: 'b' } } })
  })


  test('practical-path-spread', () => {
    let ctx = makeCtx()
    let a0 = new Aontu()

    let v0 = a0.unify(`
micks: $.def.garage & {

  porsche: {
    color: silver
  }

  ferrari: {
    color: red
  }

  telsa: {
  }
}

def: car: {
  doors: *4 | number
  color: *green | string
}

def: garage: {
  &: $.def.car
}
`)

    expect(v0.gen(ctx)).equal({
      micks: {
        porsche: { doors: 4, color: 'silver' },
        ferrari: { doors: 4, color: 'red' },
        telsa: { doors: 4, color: 'green' }
      },
      def: { car: { doors: 4, color: 'green' }, garage: {} }
    })

  })


  test('virtual-fs', () => {
    let a0 = new Aontu()

    const mfs = Memfs({
      'foo.aon': '{f:11}'
    })
    const fs = mfs.fs as unknown as FST
      ; (fs as any).aaa = 1

    /*
    let v0 = a0.unify(`a:@"/foo.aon"`, { fs })
    expect(v0.canon).equal(
      '{"a":{"f":11}}'
    )
    */

    let v1 = a0.unify(`a:@"foo.aon"`, { fs, path: '/' })
    expect(v1.canon).equal(
      '{"a":{"f":11}}'
    )
  })

  test('deep-hierarchy', () => {
    let a0 = new Aontu()

    // Simple deep nesting
    expect(a0.generate('a:b:c:d:e:1')).equal({ a: { b: { c: { d: { e: 1 } } } } })

    // Deep nesting with merge at leaf
    expect(a0.generate('a:b:c:d:1 a:b:c:e:2')).equal(
      { a: { b: { c: { d: 1, e: 2 } } } }
    )

    // Deep nesting with merge at multiple levels
    expect(a0.generate('a:b:c:1 a:b:d:2 a:e:3')).equal(
      { a: { b: { c: 1, d: 2 }, e: 3 } }
    )

    // Deep nesting with type constraint
    expect(a0.generate('a:b:c:d:e:number a:b:c:d:e:42')).equal(
      { a: { b: { c: { d: { e: 42 } } } } }
    )

    // Deep ref through hierarchy
    expect(a0.generate('a:b:c:1 d:$.a.b.c')).equal({ a: { b: { c: 1 } }, d: 1 })

    // Deep ref to nested map
    expect(a0.generate('a:b:{c:1,d:2} e:$.a.b')).equal(
      { a: { b: { c: 1, d: 2 } }, e: { c: 1, d: 2 } }
    )
  })


  test('deep-hierarchy-spread', () => {
    let a0 = new Aontu()

    // Spread at depth
    expect(a0.generate('a:b:{&:string,c:C,d:D}')).equal(
      { a: { b: { c: 'C', d: 'D' } } }
    )

    // Spread with nested map constraint at depth
    expect(a0.generate('a:b:{&:{x:number},c:{x:1},d:{x:2}}')).equal(
      { a: { b: { c: { x: 1 }, d: { x: 2 } } } }
    )

    // Deep spread with ref to type constraint (verify canon)
    expect(a0.unify('t:{x:number} a:b:{&:$.t,c:{x:1},d:{x:2}}').canon).equal(
      '{"a":{"b":{&:$.t,"c":{"x":1},"d":{"x":2}}},"t":{"x":number}}'
    )

    // Deep spread with ref to concrete map
    expect(a0.generate('t:{x:1} a:b:{&:$.t,c:{y:A},d:{y:B}}')).equal(
      { t: { x: 1 }, a: { b: { c: { x: 1, y: 'A' }, d: { x: 1, y: 'B' } } } }
    )

    // Spread with key() at depth
    expect(a0.generate('a:b:{&:{name:key()},c:{},d:{}}')).equal(
      { a: { b: { c: { name: 'c' }, d: { name: 'd' } } } }
    )

    // Nested maps with spread at inner level
    expect(a0.generate(`
      a: {
        b: {
          &: { y: string }
          c: { y: Y }
          d: { y: Z }
        }
        e: {
          &: { z: number }
          f: { z: 1 }
          g: { z: 2 }
        }
      }
    `)).equal({
      a: {
        b: {
          c: { y: 'Y' },
          d: { y: 'Z' },
        },
        e: {
          f: { z: 1 },
          g: { z: 2 },
        },
      }
    })
  })


  test('deep-hierarchy-pref', () => {
    let a0 = new Aontu()

    // Pref at depth
    expect(a0.generate('a:b:c:*1|number')).equal({ a: { b: { c: 1 } } })

    // Override pref at depth
    expect(a0.generate('a:b:c:*1|number a:b:c:2')).equal({ a: { b: { c: 2 } } })

    // Spread with pref at depth
    expect(a0.generate('a:b:{&:x:*1|number,c:{},d:{}}')).equal(
      { a: { b: { c: { x: 1 }, d: { x: 1 } } } }
    )

    // Override spread pref at depth
    expect(a0.generate('a:b:{&:x:*1|number,c:{x:2},d:{}}')).equal(
      { a: { b: { c: { x: 2 }, d: { x: 1 } } } }
    )
  })


  test('deep-hierarchy-wide', () => {
    let a0 = new Aontu()

    // Wide map at depth with spread
    expect(a0.generate(`
      root: level1: {
        &: { v: number }
        a: { v: 1 }
        b: { v: 2 }
        c: { v: 3 }
        d: { v: 4 }
        e: { v: 5 }
        f: { v: 6 }
        g: { v: 7 }
        h: { v: 8 }
      }
    `)).equal({
      root: {
        level1: {
          a: { v: 1 }, b: { v: 2 }, c: { v: 3 }, d: { v: 4 },
          e: { v: 5 }, f: { v: 6 }, g: { v: 7 }, h: { v: 8 },
        }
      }
    })

    // Wide + deep with merge
    expect(a0.generate(`
      a:b:c:x:1
      a:b:c:y:2
      a:b:d:x:3
      a:b:d:y:4
      a:e:f:x:5
      a:e:f:y:6
    `)).equal({
      a: {
        b: { c: { x: 1, y: 2 }, d: { x: 3, y: 4 } },
        e: { f: { x: 5, y: 6 } },
      }
    })
  })


  test('ref-heavy-wide', () => {
    let a0 = new Aontu()

    // Many sibling keys each referencing the same source
    expect(a0.generate(`
      src: 42
      a: $.src
      b: $.src
      c: $.src
      d: $.src
      e: $.src
      f: $.src
      g: $.src
      h: $.src
    `)).equal({
      src: 42, a: 42, b: 42, c: 42, d: 42, e: 42, f: 42, g: 42, h: 42
    })

    // Many refs pointing to different sources
    expect(a0.generate(`
      s1: 1, s2: 2, s3: 3, s4: 4, s5: 5, s6: 6, s7: 7, s8: 8
      a: $.s1, b: $.s2, c: $.s3, d: $.s4
      e: $.s5, f: $.s6, g: $.s7, h: $.s8
    `)).equal({
      s1: 1, s2: 2, s3: 3, s4: 4, s5: 5, s6: 6, s7: 7, s8: 8,
      a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8,
    })

    // Wide refs to nested paths
    expect(a0.generate(`
      src: { x: 10, y: 20 }
      a: $.src.x
      b: $.src.y
      c: $.src.x
      d: $.src.y
      e: $.src.x
      f: $.src.y
    `)).equal({
      src: { x: 10, y: 20 },
      a: 10, b: 20, c: 10, d: 20, e: 10, f: 20,
    })
  })


  test('ref-heavy-deep', () => {
    let a0 = new Aontu()

    // Deep ref chain (each level references the next)
    expect(a0.generate(`
      a: { v: $.b.v }
      b: { v: $.c.v }
      c: { v: $.d.v }
      d: { v: $.e.v }
      e: { v: $.f.v }
      f: { v: 99 }
    `)).equal({
      a: { v: 99 }, b: { v: 99 }, c: { v: 99 },
      d: { v: 99 }, e: { v: 99 }, f: { v: 99 },
    })

    // Deep nesting with refs at each level
    expect(a0.generate(`
      root: {
        a: { b: { c: { d: { val: 1 } } } }
        r1: $.root.a.b.c.d.val
        r2: $.root.a.b.c.d
        r3: $.root.a.b.c
        r4: $.root.a.b
      }
    `)).equal({
      root: {
        a: { b: { c: { d: { val: 1 } } } },
        r1: 1,
        r2: { val: 1 },
        r3: { d: { val: 1 } },
        r4: { c: { d: { val: 1 } } },
      }
    })

    // Refs through 4 levels of nesting
    expect(a0.generate(`
      a: b: c: d: v: 7
      x: $.a.b.c.d.v
      y: $.a.b.c.d
      z: $.a.b.c
    `)).equal({
      a: { b: { c: { d: { v: 7 } } } },
      x: 7,
      y: { v: 7 },
      z: { d: { v: 7 } },
    })
  })


  test('ref-heavy-cross', () => {
    let a0 = new Aontu()

    // Cross-referencing between siblings
    expect(a0.generate(`
      a: { x: 1, y: $.b.x }
      b: { x: 2, y: $.a.x }
    `)).equal({
      a: { x: 1, y: 2 },
      b: { x: 2, y: 1 },
    })

    // Multiple cross-refs in a wider structure
    expect(a0.generate(`
      p: { v: 10 }
      q: { v: 20 }
      r: { v: 30 }
      a: { pv: $.p.v, qv: $.q.v, rv: $.r.v }
      b: { pv: $.p.v, qv: $.q.v, rv: $.r.v }
      c: { pv: $.p.v, qv: $.q.v, rv: $.r.v }
    `)).equal({
      p: { v: 10 }, q: { v: 20 }, r: { v: 30 },
      a: { pv: 10, qv: 20, rv: 30 },
      b: { pv: 10, qv: 20, rv: 30 },
      c: { pv: 10, qv: 20, rv: 30 },
    })

    // Diamond: two paths merge at a common ref target
    expect(a0.generate(`
      base: { k: 1 }
      left: $.base
      right: $.base
      merged: { l: $.left.k, r: $.right.k }
    `)).equal({
      base: { k: 1 },
      left: { k: 1 },
      right: { k: 1 },
      merged: { l: 1, r: 1 },
    })
  })


  test('ref-heavy-spread', () => {
    let a0 = new Aontu()

    // Ref spread adds template fields to each child
    expect(a0.generate(`
      tmpl: { version: 1 }
      items: {
        &: $.tmpl
        a: { name: A }
        b: { name: B }
        c: { name: C }
        d: { name: D }
        e: { name: E }
        f: { name: F }
      }
    `)).equal({
      tmpl: { version: 1 },
      items: {
        a: { version: 1, name: 'A' }, b: { version: 1, name: 'B' },
        c: { version: 1, name: 'C' }, d: { version: 1, name: 'D' },
        e: { version: 1, name: 'E' }, f: { version: 1, name: 'F' },
      }
    })

    // Ref spread adds common fields to varied children
    expect(a0.generate(`
      defaults: { color: red, active: true }
      points: {
        &: $.defaults
        p1: { color: red, active: true, x: 1 }
        p2: { color: red, active: true, x: 3 }
        p3: { color: red, active: true, x: 5 }
        p4: { color: red, active: true, x: 7 }
      }
    `)).equal({
      defaults: { color: 'red', active: true },
      points: {
        p1: { color: 'red', active: true, x: 1 },
        p2: { color: 'red', active: true, x: 3 },
        p3: { color: 'red', active: true, x: 5 },
        p4: { color: 'red', active: true, x: 7 },
      }
    })

    // Nested ref spread: outer spread injects inner map fields
    expect(a0.generate(`
      inner: { enabled: true }
      outer: {
        &: { meta: $.inner }
        row1: { meta: { enabled: true }, id: 1 }
        row2: { meta: { enabled: true }, id: 2 }
        row3: { meta: { enabled: true }, id: 3 }
      }
    `)).equal({
      inner: { enabled: true },
      outer: {
        row1: { meta: { enabled: true }, id: 1 },
        row2: { meta: { enabled: true }, id: 2 },
        row3: { meta: { enabled: true }, id: 3 },
      }
    })
  })


  test('ref-heavy-combined', () => {
    let a0 = new Aontu()

    // Refs + spreads + deep nesting + cross-references
    expect(a0.generate(`
      config: {
        db: { host: localhost, port: 5432 }
        cache: { ttl: 60 }
      }
      services: {
        &: { db_host: $.config.db.host }
        api: { db_host: localhost, name: api }
        web: { db_host: localhost, name: web }
        worker: { db_host: localhost, name: worker }
      }
    `)).equal({
      config: {
        db: { host: 'localhost', port: 5432 },
        cache: { ttl: 60 },
      },
      services: {
        api: { db_host: 'localhost', name: 'api' },
        web: { db_host: 'localhost', name: 'web' },
        worker: { db_host: 'localhost', name: 'worker' },
      }
    })

    // Forward refs with nested map targets
    expect(a0.generate(`
      a: { m: $.c.m }
      b: { m: $.c.m }
      c: { m: { x: 1, y: 2 } }
    `)).equal({
      a: { m: { x: 1, y: 2 } },
      b: { m: { x: 1, y: 2 } },
      c: { m: { x: 1, y: 2 } },
    })

    // Chain of refs where each adds a field
    expect(a0.generate(`
      base: { a: 1 }
      step1: { a: $.base.a, b: 2 }
      step2: { a: $.step1.a, b: $.step1.b, c: 3 }
    `)).equal({
      base: { a: 1 },
      step1: { a: 1, b: 2 },
      step2: { a: 1, b: 2, c: 3 },
    })

    // Many refs into the same deep path
    expect(a0.generate(`
      data: { level1: { level2: { level3: { val: 100 } } } }
      r1: $.data.level1.level2.level3.val
      r2: $.data.level1.level2.level3.val
      r3: $.data.level1.level2.level3.val
      r4: $.data.level1.level2.level3.val
      r5: $.data.level1.level2.level3.val
      r6: $.data.level1.level2.level3.val
    `)).equal({
      data: { level1: { level2: { level3: { val: 100 } } } },
      r1: 100, r2: 100, r3: 100, r4: 100, r5: 100, r6: 100,
    })
  })


})


function makeCtx(r?: any) {
  return new AontuContext({ root: r || new MapVal({ peg: {} }) })
}

/* Copyright (c) 2026 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { expect } from './expect'

import { Aontu } from '..'


const A = new Aontu()
const G = (src: string) => A.generate(src)

// The generated tree, as JSON text, for the cases where key order and
// exact bytes are the point (the bridge reads these bytes).
const J = (src: string) => JSON.stringify(G(src))

// The why-code of the first collected failure.
const E = (src: string): string | undefined => {
  try {
    A.generate(src)
  }
  catch (err: any) {
    const errs = 'function' === typeof err?.errs ? err.errs() : []
    return errs[0]?.why
  }
  return undefined
}


describe('cmp', () => {

  test('node-shape', () => {
    expect(G('x: content("hello")')).equal({
      x: { cmp: 'Content', props: { src: 'hello' }, children: [] }
    })
    expect(G('x: file("a.ts")')).equal({
      x: { cmp: 'File', props: { name: 'a.ts' }, children: [] }
    })
    expect(G('x: folder("src")')).equal({
      x: { cmp: 'Folder', props: { name: 'src' }, children: [] }
    })
  })


  test('nested-tree', () => {
    expect(G('x: folder("src", [file("a.ts", [content("let a = 1")])])'))
      .equal({
        x: {
          cmp: 'Folder',
          props: { name: 'src' },
          children: [{
            cmp: 'File',
            props: { name: 'a.ts' },
            children: [{
              cmp: 'Content',
              props: { src: 'let a = 1' },
              children: [],
            }],
          }],
        }
      })
  })


  test('props-map-spec', () => {
    expect(G('x: file({name: "run.sh", mode: 493}, [content("#!/bin/sh")])'))
      .equal({
        x: {
          cmp: 'File',
          props: { name: 'run.sh', mode: 493 },
          children: [{ cmp: 'Content', props: { src: '#!/bin/sh' }, children: [] }],
        }
      })
  })


  test('generated-json-is-key-ordered', () => {
    Assert.equal(
      J('x: file("a.ts", [content("k")])'),
      '{"x":{"children":[{"children":[],"cmp":"Content","props":{"src":"k"}}],' +
      '"cmp":"File","props":{"name":"a.ts"}}}')
  })


  test('containment-grammar', () => {
    // A Folder holds folders and files.
    expect(G('x: folder("a", [folder("b"), file("c")])').x.children.length)
      .equal(2)
    Assert.equal(E('x: folder("a", [content("c")])'), 'invalid-arg')

    expect(G('x: file("a", [content("c")])').x.children.length).equal(1)
    Assert.equal(E('x: file("a", [file("b")])'), 'invalid-arg')

    Assert.equal(E('x: content("a", [content("b")])'), 'func_arity')

    // A child that is not a node at all.
    Assert.equal(E('x: folder("a", [1])'), 'invalid-arg')
    Assert.equal(E('x: folder("a", [{cmp: "Nope"}])'), 'invalid-arg')

    Assert.equal(E('x: folder("a", file("b"))'), 'invalid-arg')
  })


  test('spec-and-arity-refusals', () => {
    // The spec is a string or a props map, and nothing else.
    Assert.equal(E('x: file(1)'), 'invalid-arg')
    Assert.equal(E('x: file([1])'), 'invalid-arg')

    // The one prop the component cannot work without.
    Assert.equal(E('x: file({mode: 493})'), 'invalid-arg')
    Assert.equal(E('x: file({name: ""})'), 'invalid-arg')
    Assert.equal(E('x: file({name: 1})'), 'invalid-arg')
    Assert.equal(E('x: content({name: "a"})'), 'invalid-arg')

    // Arity is refused at parse from the declared signature, so the
    // call's own guard never sees these.
    Assert.equal(E('x: content()'), 'func_arity')
    Assert.equal(E('x: folder()'), 'func_arity')
    Assert.equal(E('x: content("a", "b")'), 'func_arity')
    Assert.equal(E('x: file("a", [], 1)'), 'func_arity')
  })


  test('nodes-are-recognised-structurally', () => {
    expect(G('x: folder("a", [{cmp: "File", props: {name: "b"}, children: []}])')
      .x.children[0]).equal({ cmp: 'File', props: { name: 'b' }, children: [] })

    Assert.equal(E('x: folder("a", [{props: {}, children: []}])'), 'invalid-arg')
    Assert.equal(E('x: folder("a", [{cmp: {a: 1}}])'), 'invalid-arg')
    Assert.equal(
      E('x: folder("a", [{cmp: 1, props: {}, children: []}])'), 'invalid-arg')
    Assert.equal(
      E('x: folder("a", [{cmp: "Nope", props: {}, children: []}])'), 'invalid-arg')
  })


  test('forward-reference', () => {
    expect(G('x: folder($.n, [file("a")])\nn: "src"').x.props)
      .equal({ name: 'src' })
    expect(G('x: file($.n, [content("k")])\nn: "a.ts"').x.props)
      .equal({ name: 'a.ts' })
    expect(G('x: content($.n)\nn: $.m\nm: "k"').x.props).equal({ src: 'k' })
  })


  test('node-is-closed', () => {
    Assert.equal(E('x: folder("s") & {childrn: []}'), 'closed')

    expect(G('x: file("a") & {props: {mode: 493}}').x.props)
      .equal({ name: 'a', mode: 493 })
  })


  test('each-generates-children', () => {
    expect(G(
      'names: [alpha, beta]\n' +
      'out: folder("src", each($.names, ' +
      'file(_ + ".ts", [content("export const " + _ + " = 1")])))'
    ).out.children).equal([
      {
        cmp: 'File',
        props: { name: 'alpha.ts' },
        children: [
          { cmp: 'Content', props: { src: 'export const alpha = 1' }, children: [] }
        ],
      },
      {
        cmp: 'File',
        props: { name: 'beta.ts' },
        children: [
          { cmp: 'Content', props: { src: 'export const beta = 1' }, children: [] }
        ],
      },
    ])
  })


  // A tree is addressable like any other value, which is what makes a
  // generated tree reviewable in the same document that builds it.
  test('tree-is-referenceable', () => {
    expect(G('a: file("x.ts", [content("k")])\nb: $.a.props.name'))
      .equal({
        a: {
          cmp: 'File',
          props: { name: 'x.ts' },
          children: [{ cmp: 'Content', props: { src: 'k' }, children: [] }],
        },
        b: 'x.ts',
      })
  })


  // Canon is the resolved node, as it is for every function that
  // answers from its arguments alone (`upper("a")` canons as `"A"`).
  test('canon-is-the-resolved-node', () => {
    Assert.equal(
      A.unify('x: content("k")').canon,
      '{"x":{"children":[],"cmp":"Content","props":{"src":"k"}}}')
  })


  test('the-whole-component-set', () => {
    const nodes = G('x: [project({}), folder("a"), file("b"), content("c"), ' +
      'line("d"), fragment("e"), slot("f"), inject("g"), copyfiles("h"), ' +
      'listitems({item:[]})]').x
    Assert.deepEqual(nodes.map((n: any) => n.cmp), [
      'Project', 'Folder', 'File', 'Content', 'Line',
      'Fragment', 'Slot', 'Inject', 'CopyFiles', 'ListItems',
    ])

    expect(G('x: file("a.ts")').x).equal(
      { cmp: 'File', props: { name: 'a.ts' }, children: [] })
  })


  // `project`'s folder is the one optional text prop, because jostraca
  // defaults it: the data path must not be stricter than the component
  // it drives.
  test('project-folder-is-optional', () => {
    expect(G('x: project()').x).equal(
      { cmp: 'Project', props: {}, children: [] })
    expect(G('x: project("out")').x.props).equal({ folder: 'out' })
    Assert.equal(E('x: project({folder: 1})'), 'invalid-arg')

    // Every other text prop is required.
    Assert.equal(E('x: folder()'), 'func_arity')
    Assert.equal(E('x: copyfiles()'), 'func_arity')
  })


  // `listitems` is driven by a LIST, so it has no one-string spelling and
  // its `item` is checked: a listitems with no item renders nothing,
  // silently, which is the failure a data path must not have.
  test('listitems-is-driven-by-a-list', () => {
    expect(G('x: listitems({item: [1,2]}, [line("a")])').x.props.item).equal([1, 2])
    Assert.equal(E('x: listitems("nope")'), 'invalid-arg')
    Assert.equal(E('x: listitems({})'), 'invalid-arg')
    Assert.equal(E('x: listitems({item: "no"})'), 'invalid-arg')
  })


  test('containment-covers-the-whole-set', () => {
    expect(G('x: file("a", [fragment("t", [slot("s", [line("x")])])])')
      .x.children[0].cmp).equal('Fragment')
    expect(G('x: folder("a", [copyfiles("L")])').x.children[0].cmp).equal('CopyFiles')

    Assert.equal(E('x: file("a", [slot("s")])'), 'invalid-arg')
    // A folder does not hold content.
    Assert.equal(E('x: folder("a", [line("x")])'), 'invalid-arg')
    Assert.equal(E('x: copyfiles("a", [line("x")])'), 'func_arity')
  })


  test('children-flatten', () => {
    expect(G('x: file("a", [content("1"), [content("2"), content("3")]])')
      .x.children.map((c: any) => c.props.src)).equal(['1', '2', '3'])

    // To any depth: a generator over a generator nests twice.
    expect(G('x: file("a", [[[content("deep")]]])')
      .x.children.map((c: any) => c.props.src)).equal(['deep'])

    // The grammar still applies to what the flattening produces.
    Assert.equal(E('x: file("a", [[folder("b")]])'), 'invalid-arg')
  })


  test('worked-example', () => {
    const src = Fs.readFileSync(
      Path.join(__dirname, '..', 'test', 'cmp-spike.aontu'), 'utf8')
    const out = G(src).out

    expect(out.props).equal({ name: 'src' })
    expect(out.children.length).equal(1)

    const file = out.children[0]
    expect(file.cmp).equal('File')

    expect(file.props).equal({ name: 'planet-body.ts' })

    expect(file.children.map((c: any) => c.props.src)).equal([
      'export interface PlanetBody {\n',
      '  id: number\n',
      '  surfaceGravity: number\n',
      '  meanRadius: number\n',
      '}\n',
    ])

    Assert.equal(G('x: upper("planet_body")').x, 'PLANET_BODY')
  })

})

/* Copyright (c) 2025 Richard Rodger, MIT License */

// The trust profile (G5 phase 3, docs/trust.md): the include capability
// ('none' | { mem } | { root } | 'system'), the deterministic budgets,
// the include manifest, the CLI flags and warning window, and the LSP's
// workspace confinement. The shared contract rows are
// test/spec/include-trust.tsv (both runners, root-confined to the
// fixtures directory); what is per-port — the API shapes, the CLI, the
// LSP wiring — is here, with go/trust_test.go as the twin.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { Aontu } from '../dist/aontu'
import { computeDiagnostics, LspHandler } from '../dist/lsp'
import {
  main as cliMain, replCommand,
  runVet, runGet, runWhy, runSubsume, runBreaking, runRelations, runTrim,
  runHash, runAgentsMd, runSet,
} from '../dist/cli'

import { srcPath } from './srcpath'


// The uri a real editor sends for a directory: `file://`, then the
// ABSOLUTE PATH with its own leading slash. On Windows that makes three
// slashes before the drive letter (file:///C:/Users/me/project), which
// is the shape uriToPath has to undo. These tests used to build
// `'file://' + path` — two slashes — which is not what any client sends
// and which quietly hid the drive-letter defect. Twin: fileURI in
// go/lsp/lsp_test.go.
const fileURI = (p: string): string => {
  const s = srcPath(p)
  return 'file://' + (s.startsWith('/') ? s : '/' + s)
}

// A little world to confine: root/{in.aon, nest.aon, sub/deep.aon},
// with secret.aon OUTSIDE the root and a symlink inside pointing at it.
//
// THE SYMLINK IS BEST-EFFORT. Windows refuses one without Developer
// Mode or elevation, and libuv asks for it exactly as Go does -- same
// CreateSymbolicLinkW, same unprivileged-create retry, same privilege
// required. Unguarded, that EPERM threw out of the shared fixture and
// took every test in this file with it, for a reason that is not about
// Aontu. Only symlinkEscape needs the link; the rest of the world is
// built either way. Twin: trustWorld/trustSymlink in go/trust_test.go.
function world(): { dir: string, root: string } {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-trust-'))
  const root = Path.join(dir, 'root')
  Fs.mkdirSync(Path.join(root, 'sub'), { recursive: true })
  Fs.writeFileSync(Path.join(root, 'in.aon'), 'f: 11')
  Fs.writeFileSync(Path.join(root, 'nest.aon'), '@"in.aon"\ng: 22')
  Fs.writeFileSync(Path.join(root, 'sub', 'deep.aon'), 'h: 33')
  Fs.writeFileSync(Path.join(dir, 'secret.aon'), 'secret: "outside"')
  try {
    Fs.symlinkSync(Path.join(dir, 'secret.aon'), Path.join(root, 'link.aon'))
  }
  catch {
    // Reported by symlinkEscape, as a skip on the one test that needs it.
  }
  return { dir, root }
}

// symlinkEscape reports whether world() got its symlink, so the test
// that turns on one can skip rather than fail where the platform
// refuses to make it. The Go twin is trustSymlink.
const symlinkEscape = (root: string): boolean =>
  Fs.existsSync(Path.join(root, 'link.aon'))


function firstCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  }
  catch (e: any) {
    return 'function' === typeof e?.errs ? e.errs()[0]?.why : undefined
  }
}


describe('trust-include', () => {

  test('none-denies-every-include', () => {
    const w = world()
    const a = new Aontu({ trust: { include: 'none' } })
    Assert.equal(
      firstCode(() => a.generate(`a:@"${srcPath(w.root)}/in.aon"`)),
      'include_denied')
  })

  test('mem-is-the-whole-world', () => {
    const a = new Aontu({
      trust: { include: { mem: { '/virtual/x.aon': 'm: 33' } } },
    })
    Assert.deepEqual(a.generate('a:@"/virtual/x.aon"'), { a: { m: 33 } })

    // A miss in the declared set is NOT-FOUND, not denial: the allowed
    // mechanism ran and missed.
    const b = new Aontu({
      trust: { include: { mem: { '/virtual/x.aon': 'm: 33' } } },
    })
    Assert.throws(() => b.generate('a:@"/nope.aon"'), /not found/)
  })

  test('root-confines-below-the-root', () => {
    const w = world()
    const opts = { trust: { include: { root: w.root } } }

    Assert.deepEqual(
      new Aontu(opts).generate(`a:@"${srcPath(w.root)}/sub/deep.aon"`),
      { a: { h: 33 } })

    Assert.equal(
      firstCode(() =>
        new Aontu(opts).generate(`a:@"${srcPath(w.root)}/../secret.aon"`)),
      'include_denied')
  })

  // Confinement is realpath-then-prefix-check: a symlink INSIDE the
  // root pointing outside it is an escape, not a loophole.
  test('root-denies-a-symlink-escape', (t) => {
    const w = world()
    if (!symlinkEscape(w.root)) {
      return t.skip('symlink not available on this platform')
    }
    Assert.equal(
      firstCode(() => new Aontu({ trust: { include: { root: w.root } } })
        .generate(`a:@"${srcPath(w.root)}/link.aon"`)),
      'include_denied')
  })

  test('root-miss-is-not-found-not-denied', () => {
    const w = world()
    Assert.throws(
      () => new Aontu({ trust: { include: { root: w.root } } })
        .generate(`a:@"${srcPath(w.root)}/nope.aon"`),
      /not found/)
  })

  // A root that does not exist still confines: realpath falls back to
  // the lexical form, and everything real is outside a nonexistent
  // directory.
  test('nonexistent-root-still-confines', () => {
    const w = world()
    Assert.equal(
      firstCode(() => new Aontu({
        trust: { include: { root: Path.join(w.dir, 'no-such-root') } },
      }).generate(`a:@"${srcPath(w.root)}/in.aon"`)),
      'include_denied')
  })

  // Package resolution is recorded in the manifest as its own
  // capability, and under the warning window a package hit warns as
  // 'pkg'. (@tabnas/jsonic/package.json resolves through the package
  // leg from the ts/ working directory the tests run in.)
  test('pkg-resolution-is-recorded-and-warned', () => {
    const warned: string[] = []
    const a = new Aontu({
      trustWarn: (kind: any, path: any) => { warned.push(kind + ' ' + path) },
      trustWarnRoot: Os.tmpdir(),
    } as any)
    const v: any = a.parse(
      'a:@"@tabnas/jsonic/package.json"', undefined, a.ctx({}))
    Assert.equal(v.deps.length, 1)
    Assert.equal(v.deps[0].capability, 'pkg')
    Assert.match(v.deps[0].path, /@tabnas[/\\]jsonic[/\\]package\.json$/)
    Assert.equal(warned.length, 1)
    Assert.match(warned[0], /^pkg /)
  })
})


describe('trust-manifest', () => {

  // The include MANIFEST (docs/trust.md): the resolved closure as
  // sorted, deduplicated { path, capability } — hermeticity clause 1's
  // "file set" made observable.
  test('deps-lists-the-sorted-deduped-closure', () => {
    const w = world()
    const a = new Aontu({ trust: { include: { root: w.root } } })
    const ac = a.ctx({})
    const v: any = a.parse(
      `a:@"${srcPath(w.root)}/nest.aon" b:@"${srcPath(w.root)}/in.aon" c:@"${srcPath(w.root)}/in.aon"`,
      undefined, ac)
    Assert.deepEqual(v.deps, [
      { path: Path.join(w.root, 'in.aon'), capability: 'file' },
      { path: Path.join(w.root, 'nest.aon'), capability: 'file' },
    ])
  })

  test('deps-is-empty-without-includes', () => {
    const a = new Aontu()
    const v: any = a.parse('x: 1', undefined, a.ctx({}))
    Assert.deepEqual(v.deps, [])
  })

  test('deps-names-the-mem-capability', () => {
    const a = new Aontu({
      trust: { include: { mem: { '/v/x.aon': 'm: 1' } } },
    })
    const v: any = a.parse('a:@"/v/x.aon"', undefined, a.ctx({}))
    Assert.deepEqual(v.deps, [{ path: '/v/x.aon', capability: 'mem' }])
  })
})


describe('trust-budget', () => {

  // The budgets are integer counts of engine events, deterministic by
  // construction; zero-config means the shared spec constants
  // (test/spec/budget.tsv). A chain needing more passes than the
  // budget exhausts LOUDLY — budget_passes, never silent truncation —
  // including at passes:1, where the still-refining snapshot must be
  // taken at the final pass's entry (there is no earlier pass).
  test('passes-budget-exhausts-loudly', () => {
    const chain = 'a1:$.a2 a2:$.a3 a3:$.a4 a4:1'
    Assert.equal(
      firstCode(() => new Aontu({ trust: { budget: { passes: 1 } } })
        .generate(chain)),
      'budget_passes')
    // The same document under the default budget resolves.
    Assert.equal(new Aontu().generate(chain).a1, 1)
  })

  test('depth-budget-trips-unify-cycle', () => {
    Assert.equal(
      firstCode(() => new Aontu({ trust: { budget: { depth: 3 } } })
        .generate('a:{b:{c:{d:{e:1}}}}')),
      'unify_cycle')
  })
})


describe('trust-lsp', () => {

  const init = (params: any) => {
    const h = new LspHandler()
    h.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params } as any)
    return h
  }

  const diagsFor = (h: any, text: string) => {
    const outs = h.handle({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///d.aon', text } },
    } as any)
    return (outs[0].params as any).diagnostics
  }

  test('workspace-root-confines-diagnostics', () => {
    const w = world()
    const h = init({ rootUri: fileURI(w.root) })
    // Two diagnostics, matching the syntax-failure precedent: the
    // outer parse nil and the inner denial carrying the code.
    const diags = diagsFor(h, `a:@"${srcPath(w.root)}/../secret.aon"`)
    Assert.ok(diags.some((d: any) => 'include_denied' === d.code),
      JSON.stringify(diags))

    // In-root includes still resolve under the same session.
    Assert.deepEqual(diagsFor(h, `a:@"${srcPath(w.root)}/in.aon"`), [])
  })

  test('workspace-folders-outrank-root-uri', () => {
    const w = world()
    const h = init({
      rootUri: 'file:///nowhere',
      workspaceFolders: [{ uri: fileURI(w.root) }],
    })
    Assert.deepEqual(diagsFor(h, `a:@"${srcPath(w.root)}/in.aon"`), [])
  })

  test('root-path-fallback-confines', () => {
    const w = world()
    const h = init({ rootPath: w.root })
    Assert.ok(diagsFor(h, `a:@"${srcPath(w.root)}/../secret.aon"`)
      .some((d: any) => 'include_denied' === d.code))
  })

  test('explicit-initialization-option-wins', () => {
    const w = world()

    // 'system' widens even when a workspace root exists.
    const wide = init({
      rootUri: fileURI(w.root),
      initializationOptions: { aontu: { trust: { include: 'system' } } },
    })
    Assert.deepEqual(diagsFor(wide, `a:@"${srcPath(w.dir)}/secret.aon"`), [])

    // 'none' narrows to nothing.
    const none = init({
      initializationOptions: { aontu: { trust: { include: 'none' } } },
    })
    Assert.ok(diagsFor(none, `a:@"${srcPath(w.root)}/in.aon"`)
      .some((d: any) => 'include_denied' === d.code))

    // { root } names its own directory.
    const rooted = init({
      initializationOptions: {
        aontu: { trust: { include: { root: w.root } } },
      },
    })
    Assert.deepEqual(diagsFor(rooted, `a:@"${srcPath(w.root)}/in.aon"`), [])

    // { mem } is honoured too.
    const mem = init({
      initializationOptions: {
        aontu: { trust: { include: { mem: { '/v/x.aon': 'm: 1' } } } },
      },
    })
    Assert.deepEqual(diagsFor(mem, 'a:@"/v/x.aon"'), [])

    // An unrecognised explicit value confines to NOTHING rather than
    // silently widening.
    const unknown = init({
      initializationOptions: { aontu: { trust: { include: { bogus: 1 } } } },
    })
    Assert.ok(diagsFor(unknown, `a:@"${srcPath(w.root)}/in.aon"`)
      .some((d: any) => 'include_denied' === d.code))
  })

  test('no-root-no-option-stays-unconfined', () => {
    const w = world()
    const h = init({})
    Assert.deepEqual(diagsFor(h, `a:@"${srcPath(w.root)}/in.aon"`), [])
  })

  // HOVER, not only diagnostics. The server confined the diagnostics
  // it published and left hover on the full system resolver, so a
  // workspace-confined session still resolved an escaping include the
  // moment a cursor rested on it (use-cases/REVIEW.md finding G).
  //
  // EVERY column of the line is probed rather than one chosen one: a
  // hover span is measured in the INCLUDED document's own coordinates,
  // so which column carries the value is an artefact of the include's
  // text, and the invariant is that NO cursor position on a confined
  // document reveals the outside value.
  test('workspace-root-confines-hover', () => {
    const w = world()
    const hovers = (h: any, text: string): string => {
      h.handle({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///d.aon', text } },
      } as any)
      let all = ''
      for (let c = 0; c < text.length; c++) {
        const outs = h.handle({
          jsonrpc: '2.0', id: 2, method: 'textDocument/hover',
          params: {
            textDocument: { uri: 'file:///d.aon' },
            position: { line: 0, character: c },
          },
        } as any)
        all += JSON.stringify((outs[0] as any).result ?? null)
      }
      return all
    }

    const confined = init({ rootUri: fileURI(w.root) })
    // In-root: the include resolves, so the value is hoverable.
    Assert.match(hovers(confined, `a:@"${srcPath(w.root)}/in.aon"`), /11/)
    // Out-of-root: nowhere on the line does the outside value appear.
    Assert.doesNotMatch(
      hovers(confined, `a:@"${srcPath(w.dir)}/secret.aon"`), /outside/)

    // The unconfined session is the control: it DOES resolve the same
    // escape, which is what makes the assertion above about the
    // capability rather than about hover failing everywhere.
    Assert.match(
      hovers(init({}), `a:@"${srcPath(w.dir)}/secret.aon"`), /outside/)
  })

  test('compute-diagnostics-takes-a-trust-argument', () => {
    const w = world()
    Assert.ok(
      computeDiagnostics(`a:@"${srcPath(w.root)}/in.aon"`,
        { trust: { include: 'none' } })
        .some((d: any) => 'include_denied' === d.code))
  })
})


describe('trust-cli', () => {

  function capture(fn: () => void): { out: string, err: string, code: number } {
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
    }
    const code = (process.exitCode as number) ?? 0
    process.exitCode = 0
    return { out, err, code }
  }

  const cli = (args: string[]) => capture(() => cliMain(['node', 'cli', ...args]))

  test('trust-none-denies', () => {
    const w = world()
    const entry = Path.join(w.root, 'main.aon')
    Fs.writeFileSync(entry, 'a:@"in.aon"')
    const r = cli(['--trust', 'none', entry])
    Assert.equal(r.code, 1)
    Assert.match(r.err, /include denied/)
  })

  test('include-root-confines', () => {
    const w = world()
    const entry = Path.join(w.root, 'main.aon')
    Fs.writeFileSync(entry, `a:@"${srcPath(w.dir)}/secret.aon"`)
    const r = cli(['--include-root', w.root, entry])
    Assert.equal(r.code, 1)
    Assert.match(r.err, /include denied/)

    // The same escape under explicit system resolves, silently.
    const ok = cli(['--trust', 'system', entry])
    Assert.equal(ok.code, 0)
    Assert.equal(ok.err, '')
  })

  test('trust-root-defaults-to-the-entry-directory', () => {
    const w = world()
    const entry = Path.join(w.root, 'main.aon')
    Fs.writeFileSync(entry, 'a:@"in.aon"')
    const r = cli(['--trust', 'root', entry])
    Assert.equal(r.code, 0)

    Fs.writeFileSync(entry, `a:@"${srcPath(w.dir)}/secret.aon"`)
    Assert.equal(cli(['--trust', 'root', entry]).code, 1)
    Assert.equal(cli(['--trust', `root:${w.dir}`, entry]).code, 0)
  })

  // The warning window of the staged default flip: the default posture
  // still resolves, but every escape names the flag a future release
  // will require — once per resolution, however many times it repeats.
  test('default-warns-on-escape', () => {
    const w = world()
    const entry = Path.join(w.root, 'main.aon')
    Fs.writeFileSync(entry,
      `a:@"${srcPath(w.dir)}/secret.aon" b:@"${srcPath(w.dir)}/secret.aon" c:@"in.aon"`)
    const r = cli([entry])
    Assert.equal(r.code, 0)
    Assert.equal(
      (r.err.match(/warning: include resolved outside the entry root/g) ?? [])
        .length,
      1)
    Assert.match(r.err, /--trust system/)
  })

  // A package hit under the default posture warns as 'through package
  // resolution' — the other arm of the warning text.
  test('default-warns-on-pkg-resolution', () => {
    const w = world()
    const entry = Path.join(w.root, 'main.aon')
    Fs.writeFileSync(entry, 'a:@"@tabnas/jsonic/package.json"')
    const cwd = process.cwd()
    try {
      // The package leg resolves from the working directory; the test
      // process runs in ts/, where @tabnas/jsonic is installed.
      const r = cli([entry])
      Assert.match(r.err, /warning: include resolved through package resolution/)
    }
    finally {
      process.chdir(cwd)
    }
  })

  // EVERY VERB, not just the bare command. The capability flags were
  // wired to `aontu <file>` alone, so `aontu vet schema.aon data.json`
  // -- the surface an agent scripts -- ran the full system resolver
  // with no way to confine it (use-cases/REVIEW.md finding G). Each
  // verb is asserted twice: the escape resolves under today's default
  // and is DENIED under --trust none, so a verb that quietly dropped
  // the flag again would fail here.
  test('every-verb-honours-the-capability', () => {
    const w = world()
    const entry = Path.join(w.root, 'leak.aon')
    Fs.writeFileSync(entry, `a:@"${srcPath(w.dir)}/secret.aon"`)
    const data = Path.join(w.root, 'data.json')
    Fs.writeFileSync(data, '{}')
    const overlay = Path.join(w.root, 'overlay.aon')
    Fs.writeFileSync(overlay, '')

    const denied = (args: string[]) => {
      const open = cli(args)
      const shut = cli([...args.slice(0, 1), '--trust', 'none', ...args.slice(1)])
      Assert.notEqual(
        JSON.stringify([open.code, open.out, open.err]),
        JSON.stringify([shut.code, shut.out, shut.err]),
        'the verb ignored --trust: ' + args.join(' '))
      // The denial itself is named where the verb's report carries a
      // reason. `relations`, `trim`, `subsume`/`breaking` and `hash`
      // answer an `error` verdict whose cause the report shape has
      // nowhere to put -- the review's finding F, open in both ports
      // (use-cases/BUGS.md, "relations and trim report verdict:error
      // with zero findings"). What every verb MUST do is honour the
      // capability, which the difference above asserts.
      if (!/verdict: error|nothing to hash/.test(shut.out + shut.err)) {
        Assert.match(shut.out + shut.err, /include denied|include_denied/)
      }
    }

    denied(['vet', entry, data])
    denied(['get', '$.a.secret', entry])
    denied(['why', '$.a.secret', entry])
    denied(['subsume', entry, entry])
    denied(['breaking', '--against', entry, entry])
    denied(['relations', entry])
    denied(['trim', '--check', entry])
    denied(['hash', entry])
    denied(['agentsmd', entry])
    denied(['set', '$.z=1', '--entry', entry, '--overlay', overlay])
  })

  // --include-root confines a verb to a directory, the CLI's own
  // root: spelling, and a bare `root` means the document's directory.
  test('verbs-take-include-root', () => {
    const w = world()
    const entry = Path.join(w.root, 'leak.aon')
    Fs.writeFileSync(entry, `a:@"${srcPath(w.dir)}/secret.aon"`)
    const inside = Path.join(w.root, 'fine.aon')
    Fs.writeFileSync(inside, 'a:@"in.aon"')

    const confined = cli(['get', '$.a.secret', '--include-root', w.root, entry])
    Assert.match(confined.out + confined.err, /include denied/)
    Assert.equal(cli(['get', '$.a.f', '--include-root', w.root, inside]).code, 0)
    // A bare `root` confines to the document's own directory.
    Assert.equal(cli(['get', '$.a.f', '--trust', 'root', inside]).code, 0)
    const bare = cli(['get', '$.a.secret', '--trust', 'root', entry])
    Assert.match(bare.out + bare.err, /include denied/)
    // A bad spelling is the usage class, from a verb as from the bare
    // command.
    Assert.equal(cli(['get', '$.a', '--trust', 'bogus', inside]).code, 2)
    Assert.equal(cli(['get', '$.a', inside, '--include-root']).code, 2)
  })

  // The REPL took --trust and DROPPED it: the --jsonl session mode,
  // built to be driven by a harness, evaluated unconfined however it
  // was invoked.
  test('repl-honours-the-capability', () => {
    const w = world()
    const entry = Path.join(w.root, 'leak.aon')
    Fs.writeFileSync(entry, `a:@"${srcPath(w.dir)}/secret.aon"`)
    const read = (f: string) => Fs.readFileSync(f, 'utf8')

    const open = replCommand(
      { mode: 'json', jsonl: true }, ':load ' + entry, read)
    Assert.match(open.out, /outside/)

    const shut = replCommand(
      { mode: 'json', jsonl: true, trust: { kind: 'none', textExt: [] } },
      ':load ' + entry, read)
    Assert.match(shut.out, /include denied/)
    Assert.doesNotMatch(shut.out, /outside/)
  })

  test('trust-usage-errors-exit-2', () => {
    for (const args of [
      ['--trust'],
      ['--trust', 'everything'],
      ['--trust', 'root:'],
      ['--include-root'],
    ]) {
      Assert.equal(cli(args).code, 2, args.join(' '))
    }
  })

  // A bad spelling is the usage class FROM EVERY VERB, not only from
  // the bare command: each verb strips the flags before parsing its own
  // tail, so each has its own refusal to exercise. Checked against a
  // verb tail that would otherwise be valid, so the exit code is the
  // flag's and not the tail's. Twin:
  // TestTrustCliEveryVerbRefusesABadSpelling in go/cmd/aontu.
  test('every-verb-refuses-a-bad-spelling', () => {
    const w = world()
    const entry = Path.join(w.root, 'main.aon')
    Fs.writeFileSync(entry, 'a:@"in.aon"')
    const data = Path.join(w.root, 'data.json')
    Fs.writeFileSync(data, '{}')
    const overlay = Path.join(w.root, 'overlay.aon')
    Fs.writeFileSync(overlay, '')

    // The runners are called DIRECTLY rather than through main: `vet`
    // finishes on a microtask (its --watch mode makes the runner
    // promise-returning), and a synchronous capture would read
    // process.exitCode before that lands. Each runner's own return is
    // the exit code, which is what this asserts.
    const bad = '--trust'
    const runs: Array<[string, () => number | Promise<number>]> = [
      ['vet', () => runVet([bad, 'everything', entry, data]) as number],
      ['get', () => runGet([bad, 'everything', '$.a.f', entry])],
      ['why', () => runWhy([bad, 'everything', '$.a.f', entry])],
      ['subsume', () => runSubsume([bad, 'everything', entry, entry])],
      ['breaking',
        () => runBreaking([bad, 'everything', '--against', entry, entry])],
      ['relations', () => runRelations([bad, 'everything', entry])],
      ['trim', () => runTrim([bad, 'everything', '--check', entry])],
      ['hash', () => runHash([bad, 'everything', entry])],
      ['agentsmd', () => runAgentsMd([bad, 'everything', entry])],
      ['set', () => runSet(
        [bad, 'everything', '$.z=1', '--entry', entry, '--overlay', overlay])],
    ]
    for (const [name, run] of runs) {
      const r = capture(() => Assert.equal(run(), 2, name))
      Assert.match(r.err, /--trust needs/, name)
    }
  })

  // A session state carrying source but NO file name is a shape the
  // exported handler's own type allows (a library caller evaluating
  // held text that came from somewhere other than `:load`), and its
  // bare `root` spelling has to root somewhere: the working directory,
  // as the bare command does for stdin.
  test('nameless-repl-state-roots-at-the-working-directory', () => {
    const held = { mode: 'json' as const, jsonl: false, src: 'a: 1' }
    Assert.match(replCommand(held, ':get $.a', () => '').out, /1/)
    Assert.match(
      replCommand({ ...held, trust: { kind: 'root' as const, textExt: [] } },
        ':get $.a', () => '').out,
      /1/)
    Assert.match(
      replCommand({ ...held, trust: { kind: 'root' as const, textExt: [] } },
        ':why $.a', () => '').out,
      /1/)
  })
})

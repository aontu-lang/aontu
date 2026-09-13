/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { Aontu, canonHash } from '../dist/aontu'
import { main as cliMain } from '../dist/cli'
import { versionCompare } from '../dist/mod-tool'
import { modCacheDirFor, validateModulePath } from '../dist/mod'

import { srcPath } from './srcpath'

// The lockfile lives under aontu_meta/, which a test that writes one by
// hand has to create first, as `mod tidy` does.
function writeLock(dir: string, text: string): void {
  Fs.mkdirSync(Path.join(dir, 'aontu_meta'), { recursive: true })
  Fs.writeFileSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon'), text)
}


const MODULE = 'name: string\nport: *8080 | integer\n'

const NIL_PIN = 'aon1-XaOkx_EXlEJ1tMhinEkWQDYl1aSmVzoB7LA_Dp0u2-Y'


function world(store: 'vendor' | 'cache'): {
  dir: string, main: string, hash: string, cache: string
} {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-mod-'))
  const cache = Path.join(dir, 'cache')

  const hash = canonHash(new Aontu().unify(MODULE))

  const moddir = 'vendor' === store
    ? Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service@1')
    : Path.join(cache, hash)
  Fs.mkdirSync(moddir, { recursive: true })
  Fs.writeFileSync(Path.join(moddir, 'mod.aon'),
    'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n')
  Fs.writeFileSync(Path.join(moddir, 'service.aon'), MODULE)

  Fs.writeFileSync(Path.join(dir, 'mod.aon'), 'mod: {path: "corp.example/app"}\n')
  const main = Path.join(dir, 'main.aon')
  Fs.writeFileSync(main,
    'svc: @"corp.example/schemas/service@1#' + hash + '"\nsvc: name: "auth"\n')

  return { dir, main, hash, cache }
}


describe('mod', () => {

  test('an-empty-path-element-is-refused', () => {
    Assert.equal(validateModulePath('corp.example//x'), 'an element is empty')
    Assert.equal(validateModulePath(''), 'an element is empty')

    // And the rules the shared rows DO drive, asserted here as the
    // function contract rather than as engine behaviour.
    Assert.equal(validateModulePath('corp.example/x'), undefined)
    Assert.equal(
      validateModulePath('corp.example/../x'),
      'an element begins or ends with "."')
    Assert.equal(
      validateModulePath('corp.example/nul'),
      'an element is a reserved device name')
  })

  test('cache-is-content-addressed', () => {
    const w = world('cache')
    const a0 = new Aontu({ mod: { cache: w.cache } } as any)
    Assert.deepEqual(
      a0.generate('x: @"' + srcPath(w.main) + '"'),
      { x: { svc: { name: 'auth', port: 8080 } } })
  })


  test('cache-is-not-consulted-under-a-root', () => {
    const w = world('cache')
    const a0 = new Aontu({
      mod: { cache: w.cache },
      trust: { include: { root: w.dir } },
    } as any)
    Assert.throws(
      () => a0.generate('x: @"' + srcPath(w.main) + '"'),
      (err: any) => String(err.message).includes('module not fetched:'))
  })


  test('cache-defaults-to-the-platform-location', () => {
    const w = world('cache')
    const xdg = Path.join(w.dir, 'xdg')
    Fs.mkdirSync(Path.join(xdg, 'aontu'), { recursive: true })
    Fs.renameSync(w.cache, Path.join(xdg, 'aontu', 'mod'))

    const saved = process.env.XDG_CACHE_HOME
    process.env.XDG_CACHE_HOME = xdg
    try {
      Assert.deepEqual(
        new Aontu().generate('x: @"' + srcPath(w.main) + '"'),
        { x: { svc: { name: 'auth', port: 8080 } } })
    }
    finally {
      if (undefined === saved) {
        delete process.env.XDG_CACHE_HOME
      }
      else {
        process.env.XDG_CACHE_HOME = saved
      }
    }
  })


  test('cache-falls-back-to-the-home-directory', () => {
    // No XDG_CACHE_HOME: `~/.cache/aontu/mod` is the platform default
    // this falls back to, and HOME is pointed at a temporary directory
    // for the same reason XDG was above.
    const w = world('cache')
    const home = Path.join(w.dir, 'home')
    Fs.mkdirSync(Path.join(home, '.cache', 'aontu'), { recursive: true })
    Fs.renameSync(w.cache, Path.join(home, '.cache', 'aontu', 'mod'))

    const savedXdg = process.env.XDG_CACHE_HOME
    const savedHome = process.env.HOME
    delete process.env.XDG_CACHE_HOME
    process.env.HOME = home
    try {
      Assert.deepEqual(
        new Aontu().generate('x: @"' + srcPath(w.main) + '"'),
        { x: { svc: { name: 'auth', port: 8080 } } })
    }
    finally {
      if (undefined !== savedXdg) {
        process.env.XDG_CACHE_HOME = savedXdg
      }
      if (undefined === savedHome) {
        delete process.env.HOME
      }
      else {
        process.env.HOME = savedHome
      }
    }
  })


  test('cache-dir-rule', () => {
    const at = (...p: string[]) => Path.join(...p)

    // The explicit override wins on every platform.
    Assert.equal(
      modCacheDirFor('linux', { XDG_CACHE_HOME: '/x', HOME: '/h' }),
      at('/x', 'aontu', 'mod'))
    Assert.equal(
      modCacheDirFor('win32', { XDG_CACHE_HOME: '/x', LOCALAPPDATA: 'C:/L' }),
      at('/x', 'aontu', 'mod'))

    Assert.equal(
      modCacheDirFor('win32', { LOCALAPPDATA: 'C:/L', HOME: '/h' }),
      at('/h', '.cache', 'aontu', 'mod'))
    Assert.equal(
      modCacheDirFor('linux', { LOCALAPPDATA: 'C:/L', HOME: '/h' }),
      at('/h', '.cache', 'aontu', 'mod'))

    // And LOCALAPPDATA is the platform default BENEATH both, which is
    // the whole addition: Windows sets neither of the two above by
    // default.
    Assert.equal(
      modCacheDirFor('win32', { LOCALAPPDATA: 'C:/L' }),
      at('C:/L', 'aontu', 'mod'))
    Assert.equal(modCacheDirFor('linux', { LOCALAPPDATA: 'C:/L' }), undefined)

    // An empty variable is not a location, and nowhere to put one is a
    // MISS rather than a failure.
    Assert.equal(modCacheDirFor('win32', { LOCALAPPDATA: '', HOME: '' }), undefined)
    Assert.equal(modCacheDirFor('win32', {}), undefined)
    Assert.equal(modCacheDirFor('linux', { XDG_CACHE_HOME: '' }), undefined)
  })


  test('no-home-means-no-cache', () => {
    // A host with no home directory has no cache, and that is a MISS
    // rather than a failure: the module is simply not in any store this
    // evaluation can read, which is what the message says.
    const w = world('cache')
    const savedXdg = process.env.XDG_CACHE_HOME
    const savedHome = process.env.HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.HOME
    try {
      Assert.throws(
        () => new Aontu().generate('x: @"' + srcPath(w.main) + '"'),
        (err: any) => String(err.message).includes('module not fetched:'))
    }
    finally {
      if (undefined !== savedXdg) {
        process.env.XDG_CACHE_HOME = savedXdg
      }
      if (undefined !== savedHome) {
        process.env.HOME = savedHome
      }
    }
  })


  test('host-filesystem-reports-a-missing-module', () => {
    // The same channel, missing: a store the host's filesystem does not
    // have is a module that is not fetched, not a crash on the stat.
    const w = world('vendor')
    Fs.rmSync(Path.join(w.dir, 'aontu_meta', 'vendor'), { recursive: true })
    const a0 = new Aontu({ fs: Fs } as any)
    Assert.throws(
      () => a0.generate('x: @"' + srcPath(w.main) + '"'),
      (err: any) => String(err.message).includes('module not fetched:'))
  })


  test('host-filesystem-is-the-one-modules-are-read-from', () => {
    const w = world('vendor')
    const a0 = new Aontu({ fs: Fs } as any)
    Assert.deepEqual(
      a0.generate('x: @"' + srcPath(w.main) + '"'),
      { x: { svc: { name: 'auth', port: 8080 } } })
  })


  test('a-vendor-store-outside-the-root-is-denied', () => {
    const w = world('vendor')
    const sub = Path.join(w.dir, 'sub')
    Fs.mkdirSync(sub)
    const main = Path.join(sub, 'main.aon')
    Fs.copyFileSync(w.main, main)

    const a0 = new Aontu({ trust: { include: { root: sub } } } as any)
    Assert.throws(
      () => a0.generate('x: @"' + srcPath(main) + '"'),
      (err: any) => String(err.message).includes('include denied:'))
  })


  test('verification-depth-is-bounded', () => {
    const w = world('vendor')
    const a0 = new Aontu({ mod: { depth: 16 } } as any)
    Assert.throws(
      () => a0.generate('x: @"' + srcPath(w.main) + '"'),
      (err: any) => String(err.message).includes('module depth:'))
  })

})


describe('mod-tool', () => {

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


  // A project with one vendored dependency, and whatever else the
  // caller asked for.
  function project(dep: string, extra?: (dir: string) => void): string {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modtool-'))
    Fs.writeFileSync(Path.join(dir, 'mod.aon'),
      'mod: {path: "corp.example/app"}\ndep: {' + dep + '}\n')
    extra?.(dir)
    return dir
  }

  function vendor(dir: string, path: string, files: Record<string, string>) {
    const p = Path.join(dir, 'aontu_meta', 'vendor', ...path.split('/'))
    Fs.mkdirSync(p, { recursive: true })
    for (const name of Object.keys(files)) {
      Fs.writeFileSync(Path.join(p, name), files[name])
    }
  }


  test('a-nested-import-reaches-the-consumers-vendor-tree', () => {
    const dir = project(
      '"corp.example/schemas/service@1": {v: "1.4.2"},' +
      ' "corp.example/schemas/common@1": {v: "1.0.0"}', (d) => {
        vendor(d, 'corp.example/schemas/service@1', {
          'mod.aon':
            'mod: {path: "corp.example/schemas/service",' +
            ' version: "1.4.2", main: "service.aon"}\n' +
            'dep: {"corp.example/schemas/common@1": {v: "1.0.0"}}\n',
          'service.aon':
            '@"corp.example/schemas/common@1"\n' +
            'spec: {name: string, port: *8080 | integer}\n',
        })
        vendor(d, 'corp.example/schemas/common@1', {
          'mod.aon':
            'mod: {path: "corp.example/schemas/common",' +
            ' version: "1.0.0", main: "common.aon"}\n',
          'common.aon': 'naming: {id: string}\n',
        })
      })
    Fs.writeFileSync(Path.join(dir, 'main.aon'),
      'lib: hide(@"corp.example/schemas/service@1")\n' +
      'svc: $.lib.spec & {name: "checkout"}\n')

    const t = cli(['mod', 'tidy', dir])
    Assert.equal(t.code, 0, t.err + t.out)
    // NOT the hash of nil, which is what a module that does not
    // evaluate pins -- and the same string for every one of them.
    Assert.equal(t.out.includes(NIL_PIN), false, t.out)

    const r = cli([Path.join(dir, 'main.aon')])
    Assert.equal(r.code, 0, r.err)
    Assert.equal(JSON.parse(r.out).svc.port, 8080)
  })


  test('tidy-refuses-to-pin-a-module-that-does-not-evaluate', () => {
    const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) =>
      vendor(d, 'corp.example/schemas/service@1', {
        'mod.aon':
          'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
        // Contradicts itself: no meaning, so nothing to pin.
        'service.aon': 'a: 1\na: 2\n',
      }))

    const r = cli(['mod', 'tidy', dir])
    Assert.equal(r.code, 4, r.out)
    Assert.ok(r.out.includes('verdict: error'), r.out)
    Assert.ok(r.out.includes('does not evaluate on its own'), r.out)
    // AND THE LOCKFILE IS LEFT ALONE. A refusal that wrote a lockfile
    // would be the defect with a louder message.
    Assert.equal(Fs.existsSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon')), false)
  })


  test('manifest-refuses-to-mint-a-pin-for-a-module-that-does-not-evaluate', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modtool-'))
    Fs.writeFileSync(Path.join(dir, 'mod.aon'),
      'mod: {path: "corp.example/app", version: "1.0.0"}\n')
    // Contradicts itself: no meaning, so nothing to pin.
    Fs.writeFileSync(Path.join(dir, 'main.aon'), 'a: 1\na: 2\n')

    const r = cli(['mod', 'manifest', '--format', 'json', dir])
    Assert.equal(r.code, 4, r.out)
    const report = JSON.parse(r.out)
    Assert.equal(report.verdict, 'error')
    Assert.equal(report.canon, '')
  })


  test('the-mod-verbs-take-the-trust-options', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modtool-'))
    Fs.writeFileSync(Path.join(dir, 'mod.aon'),
      'mod: {path: "corp.example/app", version: "1.0.0"}\n')
    Fs.writeFileSync(Path.join(Path.dirname(dir), 'modtool-outside.aon'),
      'secret: "leaked"\n')
    Fs.writeFileSync(Path.join(dir, 'main.aon'),
      'x: @"../modtool-outside.aon"\n')

    // Unconfined the include is read, so a pin is minted.
    const open = JSON.parse(cli(['mod', 'manifest', '--format', 'json', dir]).out)
    Assert.equal(open.verdict, 'ok')
    Assert.notEqual(open.canon, '')

    // Confined it is denied, and a denied module has no meaning to pin.
    for (const flag of [['--trust', 'none'], ['--include-root', dir]]) {
      const shut = cli(['mod', 'manifest', '--format', 'json', ...flag, dir])
      Assert.equal(shut.code, 4, shut.out)
      Assert.equal(JSON.parse(shut.out).verdict, 'error')
    }

    // An option that is genuinely unknown is still refused.
    Assert.equal(cli(['mod', 'tidy', '--nonsense', dir]).code, 2)
  })


  test('vendor-refuses-an-escaping-path', () => {
    const escaping = 'corp.example/../../../outside/pwned@1'
    const hash = canonHash(new Aontu().unify(MODULE))

    const dir = project('')
    // The module sits in the cache under its pin, so the ONLY thing
    // standing between the lockfile and the copy is the path gate.
    const xdg = Path.join(dir, 'xdg')
    const cachedir = Path.join(xdg, 'aontu', 'mod', hash)
    Fs.mkdirSync(cachedir, { recursive: true })
    Fs.writeFileSync(Path.join(cachedir, 'mod.aon'),
      'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n')
    Fs.writeFileSync(Path.join(cachedir, 'service.aon'), MODULE)
    writeLock(dir,
      '{"lock":{"' + escaping + '":{"canon":"' + hash +
      '","oci":"","v":"1.0.0"}}}\n')

    const prev = process.env.XDG_CACHE_HOME
    process.env.XDG_CACHE_HOME = xdg
    let r
    try {
      r = cli(['mod', 'vendor', dir])
    }
    finally {
      if (undefined === prev) {
        delete process.env.XDG_CACHE_HOME
      }
      else {
        process.env.XDG_CACHE_HOME = prev
      }
    }

    // Nothing outside the project, at any of the levels `..` reaches.
    for (const up of [
      Path.join(dir, '..', '..', 'outside'),
      Path.join(dir, '..', 'outside'),
      Path.join(dir, 'outside'),
    ]) {
      Assert.equal(Fs.existsSync(up), false, 'wrote outside the project: ' + up)
    }
    // And nothing inside it either: the module is not vendored at all.
    Assert.equal(Fs.existsSync(Path.join(dir, 'aontu_meta', 'vendor')), false, r.out)
    Assert.equal(r.code, 1, r.out)
    Assert.ok(r.out.includes(escaping + ': not fetched'), r.out)
  })


  test('verify-catches-a-tampered-store-and-changes-nothing', () => {
    const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) =>
      vendor(d, 'corp.example/schemas/service@1', {
        'mod.aon':
          'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
        'service.aon': MODULE,
      }))

    Assert.equal(cli(['mod', 'tidy', dir]).code, 0)
    const lock = Fs.readFileSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon'), 'utf8')

    const clean = cli(['mod', 'verify', dir])
    Assert.equal(clean.code, 0, clean.out)
    Assert.ok(clean.out.includes(': verified'), clean.out)

    // Tamper, and ask again.
    const svc = Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas',
      'service@1', 'service.aon')
    Fs.writeFileSync(svc,
      Fs.readFileSync(svc, 'utf8').replace('8080', '9090'))

    const bad = cli(['mod', 'verify', dir])
    Assert.equal(bad.code, 1, bad.out)
    Assert.ok(bad.out.includes('verdict: mismatch'), bad.out)
    Assert.ok(bad.out.includes('but the store means'), bad.out)
    // THE LOCKFILE IS UNTOUCHED, which is the whole difference from
    // tidy: a gate that rewrote what it was checking would pass every
    // time.
    Assert.equal(Fs.readFileSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon'), 'utf8'), lock)

    Fs.writeFileSync(svc, 'a: 1\na: 2\n')
    const broken = cli(['mod', 'verify', dir])
    Assert.equal(broken.code, 1, broken.out)
    Assert.ok(broken.out.includes('it does not evaluate'), broken.out)
  })


  test('verify-refuses-a-project-the-lockfile-does-not-cover', () => {
    const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) =>
      vendor(d, 'corp.example/schemas/service@1', {
        'mod.aon':
          'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
        'service.aon': MODULE,
      }))

    const bare = cli(['mod', 'verify', dir])
    Assert.equal(bare.code, 1, bare.out)
    Assert.ok(bare.out.includes('verdict: unlocked'), bare.out)
    Assert.ok(bare.out.includes(
      'corp.example/schemas/service@1: not in the lockfile (run: aontu mod tidy)'),
      bare.out)

    // Tidy writes it, and the same question now passes.
    Assert.equal(cli(['mod', 'tidy', dir]).code, 0)
    Assert.equal(cli(['mod', 'verify', dir]).code, 0)

    Fs.writeFileSync(Path.join(dir, 'mod.aon'),
      'mod: {path: "corp.example/app"}\ndep: {' +
      '"corp.example/schemas/service@1": {v: "1.4.2"}, ' +
      '"corp.example/schemas/later@1": {v: "1.0.0"}}\n')
    const stale = cli(['mod', 'verify', '--format', 'json', dir])
    Assert.equal(stale.code, 1, stale.out)
    const report = JSON.parse(stale.out)
    Assert.equal(report.verdict, 'unlocked')
    Assert.deepEqual(report.unlocked, ['corp.example/schemas/later@1'])
    Assert.deepEqual(report.verified, ['corp.example/schemas/service@1'])
  })


  test('verify-reports-what-no-store-holds', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-mod-'))
    writeLock(dir,
      '# mod-lock.aon (generated by `aontu mod tidy`; do not edit)\n' +
      '{"lock":{"corp.example/absent@1":{"canon":"aon1-x","oci":"","v":"1"},' +
      '"corp.example/hollow@1":{"canon":"aon1-y","oci":"","v":"1"},' +
      '"not-a-module":{"canon":"aon1-z","oci":"","v":"1"}}}\n')

    // hollow@1 is vendored as a directory with a mod.aon naming an
    // entry file that was never written.
    vendor(dir, 'corp.example/hollow@1', {
      'mod.aon': 'mod: {path: "corp.example/hollow", main: "hollow.aon"}\n',
    })

    const r = cli(['mod', 'verify', '--format', 'json', dir])
    Assert.equal(r.code, 1, r.out)
    const report = JSON.parse(r.out)
    Assert.equal(report.verdict, 'missing')
    Assert.deepEqual(report.mismatched, [])
    Assert.deepEqual(report.missing, [
      'corp.example/absent@1', 'corp.example/hollow@1', 'not-a-module'])

    // And in text, where the line names the repair -- here a fetch,
    // because the module itself is what is absent.
    const text = cli(['mod', 'verify', dir])
    Assert.equal(text.code, 1, text.out)
    Assert.ok(text.out.includes('verdict: missing'), text.out)
    Assert.ok(text.out.includes(
      'corp.example/absent@1: not fetched (run: aontu mod get)'), text.out)
  })


  test('tidy-writes-the-lockfile-in-canonical-form', () => {
    const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) =>
      vendor(d, 'corp.example/schemas/service@1', {
        'mod.aon':
          'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
        'service.aon': MODULE,
      }))

    const r = cli(['mod', 'tidy', dir])
    Assert.equal(r.code, 0, r.err)
    Assert.ok(r.out.includes('verdict: ok'))

    const lock = Fs.readFileSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon'), 'utf8')
    // A HEADER the file's own reader skips, then ONE canonical line —
    // sorted keys, no spaces — which is also the JSON the resolver
    // reads a pin back from.
    Assert.ok(lock.startsWith('# mod-lock.aon (generated by'))
    const line = lock.split('\n')[1]
    Assert.equal(line, '{"lock":{"corp.example/schemas/service@1":{"canon":"' +
      canonHash(new Aontu().unify(MODULE)) + '","oci":"","v":"1.4.2"}}}')
    Assert.deepEqual(Object.keys(JSON.parse(line).lock),
      ['corp.example/schemas/service@1'])
  })


  test('tidy-selects-the-maximum-of-the-minima', () => {
    const dir = project(
      '"corp.example/s@1": {v: "1.2.0"}, "corp.example/geo@1": {v: "1.2.0"}',
      (d) => {
        vendor(d, 'corp.example/s@1', {
          'mod.aon': 'mod: {path: "corp.example/s"}\n' +
            'dep: {"corp.example/geo@1": {v: "1.10.0"}}\n',
          'main.aon': MODULE,
        })
        vendor(d, 'corp.example/geo@1', {
          'mod.aon': 'mod: {path: "corp.example/geo"}\n',
          'main.aon': 'region: string\n',
        })
      })

    const r = cli(['mod', 'tidy', dir])
    Assert.equal(r.code, 0, r.err)
    Assert.ok(r.out.includes('corp.example/geo@1 1.10.0 aon1-'), r.out)
  })


  test('version-order-is-numeric', () => {
    Assert.equal(versionCompare('1.10.0', '1.9.0'), 1)
    // A part the shorter version does not have is ZERO.
    Assert.equal(versionCompare('1.2', '1.2.0'), 0)
    Assert.equal(versionCompare('1.2.0', '1.2.0'), 0)
    // A part that is not a number sorts as text, AFTER every number: a
    // pre-release tag is below no version and above none.
    Assert.equal(versionCompare('1.2.0', '1.2.rc'), -1)
    Assert.equal(versionCompare('1.2.rc', '1.2.0'), 1)
    Assert.equal(versionCompare('1.2.rc', '1.2.beta'), 1)
    // Both directions of both rules: a comparison that answered only
    // one way round would still pass a single-sided test, and MVS reads
    // it from whichever side the frontier happens to hold.
    Assert.equal(versionCompare('1.2.0', '1.2'), 0)
    Assert.equal(versionCompare('1.2.beta', '1.2.rc'), -1)
  })


  test('tidy-with-no-module-file-locks-nothing', () => {
    // A directory that declares nothing depends on nothing. The
    // lockfile is still written, and says so: an empty closure is a
    // resolved closure.
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modtool-'))
    const r = cli(['mod', 'tidy', dir])
    Assert.equal(r.code, 0, r.err)
    Assert.equal(r.out.trim(), 'verdict: ok')
    Assert.equal(
      Fs.readFileSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon'), 'utf8').split('\n')[1],
      '{"lock":{}}')
  })


  test('tidy-cannot-see-a-key-that-is-not-a-module-path', () => {
    // A dependency key the router would not call a module names nothing
    // any store can hold, so it is reported the same way a module that
    // is simply not there is — there is no third answer to give.
    const dir = project('"not-a-module": {v: "1.0.0"}')
    const r = cli(['mod', 'tidy', dir])
    Assert.equal(r.code, 1)
    Assert.ok(r.out.includes('not-a-module: not fetched'), r.out)
  })


  test('tidy-keeps-the-highest-bid-and-ignores-a-later-lower-one', () => {
    const dir = project(
      '"corp.example/s@1": {v: "1.0.0"}, "corp.example/t@1": {v: "1.0.0"}, ' +
      '"corp.example/geo@1": {v: "2.0.0"}',
      (d) => {
        vendor(d, 'corp.example/s@1', {
          'mod.aon': 'mod: {path: "corp.example/s"}\n' +
            'dep: {"corp.example/geo@1": {v: "1.5.0"}}\n',
          'main.aon': MODULE,
        })
        vendor(d, 'corp.example/t@1', {
          'mod.aon': 'mod: {path: "corp.example/t"}\n' +
            'dep: {"corp.example/geo@1": {v: "1.1.0"}}\n',
          'main.aon': MODULE,
        })
        vendor(d, 'corp.example/geo@1', {
          'mod.aon': 'mod: {path: "corp.example/geo"}\n',
          'main.aon': 'region: string\n',
        })
      })

    const r = cli(['mod', 'tidy', '--format', 'json', dir])
    Assert.equal(r.code, 0, r.err)
    const geo = JSON.parse(r.out).lock
      .find((e: any) => 'corp.example/geo@1' === e.mod)
    Assert.equal(geo.v, '2.0.0')
  })


  test('tidy-recomputes-the-canon-pin-and-carries-the-oci-over', () => {
    const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) => {
      vendor(d, 'corp.example/schemas/service@1', {
        'mod.aon':
          'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
        'service.aon': MODULE,
      })
      writeLock(d,
        '# mod-lock.aon (generated by `aontu mod tidy`; do not edit)\n' +
        '{"lock":{"corp.example/schemas/service@1":{"canon":"aon1-stale",' +
        '"oci":"sha256:6b86","v":"1.0.0"}}}\n')
    })

    const r = cli(['mod', 'tidy', '--format', 'json', dir])
    Assert.equal(r.code, 0, r.err)
    const e = JSON.parse(r.out).lock[0]
    Assert.equal(e.canon, canonHash(new Aontu().unify(MODULE)))
    Assert.equal(e.oci, 'sha256:6b86')
  })


  test('tidy-pins-nothing-for-a-module-whose-entry-is-missing', () => {
    // A module file naming an entry that is not there has no meaning to
    // hash. The empty pin is the honest answer: the module resolved,
    // and nothing about it was verifiable.
    const dir = project('"corp.example/s@1": {v: "1.0.0"}', (d) =>
      vendor(d, 'corp.example/s@1', {
        'mod.aon': 'mod: {path: "corp.example/s", main: "gone.aon"}\n',
      }))
    const r = cli(['mod', 'tidy', '--format', 'json', dir])
    Assert.equal(r.code, 0, r.err)
    Assert.equal(JSON.parse(r.out).lock[0].canon, '')
  })


  test('an-unreadable-lockfile-locks-nothing', () => {
    for (const text of [
      'this is not the canonical line\n',
      '{"other":{}}\n',
      '{"lock":{"corp.example/s@1":{"canon":1,"oci":2,"v":3}}}\n',
    ]) {
      const dir = project('')
      writeLock(dir, text)
      const r = cli(['mod', 'vendor', dir])
      Assert.equal(r.out.trim().split('\n')[0], 'verdict: ' +
        (text.startsWith('{"lock"') ? 'missing' : 'ok'), r.out)
    }
  })


  test('vendor-reports-a-module-path-no-store-holds', () => {
    // Distinct from the key that is not a module path at all: this one
    // routes, and there is simply nothing behind it.
    const dir = project('')
    writeLock(dir,
      '{"lock":{"corp.example/absent@1":{"canon":"aon1-x","oci":"","v":"1"}}}\n')
    const r = cli(['mod', 'vendor', dir])
    Assert.equal(r.code, 1)
    Assert.ok(r.out.includes('corp.example/absent@1: not fetched'), r.out)
  })


  test('vendor-copies-the-whole-source-tree', () => {
    // A module is a TREE, not an entry file — that is what an OCI layer
    // holds — so nested directories come across too.
    const w = world('cache')
    Fs.mkdirSync(Path.join(w.cache, w.hash, 'part'), { recursive: true })
    Fs.writeFileSync(Path.join(w.cache, w.hash, 'part', 'extra.aon'),
      'extra: true\n')
    writeLock(w.dir,
      '{"lock":{"corp.example/schemas/service@1":{"canon":"' + w.hash +
      '","oci":"","v":"1.4.2"}}}\n')

    const saved = process.env.XDG_CACHE_HOME
    const xdg = Path.join(w.dir, 'xdg')
    Fs.mkdirSync(Path.join(xdg, 'aontu'), { recursive: true })
    Fs.renameSync(w.cache, Path.join(xdg, 'aontu', 'mod'))
    process.env.XDG_CACHE_HOME = xdg
    try {
      Assert.equal(cli(['mod', 'vendor', w.dir]).code, 0)
      Assert.equal(Fs.readFileSync(Path.join(w.dir, 'aontu_meta', 'vendor', 'corp.example',
        'schemas', 'service@1', 'part', 'extra.aon'), 'utf8'), 'extra: true\n')
    }
    finally {
      if (undefined === saved) {
        delete process.env.XDG_CACHE_HOME
      }
      else {
        process.env.XDG_CACHE_HOME = saved
      }
    }
  })


  test('tidy-refuses-to-lock-what-it-cannot-see', () => {
    // A lockfile naming a module nobody has is a lie, so no lockfile is
    // written at all — and the message names the step that would fix
    // it, which is the step this build does not ship.
    const dir = project('"corp.example/absent@1": {v: "1.0.0"}')
    const r = cli(['mod', 'tidy', dir])
    Assert.equal(r.code, 1)
    Assert.ok(r.out.includes('corp.example/absent@1: not fetched'), r.out)
    Assert.equal(Fs.existsSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon')), false)
  })


  test('vendor-materialises-the-locked-closure', () => {
    // From the CACHE, keyed by the hash the lockfile pins: that is what
    // content-addressed means, and it is why `vendor` needs a lockfile
    // while `tidy` needs a store.
    const w = world('cache')
    writeLock(w.dir,
      '# mod-lock.aon (generated by `aontu mod tidy`; do not edit)\n' +
      '{"lock":{"corp.example/schemas/service@1":{"canon":"' + w.hash +
      '","oci":"","v":"1.4.2"}}}\n')

    const saved = process.env.XDG_CACHE_HOME
    const xdg = Path.join(w.dir, 'xdg')
    Fs.mkdirSync(Path.join(xdg, 'aontu'), { recursive: true })
    Fs.renameSync(w.cache, Path.join(xdg, 'aontu', 'mod'))
    process.env.XDG_CACHE_HOME = xdg
    try {
      const r = cli(['mod', 'vendor', w.dir])
      Assert.equal(r.code, 0, r.err)
      Assert.ok(Fs.existsSync(Path.join(w.dir, 'aontu_meta', 'vendor', 'corp.example',
        'schemas', 'service@1', 'service.aon')))
    }
    finally {
      if (undefined === saved) {
        delete process.env.XDG_CACHE_HOME
      }
      else {
        process.env.XDG_CACHE_HOME = saved
      }
    }
  })


  test('vendor-reports-what-no-store-has', () => {
    const dir = project('')
    writeLock(dir,
      '{"lock":{"nope@1":{"canon":"x","oci":"","v":"1"},' +
      '"not-a-module":{"canon":"y","oci":"","v":"1"}}}\n')
    const r = cli(['mod', 'vendor', dir])
    Assert.equal(r.code, 1)
    Assert.ok(r.out.includes('nope@1: not fetched'), r.out)
    Assert.ok(r.out.includes('not-a-module: not fetched'), r.out)
  })


  test('the-network-half-says-which-half-it-is', () => {
    // `get` and `publish` are named rather than left to fall out as an
    // unknown subcommand: a reader of the design will type them, and
    // deserves to be told which half is missing.
    for (const sub of ['get', 'publish']) {
      const r = cli(['mod', sub])
      Assert.equal(r.code, 2)
      Assert.ok(r.err.includes('needs a registry client'), r.err)
    }
  })


  test('mod-arguments', () => {
    Assert.equal(cli(['mod', '--help']).code, 0)
    Assert.ok(cli(['mod']).err.includes('needs tidy, verify, vendor or manifest'))
    Assert.ok(cli(['mod', 'nope']).err.includes('needs tidy, verify, vendor or manifest'))
    Assert.ok(cli(['mod', 'tidy', 'a', 'b']).err
      .includes('needs tidy, verify, vendor or manifest'))
    Assert.ok(cli(['mod', '--format', 'yaml', 'tidy']).err
      .includes('text or json'))
    Assert.ok(cli(['mod', '--nope', 'tidy']).err.includes('unknown mod option'))
  })


  test('tidy-json-is-the-report', () => {
    const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) =>
      vendor(d, 'corp.example/schemas/service@1', {
        'mod.aon':
          'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
        'service.aon': MODULE,
      }))
    const r = cli(['mod', 'tidy', '--format', 'json', dir])
    const report = JSON.parse(r.out)
    Assert.equal(report.aontu.verb, 'mod tidy')
    Assert.equal(report.verdict, 'ok')
    Assert.equal(report.lock[0].mod, 'corp.example/schemas/service@1')
    Assert.deepEqual(report.missing, [])
  })


  // A module in its own right: it declares its path, its version and
  // its entry, which is what a publish needs and a dependency does not.
  function publishable(version: string, src: string,
    extra?: (dir: string) => void): string {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modpub-'))
    Fs.writeFileSync(Path.join(dir, 'mod.aon'),
      'mod: {path: "corp.example/schemas/service"' +
      ('' === version ? '' : ', version: "' + version + '"') +
      ', main: "service.aon"}\n')
    if ('' !== src) {
      Fs.writeFileSync(Path.join(dir, 'service.aon'), src)
    }
    extra?.(dir)
    return dir
  }

  const manifestOf = (dir: string, against?: string) => {
    const args = ['mod', 'manifest', '--format', 'json']
    if (null != against) {
      args.push('--against', against)
    }
    const r = cli([...args, dir])
    return { code: r.code, report: JSON.parse(r.out) }
  }


  test('manifest-is-what-a-publish-would-push', () => {
    const dir = publishable('1.1.0', MODULE)
    const { code, report } = manifestOf(dir)

    Assert.equal(code, 0)
    Assert.equal(report.verdict, 'ok')
    Assert.equal(report.mod, 'corp.example/schemas/service@1')
    Assert.equal(report.version, '1.1.0')
    Assert.equal(report.config, 'application/vnd.aontu.module.v1+json')
    // The canon-hash is THE pin: the same string `mod tidy` locks and
    // `aontu hash` prints, so "has the truth changed?" is one annotation
    // read and a string compare.
    Assert.equal(report.canon, canonHash(new Aontu().unify(MODULE)))
    Assert.deepEqual(report.annotations, {
      'com.github.rjrodger.aontu.canon': report.canon,
      'com.github.rjrodger.aontu.major': '1',
      'org.opencontainers.image.title': 'corp.example/schemas/service',
      'org.opencontainers.image.version': '1.1.0',
    })
    Assert.deepEqual(report.files, ['mod.aon', 'service.aon'])
  })


  test('the-layer-is-the-source-tree-without-the-vendor-copy', () => {
    const dir = publishable('1.1.0', MODULE, (d) => {
      Fs.mkdirSync(Path.join(d, 'part'))
      Fs.writeFileSync(Path.join(d, 'part', 'extra.aon'), 'extra: true\n')
      vendor(d, 'corp.example/other@1', { 'mod.aon': 'mod: {path: "x"}\n' })
    })
    Assert.deepEqual(manifestOf(dir).report.files,
      ['mod.aon', 'part/extra.aon', 'service.aon'])
  })


  test('a-manifest-needs-a-version-and-an-entry', () => {
    const noVersion = manifestOf(publishable('', MODULE))
    Assert.equal(noVersion.code, 4)
    Assert.equal(noVersion.report.verdict, 'error')
    Assert.deepEqual(noVersion.report.missing, ['mod.version'])

    const noEntry = manifestOf(publishable('1.0.0', ''))
    Assert.equal(noEntry.code, 4)
    Assert.deepEqual(noEntry.report.missing, ['service.aon'])

    Assert.ok(cli(['mod', 'manifest', publishable('', '')]).out
      .includes('mod.version: missing'))
  })


  test('the-gate-refuses-a-breaking-version', () => {
    const prior = publishable('1.0.0', MODULE)
    const next = publishable('1.1.0', MODULE + 'region: *"eu" | string\n')

    const { code, report } = manifestOf(next, prior)
    Assert.equal(code, 1)
    Assert.equal(report.verdict, 'breaking')
    Assert.equal(report.findings[0].path, '$.region')

    // And a compatible change passes the same gate.
    const widened = publishable('1.2.0', 'name: string\n')
    const ok = manifestOf(widened, prior)
    Assert.equal(ok.code, 0)
    Assert.equal(ok.report.verdict, 'ok')
    Assert.deepEqual(ok.report.findings, [])
  })


  test('a-major-bump-is-where-breaking-is-allowed', () => {
    // The major lives in the module path, so a consumer of `@1` never
    // sees `@2` unless it asks. Checking compatibility across majors
    // would forbid the one change the version scheme exists to express.
    const prior = publishable('1.0.0', MODULE)
    const next = publishable('2.0.0', MODULE + 'region: string\n')

    const { code, report } = manifestOf(next, prior)
    Assert.equal(code, 0)
    Assert.equal(report.verdict, 'ok')
    Assert.equal(report.mod, 'corp.example/schemas/service@2')
  })


  test('a-prior-version-with-no-entry-cannot-be-gated-against', () => {
    const { code, report } = manifestOf(
      publishable('1.1.0', MODULE), publishable('1.0.0', ''))
    Assert.equal(code, 4)
    Assert.equal(report.verdict, 'error')
    Assert.deepEqual(report.missing, ['service.aon'])
  })


  test('the-gate-can-be-undecided', () => {
    const { code, report } = manifestOf(
      publishable('1.1.0', 'a: must(min(1), "m")\n'),
      publishable('1.0.0', 'a: min(1)\n'))
    Assert.equal(code, 3)
    Assert.equal(report.verdict, 'undecided')
  })


  test('a-module-file-that-declares-nothing-mints-nothing', () => {
    // A module file is ordinary Aontu, so it can say anything. What it
    // does not say about ITSELF leaves the manifest with nothing to
    // mint, which is the same answer as saying nothing at all.
    for (const src of ['1\n', 'dep: {}\n', 'mod: 1\n']) {
      const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modpub-'))
      Fs.writeFileSync(Path.join(dir, 'mod.aon'), src)
      const { code, report } = manifestOf(dir)
      Assert.equal(code, 4, src)
      Assert.deepEqual(report.missing, ['main.aon', 'mod.path', 'mod.version'])
    }

    // And a directory with no module file at all, which says the same
    // thing by saying nothing.
    const bare = manifestOf(Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modpub-')))
    Assert.equal(bare.code, 4)
    Assert.deepEqual(bare.report.missing,
      ['main.aon', 'mod.path', 'mod.version'])
  })


  test('manifest-text-and-arguments', () => {
    const out = cli(['mod', 'manifest', publishable('1.1.0', MODULE)]).out
    Assert.ok(out.includes('corp.example/schemas/service@1 1.1.0'), out)
    Assert.ok(out.includes('config: application/vnd.aontu.module.v1+json'), out)
    Assert.ok(out.includes('layer: service.aon'), out)

    const refused = cli(['mod', 'manifest',
      '--against', publishable('1.0.0', MODULE),
      publishable('1.1.0', MODULE + 'region: *"eu" | string\n')])
    Assert.equal(refused.code, 1)
    Assert.ok(refused.out.includes('verdict: breaking'), refused.out)
    Assert.ok(refused.out.includes('$.region: '), refused.out)

    // `--against` gates a manifest and means nothing to the other two;
    // accepting it there would say it had been honoured.
    Assert.ok(cli(['mod', 'tidy', '--against', 'x', '.']).err
      .includes('--against is a manifest option'))
    Assert.ok(cli(['mod', 'manifest', '--against']).err
      .includes('--against needs a module directory'))
    Assert.ok(cli(['mod', 'nope']).err
      .includes('needs tidy, verify, vendor or manifest'))
  })

})


/* Copyright (c) 2025 Richard Rodger, MIT License */

// MODULES (G6 phase 2, docs/capability-review/g6-distribution.md). The
// shared contract rows are test/spec/mod.tsv (both runners,
// root-confined to the fixtures directory, which is also why they never
// reach the user cache); what is per-port — the cache location, the
// host-injected filesystem, the verification depth bound — is here,
// with go/mod_test.go as the twin.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { Aontu, canonHash } from '../dist/aontu'
import { main as cliMain } from '../dist/cli'
import { versionCompare } from '../dist/mod-tool'
import { modCacheDirFor } from '../dist/mod'

import { srcPath } from './srcpath'



const MODULE = 'name: string\nport: *8080 | integer\n'


// A project whose main.aon imports one module, and the module itself,
// placed wherever the caller says. Answers the paths and the module's
// canon-hash — which is what a pin IS, so a test that wants to pin
// something has to compute it the same way `aontu hash` does.
function world(store: 'vendor' | 'cache'): {
  dir: string, main: string, hash: string, cache: string
} {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-mod-'))
  const cache = Path.join(dir, 'cache')

  const hash = canonHash(new Aontu().unify(MODULE))

  const moddir = 'vendor' === store
    ? Path.join(dir, 'aon_vendor', 'corp.example', 'schemas', 'service@1')
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

  test('cache-is-content-addressed', () => {
    // No vendor copy at all: the module is in the user cache, under its
    // OWN HASH. That is what content-addressed means — a cache hit is
    // already the right meaning before anything is read from it, which
    // is also why the cache is consulted only when a pin is known.
    const w = world('cache')
    const a0 = new Aontu({ mod: { cache: w.cache } } as any)
    Assert.deepEqual(
      a0.generate('x: @"' + srcPath(w.main) + '"'),
      { x: { svc: { name: 'auth', port: 8080 } } })
  })


  test('cache-is-not-consulted-under-a-root', () => {
    // A confined evaluation sees the project's own aon_vendor/ and
    // nothing else: the cache lives outside any root, so a rooted
    // profile that would have to reach it reports the module missing
    // instead. (docs/trust.md: confinement is about what may be READ.)
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
    // With no host-named cache the platform's own is used. Pointed at a
    // temporary directory through XDG_CACHE_HOME so the test never
    // reads the developer's real cache — the point is the LOOKUP, not
    // where a particular machine keeps it.
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


  // THE PLATFORM RULE, WITH THE PLATFORM PASSED IN. A Windows arm
  // cannot be reached from a suite that never runs on Windows, so it is
  // exercised here rather than trusted — which is the whole reason
  // modCacheDir splits into modCacheDirFor. Twin: TestModCacheDirRule
  // in go/mod_test.go.
  test('cache-dir-rule', () => {
    const at = (...p: string[]) => Path.join(...p)

    // The explicit override wins on every platform.
    Assert.equal(
      modCacheDirFor('linux', { XDG_CACHE_HOME: '/x', HOME: '/h' }),
      at('/x', 'aontu', 'mod'))
    Assert.equal(
      modCacheDirFor('win32', { XDG_CACHE_HOME: '/x', LOCALAPPDATA: 'C:/L' }),
      at('/x', 'aontu', 'mod'))

    // Below it the platforms differ, which is the point.
    Assert.equal(
      modCacheDirFor('win32', { LOCALAPPDATA: 'C:/L', HOME: '/h' }),
      at('C:/L', 'aontu', 'mod'))
    Assert.equal(
      modCacheDirFor('linux', { LOCALAPPDATA: 'C:/L', HOME: '/h' }),
      at('/h', '.cache', 'aontu', 'mod'))
    Assert.equal(
      modCacheDirFor('win32', { HOME: '/h' }),
      at('/h', '.cache', 'aontu', 'mod'))

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
    Fs.rmSync(Path.join(w.dir, 'aon_vendor'), { recursive: true })
    const a0 = new Aontu({ fs: Fs } as any)
    Assert.throws(
      () => a0.generate('x: @"' + srcPath(w.main) + '"'),
      (err: any) => String(err.message).includes('module not fetched:'))
  })


  test('host-filesystem-is-the-one-modules-are-read-from', () => {
    // An injected `fs` is the filesystem the host gave this evaluation,
    // and a module store read through any other one would escape it.
    // Injecting the real fs proves the channel: the module leg reads
    // through the host's handle rather than importing its own.
    const w = world('vendor')
    const a0 = new Aontu({ fs: Fs } as any)
    Assert.deepEqual(
      a0.generate('x: @"' + srcPath(w.main) + '"'),
      { x: { svc: { name: 'auth', port: 8080 } } })
  })


  test('a-vendor-store-outside-the-root-is-denied', () => {
    // Confinement is about what may be READ (docs/trust.md), and a
    // project root found by walking UP can sit above the confinement
    // root — so the vendor store it names is outside, and reading it
    // would be the escape the root exists to refuse.
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
    // A pinned module is verified by EVALUATING it, and that evaluation
    // resolves the module's own imports — so a vendor tree that led
    // back to itself would recurse until the host's stack gave out. The
    // bound makes it a stated refusal instead, exactly as unify_cycle
    // does, because a verdict that depends on the machine is what
    // docs/trust.md forbids. Entered at the bound directly: building a
    // sixteen-deep vendor tree would prove the same thing and nothing
    // more.
    const w = world('vendor')
    const a0 = new Aontu({ mod: { depth: 16 } } as any)
    Assert.throws(
      () => a0.generate('x: @"' + srcPath(w.main) + '"'),
      (err: any) => String(err.message).includes('module depth:'))
  })

})


// THE MODULE TOOLING (G6 phase 3, ts/src/mod-tool.ts). Both
// subcommands are LOCAL, and both are file operations, so they are
// proved here rather than in the shared suite — which has no mode for
// "run a command in a directory". The two ports were diffed over the
// same sixteen invocations (text and JSON, every usage error, the
// lockfile bytes and the vendor tree): identical but for the version
// field, G2 phase 3's standing carve-out.
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
    const p = Path.join(dir, 'aon_vendor', ...path.split('/'))
    Fs.mkdirSync(p, { recursive: true })
    for (const name of Object.keys(files)) {
      Fs.writeFileSync(Path.join(p, name), files[name])
    }
  }


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

    const lock = Fs.readFileSync(Path.join(dir, 'mod-lock.aon'), 'utf8')
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
    // MINIMUM VERSION SELECTION: the project asks for 1.2.0 of geo and
    // the module it depends on asks for 1.10.0, so 1.10.0 is selected —
    // and 1.10.0 is above 1.2.0 by NUMBER, which string order gets
    // wrong. That is the whole reason versionCompare exists.
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
      Fs.readFileSync(Path.join(dir, 'mod-lock.aon'), 'utf8').split('\n')[1],
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
    // The two ways MVS discards a bid. WITHIN a round: `s` and `t` both
    // ask for geo, and the higher ask wins. ACROSS rounds: the project
    // itself asks for geo at 2.0.0, so the 1.x asks that arrive in the
    // next round are already below what is selected and change nothing.
    // Selected versions only rise, which is why this terminates without
    // a cycle check.
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
    // The two pins have different owners. `canon` is what the module in
    // the store MEANS, so it is recomputed — a tidy that carried the old
    // one forward would pin what the module used to mean. `oci` is the
    // registry's word about the bytes it served, which nothing local can
    // hear, so it survives untouched.
    const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) => {
      vendor(d, 'corp.example/schemas/service@1', {
        'mod.aon':
          'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
        'service.aon': MODULE,
      })
      Fs.writeFileSync(Path.join(d, 'mod-lock.aon'),
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
    // Three ways a lockfile can fail to say anything, all answered the
    // same way: it pins nothing. A lockfile is generated, so a file that
    // is not what the generator writes is not a file to guess at.
    for (const text of [
      'this is not the canonical line\n',
      '{"other":{}}\n',
      '{"lock":{"corp.example/s@1":{"canon":1,"oci":2,"v":3}}}\n',
    ]) {
      const dir = project('')
      Fs.writeFileSync(Path.join(dir, 'mod-lock.aon'), text)
      const r = cli(['mod', 'vendor', dir])
      Assert.equal(r.out.trim().split('\n')[0], 'verdict: ' +
        (text.startsWith('{"lock"') ? 'missing' : 'ok'), r.out)
    }
  })


  test('vendor-reports-a-module-path-no-store-holds', () => {
    // Distinct from the key that is not a module path at all: this one
    // routes, and there is simply nothing behind it.
    const dir = project('')
    Fs.writeFileSync(Path.join(dir, 'mod-lock.aon'),
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
    Fs.writeFileSync(Path.join(w.dir, 'mod-lock.aon'),
      '{"lock":{"corp.example/schemas/service@1":{"canon":"' + w.hash +
      '","oci":"","v":"1.4.2"}}}\n')

    const saved = process.env.XDG_CACHE_HOME
    const xdg = Path.join(w.dir, 'xdg')
    Fs.mkdirSync(Path.join(xdg, 'aontu'), { recursive: true })
    Fs.renameSync(w.cache, Path.join(xdg, 'aontu', 'mod'))
    process.env.XDG_CACHE_HOME = xdg
    try {
      Assert.equal(cli(['mod', 'vendor', w.dir]).code, 0)
      Assert.equal(Fs.readFileSync(Path.join(w.dir, 'aon_vendor', 'corp.example',
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
    Assert.equal(Fs.existsSync(Path.join(dir, 'mod-lock.aon')), false)
  })


  test('vendor-materialises-the-locked-closure', () => {
    // From the CACHE, keyed by the hash the lockfile pins: that is what
    // content-addressed means, and it is why `vendor` needs a lockfile
    // while `tidy` needs a store.
    const w = world('cache')
    Fs.writeFileSync(Path.join(w.dir, 'mod-lock.aon'),
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
      Assert.ok(Fs.existsSync(Path.join(w.dir, 'aon_vendor', 'corp.example',
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
    Fs.writeFileSync(Path.join(dir, 'mod-lock.aon'),
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
    Assert.ok(cli(['mod']).err.includes('needs tidy, vendor or manifest'))
    Assert.ok(cli(['mod', 'nope']).err.includes('needs tidy, vendor or manifest'))
    Assert.ok(cli(['mod', 'tidy', 'a', 'b']).err
      .includes('needs tidy, vendor or manifest'))
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


  // THE PUBLISH BOUNDARY (G6 phase 4). What a publish would push is a
  // manifest, and everything it ASSERTS is local: the annotations, the
  // layer's contents, and the gate that decides whether the version may
  // be minted at all. The push itself needs a registry this build does
  // not have; the assertions do not.

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
    // A module is a TREE, so nested directories are in the layer. A
    // published module carries its own sources and not a copy of
    // everyone else's, so `aon_vendor/` is not: a consumer resolves the
    // closure itself, and vendoring it here would publish the world.
    const dir = publishable('1.1.0', MODULE, (d) => {
      Fs.mkdirSync(Path.join(d, 'part'))
      Fs.writeFileSync(Path.join(d, 'part', 'extra.aon'), 'extra: true\n')
      vendor(d, 'corp.example/other@1', { 'mod.aon': 'mod: {path: "x"}\n' })
    })
    Assert.deepEqual(manifestOf(dir).report.files,
      ['mod.aon', 'part/extra.aon', 'service.aon'])
  })


  test('a-manifest-needs-a-version-and-an-entry', () => {
    // A version is what a publish assigns, and the major an import
    // spells lives inside it — a module that declares none has nothing
    // to publish under. An entry file that is not there has no meaning
    // to pin. Neither is a fetch away, so neither is reported as one.
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
    // THE PUBLISH-TIME BREAKING GATE. The semantics belong wholly to G3
    // — this is the wiring, at the one place versions are minted — so
    // the verdict, the findings and the exit class are `aontu
    // breaking`'s, unchanged.
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
    // Subsumption is THREE-valued plus error, and the gate passes all
    // four through: a question it cannot decide is not a pass, and its
    // own exit class is what tells a caller so. `must` carries a
    // message the checker cannot reason about.
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

    // A refused gate names what broke, in text as well as in JSON: the
    // exit code says a publish must not follow, and the body says why.
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
      .includes('needs tidy, vendor or manifest'))
  })

})


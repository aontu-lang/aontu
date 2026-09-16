/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test, after } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import { createServer } from 'node:http'

import {
  main as cliMain, runPackageVerb, runPkg, pkgToolOptions, serveUntilInterrupted,
} from '../dist/cli'
import {
  dirHttp, defaultHttp, startServe, serveObject, objectShape, splitListen,
  pkgPublish, pkgOutdated,
  manifestError, verifyKeyProof, smallOrderKey, signDigest, keyIdFromPem, editDeps,
  publisherFromToken, parsePkgSpec, repoConfig, trustEntryFor, patternMatches,
  baseAdmitted, isLoopback, relPathError, objectPath, pkgWhy, pkgSync,
  writeLayout, PkgRefusal, timestamp, COOLDOWN_HOURS, LIMITS, servedUrl, readBounded,
} from '../dist/pkg-net'
import type { PkgHttp, Served } from '../dist/pkg-net'
import { zipCanonical, sha256Hex } from '../dist/pkg-zip'
import { readLock, ARCHIVE_LIMITS } from '../dist/pkg'
import { cacheSeenDir, moduleDir } from '../dist/mod'


const SERVICE = 'name: string\nport: *8080 | integer\n'
const KEY_PEM = generateKeyPairSync('ed25519').privateKey
  .export({ format: 'pem', type: 'pkcs8' }) as string
const OTHER_PEM = generateKeyPairSync('ed25519').privateKey
  .export({ format: 'pem', type: 'pkcs8' }) as string
const KEY_ID = keyIdFromPem(KEY_PEM)

const FAKE = 'http://127.0.0.1'


function tmp(prefix: string): string {
  return Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-' + prefix + '-'))
}

function write(dir: string, files: Record<string, string>): string {
  for (const name of Object.keys(files)) {
    const full = Path.join(dir, ...name.split('/'))
    Fs.mkdirSync(Path.dirname(full), { recursive: true })
    Fs.writeFileSync(full, files[name])
  }
  return dir
}


// One world: a key, a repository directory, a private cache.
type World = { dir: string, key: string, repo: string, cache: string }

function world(): World {
  const dir = tmp('pkgnet')
  const key = Path.join(dir, 'key.pem')
  Fs.writeFileSync(key, KEY_PEM)
  const repo = Path.join(dir, 'repo')
  Fs.mkdirSync(repo)
  const cache = Path.join(dir, 'xdg')
  Fs.mkdirSync(cache)
  return { dir, key, repo, cache }
}

function servers(http: PkgHttp, onServe?: (s: Served) => Promise<void>,
  io?: { out: (s: string) => void, err: (s: string) => void }): any {
  return {
    lsp: () => undefined,
    mcp: () => undefined,
    serve: onServe ?? (async () => undefined),
    http: () => http,
    ...(null == io ? {} : { io }),
  }
}

async function run(w: World, http: PkgHttp, verb: string, args: string[],
  onServe?: (s: Served) => Promise<void>):
  Promise<{ out: string, err: string, code: number }> {
  const xdg = process.env.XDG_CACHE_HOME
  process.env.XDG_CACHE_HOME = w.cache
  let out = ''
  let err = ''
  const io = { out: (s: string) => { out += s }, err: (s: string) => { err += s } }
  let code = 0
  try {
    code = 'pkg' === verb ?
      await runPkg(args, servers(http, onServe, io)) :
      await runPackageVerb(verb, args, servers(http, onServe, io))
  }
  finally {
    process.env.XDG_CACHE_HOME = xdg
  }
  return { out, err, code }
}

function publisher(w: World, name: string, version: string, src: string,
  extra: string = ''): string {
  const dir = Path.join(w.dir, name + '-' + version)
  write(dir, {
    'pkg.aon': 'pkg: {path: "corp.example/' + name + '", version: "' + version +
      '", main: "main.aon"}\n' + extra,
    'main.aon': src,
  })
  return dir
}

async function publish(w: World, tree: string, extra: string[] = []) {
  return run(w, dirHttp(w.repo), 'publish',
    ['--yes', '--key', w.key, '--to', w.repo, ...extra, tree])
}

const REPO_BLOCK = 'repo: {base: ["' + FAKE + '"], trust: {"corp.example/*": {signer: "' +
  KEY_ID + '", inclusion: none}}}\n'

let consumers = 0

function consumer(w: World, deps: string, repo: string = REPO_BLOCK): string {
  const app = Path.join(w.dir, 'app' + (consumers++))
  write(app, {
    'pkg.aon': 'pkg: {path: "corp.example/app"}\ndep: {' + deps + '}\n' + repo,
    'main.aon': 'svc: @"corp.example/service"\nsvc: name: "auth"\n',
  })
  return app
}

// A publisher with dependencies of its own syncs them first: the
// archive carries no vendor tree, and the gate evaluates the entry.
async function publisherWith(w: World, name: string, version: string, src: string,
  deps: string, extra: string = ''): Promise<string> {
  const dir = publisher(w, name, version, src, 'dep: {' + deps + '}\n' + REPO_BLOCK + extra)
  const r = await run(w, dirHttp(w.repo), 'sync', [dir])
  Assert.equal(r.code, 0, r.out + r.err)
  return dir
}

const at = (w: World, name: string) => Path.join(w.repo, 'pkg', 'corp.example', name, '@v')

function readJson(file: string): any {
  return JSON.parse(Fs.readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('\n'))
}

// A version list rewritten with old first-seen times: outside the cooldown.
function backdate(w: World, name: string, versions?: string[]): void {
  const file = Path.join(at(w, name), 'list')
  const list = readJson(file)
  for (const e of list.versions) {
    if (null == versions || versions.includes(e.version)) {
      e.seen = '2020-01-01T00:00:00Z'
    }
  }
  Fs.writeFileSync(file, JSON.stringify(list) + '\n')
}

// A served object rewritten by hand, its manifest re-signed.
function resign(w: World, name: string, version: string,
  edit: (manifest: any) => void, pem: string = KEY_PEM): void {
  const file = Path.join(at(w, name), version + '.manifest')
  const m = readJson(file)
  edit(m)
  const bytes = Buffer.from(JSON.stringify(m) + '\n')
  Fs.writeFileSync(file, bytes)
  Fs.writeFileSync(Path.join(at(w, name), version + '.sig'),
    JSON.stringify(signDigest(pem, sha256Hex(new Uint8Array(bytes)))) + '\n')
}

function lockOf(app: string): string {
  return Fs.readFileSync(Path.join(app, 'aontu_meta', 'pkg-lock.aon'), 'utf8')
}


describe('pkg-net', () => {

  test('publish-then-sync-round-trip', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    const tree = publisher(w, 'service', '1.4.2', SERVICE)

    const dry = await run(w, http, 'publish', ['--key', w.key, '--to', w.repo, tree])
    Assert.equal(dry.code, 0, dry.err)
    Assert.match(dry.out, /^verdict: dry-run\n/)
    Assert.match(dry.out, /\nsigner: ed25519:/)
    Assert.match(dry.out, /dry run: nothing sent \(add --yes\)\n$/)
    Assert.equal(Fs.readdirSync(w.repo).length, 0)

    const sent = await publish(w, tree)
    Assert.equal(sent.code, 0, sent.err)
    Assert.match(sent.out, /^verdict: sent\n/)
    Assert.match(sent.out, /\nto: /)
    Assert.deepEqual(Fs.readdirSync(at(w, 'service')).sort(),
      ['1.4.2.manifest', '1.4.2.sig', '1.4.2.zip', 'list'])
    Assert.ok(Fs.existsSync(Path.join(w.repo, 'pkg', 'corp.example', 'service', '@latest')))
    Assert.ok(Fs.existsSync(Path.join(w.repo, 'advisory', 'corp.example', 'service.aon')))

    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    const sync = await run(w, http, 'sync', [app])
    Assert.equal(sync.code, 0, sync.err + sync.out)
    Assert.equal(sync.out.split('\n')[0], 'verdict: ok')
    Assert.equal(sync.out.split('\n')[1], 'fetched: corp.example/service 1.4.2')
    const lock = readLock(app)['corp.example/service']
    Assert.equal(lock.v, '1.4.2')
    Assert.match(lock.canon, /^aon1-/)
    Assert.match(lock.archive, /^sha256:/)
    Assert.match(lock.manifest as string, /^sha256:/)
    const vendored = Path.join(app, 'aontu_meta', 'vendor', 'corp.example', 'service')
    Assert.ok(Fs.existsSync(Path.join(vendored, 'aontu_meta', 'manifest.aon')))
    Assert.ok(Fs.existsSync(Path.join(vendored, 'aontu_meta', 'proof.aon')))
    Assert.ok(!Fs.existsSync(Path.join(vendored, 'aontu_meta', 'pkg-lock.aon')))
    Assert.ok(Fs.existsSync(Path.join(w.cache, 'aontu', 'pkg', 'download', 'corp.example',
      'service', '@v', '1.4.2.zip')))
    Assert.ok(Fs.existsSync(Path.join(w.cache, 'aontu', 'pkg', 'seen', 'corp.example',
      'service', '1.4.2.aon')))
    Assert.ok(Fs.existsSync(Path.join(w.cache, 'aontu', 'pkg', 'store', lock.canon,
      'corp.example', 'service', 'main.aon')))

    // Idempotent: nothing fetched, nothing changed.
    const again = await run(w, http, 'sync', [app])
    Assert.equal(again.code, 0)
    Assert.ok(!again.out.includes('fetched'), again.out)
    const frozen = await run(w, http, 'sync', ['--frozen', app])
    Assert.equal(frozen.code, 0, frozen.out)

    const json = await run(w, http, 'sync', ['--format', 'json', app])
    const report = JSON.parse(json.out)
    Assert.equal(report.aontu.verb, 'sync')
    Assert.equal(report.verdict, 'ok')
    Assert.deepEqual(report.fetched, [])

    // Verify agrees with what sync wrote, bytes and meaning.
    const verify = await run(w, http, 'pkg', ['verify', app])
    Assert.equal(verify.code, 0, verify.out)
  })


  test('frozen-refuses-a-lock-that-would-change', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    await publish(w, publisher(w, 'common', '1.0.0', 'x: 1\n'))
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    Assert.equal((await run(w, http, 'sync', [app])).code, 0)

    Fs.appendFileSync(Path.join(app, 'pkg.aon'), 'dep: "corp.example/common": {v: "1.0.0"}\n')
    const added = await run(w, http, 'sync', ['--frozen', app])
    Assert.equal(added.code, 1)
    Assert.match(added.out, /^verdict: frozen\n/)
    Assert.match(added.out, /lockfile would change: corp.example\/common: unlocked -> 1.0.0/)
    Assert.ok(!Fs.existsSync(Path.join(w.cache, 'aontu', 'pkg', 'download', 'corp.example', 'common')),
      'frozen fetched before refusing')
    Assert.equal((await run(w, http, 'sync', [app])).code, 0)

    // A tampered vendor tree repins; a dependency dropped from the
    // package file drops from the lock. Both are changes.
    const main = Path.join(app, 'aontu_meta', 'vendor', 'corp.example', 'service', 'main.aon')
    Fs.writeFileSync(main, SERVICE.replace('8080', '9090'))
    const tampered = await run(w, http, 'sync', ['--frozen', app])
    Assert.equal(tampered.code, 1)
    Assert.match(tampered.out, /lockfile would change: corp.example\/service: repinned/)
    Fs.writeFileSync(main, SERVICE)

    Fs.writeFileSync(Path.join(app, 'pkg.aon'),
      Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8').split('\n')
        .filter((l) => !l.includes('common')).join('\n'))
    const dropped = await run(w, http, 'sync', ['--frozen', app])
    Assert.equal(dropped.code, 1)
    Assert.match(dropped.out, /lockfile would change: corp.example\/common: dropped/)
  })


  test('sync-replaces-a-vendor-tree-at-another-version', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    write(Path.join(app, 'aontu_meta', 'vendor', 'corp.example', 'service'), {
      'pkg.aon': 'pkg: {path: "corp.example/service", version: "1.4.1", main: "main.aon"}\n',
      'main.aon': 'name: string\n',
    })
    const r = await run(w, http, 'sync', [app])
    Assert.equal(r.code, 0, r.out)
    Assert.match(r.out, /fetched: corp.example\/service 1.4.2/)
    Assert.match(Fs.readFileSync(Path.join(app, 'aontu_meta', 'vendor', 'corp.example',
      'service', 'main.aon'), 'utf8'), /8080/)

    // A hand-vendored tree that names no version is taken as it is.
    write(Path.join(app, 'aontu_meta', 'vendor', 'corp.example', 'service'), {
      'pkg.aon': 'pkg: {path: "corp.example/service", main: "main.aon"}\n',
    })
    Fs.rmSync(Path.join(app, 'aontu_meta', 'vendor', 'corp.example', 'service', 'aontu_meta'),
      { recursive: true })
    const kept = await run(w, http, 'sync', [app])
    Assert.equal(kept.code, 0, kept.out)
    Assert.ok(!kept.out.includes('fetched'))

    // With the vendor tree gone, the cache serves without a fetch.
    Fs.rmSync(Path.join(app, 'aontu_meta', 'vendor'), { recursive: true })
    const cached = await run(w, http, 'sync', [app])
    Assert.equal(cached.code, 0, cached.out)
    Assert.ok(!cached.out.includes('fetched'))
  })


  test('get-raises-add-refuses-remove-drops', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    await publish(w, publisher(w, 'service', '1.4.3', SERVICE + 'tier?: string\n'))
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    Assert.equal((await run(w, http, 'sync', [app])).code, 0)

    const raised = await run(w, http, 'get', ['corp.example/service@1.4.3', app])
    Assert.equal(raised.code, 0, raised.out)
    Assert.match(raised.out, /change: raised corp.example\/service 1.4.2 -> 1.4.3/)
    Assert.match(Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8'), /v: "1.4.3"/)
    Assert.equal(readLock(app)['corp.example/service'].v, '1.4.3')

    const same = await run(w, http, 'get', ['corp.example/service@1.4.2', app])
    Assert.equal(same.code, 0)
    Assert.match(same.out, /change: corp.example\/service is at 1.4.3 already/)

    const add = await run(w, http, 'add', ['corp.example/service', app])
    Assert.equal(add.code, 2)
    Assert.match(add.err, /already a dependency at 1.4.3 \(aontu get raises it\)/)

    const removed = await run(w, http, 'remove', ['corp.example/service', app])
    Assert.equal(removed.code, 0, removed.out)
    Assert.match(removed.out, /change: removed corp.example\/service/)
    Assert.ok(!Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8').includes('service'))
    Assert.ok(!Fs.existsSync(Path.join(app, 'aontu_meta', 'vendor', 'corp.example')))
    Assert.deepEqual(readLock(app), {})

    const gone = await run(w, http, 'remove', ['corp.example/service', app])
    Assert.equal(gone.code, 2)
    Assert.match(gone.err, /not a dependency of this project/)

    backdate(w, 'service')
    const added = await run(w, http, 'add', ['corp.example/service', app])
    Assert.equal(added.code, 0, added.out)
    Assert.match(added.out, /change: added corp.example\/service 1.4.3/)
    Assert.match(Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8'),
      /dep: "corp.example\/service": \{ v: "1.4.3" \}/)

    const json = await run(w, http, 'why', ['--format', 'json', 'corp.example/service', app])
    Assert.deepEqual(JSON.parse(json.out).paths, [['corp.example/app', 'corp.example/service']])
  })


  test('cooldown-holds-the-newest-version-back', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    await publish(w, publisher(w, 'service', '1.4.3', SERVICE))
    const app = consumer(w, '')

    const held = await run(w, http, 'get', ['corp.example/service', app])
    Assert.equal(held.code, 1)
    Assert.match(held.out, /^verdict: refused\nchange: none\n/)
    Assert.match(held.out, /refused: cooldown_pending: corp.example\/service 1.4.3 is inside the cooldown until /)
    Assert.ok(!Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8').includes('corp.example/service'))

    const pinned = await run(w, http, 'get', ['corp.example/service@1.4.2', app])
    Assert.equal(pinned.code, 0, pinned.out)
    const nothing = await run(w, http, 'pkg', ['outdated', app])
    Assert.equal(nothing.code, 0, nothing.out)
    Assert.match(nothing.out, /^verdict: current\ncorp.example\/service 1.4.2: current\ncooldown_pending: corp.example\/service 1.4.3 is inside the cooldown until .* and no earlier version is selectable\n$/)
    const dropped = await run(w, http, 'remove', ['corp.example/service', app])
    Assert.equal(dropped.code, 0, dropped.out)

    backdate(w, 'service', ['1.4.2'])
    const older = await run(w, http, 'get', ['corp.example/service', app])
    Assert.equal(older.code, 0, older.out)
    Assert.match(older.out, /change: added corp.example\/service 1.4.2/)
    Assert.match(older.out, /cooldown_pending: corp.example\/service 1.4.3 is inside the cooldown until .*; 1.4.2 was selected/)

    const current = await run(w, http, 'pkg', ['outdated', app])
    Assert.equal(current.code, 0, current.out)
    Assert.match(current.out, /^verdict: current\ncorp.example\/service 1.4.2: current\ncooldown_pending: /)

    backdate(w, 'service')
    const outdated = await run(w, http, 'pkg', ['outdated', '--format', 'json', app])
    Assert.equal(outdated.code, 1)
    const report = JSON.parse(outdated.out)
    Assert.equal(report.verdict, 'outdated')
    Assert.equal(report.locked[0].newest, '1.4.3')

    // A private name skips the cooldown, read from its own repository.
    const priv = consumer(w, '', 'repo: {private: ["corp.example/*"], private_base: ["' + FAKE + '"], ' +
      'trust: {"corp.example/*": {signer: "' + KEY_ID + '", inclusion: none}}}\n')
    Fs.rmSync(Path.join(w.cache, 'aontu'), { recursive: true, force: true })
    await publish(w, publisher(w, 'service', '1.4.4', SERVICE))
    const fresh = await run(w, http, 'get', ['corp.example/service', priv])
    Assert.equal(fresh.code, 0, fresh.out)
    Assert.match(fresh.out, /change: added corp.example\/service 1.4.4/)
  })


  test('outdated-lists-what-moves-and-what-was-retracted', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    Assert.equal((await publish(w, publisher(w, 'common', '1.0.0', 'x: 1\n'))).code, 0)
    Assert.equal((await publish(w, publisher(w, 'common', '1.1.0', 'x: 1\ny?: integer\n'))).code, 0)
    const one = await publish(w, await publisherWith(w, 'service', '1.0.0', '@"corp.example/common"\nname: string\n',
      '"corp.example/common": {v: "1.0.0"}'))
    Assert.equal(one.code, 0, one.out)
    const two = await publish(w, await publisherWith(w, 'service', '1.1.0', '@"corp.example/common"\nname: string\n',
      '"corp.example/common": {v: "1.1.0"}', 'retract: ["1.0.0"]\n'))
    Assert.equal(two.code, 0, two.out)
    const app = consumer(w, '"corp.example/service": {v: "1.0.0"}')
    const sync = await run(w, http, 'sync', [app])
    Assert.equal(sync.code, 0, sync.out)
    Assert.match(sync.out, /fetched: corp.example\/common 1.0.0\nfetched: corp.example\/service 1.0.0/)

    // Inside the cooldown nothing newer is selectable, and the pinned
    // version is still reported as retracted.
    const held = await run(w, http, 'pkg', ['outdated', app])
    Assert.equal(held.code, 1)
    Assert.match(held.out, /^verdict: outdated\ncorp.example\/common 1.0.0: current\ncorp.example\/service 1.0.0: current\ncorp.example\/service 1.0.0: retracted by 1.1.0\ncooldown_pending: /)
    Fs.rmSync(Path.join(w.repo, 'advisory', 'corp.example', 'common.aon'))
    const noAdvisory = await run(w, http, 'pkg', ['outdated', app])
    Assert.equal(noAdvisory.code, 1, noAdvisory.out)
    await publish(w, publisher(w, 'common', '1.2.0', 'x: 1\ny?: integer\n'))
    const heldGet = await run(w, http, 'get', ['corp.example/service', consumer(w, '')])
    Assert.match(heldGet.out, /refused: cooldown_pending: corp.example\/service 1.1.0 is inside the cooldown/)

    // A later, lower bid for a package already selected changes nothing.
    const both = consumer(w, '"corp.example/service": {v: "1.0.0"}, "corp.example/common": {v: "1.1.0"}')
    const b = await run(w, http, 'sync', [both])
    Assert.equal(b.code, 0, b.out)
    Assert.equal(readLock(both)['corp.example/common'].v, '1.1.0')

    backdate(w, 'service')
    backdate(w, 'common', ['1.0.0', '1.1.0'])
    const r = await run(w, http, 'pkg', ['outdated', app])
    Assert.equal(r.code, 1)
    Assert.match(r.out,
      /^verdict: outdated\ncorp.example\/common 1.0.0 -> 1.1.0\ncorp.example\/service 1.0.0 -> 1.1.0\n  corp.example\/common 1.0.0 -> 1.1.0\ncorp.example\/service 1.0.0: retracted by 1.1.0\ncooldown_pending: corp.example\/common 1.2.0 is inside the cooldown until .*; 1.1.0 was selected\n$/)

    // The retraction skips 1.0.0 at a fresh resolution, and the lock
    // that pins it keeps working.
    const fresh = consumer(w, '')
    const got = await run(w, http, 'get', ['corp.example/service', fresh])
    Assert.equal(got.code, 0, got.out)
    Assert.match(got.out, /change: added corp.example\/service 1.1.0/)
    const why = await run(w, http, 'why', ['corp.example/common', fresh])
    Assert.equal(why.out.trimEnd(), 'verdict: ok\ncorp.example/app -> corp.example/service -> corp.example/common')

    // A newest version that retracts others and depends on something
    // the consumer never locked. The advisory gathers what every
    // manifest retracts, in version order rather than manifest order.
    await publish(w, publisher(w, 'extra', '1.0.0', 'e?: integer\n'))
    const three = await publish(w, await publisherWith(w, 'service', '1.2.0',
      '@"corp.example/common"\n@"corp.example/extra"\nname: string\n',
      '"corp.example/common": {v: "1.1.0"}, "corp.example/extra": {v: "1.0.0"}',
      'retract: ["1.0.0", "1.1.0"]\n'))
    Assert.equal(three.code, 0, three.out)
    backdate(w, 'service')
    const again = await run(w, http, 'pkg', ['outdated', app])
    Assert.equal(again.code, 1, again.out)
    Assert.match(again.out,
      /\ncorp.example\/service 1.0.0 -> 1.2.0\n  corp.example\/common 1.0.0 -> 1.1.0\n  corp.example\/extra unlocked -> 1.0.0\ncorp.example\/service 1.0.0: retracted by 1.2.0\n/)
    const advisory = readJson(Path.join(w.repo, 'advisory', 'corp.example', 'service.aon'))
    Assert.deepEqual(advisory.retracted,
      [{ version: '1.0.0', by: '1.1.0' }, { version: '1.0.0', by: '1.2.0' },
      { version: '1.1.0', by: '1.2.0' }])
  })


  test('a-closure-is-acquired-deps-first-and-an-alias-names-its-package', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'common', '1.0.0', 'x: 1\n'))
    await publish(w, await publisherWith(w, 'service', '1.0.0', '@"corp.example/common"\nname: string\n',
      '"corp.example/common": {v: "1.0.0"}'))
    const two = await publish(w, await publisherWith(w, 'service', '2.0.0', '@"corp.example/common"\nname: string\nport?: integer\n',
      '"corp.example/common": {v: "1.0.0"}'))
    Assert.equal(two.code, 0, two.out)

    const app = consumer(w,
      '"corp.example/service": {v: "2.0.0"}, "alias:legacy": {pkg: "corp.example/service", v: "1.0.0"}')
    Fs.writeFileSync(Path.join(app, 'main.aon'),
      'a: @"corp.example/service"\nb: @"alias:legacy"\na: name: "x"\nb: name: "y"\n')
    const r = await run(w, http, 'sync', [app])
    Assert.equal(r.code, 0, r.out)
    const lock = readLock(app)
    Assert.equal(lock['alias:legacy'].pkg, 'corp.example/service')
    Assert.equal(lock['alias:legacy'].v, '1.0.0')
    Assert.equal(lock['corp.example/service'].v, '2.0.0')
    Assert.ok(Fs.existsSync(Path.join(app, 'aontu_meta', 'vendor', 'alias', 'legacy', 'main.aon')))

    const why = await run(w, http, 'why', ['corp.example/service', app])
    Assert.equal(why.out.trimEnd(),
      'verdict: ok\ncorp.example/app -> alias:legacy\ncorp.example/app -> corp.example/service')
    const none = await run(w, http, 'why', ['corp.example/nowhere', app])
    Assert.equal(none.code, 1)
    Assert.equal(none.out.trimEnd(), 'verdict: missing\ncorp.example/nowhere: not in the closure')

    const eval1 = await run(w, http, 'pkg', ['tree', app])
    Assert.equal(eval1.code, 0, eval1.out)

    // One package reached twice in one closure is acquired once.
    await publish(w, await publisherWith(w, 'mid', '1.0.0', '@"corp.example/common"\n',
      '"corp.example/common": {v: "1.0.0"}'))
    const top = await publish(w, await publisherWith(w, 'top', '1.0.0',
      '@"corp.example/common"\n@"corp.example/mid"\n',
      '"corp.example/common": {v: "1.0.0"}, "corp.example/mid": {v: "1.0.0"}'))
    Assert.equal(top.code, 0, top.out)
    Fs.rmSync(Path.join(w.cache, 'aontu'), { recursive: true, force: true })
    const once = await run(w, http, 'sync', [consumer(w, '"corp.example/top": {v: "1.0.0"}')])
    Assert.equal(once.code, 0, once.out)
    Assert.equal(once.out.split('\n').filter((l) => l.startsWith('fetched: ')).length, 3)

    // A dependency of a dependency is pinned for the evaluation of the
    // package above it, though that package never named it.
    const over = await publish(w, await publisherWith(w, 'over', '1.0.0', '@"corp.example/mid"\n',
      '"corp.example/mid": {v: "1.0.0"}'))
    Assert.equal(over.code, 0, over.out)
    Fs.rmSync(Path.join(w.cache, 'aontu'), { recursive: true, force: true })
    const deep = await run(w, http, 'sync', [consumer(w, '"corp.example/over": {v: "1.0.0"}')])
    Assert.equal(deep.code, 0, deep.out)
    const overLock = readLock(Path.join(w.cache, 'aontu', 'pkg', 'store',
      readLock(Path.join(w.dir, 'app' + (consumers - 1)))['corp.example/over'].canon, 'corp.example', 'over'))
    Assert.deepEqual(Object.keys(overLock).sort(), ['corp.example/common', 'corp.example/mid'])
  })


  test('routing-and-trust-refusals', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    const dep = '"corp.example/service": {v: "1.4.2"}'

    const plain = consumer(w, dep, 'repo: {base: ["http://mirror.example"]}\n')
    Assert.ok(plain)
    const notHttps = await run(w, http, 'sync', [plain])
    Assert.equal(notHttps.code, 1)
    Assert.match(notHttps.out, /refused: base_not_https: repository base is not https: http:\/\/mirror.example/)

    const badPattern = consumer(w, dep, 'repo: {trust: {"Corp/x": {signer: forge}}}\n')
    const bp = await run(w, http, 'sync', [badPattern])
    Assert.match(bp.out, /refused: config_invalid: repo.trust: Corp\/x is not a pattern/)
    const badSigner = consumer(w, dep, 'repo: {trust: {"corp.example/*": {signer: "rsa:x"}}}\n')
    const bs = await run(w, http, 'sync', [badSigner])
    Assert.match(bs.out, /refused: config_invalid: repo.trust: corp.example\/\* names no signer/)
    const badPrivate = consumer(w, dep, 'repo: {private: ["Corp/*"]}\n')
    const bpr = await run(w, http, 'sync', [badPrivate])
    Assert.match(bpr.out, /refused: config_invalid: repo.private: Corp\/\* is not a pattern/)

    const priv = consumer(w, dep, 'repo: {private: ["corp.example/service"]}\n')
    const nowhere = await run(w, http, 'sync', [priv])
    Assert.equal(nowhere.code, 1)
    Assert.match(nowhere.out, /refused: private_name_public_path: corp.example\/service is on the private list/)

    // The default trust entry names the forge, which this build refuses.
    const forge = consumer(w, dep, 'repo: {base: ["' + FAKE + '"]}\n')
    const f = await run(w, http, 'sync', [forge])
    Assert.match(f.out, /refused: proof_signer_untrusted: the trust entry for corp.example\/service names the forge signer/)

    const other = consumer(w, dep)
    Fs.writeFileSync(Path.join(other, 'pkg.aon'),
      Fs.readFileSync(Path.join(other, 'pkg.aon'), 'utf8').replace(KEY_ID, keyIdFromPem(OTHER_PEM)))
    const o = await run(w, http, 'sync', [other])
    Assert.match(o.out, /refused: proof_signer_untrusted: the proof for corp.example\/service 1.4.2: signed by ed25519:/)

    const inclusion = consumer(w, dep)
    Fs.writeFileSync(Path.join(inclusion, 'pkg.aon'),
      Fs.readFileSync(Path.join(inclusion, 'pkg.aon'), 'utf8').replace('inclusion: none', 'inclusion: required'))
    const i = await run(w, http, 'sync', [inclusion])
    Assert.match(i.out, /refused: inclusion_missing: /)

    // The most specific entry wins, whatever the declaration order.
    const config = repoConfig(consumer(w, dep,
      'repo: {trust: {"corp.example/service": {signer: "' + KEY_ID + '", inclusion: none}, ' +
      '"corp.example/service/*": {signer: forge}, "corp.example/*": {signer: "' + KEY_ID + '"}}}\n'),
    pkgToolOptions({ kind: 'system', textExt: [] }, w.dir))
    Assert.equal(trustEntryFor(config, 'corp.example/service').signer, KEY_ID)
    Assert.equal(trustEntryFor(config, 'corp.example/service').inclusion, 'none')
    Assert.equal(trustEntryFor(config, 'corp.example/service/sub').signer, 'forge')
    Assert.equal(trustEntryFor(config, 'corp.example/other').inclusion, 'required')
    Assert.equal(trustEntryFor(config, 'other.example/x').signer, 'forge')
    Assert.deepEqual(config.base, ['https://pkg.aontu.dev'])
    Assert.equal(patternMatches('corp.example/*', 'corp.example'), true)
    Assert.equal(patternMatches('corp.example/x', 'corp.example/xy'), false)
    Assert.equal(baseAdmitted('not a url'), false)
    Assert.equal(baseAdmitted('http://localhost:8017'), true)
    Assert.equal(baseAdmitted('http://[::1]:8017'), true)
    Assert.equal(isLoopback('://'), false)
    Assert.equal(objectPath('sigstore', 'corp.example/Svc', '1.0.0'),
      '/pkg/corp.example/!svc/@v/1.0.0.sigstore.json')
  })


  test('selection-refusals', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    await publish(w, publisher(w, 'service', '1.4.3', SERVICE))
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')

    const unknown = await run(w, http, 'get', ['corp.example/nothing@1.0.0', app])
    Assert.match(unknown.out, /refused: fetch_failed: no version list for corp.example\/nothing \(404 from /)
    const absent = await run(w, http, 'get', ['corp.example/service@9.9.9', app])
    Assert.match(absent.out, /refused: fetch_failed: corp.example\/service 9.9.9 is not in the version list/)

    const listFile = Path.join(at(w, 'service'), 'list')
    const list = Fs.readFileSync(listFile)
    Fs.writeFileSync(listFile, JSON.stringify({ package: 'corp.example/other', versions: [] }))
    const other = await run(w, http, 'sync', [app])
    Assert.match(other.out, /refused: response_mismatch: the version list served does not name corp.example\/service/)
    Fs.writeFileSync(listFile, JSON.stringify({ package: 'corp.example/service', versions: [{ version: 'x' }] }))
    const malformed = await run(w, http, 'sync', [app])
    Assert.match(malformed.out, /refused: response_mismatch: the version list for corp.example\/service is malformed/)
    Fs.writeFileSync(listFile, list)

    Assert.equal((await run(w, http, 'sync', [app])).code, 0)
    write(Path.join(w.cache, 'aontu', 'pkg', 'seen', 'corp.example', 'service'),
      { '1.0.0.aon': '{"package":"corp.example/service","version":"1.0.0"}\n' })
    const rollback = await run(w, http, 'get', ['corp.example/service@1.4.3', app])
    Assert.match(rollback.out, /refused: list_rollback: corp.example\/service 1.0.0 was seen before and is absent from the list/)
    Fs.rmSync(Path.join(w.cache, 'aontu', 'pkg', 'seen'), { recursive: true })

    // A tombstone stands where the manifest was, and names its reason.
    Fs.rmSync(Path.join(at(w, 'service'), '1.4.3.manifest'))
    write(Path.join(w.repo, 'tombstone', 'corp.example', 'service', '@v'),
      { '1.4.3.aon': '{"package":"corp.example/service","version":"1.4.3","reason":"malware"}\n' })
    const tomb = await run(w, http, 'get', ['corp.example/service@1.4.3', app])
    Assert.match(tomb.out, /refused: tombstoned: corp.example\/service 1.4.3 was withdrawn by the repository \(malware\)/)
    Fs.writeFileSync(listFile, JSON.stringify({ package: 'corp.example/service',
      versions: [{ version: '1.4.2', seen: '2020-01-01T00:00:00Z' }] }))
    const tombAsked = await run(w, http, 'get', ['corp.example/service@1.4.3', app])
    Assert.match(tombAsked.out, /refused: tombstoned: corp.example\/service 1.4.3/)
    Fs.rmSync(Path.join(w.repo, 'tombstone'), { recursive: true })
    Fs.writeFileSync(listFile, list)
    const gone = await run(w, http, 'get', ['corp.example/service@1.4.3', app])
    Assert.match(gone.out, /refused: fetch_failed: no manifest for corp.example\/service 1.4.3/)

    // Nothing selectable at all.
    Fs.writeFileSync(listFile, JSON.stringify({ package: 'corp.example/service', versions: [] }))
    const empty = await run(w, http, 'get', ['corp.example/service', app])
    Assert.match(empty.out, /refused: fetch_failed: corp.example\/service has no selectable version/)
    Fs.writeFileSync(listFile, list)
  })


  test('a-move-refuses-and-never-redirects', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    await publish(w, publisher(w, 'service', '1.4.3', SERVICE, 'moved: "corp.example/service2"\n'))
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    const older = await run(w, http, 'sync', [app])
    Assert.equal(older.code, 1)
    Assert.match(older.out, /refused: module_moved: corp.example\/service moved to corp.example\/service2; import that instead/)
    const newest = await run(w, http, 'get', ['corp.example/service@1.4.3', app])
    Assert.match(newest.out, /refused: module_moved: corp.example\/service moved to corp.example\/service2/)

    // The path is frozen against publication from anyone.
    const frozen = await publish(w, publisher(w, 'service', '1.4.4', SERVICE))
    Assert.equal(frozen.code, 1)
    Assert.match(frozen.out, /refused: path_moved: corp.example\/service is frozen by a moved declaration \(now corp.example\/service2\)/)
  })


  test('bytes-before-meaning-refusals', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    const fresh = () => Fs.rmSync(Path.join(w.cache, 'aontu'), { recursive: true, force: true })
    const zipFile = Path.join(at(w, 'service'), '1.4.2.zip')
    const original = Fs.readFileSync(zipFile)
    const sigFile = Path.join(at(w, 'service'), '1.4.2.sig')

    Fs.rmSync(sigFile)
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: proof_missing: no proof is served for corp.example\/service 1.4.2/)
    Fs.writeFileSync(sigFile, 'not a proof\n')
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: proof_invalid: the proof for corp.example\/service 1.4.2: the proof is not an aontu-signature\/v1 key proof/)
    resign(w, 'service', '1.4.2', () => undefined)
    const proof = readJson(sigFile)
    Fs.writeFileSync(sigFile, JSON.stringify({ ...proof, over: 'sha256:' + '0'.repeat(64) }))
    Assert.match((await run(w, http, 'sync', [app])).out, /the proof signs sha256:0+, not this manifest/)
    Fs.writeFileSync(sigFile, JSON.stringify({ ...proof, signature: 'A'.repeat(86) }))
    Assert.match((await run(w, http, 'sync', [app])).out, /the signature does not verify/)
    Fs.writeFileSync(sigFile, JSON.stringify({ ...proof, signature: 'AAAA' }))
    Assert.match((await run(w, http, 'sync', [app])).out, /the proof carries a malformed key or signature/)
    Fs.writeFileSync(sigFile, JSON.stringify(proof) + '\n')

    Fs.writeFileSync(zipFile, Buffer.concat([original, Buffer.from('x')]))
    fresh()
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: archive_digest_mismatch: the archive for corp.example\/service 1.4.2 is sha256:/)
    Fs.rmSync(zipFile)
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: fetch_failed: no archive for corp.example\/service 1.4.2/)
    Fs.writeFileSync(zipFile, original)

    // A manifest that describes other bytes, re-signed by the key the
    // consumer trusts: the archive and the files are still checked.
    const files = (zip: Uint8Array, entries: { path: string, data: Uint8Array }[]) =>
      (m: any) => {
        m.archive.digest = sha256Hex(zip)
        m.archive.size = zip.length
        m.archive.files = entries.map((e) => ({
          path: e.path, digest: sha256Hex(e.data), size: e.data.length,
        }))
      }
    const serve = (entries: { path: string, data: Uint8Array }[],
      edit: (m: any) => void = () => undefined) => {
      const zip = zipCanonical(entries)
      Fs.writeFileSync(zipFile, zip)
      resign(w, 'service', '1.4.2', (m) => {
        m.schema = 'aontu-package/v1'
        m.version = '1.4.2'
        m.deps = {}
        files(zip, entries)(m)
        edit(m)
      })
      fresh()
    }
    const pkgFile = Buffer.from('pkg: {path: "corp.example/service", version: "1.4.2", main: "main.aon"}\n')
    const good = [
      { path: 'main.aon', data: new Uint8Array(Buffer.from(SERVICE)) },
      { path: 'pkg.aon', data: new Uint8Array(pkgFile) },
    ]

    serve([...good, { path: 'run.sh', data: new Uint8Array(Buffer.from('#!/bin/sh\n')) }])
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: archive_entry_forbidden: .* carries run.sh, which the allowlist does not admit/)
    serve([...good, { path: '../x.aon', data: new Uint8Array(1) }], (m) => {
      for (const f of m.archive.files) {
        f.path = '../x.aon' === f.path ? 'x.aon' : f.path
      }
    })
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: archive_path_invalid: .* an entry path element is empty or begins or ends with a dot \(\.\.\/x.aon\)/)
    serve([...good, { path: 'big.aon', data: new Uint8Array(8388609) }])
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: archive_bomb: .* unpacks past the size cap/)
    serve(good, (m) => { m.archive.files[0].digest = 'sha256:' + 'a'.repeat(64) })
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: file_manifest_mismatch: .* holds main.aon, which the manifest does not list as served/)
    serve(good, (m) => { m.archive.files.push({ path: 'zzz.aon', digest: 'sha256:' + 'a'.repeat(64), size: 1 }) })
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: file_manifest_mismatch: .* lacks zzz.aon, which the manifest lists/)
    serve(good, (m) => { m.modules[0].canon = 'aon1-' + 'A'.repeat(43) })
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: module_integrity: corp.example\/service 1.4.2 means aon1-.*, and the manifest pins aon1-A+/)
    serve([good[0], { path: 'pkg.aon', data: new Uint8Array(Buffer.from(
      'pkg: {path: "corp.example/service", version: "1.4.1", main: "main.aon"}\n')) }])
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: manifest_invalid: the package file inside corp.example\/service 1.4.2 disagrees with the manifest/)
    serve([{ path: 'main.aon', data: new Uint8Array(Buffer.from('a: 1\na: 2\n')) }, good[1]])
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: module_integrity: corp.example\/service 1.4.2 means nothing \(it does not evaluate\)/)
    serve(good, (m) => { m.deps = { 'alias:x': { v: '1.0.0' } } })
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: manifest_invalid: .* declares alias:x without the package it names/)
    serve(good, (m) => { m.version = '1.4.9' })
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: response_mismatch: the manifest served names corp.example\/service 1.4.9, not corp.example\/service 1.4.2/)
    serve(good, (m) => { m.schema = 'other' })
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: manifest_invalid: the manifest for corp.example\/service 1.4.2: schema is not aontu-package\/v1/)

    // A zip that is not the canonical form, described honestly.
    const loose = Buffer.from(zipCanonical(good))
    loose.writeUInt16LE(0x0800, 6)
    Fs.writeFileSync(zipFile, loose)
    resign(w, 'service', '1.4.2', (m) => {
      m.schema = 'aontu-package/v1'
      m.version = '1.4.2'
      m.deps = {}
      m.archive.digest = sha256Hex(new Uint8Array(loose))
    })
    fresh()
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: archive_not_canonical: the archive for corp.example\/service 1.4.2: archive is not canonical/)

    const many: { path: string, data: Uint8Array }[] = []
    for (let i = 0; i < 4097; i++) {
      many.push({ path: 0 === i ? 'main.aon' : 'f' + i + '.aon', data: new Uint8Array(1) })
    }
    serve(many)
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: archive_too_many_files: /)
    const huge = new Uint8Array(16777217)
    Fs.writeFileSync(zipFile, huge)
    resign(w, 'service', '1.4.2', (m) => { m.archive.digest = sha256Hex(huge) })
    fresh()
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: archive_too_large: /)
  })


  test('manifest-and-proof-shapes', async () => {
    const base = () => ({
      schema: 'aontu-package/v1', package: 'corp.example/x', version: '1.0.0',
      publish: 'private',
      archive: { format: 'zip', digest: 'sha256:' + 'a'.repeat(64), size: 1,
        files: [{ path: 'main.aon', digest: 'sha256:' + 'b'.repeat(64), size: 1 }] },
      modules: [{ path: 'corp.example/x', main: 'main.aon', canon: 'aon1-' + 'A'.repeat(43) }],
      deps: {}, published: '2026-01-01T00:00:00Z',
    })
    Assert.equal(manifestError(base()), undefined)
    const cases: [(m: any) => void, RegExp][] = [
      [(m) => { m.package = 'nodomain' }, /package is not a package path/],
      [(m) => { m.version = '1.0' }, /version is not MAJOR.MINOR.PATCH/],
      [(m) => { m.publish = 'maybe' }, /publish is not public or private/],
      [(m) => { m.archive.format = 'tar' }, /archive is not a zip/],
      [(m) => { m.archive.files[0].path = '../x' }, /archive.files names a file without/],
      [(m) => { m.modules = [] }, /modules is not the one module/],
      [(m) => { m.deps = [] }, /deps is not a map/],
      [(m) => { m.deps = { 'corp.example/y': { v: 'latest' } } }, /deps.corp.example\/y is not a minimum version/],
      [(m) => { m.deps = { 'corp.example/y': { v: '1.0.0', pkg: 'x' } } }, /deps.corp.example\/y is not a minimum version/],
      [(m) => { delete m.published }, /published is not a timestamp/],
      [(m) => { m.moved = 'x' }, /moved is not a package path/],
      [(m) => { m.retract = ['x'] }, /retract is not a list of versions/],
      [(m) => { delete m.archive.digest }, /archive is not a zip/],
      [(m) => { m.archive.files[0] = 5 }, /archive.files names a file without/],
      [(m) => { delete m.archive.files[0].digest }, /archive.files names a file without/],
      [(m) => { delete m.modules[0].canon }, /modules is not the one module/],
      [(m) => { m.modules[0].main = '../main.aon' }, /modules names an entry the archive does not hold/],
      [(m) => { m.modules[0].main = 'other.aon' }, /modules names an entry the archive does not hold/],
    ]
    for (const [edit, want] of cases) {
      const m = base()
      edit(m)
      Assert.match(manifestError(m) as string, want)
    }
    Assert.equal(manifestError(null), 'schema is not aontu-package/v1')
    Assert.equal(manifestError({ ...base(), deps: { 'corp.example/y': { v: '1.0.0', pkg: 'corp.example/z' } } }),
      undefined)

    Assert.equal(relPathError(''), 'an entry path is empty, absolute or a directory')
    Assert.equal(relPathError('a/'), 'an entry path is empty, absolute or a directory')
    Assert.equal(relPathError('a b.aon'), 'an entry path element is outside the alphabet')
    Assert.equal(relPathError('a/.hidden/b.aon'), 'an entry path element is empty or begins or ends with a dot')
    Assert.equal(relPathError('a/b.aon'), undefined)

    const digest = 'sha256:' + 'c'.repeat(64)
    const proof = signDigest(KEY_PEM, digest)
    Assert.equal(verifyKeyProof(proof, digest, KEY_ID), undefined)
    Assert.match(verifyKeyProof({ ...proof, kind: 'sigstore' }, digest, KEY_ID) as string, /not an aontu-signature/)
    Assert.match(verifyKeyProof(proof, digest, keyIdFromPem(OTHER_PEM)) as string, /^signed by ed25519:/)
    Assert.match(verifyKeyProof({ ...proof, signer: 'ed25519:' + 'A'.repeat(43) }, digest,
      'ed25519:' + 'A'.repeat(43)) as string, /the signer is a key of small order/)
    const keyOf = (hex: string) => 'ed25519:' + Buffer.from(hex, 'hex').toString('base64url')
    for (const hex of ['ec' + 'ff'.repeat(30) + '7f', 'ed' + 'ff'.repeat(30) + '7f',
      'ee' + 'ff'.repeat(30) + 'ff', '01' + '00'.repeat(30) + '80']) {
      Assert.equal(smallOrderKey(Buffer.from(hex, 'hex')), true, hex)
      Assert.match(verifyKeyProof({ ...proof, signer: keyOf(hex) }, digest, keyOf(hex)) as string,
        /the signer is a key of small order/)
    }
    Assert.equal(smallOrderKey(Buffer.from('02' + 'ff'.repeat(30) + '7f', 'hex')), false)
    Assert.equal(smallOrderKey(Buffer.from('ed' + 'ff'.repeat(29) + 'fe7f', 'hex')), false)
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const slack = (text: string) => text.slice(0, -1) + B64[B64.indexOf(text[text.length - 1]) | 1]
    Assert.match(verifyKeyProof({ ...proof, signature: slack(proof.signature) }, digest, KEY_ID) as string,
      /malformed key or signature/)
    Assert.match(verifyKeyProof({ ...proof, signer: slack(KEY_ID) }, digest, slack(KEY_ID)) as string,
      /malformed key or signature/)
    Assert.match(verifyKeyProof({ ...proof, signature: proof.signature.slice(0, 85) + '=' }, digest,
      KEY_ID) as string, /malformed key or signature/)
    Assert.equal(timestamp(new Date('2026-01-02T03:04:05.678Z')), '2026-01-02T03:04:05Z')
    Assert.match(verifyKeyProof({ kind: 'key', encoding: 'aontu-signature/v1', over: digest, signature: 'x' },
      digest, KEY_ID) as string, /not an aontu-signature/)
    Assert.equal(objectPath('latest', 'corp.example/x'), '/pkg/corp.example/x/@latest')

    const token = (claims: any) => 'h.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.s'
    Assert.equal(publisherFromToken(token({})), undefined)
    Assert.equal(publisherFromToken(token({
      iss: 'https://token.actions.githubusercontent.com', repository: 'a/b', repository_owner_id: 1,
      repository_id: 2, event_name: 'push', runner_environment: 'self-hosted',
    })).runner, 'self_hosted')
    Assert.equal(servedUrl('::1', 5), 'http://[::1]:5')
    Assert.equal(servedUrl('127.0.0.1', 5), 'http://127.0.0.1:5')
    const waited = serveUntilInterrupted()
    process.emit('SIGINT')
    await waited
  })


  test('bounds-configurations-and-odd-objects', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    { const r = await publish(w, publisher(w, 'common', '1.0.0', 'x: 1\n')); Assert.equal(r.code, 0, r.out + r.err) }
    const svc = await publisherWith(w, 'service', '1.0.0', '@"corp.example/common"\nname: string\n',
      '"corp.example/common": {v: "1.0.0"}')
    { const r = await publish(w, svc); Assert.equal(r.code, 0, r.out + r.err) }
    const clean = () => Fs.rmSync(Path.join(w.cache, 'aontu'), { recursive: true, force: true })

    // The closure bounds, lowered to what a test can reach.
    LIMITS.closure = 1
    const tooMany = await run(w, http, 'sync', [consumer(w, '"corp.example/service": {v: "1.0.0"}')])
    Assert.match(tooMany.out, /refused: closure_too_large: the closure exceeds 1 packages/)
    LIMITS.closure = 1024
    LIMITS.depth = 1
    clean()
    const tooDeep = await run(w, http, 'sync', [consumer(w, '"corp.example/service": {v: "1.0.0"}')])
    Assert.match(tooDeep.out, /refused: module_depth: the closure under corp.example\/common nests past 1/)
    LIMITS.depth = 16
    clean()

    // No package file at all; a write path named in the package file.
    const none = await run(w, http, 'pkg', ['outdated', tmp('bare')])
    Assert.equal(none.code, 0, none.out)
    const writer = publisher(w, 'writer', '1.0.0', 'x: 1\n',
      'publish: public\nrepo: {write: "https://publish.corp.example"}\n')
    const dry = await run(w, http, 'publish', ['--key', w.key, writer])
    Assert.match(dry.out, /write: https:\/\/publish.corp.example/)

    // An advisory with nothing in it, and a tombstone that names no reason.
    write(Path.join(w.repo, 'advisory', 'corp.example'), { 'common.aon': '{}\n' })
    const noAdvisory = await run(w, http, 'get', ['corp.example/common@1.0.0', consumer(w, '')])
    Assert.equal(noAdvisory.code, 0, noAdvisory.out)
    write(Path.join(w.repo, 'tombstone', 'corp.example', 'common', '@v'), { '9.9.9.aon': '{}\n' })
    const tomb = await run(w, http, 'get', ['corp.example/common@9.9.9', consumer(w, '')])
    Assert.match(tomb.out, /refused: tombstoned: corp.example\/common 9.9.9 was withdrawn by the repository\n/)

    // A dependency's own alias pins the package it names.
    const aliased = await publisherWith(w, 'aliased', '1.0.0', 'c: @"alias:old"\n',
      '"alias:old": {pkg: "corp.example/common", v: "1.0.0"}')
    { const r = await publish(w, aliased); Assert.equal(r.code, 0, r.out + r.err) }
    clean()
    const viaAlias = await run(w, http, 'sync', [consumer(w, '"corp.example/aliased": {v: "1.0.0"}')])
    Assert.equal(viaAlias.code, 0, viaAlias.out)

    // A manifest whose entry the archive does not hold.
    resign(w, 'common', '1.0.0', (m) => { m.modules[0].main = 'nope.aon' })
    clean()
    const noMain = await run(w, http, 'sync', [consumer(w, '"corp.example/common": {v: "1.0.0"}')])
    Assert.equal(noMain.code, 1, noMain.out)
    Assert.match(noMain.out, /refused: /)
    resign(w, 'common', '1.0.0', (m) => { m.modules[0].main = 'main.aon' })

    // --frozen fetches what a complete lock names.
    const frozenApp = consumer(w, '"corp.example/common": {v: "1.0.0"}')
    { const r = await run(w, http, 'sync', [frozenApp]); Assert.equal(r.code, 0, r.out + r.err) }
    Fs.rmSync(Path.join(frozenApp, 'aontu_meta', 'vendor'), { recursive: true, force: true })
    clean()
    const frozen = await run(w, http, 'sync', ['--frozen', frozenApp])
    Assert.equal(frozen.code, 0, frozen.out)
    Assert.match(frozen.out, /fetched: corp.example\/common 1.0.0/)
    Fs.writeFileSync(Path.join(frozenApp, 'pkg.aon'),
      Fs.readFileSync(Path.join(frozenApp, 'pkg.aon'), 'utf8').replace('1.0.0', '1.1.0'))
    Fs.rmSync(Path.join(frozenApp, 'aontu_meta', 'vendor'), { recursive: true, force: true })
    const moved = await run(w, http, 'sync', ['--frozen', frozenApp])
    Assert.equal(moved.code, 1, moved.out)
    Assert.match(moved.out, /lockfile would change: corp.example\/common: 1.0.0 -> 1.1.0/)

    // A publish whose options carry no cache, as a confined caller's do.
    const noCache = { eval: pkgToolOptions({ kind: 'system', textExt: [] }, w.dir).eval }
    const direct = await pkgPublish(publisher(w, 'direct', '1.0.0', 'x: 1\n', 'publish: public\n'),
      noCache, http, { yes: true, key: w.key, to: w.repo })
    Assert.equal(direct.verdict, 'sent', JSON.stringify(direct))

    // A configuration the client refuses before it asks; why with no
    // package path and no lock.
    const badBase = consumer(w, '"corp.example/common": {v: "1.0.0"}', 'repo: {base: ["ftp://pkg.example"]}\n')
    const cfg = await run(w, http, 'get', ['corp.example/common@1.0.0', badBase])
    Assert.equal(cfg.code, 1, cfg.out)
    Assert.match(cfg.out, /refused: (base_not_https|config_invalid)/)
    const rootless = write(tmp('rootless'), { 'pkg.aon': 'dep: {"corp.example/common": {v: "1.0.0"}}\n' })
    const why = await run(w, http, 'why', ['corp.example/common', rootless])
    Assert.equal(why.out.trimEnd(), 'verdict: ok\n. -> corp.example/common')

    // outdated names a dependency the lock has never held.
    { const r = await publish(w, publisher(w, 'extra', '1.0.0', 'e?: integer\n')); Assert.equal(r.code, 0, r.out + r.err) }
    const app = consumer(w, '"corp.example/service": {v: "1.0.0"}')
    { const r = await run(w, http, 'sync', [app]); Assert.equal(r.code, 0, r.out + r.err) }
    const svc2 = await publisherWith(w, 'service', '1.1.0',
      '@"corp.example/common"\n@"corp.example/extra"\nname: string\n',
      '"corp.example/common": {v: "1.0.0"}, "corp.example/extra": {v: "1.0.0"}')
    { const r = await publish(w, svc2); Assert.equal(r.code, 0, r.out + r.err) }
    backdate(w, 'service')
    backdate(w, 'extra')
    const outdated = await run(w, http, 'pkg', ['outdated', app])
    Assert.match(outdated.out, /corp.example\/extra unlocked -> 1.0.0/)

    // serve on its default address.
    let seen: Served | undefined
    const dflt = await run(w, http, 'pkg', ['serve', w.repo], async (s) => { seen = s })
    Assert.equal(dflt.code, 0, dflt.err)
    Assert.match(dflt.out, /^serving .* at http:\/\/127.0.0.1:8017\n$/)
    Assert.ok(undefined !== seen)
  })


  test('editing-the-package-file', () => {
    const w = world()
    const options = pkgToolOptions({ kind: 'system', textExt: [] }, w.dir)
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')

    Assert.match(editDeps(app, { op: 'raise', key: 'corp.example/none', v: '1.0.0' }, options) as string,
      /is not on one line of pkg.aon; edit it by hand/)
    Fs.writeFileSync(Path.join(app, 'pkg.aon'),
      'dep: {\n  "corp.example/service": {\n    v: "1.4.2"\n  }\n}\n')
    Assert.match(editDeps(app, { op: 'raise', key: 'corp.example/service', v: '1.4.3' }, options) as string,
      /spans several lines of pkg.aon; edit it by hand/)
    Assert.match(editDeps(app, { op: 'remove', key: 'corp.example/service' }, options) as string,
      /spans several lines of pkg.aon; edit it by hand/)
    Assert.match(Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8'), /v: "1.4.2"/)
    Fs.writeFileSync(Path.join(app, 'pkg.aon'),
      'dep: {\n  "corp.example/service": {}\n}\n')
    Assert.match(editDeps(app, { op: 'raise', key: 'corp.example/service', v: '1.4.3' }, options) as string,
      /declares its version on another line of pkg.aon; edit it by hand/)
    // An entry named in a comment is not an entry: the edit is undone.
    Fs.writeFileSync(Path.join(app, 'pkg.aon'),
      '# "corp.example/service" was here\ndep: {"corp.example/service": {v: "1.4.2"}}\n')
    Assert.match(editDeps(app, { op: 'remove', key: 'corp.example/service' }, options) as string,
      /the edit to pkg.aon did not take; edit it by hand/)
    Assert.match(Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8'), /^# "corp.example\/service" was here/)

    Fs.writeFileSync(Path.join(app, 'pkg.aon'), 'dep: {')
    Assert.match(editDeps(app, { op: 'add', key: 'corp.example/service', v: '1.4.2' }, options) as string,
      /did not take/)
    Fs.writeFileSync(Path.join(app, 'pkg.aon'), 'dep: {}')
    Assert.equal(editDeps(app, { op: 'add', key: 'corp.example/service', v: '1.4.2' }, options), undefined)
    Assert.equal(Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8'),
      'dep: {}\ndep: "corp.example/service": { v: "1.4.2" }\n')
    Assert.equal(editDeps(app, { op: 'raise', key: 'corp.example/service', v: '1.4.3' }, options), undefined)
    Assert.equal(editDeps(app, { op: 'remove', key: 'corp.example/service' }, options), undefined)
    Assert.equal(Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8'), 'dep: {}\n')
    Fs.rmSync(Path.join(app, 'pkg.aon'))
    Assert.equal(editDeps(app, { op: 'add', key: 'corp.example/service', v: '1.4.2' }, options), undefined)

    Assert.deepEqual(parsePkgSpec('corp.example/x'), { pkg: 'corp.example/x' })
    Assert.deepEqual(parsePkgSpec('corp.example/x@1.2.3'), { pkg: 'corp.example/x', version: '1.2.3' })
    Assert.match(parsePkgSpec('x@1.2.3') as string, /not a package path/)
    Assert.match(parsePkgSpec('corp.example/x@latest') as string, /not a version: latest/)
  })


  test('a-change-a-sync-cannot-carry-is-taken-back', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    await publish(w, publisher(w, 'service', '1.4.3', SERVICE))
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    Assert.equal((await run(w, http, 'sync', [app])).code, 0)
    const before = Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8')
    Fs.rmSync(Path.join(at(w, 'service'), '1.4.3.sig'))
    const r = await run(w, http, 'get', ['corp.example/service@1.4.3', app])
    Assert.equal(r.code, 1)
    Assert.match(r.out, /change: none \(raised corp.example\/service 1.4.2 -> 1.4.3 was taken back\)/)
    Assert.equal(Fs.readFileSync(Path.join(app, 'pkg.aon'), 'utf8'), before)

    // An entry the verbs cannot edit is left to the author.
    Fs.writeFileSync(Path.join(app, 'pkg.aon'),
      'dep: {\n  "corp.example/service": {\n    v: "1.4.2"\n  }\n}\n' + REPO_BLOCK)
    const spans = await run(w, http, 'get', ['corp.example/service@1.4.3', app])
    Assert.equal(spans.code, 2)
    Assert.match(spans.err, /spans several lines of pkg.aon; edit it by hand/)
    const spansRemove = await run(w, http, 'remove', ['corp.example/service', app])
    Assert.equal(spansRemove.code, 2)
    Assert.match(spansRemove.err, /spans several lines of pkg.aon/)
    Fs.writeFileSync(Path.join(app, 'pkg.aon'), 'dep: {\n')
    const broken = await run(w, http, 'add', ['corp.example/service@1.4.2', app])
    Assert.equal(broken.code, 2)
    Assert.match(broken.err, /did not take/)

    // A transport that fails outright is not a refusal.
    const boom: PkgHttp = {
      get: async () => { throw new Error('boom') },
      post: async () => { throw new Error('boom') },
    }
    const options = pkgToolOptions({ kind: 'system', textExt: [] }, w.dir)
    Fs.rmSync(Path.join(w.cache, 'aontu'), { recursive: true, force: true })
    await Assert.rejects(pkgSync(consumer(w, '"corp.example/service": {v: "1.4.2"}'),
      { ...options, cache: Path.join(w.cache, 'aontu', 'pkg') }, boom, {}), /boom/)

    // A dependency key that is not a package path, and an alias that
    // names no package, are missing rather than fetched.
    const odd = consumer(w, '"corp.example/service": {v: "1.4.2"}, "not a path": {v: "1.0.0"}, "alias:x": {v: "1.0.0"}')
    const m = await run(w, http, 'sync', [odd])
    Assert.equal(m.code, 1)
    Assert.match(m.out, /^verdict: missing\n/)
    Assert.match(m.out, /alias:x: not fetched/)
    Assert.match(m.out, /not a path: not fetched/)

    // The lock and the vendor tree are taken back with the package
    // file: a raise that fetched a version the sync then could not
    // carry leaves the previous version vendored, and no tmp behind.
    resign(w, 'service', '1.4.3', () => undefined)
    const kept = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    Assert.equal((await run(w, http, 'sync', [kept])).code, 0)
    Fs.appendFileSync(Path.join(kept, 'pkg.aon'), 'dep: {"bad key!": {v: "1.0.0"}}\n')
    const lockBefore = lockOf(kept)
    const vendored = Path.join(kept, 'aontu_meta', 'vendor', 'corp.example', 'service', 'pkg.aon')
    const back = await run(w, http, 'get', ['corp.example/service@1.4.3', kept])
    Assert.equal(back.code, 1, back.out)
    Assert.match(back.out, /was taken back/)
    Assert.equal(lockOf(kept), lockBefore)
    Assert.match(Fs.readFileSync(vendored, 'utf8'), /version: "1.4.2"/)
    Assert.ok(!Fs.existsSync(Path.join(kept, 'aontu_meta', 'tmp')))
    // With no lock and no vendor tree before, none is left behind.
    const none = consumer(w, '"bad key!": {v: "1.0.0"}')
    const added = await run(w, http, 'add', ['corp.example/service@1.4.2', none])
    Assert.equal(added.code, 1, added.out)
    Assert.match(added.out, /was taken back/)
    Assert.ok(!Fs.existsSync(Path.join(none, 'aontu_meta', 'pkg-lock.aon')))
    Assert.ok(!Fs.existsSync(Path.join(none, 'aontu_meta', 'vendor')))

    // A vendored module that does not evaluate is an error, not a fetch.
    const bad = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    write(Path.join(bad, 'aontu_meta', 'vendor', 'corp.example', 'service'), {
      'pkg.aon': 'pkg: {path: "corp.example/service", version: "1.4.2", main: "main.aon"}\n',
      'main.aon': 'a: 1\na: 2\n',
    })
    const e = await run(w, http, 'sync', [bad])
    Assert.equal(e.code, 4)
    Assert.match(e.out, /^verdict: error\ncorp.example\/service: does not evaluate on its own/)
  })


  test('publish-gates-and-refusals', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    Assert.equal((await publish(w, publisher(w, 'service', '1.4.2', SERVICE))).code, 0)

    const breaking = await publish(w, publisher(w, 'service', '1.5.0', SERVICE + 'owner: string\n'))
    Assert.equal(breaking.code, 1)
    Assert.match(breaking.out, /^verdict: breaking\n/)
    Assert.match(breaking.out, /against: corp.example\/service 1.4.2/)
    Assert.match(breaking.out, /\$.owner: the general value requires this key/)
    Assert.ok(!Fs.existsSync(Path.join(at(w, 'service'), '1.5.0.manifest')))

    const compat = await publish(w, publisher(w, 'service', '1.5.0', SERVICE + 'owner?: string\n'))
    Assert.equal(compat.code, 0, compat.out)

    const again = await publish(w, publisher(w, 'service', '1.5.0', SERVICE))
    Assert.match(again.out, /refused: version_exists: corp.example\/service 1.5.0 was published before/)

    const explicit = await publish(w, publisher(w, 'service', '1.6.0', SERVICE),
      ['--against', Path.join(w.dir, 'service-1.4.2')])
    Assert.equal(explicit.code, 0, explicit.out)
    Assert.match(explicit.out, /against: .*service-1.4.2\n/)

    const nothing = await publish(w, Path.join(w.dir, 'empty'))
    Assert.equal(nothing.code, 4)
    Assert.match(nothing.out, /^verdict: error\n/)

    // Private stays home: the write path is not loopback and the
    // package does not declare public.
    const priv = publisher(w, 'service', '1.7.0', SERVICE)
    const home = await run(w, http, 'publish', ['--yes', '--key', w.key, priv])
    Assert.equal(home.code, 1)
    Assert.match(home.out, /write: https:\/\/publish.aontu.dev\/v1\/publish/)
    Assert.match(home.out, /refused: not_public: corp.example\/service does not declare publish: public/)

    // The write path, answered by a fake: accepted, refused with a
    // code, refused without one.
    const pub = publisher(w, 'service', '1.7.0', SERVICE, 'publish: public\n')
    const token = Path.join(w.dir, 'token')
    const claims = Buffer.from(JSON.stringify({
      iss: 'https://token.actions.githubusercontent.com', repository: 'corp/service',
      repository_owner_id: 1, repository_id: 2, event_name: 'release',
      runner_environment: 'github-hosted', workflow_ref: 'corp/service/.github/workflows/publish.yml@refs/tags/v1',
    })).toString('base64url')
    Fs.writeFileSync(token, 'eyJhbGciOiJSUzI1NiJ9.' + claims + '.sig\n')
    let posted: any
    const answer = (status: number, body: string): PkgHttp => ({
      get: http.get,
      post: async (url, parts, tok) => {
        posted = { url, parts, tok }
        return { status, body: new Uint8Array(Buffer.from(body)) }
      },
    })
    const sent = await run(w, answer(201, ''), 'publish',
      ['--yes', '--key', w.key, '--token', token, '--write', 'https://write.example', pub])
    Assert.equal(sent.code, 0, sent.out)
    Assert.match(sent.out, /^verdict: sent\n/)
    Assert.equal(posted.url, 'https://write.example/v1/publish')
    Assert.equal(posted.tok, 'eyJhbGciOiJSUzI1NiJ9.' + claims + '.sig')
    const manifest = JSON.parse(Buffer.from(posted.parts.manifest).toString('utf8'))
    Assert.equal(manifest.publisher.host, 'github.com')
    Assert.equal(manifest.publisher.trigger, 'release')
    Assert.equal(manifest.publisher.subject.owner_id, '1')
    Assert.equal(manifest.publish, 'public')

    const coded = await run(w, answer(403, '{"code":"namespace_mismatch","message":"not yours"}'),
      'publish', ['--yes', '--key', w.key, '--write', 'https://write.example', pub])
    Assert.match(coded.out, /refused: namespace_mismatch: not yours/)
    const bare = await run(w, answer(500, 'oops'),
      'publish', ['--yes', '--key', w.key, '--write', 'https://write.example', pub])
    Assert.match(bare.out, /refused: fetch_failed: the write path answered 500/)

    // Usage.
    const noKey = await run(w, http, 'publish', ['--yes', pub])
    Assert.equal(noKey.code, 2)
    Assert.match(noKey.err, /publish --yes needs --key/)
    const noFile = await run(w, http, 'publish', ['--key', Path.join(w.dir, 'nokey'), pub])
    Assert.equal(noFile.code, 2)
    Assert.match(noFile.err, /cannot read /)
    const badBase = await run(w, http, 'publish', ['--write', 'ftp://x', pub])
    Assert.match(badBase.out, /refused: base_not_https: repository base is not https: ftp:\/\/x/)

    // The platform's own transport, posting to a loopback write path
    // and to a port nothing answers.
    const received: any[] = []
    const sink = createServer((req, res) => {
      let n = 0
      req.on('data', (c) => { n += c.length })
      req.on('end', () => {
        received.push({ auth: req.headers.authorization, type: req.headers['content-type'], n })
        res.writeHead(201)
        res.end()
      })
    })
    await new Promise<void>((r) => sink.listen(0, '127.0.0.1', () => r()))
    const port = (sink.address() as any).port
    Fs.writeFileSync(token, 'tok')
    const real = await run(w, defaultHttp(), 'publish',
      ['--yes', '--key', w.key, '--token', token, '--write', 'http://127.0.0.1:' + port, priv])
    Assert.equal(real.code, 0, real.out)
    Assert.equal(received[0].auth, 'Bearer tok')
    Assert.match(received[0].type, /^multipart\/form-data; boundary=/)
    Assert.ok(1000 < received[0].n)
    await new Promise<void>((r) => sink.close(() => r()))
    const dead = await run(w, defaultHttp(), 'publish',
      ['--yes', '--key', w.key, '--write', 'http://127.0.0.1:1', priv])
    Assert.match(dead.out, /refused: fetch_failed: the write path answered 0/)
    const options = pkgToolOptions({ kind: 'system', textExt: [] }, w.dir)
    const boom: PkgHttp = {
      get: async () => { throw new Error('boom') },
      post: async () => { throw new Error('boom') },
    }
    await Assert.rejects(pkgPublish(priv, options, boom, { yes: true, key: w.key, write: 'https://x.example' }), /boom/)
    await Assert.rejects(pkgOutdated(consumer(w, '"corp.example/service": {v: "1.4.2"}'),
      { ...options, cache: Path.join(w.cache, 'aontu', 'pkg') }, boom, {}).then(async () => {
      const app2 = consumer(w, '"corp.example/service": {v: "1.4.2"}')
      Assert.equal((await run(w, http, 'sync', [app2])).code, 0)
      await pkgOutdated(app2, { ...options, cache: Path.join(w.cache, 'aontu', 'pkg') }, boom, {})
    }), /boom/)

    // The publisher block from either forge, or none.
    Assert.equal(publisherFromToken('nope'), undefined)
    Assert.equal(publisherFromToken('a.!!.c'), undefined)
    Assert.equal(publisherFromToken('a.' + Buffer.from('{"iss":"https://other"}').toString('base64url') + '.c'),
      undefined)
    const gl = publisherFromToken('a.' + Buffer.from(JSON.stringify({
      iss: 'https://gitlab.com', project_path: 'corp/svc', namespace_id: 3, project_id: 4,
      runner_environment: 'self-hosted', ci_config_ref_uri: 'gitlab.com/corp/svc//.gitlab-ci.yml@refs/heads/main',
    })).toString('base64url') + '.c')
    Assert.equal(gl.host, 'gitlab.com')
    Assert.equal(gl.runner, 'self_hosted')
    Assert.equal(gl.workflow, 'gitlab.com/corp/svc//.gitlab-ci.yml@refs/heads/main')
    const bareGl = publisherFromToken('a.' + Buffer.from(JSON.stringify({
      iss: 'https://gitlab.com', project_path: 'corp/svc', namespace_id: 3, project_id: 4,
    })).toString('base64url') + '.c')
    Assert.equal(bareGl.workflow, undefined)
    const bareGh = publisherFromToken('a.' + Buffer.from(JSON.stringify({
      iss: 'https://token.actions.githubusercontent.com', repository: 'corp/svc',
      repository_owner_id: 1, repository_id: 2, event_name: 'push',
    })).toString('base64url') + '.c')
    Assert.equal(bareGh.trigger, 'push')
    Assert.equal(bareGh.workflow, undefined)
    // A token that is not a token adds no publisher block.
    Fs.writeFileSync(token, 'nope')
    const untok = await run(w, answer(200, ''), 'publish',
      ['--yes', '--key', w.key, '--token', token, '--write', 'https://write.example', pub])
    Assert.equal(untok.code, 0)
    Assert.equal(JSON.parse(Buffer.from(posted.parts.manifest).toString('utf8')).publisher, undefined)
  })


  test('publish-reads-the-predecessor-it-can-reach', async () => {
    const w = world()
    // A repository whose newest manifest was tampered: the gate refuses
    // to read a predecessor that fails its own checks.
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    resign(w, 'service', '1.4.2', (m) => { m.archive.digest = 'sha256:' + 'f'.repeat(64) })
    const r = await publish(w, publisher(w, 'service', '1.4.3', SERVICE))
    Assert.equal(r.code, 1)
    Assert.match(r.out, /refused: archive_digest_mismatch: /)

    // An undecided gate reports as such.
    const w2 = world()
    await publish(w2, publisher(w2, 'service', '1.0.0', 'a: min(1)\n'))
    const u = await publish(w2, publisher(w2, 'service', '1.1.0', 'a: must(min(1), "m")\n'))
    Assert.equal(u.code, 3, u.out)
    Assert.match(u.out, /^verdict: undecided\n/)
  })


  test('the-local-registry-serves-and-proxies', async () => {
    const w = world()
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    const origin = await startServe({ dir: w.repo, upstream: [], listen: '127.0.0.1:0', http: defaultHttp() })
    const cacheDir = Path.join(w.dir, 'proxy')
    Fs.mkdirSync(cacheDir)
    const proxy = await startServe({ dir: cacheDir, upstream: [origin.url], listen: '127.0.0.1:0', http: defaultHttp() })
    after(async () => {
      await proxy.close()
      await origin.close()
    })

    const http = defaultHttp()
    const list = await http.get(origin.url + objectPath('list', 'corp.example/service'))
    Assert.equal(list.status, 200)
    Assert.equal(JSON.parse(Buffer.from(list.body).toString('utf8')).package, 'corp.example/service')
    Assert.equal((await http.get(origin.url + '/pkg/corp.example/service/@v/9.9.9.zip')).status, 404)
    Assert.equal((await http.get(origin.url + '/etc/passwd')).status, 404)
    Assert.equal((await http.get(origin.url + '/pkg/../x/@v/list')).status, 404)
    const r = await fetch(origin.url + objectPath('archive', 'corp.example/service', '1.4.2'))
    Assert.equal(r.headers.get('content-type'), 'application/zip')
    Assert.equal(r.headers.get('cache-control'), 'max-age=31536000, immutable')
    const head = await fetch(origin.url + objectPath('list', 'corp.example/service'), { method: 'HEAD' })
    Assert.equal(head.status, 200)
    Assert.equal(head.headers.get('cache-control'), 'max-age=60')
    Assert.equal((await fetch(origin.url + '/', { method: 'POST' })).status, 405)
    const sig = await fetch(origin.url + objectPath('signature', 'corp.example/service', '1.4.2'))
    Assert.equal(sig.headers.get('content-type'), 'text/plain; charset=utf-8')
    write(Path.join(w.repo, 'pkg', 'corp.example', 'service', '@v'), { '1.4.2.sigstore.json': '{}\n' })
    const bundle = await fetch(origin.url + '/pkg/corp.example/service/@v/1.4.2.sigstore.json')
    Assert.equal(bundle.headers.get('content-type'), 'application/json')

    // Through the proxy: fetched on a miss and kept; a mutable object
    // is refreshed from upstream; with the upstream gone, the copy is
    // served and says so.
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}',
      'repo: {base: ["' + proxy.url + '"], trust: {"corp.example/*": {signer: "' + KEY_ID + '", inclusion: none}}}\n')
    const sync = await run(w, http, 'sync', [app])
    Assert.equal(sync.code, 0, sync.out)
    Assert.ok(Fs.existsSync(Path.join(cacheDir, 'pkg', 'corp.example', 'service', '@v', '1.4.2.zip')))
    Assert.ok(Fs.existsSync(Path.join(cacheDir, 'pkg', 'corp.example', 'service', '@v', 'list')))
    const missing = await http.get(proxy.url + objectPath('list', 'corp.example/other'))
    Assert.equal(missing.status, 404)
    await origin.close()
    const stale = await fetch(proxy.url + objectPath('list', 'corp.example/service'))
    Assert.equal(stale.status, 200)
    Assert.match(stale.headers.get('x-aontu-stale') as string, /no upstream answered/)
    const served = await serveObject({ dir: cacheDir, upstream: ['http://127.0.0.1:1'], listen: '', http },
      objectPath('list', 'corp.example/service')).catch((e) => e)
    Assert.ok(served instanceof Error || 200 === served.status)

    Assert.equal(objectShape('/pkg/corp.example/x/@v/list'), true)
    Assert.equal(objectShape('/pkg/corp.example/x/@v/1.0.0.sigstore.json'), true)
    Assert.equal(objectShape('/tombstone/feed.aon'), true)
    Assert.equal(objectShape('/pkg/corp.example//x/@v/list'), false)
    Assert.equal(objectShape('/pkg/corp.example/x/@v/1.0.zip'), false)
    Assert.deepEqual(splitListen('127.0.0.1:8017'), ['127.0.0.1', 8017])
    Assert.deepEqual(splitListen('localhost'), ['localhost', 8017])
    Assert.deepEqual(splitListen('localhost:x'), ['localhost', 8017])
    Assert.deepEqual(splitListen('[::1]:8018'), ['::1', 8018])
    Assert.deepEqual(splitListen('[::1]'), ['::1', 8017])
    Assert.deepEqual(splitListen('[::1]:x'), ['::1', 8017])
    const v6 = await startServe({ dir: w.repo, upstream: [], listen: '[::1]:0', http }).catch(() => undefined)
    if (undefined !== v6) {
      Assert.match(v6.url, /^http:\/\/\[::1\]:\d+$/)
      await v6.close()
    }

    // The verb itself, told when to stop.
    let seen: Served | undefined
    const cli = await run(w, http, 'pkg', ['serve', '--listen', '127.0.0.1:0', '--upstream', origin.url, w.repo],
      async (s) => { seen = s })
    Assert.equal(cli.code, 0, cli.err)
    Assert.match(cli.out, /^serving .* at http:\/\/127.0.0.1:\d+\nupstream: http:\/\/127.0.0.1:\d+\n$/)
    Assert.ok(undefined !== seen)
  })


  test('the-verbs-take-their-arguments', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    const app = consumer(w, '')
    for (const verb of ['sync', 'add', 'get', 'remove', 'why', 'publish']) {
      Assert.equal((await run(w, http, verb, ['--help'])).code, 0)
      Assert.equal((await run(w, http, verb, ['--bogus'])).code, 2)
      Assert.equal((await run(w, http, verb, ['--trust', 'bogus'])).code, 2)
    }
    const many = await run(w, http, 'sync', [app, 'extra'])
    Assert.equal(many.code, 2)
    Assert.match(many.err, /sync takes a directory\naontu sync/)
    const none = await run(w, http, 'add', [])
    Assert.equal(none.code, 2)
    Assert.match(none.err, /add needs a package\naontu add/)
    const bad = await run(w, http, 'get', ['nodomain', app])
    Assert.equal(bad.code, 2)
    Assert.match(bad.err, /not a package path: nodomain/)

    const confined = await run(w, http, 'sync', ['--trust', 'root', app])
    Assert.equal(confined.code, 2)
    Assert.match(confined.err, /reads and writes the user cache/)
    const confinedOutdated = await run(w, http, 'pkg', ['outdated', '--trust', 'root', app])
    Assert.equal(confinedOutdated.code, 2)

    // A dependency the repository has no list for, under outdated, is
    // a refusal with the list's own words.
    write(app, { 'aontu_meta/pkg-lock.aon': '{"lock":{"corp.example/none":{"archive":"","canon":"","v":"1.0.0"},"bad key":{"archive":"","canon":"","v":"1.0.0"}}}\n' })
    const od = await run(w, http, 'pkg', ['outdated', app])
    Assert.equal(od.code, 1)
    Assert.match(od.out, /refused: fetch_failed: no version list for corp.example\/none/)
    const odBase = await run(w, http, 'pkg', ['outdated', '--base', 'ftp://x', app])
    Assert.match(odBase.out, /refused: base_not_https/)

    // The main dispatch reaches the verbs.
    const so = process.stdout.write
    let out = ''
    ;(process.stdout as any).write = (s: any) => ((out += s), true)
    try {
      cliMain(['node', 'cli', 'why', 'corp.example/x', app], servers(http))
      await new Promise((r) => setTimeout(r, 50))
    }
    finally {
      process.stdout.write = so
      process.exitCode = 0
    }
    Assert.match(out, /^verdict: missing/)
  })


  test('keygen-writes-a-key-once', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    const file = Path.join(w.dir, 'keys', 'new.pem')
    const made = await run(w, http, 'pkg', ['keygen', file])
    Assert.equal(made.code, 0, made.err)
    Assert.match(made.out, /^signer: ed25519:[A-Za-z0-9_-]{43}\n$/)
    Assert.match(Fs.readFileSync(file, 'utf8'), /^-----BEGIN PRIVATE KEY-----/)
    Assert.equal(keyIdFromPem(Fs.readFileSync(file, 'utf8')), made.out.slice('signer: '.length).trim())
    const again = await run(w, http, 'pkg', ['keygen', file])
    Assert.equal(again.code, 2)
    Assert.match(again.err, /exists; a key is written once/)
    const none = await run(w, http, 'pkg', ['keygen'])
    Assert.equal(none.code, 2)
    Assert.match(none.err, /pkg keygen needs the file to write/)
    // A key minted here signs a publish a consumer then trusts.
    const tree = publisher(w, 'service', '1.0.0', SERVICE)
    const sent = await run(w, http, 'publish', ['--yes', '--key', file, '--to', w.repo, tree])
    Assert.equal(sent.code, 0, sent.out)
  })


  test('the-layout-writer-and-the-directory-reader', async () => {
    const w = world()
    const options = pkgToolOptions({ kind: 'system', textExt: [] }, w.dir)
    const http = dirHttp(w.repo)
    Assert.equal((await http.post('http://x/y', { manifest: new Uint8Array(), proof: new Uint8Array(), archive: new Uint8Array() }, '')).status, 405)
    Assert.equal((await http.get('http://x/pkg/../etc')).status, 404)
    Fs.mkdirSync(Path.join(w.repo, 'adir'))
    Assert.equal((await http.get('http://x/adir')).status, 404)

    const manifest = {
      schema: 'aontu-package/v1', package: 'corp.example/Svc', version: '1.0.0', publish: 'private',
      archive: { format: 'zip', digest: 'sha256:' + 'a'.repeat(64), size: 1, files: [] },
      modules: [], deps: {}, published: '2026-01-01T00:00:00Z',
    }
    const bytes = new Uint8Array(Buffer.from(JSON.stringify(manifest)))
    writeLayout(w.repo, { manifest, manifestBytes: bytes, proofBytes: new Uint8Array(1), archive: new Uint8Array(1) },
      options, new Date('2026-01-01T00:00:00Z'))
    Assert.ok(Fs.existsSync(Path.join(w.repo, 'pkg', 'corp.example', '!svc', '@v', '1.0.0.zip')))
    Assert.throws(() => writeLayout(w.repo, { manifest, manifestBytes: bytes, proofBytes: new Uint8Array(1), archive: new Uint8Array(1) },
      options, new Date()), (e: any) => e instanceof PkgRefusal && 'version_exists' === e.code)
    for (const odd of [{ ...manifest, package: '../../escape' }, { ...manifest, version: '../x' }]) {
      Assert.throws(() => writeLayout(w.repo, { manifest: odd, manifestBytes: bytes, proofBytes: new Uint8Array(1), archive: new Uint8Array(1) },
        options, new Date()), (e: any) => e instanceof PkgRefusal && 'manifest_invalid' === e.code)
    }
    Assert.equal(COOLDOWN_HOURS, 72)

    // `why` reads the store beside the vendor tree.
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    write(app, { 'aontu_meta/pkg-lock.aon': '{"lock":{"corp.example/service":{"archive":"","canon":"","v":"1.4.2"},"bad key":{"archive":"","canon":"","v":"1.0.0"}}}\n' })
    const why = pkgWhy(app, options, 'corp.example/service')
    Assert.deepEqual(why.paths, [['corp.example/app', 'corp.example/service']])
    // A cycle in the store ends the walk rather than the process.
    write(Path.join(app, 'aontu_meta', 'vendor', 'corp.example', 'service'),
      { 'pkg.aon': 'pkg: {path: "corp.example/service"}\ndep: {"corp.example/common": {v: "1.0.0"}}\n' })
    write(Path.join(app, 'aontu_meta', 'vendor', 'corp.example', 'common'),
      { 'pkg.aon': 'pkg: {path: "corp.example/common"}\ndep: {"corp.example/service": {v: "1.0.0"}}\n' })
    write(app, { 'aontu_meta/pkg-lock.aon': '{"lock":{"corp.example/service":{"archive":"","canon":"","v":"1.4.2"},"corp.example/common":{"archive":"","canon":"","v":"1.0.0"}}}\n' })
    Assert.deepEqual(pkgWhy(app, options, 'corp.example/nowhere').paths, [])
    Assert.deepEqual(pkgWhy(app, options, 'corp.example/common').paths,
      [['corp.example/app', 'corp.example/service', 'corp.example/common']])

    const moved = { ...manifest, version: '1.1.0', moved: 'corp.example/elsewhere' }
    const movedBytes = new Uint8Array(Buffer.from(JSON.stringify(moved)))
    writeLayout(w.repo, { manifest: moved, manifestBytes: movedBytes, proofBytes: new Uint8Array(1), archive: new Uint8Array(1) },
      options, new Date())
    Assert.throws(() => writeLayout(w.repo, { manifest: { ...manifest, version: '1.2.0' }, manifestBytes: bytes, proofBytes: new Uint8Array(1), archive: new Uint8Array(1) },
      options, new Date()), (e: any) => e instanceof PkgRefusal && 'path_moved' === e.code)
    const sync = await pkgSync(app, options, http, { base: ['ftp://x'] })
    Assert.equal(sync.verdict, 'refused')
  })
  test('every-listed-version-is-seen-and-a-tombstone-is-not-a-rollback', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    await publish(w, publisher(w, 'service', '1.4.3', SERVICE))
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    Assert.equal((await run(w, http, 'sync', [app])).code, 0)
    const seen = cacheSeenDir(Path.join(w.cache, 'aontu', 'pkg'), 'corp.example/service')
    Assert.deepEqual(Fs.readdirSync(seen).sort(), ['1.4.2.aon', '1.4.3.aon'])

    // A version dropped from the list with nothing in its place is a
    // rollback, though this client never took it. A held closure asks
    // nothing, so a consumer that must fetch is the one that notices.
    const listFile = Path.join(at(w, 'service'), 'list')
    const list = readJson(listFile)
    Fs.writeFileSync(listFile, JSON.stringify({
      ...list, versions: list.versions.filter((e: any) => '1.4.3' !== e.version),
    }) + '\n')
    const wants = consumer(w, '"corp.example/service": {v: "1.4.3"}')
    const rolled = await run(w, http, 'sync', [wants])
    Assert.match(rolled.out, /refused: list_rollback: corp.example\/service 1.4.3 was seen before and is absent from the list/)
    // A tombstone standing where it was is the repository's word, and
    // the version it names is refused as withdrawn, not as a rollback.
    write(Path.join(w.repo, 'tombstone', 'corp.example', 'service', '@v'), { '1.4.3.aon': '{"reason": "malware"}\n' })
    Assert.match((await run(w, http, 'sync', [wants])).out, /refused: tombstoned: corp.example\/service 1.4.3/)
    for (const sub of ['download', 'store']) {
      Fs.rmSync(Path.join(w.cache, 'aontu', 'pkg', sub), { recursive: true, force: true })
    }
    const stood = await run(w, http, 'sync', [consumer(w, '"corp.example/service": {v: "1.4.2"}')])
    Assert.equal(stood.code, 0, stood.out)

    // A list that offers nothing records nothing, and selects nothing.
    write(Path.join(w.repo, 'pkg', 'corp.example', 'empty', '@v'),
      { list: '{"package":"corp.example/empty","versions":[]}\n' })
    const empty = await run(w, http, 'sync', [consumer(w, '"corp.example/empty": {v: "1.0.0"}')])
    Assert.match(empty.out, /refused: fetch_failed: corp.example\/empty 1.0.0 is not in the version list/)
    Assert.ok(!Fs.existsSync(cacheSeenDir(Path.join(w.cache, 'aontu', 'pkg'), 'corp.example/empty')))

    // A lock written without its header line is read the same under --frozen.
    const lockFile = Path.join(app, 'aontu_meta', 'pkg-lock.aon')
    Fs.writeFileSync(lockFile, lockOf(app).split('\n').filter((l) => !l.startsWith('#')).join('\n'))
    const frozen = await run(w, http, 'sync', ['--frozen', app])
    Assert.equal(frozen.code, 0, frozen.out)
  })


  test('a-frozen-refusal-prunes-nothing-and-a-vendored-tree-is-the-package-asked-for', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    await publish(w, publisher(w, 'other', '1.4.2', SERVICE))
    const pair = consumer(w, '"corp.example/service": {v: "1.4.2"}, "corp.example/other": {v: "1.4.2"}')
    Assert.equal((await run(w, http, 'sync', [pair])).code, 0)
    const otherDir = Path.join(pair, 'aontu_meta', 'vendor', 'corp.example', 'other')
    const pkgFile = Path.join(pair, 'pkg.aon')
    Fs.writeFileSync(pkgFile, Fs.readFileSync(pkgFile, 'utf8').replace(', "corp.example/other": {v: "1.4.2"}', ''))
    const frozen = await run(w, http, 'sync', ['--frozen', pair])
    Assert.match(frozen.out, /^verdict: frozen\n/)
    Assert.ok(Fs.existsSync(otherDir))
    Assert.equal((await run(w, http, 'sync', [pair])).code, 0)
    Assert.ok(!Fs.existsSync(otherDir))

    // An alias retargeted at the same version fetches its target
    // rather than reusing the tree it had.
    const alias = Path.join(w.dir, 'alias-app')
    write(alias, {
      'pkg.aon': 'pkg: {path: "corp.example/app"}\ndep: {"alias:svc": {v: "1.4.2", pkg: "corp.example/service"}}\n' + REPO_BLOCK,
      'main.aon': 'svc: @"alias:svc"\n',
    })
    Assert.equal((await run(w, http, 'sync', [alias])).code, 0)
    const aliasPkg = Path.join(alias, 'pkg.aon')
    Fs.writeFileSync(aliasPkg, Fs.readFileSync(aliasPkg, 'utf8').replace('pkg: "corp.example/service"', 'pkg: "corp.example/other"'))
    const re = await run(w, http, 'sync', [alias])
    Assert.equal(re.code, 0, re.out)
    Assert.equal(readLock(alias)['alias:svc'].pkg, 'corp.example/other')
    Assert.match(Fs.readFileSync(Path.join(moduleDir(Path.join(alias, 'aontu_meta', 'vendor'), 'alias:svc'), 'pkg.aon'), 'utf8'),
      /path: "corp.example\/other"/)

    // A pinned manifest that is gone from the tree is a mismatch, not a pass.
    const vend = consumer(w, '"corp.example/service": {v: "1.4.2"}')
    Assert.equal((await run(w, http, 'sync', [vend])).code, 0)
    Fs.rmSync(Path.join(vend, 'aontu_meta', 'vendor', 'corp.example', 'service', 'aontu_meta', 'manifest.aon'))
    const v = await run(w, http, 'pkg', ['verify', '--format', 'json', vend])
    Assert.equal(v.code, 1, v.out)
    Assert.deepEqual(JSON.parse(v.out).mismatched, [{
      key: 'corp.example/service', pin: 'manifest', want: readLock(vend)['corp.example/service'].manifest, got: '',
    }])
  })


  test('the-signing-key-is-ed25519-and-the-transport-reads-to-the-cap', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    const tree = publisher(w, 'service', '1.4.2', SERVICE)
    const rsa = Path.join(w.dir, 'rsa.pem')
    Fs.writeFileSync(rsa, generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey
      .export({ format: 'pem', type: 'pkcs8' }))
    Assert.match((await run(w, http, 'publish', ['--key', rsa, '--to', w.repo, tree])).out,
      /refused: key_invalid: the key is rsa, not ed25519/)
    Fs.writeFileSync(rsa, 'not pem\n')
    Assert.match((await run(w, http, 'publish', ['--key', rsa, '--to', w.repo, tree])).out,
      /refused: key_invalid: the key file is not a PEM private key/)
    Assert.throws(() => keyIdFromPem('nope'), (e: any) => e instanceof PkgRefusal && 'key_invalid' === e.code)

    // A body is read no further than the archive cap.
    const big = createServer((_req, res) => {
      res.writeHead(200)
      res.write(Buffer.alloc(3000))
      setTimeout(() => res.end(Buffer.alloc(3000)), 50)
    })
    await new Promise<void>((r) => big.listen(0, '127.0.0.1', () => r()))
    const url = 'http://127.0.0.1:' + (big.address() as any).port + '/x'
    const saved = ARCHIVE_LIMITS.bytes
    ARCHIVE_LIMITS.bytes = 1000
    const capped = await defaultHttp().get(url)
    ARCHIVE_LIMITS.bytes = saved
    Assert.equal(capped.status, 200)
    Assert.equal(capped.body.length, 3000)
    const whole = await defaultHttp().get(url)
    Assert.equal(whole.body.length, 6000)
    await new Promise<void>((r) => big.close(() => r()))
    Assert.equal((await readBounded(new Response(null), 10)).length, 0)
  })


  test('outdated-walks-the-whole-closure-that-moves', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    Assert.equal((await publish(w, publisher(w, 'base', '1.0.0', 'x: 1\n'))).code, 0)
    Assert.equal((await publish(w, publisher(w, 'base', '1.1.0', 'x: 1\ny?: integer\n'))).code, 0)
    Assert.equal((await publish(w, publisher(w, 'common', '1.0.0', 'x: 1\n'))).code, 0)
    const c2 = await publish(w, await publisherWith(w, 'common', '1.2.0', '@"corp.example/base"\nx: 1\n',
      '"corp.example/base": {v: "1.1.0"}'))
    Assert.equal(c2.code, 0, c2.out)
    const s1 = await publish(w, await publisherWith(w, 'service', '1.0.0', '@"corp.example/common"\nname: string\n',
      '"corp.example/common": {v: "1.0.0"}'))
    Assert.equal(s1.code, 0, s1.out)
    // The later service names common through an alias too, as a
    // consumer may.
    const s2 = await publish(w, await publisherWith(w, 'service', '1.2.0', '@"corp.example/common"\nname: string\n',
      '"corp.example/common": {v: "1.2.0"}, "alias:c": {v: "1.2.0", pkg: "corp.example/common"}'))
    Assert.equal(s2.code, 0, s2.out)
    const app = consumer(w, '"corp.example/service": {v: "1.0.0"}, "alias:b": {v: "1.0.0", pkg: "corp.example/base"}')
    Assert.equal((await run(w, http, 'sync', [app])).code, 0)
    for (const name of ['base', 'common', 'service']) {
      backdate(w, name)
    }
    const r = await run(w, http, 'pkg', ['outdated', '--format', 'json', app])
    Assert.equal(r.code, 1, r.out)
    const report = JSON.parse(r.out)
    const moves = (key: string) => report.locked.find((e: any) => key === e.key).moves
    Assert.deepEqual(moves('corp.example/service'),
      ['alias:c unlocked -> 1.2.0', 'corp.example/base unlocked -> 1.1.0', 'corp.example/common 1.0.0 -> 1.2.0'])
    Assert.deepEqual(moves('corp.example/common'), ['corp.example/base unlocked -> 1.1.0'])
    Assert.deepEqual(moves('alias:b'), [])
    // A declaration the walk cannot follow is reported as a move and
    // not walked: an alias without its package, a key that names none.
    resign(w, 'service', '1.2.0', (m) => {
      m.deps['alias:zed'] = { v: '1.0.0' }
      m.deps['corp.example/data.json'] = { v: '1.0.0' }
    })
    const odd = JSON.parse((await run(w, http, 'pkg', ['outdated', '--format', 'json', app])).out)
    Assert.deepEqual(odd.locked.find((e: any) => 'corp.example/service' === e.key).moves, [
      'alias:c unlocked -> 1.2.0', 'alias:zed unlocked -> 1.0.0', 'corp.example/base unlocked -> 1.1.0',
      'corp.example/common 1.0.0 -> 1.2.0', 'corp.example/data.json unlocked -> 1.0.0',
    ])

    // The closure bounds hold here as everywhere.
    const bounds = { ...LIMITS }
    try {
      LIMITS.depth = 0
      Assert.match((await run(w, http, 'pkg', ['outdated', app])).out, /refused: module_depth/)
      LIMITS.depth = bounds.depth
      LIMITS.closure = 0
      Assert.match((await run(w, http, 'pkg', ['outdated', app])).out, /refused: closure_too_large/)
    }
    finally {
      Object.assign(LIMITS, bounds)
    }
  })


  test('the-meaning-is-checked-against-the-pin-and-a-cycle-in-why-ends', async () => {
    const w = world()
    const http = dirHttp(w.repo)
    await publish(w, publisher(w, 'service', '1.4.2', SERVICE))
    const fresh = () => Fs.rmSync(Path.join(w.cache, 'aontu'), { recursive: true, force: true })
    const app = consumer(w, '"corp.example/service": {v: "1.4.2"}')

    // The manifest pins a canon the module does not mean.
    resign(w, 'service', '1.4.2', (m) => { m.modules[0].canon = 'aon1-' + 'A'.repeat(43) })
    fresh()
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: module_integrity: corp.example\/service 1.4.2 means aon1-[A-Za-z0-9_-]{43}, and the manifest pins aon1-A{43}/)

    // The module does not evaluate at all.
    const entries = [
      { path: 'main.aon', data: new Uint8Array(Buffer.from('a: 1\na: 2\n')) },
      { path: 'pkg.aon', data: new Uint8Array(Buffer.from('pkg: {path: "corp.example/service", version: "1.4.2", main: "main.aon"}\n')) },
    ]
    const zip = zipCanonical(entries)
    Fs.writeFileSync(Path.join(at(w, 'service'), '1.4.2.zip'), zip)
    resign(w, 'service', '1.4.2', (m) => {
      m.archive.digest = sha256Hex(zip)
      m.archive.size = zip.length
      m.archive.files = entries.map((e) => ({ path: e.path, digest: sha256Hex(e.data), size: e.data.length }))
    })
    fresh()
    Assert.match((await run(w, http, 'sync', [app])).out,
      /refused: module_integrity: corp.example\/service 1.4.2 means nothing \(it does not evaluate\)/)

    // Hand-vendored packages that depend on each other, and one that
    // names a package the lock lacks: why walks the cycle once and the
    // unlocked edge leads nowhere.
    const cyc = Path.join(w.dir, 'cyc')
    const entry = (canon: string) => '{"archive":"sha256:' + '0'.repeat(64) + '","canon":"' + canon + '","v":"1.0.0"}'
    write(cyc, {
      'pkg.aon': 'pkg: {path: "corp.example/app"}\ndep: {"corp.example/a": {v: "1.0.0"}}\n',
      'main.aon': 'x: 1\n',
      'aontu_meta/vendor/corp.example/a/pkg.aon':
        'pkg: {path: "corp.example/a", version: "1.0.0", main: "main.aon"}\n' +
        'dep: {"corp.example/b": {v: "1.0.0"}, "corp.example/c": {v: "1.0.0"}}\n',
      'aontu_meta/vendor/corp.example/a/main.aon': 'a: 1\n',
      'aontu_meta/vendor/corp.example/b/pkg.aon':
        'pkg: {path: "corp.example/b", version: "1.0.0", main: "main.aon"}\ndep: {"corp.example/a": {v: "1.0.0"}}\n',
      'aontu_meta/vendor/corp.example/b/main.aon': 'b: 1\n',
      'aontu_meta/pkg-lock.aon': '{"lock":{"corp.example/a":' + entry('aon1-' + 'A'.repeat(43)) +
        ',"corp.example/b":' + entry('aon1-' + 'B'.repeat(43)) + '}}\n',
    })
    const why = await run(w, http, 'why', ['--format', 'json', 'corp.example/b', cyc])
    Assert.equal(why.code, 0, why.out)
    Assert.deepEqual(JSON.parse(why.out).paths, [['corp.example/app', 'corp.example/a', 'corp.example/b']])
  })

})

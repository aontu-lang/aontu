/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { allow } from '../dist/aontu'
import { ALLOW_AT } from '../dist/allow'


const ROLES = `
roles: {
  admin: { allow: ["$"] }
  dev: {
    allow: ["$.services", "$.deploy.*.replicas"]
    deny: ["$.services.*.tier"]
  }
  product: { allow: ["$.features", "$.services.*.description"] }
  qa: { allow: ["$.tests"] }
}
`


// One decision, with the fields a machine reader destructures.
function decision(role: string, path: string, src: string = ROLES) {
  const r = allow(src, role, [path])
  Assert.equal(r.paths.length, 1)
  return r.paths[0]
}


// One error report: the verdict, and the single finding's code and path.
function failure(src: string, role: string = 'dev', path: string = '$.a') {
  const r = allow(src, role, [path])
  Assert.equal(r.verdict, 'error')
  Assert.deepEqual(r.paths, [])
  Assert.equal(r.findings.length, 1)
  return r.findings[0]
}


describe('allow', () => {

  test('the-default-anchor-is-the-roles-map', () => {
    Assert.equal(ALLOW_AT, '$.roles')
  })


  test('an-allow-entry-covers-itself-and-everything-below', () => {
    Assert.deepEqual(decision('product', '$.features'), {
      path: '$.features', allowed: true, reason: 'allow',
      by: '$.roles.product.allow.0', pattern: '$.features',
    })
    Assert.deepEqual(decision('product', '$.features.search.enabled'), {
      path: '$.features.search.enabled', allowed: true, reason: 'allow',
      by: '$.roles.product.allow.0', pattern: '$.features',
    })
    Assert.deepEqual(decision('dev', '$.services.auth.replicas'), {
      path: '$.services.auth.replicas', allowed: true, reason: 'allow',
      by: '$.roles.dev.allow.0', pattern: '$.services',
    })
    // The whole document is covered only by an entry that names it.
    Assert.equal(decision('admin', '$').allowed, true)
    Assert.deepEqual(decision('qa', '$'), {
      path: '$', allowed: false, reason: 'uncovered',
    })
  })


  test('a-star-segment-matches-any-one-key', () => {
    Assert.deepEqual(decision('dev', '$.deploy.eu1.replicas'), {
      path: '$.deploy.eu1.replicas', allowed: true, reason: 'allow',
      by: '$.roles.dev.allow.1', pattern: '$.deploy.*.replicas',
    })
    Assert.equal(decision('product', '$.services.auth.description').allowed, true)
    Assert.equal(decision('dev', '$.deploy.eu1').allowed, false)
    Assert.equal(decision('dev', '$.deploy').allowed, false)
    Assert.equal(decision('dev', '$.deploy.eu1.replicas.max').allowed, true)

    const src = 'roles: r: { allow: ["$.services.*"] }'
    Assert.equal(decision('r', '$.services', src).reason, 'uncovered')
    Assert.equal(decision('r', '$.services.auth', src).reason, 'allow')
    Assert.equal(decision('r', '$.services.auth.x', src).reason, 'allow')
  })


  test('a-deny-entry-refuses-every-path-that-intersects-it', () => {
    // At the denied node.
    Assert.deepEqual(decision('dev', '$.services.auth.tier'), {
      path: '$.services.auth.tier', allowed: false, reason: 'deny',
      by: '$.roles.dev.deny.0', pattern: '$.services.*.tier',
    })
    Assert.equal(decision('dev', '$.services.auth.tier.name').reason, 'deny')
    Assert.equal(decision('dev', '$.services.auth').reason, 'deny')
    Assert.equal(decision('dev', '$.services').reason, 'deny')
    Assert.equal(decision('dev', '$').reason, 'deny')
    // Beside it: a sibling of the denied node is untouched.
    Assert.equal(decision('dev', '$.services.auth.replicas').reason, 'allow')

    Assert.equal(decision('r', '$.a', 'roles: r: { deny: ["$.a"] }').reason, 'deny')
    Assert.equal(decision('r', '$.b', 'roles: r: { deny: ["$.a"] }').reason, 'uncovered')
    const rootDeny = 'roles: r: { allow: ["$"] deny: ["$"] }'
    Assert.equal(decision('r', '$.a.b', rootDeny).reason, 'deny')
    Assert.equal(decision('r', '$', rootDeny).reason, 'deny')
  })


  test('deny-wins-over-allow-whatever-the-order', () => {
    const src = 'roles: r: { deny: ["$.a.b"] allow: ["$.a"] }'
    Assert.equal(decision('r', '$.a.b', src).reason, 'deny')
    Assert.equal(decision('r', '$.a.c', src).reason, 'allow')
  })


  test('a-path-nothing-covers-is-refused-uncovered', () => {
    Assert.deepEqual(decision('qa', '$.services.auth'), {
      path: '$.services.auth', allowed: false, reason: 'uncovered',
    })
    Assert.equal(decision('r', '$.a', 'roles: r: {}').reason, 'uncovered')
  })


  test('the-verdict-is-allowed-only-when-every-path-is', () => {
    const both = allow(ROLES, 'dev',
      ['$.services.auth.replicas', '$.deploy.eu1.replicas'])
    Assert.equal(both.verdict, 'allowed')
    Assert.deepEqual(both.findings, [])
    Assert.deepEqual(both.paths.map((d) => d.allowed), [true, true])

    const mixed = allow(ROLES, 'dev', ['$.services.auth.replicas', '$.tests'])
    Assert.equal(mixed.verdict, 'refused')
    Assert.deepEqual(mixed.paths.map((d) => d.reason), ['allow', 'uncovered'])

    // Nothing asked is nothing allowed.
    const none = allow(ROLES, 'admin', [])
    Assert.equal(none.verdict, 'refused')
    Assert.deepEqual(none.paths, [])
  })


  test('asked-paths-are-normalised-the-way-a-reference-reads-them', () => {
    Assert.equal(decision('dev', 'services.auth').path, '$.services.auth')
    Assert.equal(decision('dev', '$.services.auth.').path, '$.services.auth')
    Assert.equal(decision('admin', '').path, '$')
    Assert.equal(decision('admin', '$.').path, '$')
    // An empty segment inside an entry is dropped as a reference drops it.
    const src = 'roles: r: { allow: ["$.a..b"] }'
    Assert.equal(decision('r', '$.a.b.c', src).reason, 'allow')
  })


  test('an-entry-starts-at-the-root-and-does-not-end-in-a-dot', () => {
    for (const bad of ['""', '"."', '"a.b"', '"$."', '"$.a."']) {
      const f = failure(`roles: dev: { allow: [${bad}] }`)
      Assert.equal(f.code, 'constraint', bad)
      Assert.equal(f.path, '$', bad)
    }
    // The same shape holds the deny list.
    Assert.equal(failure('roles: dev: { allow: ["$"] deny: ["x"] }').code, 'constraint')
    // The root is spelled `$`, and a star is an ordinary segment.
    Assert.equal(decision('r', '$.x', 'roles: r: { allow: ["$"] }').reason, 'allow')
    Assert.equal(decision('r', '$.x.y', 'roles: r: { allow: ["$.*"] }').reason, 'allow')
  })


  test('an-undeclared-role-is-refused-with-the-nearest-name', () => {
    const r = allow(ROLES, 'de', ['$.services', '$.tests'])
    Assert.equal(r.verdict, 'refused')
    Assert.equal(r.role, 'de')
    Assert.deepEqual(r.paths, [
      { path: '$.services', allowed: false, reason: 'no_role' },
      { path: '$.tests', allowed: false, reason: 'no_role' },
    ])
    Assert.deepEqual(r.findings, [{
      code: 'no_path',
      class: 'reference',
      severity: 'error',
      path: '$.roles.de',
      message: 'The role de is not declared at $.roles in this document.',
      sites: [],
      note: 'did you mean dev?',
    }])

    // No neighbour close enough: no note.
    const far = allow(ROLES, 'operations', ['$.a'])
    Assert.equal(far.findings[0].note, undefined)
  })


  test('a-role-is-one-key-looked-up-as-written', () => {
    // A dotted name is a key, not a path into a role.
    const dotted = 'roles: { "a.b": { allow: ["$.a"] } a: { b: { allow: ["$"] } } }'
    Assert.equal(decision('a.b', '$.a.y', dotted).by, '$.roles.a.b.allow.0')
    Assert.equal(decision('a.b', '$.z', dotted).reason, 'uncovered')
    for (const role of ['', 'dev.allow', 'admin.allow.0', '__proto__', 'constructor']) {
      const r = allow(ROLES, role, ['$.a'])
      Assert.equal(r.verdict, 'refused', role)
      Assert.equal(r.paths[0].reason, 'no_role', role)
      Assert.equal(r.findings[0].code, 'no_path', role)
    }
  })


  test('the-lists-are-read-from-the-tree-hidden-or-not', () => {
    const hiddenDeny = 'roles: dev: { allow: ["$"] deny: hide(["$.a"]) }'
    Assert.equal(decision('dev', '$.a', hiddenDeny).reason, 'deny')
    Assert.equal(decision('dev', '$.b', hiddenDeny).reason, 'allow')
    // A hidden or typed role, and a hidden allow list, answer as written.
    Assert.equal(decision('dev', '$.x', 'roles: dev: hide({ allow: ["$"] })').reason, 'allow')
    Assert.equal(decision('dev', '$.x', 'roles: dev: type({ allow: ["$"] })').reason, 'allow')
    Assert.equal(decision('dev', '$.x', 'roles: dev: { allow: hide(["$"]) }').reason, 'allow')
    Assert.equal(decision('dev', '$.x', 'roles: dev: { allow: [hide("$")] }').reason, 'allow')
    const byRef = 'common: ["$.c"]\nroles: dev: { allow: [$.common.0] }'
    Assert.equal(decision('dev', '$.c.x', byRef).by, '$.roles.dev.allow.0')
    const pref = 'roles: dev: { allow: [*"$.p" | string] }'
    Assert.equal(decision('dev', '$.p', pref).pattern, '$.p')
  })


  test('an-entry-that-is-not-a-concrete-string-is-an-error', () => {
    const kind = failure('roles: dev: { allow: [string] }')
    Assert.equal(kind.code, 'no_gen')
    Assert.equal(kind.path, '$.roles.dev.allow.0')
    // The registry's class for the engine's code, and the headline.
    Assert.equal(kind.class, 'incomplete')
    Assert.equal(
      kind.message,
      '[aontu/no_gen]: Cannot resolve value at path $.roles.dev.allow.0')
    Assert.deepEqual(kind.sites, [])
    // A hidden kind is no more concrete for being hidden, and the
    // second entry is where the deny list fails.
    Assert.equal(failure('roles: dev: { allow: [hide(string)] }').code, 'no_gen')
    const deny = failure('roles: dev: { allow: ["$"] deny: ["$.a", string] }')
    Assert.equal(deny.code, 'no_gen')
    Assert.equal(deny.path, '$.roles.dev.deny.1')
  })


  test('a-model-that-does-not-stand-up-is-an-error', () => {
    // The shape is aontu, so a malformed role is the engine's refusal,
    // with the engine's code: a string where the list should be.
    const bad = failure('roles: dev: { allow: "$.a" }')
    Assert.equal(bad.code, 'scalar_kind')
    Assert.equal(bad.path, '$')

    Assert.equal(failure('roles: 1').code, 'scalar_kind')

    // A conflict anywhere in the model, roles or not, and a model that
    // does not parse.
    Assert.equal(allow('roles: dev: { allow: ["$"] }\nx: 1\nx: 2', 'dev', ['$.a']).verdict, 'error')
    Assert.equal(allow('roles: dev: { allow: ["$"] } /* open', 'dev', ['$.a']).verdict, 'error')

    // The empty model declares no role.
    const empty = allow('', 'dev', ['$.a'])
    Assert.equal(empty.verdict, 'refused')
    Assert.equal(empty.findings[0].code, 'no_path')
  })


  test('the-shape-meets-the-model-whatever-its-last-line', () => {
    const tails = [
      'roles: {\n  dev: { allow: ["$.a"] }\n',
      'roles: dev: { allow: ["$.a"] }\nfoo:',
      'roles: dev: { allow: ["$.a"] }\nfoo: {} &',
      'roles: dev: { allow: ["$.a"] } # all',
    ]
    for (const src of tails) {
      Assert.equal(decision('dev', '$.a.b', src).by, '$.roles.dev.allow.0', src)
    }
    const broken = [
      'roles: {\n  dev: { allow: "$.a" }\n',
      'roles: dev: { allow: "$.a" }\nfoo:',
      'roles: dev: { allow: "$.a" }\nfoo: {} &',
    ]
    for (const src of broken) {
      Assert.equal(allow(src, 'dev', ['$.a']).verdict, 'error', src)
    }
  })


  test('at-moves-the-roles-map', () => {
    const src = 'policy: { roles: { dev: { allow: ["$.a"] } } }'
    const r = allow(src, 'dev', ['$.a.b'], { at: '$.policy.roles' })
    Assert.equal(r.verdict, 'allowed')
    Assert.equal(r.paths[0].by, '$.policy.roles.dev.allow.0')

    // The roles map may be the document itself, and the shape is then
    // a top-level spread: every top-level key is a role.
    const top = allow('dev: { allow: ["$.a"] deny: ["$.a.x"] }', 'dev',
      ['$.a.b', '$.a.x'], { at: '$' })
    Assert.equal(top.verdict, 'refused')
    Assert.deepEqual(top.paths.map((d) => d.by), ['$.dev.allow.0', '$.dev.deny.0'])

    // Unknown role under a moved anchor names the anchor.
    const miss = allow(src, 'qa', ['$.a'], { at: '$.policy.roles' })
    Assert.equal(miss.findings[0].path, '$.policy.roles.qa')

    // An anchor the model holds as something other than a map.
    Assert.equal(allow('policy: roles: 1', 'dev', ['$.a'], { at: '$.policy.roles' }).verdict, 'error')
  })


  test('a-closed-vocabulary-declares-deny-or-is-refused', () => {
    // close() on the role shape must admit the optional deny the
    // template carries, or the meet is refused with the engine's code.
    const closed = 'roles: dev: close({ allow: ["$"] })'
    Assert.equal(failure(closed).code, 'closed')
    const declared = 'roles: dev: close({ allow: ["$"] deny?: [&: string] })'
    Assert.equal(decision('dev', '$.x', declared).reason, 'allow')
  })


  test('relative-loads-resolve-from-the-models-own-directory', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-allow-'))
    Fs.writeFileSync(Path.join(dir, 'dev.aontu'),
      'roles: dev: { allow: ["$.services"] }')
    const model = Path.join(dir, 'roles.aontu')
    const src = '@"./dev.aontu"\nroles: qa: { allow: ["$.tests"] }'
    Fs.writeFileSync(model, src)

    const r = allow(src, 'dev', ['$.services.auth'], { path: model })
    Assert.equal(r.verdict, 'allowed')

    // Denied the load, the included role is not there to answer.
    const denied = allow(src, 'dev', ['$.services.auth'],
      { path: model, trust: { include: 'none' } })
    Assert.equal(denied.verdict, 'error')
    Assert.equal(denied.findings[0].code, 'include_denied')
  })

})

/* Smoke-test the browser bundle (web/aontu-bundle.js) without a
 * browser: load it into a bare `node:vm` context that has NO Node
 * builtins (only TextEncoder/TextDecoder, which every browser has),
 * then drive the exact calls web/playground.html makes for each
 * bundled example.
 *
 *   cd web/build && node smoke.mjs
 *
 * Exits non-zero on the first failed check. Also cross-checks
 * canonHash against the real Node crypto via ts/dist, proving the
 * bundled pure-JS SHA-256 shim agrees with node:crypto. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const require = createRequire(import.meta.url)

// ---- Load the bundle exactly as a browser would: a bare global
// scope, no Node builtins, `window` = the global object.

const bundleSrc = readFileSync(join(repo, 'web', 'aontu-bundle.js'), 'utf8')
const sandbox = { TextEncoder, TextDecoder, console }
sandbox.window = sandbox
const ctx = vm.createContext(sandbox)
vm.runInContext(bundleSrc, ctx, { filename: 'aontu-bundle.js' })
const A = vm.runInContext('window.AontuLib', ctx)

// The real Node build, for the canonHash cross-check.
const N = require(join(repo, 'ts', 'dist', 'aontu.js'))

// ---- What the page does (mirrors web/playground.template.html) ----

const TRUST = { include: { mem: {} } }
const engine = () => new A.Aontu({ trust: TRUST })

const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')

const evaluate = (src) => A.exactJSON(engine().generate(src), 2)
const canon = (src) => {
  const val = engine().unify(src)
  return { canon: String(val.canon), hash: A.canonHash(val) }
}
const vet = (schema, data) => A.vet(schema, data, { trust: TRUST })
const subsume = (general, specific) => A.subsume(general, specific)

// ---- The examples, verbatim from the page ------------------------

// Kept in sync with playground.template.html by the containment check
// below: every source here must appear verbatim in the template.
const EX = {
  welcome_source: [
    '# Defaults, constraints, and data in one notation.',
    '# Evaluate generates JSON; Vet checks this document',
    '# against the schema pane below (spot the bad port).',
    'host: "localhost"',
    'port: 80',
    'debug: *false | boolean',
    '',
  ].join('\n'),
  welcome_schema: [
    '# The schema the Vet button checks the source against.',
    'host: string & re("^[a-z][a-z0-9.-]*$")',
    'port: integer & min(1024) & max(65535)',
    'debug: boolean',
    '',
  ].join('\n'),
  basics: [
    '# Two partial structures, one result: unification.',
    '# The same key can be given twice; the values are merged,',
    '# and $.path references read the unified document.',
    'service: {',
    '  name: "auth"',
    '  port: *8080 | integer',
    '}',
    'service: {',
    '  replicas: *1 | integer',
    '}',
    'deploy: {',
    '  target: $.service.name',
    '}',
    '',
  ].join('\n'),
  constraints: [
    '# Constraints are values too: unify them in.',
    '# Try breaking one (port: 80) and Evaluate again.',
    'server: {',
    '  host: string & re("^[a-z][a-z0-9.-]*$")',
    '  host: "api.example.com"',
    '  port: integer & min(1024) & max(65535)',
    '  port: 8443',
    '  timeout: *30 | integer & min(1)',
    '}',
    '',
  ].join('\n'),
  pack: [
    '# The &: template meets EVERY key of the map:',
    '# say the shape once, and each entry completes it.',
    'services: {',
    '  &: {',
    '    port: integer & min(1) & max(65535)',
    '    replicas: *1 | integer',
    '    tier: *"standard" | string',
    '  }',
    '  auth: { port: 8080 }',
    '  db:   { port: 5432, replicas: 3, tier: "critical" }',
    '}',
    '',
  ].join('\n'),
  vet_data: [
    '# The data document. Vet reports every violation',
    '# with its path and both contributing sites.',
    'service: {',
    '  name: "Auth Service"',
    '  port: 80',
    '}',
    '',
  ].join('\n'),
  vet_schema: [
    '# The schema document.',
    'service: {',
    '  name: string & re("^[a-z][a-z0-9-]*$")',
    '  port: integer & min(1024) & max(65535)',
    '  replicas: *1 | integer',
    '}',
    '',
  ].join('\n'),
  subsume_specific: [
    "# Specific: one team's tighter contract.",
    '# Subsume asks: does the General document (below) admit',
    '# every instance this one admits? Swap the two documents',
    '# and it reports exactly which domains were narrowed.',
    'service: {',
    '  port: integer & min(1024) & max(65535)',
    '  replicas: integer & min(2) & max(10)',
    '}',
    '',
  ].join('\n'),
  subsume_general: [
    '# General: what every deployment must satisfy.',
    'service: {',
    '  port: integer',
    '  replicas: integer & min(1)',
    '}',
    '',
  ].join('\n'),
}

// ---- Checks ------------------------------------------------------

let failures = 0
function check(name, got, want) {
  const ok = 'function' === typeof want ? want(got) : got === want
  if (ok) {
    console.log('ok   ' + name)
  }
  else {
    failures++
    console.log('FAIL ' + name)
    console.log('  got:  ' + JSON.stringify(got))
    if ('function' !== typeof want) console.log('  want: ' + JSON.stringify(want))
  }
  return ok
}

console.log('bundle loads: AontuLib v' + A.VERSION + ' (in a builtin-free vm context)')
console.log('')

// The template really contains these example sources (no drift).
const template = readFileSync(join(repo, 'web', 'playground.template.html'), 'utf8')
for (const [name, src] of Object.entries(EX)) {
  const lines = src.split('\n').filter((l) => '' !== l)
  // The template writes each line as a single-quoted JS string, so a
  // line with an apostrophe appears with it backslash-escaped.
  const missing = lines.filter(
    (l) => !template.includes(l) && !template.includes(l.replace(/'/g, "\\'")))
  check('template carries example ' + name, missing.length, 0)
}
console.log('')

// -- welcome: Evaluate, Canon (+hash), Vet finding
console.log('== welcome: Evaluate ==')
const welcomeJson = evaluate(EX.welcome_source)
console.log(welcomeJson)
check('welcome evaluates', welcomeJson,
  '{\n  "debug": false,\n  "host": "localhost",\n  "port": 80\n}')

console.log('== welcome: Canon ==')
const welcomeCanon = canon(EX.welcome_source)
console.log(welcomeCanon.canon)
console.log('canon-hash: ' + welcomeCanon.hash)
check('welcome canon', welcomeCanon.canon,
  '{"debug":*false|boolean,"host":"localhost","port":80}')
const nodeVal = new N.Aontu().unify(EX.welcome_source)
check('canonHash matches node:crypto', welcomeCanon.hash, N.canonHash(nodeVal))

console.log('== welcome: Vet (the preloaded finding) ==')
const welcomeVet = vet(EX.welcome_schema, EX.welcome_source)
console.log('verdict: ' + welcomeVet.verdict)
for (const f of welcomeVet.findings) {
  console.log('finding: ' + f.path + ' ' + f.code + ' expected ' +
    f.expected + ' actual ' + f.actual)
}
check('welcome vet verdict', welcomeVet.verdict, 'invalid')
check('welcome vet finding path', welcomeVet.findings[0]?.path, '$.port')
console.log('')

// -- basics
console.log('== basics: Evaluate ==')
const basicsJson = evaluate(EX.basics)
console.log(basicsJson)
check('basics evaluates', JSON.parse(basicsJson).deploy.target, 'auth')
check('basics default applied', JSON.parse(basicsJson).service.port, 8080)
console.log('')

// -- constraints
console.log('== constraints: Evaluate ==')
const conJson = evaluate(EX.constraints)
console.log(conJson)
check('constraints evaluate', JSON.parse(conJson).server.timeout, 30)
console.log('')

// -- pack
console.log('== pack: Evaluate ==')
const packJson = evaluate(EX.pack)
console.log(packJson)
const pack = JSON.parse(packJson)
check('pack template fills auth', pack.services.auth.tier, 'standard')
check('pack literal wins in db', pack.services.db.replicas, 3)
console.log('')

// -- vet example
console.log('== vet example ==')
const vetReport = vet(EX.vet_schema, EX.vet_data)
console.log('verdict: ' + vetReport.verdict +
  ' (' + vetReport.findings.length + ' findings)')
for (const f of vetReport.findings) {
  console.log('finding: ' + f.path + ' expected ' + f.expected +
    ' actual ' + f.actual)
}
check('vet verdict', vetReport.verdict, 'invalid')
check('vet finding count', vetReport.findings.length, 2)
check('vet paths', vetReport.findings.map((f) => f.path).join(','),
  '$.service.name,$.service.port')
console.log('')

// -- subsume example (and its reversal)
console.log('== subsume example ==')
const sub = subsume(EX.subsume_general, EX.subsume_specific)
console.log('general ⊒ specific: ' + sub.verdict)
check('subsume verdict', sub.verdict, 'subsumes')
const subRev = subsume(EX.subsume_specific, EX.subsume_general)
console.log('specific ⊒ general: ' + subRev.verdict +
  ' (' + subRev.findings.length + ' findings, first at ' +
  subRev.findings[0]?.path + ')')
check('reversed subsume verdict', subRev.verdict, 'does_not_subsume')
console.log('')

// -- bundle vs Node build: canon and canon-hash parity on every example
console.log('== bundle/node parity (canon + canonHash) ==')
for (const [name, src] of Object.entries(EX)) {
  const b = canon(src)
  const nv = new N.Aontu().unify(src)
  const okCanon = check('parity canon ' + name, b.canon, String(nv.canon))
  const okHash = check('parity hash ' + name, b.hash, N.canonHash(nv))
  if (!okCanon || !okHash) console.log('  source: ' + name)
}
console.log('')

// -- error paths the page shows in its error block
console.log('== error paths ==')
try {
  evaluate('a: 1 a: 2')
  check('conflict raises', false, true)
}
catch (e) {
  const msg = stripAnsi(e.message)
  console.log('conflict error head: ' + msg.split('\n')[0])
  check('conflict error', msg, (m) => m.includes('Cannot unify values at path $.a'))
  check('conflict error is ANSI-free after strip', /\x1b/.test(msg), false)
}
try {
  evaluate('x: @"other.aon"')
  check('file include raises', false, true)
}
catch (e) {
  const msg = stripAnsi(e.message)
  console.log('include error head: ' + msg.split('\n')[0])
  check('file include reports not-found', msg,
    (m) => m.includes('source not found: other.aon'))
}
const stdOut = evaluate('@"std/system"\nx: 1')
check('bundled @"std/system" include works', JSON.parse(stdOut).x, 1)
console.log('')

if (0 < failures) {
  console.log(failures + ' CHECK(S) FAILED')
  process.exit(1)
}
console.log('all checks passed')

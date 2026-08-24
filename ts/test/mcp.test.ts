/* Copyright (c) 2025 Richard Rodger, MIT License */

// The MCP tool library and its stdio wiring (G7 phase 6). The tools
// return the SAME contracts the CLI prints — vet's report, get's
// slice, why's record, diff's changes — so what is asserted here is
// the protocol around them, not the verbs, which the shared suite
// already pins in both ports.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import { PassThrough } from 'node:stream'
import { execFileSync } from 'node:child_process'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { handle, callTool, toolList, parseError, MCP_PROTOCOL } from '../dist/mcp'
import { main as mcpMain, LineCodec } from '../dist/mcp-server'


// The text payload of a tool result, decoded.
function payload(result: any): any {
  return JSON.parse(result.content[0].text)
}


describe('mcp', () => {

  test('initialize-and-list', () => {
    const init: any = handle(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, '9.9.9')
    Assert.equal(init.result.protocolVersion, MCP_PROTOCOL)
    Assert.equal(init.result.serverInfo.name, 'aontu')
    Assert.equal(init.result.serverInfo.version, '9.9.9')
    Assert.deepEqual(init.result.capabilities, { tools: {} })

    const list: any = handle({ id: 2, method: 'tools/list' }, '9.9.9')
    Assert.deepEqual(list.result.tools.map((t: any) => t.name).sort(),
      ['canon', 'diff', 'get', 'summary', 'vet', 'why'])
    // Every tool declares its arguments, and every required argument
    // is one of them: a schema that asks for what it does not describe
    // is a schema no client can satisfy.
    for (const t of toolList()) {
      Assert.equal(t.inputSchema.type, 'object')
      for (const req of t.inputSchema.required) {
        Assert.ok(null != t.inputSchema.properties[req], `${t.name}: ${req}`)
      }
    }

    Assert.deepEqual(handle({ id: 3, method: 'ping' }, '9.9.9')?.result, {})
  })

  // A NOTIFICATION has no id, and answering one is a protocol error in
  // the other direction.
  test('notifications-get-no-answer', () => {
    Assert.equal(
      handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, '1'),
      undefined)
  })

  test('every-tool-answers-its-own-report', () => {
    const v = payload(callTool('vet',
      { schema: 'a: integer', data: 'a: "x"' }))
    Assert.equal(v.verdict, 'invalid')
    Assert.equal(v.findings[0].code, 'no_scalar_unify')

    Assert.equal(payload(callTool('get',
      { src: 'a: {b: 1}', path: '$.a', view: 'canon' })).out, '{"b":1}')
    Assert.equal(payload(callTool('get',
      { src: 'a: {b: 1}', path: '$', view: 'types', depth: 2 })).out,
      '{"a":{"b":top}}')

    const w = payload(callTool('why',
      { src: 'a: 1\na: integer', path: '$.a' }))
    Assert.equal(w.record.value, '1')
    Assert.equal(w.record.conjuncts.length, 2)

    const d = payload(callTool('diff', { left: 'a: 1', right: 'a: 2' }))
    Assert.equal(d.same, false)
    Assert.equal(d.changes[0].path, '$.a')

    // The optional arguments: `at` on vet and on diff.
    Assert.equal(payload(callTool('vet',
      { schema: 'a: {b: integer}', data: 'b: 1', at: '$.a' })).verdict, 'valid')
    Assert.equal(payload(callTool('diff',
      { left: 'a: {b: 1}', right: 'a: {b: 2}', at: '$.a' })).changes[0].path,
      '$.b')
    // An argument of the wrong TYPE is read as absent rather than
    // coerced: a client that sends a number for a path gets the empty
    // path, which is the root — the same answer as sending nothing.
    Assert.equal(payload(callTool('diff',
      { left: 'a: 1', right: 'a: 1', at: 7 as any })).same, true)

    Assert.equal(payload(callTool('canon', { src: 'a: 1.0' })).canon,
      '{"a":1.0}')

    const s = payload(callTool('summary', { src: 'b: 2\na: 1' }))
    Assert.match(s.hash, /^aon1-/)
    Assert.deepEqual(s.keys, ['a', 'b'])
    Assert.equal(s.shape, '{"a":integer,"b":integer}')

    // A document whose root is NOT a map has no root keys, which is a
    // true summary rather than an error.
    const list = payload(callTool('summary', { src: '[1,2]' }))
    Assert.equal(list.ok, true)
    Assert.deepEqual(list.keys, [])
  })

  // A tool that REFUSES is not a protocol error: the report IS the
  // answer. `isError` is for a call that could not be made at all.
  test('a-refusal-is-an-answer-not-a-protocol-error', () => {
    const r = callTool('get', { src: 'a: 1', path: '$.zz' })
    Assert.equal(r.isError, false)
    Assert.equal(payload(r).ok, false)
    Assert.equal(payload(r).findings[0].code, 'no_path')

    const broken = callTool('canon', { src: 'a:]' })
    Assert.equal(broken.isError, false)
    Assert.equal(payload(broken).ok, false)

    const bsum = callTool('summary', { src: 'a:1 a:2' })
    Assert.equal(payload(bsum).ok, false)

    // A missing tool, or a missing required argument, IS one.
    Assert.equal(callTool('nope', {}).isError, true)
    Assert.equal(callTool('get', { src: 'a:1' }).isError, true)
    Assert.equal(callTool('vet', {}).isError, true)
  })

  test('served-evaluation-is-confined', () => {
    // A served document may not reach the filesystem: text arrives
    // from a caller, and an include is exactly what a server must not
    // run unconfined (G5).
    const r = payload(callTool('canon', { src: 'a: @"/etc/passwd"' }))
    Assert.equal(r.ok, false)
    Assert.equal(r.findings[0].code, 'include_denied')
  })


  // EVERY tool, not one of them. This test exists because the version
  // above it -- which asserted `canon` alone -- passed for weeks while
  // four of the six tools evaluated caller source with NO trust
  // profile, so `@"x.js"` was require()d in the server process. One
  // tool proving itself confined says nothing about its siblings.
  //
  // The table is derived from the LIVE tool list rather than written
  // out, so a tool added later is covered the day it is added, and the
  // assertion is on the security property itself (the module was not
  // executed) rather than on any one report's wording, which differs
  // per tool: vet answers a broken schema with verdict `error` and no
  // findings, where canon names `include_denied`.
  test('every-tool-is-confined', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-mcp-trust-'))
    const canary = Path.join(dir, 'canary.txt')
    const mod = Path.join(dir, 'mod.js')
    Fs.writeFileSync(mod,
      `require('fs').writeFileSync(${JSON.stringify(canary)},'x')\n` +
      'module.exports = {a:1}\n')
    const hostile = `a: @"${mod.replace(/\\/g, '/')}"`

    for (const t of toolList()) {
      const args: any = {}
      for (const req of t.inputSchema.required) {
        // A path argument must stay a path; every other required
        // string is a document, and gets the hostile one.
        args[req] = 'path' === req ? '$' : hostile
      }
      if (Fs.existsSync(canary)) Fs.unlinkSync(canary)

      const r: any = callTool(t.name, args)

      Assert.equal(Fs.existsSync(canary), false,
        `tool ${t.name} EXECUTED a caller-supplied module`)
      // And it answered rather than throwing the call away.
      Assert.equal(r.isError, false, `tool ${t.name} failed to answer`)
    }
  })


  // The SHIPPED binary, spawned as a client would run it. The
  // in-process tests above prove the library confines; this proves the
  // thing in `bin/` does, which is what an operator actually runs and
  // what the npm package installs.
  test('spawned-server-is-confined', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-mcp-spawn-'))
    const canary = Path.join(dir, 'canary.txt')
    const mod = Path.join(dir, 'mod.js')
    Fs.writeFileSync(mod,
      `require('fs').writeFileSync(${JSON.stringify(canary)},'x')\n` +
      'module.exports = {a:1}\n')
    const hostile = `a: @"${mod.replace(/\\/g, '/')}"`

    const bin = Path.join(__dirname, '..', 'bin', 'aontu-mcp.js')
    const lines = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      {
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'canon', arguments: { src: hostile } },
      },
    ].map((m) => JSON.stringify(m)).join('\n') + '\n'

    const out = execFileSync('node', [bin], {
      input: lines, encoding: 'utf8',
    })

    Assert.equal(Fs.existsSync(canary), false,
      'the spawned server EXECUTED a caller-supplied module')
    // It still answered both messages.
    const answers = out.trim().split('\n').map((l) => JSON.parse(l))
    Assert.equal(answers.length, 2)
    Assert.equal(answers[1].id, 2)
    Assert.ok(JSON.stringify(answers[1]).includes('include_denied'))
  })


  test('a-throwing-tool-does-not-take-the-server-down', () => {
    // A stdio server serves one client for a whole session, so an
    // unhandled throw inside a tool loses every later call as well.
    // isError is the contract for "this call could not be made".
    //
    // No document reaches this path -- every verb answers with a
    // report rather than throwing -- so the tool table is injected,
    // the way the watch loop injects its waiter.
    const boom: any = [{
      name: 'boom',
      description: 'throws',
      properties: { src: { type: 'string', description: 'x' } },
      required: ['src'],
      run: () => { throw new Error('bang') },
    }]
    const r: any = callTool('boom', { src: 'a:1' }, boom)
    Assert.equal(r.isError, true)
    Assert.match(r.content[0].text, /tool boom failed: bang/)

    // A thrown non-Error still answers, rather than printing
    // "undefined" from a missing .message.
    const odd: any = [{ ...boom[0], run: () => { throw 'plain' } }]
    const r2: any = callTool('boom', { src: 'a:1' }, odd)
    Assert.equal(r2.isError, true)
    Assert.match(r2.content[0].text, /tool boom failed: plain/)
  })

  // main() with no stream arguments uses the real stdout/exit
  // defaults, which no injected test reaches.
  test('stdio-server-default-streams', () => {
    const stdin: any = { on: () => stdin }
    const written: string[] = []
    let exited: number | undefined
    const so = process.stdout.write
    const pe = process.exit
    try {
      ;(process.stdout as any).write = (c: any) => (written.push(String(c)), true)
      ;(process as any).exit = (code: number) => { exited = code }
      const codec = mcpMain(stdin)
      codec.push('{"id":1,"method":"ping"}\n')
      codec.end()
    }
    finally {
      process.stdout.write = so
      ;(process as any).exit = pe
    }
    Assert.match(written.join(''), /"result":\{\}/)
    Assert.equal(exited, 0)
  })

  test('protocol-errors', () => {
    Assert.equal(handle({ id: 9, method: 'no/such' }, '1')?.error?.code, -32601)
    Assert.equal(
      handle({ id: 9, method: 'tools/call', params: {} }, '1')?.error?.code,
      -32602)
    Assert.equal(parseError().error?.code, -32700)
    Assert.equal(parseError().id, null)
    // A call with a name and NO arguments block: the tool's own
    // required-argument check answers, not the protocol.
    const bare: any = handle(
      { id: 10, method: 'tools/call', params: { name: 'canon' } }, '1')
    Assert.equal(bare.result.isError, true)
  })

  // The stdio wiring: NDJSON in, NDJSON out, one line per message.
  test('stdio-server-speaks-ndjson', async () => {
    const lines: string[] = []
    let exited = -1
    const stdin = new PassThrough()
    // The stream ends on a later tick, so the exit code is awaited
    // rather than read: this is the wiring test, and the wiring is
    // event-driven.
    const done = new Promise<void>((resolve) => {
      const codec: LineCodec = mcpMain(
        stdin, (line: string) => lines.push(line),
        (code: number) => (exited = code, resolve()), '9.9.9')
      Assert.ok(codec instanceof LineCodec)
    })

    // Two messages in one chunk, and one split across chunks.
    stdin.write('{"id":1,"method":"ping"}\n{"id":2,"method":"tools/list"}\n')
    stdin.write('{"id":3,"method":"ini')
    stdin.write('tialize"}\n')
    // A blank line is not a message; unparseable text is.
    stdin.write('\nnot json\n')
    stdin.end()
    await done

    Assert.equal(lines.length, 4)
    Assert.deepEqual(JSON.parse(lines[0]).result, {})
    Assert.equal(JSON.parse(lines[1]).result.tools.length, 6)
    Assert.equal(JSON.parse(lines[2]).result.serverInfo.version, '9.9.9')
    Assert.equal(JSON.parse(lines[3]).error.code, -32700)
    Assert.equal(exited, 0)
  })

})

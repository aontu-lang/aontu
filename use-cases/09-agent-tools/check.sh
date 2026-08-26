#!/usr/bin/env bash
# check.sh --- drive the aontu CLI and MCP server end to end over the
# agent-platform tool registry and assert every outcome. Runnable from
# any cwd.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$DIR/../.."
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"
# MCP is a command string like AONTU, so a caller validating another
# build overrides both: AONTU="node .../aontu.js" MCP="node .../aontu-mcp.js".
MCP="${MCP:-node $REPO/ts/bin/aontu-mcp.js}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { pass=$((pass + 1)); echo "ok $pass - $1"; }

# run <name> <expected-exit> -- <cli args...>
run() {
  local name="$1" want="$2"; shift 3
  local got=0
  $AONTU "$@" >"$WORK/$name.out" 2>"$WORK/$name.err" || got=$?
  [ "$got" -eq "$want" ] \
    || { cat "$WORK/$name.out" "$WORK/$name.err" >&2; \
         fail "$name: exit $got, wanted $want"; }
}

# has <name> <stream> <pattern> -- grep -F the captured stream.
has() {
  grep -qF -- "$3" "$WORK/$1.$2" \
    || { cat "$WORK/$1.$2" >&2; fail "$1: $2 does not contain: $3"; }
}

# ----------------------------------------------------------------
# 1. The registry is ground truth that GENERATES: schemas constrain
# but stay out of the output; tools, derived approval flags and the
# derived docs table come out concrete.
run eval 0 -- "$DIR/registry.aon"
diff -u "$DIR/expected/registry.json" "$WORK/eval.out" \
  || fail "registry.aon output drifted from expected/registry.json"
ok "registry.aon evaluates to the expected concrete registry"

# Canon keeps constraints, enums and deprecations; note it does NOT
# keep the fired match() rules (they render as their results), and it
# has already dropped the list sizing atoms (README, gap 8).
run canon 0 -- --canon "$DIR/registry.aon"
has canon out 're("^https://")'
has canon out '"GET"|"HEAD"'
has canon out 'deprecate(integer&min(0)&max(10)'
ok "canonical form keeps constraints, enums and deprecations"

run slice 0 -- get '$.tools.delete_records' "$DIR/registry.aon"
diff -u "$DIR/expected/tool-delete-records.json" "$WORK/slice.out" \
  || fail "delete_records slice drifted"
ok "get: one tool's merged truth, as a dispatcher would pull it"

run why 0 -- why '$.tools.delete_records.requires_approval' \
  "$DIR/registry.aon"
has why out 'match(.side_effect,"destructive",true,false)'
ok "why: the approval flag is traced to its match() rule"

# ----------------------------------------------------------------
# 2. The runtime guardrail: vet agent-emitted calls at the per-tool
# anchor of guard.aon. The dispatcher move: read .tool, vet at
# $.guard.<tool>, dispatch only on exit 0.
vet_call() { # <name> <want-exit> <call-file>
  local name="$1" want="$2" file="$DIR/data/$3"
  local tool
  tool=$(node -p "JSON.parse(require('fs').readFileSync('$file','utf8')).tool")
  local got=0
  $AONTU vet --at "\$.guard.$tool" "$DIR/guard.aon" "$file" \
    >"$WORK/$name.out" 2>"$WORK/$name.err" || got=$?
  [ "$got" -eq "$want" ] \
    || { cat "$WORK/$name.out" "$WORK/$name.err" >&2; \
         fail "$name: exit $got, wanted $want"; }
}

vet_call vok 0 call-search-ok.json
has vok out 'verdict: valid'
ok "vet: a well-formed call is admitted (exit 0)"

vet_call vbad 1 call-http-bad.json
has vbad out 'verdict: invalid'
has vbad out '[aontu/constraint]'
has vbad out 're("^https://")'
ok "vet: cleartext URL refused with the failing constraint (exit 1)"

vet_call vextra 1 call-delete-extra.json
has vextra out 'verdict: invalid'
has vextra out '[aontu/closed]'
has vextra out 'cascade'
ok "vet: hallucinated argument 'cascade' refused by close() (exit 1)"

vet_call vmissing 3 call-search-missing.json
has vmissing out 'verdict: incomplete'
has vmissing out '[aontu/mapval_required]'
ok "vet: missing required 'query' is incomplete, not valid (exit 3)"

vet_call vunknown 4 call-unknown-tool.json
has vunknown out 'verdict: error'
has vunknown out 'no_path'
ok "vet: unknown tool name refused at the anchor (exit 4)"

vet_call vdep 0 call-http-deprecated.json
has vdep out 'verdict: valid'
has vdep out 'deprecated'
has vdep out 'redirects'
ok "vet: sunset argument admitted with a deprecation warning (exit 0)"

# Pin of a HOLE, not an endorsement: the schema says
# labels: [...] & length(max(10)) & unique(), but sizing atoms fold
# against the schema's own empty templated list when the schema
# settles alone, so vet never re-checks them against the data
# (README, gap 8). Delete this pin when the engine fixes it.
vet_call vdup 0 call-ticket-dup-labels.json
has vdup out 'verdict: valid'
ok "vet: duplicate labels pass -- pins gap 8 (unique() not enforced)"

# The documented hole this layout works around: vetting the same
# missing-required call against the type()-marked call schemas inside
# registry.aon-style documents reports VALID (README, gap 7). Pin the
# guard behaviour instead: registry.aon itself has no $.guard.
run noguard 4 -- vet --at '$.guard.search_docs' "$DIR/registry.aon" \
  "$DIR/data/call-search-missing.json"
has noguard out 'no_path'
ok "vet: registry.aon alone is not the guardrail entrypoint (by design)"

# ----------------------------------------------------------------
# 3. The registry defends itself against drift.
run rogue 1 -- --include-root "$DIR" "$DIR/bad/rogue-tool.aon"
has rogue err '[aontu/closed]'
has rogue err 'audit_log'
ok "bad: a tool with no argument schema cannot register ([aontu/closed])"

run conflict 1 -- --include-root "$DIR" "$DIR/bad/conflicting-rate.aon"
has conflict err '[aontu/scalar_value]'
has conflict err '240'
ok "bad: contradicting a published rate limit is refused"

# ----------------------------------------------------------------
# 4. The agent entrypoints: the AGENTS.md stanza and the canon-hash
# pin agree with the source.
run agentsmd 0 -- agentsmd "$DIR/registry.aon"
has agentsmd out '<!-- aontu:begin -->'
has agentsmd out 'Top-level keys:'
run hash 0 -- hash "$DIR/registry.aon"
PIN="$(cat "$WORK/hash.out")"
has agentsmd out "$PIN"
ok "agentsmd: stanza derived, pin matches 'aontu hash'"

# ----------------------------------------------------------------
# 5. The real agent integration: the aontu MCP server over stdio
# JSON-RPC. The schema string must be self-contained (the server
# denies includes), so it is registry.aon plus guard.aon minus the
# include line.
{ cat "$DIR/registry.aon"; grep -v '^@' "$DIR/guard.aon"; } \
  > "$WORK/mcp-schema.aon"

cat > "$WORK/mcp-drive.js" <<'EOF'
// Drive the aontu MCP server: initialize, tools/list, two vet
// tools/calls, then a 100-call vet latency loop in the one process.
const { spawn } = require('child_process')
const fs = require('fs')
const [server, schemaFile, okFile, badFile] = process.argv.slice(2)
const schema = fs.readFileSync(schemaFile, 'utf8')
const okCall = fs.readFileSync(okFile, 'utf8')
const badCall = fs.readFileSync(badFile, 'utf8')

// server is a command string (the check's $MCP), so spawn via the shell.
const child = spawn(server, {
  shell: true, stdio: ['pipe', 'pipe', 'inherit'] })
let buf = ''
const waiters = new Map()
child.stdout.on('data', (d) => {
  buf += d
  let nl
  while (0 <= (nl = buf.indexOf('\n'))) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    const w = waiters.get(msg.id)
    if (w) { waiters.delete(msg.id); w.res(msg) }
  }
})
// A server that dies or drops one response must fail the check, not
// hang it: every pending call rejects on child exit, and each call
// carries its own timeout.
child.on('exit', (code) => {
  for (const w of waiters.values()) {
    w.rej(new Error('mcp server exited (code ' + code + ') with calls unanswered'))
  }
  waiters.clear()
})
let nextId = 1
const RPC_TIMEOUT_MS = 30000
function rpc(method, params) {
  const id = nextId++
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise((res, rej) => {
    const timer = setTimeout(() => {
      waiters.delete(id)
      rej(new Error('mcp call ' + method + ' unanswered after ' + RPC_TIMEOUT_MS + 'ms'))
    }, RPC_TIMEOUT_MS)
    waiters.set(id, {
      res: (m) => { clearTimeout(timer); res(m) },
      rej: (e) => { clearTimeout(timer); rej(e) },
    })
  })
}
function notify(method) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n')
}
const vetArgs = (data) => ({ name: 'vet',
  arguments: { schema, data, at: '$.guard.search_docs' } })

async function main() {
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05', capabilities: {},
    clientInfo: { name: 'orion-dispatcher', version: '0.0.1' } })
  notify('notifications/initialized')
  console.log('SERVER ' + init.result.serverInfo.name)

  const list = await rpc('tools/list', {})
  console.log('TOOLS ' + JSON.stringify(list.result.tools.map(t => t.name)))
  const vet = list.result.tools.find(t => t.name === 'vet')
  console.log('VETSCHEMA ' + JSON.stringify(vet.inputSchema.required))

  const okRes = await rpc('tools/call', vetArgs(okCall))
  const okRep = JSON.parse(okRes.result.content[0].text)
  console.log('VET_OK ' + okRep.verdict + ' isError=' + okRes.result.isError)

  const badRes = await rpc('tools/call', { name: 'vet', arguments: {
    schema, data: badCall, at: '$.guard.http_request' } })
  const badRep = JSON.parse(badRes.result.content[0].text)
  console.log('VET_BAD ' + badRep.verdict + ' '
    + badRep.findings.map(f => f.code).join(','))

  const N = 100
  const t0 = Date.now()
  for (let i = 0; i < N; i++) await rpc('tools/call', vetArgs(okCall))
  const ms = Date.now() - t0
  console.log('LATENCY ' + N + ' vets in ' + ms + 'ms, '
    + (ms / N).toFixed(1) + 'ms/call')
  child.stdin.end()
}
main().then(() => process.exit(0),
  (e) => { console.error(e); process.exit(1) })
EOF

node "$WORK/mcp-drive.js" "$MCP" "$WORK/mcp-schema.aon" \
  "$DIR/data/call-search-ok.json" "$DIR/data/call-http-bad.json" \
  > "$WORK/mcp.out" 2> "$WORK/mcp.err" \
  || { cat "$WORK/mcp.out" "$WORK/mcp.err" >&2; fail "mcp drive failed"; }

has mcp out 'SERVER aontu'
grep '^TOOLS ' "$WORK/mcp.out" | sed 's/^TOOLS //' > "$WORK/mcp-tools.json"
diff -u "$DIR/expected/mcp-tools.json" "$WORK/mcp-tools.json" \
  || fail "MCP tools/list drifted from expected/mcp-tools.json"
has mcp out 'VETSCHEMA ["schema","data"]'
# 2026-08-26: expected/mcp-tools.json refreshed to the twelve-verb
# surface (the MCP completion commit added subsume, breaking, set,
# relations, hash and trim to the original six).
ok "mcp: initialize + tools/list answer the expected twelve tools"

has mcp out 'VET_OK valid isError=false'
has mcp out 'VET_BAD invalid constraint'
ok "mcp: tools/call vet admits the good call, names the bad one's code"

grep '^LATENCY ' "$WORK/mcp.out"
ok "mcp: 100 vet calls answered in one server process (timing above)"

# ----------------------------------------------------------------
# 6. CLI vet latency, cold start included (the per-call price of
# shelling out instead of holding the MCP server open).
N=20
t0=$(node -p 'Date.now()')
for i in $(seq 1 $N); do
  $AONTU vet --at '$.guard.search_docs' "$DIR/guard.aon" \
    "$DIR/data/call-search-ok.json" > /dev/null
done
t1=$(node -p 'Date.now()')
echo "CLI LATENCY: $N vets in $((t1 - t0))ms, $(((t1 - t0) / N))ms/call"
ok "cli: $N cold-start vets timed (timing above)"

echo
echo "all $pass checks passed"

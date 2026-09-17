"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LineCodec = void 0;
exports.parseArgs = parseArgs;
exports.main = main;
const node_fs_1 = require("node:fs");
const mcp_1 = require("./mcp");
const aontu_1 = require("./aontu");
const USAGE = 'aontu mcp - aontu MCP server (stdio, NDJSON JSON-RPC)\n' +
    '\n' +
    '  aontu mcp [--root <dir>]\n' +
    '\n' +
    '  --root <dir>  Serve <name>Path file arguments and resolve\n' +
    '                @"..." includes, confined below <dir>\n' +
    '                (realpath-checked). Without it, served evaluation\n' +
    '                denies every include and refuses path arguments.\n';
function parseArgs(argv) {
    let root;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            return { help: true };
        }
        if ('--root' === arg) {
            const dir = argv[++i];
            if (null == dir || '' === dir) {
                return { err: 'aontu-mcp: --root needs a directory' };
            }
            root = dir;
        }
        else {
            return { err: `aontu-mcp: unknown option ${arg} (try --help)` };
        }
    }
    return { root };
}
// A line-oriented JSON-RPC codec: feed it incoming chunks, and it
// splits lines, dispatches them, and writes replies. Kept
// transport-injectable (write/onExit) so the wiring is unit-testable
// without real stdio, exactly as the LSP's FrameCodec is.
class LineCodec {
    constructor(write, onExit, version, root) {
        this.write = write;
        this.onExit = onExit;
        this.version = version;
        this.root = root;
        this.buffer = '';
    }
    push(chunk) {
        this.buffer += chunk.toString();
        for (;;) {
            const nl = this.buffer.indexOf('\n');
            if (nl < 0) {
                return;
            }
            const line = this.buffer.slice(0, nl).trim();
            this.buffer = this.buffer.slice(nl + 1);
            if ('' !== line) {
                this.line(line);
            }
        }
    }
    end() {
        this.onExit(0);
    }
    line(line) {
        let msg;
        try {
            msg = JSON.parse(line);
        }
        catch {
            this.send((0, mcp_1.parseError)());
            return;
        }
        const out = (0, mcp_1.handle)(msg, this.version, this.root);
        if (null != out) {
            this.send(out);
        }
    }
    send(out) {
        this.write(JSON.stringify(out) + '\n');
    }
}
exports.LineCodec = LineCodec;
// The streams and exit are injectable (defaulting to real stdio) so
// the full wiring is unit-testable. Returns undefined when the
// arguments end the run before a codec exists (--help, a bad option,
// a --root that is not a directory).
function main(stdin = process.stdin, write = (line) => void process.stdout.write(line), exit = (code) => process.exit(code), version = aontu_1.VERSION, argv = process.argv.slice(2), errwrite = (line) => void process.stderr.write(line)) {
    const args = parseArgs(argv);
    if (true === args.help) {
        write(USAGE);
        exit(0);
        return undefined;
    }
    if (null != args.err) {
        errwrite(args.err + '\n');
        exit(2);
        return undefined;
    }
    let root;
    if (null != args.root) {
        try {
            root = (0, node_fs_1.realpathSync)(args.root);
            if (!(0, node_fs_1.statSync)(root).isDirectory()) {
                throw new Error('not a directory');
            }
        }
        catch {
            errwrite(`aontu-mcp: --root ${args.root} is not a directory\n`);
            exit(2);
            return undefined;
        }
    }
    const codec = new LineCodec(write, exit, version, root);
    stdin.on('data', (chunk) => codec.push(chunk));
    stdin.on('end', () => codec.end());
    return codec;
} /* node:coverage ignore next 11 */
//# sourceMappingURL=mcp-server.js.map
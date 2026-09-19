"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// The port mirrors TypeScript's STRUCTURE (ADR-001 rule 1), which no
// shared row can check: a shape difference answers the same bytes, so
// every row passes. A member with no twin is declared below and
// registered in DIVERGENCE.md; adding one to a port fails the build.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const REPO = Path.join(__dirname, '..', '..');
const WHY_POSITION = 'a position is spelled as a row and column in TypeScript and as a ' +
    'byte offset in Go (DIVERGENCE.md, "A value\'s source position")';
const SHAPES = [
    {
        what: 'a value\'s source site',
        ts: { file: 'ts/src/site.ts', open: /^class Site \{$/ },
        go: { file: 'go/val.go', open: /^type site struct \{$/ },
        both: ['url', 'src', 'via'],
        tsOnly: { row: WHY_POSITION, col: WHY_POSITION, len: WHY_POSITION },
        goOnly: {
            sp: WHY_POSITION,
            spu: 'Go marks a position a clone carried; TypeScript does not',
        },
    },
    {
        what: 'the use a value arrived through (ALIASES.0.md A-1)',
        ts: { file: 'ts/src/site.ts', open: /^type ViaSite = \{$/ },
        go: { file: 'go/val.go', open: /^type viaSite struct \{$/ },
        both: ['url', 'name'],
        tsOnly: { row: WHY_POSITION, col: WHY_POSITION, src: WHY_POSITION },
        goOnly: { sp: WHY_POSITION },
    },
];
// Declared members only: a TypeScript class stops at its constructor,
// which assigns what the declarations above already named.
function members(file, open) {
    const abs = Path.join(REPO, file);
    const lines = Fs.readFileSync(abs, 'utf8').split('\n');
    const at = lines.findIndex((l) => open.test(l.trim()));
    Assert.notEqual(at, -1, `no declaration matching ${open} in ${file}`);
    const out = [];
    for (let i = at + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if ('}' === line || '};' === line || line.startsWith('constructor')) {
            break;
        }
        // `row: number`, `row?: ViaSite` and `url string` all count.
        for (const m of line.matchAll(/(?:^|,\s*)([A-Za-z_]\w*)\s*\??\s*[:\s]/g)) {
            if (!line.startsWith('//')) {
                out.push(m[1]);
            }
        }
    }
    return out;
}
(0, node_test_1.describe)('parity-structure', () => {
    for (const shape of SHAPES) {
        (0, node_test_1.test)(`${shape.what} is one shape in both ports`, () => {
            const ts = members(shape.ts.file, shape.ts.open);
            const go = members(shape.go.file, shape.go.open);
            Assert.ok(0 < ts.length, `read no members from ${shape.ts.file}`);
            Assert.ok(0 < go.length, `read no members from ${shape.go.file}`);
            const declared = (side, both, only) => [...side].sort().filter((m) => !both.includes(m) && !only.includes(m));
            // Neither shared nor declared port-only is drift.
            Assert.deepEqual(declared(ts, shape.both, Object.keys(shape.tsOnly)), [], `${shape.ts.file} has members ${shape.go.file} does not, and this` +
                ' gate does not declare them. Mirror them in the port, or declare' +
                ' them here and register the divergence in DIVERGENCE.md.');
            Assert.deepEqual(declared(go, shape.both, Object.keys(shape.goOnly)), [], `${shape.go.file} has members ${shape.ts.file} does not, and this` +
                ' gate does not declare them. Mirror them in the port, or declare' +
                ' them here and register the divergence in DIVERGENCE.md.');
            // A claimed member must be there, or the gate passes vacuously.
            for (const m of shape.both) {
                Assert.ok(ts.includes(m), `${shape.ts.file} has no member ${m}`);
                Assert.ok(go.includes(m), `${shape.go.file} has no member ${m}`);
            }
            for (const m of Object.keys(shape.tsOnly)) {
                Assert.ok(ts.includes(m), `${shape.ts.file} has no member ${m}: drop it from tsOnly`);
            }
            for (const m of Object.keys(shape.goOnly)) {
                Assert.ok(go.includes(m), `${shape.go.file} has no member ${m}: drop it from goOnly`);
            }
        });
    }
    // A reader who finds a declaration must find the entry deciding it.
    (0, node_test_1.test)('every-declared-divergence-is-in-the-ledger', () => {
        const ledger = Fs.readFileSync(Path.join(REPO, 'DIVERGENCE.md'), 'utf8');
        const missing = [];
        for (const shape of SHAPES) {
            const why = [
                ...Object.values(shape.tsOnly), ...Object.values(shape.goOnly),
            ];
            for (const reason of [...new Set(why)]) {
                const cited = /DIVERGENCE\.md, "([^"]+)"/.exec(reason);
                if (null == cited) {
                    continue;
                }
                if (!ledger.includes(cited[1])) {
                    missing.push(cited[1]);
                }
            }
        }
        Assert.deepEqual(missing, [], 'this gate declares a divergence whose DIVERGENCE.md entry is not' +
            ' there:\n' + missing.join('\n'));
    });
});
//# sourceMappingURL=parity.test.js.map
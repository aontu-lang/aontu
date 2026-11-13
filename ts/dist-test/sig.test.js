"use strict";
/* Copyright (c) 2021-2026 Richard Rodger, MIT License */
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
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const node_test_1 = require("node:test");
const expect_1 = require("./expect");
const sig_1 = require("../dist/sig");
const sigdecl_1 = require("../dist/sigdecl");
const lsp_1 = require("../dist/lsp");
const SHARED = Path.join(__dirname, '..', '..', 'test', 'spec', 'signature.tsv');
(0, node_test_1.describe)('sig', () => {
    (0, node_test_1.test)('sigdecl-is-the-shared-declaration', () => {
        const norm = (s) => s.replace(/\r\n/g, '\n');
        const shared = Fs.readFileSync(SHARED, 'utf8');
        (0, expect_1.expect)(norm(sigdecl_1.SIGDECL)).equal(norm(shared));
    });
    (0, node_test_1.test)('every-declaration-line-round-trips', () => {
        for (const rawline of sigdecl_1.SIGDECL.split('\n')) {
            const line = rawline.trim();
            if ('' === line || line.startsWith('#')) {
                continue;
            }
            const sig = (0, sig_1.parseSigLine)(line);
            (0, expect_1.expect)((0, sig_1.renderSig)(sig)).equal(line);
        }
    });
    (0, node_test_1.test)('declared-names-are-the-builtin-names', () => {
        const reg = (0, sig_1.parseSigText)(sigdecl_1.SIGDECL);
        const declared = Object.keys(reg).sort();
        const builtin = [...lsp_1.BUILTIN_FUNCS].sort();
        (0, expect_1.expect)(declared).equal(builtin);
    });
    (0, node_test_1.test)('canon-calls-are-declared-builtins', () => {
        const declared = (0, sig_1.parseSigText)(sigdecl_1.SIGDECL);
        const dir = Path.dirname(SHARED);
        const undeclared = [];
        let rows = 0;
        for (const file of Fs.readdirSync(dir).filter((f) => f.endsWith('.tsv')).sort()) {
            for (const line of Fs.readFileSync(Path.join(dir, file), 'utf8').split('\n')) {
                const cols = line.split('\t');
                if (line.startsWith('#') || ('canon' !== cols[1] && 'hcanon' !== cols[1])) {
                    continue;
                }
                rows++;
                const text = cols[3].replace(/"(?:[^"\\]|\\.)*"/g, '""');
                for (const m of text.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(/g)) {
                    if (!(m[1] in declared)) {
                        undeclared.push(file + ':' + cols[0] + ' writes ' + m[1] + '(');
                    }
                }
            }
        }
        (0, expect_1.expect)(0 < rows).equal(true);
        (0, expect_1.expect)(undeclared).equal([]);
    });
    (0, node_test_1.test)('malformed-declarations-are-errors', () => {
        const bad = [
            '',
            'upper',
            'upper(s: string)',
            'upper(bogus s: string) : string',
            'upper(s: string) : string trailing',
        ];
        for (const line of bad) {
            (0, expect_1.expect)(() => (0, sig_1.parseSigLine)(line)).throw();
        }
        (0, expect_1.expect)(() => (0, sig_1.parseSigText)('upper(s: string) : string\nupper(s: string) : string\n')).throw();
    });
});
//# sourceMappingURL=sig.test.js.map
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
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const formatgrammars_1 = require("../dist/formatgrammars");
const formatgrammar_1 = require("../dist/formatgrammar");
const aontu_1 = require("../dist/aontu");
const DIR = Path.join(__dirname, '..', '..', 'grammar', 'format');
(0, node_test_1.describe)('formatgrammar', () => {
    (0, node_test_1.test)('the staged copies are the committed grammars', () => {
        const read = (at) => Fs.readFileSync(at, 'utf8').replaceAll('\r\n', '\n');
        const want = new Map();
        let lib = [];
        for (const e of Fs.readdirSync(DIR, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
            if (e.isFile()) {
                want.set(e.name.slice(0, -5), [read(Path.join(DIR, e.name))]);
                continue;
            }
            const main = e.name + '.abnf';
            const names = Fs.readdirSync(Path.join(DIR, e.name)).sort((a, b) => a === main ? -1 : b === main ? 1 : a < b ? -1 : 1);
            const texts = names.map((n) => read(Path.join(DIR, e.name, n)));
            if ('lib' === e.name) {
                lib = texts;
            }
            else {
                want.set(e.name, texts);
            }
        }
        Assert.deepEqual([...formatgrammars_1.FORMAT_GRAMMARS.keys()], [...want.keys()]);
        for (const [name, texts] of want) {
            Assert.deepEqual(formatgrammars_1.FORMAT_GRAMMARS.get(name), texts, name + ' is stale: run `make formats`');
        }
        Assert.equal(formatgrammars_1.FORMAT_LIBRARY, lib.join('\n'), 'lib/ is stale: run `make formats`');
    });
    (0, node_test_1.test)('every committed grammar passes the determinism check', () => {
        for (const [name, texts] of formatgrammars_1.FORMAT_GRAMMARS) {
            for (const text of texts) {
                const [g, code, why] = (0, formatgrammar_1.readGrammar)(text, true);
                Assert.ok(undefined !== g, name + ': ' + code + ' ' + why);
            }
            Assert.equal((0, formatgrammar_1.formatOf)(name)[0]?.gs?.length, texts.length);
        }
    });
    (0, node_test_1.test)('a grammar is read once', () => {
        Assert.equal((0, formatgrammar_1.readGrammar)('v = "a"'), (0, formatgrammar_1.readGrammar)('v = "a"'));
    });
    (0, node_test_1.test)('the step bound refuses a string too long for it', () => {
        const [g] = (0, formatgrammar_1.readGrammar)('v = *"a"');
        Assert.equal((0, formatgrammar_1.recognise)(g, 'a'.repeat(formatgrammar_1.FORMAT_STEP_MAX)), undefined);
        Assert.equal((0, formatgrammar_1.recognise)(g, 'a'.repeat(1000)), -1);
    });
    (0, node_test_1.test)('a string past the step bound is refused, never admitted', () => {
        const a = new aontu_1.Aontu({});
        const src = 'a: format("v = *\\"a\\"") & "' + 'a'.repeat(formatgrammar_1.FORMAT_STEP_MAX) + '"';
        Assert.throws(() => a.generate(src, undefined, a.ctx()), (e) => 'parse_failed' === e.errs()[0].why &&
            String(e.errs()[0].msg).includes('format v: the step bound of 1000000 is reached'));
    });
});
//# sourceMappingURL=formatgrammar.test.js.map
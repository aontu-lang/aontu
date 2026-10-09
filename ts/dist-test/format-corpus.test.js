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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The format corpora of test/vectors/README.md. Each run counts the cases
// that agree with the corpus and, for each kind of difference, the cases
// of that kind, and requires the counts: a grammar change that moves one
// fails here, and a difference of no named kind fails as a kind of its own.
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const formatgrammar_1 = require("../dist/formatgrammar");
const VECTORS = Path.join(__dirname, '..', '..', 'test', 'vectors');
// Where the first of a format's grammars that refuses the text stops, or -1.
function stop(name, text) {
    for (const g of (0, formatgrammar_1.formatOf)(name)[0]?.gs ?? []) {
        const at = (0, formatgrammar_1.recognise)(g, text);
        node_assert_1.default.notEqual(at, undefined, name + ' reached the step bound on ' + JSON.stringify(text));
        if (-1 !== at) {
            return at;
        }
    }
    return -1;
}
function counter() {
    const counts = {};
    return [counts, (k) => { counts[k] = (counts[k] ?? 0) + 1; }];
}
// RFC 6570's grammar admits a reserved operator (section 2.2) and a
// prefix on a list or a map (section 2.4.1); expansion refuses both.
function expansionOnly(template, variables) {
    if (/\{[=,!@|]/.test(template)) {
        return 'a reserved operator';
    }
    const m = /\{[+#./;?&]?([^:}]+):[0-9]+\}/.exec(template);
    const v = null == m ? undefined : variables[m[1]];
    return null != v && 'object' === typeof v ? 'a prefix on a list or a map' : 'admitted, though invalid';
}
(0, node_test_1.test)('uritemplate-test-against-uri-template', () => {
    const [counts, count] = counter();
    for (const file of ['spec-examples.json', 'extended-tests.json', 'negative-tests.json']) {
        const groups = JSON.parse(Fs.readFileSync(Path.join(VECTORS, 'uritemplate-test', file), 'utf8'));
        for (const g of Object.values(groups)) {
            for (const [template, expansion] of g.testcases) {
                const valid = false !== expansion;
                const admitted = -1 === stop('uri-template', template);
                count(file + ': ' + (valid === admitted ? 'agrees' :
                    admitted ? expansionOnly(template, g.variables) : 'refused, though valid'));
            }
        }
    }
    node_assert_1.default.deepStrictEqual(counts, {
        'spec-examples.json: agrees': 64,
        'extended-tests.json: agrees': 53,
        'negative-tests.json: agrees': 31,
        'negative-tests.json: a reserved operator': 3,
        'negative-tests.json: a prefix on a list or a map': 2,
    });
});
// The file writes a control character as its control picture.
function xmlText(s) {
    return s.replace(/&#x([0-9A-Fa-f]+);/g, (_m, h) => {
        const c = parseInt(h, 16);
        return String.fromCodePoint(0x2400 <= c && c < 0x2420 ? c - 0x2400 : c);
    }).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&apos;/g, '\'').replace(/&amp;/g, '&');
}
// The categories whose addresses RFC 5321's Mailbox admits.
const ISEMAIL_VALID = ['ISEMAIL_VALID_CATEGORY', 'ISEMAIL_DNSWARN', 'ISEMAIL_RFC5321'];
(0, node_test_1.test)('isemail-against-email-and-idn-email', () => {
    const xml = Fs.readFileSync(Path.join(VECTORS, 'isemail', 'tests.xml'), 'utf8');
    const [counts, count] = counter();
    for (const m of xml.matchAll(/<test id="[0-9]+">([\s\S]*?)<\/test>/g)) {
        const field = (tag) => xmlText(new RegExp('<' + tag + '>([^<]*)</' + tag + '>').exec(m[1])?.[1] ?? '');
        const valid = ISEMAIL_VALID.includes(field('category'));
        for (const name of ['email', 'idn-email']) {
            const admitted = -1 === stop(name, field('address'));
            count(name + ': ' + (valid === admitted ? 'agrees' :
                admitted && field('diagnosis').endsWith('TOOLONG') ? 'a size limit' : 'unexplained'));
        }
    }
    node_assert_1.default.deepStrictEqual(counts, {
        'email: agrees': 157,
        'email: a size limit': 7,
        'idn-email: agrees': 157,
        'idn-email: a size limit': 7,
    });
});
// Each kind of difference UTS 46's toASCII and idn-hostname may have.
function idnaDifference(cps, at, status) {
    const past = (c) => undefined !== c && 0x7f < c.codePointAt(0);
    if (-1 === at) {
        return /^\[A4_[12](, A4_[12])*\]$/.test(status) && cps.some(past) ?
            'the A-label form of a U-label too long' : 'admitted, though invalid';
    }
    return past(cps[at]) ? 'a code point past IDNA2008, or mapped to several' :
        '̸' === cps[at + 1] ? 'a character normalisation composes' : 'refused, though valid';
}
(0, node_test_1.test)('idnatestv2-against-idn-hostname', () => {
    const text = Fs.readFileSync(Path.join(VECTORS, 'idna', 'IdnaTestV2.txt'), 'utf8')
        .replaceAll('\r\n', '\n');
    node_assert_1.default.ok(text.includes('\n# Version: 18.0.0\n'), 'IdnaTestV2.txt is not Unicode 18.0.0\'s');
    const [counts, count] = counter();
    for (const line of text.split('\n')) {
        if ('' === line.trim() || line.startsWith('#')) {
            continue;
        }
        const cols = line.split(';').map((c) => c.trim());
        if (/\\u[Dd][89A-Fa-f]/.test(cols[0])) {
            count('ill-formed, not read');
            continue;
        }
        const source = '""' === cols[0] ? '' :
            cols[0].replace(/\\u([0-9A-Fa-f]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
        if (/xn--/i.test(source)) {
            count('an A-label, not read');
            continue;
        }
        const status = '' === cols[4] ? cols[2] : cols[4];
        const at = stop('idn-hostname', source);
        count(('' === status || '[]' === status) === (-1 === at) ? 'agrees' :
            idnaDifference([...source], at, status));
    }
    node_assert_1.default.deepStrictEqual(counts, {
        'ill-formed, not read': 2,
        'an A-label, not read': 2384,
        agrees: 3840,
        'a code point past IDNA2008, or mapped to several': 102,
        'a character normalisation composes': 40,
        'the A-label form of a U-label too long': 28,
    });
});
//# sourceMappingURL=format-corpus.test.js.map
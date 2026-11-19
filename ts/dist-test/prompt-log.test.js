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
// The log merges with git's union driver, which writes a line once when
// both branches add it at the same place. Entries that end alike can
// lose a closing fence, and entries that begin alike can be woven into
// one, a heading left with no prompt under it. Each entry is checked
// here so that a broken merge fails on its branch.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const LOG = Path.join(__dirname, '..', '..', 'sketch', 'PROMPT-LOG.md');
const HEADING = /^## \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC · /;
const OPENING = /^(`{3,})/;
function entries(md) {
    const found = [];
    const lines = md.split('\n');
    let entry = null;
    let fence = null;
    for (let index = 0; index < lines.length; index++) {
        const text = lines[index];
        if (HEADING.test(text)) {
            if (null != entry && null != fence) {
                entry.unclosed = true;
            }
            fence = null;
            entry = { heading: text.slice(3), line: index + 1, blocks: 0, unclosed: false };
            found.push(entry);
        }
        else if (null == fence) {
            const opening = OPENING.exec(text);
            if (null != opening && null != entry) {
                fence = opening[1];
                entry.blocks++;
            }
        }
        else if (text.trimEnd() === fence) {
            fence = null;
        }
    }
    if (null != entry && null != fence) {
        entry.unclosed = true;
    }
    return found;
}
(0, node_test_1.describe)('prompt-log', () => {
    (0, node_test_1.test)('every-entry-holds-one-closed-fence', () => {
        const all = entries(Fs.readFileSync(LOG, 'utf8'));
        Assert.ok(all.length > 0, 'no entries read from sketch/PROMPT-LOG.md');
        const broken = all
            .filter((e) => e.unclosed || 1 !== e.blocks)
            .map((e) => `line ${e.line}: ${e.heading} (`
            + (e.unclosed ? 'fence left open' : `${e.blocks} fenced blocks`) + ')');
        Assert.deepEqual(broken, [], 'Each entry is a heading and one fenced prompt, closed before the '
            + 'next heading. Restore a damaged entry from the last commit that '
            + 'held it whole (DEV-PROCESS.md, "The prompt log").');
    });
    (0, node_test_1.test)('the-check-finds-each-damage', () => {
        const head = (t) => `## 2026-11-19 10:00:0${t} UTC · Claude Code · s`;
        const closed = [head('1'), '', '```text', 'a', '```', ''].join('\n');
        Assert.deepEqual(entries(closed).map((e) => [e.blocks, e.unclosed]), [[1, false]]);
        const open = [head('1'), '', '```text', 'a', '', head('2'), '', '```text', 'b', '```'].join('\n');
        Assert.deepEqual(entries(open).map((e) => [e.blocks, e.unclosed]), [[1, true], [1, false]]);
        const woven = [head('1'), head('2'), '', '```text', 'a', '```'].join('\n');
        Assert.deepEqual(entries(woven).map((e) => e.blocks), [0, 1]);
        const longer = [head('1'), '', '````text', '```', 'a', '```', '````'].join('\n');
        Assert.deepEqual(entries(longer).map((e) => [e.blocks, e.unclosed]), [[1, false]]);
        const last = [head('1'), '', '```text', 'a'].join('\n');
        Assert.deepEqual(entries(last).map((e) => e.unclosed), [true]);
    });
});
//# sourceMappingURL=prompt-log.test.js.map
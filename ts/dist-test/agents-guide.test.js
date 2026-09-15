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
// AGENTS.md is an index, not the manual. The cap is the enforcement:
// without it the file reaccumulates the detail that belongs in
// docs/contributing/, and an agent reads a manual instead of a map.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const REPO = Path.join(__dirname, '..', '..');
const CAP = 1200;
// Whitespace-separated tokens, the `wc -w` count, so the number a
// contributor checks by hand is the number that fails the build.
function words(md) {
    return md.split(/\s+/).filter((w) => '' !== w).length;
}
(0, node_test_1.describe)('agents-guide', () => {
    (0, node_test_1.test)('agents-md-is-within-the-word-cap', () => {
        const md = Fs.readFileSync(Path.join(REPO, 'AGENTS.md'), 'utf8');
        const count = words(md);
        Assert.ok(count <= CAP, `AGENTS.md is ${count} words, over the ${CAP}-word cap by `
            + `${count - CAP}. It is an index: move the detail into `
            + 'docs/contributing/ and link it.');
    });
    (0, node_test_1.test)('claude-md-is-the-same-file', () => {
        const claude = Path.join(REPO, 'CLAUDE.md');
        Assert.ok(Fs.lstatSync(claude).isSymbolicLink(), 'CLAUDE.md must be a symlink to AGENTS.md, not a second copy');
        Assert.equal(Fs.readlinkSync(claude), 'AGENTS.md');
    });
    (0, node_test_1.test)('every-link-resolves', () => {
        const md = Fs.readFileSync(Path.join(REPO, 'AGENTS.md'), 'utf8');
        let checked = 0;
        for (const m of md.matchAll(/\]\(([^)]+)\)/g)) {
            const target = m[1];
            if (target.startsWith('http') || target.startsWith('#')) {
                continue;
            }
            const path = Path.join(REPO, target.split('#')[0]);
            Assert.ok(Fs.existsSync(path), `AGENTS.md links to ${target}`);
            checked++;
        }
        Assert.ok(0 < checked, 'no links checked');
    });
});
//# sourceMappingURL=agents-guide.test.js.map
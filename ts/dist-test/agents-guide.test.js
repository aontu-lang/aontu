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
        const target = Fs.lstatSync(claude).isSymbolicLink() ?
            Fs.readlinkSync(claude) :
            Fs.readFileSync(claude, 'utf8').trim();
        Assert.equal(target, 'AGENTS.md', 'CLAUDE.md must be a link to AGENTS.md, not a second copy. A '
            + 'checkout without symlink support writes the target as the '
            + 'contents, which is still one file and passes here.');
    });
    (0, node_test_1.test)('every-link-resolves', () => {
        const dir = Path.join(REPO, 'docs', 'contributing');
        const pages = [['AGENTS.md', REPO]].concat(Fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
            .map((f) => [Path.join('docs', 'contributing', f), dir]));
        let checked = 0;
        for (const [file, from] of pages) {
            const md = Fs.readFileSync(Path.join(REPO, file), 'utf8');
            for (const m of md.matchAll(/\]\(([^)]+)\)/g)) {
                const target = m[1];
                if (target.startsWith('http') || target.startsWith('#')) {
                    continue;
                }
                const [rel, anchor] = target.split('#');
                const path = Path.join(from, rel);
                Assert.ok(Fs.existsSync(path), `${file} links to ${target}`);
                if (null != anchor && '' !== anchor) {
                    const slugs = [...Fs.readFileSync(path, 'utf8')
                            .matchAll(/^#+\s+(.*)$/gm)]
                        .map((h) => h[1].toLowerCase().replace(/[^a-z0-9 -]/g, '')
                        .trim().replace(/ /g, '-'));
                    Assert.ok(slugs.includes(anchor), `${file} links to ${target}, and that heading is not there`);
                }
                checked++;
            }
        }
        Assert.ok(20 < checked, `only ${checked} links checked`);
    });
});
//# sourceMappingURL=agents-guide.test.js.map
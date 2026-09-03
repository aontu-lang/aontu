"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
// EVERY NODE BUILTIN IS IMPORTED AS `node:<name>`, never bare.
//
// The two spellings are the same module to Node and NOT the same
// specifier to a bundler. `src/view.ts` imported bare `'path'` — the
// only file in the tree that did — and the engine went on working
// everywhere Node resolves it, so nothing here noticed. What noticed
// was aontu-lang/web: its playground bundles the engine for the
// browser with esbuild, aliasing `node:path`, `node:fs`, `node:crypto`
// and `node:util` to shims, and a bare `'path'` misses every alias.
// The site's build failed with `Could not resolve "path"` on the first
// release that shipped the view verb.
//
// A downstream build failure is a poor detector for a one-word typo,
// so the rule is asserted here instead: the tree has one spelling.
const node_test_1 = require("node:test");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_module_1 = require("node:module");
const expect_1 = require("./expect");
// At runtime __dirname is dist-test/, so one level up is ts/.
const SRC = (0, node_path_1.join)(__dirname, '..', 'src');
const BUILTIN = new Set(node_module_1.builtinModules);
function sources(dir) {
    const out = [];
    for (const name of (0, node_fs_1.readdirSync)(dir).sort()) {
        const full = (0, node_path_1.join)(dir, name);
        if ((0, node_fs_1.statSync)(full).isDirectory()) {
            out.push(...sources(full));
        }
        else if (name.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out;
}
(0, node_test_1.describe)('imports', () => {
    (0, node_test_1.test)('every-node-builtin-carries-the-node-prefix', () => {
        const bare = [];
        let checked = 0;
        for (const file of sources(SRC)) {
            const text = (0, node_fs_1.readFileSync)(file, 'utf8');
            const re = /(?:from|require\()\s*['"]([^'"]+)['"]/g;
            let m;
            while (null != (m = re.exec(text))) {
                checked++;
                const spec = m[1];
                if (BUILTIN.has(spec)) {
                    const line = text.slice(0, m.index).split('\n').length;
                    bare.push(`${file.slice(SRC.length + 1)}:${line} ${spec}` +
                        ` (write 'node:${spec}')`);
                }
            }
        }
        (0, expect_1.expect)(bare).equal([]);
        // The walk silently matching nothing would make the assertion
        // vacuous, so the specifier count is asserted too.
        (0, expect_1.expect)(100 < checked).equal(true);
    });
});
//# sourceMappingURL=imports.test.js.map
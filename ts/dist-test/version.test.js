"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const expect_1 = require("./expect");
const __1 = require("..");
(0, node_test_1.describe)('version', () => {
    (0, node_test_1.test)('matches package.json', () => {
        // At runtime __dirname is dist-test/, so one level up is ts/.
        const pkg = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '..', 'package.json'), 'utf8'));
        (0, expect_1.expect)(__1.VERSION).equal(pkg.version);
    });
    (0, node_test_1.test)('is a plain semver triple', () => {
        (0, expect_1.expect)(/^\d+\.\d+\.\d+$/.test(__1.VERSION)).equal(true);
    });
    // ADR-041: one number names a release, so this reads the other port's
    // literal.
    (0, node_test_1.test)('matches the Go module', () => {
        const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '..', '..', 'go', 'aontu.go'), 'utf8');
        const found = /^const VERSION = "([^"]*)"/m.exec(src);
        (0, expect_1.expect)(null != found).equal(true);
        (0, expect_1.expect)(__1.VERSION).equal(found?.[1]);
    });
});
//# sourceMappingURL=version.test.js.map
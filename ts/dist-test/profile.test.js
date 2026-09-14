"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const profile_1 = require("../dist/profile");
(0, node_test_1.describe)('load-profile', () => {
    // The options are optional: `loadProfile(src)` alone reads the
    // document under the defaults, which is how an embedder calls it.
    (0, node_test_1.test)('load-profile-takes-no-options-and-fills-the-defaults', () => {
        const loaded = (0, profile_1.loadProfile)('aontu: Lang: lang: "text"');
        node_assert_1.default.strictEqual(loaded.errors, undefined);
        node_assert_1.default.strictEqual(loaded.profile.lang, 'text');
        node_assert_1.default.deepStrictEqual(loaded.profile.indent, { unit: ' ', width: 2 });
        node_assert_1.default.strictEqual(loaded.profile.template, undefined);
    });
    (0, node_test_1.test)('a-profile-that-does-not-stand-up-is-refused', () => {
        for (const [src, code, path] of [
            ['a: ]', 'syntax', '$'],
            ['nil', 'literal_nil', '$'],
            ['aontu: Lang: lang: 1', 'constraint', '$.aontu.Lang.lang'],
            ['x: 1', 'mapval_required', '$.aontu.Lang.lang'],
        ]) {
            const refused = (0, profile_1.loadProfile)(src);
            node_assert_1.default.strictEqual(refused.profile, undefined, src);
            node_assert_1.default.strictEqual(refused.errors?.[0].code, code, src);
            node_assert_1.default.strictEqual(refused.errors?.[0].path, path, src);
        }
    });
    // THE LOWERING HALF IS NOT HERE (ADR-038). `lowering`, `str`,
    // `ident`, `types` and `banner` were the renderer's, and the
    // vocabulary is closed, so each is an unknown key now.
    (0, node_test_1.test)('the-lowering-keys-are-unknown', () => {
        for (const key of ['lowering: "go"', 'str: { quote: "\'" }',
            'ident: { chars: "ascii-word" }', 'types: { prim: {} }', 'banner: "x"']) {
            const refused = (0, profile_1.loadProfile)('aontu: Lang: { lang: "go", ' + key + ' }');
            node_assert_1.default.strictEqual(refused.profile, undefined, key);
            node_assert_1.default.strictEqual(refused.errors?.[0].code, 'closed', key);
        }
    });
    (0, node_test_1.test)('the-template-block-is-what-survives', () => {
        const loaded = (0, profile_1.loadProfile)('aontu: Lang: { lang: "ocaml", template: ' +
            '{ marker: "(*-", close: "*)", ext: ["ml", "mli"] } }');
        node_assert_1.default.strictEqual(loaded.errors, undefined);
        node_assert_1.default.deepStrictEqual(loaded.profile.template, { marker: '(*-', close: '*)', ext: ['ml', 'mli'] });
    });
});
//# sourceMappingURL=profile.test.js.map
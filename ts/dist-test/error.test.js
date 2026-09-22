"use strict";
/* Copyright (c) 2020-2023 Richard Rodger and other contributors, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const expect_1 = require("./expect");
const aontu_1 = require("../dist/aontu");
const err_1 = require("../dist/err");
(0, node_test_1.describe)('error', function () {
    (0, node_test_1.it)('syntax', () => {
        let a0 = new aontu_1.Aontu();
        let v0 = a0.parse('a::1', { collect: true });
        (0, expect_1.expect)(v0?.err[0].why).equal('syntax');
        let v1 = a0.unify('a::1', { collect: true });
        (0, expect_1.expect)(v1?.err[0].why).equal('syntax');
        let err = [];
        let v2 = a0.generate('a::1', { err });
        (0, expect_1.expect)(v2).equal(undefined);
        (0, expect_1.expect)(err[0].why).equal('syntax');
        (0, expect_1.expect)(() => a0.parse('a::1')).throws(/syntax/);
        (0, expect_1.expect)(() => a0.unify('a::1')).throws(/syntax/);
        (0, expect_1.expect)(() => a0.generate('a::1')).throws(/syntax/);
        try {
            a0.generate('a:"x');
        }
        catch (e) {
            (0, expect_1.expect)(e.name).equal('AontuError');
            (0, expect_1.expect)(e instanceof err_1.AontuError).equal(true);
        }
    });
    (0, node_test_1.it)('unify', () => {
        let a0 = new aontu_1.Aontu();
        let v0 = a0.unify('a:1,a:2', { collect: true });
        (0, expect_1.expect)(v0.err[0].why).equal('scalar_value');
        (0, expect_1.expect)(typeof v0.err[0].msg).equal('string');
    });
    (0, node_test_1.it)('file-e01', async () => {
        let a0 = new aontu_1.Aontu();
        let v0 = a0.unify('@"' + __dirname + '/../test/error/e01.aontu"', { collect: true });
        (0, expect_1.expect)(v0.err[0].why).equal('scalar_value');
        (0, expect_1.expect)(typeof v0.err[0].msg).equal('string');
    });
    (0, node_test_1.it)('generate', () => {
        let aontu = new aontu_1.Aontu();
        (0, expect_1.expect)(() => aontu.generate('a:$.b')).throw(/no_path/);
        (0, expect_1.expect)(() => aontu.generate('@"' + __dirname + '/../test/error/e02.aontu"'))
            .throw(/no_path/);
    });
    (0, node_test_1.it)('required', () => {
        let a0 = new aontu_1.Aontu();
        (0, expect_1.expect)(a0.generate('a:string a:A')).equal({ a: 'A' });
        (0, expect_1.expect)(() => a0.generate('a:string')).throws(/mapval_no_gen/);
        (0, expect_1.expect)(() => a0.generate('a:string a:1')).throws(/no_scalar_unify/);
        (0, expect_1.expect)(a0.generate('x:&:s:string x:a:s:S')).equal({ x: { a: { s: 'S' } } });
        (0, expect_1.expect)(() => a0.generate('x:&:s:string x:a:s:1')).throws(/no_scalar_unify/);
        (0, expect_1.expect)(() => a0.generate('x:&:s:string x:a:{}')).throws(/mapval_spread_required/);
        (0, expect_1.expect)(a0.generate('x:[&:s:string] x:[{s:S}]')).equal({ x: [{ s: 'S' }] });
        (0, expect_1.expect)(() => a0.generate('x:[&:s:string] x:[{s:1}]')).throws(/no_scalar_unify/);
        // NOT: map inside list!
        (0, expect_1.expect)(() => a0.generate('x:[&:s:string] x:[{}]')).throws(/mapval_spread_required/);
        (0, expect_1.expect)(a0.generate('x:&:&:s:string x:a:b:s:S'))
            .equal({ x: { a: { b: { s: 'S' } } } });
    });
    (0, node_test_1.it)('error-source-inline', () => {
        // Inline source: error message should show the actual source text,
        // not SOURCE-NOT-FOUND.
        let a0 = new aontu_1.Aontu();
        let v0 = a0.unify('a:1,a:2', { collect: true });
        (0, expect_1.expect)(v0.err[0].why).equal('scalar_value');
        (0, expect_1.expect)(v0.err[0].msg).to.not.contain('SOURCE-NOT-FOUND');
        (0, expect_1.expect)(v0.err[0].msg).to.contain('a:1,a:2');
    });
    (0, node_test_1.it)('error-source-inline-no-fs', () => {
        // Inline source without fs: should still show the source text
        // via errctx.src fallback.
        let a0 = new aontu_1.Aontu();
        let v0 = a0.unify('x:1,x:2', { collect: true });
        (0, expect_1.expect)(v0.err[0].why).equal('scalar_value');
        (0, expect_1.expect)(v0.err[0].msg).to.not.contain('SOURCE-NOT-FOUND');
        (0, expect_1.expect)(v0.err[0].msg).to.not.contain('NO-FS');
        (0, expect_1.expect)(v0.err[0].msg).to.contain('x:1,x:2');
    });
    (0, node_test_1.it)('error-source-inline-with-fs', () => {
        // Inline source with fs provided: fs cannot read a directory,
        // so should fall back to errctx.src.
        let a0 = new aontu_1.Aontu({ fs: node_fs_1.default, path: process.cwd() });
        let v0 = a0.unify('b:1,b:2', { collect: true });
        (0, expect_1.expect)(v0.err[0].why).equal('scalar_value');
        (0, expect_1.expect)(v0.err[0].msg).to.not.contain('SOURCE-NOT-FOUND');
        (0, expect_1.expect)(v0.err[0].msg).to.contain('b:1,b:2');
    });
    (0, node_test_1.it)('error-source-file', () => {
        let a0 = new aontu_1.Aontu({ fs: node_fs_1.default });
        let v0 = a0.unify('@"' + __dirname + '/../test/error/e01.aontu"', { collect: true });
        (0, expect_1.expect)(v0.err[0].why).equal('scalar_value');
        (0, expect_1.expect)(v0.err[0].msg).to.not.contain('SOURCE-NOT-FOUND');
        // e01.aontu contains "a: 1\na: 2\n" — error should show the file content
        (0, expect_1.expect)(v0.err[0].msg).to.contain('a: 1');
        (0, expect_1.expect)(v0.err[0].msg).to.contain('a: 2');
    });
    (0, node_test_1.it)('error-source-file-cross', () => {
        // Cross-file error: e03.aontu imports e04.aontu, conflicting on key a.
        // Error message should show file content, not SOURCE-NOT-FOUND.
        // The raw `__dirname` is deliberate — see the case above.
        let a0 = new aontu_1.Aontu({ fs: node_fs_1.default });
        let v0 = a0.unify('@"' + __dirname + '/../test/error/e03.aontu"', { collect: true });
        (0, expect_1.expect)(v0.err[0].why).equal('scalar_value');
        (0, expect_1.expect)(v0.err[0].msg).to.not.contain('SOURCE-NOT-FOUND');
    });
    (0, node_test_1.it)('error-source-generate-inline', () => {
        // Generate with inline source: thrown error should contain source text.
        let a0 = new aontu_1.Aontu();
        try {
            a0.generate('a:1,a:2');
            throw new Error('should have thrown');
        }
        catch (e) {
            (0, expect_1.expect)(e instanceof err_1.AontuError).equal(true);
            (0, expect_1.expect)(e.message).to.not.contain('SOURCE-NOT-FOUND');
            (0, expect_1.expect)(e.message).to.contain('a:1,a:2');
        }
    });
    (0, node_test_1.it)('frame-gutter-width', () => {
        for (const [rows, want] of [
            [10, "[aontu/scalar_kind]: Cannot unify values at path $.bad\n\nLiteral scalar values of different kinds cannot unify.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  1 & a   -> nil  # Does not unify (Kinds: Integer & String);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: true with value: 1\n  \u001b[34m--> <no-file>:10:10\n\u001b[34m   8 | \u001b[0m\n\u001b[34m   9 | \u001b[0m\n\u001b[34m  10 | \u001b[0mbad: 1 & true\n                \u001b[34m^ value was: true\u001b[0m\n\u001b[34m  11 | \u001b[0m\n\u001b[34m  12 | \u001b[0m\n\n Cannot unify value: 1 with value: true\n  \u001b[34m--> <no-file>:10:6\n\u001b[34m   8 | \u001b[0m\n\u001b[34m   9 | \u001b[0m\n\u001b[34m  10 | \u001b[0mbad: 1 & true\n            \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m  11 | \u001b[0m\n\u001b[34m  12 | \u001b[0m\n"],
            [98, "[aontu/scalar_kind]: Cannot unify values at path $.bad\n\nLiteral scalar values of different kinds cannot unify.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  1 & a   -> nil  # Does not unify (Kinds: Integer & String);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: true with value: 1\n  \u001b[34m--> <no-file>:98:10\n\u001b[34m   96 | \u001b[0m\n\u001b[34m   97 | \u001b[0m\n\u001b[34m   98 | \u001b[0mbad: 1 & true\n                 \u001b[34m^ value was: true\u001b[0m\n\u001b[34m   99 | \u001b[0m\n\u001b[34m  100 | \u001b[0m\n\n Cannot unify value: 1 with value: true\n  \u001b[34m--> <no-file>:98:6\n\u001b[34m   96 | \u001b[0m\n\u001b[34m   97 | \u001b[0m\n\u001b[34m   98 | \u001b[0mbad: 1 & true\n             \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m   99 | \u001b[0m\n\u001b[34m  100 | \u001b[0m\n"],
        ]) {
            let err = undefined;
            try {
                new aontu_1.Aontu().generate('\n'.repeat(rows - 1) + 'bad: 1 & true\n');
            }
            catch (e) {
                err = e;
            }
            if (undefined === err) {
                throw new Error('expected error');
            }
            (0, expect_1.expect)(err.message).equal(want);
        }
    });
    (0, node_test_1.it)('full-message-twin-framed', () => {
        let err = undefined;
        try {
            new aontu_1.Aontu().generate('x: 0\ny: 0\n"\u00e9": 1\n"\u00e9": 2\nz: 0\n');
        }
        catch (e) {
            err = e;
        }
        if (undefined === err) {
            throw new Error('expected error');
        }
        (0, expect_1.expect)(err.message).equal("[aontu/scalar_value]: Cannot unify values at path $.é\n\nLiteral scalar values of the same kind can only unify if they are\nexactly equal.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  a & a   -> a    # Does unify (equal Strings);\n  1 & 2   -> nil  # Does not unify (unequal Integers);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: 2 with value: 1\n  \u001b[34m--> <no-file>:4:6\n\u001b[34m  2 | \u001b[0my: 0\n\u001b[34m  3 | \u001b[0m\"é\": 1\n\u001b[34m  4 | \u001b[0m\"é\": 2\n           \u001b[34m^ value was: 2\u001b[0m\n\u001b[34m  5 | \u001b[0mz: 0\n\u001b[34m  6 | \u001b[0m\n\n Cannot unify value: 1 with value: 2\n  \u001b[34m--> <no-file>:3:6\n\u001b[34m  1 | \u001b[0mx: 0\n\u001b[34m  2 | \u001b[0my: 0\n\u001b[34m  3 | \u001b[0m\"é\": 1\n           \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m  4 | \u001b[0m\"é\": 2\n\u001b[34m  5 | \u001b[0mz: 0\n");
    });
    (0, node_test_1.it)('full-message-twin', () => {
        let err = undefined;
        try {
            new aontu_1.Aontu().generate('a:1 a:2');
        }
        catch (e) {
            err = e;
        }
        if (undefined === err) {
            throw new Error('expected error');
        }
        (0, expect_1.expect)(err.message).equal("[aontu/scalar_value]: Cannot unify values at path $.a\n\nLiteral scalar values of the same kind can only unify if they are\nexactly equal.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  a & a   -> a    # Does unify (equal Strings);\n  1 & 2   -> nil  # Does not unify (unequal Integers);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: 2 with value: 1\n  \u001b[34m--> <no-file>:1:7\n\u001b[34m  1 | \u001b[0ma:1 a:2\n            \u001b[34m^ value was: 2\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n\n Cannot unify value: 1 with value: 2\n  \u001b[34m--> <no-file>:1:3\n\u001b[34m  1 | \u001b[0ma:1 a:2\n        \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n");
    });
    (0, node_test_1.it)('full-message-bag-twin', () => {
        let err = undefined;
        try {
            new aontu_1.Aontu().generate('a:1 a:{b:1}');
        }
        catch (e) {
            err = e;
        }
        if (undefined === err) {
            throw new Error('expected error');
        }
        (0, expect_1.expect)(err.message).equal("[aontu/scalar_kind]: Cannot unify values at path $.a\n\nLiteral scalar values of different kinds cannot unify.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  1 & a   -> nil  # Does not unify (Kinds: Integer & String);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: {\"b\":1} with value: 1\n  \u001b[34m--> <no-file>:1:7\n\u001b[34m  1 | \u001b[0ma:1 a:{b:1}\n            \u001b[34m^ value was: {\"b\":1}\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n\n Cannot unify value: 1 with value: {\"b\":1}\n  \u001b[34m--> <no-file>:1:3\n\u001b[34m  1 | \u001b[0ma:1 a:{b:1}\n        \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n");
    });
    (0, node_test_1.it)('full-message-spread-twin', () => {
        let err = undefined;
        try {
            new aontu_1.Aontu().generate('a:&:min(3) a:{x:2}');
        }
        catch (e) {
            err = e;
        }
        if (undefined === err) {
            throw new Error('expected error');
        }
        (0, expect_1.expect)(err.message).equal("[aontu/constraint]: Cannot unify values at path $.a.x\n\nThis value does not satisfy the constraint. A constraint is the\nmeet of bound atoms (min, max, above, below) and exclusions (neq)\nover one domain; the expected form shown is the normalised\nresidual the value must satisfy.\n \nExamples:\n  min(0) & 3                    -> 3    # Admitted (3 >= 0);\n  min(0) & 0d5                  -> 0d5  # Bounds are leaf-agnostic;\n  max(65535) & 99999            -> nil  # Above the bound;\n  min(5) & max(3)               -> nil  # Empty at composition time;\n  integer & above(1) & below(2) -> nil  # No integer in the gap;\n  neq(1) & 1.0                  -> 1.0  # neq excludes leaf AND value.\n  re(\"^a\") & \"abc\"              -> \"abc\" # Patterns are unanchored.\n\n Cannot unify value: 2 with value: min(3)\n  \u001b[34m--> <no-file>:1:17\n\u001b[34m  1 | \u001b[0ma:&:min(3) a:{x:2}\n                      \u001b[34m^ value was: 2\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n\n Cannot unify value: min(3) with value: 2\n  \u001b[34m--> <no-file>:1:5\n\u001b[34m  1 | \u001b[0ma:&:min(3) a:{x:2}\n          \u001b[34m^ value was: min(3)\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n");
    });
    (0, node_test_1.it)('func-residue-frame', () => {
        let err = undefined;
        try {
            new aontu_1.Aontu().generate("a:super(1)&integer");
        }
        catch (e) {
            err = e;
        }
        if (undefined === err) {
            throw new Error('expected error');
        }
        (0, expect_1.expect)(err.message).equal("[aontu/mapval_no_gen]: Cannot resolve value at path $.a\n\nThis value was present after unification, and cannot be generated\nbecause it is not a literal value.\n\n Cannot resolve value: integer\n  \u001b[34m--> <no-file>:1:3\n\u001b[34m  1 | \u001b[0ma:super(1)&integer\n        \u001b[34m^ key a value was: integer\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n");
    });
    (0, node_test_1.it)('operandless-nil-frame', () => {
        let err = undefined;
        try {
            new aontu_1.Aontu().generate("a:-0x_1");
        }
        catch (e) {
            err = e;
        }
        if (undefined === err) {
            throw new Error('expected error');
        }
        (0, expect_1.expect)(err.message).equal("[aontu/negative]: Cannot resolve value at path $.a\n\nOnly a number can be negated. A `-` in front of a\nnon-numeric value is an error rather than a missing value.\n \nA `-` is a PREFIX here and never an operator between two values,\nso subtraction is sub(a, b).\n \nExamples:\n  a: -1       -> -1     # A number negates;\n  a: -x       -> nil    # ... a bare word does not;\n  a: k-x      -> \"k-x\"  # ... and this is one word, not a minus;\n  a: sub(5,3) -> 2      # Subtraction is a function.\n\n Cannot resolve value: nil\n  \u001b[34m--> <no-file>:1:3\n\u001b[34m  1 | \u001b[0ma:-0x_1\n        \u001b[34m^ value was: nil\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n");
    });
    (0, node_test_1.it)('hint-trailing-newline-frame', () => {
        let err = undefined;
        try {
            new aontu_1.Aontu().generate("a:{b?:$.zz9} c:1");
        }
        catch (e) {
            err = e;
        }
        if (undefined === err) {
            throw new Error('expected error');
        }
        (0, expect_1.expect)(err.message).equal("[aontu/no_path]: Cannot resolve value at path $.a.b\n\nThe path reference could not be found.\n \nExamples:\n  a:1 b:$.a  -> a:1,b:1  # $.a is a valid path reference as a is a key of root ($).\n  a:$.b      -> nil      # $.b is not a valid path reference as there is no key b in root ($).\n\n Cannot resolve value: $.zz9\n  \u001b[34m--> <no-file>:1:7\n\u001b[34m  1 | \u001b[0ma:{b?:$.zz9} c:1\n            \u001b[34m^ value was: $.zz9\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n");
    });
    (0, node_test_1.it)('list-index-zero-path', () => {
        let err = undefined;
        try {
            new aontu_1.Aontu().generate("a:[1]&[2]");
        }
        catch (e) {
            err = e;
        }
        if (undefined === err) {
            throw new Error('expected error');
        }
        (0, expect_1.expect)(err.message).equal("[aontu/scalar_value]: Cannot unify values at path $.a.0\n\nLiteral scalar values of the same kind can only unify if they are\nexactly equal.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  a & a   -> a    # Does unify (equal Strings);\n  1 & 2   -> nil  # Does not unify (unequal Integers);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: 2 with value: 1\n  \u001b[34m--> <no-file>:1:8\n\u001b[34m  1 | \u001b[0ma:[1]&[2]\n             \u001b[34m^ value was: 2\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n\n Cannot unify value: 1 with value: 2\n  \u001b[34m--> <no-file>:1:4\n\u001b[34m  1 | \u001b[0ma:[1]&[2]\n         \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n");
    });
    (0, node_test_1.it)('invalid-utf8-replacement', () => {
        const src = node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, '..', '..', 'test', 'spec', 'files', 'invalid-utf8.aontu'), 'utf8');
        const out = new aontu_1.Aontu().generate(src);
        (0, expect_1.expect)(out.b).equal('x\uFFFDy');
        (0, expect_1.expect)(out.c).equal('p\uFFFDq');
    });
    (0, node_test_1.it)('merge-conflict-crlf', () => {
        let err = undefined;
        try {
            new aontu_1.Aontu().generate('<<<<<<< HEAD\r\na:1\r\n=======\r\na:2\r\n>>>>>>> other\r\n');
        }
        catch (e) {
            err = e;
        }
        if (undefined === err) {
            throw new Error('expected error');
        }
        (0, expect_1.expect)(err.message).match(/aontu\/merge_conflict/);
        // ... and a bare CR line ending is still not a marker line.
        const ok = new aontu_1.Aontu().generate('a:1\r\nb:2\r\n');
        (0, expect_1.expect)(ok.a).equal(1);
        (0, expect_1.expect)(ok.b).equal(2);
    });
    (0, node_test_1.it)('raw-func-arg-is-not-internal', () => {
        let err = undefined;
        try {
            new aontu_1.Aontu().generate('a:pref(1 -3)');
        }
        catch (e) {
            err = e;
        }
        if (undefined === err) {
            throw new Error('expected error');
        }
        (0, expect_1.expect)(err.message).match(/aontu\/func_arity/);
        // The shape that threw a TypeError past the unifier resolves -- to
        // the bare-text refusal of its `%`, an ordinary verdict.
        let err2 = undefined;
        try {
            new aontu_1.Aontu().generate('x:(([]%))');
        }
        catch (e) {
            err2 = e;
        }
        (0, expect_1.expect)(err2?.message).match(/aontu\/bare_punct/);
    });
    (0, node_test_1.it)('color-is-gated-by-no-color-and-the-caller', () => {
        const frame = () => {
            try {
                new aontu_1.Aontu().generate('a:1\na:2\n');
            }
            catch (e) {
                return e.message;
            }
            throw new Error('expected a conflict');
        };
        const esc = /\x1b\[/;
        const noColor = process.env.NO_COLOR;
        try {
            delete process.env.NO_COLOR;
            // The default is colour: an interactive session is still the
            // common case, and nothing about the library knows better.
            (0, err_1.setColor)(undefined);
            (0, expect_1.expect)((0, err_1.colorActive)()).equal(true);
            (0, expect_1.expect)(esc.test(frame())).equal(true);
            // NO_COLOR, per no-color.org: SET, to anything, means no colour.
            process.env.NO_COLOR = '1';
            (0, expect_1.expect)((0, err_1.colorActive)()).equal(false);
            (0, expect_1.expect)(esc.test(frame())).equal(false);
            // Set-but-empty is the documented exception and does NOT disable.
            process.env.NO_COLOR = '';
            (0, expect_1.expect)((0, err_1.colorActive)()).equal(true);
            (0, expect_1.expect)(esc.test(frame())).equal(true);
            // A caller who can see the destination outranks the environment
            // in both directions -- this is the call ts/src/cli.ts makes from
            // process.stderr.isTTY, and the one --jsonl makes unconditionally.
            process.env.NO_COLOR = '1';
            (0, err_1.setColor)(true);
            (0, expect_1.expect)((0, err_1.colorActive)()).equal(true);
            (0, expect_1.expect)(esc.test(frame())).equal(true);
            delete process.env.NO_COLOR;
            (0, err_1.setColor)(false);
            (0, expect_1.expect)((0, err_1.colorActive)()).equal(false);
            (0, expect_1.expect)(esc.test(frame())).equal(false);
            // THE POINT OF THE WHOLE GATE: with colour off the message is
            // exactly the text, so a reader can match on it.
            (0, expect_1.expect)(frame()).match(/^\[aontu\/scalar_value\]/);
        }
        finally {
            (0, err_1.setColor)(undefined);
            if (null == noColor) {
                delete process.env.NO_COLOR;
            }
            else {
                process.env.NO_COLOR = noColor;
            }
        }
    });
});
//# sourceMappingURL=error.test.js.map
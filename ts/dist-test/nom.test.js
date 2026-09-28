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
const expect_1 = require("./expect");
const __1 = require("..");
const NomFuncVal_1 = require("../dist/val/NomFuncVal");
const A = new __1.Aontu();
const G = (src) => A.generate(src);
const E = (src) => {
    try {
        A.generate(src);
    }
    catch (err) {
        const errs = 'function' === typeof err?.errs ? err.errs() : [];
        return errs[0]?.why;
    }
    return undefined;
};
(0, node_test_1.describe)('nom', () => {
    (0, node_test_1.test)('every-spelling', () => {
        (0, expect_1.expect)(G('x: nom("user_id")').x).equal({
            camel: 'userId',
            dot: 'user.id',
            text: 'User id',
            kebab: 'user-id',
            pascal: 'UserId',
            path: 'user/id',
            upper: 'USER_ID',
            snake: 'user_id',
            title: 'User Id',
        });
        Assert.deepEqual(Object.keys(G('x: nom("a")').x).sort(), [...NomFuncVal_1.NOM_STYLES].sort());
    });
    (0, node_test_1.test)('any-format-in', () => {
        const spellings = [
            'user_id', 'userId', 'UserId', 'UserID', 'USER_ID',
            'user-id', 'user.id', 'user/id', 'user id',
        ];
        for (const s of spellings) {
            Assert.equal(G('x: nom("' + s + '", pascal)').x, 'UserId', s + ' should render as UserId');
            Assert.equal(G('x: nom("' + s + '", snake)').x, 'user_id');
        }
    });
    (0, node_test_1.test)('word-boundaries', () => {
        Assert.equal(G('x: nom("HTTPServer", snake)').x, 'http_server');
        Assert.equal(G('x: nom("XMLHttpRequest", upper)').x, 'XML_HTTP_REQUEST');
        Assert.equal(G('x: nom("utf8String", kebab)').x, 'utf-8-string');
        Assert.equal(G('x: nom("v2Api", snake)').x, 'v_2_api');
    });
    (0, node_test_1.test)('acronyms', () => {
        Assert.equal(G('x: nom("ledgerId", pascal)').x, 'LedgerId');
        Assert.equal(G('x: nom("ledgerId", pascal, [ID])').x, 'LedgerID');
        Assert.equal(G('x: nom("ledgerId", camel, [ID])').x, 'ledgerID');
        Assert.equal(G('x: nom("idLedger", camel, [ID])').x, 'idLedger');
        // An all-caps word the splitter kept whole is rescued by the set.
        Assert.equal(G('x: nom("HTTPServer", pascal)').x, 'HttpServer');
        Assert.equal(G('x: nom("HTTPServer", pascal, [HTTP])').x, 'HTTPServer');
        (0, expect_1.expect)(G('x: nom("ledgerId", [ID])').x.pascal).equal('LedgerID');
        (0, expect_1.expect)(G('x: nom("ledgerId", [ID])').x.camel).equal('ledgerID');
    });
    (0, node_test_1.test)('text-is-spelling-independent', () => {
        Assert.equal(G('x: nom("ledgerId", text, [ID])').x, 'Ledger ID');
        Assert.equal(G('x: nom("ledgerID", text, [ID])').x, 'Ledger ID');
        Assert.equal(G('x: nom("ledger_id", text, [ID])').x, 'Ledger ID');
        Assert.equal(G('x: nom("ledgerId", text)').x, 'Ledger id');
        // A leading acronym is one too.
        Assert.equal(G('x: nom("idNumber", text, [ID])').x, 'ID number');
    });
    (0, node_test_1.test)('namers-own-separators-and-styles', () => {
        Assert.equal(G('x: nom("a.b/c", pascal)').x, 'ABC');
        Assert.equal(G('x: nom("userId", dot)').x, 'user.id');
        Assert.equal(G('x: nom("userId", "path")').x, 'user/id');
        Assert.equal(G('x: nom("userId", title)').x, 'User Id');
        // `as-is` is the profile's way of saying "do nothing"; it is not a
        // spelling anyone asks a namer for, so it is not a style here.
        Assert.equal(E('x: nom("userId", "as-is")'), 'invalid-arg');
    });
    (0, node_test_1.test)('map-is-closed', () => {
        Assert.equal(E('x: nom("user_id") & {pascel: "y"}'), 'closed');
        Assert.equal(E('x: nom("user_id").pascel'), 'no_path');
    });
    (0, node_test_1.test)('refusals', () => {
        // The name.
        Assert.equal(E('x: nom(1)'), 'func_arg');
        Assert.equal(E('x: nom("")'), 'invalid-arg');
        Assert.equal(E('x: nom({a: 1})'), 'func_arg');
        // The style.
        Assert.equal(E('x: nom("a", pascel)'), 'invalid-arg');
        Assert.equal(E('x: nom("a", 1)'), 'invalid-arg');
        // The acronym set.
        Assert.equal(E('x: nom("a", pascal, [1])'), 'invalid-arg');
        Assert.equal(E('x: nom("a", pascal, [""])'), 'invalid-arg');
        Assert.equal(E('x: nom("a", pascal, "ID")'), 'invalid-arg');
        // Arity is refused at parse from the declared signature, so the
        // call's own guard never sees these.
        Assert.equal(E('x: nom()'), 'func_arity');
        Assert.equal(E('x: nom("a", pascal, [ID], 1)'), 'func_arity');
        // A list second argument is the acronym set, so there is no third
        // slot left to fill.
        Assert.equal(E('x: nom("a", [ID], pascal)'), 'invalid-arg');
        // A name that splits to no words at all.
        Assert.equal(E('x: nom("_", pascal)'), 'invalid-arg');
        Assert.equal(E('x: nom("_")'), 'invalid-arg');
    });
    (0, node_test_1.test)('a-path-is-not-text', () => {
        Assert.equal(E('z: x: {a: 1}\nz: y: nom(path($.z.x.a), kebab)'), 'func_arg');
        Assert.equal(E('z: x: {a: 1}\nz: y: nom(path(.x.a), kebab)'), 'func_arg');
    });
    // A forward reference residuates and answers once the model settles:
    // `nom` answers from its arguments alone and is not staged.
    (0, node_test_1.test)('forward-reference', () => {
        Assert.equal(G('x: nom($.n, pascal)\nn: $.m\nm: "user_id"').x, 'UserId');
    });
    (0, node_test_1.test)('derives-the-identifier-a-generator-needs', () => {
        const out = G(`
model: { name: user_account fields: [id, emailAddress, ledgerId] }
ts: {
  type: "export interface " + nom($.model.name, pascal) + " {"
  fields: each($.model.fields, "  " + nom(_, camel) + ": string")
}
sql: {
  table: "create table " + nom($.model.name, snake) + " ("
  cols: each($.model.fields, "  " + nom(_, snake) + " text")
}
go: each($.model.fields, nom(_, pascal, [ID]))
`);
        (0, expect_1.expect)(out.ts).equal({
            type: 'export interface UserAccount {',
            fields: ['  id: string', '  emailAddress: string', '  ledgerId: string'],
        });
        (0, expect_1.expect)(out.sql).equal({
            table: 'create table user_account (',
            cols: ['  id text', '  email_address text', '  ledger_id text'],
        });
        (0, expect_1.expect)(out.go).equal(['ID', 'EmailAddress', 'LedgerID']);
    });
});
//# sourceMappingURL=nom.test.js.map
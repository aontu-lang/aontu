"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
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
const ROOT = Path.join(__dirname, '..', '..');
const EDITORS = Path.join(ROOT, 'editors');
const REPO_URL = 'https://github.com/aontu-lang/aontu/blob/main/';
function readJson(...parts) {
    return JSON.parse(Fs.readFileSync(Path.join(...parts), 'utf8'));
}
(0, node_test_1.describe)('editors', () => {
    const template = readJson(EDITORS, 'jetbrains', 'template.json');
    const vscode = readJson(EDITORS, 'vscode', 'package.json');
    // LSP4IJ reads the fields it knows and drops the rest without a word,
    // so a misspelt field is a setting that silently does nothing.
    (0, node_test_1.test)('the-jetbrains-template-holds-only-fields-lsp4ij-reads', () => {
        const known = new Set([
            'id', 'name', 'url', 'programArgs', 'transports', 'fileTypeMappings',
        ]);
        for (const field of Object.keys(template)) {
            Assert.ok(known.has(field), `editors/jetbrains/template.json has a field LSP4IJ does not read: ${field}`);
        }
        Assert.equal(template.id, 'aontu');
        Assert.equal(typeof template.name, 'string');
        Assert.deepEqual(template.transports, [{ mode: 'stdio' }]);
    });
    (0, node_test_1.test)('the-jetbrains-template-starts-the-command-the-other-clients-start', () => {
        const props = vscode.contributes.configuration.properties;
        const command = [
            props['aontu.server.command'].default,
            ...props['aontu.server.args'].default,
        ].join(' ');
        Assert.equal(command, 'aontu lsp');
        Assert.deepEqual(Object.keys(template.programArgs).sort(), ['default', 'windows']);
        Assert.equal(template.programArgs.default, command);
        Assert.equal(template.programArgs.windows, 'cmd /C ' + command);
    });
    (0, node_test_1.test)('the-jetbrains-template-binds-the-one-extension', () => {
        const lang = vscode.contributes.languages[0];
        Assert.deepEqual(lang.extensions, ['.aontu']);
        Assert.deepEqual(template.fileTypeMappings, [{
                fileType: { patterns: lang.extensions.map((ext) => '*' + ext) },
                languageId: lang.id,
            }]);
    });
    (0, node_test_1.test)('the-jetbrains-template-links-its-own-instructions', () => {
        const url = template.url;
        Assert.ok(url.startsWith(REPO_URL), `template.json url leaves the repository: ${url}`);
        const rel = url.slice(REPO_URL.length);
        Assert.equal(rel, 'editors/jetbrains/README.md');
        Assert.ok(Fs.existsSync(Path.join(ROOT, rel)), `template.json url names no file: ${rel}`);
    });
    // The JetBrains README sends the reader to editors/vscode for the
    // colours, which an IDE reads as a TextMate bundle from these entries.
    (0, node_test_1.test)('the-bundle-the-jetbrains-readme-names-declares-the-grammar', () => {
        const readme = Fs.readFileSync(Path.join(EDITORS, 'jetbrains', 'README.md'), 'utf8');
        Assert.ok(readme.includes('select `editors/vscode` of a checkout'), 'editors/jetbrains/README.md no longer names editors/vscode as the bundle');
        const lang = vscode.contributes.languages[0];
        const grammar = vscode.contributes.grammars[0];
        Assert.equal(grammar.language, lang.id);
        Assert.equal(grammar.scopeName, 'source.aontu');
        for (const rel of [grammar.path, lang.configuration]) {
            Assert.ok(Fs.existsSync(Path.join(EDITORS, 'vscode', rel)), `editors/vscode/package.json names no file: ${rel}`);
        }
    });
});
//# sourceMappingURL=editors.test.js.map
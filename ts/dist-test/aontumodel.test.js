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
const aontumodel_1 = require("../dist/aontumodel");
const REPO = Path.join(__dirname, '..', '..');
const TREE = Path.join(REPO, 'aontu');
// Every .aontu is a module, named by its path; a file named after the
// directory holding it collapses, so aontu/profile/profile.aontu is
// `aontu:profile` and aontu/lang/text.aontu is `aontu:lang/text`.
function walk(dir, rel, found) {
    for (const entry of Fs.readdirSync(dir, { withFileTypes: true })) {
        const subrel = rel ? rel + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
            walk(Path.join(dir, entry.name), subrel, found);
            continue;
        }
        if (!entry.name.endsWith('.aontu')) {
            continue;
        }
        const part = subrel.slice(0, -'.aontu'.length).split('/');
        if (1 < part.length && part[part.length - 1] === part[part.length - 2]) {
            part.pop();
        }
        found.push(aontumodel_1.AONTU_SCHEME + part.join('/'));
    }
    return found;
}
function leafOf(name) {
    const rel = name.slice(aontumodel_1.AONTU_SCHEME.length).split('/');
    const deep = Path.join(TREE, ...rel, rel[rel.length - 1] + '.aontu');
    return Fs.existsSync(deep) ? deep : Path.join(TREE, ...rel) + '.aontu';
}
(0, node_test_1.describe)('aontumodel', () => {
    // A generated copy that nothing compares is a second source of truth
    // waiting to drift.
    (0, node_test_1.test)('sources-are-identical-with-the-tree', () => {
        Assert.ok(0 < aontumodel_1.AONTU_MODELS.length, 'no models: has the generator run?');
        for (const name of aontumodel_1.AONTU_MODELS) {
            const text = Fs.readFileSync(leafOf(name), 'utf8')
                .replaceAll('\r\n', '\n').replaceAll('\r', '\n');
            Assert.equal(aontumodel_1.AONTU_SOURCES[name], text, name + ' is stale against aontu/ — run `make aontu`');
        }
    });
    (0, node_test_1.test)('tree-serves-exactly-the-listed-models', () => {
        Assert.deepEqual(aontumodel_1.AONTU_MODELS, walk(TREE, '', []).sort(), 'aontu/ and AONTU_MODELS disagree — run `make aontu`');
        Assert.deepEqual(aontumodel_1.AONTU_MODELS, [...aontumodel_1.AONTU_MODELS].sort(), 'AONTU_MODELS is not sorted');
        Assert.deepEqual(Object.keys(aontumodel_1.AONTU_SOURCES).sort(), aontumodel_1.AONTU_MODELS);
    });
    (0, node_test_1.test)('every-name-carries-the-scheme', () => {
        for (const name of aontumodel_1.AONTU_MODELS) {
            Assert.ok(name.startsWith(aontumodel_1.AONTU_SCHEME), name);
        }
    });
});
//# sourceMappingURL=aontumodel.test.js.map
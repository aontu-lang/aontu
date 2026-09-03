"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.viewTree = exports.viewSet = exports.view = exports.relationCheck = exports.graphOf = exports.agentsMd = exports.diff = exports.patch = exports.why = exports.get = exports.canonHash = exports.hcanon = exports.trimCheck = exports.subsume = exports.sarifReport = exports.vet = exports.Decimal = exports.exactJSON = exports.formatExplain = exports.util = exports.Lang = exports.colorActive = exports.setColor = exports.AontuError = exports.AontuContext = exports.Aontu = exports.VERSION = void 0;
exports.runparse = runparse;
const lang_1 = require("./lang");
Object.defineProperty(exports, "Lang", { enumerable: true, get: function () { return lang_1.Lang; } });
const unify_1 = require("./unify");
const ctx_1 = require("./ctx");
Object.defineProperty(exports, "AontuContext", { enumerable: true, get: function () { return ctx_1.AontuContext; } });
const MapVal_1 = require("./val/MapVal");
const Decimal_1 = require("./val/Decimal");
Object.defineProperty(exports, "Decimal", { enumerable: true, get: function () { return Decimal_1.Decimal; } });
const exactjson_1 = require("./exactjson");
Object.defineProperty(exports, "exactJSON", { enumerable: true, get: function () { return exactjson_1.exactJSON; } });
const utility_1 = require("./utility");
Object.defineProperty(exports, "formatExplain", { enumerable: true, get: function () { return utility_1.formatExplain; } });
const err_1 = require("./err");
Object.defineProperty(exports, "AontuError", { enumerable: true, get: function () { return err_1.AontuError; } });
Object.defineProperty(exports, "setColor", { enumerable: true, get: function () { return err_1.setColor; } });
Object.defineProperty(exports, "colorActive", { enumerable: true, get: function () { return err_1.colorActive; } });
const vet_1 = require("./vet");
Object.defineProperty(exports, "vet", { enumerable: true, get: function () { return vet_1.vet; } });
const report_sarif_1 = require("./report-sarif");
Object.defineProperty(exports, "sarifReport", { enumerable: true, get: function () { return report_sarif_1.sarifReport; } });
const subsume_1 = require("./subsume");
Object.defineProperty(exports, "subsume", { enumerable: true, get: function () { return subsume_1.subsume; } });
const trim_1 = require("./trim");
Object.defineProperty(exports, "trimCheck", { enumerable: true, get: function () { return trim_1.trimCheck; } });
const hcanon_1 = require("./hcanon");
Object.defineProperty(exports, "hcanon", { enumerable: true, get: function () { return hcanon_1.hcanon; } });
Object.defineProperty(exports, "canonHash", { enumerable: true, get: function () { return hcanon_1.canonHash; } });
const query_1 = require("./query");
Object.defineProperty(exports, "get", { enumerable: true, get: function () { return query_1.get; } });
Object.defineProperty(exports, "why", { enumerable: true, get: function () { return query_1.why; } });
const patch_1 = require("./patch");
Object.defineProperty(exports, "patch", { enumerable: true, get: function () { return patch_1.patch; } });
const diff_1 = require("./diff");
Object.defineProperty(exports, "diff", { enumerable: true, get: function () { return diff_1.diff; } });
const agentsmd_1 = require("./agentsmd");
Object.defineProperty(exports, "agentsMd", { enumerable: true, get: function () { return agentsmd_1.agentsMd; } });
const graph_1 = require("./graph");
Object.defineProperty(exports, "graphOf", { enumerable: true, get: function () { return graph_1.graphOf; } });
const relation_1 = require("./relation");
Object.defineProperty(exports, "relationCheck", { enumerable: true, get: function () { return relation_1.relationCheck; } });
const view_1 = require("./view");
Object.defineProperty(exports, "view", { enumerable: true, get: function () { return view_1.view; } });
Object.defineProperty(exports, "viewSet", { enumerable: true, get: function () { return view_1.viewSet; } });
Object.defineProperty(exports, "viewTree", { enumerable: true, get: function () { return view_1.viewTree; } });
// VERSION is the Aontu npm package version, and mirrors
// go/aontu.go's `Version` (which tracks the Go module version
// separately — the two version series are independent).
//
// Kept in step with package.json by the `version` npm lifecycle script,
// which runs on `npm version` / `npm run repo-bump`. version.test.ts
// fails if the two ever drift.
const VERSION = '0.55.0';
exports.VERSION = VERSION;
// A module file's VALUE, as far as it goes. COLLECTED, not raised: a
// module file that does not stand up has no `mod.main` to read, and
// the default entry name is the answer -- the resolution itself fails
// later, on the file that is not there, rather than here on a metadata
// read. That is what a collecting context does, so there is nothing to
// catch: it answers what it could generate and records the rest.
function genQuiet(val, aontu) {
    return val.gen(aontu.ctx({ collect: true }));
}
class Aontu {
    constructor(popts) {
        this.opts = popts ?? {};
        this.opts.mod = {
            ...(this.opts.mod ?? {}),
            eval: this.opts.mod?.eval ?? ((src, path) => {
                // One deeper: a module verified from inside a module
                // verification is one more level of nesting, and the resolver
                // refuses past its bound (MODULE_MAX_DEPTH in ts/src/mod.ts).
                const inner = new Aontu({
                    ...this.opts,
                    mod: {
                        // Never absent: the assignment this closure is part of has
                        // already run by the time it is called.
                        ...this.opts.mod,
                        eval: undefined,
                        depth: (this.opts.mod?.depth ?? 0) + 1,
                    },
                });
                const ctx = inner.ctx({ collect: true });
                const val = inner.unify(src, { path }, ctx);
                return { gen: genQuiet(val, inner), hash: (0, hcanon_1.canonHash)(val) };
            }),
        };
        this.lang = new lang_1.Lang(this.opts);
    }
    // Create a new context.
    ctx(cfg) {
        cfg = cfg ?? {};
        cfg.fs = cfg.fs ?? this.opts.fs;
        // The trust profile rides the instance (its resolver is built once,
        // in the Lang constructor); the context needs it too, for the
        // budgets (G5, docs/trust.md).
        cfg.opts = cfg.opts ?? {};
        cfg.opts.trust = cfg.opts.trust ?? this.opts.trust;
        const ac = new ctx_1.AontuContext(cfg);
        return ac;
    }
    // Parse source into a matching Val AST, not yet unified.
    //
    // NOTE: the returned Val is SINGLE-USE — unify()/generate() refine the
    // tree in place (see Val.unify), so do not unify or generate the same
    // parsed Val more than once, and do not share it across threads. Call
    // parse() again for a fresh tree.
    parse(src, opts, ac) {
        let out;
        let errs = [];
        if (null == src) {
            src = '';
        }
        ac = ac ?? this.ctx();
        ac.addopts({ ...(opts ?? {}), src });
        if ('string' !== typeof src) {
            out = (0, err_1.makeNilErr)(ac, 'parse_bad_src');
            errs.push(out);
        }
        else {
            // A version-control conflict marker is refused BEFORE the parse
            // (issue #5). None of `<`, `=` or `>` is an aontu operator, so a
            // marker line is ordinary text and `<<<<<<< HEAD` parsed happily
            // into the two-string list ["<<<<<<<","HEAD"] -- an unresolved
            // merge became a plausible document instead of an error, and the
            // report of it read as a failed `<` operation.
            const marker = findConflictMarker(src);
            if (-1 !== marker.offset) {
                const nil = (0, err_1.makeNilErr)(ac, 'merge_conflict');
                nil.site.row = marker.row;
                nil.site.col = marker.col;
                out = nil;
                errs.push(nil);
            }
        }
        if (0 === errs.length) {
            out = runparse(src, this.lang, ac);
            // The include MANIFEST (G5, docs/trust.md): the resolved include
            // closure as `{ path, capability }`, sorted and deduplicated so
            // it is deterministic — the "file set" of hermeticity clause 1
            // made observable. Content hashing and pinning stay with G6.
            out.deps = manifestOf(ac.manifest);
            ac.root = out;
        }
        handleErrors(errs, out, ac);
        return out;
    }
    // Unify source or Val, returning a fully unified Val.
    unify(src, opts, ac) {
        let out;
        let errs = [];
        ac = ac ?? this.ctx();
        ac.addopts({ ...(opts ?? {}), src });
        let pval;
        if (null == src) {
            src = '';
        }
        if ('string' === typeof src) {
            pval = this.parse(src, undefined, ac);
        }
        else if (src && src.isVal) {
            pval = src;
        }
        else {
            out = (0, err_1.makeNilErr)(ac, 'unify_no_src');
            errs.push(out);
        }
        if (null != pval && 0 === errs.length) {
            let uni = new unify_1.Unify(pval, this.lang, ac, src);
            errs = uni.err;
            // Never nullish: Unify.res starts as the root Val, unite() returns a
            // Val on every arm, and its catch-all turns a throwing node into an
            // 'internal' NilVal.
            out = uni.res;
            out.deps = pval.deps;
            // THE DERIVED STRUCTURE (G4 phase 3): the edge set, computed
            // once from the unified tree. Cheap on a document with no links
            // — one guarded walk — and the thing impact analysis and the
            // relation checks are traversals over.
            out.graph = (0, graph_1.graphOf)(out);
            out.err = errs;
            ac.root = out;
        }
        handleErrors(errs, out, ac);
        return out;
    }
    // Generate output structure from source, which must parse and fully unify.
    //
    // The result is made of NATIVE values, and D9 puts two beyond what
    // `JSON.stringify` can write: a `biginteger` (a `0d` literal with no
    // fraction or exponent) generates as a native `bigint`, and a
    // `bigdecimal` generates as a `Decimal`. Both are exact at any
    // magnitude, which is the whole point of the leaves -- and both are
    // confined to documents that opt in, so a `0d`-free document generates
    // exactly what it always did.
    //
    // Serialise the result with `exactJSON` (exported alongside this
    // class), NOT with `JSON.stringify`: the latter throws on a bigint and
    // has no way to write exact digits as a JSON number.
    generate(src, opts, ac) {
        try {
            let out = undefined;
            ac = ac ?? this.ctx();
            ac.addopts({ ...(opts ?? {}), src });
            let pval = this.parse(src, undefined, ac);
            if (undefined !== pval && 0 === pval.err.length) {
                let uval = this.unify(pval, undefined, ac);
                // console.log('AONTU-GENERATE-UVAL', uval.constructor, uval.mark)
                if (undefined !== uval && 0 === uval.err.length) {
                    out = uval.isNil ? (ac.adderr(uval), undefined)
                        : 0 < ac.err.length ? undefined
                            : uval.gen(ac);
                    // The relation verdict (RELATIONS P2): declarations the
                    // graph atoms registered during unification are decided
                    // HERE, where no more information can arrive -- the sizing
                    // atoms' model. A violated declaration is a located
                    // evaluation error at the offending edge, and the generated
                    // value is discarded below.
                    //
                    // AFTER GENERATION, and only when generation SUCCEEDED. A
                    // document that cannot be generated has no finished model
                    // to have a graph verdict about: an unsettled disjunction
                    // leaves alternatives the graph walk cannot read, so a
                    // mirror the document writes is absent from the edge set
                    // and `inverse(n)` reports it missing -- a false finding,
                    // and one that buried the `disjunct_no_gen` that actually
                    // stopped the document. The check that a broken document is
                    // not blamed on its relations (`relations` verb, finding F)
                    // holds here too.
                    if (!uval.isNil && 0 === ac.err.length) {
                        (0, relation_1.relationErrors)(ac, uval);
                        if (0 < ac.err.length) {
                            out = undefined;
                        }
                    }
                    if (0 < ac.err.length) {
                        if (!ac.collect) {
                            throw new err_1.AontuError(ac.errmsg(), ac.err);
                        }
                        out = undefined;
                    }
                }
            }
            return out;
        }
        catch (err) {
            if (err instanceof err_1.AontuError || true === err.aontu) {
                throw err;
            }
            const unex = new err_1.AontuError('Aontu: unexpected error: ' + err.message);
            Object.assign(unex, err);
            unex.stack = err.stack;
            throw unex;
        }
    }
}
exports.Aontu = Aontu;
// Either throw an exception or add collected errors to result.
function handleErrors(errs, out, ac) {
    errs.map((err) => ac.adderr(err));
    if (out) {
        out.err.map((err) => ac.adderr(err));
    }
    if (0 < ac.err.length) {
        // Error message formatting is deferred by adderr (many NilVals are
        // transient). Materialize msgs here before the caller sees them.
        for (const err of ac.err) {
            if (null == err?.msg || '' === err.msg) {
                (0, err_1.descErr)(err, ac);
            }
        }
        if (ac.collect) {
            if (out) {
                out.err = ac.err;
            }
        }
        else {
            throw new err_1.AontuError(ac.errmsg(), ac.err);
        }
    }
}
// Locate the first version-control conflict marker in a source, as a
// 1-based row and column (offset -1 when there is none).
//
// The shape is git's, and it is matched exactly: SEVEN of `<`, `=` or `>`
// at the very start of a line, then either the end of that line or a
// space before the branch label. Requiring the run length and the line
// start is what keeps a document that legitimately writes `a:"<<<<<<<"`,
// or a row of `=` inside a string, from being refused -- the marker is
// recognised as the artifact it is, not as a suspicious character.
//
// Kept byte-identical to findConflictMarker in go/lang.go.
function findConflictMarker(src) {
    const miss = { offset: -1, row: -1, col: -1 };
    let offset = 0;
    let row = 1;
    for (const rawline of src.split('\n')) {
        // A CRLF source leaves the \r on the line; it is not part of the run.
        const line = rawline.endsWith('\r') ? rawline.slice(0, -1) : rawline;
        const c = line[0];
        if ('<' === c || '=' === c || '>' === c) {
            let run = 0;
            while (run < line.length && line[run] === c) {
                run++;
            }
            if (7 === run && (7 === line.length || ' ' === line[7])) {
                return { offset, row, col: 1 };
            }
        }
        offset += rawline.length + 1;
        row++;
    }
    return miss;
}
// Sort and deduplicate the raw manifest sink into the deterministic
// include closure: by path then capability, code-point order, one entry
// per (path, capability) pair.
function manifestOf(sink) {
    const seen = new Set();
    const out = [];
    for (const dep of sink) {
        const key = dep.path + ' ' + dep.capability;
        if (!seen.has(key)) {
            seen.add(key);
            out.push({ path: dep.path, capability: dep.capability });
        }
    }
    // No equal case: entries were deduplicated on exactly this key.
    out.sort((a, b) => {
        const ka = a.path + ' ' + a.capability;
        const kb = b.path + ' ' + b.capability;
        return ka < kb ? -1 : 1;
    });
    return out;
}
// Perform parse of source code (minor customizations over Lang.parse).
function runparse(src, lang, ctx) {
    const popts = {
        deps: ctx.deps,
        fs: ctx.fs,
        path: ctx.opts.path,
        manifest: ctx.manifest,
    };
    let val;
    const tsrc = src.trim().replace(/^(\n\s*)+/, '');
    if ('string' === typeof src && '' !== tsrc) {
        val = lang.parse(src, popts);
    }
    if (undefined === val) {
        val = new MapVal_1.MapVal({ peg: {} });
    }
    return val;
}
const util = {
    runparse,
};
exports.util = util;
exports.default = Aontu;
//# sourceMappingURL=aontu.js.map
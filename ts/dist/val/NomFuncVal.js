"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NomFuncVal = exports.NOM_STYLES = void 0;
const err_1 = require("../err");
const casing_1 = require("../casing");
const MapVal_1 = require("./MapVal");
const StringVal_1 = require("./StringVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const NOM_STYLES = [
    'camel', // userId
    'dot',
    'kebab',
    'pascal', // UserId
    'path',
    'snake',
    'text',
    'title',
    'upper', // USER_ID
];
exports.NOM_STYLES = NOM_STYLES;
// nom's style name -> the case style `caseName` serves. `upper` and
// `text` are nom's spellings.
const CASENAME_STYLES = {
    camel: 'camel',
    kebab: 'kebab',
    pascal: 'pascal',
    snake: 'snake',
    upper: 'screaming',
};
// One name in one style, or undefined when the style is not one, or
// when the name holds no words at all.
function styleName(name, style, acronyms) {
    const src = name.replace(/[./]/g, '_');
    const words = (0, casing_1.splitWords)(src);
    if (0 === words.length) {
        return undefined;
    }
    const cased = CASENAME_STYLES[style];
    if (undefined !== cased) {
        return (0, casing_1.caseName)(src, cased, acronyms);
    }
    if ('dot' === style) {
        return words.map(casing_1.lowerASCII).join('.');
    }
    if ('path' === style) {
        return words.map(casing_1.lowerASCII).join('/');
    }
    if ('title' === style) {
        return words.map((w) => (0, casing_1.capitalise)(w, acronyms)).join(' ');
    }
    if ('text' === style) {
        const isAcronym = (w) => acronyms.some((a) => (0, casing_1.lowerASCII)(a) === (0, casing_1.lowerASCII)(w));
        return [(0, casing_1.capitalise)(words[0], acronyms)]
            .concat(words.slice(1).map((w) => isAcronym(w) ? (0, casing_1.capitalise)(w, acronyms) : (0, casing_1.lowerASCII)(w)))
            .join(' ');
    }
    return undefined;
}
// The text a value carries, when it is a concrete string. A path is a
// string too (ScalarKindVal's Path sits under String), so a spelled
// address may be renamed like any other text.
function textOf(v) {
    const s = v;
    return (true === s?.isScalar && 'string' === typeof s.peg) ? s.peg : undefined;
}
// An acronym set: a list of concrete strings, or undefined when the
// value is not one.
function acronymsOf(v) {
    const l = v;
    if (true !== l?.isList) {
        return undefined;
    }
    const out = [];
    for (const el of l.peg) {
        const t = textOf(el);
        if (undefined === t || '' === t) {
            return undefined;
        }
        out.push(t);
    }
    return out;
}
class NomFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isNamerFunc = true;
    }
    make(_ctx, spec) {
        return new NomFuncVal(spec);
    }
    funcname() {
        return 'nom';
    }
    resolve(ctx, args) {
        // Arity is checked at parse (funcArity); see the translate twin.
        const name = textOf(args[0]);
        if (undefined === name || '' === name) {
            return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, args[0], 'name');
        }
        let style;
        let acronyms = [];
        if (2 <= args.length) {
            const second = args[1];
            if (true === second?.isList) {
                if (3 === args.length) {
                    return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, args[2], 'arity');
                }
                const acr = acronymsOf(second);
                if (undefined === acr) {
                    return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, second, 'acronyms');
                }
                acronyms = acr;
            }
            else {
                style = textOf(second);
                if (undefined === style) {
                    return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, second, 'style');
                }
                if (3 === args.length) {
                    const acr = acronymsOf(args[2]);
                    if (undefined === acr) {
                        return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, args[2], 'acronyms');
                    }
                    acronyms = acr;
                }
            }
        }
        // One style: the string.
        if (undefined !== style) {
            const out = styleName(name, style, acronyms);
            if (undefined === out) {
                return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, args[1], 'style');
            }
            return this.place(new StringVal_1.StringVal({ peg: out }, ctx));
        }
        const peg = {};
        for (const s of NOM_STYLES) {
            const out = styleName(name, s, acronyms);
            if (undefined === out) {
                return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, args[0], 'name');
            }
            peg[s] = new StringVal_1.StringVal({ peg: out }, ctx);
        }
        const map = new MapVal_1.MapVal({ peg }, ctx);
        map.closed = true;
        return this.place(map);
    }
} /* node:coverage ignore next 6 */
exports.NomFuncVal = NomFuncVal;
//# sourceMappingURL=NomFuncVal.js.map
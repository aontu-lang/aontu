"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SplitFuncVal = exports.RepFuncVal = exports.UscFuncVal = exports.EscFuncVal = void 0;
const err_1 = require("../err");
const escape_1 = require("../escape");
const StringVal_1 = require("./StringVal");
const ListVal_1 = require("./ListVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const ConstraintVal_1 = require("./ConstraintVal");
// The string a value carries, or undefined when it is not a string.
// Mirrors `stringLeaf` in ConstraintVal: a path is a string too, so a
// spelled address may be escaped and split like any other text.
function textOf(v) {
    const s = v;
    return true === s?.isScalar && 'string' === typeof s.peg ? s.peg : undefined;
}
// The variant an optional second argument names: '' for the absent
// argument (the C/JSON convention), or undefined when it is not a
// variant name.
function variantOf(v) {
    if (null == v) {
        return '';
    }
    const s = textOf(v);
    return undefined !== s && (0, escape_1.isEscVariant)(s) ? s : undefined;
}
// The number of CAPTURING groups in a normalised pattern. Counted by
// scanning rather than by asking either host, because the count decides
// whether a substitution is refused and the two ports must refuse the
// same ones. The subset admits no named groups, so a capturing group is
// exactly `(` that is not `(?`.
function reGroupCount(norm) {
    let count = 0;
    let inClass = false;
    for (let i = 0; i < norm.length; i++) {
        const c = norm[i];
        if ('\\' === c) {
            i++;
            continue;
        }
        if (inClass) {
            if (']' === c) {
                inClass = false;
            }
            continue;
        }
        if ('[' === c) {
            inClass = true;
            continue;
        }
        if ('(' === c && '?' !== norm[i + 1]) {
            count++;
        }
    }
    return count;
}
// One code point at `at`, as a count of UTF-16 units: the "advance by
// one rune" Go's matching loop performs after an empty match.
function stepAt(src, at) {
    const c = src.codePointAt(at);
    return undefined === c ? 1 : (0xFFFF < c ? 2 : 1);
}
// Every match of `re` in `src`, as [start, end, ...group pairs], under
// Go's rule: scanning resumes at the end of each match, and an empty
// match ADJACENT to the previous match's end is skipped rather than
// delivered. Written out because JavaScript has no equivalent and the
// difference is visible in `rep("aa", "a*", "-")`.
function allMatches(src, re) {
    const out = [];
    // Its own scanner, so `lastIndex` is this walk's to move: the caller's
    // regexp is shared with whatever else holds it.
    const scan = new RegExp(re.source, re.flags);
    let pos = 0;
    let prevEnd = -1;
    while (pos <= src.length) {
        scan.lastIndex = pos;
        const m = scan.exec(src);
        if (null === m) {
            break;
        }
        const start = m.index;
        const end = start + m[0].length;
        let accept = true;
        if (end === pos) {
            if (start === prevEnd) {
                accept = false;
            }
            pos += stepAt(src, pos);
        }
        else {
            pos = end;
        }
        prevEnd = end;
        if (accept) {
            out.push(m);
        }
    }
    return out;
}
// A substitution template expanded against one match. `$1`..`$9` are
// the numbered groups, `$&` the whole match and `$$` a literal `$`;
// anything else after a `$` names nothing, and naming nothing is a
// REFUSAL rather than a silent literal. A group the pattern does not
// have is the same refusal -- a generator that expands it to the empty
// string writes a file with a hole in it and says nothing.
function expandSub(sub, m, groups) {
    let out = '';
    for (let i = 0; i < sub.length; i++) {
        if ('$' !== sub[i]) {
            out += sub[i];
            continue;
        }
        const n = sub[i + 1];
        if ('$' === n) {
            out += '$';
            i++;
            continue;
        }
        if ('&' === n) {
            out += m[0];
            i++;
            continue;
        }
        if (undefined === n || '1' > n || '9' < n) {
            return undefined;
        }
        const g = n.charCodeAt(0) - 0x30;
        if (groups < g) {
            return undefined;
        }
        out += m[g] ?? '';
        i++;
    }
    return out;
}
// The fields `re` cuts `src` into, under Go's Split: an empty match at
// the very start opens no field, and a match ending at the end of the
// input closes none.
function splitRe(src, re) {
    const out = [];
    let beg = 0;
    let end = 0;
    for (const m of allMatches(src, re)) {
        end = m.index;
        if (0 !== m.index + m[0].length) {
            out.push(src.slice(beg, end));
        }
        beg = m.index + m[0].length;
    }
    if (end !== src.length) {
        out.push(src.slice(beg));
    }
    return out;
}
// An EMPTY separator yields the CODE POINTS, not the UTF-16 units a
// host split would give: `split("é", "")` is one field in both ports.
function splitLiteral(src, sep) {
    if ('' === sep) {
        return [...src];
    }
    return src.split(sep);
}
// The compiled form of a pattern argument, or the code naming what is
// wrong with it.
function compileRe(src) {
    const [norm, why] = (0, ConstraintVal_1.normaliseRe)(src);
    if ('' !== why) {
        return 'rep_pattern';
    }
    try {
        // The `u` flag is REQUIRED for parity, exactly as it is for `re()`:
        // without it JavaScript counts UTF-16 units where Go counts code
        // points.
        return new RegExp(norm, 'gu');
    }
    catch (e) {
        return 'rep_pattern';
    }
}
class EscFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isEscFunc = true;
    }
    make(_ctx, spec) { return new EscFuncVal(spec); }
    funcname() { return 'esc'; }
    resolve(ctx, args) {
        const src = textOf(args?.[0]);
        if (undefined === src) {
            return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this);
        }
        const variant = variantOf(args?.[1]);
        if (undefined === variant) {
            return (0, err_1.makeNilErr)(ctx, 'esc_variant', this);
        }
        return this.place(new StringVal_1.StringVal({ peg: (0, escape_1.escapeText)(src, variant) }, ctx));
    }
} /* node:coverage ignore next 2 */
exports.EscFuncVal = EscFuncVal;
class UscFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isUscFunc = true;
    }
    make(_ctx, spec) { return new UscFuncVal(spec); }
    funcname() { return 'usc'; }
    resolve(ctx, args) {
        const src = textOf(args?.[0]);
        if (undefined === src) {
            return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this);
        }
        const variant = variantOf(args?.[1]);
        if (undefined === variant) {
            return (0, err_1.makeNilErr)(ctx, 'esc_variant', this);
        }
        const [out, ok] = (0, escape_1.unescapeText)(src, variant);
        if (!ok) {
            return (0, err_1.makeNilErr)(ctx, 'usc_malformed', this);
        }
        return this.place(new StringVal_1.StringVal({ peg: out }, ctx));
    }
} /* node:coverage ignore next 2 */
exports.UscFuncVal = UscFuncVal;
class RepFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRepFunc = true;
    }
    make(_ctx, spec) { return new RepFuncVal(spec); }
    funcname() { return 'rep'; }
    resolve(ctx, args) {
        const src = textOf(args?.[0]);
        const pat = textOf(args?.[1]);
        const sub = textOf(args?.[2]);
        if (undefined === src || undefined === pat || undefined === sub) {
            return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this);
        }
        const re = compileRe(pat);
        if ('string' === typeof re) {
            return (0, err_1.makeNilErr)(ctx, re, this);
        }
        const groups = reGroupCount(re.source);
        let out = '';
        let at = 0;
        for (const m of allMatches(src, re)) {
            const piece = expandSub(sub, m, groups);
            if (undefined === piece) {
                return (0, err_1.makeNilErr)(ctx, 'rep_sub', this);
            }
            out += src.slice(at, m.index) + piece;
            at = m.index + m[0].length;
        }
        out += src.slice(at);
        return this.place(new StringVal_1.StringVal({ peg: out }, ctx));
    }
} /* node:coverage ignore next 2 */
exports.RepFuncVal = RepFuncVal;
class SplitFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isSplitFunc = true;
    }
    make(_ctx, spec) { return new SplitFuncVal(spec); }
    funcname() { return 'split'; }
    resolve(ctx, args) {
        const src = textOf(args?.[0]);
        if (undefined === src) {
            return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this);
        }
        // A PLAIN STRING IS A LITERAL and an `re(…)` is a pattern. The
        // asymmetry with `rep` is deliberate: splitting is usually on a
        // literal, replacing is usually by pattern, and it removes the trap
        // where `split(v, ".")` silently cuts between every character.
        const sep = args?.[1];
        const lit = textOf(sep);
        let fields;
        if (undefined !== lit) {
            fields = splitLiteral(src, lit);
        }
        else if (true === sep?.isConstraint && 1 === sep.res?.length) {
            fields = splitRe(src, new RegExp(sep.res[0].re.source, 'gu'));
        }
        else {
            return (0, err_1.makeNilErr)(ctx, 'split_sep', this);
        }
        const peg = fields.map((f, i) => new StringVal_1.StringVal({ peg: f }, ctx.descend(String(i))));
        return this.place(new ListVal_1.ListVal({ peg }, ctx));
    }
} /* node:coverage ignore next 8 */
exports.SplitFuncVal = SplitFuncVal;
//# sourceMappingURL=StrFuncVal.js.map
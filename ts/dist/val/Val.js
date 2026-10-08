"use strict";
/* Copyright (c) 2022-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_ERR = exports.SPREAD = exports.DONE = exports.Val = void 0;
exports.spreadId = spreadId;
exports.empty = empty;
exports.repathInstance = repathInstance;
const node_util_1 = require("node:util");
const site_1 = require("../site");
const provenance_1 = require("../provenance");
const DONE = -1;
exports.DONE = DONE;
const SPREAD = Symbol('spread');
exports.SPREAD = SPREAD;
// Shared frozen empty array for lazy err initialization.
// Most Vals never accumulate errors, so this avoids one allocation per Val.
// Frozen to catch accidental mutation (e.g. push) - callers that need a
// mutable error array must create their own.
const EMPTY_ERR = Object.freeze([]);
exports.EMPTY_ERR = EMPTY_ERR;
let ID = 1000;
class Val {
    get site() {
        return this._site ??= new site_1.Site();
    }
    set site(s) {
        this._site = s;
    }
    constructor(spec, ctx) {
        this.dc = 0;
        this.path = [];
        // Map of boolean flags.
        this.mark = {
            type: false,
            hide: false,
        };
        // Actual native value.
        this.peg = undefined;
        // Lazy err: shared empty array avoids allocation per Val.
        // Most Vals never accumulate errors. Only NilVal and top-level
        // results assign a real error array.
        this.err = EMPTY_ERR;
        this.explain = null;
        this._ctx = ctx;
        this.peg = spec?.peg;
        if (Array.isArray(this.peg)) {
            let spread = this.peg[SPREAD];
            this.peg = this.peg.filter(n => undefined !== n);
            this.peg[SPREAD] = spread;
        }
        // spec.path takes precedence over ctx.path: lets callers (notably
        // Val.clone) specify the target path without paying for a full
        // ctx.clone just to carry it.
        this.path = spec?.path ?? ctx?.path ?? [];
        this.id = ++ID;
        this.mark.type = !!spec.mark?.type;
        this.mark.hide = !!spec.mark?.hide;
    }
    ctx() {
        return this._ctx;
    }
    get done() {
        return this.dc === DONE;
    }
    same(peer) {
        return null == peer ? false : this.id === peer.id;
    }
    clone(ctx, spec) {
        let path = spec?.path;
        if (null == path) {
            let cut = this.path.indexOf('&');
            cut = -1 < cut ? cut + 1 : ctx.path.length;
            path = ctx.path.concat(this.path.slice(cut));
        }
        // Carry the target path via the spec instead of cloning ctx just
        // to hold it: the Val constructor now reads spec.path first. This
        // saves ~120k ctx.clone calls (two Object.create each) on a
        // foo-sdk-sized model.
        let fullspec = {
            peg: this.peg,
            mark: { type: this.mark.type, hide: this.mark.hide },
            ...(spec ?? {}),
            path,
        };
        let out = new this
            .constructor(fullspec, ctx);
        out.dc = this.done ? DONE : out.dc;
        // this.site is a lazy getter that always yields a Site, and Site's
        // constructor coerces row/col to numbers and url to a string, so the
        // spec value is the only one that can be absent.
        out.site.row = spec?.row ?? this.site.row;
        out.site.col = spec?.col ?? this.site.col;
        out.site.url = spec?.url ?? this.site.url;
        out.site.len = this.site.len;
        out.site.src = this.site.src;
        out.mark = Object.assign({}, this.mark, fullspec.mark ?? {});
        out.mark.type = this.mark.type && (fullspec.mark?.type ?? true);
        out.mark.hide = this.mark.hide && (fullspec.mark?.hide ?? true);
        // The LINK rider travels with the clone: the address a resolved
        // link POINTS AT is part of what the value is, and a copy of a
        // link is still a link.
        if (null != this.link) {
            out.link = this.link;
        }
        if (null != this.deprecation) {
            out.deprecation = this.deprecation;
        }
        if (null != this.meta) {
            out.meta = this.meta;
        }
        if (null != this.via) {
            out.via = this.via;
        }
        if (null != this.origin) {
            out.origin = this.origin;
        }
        if (null != this.emitted) {
            out.emitted = this.emitted;
        }
        if (null != this._spr) {
            ;
            out._spr = this._spr;
        }
        if (null != this._sid) {
            ;
            out._sid = this._sid;
        }
        if (true === this[provenance_1.WRITTEN]) {
            out[provenance_1.WRITTEN] = true;
        }
        if (null != this[provenance_1.INNER_OF]) {
            out[provenance_1.INNER_OF] = this[provenance_1.INNER_OF];
        }
        return out;
    }
    spreadClone(ctx) {
        const out = this.clone(ctx, { dup: true });
        repathInstance(out, out.path);
        return out;
    }
    get isPathDependent() {
        if (this._isPathDependent !== undefined)
            return this._isPathDependent;
        let dep = this.isRef || this.isKeyFunc || this.isPathFunc ||
            this.isMoveFunc || this.isSuperFunc;
        if (!dep) {
            const peg = this.peg;
            if (Array.isArray(peg)) {
                for (let i = 0; i < peg.length; i++) {
                    const c = peg[i];
                    if (c && c.isVal && c.isPathDependent) {
                        dep = true;
                        break;
                    }
                }
            }
            else if (peg != null && typeof peg === 'object') {
                for (const k in peg) {
                    const c = peg[k];
                    if (c && c.isVal && c.isPathDependent) {
                        dep = true;
                        break;
                    }
                }
            }
            if (!dep) {
                const spreadCj = this.spread?.cj;
                if (spreadCj && spreadCj.isPathDependent)
                    dep = true;
            }
        }
        this._isPathDependent = dep;
        return dep;
    }
    get holdsStaged() {
        if (true === this.staged) {
            return true;
        }
        const peg = this.peg;
        if (Array.isArray(peg)) {
            for (let i = 0; i < peg.length; i++) {
                if (true === peg[i]?.isVal && peg[i].holdsStaged)
                    return true;
            }
        }
        else if (null != peg && 'object' === typeof peg) {
            for (const k in peg) {
                if (true === peg[k]?.isVal && peg[k].holdsStaged)
                    return true;
            }
        }
        const spreadCj = this.spread?.cj;
        return true === spreadCj?.isVal && spreadCj.holdsStaged;
    }
    place(v) {
        v.site.row = this.site.row;
        v.site.col = this.site.col;
        v.site.url = this.site.url;
        v.site.len = this.site.len;
        v.site.src = this.site.src;
        if (true === this[provenance_1.WRITTEN]) {
            v[provenance_1.WRITTEN] = true;
        }
        if (null != this[provenance_1.INNER_OF]) {
            v[provenance_1.INNER_OF] = this[provenance_1.INNER_OF];
        }
        return v;
    }
    unify(_peer, _ctx) { return this; }
    errcanon() {
        return 0 === this.err.length ? '' : `<ERRS:${this.err.length}>`;
    }
    gen(_ctx) {
        return undefined;
    }
    notdone() {
        this.dc = DONE === this.dc ? DONE : this.dc + 1;
    }
    [node_util_1.inspect.custom](d, _opts, _inspect) {
        return this.inspect(d);
    }
    inspect(d) {
        d = null == d ? -1 : d;
        let s = ['<' + this.constructor.name.replace(/Val$/, '') + '/' + this.id];
        s.push('/@' + this.site?.row + ',' + this.site?.col);
        s.push('/' + this.path.join('.') + '/');
        s.push([
            DONE === this.dc ? 'D' : 'd' + this.dc,
            ...Object.entries(this.mark).filter(n => n[1]).map(n => n[0]).sort()
        ].filter(n => null != n).join(','));
        let insp = this.inspection(1 + d);
        if (null != insp && '' != insp) {
            s.push('/' + insp);
        }
        s.push('/');
        if (this.peg?.isVal) {
            s.push(this.peg.inspect(1 + d));
        }
        else if (null != this.peg && 'object' === typeof this.peg &&
            Object.entries(this.peg)[0]?.[1]?.isVal) {
            s.push(inspectpeg(this.peg, 1 + d));
        }
        else if ('function' === typeof this.peg) {
            s.push(this.peg.name);
        }
        else {
            s.push(this.peg?.toString?.() ?? '');
        }
        s.push('>');
        const out = s.join('');
        return out;
    }
    inspection(_d) {
        return '';
    }
}
exports.Val = Val;
Object.assign(Val.prototype, {
    isVal: true,
    isTop: false,
    isAbsent: false,
    isNil: false,
    isNull: false,
    isMap: false,
    isList: false,
    isScalar: false,
    isScalarKind: false,
    isRef: false,
    isPref: false,
    isVar: false,
    isBag: false,
    isNumber: false,
    isInteger: false,
    isString: false,
    isBoolean: false,
    isConjunct: false,
    isDisjunct: false,
    isExpect: false,
    isJunction: false,
    cjo: 99999,
    isOp: false,
    isPlusOp: false,
    isFunc: false,
    isCloseFunc: false,
    isCopyFunc: false,
    isHideFunc: false,
    isMoveFunc: false,
    isKeyFunc: false,
    isLowerFunc: false,
    isOpenFunc: false,
    isPathFunc: false,
    isPrefFunc: false,
    isSuperFunc: false,
    isTypeFunc: false,
    isUpperFunc: false,
    isGenable: false,
});
function repathInstance(v, path) {
    if (true !== v?.isVal) {
        return;
    }
    v.path = path;
    const peg = v.peg;
    if (true === v.isBag) {
        const spread = v.spread?.cj;
        if (null != spread && true === spread.isVal) {
            repathInstance(spread, path);
            spread.path = [...path, '&'];
        }
        if (true === v.isList) {
            for (let i = 0; i < peg.length; i++) {
                // Numeric, as the parser records list positions: a numeric
                // segment is what tells key() an element is not a keyed
                // position (KeyFuncVal.resolve, `positioned`).
                repathInstance(peg[i], [...path, i]);
            }
        }
        else {
            for (const k of Object.keys(peg)) {
                repathInstance(peg[k], [...path, k]);
            }
        }
    }
    else if (Array.isArray(peg)) {
        for (const t of peg) {
            repathInstance(t, path);
        }
    }
    else if (true === peg?.isVal) {
        repathInstance(peg, path);
    }
}
function inspectpeg(peg, d) {
    const indent = '  '.repeat(d);
    return pretty(Array.isArray(peg) ?
        ('[' + peg.map(n => '\n  ' + indent + (n.inspect?.(d) ?? n)).join(',') +
            '\n' + indent + ']') :
        ('{' +
            Object.entries(peg).map((n) => '\n  ' + indent + n[0] + ': ' +
                n[1].inspect(d)).join(',') +
            '\n' + indent + '}'));
}
function pretty(s) {
    return ((String(s))
        .replace(/\[Object: null prototype\]/g, '')
    // .replace(/([^\n]) +/g, '$1')
    );
}
function spreadId(cj) {
    return cj._sid ?? (cj._sid = cj.id);
}
function empty(o) {
    return ((Array.isArray(o) && 0 === o.length)
        || (null != o && 'object' === typeof o && 0 === Object.keys(o).length)
        || false);
} /* node:coverage ignore next 18 */
//# sourceMappingURL=Val.js.map
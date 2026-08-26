"use strict";
/* Copyright (c) 2022-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_ERR = exports.SPREAD = exports.DONE = exports.Val = void 0;
exports.nextValId = nextValId;
exports.empty = empty;
exports.repathInstance = repathInstance;
const node_util_1 = require("node:util");
const site_1 = require("../site");
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
// Process-global, monotonic Val id source. Correctness only requires ids
// to be unique within a single unify run (fast-path identity checks,
// `same()`), which holds. It is NOT reset between generate() calls, so in
// a long-running host (e.g. the LSP) it grows for the process lifetime;
// that is acceptable — an id is a small number and is never used as a
// memory key. TODO: switch to the per-run ctx.vc counter (see ctx.ts).
let ID = 1000;
// A fresh Val id, for the one carrier that cannot take the one its
// class fixes: TopVal pins `id = 0` (there is only one top), and the
// identity mark (G4 phase 1) resolves to a top that must NOT collide
// with it — the fast path in `unite` returns early on two done Vals
// with the same id, which would drop an identity before the rider
// could carry it.
function nextValId() {
    return ID++;
}
class Val {
    get site() {
        return this._site ??= new site_1.Site();
    }
    set site(s) {
        this._site = s;
    }
    // TODO: Site needed in ctor
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
        // TODO: make this work
        // this.id = spec?.id ?? (ctx ? ++ctx.vc : ++ID)
        this.id = ++ID;
        this.mark.type = !!spec.mark?.type;
        this.mark.hide = !!spec.mark?.hide;
        // console.log('BV', this.id, this.constructor.name, this.peg?.canon)
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
        // THE SPAN TRAVELS WITH THE POSITION. Copying row and col but not
        // the extent would leave a site that names a place and denies it has
        // any width — internally inconsistent, and it made the two ports
        // disagree on every derived value (the shared subsume rows caught
        // it). Safe because the span is VERIFIABLE: a consumer reads the
        // document at (row, col, len) and refuses when it does not match
        // `src`, so a span that has stopped describing its value is
        // detectable rather than believed. See ts/src/site.ts.
        //
        // Read from `this.site`, never from the spec: ValSpec.src is a
        // DIFFERENT field — ScalarVal's literal spelling, kept so `$.a.0x0`
        // addresses the key `0x0` — and reading it here would put a path
        // segment where a source span belongs.
        //
        // UNCONDITIONAL, as the Go twin is (clonePath, go/clone.go). A
        // guard dropping the span when the spec relocates the value was
        // written first and the coverage gate refused it as dead: nothing
        // clones to a new row or column. Should a relocating caller ever
        // appear it must drop both fields — an extent belongs to a place,
        // and the text at a new one is not this value's to claim.
        out.site.len = this.site.len;
        out.site.src = this.site.src;
        out.mark = Object.assign({}, this.mark, fullspec.mark ?? {});
        out.mark.type = this.mark.type && (fullspec.mark?.type ?? true);
        out.mark.hide = this.mark.hide && (fullspec.mark?.hide ?? true);
        // The two IDENTITY riders travel together, under one test: the
        // entity a value IS, and the address a resolved link POINTS AT.
        // One guard rather than two because the pair is what a clone
        // either carries or does not — and because a second test for the
        // link alone would be a branch no document takes, the reference
        // clone catching the pending residual before it ever resolves.
        if (null != this.entity || null != this.link) {
            out.entity = this.entity;
            out.link = this.link;
        }
        if (null != this.deprecation) {
            out.deprecation = this.deprecation;
        }
        return out;
    }
    // Shallow clone for spread constraints: creates a new Val with the
    // correct path context but shares non-path-dependent children.
    // Override in MapVal/ListVal to avoid deep-cloning simple children.
    //
    // A FULL INSTANCE (`dup`, ADR-005): a spread constraint is applied
    // once per destination child, and each application must own its
    // path-dependent innards — a bare clone shared a call's arguments
    // and a preference's inner value across destinations, so a spread
    // like `&: id(key(0)) & $.schema.C` resolved its one shared key()
    // at the first child it met (use-cases/BUGS.md §12's id_name form).
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
    place(v) {
        v.site.row = this.site.row;
        v.site.col = this.site.col;
        v.site.url = this.site.url;
        v.site.len = this.site.len;
        v.site.src = this.site.src;
        return v;
    }
    // CONTRACT: implementations should treat `this` and `peer` as
    // immutable and return a new Val. KNOWN EXCEPTION: the MapVal/ListVal
    // fast-path for a TOP peer returns and refines `this` in place (an
    // intentional optimization for the fixpoint loop). The practical
    // consequence is that a parsed/unified tree is SINGLE-USE — do not
    // re-unify or re-generate the same Val, and do not share it across
    // threads. The public Aontu.unify/generate entry points re-parse per
    // call, so this only matters if you hold and reuse a Val yourself.
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
        // let insp = this.inspection(inspect)
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
// Prototype-level defaults for Val's type-discriminator flags.
// Keeping these on the prototype (instead of per-instance class-field
// initializers) removes ~35 property writes from every Val construction
// and eliminates the corresponding hidden-class transitions. Subclasses
// override only the flags that differ, via their own class-field
// initializers (e.g. `MapVal.isMap = true`).
Object.assign(Val.prototype, {
    isVal: true,
    isTop: false,
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
// THE INSTANCE PATH NORMALISATION (ADR-005), the TS mirror of the Go
// port's setPaths (go/clone.go): assign every value in a freshly
// instantiated template the path the PARSER would have given it at the
// instance's destination. A deep instance clone (`dup`) copies values
// whose stored parse paths are argument-shaped — a func argument has
// no key of its own, a spread template lives under a '&' segment — and
// Val.clone's ctx-cut cannot rebase those: it derives the child path
// from the driving ctx alone and drops the segments in between, which
// is how a nested list spread inside a close()d template lost its
// parent key and every finding under it named the wrong path (the
// 06-k8s use case's env findings). One canonical walk instead:
// bag children descend by key (numeric for a list element, as the
// parser records them), a spread constraint sits under '&' with its
// content at the bag's own path, and junction members, operator
// operands, function arguments and a preference's value all sit AT
// their holder's path — exactly the parse-time shape.
function repathInstance(v, path) {
    if (true !== v?.isVal) {
        return;
    }
    v.path = path;
    const peg = v.peg;
    if (true === v.isBag) {
        const spread = v.spread?.cj;
        if (null != spread && true === spread.isVal) {
            // The spread's CONTENT is pathed at the bag (its fields land on
            // the bag's children); only its ROOT carries the '&' segment —
            // the same two steps as the Go twin's setPaths.
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
            Object.entries(peg).map((n) => '\n  ' + indent + n[0] + ': ' + // n[1].inspect(d)
                n[1].inspect(d)).join(',') +
            '\n' + indent + '}'));
}
function pretty(s) {
    return ((String(s))
        .replace(/\[Object: null prototype\]/g, '')
    // .replace(/([^\n]) +/g, '$1')
    );
}
function empty(o) {
    return ((Array.isArray(o) && 0 === o.length)
        || (null != o && 'object' === typeof o && 0 === Object.keys(o).length)
        || false);
} /* node:coverage ignore next 16 */
//# sourceMappingURL=Val.js.map
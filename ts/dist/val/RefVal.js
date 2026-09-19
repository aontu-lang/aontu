"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefVal = void 0;
exports.pendingMarkWrapper = pendingMarkWrapper;
const utility_1 = require("../utility");
const type_1 = require("../type");
const err_1 = require("../err");
const RecurseVal_1 = require("./RecurseVal");
const unify_1 = require("../unify");
const top_1 = require("./top");
const StringVal_1 = require("./StringVal");
const IntegerVal_1 = require("./IntegerVal");
const NumberVal_1 = require("./NumberVal");
const ConjunctVal_1 = require("./ConjunctVal");
const VarVal_1 = require("./VarVal");
const FeatureVal_1 = require("./FeatureVal");
const numkind_1 = require("./numkind");
const BigIntegerVal_1 = require("./BigIntegerVal");
const BigDecimalVal_1 = require("./BigDecimalVal");
// A path segment no spelling can produce, used when append meets a Val
// class it has no rule for. A key cannot contain a NUL, so this can never
// match, which turns a silent path-shortening bug into a visible miss.
const UNSPELLABLE_SEGMENT = '\u0000unspellable';
function pendingMarkWrapper(v) {
    if (true === v.isTypeFunc || true === v.isHideFunc) {
        return !v.done;
    }
    if (true === v.isConjunct && Array.isArray(v.peg)) {
        for (const t of v.peg) {
            if (pendingMarkWrapper(t)) {
                return true;
            }
        }
    }
    return false;
}
// The child a term of the walk can supply for one path segment, or
// undefined when it has none. A map or a list answers from its own
// members; a PENDING type()/hide() answers from its argument's, because
// the wrapper only marks and its argument is the structure the path
// names (see the call sites in `find`).
function markedChild(v, part) {
    if (true === v?.isMap || true === v?.isList) {
        return v.peg[part];
    }
    if (true === v?.isFunc
        && (true === v.isHideFunc || true === v.isTypeFunc)
        && (true === v.peg?.[0]?.isMap || true === v.peg?.[0]?.isList)) {
        return v.peg[0].peg[part];
    }
    return undefined;
}
const aliasname_1 = require("../aliasname");
class RefVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRef = true;
        this.isGenable = true;
        this.cjo = 32500;
        this.absolute = false;
        // The value an alias reference canons as, attached by expandAliases
        // after unification (see `canon` below). Not a ValSpec field: it is
        // a rendering of the settled tree, never a parse-time property.
        this.expansion = undefined;
        this.rxc = 0;
        this.prefix = false;
        this.peg = [];
        // The field initialiser (absolute = false) has just run, so only
        // the spec can carry absoluteness in (RefVal.clone re-passes it).
        this.absolute = true === spec.absolute;
        this.prefix = true === spec.prefix;
        for (let pI = 0; pI < spec.peg.length; pI++) {
            this.append(spec.peg[pI]);
        }
    }
    append(part) {
        let partval;
        if ('string' === typeof part) {
            partval = part;
            this.peg.push(partval);
        }
        else if (part instanceof StringVal_1.StringVal) {
            partval = part.peg;
            this.peg.push(partval);
        }
        else if (part instanceof IntegerVal_1.IntegerVal) {
            partval = part.src;
            this.peg.push(partval);
        }
        else if (part instanceof NumberVal_1.NumberVal) {
            let partvals = part.src.split('.');
            this.peg.push(...partvals);
        }
        else if (part instanceof BigIntegerVal_1.BigIntegerVal || part instanceof BigDecimalVal_1.BigDecimalVal) {
            this.peg.push(...part.src.split('.'));
        }
        else if (part instanceof VarVal_1.VarVal) {
            partval = part;
            this.peg.push(partval);
        }
        else if (part instanceof RefVal) {
            if (part.absolute) {
                this.absolute = true;
            }
            if (this.prefix) {
                if (part.prefix) {
                    this.peg.push('.');
                }
            }
            else {
                if (part.prefix) {
                    if (0 === this.peg.length) {
                        this.prefix = true;
                    }
                    else if (0 < this.peg.length) {
                        this.peg.push('.');
                    }
                }
            }
            this.peg.push(...part.peg);
        }
        else {
            this.peg.push(UNSPELLABLE_SEGMENT);
        }
    }
    unify(peer, ctx) {
        peer = peer ?? (0, top_1.top)();
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Ref', this, peer);
        let out = this;
        if (this.id !== peer.id) {
            let found = this.find(ctx);
            // `?? this` makes resolved non-nullish, so an unresolved reference
            // takes the RefVal arm below rather than a separate null arm.
            const resolved = found ?? this;
            if (resolved instanceof RefVal) {
                if (peer.isTop) {
                    out = this;
                }
                else if (peer.isNil) {
                    out = (0, err_1.makeNilErr)(ctx, 'ref[' + this.peg + ']', this, peer);
                }
                // same path
                else if (this.spelling ===
                    (true === peer.isRef ? peer.spelling : peer.canon)) {
                    out = this;
                }
                else {
                    // Ensure RefVal done is incremented
                    this.dc = type_1.DONE === this.dc ? type_1.DONE : this.dc + 1;
                    out = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
                }
            }
            else {
                // A NAME IS WHERE THE VALUE ENTERED THIS PATH; find() answers
                // a clone, so the use travels with it.
                const aname = this.aliasName;
                if (undefined !== aname) {
                    resolved.site.via = {
                        row: this.site.row, col: this.site.col,
                        url: this.site.url, src: this.site.src, name: aname,
                    };
                }
                out = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'RES') }) : ctx, resolved, peer, 'ref');
            }
            out.dc = type_1.DONE === out.dc ? type_1.DONE : this.dc + 1;
        }
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    find(ctx, snap) {
        let out = undefined;
        // Check if self.path starts with peg (cycle detection).
        // Element-by-element comparison avoids string join+startsWith allocations.
        let isprefixpath = this.peg.length <= this.path.length;
        if (isprefixpath) {
            for (let i = 0; i < this.peg.length; i++) {
                if (this.peg[i] !== this.path[i]) {
                    isprefixpath = false;
                    break;
                }
            }
        }
        // Degenerate case: peg is all empty strings (e.g. path("")) and path is empty.
        if (!isprefixpath && this.peg.length > 0 && this.path.length === 0) {
            let allEmpty = true;
            for (let i = 0; i < this.peg.length; i++) {
                if ('' !== this.peg[i]) {
                    allEmpty = false;
                    break;
                }
            }
            isprefixpath = allEmpty;
        }
        let refpath = [];
        let pI = 0;
        if (isprefixpath) {
            let degenerate = 0 === this.path.length;
            let target = [];
            for (let i = 0; i < this.peg.length && !degenerate; i++) {
                if ('string' !== typeof this.peg[i] || '' === this.peg[i]) {
                    degenerate = true;
                    break;
                }
                target.push(this.peg[i]);
            }
            if (degenerate) {
                out = (0, err_1.makeNilErr)(ctx, 'path_cycle', this);
            }
            else {
                const rec = new RecurseVal_1.RecurseVal({ target, xc: this.rxc }, ctx);
                rec.site = this.site;
                rec.path = [...this.path];
                out = rec;
            }
        }
        else {
            let parts = [];
            for (let pI = 0; pI < this.peg.length; pI++) {
                let part = this.peg[pI];
                if (UNSPELLABLE_SEGMENT === part) {
                    return (0, err_1.makeNilErr)(ctx, 'no_path', this);
                }
                if (part instanceof VarVal_1.VarVal) {
                    {
                        part = part.unify((0, top_1.top)(), ctx);
                        if (part.isNil) {
                            return;
                        }
                        else {
                            parts.push(part.isInteger ?
                                (0, numkind_1.integerDigits)(part.peg) : '' + part.peg);
                        }
                    }
                }
                else {
                    parts.push(part);
                }
            }
            if (this.absolute) {
                refpath = parts;
            }
            else {
                // A relative reference reads from the SIBLING scope: drop this
                // node's own key and append the written segments.
                refpath = this.path.slice(0, -1).concat(parts);
            }
            // A PARENT STEP OFF THE TOP names nothing, and underflows.
            let offtop = false;
            const reduced = [];
            for (const part of refpath) {
                if ('.' === part) {
                    if (0 === reduced.length) {
                        offtop = true;
                        break;
                    }
                    reduced.length = reduced.length - 1;
                    continue;
                }
                reduced.push(part);
            }
            refpath = reduced;
            let node = ctx.root;
            let nopath = offtop;
            if (!offtop && null != node) {
                for (; pI < refpath.length; pI++) {
                    let part = refpath[pI];
                    if (node.isMap) {
                        node = node.peg[part];
                    }
                    else if (node.isList) {
                        node = node.peg[part];
                    }
                    else if (true === node.isFunc
                        && (node.isHideFunc || node.isTypeFunc)
                        && (true === node.peg?.[0]?.isMap
                            || true === node.peg?.[0]?.isList)) {
                        node = node.peg[0].peg[part];
                    }
                    else if (true === node.isConjunct
                        && Array.isArray(node.peg)
                        && pendingMarkWrapper(node)) {
                        const kids = [];
                        for (const term of node.peg) {
                            const kid = markedChild(term, part);
                            if (undefined !== kid && null !== kid) {
                                kids.push(kid);
                            }
                        }
                        // No term has it YET. Not a miss: the conjunct is still
                        // folding, and the member may arrive with the fold.
                        if (0 === kids.length) {
                            break;
                        }
                        node = 1 === kids.length ?
                            kids[0] : new ConjunctVal_1.ConjunctVal({ peg: kids }, ctx);
                    }
                    else if (node.done) {
                        nopath = true;
                        break;
                    }
                    else {
                        break;
                    }
                    if (null == node) {
                        nopath = true;
                        break;
                    }
                }
            }
            const fixroot = ctx._fixroot;
            if (this.absolute && !offtop && null != fixroot
                && (nopath || pI !== refpath.length)) {
                nopath = false;
                pI = 0;
                let fnode = fixroot;
                for (; pI < refpath.length; pI++) {
                    const part = refpath[pI];
                    if (true === fnode.isMap || true === fnode.isList) {
                        fnode = fnode.peg[part];
                    }
                    else {
                        break;
                    }
                    if (null == fnode) {
                        break;
                    }
                }
                if (null != fnode && pI === refpath.length) {
                    node = fnode;
                }
                else {
                    nopath = true;
                }
            }
            if (nopath) {
                out = (0, err_1.makeNilErr)(ctx, 'no_path', this);
            }
            else if (pI === refpath.length) {
                out = node;
                if (undefined !== ctx.reads && null != node) {
                    // The root's own address is `$`, as the coverage walk spells
                    // it: a dot with nothing after it would match no path there.
                    // An alias is addressed by the NAME its source spells.
                    const aname = this.aliasName;
                    const addr = undefined === aname ?
                        '$' + refpath.map((seg) => '.' + seg).join('') :
                        '$.' + aname;
                    // AN ALIAS IS NOT A PATH. `%wire` names a value the document
                    // holds unevaluated and the tree never carries, so it is an
                    // address a rule can be reported AT and never a path coverage
                    // could call dead: it is stamped, and it is not in the set
                    // the model is measured against.
                    if (!refpath[0]?.startsWith('%')) {
                        ctx.reads.add(addr);
                    }
                    if (null == node.origin) {
                        ;
                        node.origin = addr;
                    }
                }
                if (null != out && (out.isRef || out.isFunc) &&
                    this.detectRefCycle(ctx)) {
                    out = (0, err_1.makeNilErr)(ctx, 'path_cycle', this);
                }
                else if (null != out && !snap && !this.mark._hide_found &&
                    pendingMarkWrapper(out)) {
                    out = undefined;
                }
                else if (null != out && !snap && true === ctx.argsnap &&
                    !out.done) {
                    out = undefined;
                }
                else if (null != out && !snap && (0, RecurseVal_1.containsRecurseOf)(out, this.peg)) {
                    const rec = new RecurseVal_1.RecurseVal({ target: [...this.peg], xc: this.rxc }, ctx);
                    rec.site = this.site;
                    rec.path = [...this.path];
                    out = rec;
                }
                // Types and hidden values are cloned and made concrete
                else if (null != out) { //  && (out.mark.type || out.mark.hide)) {
                    if (this.mark.type || this.mark.hide) {
                        out.mark.type = this.mark.type;
                        out.mark.hide = this.mark.hide;
                    }
                    if (this.mark._hide_found) {
                        out.mark.hide = true;
                    }
                    const lifted = true !== ctx.argsnap
                        || true === out.mark.type || true === out.mark.hide;
                    out = out.clone(ctx, { dup: !out.holdsStaged });
                    if (lifted) {
                        (0, utility_1.walk)(out, (_key, val) => {
                            val.mark.type = false;
                            val.mark.hide = false;
                            return val;
                        });
                    }
                }
            }
        }
        // console.log('REF-FIND', ctx.cc, this.id, selfpath, 'PEG=', pegpath, 'RP', pI, refpath.join('.'), descent, 'O=', out?.id, out?.canon, out?.done)
        return out;
    }
    detectRefCycle(ctx) {
        const chase = (ref, ancestors) => {
            const rp = ref.plainRefPath();
            if (null == rp) {
                return false;
            }
            const key = rp.join('\u0000');
            if (ancestors.has(key)) {
                return true;
            }
            let node = ctx.root;
            for (let i = 0; i < rp.length && null != node; i++) {
                node = (node.isMap || node.isList) ? node.peg[rp[i]] : undefined;
            }
            if (null == node) {
                return false;
            }
            // Terminates: each level adds a path to `ancestors` and refuses a
            // repeat, and the tree holds finitely many distinct paths.
            ancestors.add(key);
            let found = false;
            if (node.isRef) {
                found = chase(node, ancestors);
            }
            else if (node.isFunc && Array.isArray(node.peg)) {
                for (const arg of node.peg) {
                    if (null != arg && arg.isRef && chase(arg, ancestors)) {
                        found = true;
                        break;
                    }
                }
            }
            ancestors.delete(key);
            return found;
        };
        return chase(this, new Set());
    }
    // The resolved absolute path of a reference whose segments are all
    // plain strings; undefined when the ref has variable segments (no
    // cycle proof is attempted for those). Mirrors find's refpath
    // computation for the plain case, including the `.` prefix reduction.
    plainRefPath() {
        const parts = [];
        for (const p of this.peg) {
            if ('string' !== typeof p) {
                return undefined;
            }
            parts.push(p);
        }
        const refpath = this.absolute ? parts :
            this.path.slice(0, -1).concat(parts);
        const reduced = [];
        for (const p of refpath) {
            if ('.' === p) {
                // A parent step off the top of the path proves nothing.
                if (0 === reduced.length) {
                    return undefined;
                }
                reduced.length = reduced.length - 1;
            }
            else {
                reduced.push(p);
            }
        }
        return reduced;
    }
    same(peer) {
        return null == peer ? false : this.peg === peer.peg;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, {
            peg: this.peg,
            absolute: this.absolute,
            ...(spec || {})
        });
        out.expansion = this.expansion;
        // The recursion seed travels with the clone: a spread template is
        // cloned per destination, and each clone's residual must start
        // where the level it came from left off.
        out.rxc = this.rxc;
        return out;
    }
    // THE KEY THIS REFERENCE RESOLVES AGAINST, or undefined for a path
    // reference. `%u` is spelled internally as the root reference `$.%u`
    // (ALIASES.0.md), so an alias reference is an absolute reference of
    // one segment that is a name -- carrying the url of the file the
    // reference was WRITTEN in (ALIAS-FILE-SCOPE.0.md).
    get aliasKey() {
        return this.absolute && 1 === this.peg.length &&
            'string' === typeof this.peg[0] &&
            aliasname_1.ALIAS_NAME_RE.test((0, aliasname_1.aliasBareName)(this.peg[0])) ?
            this.peg[0] : undefined;
    }
    // What the source spells: the key without its scope.
    get aliasName() {
        const key = this.aliasKey;
        return undefined === key ? undefined : (0, aliasname_1.aliasBareName)(key);
    }
    // THE REFERENCE'S OWN SPELLING: the alias name, or the path. This is
    // the reference's identity (the snapshot key of a ref spread, the
    // same-path test in unify), which `canon` below is not once an
    // expansion is attached.
    get spelling() {
        const name = this.aliasName;
        if (undefined !== name) {
            return name;
        }
        return (this.absolute ? '$' : '') +
            (0 < this.peg.length ? '.' : '') +
            this.peg.map((p) => '.' === p ? '' :
                (p.isVal ? p.canon : '' + p))
                .join('.');
    }
    get canon() {
        if (undefined !== this.expansion) {
            return this.expansion.canon;
        }
        return this.spelling;
    }
    gen(ctx) {
        // Unresolved ref cannot be generated, so always an error.
        let nil = (0, err_1.makeNilErr)(ctx, 'ref', this, // (formatPath(this.peg, this.absolute) as any),
        undefined);
        nil.path = this.path;
        nil.site.url = this.site.url;
        nil.site.row = this.site.row;
        nil.site.col = this.site.col;
        return undefined;
    }
    inspection() {
        return [
            this.absolute ? 'absolute' : '',
            this.prefix ? 'prefix' : '',
        ].filter(p => '' != p).join(',');
    }
} /* node:coverage ignore next 6 */
exports.RefVal = RefVal;
//# sourceMappingURL=RefVal.js.map
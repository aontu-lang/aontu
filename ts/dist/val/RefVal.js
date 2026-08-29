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
// Is this value an unresolved type()/hide() call — or a conjunct still
// carrying one? A reference that lands on one must defer rather than
// clone it (see the call site in `find`): the marks such a call will
// stamp belong to the field it was WRITTEN at, and a clone resolving
// at the reference's site re-applies them after the reference's
// mark-clearing walk has already run. Only the two mark wrappers
// qualify — every other pending call resolves to an unmarked value,
// and the existing early-clone behaviour for those is pinned
// (move()/copy() ghost rows, hole-filling conjuncts).
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
class RefVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRef = true;
        this.isGenable = true;
        this.cjo = 32500;
        this.absolute = false;
        this.prefix = false;
        this.peg = [];
        // The field initialiser (absolute = false) has just run, so only
        // the spec can carry absoluteness in (RefVal.clone re-passes it).
        this.absolute = true === spec.absolute;
        this.prefix = true === spec.prefix;
        for (let pI = 0; pI < spec.peg.length; pI++) {
            this.append(spec.peg[pI]);
        }
        //console.log('RefVal', this.id, this.peg)
    }
    append(part) {
        let partval;
        // console.log('APPEND', part)
        if ('string' === typeof part) {
            partval = part;
            this.peg.push(partval);
        }
        else if (part instanceof StringVal_1.StringVal) {
            partval = part.peg;
            this.peg.push(partval);
        }
        else if (part instanceof IntegerVal_1.IntegerVal) {
            // partval = '' + part.peg
            partval = part.src;
            this.peg.push(partval);
        }
        // TODO: this is a bit of a hack, review
        // Seems like a fundamental ambiguity?
        // Resolved by path function
        else if (part instanceof NumberVal_1.NumberVal) {
            // let partvals: string[] = part.peg.toFixed(11).replace(/(\.0)?0+$/, '$1').split('.')
            let partvals = part.src.split('.');
            this.peg.push(...partvals);
        }
        // THE EXACT LEAVES ARE PATH TEXT LIKE ANY OTHER SPELLING. `0d1` as a
        // segment addresses the key literally spelled `0d1` -- the same key
        // `a:{0d1:7}` creates -- and is NOT the number 1, so it neither
        // indexes a list nor reaches a key spelled `1`.
        //
        // Without these branches the part fell off the end of the chain and
        // was SILENTLY DROPPED, so `$.a.0d0` resolved to `$.a` and handed back
        // the CONTAINER. That is a wrong value, not a miss -- strictly worse
        // than an error -- and it made `$.a.0d0` and `$.a.0d1` denote the same
        // location.
        else if (part instanceof BigIntegerVal_1.BigIntegerVal || part instanceof BigDecimalVal_1.BigDecimalVal) {
            // A bigdecimal splits on its point exactly as a float does, so
            // `$.x.0d1.5` addresses two levels.
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
        // A closed chain, deliberately. Every branch above ends in a push, so
        // an unhandled Val class used to fall through in SILENCE and shorten
        // the path by one segment -- which is how the two exact leaves, added
        // by the number tower, made references resolve to their own container.
        // A segment that cannot be spelled is pushed as one that cannot match,
        // so the reference misses loudly instead of succeeding wrongly.
        else {
            this.peg.push(UNSPELLABLE_SEGMENT);
        }
    }
    unify(peer, ctx) {
        peer = peer ?? (0, top_1.top)();
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Ref', this, peer);
        let out = this;
        if (this.id !== peer.id) {
            // TODO: not resolved when all Vals in path are done is an error
            // as path cannot be found
            // let resolved: Val | undefined = null == ctx ? this : ctx.find(this)
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
                else if (this.canon === peer.canon) {
                    out = this;
                }
                else {
                    // Ensure RefVal done is incremented
                    this.dc = type_1.DONE === this.dc ? type_1.DONE : this.dc + 1;
                    out = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
                }
            }
            else {
                out = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'RES') }) : ctx, resolved, peer, 'ref');
            }
            out.dc = type_1.DONE === out.dc ? type_1.DONE : this.dc + 1;
        }
        // console.log('REFVAL-UNIFY-OUT', ctx.cc, this.id, this.canon, this.done, 'P=', peer.id, peer.canon, peer.done, '->', out.id, out.canon, out.done)
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    // `snap` is set by snapshotRefSpread (MapVal): a SPREAD snapshot
    // wants the target's pre-resolution STRUCTURE — key()/path() still
    // unresolved, to be re-resolved per destination — so the
    // pending-mark-wrapper defer below must not apply to it. Deferring
    // there made the snapshot wait until the target's own key() had
    // resolved at the target, and the literal leaked into every
    // destination (the exact failure the snapshot exists to prevent —
    // test/spec/spread-type.tsv, spread-type-key-ref).
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
        // let descent = ''
        if (isprefixpath) {
            // THE DETECTOR'S ANSWER IS A RESIDUAL (RECURSION.0.md): a
            // self-reference under a guarded shape is the fixpoint the
            // author wrote, so the prefix hit mints the recursive residual
            // instead of refusing -- except the degenerate all-empty
            // spelling (path("")), which names nothing and keeps its
            // path_cycle. Only all-string paths recurse; anything else
            // keeps the conservative refusal.
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
                const rec = new RecurseVal_1.RecurseVal({ target }, ctx);
                rec.site = this.site;
                rec.path = [...this.path];
                out = rec;
            }
        }
        else {
            let parts = [];
            for (let pI = 0; pI < this.peg.length; pI++) {
                let part = this.peg[pI];
                // An unspellable segment MISSES BEFORE ANY LOOKUP. The marker
                // is NUL-prefixed because no spelling produces one, but a
                // document can still hold a key spelled with an escaped NUL
                // (`a:{" unspellable":7}`), and matching it would turn the
                // silent path-shortening this marker exists to prevent into a
                // different silent wrong value. The marker is a marker, never a
                // lookup key.
                if (UNSPELLABLE_SEGMENT === part) {
                    return (0, err_1.makeNilErr)(ctx, 'no_path', this);
                }
                if (part instanceof VarVal_1.VarVal) {
                    // EVERY `$name` IN A PATH IS AN ORDINARY VARIABLE. `$KEY`,
                    // `$SELF` and `$PARENT` used to be intercepted here by name;
                    // they are gone (ADR-009). `key()` is the replacement for
                    // `$KEY` and answers where a value LANDS rather than where it
                    // was written, `$SELF.x` was only ever `$.x`, and `$PARENT.x`
                    // was only ever `.x`.
                    {
                        part = part.unify((0, top_1.top)(), ctx);
                        if (part.isNil) {
                            // TODO: var not found, so can't find path
                            return;
                        }
                        else {
                            // The resolved variable IS a path segment: $seg.r with
                            // seg="x" reads ...x.r (previously the coerced value was
                            // dropped, silently reading the path without it).
                            //
                            // Integer kind renders its EXACT digits -- the FOURTH site
                            // to get this wrong (see integerDigits and #21). `'' + peg`
                            // on a JS number gives the shortest round-tripping form, so
                            // a variable bound to 2^60 addressed the key
                            // "1152921504606847000" and missed the real one. Go's
                            // ref.go dispatches on kind here and was already correct.
                            //
                            // Every other kind is already right under `'' +`: a bigint
                            // and a Decimal stringify to exact digits, and a float must
                            // keep JS parity.
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
            let sep = '.';
            refpath = refpath
                .reduce(((a, p) => (p === sep ? a.length = a.length - 1 : a.push(p), a)), []);
            let node = ctx.root;
            let nopath = false;
            if (null != node) {
                for (; pI < refpath.length; pI++) {
                    let part = refpath[pI];
                    // console.log('PART', pI, part, node)
                    // descent += (' | ' + pI + '=' + node.canon) // Util.inspect(node))
                    if (node.isMap) {
                        node = node.peg[part];
                    }
                    else if (node.isList) {
                        node = node.peg[part];
                    }
                    // A PENDING MARK WRAPPER IS TRANSPARENT TO THE WALK: hide()
                    // and type() only mark, and their argument is the structure
                    // the path names. Without this, two sibling schemas in one
                    // hide() bag deadlock -- the wrapper waits for its argument,
                    // the argument's members wait for references that walk into
                    // the unresolved wrapper (BUGS.md §53's family; the
                    // recursive Policy/Step pair found it again). The found node
                    // is cloned and mark-cleared exactly as any reference target
                    // is, and the wrapper still marks its own field.
                    else if (true === node.isFunc
                        && (node.isHideFunc || node.isTypeFunc)
                        && (true === node.peg?.[0]?.isMap
                            || true === node.peg?.[0]?.isList)) {
                        node = node.peg[0].peg[part];
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
            // console.log('REFPATH', ctx.cc, pI, refpath, nopath, ctx.root, node)
            if (nopath) {
                out = (0, err_1.makeNilErr)(ctx, 'no_path', this);
            }
            else if (pI === refpath.length) {
                out = node;
                // A reference landing on another reference -- or on a FUNCTION,
                // whose arguments the chase now follows (issue #35) -- may be a
                // PROVEN mutual cycle (a: $.b, b: $.a; a: $.b, b: upper($.a)).
                // Follow the chain and, if it returns to a node still open above
                // it, report path_cycle now instead of deferring every pass and
                // dying later as a spent budget. No proof (the chain leaves plain
                // refs and calls, or ends) defers as before.
                if (null != out && (out.isRef || out.isFunc) &&
                    this.detectRefCycle(ctx)) {
                    out = (0, err_1.makeNilErr)(ctx, 'path_cycle', this);
                }
                // A PENDING MARK WRAPPER IS NOT YET A VALUE TO COPY (ADR-005).
                // A type()/hide() call still waiting for its argument — an
                // alias reference inside a type() body, a generator inside a
                // hide() — would be cloned here as the CALL, and the clone
                // then resolves at the REFERENCE's site, stamping marks that
                // the mark-clearing walk below has already run too early to
                // clear. That is how a type-marked alias silently suppressed
                // the referring field's emission (use-cases/BUGS.md §12), how
                // `hide(pack(...))` leaked its mark onto downstream packs
                // (§11), and how hide() around a computed field swallowed the
                // value into a silent [] (§35b). Defer instead: the reference
                // residuates until the wrapper has resolved at its OWN field,
                // and the ordinary marked-value path below then clears the
                // marks on the clone as documented. The move() reference
                // (`_hide_found`) is exempt: a move TRANSPLANTS the pending
                // call, and the ghost rows (test/spec/func.tsv) pin that its
                // innards resolve at the destination.
                else if (null != out && !snap && !this.mark._hide_found &&
                    pendingMarkWrapper(out)) {
                    out = undefined;
                }
                // A STAGED ARGUMENT SNAPSHOTS A SETTLED SOURCE (the argsnap
                // flag, set by driveStagedArgs). A generator's data argument is
                // a copy OUTSIDE the tree, so anything in the target that still
                // resolves against its own tree location — a spread-injected
                // relative reference, a pending template — must finish there
                // BEFORE the copy is taken: cloned earlier, the copy's rebased
                // relative refs dangle under the generator and the model dies
                // as *_no_gen with the generator never firing. Deferring here
                // is exactly the documented staging rule: the generator waits
                // for the source, then snapshots it whole.
                else if (null != out && !snap && true === ctx.argsnap &&
                    !out.done) {
                    out = undefined;
                }
                // A REFERENCE TO A RECURSIVE DEFINITION IS THE FIXPOINT
                // REFERENCE (RECURSION.0.md): resolving it to a clone
                // unrolled the schema one level, and every reparse of a
                // canon then unrolled one more -- canon never converged. The
                // residual is the resolved form, exactly as at the prefix
                // positions inside the definition.
                else if (null != out && !snap && (0, RecurseVal_1.containsRecurseOf)(out, this.peg)) {
                    const rec = new RecurseVal_1.RecurseVal({ target: [...this.peg] }, ctx);
                    rec.site = this.site;
                    rec.path = [...this.path];
                    out = rec;
                }
                // Types and hidden values are cloned and made concrete
                else if (null != out) { //  && (out.mark.type || out.mark.hide)) {
                    // console.log('FOUND-A', out)
                    if (this.mark.type || this.mark.hide) {
                        out.mark.type = this.mark.type;
                        out.mark.hide = this.mark.hide;
                        // walk(out, (_key: string | number | undefined, val: Val) => {
                        //   val.mark.type = this.mark.type
                        //   val.mark.hide = this.mark.hide
                        //   return val
                        // })
                    }
                    if (this.mark._hide_found) {
                        out.mark.hide = true;
                    }
                    // console.log('FOUND-B', out)
                    out = out.clone(ctx);
                    // if (this.mark.type || this.mark.hide) {
                    (0, utility_1.walk)(out, (_key, val) => {
                        val.mark.type = false;
                        val.mark.hide = false;
                        // REFERENCES DO NOT CARRY IDENTITY (G4 phase 1, clearing
                        // rule 1). The clone is a copy of an entity, not the
                        // entity: without this, `w:b:$.q.a & {y:2,z:3}` (row
                        // `ref-and-merge`, test/spec/ref.tsv) would push `y:2`
                        // back into `q.a` through the identity merge — pinned
                        // behaviour, silently changed by a mark the author never
                        // wrote at the reference site.
                        //
                        // The LINK is NOT cleared (G4 phase 3): an identity says
                        // what a value IS, so a copy must not be that entity; a
                        // link says what a value POINTS AT, and a copy of a link
                        // points at the same thing.
                        val.entity = undefined;
                        return val;
                    });
                    //}
                    // onsole.log('FOUND-C', out)
                }
            }
        }
        // console.log('REF-FIND', ctx.cc, this.id, selfpath, 'PEG=', pegpath, 'RP', pI, refpath.join('.'), descent, 'O=', out?.id, out?.canon, out?.done)
        return out;
    }
    // Follow the chain of plain references from this node; true iff the
    // chain revisits a node -- a PROVEN reference cycle, distinct from a
    // merely unresolved reference. Detection is only on the resolution
    // chain revisiting a node, never on syntactic shape: a chain that
    // passes through a variable segment, a conjunct or any other non-ref
    // value yields no proof and the ref defers as before.
    //
    // A FUNCTION is followed, through its arguments (issue #35). A
    // function resolves only once every argument does, so a chain that
    // reaches `b:upper($.a)` and out through `$.a` has proved the same
    // dependency a bare `b:$.a` proves -- `a:$.b b:upper($.a)` is a cycle
    // whichever link wears the call. Without this the shape exhausted the
    // depth budget instead: a `unify_cycle`, which under the G5 taxonomy
    // means "retry with more may help", where a proven structural cycle is
    // FIX THE MODEL. A conjunct and a disjunct stay unfollowed for reasons
    // that are not the same: a disjunct member may simply not be taken, so
    // reaching one proves nothing; a conjunct would be sound to follow, and
    // is left out only because nothing needs it yet.
    //
    // The Go port reaches the same verdict on this shape by a DIFFERENT
    // arm, and that difference outlives this method: its clonePath re-paths
    // a resolved clone to the referring site, so the inner `$.a` lands at
    // path [a] and the plain isprefixpath test proves the cycle before any
    // chase is needed. TypeScript's clone keeps the source paths. ADR-001
    // asks for arm-for-arm correspondence, so the clone-path difference is
    // worth closing on its own; it is wider than this issue and both ports
    // now agree on the verdict and the code either way.
    detectRefCycle(ctx) {
        // Depth-first with an explicit ANCESTOR set, because a function may
        // carry several reference arguments and the cycle can run through
        // any one of them. The set holds the chain currently being walked,
        // not every node ever walked: revisiting a node reached down a
        // DIFFERENT branch is an ordinary shared reference (two keys reading
        // one third key), and only revisiting one that is still open above
        // us is a cycle.
        //
        // Identity is the RESOLVED PATH, not the RefVal instance: the same
        // target can be reached through distinct ref instances, and it is
        // returning to the same place that closes a loop.
        const chase = (ref, ancestors) => {
            const rp = ref.plainRefPath();
            if (null == rp) {
                return false;
            }
            const key = rp.join(' ');
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
        return out;
    }
    get canon() {
        let str = (this.absolute ? '$' : '') +
            (0 < this.peg.length ? '.' : '') +
            // this.peg.join(this.sep)
            this.peg.map((p) => '.' === p ? '' :
                (p.isVal ? p.canon : '' + p))
                .join('.');
        return str;
    }
    gen(ctx) {
        // Unresolved ref cannot be generated, so always an error.
        let nil = (0, err_1.makeNilErr)(ctx, 'ref', this, // (formatPath(this.peg, this.absolute) as any),
        undefined);
        // TODO: refactor to use Site pointer
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
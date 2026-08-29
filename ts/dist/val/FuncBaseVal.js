"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuncBaseVal = void 0;
exports.trialUnify = trialUnify;
const type_1 = require("../type");
const unify_1 = require("../unify");
const utility_1 = require("../utility");
const err_1 = require("../err");
const top_1 = require("./top");
const ConjunctVal_1 = require("../val/ConjunctVal");
const FeatureVal_1 = require("../val/FeatureVal");
const PlaceVal_1 = require("../val/PlaceVal");
// A TRIAL meet: does `a` unify with `b`, and if so as what? Failure is
// an ANSWER here rather than an error, which is exactly what
// DisjunctVal already needs when it tries each member against a peer —
// so this is that mechanism (`ctx._trialMode`, which makes makeNilErr
// return the shared TRIAL_NIL instead of allocating and recording),
// lent to the combinators that select by unifiability.
//
// The error list and the trial flag are saved and restored in a
// `finally`: a trial that throws must not leave the surrounding
// evaluation collapsing every later error into the sentinel.
function trialUnify(ctx, a, b) {
    const savedErr = ctx.err;
    const savedTrial = ctx._trialMode;
    const trialErr = [];
    ctx.err = trialErr;
    ctx._trialMode = true;
    let out;
    try {
        out = (0, unify_1.unite)(ctx, a, b, 'trial');
    }
    finally {
        ctx.err = savedErr;
        ctx._trialMode = savedTrial;
    }
    return 0 < trialErr.length || out.isNil ? undefined : out;
}
class FuncBaseVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isFunc = true;
        this.isGenable = true;
        // THE STAGING RULE (G8 phase 0, see AontuContext.settle). A func
        // whose answer depends on WHERE IT IS -- `key()`, whose answer is a
        // segment of its own path, and the generation combinators, whose
        // data argument can still be merged into by a sibling -- sets this
        // and residuates until the model stops moving. Everything else
        // resolves as soon as its arguments are done, which is the rule that
        // has always been here.
        this.staged = false;
        // console.log('FBV', this.id, this.constructor.name, this.peg?.[0]?.canon)
    }
    validateArgs(args, min) {
        if (min < args.length) {
            // TODO: this is an error as as a parse error, needs to be handled same way
            throw new err_1.AontuError('The ' + this.funcname() + ' function needs at least ' +
                min + ' argument' + (1 === min ? '' : 's') + '.');
        }
    }
    make(ctx, _spec) {
        return (0, err_1.makeNilErr)(ctx, 'func:' + this.funcname(), this, undefined, 'make');
    }
    // Drive the first `count` arguments IN PLACE, every pass — not only
    // on the settle pass. A staged func waits for the model to settle,
    // and its own arguments are part of that model: leaving them
    // standing until settle would guarantee the model was still moving
    // when settle arrived. Answers whether they are all done, which is
    // the other half of "ready to fire".
    driveStagedArgs(ctx, count) {
        const TOP = (0, top_1.top)();
        let alldone = true;
        // THE SNAPSHOT WAITS FOR THE SOURCE (the spread-then-pack defect,
        // use-cases/BUGS.md pack-refs family). A reference resolving inside
        // a staged argument is this argument's SNAPSHOT of its source, and
        // the snapshot is not part of the tree: a spread-injected relative
        // reference inside a too-early copy dangles at the argument's
        // location (`.containerPort` rebased under the generator, where no
        // root traversal reaches it) and the generator never fires. The
        // `argsnap` flag makes RefVal.find defer until the target has
        // finished resolving IN THE TREE — where its own spreads and
        // relative references answer at their real location — and only then
        // take the copy. Inherited by every descended ctx, so a reference
        // anywhere in the argument subtree waits the same way.
        const actx = ctx.clone({});
        actx.argsnap = true;
        for (let i = 0; i < count && i < this.peg.length; i++) {
            const arg = this.peg[i];
            if (!arg.done) {
                // Charged to the depth budget, as FuncBaseVal's own arg loop is:
                // this recurses without going through `unite`.
                this.peg[i] = (0, unify_1.withDepth)(ctx, arg, TOP, () => arg.unify(TOP, actx));
            }
            alldone = alldone && true === this.peg[i].done;
        }
        return alldone;
    }
    // THE PER-DESTINATION INSTANTIATION RULE (ADR-005). The default
    // clone shares the argument array AND the argument Vals — pinned
    // sharing for the move()/copy() ghost artifacts (test/spec/func.tsv,
    // ghost-*-innard-canon) — but a clone that is a template INSTANCE
    // must own the full inner structure: with the args shared,
    // `pack($.names, close({name: key()}))` resolved key() once inside
    // the one shared inner map and stamped the FIRST child's key on
    // every child (use-cases/BUGS.md §8). The `dup` spec flag asks for
    // that depth; everything else keeps the sharing it has always had.
    clone(ctx, spec) {
        const out = super.clone(ctx, spec);
        if (true === spec?.dup && Array.isArray(this.peg)) {
            // Every argument is a Val by construction (the parser builds
            // them; make() rebuilds from driven Vals), as the Go twin's
            // []Val typing states outright. The instantiation sites then
            // normalise every path in the clone (repathInstance), so the
            // argument-shaped parse paths never leak into an instance.
            out.peg = this.peg.map((a) => a.clone(ctx, { dup: true }));
        }
        return out;
    }
    // The shape a staged func holds while it waits: not done, so the pass
    // loop keeps going; unchanged against TOP, so nothing reads an answer
    // it has not given; and collapsed against an identical twin at the
    // same position, so `key() & key()` does not grow a conjunct per pass.
    residuate(peer, ctx) {
        this.notdone();
        if (peer.isTop || (peer.id === this.id)) {
            // Cloned rather than returned: a driver that met the same object
            // twice in one pass would charge the revisit budget and report
            // `unify_cycle`.
            return this.clone(ctx);
        }
        if (peer.isNil) {
            return peer;
        }
        if (peer.isFunc
            && peer.funcname() === this.funcname()
            && peer.path.join('.') === this.path.join('.')
            && peer.canon === this.canon) {
            return this;
        }
        return new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
    }
    unify(peer, ctx) {
        if (this.staged && !ctx.settle) {
            return this.residuate(peer, ctx);
        }
        // THE PLACEHOLDER (G8 phase 3, see PlaceVal). A call holding a hole
        // waits for a peer, and the peer is what fills it: the call is
        // rebuilt with the hole replaced and resolved on the spot, so
        // `upper(_) & hello` is `"HELLO"` and not `"HELLO" & "hello"` --
        // the peer went INTO the call, it is not also a constraint on the
        // way out.
        if (!peer.isTop && !peer.isNil && this.id !== peer.id && (0, PlaceVal_1.hasPlace)(this)) {
            // TWO HOLES AND NOTHING TO FILL THEM. `upper(_) & lower(_)` has
            // no value on either side, and picking one call to be the other's
            // filling would be inventing an order the language does not have.
            if ((0, PlaceVal_1.hasPlace)(peer)) {
                return (0, err_1.makeNilErr)(ctx, 'place_pair', this, peer);
            }
            return (0, PlaceVal_1.fillPlace)(this, peer, ctx).unify((0, top_1.top)(), ctx);
        }
        const TOP = (0, top_1.top)();
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Func:' + this.funcname(), this, peer);
        // const sc = this.id + '=' + this.canon
        // const pc = peer.id + '=' + peer.canon
        let why = '';
        let out = this;
        // console.log('FBV', this.id, this.constructor.name, this.mark.type, this.peg?.canon, 'PEER', peer.id, peer.canon)
        let pegdone = true;
        if (this.id !== peer.id) {
            if (peer.isTop && (this.mark.type || this.mark.hide)) {
                this.dc = type_1.DONE;
            }
            else {
                let newpeg = [];
                let newtype = this.mark.type;
                let newhide = this.mark.hide;
                let pegprep = this.prepare(ctx, this.peg);
                if (null === pegprep) {
                    pegdone = true;
                    newpeg = this.peg;
                }
                else {
                    this.peg = pegprep;
                    for (let arg of this.peg) {
                        // console.log('FUNCBASE-UNIFY-PEG-A', arg.canon)
                        let newarg = arg;
                        if (!arg.done) {
                            // Charged to the depth budget: this recurses without going
                            // through `unite`, so the counter would otherwise stay flat
                            // while the stack grows (see withDepth in unify.ts). The
                            // arg context is built OUTSIDE the closure so its explain
                            // ternary stays one branch rather than one per call.
                            const argctx = te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'ARG') }) : ctx;
                            newarg = (0, unify_1.withDepth)(ctx, arg, TOP, () => arg.unify(TOP, argctx));
                            newtype = newtype || newarg.mark.type;
                            newhide = newhide || newarg.mark.hide;
                            // console.log('FUNCBASE-UNIFY-PEG-B', arg.canon, arg.done, '->', newarg.canon, newarg.done)
                        }
                        // pegdone &&= arg.done
                        pegdone &&= newarg.done;
                        newpeg.push(newarg);
                    }
                }
                // console.log('FUNCBASE-PEG', this.id, pegdone, this.peg.map((p: any) => p?.canon))
                if (pegdone && !this.deferResolve(ctx, newpeg)) {
                    const resolved = this.resolve(ctx, newpeg);
                    // console.log('FUNC-RESOLVED', ctx.cc, resolved?.canon)
                    // The TOP peer is DROPPED as the unit it is — unless it
                    // carries an identity (G4 phase 1), which is content rather
                    // than the unit: `id(x) & id(y)` resolves both sides to a
                    // top, and taking this shortcut would silently keep one
                    // name and lose the other instead of refusing the pair.
                    out = resolved.done && peer.isTop && null == peer.entity ? resolved :
                        (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'PEG') }) : ctx, resolved, peer, 'func-' + this.funcname() + '/' + this.id);
                    (0, utility_1.propagateMarks)(this, out);
                    // TODO: make should handle this using ctx?
                    out.site.row = this.site.row;
                    out.site.col = this.site.col;
                    out.site.url = this.site.url;
                    // THE SPAN COMES WITH THE POSITION, always. Moving row and
                    // col onto the result while leaving its own text behind
                    // produced a site that contradicted itself: `close({...})`
                    // reported the call's column and the map's `{`, so reading
                    // the document at (row, col, len) found `c` where `src` said
                    // `{`. A consumer following the verification contract would
                    // refuse every such repair; one skipping it would edit the
                    // wrong token. Whatever the position names, the text names
                    // too. Twin: the same assignment in go/func.go.
                    out.site.len = this.site.len;
                    out.site.src = this.site.src;
                    out.path = this.path;
                    why += 'pegdone';
                }
                else if (peer.isTop) {
                    this.notdone();
                    out = this.make(ctx, { peg: newpeg, mark: { type: newtype, hide: newhide } });
                    // TODO: make should handle this using ctx?
                    out.site.row = this.site.row;
                    out.site.col = this.site.col;
                    out.site.url = this.site.url;
                    // THE SPAN COMES WITH THE POSITION, always. Moving row and
                    // col onto the result while leaving its own text behind
                    // produced a site that contradicted itself: `close({...})`
                    // reported the call's column and the map's `{`, so reading
                    // the document at (row, col, len) found `c` where `src` said
                    // `{`. A consumer following the verification contract would
                    // refuse every such repair; one skipping it would edit the
                    // wrong token. Whatever the position names, the text names
                    // too. Twin: the same assignment in go/func.go.
                    out.site.len = this.site.len;
                    out.site.src = this.site.src;
                    out.path = this.path;
                    why += 'top';
                }
                else if (peer.isNil) {
                    this.notdone();
                    out = peer;
                    why += 'nil';
                }
                else {
                    this.notdone();
                    out = new ConjunctVal_1.ConjunctVal({
                        peg: [this, peer], mark: { type: newtype, hide: newhide }
                    }, ctx);
                    // TODO: make should handle this using ctx?
                    out.site.row = this.site.row;
                    out.site.col = this.site.col;
                    out.site.url = this.site.url;
                    // THE SPAN COMES WITH THE POSITION, always. Moving row and
                    // col onto the result while leaving its own text behind
                    // produced a site that contradicted itself: `close({...})`
                    // reported the call's column and the map's `{`, so reading
                    // the document at (row, col, len) found `c` where `src` said
                    // `{`. A consumer following the verification contract would
                    // refuse every such repair; one skipping it would edit the
                    // wrong token. Whatever the position names, the text names
                    // too. Twin: the same assignment in go/func.go.
                    out.site.len = this.site.len;
                    out.site.src = this.site.src;
                    out.path = this.path;
                    why += 'defer';
                }
            }
        }
        // console.log('FUNC-UNIFY-OUT', ctx.cc, this.funcname(), this.id, this.canon, 'D=', pegdone, 'W=', why, peer.id, peer.canon, 'O=', out.dc, out.id, out.canon)
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    get canon() {
        return '' +
            // (this.type ? '<type>' : '') +
            // (this.done ? '<done>' : '') +
            // (this.id + '=') +
            this.funcname() + '(' + (this.peg.map((p) => p.canon).join(',')) + ')';
    }
    funcname() {
        return 'func';
    }
    prepare(_ctx, args) {
        return args;
    }
    resolve(ctx, _args) {
        return (0, err_1.makeNilErr)(ctx, 'func:' + this.funcname(), this, undefined, 'resolve');
    }
    // A function may hold its resolution for a later pass even with its
    // arguments settled -- it then rides the ordinary args-not-done
    // path, residuating as any unresolved call does. Bare id() defers on
    // marks that only exist after the first pass (IdFuncVal); super()
    // defers on a recursion residual argument (SuperFuncVal), which is
    // why the DRIVEN arguments are passed: this.peg still holds the
    // undriven originals at the decision point.
    deferResolve(_ctx, _args) {
        return false;
    }
} /* node:coverage ignore next 6 */
exports.FuncBaseVal = FuncBaseVal;
//# sourceMappingURL=FuncBaseVal.js.map
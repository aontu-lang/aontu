"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrefVal = void 0;
exports.prefInnerPeg = prefInnerPeg;
const type_1 = require("../type");
const unify_1 = require("../unify");
const err_1 = require("../err");
const utility_1 = require("../utility");
const top_1 = require("./top");
const FeatureVal_1 = require("./FeatureVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const SuperFuncVal_1 = require("./SuperFuncVal");
// The innermost preferred value under every pref layer: the value a
// preference of ANY rank ultimately defends, and the one generation
// emits for it. Shared by the disjunct admission gate (DisjunctVal),
// the defaulted-scrutinee rule (MatchFuncVal) and the effective-default
// walk (subsume.ts) so "the default's value" cannot mean three things.
function prefInnerPeg(v) {
    let out = v;
    while (true === out?.isPref) {
        out = out.peg;
    }
    return out;
}
// A CONTAINER DEFAULT IS LEAFWISE (ADR-011 R3,
// docs/design/DEFAULTS.0.md): `*{p:1}` MEANS `{p: *1}` and `*[1]`
// means `[*1]`, so there is no such thing as a preference whose
// preferred value is a bag. Shape is not a value and takes no star --
// key optionality, closedness and a `&:` spread template ride through
// untouched; only the values a reader could override are defaulted.
//
// This is the rule `pref()` already had (its resolve walked and
// wrapped every scalar child) and the star prefix did not, so the two
// spellings of one operator disagreed: `pref({p:1}) & {q:2}` kept the
// `p` default and `*{p:1} & {q:2}` dropped it. Both spellings and the
// resolve-time case (`*$.shape`) come through here now, so they
// cannot drift apart again. Wrapping the non-bag arm rather than
// walking for scalars also closes the other half of that gap:
// `pref(integer)` and `pref(min(3))` used to answer the bare value,
// losing the preference outright.
class PrefVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPref = true;
        this.isGenable = true;
        this.cjo = 30000;
        // THE GATE AN OVERRIDING PEER MUST PASS IS `superpeg` ITSELF — the
        // preferred value's own KIND, not its family.
        //
        // A preference is a DEFAULT, so a concrete peer replaces it, but only
        // where the peer is the same kind of thing: `*lower(1.1) & a` is a
        // conflict, not an override. The number tower made `integer` and
        // `float` disjoint siblings under `number`, and this gate used to
        // widen to that family — so `*2.2 & 3` worked, and so did
        // `*8080 & 3.5`. Those are ONE rule in two directions; no kind-based
        // gate can keep the first and refuse the second.
        //
        // Refusing both is the choice, because the second is the documented
        // default idiom: `port: *8080 | integer` accepted 3.5 in both ports,
        // silently widening every key written that way from integer to
        // number — the finding §6 of the 2026-08-21 status report calls the
        // most consequential, precisely because docs/skill/examples.md
        // teaches the idiom to agents.
        //
        // What the tightening costs is named rather than hidden: mixing the
        // numeric leaves around a preference is now an error instead of a
        // silent widening. `*1.5 & integer` used to answer `integer` and
        // DISCARD a default that could never apply; it now says so.
        this.rank = 0;
        // this.pref = spec.pref || spec.peg
        // this.superpeg = makeSuper(spec.peg)
        if (spec.peg instanceof PrefVal) {
            this.rank = 1 + spec.peg.rank;
        }
        this.resuper(ctx);
        // console.log('PVC', this.peg.canon, this.superpeg.canon)
    }
    // Recompute the type yardstick and the override gate from the current
    // peg. Called again whenever the peg resolves (e.g. a ref).
    //
    // THE GATE IS super() (ADR-011 R4, docs/design/DEFAULTS.0.md). `*x`
    // is sugar for `*x | super(x)`, so the type an overriding peer must
    // pass is the one the long form spells out loud -- one function, not
    // a second implementation that agrees with it on the common case.
    // Two special cases retired with the switch: a KIND peg gated
    // nothing (`*integer` was overridden by `"s"`) and a CONSTRAINT peg
    // had no gate at all, both written when a kind's superior was top.
    // `super(integer)` is `number`, so `7` still wins and `"s"` refuses.
    resuper(ctx) {
        // THE RANK-UNIFORM MEET (ADR-004). The yardstick is the INNERMOST
        // preferred value's kind, whatever the preference's rank: `**1.5`
        // defends `float` exactly as `*1.5` does. The old rule read the
        // immediate peg, and a rank>=2 peg is itself a PrefVal whose
        // superior is top -- so ANY conjunct overrode a ranked default
        // (`**1.5 & float` dropped the default and died as mapval_no_gen;
        // `**2|integer` met by a bare `integer` lost the default the
        // spelling exists to carry -- use-cases/BUGS.md §3), while the
        // rank-1 spelling of the same document kept it. One rule, every
        // rank. Pinned by test/spec/pref.tsv (pref-rank2-* rows, and the
        // flipped pref-nested-concrete-wins).
        // THE RANK-UNIFORM MEET (ADR-004) is unchanged: the yardstick is
        // the INNERMOST preferred value, whatever the rank, so `**1.5`
        // defends `float` exactly as `*1.5` does.
        let peg = this.peg;
        while (true === peg?.isPref) {
            peg = peg.peg;
        }
        const base = (0, SuperFuncVal_1.superOf)(ctx, peg);
        // A gate that a meet has already narrowed stays narrowed: the
        // override space only ever shrinks.
        this.superpeg = null == this.narrowed ? base
            : (0, unify_1.unite)(ctx, base, this.narrowed, 'pref-narrow/' + this.id);
    }
    // The default, standing but NARROWED: `*integer & 7` is `*7`, which
    // is what the long form answers (`(integer&7) | (number&7)` keeps
    // the star on the arm that survived). The rank rides across -- a
    // ladder rung that narrows is still that rung.
    // The rank is REBUILT as nesting rather than stamped: canon renders
    // one star per layer (`'*' + peg.canon`), so a rank set directly on
    // a single layer would print `*x` for a rank-2 default and the
    // document would no longer round-trip.
    restand(met, ctx) {
        let out = met;
        for (let rI = 0; rI <= this.rank; rI++) {
            out = new PrefVal({ peg: out }, ctx);
        }
        return this.place(out);
    }
    // PrefVal unify always returns a PrefVal
    // PrefVals can only be removed by becoming Nil in a Disjunct
    unify(peer, ctx) {
        peer = peer ?? (0, top_1.top)();
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Pref', this, peer);
        let out = this;
        let why = '';
        if (!this.peg.done) {
            const resolved = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'RES') }) : ctx, this.peg, (0, top_1.top)(), 'pref/resolve');
            // console.log('PREF-RESOLVED', this.peg.canon, '->', resolved)
            this.peg = resolved;
            this.resuper(ctx);
        }
        // A CONTAINER DEFAULT IS LEAFWISE IN EFFECT (ADR-011 R3), and it
        // gets there through the meet above rather than through a rewrite.
        // `*{p:1}` keeps its written shape -- canon prints `*{"p":1}` and
        // reparses to itself, which a rewrite to `{p:*1}` would break, and
        // an alternative still has a star for a disjunction to choose by.
        // What makes it leafwise is that the two arms decide:
        //
        //   `& {q:2}`  the preferred value ITSELF admits the peer (maps
        //              merge), so the default stands as `*{p:1,q:2}` and
        //              `p` survives -- it used to be REPLACED outright.
        //   `& {p:2}`  the preferred value refuses, so the gate answers:
        //              `super({p:1})` is `{p:integer}`, which admits it.
        //   `& "s"`    both arms are empty, so the whole default is --
        //              a string used to override a map default silently.
        //
        // Which is every rule R3 asks for, with no bag ever standing where
        // the author wrote a scalar and no canon that fails to round-trip.
        if (peer instanceof PrefVal) {
            why += 'pref-';
            if (this.id === peer.id) {
                out = this;
                why += 'same';
            }
            // Avoid MAXCYCLE errors
            else if (this.peg.id === peer.peg.id) {
                out = this;
                why += 'same-peg';
            }
            else if (this.rank < peer.rank) {
                out = this;
                why += 'rank-win';
            }
            else if (peer.rank < this.rank) {
                out = peer;
                why += 'rank-lose';
            }
            else {
                // console.log('PREF-PEER',
                //   this.peg.id, this.peg, this.peg.done,
                //   peer.peg.id, peer.peg, peer.peg.done,
                // )
                const peg = (0, FuncBaseVal_1.trialUnify)(ctx, prefInnerPeg(this).clone(ctx), prefInnerPeg(peer));
                // TWO DEFAULTS OF EQUAL RANK THAT CANNOT AGREE (ADR-011 R2):
                // the refusal is about the DEFAULTS, not about the values they
                // happen to hold, and its hint names the fix -- rank one of
                // them. Compatible pegs still fold (`*1 & *integer` is `*1`),
                // and identical ones collapse, so only a real disagreement
                // reaches this arm. The three spellings of it -- `*1 & *7`,
                // `(*1|integer) & *7` and `*1|*7` -- used to answer a value
                // conflict, the newcomer, and the newcomer again.
                out = undefined === peg
                    ? (0, err_1.makeNilErr)(ctx, 'pref_rank_clash', this, peer, 'unify')
                    : this.restand(peg, ctx);
                // console.log('PREF-RANK-SAME-OUT', peg, peg.done, out, out.done)
                why += 'rank-same';
            }
        }
        else if (!peer.isTop) {
            why += 'super-';
            // THE MEET IS THE DESUGARING, DISTRIBUTED (ADR-011 R1,
            // docs/design/DEFAULTS.0.md). `*x` stands for `*x | super(x)`,
            // and a peer meets a disjunction arm by arm:
            //
            //     (x & peer)  |  (super(x) & peer)
            //
            // THE FIRST ARM DECIDES. When the preferred value itself still
            // satisfies the peer the default STANDS -- `*1 & integer`,
            // `*8080 & min(1024)`, `**2 & neq(1)`: the peer narrowed the
            // type without ruling the default out, which is the whole point
            // of writing one. Only when that arm is empty does the second
            // answer, and that is the override. When BOTH are empty nothing
            // remains of the disjunction the star stands for -- `empty`,
            // the same refusal the written-out long form gives.
            //
            // The old rule asked instead whether the peer resolved to
            // exactly `super(x)`, so any narrowing at all counted as an
            // override: `*1 & integer` stood (the peer WAS the gate) but
            // `*8080 & min(1024)` silently dropped the default and answered
            // the bare constraint, and a rank ladder lost its weaker arm to
            // the same rule the moment anything narrowed it.
            //
            // Trialled against a CLONE, on the innermost value (the
            // rank-uniform meet): the preferred value must stay pristine for
            // the arm that stands, and a failed trial must not leave its
            // errors on the context -- the DisjunctVal admission gate's own
            // precedent, and its mechanism.
            const met = (0, FuncBaseVal_1.trialUnify)(ctx, prefInnerPeg(this).clone(ctx), peer);
            if (undefined !== met) {
                // THE SECOND ARM IS CARRIED FORWARD, not discarded. It is the
                // override space -- everything the peer would still admit
                // INSTEAD of the default -- and meeting a peer narrows it just
                // as it narrows the default: two successive meets compose to
                // `(x & p1 & p2) | (super(x) & p1 & p2)`, which is the
                // distribution over both. Dropping it let a constraint that
                // arrived beside a default vanish: `r:*2` with `r:max(20)`
                // stood as a bare `*2`, and `r:40` then overrode it through a
                // gate that no longer remembered the bound.
                //
                // It cannot fail: the first arm succeeded, so `x & peer` has a
                // value, and that value satisfies `super(x)` and `peer` both.
                const gate = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'GATE') }) : ctx, this.superpeg.clone(ctx), peer, 'pref-gate/' + this.id);
                // Unchanged on both counts is the SAME preference, returned as
                // itself: minting a new one every pass would keep the fixpoint
                // moving for ever.
                if (met.same(prefInnerPeg(this)) && gate.same(this.superpeg)) {
                    out = this;
                }
                else {
                    const stood = this.restand(met, ctx);
                    stood.narrowed = gate;
                    stood.superpeg = gate;
                    out = stood;
                }
                why += 'stands';
                (0, utility_1.explainClose)(te, out);
                out.dc = type_1.DONE;
                return out;
            }
            // The override arm is trialled too: its failure is not the
            // answer, it is half of the reason the answer is `empty`, and a
            // recorded `no_scalar_unify` would be the code the reader sees
            // however the refusal is relabelled afterwards.
            const over = (0, FuncBaseVal_1.trialUnify)(ctx, this.superpeg.clone(ctx), peer);
            out = undefined !== over ? over
                // A peer that arrived already failed keeps its own refusal:
                // that is its failure, not the default's.
                : peer.isNil ? peer
                    : (0, err_1.makeNilErr)(ctx, 'empty', this, peer, 'unify');
            // }
        }
        else {
            why += 'none';
        }
        // Every pref result is DONE, including a stuck conjunct from the
        // superior-unify (mirrored by PrefVal.Unify in go/pref.go).
        out.dc = type_1.DONE;
        // console.log('PREFVAL-OUT', why, this.canon, peer.canon, '->', out.canon, out.done)
        ctx.explain && (0, utility_1.explainClose)(te, out);
        return out;
    }
    same(peer) {
        if (null == peer) {
            return false;
        }
        let pegsame = (this.peg === peer.peg) ||
            (this.peg.isVal && this.peg.same(peer.peg));
        return pegsame;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, spec);
        // THE NARROWED OVERRIDE SPACE TRAVELS WITH THE COPY (ADR-011 R1).
        // A default a meet has pinned stays pinned through a reference:
        // without this, `T:{e:***false & false}` copied by `f:$.T` handed
        // back a default whose gate had widened again to `boolean`, and
        // `f:{e:true}` overrode a value the author had pinned. The Go
        // twin carries the same two fields explicitly (clone.go).
        if (null != this.narrowed) {
            out.narrowed = this.narrowed;
            out.superpeg = this.superpeg;
        }
        // THE PER-DESTINATION INSTANTIATION RULE (ADR-005). The default
        // clone shares the preferred value (`peg: this.peg` in Val.clone)
        // — a cloned pref spread template resolves its inner value at the
        // template's own location, pinned behaviour. But a template
        // INSTANCE must own it: with the peg shared, a rank-2 default
        // (`**key(1) | string`) in a pack template resolved its one
        // shared inner key() at the first destination and every child got
        // the first child's key (use-cases/BUGS.md §9 — rank 1 escaped
        // only because its unify builds a fresh PrefVal per meet). The
        // superpeg yardstick from the shared peg still holds: the clone's
        // innermost value is the same kind.
        if (true === spec?.dup && true === this.peg?.isVal) {
            out.peg = this.peg.clone(ctx, { dup: true });
        }
        return out;
    }
    get canon() {
        // return this.pref instanceof Nil ? this.peg.canon : '*' + this.pref.canon
        return '*' + this.peg.canon;
    }
    gen(ctx) {
        let val = this.peg;
        if (val.isNil) {
            if (null == ctx) {
                throw new err_1.AontuError(val.msg);
            }
        }
        return val.gen(ctx);
    }
} /* node:coverage ignore next 7 */
exports.PrefVal = PrefVal;
//# sourceMappingURL=PrefVal.js.map
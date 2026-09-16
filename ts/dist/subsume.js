"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathText = pathText;
exports.siteOf = siteOf;
exports.effectiveDefault = effectiveDefault;
exports.subsumeNode = subsumeNode;
exports.subsume = subsume;
/* Copyright (c) 2025 Richard Rodger, MIT License */
const utility_1 = require("./utility");
const aontu_1 = require("./aontu");
const vet_1 = require("./vet");
const hcanon_1 = require("./hcanon");
const ConstraintVal_1 = require("./val/ConstraintVal");
const ScalarKindVal_1 = require("./val/ScalarKindVal");
const PathVal_1 = require("./val/PathVal");
const PrefVal_1 = require("./val/PrefVal");
const DEFAULT_GENERAL_URL = 'general';
const DEFAULT_SPECIFIC_URL = 'specific';
function pathText(path) {
    return '$' + (0 < path.length ? '.' + path.join('.') : '');
}
function siteOf(v, role, url) {
    return {
        file: url,
        row: v.site.row,
        col: v.site.col,
        len: v.site.len,
        role: role,
        src: v.site.src,
        value: v.canon,
    };
}
// One finding: general and specific sites (general first — it is the
// contract being weakened or broken), canons as expected/actual.
function record(state, code, path, g, s, message) {
    state.findings.push({
        code,
        class: 'compat',
        severity: 'error',
        path: pathText(path),
        message,
        sites: [
            siteOf(g, 'general', state.generalUrl),
            siteOf(s, 'specific', state.specificUrl),
        ],
        expected: g.canon,
        actual: s.canon,
    });
}
function admission(v) {
    return true === v?.isPref ? v.superpeg : v;
}
function memberAdmission(v) {
    return true === v?.isPref ? (0, PrefVal_1.prefInnerPeg)(v) : v;
}
function effectiveDefault(v) {
    if (true === v?.isPref) {
        return (0, PrefVal_1.prefInnerPeg)(v);
    }
    if (true === v?.isDisjunct && Array.isArray(v.peg)) {
        const prefs = v.peg.filter((m) => true === m?.isPref);
        if (0 === prefs.length) {
            return undefined;
        }
        // Generation picks the LOWEST rank (`a:**1|*2` generates 2 —
        // test/spec/edge.tsv), so the effective default does too.
        const minRank = Math.min(...prefs.map((p) => p.rank));
        const top = prefs.filter((p) => p.rank === minRank);
        const first = (0, PrefVal_1.prefInnerPeg)(top[0]);
        for (const p of top.slice(1)) {
            if (!first.same?.((0, PrefVal_1.prefInnerPeg)(p))) {
                return 'indeterminate';
            }
        }
        return first;
    }
    return undefined;
}
// Is this evaluated value concrete enough to serve as a witness — a
// value that certainly IS an instance of the specific side?
function isConcrete(v) {
    if (true === v?.isScalar) {
        return true;
    }
    if ((true === v?.isMap || true === v?.isList) && null != v.peg) {
        const children = Array.isArray(v.peg) ? v.peg : Object.values(v.peg);
        return children.every((c) => isConcrete(c));
    }
    return false;
}
// Unresolved residue makes the relation undecidable at this node:
// references, variables, unreduced conjuncts and functions have no
// admitted set to compare.
function unresolved(v) {
    return true === v?.isRef || true === v?.isVar ||
        true === v?.isConjunct || true === v?.isExpect ||
        (true === v?.isFunc && true !== v?.isConstraint);
}
function subsumeNode(state, path, g0, s0) {
    const g = admission(g0);
    const s = admission(s0);
    // Marks change the OUTPUT shape, not the admitted set: only the `gen`
    // profile reports them, and only when they differ on corresponding
    // nodes.
    if ('gen' === state.profile && true !== state.distributing &&
        (!!g?.mark?.type !== !!s?.mark?.type ||
            !!g?.mark?.hide !== !!s?.mark?.hide)) {
        record(state, 'compat_marks_changed', path, g, s, 'marks differ: general ' + JSON.stringify(g?.mark) +
            ', specific ' + JSON.stringify(s?.mark));
        return 'no';
    }
    if (true === g?.isTop) {
        return 'yes';
    }
    if (unresolved(g) || unresolved(s)) {
        if ((0, hcanon_1.hcanon)(g) === (0, hcanon_1.hcanon)(s)) {
            return 'yes';
        }
        record(state, 'sub_unresolved', path, g, s, 'unresolved residue: the admitted set is not comparable');
        return 'undecided';
    }
    if (true === s?.isDisjunct) {
        let out = 'yes';
        for (const raw of s.peg) {
            const member = memberAdmission(raw);
            const trial = trialSubsume(state, path, g, member);
            if ('yes' !== trial) {
                if (isConcrete(admission(member))) {
                    record(state, 'compat_narrowed', path, g, member, 'a specific alternative is not admitted by the general value');
                    return 'no';
                }
                record(state, 'sub_disjunct_distribution', path, g, member, 'a specific alternative is not admitted member-wise, and no' +
                    ' concrete counterexample settles the distribution case');
                out = 'undecided';
            }
        }
        return out;
    }
    if (true === g?.isDisjunct) {
        for (const raw of g.peg) {
            if ('yes' === trialSubsume(state, path, memberAdmission(raw), s)) {
                return 'yes';
            }
        }
        if (isConcrete(s)) {
            record(state, 'compat_narrowed', path, g, s, 'no general alternative admits the specific value');
            return 'no';
        }
        record(state, 'sub_disjunct_distribution', path, g, s, 'no general alternative admits the specific value member-wise,' +
            ' and no concrete counterexample settles the distribution case');
        return 'undecided';
    }
    // Scalar kinds: a kind subsumes its scalars, narrower kinds, and the
    // constraint residuals of its domain.
    if (true === g?.isScalarKind) {
        if (true === s?.isScalarKind) {
            if (g.peg === s.peg || (0, ScalarKindVal_1.kindSubsumes)(g.peg, s.peg)) {
                return 'yes';
            }
            record(state, 'compat_narrowed', path, g, s, 'the general kind does not admit the specific kind');
            return 'no';
        }
        if (true === s?.isScalar) {
            const leaf = s.superior?.();
            if (true === leaf?.isScalarKind &&
                (g.peg === leaf.peg || (0, ScalarKindVal_1.kindSubsumes)(g.peg, leaf.peg))) {
                return 'yes';
            }
            record(state, 'compat_narrowed', path, g, s, 'the general kind does not admit the specific scalar');
            return 'no';
        }
        if (true === s?.isConstraint) {
            const dom = s.domain;
            const skind = s.kind;
            if ('number' === dom &&
                (Number === g.peg ||
                    (null != skind && (0, ScalarKindVal_1.kindSubsumes)(g.peg, skind)))) {
                return 'yes';
            }
            if ('string' === dom && String === g.peg) {
                return 'yes';
            }
            record(state, 'compat_narrowed', path, g, s, 'the general kind does not cover the specific residual');
            return 'no';
        }
        record(state, 'compat_narrowed', path, g, s, 'the general kind admits no such value');
        return 'no';
    }
    // Container kinds (docs/design/PATHS.0.md): `map()` subsumes every
    // map and itself, `list()` every list. The unit literals (`{}`,
    // `[]`) already subsume through the container rules; only the kind
    // former needs an arm.
    if (true === g?.isContainerKind) {
        const ga = g;
        const sa = s;
        if ((true === ga.isMapKind && (true === sa?.isMap || true === sa?.isMapKind))
            || (true === ga.isListKind && (true === sa?.isList || true === sa?.isListKind))) {
            return 'yes';
        }
        record(state, 'compat_narrowed', path, g, s, 'the general container kind admits no such value');
        return 'no';
    }
    if (true === g?.isConstraint) {
        if (true === s?.isConstraint) {
            const r = (0, ConstraintVal_1.constraintSubsumesConstraint)(g, s);
            if (true === r) {
                return 'yes';
            }
            if ('undecided' === r) {
                record(state, 'sub_evaluate_only', path, g, s, 'an evaluate-only check (must) makes the admitted set opaque');
                return 'undecided';
            }
            record(state, 'compat_narrowed', path, g, s, 'the general residual does not contain the specific residual');
            return 'no';
        }
        if (true === s?.isScalar) {
            const r = (0, ConstraintVal_1.constraintAdmitsScalar)(g, s);
            if (true === r) {
                return 'yes';
            }
            if ('undecided' === r) {
                record(state, 'sub_evaluate_only', path, g, s, 'an evaluate-only check (must) makes the admitted set opaque');
                return 'undecided';
            }
            record(state, 'compat_narrowed', path, g, s, 'the general residual does not admit the specific scalar');
            return 'no';
        }
        record(state, 'compat_narrowed', path, g, s, 'the general residual constrains a domain the specific value is not in');
        return 'no';
    }
    // Concrete scalars subsume only themselves (identity compares kind
    // as well as value) -- except paths, whose meet is the prefix rule
    // (ADR-016): a prefix admits every extension of itself, so it
    // subsumes one, exactly as the meet answers the longer.
    if (true === g?.isScalar) {
        if (true === g.isPath && true === s?.isPath &&
            (0, PathVal_1.prefixMeet)(g.peg, s.peg) === s.peg) {
            return 'yes';
        }
        if (true === s?.isScalar && true === g.same?.(s)) {
            return 'yes';
        }
        record(state, 'compat_narrowed', path, g, s, 'a concrete value subsumes only itself');
        return 'no';
    }
    // Maps.
    if (true === g?.isMap) {
        if (true !== s?.isMap) {
            record(state, 'compat_narrowed', path, g, s, 'the general value is a map and the specific value is not');
            return 'no';
        }
        return subsumeBag(state, path, g, s, Object.keys(g.peg), Object.keys(s.peg), (v, k) => v.peg[k]);
    }
    // Lists: element-wise by position; the same required/optional shape
    // as maps, with positions as keys.
    if (true === g?.isList) {
        if (true !== s?.isList) {
            record(state, 'compat_narrowed', path, g, s, 'the general value is a list and the specific value is not');
            return 'no';
        }
        const gk = g.peg.map((_, i) => '' + i);
        const sk = s.peg.map((_, i) => '' + i);
        return subsumeBag(state, path, g, s, gk, sk, (v, k) => v.peg[Number(k)]);
    }
    if (true !== g?.isNil && true !== s?.isNil && (0, hcanon_1.hcanon)(g) === (0, hcanon_1.hcanon)(s)) {
        return 'yes';
    }
    record(state, 'sub_unresolved', path, g, s, 'no subsumption rule covers this pair of value formers');
    return 'undecided';
}
// Maps and lists share one shape: required keys of the general side
// must be required in the specific side and subsume; optional keys
// compare when present; closedness bounds the specific key set; spread
// templates govern the specific side's surplus.
function subsumeBag(state, path, g, s, gKeys, sKeys, child) {
    let out = 'yes';
    const worse = (r) => {
        if ('no' === r || ('undecided' === r && 'no' !== out)) {
            out = 'no' === r ? 'no' : 'undecided';
        }
    };
    // Always arrays on an evaluated bag (BagVal initialises them).
    const gOptional = g.optionalKeys;
    const sOptional = s.optionalKeys;
    for (const k of gKeys) {
        const gChild = child(g, k);
        const has = sKeys.includes(k);
        const optional = gOptional.includes(k);
        if (!has) {
            if (optional) {
                continue;
            }
            record(state, 'compat_required_added', [...path, k], gChild, s, 'the general value requires this key; the specific value admits' +
                ' instances without it');
            worse('no');
            continue;
        }
        if (!optional && sOptional.includes(k)) {
            record(state, 'compat_required_added', [...path, k], gChild, child(s, k), 'the general value requires this key; the specific value makes' +
                ' it optional, so instances without it are admitted');
            worse('no');
            continue;
        }
        worse(subsumeNode(state, [...path, k], gChild, child(s, k)));
    }
    // Closedness: a closed general bag admits only key sets it declares,
    // so the specific side must be closed and inside it.
    if (true === g.closed) {
        if (true !== s.closed) {
            record(state, 'compat_narrowed', path, g, s, 'the general value is closed; the open specific value admits' +
                ' surplus keys');
            worse('no');
        }
        else {
            for (const k of sKeys) {
                if (!gKeys.includes(k)) {
                    record(state, 'compat_narrowed', [...path, k], g, child(s, k), 'the closed general value does not declare this key');
                    worse('no');
                }
            }
        }
    }
    const gcj = g.spread?.cj;
    const scj = s.spread?.cj;
    if (null != gcj || null != scj) {
        const sameTemplate = null != gcj && null != scj && (0, hcanon_1.hcanon)(gcj) === (0, hcanon_1.hcanon)(scj);
        if (!sameTemplate &&
            (true === gcj?.isPathDependent || true === scj?.isPathDependent)) {
            record(state, 'sub_path_dependent_spread', path, gcj ?? g, scj ?? s, 'a path-dependent spread template cannot be compared structurally');
            worse('undecided');
        }
        else if (null != gcj) {
            // The general template governs the specific side's surplus keys
            // and its template.
            for (const k of sKeys) {
                if (!gKeys.includes(k)) {
                    worse(subsumeNode(state, [...path, k], gcj, child(s, k)));
                }
            }
            worse(subsumeNode(state, [...path, '&'], gcj, scj ?? topLike()));
        }
        // A specific-only template narrows the specific side; nothing for
        // the (unconstrained) general side to refuse.
    }
    return out;
}
// A stand-in TOP for "the specific side leaves this unconstrained".
let topVal;
function topLike() {
    if (null == topVal) {
        topVal = {
            isTop: true, canon: 'top',
            site: { row: -1, col: -1, len: -1, src: '' },
        };
    }
    return topVal;
}
function trialSubsume(state, path, g, s) {
    const trial = { ...state, findings: [], distributing: true };
    return subsumeNode(trial, path, g, s);
}
function subsumeDefaults(state, path, g, s) {
    const sd = effectiveDefault(s);
    if (undefined === sd) {
        return 'yes';
    }
    const gd = effectiveDefault(g);
    if ('indeterminate' === sd || 'indeterminate' === gd) {
        record(state, 'sub_default_indeterminate', path, g, s, 'equal-rank preferences disagree, so the effective default is' +
            ' not a single value');
        return 'undecided';
    }
    if (undefined === gd || true !== gd.same?.(sd)) {
        record(state, 'compat_default_changed', path, g, s, 'the effective default changed: previously generable documents' +
            ' materialise differently or become incomplete');
        return 'no';
    }
    return 'yes';
}
// Walk both trees for default agreement wherever the specific side has
// one: at the node itself and inside every corresponding bag child.
function subsumeDefaultsWalk(state, path, g, s) {
    let out = subsumeDefaults(state, path, g, s);
    const gm = true === g?.isMap ? g.peg : undefined;
    const sm = true === s?.isMap ? s.peg : undefined;
    if (null != gm && null != sm) {
        for (const k of Object.keys(sm)) {
            if (null != gm[k]) {
                const r = subsumeDefaultsWalk(state, [...path, k], gm[k], sm[k]);
                if ('no' === r || ('undecided' === r && 'no' !== out)) {
                    out = 'no' === r ? 'no' : 'undecided';
                }
            }
        }
    }
    return out;
}
function subsume(generalSrc, specificSrc, opts) {
    const options = opts ?? {};
    const profile = options.profile ?? 'defaults';
    const state = {
        profile,
        findings: [],
        generalUrl: options.generalUrl ?? DEFAULT_GENERAL_URL,
        specificUrl: options.specificUrl ?? DEFAULT_SPECIFIC_URL,
    };
    const load = (src, path) => {
        const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(options));
        const ctx = aontu.ctx({ collect: true });
        const v = aontu.unify(src, null == path ? undefined : { path }, ctx);
        if (0 < ctx.err.length || true === v?.isNil) {
            return undefined;
        }
        return v;
    };
    let g = load(generalSrc, options.generalPath);
    let s = load(specificSrc, options.specificPath);
    if (null == g || null == s) {
        return { verdict: 'error', findings: [] };
    }
    if (null != options.at) {
        g = (0, vet_1.anchorAt)(g, options.at);
        s = (0, vet_1.anchorAt)(s, options.at);
        if (null == g || null == s) {
            return { verdict: 'error', findings: [] };
        }
    }
    let out = subsumeNode(state, [], g, s);
    if ('values' !== profile) {
        const d = subsumeDefaultsWalk(state, [], g, s);
        if ('no' === d || ('undecided' === d && 'no' !== out)) {
            out = 'no' === d ? 'no' : 'undecided';
        }
    }
    const verdict = 'no' === out ? 'does_not_subsume' :
        'undecided' === out ? 'undecided' : 'subsumes';
    return { verdict, findings: state.findings };
}
//# sourceMappingURL=subsume.js.map
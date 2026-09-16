"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.compatOutcome = compatOutcome;
// The outcome half of the publish gate (ADR-022): every position the
// prior version generates with nothing supplied, the next version must
// generate, to the same value. Admission is the subsumption query's.
const utility_1 = require("./utility");
const aontu_1 = require("./aontu");
const keyorder_1 = require("./keyorder");
const subsume_1 = require("./subsume");
function marked(v) {
    return true === v?.mark?.type || true === v?.mark?.hide;
}
function bag(v) {
    return true === v?.isMap || true === v?.isList;
}
function keysOf(v) {
    return true === v.isMap
        ? Object.keys(v.peg).filter((k) => !v.aliasKeys.includes(k)).sort(keyorder_1.cmpCodePoint)
        : Object.keys(v.peg);
}
// The canon of what a position generates with nothing supplied;
// undefined where generation does not settle on one value.
function determined(v) {
    if (true !== v?.isVal || marked(v)) {
        return undefined;
    }
    if (true === v.isScalar) {
        return v.canon;
    }
    if (true === v.isPref) {
        return determined(v.peg);
    }
    if (true === v.isDisjunct) {
        const prefs = v.peg.filter((m) => true === m?.isPref);
        if (0 < prefs.length) {
            return determined(prefs.reduce((b, p) => p.rank < b.rank ? p : b));
        }
    }
    return undefined;
}
function generates(v) {
    if (bag(v)) {
        return !marked(v) && keysOf(v).some((k) => generates(v.peg[k]));
    }
    return undefined !== determined(v);
}
function record(st, code, path, prior, next, message) {
    const present = true === next?.isVal;
    st.findings.push({
        code,
        class: 'compat',
        severity: 'error',
        path: (0, subsume_1.pathText)(path),
        message,
        sites: [
            ...(present ? [(0, subsume_1.siteOf)(next, 'general', st.nextUrl)] : []),
            (0, subsume_1.siteOf)(prior, 'specific', st.priorUrl),
        ],
        ...(present ? { expected: next.canon } : {}),
        actual: prior.canon,
    });
}
function walk(st, prior, next, path) {
    if (bag(prior)) {
        if (marked(prior)) {
            return;
        }
        if (bag(next) && prior.isMap === next.isMap) {
            for (const k of keysOf(prior)) {
                walk(st, prior.peg[k], next.peg[k], path.concat(k));
            }
        }
        else if (generates(prior) && undefined === determined(next)) {
            record(st, 'compat_undetermined', path, prior, next, 'resolved to a value in the prior version; nothing resolves it now');
        }
        return;
    }
    const was = determined(prior);
    if (undefined === was) {
        return;
    }
    const now = determined(next);
    if (undefined === now) {
        record(st, 'compat_undetermined', path, prior, next, 'resolved to ' + was + ' in the prior version; nothing resolves it now');
    }
    else if (now !== was) {
        record(st, 'compat_outcome_changed', path, prior, next, 'resolved to ' + was + ' in the prior version; resolves to ' + now + ' now');
    }
}
function compatOutcome(nextSrc, priorSrc, opts) {
    const options = opts ?? {};
    const load = (src, path) => {
        const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(options));
        const ctx = aontu.ctx({ collect: true });
        const v = aontu.unify(src, null == path ? undefined : { path }, ctx);
        return 0 < ctx.err.length || true === v?.isNil ? undefined : v;
    };
    const next = load(nextSrc, options.generalPath);
    const prior = load(priorSrc, options.specificPath);
    if (null == next || null == prior) {
        return { verdict: 'error', findings: [] };
    }
    const st = {
        findings: [],
        nextUrl: options.generalUrl ?? 'general',
        priorUrl: options.specificUrl ?? 'specific',
    };
    walk(st, prior, next, []);
    return { verdict: 0 === st.findings.length ? 'ok' : 'breaking', findings: st.findings };
}
//# sourceMappingURL=compat.js.map
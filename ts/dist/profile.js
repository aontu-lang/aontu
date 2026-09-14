"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadProfile = loadProfile;
const aontu_1 = require("./aontu");
const vet_1 = require("./vet");
const hcanon_1 = require("./hcanon");
const utility_1 = require("./utility");
const PROFILE_VOCABULARY = '@"aontu:profile"';
// A language declared as data, vetted, or the findings that refuse it.
function loadProfile(src, options) {
    const opts = options ?? {};
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(opts));
    const actx = aontu.ctx({ collect: true });
    const root = aontu.unify(src, { path: opts.path, collect: true }, actx);
    if (0 < actx.err.length || true === root?.isNil) {
        return { errors: [(0, vet_1.failureFinding)(actx, opts.path, root)] };
    }
    const report = (0, vet_1.vet)(PROFILE_VOCABULARY, (0, hcanon_1.hcanon)(root));
    if ('valid' !== report.verdict) {
        return { errors: report.findings };
    }
    // The meet: the vocabulary requires `lang`, so a value the vet
    // admitted has a `Lang`.
    const instance = new aontu_1.Aontu().generate(PROFILE_VOCABULARY + '\naontu: Lang: ' + (0, hcanon_1.hcanon)(root.peg.aontu.peg.Lang));
    return { profile: instance.aontu.Lang };
}
//# sourceMappingURL=profile.js.map
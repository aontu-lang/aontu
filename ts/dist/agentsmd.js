"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENTSMD_END = exports.AGENTSMD_BEGIN = void 0;
exports.agentsMd = agentsMd;
exports.agentsMdSplice = agentsMdSplice;
/* Copyright (c) 2025 Richard Rodger, MIT License */
const utility_1 = require("./utility");
const aontu_1 = require("./aontu");
const hcanon_1 = require("./hcanon");
const query_1 = require("./query");
const query_2 = require("./query");
const keyorder_1 = require("./keyorder");
// The markers an update rewrites between. A stanza outside them is
// prose someone wrote, and is left alone.
exports.AGENTSMD_BEGIN = '<!-- aontu:begin -->';
exports.AGENTSMD_END = '<!-- aontu:end -->';
// The stanza for one document.
function agentsMd(src, opts) {
    const options = opts ?? {};
    const name = options.name ?? 'the definition';
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(options));
    const ctx = aontu.ctx({ collect: true });
    const parseOpts = null == options.path ? undefined : { path: options.path };
    const v = aontu.unify(src, parseOpts, ctx);
    if (0 < ctx.err.length) {
        return { findings: [(0, query_2.evalFailure)(ctx)], ok: false, stanza: '' };
    }
    const keys = true === v.isMap ? Object.keys(v.peg).sort(keyorder_1.cmpCodePoint) : [];
    const shape = (0, query_1.get)(src, '$', {
        view: 'types', depth: options.depth ?? 2,
        path: options.path, ...(0, utility_1.includeOpts)(options),
    });
    // A REAL path, so the example command works as written: the first
    // root key when there is one, the root itself when there is not.
    const example = 0 < keys.length ? '$.' + keys[0] : '$';
    const lines = [
        exports.AGENTSMD_BEGIN,
        '## Ground truth: `' + name + '`',
        '',
        'The values below are DERIVED from `' + name + '`, an aontu',
        'definition. Do not restate them here — read them from the source,',
        'which is the only copy that cannot go stale.',
        '',
        '- Pin: `' + (0, hcanon_1.canonHash)(v) + '`',
        '  (the canon-hash: it survives reformatting and moves on any',
        '  change of meaning — `aontu hash ' + name + '` re-derives it)',
        '- Top-level keys: ' +
            (0 === keys.length ? '_none_' : keys.map((k) => '`' + k + '`').join(', ')),
        '- Shape: `' + shape.out + '`',
        '',
        'How to work with it:',
        '',
        '```',
        '# what does it say at a path?',
        'aontu model get ' + example + ' ' + name,
        '',
        '# why does that value hold?',
        'aontu model why ' + example + ' ' + name,
        '',
        '# does my document satisfy it?',
        'aontu vet ' + name + ' mine.aontu',
        '',
        '# change it without editing it',
        'aontu model set ' + example + '=<value> --entry ' + name +
            ' --overlay overlay.aontu',
        '',
        '# the language itself, offline: the whole grammar on one page',
        'aontu help language',
        '```',
        '',
        'Regenerate this section with `aontu agentsmd ' + name + '`.',
        exports.AGENTSMD_END,
    ];
    return { findings: [], ok: true, stanza: lines.join('\n') + '\n' };
}
function agentsMdSplice(existing, stanza) {
    const from = existing.indexOf(exports.AGENTSMD_BEGIN);
    const to = existing.indexOf(exports.AGENTSMD_END);
    if (from < 0 || to < from) {
        const head = '' === existing || existing.endsWith('\n')
            ? existing : existing + '\n';
        return head + ('' === existing ? '' : '\n') + stanza;
    }
    let end = to + exports.AGENTSMD_END.length;
    if ('\r' === existing[end]) {
        end++;
    }
    if ('\n' === existing[end]) {
        end++;
    }
    return existing.slice(0, from) + stanza + existing.slice(end);
}
//# sourceMappingURL=agentsmd.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENTSMD_END = exports.AGENTSMD_BEGIN = void 0;
exports.agentsMd = agentsMd;
exports.agentsMdSplice = agentsMdSplice;
/* Copyright (c) 2025 Richard Rodger, MIT License */
const utility_1 = require("./utility");
// THE AGENTS.md STANZA (G7 phase 6,
// docs/capability-review/g7-machine-access.md): generated FROM the
// definition, so the prose entrypoint cannot drift from the formal
// source it points at.
//
// A hand-written "here is where the config lives" paragraph is stale
// the first time a key is renamed. This one is derived: the root keys
// come from the document, the pin comes from G6's canon-hash, and the
// commands are spelled with paths that exist. Re-running the verb
// after an edit produces the stanza that edit implies.
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
    // THE SHAPE IS A SECOND EVALUATION, and it runs under the same
    // include options as the first. Taking `path` alone made it a
    // narrower reader than the stanza around it: a document whose keys
    // arrive through a `--text-ext` include listed those keys and then
    // reported an EMPTY shape, because the read the shape came from
    // refused the include the read above it had just honoured.
    const shape = (0, query_1.get)(src, '$', { view: 'types', depth: 2, path: options.path, ...(0, utility_1.includeOpts)(options) });
    // A REAL path, so the example command works as written: the first
    // root key when there is one, the root itself when there is not.
    const example = 0 < keys.length ? '$.' + keys[0] : '$';
    const lines = [
        exports.AGENTSMD_BEGIN,
        '## Ground truth: `' + name + '`',
        '',
        'The values below are DERIVED from `' + name + '`, an Aontu',
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
        'aontu get ' + example + ' ' + name,
        '',
        '# why does that value hold?',
        'aontu why ' + example + ' ' + name,
        '',
        '# does my document satisfy it?',
        'aontu vet ' + name + ' mine.aon',
        '',
        '# change it without editing it',
        'aontu set ' + example + '=<value> --entry ' + name +
            ' --overlay overlay.aon',
        '```',
        '',
        'Regenerate this section with `aontu agentsmd ' + name + '`.',
        exports.AGENTSMD_END,
    ];
    return { findings: [], ok: true, stanza: lines.join('\n') + '\n' };
}
// Splice the stanza into an existing document: replace what stands
// between the markers, or append when there is nothing to replace. A
// document is otherwise LEFT ALONE — the rest of an AGENTS.md is
// someone's prose, and a generator that rewrote it would be a
// generator nobody dared run twice.
function agentsMdSplice(existing, stanza) {
    const from = existing.indexOf(exports.AGENTSMD_BEGIN);
    const to = existing.indexOf(exports.AGENTSMD_END);
    if (from < 0 || to < from) {
        const head = '' === existing || existing.endsWith('\n')
            ? existing : existing + '\n';
        return head + ('' === existing ? '' : '\n') + stanza;
    }
    // Skip the end marker's line terminator, whatever it is, and only if
    // it is there. The full note is on the Go twin (go/agentsmd.go): `+1`
    // assumed one byte and got the CR of a CRLF document, leaving the LF
    // to become a blank line on every regeneration -- and past the end of
    // a document whose marker is its last content, where Go panicked and
    // this side quietly did not.
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
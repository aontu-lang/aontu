"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VET_MAX_ERRORS = void 0;
exports.anchorAt = anchorAt;
exports.vet = vet;
const aontu_1 = require("./aontu");
const err_1 = require("./err");
const ConjunctVal_1 = require("./val/ConjunctVal");
const walk_1 = require("./walk");
const utility_1 = require("./utility");
const subsume_1 = require("./subsume");
// The `--at` refusal is the SAME refusal `get` and `why` give for a
// path that names nothing, down to the "did you mean" -- so it is that
// one, not a second spelling of it. A cycle in the module graph
// (query imports anchorAt from here), and a benign one: both sides
// use the other only from inside a function body, never at load time.
const query_1 = require("./query");
// The default cap, exported because the CLI applies it to the WHOLE
// report across several data files and must not carry a second copy of
// the number (ts/src/cli.ts).
exports.VET_MAX_ERRORS = 20;
const DEFAULT_SCHEMA_URL = 'schema';
const DEFAULT_DATA_URL = 'data';
// Every site in a freshly parsed tree carries the same url, and for a
// bare parse that url is the empty string: `site.url` is only populated
// by the multisource loader (ts/src/lang.ts). Vet takes two documents
// from its CALLER, not from the filesystem, so it stamps provenance
// itself — which is what lets the report assign site ROLES by
// provenance rather than by NilVal's source-order heuristic, exactly as
// the design requires.
function stampUrl(v, url) {
    (0, walk_1.walkVals)(v, (n) => {
        n.site.url = url;
        return true;
    }, new Set());
}
// `$.a.b`, and `$` for the root. Deliberately NOT delimiter-escaped: a
// map key may contain any character, including every separator a
// compact summary might pick, so the path is carried as a JSON string
// and never parsed back out of a larger token.
function pathText(path) {
    return '$' + (null != path && 0 < path.length ? '.' + path.join('.') : '');
}
// `secondary` is the only operand that can be absent — a `closed` or an
// incomplete finding has one side, a two-site conflict has both — so
// this is the one nullable input, and every Val that does arrive
// carries a site and a canon.
function siteOf(v, dataUrl) {
    if (null == v) {
        return undefined;
    }
    // The report's `file` is whatever the site carries, and by the time a
    // site reaches a report that is always a stamped name: vet walks both
    // documents before they meet, and the walk reaches the off-peg values
    // a finding can name (ts/src/walk.ts). A consumer therefore reads
    // `file` without a presence check, and the Go port -- whose field is
    // a plain string -- writes the same key.
    //
    // NOT coalesced. The parser leaves the url undefined on one of its
    // two paths (ts/src/lang.ts), and a `?? ''` here would be dead code
    // that hides it: if a value ever reaches a report unstamped, the two
    // ports should disagree loudly rather than quietly agree on an empty
    // name that neither of them meant.
    const file = v.site.url;
    return {
        file,
        row: v.site.row,
        col: v.site.col,
        len: v.site.len,
        role: dataUrl === file ? 'data' : 'schema',
        src: v.site.src,
        value: v.canon,
    };
}
// The data site first — it is the thing to fix — then the schema site.
// The underlying NilVal fields are untouched: this is a report-layer
// projection, so the existing error.tsv assertions do not move.
function sitesOf(nil, dataUrl) {
    // `?? nil`: a failure raised about a CONSTRUCT rather than about a
    // failed meet -- a lossy integer literal, say -- carries no operands
    // at all, and reporting it about ITSELF is what ctx.adderr already
    // does for the same reason. Without the fallback the report built a
    // site out of `undefined` and threw while partitioning it, which is
    // the one thing vet promises not to do: a bad value in the data is
    // DATA, and the caller gets a report.
    const sites = [siteOf(nil.primary ?? nil, dataUrl)];
    const secondary = siteOf(nil.secondary, dataUrl);
    if (null != secondary) {
        sites.push(secondary);
    }
    // Partitioned rather than sorted: which of the two NilVal operands is
    // `primary` follows source order within one document, which says
    // nothing useful when one side is a schema and the other is data.
    return [
        ...sites.filter((s) => 'data' === s.role),
        ...sites.filter((s) => 'schema' === s.role),
    ];
}
// The message text is MATERIALISED on demand, exactly as handleErrors
// materialises one before a caller sees it: makeNilErr defers it
// because most NilVals are transient and never rendered, and only the
// throwing path asks for it. Without this a finding could carry an
// empty `message` -- which is what the incomplete half of every report
// did, and what any nil built during the PARSE of a document did.
function materialise(nil, ctx) {
    if (null == nil.msg || '' === nil.msg) {
        (0, err_1.descErr)(nil, ctx);
    }
}
// The terminal colour escapes the parser puts in its message text. A
// RegExp built from a string, not a literal: the escape is a control
// character, and spelling it `\u001b` keeps the source readable.
const ANSI_RE = new RegExp('\u001b\\[[0-9;]*m', 'g');
function stripAnsi(s) {
    return s.replace(ANSI_RE, '');
}
function findingOf(nil, dataUrl) {
    const details = nil.details ?? {};
    const finding = {
        code: nil.why,
        class: nil.class,
        severity: 'error',
        path: pathText(nil.path),
        // The HEADLINE only, WITHOUT ANSI: the frames below it are for a
        // human reading a terminal, and the first line is the part the two
        // ports hold to byte parity. Materialised before this runs, so it
        // is always there (see materialise above). The escapes matter for
        // one family only -- a parse failure's text comes from the parser,
        // which colours its marker -- and a machine-readable report is no
        // place for terminal control codes.
        message: stripAnsi(nil.msg.split('\n')[0]),
        sites: sitesOf(nil, dataUrl),
    };
    // `expected`/`actual` are the admissible-alternatives contract, and
    // the constraint algebra already produces them: G1's atoms attach the
    // normalised residual and the offending value, and `must` attaches
    // the author's message. Read them where they are rather than
    // re-deriving them here.
    if ('string' === typeof details.expected) {
        finding.expected = details.expected;
    }
    if ('string' === typeof details.actual) {
        finding.actual = details.actual;
    }
    if ('string' === typeof details.message) {
        finding.note = details.message;
    }
    return finding;
}
// Findings are sorted BY VET, not by the walk. The underlying walk
// iterates raw object keys and the two hosts disagree about their order
// — `10:… 9:…` yields ["9","10"] in JavaScript, which hoists
// integer-like keys, against Go's insertion order (ts/src/keyorder.ts
// exists for exactly this) — so an unsorted report could never be in
// cross-port parity.
//
// The order is by data site (file, row, column), then code, then path.
// It is carried in ONE key string rather than a cascade of comparisons:
// the row and column are zero-padded so lexicographic order is numeric
// order, and NUL joins the fields because no field can contain one.
// A cascade would need a test per tie-breaker to stay honest; a key
// needs none, and cannot disagree with itself.
const ORDER_PAD = 9;
function pad(n) {
    return String(n).padStart(ORDER_PAD, '0');
}
// The walk index is the LAST field, which makes every key unique and
// the sort below total: two findings can otherwise share everything the
// key carries — same data site, same code, same path — and a comparator
// that has to answer "equal" is one more thing to get right in two
// languages. With the index appended, ties simply keep walk order, in
// both ports, by construction rather than by the sort's promises.
function orderKey(f, index) {
    const site = f.sites[0];
    return [
        site.file,
        pad(site.row),
        pad(site.col),
        f.code,
        f.path,
        pad(index),
    ].join('\u0000');
}
// Walk the evaluated schema to the anchor path. `$` and `$.a.b` are
// both accepted, as is the bare `a.b` a shell is likely to hand over
// unquoted.
function anchorAt(root, at) {
    const trimmed = at.startsWith('$') ? at.slice(1) : at;
    const parts = trimmed.split('.').filter((p) => '' !== p);
    let node = root;
    for (const part of parts) {
        // TYPE-DIRECTED, not a property lookup on whatever `peg` happens to
        // be. An anchor is a STRUCTURAL path into the schema — the same
        // thing a reference means by `$.a.b` — so it walks map keys and
        // list indices, and stops at anything else.
        //
        // Indexing the peg generically walked much further than that: into
        // a junction's branches (`a:1|2` with `--at $.a.0` validated
        // against ONE branch), into a constraint's atom arguments (so
        // `min(2)` with `--at $.a.0` reported the bound's own argument as
        // the truth), into a pref's wrapped value through the literal key
        // `peg`, and into an array's `length` — that last one handing back
        // a JavaScript NUMBER as the anchor, after which every document
        // whatsoever came back valid. The Go port has always been
        // type-directed here; this is the canonical side moving to it.
        if (true === node?.isMap) {
            const peg = node.peg;
            if (null == peg || !Object.prototype.hasOwnProperty.call(peg, part)) {
                return undefined;
            }
            node = peg[part];
        }
        else if (true === node?.isList) {
            // CANONICAL DECIMAL, the spelling a reference uses for a list
            // index (`0`, or a non-zero digit run) -- so `$.a.01` names
            // nothing here exactly as it names nothing there.
            const peg = node.peg;
            const index = Number(part);
            if (!/^(0|[1-9][0-9]*)$/.test(part) ||
                !Array.isArray(peg) || peg.length <= index) {
                return undefined;
            }
            node = peg[index];
        }
        else {
            return undefined;
        }
    }
    return node;
}
// Validate `dataSrc` against `schemaSrc`.
//
// Never throws for findings: a contradiction in the data is DATA, and
// the caller gets a report. It throws only when the caller's own inputs
// are unusable — which is why an unusable schema is a verdict (`error`)
// rather than an exception too: "the schema is broken" is a fact the
// agent loop needs to branch on, not an exceptional condition.
function vet(schemaSrc, dataSrc, opts) {
    const options = opts ?? {};
    const schemaUrl = options.schemaUrl ?? DEFAULT_SCHEMA_URL;
    const dataUrl = options.dataUrl ?? DEFAULT_DATA_URL;
    const maxErrors = options.maxErrors ?? exports.VET_MAX_ERRORS;
    // ONE instance, two bases: the path rides on each CALL rather than on
    // the constructor, because the schema and the data may live in
    // different directories (Lang.parse takes `opts.path` per parse).
    const aontu = new aontu_1.Aontu(null == options.trust ? undefined : { trust: options.trust });
    const schemaOpts = null == options.schemaPath ?
        undefined : { path: options.schemaPath };
    const dataOpts = null == options.dataPath ?
        undefined : { path: options.dataPath };
    // 1. The schema alone. If it does not stand up on its own, the data
    //    is never blamed for it.
    const schemaCtx = aontu.ctx({ collect: true });
    const schemaVal = aontu.unify(schemaSrc, schemaOpts, schemaCtx);
    if (0 < schemaCtx.err.length || true === schemaVal?.isNil) {
        // A broken schema REPORTS, exactly as broken data does. It used to
        // answer `findings: []` with exit 4 and nothing else, in both
        // ports: the engine had collected the fault and vet threw it away,
        // so an agent -- or a person -- was told the schema was broken and
        // not what or where. The verdict stays `error` (the fault is in
        // the truth, not in the data, and that distinction is the whole
        // point of the class), but the finding travels with it.
        //
        // The FIRST error only, and the data path's reasoning applies
        // unchanged: later errors in a document that does not stand up are
        // consequences of the first rather than separate things to fix.
        //
        // ONE OF THE TWO IS ALWAYS THERE, and both are nils: the branch
        // condition admits a collected error or a nil root, and every
        // value on `schemaCtx.err` is a NilVal. There is no third case, so
        // there is no guard here -- a guard that cannot fire is dead code,
        // and dead code is what ADR-002 exists to keep out. (One stood
        // here and the TypeScript line report called it covered; the Go
        // gate, which measures blocks, refused the twin.)
        const failure = 0 < schemaCtx.err.length ? schemaCtx.err[0] : schemaVal;
        // The normal path stamps both documents before they meet
        // (stampUrl(anchor...) below), and this early return never reaches
        // it, so it stamps what it is about to report: the unified root,
        // and the failure itself -- a COLLECTED error is minted during
        // unification and hangs off no tree, so nothing else would name
        // it. The walk reaches a failure's operands (ts/src/walk.ts),
        // which is what makes the sites say which file.
        stampUrl(schemaVal, schemaUrl);
        stampUrl(failure, schemaUrl);
        materialise(failure, schemaCtx);
        return {
            verdict: 'error',
            truncated: false,
            findings: [findingOf(failure, dataUrl)],
        };
    }
    // 2. The anchor: the whole schema, or the value at `--at`.
    let anchor = schemaVal;
    if (null != options.at) {
        anchor = anchorAt(schemaVal, options.at);
        if (null == anchor) {
            // AND IT SAYS WHICH SEGMENT. `--at` naming nothing is an error
            // verdict for the same reason a broken schema is -- the run
            // could not be set up from the truth's side -- and it reports
            // for the same reason too: a caller handed exit 4 and an empty
            // list has nothing to act on.
            return {
                verdict: 'error',
                truncated: false,
                findings: [(0, query_1.noPathFinding)(schemaVal, options.at)],
            };
        }
    }
    // 3. Both documents get their provenance stamped BEFORE they meet, so
    //    every site in the result knows which document it came from.
    const dataCtx = aontu.ctx({ collect: true });
    const dataVal = aontu.parse(dataSrc, dataOpts, dataCtx);
    if (0 < dataCtx.err.length || null == dataVal) {
        // A DATA DOCUMENT THAT WILL NOT PARSE IS THE DATA'S FAULT, and the
        // report says so: verdict `invalid`, with a finding carrying the
        // parser's own code and a site in the data. `error` is left to mean
        // what the exit table says it means -- the run could not be set up
        // from the SCHEMA side.
        //
        // The engine already answered it this way one character earlier: a
        // refused CONSTRUCT (`a: 9007199254740993`) reaches the tree as an
        // ordinary nil and is reported as an invalid data finding. A stray
        // `]` took the throwing path instead and came back as a broken
        // SCHEMA -- the same fault, classified two opposite ways by which
        // branch the parser happened to take.
        //
        // The FIRST error only: the parser stops at the first syntax error,
        // so a second entry would be a consequence of the first rather than
        // a separate thing to fix.
        const failure = dataCtx.err[0];
        if (null == failure) {
            return { verdict: 'error', truncated: false, findings: [] };
        }
        failure.site.url = dataUrl;
        materialise(failure, dataCtx);
        return {
            verdict: 'invalid',
            truncated: false,
            findings: [findingOf(failure, dataUrl)],
        };
    }
    stampUrl(anchor, schemaUrl);
    stampUrl(dataVal, dataUrl);
    // Default-validity lint (G3 phase 5): for every disjunction in the
    // SCHEMA carrying a preference, the effective default must be
    // admitted by some remaining alternative — `a:*5|string` ships a
    // default its own disjunct refuses, and every consumer leaning on it
    // receives an invalid value from the truth itself. A vet WARNING for
    // now (code `pref_not_instance`, class compat): today's engine
    // generates the bad default, existing documents may lean on it, and
    // promoting the warning to an error is itself a breaking change,
    // sequenced through the `breaking` gate (the G3 design's own rule).
    const lintFindings = [];
    (0, utility_1.walkBagVals)(anchor, (v, path) => {
        if (true === v.isDisjunct && Array.isArray(v.peg)) {
            const d = (0, subsume_1.effectiveDefault)(v);
            if (null != d && 'indeterminate' !== d) {
                const rest = v.peg.filter((m) => true !== m?.isPref);
                const state = {
                    profile: 'values', findings: [],
                    generalUrl: schemaUrl, specificUrl: schemaUrl,
                };
                const admitted = rest.some((m) => 'yes' === (0, subsume_1.subsumeNode)(state, path, m, d));
                if (!admitted && 0 < rest.length) {
                    lintFindings.push({
                        code: 'pref_not_instance',
                        class: 'compat',
                        severity: 'warning',
                        path: pathText(path),
                        message: 'the default ' + d.canon +
                            ' is not an instance of any alternative of ' + v.canon,
                        sites: [{
                                file: schemaUrl,
                                row: d.site?.row ?? -1,
                                col: d.site?.col ?? -1,
                                len: d.site?.len ?? -1,
                                role: 'schema',
                                src: d.site?.src ?? '',
                                value: d.canon,
                            }],
                    });
                }
            }
        }
    });
    // `--closed` sets the flag `close()` itself sets, rather than wrapping
    // the anchor in a CloseFuncVal: the anchor is an already-evaluated
    // tree, and a func value would have to resolve again to have any
    // effect. A scalar anchor has no keys to close, so the flag is only
    // meaningful on a bag.
    if (true === options.closed && (true === anchor.isMap || true === anchor.isList)) {
        anchor.closed = true;
    }
    const ctx = aontu.ctx({ collect: true });
    const pair = new ConjunctVal_1.ConjunctVal({ peg: [anchor, dataVal] }, ctx);
    const unified = aontu.unify(pair, undefined, ctx);
    // 4. Contradictions: every NilVal standing in the result, PLUS the
    //    ones that never made it into the tree.
    //
    // The second half is not belt-and-braces. When a parent collapses to
    // a nil the whole subtree goes with it, so `service: close({...})`
    // meeting a typo AND a kind conflict leaves ONE nil in the tree and
    // reports the other only on the context — the vet verb's own
    // motivating example, reporting half of what it found. The language
    // server already walks both for this reason; vet dedups by identity
    // the same way, and skips the transient disjunct-trial sentinel,
    // which is bookkeeping rather than a finding.
    const seen = new Set();
    const nils = (0, walk_1.collectNils)(unified, seen);
    for (const err of ctx.err) {
        if (true === err?.isNil && '|:trial-nil' !== err.why && !seen.has(err)) {
            seen.add(err);
            nils.push(err);
        }
    }
    const findings = nils.map((n) => {
        materialise(n, ctx);
        return findingOf(n, dataUrl);
    });
    const conflicts = findings.length;
    // 5. Incompleteness: what is left standing that cannot generate. The
    //    generate check runs in its own collect context so nothing it
    //    raises reaches the caller's error list, and so a schema that is
    //    merely unsatisfied does not look like one that is contradicted.
    // No try/catch: in collect mode `gen` records its reasons on the
    // context instead of throwing, which is the whole point of the mode.
    const genCtx = aontu.ctx({ collect: true });
    genCtx.root = unified;
    unified.gen(genCtx);
    for (const err of genCtx.err) {
        if ('incomplete' === err.class) {
            materialise(err, genCtx);
            findings.push(findingOf(err, dataUrl));
        }
    }
    // 5b. Deprecation warnings (G3 phase 4): a value that carries the
    //     deprecate() record after the meet was USED — the data met a
    //     deprecated schema value, or the schema's own default will
    //     generate one. Severity `warning` (the slot G2 reserved for
    //     exactly this mark), and warnings never touch the verdict below.
    const errorFindings = findings.length;
    findings.push(...lintFindings);
    for (const { val, path } of (0, utility_1.collectDeprecations)(unified)) {
        const v = val;
        // The same file/role projection sitesOf makes: the url as stamped
        // (empty when the value belongs to neither document), the role by
        // comparing it to the data document's.
        const file = v.site.url;
        findings.push({
            code: 'deprecated',
            class: 'compat',
            severity: 'warning',
            path: pathText(path),
            message: (0, utility_1.deprecationMessage)(v.deprecation),
            sites: [{
                    file,
                    row: v.site.row ?? -1,
                    col: v.site.col ?? -1,
                    len: v.site.len ?? -1,
                    role: (dataUrl === file ? 'data' : 'schema'),
                    src: v.site.src ?? '',
                    value: v.canon,
                }],
        });
    }
    const keyed = findings.map((f, i) => ({ key: orderKey(f, i), finding: f }));
    keyed.sort((a, b) => a.key < b.key ? -1 : 1);
    let ordered = keyed.map((k) => k.finding);
    // ONE CAUSE, ONE FINDING. A reference resolves by CLONING its target,
    // so a target that later fails can fail once per referrer — same
    // code, same two source sites, a different path each time. Multi-pass
    // collection (G2 phase 6) made this reachable: the pass loop now
    // continues past the erroring pass, so the clones' own folds run too.
    // The dedup key is the CODE plus the SITES (file, row, col, value,
    // role): two findings that name the same meet of the same two source
    // positions are one contradiction observed from two paths. The key is
    // NOT (code, path) — the design's sketch — because the paths are
    // exactly what differ. Sorted order makes the kept finding the first
    // by data site then path, deterministically in both ports.
    const causes = new Set();
    ordered = ordered.filter((f) => {
        const cause = f.code + '\u0000' + f.sites.map((s) => [s.file, s.row, s.col, s.role, s.value].join('\u0000')).join('\u0000');
        if (causes.has(cause)) {
            return false;
        }
        causes.add(cause);
        return true;
    });
    const truncated = maxErrors < ordered.length;
    const kept = truncated ? ordered.slice(0, maxErrors) : ordered;
    // 6. The verdict derives from finding CLASSES, never from codes, so a
    //    new code can never change exit behaviour.
    let verdict = 'valid';
    if (0 < conflicts) {
        verdict = 'invalid';
    }
    else if (errorFindings > conflicts && true !== options.partial) {
        verdict = 'incomplete';
    }
    return { verdict, truncated, findings: kept };
}
//# sourceMappingURL=vet.js.map
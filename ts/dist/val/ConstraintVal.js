"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MustConstraintVal = exports.UniqueConstraintVal = exports.LengthConstraintVal = exports.ReConstraintVal = exports.NeqConstraintVal = exports.BelowConstraintVal = exports.AboveConstraintVal = exports.MaxConstraintVal = exports.MinConstraintVal = exports.ConstraintVal = void 0;
exports.normaliseRe = normaliseRe;
exports.constraintSubsumesConstraint = constraintSubsumesConstraint;
exports.constraintAdmitsScalar = constraintAdmitsScalar;
const type_1 = require("../type");
const utility_1 = require("../utility");
const Val_1 = require("./Val");
const keyorder_1 = require("../keyorder");
const ConjunctVal_1 = require("./ConjunctVal");
const BagVal_1 = require("./BagVal");
const top_1 = require("./top");
const unify_1 = require("../unify");
const IntegerVal_1 = require("./IntegerVal");
const err_1 = require("../err");
const FeatureVal_1 = require("./FeatureVal");
const ScalarKindVal_1 = require("./ScalarKindVal");
const numcmp_1 = require("./numcmp");
// THE PATTERN SUBSET, AND HOW IT IS ENFORCED (G1 phase 2; ADR-003).
//
// `re(p)` must mean the same thing in both engines and cost about the
// same, and the two host engines guarantee neither: TypeScript compiles
// with JavaScript's backtracking RegExp, Go with RE2 — a different
// language in a different complexity class, over a different alphabet.
//
// The enforcement is NORMALISATION, not refusal (ADR-003). Every
// construct whose expansion is engine-defined is rewritten here, by
// this function, into an explicit form that cannot be read two ways;
// only the rewritten pattern reaches a host engine. The alternative —
// refusing everything that might differ — was tried first and leaked
// three times, because its correctness depended on this comment knowing
// every difference between two large engines.
//
// Aontu therefore DEFINES the abbreviations rather than inheriting
// either host's. The definitions are deliberately the small ASCII ones,
// because a config value containing U+00A0 is a mistake to catch, not a
// space to accept silently:
//
//     \d  [0-9]                 \D  [^0-9]
//     \w  [0-9A-Za-z_]          \W  [^0-9A-Za-z_]
//     \s  [ \t\n\r\f\v]         \S  [^ \t\n\r\f\v]
//     .   [^\n]
//     \A  ^                     \z  $
//
// Neither host agreed with all of these before rewriting: JavaScript's
// \s also matches U+00A0 and other Unicode spaces, RE2's omits \v, and
// the two `.` sets differ by \r and the Unicode line separators. After
// rewriting, both engines see one explicit class and cannot disagree.
//
// What is still REFUSED, and why refusal is right for these:
//
//  1. Constructs one engine simply lacks — backreferences and
//     lookaround (not in RE2, and not expressible as regular
//     expressions at all), POSIX classes, `\p{...}`, `\x{...}`, `\u`.
//     There is nothing to normalise them TO.
//  2. `(?` other than `(?:` — named groups are spelled differently
//     (`(?P<n>` in RE2, `(?<n>` in JavaScript) and inline flags change
//     the meaning of everything after them.
//  3. A quantifier applied to a group containing a quantifier or an
//     alternation. This one is about TIME, not meaning: `(a+)+$`
//     against twenty-nine characters takes 45 SECONDS in JavaScript
//     and 0.065s under RE2, and a regex match is counted by no
//     evaluator budget, so an untrusted schema could otherwise stall
//     the TypeScript evaluator indefinitely (docs/trust.md clause 2).
//     Normalisation cannot fix a complexity difference; only owning the
//     matcher could, which ADR-003 records as the future option.
//
// The alphabet is fixed separately, by compiling with the `u` flag:
// JavaScript otherwise matches UTF-16 code units where RE2 matches code
// points, so `^.$` accepted U+1D11E in Go and refused it in TypeScript.
//
// This function is mirrored statement for statement in go/constraint.go,
// and `test/spec/files/regex-corpus.txt` pins that the two produce
// byte-identical output for every pattern in a generated corpus.
// The largest repeat count Aontu's pattern language admits. RE2 caps a
// repeat at 1000 and refuses to compile past it, where JavaScript's
// backtracking engine accepts any count -- so `re("^a{1001}$")` was
// VALID in TypeScript and an `error` verdict in Go, a cross-port
// verdict flip on a schema an agent could be handed
// (status-2026-08-21.md section 4). Under ADR-003 the host's own
// compile failure must never be what a user sees, so the bound is
// Aontu's: at most RE_REPEAT_MAX, refused identically in both ports
// before either engine compiles. Nested products beyond the cap were
// already refused, by the quantified-group rule below.
const RE_REPEAT_MAX = 1000;
// The normative expansions. These are Aontu's definitions, not either
// host's; both hosts are rewritten to them.
const RE_CLASS_DIGIT = '0-9';
const RE_CLASS_WORD = '0-9A-Za-z_';
const RE_CLASS_SPACE = ' \\t\\n\\r\\f\\v';
// Metacharacters that may be escaped to mean themselves, in both
// engines. `-` is handled separately: it is legal escaped only INSIDE a
// character class, because RE2 accepts `a\-b` and JavaScript's unicode
// mode makes it a syntax error.
const RE_ESCAPE_PUNCT = '\\.+*?()[]{}|^$/';
// Escapes passed through unchanged: the control characters, the ASCII
// word boundary, and `\xHH`. Each was probed in both engines.
const RE_ESCAPE_PASS = 'tnrfv';
// A counted quantifier `{n}`, `{n,}` or `{n,m}` starting at `src[at]`.
// Two rules, both about what the hosts do NOT share:
//
//  - A bound above RE_REPEAT_MAX: RE2 refuses to compile it, JavaScript
//    accepts it.
//  - A brace that does not open a well-formed counted quantifier at
//    all (`x{y}`, `a{`, `{,5}`): JavaScript compiled with the `u` flag
//    makes it a SYNTAX ERROR, while RE2 reads it as a literal brace, so
//    `re("^x{y}$")` was `constraint_pattern` in TypeScript and a plain
//    unresolved value in Go -- the same class of verdict flip as the
//    repeat cap, found by sweeping around it. A literal brace is
//    written escaped (`a\\{1001\\}`), which both engines share.
function repeatWhy(src, at) {
    const bad = (what) => [
        'a ' + what + ', which the two engines do not read the same way', -1
    ];
    let i = at + 1;
    let digits = '';
    const bounds = [];
    let commas = 0;
    for (; i < src.length; i++) {
        const c = src[i];
        if ('0' <= c && c <= '9') {
            digits += c;
            continue;
        }
        if (',' === c) {
            if ('' === digits || 0 < commas) {
                return bad('{ that does not open a counted quantifier');
            }
            bounds.push(parseInt(digits, 10));
            digits = '';
            commas++;
            continue;
        }
        if ('}' === c) {
            if ('' !== digits) {
                bounds.push(parseInt(digits, 10));
            }
            else if (0 === commas) {
                return bad('{ that does not open a counted quantifier');
            }
            break;
        }
        return bad('{ that does not open a counted quantifier');
    }
    if (i >= src.length) {
        return bad('{ that does not open a counted quantifier');
    }
    for (const b of bounds) {
        if (RE_REPEAT_MAX < b) {
            return ['a repeat count above ' + RE_REPEAT_MAX +
                    ', which RE2 refuses to compile', -1];
        }
    }
    // A descending range (`{5,2}`) is refused by both engines' own
    // compilers, so it needs no rule here.
    return ['', i];
}
function isHexDigit(c) {
    return null != c && (('0' <= c && c <= '9') || ('a' <= c && c <= 'f') || ('A' <= c && c <= 'F'));
}
// normaliseEscape rewrites one `\<n>` into its engine-neutral form.
// Returns [emitted, why, extra]: `why` non-empty means refused, and
// `extra` counts source characters consumed beyond the backslash and n.
function normaliseEscape(n, src, i, inClass) {
    if (null == n) {
        return ['', 'a trailing backslash', 0];
    }
    if ('1' <= n && n <= '9') {
        return ['', 'a backreference (\\' + n + '): RE2 has no equivalent, and a' +
                ' pattern with one is not a regular expression', 0];
    }
    if ('k' === n) {
        return ['', 'a named backreference (\\k): RE2 has no equivalent', 0];
    }
    if ('u' === n) {
        return ['', 'a \\u escape, which RE2 spells \\x{...}: write the character' +
                ' itself, or \\xHH for a byte', 0];
    }
    if ('p' === n || 'P' === n) {
        return ['', 'a Unicode class (\\' + n + '), which JavaScript reads as a' +
                ' literal "' + n + '" without a flag Aontu does not set', 0];
    }
    if ('Z' === n) {
        return ['', '\\Z, which RE2 does not accept and JavaScript reads as a' +
                ' literal "Z": write $ for end of text', 0];
    }
    if ('x' === n) {
        if ('{' === src[i + 2]) {
            return ['', 'a \\x{...} escape, which JavaScript spells \\u: write the' +
                    ' character itself', 0];
        }
        if (!isHexDigit(src[i + 2]) || !isHexDigit(src[i + 3])) {
            return ['', 'an \\x escape without two hex digits', 0];
        }
        return ['\\x' + src[i + 2] + src[i + 3], '', 2];
    }
    // The abbreviations, rewritten to Aontu's definitions. Inside a class
    // the expansion splices without its brackets (`[\dx]` -> `[0-9x]`).
    if ('d' === n || 'w' === n || 's' === n) {
        const set = 'd' === n ? RE_CLASS_DIGIT :
            'w' === n ? RE_CLASS_WORD : RE_CLASS_SPACE;
        return [inClass ? set : '[' + set + ']', '', 0];
    }
    if ('D' === n || 'W' === n || 'S' === n) {
        if (inClass) {
            // `[^...]` cannot be spliced into an enclosing class: the negation
            // would apply to the whole class rather than this member.
            return ['', 'a negated abbreviation (\\' + n + ') inside a character' +
                    ' class, which cannot be expanded in place: write the characters out', 0];
        }
        const set = 'D' === n ? RE_CLASS_DIGIT :
            'W' === n ? RE_CLASS_WORD : RE_CLASS_SPACE;
        return ['[^' + set + ']', '', 0];
    }
    // Anchors. `\A`/`\z` are RE2 spellings that JavaScript reads as
    // literals, so they are rewritten rather than refused. Inside a class
    // an anchor is meaningless, and `[\b]` is a BACKSPACE in JavaScript.
    if ('A' === n || 'z' === n || 'b' === n || 'B' === n) {
        if (inClass) {
            return ['', '\\' + n + ' inside a character class, where the two' +
                    ' engines do not agree what it means', 0];
        }
        return ['A' === n ? '^' : 'z' === n ? '$' : '\\' + n, '', 0];
    }
    if ('-' === n) {
        return inClass ? ['\\-', '', 0] :
            ['', '\\- outside a character class: it is a range separator inside' +
                    ' one and a syntax error outside one (write a bare -)', 0];
    }
    if (RE_ESCAPE_PASS.includes(n) || RE_ESCAPE_PUNCT.includes(n)) {
        return ['\\' + n, '', 0];
    }
    return ['', '\\' + n + ', an escape whose meaning the two engines do not' +
            ' share', 0];
}
// normaliseRe rewrites a pattern into the engine-neutral subset.
// Returns [normalised, why]: a non-empty `why` means the pattern is
// outside the subset and names the construct.
function normaliseRe(src) {
    let inClass = false;
    const out = [];
    // One frame per open group, recording whether it contains a quantifier
    // or an alternation. A group carrying either may not itself be
    // quantified; containment is transitive, so a frame hands its flags up
    // to its parent when it closes.
    const groups = [];
    const mark = (k) => {
        if (0 < groups.length) {
            groups[groups.length - 1][k] = true;
        }
    };
    // Where the counted quantifier validated below closes, so its own
    // `}` is told apart from a stray one; and whether the atom just
    // emitted was `^` or `$`, which cannot be quantified.
    let repeatEnd = -1;
    let anchorPrev = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        const afterAnchor = anchorPrev;
        anchorPrev = false;
        if ('\\' === c) {
            const [emit, why, extra] = normaliseEscape(src[i + 1], src, i, inClass);
            if ('' !== why) {
                return ['', why];
            }
            out.push(emit);
            // `\b` AND `\B` ARE ASSERTIONS TOO, and quantifying one is the
            // same disagreement `^{1}` is: JavaScript under `u` calls it a
            // syntax error, RE2 quantifies the assertion happily. The rule
            // said "`\b` and `\B` quantify identically in both and are left
            // alone" and that was measured wrong -- `re("\\b{1}x")` is
            // `constraint_pattern` in TypeScript and an accepted schema in
            // Go. Only OUTSIDE a class: inside one, `\b` is a backspace in
            // both engines and repeats like any other character.
            if (!inClass && ('b' === src[i + 1] || 'B' === src[i + 1])) {
                anchorPrev = true;
            }
            i += 1 + extra;
            continue;
        }
        // A POSIX class opener, anywhere: the form lives inside an ordinary
        // class (`[[:alpha:]]`), and refusing it everywhere is one rule
        // rather than two.
        if ('[' === c && ':' === src[i + 1]) {
            return ['', 'a POSIX class ([:...:]), which JavaScript does not have'];
        }
        if (inClass) {
            if (']' === c) {
                inClass = false;
            }
            out.push(c);
            continue;
        }
        if ('[' === c) {
            // `[]` is a never-matching class in JavaScript and a parse error in
            // RE2; `[^]` is the same disagreement one character along.
            const first = '^' === src[i + 1] ? src[i + 2] : src[i + 1];
            if (']' === first) {
                return ['', 'an empty character class, which RE2 refuses'];
            }
            inClass = true;
            out.push(c);
            continue;
        }
        if ('.' === c) {
            out.push('[^\\n]');
            continue;
        }
        if ('(' === c) {
            if ('?' === src[i + 1]) {
                if (':' !== src[i + 2]) {
                    return ['', 'a (?...) group other than the non-capturing (?:'];
                }
                out.push('(?:');
                i += 2;
            }
            else {
                out.push(c);
            }
            groups.push({ q: false, alt: false });
            continue;
        }
        if (')' === c) {
            const g = groups.pop();
            if (null == g) {
                return ['', 'an unbalanced group'];
            }
            const nx = src[i + 1];
            const quantified = '*' === nx || '+' === nx || '?' === nx || '{' === nx;
            if (quantified && (g.q || g.alt)) {
                return ['', 'a quantifier applied to a group containing ' +
                        (g.q ? 'another quantifier' : 'an alternation') +
                        ', which backtracks exponentially in JavaScript'];
            }
            if (g.q)
                mark('q');
            if (g.alt)
                mark('alt');
            out.push(c);
            continue;
        }
        if ('|' === c) {
            mark('alt');
            out.push(c);
            continue;
        }
        if ('*' === c || '+' === c || '?' === c || '{' === c) {
            // Nothing to repeat. JavaScript under the `u` flag makes this a
            // SYNTAX ERROR, where RE2 quantifies the assertion happily and
            // matches, so `re("^{1}")` was `constraint_pattern` in
            // TypeScript and an accepted schema in Go. The four assertions
            // behave alike here -- `^`, `$`, `\b` and `\B` -- so the rule
            // names all four.
            if (afterAnchor) {
                return ['', 'a quantifier applied to `^`, `$`, `\\b` or ' +
                        '`\\B`, which has nothing to repeat'];
            }
            if ('{' === c) {
                const [why, end] = repeatWhy(src, i);
                if ('' !== why) {
                    return ['', why];
                }
                repeatEnd = end;
            }
            mark('q');
            out.push(c);
            continue;
        }
        // A `}` that closes no counted quantifier: JavaScript under `u`
        // refuses it as a lone quantifier bracket, RE2 reads it as a
        // literal. Written escaped inside a class (`[}]`) it is a literal
        // in both, which is the spelling that survives.
        if ('}' === c) {
            if (i !== repeatEnd) {
                return ['', 'a `}` that closes no counted quantifier, which ' +
                        'the two engines do not read the same way'];
            }
            out.push(c);
            continue;
        }
        out.push(c);
        anchorPrev = ('^' === c || '$' === c);
    }
    if (inClass) {
        return ['', 'an unterminated character class'];
    }
    if (0 < groups.length) {
        return ['', 'an unclosed group'];
    }
    return [out.join(''), ''];
}
// True for a scalar Val the algebra can order: a numeric leaf or a
// string. (Booleans and null have no order and no bounds.)
function numericLeaf(v) {
    return true === v?.isScalar &&
        (v.isInteger || v.isNumber || v.isBigInteger || v.isBigDecimal) &&
        !(v.isNumber && Number.isNaN(v.peg));
}
function stringLeaf(v) {
    return true === v?.isScalar && 'string' === typeof v.peg && v.isString;
}
// Scalar identity: leaf AND value, the lattice's own rule (1 and 1.0
// are different scalars). Exact numeric comparison decides the value
// half for numeric leaves.
function sameScalar(a, b) {
    if (numericLeaf(a) && numericLeaf(b)) {
        return (0, numcmp_1.towerRank)(a) === (0, numcmp_1.towerRank)(b) && 0 === (0, numcmp_1.cmpNumeric)(a, b);
    }
    if (stringLeaf(a) && stringLeaf(b)) {
        return a.peg === b.peg;
    }
    return false;
}
// Domain-aware value comparison for bounds and neq ordering.
function cmpVal(domain, a, b) {
    return 'number' === domain ? (0, numcmp_1.cmpNumeric)(a, b) : (0, numcmp_1.cmpCodePoints)(a.peg, b.peg);
}
// The numeric leaf marker a concrete scalar carries, for the kind
// narrowing check.
function leafMarker(v) {
    return v.isBigDecimal ? ScalarKindVal_1.BigDecimal : v.isBigInteger ? ScalarKindVal_1.BigInteger :
        v.isInteger ? ScalarKindVal_1.Integer : ScalarKindVal_1.Float;
}
// Conjunct sort order for an atom that must see the WHOLE value.
// Every other value sorts below the container default (99999), so such
// an atom is the LAST term to fold: `a:length(2) a:{x:1} a:{y:2}` must
// count the MERGED map, and a constraint that folded at 50000 would
// count `{x:1}` alone and refuse the layering that is the whole point
// of the language.
//
// The order atoms keep the low slot: `min(2) & 1 & 2` may decide as
// soon as it sees a scalar, because meeting more scalars can only
// narrow. Meeting more containers GROWS the member set, which is why
// the two orders differ.
//
// Three atoms are late: `length` and `unique` (they count members), and
// `must` (an evaluate-only check against the finished value).
const LATE_CJO = 150000;
function lateAtom(atom) {
    return 'length' === atom || 'unique' === atom || 'must' === atom;
}
class ConstraintVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super({ ...spec, peg: spec.peg ?? [] }, ctx);
        this.isConstraint = true;
        this.cjo = 50000;
        this.neqs = [];
        this.res = [];
        this.uniq = false;
        this.uniqBy = [];
        this.musts = [];
        if (spec.state) {
            this.domain = spec.state.domain;
            this.kind = spec.state.kind;
            this.lo = spec.state.lo;
            this.hi = spec.state.hi;
            this.neqs = spec.state.neqs;
            // A state built by an embedder (or by a per-port test) may predate
            // the pattern field; an absent one means "no patterns", not undefined.
            this.res = spec.state.res ?? [];
            this.count = spec.state.count;
            this.uniq = spec.state.uniq ?? false;
            this.uniqBy = spec.state.uniqBy ?? [];
            this.musts = spec.state.musts ?? [];
            this.invalid = spec.state.invalid;
        }
        else if (spec.atom) {
            const args = atomArgs(spec.atom, spec.peg ?? []);
            // An argument that is not yet concrete — a reference, an
            // arithmetic expression, a conjunct of atoms — makes the whole
            // atom PENDING rather than invalid (G1 phase 4). It is resolved
            // in unify, where there is a ctx to resolve through, and the
            // residual is built from the settled arguments. Only a settled
            // argument of the wrong shape is an `invalid-arg`.
            // The effectful-argument refusal happens HERE, on the written
            // form, and not in fromAtom: settling is what runs the effect, so
            // by the time fromAtom sees a settled `move($.b)` the move has
            // already happened and the argument is just its result.
            if ('must' === spec.atom && args.some((a) => holdsMove(a))) {
                this.invalid = 'invalid-arg';
            }
            else if (args.some((a) => true !== a?.done)) {
                this.pending = { atom: spec.atom, args };
            }
            else {
                this.fromAtom(spec.atom, args);
            }
        }
        if (null != this.count || this.uniq || 0 < this.uniqBy.length ||
            0 < this.musts.length ||
            (null != this.pending && lateAtom(this.pending.atom))) {
            this.cjo = LATE_CJO;
        }
        // A residual constraint is stable, like a ScalarKindVal — but a
        // pending atom is not a residual yet, and must be re-entered on
        // later passes until its arguments settle.
        if (null == this.pending) {
            this.dc = type_1.DONE;
        }
        else {
            this.notdone();
        }
    }
    // Normalise one atom call into state. Every argument here is already
    // SETTLED — the constructor routes an unsettled one to `pending` —
    // so a shape this cannot use is a genuine `invalid-arg`, not a
    // not-yet.
    fromAtom(atom, args) {
        // Mark the residual invalid. It answers NOTHING: every caller
        // spells its exit `return bad(...)` and none reads a value, so a
        // return type would be a value nobody consumes -- and a routine
        // that answers on some paths and not others is the shape a reader
        // (and a static analyser) has to stop and check.
        const bad = (why) => {
            this.invalid = why;
        };
        // `unique()` is a property of the container -- not a comparison
        // against a value -- so with no argument it says the members are
        // pairwise DISTINCT. THE ONE ARGUMENT IS A PROJECTOR (the review's
        // finding I: "unique()-by-field is reserved but absent", and the
        // arity was reserved for exactly this): `unique(port)` says no two
        // members share a `port`, which is how "no two services share a
        // port" and "event ids are unique" are said.
        if ('unique' === atom) {
            if (0 === args.length) {
                this.uniq = true;
                return;
            }
            if (1 !== args.length || !stringLeaf(args[0])) {
                return bad('invalid-arg');
            }
            this.uniqBy = [args[0].peg];
            return;
        }
        // `must(c, msg)` is Band B: an evaluate-only check against the
        // finished value, carrying the author's own message. It is KEPT,
        // never simplified and never consulted for emptiness or
        // subsumption — Band B is opaque by construction, which is exactly
        // what makes it the honest channel for a rule the algebra cannot
        // reason about (docs/reference-language.md, "Band B: `must`").
        if ('must' === atom) {
            if (2 !== args.length) {
                return bad('arg');
            }
            if (!stringLeaf(args[1])) {
                return bad('invalid-arg');
            }
            // A check carrying a nil can never be satisfied, so it is refused
            // as an ARGUMENT rather than left to fail against every value with
            // the author's message attached -- which would blame the data for
            // a mistake in the check. `must([1-x],m)` is the reachable case: a
            // degenerate expression leaves a nil inside the written list.
            if (holdsNil(args[0])) {
                return bad('invalid-arg');
            }
            // (An effectful argument is refused at construction, in the
            // constructor: by the time this arm sees a settled `move($.b)`
            // the move has already run.)
            this.musts = [{ v: args[0], msg: args[1] }];
            return;
        }
        if ('neq' === atom) {
            if (0 === args.length) {
                return bad('arg');
            }
            let domain = undefined;
            for (const a of args) {
                const d = numericLeaf(a) ? 'number' : stringLeaf(a) ? 'string' : undefined;
                if (null == d || (null != domain && d !== domain)) {
                    return bad('invalid-arg');
                }
                domain = d;
            }
            this.domain = domain;
            this.neqs = dedupSorted(domain, args);
            return;
        }
        if (1 !== args.length) {
            return bad('arg');
        }
        const a = args[0];
        // `re` is the one atom whose argument is not an ORDER point: a
        // pattern is a membership test, so it takes the string domain
        // outright rather than inferring a domain from the argument's leaf.
        if ('re' === atom) {
            if (!stringLeaf(a)) {
                return bad('invalid-arg');
            }
            const src = a.peg;
            // Normalise BEFORE compiling: the host engines only ever see a
            // pattern that cannot be read two ways (ADR-003).
            const [norm, why] = normaliseRe(src);
            if ('' !== why) {
                this.invalidWhy = why;
                return bad('constraint_pattern');
            }
            let re;
            try {
                // The `u` flag is REQUIRED for parity, not an optimisation.
                // Without it JavaScript matches UTF-16 code units while RE2
                // matches code points, so `re("^.$")` accepted U+1D11E in Go
                // and refused it in TypeScript (and `^..$` did the reverse).
                // With it, `.` and every quantifier count code points in both.
                // It also makes JavaScript refuse the identity escapes this
                // scanner rejects by hand, which is defence in depth rather
                // than a substitute: RE2 accepts some of them, so the scanner
                // is what keeps the two ports agreeing.
                re = new RegExp(norm, 'u');
            }
            catch (e) {
                // The host engine refuses what the subset scanner passed — a
                // malformed quantifier, an unbalanced group. Same refusal under
                // the same code: the author gets one rule, not two. The message
                // is the host's, so it is NOT pinned by a shared row; the code
                // and the located frame are.
                this.invalidWhy = 'not a valid pattern';
                return bad('constraint_pattern');
            }
            this.domain = 'string';
            this.res = [{ v: a, src, norm, re }];
            return;
        }
        // `length` is the other non-ORDER atom: its argument constrains the
        // COUNT, not the value, so it is itself a residual over the integer
        // domain (docs/reference-language.md, "`length` semantics"). It is
        // resolved HERE, at construction, by walking the written argument
        // rather than by unifying it: the func-paren handler builds atoms
        // without an AontuContext, so there is nothing to fold a nested
        // conjunct through. Walking is enough because a length argument is by
        // definition a meet of concrete Band A atoms; anything else (a
        // reference, an expression) is refused rather than deferred, the
        // same discipline min/max apply to their own arguments.
        if ('length' === atom) {
            const arg = countArgState(a);
            if (null == arg) {
                return bad('invalid-arg');
            }
            const inner = meetCount(countBase(), arg);
            this.count = inner;
            // `length(min(5)&max(3))` is unsatisfiable with no peer in sight, so
            // it is refused at composition time like any other empty meet.
            if (stateEmpty(inner)) {
                return bad('constraint');
            }
            return;
        }
        const domain = numericLeaf(a) ? 'number' : stringLeaf(a) ? 'string' : undefined;
        if (null == domain) {
            return bad('invalid-arg');
        }
        this.domain = domain;
        const open = 'above' === atom || 'below' === atom;
        const bound = { v: a, open };
        if ('min' === atom || 'above' === atom) {
            this.lo = bound;
        }
        else {
            this.hi = bound;
        }
    }
    unify(peer, ctx) {
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Constraint', this, peer);
        // Every branch of the ladder assigns, so no initialiser: a
        // residual is stable and the ladder is total.
        let out;
        // A rel residual or a graph atom HOLDS constraints for the value
        // they stand for (RELATIONS P1/P2): hand the drive over before
        // any settling, exactly as a container does, so `rel(t) & re(x)`
        // reads the same in either order. Reached through the INCLUDE
        // flow (a loaded schema's conjunct re-drives with the constraint
        // on the left) -- inline documents route rel/atom peers through
        // unite's b-drives first, which is why use-cases/12-relations
        // refused without this arm while every inline row stayed green;
        // pinned by constraint-hands-drive-to-rel-and-atom.
        if (true === peer?.isRel
            || true === peer?.isGraphAtom) {
            out = peer.unify(this, ctx);
        }
        else if (null != this.pending) {
            out = this.settle(peer, ctx);
        }
        else if (null != this.invalid) {
            out = (0, err_1.makeNilErr)(ctx, this.invalid, this, undefined, 'constrain', null == this.invalidWhy ? undefined : { reason: this.invalidWhy });
        }
        else if (null == peer || peer.isTop) {
            out = this;
        }
        else if (peer.isNil) {
            out = peer;
        }
        else if (peer.isConstraint) {
            out = this.meetConstraint(peer, ctx);
        }
        else if (peer.isScalarKind) {
            out = this.meetKind(peer, ctx);
        }
        else if (peer.isScalar) {
            out = this.admit(peer, ctx);
        }
        else if (peer.isMap || peer.isList) {
            out = this.admitContainer(peer, ctx);
        }
        /* node:coverage ignore next 12 */
        else {
            // Every other shape: no order, no membership, nothing to count —
            // a conflict of the constraint family. The ladder above is total
            // in practice: every remaining Val kind either sorts BELOW a
            // constraint in a conjunct (conjunct, disjunct, pref, ref) and so
            // drives the meet from its own side, or resolves to a
            // scalar/container before a constraint sees it (func, op, var,
            // expect). The arm is kept because "in practice" depends on the
            // cjo table, and a future value class would land here rather than
            // falling out of unify with no result.
            out = this.fail(ctx, peer);
        }
        ctx.explain && (0, utility_1.explainClose)(te, out);
        return out;
    }
    // Resolve a pending atom's arguments and, once they have all settled,
    // become the residual they describe (G1 phase 4).
    //
    // This is the residuation discipline FuncBaseVal already follows for
    // its own operands: push each unsettled argument one step by unifying
    // it with `top`, and if any is still moving, mark not-done and defer
    // — either as this same pending atom (against a `top` peer) or
    // wrapped with the peer in a conjunct the next pass will re-enter.
    // Nothing is decided from a half-resolved argument, which is what
    // keeps `min($.lo)` from reporting a conflict against a bound that
    // has not arrived yet.
    settle(peer, ctx) {
        const TOP = (0, top_1.top)();
        const pend = this.pending;
        let settled = true;
        const args = [];
        for (const arg of pend.args) {
            let next = arg;
            if (true !== arg?.done) {
                // Charged to the depth budget: this recurses without going
                // through `unite`, so the counter would otherwise stay flat
                // while the stack grows (the rule FuncBaseVal follows).
                next = (0, unify_1.withDepth)(ctx, arg, TOP, () => arg.unify(TOP, ctx));
            }
            settled = settled && true === next?.done;
            args.push(next);
        }
        if (settled) {
            // Build the residual the atom always meant, at this atom's site,
            // then let the ordinary ladder meet it with the peer.
            const built = new ConstraintVal({ peg: args, atom: pend.atom }, ctx);
            built.path = this.path;
            built.site.row = this.site.row;
            built.site.col = this.site.col;
            built.site.url = this.site.url;
            (0, utility_1.propagateMarks)(this, built);
            return built.unify(peer, ctx);
        }
        this.notdone();
        // A fresh pending atom carrying the partially-resolved arguments, so
        // the next pass starts from the progress this one made rather than
        // re-resolving from source.
        const again = new ConstraintVal({ peg: args, atom: pend.atom }, ctx);
        again.path = this.path;
        again.site.row = this.site.row;
        again.site.col = this.site.col;
        again.site.url = this.site.url;
        (0, utility_1.propagateMarks)(this, again);
        if (null == peer || peer.isTop) {
            return again;
        }
        // No nil-peer arm: `unite` returns a nil operand before dispatching
        // to any Val's unify (ts/src/unify.ts), so a nil never reaches here
        // — and were one to, the conjunct below folds to it unchanged.
        return new ConjunctVal_1.ConjunctVal({ peg: [again, peer] }, ctx);
    }
    // Membership: the peer scalar passes every part of the residual, or
    // the whole meet is a located conflict.
    admit(peer, ctx) {
        // No scalar has members, so a `unique()` residual admits none --
        // and neither does a `unique(k)` one, for the same reason.
        if (this.uniq || 0 < this.uniqBy.length) {
            return this.fail(ctx, peer);
        }
        if (!stateAdmits(this, peer)) {
            return this.fail(ctx, peer);
        }
        if (null != this.count) {
            // Only a string among the scalars has a length, and it is counted
            // in CODE POINTS -- not UTF-16 units (this host's native count)
            // and not bytes (Go's). Iterating a string yields code points.
            if (!stringLeaf(peer)) {
                return this.fail(ctx, peer);
            }
            if (!stateAdmits(this.count, countVal([...peer.peg].length))) {
                return this.fail(ctx, peer);
            }
        }
        // A SCALAR HAS NO MEMBERS to accumulate, so its musts are decided
        // here and never residuate: the final reading is the only reading
        // a scalar has.
        const bad = this.checkMusts(peer, ctx, true);
        if (null != bad) {
            return bad;
        }
        return peer;
    }
    // Band B, applied to a finished value. Each check is a plain
    // unification against a CLONE of the peer: `must` reports, it never
    // contributes: whatever the check would have added to the value is
    // discarded, and `peer` is returned untouched by the callers.
    //
    // The trial runs in an isolated collect context so a failing check
    // leaves nothing on the caller's error list — only the located nil
    // this returns, carrying the author's own message.
    // `final` is the generation-time reading (see settleContainer): a
    // must whose own check is a SIZING atom inherits that atom's
    // provisionality, because `must(length(2), …)` against a map that may
    // still gain members has not failed yet -- it has not been answered.
    // Without this the must would decide against whatever the container
    // held when it first settled, which is the very defect the sizing
    // atoms were fixed for (use-cases/BUGS.md §16, §17).
    checkMusts(peer, ctx, final) {
        for (const m of this.musts) {
            const trial = ctx.clone({ err: [], collect: true });
            let got = (0, unify_1.unite)(trial, m.v.clone(trial), peer.clone(trial), 'must');
            // A must whose check is a SIZING atom answers a residue rather
            // than a verdict, because the atom is waiting for members that
            // may still arrive. Before generation that residue IS the answer
            // -- the must has not failed, it has not been asked yet -- and at
            // generation it is settled, because nothing more can arrive.
            const residue = (0, BagVal_1.sizingResidue)(got);
            if (undefined !== residue) {
                if (true !== final) {
                    continue;
                }
                got = residue.con.settleContainer(residue.bag, trial);
            }
            if (true === got?.isNil || 0 < trial.err.length) {
                return (0, err_1.makeNilErr)(ctx, 'must', this, peer, undefined, {
                    message: m.msg.peg,
                    expected: m.v.canon,
                    actual: peer.canon,
                });
            }
        }
        return undefined;
    }
    // THE FINAL READING of a sizing atom over a container: the same
    // checks admitContainer makes, with the provisional ones taken as
    // decided. Called from ConjunctVal.gen, which is where no more
    // members can arrive. Returns the container (to generate) or the
    // constraint's own nil (to report).
    settleContainer(peer, ctx) {
        return this.admitContainer(peer, ctx, true);
    }
    // Membership for a container peer. Only the SIZING atoms have anything
    // to say about a map or a list; every other atom is scalar-domain and
    // refuses one.
    //
    // The members that count are the members that GENERATE
    // (docs/reference-language.md, "`length` semantics"), and rather than
    // mirror generation's filter — type/hide marks, optional keys that
    // drop, empty optional values — this asks generation itself, in an
    // isolated collect context so nothing leaks into the caller's errors.
    // A mirror would be a second copy of a filter that has already grown
    // subtle, free to drift from it; asking is correct by construction.
    admitContainer(peer, ctx, final) {
        // A scalar-domain residual has no reading over a container.
        if (null != this.domain) {
            return this.fail(ctx, peer);
        }
        // Not yet settled: the container, or an optional child, may still
        // resolve, so the member set is not final. Defer rather than decide
        // — the same discipline OpBaseVal follows for a non-concrete operand.
        if (!containerSettled(peer)) {
            this.dc = 0;
            return new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
        }
        const bad = this.checkMusts(peer, ctx, final);
        if (null != bad) {
            return bad;
        }
        // A MUST OVER A CONTAINER RESIDUATES with the atoms, for the same
        // reason (use-cases/BUGS.md §17): `must({t: max(60)}, …)` beside a
        // `{t: integer}` schema was answered against the schema layer
        // ALONE, and discharged before the data it was written to judge
        // ever arrived. It is decided at generation, where the value is
        // whole -- unless there is nothing else on the constraint AND the
        // reading is already final.
        if (!this.uniq && 0 === this.uniqBy.length && null == this.count) {
            if (true === final || 0 === this.musts.length) {
                return peer;
            }
            return this.hold(peer, ctx);
        }
        const members = emittedMembers(peer, ctx);
        if (null == members) {
            // NOT COUNTABLE YET IS NOT A PASS. A container that cannot
            // generate cannot be counted, and a SCHEMA is exactly that: the
            // members of `{a: integer}` are types, so nothing is emitted and
            // nothing can be counted. Discharging the atom here was the §16
            // defect wearing its other face -- `length(min(2)) & {a: integer}`
            // dropped its bound while still alone, so the data half of a
            // `vet` meet was never measured at all and short data vetted
            // clean against a bound the evaluator enforces.
            //
            // At generation the reading IS final: a container that still
            // cannot generate has its own error, and that error is the one
            // worth reporting, so it passes through untouched.
            if (true === final) {
                return peer;
            }
            return this.hold(peer, ctx);
        }
        // MONOTONE READINGS ONLY (the review's finding C, use-cases/BUGS.md
        // §16). Members ACCUMULATE under unification -- a meet adds keys and
        // never removes them -- so a settled container is settled ON ITS
        // OWN and not against every value that may still contribute. The
        // schema half of a `vet` meet, a document that is about to receive
        // an `@` include, a bag a later `pack` will fill: each settles, and
        // an atom that decided there decided too early.
        //
        // So a verdict is taken only when MORE MEMBERS CANNOT CHANGE IT:
        //   - an upper bound VIOLATED is permanent -> refuse now;
        //     satisfied is provisional -> keep the atom, re-check later.
        //   - a lower bound SATISFIED is permanent -> that part may go;
        //     violated is provisional -> keep the atom (which is why
        //     `length(min(1))` beside a template no longer kills the schema
        //     it was written for).
        //   - a DUPLICATE is permanent -> refuse now; distinctness is
        //     provisional -> keep the atom.
        // Anything provisional residuates, exactly as an unsettled
        // container does above, and the two spellings then agree.
        const count = null == this.count ? undefined : this.count;
        const n = members.length;
        if (null != count) {
            if (null != count.hi && !stateAdmits({ ...count, lo: undefined }, countVal(n))) {
                return this.fail(ctx, peer);
            }
            if (0 < count.neqs.length && !stateAdmits({ ...count, lo: undefined, hi: undefined }, countVal(n))) {
                return this.fail(ctx, peer);
            }
            // The provisional half, decided only when nothing more can
            // arrive: a lower bound still short is a refusal at generation
            // and a residue before it.
            if (true === final && !stateAdmits(count, countVal(n))) {
                return this.fail(ctx, peer);
            }
        }
        if (this.uniq) {
            // Members compare by CANONICAL FORM, which reduces to scalar
            // identity for scalars (so [1, 1.0] is distinct) and gives
            // structural equality for container members without a second
            // rule. A generated value could not express the first: `1` and
            // `1.0` generate the same JSON number.
            const seen = new Set();
            for (const m of members) {
                const key = m.canon;
                if (seen.has(key)) {
                    return this.fail(ctx, peer);
                }
                seen.add(key);
            }
        }
        // ... and the same test per PROJECTED key. A member that has no such
        // key FAILS the constraint rather than being skipped: distinctness
        // it cannot be shown to have is distinctness it does not have, and
        // skipping would let one keyless record hide a duplicate.
        for (const field of this.uniqBy) {
            const seen = new Set();
            for (const m of members) {
                const at = true === m.isMap ?
                    m.peg[field] : undefined;
                if (null == at) {
                    return this.fail(ctx, peer);
                }
                const key = at.canon;
                if (seen.has(key)) {
                    return this.fail(ctx, peer);
                }
                seen.add(key);
            }
        }
        // WHAT IS LEFT IS PROVISIONAL, so the atom stays on the value. A
        // lower bound already met is the one reading that cannot be undone,
        // and an atom holding nothing else is spent: that is when it goes.
        const spent = true === final || (0 === this.musts.length &&
            !this.uniq && 0 === this.uniqBy.length &&
            (null == count ||
                (null == count.hi && 0 === count.neqs.length &&
                    stateAdmits(count, countVal(n)))));
        if (spent) {
            return peer;
        }
        // DONE, unlike the unsettled case above. The container HAS settled;
        // the atom is kept only because a LATER value could still add
        // members, and a residue that reported itself unresolved would
        // leave every enclosing value unresolved with it -- a `type()`
        // waiting on its argument for ever, and use case 09's whole
        // registry with it.
        // The ATOM is done too, not just the conjunct. An earlier pass may
        // have set `dc = 0` on the unsettled branch above, and a conjunct
        // recomputes its own doneness from its terms on every later meet --
        // so a stale 0 here would drag the residue, and every value holding
        // it, back to unresolved for ever.
        return this.hold(peer, ctx);
    }
    // The atom kept on a value whose reading is still provisional.
    // DONE, unlike the unsettled container above: the value HAS settled;
    // the atom is kept only because a LATER value could still add
    // members, and a residue that reported itself unresolved would leave
    // every enclosing value unresolved with it -- a `type()` waiting on
    // its argument for ever, and use case 09's whole registry with it.
    // The ATOM is done too, not just the conjunct. An earlier pass may
    // have set `dc = 0` on the unsettled branch, and a conjunct
    // recomputes its own doneness from its terms on every later meet --
    // so a stale 0 here would drag the residue, and every value holding
    // it, back to unresolved for ever.
    hold(peer, ctx) {
        this.dc = type_1.DONE;
        const held = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
        held.dc = type_1.DONE;
        return held;
    }
    // Meet with a kind: `number` (or `string` on the string domain) is
    // already implied by an ORDER atom's argument; a numeric LEAF narrows
    // the residual; anything else has an empty intersection with the
    // constraint's domain.
    //
    // A sizing residual (`length`, `unique`) has no domain of its own -- a
    // count says nothing about what is counted -- so a kind here SETS one
    // rather than merely agreeing with it: `string & length(3)` is a
    // three-character string, and `number & length(3)` is empty because a
    // number has no length (stateEmpty decides that, not this).
    meetKind(peer, ctx) {
        const marker = peer.peg;
        const merged = this.cloneState();
        if (Number === marker || String === marker) {
            const d = Number === marker ? 'number' : 'string';
            if (d === this.domain) {
                return this;
            }
            if (null != this.domain) {
                return this.fail(ctx, peer);
            }
            merged.domain = d;
            return this.finish(merged, ctx, peer);
        }
        const isLeaf = ScalarKindVal_1.Integer === marker || ScalarKindVal_1.Float === marker ||
            ScalarKindVal_1.BigInteger === marker || ScalarKindVal_1.BigDecimal === marker;
        if (!isLeaf || 'string' === this.domain) {
            return this.fail(ctx, peer);
        }
        if (null != this.kind && this.kind !== marker) {
            return this.fail(ctx, peer);
        }
        merged.domain = 'number';
        merged.kind = marker;
        return this.finish(merged, ctx, peer);
    }
    // Meet with another residual: interval intersection, exclusion
    // union, kind union — then the eager emptiness rules.
    meetConstraint(peer, ctx) {
        if (null != peer.invalid) {
            return (0, err_1.makeNilErr)(ctx, peer.invalid, peer, undefined, 'constrain', null == peer.invalidWhy ? undefined : { reason: peer.invalidWhy });
        }
        if (null != this.domain && null != peer.domain && this.domain !== peer.domain) {
            return this.fail(ctx, peer);
        }
        if (null != this.kind && null != peer.kind && this.kind !== peer.kind) {
            return this.fail(ctx, peer);
        }
        const d = (this.domain ?? peer.domain);
        const merged = this.cloneState();
        merged.domain = d;
        merged.kind = this.kind ?? peer.kind;
        merged.lo = tighter(d, this.lo, peer.lo, true);
        merged.hi = tighter(d, this.hi, peer.hi, false);
        merged.neqs = dedupSorted(d, [...this.neqs, ...peer.neqs]);
        merged.res = dedupSortedRes([...this.res, ...peer.res]);
        // `length(c1) & length(c2)` is `length(c1 & c2)`: the count atom reuses
        // numeric algebra recursively, over the counts rather than the
        // values.
        merged.count = null == this.count ? peer.count :
            null == peer.count ? this.count : meetCount(this.count, peer.count);
        // `unique()` is idempotent: two of them are one.
        merged.uniq = this.uniq || peer.uniq;
        // `unique(a) & unique(b)` is BOTH, not the later one: each names a
        // key on which the members must differ, and dropping either would
        // silently weaken the constraint. Sorted and deduplicated, so the
        // meet is commutative and `unique(a) & unique(a)` is one atom.
        merged.uniqBy = [...new Set([...this.uniqBy, ...peer.uniqBy])].sort();
        // Band B checks accumulate in written order and are never merged,
        // deduplicated or reordered: each carries its own author message,
        // and two checks with the same shape may still say different things.
        merged.musts = [...this.musts, ...peer.musts];
        return this.finish(merged, ctx, peer);
    }
    // Build the merged residual, applying the eager emptiness rules.
    finish(state, ctx, peer) {
        if (stateEmpty(state)) {
            return this.fail(ctx, peer);
        }
        const out = new ConstraintVal({ peg: [], state }, ctx);
        out.path = this.path;
        out.site.row = this.site.row;
        out.site.col = this.site.col;
        out.site.url = this.site.url;
        // Marks ratchet across a meet (the propagateMarks rule): a fresh
        // residual must carry both operands' type/hide marks, or a
        // `type(min(0)) & max(10)` merge would silently unmark the field
        // (the Go fold re-ratchets from its terms; this is the TS twin).
        (0, utility_1.propagateMarks)(this, out);
        (0, utility_1.propagateMarks)(peer, out);
        return out;
    }
    fail(ctx, peer) {
        return (0, err_1.makeNilErr)(ctx, 'constraint', this, peer, undefined, {
            expected: this.canon,
            actual: peer?.canon,
        });
    }
    cloneState() {
        return {
            domain: this.domain,
            kind: this.kind,
            lo: this.lo,
            hi: this.hi,
            neqs: [...this.neqs],
            res: [...this.res],
            count: this.count,
            uniq: this.uniq,
            uniqBy: [...this.uniqBy],
            musts: [...this.musts],
            invalid: this.invalid,
        };
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, {
            ...(spec || {}),
            peg: this.peg,
        });
        out.domain = this.domain;
        out.kind = this.kind;
        out.lo = this.lo;
        out.hi = this.hi;
        out.neqs = [...this.neqs];
        out.res = [...this.res];
        out.count = this.count;
        out.uniq = this.uniq;
        out.uniqBy = [...this.uniqBy];
        out.musts = [...this.musts];
        out.pending = this.pending;
        out.cjo = this.cjo;
        out.invalid = this.invalid;
        out.invalidWhy = this.invalidWhy;
        return out;
    }
    // The fixed canonical atom order: kind, lower, upper, neq (arguments
    // sorted), re, length, unique. No spaces; reparses to a conjunct that
    // normalises back to this exact residual.
    get canon() {
        if (null != this.pending) {
            // A pending atom has no residual yet, so canon renders the call as
            // written — the same shape FuncBaseVal renders while deferring.
            return this.pending.atom +
                '(' + this.pending.args.map((a) => a.canon).join(',') + ')';
        }
        return canonState(this);
    }
    same(peer) {
        return true === peer?.isConstraint && this.canon === peer.canon;
    }
}
exports.ConstraintVal = ConstraintVal;
// The tighter of two like-direction bounds: the higher lower bound (or
// lower upper bound); on the same point the OPEN bound wins, and on a
// full tie the tower-lowest endpoint spelling survives.
function tighter(domain, a, b, lower) {
    if (null == a)
        return b;
    if (null == b)
        return a;
    const c = cmpVal(domain, a.v, b.v);
    if (0 !== c) {
        return (lower ? 0 < c : c < 0) ? a : b;
    }
    if (a.open !== b.open) {
        return a.open ? a : b;
    }
    if ('number' === domain && (0, numcmp_1.towerRank)(b.v) < (0, numcmp_1.towerRank)(a.v)) {
        return b;
    }
    return a;
}
// Sort excluded scalars for canon (numeric: by point then tower rank;
// string: code-point order) and drop identity duplicates.
function dedupSorted(domain, neqs) {
    const sorted = [...neqs].sort((a, b) => {
        const c = cmpVal(domain, a, b);
        if (0 !== c)
            return c;
        return 'number' === domain ? (0, numcmp_1.towerRank)(a) - (0, numcmp_1.towerRank)(b) : 0;
    });
    const out = [];
    for (const n of sorted) {
        if (0 === out.length || !sameScalar(out[out.length - 1], n)) {
            out.push(n);
        }
    }
    return out;
}
// Is this value, or anything inside it, a nil? A written argument that
// holds one can never be satisfied, so the atom refuses it as an
// argument rather than reporting a mystery failure against every peer.
// Every caller passes a Val: `args[0]` comes from atomArgs, and the
// walk below descends only into container pegs, which hold Vals. The
// null/non-Val guard this function used to open with was therefore
// unreachable, and the coverage gate said so.
function holdsNil(v) {
    if (true === v.isNil) {
        return true;
    }
    const peg = v.peg;
    if (Array.isArray(peg)) {
        return peg.some((c) => holdsNil(c));
    }
    if (null != peg && 'object' === typeof peg) {
        for (const k in peg) {
            if (holdsNil(peg[k])) {
                return true;
            }
        }
    }
    return false;
}
// Whether a value, or anything inside it, is an effectful call — one
// whose evaluation changes a node OTHER than the one being computed.
// `move()` is the only builtin that does: it hides its resolution
// target in place. Band B refuses one as an argument, because settling
// it runs the effect against the live root before `must`'s trial clone
// is taken, and a check that mutates cannot be report-only.
function holdsMove(v) {
    if (true === v.isFunc && 'move' === v.funcname?.()) {
        return true;
    }
    const peg = v.peg;
    if (Array.isArray(peg)) {
        return peg.some((c) => holdsMove(c));
    }
    if (null != peg && 'object' === typeof peg) {
        for (const k in peg) {
            if (holdsMove(peg[k])) {
                return true;
            }
        }
    }
    return false;
}
// The written arguments of an atom, flattened.
//
// A multi-argument call arrives from the func-paren grammar as ONE
// entry holding the comma group, and `neq([3,1,2])` means the same as
// `neq(3,1,2)`. The group is always a ListVal by the time it reaches
// here -- the func-paren handler rawToVals every argument (issue #49) --
// so there is no raw-array case to unwrap. Flattening happens before
// the settled check, because an unsettled member hiding inside the
// group would otherwise make the atom look ready.
function atomArgs(atom, args) {
    if (('neq' === atom || 'must' === atom) && 1 === args.length &&
        true === args[0]?.isList) {
        return args[0].peg;
    }
    return args;
}
// The canonical rendering of a residual, in the fixed atom order:
// kind, lower bound, upper bound, neq, re, length, unique. Taken over the
// STATE rather than the Val because `length`'s argument is a residual too,
// and renders by exactly the same rules.
function canonState(s) {
    const parts = [];
    if (null != s.kind) {
        parts.push(s.kind.name.toLowerCase());
    }
    // An ORDER atom's argument implies the domain, so it is not spelled
    // out. A SIZING residual carries no order, and there `string` is the
    // only thing saying what is being sized -- drop it and the reparse
    // would admit lists and maps too.
    else if ('string' === s.domain &&
        null == s.lo && null == s.hi && 0 === s.neqs.length && 0 === s.res.length) {
        parts.push('string');
    }
    if (null != s.lo) {
        parts.push((s.lo.open ? 'above(' : 'min(') + s.lo.v.canon + ')');
    }
    if (null != s.hi) {
        parts.push((s.hi.open ? 'below(' : 'max(') + s.hi.v.canon + ')');
    }
    if (0 < s.neqs.length) {
        parts.push('neq(' + s.neqs.map((n) => n.canon).join(',') + ')');
    }
    for (const r of s.res) {
        parts.push('re(' + r.v.canon + ')');
    }
    if (null != s.count) {
        // Rendered UNABRIDGED, implied parts and all: `length(3)` canonicalises
        // to `length(integer&min(3)&max(3))` because that IS the residual the
        // count must satisfy, and canon is a normal form (G6 hashes it),
        // not a pretty-printer. Abbreviating would mean a second set of
        // rules for when the implied `integer & min(0)` may be dropped.
        parts.push('length(' + canonState(s.count) + ')');
    }
    if (s.uniq) {
        parts.push('unique()');
    }
    // After the bare atom, and sorted: canon is a normal form, so two
    // documents writing the same keys in different orders must render
    // the same string.
    for (const key of s.uniqBy) {
        parts.push('unique(' + JSON.stringify(key) + ')');
    }
    for (const m of s.musts) {
        parts.push('must(' + m.v.canon + ',' + m.msg.canon + ')');
    }
    if (0 === parts.length) {
        // Raw invalid atom: render the call so the error frame shows it.
        return 'constraint()';
    }
    return parts.join('&');
}
// SUBSUMPTION over two residuals (G3, the query built on the table in
// docs/reference-language.md "Subsumption"): does every value `s`
// admits pass `g` too? Implemented here because the compare machinery
// (cmpVal, sameScalar, the recursive count state) is this module's.
//
// Three-valued: true / false / 'undecided'. `must` on the GENERAL side
// is undecided by construction (a Band B predicate is opaque — G3 maps
// the table's "never" to the query's honest sub_evaluate_only); every
// other approximation folds toward false, the safe direction.
function constraintStateSubsumes(g, s) {
    // A Band B predicate on the general side makes its admitted set
    // unknowable; an extra `must` on the SPECIFIC side only narrows it
    // and is ignored.
    if (0 < g.musts.length) {
        return 'undecided';
    }
    // Domains must agree where both constrain one; a sizing-only residual
    // has no domain and passes this gate.
    if (null != g.domain && g.domain !== s.domain) {
        return false;
    }
    // A general leaf restriction requires the same leaf on the specific
    // side (leaves are disjoint; an unrestricted specific admits other
    // leaves the general refuses).
    if (null != g.kind && g.kind !== s.kind) {
        return false;
    }
    // Interval containment: the general's endpoints at or beyond the
    // specific's, and where they coincide the general's may not be the
    // open one.
    const d = g.domain ?? s.domain;
    if (null != g.lo) {
        if (null == s.lo || null == d) {
            return false;
        }
        const c = cmpVal(d, g.lo.v, s.lo.v);
        if (0 < c || (0 === c && g.lo.open && !s.lo.open)) {
            return false;
        }
    }
    if (null != g.hi) {
        if (null == s.hi || null == d) {
            return false;
        }
        const c = cmpVal(d, g.hi.v, s.hi.v);
        if (c < 0 || (0 === c && g.hi.open && !s.hi.open)) {
            return false;
        }
    }
    // Excluding FEWER values is more general: every general exclusion
    // must be excluded by the specific too.
    for (const n of g.neqs) {
        if (!s.neqs.some((m) => sameScalar(n, m))) {
            return false;
        }
    }
    // Patterns compare as TEXT sets (the sanctioned approximation:
    // deciding regex containment is what this algebra refuses to do).
    for (const r of g.res) {
        if (!s.res.some((q) => q.src === r.src)) {
            return false;
        }
    }
    // `unique()` subsumes only itself on that axis: a general uniqueness
    // demand admits no container the unconstrained specific also admits.
    // ... and a general `unique(k)` needs the same key on the specific
    // side: distinctness on `port` says nothing about distinctness on
    // `name`.
    if (g.uniqBy.some((k) => !s.uniqBy.includes(k))) {
        return false;
    }
    if (g.uniq && !s.uniq) {
        return false;
    }
    // The count atom reuses this same table over the integer domain.
    if (null != g.count) {
        if (null == s.count) {
            return false;
        }
        return constraintStateSubsumes(g.count, s.count);
    }
    return true;
}
// The query surface for ts/src/subsume.ts: residual-vs-residual, and
// residual-vs-scalar membership (with `must` and `unique` making the
// scalar case undecided/false exactly as the meet would).
function constraintSubsumesConstraint(g, s) {
    return constraintStateSubsumes(g, s);
}
function constraintAdmitsScalar(g, scalar) {
    if (0 < g.musts.length) {
        return 'undecided';
    }
    if (g.uniq || 0 < g.uniqBy.length) {
        return false;
    }
    // A count residual admits by LENGTH, which is the meet's business;
    // the query answers false (the safe direction) rather than
    // reimplementing the sizing walk here.
    if (null != g.count) {
        return false;
    }
    return stateAdmits(g, scalar);
}
// Does this residual's ORDER and MEMBERSHIP part admit the scalar? The
// sizing atoms are deliberately not consulted: `admit` applies them to
// the peer's length, and the count check applies this same function to
// the count.
function stateAdmits(s, peer) {
    const domainOf = numericLeaf(peer) ? 'number' :
        stringLeaf(peer) ? 'string' : undefined;
    if (null == s.domain) {
        // A sizing residual has no domain, and admits any scalar the sizing
        // atoms can then rule on. Booleans and null are not among them:
        // they have no order, no length and no members.
        if (null == domainOf) {
            return false;
        }
        return true;
    }
    if (domainOf !== s.domain) {
        return false;
    }
    if (null != s.kind && leafMarker(peer) !== s.kind) {
        return false;
    }
    const d = s.domain;
    if (null != s.lo) {
        const c = cmpVal(d, peer, s.lo.v);
        if (c < 0 || (0 === c && s.lo.open)) {
            return false;
        }
    }
    if (null != s.hi) {
        const c = cmpVal(d, peer, s.hi.v);
        if (c > 0 || (0 === c && s.hi.open)) {
            return false;
        }
    }
    for (const n of s.neqs) {
        if (sameScalar(peer, n)) {
            return false;
        }
    }
    // Every accumulated pattern must match: the meet of two `re` atoms
    // is conjunction, and matching is UNANCHORED in both engines
    // (JS RegExp.test, Go regexp.MatchString), so `re("el")` admits
    // "hello". Anchor with ^ and $ to mean the whole string.
    for (const r of s.res) {
        if (!r.re.test(peer.peg)) {
            return false;
        }
    }
    return true;
}
// The eager emptiness rules. Each is EXACT -- it reports empty only
// where no value could satisfy the residual -- so the algebra stays
// sound; the incompleteness it accepts is documented in
// docs/reference-language.md, "Emptiness".
function stateEmpty(s) {
    // Two disagreeing kind narrowings inside a length argument, recorded by
    // meetCount because that meet has no ctx to fail through.
    if (s.clash) {
        return true;
    }
    const d = s.domain;
    // Empty interval.
    if (null != s.lo && null != s.hi) {
        const c = cmpVal(d, s.hi.v, s.lo.v);
        if (c < 0 || (0 === c && (s.lo.open || s.hi.open))) {
            return true;
        }
    }
    const integral = ScalarKindVal_1.Integer === s.kind || ScalarKindVal_1.BigInteger === s.kind;
    // Integral gap: an integer-narrowed interval containing no whole
    // number is empty (integer & above(1) & below(2)).
    if (integral && null != s.lo && null != s.hi) {
        const lo = (0, numcmp_1.scaledOfNumeric)(s.lo.v);
        const hi = (0, numcmp_1.scaledOfNumeric)(s.hi.v);
        if (!lo.inf && !hi.inf) {
            // Smallest admissible integer above/at the lower bound.
            let n = (0, numcmp_1.scaledFloor)(lo);
            if (!(0, numcmp_1.scaledIsIntegral)(lo) || s.lo.open) {
                n += 1n;
            }
            // Largest admissible integer below/at the upper bound.
            let m = (0, numcmp_1.scaledFloor)(hi);
            if (s.hi.open && (0, numcmp_1.scaledIsIntegral)(hi)) {
                m -= 1n;
            }
            if (m < n) {
                return true;
            }
        }
    }
    // Point deletion under a narrowed leaf: a closed point interval
    // whose single value of the narrowed leaf is excluded is empty
    // (integer & min(3) & max(3) & neq(3)). Without a narrowing the
    // point survives in the other leaves.
    if (null != s.kind && null != s.lo && null != s.hi &&
        !s.lo.open && !s.hi.open &&
        0 === cmpVal(d, s.lo.v, s.hi.v)) {
        for (const n of s.neqs) {
            if (leafMarker(n) === s.kind && 0 === (0, numcmp_1.cmpNumeric)(n, s.lo.v)) {
                return true;
            }
        }
    }
    // Sizing over the number domain: a number has neither a length nor
    // members, so `integer & length(3)` and `min(2) & unique()` admit
    // nothing. Uniqueness over the string domain is empty for the same
    // reason -- a string's members are not values the algebra compares.
    if ('number' === d && (null != s.count || s.uniq ||
        0 < s.uniqBy.length)) {
        return true;
    }
    if ('string' === d && s.uniq) {
        return true;
    }
    // An empty count residual makes the whole thing empty: no container
    // and no string has a length no integer can take.
    if (null != s.count && stateEmpty(s.count)) {
        return true;
    }
    return false;
}
// The base every `length` argument meets: a count is a non-negative
// integer, whatever else the argument says (docs/reference-language.md,
// "`length` semantics" -- `length(c)` is empty iff `c & integer & min(0)`
// is).
function countBase() {
    return {
        domain: 'number',
        kind: ScalarKindVal_1.Integer,
        lo: { v: countVal(0), open: false },
        neqs: [],
        res: [],
        musts: [],
        // A COUNT is a number, and a number has no members to be distinct.
        uniq: false,
        uniqBy: [],
    };
}
// A count as a Val, so the count residual can be applied by exactly the
// same membership function as any other numeric residual.
function countVal(n) {
    return new IntegerVal_1.IntegerVal({ peg: n });
}
// The pure meet of two count residuals. Both are number-domain and
// carry no pattern or sizing atom of their own, so the merge is the
// interval/exclusion part alone. A kind disagreement becomes a `clash`
// rather than an error: this meet runs at construction, where there is
// no AontuContext to raise through, and an empty residual carries the
// same news to `unify`.
function meetCount(a, b) {
    return {
        domain: 'number',
        // `a` is always a countBase()-seeded residual, so its kind is
        // always Integer — there is no kindless side to fall back from.
        kind: a.kind,
        lo: tighter('number', a.lo, b.lo, true),
        hi: tighter('number', a.hi, b.hi, false),
        neqs: dedupSorted('number', [...a.neqs, ...b.neqs]),
        res: [],
        musts: [],
        uniq: false,
        uniqBy: [],
        clash: true === a.clash || true === b.clash ||
            (null != a.kind && null != b.kind && a.kind !== b.kind),
    };
}
// Read a WRITTEN `length` argument as a count residual, or undefined when
// it is not one. Accepted: an integer literal (an exact count), a
// numeric kind, a Band A residual over the number domain, and any
// conjunct of those. A conjunct never reaches here any more: an
// unsettled argument is held as `pending` and folded before the count
// reads it (G1 phase 4), so `length(min(2)&max(5))` arrives as the
// single residual it folds to.
//
// Anything else is refused rather than deferred. A reference or an
// expression would have to residuate, and the sizing atoms do not
// residuate on their ARGUMENT -- only on the peer whose members are
// still settling.
function countArgState(arg) {
    if (numericLeaf(arg)) {
        return {
            domain: 'number',
            lo: { v: arg, open: false },
            hi: { v: arg, open: false },
            neqs: [], res: [], musts: [], uniq: false, uniqBy: [],
        };
    }
    if (true === arg?.isConstraint) {
        const c = arg;
        // A pattern, a sizing atom or a string bound inside a count is not
        // a count constraint at all, and neither is a broken one.
        if (null != c.invalid || 0 < c.res.length || c.uniq ||
            0 < c.uniqBy.length || null != c.count ||
            'number' !== c.domain) {
            return undefined;
        }
        return {
            domain: 'number',
            kind: c.kind,
            lo: c.lo,
            hi: c.hi,
            neqs: [...c.neqs],
            res: [], musts: [], uniq: false, uniqBy: [],
        };
    }
    if (true === arg?.isScalarKind) {
        const marker = arg.peg;
        if (Number === marker) {
            return {
                domain: 'number', neqs: [], res: [], musts: [],
                uniq: false, uniqBy: [],
            };
        }
        if (ScalarKindVal_1.Integer === marker || ScalarKindVal_1.Float === marker ||
            ScalarKindVal_1.BigInteger === marker || ScalarKindVal_1.BigDecimal === marker) {
            return {
                domain: 'number', kind: marker, neqs: [], res: [], musts: [],
                uniq: false, uniqBy: [],
            };
        }
        return undefined;
    }
    return undefined;
}
// A container is SETTLED when it and every child have converged. Until
// then the member set can still change — an optional key whose value is
// a still-resolving reference may yet generate — so a sizing atom must
// defer rather than decide (docs/reference-language.md, "`length`
// semantics"). Note that an optional holding a settled-but-ungenerable
// value, `{x:1,y?:number}`, IS settled: the map converges on the first
// pass and `y` is simply never emitted.
function containerSettled(bag) {
    // The bag's OWN done-counter is enough: BagVal.unify sets it from the
    // AND over its children, so an unsettled child already leaves the bag
    // unsettled. Walking the children again would be a second, drifting
    // copy of that rule.
    return true === bag.done;
}
// The child kinds `BagVal.gen` will attempt to generate. Anything else
// is residue: dropped when the key is optional, and a bag-level error
// otherwise.
function genable(child) {
    return true === child.isScalar || true === child.isMap ||
        true === child.isList || true === child.isPref ||
        true === child.isRef || true === child.isDisjunct ||
        true === child.isNil ||
        // A settled sizing residue generates through ConjunctVal.gen, so it
        // is a member like any other -- and a `length` that did not count
        // its sibling's `unique` would be the early-fold defect again, one
        // level up.
        undefined !== (0, BagVal_1.sizingResidue)(child);
}
// The children a bag would EMIT, mirroring the selection in
// `BagVal.gen` — type/hide marks skipped, non-generable residue and
// values that generate nothing dropped, optional keys dropped when
// they generate empty.
//
// It returns the member VALS rather than their generated values,
// because uniqueness compares canon and a generated value cannot
// express that distinction: `1` and `1.0` generate the same JSON number
// and canon differently. Counting uses the same list, so both sizing
// atoms see exactly one definition of "member".
//
// Returns undefined when a REQUIRED child is residue: the container's
// own `gen` raises there, and that error is the one worth reporting.
function emittedMembers(bag, ctx) {
    const out = [];
    let entries = (0, utility_1.items)(bag.peg);
    if (bag.isMap) {
        // Code-point order, because the two ports disagree on raw key order
        // — JavaScript hoists integer-like keys, Go keeps insertion order —
        // and a duplicate report must name the same pair in both.
        entries = entries
            .slice()
            .sort((a, b) => (0, keyorder_1.cmpCodePoint)(String(a[0]), String(b[0])));
    }
    for (const item of entries) {
        const key = item[0];
        const child = item[1];
        if (child.mark.type || child.mark.hide) {
            continue;
        }
        const optional = bag.optionalKeys.includes('' + key);
        if (!genable(child)) {
            if (optional) {
                continue;
            }
            return undefined;
        }
        // Generation decides in an isolated collect context, so an
        // unresolved inner value neither raises here nor pollutes the
        // caller's errors — the same isolation BagVal.gen uses for an
        // optional child.
        const cval = child.gen(ctx.clone({ err: [], collect: true }));
        if (undefined === cval || (optional && (0, Val_1.empty)(cval))) {
            continue;
        }
        out.push(child);
    }
    return out;
}
// Sort accumulated patterns by source in code-point order and drop
// exact duplicates. Patterns are NEVER simplified or compared for
// containment: deciding `re("a")` subsumes `re("a|b")` is regex
// containment, which the algebra deliberately does not do (emptiness
// stays approximate — sound, incomplete). Two spellings of one language
// therefore both survive, and both are tested.
function dedupSortedRes(res) {
    const sorted = [...res].sort((a, b) => (0, numcmp_1.cmpCodePoints)(a.src, b.src));
    const out = [];
    for (const r of sorted) {
        if (0 === out.length || out[out.length - 1].src !== r.src) {
            out.push(r);
        }
    }
    return out;
}
// The atom classes registered in the parser's funcMap: each is a
// ConstraintVal that knows its atom name. Constructed by the
// func-paren handler as `new funcval({peg: args})`.
class MinConstraintVal extends ConstraintVal {
    constructor(spec, ctx) {
        super({ ...spec, atom: 'min' }, ctx);
    }
}
exports.MinConstraintVal = MinConstraintVal;
class MaxConstraintVal extends ConstraintVal {
    constructor(spec, ctx) {
        super({ ...spec, atom: 'max' }, ctx);
    }
}
exports.MaxConstraintVal = MaxConstraintVal;
class AboveConstraintVal extends ConstraintVal {
    constructor(spec, ctx) {
        super({ ...spec, atom: 'above' }, ctx);
    }
}
exports.AboveConstraintVal = AboveConstraintVal;
class BelowConstraintVal extends ConstraintVal {
    constructor(spec, ctx) {
        super({ ...spec, atom: 'below' }, ctx);
    }
}
exports.BelowConstraintVal = BelowConstraintVal;
class NeqConstraintVal extends ConstraintVal {
    constructor(spec, ctx) {
        super({ ...spec, atom: 'neq' }, ctx);
    }
}
exports.NeqConstraintVal = NeqConstraintVal;
class ReConstraintVal extends ConstraintVal {
    constructor(spec, ctx) {
        super({ ...spec, atom: 're' }, ctx);
    }
}
exports.ReConstraintVal = ReConstraintVal;
class MustConstraintVal extends ConstraintVal {
    constructor(spec, ctx) {
        super({ ...spec, atom: 'must' }, ctx);
    }
}
exports.MustConstraintVal = MustConstraintVal;
class LengthConstraintVal extends ConstraintVal {
    constructor(spec, ctx) {
        super({ ...spec, atom: 'length' }, ctx);
    }
}
exports.LengthConstraintVal = LengthConstraintVal;
class UniqueConstraintVal extends ConstraintVal {
    constructor(spec, ctx) {
        super({ ...spec, atom: 'unique' }, ctx);
    }
} /* node:coverage ignore next 23 */
exports.UniqueConstraintVal = UniqueConstraintVal;
//# sourceMappingURL=ConstraintVal.js.map
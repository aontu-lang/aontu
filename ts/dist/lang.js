"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Site = exports.Lang = void 0;
// import { performance } from 'node:perf_hooks'
// Named imports, not `import * as`: the namespace form makes tsc emit
// the __importStar downlevel helper, whose branches no supported Node
// takes (the same rule cli.ts records). Aliased because `Path` is
// already the @tabnas/path plugin below.
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const jsonic_1 = require("@tabnas/jsonic");
// THE CONFIG-FORMAT READERS (ADR-012). Each is a jsonic plugin for one
// format, so an included `.toml` or `.yaml` is parsed by a real parser
// for that format rather than guessed at by this one. `@tabnas/json` is
// the strict RFC 8259 reader, used for `.json` and `.jsonld`.
const sig_1 = require("./sig");
const json_1 = require("@tabnas/json");
const toml_1 = require("@tabnas/toml");
const jsonc_1 = require("@tabnas/jsonc");
const json5_1 = require("@tabnas/json5");
const yaml_1 = require("@tabnas/yaml");
const ini_1 = require("@tabnas/ini");
const debug_1 = require("@tabnas/debug");
const multisource_1 = require("@tabnas/multisource");
// TODO: @tabnas/multisource should support virtual fs
const file_1 = require("@tabnas/multisource/resolver/file");
const pkg_1 = require("@tabnas/multisource/resolver/pkg");
const mem_1 = require("@tabnas/multisource/resolver/mem");
// The Aontu-source processor, TAKEN RATHER THAN ALIASED. The obvious
// spelling is the alias `aon: 'jsonic'`, which multisource resolves
// through its own processor map -- but `jsonic` is a FORMAT NAME in
// the include table now, so that alias resolved to the plain-jsonic
// DATA reader and every `.aon` include was suddenly parsed without the
// language in it. Naming the function leaves nothing to collide with.
const jsonic_2 = require("@tabnas/multisource/processor/jsonic");
const std_1 = require("./std");
const mod_1 = require("./mod");
const expr_1 = require("@tabnas/expr");
const path_1 = require("@tabnas/path");
const type_1 = require("./type");
const site_1 = require("./site");
Object.defineProperty(exports, "Site", { enumerable: true, get: function () { return site_1.Site; } });
const top_1 = require("./val/top");
const ScalarKindVal_1 = require("./val/ScalarKindVal");
const BigDecimalVal_1 = require("./val/BigDecimalVal");
const BigIntegerVal_1 = require("./val/BigIntegerVal");
const Decimal_1 = require("./val/Decimal");
const BooleanVal_1 = require("./val/BooleanVal");
const ConjunctVal_1 = require("./val/ConjunctVal");
const DisjunctVal_1 = require("./val/DisjunctVal");
const IntegerVal_1 = require("./val/IntegerVal");
const ListVal_1 = require("./val/ListVal");
const MapVal_1 = require("./val/MapVal");
const NilVal_1 = require("./val/NilVal");
const NullVal_1 = require("./val/NullVal");
const NumberVal_1 = require("./val/NumberVal");
const numkind_1 = require("./val/numkind");
const PrefVal_1 = require("./val/PrefVal");
const RefVal_1 = require("./val/RefVal");
const StringVal_1 = require("./val/StringVal");
const VarVal_1 = require("./val/VarVal");
const PlusOpVal_1 = require("./val/PlusOpVal");
const UpperFuncVal_1 = require("./val/UpperFuncVal");
const LowerFuncVal_1 = require("./val/LowerFuncVal");
const CopyFuncVal_1 = require("./val/CopyFuncVal");
const KeyFuncVal_1 = require("./val/KeyFuncVal");
const TypeFuncVal_1 = require("./val/TypeFuncVal");
const HideFuncVal_1 = require("./val/HideFuncVal");
const DeprecateFuncVal_1 = require("./val/DeprecateFuncVal");
const ReferFuncVal_1 = require("./val/ReferFuncVal");
const GraphAtomVal_1 = require("./val/GraphAtomVal");
const PackFuncVal_1 = require("./val/PackFuncVal");
const EachFuncVal_1 = require("./val/EachFuncVal");
const FilterFuncVal_1 = require("./val/FilterFuncVal");
const MatchFuncVal_1 = require("./val/MatchFuncVal");
const ArithFuncVal_1 = require("./val/ArithFuncVal");
const AggFuncVal_1 = require("./val/AggFuncVal");
const PlaceVal_1 = require("./val/PlaceVal");
const MoveFuncVal_1 = require("./val/MoveFuncVal");
const PathFuncVal_1 = require("./val/PathFuncVal");
const ContainerKindVal_1 = require("./val/ContainerKindVal");
const PrefFuncVal_1 = require("./val/PrefFuncVal");
const CloseFuncVal_1 = require("./val/CloseFuncVal");
const OpenFuncVal_1 = require("./val/OpenFuncVal");
const SuperFuncVal_1 = require("./val/SuperFuncVal");
const ConstraintVal_1 = require("./val/ConstraintVal");
const asPlugin = (p) => p;
// Build the Val for a matched `0d` literal (see the `0d` value matcher
// below). Leaf by source: digits only is a biginteger, a `.` or an
// exponent makes it a bigdecimal.
//
// A literal over the D6 exactness budget becomes a LOCATED ERROR here
// and not a rounded or expanded value: `0d1e1000000000` has a one-digit
// coefficient, so only the scale bound catches it, and it is caught at
// parse -- before plain-form rendering would try to materialise a
// gigabyte of zeros.
// The source text of a negated exact literal. `-` is a prefix OPERATOR,
// not part of the literal, so the text has to be rebuilt here to keep
// `src` meaning "how this value is spelled" (see bigVal).
function negsrc(src) {
    // src is never empty here: it is a BIG_LITERAL_RE match (at minimum
    // the two chars `0d`) or an already-negated spelling. Computed exact
    // values do carry src '', but they are built at unify time, long
    // after this parse-time opmap.
    return src.startsWith('-') ? src.slice(1) : '-' + src;
}
function bigVal(res) {
    const lit = (0, Decimal_1.readBigLiteral)(res);
    // `src` is the literal's own text, and it is not decoration: a path
    // segment is spelled text, so `$.a.0d1` must address the key `0d1` --
    // the same key `a:{0d1:7}` creates -- rather than the number 1. See
    // RefVal.append. Without it the segment was empty and the reference
    // silently resolved to its own container.
    const src = res[0];
    return 'biginteger' === lit.leaf ? new BigIntegerVal_1.BigIntegerVal({ peg: lit.int, src }) :
        'bigdecimal' === lit.leaf ? new BigDecimalVal_1.BigDecimalVal({ peg: lit.dec, src }) :
            new NilVal_1.NilVal({ why: lit.code });
}
// Char codes of the literal's fixed opening, for the guard below.
const CC_0 = 48;
const CC_d = 100;
const CC_D = 68;
// THE ALIAS SIGIL. `%` is part of an alias's name, so the name is one
// lexeme wherever it appears and its meaning is decided by position:
// a BINDING in key position (`%uint8: …` declares), a USE in value
// position (`listen: %uint8` refers). docs/design/ALIASES.0.md §4.
const CC_PCT = 37;
const ALIAS_RE = /^%[A-Za-z_][A-Za-z0-9_]*/;
let AontuJsonic = function AontuLang(jsonic) {
    jsonic.use(asPlugin(path_1.Path));
    // Only # line comments are valid Aontu syntax (see
    // docs/reference-language.md; go/lang.go sets the same). Clear the
    // underlying jsonic comment markers entirely, then define # directly,
    // so the comment set is hash-only regardless of those defaults.
    let dotRef = (r, ctx, terms, prefix) => {
        terms = dropUnfilled(terms);
        if (0 === terms.length)
            return incompleteNil(r, ctx);
        // AN ALIAS IS NOT A PATH SEGMENT. `$.%foo` is refused: the alias
        // namespace and the path namespace are disjoint, and an alias is
        // reached by writing `%foo` and only that.
        //
        // The engine spells an alias reference AS a root reference to the
        // declaration -- which is what gives it order independence and a
        // cycle check shared with paths -- but that is an implementation of
        // the name, not a second way to write it. Left writable, the two
        // spellings would drift apart the moment aliases stop being
        // file-shaped, and `$.%b` inside an included file would reach the
        // INCLUDER's `%b` rather than its own, which is exactly the
        // cross-file capture the sigil exists to prevent.
        // `%foo` lexes to the reference itself, so in `$.%foo` it arrives
        // as a TERM rather than as a string segment -- both shapes are
        // checked, since a quoted `$."%foo"` would arrive as the string.
        // Terms here are always Vals -- dropUnfilled has removed the
        // nulls, and the dot rules never hand over a raw string -- so the
        // shapes are exactly three: a RefVal (peg is the segment array), a
        // StringVal (peg is the segment), and anything else (a numeric or
        // exact segment, which cannot be an alias name).
        for (const t of terms) {
            const segs = Array.isArray(t.peg) ? t.peg :
                ('string' === typeof t.peg ? [t.peg] : []);
            for (const seg of segs) {
                if ('string' === typeof seg && ALIAS_RE.test(seg)) {
                    return addsite(new NilVal_1.NilVal({ why: 'alias_in_path' }), r, ctx);
                }
            }
        }
        return addsite(new RefVal_1.RefVal({ peg: terms, prefix }), r, ctx);
    };
    jsonic.options({ comment: { def: null } });
    jsonic.options({
        comment: {
            lex: true,
            def: {
                hash: { line: true, start: '#', lex: true },
            },
        },
    });
    // Digit separators are legal only as a SINGLE separator BETWEEN
    // digits (the rule test/spec/engine-parity.tsv records as the engine's
    // adjudication; pinned by the sep-* rows in
    // test/spec/number-model.tsv). The engine's number matcher
    // enforces most of that already — `1_`, `_1`, `1_.5`, `1._5`, `1e_2`,
    // `1e2_` all fall through to text — but two gaps remain: a REPEATED
    // separator (`1__0` lexed as 10) and a separator at the edge of a
    // base-prefixed digit run (`0x_ff`, `0xff_` lexed as 255). Both
    // silently accept a typo as a different number, so aontu declines the
    // whole run instead and it lexes as text ("1__0"), exactly as `1_`
    // already does.
    //
    // `number.exclude` is tested against the matched number source and,
    // when it matches, makes the matcher decline the entire span. Kept in
    // lock-step with sepInvalid in go/lang.go, which is wired to the
    // equivalent `Number.Exclude` hook (and to the Check hook, which
    // constructs big base-prefixed tokens itself and so bypasses Exclude).
    jsonic.options({
        number: {
            // `__` repeated separator; `0x_`/`0o_`/`0b_` separator opening a
            // base-prefixed run; `_` closing any run. The prefix letter is
            // matched case-insensitively so the rule does not depend on which
            // prefix spellings the engine accepts.
            exclude: /__|^[-+]?0[xXoObB]_|_$/,
        },
    });
    // D3 -- the `0d` literal, the only route to the exact leaves
    // (biginteger and bigdecimal). See BIG_LITERAL_RE for the grammar and
    // the leaf-by-source rule.
    //
    // The literal is claimed by the TEXT MATCHER'S CHECK HOOK (the sibling
    // of the `Number.Check` hook the Go port already uses for big
    // base-prefixed literals), not by a `value.def` entry, because a `0d`
    // run may contain a `.` and the two claim source differently:
    //
    //   - A value def -- even a consuming one, matched against the full
    //     forward source -- is applied INSIDE the text matcher, AFTER its
    //     ender regexp has already carved the run at the `.`. The def
    //     claims `0d1.5` whole, but the matcher then still emits the
    //     ender's `.` as a fixed token, so `x:0d1.5` lexed as the
    //     bigdecimal FOLLOWED BY a dangling member-access dot (a path
    //     cycle). Verified, not theorised.
    //   - The check hook runs BEFORE that ender regexp and returns the
    //     token outright, so the run is claimed whole and nothing else is
    //     emitted.
    //
    // A `match.value` matcher (which runs ahead of every other matcher)
    // also claims it correctly, but it is a candidate at EVERY lex
    // position and materializes the forward source there: ~8% on a
    // text-heavy document, for a syntax almost none of them use. The check
    // hook only runs where the text matcher already runs, and measures at
    // parity with not having it.
    //
    // The number matcher never sees these runs at all: it declines `0d…`
    // outright, since `d` is not an ender.
    jsonic.options({
        text: {
            check: (lex) => {
                // Guard first, on char codes: this hook runs at every text
                // position, and the common case (any run that cannot be a `0d`
                // literal or an alias) must cost two char reads and no
                // allocation.
                const pnt = lex.pnt;
                const src = lex.src;
                // AN ALIAS NAME IS CLAIMED WHOLE, for the same reason the `0d`
                // run below is: the text matcher's ender regexp would otherwise
                // carve `%uint8` at the `%` and emit the sigil as its own token,
                // leaving a bare `uint8` behind -- which is exactly the capture
                // the sigil exists to prevent. Claiming it here, before that
                // ender runs, keeps the name one lexeme.
                //
                // The token's SOURCE is the whole `%name`, which is what makes
                // the same lexeme work in both positions: jsonic keys a pair by
                // the token's source text (`0d1: 5` yields the key `0d1`), so a
                // declaration reads as the key `%uint8`, while a value position
                // calls the function below and gets the reference.
                if (CC_PCT === src.charCodeAt(pnt.sI)) {
                    const ares = ALIAS_RE.exec(lex.refwd());
                    if (null == ares) {
                        return undefined;
                    }
                    const asrc = ares[0];
                    const atkn = lex.token('#VL', 
                    // AN ALIAS REFERENCE IS A PATH REFERENCE. `%uint8` is
                    // `$.%uint8`: root-absolute, one segment, spelled with the
                    // sigil the declaration is spelled with. Everything the
                    // design asks of it -- order independence, alias-of-alias,
                    // redeclaration unifying, cycle refusal spanning both
                    // namespaces -- is then the reference machinery already in
                    // the language, not a second resolver beside it.
                    (r, ctx) => addsite(new RefVal_1.RefVal({ peg: [asrc], absolute: true }), r, ctx), asrc, pnt);
                    pnt.sI += asrc.length;
                    pnt.cI += asrc.length;
                    return { done: true, token: atkn };
                }
                if (CC_0 !== src.charCodeAt(pnt.sI)) {
                    return undefined;
                }
                const c1 = src.charCodeAt(pnt.sI + 1);
                if (CC_d !== c1 && CC_D !== c1) {
                    return undefined;
                }
                // BIG_LITERAL_RE is `^`-anchored and read against the forward
                // source (memoized per position by refwd), which is what lets
                // it claim the `.` of `0d1.5`.
                const res = Decimal_1.BIG_LITERAL_RE.exec(lex.refwd());
                if (null == res) {
                    return undefined;
                }
                const msrc = res[0];
                // The token value is a FUNCTION so Val construction happens at
                // parse time, where the rule and context needed for the site
                // exist (jsonic calls a #VL token's function value with them).
                // A `0d` literal never spans a line, so only the source and
                // column positions advance.
                const tkn = lex.token('#VL', (r, ctx) => addsite(bigVal(res), r, ctx), msrc, pnt);
                pnt.sI += msrc.length;
                pnt.cI += msrc.length;
                return { done: true, token: tkn };
            },
        },
    });
    // TODO: refactor Val constructor
    // let addsite = (v: Val, p: string[]) => (v.path = [...(p || [])], v)
    let addsite = (v, r, ctx) => {
        v.site.row = null == r.o0 ? -1 : r.o0.rI;
        v.site.col = null == r.o0 ? -1 : r.o0.cI;
        v.site.url = ctx.meta.multisource ? ctx.meta.multisource.path : '';
        // The source text, from the SAME token the row and column above
        // come from. jsonic has carried it all along; not reading it is
        // what left a site uneditable (ts/src/site.ts).
        //
        // A TOKEN WITH NO TEXT IS NO SPAN, in both ports, and the extent is
        // DERIVED from the text rather than read from the token's own `len`
        // — so the Go twin, whose token has no len field, computes the
        // identical number with utf16Len and nothing has to be kept in step.
        v.site.src = null == r.o0 ? '' : r.o0.src;
        v.site.len = '' === v.site.src ? -1 : v.site.src.length;
        // A keyed rule always carries a path array; a keyless one has none.
        v.path = r.k ? [...r.k.path] : [];
        return v;
    };
    jsonic.options({
        hint: {
            unknown: `
Since the error is unknown, this is probably a bug. Please consider
posting a github issue - thanks!

Code: {code}, Details: 
{details}`,
            unexpected: `
The character(s) {src} were not expected at this point as they do not
match the expected syntax. Use the # character to comment out lines to
help isolate the syntax error.`,
        },
        errmsg: {
            name: 'aontu',
            suffix: false,
        },
        fixed: {
            token: {
                '#QM': '?'
            },
        },
        value: {
            def: {
                // NOTE: specify with functions as jsonic/deep will
                // remove class prototype as options are assumed plain
                // (except for functions).
                // TODO: jsonic should be able to pass context into these
                'string': {
                    val: (r, ctx) => addsite(new ScalarKindVal_1.ScalarKindVal({ peg: String }), r, ctx)
                },
                // `number` is a pure supertype: it matches a concrete value of
                // any numeric leaf and never tags one itself. `integer` and
                // `float` are the leaves (see ScalarKindVal for the lattice).
                'number': {
                    val: (r, ctx) => addsite(new ScalarKindVal_1.ScalarKindVal({ peg: Number }), r, ctx)
                },
                'integer': {
                    val: (r, ctx) => addsite(new ScalarKindVal_1.ScalarKindVal({ peg: ScalarKindVal_1.Integer }), r, ctx)
                },
                'float': {
                    val: (r, ctx) => addsite(new ScalarKindVal_1.ScalarKindVal({ peg: ScalarKindVal_1.Float }), r, ctx)
                },
                // The two exact leaves. Their keywords are the marker class
                // names lowercased, which is also how ScalarKindVal canons them.
                'biginteger': {
                    val: (r, ctx) => addsite(new ScalarKindVal_1.ScalarKindVal({ peg: ScalarKindVal_1.BigInteger }), r, ctx)
                },
                'bigdecimal': {
                    val: (r, ctx) => addsite(new ScalarKindVal_1.ScalarKindVal({ peg: ScalarKindVal_1.BigDecimal }), r, ctx)
                },
                'boolean': {
                    val: (r, ctx) => addsite(new ScalarKindVal_1.ScalarKindVal({ peg: Boolean }), r, ctx)
                },
                'nil': {
                    val: (r, ctx) => addsite(new NilVal_1.NilVal({ why: 'literal_nil' }), r, ctx)
                },
                // TODO: FIX: need a TOP instance to hold path
                'top': { val: () => (0, top_1.top)() },
                // G8 phase 3: the placeholder. A BARE `_` is the hole; `"_"`
                // quoted, and any longer bare word containing it, stay text.
                // Reserving it is a breaking change, pinned by place.tsv.
                '_': {
                    val: (r, ctx) => addsite(new PlaceVal_1.PlaceVal({}), r, ctx)
                },
            }
        },
        map: {
            merge: (prev, curr, _r, ctx) => {
                let pval = prev;
                let cval = curr;
                if (pval?.isVal && cval?.isVal) {
                    // TODO: test multi element conjuncts work
                    if (pval.isConjunct && cval.isConjunct) {
                        pval.append(cval);
                        return pval;
                    }
                    else if (pval.isConjunct) {
                        pval.append(cval);
                        return pval;
                    }
                    else {
                        return addsite(new ConjunctVal_1.ConjunctVal({ peg: [pval, cval] }), prev, ctx);
                    }
                }
                // Handle defered conjuncts, where MapVal does not yet
                // exist, by creating ConjunctVal later.
                else {
                    prev.___merge = (prev.___merge || []);
                    prev.___merge.push(curr);
                    return prev;
                }
            }
        }
    });
    const funcMap = {
        upper: UpperFuncVal_1.UpperFuncVal,
        lower: LowerFuncVal_1.LowerFuncVal,
        copy: CopyFuncVal_1.CopyFuncVal,
        key: KeyFuncVal_1.KeyFuncVal,
        type: TypeFuncVal_1.TypeFuncVal,
        hide: HideFuncVal_1.HideFuncVal,
        move: MoveFuncVal_1.MoveFuncVal,
        path: PathFuncVal_1.PathFuncVal,
        pref: PrefFuncVal_1.PrefFuncVal,
        // First-class paths and the container kinds
        // (docs/design/PATHS.0.md). `path(p)` CAPTURES a path as a value;
        // `path()`, `map()` and `list()` are kinds -- the vacuous
        // constructor call admits its values and defaults to nothing,
        // where the container LITERALS `{}`/`[]` default to empty.
        map: ContainerKindVal_1.MapFuncVal,
        list: ContainerKindVal_1.ListFuncVal,
        close: CloseFuncVal_1.CloseFuncVal,
        open: OpenFuncVal_1.OpenFuncVal,
        super: SuperFuncVal_1.SuperFuncVal,
        // The constraint algebra's Band A atoms (G1 phase 1;
        // docs/reference-language.md, "The constraint algebra"): bounds
        // and exclusion enter through the function registry — the
        // established extension point — with zero grammar change.
        min: ConstraintVal_1.MinConstraintVal,
        max: ConstraintVal_1.MaxConstraintVal,
        above: ConstraintVal_1.AboveConstraintVal,
        below: ConstraintVal_1.BelowConstraintVal,
        neq: ConstraintVal_1.NeqConstraintVal,
        // G1 phase 2: pattern membership, over the portable subset both
        // host regex engines agree on (nonPortableRe in ConstraintVal.ts).
        re: ConstraintVal_1.ReConstraintVal,
        // G1 phase 3: the sizing atoms. Both are properties of a CONTAINER
        // (or, for length, of a string) rather than comparisons against a
        // value, which is why `unique` is the one built-in taking no
        // argument at all.
        length: ConstraintVal_1.LengthConstraintVal,
        unique: ConstraintVal_1.UniqueConstraintVal,
        // G1 phase 5: Band B. `must` is the one atom the algebra does not
        // reason about -- it is checked against the finished value and
        // reported with the author's own message, never simplified and
        // never consulted for emptiness or subsumption.
        must: ConstraintVal_1.MustConstraintVal,
        // G3 phase 4: the deprecation mark. Unification-transparent; the
        // record rides the result (Val.deprecation) and canon renders the
        // call back (canonRiders).
        deprecate: DeprecateFuncVal_1.DeprecateFuncVal,
        // G4 phase 2: the checked, typed, LINK-shaped reference. A
        // constraint on a string field: the string must be a TREE ADDRESS
        // (`$.a.b` or `.b`), the address must resolve, and the optional
        // argument flows INTO the target. The field keeps the string.
        refer: ReferFuncVal_1.ReferFuncVal,
        rel: ReferFuncVal_1.RelFuncVal,
        // RELATIONS P2 (docs/design/RELATIONS.0.md §3.3): the graph
        // atoms, conjoined at the field whose key is the predicate they
        // govern. Lattice-inert; the verdict lands at generation.
        acyclic: GraphAtomVal_1.AcyclicFuncVal,
        inverse: GraphAtomVal_1.InverseFuncVal,
        // G8 phase 1: the generation combinators. `pack` makes one keyed
        // child per child of its data, `each` one list element; both clone
        // their template per destination exactly as a spread does, and both
        // wait for the model to settle before they fire (the staging rule,
        // G8 phase 0).
        pack: PackFuncVal_1.PackFuncVal,
        each: EachFuncVal_1.EachFuncVal,
        // G8 phase 2: selection. `filter` keeps the children of a bag that
        // unify with a condition; `match` picks the first arm whose
        // pattern the scrutinee unifies with. Both select by
        // UNIFIABILITY, tried in trial mode, so neither adds a predicate
        // language to the one the lattice already is.
        filter: FilterFuncVal_1.FilterFuncVal,
        match: MatchFuncVal_1.MatchFuncVal,
        // The arithmetic family (the review's finding I). Maths beyond `+`
        // arrives as FUNCTIONS — `-` `*` `/` `%` stay reserved — and the
        // family is numeric where the operator is polymorphic, which is
        // what makes `add` more than a second spelling of `+`: it refuses
        // the string concatenation that silently answers `"500m" + "500m"`.
        // Every rule they obey is in ts/src/val/arith.ts.
        add: ArithFuncVal_1.AddFuncVal,
        sub: ArithFuncVal_1.SubFuncVal,
        mul: ArithFuncVal_1.MulFuncVal,
        div: ArithFuncVal_1.DivFuncVal,
        mod: ArithFuncVal_1.ModFuncVal,
        rem: ArithFuncVal_1.RemFuncVal,
        // Aggregation over a finite, settled bag (the review's finding I).
        // `least` and `greatest` rather than min and max, which are already
        // the atoms for a lower and an upper BOUND -- an aggregate over a
        // set and a bound on a value must not share a spelling.
        sum: AggFuncVal_1.SumFuncVal,
        least: AggFuncVal_1.LeastFuncVal,
        greatest: AggFuncVal_1.GreatestFuncVal,
        // Projection, which is what lets the aggregates reach a bag of
        // RECORDS: `sum(pick($.lines, amountCents))`. Not a clever `each`
        // template -- `each` MEETS each child, and a meet cannot select.
        pick: AggFuncVal_1.PickFuncVal,
        // G9 phase 2: the fold to a STRING. `sum` folds with `add`; this
        // folds with `+`, so it inherits the one number-to-text rule and
        // the language does not grow a second. It is the primitive that
        // turns a bag of computed lines into a file.
        join: AggFuncVal_1.JoinFuncVal,
    };
    // A dangling operator (`a:1|`, `a:$`, `a:*` at end of input) leaves
    // null/undefined unfilled terms. Junction ops drop them (so `a:1&`
    // and `a:1|` are just 1); ops missing a required operand become an
    // incomplete_expression nil, surfaced by generate() as a "Cannot
    // resolve value" error (the Go port mirrors this in lang.go).
    const dropUnfilled = (terms) => terms.filter((t) => null != t);
    const incompleteNil = (r, ctx) => addsite(new NilVal_1.NilVal({ why: 'incomplete_expression' }), r, ctx);
    // Build a call from a NAME and the argument terms as the author
    // wrote them. Shared by the `func(...)` handler and by the pipe,
    // which is the same call with one more argument on the front — so
    // the arity check, the comma-group rule and the raw-value conversion
    // are stated once and both spellings get all three.
    const buildCall = (r, ctx, fname, argterms) => {
        const funcval = funcMap[fname];
        // Arity is known for every built-in, so a surplus or missing
        // argument is a mistake in the SOURCE, refused here where the
        // author can see it (issue #51). It was previously left to each
        // function to notice or not: the two ports disagreed on `upper()`
        // and on `close()`, and `min(1,2)` noticed nothing at all -- it
        // built a constraint that merely refused to generate later, with a
        // message about the map rather than about the call.
        //
        // Counted BEFORE the rawToVal pass below, which is what makes the
        // count possible: a comma group arrives as a RAW array and a
        // written list literal as a ListVal, and rawToVal turns the first
        // into the second.
        const arity = funcArity[fname];
        if (null != arity) {
            const got = writtenArgCount(argterms);
            if (got < arity[0] || (-1 !== arity[1] && got > arity[1])) {
                // details is assigned AFTER construction: the NilVal
                // constructor does not read it from its spec (only NilVal.make
                // does), so passing it in the spec left the hint's
                // {func}/{want}/{got} placeholders un-injected and printed
                // literally.
                const nil = new NilVal_1.NilVal({ why: 'func_arity' });
                nil.details = {
                    func: fname,
                    want: arityText(arity[0], arity[1]),
                    got: '' + got,
                };
                // The CALL AS WRITTEN rides the refusal (G8 phase 4): a pipe
                // rebuilds `x |> upper()` as `upper(x)`, and the arity it fails
                // on here is the arity of a call one argument short of the one
                // the author actually wrote.
                nil._callname = fname;
                nil._callterms = argterms;
                return addsite(nil, r, ctx);
            }
        }
        // rawToVal EVERY argument. A degenerate expression can hand this
        // handler raw parse values rather than Vals -- `pref(1-3)` arrives
        // as the plain numbers 1 and -3 -- and a func's peg is unified
        // element by element, so a raw one reached `arg.unify(...)` and
        // threw. The unifier's catch-all turned that into an `internal`
        // verdict: a crash reported as a unification result (issue #49).
        // The Go port has always converted here (asVal in evaluate).
        // A comma group is ONE raw-array term (see writtenArgCount).
        // For a function whose arguments are distinct POSITIONS —
        // deprecate's value and record, pack's and each's data and template
        // — the group is expanded back into them here, while a written list
        // literal, already a ListVal, stays one argument. The constraint
        // atoms make the same move in their own constructor (atomArgs,
        // ConstraintVal.ts), which is why they are not in this set:
        // `neq(1,2)` is one argument LIST, not two positions, and expanding
        // it here would take the list away from the code that reads it.
        let terms = argterms;
        if (true === POSITIONAL_ARG_FUNCS[fname] && 1 === terms.length &&
            Array.isArray(terms[0])) {
            terms = terms[0];
        }
        const args = terms.map(rawToVal);
        const val = null == funcval ?
            new NilVal_1.NilVal({ why: 'unknown_function' }) :
            new funcval({ peg: args });
        // The call as written, for the pipe to rebuild from. Parse-time
        // only: nothing downstream reads it, and a clone does not carry it.
        //
        // NOT on a constraint atom that BUILT: an atom with its argument
        // list complete is a residual, not a call waiting for a subject,
        // and `1 |> neq(2,3)` is asking for `1 & neq(2,3)` -- which is
        // what `&` is for. (An atom the arity check REFUSED still carries
        // it, on the nil above: `1 |> min()` is `min(1)`, and that is a
        // call waiting for a subject.) The Go port cannot rebuild a built
        // atom at all -- its residual keeps no atom name -- so this is
        // also what keeps the two ports answering the same thing.
        if (true !== val.isConstraint) {
            val._callname = fname;
            val._callterms = argterms;
        }
        return val;
    };
    // The argument terms `f(...)` would have been written with, had the
    // piped value been written into it. A comma group is one raw-array
    // term: for a POSITIONAL function the group is separate arguments,
    // so the piped value joins them; for a constraint atom the group IS
    // the argument list, so the piped value joins the list instead.
    const pipeTerms = (call, val) => {
        const written = call._callterms;
        const group = 1 === written.length && Array.isArray(written[0]) ?
            written[0] : written;
        if (0 === group.length) {
            return [val];
        }
        return true === POSITIONAL_ARG_FUNCS[call._callname] ?
            [val, ...group] : [[val, ...group]];
    };
    let opmap = {
        'conjunct-infix': (r, ctx, _op, terms) => addsite(new ConjunctVal_1.ConjunctVal({ peg: dropUnfilled(terms) }), r, ctx),
        'disjunct-infix': (r, ctx, _op, terms) => addsite(new DisjunctVal_1.DisjunctVal({ peg: dropUnfilled(terms) }), r, ctx),
        // `.a` (prefix) and `a.b` (infix) build the same reference; only the
        // prefix flag differs, and both need the same missing-operand guard,
        // so they share one builder.
        'dot-prefix': (r, ctx, _op, terms) => dotRef(r, ctx, terms, true),
        'dot-infix': (r, ctx, _op, terms) => dotRef(r, ctx, terms, false),
        'star-prefix': (r, ctx, _op, terms) => {
            if (null == terms[0])
                return incompleteNil(r, ctx);
            // A PREFERENCE MARKS A VALUE, AND A BARE KEY IS NOT ONE.
            // `*a: 1` has no braces, so the prefix took the whole IMPLICIT
            // map as its operand and the document silently became
            // `*{"a":1}` -- `*a: 1, b: 2` became a one-element LIST, losing
            // `b` outright. Neither is anything the author wrote.
            //
            // The accident is confined to the first position of the implicit
            // top-level map, which is the only place no brace has yet
            // committed the rule to a map: `{*a: 1}` and `a: 1, *b: 2` are
            // ALREADY parse errors. This makes the third spelling agree with
            // them rather than inventing a meaning for it.
            //
            // A BRACED operand is untouched, and that is the whole of the
            // distinction: `*{x:1}` and `*[1]` are the real spelling, they
            // are what `*{x:1} | *{y:2}` needs, and the shared spec pins them
            // (11 rows). The open token's own source text is what separates
            // the two -- `{` or `[` for a braced bag, the first key or
            // element for an implicit one.
            const bag = terms[0];
            if ((bag.isMap && '{' !== bag.site.src) ||
                (bag.isList && '[' !== bag.site.src)) {
                return addsite(new NilVal_1.NilVal({ why: 'pref_implicit_bag' }), r, ctx);
            }
            return addsite(new PrefVal_1.PrefVal({ peg: terms[0] }), r, ctx);
        },
        'dollar-prefix': (r, ctx, _op, terms) => {
            if (null == terms[0])
                return incompleteNil(r, ctx);
            // A refusal from the dot rule below (an alias used as a path
            // segment) rides straight through: wrapping it in a VarVal would
            // replace `alias_in_path` with a var whose peg is a nil.
            if (terms[0]?.isNil) {
                return terms[0];
            }
            // `$%foo` -- the sigil directly after the root -- reaches here
            // as the alias reference rather than through the dot rule, and
            // is refused for the same reason.
            if (terms[0] instanceof RefVal_1.RefVal &&
                terms[0].peg.some((seg) => 'string' === typeof seg && ALIAS_RE.test(seg))) {
                return addsite(new NilVal_1.NilVal({ why: 'alias_in_path' }), r, ctx);
            }
            // $.a.b absolute path
            if (terms[0] instanceof RefVal_1.RefVal) {
                terms[0].absolute = true;
                return terms[0];
            }
            return addsite(new VarVal_1.VarVal({ peg: terms[0] }), r, ctx);
        },
        'plus-infix': (r, ctx, _op, terms) => {
            if (null == terms[0] || null == terms[1])
                return incompleteNil(r, ctx);
            return addsite(new PlusOpVal_1.PlusOpVal({ peg: [terms[0], terms[1]] }), r, ctx);
        },
        'negative-prefix': (r, ctx, _op, terms) => {
            let val = terms[0];
            if (null == val)
                return incompleteNil(r, ctx);
            // The exact leaves negate exactly and never change kind. R2/D5
            // holds here too: bigint has a single zero, and Decimal's
            // normalising constructor sends every zero to the same form, so
            // `-0d0` is `0d0` and `-0d0.0` is `0d0.0`.
            if (val instanceof BigIntegerVal_1.BigIntegerVal) {
                return addsite(new BigIntegerVal_1.BigIntegerVal({ peg: -val.peg, src: negsrc(val.src) }), r, ctx);
            }
            if (val instanceof BigDecimalVal_1.BigDecimalVal) {
                return addsite(new BigDecimalVal_1.BigDecimalVal({ peg: val.peg.negate(), src: negsrc(val.src) }), r, ctx);
            }
            // Negating a non-numeric operand (`k-x` splits into k, -x) is an
            // error nil, not NaN (mirrors negate() in go/lang.go).
            if (!(val instanceof IntegerVal_1.IntegerVal) && !(val instanceof NumberVal_1.NumberVal)) {
                return addsite(new NilVal_1.NilVal({ why: 'negative' }), r, ctx);
            }
            // Build a fresh Val rather than mutating in place: the expr plugin
            // can evaluate the same node twice (e.g. inside `*-1` or a
            // disjunct member), and an in-place `peg = -peg` applied twice
            // silently un-negates the number.
            let peg = -1 * val.peg;
            // Normalize -0 to 0 (keeps the AST and canon free of negative zero).
            if (0 === peg)
                peg = 0;
            // Negation never narrows the kind: a number stays a number. An
            // integer stays an integer unless the negation leaves the int64
            // range (only -(-2^63), which no literal can express), in which
            // case it widens to a number rather than failing.
            const out = val instanceof IntegerVal_1.IntegerVal && (0, numkind_1.isIntegerKind)(peg)
                ? new IntegerVal_1.IntegerVal({ peg })
                : new NumberVal_1.NumberVal({ peg });
            return addsite(out, r, ctx);
        },
        'positive-prefix': (r, ctx, _op, terms) => {
            let val = terms[0];
            if (null == val)
                return incompleteNil(r, ctx);
            return addsite(val, r, ctx);
        },
        // THE PIPE `|>` (G8 phase 4): parse-time sugar and nothing else.
        // `x |> f(a)` IS `f(x, a)` -- the piped value goes in as the FIRST
        // argument, Elixir-style, because every Aontu call is data-first
        // already (`close(x)`, `pack(data, tmpl)`) and a pipe must read the
        // way the calls it replaces read. It never reaches a Val: by the
        // time the tree exists the call is an ordinary call, which is why
        // canon can never emit the token and the two ports' canon stay
        // byte-identical without either knowing about it.
        'pipe-infix': (r, ctx, _op, terms) => {
            const val = terms[0];
            const call = terms[1];
            if (null == val || null == call)
                return incompleteNil(r, ctx);
            // The right-hand side is a CALL: either one the func handler
            // already built, or one it refused for an arity the pipe is about
            // to satisfy. Both carry what they were written as.
            if (null != call._callname) {
                return buildCall(r, ctx, call._callname, pipeTerms(call, val));
            }
            // ... or a bare NAME, which is the whole point of the short
            // spelling: `x |> upper` is `upper(x)`. A bare word has already
            // become a string VALUE by the time an infix operator sees it, so
            // this is where a string becomes a call.
            if (true === call?.isScalar && 'string' === typeof call.peg &&
                null != funcMap[call.peg]) {
                return buildCall(r, ctx, call.peg, [val]);
            }
            // Anything else is not a call, and a pipe into a non-call is a
            // mistake in the source rather than a value.
            return addsite(new NilVal_1.NilVal({ why: 'pipe_target' }), r, ctx);
        },
        'func-paren': (r, ctx, _op, terms) => {
            let val = terms[1];
            const fname = terms[0];
            if ('' !== fname) {
                val = buildCall(r, ctx, fname, terms.slice(1));
            }
            // `a:()` — grouping parens with nothing inside.
            if (null == val)
                return incompleteNil(r, ctx);
            // ... and the same for a GROUPING paren, whose value is passed
            // straight through: `(([]%))` yielded a raw array, and addsite went
            // on to write a site onto it, throwing a TypeError that escaped the
            // unifier entirely ("Cannot set properties of undefined").
            const out = addsite(rawToVal(val), r, ctx);
            return out;
        },
    };
    jsonic
        .use(asPlugin(expr_1.Expr), {
        op: {
            // disjunct < conjunct: c & b | a -> (c & b) | a
            'conjunct': {
                infix: true, src: '&', left: 16_000_000, right: 17_000_000
            },
            'disjunct': {
                infix: true, src: '|', left: 14_000_000, right: 15_000_000
            },
            // G8 phase 4: the pipe. LOOSEST of all the infix operators, so
            // `a & b |> f` pipes the whole meet and not just `b` -- a pipe
            // reads as "and then", which is a statement about everything to
            // its left. Kept in lock-step with the op table in go/lang.go.
            'pipe-infix': {
                infix: true, src: '|>', left: 12_000_000, right: 13_000_000
            },
            'plus-infix': {
                src: '+',
                infix: true,
                left: 20_000_000,
                right: 21_000_000,
            },
            // Re-base the unary prefixes for the same reason. Every aontu
            // operator sits far above the @tabnas/expr defaults, so the
            // default prefix binding power of 4_000_000 left unary `-`/`+`
            // LOOSER than every infix operator: `-1 & integer` parsed as
            // `-(1 & integer)`, and negative-prefix (below) then rejected
            // the composite operand as a `negative` error nil (likewise
            // `-2+3`, `-1|2`). Unary minus must bind tighter than `+`, `&`
            // and `|` — but still looser than `.` (dot-infix left is
            // 25_000_000), so `-0xFF.5` stays `-(0xFF.5)` and `$`.
            // Kept in lock-step with the op table in go/lang.go.
            'negative': {
                src: '-',
                prefix: true,
                right: 22_000_000,
            },
            'positive': {
                src: '+',
                prefix: true,
                right: 22_000_000,
            },
            'dollar-prefix': {
                src: '$',
                prefix: true,
                right: 31_000_000,
            },
            'dot-infix': {
                src: '.',
                infix: true,
                left: 25_000_000,
                right: 24_000_000,
            },
            'dot-prefix': {
                src: '.',
                prefix: true,
                right: 24_000_000,
            },
            'star': {
                src: '*',
                prefix: true,
                right: 24_000_000,
            },
            'func': {
                paren: true,
                preval: {
                    active: true,
                    // allow: ['floor'], //Object.keys(funcMap)
                },
                osrc: '(',
                csrc: ')',
            },
            plain: null,
            addition: null,
            subtraction: null,
            multiplication: null,
            division: null,
            remainder: null,
        },
        evaluate: (r, ctx, op, terms) => {
            // // console.log('EVAL-START', r.u)
            if ('func-paren' === op.name
                // && !r.parent.prev?.u?.paren_preval
                && !r.u?.paren_preval) {
                // terms = [new StringVal({ peg: '' }), ...terms]
                terms = ['', ...terms];
            }
            let val = opmap[op.name](r, ctx, op, terms);
            // // console.log('EVAL', terms, '->', val)
            return val;
        }
    });
    const CJ = jsonic.token['#E&'];
    const CL = jsonic.token.CL;
    const ST = jsonic.token.ST;
    const TX = jsonic.token.TX;
    const NR = jsonic.token.NR;
    const QM = jsonic.token.QM;
    const VL = jsonic.token.VL;
    const OPTKEY = [TX, ST, NR];
    jsonic.rule('expr', (rs) => {
        rs.close([
            // A `&` followed by `:` after an expression value belongs to the
            // enclosing map as a spread, not to the expression as a conjunct
            // — backtrack both tokens so the expression completes (and
            // evaluates to a Val) and the map's spread alts take over. This
            // is what makes `k1:$flag &:boolean` parse: without it the expr
            // plugin consumes the `&` as an infix conjunct, chokes on the
            // `:`, and leaves the raw unevaluated expr node in the map
            // (mirrors the expr-rule PrependClose in go/lang.go). The
            // `n: { expr: 0 }` reset matches the plugin's own expr-end alts —
            // the evaluation after-close only fires when the counter is 0.
            { s: [CJ, CL], b: 2, n: { expr: 0 }, g: 'expr,expr-end,spread' },
        ]);
        return rs;
    });
    jsonic.rule('val', (rs) => {
        rs
            .open([
            {
                s: [CJ, CL], p: 'map', b: 2, n: { pk: 1 },
                // @tabnas seeds a descended rule's node from its parent; without
                // a fresh node here the nested spread map (`a:&:{x:1}`) would
                // share the parent map's node object and self-reference.
                a: (r) => { r.node = {}; },
                g: 'spread'
            },
            {
                s: [OPTKEY, QM],
                c: (r) => 0 == r.d,
                p: 'map',
                b: 2,
                // Fresh node (see spread alt above): the optional dive descends
                // to a map and must not share the parent's node object.
                a: (r) => { r.node = {}; },
                g: 'pair,jsonic,top,aontu-optional',
            },
            {
                s: [OPTKEY, QM],
                p: 'map',
                b: 2,
                n: { pk: 1 },
                a: (r) => { r.node = {}; },
                g: 'pair,jsonic,top,dive,aontu-optional',
            },
        ])
            .ac((r, ctx) => {
            let valnode = r.node;
            let valtype = typeof valnode;
            if ('string' === valtype) {
                valnode = addsite(new StringVal_1.StringVal({ peg: r.node }), r, ctx);
            }
            else if ('number' === valtype) {
                // An overflowing literal (1e999) lexes to Infinity; that is an
                // error value, not a number (mirrors not_number in go/lang.go).
                if (!Number.isFinite(r.node)) {
                    valnode = addsite(new NilVal_1.NilVal({ why: 'not_number' }), r, ctx);
                }
                // D7 -- A LOSSY INTEGER LITERAL IS REFUSED, NOT ROUNDED. The
                // token above is already a double, so a literal the double
                // cannot hold exactly (2^53+1, 0x7fffffffffffffff,
                // 0xffffffffffffffff) has ALREADY become a different number by
                // the time it gets here. Storing it would mean the document
                // silently means something other than what it says, so the
                // literal becomes a located error whose hint names the escape:
                // write it `0d…` and get the exact value.
                //
                // The rule is EXACTNESS, not magnitude -- 10^20 and 2^124 are
                // both far outside the int64 window and both land exactly on a
                // binary64, so both stay values (see isLossyIntegerLiteral).
                else if ((0, numkind_1.isLossyIntegerLiteral)(r.node, r.o0.src)) {
                    const nil = new NilVal_1.NilVal({ why: 'lossy_integer_literal' });
                    nil.details = { src: r.o0.src };
                    valnode = addsite(nil, r, ctx);
                }
                // A literal is integer kind only if its source has no '.', its
                // value is integral, and it fits the int64 range: `1.0` is a
                // number, and so are 1e21 and 100000000000000000000 (see
                // isIntegerKind).
                else if ((0, numkind_1.isIntegerKind)(r.node, r.o0.src)) {
                    valnode = addsite(new IntegerVal_1.IntegerVal({ peg: r.node, src: r.o0.src }), r, ctx);
                }
                else {
                    valnode = addsite(new NumberVal_1.NumberVal({ peg: r.node, src: r.o0.src }), r, ctx);
                }
            }
            else if ('boolean' === valtype) {
                valnode = addsite(new BooleanVal_1.BooleanVal({ peg: r.node }), r, ctx);
            }
            else if (null === valnode) {
                valnode = addsite(new NullVal_1.NullVal({ peg: r.node }), r, ctx);
            }
            if (null != valnode && 'object' === typeof valnode && valnode.site) {
                let st = r.o0;
                valnode.site.row = st.rI;
                valnode.site.col = st.cI;
                valnode.site.url = ctx.meta.multisource && ctx.meta.multisource.path;
                // No `?? ''` and no empty-text arm here: this branch runs only
                // for a rule that HAS an open token, and a token that opens a
                // value always carries text — the coverage gate refuses both
                // guards as dead. The unset case is the one above, where r.o0
                // itself can be absent.
                valnode.site.src = st.src;
                valnode.site.len = st.src.length;
            }
            // else { ERROR? }
            r.node = valnode;
            return undefined;
        })
            .close([{ s: [CJ, CL], b: 2, g: 'spread,json,more' }]);
        return rs;
    });
    jsonic.rule('map', (rs) => {
        rs
            .open([
            { s: [CJ, CL], p: 'pair', b: 2, g: 'spread' },
            { s: [OPTKEY, QM], p: 'pair', b: 2, g: 'pair,list,val,imp,jsonic,aontu-optional' },
        ])
            .bc((r, ctx) => {
            const optionalKeys = r.u.aontu_optional_keys ?? [];
            const aliasKeys = r.u.aontu_alias_keys ?? [];
            let mo = r.node;
            // An elided value (`a:`) leaves a raw null/undefined that never
            // passed through the val rule. It is REFUSED rather than made a
            // null (issue #48): a key with nothing after the colon is a
            // mistake in the source, and turning it into a value made that
            // mistake indistinguishable from a deliberate `a:null`.
            //
            // A colon chain (`a: b:1`) is not an elision -- the value is the
            // nested pair, which the val rule does produce -- and neither is
            // a trailing comma.
            for (const k in mo) {
                if (null == mo[k] && '___merge' !== k) {
                    // Pathed at the KEY, not at the enclosing map. addsite takes
                    // the rule's path, which here is the map's, so the error
                    // would otherwise name the container and leave the reader to
                    // work out which key was elided.
                    const en = addsite(new NilVal_1.NilVal({ why: 'elided_value' }), r, ctx);
                    en.path = [...(r.k?.path ?? []), k];
                    mo[k] = en;
                    // An elided value under an OPTIONAL key stops being optional.
                    // Optionality is about a value that may be absent at
                    // GENERATE; it does not excuse a source that stops after the
                    // colon. Left optional, the refusal was dropped with the key
                    // and `a?:` generated `{}` -- a silent nothing, which is
                    // worse than either the old null or the error.
                    const oi = optionalKeys.indexOf(k);
                    if (-1 !== oi) {
                        optionalKeys.splice(oi, 1);
                    }
                }
            }
            // ... and the OPTIONAL spelling, `a?:`, which does not leave a
            // null behind to be found: its value never reaches the node at
            // all, so the key is simply absent and the map generated without
            // it. A key recorded as optional but missing from the node was
            // written with nothing after its colon.
            for (const k of optionalKeys) {
                if (!(k in mo)) {
                    mo[k] = addsite(new NilVal_1.NilVal({ why: 'elided_value' }), r, ctx);
                }
            }
            // An elided SPREAD (`x:$obj&:` with nothing after the colon)
            // refuses the whole map, not a key (issue #48). A spread is not a
            // child, so a refusal stored in its place has nothing to attach
            // to: `x:&:` has no children for the spread to apply to, and the
            // map would generate as `{}` with the mistake silently gone.
            // Refusing the container is what makes it visible at all.
            const sp = mo[type_1.SPREAD];
            if (sp && sp.v.some((sv) => null == sv)) {
                r.node = addsite(new NilVal_1.NilVal({ why: 'elided_value' }), r, ctx);
                return undefined;
            }
            //  Handle defered conjuncts, e.g. `{x:1 @"foo"}`
            if (mo.___merge) {
                let mop = { ...mo };
                delete mop.___merge;
                // TODO: needs addpath?
                let mopv = new MapVal_1.MapVal({ peg: mop });
                mopv.optionalKeys = optionalKeys;
                mopv.aliasKeys = aliasKeys;
                r.node =
                    addsite(new ConjunctVal_1.ConjunctVal({ peg: [mopv, ...mo.___merge] }), r, ctx);
            }
            else {
                r.node = addsite(new MapVal_1.MapVal({ peg: mo }), r, ctx);
                r.node.optionalKeys = optionalKeys;
                r.node.aliasKeys = aliasKeys;
            }
            return undefined;
        })
            .close([{ s: [CJ, CL], b: 2, g: 'spread,json,more' }]);
        return rs;
    });
    jsonic.rule('list', (rs) => {
        rs
            // .open([{ s: [CJ, CL], p: 'pair', b: 2, g: 'spread' }])
            .bc((r, ctx) => {
            const optionalKeys = r.u.aontu_optional_keys ?? [];
            let ao = r.node;
            // An elided ELEMENT (`[,]`, `[1,,2]`) is refused for the same
            // reason as an elided map value (issue #48). A trailing comma
            // (`[1,]`) is not an elision and never reaches here.
            for (let i = 0; i < ao.length; i++) {
                if (null == ao[i]) {
                    // Pathed at the INDEX, for the same reason as the map case.
                    const en = addsite(new NilVal_1.NilVal({ why: 'elided_value' }), r, ctx);
                    en.path = [...(r.k?.path ?? []), '' + i];
                    ao[i] = en;
                }
            }
            // No ___merge arm here: the deferred map.merge that writes it
            // only ever fires for a `pair` rule, whose parent is always a
            // `map` rule with a plain-object node — never a list.
            {
                r.node = addsite(new ListVal_1.ListVal({ peg: ao }), r, ctx);
                r.node.optionalKeys = optionalKeys;
            }
            return undefined;
        });
        // .close([{ s: [CJ, CL], b: 2, g: 'spread,json,more' }])
        return rs;
    });
    // TODO: copied from jsonic grammar
    // jsonic should provide a way to export this
    const pairkey = (r) => {
        // Get key string value from first matching token of `Open` state.
        const key_token = r.o0;
        const key = ST === key_token.tin || TX === key_token.tin
            ? key_token.val // Was text
            : key_token.src; // Was number, use original text
        r.u.key = key;
    };
    // A pair in LIST position writes its value at `node[key]` like any
    // other pair, and the enclosing list's node is an ARRAY -- so a numeric
    // key lands on an index and becomes an element, and may land on an
    // index a real element already holds (`[5,0:1]`). Since the pair must
    // contribute nothing (issue #40), the slot is photographed before the
    // value is parsed and put back afterwards. Restoring beats deleting for
    // exactly the overwrite case: deleting `[5,0:1]`'s index 0 would take
    // the 5 with it, where restoring gives back the list the pair was
    // never part of.
    //
    // `length` is saved too: writing past the end grows an array, and
    // `[5,1?:9]` must be [5] again and not [5, <hole>].
    // Typed as a string bag deliberately: the slot may be named by a
    // non-numeric key (`[x:1]`), which the array type would refuse. Both
    // helpers run only from the elem rule, whose node is the enclosing
    // list, so neither guards against a non-array node — a guard there
    // proved unreachable and dead code is worse than none.
    const asSlots = (r) => r.node;
    const snapshotPairSlot = (r, key) => {
        const node = asSlots(r);
        r.u.aontu_pair_slot = {
            key,
            had: Object.prototype.hasOwnProperty.call(node, key),
            was: node[key],
            len: node.length,
        };
    };
    const restorePairSlot = (r) => {
        const slot = r.u.aontu_pair_slot;
        if (null == slot) {
            return;
        }
        const node = asSlots(r);
        if (slot.had) {
            node[slot.key] = slot.was;
        }
        else {
            delete node[slot.key];
        }
        node.length = slot.len;
    };
    jsonic.rule('pair', (rs) => {
        rs
            .open([
            {
                s: [CJ, CL], p: 'val',
                u: { spread: true },
                g: 'spread'
            },
            {
                s: [OPTKEY, QM], b: 1, r: 'pair', u: { aontu_optional: true },
                g: 'aontu-optional-key'
            },
            {
                s: [QM, CL],
                c: (r) => r.prev.u.aontu_optional,
                p: 'val',
                u: { pair: true },
                a: (r) => {
                    pairkey(r.prev);
                    r.u.key = r.prev.u.key;
                    r.parent.u.aontu_optional_keys = (r.parent.u.aontu_optional_keys || []);
                    r.parent.u.aontu_optional_keys.push('' + r.u.key);
                },
                g: 'aontu-optional-pair'
            }
        ])
            // NOTE: manually adjust path - @tabnas/path ignores as not pair:true
            .ao((r) => {
            if (0 < r.d && r.u.spread) {
                r.child.k.path = [...r.k.path, '&'];
                r.child.k.key = '&';
            }
        })
            .bc((rule) => {
            // TRAVERSE PARENTS TO GET PATH
            // A DECLARATION IS A PAIR WHOSE KEY IS AN ALIAS NAME. The lexer
            // claims `%name` whole and hands it over as a #VL token whose
            // SOURCE is the name, so the key TEXT alone cannot be the test:
            // a quoted `"%a": 1` is an ordinary key that merely starts with
            // the sigil, and erasing that would be wrong. The token is what
            // separates them.
            //
            // Recorded on the enclosing map, never on the value, and that is
            // the point: a reference COPIES the value it resolves to, so a
            // mark riding the value would erase the referring field too.
            // Being a property of the map is also what carries it through a
            // meet, the way optional keys are carried.
            const ktkn = rule.o0;
            if (null != ktkn && VL === ktkn.tin && ALIAS_RE.test('' + ktkn.src)) {
                const holder = rule.parent;
                const aname = '' + ktkn.src;
                // Always recorded here; whether the map is ALLOWED to carry
                // declarations is decided on the VALUE (MapVal.unify), not at
                // the parse. The parse cannot see it: an INCLUDED file's
                // declarations are at the root of their own text, and only
                // once the loaded map is placed does it become apparent that
                // root is not the document's.
                holder.u.aontu_alias_keys = (holder.u.aontu_alias_keys || []);
                holder.u.aontu_alias_keys.push(aname);
            }
            if (rule.u.spread) {
                rule.node[type_1.SPREAD] =
                    (rule.node[type_1.SPREAD] || { o: rule.o0.src, v: [] });
                rule.node[type_1.SPREAD].v.push(rule.child.node);
            }
            return undefined;
        })
            .close([
            // A following `&:` starts a sibling spread pair in the current
            // map: directly inside a braced map (pk<=0) at any depth, or in
            // the implicit top-level map (dmap<=1). Inside an implicit
            // colon-chain map (pk>0) it bubbles up instead (second alt), so
            // `a:b:1 &:2` attaches the spread to a's map, not b's.
            { s: [CJ, CL], c: (r) => r.lte('pk', 0) || r.lte('dmap', 1), r: 'pair', b: 2, g: 'spread,json,pair' },
            { s: [CJ, CL], b: 2, g: 'spread,json,more' }
        ]);
        return rs;
    });
    jsonic.rule('elem', (rs) => {
        rs
            .open([
            {
                s: [CJ, CL],
                p: 'val',
                n: { pk: 1, dmap: 1 },
                u: { spread: true, done: true, list: true },
                g: 'spread'
            },
            {
                s: [OPTKEY, QM], b: 1, r: 'elem', u: { aontu_optional: true },
                g: 'aontu-optional-key-elem'
            },
            {
                s: [QM, CL],
                c: (r) => r.prev.u.aontu_optional,
                p: 'val',
                u: {
                    spread: true, done: true, list: true, pair: true,
                    aontu_optional_elem: true,
                },
                a: (r) => {
                    pairkey(r.prev);
                    r.u.key = r.prev.u.key;
                    snapshotPairSlot(r, '' + r.u.key);
                },
                g: 'aontu-optional-elem'
            },
            // A PLAIN pair in list position IS A SINGLE-KEY MAP ELEMENT:
            // `[a:1, b:2]` is `[{a:1}, {b:2}]` (the rule @tabnas/jsonic
            // spells as `list.pair`). This REVERSES issue #40's "a pair is
            // not an element": that rule was chosen because jsonic wrote
            // the pair at `node[key]` -- an array PROPERTY that never
            // showed up for a text key and an INDEX for a numeric one --
            // and inert beat that incoherence. But inert was itself a
            // silent drop: `x: [a:1, b:2]` evaluated to `x: []`, the
            // author's data gone at exit 0. The element is built in the
            // bc below, where the value is already a Val; the snapshot
            // still neutralises jsonic's raw slot write first.
            {
                s: [OPTKEY, CL], p: 'val',
                u: { spread: true, done: true, list: true, pair: true },
                a: (r) => {
                    pairkey(r);
                    snapshotPairSlot(r, '' + r.u.key);
                },
                g: 'aontu-plain-pair-elem'
            }
        ])
            // NOTE: manually adjust path - the twin of the `pair` rule's hook
            // above, and for the same reason, one layer down.
            //
            // Every alt above contributes NO element: a `&:` spread is a
            // constraint on the elements, and a `k:v` pair in list position is
            // simply not one (the `aontu-plain-pair-elem` note above). The array
            // slot they briefly occupy is already given back by
            // restorePairSlot. The PATH index was not: @tabnas/path's
            // `@elem-ao` increments `r.k.index` for every elem rule it sees, so
            // each of these stole an index and every later element's path was
            // one too high — `[&: integer, 10, 20, "bad"]` reported the bad
            // value at `$.l.3` while `aontu get $.l.2` returned it, and on a
            // one-element list the path pointed off the end. Generation was
            // never wrong, which is why nothing caught it: the array is right
            // and only the labels on it were shifted (BUGS.md 44).
            //
            // Rewinding here rather than in the plugin keeps the plugin's rule
            // ("in an array, the path property is the element index") true —
            // these alts are the aontu-specific exceptions to what counts as an
            // element, so the correction belongs with the grammar that
            // introduces them. The child is re-pathed because the plugin has
            // already stamped it with the index being given back: a spread
            // takes the `'&'` segment its map twin takes, and a pair takes its
            // key, as a map entry would.
            .ao((r) => {
            // A pair IS an element now, so it keeps the index @tabnas/path
            // gave it, and its VALUE is pathed through both the index and
            // the key (`[a: $.nope]` fails at $.l.0.a). Only the `&:`
            // spread still contributes no element and gives its index back
            // (BUGS.md 44).
            if (0 < r.d && r.u.spread && !r.u.pair) {
                r.k.index = r.k.index - 1;
                const seg = '&';
                r.child.k.path = [...r.k.path, seg];
                r.child.k.key = seg;
            }
            else if (0 < r.d && r.u.pair) {
                // The element's index is the array length: everything before
                // it is already pushed, and the pair's own map is pushed at
                // close. `r.k.index` is not usable here -- the path plugin
                // counts only the elements it pushes itself, and this one is
                // aontu's.
                const seg = '' + r.u.key;
                r.child.k.path =
                    [...r.k.path, '' + (r.node?.length ?? 0), seg];
                r.child.k.key = seg;
            }
        })
            .bc((rule, ctx) => {
            // TRAVERSE PARENTS TO GET PATH
            // Only the `&:` alternative is a SPREAD. All four alts above set
            // `spread: true` -- it is what marks them as contributing no
            // element -- so this guard needs the narrower test, and `pair`
            // is what distinguishes a `k:v` in list position from a spread.
            //
            // Without it a pair BUILT the spread record, with `o` taken from
            // its own key rather than '&': `[x:1, &:integer, "bad"]` left
            // `{o:'x', v:[1, integer]}`, and ListVal's `'&' === spread.o`
            // then discarded the real constraint -- so the element spread
            // was silently dropped and the bad value generated (BUGS.md 46).
            // A pair alone did it too: `[x:1, 10]` produced a spread record
            // out of nothing.
            if (rule.u.spread && !rule.u.pair) {
                rule.node[type_1.SPREAD] =
                    (rule.node[type_1.SPREAD] || { o: rule.o0.src, v: [] });
                rule.node[type_1.SPREAD].v.push(rule.child.node);
            }
            // The slot is given back BEFORE the element is added: the
            // restore undoes jsonic's raw write (a property for a text
            // key, an INDEX for a numeric one -- restoring length is what
            // keeps `[1:2]` from padding with a null), and the push then
            // appends cleanly after it.
            restorePairSlot(rule);
            // THE SINGLE-KEY MAP ELEMENT, for both pair spellings. The
            // value is a Val already (`p: 'val'`), so the map is built
            // exactly as the map rule builds one -- and an elided value
            // (`[a:]`) is refused exactly as the map rule refuses one
            // (issue #48): a key with nothing after the colon is a
            // mistake, not an empty value.
            if (true === rule.u.pair) {
                const key = '' + rule.u.key;
                let v = rule.child.node;
                if (null == v) {
                    v = addsite(new NilVal_1.NilVal({ why: 'elided_value' }), rule, ctx);
                    v.path = [...(rule.k?.path ?? []),
                        '' + rule.node.length, key];
                }
                const mv = addsite(new MapVal_1.MapVal({ peg: { [key]: v } }), rule, ctx);
                // `[a?: 1]` is `[{a?: 1}]`: the key is optional IN the
                // element, so the two spellings stay one rule apart rather
                // than two behaviours apart.
                if (true === rule.u.aontu_optional_elem) {
                    mv.optionalKeys = [key];
                }
                rule.node.push(mv);
            }
            return undefined;
        })
            .close([{ s: [CJ, CL], r: 'elem', b: 2, g: 'spread,json,more' }]);
        return rs;
    });
};
// INCLUDE_KINDS IS THE RULE FOR WHAT AN INCLUDE MEANS (ADR-012,
// use-cases/BUGS.md §49). An extension is on this list or it is not
// read at all, and its entry says WHICH OF TWO THINGS the file is.
//
// `source` — Aontu, with everything the language has: types, defaults,
// references, constraints, its own includes. Two extensions, and they
// are the ones this project owns.
//
// A FORMAT NAME — configuration DATA, parsed by that format's own
// parser into the JSON value it denotes, which then becomes Aontu
// values like any other data. Every one of these formats maps onto
// JSON, which is why one word covers them: a `.toml` file is a map of
// scalars, lists and maps, and so is the `.aon` file that unifies with
// it. What the format does NOT get is the language — a `&` in a YAML
// file is a YAML anchor, not a spread key, because the YAML parser
// reads it, not this one.
//
// The parsers are @tabnas's, one per format, and the Go port uses the
// same ones (ADR-001): the two implementations agree because they are
// running the same grammar, not because two hand-written readers were
// kept in step.
//
// This table and go/source.go's includeKinds are the same table.
const INCLUDE_KINDS = {
    aon: 'source',
    aontu: 'source',
    json: 'json',
    // JSON-LD is JSON: a `@context` is a key like any other here, and
    // what it MEANS is the vocabulary's business, not the reader's.
    jsonld: 'json',
    jsonc: 'jsonc',
    json5: 'json5',
    jsonic: 'jsonic',
    jsc: 'jsonic',
    toml: 'toml',
    yaml: 'yaml',
    yml: 'yaml',
    ini: 'ini',
};
// `.csv` IS DELIBERATELY ABSENT, and the reason is ADR-001 rather than
// taste. The two ports' CSV parsers disagree about what a CSV file IS:
// one answers header-keyed records with string fields, the other raw
// rows including the header, with numbers parsed. Admitting it would
// admit a divergence into the one thing this project refuses to have
// one in. Recorded in ADR-012 and pinned by file.tsv's load-ext-csv.
// The multisource kind of a path: the LAST segment's extension, without
// its dot, lowercased -- `''` for a name that has none. The rule is
// @tabnas/multisource's own extKind (and Go's filepath.Ext), copied
// rather than imported because it decides what a source IS: a dot in a
// parent folder (`/my.app/conf`) must not read as an extension.
function extKindOf(full) {
    const seg = full.match(/[^\\/]*$/)[0];
    return (seg.match(/\.([^.]*)$/) || ['', ''])[1].toLowerCase();
}
// The refusal message, naming the extension -- because the extension is
// the whole reason, and a reader told only "not readable" has to guess
// which part of the path the engine objected to. Byte-identical to Go's
// extensionMsg.
function extensionMsg(path, ext) {
    const which = '' === ext ? 'no extension' : 'extension: .' + ext;
    return 'include not readable: ' + path + ' (' + which + ')';
}
// THE RULE ALSO HOLDS FOR A RESOLVER THIS ENGINE DID NOT WRITE.
// gateExtension refuses an unlisted extension inside makeModelResolver,
// which is the default; a HOST may supply its own through
// `AontuOptions.resolver`, and that one has never heard of
// INCLUDE_KINDS. Without this the host's resolution would fall to
// multisource's own default for an unnamed kind, which hands the file
// back as TEXT — or, for `.js`, EXECUTES it. So the two roads end in
// one place: whatever chose the source, an extension off the list is
// refused with the same code and the same message.
const refuseProcessor = (res) => {
    // `full` is the one part a host resolution may leave out -- it is the
    // path the resolver CHOSE, and a resolver that answers from something
    // other than a filesystem need not have one. The written path always
    // reaches here, so it is the fallback.
    const err = new Error(extensionMsg(res.path, extKindOf(res.full ?? res.path)));
    err.code = 'include_extension';
    throw err;
};
// ONE READER PER FORMAT, BUILT ONCE. These are stateless parsers and
// building a jsonic instance is not free, so they are made at module
// load rather than per include. The file name is passed through so a
// syntax error inside an included `.toml` names the `.toml`.
const DATA_READERS = (() => {
    const viaPlugin = (plugin) => {
        const jsonic = jsonic_1.Jsonic.make().use(plugin);
        return (src, fileName) => jsonic(src, { fileName });
    };
    const toml = viaPlugin(toml_1.Toml);
    // The strict RFC 8259 reader is its own parser rather than a
    // plugin, and it is `make().parse` rather than the module's bare
    // `parse`: only the instance carries the meta bag, and without it
    // a syntax error in an included `.json` says `<no-file>`.
    const json = (0, json_1.make)();
    return {
        json: (src, fileName) => json.parse(src, { fileName }),
        jsonc: viaPlugin(jsonc_1.Jsonc),
        json5: viaPlugin(json5_1.Json5),
        // Plain jsonic needs no plugin: it IS the base parser.
        jsonic: (src, fileName) => (0, jsonic_1.Jsonic)(src, { fileName }),
        toml: (src, fileName) => tomlDates(toml(src, fileName)),
        yaml: viaPlugin(yaml_1.Yaml),
        ini: viaPlugin(ini_1.Ini),
    };
})();
/**
 * A TOML document with its dates as the TEXT they were written as.
 *
 * TOML HAS DATES AND JSON DOES NOT, so the reader cannot hand one over
 * as itself: it answers with a marker object carrying the kind and the
 * source text. The value that reaches a document is that TEXT, which is
 * what a JSON document carries for a date anyway — and it is what the
 * Go port produces too, from a `*TomlTime` holding those same two
 * fields (`dataToValDepth`, go/source.go). Without this the same file
 * is a nested map in one port and a string in the other, which is the
 * class of divergence ADR-012 exists to stop.
 *
 * The guard is exact — one key, `__toml__`, holding a `kind` and a
 * `src` string — so a document whose own data happens to use the name
 * passes through untouched.
 */
function tomlDates(node) {
    if (Array.isArray(node)) {
        return node.map(tomlDates);
    }
    if (null === node || 'object' !== typeof node) {
        return node;
    }
    const keys = Object.keys(node);
    const mark = node.__toml__;
    if (1 === keys.length && '__toml__' === keys[0] && null != mark &&
        'string' === typeof mark.kind && 'string' === typeof mark.src) {
        return mark.src;
    }
    const out = {};
    for (const k of keys) {
        out[k] = tomlDates(node[k]);
    }
    return out;
}
/**
 * Read one included file as DATA in the named format.
 *
 * The parser hands back the JSON value the file denotes — plain maps,
 * lists and scalars — and rawToVal turns that into Vals. THE
 * CONVERSION HAPPENS HERE, not at the top level, because an include is
 * usually not at the top level: `a: @"conf.toml"` puts the value under
 * a key, where a raw JavaScript object is something the tree cannot
 * unify with (the crash that was BUGS §49b).
 */
const dataProcessor = (format) => (res) => {
    res.val = rawToVal(DATA_READERS[format](res.src, res.path));
};
/**
 * The multisource processor map, built FROM the include table so the
 * two cannot drift: every extension the table names gets the reader
 * the table names for it, and the two kinds that are not in the table
 * refuse.
 */
function includeProcessors() {
    const map = {
        // multisource's fallback for an extension no entry names, so it is
        // the one that catches whatever the resolver's gate did not.
        '': refuseProcessor,
        // ... and the one upstream default that would EXECUTE the file.
        js: refuseProcessor,
    };
    const source = (0, jsonic_2.makeJsonicProcessor)();
    for (const kind of Object.keys(INCLUDE_KINDS)) {
        const format = INCLUDE_KINDS[kind];
        map[kind] = 'source' === format ? source : dataProcessor(format);
    }
    return map;
}
// SECURITY: under the DEFAULT ('system') include capability this
// resolver reads any file the process can reach — @"path" follows
// relative paths (`@"../../etc/passwd.aon"`) and symlinks — so treat
// opening an untrusted source as reading your disk. It no longer RUNS
// one: @"pkg" could require() an arbitrary installed module until
// ADR-012, which refuses a `.js` entry point by the same rule that
// refuses `.txt`. The trust profile (G5, docs/trust.md) is the
// confinement surface: `trust.include` of
// 'none', `{ mem }` or `{ root }` restricts what `@"..."` may resolve,
// and a denied resolution is a deterministic parse-stage
// `include_denied` error.
function makeModelResolver(options) {
    const useRequire = options.require || require;
    const capability = options.trust?.include ?? 'system';
    const memCapability = 'object' === typeof capability && null != capability.mem;
    const rootDir = 'object' === typeof capability &&
        'string' === typeof capability.root
        ? (0, node_path_1.resolve)(capability.root) : undefined;
    // Under the mem capability the CAPABILITY's file set is the whole
    // world; otherwise the host-injected `options.resolver.mem` entries
    // remain available under every capability but 'none' — they are
    // host-provided, not document-requested, so confining them would
    // confine the host against itself.
    // THE BUNDLED VOCABULARY (G4 phase 4, ts/src/std.ts) rides the
    // memory leg: served from the engine itself, so it needs neither the
    // filesystem nor package resolution and is available under every
    // capability but `none` — which denies every include outright, that
    // being what `none` means. Host entries and the capability's own set
    // WIN over it: a caller that supplies its own `std/system` gets the
    // one it supplied.
    let memResolver = (0, mem_1.makeMemResolver)(memCapability
        ? { ...capability.mem }
        : { ...(options.resolver?.mem || {}) });
    // TODO: make this consistent with other resolvers
    let fileResolver = (0, file_1.makeFileResolver)((spec) => {
        return 'string' === typeof spec ? spec : spec?.peg;
    });
    let pkgResolver = (0, pkg_1.makePkgResolver)({
        require: useRequire,
        ...(options.resolver?.pkg || {})
    });
    // Confinement is realpath-then-prefix-check (docs/trust.md): the
    // RESOLVED file's real path must sit below the root's real path, so a
    // symlink inside the root pointing outside it is an escape, not a
    // loophole. A path realpath cannot resolve falls back to the lexical
    // form — the comparison is then against what the resolver actually
    // read.
    // Real fs, deliberately: `options.fs` is not a sandbox (it feeds
    // parse text; the file leg reads through its own channel), so the
    // containment check must see the same filesystem that leg read from.
    // A path that does not (fully) exist cannot be realpath'd whole, and
    // falling back to the LEXICAL form compares apples to oranges when
    // the root itself sits behind a symlink -- on macOS a root under
    // /var realpaths to /private/var, so a merely-missing file inside it
    // reads as an escape. Realpath the deepest EXISTING ancestor and
    // re-attach the rest, so both sides of the check are in real
    // coordinates. (The MCP server's own confinement carries the twin of
    // this rule; its CI failure is what found the shape.)
    const realpath = (p) => {
        try {
            return (0, node_fs_1.realpathSync)(p);
        }
        catch {
            const parent = (0, node_path_1.dirname)(p);
            if (parent === p) {
                return p;
            }
            return (0, node_path_1.join)(realpath(parent), (0, node_path_1.basename)(p));
        }
    };
    const outsideRoot = (root, full) => {
        const rootReal = realpath(root);
        const fullReal = realpath(full);
        return fullReal !== rootReal && !fullReal.startsWith(rootReal + node_path_1.sep);
    };
    // A denial THROWS with the code; Lang.parse converts it to the
    // parse-stage `include_denied` nil (the same shape a syntax failure
    // takes). Raising beats injecting a nil value: a bare-member include
    // (`@"denied.aon"` at the top of a file) MERGES into the enclosing
    // map, and a nil contributes no keys, so an injected denial would
    // vanish and leave a plausible, silently-partial document.
    const deny = (path) => {
        // Only 'none' and 'root' can deny: the mem capability's misses are
        // not-found (its set is the whole world), so there is no third arm.
        const capname = 'none' === capability ? 'none' : 'root:' + rootDir;
        const err = new Error('include denied: ' + path + ' (capability: ' + capname + ')');
        err.code = 'include_denied';
        throw err;
    };
    // AN UNREADABLE EXTENSION THROWS, exactly as a denial does, and for
    // the same reason: a bare-member include (`@"notes.txt"` at the top
    // of a file) MERGES into the enclosing map, and a nil contributes no
    // keys, so an injected refusal would vanish and leave a plausible,
    // silently-partial document. Lang.parse turns the throw into the
    // parse-stage `include_extension` nil.
    const refuseExtension = (path, full) => {
        const err = new Error(extensionMsg(path, extKindOf(full)));
        err.code = 'include_extension';
        throw err;
    };
    // The gate every leg that RESOLVES A NAME passes through. The std and
    // module legs do not: both state `kind: 'aon'` because what they
    // serve is Aontu source by construction, not by its spelling.
    const gateExtension = (path, full) => {
        if (undefined === INCLUDE_KINDS[extKindOf(full)]) {
            refuseExtension(path, full);
        }
    };
    // The user cache: whatever the host named, else the platform rule
    // (`modCacheDir`, ts/src/mod.ts) the tooling writes by.
    const modCache = (opts) => {
        const named = opts.mod?.cache;
        return 'string' === typeof named ? named : (0, mod_1.modCacheDir)();
    };
    // The directory an include is being resolved FROM: the source that
    // holds it, or the entry path when the source is a string. Same base
    // the file leg computes (resolvePathSpec in @tabnas/multisource).
    const dirOf = (p) => null == p || '' === p ? (0, node_path_1.resolve)('.') : (0, node_path_1.dirname)((0, node_path_1.resolve)(p));
    // The module store reader: the host's filesystem when one was
    // injected, so a sandboxed evaluation stays in the filesystem the
    // host gave it.
    const modFs = (ctx) => {
        const hostfs = ctx?.meta?.fs;
        return null == hostfs ? { existsSync: node_fs_1.existsSync, readFileSync: node_fs_1.readFileSync } : {
            existsSync: (p) => {
                try {
                    hostfs.statSync(p);
                    return true;
                }
                catch {
                    return false;
                }
            },
            readFileSync: (p, enc) => hostfs.readFileSync(p, enc),
        };
    };
    // The manifest sink rides the parse meta (Lang.parse seeds it, the
    // multisource plugin's child-meta spread carries it to every nested
    // include), so the recorded closure covers the whole include tree.
    const record = (ctx, path, cap) => {
        const manifest = ctx?.meta?.aontu?.manifest;
        if (Array.isArray(manifest)) {
            manifest.push({ path, capability: cap });
        }
    };
    return function ModelResolver(spec, popts, rule, ctx, jsonic) {
        // The aontu val rule's ac has already wrapped every raw string node
        // as a StringVal, so spec is a Val here (or a raw object from a
        // .json/.js include, whose peg is undefined -> not found).
        let path = spec?.peg;
        // A bare `@` with no path (`a:@`) has nothing to resolve; report
        // not-found instead of crashing in the underlying resolvers.
        if (null == path || '' === path) {
            return { found: false, path: '' + (path ?? ''), search: [] };
        }
        if ('none' === capability) {
            deny(path);
        }
        // THE BUNDLED VOCABULARY (G4 phase 4, ts/src/std.ts): served from
        // the engine itself, so it needs neither the filesystem nor package
        // resolution and is available under every capability but `none` —
        // checked just above, that being what `none` means. Matched against
        // the name the author WROTE, before the memory leg, so the kind is
        // stated rather than guessed from an extension the bare name does
        // not have.
        const std = std_1.STD_SOURCES[path];
        if (null != std) {
            record(ctx, path, 'std');
            return { found: true, path, full: path, kind: 'aon', src: std, search: [] };
        }
        let search = [];
        let res = memResolver(path, popts, rule, ctx, jsonic);
        res.path = path;
        if (res.found) {
            // THE EXTENSION DECIDES HERE TOO. A virtual file set is still a
            // file set: its keys carry extensions, and the same rule has to
            // read them, or the mem capability becomes a way to include what
            // the filesystem would refuse.
            gateExtension(path, res.full ?? path);
            record(ctx, res.full ?? path, 'mem');
            return res;
        }
        // THE MODULE LEG (G6 phase 2, ts/src/mod.ts): memory -> MODULE ->
        // filesystem -> package. Memory stays FIRST so a sandbox and the
        // spec suite can stub a module path without touching disk; a path
        // that is not module-shaped falls straight through, so no existing
        // include can be routed somewhere new by this.
        const modref = memCapability ? undefined : (0, mod_1.parseModuleRef)(path);
        if (null != modref) {
            const msmeta = ctx?.meta?.multisource;
            const from = dirOf(null != msmeta?.path ? msmeta.path : popts?.path);
            const found = (0, mod_1.resolveModule)(modref, from, modFs(ctx), {
                // The user cache lives outside any confinement root, so it is
                // consulted only when nothing confines this evaluation. A
                // rooted profile sees the project's own `aon_vendor/` and
                // nothing else, which is what `root` means.
                ...(null == rootDir ? { cache: modCache(options) } : {}),
                eval: options.mod?.eval,
                depth: options.mod?.depth,
            });
            if (null != rootDir && outsideRoot(rootDir, found.full)) {
                deny(path);
            }
            record(ctx, found.full, 'mod');
            return {
                found: true, path, full: found.full,
                kind: 'aon', src: found.src, search: [],
            };
        }
        if (memCapability) {
            // A miss in the declared virtual set is NOT-FOUND, not denial:
            // the allowed mechanism ran and missed. Denial is reserved for a
            // capability refusing a mechanism outright.
            res.search = search.concat(res.search);
            return res;
        }
        search = search.concat(res.search);
        res = fileResolver(path, popts, rule, ctx, jsonic);
        res.path = path;
        if (res.found) {
            // `res.full` asserted non-null: a FOUND file resolution always
            // carries the absolute path it read (and the pkg leg below is the
            // same), so a runtime fallback arm would be dead code.
            const full = res.full;
            if (null != rootDir && outsideRoot(rootDir, full)) {
                deny(path);
            }
            // After the trust check, not before: a file outside the
            // confinement root is denied whatever it is called, and answering
            // "extension" there would say the file exists.
            gateExtension(path, full);
            // The warning window for the staged default flip (G5 phase 6):
            // under 'system', the CLI supplies trustWarn and the entry root,
            // and every resolution escaping that root names the flag a future
            // default will require.
            if (null == rootDir && null != options.trustWarn &&
                null != options.trustWarnRoot &&
                outsideRoot(options.trustWarnRoot, full)) {
                options.trustWarn('escape', full);
            }
            record(ctx, full, 'file');
            return res;
        }
        search = search.concat(res.search);
        if (null != rootDir) {
            // Package resolution is not part of the root capability; the
            // miss stands as not-found with the searched paths listed.
            res.search = search;
            return res;
        }
        res = pkgResolver(path, popts, rule, ctx, jsonic);
        res.path = path;
        if (res.found) {
            gateExtension(path, res.full);
            if (null != options.trustWarn) {
                options.trustWarn('pkg', res.full);
            }
            record(ctx, res.full, 'pkg');
            return res;
        }
        res.search = search.concat(res.search);
        return res;
    };
}
// THE SIGNATURE REGISTRY (docs/design/SIGNATURES.0.md). The call
// surface is DECLARED in test/spec/signature.tsv and parsed by the
// signature grammar (ts/src/sig.ts) from the build-time-inlined copy;
// the arity table and the positional set below are DERIVED from the
// parsed registry (funcSig, ts/src/sig.ts), so the declaration is the
// one source. go/func.go derives the same two tables from the same
// text.
// The functions whose comma-separated arguments are distinct POSITIONS
// rather than one argument list. See the func-paren handler above: this
// is the set whose comma group is expanded back into separate `peg`
// entries. Derived: two or more declared argument slots, excluding the
// residual producers (`constraint` results) -- the constraint atoms
// make the same expansion in their own constructor (`atomArgs`,
// ConstraintVal.ts, deliberately before the settled check), which is
// why they are not in this set; `must` is the load-bearing example.
// Arithmetic is here because `sub` is not commutative: `sub(a, b)`
// reaching the engine as one two-element list would lose which is
// which.
const POSITIONAL_ARG_FUNCS = {};
for (const name in sig_1.funcSig) {
    if (2 <= sig_1.funcSig[name].args.length && 'constraint' !== sig_1.funcSig[name].out) {
        POSITIONAL_ARG_FUNCS[name] = true;
    }
}
// [min, max]; a max of -1 is unbounded. Every name in funcMap has an
// entry, and the arity is a property of the language rather than of
// either port -- go/func.go derives the same table. A required slot
// counts toward the minimum; a rest slot makes the maximum unbounded
// and counts its group size (one, for a plain rest type) toward the
// minimum, which is what gives `match` its floor of three and `neq`
// its floor of one.
function sigArity(sig) {
    let min = 0;
    let max = 0;
    for (const a of sig.args) {
        if (true === a.rest) {
            min += undefined === a.group ? 1 : a.group.length;
            max = -1;
        }
        else {
            if (true !== a.opt) {
                min++;
            }
            if (-1 !== max) {
                max++;
            }
        }
    }
    return [min, max];
}
const funcArity = {};
for (const name in sig_1.funcSig) {
    funcArity[name] = sigArity(sig_1.funcSig[name]);
}
// writtenArgCount counts the arguments as the AUTHOR wrote them.
//
// It cannot simply be terms.length: a comma group reaches the func-paren
// handler as ONE term holding a raw array, so `upper("a","b")` and
// `upper(["a","b"])` both arrive as a single argument. They are still
// distinguishable, and that is what makes an arity check possible at
// all -- the comma group is a RAW array, while a written list literal
// has already been built into a ListVal by the list rule.
function writtenArgCount(terms) {
    if (1 === terms.length) {
        // `terms[0]` is re-read rather than reusing a narrowed local:
        // Array.isArray narrows an `any` to `any[]`, which then has no
        // `isVal` to test.
        const t = terms[0];
        if (Array.isArray(t) && true !== terms[0].isVal) {
            return t.length;
        }
    }
    return terms.length;
}
// arityText renders a built-in's permitted count for the error message.
// The fixed-arity case says "one" outright rather than counting: every
// fixed arity in the table IS one, and a phrasing for a count no entry
// carries would be untested prose pretending to be tested.
function arityText(lo, hi) {
    if (-1 === hi) {
        return 'one or more arguments';
    }
    if (lo !== hi) {
        return 0 === lo ? 'no arguments or one' : 'one argument or two';
    }
    // The {0,0} arm returned with the container kinds and acyclic()
    // (ADR-015): `map(1)` must not claim map takes exactly one.
    if (0 === hi) {
        return 'no arguments';
    }
    if (2 === hi) {
        return 'exactly two arguments';
    }
    return 'exactly one argument';
}
// rawToVal converts a raw parse node (or raw elements inside one) into
// the matching Val. Used for implicit top-level lists, whose nodes skip
// the aontu val rule conversions (mirrors asVal in go/lang.go; like
// there, source text is unavailable, so an integral number is an
// integer).
// The targeted parse hint for CUE-trained authors and models: `>` and
// `<` are not Aontu operators (the op-chars reservation stands), and an
// agent that emits `number > 0` should be redirected to the bound
// atoms, not left with a bare "unexpected character". Appended to a
// parse error's message when the source carries an unquoted `<` or
// `>`; the Go twin is opCharHint in go/lang.go, byte-identical text.
function opCharHint(src) {
    let q = '';
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if ('' !== q) {
            if (c === q && '\\' !== src[i - 1]) {
                q = '';
            }
            continue;
        }
        if ('"' === c || '\'' === c || '`' === c) {
            q = c;
        }
        else if ('<' === c || '>' === c) {
            return '\nThe > and < characters are not Aontu operators: write the ' +
                'bound functions min(x), max(x), above(x), below(x) instead.';
        }
    }
    return '';
}
function rawToVal(n) {
    if (true === n?.isVal) {
        return n;
    }
    if (Array.isArray(n)) {
        return new ListVal_1.ListVal({ peg: n.map(rawToVal) });
    }
    // THE SCALAR ARMS ARE WHERE A CONFIG FILE BECOMES VALUES. Every
    // format on the include table is read by its own parser into plain
    // JavaScript -- a string, a number, a map -- and this is the walk
    // that turns that into Vals (dataProcessor, ADR-012). The two arms
    // above are the other caller: a raw expression TERM, which the
    // expression grammar hands over already built.
    if (null == n) {
        return new NullVal_1.NullVal({ peg: null });
    }
    const t = typeof n;
    if ('string' === t) {
        return new StringVal_1.StringVal({ peg: n });
    }
    if ('number' === t) {
        // No source text here, so the "no '.'" condition is vacuous and the
        // integral + int64-range conditions decide (same helper as the val
        // rule, so the two paths cannot drift).
        return (0, numkind_1.isIntegerKind)(n) ?
            new IntegerVal_1.IntegerVal({ peg: n }) : new NumberVal_1.NumberVal({ peg: n });
    }
    if ('boolean' === t) {
        return new BooleanVal_1.BooleanVal({ peg: n });
    }
    // AND EVERYTHING ELSE IS A MAP, with no arm after it because there is
    // nothing after it. Every reader on the include table answers with
    // the JSON kinds and no others -- probed, including the two that
    // could plausibly escape them: a big integer comes back a `number`,
    // and a TOML date is normalised to its text before it gets here. The
    // one include that could hand over a function was `.js`, which
    // ADR-012 refuses. `parse_unknown` lived here for that case and has
    // no producer left in this port; the Go twin keeps its own, where the
    // type switch really can be handed something unaccounted for.
    const peg = {};
    for (const k in n) {
        peg[k] = rawToVal(n[k]);
    }
    return new MapVal_1.MapVal({ peg });
}
class Lang {
    constructor(options) {
        // const start = performance.now()
        this.opts = Object.assign((0, type_1.DEFAULT_OPTS)(), options);
        const modelResolver = makeModelResolver(this.opts);
        this.jsonic = jsonic_1.Jsonic.make();
        if (this.opts.debug) {
            this.jsonic.use(asPlugin(debug_1.Debug), {
                trace: this.opts.trace
            });
        }
        this.jsonic
            .use(asPlugin(multisource_1.MultiSource), {
            resolver: options?.resolver || modelResolver,
            // `.aon` is the preferred Aontu source extension; `.aontu` also
            // works. `.jsonic` is retired (no longer auto-resolved); the
            // default `['jsonic','jsc','json','js']` is overridden here.
            // (Upstream option name is the misspelled `implictExt`.)
            //
            // Only these two are SEARCHED for a bare `@"name"`; `.json` and
            // `.jsonld` are read when NAMED, which is how a vendored
            // vocabulary is always written.
            implictExt: ['aon', 'aontu'],
            // ONE ENTRY PER EXTENSION THE TABLE NAMES, built from it (see
            // includeProcessors) so the rule and its wiring cannot drift.
            //
            // The upstream defaults are REPLACED, not extended. Its `json`
            // entry is what made that extension the one that crashed: it
            // hands back a raw JS object where the aontu grammar produces
            // Vals, and the tree then met a value it could not convert
            // (BUGS §49b). Its `js` entry EXECUTES the file, which is not
            // something an extension should be able to ask for. And its
            // fallback hands any other file back as TEXT.
            processor: includeProcessors()
        })
            .use(AontuJsonic);
    }
    parse(src, opts) {
        // const start = performance.now()
        // JSONIC-UPDATE - check meta
        let jm = {
            fs: opts?.fs,
            fileName: opts?.path ?? this.opts.path,
            multisource: {
                path: opts?.path ?? this.opts.path,
                deps: (opts && opts.deps) || undefined
            },
            // The include-manifest sink (G5, docs/trust.md): the resolver
            // records every resolved include here, and the plugin's
            // child-meta spread carries the same array to nested includes.
            aontu: {
                manifest: opts?.manifest,
            },
        };
        if (null != opts?.idcount) {
            this.idcount = opts.idcount;
        }
        // Pass through Jsonic debug log value
        if (opts && null != opts.log && Number.isInteger(opts.log)) {
            jm.log = opts.log;
        }
        // jm.log = -1
        let val;
        try {
            val = this.jsonic(src, jm);
            // An implicit top-level list (`a b`, `1,2`) is built by the core
            // jsonic grammar without passing through the aontu val/list rules,
            // so the root (and its elements) arrive as raw JS values. Convert
            // them the same way the Go port's asVal post-walk does.
            if (null != val && true !== val.isVal) {
                val = rawToVal(val);
            }
        }
        catch (e) {
            if ('include_denied' === e?.code || 'include_extension' === e?.code ||
                mod_1.MODULE_REFUSAL_CODES.has(e?.code)) {
                // A denied include (G5), an include whose extension is not read
                // as Aontu source (ADR-012, INCLUDE_KINDS), and a module that is
                // missing, fails its pin, or names a path that escapes its store
                // (G6 phase 2) are refused the same way, for the same reason: the
                // resolver THROWS so a bare-member include cannot vanish in the
                // merge, and the code survives here as the parse-stage nil the
                // registry pins (errcodes.tsv).
                val = new NilVal_1.NilVal({
                    why: 'parse',
                    err: new NilVal_1.NilVal({
                        why: e.code,
                        msg: e.message,
                        err: e,
                    })
                });
            }
            else if (e instanceof jsonic_1.JsonicError || 'JsonicError' === e.constructor.name) {
                const syntax = new NilVal_1.NilVal({
                    why: 'syntax',
                    msg: e.message + opCharHint(src),
                    err: e,
                });
                // THE POSITION TRAVELS WITH IT. The parser knows exactly where
                // it stopped -- it draws a caret there -- and the rendered
                // message carried the only copy, so `vet --format json`
                // reported row -1, col -1 for a document whose fault the human
                // renderer located to the character. A machine-readable report
                // that says "somewhere in this file" is the one a repair loop
                // can do nothing with. Both numbers are already 1-based here,
                // which is the base a site uses (go/lang.go does the same).
                if ('number' === typeof e.lineNumber) {
                    syntax.site.row = e.lineNumber;
                }
                if ('number' === typeof e.columnNumber) {
                    syntax.site.col = e.columnNumber;
                }
                val = new NilVal_1.NilVal({ why: 'parse', err: syntax });
            }
            else {
                throw e;
            }
        }
        return val;
    }
} /* node:coverage ignore next 6 */
exports.Lang = Lang;
//# sourceMappingURL=lang.js.map
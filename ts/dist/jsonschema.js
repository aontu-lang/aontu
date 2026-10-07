"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonSchema = jsonSchema;
/* Copyright (c) 2025 Richard Rodger, MIT License */
const utility_1 = require("./utility");
const aontu_1 = require("./aontu");
const err_1 = require("./err");
const aliasname_1 = require("./aliasname");
const alias_1 = require("./alias");
const BagVal_1 = require("./val/BagVal");
const RecurseVal_1 = require("./val/RecurseVal");
const sig_1 = require("./sig");
const unify_1 = require("./unify");
const top_1 = require("./val/top");
const keyorder_1 = require("./keyorder");
const ConstraintVal_1 = require("./val/ConstraintVal");
const Decimal_1 = require("./val/Decimal");
const numcmp_1 = require("./val/numcmp");
const numkind_1 = require("./val/numkind");
const vet_1 = require("./vet");
const vet_2 = require("./vet");
const jsonschema_import_1 = require("./jsonschema-import");
const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const RAW = JSON;
function pathText(path) {
    return '$' + (0 < path.length ? '.' + path.join('.') : '');
}
function lose(ctx, path, construct, reason) {
    ctx.lossy.push({ path: pathText(path), construct, reason });
}
const KIND_TYPE = {
    String: 'string',
    Boolean: 'boolean',
    Integer: 'integer',
    BigInteger: 'integer',
    Float: 'number',
    BigDecimal: 'number',
    Number: 'number',
    Path: 'string',
    Null: 'null',
};
const ALL = ['integer', 'float', 'biginteger', 'bigdecimal'];
const PLAIN_READ = ['integer', 'float'];
const KIND_LEAVES = {
    Integer: ['integer'],
    Float: ['float'],
    BigInteger: ['biginteger'],
    BigDecimal: ['bigdecimal'],
    Number: ALL,
};
const KIND_LOSS = {
    Integer: 'the schema says "integer" and admits a JSON spelling such as ' +
        '1.0, which vet reads as a float and the integer leaf refuses',
    Float: 'the schema says "number" and admits a JSON spelling such as 1, ' +
        'which vet reads as an integer and the float leaf refuses',
    BigInteger: 'the schema says "integer" and admits every JSON integer, ' +
        'which vet reads as an integer or a float, never as the biginteger leaf',
    BigDecimal: 'the schema says "number" and admits every JSON number, ' +
        'which vet reads as an integer or a float, never as the bigdecimal leaf',
};
const EXACT_KIND_LOSS = {
    Integer: 'the schema says "integer" and admits an integral JSON number ' +
        'beyond the integer leaf, which vet --exact-numbers reads as a ' +
        'biginteger and the integer leaf refuses',
    Float: 'the schema says "number" and admits every JSON number, which vet ' +
        '--exact-numbers reads by its value, never as a float',
    BigInteger: 'the schema says "integer" and admits an integral JSON number ' +
        'the integer leaf holds, which vet --exact-numbers reads as an integer ' +
        'and the biginteger leaf refuses',
    BigDecimal: 'the schema says "number" and admits an integral JSON number, ' +
        'which vet --exact-numbers reads as an integer or a biginteger and the ' +
        'bigdecimal leaf refuses',
};
const EXACT_LITERAL_REASON = 'the schema admits this value in every JSON spelling, ' +
    'which vet reads as an integer or a float, never as the exact leaf; the ' +
    'digits are written exactly';
const LITERAL_LOSS = {
    integer: 'the schema admits the float spelling of this value, which vet ' +
        'reads as a float and the integer leaf refuses',
    float: 'the schema admits the integer spelling of this value, which vet ' +
        'reads as an integer and the float leaf refuses',
    biginteger: EXACT_LITERAL_REASON,
    bigdecimal: EXACT_LITERAL_REASON,
};
// An integer literal is always a value the integer leaf holds, so under
// the exact reading it is never lone.
const EXACT_LITERAL_LOSS = {
    integer: '',
    float: 'the schema admits this value, which vet --exact-numbers reads by ' +
        'its value, never as a float',
    biginteger: 'the schema admits this value, which vet --exact-numbers reads ' +
        'as an integer, and the biginteger leaf refuses it',
    bigdecimal: 'the schema admits this integral value, which vet ' +
        '--exact-numbers reads as an integer or a biginteger, and the ' +
        'bigdecimal leaf refuses it',
};
function leafOf(v) {
    return true === v.isInteger ? 'integer' :
        true === v.isNumber ? 'float' :
            true === v.isBigInteger ? 'biginteger' :
                true === v.isBigDecimal ? 'bigdecimal' : undefined;
}
function readings(ctx, v) {
    const s = (0, numcmp_1.scaledOfNumeric)(v);
    if (!(0, numcmp_1.scaledIsIntegral)(s)) {
        return ctx.exact ? ['bigdecimal'] : ['float'];
    }
    if (!ctx.exact) {
        return PLAIN_READ;
    }
    return (0, numkind_1.isIntegerStorable)((0, numcmp_1.scaledFloor)(s)) ? ['integer'] : ['biginteger'];
}
// A preference with nothing to generate, as `*any` has, is dropped from
// the document, so the schema does not ask for it.
function dropped(v) {
    if (true !== v.isPref) {
        return false;
    }
    const ctx = new aontu_1.Aontu().ctx({ collect: true });
    return undefined === v.gen(ctx) && 0 === ctx.err.length;
}
// An integer past 2^53 is held as the double equal to it, whose shortest
// spelling is another integer.
function jsonOf(v) {
    return true === v.isBigInteger || true === v.isBigDecimal ?
        RAW.rawJSON(v.peg.toString()) :
        true === v.isInteger && !Number.isSafeInteger(v.peg) ?
            RAW.rawJSON(BigInt(v.peg).toString()) : v.peg;
}
function sameJSON(a, b) {
    return undefined !== leafOf(a) && undefined !== leafOf(b) ?
        0 === (0, numcmp_1.cmpNumeric)(a, b) : a.peg === b.peg;
}
// One entry per JSON value, in written order, with every leaf the value
// is written in.
function groups(members) {
    const out = [];
    for (const m of members) {
        let g = out.find((x) => sameJSON(x.v, m));
        if (undefined === g) {
            g = { v: m, leaves: [] };
            out.push(g);
        }
        const leaf = leafOf(m);
        if (undefined !== leaf && !g.leaves.includes(leaf)) {
            g.leaves.push(leaf);
        }
    }
    return out;
}
// The first number with an admitted JSON spelling no member is written
// in: there the schema and the model disagree.
function lone(ctx, gs, admitted) {
    return gs.find((g) => undefined !== leafOf(g.v) && readings(ctx, g.v)
        .some((r) => admitted.includes(r) && !g.leaves.includes(r)))?.v;
}
function loseLiterals(ctx, path, gs) {
    const v = lone(ctx, gs, ALL);
    if (undefined !== v) {
        const leaf = leafOf(v);
        lose(ctx, path, ('integer' === leaf || 'float' === leaf ? leaf : 'exact') + ' literal', (ctx.exact ? EXACT_LITERAL_LOSS : LITERAL_LOSS)[leaf]);
    }
}
function loseKind(ctx, path, kind) {
    const reason = (ctx.exact ? EXACT_KIND_LOSS : KIND_LOSS)[kind?.name];
    if (undefined !== reason) {
        lose(ctx, path, kind.name.toLowerCase(), reason);
    }
}
// A path is its address string at the JSON boundary, and the schema
// cannot say which strings are addresses.
function losePath(ctx, path) {
    lose(ctx, path, 'path', 'a path admits only path values, but JSON Schema has no path type; ' +
        'the schema says "string" and admits any string here');
}
function scalarType(v) {
    if (v.isBigDecimal) {
        return 'number';
    }
    if (v.isInteger || v.isBigInteger) {
        return 'integer';
    }
    const t = typeof v.peg;
    return 'number' === t ? 'number' : 'boolean' === t ? 'boolean' : 'string';
}
function allOf(out, part) {
    out.allOf = [...(out.allOf ?? []), part];
}
function bound(ctx, path, out, b, key, openKey, atom, openAtom) {
    if (null == b) {
        return;
    }
    if (true === b.v.isString) {
        lose(ctx, path, b.open ? openAtom : atom, 'JSON Schema has no ordering keyword for strings, so this bound is ' +
            'DROPPED and the schema admits strings outside it');
        return;
    }
    out[b.open ? openKey : key] = jsonOf(b.v);
}
const COUNT_KEYS = {
    string: ['minLength', 'maxLength'],
    map: ['minProperties', 'maxProperties'],
    list: ['minItems', 'maxItems'],
};
// The integer a count bound admits at its edge: counts are whole, so an
// open or fractional bound moves to the nearest whole count inside it.
function countEdge(b, upper) {
    const s = (0, numcmp_1.scaledOfNumeric)(b.v);
    const whole = (0, numcmp_1.scaledIsIntegral)(s);
    const floor = (0, numcmp_1.scaledFloor)(s);
    return Number(upper ? (b.open && whole ? floor - 1n : floor) :
        (b.open || !whole ? floor + 1n : floor));
}
function count(ctx, path, out, n, kind) {
    const [lo, hi] = COUNT_KEYS[kind ?? 'list'];
    out[lo] = countEdge(n.lo, false);
    if (null != n.hi) {
        out[hi] = countEdge(n.hi, true);
    }
    // A count is an integer leaf, so only an integer exclusion meets one.
    for (const x of n.neqs) {
        if (true === x.isInteger) {
            allOf(out, { not: { [lo]: x.peg, [hi]: x.peg } });
        }
    }
    if (undefined === kind) {
        lose(ctx, path, 'len', 'a count with no domain is exported as minItems/maxItems; ' +
            'JSON Schema has no keyword that counts a string OR a container');
    }
}
function elementLeaves(e) {
    if (true === e.isScalar) {
        const leaf = leafOf(e);
        return undefined === leaf ? [] : [leaf];
    }
    if (true === e.isScalarKind) {
        return KIND_LEAVES[e.peg?.name] ?? [];
    }
    if (true === e.isConstraint && null == e.count) {
        return KIND_LEAVES[e.kind?.name] ?? ('string' === e.domain ? [] : ALL);
    }
    if (true === e.isEmptyConstraint) {
        return [];
    }
    if (true === e.isDisjunct && Array.isArray(e.peg)) {
        const all = e.peg.map(elementLeaves);
        return all.includes(undefined) ? undefined :
            [...new Set(all.flat())];
    }
    return undefined;
}
// unique() tells an integer from a float of the same value and
// uniqueItems does not, so they agree only on a list that cannot hold
// both.
function uniqueExact(ctx, bag) {
    if (true !== bag?.isList) {
        return false;
    }
    // Read by value, JSON numbers equal in value are one aontu value.
    if (ctx.exact) {
        return true;
    }
    const spr = bag.spread?.cj;
    if (null == spr && true !== bag.closed) {
        return false;
    }
    const leaves = new Set();
    for (const e of null == spr ? bag.peg : [spr, ...bag.peg]) {
        const ls = elementLeaves(e);
        if (undefined === ls) {
            return false;
        }
        ls.filter((l) => PLAIN_READ.includes(l)).forEach((l) => leaves.add(l));
    }
    return leaves.size <= 1;
}
function fromConstraint(ctx, path, c, bag) {
    const out = {};
    if (null != c.invalid) {
        ctx.failed = ctx.failed ?? c;
        return out;
    }
    if (null != c.kind && null != KIND_TYPE[c.kind.name]) {
        out.type = KIND_TYPE[c.kind.name];
        loseKind(ctx, path, c.kind);
    }
    else if ('string' === c.domain) {
        out.type = 'string';
    }
    else if ('number' === c.domain) {
        out.type = 'number';
    }
    bound(ctx, path, out, c.lo, 'minimum', 'exclusiveMinimum', 'min', 'above');
    bound(ctx, path, out, c.hi, 'maximum', 'exclusiveMaximum', 'max', 'below');
    if (0 < c.neqs.length) {
        const gs = groups(c.neqs);
        out.not = { enum: gs.map((g) => jsonOf(g.v)) };
        if (undefined !== lone(ctx, gs, KIND_LEAVES[c.kind?.name] ?? ALL)) {
            lose(ctx, path, 'neq', 'the schema refuses every JSON spelling of an excluded number, and ' +
                'neq excludes only the leaves it names, so the model admits a ' +
                'spelling the schema refuses');
        }
    }
    for (const m of c.mults) {
        if (1 === c.mults.length) {
            out.multipleOf = jsonOf(m);
        }
        else {
            allOf(out, { multipleOf: jsonOf(m) });
        }
    }
    for (const r of c.res) {
        if (1 === c.res.length) {
            out.pattern = r.norm;
        }
        else {
            allOf(out, { pattern: r.norm });
        }
    }
    for (const f of c.fmts) {
        if (1 === c.fmts.length) {
            out.format = f;
        }
        else {
            allOf(out, { format: f });
        }
        lose(ctx, path, 'format', 'the default dialect reads format ' +
            JSON.stringify(f) + ' as an annotation, so the schema admits a ' +
            'string the model refuses');
    }
    if (null != c.count) {
        count(ctx, path, out, c.count, 'string' === c.domain ? 'string' :
            true === bag?.isMap ? 'map' : true === bag?.isList ? 'list' : undefined);
    }
    if (true === c.nonEmpty && true !== c.emptyOk && !(1 <= out.minLength)) {
        out.minLength = 1;
    }
    if (true === c.pathKind) {
        losePath(ctx, path);
    }
    if (c.uniq) {
        out.uniqueItems = true;
        if (!uniqueExact(ctx, bag)) {
            lose(ctx, path, 'unique', 'uniqueItems compares numbers by value, so the schema refuses a list ' +
                'such as [1, 1.0], which unique() admits because vet reads the two ' +
                'as different leaves');
        }
    }
    for (const key of c.uniqBy) {
        lose(ctx, path, 'unique(' + key + ')', 'JSON Schema has no uniqueness-by-property keyword; uniqueItems ' +
            'compares whole items, so this constraint is DROPPED and the ' +
            'schema admits records sharing a `' + key + '`');
    }
    if (0 < c.musts.length) {
        lose(ctx, path, 'must', 'an evaluate-only check is opaque by construction -- it carries ' +
            'the author\'s own message and the algebra never reasons about ' +
            'it -- so it is DROPPED and the schema admits values `vet` refuses');
    }
    for (const n of c.nofs) {
        nofKeyword(ctx, path, out, n);
    }
    for (const w of c.whens) {
        whenKeyword(ctx, path, out, w);
    }
    for (const a of c.contains) {
        containsKeyword(ctx, path, out, a, bag);
    }
    for (const r of c.rests) {
        restKeyword(ctx, path, out, r, bag);
    }
    return out;
}
// What no cover reaches as the keyword that reads the unevaluated
// members of the container it stands beside, both where the container's
// kind is not known. Each is a mark until settleRests decides it.
function restKeyword(ctx, path, out, r, bag) {
    const t = fromVal(ctx, path, r.t);
    const kws = true === bag?.isMap ? ['unevaluatedProperties'] :
        true === bag?.isList ? ['unevaluatedItems'] :
            ['unevaluatedProperties', 'unevaluatedItems'];
    const group = { lost: false };
    for (const kw of kws) {
        const mark = new RestMark(r, t, kw, path, ctx.base, group);
        ctx.rests.push(mark);
        if (undefined === out[kw]) {
            out[kw] = mark;
        }
        else {
            const arm = { [kw]: mark };
            ctx.restArms.add(arm);
            allOf(out, arm);
        }
    }
}
class RestMark {
    constructor(r, t, kw, path, base, group) {
        this.r = r;
        this.t = t;
        this.kw = kw;
        this.path = path;
        this.base = base;
        this.group = group;
    }
    toJSON() {
        return ['rest', this.kw, (0, ConstraintVal_1.restCanon)(this.r)];
    }
}
function reachedNone() {
    return { all: false, names: new Set(), pats: new Set(), prefix: 0n,
        items: new Set(), conds: [] };
}
function reachedAdd(a, b) {
    a.all = a.all || b.all;
    b.names.forEach((n) => a.names.add(n));
    b.pats.forEach((p) => a.pats.add(p));
    a.prefix = a.prefix < b.prefix ? b.prefix : a.prefix;
    b.items.forEach((i) => a.items.add(i));
    a.conds.push(...b.conds);
    return a;
}
function reachedEmpty(r) {
    return !r.all && 0 === r.names.size && 0 === r.pats.size &&
        0n === r.prefix && 0 === r.items.size && 0 === r.conds.length;
}
function reachedText(r) {
    const sorted = (xs) => [...new Set(xs)].sort(keyorder_1.cmpCodePoint);
    return r.all ? '"all"' : JSON.stringify([sorted(r.names), sorted(r.pats),
        r.prefix.toString(), sorted(r.items), sorted(r.conds.map(([t, a, b]) => JSON.stringify([t, reachedText(a), reachedText(b)])))]);
}
const IN_PLACE = ['allOf', 'anyOf', 'oneOf'];
const IN_PLACE_ONE = ['not', 'if', 'then', 'else'];
const CHILD_ONE = ['additionalProperties', 'items', 'contains',
    'propertyNames', 'unevaluatedProperties', 'unevaluatedItems'];
function isSchemaObj(s) {
    return null != s && 'object' === typeof s && !Array.isArray(s) &&
        !(s instanceof RestMark);
}
// The container kinds a schema object can hold for: its `type` and its
// allOf arms' narrow what it and its in-place subschemas apply to.
function containerKinds(s) {
    const t = Array.isArray(s.type) ? s.type :
        undefined === s.type ? undefined : [s.type];
    return ['map', 'list'].filter((k) => undefined === t ||
        t.includes('map' === k ? 'object' : 'array'));
}
function restSites(s, scope, kinds) {
    if (!isSchemaObj(s)) {
        return;
    }
    const now = [s, ...(Array.isArray(s.allOf) ? s.allOf : [])]
        .filter(isSchemaObj).reduce((ks, x) => ks.filter((k) => containerKinds(x).includes(k)), scope);
    kinds.set(s, new Set([...(kinds.get(s) ?? []), ...now]));
    const full = ['map', 'list'];
    for (const kw of ['unevaluatedProperties', 'unevaluatedItems']) {
        if (s[kw] instanceof RestMark) {
            restSites(s[kw].t, full, kinds);
        }
    }
    IN_PLACE.forEach((k) => (Array.isArray(s[k]) ? s[k] : [])
        .forEach((x) => restSites(x, now, kinds)));
    IN_PLACE_ONE.forEach((k) => restSites(s[k], now, kinds));
    Object.values(isSchemaObj(s.dependentSchemas) ? s.dependentSchemas : {})
        .forEach((x) => restSites(x, now, kinds));
    for (const k of ['properties', 'patternProperties']) {
        Object.values(isSchemaObj(s[k]) ? s[k] : {})
            .forEach((x) => restSites(x, full, kinds));
    }
    CHILD_ONE.forEach((k) => restSites(s[k], full, kinds));
    (Array.isArray(s.prefixItems) ? s.prefixItems : [])
        .forEach((x) => restSites(x, full, kinds));
}
// What an object of the written schema evaluates in place. A schema met
// again on its own path adds nothing it has not already added.
function evaluated(ctx, defs, s, kind, own, path) {
    const out = reachedNone();
    if (!isSchemaObj(s) || path.has(s)) {
        return out;
    }
    path.add(s);
    const sub = (x) => evaluated(ctx, defs, x, kind, false, path);
    const unevaluated = 'map' === kind ? 'unevaluatedProperties' :
        'unevaluatedItems';
    out.all = (!own && undefined !== s[unevaluated]) ||
        undefined !== s['map' === kind ? 'additionalProperties' : 'items'];
    if ('map' === kind) {
        Object.keys(s.properties ?? {}).forEach((n) => out.names.add(n));
        Object.keys(s.patternProperties ?? {}).forEach((p) => out.pats.add(p));
    }
    else {
        out.prefix = BigInt((s.prefixItems ?? []).length);
        if (undefined !== s.contains) {
            out.items.add(schemaText(s.contains));
        }
    }
    for (const x of [...(s.allOf ?? []), ...['$ref', '$dynamicRef']
            .map((kr) => defs.get(ctx.refKeys.get(s[kr])))]) {
        reachedAdd(out, sub(x));
    }
    const conds = [
        ...['anyOf', 'oneOf'].flatMap((k) => (s[k] ?? []).map((x) => [x, sub(x), reachedNone()])),
        ...Object.entries(s.dependentSchemas ?? {}).map(([k, x]) => [{ type: 'object', properties: { [k]: {} }, required: [k] }, sub(x),
            reachedNone()]),
        ...(undefined === s.if ? [] :
            [[s.if, reachedAdd(sub(s.if), sub(s.then)), sub(s.else)]]),
    ];
    for (const [t, a, b] of conds) {
        if (!reachedEmpty(a) || !reachedEmpty(b)) {
            out.conds.push([schemaText(t), a, b]);
        }
    }
    path.delete(s);
    return out;
}
// What a rest() atom's covers reach, in the terms of the written schema;
// undefined where JSON Schema has no keyword that reaches the same.
function covered(ctx, m, kind) {
    const scratch = {
        ...ctx, lossy: [], failed: undefined, base: m.base,
        defs: new Map(ctx.defs), names: new Map(ctx.names),
        addr: new Map(ctx.addr), anchors: new Set(ctx.anchors),
        dynamics: new Map(ctx.dynamics), refKeys: new Map(ctx.refKeys),
        rests: [], restArms: new Set(),
    };
    return coverPairs(scratch, m.path, m.r.covers, kind, reachedNone());
}
function coverPairs(ctx, path, covers, kind, out) {
    for (const c of covers) {
        const rec = recordReach(ctx, path, c.rec, kind);
        const alt = undefined === c.rec.else || true === c.trial.isTop ?
            reachedNone() : recordReach(ctx, path, c.rec.else, kind);
        if (undefined === rec || undefined === alt) {
            return undefined;
        }
        if (true === c.trial.isTop) {
            reachedAdd(out, rec);
        }
        else if (!reachedEmpty(rec) || !reachedEmpty(alt)) {
            out.conds.push([schemaText(fromVal(ctx, path, c.trial)), rec, alt]);
        }
    }
    return out;
}
function recordReach(ctx, path, rec, kind) {
    const out = reachedNone();
    for (const k of undefined === rec.keys ? [] : true === rec.keys.isDisjunct ?
        disjuncts(rec.keys) : [rec.keys]) {
        const p = lonePattern(k);
        if (true === k.isTop) {
            out.all = true;
        }
        else if ('map' === kind && (true === k.isString || undefined !== p)) {
            (true === k.isString ? out.names : out.pats).add(p ?? k.peg);
        }
        else if (true !== k.isString || /^(0|[1-9][0-9]*)$/.test(k.peg)) {
            return undefined;
        }
    }
    if ('list' === kind && undefined !== rec.prefix) {
        out.prefix = rec.prefix;
    }
    if (undefined !== rec.items) {
        if (true === rec.items.isTop) {
            out.all = true;
        }
        else if ('map' === kind) {
            return undefined;
        }
        else {
            out.items.add(schemaText(fromVal(ctx, path, rec.items)));
        }
    }
    return coverPairs(ctx, path, rec.covers, kind, out);
}
// JSON Schema's unevaluated keywords read what the object they stand in
// evaluates, which the export may spell otherwise than the covers say:
// each mark is written only where the two agree, and dropped as a loss
// elsewhere, until no further mark drops; a mark is never needed where
// its kind cannot reach, nor where its covers reach every member.
function settleRests(ctx, body) {
    if (0 === ctx.rests.length) {
        return;
    }
    const full = ['map', 'list'];
    const seen = new Map();
    restSites(body, full, seen);
    ctx.defs.forEach((d) => restSites(d, full, seen));
    const defs = new Map(ctx.defs).set(ROOT_DEF, body);
    const kindOf = (kw) => 'unevaluatedProperties' === kw ? 'map' : 'list';
    const wants = new Map();
    const emptied = new Set();
    const sites = [];
    for (const [s, scope] of seen) {
        for (const kw of ['unevaluatedProperties', 'unevaluatedItems']) {
            const m = s[kw];
            if (!(m instanceof RestMark)) {
                continue;
            }
            if (!wants.has(m)) {
                wants.set(m, covered(ctx, m, kindOf(kw)));
            }
            if (!scope.has(kindOf(kw)) || true === m.r.t.isTop ||
                true === wants.get(m)?.all) {
                delete s[kw];
                emptied.add(s);
            }
            else {
                sites.push([s, m]);
            }
        }
    }
    for (let drop = true; drop;) {
        const out = sites.filter(([s, m]) => m.kw in s && !sameReach(wants.get(m), evaluated(ctx, defs, s, kindOf(m.kw), true, new Set())));
        out.forEach(([s, m]) => {
            delete s[m.kw];
            emptied.add(s);
            m.group.lost = true;
        });
        drop = 0 < out.length;
    }
    for (const [s, m] of sites) {
        if (m.kw in s) {
            s[m.kw] = m.t;
        }
    }
    for (const s of seen.keys()) {
        if (Array.isArray(s.allOf)) {
            const arms = s.allOf.filter((a) => 0 < Object.keys(a).length ||
                !(ctx.restArms.has(a) || emptied.has(a)));
            if (0 === arms.length) {
                delete s.allOf;
            }
            else {
                s.allOf = arms;
            }
        }
    }
    const told = new Set();
    for (const m of ctx.rests) {
        if (m.group.lost && !told.has(m.group)) {
            told.add(m.group);
            lose(ctx, m.path, 'rest', 'unevaluatedProperties and unevaluatedItems read the members the ' +
                'schema beside them does not evaluate in place, and the members ' +
                'this rest() reaches are not those, so it is DROPPED and the ' +
                'schema admits values `vet` refuses');
        }
    }
}
function sameReach(a, b) {
    return undefined !== a && reachedText(a) === reachedText(b);
}
// A member count as contains and its endpoints, an excluded count as the
// `not` of that count alone, as `len` writes one.
function containsKeyword(ctx, path, out, a, bag) {
    const schema = fromVal(ctx, path, a.c);
    const lo = countEdge(a.count.lo, false);
    const kw = {
        contains: schema,
        ...(1 === lo ? {} : { minContains: lo }),
        ...(null == a.count.hi ? {} : { maxContains: countEdge(a.count.hi, true) }),
    };
    if (undefined === out.contains) {
        Object.assign(out, kw);
    }
    else {
        allOf(out, kw);
    }
    for (const x of a.count.neqs) {
        if (true === x.isInteger) {
            allOf(out, { not: { contains: schema, minContains: x.peg, maxContains: x.peg } });
        }
    }
    if (true !== bag?.isList) {
        lose(ctx, path, 'contains', 'JSON Schema reads contains on an array alone, so the schema admits a ' +
            'scalar or an object that contains() refuses');
    }
}
// A conditional as the keywords its shape spells: a condition asking only
// that one key be present is a dependency, and any other is `if`.
function whenKeyword(ctx, path, out, w) {
    const keys = undefined === w.e ? presentKeys(w.c) : undefined;
    if (1 === keys?.length) {
        const names = presentKeys(w.t);
        const kw = undefined === names ? 'dependentSchemas' : 'dependentRequired';
        const v = names ?? fromVal(ctx, path, w.t);
        if (undefined === out[kw]?.[keys[0]]) {
            out[kw] = { ...(out[kw] ?? {}), [keys[0]]: v };
        }
        else {
            allOf(out, { [kw]: { [keys[0]]: v } });
        }
        return;
    }
    const schema = {
        if: fromVal(ctx, path, w.c),
        then: fromVal(ctx, path, w.t),
        ...(undefined === w.e ? {} : { else: fromVal(ctx, path, w.e) }),
    };
    if (undefined === out.if) {
        Object.assign(out, schema);
    }
    else {
        allOf(out, schema);
    }
}
// The keys a plain map asks to be present, and nothing more of them.
function presentKeys(v) {
    if (true !== v?.isMap || v.closed || null != v.spread?.cj ||
        0 < v.optionalKeys.length) {
        return undefined;
    }
    const keys = Object.keys(v.peg).sort(keyorder_1.cmpCodePoint);
    return 0 < keys.length && keys.every((k) => true === v.peg[k].isTop) ?
        keys : undefined;
}
// A count of admitting branches as the keyword that counts the same:
// none of them, exactly one, any, or all.
function nofKeyword(ctx, path, out, n) {
    const k = n.branches.length;
    const counts = (0, ConstraintVal_1.nofCounts)(n);
    const from = (lo) => counts.length === k - lo + 1 && lo === counts[0];
    const put = (kw, v) => {
        if (undefined === out[kw]) {
            out[kw] = v;
        }
        else {
            allOf(out, { [kw]: v });
        }
    };
    const schemas = () => n.branches.map((b) => fromVal(ctx, path, b));
    if (from(0)) {
        return;
    }
    if (0 === counts.length) {
        put('not', {});
    }
    else if (1 === counts.length && 0 === counts[0]) {
        put('not', 1 === k ? schemas()[0] : { anyOf: schemas() });
    }
    else if (1 === counts.length && 1 === counts[0]) {
        put('oneOf', schemas());
    }
    else if (from(1)) {
        put('anyOf', schemas());
    }
    else if (1 === counts.length && k === counts[0]) {
        schemas().forEach((s) => allOf(out, s));
    }
    else {
        lose(ctx, path, 'nof', 'nof counts the alternatives that admit a value, and JSON Schema ' +
            'counts none, one, any or all of them; this count is none of those, ' +
            'so it is DROPPED and the schema admits values `vet` refuses');
    }
}
function fromVal(ctx, path, v) {
    const key = aliasKey(ctx, v);
    if (undefined !== key) {
        return useOf(ctx, path, key, v.meta?.dynamicRef);
    }
    const out = fromValInner(ctx, path, v);
    return 'object' === typeof out && (0, utility_1.hasRiders)(v) ?
        annotate(ctx, path, out, v) : out;
}
const DEPRECATION_TEXT = ['msg', 'use', 'since'];
const META_KEYWORD = [
    ['title', 'title'], ['description', 'description'], ['comment', '$comment'],
    ['default', 'default'], ['examples', 'examples'], ['readOnly', 'readOnly'],
    ['writeOnly', 'writeOnly'], ['format', 'format'],
    ['contentEncoding', 'contentEncoding'],
    ['contentMediaType', 'contentMediaType'], ['contentSchema', 'contentSchema'],
];
// A value's riders as the annotations they are: each first value on the
// schema object itself, and every further one, or one whose keyword the
// object already spells otherwise, in an annotation-only subschema under
// allOf, which the draft collects the same.
function annotate(ctx, path, out, v) {
    const meta = v.meta ?? {};
    const dep = v.deprecation;
    const layers = [{ ...out }];
    const place = (from, k, x) => {
        let n = from;
        for (; Object.prototype.hasOwnProperty.call(layers[n] ?? {}, k); n++) {
            if (schemaText(layers[n][k]) === schemaText(x)) {
                return;
            }
        }
        (layers[n] ??= {})[k] = x;
    };
    for (const [key, keyword] of META_KEYWORD) {
        (meta[key] ?? []).forEach((m, i) => place(i, keyword, generated(m)));
    }
    (meta.x ?? []).forEach((m, i) => {
        for (const k of Object.keys(m.peg)) {
            if ((0, jsonschema_import_1.isKeyword)(k)) {
                lose(ctx, path, 'meta', 'x holds ' + k + ', a name 2020-12 reads ' +
                    'as its own, so it cannot cross as an unknown keyword; it is ' +
                    'dropped, and what the schema admits is unchanged');
            }
            else {
                place(i, k, generated(m.peg[k]));
            }
        }
    });
    if (null != dep) {
        const depth = Math.max(1, ...Object.values(dep).map((l) => l.length));
        for (let i = 0; i < depth; i++) {
            place(i, 'deprecated', true);
            const said = DEPRECATION_TEXT.filter((k) => i < (dep[k] ?? []).length);
            if (0 < said.length) {
                place(i, jsonschema_import_1.DEPRECATE_KEY, Object.fromEntries(said.map((k) => [k, dep[k][i]])));
            }
        }
    }
    layers.slice(1).forEach((l) => allOf(layers[0], l));
    return layers[0];
}
// An alias's copy, unchanged, a recursion back into a definition, or a
// reference a template holds, is written once under $defs and referred
// to wherever it is used: the key of its definition.
function aliasKey(ctx, v) {
    let target;
    if (true === v?.isRecurse) {
        target = v.target;
    }
    else if (true === v?.isRef && v.absolute && 0 < v.peg.length &&
        v.peg.every((p) => 'string' === typeof p && '' !== p)) {
        target = v.peg;
    }
    else if (null != v?.aliasOrigin && sameCopy((0, RecurseVal_1.walkTarget)(ctx.root, [v.aliasOrigin]), v)) {
        target = [v.aliasOrigin];
    }
    if (undefined !== target && ctx.anchor.length === target.length &&
        target.every((s, i) => s === ctx.anchor[i])) {
        return ROOT_DEF;
    }
    const body = undefined === target ? undefined : (0, RecurseVal_1.walkTarget)(ctx.root, target);
    if (undefined === target || undefined === body) {
        return undefined;
    }
    const at = target.map(aliasname_1.aliasPathSegment);
    const id = JSON.stringify(target);
    let key = ctx.names.get(id);
    if (undefined === key) {
        const ident = single(ctx, at, body.identity);
        const base = ident.key ?? at.join('.').replace(/^%/, '');
        key = base;
        for (let n = 2; ctx.defs.has(key) || ROOT_DEF === key; n++) {
            key = base + '-' + n;
        }
        ctx.names.set(id, key);
        ctx.defs.set(key, {});
        let rid = true === ctx.ids ? ident.id : undefined;
        if (undefined !== rid && (rid === ctx.rootId ||
            [...ctx.addr.values()].includes(rid))) {
            lose(ctx, at, '$id', 'another schema carries the $id ' + rid +
                ', which names one schema, so this one is written without it');
            rid = undefined;
        }
        if (undefined !== rid) {
            ctx.addr.set(key, rid);
        }
        const anchor = rootAnchor(ctx, at, '$anchor', rid, ident.anchor);
        const dyn = ident.dynamicAnchor === anchor ? anchor :
            rootAnchor(ctx, at, '$dynamicAnchor', rid, ident.dynamicAnchor);
        if (undefined !== dyn && undefined === rid) {
            ctx.dynamics.set(key, dyn);
        }
        const outer = ctx.base;
        ctx.base = rid;
        const schema = fromVal(ctx, at, body);
        ctx.base = outer;
        ctx.defs.set(key, stamp(schema, rid, anchor, dyn));
    }
    return key;
}
// An anchor of a definition in the root's resource, unless another one
// there carries it.
function rootAnchor(ctx, at, keyword, rid, anchor) {
    if (undefined === anchor || undefined !== rid) {
        return anchor;
    }
    if (ctx.anchors.has(anchor)) {
        lose(ctx, at, keyword, 'another schema in the resource carries the ' +
            'anchor ' + anchor + ', which names one schema, so this one is ' +
            'written without it');
        return undefined;
    }
    ctx.anchors.add(anchor);
    return anchor;
}
// A use of a definition: a $dynamicRef where the import resolved it
// through the dynamic scope to an anchor the root's resource binds,
// which every scope then agrees on, and a $ref otherwise.
function useOf(ctx, path, key, uris) {
    if (undefined === uris) {
        return { $ref: refTo(ctx, key) };
    }
    const frags = new Set(uris.map((u) => u.peg.substring(u.peg.indexOf('#') + 1)));
    const name = ctx.dynamics.get(key);
    if (undefined !== name && 1 === frags.size && frags.has(name)) {
        const ref = fromRoot(ctx, name);
        ctx.refKeys.set(ref, key);
        return { $dynamicRef: ref };
    }
    lose(ctx, path, '$dynamicRef', 'the import resolved this reference in ' +
        'the dynamic scope it read the schema in, and the export writes the ' +
        '$ref it resolved to, so an outer scope that binds the anchor anew ' +
        'does not change it');
    return { $ref: refTo(ctx, key) };
}
// The export root's own place among the definitions.
const ROOT_DEF = '';
// A reference to a definition, spelled to resolve from the resource the
// walk is in: a definition with an $id by it, and one without from the
// root, which a fragment names only from the root's own resource.
function refTo(ctx, key) {
    const ref = ctx.addr.get(key) ??
        fromRoot(ctx, ROOT_DEF === key ? '' : '/$defs/' + pointerToken(key));
    ctx.refKeys.set(ref, key);
    return ref;
}
// A fragment of the root's resource, spelled to resolve from the
// resource the walk is in.
function fromRoot(ctx, frag) {
    if (undefined === ctx.base) {
        return '#' + frag;
    }
    if (undefined === ctx.rootId) {
        ctx.unaddressable = true;
        return '#' + frag;
    }
    return ctx.rootId + ('' === frag ? '' : '#' + frag);
}
// An identity's keys, each where it holds one value: a key that holds
// more names no one place, so none of them is written.
function single(ctx, path, rec) {
    const out = {};
    for (const [k, keyword] of [['id', '$id'], ['anchor', '$anchor'],
        ['dynamicAnchor', '$dynamicAnchor'], ['key', '$defs']]) {
        const vals = rec?.[k] ?? [];
        if (1 === vals.length) {
            out[k] = vals[0];
        }
        else if (1 < vals.length) {
            lose(ctx, path, keyword, 'the declaration names ' + vals.join(' and ') +
                ' for one schema, so neither is written');
        }
    }
    return out;
}
// A schema with its resource's $id and its anchors written on it.
function stamp(schema, id, anchor, dynamicAnchor) {
    if (undefined === id && undefined === anchor &&
        undefined === dynamicAnchor) {
        return schema;
    }
    if (undefined !== id) {
        schema.$id = id;
    }
    if (undefined !== anchor) {
        schema.$anchor = anchor;
    }
    if (undefined !== dynamicAnchor) {
        schema.$dynamicAnchor = dynamicAnchor;
    }
    return schema;
}
// An alias's copy is unchanged when its value is, and what rides it but
// the dynamic reference it was reached through.
function sameCopy(def, v) {
    const meta = Object.entries(v.meta ?? {}).filter(([k]) => 'dynamicRef' !== k);
    return undefined !== def && (0, alias_1.spelledCanon)(def) === (0, alias_1.spelledCanon)(v) &&
        (0, utility_1.wrapRiders)('', def) === (0, utility_1.wrapRiders)('', {
            deprecation: v.deprecation,
            meta: 0 === meta.length ? undefined : Object.fromEntries(meta),
        });
}
// A JSON pointer token (RFC 6901), escaped again as the URI fragment
// that carries it (RFC 3986).
function pointerToken(key) {
    let out = '';
    for (const ch of key.replace(/~/g, '~0').replace(/\//g, '~1')) {
        out += /^[A-Za-z0-9\-._~!$&'()*+,;=:@]$/.test(ch) ? ch :
            [...new TextEncoder().encode(ch)].map((b) => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
    }
    return out;
}
const MIN_COUNT = /^min(Items|Length|Properties)$/;
// A bag and its sizing atom, described as one schema object: the bag's
// positions and the atom both give a lower count, and the higher holds.
function meet(a, b) {
    const out = { ...a };
    for (const k of Object.keys(b)) {
        out[k] = MIN_COUNT.test(k) && null != out[k] ? Math.max(out[k], b[k]) : b[k];
    }
    return out;
}
function fromValInner(ctx, path, v) {
    if (true === v.isPref) {
        const inner = fromVal(ctx, path, v.superpeg);
        const gen = generated(v.peg);
        return undefined === gen ? inner : { ...inner, default: gen };
    }
    if (true === v.isDisjunct && Array.isArray(v.peg)) {
        return fromDisjunct(ctx, path, v);
    }
    if (true === v.isConstraint) {
        return fromConstraint(ctx, path, v);
    }
    const residue = (0, BagVal_1.sizingResidue)(v);
    if (undefined !== residue) {
        return meet(fromVal(ctx, path, residue.bag), fromConstraint(ctx, path, residue.con, residue.bag));
    }
    if (true === v.isConjunct && v.peg.every((t) => true === t?.isMap)) {
        return { allOf: v.peg.map((t) => fromVal(ctx, path, t)) };
    }
    if (true === v.isConjunct) {
        return fromConjunct(ctx, path, v);
    }
    if (true === v.isMap) {
        return fromMap(ctx, path, v);
    }
    if (true === v.isList) {
        return fromList(ctx, path, v);
    }
    if (true === v.isMapKind) {
        return { type: 'object' };
    }
    if (true === v.isListKind) {
        return { type: 'array' };
    }
    if (true === v.isScalarKind) {
        const t = KIND_TYPE[v.peg?.name];
        loseKind(ctx, path, v.peg);
        if ('Path' === v.peg?.name) {
            losePath(ctx, path);
        }
        // `string` refuses "", and `string & empty()` does not.
        return String === v.peg && true !== v.emptyOk ?
            { type: t, minLength: 1 } : { type: t };
    }
    if (true === v.isNull) {
        return { type: 'null' };
    }
    if (true === v.isTop) {
        return {};
    }
    // `empty()` admits exactly the strings, "" included.
    if (true === v.isEmptyConstraint) {
        return { type: 'string' };
    }
    if (true === v.isScalar) {
        loseLiterals(ctx, path, groups([v]));
        return { const: jsonOf(v), type: scalarType(v) };
    }
    // The written `nil` is the bottom, which admits nothing; any other nil
    // is a failure the document carries, and refuses the run.
    if (true === v.isNil) {
        if ('literal_nil' !== v.why) {
            ctx.failed = ctx.failed ?? v;
        }
        return false;
    }
    // A rider in a template position is still its call: the value it
    // rides is what the schema says, and its records the annotations. A
    // reference it rides is its definition's use, beside them.
    if (true === v.isFunc && ['meta', 'deprecate'].includes(v.funcname())) {
        const trial = new aontu_1.Aontu().ctx({ collect: true });
        const call = v.clone(trial);
        const rides = true === v.peg[0].isRef;
        if (rides) {
            call.peg = [(0, top_1.top)(), ...call.peg.slice(1)];
        }
        const met = (0, unify_1.unite)(trial, (0, top_1.top)(), call, 'jsonschema');
        if (0 === trial.err.length && true !== met.isFunc && true !== met.isNil) {
            const key = rides ? aliasKey(ctx, v.peg[0]) : undefined;
            if (undefined !== key) {
                return annotate(ctx, path, useOf(ctx, path, key, met.meta?.dynamicRef), met);
            }
            if (!rides) {
                return fromVal(ctx, path, met);
            }
        }
    }
    const kind = true === v.isFunc ?
        RESULT_TYPE[sig_1.funcSig[v.funcname()]?.out] : undefined;
    if (undefined !== kind) {
        lose(ctx, path, residueName(v), 'this is computed when the document is evaluated, which a schema ' +
            'cannot say, so the schema admits any ' + kind + ' here');
        return { type: kind };
    }
    lose(ctx, path, residueName(v), 'this is not a value yet, so there is nothing to constrain a ' +
        'consumer to; the schema admits anything here');
    return {};
}
const RESULT_TYPE = {
    string: 'string', number: 'number', map: 'object', list: 'array',
};
// A conjunct held unmet in a template meets here on its own, so a kind
// and its atoms export as one schema object. Terms that read the
// document, or do not meet alone, export side by side.
function plainTerm(t) {
    return true === t.isScalarKind || true === t.isConstraint ||
        true === t.isEmptyConstraint || true === t.isScalar || true === t.isNull ||
        true === t.isTop || true === t.isMapKind || true === t.isListKind ||
        ((true === t.isDisjunct || true === t.isConjunct) && t.peg.every(plainTerm));
}
function fromConjunct(ctx, path, v) {
    if (v.peg.every(plainTerm)) {
        // Each term meets top first, as a parsed value does: a nested
        // disjunction is held unflattened until then.
        const trial = new aontu_1.Aontu().ctx({ collect: true });
        let met = (0, top_1.top)();
        for (const t of v.peg) {
            met = (0, unify_1.unite)(trial, met, (0, unify_1.unite)(trial, (0, top_1.top)(), t.clone(trial), 'jsonschema'), 'jsonschema');
        }
        if (0 === trial.err.length && true !== met.isConjunct &&
            true !== met.isNil) {
            return fromVal(ctx, path, met);
        }
    }
    return { allOf: v.peg.map((t) => fromVal(ctx, path, t)) };
}
function residueName(v) {
    return true === v.isRef ? 'reference' :
        true === v.isFunc ? v.funcname() :
            'unresolved';
}
// Exact numbers as raw JSON text, so every serialiser writes their digits.
function exactSafe(x) {
    if ('bigint' === typeof x || x instanceof Decimal_1.Decimal) {
        return RAW.rawJSON(x.toString());
    }
    if (Array.isArray(x)) {
        return x.map(exactSafe);
    }
    if (null != x && 'object' === typeof x) {
        return Object.fromEntries(Object.entries(x).map(([k, e]) => [k, exactSafe(e)]));
    }
    return x;
}
// The generated JSON of a value, or undefined where it does not
// generate. Used for `default` and for `enum` members: both are VALUES
// in the schema, so a member that is itself a shape has none to give.
function generated(v) {
    const a0 = new aontu_1.Aontu();
    const ctx = a0.ctx({ collect: true });
    const out = v.gen(ctx);
    return 0 === ctx.err.length ? exactSafe(out) : undefined;
}
// The keywords that hold for one JSON kind and pass every other, so the
// arms of a split by kind may share one schema object.
const SCOPED = {
    null: [],
    boolean: [],
    number: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
        'multipleOf'],
    integer: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
        'multipleOf'],
    string: ['minLength', 'maxLength', 'pattern', 'contentEncoding',
        'contentMediaType', 'contentSchema'],
    object: ['properties', 'required', 'additionalProperties',
        'patternProperties', 'propertyNames', 'minProperties', 'maxProperties'],
    array: ['prefixItems', 'items', 'minItems', 'maxItems', 'uniqueItems'],
};
const KINDS = ['null', 'boolean', 'number', 'string', 'object', 'array'];
function schemaText(s) {
    return JSON.stringify(s, (_k, x) => null != x && 'object' === typeof x &&
        !Array.isArray(x) ?
        Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);
}
// Arms of distinct kinds as one schema object: `type` names the kinds,
// left off when all six are there, and each arm's own keywords join it.
// The numeric arms must agree on their keywords, or the fold is refused.
function foldKinds(arms) {
    const out = {};
    const types = [];
    const held = {};
    for (const arm of arms) {
        const t = arm?.type;
        const scoped = SCOPED[t];
        if (undefined === scoped) {
            return undefined;
        }
        const { type: _, ...own } = arm;
        if (Object.keys(own).some((k) => !scoped.includes(k))) {
            return undefined;
        }
        const family = 'integer' === t ? 'number' : t;
        if (undefined === held[family]) {
            held[family] = schemaText(own);
            Object.assign(out, own);
        }
        else if (held[family] !== schemaText(own)) {
            return undefined;
        }
        if (!types.includes(t)) {
            types.push(t);
        }
    }
    if (types.length !== KINDS.length || !KINDS.every((k) => types.includes(k))) {
        out.type = 1 === types.length ? types[0] : types;
    }
    return out;
}
// A disjunction held unmet in a template keeps the nesting it was
// written with, which says nothing a flat one does not.
function disjuncts(v) {
    return v.peg.flatMap((m) => true === m?.isDisjunct ? disjuncts(m) : [m]);
}
function fromDisjunct(ctx, path, v) {
    const members = disjuncts(v);
    let def = undefined;
    for (const m of members) {
        if (true === m?.isPref && undefined === def) {
            def = generated(m.peg);
        }
    }
    const bare = members.map((m) => true === m?.isPref ? m.peg : m);
    let out;
    if (bare.every((m) => true === m?.isScalar &&
        '' === (0, utility_1.wrapRiders)('', m))) {
        const gs = groups(bare);
        loseLiterals(ctx, path, gs);
        out = { enum: gs.map((g) => jsonOf(g.v)) };
    }
    else {
        const arms = bare.map((m) => fromVal(ctx, path, m));
        out = foldKinds(arms) ?? { anyOf: arms };
    }
    return undefined === def ? out : { ...out, default: def };
}
function skipMarked(ctx, path, bag, child) {
    // A mark the container carries too is read through (an export
    // anchored inside it); one of the child's own is not.
    if (true === child?.mark?.hide && true !== bag.mark?.hide) {
        lose(ctx, path, 'hide', 'a hidden entry is not generated, so it is omitted from the ' +
            'schema; a consumer is neither asked for it nor allowed to know ' +
            'about it');
        return true;
    }
    if (true === child?.mark?.type && true !== bag.mark?.type) {
        lose(ctx, path, 'type', 'a type() entry is a definition and is not generated, so it is ' +
            'omitted from the schema');
        return true;
    }
    return false;
}
function fromMap(ctx, path, v) {
    const props = [];
    const required = [];
    const optional = v.optionalKeys;
    for (const key of Object.keys(v.peg).sort(keyorder_1.cmpCodePoint)) {
        const child = v.peg[key];
        if (v.aliasKeys.includes(key)) {
            continue;
        }
        // A marked child does not generate, so it is not part of the value
        // a consumer produces -- and a schema that demanded it would refuse
        // every correct document.
        if (skipMarked(ctx, [...path, key], v, child)) {
            continue;
        }
        props.push([key, fromVal(ctx, [...path, key], child)]);
        if (!optional.includes(key) && !dropped(child)) {
            required.push(key);
        }
    }
    const out = { type: 'object', properties: Object.fromEntries(props) };
    if (0 < required.length) {
        out.required = required;
    }
    // CLOSEDNESS IS THE ONE THING JSON SCHEMA SAYS EXACTLY AS AONTU DOES.
    // A closed map is `additionalProperties: false`; an open one leaves
    // the keyword off, since JSON Schema's default is already open.
    const spr = v.spread?.cj;
    if (true === v.closed) {
        out.additionalProperties = false;
    }
    else if (null != spr) {
        mapSpread(ctx, [...path, '&'], out, spr, Object.keys(v.peg).filter((k) => !v.aliasKeys.includes(k)));
    }
    return out;
}
// A spread the import wrote as a test on the key: `match(key(0), ...)`
// with its arms and its default.
function keyGuard(t) {
    const a = t?.peg;
    if (true !== t?.isMatchFunc || true !== a[0]?.isKeyFunc ||
        !(0 === a[0].peg.length || 0 === a[0].peg[0]?.peg) || 0 !== a.length % 2) {
        return undefined;
    }
    const arms = [];
    for (let i = 1; i < a.length - 1; i += 2) {
        arms.push([a[i], a[i + 1]]);
    }
    return { arms, dflt: a[a.length - 1] };
}
// The one pattern a bare `re()` holds, and nothing for anything more.
function lonePattern(c) {
    return true === c?.isConstraint && 1 === c.res.length && null == c.kind &&
        null == c.lo && null == c.hi && 0 === c.neqs.length && null == c.count &&
        0 === c.musts.length && 0 === c.fmts.length ? c.res[0].norm : undefined;
}
// The map guards of design section 6: one per pattern, one naming every
// declared key and every pattern, and one on the key itself. A spread
// with no guard is the schema every further key meets.
function mapSpread(ctx, path, out, spr, names) {
    const terms = true === spr.isConjunct ? spr.peg : [spr];
    const guards = terms.map(keyGuard);
    if (guards.every((g) => undefined === g)) {
        out.additionalProperties = fromVal(ctx, path, spr);
        return;
    }
    const patterns = [];
    const exempts = [];
    const apart = [];
    let lost = false;
    for (const g of guards) {
        const [test, then] = g?.arms[0] ?? [];
        const p = 1 === g?.arms.length ? lonePattern(test) : undefined;
        if (undefined === g) {
            continue;
        }
        else if (undefined !== p && true === g.dflt.isTop) {
            const s = fromVal(ctx, path, then);
            if (patterns.some(([q]) => q === p)) {
                apart.push({ patternProperties: Object.fromEntries([[p, s]]) });
            }
            else {
                patterns.push([p, s]);
            }
        }
        else if (1 === g.arms.length && true === test.isConjunct &&
            2 === test.peg.length && true === test.peg[0].isEmptyConstraint &&
            true === then.isTop && true === g.dflt.isNil) {
            const c = fromVal(ctx, path, test);
            if (undefined === out.propertyNames) {
                out.propertyNames = c;
            }
            else {
                apart.push({ propertyNames: c });
            }
        }
        else if (g.arms.every(([k, a]) => true === a.isTop &&
            (true === k.isString || undefined !== lonePattern(k)))) {
            exempts.push(g);
        }
        else {
            lost = true;
        }
    }
    if (0 < patterns.length) {
        out.patternProperties = Object.fromEntries(patterns);
    }
    // `additionalProperties` exempts the keys its own object names, so a
    // guard exempting any other keys stands in an object of its own.
    for (const g of exempts) {
        const named = g.arms.filter(([k]) => true === k.isString)
            .map(([k]) => k.peg);
        const pats = g.arms.map(([k]) => lonePattern(k))
            .filter((x) => undefined !== x);
        const d = fromVal(ctx, path, g.dflt);
        if (undefined === out.additionalProperties && sameSet(named, names) &&
            sameSet(pats, patterns.map(([q]) => q))) {
            out.additionalProperties = d;
        }
        else {
            const own = {};
            if (0 < named.length) {
                own.properties = Object.fromEntries(named.map((n) => [n, {}]));
            }
            if (0 < pats.length) {
                own.patternProperties = Object.fromEntries(pats.map((q) => [q, {}]));
            }
            own.additionalProperties = d;
            apart.push(own);
        }
    }
    // A template holds for every key, which `additionalProperties` says
    // only in an object whose patterns exempt none.
    const plain = terms.filter((_t, i) => undefined === guards[i])
        .map((t) => fromVal(ctx, path, t));
    if (0 < plain.length) {
        const t = 1 === plain.length ? plain[0] : { allOf: plain };
        if (undefined === out.additionalProperties && 0 === patterns.length) {
            out.additionalProperties = t;
        }
        else {
            apart.push({ additionalProperties: t });
        }
    }
    if (0 < apart.length) {
        out.allOf = apart;
    }
    if (lost) {
        lose(ctx, path, 'match', 'this spread tests each key in a way no keyword says, so it is ' +
            'DROPPED and the schema admits keys it refuses');
    }
}
function sameSet(a, b) {
    const x = [...new Set(a)].sort();
    const y = [...new Set(b)].sort();
    return x.length === y.length && x.every((e, i) => e === y[i]);
}
// A written list is open unless closed, and its spread already holds for
// every position, so positions are prefixItems and the spread is items.
function fromList(ctx, path, v) {
    const at = (i) => [...path, String(i)];
    const kept = [];
    v.peg.forEach((el, i) => {
        if (!skipMarked(ctx, at(i), v, el)) {
            kept.push(i);
        }
    });
    const out = { type: 'array' };
    if (0 < kept.length) {
        out.prefixItems = kept.map((i) => fromVal(ctx, at(i), v.peg[i]));
        let need = kept.length;
        while (0 < need && dropped(v.peg[kept[need - 1]])) {
            need--;
        }
        if (0 < need) {
            out.minItems = need;
        }
    }
    const spr = v.spread?.cj;
    const g = keyGuard(spr);
    if (true === v.closed) {
        out.items = false;
    }
    else if (undefined !== g && kept.length === v.peg.length &&
        g.arms.every(([k], i) => true === k.isString && String(i) === k.peg)) {
        out.prefixItems = [...(out.prefixItems ?? []), ...g.arms
                .slice(kept.length).map(([, a], i) => fromVal(ctx, at(kept.length + i), a))];
        if (true !== g.dflt.isTop) {
            out.items = fromVal(ctx, [...path, '&'], g.dflt);
        }
    }
    else if (null != spr) {
        out.items = fromVal(ctx, [...path, '&'], spr);
    }
    return out;
}
// The verb. Evaluate, anchor, walk, report.
function jsonSchema(src, options) {
    const opts = options ?? {};
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(opts));
    const actx = aontu.ctx({ collect: true });
    const root = aontu.unify(src, { path: opts.path, collect: true }, actx);
    // A nil root always arrives with its reason collected beside it, which
    // is failureFinding's stated precondition (ts/src/vet.ts: "ctx.err is
    // never empty at a call site").
    if (0 < actx.err.length || true === root?.isNil) {
        return {
            verdict: 'error', schema: {}, lossy: [],
            errors: [(0, vet_1.failureFinding)(actx, opts.path, root)],
        };
    }
    let node = root;
    const anchor = [];
    if (null != opts.at && '' !== opts.at) {
        const found = (0, vet_2.anchorAt)(root, opts.at);
        if (null == found) {
            // The anchor names nothing. Reported as a `no_path` nil through
            // the same finding shape every other refusal here uses, so a
            // caller reads one error format rather than two.
            const nil = (0, err_1.makeNilErr)(actx, 'no_path', root, undefined, 'at');
            actx.err.push(nil);
            return {
                verdict: 'error', schema: {}, lossy: [],
                errors: [(0, vet_1.failureFinding)(actx, opts.path, root)],
            };
        }
        node = found;
        anchor.push(...opts.at.replace(/^\$/, '').split('.').filter((p) => '' !== p));
    }
    // The root, where it is an alias's unchanged copy whose declaration
    // names a resource, is written as that resource.
    const run = (ids) => {
        const ctx = {
            lossy: [], exact: true === opts.exactNumbers, root, defs: new Map(),
            names: new Map(), anchor, ids, addr: new Map(), anchors: new Set(),
            unaddressable: false, dynamics: new Map(), refKeys: new Map(),
            rests: [], restArms: new Set(),
        };
        const decl = null == node.aliasOrigin ? undefined :
            (0, RecurseVal_1.walkTarget)(root, [node.aliasOrigin]);
        let top = node;
        let ident = {};
        if (1 === decl?.identity?.id?.length && sameCopy(decl, node)) {
            ident = single(ctx, anchor, decl.identity);
        }
        if (undefined !== ident.id) {
            ctx.rootId = ident.id;
            ctx.names.set(JSON.stringify([node.aliasOrigin]), ROOT_DEF);
            for (const a of [ident.anchor, ident.dynamicAnchor]) {
                if (undefined !== a) {
                    ctx.anchors.add(a);
                }
            }
            if (undefined !== ident.dynamicAnchor) {
                ctx.dynamics.set(ROOT_DEF, ident.dynamicAnchor);
            }
            top = decl;
        }
        const made = fromVal(ctx, anchor, top);
        const body = top === node ? made :
            stamp(made, ident.id, ident.anchor, ident.dynamicAnchor);
        settleRests(ctx, body);
        return { ctx, body };
    };
    let { ctx, body } = run(true);
    if (ctx.unaddressable) {
        ({ ctx, body } = run(false));
        lose(ctx, anchor, '$id', 'a definition with an $id refers to one the ' +
            'document names only from its root, which has no $id to name it by, ' +
            'so the definitions are written without theirs');
    }
    if (null != ctx.failed) {
        const f = ctx.failed;
        const nil = true === f.isNil ? f :
            (0, err_1.makeNilErr)(actx, f.invalid, f, undefined, 'constrain');
        return {
            verdict: 'error', schema: {}, lossy: [],
            errors: [(0, vet_1.failureFinding)(actx, opts.path, nil)],
        };
    }
    const defs = 0 === ctx.defs.size ? {} : {
        $defs: Object.fromEntries([...ctx.defs.entries()]
            .sort(([a], [b]) => (0, keyorder_1.cmpCodePoint)(a, b))),
    };
    return {
        verdict: 0 < ctx.lossy.length ? 'lossy' : 'ok',
        schema: { $schema: DRAFT, ...(false === body ? { not: {} } : body), ...defs },
        lossy: ctx.lossy,
    };
}
//# sourceMappingURL=jsonschema.js.map
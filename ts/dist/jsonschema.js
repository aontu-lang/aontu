"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonSchema = jsonSchema;
/* Copyright (c) 2025 Richard Rodger, MIT License */
const utility_1 = require("./utility");
const aontu_1 = require("./aontu");
const err_1 = require("./err");
const BagVal_1 = require("./val/BagVal");
const Decimal_1 = require("./val/Decimal");
const numkind_1 = require("./val/numkind");
const numcmp_1 = require("./val/numcmp");
const ConstraintVal_1 = require("./val/ConstraintVal");
const rider_1 = require("./rider");
const keyorder_1 = require("./keyorder");
const exactjson_1 = require("./exactjson");
const aliasname_1 = require("./aliasname");
const walk_1 = require("./walk");
const top_1 = require("./val/top");
const RecurseVal_1 = require("./val/RecurseVal");
const vet_1 = require("./vet");
const vet_2 = require("./vet");
const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
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
};
const COUNT_KEYS = {
    string: ['minLength', 'maxLength'],
    map: ['minProperties', 'maxProperties'],
    list: ['minItems', 'maxItems'],
};
// A path is its address string at the JSON boundary, and the schema
// cannot say which strings are addresses.
function losePath(ctx, path) {
    lose(ctx, path, 'path', 'a path admits only path values, but JSON Schema has no path type; ' +
        'the schema says "string" and admits any string here');
}
// A kind narrowed to one leaf of a number has no JSON Schema type, since
// JSON Schema reads a number by its value.
function loseLeafKind(ctx, path, name, t) {
    if ('BigInteger' === name || 'BigDecimal' === name) {
        loseExactKind(ctx, path, name.toLowerCase(), t);
    }
    else if ('Integer' === name) {
        lose(ctx, path, 'integer', 'JSON Schema reads a number by its value, so its integer also admits ' +
            '1.0 and whole numbers past the integer leaf, which this kind refuses; ' +
            'number & multiple(1) is the integer it means');
    }
    else if ('Float' === name) {
        lose(ctx, path, 'float', 'JSON Schema has no float: its number also admits the integer leaf, ' +
            'which this kind refuses');
    }
}
function loseExactKind(ctx, path, leaf, t) {
    lose(ctx, path, leaf, 'JSON Schema has no type for one leaf of a number: the schema says "' + t +
        '", which admits the other leaves too, where this kind refuses them');
}
// An exact leaf's digits as a JSON number, written directly rather than
// through a double: JSON Schema compares numbers by their value.
function exactJson(v) {
    if ('bigint' === typeof v || v instanceof Decimal_1.Decimal) {
        return JSON.rawJSON(v.toString());
    }
    if (Array.isArray(v)) {
        return v.map(exactJson);
    }
    if (null != v && 'object' === typeof v && !JSON.isRawJSON(v)) {
        const out = {};
        for (const k of Object.keys(v)) {
            out[k] = exactJson(v[k]);
        }
        return out;
    }
    return v;
}
function scalarJson(v) {
    return exactJson(v.peg);
}
// The whole number at or above a count's bound (`up`), or at or below
// it, exactly: a count a double would round keeps its digits.
function wholeCount(v, up) {
    const p = v.peg;
    if ('bigint' === typeof p) {
        return p;
    }
    if (p instanceof Decimal_1.Decimal) {
        const w = up ? p.ceil() : p.floor();
        return w.unscaled / 10n ** BigInt(w.scale);
    }
    return BigInt(up ? Math.ceil(p) : Math.floor(p));
}
function countJson(n) {
    return BigInt(Number.MIN_SAFE_INTEGER) <= n && n <= BigInt(Number.MAX_SAFE_INTEGER) ?
        Number(n) : JSON.rawJSON(n.toString());
}
// One JSON value by its meaning: `1` and `1.0` are one number.
function valueKey(v) {
    if ('number' === typeof v || JSON.isRawJSON(v)) {
        const text = 'number' === typeof v ? String(v) : v.rawJSON;
        return (0, numkind_1.exactNumberText)((0, numkind_1.readExactNumber)(text)) ?? text;
    }
    return JSON.stringify(v);
}
// One value is carried once, however its members are spelt.
function dedupeJson(vals) {
    const seen = new Set();
    const out = [];
    for (const v of vals) {
        const key = valueKey(v);
        if (!seen.has(key)) {
            seen.add(key);
            out.push(v);
        }
    }
    return out;
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
// What JSON cannot say about a bound is reported, never approximated.
function boundOut(ctx, path, out, b, isLo) {
    const atom = isLo ? (b.open ? 'above' : 'min') : (b.open ? 'below' : 'max');
    const v = b.v;
    if (!('number' === typeof v.peg || v.isBigInteger || v.isBigDecimal)) {
        lose(ctx, path, atom, 'JSON Schema has no keyword for a bound on a string (minimum and ' +
            'maximum take numbers only), so this bound is DROPPED and the ' +
            'schema admits strings outside it');
        return;
    }
    out[isLo ? (b.open ? 'exclusiveMinimum' : 'minimum') :
        (b.open ? 'exclusiveMaximum' : 'maximum')] = scalarJson(v);
}
// The whole number a count keyword takes: `above(2)` is at least 3.
function countEndpoint(b, isLo) {
    if (null == b) {
        return undefined;
    }
    return isLo ? (b.open ? wholeCount(b.v, false) + 1n : wholeCount(b.v, true)) :
        (b.open ? wholeCount(b.v, true) - 1n : wholeCount(b.v, false));
}
const NOT_YET = 'this is not a value yet, so there is nothing to constrain a ' +
    'consumer to; the schema admits anything here';
const FORMAT_ANNOTATES = (name) => 'the format "' + name + '" asserts here, and ' +
    'JSON Schema 2020-12 asserts a format only where a validator is asked to, so the ' +
    'schema may admit a string it refuses';
const FORMAT_UNREAD = (name) => 'JSON Schema has no keyword for a grammar, so the ' +
    'format "' + name + '" is written as x-aontu-format, which only aontu reads; the schema ' +
    'admits any string here';
function fromConstraint(ctx, path, c, bag) {
    const out = {};
    // An atom whose arguments have not settled: a template's, read where
    // it cannot be read alone.
    if (null != c.pending) {
        lose(ctx, path, c.pending.atom, NOT_YET);
    }
    // `allOf` members: a second pattern or exclusion has no keyword of its own.
    const extra = [];
    const nots = [];
    if (null != c.kind && null != KIND_TYPE[c.kind.name]) {
        out.type = KIND_TYPE[c.kind.name];
        loseLeafKind(ctx, path, c.kind.name, out.type);
    }
    else if ('string' === c.domain) {
        out.type = 'string';
    }
    else if ('number' === c.domain) {
        out.type = 'number';
    }
    if (null != c.lo) {
        boundOut(ctx, path, out, c.lo, true);
    }
    if (null != c.hi) {
        boundOut(ctx, path, out, c.hi, false);
    }
    // `neq(1,2)` is "not one of these", which is exactly `not: {enum}`.
    if (0 < c.neqs.length) {
        nots.push({ enum: dedupeJson(c.neqs.map(scalarJson)) });
    }
    // A number with no leaf that is a multiple of 1 is JSON Schema's integer.
    const one = (m) => 0 === (0, numcmp_1.cmpScaled)((0, numcmp_1.scaledOfShown)(m), { unscaled: 1n, scale: 0 });
    let mults = c.mults;
    if (null == c.kind && 'number' === out.type && mults.some(one)) {
        out.type = 'integer';
        mults = mults.filter((m) => !one(m));
    }
    const divisors = mults.map(scalarJson);
    if (1 === divisors.length) {
        out.multipleOf = divisors[0];
    }
    else {
        extra.push(...divisors.map((n) => ({ multipleOf: n })));
    }
    // The normalised form, valid in ECMA-262 and meaning what aontu means.
    if (1 === c.res.length) {
        out.pattern = c.res[0].norm;
    }
    else if (1 < c.res.length) {
        extra.push(...c.res.map((r) => ({ pattern: r.norm })));
    }
    // ADR-059: a committed format by its name, a grammar under
    // x-aontu-format, which only aontu reads.
    for (const [key, fs, reason] of [
        ['format', c.fmts.filter((f) => f.src === f.name), FORMAT_ANNOTATES],
        ['x-aontu-format', c.fmts.filter((f) => f.src !== f.name), FORMAT_UNREAD],
    ]) {
        if (1 === fs.length) {
            out[key] = fs[0].src;
        }
        else {
            extra.push(...fs.map((f) => ({ [key]: f.src })));
        }
        for (const f of fs) {
            lose(ctx, path, 'format', reason(f.name));
        }
    }
    if (null != c.count) {
        const domain = 'string' === c.domain || 'string' === out.type ? 'string' : bag;
        const [lokey, hikey] = COUNT_KEYS[domain ?? 'list'];
        const lo = countEndpoint(c.count.lo, true);
        const hi = countEndpoint(c.count.hi, false);
        // A whole-number count's zero lower bound says nothing.
        if (null != lo && 0n < lo) {
            out[lokey] = countJson(lo);
        }
        if (null != hi) {
            out[hikey] = countJson(hi);
        }
        // An excluded length is exactly `not` both bounds at it.
        for (const n of c.count.neqs) {
            const k = wholeCount(n, true);
            if (k === wholeCount(n, false)) {
                nots.push({ [lokey]: countJson(k), [hikey]: countJson(k) });
            }
        }
        if (undefined === domain) {
            lose(ctx, path, 'len', 'a count with no domain is exported as minItems/maxItems; ' +
                'JSON Schema has no keyword that counts a string OR a container');
        }
        if (0 < (c.count.mults ?? []).length) {
            lose(ctx, path, 'len', 'JSON Schema has no keyword for a divisor of a count, so it is ' +
                'DROPPED and the schema admits lengths the model refuses');
        }
    }
    for (const n of c.nofs) {
        const branches = () => n.cs.map((b) => true === b.isNil ? false : fromVal(ctx, path, b));
        const counts = (0, ConstraintVal_1.nofCounts)(n);
        const only = (...at) => counts.every((ok, i) => ok === at.includes(i));
        const k = n.cs.length;
        const all = counts.map((_ok, i) => i);
        if (only(...all)) {
            continue;
        }
        if (only(...all.slice(1))) {
            keyword(out, extra, 'anyOf', branches());
        }
        else if (only(1)) {
            keyword(out, extra, 'oneOf', branches());
        }
        else if (only(0)) {
            nots.push(1 === k ? branches()[0] : { anyOf: branches() });
        }
        else if (only(k)) {
            extra.push(...branches());
        }
        else if (only()) {
            extra.push(false);
        }
        else {
            lose(ctx, path, 'nof', 'JSON Schema counts its branches only as anyOf, oneOf, allOf and not, ' +
                'so this count is DROPPED and the schema admits values the model refuses');
        }
    }
    for (const w of c.whens) {
        whenOut(ctx, path, out, extra, w);
    }
    for (const k of c.contains) {
        containsOut(ctx, path, out, extra, k, bag);
    }
    for (const r of c.rests) {
        restCheckOut(ctx, path, extra, r, bag);
    }
    for (const m of c.musts) {
        extra.push(fromVal(ctx, path, m.v));
    }
    if (1 === nots.length) {
        out.not = nots[0];
    }
    else if (1 < nots.length) {
        extra.push(...nots.map((n) => ({ not: n })));
    }
    if (0 < extra.length) {
        out.allOf = extra;
    }
    if (true === c.nonEmpty && true !== c.emptyOk && !(1 <= out.minLength)) {
        out.minLength = 1;
    }
    if (true === c.pathKind) {
        losePath(ctx, path);
    }
    if (c.uniq) {
        out.uniqueItems = true;
    }
    for (const key of c.uniqBy) {
        lose(ctx, path, 'unique(' + key + ')', 'JSON Schema has no uniqueness-by-property keyword; uniqueItems ' +
            'compares whole items, so this constraint is DROPPED and the ' +
            'schema admits records sharing a `' + key + '`');
    }
    if (0 < c.musts.length) {
        lose(ctx, path, 'must', 'JSON Schema has no keyword for a check\'s message, so the check ' +
            'crosses as allOf of its trial schema and its message is DROPPED');
    }
    return out;
}
// A keyword this schema object has once; a second goes under allOf.
// A member count is contains, with its endpoints as minContains and
// maxContains; JSON Schema counts an array's items only.
function containsOut(ctx, path, out, extra, k, bag) {
    if ('map' === bag) {
        lose(ctx, path, 'contains', 'JSON Schema counts only the items of an array, so a count of a ' +
            'map\'s members is DROPPED and the schema admits maps the model refuses');
        return;
    }
    if (undefined === bag) {
        lose(ctx, path, 'contains', 'JSON Schema applies contains to an array only and passes any other ' +
            'value, where the model refuses a scalar and counts a map\'s members');
    }
    if (0 < k.count.neqs.length + k.count.mults.length) {
        lose(ctx, path, 'contains', 'JSON Schema bounds a count of matching items only above and below, ' +
            'so an excluded count or a divisor is DROPPED');
    }
    const part = { contains: true === k.c.isNil ? false : fromVal(ctx, path, k.c) };
    const lo = countEndpoint(k.count.lo, true);
    const hi = countEndpoint(k.count.hi, false);
    if (1n !== lo) {
        part.minContains = countJson(lo);
    }
    if (undefined !== hi) {
        part.maxContains = countJson(hi);
    }
    if (undefined === out.contains) {
        Object.assign(out, part);
    }
    else {
        extra.push(part);
    }
}
const COVER_LOST = 'JSON Schema evaluates a member only by its name, a pattern of ' +
    'its name, its index in a prefix or its match of contains, so a check whose ' +
    'cover reaches past these is DROPPED and the schema admits members the model refuses';
// ADR-058: rest() as an allOf member whose own keywords evaluate what its
// covers do, so its unevaluated keyword sees those and no more. A
// condition rides `not: {not: …}`, which keeps its own annotations out.
function restCheckOut(ctx, path, extra, r, bag) {
    const kinds = undefined === bag ? ['map', 'list'] : [bag];
    const part = {};
    const branches = [];
    for (const c of r.covers) {
        const kw = {};
        if (!kinds.every((kind) => coverOut(ctx, path, c.peg, kind, kw))) {
            lose(ctx, path, 'rest', COVER_LOST);
            return;
        }
        const cond = undefined === c.peg.if ? {} :
            true === c.peg.if.isNil ? false : fromVal(ctx, path, c.peg.if);
        const always = 0 === Object.keys(cond).length;
        if (false === cond || 0 === Object.keys(kw).length || (always && mergeCover(part, kw))) {
            continue;
        }
        branches.push(always ? kw : { not: { not: cond }, ...kw });
    }
    if (0 < branches.length) {
        part.anyOf = [...branches, true];
    }
    const t = true === r.t.isNil ? false : fromVal(ctx, path, r.t);
    for (const kind of kinds) {
        part['map' === kind ? 'unevaluatedProperties' : 'unevaluatedItems'] = t;
    }
    extra.push(part);
}
// The keywords that evaluate what one cover does in a container of this
// kind; false where none can.
function coverOut(ctx, path, c, kind, kw) {
    const all = () => {
        kw['map' === kind ? 'additionalProperties' : 'items'] = true;
    };
    const m = c.members;
    if (undefined !== m && true !== m.isNil) {
        if (true === m.isTop) {
            all();
        }
        else if ('map' === kind) {
            return false;
        }
        else {
            kw.contains = fromVal(ctx, path, m);
            kw.minContains = 0;
        }
    }
    const k = c.keys;
    if (undefined === k || true === k.isNil) {
        return true;
    }
    if (true === k.isTop) {
        all();
        return true;
    }
    const tests = (true === k.isDisjunct ? k.peg : [k]).map((t) => armTest(ctx, path, t));
    if (tests.some((t) => undefined === t.name && undefined === t.re)) {
        return false;
    }
    if ('map' === kind) {
        for (const t of tests) {
            const key = undefined === t.name ? 'patternProperties' : 'properties';
            kw[key] = { ...kw[key], [t.name ?? t.re]: true };
        }
        return true;
    }
    // A list member's key is its index, so only "0" to "n-1" is a prefix.
    const at = [...new Set(tests
            .filter((t) => /^(0|[1-9][0-9]*)$/.test(t.name ?? 'x'))
            .map((t) => Number(t.name)))].sort((a, b) => a - b);
    if (tests.some((t) => undefined !== t.re) || at.some((n, i) => n !== i)) {
        return false;
    }
    if (0 < at.length) {
        kw.prefixItems = at.map(() => true);
    }
    return true;
}
// One unconditional cover joins the member's own keywords, but for a
// second contains, which takes a branch of its own.
function mergeCover(part, kw) {
    if (undefined !== kw.contains && undefined !== part.contains) {
        return false;
    }
    for (const [k, v] of Object.entries(kw)) {
        part[k] = 'properties' === k || 'patternProperties' === k ? { ...part[k], ...v } :
            'prefixItems' === k && (v.length < (part[k]?.length ?? 0)) ? part[k] : v;
    }
    return true;
}
// A conditional on one key's presence is a dependent keyword, and one
// whose branch only asks for keys is dependentRequired.
function whenOut(ctx, path, out, extra, w) {
    const arm = (b) => true === b.isNil ? false : fromVal(ctx, path, b);
    const key = presentKeys(w.c);
    if (undefined !== key && 1 === key.length && undefined === w.e) {
        const names = presentKeys(w.t);
        const [dep, val] = undefined === names ? ['dependentSchemas', arm(w.t)] :
            ['dependentRequired', names];
        if (undefined === out[dep]?.[key[0]]) {
            out[dep] = { ...out[dep], [key[0]]: val };
        }
        else {
            extra.push({ [dep]: { [key[0]]: val } });
        }
        return;
    }
    if (true === w.t.isTop && undefined === w.e) {
        return;
    }
    const cond = { if: arm(w.c) };
    if (true !== w.t.isTop) {
        cond.then = arm(w.t);
    }
    if (undefined !== w.e) {
        cond.else = arm(w.e);
    }
    if (undefined === out.if) {
        Object.assign(out, cond);
    }
    else {
        extra.push(cond);
    }
}
// The keys of a map that holds each of them as `any`, and nothing else.
function presentKeys(v) {
    if (true !== v.isMap || null != v.spread?.cj || true === v.closed) {
        return undefined;
    }
    const keys = Object.keys(v.peg).sort(keyorder_1.cmpCodePoint);
    return 0 < keys.length && keys.every((k) => true === v.peg[k]?.isTop &&
        !v.optionalKeys.includes(k)) ? keys : undefined;
}
function keyword(out, extra, key, val) {
    if (undefined === out[key]) {
        out[key] = val;
    }
    else {
        extra.push({ [key]: val });
    }
}
function fromVal(ctx, path, v) {
    const out = fromValRef(ctx, path, v);
    // ADR-057: a use the importer read from a $dynamicRef keeps the $ref of
    // the binding it reached until the definitions are written, when
    // dynamicRefs knows which anchors they carry. A fragment that is no
    // anchor never asked the dynamic scope, and its $ref stands.
    const text = out?.$dynamicRef;
    const name = undefined === text || -1 === text.indexOf('#') ? '' : text.slice(text.indexOf('#') + 1);
    if (undefined !== text && ('' === name || name.startsWith('/'))) {
        delete out.$dynamicRef;
    }
    else if (undefined !== text && undefined !== out.$ref) {
        out.$dynamicRef = '#' + name;
        if (true !== ctx.scratch) {
            ctx.refs.dynamic.push({ path, name, ref: out.$ref });
        }
    }
    else if (undefined !== text) {
        delete out.$dynamicRef;
        lose(ctx, path, '$dynamicRef', 'the schema it reached is not a definition, so it is written in place');
    }
    return out;
}
function fromValRef(ctx, path, v) {
    if (null == v.via) {
        return withRiders(ctx, path, fromValInner(ctx, path, v), v);
    }
    const defs = v.via.map((key) => defOf(ctx, [key]));
    defs.forEach((def) => def.reached ||= true !== ctx.scratch);
    const own = plainOf(ctx, path, v);
    const same = defs.find((def) => own.text === plainOf(ctx, def.path, def.value).text);
    return undefined !== same ? refTo(ctx, same.target) : beside(ctx, defs, true === ctx.scratch ? own.schema : withRiders(ctx, path, fromValInner(ctx, path, v), v));
}
// A value's schema as a scratch walk writes it, short of its own $ref: the
// same wherever it sits, so written once, or nested copies cost exponential time.
function plainOf(ctx, path, v) {
    let plain = ctx.refs.plain.get(v);
    if (undefined === plain) {
        const scratch = { ...ctx, lossy: [], scratch: true };
        const schema = withRiders(scratch, path, fromValInner(scratch, path, v), v);
        plain = { schema, text: (0, exactjson_1.exactJSON)(schema) };
        ctx.refs.plain.set(v, plain);
    }
    return plain;
}
// A narrowed copy is its alias's $ref beside the keywords that differ, as
// `$ref` with siblings reads: exact, since it admits nothing the alias refuses.
function beside(ctx, defs, out) {
    const differ = (def) => {
        const plain = Object(plainOf(ctx, def.path, def.value).schema);
        return Object.keys(out).filter((k) => !Object.prototype.hasOwnProperty.call(plain, k) ||
            (0, exactjson_1.exactJSON)(out[k]) !== (0, exactjson_1.exactJSON)(plain[k]));
    };
    const best = defs.reduce((a, b) => differ(b).length < differ(a).length ? b : a);
    return {
        ...Object.fromEntries(differ(best).map((k) => [k, out[k]])),
        ...refTo(ctx, best.target),
    };
}
// The definition a target names, found as a recursion's walk finds it: an
// alias by its name, any other target by its path; a taken name gains a number.
function defOf(ctx, target) {
    const refs = ctx.refs;
    const key = target.join('\u0000');
    const known = refs.defs.get(key);
    if (undefined !== known) {
        return known;
    }
    let value = refs.root;
    for (const seg of target) {
        const node = (0, RecurseVal_1.throughRider)(value);
        value = true === node?.isMap ? node.peg[seg] :
            true === node?.isConjunct ? (0, RecurseVal_1.declaration)(node, seg) : undefined;
    }
    if (undefined === value) {
        return undefined;
    }
    const path = target.map(aliasname_1.aliasPathSegment);
    const alias = 1 === target.length && aliasname_1.ALIAS_NAME_RE.test(path[0]);
    const declared = value.identity?.defs ?? [];
    const base = 1 === declared.length ? declared[0] :
        alias ? defName(path[0].slice(1)) : path.join('.');
    let name = base;
    for (let i = 2; refs.names.has(name); i++) {
        name = base + '_' + i;
    }
    refs.names.add(name);
    const def = { name, base, target, path, value, used: false };
    refs.defs.set(key, def);
    return def;
}
// The importer's alias of #/$defs/k is d_ and k, a character outside
// [A-Za-z0-9] as its hex code point between underscores: read back to k.
function defName(alias) {
    const m = /^d_((?:[A-Za-z0-9]|_[0-9a-f]+_)+)$/.exec(alias);
    return null == m ? alias : m[1].replace(/_([0-9a-f]+)_/g, (_all, hex) => String.fromCodePoint(parseInt(hex, 16)));
}
// A definition's $ref: a JSON pointer, its tokens escaped, as a URI fragment.
function defRef(def) {
    const token = def.name.replace(/~/g, '~0').replace(/\//g, '~1');
    let out = '#/$defs/';
    for (const byte of new TextEncoder().encode(token)) {
        const ch = String.fromCharCode(byte);
        out += /[A-Za-z0-9\-._~!$&'()*+,;=:@/?]/.test(ch) && byte < 128 ? ch :
            '%' + byte.toString(16).toUpperCase().padStart(2, '0');
    }
    return out;
}
// A target's $ref, its definition written the first time a real walk uses it.
function refTo(ctx, target) {
    const def = defOf(ctx, target);
    if (undefined === def) {
        return undefined;
    }
    const inside = ctx.refs.inside;
    if (true !== ctx.scratch && 0 < inside.length) {
        inside[inside.length - 1].refers = true;
    }
    if (true !== ctx.scratch && !def.used) {
        def.used = true;
        inside.push(def);
        def.schema = fromVal(ctx, def.path, def.value);
        inside.pop();
    }
    return { $ref: defRef(def) };
}
function withRiders(ctx, path, out, v) {
    return null == out || 'object' !== typeof out ||
        (null == v?.deprecation && null == v?.meta) ? out : annotate(ctx, path, out, v);
}
const DEPRECATION_TEXT = ['msg', 'use', 'since'];
const META_KEYWORD = {
    title: 'title', description: 'description', comment: '$comment', default: 'default',
    examples: 'examples', readOnly: 'readOnly', writeOnly: 'writeOnly', format: 'format',
    contentEncoding: 'contentEncoding', contentMediaType: 'contentMediaType',
    contentSchema: 'contentSchema',
};
// The JSON Schema keywords: one held under `x` would assert where the
// record only annotates, so it is not written.
const KEYWORDS = new Set([
    '$schema', '$id', '$ref', '$anchor', '$dynamicRef', '$dynamicAnchor', '$vocabulary',
    '$comment', '$defs', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
    'dependentSchemas', 'prefixItems', 'items', 'contains', 'properties',
    'patternProperties', 'additionalProperties', 'propertyNames', 'unevaluatedItems',
    'unevaluatedProperties', 'type', 'enum', 'const', 'multipleOf', 'maximum',
    'exclusiveMaximum', 'minimum', 'exclusiveMinimum', 'maxLength', 'minLength',
    'pattern', 'maxItems', 'minItems', 'uniqueItems', 'maxContains', 'minContains',
    'maxProperties', 'minProperties', 'required', 'dependentRequired', 'title',
    'description', 'default', 'deprecated', 'readOnly', 'writeOnly', 'examples',
    'format', 'contentEncoding', 'contentMediaType', 'contentSchema',
]);
// A value's riders as annotations: the first record inline and any other
// in an allOf of annotation-only subschemas, and a deprecation record as
// `deprecated`, its fields under x-aontu-deprecate.
function annotate(ctx, path, out, v) {
    const res = { ...out };
    const dep = v.deprecation;
    if (null != dep) {
        res.deprecated = true;
        const rec = {};
        for (const k of DEPRECATION_TEXT.filter((k) => undefined !== dep[k])) {
            rec[k] = 1 === dep[k].length ? dep[k][0] : dep[k];
        }
        if (0 < Object.keys(rec).length) {
            res['x-aontu-deprecate'] = rec;
        }
    }
    const extra = [];
    for (const layer of null == v.meta ? [] : (0, rider_1.recordLayers)(v.meta)) {
        const part = {};
        for (const [k, val] of Object.entries(layer)) {
            const json = generated(val);
            // A $dynamicRef is no annotation: fromVal reads the first beside the
            // $ref it rides, and the meet the others reached is written already.
            if ('dynamicRef' === k && undefined === res.$dynamicRef) {
                res.$dynamicRef = json;
                continue;
            }
            if ('dynamicRef' === k) {
                lose(ctx, path, '$dynamicRef', 'the value meets more than one dynamic reference, so this one is written as the schema it reached');
                continue;
            }
            // A format the constraint asserts is written already.
            if ('format' === k && 'string' === typeof json && (res.format === json ||
                (res.allOf ?? []).some((m) => 1 === Object.keys(m).length && m.format === json))) {
                continue;
            }
            if ('x' !== k) {
                part[META_KEYWORD[k]] = json;
                continue;
            }
            for (const xk of Object.keys(json).sort(keyorder_1.cmpCodePoint)) {
                const xv = json[xk];
                if (KEYWORDS.has(xk)) {
                    lose(ctx, path, 'meta', 'the unknown keyword ' + xk + ' is a JSON Schema keyword, which ' +
                        'would assert where the record only annotates, so it is DROPPED');
                }
                else {
                    part[xk] = xv;
                }
            }
        }
        if (0 === extra.length && Object.keys(part).every((k) => undefined === res[k])) {
            Object.assign(res, part);
        }
        else if (0 < Object.keys(part).length) {
            extra.push(part);
        }
    }
    if (0 < extra.length) {
        res.allOf = [...(res.allOf ?? []), ...extra];
    }
    return res;
}
// The schema of a literal's kind: what a bare `*x` admits beside x.
function kindOfLiteral(ctx, path, v) {
    const t = scalarType(v);
    loseLeafKind(ctx, path, v.isBigDecimal ? 'BigDecimal' : v.isBigInteger ? 'BigInteger' :
        v.isInteger ? 'Integer' : 'number' === typeof v.peg ? 'Float' : '', t);
    return 'string' === t ? { type: t, minLength: 1 } : { type: t };
}
// A kind beside a constraint the meet holds until an instance arrives
// (`boolean & nof(...)`, `map & len(min(1))`), read as one schema object.
function kindResidue(v) {
    const terms = true === v.isConjunct ? v.peg : [];
    const kind = terms.find((t) => true === t.isScalarKind || true === t.isMapKind || true === t.isListKind);
    const con = terms.find((t) => true === t.isConstraint);
    return 2 === terms.length && undefined !== kind && undefined !== con ?
        { kind, con } : undefined;
}
function fromValInner(ctx, path, v) {
    if (true === v.isPref) {
        // A bare `*x` admits every value of x's kind and prefers x (ADR-004),
        // so `const: x` would refuse what the model admits.
        if (true === v.peg?.isScalar) {
            return { ...kindOfLiteral(ctx, path, v.peg), default: scalarJson(v.peg) };
        }
        const inner = fromVal(ctx, path, v.peg);
        const gen = generated(v.peg);
        return undefined === gen ? inner : { ...inner, default: gen };
    }
    if (true === v.isDisjunct && Array.isArray(v.peg)) {
        return fromDisjunct(ctx, path, v);
    }
    if (true === v.isConstraint) {
        // Arguments the constructor refused (`neq(1, "a")` spans domains)
        // leave a constraint that refuses every peer: it admits nothing.
        return null != v.invalid ? false : fromConstraint(ctx, path, v);
    }
    const residue = (0, BagVal_1.sizingResidue)(v);
    if (undefined !== residue) {
        return {
            ...fromVal(ctx, path, residue.bag),
            ...fromConstraint(ctx, path, residue.con, true === residue.bag.isMap ? 'map' : 'list'),
        };
    }
    const held = kindResidue(v);
    if (undefined !== held) {
        return {
            ...fromVal(ctx, path, held.kind),
            ...fromConstraint(ctx, path, held.con, true === held.kind.isMapKind ? 'map' :
                true === held.kind.isListKind ? 'list' : undefined),
        };
    }
    // The member a second map literal expects reads through to its constraint.
    if (true === v.isExpect) {
        return fromVal(ctx, path, v.peg);
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
        loseLeafKind(ctx, path, v.peg?.name, t);
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
        return { const: scalarJson(v), type: scalarType(v) };
    }
    // A written `nil` is bottom and admits nothing; a minted one is a refusal nobody collected.
    if (true === v.isNil && 'literal_nil' === v.why) {
        return false;
    }
    // A held reference, in a template or at a recursion, names its definition.
    const target = true === v.isRecurse ? v.target : true === v.isRef && true === v.absolute ?
        v.peg : undefined;
    const ref = undefined !== target && target.every((t) => 'string' === typeof t) ?
        refTo(ctx, target) : undefined;
    if (undefined !== ref) {
        return ref;
    }
    // A rider held over a residual value carries what its resolve would attach.
    if (true === v.isMetaFunc || true === v.isDeprecateFunc) {
        const carrier = v.resolve(new aontu_1.Aontu().ctx({ collect: true }), [(0, top_1.top)(), ...v.peg.slice(1)]);
        if (true !== carrier.isNil) {
            return withRiders(ctx, path, fromVal(ctx, path, v.peg[0]), carrier);
        }
    }
    lose(ctx, path, residueName(v), NOT_YET);
    return {};
}
function residueName(v) {
    return true === v.isNil ? 'nil' :
        true === v.isRef ? 'reference' :
            true === v.isFunc ? v.funcname() :
                'unresolved';
}
// The generated JSON of a value, or undefined where it does not
// generate. Used for `default` and for `enum` members: both are VALUES
// in the schema, so a member that is itself a shape has none to give.
function generated(v) {
    const a0 = new aontu_1.Aontu();
    const ctx = a0.ctx({ collect: true });
    const out = v.gen(ctx);
    return 0 === ctx.err.length ? exactJson(out) : undefined;
}
// The keywords each JSON type's instances answer to; any other instance
// passes them, so a schema of one type's keywords constrains it alone.
const NUMBER_SCOPE = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
    'multipleOf'];
const KIND_SCOPE = {
    null: [], boolean: [], number: NUMBER_SCOPE, integer: NUMBER_SCOPE,
    string: ['minLength', 'maxLength', 'pattern', 'format', 'x-aontu-format', 'contentEncoding',
        'contentMediaType', 'contentSchema'],
    object: ['properties', 'required', 'additionalProperties', 'patternProperties',
        'propertyNames', 'minProperties', 'maxProperties', 'dependentRequired',
        'dependentSchemas'],
    array: ['prefixItems', 'items', 'minItems', 'maxItems', 'contains', 'minContains',
        'maxContains', 'uniqueItems'],
};
// A member's own `type` may name its type; an `allOf` entry's may not, as
// a folded `allOf` applies to every instance.
function scoped(m, t, top) {
    return null != m && 'object' === typeof m && Object.keys(m).every((k) => 'type' === k ? top && t === m.type : KIND_SCOPE[t].includes(k) ||
        ('allOf' === k && m.allOf.every((x) => scoped(x, t, false))));
}
// The kind split read back: members of distinct types, each holding only
// its own type's keywords, are one schema object, typed unless every type
// is there. Anything else keeps the `anyOf`.
function typeFold(members) {
    const types = members.map((m) => m.type);
    const kinds = types.map((t) => 'integer' === t ? 'number' : t);
    if (!members.every((m, i) => undefined !== KIND_SCOPE[types[i]] &&
        scoped(m, types[i], true)) || new Set(kinds).size !== kinds.length) {
        return { anyOf: members };
    }
    const out = {};
    for (const m of members) {
        for (const k of Object.keys(m).filter((k) => 'type' !== k)) {
            out[k] = 'allOf' === k ? [...(out.allOf ?? []), ...m.allOf] : m[k];
        }
    }
    return 6 === kinds.length && !types.includes('integer') ? out : { ...out, type: types };
}
function fromDisjunct(ctx, path, v) {
    const members = v.peg;
    let def = undefined;
    for (const m of members) {
        if (true === m?.isPref && undefined === def) {
            def = generated(m.peg);
        }
    }
    const bare = members.map((m) => true === m?.isPref ? m.peg : m);
    const consts = bare.map((m) => true === m?.isScalar && true !== m?.isNil ? scalarJson(m) : undefined);
    const out = consts.every((c) => undefined !== c) ?
        { enum: dedupeJson(consts) } :
        typeFold(bare.map((m) => fromVal(ctx, path, m)));
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
function spreadTerms(v) {
    return true === v.isConjunct ? v.peg.flatMap(spreadTerms) : [v];
}
// The functions whose meaning does not depend on where they sit.
const ISOLABLE_FUNCS = [
    'above', 'below', 'close', 'contains', 'deprecate', 'empty', 'format', 'len',
    'lower', 'match', 'max', 'meta', 'min', 'multiple', 'must', 'neq', 'nof',
    'open', 'pref', 're', 'unique', 'upper', 'when',
];
// The level key() reads; undefined where its argument is not one.
function keyLevel(f) {
    const a = f.peg[0];
    return undefined === a ? 1 : true === a.isInteger ? a.peg :
        true === a.isBigInteger ? Number(a.peg) : undefined;
}
// A template that reaches no key or path outside itself means the same
// wherever it sits, so it can be read alone. `level` counts the
// containers between the template's own node and v.
function isolable(v, level) {
    const all = (vs, at) => vs.every((x) => isolable(x, at));
    if (true === v.isRef || true === v.isRecurse) {
        return false;
    }
    if (true === v.isFunc) {
        const name = v.funcname();
        if ('key' === name) {
            const n = keyLevel(v);
            return undefined !== n && n < level;
        }
        return ISOLABLE_FUNCS.includes(name) && all(v.peg, level);
    }
    if (true === v.isMap || true === v.isList) {
        const spread = v.spread?.cj;
        return all([...Object.values(v.peg), ...(null == spread ? [] : [spread])], level + 1);
    }
    if (true === v.isConjunct || true === v.isDisjunct) {
        return all(v.peg, level);
    }
    if (true === v.isPref) {
        return isolable(v.peg, level);
    }
    if (true === v.isConstraint) {
        return all([...(v.pending?.args ?? []), ...v.musts.map((m) => m.v),
            ...(0, walk_1.settledTrials)(v)], level);
    }
    return true === v.done;
}
// A held template that can be read alone is read as the value it is, riders
// and all; one that cannot keeps its residue, which reports itself.
function armOut(ctx, path, r) {
    if (true === r.done || !isolable(r, 0)) {
        return fromVal(ctx, path, r);
    }
    const a0 = new aontu_1.Aontu();
    const actx = a0.ctx({ collect: true });
    const met = a0.unify((0, utility_1.canonRiders)(r), undefined, actx);
    return 0 < actx.err.length ? false : fromVal(ctx, path, met);
}
// A spread guarded by its key, match(key(0), test, result, ..., default),
// as its arms and default; undefined for any other spread.
function keyArms(v) {
    const key = v.peg?.[0];
    if (true !== v.isMatchFunc || true !== key?.isKeyFunc || 0 !== keyLevel(key)) {
        return undefined;
    }
    const def = 0 === v.peg.length % 2 ? v.peg[v.peg.length - 1] : undefined;
    const arms = [];
    for (let i = 1; i < v.peg.length - (undefined === def ? 0 : 1); i += 2) {
        arms.push([v.peg[i], v.peg[i + 1]]);
    }
    return { arms, def };
}
// An arm's key test: a name, or a pattern's normalised source.
function armTest(ctx, path, test) {
    if (true === test.isScalar && 'string' === typeof test.peg) {
        return { name: test.peg };
    }
    const s = armOut({ ...ctx, lossy: [], scratch: true }, path, test);
    return 'string' === s.type && 'string' === typeof s.pattern && 2 === Object.keys(s).length ?
        { re: s.pattern } : {};
}
// What a key the arms leave unmatched may hold: nothing without a default.
function restOut(ctx, path, def) {
    return undefined === def || true === def.isNil ? false :
        true === def.isTop ? undefined : armOut(ctx, path, def);
}
// A key test as propertyNames, its `type: string` dropped: every key is one.
function asNames(s) {
    if ('string' !== s.type) {
        return s;
    }
    const { type: _string, ...names } = s;
    return names;
}
// The arms of one guarded spread as one schema object. Where arms repeat
// a key, the first takes it, as match does.
function armsPart(ctx, path, g, def) {
    const part = {};
    g.arms.forEach(([, r], i) => {
        const t = g.tests[i];
        const key = undefined === t.name ? 'patternProperties' : 'properties';
        const name = t.name ?? t.re;
        if (undefined === part[key]?.[name]) {
            part[key] = { ...part[key], [name]: armOut(ctx, path, r) };
        }
    });
    return undefined === def ? part : { ...part, additionalProperties: def };
}
// A map's spreads guarded by their key, as the keywords they came from
// (the design's section 6); undefined when no term of the spread is one.
// `declared` is the map's own properties.
function spreadKeywords(ctx, path, declared, spr) {
    const terms = spreadTerms(spr);
    const guarded = terms.map(keyArms);
    if (guarded.every((g) => undefined === g)) {
        return undefined;
    }
    const at = [...path, '&'];
    const out = {};
    const extra = [];
    const patterns = {};
    const rest = [];
    terms.forEach((t, i) => {
        const g = guarded[i];
        if (undefined === g) {
            extra.push({ additionalProperties: armOut(ctx, at, t) });
            return;
        }
        const tests = g.arms.map(([test]) => armTest(ctx, at, test));
        const [arm] = g.arms;
        const re = tests[0]?.re;
        if (1 === g.arms.length && undefined !== re && true === g.def?.isTop) {
            const s = armOut(ctx, at, arm[1]);
            if (undefined === patterns[re]) {
                patterns[re] = s;
            }
            else {
                extra.push({ patternProperties: { [re]: s } });
            }
        }
        else if (1 === g.arms.length && undefined === tests[0].name && undefined === re &&
            true === arm[1].isTop && true === g.def?.isNil) {
            const names = asNames(armOut(ctx, at, arm[0]));
            if (undefined === out.propertyNames) {
                out.propertyNames = names;
            }
            else {
                extra.push({ propertyNames: names });
            }
        }
        else {
            rest.push({ ...g, tests });
        }
    });
    if (0 < Object.keys(patterns).length) {
        out.patternProperties = patterns;
    }
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const own = [...declared].sort(keyorder_1.cmpCodePoint);
    const patternKeys = Object.keys(patterns).sort(keyorder_1.cmpCodePoint);
    for (const g of rest) {
        const names = g.tests.filter((t) => undefined !== t.name).map((t) => t.name).sort(keyorder_1.cmpCodePoint);
        const res = g.tests.filter((t) => undefined !== t.re).map((t) => t.re).sort(keyorder_1.cmpCodePoint);
        const def = restOut(ctx, at, g.def);
        const anyArm = g.arms.every(([, r]) => true === r.isTop);
        if (names.length + res.length < g.arms.length) {
            lose(ctx, at, 'match', 'JSON Schema chooses a member\'s schema by its name or a pattern, so an ' +
                'arm testing its key any other way has no spelling, and this spread is DROPPED');
        }
        else if (anyArm && undefined === out.additionalProperties &&
            same(names, own) && same(res, patternKeys)) {
            if (undefined !== def) {
                out.additionalProperties = def;
            }
        }
        else if (anyArm || 0 === res.length || 1 === g.arms.length) {
            extra.push(armsPart(ctx, at, g, def));
        }
        else {
            lose(ctx, at, 'match', 'arms whose keys can overlap have no JSON Schema spelling, since every ' +
                'matching keyword applies where match takes the first arm, so this ' +
                'spread is DROPPED');
        }
    }
    if (0 < extra.length) {
        out.allOf = extra;
    }
    return out;
}
// A list's spreads, each guarded by the index with its arms "0" to "n-1"
// in order, as prefixItems and items; undefined when no term is one.
function listKeywords(ctx, path, spr) {
    const terms = spreadTerms(spr);
    const guarded = terms.map(keyArms);
    if (guarded.every((g) => undefined === g)) {
        return undefined;
    }
    const at = [...path, '&'];
    return terms.flatMap((t, i) => {
        const g = guarded[i];
        if (undefined === g) {
            return [{ items: armOut(ctx, at, t) }];
        }
        if (!g.arms.every(([test], j) => true === test.isScalar && String(j) === test.peg)) {
            lose(ctx, at, 'match', 'JSON Schema places a list member by its position from the first, so ' +
                'arms that are not the positions in order have no spelling, and this ' +
                'spread is DROPPED');
            return [];
        }
        const out = { prefixItems: g.arms.map(([, r]) => armOut(ctx, at, r)) };
        const items = restOut(ctx, at, g.def);
        return [undefined === items ? out : { ...out, items }];
    });
}
function fromMap(ctx, path, v) {
    const props = {};
    const required = [];
    const optional = v.optionalKeys;
    let spread = undefined;
    for (const key of Object.keys(v.peg).sort(keyorder_1.cmpCodePoint)) {
        const child = v.peg[key];
        if (v.aliasKeys.includes(key)) {
            continue;
        }
        // A marked child does not generate, so it is not part of the value
        // a consumer produces -- and a schema that demanded it would refuse
        // every correct document. Inside a marked container (an export
        // anchored in a `type()` block) the marks are the container's own.
        if (skipMarked(ctx, [...path, key], v, child)) {
            continue;
        }
        props[key] = fromVal(ctx, [...path, key], child);
        if (!optional.includes(key)) {
            required.push(key);
        }
    }
    const spr = v.spread?.cj;
    const shaped = null == spr ? undefined : spreadKeywords(ctx, path, Object.keys(props), spr);
    if (null != spr && undefined === shaped) {
        spread = armOut(ctx, [...path, '&'], spr);
    }
    const out = { type: 'object', properties: props };
    if (0 < required.length) {
        out.required = required;
    }
    // CLOSEDNESS IS THE ONE THING JSON SCHEMA SAYS EXACTLY AS AONTU DOES.
    // A closed map is `additionalProperties: false`; an open one leaves
    // the keyword off, since JSON Schema's default is already open.
    if (true === v.closed) {
        out.additionalProperties = false;
    }
    else if (undefined !== shaped) {
        Object.assign(out, shaped);
    }
    else if (null != spread) {
        out.additionalProperties = spread;
    }
    return out;
}
function fromList(ctx, path, v) {
    const els = v.peg.filter((el, i) => !skipMarked(ctx, [...path, String(i)], v, el));
    const spr = v.spread?.cj;
    const out = { type: 'array' };
    if (0 < els.length) {
        out.prefixItems = els.map((el) => fromVal(ctx, [...path, String(v.peg.indexOf(el))], el));
        out.minItems = els.length;
    }
    // An open list admits anything after its positions, as the meet does.
    const shaped = null == spr ? undefined : listKeywords(ctx, path, spr);
    if (undefined !== shaped) {
        Object.assign(out, 0 === els.length && 1 === shaped.length ? shaped[0] :
            0 === shaped.length ? {} : { allOf: shaped });
    }
    else if (null != spr) {
        out.items = armOut(ctx, [...path, '&'], spr);
    }
    else if (true === v.closed) {
        out.items = false;
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
    const ctx = {
        lossy: [],
        refs: { root, defs: new Map(), names: new Set(), plain: new Map(), inside: [], dynamic: [] },
    };
    const body = fromVal(ctx, anchor, node);
    // A root admitting nothing cannot carry `$schema` as `false`; `not: {}` can.
    const schema = { $schema: DRAFT };
    if ('object' === typeof body) {
        Object.assign(schema, body);
    }
    else {
        schema.not = {};
    }
    const lossy = withDefs(ctx, schema, body);
    return {
        verdict: 0 < lossy.length ? 'lossy' : 'ok',
        schema,
        lossy,
    };
}
// The definitions used go under $defs, but one that says what the whole
// schema says is `#`, an alias's losses the schema's. A loss met twice is one.
function withDefs(ctx, schema, body) {
    const moved = new Map();
    unclone(schema, body, [...ctx.refs.defs.values()].filter((d) => d.used).sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.name, b.name)), moved);
    const used = [...ctx.refs.defs.values()].filter((d) => d.used)
        .sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.name, b.name));
    const whole = (0, exactjson_1.exactJSON)(body);
    const folded = used.filter((d) => (0, exactjson_1.exactJSON)(d.schema) === whole);
    const kept = used.filter((d) => !folded.includes(d));
    const named = identify(schema, folded, kept);
    if (0 < kept.length) {
        schema.$defs = Object.fromEntries(kept.map((d) => [d.name, d.schema]));
    }
    const to = new Map(folded.map((d) => [defRef(d), '#']));
    relink(schema, to);
    to.forEach((ref, from) => moved.set(from, ref));
    const dynamic = dynamicRefs(ctx, schema, kept, moved);
    // A use written as the $ref of another definition that says the same
    // leaves this one unwritten, and with it the identity it was declared with.
    const unwritten = [...ctx.refs.defs.values()]
        .filter((d) => true === d.reached && !d.used && !moved.has(defRef(d)))
        .sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.name, b.name))
        .flatMap((d) => IDENTITY_KEYWORD.filter(([key]) => 0 < (d.value.identity?.[key]?.length ?? 0))
        .map(([, construct]) => ({ path: pathText(d.path), construct,
        reason: 'its uses are written as another definition that says the same, so it is not written' })));
    const gone = folded.filter((d) => aliasname_1.ALIAS_NAME_RE.test(d.path[0])).map((d) => pathText(d.path));
    const seen = new Set();
    const lossy = [];
    for (const l of [...ctx.lossy, ...named, ...unwritten, ...dynamic]) {
        const key = (0, exactjson_1.exactJSON)(l);
        if (!seen.has(key) && !gone.some((g) => l.path === g || l.path.startsWith(g + '.'))) {
            seen.add(key);
            lossy.push(l);
        }
    }
    return lossy;
}
// ADR-057: the declarations of one schema read in several dynamic scopes
// are one definition where their schemas agree, the $refs of their uses
// included, so the scopes read the same there; each $ref moved is in `moved`.
function unclone(schema, body, used, moved) {
    // Clones share the $defs key a clone's identity names.
    const twins = (u, d) => u !== d && u.used && u.base === d.base &&
        (0, keyorder_1.cmpCodePoint)(u.name, d.name) < 0 &&
        [u, d].some((x) => true === x.value.identity?.defs?.includes(d.base));
    const drop = (d, into) => {
        d.used = false;
        moved.set(defRef(d), defRef(into));
        const to = new Map([[defRef(d), defRef(into)]]);
        for (const v of [schema, body, ...used.filter((u) => u.used).map((u) => u.schema)]) {
            relink(v, to);
        }
    };
    for (let again = true; again;) {
        again = false;
        for (const d of used.filter((u) => u.used)) {
            const twin = used.find((u) => twins(u, d) && (0, exactjson_1.exactJSON)(u.schema) === (0, exactjson_1.exactJSON)(d.schema));
            if (undefined !== twin) {
                drop(d, twin);
                again = true;
            }
        }
    }
}
// ADR-057: a use read from a $dynamicRef is written as one where its anchor
// names, in the export, the schema its $ref reached, in the resource of the
// schema, so the dynamic scope reads it as the import did; otherwise its
// $ref stands, and the dynamic reference is a loss.
function dynamicRefs(ctx, schema, kept, moved) {
    const at = new Map([['#', schema], ...kept.map((d) => [defRef(d), d.schema])]);
    const names = (ref, name) => {
        const s = at.get(ref);
        return null != s && 'object' === typeof s && ('#' === ref || undefined === s.$id) &&
            (name === s.$dynamicAnchor || name === s.$anchor);
    };
    const walk = (v) => {
        if (null == v || 'object' !== typeof v) {
            return;
        }
        if (undefined !== v.$dynamicRef && undefined !== v.$ref) {
            delete v[names(v.$ref, v.$dynamicRef.slice(1)) ? '$ref' : '$dynamicRef'];
        }
        Object.values(v).forEach(walk);
    };
    walk(schema);
    const reached = (ref) => moved.has(ref) ? reached(moved.get(ref)) : ref;
    return ctx.refs.dynamic.filter((u) => !names(reached(u.ref), u.name)).map((u) => ({
        path: pathText(u.path), construct: '$dynamicRef',
        reason: 'its anchor does not name the schema it reached in the export, so it is written as a $ref',
    }));
}
const IDENTITY_KEYWORD = [['id', '$id'], ['anchor', '$anchor'], ['dynamicAnchor', '$dynamicAnchor']];
// ADR-056: a definition's identity is written on it, and a folded one's
// on the schema. An identifier a $ref inside would resolve against is a
// loss, as is an anchor its resource already holds.
function identify(schema, folded, kept) {
    const lossy = [];
    const one = (defs, key, construct, path) => {
        const all = [...new Set(defs.flatMap((d) => d.value.identity?.[key] ?? []))];
        if (1 < all.length) {
            lossy.push({ construct, path, reason: 'the declaration carries more than one, so none is written' });
        }
        return 1 === all.length ? all[0] : undefined;
    };
    const keywords = (id, anchor, dynamic) => ({
        ...(undefined === id ? {} : { $id: id }), ...(undefined === anchor ? {} : { $anchor: anchor }),
        ...(undefined === dynamic ? {} : { $dynamicAnchor: dynamic }),
    });
    const top = one(folded, 'anchor', '$anchor', '$');
    const topDynamic = one(folded, 'dynamicAnchor', '$dynamicAnchor', '$');
    Object.assign(schema, keywords(one(folded, 'id', '$id', '$'), top, topDynamic));
    // An anchor and a dynamic anchor share one namespace in a resource.
    const anchors = new Set([top, topDynamic].filter((a) => undefined !== a));
    for (const d of kept) {
        const path = pathText(d.path);
        let id = one([d], 'id', '$id', path);
        if (undefined !== id && true === d.refers) {
            lossy.push({ construct: '$id', path,
                reason: 'a $ref inside the definition would resolve against it, so it is not written' });
            id = undefined;
        }
        const own = new Set();
        const named = (key, construct) => {
            const name = one([d], key, construct, path);
            if (undefined !== name && undefined === id && anchors.has(name) && !own.has(name)) {
                lossy.push({ construct, path,
                    reason: 'another schema in its resource has the anchor, so it is not written' });
                return undefined;
            }
            return undefined === name ? name : (own.add(name), name);
        };
        const anchor = named('anchor', '$anchor');
        const dynamic = named('dynamicAnchor', '$dynamicAnchor');
        if (undefined === id) {
            own.forEach((a) => anchors.add(a));
        }
        if (undefined !== id || 0 < own.size) {
            d.schema = { ...keywords(id, anchor, dynamic),
                ...('object' === typeof d.schema ? d.schema : { not: {} }) };
        }
    }
    return lossy;
}
// Every $ref a folded definition had, pointed at the schema itself.
function relink(v, to) {
    if (null == v || 'object' !== typeof v) {
        return;
    }
    for (const k of Object.keys(v)) {
        if ('$ref' === k && to.has(v[k])) {
            v[k] = to.get(v[k]);
        }
        else {
            relink(v[k], to);
        }
    }
}
//# sourceMappingURL=jsonschema.js.map
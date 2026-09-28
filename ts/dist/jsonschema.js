"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonSchema = jsonSchema;
/* Copyright (c) 2025 Richard Rodger, MIT License */
const utility_1 = require("./utility");
const aontu_1 = require("./aontu");
const err_1 = require("./err");
const BagVal_1 = require("./val/BagVal");
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
// A path is its address string at the JSON boundary, and the schema
// cannot say which strings are addresses.
function losePath(ctx, path) {
    lose(ctx, path, 'path', 'a path admits only path values, but JSON Schema has no path type; ' +
        'the schema says "string" and admits any string here');
}
function scalarJson(v) {
    if (v.isBigInteger) {
        return Number(v.peg);
    }
    if (v.isBigDecimal) {
        return Number(v.peg.toString());
    }
    return v.peg;
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
function fromConstraint(ctx, path, c) {
    const out = {};
    if (null != c.kind && null != KIND_TYPE[c.kind.name]) {
        out.type = KIND_TYPE[c.kind.name];
    }
    else if ('string' === c.domain) {
        out.type = 'string';
    }
    else if ('number' === c.domain) {
        out.type = 'number';
    }
    if (null != c.lo) {
        out[c.lo.open ? 'exclusiveMinimum' : 'minimum'] = scalarJson(c.lo.v);
    }
    if (null != c.hi) {
        out[c.hi.open ? 'exclusiveMaximum' : 'maximum'] = scalarJson(c.hi.v);
    }
    // Exclusions. `neq(1,2)` is "not one of these", which is exactly
    // `not: {enum: [...]}`.
    if (0 < c.neqs.length) {
        out.not = { enum: c.neqs.map(scalarJson) };
    }
    if (1 === c.res.length) {
        out.pattern = c.res[0].src;
    }
    else if (1 < c.res.length) {
        out.allOf = c.res.map((r) => ({ pattern: r.src }));
    }
    if (null != c.count) {
        const lo = null == c.count.lo ? undefined : scalarJson(c.count.lo.v);
        const hi = null == c.count.hi ? undefined : scalarJson(c.count.hi.v);
        const str = 'string' === c.domain || 'string' === out.type;
        if (null != lo) {
            out[str ? 'minLength' : 'minItems'] = lo;
        }
        if (null != hi) {
            out[str ? 'maxLength' : 'maxItems'] = hi;
        }
        if (!str && null == c.domain) {
            lose(ctx, path, 'len', 'a count with no domain is exported as minItems/maxItems; ' +
                'JSON Schema has no keyword that counts a string OR a container');
        }
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
        lose(ctx, path, 'must', 'an evaluate-only check is opaque by construction -- it carries ' +
            'the author\'s own message and the algebra never reasons about ' +
            'it -- so it is DROPPED and the schema admits values `vet` refuses');
    }
    return out;
}
function fromVal(ctx, path, v) {
    const out = fromValInner(ctx, path, v);
    const dep = v?.deprecation;
    if (null != dep && null != out && 'object' === typeof out) {
        const said = DEPRECATION_TEXT.filter((k) => null != dep[k]);
        if (0 < said.length) {
            lose(ctx, path, 'deprecate', 'JSON Schema 2020-12 has the `deprecated` flag and no field for ' +
                'what it SAYS, so ' + said.join('/') + ' cannot cross; the ' +
                'schema marks the property deprecated and a consumer must read ' +
                'the model for the reason');
        }
        return { ...out, deprecated: true };
    }
    return out;
}
const DEPRECATION_TEXT = ['msg', 'use', 'since'];
function fromValInner(ctx, path, v) {
    if (true === v.isPref) {
        const inner = fromVal(ctx, path, v.peg);
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
        return {
            ...fromVal(ctx, path, residue.bag),
            ...fromConstraint(ctx, path, residue.con),
        };
    }
    if (true === v.isMap) {
        return fromMap(ctx, path, v);
    }
    if (true === v.isList) {
        return fromList(ctx, path, v);
    }
    if (true === v.isScalarKind) {
        const t = KIND_TYPE[v.peg?.name];
        if ('BigInteger' === v.peg?.name || 'BigDecimal' === v.peg?.name) {
            lose(ctx, path, v.peg.name.toLowerCase(), 'JSON has one number type and it is binary64, so the EXACTNESS ' +
                'this leaf exists for cannot be carried; the schema says ' +
                '"' + t + '" and a consumer may round');
        }
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
        if (v.isBigInteger || v.isBigDecimal) {
            lose(ctx, path, 'exact literal', 'JSON has one number type and it is binary64, so this exact ' +
                'value is emitted as the nearest JSON number');
        }
        return { const: scalarJson(v), type: scalarType(v) };
    }
    lose(ctx, path, residueName(v), 'this is not a value yet, so there is nothing to constrain a ' +
        'consumer to; the schema admits anything here');
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
    return 0 === ctx.err.length ? out : undefined;
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
        { enum: consts } :
        { anyOf: bare.map((m) => fromVal(ctx, path, m)) };
    return undefined === def ? out : { ...out, default: def };
}
function fromMap(ctx, path, v) {
    const props = {};
    const required = [];
    const optional = v.optionalKeys;
    let spread = undefined;
    for (const key of Object.keys(v.peg).sort()) {
        const child = v.peg[key];
        // A hidden child does not generate, so it is not part of the value
        // a consumer produces -- and a schema that demanded it would refuse
        // every correct document.
        if (true === child?.mark?.hide) {
            lose(ctx, [...path, key], 'hide', 'a hidden entry is not generated, so it is omitted from the ' +
                'schema; a consumer is neither asked for it nor allowed to know ' +
                'about it');
            continue;
        }
        props[key] = fromVal(ctx, [...path, key], child);
        if (!optional.includes(key)) {
            required.push(key);
        }
    }
    const spr = v.spread?.cj;
    if (null != spr) {
        spread = fromVal(ctx, [...path, '&'], spr);
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
        if (null != spread) {
            lose(ctx, path, '&:', 'a spread on a CLOSED map constrains keys that cannot exist, ' +
                'so additionalProperties:false stands alone and the template ' +
                'is dropped');
        }
    }
    else if (null != spread) {
        // A spread IS additionalProperties-with-a-schema: every key the
        // author did not name must still satisfy the template.
        out.additionalProperties = spread;
    }
    return out;
}
function fromList(ctx, path, v) {
    const els = v.peg;
    const spr = v.spread?.cj;
    // A list with a spread template is homogeneous: every element, named
    // or not, satisfies it. That is `items`.
    if (null != spr) {
        const out = {
            type: 'array',
            items: fromVal(ctx, [...path, '&'], spr),
        };
        if (0 < els.length) {
            out.minItems = els.length;
        }
        return out;
    }
    return {
        type: 'array',
        prefixItems: els.map((el, i) => fromVal(ctx, [...path, String(i)], el)),
        items: false,
        minItems: els.length,
    };
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
    const ctx = { lossy: [] };
    const body = fromVal(ctx, anchor, node);
    return {
        verdict: 0 < ctx.lossy.length ? 'lossy' : 'ok',
        schema: { $schema: DRAFT, ...body },
        lossy: ctx.lossy,
    };
}
//# sourceMappingURL=jsonschema.js.map
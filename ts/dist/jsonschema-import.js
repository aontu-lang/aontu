"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMPORT_VET_FLAGS = void 0;
exports.parseJson = parseJson;
exports.importJsonSchema = importJsonSchema;
exports.agreedForm = agreedForm;
const hints_1 = require("./hints");
const admit_1 = require("./admit");
const keyorder_1 = require("./keyorder");
const aontu_1 = require("./aontu");
const err_1 = require("./err");
const format_1 = require("./format");
const ConstraintVal_1 = require("./val/ConstraintVal");
const numkind_1 = require("./val/numkind");
const uri_1 = require("./uri");
exports.IMPORT_VET_FLAGS = ['--no-fill', '--exact-numbers'];
const JSON_DEPTH = 256;
const JSON_ESCAPES = {
    '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
};
const NUMBER_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/;
function parseJson(src) {
    let i = 0;
    let fault = undefined;
    const fail = (why, at = i, end) => {
        fault = undefined === end ? { why, off: at } : { why, off: at, end };
        return undefined;
    };
    const skip = () => {
        while (i < src.length && (' ' === src[i] || '\t' === src[i] ||
            '\n' === src[i] || '\r' === src[i])) {
            i++;
        }
    };
    const hex4 = (at) => /^[0-9a-fA-F]{4}$/.test(src.slice(at, at + 4)) ? parseInt(src.slice(at, at + 4), 16) : -1;
    const str = () => {
        const start = i;
        i++;
        let out = '';
        while (i < src.length) {
            const c = src[i];
            if ('"' === c) {
                i++;
                return out;
            }
            if ('\\' === c) {
                const e = src[i + 1];
                if ('u' === e) {
                    let cp = hex4(i + 2);
                    if (cp < 0) {
                        return fail('a \\u escape without four hex digits');
                    }
                    i += 6;
                    // A pair of escapes is one code point; a lone half is not one.
                    if (0xd800 <= cp && cp < 0xdc00 && '\\' === src[i] && 'u' === src[i + 1]) {
                        const lo = hex4(i + 2);
                        if (0xdc00 <= lo && lo < 0xe000) {
                            cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
                            i += 6;
                        }
                    }
                    out += 0xd800 <= cp && cp < 0xe000 ? '\ufffd' : String.fromCodePoint(cp);
                    continue;
                }
                if (undefined === e || undefined === JSON_ESCAPES[e]) {
                    return fail('an escape JSON does not have');
                }
                out += JSON_ESCAPES[e];
                i += 2;
                continue;
            }
            if (c < ' ') {
                return fail('a control character inside a string');
            }
            out += c;
            i++;
        }
        return fail('an unterminated string', start);
    };
    const value = (depth) => {
        skip();
        const off = i;
        const c = src[i];
        if (undefined === c) {
            return fail('a value is missing');
        }
        if (('{' === c || '[' === c) && JSON_DEPTH <= depth) {
            fault = { why: 'nested too deep', off, deep: true };
            return undefined;
        }
        if ('{' === c) {
            i++;
            const entries = [];
            skip();
            if ('}' === src[i]) {
                i++;
                return { t: 'object', entries, off, end: i };
            }
            for (;;) {
                skip();
                if ('"' !== src[i]) {
                    return fail('an object key must be a string');
                }
                const keyOff = i;
                const key = str();
                if (undefined === key) {
                    return undefined;
                }
                if (entries.some((en) => en.key === key)) {
                    return fail('a duplicate key', keyOff, i);
                }
                skip();
                if (':' !== src[i]) {
                    return fail('a colon is missing');
                }
                i++;
                const val = value(depth + 1);
                if (undefined === val) {
                    return undefined;
                }
                entries.push({ key, val });
                skip();
                if (',' === src[i]) {
                    i++;
                    continue;
                }
                if ('}' === src[i]) {
                    i++;
                    return { t: 'object', entries, off, end: i };
                }
                return fail('a comma or a closing brace is missing');
            }
        }
        if ('[' === c) {
            i++;
            const items = [];
            skip();
            if (']' === src[i]) {
                i++;
                return { t: 'array', items, off, end: i };
            }
            for (;;) {
                const it = value(depth + 1);
                if (undefined === it) {
                    return undefined;
                }
                items.push(it);
                skip();
                if (',' === src[i]) {
                    i++;
                    continue;
                }
                if (']' === src[i]) {
                    i++;
                    return { t: 'array', items, off, end: i };
                }
                return fail('a comma or a closing bracket is missing');
            }
        }
        if ('"' === c) {
            const s = str();
            return undefined === s ? undefined : { t: 'string', s, off, end: i };
        }
        for (const word of ['true', 'false', 'null']) {
            if (src.startsWith(word, i)) {
                i += word.length;
                return { t: word, off, end: i };
            }
        }
        const num = NUMBER_RE.exec(src.slice(i));
        if (null != num) {
            i += num[0].length;
            return { t: 'number', text: num[0], off, end: i };
        }
        return fail('an unexpected character');
    };
    const out = value(0);
    if (undefined !== out) {
        skip();
        if (i < src.length) {
            fail('text after the document');
        }
    }
    return fault ?? out;
}
const raw = (text) => ({ k: 'raw', text });
const ANY = raw('any');
const NIL = raw('nil');
function call(name, ...args) {
    return { k: 'call', name, args };
}
function isRaw(e, text) {
    return 'raw' === e.k && text === e.text;
}
// A member written twice is one member, in a meet or a disjunction.
function distinct(items) {
    const seen = new Set();
    return items.filter((it) => {
        const text = print(it, '');
        return seen.has(text) ? false : (seen.add(text), true);
    });
}
// `any` adds nothing to a meet and `nil` is all of it.
function and(items) {
    const flat = [];
    for (const it of items) {
        if ('and' === it.k) {
            flat.push(...it.items);
        }
        else if (!isRaw(it, 'any')) {
            flat.push(it);
        }
    }
    if (flat.some((it) => isRaw(it, 'nil'))) {
        return NIL;
    }
    const uniq = distinct(flat);
    return 0 === uniq.length ? ANY : 1 === uniq.length ? uniq[0] : { k: 'and', items: uniq };
}
function or(items) {
    const uniq = distinct(items);
    return 1 === uniq.length ? uniq[0] : { k: 'or', items: uniq };
}
// A long chain is written as nested groups, so that a parser reading it
// recurses as deep as the groups are, not as long as the chain is.
const GROUP = 32;
function chain(parts, sep) {
    if (parts.length <= GROUP) {
        return parts.join(sep);
    }
    const groups = [];
    for (let i = 0; i < parts.length; i += GROUP) {
        groups.push('(' + parts.slice(i, i + GROUP).join(sep) + ')');
    }
    return chain(groups, sep);
}
// The quote, the backslash, the controls and the line separators are
// escaped; every other character is written as itself.
function quote(s) {
    let out = '"';
    for (const ch of s) {
        const cp = ch.codePointAt(0);
        out += '"' === ch ? '\\"' : '\\' === ch ? '\\\\' : '\n' === ch ? '\\n' :
            '\r' === ch ? '\\r' : '\t' === ch ? '\\t' :
                cp < 0x20 || 0x2028 === cp || 0x2029 === cp ?
                    '\\u' + cp.toString(16).padStart(4, '0') : ch;
    }
    return out + '"';
}
function print(e, indent) {
    switch (e.k) {
        case 'raw':
            return e.text;
        case 'call':
            // The TypeScript parser cannot read a call of three or more whose
            // first argument and a later one are negative (test/spec/divergent.tsv).
            return e.name + '(' + e.args.map((a, i) => 0 === i && 3 <= e.args.length &&
                'raw' === a.k && '-' === a.text[0] ? '(' + a.text + ')' : print(a, indent)).join(', ') + ')';
        case 'and':
            return chain(e.items.map((it) => 'or' === it.k ? '(' + print(it, indent) + ')' : print(it, indent)), ' & ');
        case 'or':
            return chain(e.items.map((it) => print(it, indent)), ' | ');
        case 'list':
            return null != e.items ?
                '[' + e.items.map((it) => print(it, indent)).join(', ') + ']' :
                '[&: ' + print(e.spread, indent) + ']';
        case 'map':
            if (0 === e.entries.length && 0 === e.spreads.length && null == e.decls) {
                return '{}';
            }
            return '{\n' + mapLines(e, indent + '  ').map((l) => indent + '  ' + l + '\n').join('') +
                indent + '}';
    }
}
function mapLines(e, indent) {
    const lines = [...(e.decls ?? [])];
    for (const en of e.entries) {
        lines.push(quote(en.key) + (en.optional ? '?' : '') + ': ' + print(en.val, indent));
    }
    for (const sp of e.spreads) {
        lines.push('&: ' + print(sp, indent));
    }
    return lines;
}
// An alias name from a reference: a letter for how the target was
// named, then the name, every character outside [A-Za-z0-9] written as
// its code point between underscores, so distinct targets never share one.
function encodeName(s) {
    let out = '';
    for (const ch of s) {
        out += /^[A-Za-z0-9]$/.test(ch) ? ch :
            '_' + ch.codePointAt(0).toString(16) + '_';
    }
    return out;
}
// The base of a schema that names no retrieval URI: rooted, so a
// relative identifier resolves as against a real one.
const DEFAULT_ROOT = 'aontu:/';
const DEFAULT_BASE = DEFAULT_ROOT + 'schema';
// The copies a root that is not a map may make before they are cut.
const COPY_BUDGET = 4096;
function rowCol(src, off) {
    let row = 1;
    let col = 1;
    for (let i = 0; i < off && i < src.length; i++) {
        if ('\n' === src[i]) {
            row++;
            col = 1;
        }
        else {
            col++;
        }
    }
    return [row, col];
}
function fail(ctx, code, path, message, off, end) {
    const [row, col] = rowCol(ctx.doc.src, off);
    const text = ctx.doc.src.slice(off, end);
    ctx.errors.push({
        code,
        class: (0, hints_1.codeClass)(code),
        severity: 'error',
        path,
        message,
        hint: (0, err_1.getHint)(code, {}).replace(/\s+$/, ''),
        sites: [{
                file: ctx.doc.file, row, col, len: end - off, role: 'schema', src: text, value: text,
            }],
    });
}
function wrongType(ctx, path, keyword, what, node) {
    fail(ctx, 'jsonschema_schema', path, 'The keyword ' + keyword + ' takes ' + what + '.', node.off, node.end);
}
function lose(ctx, path, construct, reason) {
    if (!ctx.lossy.some((l) => l.path === path && l.construct === construct)) {
        ctx.lossy.push({ path, construct, reason });
    }
}
function entry(node, key) {
    return 'object' === node.t ? node.entries.find((e) => e.key === key)?.val : undefined;
}
function child(ptr, key) {
    return ptr + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1');
}
// The keywords whose values are schemas, walked for identifiers.
const SCHEMA_KEYS = [
    'additionalProperties', 'items', 'propertyNames', 'not', 'if', 'then',
    'else', 'contains', 'unevaluatedItems', 'unevaluatedProperties',
];
const SCHEMA_MAP_KEYS = [
    'properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas',
];
const SCHEMA_LIST_KEYS = ['prefixItems', 'allOf', 'anyOf', 'oneOf'];
function subschemas(node, ptr, visit) {
    if ('object' !== node.t) {
        return;
    }
    for (const e of node.entries) {
        if (SCHEMA_KEYS.includes(e.key)) {
            visit(e.val, child(ptr, e.key));
        }
        else if (SCHEMA_MAP_KEYS.includes(e.key) && 'object' === e.val.t) {
            for (const m of e.val.entries) {
                visit(m.val, child(child(ptr, e.key), m.key));
            }
        }
        else if (SCHEMA_LIST_KEYS.includes(e.key) && 'array' === e.val.t) {
            e.val.items.forEach((it, i) => visit(it, child(ptr, e.key) + '/' + i));
        }
    }
}
function index(ctx, node, ptr, resource, base) {
    ctx.ptrOf.set(node, ptr);
    ctx.docOf.set(node, ctx.doc);
    if ('object' !== node.t) {
        return;
    }
    let here = node === ctx.doc.root ? node : resource;
    const id = entry(node, '$id');
    if (null != id && 'string' !== id.t) {
        wrongType(ctx, child(ptr, '$id'), '$id', 'a string', id);
    }
    else if (null != id) {
        const target = (0, uri_1.resolveUri)(base, id.s);
        const hash = target.indexOf('#');
        if (-1 !== hash && hash < target.length - 1) {
            fail(ctx, 'jsonschema_schema', child(ptr, '$id'), 'The identifier ' +
                quote(id.s) + ' has a fragment, which an identifier may not.', id.off, id.end);
        }
        else {
            base = -1 === hash ? target : target.slice(0, hash);
            here = node;
            register(ctx, (0, uri_1.normalizeUri)(base), node, child(ptr, '$id'), id);
        }
    }
    ctx.resourceOf.set(node, here);
    ctx.baseOf.set(node, base);
    // A dynamic anchor is a plain one as well, in the same namespace.
    for (const key of ['$anchor', '$dynamicAnchor']) {
        const anchor = entry(node, key);
        if (null != anchor && 'string' !== anchor.t) {
            wrongType(ctx, child(ptr, key), key, 'a string', anchor);
        }
        else if (null != anchor) {
            const names = ctx.anchors.get(here) ?? new Map();
            ctx.anchors.set(here, names);
            if (names.has(anchor.s) && names.get(anchor.s) !== node) {
                fail(ctx, 'jsonschema_duplicate', child(ptr, key), 'The anchor ' + quote(anchor.s) + ' is declared twice in one resource.', anchor.off, anchor.end);
            }
            else {
                names.set(anchor.s, node);
            }
        }
    }
    subschemas(node, ptr, (n, p) => index(ctx, n, p, here, base));
}
// One schema per identifier, whichever document declares it, so that no
// entry wins by the order of a walk.
function register(ctx, key, node, path, id) {
    const had = ctx.resources.get(key);
    if (undefined !== had && had !== node) {
        fail(ctx, 'jsonschema_duplicate', path, 'The identifier ' + quote(id.s) +
            ' names a resource declared elsewhere.', id.off, id.end);
    }
    ctx.resources.set(key, node);
}
// A document of the set, read the first time a reference reaches it.
// URIs that hold one text name one document.
function reach(ctx, key) {
    const known = ctx.resources.get(key);
    const text = ctx.documents.get(key);
    if (undefined !== known || undefined === text) {
        return known;
    }
    const same = ctx.byText.get(text);
    if (undefined !== same) {
        ctx.resources.set(key, same.root);
        return same.root;
    }
    const outer = ctx.doc;
    const parsed = parseJson(text);
    const doc = { uri: key, src: text, file: key, root: parsed };
    ctx.doc = doc;
    if ('why' in parsed || !['object', 'true', 'false'].includes(parsed.t)) {
        fail(ctx, 'jsonschema_schema', key + '#', 'The document ' + quote(key) +
            ' is not a schema.', 0, 0);
        ctx.documents.delete(key);
        ctx.doc = outer;
        return undefined;
    }
    ctx.byText.set(text, doc);
    ctx.resources.set(key, parsed);
    index(ctx, parsed, key + '#', parsed, key);
    ctx.doc = outer;
    return parsed;
}
function percentDecode(s) {
    const bytes = [];
    const enc = new TextEncoder();
    for (let i = 0; i < s.length; i++) {
        if ('%' === s[i]) {
            if (!/^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
                return undefined;
            }
            bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
            i += 2;
        }
        else {
            const cp = s.codePointAt(i);
            const ch = String.fromCodePoint(cp);
            bytes.push(...enc.encode(ch));
            i += ch.length - 1;
        }
    }
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
    }
    catch {
        return undefined;
    }
}
// A reference resolved against the referrer's base: a resource, then a
// pointer into it or one of its anchors.
function resolveRef(ctx, from, ref) {
    const target = (0, uri_1.resolveUri)(ctx.baseOf.get(from), ref);
    const hash = target.indexOf('#');
    const res = reach(ctx, (0, uri_1.normalizeUri)(-1 === hash ? target : target.slice(0, hash)));
    const frag = percentDecode(-1 === hash ? '' : target.slice(hash + 1));
    if (undefined === res || undefined === frag) {
        return undefined;
    }
    if ('' === frag) {
        return res;
    }
    if (!frag.startsWith('/')) {
        return ctx.anchors.get(res)?.get(frag);
    }
    let node = res;
    for (const tok of frag.slice(1).split('/')) {
        const key = tok.replace(/~1/g, '/').replace(/~0/g, '~');
        if ('object' === node.t) {
            node = node.entries.find((en) => en.key === key)?.val;
        }
        else if ('array' === node.t && /^(0|[1-9][0-9]*)$/.test(key)) {
            node = node.items[Number(key)];
        }
        else {
            node = undefined;
        }
        if (undefined === node) {
            return undefined;
        }
    }
    // A pointer may end outside every schema position the walk indexed;
    // the schema found there is read in the resource the pointer named.
    if (!ctx.ptrOf.has(node)) {
        const outer = ctx.doc;
        ctx.doc = ctx.docOf.get(res);
        index(ctx, node, ctx.ptrOf.get(res) + frag, res, ctx.baseOf.get(res));
        ctx.doc = outer;
    }
    return node;
}
function targetName(ctx, node, ptr) {
    if (ctx.docOf.get(node).root !== ctx.root) {
        return 'u_' + encodeName(ptr.replace(/#$/, ''));
    }
    if (node === ctx.root) {
        return 'root';
    }
    // An anchor names its target only in the document's own resource:
    // another resource may declare the same name.
    const anchor = entry(node, '$anchor');
    if (null != anchor && 'string' === anchor.t && ctx.resourceOf.get(node) === ctx.root &&
        ctx.anchors.get(ctx.root)?.get(anchor.s) === node) {
        return 'a_' + encodeName(anchor.s);
    }
    const defs = /^#\/\$defs\/([^/]+)$/.exec(ptr);
    if (null != defs) {
        return 'd_' + encodeName(defs[1].replace(/~1/g, '/').replace(/~0/g, '~'));
    }
    return 'p_' + encodeName(ptr.slice(2));
}
// Every target, including one reached only through another target. A
// reference that names nothing yet waits in `misses`.
function collectRefs(ctx, node, seen, misses) {
    if (seen.has(node)) {
        return;
    }
    seen.add(node);
    const ref = entry(node, '$ref');
    if (null != ref && 'string' === ref.t && !follow(ctx, node, ref.s, seen, misses)) {
        misses.push(node);
    }
    subschemas(node, '', (n) => collectRefs(ctx, n, seen, misses));
}
function follow(ctx, node, ref, seen, misses) {
    const outer = ctx.doc;
    ctx.doc = ctx.docOf.get(node);
    const target = resolveRef(ctx, node, ref);
    ctx.doc = outer;
    if (undefined === target) {
        return false;
    }
    if (!ctx.targets.has(target)) {
        const ptr = ctx.ptrOf.get(target);
        ctx.targets.set(target, { name: targetName(ctx, target, ptr), node: target, ptr });
    }
    collectRefs(ctx, target, seen, misses);
    return true;
}
// A document read later may declare what a missed reference names, so
// the misses are tried again until a round indexes nothing new: what
// resolves is the walk order's no more.
function settleRefs(ctx, root) {
    const seen = new Set();
    let misses = [];
    collectRefs(ctx, root, seen, misses);
    for (let known = -1; known !== ctx.ptrOf.size + ctx.resources.size;) {
        known = ctx.ptrOf.size + ctx.resources.size;
        const retry = misses;
        misses = [];
        for (const node of retry) {
            if (!follow(ctx, node, entry(node, '$ref').s, seen, misses)) {
                misses.push(node);
            }
        }
    }
    const outer = ctx.doc;
    for (const node of misses) {
        const ref = entry(node, '$ref');
        ctx.doc = ctx.docOf.get(node);
        fail(ctx, 'jsonschema_ref', child(ctx.ptrOf.get(node), '$ref'), 'The reference ' + quote(ref.s) + ' names no schema the import can reach.', ref.off, ref.end);
    }
    ctx.doc = outer;
}
// What each keyword the importer does not yet carry costs, for its loss.
const NOT_YET = 'the importer does not carry this keyword yet, so it is dropped ' +
    'and the position admits more than the schema does';
// A legacy dialect's keyword asserts there, though the dialect read here
// takes it as an annotation.
const LEGACY = 'a keyword of an earlier dialect, which 2020-12 does not define, ' +
    'so it is dropped and the position admits more than that dialect does';
const LATER = {
    $dynamicRef: NOT_YET, $dynamicAnchor: NOT_YET,
    unevaluatedProperties: NOT_YET, unevaluatedItems: NOT_YET,
    $vocabulary: 'a vocabulary declaration, and the 2020-12 vocabularies are read ' +
        'whatever it says, so it is dropped',
    dependencies: LEGACY, additionalItems: LEGACY,
    $recursiveRef: LEGACY, $recursiveAnchor: LEGACY,
};
// Each annotation keyword's meta() key and the JSON kind it takes.
const ANNOTATED = {
    title: ['title', 'string'], description: ['description', 'string'],
    $comment: ['comment', 'string'], default: ['default', 'any'],
    examples: ['examples', 'array'], readOnly: ['readOnly', 'boolean'],
    writeOnly: ['writeOnly', 'boolean'], format: ['format', 'string'],
    contentEncoding: ['contentEncoding', 'string'],
    contentMediaType: ['contentMediaType', 'string'], contentSchema: ['contentSchema', 'any'],
};
const KIND_TEXT = {
    string: 'a string', boolean: 'a boolean', array: 'an array', object: 'an object',
};
const CARRIED = [
    '$schema', '$id', '$ref', '$defs', 'definitions', '$anchor', 'type', 'deprecated',
    'x-aontu-deprecate',
    'enum', 'const', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
    'dependentSchemas', 'dependentRequired', 'properties', 'required',
    'additionalProperties',
    'patternProperties', 'propertyNames', 'minProperties', 'maxProperties',
    'prefixItems', 'items', 'minItems', 'maxItems', 'contains', 'minContains',
    'maxContains', 'uniqueItems', 'minimum', 'maximum',
    'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength',
    'pattern',
];
const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const KINDS = ['null', 'boolean', 'number', 'string', 'object', 'array'];
// The content keywords annotate a string only, so they ride its branch.
const CONTENT = ['contentEncoding', 'contentMediaType', 'contentSchema'];
const SCOPED = {
    string: ['minLength', 'maxLength', 'pattern', 'contentEncoding', 'contentMediaType'],
    number: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
    object: ['properties', 'required', 'additionalProperties', 'patternProperties',
        'propertyNames', 'minProperties', 'maxProperties'],
    array: ['prefixItems', 'items', 'minItems', 'maxItems', 'contains', 'minContains',
        'maxContains', 'uniqueItems'],
};
// The ECMA-262 whitespace set, what `\s` means in a JSON Schema pattern,
// as a class body both engines read alike.
const ECMA_SPACE = '\\t\\n\\v\\f\\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
// The line terminators of ECMA-262, which `.` does not match.
const ECMA_DOT = '[^\\n\\r\u2028\u2029]';
const RE_META = '\\.+*?()[]{}|^$/-';
function escapeReChar(cp) {
    const ch = String.fromCodePoint(cp);
    return RE_META.includes(ch) ? '\\' + ch :
        cp < 0x20 || 0x7f === cp ? '\\x' + cp.toString(16).padStart(2, '0') : ch;
}
// Stage two of the pattern crossing: ECMA constructs the portable subset
// does not spell are rewritten to what they mean.
function ecmaToPortable(src) {
    let out = '';
    let inClass = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if ('\\' === c) {
            const n = src[i + 1];
            if ('s' === n || 'S' === n) {
                if (inClass && 'S' === n) {
                    return ['', 'a negated \\S inside a character class'];
                }
                out += inClass ? ECMA_SPACE : ('s' === n ? '[' : '[^') + ECMA_SPACE + ']';
                i++;
                continue;
            }
            if ('u' === n) {
                const [cp, len] = unicodeEscape(src, i);
                if (cp < 0) {
                    return ['', 'a \\u escape that names no code point'];
                }
                out += escapeReChar(cp);
                i += len - 1;
                continue;
            }
            if ('c' === n && /^[A-Za-z]$/.test(src[i + 2] ?? '')) {
                out += escapeReChar(src.charCodeAt(i + 2) % 32);
                i += 2;
                continue;
            }
            if ('0' === n && !/^[0-9]$/.test(src[i + 2] ?? '')) {
                out += '\\x00';
                i++;
                continue;
            }
            out += c + (n ?? '');
            i++;
            continue;
        }
        if (inClass) {
            inClass = ']' !== c;
            out += c;
            continue;
        }
        if ('[' === c) {
            inClass = true;
            out += c;
            continue;
        }
        if ('.' === c) {
            out += ECMA_DOT;
            continue;
        }
        if ('(' === c && src.startsWith('(?<', i) && '=' !== src[i + 3] && '!' !== src[i + 3]) {
            const close = src.indexOf('>', i + 3);
            if (-1 === close) {
                return ['', 'an unterminated group name'];
            }
            out += '(?:';
            i = close;
            continue;
        }
        if ('(' === c) {
            const folded = foldCharGroup(src, i);
            if (undefined !== folded) {
                out += folded[0];
                i = folded[1];
                continue;
            }
        }
        out += c;
    }
    return [out, ''];
}
// `\uHHHH`, a surrogate pair of them, or `\u{H...}`: the code point and
// the source length, or -1.
function unicodeEscape(src, i) {
    if ('{' === src[i + 2]) {
        const close = src.indexOf('}', i + 3);
        const hex = -1 === close ? '' : src.slice(i + 3, close);
        const cp = /^[0-9a-fA-F]{1,6}$/.test(hex) ? parseInt(hex, 16) : -1;
        return cp <= 0x10ffff ? [cp, close + 1 - i] : [-1, 0];
    }
    const hex = src.slice(i + 2, i + 6);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        return [-1, 0];
    }
    const hi = parseInt(hex, 16);
    const low = /^\\u([dD][c-fC-F][0-9a-fA-F]{2})/.exec(src.slice(i + 6));
    if (0xd800 <= hi && hi < 0xdc00 && null != low) {
        return [0x10000 + ((hi - 0xd800) << 10) + (parseInt(low[1], 16) - 0xdc00), 12];
    }
    return [hi, 6];
}
// A `(a|b|c)` before a quantifier, every alternative one character, is
// written as `[abc]`, which has the same language: the subset refuses a
// quantified alternation and takes a quantified class.
function foldCharGroup(src, at) {
    let i = at + 1;
    if (src.startsWith('?:', i)) {
        i += 2;
    }
    const members = [];
    for (;;) {
        let one;
        if ('\\' === src[i]) {
            const n = src[i + 1];
            if (undefined === n || /^[dDwWsSuxcpPbBk0-9]$/.test(n)) {
                return undefined;
            }
            one = '\\' + n;
            i += 2;
        }
        else if (undefined === src[i] || '()[]|*+?{}^$.'.includes(src[i])) {
            return undefined;
        }
        else {
            one = String.fromCodePoint(src.codePointAt(i));
            i += one.length;
        }
        members.push('-' === one ? '\\-' : one);
        if ('|' === src[i]) {
            i++;
            continue;
        }
        if (')' !== src[i]) {
            return undefined;
        }
        break;
    }
    const q = src[i + 1];
    if (members.length < 2 || !('*' === q || '+' === q || '?' === q || '{' === q)) {
        return undefined;
    }
    return ['[' + members.join('') + ']', i];
}
function pattern(ctx, path, construct, src) {
    let [portable, why] = ecmaToPortable(src);
    if ('' === why) {
        why = (0, ConstraintVal_1.normaliseRe)(portable)[1];
    }
    if ('' !== why) {
        lose(ctx, path, construct, 'the pattern is outside the portable regex subset, ' +
            'so it is dropped: it holds ' + why);
        return undefined;
    }
    return call('re', raw(quote(portable)));
}
// A JSON number's text, which the reader has already matched, as the
// aontu literal of its exact value.
function exactText(src) {
    return (0, numkind_1.exactNumberText)((0, numkind_1.readExactNumber)(src));
}
// A schema number as the aontu literal of its exact value.
function number(ctx, path, keyword, node) {
    if ('number' !== node.t) {
        wrongType(ctx, path, keyword, 'a number', node);
        return undefined;
    }
    const text = exactText(node.text);
    if (undefined === text) {
        lose(ctx, path, keyword, 'the number ' + node.text +
            ' exceeds the exactness budget, so the keyword is dropped');
    }
    return text;
}
function count(ctx, path, keyword, node) {
    const text = number(ctx, path, keyword, node);
    if (undefined !== text && !/^(0d)?[0-9]+$/.test(text)) {
        wrongType(ctx, path, keyword, 'a non-negative integer', node);
        return undefined;
    }
    return text;
}
// A JSON value as the aontu literal that admits exactly it: a closed
// container, or the scalar in the leaf its value selects. A number past
// the exactness budget equals no number in the data, so it is `nil`.
function literal(ctx, path, keyword, node) {
    switch (node.t) {
        case 'string':
            return raw(quote(node.s));
        case 'number': {
            const text = exactText(node.text);
            if (undefined === text) {
                lose(ctx, path, keyword, 'the number ' + node.text + ' exceeds the ' +
                    'exactness budget, and no number in the data can equal it');
                return NIL;
            }
            return raw(text);
        }
        case 'array':
            return call('close', {
                k: 'list',
                items: node.items.map((it, i) => literal(ctx, path + '/' + i, keyword, it)),
            });
        case 'object':
            return call('close', {
                k: 'map', spreads: [],
                entries: node.entries.map((e) => ({
                    key: e.key, optional: false, val: literal(ctx, child(path, e.key), keyword, e.val),
                })),
            });
        default:
            return raw(node.t);
    }
}
// The JSON kinds an expression can admit, read from its shape: a kind, a
// literal, a container, or a meet or disjunction of them. An alias or a
// call that names no kind may be anything.
const ALL_KINDS = ['null', 'boolean', 'number', 'string', 'object', 'array'];
function kindsOf(e) {
    switch (e.k) {
        case 'raw':
            return rawKinds(e.text);
        case 'and':
            return e.items.reduce((acc, it) => acc.filter((k) => kindsOf(it).includes(k)), ALL_KINDS);
        case 'or':
            return ALL_KINDS.filter((k) => e.items.some((it) => kindsOf(it).includes(k)));
        case 'call':
            return 'empty' === e.name || 're' === e.name ? ['string'] :
                'close' === e.name || rider(e) ? kindsOf(e.args[0]) :
                    ['min', 'max', 'above', 'below', 'multiple'].includes(e.name) ? ['number'] :
                        ALL_KINDS;
        case 'list':
            return ['array'];
        case 'map':
            return ['object'];
    }
}
const RAW_KINDS = new Map([
    ['nil', []], ['true', ['boolean']], ['false', ['boolean']], ['null', ['null']],
    ['boolean', ['boolean']], ['number', ['number']], ['map', ['object']], ['list', ['array']],
]);
function rawKinds(text) {
    return RAW_KINDS.get(text) ?? ('"' === text[0] ? ['string'] :
        /^-?[0-9]/.test(text) ? ['number'] : ALL_KINDS);
}
// The scalar literals an expression is, where it is nothing else.
function literalTexts(e) {
    if (rider(e)) {
        return literalTexts(ridden(e));
    }
    if ('or' === e.k) {
        const each = e.items.map(literalTexts);
        return each.some((t) => undefined === t) ? undefined : each.flat();
    }
    return 'raw' === e.k && ('null' === e.text || 'true' === e.text || 'false' === e.text ||
        '"' === e.text[0] || /^-?[0-9]/.test(e.text)) ? [e.text] : undefined;
}
// A call whose value is its first argument, carrying a record beside it.
function rider(e) {
    return 'call' === e.k && ('meta' === e.name || 'deprecate' === e.name);
}
function ridden(e) {
    return e.args[0];
}
// The expressions directly inside one; a rider's record holds none.
function children(e) {
    if (rider(e)) {
        return [ridden(e)];
    }
    switch (e.k) {
        case 'raw':
            return [];
        case 'and':
        case 'or':
            return e.items;
        case 'call':
            return e.args;
        case 'list':
            return [...(e.items ?? []), ...(null == e.spread ? [] : [e.spread])];
        case 'map':
            return [...e.entries.map((en) => en.val), ...e.spreads];
    }
}
function holdsNilExpr(e) {
    return isRaw(e, 'nil') || children(e).some(holdsNilExpr);
}
// What makes a branch's meet with an instance depend on more than its
// kind, at any depth: a required key, a container's count, a Band B atom,
// closure, or an alias, which may hold any of them.
function blocker(e) {
    const counted = 'and' === e.k && e.items.some((it) => 'call' === it.k && 'len' === it.name) &&
        !kindsOf(e).includes('string');
    const closed = 'list' === e.k ? null != e.items || holdsNilExpr(e.spread) :
        'map' === e.k ? e.entries.some((en) => !en.optional) || e.spreads.some(holdsNilExpr) :
            'call' === e.k && ['nof', 'must', 'when', 'close', 'contains', 'unique'].includes(e.name);
    return ('raw' === e.k && '%' === e.text[0]) || counted || closed ||
        children(e).some(blocker);
}
// anyOf is `|` where at most one branch can survive a meet with any
// instance, and a count of at least one otherwise.
function anyOf(branches) {
    const live = branches.filter((b) => !isRaw(b, 'nil'));
    const literal = live.every((b) => undefined !== literalTexts(b));
    const disjoint = live.every((b, i) => !blocker(b) &&
        live.every((c, j) => j <= i || !kindsOf(b).some((k) => kindsOf(c).includes(k))));
    return 0 === live.length ? NIL : literal || disjoint ? or(live) :
        call('nof', call('min', raw('1')), ...branches);
}
// oneOf is a count of exactly one, or `|` over scalar literals that are
// pairwise distinct, since a scalar equals at most one of them.
function oneOf(branches) {
    const texts = branches.map(literalTexts);
    const flat = texts.flat();
    return !texts.includes(undefined) && new Set(flat).size === flat.length ?
        or(branches) : call('nof', raw('1'), ...branches);
}
// A whole number in every leaf that holds it exactly, as `neq` reads a
// value by its leaf.
function wholeLeaves(text) {
    const n = (0, numkind_1.readExactNumber)(text);
    if ('integer' !== n.leaf && 'biginteger' !== n.leaf) {
        return [];
    }
    const whole = BigInt(n.int);
    const sign = whole < 0n ? '-' : '';
    const mag = (whole < 0n ? -whole : whole).toString();
    return [
        ...('integer' === n.leaf ? [sign + mag] : []),
        ...((0, numkind_1.isExactInBinary64)(whole) ? [sign + mag + '.0'] : []),
        sign + '0d' + mag, sign + '0d' + mag + '.0',
    ];
}
// `not: {enum: [...]}` beside a type of exactly string or integer is that
// kind's exclusion. Without the type it must stay a count of none, or the
// exclusion would refuse every other kind.
function typedExclusion(node, neg) {
    const typed = entry(node, 'type');
    const kind = 'string' !== typed?.t ? undefined : 'string' === typed.s ? 'string' :
        'integer' === typed.s ? 'number' : undefined;
    const en = 'object' === neg.t && 1 === neg.entries.length ? entry(neg, 'enum') : undefined;
    if (undefined === kind || undefined === en || 'array' !== en.t) {
        return undefined;
    }
    const out = [];
    for (const it of en.items) {
        if ('string' === kind && 'string' === it.t) {
            out.push(quote(it.s));
        }
        else if ('number' === kind && 'number' === it.t) {
            out.push(...wholeLeaves(it.text));
        }
    }
    return { [kind]: out };
}
function holdsAlias(e) {
    return ('raw' === e.k && '%' === e.text[0]) || children(e).some(holdsAlias);
}
let TRIAL;
function trialEngine() {
    return TRIAL = TRIAL ?? new aontu_1.Aontu();
}
// Whether a position admits nothing: its meet conflicts when evaluated
// alone. One naming an alias is left as written, as the declaration may
// be being written itself.
function bottom(e) {
    if ('raw' === e.k || holdsAlias(e)) {
        return false;
    }
    const engine = trialEngine();
    const ctx = engine.ctx({ collect: true });
    engine.unify('x: ' + print(e, ''), undefined, ctx);
    return 0 < ctx.err.length &&
        ctx.err.every((n) => 'conflict' === (0, hints_1.codeClass)(n.why));
}
// Under the defaults option, an optional property's default is preferred
// where its own assertions admit it; a reference is not followed, so a
// schema that names an alias keeps its default as an annotation only.
function preferDefault(ctx, node, e) {
    const d = entry(node, 'default');
    const value = undefined === d ? undefined : data({ ...ctx, lossy: [] }, '', 'default', d);
    if (undefined === value || holdsAlias(e)) {
        return e;
    }
    const text = print(value, '');
    const engine = trialEngine();
    const trial = engine.parse(print(e, ''));
    const parsed = engine.parse(text);
    return undefined !== trial && undefined !== parsed && (0, admit_1.admits)(engine, trial, parsed) ?
        { k: 'or', items: [raw('*' + text), e] } : e;
}
function lenOf(lo, hi) {
    const parts = [];
    if (undefined !== lo && '0' !== lo) {
        parts.push(call('min', raw(lo)));
    }
    if (undefined !== hi) {
        parts.push(call('max', raw(hi)));
    }
    return 0 === parts.length ? undefined : call('len', and(parts));
}
// A schema as `A & (B...)`: the kind-agnostic keywords met with the
// disjunction of the kinds, each met with the keywords scoped to it.
// `only` restricts the kinds a position can hold at all.
function convert(ctx, node, ptr, asDecl, only) {
    const outer = ctx.doc;
    ctx.doc = ctx.docOf.get(node);
    const out = convertNode(ctx, node, ptr, asDecl, only);
    ctx.doc = outer;
    return out;
}
function convertNode(ctx, node, ptr, asDecl, only) {
    ctx.seen.add(node);
    if ('true' === node.t) {
        return ANY;
    }
    if ('false' === node.t) {
        return NIL;
    }
    if ('object' !== node.t) {
        fail(ctx, 'jsonschema_schema', ptr, 'A schema is an object or a boolean.', node.off, node.end);
        return ANY;
    }
    const target = ctx.targets.get(node);
    if (null != target && !asDecl) {
        if (ctx.mapRoot) {
            declare(ctx, target);
            return raw('%' + target.name);
        }
        if (ctx.stack.includes(node)) {
            lose(ctx, ptr, '$ref', 'a reference that reaches itself has no alias to name ' +
                'it where the root is not a map, so the cycle is cut and the position admits anything');
            return ANY;
        }
        if (COPY_BUDGET < ++ctx.copies) {
            lose(ctx, ptr, '$ref', 'the copies of referenced schemas a root that is not ' +
                'a map needs exceed the budget, so the position admits anything');
            return ANY;
        }
    }
    ctx.stack.push(node);
    const out = convertObject(ctx, node, ptr, only);
    ctx.stack.pop();
    return out;
}
function declare(ctx, target) {
    if (!ctx.decls.has(target.name)) {
        ctx.decls.set(target.name, '');
        const body = convert(ctx, target.node, target.ptr, true);
        const entries = identity(ctx, target);
        ctx.decls.set(target.name, print(0 === entries.length ? body :
            call('ident', body, { k: 'map', spreads: [], entries }), ''));
    }
}
// ADR-056: the identity a declared schema had, which its declaration
// carries: the entry's own identifier as written, any other resource's
// as its URI, absolute or under the entry's directory; its anchor; and
// the $defs key a name that says the anchor does not say.
function identity(ctx, target) {
    const node = target.node;
    const out = [];
    const anchor = entry(node, '$anchor');
    if ('string' === anchor?.t) {
        out.push({ key: 'anchor', optional: false, val: raw(quote(anchor.s)) });
    }
    const defs = /^#\/\$defs\/([^/]+)$/.exec(target.ptr);
    if (null != defs && target.name.startsWith('a_')) {
        out.push({ key: 'defs', optional: false,
            val: raw(quote(defs[1].replace(/~1/g, '/').replace(/~0/g, '~'))) });
    }
    const id = entry(node, '$id');
    const uri = ctx.baseOf.get(node);
    const dir = ctx.baseOf.get(ctx.root).replace(/[^/]*$/, '');
    const written = node === ctx.root ? ('string' === id?.t ? id.s.replace(/#$/, '') : undefined) :
        null == id && ctx.docOf.get(node).root !== node ? undefined :
            !uri.startsWith(DEFAULT_ROOT) ? uri :
                uri.startsWith(dir) && dir.length < uri.length ? uri.slice(dir.length) : null;
    if (null === written) {
        lose(ctx, child(target.ptr, '$id'), '$id', 'the identifier resolves outside the ' +
            'document\'s directory, with no base URI to write it against, so it is dropped');
    }
    else if (undefined !== written) {
        out.push({ key: 'id', optional: false, val: raw(quote(written)) });
    }
    return out;
}
function convertObject(ctx, node, ptr, only) {
    const get = (k) => entry(node, k);
    const at = (k) => child(ptr, k);
    for (const e of node.entries) {
        if (null != LATER[e.key]) {
            lose(ctx, at(e.key), e.key, LATER[e.key]);
        }
    }
    const dialect = get('$schema');
    if (null != dialect && !('string' === dialect.t && DRAFT === dialect.s)) {
        lose(ctx, at('$schema'), '$schema', 'only the 2020-12 dialect is read, so this ' +
            'schema is read as 2020-12');
    }
    const parts = [];
    const ref = get('$ref');
    if (null != ref) {
        if ('string' !== ref.t) {
            wrongType(ctx, at('$ref'), '$ref', 'a string', ref);
        }
        else {
            const target = resolveRef(ctx, node, ref.s);
            parts.push(convert(ctx, target, ctx.targets.get(target).ptr, false));
        }
    }
    const konst = get('const');
    if (null != konst) {
        parts.push(literal(ctx, at('const'), 'const', konst));
    }
    const enm = get('enum');
    if (null != enm) {
        if ('array' !== enm.t) {
            wrongType(ctx, at('enum'), 'enum', 'an array', enm);
        }
        else {
            const members = enm.items
                .map((it, i) => literal(ctx, at('enum') + '/' + i, 'enum', it))
                .filter((m) => !isRaw(m, 'nil'));
            parts.push(0 === members.length ? NIL : or(members));
        }
    }
    const all = get('allOf');
    if (null != all) {
        if ('array' !== all.t) {
            wrongType(ctx, at('allOf'), 'allOf', 'an array', all);
        }
        else {
            all.items.forEach((it, i) => parts.push(convert(ctx, it, at('allOf') + '/' + i, false, only)));
        }
    }
    for (const [key, carry] of [['anyOf', anyOf], ['oneOf', oneOf]]) {
        const list = get(key);
        if (null != list) {
            if ('array' !== list.t || 0 === list.items.length) {
                wrongType(ctx, at(key), key, 'a non-empty array', list);
            }
            else {
                parts.push(carry(list.items.map((it, i) => convert(ctx, it, at(key) + '/' + i, false, only))));
            }
        }
    }
    const neg = get('not');
    const excluded = null == neg ? undefined : typedExclusion(node, neg);
    if (null != neg && undefined === excluded) {
        parts.push(call('nof', raw('0'), convert(ctx, neg, at('not'), false, only)));
    }
    parts.push(...conditional(ctx, node, ptr, only), ...dependents(ctx, node, ptr, only));
    // The kind split.
    const typed = get('type');
    let allowed = undefined;
    if (null != typed) {
        allowed = [];
        for (const t of 'array' === typed.t ? typed.items : [typed]) {
            if ('string' === t.t && (KINDS.includes(t.s) || 'integer' === t.s)) {
                allowed.push(t.s);
            }
            else {
                wrongType(ctx, at('type'), 'type', 'one of the seven JSON Schema types', t);
            }
        }
    }
    const scoped = (kind) => undefined !== SCOPED[kind] && SCOPED[kind].some((k) => null != get(k));
    const kinds = KINDS.filter((kind) => (undefined === only || only.includes(kind)) &&
        (undefined === allowed ? KINDS.some(scoped) && (undefined === only || scoped(kind)) :
            allowed.includes(kind) || ('number' === kind && allowed.includes('integer'))));
    if (undefined !== allowed || kinds.some(scoped)) {
        const integral = undefined !== allowed && allowed.includes('integer') &&
            !allowed.includes('number');
        const branches = kinds.map((kind) => branch(ctx, node, ptr, kind, integral, excluded));
        parts.push(0 === branches.length ? NIL : or(branches));
    }
    const met = and(parts);
    return bottom(met) ? NIL : annotate(ctx, node, ptr, met);
}
function jsonKind(n) {
    return 'true' === n.t || 'false' === n.t ? 'boolean' : n.t;
}
// A JSON value as aontu data, or undefined where a number in it is past
// the exactness budget, which drops the annotation with a loss.
function data(ctx, path, keyword, node) {
    switch (node.t) {
        case 'number': {
            const text = exactText(node.text);
            if (undefined === text) {
                lose(ctx, path, keyword, 'the number ' + node.text + ' exceeds the ' +
                    'exactness budget, so the annotation that holds it is dropped');
            }
            return undefined === text ? undefined : raw(text);
        }
        case 'array': {
            const items = node.items.map((it, i) => data(ctx, path + '/' + i, keyword, it));
            return items.some((it) => undefined === it) ? undefined : { k: 'list', items: items };
        }
        case 'object': {
            const vals = node.entries.map((e) => data(ctx, child(path, e.key), keyword, e.val));
            return vals.some((v) => undefined === v) ? undefined : {
                k: 'map', spreads: [],
                entries: node.entries.map((e, i) => ({ key: e.key, optional: false, val: vals[i] })),
            };
        }
        default:
            return literal(ctx, path, keyword, node);
    }
}
// A schema object's annotations ride its value: the annotation keywords
// and every keyword JSON Schema does not name in a meta() record, under
// `x` for the second, and `deprecated` as deprecate().
function annotate(ctx, node, ptr, e) {
    const entries = [];
    const x = [];
    for (const en of node.entries) {
        const at = child(ptr, en.key);
        const ann = ANNOTATED[en.key];
        if (undefined !== ann && 'any' !== ann[1] && ann[1] !== jsonKind(en.val)) {
            wrongType(ctx, at, en.key, KIND_TEXT[ann[1]], en.val);
            continue;
        }
        if ((undefined === ann && (CARRIED.includes(en.key) || undefined !== LATER[en.key])) ||
            CONTENT.includes(en.key)) {
            continue;
        }
        const val = data(ctx, at, en.key, en.val);
        if (undefined !== val) {
            (undefined === ann ? x : entries).push({ key: ann?.[0] ?? en.key, optional: false, val });
        }
    }
    if (0 < x.length) {
        entries.push({ key: 'x', optional: false, val: { k: 'map', entries: x, spreads: [] } });
    }
    const dep = deprecation(ctx, node, ptr, e);
    return 0 === entries.length ? dep : call('meta', dep, { k: 'map', spreads: [],
        entries: entries.sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.key, b.key)) });
}
// The content keywords' record on a string branch: `contentSchema` says
// nothing without `contentMediaType`.
function content(ctx, node, ptr, e) {
    const media = entry(node, 'contentMediaType');
    const entries = [];
    for (const key of CONTENT) {
        const v = entry(node, key);
        const val = null == v || ('contentSchema' === key && null == media) ? undefined :
            data(ctx, child(ptr, key), key, v);
        if (undefined !== val) {
            entries.push({ key, optional: false, val });
        }
    }
    return 0 === entries.length ? e : call('meta', e, { k: 'map', spreads: [], entries });
}
// `deprecated: true`, with x-aontu-deprecate's fields as its record; a
// field holding several values is a deprecate() for each.
function deprecation(ctx, node, ptr, e) {
    const flag = entry(node, 'deprecated');
    const rec = entry(node, 'x-aontu-deprecate');
    if (null != flag && 'boolean' !== jsonKind(flag)) {
        wrongType(ctx, child(ptr, 'deprecated'), 'deprecated', 'a boolean', flag);
    }
    if (null != rec && 'object' !== rec.t) {
        wrongType(ctx, child(ptr, 'x-aontu-deprecate'), 'x-aontu-deprecate', 'an object', rec);
    }
    if ('true' !== flag?.t && 'object' !== rec?.t) {
        return e;
    }
    const fields = [];
    for (const k of ['msg', 'since', 'use']) {
        const v = 'object' === rec?.t ? entry(rec, k) : undefined;
        const vals = undefined === v ? [] : 'string' === v.t ? [v] : 'array' === v.t ? v.items : [v];
        if (vals.some((it) => 'string' !== it.t)) {
            wrongType(ctx, child(child(ptr, 'x-aontu-deprecate'), k), 'x-aontu-deprecate', 'a string or an array of strings', v);
            continue;
        }
        vals.forEach((it, i) => {
            fields[i] = fields[i] ?? [];
            fields[i].push(k, it.s);
        });
    }
    if (0 === fields.length) {
        return call('deprecate', e);
    }
    return fields.reduce((acc, layer) => {
        const entries = [];
        for (let i = 0; i < layer.length; i += 2) {
            entries.push({ key: layer[i], optional: false, val: raw(quote(layer[i + 1])) });
        }
        return call('deprecate', acc, { k: 'map', spreads: [], entries });
    }, e);
}
// An `if` pairs with the `then` and `else` of its own schema object. A
// `then` or `else` without one asserts nothing, and so does a lone `if`.
function conditional(ctx, node, ptr, only) {
    const cond = entry(node, 'if');
    const then = entry(node, 'then');
    const els = entry(node, 'else');
    if (null == cond || (null == then && null == els)) {
        return [];
    }
    const arm = (n, k) => convert(ctx, n, child(ptr, k), false, only);
    return [call('when', arm(cond, 'if'), null == then ? ANY : arm(then, 'then'), ...(null == els ? [] : [arm(els, 'else')]))];
}
// The map that holds each of these keys, whatever it holds there.
function present(keys) {
    return {
        k: 'map', spreads: [],
        entries: [...new Set(keys)].map((key) => ({ key, optional: false, val: ANY })),
    };
}
// Each dependent keyword's entry is a conditional on its key's presence.
function dependents(ctx, node, ptr, only) {
    const out = [];
    const schemas = entry(node, 'dependentSchemas');
    const at = (k) => child(ptr, k);
    if ('object' === schemas?.t) {
        for (const e of schemas.entries) {
            out.push(call('when', present([e.key]), convert(ctx, e.val, child(at('dependentSchemas'), e.key), false, only)));
        }
    }
    else if (null != schemas) {
        wrongType(ctx, at('dependentSchemas'), 'dependentSchemas', 'an object', schemas);
    }
    const required = entry(node, 'dependentRequired');
    if ('object' === required?.t) {
        for (const e of required.entries) {
            const names = 'array' === e.val.t ? e.val.items : [];
            if ('array' !== e.val.t || names.some((n) => 'string' !== n.t)) {
                wrongType(ctx, child(at('dependentRequired'), e.key), 'dependentRequired', 'an array of strings', e.val);
            }
            else if (0 < names.length) {
                out.push(call('when', present([e.key]), present(names.map((n) => n.s))));
            }
        }
    }
    else if (null != required) {
        wrongType(ctx, at('dependentRequired'), 'dependentRequired', 'an object', required);
    }
    return out;
}
function branch(ctx, node, ptr, kind, integral, excluded) {
    const exclude = (parts) => 0 < (excluded?.[kind] ?? []).length ?
        [...parts, call('neq', ...excluded[kind].map(raw))] : parts;
    const get = (k) => entry(node, k);
    const at = (k) => child(ptr, k);
    const counted = (lo, hi) => {
        const l = get(lo);
        const h = get(hi);
        return lenOf(null == l ? undefined : count(ctx, at(lo), lo, l), null == h ? undefined : count(ctx, at(hi), hi, h));
    };
    if ('null' === kind || 'boolean' === kind) {
        return raw(kind);
    }
    if ('number' === kind) {
        // An integer is a number with no fraction, whatever its spelling.
        const parts = [raw('number'), ...(integral ? [call('multiple', raw('1'))] : [])];
        for (const [k, fn] of [['minimum', 'min'], ['maximum', 'max'],
            ['exclusiveMinimum', 'above'], ['exclusiveMaximum', 'below'], ['multipleOf', 'multiple']]) {
            const v = get(k);
            const text = null == v ? undefined : number(ctx, at(k), k, v);
            if ('multiple' === fn && undefined !== text && (text.startsWith('-') || '0' === text)) {
                wrongType(ctx, at(k), k, 'a number greater than 0', v);
            }
            else if (undefined !== text) {
                parts.push(call(fn, raw(text)));
            }
        }
        return and(exclude(parts));
    }
    if ('string' === kind) {
        const parts = [call('empty')];
        const len = counted('minLength', 'maxLength');
        if (undefined !== len) {
            parts.push(len);
        }
        const pat = get('pattern');
        if (null != pat) {
            if ('string' !== pat.t) {
                wrongType(ctx, at('pattern'), 'pattern', 'a string', pat);
            }
            else {
                const re = pattern(ctx, at('pattern'), 'pattern', pat.s);
                if (undefined !== re) {
                    parts.push(re);
                }
            }
        }
        return content(ctx, node, ptr, and(exclude(parts)));
    }
    if ('object' === kind) {
        const map = objectBranch(ctx, node, ptr);
        const len = counted('minProperties', 'maxProperties');
        if (undefined === len) {
            return 0 === map.entries.length && 0 === map.spreads.length ? raw('map') : map;
        }
        return and([map, len]);
    }
    const spread = arraySpread(ctx, node, ptr);
    const sized = [counted('minItems', 'maxItems'), containsOf(ctx, node, ptr),
        uniqueOf(ctx, node, ptr)].filter((e) => undefined !== e);
    if (0 === sized.length) {
        return undefined === spread ? raw('list') : { k: 'list', spread };
    }
    // Open by a spread: a literal list alternative admits only its own length.
    return and([{ k: 'list', spread: spread ?? ANY }, ...sized]);
}
// contains counts the items its schema admits, at least one unless
// minContains says otherwise; a count of at least none asserts nothing.
function containsOf(ctx, node, ptr) {
    const has = entry(node, 'contains');
    if (null == has) {
        return undefined;
    }
    const bound = (k) => {
        const v = entry(node, k);
        return null == v ? undefined : count(ctx, child(ptr, k), k, v);
    };
    const lo = bound('minContains') ?? '1';
    const hi = bound('maxContains');
    if ('0' === lo && undefined === hi) {
        return undefined;
    }
    const c = convert(ctx, has, child(ptr, 'contains'), false);
    if ('1' === lo && undefined === hi) {
        return call('contains', c);
    }
    if (lo === hi) {
        return call('contains', c, raw(lo));
    }
    return call('contains', c, and([...('0' === lo ? [] : [call('min', raw(lo))]),
        ...(undefined === hi ? [] : [call('max', raw(hi))])]));
}
function uniqueOf(ctx, node, ptr) {
    const uniq = entry(node, 'uniqueItems');
    if (null != uniq && 'true' !== uniq.t && 'false' !== uniq.t) {
        wrongType(ctx, child(ptr, 'uniqueItems'), 'uniqueItems', 'a boolean', uniq);
    }
    return 'true' === uniq?.t ? call('unique') : undefined;
}
function objectBranch(ctx, node, ptr) {
    const get = (k) => entry(node, k);
    const at = (k) => child(ptr, k);
    const required = [];
    const req = get('required');
    if (null != req) {
        if ('array' !== req.t) {
            wrongType(ctx, at('required'), 'required', 'an array of strings', req);
        }
        else {
            for (const it of req.items) {
                if ('string' !== it.t) {
                    wrongType(ctx, at('required'), 'required', 'an array of strings', it);
                }
                else if (!required.includes(it.s)) {
                    required.push(it.s);
                }
            }
        }
    }
    const entries = [];
    const declared = [];
    const props = get('properties');
    if (null != props) {
        if ('object' !== props.t) {
            wrongType(ctx, at('properties'), 'properties', 'an object', props);
        }
        else {
            for (const e of props.entries) {
                declared.push(e.key);
                const optional = !required.includes(e.key);
                const val = convert(ctx, e.val, child(at('properties'), e.key), false);
                entries.push({
                    key: e.key, optional, val: optional && ctx.defaults ? preferDefault(ctx, e.val, val) : val,
                });
            }
        }
    }
    for (const k of required) {
        if (!declared.includes(k)) {
            entries.push({ key: k, optional: false, val: ANY });
        }
    }
    const spreads = [];
    const patterns = [];
    let patternsExact = true;
    const pats = get('patternProperties');
    if (null != pats) {
        if ('object' !== pats.t) {
            wrongType(ctx, at('patternProperties'), 'patternProperties', 'an object', pats);
        }
        else {
            for (const e of pats.entries) {
                const p = child(at('patternProperties'), e.key);
                const re = pattern(ctx, p, 'patternProperties', e.key);
                if (undefined === re) {
                    patternsExact = false;
                }
                else {
                    patterns.push(re);
                    spreads.push(call('match', call('key', raw('0')), re, convert(ctx, e.val, p, false), ANY));
                }
            }
        }
    }
    const addl = get('additionalProperties');
    if (null != addl && 'true' !== addl.t) {
        if (!patternsExact) {
            lose(ctx, at('additionalProperties'), 'additionalProperties', 'a pattern beside ' +
                'it was dropped, so the names it excludes cannot be spelt, and it is dropped too');
        }
        else {
            const rest = convert(ctx, addl, at('additionalProperties'), false);
            if (0 === declared.length && 0 === patterns.length) {
                spreads.push(rest);
            }
            else {
                const args = [call('key', raw('0'))];
                for (const k of declared) {
                    args.push(raw(quote(k)), ANY);
                }
                for (const re of patterns) {
                    args.push(re, ANY);
                }
                args.push(rest);
                spreads.push({ k: 'call', name: 'match', args });
            }
        }
    }
    const names = get('propertyNames');
    if (null != names && 'true' !== names.t) {
        const guard = convert(ctx, names, at('propertyNames'), false, ['string']);
        if (!isRaw(guard, 'any')) {
            spreads.push(call('match', call('key', raw('0')), guard, ANY, NIL));
        }
    }
    return { k: 'map', entries, spreads };
}
function arraySpread(ctx, node, ptr) {
    const get = (k) => entry(node, k);
    const at = (k) => child(ptr, k);
    const items = get('items');
    const rest = null == items ? ANY : convert(ctx, items, at('items'), false);
    const prefix = get('prefixItems');
    if (null != prefix) {
        if ('array' !== prefix.t) {
            wrongType(ctx, at('prefixItems'), 'prefixItems', 'an array', prefix);
        }
        else {
            const args = [call('key', raw('0'))];
            prefix.items.forEach((it, i) => {
                args.push(raw(quote(String(i))), convert(ctx, it, at('prefixItems') + '/' + i, false));
            });
            args.push(rest);
            return { k: 'call', name: 'match', args };
        }
    }
    return isRaw(rest, 'any') ? undefined : rest;
}
// The map at the heart of a root that only rides or meets it: its
// declarations go there, which is where an alias reference looks.
function coreMap(e) {
    return 'map' === e.k ? e : rider(e) ? coreMap(ridden(e)) :
        'and' === e.k ? e.items.map(coreMap).find((m) => undefined !== m) : undefined;
}
function emit(ctx, root) {
    const decls = [...ctx.decls.keys()].sort(keyorder_1.cmpCodePoint)
        .map((name) => '%' + name + ' = ' + ctx.decls.get(name));
    if (!ctx.mapRoot) {
        return print(root, '') + '\n';
    }
    if ('map' !== root.k) {
        const core = coreMap(root);
        core.decls = 0 === decls.length ? undefined : decls;
        return print(root, '') + '\n';
    }
    return (0 === decls.length ? '' : decls.join('\n') + '\n\n') +
        mapLines(root, '').join('\n') + '\n';
}
function run(base, mapRoot) {
    const ctx = {
        ...base, lossy: [], errors: [], mapRoot, decls: new Map(), stack: [], copies: 0,
    };
    return [ctx, convert(ctx, base.root, '#', true)];
}
function importJsonSchema(text, options) {
    const anonymous = '' === (options?.uri ?? '');
    const uri = (0, uri_1.normalizeUri)((0, uri_1.resolveUri)(DEFAULT_BASE, anonymous ? DEFAULT_BASE : options?.uri)
        .replace(/#.*$/s, ''));
    const doc = { uri, src: text, file: options?.path || 'schema', root: { t: 'null', off: 0, end: 0 } };
    const base = {
        doc, root: doc.root, defaults: true === options?.defaults,
        lossy: [], errors: [], anchors: new Map(), resourceOf: new Map(), ptrOf: new Map(),
        docOf: new Map(), baseOf: new Map(), resources: new Map(), byText: new Map(),
        documents: new Map(), targets: new Map(), mapRoot: true, decls: new Map(), stack: [],
        copies: 0, seen: new Set(),
    };
    // Names for one URI must hold one text, or the set's order would
    // choose between them.
    const given = options?.documents ?? {};
    const first = new Map();
    for (const name of Object.keys(given).sort(keyorder_1.cmpCodePoint)) {
        const key = (0, uri_1.normalizeUri)((0, uri_1.resolveUri)(uri, name).replace(/#.*$/s, ''));
        const had = first.get(key);
        if (undefined === had) {
            first.set(key, name);
            base.documents.set(key, given[name]);
        }
        else if (given[had] !== given[name]) {
            base.doc = { uri: key, src: given[name], file: name, root: doc.root };
            fail(base, 'jsonschema_duplicate', key + '#', 'The documents ' + quote(had) +
                ' and ' + quote(name) + ' share one URI.', 0, 0);
            base.doc = doc;
        }
    }
    const error = (ctx) => ({ verdict: 'error', aontu: '', lossy: [], errors: ctx.errors });
    const parsed = parseJson(text);
    if ('why' in parsed) {
        const end = undefined !== parsed.end ? parsed.end : parsed.off < text.length ?
            parsed.off + String.fromCodePoint(text.codePointAt(parsed.off)).length :
            parsed.off;
        if (true === parsed.deep) {
            fail(base, 'max_depth', '#', 'The schema nests deeper than ' + JSON_DEPTH +
                ' levels, past what the importer reads.', parsed.off, end);
        }
        else {
            fail(base, 'jsonschema_schema', '#', 'The text is not JSON: ' + parsed.why + '.', parsed.off, end);
        }
        return error(base);
    }
    base.root = parsed;
    doc.root = parsed;
    if (!('object' === parsed.t || 'true' === parsed.t || 'false' === parsed.t)) {
        fail(base, 'jsonschema_schema', '#', 'A schema is an object or a boolean.', parsed.off, parsed.end);
        return error(base);
    }
    base.resources.set(uri, parsed);
    base.byText.set(text, doc);
    index(base, parsed, '#', parsed, uri);
    settleRefs(base, parsed);
    if (0 < base.errors.length) {
        return error(base);
    }
    // A map root declares its aliases at the top, and a root that rides or
    // meets a map declares them in that map. An alias lives on a map root,
    // so any other root copies each reference in place.
    let [ctx, body] = run(base, true);
    if (undefined === coreMap(body)) {
        [ctx, body] = run(base, false);
    }
    // An identity rides only a declaration (ADR-056).
    for (const [node, ptr] of base.ptrOf) {
        const target = ctx.targets.get(node);
        const declared = ctx.mapRoot && undefined !== target && ctx.decls.has(target.name);
        for (const key of ['$id', '$anchor']) {
            if (ctx.seen.has(node) && !declared && 'string' === entry(node, key)?.t) {
                lose(ctx, child(ptr, key), key, 'an identity rides only an alias declaration, ' +
                    'and nothing declares this schema, so it is dropped');
            }
        }
    }
    // A subschema nothing reaches is still a schema, and one written
    // wrongly fails the import as a reached one does.
    for (const [node, ptr] of base.ptrOf) {
        if (!ctx.seen.has(node)) {
            convert({ ...ctx, lossy: [], decls: new Map(), stack: [], copies: 0 }, node, ptr, false);
        }
    }
    if (0 < ctx.errors.length) {
        return error(ctx);
    }
    return {
        verdict: 0 < ctx.lossy.length ? 'lossy' : 'ok',
        aontu: agreedForm(emit(ctx, body)),
        lossy: ctx.lossy,
        vet: [...exports.IMPORT_VET_FLAGS],
    };
}
// The agreed form, as `aontu fmt` writes it, or the text as written
// where the formatter refuses it, which within the nesting bound it
// does not.
function agreedForm(text, fmt = format_1.format) {
    const agreed = fmt(text);
    return 'formatted' === agreed.verdict ? agreed.text : text;
}
//# sourceMappingURL=jsonschema-import.js.map
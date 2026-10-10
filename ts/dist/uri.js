"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUri = parseUri;
exports.resolveUri = resolveUri;
exports.normalizeUri = normalizeUri;
const URI_RE = /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/;
const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
function parseUri(s) {
    const m = URI_RE.exec(s);
    return { scheme: m[1], authority: m[2], path: m[3], query: m[4], fragment: m[5] };
}
function recompose(t) {
    return (undefined === t.scheme ? '' : t.scheme + ':') +
        (undefined === t.authority ? '' : '//' + t.authority) + t.path +
        (undefined === t.query ? '' : '?' + t.query) +
        (undefined === t.fragment ? '' : '#' + t.fragment);
}
function removeDotSegments(path) {
    let input = path;
    let output = '';
    const dropLast = () => {
        output = output.slice(0, Math.max(0, output.lastIndexOf('/')));
    };
    while ('' !== input) {
        if (input.startsWith('../')) {
            input = input.slice(3);
        }
        else if (input.startsWith('./') || input.startsWith('/./')) {
            input = input.slice(2);
        }
        else if ('/.' === input) {
            input = '/';
        }
        else if (input.startsWith('/../') || '/..' === input) {
            input = '/' + input.slice(4);
            dropLast();
        }
        else if ('.' === input || '..' === input) {
            input = '';
        }
        else {
            const next = input.indexOf('/', 1);
            output += -1 === next ? input : input.slice(0, next);
            input = -1 === next ? '' : input.slice(next);
        }
    }
    return output;
}
// The target of `ref` against the absolute `base` (section 5.2.2).
function resolveUri(base, ref) {
    const r = parseUri(ref);
    const b = parseUri(base);
    const t = { path: '', fragment: r.fragment };
    if (undefined !== r.scheme) {
        return recompose({ ...r, path: removeDotSegments(r.path) });
    }
    t.scheme = b.scheme;
    if (undefined !== r.authority) {
        t.authority = r.authority;
        t.path = removeDotSegments(r.path);
        t.query = r.query;
    }
    else if ('' === r.path) {
        t.authority = b.authority;
        t.path = b.path;
        t.query = undefined === r.query ? b.query : r.query;
    }
    else {
        t.authority = b.authority;
        t.path = removeDotSegments(r.path.startsWith('/') ? r.path :
            undefined !== b.authority && '' === b.path ? '/' + r.path :
                b.path.slice(0, b.path.lastIndexOf('/') + 1) + r.path);
        t.query = r.query;
    }
    return recompose(t);
}
// One spelling per resource: the scheme and host in lower case, every
// percent-encoding's hex in upper case and an unreserved character
// decoded, with ASCII the only case either port folds.
function normalizeUri(uri) {
    const t = parseUri(uri);
    const lower = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
    const pct = (s) => s.replace(/%([0-9A-Fa-f]{2})/g, (_m, hex) => {
        const ch = String.fromCharCode(parseInt(hex, 16));
        return UNRESERVED.test(ch) ? ch : '%' + hex.toUpperCase();
    });
    const auth = undefined === t.authority ? undefined :
        t.authority.replace(/^((?:[^@]*@)?)([^:]*)/, (_m, user, host) => user + lower(host));
    return recompose({
        scheme: undefined === t.scheme ? undefined : lower(t.scheme),
        authority: undefined === auth ? undefined : pct(auth),
        path: pct(t.path),
        query: undefined === t.query ? undefined : pct(t.query),
        fragment: undefined === t.fragment ? undefined : pct(t.fragment),
    });
} /* node:coverage ignore next 7 */
//# sourceMappingURL=uri.js.map
"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathAt = pathAt;
exports.sitesOf = sitesOf;
exports.keySpan = keySpan;
exports.hitsOf = hitsOf;
const aontu_1 = require("./aontu");
const query_1 = require("./query");
const KEY_DELIMS = ' \t\r\n{}[](),:;"\'';
function lineStarts(src) {
    const starts = [0];
    for (let i = 0; i < src.length; i++) {
        if ('\n' === src[i]) {
            starts.push(i + 1);
        }
    }
    return starts;
}
// A character past the end of its line is the line's end, as LSP has it.
function offsetAt(src, starts, pos) {
    const end = pos.line + 1 < starts.length ? starts[pos.line + 1] - 1 : src.length;
    return starts[pos.line] + Math.max(0, Math.min(pos.character, end - starts[pos.line]));
}
function positionOf(starts, off) {
    let line = starts.length - 1;
    while (0 < line && off < starts[line]) {
        line--;
    }
    return { line, character: off - starts[line] };
}
function siteOffset(starts, v) {
    const row = v.site?.row ?? -1;
    const col = v.site?.col ?? -1;
    return 1 > row || 1 > col || starts.length < row ? -1 : starts[row - 1] + col - 1;
}
// The key written just before a value, where it is the path's last
// segment: `seg:`, `seg?:` or `"seg":` with blanks between.
function keySpan(src, at, seg) {
    let i = at - 1;
    while (0 <= i && ' \t\r\n'.includes(src[i]))
        i--;
    if (':' !== src[i]) {
        return undefined;
    }
    i--;
    if ('?' === src[i])
        i--;
    while (0 <= i && ' \t'.includes(src[i]))
        i--;
    if (0 > i) {
        return undefined;
    }
    const q = src[i];
    let j = i;
    if ('"' === q || '\'' === q) {
        j--;
        while (0 <= j && (q !== src[j] || '\\' === src[j - 1]))
            j--;
        return 0 <= j && src.slice(j + 1, i) === seg ? [j, i + 1] : undefined;
    }
    while (0 <= j && !KEY_DELIMS.includes(src[j]))
        j--;
    const word = src.slice(j + 1, i + 1);
    return word === seg || word === '%' + seg ? [j + 1, i + 1] : undefined;
}
function kids(v, path) {
    if ((true === v.isMap || true === v.isList) && null != v.peg) {
        const keys = Object.keys(v.peg);
        if (true === v.isMap) {
            keys.sort(cmpCodePoint);
        }
        const out = keys.filter((k) => !k.startsWith('%'))
            .map((k) => [v.peg[k], [...path, k]]);
        if (null != v.spread?.cj) {
            out.push([v.spread.cj, [...path, '&']]);
        }
        return out;
    }
    if (true === v.isConjunct || true === v.isDisjunct || true === v.isFunc ||
        true === v.isPlusOp) {
        return v.peg.map((k) => [k, path]);
    }
    return true === v.isPref ? [[v.peg, path]] : [];
}
function cmpCodePoint(a, b) {
    const x = [...a].map((c) => c.codePointAt(0));
    const y = [...b].map((c) => c.codePointAt(0));
    for (let i = 0; i < x.length && i < y.length; i++) {
        if (x[i] !== y[i]) {
            return x[i] - y[i];
        }
    }
    return x.length - y.length;
}
function valueHit(src, v, at, path) {
    if (true === v.isConjunct || true === v.isDisjunct || true === v.isNil) {
        return undefined;
    }
    const text = 'string' === typeof v.site?.src ? v.site.src : '';
    if ((true === v.isMap || true === v.isList) && '{' !== text && '[' !== text) {
        return undefined;
    }
    if (true === v.isRef) {
        // A reference whose spelling is not at its site was sited elsewhere
        // by the parser, so the cursor can't be said to be on it.
        if (undefined !== v.aliasName) {
            return undefined;
        }
        const spelt = v.spelling;
        return src.startsWith(spelt, at) ? {
            on: 'ref', path, start: at, end: at + spelt.length, reads: v.plainRefPath(),
        } : undefined;
    }
    return '' === text ? undefined : { on: 'value', path, start: at, end: at + text.length };
}
function hitsOf(src, root) {
    const starts = lineStarts(src);
    const keys = [];
    const values = [];
    const seen = new Set();
    const stack = [[root, []]];
    while (0 < stack.length) {
        const [v, path] = stack.pop();
        if (null == v || true !== v.isVal || seen.has(v)) {
            continue;
        }
        seen.add(v);
        const at = '' === (v.site?.url ?? '') ? siteOffset(starts, v) : -1;
        if (0 <= at) {
            const span = 0 < path.length ? keySpan(src, at, path[path.length - 1]) : undefined;
            if (undefined !== span) {
                keys.push({ on: 'key', path, start: span[0], end: span[1] });
            }
            const hit = valueHit(src, v, at, path);
            if (undefined !== hit) {
                values.push(hit);
            }
        }
        const next = kids(v, path);
        for (let i = next.length - 1; 0 <= i; i--) {
            stack.push(next[i]);
        }
    }
    return { keys, values };
}
function pathAt(src, pos, opts) {
    const aontu = new aontu_1.Aontu(null == opts?.trust ? {} : { trust: opts.trust });
    const ctx = aontu.ctx({ collect: true });
    const root = aontu.parse(src, undefined, ctx);
    if (0 < ctx.err.length) {
        return undefined;
    }
    const starts = lineStarts(src);
    if (0 > pos.line || starts.length <= pos.line) {
        return undefined;
    }
    const cur = offsetAt(src, starts, pos);
    const within = (h) => h.start <= cur && cur < h.end;
    const { keys, values } = hitsOf(src, root);
    let best = keys.find(within);
    for (const h of undefined === best ? values : []) {
        if (within(h) && (undefined === best || h.end - h.start < best.end - best.start ||
            (h.end - h.start === best.end - best.start && h.path.length > best.path.length))) {
            best = h;
        }
    }
    if (undefined === best) {
        return undefined;
    }
    return {
        on: best.on,
        path: best.path,
        range: { start: positionOf(starts, best.start), end: positionOf(starts, best.end) },
        ...(undefined === best.reads ? {} : { reads: best.reads }),
    };
}
// Every site that writes a path, as `model why` reads them; nothing
// where the document does not evaluate or names no such path.
function sitesOf(src, path, opts) {
    const report = (0, query_1.why)(src, '$' + path.map((p) => '.' + p).join(''), { trust: opts?.trust });
    if (!report.ok || null == report.record) {
        return undefined;
    }
    return report.record.conjuncts.map((c) => ({
        canon: c.canon,
        file: c.site.file,
        range: {
            start: { line: c.site.row - 1, character: c.site.col - 1 },
            end: { line: c.site.row - 1, character: c.site.col - 1 + c.site.len },
        },
        role: c.role,
    }));
}
//# sourceMappingURL=cursor.js.map
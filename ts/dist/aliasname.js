"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESERVED_KEY_PREFIX = exports.EXPORT_DECL_NAME = exports.ALIAS_SHORTHAND_RE = exports.ALIAS_SET = exports.ALIAS_NAME_RE = exports.ALIAS_RE = void 0;
exports.exportHoldKey = exportHoldKey;
exports.isExportHoldKey = isExportHoldKey;
exports.aliasScopedKey = aliasScopedKey;
exports.aliasBareName = aliasBareName;
exports.aliasPathSegment = aliasPathSegment;
exports.aliasSetItems = aliasSetItems;
// ONE PATTERN FOR THE ALIAS NAME. See docs/design/ALIASES.0.md
const ALIAS_NAME = '%[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*';
const ALIAS_RE = new RegExp('^' + ALIAS_NAME);
exports.ALIAS_RE = ALIAS_RE;
const ALIAS_NAME_RE = new RegExp('^' + ALIAS_NAME + '$');
exports.ALIAS_NAME_RE = ALIAS_NAME_RE;
// What `export` takes and a destructure heads with: `{%}` binds none.
const ALIAS_ITEM = '(' + ALIAS_NAME + ')(?:[ \\t]*:[ \\t]*(' + ALIAS_NAME + '))?';
const ALIAS_SET = '\\{[ \\t]*(?:%|' + ALIAS_ITEM +
    '(?:[ \\t]*,[ \\t]*' + ALIAS_ITEM + ')*)[ \\t]*\\}';
exports.ALIAS_SET = ALIAS_SET;
const ALIAS_SET_RE = new RegExp('^' + ALIAS_SET + '$');
const ALIAS_ITEMS_RE = new RegExp(ALIAS_ITEM, 'g');
// THE SHORTHAND: `{ %a %b }` is `{ a: %a, b: %b }`. Names only.
const ALIAS_SHORTHAND = '\\{\\s*' + ALIAS_NAME +
    '(?:(?:\\s*,\\s*|\\s+)' + ALIAS_NAME + ')*\\s*\\}';
const ALIAS_SHORTHAND_RE = new RegExp('^' + ALIAS_SHORTHAND);
exports.ALIAS_SHORTHAND_RE = ALIAS_SHORTHAND_RE;
// A key carries the url of the file that declared the name.
const ALIAS_SCOPE = '@';
// THE ENGINE'S KEY NAMESPACE, refused to a source key.
const RESERVED_KEY_PREFIX = '\u0000aontu_';
exports.RESERVED_KEY_PREFIX = RESERVED_KEY_PREFIX;
// `export(...)` is read as a pair, its value under a key that changes
// with each declaration, so a field of that name is the document's.
const EXPORT_DECL_NAME = 'export';
exports.EXPORT_DECL_NAME = EXPORT_DECL_NAME;
const EXPORT_HOLD_KEY = RESERVED_KEY_PREFIX + 'export@';
let EXPORT_SEQ = 0;
function exportHoldKey() {
    return EXPORT_HOLD_KEY + (++EXPORT_SEQ);
}
function isExportHoldKey(val) {
    return 'string' === typeof val && val.startsWith(EXPORT_HOLD_KEY);
}
function aliasScopedKey(name, url) {
    return name + ALIAS_SCOPE + url;
}
function aliasBareName(key) {
    const at = key.indexOf(ALIAS_SCOPE);
    return -1 === at ? key : key.substring(0, at);
}
function aliasPathSegment(seg) {
    const name = aliasBareName(seg);
    return ALIAS_NAME_RE.test(name) ? name : seg;
}
// Undefined where the text is not a set; the wildcard answers EMPTY.
function aliasSetItems(text) {
    if (!ALIAS_SET_RE.test(text)) {
        return undefined;
    }
    return Array.from(text.matchAll(ALIAS_ITEMS_RE), (m) => ({ local: m[1], remote: m[2] ?? m[1] }));
} /* node:coverage ignore next 21 */
//# sourceMappingURL=aliasname.js.map
/* Copyright (c) 2026 Richard Rodger, MIT License */

// ONE PATTERN FOR THE ALIAS NAME: the lexer reads one off the source
// and RefVal asks of a segment. See docs/design/ALIAS-FILE-SCOPE.0.md
const ALIAS_NAME = '%[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*'

const ALIAS_RE = new RegExp('^' + ALIAS_NAME)

const ALIAS_NAME_RE = new RegExp('^' + ALIAS_NAME + '$')

// What `export` takes and a destructure heads with. An item is a name
// or `%local: %remote`; `{%}` is the wildcard, and binds no item.
const ALIAS_ITEM =
  '(' + ALIAS_NAME + ')(?:[ \\t]*:[ \\t]*(' + ALIAS_NAME + '))?'
const ALIAS_SET =
  '\\{[ \\t]*(?:%|' + ALIAS_ITEM +
  '(?:[ \\t]*,[ \\t]*' + ALIAS_ITEM + ')*)[ \\t]*\\}'
const ALIAS_SET_RE = new RegExp('^' + ALIAS_SET + '$')
const ALIAS_ITEMS_RE = new RegExp(ALIAS_ITEM, 'g')

// A key carries the url of the file that declared the name.
const ALIAS_SCOPE = '@'

// `export(...)` is read as a pair, its value under a key that changes
// with each declaration, so a field of that name is the document's.
const EXPORT_DECL_NAME = 'export'
const EXPORT_HOLD_KEY = '___export@'
let EXPORT_SEQ = 0

function exportHoldKey(): string {
  return EXPORT_HOLD_KEY + (++EXPORT_SEQ)
}

function isExportHoldKey(val: unknown): boolean {
  return 'string' === typeof val && val.startsWith(EXPORT_HOLD_KEY)
}


type AliasBind = { local: string, remote: string }


function aliasScopedKey(name: string, url: string): string {
  return name + ALIAS_SCOPE + url
}


function aliasBareName(key: string): string {
  const at = key.indexOf(ALIAS_SCOPE)
  return -1 === at ? key : key.substring(0, at)
}


function aliasPathSegment(seg: string): string {
  const name = aliasBareName(seg)
  return ALIAS_NAME_RE.test(name) ? name : seg
}


// Undefined where the text is not a set; the wildcard answers EMPTY.
function aliasSetItems(text: string): AliasBind[] | undefined {
  if (!ALIAS_SET_RE.test(text)) {
    return undefined
  }
  return Array.from(text.matchAll(ALIAS_ITEMS_RE),
    (m) => ({ local: m[1], remote: m[2] ?? m[1] }))
} /* node:coverage ignore next 19 */


export {
  ALIAS_RE,
  ALIAS_NAME_RE,
  ALIAS_SET,
  EXPORT_DECL_NAME,
  exportHoldKey,
  isExportHoldKey,
  aliasScopedKey,
  aliasBareName,
  aliasPathSegment,
  aliasSetItems,
}


export type {
  AliasBind,
}

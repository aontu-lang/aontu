/* Copyright (c) 2026 Richard Rodger, MIT License */

// ONE PATTERN FOR THE ALIAS NAME: the lexer reads a name off the front
// of the source and RefVal asks whether a whole segment is one. See
// docs/design/ALIASES.0.md, docs/design/ALIAS-FILE-SCOPE.0.md
const ALIAS_NAME = '%[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*'

const ALIAS_RE = new RegExp('^' + ALIAS_NAME)

const ALIAS_NAME_RE = new RegExp('^' + ALIAS_NAME + '$')

// What `export` takes and a destructure heads with; `{%}` is wildcard.
const ALIAS_SET =
  '\\{[ \\t]*(?:%|' + ALIAS_NAME +
  '(?:[ \\t]*,[ \\t]*' + ALIAS_NAME + ')*)[ \\t]*\\}'
const ALIAS_SET_RE = new RegExp('^' + ALIAS_SET + '$')
const ALIAS_NAMES_RE = new RegExp(ALIAS_NAME, 'g')

// A key carries the url of the file that declared the name.
const ALIAS_SCOPE = '@'

// `export(...)` is read as a pair, its value under an unwritable key.
const EXPORT_DECL_NAME = 'export'
const EXPORT_HOLD_KEY = '___export'


function aliasScopedKey(name: string, url: string): string {
  return name + ALIAS_SCOPE + url
}


// An unscoped key is its own name: how a path segment answers no above.
function aliasBareName(key: string): string {
  const at = key.indexOf(ALIAS_SCOPE)
  return -1 === at ? key : key.substring(0, at)
}


function aliasPathSegment(seg: string): string {
  const name = aliasBareName(seg)
  return ALIAS_NAME_RE.test(name) ? name : seg
}


// Undefined where the text is not a set; the wildcard answers EMPTY.
function aliasSetNames(text: string): string[] | undefined {
  return ALIAS_SET_RE.test(text) ? (text.match(ALIAS_NAMES_RE) ?? []) : undefined
}
/* node:coverage ignore next 13 */


export {
  ALIAS_RE,
  ALIAS_NAME_RE,
  ALIAS_SET,
  EXPORT_DECL_NAME,
  EXPORT_HOLD_KEY,
  aliasScopedKey,
  aliasBareName,
  aliasPathSegment,
  aliasSetNames,
}

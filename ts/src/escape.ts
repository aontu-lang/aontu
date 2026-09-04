/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE ESCAPE CONVENTIONS (G9 phase 6, docs/design/TEMPLATE.0.md D4).
// `esc(s, variant?)` makes a string safe to place inside a literal of
// the named convention, and `usc` reads it back out.
//
// A VARIANT NAMES A CONVENTION, NOT A LANGUAGE, and that is the whole
// reason it is a variant rather than something a renderer knows:
// several languages share one convention, and one language has
// several -- a C-family literal escapes differently in each quote, and
// SQL spells a literal one way and an identifier another.
//
// With no variant it is the C escape, JSON canonical, which covers
// TypeScript, JavaScript, Java, C, C++, C#, Go, Rust, Swift, Kotlin,
// Scala and JSON itself. That is why it is the default rather than a
// lookup.
//
// EVERY CONVENTION IS SPELLED OUT HERE rather than borrowed from a
// host function, and the reason is parity: `JSON.stringify` escapes
// what Go's `encoding/json` does not (and the reverse), and
// `encodeURIComponent` leaves `!'()*` alone where RFC 3986 does not.
// A generated file must be byte-identical whichever engine wrote it,
// so both ports carry this table and go/escape.go is its twin.
//
// `usc` IS THE LEFT INVERSE, AND IT IS PARTIAL. `usc(esc(s))` is `s`
// for every `s`; `esc(usc(t))` is `t` only for canonically escaped
// `t`, because several spellings escape to one value. Input with no
// inverse -- a truncated `\u12`, an undefined `\q`, a lone `'` where
// the convention doubles it -- is REFUSED (`usc_malformed`), never
// passed through: a generator that reads a value back out of an
// artifact and silently gets a different one is the failure this
// whole pair exists to close.


// The variant names, in the order the reference lists them. `none` is
// not here: it is the absent argument, and the absent argument is the
// C/JSON convention.
const ESC_VARIANTS = ['sq', 'sql', 'shell', 'xml', 'uri', 'regex']


// The regex metacharacters, which are exactly the ones the pattern
// subset admits as escaped-to-mean-themselves (RE_ESCAPE_PUNCT in
// ConstraintVal). So `esc(s, regex)` always answers a pattern the
// subset accepts, which is the point of having the variant at all.
const ESC_REGEX_PUNCT = '\\.+*?()[]{}|^$/'


// The five XML entities, in the order they must be APPLIED: `&` first,
// or the ampersands of the other four are escaped a second time.
const ESC_XML: [string, string][] = [
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&apos;'],
]


// The characters RFC 3986 calls unreserved. Everything else is
// percent-encoded, byte by byte of its UTF-8, with UPPERCASE hex --
// the case the RFC prefers, pinned here because the two ports must
// agree on it.
const ESC_URI_UNRESERVED =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'


function isEscVariant(v: string): boolean {
  return ESC_VARIANTS.includes(v)
}


// The C escape, in whichever quote the convention uses. Control
// characters below U+0020 that have no short form become `\uXXXX` with
// LOWERCASE hex, as JSON writes them; U+007F is not a JSON escape and
// is left alone.
function escC(src: string, quote: string): string {
  let out = ''
  for (const ch of src) {
    if ('\\' === ch) { out += '\\\\'; continue }
    if (quote === ch) { out += '\\' + quote; continue }
    if ('\n' === ch) { out += '\\n'; continue }
    if ('\r' === ch) { out += '\\r'; continue }
    if ('\t' === ch) { out += '\\t'; continue }
    if ('\b' === ch) { out += '\\b'; continue }
    if ('\f' === ch) { out += '\\f'; continue }
    const c = ch.codePointAt(0) as number
    if (0x20 > c) {
      out += '\\u' + c.toString(16).padStart(4, '0')
      continue
    }
    out += ch
  }
  return out
}


// The inverse. A `\uXXXX` naming half a surrogate pair is read WITH its
// partner or refused: a lone surrogate is not a character either port
// can carry, and answering one in TypeScript where Go cannot is the
// divergence the whole table exists to avoid.
function unescC(src: string, quote: string): [string, boolean] {
  const bad: [string, boolean] = ['', false]
  let out = ''

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if ('\\' !== ch) { out += ch; continue }

    i++
    if (src.length <= i) { return bad }
    const n = src[i]

    if ('\\' === n) { out += '\\'; continue }
    if (quote === n) { out += quote; continue }
    if ('n' === n) { out += '\n'; continue }
    if ('r' === n) { out += '\r'; continue }
    if ('t' === n) { out += '\t'; continue }
    if ('b' === n) { out += '\b'; continue }
    if ('f' === n) { out += '\f'; continue }

    if ('u' !== n) { return bad }

    const hi = hex4(src, i + 1)
    if (0 > hi) { return bad }
    i += 4

    if (0xDC00 <= hi && 0xDFFF >= hi) { return bad }

    if (0xD800 <= hi && 0xDBFF >= hi) {
      // A high surrogate must be followed by its own `\u` low one.
      if ('\\' !== src[i + 1] || 'u' !== src[i + 2]) { return bad }
      const lo = hex4(src, i + 3)
      if (0 > lo || 0xDC00 > lo || 0xDFFF < lo) { return bad }
      i += 6
      out += String.fromCharCode(hi, lo)
      continue
    }

    out += String.fromCharCode(hi)
  }

  return [out, true]
}


// Four hex digits at `at`, or -1 when they are not four hex digits.
function hex4(src: string, at: number): number {
  if (src.length < at + 4) { return -1 }
  let v = 0
  for (let i = at; i < at + 4; i++) {
    const d = hexDigit(src[i])
    if (0 > d) { return -1 }
    v = v * 16 + d
  }
  return v
}


function hexDigit(ch: string): number {
  if ('0' <= ch && '9' >= ch) { return ch.charCodeAt(0) - 0x30 }
  if ('a' <= ch && 'f' >= ch) { return ch.charCodeAt(0) - 0x61 + 10 }
  if ('A' <= ch && 'F' >= ch) { return ch.charCodeAt(0) - 0x41 + 10 }
  return -1
}


// Standard SQL: a literal's only escape is the doubled quote. A LONE
// quote has no inverse -- it is the escape character, so its meaning
// depends on what was meant to follow it.
function escSql(src: string): string {
  return src.split("'").join("''")
}

function unescSql(src: string): [string, boolean] {
  let out = ''
  for (let i = 0; i < src.length; i++) {
    if ("'" !== src[i]) { out += src[i]; continue }
    if ("'" !== src[i + 1]) { return ['', false] }
    out += "'"
    i++
  }
  return [out, true]
}


// POSIX single-quoting: the caller wraps the value in single quotes,
// and a quote inside it closes, escapes and reopens them.
function escShell(src: string): string {
  return src.split("'").join("'\\''")
}

function unescShell(src: string): [string, boolean] {
  let out = ''
  for (let i = 0; i < src.length; i++) {
    if ("'" !== src[i]) { out += src[i]; continue }
    if ("\\" !== src[i + 1] || "'" !== src[i + 2] || "'" !== src[i + 3]) {
      return ['', false]
    }
    out += "'"
    i += 3
  }
  return [out, true]
}


function escXml(src: string): string {
  let out = ''
  for (const ch of src) {
    const ent = ESC_XML.find((e) => e[0] === ch)
    out += undefined === ent ? ch : ent[1]
  }
  return out
}


// A bare `&` is REFUSED rather than passed through: it is the one
// character whose meaning is ambiguous here, since it opens an entity.
// Every other character is unambiguous and passes.
function unescXml(src: string): [string, boolean] {
  let out = ''
  for (let i = 0; i < src.length; i++) {
    if ('&' !== src[i]) { out += src[i]; continue }
    const ent = ESC_XML.find((e) => src.startsWith(e[1], i))
    if (undefined === ent) { return ['', false] }
    out += ent[0]
    i += ent[1].length - 1
  }
  return [out, true]
}


function escUri(src: string): string {
  let out = ''
  for (const ch of src) {
    if (1 === ch.length && ESC_URI_UNRESERVED.includes(ch)) {
      out += ch
      continue
    }
    for (const b of utf8Bytes(ch)) {
      out += '%' + b.toString(16).toUpperCase().padStart(2, '0')
    }
  }
  return out
}


function unescUri(src: string): [string, boolean] {
  const bytes: number[] = []
  for (let i = 0; i < src.length; i++) {
    if ('%' !== src[i]) {
      for (const b of utf8Bytes(src[i])) { bytes.push(b) }
      continue
    }
    const hi = hexDigit(src[i + 1] ?? '')
    const lo = hexDigit(src[i + 2] ?? '')
    if (0 > hi || 0 > lo) { return ['', false] }
    bytes.push(hi * 16 + lo)
    i += 2
  }
  return utf8Text(bytes)
}


function escRegex(src: string): string {
  let out = ''
  for (const ch of src) {
    if (ESC_REGEX_PUNCT.includes(ch)) { out += '\\' }
    out += ch
  }
  return out
}


// A metacharacter standing bare is unambiguous and passes; a backslash
// before anything the convention does not escape has no inverse.
function unescRegex(src: string): [string, boolean] {
  let out = ''
  for (let i = 0; i < src.length; i++) {
    if ('\\' !== src[i]) { out += src[i]; continue }
    const n = src[i + 1]
    if (undefined === n || !ESC_REGEX_PUNCT.includes(n)) { return ['', false] }
    out += n
    i++
  }
  return [out, true]
}


// UTF-8 by hand, both ways, because the percent convention is defined
// over BYTES and the two ports must produce the same ones. TextEncoder
// would do for the forward direction; the reverse needs the error
// behaviour spelled out, so both are here.
function utf8Bytes(ch: string): number[] {
  const c = ch.codePointAt(0) as number
  if (0x80 > c) { return [c] }
  if (0x800 > c) { return [0xC0 | (c >> 6), 0x80 | (c & 0x3F)] }
  if (0x10000 > c) {
    return [0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)]
  }
  return [
    0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F),
    0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F),
  ]
}


// The strict decoder: an overlong form, a surrogate, a truncated
// sequence or a value past U+10FFFF has no character to answer with.
function utf8Text(bytes: number[]): [string, boolean] {
  const bad: [string, boolean] = ['', false]
  let out = ''

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (0x80 > b) { out += String.fromCodePoint(b); continue }

    let need = 0
    let c = 0
    let min = 0
    if (0xC0 === (b & 0xE0)) { need = 1; c = b & 0x1F; min = 0x80 }
    else if (0xE0 === (b & 0xF0)) { need = 2; c = b & 0x0F; min = 0x800 }
    else if (0xF0 === (b & 0xF8)) { need = 3; c = b & 0x07; min = 0x10000 }
    else { return bad }

    if (bytes.length <= i + need) { return bad }
    for (let k = 0; k < need; k++) {
      const cb = bytes[i + 1 + k]
      if (0x80 !== (cb & 0xC0)) { return bad }
      c = (c << 6) | (cb & 0x3F)
    }
    i += need

    if (min > c || 0x10FFFF < c) { return bad }
    if (0xD800 <= c && 0xDFFF >= c) { return bad }
    out += String.fromCodePoint(c)
  }

  return [out, true]
}


// The one entry point each way. An unknown variant never reaches here:
// the call refuses it (`esc_variant`) before either is asked.
function escapeText(src: string, variant: string): string {
  if ('sq' === variant) { return escC(src, "'") }
  if ('sql' === variant) { return escSql(src) }
  if ('shell' === variant) { return escShell(src) }
  if ('xml' === variant) { return escXml(src) }
  if ('uri' === variant) { return escUri(src) }
  if ('regex' === variant) { return escRegex(src) }
  return escC(src, '"')
}


function unescapeText(src: string, variant: string): [string, boolean] {
  if ('sq' === variant) { return unescC(src, "'") }
  if ('sql' === variant) { return unescSql(src) }
  if ('shell' === variant) { return unescShell(src) }
  if ('xml' === variant) { return unescXml(src) }
  if ('uri' === variant) { return unescUri(src) }
  if ('regex' === variant) { return unescRegex(src) }
  return unescC(src, '"')
} /* node:coverage ignore next 8 */


export {
  ESC_VARIANTS,
  isEscVariant,
  escapeText,
  unescapeText,
}

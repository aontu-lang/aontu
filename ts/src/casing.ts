/* Copyright (c) 2026 Richard Rodger, MIT License */


function isUpper(c: string): boolean {
  return 'A' <= c && c <= 'Z'
}

function isLower(c: string): boolean {
  return 'a' <= c && c <= 'z'
}

function isDigit(c: string): boolean {
  return '0' <= c && c <= '9'
}

function isASCII(c: string): boolean {
  return (c.codePointAt(0) as number) < 0x80
}

export function splitWords(name: string): string[] {
  const words: string[] = []
  let cur = ''
  const chars = Array.from(name)
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if ('_' === c || '-' === c || ' ' === c) {
      if ('' !== cur) {
        words.push(cur)
      }
      cur = ''
      continue
    }
    if ('' !== cur) {
      const prev = chars[i - 1]
      const next = chars[i + 1]
      const boundary = isASCII(c) && isASCII(prev) && (
        (isUpper(c) && (isLower(prev) || isDigit(prev))) ||
        (isDigit(c) !== isDigit(prev)) ||
        (isUpper(c) && isUpper(prev) && undefined !== next && isLower(next)))
      if (boundary) {
        words.push(cur)
        cur = ''
      }
    }
    cur += c
  }
  if ('' !== cur) {
    words.push(cur)
  }
  return words
}

export function lowerASCII(s: string): string {
  return Array.from(s).map((c) =>
    isUpper(c) ? String.fromCharCode(c.charCodeAt(0) + 32) : c).join('')
}

export function upperASCII(s: string): string {
  return Array.from(s).map((c) =>
    isLower(c) ? String.fromCharCode(c.charCodeAt(0) - 32) : c).join('')
}

// A word capitalised: the acronym set wins, so `id` is `ID` under a
// profile that lists it and `Id` under one that does not.
export function capitalise(word: string, acronyms: string[]): string {
  const low = lowerASCII(word)
  for (const a of acronyms) {
    if (lowerASCII(a) === low) {
      return a
    }
  }
  const chars = Array.from(low)
  return upperASCII(chars[0]) + chars.slice(1).join('')
}

// THE CASE STYLES, over the words. `nom` maps its own style names
// onto these.
export function caseName(name: string, style: string, acronyms: string[]): string {
  const words = splitWords(name)
  if ('snake' === style) {
    return words.map(lowerASCII).join('_')
  }
  if ('screaming' === style) {
    return words.map(upperASCII).join('_')
  }
  if ('kebab' === style) {
    return words.map(lowerASCII).join('-')
  }
  const caps = words.map((w) => capitalise(w, acronyms))
  if ('pascal' === style) {
    return caps.join('')
  }
  // camel: the first word lower, and never an acronym.
  return lowerASCII(words[0]) + caps.slice(1).join('')
}


// nom's style name -> the case style `caseName` serves. `upper` and
// `text` are nom's spellings.
const CASENAME_STYLES: Record<string, string> = {
  camel: 'camel',
  kebab: 'kebab',
  pascal: 'pascal',
  snake: 'snake',
  upper: 'screaming',
}


// One name in one style, or undefined when the style is not one, or
// when the name holds no words at all.
export function styleName(name: string, style: string, acronyms: string[]):
  string | undefined {
  const src = name.replace(/[./]/g, '_')

  const words = splitWords(src)
  if (0 === words.length) {
    return undefined
  }

  const cased = CASENAME_STYLES[style]
  if (undefined !== cased) {
    return caseName(src, cased, acronyms)
  }

  if ('dot' === style) {
    return words.map(lowerASCII).join('.')
  }
  if ('path' === style) {
    return words.map(lowerASCII).join('/')
  }
  if ('title' === style) {
    return words.map((w) => capitalise(w, acronyms)).join(' ')
  }
  if ('text' === style) {
    const isAcronym = (w: string) =>
      acronyms.some((a) => lowerASCII(a) === lowerASCII(w))
    return [capitalise(words[0], acronyms)]
      .concat(words.slice(1).map((w) =>
        isAcronym(w) ? capitalise(w, acronyms) : lowerASCII(w)))
      .join(' ')
  }

  return undefined
}

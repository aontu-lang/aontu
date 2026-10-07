/* Copyright (c) 2026 Richard Rodger, MIT License */


// RFC 3986 reference resolution, written out rather than taken from the
// host, whose URL parsers disagree at the edges (ADR-003). Go's twin is
// go/uri.go, and test/spec/uri.tsv holds both to one answer.


// A part the reference lacks is undefined, which is not the empty
// string: `http://a?` has an empty query, `http://a` has none.
type UriParts = {
  scheme?: string
  authority?: string
  path: string
  query?: string
  fragment?: string
}


// Appendix B, which every string matches.
const URI_RE = /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/s


function parseUri(s: string): UriParts {
  const m = URI_RE.exec(s) as RegExpExecArray
  return {
    scheme: m[2], authority: m[4], path: m[5], query: m[7], fragment: m[9],
  }
}


// Section 5.2.4.
function removeDotSegments(path: string): string {
  let input = path
  let output = ''
  const up = () => {
    output = output.slice(0, Math.max(0, output.lastIndexOf('/')))
  }
  while ('' !== input) {
    if (input.startsWith('../')) {
      input = input.slice(3)
    }
    else if (input.startsWith('./') || input.startsWith('/./')) {
      input = input.slice(2)
    }
    else if ('/.' === input) {
      input = '/'
    }
    else if (input.startsWith('/../')) {
      input = input.slice(3)
      up()
    }
    else if ('/..' === input) {
      input = '/'
      up()
    }
    else if ('.' === input || '..' === input) {
      input = ''
    }
    else {
      const next = input.indexOf('/', 1)
      const end = -1 === next ? input.length : next
      output += input.slice(0, end)
      input = input.slice(end)
    }
  }
  return output
}


// Section 5.3.
function recompose(t: UriParts): string {
  return (undefined === t.scheme ? '' : t.scheme + ':') +
    (undefined === t.authority ? '' : '//' + t.authority) + t.path +
    (undefined === t.query ? '' : '?' + t.query) +
    (undefined === t.fragment ? '' : '#' + t.fragment)
}


// Section 5.2.2, strict. A base without a scheme is resolved against as
// one with, so a document that names no base still keys its references.
function resolveUri(base: string, ref: string): string {
  const r = parseUri(ref)
  if (undefined !== r.scheme) {
    return recompose({ ...r, path: removeDotSegments(r.path) })
  }
  const b = parseUri(base)
  const t: UriParts = { scheme: b.scheme, path: '', fragment: r.fragment }
  if (undefined !== r.authority) {
    t.authority = r.authority
    t.path = removeDotSegments(r.path)
    t.query = r.query
  }
  else {
    t.authority = b.authority
    if ('' === r.path) {
      t.path = b.path
      t.query = undefined === r.query ? b.query : r.query
    }
    else {
      t.path = removeDotSegments(r.path.startsWith('/') ? r.path :
        undefined !== b.authority && '' === b.path ? '/' + r.path :
          b.path.slice(0, b.path.lastIndexOf('/') + 1) + r.path)
      t.query = r.query
    }
  }
  return recompose(t)
} /* node:coverage ignore next 6 */


export {
  parseUri,
  resolveUri,
}

/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"regexp"
	"strings"
)

// RFC 3986 reference resolution, the twin of ts/src/uri.ts, which
// test/spec/uri.tsv holds to one answer with it.

// uriParts: a part the reference lacks is absent, which is not the empty
// string: `http://a?` has an empty query, `http://a` has none.
type uriParts struct {
	scheme, authority, path, query, fragment string

	hasScheme, hasAuthority, hasQuery, hasFragment bool
}

// uriRe is Appendix B's, which every string matches.
var uriRe = regexp.MustCompile(`(?s)^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$`)

func parseURI(s string) uriParts {
	m := uriRe.FindStringSubmatchIndex(s)
	part := func(n int) (string, bool) {
		if m[2*n] < 0 {
			return "", false
		}
		return s[m[2*n]:m[2*n+1]], true
	}
	var p uriParts
	p.scheme, p.hasScheme = part(2)
	p.authority, p.hasAuthority = part(4)
	p.path, _ = part(5)
	p.query, p.hasQuery = part(7)
	p.fragment, p.hasFragment = part(9)
	return p
}

// removeDotSegments is section 5.2.4.
func removeDotSegments(path string) string {
	input := path
	out := ""
	up := func() {
		out = out[:max(0, strings.LastIndex(out, "/"))]
	}
	for "" != input {
		switch {
		case strings.HasPrefix(input, "../"):
			input = input[3:]
		case strings.HasPrefix(input, "./") || strings.HasPrefix(input, "/./"):
			input = input[2:]
		case "/." == input:
			input = "/"
		case strings.HasPrefix(input, "/../"):
			input = input[3:]
			up()
		case "/.." == input:
			input = "/"
			up()
		case "." == input || ".." == input:
			input = ""
		default:
			end := len(input)
			if next := strings.Index(input[1:], "/"); next >= 0 {
				end = next + 1
			}
			out += input[:end]
			input = input[end:]
		}
	}
	return out
}

func (t uriParts) String() string {
	var b strings.Builder
	if t.hasScheme {
		b.WriteString(t.scheme + ":")
	}
	if t.hasAuthority {
		b.WriteString("//" + t.authority)
	}
	b.WriteString(t.path)
	if t.hasQuery {
		b.WriteString("?" + t.query)
	}
	if t.hasFragment {
		b.WriteString("#" + t.fragment)
	}
	return b.String()
}

// resolveURI is section 5.2.2, strict. A base without a scheme is
// resolved against as one with, so a document that names no base still
// keys its references.
func resolveURI(base, ref string) string {
	r := parseURI(ref)
	if r.hasScheme {
		r.path = removeDotSegments(r.path)
		return r.String()
	}
	b := parseURI(base)
	t := uriParts{scheme: b.scheme, hasScheme: b.hasScheme,
		fragment: r.fragment, hasFragment: r.hasFragment}
	switch {
	case r.hasAuthority:
		t.authority, t.hasAuthority = r.authority, true
		t.path = removeDotSegments(r.path)
		t.query, t.hasQuery = r.query, r.hasQuery
	case "" == r.path:
		t.authority, t.hasAuthority = b.authority, b.hasAuthority
		t.path = b.path
		t.query, t.hasQuery = b.query, b.hasQuery
		if r.hasQuery {
			t.query, t.hasQuery = r.query, true
		}
	default:
		t.authority, t.hasAuthority = b.authority, b.hasAuthority
		merged := r.path
		if !strings.HasPrefix(r.path, "/") {
			if b.hasAuthority && "" == b.path {
				merged = "/" + r.path
			} else {
				merged = b.path[:strings.LastIndex(b.path, "/")+1] + r.path
			}
		}
		t.path = removeDotSegments(merged)
		t.query, t.hasQuery = r.query, r.hasQuery
	}
	return t.String()
}

/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"regexp"
	"strconv"
	"strings"
)

// uriParts is an RFC 3986 reference split by appendix B, with a nil
// component where the reference has none, as distinct from an empty one.
type uriParts struct {
	scheme, authority *string
	path              string
	query, fragment   *string
}

var uriRe = regexp.MustCompile(`^(?:([^:/?#]+):)?(?://([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$`)

var uriPctRe = regexp.MustCompile(`%[0-9A-Fa-f]{2}`)

var uriHostRe = regexp.MustCompile(`^((?:[^@]*@)?)([^:]*)`)

func parseURI(s string) uriParts {
	m := uriRe.FindStringSubmatchIndex(s)
	part := func(i int) *string {
		if m[2*i] < 0 {
			return nil
		}
		p := s[m[2*i]:m[2*i+1]]
		return &p
	}
	return uriParts{scheme: part(1), authority: part(2), path: *part(3),
		query: part(4), fragment: part(5)}
}

func (t uriParts) String() string {
	var b strings.Builder
	if nil != t.scheme {
		b.WriteString(*t.scheme + ":")
	}
	if nil != t.authority {
		b.WriteString("//" + *t.authority)
	}
	b.WriteString(t.path)
	if nil != t.query {
		b.WriteString("?" + *t.query)
	}
	if nil != t.fragment {
		b.WriteString("#" + *t.fragment)
	}
	return b.String()
}

func removeDotSegments(path string) string {
	input, output := path, ""
	dropLast := func() {
		if i := strings.LastIndex(output, "/"); 0 < i {
			output = output[:i]
		} else {
			output = ""
		}
	}
	for "" != input {
		switch {
		case strings.HasPrefix(input, "../"):
			input = input[3:]
		case strings.HasPrefix(input, "./") || strings.HasPrefix(input, "/./"):
			input = input[2:]
		case "/." == input:
			input = "/"
		case strings.HasPrefix(input, "/../") || "/.." == input:
			input = "/" + input[min(4, len(input)):]
			dropLast()
		case "." == input || ".." == input:
			input = ""
		default:
			next := strings.Index(input[1:], "/")
			if next < 0 {
				output += input
				input = ""
			} else {
				output += input[:next+1]
				input = input[next+1:]
			}
		}
	}
	return output
}

// resolveURI is the target of ref against the absolute base (RFC 3986
// section 5.2.2).
func resolveURI(base, ref string) string {
	r, b := parseURI(ref), parseURI(base)
	if nil != r.scheme {
		r.path = removeDotSegments(r.path)
		return r.String()
	}
	t := uriParts{scheme: b.scheme, fragment: r.fragment}
	switch {
	case nil != r.authority:
		t.authority, t.path, t.query = r.authority, removeDotSegments(r.path), r.query
	case "" == r.path:
		t.authority, t.path, t.query = b.authority, b.path, r.query
		if nil == r.query {
			t.query = b.query
		}
	default:
		merged := r.path
		if !strings.HasPrefix(r.path, "/") {
			if nil != b.authority && "" == b.path {
				merged = "/" + r.path
			} else {
				merged = b.path[:strings.LastIndex(b.path, "/")+1] + r.path
			}
		}
		t.authority, t.path, t.query = b.authority, removeDotSegments(merged), r.query
	}
	return t.String()
}

// normalizeURI is one spelling per resource: the scheme and host in
// lower case, every percent-encoding's hex in upper case and an
// unreserved character decoded, with ASCII the only case either port
// folds.
func normalizeURI(uri string) string {
	t := parseURI(uri)
	lower := func(s string) string {
		return strings.Map(func(c rune) rune {
			if 'A' <= c && c <= 'Z' {
				return c + 'a' - 'A'
			}
			return c
		}, s)
	}
	pct := func(s string) string {
		return uriPctRe.ReplaceAllStringFunc(s, func(m string) string {
			n, _ := strconv.ParseUint(m[1:], 16, 8)
			c := byte(n)
			if ('A' <= c && c <= 'Z') || ('a' <= c && c <= 'z') ||
				('0' <= c && c <= '9') || strings.IndexByte("-._~", c) >= 0 {
				return string(rune(c))
			}
			return strings.ToUpper(m)
		})
	}
	opt := func(p *string, f func(string) string) *string {
		if nil == p {
			return nil
		}
		s := f(*p)
		return &s
	}
	t.scheme = opt(t.scheme, lower)
	t.authority = opt(t.authority, func(a string) string {
		return pct(uriHostRe.ReplaceAllStringFunc(a, func(m string) string {
			sm := uriHostRe.FindStringSubmatch(m)
			return sm[1] + lower(sm[2])
		}))
	})
	t.path = pct(t.path)
	t.query = opt(t.query, pct)
	t.fragment = opt(t.fragment, pct)
	return t.String()
}

/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// The string formats `format(name)` asserts, written out as each RFC
// states them rather than taken from a host library or the grammar
// engine, so that both ports answer alike. Twin of ts/src/strformat.ts.

import (
	"regexp"
	"strings"
)

func fmtDigit(c byte) bool { return '0' <= c && c <= '9' }

func fmtAlpha(c rune) bool { return ('A' <= c && c <= 'Z') || ('a' <= c && c <= 'z') }

func fmtHex(c rune) bool {
	return ('0' <= c && c <= '9') || ('A' <= c && c <= 'F') || ('a' <= c && c <= 'f')
}

func fmtDigits(s string, at, n int) (int, bool) {
	if len(s) < at+n {
		return 0, false
	}
	v := 0
	for i := at; i < at+n; i++ {
		if !fmtDigit(s[i]) {
			return 0, false
		}
		v = v*10 + int(s[i]-'0')
	}
	return v, true
}

func fmtDaysIn(y, m int) int {
	leap := (0 == y%4 && 0 != y%100) || 0 == y%400
	switch m {
	case 2:
		if leap {
			return 29
		}
		return 28
	case 4, 6, 9, 11:
		return 30
	}
	return 31
}

// fmtDate is RFC 3339 section 5.6, full-date.
func fmtDate(s string) bool {
	y, yok := fmtDigits(s, 0, 4)
	m, mok := fmtDigits(s, 5, 2)
	d, dok := fmtDigits(s, 8, 2)
	return 10 == len(s) && '-' == s[4] && '-' == s[7] && yok && mok && dok &&
		1 <= m && m <= 12 && 1 <= d && d <= fmtDaysIn(y, m)
}

func fmtAt(s string, i int) byte {
	if i < len(s) {
		return s[i]
	}
	return 0
}

// fmtTime is RFC 3339 section 5.6, full-time. A leap second stands only
// at the last minute of the day in UTC, wherever the offset puts it
// locally.
func fmtTime(s string) bool {
	h, hok := fmtDigits(s, 0, 2)
	mi, mok := fmtDigits(s, 3, 2)
	se, sok := fmtDigits(s, 6, 2)
	if ':' != fmtAt(s, 2) || ':' != fmtAt(s, 5) || !hok || !mok || !sok ||
		23 < h || 59 < mi || 60 < se {
		return false
	}
	i := 8
	if '.' == fmtAt(s, i) {
		i++
		from := i
		for fmtDigit(fmtAt(s, i)) {
			i++
		}
		if from == i {
			return false
		}
	}
	off := 0
	switch fmtAt(s, i) {
	case 'Z', 'z':
		i++
	case '+', '-':
		oh, ohok := fmtDigits(s, i+1, 2)
		om, omok := fmtDigits(s, i+4, 2)
		if ':' != fmtAt(s, i+3) || !ohok || !omok || 23 < oh || 59 < om {
			return false
		}
		off = oh*60 + om
		if '-' == s[i] {
			off = -off
		}
		i += 6
	default:
		return false
	}
	return i == len(s) && (60 != se || 1439 == ((h*60+mi-off)%1440+1440)%1440)
}

func fmtDateTime(s string) bool {
	return 11 <= len(s) && ('T' == s[10] || 't' == s[10]) && fmtDate(s[:10]) &&
		fmtTime(s[11:])
}

// fmtDuration is RFC 3339 appendix A, whose ABNF designators match in
// either case, each spelled out, since case folding admits U+017F for s.
const fmtDur = `(?:[0-9]+[Hh](?:[0-9]+[Mm](?:[0-9]+[Ss])?)?|[0-9]+[Mm](?:[0-9]+[Ss])?|[0-9]+[Ss])`

var fmtDuration = regexp.MustCompile(`^[Pp](?:[0-9]+[Ww]|(?:[0-9]+[Yy](?:[0-9]+[Mm](?:[0-9]+[Dd])?)?` +
	`|[0-9]+[Mm](?:[0-9]+[Dd])?|[0-9]+[Dd])(?:[Tt]` + fmtDur + `)?|[Tt]` + fmtDur + `)$`)

const fmtOctet = `(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])`

var fmtIPv4 = regexp.MustCompile(`^` + fmtOctet + `(?:\.` + fmtOctet + `){3}$`)

func fmtIsIPv4(s string) bool { return fmtIPv4.MatchString(s) }

// fmtIsIPv6 is RFC 4291 section 2.2: hexadecimal groups, a "::"
// standing for gap or more of them, and the last two written as a
// dotted quad if wished.
func fmtIsIPv6(s string, gap int) bool {
	halves := strings.Split(s, "::")
	if 2 < len(halves) {
		return false
	}
	groups := func(part string, last bool) (int, bool) {
		if "" == part {
			return 0, true
		}
		gs := strings.Split(part, ":")
		n := 0
		for i, g := range gs {
			switch {
			case last && i == len(gs)-1 && strings.Contains(g, "."):
				if !fmtIsIPv4(g) {
					return 0, false
				}
				n += 2
			case 0 < len(g) && len(g) <= 4 && fmtAllHex(g):
				n++
			default:
				return 0, false
			}
		}
		return n, true
	}
	head, hok := groups(halves[0], 1 == len(halves))
	tail, tok := 0, true
	if 2 == len(halves) {
		tail, tok = groups(halves[1], true)
	}
	if !hok || !tok {
		return false
	}
	if 1 == len(halves) {
		return 8 == head
	}
	return head+tail <= 8-gap
}

func fmtAllHex(g string) bool {
	for _, c := range g {
		if !fmtHex(c) {
			return false
		}
	}
	return true
}

var fmtUUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// fmtLabel is RFC 1123 section 2.1: letters, digits and inner hyphens,
// at most 63, an A-label among them valid by RFC 5891.
var fmtLabel = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$`)

func fmtHostname(s string) bool {
	if 0 == len(s) || 253 < len(s) {
		return false
	}
	for _, label := range strings.Split(s, ".") {
		if !fmtLabel.MatchString(label) {
			return false
		}
	}
	return idnaALabelsValid(s)
}

// RFC 5321 section 4.1.2, Mailbox.
const fmtAtext = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"

var (
	fmtDotString = regexp.MustCompile(`^` + fmtAtext + `(?:\.` + fmtAtext + `)*$`)
	fmtQuoted    = regexp.MustCompile(`^"(?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\[\x20-\x7e])*"$`)
	fmtIPv6Tag   = regexp.MustCompile(`^[Ii][Pp][Vv]6:`)
)

// A local part may hold any non-ASCII character, by RFC 6531.
const fmtUAtext = "(?:[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]|[^\\x00-\\x7f])+"

var (
	fmtUDotString = regexp.MustCompile(`^` + fmtUAtext + `(?:\.` + fmtUAtext + `)*$`)
	fmtUQuoted    = regexp.MustCompile(`^"(?:[\x20\x21\x23-\x5b\x5d-\x7e]|[^\x00-\x7f]|\\[\x20-\x7e])*"$`)
)

func fmtMailbox(s string, idn bool) bool {
	at := strings.LastIndex(s, "@")
	if at < 1 {
		return false
	}
	local, domain := s[:at], s[at+1:]
	dot, quoted, host := fmtDotString, fmtQuoted, fmtHostname
	if idn {
		dot, quoted, host = fmtUDotString, fmtUQuoted, idnaIsIdnHostname
	}
	if !dot.MatchString(local) && !quoted.MatchString(local) {
		return false
	}
	if strings.HasPrefix(domain, "[") && strings.HasSuffix(domain, "]") {
		lit := domain[1 : len(domain)-1]
		// RFC 5321 section 4.1.3: an address literal's "::" elides a pair
		// of groups at least.
		return fmtIsIPv4(lit) || (fmtIPv6Tag.MatchString(lit) && fmtIsIPv6(lit[5:], 2))
	}
	return host(domain)
}

// fmtJSONPointer is RFC 6901 section 3: a "~" escapes "0" or "1" and
// nothing else.
func fmtJSONPointer(s string) bool {
	if "" != s && '/' != s[0] {
		return false
	}
	for i := 0; i < len(s); i++ {
		if '~' == s[i] && '0' != fmtAt(s, i+1) && '1' != fmtAt(s, i+1) {
			return false
		}
	}
	return true
}

var fmtRelPrefix = regexp.MustCompile(`^(?:0|[1-9][0-9]*)`)

// fmtRelativeJSONPointer is the relative JSON pointer JSON Schema
// names: a non-negative integer, then "#" or a JSON pointer.
func fmtRelativeJSONPointer(s string) bool {
	m := fmtRelPrefix.FindString(s)
	if "" == m {
		return false
	}
	rest := s[len(m):]
	return "#" == rest || fmtJSONPointer(rest)
}

// fmtUcschar and fmtIprivate are RFC 3987 section 2.2's ranges, which an
// IRI's unreserved characters, and its query, take in.
func fmtUcschar(c rune) bool {
	return (0xa0 <= c && c <= 0xd7ff) || (0xf900 <= c && c <= 0xfdcf) ||
		(0xfdf0 <= c && c <= 0xffef) ||
		(0x10000 <= c && c <= 0xefffd && 0xfffe > (c&0xffff))
}

func fmtIprivate(c rune) bool {
	return (0xe000 <= c && c <= 0xf8ff) ||
		(0xf0000 <= c && c <= 0x10fffd && 0xfffe > (c&0xffff))
}

// fmtClean: every character of s is one the class allows, a
// percent-encoding included.
func fmtClean(s, cls string, iri bool) bool {
	cps := []rune(s)
	for i := 0; i < len(cps); i++ {
		c := cps[i]
		if '%' == c {
			if !(i+2 < len(cps) && fmtHex(cps[i+1]) && fmtHex(cps[i+2])) {
				return false
			}
			i += 2
			continue
		}
		if !(fmtAlpha(c) || ('0' <= c && c <= '9') ||
			strings.ContainsRune("-._~!$&'()*+,;=", c) ||
			(':' == c && "reg" != cls) ||
			('@' == c && "reg" != cls && "user" != cls) ||
			(('/' == c || '?' == c) && ("query" == cls || "frag" == cls)) ||
			(iri && (fmtUcschar(c) || ("query" == cls && fmtIprivate(c))))) {
			return false
		}
	}
	return true
}

func fmtPath(path string, iri bool) bool {
	for _, seg := range strings.Split(path, "/") {
		if !fmtClean(seg, "pchar", iri) {
			return false
		}
	}
	return true
}

var (
	fmtIPvFuture = regexp.MustCompile(`^[Vv][0-9a-fA-F]+\.[A-Za-z0-9\-._~!$&'()*+,;=:]+$`)
	fmtPortTail  = regexp.MustCompile(`^(?::[0-9]*)?$`)
	fmtPort      = regexp.MustCompile(`^[0-9]*$`)
)

// fmtAuthority: a reg-name holds no colon, so the last one starts the
// port.
func fmtAuthority(auth string, iri bool) bool {
	at := strings.LastIndex(auth, "@")
	if 0 <= at && !fmtClean(auth[:at], "user", iri) {
		return false
	}
	hostport := auth[at+1:]
	if strings.HasPrefix(hostport, "[") {
		end := strings.Index(hostport, "]")
		if end <= 0 {
			return false
		}
		lit := hostport[1:end]
		return fmtPortTail.MatchString(hostport[end+1:]) &&
			(fmtIsIPv6(lit, 1) || fmtIPvFuture.MatchString(lit))
	}
	colon := strings.LastIndex(hostport, ":")
	if colon < 0 {
		return fmtClean(hostport, "reg", iri)
	}
	return fmtPort.MatchString(hostport[colon+1:]) &&
		fmtClean(hostport[:colon], "reg", iri)
}

var (
	fmtScheme = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+\-.]*$`)
	fmtSplit  = regexp.MustCompile(`(?s)^(?:([^:/?#]+):)?(?://([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$`)
)

// fmtURIRef is RFC 3986 section 3, and RFC 3987 section 2.2 for an IRI.
func fmtURIRef(s string, absolute, iri bool) bool {
	m := fmtSplit.FindStringSubmatchIndex(s)
	part := func(n int) (string, bool) {
		if m[2*n] < 0 {
			return "", false
		}
		return s[m[2*n]:m[2*n+1]], true
	}
	scheme, hasScheme := part(1)
	auth, hasAuth := part(2)
	path, _ := part(3)
	query, hasQuery := part(4)
	frag, hasFrag := part(5)
	if hasScheme && !fmtScheme.MatchString(scheme) || !hasScheme && absolute {
		return false
	}
	if hasAuth {
		if !fmtAuthority(auth, iri) || ("" != path && !strings.HasPrefix(path, "/")) {
			return false
		}
	} else if strings.HasPrefix(path, "//") ||
		(!hasScheme && strings.Contains(strings.SplitN(path, "/", 2)[0], ":")) {
		return false
	}
	return fmtPath(path, iri) &&
		(!hasQuery || fmtClean(query, "query", iri)) &&
		(!hasFrag || fmtClean(frag, "frag", iri))
}

// RFC 6570 section 2: literals, and expressions of variable lists with
// an optional operator, a prefix modifier or an explode each.
const (
	fmtVarchar = `(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})`
	fmtVarspec = fmtVarchar + `+(?:\.` + fmtVarchar + `+)*(?::[1-9][0-9]{0,3}|\*)?`
)

var fmtExpression = regexp.MustCompile(`^[+#./;?&=,!@|]?` + fmtVarspec +
	`(?:,` + fmtVarspec + `)*$`)

func fmtURITemplate(s string) bool {
	cps := []rune(s)
	for i := 0; i < len(cps); {
		c := cps[i]
		switch {
		case '{' == c:
			end := -1
			for j := i; j < len(cps); j++ {
				if '}' == cps[j] {
					end = j
					break
				}
			}
			if end < 0 || !fmtExpression.MatchString(string(cps[i+1:end])) {
				return false
			}
			i = end + 1
		case '%' == c:
			if !(i+2 < len(cps) && fmtHex(cps[i+1]) && fmtHex(cps[i+2])) {
				return false
			}
			i += 3
		default:
			if c <= 0x20 || 0x7f == c || strings.ContainsRune("\"<>\\^`{|}", c) ||
				(0x7f < c && !fmtUcschar(c) && !fmtIprivate(c)) {
				return false
			}
			i++
		}
	}
	return true
}

var fmtChecks = map[string]func(string) bool{
	"date":                  fmtDate,
	"time":                  fmtTime,
	"date-time":             fmtDateTime,
	"duration":              fmtDuration.MatchString,
	"ipv4":                  fmtIsIPv4,
	"ipv6":                  func(s string) bool { return fmtIsIPv6(s, 1) },
	"uuid":                  fmtUUID.MatchString,
	"hostname":              fmtHostname,
	"idn-hostname":          idnaIsIdnHostname,
	"email":                 func(s string) bool { return fmtMailbox(s, false) },
	"idn-email":             func(s string) bool { return fmtMailbox(s, true) },
	"json-pointer":          fmtJSONPointer,
	"relative-json-pointer": fmtRelativeJSONPointer,
	"uri":                   func(s string) bool { return fmtURIRef(s, true, false) },
	"uri-reference":         func(s string) bool { return fmtURIRef(s, false, false) },
	"iri":                   func(s string) bool { return fmtURIRef(s, true, true) },
	"iri-reference":         func(s string) bool { return fmtURIRef(s, false, true) },
	"uri-template":          fmtURITemplate,
}

// fmtUnchecked are the formats JSON Schema defines that no checker
// here answers yet.
var fmtUnchecked = map[string]bool{"regex": true}

// formatCheck is the checker a format name asks for, nil for a name with
// none.
func formatCheck(name string) func(string) bool {
	return fmtChecks[name]
}

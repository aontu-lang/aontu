/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// THE ESCAPE CONVENTIONS (G9 phase 6, the Go side of ts/src/escape.ts,
// docs/design/TEMPLATE.0.md D4). esc(s, variant?) makes a string safe
// to place inside a literal of the named convention, and usc reads it
// back out.
//
// A VARIANT NAMES A CONVENTION, NOT A LANGUAGE: several languages share
// one convention, and one language has several -- a C-family literal
// escapes differently in each quote, and SQL spells a literal one way
// and an identifier another. With no variant it is the C escape, JSON
// canonical, which covers TypeScript, JavaScript, Java, C, C++, C#, Go,
// Rust, Swift, Kotlin, Scala and JSON itself.
//
// EVERY CONVENTION IS SPELLED OUT HERE rather than borrowed from a host
// function, and the reason is parity: encoding/json escapes what
// JSON.stringify does not, and url.QueryEscape is not RFC 3986. A
// generated file must be byte-identical whichever engine wrote it.
//
// usc IS THE LEFT INVERSE, AND IT IS PARTIAL. usc(esc(s)) is s for
// every s; esc(usc(t)) is t only for canonically escaped t. Input with
// no inverse is REFUSED (usc_malformed), never passed through.

// escVariants are the variant names, in the order the reference lists
// them. `none` is not here: it is the absent argument, and the absent
// argument is the C/JSON convention.
var escVariants = []string{"sq", "sql", "shell", "xml", "uri", "regex"}

// escRegexPunct are the regex metacharacters, which are exactly the
// ones the pattern subset admits as escaped-to-mean-themselves
// (reEscapePunct in constraint.go). So esc(s, regex) always answers a
// pattern the subset accepts, which is the point of the variant.
const escRegexPunct = `\.+*?()[]{}|^$/`

// escXml are the five entities, in the order they must be APPLIED: `&`
// first, or the ampersands of the other four are escaped a second time.
var escXml = [][2]string{
	{"&", "&amp;"},
	{"<", "&lt;"},
	{">", "&gt;"},
	{"\"", "&quot;"},
	{"'", "&apos;"},
}

// escUriUnreserved are the characters RFC 3986 calls unreserved.
// Everything else is percent-encoded, byte by byte of its UTF-8, with
// UPPERCASE hex -- the case the RFC prefers, pinned here because the
// two ports must agree on it.
const escUriUnreserved = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
	"abcdefghijklmnopqrstuvwxyz0123456789-._~"

const escHexLower = "0123456789abcdef"
const escHexUpper = "0123456789ABCDEF"

func isEscVariant(v string) bool {
	for _, n := range escVariants {
		if n == v {
			return true
		}
	}
	return false
}

// escC is the C escape, in whichever quote the convention uses. Control
// characters below U+0020 with no short form become \uXXXX with
// LOWERCASE hex, as JSON writes them; U+007F is not a JSON escape and
// is left alone.
func escC(src string, quote rune) string {
	var out strings.Builder
	for _, ch := range src {
		switch {
		case '\\' == ch:
			out.WriteString(`\\`)
		case quote == ch:
			out.WriteRune('\\')
			out.WriteRune(quote)
		case '\n' == ch:
			out.WriteString(`\n`)
		case '\r' == ch:
			out.WriteString(`\r`)
		case '\t' == ch:
			out.WriteString(`\t`)
		case '\b' == ch:
			out.WriteString(`\b`)
		case '\f' == ch:
			out.WriteString(`\f`)
		case 0x20 > ch:
			out.WriteString(`\u`)
			for shift := 12; shift >= 0; shift -= 4 {
				out.WriteByte(escHexLower[(ch>>uint(shift))&0xF])
			}
		default:
			out.WriteRune(ch)
		}
	}
	return out.String()
}

// unescC is the inverse. A \uXXXX naming half a surrogate pair is read
// WITH its partner or refused: a lone surrogate is not a character
// either port can carry, and answering one in TypeScript where Go
// cannot is the divergence the whole table exists to avoid.
func unescC(src string, quote rune) (string, bool) {
	var out strings.Builder
	r := []rune(src)

	for i := 0; i < len(r); i++ {
		if '\\' != r[i] {
			out.WriteRune(r[i])
			continue
		}

		i++
		if len(r) <= i {
			return "", false
		}

		switch {
		case '\\' == r[i]:
			out.WriteRune('\\')
			continue
		case quote == r[i]:
			out.WriteRune(quote)
			continue
		case 'n' == r[i]:
			out.WriteRune('\n')
			continue
		case 'r' == r[i]:
			out.WriteRune('\r')
			continue
		case 't' == r[i]:
			out.WriteRune('\t')
			continue
		case 'b' == r[i]:
			out.WriteRune('\b')
			continue
		case 'f' == r[i]:
			out.WriteRune('\f')
			continue
		case 'u' != r[i]:
			return "", false
		}

		hi, ok := hex4(r, i+1)
		if !ok {
			return "", false
		}
		i += 4

		if 0xDC00 <= hi && 0xDFFF >= hi {
			return "", false
		}

		if 0xD800 <= hi && 0xDBFF >= hi {
			// A high surrogate must be followed by its own \u low one.
			if len(r) <= i+2 || '\\' != r[i+1] || 'u' != r[i+2] {
				return "", false
			}
			lo, ok := hex4(r, i+3)
			if !ok || 0xDC00 > lo || 0xDFFF < lo {
				return "", false
			}
			i += 6
			out.WriteRune(utf16.DecodeRune(rune(hi), rune(lo)))
			continue
		}

		out.WriteRune(rune(hi))
	}

	return out.String(), true
}

// hex4 is four hex digits at `at`, or !ok when they are not four hex
// digits.
func hex4(r []rune, at int) (int, bool) {
	if len(r) < at+4 {
		return 0, false
	}
	v := 0
	for i := at; i < at+4; i++ {
		d := hexDigit(r[i])
		if 0 > d {
			return 0, false
		}
		v = v*16 + d
	}
	return v, true
}

func hexDigit(ch rune) int {
	switch {
	case '0' <= ch && '9' >= ch:
		return int(ch - '0')
	case 'a' <= ch && 'f' >= ch:
		return int(ch-'a') + 10
	case 'A' <= ch && 'F' >= ch:
		return int(ch-'A') + 10
	}
	return -1
}

// escSql is standard SQL: a literal's only escape is the doubled quote.
// A LONE quote has no inverse -- it is the escape character, so its
// meaning depends on what was meant to follow it.
func escSql(src string) string {
	return strings.ReplaceAll(src, "'", "''")
}

func unescSql(src string) (string, bool) {
	var out strings.Builder
	r := []rune(src)
	for i := 0; i < len(r); i++ {
		if '\'' != r[i] {
			out.WriteRune(r[i])
			continue
		}
		if len(r) <= i+1 || '\'' != r[i+1] {
			return "", false
		}
		out.WriteRune('\'')
		i++
	}
	return out.String(), true
}

// escShell is POSIX single-quoting: the caller wraps the value in
// single quotes, and a quote inside it closes, escapes and reopens
// them.
func escShell(src string) string {
	return strings.ReplaceAll(src, "'", `'\''`)
}

func unescShell(src string) (string, bool) {
	var out strings.Builder
	r := []rune(src)
	for i := 0; i < len(r); i++ {
		if '\'' != r[i] {
			out.WriteRune(r[i])
			continue
		}
		if len(r) <= i+3 || '\\' != r[i+1] || '\'' != r[i+2] || '\'' != r[i+3] {
			return "", false
		}
		out.WriteRune('\'')
		i += 3
	}
	return out.String(), true
}

func escXmlText(src string) string {
	var out strings.Builder
	for _, ch := range src {
		ent := ""
		for _, e := range escXml {
			if e[0] == string(ch) {
				ent = e[1]
				break
			}
		}
		if "" == ent {
			out.WriteRune(ch)
			continue
		}
		out.WriteString(ent)
	}
	return out.String()
}

// unescXmlText refuses a bare `&` rather than passing it through: it is
// the one character whose meaning is ambiguous here, since it opens an
// entity. Every other character is unambiguous and passes.
func unescXmlText(src string) (string, bool) {
	var out strings.Builder
	for i := 0; i < len(src); {
		if '&' != src[i] {
			out.WriteByte(src[i])
			i++
			continue
		}
		matched := false
		for _, e := range escXml {
			if strings.HasPrefix(src[i:], e[1]) {
				out.WriteString(e[0])
				i += len(e[1])
				matched = true
				break
			}
		}
		if !matched {
			return "", false
		}
	}
	return out.String(), true
}

func escUri(src string) string {
	var out strings.Builder
	for _, b := range []byte(src) {
		if strings.IndexByte(escUriUnreserved, b) >= 0 {
			out.WriteByte(b)
			continue
		}
		out.WriteByte('%')
		out.WriteByte(escHexUpper[b>>4])
		out.WriteByte(escHexUpper[b&0xF])
	}
	return out.String()
}

func unescUri(src string) (string, bool) {
	bytes := make([]byte, 0, len(src))
	for i := 0; i < len(src); i++ {
		if '%' != src[i] {
			bytes = append(bytes, src[i])
			continue
		}
		if len(src) <= i+2 {
			return "", false
		}
		hi := hexDigit(rune(src[i+1]))
		lo := hexDigit(rune(src[i+2]))
		if 0 > hi || 0 > lo {
			return "", false
		}
		bytes = append(bytes, byte(hi*16+lo))
		i += 2
	}
	// The strict decoder: an overlong form, a surrogate, a truncated
	// sequence or a value past U+10FFFF has no character to answer with.
	if !utf8.Valid(bytes) {
		return "", false
	}
	return string(bytes), true
}

func escRegexText(src string) string {
	var out strings.Builder
	for _, ch := range src {
		if strings.ContainsRune(escRegexPunct, ch) {
			out.WriteRune('\\')
		}
		out.WriteRune(ch)
	}
	return out.String()
}

// unescRegexText passes a bare metacharacter, which is unambiguous; a
// backslash before anything the convention does not escape has no
// inverse.
func unescRegexText(src string) (string, bool) {
	var out strings.Builder
	r := []rune(src)
	for i := 0; i < len(r); i++ {
		if '\\' != r[i] {
			out.WriteRune(r[i])
			continue
		}
		if len(r) <= i+1 || !strings.ContainsRune(escRegexPunct, r[i+1]) {
			return "", false
		}
		out.WriteRune(r[i+1])
		i++
	}
	return out.String(), true
}

// escapeText is the one entry point each way. An unknown variant never
// reaches here: the call refuses it (esc_variant) before either is
// asked.
func escapeText(src string, variant string) string {
	switch variant {
	case "sq":
		return escC(src, '\'')
	case "sql":
		return escSql(src)
	case "shell":
		return escShell(src)
	case "xml":
		return escXmlText(src)
	case "uri":
		return escUri(src)
	case "regex":
		return escRegexText(src)
	}
	return escC(src, '"')
}

func unescapeText(src string, variant string) (string, bool) {
	switch variant {
	case "sq":
		return unescC(src, '\'')
	case "sql":
		return unescSql(src)
	case "shell":
		return unescShell(src)
	case "xml":
		return unescXmlText(src)
	case "uri":
		return unescUri(src)
	case "regex":
		return unescRegexText(src)
	}
	return unescC(src, '"')
}

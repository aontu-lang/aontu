/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
	"unicode/utf8"
)

const regexVectorsDir = "../test/vectors"

var (
	t262Point  = regexp.MustCompile(`0x([0-9A-F]+)`)
	t262Range  = regexp.MustCompile(`\[0x([0-9A-F]+), 0x([0-9A-F]+)\]`)
	t262Escape = regexp.MustCompile(`/\^?(\\[pP]\{[^}]+\})(?:\+\$)?/u`)
)

func vectorHex(t *testing.T, s string) int {
	t.Helper()
	n, err := strconv.ParseInt(s, 16, 32)
	if nil != err {
		t.Fatalf("not hex: %q", s)
	}
	return int(n)
}

// t262Built is the set a test262 file builds: buildString's
// loneCodePoints and ranges.
func t262Built(t *testing.T, text string) uRanges {
	t.Helper()
	at := strings.Index(text, "loneCodePoints: [")
	rest := text[at:]
	lone := rest[:strings.Index(rest, "]")]
	ranges := rest[strings.Index(rest, "ranges: ["):strings.Index(rest, "\n});")]
	set := uRanges{}
	for _, m := range t262Point.FindAllStringSubmatch(lone, -1) {
		c := vectorHex(t, m[1])
		set = append(set, [2]int{c, c})
	}
	for _, m := range t262Range.FindAllStringSubmatch(ranges, -1) {
		set = append(set, [2]int{vectorHex(t, m[1]), vectorHex(t, m[2])})
	}
	return uUnion([]uRanges{set})
}

func sameRanges(a, b uRanges) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// t262Delta is what the delta file says each file's set gains and loses.
func t262Delta(t *testing.T) map[string]map[string]uRanges {
	t.Helper()
	data, err := os.ReadFile(filepath.FromSlash(regexVectorsDir + "/test262/unicode-17-to-18.tsv"))
	if nil != err {
		t.Fatal(err)
	}
	out := map[string]map[string]uRanges{}
	for _, line := range strings.Split(string(data), "\n") {
		if "" == line || strings.HasPrefix(line, "#") {
			continue
		}
		f := strings.Split(line, "\t")
		if nil == out[f[0]] {
			out[f[0]] = map[string]uRanges{"+": {}, "-": {}}
		}
		rs := uRanges{}
		for _, s := range strings.Split(f[2], " ") {
			lo, hi, found := strings.Cut(s, "..")
			if !found {
				hi = lo
			}
			rs = append(rs, [2]int{vectorHex(t, lo), vectorHex(t, hi)})
		}
		out[f[0]][f[1]] = rs
	}
	return out
}

// TestRegexVectorsTest262 holds the owned parser's \p{..} and \P{..}
// sets to test262's generated property escapes. The files were generated
// for Unicode 17.0.0, the tables for 18.0.0: the delta, read from both
// releases' files, says what moved. Twin of
// ts/test/regex-vectors.test.ts.
func TestRegexVectorsTest262(t *testing.T) {
	dir := filepath.FromSlash(regexVectorsDir + "/test262/property-escapes")
	entries, err := os.ReadDir(dir)
	if nil != err {
		t.Fatal(err)
	}
	delta := t262Delta(t)
	files, escapes := 0, 0
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".js") {
			continue
		}
		files++
		stem := strings.TrimSuffix(e.Name(), ".js")
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if nil != err {
			t.Fatal(err)
		}
		text := string(data)
		matched := text
		if split := strings.Index(text, "const nonMatchSymbols"); -1 != split {
			matched = text[:split]
			if !sameRanges(t262Built(t, text[split:]), uComplement(t262Built(t, matched))) {
				t.Errorf("%s: its two sets are not complements", e.Name())
			}
		}
		d := delta[stem]
		delete(delta, stem)
		want := t262Built(t, matched)
		if nil != d {
			want = uUnion([]uRanges{uMinus(want, d["-"]), d["+"]})
		}
		for _, m := range t262Escape.FindAllStringSubmatch(text, -1) {
			escapes++
			prog, why := compilePattern(m[1], "ecma")
			if nil == prog {
				t.Errorf("%s: %s is refused: %s", e.Name(), m[1], why)
				continue
			}
			expect := want
			if 'P' == m[1][1] {
				expect = uComplement(want)
			}
			if got := prog[0].set; "set" != prog[0].op || !sameRanges(got, expect) {
				t.Errorf("%s: %s reads %d ranges more and %d fewer", e.Name(), m[1],
					len(uMinus(got, expect)), len(uMinus(expect, got)))
			}
		}
	}
	if 441 != files || 3492 != escapes {
		t.Errorf("read %d files and %d escapes, wanted 441 and 3492", files, escapes)
	}
	stale := []string{}
	for stem := range delta {
		stale = append(stale, stem)
	}
	sort.Strings(stale)
	if 0 < len(stale) {
		t.Errorf("the delta names files that are not vendored: %v", stale)
	}
}

// TestRegexVectorsRE2 reads RE2's search tests as re() reads a pattern:
// the second column is RE2's unanchored search, which is the question
// re() asks. A pattern re() refuses is RE2's syntax and not u mode's:
// \C, an octal escape, \x{..}, \pN, a script by its bare name, an inline
// flag. It is counted and passed over.
func TestRegexVectorsRE2(t *testing.T) {
	data, err := os.ReadFile(filepath.FromSlash(regexVectorsDir + "/re2/re2-search.txt"))
	if nil != err {
		t.Fatal(err)
	}
	unquote := func(n int, lit string) string {
		s, err := strconv.Unquote(lit)
		if nil != err || !utf8.ValidString(s) {
			t.Fatalf("re2-search.txt line %d is not a UTF-8 string: %s", n, lit)
		}
		return s
	}
	lines := strings.Split(string(data), "\n")
	strs := []string{}
	agree, refused := 0, 0
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if "strings" == line {
			strs = strs[:0]
			for i++; "regexps" != lines[i]; i++ {
				strs = append(strs, unquote(i+1, lines[i]))
			}
			continue
		}
		if !strings.HasPrefix(line, `"`) {
			continue
		}
		pattern := unquote(i+1, line)
		prog, _ := compilePattern(pattern, "aontu")
		for _, s := range strs {
			i++
			found := "-" != strings.Split(lines[i], ";")[1]
			if nil == prog {
				refused++
			} else if patternMatches(prog, s) != found {
				t.Errorf("re2-search.txt line %d: %q on %q: re2 says %v", i+1, pattern, s, found)
			} else {
				agree++
			}
		}
	}
	if 1568 != agree || 320 != refused {
		t.Errorf("agree %d, refused %d; wanted 1568 and 320", agree, refused)
	}
}

/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// Where the importer wrote each keyword, and Vet's output units (ADR-066).

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// SourceSpan is a span of the aontu text, as byte offsets into its UTF-8,
// end exclusive, and the keyword written there. A frame is the schema a
// reference reached, 0 the root; Keyword is the pointer from the frame's
// schema, Absolute the keyword's resource URI with its pointer as the
// fragment. Fields are in JSON-name order.
type SourceSpan struct {
	Absolute string `json:"absolute"`
	End      int    `json:"end"`
	Enters   *int   `json:"enters,omitempty"`
	Frame    int    `json:"frame"`
	Keyword  string `json:"keyword"`
	Required bool   `json:"required,omitempty"`
	Start    int    `json:"start"`
}

type SourceMap struct {
	Sha256 string       `json:"sha256"`
	Spans  []SourceSpan `json:"spans"`
}

// OutputUnit is one of JSON Schema's output units, fields in JSON-name order.
type OutputUnit struct {
	AbsoluteKeywordLocation *string      `json:"absoluteKeywordLocation,omitempty"`
	Error                   *string      `json:"error,omitempty"`
	Errors                  []OutputUnit `json:"errors,omitempty"`
	InstanceLocation        string       `json:"instanceLocation"`
	KeywordLocation         string       `json:"keywordLocation"`
	Valid                   bool         `json:"valid"`
}

// OutputFlag is the flag form: the verdict alone.
type OutputFlag struct {
	Valid bool `json:"valid"`
}

// TextSha is the SHA-256 of a text, in lower-case hex.
func TextSha(text string) string {
	return importSha(text)
}

// fragmentOf writes a pointer as a URI fragment: every byte of a
// character a fragment does not hold as itself, percent-encoded.
func fragmentOf(ptr string) string {
	var b strings.Builder
	for _, r := range ptr {
		if r < 0x80 && strings.ContainsRune(fragmentChars, r) {
			b.WriteRune(r)
			continue
		}
		var buf [4]byte
		for _, c := range buf[:utf8.EncodeRune(buf[:], r)] {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

const fragmentChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~!$&'()*+,;=:@/?"

func pointerOf(segs []string) string {
	var b strings.Builder
	for _, s := range segs {
		b.WriteString("/" + pointerEscaper.Replace(s))
	}
	return b.String()
}

func segmentsOf(ptr string) []string {
	if "" == ptr {
		return []string{}
	}
	segs := strings.Split(ptr[1:], "/")
	for i, s := range segs {
		segs[i] = pointerUnescaper.Replace(s)
	}
	return segs
}

type smTok struct {
	start, end int
	text       string
	atom       bool
}

const smBreak = " \t\n\r{}[](),:\"|&?"

// smTokens reads the importer's text as tokens: a string, a bracket, a
// comma or a colon, one of `| & ?`, or a run of anything else. Only
// brackets, commas and colons are ones the formatter may add or drop.
func smTokens(s string) []smTok {
	out := []smTok{}
	for i := 0; i < len(s); {
		c := s[i]
		j := i + 1
		if '"' == c {
			for j < len(s) && '"' != s[j] {
				if '\\' == s[j] {
					j++
				}
				j++
			}
			j++
		} else if !strings.ContainsRune(smBreak, rune(c)) {
			for j < len(s) && !strings.ContainsRune(smBreak, rune(s[j])) {
				j++
			}
		}
		if !strings.ContainsRune(" \t\n\r", rune(c)) {
			end := min(j, len(s))
			out = append(out, smTok{start: i, end: end, text: s[i:end],
				atom: !strings.ContainsRune("{}[](),:", rune(c))})
		}
		i = j
	}
	return out
}

// sameAtom: a key the importer quotes, the formatter may write bare.
func sameAtom(printed, formatted string) bool {
	return printed == formatted ||
		('"' == printed[0] && printed[1:len(printed)-1] == formatted)
}

// smHeads is, for each atom that starts a line, the atom starting the
// line before it at the same column, in the same block, else -1; and
// each atom's line.
func smHeads(text string, F []smTok, fa []int) ([]int, []int) {
	prev, line := make([]int, len(fa)), make([]int, len(fa))
	open := map[int]int{}
	from, at, k := 0, 0, 0
	for t := range F {
		gap := 0
		if 0 < t {
			gap = F[t-1].end
		}
		nl := strings.LastIndexByte(text[gap:F[t].start], '\n')
		if -1 != nl {
			from = gap + nl + 1
		}
		if 0 < t && -1 != nl {
			at++
		}
		col := F[t].start - from
		first := 0 == t || -1 != nl
		for c := range open {
			if first && c > col {
				delete(open, c)
			}
		}
		if F[t].atom {
			prev[k] = -1
			if p, ok := open[col]; ok && first {
				prev[k] = p
			}
			line[k] = at
			if first {
				open[col] = k
			}
			k++
		}
	}
	return prev, line
}

// smRepeated is how many atoms from j the formatter wrote as a copy of
// the head of the line before, ahead of the atom the printed text has
// next: the prefix it repeats for each member of a map it lays out one
// to a line.
func smRepeated(prev, line, fa []int, F []smTok, j int, next string) int {
	s := prev[j]
	for h := 1; -1 != s && j+h < len(fa) && line[s+h-1] == line[s] && line[j+h] == line[j]; h++ {
		if F[fa[j+h-1]].text != F[fa[s+h-1]].text {
			return 0
		}
		if sameAtom(next, F[fa[j+h]].text) {
			return h
		}
	}
	return 0
}

// carrySpans carries each range of the printed text to the formatted
// text by the tokens the two share, false where none of its tokens
// survived. The formatter keeps every token but brackets, commas and
// colons in order; past a token that differs, nothing is carried.
func carrySpans(printed, formatted string, ranges [][2]int) ([][2]int, []bool) {
	P, F := smTokens(printed), smTokens(formatted)
	pa, fa := []int{}, []int{}
	for i, t := range P {
		if t.atom {
			pa = append(pa, i)
		}
	}
	for i, t := range F {
		if t.atom {
			fa = append(fa, i)
		}
	}
	prev, line := smHeads(formatted, F, fa)
	to := make([]int, len(P))
	for i := range to {
		to[i] = -1
	}
	follows := func(pi, fj int) bool {
		return pi < len(pa) && fj < len(fa) && sameAtom(P[pa[pi]].text, F[fa[fj]].text)
	}
	mp, mf := []int{}, []int{}
	i, j := 0, 0
	for i < len(pa) && j < len(fa) {
		// Where the atom also matches in place, the copy is skipped only if
		// the atom after it then lines up and does not otherwise.
		h := smRepeated(prev, line, fa, F, j, P[pa[i]].text)
		if 0 < h && (!follows(i, j) || (!follows(i+1, j+1) && follows(i+1, j+h+1))) {
			j += h
		}
		if !follows(i, j) {
			break
		}
		to[pa[i]] = fa[j]
		mp, mf = append(mp, pa[i]), append(mf, fa[j])
		i, j = i+1, j+1
	}
	// Between carried atoms, the punctuation pairs in order.
	for k := 0; k <= len(mp); k++ {
		p1, f1 := len(P), len(F)
		if k < len(mp) {
			p1, f1 = mp[k], mf[k]
		}
		if k == len(mp) && i < len(pa) {
			p1 = pa[i]
		}
		if k == len(mp) && j < len(fa) {
			f1 = fa[j]
		}
		m, n := 0, 0
		if 0 < k {
			m, n = mp[k-1]+1, mf[k-1]+1
		}
		for ; m < p1; m++ {
			q := n
			for q < f1 && F[q].text != P[m].text {
				q++
			}
			if q < f1 {
				to[m] = q
				n = q + 1
			}
		}
	}
	// The first token at or after an offset; a range ends between tokens.
	lower := func(x int) int {
		lo, hi := 0, len(P)
		for lo < hi {
			mid := (lo + hi) / 2
			if P[mid].start < x {
				lo = mid + 1
			} else {
				hi = mid
			}
		}
		return lo
	}
	out := make([][2]int, len(ranges))
	ok := make([]bool, len(ranges))
	for r, rg := range ranges {
		a, b := lower(rg[0]), lower(rg[1])-1
		for a <= b && -1 == to[a] {
			a++
		}
		for a <= b && -1 == to[b] {
			b--
		}
		if a <= b {
			out[r] = [2]int{F[to[a]].start, F[to[b]].end}
			ok[r] = true
		}
	}
	return out, ok
}

var shaRe = regexp.MustCompile(`^[0-9a-f]{64}$`)

// ReadSourceMap reads a source map back: false unless it has the shape
// the importer writes.
func ReadSourceMap(text string) (*SourceMap, bool) {
	var raw struct {
		Sha256 *string           `json:"sha256"`
		Spans  []json.RawMessage `json:"spans"`
	}
	if nil != json.Unmarshal([]byte(text), &raw) || nil == raw.Sha256 ||
		!shaRe.MatchString(*raw.Sha256) || nil == raw.Spans {
		return nil, false
	}
	out := &SourceMap{Sha256: *raw.Sha256, Spans: make([]SourceSpan, 0, len(raw.Spans))}
	for _, rs := range raw.Spans {
		var s map[string]any
		if nil != json.Unmarshal(rs, &s) || nil == s {
			return nil, false
		}
		start, ok1 := smCount(s["start"])
		end, ok2 := smCount(s["end"])
		frame, ok3 := smCount(s["frame"])
		keyword, ok4 := s["keyword"].(string)
		absolute, ok5 := s["absolute"].(string)
		span := SourceSpan{Absolute: absolute, End: end, Frame: frame, Keyword: keyword, Start: start}
		ok6 := true
		if v, has := s["enters"]; has {
			enters, okE := smCount(v)
			span.Enters, ok6 = &enters, okE
		}
		ok7 := true
		if v, has := s["required"]; has {
			span.Required, ok7 = true == v, true == v
		}
		if !(ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7) {
			return nil, false
		}
		out.Spans = append(out.Spans, span)
	}
	return out, true
}

// smCount is a JSON number that is a whole, non-negative, safe integer.
func smCount(v any) (int, bool) {
	f, ok := v.(float64)
	if !ok || f < 0 || f > 9007199254740991 || f != float64(int64(f)) {
		return 0, false
	}
	return int(f), true
}

// siteByte is the UTF-8 offset of a site's 1-based row and UTF-16
// column.
func siteByte(text string, site VetSite) int {
	at := 0
	for row := 1; row < site.Row && at < len(text); row++ {
		nl := strings.IndexByte(text[at:], '\n')
		if -1 == nl {
			at = len(text)
			break
		}
		at += nl + 1
	}
	for units := site.Col - 1; 0 < units && at < len(text); {
		r, size := utf8.DecodeRuneInString(text[at:])
		at += size
		units--
		if 0xFFFF < r {
			units--
		}
	}
	return at
}

type smStep struct {
	key, index string
	any        string // "key" or "index"
}

var smIndexRe = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)

// smSteps is the instance steps a keyword's pointer takes from its
// schema, read in whichever dialect wrote it: a property, an index, any
// of either, or none where an applicator stays at the instance it is
// given.
func smSteps(keyword string) []smStep {
	segs := segmentsOf(keyword)
	out := []smStep{}
	for i := 0; i < len(segs); i++ {
		s := segs[i]
		next := ""
		if i+1 < len(segs) {
			next = segs[i+1]
		}
		switch {
		case "properties" == s:
			out = append(out, smStep{key: next})
			i++
		case "prefixItems" == s || ("items" == s && smIndexRe.MatchString(next)):
			out = append(out, smStep{index: next})
			i++
		case inList([]string{"additionalProperties", "unevaluatedProperties", "propertyNames",
			"patternProperties"}, s):
			out = append(out, smStep{any: "key"})
			if "patternProperties" == s {
				i++
			}
		case inList([]string{"items", "additionalItems", "contains", "unevaluatedItems"}, s):
			out = append(out, smStep{any: "index"})
		case inList([]string{"allOf", "anyOf", "oneOf", "dependentSchemas", "dependencies",
			"$defs", "definitions"}, s):
			i++
		case !inList([]string{"not", "if", "then", "else", "$ref", "$dynamicRef", "$recursiveRef"}, s):
			return out
		}
	}
	return out
}

func smFits(step smStep, seg string) bool {
	switch {
	case "key" == step.any:
		return true
	case "index" == step.any:
		return smIndexRe.MatchString(seg)
	case "" != step.index:
		return step.index == seg
	}
	return step.key == seg
}

func smFitsAll(steps []smStep, path []string, from int) bool {
	for i, st := range steps {
		if !smFits(st, path[from+i]) {
			return false
		}
	}
	return true
}

// smLocated is where a finding's schema site was written.
type smLocated struct {
	keyword, absolute string
	instance          []string
}

// smLocate finds the innermost span holding a finding's schema site, and
// the references that led there, chosen so the instance steps they take
// spell the finding's path. A member the data lacks is placed at the
// `required` that asked for it, on the object that lacks it.
func smLocate(m *SourceMap, text string, site VetSite, instance []string,
	missing bool) (smLocated, bool) {
	at := siteByte(text, site)
	var holding, asked []SourceSpan
	for _, s := range m.Spans {
		if s.Start <= at && at < s.End {
			holding = append(holding, s)
			if missing && s.Required {
				asked = append(asked, s)
			}
		}
	}
	if 0 == len(holding) {
		return smLocated{}, false
	}
	span, path := holding[len(holding)-1], instance
	if 0 < len(asked) {
		span, path = asked[len(asked)-1], instance[:len(instance)-1]
	}
	own := smSteps(span.Keyword)
	tried := map[string]bool{}
	var climb func(frame, need int) (string, bool)
	climb = func(frame, need int) (string, bool) {
		key := strconv.Itoa(frame) + ":" + strconv.Itoa(need)
		if 0 == frame || tried[key] {
			return "", 0 == frame && 0 == need
		}
		tried[key] = true
		for _, ref := range m.Spans {
			if nil == ref.Enters || frame != *ref.Enters {
				continue
			}
			st := smSteps(ref.Keyword)
			from := need - len(st)
			if 0 <= from && smFitsAll(st, path, from) {
				if up, ok := climb(ref.Frame, from); ok {
					return up + ref.Keyword, true
				}
			}
		}
		return "", false
	}
	// The site may sit above the finding's path, as a closed map does.
	for need := len(path); len(own) <= need; need-- {
		from := need - len(own)
		if smFitsAll(own, path, from) {
			if up, ok := climb(span.Frame, from); ok {
				return smLocated{keyword: up + span.Keyword, absolute: span.Absolute, instance: path}, true
			}
		}
	}
	// No chain spells the path: the first reference into each frame.
	var first func(frame int, seen map[int]bool) string
	first = func(frame int, seen map[int]bool) string {
		if !seen[frame] {
			seen[frame] = true
			for _, ref := range m.Spans {
				if nil != ref.Enters && frame == *ref.Enters {
					return first(ref.Frame, seen) + ref.Keyword
				}
			}
		}
		return ""
	}
	return smLocated{keyword: first(span.Frame, map[int]bool{0: true}) + span.Keyword,
		absolute: span.Absolute, instance: path}, true
}

// VetOutput is a vet report as JSON Schema's output units: "flag" is the
// verdict alone, "basic" a unit per error kept, located by the schema
// text's source map.
func VetOutput(report VetReport, form, text string, m *SourceMap) any {
	valid := VetValid == report.Verdict
	if "flag" == form || nil == m {
		return OutputFlag{Valid: valid}
	}
	out := OutputUnit{Valid: valid}
	for _, s := range m.Spans {
		if 0 == s.Frame && "" == s.Keyword {
			abs := s.Absolute
			out.AbsoluteKeywordLocation = &abs
			break
		}
	}
	for _, f := range report.Findings {
		if "error" != f.Severity {
			continue
		}
		ptr := ""
		if nil != f.Pointer {
			ptr = *f.Pointer
		}
		instance := segmentsOf(ptr)
		missing := 0 < len(instance)
		var site *VetSite
		for i := range f.Sites {
			missing = missing && VetRoleData != f.Sites[i].Role
			if nil == site && VetRoleSchema == f.Sites[i].Role && 0 < f.Sites[i].Row {
				site = &f.Sites[i]
			}
		}
		msg := f.Message
		unit := OutputUnit{Error: &msg, InstanceLocation: pointerOf(instance)}
		if nil != site {
			if at, ok := smLocate(m, text, *site, instance, missing); ok {
				abs := at.absolute
				unit.KeywordLocation, unit.AbsoluteKeywordLocation = at.keyword, &abs
				unit.InstanceLocation = pointerOf(at.instance)
			}
		}
		out.Errors = append(out.Errors, unit)
	}
	return out
}

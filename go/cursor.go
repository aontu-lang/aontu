/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// CursorPosition is a zero-based line and UTF-16 character, as LSP counts.
type CursorPosition struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

type CursorRange struct {
	Start CursorPosition `json:"start"`
	End   CursorPosition `json:"end"`
}

// CursorPath is what a cursor is on, the path that stands there and, on
// a reference, the absolute path it reads.
type CursorPath struct {
	On    string      `json:"on"`
	Path  []string    `json:"path"`
	Range CursorRange `json:"range"`
	Reads []string    `json:"reads,omitempty"`
}

type PathSite struct {
	Canon string      `json:"canon"`
	File  string      `json:"file"`
	Range CursorRange `json:"range"`
	Role  string      `json:"role"`
}

type cursorHit struct {
	on         string
	path       []string
	start, end int
	reads      []string
}

const keyDelims = " \t\r\n{}[](),:;\"'"

type srcLines struct {
	src    string
	starts []int
}

func newSrcLines(src string) srcLines {
	starts := []int{0}
	for i := 0; i < len(src); i++ {
		if '\n' == src[i] {
			starts = append(starts, i+1)
		}
	}
	return srcLines{src: src, starts: starts}
}

// A character past the end of its line is the line's end, as LSP has it.
func (l srcLines) offsetAt(pos CursorPosition) int {
	off := l.starts[pos.Line]
	units := 0
	for off < len(l.src) && '\n' != l.src[off] && units < pos.Character {
		r, size := utf8.DecodeRuneInString(l.src[off:])
		off += size
		units += len(utf16.Encode([]rune{r}))
	}
	return off
}

func (l srcLines) positionOf(off int) CursorPosition {
	line := len(l.starts) - 1
	for 0 < line && off < l.starts[line] {
		line--
	}
	n := 0
	for _, r := range l.src[l.starts[line]:off] {
		n += len(utf16.Encode([]rune{r}))
	}
	return CursorPosition{Line: line, Character: n}
}

// keySpan is the key written just before a value, where it is the
// path's last segment: `seg:`, `seg?:` or `"seg":` with blanks between.
func keySpan(src string, at int, seg string) (int, int, bool) {
	i := at - 1
	for 0 <= i && strings.IndexByte(" \t\r\n", src[i]) >= 0 {
		i--
	}
	if 0 > i || ':' != src[i] {
		return 0, 0, false
	}
	i--
	if 0 <= i && '?' == src[i] {
		i--
	}
	for 0 <= i && (' ' == src[i] || '\t' == src[i]) {
		i--
	}
	if 0 > i {
		return 0, 0, false
	}
	q := src[i]
	j := i
	if '"' == q || '\'' == q {
		j--
		for 0 <= j && (q != src[j] || (0 < j && '\\' == src[j-1])) {
			j--
		}
		return j, i + 1, 0 <= j && src[j+1:i] == seg
	}
	for 0 <= j && strings.IndexByte(keyDelims, src[j]) < 0 {
		j--
	}
	word := src[j+1 : i+1]
	return j + 1, i + 1, word == seg || word == "%"+seg
}

type cursorKid struct {
	v    Val
	path []string
}

func cursorKids(v Val, path []string) []cursorKid {
	step := func(k string) []string {
		return append(append([]string{}, path...), k)
	}
	same := func(vs []Val) []cursorKid {
		out := make([]cursorKid, 0, len(vs))
		for _, k := range vs {
			out = append(out, cursorKid{k, path})
		}
		return out
	}
	switch b := v.(type) {
	case *MapVal:
		keys := append([]string{}, b.keys...)
		sort.Strings(keys)
		out := make([]cursorKid, 0, len(keys)+1)
		for _, k := range keys {
			if !strings.HasPrefix(k, "%") {
				out = append(out, cursorKid{b.peg[k], step(k)})
			}
		}
		if nil != b.spread {
			out = append(out, cursorKid{b.spread, step("&")})
		}
		return out
	case *ListVal:
		out := make([]cursorKid, 0, len(b.peg)+1)
		for i, e := range b.peg {
			out = append(out, cursorKid{e, step(itoa(i))})
		}
		if nil != b.spread {
			out = append(out, cursorKid{b.spread, step("&")})
		}
		return out
	case *ConjunctVal:
		return same(b.peg)
	case *DisjunctVal:
		return same(b.peg)
	case *FuncVal:
		return same(b.peg)
	case *PlusOpVal:
		return same(b.peg)
	case *PrefVal:
		return same([]Val{b.peg})
	}
	return nil
}

func valueHit(src string, v Val, at int, path []string) (cursorHit, bool) {
	text := v.srctext()
	switch b := v.(type) {
	case *ConjunctVal, *DisjunctVal, *NilVal:
		return cursorHit{}, false
	case *MapVal, *ListVal:
		if "{" != text && "[" != text {
			return cursorHit{}, false
		}
	case *RefVal:
		if _, alias := b.aliasName(); alias {
			return cursorHit{}, false
		}
		// A reference whose spelling is not at its site was sited
		// elsewhere by the parser, so the cursor can't be said to be on it.
		spelt := b.spelling()
		if !strings.HasPrefix(src[at:], spelt) {
			return cursorHit{}, false
		}
		return cursorHit{on: "ref", path: path, start: at, end: at + len(spelt),
			reads: b.plainRefPath()}, true
	}
	if "" == text {
		return cursorHit{}, false
	}
	return cursorHit{on: "value", path: path, start: at, end: at + len(text)}, true
}

func cursorHits(src string, root Val) (keys, values []cursorHit) {
	seen := map[Val]bool{}
	stack := []cursorKid{{root, []string{}}}
	for 0 < len(stack) {
		k := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if nil == k.v || seen[k.v] {
			continue
		}
		seen[k.v] = true
		at := -1
		if "" == k.v.srcurl() {
			at = k.v.pos()
		}
		if 0 <= at && at <= len(src) {
			if 0 < len(k.path) {
				if s, e, ok := keySpan(src, at, k.path[len(k.path)-1]); ok {
					keys = append(keys, cursorHit{on: "key", path: k.path, start: s, end: e})
				}
			}
			if h, ok := valueHit(src, k.v, at, k.path); ok {
				values = append(values, h)
			}
		}
		next := cursorKids(k.v, k.path)
		for i := len(next) - 1; 0 <= i; i-- {
			stack = append(stack, next[i])
		}
	}
	return keys, values
}

// PathAt is the path under a cursor; nil where the document does not
// parse or the cursor is on no key, value or reference.
func (a *Aontu) PathAt(src string, pos CursorPosition) *CursorPath {
	root, err := a.parseEntry(src)
	if nil != err || nil == root {
		return nil
	}
	lines := newSrcLines(src)
	if 0 > pos.Line || len(lines.starts) <= pos.Line {
		return nil
	}
	cur := lines.offsetAt(pos)
	within := func(h cursorHit) bool { return h.start <= cur && cur < h.end }
	keys, values := cursorHits(src, root)
	var best *cursorHit
	for i := range keys {
		if within(keys[i]) {
			best = &keys[i]
			break
		}
	}
	for i := range values {
		h := &values[i]
		if (nil == best || "key" != best.on) && within(*h) && (nil == best ||
			h.end-h.start < best.end-best.start ||
			(h.end-h.start == best.end-best.start && len(h.path) > len(best.path))) {
			best = h
		}
	}
	if nil == best {
		return nil
	}
	return &CursorPath{
		On:    best.on,
		Path:  best.path,
		Range: CursorRange{Start: lines.positionOf(best.start), End: lines.positionOf(best.end)},
		Reads: best.reads,
	}
}

// SitesOf is every site that writes a path, as `model why` reads them;
// nil where the document does not evaluate or names no such path.
func (a *Aontu) SitesOf(src string, path []string) []PathSite {
	text := "$"
	for _, p := range path {
		text += "." + p
	}
	report := a.Why(src, text)
	if !report.OK || nil == report.Record {
		return nil
	}
	out := make([]PathSite, 0, len(report.Record.Conjuncts))
	for _, c := range report.Record.Conjuncts {
		out = append(out, PathSite{
			Canon: c.Canon,
			File:  c.Site.File,
			Range: CursorRange{
				Start: CursorPosition{Line: c.Site.Row - 1, Character: c.Site.Col - 1},
				End:   CursorPosition{Line: c.Site.Row - 1, Character: c.Site.Col - 1 + c.Site.Len},
			},
			Role: c.Role,
		})
	}
	return out
}

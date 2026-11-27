/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"slices"
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

// CursorValue is what stands at the path a key or a reference names.
type CursorValue struct {
	Path         []string    `json:"path"`
	Range        CursorRange `json:"range"`
	Canon        string      `json:"canon"`
	Kind         string      `json:"kind"`
	Titles       []string    `json:"titles"`
	Descriptions []string    `json:"descriptions"`
}

type PathPlace struct {
	File  string      `json:"file"`
	Range CursorRange `json:"range"`
}

type Member struct {
	Key      string `json:"key"`
	Canon    string `json:"canon"`
	Optional bool   `json:"optional"`
}

// CursorMembers is what may be written at a cursor: the keys a map there
// may take, or the members of the path a reference there has reached.
type CursorMembers struct {
	On      string   `json:"on"`
	Path    []string `json:"path"`
	Members []Member `json:"members"`
}

type openBracket struct {
	c  byte
	at int
}

// What a relative reference may follow, and what a key may not.
const refAfter = " \t\r\n:{[(,&|+*"

const valueAfter = ":([&|=.$@%"

var closers = map[byte]string{'{': "}", '[': "]", '(': ")"}

func wordByte(c byte) bool {
	return 'a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || '0' <= c && c <= '9' ||
		'_' == c || '-' == c || 0x80 <= c
}

type cursorHit struct {
	on         string
	path       []string
	start, end int
	reads      []string
}

const keyDelims = " \t\r\n{}[](),:;\"'"

const tokenEnd = keyDelims + "&|"

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

// advance moves a byte offset on by n code units, as LSP counts them.
func (l srcLines) advance(off, units int) int {
	for 0 < units && off < len(l.src) {
		r, size := utf8.DecodeRuneInString(l.src[off:])
		off += size
		units -= len(utf16.Encode([]rune{r}))
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

// quoteEnd is where quoted text that opens at k closes, or the end.
func quoteEnd(src string, k int) int {
	e := k + 1
	for e < len(src) && src[k] != src[e] {
		if '\\' == src[e] {
			e++
		}
		e++
	}
	return e
}

// commentStart is where a `#` comment starts between from and to, or -1.
func commentStart(src string, from, to int) int {
	for k := from; k < to; k++ {
		if strings.IndexByte("\"'`", src[k]) >= 0 {
			k = quoteEnd(src, k)
		} else if '#' == src[k] {
			return k
		}
	}
	return -1
}

// skipTrivia steps back from i, the place before a value, over blanks and
// comments. A comment ends its line, so the value's own line holds none
// before it, and only a line above it is read for one.
func skipTrivia(src string, i int) int {
	for crossed := false; ; crossed = false {
		for 0 <= i && strings.IndexByte(" \t\r\n", src[i]) >= 0 {
			crossed = crossed || '\n' == src[i]
			i--
		}
		if !crossed || 0 > i {
			return i
		}
		c := commentStart(src, strings.LastIndexByte(src[:i+1], '\n')+1, i+1)
		if 0 > c {
			return i
		}
		i = c - 1
	}
}

// keySpan is the key written just before a value, where it is the
// path's last segment: `seg:`, `seg?:` or `"seg":` with blanks or
// comments between.
func keySpan(src string, at int, seg string) (int, int, bool) {
	i := skipTrivia(src, at-1)
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
			if !slices.Contains(b.aliasKeys, k) {
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

// refSpan reads a reference as written at a site, to its end, with a
// quoted segment read as its text: `$."a b"` spells `$.a b`.
func refSpan(src string, at int) (int, string) {
	p := at
	out := ""
	if p < len(src) && '$' == src[p] {
		out = "$"
		p++
	}
	for p < len(src) && '.' == src[p] {
		p++
		s := p
		if p < len(src) && ('"' == src[p] || '\'' == src[p]) {
			p = quoteEnd(src, p) + 1
			out += "." + src[s+1:min(p-1, len(src))]
			continue
		}
		for p < len(src) && '.' != src[p] && strings.IndexByte(tokenEnd, src[p]) < 0 {
			p++
		}
		out += "." + src[s:p]
	}
	return p, out
}

// valueEnd is where the value sited at `at` ends: a sign runs to its
// number's end, and an open paren to the one that closes it.
func valueEnd(src string, at int, text string) int {
	p := at + 1
	switch text {
	case "-", "+":
		for p < len(src) && strings.IndexByte(tokenEnd, src[p]) < 0 {
			p++
		}
		return p
	case "(":
		for depth := 1; p < len(src) && 0 < depth; p++ {
			if strings.IndexByte("\"'`", src[p]) >= 0 {
				p = quoteEnd(src, p)
			} else if '(' == src[p] {
				depth++
			} else if ')' == src[p] {
				depth--
			}
		}
		return p
	}
	return at + len(text)
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
		end, spelt := refSpan(src, at)
		if spelt != b.spelling() {
			return cursorHit{}, false
		}
		return cursorHit{on: "ref", path: path, start: at, end: end,
			reads: b.plainRefPath()}, true
	}
	if "" == text {
		return cursorHit{}, false
	}
	return cursorHit{on: "value", path: path, start: at, end: valueEnd(src, at, text)}, true
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
		// A value another file wrote has its key where this document
		// loaded it.
		from := at
		if sp, url, ok := k.v.load(); 0 > at && ok && "" == url {
			from = sp
		}
		if 0 <= from && from <= len(src) && 0 < len(k.path) {
			if s, e, ok := keySpan(src, from, k.path[len(k.path)-1]); ok {
				keys = append(keys, cursorHit{on: "key", path: k.path, start: s, end: e})
			}
		}
		if 0 <= at && at <= len(src) {
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
	return cursorAt(src, pos, root)
}

func cursorAt(src string, pos CursorPosition, root Val) *CursorPath {
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

// namedPath is the path a cursor names: a key its own, a reference the
// one it reads, and a plain value none.
func namedPath(at *CursorPath) []string {
	if nil == at {
		return nil
	}
	if "key" == at.On {
		return at.Path
	}
	return at.Reads
}

// DescribeAt is what stands, once the document has unified, at the path
// a key or a reference under the cursor names; nil where it names none,
// or names a path that holds nothing.
func (a *Aontu) DescribeAt(src string, pos CursorPosition) *CursorValue {
	root, err := a.parseEntry(src)
	if nil != err || nil == root {
		return nil
	}
	at := cursorAt(src, pos, root)
	path := namedPath(at)
	if nil == path {
		return nil
	}
	res, _, _ := a.unifyCtx(root, nil, src)
	node := anchorParts(res, path)
	if nil == node {
		return nil
	}
	return &CursorValue{Path: path, Range: at.Range, Canon: node.Canon(),
		Kind: valKind(node), Titles: metaTexts(node, "title"),
		Descriptions: metaTexts(node, "description")}
}

// DefinitionAt is where the path a key or a reference under the cursor
// names is written: its sites, as places to go to.
func (a *Aontu) DefinitionAt(src string, pos CursorPosition) []PathPlace {
	path := namedPath(a.PathAt(src, pos))
	if nil == path {
		return nil
	}
	var out []PathPlace
	for _, s := range a.SitesOf(src, path) {
		out = append(out, PathPlace{File: s.File, Range: s.Range})
	}
	return out
}

// openBrackets is the brackets open before off, the innermost last, and
// where the run of names, dots and quoted text that ends at off starts;
// false where off is inside quoted text or a comment.
func openBrackets(src string, off int) ([]openBracket, int, bool) {
	open := []openBracket{}
	run := 0
	for k := 0; k < off; k++ {
		quoted := strings.IndexByte("\"'`", src[k]) >= 0
		if quoted {
			k = quoteEnd(src, k)
		} else if '#' == src[k] {
			if nl := strings.IndexByte(src[k:], '\n'); 0 <= nl {
				k += nl
			} else {
				k = -1
			}
		}
		if off <= k || 0 > k {
			return nil, 0, false
		} else if strings.IndexByte("{[(", src[k]) >= 0 {
			open = append(open, openBracket{src[k], k})
		} else if strings.IndexByte("}])", src[k]) >= 0 && 0 < len(open) {
			open = open[:len(open)-1]
		}
		if !quoted && '.' != src[k] && !wordByte(src[k]) {
			run = k + 1
		}
	}
	return open, run, true
}

func closersOf(open []openBracket) string {
	out := ""
	for i := len(open) - 1; 0 <= i; i-- {
		out += closers[open[i].c]
	}
	return out
}

type refText struct {
	start int
	abs   bool
}

// refAt is a reference written from s up to the dot before w: dots, then
// segments, each a name or quoted text and a dot. Where it starts.
func refAt(src string, s, w int) (refText, bool) {
	i := s
	for i < w && '.' == src[i] {
		i++
	}
	up := i - s
	for i < w {
		j := i
		if strings.IndexByte("\"'`", src[i]) >= 0 {
			j = quoteEnd(src, i) + 1
		} else {
			for j < w && wordByte(src[j]) {
				j++
			}
		}
		if i == j || w <= j || '.' != src[j] {
			return refText{}, false
		}
		i = j + 1
	}
	abs := 0 < s && '$' == src[s-1]
	before := byte(' ')
	if 0 < s {
		before = src[s-1]
	}
	if 0 == up || '.' != src[w-1] || (abs && 1 < up) || (!abs && strings.IndexByte(refAfter, before) < 0) {
		return refText{}, false
	}
	if abs {
		s--
	}
	return refText{start: s, abs: abs}, true
}

// findVal is the first value a walk from root meets that take accepts,
// with its path, a constraint's written arguments included. A value from
// an included file is sited in that file, so never here.
func findVal(root Val, take func(Val) bool) (Val, []string, bool) {
	seen := map[Val]bool{}
	stack := []cursorKid{{root, []string{}}}
	for 0 < len(stack) {
		k := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if nil == k.v || seen[k.v] {
			continue
		}
		seen[k.v] = true
		if "" == k.v.srcurl() && take(k.v) {
			return k.v, k.path, true
		}
		stack = append(stack, cursorKids(k.v, k.path)...)
		if c, ok := k.v.(*ConstraintVal); ok {
			for _, arg := range c.asWritten {
				stack = append(stack, cursorKid{arg, k.path})
			}
		}
	}
	return nil, nil, false
}

// groupStarts is where a value written at off is sited: there, or, where
// it is all a group holds, at the group's first `(`.
func groupStarts(src string, off int) []int {
	offs := []int{off}
	for p := skipTrivia(src, off-1); 0 <= p && '(' == src[p]; p = skipTrivia(src, p-1) {
		offs = append(offs, p)
	}
	return offs
}

// mapAt is the map literal whose brace is at off, with its path.
func mapAt(src string, root Val, off int) (*MapVal, []string, bool) {
	offs := groupStarts(src, off)
	v, path, ok := findVal(root, func(v Val) bool {
		_, isMap := v.(*MapVal)
		return isMap && slices.Contains(offs, v.pos())
	})
	m, _ := v.(*MapVal)
	return m, path, ok
}

// refReads is the path that the reference at start reads, as the engine
// reads it, in a text that ends the reference with one more name: from
// where the reference stands, less that name.
func (a *Aontu) refReads(text string, start int) ([]string, bool) {
	root, err := a.parseEntry(text)
	if nil != err {
		root = nil
	}
	offs := groupStarts(text, start)
	v, _, _ := findVal(root, func(v Val) bool {
		_, isRef := v.(*RefVal)
		return isRef && slices.Contains(offs, v.pos())
	})
	var p []string
	if ref, isRef := v.(*RefVal); isRef {
		p = ref.plainRefPath()
	}
	if 0 == len(p) {
		return nil, false
	}
	return p[:len(p)-1], true
}

func membersOf(node Val, written []string) []Member {
	out := []Member{}
	switch n := node.(type) {
	case *MapVal:
		keys := append([]string{}, n.keys...)
		sort.Strings(keys)
		for _, k := range keys {
			if !slices.Contains(n.aliasKeys, k) && !slices.Contains(written, k) {
				out = append(out, Member{Key: k, Canon: n.peg[k].Canon(), Optional: n.isOptional(k)})
			}
		}
	case *ListVal:
		for i, e := range n.peg {
			out = append(out, Member{Key: itoa(i), Canon: e.Canon()})
		}
	}
	return out
}

// MembersAt is what may be written at a cursor, read from the document
// with the word being typed taken out and every bracket left open closed:
// at a key, the keys the map there takes once unified and has not
// written; after a dot in a reference, the members of the path it has
// reached.
func (a *Aontu) MembersAt(src string, pos CursorPosition) *CursorMembers {
	lines := newSrcLines(src)
	if 0 > pos.Line || len(lines.starts) <= pos.Line {
		return nil
	}
	cur := lines.offsetAt(pos)
	w := cur
	for 0 < w && wordByte(src[w-1]) {
		w--
	}
	open, run, ok := openBrackets(src, w)
	if !ok {
		return nil
	}
	ref, isRef := refAt(src, run, w)
	// The reference being written stands as `any`, so that it reads nothing.
	text := src[:w] + src[cur:]
	if isRef {
		text = src[:ref.start] + "any" + src[cur:]
	}
	tail, _, _ := openBrackets(text, len(text))
	text += closersOf(tail)
	root, err := a.parseEntry(text)
	if nil != err || nil == root {
		return nil
	}
	reads, readsOK := []string(nil), false
	if isRef {
		reads, readsOK = a.refReads(src[:w]+"x"+closersOf(open), ref.start)
	}
	brace := -1
	for i, o := range open {
		if '{' == o.c {
			brace = i
		}
	}
	var lit Val = root
	path, found := []string{}, true
	if 0 <= brace {
		lit, path, found = mapAt(text, root, open[brace].at)
	}
	prev := skipTrivia(src, w-1)
	litMap, isMap := lit.(*MapVal)
	atKey := found && isMap && brace == len(open)-1 &&
		(0 > prev || strings.IndexByte(valueAfter, src[prev]) < 0)
	if !readsOK && !atKey {
		return nil
	}
	on, at, written := "path", reads, []string{}
	if !readsOK {
		on, at, written = "key", path, append(written, litMap.keys...)
	}
	res, _, _ := a.unifyCtx(root, nil, text)
	return &CursorMembers{On: on, Path: at, Members: membersOf(throughResidue(anchorParts(res, at)), written)}
}

// SitesOf is every site that writes a path, as `model why` reads them;
// nil where the document does not evaluate or names no such path.
func (a *Aontu) SitesOf(src string, path []string) []PathSite {
	report := a.whyParts(src, path)
	if !report.OK || nil == report.Record {
		return nil
	}
	lines := newSrcLines(src)
	out := make([]PathSite, 0, len(report.Record.Conjuncts))
	for _, c := range report.Record.Conjuncts {
		start := CursorPosition{Line: c.Site.Row - 1, Character: c.Site.Col - 1}
		end := CursorPosition{Line: start.Line, Character: start.Character + c.Site.Len}
		if "" == c.Site.File && c.Site.Row <= len(lines.starts) {
			end = lines.positionOf(lines.advance(lines.offsetAt(start), c.Site.Len))
		}
		out = append(out, PathSite{Canon: c.Canon, File: c.Site.File,
			Range: CursorRange{Start: start, End: end}, Role: c.Role})
	}
	return out
}

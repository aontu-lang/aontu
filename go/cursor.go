/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"path/filepath"
	"regexp"
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
	units  []int
}

// newSrcLines also counts the code units before each byte, so a
// position costs no scan of its line.
func newSrcLines(src string) srcLines {
	starts := []int{0}
	units := make([]int, len(src)+1)
	n := 0
	for i := 0; i < len(src); {
		if '\n' == src[i] {
			starts = append(starts, i+1)
		}
		r, size := utf8.DecodeRuneInString(src[i:])
		n += len(utf16.Encode([]rune{r}))
		for k := 1; k <= size; k++ {
			units[i+k] = n
		}
		i += size
	}
	return srcLines{src: src, starts: starts, units: units}
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
	line := sort.Search(len(l.starts), func(i int) bool { return off < l.starts[i] }) - 1
	return CursorPosition{Line: line, Character: l.units[off] - l.units[l.starts[line]]}
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

// refText is a reference as written at a site, read to its end, with a
// quoted segment read as its text: `$."a b"` spells `$.a b`. Each
// segment's span is kept, an empty one standing for a step up.
type refText struct {
	end   int
	spelt string
	segs  [][2]int
}

func readRef(src string, at int) refText {
	p := at
	out := ""
	if p < len(src) && '$' == src[p] {
		out = "$"
		p++
	}
	segs := [][2]int{}
	for p < len(src) && '.' == src[p] {
		p++
		s := p
		if p < len(src) && ('"' == src[p] || '\'' == src[p]) {
			p = quoteEnd(src, p) + 1
			out += "." + src[s+1:min(p-1, len(src))]
		} else {
			for p < len(src) && '.' != src[p] && strings.IndexByte(tokenEnd, src[p]) < 0 {
				p++
			}
			out += "." + src[s:p]
		}
		segs = append(segs, [2]int{s, p})
	}
	return refText{end: p, spelt: out, segs: segs}
}

func refSpan(src string, at int) (int, string) {
	r := readRef(src, at)
	return r.end, r.spelt
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

type refStart struct {
	start int
	abs   bool
}

// refAt is a reference written from s up to the dot before w: dots, then
// segments, each a name or quoted text and a dot. Where it starts.
func refAt(src string, s, w int) (refStart, bool) {
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
			return refStart{}, false
		}
		i = j + 1
	}
	abs := 0 < s && '$' == src[s-1]
	before := byte(' ')
	if 0 < s {
		before = src[s-1]
	}
	if 0 == up || '.' != src[w-1] || (abs && 1 < up) || (!abs && strings.IndexByte(refAfter, before) < 0) {
		return refStart{}, false
	}
	if abs {
		s--
	}
	return refStart{start: s, abs: abs}, true
}

// cursorWalk visits every value a walk from root meets, with its path, a
// constraint's written arguments included, until visit answers true.
func cursorWalk(root Val, visit func(Val, []string) bool) {
	seen := map[Val]bool{}
	stack := []cursorKid{{root, []string{}}}
	for 0 < len(stack) {
		k := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if nil == k.v || seen[k.v] {
			continue
		}
		seen[k.v] = true
		if visit(k.v, k.path) {
			return
		}
		stack = append(stack, cursorKids(k.v, k.path)...)
		if c, ok := k.v.(*ConstraintVal); ok {
			for _, arg := range c.asWritten {
				stack = append(stack, cursorKid{arg, k.path})
			}
		}
	}
}

// findVal is the first value a walk from root meets that take accepts,
// with its path. A value from an included file is sited in that file, so
// never here.
func findVal(root Val, take func(Val) bool) (Val, []string, bool) {
	var found Val
	var at []string
	cursorWalk(root, func(v Val, path []string) bool {
		if "" == v.srcurl() && take(v) {
			found, at = v, path
		}
		return nil != found
	})
	return found, at, nil != found
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

// balancedEnd is where the bracket at k closes, or, from k up to end,
// where the last bracket open by end closes: past quoted text and comments.
func balancedEnd(src string, k, end int) int {
	for depth := 0; k < len(src) && (k < end || 0 < depth); k++ {
		c := src[k]
		if strings.IndexByte("\"'`", c) >= 0 {
			k = quoteEnd(src, k)
		} else if '#' == c {
			k = max(k, k+strings.IndexByte(src[k:], '\n')-1)
		} else {
			depth += strings.Count("{[(", string(c)) - strings.Count("}])", string(c))
		}
	}
	return max(end, min(k, len(src)))
}

// extentEnd is where the text of a value written at `at` ends, or the
// include that loaded it at `from`.
func extentEnd(src string, v Val, at, from int) int {
	if 0 > at {
		p := from + 1
		for p < len(src) && strings.IndexByte(" \t\r\n", src[p]) >= 0 {
			p++
		}
		return min(quoteEnd(src, p)+1, len(src))
	}
	text := v.srctext()
	if _, isRef := v.(*RefVal); 1 == len(text) && strings.Contains("{[(", text) {
		return balancedEnd(src, at, at+1)
	} else if isRef {
		end, _ := refSpan(src, at)
		return end
	}
	return valueEnd(src, at, text)
}

var symbolKinds = map[string]int{
	"map": 19, "list": 18, "string": 15, "integer": 16, "float": 16, "biginteger": 16,
	"bigdecimal": 16, "boolean": 17, "null": 21,
}

// DocSymbol is one entry of a document's outline, as LSP's DocumentSymbol
// has it.
type DocSymbol struct {
	Name           string      `json:"name"`
	Kind           int         `json:"kind"`
	Range          CursorRange `json:"range"`
	SelectionRange CursorRange `json:"selectionRange"`
	Children       []DocSymbol `json:"children"`
}

type docSym struct {
	name             string
	kind             int
	start, end       int
	keyStart, keyEnd int
	children         []*docSym
}

type symStep struct {
	v    Val
	path []string
	into *[]*docSym
	own  *docSym
	elem bool
}

func sortSyms(syms []*docSym) {
	sort.Slice(syms, func(i, j int) bool { return syms[i].start < syms[j].start })
}

// docSymbol is a symbol's entry, which runs over its children's, and on
// to the bracket that closes the last one open in it.
func docSymbol(lines srcLines, s *docSym) (DocSymbol, int) {
	sortSyms(s.children)
	children := []DocSymbol{}
	end := s.end
	for _, c := range s.children {
		d, e := docSymbol(lines, c)
		children = append(children, d)
		end = max(end, e)
	}
	end = balancedEnd(lines.src, s.start, end)
	return DocSymbol{Name: s.name, Kind: s.kind,
		Range: CursorRange{Start: lines.positionOf(s.start), End: lines.positionOf(end)},
		SelectionRange: CursorRange{Start: lines.positionOf(s.keyStart),
			End: lines.positionOf(s.keyEnd)},
		Children: children}, end
}

// SymbolsOf is the outline of what a document writes: each key where it
// is written, a key chain's keys nested, and a list's elements by
// position; nil where the document does not parse.
func (a *Aontu) SymbolsOf(src string) []DocSymbol {
	root, err := a.parseEntry(src)
	if nil != err || nil == root {
		return nil
	}
	return symbolTree(src, root)
}

func symbolTree(src string, root Val) []DocSymbol {
	lines := newSrcLines(src)
	top := []*docSym{}
	made := map[int]*docSym{}
	seen := map[Val]bool{}
	stack := []symStep{{v: root, path: []string{}, into: &top}}
	for 0 < len(stack) {
		st := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		v, path := st.v, st.path
		if nil == v || seen[v] {
			continue
		}
		seen[v] = true
		at := -1
		if "" == v.srcurl() && v.pos() <= len(src) {
			at = v.pos()
		}
		from := at
		if sp, url, ok := v.load(); 0 > at && ok && "" == url {
			from = sp
		}
		s, e, found := 0, 0, false
		if 0 <= from && 0 < len(path) {
			if st.elem {
				s, e, found = from, extentEnd(src, v, at, from), true
			} else {
				s, e, found = keySpan(src, from, path[len(path)-1])
			}
		}
		sym := st.own
		if found {
			sym = made[s]
			if nil == sym {
				kind, ok := symbolKinds[valKind(v)]
				if !ok {
					kind = 13
				}
				sym = &docSym{name: path[len(path)-1], kind: kind, start: s, end: e,
					keyStart: s, keyEnd: e}
				made[s] = sym
				*st.into = append(*st.into, sym)
			}
		} else if nil == st.own && 0 <= from && 0 < len(path) {
			// A value written here whose key is not found has no place.
			continue
		}
		if nil != sym && 0 <= from {
			sym.end = max(sym.end, extentEnd(src, v, at, from))
		}
		next := cursorKids(v, path)
		if c, ok := v.(*ConstraintVal); ok {
			for _, arg := range c.asWritten {
				next = append(next, cursorKid{arg, path})
			}
		}
		_, isList := v.(*ListVal)
		for i := len(next) - 1; 0 <= i; i-- {
			k := next[i]
			if len(k.path) == len(path) {
				stack = append(stack, symStep{v: k.v, path: path, into: st.into, own: sym})
			} else if nil != sym || 0 == len(path) {
				into := &top
				if nil != sym {
					into = &sym.children
				}
				stack = append(stack, symStep{v: k.v, path: k.path, into: into,
					elem: isList && "&" != k.path[len(k.path)-1]})
			}
		}
	}
	sortSyms(top)
	out := []DocSymbol{}
	for _, t := range top {
		d, _ := docSymbol(lines, t)
		out = append(out, d)
	}
	return out
}

// CursorRefs is where the path a cursor names is written, and where it
// is read.
type CursorRefs struct {
	Path   []string    `json:"path"`
	Writes []PathPlace `json:"writes"`
	Reads  []PathPlace `json:"reads"`
}

// readsOf is where a reference that reads path is written: in the
// document, its span, and in an included file, its site and the length
// of its spelling.
func readsOf(src string, root Val, path []string, texts map[string]string) []PathPlace {
	lines := newSrcLines(src)
	out := []PathPlace{}
	cursorWalk(root, func(v Val, _ []string) bool {
		ref, isRef := v.(*RefVal)
		if !isRef || !slices.Equal(ref.plainRefPath(), path) {
			return false
		}
		if file := v.srcurl(); "" != file {
			if text, ok := texts[file]; ok && 0 <= v.pos() {
				row, col := rowCol(text, v.pos())
				start := CursorPosition{Line: row - 1, Character: col - 1}
				end := CursorPosition{Line: start.Line, Character: start.Character + utf16Len(ref.spelling())}
				out = append(out, PathPlace{File: file, Range: CursorRange{Start: start, End: end}})
			}
			return false
		}
		// A reference that is all a group holds is sited at the group.
		at := v.pos()
		p := at
		for 0 <= p && p < len(src) && strings.IndexByte("( \t\r\n", src[p]) >= 0 {
			p++
		}
		if 0 <= at && at <= len(src) {
			if end, spelt := refSpan(src, p); spelt == ref.spelling() {
				out = append(out, PathPlace{Range: CursorRange{Start: lines.positionOf(p),
					End: lines.positionOf(end)}})
			}
		}
		return false
	})
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.File != b.File {
			return a.File < b.File
		}
		if a.Range.Start.Line != b.Range.Start.Line {
			return a.Range.Start.Line < b.Range.Start.Line
		}
		return a.Range.Start.Character < b.Range.Start.Character
	})
	return out
}

// ReferencesAt is where the path a key or a reference under the cursor
// names is written, its sites as `model why` reads them, and where a
// reference reads it; nil where the cursor names no path.
func (a *Aontu) ReferencesAt(src string, pos CursorPosition) *CursorRefs {
	root, err := a.parseEntry(src)
	if nil != err || nil == root {
		return nil
	}
	path := namedPath(cursorAt(src, pos, root))
	if nil == path {
		return nil
	}
	reads := readsOf(src, root, path, a.IncludeText)
	writes := []PathPlace{}
	for _, s := range a.SitesOf(src, path) {
		writes = append(writes, PathPlace{File: s.File, Range: s.Range})
	}
	return &CursorRefs{Path: path, Writes: writes, Reads: reads}
}

// FileEdit is one edit of a rename, in the document where File is empty
// and in an included file where it names one.
type FileEdit struct {
	File    string      `json:"file"`
	Range   CursorRange `json:"range"`
	NewText string      `json:"newText"`
}

// CursorRename is a rename at a cursor: the path it renames, the key or
// the segment the cursor is on, and the edits; or why no edit of text
// keeps the document true.
type CursorRename struct {
	Path        []string     `json:"path,omitempty"`
	Range       *CursorRange `json:"range,omitempty"`
	Placeholder *string      `json:"placeholder,omitempty"`
	Edits       []FileEdit   `json:"edits,omitempty"`
	Refused     string       `json:"refused,omitempty"`
}

type RenameOptions struct {
	Root    string
	Prepare bool
}

type renameEntry struct {
	v     Val
	path  []string
	calls []*renameEntry
	arg   bool
	step  bool
	kid   int
}

type place struct {
	file string
	off  int
}

type keyAt struct {
	place
	path []string
	end  int
	kid  int
}

type refAtPlace struct {
	place
	e     *renameEntry
	reads []string
	ref   *refText
}

type candidate struct {
	place
	why string
}

var generators = []string{"pack", "each", "apply", "emit", "match"}

var bareKey = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

var valueSegments = []string{"_", "false", "nil", "null", "true"}

const maxAliases = 64

// renameEntries is every value of the parse, an included file's too,
// with its path, the calls it stands in, and whether a map's key was the
// step to it.
func renameEntries(root Val) []*renameEntry {
	out := []*renameEntry{}
	seen := map[Val]bool{}
	stack := []*renameEntry{{v: root, path: []string{}, kid: -1}}
	for 0 < len(stack) {
		e := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if nil == e.v || seen[e.v] {
			continue
		}
		seen[e.v] = true
		if e.step {
			e.kid = len(out)
		}
		out = append(out, e)
		calls := e.calls
		if _, isFunc := e.v.(*FuncVal); isFunc {
			calls = append(append([]*renameEntry{}, e.calls...), e)
		}
		_, isList := e.v.(*ListVal)
		for _, k := range cursorKids(e.v, e.path) {
			step := len(k.path) > len(e.path)
			kid := e.kid
			if step {
				kid = -1
			}
			stack = append(stack, &renameEntry{v: k.v, path: k.path, calls: calls, arg: e.arg,
				step: step && !isList && "&" != k.path[len(k.path)-1], kid: kid})
		}
		if c, ok := e.v.(*ConstraintVal); ok {
			for _, arg := range c.asWritten {
				stack = append(stack, &renameEntry{v: arg, path: e.path, calls: calls, arg: true, kid: e.kid})
			}
		}
	}
	return out
}

// alike is whether a and b are one path, where `&` stands for any key.
func alike(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] && "&" != a[i] && "&" != b[i] {
			return false
		}
	}
	return true
}

func prefixOf(a, b []string) bool {
	return len(a) < len(b) && alike(a, b[:len(a)])
}

func hasPrefix(p, prefix []string) bool {
	return len(p) >= len(prefix) && slices.Equal(p[:len(prefix)], prefix)
}

func callName(e *renameEntry) string {
	return e.v.(*FuncVal).callName()
}

// isPattern is whether a call holds a spread's keys to a pattern.
func isPattern(e *renameEntry) bool {
	name := callName(e)
	return "keyed" == name || ("match" == name && 0 < len(e.path) && "&" == e.path[len(e.path)-1])
}

// writtenName is a name written as a key, or as a reference's segment,
// in the quotes it had where it had them.
func writtenName(name, quote string, segment bool) string {
	if "'" == quote && !strings.Contains(name, "'") {
		return "'" + name + "'"
	}
	if "" == quote && bareKey.MatchString(name) && !(segment && slices.Contains(valueSegments, name)) {
		return name
	}
	return `"` + name + `"`
}

func quoteAt(text string, off int) string {
	if off < len(text) && ('"' == text[off] || '\'' == text[off]) {
		return text[off : off+1]
	}
	return ""
}

func needsEscape(name string) bool {
	for _, r := range name {
		if '"' == r || '\\' == r || r < 0x20 || 0x7f == r {
			return true
		}
	}
	return false
}

// FileRefusal is why a file a rename would edit cannot be edited, or "".
func FileRefusal(file, root string, readable bool) string {
	if strings.HasPrefix(file, aontuScheme) {
		return file + " is a bundled model"
	}
	abs, _ := filepath.Abs(file)
	if slices.Contains(strings.FieldsFunc(abs, func(r rune) bool { return '/' == r || '\\' == r }),
		"aontu_meta") {
		return file + " is in a package"
	}
	rel := ".."
	if "" != root {
		absRoot, _ := filepath.Abs(root)
		if r, err := filepath.Rel(absRoot, abs); nil == err {
			rel = r
		}
	}
	if ".." == strings.Split(filepath.ToSlash(rel), "/")[0] {
		return file + " is outside the workspace root"
	}
	if !readable {
		return "the text of " + file + " cannot be read"
	}
	return ""
}

// firstWhy is the reason of the first candidate in order of file and
// place.
func firstWhy(cs []candidate) string {
	if 0 == len(cs) {
		return ""
	}
	slices.SortStableFunc(cs, func(a, b candidate) int {
		if a.file != b.file {
			return strings.Compare(a.file, b.file)
		}
		return a.off - b.off
	})
	return cs[0].why
}

// renameTexts reads the text of each file a rename meets, as the parse
// read it.
type renameTexts struct {
	src   string
	inc   map[string]string
	lines map[string]srcLines
}

func (t *renameTexts) text(file string) (string, bool) {
	if "" == file {
		return t.src, true
	}
	if strings.HasPrefix(file, aontuScheme) {
		return "", false
	}
	text, ok := t.inc[file]
	return text, ok
}

func (t *renameTexts) linesOf(file string) srcLines {
	if l, ok := t.lines[file]; ok {
		return l
	}
	text, _ := t.text(file)
	l := newSrcLines(text)
	t.lines[file] = l
	return l
}

func (t *renameTexts) placeOf(file string, sp int) place {
	text, ok := t.text(file)
	if !ok || 0 > sp || len(text) < sp {
		return place{file, -1}
	}
	return place{file, sp}
}

func (t *renameTexts) where(p place) string {
	if 0 > p.off {
		return p.file
	}
	lc := t.linesOf(p.file).positionOf(p.off)
	at := itoa(lc.Line+1) + ":" + itoa(lc.Character+1)
	if "" == p.file {
		return at
	}
	return p.file + ":" + at
}

func entryPlace(t *renameTexts, e *renameEntry) place {
	return t.placeOf(e.v.srcurl(), e.v.pos())
}

// RenameAt is what a rename at a cursor edits: the key at every site
// that writes the path, and the segment that names it in every
// reference that reads it; or the site no edit of text can keep true.
// Under Prepare no name is given and no edit is made.
func (a *Aontu) RenameAt(src string, pos CursorPosition, name string, opts RenameOptions) *CursorRename {
	root, err := a.parseEntry(src)
	if nil != err || nil == root {
		return nil
	}
	at := cursorAt(src, pos, root)
	if nil == at || "value" == at.On {
		return nil
	}
	t := &renameTexts{src: src, inc: a.IncludeText, lines: map[string]srcLines{}}

	entries := renameEntries(root)
	keys := []keyAt{}
	refs := []refAtPlace{}
	keyFile := map[*renameEntry]place{}
	for _, e := range entries {
		v := e.v
		url := v.srcurl()
		from := t.placeOf(url, v.pos())
		if sp, lurl, ok := v.load(); "" != url && ok {
			from = t.placeOf(lurl, sp)
		}
		keyFile[e] = from
		if ktext, ok := t.text(from.file); ok && 0 <= from.off && 0 < len(e.path) {
			if s, end, found := keySpan(ktext, from.off, e.path[len(e.path)-1]); found {
				keys = append(keys, keyAt{place: place{from.file, s}, path: e.path, end: end, kid: e.kid})
			}
		}
		ref, isRef := v.(*RefVal)
		if !isRef {
			continue
		}
		reads := ref.plainRefPath()
		if _, alias := ref.aliasName(); alias || nil == reads {
			continue
		}
		p := t.placeOf(url, v.pos())
		rtext, _ := t.text(url)
		q := p.off
		for 0 <= q && q < len(rtext) && strings.IndexByte("( \t\r\n", rtext[q]) >= 0 {
			q++
		}
		r := refAtPlace{place: place{url, q}, e: e, reads: reads}
		if 0 <= q {
			if rt := readRef(rtext, q); rt.spelt == ref.spelling() {
				r.ref = &rt
			}
		}
		refs = append(refs, r)
	}

	lines := newSrcLines(src)
	P := at.Path
	if "key" != at.On {
		P = at.Reads
	}
	rng := at.Range
	if "ref" == at.On {
		start := lines.offsetAt(at.Range.Start)
		segs := realSegs(readRef(src, start).segs)
		cur := lines.offsetAt(pos)
		j := slices.IndexFunc(segs, func(s [2]int) bool { return cur < s[1] })
		keep := len(P) - len(segs) + j + 1
		if ('$' == src[start] && cur == start) || 0 > j || 1 > keep {
			return nil
		}
		P = P[:keep]
		rng = CursorRange{Start: lines.positionOf(segs[j][0]), End: lines.positionOf(segs[j][1])}
	}
	last := P[len(P)-1]
	named := "cannot rename " + strings.Join(P, ".")
	refuse := func(why string) *CursorRename { return &CursorRename{Refused: named + ": " + why} }

	if !opts.Prepare {
		if "" == name {
			return refuse("the new name is empty")
		}
		if needsEscape(name) {
			return &CursorRename{Refused: named + " to " + name + ": the name needs an escape"}
		}
	}
	if slices.Contains(P, "&") {
		return refuse("a spread's template writes the key at " +
			t.where(place{"", lines.offsetAt(rng.Start)}))
	}
	written := []keyAt{}
	for _, k := range keys {
		if slices.Equal(k.path, P) {
			written = append(written, k)
		}
	}
	reads := []refAtPlace{}
	for _, r := range refs {
		if hasPrefix(r.reads, P) {
			reads = append(reads, r)
		}
	}
	steps := []*renameEntry{}
	calls := []*renameEntry{}
	for _, e := range entries {
		if e.step && slices.Equal(e.path, P) {
			steps = append(steps, e)
		}
		if _, isFunc := e.v.(*FuncVal); isFunc {
			calls = append(calls, e)
		}
	}
	callsWhere := func(take func(*renameEntry) bool, why func(*renameEntry, string) string) string {
		cs := []candidate{}
		for _, e := range calls {
			if take(e) {
				p := entryPlace(t, e)
				cs = append(cs, candidate{p, why(e, t.where(p))})
			}
		}
		return firstWhy(cs)
	}
	parent := append(append([]string{}, P[:len(P)-1]...), "&")

	checks := []func() string{
		func() string {
			cs := []candidate{}
			for _, k := range written {
				if text, _ := t.text(k.file); '%' == text[k.off] {
					cs = append(cs, candidate{k.place, "the key at " + t.where(k.place) +
						" also declares the alias %" + last})
				}
			}
			return firstWhy(cs)
		},
		func() string {
			return callsWhere(func(e *renameEntry) bool {
				return slices.Contains(generators, callName(e)) && !isPattern(e) && prefixOf(e.path, P)
			}, func(e *renameEntry, at string) string {
				return "a generator, " + callName(e) + ", makes the key at " + at
			})
		},
		func() string {
			return callsWhere(func(e *renameEntry) bool {
				return isPattern(e) && alike(e.path, parent)
			}, func(_ *renameEntry, at string) string { return "a pattern matches the key at " + at })
		},
		func() string {
			return callsWhere(func(e *renameEntry) bool {
				return "key" == callName(e) && !slices.ContainsFunc(e.calls, isPattern) &&
					len(e.path) >= len(P) && alike(e.path[:len(P)], P)
			}, func(_ *renameEntry, at string) string { return "key() reads the key at " + at })
		},
		func() string {
			cs := []candidate{}
			for _, k := range keys {
				if !slices.Equal(k.path, P) && alike(k.path, P) && "&" != k.path[len(k.path)-1] {
					cs = append(cs, candidate{k.place, "a spread's template writes the key at " + t.where(k.place)})
				}
			}
			return firstWhy(cs)
		},
		func() string {
			files := []place{}
			for _, e := range steps {
				files = append(files, keyFile[e])
			}
			for _, r := range reads {
				files = append(files, r.place)
			}
			cs := []candidate{}
			for _, p := range files {
				if "" == p.file {
					continue
				}
				_, readable := t.text(p.file)
				if why := FileRefusal(p.file, opts.Root, readable); "" != why {
					cs = append(cs, candidate{place{p.file, 0}, why})
				}
			}
			return firstWhy(cs)
		},
		func() string {
			cs := []candidate{}
			for _, e := range steps {
				if !slices.ContainsFunc(keys, func(k keyAt) bool { return k.kid == e.kid }) {
					p := keyFile[e]
					cs = append(cs, candidate{p, "cannot locate the key written at " + t.where(p)})
				}
			}
			for _, r := range reads {
				if _, ok := segmentOf(t, r, P); !ok {
					cs = append(cs, candidate{r.place, "cannot locate the reference at " + t.where(r.place)})
				}
			}
			return firstWhy(cs)
		},
		func() string { return aliasRefusal(t, P, keys, refs) },
		func() string {
			if 0 == len(written) {
				return "no key is written for it"
			}
			return ""
		},
	}
	for _, check := range checks {
		if why := check(); "" != why {
			return refuse(why)
		}
	}
	if opts.Prepare {
		return &CursorRename{Path: P, Range: &rng, Placeholder: &last}
	}

	P2 := append(append([]string{}, P[:len(P)-1]...), name)
	if name != last {
		cs := []candidate{}
		for _, k := range keys {
			if slices.Equal(k.path, P2) {
				cs = append(cs, candidate{k.place, strings.Join(P2, ".") + " is already written at " + t.where(k.place)})
			}
		}
		clash := firstWhy(cs)
		for _, r := range refs {
			if hasPrefix(r.reads, P2) {
				cs = append(cs, candidate{r.place, strings.Join(P2, ".") + " is already read at " + t.where(r.place)})
			}
		}
		if "" == clash {
			clash = firstWhy(cs)
		}
		if "" == clash {
			if res, _, _ := a.unifyCtx(root, nil, src); nil != anchorParts(res, P2) {
				clash = strings.Join(P2, ".") + " already holds a value"
			}
		}
		if "" != clash {
			return &CursorRename{Refused: named + " to " + name + ": " + clash}
		}
	}

	type edit struct {
		place
		end     int
		newText string
	}
	edits := map[place]edit{}
	for _, k := range written {
		text, _ := t.text(k.file)
		edits[k.place] = edit{k.place, k.end, writtenName(name, quoteAt(text, k.off), false)}
	}
	for _, r := range reads {
		if seg, _ := segmentOf(t, r, P); nil != seg {
			text, _ := t.text(r.file)
			p := place{r.file, seg[0]}
			edits[p] = edit{p, seg[1], writtenName(name, quoteAt(text, seg[0]), true)}
		}
	}
	sorted := make([]edit, 0, len(edits))
	for _, e := range edits {
		sorted = append(sorted, e)
	}
	slices.SortFunc(sorted, func(a, b edit) int {
		if a.file != b.file {
			return strings.Compare(a.file, b.file)
		}
		return a.off - b.off
	})
	out := &CursorRename{Path: P, Range: &rng, Placeholder: &last, Edits: []FileEdit{}}
	for _, e := range sorted {
		l := t.linesOf(e.file)
		out.Edits = append(out.Edits, FileEdit{File: e.file, NewText: e.newText,
			Range: CursorRange{Start: l.positionOf(e.off), End: l.positionOf(e.end)}})
	}
	return out
}

func realSegs(segs [][2]int) [][2]int {
	out := [][2]int{}
	for _, s := range segs {
		if s[0] < s[1] {
			out = append(out, s)
		}
	}
	return out
}

// segmentOf is the span of the segment of a reference that names the
// last segment of path, nil where the reference does not spell it, and
// not ok where the reference cannot be found as written.
func segmentOf(t *renameTexts, r refAtPlace, path []string) (*[2]int, bool) {
	if nil == r.ref {
		return nil, false
	}
	segs := realSegs(r.ref.segs)
	i := len(path) - 1 - (len(r.reads) - len(segs))
	if 0 > i {
		return nil, true
	}
	text, _ := t.text(r.file)
	s, e := segs[i][0], min(segs[i][1], len(text))
	spelt := text[s:e]
	if "" != quoteAt(text, s) {
		spelt = text[s+1 : max(s+1, e-1)]
	}
	return &segs[i], spelt == path[len(path)-1]
}

// aliasRefusal is where the path is also written, or read, through a
// reference: a path a reference copies from it, or one it copies from,
// which the rename would leave behind.
func aliasRefusal(t *renameTexts, P []string, keys []keyAt, refs []refAtPlace) string {
	type alias struct {
		path []string
		via  refAtPlace
	}
	pairs := []refAtPlace{}
	for _, r := range refs {
		if !r.e.arg && 0 < len(r.reads) {
			pairs = append(pairs, r)
		}
	}
	found := []alias{}
	seen := map[string]bool{strings.Join(P, "\x00"): true}
	queue := [][]string{P}
	for 0 < len(queue) {
		A := queue[0]
		queue = queue[1:]
		for _, r := range pairs {
			Q, T := r.e.path, r.reads
			for i, B := range [][]string{nil, nil} {
				if 0 == i && prefixOf(T, A) {
					B = append(append([]string{}, Q...), A[len(T):]...)
				} else if 1 == i && prefixOf(Q, A) {
					B = append(append([]string{}, T...), A[len(Q):]...)
				}
				id := strings.Join(B, "\x00")
				if nil == B || seen[id] {
					continue
				}
				if maxAliases <= len(found) {
					return "too many paths reach the key through references"
				}
				seen[id] = true
				found = append(found, alias{B, r})
				queue = append(queue, B)
			}
		}
	}
	cs := []candidate{}
	for _, al := range found {
		through := ", through the reference at " + t.where(al.via.place)
		as := strings.Join(al.path, ".")
		for _, k := range keys {
			if alike(k.path, al.path) && "&" != k.path[len(k.path)-1] {
				cs = append(cs, candidate{k.place, "the key is also written as " + as + " at " + t.where(k.place) + through})
			}
		}
		for _, r := range refs {
			if len(r.reads) >= len(al.path) && alike(r.reads[:len(al.path)], al.path) {
				cs = append(cs, candidate{r.place, "the key is also read as " + as + " at " + t.where(r.place) + through})
			}
		}
	}
	return firstWhy(cs)
}

// DocEdit is one edit of the open document.
type DocEdit struct {
	Range   CursorRange `json:"range"`
	NewText string      `json:"newText"`
}

// CursorAction is a repair whose edit is decided, offered at a range.
type CursorAction struct {
	Title string    `json:"title"`
	Path  []string  `json:"path"`
	Edits []DocEdit `json:"edits"`
}

// entryDeletion is what deleting the entry written from s to e takes:
// its whole line where it stands alone on a line that ends, else the
// comma beside it, else the blanks that part it from what follows or,
// before a closing bracket, from what comes before.
func entryDeletion(src string, s, e int) (int, int) {
	ls := strings.LastIndexByte(src[:s], '\n') + 1
	right := e
	blank := func(i int) bool { return i < len(src) && (' ' == src[i] || '\t' == src[i]) }
	for blank(right) {
		right++
	}
	comma := right < len(src) && ',' == src[right]
	if comma {
		right++
		for blank(right) {
			right++
		}
	}
	eol := right >= len(src) || strings.IndexByte("\r\n#", src[right]) >= 0
	if le := strings.IndexByte(src[right:], '\n'); "" == strings.Trim(src[ls:s], " \t") && eol && 0 <= le {
		return ls, right + le + 1
	}
	if comma {
		return s, right
	}
	left := s
	for left > ls && (' ' == src[left-1] || '\t' == src[left-1]) {
		left--
	}
	if 0 < left && ',' == src[left-1] {
		return left - 1, e
	}
	if eol || strings.IndexByte("}])", src[right]) >= 0 {
		return left, e
	}
	return s, right
}

// symbolsAt is the symbols an outline has at a path, a key written twice
// there being two.
func symbolsAt(syms []DocSymbol, path []string) []DocSymbol {
	at := []DocSymbol{{Children: syms}}
	for _, seg := range path {
		next := []DocSymbol{}
		for _, s := range at {
			for _, c := range s.Children {
				if c.Name == seg {
					next = append(next, c)
				}
			}
		}
		at = next
	}
	return at
}

// ActionsAt is the repairs whose edit is decided at a range: removing an
// entry that `trim --check` reports, where the range meets it, every
// place the document writes it is found, and the text without it unifies
// to the same; nil where the document does not parse.
func (a *Aontu) ActionsAt(src string, rng CursorRange) []CursorAction {
	root, err := a.parseEntry(src)
	lines := newSrcLines(src)
	if nil != err || nil == root || 0 > rng.Start.Line || len(lines.starts) <= rng.Start.Line {
		return nil
	}
	report := a.TrimCheck(src)
	from := lines.offsetAt(rng.Start)
	end := rng.End
	if len(lines.starts) <= end.Line {
		end = lines.positionOf(len(src))
	}
	to := lines.offsetAt(end)
	paths := [][]string{}
	trimCandidates(root, nil, &paths)
	syms := symbolTree(src, root)
	entries := renameEntries(root)
	out := []CursorAction{}
	for _, text := range report.Redundant {
		named := [][]string{}
		for _, p := range paths {
			if "$."+strings.Join(p, ".") == text {
				named = append(named, p)
			}
		}
		if 1 != len(named) {
			continue
		}
		P := named[0]
		keyAt := func(e *renameEntry) int {
			off := -1
			if "" == e.v.srcurl() {
				off = e.v.pos()
			} else if sp, url, ok := e.v.load(); ok && "" == url {
				off = sp
			}
			if 0 > off || len(src) < off {
				return -1
			}
			if s, _, ok := keySpan(src, off, P[len(P)-1]); ok {
				return s
			}
			return -1
		}
		keys := map[int]bool{}
		located := map[int]bool{}
		for _, e := range entries {
			if slices.Equal(e.path, P) {
				if k := keyAt(e); 0 <= k {
					keys[k] = true
					located[e.kid] = true
				}
			}
		}
		found := symbolsAt(syms, P)
		ok := 0 < len(found) && len(keys) == len(found)
		for _, e := range entries {
			if e.step && slices.Equal(e.path, P) && !located[e.kid] {
				ok = false
			}
		}
		meets := false
		cuts := [][2]int{}
		for _, sym := range found {
			ok = ok && keys[lines.offsetAt(sym.SelectionRange.Start)]
			s, e := lines.offsetAt(sym.Range.Start), lines.offsetAt(sym.Range.End)
			meets = meets || (s <= to && from <= e)
			ds, de := entryDeletion(src, s, e)
			cuts = append(cuts, [2]int{ds, de})
		}
		if !ok || !meets {
			continue
		}
		slices.SortStableFunc(cuts, func(x, y [2]int) int { return x[0] - y[0] })
		merged := [][2]int{}
		for _, c := range cuts {
			if n := len(merged); 0 < n && c[0] <= merged[n-1][1] {
				merged[n-1][1] = max(merged[n-1][1], c[1])
			} else {
				merged = append(merged, c)
			}
		}
		edited := src
		for i := len(merged) - 1; 0 <= i; i-- {
			edited = edited[:merged[i][0]] + edited[merged[i][1]:]
		}
		if was, _, _ := a.trimEvalCanon(src, nil); func() bool {
			now, ok, _ := a.trimEvalCanon(edited, nil)
			return !ok || now != was
		}() {
			continue
		}
		act := CursorAction{Title: "Remove " + text + ", which changes nothing", Path: P, Edits: []DocEdit{}}
		for _, c := range merged {
			act.Edits = append(act.Edits, DocEdit{Range: CursorRange{Start: lines.positionOf(c[0]),
				End: lines.positionOf(c[1])}})
		}
		out = append(out, act)
	}
	return out
}

/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// aontu's own pattern matcher (ADR-060): an ECMA-262 u-mode parser, a
// compiler to a Pike VM, and the VM, which reads each code point of a
// text once and never goes back, so a match costs at most the text's
// length times the program's. Twin of ts/src/regex.ts.

// rxNode is a parsed pattern. kind is set, cat, alt, rep, group, mod,
// look, backref, bol, eol, wb or nwb; max -1 is unbounded.
type rxNode struct {
	kind     string
	set      uRanges
	items    []*rxNode
	node     *rxNode
	min, max int
}

// rxSub is a token the dialects read differently, by its place
// among the pattern's code points.
type rxSub struct {
	at, end int
	tok     string
	inClass bool
}

type rxInst struct {
	op   string
	set  uRanges
	x, y int
}

// rxProgramMax: a program past this many instructions is refused, since
// counted repetition copies its operand.
const rxProgramMax = 100000

// rxNestMax: groups nest at most this deep, so the parser's recursion
// stays well inside either port's stack.
const rxNestMax = 256

const rxSyntax = "^$\\.*+?()[]{}|"

var rxDigit = uRanges{{0x30, 0x39}}
var rxWord = uRanges{{0x30, 0x39}, {0x41, 0x5A}, {0x5F, 0x5F}, {0x61, 0x7A}}
var rxASCIISpace = uRanges{{0x09, 0x0D}, {0x20, 0x20}}
var rxECMASpace = uRanges{{0x09, 0x0D}, {0x20, 0x20}, {0xA0, 0xA0}, {0x1680, 0x1680},
	{0x2000, 0x200A}, {0x2028, 0x2029}, {0x202F, 0x202F}, {0x205F, 0x205F}, {0x3000, 0x3000},
	{0xFEFF, 0xFEFF}}

type rxRefusal struct{ why string }

func rxFail(why string) {
	panic(rxRefusal{why})
}

func rxIsDigit(c rune) bool { return '0' <= c && c <= '9' }
func rxIsHex(c rune) bool {
	return rxIsDigit(c) || ('a' <= c && c <= 'f') || ('A' <= c && c <= 'F')
}
func rxIsLetter(c rune) bool { return ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z') }

func rxIn(rs uRanges, c int) bool {
	lo, hi := 0, len(rs)-1
	for lo <= hi {
		m := (lo + hi) >> 1
		switch {
		case c < rs[m][0]:
			hi = m - 1
		case c > rs[m][1]:
			lo = m + 1
		default:
			return true
		}
	}
	return false
}

type rxParser struct {
	s           []rune
	i           int
	groups      int
	depth       int
	disjunction int
	names       []rxName
	refs        []string
	path        []string
	subs        []rxSub
	space       uRanges
	aontu       bool
}

// rxName is a named group with the alternatives it sits in, outermost
// first.
type rxName struct {
	name string
	path []string
}

func (p *rxParser) peek(o int) rune {
	if p.i+o < len(p.s) {
		return p.s[p.i+o]
	}
	return -1
}

func (p *rxParser) eat(c rune) bool {
	if p.i < len(p.s) && p.s[p.i] == c {
		p.i++
		return true
	}
	return false
}

func (p *rxParser) classEscape(c rune) (uRanges, bool) {
	switch c {
	case 'd':
		return rxDigit, true
	case 'D':
		return uComplement(rxDigit), true
	case 'w':
		return rxWord, true
	case 'W':
		return uComplement(rxWord), true
	case 's':
		return p.space, true
	case 'S':
		return uComplement(p.space), true
	}
	return nil, false
}

func (p *rxParser) property(negated bool) uRanges {
	if !p.eat('{') {
		rxFail("\\p and \\P take a property in braces")
	}
	body := ""
	for -1 != p.peek(0) && '}' != p.peek(0) {
		body += string(p.s[p.i])
		p.i++
	}
	if !p.eat('}') {
		rxFail("a \\p{...} is not closed")
	}
	var set uRanges
	var ok bool
	if name, value, has := strings.Cut(body, "="); has {
		set, ok = unicodeProperty(name, value, true)
	} else {
		set, ok = unicodeProperty(body, "", false)
	}
	if !ok {
		rxFail("\\p{" + body + "} names no property ECMA-262 reads")
	}
	if negated {
		return uComplement(set)
	}
	return set
}

func (p *rxParser) hex(n int) (int, bool) {
	v := 0
	for k := 0; k < n; k++ {
		c := p.peek(k)
		if !rxIsHex(c) {
			return 0, false
		}
		d, _ := strconv.ParseInt(string(c), 16, 32)
		v = v*16 + int(d)
	}
	p.i += n
	return v, true
}

// unicodeEscape reads \u, as \uHHHH, a surrogate pair of them, or
// \u{H...}.
func (p *rxParser) unicodeEscape() int {
	if p.eat('{') {
		v, n := 0, 0
		for rxIsHex(p.peek(0)) {
			d, _ := strconv.ParseInt(string(p.s[p.i]), 16, 32)
			p.i++
			v = v*16 + int(d)
			n++
			if uMax < v {
				rxFail("a \\u{...} escape is past U+10FFFF")
			}
		}
		if 0 == n || !p.eat('}') {
			rxFail("a \\u{ is not hex digits closed by }")
		}
		return v
	}
	v, ok := p.hex(4)
	if !ok {
		rxFail("a \\u is not four hex digits")
	}
	if 0xD800 <= v && v <= 0xDBFF && '\\' == p.peek(0) && 'u' == p.peek(1) && rxIsHex(p.peek(2)) {
		save := p.i
		p.i += 2
		t, ok := p.hex(4)
		if ok && 0xDC00 <= t && t <= 0xDFFF {
			return 0x10000 + ((v - 0xD800) << 10) + (t - 0xDC00)
		}
		p.i = save
	}
	return v
}

// charEscape is the code point a character escape names, the backslash
// read.
func (p *rxParser) charEscape(inClass bool) int {
	c := p.peek(0)
	p.i++
	switch c {
	case 'f':
		return 0x0C
	case 'n':
		return 0x0A
	case 'r':
		return 0x0D
	case 't':
		return 0x09
	case 'v':
		return 0x0B
	case 'c':
		if !rxIsLetter(p.peek(0)) {
			rxFail("\\c is not followed by an ASCII letter")
		}
		p.i++
		return int(p.s[p.i-1]) % 32
	case '0':
		if rxIsDigit(p.peek(0)) {
			rxFail("\\0 is followed by a digit, which is an octal escape u mode refuses")
		}
		return 0
	case 'x':
		v, ok := p.hex(2)
		if !ok {
			rxFail("\\x is not followed by two hex digits")
		}
		return v
	case 'u':
		return p.unicodeEscape()
	case -1:
		rxFail("the pattern ends in a backslash")
	}
	if strings.ContainsRune(rxSyntax, c) || '/' == c || (inClass && '-' == c) {
		return int(c)
	}
	rxFail("\\" + string(c) + " is not an escape u mode reads")
	return 0
}

func (p *rxParser) groupName() string {
	name := ""
	idStart, _ := unicodeProperty("ID_Start", "", false)
	idContinue, _ := unicodeProperty("ID_Continue", "", false)
	for first := true; ; first = false {
		var c int
		if '\\' == p.peek(0) && 'u' == p.peek(1) {
			p.i += 2
			c = p.unicodeEscape()
		} else if -1 == p.peek(0) || '>' == p.peek(0) {
			break
		} else {
			c = int(p.s[p.i])
			p.i++
		}
		set := idContinue
		if first {
			set = idStart
		}
		if !(0x24 == c || 0x5F == c || rxIn(set, c) || (!first && (0x200C == c || 0x200D == c))) {
			rxFail("a group name is not an identifier")
		}
		name += string(rune(c))
	}
	if "" == name || !p.eat('>') {
		rxFail("a group name is not an identifier closed by >")
	}
	return name
}

// classAtom is one member of a class: a code point, or a set (has).
func (p *rxParser) classAtom() (int, uRanges, bool) {
	at := p.i
	if !p.eat('\\') {
		p.i++
		return int(p.s[p.i-1]), nil, false
	}
	c := p.peek(0)
	if 'b' == c {
		p.i++
		return 0x08, nil, false
	}
	if set, ok := p.classEscape(c); ok {
		p.i++
		if 's' == c || 'S' == c || 'd' == c || 'w' == c {
			p.subs = append(p.subs, rxSub{at, p.i, "\\" + string(c), true})
		}
		return 0, set, true
	}
	if 'p' == c || 'P' == c {
		p.i++
		return 0, p.property('P' == c), true
	}
	if rxIsDigit(c) && '0' != c {
		rxFail("a decimal escape in a class, which u mode refuses")
	}
	return p.charEscape(true), nil, false
}

func (p *rxParser) charClass() *rxNode {
	negated := p.eat('^')
	out := uRanges{}
	for ']' != p.peek(0) {
		if -1 == p.peek(0) {
			rxFail("a character class is not closed")
		}
		a, aset, aIsSet := p.classAtom()
		if '-' == p.peek(0) && -1 != p.peek(1) && ']' != p.peek(1) {
			p.i++
			b, _, bIsSet := p.classAtom()
			if aIsSet || bIsSet {
				rxFail("a class escape is an end of a range")
			}
			if a > b {
				rxFail("a class range is out of order")
			}
			out = append(out, [2]int{a, b})
			continue
		}
		if aIsSet {
			out = append(out, aset...)
		} else {
			out = append(out, [2]int{a, a})
		}
	}
	p.i++
	set := uUnion([]uRanges{out})
	if negated {
		set = uComplement(set)
	}
	return &rxNode{kind: "set", set: set}
}

// rxCount is a counted bound as a number: one longer than a 32-bit
// integer is sure to hold is past any program's size.
func rxCount(d string) int {
	if 9 < len(d) {
		return 1 << 30
	}
	n, _ := strconv.Atoi(d)
	return n
}

func (p *rxParser) quantifier() (int, int, bool) {
	c := p.peek(0)
	var min, max int
	switch {
	case '*' == c || '+' == c || '?' == c:
		p.i++
		min, max = 0, -1
		if '+' == c {
			min = 1
		}
		if '?' == c {
			max = 1
		}
	case '{' == c:
		save := p.i
		p.i++
		digits := func() string {
			t := ""
			for rxIsDigit(p.peek(0)) {
				t += string(p.s[p.i])
				p.i++
			}
			return t
		}
		a := digits()
		b := a
		if p.eat(',') {
			b = digits()
		}
		if "" == a || !p.eat('}') {
			p.i = save
			rxFail("a { opens no counted quantifier")
		}
		// Compared as written, so a bound past any machine integer still
		// orders exactly.
		lead := func(d string) string {
			t := strings.TrimLeft(d, "0")
			if "" == t && "" != d {
				return "0"
			}
			return t
		}
		x, y := lead(a), lead(b)
		if "" != y && (len(x) > len(y) || (len(x) == len(y) && x > y)) {
			rxFail("a counted quantifier is out of order")
		}
		min, max = rxCount(x), -1
		if "" != y {
			max = rxCount(y)
		}
	default:
		return 0, 0, false
	}
	p.eat('?')
	return min, max, true
}

func (p *rxParser) group() *rxNode {
	if !p.eat('?') {
		p.groups++
		return &rxNode{kind: "group", node: p.disjunctionOf()}
	}
	if p.eat(':') {
		return &rxNode{kind: "group", node: p.disjunctionOf()}
	}
	if '=' == p.peek(0) || '!' == p.peek(0) {
		p.i++
		return &rxNode{kind: "look", node: p.disjunctionOf()}
	}
	if '<' == p.peek(0) && ('=' == p.peek(1) || '!' == p.peek(1)) {
		p.i += 2
		return &rxNode{kind: "look", node: p.disjunctionOf()}
	}
	if p.eat('<') {
		name := p.groupName()
		p.groups++
		p.names = append(p.names, rxName{name, append([]string{}, p.path...)})
		return &rxNode{kind: "group", node: p.disjunctionOf()}
	}
	add, remove := "", ""
	for rxIsLetter(p.peek(0)) {
		add += string(p.s[p.i])
		p.i++
	}
	dash := p.eat('-')
	for dash && rxIsLetter(p.peek(0)) {
		remove += string(p.s[p.i])
		p.i++
	}
	flags := add + remove
	seen := map[rune]bool{}
	bad := !p.eat(':') || (dash && "" == flags)
	for _, f := range flags {
		bad = bad || seen[f] || !strings.ContainsRune("ims", f)
		seen[f] = true
	}
	if bad {
		rxFail("a (? group is not one ECMA-262 defines")
	}
	return &rxNode{kind: "mod", node: p.disjunctionOf()}
}

func (p *rxParser) atom() *rxNode {
	at := p.i
	c := p.peek(0)
	p.i++
	switch c {
	case '(':
		if rxNestMax == p.depth {
			rxFail(fmt.Sprintf("groups nest deeper than %d", rxNestMax))
		}
		p.depth++
		node := p.group()
		p.depth--
		if !p.eat(')') {
			rxFail("a group is not closed")
		}
		return node
	case '[':
		return p.charClass()
	case '.':
		p.subs = append(p.subs, rxSub{at, p.i, ".", false})
		if p.aontu {
			return &rxNode{kind: "set", set: uComplement(uRanges{{0x0A, 0x0A}})}
		}
		return &rxNode{kind: "set", set: uComplement(uRanges{{0x0A, 0x0A}, {0x0D, 0x0D}, {0x2028, 0x2029}})}
	case '^':
		return &rxNode{kind: "bol"}
	case '$':
		return &rxNode{kind: "eol"}
	case '\\':
		e := p.peek(0)
		if 'b' == e || 'B' == e {
			p.i++
			if 'b' == e {
				return &rxNode{kind: "wb"}
			}
			return &rxNode{kind: "nwb"}
		}
		if p.aontu && ('A' == e || 'z' == e) {
			p.i++
			p.subs = append(p.subs, rxSub{at, p.i, "\\" + string(e), false})
			if 'A' == e {
				return &rxNode{kind: "bol"}
			}
			return &rxNode{kind: "eol"}
		}
		if set, ok := p.classEscape(e); ok {
			p.i++
			p.subs = append(p.subs, rxSub{at, p.i, "\\" + string(e), false})
			return &rxNode{kind: "set", set: set}
		}
		if 'p' == e || 'P' == e {
			p.i++
			return &rxNode{kind: "set", set: p.property('P' == e)}
		}
		if 'k' == e {
			p.i++
			if !p.eat('<') {
				rxFail("\\k is not followed by a group name")
			}
			p.refs = append(p.refs, "<"+p.groupName())
			return &rxNode{kind: "backref"}
		}
		if rxIsDigit(e) && '0' != e {
			t := ""
			for rxIsDigit(p.peek(0)) {
				t += string(p.s[p.i])
				p.i++
			}
			p.refs = append(p.refs, t)
			return &rxNode{kind: "backref"}
		}
		v := p.charEscape(false)
		return &rxNode{kind: "set", set: uRanges{{v, v}}}
	case ')', ']', '}', '|':
		rxFail("a " + string(c) + " stands alone")
	}
	return &rxNode{kind: "set", set: uRanges{{int(c), int(c)}}}
}

func (p *rxParser) alternative() *rxNode {
	items := []*rxNode{}
	for -1 != p.peek(0) && '|' != p.peek(0) && ')' != p.peek(0) {
		if c := p.peek(0); '*' == c || '+' == c || '?' == c || '{' == c {
			rxFail("a quantifier has nothing to repeat")
		}
		a := p.atom()
		min, max, ok := p.quantifier()
		if !ok {
			items = append(items, a)
			continue
		}
		switch a.kind {
		case "look", "bol", "eol", "wb", "nwb":
			rxFail("a quantifier has nothing to repeat")
		}
		items = append(items, &rxNode{kind: "rep", node: a, min: min, max: max})
	}
	if 1 == len(items) {
		return items[0]
	}
	return &rxNode{kind: "cat", items: items}
}

func (p *rxParser) disjunctionOf() *rxNode {
	id := p.disjunction
	p.disjunction++
	alts := []*rxNode{}
	for n := 0; ; n++ {
		p.path = append(p.path, fmt.Sprintf("%d:%d", id, n))
		alts = append(alts, p.alternative())
		p.path = p.path[:len(p.path)-1]
		if !p.eat('|') {
			break
		}
	}
	if 1 == len(alts) {
		return alts[0]
	}
	return &rxNode{kind: "alt", items: alts}
}

// parsePattern reads a pattern in the dialect, "ecma" or "aontu".
func parsePattern(src, dialect string) (node *rxNode, subs []rxSub, why string) {
	p := &rxParser{s: []rune(src), aontu: "aontu" == dialect, space: rxASCIISpace}
	if !p.aontu {
		p.space = rxECMASpace
	}
	defer func() {
		if r := recover(); nil != r {
			ref, isRef := r.(rxRefusal)
			if !isRef { //coverage:ignore only a refusal is raised above; anything else is a fault
				panic(r)
			}
			node, subs, why = nil, nil, ref.why
		}
	}()
	ast := p.disjunctionOf()
	if p.i < len(p.s) {
		rxFail("a ) stands alone")
	}
	for _, r := range p.refs {
		if name, named := strings.CutPrefix(r, "<"); named {
			found := false
			for _, n := range p.names {
				found = found || n.name == name
			}
			if !found {
				rxFail("a backreference names no group")
			}
		} else if n, err := strconv.Atoi(r); nil != err || p.groups < n {
			rxFail("a backreference names no group")
		}
	}
	// A name stands for a second group only where the two cannot both
	// match: in separate alternatives of one disjunction.
	for a := 0; a < len(p.names); a++ {
		for b := a + 1; b < len(p.names); b++ {
			if p.names[a].name != p.names[b].name {
				continue
			}
			pa, pb := p.names[a].path, p.names[b].path
			k := 0
			for k < len(pa) && k < len(pb) && pa[k] == pb[k] {
				k++
			}
			if k == len(pa) || k == len(pb) || strings.Split(pa[k], ":")[0] != strings.Split(pb[k], ":")[0] {
				rxFail("a group name is used twice")
			}
		}
	}
	return ast, p.subs, ""
}

func compileNode(ast *rxNode) (prog []rxInst, why string) {
	defer func() {
		if r := recover(); nil != r {
			ref, isRef := r.(rxRefusal)
			if !isRef { //coverage:ignore only a refusal is raised above; anything else is a fault
				panic(r)
			}
			prog, why = nil, ref.why
		}
	}()
	emit := func(ins rxInst) int {
		if rxProgramMax <= len(prog) {
			rxFail(fmt.Sprintf("the pattern compiles past %d instructions", rxProgramMax))
		}
		prog = append(prog, ins)
		return len(prog) - 1
	}
	// land is where a split's second branch or a jump goes, once known.
	land := func(n int) {
		if "split" == prog[n].op {
			prog[n].y = len(prog)
		} else {
			prog[n].x = len(prog)
		}
	}
	var gen func(n *rxNode)
	gen = func(n *rxNode) {
		switch n.kind {
		case "set":
			emit(rxInst{op: "set", set: n.set})
		case "cat":
			for _, x := range n.items {
				gen(x)
			}
		case "alt":
			jumps := []int{}
			for a := 0; a < len(n.items)-1; a++ {
				sp := emit(rxInst{op: "split", x: len(prog) + 1, y: -1})
				gen(n.items[a])
				jumps = append(jumps, emit(rxInst{op: "jmp", x: -1}))
				land(sp)
			}
			gen(n.items[len(n.items)-1])
			for _, j := range jumps {
				land(j)
			}
		case "group":
			gen(n.node)
		case "rep":
			// An operand that compiles to nothing matches only the empty
			// string, which one copy says as well as any number.
			for c, start := 0, len(prog); c < n.min; c++ {
				gen(n.node)
				if start == len(prog) {
					break
				}
			}
			if -1 == n.max {
				sp := emit(rxInst{op: "split", x: len(prog) + 1, y: -1})
				gen(n.node)
				emit(rxInst{op: "jmp", x: sp})
				land(sp)
				return
			}
			outs := []int{}
			for c := n.min; c < n.max; c++ {
				outs = append(outs, emit(rxInst{op: "split", x: len(prog) + 1, y: -1}))
				gen(n.node)
			}
			for _, o := range outs {
				land(o)
			}
		case "look":
			rxFail("a lookaround, which no regular language holds")
		case "backref":
			rxFail("a backreference, which no regular language holds")
		case "mod":
			rxFail("a modifier group, whose flags aontu does not apply")
		default:
			emit(rxInst{op: n.kind})
		}
	}
	gen(ast)
	emit(rxInst{op: "match"})
	return prog, ""
}

// compilePattern is the program of a pattern in the dialect, or why it
// is refused.
func compilePattern(src, dialect string) ([]rxInst, string) {
	ast, _, why := parsePattern(src, dialect)
	if "" != why {
		return nil, why
	}
	return compileNode(ast)
}

func rxIsWord(cps []rune, at int) bool {
	return 0 <= at && at < len(cps) && rxIn(rxWord, int(cps[at]))
}

// patternMatches is whether the program matches anywhere in the text:
// every thread steps over a code point together, and a thread that
// reaches an instruction another holds at that step is dropped.
func patternMatches(prog []rxInst, text string) bool {
	cps := []rune(text)
	mark := make([]int, len(prog))
	for k := range mark {
		mark[k] = -1
	}
	step := 0
	add := func(list []int, pc, pos int) []int {
		stack := []int{pc}
		for 0 < len(stack) {
			p := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if step == mark[p] {
				continue
			}
			mark[p] = step
			ins := prog[p]
			switch ins.op {
			case "jmp":
				stack = append(stack, ins.x)
			case "split":
				stack = append(stack, ins.y, ins.x)
			case "bol":
				if 0 == pos {
					stack = append(stack, p+1)
				}
			case "eol":
				if len(cps) == pos {
					stack = append(stack, p+1)
				}
			case "wb", "nwb":
				if (rxIsWord(cps, pos-1) != rxIsWord(cps, pos)) == ("wb" == ins.op) {
					stack = append(stack, p+1)
				}
			default:
				list = append(list, p)
			}
		}
		return list
	}
	list := add(nil, 0, 0)
	for pos := 0; ; pos++ {
		for _, p := range list {
			if "match" == prog[p].op {
				return true
			}
		}
		if pos == len(cps) {
			return false
		}
		next := []int{}
		step++
		for _, p := range list {
			if ins := prog[p]; "set" == ins.op && rxIn(ins.set, int(cps[pos])) {
				next = add(next, p+1, pos+1)
			}
		}
		list = add(next, 0, pos+1)
	}
}

// rxClassBody is a class body for a set, in ECMA-262's u mode.
func rxClassBody(rs uRanges) string {
	ch := func(c int) string { return fmt.Sprintf("\\u{%X}", c) }
	out := ""
	for _, r := range rs {
		out += ch(r[0]) + "-" + ch(r[1])
	}
	return out
}

// rxRewrite is the pattern with each token rewritten from one dialect to
// the other.
func rxRewrite(src string, subs []rxSub, to map[string][2]string) string {
	s := []rune(src)
	sorted := append([]rxSub{}, subs...)
	sort.SliceStable(sorted, func(a, b int) bool { return sorted[a].at < sorted[b].at })
	var out strings.Builder
	i := 0
	for _, sub := range sorted {
		out.WriteString(string(s[i:sub.at]))
		if sub.inClass {
			out.WriteString(to[sub.tok][1])
		} else {
			out.WriteString(to[sub.tok][0])
		}
		i = sub.end
	}
	out.WriteString(string(s[i:]))
	return out.String()
}

var rxAontuToECMA = map[string][2]string{
	".":   {"[^\\n]", ""},
	"\\d": {"[0-9]", "0-9"},
	"\\w": {"[0-9A-Za-z_]", "0-9A-Za-z_"},
	"\\s": {"[ \\t\\n\\r\\f\\v]", " \\t\\n\\r\\f\\v"},
	"\\D": {"[^0-9]", "\\D"},
	"\\W": {"[^0-9A-Za-z_]", "\\W"},
	"\\S": {"[^ \\t\\n\\r\\f\\v]", rxClassBody(uComplement(rxASCIISpace))},
	"\\A": {"^", ""},
	"\\z": {"$", ""},
}

const rxECMASpaceBody = "\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff"

var rxECMAToAontu = map[string][2]string{
	".":   {"[^\\n\\r\\u2028\\u2029]", ""},
	"\\d": {"\\d", "\\d"},
	"\\w": {"\\w", "\\w"},
	"\\s": {"[" + rxECMASpaceBody + "]", rxECMASpaceBody},
	"\\D": {"\\D", "\\D"},
	"\\W": {"\\W", "\\W"},
	"\\S": {"[^" + rxECMASpaceBody + "]", rxClassBody(uComplement(rxECMASpace))},
}

// exportForm is re()'s pattern as ECMA-262 u-mode text that means the
// same, which the exporter writes as `pattern`; or why re() refuses it.
func exportForm(src string) (string, string) {
	ast, subs, why := parsePattern(src, "aontu")
	if "" == why {
		_, why = compileNode(ast)
	}
	if "" != why {
		return "", why
	}
	return rxRewrite(src, subs, rxAontuToECMA), ""
}

// importForm is an ECMA-262 pattern as re() source that means the same,
// or why it cannot be one.
func importForm(src string) (string, string) {
	_, subs, why := parsePattern(src, "ecma")
	if "" != why {
		return "", why
	}
	out := rxRewrite(src, subs, rxECMAToAontu)
	if _, why := compilePattern(out, "aontu"); "" != why {
		return "", why
	}
	return out, ""
}

// ecmaWhy is why a string is not an ECMA-262 u-mode pattern, or "".
func ecmaWhy(src string) string {
	_, _, why := parsePattern(src, "ecma")
	return why
}

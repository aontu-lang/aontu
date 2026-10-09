/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// A format's grammar, read and run by aontu itself (ADR-059): RFC 5234
// with RFC 7405's case-sensitive strings, a pass that refuses what one
// character of lookahead cannot decide, and a recognizer over the rest.
// Twin of ts/src/formatgrammar.ts.

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
)

type fRange [2]int

type fNode struct {
	k        string // alt, cat, rep, ref, str, cls
	kids     []*fNode
	min, max int // a rep's bounds; max -1 is unbounded
	name     string
	cps      []int
	ci       bool
	set      []fRange
}

// fSet is numbered so that a union of the same sets is made once: a
// generated grammar asks for one union in hundreds of rules.
type fSet struct {
	id int
	r  []fRange
}

type fGrammar struct {
	start    string
	empty    bool
	rules    map[string]*fNode
	first    map[*fNode]*fSet
	nullable map[*fNode]bool
	one      map[*fNode]bool
}

type fAfter func() []fRange

type fRefusal struct{ code, reason string }

const formatStepMax = 1000000

const fNestMax = 64

func fUnionAll(sets ...[]fRange) []fRange {
	all := []fRange{}
	for _, s := range sets {
		all = append(all, s...)
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i][0] < all[j][0] })
	out := []fRange{}
	for _, r := range all {
		if n := len(out); 0 < n && r[0] <= out[n-1][1]+1 {
			out[n-1][1] = max(out[n-1][1], r[1])
		} else {
			out = append(out, r)
		}
	}
	return out
}

func fMeet(a, b []fRange) []fRange {
	out := []fRange{}
	for i, j := 0, 0; i < len(a) && j < len(b); {
		lo, hi := max(a[i][0], b[j][0]), min(a[i][1], b[j][1])
		if lo <= hi {
			out = append(out, fRange{lo, hi})
		}
		if a[i][1] < b[j][1] {
			i++
		} else {
			j++
		}
	}
	return out
}

// fShared is the least code point held by more than one set, or -1.
func fShared(sets ...[]fRange) int {
	all := []fRange{}
	for _, s := range sets {
		all = append(all, s...)
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i][0] < all[j][0] })
	top := -1
	for _, r := range all {
		if r[0] <= top {
			return r[0]
		}
		top = max(top, r[1])
	}
	return -1
}

func fHolds(set []fRange, cp int) bool {
	lo, hi := 0, len(set)-1
	for lo <= hi {
		mid := (lo + hi) >> 1
		if cp < set[mid][0] {
			hi = mid - 1
		} else if set[mid][1] < cp {
			lo = mid + 1
		} else {
			return true
		}
	}
	return false
}

func fCls(r ...fRange) *fNode { return &fNode{k: "cls", set: r} }

// RFC 5234 appendix B.1.
var fCore = func() map[string]*fNode {
	c := map[string]*fNode{
		"alpha":  fCls(fRange{0x41, 0x5a}, fRange{0x61, 0x7a}),
		"bit":    fCls(fRange{0x30, 0x31}),
		"char":   fCls(fRange{0x01, 0x7f}),
		"cr":     fCls(fRange{0x0d, 0x0d}),
		"crlf":   {k: "str", cps: []int{0x0d, 0x0a}},
		"ctl":    fCls(fRange{0x00, 0x1f}, fRange{0x7f, 0x7f}),
		"digit":  fCls(fRange{0x30, 0x39}),
		"dquote": fCls(fRange{0x22, 0x22}),
		"hexdig": fCls(fRange{0x30, 0x39}, fRange{0x41, 0x46}, fRange{0x61, 0x66}),
		"htab":   fCls(fRange{0x09, 0x09}),
		"lf":     fCls(fRange{0x0a, 0x0a}),
		"octet":  fCls(fRange{0x00, 0xff}),
		"sp":     fCls(fRange{0x20, 0x20}),
		"vchar":  fCls(fRange{0x21, 0x7e}),
		"wsp":    fCls(fRange{0x09, 0x09}, fRange{0x20, 0x20}),
	}
	c["lwsp"] = &fNode{k: "rep", min: 0, max: -1, kids: []*fNode{{k: "alt",
		kids: []*fNode{c["wsp"], {k: "cat", kids: []*fNode{c["crlf"], c["wsp"]}}}}}}
	return c
}()

func fHex(cp int) string { return "%x" + strings.ToUpper(strconv.FormatInt(int64(cp), 16)) }

// fUncomment cuts a comment from a semicolon outside a string or prose
// value.
func fUncomment(line string) string {
	quote := rune(0)
	for i, c := range line {
		switch {
		case 0 != quote:
			if c == quote {
				quote = 0
			}
		case '"' == c:
			quote = '"'
		case '<' == c:
			quote = '>'
		case ';' == c:
			return line[:i]
		}
	}
	return line
}

func fTrim(s string) string { return strings.Trim(s, " \t") }

// fHead is the first n code points, for a message both ports spell alike.
func fHead(s string, n int) string {
	r := []rune(s)
	if n < len(r) {
		r = r[:n]
	}
	return string(r)
}

var (
	fBlank    = regexp.MustCompile(`^[ \t]*$`)
	fRuleLine = regexp.MustCompile(`^([A-Za-z][A-Za-z0-9-]*)[ \t]*(=/|=)[ \t]*(.*)$`)
	fRepeat   = regexp.MustCompile(`^([0-9]*)(\*?)([0-9]*)`)
	fName     = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9-]*`)
	fNumber   = regexp.MustCompile(`^%([xXdDbB])([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+)|((?:\.[0-9A-Fa-f]+)+))?`)
	fDigits   = map[int]*regexp.Regexp{16: regexp.MustCompile(`^[0-9A-Fa-f]+$`),
		10: regexp.MustCompile(`^[0-9]+$`), 2: regexp.MustCompile(`^[01]+$`)}
	fPrintable = regexp.MustCompile(`[^\x20-\x7e]`)
	fLetter    = regexp.MustCompile(`[A-Za-z]`)
)

// fReadRules reads a grammar; a committed one may name the rules of the
// format library.
func fReadRules(src string, lib map[string]*fNode) (map[string]*fNode, []string, string) {
	defs := []string{}
	src = strings.ReplaceAll(strings.ReplaceAll(src, "\r\n", "\n"), "\r", "\n")
	for _, line := range strings.Split(src, "\n") {
		text := fUncomment(line)
		if fBlank.MatchString(text) {
			continue
		}
		if ' ' == text[0] || '\t' == text[0] {
			if 0 == len(defs) {
				panic(fRefusal{"abnf_grammar", "a continuation line comes before any rule"})
			}
			defs[len(defs)-1] += " " + fTrim(text)
		} else {
			defs = append(defs, fTrim(text))
		}
	}
	rules := map[string]*fNode{}
	order := []string{}
	start := ""
	for _, def := range defs {
		m := fRuleLine.FindStringSubmatch(def)
		if nil == m {
			panic(fRefusal{"abnf_grammar", "not a rule: " + fHead(def, 40)})
		}
		name := strings.ToLower(m[1])
		node := fReadElements(m[3], name)
		had, ok := rules[name]
		switch {
		case "=" == m[2] && ok:
			panic(fRefusal{"abnf_grammar", "rule " + name + " is defined twice"})
		case "=" == m[2]:
			rules[name] = node
			order = append(order, name)
			if "" == start {
				start = m[1]
			}
		case !ok:
			panic(fRefusal{"abnf_grammar", "rule " + name + " is extended before it is defined"})
		default:
			rules[name] = &fNode{k: "alt", kids: append(fAlts(had), fAlts(node)...)}
		}
	}
	if "" == start {
		panic(fRefusal{"abnf_grammar", "the grammar defines no rule"})
	}
	var refer func(x *fNode)
	refer = func(x *fNode) {
		if _, ok := rules[x.name]; "ref" == x.k && !ok {
			found, known := fCore[x.name]
			if !known {
				found, known = lib[x.name]
			}
			if !known {
				panic(fRefusal{"abnf_grammar", "rule " + x.name + " is not defined"})
			}
			rules[x.name] = found
			order = append(order, x.name)
			refer(found)
		}
		for _, k := range x.kids {
			refer(k)
		}
	}
	for _, name := range append([]string{}, order...) {
		refer(rules[name])
	}
	return rules, order, start
}

func fAlts(n *fNode) []*fNode {
	if "alt" == n.k {
		return n.kids
	}
	return []*fNode{n}
}

func fReadElements(text, rule string) *fNode {
	i := 0
	depth := 0
	bad := func(why string) fRefusal { return fRefusal{"abnf_grammar", "rule " + rule + ": " + why} }
	at := func(j int) byte {
		if j < len(text) {
			return text[j]
		}
		return 0
	}
	space := func() {
		for ' ' == at(i) || '\t' == at(i) {
			i++
		}
	}
	var alternation, concatenation, repetition, element, number func() *fNode
	var chars func(ci bool) *fNode
	alternation = func() *fNode {
		alts := []*fNode{concatenation()}
		space()
		for '/' == at(i) {
			i++
			alts = append(alts, concatenation())
			space()
		}
		if 1 == len(alts) {
			return alts[0]
		}
		return &fNode{k: "alt", kids: alts}
	}
	concatenation = func() *fNode {
		items := []*fNode{}
		space()
		for i < len(text) && !strings.ContainsRune("/)]", rune(text[i])) {
			items = append(items, repetition())
			space()
		}
		if 0 == len(items) {
			panic(bad("an alternative is empty"))
		}
		if 1 == len(items) {
			return items[0]
		}
		return &fNode{k: "cat", kids: items}
	}
	repetition = func() *fNode {
		m := fRepeat.FindStringSubmatch(text[i:])
		i += len(m[0])
		if 9 < len(m[1]) || 9 < len(m[3]) {
			panic(bad("a repeat count is past 999999999"))
		}
		lo, hi := -1, -1
		if "" != m[1] {
			lo, _ = strconv.Atoi(m[1])
		}
		if "" != m[3] {
			hi, _ = strconv.Atoi(m[3])
		}
		mn, mx := 1, 1
		if "" == m[2] && 0 <= lo {
			mn, mx = lo, lo
		} else if "" != m[2] {
			mn, mx = max(lo, 0), hi
		}
		if 0 <= mx && mx < mn {
			panic(bad("a repeat count has its bounds the wrong way round"))
		}
		node := element()
		if 1 == mn && 1 == mx {
			return node
		}
		return &fNode{k: "rep", min: mn, max: mx, kids: []*fNode{node}}
	}
	element = func() *fNode {
		if len(text) == i || ' ' == text[i] || '\t' == text[i] {
			panic(bad("a repeat count is not followed by an element"))
		}
		c := text[i]
		if '(' == c || '[' == c {
			if fNestMax == depth {
				panic(bad("groups nest deeper than " + strconv.Itoa(fNestMax)))
			}
			i++
			depth++
			node := alternation()
			depth--
			if closer := map[byte]byte{'(': ')', '[': ']'}[c]; closer != at(i) {
				panic(bad("a group is not closed"))
			}
			i++
			if '(' == c {
				return node
			}
			return &fNode{k: "rep", min: 0, max: 1, kids: []*fNode{node}}
		}
		if '"' == c {
			return chars(true)
		}
		if '%' == c {
			if t := strings.ToLower(string(at(i + 1))); "s" == t || "i" == t {
				i += 2
				return chars("i" == t)
			}
			return number()
		}
		if '<' == c {
			panic(fRefusal{"format_grammar", "rule " + rule + ": a prose value cannot be run"})
		}
		m := fName.FindString(text[i:])
		if "" == m {
			panic(bad("unexpected " + fHead(text[i:], 8)))
		}
		i += len(m)
		return &fNode{k: "ref", name: strings.ToLower(m)}
	}
	chars = func(ci bool) *fNode {
		if '"' != at(i) {
			panic(bad("a string is malformed"))
		}
		end := strings.IndexByte(text[i+1:], '"')
		if end < 0 {
			panic(bad("a string is not closed"))
		}
		s := text[i+1 : i+1+end]
		i += end + 2
		if fPrintable.MatchString(s) {
			panic(bad("a string holds a character outside %x20-7E"))
		}
		if "" == s {
			return &fNode{k: "cat"}
		}
		cps := make([]int, len(s))
		for j := range s {
			cps[j] = int(s[j])
		}
		return &fNode{k: "str", cps: cps, ci: ci && fLetter.MatchString(s)}
	}
	number = func() *fNode {
		m := fNumber.FindStringSubmatch(text[i:])
		parts := []string{}
		base := 0
		if nil != m {
			parts = append(parts, m[2])
			if "" != m[3] {
				parts = append(parts, m[3])
			}
			if "" != m[4] {
				parts = append(parts, strings.Split(m[4][1:], ".")...)
			}
			base = map[string]int{"x": 16, "d": 10, "b": 2}[strings.ToLower(m[1])]
		}
		ok := nil != m
		for _, p := range parts {
			ok = ok && fDigits[base].MatchString(p)
		}
		if !ok {
			panic(bad("a numeric value is malformed"))
		}
		i += len(m[0])
		n := make([]int, len(parts))
		for j, p := range parts {
			v, err := strconv.ParseInt(p, base, 64)
			if nil != err || 0x10ffff < v {
				panic(bad("a numeric value is past %x10FFFF"))
			}
			n[j] = int(v)
		}
		if "" != m[3] {
			if n[1] < n[0] {
				panic(bad("a range has its bounds the wrong way round"))
			}
			return fCls(fRange{n[0], n[1]})
		}
		if 1 == len(n) {
			return fCls(fRange{n[0], n[0]})
		}
		return &fNode{k: "str", cps: n}
	}
	out := alternation()
	if i < len(text) {
		panic(bad("unexpected " + fHead(text[i:], 8)))
	}
	return out
}

// fWalk goes depth first over the rules without recursing, so a long
// chain of rules cannot exhaust the stack: the rules in the order each
// is finished, and back(t) for an edge that closes a cycle at t.
func fWalk(names []string, edges map[string][]string, back func(t string)) []string {
	state := map[string]int{}
	done := []string{}
	type frame struct {
		name string
		next int
	}
	for _, root := range names {
		if 0 != state[root] {
			continue
		}
		state[root] = 1
		stack := []*frame{{root, 0}}
		for 0 < len(stack) {
			top := stack[len(stack)-1]
			out := edges[top.name]
			if top.next == len(out) {
				stack = stack[:len(stack)-1]
				state[top.name] = 2
				done = append(done, top.name)
				continue
			}
			t := out[top.next]
			top.next++
			if 1 == state[t] {
				back(t)
			} else if 0 == state[t] {
				state[t] = 1
				stack = append(stack, &frame{t, 0})
			}
		}
	}
	return done
}

// fLead is the items a sequence can begin with: up to and including the
// first that cannot match the empty string.
func fLead(items []*fNode, nl func(x *fNode) bool) []*fNode {
	out := []*fNode{}
	for _, it := range items {
		out = append(out, it)
		if !nl(it) {
			break
		}
	}
	return out
}

func fOnce(fn fAfter) fAfter {
	var memo []fRange
	done := false
	return func() []fRange {
		if !done {
			memo, done = fn(), true
		}
		return memo
	}
}

func fIDs(xs []*fSet) string {
	b := strings.Builder{}
	for _, x := range xs {
		b.WriteString(strconv.Itoa(x.id))
		b.WriteByte(',')
	}
	return b.String()
}

// fAnalyse is the determinism pass: nullable, FIRST and one-character to
// a fixpoint, then FOLLOW where a choice needs it, then each choice held
// to one character of lookahead.
func fAnalyse(rules map[string]*fNode, order []string, start string) *fGrammar {
	ids := 0
	set := func(r []fRange) *fSet {
		ids++
		return &fSet{id: ids, r: r}
	}
	empty := set([]fRange{})
	unions := map[string]*fSet{}
	join := func(xs []*fSet) *fSet {
		if 0 == len(xs) {
			return empty
		}
		if 1 == len(xs) {
			return xs[0]
		}
		key := fIDs(xs)
		hit, ok := unions[key]
		if !ok {
			rs := make([][]fRange, len(xs))
			for i, x := range xs {
				rs[i] = x.r
			}
			hit = set(fUnionAll(rs...))
			unions[key] = hit
		}
		return hit
	}
	clashes := map[string]int{}
	clash := func(xs []*fSet) int {
		key := fIDs(xs)
		hit, ok := clashes[key]
		if !ok {
			rs := make([][]fRange, len(xs))
			for i, x := range xs {
				rs[i] = x.r
			}
			hit = fShared(rs...)
			clashes[key] = hit
		}
		return hit
	}

	nul := map[*fNode]bool{}
	fst := map[*fNode]*fSet{}
	one := map[*fNode]bool{}
	nl := func(x *fNode) bool { return nul[x] }
	f := func(x *fNode) *fSet {
		if s, ok := fst[x]; ok {
			return s
		}
		return empty
	}
	firsts := func(xs []*fNode) []*fSet {
		out := make([]*fSet, len(xs))
		for i, x := range xs {
			out[i] = f(x)
		}
		return out
	}

	// reach is the rules x refers to, or only those it can reach before
	// reading a character.
	var reach func(x *fNode, out *[]string, seen map[string]bool, leading bool)
	reach = func(x *fNode, out *[]string, seen map[string]bool, leading bool) {
		if "ref" == x.k && !seen[x.name] {
			seen[x.name] = true
			*out = append(*out, x.name)
		}
		next := x.kids
		if leading && "cat" == x.k {
			next = fLead(x.kids, nl)
		}
		for _, k := range next {
			reach(k, out, seen, leading)
		}
	}
	edges := func(leading bool) map[string][]string {
		e := map[string][]string{}
		for _, k := range order {
			out := []string{}
			reach(rules[k], &out, map[string]bool{}, leading)
			e[k] = out
		}
		return e
	}
	nodes := []*fNode{}
	seen := map[*fNode]bool{}
	var collect func(x *fNode)
	collect = func(x *fNode) {
		if !seen[x] {
			seen[x] = true
			for _, k := range x.kids {
				collect(k)
			}
			nodes = append(nodes, x)
		}
	}
	for _, k := range fWalk(order, edges(false), func(string) {}) {
		collect(rules[k])
	}
	inner := []*fNode{}
	for _, x := range nodes {
		switch x.k {
		case "str":
			fst[x] = set(fCaseOf(x.cps[0], x.ci))
			one[x] = 1 == len(x.cps)
		case "cls":
			fst[x] = set(x.set)
			one[x] = true
		default:
			inner = append(inner, x)
		}
	}
	attrs := func(x *fNode) (bool, *fSet, bool) {
		switch x.k {
		case "alt":
			n, o := false, true
			for _, a := range x.kids {
				n, o = n || nul[a], o && one[a]
			}
			return n, join(firsts(x.kids)), o
		case "cat":
			n := true
			for _, it := range x.kids {
				n = n && nul[it]
			}
			return n, join(firsts(fLead(x.kids, nl))), false
		case "rep":
			if 0 == x.max {
				return true, empty, false
			}
			return 0 == x.min || nul[x.kids[0]], f(x.kids[0]), false
		}
		r := rules[x.name]
		return nul[r], f(r), one[r]
	}
	for moved := true; moved; {
		moved = false
		for _, x := range inner {
			n, s, o := attrs(x)
			was, had := fst[x]
			if n != nul[x] || o != one[x] || !had || (s != was && !fSameRanges(s.r, was.r)) {
				nul[x], fst[x], one[x] = n, s, o
				moved = true
			}
		}
	}
	// A rule that reaches itself before reading a character never stops.
	fWalk(order, edges(true), func(t string) {
		panic(fRefusal{"format_grammar", "rule " + t + " is left-recursive"})
	})

	// Each node is visited with what can follow it, made only when asked
	// for, and whether the end of its rule can follow it.
	var flow func(x *fNode, after fAfter, open bool, visit func(x *fNode, after fAfter, open bool))
	flow = func(x *fNode, after fAfter, open bool, visit func(x *fNode, after fAfter, open bool)) {
		visit(x, after, open)
		switch x.k {
		case "alt":
			for _, a := range x.kids {
				flow(a, after, open, visit)
			}
		case "cat":
			afters := make([]fAfter, len(x.kids))
			opens := make([]bool, len(x.kids))
			next, o := after, open
			for j := len(x.kids) - 1; 0 <= j; j-- {
				afters[j], opens[j] = next, o
				it, tail := x.kids[j], next
				next = fOnce(func() []fRange {
					if nul[it] {
						return fUnionAll(f(it).r, tail())
					}
					return f(it).r
				})
				o = o && nul[it]
			}
			for j, it := range x.kids {
				flow(it, afters[j], opens[j], visit)
			}
		case "rep":
			node := x.kids[0]
			if x.max < 0 || 1 < x.max {
				flow(node, fOnce(func() []fRange { return fUnionAll(f(node).r, after()) }), open, visit)
			} else {
				flow(node, after, open, visit)
			}
		}
	}
	choice := func(x *fNode) bool {
		if "rep" == x.k {
			return x.min != x.max
		}
		for _, a := range x.kids {
			if "alt" == x.k && nul[a] {
				return true
			}
		}
		return false
	}

	follow := map[string][]fRange{}
	tail := func(name string) fAfter { return func() []fRange { return follow[name] } }

	// A rule needs its FOLLOW when a choice, or a rule that needs its
	// own, can end it.
	needed := map[string]bool{}
	enders := map[string][]string{}
	todo := []string{}
	need := func(name string) {
		if !needed[name] {
			needed[name] = true
			todo = append(todo, name)
		}
	}
	for _, name := range order {
		flow(rules[name], tail(name), true, func(x *fNode, _ fAfter, open bool) {
			if open && choice(x) {
				need(name)
			}
			if open && "ref" == x.k {
				enders[x.name] = append(enders[x.name], name)
			}
		})
	}
	for 0 < len(todo) {
		t := todo[len(todo)-1]
		todo = todo[:len(todo)-1]
		for _, q := range enders[t] {
			need(q)
		}
	}

	for moved := true; moved; {
		moved = false
		for _, name := range order {
			flow(rules[name], tail(name), true, func(x *fNode, after fAfter, _ bool) {
				if "ref" == x.k && needed[x.name] {
					was := follow[x.name]
					if grown := fUnionAll(was, after()); !fSameRanges(was, grown) {
						follow[x.name] = grown
						moved = true
					}
				}
			})
		}
	}

	for _, name := range order {
		refuse := func(why string) {
			panic(fRefusal{"format_grammar", "rule " + name + ": " + why})
		}
		flow(rules[name], tail(name), true, func(x *fNode, after fAfter, _ bool) {
			if "alt" == x.k {
				fs := firsts(x.kids)
				if c := clash(fs); 0 <= c {
					refuse("two alternatives begin with " + fHex(c))
				}
				empties := 0
				for _, a := range x.kids {
					if nul[a] {
						empties++
					}
				}
				if 1 < empties {
					refuse("two alternatives match the empty string")
				}
				next := []fRange{}
				if 0 < empties {
					next = fMeet(join(fs).r, after())
				}
				if 0 < len(next) {
					refuse("an alternative matches the empty string and another begins with " +
						fHex(next[0][0]) + ", which can follow it")
				}
			} else if "rep" == x.k && x.min != x.max {
				if next := fMeet(f(x.kids[0]).r, after()); 0 < len(next) {
					refuse("an option or repetition begins with " + fHex(next[0][0]) + ", which can follow it")
				}
			}
		})
	}
	return &fGrammar{start: start, empty: nul[rules[strings.ToLower(start)]], rules: rules,
		first: fst, nullable: nul, one: one}
}

// fCaseOf is a case-insensitive string's first character, in both its
// cases.
func fCaseOf(cp int, ci bool) []fRange {
	other := cp
	if ci && 0x41 <= cp && cp <= 0x5a {
		other = cp + 0x20
	} else if ci && 0x61 <= cp && cp <= 0x7a {
		other = cp - 0x20
	}
	return fUnionAll([]fRange{{cp, cp}}, []fRange{{other, other}})
}

func fSameRanges(a, b []fRange) bool {
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

type fRead struct {
	g            *fGrammar
	code, reason string
}

var (
	fGrammars   = [2]map[string]fRead{{}, {}}
	fGrammarsMu sync.Mutex
	fLibrary    map[string]*fNode
)

func readFormatGrammar(src string) (g *fGrammar, code, reason string) {
	return readGrammarOf(src, false)
}

// readGrammarOf reads a grammar once; a committed one may name the
// rules of the format library.
func readGrammarOf(src string, committed bool) (g *fGrammar, code, reason string) {
	which := 0
	if committed {
		which = 1
	}
	fGrammarsMu.Lock()
	hit, ok := fGrammars[which][src]
	fGrammarsMu.Unlock()
	if ok {
		return hit.g, hit.code, hit.reason
	}
	out := func() (r fRead) {
		defer func() {
			if e := recover(); nil != e {
				ref, isRef := e.(fRefusal)
				if !isRef { //coverage:ignore only a refusal is raised above; anything else is a fault
					panic(e)
				}
				r = fRead{code: ref.code, reason: ref.reason}
			}
		}()
		var lib map[string]*fNode
		if committed {
			fGrammarsMu.Lock()
			if nil == fLibrary {
				fLibrary, _, _ = fReadRules(formatLibrary, nil)
			}
			lib = fLibrary
			fGrammarsMu.Unlock()
		}
		rules, order, start := fReadRules(src, lib)
		return fRead{g: fAnalyse(rules, order, start)}
	}()
	fGrammarsMu.Lock()
	fGrammars[which][src] = out
	fGrammarsMu.Unlock()
	return out.g, out.code, out.reason
}

type fFrame struct {
	n         *fNode
	rep       *fNode
	count, at int
}

// recogniseFormat runs the stack of what is still to match, one choice
// per character: -1 for a match, the index of the first code point it
// cannot read otherwise, and ok false past the step bound.
func recogniseFormat(g *fGrammar, s string) (stop int, ok bool) {
	cps := []int{}
	for _, r := range s {
		cps = append(cps, int(r))
	}
	end := len(cps)
	stack := []fFrame{{n: g.rules[strings.ToLower(g.start)]}}
	at := 0
	for steps := 1; 0 < len(stack); steps++ {
		if formatStepMax < steps {
			return 0, false
		}
		fr := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		cp := -1
		if at < end {
			cp = cps[at]
		}
		if nil != fr.rep {
			node := fr.rep.kids[0]
			more := (fr.rep.max < 0 || fr.count < fr.rep.max) && at < end &&
				fHolds(g.first[node].r, cp) && (0 == fr.count || fr.at < at)
			if more {
				stack = append(stack, fFrame{rep: fr.rep, count: fr.count + 1, at: at}, fFrame{n: node})
			} else if fr.count < fr.rep.min && !g.nullable[node] {
				return at, true
			}
			continue
		}
		x := fr.n
		// One character from a set: a class, a letter, or a rule of them.
		if g.one[x] {
			if at == end || !fHolds(g.first[x].r, cp) {
				return at, true
			}
			at++
			continue
		}
		switch x.k {
		case "str":
			for _, c := range x.cps {
				if at == end || !fSame(c, cps[at], x.ci) {
					return at, true
				}
				at++
			}
		case "ref":
			stack = append(stack, fFrame{n: g.rules[x.name]})
		case "cat":
			for j := len(x.kids) - 1; 0 <= j; j-- {
				stack = append(stack, fFrame{n: x.kids[j]})
			}
		case "alt":
			var pick *fNode
			for _, a := range x.kids {
				if at < end && fHolds(g.first[a].r, cp) {
					pick = a
					break
				}
			}
			for _, a := range x.kids {
				if nil == pick && g.nullable[a] {
					pick = a
				}
			}
			if nil == pick {
				return at, true
			}
			stack = append(stack, fFrame{n: pick})
		case "rep":
			stack = append(stack, fFrame{rep: x, at: at})
		}
	}
	if at == end {
		return -1, true
	}
	return at, true
}

// fRuleName is a string that names a format: one rule name. Any other
// string is a grammar, which defines a rule and so holds `=`.
var fRuleName = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9-]*$`)

// formatOf reads a format. A JSON Schema format is the committed
// grammars a string meets together, or regex, which the pattern dialect
// decides and so has none.
func formatOf(src string) (name string, gs []*fGrammar, code, why string) {
	if !fRuleName.MatchString(src) {
		g, code, why := readFormatGrammar(src)
		if nil == g {
			return "", nil, code, why
		}
		return g.start, []*fGrammar{g}, "", ""
	}
	texts, ok := formatGrammars[src]
	if !ok && "regex" == src {
		return src, nil, "", ""
	}
	if !ok {
		return "", nil, "format_unknown", src
	}
	gs = []*fGrammar{}
	for _, t := range texts {
		g, _, _ := readGrammarOf(t, true)
		gs = append(gs, g)
	}
	return src, gs, "", ""
}

// IsDefinedFormat is whether a name is one of the formats JSON Schema
// defines, which format(name) reads without a grammar from its caller.
func IsDefinedFormat(name string) bool {
	_, ok := formatGrammars[name]
	return ok || "regex" == name
}

func fSame(a, b int, ci bool) bool {
	fold := func(c int) int {
		if 0x41 <= c && c <= 0x5a {
			return c + 0x20
		}
		return c
	}
	return a == b || (ci && 0x61 <= fold(a) && fold(a) <= 0x7a && fold(a) == fold(b))
}

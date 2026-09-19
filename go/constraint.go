/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import (
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

type constraintBound struct {
	v    *ScalarVal
	open bool
}

type constraintMust struct {
	v   Val        // the value the peer must unify with
	msg *ScalarVal // the author's message (Canon renders the literal)
}

type constraintPending struct {
	atom string
	args []Val
}

type constraintRe struct {
	v *ScalarVal
	// src is the pattern text AS WRITTEN -- Canon and dedup use this,
	// never the normalised form, because canon round-trips source.
	src  string
	norm string
	re   *regexp.Regexp // compiled by the host engine, from norm
}


const reRepeatMax = 1000

// The normative expansions. These are Aontu's definitions, not either
// host's; both hosts are rewritten to them.
const reClassDigit = "0-9"
const reClassWord = "0-9A-Za-z_"
const reClassSpace = ` \t\n\r\f\v`

// reEscapePunct are the metacharacters that may be escaped to mean
// themselves in both engines. `-` is handled separately: legal escaped
// only INSIDE a character class.
const reEscapePunct = `\.+*?()[]{}|^$/`

// reEscapePass are escapes passed through unchanged: the control
// characters. Each was probed in both engines.
const reEscapePass = "tnrfv"

func repeatWhy(src []rune, at int) (string, int) {
	bad := func(what string) (string, int) {
		return "a " + what +
			", which the two engines do not read the same way", -1
	}
	notCounted := "{ that does not open a counted quantifier"
	overCap := "a repeat count above " + strconv.Itoa(reRepeatMax) +
		", which RE2 refuses to compile"

	i := at + 1
	val := 0
	digitCount := 0
	tooBig := false
	bounds := []int{}
	commas := 0
	reset := func() {
		val, digitCount, tooBig = 0, 0, false
	}
	for ; i < len(src); i++ {
		c := src[i]
		if '0' <= c && c <= '9' {
			digitCount++
			d := int(c - '0')
			if tooBig {
				continue
			}
			if val > (math.MaxInt-d)/10 {
				// Saturate rather than wrap. Leading zeros cannot get
				// here, so this is the same set Atoi rejected.
				tooBig = true
				continue
			}
			val = val*10 + d
			continue
		}
		if ',' == c {
			if 0 == digitCount || 0 < commas {
				return bad(notCounted)
			}
			if tooBig {
				// Too many digits to be an int at all, so certainly
				// above the cap -- TypeScript's parseInt yields a float
				// far above it and refuses for the same reason.
				return overCap, -1
			}
			bounds = append(bounds, val)
			reset()
			commas++
			continue
		}
		if '}' == c {
			if 0 < digitCount {
				if tooBig {
					return overCap, -1
				}
				bounds = append(bounds, val)
			} else if 0 == commas {
				return bad(notCounted)
			}
			break
		}
		return bad(notCounted)
	}
	if i >= len(src) {
		return bad(notCounted)
	}
	for _, b := range bounds {
		if reRepeatMax < b {
			return overCap, -1
		}
	}
	// A descending range (`{5,2}`) is refused by both engines' own
	// compilers, so it needs no rule here.
	return "", i
}

func isHexDigit(c rune) bool {
	return ('0' <= c && c <= '9') || ('a' <= c && c <= 'f') || ('A' <= c && c <= 'F')
}

// normaliseEscape rewrites one `\<n>` into its engine-neutral form.
// Returns (emitted, why, extra): a non-empty why means refused, and
// extra counts source characters consumed beyond the backslash and n.
func normaliseEscape(n rune, at func(int) rune, i int, inClass bool) (string, string, int) {
	if 0 == n {
		return "", "a trailing backslash", 0
	}
	if '1' <= n && n <= '9' {
		return "", "a backreference (\\" + string(n) + "): RE2 has no equivalent, and a" +
			" pattern with one is not a regular expression", 0
	}
	if 'k' == n {
		return "", "a named backreference (\\k): RE2 has no equivalent", 0
	}
	if 'u' == n {
		return "", "a \\u escape, which RE2 spells \\x{...}: write the character" +
			" itself, or \\xHH for a byte", 0
	}
	if 'p' == n || 'P' == n {
		return "", "a Unicode class (\\" + string(n) + "), which JavaScript reads as a" +
			" literal \"" + string(n) + "\" without a flag aontu does not set", 0
	}
	if 'Z' == n {
		return "", "\\Z, which RE2 does not accept and JavaScript reads as a" +
			" literal \"Z\": write $ for end of text", 0
	}
	if 'x' == n {
		if '{' == at(i+2) {
			return "", "a \\x{...} escape, which JavaScript spells \\u: write the" +
				" character itself", 0
		}
		if !isHexDigit(at(i+2)) || !isHexDigit(at(i+3)) {
			return "", "an \\x escape without two hex digits", 0
		}
		return "\\x" + string(at(i+2)) + string(at(i+3)), "", 2
	}

	// The abbreviations, rewritten to Aontu's definitions. Inside a class
	// the expansion splices without its brackets (`[\dx]` -> `[0-9x]`).
	if 'd' == n || 'w' == n || 's' == n {
		set := reClassDigit
		if 'w' == n {
			set = reClassWord
		} else if 's' == n {
			set = reClassSpace
		}
		if inClass {
			return set, "", 0
		}
		return "[" + set + "]", "", 0
	}
	if 'D' == n || 'W' == n || 'S' == n {
		if inClass {
			// `[^...]` cannot be spliced into an enclosing class: the
			// negation would apply to the whole class, not this member.
			return "", "a negated abbreviation (\\" + string(n) + ") inside a character" +
				" class, which cannot be expanded in place: write the characters out", 0
		}
		set := reClassDigit
		if 'W' == n {
			set = reClassWord
		} else if 'S' == n {
			set = reClassSpace
		}
		return "[^" + set + "]", "", 0
	}

	// Anchors. `\A`/`\z` are RE2 spellings that JavaScript reads as
	// literals, so they are rewritten rather than refused. Inside a class
	// an anchor is meaningless, and `[\b]` is a BACKSPACE in JavaScript.
	if 'A' == n || 'z' == n || 'b' == n || 'B' == n {
		if inClass {
			return "", "\\" + string(n) + " inside a character class, where the two" +
				" engines do not agree what it means", 0
		}
		if 'A' == n {
			return "^", "", 0
		}
		if 'z' == n {
			return "$", "", 0
		}
		return "\\" + string(n), "", 0
	}

	if '-' == n {
		if inClass {
			return "\\-", "", 0
		}
		return "", "\\- outside a character class: it is a range separator inside" +
			" one and a syntax error outside one (write a bare -)", 0
	}
	if strings.ContainsRune(reEscapePass, n) || strings.ContainsRune(reEscapePunct, n) {
		return "\\" + string(n), "", 0
	}
	return "", "\\" + string(n) + ", an escape whose meaning the two engines do not" +
		" share", 0
}

type reGroup struct {
	q, alt bool
}

// normaliseRe rewrites a pattern into the engine-neutral subset.
// Returns (normalised, why): a non-empty why means the pattern is
// outside the subset and names the construct.
func normaliseRe(src string) (string, string) {
	inClass := false
	// Where the counted quantifier validated below closes, so its own
	// `}` is told apart from a stray one; and whether the atom just
	// emitted was `^` or `$`, which cannot be quantified.
	repeatEnd := -1
	anchorPrev := false
	r := []rune(src)
	var out strings.Builder

	at := func(i int) rune {
		if i >= 0 && i < len(r) {
			return r[i]
		}
		return 0
	}

	groups := []reGroup{}
	mark := func(q bool) {
		if 0 < len(groups) {
			if q {
				groups[len(groups)-1].q = true
			} else {
				groups[len(groups)-1].alt = true
			}
		}
	}

	for i := 0; i < len(r); i++ {
		c := r[i]
		afterAnchor := anchorPrev
		anchorPrev = false

		if '\\' == c {
			emit, why, extra := normaliseEscape(at(i+1), at, i, inClass)
			if "" != why {
				return "", why
			}
			out.WriteString(emit)
			if !inClass && ('b' == at(i+1) || 'B' == at(i+1)) {
				anchorPrev = true
			}
			i += 1 + extra
			continue
		}

		// A POSIX class opener, anywhere: the form lives inside an
		// ordinary class (`[[:alpha:]]`), and refusing it everywhere is
		// one rule rather than two.
		if '[' == c && ':' == at(i+1) {
			return "", "a POSIX class ([:...:]), which JavaScript does not have"
		}

		if inClass {
			if ']' == c {
				inClass = false
			}
			out.WriteRune(c)
			continue
		}

		if '[' == c {
			// `[]` is a never-matching class in JavaScript and a parse
			// error in RE2; `[^]` is the same disagreement one along.
			first := at(i + 1)
			if '^' == first {
				first = at(i + 2)
			}
			if ']' == first {
				return "", "an empty character class, which RE2 refuses"
			}
			inClass = true
			out.WriteRune(c)
			continue
		}

		if '.' == c {
			out.WriteString(`[^\n]`)
			continue
		}

		if '(' == c {
			if '?' == at(i+1) {
				if ':' != at(i+2) {
					return "", "a (?...) group other than the non-capturing (?:"
				}
				out.WriteString("(?:")
				i += 2
			} else {
				out.WriteRune(c)
			}
			groups = append(groups, reGroup{})
			continue
		}

		if ')' == c {
			if 0 == len(groups) {
				return "", "an unbalanced group"
			}
			g := groups[len(groups)-1]
			groups = groups[:len(groups)-1]
			nx := at(i + 1)
			quantified := '*' == nx || '+' == nx || '?' == nx || '{' == nx
			if quantified && (g.q || g.alt) {
				which := "an alternation"
				if g.q {
					which = "another quantifier"
				}
				return "", "a quantifier applied to a group containing " + which +
					", which backtracks exponentially in JavaScript"
			}
			if g.q {
				mark(true)
			}
			if g.alt {
				mark(false)
			}
			out.WriteRune(c)
			continue
		}

		if '|' == c {
			mark(false)
			out.WriteRune(c)
			continue
		}

		if '*' == c || '+' == c || '?' == c || '{' == c {
			if afterAnchor {
				return "", "a quantifier applied to `^`, `$`, `\\b` or " +
					"`\\B`, which has nothing to repeat"
			}
			if '{' == c {
				why, end := repeatWhy(r, i)
				if "" != why {
					return "", why
				}
				repeatEnd = end
			}
			mark(true)
			out.WriteRune(c)
			continue
		}

		if '}' == c {
			if i != repeatEnd {
				return "", "a `}` that closes no counted quantifier, which " +
					"the two engines do not read the same way"
			}
			out.WriteRune(c)
			continue
		}

		out.WriteRune(c)
		anchorPrev = ('^' == c || '$' == c)
	}

	if inClass {
		return "", "an unterminated character class"
	}
	if 0 < len(groups) {
		return "", "an unclosed group"
	}

	return out.String(), ""
}

// ConstraintVal is immutable after construction: meets build NEW
// residuals, so clones may share one (clonePath copies the struct
// shallowly, like a ScalarKindVal).
type ConstraintVal struct {
	base
	domain string // "number", "string", or ""
	kind   Kind   // KindTop when unnarrowed; a numeric leaf otherwise
	lo, hi *constraintBound
	neqs   []*ScalarVal
	res    []constraintRe // accumulated patterns, sorted by source
	// count is the len() residual: itself a residual over the integer
	// domain, because the count atom reuses this same algebra
	// recursively. nil when the residual says nothing about length.
	count *ConstraintVal
	uniq  bool // members must be pairwise distinct (unique())
	// uniqBy: ... and distinct ON EACH OF THESE KEYS (unique(k)),
	// sorted and deduplicated.
	uniqBy []string
	// musts are Band B checks, kept in written order and never
	// simplified: each carries its own author message.
	musts []constraintMust
	// pending holds an atom whose arguments have not settled yet (G1
	// phase 4), until Unify has a Ctx to resolve them through. Never
	// present on a residual.
	pending *constraintPending
	// clash records a kind disagreement inside a len() argument. That
	// meet runs at construction, where there is no Ctx to fail through,
	// so emptiness carries the news instead.
	clash   bool
	invalid string // why-code when the atom's arguments were unusable
	// invalidWhy is the human half of a constraint_pattern refusal: which
	// construct put the pattern outside the portable subset. Injected
	// into the hint as {reason}; the TS twin carries the same string.
	invalidWhy string
}

const sizingCjo = 150000

func lateAtom(atom string) bool {
	return "length" == atom || "unique" == atom || "must" == atom
}

func (c *ConstraintVal) cjo() int {
	if nil != c.count || c.uniq || 0 < len(c.uniqBy) || 0 < len(c.musts) ||
		(nil != c.pending && lateAtom(c.pending.atom)) {
		return sizingCjo
	}
	return 50000
}

func (c *ConstraintVal) superior() Val { return top() }

// constraintAtoms are the funcSet members routed to newConstraint by
// the func-paren handler in lang.go.
var constraintAtoms = map[string]bool{
	"min": true, "max": true, "above": true, "below": true, "neq": true,
	"re": true, "length": true, "unique": true, "must": true,
}

// orderableScalar reports the algebra domain of a scalar: numeric
// leaves and strings have an order; booleans and null do not. NaN can
// never be constructed from source but is refused defensively.
func orderableScalar(v Val) (sv *ScalarVal, domain string) {
	s, ok := v.(*ScalarVal)
	if !ok {
		return nil, ""
	}
	switch s.kind {
	case KindInteger, KindBigInteger, KindBigDecimal:
		return s, "number"
	case KindFloat:
		if math.IsNaN(s.peg.(float64)) {
			return nil, ""
		}
		return s, "number"
	case KindString:
		return s, "string"
	case KindPath:
		return s, "string"
	}
	return nil, ""
}

// sameConstraintScalar is scalar identity — leaf AND value — with the
// value half decided exactly for numeric leaves.
func sameConstraintScalar(a, b *ScalarVal) bool {
	if KindPath == a.kind || KindPath == b.kind {
		return a.kind == b.kind && a.peg.(string) == b.peg.(string)
	}
	an := a.kind != KindString
	bn := b.kind != KindString
	if an && bn {
		return a.kind == b.kind && 0 == cmpNumeric(a, b)
	}
	if !an && !bn {
		return a.peg.(string) == b.peg.(string)
	}
	return false
}

// cmpConstraintVal is the domain-aware value comparison. Go string
// comparison is byte-wise UTF-8, which IS code-point order — the
// shared lexical rule (the TS side adapts; numcmp.ts cmpCodePoints).
func cmpConstraintVal(domain string, a, b *ScalarVal) int {
	if "number" == domain {
		return cmpNumeric(a, b)
	}
	return strings.Compare(a.peg.(string), b.peg.(string))
}

// newConstraint normalises one atom call into a residual. Arguments
// must be concrete orderable scalars in phase 1; reference-valued
// arguments are phase 4 (residuation).
func newConstraint(atom string, args []Val, sp int) *ConstraintVal {
	c := &ConstraintVal{kind: KindTop}
	c.site.sp = sp

	bad := func(why string) *ConstraintVal {
		c.invalid = why
		c.dc = DONE
		return c
	}

	args = atomArgs(atom, args)

	if "must" == atom {
		for _, a := range args {
			if holdsMove(a) {
				return bad("invalid-arg")
			}
		}
	}

	for _, a := range args {
		if DONE != a.Dc() {
			c.pending = &constraintPending{atom: atom, args: args}
			c.notdone()
			return c
		}
	}

	c.dc = DONE

	if "unique" == atom {
		if 0 == len(args) {
			c.uniq = true
			return c
		}
		sv, ok := args[0].(*ScalarVal)
		if 1 != len(args) || !ok || sv.kind != KindString {
			c.invalid = "invalid-arg"
			return c
		}
		c.uniqBy = []string{sv.peg.(string)}
		return c
	}

	if "must" == atom {
		if 2 != len(args) { //coverage:ignore parse-time arity guarantees two; see above
			return bad("arg")
		}
		msv, md := orderableScalar(args[1])
		if nil == msv || "string" != md || KindPath == msv.kind {
			// A message is a plain string, never a path (the TS twin's
			// stringLeaf test is strict).
			return bad("invalid-arg")
		}
		if holdsNil(args[0]) {
			return bad("invalid-arg")
		}
		// (An effectful argument is refused at construction, above: by
		// the time this arm sees a settled `move($.b)` the move has
		// already run.)
		c.musts = []constraintMust{{v: args[0], msg: msv}}
		return c
	}

	if "neq" == atom {
		if 0 == len(args) {
			return bad("arg")
		}
		neqs := make([]*ScalarVal, 0, len(args))
		for _, a := range args {
			sv, d := orderableScalar(a)
			if nil == sv || ("" != c.domain && d != c.domain) {
				return bad("invalid-arg")
			}
			c.domain = d
			neqs = append(neqs, sv)
		}
		c.neqs = dedupSortedNeqs(c.domain, neqs)
		return c
	}

	if 1 != len(args) {
		return bad("arg")
	}

	// `re` is the one atom whose argument is not an ORDER point: a
	// pattern is a membership test, so it takes the string domain
	// outright rather than inferring a domain from the argument's leaf.
	if "re" == atom {
		psv, pd := orderableScalar(args[0])
		if nil == psv || "string" != pd || KindPath == psv.kind {
			// A pattern is text, never a path (the TS twin's stringLeaf
			// test is strict), exactly as the must() message below.
			return bad("invalid-arg")
		}
		src := psv.peg.(string)
		norm, why := normaliseRe(src)
		if "" != why {
			c.invalidWhy = why
			return bad("constraint_pattern")
		}
		re, err := regexp.Compile(norm)
		if nil != err {
			c.invalidWhy = "not a valid pattern"
			return bad("constraint_pattern")
		}
		c.domain = "string"
		c.res = []constraintRe{{v: psv, src: src, norm: norm, re: re}}
		return c
	}

	if "length" == atom {
		arg := countArgState(args[0])
		if nil == arg {
			return bad("invalid-arg")
		}
		inner := meetCount(countBase(), arg)
		c.count = inner
		// `len(min(5)&max(3))` is unsatisfiable with no peer in sight,
		// so it is refused at composition time like any other empty meet.
		if stateEmpty(inner) {
			return bad("constraint")
		}
		return c
	}

	sv, d := orderableScalar(args[0])
	if nil == sv {
		return bad("invalid-arg")
	}
	c.domain = d

	open := "above" == atom || "below" == atom
	b := &constraintBound{v: sv, open: open}
	if "min" == atom || "above" == atom {
		c.lo = b
	} else {
		c.hi = b
	}
	return c
}

func (c *ConstraintVal) Unify(peer Val, ctx *Ctx) Val {
	if nil != c.pending {
		return c.settle(peer, ctx)
	}
	if "" != c.invalid {
		return makeNilErrFull(ctx, c.invalid, c, nil, "constrain", c.reasonDetails())
	}
	if nil == peer || isTop(peer) {
		return c
	}
	if peer.Nil() {
		return peer
	}
	if pc, ok := peer.(*ConstraintVal); ok {
		return c.meetConstraint(pc, ctx)
	}
	if pk, ok := peer.(*ScalarKindVal); ok {
		return c.meetKind(pk, ctx)
	}
	if ps, ok := peer.(*ScalarVal); ok {
		return c.admit(ps, ctx)
	}
	if pm, ok := peer.(*MapVal); ok {
		return c.admitContainer(pm, pm.optional, ctx, peer)
	}
	if pl, ok := peer.(*ListVal); ok {
		return c.admitContainer(pl, nil, ctx, peer)
	}
	//coverage:ignore-block no Val kind reaches this arm; see above
	return c.fail(ctx, peer)
}

func (c *ConstraintVal) settle(peer Val, ctx *Ctx) Val {
	settled := true
	args := make([]Val, 0, len(c.pending.args))
	for _, arg := range c.pending.args {
		next := arg
		if DONE != arg.Dc() {
			next = arg.Unify(top(), ctx)
		}
		settled = settled && DONE == next.Dc()
		args = append(args, next)
	}

	built := newConstraint(c.pending.atom, args, c.site.sp)
	built.path = cp(c.path)
	built.site.spu = c.site.spu
	built.site.url = c.site.url
	built.mtype = c.mtype
	built.mhide = c.mhide

	if settled {
		// The residual the atom always meant; the ordinary ladder now
		// meets it with the peer.
		return built.Unify(peer, ctx)
	}

	c.notdone()

	if nil == peer || isTop(peer) {
		return built
	}
	out := newConjunct([]Val{built, peer})
	out.path = cp(c.path)
	return out
}

func (c *ConstraintVal) checkMusts(peer Val, ctx *Ctx) Val {
	return c.checkMustsFinal(peer, ctx, true)
}

func (c *ConstraintVal) checkMustsFinal(peer Val, ctx *Ctx, final bool) Val {
	for _, m := range c.musts {
		trial := &Ctx{}
		if nil != ctx {
			t := *ctx
			t.err = nil
			trial = &t
		}
		trial.collect = true
		got := unite(trial, clonePath(m.v, c.path), clonePath(peer, c.path))
		if con, bag, ok := sizingResidue(got); ok {
			if !final {
				continue
			}
			got = con.settleContainer(bag, trial)
		}
		if (nil != got && got.Nil()) || 0 < len(trial.err) {
			pcanon := ""
			if nil != peer {
				pcanon = peer.Canon()
			}
			return makeNilErrFull(ctx, "must", c, peer, "", map[string]string{
				"message":  m.msg.peg.(string),
				"expected": m.v.Canon(),
				"actual":   pcanon,
			})
		}
	}
	return nil
}

// admit checks membership: the peer scalar passes every part of the
// residual, or the meet is a located conflict.
func (c *ConstraintVal) admit(peer *ScalarVal, ctx *Ctx) Val {
	// No scalar has members, so a `unique()` residual admits none -- and
	// neither does a `unique(k)` one, for the same reason.
	if c.uniq || 0 < len(c.uniqBy) {
		return c.fail(ctx, peer)
	}
	if !stateAdmits(c, peer) {
		return c.fail(ctx, peer)
	}
	if nil != c.count {
		if KindString != peer.kind && KindPath != peer.kind {
			return c.fail(ctx, peer)
		}
		n := utf8.RuneCountInString(peer.peg.(string))
		if !stateAdmits(c.count, countVal(n)) {
			return c.fail(ctx, peer)
		}
	}
	if bad := c.checkMusts(peer, ctx); nil != bad {
		return bad
	}
	return peer
}

func (c *ConstraintVal) settleContainer(bag Val, ctx *Ctx) Val {
	var optional []string
	if m, ok := bag.(*MapVal); ok {
		optional = m.optional
	}
	return c.admitContainerFinal(bag, optional, ctx, bag, true)
}

func (c *ConstraintVal) admitContainer(
	bag Val, optional []string, ctx *Ctx, peer Val) Val {
	return c.admitContainerFinal(bag, optional, ctx, peer, false)
}

func (c *ConstraintVal) admitContainerFinal(
	bag Val, optional []string, ctx *Ctx, peer Val, final bool) Val {
	// A scalar-domain residual has no reading over a container.
	if "" != c.domain {
		return c.fail(ctx, peer)
	}
	// Not yet settled: the container, or an optional child, may still
	// resolve, so the member set is not final. Defer rather than decide
	// — the same discipline OpBaseVal follows for a non-concrete operand.
	if !containerSettled(bag) {
		c.dc = 0
		return newConjunct([]Val{c, peer})
	}

	if bad := c.checkMustsFinal(peer, ctx, final); nil != bad {
		return bad
	}

	if !c.uniq && 0 == len(c.uniqBy) && nil == c.count {
		if final || 0 == len(c.musts) {
			return peer
		}
		return c.hold(peer)
	}

	members := emittedMembers(bag, optional, ctx)
	if nil == members {
		if final {
			return peer
		}
		return c.hold(peer)
	}

	n := len(members)
	if nil != c.count {
		if nil != c.count.hi {
			noLo := *c.count
			noLo.lo = nil
			if !stateAdmits(&noLo, countVal(n)) {
				return c.fail(ctx, peer)
			}
		}
		if 0 < len(c.count.neqs) {
			only := *c.count
			only.lo = nil
			only.hi = nil
			if !stateAdmits(&only, countVal(n)) {
				return c.fail(ctx, peer)
			}
		}
		// The provisional half, decided only when nothing more can
		// arrive.
		if final && !stateAdmits(c.count, countVal(n)) {
			return c.fail(ctx, peer)
		}
	}

	if c.uniq {
		seen := map[string]bool{}
		for _, m := range members {
			key := m.Canon()
			if seen[key] {
				return c.fail(ctx, peer)
			}
			seen[key] = true
		}
	}

	for _, field := range c.uniqBy {
		seen := map[string]bool{}
		for _, m := range members {
			mv, ok := m.(*MapVal)
			if !ok {
				return c.fail(ctx, peer)
			}
			at, has := mv.peg[field]
			if !has {
				return c.fail(ctx, peer)
			}
			key := at.Canon()
			if seen[key] {
				return c.fail(ctx, peer)
			}
			seen[key] = true
		}
	}

	// WHAT IS LEFT IS PROVISIONAL, so the atom stays on the value. A
	// lower bound already met is the one reading that cannot be undone,
	// and an atom holding nothing else is spent: that is when it goes.
	spent := final || (0 == len(c.musts) && !c.uniq && 0 == len(c.uniqBy) &&
		(nil == c.count ||
			(nil == c.count.hi && 0 == len(c.count.neqs) &&
				stateAdmits(c.count, countVal(n)))))
	if spent {
		return peer
	}
	return c.hold(peer)
}

func (c *ConstraintVal) hold(peer Val) Val {
	c.dc = DONE
	held := newConjunct([]Val{c, peer})
	held.dc = DONE
	return held
}

func (c *ConstraintVal) meetKind(peer *ScalarKindVal, ctx *Ctx) Val {
	switch peer.kind {
	case KindNumber, KindString:
		d := "number"
		if KindString == peer.kind {
			d = "string"
		}
		if d == c.domain {
			return c
		}
		if "" != c.domain {
			return c.fail(ctx, peer)
		}
		merged := c.cloneState()
		merged.domain = d
		return c.finish(merged, ctx, peer)
	case KindInteger, KindFloat, KindBigInteger, KindBigDecimal:
		if "string" == c.domain {
			return c.fail(ctx, peer)
		}
		if KindTop != c.kind && c.kind != peer.kind {
			return c.fail(ctx, peer)
		}
		merged := c.cloneState()
		merged.domain = "number"
		merged.kind = peer.kind
		return c.finish(merged, ctx, peer)
	}
	return c.fail(ctx, peer)
}

// meetConstraint: interval intersection, exclusion union, kind union —
// then the eager emptiness rules.
func (c *ConstraintVal) meetConstraint(peer *ConstraintVal, ctx *Ctx) Val {
	if "" != peer.invalid {
		return makeNilErrFull(ctx, peer.invalid, peer, nil, "constrain", peer.reasonDetails())
	}
	if "" != c.domain && "" != peer.domain && c.domain != peer.domain {
		return c.fail(ctx, peer)
	}
	if KindTop != c.kind && KindTop != peer.kind && c.kind != peer.kind {
		return c.fail(ctx, peer)
	}

	merged := c.cloneState()
	if "" == merged.domain {
		merged.domain = peer.domain
	}
	if KindTop == merged.kind {
		merged.kind = peer.kind
	}
	merged.lo = tighterBound(merged.domain, c.lo, peer.lo, true)
	merged.hi = tighterBound(merged.domain, c.hi, peer.hi, false)
	merged.neqs = dedupSortedNeqs(merged.domain, append(append([]*ScalarVal{}, c.neqs...), peer.neqs...))
	merged.res = dedupSortedRes(append(append([]constraintRe{}, c.res...), peer.res...))
	// `len(c1) & len(c2)` is `len(c1 & c2)`: the count atom reuses the
	// numeric algebra recursively, over the counts rather than the
	// values.
	switch {
	case nil == c.count:
		merged.count = peer.count
	case nil == peer.count:
		merged.count = c.count
	default:
		merged.count = meetCount(c.count, peer.count)
	}
	// `unique()` is idempotent: two of them are one.
	merged.uniq = c.uniq || peer.uniq
	merged.uniqBy = mergeUniqBy(c.uniqBy, peer.uniqBy)
	merged.musts = append(append([]constraintMust{}, c.musts...), peer.musts...)

	return c.finish(merged, ctx, peer)
}

// finish applies the eager emptiness rules and builds the merged
// residual (a NEW value; residuals are immutable).
func (c *ConstraintVal) finish(state *ConstraintVal, ctx *Ctx, peer Val) Val {
	if stateEmpty(state) {
		return c.fail(ctx, peer)
	}

	state.dc = DONE
	state.path = cp(c.path)
	state.site.sp = c.site.sp
	state.site.url = c.site.url
	return state
}

func (c *ConstraintVal) fail(ctx *Ctx, peer Val) Val {
	pcanon := ""
	if nil != peer {
		pcanon = peer.Canon()
	}
	return makeNilErrFull(ctx, "constraint", c, peer, "", map[string]string{
		"expected": c.Canon(),
		"actual":   pcanon,
	})
}

// cloneState is a fresh residual carrying this one's fields (bounds
// and exclusions share pointers; they are immutable).
func (c *ConstraintVal) cloneState() *ConstraintVal {
	out := &ConstraintVal{
		domain:  c.domain,
		kind:    c.kind,
		lo:      c.lo,
		hi:      c.hi,
		neqs:    append([]*ScalarVal{}, c.neqs...),
		res:     append([]constraintRe{}, c.res...),
		count:   c.count,
		uniq:    c.uniq,
		uniqBy:  append([]string{}, c.uniqBy...),
		musts:   append([]constraintMust{}, c.musts...),
		clash:   c.clash,
		invalid: c.invalid,
	}
	out.invalidWhy = c.invalidWhy
	out.dc = DONE
	return out
}

// reasonDetails carries the portable-subset refusal reason into the
// hint as {reason}; every other invalid code has no detail to inject.
func (c *ConstraintVal) reasonDetails() map[string]string {
	if "" == c.invalidWhy {
		return nil
	}
	return map[string]string{"reason": c.invalidWhy}
}

func dedupSortedRes(res []constraintRe) []constraintRe {
	sorted := append([]constraintRe{}, res...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].src < sorted[j].src
	})
	out := []constraintRe{}
	for _, r := range sorted {
		if 0 == len(out) || out[len(out)-1].src != r.src {
			out = append(out, r)
		}
	}
	return out
}

// Canon renders the fixed canonical atom order: kind, lower bound,
// upper bound, neq (arguments sorted), re, length, unique. Reparses to a
// conjunct of atoms that normalises back to this exact residual.
func (c *ConstraintVal) Canon() string {
	if nil != c.pending {
		// A pending atom has no residual yet, so Canon renders the call
		// as written -- the same shape FuncVal renders while deferring.
		as := make([]string, len(c.pending.args))
		for i, a := range c.pending.args {
			as[i] = a.Canon()
		}
		return c.pending.atom + "(" + strings.Join(as, ",") + ")"
	}
	parts := []string{}
	if KindTop != c.kind {
		parts = append(parts, c.kind.String())
	} else if "string" == c.domain &&
		nil == c.lo && nil == c.hi && 0 == len(c.neqs) && 0 == len(c.res) {
		parts = append(parts, "string")
	}
	if nil != c.lo {
		a := "min("
		if c.lo.open {
			a = "above("
		}
		parts = append(parts, a+c.lo.v.Canon()+")")
	}
	if nil != c.hi {
		a := "max("
		if c.hi.open {
			a = "below("
		}
		parts = append(parts, a+c.hi.v.Canon()+")")
	}
	if 0 < len(c.neqs) {
		ns := make([]string, len(c.neqs))
		for i, n := range c.neqs {
			ns[i] = n.Canon()
		}
		parts = append(parts, "neq("+strings.Join(ns, ",")+")")
	}
	for _, r := range c.res {
		parts = append(parts, "re("+r.v.Canon()+")")
	}
	if nil != c.count {
		parts = append(parts, "length("+c.count.Canon()+")")
	}
	if c.uniq {
		parts = append(parts, "unique()")
	}
	for _, key := range c.uniqBy {
		parts = append(parts, "unique("+jsonString(key)+")")
	}
	for _, m := range c.musts {
		parts = append(parts, "must("+m.v.Canon()+","+m.msg.Canon()+")")
	}
	if 0 == len(parts) {
		// Raw invalid atom: render the call so the error frame shows it.
		return "constraint()"
	}
	return strings.Join(parts, "&")
}

func (c *ConstraintVal) Gen(ctx *Ctx) (any, error) {
	// A residual constraint is not a concrete value (mirrors the TS
	// FeatureVal no_gen family; the bag level reports mapval_no_gen).
	return nil, residueErr(ctx, c, "no_gen")
}

func atomArgs(atom string, args []Val) []Val {
	if ("neq" == atom || "must" == atom) && 1 == len(args) {
		if lv, ok := args[0].(*ListVal); ok {
			return lv.peg
		}
	}
	return args
}

func holdsNil(v Val) bool {
	if v.Nil() {
		return true
	}
	switch t := v.(type) {
	case *MapVal:
		for _, child := range t.peg {
			if holdsNil(child) {
				return true
			}
		}
	case *ListVal:
		for _, child := range t.peg {
			if holdsNil(child) {
				return true
			}
		}
	case *DisjunctVal:
		for _, child := range t.peg {
			if holdsNil(child) {
				return true
			}
		}
	}
	return false
}

func holdsMove(v Val) bool {
	if f, ok := v.(*FuncVal); ok {
		if "move" == f.name {
			return true
		}
		for _, arg := range f.peg {
			if holdsMove(arg) {
				return true
			}
		}
	}
	switch t := v.(type) {
	case *MapVal:
		for _, child := range t.peg {
			if holdsMove(child) {
				return true
			}
		}
	case *ListVal:
		for _, child := range t.peg {
			if holdsMove(child) {
				return true
			}
		}
	case *DisjunctVal:
		for _, child := range t.peg {
			if holdsMove(child) {
				return true
			}
		}
	}
	return false
}

func constraintStateSubsumes(g, s *ConstraintVal) (bool, bool) {
	if 0 < len(g.musts) {
		return false, true
	}
	if "" != g.domain && g.domain != s.domain {
		return false, false
	}
	if KindTop != g.kind && g.kind != s.kind {
		return false, false
	}
	d := g.domain
	if "" == d {
		d = s.domain
	}
	if nil != g.lo {
		if nil == s.lo || "" == d {
			return false, false
		}
		c := cmpConstraintVal(d, g.lo.v, s.lo.v)
		if 0 < c || (0 == c && g.lo.open && !s.lo.open) {
			return false, false
		}
	}
	if nil != g.hi {
		if nil == s.hi || "" == d {
			return false, false
		}
		c := cmpConstraintVal(d, g.hi.v, s.hi.v)
		if c < 0 || (0 == c && g.hi.open && !s.hi.open) {
			return false, false
		}
	}
	// Excluding FEWER values is more general: every general exclusion
	// must be excluded by the specific too.
	for _, n := range g.neqs {
		found := false
		for _, m := range s.neqs {
			if sameConstraintScalar(n, m) {
				found = true
				break
			}
		}
		if !found {
			return false, false
		}
	}
	// Patterns compare as TEXT sets (the sanctioned approximation).
	for _, r := range g.res {
		found := false
		for _, q := range s.res {
			if q.src == r.src {
				found = true
				break
			}
		}
		if !found {
			return false, false
		}
	}
	// ... and a general `unique(k)` needs the same key on the specific
	// side: distinctness on `port` says nothing about distinctness on
	// `name`.
	for _, k := range g.uniqBy {
		if !containsString(s.uniqBy, k) {
			return false, false
		}
	}
	if g.uniq && !s.uniq {
		return false, false
	}
	// The count atom reuses this same table over the integer domain.
	if nil != g.count {
		if nil == s.count {
			return false, false
		}
		return constraintStateSubsumes(g.count, s.count)
	}
	return true, false
}

func constraintAdmitsScalarQ(g *ConstraintVal, scalar *ScalarVal) (bool, bool) {
	if 0 < len(g.musts) {
		return false, true
	}
	if g.uniq || 0 < len(g.uniqBy) || nil != g.count {
		return false, false
	}
	return stateAdmits(g, scalar), false
}

func stateAdmits(s *ConstraintVal, peer *ScalarVal) bool {
	sv, d := orderableScalar(peer)
	if nil == sv {
		// Booleans and null: no order, no length and no members.
		return false
	}
	if "" == s.domain {
		// A sizing residual has no domain, and admits any scalar the
		// sizing atoms can then rule on.
		return true
	}
	if d != s.domain {
		return false
	}
	if KindTop != s.kind && peer.kind != s.kind {
		return false
	}
	if nil != s.lo {
		cv := cmpConstraintVal(s.domain, peer, s.lo.v)
		if cv < 0 || (0 == cv && s.lo.open) {
			return false
		}
	}
	if nil != s.hi {
		cv := cmpConstraintVal(s.domain, peer, s.hi.v)
		if cv > 0 || (0 == cv && s.hi.open) {
			return false
		}
	}
	for _, n := range s.neqs {
		if sameConstraintScalar(peer, n) {
			return false
		}
	}
	for _, r := range s.res {
		if !r.re.MatchString(peer.peg.(string)) {
			return false
		}
	}
	return true
}

func stateEmpty(s *ConstraintVal) bool {
	if s.clash {
		return true
	}

	d := s.domain

	// Empty interval.
	if nil != s.lo && nil != s.hi {
		cv := cmpConstraintVal(d, s.hi.v, s.lo.v)
		if cv < 0 || (0 == cv && (s.lo.open || s.hi.open)) {
			return true
		}
	}

	integral := KindInteger == s.kind || KindBigInteger == s.kind

	if integral && nil != s.lo && nil != s.hi {
		lo := scaledOfNumeric(s.lo.v)
		hi := scaledOfNumeric(s.hi.v)
		if 0 == lo.inf && 0 == hi.inf {
			n := scaledFloorBig(lo)
			if !scaledIsIntegral(lo) || s.lo.open {
				n.Add(n, oneBig)
			}
			m := scaledFloorBig(hi)
			if s.hi.open && scaledIsIntegral(hi) {
				m.Sub(m, oneBig)
			}
			if m.Cmp(n) < 0 {
				return true
			}
		}
	}

	if KindTop != s.kind && nil != s.lo && nil != s.hi &&
		!s.lo.open && !s.hi.open &&
		0 == cmpConstraintVal(d, s.lo.v, s.hi.v) {
		for _, n := range s.neqs {
			if n.kind == s.kind && 0 == cmpNumeric(n, s.lo.v) {
				return true
			}
		}
	}

	if "number" == d && (nil != s.count || s.uniq || 0 < len(s.uniqBy)) {
		return true
	}
	if "string" == d && (s.uniq || 0 < len(s.uniqBy)) {
		return true
	}

	// An empty count residual makes the whole thing empty: no container
	// and no string has a length no integer can take.
	if nil != s.count && stateEmpty(s.count) {
		return true
	}

	return false
}

func countBase() *ConstraintVal {
	return &ConstraintVal{
		domain: "number",
		kind:   KindInteger,
		lo:     &constraintBound{v: countVal(0), open: false},
	}
}

// countVal renders a count as a Val, so the count residual can be
// applied by exactly the same membership function as any other numeric
// residual.
func countVal(n int) *ScalarVal {
	return newInteger(int64(n))
}

func meetCount(a, b *ConstraintVal) *ConstraintVal {
	kind := a.kind
	out := &ConstraintVal{
		domain: "number",
		kind:   kind,
		lo:     tighterBound("number", a.lo, b.lo, true),
		hi:     tighterBound("number", a.hi, b.hi, false),
		neqs: dedupSortedNeqs("number",
			append(append([]*ScalarVal{}, a.neqs...), b.neqs...)),
		clash: a.clash || b.clash ||
			(KindTop != a.kind && KindTop != b.kind && a.kind != b.kind),
	}
	out.dc = DONE
	return out
}

func countArgState(arg Val) *ConstraintVal {
	if sv, d := orderableScalar(arg); nil != sv && "number" == d {
		out := &ConstraintVal{
			domain: "number",
			lo:     &constraintBound{v: sv, open: false},
			hi:     &constraintBound{v: sv, open: false},
		}
		out.dc = DONE
		return out
	}

	if cv, ok := arg.(*ConstraintVal); ok {
		// A pattern, a sizing atom or a string bound inside a count is
		// not a count constraint at all, and neither is a broken one.
		if "" != cv.invalid || 0 < len(cv.res) || cv.uniq ||
			0 < len(cv.uniqBy) || nil != cv.count ||
			"number" != cv.domain {
			return nil
		}
		out := &ConstraintVal{
			domain: "number",
			kind:   cv.kind,
			lo:     cv.lo,
			hi:     cv.hi,
			neqs:   append([]*ScalarVal{}, cv.neqs...),
		}
		out.dc = DONE
		return out
	}

	if kv, ok := arg.(*ScalarKindVal); ok {
		switch kv.kind {
		case KindNumber:
			out := &ConstraintVal{domain: "number"}
			out.dc = DONE
			return out
		case KindInteger, KindFloat, KindBigInteger, KindBigDecimal:
			out := &ConstraintVal{domain: "number", kind: kv.kind}
			out.dc = DONE
			return out
		}
		return nil
	}

	return nil
}

func containerSettled(bag Val) bool {
	// The bag's OWN done-counter is enough: MapVal.Unify/ListVal.Unify
	// set it from the AND over their children, so an unsettled child
	// already leaves the bag unsettled. Walking the children again would
	// be a second, drifting copy of that rule.
	return DONE == bag.Dc()
}

// bagChildren lists a map's children in code-point key order (Go keeps
// insertion order in `keys`, JavaScript hoists integer-like keys, and a
// duplicate report must name the same pair in both) or a list's in
// index order.
func bagChildren(bag Val) []Val {
	if m, ok := bag.(*MapVal); ok {
		keys := append([]string(nil), m.keys...)
		sort.Strings(keys)
		out := make([]Val, 0, len(keys))
		for _, k := range keys {
			out = append(out, m.peg[k])
		}
		return out
	}
	return bag.(*ListVal).peg
}

// bagKeys lists a bag's member keys in the same order bagChildren lists
// its children, so the optional test can be applied per child.
func bagKeys(bag Val) []string {
	if m, ok := bag.(*MapVal); ok {
		keys := append([]string(nil), m.keys...)
		sort.Strings(keys)
		return keys
	}
	return make([]string, len(bag.(*ListVal).peg))
}

func emittedMembers(bag Val, optional []string, ctx *Ctx) []Val {
	children := bagChildren(bag)
	keys := bagKeys(bag)
	out := []Val{}

	for i, child := range children {
		if child.markedType() || child.markedHide() {
			continue
		}

		opt := false
		for _, o := range optional {
			if o == keys[i] {
				opt = true
				break
			}
		}

		if !genable(child) {
			if opt {
				continue
			}
			return nil
		}

		// Generation decides in an isolated collect context, so an
		// unresolved inner value neither raises here nor pollutes the
		// caller's errors — the same isolation MapVal.Gen uses for an
		// optional child.
		gctx := &Ctx{}
		if nil != ctx {
			c2 := *ctx
			c2.err = nil
			gctx = &c2
		}
		gctx.collect = true

		cv, err := child.Gen(gctx)
		if nil != err || nil == cv {
			// A child that generates nothing contributes nothing --
			// except a JSON null, which is a member like any other.
			if nil == err && nil == cv && gensNull(ctx, child) {
				out = append(out, child)
			}
			continue
		}
		if opt && isEmptyGen(cv) {
			continue
		}

		out = append(out, child)
	}

	return out
}

func tighterBound(domain string, a, b *constraintBound, lower bool) *constraintBound {
	if nil == a {
		return b
	}
	if nil == b {
		return a
	}
	cv := cmpConstraintVal(domain, a.v, b.v)
	if 0 != cv {
		if (lower && 0 < cv) || (!lower && cv < 0) {
			return a
		}
		return b
	}
	if a.open != b.open {
		if a.open {
			return a
		}
		return b
	}
	if "number" == domain && towerRank(b.v) < towerRank(a.v) {
		return b
	}
	return a
}

// dedupSortedNeqs sorts excluded scalars for canon (numeric: by point
// then tower rank; string: code-point order) and drops identity
// duplicates.
func dedupSortedNeqs(domain string, neqs []*ScalarVal) []*ScalarVal {
	sorted := append([]*ScalarVal{}, neqs...)
	sort.SliceStable(sorted, func(i, j int) bool {
		cv := cmpConstraintVal(domain, sorted[i], sorted[j])
		if 0 != cv {
			return cv < 0
		}
		return "number" == domain && towerRank(sorted[i]) < towerRank(sorted[j])
	})
	out := []*ScalarVal{}
	for _, n := range sorted {
		if 0 == len(out) || !sameConstraintScalar(out[len(out)-1], n) {
			out = append(out, n)
		}
	}
	return out
}

func mergeUniqBy(a, b []string) []string {
	if 0 == len(a) && 0 == len(b) {
		return nil
	}
	seen := map[string]bool{}
	out := []string{}
	for _, k := range append(append([]string{}, a...), b...) {
		if !seen[k] {
			seen[k] = true
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

func containsString(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}

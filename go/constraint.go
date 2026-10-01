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

// constraintNof is a count of trial schemas that must admit the settled
// peer (nof()).
type constraintNof struct {
	count *ConstraintVal // over the integers, as len()'s count is
	cs    []Val          // canon-sorted, and never deduplicated
}

type constraintWhen struct {
	c, t, e Val // e is nil where no else branch was written
}

type constraintContains struct {
	c     Val            // the trial schema a member must meet
	count *ConstraintVal // over the integers, at least one unless written
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
	mults  []*ScalarVal   // divisors, each a positive number (multiple())
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
	// nofs are Band B counts, canon-sorted, each canon once.
	nofs []constraintNof
	// whens are Band B conditionals, canon-sorted, each canon once.
	whens []constraintWhen
	// contains are member counts, canon-sorted, each canon once.
	contains []constraintContains
	// pending holds an atom whose arguments have not settled yet (G1
	// phase 4), until Unify has a Ctx to resolve them through. Never
	// present on a residual.
	pending *constraintPending
	// clash records a kind disagreement inside a len() argument. That
	// meet runs at construction, where there is no Ctx to fail through,
	// so emptiness carries the news instead.
	clash   bool
	invalid string // why-code when the atom's arguments were unusable
	// nonEmpty met `string`, which refuses ""; emptyOk met `empty()`.
	nonEmpty bool
	emptyOk  bool
	// pathKind met `path`, which shares string's domain but not its kind.
	pathKind bool
	// invalidWhy is the human half of a constraint_pattern refusal: which
	// construct put the pattern outside the portable subset. Injected
	// into the hint as {reason}; the TS twin carries the same string.
	invalidWhy string
}

const sizingCjo = 150000

func lateAtom(atom string) bool {
	return "len" == atom || "unique" == atom || "contains" == atom || bandB[atom]
}

var bandB = map[string]bool{"must": true, "nof": true, "when": true}

// trialAtoms are the atoms whose arguments are trial schemas, which may
// not move.
var trialAtoms = map[string]bool{"must": true, "nof": true, "when": true, "contains": true}

func (c *ConstraintVal) bandBs() int {
	return len(c.musts) + len(c.nofs) + len(c.whens)
}

func (c *ConstraintVal) cjo() int {
	if nil != c.count || c.uniq || 0 < len(c.uniqBy) || 0 < c.bandBs()+len(c.contains) ||
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
	"re": true, "len": true, "unique": true, "must": true, "multiple": true,
	"nof": true, "when": true, "contains": true,
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

	if trialAtoms[atom] {
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

	if "nof" == atom {
		arg := countArgState(args[0])
		if nil == arg {
			return bad("invalid-arg")
		}
		count := meetCount(countBase(), arg)
		if stateEmpty(count) {
			return bad("constraint")
		}
		c.nofs = []constraintNof{{count: count, cs: canonSorted(args[1:])}}
		return c
	}

	if "contains" == atom {
		arg := atLeastOne()
		if 2 == len(args) {
			arg = countArgState(args[1])
		}
		if nil == arg {
			return bad("invalid-arg")
		}
		count := meetCount(countBase(), arg)
		if stateEmpty(count) {
			return bad("constraint")
		}
		c.contains = []constraintContains{{c: args[0], count: count}}
		return c
	}

	if "when" == atom {
		w := constraintWhen{c: args[0], t: args[1]}
		if 3 == len(args) {
			w.e = args[2]
		}
		c.whens = []constraintWhen{w}
		return c
	}

	if "neq" == atom {
		if 0 == len(args) {
			return bad("arg")
		}
		neqs := make([]*ScalarVal, 0, len(args))
		// The domain settles only once every argument agrees, so an
		// invalid call leaves none behind: its canon is the TS twin's.
		domain := ""
		for _, a := range args {
			sv, d := orderableScalar(a)
			if nil == sv || ("" != domain && d != domain) {
				return bad("invalid-arg")
			}
			domain = d
			neqs = append(neqs, sv)
		}
		c.domain = domain
		c.neqs = dedupSortedNeqs(c.domain, neqs)
		return c
	}

	if 1 != len(args) {
		return bad("arg")
	}

	if "multiple" == atom {
		sv, d := orderableScalar(args[0])
		if nil == sv || "number" != d || 0 >= scaledOfShown(sv).unscaled.Sign() {
			return bad("invalid-arg")
		}
		c.domain = "number"
		c.mults = []*ScalarVal{sv}
		return c
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

	if "len" == atom {
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
	switch peer.(type) {
	case *MapKindVal, *ListKindVal:
		if "" != c.domain {
			return c.fail(ctx, peer)
		}
		return newConjunct([]Val{c, peer})
	}
	//coverage:ignore-block no Val kind reaches this arm; see above
	return c.fail(ctx, peer)
}

func (c *ConstraintVal) settle(peer Val, ctx *Ctx) Val {
	settled := true
	args := make([]Val, 0, len(c.pending.args))
	for i, arg := range c.pending.args {
		next := arg
		if ("nof" == c.pending.atom && 0 < i) || "when" == c.pending.atom ||
			("contains" == c.pending.atom && 0 == i) {
			next = trialArg(ctx, arg)
		} else if DONE != arg.Dc() {
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
	if c.uniq || 0 < len(c.uniqBy)+len(c.contains) {
		return c.fail(ctx, peer)
	}
	if !stateAdmits(c, peer) ||
		(c.nonEmpty && KindPath == peer.kind) || (c.pathKind && KindPath != peer.kind) {
		return c.fail(ctx, peer)
	}
	if c.nonEmpty {
		peer = peer.withNonEmpty()
	}
	if c.emptyOk {
		peer = peer.withEmpty()
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
	if bad := c.checkNofs(peer, ctx); nil != bad {
		return bad
	}
	if bad := c.checkWhens(peer, ctx); nil != bad {
		return bad
	}
	return peer
}

// checkWhens holds the peer to the branch its condition picks; a branch
// not written passes.
func (c *ConstraintVal) checkWhens(peer Val, ctx *Ctx) Val {
	if 0 == len(c.whens) {
		return nil
	}
	own, ok := ownJSON(peer, ctx, c.path)
	if !ok {
		return nil
	}
	for _, w := range c.whens {
		holds := admitsSettled(ctx, w.c, peer, own, c.path)
		branch, taken, said := w.e, "else", "does not admit"
		if holds {
			branch, taken, said = w.t, "then", "admits"
		}
		if nil != branch && !admitsSettled(ctx, branch, peer, own, c.path) {
			return makeNilErrFull(ctx, "when", c, peer, "", map[string]string{
				"expected":  whenCanon(w),
				"actual":    peer.Canon(),
				"branch":    taken,
				"condition": said,
			})
		}
	}
	return nil
}

// checkNofs tries every branch against the settled peer: the number
// that admit it must be one the count admits.
func (c *ConstraintVal) checkNofs(peer Val, ctx *Ctx) Val {
	if 0 == len(c.nofs) {
		return nil
	}
	own, ok := ownJSON(peer, ctx, c.path)
	if !ok {
		return nil
	}
	for _, n := range c.nofs {
		k := 0
		said := make([]string, len(n.cs))
		for i, b := range n.cs {
			said[i] = b.Canon() + " refuses"
			if admitsSettled(ctx, b, peer, own, c.path) {
				k++
				said[i] = b.Canon() + " admits"
			}
		}
		if !stateAdmits(n.count, countVal(k)) {
			return makeNilErrFull(ctx, "nof", c, peer, "", map[string]string{
				"expected": nofCanon(n),
				"actual":   peer.Canon(),
				"count":    countCanon(n.count),
				"admitted": strconv.Itoa(k),
				"branches": strings.Join(said, "; "),
			})
		}
	}
	return nil
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
	if final {
		if bad := c.checkNofs(peer, ctx); nil != bad {
			return bad
		}
		if bad := c.checkWhens(peer, ctx); nil != bad {
			return bad
		}
	}

	if !c.uniq && 0 == len(c.uniqBy)+len(c.contains) && nil == c.count {
		if final || 0 == c.bandBs() {
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
		if 0 < len(c.count.neqs)+len(c.count.mults) {
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

	for _, k := range c.contains {
		matched := countVal(len(containsMatches(ctx, k, members, c.path)))
		noLo := *k.count
		noLo.lo = nil
		only := noLo
		only.hi = nil
		if (nil != k.count.hi && !stateAdmits(&noLo, matched)) ||
			(0 < len(k.count.neqs)+len(k.count.mults) && !stateAdmits(&only, matched)) ||
			(final && !stateAdmits(k.count, matched)) {
			return c.fail(ctx, peer)
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
	spent := final || (0 == c.bandBs()+len(c.contains) && !c.uniq && 0 == len(c.uniqBy) &&
		(nil == c.count ||
			(nil == c.count.hi && 0 == len(c.count.neqs)+len(c.count.mults) &&
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
	if KindPath == peer.kind {
		if c.emptyOk {
			return makeNilErr(ctx, "empty_domain", peer, c)
		}
		if "number" == c.domain || c.nonEmpty {
			return c.fail(ctx, peer)
		}
		if c.pathKind {
			return c
		}
		merged := c.cloneState()
		merged.domain = "string"
		merged.pathKind = true
		return c.finish(merged, ctx, peer)
	}
	if KindString == peer.kind && c.pathKind {
		return c.fail(ctx, peer)
	}
	switch peer.kind {
	case KindNumber, KindString:
		d := "number"
		if KindString == peer.kind {
			d = "string"
		}
		nonEmpty := c.nonEmpty || KindString == peer.kind
		emptyOk := c.emptyOk || peer.emptyOk
		if d == c.domain && nonEmpty == c.nonEmpty && emptyOk == c.emptyOk {
			return c
		}
		if "" != c.domain && d != c.domain {
			return c.fail(ctx, peer)
		}
		merged := c.cloneState()
		merged.domain = d
		merged.nonEmpty = nonEmpty
		merged.emptyOk = emptyOk
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
	if (c.pathKind && peer.nonEmpty) || (c.nonEmpty && peer.pathKind) {
		return c.fail(ctx, peer)
	}
	if (c.pathKind && peer.emptyOk) || (c.emptyOk && peer.pathKind) {
		return makeNilErr(ctx, "empty_domain", peer, c)
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
	merged.mults = dedupMults(append(append([]*ScalarVal{}, c.mults...), peer.mults...))
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
	merged.nofs = mergeNofs(append(append([]constraintNof{}, c.nofs...), peer.nofs...))
	merged.whens = mergeWhens(append(append([]constraintWhen{}, c.whens...), peer.whens...))
	merged.contains = mergeContains(append(append([]constraintContains{}, c.contains...), peer.contains...))
	merged.nonEmpty = c.nonEmpty || peer.nonEmpty
	merged.emptyOk = c.emptyOk || peer.emptyOk
	merged.pathKind = c.pathKind || peer.pathKind

	return c.finish(merged, ctx, peer)
}

// allowEmpty is the meet with `empty()`.
func (c *ConstraintVal) allowEmpty(ctx *Ctx, peer Val) Val {
	if "number" == c.domain || KindTop != c.kind || c.pathKind {
		return makeNilErr(ctx, "empty_domain", peer, c)
	}
	if c.emptyOk && "string" == c.domain {
		return c
	}
	merged := c.cloneState()
	merged.domain = "string"
	merged.emptyOk = true
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
	// The whole site, so a report frames the residual at its atom.
	state.site.sp = c.site.sp
	state.site.spu = c.site.spu
	state.site.url = c.site.url
	state.site.src = c.site.src
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
		mults:   append([]*ScalarVal{}, c.mults...),
		res:     append([]constraintRe{}, c.res...),
		count:   c.count,
		uniq:    c.uniq,
		uniqBy:  append([]string{}, c.uniqBy...),
		musts:   append([]constraintMust{}, c.musts...),
		nofs:    append([]constraintNof{}, c.nofs...),
		whens:   append([]constraintWhen{}, c.whens...),
		clash:   c.clash,
		invalid: c.invalid,
	}
	out.invalidWhy = c.invalidWhy
	out.contains = append([]constraintContains{}, c.contains...)
	out.nonEmpty = c.nonEmpty
	out.emptyOk = c.emptyOk
	out.pathKind = c.pathKind
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
	} else if c.pathKind {
		parts = append(parts, "path")
	} else if "string" == c.domain && (c.nonEmpty ||
		(nil == c.lo && nil == c.hi && 0 == len(c.neqs) && 0 == len(c.res) && !c.emptyOk)) {
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
	for _, m := range c.mults {
		parts = append(parts, "multiple("+m.Canon()+")")
	}
	for _, r := range c.res {
		parts = append(parts, "re("+r.v.Canon()+")")
	}
	if nil != c.count {
		parts = append(parts, "len("+c.count.Canon()+")")
	}
	if c.uniq {
		parts = append(parts, "unique()")
	}
	for _, key := range c.uniqBy {
		parts = append(parts, "unique("+jsonString(key)+")")
	}
	for _, k := range c.contains {
		parts = append(parts, containsCanon(k))
	}
	for _, m := range c.musts {
		parts = append(parts, "must("+m.v.Canon()+","+m.msg.Canon()+")")
	}
	for _, n := range c.nofs {
		parts = append(parts, nofCanon(n))
	}
	for _, w := range c.whens {
		parts = append(parts, whenCanon(w))
	}
	if c.emptyOk {
		parts = append(parts, "empty()")
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
	if ("neq" == atom || bandB[atom]) && 1 == len(args) {
		if lv, ok := args[0].(*ListVal); ok {
			return lv.peg
		}
	}
	return args
}

func canonSorted(vals []Val) []Val {
	sorted := append([]Val{}, vals...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].Canon() < sorted[j].Canon()
	})
	return sorted
}

// settledTrials lists the trial schemas of the settled Band B atoms.
func (c *ConstraintVal) settledTrials() []Val {
	out := []Val{}
	for _, n := range c.nofs {
		out = append(out, n.cs...)
	}
	for _, w := range c.whens {
		out = append(out, w.c, w.t)
		if nil != w.e {
			out = append(out, w.e)
		}
	}
	for _, k := range c.contains {
		out = append(out, k.c)
	}
	return out
}

// mergeContains keeps each canon once, as mergeNofs does.
func mergeContains(cs []constraintContains) []constraintContains {
	byCanon := map[string]constraintContains{}
	keys := []string{}
	for _, k := range cs {
		key := containsCanon(k)
		if _, has := byCanon[key]; !has {
			keys = append(keys, key)
		}
		byCanon[key] = k
	}
	sort.Strings(keys)
	out := make([]constraintContains, len(keys))
	for i, key := range keys {
		out[i] = byCanon[key]
	}
	return out
}

// containsCanon leaves out a count of at least one, the default.
func containsCanon(k constraintContains) string {
	c := k.count
	one := nil != c.lo && !c.lo.open && 0 == cmpNumeric(c.lo.v, countVal(1)) &&
		nil == c.hi && 0 == len(c.neqs)+len(c.mults)
	if one {
		return "contains(" + k.c.Canon() + ")"
	}
	return "contains(" + k.c.Canon() + "," + countCanon(c) + ")"
}

func atLeastOne() *ConstraintVal {
	out := &ConstraintVal{
		domain: "number",
		lo:     &constraintBound{v: countVal(1), open: false},
	}
	out.dc = DONE
	return out
}

// containsMatches lists the members the trial schema admits, each
// settled member tried alone.
func containsMatches(ctx *Ctx, k constraintContains, members []Val, path []string) []Val {
	out := []Val{}
	for _, m := range members {
		if own, ok := ownJSON(m, ctx, path); ok && admitsSettled(ctx, k.c, m, own, path) {
			out = append(out, m)
		}
	}
	return out
}

// mergeWhens keeps each canon once, as mergeNofs does.
func mergeWhens(whens []constraintWhen) []constraintWhen {
	byCanon := map[string]constraintWhen{}
	keys := []string{}
	for _, w := range whens {
		k := whenCanon(w)
		if _, has := byCanon[k]; !has {
			keys = append(keys, k)
		}
		byCanon[k] = w
	}
	sort.Strings(keys)
	out := make([]constraintWhen, len(keys))
	for i, k := range keys {
		out[i] = byCanon[k]
	}
	return out
}

func whenCanon(w constraintWhen) string {
	parts := []string{w.c.Canon(), w.t.Canon()}
	if nil != w.e {
		parts = append(parts, w.e.Canon())
	}
	return "when(" + strings.Join(parts, ",") + ")"
}

// mergeNofs keeps each canon once: equal counts over one value are one
// check.
func mergeNofs(nofs []constraintNof) []constraintNof {
	byCanon := map[string]constraintNof{}
	keys := []string{}
	for _, n := range nofs {
		k := nofCanon(n)
		if _, has := byCanon[k]; !has {
			keys = append(keys, k)
		}
		byCanon[k] = n
	}
	sort.Strings(keys)
	out := make([]constraintNof, len(keys))
	for i, k := range keys {
		out[i] = byCanon[k]
	}
	return out
}

// countCanon writes a count bare where it is one integer, as `nof(1, …)`
// reads.
func countCanon(c *ConstraintVal) string {
	if nil != c.lo && nil != c.hi && !c.lo.open && !c.hi.open &&
		0 == cmpNumeric(c.lo.v, c.hi.v) {
		return c.lo.v.Canon()
	}
	k := c.cloneState()
	k.kind = KindTop
	return k.Canon()
}

func nofCanon(n constraintNof) string {
	parts := []string{countCanon(n.count)}
	for _, b := range n.cs {
		parts = append(parts, b.Canon())
	}
	return "nof(" + strings.Join(parts, ",") + ")"
}

// nofCounts reports which counts, from none to every branch, a nof atom
// admits.
func nofCounts(n constraintNof) []bool {
	out := make([]bool, len(n.cs)+1)
	for i := range out {
		out[i] = stateAdmits(n.count, countVal(i))
	}
	return out
}

// trialArg settles a trial schema apart from the document: one that
// conflicts admits nothing, while any other failure is the document's.
func trialArg(ctx *Ctx, arg Val) Val {
	if DONE == arg.Dc() {
		return arg
	}
	tctx := trialCtx(ctx)
	next := arg.Unify(top(), tctx)
	conflicts := 0 < len(tctx.err)
	for _, e := range tctx.err {
		conflicts = conflicts && "conflict" == codeClass(e.why)
	}
	if !conflicts {
		for _, e := range tctx.err {
			ctx.adderr(e)
		}
		return next
	}
	return newNil("nof")
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
	if 0 < g.bandBs()+len(g.contains) {
		return false, true
	}
	if "" != g.domain && g.domain != s.domain {
		return false, false
	}
	if KindTop != g.kind && g.kind != s.kind {
		return false, false
	}
	// The string-domain flags admit different sets: `path` and `string`
	// are disjoint kinds, and a non-empty general does not cover a
	// specific that admits "".
	if g.pathKind && !s.pathKind {
		return false, false
	}
	if g.nonEmpty && !g.emptyOk && !(s.nonEmpty && !s.emptyOk) {
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
	// A general divisor holds where some specific divisor is its multiple,
	// or where the specific side is integral and 1 is.
	one := newInteger(1)
	for _, a := range g.mults {
		found := integralState(s) && isMultiple(one, a)
		for _, b := range s.mults {
			found = found || isMultiple(b, a)
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

// constraintSubsumesKind: a numeric kind is the residual it names, so a
// general residual is compared with it as with any other.
func constraintSubsumesKind(g *ConstraintVal, k Kind) bool {
	switch k {
	case KindNumber, KindInteger, KindFloat, KindBigInteger, KindBigDecimal:
		s := &ConstraintVal{domain: "number"}
		if KindNumber != k {
			s.kind = k
		}
		ok, _ := constraintStateSubsumes(g, s)
		return ok
	}
	return false
}

func constraintAdmitsScalarQ(g *ConstraintVal, scalar *ScalarVal) (bool, bool) {
	if 0 < g.bandBs() {
		return false, true
	}
	if g.uniq || 0 < len(g.uniqBy)+len(g.contains) || nil != g.count {
		return false, false
	}
	if (g.pathKind && KindPath != scalar.kind) ||
		(g.nonEmpty && KindPath == scalar.kind) ||
		(g.nonEmpty && !g.emptyOk && KindString == scalar.kind && "" == scalar.peg.(string)) {
		return false, false
	}
	return stateAdmits(g, scalar), false
}

func stateAdmits(s *ConstraintVal, peer *ScalarVal) bool {
	sv, d := orderableScalar(peer)
	if nil == sv {
		// A sizing atom reads no boolean or null, which have no order,
		// length or members; a Band B check reads anything.
		return "" == s.domain && nil == s.count && !s.uniq && 0 == len(s.uniqBy)
	}
	if "" == s.domain {
		// A residual with no domain admits any scalar its atoms can rule on.
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
	for _, m := range s.mults {
		if !isMultiple(peer, m) {
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

	integral := integralState(s)

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
		mults: dedupMults(append(append([]*ScalarVal{}, a.mults...), b.mults...)),
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
			mults:  append([]*ScalarVal{}, cv.mults...),
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
// dedupMults sorts divisors by the value they show and keeps one value
// once: the atoms accumulate, and no least common multiple is synthesised.
func dedupMults(ms []*ScalarVal) []*ScalarVal {
	sorted := append([]*ScalarVal{}, ms...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if c := cmpScaled(scaledOfShown(sorted[i]), scaledOfShown(sorted[j])); 0 != c {
			return c < 0
		}
		return towerRank(sorted[i]) < towerRank(sorted[j])
	})
	out := []*ScalarVal{}
	for i, m := range sorted {
		if 0 == i || 0 != cmpScaled(scaledOfShown(sorted[i-1]), scaledOfShown(m)) {
			out = append(out, m)
		}
	}
	return out
}

func isMultiple(peer, d *ScalarVal) bool {
	return scaledIsMultiple(scaledOfShown(peer), scaledOfShown(d))
}

// integralState: an integer leaf, or a whole divisor, whose multiples are
// whole. A double shows a whole number exactly when it is one.
func integralState(s *ConstraintVal) bool {
	if KindInteger == s.kind || KindBigInteger == s.kind {
		return true
	}
	for _, m := range s.mults {
		if scaledIsIntegral(scaledOfShown(m)) {
			return true
		}
	}
	return false
}

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

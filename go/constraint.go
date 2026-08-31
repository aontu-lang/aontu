/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// ConstraintVal is the constraint algebra's residual value (G1 phase
// 1: bounds and neq), the exact port of ts/src/val/ConstraintVal.ts —
// see that file and docs/reference-language.md ("The constraint
// algebra") for the rules. In brief: an interval with open/closed
// endpoints and an exclusion set over one domain, with an optional
// numeric-leaf narrowing; bounds compare exactly across all leaves
// (numcmp.go); endpoints keep their written leaf (lazy endpoints);
// neq excludes by scalar identity; emptiness is decided eagerly where
// exact (empty interval, integral gap, point deletion under a
// narrowed leaf, domain mixing). Violations raise the registered
// `constraint` code with the admissible set in the error details.

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
	v *ScalarVal // the stored pattern scalar (Canon renders the literal)
	// src is the pattern text AS WRITTEN -- Canon and dedup use this,
	// never the normalised form, because canon round-trips source.
	src  string
	norm string         // the engine-neutral rewrite actually compiled
	re   *regexp.Regexp // compiled by the host engine, from norm
}

// THE PATTERN SUBSET, AND HOW IT IS ENFORCED (G1 phase 2; ADR-003).
//
// The exact port of normaliseRe in ts/src/val/ConstraintVal.ts -- read
// the rationale there. In brief: enforcement is NORMALISATION, not
// refusal. Every construct whose expansion is engine-defined is
// rewritten here into an explicit form that cannot be read two ways,
// and only the rewritten pattern reaches a host engine.
//
// Aontu DEFINES the abbreviations rather than inheriting either host's:
//
//     \d  [0-9]                 \D  [^0-9]
//     \w  [0-9A-Za-z_]          \W  [^0-9A-Za-z_]
//     \s  [ \t\n\r\f\v]         \S  [^ \t\n\r\f\v]
//     .   [^\n]
//     \A  ^                     \z  $
//
// Neither host agreed with all of these before rewriting: RE2's \s omits
// \v where JavaScript's includes it and also matches Unicode spaces, and
// the two `.` sets differ by \r and the line separators. After
// rewriting, both engines see one explicit class.
//
// Still refused: constructs one engine simply lacks (backreferences,
// lookaround, POSIX classes, \p, \x{}, \u), `(?` other than `(?:`, and a
// quantifier applied to a group containing a quantifier or alternation
// -- the last about TIME rather than meaning, since normalisation cannot
// fix a complexity difference (docs/trust.md clause 2).

// reRepeatMax is the largest repeat count Aontu's pattern language
// admits. RE2 caps a repeat at 1000 and refuses to compile past it,
// where JavaScript's backtracking engine accepts any count -- so
// `re("^a{1001}$")` was VALID in TypeScript and an `error` verdict
// here, a cross-port verdict flip on a schema an agent could be handed
// (status-2026-08-21.md section 4). Under ADR-003 the host's own
// compile failure must never be what a user sees, so the bound is
// Aontu's: refused identically in both ports before either engine
// compiles. Mirrors RE_REPEAT_MAX in ts/src/val/ConstraintVal.ts.
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

// repeatWhy checks a counted quantifier `{n}`, `{n,}` or `{n,m}`
// starting at src[at]. Two rules, both about what the hosts do NOT
// share:
//
//   - A bound above reRepeatMax: RE2 refuses to compile it, JavaScript
//     accepts it.
//   - A brace that does not open a well-formed counted quantifier at
//     all (`x{y}`, `a{`, `{,5}`): JavaScript compiled with the `u` flag
//     makes it a SYNTAX ERROR, while RE2 reads it as a literal brace.
//     A literal brace is written escaped, which both engines share.
//
// Mirrors repeatWhy in ts/src/val/ConstraintVal.ts.
func repeatWhy(src []rune, at int) (string, int) {
	bad := func(what string) (string, int) {
		return "a " + what +
			", which the two engines do not read the same way", -1
	}
	notCounted := "{ that does not open a counted quantifier"
	overCap := "a repeat count above " + strconv.Itoa(reRepeatMax) +
		", which RE2 refuses to compile"

	// THE DIGIT RUN IS FOLDED AS IT IS READ, never accumulated into a
	// string. The scan runs over a pattern the caller supplies and is
	// counted by no evaluator budget (docs/trust.md, clause 2), so
	// `digits += string(c)` -- which rebuilds an immutable Go string on
	// every digit -- made rejecting `a{111...1}` quadratic in the
	// number of digits, with the whole run allocated again per
	// character before Atoi ever saw it. A caller with a megabyte of
	// digits could hold the process on the refusal path.
	//
	// This is where the two ports part company on SHAPE, not on
	// answers: `digits += c` costs nothing in V8, which appends with a
	// cons-string, so ts/src/val/ConstraintVal.ts keeps the readable
	// form. Every verdict and every boundary between them is the same,
	// including the order the two failures are detected in — a run too
	// long to be an int is refused where Atoi used to fail, and a value
	// merely above the cap still waits for the post-loop check, so
	// `a{2000x}` is a malformed brace rather than an over-cap count in
	// both ports.
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
			" literal \"" + string(n) + "\" without a flag Aontu does not set", 0
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

	// One frame per open group, recording whether it contains a
	// quantifier or an alternation. A group carrying either may not
	// itself be quantified; containment is transitive, so a frame hands
	// its flags up to its parent when it closes.
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
			// `\b` AND `\B` ARE ASSERTIONS TOO, and quantifying one is
			// the same disagreement `^{1}` is: JavaScript under `u`
			// calls it a syntax error, RE2 quantifies the assertion
			// happily. The rule said "`\b` and `\B` quantify
			// identically in both and are left alone" and that was
			// measured wrong -- `re("\\b{1}x")` is `constraint_pattern`
			// in TypeScript and an accepted schema here. Only OUTSIDE a
			// class: inside one, `\b` is a backspace in both engines and
			// repeats like any other character.
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
			// Nothing to repeat. JavaScript under the `u` flag makes
			// this a SYNTAX ERROR, where RE2 quantifies the assertion
			// happily and matches, so `re("^{1}")` was
			// `constraint_pattern` in TypeScript and an accepted
			// schema here. The four assertions behave alike -- `^`,
			// `$`, `\b` and `\B` -- so the rule names all four.
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

		// A `}` that closes no counted quantifier: JavaScript under
		// `u` refuses it as a lone quantifier bracket, RE2 reads it as
		// a literal. Written inside a class (`[}]`) it is a literal in
		// both, which is the spelling that survives.
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

// sizingCjo is the conjunct sort order for a SIZING residual. Every
// other value sorts below the container default (99999), so a sizing
// atom is the LAST term to fold: `a:len(2) a:{x:1} a:{y:2}` must count
// the MERGED map, and a constraint that folded at 50000 would count
// `{x:1}` alone and refuse the layering that is the whole point of the
// language.
//
// The order atoms keep the low slot: `min(2) & 1 & 2` may decide as
// soon as it sees a scalar, because meeting more scalars can only
// narrow. Meeting more containers GROWS the member set, which is why
// the two orders differ.
const sizingCjo = 150000

// Three atoms are late: `length` and `unique` (they count members), and
// `must` (an evaluate-only check against the finished value). Mirrors
// lateAtom in ts/src/val/ConstraintVal.ts.
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
		// A path value is a string with more structure (ADR-016):
		// orderable by code points, excludable by identity, admitted
		// by the string domain. The pattern and message ARGUMENT sites
		// stay strict with their own KindString tests.
		return s, "string"
	}
	return nil, ""
}

// sameConstraintScalar is scalar identity — leaf AND value — with the
// value half decided exactly for numeric leaves.
func sameConstraintScalar(a, b *ScalarVal) bool {
	// Path identity is kind AND spelling (ADR-016): `neq(path($.x))`
	// excludes exactly that address, and never a plain string that
	// happens to spell it. Mirrors sameScalar in
	// ts/src/val/ConstraintVal.ts.
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
	c.sp = sp

	bad := func(why string) *ConstraintVal {
		c.invalid = why
		c.dc = DONE
		return c
	}

	args = atomArgs(atom, args)

	// An argument that is not yet concrete -- a reference, an arithmetic
	// expression, a conjunct of atoms -- makes the whole atom PENDING
	// rather than invalid (G1 phase 4). It is resolved in Unify, where
	// there is a Ctx to resolve through, and the residual is built from
	// the settled arguments. Only a settled argument of the wrong shape
	// is an `invalid-arg`.
	// The effectful-argument refusal happens HERE, on the written form,
	// and not in the `must` arm below: settling is what runs the effect,
	// so by the time that arm sees a settled `move($.b)` the move has
	// already happened and the argument is just its result.
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

	// `unique()` is a property of the container -- not a comparison
	// against a value -- so with no argument it says the members are
	// pairwise DISTINCT. THE ONE ARGUMENT IS A PROJECTOR (the review's
	// finding I: "unique()-by-field is reserved but absent", and the
	// arity was reserved for exactly this): `unique(port)` says no two
	// members share a `port`, which is how "no two services share a
	// port" and "event ids are unique" are said.
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

	// `must(c, msg)` is Band B: an evaluate-only check against the
	// finished value, carrying the author's own message. It is KEPT,
	// never simplified and never consulted for emptiness or subsumption
	// (docs/reference-language.md, "Band B: `must`").
	if "must" == atom {
		// The parse-time arity check (c8b4c54) guarantees exactly two
		// arguments, so this never fires. It is kept where the TS twin
		// has no guard at all because the ports fail differently on a
		// broken invariant: JavaScript reads args[1] as undefined and
		// refuses it as invalid-arg, Go panics on the index.
		if 2 != len(args) { //coverage:ignore parse-time arity guarantees two; see above
			return bad("arg")
		}
		msv, md := orderableScalar(args[1])
		if nil == msv || "string" != md || KindPath == msv.kind {
			// A message is a plain string, never a path (the TS twin's
			// stringLeaf test is strict).
			return bad("invalid-arg")
		}
		// A check carrying a nil can never be satisfied, so it is refused
		// as an ARGUMENT rather than left to fail against every value
		// with the author's message attached -- which would blame the
		// data for a mistake in the check. `must([1-x],m)` is the
		// reachable case: a degenerate expression leaves a nil inside
		// the written list.
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
		// Normalise BEFORE compiling: the host engines only ever see a
		// pattern that cannot be read two ways (ADR-003).
		norm, why := normaliseRe(src)
		if "" != why {
			c.invalidWhy = why
			return bad("constraint_pattern")
		}
		re, err := regexp.Compile(norm)
		if nil != err {
			// The host engine refuses what the subset scanner passed --
			// a malformed quantifier, an unbalanced group. Same refusal
			// under the same code: the author gets one rule, not two.
			// The message is the host's, so it is NOT pinned by a shared
			// row; the code and the located frame are.
			c.invalidWhy = "not a valid pattern"
			return bad("constraint_pattern")
		}
		c.domain = "string"
		c.res = []constraintRe{{v: psv, src: src, norm: norm, re: re}}
		return c
	}

	// `length` is the other non-ORDER atom: its argument constrains the
	// COUNT, not the value, so it is itself a residual over the integer
	// domain (docs/reference-language.md, "`length` semantics"). It is
	// resolved HERE, at construction, by walking the written argument
	// rather than by unifying it: the func-paren handler builds atoms
	// without a Ctx, so there is nothing to fold a nested conjunct
	// through. Walking is enough because a length argument is by definition
	// a meet of concrete Band A atoms; anything else (a reference, an
	// expression) is refused rather than deferred, the same discipline
	// min/max apply to their own arguments.
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
	// Every other shape: no order, no membership, nothing to count -- a
	// conflict of the constraint family. The ladder above is total in
	// practice: every remaining Val kind either sorts BELOW a constraint
	// in a conjunct (conjunct, disjunct, pref, ref) and so drives the
	// meet from its own side, or resolves to a scalar/container before a
	// constraint sees it (func, op, var, expect). The arm is kept
	// because "in practice" depends on the cjo table, and a future value
	// class would land here rather than falling through Unify with no
	// result.
	//coverage:ignore-block no Val kind reaches this arm; see above
	return c.fail(ctx, peer)
}

// settle resolves a pending atom's arguments and, once they have all
// settled, becomes the residual they describe (G1 phase 4).
//
// This is the residuation discipline FuncVal already follows for its own
// operands: push each unsettled argument one step by unifying it with
// top, and if any is still moving, mark not-done and defer -- either as
// this same pending atom (against a top peer) or wrapped with the peer
// in a conjunct the next pass will re-enter. Nothing is decided from a
// half-resolved argument, which is what keeps `min($.lo)` from reporting
// a conflict against a bound that has not arrived yet.
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

	built := newConstraint(c.pending.atom, args, c.sp)
	built.path = cp(c.path)
	built.spu = c.spu
	built.surl = c.surl
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
	// No nil-peer arm: unite returns a nil operand before dispatching to
	// any Val's Unify (unify.go), so a nil never reaches here — and were
	// one to, the conjunct below folds to it unchanged. The TS twin lost
	// the same arm.
	// The wrapper lives at the atom's own location (TS builds it with
	// the ctx, which stamps the path): budget_passes names the
	// still-refining node by this path.
	out := newConjunct([]Val{built, peer})
	out.path = cp(c.path)
	return out
}

// checkMusts applies Band B to a finished value. Each check is a plain
// unification against a CLONE of the peer: `must` reports, it never
// contributes -- whatever the check would have added is discarded, and
// the caller returns the peer untouched.
//
// The trial runs in an isolated collect context so a failing check
// leaves nothing on the caller's error list -- only the located nil this
// returns, carrying the author's own message.
func (c *ConstraintVal) checkMusts(peer Val, ctx *Ctx) Val {
	return c.checkMustsFinal(peer, ctx, true)
}

// `final` is the generation-time reading (see settleContainer): a must
// whose own check is a SIZING atom inherits that atom's provisionality,
// because `must(length(2), …)` against a map that may still gain
// members has not failed -- it has not been asked yet. Mirrors
// checkMusts in ts/src/val/ConstraintVal.ts.
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
		// Only a string among the scalars has a length, and it is
		// counted in CODE POINTS -- not bytes (this host's native
		// count) and not UTF-16 units (the TS port's).
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

// settleContainer is the FINAL reading of a sizing atom over a
// container: the same checks admitContainer makes, with the provisional
// ones taken as decided. Called from ConjunctVal.Gen, which is where no
// more members can arrive. Mirrors settleContainer in
// ts/src/val/ConstraintVal.ts.
func (c *ConstraintVal) settleContainer(bag Val, ctx *Ctx) Val {
	var optional []string
	if m, ok := bag.(*MapVal); ok {
		optional = m.optional
	}
	return c.admitContainerFinal(bag, optional, ctx, bag, true)
}

// admitContainer checks membership for a map or list peer. Only the
// SIZING atoms have anything to say about a container; every other atom
// is scalar-domain and refuses one.
//
// The members that count are the members that GENERATE
// (docs/reference-language.md, "`length` semantics"), so the selection in
// emittedMembers mirrors MapVal.Gen/ListVal.Gen exactly.
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

	// A MUST OVER A CONTAINER RESIDUATES with the atoms
	// (use-cases/BUGS.md §17): `must({t: max(60)}, …)` beside a
	// `{t: integer}` schema was answered against the schema layer ALONE
	// and discharged before the data it was written to judge arrived.
	if !c.uniq && 0 == len(c.uniqBy) && nil == c.count {
		if final || 0 == len(c.musts) {
			return peer
		}
		return c.hold(peer)
	}

	members := emittedMembers(bag, optional, ctx)
	if nil == members {
		// NOT COUNTABLE YET IS NOT A PASS. A container that cannot
		// generate cannot be counted, and a SCHEMA is exactly that: the
		// members of `{a: integer}` are types, so nothing is emitted and
		// nothing can be counted. Discharging the atom here was the §16
		// defect wearing its other face -- `length(min(2)) & {a: integer}`
		// dropped its bound while still alone, so the data half of a
		// `vet` meet was never measured at all.
		//
		// At generation the reading IS final: a container that still
		// cannot generate has its own error, and that error is the one
		// worth reporting, so it passes through untouched. Mirrors
		// admitContainer in ts/src/val/ConstraintVal.ts.
		if final {
			return peer
		}
		return c.hold(peer)
	}

	// MONOTONE READINGS ONLY (the review's finding C, use-cases/BUGS.md
	// §16). Members ACCUMULATE under unification -- a meet adds keys and
	// never removes them -- so a settled container is settled ON ITS OWN
	// and not against every value that may still contribute. The schema
	// half of a `vet` meet, a document about to receive an `@` include,
	// a bag a later `pack` will fill: each settles, and an atom that
	// decided there decided too early.
	//
	// A verdict is taken only when MORE MEMBERS CANNOT CHANGE IT: an
	// upper bound violated is permanent, a lower bound satisfied is
	// permanent, a duplicate is permanent. Everything else residuates
	// and is decided at generation. Mirrors admitContainer in
	// ts/src/val/ConstraintVal.ts.
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
		// Members compare by CANONICAL FORM, which reduces to scalar
		// identity for scalars (so [1, 1.0] is distinct) and gives
		// structural equality for container members without a second
		// rule. A generated value could not express the first: `1` and
		// `1.0` generate the same JSON number.
		seen := map[string]bool{}
		for _, m := range members {
			key := m.Canon()
			if seen[key] {
				return c.fail(ctx, peer)
			}
			seen[key] = true
		}
	}

	// ... and the same test per PROJECTED key. A member that has no such
	// key FAILS the constraint rather than being skipped: distinctness it
	// cannot be shown to have is distinctness it does not have, and
	// skipping would let one keyless record hide a duplicate.
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
	// DONE, unlike the unsettled case above. The container HAS settled;
	// the atom is kept only because a LATER value could still add
	// members, and a residue that reported itself unresolved would leave
	// every enclosing value unresolved with it -- a `type()` waiting on
	// its argument for ever.
	// The ATOM is done too, not just the conjunct. An earlier pass may
	// have set dc = 0 on the unsettled branch above, and a conjunct
	// recomputes its own doneness from its terms on every later meet --
	// so a stale 0 here would drag the residue, and every value holding
	// it, back to unresolved for ever.
	return c.hold(peer)
}

// hold is the atom kept on a value whose reading is still provisional.
// DONE, unlike the unsettled container above: the value HAS settled;
// the atom is kept only because a LATER value could still add members,
// and a residue that reported itself unresolved would leave every
// enclosing value unresolved with it -- a `type()` waiting on its
// argument for ever. The ATOM is done too, not just the conjunct: an
// earlier pass may have set dc = 0 on the unsettled branch, and a
// conjunct recomputes its own doneness from its terms on every later
// meet, so a stale 0 would drag the residue back to unresolved for
// ever. Mirrors hold in ts/src/val/ConstraintVal.ts.
func (c *ConstraintVal) hold(peer Val) Val {
	c.dc = DONE
	held := newConjunct([]Val{c, peer})
	held.dc = DONE
	return held
}

// meetKind: `number` (or `string` on the string domain) is already
// implied by an ORDER atom's argument; a numeric LEAF narrows the
// residual; anything else has an empty intersection with the
// constraint's domain.
//
// A sizing residual (`length`, `unique`) has no domain of its own -- a
// count says nothing about what is counted -- so a kind here SETS one
// rather than merely agreeing with it: `string & len(3)` is a
// three-character string, and `number & len(3)` is empty because a
// number has no length (stateEmpty decides that, not this).
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
	// `unique(a) & unique(b)` is BOTH, not the later one: each names a
	// key on which the members must differ, and dropping either would
	// silently weaken the constraint. Sorted and deduplicated, so the
	// meet is commutative and `unique(a) & unique(a)` is one atom.
	merged.uniqBy = mergeUniqBy(c.uniqBy, peer.uniqBy)
	// Band B checks accumulate in written order and are never merged,
	// deduplicated or reordered: each carries its own author message,
	// and two checks with the same shape may still say different things.
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
	state.sp = c.sp
	// The SOURCE NAME travels with the position: TS copies the whole
	// site here (`out.site.url = this.site.url`), and without it a
	// residual built from a constraint in one document was reported as
	// belonging to neither (go/vet.go role tagging).
	state.surl = c.surl
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

// dedupSortedRes sorts accumulated patterns by source in code-point
// order and drops exact duplicates. Patterns are NEVER simplified or
// compared for containment: deciding `re("a")` subsumes `re("a|b")` is
// regex containment, which the algebra deliberately does not do
// (emptiness stays approximate -- sound, incomplete). Two spellings of
// one language therefore both survive, and both are tested.
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
		// An ORDER atom's argument implies the domain, so it is not
		// spelled out. A SIZING residual carries no order, and there
		// `string` is the only thing saying what is being sized -- drop
		// it and the reparse would admit lists and maps too.
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
		// Rendered UNABRIDGED, implied parts and all: `length(3)`
		// canonicalises to `length(integer&min(3)&max(3))` because that IS
		// the residual the count must satisfy, and canon is a normal
		// form (G6 hashes it), not a pretty-printer. Abbreviating would
		// mean a second set of rules for when the implied
		// `integer & min(0)` may be dropped.
		parts = append(parts, "length("+c.count.Canon()+")")
	}
	if c.uniq {
		parts = append(parts, "unique()")
	}
	// After the bare atom, and sorted: canon is a normal form, so two
	// documents writing the same keys in different orders must render
	// the same string.
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

// atomArgs flattens an atom's written arguments.
//
// A multi-argument call arrives from the func-paren grammar as ONE entry
// holding the comma group (a *ListVal); `neq([3,1,2])` means the same
// thing. Flattening happens before the settled check, because an
// unsettled member hiding inside the group would otherwise make the atom
// look ready.
func atomArgs(atom string, args []Val) []Val {
	if ("neq" == atom || "must" == atom) && 1 == len(args) {
		if lv, ok := args[0].(*ListVal); ok {
			return lv.peg
		}
	}
	return args
}

// holdsNil reports whether a value, or anything inside it, is a nil. A
// written argument that holds one can never be satisfied, so the atom
// refuses it rather than reporting a mystery failure against every peer.
// Every caller passes a Val: args[0] comes from atomArgs, and the walk
// below descends only into container pegs, which hold Vals. The nil
// guard this function used to open with was therefore unreachable, and
// the coverage gate said so (the TS twin lost the same guard).
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
	// No ConjunctVal arm: a conjunct holding a nil IS a nil — the fold
	// returns the nil operand (conjunct.go) — so one never reaches here
	// live. TypeScript has no such arm either; its structural walk
	// would treat a conjunct exactly as it treats the disjunct above.
	return false
}

// holdsMove reports whether a value, or anything inside it, is an
// effectful call -- one whose evaluation changes a node OTHER than the
// one being computed. `move()` is the only builtin that does: it hides
// its resolution target in place. Band B refuses one as an argument,
// because settling it runs the effect against the live root before
// `must`'s trial clone is taken, and a check that mutates cannot be
// report-only. Mirrors holdsMove in ts/src/val/ConstraintVal.ts.
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

// SUBSUMPTION over two residuals (G3, the query built on the table in
// docs/reference-language.md "Subsumption"): does every value `s`
// admits pass `g` too? Implemented here because the compare machinery
// (cmpConstraintVal, sameConstraintScalar, the recursive count
// residual) is this file's. The port of constraintStateSubsumes in
// ts/src/val/ConstraintVal.ts.
//
// Returns (subsumes, undecided): undecided is true only for a `must`
// on the GENERAL side (a Band B predicate is opaque); every other
// approximation folds toward false, the safe direction.
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

// constraintAdmitsScalarQ is the query-side membership test: `must`
// makes the answer undecided, `unique` and a count residual fold to
// false (sizing is the meet's business), everything else is
// stateAdmits.
func constraintAdmitsScalarQ(g *ConstraintVal, scalar *ScalarVal) (bool, bool) {
	if 0 < len(g.musts) {
		return false, true
	}
	if g.uniq || 0 < len(g.uniqBy) || nil != g.count {
		return false, false
	}
	return stateAdmits(g, scalar), false
}

// stateAdmits reports whether a residual's ORDER and MEMBERSHIP part
// admits the scalar. The sizing atoms are deliberately not consulted:
// admit applies them to the peer's length, and the count check applies
// this same function to the count.
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
	// Every accumulated pattern must match: the meet of two `re` atoms
	// is conjunction, and matching is UNANCHORED in both engines
	// (Go MatchString, JS RegExp.test), so `re("el")` admits "hello".
	// Anchor with ^ and $ to mean the whole string.
	for _, r := range s.res {
		if !r.re.MatchString(peer.peg.(string)) {
			return false
		}
	}
	return true
}

// stateEmpty applies the eager emptiness rules. Each is EXACT -- it
// reports empty only where no value could satisfy the residual -- so
// the algebra stays sound; the incompleteness it accepts is documented
// in docs/reference-language.md, "Emptiness".
func stateEmpty(s *ConstraintVal) bool {
	// Two disagreeing kind narrowings inside a length argument, recorded
	// by meetCount because that meet has no Ctx to fail through.
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

	// Integral gap: an integer-narrowed interval containing no whole
	// number is empty (integer & above(1) & below(2)). The
	// representability holes of the int64-window integer leaf are
	// deliberately NOT modelled — sound, incomplete (see the TS twin).
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

	// Point deletion under a narrowed leaf: a closed point interval
	// whose single value of the narrowed leaf is excluded is empty
	// (integer & min(3) & max(3) & neq(3)). Without a narrowing the
	// point survives in the other leaves.
	if KindTop != s.kind && nil != s.lo && nil != s.hi &&
		!s.lo.open && !s.hi.open &&
		0 == cmpConstraintVal(d, s.lo.v, s.hi.v) {
		for _, n := range s.neqs {
			if n.kind == s.kind && 0 == cmpNumeric(n, s.lo.v) {
				return true
			}
		}
	}

	// Sizing over the number domain: a number has neither a length nor
	// members, so `integer & len(3)` and `min(2) & unique()` admit
	// nothing. Uniqueness over the string domain is empty for the same
	// reason -- a string's members are not values the algebra compares.
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

// countBase is the base every `length` argument meets: a count is a
// non-negative integer, whatever else the argument says
// (docs/reference-language.md, "`length` semantics" -- `length(c)` is empty
// iff `c & integer & min(0)` is).
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

// meetCount is the pure meet of two count residuals. Both are
// number-domain and carry no pattern or sizing atom of their own, so
// the merge is the interval/exclusion part alone. A kind disagreement
// becomes a `clash` rather than an error: this meet runs at
// construction, where there is no Ctx to raise through, and an empty
// residual carries the same news to Unify.
func meetCount(a, b *ConstraintVal) *ConstraintVal {
	// `a` is always a countBase()-seeded residual, so its kind is always
	// KindInteger — there is no kindless side to fall back from, which
	// is why this is a plain read rather than a top-check (the TS twin
	// lost the same fallback).
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

// countArgState reads a WRITTEN `length` argument as a count residual, or
// nil when it is not one. Accepted: an integer literal (an exact
// count), a numeric kind, a Band A residual over the number domain, and
// any conjunct of those -- which is what `len(min(2)&max(5))` arrives
// as, and what Canon emits.
//
// Anything else is refused rather than deferred. A reference or an
// expression would have to residuate, and the sizing atoms do not
// residuate on their ARGUMENT -- only on the peer whose members are
// still settling.
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

	// No ConjunctVal arm: an atom's arguments are SETTLED before they
	// reach here, and a settled conjunct of count constraints has
	// already folded to a single residual. The TS port deleted its twin
	// as dead code when @tabnas/expr 0.5.4 landed (cc0c2d9); found by
	// the coverage gate there, and by the same gate here.
	return nil
}

// containerSettled reports whether a bag and every child have
// converged. Until then the member set can still change — an optional
// key whose value is a still-resolving reference may yet generate — so
// a sizing atom must defer rather than decide
// (docs/reference-language.md, "`length` semantics"). Note that an
// optional holding a settled-but-ungenerable value, `{x:1,y?:number}`,
// IS settled: the map converges on the first pass and `y` is simply
// never emitted.
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

// emittedMembers lists the children a bag would EMIT, mirroring the
// selection in MapVal.Gen/ListVal.Gen — type/hide marks skipped,
// non-generable residue and values that generate nothing dropped,
// optional keys dropped when they generate empty.
//
// It returns the member VALS rather than their generated values,
// because uniqueness compares canon and a generated value cannot
// express that distinction: `1` and `1.0` generate the same JSON number
// and canon differently. Counting uses the same list, so both sizing
// atoms see exactly one definition of "member".
//
// Returns nil when a REQUIRED child is residue: the container's own Gen
// raises there, and that error is the one worth reporting.
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

// tighterBound picks the tighter of two like-direction bounds: the
// higher lower bound (or lower upper bound); on the same point the
// OPEN bound wins, and on a full tie the tower-lowest endpoint
// spelling survives.
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

// mergeUniqBy is the sorted, deduplicated union of two projector key
// lists: `unique(a) & unique(b)` demands BOTH, and canon is a normal
// form so the order cannot depend on which side was written first.
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

// containsString is membership in a small sorted slice; a set would be
// heavier than the two or three keys these lists ever hold.
func containsString(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}

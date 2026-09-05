/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"regexp"
	"strings"
)

// THE STRING BUILTINS the rule layer needs (G9 phase 6, the Go side of
// ts/src/val/StrFuncVal.ts, docs/design/TEMPLATE.0.md D4 and D5).
//
//	esc(s, variant?)      make s safe inside a literal
//	usc(s, variant?)      read it back out
//	rep(s, pattern, sub)  replace every match
//	split(s, sep)         a list of fields
//
// All four are ORDINARY string builtins beside upper and lower: they
// return values, compose with `+`, and know nothing about generation,
// which is why they can land before the renderer does.
//
// THE PATTERN IS THE PORTABLE SUBSET re() TAKES, normalised before
// either engine compiles it. One regexp language in the document, not
// two -- and the subset's linear-time guarantee matters more here than
// in a constraint, because a generator runs this over model data.
//
// The MATCHING and SPLITTING semantics are this package's, and the
// TypeScript twin writes the loops out by hand to reach them:
// JavaScript inserts a pattern's capture groups into a split result and
// reads `$1x` as group 1 then x where an Expand-style template reads
// the name `1x`.

// funcText is the string a value carries, or !ok when it is not a
// string. Mirrors stringLeaf: a path is a string too, so a spelled
// address may be escaped and split like any other text.
func funcText(v Val) (string, bool) {
	sv, ok := v.(*ScalarVal)
	if !ok || KindString != sv.kind {
		return "", false
	}
	s, ok := sv.peg.(string)
	return s, ok
}

// funcVariant is the variant an optional argument names: "" for the
// absent argument (the C/JSON convention), or !ok when it is not a
// variant name.
func funcVariant(args []Val, at int) (string, bool) {
	v := argAt(args, at)
	if nil == v {
		return "", true
	}
	s, ok := funcText(v)
	if !ok || !isEscVariant(s) {
		return "", false
	}
	return s, true
}

// reGroupCount is the number of CAPTURING groups in a normalised
// pattern. Counted by scanning rather than by asking the host, because
// the count decides whether a substitution is refused and the two ports
// must refuse the same ones. The subset admits no named groups, so a
// capturing group is exactly `(` that is not `(?`.
func reGroupCount(norm string) int {
	count := 0
	inClass := false
	r := []rune(norm)
	for i := 0; i < len(r); i++ {
		c := r[i]
		if '\\' == c {
			i++
			continue
		}
		if inClass {
			if ']' == c {
				inClass = false
			}
			continue
		}
		if '[' == c {
			inClass = true
			continue
		}
		if '(' == c && (len(r) <= i+1 || '?' != r[i+1]) {
			count++
		}
	}
	return count
}

// compileSubsetRe compiles a pattern through the subset, or names the
// code refusing it.
func compileSubsetRe(src string) (*regexp.Regexp, string) {
	norm, why := normaliseRe(src)
	if "" != why {
		return nil, "rep_pattern"
	}
	re, err := regexp.Compile(norm)
	if nil != err {
		return nil, "rep_pattern"
	}
	return re, ""
}

// expandSub is a substitution template expanded against one match.
// $1..$9 are the numbered groups, $& the whole match and $$ a literal
// $; anything else after a $ names nothing, and naming nothing is a
// REFUSAL rather than a silent literal. A group the pattern does not
// have is the same refusal -- a generator that expands it to the empty
// string writes a file with a hole in it and says nothing.
func expandSub(sub string, src string, m []int, groups int) (string, bool) {
	var out strings.Builder
	r := []rune(sub)

	group := func(g int) string {
		if len(m) <= 2*g+1 || 0 > m[2*g] {
			return ""
		}
		return src[m[2*g]:m[2*g+1]]
	}

	for i := 0; i < len(r); i++ {
		if '$' != r[i] {
			out.WriteRune(r[i])
			continue
		}

		if len(r) <= i+1 {
			return "", false
		}
		n := r[i+1]

		switch {
		case '$' == n:
			out.WriteRune('$')
		case '&' == n:
			out.WriteString(group(0))
		case '1' <= n && '9' >= n:
			g := int(n - '0')
			if groups < g {
				return "", false
			}
			out.WriteString(group(g))
		default:
			return "", false
		}
		i++
	}

	return out.String(), true
}

func escFunc(ctx *Ctx, f *FuncVal, args []Val) Val {
	src, ok := funcText(argAt(args, 0))
	if !ok {
		return makeNilErr(ctx, "invalid-arg", f, nil)
	}
	variant, ok := funcVariant(args, 1)
	if !ok {
		return makeNilErr(ctx, "esc_variant", f, nil)
	}
	return newString(escapeText(src, variant))
}

func uscFunc(ctx *Ctx, f *FuncVal, args []Val) Val {
	src, ok := funcText(argAt(args, 0))
	if !ok {
		return makeNilErr(ctx, "invalid-arg", f, nil)
	}
	variant, ok := funcVariant(args, 1)
	if !ok {
		return makeNilErr(ctx, "esc_variant", f, nil)
	}
	out, ok := unescapeText(src, variant)
	if !ok {
		return makeNilErr(ctx, "usc_malformed", f, nil)
	}
	return newString(out)
}

func repFunc(ctx *Ctx, f *FuncVal, args []Val) Val {
	src, okS := funcText(argAt(args, 0))
	pat, okP := funcText(argAt(args, 1))
	sub, okU := funcText(argAt(args, 2))
	if !okS || !okP || !okU {
		return makeNilErr(ctx, "invalid-arg", f, nil)
	}

	re, bad := compileSubsetRe(pat)
	if "" != bad {
		return makeNilErr(ctx, bad, f, nil)
	}

	groups := reGroupCount(re.String())

	var out strings.Builder
	at := 0
	for _, m := range re.FindAllStringSubmatchIndex(src, -1) {
		piece, ok := expandSub(sub, src, m, groups)
		if !ok {
			return makeNilErr(ctx, "rep_sub", f, nil)
		}
		out.WriteString(src[at:m[0]])
		out.WriteString(piece)
		at = m[1]
	}
	out.WriteString(src[at:])

	return newString(out.String())
}

func splitFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	src, ok := funcText(argAt(args, 0))
	if !ok {
		return makeNilErr(ctx, "invalid-arg", f, nil)
	}

	// A PLAIN STRING IS A LITERAL and an re(...) is a pattern. The
	// asymmetry with rep is deliberate: splitting is usually on a
	// literal, replacing is usually by pattern, and it removes the trap
	// where split(v, ".") silently cuts between every character.
	sep := argAt(args, 1)
	var fields []string

	if lit, isText := funcText(sep); isText {
		if "" == lit {
			// An EMPTY separator yields the CODE POINTS.
			for _, ch := range src {
				fields = append(fields, string(ch))
			}
		} else {
			fields = strings.Split(src, lit)
		}
	} else if cv, isC := sep.(*ConstraintVal); isC && 1 == len(cv.res) {
		fields = cv.res[0].re.Split(src, -1)
	} else {
		return makeNilErr(ctx, "split_sep", f, nil)
	}

	elems := make([]Val, 0, len(fields))
	for _, s := range fields {
		elems = append(elems, newString(s))
	}
	out := newList(elems)
	out.setvpath(cp(base))
	return out
}

// argAt is the argument at `at`, or nil when the call is shorter, which
// is how an OPTIONAL slot says it was not written. Arity is checked at
// parse, so a required slot is always here.
func argAt(args []Val, at int) Val {
	if len(args) <= at {
		return nil
	}
	return args[at]
}

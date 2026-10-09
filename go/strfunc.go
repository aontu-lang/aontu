/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"regexp"
	"strings"
)


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
		// The host engine splits, so only a pattern of the portable subset.
		host, code := compileSubsetRe(cv.res[0].src)
		if "" != code {
			return makeNilErr(ctx, code, f, nil)
		}
		fields = host.Split(src, -1)
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

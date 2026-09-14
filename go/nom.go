/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import "strings"

// nomStyles is the map `nom` answers when no style is named, in the
// order it is written. Mirrors NOM_STYLES in ts/src/val/NomFuncVal.ts.
var nomStyles = []string{
	"camel", // userId
	"dot",
	"kebab",
	"pascal", // UserId
	"path",
	"snake",
	"text",
	"title",
	"upper", // USER_ID
}

// nom's style name to the case style caseName serves. `upper` and
// `text` are nom's spellings.
var nomCaseStyles = map[string]string{
	"camel":  "camel",
	"kebab":  "kebab",
	"pascal": "pascal",
	"snake":  "snake",
	"upper":  "screaming",
}

// nomStyleName answers one name in one style, or false when the style
// is not one, or when the name holds no words at all.
func nomStyleName(name, style string, acronyms []string) (string, bool) {
	src := strings.NewReplacer(".", "_", "/", "_").Replace(name)

	words := caseSplitWords(src)
	if 0 == len(words) {
		return "", false
	}

	if cased, ok := nomCaseStyles[style]; ok {
		return caseName(src, cased, acronyms), true
	}

	lowered := make([]string, 0, len(words))
	for _, w := range words {
		lowered = append(lowered, lowerASCII(w))
	}

	switch style {
	case "dot":
		return strings.Join(lowered, "."), true
	case "path":
		return strings.Join(lowered, "/"), true
	case "title":
		titled := make([]string, 0, len(words))
		for _, w := range words {
			titled = append(titled, caseCapitalise(w, acronyms))
		}
		return strings.Join(titled, " "), true
	case "text":
		isAcronym := func(w string) bool {
			for _, a := range acronyms {
				if lowerASCII(a) == lowerASCII(w) {
					return true
				}
			}
			return false
		}
		out := []string{caseCapitalise(words[0], acronyms)}
		for _, w := range words[1:] {
			if isAcronym(w) {
				out = append(out, caseCapitalise(w, acronyms))
			} else {
				out = append(out, lowerASCII(w))
			}
		}
		return strings.Join(out, " "), true
	}

	return "", false
}

// nomAcronyms reads an acronym set: a list of concrete strings, or
// false when the value is not one.
func nomAcronyms(v Val) ([]string, bool) {
	l, ok := v.(*ListVal)
	if !ok {
		return nil, false
	}
	out := []string{}
	for _, el := range l.peg {
		t, ok := stringPeg(el)
		if !ok || "" == t {
			return nil, false
		}
		out = append(out, t)
	}
	return out, true
}

func nomFunc(ctx *Ctx, f *FuncVal, args []Val) Val {
	if len(args) < 1 || 3 < len(args) { //coverage:ignore arity {1,3} is refused at parse
		return makeNilErrFull(ctx, "invalid-arg", f, nil, "arity", nil)
	}

	name, ok := stringPeg(args[0])
	if !ok || "" == name {
		return makeNilErrFull(ctx, "invalid-arg", f, args[0], "name", nil)
	}

	style := ""
	acronyms := []string{}

	if 2 <= len(args) {
		if _, isList := args[1].(*ListVal); isList {
			if 3 == len(args) {
				return makeNilErrFull(ctx, "invalid-arg", f, args[2], "arity", nil)
			}
			acr, ok := nomAcronyms(args[1])
			if !ok {
				return makeNilErrFull(ctx, "invalid-arg", f, args[1], "acronyms", nil)
			}
			acronyms = acr
		} else {
			style, ok = stringPeg(args[1])
			if !ok {
				return makeNilErrFull(ctx, "invalid-arg", f, args[1], "style", nil)
			}
			if 3 == len(args) {
				acr, ok := nomAcronyms(args[2])
				if !ok {
					return makeNilErrFull(ctx, "invalid-arg", f, args[2], "acronyms", nil)
				}
				acronyms = acr
			}
		}
	}

	// One style: the string.
	if "" != style {
		out, ok := nomStyleName(name, style, acronyms)
		if !ok {
			return makeNilErrFull(ctx, "invalid-arg", f, args[1], "style", nil)
		}
		return newString(out)
	}

	m := newMap()
	for _, s := range nomStyles {
		out, ok := nomStyleName(name, s, acronyms)
		if !ok { //coverage:ignore a name with words styles in every style
			return makeNilErrFull(ctx, "invalid-arg", f, args[0], "name", nil)
		}
		m.set(s, newString(out))
	}
	m.closed = true
	return m
}

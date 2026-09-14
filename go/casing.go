/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import "strings"

func caseIsUpper(c rune) bool { return 'A' <= c && c <= 'Z' }
func caseIsLower(c rune) bool { return 'a' <= c && c <= 'z' }
func caseIsDigit(c rune) bool { return '0' <= c && c <= '9' }

func caseSplitWords(name string) []string {
	words := []string{}
	cur := []rune{}
	chars := []rune(name)
	for i, c := range chars {
		if '_' == c || '-' == c || ' ' == c {
			if 0 < len(cur) {
				words = append(words, string(cur))
			}
			cur = []rune{}
			continue
		}
		if 0 < len(cur) {
			prev := chars[i-1]
			boundary := c < 0x80 && prev < 0x80 &&
				((caseIsUpper(c) && (caseIsLower(prev) || caseIsDigit(prev))) ||
					(caseIsDigit(c) != caseIsDigit(prev)) ||
					(caseIsUpper(c) && caseIsUpper(prev) && i+1 < len(chars) && caseIsLower(chars[i+1])))
			if boundary {
				words = append(words, string(cur))
				cur = []rune{}
			}
		}
		cur = append(cur, c)
	}
	if 0 < len(cur) {
		words = append(words, string(cur))
	}
	return words
}

func lowerASCII(s string) string {
	out := []rune(s)
	for i, c := range out {
		if caseIsUpper(c) {
			out[i] = c + 32
		}
	}
	return string(out)
}

func upperASCII(s string) string {
	out := []rune(s)
	for i, c := range out {
		if caseIsLower(c) {
			out[i] = c - 32
		}
	}
	return string(out)
}

// caseCapitalise is a word capitalised: the acronym set wins, so `id`
// is `ID` under a profile that lists it and `Id` under one that does
// not.
func caseCapitalise(word string, acronyms []string) string {
	low := lowerASCII(word)
	for _, a := range acronyms {
		if lowerASCII(a) == low {
			return a
		}
	}
	chars := []rune(low)
	return upperASCII(string(chars[:1])) + string(chars[1:])
}

// caseName is THE CASE STYLES, over the words. `nom` maps its own
// style names onto these. Mirrors caseName in ts/src/casing.ts.
func caseName(name, style string, acronyms []string) string {
	words := caseSplitWords(name)
	switch style {
	case "snake", "kebab", "screaming":
		parts := make([]string, len(words))
		for i, w := range words {
			if "screaming" == style {
				parts[i] = upperASCII(w)
			} else {
				parts[i] = lowerASCII(w)
			}
		}
		if "kebab" == style {
			return strings.Join(parts, "-")
		}
		return strings.Join(parts, "_")
	}
	caps := make([]string, len(words))
	for i, w := range words {
		caps[i] = caseCapitalise(w, acronyms)
	}
	if "pascal" == style {
		return strings.Join(caps, "")
	}
	// camel: the first word lower, and never an acronym.
	return lowerASCII(words[0]) + strings.Join(caps[1:], "")
}

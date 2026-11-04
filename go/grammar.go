/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// The grammar seam, ADR-033. Twin of ts/src/grammar.ts.

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"

	tabnasabnf "github.com/tabnas/abnf/go"
	tabnas "github.com/tabnas/parser/go"
)

// A constant, not a trust knob: this bounds a third party's grammar.
const parseStepMax = 100000

const parseCheckEvery = 100

type grammarEntry struct {
	tn  *tabnas.Tabnas
	why string
}

// Guarded because a host may unify on more than one goroutine.
var (
	grammarMu    sync.Mutex
	grammarCache = map[string]*grammarEntry{}
	parseSteps   int
)

var numberRe = regexp.MustCompile(`^%([xXdDbB])([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+)|((?:\.[0-9A-Fa-f]+)+))?`)

var numberBase = map[byte]int{'x': 16, 'd': 10, 'b': 2}

var numberDigits = map[int]*regexp.Regexp{
	16: regexp.MustCompile(`^[0-9A-Fa-f]+$`),
	10: regexp.MustCompile(`^[0-9]+$`),
	2:  regexp.MustCompile(`^[01]+$`),
}

// A numeric value is exactly the code points it names in RFC 5234,
// but the host matches one that holds an ASCII letter in either case,
// so each such letter goes to the host as the string `%s` keeps exact.
// One with a digit its base lacks is refused here, as one host reads it
// as far as its digits go.
func numValsExact(src string) (string, string) {
	var out strings.Builder
	i := 0
	for i < len(src) {
		c := src[i]
		close := byte(0)
		switch c {
		case '"':
			close = '"'
		case '<':
			close = '>'
		case ';':
			close = '\n'
		}
		if 0 != close {
			end := strings.IndexByte(src[i+1:], close)
			stop := len(src)
			if 0 <= end {
				stop = i + 1 + end
				if '\n' != close {
					stop++
				}
			}
			out.WriteString(src[i:stop])
			i = stop
			continue
		}
		var m []string
		if '%' == c {
			m = numberRe.FindStringSubmatch(src[i:])
		}
		if nil == m {
			out.WriteByte(c)
			i++
			continue
		}
		exact, ok := numValExact(m)
		if !ok {
			return src, "a numeric value is malformed: " + m[0]
		}
		out.WriteString(exact)
		i += len(m[0])
	}
	return out.String(), ""
}

func numValExact(m []string) (string, bool) {
	base := numberBase[strings.ToLower(m[1])[0]]
	parts := []string{m[2]}
	if "" != m[3] {
		parts = append(parts, m[3])
	}
	if "" != m[4] {
		parts = append(parts, strings.Split(m[4][1:], ".")...)
	}
	cps := make([]int64, len(parts))
	whole := true
	for k, p := range parts {
		if !numberDigits[base].MatchString(p) {
			return "", false
		}
		n, err := strconv.ParseInt(p, base, 64)
		if nil != err || 0x10ffff < n {
			whole = false
		}
		cps[k] = n
	}
	letter := func(cp int64) bool { return (0x41 <= cp && cp <= 0x5a) || (0x61 <= cp && cp <= 0x7a) }
	one := "" == m[3] || cps[0] == cps[1]
	if "" != m[3] {
		cps = cps[:1]
	}
	anyLetter := false
	for _, cp := range cps {
		anyLetter = anyLetter || letter(cp)
	}
	if !one || !whole || !anyLetter {
		return m[0], true
	}
	pieces := make([]string, len(cps))
	for k, cp := range cps {
		if letter(cp) {
			pieces[k] = `%s"` + string(rune(cp)) + `"`
		} else {
			pieces[k] = fmt.Sprintf("%%x%X", cp)
		}
	}
	if 1 == len(pieces) {
		return pieces[0], true
	}
	return "(" + strings.Join(pieces, " ") + ")", true
}

func compileGrammar(src string) (*tabnas.Tabnas, string) {
	grammarMu.Lock()
	defer grammarMu.Unlock()

	if hit, has := grammarCache[src]; has {
		return hit.tn, hit.why
	}

	entry := &grammarEntry{}

	// Lexing off, or the engine reads `1 . 2 . 3` as `1.2.3`. The hook
	// is installed here because the engine takes it at construction.
	no := false
	tn := tabnas.Make(tabnas.Options{
		Space: &tabnas.SpaceOptions{Lex: &no},
		Parse: &tabnas.ParseOptions{Budget: &tabnas.BudgetOptions{
			CheckEveryN: parseCheckEvery,
			OnCheck: func(_ *tabnas.Context) bool {
				parseSteps += parseCheckEvery
				return parseSteps <= parseStepMax
			},
		}},
	})

	if text, bad := numValsExact(src); "" != bad {
		entry.why = bad
	} else if _, err := tabnasabnf.Install(tn, text, nil, nil); err != nil {
		entry.why = firstLine(err.Error())
	} else {
		entry.tn = tn
	}

	grammarCache[src] = entry
	return entry.tn, entry.why
}

func parseWith(grammar *tabnas.Tabnas, text string) (any, string) {
	grammarMu.Lock()
	defer grammarMu.Unlock()

	parseSteps = 0
	node, err := grammar.Parse(text)
	if err != nil {
		return nil, firstLine(err.Error())
	}
	return plain(node), ""
}

// The host spells a built map as its own OrderedMap and a tree node as a
// plain map; flattening keeps astVal the twin of the TypeScript.
func plain(node any) any {
	switch n := node.(type) {
	case *tabnas.OrderedMap:
		out := make(map[string]any, len(n.Vals))
		for k, v := range n.Vals {
			out[k] = plain(v)
		}
		return out

	case map[string]any:
		out := make(map[string]any, len(n))
		for k, v := range n {
			out[k] = plain(v)
		}
		return out

	case []any:
		out := make([]any, 0, len(n))
		for _, v := range n {
			out = append(out, plain(v))
		}
		return out
	}

	return node
}

// Both ports report the host's own first line.
func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); 0 <= i {
		return s[:i]
	}
	return s
}

/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// The grammar seam, ADR-033. Twin of ts/src/grammar.ts.

import (
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

	if _, err := tabnasabnf.Install(tn, src, nil, nil); err != nil {
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

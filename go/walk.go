/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

func walkVals(v Val, visit func(Val) bool, seen map[Val]bool) {
	if v == nil || seen[v] {
		return
	}
	seen[v] = true

	if !visit(v) {
		return
	}

	switch n := v.(type) {
	case *MapVal:
		for _, k := range n.keys {
			walkVals(n.peg[k], visit, seen)
		}
		if n.spread != nil {
			walkVals(n.spread, visit, seen)
		}
	case *ListVal:
		for _, e := range n.peg {
			walkVals(e, visit, seen)
		}
		if n.spread != nil {
			walkVals(n.spread, visit, seen)
		}
	case *ConjunctVal:
		for _, t := range n.peg {
			walkVals(t, visit, seen)
		}
	case *DisjunctVal:
		for _, t := range n.peg {
			walkVals(t, visit, seen)
		}
	case *PrefVal:
		walkVals(n.peg, visit, seen)
		walkVals(n.superpeg, visit, seen)
	case *PlusOpVal:
		for _, t := range n.peg {
			walkVals(t, visit, seen)
		}
	case *FuncVal:
		for _, a := range n.peg {
			walkVals(a, visit, seen)
		}
	case *NilVal:
		walkVals(n.primary, visit, seen)
		walkVals(n.secondary, visit, seen)
	case *ConstraintVal:
		// A pending atom's arguments are its peg in TypeScript
		// (`new ConstraintVal({peg: args})`), so the generic walk there
		// reaches them and this one must too. The musts and the folded
		// bounds are NOT peg entries in either port.
		if n.pending != nil {
			for _, a := range n.pending.args {
				walkVals(a, visit, seen)
			}
		}
		// The value a `must` checks against is off-peg too, and it is
		// the operand a failed check reports.
		for _, m := range n.musts {
			walkVals(m.v, visit, seen)
		}
		for _, nof := range n.nofs {
			for _, b := range nof.cs {
				walkVals(b, visit, seen)
			}
		}
	}
}

func stampURL(v Val, url string) map[string]bool {
	urls := map[string]bool{url: true}
	walkVals(v, func(n Val) bool {
		if "" == n.srcurl() {
			n.setSrcurl(url)
		}
		urls[n.srcurl()] = true
		return true
	}, map[Val]bool{})
	return urls
}

func trialSchemas(c *ConstraintVal) []Val {
	if nil != c.pending && "nof" == c.pending.atom {
		return c.pending.args[1:]
	}
	out := []Val{}
	for _, n := range c.nofs {
		out = append(out, n.cs...)
	}
	return out
}

func collectNils(v Val, out *[]*NilVal, seen map[Val]bool) {
	walked := map[Val]bool{}
	walkVals(v, func(n Val) bool {
		switch t := n.(type) {
		case *NilVal:
			*out = append(*out, t)
			seen[n] = true
			return false
		// A spread template is not an instance value: generation never
		// emits it, and each child it applies to carries its own copy.
		case *MapVal:
			if t.spread != nil {
				walked[t.spread] = true
			}
			// A written nil under an optional key nobody supplied is no
			// finding (ADR-045).
			for _, k := range t.optional {
				if nv, isNil := t.peg[k].(*NilVal); isNil && "literal_nil" == nv.why {
					walked[nv] = true
				}
			}
		case *ListVal:
			if t.spread != nil {
				walked[t.spread] = true
			}
		// A trial schema is no instance value, and a nil one admits nothing.
		case *ConstraintVal:
			for _, b := range trialSchemas(t) {
				walked[b] = true
			}
		}
		return true
	}, walked)
}

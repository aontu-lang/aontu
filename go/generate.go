/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strconv"
	"strings"
)

// packKeys is the keys a data bag names, or the code naming what is
// wrong with it. For a list the strings themselves are the keys: keys
// are DATA, never position, or reordering the list would churn every
// generated child (the Terraform `count` lesson).
func packKeys(data Val, ctx *Ctx) ([]string, string) {
	// The candidates are the bag's MEMBERS -- what generation would
	// emit (members.go, BUGS.md §79) -- so a hidden key, or a hidden
	// name in a list of names, packs nothing.
	switch data.(type) {
	case *MapVal:
		out := []string{}
		for _, m := range bagMembers(data, ctx) {
			out = append(out, m.key)
		}
		return out, ""
	case *ListVal:
		out := []string{}
		for _, m := range bagMembers(data, ctx) {
			sv, ok := m.val.(*ScalarVal)
			if !ok || KindString != sv.kind {
				return nil, "pack_key"
			}
			s, _ := sv.peg.(string)
			out = append(out, s)
		}
		return out, ""
	}
	return nil, "pack_data"
}

func bagValues(data Val, ctx *Ctx) ([]Val, bool) {
	if !isBag(data) {
		return nil, false
	}
	return memberVals(data, ctx), true
}

func packFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	var data Val = top()
	if 0 < len(args) {
		data = args[0]
	}
	keys, bad := packKeys(data, ctx)
	if "" != bad {
		return makeNilErr(ctx, bad, f, nil)
	}

	var tmpl Val = top()
	if 1 < len(args) {
		tmpl = args[1]
	}

	out := newMap()
	for ki, key := range keys {
		kslot := append(cp(base), key)
		var source Val
		if m, ok := data.(*MapVal); ok {
			source = m.peg[key]
		} else if l, ok := data.(*ListVal); ok {
			source = l.peg[ki]
		}
		child := fillPlace(instanceClone(tmpl, kslot), source)
		if prev, seen := out.peg[key]; seen {
			// Duplicate generated keys are not an error: the colliding
			// children unify, exactly as duplicate source keys merge.
			ctx.slot = kslot
			out.peg[key] = unite(ctx, prev, child)
			continue
		}
		out.keys = append(out.keys, key)
		out.peg[key] = child
	}
	out.setvpath(cp(base))
	return out
}

// trialUnify is a TRIAL meet: does a unify with b, and if so as what?
// Failure is an ANSWER rather than an error, so the error list is
// swapped for a throwaway one exactly as DisjunctVal's member trials do
// (disjunct.go). Mirrors trialUnify in ts/src/val/FuncBaseVal.ts.
func trialUnify(ctx *Ctx, a, b Val) Val {
	saved := ctx.err
	savedTrial := ctx.trial
	ctx.err = []*NilVal{}
	ctx.trial = true
	out := unite(ctx, a, b)
	failed := 0 < len(ctx.err) || (nil != out && out.Nil())
	ctx.err = saved
	ctx.trial = savedTrial
	if failed {
		return nil
	}
	return out
}

// Did the meet ADD a key or narrow a leaf, or only constrain?
func sameKids(a, b Val) bool {
	if nil == a || nil == b {
		return nil == a && nil == b
	}
	switch av := a.(type) {
	case *MapVal:
		if bv, ok := b.(*MapVal); ok {
			if len(av.peg) != len(bv.peg) {
				return false
			}
			for k, kid := range av.peg {
				peer, has := bv.peg[k]
				if !has || !sameKids(kid, peer) {
					return false
				}
			}
			return true
		}
	case *ListVal:
		if bv, ok := b.(*ListVal); ok {
			if len(av.peg) != len(bv.peg) {
				return false
			}
			for i, kid := range av.peg {
				if !sameKids(kid, bv.peg[i]) {
					return false
				}
			}
			return true
		}
	}
	return a.Canon() == b.Canon()
}

// A disjunction WHOLE is several values at once, so whether any
// matches is what the meet answered; one under it is a member.
func sameMembers(a, b Val) bool {
	if _, isDis := a.(*DisjunctVal); isDis {
		return true
	}
	return sameKids(a, b)
}

func filterFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	var data Val = top()
	if 0 < len(args) {
		data = args[0]
	}
	var cond Val = top()
	if 1 < len(args) {
		cond = args[1]
	}

	keeps := func(child Val, slot []string) bool {
		ctx.slot = slot
		test := fillPlace(instanceClone(cond, slot), child)
		met := trialUnify(ctx, clonePath(child, slot), test)
		return nil != met && sameMembers(child, met)
	}

	// The candidates are the bag's MEMBERS -- what generation would
	// emit (members.go, BUGS.md §79) -- so a hidden child is never
	// selected into the result.
	switch data.(type) {
	case *MapVal:
		out := newMap()
		for _, m := range bagMembers(data, ctx) {
			kslot := append(cp(base), m.key)
			if keeps(m.val, kslot) {
				out.keys = append(out.keys, m.key)
				out.peg[m.key] = clonePath(m.val, kslot)
			}
		}
		out.setvpath(cp(base))
		return out
	case *ListVal:
		elems := []Val{}
		for _, m := range bagMembers(data, ctx) {
			islot := append(cp(base), itoa(len(elems)))
			if keeps(m.val, islot) {
				elems = append(elems, clonePath(m.val, islot))
			}
		}
		out := newList(elems)
		out.setvpath(cp(base))
		return out
	}

	return makeNilErr(ctx, "filter_data", f, nil)
}

// matchHasDefault reports whether the last argument is a trailing
// default rather than half of a pattern/result pair.
func matchHasDefault(peg []Val) bool {
	return 0 == len(peg)%2
}

func effectiveScrutinee(v Val) Val {
	out := v
	if d, ok := out.(*DisjunctVal); ok {
		// Generation picks the LOWEST rank (subEffectiveDefault in
		// subsume.go; `a:**1|*2` generates 2). rankPrefs leaves at most
		// one pref standing in a settled disjunct, so the scan is
		// defensive.
		var best *PrefVal
		for _, m := range d.peg {
			if p, ok := m.(*PrefVal); ok && (nil == best || p.rank < best.rank) {
				best = p
			}
		}
		if nil == best {
			return v
		}
		out = best
	}
	return prefInnerPeg(out)
}

func matchFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	scrutinee := effectiveScrutinee(args[0])
	last := len(args)
	if matchHasDefault(args) {
		last--
	}

	tried := []string{}
	for i := 1; i < last; i += 2 {
		tried = append(tried, args[i].Canon())
		ctx.slot = base
		met := trialUnify(ctx,
			clonePath(scrutinee, base), clonePath(args[i], base))
		if nil != met && sameMembers(scrutinee, met) {
			// The RESULT is the answer: a match MAPS a value to another
			// value rather than narrowing the scrutinee by the arm (see
			// the TS MatchFuncVal header for why the design's `v & p & r`
			// cannot be what a match is for).
			return clonePath(args[i+1], base)
		}
	}

	if matchHasDefault(args) {
		return clonePath(args[len(args)-1], base)
	}

	return makeNilErrFull(ctx, "match_none", f, nil, "resolve",
		map[string]string{
			"value": scrutinee.Canon(),
			"tried": strings.Join(tried, " "),
		})
}

// stagedArgIdx is the arguments a staged func must have DRIVEN before
// it can fire: the ones whose value the decision reads. Everything
// else -- a generator's template, a match arm's result -- is left
// standing until it is chosen.
func stagedArgIdx(f *FuncVal) []int {
	switch f.name {
	case "pack", "each":
		return []int{0}
	case "emit":
		// The SELECTION only. The table is templates, instantiated at
		// each matched node, so its bodies may hold a `_` or a relative
		// reference -- neither of which has an answer at the call site.
		return []int{0}
	case "filter":
		// The DATA only. The condition is a template, tested against
		// each child at that child's position, so it may hold a `_` or
		// a relative reference — neither of which has an answer at the
		// call site (see the TS FilterFuncVal.prepare comment).
		return []int{0}
	case "match":
		out := []int{0}
		last := len(f.peg)
		if matchHasDefault(f.peg) {
			last--
		}
		for i := 1; i < last; i += 2 {
			out = append(out, i)
		}
		return out
	}
	// key() has nothing to settle but its own position.
	return nil
}

func stagedDrive(ctx *Ctx, f *FuncVal, base []string) bool {
	ready := true
	saved := ctx.argsnap
	ctx.argsnap = true
	defer func() { ctx.argsnap = saved }()
	// Every index stagedArgIdx answers is derived from len(f.peg), and
	// arity is checked at parse, so there is no bound to test here.
	for _, i := range stagedArgIdx(f) {
		if f.peg[i].Dc() != DONE {
			ctx.slot = base
			driven := unite(ctx, f.peg[i], top())
			if driven != f.peg[i] {
				peg := append([]Val{}, f.peg...)
				peg[i] = driven
				f.peg = peg
			}
		}
		ready = ready && f.peg[i].Dc() == DONE
	}
	return ready
}

// emitTemplate is one entry of the rule table: the pattern to try, the
// body to instantiate, and -- docs/design/TEMPLATE.0.md D3 and D4 --
// the `replace` map and the `esc` convention its values take, with the
// literal spots of the body the replacements are written into.
type emitTemplate struct {
	match   Val
	body    *ListVal
	replace *MapVal
	esc     string
	lits    []emitLit
	// idx is the rule's index in its table, which with the table's own
	// address is the address the trace names it by (RENDER.0.md P7).
	idx int
}

// emitOrigin is THE DISPATCH RECORD (RENDER.0.md D11, P7): the address
// of the node a rule matched, and the address of the rule that matched
// it -- the table's own address and the rule's index in it, joined by
// `#`, which no path holds. Mirrors EmitOrigin in ts/src/val/Val.ts.
type emitOrigin struct {
	node string
	rule string
}

// emitLit is one literal string of a body: element i, and within a map
// element the `n` index (-1 when it is not one) or the `text` key.
type emitLit struct {
	i    int
	n    int
	text bool
	s    string
}

// emitRefusal names what is wrong with a table, with the detail the
// message carries.
type emitRefusal struct {
	code    string
	details map[string]string
}

// emitPair is one replacement: the key, and the text it becomes.
type emitPair struct {
	key   string
	value string
}

// emitTemplates reads the table, or the refusal naming what is wrong
// with it. A map is one template; a list is many; a PLACEHELD emit is a
// named table (see the TS tableTemplates comment) and its own table is
// the table. A reference has been followed by emitFunc before this.
func emitTemplates(table Val) ([]emitTemplate, *emitRefusal) {
	switch t := table.(type) {
	case *FuncVal:
		if "emit" == t.name && 1 < len(t.peg) {
			return emitTemplates(t.peg[1])
		}
	case *MapVal:
		one, bad := oneEmitTemplate(t, 0)
		if nil != bad {
			return nil, bad
		}
		return []emitTemplate{one}, nil
	case *ListVal:
		out := make([]emitTemplate, 0, len(t.peg))
		for _, el := range t.peg {
			m, ok := el.(*MapVal)
			if !ok {
				return nil, &emitRefusal{code: "emit_template"}
			}
			one, bad := oneEmitTemplate(m, len(out))
			if nil != bad {
				return nil, bad
			}
			out = append(out, one)
		}
		return out, nil
	}
	return nil, &emitRefusal{code: "emit_table"}
}

func oneEmitTemplate(m *MapVal, idx int) (emitTemplate, *emitRefusal) {
	match, hasMatch := m.peg["match"]
	body, hasBody := m.peg["body"]
	if !hasMatch || !hasBody || nil == match || nil == body {
		return emitTemplate{}, &emitRefusal{code: "emit_template"}
	}
	list, ok := body.(*ListVal)
	if !ok {
		return emitTemplate{}, &emitRefusal{code: "emit_body"}
	}
	tmpl := emitTemplate{match: match, body: list, lits: emitLiterals(list),
		idx: idx}
	if rv, has := m.peg["replace"]; has && nil != rv {
		rm, ok := rv.(*MapVal)
		if !ok {
			return emitTemplate{}, &emitRefusal{code: "emit_template"}
		}
		tmpl.replace = rm
	}
	if ev, has := m.peg["esc"]; has && nil != ev {
		name, ok := funcText(ev)
		if !ok || ("none" != name && !isEscVariant(name)) {
			return emitTemplate{}, &emitRefusal{code: "esc_variant"}
		}
		tmpl.esc = name
	}
	if nil != tmpl.replace {
		if bad := emitCheckReplace(tmpl.replace, tmpl.lits); nil != bad {
			return emitTemplate{}, bad
		}
	}
	return tmpl, nil
}

func emitLiterals(body *ListVal) []emitLit {
	out := []emitLit{}
	for i, el := range body.peg {
		if s, ok := funcText(el); ok {
			out = append(out, emitLit{i: i, n: -1, s: s})
			continue
		}
		m, ok := el.(*MapVal)
		if !ok {
			continue
		}
		if of, ok := m.peg["n"].(*ListVal); ok {
			for j, p := range of.peg {
				if s, ok := funcText(p); ok {
					out = append(out, emitLit{i: i, n: j, s: s})
				}
			}
		}
		if s, ok := funcText(m.peg["text"]); ok {
			out = append(out, emitLit{i: i, n: -1, text: true, s: s})
		}
	}
	return out
}

func emitCheckReplace(replace *MapVal, lits []emitLit) *emitRefusal {
	keys := cp(replace.keys)
	sort.Strings(keys)
	for _, a := range keys {
		for _, b := range keys {
			if a != b && strings.Contains(b, a) {
				return &emitRefusal{"replace_overlap",
					map[string]string{"key": emitQuote(a), "other": emitQuote(b)}}
			}
		}
	}
	for _, k := range keys {
		held := false
		for _, l := range lits {
			if "" != k && strings.Contains(l.s, k) {
				held = true
				break
			}
		}
		if !held {
			return &emitRefusal{"replace_unused", map[string]string{"key": emitQuote(k)}}
		}
	}
	return nil
}

// emitQuote is a key as the message writes it, quoted so an empty key
// is visible.
func emitQuote(s string) string {
	return "\"" + s + "\""
}

// emitRefuse is the located error for a refusal, with the message's
// details when the refusal carries them.
func emitRefuse(ctx *Ctx, f *FuncVal, r *emitRefusal) Val {
	if nil == r.details {
		return makeNilErr(ctx, r.code, f, nil)
	}
	return makeNilErrFull(ctx, r.code, f, nil, "resolve", r.details)
}

func nodeField(rv *RefVal, node Val) Val {
	cur := node
	for _, seg := range rv.peg {
		name, ok := seg.(string)
		if !ok || "." == name {
			return nil
		}
		switch n := cur.(type) {
		case *MapVal:
			child, has := n.peg[name]
			if !has || nil == child {
				return nil
			}
			cur = child
		case *ListVal:
			i, err := strconv.Atoi(name)
			if nil != err || i < 0 || len(n.peg) <= i {
				return nil
			}
			cur = n.peg[i]
		default:
			return nil
		}
	}
	return cur
}

func hasNodeRef(v Val) bool {
	switch n := v.(type) {
	case *RefVal:
		return !n.absolute
	case *FuncVal:
		bound := boundArgStart(n)
		for i, a := range n.peg {
			if bound <= i {
				break
			}
			if hasNodeRef(a) {
				return true
			}
		}
	case *PlusOpVal:
		for _, a := range n.peg {
			if hasNodeRef(a) {
				return true
			}
		}
	case *ConjunctVal:
		for _, a := range n.peg {
			if hasNodeRef(a) {
				return true
			}
		}
	case *DisjunctVal:
		for _, a := range n.peg {
			if hasNodeRef(a) {
				return true
			}
		}
	case *PrefVal:
		return hasNodeRef(n.peg)
	case *MapVal:
		for _, k := range n.keys {
			if hasNodeRef(n.peg[k]) {
				return true
			}
		}
	case *ListVal:
		for _, e := range n.peg {
			if hasNodeRef(e) {
				return true
			}
		}
	}
	return false
}

func bindNode(v Val, node Val, fail *string) Val {
	if rv, ok := v.(*RefVal); ok && !rv.absolute {
		found := nodeField(rv, node)
		if nil == found {
			if "" == *fail {
				*fail = rv.Canon()
			}
			return v
		}
		out := clonePath(found, cp(rv.path))
		if "" == out.readAddr() && "" != node.readAddr() {
			addr := node.readAddr()
			for _, seg := range rv.peg {
				addr += "." + seg.(string)
			}
			out.setReadAddr(addr)
		}
		return out
	}
	if !hasNodeRef(v) {
		return v
	}

	switch n := v.(type) {
	case *FuncVal:
		out := *n
		out.peg = bindNodeArgs(n.peg, node, fail, boundArgStart(n))
		out.dc = 0
		return &out
	case *PlusOpVal:
		out := *n
		out.peg = bindNodeEach(n.peg, node, fail)
		out.dc = 0
		return &out
	case *ConjunctVal:
		out := *n
		out.peg = bindNodeEach(n.peg, node, fail)
		out.dc = 0
		return &out
	case *DisjunctVal:
		out := *n
		out.peg = bindNodeEach(n.peg, node, fail)
		out.dc = 0
		return &out
	case *PrefVal:
		out := *n
		out.peg = bindNode(n.peg, node, fail)
		out.dc = 0
		return &out
	case *MapVal:
		out := *n
		out.keys = cp(n.keys)
		out.peg = map[string]Val{}
		for _, k := range n.keys {
			out.peg[k] = bindNode(n.peg[k], node, fail)
		}
		out.dc = 0
		return &out
	case *ListVal:
		out := *n
		out.peg = bindNodeEach(n.peg, node, fail)
		out.dc = 0
		return &out
	}

	// UNREACHABLE: hasNodeRef above answered true, and it answers true
	// only for the kinds this switch covers. The return is here because
	// Go needs one.
	return v //coverage:ignore hasNodeRef true implies a case above
}

func bindNodeEach(vals []Val, node Val, fail *string) []Val {
	return bindNodeArgs(vals, node, fail, len(vals))
}

// bindNodeArgs binds the first `bound` values and carries the rest
// through unchanged -- the generator-template boundary of the FuncVal
// arm above.
func bindNodeArgs(vals []Val, node Val, fail *string, bound int) []Val {
	out := make([]Val, 0, len(vals))
	for i, v := range vals {
		if bound <= i {
			out = append(out, v)
			continue
		}
		out = append(out, bindNode(v, node, fail))
	}
	return out
}

// emitSplice appends v to out, flattening a list into its elements:
// the fragment algebra is FLAT, so a body element that is itself a list
// splices rather than nesting.
func emitSplice(v Val, out []Val) []Val {
	if l, ok := v.(*ListVal); ok {
		for _, el := range l.peg {
			out = emitSplice(el, out)
		}
		return out
	}
	return append(out, v)
}

func emitFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	var sel Val = top()
	if 0 < len(args) {
		sel = args[0]
	}
	if !isBag(sel) {
		return makeNilErr(ctx, "emit_data", f, nil)
	}
	nodes := bagMembers(sel, ctx)

	var table Val
	if 1 < len(args) {
		table = args[1]
	}
	if rv, ok := table.(*RefVal); ok {
		ctx.slot = base
		table = unite(ctx, rv, top())
	}

	templates, refused := emitTemplates(table)
	if nil != refused {
		return emitRefuse(ctx, f, refused)
	}

	rec := nil != ctx.reads
	tableAddr := ""
	selAddr := ""
	if rec {
		tableAddr = table.readAddr()
		selAddr = sel.readAddr()
	}

	pieces := []Val{}
	for _, member := range nodes {
		node := member.val
		tmpl, tried := emitDispatch(ctx, base, node, templates)
		if nil == tmpl {
			return makeNilErrFull(ctx, "emit_none", f, nil, "resolve",
				map[string]string{
					"value": node.Canon(),
					"tried": strings.Join(tried, " "),
				})
		}

		var mark *emitOrigin
		if rec {
			naddr := emitNodeAddr(selAddr, member.key, node)
			if "" != naddr && "" == node.readAddr() {
				node.setReadAddr(naddr)
			}
			mark = &emitOrigin{node: naddr, rule: tableAddr + "#" +
				itoa(tmpl.idx)}
		}

		fail := ""
		var refused *emitRefusal
		pieces, refused = emitInstantiate(ctx, base, node, *tmpl, pieces, &fail,
			mark)
		if "" != fail {
			return makeNilErrFull(ctx, "emit_ref", f, nil, "resolve",
				map[string]string{
					"ref":   fail,
					"value": node.Canon(),
				})
		}
		if nil != refused {
			return emitRefuse(ctx, f, refused)
		}
	}

	// THE PIECES ARE PATHED WHERE THEY LAND, once the splicing has
	// settled how many there are. A piece keeps no trace of the body it
	// was written in: the body is a template, and a template's parse
	// position is the one place it is never used.
	for i, p := range pieces {
		setPaths(p, append(cp(base), itoa(i)))
	}

	out := newList(pieces)
	out.setvpath(cp(base))
	return out
}

// emitDispatch answers the first template the node unifies with, in
// table order -- the same question match and filter ask, answered the
// same way. Answers the patterns tried when nothing matched, for the
// located error.
func emitDispatch(ctx *Ctx, base []string, node Val,
	templates []emitTemplate) (*emitTemplate, []string) {
	tried := []string{}
	for i := range templates {
		tried = append(tried, templates[i].match.Canon())
		ctx.slot = base
		// The trial is against CLONES: unite refines a bag in place
		// against a TOP peer, and a pattern that failed must be
		// untouched for the next node.
		met := trialUnify(ctx, clonePath(node, base),
			clonePath(templates[i].match, base))
		if nil != met && sameMembers(node, met) {
			return &templates[i], nil
		}
	}
	return nil, tried
}

func emitInstantiate(ctx *Ctx, base []string, node Val, tmpl emitTemplate,
	out []Val, fail *string, mark *emitOrigin) ([]Val, *emitRefusal) {
	pairs, refused := emitReplacements(ctx, base, node, tmpl, fail)
	if nil != refused {
		return out, refused
	}
	for i, el := range tmpl.body.peg {
		islot := append(cp(base), itoa(len(out)))
		inst := instanceClone(el, islot)
		if nil != pairs {
			inst = emitSubstituted(inst, i, tmpl.lits, pairs, islot)
		}
		piece := fillPlace(bindNode(inst, node, fail), node)

		if piece.Dc() != DONE {
			ctx.slot = islot
			piece = unite(ctx, piece, top())
		}

		at := len(out)
		out = emitSplice(piece, out)
		if nil != mark {
			for k := at; k < len(out); k++ {
				if nil == out[k].emitOrig() {
					out[k].setEmitOrig(mark)
				}
			}
		}
	}
	return out, nil
}

func emitNodeAddr(sel string, key string, node Val) string {
	if addr := node.readAddr(); "" != addr {
		return addr
	}
	if "" == sel {
		return ""
	}
	return sel + "." + key
}

func emitReplacements(ctx *Ctx, base []string, node Val, tmpl emitTemplate,
	fail *string) ([]emitPair, *emitRefusal) {
	if nil == tmpl.replace {
		return nil, nil
	}
	inst := fillPlace(bindNode(instanceClone(tmpl.replace, base), node, fail), node)
	if inst.Dc() != DONE {
		ctx.slot = base
		inst = unite(ctx, inst, top())
	}
	m, _ := inst.(*MapVal)
	pairs := []emitPair{}
	for _, k := range m.keys {
		v := unpref(m.peg[k])
		text, ok := joinTextOf(v)
		if !ok {
			return nil, &emitRefusal{"replace_value",
				map[string]string{"key": emitQuote(k), "value": v.Canon()}}
		}
		if "none" != tmpl.esc {
			text = escapeText(text, tmpl.esc)
		}
		pairs = append(pairs, emitPair{k, text})
	}
	sort.SliceStable(pairs, func(a, b int) bool {
		if len(pairs[a].key) != len(pairs[b].key) {
			return len(pairs[a].key) > len(pairs[b].key)
		}
		return pairs[a].key < pairs[b].key
	})
	return pairs, nil
}

func emitSubstituted(inst Val, i int, lits []emitLit, pairs []emitPair,
	slot []string) Val {
	for _, l := range lits {
		if l.i != i {
			continue
		}
		s := newString(emitSubstitute(l.s, pairs))
		s.path = cp(slot)
		if 0 <= l.n {
			m, _ := inst.(*MapVal)
			chunks, _ := m.peg["n"].(*ListVal)
			chunks.peg[l.n] = s
		} else if l.text {
			m, _ := inst.(*MapVal)
			m.peg["text"] = s
		} else {
			inst = s
		}
	}
	return inst
}

func emitSubstitute(text string, pairs []emitPair) string {
	var b strings.Builder
	i := 0
	for i < len(text) {
		hit := -1
		for pi := range pairs {
			if strings.HasPrefix(text[i:], pairs[pi].key) {
				hit = pi
				break
			}
		}
		if hit < 0 {
			b.WriteByte(text[i])
			i++
			continue
		}
		b.WriteString(pairs[hit].value)
		i += len(pairs[hit].key)
	}
	return b.String()
}

func eachFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	var data Val = top()
	if 0 < len(args) {
		data = args[0]
	}
	vals, ok := bagValues(data, ctx)
	if !ok {
		return makeNilErr(ctx, "each_data", f, nil)
	}

	var tmpl Val = top()
	if 1 < len(args) {
		tmpl = args[1]
	}

	elems := make([]Val, 0, len(vals))
	for i, v := range vals {
		islot := append(cp(base), itoa(i))
		// A full instance per element, to the leaves (instanceClone,
		// ADR-005), at the element's own position, with `_` bound to
		// the source child and NOTHING met into it.
		elems = append(elems, fillPlace(instanceClone(tmpl, islot), v))
	}
	out := newList(elems)
	out.setvpath(cp(base))
	return out
}

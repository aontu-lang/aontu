/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"strconv"
	"strings"
)

// RefVal is a path reference (e.g. `$.a.b`, `.x.a`, `x.a`). It resolves
// against the root during the fixpoint unification loop. Ported from
// ts/src/val/RefVal.ts.
type RefVal struct {
	base
	peg       []any // path parts: string or *VarVal
	absolute  bool
	prefix    bool
	hideFound bool // move(): hide the resolution target in place
	copyFound bool // copy(): clear all marks on the resolved copy
	// expansion is the value an alias reference canons as, attached by
	// expandAliases (go/alias.go) after unification (see Canon). Never
	// read by unification: it is a rendering of the settled tree.
	expansion Val
	rxc int
}

// walkOutcome says how a reference walk ended: it landed on a value,
// it missed a segment for good (no_path), or the tree is not settled
// enough to tell yet and the reference DEFERS to a later pass.
type walkOutcome int

const (
	walkFound walkOutcome = iota
	walkMissed
	walkDefer
)

func (rv *RefVal) walkFrom(root Val, refpath []string) (Val, walkOutcome) {
	var node Val = root
	for _, part := range refpath {
		if fv, ok := node.(*FuncVal); ok && DONE != fv.dc &&
			("hide" == fv.name || "type" == fv.name) && 0 < len(fv.peg) {
			switch inner := fv.peg[0].(type) {
			case *MapVal:
				node = inner
			case *ListVal:
				node = inner
			}
		}

		if cj, ok := node.(*ConjunctVal); ok && pendingMarkWrapper(cj) {
			kids := []Val{}
			for _, t := range cj.peg {
				if kid := markedChild(t, part); nil != kid {
					kids = append(kids, kid)
				}
			}
			// No term has it YET. Not a miss: the conjunct is still
			// folding, and the member may arrive with the fold.
			if 0 == len(kids) {
				return nil, walkDefer
			}
			if 1 == len(kids) {
				node = kids[0]
			} else {
				node = newConjunct(kids)
			}
			continue
		}
		switch n := node.(type) {
		case *MapVal:
			node = n.peg[part]
		case *ListVal:
			idx, ok := listIndex(part)
			if !ok || idx >= len(n.peg) {
				node = nil
			} else {
				node = n.peg[idx]
			}
		default:
			if node.Dc() == DONE {
				return nil, walkMissed
			}
			return nil, walkDefer
		}
		if node == nil {
			return nil, walkMissed
		}
	}
	return node, walkFound
}

func newRef(terms []any, prefix bool) *RefVal {
	rv := &RefVal{prefix: prefix}
	rv.sp = unsited
	for _, t := range terms {
		rv.append(t)
	}
	return rv
}

func (rv *RefVal) cjo() int      { return 32500 }
func (rv *RefVal) superior() Val { return top() }

// A path segment no spelling can produce, used when append meets a
// value it has no rule for. A key cannot contain a NUL, so this can
// never match, which turns a silent path-shortening bug into a visible
// miss. Mirrors UNSPELLABLE_SEGMENT in ts/src/val/RefVal.ts.
const unspellableSegment = "\u0000unspellable"

// append builds the path parts, mirroring RefVal.append.
func (rv *RefVal) append(part any) {
	switch p := part.(type) {
	case string:
		rv.peg = append(rv.peg, p)
	case float64:
		rv.peg = append(rv.peg, numStr(p))
	case *ScalarVal:
		switch p.kind {
		case KindString:
			rv.peg = append(rv.peg, p.peg.(string))
		case KindInteger:
			rv.peg = append(rv.peg, p.src)
		case KindFloat:
			for _, s := range strings.Split(p.src, ".") {
				rv.peg = append(rv.peg, s)
			}
		case KindBigInteger:
			rv.peg = append(rv.peg, p.src)
		case KindBigDecimal:
			for _, s := range strings.Split(p.src, ".") {
				rv.peg = append(rv.peg, s)
			}
		default:
			// A boolean or null operand has no spelling that addresses a
			// key; it must miss loudly, not shorten the path — see the
			// trailing default below.
			rv.peg = append(rv.peg, unspellableSegment)
		}
	case *VarVal:
		rv.peg = append(rv.peg, p)
	case *RefVal:
		if p.absolute {
			rv.absolute = true
		}
		if rv.prefix {
			if p.prefix {
				rv.peg = append(rv.peg, ".")
			}
		} else if p.prefix {
			if len(rv.peg) == 0 {
				rv.prefix = true
			} else {
				rv.peg = append(rv.peg, ".")
			}
		}
		rv.peg = append(rv.peg, p.peg...)
	default:
		rv.peg = append(rv.peg, unspellableSegment)
	}
}

func numStr(f float64) string {
	if f == float64(int64(f)) {
		return strconv.FormatInt(int64(f), 10)
	}
	return formatNumber(f)
}

func (rv *RefVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}
	if Val(rv) == peer {
		return rv
	}

	// The resolved target is driven at the ref's location (TS unites it
	// with the ref's own ctx).
	slot := ctx.slot

	var out Val
	found := rv.find(ctx, false)
	if found == nil {
		// Not yet resolved: defer.
		switch {
		case isTop(peer):
			out = rv
		case peer.Nil():
			out = makeNilErr(ctx, "ref", rv, peer)
		case rv.spelling() == refSpelling(peer):
			out = rv
		default:
			out = newConjunct([]Val{rv, peer})
		}
	} else if _, chain := found.(*RefVal); chain {
		switch {
		case isTop(peer):
			out = rv
		case peer.Nil():
			out = makeNilErr(ctx, "ref", rv, peer)
		case rv.spelling() == refSpelling(peer):
			out = rv
		default:
			out = newConjunct([]Val{rv, peer})
		}
	} else {
		if slot == nil {
			slot = rv.path
		}
		ctx.slot = slot
		out = unite(ctx, found, peer)
	}

	if out.Dc() != DONE {
		out.setDc(rv.dc + 1)
	}
	return out
}

func listIndex(part string) (int, bool) {
	if "" == part {
		return 0, false
	}
	if "0" != part && '0' == part[0] {
		return 0, false
	}
	for i := 0; i < len(part); i++ {
		if part[i] < '0' || '9' < part[i] {
			return 0, false
		}
	}
	// A digit run still overflows: `$.a.999999999999999999999999` is
	// syntactically an index and numerically not one.
	idx, err := strconv.Atoi(part)
	if err != nil {
		return 0, false
	}
	return idx, true
}

func markedChild(v Val, part string) Val {
	if fv, ok := v.(*FuncVal); ok && DONE != fv.dc &&
		("hide" == fv.name || "type" == fv.name) && 0 < len(fv.peg) {
		v = fv.peg[0]
	}
	switch n := v.(type) {
	case *MapVal:
		return n.peg[part]
	case *ListVal:
		idx, ok := listIndex(part)
		if !ok || idx >= len(n.peg) {
			return nil
		}
		return n.peg[idx]
	}
	return nil
}

// pendingMarkWrapper: is this value an unresolved type()/hide() call —
// or a conjunct still carrying one? A reference landing on one defers
// rather than cloning it (see the guard in find). Mirrors
// pendingMarkWrapper in ts/src/val/RefVal.ts.
func pendingMarkWrapper(v Val) bool {
	switch n := v.(type) {
	case *FuncVal:
		return ("type" == n.name || "hide" == n.name) && DONE != n.dc
	case *ConjunctVal:
		for _, t := range n.peg {
			if pendingMarkWrapper(t) {
				return true
			}
		}
	}
	return false
}

func (rv *RefVal) find(ctx *Ctx, snap bool) Val {
	if rv.isPrefixPath() {
		degenerate := 0 == len(rv.path)
		target := make([]string, 0, len(rv.peg))
		for _, p := range rv.peg {
			seg, ok := p.(string)
			if !ok || "" == seg {
				degenerate = true
				break
			}
			target = append(target, seg)
		}
		if degenerate {
			return makeNilErr(ctx, "path_cycle", rv, nil)
		}
		rec := newRecurse(target, rv.rxc)
		rec.sp, rec.spu, rec.surl = rv.sp, rv.spu, rv.surl
		// The source excerpt travels too, so reports frame the `$`
		// exactly as TS's residual site does.
		rec.stext = rv.stext
		rec.path = cp(rv.path)
		return rec
	}

	parts := make([]string, 0, len(rv.peg))
	for _, p := range rv.peg {
		if s, ok := p.(string); ok && unspellableSegment == s {
			return makeNilErr(ctx, "no_path", rv, nil)
		}
		if vv, ok := p.(*VarVal); ok {
			pv := vv.Unify(top(), ctx)
			if pv.Nil() {
				return pv
			}
			sv, ok := pv.(*ScalarVal)
			if !ok {
				// A non-scalar variable is not a usable path part
				// (TS coerces to a string that never matches).
				return makeNilErr(ctx, "no_path", rv, nil)
			}
			switch sv.kind {
			case KindString:
				parts = append(parts, sv.peg.(string))
			case KindInteger:
				parts = append(parts, strconv.FormatInt(sv.peg.(int64), 10))
			case KindFloat:
				parts = append(parts, formatNumber(sv.peg.(float64)))
			case KindBigInteger:
				// Plain digits, no `0d` marker — see RefVal.append.
				parts = append(parts, bigIntDigits(sv.peg.(*big.Int)))
			case KindBigDecimal:
				parts = append(parts, sv.peg.(*Decimal).digits())
			case KindBoolean:
				if sv.peg.(bool) {
					parts = append(parts, "true")
				} else {
					parts = append(parts, "false")
				}
			default:
				return makeNilErr(ctx, "no_path", rv, nil)
			}
			continue
		}
		s, ok := p.(string)
		if !ok {
			return nil
		}
		parts = append(parts, s)
	}

	var refpath []string
	if rv.absolute {
		refpath = parts
	} else {
		// A relative reference reads from the SIBLING scope: drop this
		// node's own key and append the written segments.
		end := len(rv.path) - 1
		if end < 0 {
			end = 0
		}
		base := append([]string{}, rv.path[:end]...)
		refpath = append(base, parts...)
	}
	refpath, ontree := reduceDots(refpath)
	if !ontree {
		return makeNilErr(ctx, "no_path", rv, nil)
	}

	node, outcome := rv.walkFrom(ctx.root, refpath)

	if walkMissed == outcome && rv.absolute && nil != ctx.fixroot &&
		ctx.fixroot != ctx.root {
		if fnode, fout := rv.walkFrom(ctx.fixroot, refpath); walkFound == fout {
			node, outcome = fnode, fout
		}
	}

	switch outcome {
	case walkMissed:
		return makeNilErr(ctx, "no_path", rv, nil)
	case walkDefer:
		return nil
	}

	if nil != ctx.reads && nil != node {
		// The root is `$`, and an alias its own NAME.
		addr := "$"
		if aname, isAlias := rv.aliasName(); isAlias {
			addr += "." + aname
		} else {
			for _, seg := range refpath {
				addr += "." + seg
			}
		}
		if 0 == len(refpath) || !strings.HasPrefix(refpath[0], "%") {
			ctx.reads[addr] = true
		}
		if "" == node.readAddr() {
			node.setReadAddr(addr)
		}
	}

	switch node.(type) {
	case *RefVal, *FuncVal:
		if rv.detectRefCycle(ctx) {
			return makeNilErr(ctx, "path_cycle", rv, nil)
		}
	}

	if !snap && !rv.hideFound && pendingMarkWrapper(node) {
		return nil
	}

	if !snap && ctx.argsnap && node.Dc() != DONE {
		return nil
	}

	if !snap {
		target := make([]string, 0, len(rv.peg))
		alls := true
		for _, p := range rv.peg {
			seg, ok := p.(string)
			if !ok {
				alls = false
				break
			}
			target = append(target, seg)
		}
		if alls && containsRecurseOf(node, target, 0) {
			rec := newRecurse(target, rv.rxc)
			rec.sp, rec.spu, rec.surl = rv.sp, rv.spu, rv.surl
			// The source excerpt travels too, so reports frame the `$`
			// exactly as TS's residual site does.
			rec.stext = rv.stext
			rec.path = cp(rv.path)
			return rec
		}
	}

	// A ref carrying marks transfers them onto the found node in place
	// (mirrors the mark assignment on `out` before the clone in TS
	// RefVal.find).
	if rv.mtype || rv.mhide {
		node.setMarkType(rv.mtype)
		node.setMarkHide(rv.mhide)
	}
	// move(): hide the source node in place — the mark lands on the
	// node's ROOT only; the bag unify loops ratchet it down one level
	// per pass, progressively freezing pending funcs in the ghost
	// (mirrors `out.mark.hide = true` for _hide_found in TS).
	if rv.hideFound {
		node.setMarkHide(true)
	}
	lifted := !ctx.argsnap || node.markedType() || node.markedHide()
	var out Val
	if holdsStaged(node) {
		out = clonePath(node, cp(rv.path))
	} else {
		out = instanceClone(node, cp(rv.path))
	}
	if lifted {
		walkMark(out, true, false, true, false)
	}
	if rv.copyFound {
		forceRootPath(out, cp(rv.path))
	}
	return out
}

func (rv *RefVal) detectRefCycle(ctx *Ctx) bool {
	return rv.chaseRefCycle(ctx, map[string]bool{})
}

func (rv *RefVal) chaseRefCycle(ctx *Ctx, ancestors map[string]bool) bool {
	rp := rv.plainRefPath()
	if rp == nil {
		return false
	}
	key := strings.Join(rp, " ")
	if ancestors[key] {
		return true
	}

	var node Val = ctx.root
	for _, part := range rp {
		switch n := node.(type) {
		case *MapVal:
			node = n.peg[part]
		case *ListVal:
			idx, err := strconv.Atoi(part)
			if err != nil || idx < 0 || idx >= len(n.peg) {
				return false
			}
			node = n.peg[idx]
		default:
			return false
		}
		if node == nil {
			return false
		}
	}

	// Terminates: each level adds a path to ancestors and refuses a
	// repeat, and the tree holds finitely many distinct paths.
	ancestors[key] = true
	defer delete(ancestors, key)

	switch n := node.(type) {
	case *RefVal:
		return n.chaseRefCycle(ctx, ancestors)
	case *FuncVal:
		for _, arg := range n.peg {
			if aref, ok := arg.(*RefVal); ok && aref.chaseRefCycle(ctx, ancestors) {
				return true
			}
		}
	}
	return false
}

func (rv *RefVal) plainRefPath() []string {
	parts := make([]string, 0, len(rv.peg))
	for _, p := range rv.peg {
		s, ok := p.(string)
		if !ok {
			return nil
		}
		parts = append(parts, s)
	}
	var refpath []string
	if rv.absolute {
		refpath = parts
	} else {
		end := len(rv.path) - 1
		if end < 0 {
			end = 0
		}
		base := append([]string{}, rv.path[:end]...)
		refpath = append(base, parts...)
	}
	reduced := make([]string, 0, len(refpath))
	for _, p := range refpath {
		if p == "." {
			if len(reduced) == 0 {
				return nil
			}
			reduced = reduced[:len(reduced)-1]
		} else {
			reduced = append(reduced, p)
		}
	}
	return reduced
}

// isPrefixPath reports whether the reference path is a prefix of this
// node's own path (a self/ancestor cycle).
func (rv *RefVal) isPrefixPath() bool {
	if len(rv.peg) > 0 {
		allEmpty := true
		for _, p := range rv.peg {
			if s, ok := p.(string); !ok || s != "" {
				allEmpty = false
				break
			}
		}
		if allEmpty {
			return true
		}
	}
	if len(rv.peg) == 0 || len(rv.peg) > len(rv.path) {
		return false
	}
	for i, p := range rv.peg {
		s, ok := p.(string)
		if !ok || s != rv.path[i] {
			return false
		}
	}
	return true
}

func varName(vv *VarVal) string {
	switch p := vv.peg.(type) {
	case string:
		return p
	case *ScalarVal:
		if p.kind == KindString {
			return p.peg.(string)
		}
	}
	return ""
}

// reduceDots collapses parent-navigation markers ("."). It answers
// false for a step off the top, which names nothing: no later pass can
// grow a tree upwards.
func reduceDots(path []string) ([]string, bool) {
	out := make([]string, 0, len(path))
	for _, p := range path {
		if p == "." {
			if 0 == len(out) {
				return nil, false
			}
			out = out[:len(out)-1]
		} else {
			out = append(out, p)
		}
	}
	return out, true
}

// refSpelling is the same-path identity of a peer: a reference's own
// spelling, any other value's canon (which no spelling can equal).
func refSpelling(v Val) string {
	if pr, ok := v.(*RefVal); ok {
		return pr.spelling()
	}
	return v.Canon()
}

// THE KEY THIS REFERENCE RESOLVES AGAINST: one segment that is a name,
// carrying the url of the file it was written in.
func (rv *RefVal) aliasKey() (string, bool) {
	if rv.absolute && 1 == len(rv.peg) {
		if s, ok := rv.peg[0].(string); ok {
			if n := aliasBareName(s); aliasRe.FindString(n) == n {
				return s, true
			}
		}
	}
	return "", false
}

func (rv *RefVal) aliasName() (string, bool) {
	if key, ok := rv.aliasKey(); ok {
		return aliasBareName(key), true
	}
	return "", false
}

// refSnapKey is the key a ref spread's structural snapshot is stored
// under (snapshotRefSpread): the reference's own spelling and its
// source position, so clones of the reference find the snapshot their
// parse-origin captured. Twin of spreadSnapKey in ts/src/val/MapVal.ts.
func refSnapKey(rv *RefVal) string {
	return rv.spelling() + "~" + rv.srcurl() + "~" + itoa(rv.sp)
}

func (rv *RefVal) Canon() string {
	if nil != rv.expansion {
		return rv.expansion.Canon()
	}
	return rv.spelling()
}

func (rv *RefVal) spelling() string {
	if name, ok := rv.aliasName(); ok {
		return name
	}
	var b strings.Builder
	if rv.absolute {
		b.WriteByte('$')
	}
	if len(rv.peg) > 0 {
		b.WriteByte('.')
	}
	parts := make([]string, len(rv.peg))
	for i, p := range rv.peg {
		switch pp := p.(type) {
		case string:
			if pp == "." {
				parts[i] = ""
			} else {
				parts[i] = pp
			}
		case Val:
			parts[i] = pp.Canon()
		}
	}
	b.WriteString(strings.Join(parts, "."))
	return b.String()
}

func (rv *RefVal) Gen(ctx *Ctx) (any, error) {
	// Code mirrors TS RefVal.gen ('ref').
	return nil, residueErr(ctx, rv, "ref")
}

// VarVal is a variable reference (e.g. `$name`). Full variable lookup
// is ported later; for now it resolves only via RefVal special names.
type VarVal struct {
	base
	peg any
}

func newVar(name any) *VarVal {
	v := &VarVal{peg: name}
	v.sp = unsited
	return v
}

func (vv *VarVal) superior() Val { return top() }

func (vv *VarVal) Canon() string {
	if v, ok := vv.peg.(Val); ok {
		return "$" + v.Canon()
	}
	if s, ok := vv.peg.(string); ok {
		return "$" + s
	}
	return "$"
}

func (vv *VarVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}
	// $.a.b form: an absolute path reference.
	if rv, ok := vv.peg.(*RefVal); ok {
		rv.absolute = true
		return rv.Unify(peer, ctx)
	}
	// $name form: look the variable up in the context (mirrors
	// VarVal.unify in ts/src/val/VarVal.ts).
	name := varName(vv)
	if name == "" {
		return makeNilErr(ctx, "var", vv, peer)
	}
	if ctx.vars != nil {
		if found, ok := ctx.vars[name]; ok {
			// Unify the resolved value with the peer so a constraint
			// unified against the var (e.g. a spread clone) applies to
			// its value rather than being silently dropped.
			out := clonePath(found, cp(vv.path))
			if peer != nil && !isTop(peer) {
				return unite(ctx, out, peer)
			}
			return out
		}
	}
	return makeNilErr(ctx, "unknown_var", vv, peer)
}

func (vv *VarVal) Gen(ctx *Ctx) (any, error) {
	// Silent (mirrors the TS FeatureVal gen pattern): the enclosing
	// bag reports unresolved vars.
	return nil, nil
}

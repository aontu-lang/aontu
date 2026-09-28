/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// SealVal is `close()` or `open()` with no argument. `close()` folds
// LAST in a conjunct, so it closes the whole meet rather than the first
// term it finds; `open()` folds first, so it lifts a seal before anything is added.
type SealVal struct {
	base
	closed bool
}

func newSeal(closed bool) *SealVal {
	v := &SealVal{closed: closed}
	v.site.sp = unsited
	v.dc = DONE
	return v
}

func sealCjo(closed bool) int {
	if closed {
		return 130000
	}
	return 25000
}

func (s *SealVal) cjo() int      { return sealCjo(s.closed) }
func (s *SealVal) superior() Val { return top() }

func (s *SealVal) Canon() string {
	if s.closed {
		return "close()"
	}
	return "open()"
}

func (s *SealVal) Gen(ctx *Ctx) (any, error) {
	return nil, residueErr(ctx, s, "no_gen")
}

func (s *SealVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		return s
	}
	switch p := peer.(type) {
	case *SealVal:
		if s.closed || !p.closed {
			return s
		}
		return p
	// A copy, not the peer: a disjunction trials every alternative
	// against one peer, and a seal set in place would leak across them.
	case *MapVal, *ListVal:
		c := clonePath(p, cp(pathOf(p)))
		sealBag(c, s.closed)
		return c
	}
	return peer
}

func pathOf(v Val) []string {
	switch b := v.(type) {
	case *MapVal:
		return b.path
	case *ListVal:
		return b.path
	}
	return nil
}

func isOpened(v Val) bool {
	switch b := v.(type) {
	case *MapVal:
		return b.opened
	case *ListVal:
		return b.opened
	}
	return false
}

// Closing is recursive, except into a subtree an explicit `open()`
// holds; opening is recursive and marks each bag so a later close stops.
func sealTree(v Val, closed bool) {
	if closed && isOpened(v) {
		return
	}
	switch b := v.(type) {
	case *MapVal:
		b.closed, b.opened = closed, !closed
		for _, k := range b.keys {
			sealTree(b.peg[k], closed)
		}
	case *ListVal:
		b.closed, b.opened = closed, !closed
		for _, e := range b.peg {
			sealTree(e, closed)
		}
	}
}

// A plain copy: no seal, held nowhere.
func unsealTree(v Val) {
	switch b := v.(type) {
	case *MapVal:
		b.closed, b.opened = false, false
		for _, k := range b.keys {
			unsealTree(b.peg[k])
		}
	case *ListVal:
		b.closed, b.opened = false, false
		for _, e := range b.peg {
			unsealTree(e)
		}
	}
}

// An explicit seal: the bag it names obeys whatever it said before.
func sealBag(v Val, closed bool) {
	switch b := v.(type) {
	case *MapVal:
		b.opened = false
	case *ListVal:
		b.opened = false
	}
	sealTree(v, closed)
}

// A child of a closed bag closes as a copy (a reference answers a shared value).
func sealChild(child Val) Val {
	switch b := child.(type) {
	case *MapVal:
		if b.closed || b.opened {
			return child
		}
		out := clonePath(b, cp(b.path))
		sealTree(out, true)
		return out
	case *ListVal:
		if b.closed || b.opened {
			return child
		}
		out := clonePath(b, cp(b.path))
		sealTree(out, true)
		return out
	}
	return child
}

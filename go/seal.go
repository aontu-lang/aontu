/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// SealVal is `close()` or `open()` with no argument: it seals, or
// unseals, the map or list it meets, and leaves any other value as it
// is. `close()` folds LAST in a conjunct, so it closes the whole meet
// rather than the first term it finds; `open()` folds first, so it
// lifts a seal before anything is added.
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
	case *MapVal:
		p.closed = s.closed
		return p
	case *ListVal:
		p.closed = s.closed
		return p
	}
	return peer
}

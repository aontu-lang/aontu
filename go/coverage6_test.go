package aontu

import (
	"testing"
)

// A peer list that is already done is paired by the elements that stand,
// which a hidden element is not.
func TestListPairsADonePeerByItsStandingElements(t *testing.T) {
	hidden := newScalar(KindInteger, int64(9))
	hidden.setMarkHide(true)
	peer := newList([]Val{newScalar(KindInteger, int64(1)), hidden, newScalar(KindInteger, int64(2))})
	peer.setDc(DONE)
	l := newList([]Val{newScalar(KindInteger, int64(1)), newScalar(KindInteger, int64(2))})
	out, ok := l.Unify(peer, &Ctx{}).(*ListVal)
	if !ok || 2 != len(out.peg) || "1" != out.peg[0].Canon() || "2" != out.peg[1].Canon() {
		t.Fatalf("[1, 2] & done [1, hide(9), 2]: got %v", out)
	}
}

// A spread list meets a done peer's element past its own; one that reads
// as a maybe still to decide leaves the list waiting.
func TestSpreadListWaitsOnAnElementThatReadsUndecided(t *testing.T) {
	l := newList(nil)
	l.spread = newScalarKind(KindInteger)
	pe := newConjunct([]Val{newFunc("maybe", []Val{newRef([]any{"gone"}, true)}), top()})
	peer := newList([]Val{pe})
	peer.setDc(DONE)
	out := l.Unify(peer, &Ctx{})
	if DONE == out.Dc() {
		t.Fatalf("[&: integer] & done [maybe($.gone) & top]: settled as %v", out)
	}
}

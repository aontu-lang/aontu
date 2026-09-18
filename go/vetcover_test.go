/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "testing"

// THE ARMS THAT DECLINE TO RESOLVE: anything not ending at a bag
// answers nothing, rather than crediting a leaf nothing reached.
func TestCoverThroughDeclinesWhatIsNotAShape(t *testing.T) {
	shapeIn := newMap()
	shapeIn.set("v", newString("x"))
	root := newMap()
	root.set("Shape", shapeIn)
	root.set("Scalar", newString("s"))

	if nil == coverThrough(root, root) {
		t.Error("a map is its own shape")
	}
	if nil != coverThrough(newString("x"), root) {
		t.Error("a scalar resolved")
	}
	if nil != coverThrough(newFunc("upper", []Val{newString("x")}), root) {
		t.Error("a non-close call resolved")
	}
	if nil != coverThrough(newFunc("close", nil), root) {
		t.Error("close with no argument resolved")
	}
	shape := newMap()
	shape.set("v", newString("x"))
	if got := coverThrough(newFunc("close", []Val{shape}), root); got != Val(shape) {
		t.Errorf("close did not reach its argument: %v", got)
	}
	rel := &RefVal{peg: []any{"Shape"}, absolute: false}
	if nil != coverThrough(rel, root) {
		t.Error("a relative reference resolved")
	}
	abs := &RefVal{peg: []any{"Shape"}, absolute: true}
	if nil == coverThrough(abs, root) {
		t.Error("an absolute reference did not resolve")
	}
	for _, miss := range [][]any{
		{"NoSuchName"},       // no such key
		{"Scalar", "deeper"}, // a step that is not a map
		{42},                 // a part that is not a name
	} {
		r := &RefVal{peg: miss, absolute: true}
		if nil != coverThrough(r, root) {
			t.Errorf("%v resolved", miss)
		}
	}
	cyc := newMap()
	cyc.set("A", &RefVal{peg: []any{"A"}, absolute: true})
	if nil != coverThrough(&RefVal{peg: []any{"A"}, absolute: true}, cyc) {
		t.Error("a self-referential definition resolved")
	}
}

func TestCoverMatchStopsWhereNothingIsDeclared(t *testing.T) {
	anchor := newMap()
	anchor.set("a", newString("x"))
	if "" != coverMatch(anchor, []string{"a", "deeper"}, anchor) {
		t.Error("walked past a scalar")
	}
}

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
	abs := &RefVal{peg: []any{"Shape"}, absolute: true}
	if nil == coverThrough(abs, root) {
		t.Error("an absolute reference did not resolve")
	}
	// `..Shape` at `$.x.&` names the root's `Shape`; a step off the
	// top of the path names nothing.
	up := &RefVal{base: base{path: []string{"x", "&"}},
		peg: []any{".", "Shape"}}
	if nil == coverThrough(up, root) {
		t.Error("a relative reference did not resolve")
	}
	off := &RefVal{peg: []any{".", "Shape"}}
	if nil != coverThrough(off, root) {
		t.Error("a step off the top resolved")
	}
	list := newList([]Val{newMap()})
	root.set("Defs", list)
	// No such key, a step that is not a bag, a part that is not a
	// name, and spellings that are not a canonical list index.
	for _, miss := range [][]any{
		{"NoSuchName"},
		{"Scalar", "deeper"},
		{42},
		{"Defs", "9"},
		{"Defs", "-1"},
		{"Defs", "middle"},
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

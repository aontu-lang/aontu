/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "testing"

func TestCursorColonAtTheStartHasNoKeyBeforeIt(t *testing.T) {
	if _, _, ok := keySpan(": 1", 2, "a"); ok {
		t.Fatal("a colon at the start has no key before it")
	}
}

func TestCursorMapSearchVisitsASharedValueOnceAndFindsNothingElse(t *testing.T) {
	one := &TopVal{}
	both := &ConjunctVal{peg: []Val{one, one, nil}}
	if _, _, ok := mapAt("", both, 0); ok {
		t.Fatal("found a map where there is none")
	}
}

func TestCursorWalkVisitsASharedValueOnceAndStepsOverNothing(t *testing.T) {
	one := &TopVal{}
	both := &ConjunctVal{peg: []Val{one, one, &PrefVal{}}}
	keys, values := cursorHits("x", both)
	if 0 != len(keys) || 0 != len(values) {
		t.Fatalf("got %v %v", keys, values)
	}
}

func TestCursorOutlineVisitsASharedValueOnceAndStepsOverNothing(t *testing.T) {
	one := &TopVal{}
	both := &ConjunctVal{peg: []Val{one, one, nil}}
	if got := symbolTree("x", both); 0 != len(got) {
		t.Fatalf("got %v", got)
	}
}

func TestCursorRenameWalkVisitsASharedValueOnceAndStepsOverNothing(t *testing.T) {
	one := &TopVal{}
	both := &ConjunctVal{peg: []Val{one, one, nil}}
	if got := renameEntries(both); 2 != len(got) || got[0].v != Val(both) || got[1].v != Val(one) {
		t.Fatalf("got %v", got)
	}
}

func TestCursorFileRefusalNamesWhyAFileCannotBeEdited(t *testing.T) {
	for _, c := range [][4]string{
		{"/w/aontu_meta/vendor/p/main.aontu", "/w", "true", "/w/aontu_meta/vendor/p/main.aontu is in a package"},
		{"/w/a.aontu", "/w", "false", "the text of /w/a.aontu cannot be read"},
		{"/w/a.aontu", "/w", "true", ""},
		{"/v/a.aontu", "/w", "true", "/v/a.aontu is outside the workspace root"},
		{"/w/a.aontu", "", "true", "/w/a.aontu is outside the workspace root"},
	} {
		if got := FileRefusal(c[0], c[1], "true" == c[2]); c[3] != got {
			t.Errorf("%v: %q", c, got)
		}
	}
}

func TestCursorRenameNamesAFileWhoseTextItCannotRead(t *testing.T) {
	a := New()
	a.Trust = &TrustOptions{IncludeMem: map[string]string{"m.aontu": "k: { n: key() }\n"}}
	got := a.RenameAt("a: @\"m.aontu\"\ny: $.a.k\n", CursorPosition{1, 7}, "j", RenameOptions{Root: "/"})
	if nil == got || "cannot rename a.k: key() reads the key at m.aontu" != got.Refused {
		t.Fatalf("got %+v", got)
	}
}

func TestCursorAFileIsReadAsTheParseReadIt(t *testing.T) {
	texts := &renameTexts{src: "a: 1\n", inc: map[string]string{"/w/x.aontu": "b: 2\n", "aontu:lang/text": "c: 3\n"}}
	for file, want := range map[string]bool{"": true, "/w/x.aontu": true, "aontu:lang/text": false, "/w/y.aontu": false} {
		if _, ok := texts.text(file); want != ok {
			t.Errorf("%q: %v", file, ok)
		}
	}
}

/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// What the two ports must AGREE on about the tree view -- the rendered
// text and the refusals -- is test/spec/view.tsv. This file holds the
// arms that are this port's own: the parse-failure path `parseEntry`
// gives Go, which collect mode gives TypeScript on the context instead,
// and the nil-root-with-no-error fallback.

import "testing"

func TestViewTreeUnparseableSource(t *testing.T) {
	// An unclosed STRING does not parse, which is what reaches
	// parseEntry's error return.
	r := New().ViewTree("a: \"unterminated", nil)
	if "error" != r.Verdict || "tree" != r.Kind {
		t.Fatalf("verdict %q kind %q, want error tree", r.Verdict, r.Kind)
	}
	if 1 != len(r.Errors) || "" == r.Errors[0].Code {
		t.Fatalf("errors: %v", r.Errors)
	}
	if nil != r.Text {
		t.Fatalf("a refusal carried a figure: %q", *r.Text)
	}
}

// A NIL ROOT WITH AN EMPTY ERROR LIST (use-cases/BUGS.md 43): the
// id-spread refusal IS the root, so ctx.err is empty and the finding
// is built from the root itself.
func TestViewTreeNilRootWithNoCollectedError(t *testing.T) {
	r := New().ViewTree("&:\n", &ViewOptions{})
	if "error" != r.Verdict {
		t.Fatalf("verdict %q, want error", r.Verdict)
	}
	if 1 != len(r.Errors) || "" == r.Errors[0].Code {
		t.Fatalf("errors: %v", r.Errors)
	}
}

// A rendered figure is present even when empty: a model with no links
// draws nothing, honestly, rather than refusing.
func TestViewTreeOfNoEdgesIsAnEmptyFigure(t *testing.T) {
	r := New().ViewTree("a: 1\n", nil)
	if "rendered" != r.Verdict || nil == r.Text || "" != *r.Text {
		t.Fatalf("report: %+v", r)
	}
}

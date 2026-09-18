/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"fmt"
	"strings"
	"testing"
)

func TestBudgetPassesHint(t *testing.T) {
	hint, ok := hints["budget_passes"]
	if !ok {
		t.Fatalf("budget_passes has no hint")
	}
	if !strings.Contains(hint, "evaluation budget") {
		t.Fatalf("budget_passes hint must contain %q, got: %s", "evaluation budget", hint)
	}
	if cls := codeClass("budget_passes"); cls != "budget" {
		t.Fatalf("budget_passes class: want budget, got %s", cls)
	}
	if cls := codeClass("path_cycle"); cls != "reference" {
		t.Fatalf("path_cycle class: want reference, got %s", cls)
	}
	// The prefix families resolve through their registered prefix, and
	// an unregistered code is an engine defect, classified internal.
	if cls := codeClass("func:upper"); cls != "conflict" {
		t.Fatalf("func:upper class: want conflict, got %s", cls)
	}
	if cls := codeClass("no-such-code"); cls != "internal" {
		t.Fatalf("unregistered code class: want internal, got %s", cls)
	}
}

// Check surfaces context-recorded errors that never land in the tree
// (the ctx-err union in CheckVars) — proven here with a unify-time
// error that is reachable in Go.
func TestCheckSurfacesCtxErrors(t *testing.T) {
	a := New()
	probs := a.Check("a:$.b b:$.a")
	if len(probs) == 0 {
		t.Fatalf("expected problems for mutual cycle")
	}
	found := false
	for _, p := range probs {
		if p.Why == "path_cycle" {
			found = true
			if p.Class != "reference" {
				t.Fatalf("path_cycle Problem.Class: want reference, got %s", p.Class)
			}
		}
	}
	if !found {
		t.Fatalf("expected a path_cycle problem, got: %+v", probs)
	}
}

// The plain-ref cycle chase has NO hop cap: a cycle of any length is
// proven at the first repetition (the seen set grows every hop and the
// tree is finite). Regression for the removed 99-hop cutoff. The TS
// twin is long-ref-cycle-is-proven in ts/test/unify.test.ts.
func TestLongRefCycleIsProven(t *testing.T) {
	var keys []string
	for i := 0; i < 120; i++ {
		keys = append(keys, fmt.Sprintf("k%03d", i))
	}
	var parts []string
	for i, k := range keys {
		parts = append(parts, fmt.Sprintf("%s:$.%s", k, keys[(i+1)%len(keys)]))
	}
	_, err := New().Generate(strings.Join(parts, " "))
	if err == nil {
		t.Fatalf("expected path_cycle error, generate succeeded")
	}
	ae, ok := err.(*AontuError)
	if !ok || ae.Code != "path_cycle" {
		t.Fatalf("expected code path_cycle, got %T %v", err, err)
	}
}

func TestFullMessageTwinFramed(t *testing.T) {
	_, err := New().Generate("x: 0\ny: 0\n\"\u00e9\": 1\n\"\u00e9\": 2\nz: 0\n")
	if err == nil {
		t.Fatalf("expected error")
	}
	want := "[aontu/scalar_value]: Cannot unify values at path $.é\n\nLiteral scalar values of the same kind can only unify if they are\nexactly equal.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  a & a   -> a    # Does unify (equal Strings);\n  1 & 2   -> nil  # Does not unify (unequal Integers);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: 2 with value: 1\n  \u001b[34m--> <no-file>:4:6\n\u001b[34m  2 | \u001b[0my: 0\n\u001b[34m  3 | \u001b[0m\"é\": 1\n\u001b[34m  4 | \u001b[0m\"é\": 2\n           \u001b[34m^ value was: 2\u001b[0m\n\u001b[34m  5 | \u001b[0mz: 0\n\u001b[34m  6 | \u001b[0m\n\n Cannot unify value: 1 with value: 2\n  \u001b[34m--> <no-file>:3:6\n\u001b[34m  1 | \u001b[0mx: 0\n\u001b[34m  2 | \u001b[0my: 0\n\u001b[34m  3 | \u001b[0m\"é\": 1\n           \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m  4 | \u001b[0m\"é\": 2\n\u001b[34m  5 | \u001b[0mz: 0\n"
	if got := err.Error(); got != want {
		t.Fatalf("full message mismatch\n want: %q\n got:  %q", want, got)
	}
}

func TestFrameGutterWidth(t *testing.T) {
	for _, c := range []struct {
		name string
		rows int
		want string
	}{
		{"two-digit", 10, "[aontu/scalar_kind]: Cannot unify values at path $.bad\n\nLiteral scalar values of different kinds cannot unify.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  1 & a   -> nil  # Does not unify (Kinds: Integer & String);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: true with value: 1\n  \u001b[34m--> <no-file>:10:10\n\u001b[34m   8 | \u001b[0m\n\u001b[34m   9 | \u001b[0m\n\u001b[34m  10 | \u001b[0mbad: 1 & true\n                \u001b[34m^ value was: true\u001b[0m\n\u001b[34m  11 | \u001b[0m\n\u001b[34m  12 | \u001b[0m\n\n Cannot unify value: 1 with value: true\n  \u001b[34m--> <no-file>:10:6\n\u001b[34m   8 | \u001b[0m\n\u001b[34m   9 | \u001b[0m\n\u001b[34m  10 | \u001b[0mbad: 1 & true\n            \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m  11 | \u001b[0m\n\u001b[34m  12 | \u001b[0m\n"},
		{"three-digit", 98, "[aontu/scalar_kind]: Cannot unify values at path $.bad\n\nLiteral scalar values of different kinds cannot unify.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  1 & a   -> nil  # Does not unify (Kinds: Integer & String);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: true with value: 1\n  \u001b[34m--> <no-file>:98:10\n\u001b[34m   96 | \u001b[0m\n\u001b[34m   97 | \u001b[0m\n\u001b[34m   98 | \u001b[0mbad: 1 & true\n                 \u001b[34m^ value was: true\u001b[0m\n\u001b[34m   99 | \u001b[0m\n\u001b[34m  100 | \u001b[0m\n\n Cannot unify value: 1 with value: true\n  \u001b[34m--> <no-file>:98:6\n\u001b[34m   96 | \u001b[0m\n\u001b[34m   97 | \u001b[0m\n\u001b[34m   98 | \u001b[0mbad: 1 & true\n             \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m   99 | \u001b[0m\n\u001b[34m  100 | \u001b[0m\n"},
	} {
		_, err := New().Generate(strings.Repeat("\n", c.rows-1) + "bad: 1 & true\n")
		if err == nil {
			t.Fatalf("%s: expected error", c.name)
		}
		if got := err.Error(); got != c.want {
			t.Fatalf("%s: full message mismatch\n want: %q\n got:  %q",
				c.name, c.want, got)
		}
	}
}

func TestFullMessageTwin(t *testing.T) {
	_, err := New().Generate("a:1 a:2")
	if err == nil {
		t.Fatalf("expected error")
	}
	want := "[aontu/scalar_value]: Cannot unify values at path $.a\n\nLiteral scalar values of the same kind can only unify if they are\nexactly equal.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  a & a   -> a    # Does unify (equal Strings);\n  1 & 2   -> nil  # Does not unify (unequal Integers);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: 2 with value: 1\n  \u001b[34m--> <no-file>:1:7\n\u001b[34m  1 | \u001b[0ma:1 a:2\n            \u001b[34m^ value was: 2\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n\n Cannot unify value: 1 with value: 2\n  \u001b[34m--> <no-file>:1:3\n\u001b[34m  1 | \u001b[0ma:1 a:2\n        \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n"
	if got := err.Error(); got != want {
		t.Fatalf("full message mismatch\n want: %q\n got:  %q", want, got)
	}
}

func TestFullMessageSpreadTwin(t *testing.T) {
	a := New()
	_, err := a.Generate("a:&:min(3) a:{x:2}")
	if nil == err {
		t.Fatalf("expected error")
	}
	want := "[aontu/constraint]: Cannot unify values at path $.a.x\n\nThis value does not satisfy the constraint. A constraint is the\nmeet of bound atoms (min, max, above, below) and exclusions (neq)\nover one domain; the expected form shown is the normalised\nresidual the value must satisfy.\n \nExamples:\n  min(0) & 3                    -> 3    # Admitted (3 >= 0);\n  min(0) & 0d5                  -> 0d5  # Bounds are leaf-agnostic;\n  max(65535) & 99999            -> nil  # Above the bound;\n  min(5) & max(3)               -> nil  # Empty at composition time;\n  integer & above(1) & below(2) -> nil  # No integer in the gap;\n  neq(1) & 1.0                  -> 1.0  # neq excludes leaf AND value.\n  re(\"^a\") & \"abc\"              -> \"abc\" # Patterns are unanchored.\n\n Cannot unify value: 2 with value: min(3)\n  \u001b[34m--> <no-file>:1:17\n\u001b[34m  1 | \u001b[0ma:&:min(3) a:{x:2}\n                      \u001b[34m^ value was: 2\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n\n Cannot unify value: min(3) with value: 2\n  \u001b[34m--> <no-file>:1:5\n\u001b[34m  1 | \u001b[0ma:&:min(3) a:{x:2}\n          \u001b[34m^ value was: min(3)\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n"
	if err.Error() != want {
		t.Fatalf("full message twin mismatch:\n got: %q\nwant: %q", err.Error(), want)
	}
}

func TestFullMessageBagTwin(t *testing.T) {
	_, err := New().Generate("a:1 a:{b:1}")
	if err == nil {
		t.Fatalf("expected error")
	}
	want := "[aontu/scalar_kind]: Cannot unify values at path $.a\n\nLiteral scalar values of different kinds cannot unify.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  1 & a   -> nil  # Does not unify (Kinds: Integer & String);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: {\"b\":1} with value: 1\n  \u001b[34m--> <no-file>:1:7\n\u001b[34m  1 | \u001b[0ma:1 a:{b:1}\n            \u001b[34m^ value was: {\"b\":1}\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n\n Cannot unify value: 1 with value: {\"b\":1}\n  \u001b[34m--> <no-file>:1:3\n\u001b[34m  1 | \u001b[0ma:1 a:{b:1}\n        \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n"
	if got := err.Error(); got != want {
		t.Fatalf("bag twin mismatch\n want: %q\n got:  %q", want, got)
	}
}

func TestFuncResidueFrame(t *testing.T) {
	_, err := New().Generate("a:super(1)&integer")
	if err == nil {
		t.Fatalf("expected error")
	}
	want := "[aontu/mapval_no_gen]: Cannot resolve value at path $.a\n\nThis value was present after unification, and cannot be generated\nbecause it is not a literal value.\n\n Cannot resolve value: integer\n  \u001b[34m--> <no-file>:1:3\n\u001b[34m  1 | \u001b[0ma:super(1)&integer\n        \u001b[34m^ key a value was: integer\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n"
	if got := err.Error(); got != want {
		t.Fatalf("func-residue-frame mismatch\n want: %q\n got:  %q", want, got)
	}
}

// A DYNAMIC CODE HAS NO EXACT ROW in the hint table: `hints` registers
// the prefix, so a finding reporting `func:upper` carries no hint. This
// is the one arm that still answers nothing now that every registered
// code has text, and `explain` differs here: it resolves through the
// prefix and answers with its wording.
func TestHintOfADynamicCodeIsAbsent(t *testing.T) {
	if got := hintOf("func:upper", nil); nil != got {
		t.Errorf("want no hint, got %q", *got)
	}
	if nil == hintOf("constraint", nil) {
		t.Error("want the registry hint for constraint")
	}
}

func TestOperandlessNilFrame(t *testing.T) {
	_, err := New().Generate("a:-0x_1")
	if err == nil {
		t.Fatalf("expected error")
	}
	want := "[aontu/negative]: Cannot resolve value at path $.a\n\nOnly a number can be negated. A `-` in front of a\nnon-numeric value is an error rather than a missing value.\n \nA `-` is a PREFIX here and never an operator between two values,\nso subtraction is sub(a, b).\n \nExamples:\n  a: -1       -> -1     # A number negates;\n  a: -x       -> nil    # ... a bare word does not;\n  a: k-x      -> \"k-x\"  # ... and this is one word, not a minus;\n  a: sub(5,3) -> 2      # Subtraction is a function.\n\n Cannot resolve value: nil\n  \u001b[34m--> <no-file>:1:3\n\u001b[34m  1 | \u001b[0ma:-0x_1\n        \u001b[34m^ value was: nil\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n"
	if got := err.Error(); got != want {
		t.Fatalf("operandless-nil-frame mismatch\n want: %q\n got:  %q", want, got)
	}
}

func TestHintTrailingNewlineFrame(t *testing.T) {
	_, err := New().Generate("a:{b?:$.zz9} c:1")
	if err == nil {
		t.Fatalf("expected error")
	}
	want := "[aontu/no_path]: Cannot resolve value at path $.a.b\n\nThe path reference could not be found.\n \nExamples:\n  a:1 b:$.a  -> a:1,b:1  # $.a is a valid path reference as a is a key of root ($).\n  a:$.b      -> nil      # $.b is not a valid path reference as there is no key b in root ($).\n\n Cannot resolve value: $.zz9\n  \u001b[34m--> <no-file>:1:7\n\u001b[34m  1 | \u001b[0ma:{b?:$.zz9} c:1\n            \u001b[34m^ value was: $.zz9\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n"
	if got := err.Error(); got != want {
		t.Fatalf("hint-trailing-newline-frame mismatch\n want: %q\n got:  %q", want, got)
	}
}

func TestListIndexZeroPath(t *testing.T) {
	_, err := New().Generate("a:[1]&[2]")
	if err == nil {
		t.Fatalf("expected error")
	}
	want := "[aontu/scalar_value]: Cannot unify values at path $.a.0\n\nLiteral scalar values of the same kind can only unify if they are\nexactly equal.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  a & a   -> a    # Does unify (equal Strings);\n  1 & 2   -> nil  # Does not unify (unequal Integers);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).\n\n Cannot unify value: 2 with value: 1\n  \u001b[34m--> <no-file>:1:8\n\u001b[34m  1 | \u001b[0ma:[1]&[2]\n             \u001b[34m^ value was: 2\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n\n Cannot unify value: 1 with value: 2\n  \u001b[34m--> <no-file>:1:4\n\u001b[34m  1 | \u001b[0ma:[1]&[2]\n         \u001b[34m^ value was: 1\u001b[0m\n\u001b[34m  2 | \u001b[0m\n\u001b[34m  3 | \u001b[0m\n"
	if got := err.Error(); got != want {
		t.Fatalf("list-index-zero-path mismatch\n want: %q\n got:  %q", want, got)
	}
}

func TestMergeConflictCRLF(t *testing.T) {
	_, err := New().Generate("<<<<<<< HEAD\r\na:1\r\n=======\r\na:2\r\n>>>>>>> other\r\n")
	if err == nil {
		t.Fatalf("expected error")
	}
	ae, ok := err.(*AontuError)
	if !ok || ae.Code != "merge_conflict" {
		t.Fatalf("crlf marker: %v", err)
	}

	// ... and a bare CRLF line ending is still not a marker line.
	out, err := New().Generate("a:1\r\nb:2\r\n")
	if err != nil {
		t.Fatalf("crlf plain: %v", err)
	}
	m, _ := out.(map[string]any)
	if m == nil || m["a"] == nil || m["b"] == nil {
		t.Fatalf("crlf plain: %v", out)
	}
}

func TestExplainCode(t *testing.T) {
	// A registered code with text.
	class, hint, registered := ExplainCode("no_scalar_unify")
	if !registered || "conflict" != class || "" == hint {
		t.Fatalf("no_scalar_unify: %q %q %v", class, hint, registered)
	}

	// A registered code WITHOUT text. The 27 of these are exactly what
	// the verb exists to make visible; before it, a missing hint could
	// only be met beside the error that raises it.
	class, hint, registered = ExplainCode("deprecated")
	if !registered || "" == class {
		t.Fatalf("deprecated: %q %q %v", class, hint, registered)
	}
	if "" != hint {
		t.Log("deprecated has gained a hint; the table is closing, which" +
			" is the work item G11 phase 3 created")
	}

	// A DYNAMIC CODE is registered through the prefix it extends and
	// carries that prefix's text: the suffix names the operator, the
	// explanation is the prefix's.
	class, hint, registered = ExplainCode("func:upper")
	if !registered || "conflict" != class || hints["func:"] != hint {
		t.Fatalf("func:upper: %q %q %v", class, hint, registered)
	}
	for _, code := range []string{"op:x", "op[+]", "var[x", "ref[y"} {
		if _, _, ok := ExplainCode(code); !ok {
			t.Errorf("%s does not resolve through its prefix", code)
		}
	}

	// An unregistered code is NOT registered, and still classifies --
	// which is what lets a caller be told it is unknown rather than
	// merely unexplained.
	class, hint, registered = ExplainCode("no-such-code")
	if registered || "internal" != class || "" != hint {
		t.Fatalf("no-such-code: %q %q %v", class, hint, registered)
	}

	// The empty code is the why-less nil, which classifies as its
	// eventual gen-time code, nil_gen -- stated as the RULE rather than
	// as nil_gen's current class, so this case pins the delegation and
	// not a constant that belongs to another table.
	if class, _, _ := ExplainCode(""); codeClass("nil_gen") != class {
		t.Fatalf("the empty code classifies as %q, not as nil_gen does", class)
	}
}

func TestCodes(t *testing.T) {
	codes := Codes()
	if len(codeClasses) != len(codes) {
		t.Fatalf("Codes has %d entries, the registry %d",
			len(codes), len(codeClasses))
	}
	for i := 1; i < len(codes); i++ {
		if codes[i-1] >= codes[i] {
			t.Fatalf("Codes is not sorted at %d: %q then %q",
				i, codes[i-1], codes[i])
		}
	}
	for _, code := range codes {
		if _, _, registered := ExplainCode(code); !registered {
			t.Errorf("%s is listed and does not resolve", code)
		}
	}
	if len(hints) >= len(codes) {
		t.Logf("the hint table (%d) has caught up with the registry (%d)",
			len(hints), len(codes))
	}
}

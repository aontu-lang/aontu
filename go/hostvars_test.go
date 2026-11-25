/* Copyright (c) 2026 Richard Rodger, MIT License */

// The engine's host bindings, the CLI's --var and --var-text: an
// evaluation given no vars of its own reads them, each sited at the
// option that bound it.

package aontu

import (
	"encoding/json"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

func TestHostVarsBindAnEvaluationGivenNoVars(t *testing.T) {
	a := New()
	a.HostVars = map[string]HostVar{"n": {Value: "3"}, "s": {Value: "3", Text: true}}
	out, err := a.Generate("a: $n\nb: $s\n")
	if nil != err || !reflect.DeepEqual(map[string]any{"a": int64(3), "b": "3"}, out) &&
		!reflect.DeepEqual(map[string]any{"a": 3, "b": "3"}, out) {
		t.Fatalf("%#v %v", out, err)
	}
	// Vars of its own are kept.
	own, err := a.GenerateVars("a: $n\n", map[string]Val{"n": newString("x")})
	if nil != err || "x" != own.(map[string]any)["a"] {
		t.Fatalf("%#v %v", own, err)
	}
	// A conflict quotes the binding, at its option.
	_, cerr := a.Generate("a: integer & $s\n")
	if nil == cerr || !strings.Contains(cerr.Error(), "--> --var-text s:1:1\n") {
		t.Fatalf("%v", cerr)
	}
}

func TestHostVarsReachVetTrimAndWhy(t *testing.T) {
	host := map[string]HostVar{"n": {Value: "x"}}
	r := Vet("k: integer\n", "k: $n\n", &VetOptions{HostVars: host})
	if VetInvalid != r.Verdict || 1 != len(r.Findings) {
		t.Fatalf("%+v", r)
	}
	found := false
	for _, s := range r.Findings[0].Sites {
		found = found || ("--var n" == s.File && 1 == s.Row)
	}
	if !found {
		t.Fatalf("%+v", r.Findings[0].Sites)
	}
	a := New()
	a.HostVars = map[string]HostVar{"n": {Value: "3"}}
	if tr := a.TrimCheck("k: $n\n"); TrimClean != tr.Verdict {
		t.Fatalf("%+v", tr)
	}
	if w := a.Why("k: $n\n", "$.k"); !w.OK {
		t.Fatalf("%+v", w)
	}
}

func TestHostVarsNamesAndReferences(t *testing.T) {
	v, err := New().Parse("a: $n\nb: [$m, $.a]\nc: f($n)\n")
	if nil != err {
		t.Fatal(err)
	}
	if got := VarNames(v); "m,n" != strings.Join(got, ",") {
		t.Fatalf("%v", got)
	}
	// A value met twice is walked once.
	x, _ := New().Parse("$q")
	if got := VarNames(newConjunct([]Val{x, x})); "q" != strings.Join(got, ",") {
		t.Fatalf("%v", got)
	}
	ref, _ := New().Parse("$.a")
	plain, _ := New().Parse("{a: [1, 2]}")
	if !HoldsReference(ref) || !HoldsReference(x) || HoldsReference(plain) {
		t.Fatal("HoldsReference")
	}
}

func TestHostVarsMemberCanons(t *testing.T) {
	v, _ := New().Unify("b: [1, \"x\"]\na: {c: true}\n")
	keys, canons, ok := MemberCanons(v)
	if !ok || "a,b" != strings.Join(keys, ",") || 2 != len(canons) {
		t.Fatalf("%v %v %v", keys, canons, ok)
	}
	list, _ := New().Unify("[1]")
	if _, _, ok := MemberCanons(list); ok {
		t.Fatal("a list is no map")
	}
	a := New()
	a.HostVars = map[string]HostVar{"n": {Value: "\"x\"", From: "--vars f.aontu"}}
	if _, err := a.Generate("k: integer & $n\n"); nil == err || !strings.Contains(err.Error(), "--> --vars f.aontu n:1:1\n") {
		t.Fatalf("%v", err)
	}
}

// a-binding-reads-no-path-and-is-framed-at-its-option in
// ts/test/hostvars.test.ts holds the same cases to the same answers.
func TestHostVarsReadNoPathAndAreFramedAtTheirOption(t *testing.T) {
	ansi := regexp.MustCompile("\x1b\\[[0-9;]*m")
	answer := func(hv map[string]HostVar, src string) string {
		out, err := (&Aontu{HostVars: hv}).Generate(src)
		if nil == err {
			b, _ := json.Marshal(out)
			return string(b)
		}
		lines := strings.Split(ansi.ReplaceAllString(err.Error(), ""), "\n")
		frame := ""
		for _, l := range lines {
			if strings.HasPrefix(strings.TrimSpace(l), "-->") {
				frame = strings.TrimSpace(l)
				break
			}
		}
		return strings.TrimSpace(lines[0]) + " | " + frame
	}
	doc := "k: 1\nb: { k: 2, a: $n }"
	refused := "[aontu/invalid_var_kind]: Cannot unify values at path $.b.a | --> <no-file>:2:15"
	clash := "[aontu/scalar_kind]: Cannot unify values at path $.a | --> "
	for _, c := range []struct {
		hv        map[string]HostVar
		src, want string
	}{
		{map[string]HostVar{"n": {Value: ".k"}}, doc, refused},
		{map[string]HostVar{"n": {Value: "$.k"}}, doc, refused},
		{map[string]HostVar{"n": {Value: "{x: $.k}"}}, "k: 1\nb: $n",
			"[aontu/no_path]: Cannot resolve value at path $.x | --> --var n:1:5"},
		{map[string]HostVar{"n": {Value: "$m"}, "m": {Value: "1"}}, "b: $n",
			"[aontu/unknown_var]: Cannot unify values at path $ | --> --var n:1:1"},
		{map[string]HostVar{"n": {Value: "{x: 1}"}}, "b: $n", `{"b":{"x":1}}`},
		{map[string]HostVar{"n": {Value: "x", Text: true, From: "--vars f"}}, "a: $n & 1",
			clash + "--vars f n:1:1"},
		{map[string]HostVar{"n": {Value: "x", Text: true}}, "a: $n & 1", clash + "--var-text n:1:1"},
		{map[string]HostVar{"n": {Value: `"x"`, From: "--vars f"}}, "a: $n & 1", clash + "--vars f n:1:1"},
	} {
		if got := answer(c.hv, c.src); c.want != got {
			t.Errorf("%v over %q:\n got  %s\n want %s", c.hv, c.src, got, c.want)
		}
	}
}

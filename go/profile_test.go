/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import "testing"

func TestLoadProfile(t *testing.T) {
	profile, findings := New().LoadProfile(`aontu: Lang: lang: "text"`)
	if nil != findings {
		t.Fatalf("findings on a valid profile: %+v", findings)
	}
	if "text" != profile["lang"] {
		t.Fatalf("lang: %v", profile["lang"])
	}
	indent, _ := profile["indent"].(map[string]any)
	if " " != indent["unit"] || int64(2) != indent["width"] {
		t.Fatalf("defaults not filled: %v", profile["indent"])
	}
	if _, has := profile["template"]; has {
		t.Fatalf("an optional key with no default appeared: %v", profile)
	}

	for _, c := range []struct{ src, code, path string }{
		{"a: ]", "syntax", "$"},
		{"x: 1 & \"a\"", "scalar_kind", "$.x"},
		{"nil", "literal_nil", "$"},
		{`aontu: Lang: lang: 1`, "constraint", "$.aontu.Lang.lang"},
		{"x: 1", "mapval_required", "$.aontu.Lang.lang"},
		{`aontu: Lang: { lang: "go", lowering: "go" }`, "closed", "$.aontu.Lang.lowering"},
	} {
		profile, findings := New().LoadProfile(c.src)
		if nil != profile || 1 > len(findings) {
			t.Fatalf("%q: want a refusal, got %v %+v", c.src, profile, findings)
		}
		if c.code != findings[0].Code || c.path != findings[0].Path {
			t.Fatalf("%q: want %s at %s, got %s at %s", c.src, c.code, c.path,
				findings[0].Code, findings[0].Path)
		}
	}
}

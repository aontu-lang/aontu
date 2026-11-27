/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strings"
	"testing"
)

func TestOperandFormatFollowsTheIncludeTable(t *testing.T) {
	for path, want := range map[string]string{
		"a.yaml": "yaml", "a.YML": "yaml", "a.toml": "toml", "a.ini": "ini",
		"a.jsonc": "jsonc", "a.json5": "json5", "a.jsc": "jsonic",
		"a.json": "", "a.jsonld": "", "a.aontu": "", "a.txt": "", "a.data": "", "": "",
	} {
		if got := operandFormat(path); want != got {
			t.Errorf("%q: %q, want %q", path, got, want)
		}
	}
}

func TestReadByExtensionReadsTheEntryAsData(t *testing.T) {
	a := &Aontu{File: "c.toml", ReadByExtension: true}
	v, err := a.Unify("port = 8080\n")
	if nil != err || `{"port":8080}` != v.Canon() {
		t.Fatalf("%v %v", v, err)
	}
	if _, err = a.Unify("port = [1\n"); nil == err ||
		!strings.Contains(err.Error(), "--> c.toml:2:1") {
		t.Fatalf("%v", err)
	}
	if v, _ = (&Aontu{File: "c.toml"}).Unify("a: 1"); `{"a":1}` != v.Canon() {
		t.Fatalf("%v", v)
	}

	deep := &Aontu{File: "x.yaml", ReadByExtension: true,
		Trust: &TrustOptions{Budget: TrustBudget{Depth: 2}}}
	if _, err = deep.Parse("a:\n b:\n  c:\n   d:\n    e:\n     f:\n      g:\n       h: 1\n"); nil == err ||
		"max_depth" != err.(*AontuError).Code {
		t.Fatalf("%v", err)
	}

	report := Vet("port: integer", "port:\n  - 1\n",
		&VetOptions{DataPath: "d.yaml", ReadByExtension: true})
	if VetInvalid != report.Verdict {
		t.Fatalf("%+v", report)
	}
	sub := Subsume("port: integer", "port = 1\n",
		&SubsumeOptions{SpecificPath: "d.toml", ReadByExtension: true})
	if SubsumeYes != sub.Verdict {
		t.Fatalf("%+v", sub)
	}
}

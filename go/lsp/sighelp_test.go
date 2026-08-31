// Copyright (c) 2021-2026 Richard Rodger, MIT License

package lsp

// signatureHelp serves the declared signature of the enclosing call
// from the registry (docs/design/SIGNATURES.0.md). Mirrors the
// signature-help cases in ts/test/lsp.test.ts.

import (
	"testing"

	aontu "github.com/aontu-lang/aontu/go"
)

func TestCompletionDetailIsTheSignature(t *testing.T) {
	byLabel := map[string]CompletionItem{}
	for _, c := range Completions() {
		byLabel[c.Label] = c
	}
	if got := byLabel["upper"].Detail; "upper(s: string|number) : string" != got {
		t.Fatalf("upper detail: %q", got)
	}
	if got := byLabel["pack"].Detail; "pack(d: map|list, template t: any) : map" != got {
		t.Fatalf("pack detail: %q", got)
	}
	if got := byLabel["path"].Detail; "path(capture p?: path) : path" != got {
		t.Fatalf("path detail: %q", got)
	}
	// The exported accessor answers "" for a non-builtin, which is the
	// no-help signal.
	if "" != aontu.FuncSignature("notafunc") {
		t.Fatal("notafunc has no signature")
	}
	if nil != aontu.FuncSignatureParams("notafunc") {
		t.Fatal("notafunc has no params")
	}
}

func TestSignatureHelp(t *testing.T) {
	// Inside the call: the declared signature, first parameter active.
	r := SignatureHelp("x: pack($.names, {a:1})", 0, 8)
	if nil == r || "pack(d: map|list, template t: any) : map" != r.Signatures[0].Label {
		t.Fatalf("pack help: %+v", r)
	}
	if 2 != len(r.Signatures[0].Parameters) || 0 != r.ActiveParameter {
		t.Fatalf("pack params: %+v", r)
	}

	// After the comma: the second parameter is active.
	r = SignatureHelp("x: pack($.names, {a:1})", 0, 18)
	if nil == r || 1 != r.ActiveParameter {
		t.Fatalf("pack active: %+v", r)
	}

	// A comma or paren inside a string does not miscount.
	r = SignatureHelp(`x: join(["a,b"], ",")`, 0, 20)
	if nil == r || "join(d: map|list, sep?: string) : string" != r.Signatures[0].Label ||
		1 != r.ActiveParameter {
		t.Fatalf("join help: %+v", r)
	}

	// Excess arguments cap at the last slot (a rest tail stays live).
	r = SignatureHelp("y: add(1, 2, 3)", 0, 14)
	if nil == r || 1 != r.ActiveParameter {
		t.Fatalf("add cap: %+v", r)
	}

	// Not a builtin call, or no call at all: no help.
	if nil != SignatureHelp("x: notafunc(1)", 0, 13) {
		t.Fatal("notafunc should have no help")
	}
	if nil != SignatureHelp("x: 1", 0, 4) {
		t.Fatal("no call should have no help")
	}
	// A zero-argument builtin still answers, with no active slot.
	r = SignatureHelp("x: map()", 0, 7)
	if nil == r || 0 != r.ActiveParameter || 0 != len(r.Signatures[0].Parameters) {
		t.Fatalf("map help: %+v", r)
	}
}

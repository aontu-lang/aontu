// Copyright (c) 2021-2026 Richard Rodger, MIT License

package lsp

// signatureHelp serves the declared signature of the enclosing call
// from the registry (docs/design/SIGNATURES.0.md). Mirrors the
// signature-help cases in ts/test/lsp.test.ts.

import (
	"encoding/json"
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

	// Positions clamp: a line beyond the document and a character
	// beyond the line both land at the nearest real place, and a
	// multi-line document counts earlier lines into the offset.
	multi := "a: 1\nb: each($.a,\nc: 2"
	r = SignatureHelp(multi, 1, 99)
	if nil == r || "each(d: map|list, template t?: any) : list" != r.Signatures[0].Label ||
		1 != r.ActiveParameter {
		t.Fatalf("multi-line clamp: %+v", r)
	}
	if nil != SignatureHelp(multi, 99, 0) {
		t.Fatal("line clamp should land on the last line, which has no call")
	}
	if nil != SignatureHelp(multi, -1, -5) {
		t.Fatal("negative clamps land at the document start")
	}

	// Nested calls close over: the ')' of an inner call is depth, not
	// the enclosing open.
	r = SignatureHelp("y: add(lower(2), 3)", 0, 18)
	if nil == r || "add(a: number, b: number) : number" != r.Signatures[0].Label ||
		1 != r.ActiveParameter {
		t.Fatalf("nested: %+v", r)
	}

	// The scan stops at the line start: a paren on an earlier line is
	// not this line's enclosing call.
	if nil != SignatureHelp("a: add(1, 2)\nb: 3", 1, 4) {
		t.Fatal("earlier line's paren should not enclose")
	}
}

func TestSignatureHelpDispatch(t *testing.T) {
	// The handler route: capability-served requests through Handle,
	// with the no-document, no-help and malformed-params answers all
	// null rather than errors.
	h := NewHandler()
	mustJSON := func(v any) []byte {
		b, err := json.Marshal(v)
		if nil != err {
			t.Fatal(err)
		}
		return b
	}
	openParams := mustJSON(map[string]any{
		"textDocument": map[string]any{
			"uri": "file:///s.aontu", "text": "x: pack($.names, {a:1})",
		},
	})
	h.Handle(Message{Method: "textDocument/didOpen", Params: openParams})

	help := func(params []byte) json.RawMessage {
		outs := h.Handle(Message{
			ID: json.RawMessage("9"), Method: "textDocument/signatureHelp",
			Params: params,
		})
		if 1 != len(outs) {
			t.Fatalf("expected 1 response, got %d", len(outs))
		}
		return outs[0].Result
	}
	pos := func(uri string, line, char int) []byte {
		return mustJSON(map[string]any{
			"textDocument": map[string]any{"uri": uri},
			"position":     map[string]any{"line": line, "character": char},
		})
	}

	var sh SignatureHelpResult
	if err := json.Unmarshal(help(pos("file:///s.aontu", 0, 8)), &sh); nil != err {
		t.Fatal(err)
	}
	if "pack(d: map|list, template t: any) : map" != sh.Signatures[0].Label {
		t.Fatalf("dispatch result: %+v", sh)
	}

	isNull := func(r json.RawMessage) bool {
		return nil == r || "null" == string(r)
	}
	// No help at the position, an unknown document, and malformed
	// params: all null.
	if !isNull(help(pos("file:///s.aontu", 0, 1))) {
		t.Fatal("no-help should be null")
	}
	if !isNull(help(pos("file:///nope.aontu", 0, 0))) {
		t.Fatal("unknown doc should be null")
	}
	if !isNull(help([]byte("[1]"))) {
		t.Fatal("malformed params should be null")
	}
}

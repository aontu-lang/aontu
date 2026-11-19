/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strings"
	"testing"
)

func TestColorGate(t *testing.T) {
	frame := func() string {
		_, err := New().Generate("a:1\na:2\n")
		if nil == err {
			t.Fatal("expected a conflict")
		}
		return err.Error()
	}
	esc := func(s string) bool { return strings.Contains(s, "\x1b[") }

	t.Setenv("NO_COLOR", "")
	defer SetColor(nil)

	// The default is colour: an interactive session is still the common
	// case, and nothing about the library knows better.
	SetColor(nil)
	if !colorActive() || !esc(frame()) {
		t.Fatal("default is not coloured")
	}

	// NO_COLOR, per no-color.org: SET, to anything, means no colour.
	t.Setenv("NO_COLOR", "1")
	if colorActive() || esc(frame()) {
		t.Fatal("NO_COLOR did not disable colour")
	}

	on := true
	SetColor(&on)
	if !colorActive() || !esc(frame()) {
		t.Fatal("SetColor(true) did not override NO_COLOR")
	}

	t.Setenv("NO_COLOR", "")
	off := false
	SetColor(&off)
	if colorActive() || esc(frame()) {
		t.Fatal("SetColor(false) did not disable colour")
	}

	// THE POINT OF THE WHOLE GATE: with colour off the message is
	// exactly the text, so a reader can match on it.
	if !strings.HasPrefix(frame(), "[aontu/scalar_value]") {
		t.Fatalf("uncoloured frame is not plain text: %q", frame())
	}

	// ansi() is the single place the decision is applied, so it answers
	// for every escape in the frame at once.
	if "" != ansi("\x1b[34m") {
		t.Fatal("ansi emitted an escape with colour off")
	}
	SetColor(&on)
	if "\x1b[34m" != ansi("\x1b[34m") {
		t.Fatal("ansi swallowed an escape with colour on")
	}
}

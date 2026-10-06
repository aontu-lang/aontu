/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import "testing"

// Bytes that are not UTF-8 reach no shared row, since a row is text.
func TestImportRefusesTextThatIsNotUTF8(t *testing.T) {
	r := New().ImportJSONSchema("\"\xff\"")
	if "error" != r.Verdict || 1 != len(r.Errors) ||
		"jsonschema_schema" != r.Errors[0].Code || "#" != r.Errors[0].Path ||
		"the schema is not JSON: the text is not well-formed Unicode" != r.Errors[0].Message {
		t.Fatalf("%+v", r)
	}
}

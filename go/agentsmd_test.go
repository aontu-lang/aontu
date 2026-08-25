/* Copyright (c) 2025 Richard Rodger, MIT License */

// The splice around the shared rows (G7 phase 6). The stanza itself is
// pinned byte for byte by test/spec/agentsmd.tsv in both ports; the
// splice is what each port's CLI calls, and cross-package runs do not
// count toward this package's coverage.

package aontu

import (
	"strings"
	"testing"
)

func TestAgentsMdSplice(t *testing.T) {
	stanza := AgentsMdBegin + "\nBODY\n" + AgentsMdEnd + "\n"

	// An EMPTY document is the stanza and nothing else.
	if got := AgentsMdSplice("", stanza); stanza != got {
		t.Fatalf("empty: %q", got)
	}

	// Prose WITHOUT a trailing newline gets one, so appending never
	// joins the stanza onto someone's last line.
	if got := AgentsMdSplice("prose", stanza); "prose\n\n"+stanza != got {
		t.Fatalf("no newline: %q", got)
	}

	// Prose WITH one is left exactly as it is.
	if got := AgentsMdSplice("prose\n", stanza); "prose\n\n"+stanza != got {
		t.Fatalf("newline: %q", got)
	}

	// Markers present: what is BETWEEN them is replaced, and what is
	// outside them is not.
	existing := "head\n\n" + AgentsMdBegin + "\nOLD\n" + AgentsMdEnd + "\ntail\n"
	got := AgentsMdSplice(existing, stanza)
	if !strings.HasPrefix(got, "head\n\n") || !strings.HasSuffix(got, "tail\n") ||
		strings.Contains(got, "OLD") || !strings.Contains(got, "BODY") {
		t.Fatalf("splice: %q", got)
	}
	// And splicing twice is splicing once.
	if again := AgentsMdSplice(got, stanza); again != got {
		t.Fatalf("not idempotent:\n%q\n%q", got, again)
	}

	// A CRLF DOCUMENT keeps its own endings outside the markers, and
	// gains NOTHING between the end marker and the text after it. The
	// old `+1` skipped the CR and left the LF, so every regeneration
	// added a blank line.
	crlf := "head\r\n\r\n" + AgentsMdBegin + "\r\nOLD\r\n" + AgentsMdEnd + "\r\ntail\r\n"
	got = AgentsMdSplice(crlf, stanza)
	if !strings.HasSuffix(got, AgentsMdEnd+"\ntail\r\n") {
		t.Fatalf("crlf: %q", got)
	}
	if again := AgentsMdSplice(got, stanza); again != got {
		t.Fatalf("crlf not idempotent:\n%q\n%q", got, again)
	}

	// The end marker as the LAST content, under every terminator and
	// none. `+1` indexed PAST THE END here and panicked, while the
	// canonical port's slice() clamped and returned -- a crash on one
	// port and a result on the other (ADR-001).
	for _, term := range []string{"", "\n", "\r\n"} {
		doc := "head\n\n" + AgentsMdBegin + "\nOLD\n" + AgentsMdEnd + term
		if got := AgentsMdSplice(doc, stanza); "head\n\n"+stanza != got {
			t.Fatalf("marker at eof %q: %q", term, got)
		}
	}

	// A closing marker BEFORE the opening one is not a region: the
	// stanza is appended rather than swallowing the text between them.
	odd := AgentsMdEnd + "\nx\n" + AgentsMdBegin + "\n"
	if got := AgentsMdSplice(odd, stanza); !strings.HasPrefix(got, odd) {
		t.Fatalf("reversed markers: %q", got)
	}
}

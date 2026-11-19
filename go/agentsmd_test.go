/* Copyright (c) 2025 Richard Rodger, MIT License */

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

	if got := AgentsMdSplice("prose", stanza); "prose\n\n"+stanza != got {
		t.Fatalf("no newline: %q", got)
	}

	// Prose WITH one is left exactly as it is.
	if got := AgentsMdSplice("prose\n", stanza); "prose\n\n"+stanza != got {
		t.Fatalf("newline: %q", got)
	}

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

	crlf := "head\r\n\r\n" + AgentsMdBegin + "\r\nOLD\r\n" + AgentsMdEnd + "\r\ntail\r\n"
	got = AgentsMdSplice(crlf, stanza)
	if !strings.HasSuffix(got, AgentsMdEnd+"\ntail\r\n") {
		t.Fatalf("crlf: %q", got)
	}
	if again := AgentsMdSplice(got, stanza); again != got {
		t.Fatalf("crlf not idempotent:\n%q\n%q", got, again)
	}

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

func TestAgentsMdDepthOption(t *testing.T) {
	src := "entity: { &: { table: string, fields: { &: { type: string } } } }\n"

	shape := func(opts *AgentsMdOptions) string {
		t.Helper()
		r := New().AgentsMd(src, opts)
		if !r.OK {
			t.Fatalf("agentsmd: %+v", r.Findings)
		}
		for _, line := range strings.Split(r.Stanza, "\n") {
			if strings.HasPrefix(line, "- Shape: ") {
				return line
			}
		}
		t.Fatalf("no shape line: %q", r.Stanza)
		return ""
	}

	deep := shape(&AgentsMdOptions{Depth: 4})
	if !strings.Contains(deep, "table") {
		t.Errorf("Depth 4 shows no field: %s", deep)
	}
	// The DEFAULT is unchanged, however it is spelled: no options at
	// all, options with no depth, and the depth it already used.
	base := shape(nil)
	if base == deep {
		t.Error("Depth changed nothing")
	}
	if base != shape(&AgentsMdOptions{}) ||
		base != shape(&AgentsMdOptions{Depth: 2}) {
		t.Error("the default depth is not 2")
	}

	// THE LANGUAGE DOOR: a stanza says where to learn the language the
	// document is written in, offline, from the binary in hand.
	if !strings.Contains(New().AgentsMd(src, nil).Stanza,
		"aontu help language") {
		t.Error("the stanza does not point at the language")
	}
}

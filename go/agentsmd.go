/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE AGENTS.md STANZA (G7 phase 6, the Go side of ts/src/agentsmd.ts):
// generated FROM the definition, so the prose entrypoint cannot drift
// from the formal source it points at.
//
// A hand-written "here is where the config lives" paragraph is stale
// the first time a key is renamed. This one is derived: the root keys
// come from the document, the pin from G6's canon-hash, and the
// commands are spelled with paths that exist.

package aontu

import (
	"sort"
	"strings"
)

// The markers an update rewrites between. A stanza outside them is
// prose someone wrote, and is left alone.
const (
	AgentsMdBegin = "<!-- aontu:begin -->"
	AgentsMdEnd   = "<!-- aontu:end -->"
)

type AgentsMdReport struct {
	Findings []VetFinding `json:"findings"`
	OK       bool         `json:"ok"`
	Stanza   string       `json:"stanza"`
}

type AgentsMdOptions struct {
	// Name is what the stanza should call the document. The engine
	// never reads a file; the CLI passes what the author typed.
	Name string
}

// AgentsMd is the stanza for one document. Mirrors agentsMd in
// ts/src/agentsmd.ts, byte for byte.
func (a *Aontu) AgentsMd(src string, opts *AgentsMdOptions) AgentsMdReport {
	name := "the definition"
	if nil != opts && "" != opts.Name {
		name = opts.Name
	}

	v, uerr := a.Unify(src)
	if nil != uerr || nil == v || v.Nil() {
		r := queryFailed(uerr, "$")
		return AgentsMdReport{Findings: r.Findings, OK: false, Stanza: ""}
	}

	keys := []string{}
	if m, ok := v.(*MapVal); ok {
		keys = append(keys, m.keys...)
		sort.Strings(keys)
	}
	shape := a.Get(src, "$", &QueryOptions{View: QueryTypes, Depth: 2})

	// A REAL path, so the example command works as written.
	example := "$"
	if 0 < len(keys) {
		example = "$." + keys[0]
	}

	keyList := "_none_"
	if 0 < len(keys) {
		quoted := make([]string, len(keys))
		for i, k := range keys {
			quoted[i] = "`" + k + "`"
		}
		keyList = strings.Join(quoted, ", ")
	}

	lines := []string{
		AgentsMdBegin,
		"## Ground truth: `" + name + "`",
		"",
		"The values below are DERIVED from `" + name + "`, an aontu",
		"definition. Do not restate them here — read them from the source,",
		"which is the only copy that cannot go stale.",
		"",
		"- Pin: `" + CanonHash(v) + "`",
		"  (the canon-hash: it survives reformatting and moves on any",
		"  change of meaning — `aontu hash " + name + "` re-derives it)",
		"- Top-level keys: " + keyList,
		"- Shape: `" + shape.Out + "`",
		"",
		"How to work with it:",
		"",
		"```",
		"# what does it say at a path?",
		"aontu get " + example + " " + name,
		"",
		"# why does that value hold?",
		"aontu why " + example + " " + name,
		"",
		"# does my document satisfy it?",
		"aontu vet " + name + " mine.aon",
		"",
		"# change it without editing it",
		"aontu set " + example + "=<value> --entry " + name +
			" --overlay overlay.aon",
		"```",
		"",
		"Regenerate this section with `aontu agentsmd " + name + "`.",
		AgentsMdEnd,
	}

	return AgentsMdReport{
		Findings: []VetFinding{},
		OK:       true,
		Stanza:   strings.Join(lines, "\n") + "\n",
	}
}

// AgentsMdSplice puts the stanza into an existing document: replace
// what stands between the markers, or append when there is nothing to
// replace. The rest of the document is LEFT ALONE — it is someone's
// prose, and a generator that rewrote it would be one nobody dared run
// twice.
func AgentsMdSplice(existing, stanza string) string {
	from := strings.Index(existing, AgentsMdBegin)
	to := strings.Index(existing, AgentsMdEnd)
	if from < 0 || to < from {
		head := existing
		if "" != existing && !strings.HasSuffix(existing, "\n") {
			head = existing + "\n"
		}
		if "" != existing {
			head += "\n"
		}
		return head + stanza
	}
	// SKIP THE END MARKER'S LINE TERMINATOR, whatever it is, and only
	// if it is there. This was `+1` -- one byte, assumed to be the LF
	// of the marker's own line -- and that assumption is wrong twice.
	//
	// On a CRLF document the byte after the marker is the CR, so the
	// retained tail began with the LF the stanza had already supplied
	// and every regeneration gained a blank line. Worse, a document
	// whose end marker is the LAST thing in it, with no trailing
	// newline, made `+1` index PAST THE END: Go panics on the slice,
	// while the canonical port's slice() clamps and returns cleanly
	// (ts/src/agentsmd.ts). A crash on one port and a result on the
	// other is exactly what ADR-001 forbids, so both now skip an
	// optional CR then an optional LF, bounded by the length.
	end := to + len(AgentsMdEnd)
	if end < len(existing) && '\r' == existing[end] {
		end++
	}
	if end < len(existing) && '\n' == existing[end] {
		end++
	}
	return existing[:from] + stanza + existing[end:]
}
